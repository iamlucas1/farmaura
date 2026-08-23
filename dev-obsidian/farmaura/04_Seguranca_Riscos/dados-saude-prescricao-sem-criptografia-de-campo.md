# Dados de saúde/PII de prescrição em texto plano, sem proteção adicional além de RLS por tenant

**Tipo:** Risco identificado (proteção de dado sensível / conformidade LGPD)
**Status:** POSSÍVEL
**Severidade:** MÉDIO
**Sistema afetado:** `farmaura-api`
**Categoria:** Dados sensíveis / privacidade / dado de saúde
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

`Prescription` (`app/models/prescription.py:42-56`) guarda `patient_name_snapshot`, `patient_document_snapshot` (CPF do paciente), `patient_phone_snapshot`, `doctor_name`, `doctor_license_number` e `has_controlled_medication` (indica classe de medicamento controlado, correlacionável a condição de saúde) como colunas de texto plano comuns — sem criptografia em nível de campo, sem masking, sem tabela separada com controle de acesso mais estrito. A proteção é a mesma de qualquer outra tabela do sistema (isolamento por `tenant_id` via RLS), não há camada extra pensada especificamente para dado de saúde.

## Evidência

`app/models/prescription.py:42-56` — colunas `String`/`Text` comuns, sem `pgcrypto`/criptografia de aplicação.

## Cenário de risco

Em caso de vazamento de banco de dados, dump de backup mal protegido, ou bypass de RLS (ex.: acesso direto via role `farmaura` superuser, usado só para bootstrap/administração, em vez do role `farmaura_app`, restrito, usado pela aplicação em runtime), esses dados ficam expostos em claro — incluindo CPF e indício de uso de medicamento controlado.

## Impacto

Sob a LGPD, dado de saúde é "dado pessoal sensível" (art. 11), exigindo tratamento com salvaguardas adicionais além do isolamento lógico por tenant. Exposição em caso de comprometimento do banco/backup traz risco regulatório além do risco técnico.

## Pré-condições

Acesso ao banco de dados fora da camada de aplicação normal — dump, backup vazado, acesso direto com role superuser, ou falha de RLS. Não é explorável via API normal (a API já filtra por tenant/role corretamente).

## Escopo afetado

`app/models/prescription.py`, e por extensão qualquer backup/dump do banco de dados de produção.

## Causa raiz

Decisão de arquitetura (implícita, não documentada como ADR): isolamento por tenant via RLS foi tratado como suficiente para todos os domínios, sem camada extra especificamente para dado de saúde.

## Correção sugerida para análise futura

Avaliar criptografia em nível de campo (ex.: `pgcrypto` no Postgres, ou criptografia de aplicação antes de persistir) para `patient_document_snapshot` e `doctor_license_number` no mínimo; revisar política de retenção/backup para esses campos especificamente.

## Dependências da correção

Migration Alembic para alterar o tipo de coluna (se for criptografia de aplicação, a coluna vira `bytea`/texto cifrado); decisão de gestão de chave de criptografia (KMS, variável de ambiente, rotação) precisa ser tomada antes da implementação.

## Riscos de regressão

Médio-alto — mudar o tipo de armazenamento de um campo usado em queries/relatórios existentes (ex.: busca por CPF) exige revisar todo código que lê esses campos hoje como texto plano.

## Como validar futuramente que a correção funcionou

Confirmar, via inspeção direta do banco (não pela API), que os campos sensíveis não são legíveis em texto plano sem a chave de decriptação; confirmar que os fluxos existentes (revisão de prescrição no console, busca) continuam funcionando após a mudança.

## Referências

- [[../02_Documentacao/Modulo_Prescricoes|Modulo_Prescricoes]].
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.
