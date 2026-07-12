/*
react/shared/google-maps.js

Google Maps browser loader for Farmaura.

Responsibilities:
- load the Google Maps JavaScript API once per page;
- expose a promise-based loader for map consumers;
- keep key resolution centralized and environment-driven;

Observations:
- the API key can come from window.FA_GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY;
- consumers should handle loader failures and render a safe fallback state;
*/

const GOOGLE_MAPS_SCRIPT_ID = "fa-google-maps-script";
const GOOGLE_MAPS_PROMISE_KEY = "__FA_GOOGLE_MAPS_PROMISE__";

function resolveGoogleMapsApiKey() {
  return String(
    (globalThis.FA_GOOGLE_MAPS_API_KEY)
    || (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
    || ""
  ).trim();
}

function buildGoogleMapsScriptUrl(apiKey) {
  const params = new URLSearchParams({
    key: apiKey,
    v: "weekly",
    libraries: "geometry,places",
    loading: "async",
  });
  return "https://maps.googleapis.com/maps/api/js?" + params.toString();
}

function loadGoogleMaps() {
  if (globalThis.google && globalThis.google.maps) {
    return Promise.resolve(globalThis.google.maps);
  }
  if (globalThis[GOOGLE_MAPS_PROMISE_KEY]) {
    return globalThis[GOOGLE_MAPS_PROMISE_KEY];
  }

  const apiKey = resolveGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.reject(new Error("Google Maps API key is not configured. Set window.FA_GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY."));
  }

  globalThis[GOOGLE_MAPS_PROMISE_KEY] = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(globalThis.google.maps), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Google Maps JavaScript API.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = buildGoogleMapsScriptUrl(apiKey);
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (globalThis.google && globalThis.google.maps) {
        resolve(globalThis.google.maps);
        return;
      }
      reject(new Error("Google Maps JavaScript API loaded without window.google.maps."));
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps JavaScript API."));
    document.head.appendChild(script);
  }).catch((error) => {
    delete globalThis[GOOGLE_MAPS_PROMISE_KEY];
    throw error;
  });

  return globalThis[GOOGLE_MAPS_PROMISE_KEY];
}

export { loadGoogleMaps, resolveGoogleMapsApiKey };
