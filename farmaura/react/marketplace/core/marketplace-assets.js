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

import logoMarkUrl from "../assets/brand/logo-f.png";
import placeholderDefaultUrl from "../assets/marketplace/placeholders/PlaceHolder.png";
import placeholderGenericUrl from "../assets/marketplace/placeholders/PlaceHolder-generico.png";
import placeholderPrescriptionUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica.png";
import placeholderPrescriptionGenericUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica-generico.png";
import placeholderPrescriptionRetentionUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita.png";
import placeholderPrescriptionRetentionGenericUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-generico.png";
import placeholderPrescriptionBlackStripeUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta-generico.png";
import placeholderPrescriptionBlackStripeRetentionUrl from "../assets/marketplace/placeholders/PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta.png";

const MARKETPLACE_LOGO_MARK_URL = logoMarkUrl;
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

export { MARKETPLACE_LOGO_MARK_URL, MARKETPLACE_PLACEHOLDER_URLS, resolveMarketplaceAssetUrl };
