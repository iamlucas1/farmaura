# Resetar e re-semear dados de desenvolvimento local

## Quando usar

Quando os dados locais ficaram inconsistentes, ou quando é preciso voltar a um estado limpo com o seed determinístico (`scripts/seed.py`: admin, farmacêutico, caixa, clientes, lojas, catálogo, pedidos de exemplo, prescrições, estoque).

## O que já acontece automaticamente

`scripts/bootstrap_database.py` roda **em todo start do container** (não é um passo manual): cria o schema a partir dos models ORM, reaplica as políticas de RLS (`row_level_security.py`) e só popula o seed **se o banco não tiver nenhum usuário ainda**. Reiniciar o container sozinho não reseta nada — se já existe pelo menos um usuário, o seed é pulado.

## Passos para forçar um reset completo

1. Derrubar a stack e apagar o volume do Postgres: `docker compose down -v` (ou remover especificamente o volume nomeado do Postgres, se não quiser derrubar tudo).
2. Subir de novo: `./scripts/docker_up.sh` (ou `docker compose up --build`).
3. Como o banco volta vazio, `bootstrap_database.py` recria o schema, a RLS e roda o seed completo automaticamente no boot — não é preciso chamar `seed.py` manualmente.

## Parâmetros do seed (`scripts/seed.py`)

Seed determinístico, sem argumentos de linha de comando nem variáveis de ambiente próprias — todos os dados vêm de constantes fixas no topo do arquivo. Composição atual (impressa no console ao final de `seed_database()`):

- **Tenant/lojas**: 1 tenant (`TENANT_ID`) com 2 lojas — "Farmaura Ponte Alta Norte" (`STORE_ID`, principal) e "Farmaura Águas Claras" (`SECOND_STORE_ID`), cada uma com endereço, CNPJ e coordenadas fixas (usadas pelo mapa real da loja).
- **Data de referência**: `SEED_NOW = 2026-06-11 09:30 UTC` — timestamp base para os registros operacionais gerados (pedidos, movimentações, snapshot "dia de atendimento").
- **CNAEs** (`CNAE_REGISTRY`): 7 atividades registradas para a farmácia, com uma delas (`47.71-7-01`, comércio varejista de produtos farmacêuticos) marcada `is_subject_to_icms_st=True` — os demais itens do catálogo assumem `False`. Regime tributário simulado: Simples Nacional, Anexo I, DF, faturamento fictício de R$ 1.200.000/12m (Faixa 4), usado pelo Precificador.
- **Usuários de teste**: todos com a mesma senha, `DEFAULT_PASSWORD = "Farmaura@123"`. Um por papel/loja — admin (`adriana.lima@farmaura.com.br`), farmacêutica líder com 2FA ativo (`helena.rocha@farmaura.com.br`, loja principal), farmacêutica sem 2FA (loja Águas Claras), gerente de loja, 2 caixas, 1 entregador, e 4 clientes de marketplace (`mariana`, `lucas`, `camila` — esta com 2FA —, `bianca`). Segredo TOTP compartilhado para as contas com 2FA: `MFA_SECRET = "JBSWY3DPEHPK3PXP"`.
- **Clientes (CRM)**: 5 clientes "nomeados" com histórico detalhado (cashback, ticket médio, tags de interesse) + 25 clientes "bulk" gerados por tabela determinística (sem RNG) para volume de CRM realista — reruns são estáveis.
- **Catálogo**: 10 produtos "nomeados" com atributos completos (preço, custo, estoque, thresholds, cashback, ICMS-ST) + 30 produtos "bulk" derivados de uma tabela compacta por fórmula determinística — inclui 1 item com estoque zerado (`sunscreen`) e 1 medicamento controlado (`clonazepam`, tarja preta).
- **Volume adicional**: fornecedores, movimentações de estoque/lotes, notas fiscais de entrada (XML placeholder), pedidos online e vendas PDV do "dia de atendimento" (`build_daily_operations`), prescrições, assinaturas, cashback, chat, eventos de auditoria e refresh tokens — todos amarrados aos usuários/clientes/catálogo acima.

Para ver a contagem exata gerada numa run (produtos, clientes, pedidos/vendas do dia, rotas), rodar o seed e ler o resumo impresso no final — ele varia conforme `build_daily_operations` gera o dia simulado.

## Responsável

Qualquer desenvolvedor trabalhando localmente. Não usar em produção — este fluxo assume a fase de desenvolvimento sem Alembic (ver "Development Environment Policy" no `claude.md`).

## Ver também

- [[Docker_Compose]] — serviços derrubados/subidos por este procedimento.
- [[PostgreSQL_RLS]] — RLS reaplicada pelo `bootstrap_database.py` a cada start.
- [[bootstrap-e-seed-lumos-api]] — POP equivalente no domínio LumosMed.

## Atualizações

- 2026-07-19: nota criada.
