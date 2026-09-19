/*
farmaura-pdv-bridge/src/drivers/simulated-driver.js

Fake terminal driver — stands in for the real Itaú USB SDK, which we don't have
yet. Implements the same shape described in driver-interface.js so the rest of
the bridge (and the Farmaura frontend) can be built and tested end-to-end now,
and only this file gets replaced once Itaú provides real integration docs.

Behavior it simulates:
- pix: "pending" -> (~400ms) "qr_ready" with a fake copia-e-cola payload -> (~4-8s,
  as if the customer scanned and paid) "approved" with a fake NSU.
- debit/credit: "pending" -> (~500ms) "awaiting_card" -> (~3-6s, as if the card
  was inserted/approximated and the PIN typed) "approved" (90%) or "declined" (10%).
*/

const crypto = require("crypto");

function randomDigits(len) {
  let out = "";
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
}

function fakePixPayload(amountCents, reference) {
  // Não é um payload BR Code EMV real (não temos a chave PIX/SDK do Itaú ainda) — só
  // precisa parecer um payload de pix para validar o fluxo de QR ponta a ponta.
  return "00020126SIMULADO-FARMAURA-BRIDGE" + amountCents + "-" + (reference || randomDigits(8)) + "5204000053039865802BR6009SIMULADO";
}

function createSimulatedDriver() {
  const charges = new Map();

  function schedule(chargeId, delayMs, fn) {
    const charge = charges.get(chargeId);
    if (!charge) return;
    const timer = setTimeout(() => {
      if (charges.get(chargeId) !== charge || charge.status === "cancelled") return;
      fn(charge);
    }, delayMs);
    charge.timers.push(timer);
  }

  function charge({ method, amountCents, reference }) {
    const chargeId = crypto.randomUUID();
    const record = { id: chargeId, method, amountCents, reference, status: "pending", timers: [] };
    charges.set(chargeId, record);

    if (method === "pix") {
      schedule(chargeId, 400, (c) => {
        c.status = "qr_ready";
        c.qrCodeText = fakePixPayload(amountCents, reference);
      });
      schedule(chargeId, 400 + 4000 + Math.random() * 4000, (c) => {
        c.status = "approved";
        c.nsu = randomDigits(6);
      });
    } else {
      schedule(chargeId, 500, (c) => { c.status = "awaiting_card"; });
      schedule(chargeId, 500 + 3000 + Math.random() * 3000, (c) => {
        const approved = Math.random() > 0.1;
        c.status = approved ? "approved" : "declined";
        if (approved) {
          c.nsu = randomDigits(6);
          c.authCode = randomDigits(6);
        } else {
          c.errorMessage = "Cartão recusado pela operadora (simulado).";
        }
      });
    }
    return chargeId;
  }

  function getCharge(chargeId) {
    const c = charges.get(chargeId);
    if (!c) return null;
    return {
      status: c.status,
      qrCodeText: c.qrCodeText,
      nsu: c.nsu,
      authCode: c.authCode,
      errorMessage: c.errorMessage,
    };
  }

  function cancelCharge(chargeId) {
    const c = charges.get(chargeId);
    if (!c) return;
    c.timers.forEach(clearTimeout);
    c.status = "cancelled";
  }

  return { name: "simulated", charge, getCharge, cancelCharge };
}

module.exports = { createSimulatedDriver };
