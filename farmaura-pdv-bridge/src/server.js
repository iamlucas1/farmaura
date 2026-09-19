/*
farmaura-pdv-bridge/src/server.js

Local HTTP bridge between the Farmaura PDV (a web page, running in the browser
at localhost:3000 or the production domain) and the Itaú card/PIX terminal
plugged into this PC via USB. A browser page cannot talk to an arbitrary USB
device directly — this small always-running local service is what actually
would drive the terminal SDK, and the browser just calls it over HTTP on
127.0.0.1.

Routes:
  GET  /health              -> { ok: true, driver } — no token required, so the
                                frontend can tell "bridge not running" apart
                                from "bridge running, wrong token".
  POST /charges             -> { method, amountCents, reference } -> { chargeId }
  GET  /charges/:id         -> driver.getCharge(id)
  POST /charges/:id/cancel  -> { ok: true }

Every route but /health requires header `X-Bridge-Token` to match the token in
~/.farmaura-pdv-bridge/config.json (see config.js) — that, plus strict CORS
(only the configured allowedOrigins get a response), is the whole security
model for v1: a local hardware bridge with no internet exposure. Revisit this
once the real Itaú SDK/terminal comes with its own security requirements.
*/

const http = require("http");

const { loadConfig } = require("./config");
const { createSimulatedDriver } = require("./drivers/simulated-driver");

function createDriver(config) {
  // Único driver disponível hoje. Quando o SDK da Itaú chegar, um novo
  // "itau-usb-driver.js" implementando o mesmo contrato (driver-interface.js)
  // entra aqui — nada mais neste arquivo precisa mudar.
  if (config.driver === "simulated") return createSimulatedDriver();
  throw new Error("Driver desconhecido: " + config.driver);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function applyCors(req, res, config) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token");
}

function startServer() {
  const config = loadConfig();
  const driver = createDriver(config);

  const server = http.createServer(async (req, res) => {
    applyCors(req, res, config);
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, driver: driver.name });
      return;
    }

    const token = req.headers["x-bridge-token"];
    if (token !== config.token) {
      sendJson(res, 401, { error: "Token inválido — confira em Configurações > Maquininha." });
      return;
    }

    try {
      if (req.method === "POST" && url.pathname === "/charges") {
        const body = await readJsonBody(req);
        if (!["pix", "debit", "credit"].includes(body.method)) {
          sendJson(res, 400, { error: "method deve ser pix, debit ou credit." });
          return;
        }
        const amountCents = Number(body.amountCents);
        if (!Number.isInteger(amountCents) || amountCents <= 0) {
          sendJson(res, 400, { error: "amountCents deve ser um inteiro positivo." });
          return;
        }
        const chargeId = driver.charge({ method: body.method, amountCents, reference: String(body.reference || "") });
        sendJson(res, 201, { chargeId });
        return;
      }

      const chargeMatch = url.pathname.match(/^\/charges\/([^/]+)$/);
      if (req.method === "GET" && chargeMatch) {
        const state = driver.getCharge(chargeMatch[1]);
        if (!state) { sendJson(res, 404, { error: "Cobrança não encontrada." }); return; }
        sendJson(res, 200, state);
        return;
      }

      const cancelMatch = url.pathname.match(/^\/charges\/([^/]+)\/cancel$/);
      if (req.method === "POST" && cancelMatch) {
        driver.cancelCharge(cancelMatch[1]);
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { error: "Rota não encontrada." });
    } catch (error) {
      sendJson(res, 500, { error: error && error.message ? error.message : "Erro interno do bridge." });
    }
  });

  server.listen(config.port, "127.0.0.1", () => {
    console.log("Farmaura PDV Bridge rodando em http://127.0.0.1:" + config.port);
    console.log("Driver ativo: " + driver.name);
    console.log("Token (copie em Configurações > Maquininha no sistema interno): " + config.token);
  });

  return server;
}

module.exports = { startServer };
