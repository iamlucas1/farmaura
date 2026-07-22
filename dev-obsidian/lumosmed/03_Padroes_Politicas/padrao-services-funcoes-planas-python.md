# Padrão confirmado: services do domínio lumosmed são módulos de função, não classes

**Tipo:** Padrão técnico (documentação de convenção real)

## Descrição

Nenhum dos arquivos `domains/lumosmed/services/portal_*.py` usa classe de serviço — são módulos com funções públicas (`start_checkout`, `agenda_snapshot`, `search_patients`, ...) mais helpers privados prefixados com `_`, recebendo a sessão SQLAlchemy explicitamente como primeiro argumento. Sem camada de repositório — acesso a banco direto no corpo da função.

## Motivo

Documentar a convenção real, consistente nos 6 maiores arquivos do domínio (`portal_billing.py`, `portal_whatsapp.py`, `portal_agenda.py`, `portal_clinic_settings.py`, `portal_users.py`, `portal_patients.py`) — qualquer service novo deve seguir esse mesmo formato, não introduzir um estilo orientado a classe isolado.

## Exceções conhecidas

`portal_billing.py` (202KB / 4425 linhas / 137 funções) é uma exceção de tamanho, não de convenção — segue o mesmo padrão função-plana, mas sem nenhum divisor de seção e com funções individuais muito grandes (`start_checkout` tem 667 linhas). Ver [[decompor-portal-billing]].

## Ver também

- [[Asaas_LumosMed]] — `portal_billing.py` é o maior arquivo do domínio, citado aqui.
- [[duplicacao-helpers-validacao-patients-users-bug-mensagem]] — mesma família de arquivos `portal_*.py`, duplicação de helpers entre eles.

## Atualizações

- 2026-07-19: nota criada.
