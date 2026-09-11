import React, { useState } from "react";
import { ModalShell, brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon as MpIcon } from "../../marketplace/core/marketplace-icons.jsx";
import { OC_STATUS, customerOf } from "../core/internal-shell.jsx";
import { QrPlaceholder, SendNotaModal } from "./point-of-sale-screen.jsx";
import { Icon, PageHead, Badge, StatCard, SearchInput, EmptyState, PillNav, SwitchToggle } from "../core/internal-ui.jsx";

/* FARMAURA Console — Vendas & Notas: registro unificado das vendas PAGAS
   (online + balcão/PDV) com emissão e consulta da nota fiscal (NFC-e).
   - Balcão: aparece quando a venda foi concluída (nota emitida no caixa).
   - Online: aparece quando o pagamento foi confirmado, mesmo sem entrega ainda.

   Nota: o "Ver nota" abre SaleNotaModal (migrado abaixo), que ainda reaproveita
   QrPlaceholder e SendNotaModal de point-of-sale-screen.jsx (Lote G, não migrado
   ainda) — são widgets pequenos (um SVG geométrico e um modal de envio por e-mail)
   sem outro dono natural nesta fase; ficam com o visual legado até o Balcão migrar. */

const PAY_LABELS = { cash: "Dinheiro", pix: "Pix", debit: "Débito", credit: "Crédito" };
const PAY_ICONS = { cash: "cash", pix: "pix", debit: "card", credit: "card" };
function methodLabel(p) { return PAY_LABELS[p] || p || "—"; }
function onlinePayLabel(s) { return (s || "").split("·")[0].trim(); }

function SalesScreen({ ctx }) {
  const { orders, pdvSales, customerByName = {}, storeFiscal = {}, pharmacistProfile = {}, sendFiscalDocumentEmail, notify } = ctx;
  const [chan, setChan] = useState("all");        // all | online | pdv
  const [showPending, setShowPending] = useState(false); // exibir pedidos aguardando pagamento
  const [q, setQ] = useState("");
  const [modalSale, setModalSale] = useState(null);

  // ---- normaliza vendas online ----
  const onlineSales = orders.map((o) => ({
    key: "o-" + o.id, source: "online", id: o.id,
    channelLabel: o.channel,
    customerName: o.customer, customerDoc: o.doc,
    when: o.placed, items: o.items, count: o.items.reduce((s, i) => s + i.qty, 0),
    total: o.total, payLabel: onlinePayLabel(o.payment),
    paid: /pago/i.test(o.payment),
    fulfillment: o.fulfillment, status: o.status,
    nfce: o.nfce || null,
    customerObj: customerOf(o.customer, customerByName) || { name: o.customer, email: "", phone: "", doc: o.doc },
  }));

  // ---- normaliza vendas de balcão (todas pagas/concluídas) ----
  const balcaoSales = pdvSales.map((s) => ({
    key: "p-" + s.numero, source: "pdv", id: "NFC-e " + s.numero,
    channelLabel: "Balcão",
    customerName: s.customer ? s.customer.name : "Consumidor não identificado",
    customerDoc: s.customer && s.cpfNota ? s.customer.doc : null,
    when: s.when, items: s.items, count: s.items.reduce((sum, i) => sum + i.qty, 0),
    total: s.total, payLabel: methodLabel(s.pay), payMethod: s.pay,
    paid: true, fulfillment: "balcao", status: "concluida",
    nfce: { numero: s.numero, chave: s.chave, serie: s.serie || "001", when: s.when },
    cashback: s.cashback, discVal: s.discVal, cpfNota: s.cpfNota,
    customerObj: s.customer || { name: "Consumidor não identificado", email: "", phone: "" },
  }));

  const everything = [...balcaoSales, ...onlineSales];
  const paidAll = everything.filter((s) => s.paid);

  // métricas (apenas vendas pagas)
  const faturamento = paidAll.reduce((sum, s) => sum + s.total, 0);
  const emitidas = paidAll.filter((s) => s.nfce).length;
  const aEmitir = paidAll.filter((s) => !s.nfce).length;
  const pendentes = onlineSales.filter((s) => !s.paid).length;

  // lista filtrada — só pagas por padrão
  let list = everything.filter((s) => s.paid || showPending);
  if (chan !== "all") list = list.filter((s) => s.source === chan);
  if (q.trim()) { const k = q.toLowerCase(); list = list.filter((s) => (s.customerName + " " + s.id + " " + (s.nfce ? s.nfce.numero : "")).toLowerCase().includes(k)); }

  const counts = {
    all: everything.filter((s) => s.paid || showPending).length,
    online: onlineSales.filter((s) => s.paid || showPending).length,
    pdv: balcaoSales.length,
  };

  const genNota = (sale) => {
    if (!sale.nfce) {
      notify && notify("A nota fiscal desta venda ainda está sendo processada. Atualize a página em instantes.", "warn");
      return;
    }
    setModalSale(sale);
  };

  const sitOf = (s) => s.source === "pdv"
    ? { label: "Venda concluída", tone: "good", icon: "check" }
    : (OC_STATUS[s.status] ? { label: OC_STATUS[s.status].label, tone: "neutral", icon: OC_STATUS[s.status].icon } : { label: "—", tone: "neutral", icon: "clock" });

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Clientes & vendas" title="Vendas & Notas" desc="Vendas pagas — online e balcão — com emissão e consulta de nota fiscal"
        actions={<SearchInput value={q} onChange={setQ} placeholder="Buscar venda, cliente ou nº da nota" />}
      />

      {/* Métricas — somente vendas pagas */}
      <div className="grid g-4" style={{ marginBottom: 20 }}>
        <StatCard icon="money" label="Faturamento pago" value={brl(faturamento)} />
        <StatCard icon="check" label="Vendas pagas" value={paidAll.length} tone="good" />
        <StatCard icon="receipt" label="Notas emitidas" value={emitidas} />
        <StatCard icon="printer" label="Notas a emitir" value={aEmitir} tone="warning" />
      </div>

      {/* Filtros por canal + alternar pendentes */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        <PillNav
          options={[
            { key: "all", label: `Todas (${counts.all})` },
            { key: "online", label: `Online (${counts.online})` },
            { key: "pdv", label: `Balcão (${counts.pdv})` },
          ]}
          active={chan} onChange={setChan}
        />
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <SwitchToggle on={showPending} onChange={setShowPending} />
          Mostrar aguardando pagamento{pendentes > 0 ? " (" + pendentes + ")" : ""}
        </label>
        <button className="btn btn-secondary btn-sm"><Icon name="download" size={15} />Exportar</button>
      </div>

      {/* Tabela de vendas */}
      <div className="card" style={{ overflow: "hidden" }}>
        {list.length === 0 ? (
          <EmptyState icon="receipt" title="Nenhuma venda neste filtro" desc="Só aparecem vendas pagas — balcão concluído e online com pagamento confirmado." />
        ) : list.map((s, i) => {
          const sit = sitOf(s);
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderTop: i ? "1px solid var(--border)" : "none" }}>
              <span className="stat-icon" style={{ width: 40, height: 40, flex: "none" }}><Icon name={s.source === "pdv" ? "cash" : (s.fulfillment === "pickup" ? "store" : "truck")} size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  <span style={{ flex: "0 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{s.customerName}</span>
                  <Badge tone={s.source === "pdv" ? "accent" : "neutral"}><Icon name={s.source === "pdv" ? "cash" : "bag"} size={10} />{s.source === "pdv" ? "Balcão" : s.channelLabel}</Badge>
                </div>
                <div className="cell-muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.id} · {s.count} {s.count === 1 ? "item" : "itens"} · {s.payLabel} · {s.when}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flex: "none" }}>
                {s.paid ? <Badge tone="good"><Icon name="check" size={11} />Pago · {s.payLabel}</Badge> : <Badge tone="warning"><Icon name="clock" size={11} />Aguardando pagamento</Badge>}
                <Badge tone={sit.tone}><Icon name={sit.icon} size={10} />{sit.label}</Badge>
              </div>
              <div style={{ width: 96, flex: "none", textAlign: "right", fontWeight: 800, fontSize: 15 }}>{brl(s.total)}</div>
              <div style={{ width: 132, flex: "none", display: "flex", justifyContent: "flex-end" }}>
                {!s.paid ? (
                  <Badge tone="neutral">Indisponível</Badge>
                ) : s.nfce ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => setModalSale(s)}><Icon name="receipt" size={14} />Ver nota</button>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => genNota(s)}><Icon name="clock" size={14} />Em processamento</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="cell-muted" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 7 }}>
        <Icon name="shield" size={13} />Apenas vendas com pagamento confirmado entram no registro fiscal · NFC-e {storeFiscal.cnpj}
      </div>

      {modalSale && <SaleNotaModal sale={modalSale} storeFiscal={storeFiscal} pharmacistProfile={pharmacistProfile} onSendEmail={sendFiscalDocumentEmail} onClose={() => setModalSale(null)} />}
    </div>
  );
}

/* ---------- Modal: visualizar / consultar a nota (NFC-e) de uma venda ---------- */
function SaleNotaModal({ sale, storeFiscal, pharmacistProfile, onSendEmail, onClose }) {
  const F = storeFiscal || {};
  const P = pharmacistProfile || {};
  const [sendOpen, setSendOpen] = useState(false);
  const n = sale.nfce;
  const tributos = Math.round(sale.total * 0.12 * 100) / 100;
  const chaveFmt = (n.chave || "").replace(/(\d{4})(?=\d)/g, "$1 ");
  const channelTag = sale.source === "pdv"
    ? "Balcão · venda no momento"
    : "Online · " + (sale.channelLabel || "") + (sale.fulfillment === "pickup" ? " · retirada" : " · entrega");
  const dest = sale.customerDoc || (sale.customerName && !/consumidor/i.test(sale.customerName) ? sale.customerName : "CONSUMIDOR");
  const sendNota = { id: n.id, numero: n.numero, total: sale.total, customer: sale.customerObj };

  return (
    <ModalShell open={true} onClose={onClose} maxw={460}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 12px", background: "var(--good-soft)", color: "var(--good)" }}><MpIcon name="receipt" size={27} /></span>
        <h2 style={{ fontWeight: 800, fontSize: 21, margin: 0 }}>Nota fiscal</h2>
        <p className="cell-muted" style={{ marginTop: 4 }}>NFC-e nº {n.numero} · autorizada</p>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 16, background: "var(--bg)" }}>
        <div style={{ textAlign: "center", borderBottom: "1px dashed var(--border)", paddingBottom: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{F.legal}</div>
          <div className="cell-muted">CNPJ {F.cnpj} · IE {F.ie}</div>
          <div className="cell-muted">{F.addr}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
          <span>NFC-e nº {n.numero}</span><span>Série {n.serie || "001"} · {n.when}</span>
        </div>
        <div className="cell-muted" style={{ marginBottom: 8 }}>{channelTag}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
          {sale.items.map((l, i) => (
            <div key={l.id || i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.qty}× {l.name}</span>
              {l.price != null && <span className="mono" style={{ flex: "none", marginLeft: 8 }}>{brl(l.price * l.qty)}</span>}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 10, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16 }}><span>TOTAL</span><span>{brl(sale.total)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }} className="cell-muted"><span>Pagamento</span><span>{sale.payLabel}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="cell-muted"><span>Trib. aprox. (Lei 12.741)</span><span>{brl(tributos)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="cell-muted"><span>Destinatário</span><span>{dest}</span></div>
          {sale.cashback > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "var(--brand)", fontWeight: 700 }} className="cell-muted"><span>Cashback creditado</span><span>+ {brl(sale.cashback)}</span></div>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", borderTop: "1px dashed var(--border)", marginTop: 10, paddingTop: 12 }}>
          <QrPlaceholder seed={parseInt(n.numero) % 200 + 5} size={84} />
          <div style={{ minWidth: 0 }}>
            <div className="cell-muted" style={{ fontWeight: 700 }}>Consulte pela chave de acesso:</div>
            <div className="mono" style={{ fontSize: 10.5, wordBreak: "break-all", lineHeight: 1.5, marginTop: 4 }}>{chaveFmt}</div>
          </div>
        </div>
        <div className="cell-muted" style={{ textAlign: "center", marginTop: 10 }}>Emitida por {P.name} · {P.crf}</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: "center" }} disabled={!n.printableUrl} onClick={() => n.printableUrl && window.open(n.printableUrl, "_blank", "noopener")}><Icon name="printer" size={16} />Imprimir</button>
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: "center" }} onClick={() => setSendOpen(true)}><Icon name="mail" size={16} />Enviar</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}><Icon name="check" size={16} />Fechar</button>
      </div>

      {sendOpen && <SendNotaModal nota={sendNota} onSend={onSendEmail} onClose={() => setSendOpen(false)} />}
    </ModalShell>
  );
}

export { PAY_ICONS, PAY_LABELS, SaleNotaModal, SalesScreen, methodLabel, onlinePayLabel };
