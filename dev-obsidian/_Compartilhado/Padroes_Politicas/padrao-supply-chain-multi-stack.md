# Padrão: travamento de versão e supply chain em todas as stacks do ecossistema

**Tipo:** Padrão técnico genérico

## Aplica-se a

Qualquer stack deste ecossistema (Python/uv, npm, **Composer**, imagens Docker) — inclui repositórios que não têm `claude.md`/`agent.md` próprio (`lumosmed/`, `lumos-api/`).

## Descrição

`claude.md`/`agent.md` (raiz do repositório `dev`) já travam versão para Python/uv, npm e Docker do lado Farmaura — ver "Approved Versions"/"Supply Chain Requirements" nesses arquivos, não replicado aqui. Esta nota cobre o que aqueles arquivos **não** cobrem: Composer/PHP (usado por `lumosmed/`, repositório git próprio sem cópia local de `claude.md`), e serve de referência única para copiar em qualquer repositório novo do ecossistema que ainda não tenha sua própria política.

- **Python/uv** (`farmaura-api/`, `lumos-api/`): `uv.lock` commitado, versão exata em manifest, sem `latest`/range flutuante em dependência crítica.
- **npm** (`farmaura/react/`): `package-lock.json` commitado, `npm ci` (nunca `npm install` em CI/build), `npm install --ignore-scripts` por padrão em contexto de auditoria, revisão de `scripts`/`postinstall`/`prepare` antes de adicionar pacote.
- **Composer** (`lumosmed/`) — lacuna real até 2026-07-20, sem regra escrita em lugar nenhum antes desta nota:
  - `composer.lock` sempre commitado;
  - `composer install --no-dev --no-scripts` fora de desenvolvimento local;
  - versão exata (não `^`/`~`) para qualquer pacote que toque autenticação, criptografia ou cliente HTTP;
  - revisar o pacote antes de rodar `composer require`, nunca instalar de registry não oficial;
  - nenhum script Composer (`post-install-cmd`, `post-update-cmd`) sem revisão.
- **Docker** (todas as stacks): pin de imagem base por tag específica (idealmente por digest), sem `latest`, build reprodutível, sem segredo de build embutido em imagem/layer — mesmo princípio já aplicado ao `lumos-gateway` (`certbot`, `fail2ban` com tag revisada, não `latest`).

## Motivo

Cada stack deste ecossistema trava dependência de forma independente porque vive em repositórios git diferentes (alguns aninhados dentro de `dev`, outros com remote próprio) sem um `claude.md`/`agent.md` compartilhado. Sem uma referência central copiável, a regra tende a existir só onde alguém lembrou de escrevê-la — e Composer é o exemplo concreto disso: `lumosmed/composer.json` existe desde antes desta nota, mas nenhuma política de lock/versão jamais foi documentada para ele.

## Exceções conhecidas

Nenhuma até 2026-07-20. Se uma stack nova adotar um gerenciador de pacote diferente destes quatro, registrar aqui em vez de deixar sem cobertura.

## Ver também

- `claude.md`/`agent.md` ("Approved Versions", "Supply Chain Requirements"/"Supply Chain and Dependency Security") — política canônica de Python/npm/Docker para `farmaura`/`farmaura-api`/`lumos-gateway`, não duplicada aqui.
- [[padrao-ataques-defesas-e-limites-de-teste]] — supply chain como categoria de ataque a defender, e limites seguros para testar isso.
- [[../Skills/secure-python-backend|Skills/secure-python-backend]] — inclui `references/versions-and-supply-chain.md`, espelha a parte Python desta política.

## Atualizações

- 2026-07-20: nota criada.
