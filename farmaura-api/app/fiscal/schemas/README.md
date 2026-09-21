# Schemas XSD oficiais da NF-e/NFC-e (versionados)

Estes arquivos são os schemas **oficiais** publicados pelo Portal da NF-e / SVRS. Não são editados à mão:
o validador (`app/fiscal/schema_validator.py`) os lê daqui e nada é baixado em tempo de execução.

## Procedência

Baixados em 2026-09-20 do portal DF-e da SVRS (`https://dfe-portal.svrs.rs.gov.br/Nfe/Documentos` e `/Nfce/Documentos`),
seção "Esquemas XML", e montados em uma pasta só porque os pacotes da SVRS são incrementais:

| Conteúdo | Pacote de origem |
|---|---|
| Leiaute NF-e/NFC-e 4.00 com IBS/CBS (`leiauteNFe_v4.00.xsd`, `tiposBasico_v4.00.xsd`, `DFeTiposBasicos_v1.00.xsd`, `nfe_v4.00.xsd`, `xmldsig-core-schema_v1.01.xsd`) | `PL_010b_NT2025_002_v1.30.zip` (NT 2025.002 v1.30 – RTC) |
| Schemas de serviço (`enviNFe`, `retEnviNFe`, `consSitNFe`, `retConsSitNFe`, `consStatServ`, `retConsStatServ`, `inutNFe`, `retInutNFe`, `procNFe`, ...) | `PL_009n_NT2023_004_v101_e_NT2019_001_v162.zip` (o `leiauteNFe`/`tiposBasico` dele são substituídos pelos do PL_010b) |
| Evento de cancelamento (`e110111`, `envEventoCancNFe`, `eventoCancNFe`, `tiposBasico_v1.03`, ...) | `Evento_Canc_PL_v1.01_NT_2018_004.zip` |
| Evento genérico (`envEvento`, `leiauteEvento`, `procEventoNFe`, ...) | `Evento_Generico_PL_v1.01.zip` |

`SHA256SUMS` guarda o hash de cada arquivo. Ao atualizar o pacote, regenere-o (`sha256sum *.xsd > SHA256SUMS`) e rode
`pytest app/tests/unit/test_fiscal_engine.py app/tests/unit/test_fiscal_sefaz.py`.

## ⚠ Atenção: pacote mais novo existe

A SVRS já lista a **NT 2025.002 v1.51 (01/08/2026)** e a **NT 2026.006 (vinculação de pagamento, homologação desde
03/08/2026)**, e a imprensa técnica cita o pacote **PL_010f (NT 2025.002 v1.50 + NT 2026.007)**. O pacote publicado
na SVRS que foi possível baixar é o **PL_010b v1.30**. Diferenças conhecidas (campos novos, todos opcionais no leiaute):
`cIndOp`, `ISUFemit`, `gALCZFMCBS`, `refDFeAnt`, grupo `gPgtoVinc` (YC, NT 2026.006 — sem obrigatoriedade em 2026).

Se a SEFAZ rejeitar por schema (cStat 215) ou por regra de IBS/CBS, baixe o PL_010f no portal nacional
(`nfe.fazenda.gov.br` → Documentos → Esquemas XML; o portal bloqueia download automatizado) e substitua os arquivos.
