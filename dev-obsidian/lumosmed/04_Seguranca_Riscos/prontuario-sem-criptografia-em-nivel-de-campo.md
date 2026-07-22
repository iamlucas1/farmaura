# Dado de prontuário armazenado em texto plano no nível de campo (sem criptografia de campo confirmada)

**Tipo:** Risco identificado
**Severidade:** Média
**Status:** Aberto (a confirmar)
**Data de identificação:** 2026-07-18

## Descrição

Investigação em `lumos-api/database/models/lumosmed/medical_record.py` mostra que dado clínico sensível (`MedMedicalRecord.summary`, `MedEncounter.notes`) é armazenado como coluna `Text` comum, sem nenhuma camada de criptografia de campo visível no ORM. Uma busca por `encrypt`/`criptograf`/`cipher` em `lumos-api/domains/lumosmed/` e `lumos-api/database/models/lumosmed/` não retornou nenhum resultado.

O que **já existe** de proteção, confirmado no código:
- Isolamento multi-tenant via RLS (GUCs de sessão) — ver [[padrao-rls-multitenant-via-session-guc]] (`_Compartilhado/Padroes_Politicas/`).
- Auditoria por entidade: `MedMedicalRecordHistory`, `MedEncounterHistory`, `MedPatientHistory` etc. (`database/models/lumosmed/audit.py`) registram `action` + `payload` por mudança.
- Controle de acesso por página no portal: `portal_access_rules.py` define o catálogo de páginas (incluindo `prontuario`) e o middleware `portal.page:{view}` (Laravel) gate quem pode acessar cada uma — ver [[padrao-nova-pagina-portal-autenticado]].
- `MedHiddenRecord` (`compliance.py`) sugere um mecanismo de ocultação de registro, possivelmente relacionado a direito de exclusão/anonimização (LGPD).

## Impacto

Se o banco de dados subjacente for comprometido (ex: dump de backup mal protegido, acesso indevido ao volume do Postgres), dado de prontuário fica legível diretamente — a proteção hoje depende inteiramente de RLS + controle de acesso da aplicação, não de criptografia própria do dado.

## Mitigação / Tratamento

Não confirmada. **Isto não é necessariamente uma vulnerabilidade** — muitos sistemas dependem de criptografia em nível de disco/volume (fora do alcance de uma leitura de código) em vez de criptografia por campo. Precisa de confirmação humana: existe criptografia em repouso no nível de infraestrutura (volume do Postgres, backup) para os dados do LumosMed? Se sim, este item pode ser rebaixado ou fechado; se não, vale avaliar criptografia de campo para dados clínicos como parte de conformidade LGPD para dado de saúde (categoria de dado sensível).

## Referências

Ver [[../Hub|Hub]] para o mapa completo de áreas do portal, incluindo prontuário.

## Ver também

- [[Banco_Dados]] — implementação de RLS/GUCs de sessão referida acima.
- [[prontuario-mockup-com-dados-falsos]] — outro achado sobre a mesma área "prontuário" (frontend sem backend real, não a questão de criptografia).

## Atualizações

- 2026-07-19: nota criada.
