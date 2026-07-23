import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";

import "../../shared/portal-cache.js";
import { PharmacistChatModal, PrescriptionModal } from "./marketplace-care-actions.jsx";
import { Header, Footer } from "./marketplace-chrome.jsx";
import { Icon } from "./marketplace-icons.jsx";
import { TweakColor, TweakRadio, TweakSection, TweakSelect, TweakSlider, TweakText, TweakToggle, TweaksPanel, useTweaks } from "./marketplace-tweaks-panel.jsx";
import { AccountScreen, LoginScreen, UnlockAccountScreen } from "../screens/account-screen.jsx";
import { CareScreen } from "../screens/care-screen.jsx";
import { CartScreen } from "../screens/cart-screen.jsx";
import { CheckoutScreen, ConfirmScreen } from "../screens/checkout-screen.jsx";
import { CashbackScreen, PrescriptionScreen, SavedScreen } from "../screens/extra-screen.jsx";
import { HomeScreen } from "../screens/home-screen.jsx";
import { ProductScreen } from "../screens/product-screen.jsx";
import { ServicesScreen } from "../screens/services-screen.jsx";
import { ShopScreen } from "../screens/shop-screen.jsx";
import { SubscriptionsScreen } from "../screens/subscriptions-screen.jsx";

/* FARMAURA — App shell: routing, cart state, tweaks. Depends on all screen files. */

const MARKETPLACE_ROUTE_RESERVED_KEYS = new Set(['name', 'id', 'cat']);

function buildMarketplacePath(route) {
  const name = (route && route.name) || 'home';
  const segments = [name === 'home' ? '' : name];
  if (route && route.id) segments.push(encodeURIComponent(route.id));
  else if (route && route.cat) segments.push(encodeURIComponent(route.cat));
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
  else if (name === 'category' && segments[1]) route.cat = decodeURIComponent(segments[1]);
  for (const [key, value] of searchParams.entries()) {
    route[key === 'q' ? 'query' : key] = value;
  }
  return route;
}

const FONT_STACKS = {
  'Montserrat': "'Montserrat', system-ui, sans-serif",
  'Manrope': "'Manrope', system-ui, sans-serif",
  'Nunito Sans': "'Nunito Sans', system-ui, sans-serif",
};

const PALETTES = {
  'Vinho Aura': { primary: '#7A0D16', ink: '#5C0910', vital: '#C81D28', rose: '#FFD6D9', roseSoft: '#FFEDEE' },
  'Bordô': { primary: '#8E1B2E', ink: '#6E1322', vital: '#D32F3C', rose: '#FBD7DC', roseSoft: '#FCEAED' },
  'Ameixa': { primary: '#5E1235', ink: '#470D28', vital: '#C2185B', rose: '#F6D6E4', roseSoft: '#FBE9F1' },
  'Vermelho Vital': { primary: '#A11017', ink: '#7C0C12', vital: '#E03131', rose: '#FFD5D5', roseSoft: '#FFECEC' },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "paletteName": "Vermelho Vital",
  "font": "Montserrat",
  "aura": 35,
  "density": "regular",
  "radius": 100,
  "homeVariant": "A",
  "cardVariant": "image",
  "productVariant": "A",
  "checkoutVariant": "A",
  "accountNav": "side",
  "showCashback": true
}/*EDITMODE-END*/;


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
    rx: !!(item.requires_prescription || item.rx),
    tags: Array.isArray(item.tags) ? item.tags : [],
    stock: Number(item.stock || 0),
    rating: Number(reviewSummary.rating_average ?? item.rating ?? 0),
    reviews: Number(reviewSummary.review_count ?? item.reviews ?? 0),
    reviewComments: reviewComments,
    info: item.info || item.description || "",
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
    photo: safeUser.photo || null,
    twoFactor: !!safeUser.twoFactorEnabled,
    memberSince: '',
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
    photo: source.avatar_url || null,
    twoFactor: typeof source.two_factor_enabled === 'boolean' ? source.two_factor_enabled : baseProfile.twoFactor,
    memberSince: source.member_since_label || '',
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
    pixQrCode: item.pix_qr_code || '',
    pixCopyPaste: item.pix_copy_paste || '',
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
  };
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

function App() {
  const authClient = useMemo(() => window.FA_API.createClient('marketplace'), []);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
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
  const [items, setItems] = useState([]);
  const [coupon, setCoupon] = useState(null);
  const [fav, setFav] = useState([]);
  const [availabilityAlerts, setAvailabilityAlerts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersRevision, setOrdersRevision] = useState('');
  const [lastOrder, setLastOrder] = useState(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [toast, setToast] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatThreads, setChatThreads] = useState([]);
  const [activeChatThreadId, setActiveChatThreadId] = useState(null);
  const [pendingChatOptions, setPendingChatOptions] = useState({});
  const [rxOpen, setRxOpen] = useState(false);
  const [pendingAuth, setPendingAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [recent, setRecent] = useState([]);
  const [subs, setSubs] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [cards, setCards] = useState([]);
  const [customerProfile, setCustomerProfile] = useState(() => createMarketplaceProfileSnapshot(null));
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
    setItems(readMarketplaceScopedCache(user, MARKETPLACE_CART_STORAGE_KEY, []));
    setRecent(readMarketplaceScopedCache(user, MARKETPLACE_RECENT_STORAGE_KEY, []));
    setChatThreads(normalizeMarketplaceChatThreads(readMarketplaceScopedCache(user, MARKETPLACE_CHAT_STORAGE_KEY, [])));
    setActiveChatThreadId(null);
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

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [route.name, route.cat, route.id, route.query]);

  // ---- handlers ----
  const onNav = (r) => {
    if (r && r.name === 'product' && r.id) setRecent((prev) => [r.id, ...prev.filter((x) => x !== r.id)].slice(0, 8));
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
  const ensureMarketplaceChatThread = async (options = {}) => {
    if (options.threadId) {
      const existingById = chatThreads.find((thread) => thread.id === options.threadId);
      if (existingById) {
        return existingById;
      }
    }
    const response = await authClient.request('/chat/customer/threads', { method: 'POST', body: JSON.stringify({}) });
    const normalized = {
      id: response.id,
      topic: response.topic,
      orderCode: response.order,
      unread: response.unread,
      lastAt: response.last_at || response.lastAt,
      pharmacistName: response.pharmacist_name || response.pharmacistName || (portalData.pharmacist && portalData.pharmacist.name) || '',
      messages: Array.isArray(response.msgs) ? response.msgs.map((message) => ({ id: message.id, from: message.from_role === 'me' ? 'me' : 'pharm', text: message.text, at: message.at })) : [],
    };
    setChatThreads((prev) => {
      const filtered = prev.filter((thread) => thread.id !== normalized.id);
      return [normalized, ...filtered];
    });
    return normalized;
  };
  // Opens the chat modal immediately, on top of whatever screen is active. When the
  // visitor isn't signed in yet, the modal shows an inline login instead of routing away.
  const openChat = (options = {}) => {
    setPendingChatOptions(options);
    setChatOpen(true);
    if (!user) {
      return;
    }
    return (async () => {
      const thread = await ensureMarketplaceChatThread(options);
      if (thread && thread.id) {
        setActiveChatThreadId(thread.id);
        markChatThreadRead(thread.id);
      }
    })();
  };
  const selectChatThread = (threadId) => {
    setActiveChatThreadId(threadId);
    markChatThreadRead(threadId);
    setChatOpen(true);
  };
  const sendChatMessage = async (threadId, messageText) => {
    const textValue = String(messageText || '').trim();
    if (!threadId || !textValue) {
      return;
    }
    const response = await authClient.request('/chat/customer/threads/' + encodeURIComponent(threadId) + '/messages', {
      method: 'POST',
      body: JSON.stringify({ text: textValue }),
    });
    const normalized = {
      id: response.id,
      topic: response.topic,
      orderCode: response.order,
      unread: response.unread,
      lastAt: response.last_at || response.lastAt,
      pharmacistName: response.pharmacist_name || response.pharmacistName || (portalData.pharmacist && portalData.pharmacist.name) || '',
      messages: Array.isArray(response.msgs) ? response.msgs.map((message) => ({ id: message.id, from: message.from_role === 'me' ? 'me' : 'pharm', text: message.text, at: message.at })) : [],
    };
    setChatThreads((prev) => [normalized, ...prev.filter((thread) => thread.id !== normalized.id)]);
  };
  const syncCartItem = async (id, quantity, sub) => {
    const response = await authClient.request('/customers/me/cart/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify({ quantity, is_subscription: !!sub }),
    });
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
  const removeCartItem = async (id) => {
    const response = await authClient.request('/customers/me/cart/' + encodeURIComponent(id), { method: 'DELETE' });
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
    if (pendingAuth) { const act = pendingAuth; setPendingAuth(null); goTo({ name: 'home' }); act(); }
    else goTo({ name: 'account', tab: 'summary' });
    return nextUser;
  };
  // Signing in from inside the chat modal must not move the visitor off their current
  // screen — only the pending chat thread loads, unlike the full-page login flow above.
  const finalizeChatLogin = async (flow, rememberSession) => {
    const nextUser = await applyAuthenticatedFlow(flow, rememberSession);
    const thread = await ensureMarketplaceChatThread(pendingChatOptions);
    if (thread && thread.id) {
      setActiveChatThreadId(thread.id);
      markChatThreadRead(thread.id);
    }
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
  // Envio de receita: página dedicada, disponível somente para quem está logado.
  const openPrescription = () => requireAuth(() => goTo({ name: 'rx' }));
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
    if (isCardPayment && !resolvedPaymentMethodId && details.payment.newCard) {
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
    if (isCardPayment && !resolvedPaymentMethodId) {
      showToast('Selecione ou cadastre um cartao para continuar');
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
          coupon_percent: coupon && (coupon.discountType === 'percent' || (coupon.discountType === 'shipping' && coupon.shippingDiscountMode === 'percent')) ? Number(coupon.discountValue || 0) : 0,
          coupon_amount: coupon && ((coupon.discountType === 'fixed') || (coupon.discountType === 'shipping' && coupon.shippingDiscountMode === 'fixed')) ? Number(coupon.discountValue || 0) : coupon ? Number(coupon.discountAmount || 0) : 0,
          coupon_type: coupon && coupon.discountType === 'shipping' ? 'shipping_' + (coupon.shippingDiscountMode || 'full') : coupon && coupon.discountType || '',
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
          setCustomerProfile(createMarketplaceProfileSnapshot(user));
          return;
        }
        const [bootstrapPayload, profilePayload, ordersPayload, chatPayload, cartPayload, addressesPayload, paymentMethodsPayload, availabilityAlertsPayload] = await Promise.all([
          authClient.request('/portal/marketplace/bootstrap', { method: 'GET' }),
          authClient.request('/customers/me', { method: 'GET' }),
          authClient.request('/orders', { method: 'GET' }),
          authClient.request('/chat/customer/threads', { method: 'GET' }),
          authClient.request('/customers/me/cart', { method: 'GET' }),
          authClient.request('/customers/me/addresses', { method: 'GET' }),
          authClient.request('/customers/me/payment-methods', { method: 'GET' }),
          authClient.request('/customers/me/availability-alerts', { method: 'GET' }),
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
        if (Array.isArray(cartPayload)) {
          setItems((prev) => {
            const byRef = Object.fromEntries(prev.map((it) => [it.id, it]));
            return cartPayload.map((entry) => ({
              id: entry.product_ref,
              qty: entry.quantity,
              sub: entry.is_subscription,
              freq: (byRef[entry.product_ref] && byRef[entry.product_ref].freq) || 30,
            }));
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
          id: thread.id,
          topic: thread.topic,
          orderCode: thread.order,
          unread: thread.unread,
          lastAt: thread.last_at || thread.lastAt,
          pharmacistName: thread.pharmacist_name || thread.pharmacistName || normalizedBootstrap.pharmacist.name,
          messages: Array.isArray(thread.msgs) ? thread.msgs.map((message) => ({
            id: message.id,
            from: message.from_role === 'me' ? 'me' : 'pharm',
            text: message.text,
            at: message.at,
          })) : [],
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
      }),
    });
    const normalizedProfile = normalizeMarketplaceProfile(payload, user);
    setCustomerProfile(normalizedProfile);
    setUser((current) => current ? { ...current, name: normalizedProfile.name } : current);
    return normalizedProfile;
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
    fav, toggleFav, availabilityAlerts, subscribeAvailabilityAlert, unsubscribeAvailabilityAlert, recent, beginCheckout, placeOrder, lastOrder, placingOrder, checkCoverage,
    user, logout, reorder, orders, statusMap: MARKETPLACE_ORDER_STATUS_MAP, stores: portalData.stores,
    deliveryEstimate: portalData.deliveryEstimate,
    paymentRules: portalData.marketplace,
    profile: customerProfile, setCustomerProfile, saveCustomerAvatar, saveCustomerProfile, beginTwoFactorSetup, enableTwoFactor, disableTwoFactor,
    addresses, createCustomerAddress, updateCustomerAddress, deleteCustomerAddress, setPrimaryCustomerAddress,
    cards, tokenizeAndSaveCard, deleteCustomerPaymentMethod, setPrimaryCustomerPaymentMethod,
    privacyPrograms: [], commChannels: [],
    healthServices: portalData.healthServices, healthHistory: portalData.healthHistory, bookHealthAppointment,
    openChat, openPrescription, requireAuth,
    chatThreads, activeChatThreadId, selectChatThread, sendChatMessage,
    subs, patchSub, removeSub, addSub, skipNextSub, coupons,
    accountNav: t.accountNav, showCashback: t.showCashback,
    cardVariant: t.cardVariant, homeVariant: t.homeVariant, productVariant: t.productVariant, checkoutVariant: t.checkoutVariant,
    authClient, authReady, finalizeAuthenticatedSession,
  };

  const canUseMarketplace = !user || window.FA_ACCESS.canAccessMarketplace(user);

  // ---- tweak-driven CSS vars ----
  const pal = PALETTES[t.paletteName] || PALETTES['Vinho Aura'];
  const rootStyle = {
    '--fa-primary': pal.primary, '--fa-primary-ink': pal.ink, '--fa-vital': pal.vital,
    '--fa-rose': pal.rose, '--fa-rose-soft': pal.roseSoft,
    '--fa-font': FONT_STACKS[t.font] || FONT_STACKS.Montserrat,
    '--fa-radius-scale': t.radius / 100,
    '--fa-aura': t.aura / 100,
  };

  const renderScreen = () => {
    switch (route.name) {
      case 'home': return <HomeScreen ctx={ctx} />;
      case 'category': return <ShopScreen ctx={ctx} mode="category" />;
      case 'offers': return <ShopScreen ctx={ctx} mode="offers" />;
      case 'search': return <ShopScreen ctx={ctx} mode="search" />;
      case 'product': return <ProductScreen ctx={ctx} />;
      case 'cart': return <CartScreen ctx={ctx} />;
      case 'checkout': return <CheckoutScreen ctx={ctx} />;
      case 'confirm': return <ConfirmScreen ctx={ctx} />;
      case 'care': return <CareScreen ctx={ctx} />;
      case 'subscriptions': return <SubscriptionsScreen ctx={ctx} />;
      case 'services': return <ServicesScreen ctx={ctx} />;
      case 'cashback': return <CashbackScreen ctx={ctx} />;
      case 'saved': return <SavedScreen ctx={ctx} />;
      case 'rx': return <PrescriptionScreen ctx={ctx} />;
      case 'discover': return <ShopScreen ctx={ctx} mode="mostsearched" />;
      case 'login': return <LoginScreen ctx={ctx} />;
      case 'unlock-account': return <UnlockAccountScreen ctx={ctx} />;
      case 'account': return <AccountScreen ctx={ctx} />;
      case 'orders': return <AccountScreen ctx={ctx} />;
      default: return <HomeScreen ctx={ctx} />;
    }
  };

  return (
    <div id="fa-root" data-density={t.density} style={rootStyle}>
      <Header cats={portalData.categories} portalData={portalData} route={route} cartCount={cartCount} query={route.query} user={user} onNav={onNav} onSearch={onSearch} onChat={() => openChat()} onPrescription={openPrescription} />
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
      <Footer cats={portalData.categories} portalData={portalData} onNav={onNav} />

      <PharmacistChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        user={user}
        authClient={authClient}
        onAuthenticated={finalizeChatLogin}
        threads={chatThreads}
        activeThreadId={activeChatThreadId}
        onSelectThread={selectChatThread}
        onSendMessage={sendChatMessage}
        onOpenAccountConversations={() => { setChatOpen(false); onNav({ name: 'account', tab: 'conversations' }); }}
      />
      <PrescriptionModal open={rxOpen} onClose={() => setRxOpen(false)} />

      {/* toast */}
      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 200, background: 'var(--fa-ink)', color: '#fff', padding: '14px 20px', borderRadius: 'var(--fa-r-btn)', boxShadow: 'var(--fa-shadow-lg)', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14 }} className="fa-fadein">
          <span style={{ width: 24, height: 24, borderRadius: 99, background: 'var(--fa-success)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="check" size={15} stroke={2.8} /></span>
          {toast}
          <button onClick={() => onNav({ name: 'cart' })} style={{ border: 'none', background: 'rgba(255,255,255,.16)', color: '#fff', borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: 13, marginLeft: 6 }}>Ver carrinho</button>
        </div>
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Layout das telas" />
        <TweakRadio label="Card de produto" value={t.cardVariant} options={[{ value: 'standard', label: 'Padrão' }, { value: 'image', label: 'Imagem' }, { value: 'list', label: 'Lista' }]} onChange={(v) => setTweak('cardVariant', v)} />
        <TweakRadio label="Página de produto" value={t.productVariant} options={[{ value: 'A', label: 'Dividida' }, { value: 'B', label: 'Editorial' }]} onChange={(v) => setTweak('productVariant', v)} />
        <TweakRadio label="Checkout" value={t.checkoutVariant} options={[{ value: 'A', label: 'Etapas' }, { value: 'B', label: 'Página única' }]} onChange={(v) => setTweak('checkoutVariant', v)} />

        <TweakSection label="Minha conta" />
        <TweakRadio label="Navegação da conta" value={t.accountNav} options={[{ value: 'side', label: 'Lateral' }, { value: 'top', label: 'Topo' }]} onChange={(v) => setTweak('accountNav', v)} />
        <TweakToggle label="Mostrar cashback" value={t.showCashback} onChange={(v) => setTweak('showCashback', v)} />

        <TweakSection label="Marca" />
        <TweakColor label="Cor primária" value={pal.primary}
          options={Object.values(PALETTES).map((p) => [p.primary, p.vital, p.rose])}
          onChange={(arr) => { const name = Object.keys(PALETTES).find((k) => PALETTES[k].primary === arr[0]); setTweak('paletteName', name); }} />
        <TweakSelect label="Fonte" value={t.font} options={['Montserrat', 'Manrope', 'Nunito Sans']} onChange={(v) => setTweak('font', v)} />

        <TweakSection label="Aparência" />
        <TweakSlider label="Aura (decoração)" value={t.aura} min={0} max={100} unit="%" onChange={(v) => setTweak('aura', v)} />
        <TweakRadio label="Densidade" value={t.density} options={[{ value: 'compact', label: 'Densa' }, { value: 'regular', label: 'Padrão' }, { value: 'comfy', label: 'Ampla' }]} onChange={(v) => setTweak('density', v)} />
        <TweakSlider label="Raio das bordas" value={t.radius} min={40} max={160} step={5} unit="%" onChange={(v) => setTweak('radius', v)} />
      </TweaksPanel>
    </div>
  );
}

export {
  App,
  FONT_STACKS,
  MARKETPLACE_CATALOG_STORAGE_KEY,
  MARKETPLACE_CHAT_STORAGE_KEY,
  PALETTES,
  TWEAK_DEFAULTS,
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
