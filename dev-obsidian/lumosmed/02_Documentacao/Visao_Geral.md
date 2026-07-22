# Visão Geral: LumosMed

## Missão

Plataforma de gestão para clínicas/profissionais de saúde: presença pública (site + blog) e portal operacional autenticado para o dia a dia da clínica.

## Stack

- `lumosmed/` — Laravel (PHP), Blade/Tailwind no site público, portal autenticado por sessão.
- `lumos-api/domains/lumosmed/` — domínio de negócio em Python, consumido pelo Laravel via BFF.
- `lumos-gateway` — Nginx compartilhado com o resto do ecossistema Lumos.

## Padrão de arquitetura: BFF

O navegador nunca acessa `lumos-api` diretamente. Todas as rotas autenticadas do portal (`/app/*`) são renderizadas ou fazem proxy através do Laravel, atrás do empilhamento de middleware documentado em [[../03_Padroes_Politicas/padrao-nova-pagina-portal-autenticado|padrao-nova-pagina-portal-autenticado]]. Ver `routes/web.php` no repositório `lumosmed/` para o mapa de rotas atual — não replicar rota a rota aqui. Decisão original: [[../00_Decisoes/2026-03-22-adotar-padrao-bff-laravel|adotar-padrao-bff-laravel]].

## Segurança (arquitetura, não achados)

- **Sessão do portal**: token de acesso, expiração e contexto de billing ficam inteiramente na sessão server-side do Laravel (`config/lumos_api.php`, chave `session`), nunca expostos ao JS do navegador. Revogação de token é revalidada pela API Python a cada request protegido (defesa em profundidade — a sessão Laravel não é o único gate).
- **Comunicação interna Laravel↔lumos-api**: JWT RS256 assinado por request, com proteção contra replay — ver [[../00_Decisoes/2026-03-27-autenticacao-interna-rs256-assinada|autenticacao-interna-rs256-assinada]]. Padrão de referência do repositório inteiro para chamadas serviço-a-serviço (citado pela skill [[../../_Compartilhado/Skills/secure-service-communication|secure-service-communication]]).
- **Isolamento multi-tenant (clínica)**: reforçado no Postgres via RLS, GUCs de sessão setados em `lumos-api/database/infra/connections.py` — ver [[../05_Integracoes_Infra/Banco_Dados|Banco_Dados]].
- **Anti-replay em escrita**: `PreventConcurrentRequestReplay` (`duplicate.request:N`) nas rotas de escrita do portal, incluindo faturamento.

Nenhum achado de segurança específico (vulnerabilidade/risco aceito) foi identificado no levantamento de 2026-07-18 — a arquitetura de auth interna é notavelmente mais robusta que o baseline mínimo. Se algo surgir, registrar em `../04_Seguranca_Riscos/` — ver os dois achados já abertos: [[../04_Seguranca_Riscos/chaves-privadas-tls-expostas-no-historico-git|chaves-privadas-tls-expostas-no-historico-git]] e [[../04_Seguranca_Riscos/prontuario-sem-criptografia-em-nivel-de-campo|prontuario-sem-criptografia-em-nivel-de-campo]].

## Áreas funcionais do portal (conhecidas)

Agenda, pacientes, faturamento/billing, configurações da clínica, integração com WhatsApp, funcionalidades assistidas por IA, telemedicina (sinalização hospedada no próprio Laravel). Ver [[../Hub|Hub]] para o mapa de controllers ↔ módulos Python. Para detalhe de cada fluxo, ver `lumos-obsidian` (`03_Padronizacoes/`, `02_Desenvolvimento/lumosmed/`), que já mantém esse nível de detalhe.

## Este projeto não vive sozinho no repositório

O repositório git `dev` também contém o produto Farmaura (chave `farmaura` neste cofre) e a biblioteca de skills em `dev-obsidian/_Compartilhado/Skills/`. `lumosmed/`, `lumos-api/` e `lumos-gateway/` são repositórios git próprios, aninhados aqui, e documentados em profundidade no cofre `lumos-obsidian` — não neste.

## Onde cada coisa deveria estar registrada

- Decisão de arquitetura/trade-off → `../00_Decisoes/`
- Padrão, política, premissa ou regra de negócio específica que ainda não está no `lumos-obsidian` → `../03_Padroes_Politicas/`
- Achado de segurança, vulnerabilidade ou risco → `../04_Seguranca_Riscos/`
- API, integração, banco de dados ou infra → `../05_Integracoes_Infra/`
- Pendência ou débito técnico → `../06_Pendencias/`
- POP ou processo → `../07_POPs_Processos/`
- Contexto de negócio definido pelo usuário → `../01_Contexto_Usuario/` (só o usuário escreve aqui)
- Detalhe de implementação arquivo a arquivo → `lumos-obsidian` (cofre separado), não aqui

## Atualizações

- 2026-07-20: seção de atualizações adotada nesta nota — daqui em diante, toda mudança material ou adoção de tecnologia nova relevante para esta visão geral ganha uma entrada aqui.
