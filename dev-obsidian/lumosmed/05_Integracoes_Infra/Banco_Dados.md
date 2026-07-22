# Banco de dados

**Tipo:** Banco de dados

## Propósito

Persistência de todo o domínio clínico (pacientes, agenda, prontuário, faturamento, WhatsApp, auditoria).

## Contrato

- **Todo o dado de domínio do LumosMed vive no Postgres do `lumos-api`**, via SQLAlchemy — configurado em `lumos-api/config/settings.py` (`DatabaseSettings.lumosmed_url`, env `LUMOSMED_DATABASE_URL`; cai para SQLite local se não setado, produção é Postgres).
- Models em `lumos-api/database/models/lumosmed/*.py` (clínica, paciente, usuário, consulta, faturamento, invoice, prontuário, estoque, whatsapp, compliance, auditoria, segurança) + `database/models/shared/*` (enums, mixins, tipos).
- Evolução de schema via `database/infra/schema_updates.py` — runner de DDL próprio, não Alembic.
- **Row-Level Security**: `database/infra/connections.py` injeta GUCs de sessão (`lumos.current_role`, `lumos.current_user_public_id`, `lumos.current_clinic_public_id`, `lumos.is_authenticated`, `lumos.is_system_job`) em toda sessão/transação — mesmo padrão de isolamento multi-tenant via RLS usado no Farmaura ([[PostgreSQL_RLS]]), implementação independente.
- **O banco do Laravel (`lumosmed/config/database.php`) é só para as próprias necessidades do framework** (sessão, cache, fila, teste — ex: `.env.testing` usa SQLite `:memory:` e `SESSION_DRIVER=array`), **não** guarda dado de domínio.

## Dependências

- Qualquer leitura/escrita de dado clínico deve passar pelo `lumos-api`, nunca por uma conexão direta do Laravel a esse banco.

## Ver também

- [[padrao-rls-multitenant-via-session-guc]] (`_Compartilhado/Padroes_Politicas/`) — receita genérica de RLS extraída desta implementação e da do Farmaura.
- [[prontuario-sem-criptografia-em-nivel-de-campo]] — risco identificado sobre dado sensível armazenado neste banco.
- [[bootstrap-e-seed-lumos-api]] — POP que popula este banco em cada ambiente.

## Atualizações

- 2026-07-19: nota criada.
