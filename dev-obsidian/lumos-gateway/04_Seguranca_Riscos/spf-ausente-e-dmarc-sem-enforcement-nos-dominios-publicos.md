---
cssclasses: ia-nota
---

# SPF ausente em `drogariafarmaura.com.br` e DMARC sem enforcement (`p=none`) em `lumosmed.com.br` — domínios vulneráveis a spoofing de e-mail

**Tipo:** Risco identificado (perímetro de domínio / phishing)
**Status:** CONFIRMADO
**Severidade:** MÉDIO
**Sistema afetado:** DNS público de `drogariafarmaura.com.br` (e subdomínio `dev.drogariafarmaura.com.br`) e `lumosmed.com.br`
**Categoria:** Exposição de perímetro público / anti-phishing
**Data de identificação:** 2026-09-18

## Descrição

Consulta DNS pública (leitura passiva, mesma que qualquer cliente de e-mail faz) aos registros TXT de SPF e DMARC dos dois domínios principais do ecossistema:

- **`drogariafarmaura.com.br`**: nenhum registro SPF (`TXT` na raiz do domínio) e nenhum registro `_dmarc.drogariafarmaura.com.br` — **nenhuma das duas proteções existe**. Mesmo resultado vazio em `dev.drogariafarmaura.com.br`.
- **`lumosmed.com.br`**: SPF presente (`v=spf1 include:_spf.mail.hostinger.com ~all`) e DMARC presente, mas com **`p=none`** — a política DMARC existe só em modo de monitoramento, sem instruir provedores de e-mail a rejeitar/colocar em quarentena mensagens que falhem a checagem. Na prática, `p=none` não impede nenhum spoofing — só habilita relatórios (se `rua=`/`ruf=` estivessem configurados, o que não foi confirmado nesta checagem).

Isso é diretamente relevante ao controle "Aviso anti-phishing ao usuário" já documentado como regra em `claude.md`/`agent.md` (2026-07-20, ver [[../../_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste|padrao-ataques-defesas-e-limites-de-teste]]) — SPF/DMARC são a camada de proteção do **lado do domínio** que complementa esse aviso: sem eles, um atacante pode enviar e-mail que aparenta vir de `contato@drogariafarmaura.com.br` (farmácia com clientes reais, dado de saúde/receita médica envolvido) para qualquer destinatário, e a maioria dos provedores de e-mail vai entregá-lo normalmente por falta de sinal de rejeição.

## Evidência

```
$ dig +short TXT drogariafarmaura.com.br | grep -i spf
(vazio)
$ dig +short TXT _dmarc.drogariafarmaura.com.br
(vazio)

$ dig +short TXT lumosmed.com.br | grep -i spf
"v=spf1 include:_spf.mail.hostinger.com ~all"
$ dig +short TXT _dmarc.lumosmed.com.br
"v=DMARC1; p=none"
```

Consulta feita via `dig` público, sem nenhum envio de e-mail nem interação com os servidores de aplicação — leitura de registro DNS público, equivalente ao que qualquer cliente de e-mail já consulta antes de aceitar uma mensagem.

## Cenário de risco

Um atacante registra/usa um servidor SMTP qualquer e envia e-mail com `From: suporte@drogariafarmaura.com.br` (ou `@lumosmed.com.br`) para um cliente real, simulando uma cobrança, um alerta de conta, ou um pedido de dado sensível (exatamente o cenário que o controle "aviso anti-phishing" tenta mitigar do lado do conteúdo do e-mail). Sem SPF nem DMARC com enforcement, a maioria dos provedores de e-mail de destino (Gmail, Outlook, etc.) não tem sinal técnico para rejeitar essa mensagem — ela chega normalmente à caixa de entrada do cliente, com o remetente aparentando legítimo.

## Impacto

Phishing direcionado a clientes reais (Farmaura tem clientes finais comprando remédios, incluindo fluxo de receita médica; LumosMed lida com dado de saúde de pacientes) usando o nome de domínio real da empresa, sem nenhuma barreira técnica do lado do domínio. Dano reputacional e de confiança do cliente em caso de campanha de phishing bem-sucedida usando o domínio real.

## Pré-condições

Nenhuma — é uma checagem de configuração de domínio público, não depende de nenhuma ação prévia de um atacante.

## Escopo afetado

Zona DNS de `drogariafarmaura.com.br` (registro SPF ausente, DMARC ausente) e `lumosmed.com.br` (DMARC sem enforcement). Não verificado para os demais domínios do ecossistema (`adcrdf.com.br`, `drathamaravasconcelos.com.br`, `cursocompany.app.br`) — recomenda-se a mesma checagem para todos antes de considerar o levantamento completo.

## Causa raiz

Configuração de DNS de e-mail nunca endurecida para `drogariafarmaura.com.br` (nenhum registro criado); para `lumosmed.com.br`, DMARC foi criado mas deixado no modo de rollout inicial (`p=none`) e aparentemente nunca promovido para `quarantine`/`reject` depois do período de observação recomendado.

## Correção sugerida para análise futura

1. **`drogariafarmaura.com.br`**: criar um registro SPF (`v=spf1 include:<provedor de e-mail real> ~all` ou `-all`) e um registro DMARC inicial em modo `p=none` com `rua=` apontando para um endereço de monitoramento, para começar a coletar dados antes de enforcement.
2. **`lumosmed.com.br`**: depois de confirmar (via os relatórios `rua`, se configurados, ou por um período de observação) que o e-mail legítimo da empresa passa consistentemente em SPF/DKIM, promover a política para `p=quarantine` e depois `p=reject`.
3. Confirmar também a existência de DKIM para os dois domínios (não verificado nesta checagem — exigiria conhecer o seletor DKIM usado pelo provedor de e-mail).
4. Repetir a mesma checagem (SPF/DMARC/DKIM) para os demais domínios do ecossistema hospedados no mesmo gateway.

## Dependências da correção

Nenhuma mudança de infraestrutura do lado do gateway/servidor — é só configuração de DNS, feita no provedor de domínio (fora do escopo de `lumos-gateway`/servidores). Depende de identificar corretamente o provedor de e-mail real usado por `drogariafarmaura.com.br` para montar o SPF certo (evitar `~all`/`-all` sem incluir o provedor correto, o que quebraria entrega de e-mail legítimo).

## Riscos de regressão

Se o SPF for configurado incorretamente (sem incluir todos os remetentes legítimos), e-mails legítimos da empresa podem passar a ser marcados como spam/rejeitados — testar com `-all` só depois de confirmar todos os remetentes reais via os relatórios DMARC (`rua`).

## Como validar futuramente que a correção funcionou

`dig +short TXT drogariafarmaura.com.br` deve retornar um registro `v=spf1`; `dig +short TXT _dmarc.drogariafarmaura.com.br` e `_dmarc.lumosmed.com.br` devem mostrar `p=quarantine` ou `p=reject` (não `none`) depois do período de observação. Ferramentas públicas de verificação de DMARC/SPF (ex.: MXToolbox) podem confirmar sem enviar e-mail nenhum.

## Referências

- [[../../_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste|padrao-ataques-defesas-e-limites-de-teste]] — controle "aviso anti-phishing" que este achado complementa do lado do domínio.
- [[csp-ausente-em-todos-os-vhosts]] — outro achado de perímetro público confirmado ao vivo na mesma checagem (CSP continua ausente em `drogariafarmaura.com.br`/`dev.drogariafarmaura.com.br`, headers de resposta reconferidos nesta rodada).
- [[auditoria-servidores-2026-09-18-resumo-consolidado]] — visão consolidada desta rodada de auditoria.

## Atualizações

- 2026-09-18: achado registrado, a partir de checagem DNS pública passiva (sem envio de e-mail nem interação com servidores de aplicação).
