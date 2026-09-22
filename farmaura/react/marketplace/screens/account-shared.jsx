/*
farmaura/react/marketplace/screens/account-shared.jsx

Shared account helpers and order UI used across marketplace account-related screens.

Responsibilities:
- provide shared identity and order helper functions;
- render reusable order tracking and order card components;
- expose cashback computation without introducing cross-screen imports;

Observations:
- this module exists to break screen-level circular dependencies after the ESM migration;
- all shared account presentation logic lives here instead of being re-exported from screen entry modules.
*/

import React, { useEffect, useState } from "react";

import { brl, Modal, ProductVisual, StarPicker } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";


// ============================================================================
// ACCOUNT NAV SHELL
// ============================================================================


// The 8 destinations ported from the demo's own account-nav, plus 1 real destination the demo's
// prototype doesn't cover (this app has more surface area than that one static mockup): "Serviços
// de saúde". "Resumo da conta" (the account landing dashboard) was removed 2026-09-04 at the
// user's request. "Meu perfil" was reordered to the top 2026-09-05, also at the user's request —
// see the shell-de-conta-unificado ADR's Atualizações for both changes (order here no longer
// matches the demo's original order 1:1).
// Cashback/Assinaturas are real top-level routes (own onNav), not AccountScreen tabs — every
// other entry is an AccountScreen tab reached via onNav({name:'account', tab}).
const ACCOUNT_NAV_LINKS = [
  { key: "profile", icon: "user", label: "Meu perfil", kind: "tab", tab: "profile" },
  { key: "orders", icon: "bag", label: "Meus pedidos", kind: "tab", tab: "orders" },
  { key: "cashback", icon: "gift", label: "Cashback", kind: "route", route: "cashback" },
  { key: "subscriptions", icon: "repeat", label: "Assinaturas", kind: "route", route: "subscriptions" },
  { key: "payments", icon: "card", label: "Pagamentos", kind: "tab", tab: "cards" },
  { key: "messages", icon: "chat", label: "Mensagens", kind: "tab", tab: "conversations" },
  { key: "health", icon: "activity", label: "Serviços de saúde", kind: "tab", tab: "health" },
  { key: "settings", icon: "cog", label: "Configurações", kind: "tab", tab: "settings" },
];

// Shared chrome for every account-area screen — ported verbatim from the demo's
// .cat-crumb/.account-shell/.account-nav (same markup/classes on all 8 of its account panels),
// so every destination (whether hosted as an AccountScreen tab or its own top-level route like
// Cashback/Assinaturas) renders the identical sidebar instead of each screen inventing its own.
function AccountNavShell({ ctx, activeKey, crumbLabel, children }) {
  const { user, profile, onNav, logout, orders, cashbackWallet } = ctx;
  const name = (profile && profile.name) || (user && user.name) || "Cliente";
  const email = (profile && profile.email) || (user && user.email) || "";
  const photo = (profile && profile.photo) || (user && user.photo) || "";
  const ordersCount = Array.isArray(orders) ? orders.length : 0;
  const cashbackAvailable = cashbackWallet ? cashbackWallet.availableBalance : 0;

  const go = (item) => {
    if (item.kind === "route") {
      onNav({ name: item.route });
    } else {
      onNav({ name: "account", tab: item.tab });
    }
  };

  return (
    <div className="fa-wrap fa-fadein">
      <div className="cat-crumb">
        <a role="button" tabIndex={0} onClick={() => onNav({ name: "home" })} onKeyDown={(event) => { if (event.key === "Enter") onNav({ name: "home" }); }}>Início</a>
        <span className="cat-crumb-sep">/</span>
        <span className="cat-crumb-current">{crumbLabel}</span>
      </div>
      <div className="account-shell">
        <aside className="account-nav">
          <div className="account-nav-user">
            <span className="profile-avatar"><span className="profile-avatar-inner">{photo ? <img src={photo} alt="" /> : initials(name)}</span></span>
            <div className="account-nav-user-info">
              <div className="account-nav-name">{name}</div>
              <div className="account-nav-email">{email}</div>
            </div>
          </div>
          <nav className="account-nav-links">
            {ACCOUNT_NAV_LINKS.map((item) => (
              <a
                key={item.key}
                role="button"
                tabIndex={0}
                className={"account-nav-link" + (item.key === activeKey ? " is-active" : "")}
                onClick={() => go(item)}
                onKeyDown={(event) => { if (event.key === "Enter") go(item); }}
              >
                <Icon name={item.icon} size={17} />
                <span className="lbl">{item.label}</span>
                {item.key === "orders" && ordersCount > 0 && <span className="chip">{ordersCount}</span>}
                {item.key === "cashback" && cashbackAvailable > 0 && <span className="chip">{brl(cashbackAvailable)}</span>}
              </a>
            ))}
          </nav>
          <button className="account-nav-signout" type="button" onClick={logout}><Icon name="logout" size={16} />Sair</button>
        </aside>
        <div className="account-main">{children}</div>
      </div>
    </div>
  );
}


// ============================================================================
// IDENTITY HELPERS
// ============================================================================


function initials(name) {
  return String(name || "").split(" ").map((segment) => segment[0]).slice(0, 2).join("");
}


// ============================================================================
// ORDER HELPERS
// ============================================================================


function resolveOrderStatusMeta(statusMap, order) {
  return statusMap[order.status] || statusMap.preparing || { cls: "fa-badge-mist", icon: "clock", label: order.rawStatus || "Em processamento", step: 0 };
}

function resolveOrderLineProduct(item, products) {
  const product = products.find((entry) => entry.id === item.id);
  if (product) {
    return product;
  }
  return {
    id: item.id,
    cat: "medicamentos",
    name: item.name || "Produto Farmaura",
    brand: item.brand || "Farmaura",
    price: Number(item.unitPrice || 0),
  };
}

function resolveOrderLineTotal(item, product) {
  if (Number.isFinite(Number(item.lineTotal)) && Number(item.lineTotal) > 0) {
    return Number(item.lineTotal);
  }
  const unitPrice = item.sub ? Number(product.price || 0) * 0.85 : Number(item.unitPrice || product.price || 0);
  return unitPrice * Number(item.qty || 0);
}


// ============================================================================
// CASHBACK
// ============================================================================


function faCashback(orders, products) {
  const rate = 0.05;
  const rows = orders.map((order) => {
    const total = Number(order.total || 0) || order.items.reduce((sum, item) => {
      const product = resolveOrderLineProduct(item, products);
      return sum + resolveOrderLineTotal(item, product);
    }, 0);
    const cash = Math.round(total * rate * 100) / 100;
    const count = order.items.reduce((sum, item) => sum + item.qty, 0);
    const released = order.status === "delivered";
    return { order, total, cash, count, released };
  });
  const earned = rows.reduce((sum, row) => sum + row.cash, 0);
  const available = rows.filter((row) => row.released).reduce((sum, row) => sum + row.cash, 0);
  const pending = earned - available;
  return { rows, earned, available, pending, rate };
}


// ============================================================================
// ORDER UI
// ============================================================================


function OrderTracker({ step, fulfillment }) {
  const isPickup = fulfillment === "pickup";
  const stages = [["bag", "Aguardando confirmação"], ["clock", "Preparando"], [isPickup ? "pin" : "truck", isPickup ? "Retirada na loja" : "A caminho"], ["check", "Entregue"]];
  const active = Number.isFinite(Number(step)) ? Number(step) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", margin: "4px 0 2px" }}>
      {stages.map(([iconName, label], index) => {
        const done = index <= active;
        return (
          <React.Fragment key={label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "none" }}>
              <span style={{ width: 34, height: 34, borderRadius: 99, display: "grid", placeItems: "center", background: done ? "var(--fa-primary)" : "var(--fa-mist-2)", color: done ? "#fff" : "var(--fa-ink-3)", flex: "none" }}><Icon name={iconName} size={17} stroke={2} /></span>
              <span style={{ fontSize: 11, fontWeight: 600, color: done ? "var(--fa-ink)" : "var(--fa-ink-3)" }}>{label}</span>
            </div>
            {index < stages.length - 1 && <span style={{ flex: 1, height: 3, borderRadius: 2, margin: "0 6px", marginTop: -18, background: index < active ? "var(--fa-primary)" : "var(--fa-mist)" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Compact 4-step rail for the order-card "andamento" panel (marketplace.css .order-progress) —
// same stage/step logic as OrderTracker above (kept for the richer OrderSupportDrawer view), but
// with an icon inside each step dot instead of a plain circle, so the rail reads at a glance
// without needing the label underneath.
function OrderProgressRail({ step, fulfillment }) {
  const isPickup = fulfillment === "pickup";
  const stages = [
    ["bag", "Confirmado"],
    ["clock", "Separação"],
    [isPickup ? "pin" : "truck", isPickup ? "Pronto p/ retirada" : "A caminho"],
    ["check", isPickup ? "Retirado" : "Entregue"],
  ];
  const active = Number.isFinite(Number(step)) ? Number(step) : 0;
  return (
    <ol className="order-progress">
      {stages.map(([iconName, label], index) => (
        <li key={label} className={index < active ? "is-done" : index === active ? "is-current" : ""}>
          <span className="order-progress-dot"><Icon name={iconName} size={14} stroke={2.2} /></span>{label}
        </li>
      ))}
    </ol>
  );
}

// Real order status (7 lifecycle states — see normalizeMarketplaceOrderStatus) collapsed into the
// 4 pill classes the ported design defines (marketplace.css .order-status.is-*).
function resolveOrderPillClass(status) {
  if (status === "cancelled") return "is-canceled";
  if (status === "delivered") return "is-delivered";
  if (status === "awaiting_confirmation" || status === "preparing") return "is-preparing";
  return "is-transit"; // ready, ready_for_pickup, transit
}

// Rating + short-text review for one purchased product — the review itself is real
// (POST /products/reviews), but there is no per-customer "already reviewed this product"
// signal from the backend today, so this stays available regardless of prior submissions
// (see product-ref-nao-normalizado / sem-indicador-produto-ja-avaliado pendências).
function ProductReviewModal({ open, item, onClose, onSubmit, showToast, initialRating = 0 }) {
  const [rating, setRating] = useState(initialRating);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Picking a star on the "Avalie suas compras recentes" prompt (MyOrders) opens this modal
  // pre-seeded with that rating instead of making the customer choose again.
  useEffect(() => { if (open) setRating(initialRating); }, [open, initialRating]);

  const reset = () => { setRating(0); setTitle(""); setBody(""); setError(""); };
  const handleClose = () => { if (saving) return; reset(); onClose(); };

  const submit = async () => {
    if (!item) return;
    if (!rating) { setError("Escolha de 1 a 5 estrelas."); return; }
    if (body.trim().length < 8) { setError("Conte um pouco mais — pelo menos 8 caracteres."); return; }
    setSaving(true);
    setError("");
    try {
      await onSubmit({ product_ref: item.productId, rating, title: title.trim(), body: body.trim() });
      reset();
      onClose();
      if (showToast) showToast("Avaliação enviada — obrigado pelo retorno!");
    } catch (err) {
      setError((err && err.message) || "Não foi possível enviar sua avaliação agora.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} icon="star" title="Avaliar produto"
      sub={item ? `Como foi sua experiência com "${item.name}"?` : ''}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
        <StarPicker value={rating} onChange={setRating} />
        <input className="fa-input" placeholder="Título (opcional)" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <textarea className="fa-input" rows={4} placeholder="O que você achou do produto?" maxLength={1200} value={body} onChange={(e) => setBody(e.target.value)} style={{ height: "auto", minHeight: 90, padding: "10px 14px", resize: "vertical" }} />
          <div className="fa-faint" style={{ fontSize: 11, marginTop: 4, textAlign: "right" }}>{body.length}/1200</div>
        </div>
        {error && <div style={{ color: "var(--fa-error, #B3261E)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="fa-btn fa-btn-primary fa-btn-block" disabled={saving} onClick={submit}>{saving ? "Enviando…" : "Enviar avaliação"}</button>
          <button className="fa-btn fa-btn-soft fa-btn-block" disabled={saving} onClick={handleClose}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

// Order card, ported from the "Padrão farmácia" demo (data-cat="orders", .order-card): a collapsed
// summary (thumbs + code/date + status pill + total) that expands into the progress rail, payment/
// delivery meta, item list, and real actions — replaces the previous fa-badge-based layout.
function OrderCard({ order, products, statusMap, onReorder, onOpenProduct, onTrackOrder, onOpenSupport, onReviewItem, onDownloadFiscalDocument, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen != null ? defaultOpen : order.status === "transit");
  const [showAllItems, setShowAllItems] = useState(false);
  const status = resolveOrderStatusMeta(statusMap, order);
  const pillClass = resolveOrderPillClass(order.status);
  const cancelled = order.status === "cancelled";
  const delivered = order.status === "delivered";
  const pickup = order.fulfillment === "pickup";
  const resolvedItems = order.items.map((item) => {
    const product = resolveOrderLineProduct(item, products);
    return { item, product, lineTotal: resolveOrderLineTotal(item, product) };
  });
  const total = Number(order.total || 0) || resolvedItems.reduce((sum, entry) => sum + entry.lineTotal, 0);
  const VISIBLE_ITEMS = 2;
  const visibleItems = showAllItems ? resolvedItems : resolvedItems.slice(0, VISIBLE_ITEMS);
  const hiddenCount = resolvedItems.length - VISIBLE_ITEMS;
  const extraThumbCount = resolvedItems.length - 3;

  // Same plain-language status line OrderSupportDrawer shows above its own tracker — repeated
  // here so "how's my order doing" never requires opening the drawer just to find out.
  const progressNote = cancelled
    ? "Este pedido foi cancelado" + (order.paymentStatus !== "approved" ? " e não foi cobrado" : "") + "."
    : delivered
    ? (pickup ? "Retirado com sucesso." : "Entregue com sucesso.")
    : (order.eta || (pickup ? "Aguardando liberação para retirada." : "Aguardando atualização da entrega."));
  const progressIcon = cancelled ? "close" : delivered ? "check" : pickup ? "bag" : "truck";

  return (
    <article className="order-card">
      <button className="order-card-summary" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="order-summary-thumbs">
          {resolvedItems.slice(0, 3).map(({ item, product }) => (
            <span className="order-summary-thumb" key={item.id}><ProductVisual product={product} style={{ width: '100%', height: '100%', aspectRatio: 'auto' }} /></span>
          ))}
          {extraThumbCount > 0 && <span className="order-summary-thumb order-summary-thumb-more">+{extraThumbCount}</span>}
        </span>
        <span className="order-summary-main">
          <span className="order-card-code">#{order.id}</span>
          <span className="order-card-date">{order.date} · {resolvedItems.length} {resolvedItems.length === 1 ? "item" : "itens"}</span>
        </span>
        <span className={"order-status " + pillClass}><Icon name={status.icon} size={12} stroke={2.4} />{status.label}</span>
        <span className="order-summary-total">{brl(total)}</span>
        <span className="order-summary-chevron"><Icon name="chevD" size={16} /></span>
      </button>

      {open && (
        <div className="order-card-details">
          <div className="order-progress-panel" data-state={cancelled ? "cancelled" : delivered ? "done" : "active"}>
            {!cancelled && <OrderProgressRail step={status.step} fulfillment={order.fulfillment} />}
            <p className="order-progress-note"><Icon name={progressIcon} size={15} stroke={2.2} />{progressNote}</p>
          </div>

          <div className="order-meta-grid">
            <div className="order-meta-item"><span className="k"><Icon name="card" size={13} />Pagamento</span><span className="v">{order.payment || "Não informado"}</span></div>
            <div className="order-meta-item">
              <span className="k"><Icon name={pickup ? "bag" : "truck"} size={13} />{pickup ? "Retirada" : "Entrega"}</span>
              <span className="v">{pickup ? (order.store || "Loja Farmaura") : (order.address || "Endereço não informado")}</span>
            </div>
          </div>

          {pickup && order.pickupCode && !cancelled ? (
            <div className="fa-card" style={{ padding: "12px 14px", background: "var(--fa-info-soft)", border: "1px solid var(--fa-mist)", fontSize: 13.5, lineHeight: 1.5 }}>
              <b style={{ display: "block", marginBottom: 4 }}>Use este código na retirada</b>
              <span className="fa-mono" style={{ fontSize: 18, fontWeight: 800 }}>{order.pickupCode}</span>
              <div className="fa-muted" style={{ marginTop: 6 }}>Informe esse código ao farmacêutico para validar a retirada no sistema.</div>
            </div>
          ) : null}

          <div className="order-products">
            {visibleItems.map(({ item, product, lineTotal }) => (
              <div className="order-product-row" key={item.id}>
                <span className="order-product-thumb" style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', cursor: product.id ? 'pointer' : 'default' }} onClick={() => product.id && onOpenProduct(product)}>
                  <ProductVisual product={product} style={{ width: '100%', height: '100%', aspectRatio: 'auto' }} />
                </span>
                <div className="order-product-info">
                  <span className="order-product-name">{product.name}</span>
                  <span className="order-product-qty">{product.brand} · Qtd {item.qty} · {brl(item.unitPrice || (item.qty ? lineTotal / item.qty : 0))} un.{item.sub ? " · assinatura" : ""}</span>
                  {delivered && onReviewItem && (
                    <button type="button" className="order-action-btn" style={{ marginTop: 4 }} onClick={() => onReviewItem(item, order)}><Icon name="star" size={13} />Avaliar produto</button>
                  )}
                </div>
                <span className="order-product-total">{brl(lineTotal)}</span>
              </div>
            ))}
            {hiddenCount > 0 && (
              <button type="button" className={"order-products-toggle" + (showAllItems ? " is-open" : "")} onClick={() => setShowAllItems(!showAllItems)}>
                <span>{showAllItems ? "Mostrar menos" : `Ver todos os ${resolvedItems.length} itens`}</span><Icon name="chevD" size={13} />
              </button>
            )}
          </div>

          <div className="order-card-foot">
            <div className="order-card-total-wrap"><span className="k">Total</span><span className="order-card-total">{brl(total)}</span></div>
            <button className="fa-btn fa-btn-primary" onClick={() => onReorder(order)}><Icon name="repeat" size={16} />Comprar novamente</button>
          </div>

          {!cancelled && (
            <div className="order-actions-row">
              {!delivered && (
                <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => onTrackOrder && onTrackOrder(order)}><Icon name="pin" size={14} />Rastrear pedido</button>
              )}
              <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => onOpenSupport && onOpenSupport(order)}><Icon name="chat" size={14} />Falar com farmacêutico</button>
              {order.fiscalDocument && onDownloadFiscalDocument && (
                <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => onDownloadFiscalDocument(order)}><Icon name="receipt" size={14} />Baixar nota fiscal</button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export { ACCOUNT_NAV_LINKS, AccountNavShell, OrderCard, OrderProgressRail, OrderTracker, ProductReviewModal, faCashback, initials, resolveOrderLineProduct, resolveOrderLineTotal, resolveOrderPillClass, resolveOrderStatusMeta };
