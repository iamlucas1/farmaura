---
cssclasses: ia-nota
---

# 2026-09-17 — Integração com a maquininha Itaú (USB): agente local + driver simulado

## Contexto

Pedido do usuário: no PDV, o pagamento via Pix/débito/crédito deveria ser enviado de verdade para a maquininha Itaú conectada por cabo USB no PC do caixa — Pix gerando o QR na tela, débito/crédito enviando o valor direto para a maquininha, "tudo via sistema".

Levantamento antes de codar (ver [[../06_Pendencias/|Pendências]] — nada existia sobre isso no cofre):
- Hoje o pagamento no PDV é só decorativo: o caixa escolhe um método (`PAY_METHODS` em `point-of-sale-screen.jsx`) e clica em "Gerar nota fiscal", que chama `recordSale` → `POST /pdv/orders/{id}/complete` direto — nenhuma cobrança real acontece pelo sistema; a maquininha é operada manualmente ao lado, fora do fluxo.
- Perguntei ao usuário três coisas antes de implementar, porque cada resposta muda a arquitetura:
  1. **SDK/protocolo oficial da Itaú para essa maquininha**: não existe ainda — a Itaú não forneceu documentação.
  2. **Como o navegador chegaria ao USB**: o PDV roda como SPA React no navegador; JS de página não fala com um dispositivo USB arbitrário (WebUSB/WebHID não cobrem terminais de pagamento bancários e não seria apropriado tentar). O usuário confirmou que quer instalar um agente local no PC do caixa para fazer essa ponte.
  3. **Como avançar sem o SDK**: construir o fluxo completo (backend + frontend + agente local) já pronto de ponta a ponta, com um driver simulado no lugar do SDK real — trocável depois sem mexer em mais nada.

## Decisão

### Arquitetura: three-tier — navegador → agente local (USB) → farmaura-api (registro)

```
[PDV no navegador] --HTTP local (127.0.0.1)--> [farmaura-pdv-bridge, Node, no PC do caixa] --(futuro: SDK Itaú)--> [maquininha via USB]
        |
        `--HTTP-------------------------------> [farmaura-api] -- grava o resultado (NSU/authCode) na venda
```

`farmaura-api` (servidor central) **nunca** fala com a maquininha — ele não tem acesso físico ao USB de cada loja. Só o navegador, rodando fisicamente naquele PC, tem como alcançar um processo em `127.0.0.1`. Por isso o desenho é: o navegador dispara a cobrança direto no agente local; só depois de aprovada é que o resultado (NSU) é enviado ao backend junto com o resto da venda, exatamente no mesmo `POST /pdv/orders/{id}/complete` que já existia.

### `farmaura-pdv-bridge/` — novo projeto standalone, um processo por PC de caixa

Node.js puro, **sem nenhuma dependência de terceiros** (só módulos nativos `http`/`crypto`/`fs`/`os`) — decisão deliberada para minimizar o que precisa ser instalado em cada loja: copiar a pasta e `node bin/farmaura-pdv-bridge.js` já roda, sem `npm install`.

- `src/drivers/driver-interface.js` documenta o contrato (`charge`, `getCharge`, `cancelCharge`) que qualquer driver deve implementar.
- `src/drivers/simulated-driver.js` é a única implementação hoje — simula os estados reais de uma cobrança (pix: `pending → qr_ready → approved`; débito/crédito: `pending → awaiting_card → approved|declined`) com atrasos realistas, para o fluxo inteiro (UI, polling, modal, emissão de nota) já poder ser testado e usado de verdade em desenvolvimento.
- `src/server.js`: HTTP puro, roteia `GET /health`, `POST /charges`, `GET /charges/:id`, `POST /charges/:id/cancel`.
- **Quando a Itaú fornecer o SDK real**: só entra um novo `src/drivers/itau-usb-driver.js` implementando o mesmo contrato — nada em `server.js` ou no frontend muda.

### Segurança do agente local (v1, revisar quando o SDK real chegar)

Escuta só em `127.0.0.1` (nunca exposto à rede). Mesmo assim, qualquer processo/página aberta no mesmo PC poderia tentar chamá-lo — mitigado com:
- token aleatório gerado na primeira execução (`~/.farmaura-pdv-bridge/config.json`), exigido em toda rota exceto `/health`;
- CORS restrito à lista `allowedOrigins` desse mesmo arquivo (por padrão só `http://localhost:3000`).

Isso é proporcional para um agente local sem exposição à internet, mas deve ser revisado à luz de qualquer requisito de segurança que o SDK da Itaú venha a exigir.

### Backend (`farmaura-api`)

- `PdvSale.payment_terminal_reference` (novo campo, `String(64)`, vazio para `cash`) guarda o NSU/authCode retornado pela maquininha (ou pelo chargeId simulado), para reconciliação futura contra o extrato da própria maquininha/Itaú. Migração `20260917_01_pdv_sale_terminal_reference`.
- `PdvSaleCreateRequest.payment_terminal_reference` (schema) e `complete_sale()` (`pdv_service.py`) passam esse valor adiante; incluído também em `PdvSaleResponse`/`list_sales`.

### Frontend (`point-of-sale-screen.jsx` + novo `pdv-bridge-client.js`)

- Cliente HTTP simples (`pdv-bridge-client.js`) fala com o agente local; endereço/token ficam em `localStorage` (configuração por PC, não por conta — cada caixa aponta para o agente rodando ali do lado), editável por uma modal nova (`PdvBridgeSettingsModal`, acessível pelo selo de status ao lado de "Pagamento").
- Selo de conectividade ("Maquininha conectada"/"Maquininha não encontrada") faz polling de `/health` a cada 5s enquanto a tela do caixa está aberta — sem exigir token, então distingue "agente fora do ar" de "agente no ar, token errado".
- Botão "Gerar nota fiscal" virou condicional: com `pay === "cash"` continua idêntico (emite direto); com pix/débito/crédito vira "Cobrar na maquininha", que dispara `POST /charges` no agente e abre `PdvTerminalChargeModal`, fazendo polling de `GET /charges/:id` a cada 1s até um estado final.
- `PdvTerminalChargeModal` renderiza o QR do Pix como imagem real e escaneável (biblioteca `qrcode`, já usada no 2FA — `QRCode.toDataURL`, não o `QrPlaceholder` decorativo que já existia no arquivo, que é só um enfeite visual sem payload de verdade) mais o código copia-e-cola; para débito/crédito, mostra "insira/aproxime o cartão". Ao aprovar, chama `emit()` automaticamente com o NSU/authCode, que segue para `recordSale` → backend.

## Consequências

- Testado de ponta a ponta em Chrome headless com o agente local rodando de verdade (não mockado no navegador): fluxo farmacêutico → fila → caixa → cobrança Pix (QR real, aprovação simulada após alguns segundos, nota emitida) e cobrança crédito (estado "aguardando cartão", aprovação, nota emitida) — em ambos os casos confirmado no banco que `pdv_sales.payment_terminal_reference` foi gravado com o NSU simulado.
- **O que falta para virar integração real**: só e exclusivamente o SDK/protocolo oficial da Itaú, para escrever `itau-usb-driver.js`. Todo o resto (agente, servidor, contrato, backend, UI, persistência) já está pronto e não deve precisar mudar.
- Trade-off aceito conscientemente: pagamento em dinheiro (`cash`) continua sem nenhuma integração — não existe "maquininha" para dinheiro, então o botão continua emitindo a nota direto, sem passar pelo bridge.

## Ver também

- `farmaura-pdv-bridge/README.md` — como instalar/rodar o agente num PC de caixa.
- [[../07_POPs_Processos/instalar-farmaura-pdv-bridge-em-uma-loja]] — POP de instalação.
- [[../06_Pendencias/sdk-itau-maquininha-pendente]] — pendência do SDK real da Itaú.