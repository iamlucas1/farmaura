/*
farmaura/src/marketplace-entry.js

Module entrypoint for the Farmaura marketplace.

Responsibilities:
- boot the marketplace directly from native ESM modules;
- preload shared runtime dependencies required by the portal;
- keep the HTML shell minimal and production-aligned.

Observations:
- the marketplace no longer depends on generated wrapper indexes to start;
- shared browser services remain loaded through the runtime bootstrap imports below.
*/

import "../react/marketplace/marketplace.css";
import "../react/shared/access-control.js";
import "../react/shared/api-client.js";
import "../react/shared/observability.js";
import "../react/marketplace/core/marketplace-app.jsx";
