---
cssclasses: ia-nota
---

# SDK/protocolo oficial da Itaú para a maquininha (integração PDV) ainda não obtido

**Status:** Bloqueado
**Prioridade:** Alta
**Registrado em:** 2026-09-17

## Descrição

A integração do PDV com a maquininha Itaú (Pix/débito/crédito via cabo USB) foi construída de ponta a ponta — agente local `farmaura-pdv-bridge/`, backend (`payment_terminal_reference` em `pdv_sales`), UI de cobrança no PDV — mas usando um **driver simulado** (`src/drivers/simulated-driver.js`), porque ainda não temos a documentação/SDK oficial da Itaú para essa maquininha (driver USB, protocolo de comandos, formato real do payload Pix/BR Code, como ler aprovação/recusa de cartão).

Falta: obter esse material junto à Itaú (geralmente via gerente de conta PJ ou o portal de desenvolvedores do banco) e então escrever `src/drivers/itau-usb-driver.js` implementando o mesmo contrato documentado em `src/drivers/driver-interface.js` — nenhuma outra parte do sistema (servidor do agente, backend, frontend do PDV) deve precisar mudar para isso.

## Contexto

Decisão tomada em conjunto com o usuário em 2026-09-17: como o SDK não estava disponível, construir o fluxo inteiro já pronto com um driver simulado trocável, em vez de esperar o SDK para começar qualquer trabalho. Ver [[../00_Decisoes/2026-09-17-integracao-maquininha-itau-via-agente-usb-local|ADR completo]].

**Importante:** enquanto esta pendência não for resolvida, a integração é apenas uma demonstração funcional — nenhuma cobrança real é enviada a uma maquininha física. Não usar em produção/com clientes reais até o driver real substituir o simulado.