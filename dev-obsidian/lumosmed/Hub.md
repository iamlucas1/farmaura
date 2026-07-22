# Hub Central: LumosMed

Chave de projeto neste cofre: `lumosmed` — cobre o produto LumosMed. O repositório `lumosmed/` (aninhado dentro deste repositório `dev`, com git remoto próprio: `git@github.com:iamlucas1/lumosmed.git`) é o site institucional + portal autenticado (BFF); a lógica de negócio real do domínio LumosMed vive em `lumos-api/domains/lumosmed/`, um serviço Python separado.

## Documentação detalhada já existe em outro cofre

A documentação técnica **profunda** (mirror arquivo-a-arquivo, padronizações de UI, modelos de dados) do ecossistema Lumos inteiro — `lumos-api`, `lumos-gateway`, `lumosmed`, `thamara` — já vive no cofre irmão **`lumos-obsidian`** (`~/Documentos/desenvolvimento-lumos/lumos-obsidian`), com governança própria (`CLAUDE.md`, `DIRETRIZES_IA.md`). Este cofre (`dev-obsidian`) não duplica esse conteúdo — a pasta `lumosmed/` aqui é deliberadamente enxuta (hub + visão geral), só para dar contexto rápido a quem está navegando o repositório `dev` sem trocar de cofre. Para detalhe de implementação, consultar `lumos-obsidian`.

## O que é

Produto de gestão para clínicas/profissionais de saúde: site institucional + blog público e um portal autenticado para o profissional (agenda, pacientes, faturamento/billing, configurações da clínica, integração com WhatsApp, funcionalidades de IA).

## Arquitetura (BFF)

- `lumosmed/` — Laravel. Renderiza o site público e serve como **BFF** (Backend For Frontend): as rotas autenticadas do portal (`/app/*`) fazem proxy para a API Python através do Laravel — o navegador nunca fala direto com `lumos-api`. Ver [[00_Decisoes/2026-03-22-adotar-padrao-bff-laravel|adotar-padrao-bff-laravel]].
- `lumos-api/domains/lumosmed/` — serviço Python (Flask + Gunicorn) que hospeda as regras de negócio e dados do domínio LumosMed, registrado como blueprint em `main.py` ao lado do domínio `identity` (autenticação/usuários, compartilhado com o resto do Lumos).
- `lumos-gateway` — gateway Nginx compartilhado (TLS, GeoIP, Fail2ban) na frente de todo o ecossistema Lumos, incluindo LumosMed — ver [[05_Integracoes_Infra/Lumos_Gateway_Roteamento|Lumos_Gateway_Roteamento]].

## Controllers do portal (Laravel) e sua contraparte em `lumos-api`

Cada área funcional tem um controller Laravel (`app/Http/Controllers/Portal/`) espelhando 1:1 um módulo de rota Python (`lumos-api/domains/lumosmed/api/routes/`):

- **Agenda** — `PortalAgendaApiController.php` / `agenda.py` (`services/portal_agenda.py`, ~51KB)
- **Pacientes** — `PortalPatientApiController.php` / `patients.py` (`services/portal_patients.py`)
- **Usuários/equipe** — `PortalUserApiController.php` / `users.py` (`services/portal_users.py`)
- **WhatsApp** — `PortalWhatsAppApiController.php` / `whatsapp.py` — ver [[05_Integracoes_Infra/WhatsApp_Meta|WhatsApp_Meta]]
- **Configurações da clínica** — `PortalClinicSettingsApiController.php` / `clinic_settings.py` (`services/portal_clinic_settings.py`, ~54KB)
- **IA (assistente "Luna")** — `PortalAiApiController.php` — ver [[05_Integracoes_Infra/IA_Provider|IA_Provider]]
- **Faturamento/billing** — `PortalBillingApiController.php` + `PortalBillingController.php` (maior controller do repo) / `billing.py` (`services/portal_billing.py`, ~202KB — maior arquivo do domínio) — ver [[05_Integracoes_Infra/Asaas_LumosMed|Asaas_LumosMed]] e [[06_Pendencias/decompor-portal-billing|decompor-portal-billing]]
- **Autenticação** — `Auth/PortalLoginController.php`, `PortalSignupController.php`, `PortalPasswordController.php`, `PortalGoogleController.php` / `domains/identity/services/authentication.py` — ver [[05_Integracoes_Infra/Google_SignIn|Google_SignIn]]
- **Prontuário** — `prontuario.blade.php`/`prontuario-lista.blade.php` — mockup sem backend real, ver [[06_Pendencias/prontuario-mockup-com-dados-falsos|prontuario-mockup-com-dados-falsos]] e [[04_Seguranca_Riscos/prontuario-sem-criptografia-em-nivel-de-campo|prontuario-sem-criptografia-em-nivel-de-campo]]

Também hospedado pelo Laravel (não é só a casca SPA): sinalização de telemedicina (`/app/telemedicina/salas/...`, WebRTC) e transcrição de áudio de prontuário (`/app/prontuario/audio/interpretar`) — ver [[05_Integracoes_Infra/Lumos_Gateway_Roteamento|Lumos_Gateway_Roteamento]].

## Relação com este repositório (`dev`)

Este repositório também hospeda o produto Farmaura (chave `farmaura` neste cofre, ver [[../farmaura/Hub|farmaura/Hub]]) e a biblioteca de skills em `dev-obsidian/_Compartilhado/Skills/` (documentada em [[../_Compartilhado/Skills/Hub|Skills/Hub]]). `lumosmed/`, `lumos-api/` e `lumos-gateway/` têm cada um seu próprio repositório git independente, aninhados aqui. Farmaura e Lumos compartilham apenas o `lumos-gateway` ([[../farmaura/05_Integracoes_Infra/Lumos_Gateway|Lumos_Gateway]] / [[05_Integracoes_Infra/Lumos_Gateway_Roteamento|Lumos_Gateway_Roteamento]]).

## Navegação

- Visão geral / arquitetura: [[02_Documentacao/Visao_Geral|Visão Geral]]
- Decisões (ADRs): `00_Decisoes/` — [[00_Decisoes/2026-03-22-adotar-padrao-bff-laravel|adotar-padrao-bff-laravel]] → [[00_Decisoes/2026-03-27-autenticacao-interna-rs256-assinada|autenticacao-interna-rs256-assinada]]
- Contexto de negócio (só o usuário escreve): `01_Contexto_Usuario/`
- Padrões, políticas, premissas e regras de negócio não cobertas pelo `claude.md`/`agent.md`: `03_Padroes_Politicas/`
- Segurança, vulnerabilidades e registro de riscos: `04_Seguranca_Riscos/` — [[04_Seguranca_Riscos/chaves-privadas-tls-expostas-no-historico-git|chaves-privadas-tls-expostas-no-historico-git]] (crítica) e [[04_Seguranca_Riscos/prontuario-sem-criptografia-em-nivel-de-campo|prontuario-sem-criptografia-em-nivel-de-campo]]
- APIs, integrações, bancos de dados e infra: `05_Integracoes_Infra/`
- Pendências e débito técnico: `06_Pendencias/`
- POPs e processos: `07_POPs_Processos/` — ver [[07_POPs_Processos/bootstrap-e-seed-lumos-api|bootstrap-e-seed-lumos-api]]
- Documentação profunda / mirror de código: `lumos-obsidian` (cofre separado)
