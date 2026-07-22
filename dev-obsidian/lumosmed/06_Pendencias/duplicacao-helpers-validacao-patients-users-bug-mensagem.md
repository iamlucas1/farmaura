# Helpers de validação duplicados entre `portal_patients.py` e `portal_users.py` — um com bug de mensagem

**Status:** Aberto
**Prioridade:** Alta (é um bug funcional, não só estilo)
**Registrado em:** 2026-07-19

## Descrição

`portal_patients.py` e `portal_users.py` definem, cada um independentemente, `_require_safe_text`, `_optional_safe_text`, `_optional_digits_text`, `_raise_validation`, `_parse_birth_date` — corpos estruturalmente idênticos (normaliza → valida → levanta `PortalBillingError`), só a mensagem de erro difere.

**Bug real**: em `portal_patients.py`, `_require_safe_text` tem a mensagem hardcoded como *"O nome completo do paciente é obrigatório"* independente do `field_name` recebido — resquício de um validador de campo único generalizado sem atualizar a mensagem. Qualquer erro de campo obrigatório nesse arquivo hoje reporta incorretamente que é sobre o nome do paciente.

Outros pares de função duplicada encontrados (sem o bug de mensagem, mas mesmo padrão de duplicação): `_require_clinic` (`portal_agenda.py`/`portal_clinic_settings.py`), `_load_scoped_patient` (`portal_agenda.py`/`portal_patients.py`), `_build_kpis` (`portal_agenda.py`/`portal_users.py`), `_load_patient_map` (`portal_agenda.py`/`portal_whatsapp.py`), `_clean_optional_text` (`portal_clinic_settings.py`/`portal_whatsapp.py`).

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19 (verificado via grep de todo `^def _` nos 6 arquivos `portal_*.py`, com diff direto de 3 dos 10 pares). Diferente de `helpers/datetime`/`helpers/database` (que já são compartilhados corretamente e usados por 6+ arquivos), esses helpers de validação nunca foram extraídos para um módulo comum tipo `services/portal_validation.py`. Ação: corrigir o bug de mensagem primeiro (alta prioridade, é regressão de UX real), depois considerar consolidar os helpers duplicados.

## Ver também

- [[padrao-services-funcoes-planas-python]] — convenção seguida pelos arquivos `portal_*.py` onde esta duplicação ocorre.
- [[codigo-morto-e-bug-portal-checkout-request]] — mesmo tipo de achado (duplicação com bug), do lado Laravel.
- [[duplicacao-handle-controllers-portal]] — duplicação equivalente no lado dos controllers Laravel.
