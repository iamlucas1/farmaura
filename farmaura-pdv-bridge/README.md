# Farmaura PDV Bridge

Agente local que roda no PC do caixa e faz a ponte entre o PDV do Farmaura
(a tela que roda no navegador) e a maquininha Itaú conectada por cabo USB
naquele computador. O navegador não consegue falar diretamente com um
dispositivo USB arbitrário — por isso este pequeno serviço fica sempre rodando
em segundo plano, e o navegador conversa com ele por HTTP em `127.0.0.1`.

**Estado atual: o driver da maquininha é simulado.** Ainda não temos o SDK/
protocolo oficial da Itaú para essa integração — este agente já está pronto de
ponta a ponta (servidor, autenticação, contrato de driver, frontend do PDV),
só falta trocar `src/drivers/simulated-driver.js` por uma implementação real
(`src/drivers/itau-usb-driver.js`, seguindo o mesmo contrato descrito em
`src/drivers/driver-interface.js`) assim que a Itaú fornecer a documentação.

## Requisitos

- Node.js 18 ou mais recente instalado no PC do caixa (sem outras dependências
  — este agente não usa nenhum pacote de terceiros de propósito, para instalar
  fosse só copiar a pasta e rodar).

## Como rodar

```
node bin/farmaura-pdv-bridge.js
```

Na primeira execução, ele cria `~/.farmaura-pdv-bridge/config.json` com uma
porta (padrão `8734`) e um token aleatório, e imprime esse token no terminal.
Copie esse token para o sistema interno do Farmaura, em **Configurações >
Maquininha**, nesse mesmo computador — é o que autentica o PDV contra este
agente (mais detalhes de segurança abaixo).

Para deixar rodando sempre que o PC ligar, configure-o para iniciar junto com
o sistema operacional (por exemplo, um atalho na pasta Inicializar do Windows,
ou um serviço via Agendador de Tarefas/`nssm`). Isso fica a cargo de quem
instala em cada loja — não está automatizado neste pacote ainda.

## Segurança

Este agente escuta apenas em `127.0.0.1` (não é acessível pela rede). Ainda
assim, qualquer processo rodando no mesmo PC poderia tentar chamá-lo — por
isso:

- toda rota (exceto `/health`) exige o header `X-Bridge-Token` batendo com o
  token gerado em `~/.farmaura-pdv-bridge/config.json`;
- CORS é restrito à lista `allowedOrigins` desse mesmo arquivo (por padrão,
  só `http://localhost:3000` — adicione o domínio de produção do Farmaura
  quando for usar este agente com o sistema publicado).

Isso é suficiente para um agente local de hardware sem exposição à internet,
mas deve ser revisto quando a integração real com a Itaú chegar, seguindo
qualquer requisito de segurança que o SDK deles exija.

## Ver também

- `dev-obsidian/farmaura/00_Decisoes/` — ADR desta integração (arquitetura,
  por que um agente local, o que falta para virar integração real).
- `dev-obsidian/farmaura/07_POPs_Processos/` — POP de instalação em uma loja.
