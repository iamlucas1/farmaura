# NFC-e (modelo 65) — Farmaura, Distrito Federal

Módulo fiscal do `farmaura-api`. **Estado atual: implementado e testado offline; ainda NÃO validado contra a SEFAZ**
(faltam certificado A1, CNPJ/IE e dados do contador — ver "Antes da primeira emissão"). Produção está **bloqueada**.

## 1. Arquitetura

```
Venda do PDV (complete_sale)                      ← transação do banco
  └─ FiscalService.enqueue_pdv_sale               ← só banco: congela o SNAPSHOT fiscal e grava fiscal_documents (DRAFT)
COMMIT da venda                                   ← a venda nunca depende da SEFAZ
  └─ kick_emission → fiscal_worker                ← fora da transação
        1. lease (UPDATE condicional)             ← 1 worker por documento, mesmo com várias réplicas
        2. número (UPDATE ... RETURNING)          ← sequência atômica por CNPJ+ambiente+modelo+série
        3. FiscalMapper/Builder → XML NFC-e 4.00
        4. valida no XSD oficial → assina XMLDSig (A1)
        5. grava signed.xml + COMMIT               ← chave e XML duráveis ANTES de qualquer rede
        6. NFeAutorizacao4 (SOAP 1.2, mTLS, indSinc=1)
        7. 100 → nfeProc (NFe + protocolo) salvo + DANFE PDF
```

| Camada | Arquivos |
|---|---|
| Motor puro (sem banco) | `app/fiscal/`: `access_key`, `xml_builder`, `xml_signer`, `schema_validator`, `qrcode_v3`, `sefaz_messages`, `sefaz_client`, `danfe`, `certificate`, `snapshot` |
| Domínio | `app/domain/fiscal.py` (estados, transições, classificação de `cStat`, `tPag`) |
| Config | `app/core/fiscal_config.py` |
| Persistência | `app/models/fiscal_document.py`, `fiscal_support_tables.py`; `app/repositories/fiscal_repository.py`; migration `20260920_05` |
| Orquestração | `app/services/fiscal_service.py`, `fiscal_worker.py`, `fiscal_profile_service.py` |
| API | `app/api/v1/fiscal.py` (prefixo `/api/v1/fiscal`) |
| Front | `farmaura/react/internal/screens/fiscal-screen.jsx` |

**Por que snapshot?** O snapshot (itens, perfil tributário, pagamento, CPF) é gravado no fechamento da venda, com o RLS do
operador. O worker só toca tabelas fiscais e todo reenvio usa esse snapshot — editar preço/perfil depois nunca altera uma
nota que já tem número.

### Estados
`DRAFT → VALIDATING → SIGNING → SENDING → AUTHORIZED` (+ `REJECTED`, `DENIED`, `PENDING_RECOVERY`, `CONTINGENCY`, `ERROR`,
`CANCELED`). `CANCELED`/`DENIED` são finais: **nunca voltam a `AUTHORIZED`** (`can_transition`). Linhas do protótipo antigo
ficam `LEGACY_SIMULATED` (número/chave por hash; nunca foram à SEFAZ) e não aparecem no painel fiscal.

## 2. Variáveis de ambiente

Todas em `farmaura-api/.env.example` (**sem valores**). Principais:

| Variável | Função |
|---|---|
| `NFCE_ENABLED` | Chave-mestra. `false` = a venda funciona e **nenhum** documento fiscal é criado. |
| `FISCAL_ENV` / `FISCAL_PRODUCTION_ENABLED` | Ambiente. **Produção exige `FISCAL_ENV=producao` E `FISCAL_PRODUCTION_ENABLED=true`**; só o primeiro → o módulo recusa emitir. |
| `NFCE_ENV` | Opcional; se preenchida precisa ser igual a `FISCAL_ENV` (senão erro de configuração). |
| `NFCE_CNPJ`, `NFCE_IE`, `NFCE_RAZAO_SOCIAL`, `NFCE_NOME_FANTASIA` | Identidade do emitente. |
| `NFCE_CRT` | 1 Simples, 2 Simples excesso, 3 Regime Normal, 4 MEI. **Decide o conteúdo do XML** (ver §6). |
| `NFCE_LOGRADOURO/NUMERO/COMPLEMENTO/BAIRRO/CEP/MUNICIPIO/CODIGO_IBGE_MUNICIPIO/TELEFONE` | Endereço (UF fixa DF, `cUF=53`). |
| `NFCE_SERIE` | Série (0–999). **Nunca reutilize uma série em uso por outro emissor.** |
| `NFCE_CERTIFICATE_PATH`, `NFCE_CERTIFICATE_PASSWORD` | Certificado A1 `.pfx/.p12`. |
| `NFCE_CSC_*` | **Não usados** no QR Code v3 online (ver §5). Mantidos só para eventual retorno ao QR v2. |
| `NFCE_CANCEL_WINDOW_MINUTES` | Janela local de cancelamento (padrão 30; a SEFAZ é a autoridade final). |
| `NFCE_MAX_ATTEMPTS`, `NFCE_HTTP_TIMEOUT_SECONDS` | Retentativas / timeout por chamada. |

Se algo obrigatório faltar, `GET /fiscal/status` e o painel listam **exatamente** o que falta; nada é presumido.

## 3. Certificado A1 e segredos

1. Coloque o `.pfx` em `farmaura-api/secrets/nfce/` (pasta **ignorada pelo git e pelo build do Docker**).
2. O `docker-compose.yml` monta essa pasta **somente-leitura** em `/run/secrets/nfce`, só no container da API.
3. `NFCE_CERTIFICATE_PATH=/run/secrets/nfce/<arquivo>.pfx` e `NFCE_CERTIFICATE_PASSWORD=<senha>` no `.env` (ignorado pelo git).
4. O módulo confere: senha, validade, e o **CNPJ ICP-Brasil do certificado contra `NFCE_CNPJ`** (certificado de outro CNPJ é recusado antes de assinar).
5. Alerta de vencimento (`NFCE_CERTIFICATE_WARN_DAYS`, padrão 30) no painel e no log do worker.

Segredos usam `SecretStr` (não aparecem em `repr`, log ou resposta da API). A chave privada nunca é gravada em disco
permanentemente: para o TLS ela vai a um arquivo temporário **cifrado com senha descartável**, apagado logo em seguida.

## 4. Cadastro fiscal dos produtos

Nenhum produto tinha campo fiscal. Foi criada `product_fiscal_profiles` (1:1 com `inventory_products`):
NCM, CEST, CFOP, origem, unidade, CST/CSOSN, alíquotas, PIS/COFINS, cBenef, CST IBS/CBS, cClassTrib e alíquotas IBS/CBS.

- **O sistema não decide tributação.** Os valores vêm do contador (`PUT /fiscal/products/{id}/profile`, só admin).
- Produto sem perfil (ou incompleto) → a nota **não é emitida** e a venda mostra, por exemplo:
  `Produto SKU-1245 - Dipirona 500mg: faltam NCM (8 dígitos), CFOP (4 dígitos), CSOSN`.
- Corrigido o cadastro → botão **Reprocessar** (`POST /fiscal/nfce/{id}/reprocess`).
- ICMS suportados hoje: CSOSN 102/103/300/400/500 (Simples) e CST 00/40/41/50/60 (Normal). Outros são recusados com mensagem clara.

## 5. QR Code versão 3 (NT 2025.001) — sem CSC

Verificado na fonte primária (NT 2025.001 v1.03, tabela "Preenchimento da URL do QR Code"):
NFC-e **online** = `URL?p=<chNFe>|3|<tpAmb>` — **sem CSC, sem `idCSC`, sem hash**. Só a contingência offline (`tpEmis=9`) leva `assinatura`.
URL do DF (Receita-DF): `http://www.fazenda.df.gov.br/nfce/qrcode` e consulta `.../nfce/consulta` (configuráveis).
Portanto o **CSC de homologação não é necessário** para emitir online; mantivemos as variáveis por compatibilidade.

## 6. Reforma Tributária (IBS/CBS) — o que vale hoje

Fonte: NT 2025.002-RTC v1.51 (cronograma):
- **CRT=3 (Regime Normal): preenchimento de IBS/CBS OBRIGATÓRIO desde 03/08/2026**, em homologação e produção.
- **CRT=1/2/4 (Simples/MEI): não obrigatório**; a tributação começa em 2027 e as regras saem em NT futura.
- Base do IBS/CBS (regra UB16-10): `vProd + vFrete + vSeg + vOutro + vII − vDesc − vPIS − vCOFINS − vICMS − vFCP …`.
- NT 2026.006 (vinculação de pagamento/split): **sem exigência em 2026 em produção** (implantação prevista para 2027);
  o grupo `gPgtoVinc` não é preenchido.

## 7. Emissão, consulta, impressão, cancelamento

| Ação | Endpoint | Papéis |
|---|---|---|
| Emitir (re-enfileirar) | `POST /fiscal/nfce` `{sale_id}` | admin, gerente, farmacêutico, caixa |
| Consultar / listar | `GET /fiscal/nfce[/{id}]` (filtros, paginação ≤100) | idem (não-admin só vê a própria loja) |
| Baixar XML / PDF | `GET /fiscal/nfce/{id}/xml`, `/pdf` | idem |
| Imprimir | `GET .../printable` (HTML 80 mm) / `POST .../print` | idem |
| Consultar SEFAZ | `POST .../sync` | idem |
| Reprocessar | `POST .../reprocess` | idem |
| Cancelar | `POST .../cancel` `{justification 15–255}` | admin, gerente |
| Reconciliar tudo | `POST /fiscal/reconcile` | admin |
| Inutilizar | `POST /fiscal/inutilization` | admin |
| Status do módulo | `GET /fiscal/status?live=true` | admin, gerente |

- **Impressão**: o DANFE é sempre gerado a partir do **XML autorizado**. O front baixa o HTML/PDF com o token do operador
  (blob) e imprime num iframe — nada de URL pública. CSS `@page { size: 80mm auto }`.
- **Cancelamento**: evento 110111 assinado. Local: só `AUTHORIZED`, dentro da janela, justificativa válida. Se a SEFAZ estiver
  fora do ar a nota **continua autorizada** e o erro é 503 (use "Consultar SEFAZ" antes de repetir).
- **Inutilização**: só admin; recusa faixa que contenha número com documento ou ainda não usado.

## 8. Recuperação de falhas

- **Timeout ≠ rejeição.** Timeout/reset/5xx/cStat 108-109 → `PENDING_RECOVERY` com backoff exponencial (30 s, 60 s, … máx. 1 h).
- Na recuperação o sistema **consulta a chave antes de reenviar**: `100` → autoriza local; `101` → cancelada; `217` (SEFAZ nunca viu)
  → reenvia **o mesmo XML assinado** (ou reassina com nova hora, mesmo número e `cNF`, se passou de 10 min).
- `204` (duplicidade) → consulta, nunca "rejeita".
- **Rejeição fiscal** (NCM, CFOP, schema…) **não é repetida sozinha**: fica `REJECTED` com código e motivo; corrigido o dado,
  `Reprocessar` reaproveita número e chave.
- Depois de `NFCE_MAX_ATTEMPTS` tentativas → `ERROR` ("use Consultar SEFAZ"); **Reconciliar com SEFAZ** trata todos de uma vez.
- O worker é durável: reiniciar o processo não perde nada (a fila é o banco).

## 9. Contingência offline

**Estado: NÃO habilitada.** A NFC-e em contingência (`tpEmis=9`) exige, no QR Code v3, o parâmetro `assinatura`, cuja fórmula
está no *Manual do DANFE NFC-e v6*, que não pôde ser obtido de fonte primária (o portal nacional bloqueia download
automatizado). Não inventamos a fórmula: a tentativa **falha fechada** (`ContingencyNotSupportedError`). Enquanto isso, com a
SEFAZ fora do ar a nota fica `PENDING_RECOVERY`, enfileirada e reenviada quando a SEFAZ voltar — mas o cliente sai sem DANFE.
Já estão prontos: campos `dhCont`/`xJust`, estado `CONTINGENCY`, fila persistente e a regra "mesma chave e mesmo `cNF` no reenvio".
Para concluir: baixe o Manual v6 no portal nacional pelo navegador e coloque no repositório.

## 9.1 Homologação — como emitir a primeira NFC-e

```bash
# 1) preencher o .env (emitente, série, certificado) e colocar o .pfx em secrets/nfce/
# 2) checar tudo, sem enviar nota:
docker compose run --rm --no-deps --entrypoint uv farmaura-api run python scripts/fiscal_homologation_check.py
# 3) com o perfil tributário do contador em profile.json, enviar UMA nota de teste:
docker compose run --rm --no-deps --entrypoint uv farmaura-api run python scripts/fiscal_homologation_check.py --send --profile profile.json
```
O script recusa `FISCAL_ENV=producao`. Em homologação o `xProd` do 1º item e o `xNome` do destinatário levam os textos
obrigatórios "…SEM VALOR FISCAL" (regras I04-10 / E04-20) e o DANFE imprime o aviso.

## 10. Códigos de erro comuns

| cStat | Significado | O que fazer |
|---|---|---|
| 100 | Autorizado | — |
| 204 | Duplicidade de NF-e | Automático: consulta a chave |
| 215 / 225 | Falha de schema | Baixar o pacote de schemas mais novo (ver `app/fiscal/schemas/README.md`) |
| 228 / 703 | Emissão muito atrasada / hora futura | Verificar relógio do servidor (o app re-assina se passar de 10 min) |
| 297 / 298 / 539 | Assinatura difere / chave duplicada com diferença | Não reenviar; consultar e chamar o suporte |
| 373 / 598 | Texto obrigatório de homologação | Só ocorre se alguém alterar o builder |
| 391 / 392 / 737 | Dados do cartão / integração não aceita | Ajustar `card` (ver pendências) |
| 108 / 109 / 999 | SEFAZ paralisada | Automático: retentativa com backoff |
| 217 | NF-e não consta na base | Automático: reenvia o mesmo XML |
| 897 | `cNF` inválido | Não ocorre (gerador respeita B03-10) |
| HTTP 403 | Certificado de cliente recusado | Conferir certificado/cadeia (`NFCE_CA_BUNDLE_PATH`) |

## 11. Backup e LGPD

- XML/PDF ficam em `storage/private/fiscal/<ambiente>/<tenant>/<AAAA>/<MM>/nfce/<chave>/{signed.xml,authorized.xml,danfe.pdf,events/}` —
  storage privado, isolado por tenant, nunca servido por URL pública; download só autenticado e com papel.
- **Faça backup do volume `farmaura_storage_private` junto com o banco** — o XML autorizado é o documento legal (guarda de 5 anos).
- O CPF do consumidor está no XML e no snapshot; logs nunca imprimem CPF, XML, CSC, senha ou chave privada.

## 12. Antes da primeira emissão — o que preciso de você/contador

1. **CRT** do estabelecimento (decide ICMS CSOSN×CST e IBS/CBS).
2. CNPJ, IE/CF-DF, razão social, endereço completo e **código IBGE do município**, série a usar.
3. Certificado A1 (`.pfx`) e senha.
4. **Perfil tributário de cada produto** (NCM, CFOP, CST/CSOSN, PIS/COFINS, e IBS/CBS se CRT=3).
5. Decisões contábeis: taxa de entrega, cashback resgatado (hoje tratado como desconto rateado), grupo `card` (`tpIntegra`), tributos aproximados (Lei 12.741).
