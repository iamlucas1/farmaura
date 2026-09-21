---
cssclasses: ia-nota
---

# SEFAZ / SVRS — NFC-e modelo 65 (Distrito Federal)

## Propósito

Autorização, consulta, eventos e inutilização de NFC-e do Farmaura. O DF autoriza NFC-e pela **SVRS** (confirmado na página da Receita-DF). Código: `farmaura-api/app/fiscal/sefaz_client.py` (única fonte das URLs). Decisão: [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR]].

## Serviços (versão 4.00 / evento 1.00, SOAP 1.2, mTLS)

| Serviço | Operação SOAP | Homologação | Produção |
|---|---|---|---|
| NFeAutorizacao4 | `nfeAutorizacaoLote` | `nfce-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx` | `nfce.svrs.rs.gov.br/ws/...` (mesmo caminho) |
| NFeRetAutorizacao4 | `nfeRetAutorizacaoLote` | `.../NfeRetAutorizacao/NFeRetAutorizacao4.asmx` | idem (não usado: resposta síncrona `indSinc=1`) |
| NFeConsultaProtocolo4 | `nfeConsultaNF` | `.../NfeConsulta/NfeConsulta4.asmx` | idem |
| NFeStatusServico4 | `nfeStatusServicoNF` | `.../NfeStatusServico/NfeStatusServico4.asmx` | idem |
| NFeRecepcaoEvento4 | `nfeRecepcaoEvento` | `.../recepcaoevento/recepcaoevento4.asmx` | idem |
| NFeInutilizacao4 | `nfeInutilizacaoNF` | `.../nfeinutilizacao/nfeinutilizacao4.asmx` | idem |

Namespace `http://www.portalfiscal.inf.br/nfe/wsdl/<Operação>`, `SOAPAction = "<namespace>/<método>"`, corpo `nfeDadosMsg`. URLs conferidas na página de serviços da SVRS e num registro aberto independente (sped-nfe). A SVRS responde **403 a quem não apresenta certificado de cliente** (até para o WSDL): o A1 é obrigatório em toda chamada.

## Fontes primárias usadas (2026-09-20)

- MOC 7.00 Anexo I (leiaute e regras), Anexo IV (contingência offline NFC-e).
- NT 2025.001 v1.03 (QR Code v3), NT 2025.002-RTC v1.51 (IBS/CBS, cronograma), NT 2026.006 v1.00 (vinculação de pagamento), NT 2026.004 (CNPJ alfanumérico).
- Schemas: `PL_010b_NT2025_002_v1.30` + pacotes de serviço e eventos — ver `farmaura-api/app/fiscal/schemas/README.md`.
- Download: o portal **SVRS** (`dfe-portal.svrs.rs.gov.br/<Nfe|Nfce>/DownloadArquivoEstatico/?sistema=&tipoArquivo=&nomeArquivo=`) permite; o portal nacional `nfe.fazenda.gov.br` bloqueia script (loop de redirect).

## Contratos e dados

- Consulta pública do DF (QR/chave): `http://www.fazenda.df.gov.br/nfce/qrcode` e `/nfce/consulta` (Receita-DF); confirmar os de homologação na primeira resposta.
- Armazenamento: `storage/private/fiscal/<ambiente>/<tenant>/<AAAA>/<MM>/nfce/<chave>/`.
- Variáveis: ver `farmaura-api/.env.example` (seção Fiscal) e `farmaura-api/docs/fiscal/NFCE.md`. **Nunca** valores reais aqui.

## Atualizações

- 2026-09-20: nota criada com a implementação do módulo NFC-e. Ainda **sem chamada real** à SEFAZ (faltam certificado/CNPJ) — ver [[../06_Pendencias/nfce-homologacao-real-pendente-credenciais|pendência]].
