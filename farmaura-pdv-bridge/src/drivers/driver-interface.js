/*
farmaura-pdv-bridge/src/drivers/driver-interface.js

Contract every terminal driver must implement. `simulated-driver.js` is the only
implementation today (no Itaú SDK yet) — a real `itau-usb-driver.js` implementing
this same shape is the only file that needs to change once the SDK is available;
server.js and everything above it is already written against this interface.

A driver instance must expose:

  charge({ method, amountCents, reference }) -> string chargeId
    Starts a new charge on the terminal for one of "pix" | "debit" | "credit".
    Must return quickly with a chargeId — the actual terminal interaction (card
    insert, PIN entry, PIX QR scan) happens asynchronously and is observed by
    polling getCharge(chargeId).

  getCharge(chargeId) -> {
    status: "pending" | "awaiting_card" | "qr_ready" | "approved" | "declined" | "cancelled" | "error",
    qrCodeText?: string,   // pix only, once status is "qr_ready" or later — the copia-e-cola payload
    nsu?: string,          // once status is "approved" — terminal's transaction reference
    authCode?: string,     // once status is "approved", card methods only
    errorMessage?: string, // once status is "error" or "declined"
  }
    Throws (or the server layer 404s) if chargeId is unknown.

  cancelCharge(chargeId) -> void
    Aborts a pending charge (operator cancelled, or the UI gave up waiting).
*/

module.exports = {};
