---
cssclasses: ia-nota
---

# Valkey sem senha (`requirepass`) em nenhum ambiente — depende 100% de isolamento de rede

**Tipo:** Vulnerabilidade (defesa em profundidade ausente / rede interna)
**Status:** CONFIRMADO
**Severidade:** MÉDIO
**Sistema afetado:** infraestrutura (`farmaura-api/docker-compose.yml` e todos os overlays)
**Categoria:** Rede interna / movimento lateral
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

Diferente do Postgres (que exige usuário/senha mesmo dentro da rede Docker interna, em todos os ambientes — dev, staging, produção), o Valkey (`farmaura-valkey`, ver [[../05_Integracoes_Infra/Valkey|Valkey]]) roda sem `--requirepass`/ACL em qualquer overlay, inclusive `docker-compose.prod.yml` (que não toca a configuração do Valkey). `APP_VALKEY_URL` nunca inclui credenciais (`valkey://farmaura-valkey:6379/0`). O isolamento depende inteiramente de nenhum outro container conseguir alcançar a rede `farmaura_private`.

## Evidência

`farmaura-api/docker-compose.yml` — serviço `farmaura-valkey`: `command: ["valkey-server", "--appendonly", "yes"]`, sem `--requirepass`. `docker-compose.prod.yml` não sobrescreve isso.

## Cenário de risco

Se qualquer outro container for adicionado no futuro à mesma rede Docker `farmaura_private` (hoje só têm acesso `farmaura`, `farmaura-api`, `farmaura-postgres`, `farmaura-valkey` — nenhum outro tenant do `lumos-gateway` compartilha esta rede específica), ou se um dos quatro serviços existentes for comprometido via alguma outra vulnerabilidade (ex.: RCE), esse container ganha acesso de leitura/escrita irrestrito ao Valkey sem precisar de nenhuma credencial — pode ler/manipular contadores de rate-limit e bloqueio de login (`core/rate_limit.py`, `core/login_guard.py`) e o cache de catálogo.

## Impacto

Movimento lateral facilitado em caso de comprometimento de qualquer container da rede interna; manipulação de contadores de segurança (ex.: um atacante com acesso à rede poderia zerar o contador de bloqueio de uma conta sob ataque de força bruta, neutralizando essa defesa).

## Pré-condições

Comprometimento prévio de outro container na mesma rede `farmaura_private`, ou adição futura de um novo serviço a essa rede sem revisão de segurança.

## Escopo afetado

`farmaura-api/docker-compose.yml` (serviço `farmaura-valkey`), `app/core/config.py` (`APP_VALKEY_URL`).

## Causa raiz

Valkey provisionado sem `--requirepass`/ACL desde a criação do serviço, dependendo unicamente de isolamento de rede como controle de acesso.

## Correção sugerida para análise futura

Definir `--requirepass` (via variável de ambiente/secret, não hardcoded) no `command:` do serviço Valkey, e atualizar `APP_VALKEY_URL` para `valkey://:<senha>@farmaura-valkey:6379/0` — ao menos em produção; considerar replicar em staging/dev por consistência, ainda que o risco lá seja menor.

## Dependências da correção

Nenhuma migration. Requer coordenar a mudança de connection string com o deploy (rotação simultânea da senha e do `.env` correspondente) para não causar downtime.

## Riscos de regressão

Baixo, mas exige atenção operacional: qualquer script/ferramenta que se conecte ao Valkey diretamente (debug manual, scripts administrativos) também precisa passar a usar a senha.

## Como validar futuramente que a correção funcionou

Confirmar que uma conexão sem senha ao `farmaura-valkey` é recusada (`redis-cli`/`valkey-cli -h farmaura-valkey PING` sem `-a` deve falhar com `NOAUTH`), e que a aplicação continua funcionando normalmente (rate limit, login guard, cache de catálogo) com a senha configurada.

## Referências

- [[../05_Integracoes_Infra/Valkey|Valkey]] — contrato completo do serviço.
- [[../05_Integracoes_Infra/Docker_Compose|Docker_Compose]] — overlays relevantes.
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.