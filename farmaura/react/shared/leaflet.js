/*
farmaura/react/shared/leaflet.js

Leaflet browser loader for Farmaura.

Responsibilities:
- load Leaflet CSS and JavaScript once per page;
- expose a promise-based loader for map consumers;
- centralize CDN-based map runtime bootstrapping;

Observations:
- this module uses public CDN assets and does not require API keys;
- consumers should handle loader failures and render a safe fallback state;
*/

const LEAFLET_STYLE_ID = "fa-leaflet-style";
const LEAFLET_SCRIPT_ID = "fa-leaflet-script";
const LEAFLET_PROMISE_KEY = "__FA_LEAFLET_PROMISE__";
const LEAFLET_STYLE_HREF = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_SCRIPT_SRC = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function ensureLeafletStyle() {
  /** Ensure the Leaflet stylesheet is attached to the document. */

  const existingStyle = document.getElementById(LEAFLET_STYLE_ID);
  if (existingStyle) {
    return existingStyle;
  }

  const style = document.createElement("link");
  style.id = LEAFLET_STYLE_ID;
  style.rel = "stylesheet";
  style.href = LEAFLET_STYLE_HREF;
  document.head.appendChild(style);
  return style;
}

function loadLeaflet() {
  /** Load the Leaflet runtime and return the global API object. */

  if (globalThis.L && typeof globalThis.L.map === "function") {
    return Promise.resolve(globalThis.L);
  }
  if (globalThis[LEAFLET_PROMISE_KEY]) {
    return globalThis[LEAFLET_PROMISE_KEY];
  }

  ensureLeafletStyle();

  globalThis[LEAFLET_PROMISE_KEY] = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(LEAFLET_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(globalThis.L), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Leaflet.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = LEAFLET_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (globalThis.L && typeof globalThis.L.map === "function") {
        resolve(globalThis.L);
        return;
      }
      reject(new Error("Leaflet loaded without window.L."));
    };
    script.onerror = () => reject(new Error("Failed to load Leaflet."));
    document.head.appendChild(script);
  }).catch((error) => {
    delete globalThis[LEAFLET_PROMISE_KEY];
    throw error;
  });

  return globalThis[LEAFLET_PROMISE_KEY];
}

export { loadLeaflet };
