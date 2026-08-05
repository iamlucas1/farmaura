# 2026-08-05 — Conteúdo de demo via chamadas HTTP reais (não DB direto) + Farmaura integrado ao `reset_v2.sh` do lumos-dev

## Contexto

Para uma demonstração a investidor, configurei manualmente (via curl) banner promocional,
"marcas em destaque" fictícias e "ofertas do dia" curadas no ambiente de staging
([[Ambiente_Staging_Lumos_Dev|lumos-dev]]). O usuário pediu que isso virasse algo repetível
— "igual ao populate que criou o banner e as marcas em destaque" — mas rodável **localmente
primeiro**, já que o fluxo real é local → `lumos-dev` (validação) → produção.

Também pediu que o script de reset do servidor (`/opt/reset_v2.sh` em `lumos-dev`, fora deste
repositório git) passasse a incluir o Farmaura, e que para esse ambiente específico é aceitável
resetar tudo, inclusive o banco de dados.

## Decisão 1 — `scripts/populate_demo_content.py`: HTTP real, nunca acesso direto a banco

Implementado como cliente HTTP (`httpx`, já dependência do projeto) que loga como admin e chama
exatamente os mesmos endpoints que o console interno usa
(`PUT /portal/internal/home-banner`, `PUT /portal/internal/home-brands`,
`GET /portal/internal/deal-suggestions/bestsellers` + `PUT /portal/internal/deal-of-the-day`) —
em vez de manipular `PortalService`/sessão de banco diretamente, como `scripts/seed.py` faz.

**Motivo:** um script que só fala HTTP roda sem alteração contra qualquer ambiente que já tenha
essa versão da API no ar — local, `lumos-dev`, e futuramente produção — sem precisar reimplementar
contexto de RLS, sessão async ou regra de negócio fora da camada de serviço real. Testado local →
staging/lumos-dev branch já reconstruída localmente, todos os 3 endpoints responderam 200 e o
bootstrap público refletiu o conteúdo.

**Logos das marcas fictícias**: gerados uma única vez com Pillow (script descartável, não
commitado) e salvos como PNGs estáticos em `scripts/assets/demo_brands/` — Pillow **não** virou
dependência de runtime do projeto só para isso; o script de populate apenas lê e faz base64 dos
arquivos já prontos.

## Decisão 2 — Populate nunca cria/mexe em usuário

Deliberadamente **fora de escopo** do script: criação de conta demo (`demo@drogariafarmaura.com.br`
etc.) continua uma ação manual, feita direto via API quando necessário num ambiente específico —
nunca dentro de um script pensado para eventualmente rodar em produção. Uma credencial fixa e
documentada (mesmo que só em memória de sessão) não pode existir como caminho automatizável até
produção — isso seria essencially um backdoor administrativo hardcoded.

## Decisão 3 — Farmaura entra no `reset_v2.sh` do lumos-dev como stack multi-arquivo

`reset_v2.sh` (`/opt/reset_v2.sh` no servidor, não versionado neste repositório — é infraestrutura
compartilhada do `lumos-dev`) assume, para todo outro projeto (`lumosmed`, `michele`, `thamara`,
etc.), um único arquivo compose por stack que já embute a rede `lumos_gateway` (modelo
"pós-migração Laravel"). Farmaura não segue esse modelo — usa 3 arquivos (`docker-compose.yml` +
`docker-compose.gateway.yml` + `docker-compose.staging.yml`), como qualquer deploy real do produto.

Em vez de forçar Farmaura a virar um único arquivo achatado (frágil — divergiria do que é
realmente testado/documentado em [[07_POPs_Processos/publicar-staging-lumos-dev|publicar-staging-lumos-dev]]),
`compose_file_for_dir()` ganhou um caso especial: para o diretório do Farmaura, devolve os 3
arquivos space-joined; `dc()`/`render_stack_config()` (usadas por todo o resto do script, sem
mudança de assinatura) já expandem isso em múltiplos `-f`. Generalização mínima, sem duplicar a
lógica de baixo/sobe/validação já existente para as outras 8 stacks.

`DESTRUCTIVE_RESET=1` já é automático neste host (detectado por IP, `TURN_DEV_HOST_IP`) — Farmaura
herda o mesmo comportamento de todo o resto: `docker compose down --volumes` apaga o Postgres do
Farmaura a cada reset, banco reconstruído do zero (schema + RLS + seed determinístico) no próximo
`up`. Confirmado explicitamente pelo usuário como aceitável só neste ambiente.

**Validado sem rodar o fluxo destrutivo completo**: funções (`compose_file_for_dir`,
`validate_stack_network_contract`) testadas isoladamente contra o arquivo real no servidor antes
do deploy — o fluxo principal (que reseta michele/thamara/etc. também) não foi executado como
parte deste trabalho, só ajustado e validado estruturalmente.

## Consequências

- Sem migration, sem mudança de schema.
- `farmaura-api/scripts/populate_demo_content.py` e `scripts/assets/demo_brands/*.png` — novos,
  commitados na branch `staging/lumos-dev`.
- `/opt/reset_v2.sh` em `lumos-dev` — editado direto no servidor (mesmo padrão de drift já aceito
  para outras integrações deste host, já que este script não é parte de nenhum repositório git
  deste ecossistema); backup do original preservado em `/opt/reset_v2.sh.bak-<timestamp>`.
- Próxima vez que `staging/lumos-dev` for atualizada em `lumos-dev` (`git pull` + `up -d --build`),
  `populate_demo_content.py` pode ser rodado lá também para reaplicar o mesmo conteúdo de demo, em
  vez dos comandos curl manuais usados na primeira vez.

## Ver também

- [[Ambiente_Staging_Lumos_Dev|Ambiente_Staging_Lumos_Dev]] — ambiente onde isso roda hoje.
- [[../07_POPs_Processos/popular-conteudo-demo|popular-conteudo-demo]] — POP de uso do script.
- [[../02_Documentacao/Modulo_Portal|Módulo Portal]] — endpoints reais consumidos pelo script.
