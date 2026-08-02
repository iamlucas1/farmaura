# 2026-08-01 — Modo de lançamento: página de "em breve"/contador substitui a vitrine inteira, sem bypass

## Contexto

O usuário pediu uma página de "em breve"/contador regressivo para a inauguração do marketplace
(05/09/2026 09:00, horário de Brasília), substituindo a vitrine até essa data.

## Alternativas consideradas

- **Fixo no código (data hardcoded), sem toggle admin.** Mais rápido de implementar, mas qualquer
  mudança de data ou desativação antecipada exigiria novo deploy de código. Rejeitada — o usuário
  escolheu explicitamente a opção com toggle administrativo.
- **Bypass para visitante autenticado/equipe** (cliente ou farmacêutico logado veria o marketplace
  normal por trás do contador). Rejeitada — o usuário escolheu que **ninguém** veja o marketplace
  antes da data, sem exceção. Simplifica a lógica (um único branch de renderização, sem depender de
  `user`) e evita superfície de teste em produção; para conferir o site antes do lançamento, a rota é
  desativar o toggle temporariamente ou usar o ambiente de dev local.
- **Nova tabela/endpoint dedicado.** Rejeitada — segue exatamente o padrão já estabelecido por
  `home_banner`/`home_brands`: um novo `setting_key` (`launch_mode`) na tabela genérica
  `portal_settings` (`tenant_id` + `portal_name="internal"` + `setting_key`, JSON em `value_json`).
  Zero migration nova.

## Decisão

1. **Novo setting `launch_mode`** (`PortalLaunchModeResponse`/`UpdateRequest` em `schemas/portal.py`):
   `enabled: bool`, `launch_at: datetime`, `headline`/`subtext` (strings livres, sem sanitização HTML
   — são renderizados como texto puro, nunca `dangerouslySetInnerHTML`, diferente do `home_banner`).
2. **Exposto nos três bootstraps** (`public-bootstrap`, `marketplace/bootstrap` autenticado e
   `internal/bootstrap`) via `PortalService._resolve_launch_mode`, mesmo padrão de `_resolve_home_brands`.
3. **`PUT /portal/internal/launch-mode`** — **ADMIN only** (não `MANAGER`/`PHARMACIST`, diferente do
   `home_banner`/`home_brands`) — decisão de escopo do próprio recurso: tirar o marketplace do ar
   inteiro é uma ação de maior impacto que configurar um banner.
4. **Tela nova** `Marketplace → Modo de lançamento` (`launch-mode-screen.jsx`) — toggle
   ativar/desativar, campo de data/hora (`datetime-local`, interpretado no fuso do navegador do
   admin), título e texto complementar opcionais.
5. **Gate no `marketplace-app.jsx`**: quando `launchMode.enabled` e `launchAt` ainda no futuro,
   `App()` retorna cedo um componente `LaunchCountdownScreen` — **substitui a página inteira**
   (sem `Header`/`Footer`/carrinho/login), para **todo visitante, logado ou não, sem exceção**.
   Contador local (dias/horas/min/seg) recalculado a cada segundo contra o relógio do próprio
   navegador do visitante; ao zerar, recarrega a página uma vez.

## Consequências

- Sem migration — reaproveita `portal_settings`, mesma tabela genérica já usada por 7 outras
  configurações do tenant.
- Ambiente de dev: `enabled=false` por padrão (nada configurado ainda) — pedido explícito do
  usuário para não afetar o fluxo normal de desenvolvimento/teste.
- Ambiente de produção: ativado deliberadamente pelo usuário no deploy desta feature, com
  `launch_at=2026-09-05T09:00:00-03:00`, via o mesmo endpoint admin.
- Testado ponta a ponta no stack de dev: toggle ligado → marketplace inteiro vira a página de
  contador (confirmado por screenshot); toggle desligado → vitrine normal volta a aparecer; console
  interno nunca é afetado (é um entrypoint/bundle separado, não passa pelo gate).
- Nenhuma tabela nova, nenhum RLS novo — `launch_mode` roda dentro do RLS já existente de
  `portal_settings`.

## Ver também

- [[2026-07-31-banner-da-home-configuravel-com-html-sanitizado|ADR do banner da home configurável]] —
  mesmo padrão de setting genérico em `portal_settings`.
- [[../02_Documentacao/Modulo_Portal|Módulo Portal]] — settings documentados.
