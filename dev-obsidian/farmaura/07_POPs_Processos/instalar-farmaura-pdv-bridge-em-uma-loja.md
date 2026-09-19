---
cssclasses: ia-nota
---

# Instalar o farmaura-pdv-bridge em um PC de caixa

## Quando usar

Ao configurar um novo computador de caixa que vai processar pagamentos pela maquininha Itaú integrada ao PDV (Pix/débito/crédito), ou ao trocar/reinstalar o PC de um caixa já existente. Ver [[../00_Decisoes/2026-09-17-integracao-maquininha-itau-via-agente-usb-local|ADR da integração]] para o porquê da arquitetura.

## Passos

1. Instalar Node.js 18+ no PC do caixa (é a única dependência — o agente em si não usa pacotes de terceiros).
2. Copiar a pasta `farmaura-pdv-bridge/` (deste repositório) para o PC do caixa.
3. Rodar `node bin/farmaura-pdv-bridge.js` uma vez manualmente para confirmar que sobe sem erro. Na primeira execução ele:
   - cria `~/.farmaura-pdv-bridge/config.json` com uma porta padrão (`8734`) e um token aleatório;
   - imprime esse token no terminal.
4. Abrir o sistema interno do Farmaura nesse mesmo PC, ir na tela do caixa do PDV, clicar no selo "Maquininha não encontrada"/"Maquininha conectada" ao lado de "Pagamento", e colar o token impresso no passo 3 (endereço padrão `http://127.0.0.1:8734` já vem preenchido). Salvar.
5. Confirmar que o selo muda para "Maquininha conectada".
6. Configurar o agente para iniciar junto com o sistema operacional (ex: atalho na pasta Inicializar do Windows, ou Agendador de Tarefas/`nssm` como serviço) — sem isso, o agente para de rodar quando o PC reinicia e o caixa perde a integração até alguém subir manualmente de novo.
7. Se a loja usa o domínio de produção do Farmaura (não `localhost:3000`), adicionar esse domínio em `allowedOrigins` dentro de `~/.farmaura-pdv-bridge/config.json` antes do passo 4 — por padrão só `http://localhost:3000` é aceito pelo CORS do agente.

## Responsável

Quem faz o setup de TI/infra de cada loja no momento da abertura ou troca de equipamento.

## Riscos se pulado

- Sem o passo 6: o caixa perde a integração a cada reinício do PC (sem aviso além do selo "Maquininha não encontrada" no PDV), voltando a precisar operar a maquininha manualmente fora do sistema.
- Sem o passo 7 num PC de produção: toda cobrança falha com erro de CORS, mesmo com o agente rodando e o token certo.

## Atualizações

- 2026-09-17: POP criado junto com a integração inicial (driver ainda simulado — ver ADR).