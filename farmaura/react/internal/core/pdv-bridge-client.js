/*
farmaura/react/internal/core/pdv-bridge-client.js

Cliente do "Farmaura PDV Bridge" — o agente local (farmaura-pdv-bridge/, um
processo Node à parte) que roda no próprio PC do caixa e faz a ponte USB até a
maquininha Itaú. Este módulo só fala HTTP com 127.0.0.1; farmaura-api nunca
entra nesse caminho porque o servidor central não tem acesso ao USB de cada
loja — só o navegador, rodando fisicamente naquele computador, tem.

Configuração (endereço/token do bridge) fica em localStorage porque é por PC,
não por conta/tenant — cada caixa aponta para o agente rodando ali do lado.
*/

const STORAGE_KEY = "farmaura_pdv_bridge_config";
const DEFAULT_BASE_URL = "http://127.0.0.1:8734";

function getBridgeConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { baseUrl: parsed.baseUrl || DEFAULT_BASE_URL, token: parsed.token || "" };
  } catch (error) {
    return { baseUrl: DEFAULT_BASE_URL, token: "" };
  }
}

function setBridgeConfig({ baseUrl, token }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ baseUrl: baseUrl || DEFAULT_BASE_URL, token: token || "" }));
  } catch (error) { /* localStorage indisponível — segue sem persistir */ }
}

async function bridgeRequest(path, options = {}) {
  const { baseUrl, token } = getBridgeConfig();
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Bridge-Token": token, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || ("Maquininha respondeu " + response.status));
  }
  return response.json();
}

/* Usado para o indicador de conexão — não exige token, então distingue "agente
   fora do ar" de "agente no ar, token errado" (esse segundo caso só aparece ao
   tentar cobrar de verdade). */
async function pdvBridgeHealth() {
  const { baseUrl } = getBridgeConfig();
  try {
    const response = await fetch(baseUrl + "/health", { method: "GET" });
    if (!response.ok) return { ok: false };
    return await response.json();
  } catch (error) {
    return { ok: false };
  }
}

async function pdvBridgeCharge({ method, amountCents, reference }) {
  return bridgeRequest("/charges", { method: "POST", body: JSON.stringify({ method, amountCents, reference }) });
}

async function pdvBridgeGetCharge(chargeId) {
  return bridgeRequest("/charges/" + encodeURIComponent(chargeId), { method: "GET" });
}

async function pdvBridgeCancelCharge(chargeId) {
  return bridgeRequest("/charges/" + encodeURIComponent(chargeId) + "/cancel", { method: "POST" });
}

export { getBridgeConfig, setBridgeConfig, pdvBridgeHealth, pdvBridgeCharge, pdvBridgeGetCharge, pdvBridgeCancelCharge };
