import "../../shared/portal-cache.js";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { AccountModal, PharmLogin, Sidebar } from "./internal-shell.jsx";
import { FontTweaks } from "./internal-tweaks.jsx";
import { AcquisitionCostsScreen } from "../screens/acquisition-costs-screen.jsx";
import { AnalyticsScreen } from "../screens/analytics-screen.jsx";
import { BrandsScreen } from "../screens/brands-screen.jsx";
import { CategoriesScreen } from "../screens/categories-screen.jsx";
import { CrmScreen } from "../screens/crm-screen.jsx";
import { Dashboard } from "../screens/dashboard-screen.jsx";
import { DeliveriesScreen } from "../screens/deliveries-screen.jsx";
import { DriverRouteScreen } from "../screens/driver-route-screen.jsx";
import { DeliveryZonesScreen } from "../screens/delivery-zones-screen.jsx";
import { ChatScreen } from "../screens/chat-screen.jsx";
import { ConstructionCostsScreen } from "../screens/construction-costs-screen.jsx";
import { CouponModal, CouponsScreen, getCouponStatusKey } from "../screens/coupons-screen.jsx";
import { PromotionModal, PromotionsScreen, getPromotionStatusKey } from "../screens/promotions-screen.jsx";
import { InventoryScreen } from "../screens/inventory-screen.jsx";
import { InventoryAuditScreen } from "../screens/inventory-audit-screen.jsx";
import { LocationsScreen } from "../screens/locations-screen.jsx";
import { OrderDrawer, OrdersScreen } from "../screens/orders-screen.jsx";
import { PdvScreen } from "../screens/point-of-sale-screen.jsx";
import { PricingScreen, cnaeIndexByCode, priceCalc } from "../screens/pricing-screen.jsx";
import { ProductsScreen } from "../screens/products-screen.jsx";
import { RxScreen } from "../screens/prescriptions-screen.jsx";
import { ProductTraceScreen } from "../screens/product-trace-screen.jsx";
import { SalesScreen } from "../screens/sales-screen.jsx";
import { SettingsScreen } from "../screens/settings-screen.jsx";
import { StoresScreen } from "../screens/stores-screen.jsx";
import { SuppliersScreen } from "../screens/suppliers-screen.jsx";
import { TeamScreen } from "../screens/team-screen.jsx";
import { TherapeuticClassesScreen } from "../screens/therapeutic-classes-screen.jsx";

/* Converte um price rule (fixo/grátis/calculado) snake_case em camelCase */
function normalizePriceRule(rule) {
  const source = rule || {};
  return {
    mode: source.mode || 'fixed',
    fixedFee: Number(source.fixed_fee || 0),
    fuel: {
      fuelType: (source.fuel && source.fuel.fuel_type) || 'gasoline',
      fuelPricePerLiter: Number((source.fuel && source.fuel.fuel_price_per_liter) || 0),
      vehicleKmPerLiter: Number((source.fuel && source.fuel.vehicle_km_per_liter) || 0),
      fuelMarginPercent: Number((source.fuel && source.fuel.fuel_margin_percent) || 0),
    },
  };
}

/* Converte o payload snake_case de /portal/internal/delivery-areas para o formato camelCase usado no estado local */
function normalizeDeliveryAreasResponse(payload) {
  const source = payload || {};
  return {
    stores: (source.stores || []).map((store) => ({
      storeId: store.store_id || '',
      neighborhoods: (store.neighborhoods || []).map((entry) => ({
        id: entry.id,
        postalCode: entry.postal_code || '',
        district: entry.district || '',
        city: entry.city || '',
        stateCode: entry.state_code || '',
        price: normalizePriceRule(entry.price),
        isActive: entry.is_active !== false,
      })),
      radiusTiers: (store.radius_tiers || []).map((entry) => ({
        id: entry.id,
        upToKm: Number(entry.up_to_km || 0),
        price: normalizePriceRule(entry.price),
        isActive: entry.is_active !== false,
      })),
      freeAboveSubtotal: Number(store.free_above_subtotal || 0),
    })),
    variations: (source.variations || []).map((entry) => ({
      id: entry.id, label: entry.label || '', extraFee: Number(entry.extra_fee || 0), etaMinutes: Number(entry.eta_minutes || 0),
    })),
  };
}

/* Converte um price rule camelCase de volta para o payload snake_case aceito pela API */
function serializePriceRule(rule) {
  const source = rule || {};
  return {
    mode: source.mode || 'fixed',
    fixed_fee: Number(source.fixedFee || 0),
    fuel: {
      fuel_type: (source.fuel && source.fuel.fuelType) || 'gasoline',
      fuel_price_per_liter: Number((source.fuel && source.fuel.fuelPricePerLiter) || 0),
      vehicle_km_per_liter: Number((source.fuel && source.fuel.vehicleKmPerLiter) || 0),
      fuel_margin_percent: Number((source.fuel && source.fuel.fuelMarginPercent) || 0),
    },
  };
}

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
  const normalizePricingPromotion = (item) => ({
    id: item.id,
    name: item.name || '',
    description: item.description || '',
    active: !!item.active,
    discountType: item.discount_type || 'percent',
    discountValue: Number(item.discount_value || 0),
    maxDiscountValue: item.max_discount_value == null ? null : Number(item.max_discount_value),
    scopeType: item.scope_type || 'all',
    targetCategories: Array.isArray(item.target_categories) ? item.target_categories : [],
    targetProducts: Array.isArray(item.target_products) ? item.target_products : [],
    startsAt: item.starts_at || '',
    endsAt: item.ends_at || '',
    dailyStartTime: item.daily_start_time || '',
    dailyEndTime: item.daily_end_time || '',
    daysOfWeek: Array.isArray(item.days_of_week) ? item.days_of_week : [],
    minAge: item.min_age == null ? null : Number(item.min_age),
    maxAge: item.max_age == null ? null : Number(item.max_age),
    regions: Array.isArray(item.regions) ? item.regions : [],
    deviceTypes: Array.isArray(item.device_types) ? item.device_types : [],
    maritalStatuses: Array.isArray(item.marital_statuses) ? item.marital_statuses : [],
    minChildren: item.min_children == null ? null : Number(item.min_children),
    maxChildren: item.max_children == null ? null : Number(item.max_children),
    customerSegment: item.customer_segment || 'all',
    priority: Number(item.priority || 0),
    notes: item.notes || '',
    createdAt: item.created_at || '',
    updatedAt: item.updated_at || '',
  });
  const buildPromotionMutationPayload = (payload) => ({
    name: String(payload.name || '').trim(),
    description: String(payload.description || '').trim(),
    active: payload.active !== false,
    discount_type: payload.discountType === 'fixed' ? 'fixed' : 'percent',
    discount_value: Number(payload.discountValue || 0),
    max_discount_value: payload.maxDiscountValue === '' || payload.maxDiscountValue == null ? null : Number(payload.maxDiscountValue || 0),
    scope_type: payload.scopeType || 'all',
    target_categories: Array.isArray(payload.targetCategories) ? payload.targetCategories : [],
    target_products: Array.isArray(payload.targetProducts) ? payload.targetProducts : [],
    starts_at: payload.startsAt || '',
    ends_at: payload.endsAt || '',
    daily_start_time: payload.dailyStartTime || '',
    daily_end_time: payload.dailyEndTime || '',
    days_of_week: Array.isArray(payload.daysOfWeek) ? payload.daysOfWeek : [],
    min_age: payload.minAge === '' || payload.minAge == null ? null : Number(payload.minAge),
    max_age: payload.maxAge === '' || payload.maxAge == null ? null : Number(payload.maxAge),
    regions: Array.isArray(payload.regions) ? payload.regions : [],
    device_types: Array.isArray(payload.deviceTypes) ? payload.deviceTypes : [],
    marital_statuses: Array.isArray(payload.maritalStatuses) ? payload.maritalStatuses : [],
    min_children: payload.minChildren === '' || payload.minChildren == null ? null : Number(payload.minChildren),
    max_children: payload.maxChildren === '' || payload.maxChildren == null ? null : Number(payload.maxChildren),
    customer_segment: payload.customerSegment || 'all',
    priority: payload.priority === '' || payload.priority == null ? 0 : Number(payload.priority),
    notes: String(payload.notes || '').trim(),
  });
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
    const controlledCategory = String(product && product.controlledCategory || "none").trim().toLowerCase();
    const isGeneric = Boolean(product && product.isGeneric);

    if (product && product.rx) {
      const isBlackStripe = controlledCategory === "black_stripe" || joined.includes("tarja preta") || joined.includes("tarjapreta") || joined.includes("psicotrop");
      const requiresRetention = controlledCategory === "prescription_retention" || controlledCategory === "special_control" || controlledCategory === "black_stripe" || joined.includes("retencao") || joined.includes("receita");
      if (isBlackStripe) return base + (isGeneric ? "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta-generico.png" : "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta.png");
      if (requiresRetention) return base + (isGeneric ? "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-generico.png" : "PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita.png");
      return base + (isGeneric ? "PlaceHolder-venda-sob-prescricao-medica-generico.png" : "PlaceHolder-venda-sob-prescricao-medica.png");
    }

    if (isGeneric) return base + "PlaceHolder-generico.png";
    return base + "PlaceHolder.png";
  };
  const buildMarketplaceCatalog = (items) => {
    const groups = new Map();
    (items || [])
      .filter((item) => item && item.active !== false && Number(item.price || 0) > 0)
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
        const availableStock = item.marketplaceVisible
          ? Math.max(0, Number(item.qty || 0))
          : 0;
        const tags = [];
        const isMarketplaceImageRestricted = ["prescription", "prescription_retention", "special_control", "black_stripe"].includes(item.controlledCategory);
        const marketplaceImages = isMarketplaceImageRestricted ? [] : normalizeMarketplaceImageList(item.marketplaceImages);
        const primaryImageUrl = marketplaceImages[0] || "";
        const imagePolicy = primaryImageUrl ? "brand_image" : (isMarketplaceImageRestricted ? "prescription_restricted" : "placeholder_only");
        if (promo > 0) tags.push('oferta');
        if (isMarketplaceImageRestricted) tags.push("receita");
        const candidate = {
          id: 'mkt-' + ((slugMarketplaceValue(name) || slugMarketplaceValue(sku) || 'produto') + '-' + (slugMarketplaceValue(brand) || 'sem-marca')).slice(0, 96),
          inventoryId: item.id,
          inventoryIds: [item.id],
          aliases: [sourceId],
          sku,
          ean,
          name,
          brand,
          cat: slugMarketplaceValue(item.cat) || 'medicamentos',
          sub: item.medClass || item.cat || 'Medicamentos',
          price: effectivePrice,
          old: promo > 0 ? basePrice : null,
          discount: promo > 0 ? promo : 0,
          rx: isMarketplaceImageRestricted,
          controlledCategory: item.controlledCategory || "none",
          isGeneric: !!item.isGeneric,
          tags,
          stock: availableStock,
          info: item.note || 'Disponível no marketplace Farmaura',
          imageUrl: imagePolicy === 'brand_image'
            ? primaryImageUrl
            : (isMarketplaceImageRestricted
              ? resolveMarketplaceFallbackImageUrl({ name, brand, sub: item.medClass || item.cat || "Medicamentos", rx: true, controlledCategory: item.controlledCategory, isGeneric: item.isGeneric })
              : resolveMarketplaceFallbackImageUrl({ name, brand, sub: item.medClass || item.cat || 'Medicamentos', rx: false })),
          gallery: imagePolicy === "brand_image" ? marketplaceImages : [],
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
      storeId: item.store_id || item.storeId || "",
      productId: item.product_id || item.productId || "",
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
      controlledCategory: item.controlled_category || item.controlledCategory || "none",
      isGeneric: !!(item.is_generic ?? item.isGeneric),
      cnae: item.cnae_code || item.cnae || '',
      isSubjectToIcmsSt: item.is_subject_to_icms_st === undefined ? (item.isSubjectToIcmsSt ?? null) : item.is_subject_to_icms_st,
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
    storeId: location.store_id || '',
    storeName: location.store_name || '',
    code: location.code,
    name: location.name,
    zone: location.zone || '',
    description: location.description || '',
    temperatureRange: location.temperature_range || '',
    locationType: location.location_type || 'estoque',
    controlledOnly: !!location.is_controlled_only,
    active: !!location.is_active,
    allocatedItems: Number(location.allocated_items || 0),
    raw: location,
  });
  const normalizeStockLot = (lot) => ({
    id: lot.id,
    storeId: lot.store_id || lot.storeId || "",
    itemId: lot.inventory_item_id,
    locationId: lot.location_id,
    locationCode: lot.location_code || '',
    locationName: lot.location_name || '',
    locationType: lot.location_type || 'estoque',
    supplierId: lot.supplier_id || '',
    supplierName: lot.supplier_name || '',
    batch: lot.batch_code || '',
    expiry: lot.expiry_date || '',
    qty: Number(lot.quantity || 0),
    status: lot.status || 'available',
    unitCost: Number(lot.unit_cost_snapshot || 0),
    receivedAt: lot.received_at || '',
    referenceCode: lot.reference_code || '',
    createdAt: lot.created_at || '',
    raw: lot,
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
  const normalizeAuditEntry = (entry) => ({
    id: entry.id,
    entityType: entry.entity_type,
    entityId: entry.entity_id,
    entityLabel: entry.entity_label || '',
    action: entry.action,
    changes: (entry.changes || []).map((change) => ({ field: change.field, old: change.old, new: change.new })),
    actorUserId: entry.actor_user_id || '',
    actorName: entry.actor_name || '',
    actorEmail: entry.actor_email || '',
    actorRole: entry.actor_role || '',
    ipAddress: entry.ip_address || '',
    userAgent: entry.user_agent || '',
    createdAt: entry.created_at || '',
  });
  const normalizeTraceCandidate = (item) => ({
    id: item.id,
    sku: item.sku || '',
    name: item.name || '',
    brand: item.brand_name || '',
    ean: item.ean_code || '',
    medClass: item.medication_class_name || 'Geral',
    controlledCategory: item.controlled_category || 'none',
    qty: Number(item.quantity || 0),
  });
  const normalizeLotMovement = (movement) => ({
    id: movement.id,
    itemId: movement.inventory_item_id,
    stockLotId: movement.stock_lot_id,
    performedByUserId: movement.performed_by_user_id || '',
    performedByUserName: movement.performed_by_user_name || '',
    type: movement.movement_type,
    delta: Number(movement.quantity_delta || 0),
    before: Number(movement.quantity_before || 0),
    after: Number(movement.resulting_quantity || 0),
    fromLocationCode: movement.from_location_code || '',
    toLocationCode: movement.to_location_code || '',
    batch: movement.batch_code || '',
    expiry: movement.expiry_date || '',
    reason: movement.reason || '',
    note: movement.note || '',
    referenceCode: movement.reference_code || '',
    sourceType: movement.source_type || '',
    sourceId: movement.source_id || '',
    createdAt: movement.created_at || '',
  });
  const normalizeItemTrace = (payload) => ({
    item: {
      id: payload.item.id,
      sku: payload.item.sku || '',
      name: payload.item.name || '',
      brand: payload.item.brand_name || '',
      ean: payload.item.ean_code || '',
      medClass: payload.item.medication_class_name || 'Geral',
      controlledCategory: payload.item.controlled_category || 'none',
      totalAvailableQuantity: Number(payload.item.total_available_quantity || 0),
    },
    lots: Array.isArray(payload.lots) ? payload.lots.map(normalizeStockLot) : [],
    movements: Array.isArray(payload.movements) ? payload.movements.map(normalizeLotMovement) : [],
  });
  const searchItemTrace = async (query) => {
    try {
      const response = await authClient.request('/inventory/trace/search?query=' + encodeURIComponent(query || ''));
      return Array.isArray(response.items) ? response.items.map(normalizeTraceCandidate) : [];
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível buscar produtos.', 'warn');
      return [];
    }
  };
  const fetchItemTrace = async (itemId) => {
    const response = await authClient.request('/inventory/trace/' + itemId);
    return normalizeItemTrace(response);
  };
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
      suggestedTaxCostAmount: item.suggested_tax_cost_amount == null ? null : Number(item.suggested_tax_cost_amount),
      suggestedIsSubjectToIcmsSt: item.suggested_is_subject_to_icms_st == null ? null : !!item.suggested_is_subject_to_icms_st,
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
  const normalizeInventoryInvoiceRecord = (record) => ({
    id: record.id,
    itemId: record.inventory_item_id,
    invoiceTotalAmount: Number(record.invoice_total_amount || 0),
    productTotalAmount: Number(record.product_total_amount || 0),
    quantity: Number(record.quantity || 0),
    unitCost: Number(record.unit_cost || 0),
    fileName: record.file_name || '',
    contentType: record.content_type || '',
    sizeBytes: Number(record.size_bytes || 0),
    note: record.note || '',
    taxCostAmount: record.tax_cost_amount == null ? null : Number(record.tax_cost_amount),
    isSubjectToIcmsSt: record.is_subject_to_icms_st == null ? null : !!record.is_subject_to_icms_st,
    createdAt: record.created_at || '',
  });

  const normalizeCrmCustomer = (item) => ({
    id: item.id,
    name: item.name,
    doc: item.doc || '',
    email: item.email || '',
    phone: item.phone || '',
    birthDate: item.birth_date || '',
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
      trackingCode: item.tracking_code || '',
      carrierName: item.carrier_name || '',
      shippingDispatchRequired: !!item.shipping_dispatch_required,
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
        picked: !!line.picked,
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
      id: message.id,
      from: message.from_role === 'cust' ? 'cust' : 'me',
      text: message.text || '',
      at: message.at || '',
      prescriptionId: message.prescription_id || null,
      prescriptionStatus: message.prescription_status || '',
      prescriptionReferenceUrl: message.prescription_reference_url || '',
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
    items: Array.isArray(item.items) ? item.items.map((line) => ({
      id: line.inventory_item_id || line.id,
      qty: Number(line.qty || 0),
      name: line.name || '',
      brand: line.brand || '',
      price: Number(line.unit_price || 0),
      loc: line.loc || '',
      controlled: !!line.controlled,
    })) : [],
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
    cashback: Number(item.cashback_earned || 0),
    cashApplied: Number(item.cashback_applied || 0),
    discVal: 0,
  })) : [];
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const navigate = useNavigate();
  const urlParams = useParams();
  const route = (urlParams['*'] || '').split('/')[0] || 'dash';
  const goTo = (name) => navigate(name === 'dash' ? '/' : '/' + name);
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
      goTo(safeRoute);
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
  const [stockLots, setStockLots] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [therapeuticClasses, setTherapeuticClasses] = useState([]);
  const [storeDirectory, setStoreDirectory] = useState([]);
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
          pix_discount_percent: Number(marketplace.pixDiscountPercent || 0),
          max_installments: Number(marketplace.maxInstallments || 1),
          interest_free_installments: Number(marketplace.interestFreeInstallments || 1),
          installment_interest_percent: Number(marketplace.installmentInterestPercent || 0),
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
        pixDiscountPercent: Number(response.pix_discount_percent ?? m.pixDiscountPercent),
        maxInstallments: Number(response.max_installments ?? m.maxInstallments),
        interestFreeInstallments: Number(response.interest_free_installments ?? m.interestFreeInstallments),
        installmentInterestPercent: Number(response.installment_interest_percent ?? m.installmentInterestPercent),
      }));
      showToast('Taxas da vitrine salvas', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível salvar as taxas da vitrine.', 'warn');
    } finally {
      setMarketplaceMetaBusy(false);
    }
  };
  // Desconto no PDV: margem média mínima que o carrinho deve manter para liberar um desconto
  const [pdvDiscountSettings, setPdvDiscountSettingsState] = useState({ minMarginPercent: 20 });
  const [pdvDiscountSettingsBusy, setPdvDiscountSettingsBusy] = useState(false);
  const setPdvDiscountSettings = (patch) => setPdvDiscountSettingsState((s) => ({ ...s, ...patch }));
  const savePdvDiscountSettings = async () => {
    if (isFilePreview || !user) {
      showToast('Configuração de desconto salva', 'success');
      return;
    }
    setPdvDiscountSettingsBusy(true);
    try {
      const response = await authClient.request('/portal/internal/pdv-discount-settings', {
        method: 'PUT',
        body: JSON.stringify({ minimum_margin_percent: Number(pdvDiscountSettings.minMarginPercent || 0) }),
      });
      setPdvDiscountSettingsState((s) => ({ ...s, minMarginPercent: Number(response.minimum_margin_percent ?? s.minMarginPercent) }));
      showToast('Configuração de desconto salva', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível salvar a configuração de desconto.', 'warn');
    } finally {
      setPdvDiscountSettingsBusy(false);
    }
  };
  // CNAEs da farmácia + regime tributário (Simples Nacional): usados para tributar automaticamente o preço de cada item no Precificador
  const DEFAULT_TAX_REGIME = { regime: 'simples_nacional', stateCode: '', trailing12mRevenue: 0 };
  const [cnaeSettings, setCnaeSettingsState] = useState({ items: [], taxRegime: DEFAULT_TAX_REGIME });
  const [cnaeSettingsBusy, setCnaeSettingsBusy] = useState(false);
  const setCnaeItems = (nextItems) => setCnaeSettingsState((s) => ({ ...s, items: nextItems || [] }));
  const setTaxRegime = (patch) => setCnaeSettingsState((s) => ({ ...s, taxRegime: { ...(s.taxRegime || DEFAULT_TAX_REGIME), ...patch } }));
  const saveCnaeSettings = async () => {
    if (isFilePreview || !user) {
      showToast('CNAEs salvos', 'success');
      return;
    }
    setCnaeSettingsBusy(true);
    try {
      const regime = cnaeSettings.taxRegime || DEFAULT_TAX_REGIME;
      const response = await authClient.request('/portal/internal/cnae-settings', {
        method: 'PUT',
        body: JSON.stringify({
          items: cnaeSettings.items.map((entry) => ({
            code: entry.code,
            description: entry.description || '',
            is_principal: !!entry.isPrincipal,
            is_subject_to_icms_st: !!entry.isSubjectToIcmsSt,
          })),
          tax_regime: {
            regime: regime.regime || 'simples_nacional',
            state_code: regime.stateCode || '',
            trailing_12m_revenue: Number(regime.trailing12mRevenue || 0),
          },
        }),
      });
      setCnaeSettingsState({
        items: (response.items || []).map((entry) => ({
          code: entry.code,
          description: entry.description || '',
          isPrincipal: !!entry.is_principal,
          isSubjectToIcmsSt: !!entry.is_subject_to_icms_st,
        })),
        taxRegime: {
          regime: (response.tax_regime && response.tax_regime.regime) || 'simples_nacional',
          stateCode: (response.tax_regime && response.tax_regime.state_code) || '',
          trailing12mRevenue: Number((response.tax_regime && response.tax_regime.trailing_12m_revenue) || 0),
        },
      });
      showToast('CNAEs salvos', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível salvar os CNAEs.', 'warn');
    } finally {
      setCnaeSettingsBusy(false);
    }
  };
  // Áreas & frete: bairros (busca por CEP) + raios de entrega por loja, cada um com seu preço, e variações normal/expressa
  const [stores, setStores] = useState([]);
  // Seletor de loja (só admin): qual loja o console deve mostrar. Farmacêutico/gerente/caixa já ficam presos à própria loja no backend.
  const [selectedStoreId, setSelectedStoreIdState] = useState(() => {
    try { return localStorage.getItem('farmaura_internal_selected_store') || ''; } catch { return ''; }
  });
  const setSelectedStoreId = (storeId) => {
    setSelectedStoreIdState(storeId || '');
    try { localStorage.setItem('farmaura_internal_selected_store', storeId || ''); } catch { /* localStorage unavailable */ }
  };
  const storeIdOverride = (user && user.role === window.FA_ACCESS.ROLE.ADMIN && selectedStoreId) ? selectedStoreId : '';
  const withStoreParam = (path, requestedStoreId = storeIdOverride) => requestedStoreId ? path + (path.includes("?") ? "&" : "?") + "store_id=" + encodeURIComponent(requestedStoreId) : path;
  const [deliveryAreas, setDeliveryAreasState] = useState({ stores: [], variations: [] });
  const [deliveryAreasBusy, setDeliveryAreasBusy] = useState(false);
  const setDeliveryAreas = (patch) => setDeliveryAreasState((d) => ({ ...d, ...patch }));
  const saveDeliveryAreas = async () => {
    if (isFilePreview || !user) {
      showToast('Áreas de entrega salvas', 'success');
      return;
    }
    setDeliveryAreasBusy(true);
    try {
      const response = await authClient.request('/portal/internal/delivery-areas', {
        method: 'PUT',
        body: JSON.stringify({
          stores: (deliveryAreas.stores || []).map((store) => ({
            store_id: store.storeId,
            neighborhoods: (store.neighborhoods || []).map((entry) => ({
              id: entry.id,
              postal_code: entry.postalCode,
              district: entry.district,
              city: entry.city,
              state_code: entry.stateCode,
              price: serializePriceRule(entry.price),
              is_active: entry.isActive !== false,
            })),
            radius_tiers: (store.radiusTiers || []).map((entry) => ({
              id: entry.id,
              up_to_km: Number(entry.upToKm || 0),
              price: serializePriceRule(entry.price),
              is_active: entry.isActive !== false,
            })),
            free_above_subtotal: Number(store.freeAboveSubtotal || 0),
          })),
          variations: (deliveryAreas.variations || []).map((v) => ({
            id: v.id, label: v.label, extra_fee: Number(v.extraFee || 0), eta_minutes: Number(v.etaMinutes || 0),
          })),
        }),
      });
      setDeliveryAreasState(normalizeDeliveryAreasResponse(response));
      showToast('Áreas de entrega salvas', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível salvar as áreas de entrega.', 'warn');
    } finally {
      setDeliveryAreasBusy(false);
    }
  };
  const searchDeliveryAddresses = async (query) => {
    if (isFilePreview || !user || !query || !query.trim()) {
      return [];
    }
    try {
      const response = await authClient.request('/portal/internal/address-search?query=' + encodeURIComponent(query.trim()), { method: 'GET' });
      return (response.results || []).map((entry) => ({
        label: entry.label || '',
        district: entry.district || '',
        city: entry.city || '',
        stateCode: entry.state_code || '',
        kind: entry.kind || 'other',
      }));
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível buscar esse endereço.', 'warn');
      return [];
    }
  };
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThreadId] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [couponModalState, setCouponModalState] = useState({ open: false, mode: 'create', couponId: null });
  const [promotions, setPromotions] = useState([]);
  const [promotionModalState, setPromotionModalState] = useState({ open: false, mode: 'create', promotionId: null });
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
  const [driverLivePosition, setDriverLivePosition] = useState(null);
  const [myDeliveryRoutes, setMyDeliveryRoutes] = useState([]);
  const [locationSharing, setLocationSharing] = useState(false);
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
  const [constructionCosts, setConstructionCosts] = useState(null);
  const [constructionCostsError, setConstructionCostsError] = useState('');
  const [constructionCostsBusy, setConstructionCostsBusy] = useState(false);
  const refreshConstructionCosts = async () => {
    setConstructionCostsError('');
    try {
      const response = await authClient.request('/portal/internal/construction-costs', { method: 'GET' });
      setConstructionCosts(response || { stores: {} });
    } catch (error) {
      setConstructionCostsError(error && error.message ? error.message : 'Não foi possível carregar o custo de construção.');
    }
  };
  const saveConstructionCosts = async (nextStores) => {
    setConstructionCostsBusy(true);
    try {
      const response = await authClient.request('/portal/internal/construction-costs', {
        method: 'PUT',
        body: JSON.stringify({ stores: nextStores }),
      });
      setConstructionCosts(response);
      showToast('Custo de construção salvo', 'success');
      return response;
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível salvar o custo de construção.', 'warn');
      throw error;
    } finally {
      setConstructionCostsBusy(false);
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
  // Aceita um id simples (busca em inventory, compatibilidade com sugestões) ou um componente
  // completo já resolvido pela busca do servidor (com loja/preço/localização próprios).
  const pdvAdd = (itemOrId) => {
    const entry = typeof itemOrId === 'string'
      ? (() => { const it = (inventory || []).find((x) => x.id === itemOrId); return it ? { id: it.id, name: it.name, brand: it.brand, price: it.price, loc: it.loc, controlled: it.controlled, storeId: '', storeName: '' } : null; })()
      : itemOrId;
    if (!entry || !entry.id) return;
    setPdvCart((prev) => {
      const ex = prev.find((c) => c.id === entry.id);
      if (ex) return prev.map((c) => c.id === entry.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, {
        id: entry.id,
        qty: 1,
        name: entry.name || '',
        brand: entry.brand || '',
        price: Number(entry.price || 0),
        loc: entry.loc || '',
        controlled: !!entry.controlled,
        storeId: entry.storeId || '',
        storeName: entry.storeName || '',
        locationId: '',
        locationCode: '',
      }];
    });
  };
  const pdvSetQty = (id, qty) => setPdvCart((prev) => qty <= 0 ? prev.filter((c) => c.id !== id) : prev.map((c) => c.id === id ? { ...c, qty } : c));
  const pdvRemove = (id) => setPdvCart((prev) => prev.filter((c) => c.id !== id));
  const pdvClear = () => setPdvCart([]);
  const pdvSetLocation = (id, locationId, locationCode) => setPdvCart((prev) => prev.map((c) => c.id === id ? { ...c, locationId: locationId || '', locationCode: locationCode || '' } : c));
  // Local de onde o medicamento foi retirado — alimenta o seletor por linha do carrinho do PDV.
  const fetchPdvItemLocations = async (itemId) => {
    if (isFilePreview || !user || !itemId) return [];
    try {
      const response = await authClient.request('/pdv/products/' + itemId + '/locations');
      return Array.isArray(response.items) ? response.items.map((entry) => ({
        locationId: entry.location_id,
        locationCode: entry.location_code,
        locationName: entry.location_name,
        locationType: entry.location_type || 'estoque',
        qty: Number(entry.quantity || 0),
      })) : [];
    } catch (error) {
      return [];
    }
  };
  // Busca produtos no servidor, agrupados por produto lógico com estoque por loja.
  const pdvSearchProducts = async (query) => {
    const trimmed = (query || '').trim();
    if (!trimmed || isFilePreview || !user) return [];
    try {
      const response = await authClient.request('/pdv/products/search?query=' + encodeURIComponent(trimmed));
      return Array.isArray(response.items) ? response.items.map((item) => ({
        id: item.id,
        name: item.name,
        brand: item.brand,
        ean: item.ean,
        totalStock: Number(item.total_stock || 0),
        controlled: !!item.is_controlled,
        components: Array.isArray(item.components) ? item.components.map((c) => ({
          id: c.inventory_item_id,
          name: item.name,
          brand: item.brand,
          storeId: c.store_id,
          storeName: c.store_name,
          qty: Number(c.quantity || 0),
          loc: c.storage_location,
          price: Number(c.unit_price || 0),
          controlled: !!c.is_controlled,
        })) : [],
        ownStoreComponent: item.own_store_component ? {
          id: item.own_store_component.inventory_item_id,
          name: item.name,
          brand: item.brand,
          storeId: item.own_store_component.store_id,
          storeName: item.own_store_component.store_name,
          qty: Number(item.own_store_component.quantity || 0),
          loc: item.own_store_component.storage_location,
          price: Number(item.own_store_component.unit_price || 0),
          controlled: !!item.own_store_component.is_controlled,
        } : null,
      })) : [];
    } catch (error) {
      return [];
    }
  };
  // Busca insights reais de histórico de compra (top produtos + recorrência) para um cliente.
  const fetchCustomerPurchaseInsights = async (customerId) => {
    if (!customerId || isFilePreview || !user) return { topProducts: [], recurrenceCandidates: [] };
    try {
      const response = await authClient.request('/crm/customers/' + customerId + '/purchase-insights');
      return {
        topProducts: Array.isArray(response.top_products) ? response.top_products.map((entry) => ({
          productKey: entry.product_key,
          name: entry.name,
          brand: entry.brand,
          totalQuantity: Number(entry.total_quantity || 0),
          lastPrice: Number(entry.last_price || 0),
        })) : [],
        recurrenceCandidates: Array.isArray(response.recurrence_candidates) ? response.recurrence_candidates.map((entry) => ({
          productKey: entry.product_key,
          name: entry.name,
          brand: entry.brand,
          consecutiveMonths: Number(entry.consecutive_months || 0),
          lastPurchasedMonth: entry.last_purchased_month || '',
          avgQuantity: Number(entry.avg_quantity || 1),
          lastUnitPrice: Number(entry.last_unit_price || 0),
          suggestedDiscountPercent: Number(entry.suggested_discount_percent || 0),
        })) : [],
      };
    } catch (error) {
      return { topProducts: [], recurrenceCandidates: [] };
    }
  };
  // Busca os cartões salvos de um cliente, para escolher qual cobrar na recorrência.
  const fetchCustomerPaymentMethods = async (customerId) => {
    if (!customerId || isFilePreview || !user) return [];
    try {
      const response = await authClient.request('/crm/customers/' + customerId + '/payment-methods');
      return Array.isArray(response.items) ? response.items.map((item) => ({
        id: item.id,
        brandName: item.brand_name,
        lastFourDigits: item.last_four_digits,
        holderName: item.holder_name,
        isPrimary: !!item.is_primary,
      })) : [];
    } catch (error) {
      return [];
    }
  };
  const _addressFromResponse = (item) => ({
    id: item.id,
    label: item.label || 'Casa',
    postalCode: item.postal_code || '',
    addressLine: item.street_line || '',
    district: item.district || '',
    city: item.city || '',
    stateCode: item.state_code || '',
    complement: item.complement || '',
    referenceNote: item.reference_note || '',
    recipientName: item.recipient_name || '',
    recipientPhone: item.recipient_phone || '',
    isPrimary: !!item.is_primary,
  });
  const fetchCustomerAddresses = async (customerId) => {
    if (!customerId || isFilePreview || !user) return [];
    try {
      const response = await authClient.request('/crm/customers/' + customerId + '/addresses');
      return Array.isArray(response.items) ? response.items.map(_addressFromResponse) : [];
    } catch (error) {
      return [];
    }
  };
  const createPdvCustomerAddress = async (customerId, address) => {
    if (!customerId || isFilePreview || !user) return [];
    try {
      const response = await authClient.request('/crm/customers/' + customerId + '/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: address.label || 'Casa',
          postal_code: address.postalCode || '',
          street_line: [address.addressLine, address.addressNumber].filter(Boolean).join(', '),
          district: address.district || '',
          city: address.city || '',
          state_code: (address.stateCode || '').toUpperCase().slice(0, 2),
          complement: address.complement || '',
          reference_note: address.referenceNote || '',
          recipient_name: address.recipientName || '',
          recipient_phone: address.recipientPhone || '',
          is_primary: !!address.isPrimary,
        }),
      });
      return Array.isArray(response.items) ? response.items.map(_addressFromResponse) : [];
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível salvar o endereço.', 'warn');
      return null;
    }
  };
  const _teamMemberFromResponse = (item) => ({
    id: item.id, name: item.name || '', email: item.email || '', role: item.role || '',
    storeId: item.store_id || null, storeName: item.store_name || '',
  });
  // Lista farmacêuticos, caixas e admins do tenant, com a loja atribuída a cada um.
  const fetchTeamMembers = async () => {
    if (isFilePreview || !user) return [];
    try {
      const response = await authClient.request('/team/members');
      return Array.isArray(response.items) ? response.items.map(_teamMemberFromResponse) : [];
    } catch (error) {
      return [];
    }
  };
  // Atribui (ou remove) a loja em que um membro da equipe atua.
  const updateTeamMemberStore = async (userId, storeId) => {
    try {
      const response = await authClient.request('/team/members/' + userId + '/store', {
        method: 'PATCH',
        body: JSON.stringify({ store_id: storeId || null }),
      });
      return _teamMemberFromResponse(response);
    } catch (error) {
      return null;
    }
  };
  const _supplierFromResponse = (item) => ({
    id: item.id,
    legalName: item.legal_name || '',
    tradeName: item.trade_name || '',
    cnpj: item.cnpj || '',
    email: item.email || '',
    phone: item.phone || '',
    website: item.website || '',
    category: item.category || '',
    contactPersonName: item.contact_person_name || '',
    uf: item.uf || '',
    city: item.city || '',
    addressLine: item.address_line || '',
    leadTimeDays: Number(item.lead_time_days || 0),
    minimumOrderAmount: Number(item.minimum_order_amount || 0),
    freightPolicy: item.freight_policy || '',
    paymentTerms: item.payment_terms || '',
    notes: item.notes || '',
    active: item.is_active == null ? true : !!item.is_active,
    createdAt: item.created_at || '',
    raw: item,
  });
  // Lista os fornecedores cadastrados no tenant para a tela de Fornecedores.
  const refreshSuppliers = async () => {
    try {
      const response = await authClient.request('/suppliers');
      setSuppliers(Array.isArray(response.items) ? response.items.map(_supplierFromResponse) : []);
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível carregar os fornecedores.', 'warn');
    }
  };
  useEffect(() => {
    if (!user || !window.FA_ACCESS.canAccessInternalRoute(user, 'suppliers')) {
      return;
    }
    refreshSuppliers();
  }, [user]);
  const addSupplier = async (payload) => {
    const response = await authClient.request('/suppliers', {
      method: 'POST',
      body: JSON.stringify({
        legal_name: payload.legalName,
        trade_name: payload.tradeName,
        cnpj: payload.cnpj,
        email: payload.email,
        phone: payload.phone,
        website: payload.website,
        category: payload.category,
        contact_person_name: payload.contactPersonName,
        uf: payload.uf,
        city: payload.city,
        address_line: payload.addressLine,
        lead_time_days: Number(payload.leadTimeDays || 0),
        minimum_order_amount: Number(payload.minimumOrderAmount || 0),
        freight_policy: payload.freightPolicy,
        payment_terms: payload.paymentTerms,
        notes: payload.notes,
      }),
    });
    await refreshSuppliers();
    return _supplierFromResponse(response);
  };
  const updateSupplier = async (supplierId, payload) => {
    const response = await authClient.request('/suppliers/' + supplierId, {
      method: 'PUT',
      body: JSON.stringify({
        legal_name: payload.legalName,
        trade_name: payload.tradeName,
        cnpj: payload.cnpj,
        email: payload.email,
        phone: payload.phone,
        website: payload.website,
        category: payload.category,
        contact_person_name: payload.contactPersonName,
        uf: payload.uf,
        city: payload.city,
        address_line: payload.addressLine,
        lead_time_days: Number(payload.leadTimeDays || 0),
        minimum_order_amount: Number(payload.minimumOrderAmount || 0),
        freight_policy: payload.freightPolicy,
        payment_terms: payload.paymentTerms,
        notes: payload.notes,
      }),
    });
    await refreshSuppliers();
    return _supplierFromResponse(response);
  };
  const setSupplierActive = async (supplierId, isActive) => {
    const response = await authClient.request('/suppliers/' + supplierId + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !!isActive }),
    });
    await refreshSuppliers();
    return _supplierFromResponse(response);
  };

  // ---------- Produtos: identidade/configuração do produto, separada do estoque por loja ----------
  const _productFromResponse = (item) => ({
    id: item.id,
    sku: item.sku || '',
    name: item.name || '',
    eanCode: item.ean_code || '',
    brandId: item.brand_id || '',
    brandName: item.brand_name || '',
    categoryId: item.category_id || '',
    categoryName: item.category_name || '',
    therapeuticClassId: item.therapeutic_class_id || '',
    medicationClassName: item.medication_class_name || '',
    isControlled: !!item.is_controlled,
    controlledCategory: item.controlled_category || 'none',
    isGeneric: !!item.is_generic,
    cnaeCode: item.cnae_code || '',
    marketplaceImageUrl: item.marketplace_image_url || '',
    marketplaceGalleryUrls: Array.isArray(item.marketplace_gallery_urls) ? item.marketplace_gallery_urls : [],
    active: item.is_active == null ? true : !!item.is_active,
    discarded: !!item.is_discarded,
    storeCount: Number(item.store_count || 0),
    totalQuantity: Number(item.total_quantity || 0),
    createdAt: item.created_at || '',
    raw: item,
  });
  const refreshProducts = async () => {
    try {
      const response = await authClient.request('/products');
      setProducts(Array.isArray(response.items) ? response.items.map(_productFromResponse) : []);
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível carregar os produtos.', 'warn');
    }
  };
  useEffect(() => {
    if (!user || !window.FA_ACCESS.canAccessInternalRoute(user, 'products')) {
      return;
    }
    refreshProducts();
  }, [user]);
  const _buildProductPayload = (payload) => ({
    sku: payload.sku || '',
    name: payload.name,
    ean_code: payload.eanCode || '',
    brand_id: payload.brandId || null,
    category_id: payload.categoryId || null,
    therapeutic_class_id: payload.therapeuticClassId || null,
    controlled_category: payload.controlledCategory || 'none',
    is_generic: !!payload.isGeneric,
    cnae_code: payload.cnaeCode || '',
    marketplace_image_url: payload.marketplaceImageUrl || '',
    marketplace_gallery_urls: Array.isArray(payload.marketplaceGalleryUrls) ? payload.marketplaceGalleryUrls : [],
  });
  const addProduct = async (payload) => {
    const response = await authClient.request('/products', {
      method: 'POST',
      body: JSON.stringify(_buildProductPayload(payload)),
    });
    await refreshProducts();
    return _productFromResponse(response);
  };
  const updateProduct = async (productId, payload) => {
    const response = await authClient.request('/products/' + productId, {
      method: 'PUT',
      body: JSON.stringify(_buildProductPayload(payload)),
    });
    await refreshProducts();
    return _productFromResponse(response);
  };
  const setProductActive = async (productId, isActive) => {
    const response = await authClient.request('/products/' + productId + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !!isActive }),
    });
    await refreshProducts();
    return _productFromResponse(response);
  };
  const setProductDiscarded = async (productId, isDiscarded) => {
    const response = await authClient.request('/products/' + productId + '/discard', {
      method: 'PATCH',
      body: JSON.stringify({ is_discarded: !!isDiscarded }),
    });
    await refreshProducts();
    return _productFromResponse(response);
  };
  const fetchProductStoreLinks = async (productId) => {
    const response = await authClient.request('/products/' + productId + '/stores');
    return Array.isArray(response.items) ? response.items.map((entry) => ({
      itemId: entry.item_id,
      storeId: entry.store_id,
      storeName: entry.store_name || '',
      quantity: Number(entry.quantity || 0),
      isActive: !!entry.is_active,
    })) : [];
  };
  const linkProductToStore = async (productId, storeId) => {
    const response = await authClient.request('/products/' + productId + '/stores', {
      method: 'POST',
      body: JSON.stringify({ store_id: storeId }),
    });
    await refreshProducts();
    return normalizeInventoryItem(response);
  };

  // ---------- Marcas: cadastro vinculado aos fornecedores que as distribuem ----------
  const _brandFromResponse = (item) => ({
    id: item.id,
    name: item.name || '',
    description: item.description || '',
    logoUrl: item.logo_url || '',
    active: item.is_active == null ? true : !!item.is_active,
    discarded: !!item.is_discarded,
    suppliers: Array.isArray(item.suppliers) ? item.suppliers.map((supplier) => ({
      id: supplier.id, legalName: supplier.legal_name || '', tradeName: supplier.trade_name || '',
    })) : [],
    supplierIds: Array.isArray(item.suppliers) ? item.suppliers.map((supplier) => supplier.id) : [],
    createdAt: item.created_at || '',
    raw: item,
  });
  const refreshBrands = async () => {
    try {
      const response = await authClient.request('/brands');
      setBrands(Array.isArray(response.items) ? response.items.map(_brandFromResponse) : []);
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível carregar as marcas.', 'warn');
    }
  };
  useEffect(() => {
    if (!user || !window.FA_ACCESS.canAccessInternalRoute(user, 'brands')) {
      return;
    }
    refreshBrands();
  }, [user]);
  const _buildBrandPayload = (payload) => ({
    name: payload.name,
    description: payload.description || '',
    logo_url: payload.logoUrl || '',
    supplier_ids: Array.isArray(payload.supplierIds) ? payload.supplierIds : [],
  });
  const addBrand = async (payload) => {
    const response = await authClient.request('/brands', {
      method: 'POST',
      body: JSON.stringify(_buildBrandPayload(payload)),
    });
    await refreshBrands();
    return _brandFromResponse(response);
  };
  const updateBrand = async (brandId, payload) => {
    const response = await authClient.request('/brands/' + brandId, {
      method: 'PUT',
      body: JSON.stringify(_buildBrandPayload(payload)),
    });
    await refreshBrands();
    return _brandFromResponse(response);
  };
  const setBrandActive = async (brandId, isActive) => {
    const response = await authClient.request('/brands/' + brandId + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !!isActive }),
    });
    await refreshBrands();
    return _brandFromResponse(response);
  };
  const setBrandDiscarded = async (brandId, isDiscarded) => {
    const response = await authClient.request('/brands/' + brandId + '/discard', {
      method: 'PATCH',
      body: JSON.stringify({ is_discarded: !!isDiscarded }),
    });
    await refreshBrands();
    return _brandFromResponse(response);
  };

  // ---------- Categorias de produto ----------
  const _categoryFromResponse = (item) => ({
    id: item.id,
    name: item.name || '',
    description: item.description || '',
    active: item.is_active == null ? true : !!item.is_active,
    discarded: !!item.is_discarded,
    createdAt: item.created_at || '',
    raw: item,
  });
  const refreshCategories = async () => {
    try {
      const response = await authClient.request('/categories');
      setCategories(Array.isArray(response.items) ? response.items.map(_categoryFromResponse) : []);
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível carregar as categorias.', 'warn');
    }
  };
  useEffect(() => {
    if (!user || !window.FA_ACCESS.canAccessInternalRoute(user, 'categories')) {
      return;
    }
    refreshCategories();
  }, [user]);
  const addCategory = async (payload) => {
    const response = await authClient.request('/categories', {
      method: 'POST',
      body: JSON.stringify({ name: payload.name, description: payload.description || '' }),
    });
    await refreshCategories();
    return _categoryFromResponse(response);
  };
  const updateCategory = async (categoryId, payload) => {
    const response = await authClient.request('/categories/' + categoryId, {
      method: 'PUT',
      body: JSON.stringify({ name: payload.name, description: payload.description || '' }),
    });
    await refreshCategories();
    return _categoryFromResponse(response);
  };
  const setCategoryActive = async (categoryId, isActive) => {
    const response = await authClient.request('/categories/' + categoryId + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !!isActive }),
    });
    await refreshCategories();
    return _categoryFromResponse(response);
  };
  const setCategoryDiscarded = async (categoryId, isDiscarded) => {
    const response = await authClient.request('/categories/' + categoryId + '/discard', {
      method: 'PATCH',
      body: JSON.stringify({ is_discarded: !!isDiscarded }),
    });
    await refreshCategories();
    return _categoryFromResponse(response);
  };

  // ---------- Classes terapêuticas ----------
  const _therapeuticClassFromResponse = (item) => ({
    id: item.id,
    name: item.name || '',
    description: item.description || '',
    active: item.is_active == null ? true : !!item.is_active,
    discarded: !!item.is_discarded,
    categoryId: item.category_id || '',
    categoryName: item.category_name || '',
    createdAt: item.created_at || '',
    raw: item,
  });
  const refreshTherapeuticClasses = async () => {
    try {
      const response = await authClient.request('/therapeutic-classes');
      setTherapeuticClasses(Array.isArray(response.items) ? response.items.map(_therapeuticClassFromResponse) : []);
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível carregar as classes terapêuticas.', 'warn');
    }
  };
  useEffect(() => {
    if (!user || !window.FA_ACCESS.canAccessInternalRoute(user, 'therapeutic-classes')) {
      return;
    }
    refreshTherapeuticClasses();
  }, [user]);
  const addTherapeuticClass = async (payload) => {
    const response = await authClient.request('/therapeutic-classes', {
      method: 'POST',
      body: JSON.stringify({ name: payload.name, description: payload.description || '', category_id: payload.categoryId || null }),
    });
    await refreshTherapeuticClasses();
    return _therapeuticClassFromResponse(response);
  };
  const updateTherapeuticClass = async (therapeuticClassId, payload) => {
    const response = await authClient.request('/therapeutic-classes/' + therapeuticClassId, {
      method: 'PUT',
      body: JSON.stringify({ name: payload.name, description: payload.description || '', category_id: payload.categoryId || null }),
    });
    await refreshTherapeuticClasses();
    return _therapeuticClassFromResponse(response);
  };
  const setTherapeuticClassActive = async (therapeuticClassId, isActive) => {
    const response = await authClient.request('/therapeutic-classes/' + therapeuticClassId + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !!isActive }),
    });
    await refreshTherapeuticClasses();
    return _therapeuticClassFromResponse(response);
  };
  const setTherapeuticClassDiscarded = async (therapeuticClassId, isDiscarded) => {
    const response = await authClient.request('/therapeutic-classes/' + therapeuticClassId + '/discard', {
      method: 'PATCH',
      body: JSON.stringify({ is_discarded: !!isDiscarded }),
    });
    await refreshTherapeuticClasses();
    return _therapeuticClassFromResponse(response);
  };

  // ---------- Lojas (cadastro completo — distinto da lista mínima usada no seletor do topo) ----------
  const _storeEntryFromResponse = (item) => ({
    id: item.id,
    code: item.code || '',
    name: item.name || '',
    addressLine: item.address_line || '',
    district: item.district || '',
    city: item.city || '',
    stateCode: item.state_code || '',
    postalCode: item.postal_code || '',
    phone: item.phone || '',
    cnpj: item.cnpj || '',
    isPrimary: !!item.is_primary,
    active: item.is_active == null ? true : !!item.is_active,
    raw: item,
  });
  const refreshStoreDirectory = async () => {
    try {
      const response = await authClient.request('/stores');
      setStoreDirectory(Array.isArray(response.items) ? response.items.map(_storeEntryFromResponse) : []);
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível carregar as lojas.', 'warn');
    }
  };
  useEffect(() => {
    if (!user || !window.FA_ACCESS.canAccessInternalRoute(user, 'stores')) {
      return;
    }
    refreshStoreDirectory();
  }, [user]);
  const addStoreEntry = async (payload) => {
    const response = await authClient.request('/stores', {
      method: 'POST',
      body: JSON.stringify({
        code: payload.code,
        name: payload.name,
        address_line: payload.addressLine || '',
        district: payload.district || '',
        city: payload.city || '',
        state_code: payload.stateCode || '',
        postal_code: payload.postalCode || '',
        phone: payload.phone || '',
        cnpj: payload.cnpj || '',
        is_primary: !!payload.isPrimary,
      }),
    });
    await refreshStoreDirectory();
    return _storeEntryFromResponse(response);
  };
  const updateStoreEntry = async (storeId, payload) => {
    const response = await authClient.request('/stores/' + storeId, {
      method: 'PATCH',
      body: JSON.stringify({
        name: payload.name,
        address_line: payload.addressLine || '',
        district: payload.district || '',
        city: payload.city || '',
        state_code: payload.stateCode || '',
        postal_code: payload.postalCode || '',
        phone: payload.phone || '',
        cnpj: payload.cnpj || '',
        is_primary: !!payload.isPrimary,
      }),
    });
    await refreshStoreDirectory();
    return _storeEntryFromResponse(response);
  };
  const setStoreEntryActive = async (storeId, isActive) => {
    const response = await authClient.request('/stores/' + storeId, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !!isActive }),
    });
    await refreshStoreDirectory();
    return _storeEntryFromResponse(response);
  };

  // Confirma a recorrência detectada: cobra o cartão salvo agora e registra a assinatura.
  const confirmPdvRecurrence = async ({ customerId, inventoryItemId, quantity, frequencyDays, paymentMethodId }) => {
    const response = await authClient.request('/pdv/recurrence-confirmations', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId,
        inventory_item_id: inventoryItemId,
        quantity: Number(quantity || 1),
        frequency_days: Number(frequencyDays || 30),
        payment_method_id: paymentMethodId,
      }),
    });
    return {
      subscriptionId: response.subscription_id,
      discountPercent: Number(response.discount_percent || 0),
      chargeStatus: response.charge_status || '',
      totalCharged: Number(response.total_charged || 0),
    };
  };
  // Reserva estoque de outra loja para o cliente retirar lá (trava o estoque com validade de 48h).
  const pdvCreateReservation = async ({ inventoryItemId, storeId, quantity, customer, notes }) => {
    try {
      const response = await authClient.request('/pdv/reservations', {
        method: 'POST',
        body: JSON.stringify({
          inventory_item_id: inventoryItemId,
          store_id: storeId,
          quantity: Number(quantity || 1),
          customer: {
            id: customer && customer.id ? customer.id : null,
            name: customer ? customer.name || '' : '',
            doc: customer ? customer.doc || '' : '',
            phone: customer ? customer.phone || '' : '',
            avatar: customer ? customer.avatar || '' : '',
            recurring: !!(customer && customer.recurring),
            cashback: Number((customer && customer.cashback) || 0),
          },
          notes: notes || '',
        }),
      });
      return {
        orderId: response.order_id, orderCode: response.order_code,
        storeId: response.store_id, storeName: response.store_name,
        expiresAtLabel: response.expires_at_label,
      };
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível reservar o produto.', 'warn');
      return null;
    }
  };
  // Consulta o estado de validação de receita de cada item controlado do carrinho atual.
  const fetchPdvPrescriptionStatus = async (customerId, inventoryItemIds) => {
    if (isFilePreview || !user || !customerId || !(inventoryItemIds || []).length) return [];
    try {
      const query = new URLSearchParams({ customer_id: customerId });
      inventoryItemIds.forEach((id) => query.append('inventory_item_ids', id));
      const response = await authClient.request('/pdv/prescriptions/status?' + query.toString());
      return Array.isArray(response.items) ? response.items.map((item) => ({
        inventoryItemId: item.inventory_item_id,
        prescriptionId: item.prescription_id || null,
        status: item.status || 'missing',
        deliveryMethod: item.delivery_method || '',
      })) : [];
    } catch (error) {
      return [];
    }
  };
  // Registra a validação de uma receita física, ou envia o link de uma receita digital para validação via chat.
  const createPdvPrescription = async ({ customerId, inventoryItemId, medicationName, deliveryMethod, digitalReferenceUrl, decision, pharmacistNotes, rejectionReason }) => {
    try {
      const response = await authClient.request('/pdv/prescriptions', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: customerId || null,
          inventory_item_id: inventoryItemId,
          medication_name: medicationName || '',
          delivery_method: deliveryMethod,
          digital_reference_url: digitalReferenceUrl || '',
          decision: decision || null,
          pharmacist_notes: pharmacistNotes || '',
          rejection_reason: rejectionReason || '',
        }),
      });
      return {
        id: response.id, inventoryItemId: response.inventory_item_id, status: response.status,
        deliveryMethod: response.delivery_method, digitalReferenceUrl: response.digital_reference_url,
        requiresRetention: !!response.requires_retention,
      };
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível registrar a validação da receita.', 'warn');
      return null;
    }
  };
  // Checa a cobertura de entrega do balcão para um endereço digitado.
  const checkPdvDeliveryCoverage = async ({ district, city, stateCode, postalCode }) => {
    if (isFilePreview || !user) return { configured: false, covered: true };
    try {
      const query = new URLSearchParams({ district: district || '', city: city || '', state_code: stateCode || '', postal_code: postalCode || '' });
      const response = await authClient.request('/pdv/delivery/coverage?' + query.toString());
      return {
        configured: !!response.configured,
        covered: !!response.covered,
        matchKind: response.match_kind || '',
        matchLabel: response.match_label || '',
        estimatedDistanceKm: response.estimated_distance_km == null ? null : Number(response.estimated_distance_km),
      };
    } catch (error) {
      return { configured: false, covered: true };
    }
  };
  // Consulta o desconto máximo que o carrinho atual comporta sem furar a margem mínima (considerando o cashback do cliente).
  const fetchPdvDiscountLimit = async ({ items, customerId }) => {
    if (isFilePreview || !user || !(items || []).length) return { maxDiscountPercent: 100 };
    try {
      const response = await authClient.request('/pdv/discount-limit', {
        method: 'POST',
        body: JSON.stringify({
          items: (items || []).map((entry) => ({ id: entry.id, qty: Number(entry.qty || 0) })),
          customer_id: customerId || null,
        }),
      });
      return { maxDiscountPercent: Number(response.max_discount_percent ?? 100) };
    } catch (error) {
      return { maxDiscountPercent: 100 };
    }
  };
  const _deliveryToBackend = (delivery) => delivery && delivery.fulfillmentType === 'delivery' ? {
    fulfillment_type: 'delivery',
    recipient_name: delivery.recipientName || '',
    recipient_phone: delivery.recipientPhone || '',
    postal_code: delivery.postalCode || '',
    address_line: delivery.addressLine || '',
    address_number: delivery.addressNumber || '',
    district: delivery.district || '',
    city: delivery.city || '',
    state_code: delivery.stateCode || '',
    reference_note: delivery.referenceNote || '',
  } : { fulfillment_type: 'pickup' };
  const _deliveryFromBackend = (delivery) => ({
    fulfillmentType: delivery && delivery.fulfillment_type || 'pickup',
    recipientName: delivery && delivery.recipient_name || '',
    recipientPhone: delivery && delivery.recipient_phone || '',
    postalCode: delivery && delivery.postal_code || '',
    addressLine: delivery && delivery.address_line || '',
    addressNumber: delivery && delivery.address_number || '',
    district: delivery && delivery.district || '',
    city: delivery && delivery.city || '',
    stateCode: delivery && delivery.state_code || '',
    referenceNote: delivery && delivery.reference_note || '',
  });
  const _customerToBackend = (customer) => customer ? {
    id: customer.id || null,
    name: customer.name || '',
    doc: customer.doc || '',
    phone: customer.phone || '',
    avatar: customer.avatar || '',
    recurring: !!customer.recurring,
    cashback: Number(customer.cashback || 0),
  } : null;
  // Lista os atendimentos em andamento do farmacêutico atual, salvos automaticamente — recuperáveis após um reload ou queda de sessão.
  const fetchPdvDrafts = async () => {
    if (isFilePreview || !user) return [];
    try {
      const response = await authClient.request('/pdv/drafts');
      const customerMap = Object.fromEntries((customers || []).map((entry) => [entry.name, entry]));
      return Array.isArray(response.items) ? response.items.map((item) => ({
        id: item.id,
        customer: normalizePdvCustomer(item.customer, customerMap),
        items: Array.isArray(item.items) ? item.items.map((line) => ({
          id: line.id, qty: Number(line.qty || 0), name: line.name || '', brand: line.brand || '',
          price: Number(line.price || 0), loc: line.loc || '', controlled: !!line.controlled,
          storeId: line.store_id || '', storeName: line.store_name || '',
          locationId: line.location_id || '', locationCode: line.location_code || '',
        })) : [],
        discount: Number(item.discount || 0),
        cashWanted: Number(item.cash_wanted || 0),
        pay: item.payment_method || 'pix',
        cpfNota: item.include_cpf_on_invoice !== false,
        delivery: _deliveryFromBackend(item.delivery),
        startedAt: item.started_at_ms || null,
        operator: item.operator || 'pharm',
        updatedAtLabel: item.updated_at_label || '',
      })) : [];
    } catch (error) {
      return [];
    }
  };
  // Autosalva o atendimento em andamento (chamado com debounce enquanto o farmacêutico monta o pedido).
  const autosavePdvDraft = async ({ id, customer, items, discount, cashWanted, pay, cpfNota, delivery, startedAt, operator }) => {
    if (isFilePreview || !user) return null;
    try {
      const response = await authClient.request('/pdv/drafts', {
        method: 'PUT',
        body: JSON.stringify({
          id: id || null,
          customer: _customerToBackend(customer),
          items: (items || []).map((entry) => ({
            id: entry.id, qty: Number(entry.qty || 0), name: entry.name || '', brand: entry.brand || '',
            price: Number(entry.price || 0), loc: entry.loc || '', controlled: !!entry.controlled,
            store_id: entry.storeId || '', store_name: entry.storeName || '',
            location_id: entry.locationId || '', location_code: entry.locationCode || '',
          })),
          discount: Number(discount || 0),
          cash_wanted: Number(cashWanted || 0),
          payment_method: pay || 'pix',
          include_cpf_on_invoice: cpfNota !== false,
          delivery: _deliveryToBackend(delivery),
          started_at_ms: startedAt || null,
          operator: operator || 'pharm',
        }),
      });
      return response.id;
    } catch (error) {
      return null;
    }
  };
  const deletePdvDraft = async (draftId) => {
    if (isFilePreview || !user || !draftId) return;
    try {
      await authClient.request('/pdv/drafts/' + draftId, { method: 'DELETE' });
    } catch (error) {
      // silencioso — não bloqueia o fluxo do farmacêutico se o rascunho já não existir mais
    }
  };
  // Farmacêutico envia o pedido montado para a fila do caixa.
  const pdvSendToCashier = async ({ customer, items, discount, delivery, draftId }) => {
    if (!isFilePreview && user) {
      try {
        const response = await authClient.request('/pdv/orders', {
          method: 'POST',
          body: JSON.stringify({
            customer: _customerToBackend(customer),
            items: (items || []).map((entry) => ({ id: entry.id, qty: Number(entry.qty || 0), location_id: entry.locationId || '' })),
            discount: Number(discount || 0),
            notes: '',
            delivery: _deliveryToBackend(delivery),
            draft_id: draftId || null,
          }),
        });
        const customerMap = Object.fromEntries((customers || []).map((entry) => [entry.name, entry]));
        const queueItems = normalizePdvQueue({ items: [response] }, customerMap);
        setPdvQueue((prev) => {
          const filtered = prev.filter((entry) => entry.id !== response.id);
          return [...queueItems, ...filtered];
        });
        return true;
      } catch (error) {
        showToast(error && error.message ? error.message : 'Não foi possível enviar o pedido para o caixa. Tente novamente.', 'warn');
        return false;
      }
    }
    setPdvQueue((prev) => [{ id: 'PV-' + Date.now(), sentAt: 'agora', sentBy: pharmacistProfile.name || (user && user.name) || 'Equipe Farmaura', customer: customer || null, discount: discount || 0, items: (items || []).map((c) => ({ id: c.id, qty: c.qty })) }, ...prev]);
    return true;
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
        setPdvCart(Array.isArray(response.items) ? response.items.map((line) => ({
          id: line.inventory_item_id || line.id,
          qty: Number(line.qty || 0),
          name: line.name || '',
          brand: line.brand || '',
          price: Number(line.unit_price || 0),
          loc: line.loc || '',
          controlled: !!line.controlled,
          storeId: '',
          storeName: '',
          locationId: line.location_id || '',
          locationCode: line.loc || '',
        })) : []);
        setPdvQueue((prev) => prev.filter((row) => row.id !== id));
        return;
      } catch (error) {
        showToast(error && error.message ? error.message : 'Não foi possível assumir o pedido da fila. Tente novamente.', 'warn');
        return;
      }
    }
    setPdvActiveOrderId(id);
    setPdvCustomer(entry.customer || null);
    setPdvCart((entry.items || []).map((it) => {
      const found = (inventory || []).find((x) => x.id === it.id);
      return found ? { id: it.id, qty: it.qty, name: found.name, brand: found.brand, price: found.price, loc: found.loc, controlled: found.controlled, storeId: '', storeName: '' } : { id: it.id, qty: it.qty, name: '', brand: '', price: 0, loc: '', controlled: false, storeId: '', storeName: '' };
    }));
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
      const payload = await authClient.request(withStoreParam('/inventory/dashboard'), { method: 'GET' });
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
    refreshProducts();
  }, [user, storeIdOverride]);

  // Saldo de estoque por lote e local (rastreabilidade) — carregado junto com o estoque agregado.
  const refreshStockLots = async () => {
    try {
      const payload = await authClient.request(withStoreParam('/inventory/lots'), { method: 'GET' });
      setStockLots(Array.isArray(payload.items) ? payload.items.map(normalizeStockLot) : []);
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível carregar os lotes de estoque.', 'warn');
    }
  };
  useEffect(() => {
    if (!user || !window.FA_ACCESS.canAccessInternalRoute(user, 'inventory')) {
      return;
    }
    refreshStockLots();
  }, [user, storeIdOverride]);
  const receiveLot = async (payload) => {
    const inventoryItem = inventory.find((item) => item.id === payload.inventoryItemId);
    const requestedStoreId = payload.storeId || (inventoryItem ? inventoryItem.storeId : "") || storeIdOverride;
    await authClient.request(withStoreParam("/inventory/lots/receipts", requestedStoreId), {
      method: 'POST',
      body: JSON.stringify({
        inventory_item_id: payload.inventoryItemId,
        location_id: payload.locationId,
        supplier_id: payload.supplierId || '',
        batch_code: payload.batchCode,
        expiry_date: payload.expiryDate || null,
        quantity: Number(payload.quantity || 0),
        unit_cost_snapshot: Number(payload.unitCostSnapshot || 0),
        reference_code: payload.referenceCode || '',
        note: payload.note || '',
      }),
    });
    await Promise.all([refreshStockLots(), refreshInventory()]);
    showToast('Recebimento de mercadoria registrado', 'success');
  };
  const transferLot = async (lotId, payload) => {
    await authClient.request(withStoreParam("/inventory/lots/" + lotId + "/transfers", payload.storeId || storeIdOverride), {
      method: 'POST',
      body: JSON.stringify({
        to_location_id: payload.toLocationId,
        quantity: Number(payload.quantity || 0),
        reason: payload.reason || 'Transferência interna',
        note: payload.note || '',
        reference_code: payload.referenceCode || '',
      }),
    });
    await refreshStockLots();
    showToast('Transferência registrada', 'success');
  };
  const adjustLot = async (lotId, payload, storeId = "") => {
    try {
      await authClient.request(withStoreParam("/inventory/lots/" + lotId + "/adjustments", storeId || storeIdOverride), {
        method: 'POST',
        body: JSON.stringify({
          quantity_delta: Number(payload.quantityDelta || 0),
          reason: payload.reason,
          note: payload.note || '',
        }),
      });
    } catch (error) {
      if (error && error.status === 404) {
        await Promise.all([refreshStockLots(), refreshInventory()]);
        throw new Error('Este lote não está mais disponível. O estoque foi atualizado; selecione o lote novamente antes de registrar a movimentação.');
      }
      throw error;
    }
    await Promise.all([refreshStockLots(), refreshInventory()]);
    showToast('Ajuste de lote registrado', 'success');
  };

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
        authClient.request(withStoreParam('/portal/internal/bootstrap'), { method: 'GET' }),
        canOrders ? authClient.request(withStoreParam('/orders/internal-board'), { method: 'GET' }) : Promise.resolve(null),
        canRx ? authClient.request('/prescriptions/review-queue', { method: 'GET' }) : Promise.resolve(null),
        canCrm ? authClient.request('/crm/customers', { method: 'GET' }) : Promise.resolve(null),
        canChat ? authClient.request('/chat/threads', { method: 'GET' }) : Promise.resolve(null),
        canPdv ? authClient.request(withStoreParam('/pdv/queue'), { method: 'GET' }) : Promise.resolve(null),
        canPdv ? authClient.request(withStoreParam('/pdv/sales'), { method: 'GET' }) : Promise.resolve(null),
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
          pixDiscountPercent: Number(bootstrap.marketplace && (bootstrap.marketplace.pix_discount_percent ?? bootstrap.marketplace.pixDiscountPercent) || 0),
          maxInstallments: Number(bootstrap.marketplace && (bootstrap.marketplace.max_installments ?? bootstrap.marketplace.maxInstallments) || 1),
          interestFreeInstallments: Number(bootstrap.marketplace && (bootstrap.marketplace.interest_free_installments ?? bootstrap.marketplace.interestFreeInstallments) || 1),
          installmentInterestPercent: Number(bootstrap.marketplace && (bootstrap.marketplace.installment_interest_percent ?? bootstrap.marketplace.installmentInterestPercent) || 0),
        });
        const pdvDiscountSettingsPayload = bootstrap.pdv_discount_settings || bootstrap.pdvDiscountSettings || null;
        setPdvDiscountSettings({
          minMarginPercent: Number(pdvDiscountSettingsPayload && (pdvDiscountSettingsPayload.minimum_margin_percent ?? pdvDiscountSettingsPayload.minimumMarginPercent) || 20),
        });
        const cnaeSettingsPayload = bootstrap.cnae_settings || bootstrap.cnaeSettings || null;
        setCnaeItems(((cnaeSettingsPayload && cnaeSettingsPayload.items) || []).map((entry) => ({
          code: entry.code || '',
          description: entry.description || '',
          isPrincipal: !!(entry.is_principal ?? entry.isPrincipal),
          isSubjectToIcmsSt: !!(entry.is_subject_to_icms_st ?? entry.isSubjectToIcmsSt),
        })));
        const taxRegimePayload = (cnaeSettingsPayload && (cnaeSettingsPayload.tax_regime || cnaeSettingsPayload.taxRegime)) || null;
        setTaxRegime({
          regime: (taxRegimePayload && taxRegimePayload.regime) || 'simples_nacional',
          stateCode: (taxRegimePayload && (taxRegimePayload.state_code ?? taxRegimePayload.stateCode)) || '',
          trailing12mRevenue: Number((taxRegimePayload && (taxRegimePayload.trailing_12m_revenue ?? taxRegimePayload.trailing12mRevenue)) || 0),
        });
        setStores(Array.isArray(bootstrap.stores) ? bootstrap.stores : []);
        const deliveryAreasPayload = bootstrap.delivery_areas || bootstrap.deliveryAreas || null;
        if (deliveryAreasPayload) {
          setDeliveryAreasState(normalizeDeliveryAreasResponse(deliveryAreasPayload));
        }
        setChartSeed(bootstrap.chart_seed || bootstrap.chartSeed || {});
        setCoupons((Array.isArray(bootstrap.coupon_campaigns) ? bootstrap.coupon_campaigns : []).map(normalizeCouponCampaign));
        setPromotions((Array.isArray(bootstrap.pricing_promotions) ? bootstrap.pricing_promotions : []).map(normalizePricingPromotion));
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
  }, [user, storeIdOverride]);

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

  const normalizeMyDeliveryRoutes = (payload) => Array.isArray(payload && payload.items) ? payload.items.map((route) => ({
    id: route.id || '',
    code: route.code || '',
    status: route.status || 'planned',
    hubName: route.hub_name || '',
    hubAddress: route.hub_address || '',
    hubLat: route.hub_lat == null ? null : Number(route.hub_lat),
    hubLng: route.hub_lng == null ? null : Number(route.hub_lng),
    stops: Array.isArray(route.stops) ? route.stops.map((stop) => ({
      id: stop.id,
      orderId: stop.order_id || '',
      orderCode: stop.order_code || '',
      customer: stop.customer || '',
      address: stop.address || '',
      district: stop.district || '',
      cep: stop.cep || '',
      status: stop.status || 'planned',
      lat: stop.lat == null ? null : Number(stop.lat),
      lng: stop.lng == null ? null : Number(stop.lng),
      navigationUrl: stop.navigation_url || '',
    })) : [],
  })) : [];

  useEffect(() => {
    if (!user || !window.FA_ACCESS.canAccessInternalRoute(user, 'driver-route')) {
      return;
    }
    let active = true;
    let timer = null;
    async function pollMyRoutes() {
      try {
        const response = await authClient.request('/deliveries/my-route', { method: 'GET' });
        if (active && response) {
          setMyDeliveryRoutes(normalizeMyDeliveryRoutes(response));
        }
      } catch {}
      if (active) {
        timer = window.setTimeout(pollMyRoutes, 8000);
      }
    }
    pollMyRoutes();
    return () => {
      active = false;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [user]);

  useEffect(() => {
    if (!user || !window.FA_ACCESS.canAccessInternalRoute(user, 'deliveries')) {
      return;
    }
    let active = true;
    let timer = null;
    async function pollDriverPosition() {
      try {
        const response = await authClient.request('/deliveries/routes/live', { method: 'GET' });
        if (active && response) {
          setDriverLivePosition(response.driver_lat != null && response.driver_lng != null ? {
            lat: Number(response.driver_lat),
            lng: Number(response.driver_lng),
            updatedLabel: response.driver_updated_label || '',
          } : null);
        }
      } catch {}
      if (active) {
        timer = window.setTimeout(pollDriverPosition, 10000);
      }
    }
    pollDriverPosition();
    return () => {
      active = false;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [user]);

  const assignRouteDriver = async (routeId, driverUserId) => {
    if (!routeId) {
      return;
    }
    try {
      const response = await authClient.request('/deliveries/routes/' + routeId + '/driver', {
        method: 'PATCH',
        body: JSON.stringify({ driver_user_id: driverUserId || null }),
      });
      setDeliveryRoute((prev) => prev ? { ...prev, driver: response.driver_name || '', driver_user_id: response.driver_user_id || '' } : prev);
      showToast(response.driver_user_id ? 'Entregador atribuído' : 'Entregador removido da rota', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível atribuir o entregador', 'warn');
    }
  };

  const deliverRouteStop = async (stopId) => {
    if (!stopId) {
      return;
    }
    try {
      await authClient.request('/deliveries/my-route/stops/' + stopId + '/deliver', { method: 'POST' });
      setMyDeliveryRoutes((prev) => prev.map((route) => ({
        ...route,
        stops: route.stops.map((stop) => stop.id === stopId ? { ...stop, status: 'delivered' } : stop),
      })));
      showToast('Entrega confirmada', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível confirmar a entrega', 'warn');
    }
  };

  const pingMyLocation = async (latitude, longitude, accuracy) => {
    try {
      await authClient.request('/deliveries/my-route/location', {
        method: 'POST',
        body: JSON.stringify({ latitude, longitude, accuracy_meters: accuracy || 0 }),
      });
    } catch {}
  };

  const geoWatchIdRef = useRef(null);
  const lastPingAtRef = useRef(0);
  const toggleLocationSharing = () => {
    if (locationSharing) {
      if (geoWatchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
      }
      geoWatchIdRef.current = null;
      setLocationSharing(false);
      return;
    }
    if (!navigator.geolocation) {
      showToast('Este dispositivo não suporta compartilhamento de localização', 'warn');
      return;
    }
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastPingAtRef.current < 10000) {
          return;
        }
        lastPingAtRef.current = now;
        pingMyLocation(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
      },
      () => showToast('Não foi possível obter sua localização', 'warn'),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    setLocationSharing(true);
  };

  // ---- counts p/ sidebar ----
  const counts = {
    activeOrders: orders.filter((o) => o.status !== 'dispatched').length,
    deliveries: orders.filter((o) => o.fulfillment === 'delivery' && o.status !== 'dispatched').length,
    myDeliveryStops: myDeliveryRoutes.reduce((sum, route) => sum + route.stops.filter((stop) => stop.status !== 'delivered').length, 0),
    pendingRx: prescriptions.filter((r) => r.status === 'pending').length,
    unread: threads.reduce((s, t) => s + t.unread, 0),
    lowStock: inventory.filter((it) => deriveStockStateKey(it) !== 'normal').length,
    pdv: pdvCart.reduce((s, c) => s + c.qty, 0),
    salesPending: orders.filter((o) => /pago/i.test(o.payment) && !o.nfce).length,
    lowMargin: (typeof priceCalc === 'function')
      ? inventory.filter((it) => priceCalc(it, marketplace, cnaeIndexByCode(cnaeSettings), cnaeSettings.taxRegime).margin < marketplace.minMargin).length
      : 0,
    activeCoupons: coupons.filter((coupon) => {
      const status = typeof getCouponStatusKey === 'function' ? getCouponStatusKey(coupon) : (coupon.active ? 'active' : 'inactive');
      return status === 'active' || status === 'expiring';
    }).length,
    activePromotions: promotions.filter((promotion) => {
      const status = typeof getPromotionStatusKey === 'function' ? getPromotionStatusKey(promotion) : (promotion.active ? 'active' : 'inactive');
      return status === 'active' || status === 'expiring';
    }).length,
    deliveryAreas: (deliveryAreas.stores || []).reduce((sum, store) => sum + (store.neighborhoods || []).length + (store.radiusTiers || []).length, 0),
  };

  // ---- handlers ----
  const onNav = (name) => {
    if (user && !window.FA_ACCESS.canAccessInternalRoute(user, name)) return;
    window.FA_OBS.emit({ portal: 'internal', type: 'navigation', action: 'navigation.requested', route: name, userRole: user && user.role || '', accessScope: user && user.accessScope || '' });
    goTo(name);
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

  const openPromotionCreate = () => setPromotionModalState({ open: true, mode: 'create', promotionId: null });
  const openPromotionEdit = (promotionId) => setPromotionModalState({ open: true, mode: 'edit', promotionId });
  const closePromotionModal = () => setPromotionModalState({ open: false, mode: 'create', promotionId: null });
  const createPromotion = async (payload) => {
    try {
      const response = await authClient.request('/portal/internal/promotions', {
        method: 'POST',
        body: JSON.stringify(buildPromotionMutationPayload(payload)),
      });
      setPromotions((Array.isArray(response) ? response : []).map(normalizePricingPromotion));
      closePromotionModal();
      showToast('Promoção criada', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível criar a promoção.', 'warn');
    }
  };
  const updatePromotion = async (promotionId, payload) => {
    try {
      const response = await authClient.request('/portal/internal/promotions/' + promotionId, {
        method: 'PUT',
        body: JSON.stringify(buildPromotionMutationPayload(payload)),
      });
      setPromotions((Array.isArray(response) ? response : []).map(normalizePricingPromotion));
      closePromotionModal();
      showToast('Promoção atualizada', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível atualizar a promoção.', 'warn');
    }
  };
  const togglePromotionState = async (promotionId, active) => {
    const source = promotions.find((promotion) => promotion.id === promotionId);
    if (!source) return;
    try {
      const response = await authClient.request('/portal/internal/promotions/' + promotionId, {
        method: 'PUT',
        body: JSON.stringify(buildPromotionMutationPayload({ ...source, active })),
      });
      setPromotions((Array.isArray(response) ? response : []).map(normalizePricingPromotion));
      showToast(active ? 'Promoção ativada' : 'Promoção pausada', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível atualizar a promoção.', 'warn');
    }
  };
  const removePromotion = async (promotionId) => {
    try {
      const response = await authClient.request('/portal/internal/promotions/' + promotionId, { method: 'DELETE' });
      setPromotions((Array.isArray(response) ? response : []).map(normalizePricingPromotion));
      showToast('Promoção removida', 'warn');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível remover a promoção.', 'warn');
    }
  };
  const duplicatePromotion = async (promotionId) => {
    const source = promotions.find((promotion) => promotion.id === promotionId);
    if (!source) return;
    try {
      const response = await authClient.request('/portal/internal/promotions', {
        method: 'POST',
        body: JSON.stringify(buildPromotionMutationPayload({ ...source, name: source.name + ' (cópia)', active: false })),
      });
      setPromotions((Array.isArray(response) ? response : []).map(normalizePricingPromotion));
      showToast('Promoção duplicada para edição rápida', 'success');
    } catch (error) {
      showToast(error && error.message ? error.message : 'Não foi possível duplicar a promoção.', 'warn');
    }
  };
  const estimatePromotionAudience = async (criteria) => {
    const response = await authClient.request('/portal/internal/promotions/estimate-audience', {
      method: 'POST',
      body: JSON.stringify({
        min_age: criteria.minAge,
        max_age: criteria.maxAge,
        regions: criteria.regions,
        device_types: criteria.deviceTypes,
        marital_statuses: criteria.maritalStatuses,
        min_children: criteria.minChildren,
        max_children: criteria.maxChildren,
        customer_segment: criteria.customerSegment,
      }),
    });
    return {
      matchingCustomers: Number((response && response.matching_customers) || 0),
      totalActiveCustomers: Number((response && response.total_active_customers) || 0),
    };
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

  const toggleOrderItemPicked = async (orderRecordId, itemId, picked) => {
    if (!orderRecordId || !itemId) {
      return;
    }
    if (!isFilePreview && user) {
      try {
        const response = await authClient.request('/orders/' + orderRecordId + '/items/' + itemId + '/pick', {
          method: 'POST',
          body: JSON.stringify({ picked }),
        });
        const normalized = normalizeOrdersPayload({ items: [response] })[0];
        if (normalized) {
          setOrders((prev) => prev.map((item) => item.recordId === normalized.recordId ? normalized : item));
        }
        return;
      } catch (error) {
        showToast(error && error.message ? error.message : 'Nao foi possivel atualizar a conferencia do item', 'warn');
        return;
      }
    }
    setOrders((prev) => prev.map((order) => order.recordId !== orderRecordId ? order : {
      ...order,
      items: order.items.map((item) => item.id === itemId ? { ...item, picked } : item),
    }));
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

  const dispatchShippingOrder = async (orderRecordId) => {
    if (!orderRecordId) {
      return;
    }
    if (!isFilePreview && user) {
      try {
        const response = await authClient.request('/orders/' + orderRecordId + '/shipping/dispatch', { method: 'POST' });
        const normalized = normalizeOrdersPayload({ items: [response] })[0];
        if (normalized) {
          setOrders((prev) => prev.map((item) => item.recordId === normalized.recordId ? normalized : item));
        }
        showToast('Etiqueta gerada e pedido despachado', 'success');
        return;
      } catch (error) {
        showToast(error && error.message ? error.message : 'Não foi possível gerar a etiqueta de envio', 'warn');
        throw error;
      }
    }
    setOrders((prev) => prev.map((item) => item.recordId === orderRecordId ? { ...item, status: 'dispatched' } : item));
    showToast('Etiqueta gerada e pedido despachado', 'success');
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

  const adjustStock = async (id, payload, storeId = "") => {
    const movement = typeof payload === 'number'
      ? { movementType: payload >= 0 ? 'entry' : 'exit', quantityDelta: payload, reason: payload >= 0 ? 'Manual stock entry' : 'Manual stock exit', note: '', referenceCode: '', storageLocationCode: '' }
      : payload;
    window.FA_OBS.emit({ portal: 'internal', type: 'inventory', action: 'inventory.adjust', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { itemId: id, delta: movement.quantityDelta } });
    const response = await authClient.request(withStoreParam("/inventory/items/" + id + "/adjustments", storeId || storeIdOverride), {
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
    window.FA_OBS.emit({ portal: 'internal', type: 'inventory', action: 'inventory.create', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { itemId: item.id || '', productId: item.productId || '' } });
    const response = await authClient.request('/inventory/items', {
      method: 'POST',
      body: JSON.stringify({
        product_id: item.productId,
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
        note: item.note || '',
      }),
    });
    await refreshInventory();
    showToast('Item cadastrado no estoque', 'success');
    return normalizeInventoryItem(response);
  };

  const updateInventory = async (id, item) => {
    window.FA_OBS.emit({ portal: 'internal', type: 'inventory', action: 'inventory.update', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '', metadata: { itemId: id } });
    const current = inventory.find((it) => it.id === id);
    try {
      await authClient.request('/inventory/items/' + id, {
        method: 'PUT',
        body: JSON.stringify({
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
          is_active: item.active == null ? true : !!item.active,
          is_marketplace_visible: item.marketplaceVisible == null ? (current ? !!current.marketplaceVisible : true) : !!item.marketplaceVisible,
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
        location_type: location.locationType || 'estoque',
        is_controlled_only: !!location.controlledOnly,
      }),
    });
    await refreshInventory();
    showToast('Local de armazenamento cadastrado', 'success');
  };

  const fetchStoreLocations = async (storeId, filters) => {
    const params = new URLSearchParams();
    if (storeId) params.set('store_id', storeId);
    if (filters && filters.locationType) params.set('location_type', filters.locationType);
    params.set('active_only', 'false');
    const response = await authClient.request('/inventory/locations?' + params.toString());
    return Array.isArray(response) ? response.map(normalizeInventoryLocation) : [];
  };

  const createStoreLocation = async (location) => {
    const response = await authClient.request('/inventory/locations', {
      method: 'POST',
      body: JSON.stringify({
        store_id: location.storeId,
        code: location.code,
        name: location.name,
        zone: location.zone || '',
        description: location.description || '',
        temperature_range: location.temperatureRange || '',
        location_type: location.locationType || 'estoque',
        is_controlled_only: !!location.controlledOnly,
      }),
    });
    showToast('Local cadastrado', 'success');
    return normalizeInventoryLocation(response);
  };

  const updateStoreLocation = async (locationId, location) => {
    const response = await authClient.request('/inventory/locations/' + locationId, {
      method: 'PUT',
      body: JSON.stringify({
        code: location.code,
        name: location.name,
        zone: location.zone || '',
        description: location.description || '',
        temperature_range: location.temperatureRange || '',
        location_type: location.locationType || 'estoque',
        is_controlled_only: !!location.controlledOnly,
      }),
    });
    showToast('Local atualizado', 'success');
    return normalizeInventoryLocation(response);
  };

  const setStoreLocationActive = async (locationId, isActive) => {
    const response = await authClient.request('/inventory/locations/' + locationId + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !!isActive }),
    });
    showToast(isActive ? 'Local reativado' : 'Local desativado', 'success');
    return normalizeInventoryLocation(response);
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
    if (storeIdOverride) query.set('store_id', storeIdOverride);
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

  // Custos de Aquisição (admin): anexa a nota fiscal (PDF/XML) de um produto, recalcula o preço unitário e recebe o estoque
  const applyInventoryItemInvoice = async (itemId, { invoiceTotalAmount, productTotalAmount, quantity, note, file, taxCostAmount, isSubjectToIcmsSt }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('invoice_total_amount', String(invoiceTotalAmount));
    form.append('product_total_amount', String(productTotalAmount));
    form.append('quantity', String(quantity));
    if (note) form.append('note', note);
    if (taxCostAmount != null && taxCostAmount !== '') form.append('tax_cost_amount', String(taxCostAmount));
    if (isSubjectToIcmsSt != null) form.append('is_subject_to_icms_st', String(!!isSubjectToIcmsSt));
    const payload = await authClient.request('/inventory/items/' + itemId + '/invoices', {
      method: 'POST',
      body: form,
      skipJsonContentType: true,
    });
    await refreshInventory();
    showToast('Nota fiscal anexada · preço unitário recalculado', 'success');
    return payload;
  };

  const fetchInventoryItemInvoices = async (itemId) => {
    const payload = await authClient.request('/inventory/items/' + itemId + '/invoices', { method: 'GET' });
    return Array.isArray(payload.items) ? payload.items.map(normalizeInventoryInvoiceRecord) : [];
  };

  const downloadInventoryInvoiceFile = async (invoiceId, fallbackFileName) => {
    const result = await authClient.download('/inventory/invoices/' + invoiceId + '/file', { method: 'GET' });
    const blobUrl = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    const match = /filename=\"?([^\";]+)\"?/i.exec(result.filename || '');
    link.href = blobUrl;
    link.download = match && match[1] ? match[1] : (fallbackFileName || 'nota-fiscal');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  const fetchInventoryAudit = async ({
    page = 1, pageSize = 30, entityType = '', action = '', actorQuery = '', dateFrom = '', dateTo = '', q = '',
  } = {}) => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    if (entityType) params.set('entity_type', entityType);
    if (action) params.set('action', action);
    if (actorQuery) params.set('actor_query', actorQuery);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (q) params.set('q', q);
    const payload = await authClient.request('/inventory/audit?' + params.toString(), { method: 'GET' });
    return {
      items: (payload.items || []).map(normalizeAuditEntry),
      page: Number(payload.page || 1),
      pageSize: Number(payload.page_size || pageSize),
      total: Number(payload.total || 0),
    };
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
          tax_cost_amount: item.taxCostAmount == null || item.taxCostAmount === '' ? null : Number(item.taxCostAmount),
          is_subject_to_icms_st: item.isSubjectToIcmsSt == null ? null : !!item.isSubjectToIcmsSt,
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
    let previousItem = null;
    let nextItem = null;
    setInv((prev) => {
      const next = prev.map((it) => {
        if (it.id !== id) {
          return it;
        }
        previousItem = it;
        nextItem = { ...it, ...clean };
        return nextItem;
      });
      persistMarketplaceCatalog(next);
      return next;
    });
    if (!isFilePreview && user && nextItem) {
      authClient.request('/inventory/items/' + id, {
        method: 'PUT',
        body: JSON.stringify({
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
          is_active: nextItem.active == null ? true : !!nextItem.active,
          is_marketplace_visible: !!nextItem.marketplaceVisible,
          note: nextItem.note || '',
        }),
      }).then(() => refreshInventory()).catch(() => {
        // The optimistic update above already flipped local state (and the vitrine
        // badge) before this request resolved — on failure that must be undone,
        // otherwise the console keeps showing "Publicado"/"Oculto" for a change that
        // never actually reached the backend, silently diverging from what the
        // marketplace (which always reads live from the API) actually serves.
        setInv((prev) => {
          const reverted = prev.map((it) => (it.id === id && previousItem ? previousItem : it));
          persistMarketplaceCatalog(reverted);
          return reverted;
        });
        showToast('Não foi possível salvar a publicação no marketplace — a alteração foi desfeita, tente novamente', 'warn');
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
    goTo('chat');
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
    goTo('dash');
  };

  const onLogoutAll = async () => {
    window.FA_OBS.emit({ portal: 'internal', type: 'auth', action: 'auth.logout_all', route, userRole: user && user.role || '', accessScope: user && user.accessScope || '' });
    await authClient.logoutAll();
    setPdvCustomer(null);
    setPdvCart([]);
    setUser(null);
    goTo('dash');
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
            goTo(window.FA_ACCESS.getFirstInternalRoute(normalizedUser));
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
          goTo(window.FA_ACCESS.getFirstInternalRoute(normalizedUser));
          window.FA_OBS.emit({ portal: 'internal', type: 'auth', action: 'auth.login', route: 'dash', userRole: normalizedUser.role, accessScope: normalizedUser.accessScope, detail: normalizedUser.email });
          showToast('Sessão iniciada · ' + window.FA_ACCESS.INTERNAL_ROLE_LABEL[normalizedUser.role], 'success');
          return response;
        }} externalError={loginError} />
        <FontTweaks />
      </div>
    );
  }

  const createPdvCustomer = async ({ name, doc, phone, email }) => {
    const payload = await authClient.request('/crm/customers', {
      method: 'POST',
      body: JSON.stringify({ full_name: name || '', doc: doc || '', phone: phone || '', email: email || '' }),
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
    stockLots, refreshStockLots, receiveLot, transferLot, adjustLot, searchItemTrace, fetchItemTrace,
    fetchStoreLocations, createStoreLocation, updateStoreLocation, setStoreLocationActive,
    route, onNav, openOrder, closeDrawer, drawerOrder,
    advanceOrder, confirmPickupCode, updateOrderItemLocation, toggleOrderItemPicked, dispatchShippingOrder, validateRx, adjustStock, addInventory, updateInventory, addInventoryLocation, transferInventory, exportInventory, previewInventoryInvoice, confirmInventoryInvoice, applyInventoryItemInvoice, fetchInventoryItemInvoices, downloadInventoryInvoiceFile, fetchInventoryAudit, dispatchRoute,
    openChatFor, openChatForName, setActiveThread, sendChat, onLogout,
    openCustomer: (name) => { setCrmFocus(name); goTo('crm'); setDrawerOrder(null); },
    crmFocus,
    pdvCart, setPdvCart, pdvCustomer, setPdvCustomer, pdvAdd, pdvSetQty, pdvRemove, pdvClear, pdvSetLocation, fetchPdvItemLocations, pdvSearchProducts, fetchCustomerPurchaseInsights, fetchCustomerPaymentMethods, fetchCustomerAddresses, createPdvCustomerAddress, confirmPdvRecurrence, checkPdvDeliveryCoverage, fetchPdvDiscountLimit, fetchPdvDrafts, autosavePdvDraft, deletePdvDraft, pdvCreateReservation, fetchPdvPrescriptionStatus, createPdvPrescription, finalizeSale,
    fetchTeamMembers, updateTeamMemberStore,
    suppliers, refreshSuppliers, addSupplier, updateSupplier, setSupplierActive,
    products, refreshProducts, addProduct, updateProduct, setProductActive, setProductDiscarded, fetchProductStoreLinks, linkProductToStore,
    brands, refreshBrands, addBrand, updateBrand, setBrandActive, setBrandDiscarded,
    categories, refreshCategories, addCategory, updateCategory, setCategoryActive, setCategoryDiscarded,
    therapeuticClasses, refreshTherapeuticClasses, addTherapeuticClass, updateTherapeuticClass, setTherapeuticClassActive, setTherapeuticClassDiscarded,
    storeDirectory, refreshStoreDirectory, addStoreEntry, updateStoreEntry, setStoreEntryActive,
    pdvQueue, pdvSendToCashier, pdvClaimFromQueue,
    pdvSales, recordSale, sendFiscalDocumentEmail,
    marketplace, setMarketplace, saveMarketplaceMeta, marketplaceMetaBusy, setItemPricing, notify: showToast,
    pdvDiscountSettings, setPdvDiscountSettings, savePdvDiscountSettings, pdvDiscountSettingsBusy,
    cnaeSettings, setCnaeItems, setTaxRegime, saveCnaeSettings, cnaeSettingsBusy,
    stores, selectedStoreId, setSelectedStoreId,
    deliveryAreas, setDeliveryAreas, saveDeliveryAreas, deliveryAreasBusy, searchDeliveryAddresses,
    coupons, couponModalState, openCouponCreate, openCouponEdit, closeCouponModal, createCoupon, updateCoupon, toggleCouponState, removeCoupon, duplicateCoupon,
    promotions, promotionModalState, openPromotionCreate, openPromotionEdit, closePromotionModal, createPromotion, updatePromotion, togglePromotionState, removePromotion, duplicatePromotion, estimatePromotionAudience,
    customers, customerByName, createPdvCustomer,
    nowLabel, todayIso, todayLabel,
    pharmacistProfile, storeFiscal, chartSeed,
    hub, deliveryRoute, driverLivePosition, assignRouteDriver,
    myDeliveryRoutes, deliverRouteStop, locationSharing, toggleLocationSharing,
    financialMonths: financialSettings ? financialSettings.months || {} : null,
    financialSettingsBusy, financialSettingsError, saveFinancialMonth, retryFinancialSettings,
    constructionCosts, constructionCostsBusy, constructionCostsError, refreshConstructionCosts, saveConstructionCosts,
    user,
  };

  const screen = () => {
    switch (safeRoute) {
      case 'dash': return <Dashboard ctx={ctx} />;
      case 'orders': return <OrdersScreen ctx={ctx} />;
      case 'deliveries': return <DeliveriesScreen ctx={ctx} />;
      case 'driver-route': return <DriverRouteScreen ctx={ctx} />;
      case 'rx': return <RxScreen ctx={ctx} />;
      case 'inventory': return <InventoryScreen ctx={ctx} />;
      case 'inventory-audit': return <InventoryAuditScreen ctx={ctx} />;
      case 'settings': return <SettingsScreen ctx={ctx} />;
      case 'locations': return <LocationsScreen ctx={ctx} />;
      case 'chat': return <ChatScreen ctx={ctx} />;
      case 'crm': return <CrmScreen ctx={ctx} />;
      case 'pdv': return <PdvScreen ctx={ctx} />;
      case 'sales': return <SalesScreen ctx={ctx} />;
      case 'pricing': return <PricingScreen ctx={ctx} />;
      case 'coupons': return <CouponsScreen ctx={ctx} />;
      case 'promotions': return <PromotionsScreen ctx={ctx} />;
      case 'delivery-zones': return <DeliveryZonesScreen ctx={ctx} />;
      case 'analytics': return <AnalyticsScreen ctx={ctx} />;
      case 'team': return <TeamScreen ctx={ctx} />;
      case 'suppliers': return <SuppliersScreen ctx={ctx} />;
      case 'products': return <ProductsScreen ctx={ctx} />;
      case 'brands': return <BrandsScreen ctx={ctx} />;
      case 'categories': return <CategoriesScreen ctx={ctx} />;
      case 'therapeutic-classes': return <TherapeuticClassesScreen ctx={ctx} />;
      case 'stores': return <StoresScreen ctx={ctx} />;
      case 'product-trace': return <ProductTraceScreen ctx={ctx} />;
      case 'acquisition-costs': return <AcquisitionCostsScreen ctx={ctx} />;
      case 'construction-costs': return <ConstructionCostsScreen ctx={ctx} />;
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
      {promotionModalState.open && (
        <PromotionModal
          mode={promotionModalState.mode}
          promotion={promotions.find((item) => item.id === promotionModalState.promotionId) || null}
          inventory={inventory}
          customers={customers}
          mkt={marketplace}
          cnaeSettings={cnaeSettings}
          onClose={closePromotionModal}
          onCreate={createPromotion}
          onUpdate={updatePromotion}
          estimateAudience={estimatePromotionAudience}
        />
      )}
      {acctTab && <AccountModal tab={acctTab} onClose={() => setAcctTab(null)} user={user} onLogoutAll={onLogoutAll} onTwoFactorSetup={beginTwoFactorSetup} onTwoFactorEnable={enableTwoFactor} onTwoFactorDisable={disableTwoFactor} onTwoFactorStatusChange={applyInternalTwoFactorState} stores={stores} selectedStoreId={selectedStoreId} />}
      <FontTweaks />

      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 1300, background: 'var(--fa-ink)', color: '#fff', padding: '14px 20px', borderRadius: 'var(--fa-r-btn)', boxShadow: 'var(--fa-shadow-lg)', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14 }} className="fa-fadein">
          <span style={{ width: 24, height: 24, borderRadius: 99, background: toneColor[toast.tone] || 'var(--fa-success)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="check" size={15} stroke={2.8} /></span>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export { PharmApp };

function InternalAppRouter() {
  return (
    <BrowserRouter basename="/internal">
      <Routes>
        <Route path="/*" element={<PharmApp />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<InternalAppRouter />);
