# Rate limit do gateway: `burst=10` ainda não corrigido em 7 dos 8 tenants (mesmo padrão que já causou incidente real no Farmaura)

**Tipo:** Risco identificado (disponibilidade / configuração inconsistente entre vhosts)
**Status:** CONFIRMADO
**Severidade:** MÉDIO-ALTO
**Sistema afetado:** `lumos-gateway`
**Categoria:** Rate limit / disponibilidade
**Data de identificação:** 2026-08-19

## Descrição

`req_limit` é uma única zona de memória Nginx (`limit_req_zone $binary_remote_addr zone=req_limit:20m rate=5r/s;`, `nginx/nginx.conf.template:110`) referenciada em **todos** os vhosts do gateway: Farmaura, LumosAnalytics-site, lumos-api, LumosMed, LumosNeon, Michele, Thamara, ADCRDF, Horizon. O `burst` é declarado por vhost/location — mas em **7 dos 8 tenants** (todos exceto Farmaura) o `location /` genérico continua em `burst=10`, exatamente o valor que já causou 429 real em produção no Farmaura (telas com múltiplas chamadas paralelas no carregamento estourando o burst), corrigido lá para `burst=40` depois do incidente (ver `dev-obsidian/farmaura/05_Integracoes_Infra/Lumos_Gateway.md`, atualização de 2026-07-24).

O padrão que gerou o incidente (front-end moderno disparando várias chamadas JS/CSS/API em paralelo no boot) não é peculiaridade do Farmaura — é comum a qualquer SPA. Os outros 7 tenants nunca passaram pelo mesmo teste de carga real que expôs o problema no Farmaura.

Agravante: a zona `req_limit` é compartilhada **entre tenants diferentes**, não só por vhost — a chave é só `$binary_remote_addr` (sem `$host`), então um mesmo IP cliente (ex.: escritório atrás de NAT, ou usuário navegando entre dois produtos do ecossistema) consome do mesmo bucket de token em todos os domínios simultaneamente. Tráfego pesado a um tenant pode empurrar outro tenant não relacionado para 429.

Segundo agravante: o jail `nginx-limit-req` do fail2ban (`maxretry=6`, `findtime=600`, `bantime=3600`) lê o mesmo `error.log` de rate-limit — um usuário legítimo que ultrapasse o burst baixo algumas vezes em 10 minutos (basta abrir a mesma tela pesada 2-3 vezes) pode ser **banido por 1h no nível de IP**, agravando o mesmo incidente em vez de só devolver 429.

## Evidência

`grep` confirma `burst=10` idêntico em `location /` de `20-lumosanalytics-site.conf.template`, `21-lumos-api.conf.template`, `40-lumosneon.conf.template`, `50-michele.conf.template`, `60-thamara.conf.template`, `70-adcrdf.conf.template`, `80-horizon.conf.template`; em `30-lumosmed.conf.template` o `location /` genérico catch-all também está em `burst=10` (rotas de telemedicina específicas já foram tratadas à parte com burst 60-150, só o catch-all ficou no valor original). `90-farmaura.conf.template` é o único com `burst=40` (correção reativa pós-incidente).

## Cenário de risco

Qualquer tela desses 7 produtos que dispare mais de ~15 requisições em paralelo do mesmo IP (dashboard com múltiplos widgets, boot de SPA carregando vários endpoints, NAT de escritório compartilhando IP entre vários usuários simultâneos) pode receber 429 direto do gateway — e, se repetir algumas vezes em 10 minutos, ser banida por 1h via fail2ban. Não exige nenhum ataque, só uso normal mais pesado.

## Impacto

Indisponibilidade percebida (429, depois banimento de IP por 1h) para usuários legítimos em qualquer um dos 7 tenants restantes — mesma classe de incidente já comprovada real no Farmaura, replicada estruturalmente nos outros produtos.

## Pré-condições

Nenhuma além de uso normal de qualquer um dos 7 produtos com uma tela que carregue vários recursos em paralelo — não exige comportamento malicioso.

## Escopo afetado

`nginx/conf.d/20-lumosanalytics-site.conf.template`, `21-lumos-api.conf.template`, `30-lumosmed.conf.template`, `40-lumosneon.conf.template`, `50-michele.conf.template`, `60-thamara.conf.template`, `70-adcrdf.conf.template`, `80-horizon.conf.template`; `fail2ban/jail.local` (jail `nginx-limit-req`).

## Causa raiz

`burst=10` foi o valor default herdado por todos os vhosts na criação do gateway; só o Farmaura recebeu ajuste reativo após um incidente real medido. A zona compartilhada entre tenants (`$binary_remote_addr` sem `$host`) nunca foi revisada como decisão consciente.

## Correção sugerida para análise futura

1. Revisar empiricamente o padrão de paralelismo de cada front-end (nº de chamadas simultâneas na tela mais pesada de cada produto) e ajustar `burst` por vhost — não copiar `burst=40` sem validar, mas `burst=10` está comprovadamente baixo demais para uso real neste ecossistema.
2. Se o isolamento entre tenants for desejado, usar chave composta (`$binary_remote_addr$host`) ou zonas `limit_req_zone` distintas por tenant, em vez de uma única zona compartilhada — hoje não está documentado como decisão consciente manter compartilhado.
3. Considerar excluir o jail `nginx-limit-req` de rotas de asset estático/GET, ou aumentar `maxretry`, para reduzir o acoplamento entre um problema de tuning de rate-limit e banimento real de IP.

## Dependências da correção

Nenhuma migration. Requer teste de carga real (ou monitoramento do padrão de uso real) por tenant antes de calibrar o novo `burst`, para não simplesmente trocar um valor arbitrário por outro.

## Riscos de regressão

Um `burst` alto demais reduz a proteção real contra abuso/DoS — calibrar com base em dado real, não só "aumentar até parar de dar 429".

## Como validar futuramente que a correção funcionou

Monitorar taxa de 429/banimentos fail2ban por tenant antes e depois do ajuste; testar carregando a tela mais pesada de cada produto e confirmar ausência de 429 em uso normal.

## Referências

- `dev-obsidian/farmaura/05_Integracoes_Infra/Lumos_Gateway.md` — incidente real documentado que motivou a correção do Farmaura, usado aqui como precedente.
- [[fail2ban-regras-diversas]] — inclui o mesmo jail `nginx-limit-req` sob outro ângulo.

## Atualizações

- 2026-08-19: achado registrado.
