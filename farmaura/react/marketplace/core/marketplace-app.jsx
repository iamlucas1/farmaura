import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";

import "../../shared/portal-cache.js";
import fakeBrandCimedUrl from "../assets/marketplace/fake-brands/cimed.png";
import fakeBrandEmsUrl from "../assets/marketplace/fake-brands/ems.png";
import fakeBrandJnjUrl from "../assets/marketplace/fake-brands/jnj.png";
import fakeBrandLarocheUrl from "../assets/marketplace/fake-brands/laroche.png";
import fakeBrandNeoquimicaUrl from "../assets/marketplace/fake-brands/neoquimica.png";
import fakeBrandNiveaUrl from "../assets/marketplace/fake-brands/nivea.png";
import fakeBrandVichyUrl from "../assets/marketplace/fake-brands/vichy.png";
import { MARKETPLACE_LOGO_FULL_URL, resolveMarketplaceAssetUrl } from "./marketplace-assets.js";
import { ChatWidget, PharmacistChatModal } from "./marketplace-care-actions.jsx";
import { Header, Footer } from "./marketplace-chrome.jsx";
import { brl } from "./marketplace-components.jsx";
import { Icon } from "./marketplace-icons.jsx";
import { AccountScreen, LoginScreen, UnlockAccountScreen } from "../screens/account-screen.jsx";
import { DataRetentionScreen, PrivacyScreen, TermsScreen } from "../screens/legal-screen.jsx";
import { ProfileCompletionNudge } from "../screens/account-profile-screen.jsx";
import { CareScreen } from "../screens/care-screen.jsx";
import { CartScreen } from "../screens/cart-screen.jsx";
import { CheckoutScreen, ConfirmScreen } from "../screens/checkout-screen.jsx";
import { CashbackScreen, SavedScreen } from "../screens/extra-screen.jsx";
import { ChatHistoryScreen } from "../screens/chat-history-screen.jsx";
import { HomeScreen } from "../screens/home-screen.jsx";
import { ProductScreen } from "../screens/product-screen.jsx";
import { BulaScreen } from "../screens/bula-screen.jsx";
import { ServicesScreen } from "../screens/services-screen.jsx";
import { ShopScreen } from "../screens/shop-screen.jsx";
import { SubscriptionsScreen } from "../screens/subscriptions-screen.jsx";

/* FARMAURA — App shell: routing, cart state, tweaks. Depends on all screen files. */

const MARKETPLACE_ROUTE_RESERVED_KEYS = new Set(['name', 'id', 'cat', 'brand']);

/* Static per-route <title> segments. 'product'/'category'/'brand' interpolate the real name when
   available (see useDocumentTitle) and fall back to this generic label otherwise — search engines
   and shared links otherwise all showed the same "Farmaura — Marketplace" title for every page. */
const MARKETPLACE_ROUTE_TITLES = {
  home: 'Farmaura — Farmácia de bairro com entrega rápida e cashback',
  shop: 'Buscar produtos — Farmaura',
  product: 'Produto — Farmaura',
  bula: 'Bula do medicamento — Farmaura',
  category: 'Categoria — Farmaura',
  brand: 'Marca — Farmaura',
  cart: 'Carrinho — Farmaura',
  checkout: 'Finalizar compra — Farmaura',
  confirm: 'Pedido confirmado — Farmaura',
  care: 'Fale com o farmacêutico — Farmaura',
  services: 'Serviços de saúde — Farmaura',
  subscriptions: 'Assinaturas — Farmaura',
  saved: 'Produtos salvos — Farmaura',
  discover: 'Mais buscados — Farmaura',
  offers: 'Ofertas do dia — Farmaura',
  prescription: 'Enviar receita — Farmaura',
  cashback: 'Cashback — Farmaura',
  account: 'Minha conta — Farmaura',
  login: 'Entrar — Farmaura',
};

function useMarketplaceDocumentTitle(route, products) {
  useEffect(() => {
    let title = MARKETPLACE_ROUTE_TITLES[route && route.name] || 'Farmaura — Marketplace';
    if (route && route.name === 'product' && route.id) {
      const product = (products || []).find((item) => item.id === route.id);
      if (product && product.name) title = `${product.name} — Farmaura`;
    } else if (route && route.name === 'bula' && route.id) {
      const product = (products || []).find((item) => item.id === route.id);
      if (product && product.name) title = `Bula — ${product.name} — Farmaura`;
    } else if (route && route.name === 'category' && route.cat) {
      title = `${route.cat} — Farmaura`;
    } else if (route && route.name === 'brand' && route.brand) {
      title = `${route.brand} — Farmaura`;
    }
    document.title = title;
  }, [route && route.name, route && route.id, route && route.cat, route && route.brand, products]);
}

// Login/account/legal/cart flows carry no independent SEO value and are either private, duplicate,
// or session-specific — search engines shouldn't index them even though the catalog/marketing
// routes stay open. There is no server-side rendering here (one static marketplace.html shell for
// every route), so this is the only per-route lever available; robots.txt is left permissive on
// purpose (a Disallow would stop Googlebot from ever crawling far enough to see this tag).
const MARKETPLACE_NOINDEX_ROUTES = new Set([
  'login', 'unlock-account', 'terms', 'privacy', 'data-retention',
  'account', 'orders', 'cart', 'checkout', 'confirm',
  'cashback', 'saved', 'chats', 'search', 'discover',
]);

function useMarketplaceRobotsMeta(route) {
  useEffect(() => {
    let tag = document.querySelector('meta[name="robots"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'robots');
      document.head.appendChild(tag);
    }
    const noindex = MARKETPLACE_NOINDEX_ROUTES.has(route && route.name);
    tag.setAttribute('content', noindex ? 'noindex, nofollow' : 'index, follow');
  }, [route && route.name]);
}

function buildMarketplacePath(route) {
  const name = (route && route.name) || 'home';
  const segments = [name === 'home' ? '' : name];
  if (route && route.id) segments.push(encodeURIComponent(route.id));
  else if (route && route.cat) segments.push(encodeURIComponent(route.cat));
  else if (route && route.brand) segments.push(encodeURIComponent(route.brand));
  const path = '/' + segments.filter(Boolean).join('/');
  const params = new URLSearchParams();
  Object.keys(route || {}).forEach((key) => {
    if (MARKETPLACE_ROUTE_RESERVED_KEYS.has(key)) return;
    const value = route[key];
    if (value === undefined || value === null || value === '') return;
    params.set(key === 'query' ? 'q' : key, value);
  });
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function parseMarketplaceRoute(splat, searchParams) {
  const segments = String(splat || '').split('/').filter(Boolean);
  const name = segments[0] || 'home';
  const route = { name };
  if (name === 'product' && segments[1]) route.id = decodeURIComponent(segments[1]);
  else if (name === 'bula' && segments[1]) route.id = decodeURIComponent(segments[1]);
  else if (name === 'category' && segments[1]) route.cat = decodeURIComponent(segments[1]);
  else if (name === 'brand' && segments[1]) route.brand = decodeURIComponent(segments[1]);
  for (const [key, value] of searchParams.entries()) {
    route[key === 'q' ? 'query' : key] = value;
  }
  return route;
}

// Default UI variant selection, previously live-editable via a Tweaks panel; now fixed.
const MARKETPLACE_DEFAULTS = {
  density: "regular",
  homeVariant: "A",
  cardVariant: "standard",
  productVariant: "A",
  checkoutVariant: "A",
  accountNav: "side",
  showCashback: true,
};


// Falar com farmacêutico, for a visitor who isn't logged in yet — WhatsApp instead of an
// inline-login chat modal, per explicit product decision. The chat itself (attached files
// included) stays reserved for authenticated customers, since it's what creates a real
// Prescription tied to their account (see ChatService.submit_customer_prescription).
const WHATSAPP_PHARMACIST_NUMBER = '5561996032094';
function buildPharmacistWhatsAppUrl(message) {
  const text = message || 'Olá! Gostaria de falar com um farmacêutico da Farmaura.';
  return 'https://wa.me/' + WHATSAPP_PHARMACIST_NUMBER + '?text=' + encodeURIComponent(text);
}

// A chat message that's nothing but a link is how a customer with a digital prescription hosted
// on an external platform submits it — mirrors the paperclip file-attach, just without a file
// (see ChatService.submit_customer_prescription_link). Deliberately conservative: the whole
// trimmed message has to be the link, not just mention one in passing.
const CHAT_URL_ONLY_PATTERN = /^https?:\/\/\S+\.\S+$/i;

const MARKETPLACE_CATALOG_STORAGE_KEY = 'marketplace_catalog';
const MARKETPLACE_CHAT_STORAGE_KEY = 'chat_threads';
const MARKETPLACE_CART_STORAGE_KEY = 'cart';
const MARKETPLACE_RECENT_STORAGE_KEY = 'recent';
const MARKETPLACE_BOOTSTRAP_STORAGE_KEY = 'bootstrap';

function readStoredMarketplaceCatalog() {
  try {
    const stored = window.FA_PORTAL_CACHE.readLocal('marketplace', null, MARKETPLACE_CATALOG_STORAGE_KEY, []);
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function buildMarketplaceCatalogFallback(baseProducts) {
  return mergePublishedMarketplaceProducts(baseProducts).map(normalizeMarketplaceCatalogItem).filter(Boolean);
}

function resolveMarketplaceCatalogSnapshot(baseProducts) {
  const storedProducts = readStoredMarketplaceCatalog().map(normalizeMarketplaceCatalogItem).filter(Boolean);
  if (storedProducts.length) {
    return storedProducts;
  }
  return buildMarketplaceCatalogFallback(baseProducts);
}

function persistMarketplaceCatalog(products) {
  try {
    window.FA_PORTAL_CACHE.writeLocal('marketplace', null, MARKETPLACE_CATALOG_STORAGE_KEY, Array.isArray(products) ? products : []);
  } catch {}
}

function buildMarketplaceChatTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function createMarketplaceChatThread(options = {}) {
  const order = options.order || null;
  const orderCode = order ? String(order.code || order.id || '').trim() : '';
  const topic = options.topic || (order ? 'Pedido ' + orderCode : 'Atendimento farmacêutico');
  const initialMessage = options.initialMessage || (order
    ? 'Olá! Quero acompanhar o pedido ' + orderCode + ' e tirar uma dúvida sobre a entrega.'
    : 'Olá! Preciso de ajuda com um pedido e orientação farmacêutica.');
  return {
    id: options.id || ('chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
    topic,
    orderId: order ? (order.recordId || order.id || '') : '',
    orderCode,
    orderStatus: order ? (order.status || '') : '',
    fulfillment: order ? (order.fulfillment || 'delivery') : 'support',
    lastAt: buildMarketplaceChatTimestamp(),
    unread: 0,
    messages: [
      {
        id: 'msg_' + Date.now(),
        from: 'pharm',
        text: initialMessage,
        at: buildMarketplaceChatTimestamp(),
      },
    ],
  };
}

// Shared shape for one API chat message across every place a thread gets normalized (initial
// bootstrap, ensure-thread, send-message, send-prescription) — kept in one place so attachment/
// prescription fields can't drift out of sync between them the way from/text/at almost did.
function normalizeChatMessageFromApi(message) {
  return {
    id: message.id,
    from: message.from_role === 'me' ? 'me' : 'pharm',
    text: message.text,
    at: message.at,
    prescriptionId: message.prescription_id || null,
    prescriptionStatus: message.prescription_status || '',
    prescriptionReferenceUrl: message.prescription_reference_url || '',
    attachment: message.attachment ? {
      fileId: message.attachment.file_id,
      name: message.attachment.name,
      contentType: message.attachment.content_type,
    } : null,
  };
}

function normalizeMarketplaceChatThreads(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.filter(Boolean).map((thread, index) => ({
    id: thread.id || ('chat_' + index),
    topic: thread.topic || 'Atendimento farmacêutico',
    orderId: thread.orderId || '',
    orderCode: thread.orderCode || '',
    orderStatus: thread.orderStatus || '',
    fulfillment: thread.fulfillment || 'support',
    lastAt: thread.lastAt || buildMarketplaceChatTimestamp(),
    unread: Number(thread.unread || 0),
    messages: Array.isArray(thread.messages) ? thread.messages.map((message, messageIndex) => ({
      id: message.id || ('msg_' + index + '_' + messageIndex),
      from: message.from === 'me' ? 'me' : 'pharm',
      text: message.text || '',
      at: message.at || buildMarketplaceChatTimestamp(),
    })) : [],
  }));
}

function buildMarketplaceAliasMap(products) {
  const aliasToId = new Map();
  (Array.isArray(products) ? products : []).forEach((product) => {
    if (!product || !product.id) {
      return;
    }
    aliasToId.set(product.id, product.id);
    if (Array.isArray(product.aliases)) {
      product.aliases.forEach((alias) => {
        if (alias) {
          aliasToId.set(alias, product.id);
        }
      });
    }
  });
  return aliasToId;
}

function remapCollectionIds(rows, aliasToId, key = 'id') {
  if (!Array.isArray(rows) || !rows.length) {
    return rows;
  }
  let changed = false;
  const next = [];
  const mergedById = new Map();
  rows.forEach((row) => {
    if (!row || !row[key]) {
      changed = true;
      return;
    }
    const mappedId = aliasToId.get(row[key]) || row[key];
    if (mappedId !== row[key]) {
      changed = true;
    }
    const prepared = mappedId === row[key] ? row : { ...row, [key]: mappedId };
    if (!mergedById.has(mappedId)) {
      mergedById.set(mappedId, next.length);
      next.push(prepared);
      return;
    }
    changed = true;
    const index = mergedById.get(mappedId);
    const current = next[index];
    next[index] = {
      ...current,
      qty: Number(current.qty || 0) + Number(prepared.qty || 0),
      sub: !!(current.sub || prepared.sub),
      freq: current.freq || prepared.freq || 0,
    };
  });
  return changed ? next : rows;
}

function filterMarketplaceCollectionByCatalog(rows, products, key = 'id') {
  if (!Array.isArray(rows) || !rows.length) {
    return rows;
  }
  const productIds = new Set((Array.isArray(products) ? products : []).map((product) => product && product.id).filter(Boolean));
  return rows.filter((row) => row && row[key] && productIds.has(row[key]));
}

function mergePublishedMarketplaceProducts(baseProducts) {
  const publishedProducts = (() => {
    try {
      const stored = window.FA_PORTAL_CACHE.readLocal('marketplace', null, MARKETPLACE_CATALOG_STORAGE_KEY, []);
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  })();
  const merged = [...publishedProducts, ...(Array.isArray(baseProducts) ? baseProducts : [])];
  const seen = new Set();
  return merged.filter((product) => {
    if (!product || !product.id || seen.has(product.id)) {
      return false;
    }
    seen.add(product.id);
    return true;
  });
}

function canUseLiveMarketplaceCatalog(user) {
  return !!(user && window.FA_ACCESS.canAccessMarketplace(user));
}

function normalizeMarketplaceCoupon(item) {
  if (!item || !item.id || !item.code) {
    return null;
  }
  return {
    id: item.id,
    code: item.code,
    title: item.title || "",
    description: item.description || "",
    discountType: item.discount_type || item.discountType || "percent",
    shippingDiscountMode: item.shipping_discount_mode || item.shippingDiscountMode || "full",
    discountValue: Number(item.discount_value ?? item.discountValue ?? 0),
    minimumOrderValue: Number(item.minimum_order_value ?? item.minimumOrderValue ?? 0),
    maxDiscountValue: item.max_discount_value == null && item.maxDiscountValue == null ? null : Number(item.max_discount_value ?? item.maxDiscountValue ?? 0),
    startsAt: item.starts_at || item.startsAt || "",
    endsAt: item.ends_at || item.endsAt || "",
    usageLimit: item.usage_limit == null && item.usageLimit == null ? null : Number(item.usage_limit ?? item.usageLimit ?? 0),
    usageCount: Number(item.usage_count ?? item.usageCount ?? 0),
    perCustomerLimit: Number(item.per_customer_limit ?? item.perCustomerLimit ?? 1),
    audience: item.audience || "all",
    channelScope: item.channel_scope || item.channelScope || "all",
    scopeType: item.scope_type || item.scopeType || "all",
    targetCategories: Array.isArray(item.target_categories) ? item.target_categories : (Array.isArray(item.targetCategories) ? item.targetCategories : []),
    targetProducts: Array.isArray(item.target_products) ? item.target_products : (Array.isArray(item.targetProducts) ? item.targetProducts : []),
    firstPurchaseOnly: !!(item.first_purchase_only ?? item.firstPurchaseOnly),
    stackable: !!item.stackable,
    active: item.active !== false,
    notes: item.notes || "",
    createdAt: item.created_at || item.createdAt || "",
    updatedAt: item.updated_at || item.updatedAt || "",
  };
}

const MARKETPLACE_ORDER_STATUS_MAP = {
  awaiting_confirmation: { label: "Aguardando confirmação", cls: "fa-badge-warn", icon: "clock", step: 0 },
  preparing: { label: "Em separação", cls: "fa-badge-rx", icon: "box", step: 1 },
  ready: { label: "Pronto para envio", cls: "fa-badge-rx", icon: "truck", step: 1 },
  ready_for_pickup: { label: "Pronto para retirada", cls: "fa-badge-health", icon: "store", step: 2 },
  transit: { label: "Saiu para entrega", cls: "fa-badge-rx", icon: "truck", step: 2 },
  delivered: { label: "Concluído", cls: "fa-badge-health", icon: "check", step: 3 },
  cancelled: { label: "Pedido cancelado", cls: "fa-badge-vital", icon: "close", step: 0 },
};

function normalizeMarketplaceCatalogItem(item) {
  if (!item || !item.id) {
    return null;
  }
  const reviewSummary = item.review_summary || item.reviewSummary || {};
  const reviewComments = Array.isArray(reviewSummary.comments) ? reviewSummary.comments : [];
  return {
    id: item.id,
    aliases: Array.isArray(item.aliases) ? item.aliases : [],
    inventoryIds: Array.isArray(item.inventory_ids)
      ? item.inventory_ids
      : (Array.isArray(item.inventoryIds) ? item.inventoryIds : []),
    sku: item.sku || "",
    ean: item.ean || "",
    name: item.name || "Produto Farmaura",
    brand: item.brand || "Farmaura",
    cat: item.category || item.cat || "medicamentos",
    sub: item.subcategory || item.sub || item.category || item.cat || "Medicamentos",
    imageUrl: item.image_url || item.imageUrl || "",
    gallery: Array.isArray(item.gallery) ? item.gallery.filter(Boolean) : [],
    imageAlt: item.image_alt || item.imageAlt || item.name || "Produto Farmaura",
    imagePolicy: item.image_policy || item.imagePolicy || ((item.requires_prescription || item.rx) ? "prescription_restricted" : "placeholder_only"),
    price: Number(item.price || 0),
    old: item.old_price == null
      ? (item.old == null ? null : Number(item.old || 0))
      : Number(item.old_price || 0),
    discount: Number(item.discount_percent ?? item.discount ?? 0),
    promotionHighlight: item.promotion_highlight || item.promotionHighlight || "",
    discountType: item.discount_type || item.discountType || "percent",
    urgencyLabel: item.urgency_label || item.urgencyLabel || "",
    rx: !!(item.requires_prescription || item.rx),
    tags: Array.isArray(item.tags) ? item.tags : [],
    stock: Number(item.stock || 0),
    rating: Number(reviewSummary.rating_average ?? item.rating ?? 0),
    reviews: Number(reviewSummary.review_count ?? item.reviews ?? 0),
    reviewComments: reviewComments,
    info: item.info || item.description || "",
    shortDescription: item.short_description || item.shortDescription || "",
    bulaMarkdown: item.bula_markdown || item.bulaMarkdown || "",
    marketingHighlights: Array.isArray(item.marketing_highlights)
      ? item.marketing_highlights
      : (Array.isArray(item.marketingHighlights) ? item.marketingHighlights : []),
    variantGroupId: item.variant_group_id || item.variantGroupId || "",
    variantLabel: item.variant_label || item.variantLabel || "",
    variants: Array.isArray(item.variants) ? item.variants.map((entry) => ({
      id: entry.id,
      label: entry.label || "",
      price: Number(entry.price || 0),
      old: entry.old_price == null ? (entry.old == null ? null : Number(entry.old)) : Number(entry.old_price),
      inStock: entry.in_stock !== undefined ? !!entry.in_stock : !!entry.inStock,
    })) : [],
  };
}

function normalizeMarketplaceOrderStatus(status, fulfillment) {
  const raw = String(status || '').trim().toLowerCase();
  const mode = String(fulfillment || '').trim().toLowerCase();
  if (['draft', 'submitted', 'paid', 'new'].includes(raw)) {
    return 'awaiting_confirmation';
  }
  if (raw === 'separating') {
    return 'preparing';
  }
  if (raw === 'ready') {
    return mode === 'pickup' ? 'ready_for_pickup' : 'ready';
  }
  if (raw === 'dispatched') {
    return 'transit';
  }
  if (['delivered', 'fulfilled'].includes(raw)) {
    return 'delivered';
  }
  if (raw === 'cancelled') {
    return 'cancelled';
  }
  return 'awaiting_confirmation';
}

// Catalog of marketing programs / communication channels the customer can opt in or out of.
// Persisted shape matches the pre-existing Customer.marketing_program_preferences /
// communication_channel_preferences convention already used by seed data — programs are keyed by
// free-text `name` (CRM can assign customer-specific named campaigns, e.g. "Cashback Farmaura"),
// channels by a fixed `channel` id — both use `enabled` as the boolean flag. This catalog is only
// the small, generic set of toggles surfaced in "Privacidade de dados"; any other pre-existing
// named program a customer already has (assigned outside this UI) is preserved untouched on save,
// never dropped (see buildPrivacyPreferenceList / mergePrivacyPreferenceUpdates).
const MARKETING_PROGRAM_CATALOG = [
  { name: 'Promoções e ofertas personalizadas', label: 'Promoções e ofertas personalizadas', desc: 'Descontos e condições especiais com base no seu perfil de compras.' },
  { name: 'Novidades e lançamentos', label: 'Novidades e lançamentos', desc: 'Novos produtos e serviços da Farmaura.' },
  { name: 'Pesquisas e feedback', label: 'Pesquisas e feedback', desc: 'Pesquisas rápidas para melhorar sua experiência.' },
];

const COMMUNICATION_CHANNEL_CATALOG = [
  { channel: 'email', label: 'E-mail', desc: 'Mensagens no seu e-mail cadastrado.', icon: 'mail' },
  { channel: 'sms', label: 'SMS', desc: 'Mensagens de texto no seu celular.', icon: 'phone' },
  { channel: 'push', label: 'Notificação do app', desc: 'Alertas quando o app estiver aberto.', icon: 'bell' },
  { channel: 'whatsapp', label: 'WhatsApp', desc: 'Mensagens pelo WhatsApp.', icon: 'chat' },
];

function buildPrivacyPreferenceList(catalog, storedList, keyField) {
  /** Merge a fixed catalog (label/desc/icon) with persisted `enabled` flags keyed by name/channel. */

  const storedByKey = new Map((Array.isArray(storedList) ? storedList : []).map((entry) => [entry && entry[keyField], entry]));
  return catalog.map((entry) => ({ ...entry, enabled: !!(storedByKey.get(entry[keyField]) || {}).enabled }));
}

function mergePrivacyPreferenceUpdates(existingList, catalogUpdates, keyField) {
  /** Upsert catalog-toggle changes into the full persisted list without dropping other entries
   * (e.g. CRM-assigned named programs not shown as a toggle in this screen). */

  const existing = Array.isArray(existingList) ? existingList : [];
  const updatesByKey = new Map(catalogUpdates.map((entry) => [entry[keyField], entry]));
  const merged = existing.map((entry) => updatesByKey.has(entry && entry[keyField]) ? { ...entry, enabled: !!updatesByKey.get(entry[keyField]).enabled } : entry);
  const existingKeys = new Set(existing.map((entry) => entry && entry[keyField]));
  catalogUpdates.forEach((entry) => {
    if (!existingKeys.has(entry[keyField])) {
      merged.push({ [keyField]: entry[keyField], enabled: !!entry.enabled });
    }
  });
  return merged;
}

function createMarketplaceProfileSnapshot(user) {
  const safeUser = user || {};
  return {
    name: safeUser.name || '',
    email: safeUser.email || '',
    phone: '',
    cpf: '',
    birth: '',
    gender: '',
    maritalStatus: '',
    childrenCount: '',
    // Birth years, not ages — an age typed once goes stale the moment the year turns; every
    // reader derives the current age from the birth year instead (see childAgeFromBirthYear,
    // account-profile-screen.jsx).
    childrenBirthYears: [],
    // Parallel to childrenBirthYears by index (same slot = same child).
    childrenNames: [],
    photo: safeUser.photo || null,
    twoFactor: !!safeUser.twoFactorEnabled,
    memberSince: '',
    marketingProgramPreferences: [],
    communicationChannelPreferences: [],
    // Server verdict on the "complete your profile" popup — never decided in the browser.
    profileNudge: { shouldShow: false, missingFields: [] },
  };
}

function normalizeProfileNudge(raw) {
  const source = raw || {};
  return {
    shouldShow: source.should_show === true,
    missingFields: Array.isArray(source.missing_fields) ? source.missing_fields.map(String) : [],
  };
}

function normalizeMarketplaceProfile(profilePayload, user) {
  const baseProfile = createMarketplaceProfileSnapshot(user);
  const source = profilePayload || {};
  return {
    ...baseProfile,
    name: source.full_name || baseProfile.name,
    email: source.email || baseProfile.email,
    phone: source.phone || '',
    cpf: source.cpf || '',
    birth: source.birth_date || '',
    gender: source.gender || '',
    maritalStatus: source.marital_status || '',
    childrenCount: source.children_count == null ? '' : Number(source.children_count),
    childrenBirthYears: Array.isArray(source.children_birth_years) ? source.children_birth_years.map(Number) : [],
    childrenNames: Array.isArray(source.children_names) ? source.children_names.map(String) : [],
    photo: source.avatar_url || null,
    twoFactor: typeof source.two_factor_enabled === 'boolean' ? source.two_factor_enabled : baseProfile.twoFactor,
    memberSince: source.member_since_label || '',
    marketingProgramPreferences: Array.isArray(source.marketing_program_preferences) ? source.marketing_program_preferences : [],
    communicationChannelPreferences: Array.isArray(source.communication_channel_preferences) ? source.communication_channel_preferences : [],
    profileNudge: normalizeProfileNudge(source.profile_nudge),
  };
}

function normalizeMarketplaceOrder(item) {
  if (!item || !item.id) {
    return null;
  }
  return {
    id: item.code || item.id,
    code: item.code || item.id,
    recordId: item.id,
    date: item.placed_at || '',
    status: normalizeMarketplaceOrderStatus(item.status, item.fulfillment),
    rawStatus: item.status || '',
    eta: item.eta || '',
    payment: item.payment_method || '',
    paymentStatus: item.payment_status || '',
    fulfillment: item.fulfillment || 'delivery',
    store: item.store || '',
    pickupCode: item.pickup_code || '',
    trackingCode: item.tracking_code || '',
    carrierName: item.carrier_name || '',
    address: item.address || '',
    rxStatus: item.rx_status || 'none',
    total: Number(item.total_amount || 0),
    subtotal: Number(item.subtotal_amount || 0),
    deliveryFee: Number(item.delivery_fee_amount || 0),
    discountAmount: Number(item.discount_amount || 0),
    cashbackApplied: Number(item.cashback_applied_amount || 0),
    cashbackEarned: Number(item.cashback_earned_amount || 0),
    couponCode: item.coupon_code || '',
    pixQrCode: item.pix_qr_code || '',
    pixCopyPaste: item.pix_copy_paste || '',
    fiscalDocument: item.fiscal_document ? {
      id: item.fiscal_document.id,
      documentNumber: item.fiscal_document.document_number || '',
    } : null,
    items: Array.isArray(item.items) ? item.items.map((line) => ({
      id: line.product_id || line.id,
      productId: line.product_id || line.id,
      qty: Number(line.qty || 0),
      sub: false,
      rx: !!line.rx,
      name: line.name || 'Produto Farmaura',
      brand: line.brand || 'Farmaura',
      unitPrice: Number(line.unit_price || 0),
      lineTotal: Number(line.line_total || 0),
    })) : [],
  };
}

function normalizeMarketplaceStore(entry, index) {
  if (!entry) {
    return null;
  }
  return {
    id: entry.id || ('store_' + index),
    name: entry.name || 'Farmaura',
    addr: entry.address || '',
    dist: entry.postal_code || entry.postalCode || '',
    hours: entry.open_status_label || entry.openStatusLabel || 'Consulte a disponibilidade',
    ready: String(entry.ready_minutes || entry.readyMinutes || 20) + ' min',
    lat: entry.latitude != null ? Number(entry.latitude) : null,
    lng: entry.longitude != null ? Number(entry.longitude) : null,
  };
}

function normalizeMarketplaceHealthService(entry) {
  if (!entry || !entry.id) {
    return null;
  }
  return {
    id: entry.id,
    name: entry.name || 'Serviço Farmaura',
    group: entry.group || 'Serviços',
    icon: entry.icon || 'activity',
    desc: entry.description || '',
    dur: entry.duration_label || entry.durationLabel || '',
    price: Number(entry.price_amount || entry.priceAmount || 0),
  };
}

function normalizeMarketplaceHealthHistory(entry) {
  if (!entry || !entry.id) {
    return null;
  }
  return {
    id: entry.id,
    service: entry.service || 'Serviço Farmaura',
    store: entry.store || '',
    pro: entry.professional || '',
    date: entry.date || '',
    time: entry.time || '',
    status: entry.status || 'upcoming',
    price: Number(entry.price_amount || 0),
    originalPrice: Number(entry.original_price_amount || 0),
    couponCode: entry.coupon_code || '',
  };
}

function normalizeHomeBanner(source) {
  const banner = source || {};
  const mode = banner.mode || 'off';
  return {
    mode,
    slides: mode === 'image' && Array.isArray(banner.slides) ? banner.slides.map((slide) => ({
      id: slide.id || '',
      kind: slide.kind === 'html' ? 'html' : 'image',
      image: slide.image || '',
      html: slide.html || '',
      altText: slide.alt_text || slide.altText || '',
      linkType: slide.link_type || slide.linkType || 'none',
      linkCategory: slide.link_category || slide.linkCategory || '',
      linkUrl: slide.link_url || slide.linkUrl || '',
    })).filter((slide) => (slide.kind === 'html' ? !!slide.html : !!slide.image)) : [],
  };
}

function normalizeLaunchMode(source) {
  const launch = source || {};
  return {
    enabled: !!launch.enabled,
    launchAt: launch.launch_at || launch.launchAt || '',
    headline: launch.headline || '',
    subtext: launch.subtext || '',
  };
}

function normalizeHomeBrands(source) {
  const brands = source || {};
  const mode = brands.mode || 'off';
  return {
    mode,
    circles: mode === 'on' && Array.isArray(brands.circles) ? brands.circles.map((circle) => ({
      id: circle.id || '',
      image: circle.image || '',
      altText: circle.alt_text || circle.altText || '',
      brandName: circle.brand_name || circle.brandName || '',
    })).filter((circle) => circle.image && circle.brandName) : [],
  };
}

// "Ofertas do dia": admin-curated product list (Marketplace → Ofertas do dia, console interno).
// Only stores an ordered list of refs — no product resolution happens server-side, the marketplace
// already has the full catalog loaded (`products`), and every CatalogItem carries an `aliases` list
// containing this exact ref format ("inv-<InventoryItem.id>"/"listing-<MarketplaceListing.id>"), so
// resolution happens client-side against `products`, same principle as `normalizeHomeBrands` matching
// by name — see `resolveDealOfTheDayProducts` in home-screen.jsx.
function normalizeDealOfTheDay(source) {
  const deal = source || {};
  const mode = deal.mode || 'off';
  const isEnabled = mode === 'manual' || mode === 'auto' || mode === 'scheduled';
  return {
    mode,
    productRefs: isEnabled && Array.isArray(deal.product_refs) ? deal.product_refs.filter(Boolean) : [],
    resetTime: deal.reset_time || deal.resetTime || '00:00',
    title: deal.title || '',
    subtitle: deal.subtitle || '',
    showCountdown: deal.show_countdown !== false,
  };
}

// "Tendências": admin-curated product list (Marketplace → Tendências, console interno). Same
// client-side resolution principle as `normalizeDealOfTheDay` (no server-side product resolution,
// refs matched against `products`/`CatalogItem.aliases` in `resolveHomeTrendsProducts`,
// marketplace-components.jsx) — just off/on instead of deal's off/manual/auto/scheduled.
function normalizeHomeTrends(source) {
  const trends = source || {};
  const mode = trends.mode || 'off';
  return {
    mode,
    productRefs: mode === 'on' && Array.isArray(trends.product_refs) ? trends.product_refs.filter(Boolean) : [],
  };
}

function normalizeMarketplaceSubscription(entry) {
  if (!entry || !entry.product_ref) {
    return null;
  }
  return {
    id: entry.product_ref,
    qty: Number(entry.quantity || 1),
    freq: Number(entry.frequency_days || 30),
    paused: !!entry.is_paused,
    nextInDays: Number(entry.next_cycle_in_days || 0),
    since: entry.started_at_label || 'Assinatura recente',
    status: entry.status || 'active',
    dueDateLabel: entry.due_date_label || '',
    cancelReason: entry.cancel_reason || '',
    name: entry.product_name || '',
    unitPrice: Number(entry.unit_price || 0),
  };
}

function normalizeMarketplacePrescriptionStatus(payload) {
  const source = payload || {};
  return {
    status: source.status || 'none',
    prescriptionId: source.prescription_id || '',
    rejectionReason: source.rejection_reason || '',
    submittedAtLabel: source.submitted_at_label || '',
  };
}

function normalizeMarketplaceCashbackWallet(payload) {
  const source = payload || {};
  return {
    availableBalance: Number(source.available_balance || 0),
    pendingBalance: Number(source.pending_balance || 0),
    lifetimeEarnedTotal: Number(source.lifetime_earned_total || 0),
    redeemedTotal: Number(source.redeemed_total || 0),
    redeemMaxPercent: Number(source.redeem_max_percent ?? 25),
    entries: Array.isArray(source.entries) ? source.entries.map((entry) => ({
      id: entry.id,
      type: entry.type || '',
      status: entry.status || '',
      amount: Number(entry.amount || 0),
      orderId: entry.order_id || '',
      reference: entry.reference || '',
      notes: entry.notes || '',
      createdAtLabel: entry.created_at_label || '',
    })) : [],
  };
}

function normalizeMarketplaceAnniversaryOffers(payload) {
  const offers = (payload && Array.isArray(payload.offers)) ? payload.offers : [];
  return offers.map((offer) => ({
    kind: offer.kind || '',
    label: offer.label || '',
    percent: Number(offer.percent || 0),
    monthLabel: offer.month_label || '',
    eligible: !!offer.eligible,
    alreadyClaimed: !!offer.already_claimed,
    code: offer.code || '',
    validUntilLabel: offer.valid_until_label || '',
  }));
}

function normalizeMarketplacePortalData(payload) {
  const source = payload || {};
  return {
    categories: Array.isArray(source.categories) ? source.categories.map((entry) => ({
      id: entry.id || '',
      label: entry.label || 'Categoria',
      desc: entry.description || '',
      glyph: entry.icon || 'pill',
    })).filter((entry) => entry.id) : [],
    stores: Array.isArray(source.stores) ? source.stores.map(normalizeMarketplaceStore).filter(Boolean) : [],
    pharmacist: source.pharmacist || {},
    marketplace: source.marketplace || {},
    homeBanner: normalizeHomeBanner(source.home_banner),
    homeBrands: normalizeHomeBrands(source.home_brands),
    homeTrends: normalizeHomeTrends(source.home_trends),
    dealOfTheDay: normalizeDealOfTheDay(source.deal_of_the_day),
    launchMode: normalizeLaunchMode(source.launch_mode),
    healthServices: Array.isArray(source.health_services) ? source.health_services.map(normalizeMarketplaceHealthService).filter(Boolean) : [],
    healthHistory: Array.isArray(source.health_history) ? source.health_history.map(normalizeMarketplaceHealthHistory).filter(Boolean) : [],
    favorites: Array.isArray(source.favorites) ? source.favorites.map((entry) => entry && entry.product_ref).filter(Boolean) : [],
    subscriptions: Array.isArray(source.subscriptions) ? source.subscriptions.map(normalizeMarketplaceSubscription).filter(Boolean) : [],
    coupons: Array.isArray(source.coupons) ? source.coupons.map(normalizeMarketplaceCoupon).filter(Boolean) : [],
    deliveryEstimate: source.delivery_estimate ? {
      freeAboveSubtotal: Number(source.delivery_estimate.free_above_subtotal || 0),
      baseFee: Number(source.delivery_estimate.base_fee || 0),
    } : { freeAboveSubtotal: 120, baseFee: 9.9 },
  };
}

function readMarketplaceScopedCache(user, key, fallbackValue) {
  return window.FA_PORTAL_CACHE.readLocal('marketplace', user, key, fallbackValue);
}

function writeMarketplaceScopedCache(user, key, value) {
  window.FA_PORTAL_CACHE.writeLocal('marketplace', user, key, value);
}

// sessionStorage (not localStorage) on purpose — clears when the tab/browser closes, matching
// what "this session" actually means for the floating chat widget, while still surviving a
// same-tab reload, which a plain in-memory useState can't.
function readMarketplaceScopedSessionCache(user, key, fallbackValue) {
  return window.FA_PORTAL_CACHE.readSession('marketplace', user, key, fallbackValue);
}

function writeMarketplaceScopedSessionCache(user, key, value) {
  window.FA_PORTAL_CACHE.writeSession('marketplace', user, key, value);
}

function MarketplaceAccessNotice({ onReset }) {
  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 72, paddingBottom: 96, maxWidth: 720 }}>
      <div className="fa-card" style={{ padding: '32px clamp(22px,4vw,36px)', textAlign: 'center' }}>
        <span className="fa-iconbox" style={{ margin: '0 auto 18px', width: 72, height: 72 }}><Icon name="shield" size={30} /></span>
        <h1 className="fa-h2">Acesso indisponível neste portal</h1>
        <p className="fa-lead" style={{ marginTop: 10 }}>
          Esta sessão pertence ao sistema interno da farmácia. O marketplace é reservado ao perfil de cliente.
        </p>
        <button className="fa-btn fa-btn-primary" style={{ marginTop: 20 }} onClick={onReset}>
          Limpar sessão deste portal
        </button>
      </div>
    </div>
  );
}

const LAUNCH_COUNTDOWN_UNITS = [
  { key: 'days', label: 'dias', ms: 86_400_000 },
  { key: 'hours', label: 'horas', ms: 3_600_000 },
  { key: 'minutes', label: 'min', ms: 60_000 },
  { key: 'seconds', label: 'seg', ms: 1_000 },
];

function splitCountdown(remainingMs) {
  let rest = Math.max(0, remainingMs);
  const parts = {};
  for (const unit of LAUNCH_COUNTDOWN_UNITS) {
    parts[unit.key] = Math.floor(rest / unit.ms);
    rest -= parts[unit.key] * unit.ms;
  }
  return parts;
}

// One split-flap module (a single digit 0-9), built from two independently hinged leaves — see the
// ".cd-digit" comment in marketplace.css for the full mechanical model. React's job here is just
// timing *what each half shows* to match the CSS animation phases:
//   - topValue settles to the new digit immediately (t=0) — invisible either way, since the top
//     leaf (showing the old digit) fully covers it until it finishes folding away at t=300ms.
//   - bottomValue keeps the OLD digit until t=300ms, then swaps — matching the instant the bottom
//     leaf starts unfolding (rotateX 90deg, edge-on/invisible), so the swap is masked by the leaf
//     being paper-thin right then instead of "jumping" to the new digit early.
// The flip key is bumped on every change so React remounts the leaves and the CSS animation
// restarts even if the digit repeats (e.g. 9 -> 0 -> ... -> 9 later), which a value-based key would miss.
function FlipDigit({ value }) {
  const [topValue, setTopValue] = useState(value);
  const [bottomValue, setBottomValue] = useState(value);
  const [flipFrom, setFlipFrom] = useState(null);
  const prevRef = useRef(value);
  const flipKeyRef = useRef(0);

  useEffect(() => {
    if (value === prevRef.current) return undefined;
    flipKeyRef.current += 1;
    setFlipFrom(prevRef.current);
    prevRef.current = value;
    setTopValue(value);
    const midTimeout = setTimeout(() => setBottomValue(value), 300);
    const endTimeout = setTimeout(() => setFlipFrom(null), 620);
    return () => { clearTimeout(midTimeout); clearTimeout(endTimeout); };
  }, [value]);

  return (
    <span className="cd-digit">
      <span className="cd-digit-static cd-digit-static-top"><span className="cd-digit-glyph">{topValue}</span></span>
      <span className="cd-digit-static cd-digit-static-bottom"><span className="cd-digit-glyph">{bottomValue}</span></span>
      {flipFrom !== null && (
        <React.Fragment key={flipKeyRef.current}>
          <span className="cd-digit-leaf cd-digit-leaf-top"><span className="cd-digit-glyph">{flipFrom}</span></span>
          <span className="cd-digit-leaf cd-digit-leaf-bottom"><span className="cd-digit-glyph">{value}</span></span>
        </React.Fragment>
      )}
    </span>
  );
}

// Deliberately fake — not sourced from the real catalog. A brand-new tenant's real catalog can
// easily be empty (no products entered yet), which would leave this background blank right when
// it matters most (the pre-launch countdown). A fixed, plausible-looking pharmacy assortment
// always renders the same "there's a store being built here" impression regardless of how much
// real inventory exists yet. Tinted per item (cycling the app's own success/info/warn/rose/primary
// tokens) with a simple capsule silhouette standing in for a product photo — same idea as a real
// product tile, no real images to load. Entirely inert: `pointer-events: none` on the grid, no
// click handlers on any card — it's scenery behind the countdown, not a functional catalog.
const FAKE_MARKETPLACE_ITEMS = [
  { name: 'Vitamina C 1g', price: 24.9, discount: 0, tone: 'rose' },
  { name: 'Protetor Solar FPS 60', price: 59.9, discount: 15, tone: 'success' },
  { name: 'Dipirona 500mg', price: 12.5, discount: 0, tone: 'info' },
  { name: 'Álcool em Gel 70%', price: 9.9, discount: 0, tone: 'warn' },
  { name: 'Shampoo Anticaspa', price: 34.9, discount: 10, tone: 'mist' },
  { name: 'Multivitamínico', price: 45, discount: 0, tone: 'rose' },
  { name: 'Colágeno Hidrolisado', price: 68.9, discount: 0, tone: 'success' },
  { name: 'Ômega 3 1000mg', price: 39.9, discount: 5, tone: 'info' },
  { name: 'Melatonina 5mg', price: 29.9, discount: 0, tone: 'warn' },
  { name: 'Repelente de Insetos', price: 22.5, discount: 0, tone: 'mist' },
  { name: 'Creme Hidratante', price: 32.9, discount: 20, tone: 'rose' },
  { name: 'Termômetro Digital', price: 27.9, discount: 0, tone: 'success' },
  { name: 'Escova Dental Macia', price: 8.9, discount: 0, tone: 'info' },
  { name: 'Antisséptico Bucal', price: 19.9, discount: 0, tone: 'warn' },
  { name: 'Sabonete Líquido', price: 14.9, discount: 0, tone: 'mist' },
  { name: 'Fralda Geriátrica', price: 49.9, discount: 8, tone: 'rose' },
  { name: 'Curativo Adesivo', price: 11.9, discount: 0, tone: 'success' },
  { name: 'Máscara Facial N95', price: 6.9, discount: 0, tone: 'info' },
];

const FAKE_NAV_CATEGORIES = ['Bem-estar', 'Higiene', 'Infantil', 'Medicamentos', 'Perfumaria', 'Ofertas', 'Serviços de saúde'];

// Real, recognizable pharmacy/dermocosmetic brands — the kind this store would plausibly carry —
// standard nominative/retailer use of a supplier's logo to say "we sell this brand", same as any
// drugstore website. Logos sourced from Wikimedia Commons (public-domain-quality wordmarks) and
// each brand's own site, square-padded onto white locally; see assets/marketplace/fake-brands/.
const FAKE_BRANDS = [
  { name: 'EMS', image: fakeBrandEmsUrl },
  { name: 'Neo Química', image: fakeBrandNeoquimicaUrl },
  { name: 'Vichy', image: fakeBrandVichyUrl },
  { name: 'La Roche-Posay', image: fakeBrandLarocheUrl },
  { name: 'Johnson & Johnson', image: fakeBrandJnjUrl },
  { name: 'Nivea', image: fakeBrandNiveaUrl },
  { name: 'Cimed', image: fakeBrandCimedUrl },
];

// Same regulatory placeholder box art the real catalog falls back to for a product without a
// custom photo (ProductVisual, marketplace-components.jsx) — alternating the two most generic
// ones just for a little variety, not because it means anything here.
const FAKE_SHOP_PLACEHOLDER_URLS = [resolveMarketplaceAssetUrl('PlaceHolder.webp'), resolveMarketplaceAssetUrl('PlaceHolder-generico.webp')];

function _fakeShopTile(item, index) {
  return (
    <div key={item.name} className={'cd-shop-card cd-shop-tone-' + item.tone}>
      {item.discount > 0 && <span className="cd-shop-badge">-{item.discount}%</span>}
      <div className="cd-shop-thumb"><img src={FAKE_SHOP_PLACEHOLDER_URLS[index % 2]} alt="" loading="lazy" /></div>
      <div className="cd-shop-name">{item.name}</div>
      <div className="cd-shop-price">{brl(item.price)}</div>
    </div>
  );
}

// The marketplace itself, mocked — not the real HomeScreen (no real hooks, no real Header/
// portalData/authClient) and not the real catalog (no fetch, no database), just static JSX built
// from the same CSS the real site uses (.fa-header-sticky/.fa-topbar/.fa-search/.fa-navrow/...) so it
// reads as "this is our store" rather than an abstract graphic. Entirely inert on purpose —
// `pointer-events: none` on the whole thing — it's a backdrop the countdown card sits in front
// of, never a functional page a visitor could interact with.
function LaunchMarketplaceMock() {
  return (
    <div className="cd-mock-site" aria-hidden="true">
      <div className="fa-topbar">
        <div className="fa-wrap">
          <span>Entregar em <b>Consulte a disponibilidade</b></span>
          <div style={{ display: 'flex', gap: 20 }}>
            <span>Entrar</span>
            <span>Falar com farmacêutico</span>
            <span>Entrega conforme disponibilidade</span>
          </div>
        </div>
      </div>
      <div className="fa-header-sticky">
        <div className="fa-wrap fa-header-main">
          <span className="fa-logo"><img className="fa-logo-full-img" src={MARKETPLACE_LOGO_FULL_URL} alt="" /></span>
          <div className="fa-search"><Icon name="search" size={18} /><span className="cd-mock-search-text">Busque por remédios, marcas, sintomas...</span></div>
          <span className="fa-btn fa-btn-primary">Entrar / Criar conta</span>
          <span className="fa-iconbtn"><Icon name="bag" size={18} /></span>
        </div>
        <div className="fa-wrap fa-navrow">
          {FAKE_NAV_CATEGORIES.map((c) => <span key={c} className="fa-navlink">{c}</span>)}
        </div>
      </div>
      <div className="fa-wrap cd-mock-body">
        <div className="cd-mock-banner">
          <div className="fa-eyebrow" style={{ color: '#fff', opacity: .85 }}>OFERTA DE LANÇAMENTO</div>
          <div className="cd-mock-banner-title">Até 30% de desconto<br />na abertura</div>
        </div>
        <div className="fa-brands-strip">
          {FAKE_BRANDS.map((brand) => (
            <div key={brand.name} className="fa-brand-circle">
              <span className="fa-brand-circle-img"><img src={brand.image} alt="" loading="lazy" /></span>
              <span className="fa-brand-circle-label">{brand.name}</span>
            </div>
          ))}
        </div>
        <div className="fa-eyebrow" style={{ marginBottom: 6 }}>ECONOMIZE</div>
        <div className="fa-h2" style={{ marginBottom: 18 }}>Produtos com até 95% de desconto</div>
        <div className="cd-mock-grid">{FAKE_MARKETPLACE_ITEMS.slice(0, 6).map(_fakeShopTile)}</div>
        <div className="fa-eyebrow" style={{ margin: '28px 0 6px' }}>NOVIDADES</div>
        <div className="fa-h2" style={{ marginBottom: 18 }}>Chegou pra você</div>
        <div className="cd-mock-grid">{FAKE_MARKETPLACE_ITEMS.slice(6, 12).map(_fakeShopTile)}</div>
      </div>
    </div>
  );
}

// Red/vinho-led on purpose — reds are weighted to show up more often than the lighter rose tones,
// so the field reads as "red confetti with brand accents", not a pale pink haze.
const CONFETTI_PALETTE = [
  { color: '#E03131', kind: 'pill', opacity: .88 },  // vital
  { color: '#E03131', kind: 'dot', opacity: .82 },   // vital
  { color: '#A11017', kind: 'pill', opacity: .8 },   // primary
  { color: '#A11017', kind: 'dot', opacity: .75 },   // primary
  { color: '#E03131', kind: 'pill', opacity: .85 },  // vital (repeated — bias the draw toward red)
  { color: '#FFD5D5', kind: 'dot', opacity: .9 },    // rose accent
  { color: '#FFECEC', kind: 'dot', opacity: .85 },   // rose-soft accent
];

const _randomBetween = (a, b) => a + Math.random() * (b - a);

function _spawnConfettiParticle(width, height, edge) {
  const palette = CONFETTI_PALETTE[Math.floor(Math.random() * CONFETTI_PALETTE.length)];
  let x, y, vx;
  if (edge === 'left') { x = -24; y = _randomBetween(0, height); vx = _randomBetween(50, 90); }
  else if (edge === 'right') { x = width + 24; y = _randomBetween(0, height); vx = -_randomBetween(50, 90); }
  else { x = _randomBetween(0, width); y = _randomBetween(-height, -10); vx = _randomBetween(-14, 14); }
  return {
    x, y, vx,
    vy: _randomBetween(40, 85),
    size: _randomBetween(6, 15),
    rotation: _randomBetween(0, Math.PI * 2),
    rotationSpeed: _randomBetween(-2.2, 2.2),
    swayPhase: _randomBetween(0, Math.PI * 2),
    swaySpeed: _randomBetween(1.1, 2.1),
    swayAmp: _randomBetween(20, 42),
    kind: palette.kind,
    color: palette.color,
    opacity: palette.opacity ?? _randomBetween(.7, .9),
  };
}

// Ambient confetti over the mocked storefront: falls slowly, a fraction of pieces drift in from
// the left/right edges instead of only from the top, and pieces near the cursor get gently pushed
// away (mouse "brushes" the confetti aside) before drifting back into their normal fall. Sits
// above the scrim (stays vivid, not veiled/blurred with the mock site) but below the countdown
// card (z-index — see marketplace.css), so it falls in front of the storefront and disappears
// behind the card exactly like it did when confetti was the only decoration. Respects
// prefers-reduced-motion by painting one static frame and skipping the loop and mouse tracking.
function LaunchConfetti() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const PARTICLE_COUNT = 68;
    const MOUSE_INFLUENCE = 120;

    let width = 0;
    let height = 0;
    let particles = [];
    let frameId = null;
    let lastTime = performance.now();
    const mouse = { x: -9999, y: -9999 };

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawParticle = (p) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      if (p.kind === 'pill') {
        const w = p.size * 1.8;
        const h = p.size * .75;
        const r = h / 2;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + r, -h / 2);
        ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
        ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
        ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
        ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    resize();
    particles = Array.from({ length: PARTICLE_COUNT }, () => {
      const edge = Math.random() < .22 ? (Math.random() < .5 ? 'left' : 'right') : 'top';
      const p = _spawnConfettiParticle(width, height, edge);
      p.y = _randomBetween(0, height); // scatter across on first paint instead of starting off-screen
      return p;
    });

    if (reduceMotion) {
      ctx.clearRect(0, 0, width, height);
      particles.forEach(drawParticle);
      return () => {};
    }

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const handleMouseLeave = () => { mouse.x = -9999; mouse.y = -9999; };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('resize', resize);

    const step = (now) => {
      const dt = Math.min((now - lastTime) / 1000, .05);
      lastTime = now;
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_INFLUENCE) {
          const force = (1 - dist / MOUSE_INFLUENCE) * 95;
          const angle = Math.atan2(dy, dx);
          p.x += Math.cos(angle) * force * dt;
          p.y += Math.sin(angle) * force * dt;
        }

        p.swayPhase += p.swaySpeed * dt;
        p.x += Math.sin(p.swayPhase) * p.swayAmp * dt + p.vx * dt * .4;
        p.y += p.vy * dt;
        p.rotation += p.rotationSpeed * dt;

        if (p.y - p.size > height + 20 || p.x < -60 || p.x > width + 60) {
          const edge = Math.random() < .25 ? (Math.random() < .5 ? 'left' : 'right') : 'top';
          Object.assign(p, _spawnConfettiParticle(width, height, edge));
        }
        drawParticle(p);
      }

      frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="cd-confetti-canvas" aria-hidden="true" />;
}

// Full-page takeover: no Header/Footer/cart/login — every visitor, logged in or not, sees only
// this until the configured instant passes (see PortalService._resolve_launch_mode). Ticks locally
// against the client's own clock; onLaunch triggers a one-time reload so the real bootstrap
// (already re-fetched periodically by the caller) takes over without the visitor refreshing by hand.
function LaunchCountdownScreen({ launchMode, onLaunch }) {
  const launchAtMs = useMemo(() => {
    const parsed = new Date(launchMode.launchAt).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [launchMode.launchAt]);
  const [remaining, setRemaining] = useState(() => launchAtMs - Date.now());

  useEffect(() => {
    const tick = () => {
      const next = launchAtMs - Date.now();
      setRemaining(next);
      if (next <= 0) onLaunch && onLaunch();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [launchAtMs, onLaunch]);

  const parts = splitCountdown(remaining);

  return (
    <div className="cd-scene">
      <LaunchMarketplaceMock />
      <div className="cd-scrim" />
      <LaunchConfetti />
      <div className="fa-wrap fa-fadein cd-scene-content" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', textAlign: 'center' }}>
        <div className="cd-card" style={{ maxWidth: 560 }}>
          <img className="cd-logo" src={MARKETPLACE_LOGO_FULL_URL} alt="Farmaura" />
          <h1 className="fa-h1" style={{ marginBottom: 12 }}>{launchMode.headline || 'Estamos quase lá'}</h1>
          <p className="fa-lead" style={{ marginBottom: 32 }}>
            {launchMode.subtext || 'A drogaria Farmaura está chegando. Volte em breve para conferir novidades e ofertas de lançamento.'}
          </p>
          {launchAtMs > 0 && (
            <div className="cd-clock">
              {LAUNCH_COUNTDOWN_UNITS.map((unit, index) => (
                <React.Fragment key={unit.key}>
                  {index > 0 && <span className="cd-sep">:</span>}
                  <div className="cd-unit">
                    <div className="cd-unit-digits">
                      <FlipDigit value={Math.floor(parts[unit.key] / 10) % 10} />
                      <FlipDigit value={parts[unit.key] % 10} />
                    </div>
                    <div className="cd-unit-label">{unit.label}</div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const authClient = useMemo(() => window.FA_API.createClient('marketplace'), []);
  const t = MARKETPLACE_DEFAULTS;
  const [portalData, setPortalData] = useState(() => normalizeMarketplacePortalData(window.FA_PORTAL_CACHE.readLocal('marketplace', null, MARKETPLACE_BOOTSTRAP_STORAGE_KEY, {})));
  const [products, setProducts] = useState(() => resolveMarketplaceCatalogSnapshot());
  const navigate = useNavigate();
  const urlParams = useParams();
  const [searchParams] = useSearchParams();
  const route = useMemo(
    () => parseMarketplaceRoute(urlParams['*'], searchParams),
    [urlParams['*'], searchParams]
  );
  const goTo = (r) => navigate(buildMarketplacePath(r));
  useMarketplaceDocumentTitle(route, products);
  useMarketplaceRobotsMeta(route);
  const [items, setItems] = useState([]);
  // Every async call that replaces the *entire* cart from a server response (syncCartItem,
  // removeCartItem, the bootstrap's own cart fetch) bumps this before firing its request and
  // checks it before applying the response. Two cart-mutating requests can resolve out of
  // order (normal network jitter, not something reproducible on a fast local docker network) —
  // without this guard, an older response landing after a newer one silently reverts it,
  // collapsing the cart down to whatever that stale snapshot had (reported bug: toggling
  // recurrence on one item made the others disappear until a refresh restored them from the
  // real, unaffected server state — the server was always right, only the client overwrote
  // itself with a stale response).
  const cartMutationSeqRef = useRef(0);
  const [coupon, setCoupon] = useState(null);
  const [fav, setFav] = useState([]);
  const [availabilityAlerts, setAvailabilityAlerts] = useState([]);
  const [prescriptionStatus, setPrescriptionStatus] = useState({ status: 'none', prescriptionId: '', rejectionReason: '', submittedAtLabel: '' });
  const [cashbackWallet, setCashbackWallet] = useState({ availableBalance: 0, pendingBalance: 0, lifetimeEarnedTotal: 0, redeemedTotal: 0, redeemMaxPercent: 25, entries: [] });
  const [anniversaryOffers, setAnniversaryOffers] = useState([]);
  // Declared once per checkout session (client-side only, no server model backs it — a paper
  // prescription never becomes a Prescription row until the pharmacist reviews the physical
  // original at pickup): 'digital' keeps the existing chat-upload + online-approval gate;
  // 'physical' instead forces pickup-only delivery and pay-at-pickup, enforced in
  // checkout-screen.jsx. Lost on a hard reload by design — re-asking is the safe fallback.
  const [prescriptionKind, setPrescriptionKind] = useState('');
  const [orders, setOrders] = useState([]);
  const [ordersRevision, setOrdersRevision] = useState('');
  const [lastOrder, setLastOrder] = useState(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [toast, setToast] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidgetOpenSignal, setChatWidgetOpenSignal] = useState(0);
  const [chatWidgetContext, setChatWidgetContext] = useState(null);
  const [chatThreads, setChatThreads] = useState([]);
  const [activeChatThreadId, setActiveChatThreadId] = useState(null);
  // Threads the customer has actually touched (created or reused) *this* browser session —
  // reset to empty on every fresh page load. The full-history page (chat-history-screen.jsx)
  // shows every thread in `chatThreads`; the floating widget only ever offers these, per the
  // explicit "widget = only what's active right now" / "page = everything" split.
  const [sessionChatThreadIds, setSessionChatThreadIds] = useState([]);
  const [pendingAuth, setPendingAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [recent, setRecent] = useState([]);
  const [subs, setSubs] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [cards, setCards] = useState([]);
  const [customerProfile, setCustomerProfile] = useState(() => createMarketplaceProfileSnapshot(null));
  const [mostSearchedProductIds, setMostSearchedProductIds] = useState([]);
  useEffect(() => {
    // Public, best-effort ranking (real sales volume, online + PDV) for the "Mais buscados"
    // home shortcut and the "discover" listing — see catalog_service.list_most_searched_products.
    let active = true;
    (async () => {
      try {
        const response = await authClient.publicRequest('/catalog/most-searched?months=3&limit=10', { method: 'GET' });
        if (!active) return;
        setMostSearchedProductIds(Array.isArray(response.items) ? response.items.map((item) => item.product_id).filter(Boolean) : []);
      } catch {
        // The shortcut still navigates fine without a real ranking behind it.
      }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    let retryTimer = null;

    async function restoreSession() {
      const stored = authClient.getStoredAuth();
      if (!stored) {
        if (active) {
          setAuthReady(true);
        }
        return;
      }
      try {
        const sessionData = await authClient.fetchSession();
        if (!active) {
          return;
        }
        const nextUser = window.FA_ACCESS.normalizeMarketplaceUser(window.FA_ACCESS.createUserFromSession(sessionData));
        if (!window.FA_ACCESS.canAccessMarketplace(nextUser)) {
          authClient.clear();
          if (active) {
            setUser(null);
          }
          return;
        }
        setUser(nextUser);
      } catch (error) {
        const status = Number(error && error.status || 0);
        if ([502, 503, 504].includes(status)) {
          if (active && retryTimer == null) {
            retryTimer = window.setTimeout(() => {
              retryTimer = null;
              if (active) {
                void restoreSession();
              }
            }, 1500);
          }
        } else {
          authClient.clear();
          if (active) {
            setUser(null);
          }
        }
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    }

    void restoreSession();
    return () => {
      active = false;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [authClient]);
  useEffect(() => {
    // Logging in mid-session (e.g. from the checkout gate, with items already in the guest
    // cart) used to silently drop that cart: this effect swapped straight to the just-logged-in
    // user's own (usually empty) cart cache, keyed separately from the anonymous one. Merge the
    // guest cart into the account cart instead, standard "cart survives login" behavior — only
    // on an actual anonymous-to-logged-in transition (current `user` truthy), never on logout,
    // where adopting the next (guest) cache as-is is correct.
    const nextItems = readMarketplaceScopedCache(user, MARKETPLACE_CART_STORAGE_KEY, []);
    let guestItemsToPersist = [];
    setItems((prevItems) => {
      if (!user || !prevItems.length) {
        return nextItems;
      }
      const merged = nextItems.map((item) => ({ ...item }));
      prevItems.forEach((guestItem) => {
        const existing = merged.find((item) => item.id === guestItem.id);
        if (existing) {
          existing.qty += guestItem.qty;
        } else {
          merged.push(guestItem);
        }
      });
      guestItemsToPersist = prevItems.map((guestItem) => merged.find((item) => item.id === guestItem.id) || guestItem);
      return merged;
    });
    setRecent(readMarketplaceScopedCache(user, MARKETPLACE_RECENT_STORAGE_KEY, []));
    setChatThreads(normalizeMarketplaceChatThreads(readMarketplaceScopedCache(user, MARKETPLACE_CHAT_STORAGE_KEY, [])));
    setActiveChatThreadId(null);
    if (user && guestItemsToPersist.length) {
      // The guest cart merged above only ever lived in local state/cache — the server has never
      // seen these items. Left unsynced, the *next* single-item cart mutation (e.g. toggling
      // recurrence) would PUT just that one item and apply the server's "full cart" response
      // as-is, silently wiping every other item the server doesn't know about. Persist the
      // merged guest items to the account's server cart now, one at a time (not in parallel —
      // each response is only guaranteed complete relative to the upserts already committed
      // before it), so the server becomes authoritative before any other mutation can happen.
      (async () => {
        for (const item of guestItemsToPersist) {
          try {
            await syncCartItem(item.id, item.qty, item.sub);
          } catch (error) {
            // best-effort: item stays visible locally/in cache but may not survive a later
            // single-item server mutation if this persist keeps failing.
          }
        }
      })();
    }
  }, [user && user.id]);

  useEffect(() => {
    writeMarketplaceScopedCache(user, MARKETPLACE_CART_STORAGE_KEY, items);
  }, [user && user.id, items]);

  useEffect(() => {
    writeMarketplaceScopedCache(user, MARKETPLACE_RECENT_STORAGE_KEY, recent);
  }, [user && user.id, recent]);

  useEffect(() => {
    writeMarketplaceScopedCache(user, MARKETPLACE_CHAT_STORAGE_KEY, chatThreads);
  }, [user && user.id, chatThreads]);

  useEffect(() => {
    setCustomerProfile((current) => {
      const baseProfile = createMarketplaceProfileSnapshot(user);
      if (!user) {
        return baseProfile;
      }
      return {
        ...baseProfile,
        ...current,
        name: current.name || baseProfile.name,
        email: current.email || baseProfile.email,
        photo: current.photo || baseProfile.photo,
        twoFactor: baseProfile.twoFactor,
      };
    });
  }, [user && user.id, user && user.name, user && user.email, user && user.photo, user && user.twoFactorEnabled]);

  useEffect(() => {
    window.FA_OBS.initPortal({
      portal: 'marketplace',
      getRoute: () => route.name,
      getUser: () => user,
    });
  }, []);
  useEffect(() => {
    window.FA_OBS.emit({
      portal: 'marketplace',
      type: 'navigation',
      action: 'route.changed',
      route: route.name,
      userRole: user && user.role || '',
      accessScope: user && user.accessScope || '',
      metadata: {
        productId: route.id || '',
        category: route.cat || '',
        tab: route.tab || '',
      },
    });
  }, [route.name, route.id, route.cat, route.tab, user]);

  useEffect(() => {
    const syncPublishedProducts = () => {
      if (canUseLiveMarketplaceCatalog(user)) {
        return;
      }
      setProducts(resolveMarketplaceCatalogSnapshot());
    };
    const onStorage = (event) => {
      if (!event.key || event.key === MARKETPLACE_CATALOG_STORAGE_KEY) {
        syncPublishedProducts();
      }
    };
    syncPublishedProducts();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', syncPublishedProducts);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', syncPublishedProducts);
    };
  }, [user]);

  useEffect(() => {
    const aliasToId = buildMarketplaceAliasMap(products);
    if (!aliasToId.size) {
      return;
    }
    setItems((prev) => remapCollectionIds(prev, aliasToId));
  }, [products]);

  useEffect(() => {
    if (!Array.isArray(products) || !products.length) {
      return;
    }
    setItems((prev) => {
      const next = filterMarketplaceCollectionByCatalog(prev, products);
      if (next.length === prev.length) {
        return prev;
      }
      showToast('Itens indisponiveis foram removidos do carrinho');
      return next;
    });
  }, [products]);

  const patchSub = async (id, patch) => {
    const payload = {};
    if (Object.prototype.hasOwnProperty.call(patch, 'qty')) payload.quantity = Math.max(1, Number(patch.qty || 1));
    if (Object.prototype.hasOwnProperty.call(patch, 'freq')) payload.frequency_days = Math.max(1, Number(patch.freq || 30));
    if (Object.prototype.hasOwnProperty.call(patch, 'paused')) payload.is_paused = !!patch.paused;
    const response = await authClient.request('/portal/marketplace/subscriptions/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    const nextSubs = Array.isArray(response) ? response.map(normalizeMarketplaceSubscription).filter(Boolean) : [];
    setSubs(nextSubs);
  };
  const removeSub = async (id) => {
    const response = await authClient.request('/portal/marketplace/subscriptions/' + encodeURIComponent(id), { method: 'DELETE' });
    setSubs(Array.isArray(response) ? response.map(normalizeMarketplaceSubscription).filter(Boolean) : []);
  };
  const addSub = async (id, freq = 30) => {
    const response = await authClient.request('/portal/marketplace/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ product_ref: id, quantity: 1, frequency_days: Number(freq || 30) }),
    });
    setSubs(Array.isArray(response) ? response.map(normalizeMarketplaceSubscription).filter(Boolean) : []);
  };
  const skipNextSub = async (id) => {
    const response = await authClient.request('/portal/marketplace/subscriptions/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ skip_next_cycle: true }),
    });
    setSubs(Array.isArray(response) ? response.map(normalizeMarketplaceSubscription).filter(Boolean) : []);
  };
  const submitProductReview = (payload) => authClient.request('/portal/products/reviews', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [route.name, route.cat, route.id, route.query]);

  // ---- handlers ----
  const onNav = (r) => {
    if (r && r.name === 'product' && r.id) setRecent((prev) => [r.id, ...prev.filter((x) => x !== r.id)].slice(0, 8));
    // Remember where the customer was before sending them to log in, so a plain "Entrar / Criar
    // conta" click from a product/category/etc. page returns there after a successful login
    // instead of dropping them on the home page. requireAuth's own goTo({name:'login'}) (used by
    // checkout) is untouched — it already replays the original action via pendingAuth, a better
    // recovery than a route reload for a flow with real in-progress state.
    if (r && r.name === 'login' && !r.next && route && route.name !== 'login') {
      r = { ...r, next: buildMarketplacePath(route) };
    }
    window.FA_OBS.emit({
      portal: 'marketplace',
      type: 'navigation',
      action: 'navigation.requested',
      route: r && r.name || '',
      userRole: user && user.role || '',
      accessScope: user && user.accessScope || '',
    });
    goTo(r);
  };
  const onSearch = (q) => {
    window.FA_OBS.emit({
      portal: 'marketplace',
      type: 'search',
      action: 'catalog.search',
      route: 'search',
      userRole: user && user.role || '',
      accessScope: user && user.accessScope || '',
      detail: String(q || '').slice(0, 80),
    });
    goTo({ name: 'search', query: q });
  };
  const showToast = (msg) => { setToast(msg); clearTimeout(window.__faT); window.__faT = setTimeout(() => setToast(null), 2200); };
  const markChatThreadRead = (threadId) => {
    setChatThreads((prev) => prev.map((thread) => thread.id === threadId ? { ...thread, unread: 0 } : thread));
  };
  // Shared shape for one API thread response, mirroring normalizeChatMessageFromApi above —
  // kept in one place so threadStatus/closedReason can't drift out of sync between the three
  // call sites (ensure/send/send-attachment) the way every other field almost did.
  const normalizeChatThreadFromApi = (response) => ({
    id: response.id,
    topic: response.topic,
    orderCode: response.order && response.order !== '—' ? response.order : '',
    protocol: response.protocol || '',
    unread: response.unread,
    lastAt: response.last_at || response.lastAt,
    pharmacistName: response.pharmacist_name || response.pharmacistName || (portalData.pharmacist && portalData.pharmacist.name) || '',
    messages: Array.isArray(response.msgs) ? response.msgs.map(normalizeChatMessageFromApi) : [],
    threadStatus: response.thread_status || 'open',
    closedReason: response.closed_reason || '',
  });
  const registerSessionChatThread = (threadId) => {
    setSessionChatThreadIds((prev) => prev.includes(threadId) ? prev : [...prev, threadId]);
  };
  // Restores which thread(s) the widget had active before a reload — user isn't known yet at
  // useState-initializer time (auth restoration is async), so this runs once user resolves,
  // rather than trying to read storage synchronously at mount.
  useEffect(() => {
    if (!user) {
      return;
    }
    const savedSessionIds = readMarketplaceScopedSessionCache(user, 'chat_session_thread_ids', []);
    if (Array.isArray(savedSessionIds) && savedSessionIds.length) {
      setSessionChatThreadIds(savedSessionIds);
    }
    const savedActiveId = readMarketplaceScopedSessionCache(user, 'chat_active_thread_id', null);
    if (savedActiveId) {
      setActiveChatThreadId(savedActiveId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.id]);
  useEffect(() => {
    if (!user) {
      return;
    }
    writeMarketplaceScopedSessionCache(user, 'chat_session_thread_ids', sessionChatThreadIds);
  }, [user, sessionChatThreadIds]);
  useEffect(() => {
    if (!user) {
      return;
    }
    writeMarketplaceScopedSessionCache(user, 'chat_active_thread_id', activeChatThreadId);
  }, [user, activeChatThreadId]);
  // Chat has no push/real-time delivery (REST-only by design) — without this, a reply from the
  // pharmacist only ever showed up after something else happened to refetch threads (sending a
  // message, switching threads, a full reload). Polls only while logged in; harmless when no
  // chat surface is even visible, same trade-off already accepted for the orders board's polling.
  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await authClient.request('/chat/customer/threads', { method: 'GET' });
        if (cancelled) {
          return;
        }
        const normalized = (response && response.items || []).map(normalizeChatThreadFromApi);
        setChatThreads((prev) => normalized.map((thread) => (
          // Don't let a poll resurrect an unread badge on the thread the customer is currently
          // looking at — the server only zeroes customer_unread_count when *they* send a
          // message, not on open/select, so without this a stared-at thread would flicker.
          thread.id === activeChatThreadId ? { ...thread, unread: 0 } : thread
        )));
      } catch {
        // best-effort — a transient failure here shouldn't surface as an error toast
      }
    };
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user, authClient, activeChatThreadId]);
  const ensureMarketplaceChatThread = async (options = {}) => {
    if (options.threadId) {
      const existingById = chatThreads.find((thread) => thread.id === options.threadId);
      if (existingById) {
        registerSessionChatThread(existingById.id);
        return existingById;
      }
    }
    const orderId = (options.order && options.order.recordId) || null;
    if (!orderId) {
      // No order to key off yet — cart/checkout's prescription chat and every general "falar com
      // farmacêutico" entry point all land here with orderId null. The backend already dedupes by
      // order_id when one is passed (ChatService.ensure_customer_thread), but can't do that for an
      // orderless request, so without this it POSTed a brand new "Atendimento farmacêutico" thread
      // on every single click. Reuse whichever open, orderless thread the customer already has.
      const existingGeneral = chatThreads.find((thread) => !thread.orderCode && thread.threadStatus !== 'closed');
      if (existingGeneral) {
        registerSessionChatThread(existingGeneral.id);
        return existingGeneral;
      }
    }
    const response = await authClient.request('/chat/customer/threads', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId }),
    });
    const normalized = normalizeChatThreadFromApi(response);
    setChatThreads((prev) => {
      const filtered = prev.filter((thread) => thread.id !== normalized.id);
      return [normalized, ...filtered];
    });
    registerSessionChatThread(normalized.id);
    return normalized;
  };
  // Sets the active thread without touching chatOpen — unlike selectChatThread below, which is
  // specifically for contexts already inside the full modal. Used by the widget's own inline
  // switcher and by the full chat-history page, neither of which should pop the modal open.
  const activateChatThread = (threadId) => {
    setActiveChatThreadId(threadId);
    markChatThreadRead(threadId);
  };
  // The one entry point for "falar com farmacêutico" everywhere in the app (header, drawer,
  // footer, the floating widget, the old "Receita digital" spots — see openPrescription below):
  // logged out goes straight to WhatsApp (real-time channel that needs no account), logged in
  // opens the real chat modal, which is also how a prescription file gets attached to their
  // account. No more inline-login-then-chat detour for a visitor who isn't signed in yet.
  // Most callers fire this from a plain onClick without awaiting it, so failures are caught
  // and toasted right here — nothing upstream would ever see the rejection otherwise.
  const openChat = (options = {}) => {
    if (!user) {
      window.open(buildPharmacistWhatsAppUrl(options.whatsappMessage), '_blank', 'noopener,noreferrer');
      return;
    }
    setChatOpen(true);
    return (async () => {
      try {
        const thread = await ensureMarketplaceChatThread(options);
        if (thread && thread.id) {
          activateChatThread(thread.id);
        }
      } catch (error) {
        showToast(error && error.message ? error.message : 'Não foi possível abrir o chat. Tente novamente.');
      }
    })();
  };
  const selectChatThread = (threadId) => {
    activateChatThread(threadId);
    setChatOpen(true);
  };
  // The floating bubble's own opener: unlike openChat() above, this never touches chatOpen (the
  // full modal) — it's the general (no order) thread, created on first use this session and
  // reused afterward, exactly like every other openChat() caller, just without popping the modal.
  const openWidgetChat = async () => {
    try {
      const thread = await ensureMarketplaceChatThread({});
      if (thread && thread.id) {
        activateChatThread(thread.id);
      }
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível abrir o chat. Tente novamente.');
    }
  };
  // A caller who isn't the floating bubble itself (checkout's "Enviar receita", for a physical-
  // vs-digital-declared-digital prescription) wants the small widget panel — not the full
  // PharmacistChatModal — to actually pop open, not just have a thread ready for whenever the
  // customer happens to click the bubble. `chatWidgetOpenSignal` is a pure signal (see
  // ChatWidget's `openSignal` prop): incrementing it is what makes the already-collapsed panel
  // expand.
  const openWidgetChatPanel = async (context = null) => {
    await openWidgetChat();
    setChatWidgetOpenSignal((current) => current + 1);
    // Optional context banner the panel shows above the conversation — e.g. "prescription_digital"
    // reminds the customer what to actually send here right when the panel opens for that reason,
    // instead of a blank chat with no clue why it just popped open.
    setChatWidgetContext(context);
  };
  // Errors (rate limit, permanent block, thread frozen) are toasted here for immediate global
  // visibility, then re-thrown so the composer (PharmacistChatPanel.send) can also keep the
  // typed text instead of clearing it, and — for a block specifically — offer "contest".
  const sendChatMessage = async (threadId, messageText) => {
    const textValue = String(messageText || '').trim();
    if (!threadId || !textValue) {
      return;
    }
    const isPrescriptionLink = CHAT_URL_ONLY_PATTERN.test(textValue);
    try {
      // A bare link goes to the dedicated endpoint so it creates a real Prescription the
      // pharmacist can validate/reject — a plain text message with a URL in it would otherwise
      // just sit there, unreadable as a submission and never unblocking payment.
      const response = isPrescriptionLink
        ? await authClient.request('/chat/customer/threads/' + encodeURIComponent(threadId) + '/prescriptions/link', {
            method: 'POST',
            body: JSON.stringify({ url: textValue }),
          })
        : await authClient.request('/chat/customer/threads/' + encodeURIComponent(threadId) + '/messages', {
            method: 'POST',
            body: JSON.stringify({ text: textValue }),
          });
      const normalized = normalizeChatThreadFromApi(response);
      setChatThreads((prev) => [normalized, ...prev.filter((thread) => thread.id !== normalized.id)]);
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível enviar a mensagem. Tente novamente.');
      throw error;
    }
  };
  // Folds "enviar receita digital" into the chat: the backend validates the file (real content
  // sniffing, not just the extension/Content-Type the browser claims — see
  // app/core/file_validation.py), stores it, and links it to both a new Prescription (so it
  // reaches the pharmacist's existing review queue) and this chat message in one request. Errors
  // (wrong file type, too large, content that doesn't match its declared type, rate limit) surface
  // as a rejected promise — the composer UI already has its own inline error slot for this one.
  const sendPrescriptionAttachment = async (threadId, file, note) => {
    if (!threadId || !file) {
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('note', String(note || '').slice(0, 1000));
    const response = await authClient.request(
      '/chat/customer/threads/' + encodeURIComponent(threadId) + '/prescriptions',
      { method: 'POST', skipJsonContentType: true, body: formData },
    );
    const normalized = normalizeChatThreadFromApi(response);
    setChatThreads((prev) => [normalized, ...prev.filter((thread) => thread.id !== normalized.id)]);
  };
  // The customer's appeal against their current chat block — see app.core.chat_guard. Errors
  // (already-blocked-elsewhere-check failed, an appeal already pending) are left to the caller
  // (the composer's own "contestar bloqueio" form) since they need inline, not toast, display.
  const sendChatUnblockRequest = async (message) => {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
      return;
    }
    await authClient.request('/chat/customer/unblock-requests', {
      method: 'POST',
      body: JSON.stringify({ message: trimmed }),
    });
  };
  const syncCartItem = async (id, quantity, sub) => {
    const seq = ++cartMutationSeqRef.current;
    const response = await authClient.request('/customers/me/cart/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify({ quantity, is_subscription: !!sub }),
    });
    if (seq !== cartMutationSeqRef.current) {
      return;
    }
    setItems((prev) => {
      const byRef = Object.fromEntries(prev.map((it) => [it.id, it]));
      const serverItems = (Array.isArray(response) ? response : []).map((entry) => ({
        id: entry.product_ref,
        qty: entry.quantity,
        sub: entry.is_subscription,
        freq: (byRef[entry.product_ref] && byRef[entry.product_ref].freq) || 30,
      }));
      // PUT never deletes, so any item present in `prev` but missing from `response` isn't a
      // real removal — it's an item the server hasn't been told about yet (e.g. a guest-cart
      // item still being persisted after login, see the login-merge effect above). Keep it
      // instead of letting this "full cart" response silently drop it from the UI.
      const merged = serverItems.map((item) => ({ ...item }));
      prev.forEach((localItem) => {
        if (!merged.some((item) => item.id === localItem.id)) {
          merged.push(localItem);
        }
      });
      return merged;
    });
  };
  const removeCartItem = async (id) => {
    const seq = ++cartMutationSeqRef.current;
    const response = await authClient.request('/customers/me/cart/' + encodeURIComponent(id), { method: 'DELETE' });
    if (seq !== cartMutationSeqRef.current) {
      return;
    }
    setItems((prev) => {
      const byRef = Object.fromEntries(prev.map((it) => [it.id, it]));
      return (Array.isArray(response) ? response : []).map((entry) => ({
        id: entry.product_ref,
        qty: entry.quantity,
        sub: entry.is_subscription,
        freq: (byRef[entry.product_ref] && byRef[entry.product_ref].freq) || 30,
      }));
    });
  };
  const addToCart = (p, qty = 1, sub = false) => {
    if (!p || Number(p.stock || 0) <= 0) {
      showToast('Produto sem estoque no momento');
      return;
    }
    window.FA_OBS.emit({
      portal: 'marketplace',
      type: 'commerce',
      action: 'cart.add',
      route: route.name,
      userRole: user && user.role || '',
      accessScope: user && user.accessScope || '',
      metadata: { productId: p.id, quantity: qty, subscription: sub },
    });
    const existing = items.find((it) => it.id === p.id);
    const nextQty = existing ? existing.qty + qty : qty;
    const nextSub = sub || (existing && existing.sub) || false;
    if (user) {
      syncCartItem(p.id, nextQty, nextSub).catch((error) => {
        showToast(error && error.message ? error.message : 'Não foi possível atualizar o carrinho.');
      });
    } else {
      setItems((prev) => {
        const ex = prev.find((it) => it.id === p.id);
        if (ex) return prev.map((it) => it.id === p.id ? { ...it, qty: it.qty + qty, sub: sub || it.sub } : it);
        return [...prev, { id: p.id, qty, sub }];
      });
    }
    showToast(`${p.name.split('—')[0].trim()} adicionado`);
  };
  const updateQty = (id, qty) => {
    window.FA_OBS.emit({ portal: 'marketplace', type: 'commerce', action: 'cart.update_quantity', route: route.name, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { productId: id, quantity: qty } });
    if (user) {
      const existing = items.find((it) => it.id === id);
      const action = qty <= 0 ? removeCartItem(id) : syncCartItem(id, qty, existing && existing.sub);
      action.catch((error) => showToast(error && error.message ? error.message : 'Não foi possível atualizar o carrinho.'));
      return;
    }
    setItems((prev) => qty <= 0 ? prev.filter((it) => it.id !== id) : prev.map((it) => it.id === id ? { ...it, qty } : it));
  };
  const removeItem = (id) => {
    window.FA_OBS.emit({ portal: 'marketplace', type: 'commerce', action: 'cart.remove', route: route.name, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { productId: id } });
    if (user) {
      removeCartItem(id).catch((error) => showToast(error && error.message ? error.message : 'Não foi possível remover o item.'));
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };
  const patchItem = (id, patch) => {
    if (user && Object.prototype.hasOwnProperty.call(patch || {}, 'sub')) {
      const existing = items.find((it) => it.id === id);
      syncCartItem(id, (existing && existing.qty) || 1, patch.sub).catch((error) => {
        showToast(error && error.message ? error.message : 'Não foi possível atualizar o carrinho.');
      });
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, ...patch } : it));
      return;
    }
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, ...patch } : it));
  };
  const toggleItemSub = (id) => {
    const existing = items.find((it) => it.id === id);
    patchItem(id, { sub: !(existing && existing.sub) });
  };
  const toggleFav = async (id) => {
    window.FA_OBS.emit({ portal: 'marketplace', type: 'engagement', action: 'saved.toggle', route: route.name, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { productId: id } });
    if (!user) {
      requireAuth(() => {});
      return;
    }
    const response = fav.includes(id)
      ? await authClient.request('/portal/marketplace/favorites/' + encodeURIComponent(id), { method: 'DELETE' })
      : await authClient.request('/portal/marketplace/favorites', { method: 'POST', body: JSON.stringify({ product_ref: id }) });
    setFav(Array.isArray(response) ? response.map((entry) => entry && entry.product_ref).filter(Boolean) : []);
  };
  // "Avise-me quando chegar": subscribes/unsubscribes to a back-in-stock e-mail for one out-of-stock or hidden product.
  const subscribeAvailabilityAlert = (id, productName) => {
    requireAuth(async () => {
      try {
        const response = await authClient.request('/customers/me/availability-alerts/' + encodeURIComponent(id), {
          method: 'PUT',
          body: JSON.stringify({ product_name: productName || '' }),
        });
        setAvailabilityAlerts(Array.isArray(response) ? response.map((entry) => entry && entry.product_ref).filter(Boolean) : []);
        showToast('Vamos te avisar por e-mail quando chegar!');
      } catch (error) {
        showToast(error && error.message ? error.message : 'Não foi possível registrar o aviso.');
      }
    });
  };
  const unsubscribeAvailabilityAlert = async (id) => {
    try {
      const response = await authClient.request('/customers/me/availability-alerts/' + encodeURIComponent(id), { method: 'DELETE' });
      setAvailabilityAlerts(Array.isArray(response) ? response.map((entry) => entry && entry.product_ref).filter(Boolean) : []);
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível remover o aviso.');
    }
  };
  const invalidateMarketplaceSession = () => {
    authClient.clear();
    setUser(null);
    setOrders([]);
    setOrdersRevision('');
  };

  const applyAuthenticatedFlow = async (flow, rememberSession) => {
    authClient.persistAuthenticatedFlow(flow, rememberSession);
    const sessionData = await authClient.fetchSession();
    const nextUser = window.FA_ACCESS.normalizeMarketplaceUser(window.FA_ACCESS.createUserFromSession(sessionData));
    if (!window.FA_ACCESS.canAccessMarketplace(nextUser)) {
      invalidateMarketplaceSession();
      throw new Error('Nao foi possivel concluir o acesso com as credenciais informadas.');
    }
    setUser(nextUser);
    window.FA_OBS.emit({
      portal: 'marketplace',
      type: 'auth',
      action: 'auth.login',
      route: route.name,
      userRole: nextUser.role,
      accessScope: nextUser.accessScope,
      detail: nextUser.email,
    });
    showToast('Bem-vinda, ' + nextUser.name.split(' ')[0] + '!');
    return nextUser;
  };
  const finalizeAuthenticatedSession = async (flow, rememberSession) => {
    const nextUser = await applyAuthenticatedFlow(flow, rememberSession);
    // route.next is the page the customer was on before choosing to log in (see onNav) — return
    // there instead of always dropping them on home. navigate() takes the raw path directly,
    // unlike goTo() which only accepts a route object.
    const returnPath = route && route.next ? route.next : '';
    if (pendingAuth) { const act = pendingAuth; setPendingAuth(null); if (returnPath) navigate(returnPath); else goTo({ name: 'home' }); act(); }
    else if (returnPath) navigate(returnPath);
    else goTo({ name: 'home' });
    return nextUser;
  };
  // Runs `action` if logged in; otherwise routes to login and replays it after sign-in.
  const requireAuth = (action) => {
    if (user) {
      action();
      return;
    }
    window.FA_OBS.emit({ portal: 'marketplace', type: 'auth', action: 'auth.required_redirect', route: route.name });
    setPendingAuth(() => action);
    goTo({ name: 'login' });
  };
  // Envio de receita agora acontece dentro do chat com o farmacêutico (anexo na conversa —
  // ver sendPrescriptionAttachment) em vez de uma página dedicada; todo ponto de entrada que
  // antes levava à página "Receita digital" abre o mesmo chat/WhatsApp que o botão flutuante.
  const openPrescription = () => openChat();
  const beginCheckout = () => requireAuth(() => goTo({ name: 'checkout' }));
  const logout = async () => {
    window.FA_OBS.emit({ portal: 'marketplace', type: 'auth', action: 'auth.logout', route: route.name, userRole: user && user.role || '', accessScope: user && user.accessScope || '' });
    await authClient.logout();
    setUser(null);
    setOrders([]);
    setOrdersRevision('');
    setProducts([]);
    goTo({ name: 'home' });
  };
  const reorder = (order) => {
    const availableItems = order.items.filter((entry) => products.some((product) => product.id === entry.id));
    if (!availableItems.length) {
      showToast('Os itens deste pedido nao estao disponiveis no catalogo atual');
      return;
    }
    setItems((prev) => {
      const next = [...prev];
      availableItems.forEach((oi) => {
        const ex = next.find((it) => it.id === oi.id);
        if (ex) {
          ex.qty += oi.qty;
        } else {
          next.push({ id: oi.id, qty: oi.qty, sub: !!oi.sub });
        }
      });
      return next;
    });
    showToast('Itens do pedido #' + order.id + ' no carrinho');
    goTo({ name: 'cart' });
  };

  const placeOrder = async (details) => {
    if (!user) {
      requireAuth(() => { void placeOrder(details); });
      return;
    }
    if (!items.length || placingOrder) {
      return;
    }
    const availableItems = items.filter((item) => products.some((product) => product.id === item.id));
    if (!availableItems.length) {
      setItems([]);
      showToast('Seu carrinho foi atualizado. Adicione itens disponiveis para continuar');
      goTo({ name: 'cart' });
      return;
    }
    if (availableItems.length !== items.length) {
      setItems(availableItems);
      showToast('Alguns itens indisponiveis foram removidos antes do pagamento');
      goTo({ name: 'cart' });
      return;
    }
    let resolvedPaymentMethodId = details && details.payment && details.payment.paymentMethodId || '';
    const isCardPayment = details && details.payment && (details.payment.method === 'credit_card' || details.payment.method === 'debit_card');
    // 'pickup_cash' (receita física) never charges now, but the pickup-time charge (see
    // OrderService.confirm_internal_pickup) needs a saved card token to bill later, so it goes
    // through the exact same resolve-or-tokenize path as an upfront card payment.
    const requiresSavedCardOnly = details && details.payment && details.payment.method === 'pickup_cash';
    if ((isCardPayment || requiresSavedCardOnly) && !resolvedPaymentMethodId && details.payment.newCard) {
      setPlacingOrder(true);
      try {
        const savedCards = await tokenizeAndSaveCard(details.payment.newCard);
        const newest = savedCards[savedCards.length - 1];
        resolvedPaymentMethodId = newest ? newest.id : '';
      } catch (error) {
        setPlacingOrder(false);
        showToast(error && error.message ? error.message : 'Nao foi possivel salvar o cartao para pagamento');
        return;
      }
    }
    if ((isCardPayment || requiresSavedCardOnly) && !resolvedPaymentMethodId) {
      showToast(requiresSavedCardOnly ? 'Cadastre um cartão para a cobrança na retirada' : 'Selecione ou cadastre um cartao para continuar');
      return;
    }
    window.FA_OBS.emit({ portal: 'marketplace', type: 'commerce', action: 'checkout.place_order', route: route.name, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { paymentMethod: details && details.payment && details.payment.method || '', fulfillment: details && details.delivery && details.delivery.method || '' } });
    setPlacingOrder(true);
    try {
      const response = await authClient.request('/orders', {
        method: 'POST',
        body: JSON.stringify({
          channel: 'app',
          items: availableItems.map((item) => ({ product_id: item.id, quantity: Number(item.qty || 0) })),
          coupon_code: coupon && coupon.code || '',
          cashback_redeem_amount: Number(details && details.cashbackRedeemAmount || 0),
          delivery: {
            method: details && details.delivery && details.delivery.method || 'express',
            recipient_name: details && details.delivery && details.delivery.recipientName || user.name || '',
            recipient_phone: details && details.delivery && details.delivery.phone || '',
            postal_code: details && details.delivery && details.delivery.cep || '',
            address_line: details && details.delivery && details.delivery.street || '',
            address_number: details && details.delivery && details.delivery.number || '',
            address_complement: details && details.delivery && details.delivery.complement || '',
            district: details && details.delivery && details.delivery.district || '',
            city: details && details.delivery && details.delivery.city || '',
            state_code: details && details.delivery && details.delivery.state || '',
            reference_note: details && details.delivery && details.delivery.reference || '',
            requested_delivery_time_label: details && details.delivery && details.delivery.requestedTime || '',
            store_id: details && details.delivery && details.delivery.store || '',
            store_name: (() => {
              const store = (portalData.stores || []).find((entry) => entry.id === (details && details.delivery && details.delivery.store || ''));
              return store ? store.name : '';
            })(),
          },
          payment: {
            method: details && details.payment && details.payment.method || 'pix',
            payment_method_id: resolvedPaymentMethodId,
          },
          prescription: {
            sent: !!(details && details.rx && details.rx.sent),
          },
        }),
      });
      const normalizedOrder = normalizeMarketplaceOrder(response);
      if (normalizedOrder) {
        setOrders((prev) => [normalizedOrder, ...prev.filter((entry) => entry.id !== normalizedOrder.id)]);
        setLastOrder(normalizedOrder);
      }
      setItems([]);
      setCoupon(null);
      void refreshCashbackWallet();
      goTo({ name: 'confirm' });
    } catch (error) {
      if (error && error.status === 401) {
        invalidateMarketplaceSession();
        showToast('Sua sessão expirou. Faça login novamente para concluir o pagamento');
        setPendingAuth(() => () => { void placeOrder(details); });
        goTo({ name: 'login' });
        return;
      }
      if (error && error.status === 404) {
        const nextItems = filterMarketplaceCollectionByCatalog(items, products);
        setItems(nextItems);
        goTo({ name: 'cart' });
      }
      showToast(error && error.message ? error.message : 'Nao foi possivel concluir a compra');
    } finally {
      setPlacingOrder(false);
    }
  };

  const refreshCashbackWallet = async () => {
    if (!user) {
      return;
    }
    try {
      const payload = await authClient.request('/customers/me/cashback', { method: 'GET' });
      setCashbackWallet(normalizeMarketplaceCashbackWallet(payload));
    } catch (error) {
      // Best-effort refresh — the checkout/account screens keep the last known balance on failure.
    }
  };

  const refreshAnniversaryOffers = async () => {
    if (!user) {
      return;
    }
    try {
      const payload = await authClient.request('/customers/me/anniversary-offers', { method: 'GET' });
      setAnniversaryOffers(normalizeMarketplaceAnniversaryOffers(payload));
    } catch (error) {
      // Best-effort — "Meu perfil" just keeps showing whatever offers it last loaded.
    }
  };

  const claimAnniversaryOffer = async (kind) => {
    /** Claim one birthday/customer-anniversary coupon. The server re-validates eligibility —
     * this never trusts the offer list's own `eligible` flag as authorization to claim. */

    const payload = await authClient.request('/customers/me/anniversary-offers/claim', {
      method: 'POST',
      body: JSON.stringify({ kind }),
    });
    const claimed = normalizeMarketplaceAnniversaryOffers({ offers: [payload] })[0];
    setAnniversaryOffers((current) => current.map((offer) => (offer.kind === kind ? claimed : offer)));
    return claimed;
  };

  const refreshPrescriptionStatus = async () => {
    if (!user) {
      return;
    }
    try {
      const payload = await authClient.request('/customers/me/prescription-status', { method: 'GET' });
      setPrescriptionStatus(normalizeMarketplacePrescriptionStatus(payload));
    } catch {
      // best-effort — a transient failure here just leaves the last known status on screen,
      // the next poll tick (or the bootstrap fetch on the next navigation) retries anyway.
    }
  };

  // While the customer is on a screen that cares about the prescription gate (review or
  // checkout) and it isn't resolved yet, poll for the pharmacist's decision — same reasoning as
  // the chat polls on both sides: no push/real-time delivery, and the customer may be sitting in
  // the chat waiting for a live "Validar"/"Recusar" from the pharmacist right now.
  useEffect(() => {
    const cartHasRx = items.some((item) => products.find((product) => product.id === item.id)?.rx);
    const onGatedRoute = route.name === 'cart' || route.name === 'checkout';
    // A physical prescription never goes through this online status at all — it's validated in
    // person at pickup — so there's nothing here worth polling for.
    if (!user || !cartHasRx || !onGatedRoute || prescriptionKind === 'physical' || prescriptionStatus.status === 'approved') {
      return undefined;
    }
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (!cancelled) {
        void refreshPrescriptionStatus();
      }
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user, items, products, route.name, prescriptionStatus.status, prescriptionKind]);

  const checkCoverage = async ({ district, city, state, cep }) => {
    if (!user || !district) {
      return { configured: false, covered: true };
    }
    try {
      const params = new URLSearchParams({ district: district || '', city: city || '', state_code: state || '', postal_code: cep || '' });
      const response = await authClient.request('/orders/delivery-coverage?' + params.toString(), { method: 'GET' });
      return {
        configured: !!response.configured,
        covered: response.covered !== false,
        matchLabel: response.match_label || '',
        requires_shipping: !!response.requires_shipping,
        nearestStoreName: response.nearest_store_name || '',
      };
    } catch (error) {
      return { configured: false, covered: true };
    }
  };

  const cartCount = items.reduce((s, it) => s + it.qty, 0);

  useEffect(() => {
    if (!authReady) {
      return;
    }
    let active = true;
    let retryTimer = null;
    async function syncMarketplaceData() {
      try {
        const canUsePrivateCatalog = !!(user && window.FA_ACCESS.canAccessMarketplace(user));
        const publicBootstrapPayload = await authClient.publicRequest('/portal/marketplace/public-bootstrap', { method: 'GET' });
        if (!active) {
          return;
        }
        const normalizedPublicBootstrap = normalizeMarketplacePortalData(publicBootstrapPayload);
        setPortalData((current) => ({ ...current, ...normalizedPublicBootstrap }));
        setCoupons(normalizedPublicBootstrap.coupons);
        window.FA_PORTAL_CACHE.writeLocal('marketplace', null, MARKETPLACE_BOOTSTRAP_STORAGE_KEY, publicBootstrapPayload || {});

        const catalogPayload = canUsePrivateCatalog
          ? await authClient.request('/catalog?page=1&page_size=100', { method: 'GET' })
          : await authClient.publicRequest('/catalog/public?page=1&page_size=100', { method: 'GET' });
        if (!active) {
          return;
        }
        const liveProducts = Array.isArray(catalogPayload && catalogPayload.items)
          ? catalogPayload.items.map(normalizeMarketplaceCatalogItem).filter(Boolean)
          : [];
        if (liveProducts.length) {
          persistMarketplaceCatalog(liveProducts);
          setProducts(liveProducts);
        } else {
          const fallbackProducts = resolveMarketplaceCatalogSnapshot();
          if (fallbackProducts.length) {
            setProducts(fallbackProducts);
          }
        }
        if (!canUsePrivateCatalog) {
          setOrders([]);
          setOrdersRevision('');
          setFav([]);
          setSubs([]);
          setAvailabilityAlerts([]);
          setChatThreads([]);
          setCashbackWallet({ availableBalance: 0, pendingBalance: 0, lifetimeEarnedTotal: 0, redeemedTotal: 0, redeemMaxPercent: 25, entries: [] });
          setAnniversaryOffers([]);
          setCustomerProfile(createMarketplaceProfileSnapshot(user));
          return;
        }
        const cartFetchSeq = cartMutationSeqRef.current;
        const [bootstrapPayload, profilePayload, ordersPayload, chatPayload, cartPayload, addressesPayload, paymentMethodsPayload, availabilityAlertsPayload, prescriptionStatusPayload, cashbackWalletPayload, anniversaryOffersPayload] = await Promise.all([
          authClient.request('/portal/marketplace/bootstrap', { method: 'GET' }),
          authClient.request('/customers/me', { method: 'GET' }),
          authClient.request('/orders', { method: 'GET' }),
          authClient.request('/chat/customer/threads', { method: 'GET' }),
          authClient.request('/customers/me/cart', { method: 'GET' }),
          authClient.request('/customers/me/addresses', { method: 'GET' }),
          authClient.request('/customers/me/payment-methods', { method: 'GET' }),
          authClient.request('/customers/me/availability-alerts', { method: 'GET' }),
          authClient.request('/customers/me/prescription-status', { method: 'GET' }),
          authClient.request('/customers/me/cashback', { method: 'GET' }),
          authClient.request('/customers/me/anniversary-offers', { method: 'GET' }),
        ]);
        if (!active) {
          return;
        }
        const normalizedBootstrap = normalizeMarketplacePortalData(bootstrapPayload);
        setPortalData(normalizedBootstrap);
        writeMarketplaceScopedCache(user, MARKETPLACE_BOOTSTRAP_STORAGE_KEY, bootstrapPayload || {});
        setFav(normalizedBootstrap.favorites);
        setSubs(normalizedBootstrap.subscriptions);
        setAvailabilityAlerts(Array.isArray(availabilityAlertsPayload) ? availabilityAlertsPayload.map((entry) => entry && entry.product_ref).filter(Boolean) : []);
        setPrescriptionStatus(normalizeMarketplacePrescriptionStatus(prescriptionStatusPayload));
        setCashbackWallet(normalizeMarketplaceCashbackWallet(cashbackWalletPayload));
        setAnniversaryOffers(normalizeMarketplaceAnniversaryOffers(anniversaryOffersPayload));
        if (Array.isArray(cartPayload) && cartFetchSeq === cartMutationSeqRef.current) {
          setItems((prev) => {
            const byRef = Object.fromEntries(prev.map((it) => [it.id, it]));
            const serverItems = cartPayload.map((entry) => ({
              id: entry.product_ref,
              qty: entry.quantity,
              sub: entry.is_subscription,
              freq: (byRef[entry.product_ref] && byRef[entry.product_ref].freq) || 30,
            }));
            // The server cart is authoritative for items it already knows about, but a guest
            // cart merged into `prev` moments ago (logging in mid-session, e.g. from the
            // checkout gate) has items the server has never seen — dropping those here would
            // silently undo that merge. Keep every server item as-is, then carry over anything
            // from `prev` the server doesn't have yet.
            const merged = serverItems.map((item) => ({ ...item }));
            prev.forEach((localItem) => {
              if (!merged.some((item) => item.id === localItem.id)) {
                merged.push(localItem);
              }
            });
            return merged;
          });
        }
        if (Array.isArray(addressesPayload)) {
          setAddresses(addressesPayload.map(fromBackendAddress));
        }
        if (Array.isArray(paymentMethodsPayload)) {
          setCards(paymentMethodsPayload.map(fromBackendPaymentMethod));
        }
        setCoupons(normalizedBootstrap.coupons);
        setChatThreads(normalizeMarketplaceChatThreads((chatPayload && chatPayload.items || []).map((thread) => ({
          ...normalizeChatThreadFromApi(thread),
          pharmacistName: thread.pharmacist_name || thread.pharmacistName || normalizedBootstrap.pharmacist.name,
        }))));
        setCustomerProfile(normalizeMarketplaceProfile(profilePayload, user));
        const liveOrders = Array.isArray(ordersPayload && ordersPayload.items)
          ? ordersPayload.items.map(normalizeMarketplaceOrder).filter(Boolean)
          : [];
        if (liveOrders.length || Array.isArray(ordersPayload && ordersPayload.items)) {
          setOrders(liveOrders);
          setOrdersRevision(ordersPayload.revision || '');
        }
      } catch (error) {
        if (active) {
          const fallbackProducts = resolveMarketplaceCatalogSnapshot();
          if (fallbackProducts.length) {
            setProducts(fallbackProducts);
          }
          const cachedBootstrap = normalizeMarketplacePortalData(readMarketplaceScopedCache(user, MARKETPLACE_BOOTSTRAP_STORAGE_KEY, window.FA_PORTAL_CACHE.readLocal('marketplace', null, MARKETPLACE_BOOTSTRAP_STORAGE_KEY, {})));
          setPortalData((current) => ({ ...current, ...cachedBootstrap }));
          setFav(cachedBootstrap.favorites || []);
          setSubs(cachedBootstrap.subscriptions || []);
          setAvailabilityAlerts([]);
          setCoupons(cachedBootstrap.coupons || []);
          setCustomerProfile(createMarketplaceProfileSnapshot(user));
        }
        const status = Number(error && error.status || 0);
        if (active && retryTimer == null && [502, 503, 504].includes(status)) {
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            if (active) {
              void syncMarketplaceData();
            }
          }, 1500);
        }
      }
    }
    void syncMarketplaceData();
    return () => {
      active = false;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [authClient, authReady, user && user.id]);

  useEffect(() => {
    if (!authReady || !user || !window.FA_ACCESS.canAccessMarketplace(user)) {
      return;
    }
    let active = true;
    let timer = null;
    let failureCount = 0;
    async function pollOrderChanges() {
      try {
        const query = ordersRevision ? '?since=' + encodeURIComponent(ordersRevision) : '';
        const response = await authClient.request('/orders/changes' + query, { method: 'GET' });
        if (!active || !response) {
          return;
        }
        failureCount = 0;
        if (response.has_changes) {
          const nextOrders = Array.isArray(response.items)
            ? response.items.map(normalizeMarketplaceOrder).filter(Boolean)
            : [];
          setOrders(nextOrders);
          setOrdersRevision(response.revision || '');
        } else if (response.revision) {
          setOrdersRevision(response.revision);
        }
      } catch {
        failureCount += 1;
      }
      if (active) {
        const nextDelay = Math.min(4000 * Math.max(1, failureCount), 30000);
        timer = window.setTimeout(pollOrderChanges, nextDelay);
      }
    }
    timer = window.setTimeout(pollOrderChanges, 4000);
    return () => {
      active = false;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [authClient, authReady, user && user.id, ordersRevision]);

  const saveCustomerAvatar = async (nextPhoto) => {
    const payload = await authClient.request('/customers/me/avatar', {
      method: 'PUT',
      body: JSON.stringify({ avatar_url: nextPhoto || '' }),
    });
    const normalizedProfile = normalizeMarketplaceProfile(payload, user);
    setCustomerProfile(normalizedProfile);
    setUser((current) => current ? { ...current, photo: normalizedProfile.photo, twoFactorEnabled: normalizedProfile.twoFactor } : current);
    return normalizedProfile;
  };

  const saveCustomerProfile = async (draft) => {
    const payload = await authClient.request('/customers/me/profile', {
      method: 'PUT',
      body: JSON.stringify({
        full_name: (draft.name || '').trim(),
        cpf: (draft.cpf || '').replace(/\D/g, ''),
        phone: draft.phone || '',
        birth_date: draft.birth || '',
        gender: draft.gender || '',
        marital_status: draft.maritalStatus || '',
        children_count: draft.childrenCount === '' || draft.childrenCount == null ? null : Number(draft.childrenCount),
        // Age (birth year) is the anchor: a child slot is only sent if its age is filled — a
        // customer who set "2 filhos" but only filled one age shouldn't have a fake second child
        // recorded. children_names stays index-aligned to the kept slots (same slot = same
        // child everywhere this is read), even if the name itself was left blank.
        ...(() => {
          const years = Array.isArray(draft.childrenBirthYears) ? draft.childrenBirthYears : [];
          const names = Array.isArray(draft.childrenNames) ? draft.childrenNames : [];
          const keptIndices = years.reduce((acc, year, i) => { if (year !== '' && year != null) acc.push(i); return acc; }, []);
          return {
            children_birth_years: keptIndices.map((i) => Number(years[i])),
            children_names: keptIndices.map((i) => (names[i] || '').trim()),
          };
        })(),
        marketing_program_preferences: draft.marketingProgramPreferences || customerProfile.marketingProgramPreferences,
        communication_channel_preferences: draft.communicationChannelPreferences || customerProfile.communicationChannelPreferences,
      }),
    });
    const normalizedProfile = normalizeMarketplaceProfile(payload, user);
    setCustomerProfile(normalizedProfile);
    setUser((current) => current ? { ...current, name: normalizedProfile.name } : current);
    return normalizedProfile;
  };

  const saveCustomerPrivacyPreferences = async (programs, channels) => {
    /** Persist marketing-program / communication-channel opt-ins, keeping the rest of the profile untouched. */

    return saveCustomerProfile({
      name: customerProfile.name,
      cpf: customerProfile.cpf,
      phone: customerProfile.phone,
      birth: customerProfile.birth,
      gender: customerProfile.gender,
      maritalStatus: customerProfile.maritalStatus,
      childrenCount: customerProfile.childrenCount,
      childrenBirthYears: customerProfile.childrenBirthYears,
      childrenNames: customerProfile.childrenNames,
      marketingProgramPreferences: mergePrivacyPreferenceUpdates(customerProfile.marketingProgramPreferences, programs || [], 'name'),
      communicationChannelPreferences: mergePrivacyPreferenceUpdates(customerProfile.communicationChannelPreferences, channels || [], 'channel'),
    });
  };

  const dismissProfileNudge = async () => {
    /** Persist "Agora não" on the customer's account; the server owns the snooze window and the verdict. */

    try {
      const payload = await authClient.request('/customers/me/profile-nudge/dismiss', { method: 'POST' });
      setCustomerProfile((current) => ({ ...current, profileNudge: normalizeProfileNudge(payload) }));
    } catch {
      // The popup still closes for this visit; the server never recorded the snooze, so it may come back on the next load.
      setCustomerProfile((current) => ({ ...current, profileNudge: { ...current.profileNudge, shouldShow: false } }));
    }
  };

  const toBackendAddressPayload = (address) => ({
    label: address.label || 'Casa',
    postal_code: address.cep || '',
    street_line: [address.street, address.number].filter(Boolean).join(', '),
    district: address.district || '',
    city: address.city || '',
    state_code: (address.state || '').toUpperCase().slice(0, 2),
    complement: address.complement || '',
    reference_note: address.referenceNote || '',
    recipient_name: address.recipientName || '',
    recipient_phone: address.recipientPhone || '',
    is_primary: !!address.primary,
    latitude: address.lat != null ? address.lat : null,
    longitude: address.lng != null ? address.lng : null,
  });
  const fromBackendAddress = (entry) => ({
    id: entry.id,
    label: entry.label || 'Casa',
    cep: entry.postal_code || '',
    street: entry.street_line || '',
    number: '',
    complement: entry.complement || '',
    district: entry.district || '',
    city: entry.city || '',
    state: entry.state_code || '',
    referenceNote: entry.reference_note || '',
    recipientName: entry.recipient_name || '',
    recipientPhone: entry.recipient_phone || '',
    primary: !!entry.is_primary,
    lat: entry.latitude != null ? Number(entry.latitude) : null,
    lng: entry.longitude != null ? Number(entry.longitude) : null,
  });
  const createCustomerAddress = async (address) => {
    const response = await authClient.request('/customers/me/addresses', {
      method: 'POST',
      body: JSON.stringify(toBackendAddressPayload(address)),
    });
    const normalized = Array.isArray(response) ? response.map(fromBackendAddress) : [];
    setAddresses(normalized);
    return normalized;
  };
  const updateCustomerAddress = async (id, address) => {
    const response = await authClient.request('/customers/me/addresses/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify(toBackendAddressPayload(address)),
    });
    const normalized = Array.isArray(response) ? response.map(fromBackendAddress) : [];
    setAddresses(normalized);
    return normalized;
  };
  const deleteCustomerAddress = async (id) => {
    const response = await authClient.request('/customers/me/addresses/' + encodeURIComponent(id), { method: 'DELETE' });
    const normalized = Array.isArray(response) ? response.map(fromBackendAddress) : [];
    setAddresses(normalized);
    return normalized;
  };
  const setPrimaryCustomerAddress = async (id) => {
    const target = addresses.find((address) => address.id === id);
    if (!target) {
      return addresses;
    }
    return updateCustomerAddress(id, { ...target, primary: true });
  };

  const fromBackendPaymentMethod = (entry) => ({
    id: entry.id,
    brand: entry.brand_name || 'Cartão',
    last4: entry.last_four_digits || '0000',
    holder: entry.holder_name || '',
    exp: (entry.expiration_month || '00') + '/' + String(entry.expiration_year || '0000').slice(-2),
    primary: !!entry.is_primary,
  });
  const tokenizeAndSaveCard = async (card) => {
    const [expMonth, expYearShort] = String(card.expiry || '00/00').split('/');
    const response = await authClient.request('/customers/me/payment-methods/tokenize-card', {
      method: 'POST',
      body: JSON.stringify({
        holder_name: card.holderName || '',
        number: String(card.number || '').replace(/\D/g, ''),
        cvv: String(card.cvv || '').replace(/\D/g, ''),
        expiration_month: card.expiryMonth || (expMonth || '').padStart(2, '0'),
        expiration_year: card.expiryYear || (expYearShort ? '20' + expYearShort.slice(-2) : ''),
        is_primary: cards.length === 0,
      }),
    });
    const normalized = Array.isArray(response) ? response.map(fromBackendPaymentMethod) : [];
    setCards(normalized);
    return normalized;
  };
  const deleteCustomerPaymentMethod = async (id) => {
    const response = await authClient.request('/customers/me/payment-methods/' + encodeURIComponent(id), { method: 'DELETE' });
    const normalized = Array.isArray(response) ? response.map(fromBackendPaymentMethod) : [];
    setCards(normalized);
    return normalized;
  };
  const setPrimaryCustomerPaymentMethod = async (id) => {
    const response = await authClient.request('/customers/me/payment-methods/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ is_primary: true }),
    });
    const normalized = Array.isArray(response) ? response.map(fromBackendPaymentMethod) : [];
    setCards(normalized);
    return normalized;
  };

  const bookHealthAppointment = async (booking) => {
    const response = await authClient.request('/portal/health/appointments', {
      method: 'POST',
      body: JSON.stringify({
        service_id: booking.serviceId || '',
        store_id: booking.storeId || '',
        store_name: booking.store || '',
        scheduled_date_label: booking.date || '',
        scheduled_time_label: booking.time || '',
        coupon_code: booking.couponCode || '',
      }),
    });
    const nextHistory = Array.isArray(response) ? response.map(normalizeMarketplaceHealthHistory).filter(Boolean) : [];
    setPortalData((current) => ({ ...current, healthHistory: nextHistory }));
    return nextHistory;
  };

  const applyMarketplaceTwoFactorState = (enabled) => {
    setCustomerProfile((current) => ({ ...current, twoFactor: !!enabled }));
    setUser((current) => current ? { ...current, twoFactorEnabled: !!enabled } : current);
  };

  const beginTwoFactorSetup = async () => authClient.beginTwoFactorSetup();

  const enableTwoFactor = async (code) => {
    const response = await authClient.enableTwoFactor(code);
    applyMarketplaceTwoFactorState(true);
    return response;
  };

  const disableTwoFactor = async (code) => {
    const response = await authClient.disableTwoFactor(code);
    applyMarketplaceTwoFactorState(false);
    return response;
  };

  const ctx = {
    cats: portalData.categories, products, route, onNav, onSearch,
    items, coupon, setCoupon, addToCart, updateQty, removeItem, patchItem, toggleItemSub,
    fav, toggleFav, availabilityAlerts, subscribeAvailabilityAlert, unsubscribeAvailabilityAlert, recent, mostSearchedProductIds, beginCheckout, placeOrder, lastOrder, placingOrder, checkCoverage,
    prescriptionStatus, refreshPrescriptionStatus, prescriptionKind, setPrescriptionKind,
    cashbackWallet, refreshCashbackWallet,
    anniversaryOffers, refreshAnniversaryOffers, claimAnniversaryOffer,
    user, logout, reorder, orders, statusMap: MARKETPLACE_ORDER_STATUS_MAP, stores: portalData.stores,
    deliveryEstimate: portalData.deliveryEstimate,
    paymentRules: portalData.marketplace,
    homeBanner: portalData.homeBanner,
    homeBrands: portalData.homeBrands,
    homeTrends: portalData.homeTrends,
    dealOfTheDay: portalData.dealOfTheDay,
    profile: customerProfile, setCustomerProfile, saveCustomerAvatar, saveCustomerProfile, saveCustomerPrivacyPreferences, dismissProfileNudge, beginTwoFactorSetup, enableTwoFactor, disableTwoFactor,
    addresses, createCustomerAddress, updateCustomerAddress, deleteCustomerAddress, setPrimaryCustomerAddress,
    cards, tokenizeAndSaveCard, deleteCustomerPaymentMethod, setPrimaryCustomerPaymentMethod,
    privacyPrograms: buildPrivacyPreferenceList(MARKETING_PROGRAM_CATALOG, customerProfile.marketingProgramPreferences, 'name'),
    commChannels: buildPrivacyPreferenceList(COMMUNICATION_CHANNEL_CATALOG, customerProfile.communicationChannelPreferences, 'channel'),
    healthServices: portalData.healthServices, healthHistory: portalData.healthHistory, bookHealthAppointment,
    openChat, openPrescription, openWidgetChatPanel, requireAuth,
    chatThreads, activeChatThreadId, selectChatThread, activateChatThread, sendChatMessage, sendPrescriptionAttachment, sendChatUnblockRequest,
    subs, patchSub, removeSub, addSub, skipNextSub, submitProductReview, coupons,
    accountNav: t.accountNav, showCashback: t.showCashback,
    cardVariant: t.cardVariant, homeVariant: t.homeVariant, productVariant: t.productVariant, checkoutVariant: t.checkoutVariant,
    authClient, authReady, finalizeAuthenticatedSession, showToast,
  };

  const canUseMarketplace = !user || window.FA_ACCESS.canAccessMarketplace(user);

  // Pre-launch countdown gate: when enabled and the configured instant hasn't passed, every
  // visitor — logged in or not — sees only this, in place of the entire storefront. No bypass by
  // design (see 00_Decisoes note for this feature); to preview the real marketplace before launch,
  // disable the toggle in the internal console temporarily.
  const launchMode = portalData.launchMode || {};
  const launchAtMs = new Date(launchMode.launchAt).getTime();
  const launchGateActive = !!launchMode.enabled && !Number.isNaN(launchAtMs) && Date.now() < launchAtMs;
  if (launchGateActive) {
    return (
      <div id="fa-root" data-density={t.density}>
        <LaunchCountdownScreen launchMode={launchMode} onLaunch={() => window.location.reload()} />
      </div>
    );
  }

  const renderScreen = () => {
    switch (route.name) {
      case 'home': return <HomeScreen ctx={ctx} />;
      case 'category': return <ShopScreen ctx={ctx} mode="category" />;
      case 'brand': return <ShopScreen ctx={ctx} mode="brand" />;
      case 'offers': return <ShopScreen ctx={ctx} mode="offers" />;
      case 'trends': return <ShopScreen ctx={ctx} mode="trends" />;
      case 'shop': return <ShopScreen ctx={ctx} mode="catalog" />;
      case 'search': return <ShopScreen ctx={ctx} mode="search" />;
      case 'product': return <ProductScreen ctx={ctx} />;
      case 'bula': return <BulaScreen ctx={ctx} />;
      case 'cart': return <CartScreen ctx={ctx} />;
      case 'checkout': return <CheckoutScreen ctx={ctx} />;
      case 'confirm': return <ConfirmScreen ctx={ctx} />;
      case 'care': return <CareScreen ctx={ctx} />;
      case 'subscriptions': return <SubscriptionsScreen ctx={ctx} />;
      case 'services': return <ServicesScreen ctx={ctx} />;
      case 'cashback': return <CashbackScreen ctx={ctx} />;
      case 'saved': return <SavedScreen ctx={ctx} />;
      case 'chats': return <ChatHistoryScreen ctx={ctx} />;
      case 'discover': return <ShopScreen ctx={ctx} mode="mostsearched" />;
      case 'login': return <LoginScreen ctx={ctx} />;
      case 'unlock-account': return <UnlockAccountScreen ctx={ctx} />;
      case 'terms': return <TermsScreen ctx={ctx} />;
      case 'privacy': return <PrivacyScreen ctx={ctx} />;
      case 'data-retention': return <DataRetentionScreen ctx={ctx} />;
      case 'account': return <AccountScreen ctx={ctx} />;
      case 'orders': return <AccountScreen ctx={ctx} />;
      default: return <HomeScreen ctx={ctx} />;
    }
  };

  return (
    <div id="fa-root" data-density={t.density}>
      <Header cats={portalData.categories} portalData={portalData} route={route} cartCount={cartCount} query={route.query} user={user} onNav={onNav} onSearch={onSearch} onChat={() => openChat()} onPrescription={openPrescription} authClient={authClient} logout={logout} ordersCount={orders.length} products={products} />
      <main key={route.name + (route.cat || '') + (route.id || '') + (route.query || '') + (route.tab || '')}>
        {!authReady
          ? <div className="fa-wrap fa-fadein" style={{ paddingTop: 72, paddingBottom: 96, maxWidth: 720 }}>
              <div className="fa-card" style={{ padding: '32px clamp(22px,4vw,36px)', textAlign: 'center' }}>
                <span className="fa-iconbox" style={{ margin: '0 auto 18px', width: 72, height: 72 }}><Icon name="lock" size={30} /></span>
                <h1 className="fa-h2">Validando sessão</h1>
                <p className="fa-lead" style={{ marginTop: 10 }}>
                  Estamos verificando suas credenciais e restaurando o acesso seguro ao marketplace.
                </p>
              </div>
            </div>
          : canUseMarketplace ? renderScreen() : <MarketplaceAccessNotice onReset={logout} />}
      </main>
      <Footer cats={portalData.categories} portalData={portalData} onNav={onNav} onPrescription={openPrescription} />

      <PharmacistChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        authClient={authClient}
        threads={chatThreads}
        activeThreadId={activeChatThreadId}
        onSelectThread={selectChatThread}
        onSendMessage={sendChatMessage}
        onSendAttachment={sendPrescriptionAttachment}
        onRequestUnblock={sendChatUnblockRequest}
        onOpenAccountConversations={() => { setChatOpen(false); onNav({ name: 'account', tab: 'conversations' }); }}
      />
      {!chatOpen && (
        <ChatWidget
          user={user}
          threads={chatThreads.filter((thread) => sessionChatThreadIds.includes(thread.id))}
          activeThreadId={activeChatThreadId}
          onSelectThread={activateChatThread}
          onOpen={openWidgetChat}
          onSend={sendChatMessage}
          onSendAttachment={sendPrescriptionAttachment}
          onRequestUnblock={sendChatUnblockRequest}
          authClient={authClient}
          whatsappUrl={buildPharmacistWhatsAppUrl()}
          onExpand={() => setChatOpen(true)}
          openSignal={chatWidgetOpenSignal}
          chatContext={chatWidgetContext}
          onDismissContext={() => setChatWidgetContext(null)}
          onSwitchToPhysical={() => { setPrescriptionKind('physical'); setChatWidgetContext(null); }}
        />
      )}
      {user && <ProfileCompletionNudge ctx={ctx} />}

      {/* toast */}
      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 200, background: 'var(--fa-ink)', color: '#fff', padding: '14px 20px', borderRadius: 'var(--fa-r-btn)', boxShadow: 'var(--fa-shadow-lg)', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14 }} className="fa-fadein">
          <span style={{ width: 24, height: 24, borderRadius: 99, background: 'var(--fa-success)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="check" size={15} stroke={2.8} /></span>
          {toast}
          <button onClick={() => onNav({ name: 'cart' })} style={{ border: 'none', background: 'rgba(255,255,255,.16)', color: '#fff', borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: 13, marginLeft: 6 }}>Ver carrinho</button>
        </div>
      )}
    </div>
  );
}

export {
  App,
  MARKETPLACE_CATALOG_STORAGE_KEY,
  MARKETPLACE_CHAT_STORAGE_KEY,
  MARKETPLACE_DEFAULTS,
  buildMarketplaceAliasMap,
  buildMarketplaceCatalogFallback,
  buildMarketplaceChatTimestamp,
  canUseLiveMarketplaceCatalog,
  createMarketplaceChatThread,
  filterMarketplaceCollectionByCatalog,
  mergePublishedMarketplaceProducts,
  normalizeMarketplaceCatalogItem,
  normalizeMarketplaceChatThreads,
  normalizeMarketplaceOrder,
  normalizeMarketplaceOrderStatus,
  persistMarketplaceCatalog,
  readStoredMarketplaceCatalog,
  remapCollectionIds,
  resolveMarketplaceCatalogSnapshot,
};

function MarketplaceAppRouter() {
  return (
    <BrowserRouter basename="/">
      <Routes>
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<MarketplaceAppRouter />);
