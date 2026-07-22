# Skill: secure-python-backend

**Arquivo fonte:** `dev-obsidian/_Compartilhado/Skills/secure-python-backend/SKILL.md` (+ `references/security-baseline.md`, `references/versions-and-supply-chain.md`)

## Propósito

Fundação para criar ou refatorar um backend Python (FastAPI) em conformidade com o baseline de segurança do repositório desde a primeira versão.

## Quando usar

Ao construir fundações de backend, novos domínios ou refatorações de backend.

## Fluxo de trabalho

1. Ler `references/versions-and-supply-chain.md` antes de criar manifests, Dockerfiles ou passos de CI.
2. Ler `references/security-baseline.md` antes de criar rotas, models, services, tratamento de arquivo ou fluxos de auth.
3. Mapear integração com `lumos-gateway`: nome de upstream estável, rede Docker externa compartilhada `lumos_gateway`, rede privada só do backend para banco/Redis/workers, rota de health apropriada, sem exposição de porta pública direta.
4. Estruturar em camadas: `api`, `core`, `domain`, `models`, `repositories`, `services`, `schemas`, `tests`.
5. Toda rota/service novo: schemas de request/response, validar ator/tenant/role/ownership, rejeitar input desconhecido/inseguro, testes de fluxo válido + pelo menos um caso de abuso.
6. Toda mudança de persistência: migration, constraints e índices, verificar deduplicação/ownership/unicidade escopada.
7. Toda dependência/integração externa: pin de versão exata, justificativa, evitar instalação via lifecycle script não confiável.
8. Se mexer em arquivo de gateway: manter TLS/redirect/GeoIP/Fail2ban no `lumos-gateway`, validar templates e rodar `nginx -t`.

## Checagens obrigatórias

Nunca confiar em estado do frontend; nunca confiar em ID de URL sem cross-check; nunca colocar lógica de negócio no handler de rota; nunca paginação/upload sem limite; nunca aceitar HTML/shell/URL externa sem controle explícito; nunca tag `latest` ou range de dependência flutuante; nunca expor banco/Redis na rede compartilhada de borda; nunca contornar o `lumos-gateway` para roteamento de produção.

## Nota do repositório

Este é o baseline que `references/security-baseline.md` e `references/versions-and-supply-chain.md` formalizam — o conteúdo espelha em grande parte as regras estáticas já em `claude.md`/`agent.md` na raiz do repositório; consultar os dois arquivos de referência da skill para o texto completo em vez de duplicá-lo aqui.

## Ver também

- [[../../farmaura/03_Padroes_Politicas/padrao-camadas-backend-di-fastapi|padrao-camadas-backend-di-fastapi]] — implementação real desta fundação de camadas no Farmaura.
- [[secure-api-endpoint]] e [[secure-auth-rbac-jwt]] — skills complementares para rota e autenticação específicas.

## Atualizações
- 2026-07-20: definição operacional movida para o diretório da skill neste cofre; esta nota permanece destinada à leitura humana.

- 2026-07-19: nota criada.
