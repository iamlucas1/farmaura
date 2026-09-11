/*
farmaura/src/internal-entry.js

Module entrypoint for the Farmaura internal console.

Responsibilities:
- boot the internal console directly from native ESM modules;
- preload shared runtime dependencies required by the portal;
- keep the HTML shell minimal and production-aligned.

Observations:
- the internal console no longer depends on generated wrapper indexes;
- Google Maps is loaded on demand by the delivery operations screen.
*/

import "../react/marketplace/marketplace.css";
import "../react/internal/internal.css";
import "../react/shared/access-control.js";
import "../react/shared/api-client.js";
import "../react/shared/observability.js";
import "../react/internal/core/internal-icons.jsx";
import "../react/internal/core/internal-app.jsx";
