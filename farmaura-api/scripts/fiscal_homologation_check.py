"""
farmaura-api/scripts/fiscal_homologation_check.py

Step-by-step homologation check for the NFC-e module (SVRS / Distrito Federal).

Responsibilities:
- report the fiscal configuration and exactly which environment variables are still missing;
- validate the A1 certificate (password, expiry, CNPJ) without printing any secret;
- ask SEFAZ for its service status (`NFeStatusServico4`);
- with `--send`, build, validate, sign and transmit ONE test NFC-e and print SEFAZ's answer;

Observations:
- it refuses to run unless FISCAL_ENV=homologacao: this script can never touch production;
- it does not use the database: the test note uses a high `--number` (default 999001) so it cannot collide with
  numbers the application allocates, and the tax data comes from a JSON profile the accountant provided;
- nothing is invented: if the emitter config or the tax profile is incomplete the script stops and lists it;

Usage (inside the API container or with the same environment variables):
    python scripts/fiscal_homologation_check.py                      # steps 1-3, no note is sent
    python scripts/fiscal_homologation_check.py --send --profile profile.json --out ./homolog-out

`profile.json` fields (all provided by the accountant), e.g. for Simples Nacional:
    {"ncm": "...", "cfop": "5102", "origin": "0", "unit": "UN", "icms_csosn": "102",
     "pis_cst": "49", "cofins_cst": "49"}
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from app.core.fiscal_config import DF_UF_CODE, FiscalSettings
from app.domain.fiscal import FiscalError
from app.fiscal import sefaz_messages as messages
from app.fiscal.access_key import generate_numeric_code
from app.fiscal.certificate import build_tls_client_context, load_pkcs12_certificate
from app.fiscal.inputs import EmitterData, ItemData, NfceInput, PaymentData, TaxProfile
from app.fiscal.schema_validator import assert_valid_xml
from app.fiscal.sefaz_client import SefazClient
from app.fiscal.xml_builder import build_nfce, missing_tax_fields
from app.fiscal.xml_signer import sign_xml

OK, FAIL = "[ OK ]", "[FALHA]"


def step(title: str) -> None:
    print(f"\n== {title}")


async def main() -> int:
    parser = argparse.ArgumentParser(description="NFC-e homologation check (never production).")
    parser.add_argument("--send", action="store_true", help="also transmit one test NFC-e")
    parser.add_argument("--profile", type=Path, help="JSON tax profile provided by the accountant")
    parser.add_argument("--number", type=int, default=999001, help="test note number (default 999001)")
    parser.add_argument("--out", type=Path, default=Path("homolog-out"), help="where to save XML files")
    args = parser.parse_args()

    settings = FiscalSettings()
    step("1. Configuração")
    if settings.is_production:
        print(f"{FAIL} FISCAL_ENV=producao. Este script só roda em homologação. Nada foi feito.")
        return 2
    print(f"{OK} ambiente: {settings.fiscal_env} (tpAmb={settings.tp_amb})")
    missing = settings.missing_emitter_fields()
    invalid = settings.invalid_emitter_fields()
    if missing or invalid:
        for name in missing:
            print(f"{FAIL} falta preencher {name}")
        for problem in invalid:
            print(f"{FAIL} {problem}")
        print("\nPare aqui e forneça os dados acima. Nada foi inventado nem enviado.")
        return 1
    print(f"{OK} emitente completo (CNPJ {settings.emitter_cnpj_digits[:2]}.***, CRT {settings.nfce_crt}, série {settings.nfce_serie})")

    step("2. Certificado A1")
    try:
        certificate = load_pkcs12_certificate(settings.certificate_file, settings.nfce_certificate_password.get_secret_value())
    except FiscalError as exc:
        print(f"{FAIL} {exc.message}")
        return 1
    days = certificate.days_until_expiry()
    owner = certificate.icp_brasil_cnpj()
    print(f"{OK if not certificate.is_expired() else FAIL} validade: {certificate.not_after:%d/%m/%Y} ({days} dias)")
    if owner is None:
        print("[ AVISO ] o certificado não traz CNPJ ICP-Brasil legível; não foi possível conferir o titular.")
    elif owner != settings.emitter_cnpj_digits:
        print(f"{FAIL} o certificado pertence a outro CNPJ ({owner[:2]}.***) diferente de NFCE_CNPJ.")
        return 1
    else:
        print(f"{OK} o CNPJ do certificado confere com NFCE_CNPJ")
    if certificate.is_expired():
        return 1

    step("3. Status do serviço SEFAZ (NFeStatusServico4)")
    ca_bundle = Path(settings.nfce_ca_bundle_path) if settings.nfce_ca_bundle_path else None
    client = SefazClient(
        environment=settings.fiscal_env, tls_context=build_tls_client_context(certificate, ca_bundle=ca_bundle),
        uf_code=DF_UF_CODE, timeout_seconds=settings.nfce_http_timeout_seconds,
    )
    try:
        status = await client.service_status()
    except FiscalError as exc:
        print(f"{FAIL} {exc.message}")
        return 1
    print(f"{OK if status.cstat == 107 else FAIL} cStat {status.cstat}: {status.reason}")
    if not args.send:
        print("\nPassos 1-3 concluídos. Use --send --profile profile.json para transmitir uma NFC-e de teste.")
        return 0 if status.cstat == 107 else 1

    step("4-6. NFC-e de teste: montar, validar (XSD), assinar")
    if args.profile is None:
        print(f"{FAIL} informe --profile com os dados fiscais fornecidos pelo contador.")
        return 1
    tax = TaxProfile(**{**json.loads(args.profile.read_text(encoding="utf-8")), "cest": "", "ibscbs_has_tax_group": True})
    problems = missing_tax_fields(tax, crt=settings.nfce_crt)
    if problems:
        print(f"{FAIL} perfil fiscal incompleto: " + ", ".join(problems))
        return 1
    now = datetime.now(UTC).astimezone(ZoneInfo("America/Sao_Paulo"))
    item = ItemData(
        code="TESTE-HML", ean="", description="ITEM DE TESTE", quantity=Decimal("1"), unit_price=Decimal("1.00"),
        discount=Decimal("0.00"), tax=tax,
    )
    emitter = EmitterData(
        cnpj=settings.emitter_cnpj_digits, state_registration=settings.nfce_ie, legal_name=settings.nfce_razao_social,
        trade_name=settings.nfce_nome_fantasia, crt=settings.nfce_crt, street=settings.nfce_logradouro,
        number=settings.nfce_numero, complement=settings.nfce_complemento, district=settings.nfce_bairro,
        city_code=settings.nfce_codigo_ibge_municipio, city_name=settings.nfce_municipio, zip_code=settings.nfce_cep,
        phone=settings.nfce_telefone,
    )
    built = build_nfce(
        NfceInput(
            emitter=emitter, tp_amb=settings.tp_amb, serie=int(settings.nfce_serie), number=args.number,
            numeric_code=generate_numeric_code(args.number), issued_at=now, items=[item],
            payments=[PaymentData(tpag="01", amount=Decimal("1.00"))], qrcode_base_url=settings.nfce_qrcode_url,
            consultation_url=settings.nfce_consultation_url, additional_info="Teste de homologacao Farmaura",
            process_version="farmaura-api/hml-check", uf_code=DF_UF_CODE,
        )
    )
    signed = sign_xml(built.xml, "infNFe", certificate)
    assert_valid_xml("nfe", signed)
    print(f"{OK} XML válido no XSD oficial e assinado. Chave: {built.access_key}")
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / f"{built.access_key}-signed.xml").write_text(signed, encoding="utf-8")

    step("7-10. Transmitir e ler a resposta")
    try:
        result = await client.authorize(batch_id="1", signed_nfe_xml=signed)
    except FiscalError as exc:
        print(f"{FAIL} {exc.message}")
        print("Resposta não obtida. NÃO reenvie às cegas: consulte a chave antes (o app faz isso sozinho).")
        return 1
    protocol = result.protocol
    cstat = protocol.cstat if protocol else result.cstat
    reason = protocol.reason if protocol else result.reason
    print(f"{OK if cstat in (100, 150) else FAIL} cStat {cstat}: {reason}")
    if protocol and cstat in (100, 150):
        proc = messages.build_authorized_document(signed_nfe_xml=signed, protocol_xml=protocol.raw_xml)
        (args.out / f"{built.access_key}-authorized.xml").write_text(proc, encoding="utf-8")
        print(f"{OK} protocolo {protocol.number}; XML autorizado salvo em {args.out}/")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
