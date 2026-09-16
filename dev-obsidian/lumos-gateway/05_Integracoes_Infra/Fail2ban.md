# fail2ban — banimento automático de IP por comportamento abusivo

**Tipo:** Infraestrutura (segurança de borda)

## Propósito

Banir automaticamente, a nível de firewall (`iptables`, chain `DOCKER-USER`), IPs que exibam padrões de abuso contra o gateway — força bruta, scanners, bots falsos, estouro de rate-limit.

## Contrato

- Serviço rodando via imagem de terceiro `crazymax/fail2ban` (hoje `:latest`, sem pin — ver [[../04_Seguranca_Riscos/supply-chain-e-hardening-diversos|achado de supply chain]]), com `network_mode: host` + `cap_add: NET_ADMIN, NET_RAW` (necessário para manipular `iptables` do host).
- `chain = DOCKER-USER` — ponto de inserção correto para que o banimento afete tráfego chegando por portas publicadas via DNAT (não passa pela chain `INPUT` normal).
- 5 jails ativos (`fail2ban/jail.local`, todos `enabled = true`):
  - `nginx-codigo` — detecta tentativa de injeção via parâmetro `codigo=` na query string; regex confirmada incompleta (só casa quando é o primeiro parâmetro) — ver [[../04_Seguranca_Riscos/fail2ban-regras-diversas|achado relacionado]].
  - `nginx-badbots` — assinaturas de User-Agent de scanner conhecido.
  - `nginx-fake-searchbots` — bloqueia UA de bot de busca que não bate com IP real do provedor; pode gerar falso positivo contra Googlebot/Bingbot real — ver [[../04_Seguranca_Riscos/fail2ban-regras-diversas|achado relacionado]].
  - `nginx-probes` — paths de probe/scan clássicos.
  - `nginx-limit-req` — lê `error.log` por eventos de rate-limit (`limiting requests`); interage com o achado de `burst=10` baixo demais em 7 tenants — ver [[../04_Seguranca_Riscos/rate-limit-burst-baixo-em-sete-tenants|achado relacionado]].

## Dependências

- Depende do Nginx logar corretamente os eventos que cada filtro procura (`access.log`/`error.log`).
- Compartilha o mesmo `iptables` do host entre todos os tenants — um banimento por comportamento contra um tenant específico bane o IP para **todos** os tenants ao mesmo tempo.

## Atualizações

- 2026-08-19: nota criada.
