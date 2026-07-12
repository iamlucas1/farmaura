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

import React, { useState } from "react";

import { brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";


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
  const stages = [["bag", "Aguardando confirmação"], ["clock", "Preparando"], [isPickup ? "store" : "truck", isPickup ? "Retirada na loja" : "A caminho"], ["check", "Entregue"]];
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

function OrderCard({ order, products, statusMap, onReorder, onOpenProduct, onTrackOrder, onOpenSupport, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen != null ? defaultOpen : order.status === "transit");
  const status = resolveOrderStatusMeta(statusMap, order);
  const total = Number(order.total || 0) || order.items.reduce((sum, item) => {
    const product = resolveOrderLineProduct(item, products);
    return sum + resolveOrderLineTotal(item, product);
  }, 0);
  const count = order.items.reduce((sum, item) => sum + item.qty, 0);
  const pickup = order.fulfillment === "pickup";
  return (
    <div className="fa-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", borderBottom: open ? "1px solid var(--fa-mist)" : "none" }}>
        <span className={"fa-badge " + status.cls}><Icon name={status.icon} size={12} stroke={2.2} />{status.label}</span>
        <span className="fa-badge fa-badge-outline"><Icon name={pickup ? "bag" : "truck"} size={12} />{pickup ? "Retirado na loja" : "Entregue em casa"}</span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 800, fontSize: 15 }} className="fa-mono">#{order.id}</span>
          <span className="fa-faint" style={{ fontSize: 12.5 }}>{order.date} · {count} {count === 1 ? "item" : "itens"}</span>
          {pickup && order.pickupCode ? <span className="fa-badge fa-badge-rx" style={{ width: "fit-content", marginTop: 8, fontSize: 11 }}><Icon name="bag" size={11} />Codigo {order.pickupCode}</span> : null}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "right" }}>
            <div className="fa-faint" style={{ fontSize: 12 }}>Total</div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{brl(total)}</div>
          </div>
          <button className="fa-iconbtn" onClick={() => setOpen(!open)} aria-label="detalhes" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}><Icon name="chevD" size={18} /></button>
        </div>
      </div>

      {open && (
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          {order.status !== "delivered"
            ? <div style={{ background: "var(--fa-rose-soft)", borderRadius: "var(--fa-r-card)", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13.5, color: "var(--fa-primary)", marginBottom: 12 }}><Icon name="truck" size={16} />Chega {order.eta}</div>
                <OrderTracker step={status.step} fulfillment={order.fulfillment} />
              </div>
            : <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--fa-success)", fontWeight: 600 }}><Icon name="check" size={16} stroke={2.4} />{order.eta}{pickup && order.store ? " · " + order.store : ""}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {order.items.map((item) => {
              const product = resolveOrderLineProduct(item, products);
              const lineTotal = resolveOrderLineTotal(item, product);
              return (
                <div key={item.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div className="fa-ph" data-cat={product.cat} style={{ width: 52, height: 52, aspectRatio: "auto", flex: "none", cursor: "pointer" }} onClick={() => product.id && onOpenProduct(product)}>
                    <Icon name={product.cat === "medicamentos" ? "pill" : product.cat === "perfumaria" ? "sparkle" : product.cat === "bem-estar" ? "leaf" : "heart"} size={22} style={{ color: "var(--fa-primary)", opacity: .5 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3 }}>{product.name}</div>
                    <div className="fa-faint" style={{ fontSize: 12 }}>{item.qty}x · {product.brand}{item.sub ? " · assinatura" : ""}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{brl(lineTotal)}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 12, fontSize: 12.5, color: "var(--fa-ink-2)", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="card" size={15} />{order.payment}</span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="pin" size={15} />{pickup && order.store ? order.store : order.address}</span>
            {pickup && order.pickupCode ? <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="bag" size={15} />Codigo {order.pickupCode}</span> : null}
          </div>
          {pickup && order.pickupCode ? <div className="fa-card" style={{ padding: "14px 16px", background: "var(--fa-info-soft)", border: "1px solid var(--fa-mist)", fontSize: 13.5, lineHeight: 1.5 }}><b style={{ display: "block", marginBottom: 4 }}>Use este código na retirada</b><span className="fa-mono" style={{ fontSize: 18, fontWeight: 800 }}>{order.pickupCode}</span><div className="fa-muted" style={{ marginTop: 6 }}>Informe esse código ao farmacêutico para validar a entrega no sistema.</div></div> : null}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="fa-btn fa-btn-primary" onClick={() => onReorder(order)}><Icon name="repeat" size={16} />Comprar novamente</button>
            {order.status !== "delivered" && <button className="fa-btn fa-btn-ghost" onClick={() => onTrackOrder && onTrackOrder(order)}><Icon name="pin" size={16} />{pickup ? "Acompanhar retirada" : "Acompanhar entrega"}</button>}
            <button className="fa-btn fa-btn-soft" onClick={() => onOpenSupport && onOpenSupport(order)}><Icon name="chat" size={16} />Falar com farmacêutico</button>
          </div>
        </div>
      )}
    </div>
  );
}

export { OrderCard, OrderTracker, faCashback, initials, resolveOrderLineProduct, resolveOrderLineTotal, resolveOrderStatusMeta };
