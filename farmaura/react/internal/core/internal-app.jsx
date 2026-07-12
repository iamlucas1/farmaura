import "../../shared/portal-cache.js";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { AccountModal, PharmLogin, Sidebar } from "./internal-shell.jsx";
import { FontTweaks } from "./internal-tweaks.jsx";
import { AnalyticsScreen } from "../screens/analytics-screen.jsx";
import { CrmScreen } from "../screens/crm-screen.jsx";
import { Dashboard } from "../screens/dashboard-screen.jsx";
import { DeliveriesScreen } from "../screens/deliveries-screen.jsx";
import { ChatScreen } from "../screens/chat-screen.jsx";
import { CouponModal, CouponsScreen, getCouponStatusKey } from "../screens/coupons-screen.jsx";
import { InventoryScreen } from "../screens/inventory-screen.jsx";
import { OrderDrawer, OrdersScreen } from "../screens/orders-screen.jsx";
import { PdvScreen } from "../screens/point-of-sale-screen.jsx";
import { PricingScreen, priceCalc } from "../screens/pricing-screen.jsx";
import { RxScreen } from "../screens/prescriptions-screen.jsx";
import { SalesScreen } from "../screens/sales-screen.jsx";


function PharmApp() {
  const INTERNAL_LOGIN_DENIED_MESSAGE = 'Não foi possível concluir o acesso com as credenciais informadas.';
  const deriveStockStateKey = (item) => {
    const qty = Number(item && (item.qty ?? item.quantity) || 0);
    const lowThreshold = Number(item && (item.lowThreshold ?? item.low_stock_threshold ?? item.min ?? item.minimum_quantity) || 0);
    const attentionThreshold = Number(item && (item.attentionThreshold ?? item.attention_stock_threshold ?? lowThreshold) || lowThreshold);
    if (qty <= 0) return 'out';
    if (qty <= lowThreshold) return 'low';
    if (qty <= attentionThreshold) return 'attention';
    return 'normal';
  };
  const computeInventorySummary = (items) => (items || []).reduce((summary, item) => {
    const state = deriveStockStateKey(item);
    summary.total_items += 1;
    summary.controlled_items += item && (item.controlled || item.is_controlled) ? 1 : 0;
    if (state === 'normal') summary.normal_stock_items += 1;
    if (state === 'attention') summary.attention_stock_items += 1;
    if (state === 'low') summary.low_stock_items += 1;
    if (state === 'out') summary.out_of_stock_items += 1;
    return summary;
  }, {
    total_items: 0,
    normal_stock_items: 0,
    attention_stock_items: 0,
    low_stock_items: 0,
    out_of_stock_items: 0,
    controlled_items: 0,
  });
  const isFilePreview = window.location && window.location.protocol === 'file:';
  const EMPTY_INVENTORY_SUMMARY = computeInventorySummary([]);
  const INVENTORY_FALLBACK_SUMMARY = EMPTY_INVENTORY_SUMMARY;
  const authClientRef = useRef(null);
  if (!authClientRef.current) {
    authClientRef.current = window.FA_API.createClient('internal');
  }
  const authClient = authClientRef.current;
  const readInternalCache = (actor, key, fallbackValue) => window.FA_PORTAL_CACHE.readLocal('internal', actor, key, fallbackValue);
  const writeInternalCache = (actor, key, value) => window.FA_PORTAL_CACHE.writeLocal('internal', actor, key, value);
  const MARKETPLACE_CATALOG_STORAGE_KEY = 'fa_marketplace_catalog';
  const normalizeCouponCampaign = (item) => ({
    id: item.id,
    code: item.code || '',
    title: item.title || '',
    description: item.description || '',
    discountType: item.discount_type || 'percent',
    shippingDiscountMode: item.shipping_discount_mode || 'full',
    discountValue: Number(item.discount_value || 0),
    minimumOrderValue: Number(item.minimum_order_value || 0),
    maxDiscountValue: item.max_discount_value == null ? null : Number(item.max_discount_value),
    startsAt: item.starts_at || '',
    endsAt: item.ends_at || '',
    usageLimit: item.usage_limit == null ? null : Number(item.usage_limit),
    usageCount: Number(item.usage_count || 0),
    perCustomerLimit: Number(item.per_customer_limit || 1),
    audience: item.audience || 'all',
    scopeType: item.scope_type || 'all',
    targetCategories: Array.isArray(item.target_categories) ? item.target_categories : [],
    targetProducts: Array.isArray(item.target_products) ? item.target_products : [],
    firstPurchaseOnly: !!item.first_purchase_only,
    stackable: !!item.stackable,
    active: !!item.active,
    notes: item.notes || '',
    createdAt: item.created_at || '',
    updatedAt: item.updated_at || '',
  });
  const buildCouponMutationPayload = (payload) => ({
    code: String(payload.code || '').trim().toUpperCase(),
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim(),
    discount_type: payload.discountType === 'shipping' ? 'shipping' : payload.discountType === 'fixed' ? 'fixed' : 'percent',
    shipping_discount_mode: payload.discountType === 'shipping' ? (payload.shippingDiscountMode || 'full') : 'full',
    discount_value: Number(payload.discountValue || 0),
    minimum_order_value: Number(payload.minimumOrderValue || 0),
    max_discount_value: payload.maxDiscountValue === '' || payload.maxDiscountValue == null ? null : Number(payload.maxDiscountValue || 0),
    starts_at: payload.startsAt || '',
    ends_at: payload.endsAt || '',
    usage_limit: payload.usageLimit === '' || payload.usageLimit == null ? null : Number(payload.usageLimit || 0),
    per_customer_limit: payload.perCustomerLimit === '' || payload.perCustomerLimit == null ? 1 : Number(payload.perCustomerLimit || 1),
    audience: payload.audience || 'all',
    scope_type: payload.scopeType || 'all',
    target_categories: Array.isArray(payload.targetCategories) ? payload.targetCategories : [],
    target_products: Array.isArray(payload.targetProducts) ? payload.targetProducts : [],
    first_purchase_only: !!payload.firstPurchaseOnly,
    stackable: !!payload.stackable,
    active: payload.active !== false,
    notes: String(payload.notes || '').trim(),
  });
  const MARKETPLACE_CATEGORY_MAP = {
    medicamentos: 'medicamentos',
    medicamento: 'medicamentos',
    remedios: 'medicamentos',
    remedio: 'medicamentos',
    perfumaria: 'perfumaria',
    beleza: 'perfumaria',
    cosmeticos: 'perfumaria',
    cosmetico: 'perfumaria',
    dermocosmeticos: 'perfumaria',
    suplementos: 'bem-estar',
    vitaminas: 'bem-estar',
    vitamina: 'bem-estar',
    bemestar: 'bem-estar',
    'bem-estar': 'bem-estar',
    higiene: 'cuidados',
    cuidados: 'cuidados',
    infantil: 'cuidados',
    mamaebebe: 'cuidados',
    'mamãeebebê': 'cuidados',
    'mamaeebebe': 'cuidados',
  };
  const normalizeMarketplaceCategory = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const resolveMarketplaceCategory = (item) => {
    const keys = [item && item.cat, item && item.medClass, item && item.name];
    for (const value of keys) {
      const normalized = normalizeMarketplaceCategory(value);
      if (normalized && MARKETPLACE_CATEGORY_MAP[normalized]) {
        return MARKETPLACE_CATEGORY_MAP[normalized];
      }
    }
    return 'medicamentos';
  };
  const slugMarketplaceValue = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const normalizeMarketplaceImageList = (value) => {
    if (!Array.isArray(value)) {
      return [];
    }
    return Array.from(new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))).slice(0, 8);
  };
  const resolveMarketplaceFallbackImageUrl = (product) => {
    const name = String(product && product.name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const brand = String(product && product.brand || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const sub = String(product && product.sub || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const joined = [name, brand, sub].join(" ");
    const staticBase = window.FA_API && window.FA_API.staticBase ? window.FA_API.staticBase : "/static";
    const base = staticBase + "/marketplace/placeholders/";

    if (product && product.rx) {
      if (joined.includes("tarja preta") || joined.includes("tarjapreta") || joined.includes("psicotrop")) {
        if (joined.includes("retencao") || joined.includes("receita")) return base + "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta.png";
        return base + "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta-generico.png";
      }
      if (joined.includes("retencao") || joined.includes("receita")) {
        if (joined.includes("generico")) return base + "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-generico.png";
        return base + "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita.png";
      }
      if (joined.includes("generico")) return base + "PlaceHolder-venda-sob-prescricao-medica-generico.png";
      return base + "PlaceHolder-venda-sob-prescricao-medica.png";
    }

    if (joined.includes("generico")) return base + "PlaceHolder-generico.png";
    return base + "PlaceHolder.png";
  };
  const buildMarketplaceCatalog = (items) => {
    const groups = new Map();
    (items || [])
      .filter((item) => item && item.marketplaceVisible && item.active !== false && Number(item.price || 0) > 0)
      .forEach((item) => {
        const name = String(item.name || 'Produto de estoque').trim() || 'Produto de estoque';
        const brand = String(item.brand || 'Farmaura').trim() || 'Farmaura';
        const sku = String(item.sku || '').trim();
        const ean = String(item.ean || '').trim();
        const sourceId = 'inv-' + item.id;
        const groupKey = [
          slugMarketplaceValue(name) || slugMarketplaceValue(sku) || sourceId,
          slugMarketplaceValue(brand) || 'sem-marca',
        ].join('::');
        const basePrice = Math.max(0, Number(item.price || 0));
        const promo = Math.max(0, Number(item.promo || 0));
        const effectivePrice = promo > 0 ? Math.round(basePrice * (1 - promo / 100) * 100) / 100 : basePrice;
        const availableStock = Math.max(0, Number(item.qty || 0));
        const tags = [];
        const marketplaceImages = normalizeMarketplaceImageList(item.marketplaceImages);
        const primaryImageUrl = marketplaceImages[0] || '';
        const imagePolicy = primaryImageUrl ? 'brand_image' : (item.controlled ? 'prescription_restricted' : 'placeholder_only');
        if (promo > 0) tags.push('oferta');
        if (item.controlled) tags.push('receita');
        const candidate = {
          id: 'mkt-' + ((slugMarketplaceValue(name) || slugMarketplaceValue(sku) || 'produto') + '-' + (slugMarketplaceValue(brand) || 'sem-marca')).slice(0, 96),
          inventoryId: item.id,
          inventoryIds: [item.id],
          aliases: [sourceId],
          sku,
          ean,
          name,
          brand,
          cat: resolveMarketplaceCategory(item),
          sub: item.medClass || item.cat || 'Medicamentos',
          price: effectivePrice,
          old: promo > 0 ? basePrice : null,
          discount: promo > 0 ? promo : 0,
          rx: !!item.controlled,
          tags,
          stock: availableStock,
          info: item.note || 'Disponível no marketplace Farmaura',
          imageUrl: imagePolicy === 'brand_image'
            ? primaryImageUrl
            : (item.controlled
              ? resolveMarketplaceFallbackImageUrl({ name, brand, sub: item.medClass || item.cat || 'Medicamentos', rx: true })
              : resolveMarketplaceFallbackImageUrl({ name, brand, sub: item.medClass || item.cat || 'Medicamentos', rx: false })),
          gallery: imagePolicy === 'brand_image' ? marketplaceImages : [],
          imageAlt: name,
          imagePolicy,
          sourceCount: 1,
          primaryStock: availableStock,
        };
        if (!groups.has(groupKey)) {
          groups.set(groupKey, candidate);
          return;
        }
        const current = groups.get(groupKey);
        current.stock += availableStock;
        current.sourceCount += 1;
        current.rx = current.rx || candidate.rx;
        current.inventoryIds = Array.from(new Set([...current.inventoryIds, item.id]));
        current.aliases = Array.from(new Set([...current.aliases, sourceId]));
        current.tags = Array.from(new Set([...current.tags, ...candidate.tags]));
        const shouldReplacePrimary =
          candidate.price < current.price ||
          (candidate.price === current.price && candidate.discount > current.discount) ||
          (candidate.price === current.price && candidate.discount === current.discount && availableStock > current.primaryStock);
        if (shouldReplacePrimary) {
          current.inventoryId = candidate.inventoryId;
          current.sku = candidate.sku || current.sku;
          current.ean = candidate.ean || current.ean;
          current.cat = candidate.cat || current.cat;
          current.sub = candidate.sub || current.sub;
          current.price = candidate.price;
          current.old = candidate.old;
          current.discount = candidate.discount;
          current.info = candidate.info || current.info;
          current.imageUrl = candidate.imageUrl || current.imageUrl;
          current.gallery = Array.isArray(candidate.gallery) ? candidate.gallery : current.gallery;
          current.imageAlt = candidate.imageAlt || current.imageAlt;
          current.imagePolicy = candidate.imagePolicy || current.imagePolicy;
          current.primaryStock = availableStock;
        }
      });
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        info: group.info || 'Disponível no marketplace Farmaura',
      }))
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR'));
  };
  const persistMarketplaceCatalog = (items) => {
    try {
      writeInternalCache(user, MARKETPLACE_CATALOG_STORAGE_KEY, buildMarketplaceCatalog(items));
    } catch {}
  };
  const normalizeInventoryItem = (item) => {
    const lowThreshold = Number(item.low_stock_threshold ?? item.lowThreshold ?? item.minimum_quantity ?? item.min ?? 0);
    const attentionThreshold = Number(item.attention_stock_threshold ?? item.attentionThreshold ?? lowThreshold);
    const normalThreshold = Number(item.normal_stock_threshold ?? item.normalThreshold ?? attentionThreshold);
    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      brand: item.brand_name || item.brand || '',
      cat: item.category_name || item.cat || 'Medicamentos',
      medClass: item.medication_class_name || item.medClass || item.category_name || item.cat || 'Geral',
      ean: item.ean_code || item.ean || '',
      loc: item.storage_location_code || item.loc || '',
      batch: item.batch_code || item.batch || '—',
      expiry: item.expiry_label || item.expiry || '—',
      qty: Number(item.quantity ?? item.qty ?? 0),
      min: Number(item.minimum_quantity ?? item.min ?? lowThreshold),
      lowThreshold,
      attentionThreshold,
      normalThreshold,
      price: Number(item.sale_price ?? item.price ?? 0),
      cost: Number(item.acquisition_cost ?? item.cost ?? 0),
      ref: Number(item.market_reference_price ?? item.ref ?? 0),
      promo: Number(item.promotional_discount_percent ?? item.promo ?? 0),
      controlled: !!(item.is_controlled ?? item.controlled),
      active: item.is_active == null ? true : !!item.is_active,
      marketplaceVisible: item.is_marketplace_visible == null ? true : !!item.is_marketplace_visible,
      note: item.note || '',
      marketplaceImages: normalizeMarketplaceImageList(
        (Array.isArray(item.marketplace_gallery_urls) && item.marketplace_gallery_urls.length)
          ? item.marketplace_gallery_urls
          : (item.marketplace_image_url ? [item.marketplace_image_url] : (item.marketplaceImages || []))
      ),
      raw: item,
    };
  };
  const normalizeInventoryLocation = (location) => ({
    id: location.id,
    code: location.code,
    name: location.name,
    zone: location.zone || '',
    description: location.description || '',
    temperatureRange: location.temperature_range || '',
    controlledOnly: !!location.is_controlled_only,
    active: !!location.is_active,
    allocatedItems: Number(location.allocated_items || 0),
    raw: location,
  });
  const normalizeInventoryMovement = (movement, itemMap) => ({
    id: movement.id,
    itemId: movement.inventory_item_id,
    itemName: itemMap[movement.inventory_item_id] ? itemMap[movement.inventory_item_id].name : 'Item removido',
    delta: Number(movement.quantity_delta || 0),
    before: Number(movement.quantity_before || 0),
    after: Number(movement.resulting_quantity || 0),
    type: movement.movement_type,
    reason: movement.reason || '',
    note: movement.note || '',
    reference: movement.reference_code || '',
    from: movement.from_location_code || '',
    to: movement.to_location_code || '',
    createdAt: movement.created_at || '',
    raw: movement,
  });
  const normalizeInventoryInvoicePreview = (payload) => ({
    provider: payload.provider,
    model: payload.model,
    sourceFileName: payload.source_file_name,
    header: {
      supplierName: payload.header && payload.header.supplier_name || '',
      supplierDocument: payload.header && payload.header.supplier_document || '',
      invoiceNumber: payload.header && payload.header.invoice_number || '',
      invoiceSeries: payload.header && payload.header.invoice_series || '',
      issueDate: payload.header && payload.header.issue_date || '',
      totalAmount: Number(payload.header && payload.header.total_amount || 0),
      notes: payload.header && payload.header.notes || '',
    },
    items: Array.isArray(payload.items) ? payload.items.map((item) => ({
      lineId: item.line_id,
      description: item.description || '',
      brandName: item.brand_name || '',
      eanCode: item.ean_code || '',
      batchCode: item.batch_code || '',
      expiryLabel: item.expiry_label || '',
      quantity: Number(item.quantity || 0),
      unitCost: Number(item.unit_cost || 0),
      totalCost: Number(item.total_cost || 0),
      suggestedSku: item.suggested_sku || '',
      suggestedName: item.suggested_name || '',
      suggestedBrandName: item.suggested_brand_name || '',
      suggestedCategoryName: item.suggested_category_name || 'Medicamentos',
      suggestedMedicationClassName: item.suggested_medication_class_name || item.suggested_category_name || 'Geral',
      suggestedStorageLocationCode: item.suggested_storage_location_code || '',
      suggestedMinimumQuantity: Number(item.suggested_minimum_quantity || 0),
      suggestedLowStockThreshold: Number(item.suggested_low_stock_threshold || item.suggested_minimum_quantity || 0),
      suggestedAttentionStockThreshold: Number(item.suggested_attention_stock_threshold || item.suggested_low_stock_threshold || item.suggested_minimum_quantity || 0),
      suggestedNormalStockThreshold: Number(item.suggested_normal_stock_threshold || item.suggested_attention_stock_threshold || item.suggested_low_stock_threshold || item.suggested_minimum_quantity || 0),
      suggestedSalePrice: Number(item.suggested_sale_price || 0),
      suggestedAcquisitionCost: Number(item.suggested_acquisition_cost || 0),
      suggestedMarketReferencePrice: Number(item.suggested_market_reference_price || 0),
      suggestedPromotionalDiscountPercent: Number(item.suggested_promotional_discount_percent || 0),
      suggestedIsControlled: !!item.suggested_is_controlled,
      matchCandidates: Array.isArray(item.match_candidates) ? item.match_candidates.map((candidate) => ({
        id: candidate.id,
        sku: candidate.sku || '',
        name: candidate.name || '',
        brandName: candidate.brand_name || '',
        categoryName: candidate.category_name || 'Medicamentos',
        eanCode: candidate.ean_code || '',
        storageLocationCode: candidate.storage_location_code || '',
        currentQuantity: Number(candidate.current_quantity || 0),
        minimumQuantity: Number(candidate.minimum_quantity || 0),
        medicationClassName: candidate.medication_class_name || candidate.category_name || 'Geral',
        lowStockThreshold: Number(candidate.low_stock_threshold || candidate.minimum_quantity || 0),
        attentionStockThreshold: Number(candidate.attention_stock_threshold || candidate.low_stock_threshold || candidate.minimum_quantity || 0),
        normalStockThreshold: Number(candidate.normal_stock_threshold || candidate.attention_stock_threshold || candidate.low_stock_threshold || candidate.minimum_quantity || 0),
        isControlled: !!candidate.is_controlled,
      })) : [],
    })) : [],
    raw: payload,
  });

  const normalizeCrmCustomer = (item) => ({
    id: item.id,
    name: item.name,
    doc: item.doc || '',
    email: item.email || '',
    phone: item.phone || '',
    avatar: item.avatar || '?',
    tier: item.tier || 'Novo',
    recurring: !!item.recurring,
    city: item.city || '',
    district: item.district || '',
    cashback: Number(item.cashback || 0),
    since: item.since || '',
    tenureMonths: Number(item.tenure_months || 0),
    orders: Number(item.orders || 0),
    totalSpent: Number(item.total_spent || 0),
    avgTicket: Number(item.avg_ticket || 0),
    lastDays: item.last_days == null ? null : Number(item.last_days),
    freqDays: item.freq_days == null ? null : Number(item.freq_days),
    subscriptions: Array.isArray(item.subscriptions) ? item.subscriptions : [],
    favorites: Array.isArray(item.favorites) ? item.favorites : [],
    topProducts: Array.isArray(item.top_products) ? item.top_products.map((entry) => ({ n: entry.name || '', q: Number(entry.quantity || 0) })) : [],
    interests: Array.isArray(item.interests) ? item.interests : [],
    catMix: Array.isArray(item.category_mix) ? item.category_mix.map((entry) => [entry.name || '', Number(entry.value || 0)]) : [],
    monthly: Array.isArray(item.monthly) ? item.monthly.map((entry) => Number(entry || 0)) : Array(12).fill(0),
  });
  const normalizeOrdersPayload = (payload) => Array.isArray(payload && payload.items) ? payload.items.map((item) => ({
      id: item.id,
      recordId: item.record_id || item.id,
      customer: item.customer || '',
      phone: item.phone || '',
      doc: item.doc || '',
      status: typeof normalizeOrderStatusValue === 'function' ? normalizeOrderStatusValue(item.status) : (item.status || 'new'),
      fulfillment: item.fulfillment || 'delivery',
      priority: item.priority || 'normal',
      placed: item.placed || '',
      payment: item.payment || '',
      channel: item.channel || '',
      total: Number(item.total || 0),
      address: item.address || '',
      district: item.district || '',
      cep: item.cep || '',
      store: item.store || '',
      pickupCode: item.pickup_code || '',
      pickupCodeRequired: !!item.pickup_code_required,
      fulfillmentLabel: item.fulfillment_label || (item.fulfillment === 'pickup' ? 'Retirada na loja' : 'Entrega em domicilio'),
      note: item.note || '',
      rx: !!item.rx,
      rxStatus: item.rx_status || 'none',
      doneMin: item.done_min == null ? null : Number(item.done_min),
      dist: Number(item.dist || 0),
      sla: Number(item.sla || 0),
      x: item.x == null ? null : Number(item.x),
      y: item.y == null ? null : Number(item.y),
      lat: item.lat == null ? null : Number(item.lat),
      lng: item.lng == null ? null : Number(item.lng),
      nfce: normalizeFiscalDocument(item.fiscal_document),
      items: Array.isArray(item.items) ? item.items.map((line) => ({
        id: line.id,
        name: line.name || '',
        qty: Number(line.qty || 0),
        loc: line.loc || '',
        rx: !!line.rx,
      })) : [],
  })) : [];
  const normalizePrescriptionQueue = (payload) => Array.isArray(payload && payload.items) ? payload.items.map((item) => ({
    id: item.id,
    order: item.order || '—',
    patient: item.patient || '',
    age: item.age == null ? null : Number(item.age),
    doctor: item.doctor || '',
    crm: item.crm || '',
    type: item.type || '',
    issued: item.issued || '',
    validDays: item.valid_days == null ? 0 : Number(item.valid_days),
    sentAt: item.sent_at || '',
    status: item.status || 'pending',
    pharmacistNotes: item.pharmacist_notes || '',
    rejectionReason: item.rejection_reason || '',
    meds: Array.isArray(item.meds) ? item.meds.map((med) => ({
      name: med.name || '',
      dose: med.dose || '',
      qty: med.qty || '',
      match: !!med.match,
    })) : [],
    checks: Array.isArray(item.checks) ? item.checks.reduce((acc, check) => ({ ...acc, [check.key]: !!check.passed }), {}) : {},
  })) : [];
  const normalizeChatThreads = (payload) => Array.isArray(payload && payload.items) ? payload.items.map((item) => ({
    id: item.id,
    customer: item.customer || '',
    order: item.order || '—',
    unread: Number(item.unread || 0),
    online: !!item.online,
    lastAt: item.last_at || '',
    topic: item.topic || 'Atendimento',
    msgs: Array.isArray(item.msgs) ? item.msgs.map((message) => ({
      from: message.from_role === 'cust' ? 'cust' : 'me',
      text: message.text || '',
      at: message.at || '',
    })) : [],
  })) : [];
  const normalizePdvCustomer = (item, customerMap) => {
    if (!item) {
      return null;
    }
    const fallbackKey = String(item.name || '').trim();
    const existing = fallbackKey && customerMap[fallbackKey] ? customerMap[fallbackKey] : null;
    return existing ? { ...existing } : {
      id: item.id || null,
      name: item.name || 'Consumidor não identificado',
      doc: item.doc || '',
      email: '',
      phone: item.phone || '',
      avatar: item.avatar || (item.name || '?').slice(0, 2).toUpperCase(),
      recurring: !!item.recurring,
      tier: 'Novo',
      cashback: Number(item.cashback || 0),
      since: '',
      tenureMonths: 0,
      orders: 0,
      totalSpent: 0,
      avgTicket: 0,
      lastDays: null,
      freqDays: null,
      subscriptions: [],
      favorites: [],
      topProducts: [],
      interests: [],
      catMix: [],
      monthly: Array(12).fill(0),
    };
  };
  const normalizePdvQueue = (payload, customerMap) => Array.isArray(payload && payload.items) ? payload.items.map((item) => ({
    id: item.id,
    sentAt: item.sent_at || '',
    sentBy: item.sent_by || 'Farmacêutico',
    status: item.status || 'queued',
    discount: Number(item.discount || 0),
    subtotal: Number(item.subtotal || 0),
    total: Number(item.total || 0),
    hasControlled: !!item.has_controlled,
    customer: normalizePdvCustomer(item.customer, customerMap),
    items: Array.isArray(item.items) ? item.items.map((line) => ({ id: line.inventory_item_id || line.id, qty: Number(line.qty || 0) })) : [],
  })) : [];
  const normalizeFiscalDocument = (fiscal) => fiscal ? {
    id: fiscal.id,
    numero: fiscal.document_number || '',
    chave: fiscal.access_key || '',
    serie: fiscal.series_code || '001',
    when: fiscal.issue_datetime_label || '',
    total: Number(fiscal.gross_total_amount || 0),
    printableUrl: fiscal.printable_html_url || '',
    authorized: !!fiscal.authorized,
  } : null;
  const normalizePdvSales = (payload, customerMap) => Array.isArray(payload && payload.items) ? payload.items.map((item) => ({
    id: item.id,
    ...(normalizeFiscalDocument(item.fiscal_document) || { numero: item.sale_code || item.id, chave: '', serie: '001', when: item.completed_at || 'agora' }),
    fiscalDocumentId: item.fiscal_document ? item.fiscal_document.id : null,
    total: Number(item.total || 0),
    pay: item.payment_method || 'pix',
    items: Array.isArray(item.items) ? item.items.map((line) => ({
      id: line.inventory_item_id || line.id,
      name: line.name || '',
      brand: line.brand || '',
      loc: line.loc || '',
      qty: Number(line.qty || 0),
      price: Number(line.unit_price || 0),
      controlled: !!line.controlled,
    })) : [],
    customer: normalizePdvCustomer(item.customer, customerMap),
    cpfNota: true,
    cashback: 0,
    cashApplied: 0,
    discVal: 0,
  })) : [];
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [route, setRoute] = useState('dash');
  const [loginError, setLoginError] = useState('');
  useEffect(() => {
    let active = true;

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
        const normalizedUser = window.FA_ACCESS.normalizeInternalUser(window.FA_ACCESS.createUserFromSession(sessionData));
        if (!window.FA_ACCESS.isInternalPortalEligible(normalizedUser)) {
          authClient.clear();
          if (active) {
            setLoginError(INTERNAL_LOGIN_DENIED_MESSAGE);
            setUser(null);
          }
          return;
        }
        setLoginError('');
        setUser(normalizedUser);
      } catch {
        authClient.clear();
        if (active) {
          setLoginError('');
          setUser(null);
        }
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    }

    restoreSession();
    return () => {
      active = false;
    };
  }, [authClient]);
  const safeRoute = user
    ? (window.FA_ACCESS.canAccessInternalRoute(user, route)
      ? route
      : window.FA_ACCESS.getFirstInternalRoute(user))
    : route;
  useEffect(() => {
    window.FA_OBS.initPortal({
      portal: 'internal',
      getRoute: () => route,
      getUser: () => user,
    });
  }, []);
  useEffect(() => {
    window.FA_OBS.emit({
      portal: 'internal',
      type: 'navigation',
      action: 'route.changed',
      route,
      userRole: user && user.role || '',
      accessScope: user && user.accessScope || '',
    });
  }, [route, user]);
  useEffect(() => {
    if (user && safeRoute !== route) {
      setRoute(safeRoute);
    }
  }, [route, safeRoute, user]);
  const [orders, setOrders] = useState([]);
  const [ordersRevision, setOrdersRevision] = useState('');
  const [prescriptions, setRx] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventory, setInv] = useState([]);
  const [inventoryLocations, setInventoryLocations] = useState([]);
  const [inventoryMovements, setInventoryMovements] = useState([]);
  const [inventorySummary, setInventorySummary] = useState(EMPTY_INVENTORY_SUMMARY);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  // Marketplace: taxas da vitrine (edição local com preview imediato na tabela; persistida no backend ao salvar)
  const [marketplace, setMkt] = useState(() => ({ ...readInternalCache(null, 'marketplace_meta', {}) }));
  useEffect(() => { writeInternalCache(user, 'marketplace_meta', marketplace); }, [user && user.id, marketplace]);
  const [marketplaceMetaBusy, setMarketplaceMetaBusy] = useState(false);
  const setMarketplace = (patch) => setMkt((m) => ({ ...m, ...patch }));
  const saveMarketplaceMeta = async () => {
    if (isFilePreview || !user) {
      showToast('Taxas da vitrine salvas', 'success');
      return;
    }
    setMarketplaceMetaBusy(true);
    try {
      const response = await authClient.request('/portal/internal/marketplace-meta', {
        method: 'PUT',
        body: JSON.stringify({
          name: marketplace.name || 'Marketplace Farmaura',
          commission_percent: Number(marketplace.commissionPct || 0),
          payment_fee_percent: Number(marketplace.paymentFeePct || 0),
          fixed_fee: Number(marketplace.fixedFee || 0),
          minimum_margin_percent: Number(marketplace.minMargin || 0),
          legal_name: storeFiscal.legal || '',
          cnpj: storeFiscal.cnpj || '',
          state_registration: storeFiscal.ie || '',
          footer_note: marketplace.footerNote || '',
        }),
      });
      setMkt((m) => ({
        ...m,
        name: response.name || m.name,
        commissionPct: Number(response.commission_percent ?? m.commissionPct),
        paymentFeePct: Number(response.payment_fee_percent ?? m.paymentFeePct),
        fixedFee: Number(response.fixed_fee ?? m.fixedFee),
        minMargin: Number(response.minimum_margin_percent ?? m.minMargin),
        footerNote: response.footer_note ?? m.footerNote,
      }));
      showToast('Taxas da vitrine salvas', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível salvar as taxas da vitrine.', 'warn');
    } finally {
      setMarketplaceMetaBusy(false);
    }
  };
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThreadId] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [couponModalState, setCouponModalState] = useState({ open: false, mode: 'create', couponId: null });
  const [drawerOrder, setDrawerOrder] = useState(null);
  const [toast, setToast] = useState(null);
  const [collapsed, setCollapsed] = useState(() => !!readInternalCache(null, 'collapsed', false));
  useEffect(() => { writeInternalCache(user, 'collapsed', !!collapsed); }, [user && user.id, collapsed]);
  const [acctTab, setAcctTab] = useState(null);
  const [nowLabel, setNowLabel] = useState('');
  const [todayIso, setTodayIso] = useState('');
  const [todayLabel, setTodayLabel] = useState('');
  const [pharmacistProfile, setPharmacistProfile] = useState({});
  const [storeFiscal, setStoreFiscal] = useState({});
  const [chartSeed, setChartSeed] = useState({});
  const [hub, setHub] = useState(null);
  const [deliveryRoute, setDeliveryRoute] = useState(null);
  const [financialSettings, setFinancialSettingsState] = useState(null);
  const [financialSettingsError, setFinancialSettingsError] = useState('');
  const [financialSettingsBusy, setFinancialSettingsBusy] = useState(false);
  const customerByName = Object.fromEntries((customers || []).map((item) => [item.name, item]));
  const retryFinancialSettings = async () => {
    setFinancialSettingsError('');
    try {
      const response = await authClient.request('/portal/internal/financial-settings', { method: 'GET' });
      setFinancialSettingsState(response || { months: {} });
    } catch (error) {
      setFinancialSettingsError(error && error.message ? error.message : 'Não foi possível carregar o financeiro.');
    }
  };
  const saveFinancialMonth = async (nextMonths) => {
    setFinancialSettingsBusy(true);
    try {
      const response = await authClient.request('/portal/internal/financial-settings', {
        method: 'PUT',
        body: JSON.stringify({ months: nextMonths }),
      });
      setFinancialSettingsState(response);
      showToast('Premissas financeiras salvas', 'success');
      return response;
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível salvar o financeiro.', 'warn');
      throw error;
    } finally {
      setFinancialSettingsBusy(false);
    }
  };
  const [crmFocus, setCrmFocus] = useState('');
  // ---- PDV / balcão (carrinho compartilhado) ----
  const [pdvCart, setPdvCart] = useState(() => readInternalCache(null, 'pdv_cart', []));
  useEffect(() => { writeInternalCache(user, 'pdv_cart', pdvCart); }, [user && user.id, pdvCart]);
  const [pdvCustomer, setPdvCustomer] = useState(null);
  const [pdvActiveOrderId, setPdvActiveOrderId] = useState(null);
  // Fila do caixa: pedidos montados pelo farmacêutico e enviados para o caixa.
  const [pdvQueue, setPdvQueue] = useState(() => readInternalCache(null, 'pdv_queue', []));
  useEffect(() => { writeInternalCache(user, 'pdv_queue', pdvQueue); }, [user && user.id, pdvQueue]);
  const pdvAdd = (id) => setPdvCart((prev) => { const ex = prev.find((c) => c.id === id); return ex ? prev.map((c) => c.id === id ? { ...c, qty: c.qty + 1 } : c) : [...prev, { id, qty: 1 }]; });
  const pdvSetQty = (id, qty) => setPdvCart((prev) => qty <= 0 ? prev.filter((c) => c.id !== id) : prev.map((c) => c.id === id ? { ...c, qty } : c));
  const pdvRemove = (id) => setPdvCart((prev) => prev.filter((c) => c.id !== id));
  const pdvClear = () => setPdvCart([]);
  // Farmacêutico envia o pedido montado para a fila do caixa.
  const pdvSendToCashier = async ({ customer, items, discount }) => {
    if (!isFilePreview && user) {
      try {
        const response = await authClient.request('/pdv/orders', {
          method: 'POST',
          body: JSON.stringify({
            customer: customer ? {
              id: customer.id || null,
              name: customer.name || '',
              doc: customer.doc || '',
              phone: customer.phone || '',
              avatar: customer.avatar || '',
              recurring: !!customer.recurring,
              cashback: Number(customer.cashback || 0),
            } : null,
            items: (items || []).map((entry) => ({ id: entry.id, qty: Number(entry.qty || 0) })),
            discount: Number(discount || 0),
            notes: '',
          }),
        });
        const customerMap = Object.fromEntries((customers || []).map((entry) => [entry.name, entry]));
        const queueItems = normalizePdvQueue({ items: [response] }, customerMap);
        setPdvQueue((prev) => {
          const filtered = prev.filter((entry) => entry.id !== response.id);
          return [...queueItems, ...filtered];
        });
        return;
      } catch (error) {
        showToast(error && error.message ? error.message : 'Não foi possível enviar o pedido para o caixa. Tente novamente.', 'warn');
        return;
      }
    }
    setPdvQueue((prev) => [{ id: 'PV-' + Date.now(), sentAt: 'agora', sentBy: pharmacistProfile.name || (user && user.name) || 'Equipe Farmaura', customer: customer || null, discount: discount || 0, items: (items || []).map((c) => ({ id: c.id, qty: c.qty })) }, ...prev]);
  };
  // Caixa assume um pedido da fila: carrega cliente + itens e remove da fila.
  const pdvClaimFromQueue = async (id) => {
    const entry = pdvQueue.find((e) => e.id === id);
    if (!entry) return;
    if (!isFilePreview && user) {
      try {
        const response = await authClient.request('/pdv/orders/' + id + '/claim', { method: 'POST', body: JSON.stringify({}) });
        const customerMap = Object.fromEntries((customers || []).map((item) => [item.name, item]));
        const claimedCustomer = normalizePdvCustomer(response.customer, customerMap);
        setPdvActiveOrderId(response.id);
        setPdvCustomer(claimedCustomer || null);
        setPdvCart(Array.isArray(response.items) ? response.items.map((line) => ({ id: line.inventory_item_id || line.id, qty: Number(line.qty || 0) })) : []);
        setPdvQueue((prev) => prev.filter((row) => row.id !== id));
        return;
      } catch (error) {
        showToast(error && error.message ? error.message : 'Não foi possível assumir o pedido da fila. Tente novamente.', 'warn');
        return;
      }
    }
    setPdvActiveOrderId(id);
    setPdvCustomer(entry.customer || null);
    setPdvCart((entry.items || []).map((it) => ({ id: it.id, qty: it.qty })));
    setPdvQueue((prev) => prev.filter((e) => e.id !== id));
  };
  // Vendas de balcão conclídas (nota emitida) — registro de Vendas & Notas.
  const [pdvSales, setPdvSales] = useState(() => readInternalCache(null, 'pdv_sales', []));
  useEffect(() => { writeInternalCache(user, 'pdv_sales', pdvSales); }, [user && user.id, pdvSales]);
  // Finaliza a venda no backend e retorna o registro sincronizado, com a nota fiscal
  // já emitida automaticamente pelo servidor — nunca gera número/chave no cliente.
  const recordSale = async (sale) => {
    if (isFilePreview || !user || !pdvActiveOrderId) {
      return null;
    }
    const response = await authClient.request('/pdv/orders/' + pdvActiveOrderId + '/complete', {
      method: 'POST',
      body: JSON.stringify({
        payment_method: sale.pay || 'pix',
        include_cpf_on_invoice: sale.cpfNota !== false,
        cashback_applied: Number(sale.cashApplied || 0),
        cashback_earned: Number(sale.cashback || 0),
      }),
    });
    const customerMap = Object.fromEntries((customers || []).map((item) => [item.name, item]));
    const synced = normalizePdvSales({ items: [response] }, customerMap)[0];
    if (synced) {
      setPdvSales((prev) => [synced, ...prev.filter((entry) => entry.id !== synced.id)]);
    }
    setPdvActiveOrderId(null);
    return synced || null;
  };
  // Envia um documento fiscal já emitido por e-mail (impressão usa a URL real do documento).
  const sendFiscalDocumentEmail = async (documentId, email, alsoWhatsapp) => {
    return authClient.request('/fiscal-documents/' + documentId + '/send-email', {
      method: 'POST',
      body: JSON.stringify({ email, also_whatsapp: !!alsoWhatsapp }),
    });
  };
  const finalizeSale = (msg) => showToast(msg || 'Venda registrada · nota emitida', 'success');

  const showToast = (msg, tone) => { setToast({ msg, tone }); clearTimeout(window.__phT); window.__phT = setTimeout(() => setToast(null), 2400); };
  const hydrateInventoryDashboard = (payload) => {
    const items = Array.isArray(payload && payload.items) ? payload.items.map(normalizeInventoryItem) : [];
    const itemMap = Object.fromEntries(items.map((it) => [it.id, it]));
    setInv(items);
    setInventoryLocations(Array.isArray(payload && payload.locations) ? payload.locations.map(normalizeInventoryLocation) : []);
    setInventoryMovements(Array.isArray(payload && payload.recent_movements) ? payload.recent_movements.map((it) => normalizeInventoryMovement(it, itemMap)) : []);
    setInventorySummary(payload && payload.summary ? payload.summary : INVENTORY_FALLBACK_SUMMARY);
    persistMarketplaceCatalog(items);
  };
  const refreshInventory = async () => {
    setInventoryBusy(true);
    setInventoryError('');
    try {
      const payload = await authClient.request('/inventory/dashboard', { method: 'GET' });
      hydrateInventoryDashboard(payload);
    } catch (error) {
      setInventoryError(error && error.message ? error.message : 'Não foi possível carregar o estoque.');
    } finally {
      setInventoryBusy(false);
    }
  };
  useEffect(() => {
    if (!user || !window.FA_ACCESS.canAccessInternalRoute(user, 'inventory')) {
      return;
    }
    refreshInventory();
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    setMkt((current) => ({ ...current, ...readInternalCache(user, 'marketplace_meta', {}) }));
    setCollapsed(!!readInternalCache(user, 'collapsed', false));
    setPdvCart(readInternalCache(user, 'pdv_cart', []));
    setPdvQueue(readInternalCache(user, 'pdv_queue', []));
    setPdvSales(readInternalCache(user, 'pdv_sales', []));
  }, [user && user.id]);

  useEffect(() => {
    if (customers.length && !customers.find((item) => item.name === crmFocus)) {
      setCrmFocus(customers[0].name);
    }
  }, [customers, crmFocus]);
  useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    const customerMapFrom = (list) => Object.fromEntries((list || []).map((item) => [item.name, item]));
    async function refreshOperationsData() {
      const canOrders = window.FA_ACCESS.canAccessInternalRoute(user, 'orders') || window.FA_ACCESS.canAccessInternalRoute(user, 'dash');
      const canRx = window.FA_ACCESS.canAccessInternalRoute(user, 'rx');
      const canCrm = window.FA_ACCESS.canAccessInternalRoute(user, 'crm');
      const canChat = window.FA_ACCESS.canAccessInternalRoute(user, 'chat');
      const canPdv = window.FA_ACCESS.canAccessInternalRoute(user, 'pdv');
      const tasks = await Promise.allSettled([
        authClient.request('/portal/internal/bootstrap', { method: 'GET' }),
        canOrders ? authClient.request('/orders/internal-board', { method: 'GET' }) : Promise.resolve(null),
        canRx ? authClient.request('/prescriptions/review-queue', { method: 'GET' }) : Promise.resolve(null),
        canCrm ? authClient.request('/crm/customers', { method: 'GET' }) : Promise.resolve(null),
        canChat ? authClient.request('/chat/threads', { method: 'GET' }) : Promise.resolve(null),
        canPdv ? authClient.request('/pdv/queue', { method: 'GET' }) : Promise.resolve(null),
        canPdv ? authClient.request('/pdv/sales', { method: 'GET' }) : Promise.resolve(null),
      ]);
      if (!active) {
        return;
      }
      const [bootstrapResult, ordersResult, rxResult, crmResult, chatResult, queueResult, salesResult] = tasks;
      if (bootstrapResult.status === 'fulfilled' && bootstrapResult.value) {
        const bootstrap = bootstrapResult.value;
        setNowLabel(bootstrap.now_label || bootstrap.nowLabel || '');
        setTodayIso(bootstrap.today_iso || bootstrap.todayIso || '');
        setTodayLabel(bootstrap.today_label || bootstrap.todayLabel || '');
        setPharmacistProfile({
          name: bootstrap.pharmacist && bootstrap.pharmacist.name || user.name || 'Equipe Farmaura',
          role: bootstrap.pharmacist && bootstrap.pharmacist.role_label || bootstrap.pharmacist && bootstrap.pharmacist.roleLabel || 'Operação interna',
          crf: bootstrap.pharmacist && bootstrap.pharmacist.registration_code || bootstrap.pharmacist && bootstrap.pharmacist.registrationCode || '',
          email: bootstrap.pharmacist && bootstrap.pharmacist.email || user.email || '',
          store: bootstrap.store && bootstrap.store.name || '',
          avatar: bootstrap.pharmacist && bootstrap.pharmacist.avatar_initials || bootstrap.pharmacist && bootstrap.pharmacist.avatarInitials || '',
        });
        setStoreFiscal({
          name: bootstrap.store && bootstrap.store.name || '',
          legal: bootstrap.marketplace && bootstrap.marketplace.legal_name || bootstrap.marketplace && bootstrap.marketplace.legalName || '',
          cnpj: bootstrap.marketplace && bootstrap.marketplace.cnpj || '',
          ie: bootstrap.marketplace && bootstrap.marketplace.state_registration || bootstrap.marketplace && bootstrap.marketplace.stateRegistration || '',
          addr: bootstrap.store && bootstrap.store.address || '',
          cep: bootstrap.store && bootstrap.store.postal_code || bootstrap.store && bootstrap.store.postalCode || '',
        });
        setMarketplace({
          name: bootstrap.marketplace && bootstrap.marketplace.name || 'Marketplace Farmaura',
          commissionPct: Number(bootstrap.marketplace && bootstrap.marketplace.commission_percent || bootstrap.marketplace && bootstrap.marketplace.commissionPercent || 0),
          paymentFeePct: Number(bootstrap.marketplace && bootstrap.marketplace.payment_fee_percent || bootstrap.marketplace && bootstrap.marketplace.paymentFeePercent || 0),
          fixedFee: Number(bootstrap.marketplace && bootstrap.marketplace.fixed_fee || bootstrap.marketplace && bootstrap.marketplace.fixedFee || 0),
          minMargin: Number(bootstrap.marketplace && bootstrap.marketplace.minimum_margin_percent || bootstrap.marketplace && bootstrap.marketplace.minimumMarginPercent || 0),
          footerNote: bootstrap.marketplace && (bootstrap.marketplace.footer_note ?? bootstrap.marketplace.footerNote) || '',
        });
        setChartSeed(bootstrap.chart_seed || bootstrap.chartSeed || {});
        setCoupons((Array.isArray(bootstrap.coupon_campaigns) ? bootstrap.coupon_campaigns : []).map(normalizeCouponCampaign));
        setFinancialSettingsState(bootstrap.financial_settings || bootstrap.financialSettings || { months: {} });
        setFinancialSettingsError('');
        const routePayload = bootstrap.delivery_route || bootstrap.deliveryRoute || null;
        setDeliveryRoute(routePayload);
        const hubLat = routePayload ? (routePayload.hub_lat != null ? routePayload.hub_lat : routePayload.hubLat) : null;
        const hubLng = routePayload ? (routePayload.hub_lng != null ? routePayload.hub_lng : routePayload.hubLng) : null;
        setHub(routePayload ? {
          name: routePayload.hub_name || routePayload.hubName || '',
          addr: routePayload.hub_address || routePayload.hubAddress || '',
          lat: hubLat != null ? Number(hubLat) : null,
          lng: hubLng != null ? Number(hubLng) : null,
        } : null);
      } else {
        setFinancialSettingsError('Não foi possível carregar os dados do painel interno.');
      }
      let nextCustomers = customers;
      if (crmResult.status === 'fulfilled' && crmResult.value) {
        nextCustomers = Array.isArray(crmResult.value.items) ? crmResult.value.items.map(normalizeCrmCustomer) : nextCustomers;
        setCustomers(nextCustomers);
      }
      const customerMap = customerMapFrom(nextCustomers);
      if (ordersResult.status === 'fulfilled' && ordersResult.value) {
        setOrders(normalizeOrdersPayload(ordersResult.value));
        setOrdersRevision(ordersResult.value.revision || '');
      }
      if (rxResult.status === 'fulfilled' && rxResult.value) {
        setRx(normalizePrescriptionQueue(rxResult.value));
      }
      if (chatResult.status === 'fulfilled' && chatResult.value) {
        setThreads(normalizeChatThreads(chatResult.value));
      }
      if (queueResult.status === 'fulfilled' && queueResult.value) {
        setPdvQueue(normalizePdvQueue(queueResult.value, customerMap));
      }
      if (salesResult.status === 'fulfilled' && salesResult.value) {
        setPdvSales(normalizePdvSales(salesResult.value, customerMap));
      }
    }
    refreshOperationsData();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const canOrders = window.FA_ACCESS.canAccessInternalRoute(user, 'orders') || window.FA_ACCESS.canAccessInternalRoute(user, 'dash');
    if (!canOrders) {
      return;
    }
    let active = true;
    let timer = null;
    async function pollBoardChanges() {
      try {
        const query = ordersRevision ? '?since=' + encodeURIComponent(ordersRevision) : '';
        const response = await authClient.request('/orders/internal-board/changes' + query, { method: 'GET' });
        if (!active || !response) {
          return;
        }
        if (response.has_changes) {
          const nextOrders = normalizeOrdersPayload(response);
          const currentIds = new Set((orders || []).map((item) => item.recordId));
          const newOrders = nextOrders.filter((item) => !currentIds.has(item.recordId));
          setOrders(nextOrders);
          setOrdersRevision(response.revision || '');
          if (newOrders.length) {
            showToast(newOrders.length + ' novo(s) pedido(s) online recebidos', 'success');
          }
        } else if (response.revision) {
          setOrdersRevision(response.revision);
        }
      } catch {}
      if (active) {
        timer = window.setTimeout(pollBoardChanges, 4000);
      }
    }
    timer = window.setTimeout(pollBoardChanges, 4000);
    return () => {
      active = false;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [user, ordersRevision, orders]);

  // ---- counts p/ sidebar ----
  const counts = {
    activeOrders: orders.filter((o) => o.status !== 'dispatched').length,
    deliveries: orders.filter((o) => o.fulfillment === 'delivery' && o.status !== 'dispatched').length,
    pendingRx: prescriptions.filter((r) => r.status === 'pending').length,
    unread: threads.reduce((s, t) => s + t.unread, 0),
    lowStock: inventory.filter((it) => deriveStockStateKey(it) !== 'normal').length,
    pdv: pdvCart.reduce((s, c) => s + c.qty, 0),
    salesPending: orders.filter((o) => /pago/i.test(o.payment) && !o.nfce).length,
    lowMargin: (typeof priceCalc === 'function')
      ? inventory.filter((it) => priceCalc(it, marketplace).margin < marketplace.minMargin).length
      : 0,
    activeCoupons: coupons.filter((coupon) => {
      const status = typeof getCouponStatusKey === 'function' ? getCouponStatusKey(coupon) : (coupon.active ? 'active' : 'inactive');
      return status === 'active' || status === 'expiring';
    }).length,
  };

  // ---- handlers ----
  const onNav = (name) => {
    if (user && !window.FA_ACCESS.canAccessInternalRoute(user, name)) return;
    window.FA_OBS.emit({ portal: 'internal', type: 'navigation', action: 'navigation.requested', route: name, userRole: user && user.role || '', accessScope: user && user.accessScope || '' });
    setRoute(name);
    setDrawerOrder(null);
  };
  const openOrder = (id) => setDrawerOrder(id);
  const closeDrawer = () => setDrawerOrder(null);
  const openCouponCreate = () => setCouponModalState({ open: true, mode: 'create', couponId: null });
  const openCouponEdit = (couponId) => setCouponModalState({ open: true, mode: 'edit', couponId });
  const closeCouponModal = () => setCouponModalState({ open: false, mode: 'create', couponId: null });
  const createCoupon = async (payload) => {
    try {
      const response = await authClient.request('/portal/internal/coupons', {
        method: 'POST',
        body: JSON.stringify(buildCouponMutationPayload(payload)),
      });
      setCoupons((Array.isArray(response) ? response : []).map(normalizeCouponCampaign));
      closeCouponModal();
      showToast('Cupom criado no marketplace', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível criar o cupom.', 'warn');
    }
  };
  const updateCoupon = async (couponId, payload) => {
    try {
      const response = await authClient.request('/portal/internal/coupons/' + couponId, {
        method: 'PUT',
        body: JSON.stringify(buildCouponMutationPayload(payload)),
      });
      setCoupons((Array.isArray(response) ? response : []).map(normalizeCouponCampaign));
      closeCouponModal();
      showToast('Cupom atualizado', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível atualizar o cupom.', 'warn');
    }
  };
  const toggleCouponState = async (couponId, active) => {
    const source = coupons.find((coupon) => coupon.id === couponId);
    if (!source) return;
    try {
      const response = await authClient.request('/portal/internal/coupons/' + couponId, {
        method: 'PUT',
        body: JSON.stringify(buildCouponMutationPayload({ ...source, active })),
      });
      setCoupons((Array.isArray(response) ? response : []).map(normalizeCouponCampaign));
      showToast(active ? 'Cupom ativado' : 'Cupom pausado', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível atualizar o cupom.', 'warn');
    }
  };
  const removeCoupon = async (couponId) => {
    try {
      const response = await authClient.request('/portal/internal/coupons/' + couponId, { method: 'DELETE' });
      setCoupons((Array.isArray(response) ? response : []).map(normalizeCouponCampaign));
      showToast('Cupom removido', 'warn');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível remover o cupom.', 'warn');
    }
  };
  const duplicateCoupon = async (couponId) => {
    const source = coupons.find((coupon) => coupon.id === couponId);
    if (!source) {
      return;
    }
    const nextCodeBase = String(source.code || 'COUPON').replace(/-COPY\d*$/i, '');
    const existingCodes = new Set(coupons.map((coupon) => String(coupon.code || '').toUpperCase()));
    let suffix = 1;
    let nextCode = nextCodeBase + '-COPY';
    while (existingCodes.has(nextCode)) {
      suffix += 1;
      nextCode = nextCodeBase + '-COPY' + suffix;
    }
    try {
      const response = await authClient.request('/portal/internal/coupons', {
        method: 'POST',
        body: JSON.stringify(buildCouponMutationPayload({ ...source, code: nextCode, title: source.title + ' (cópia)', active: false })),
      });
      setCoupons((Array.isArray(response) ? response : []).map(normalizeCouponCampaign));
      showToast('Cupom duplicado para edição rápida', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível duplicar o cupom.', 'warn');
    }
  };

  const advanceOrder = async (id, { silent } = {}) => {
    window.FA_OBS.emit({ portal: 'internal', type: 'operations', action: 'order.advance', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { orderId: id } });
    const current = orders.find((item) => item.id === id);
    if (!current || (current.fulfillment === 'pickup' && current.status === 'ready')) return;
    const next = { new: 'separating', separating: 'ready', ready: 'dispatched' }[current.status] || current.status;
    if (!isFilePreview && user && current.recordId) {
      try {
        const response = await authClient.request('/orders/' + current.recordId + '/advance', {
          method: 'POST',
          body: JSON.stringify({ next_status: next }),
        });
        const normalized = normalizeOrdersPayload({ items: [response] })[0];
        if (normalized) {
          setOrders((prev) => prev.map((item) => item.recordId === normalized.recordId ? normalized : item));
        }
      } catch (error) {
        if (!silent) showToast(error && error.message ? error.message : 'Nao foi possivel avancar o pedido', 'warn');
        throw error;
      }
    } else {
      setOrders((prev) => prev.map((o) => {
        if (o.id !== id) return o;
        const patch = { status: next };
        if (next === 'dispatched') patch.doneMin = minsSince(o.placed, nowLabel);
        return { ...o, ...patch };
      }));
    }
    if (!silent) {
      const label = { new: 'Separação iniciada', separating: 'Pedido pronto', ready: current.fulfillment === 'pickup' ? 'Retirada confirmada' : 'Pedido despachado' }[current.status];
      showToast(label + ' · ' + id, 'success');
    }
  };

  const updateOrderItemLocation = async (orderRecordId, itemId, locationCode) => {
    if (!orderRecordId || !itemId || !locationCode) {
      return;
    }
    if (!isFilePreview && user) {
      try {
        const response = await authClient.request('/orders/' + orderRecordId + '/items/' + itemId + '/location', {
          method: 'POST',
          body: JSON.stringify({ location_code: locationCode }),
        });
        const normalized = normalizeOrdersPayload({ items: [response] })[0];
        if (normalized) {
          setOrders((prev) => prev.map((item) => item.recordId === normalized.recordId ? normalized : item));
          showToast('Origem do item atualizada', 'success');
        }
        return;
      } catch (error) {
        showToast(error && error.message ? error.message : 'Nao foi possivel atualizar a origem do item', 'warn');
        return;
      }
    }
    setOrders((prev) => prev.map((order) => order.recordId !== orderRecordId ? order : {
      ...order,
      items: order.items.map((item) => item.id === itemId ? { ...item, loc: locationCode } : item),
    }));
    showToast('Origem do item atualizada', 'success');
  };

  const confirmPickupCode = async (orderId, code) => {
    const current = orders.find((item) => item.id === orderId);
    if (!current || !code.trim()) {
      return;
    }
    if (!isFilePreview && user && current.recordId) {
      try {
        const response = await authClient.request('/orders/' + current.recordId + '/pickup/confirm', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        const normalized = normalizeOrdersPayload({ items: [response] })[0];
        if (normalized) {
          setOrders((prev) => prev.map((item) => item.recordId === normalized.recordId ? normalized : item));
        }
        showToast('Retirada validada com sucesso · ' + orderId, 'success');
        return;
      } catch (error) {
        showToast(error && error.message ? error.message : 'Codigo de retirada invalido', 'warn');
        throw error;
      }
    }
    setOrders((prev) => prev.map((item) => item.id === orderId ? { ...item, status: 'dispatched', doneMin: minsSince(item.placed, nowLabel) } : item));
    showToast('Retirada validada com sucesso · ' + orderId, 'success');
  };

  const validateRx = async (id, status) => {
    window.FA_OBS.emit({ portal: 'internal', type: 'clinical', action: 'prescription.review', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { prescriptionId: id, status } });
    if (!isFilePreview && user) {
      try {
        const response = await authClient.request('/prescriptions/' + id + '/decision', {
          method: 'POST',
          body: JSON.stringify({
            status,
            pharmacist_notes: '',
            rejection_reason: status === 'rejected' ? 'Recusada pelo farmacêutico.' : '',
          }),
        });
        const normalized = normalizePrescriptionQueue({ items: [response] })[0];
        if (normalized) {
          setRx((prev) => prev.map((item) => item.id === id ? normalized : item));
          if (status === 'approved') {
            setOrders((prev) => prev.map((item) => item.id === normalized.order ? { ...item, rxStatus: 'approved' } : item));
          }
        }
      } catch (error) {
        showToast(error && error.message ? error.message : 'Não foi possível registrar a decisão da receita. Tente novamente.', 'warn');
        return;
      }
    } else {
      setRx((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
      const rx = prescriptions.find((r) => r.id === id);
      if (rx && status === 'approved') setOrders((prev) => prev.map((o) => o.id === rx.order ? { ...o, rxStatus: 'approved' } : o));
    }
    if (status === 'approved') showToast('Receita validada · pedido liberado', 'success');
    else if (status === 'rejected') showToast('Receita recusada · paciente notificado', 'warn');
  };

  const adjustStock = async (id, payload) => {
    const movement = typeof payload === 'number'
      ? { movementType: payload >= 0 ? 'entry' : 'exit', quantityDelta: payload, reason: payload >= 0 ? 'Manual stock entry' : 'Manual stock exit', note: '', referenceCode: '', storageLocationCode: '' }
      : payload;
    window.FA_OBS.emit({ portal: 'internal', type: 'inventory', action: 'inventory.adjust', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { itemId: id, delta: movement.quantityDelta } });
    const response = await authClient.request('/inventory/items/' + id + '/adjustments', {
      method: 'POST',
      body: JSON.stringify({
        movement_type: movement.movementType,
        quantity_delta: movement.quantityDelta,
        reason: movement.reason,
        note: movement.note || '',
        reference_code: movement.referenceCode || '',
        storage_location_code: movement.storageLocationCode || '',
      }),
    });
    const nextItem = normalizeInventoryItem(response);
    setInv((prev) => prev.map((it) => it.id === id ? { ...it, ...nextItem } : it));
    await refreshInventory();
    showToast('Estoque atualizado', 'success');
  };

  const addInventory = async (item) => {
    window.FA_OBS.emit({ portal: 'internal', type: 'inventory', action: 'inventory.create', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { itemId: item.id || '', sku: item.sku || '' } });
    await authClient.request('/inventory/items', {
      method: 'POST',
      body: JSON.stringify({
        sku: item.sku || '',
        name: item.name,
        brand_name: item.brand || '',
        category_name: item.cat || 'Medicamentos',
        medication_class_name: item.medClass || item.cat || 'Geral',
        ean_code: item.ean || '',
        storage_location_code: item.loc,
        batch_code: item.batch || '',
        expiry_label: item.expiry || '',
        initial_quantity: Number(item.qty || 0),
        minimum_quantity: Number(item.min || item.lowThreshold || 0),
        low_stock_threshold: Number(item.lowThreshold || item.min || 0),
        attention_stock_threshold: Number(item.attentionThreshold || item.lowThreshold || item.min || 0),
        normal_stock_threshold: Number(item.normalThreshold || item.attentionThreshold || item.lowThreshold || item.min || 0),
        sale_price: Number(item.price || 0),
        acquisition_cost: Number(item.cost || 0),
        market_reference_price: Number(item.ref || 0),
        promotional_discount_percent: Number(item.promo || 0),
        is_controlled: !!item.controlled,
        note: item.note || '',
      }),
    });
    await refreshInventory();
    showToast('Item cadastrado no estoque', 'success');
  };

  const updateInventory = async (id, item) => {
    window.FA_OBS.emit({ portal: 'internal', type: 'inventory', action: 'inventory.update', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { itemId: id, sku: item.sku || '' } });
    const current = inv.find((it) => it.id === id);
    const marketplaceImages = normalizeMarketplaceImageList((current && current.marketplaceImages) || []);
    try {
      await authClient.request('/inventory/items/' + id, {
        method: 'PUT',
        body: JSON.stringify({
          sku: item.sku || '',
          name: item.name,
          brand_name: item.brand || '',
          category_name: item.cat || 'Medicamentos',
          medication_class_name: item.medClass || item.cat || 'Geral',
          ean_code: item.ean || '',
          storage_location_code: item.loc,
          batch_code: item.batch || '',
          expiry_label: item.expiry || '',
          minimum_quantity: Number(item.min || item.lowThreshold || 0),
          low_stock_threshold: Number(item.lowThreshold || item.min || 0),
          attention_stock_threshold: Number(item.attentionThreshold || item.lowThreshold || item.min || 0),
          normal_stock_threshold: Number(item.normalThreshold || item.attentionThreshold || item.lowThreshold || item.min || 0),
          sale_price: Number(item.price || 0),
          acquisition_cost: Number(item.cost || 0),
          market_reference_price: Number(item.ref || 0),
          promotional_discount_percent: Number(item.promo || 0),
          is_controlled: !!item.controlled,
          is_active: item.active == null ? true : !!item.active,
          is_marketplace_visible: current ? !!current.marketplaceVisible : true,
          marketplace_image_url: marketplaceImages[0] || '',
          marketplace_gallery_urls: marketplaceImages,
          note: item.note || '',
        }),
      });
    } catch (error) {
      if (error && error.status === 404) {
        await refreshInventory();
        throw new Error('O item não foi encontrado no estoque atual. A lista foi recarregada; abra o item novamente antes de salvar.');
      }
      throw error;
    }
    await refreshInventory();
    showToast('Medicamento atualizado', 'success');
  };

  const addInventoryLocation = async (location) => {
    await authClient.request('/inventory/locations', {
      method: 'POST',
      body: JSON.stringify({
        code: location.code,
        name: location.name,
        zone: location.zone || '',
        description: location.description || '',
        temperature_range: location.temperatureRange || '',
        is_controlled_only: !!location.controlledOnly,
      }),
    });
    await refreshInventory();
    showToast('Local de armazenamento cadastrado', 'success');
  };

  const transferInventory = async (id, payload) => {
    await authClient.request('/inventory/items/' + id + '/transfers', {
      method: 'POST',
      body: JSON.stringify({
        to_location_code: payload.toLocationCode,
        reason: payload.reason,
        note: payload.note || '',
        reference_code: payload.referenceCode || '',
      }),
    });
    await refreshInventory();
    showToast('Transferência registrada', 'success');
  };

  const exportInventory = async (params) => {
    const query = new URLSearchParams();
    if (params && params.query) query.set('query', params.query);
    if (params && params.stockStatus) query.set('stock_status', params.stockStatus);
    if (params && params.controlledOnly) query.set('controlled_only', 'true');
    if (params && params.locationCode) query.set('location_code', params.locationCode);
    if (params && params.medicationClassName) query.set('medication_class_name', params.medicationClassName);
    const result = await authClient.download('/inventory/export' + (query.toString() ? '?' + query.toString() : ''), { method: 'GET' });
    const blobUrl = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    const match = /filename=\"?([^\";]+)\"?/i.exec(result.filename || '');
    link.href = blobUrl;
    link.download = match && match[1] ? match[1] : 'inventory_export.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
    showToast('Exportação gerada', 'success');
  };

  const previewInventoryInvoice = async ({ file, provider, model }) => {
    const form = new FormData();
    form.append('file', file);
    if (provider) form.append('provider', provider);
    if (model) form.append('model', model);
    const payload = await authClient.request('/inventory/invoice-preview', {
      method: 'POST',
      body: form,
      skipJsonContentType: true,
    });
    return normalizeInventoryInvoicePreview(payload);
  };

  const confirmInventoryInvoice = async (payload) => {
    const response = await authClient.request('/inventory/invoice-confirm', {
      method: 'POST',
      body: JSON.stringify({
        invoice_number: payload.invoiceNumber || '',
        invoice_series: payload.invoiceSeries || '',
        supplier_name: payload.supplierName || '',
        reference_code: payload.referenceCode || '',
        note: payload.note || '',
        items: (payload.items || []).map((item) => ({
          line_id: item.lineId,
          action: item.action,
          matched_item_id: item.matchedItemId || '',
          sku: item.sku || '',
          name: item.name || '',
          brand_name: item.brandName || '',
          category_name: item.categoryName || 'Medicamentos',
          medication_class_name: item.medicationClassName || item.categoryName || 'Geral',
          ean_code: item.eanCode || '',
          storage_location_code: item.storageLocationCode || '',
          batch_code: item.batchCode || '',
          expiry_label: item.expiryLabel || '',
          quantity: Number(item.quantity || 0),
          minimum_quantity: Number(item.minimumQuantity || item.lowStockThreshold || 0),
          low_stock_threshold: Number(item.lowStockThreshold || item.minimumQuantity || 0),
          attention_stock_threshold: Number(item.attentionStockThreshold || item.lowStockThreshold || item.minimumQuantity || 0),
          normal_stock_threshold: Number(item.normalStockThreshold || item.attentionStockThreshold || item.lowStockThreshold || item.minimumQuantity || 0),
          sale_price: Number(item.salePrice || 0),
          acquisition_cost: Number(item.acquisitionCost || 0),
          market_reference_price: Number(item.marketReferencePrice || 0),
          promotional_discount_percent: Number(item.promotionalDiscountPercent || 0),
          is_controlled: !!item.isControlled,
          note: item.note || '',
        })),
      }),
    });
    await refreshInventory();
    showToast('Nota fiscal importada para o estoque', 'success');
    return response;
  };

  // Precificador: aplica preço / custo / promo a um item e persiste a precificação
  const setItemPricing = (id, patch) => {
    window.FA_OBS.emit({ portal: 'internal', type: 'marketplace', action: 'pricing.update', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { itemId: id } });
    const { __bulk, ...clean } = patch || {};
    let nextItem = null;
    setInv((prev) => {
      const next = prev.map((it) => {
        if (it.id !== id) {
          return it;
        }
        nextItem = { ...it, ...clean };
        return nextItem;
      });
      persistMarketplaceCatalog(next);
      return next;
    });
    if (!isFilePreview && user && nextItem) {
      const marketplaceImages = normalizeMarketplaceImageList(nextItem.marketplaceImages || []);
      authClient.request('/inventory/items/' + id, {
        method: 'PUT',
        body: JSON.stringify({
          sku: nextItem.sku || '',
          name: nextItem.name,
          brand_name: nextItem.brand || '',
          category_name: nextItem.cat || 'Medicamentos',
          medication_class_name: nextItem.medClass || nextItem.cat || 'Geral',
          ean_code: nextItem.ean || '',
          storage_location_code: nextItem.loc,
          batch_code: nextItem.batch || '',
          expiry_label: nextItem.expiry || '',
          minimum_quantity: Number(nextItem.min || nextItem.lowThreshold || 0),
          low_stock_threshold: Number(nextItem.lowThreshold || nextItem.min || 0),
          attention_stock_threshold: Number(nextItem.attentionThreshold || nextItem.lowThreshold || nextItem.min || 0),
          normal_stock_threshold: Number(nextItem.normalThreshold || nextItem.attentionThreshold || nextItem.lowThreshold || nextItem.min || 0),
          sale_price: Number(nextItem.price || 0),
          acquisition_cost: Number(nextItem.cost || 0),
          market_reference_price: Number(nextItem.ref || 0),
          promotional_discount_percent: Number(nextItem.promo || 0),
          is_controlled: !!nextItem.controlled,
          is_active: nextItem.active == null ? true : !!nextItem.active,
          is_marketplace_visible: !!nextItem.marketplaceVisible,
          marketplace_image_url: marketplaceImages[0] || '',
          marketplace_gallery_urls: marketplaceImages,
          note: nextItem.note || '',
        }),
      }).then(() => refreshInventory()).catch(() => {
        showToast('Não foi possível salvar a publicação no marketplace', 'warn');
      });
    }
    if (!__bulk) showToast('Preço publicado na vitrine', 'success');
  };

  const dispatchRoute = async () => {
    window.FA_OBS.emit({ portal: 'internal', type: 'logistics', action: 'delivery.dispatch_route', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '' });
    const ready = orders.filter((o) => o.fulfillment === 'delivery' && o.status === 'ready');
    if (!ready.length) return;
    const results = await Promise.allSettled(ready.map((o) => advanceOrder(o.id)));
    const dispatchedCount = results.filter((result) => result.status === 'fulfilled').length;
    if (dispatchedCount) {
      showToast(dispatchedCount + ' entregas despachadas · rota enviada', 'success');
    }
    if (dispatchedCount < ready.length) {
      showToast((ready.length - dispatchedCount) + ' entregas não puderam ser despachadas', 'warn');
    }
  };

  // ---- chat ----
  const focusThread = (customer, order) => {
    let th = threads.find((t) => t.customer === customer);
    if (!th) {
      th = { id: 'tx-' + Date.now(), customer, order: order || '—', unread: 0, online: true, lastAt: 'agora', topic: 'Atendimento', msgs: [{ from: 'cust', text: 'Olá! Tenho uma dúvida sobre meu pedido.', at: 'agora' }] };
      setThreads((prev) => [th, ...prev]);
    } else {
      setThreads((prev) => prev.map((t) => t.id === th.id ? { ...t, unread: 0 } : t));
    }
    setActiveThreadId(th.id);
    setRoute('chat');
    setDrawerOrder(null);
  };
  const openChatFor = (o) => focusThread(o.customer, o.id);
  const openChatForName = (name) => focusThread(name, null);

  const setActiveThread = (id) => { setActiveThreadId(id); setThreads((prev) => prev.map((t) => t.id === id ? { ...t, unread: 0 } : t)); };

  const sendChat = async (threadId, text) => {
    window.FA_OBS.emit({ portal: 'internal', type: 'communication', action: 'chat.send', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { threadId, length: String(text || '').length } });
    if (!isFilePreview && user) {
      try {
        const response = await authClient.request('/chat/threads/' + threadId + '/messages', {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
        const normalized = normalizeChatThreads({ items: [response] })[0];
        if (normalized) {
          setThreads((prev) => prev.map((item) => item.id === threadId ? normalized : item));
        }
        return;
      } catch {}
    }
    setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, msgs: [...t.msgs, { from: 'me', text, at: 'agora' }], lastAt: 'agora', unread: 0 } : t));
  };

  const onLogout = async () => {
    window.FA_OBS.emit({ portal: 'internal', type: 'auth', action: 'auth.logout', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '' });
    await authClient.logout();
    setPdvCustomer(null);
    setPdvCart([]);
    setUser(null);
    setRoute('dash');
  };

  const onLogoutAll = async () => {
    window.FA_OBS.emit({ portal: 'internal', type: 'auth', action: 'auth.logout_all', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '' });
    await authClient.logoutAll();
    setPdvCustomer(null);
    setPdvCart([]);
    setUser(null);
    setRoute('dash');
    showToast('Todas as sessões foram invalidadas', 'success');
  };

  const applyInternalTwoFactorState = (enabled) => {
    setUser((current) => current ? { ...current, twoFactorEnabled: !!enabled } : current);
    showToast(enabled ? 'Dupla autenticacao ativada' : 'Dupla autenticacao desativada', 'success');
  };

  const beginTwoFactorSetup = async () => authClient.beginTwoFactorSetup();

  const enableTwoFactor = async (code) => {
    const response = await authClient.enableTwoFactor(code);
    setUser((current) => current ? { ...current, twoFactorEnabled: true } : current);
    return response;
  };

  const disableTwoFactor = async (code) => {
    const response = await authClient.disableTwoFactor(code);
    setUser((current) => current ? { ...current, twoFactorEnabled: false } : current);
    return response;
  };

  if (!authReady) {
    return (
      <div id="ph-root">
        <div className="fa-wrap fa-fadein" style={{ paddingTop: 72, paddingBottom: 96, maxWidth: 720 }}>
          <div className="fa-card" style={{ padding: '32px clamp(22px,4vw,36px)', textAlign: 'center' }}>
            <span className="fa-iconbox" style={{ margin: '0 auto 18px', width: 72, height: 72 }}><Icon name="lock" size={30} /></span>
            <h1 className="fa-h2">Validando sessão interna</h1>
            <p className="fa-lead" style={{ marginTop: 10 }}>
              Estamos restaurando as credenciais do portal e reaplicando as permissões do seu perfil.
            </p>
          </div>
        </div>
        <FontTweaks />
      </div>
    );
  }

  if (!user) {
    return (
      <div id="ph-root">
        <PharmLogin onLogin={async (payload) => {
          setLoginError('');
          if (payload.stage === 'verify-2fa') {
            const flow = await authClient.verifyTwoFactor({
              challenge_token: payload.challengeToken,
              code: payload.code,
            });
            authClient.persistAuthenticatedFlow(flow, payload.rememberSession);
            const sessionData = await authClient.fetchSession();
            const normalizedUser = window.FA_ACCESS.normalizeInternalUser(window.FA_ACCESS.createUserFromSession(sessionData));
            if (!window.FA_ACCESS.isInternalPortalEligible(normalizedUser)) {
              authClient.clear();
              throw new Error(INTERNAL_LOGIN_DENIED_MESSAGE);
            }
            setUser(normalizedUser);
            setRoute(window.FA_ACCESS.getFirstInternalRoute(normalizedUser));
            window.FA_OBS.emit({ portal: 'internal', type: 'auth', action: 'auth.login', route: 'dash', userRole: normalizedUser.role, accessScope: normalizedUser.accessScope, detail: normalizedUser.email });
            showToast('Sessão iniciada · ' + window.FA_ACCESS.INTERNAL_ROLE_LABEL[normalizedUser.role], 'success');
            return flow;
          }
          const response = await authClient.login({
            email: payload.email,
            password: payload.password,
            remember_session: payload.rememberSession,
          });
          if (response.stage === 'two_factor_required') {
            return response;
          }
          authClient.persistAuthenticatedFlow(response, payload.rememberSession);
          const sessionData = await authClient.fetchSession();
          const normalizedUser = window.FA_ACCESS.normalizeInternalUser(window.FA_ACCESS.createUserFromSession(sessionData));
          if (!window.FA_ACCESS.isInternalPortalEligible(normalizedUser)) {
            authClient.clear();
            throw new Error(INTERNAL_LOGIN_DENIED_MESSAGE);
          }
          setUser(normalizedUser);
          setRoute(window.FA_ACCESS.getFirstInternalRoute(normalizedUser));
          window.FA_OBS.emit({ portal: 'internal', type: 'auth', action: 'auth.login', route: 'dash', userRole: normalizedUser.role, accessScope: normalizedUser.accessScope, detail: normalizedUser.email });
          showToast('Sessão iniciada · ' + window.FA_ACCESS.INTERNAL_ROLE_LABEL[normalizedUser.role], 'success');
          return response;
        }} externalError={loginError} />
        <FontTweaks />
      </div>
    );
  }

  const createPdvCustomer = async ({ name, doc, phone }) => {
    const payload = await authClient.request('/crm/customers', {
      method: 'POST',
      body: JSON.stringify({ full_name: name || '', doc: doc || '', phone: phone || '' }),
    });
    const normalized = normalizeCrmCustomer(payload);
    setCustomers((current) => {
      const exists = current.find((entry) => entry.id === normalized.id);
      return exists ? current.map((entry) => entry.id === normalized.id ? normalized : entry) : [...current, normalized];
    });
    return normalized;
  };

  const ctx = {
    orders, prescriptions, inventory, threads, activeThread,
    inventoryLocations, inventoryMovements, inventorySummary, inventoryBusy, inventoryError, refreshInventory,
    route, onNav, openOrder, closeDrawer, drawerOrder,
    advanceOrder, confirmPickupCode, updateOrderItemLocation, validateRx, adjustStock, addInventory, updateInventory, addInventoryLocation, transferInventory, exportInventory, previewInventoryInvoice, confirmInventoryInvoice, dispatchRoute,
    openChatFor, openChatForName, setActiveThread, sendChat, onLogout,
    openCustomer: (name) => { setCrmFocus(name); setRoute('crm'); setDrawerOrder(null); },
    crmFocus,
    pdvCart, pdvCustomer, setPdvCustomer, pdvAdd, pdvSetQty, pdvRemove, pdvClear, finalizeSale,
    pdvQueue, pdvSendToCashier, pdvClaimFromQueue,
    pdvSales, recordSale, sendFiscalDocumentEmail,
    marketplace, setMarketplace, saveMarketplaceMeta, marketplaceMetaBusy, setItemPricing, notify: showToast,
    coupons, couponModalState, openCouponCreate, openCouponEdit, closeCouponModal, createCoupon, updateCoupon, toggleCouponState, removeCoupon, duplicateCoupon,
    customers, customerByName, createPdvCustomer,
    nowLabel, todayIso, todayLabel,
    pharmacistProfile, storeFiscal, chartSeed,
    hub, deliveryRoute,
    financialMonths: financialSettings ? financialSettings.months || {} : null,
    financialSettingsBusy, financialSettingsError, saveFinancialMonth, retryFinancialSettings,
    user,
  };

  const screen = () => {
    switch (safeRoute) {
      case 'dash': return <Dashboard ctx={ctx} />;
      case 'orders': return <OrdersScreen ctx={ctx} />;
      case 'deliveries': return <DeliveriesScreen ctx={ctx} />;
      case 'rx': return <RxScreen ctx={ctx} />;
      case 'inventory': return <InventoryScreen ctx={ctx} />;
      case 'chat': return <ChatScreen ctx={ctx} />;
      case 'crm': return <CrmScreen ctx={ctx} />;
      case 'pdv': return <PdvScreen ctx={ctx} />;
      case 'sales': return <SalesScreen ctx={ctx} />;
      case 'pricing': return <PricingScreen ctx={ctx} />;
      case 'coupons': return <CouponsScreen ctx={ctx} />;
      case 'analytics': return <AnalyticsScreen ctx={ctx} />;
      default: return <Dashboard ctx={ctx} />;
    }
  };

  const toneColor = { success: 'var(--fa-success)', warn: 'var(--fa-warn)', error: 'var(--fa-error)' };

  return (
    <div id="ph-root">
      <div className="ph-shell">
        <Sidebar route={safeRoute} onNav={onNav} counts={counts} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} onLogout={onLogout} onAccount={(t) => setAcctTab(t)} user={user} />
        <div className="ph-main">
          <div key={safeRoute}>{screen()}</div>
        </div>
      </div>

      {drawerOrder && <OrderDrawer ctx={ctx} />}
      {couponModalState.open && (
        <CouponModal
          mode={couponModalState.mode}
          coupon={coupons.find((item) => item.id === couponModalState.couponId) || null}
          inventory={inventory}
          onClose={closeCouponModal}
          onCreate={createCoupon}
          onUpdate={updateCoupon}
        />
      )}
      {acctTab && <AccountModal tab={acctTab} onClose={() => setAcctTab(null)} user={user} onLogoutAll={onLogoutAll} onTwoFactorSetup={beginTwoFactorSetup} onTwoFactorEnable={enableTwoFactor} onTwoFactorDisable={disableTwoFactor} onTwoFactorStatusChange={applyInternalTwoFactorState} />}
      <FontTweaks />

      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 400, background: 'var(--fa-ink)', color: '#fff', padding: '14px 20px', borderRadius: 'var(--fa-r-btn)', boxShadow: 'var(--fa-shadow-lg)', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14 }} className="fa-fadein">
          <span style={{ width: 24, height: 24, borderRadius: 99, background: toneColor[toast.tone] || 'var(--fa-success)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="check" size={15} stroke={2.8} /></span>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export { PharmApp };

createRoot(document.getElementById('root')).render(<PharmApp />);
