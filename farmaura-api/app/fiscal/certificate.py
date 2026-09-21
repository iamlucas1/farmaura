"""
farmaura-api/app/fiscal/certificate.py

A1 digital certificate handling for NFC-e.

Responsibilities:
- load a PKCS#12 (`.pfx` / `.p12`) certificate with its password from configuration;
- expose validity information (expiry, days left, subject) for alerts and status checks;
- build the TLS client context used to authenticate against the SEFAZ web services;

Observations:
- the password and the private key are never logged or included in exception messages;
- `ssl` can only load a client certificate from a file, so the key is written to a private temporary
  file encrypted with a throwaway password and deleted immediately after the context is built;
- the ICP-Brasil CNPJ (OID 2.16.76.1.3.3) is read from the certificate so a certificate that belongs
  to another company can be refused before anything is sent;
"""

from __future__ import annotations

import os
import secrets
import ssl
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import ObjectIdentifier

from app.domain.fiscal import FiscalSignatureError

# ICP-Brasil: pessoa jurídica responsável / CNPJ inside the subjectAltName otherName.
_ICP_BRASIL_CNPJ_OID = ObjectIdentifier("2.16.76.1.3.3")


# ============================================================================
# LOADED CERTIFICATE
# ============================================================================


@dataclass(frozen=True)
class LoadedCertificate:
    """A parsed A1 certificate ready for signing and TLS."""

    private_key: rsa.RSAPrivateKey
    certificate: x509.Certificate
    chain: tuple[x509.Certificate, ...]

    @property
    def not_after(self) -> datetime:
        """Return the certificate expiry in UTC."""

        return self.certificate.not_valid_after_utc

    @property
    def not_before(self) -> datetime:
        """Return the certificate start of validity in UTC."""

        return self.certificate.not_valid_before_utc

    def days_until_expiry(self, now: datetime | None = None) -> int:
        """Return whole days until expiry (negative once expired)."""

        reference = now or datetime.now(UTC)
        return (self.not_after - reference).days

    def is_expired(self, now: datetime | None = None) -> bool:
        """Return whether the certificate is outside its validity window."""

        reference = now or datetime.now(UTC)
        return reference >= self.not_after or reference < self.not_before

    @property
    def subject_common_name(self) -> str:
        """Return the subject CN, used only for operator-facing status."""

        attributes = self.certificate.subject.get_attributes_for_oid(x509.NameOID.COMMON_NAME)
        return str(attributes[0].value) if attributes else ""

    def certificate_der_base64(self) -> str:
        """Return the DER certificate as base64 without PEM armor, for `X509Certificate`."""

        import base64

        return base64.b64encode(self.certificate.public_bytes(serialization.Encoding.DER)).decode("ascii")

    def icp_brasil_cnpj(self) -> str | None:
        """Return the CNPJ embedded in the ICP-Brasil SAN otherName, when present."""

        try:
            san = self.certificate.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        except x509.ExtensionNotFound:
            return None
        for other in san.get_values_for_type(x509.OtherName):
            if other.type_id != _ICP_BRASIL_CNPJ_OID:
                continue
            raw = bytes(other.value)
            # DER string: tag, length, content. ICP-Brasil values are short strings (< 128 bytes).
            if len(raw) >= 2 and raw[1] == len(raw) - 2:
                raw = raw[2:]
            text = raw.decode("ascii", errors="ignore")
            digits = "".join(ch for ch in text if ch.isdigit())
            if len(digits) == 14:
                return digits
        return None


# ============================================================================
# LOADING
# ============================================================================


def load_pkcs12_certificate(path: Path, password: str) -> LoadedCertificate:
    """Load an A1 certificate from disk, raising `FiscalSignatureError` without leaking secrets."""

    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise FiscalSignatureError("Certificado digital A1 não encontrado no caminho configurado.") from exc
    return load_pkcs12_bytes(raw, password)


def load_pkcs12_bytes(raw: bytes, password: str) -> LoadedCertificate:
    """Parse PKCS#12 bytes into a `LoadedCertificate`."""

    try:
        key, certificate, additional = pkcs12.load_key_and_certificates(raw, password.encode("utf-8"))
    except ValueError as exc:
        # The library message can hint at the password; keep it generic.
        raise FiscalSignatureError("Não foi possível abrir o certificado A1 (arquivo inválido ou senha incorreta).") from exc
    if key is None or certificate is None:
        raise FiscalSignatureError("O arquivo PKCS#12 não contém chave privada e certificado.")
    if not isinstance(key, rsa.RSAPrivateKey):
        raise FiscalSignatureError("O certificado A1 precisa usar chave RSA para assinar NF-e.")
    return LoadedCertificate(private_key=key, certificate=certificate, chain=tuple(additional or ()))


# ============================================================================
# TLS CLIENT CONTEXT
# ============================================================================


def build_tls_client_context(loaded: LoadedCertificate, *, ca_bundle: Path | None = None) -> ssl.SSLContext:
    """Build a TLS context that presents the A1 certificate to SEFAZ (mutual TLS)."""

    context = ssl.create_default_context(cafile=str(ca_bundle) if ca_bundle else None)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    transient_password = secrets.token_urlsafe(24)
    pem_chain = loaded.certificate.public_bytes(serialization.Encoding.PEM)
    for extra in loaded.chain:
        pem_chain += extra.public_bytes(serialization.Encoding.PEM)
    pem_key = loaded.private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.BestAvailableEncryption(transient_password.encode("ascii")),
    )
    fd, temp_name = tempfile.mkstemp(prefix="farmaura-tls-", suffix=".pem")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(pem_chain)
            handle.write(pem_key)
        context.load_cert_chain(certfile=temp_name, password=transient_password)
    finally:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
    return context
