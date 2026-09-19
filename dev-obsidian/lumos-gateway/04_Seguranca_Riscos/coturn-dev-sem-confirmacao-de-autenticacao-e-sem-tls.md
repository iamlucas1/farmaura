---
cssclasses: ia-nota
---

# Servidor TURN (`lumosmed-turn-dev`) exposto publicamente sem TLS/DTLS, e sem confirmação de onde vive o segredo de autenticação

**Tipo:** Risco identificado (possível abuso de infraestrutura / não totalmente confirmado)
**Status:** POSSÍVEL — existência da exposição é CONFIRMADA; ausência real de autenticação não foi confirmada (ver limitação)
**Severidade:** MÉDIO
**Sistema afetado:** `lumosmed-turn-dev` (`coturn/coturn:latest`) em `lumos-dev` — suporte a telemedicina (WebRTC) do LumosMed
**Categoria:** Exposição de rede / autenticação de serviço de infraestrutura
**Data de identificação:** 2026-09-18

## Descrição

`lumos-dev` roda um container `coturn` (`coturn/coturn:latest`, sem pin de versão) para dar suporte a WebRTC (sinalização de telemedicina, ver `lumos-gateway/02_Documentacao/Visao_Geral.md` do lado LumosMed) — publicado publicamente em `0.0.0.0:3478` (TCP+UDP) e com faixa de relay `min-port=49160`–`max-port=49360`.

Configuração observada em `turnserver.conf` (dentro do container):
```
listening-port=3478
fingerprint
lt-cred-mech
realm=turn.dev.lumosmed.com.br
listening-ip=0.0.0.0
external-ip=<IP público de lumos-dev>
min-port=49160
max-port=49360
stale-nonce
no-cli
no-tls
no-dtls
```

Dois pontos chamam atenção:

1. **`no-tls`/`no-dtls`** — o TURN opera só em modo não-cifrado (`turn:`, não `turns:`). O tráfego de sinalização/relay entre cliente e o próprio servidor TURN não é protegido por TLS/DTLS nessa camada (a mídia em si, se for WebRTC padrão, normalmente já é cifrada via SRTP fim a fim — mas isso não foi confirmado nesta auditoria, que não analisou o código do app cliente).
2. **`lt-cred-mech` está ativo** (mecanismo de credencial de longo prazo, exige usuário+senha para alocar um relay), mas **nem `turnserver.conf` nem as variáveis de ambiente do container mostram onde a credencial é definida** — não há `static-auth-secret` nem `user=` visíveis no arquivo, e a única variável relevante no ambiente do container é `TURN_USERNAME` (um identificador, não um segredo). O padrão mais comum para isso (credencial efêmera via REST, gerada por um segredo compartilhado que vive do lado da aplicação, não do coturn) é plausível, mas não foi confirmado nesta auditoria — não seria apropriado ir atrás do segredo em outros serviços/repos como parte de uma auditoria observacional pontual.

## Evidência

`docker exec lumosmed-turn-dev cat /etc/coturn/turnserver.conf` (conteúdo acima, nenhuma linha com segredo). `docker exec lumosmed-turn-dev env` — só `TURN_USERNAME=lumos-<mascarado>`, nenhuma variável com sufixo `SECRET`/`PASSWORD`/`KEY`. `ss -tulnp` em `lumos-dev` confirma `0.0.0.0:3478` e `[::]:3478` (TCP e UDP) ouvindo publicamente.

Não há um container `coturn`/TURN equivalente em `lumos-prd` (`docker ps` não lista nenhum) — produção aparenta não ter um servidor TURN dedicado documentado, ver observação em [[achados-baixos-e-informativos-auditoria-servidores-2026-09-18]].

## Cenário de risco

Se o mecanismo de credencial de fato não estiver configurado corretamente (hipótese não confirmada), um servidor TURN mal protegido é um alvo clássico de abuso para relay anônimo de tráfego (open relay/proxy), consumindo banda e IP do servidor para fins alheios ao produto. Mesmo com credencial correta, a ausência de TLS/DTLS no canal de controle expõe metadados de sinalização (não necessariamente o conteúdo da mídia) a quem conseguir observar o tráfego de rede.

## Impacto

Se confirmado que a autenticação não está de fato ativa: abuso de banda/relay por terceiros, possível uso do servidor como proxy para tráfego malicioso originado do IP de `lumos-dev`. Se a autenticação estiver corretamente configurada em outro lugar (hipótese mais provável): impacto limitado à ausência de TLS/DTLS no canal de controle.

## Pré-condições

Acesso à porta pública `3478` — já satisfeita, é pública por design (TURN precisa ser alcançável de qualquer rede para funcionar).

## Escopo afetado

Container `lumosmed-turn-dev` em `lumos-dev`; possivelmente o serviço que gera as credenciais efêmeras (não localizado nesta auditoria).

## Causa raiz

Não determinada — requer localizar, num próximo passo, onde a aplicação (Laravel `lumosmed/` ou `lumos-api`) gera as credenciais que o cliente usa para autenticar contra este TURN, para confirmar que o mecanismo está de fato ativo e não é um "`lt-cred-mech` sem base de credencial nenhuma".

## Correção sugerida para análise futura

1. Localizar no código (`lumosmed/`/`lumos-api/domains/lumosmed/`) onde a credencial TURN é gerada/enviada ao cliente, e confirmar que corresponde a um `static-auth-secret` real configurado em algum lugar (arquivo montado, segredo do orquestrador, etc.) — não apenas assumir.
2. Se confirmado que não há segredo nenhum de fato ativo, configurar `static-auth-secret` (ou uma base de usuários) imediatamente.
3. Avaliar habilitar TLS/DTLS (`no-tls`/`no-dtls` → configurar certificado, já existente no servidor via Let's Encrypt) para o canal de controle do TURN, mesmo que a mídia já seja cifrada via SRTP.
4. Fixar a versão da imagem `coturn/coturn` (hoje `:latest`, mesmo padrão de risco já documentado em [[supply-chain-e-hardening-diversos]] para `certbot`/`fail2ban`).
5. Esclarecer/decidir formalmente se produção deveria ter seu próprio TURN (hoje aparenta não ter, ver achado relacionado).

## Dependências da correção

Nenhuma migration; depende de localizar o código gerador de credencial antes de decidir se há algo a corrigir de fato.

## Riscos de regressão

Baixo para a investigação; mudar `no-tls`/`no-dtls` exige testar chamadas de telemedicina reais em `lumos-dev` antes de considerar replicar para produção.

## Como validar futuramente que a correção funcionou

Confirmar via código e/ou teste funcional (em `lumos-dev`, nunca produção) que uma tentativa de alocar um relay TURN sem credencial válida é rejeitada; `turnserver.conf` deve mostrar `static-auth-secret` ou base de usuários explícita.

## Referências

- [[supply-chain-e-hardening-diversos]] — mesmo padrão de imagem `:latest` sem pin.
- [[achados-baixos-e-informativos-auditoria-servidores-2026-09-18]] — nota sobre ausência de TURN equivalente em produção.
- [[auditoria-servidores-2026-09-18-resumo-consolidado]] — visão consolidada desta rodada de auditoria.

## Atualizações

- 2026-09-18: achado registrado.
