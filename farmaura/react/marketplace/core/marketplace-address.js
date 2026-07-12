/*
farmaura/react/marketplace/core/marketplace-address.js

Marketplace address helpers for Farmaura.

Responsibilities:
- normalize marketplace address records into a consistent structure;
- provide CEP masking and ViaCEP lookup helpers for forms;
- format address fragments for display across marketplace screens;

Observations:
- legacy addresses may still contain city and state merged into a single city field;
- ViaCEP fills public street, district, city, and state data but never house number or complement;
*/

const CEP_LENGTH = 8;

function digitsOnly(value) {
  /** Return only numeric characters from the provided value. */

  return String(value || "").replace(/\D/g, "");
}

function formatCep(value) {
  /** Format a CEP value as 00000-000 while preserving partial input. */

  const digits = digitsOnly(value).slice(0, CEP_LENGTH);
  if (digits.length <= 5) {
    return digits;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function splitCityState(value) {
  /** Split a legacy city field that may contain Cidade — UF or Cidade - UF. */

  const raw = String(value || "").trim();
  if (!raw) {
    return { city: "", state: "" };
  }

  const emDashParts = raw.split("—").map((part) => part.trim()).filter(Boolean);
  if (emDashParts.length >= 2) {
    return { city: emDashParts[0], state: emDashParts[1].slice(0, 2).toUpperCase() };
  }

  const hyphenParts = raw.split("-").map((part) => part.trim()).filter(Boolean);
  if (hyphenParts.length >= 2 && hyphenParts[hyphenParts.length - 1].length <= 2) {
    return { city: hyphenParts.slice(0, -1).join(" - "), state: hyphenParts[hyphenParts.length - 1].slice(0, 2).toUpperCase() };
  }

  return { city: raw, state: "" };
}

function createEmptyAddress() {
  /** Return a blank marketplace address shape. */

  return {
    label: "Casa",
    cep: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
  };
}

function normalizeAddress(value) {
  /** Normalize marketplace address data, including legacy flat fields. */

  const base = createEmptyAddress();
  const cityState = splitCityState(value && value.city);

  return {
    ...base,
    ...(value || {}),
    label: value && value.label ? String(value.label) : base.label,
    cep: formatCep(value && value.cep),
    street: String(value && value.street || ""),
    number: String(value && value.number || ""),
    complement: String(value && value.complement || ""),
    district: String(value && value.district || ""),
    city: String(value && (value.city && !value.state ? cityState.city : value.city) || ""),
    state: String(value && value.state || cityState.state || "").slice(0, 2).toUpperCase(),
  };
}

function buildAddressLine(address) {
  /** Build a readable street line from structured address parts. */

  const normalized = normalizeAddress(address);
  const main = [normalized.street, normalized.number].filter(Boolean).join(", ");
  if (normalized.complement) {
    return [main || normalized.street, normalized.complement].filter(Boolean).join(" · ");
  }
  return main || normalized.street;
}

function buildAddressSecondaryLine(address) {
  /** Build a readable district and city/state line for display. */

  const normalized = normalizeAddress(address);
  const locality = [normalized.city, normalized.state].filter(Boolean).join(" - ");
  return [normalized.district, locality].filter(Boolean).join(" · ");
}

async function fetchViaCepAddress(cep) {
  /** Resolve one CEP with ViaCEP and return the mapped address fields. */

  const digits = digitsOnly(cep).slice(0, CEP_LENGTH);
  if (digits.length !== CEP_LENGTH) {
    return null;
  }

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!response.ok) {
    throw new Error("Nao foi possivel consultar o CEP.");
  }

  const payload = await response.json();
  if (!payload || payload.erro) {
    throw new Error("CEP nao encontrado.");
  }

  return {
    cep: formatCep(digits),
    street: String(payload.logradouro || ""),
    district: String(payload.bairro || ""),
    city: String(payload.localidade || ""),
    state: String(payload.uf || "").slice(0, 2).toUpperCase(),
  };
}

export {
  buildAddressLine,
  buildAddressSecondaryLine,
  createEmptyAddress,
  digitsOnly,
  fetchViaCepAddress,
  formatCep,
  normalizeAddress,
};
