/*
farmaura/react/marketplace/core/marketplace-assets.js

Static asset registry for the Farmaura marketplace.

Responsibilities:
- expose Vite-managed URLs for shared brand assets;
- expose Vite-managed URLs for marketplace placeholder images;
- provide small helpers for resolving asset names into URLs.

Observations:
- importing assets through this module keeps HTML and JSX free from hard-coded /farmaura/react paths;
- Vite rewrites these imports to fingerprinted production files automatically.
*/

import logoMarkUrl from "../assets/brand/Farmaura - Isotipo.png";
import logoFullUrl from "../assets/brand/Farmaura - Logotipo Principal.svg";
import logoFullTaglineUrl from "../assets/brand/Farmaura - Logotipo Principal com Frase.svg";
import logoFullWhiteUrl from "../assets/brand/Farmaura - Logotipo Branca.png";
import logoFullWhiteTaglineUrl from "../assets/brand/Farmaura - Logotipo Branca com Frase.png";
import placeholderDefaultUrl from "../assets/marketplace/placeholders/PlaceHolder.png";
import placeholderGenericUrl from "../assets/marketplace/placeholders/PlaceHolder-generico.png";
import placeholderPrescriptionUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica.png";
import placeholderPrescriptionGenericUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica-generico.png";
import placeholderPrescriptionRetentionUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita.png";
import placeholderPrescriptionRetentionGenericUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-generico.png";
import placeholderPrescriptionBlackStripeUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta-generico.png";
import placeholderPrescriptionBlackStripeRetentionUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta.png";

const MARKETPLACE_LOGO_MARK_URL = logoMarkUrl;
// Full brand lockup (isotipo + "Farmaura" wordmark, already baked into one image) — use this
// instead of pairing the bare isotipo with a separate text label wherever the full name is shown.
// "Full"/"White" pick the ink color for light vs. brand-colored/dark backgrounds; "Tagline" adds
// "Cuidado é o que nos move" (footer only, per brand usage).
const MARKETPLACE_LOGO_FULL_URL = logoFullUrl;
const MARKETPLACE_LOGO_FULL_TAGLINE_URL = logoFullTaglineUrl;
const MARKETPLACE_LOGO_FULL_WHITE_URL = logoFullWhiteUrl;
const MARKETPLACE_LOGO_FULL_WHITE_TAGLINE_URL = logoFullWhiteTaglineUrl;
const MARKETPLACE_PLACEHOLDER_URLS = {
  "PlaceHolder.png": placeholderDefaultUrl,
  "PlaceHolder-generico.png": placeholderGenericUrl,
  "PlaceHolder-venda-sob-prescricao-medica.png": placeholderPrescriptionUrl,
  "PlaceHolder-venda-sob-prescricao-medica-generico.png": placeholderPrescriptionGenericUrl,
  "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita.png": placeholderPrescriptionRetentionUrl,
  "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-generico.png": placeholderPrescriptionRetentionGenericUrl,
  "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta-generico.png": placeholderPrescriptionBlackStripeUrl,
  "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta.png": placeholderPrescriptionBlackStripeRetentionUrl,
};

function resolveMarketplaceAssetUrl(name) {
  return MARKETPLACE_PLACEHOLDER_URLS[name] || placeholderDefaultUrl;
}

export {
  MARKETPLACE_LOGO_MARK_URL,
  MARKETPLACE_LOGO_FULL_URL,
  MARKETPLACE_LOGO_FULL_TAGLINE_URL,
  MARKETPLACE_LOGO_FULL_WHITE_URL,
  MARKETPLACE_LOGO_FULL_WHITE_TAGLINE_URL,
  MARKETPLACE_PLACEHOLDER_URLS,
  resolveMarketplaceAssetUrl,
};
