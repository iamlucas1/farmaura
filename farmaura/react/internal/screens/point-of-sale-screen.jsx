import React, { useEffect, useState } from "react";
import { ModalShell, QtyStepper, brl } from "../../marketplace/core/marketplace-components.jsx";
import { fetchViaCepAddress, formatCep } from "../../marketplace/core/marketplace-address.js";
import { resolveMarketplaceCoupon } from "../../marketplace/screens/cart-screen.jsx";
import { RecurringBadge } from "../core/internal-shell.jsx";
import { Icon, PageHead, Badge, PillNav, EmptyState, Field } from "../core/internal-ui.jsx";

/* FARMAURA Console — Balcão / PDV: venda no momento + emissão de nota fiscal (NFC-e).
   Visão compartilhada entre farmacêutico e caixa. */

/* QR-code estilizado (placeholder determinístico para a NFC-e) */
function QrPlaceholder({ seed = 7, size = 108 }) {
  const N = 21;
  const cells = [];
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (finder(r, c)) continue;
    if (rnd() > 0.52) cells.push(<rect key={r + "-" + c} x={c} y={r} width="1" height="1" fill="#1a1a1a" />);
  }
  const Finder = ({ x, y }) => (<g><rect x={x} y={y} width="7" height="7" fill="none" stroke="#1a1a1a" strokeWidth="1" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#1a1a1a" /></g>);
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" shapeRendering="crispEdges" style={{ background: "#fff", borderRadius: 8, border: "1px solid var(--border)" }}>
      {cells}<Finder x={0} y={0} /><Finder x={14} y={0} /><Finder x={0} y={14} />
    </svg>
  );
}

const PAY_METHODS = [
  { id: "cash", label: "Dinheiro", icon: "cash" },
  { id: "pix", label: "Pix", icon: "pix" },
  { id: "debit", label: "Débito", icon: "card" },
  { id: "credit", label: "Crédito", icon: "card" },
];

/* Máscara de CPF: 000.000.000-00 */
function maskCPF(v) {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
  return d;
}

/* Máscara de telefone: +DDI (DDD) XXXXX-XXXX, ex. +55 (61) 99811-2201 */
function maskPhone(v) {
  const withoutOwnPrefix = (v || "").replace(/^\+55\s*\(?/, "");
  let d = withoutOwnPrefix.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(-11);
  d = d.slice(0, 11);
  if (!d) return "";
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (d.length <= 2) return `+55 (${ddd}`;
  if (rest.length > 4) return `+55 (${ddd}) ${rest.slice(0, -4)}-${rest.slice(-4)}`;
  return `+55 (${ddd}) ${rest}`;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* Formata "YYYY-MM-DD" como "DD/MM" para exibição no card do cliente. */
function fmtBirthday(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  return match ? `${match[3]}/${match[2]}` : "";
}

/* Cores do selo de fidelidade — mesma paleta usada no CRM (crm-screen.jsx), para consistência visual. */
function tierTone(tier) {
  return { Ouro: "warning", Prata: "neutral", Bronze: "warning", Novo: "accent" }[tier] || "accent";
}

/* Estatística compacta do cliente no card do balcão (versão reduzida do CrmStat do CRM). */
function PdvCustomerStat({ label, value }) {
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "7px 8px" }}>
      <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>{value}</div>
      <div className="cell-muted" style={{ fontSize: 10.5, marginTop: 1 }}>{label}</div>
    </div>
  );
}

/* Rótulo de recência: "há X dias" / "ontem" / "hoje", igual ao usado no CRM. */
function recencyLabel(lastDays) {
  if (lastDays == null) return "";
  if (lastDays === 0) return "Comprou hoje";
  if (lastDays === 1) return "Última compra ontem";
  return `Última compra há ${lastDays} dias`;
}

/* Credita o cashback ganho e debita o cashback usado no cadastro do cliente. */
function creditCashback(customer, earned, ticket, applied) {
  if (!customer) return;
  customer.cashback = Math.round(Math.max(0, (customer.cashback || 0) - (applied || 0) + (earned || 0)) * 100) / 100;
  customer.orders = (customer.orders || 0) + 1;
  customer.totalSpent = Math.round(((customer.totalSpent || 0) + (ticket || 0)) * 100) / 100;
  customer.lastDays = 0;
}

/* Sugestões: o que o cliente mais compra de verdade (histórico real via /purchase-insights),
   casado com o estoque atual, para oferecer no balcão. */
function pdvSuggestions(insights, inventory, cart) {
  const inCart = new Set(cart.map((c) => c.id));
  const pool = [];
  const topProducts = (insights && insights.topProducts) || [];
  topProducts.forEach((tp) => {
    const key = tp.name.toLowerCase().split(" ")[0];
    const it = inventory.find((x) => x.name.toLowerCase().includes(key) && x.qty > 0);
    if (it && !pool.find((p) => p.it.id === it.id)) pool.push({ it, q: tp.totalQuantity });
  });
  if (pool.length < 3) {
    inventory.filter((x) => x.qty > 0).slice(0, 6).forEach((it) => { if (!pool.find((p) => p.it.id === it.id)) pool.push({ it, q: null }); });
  }
  return pool.filter((p) => !inCart.has(p.it.id)).slice(0, 4);
}

/* Cartão "escolha" (rádio estilizado) usado no tipo de retirada/entrega, forma de pagamento e no
   envio de nota por e-mail — substitui o .fa-choice do marketplace por um estilo próprio do kit. */
function ChoiceCard({ on, onClick, icon, title, sub, radio, style, children }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left", padding: 12,
        borderRadius: "var(--radius-lg)", border: "1.5px solid " + (on ? "var(--accent)" : "var(--border)"),
        background: on ? "var(--accent-soft)" : "var(--surface)", cursor: "pointer", ...style,
      }}
    >
      {radio && (
        <span style={{ width: 18, height: 18, borderRadius: 99, border: "2px solid " + (on ? "var(--accent)" : "var(--border-strong)"), flex: "none", display: "grid", placeItems: "center" }}>
          {on && <span style={{ width: 9, height: 9, borderRadius: 99, background: "var(--accent)" }} />}
        </span>
      )}
      {icon && <span className="stat-icon" style={{ width: 34, height: 34, flex: "none" }}><Icon name={icon} size={17} /></span>}
      {children || (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div>
          {sub && <div className="cell-muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
        </div>
      )}
    </button>
  );
}

/* Painel de sugestões (visão do farmacêutico) */
function PdvUpsell({ customer, insights, inventory, cart, onAdd }) {
  const sugg = pdvSuggestions(insights, inventory, cart);
  return (
    <div className="card card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span className="stat-icon" style={{ width: 32, height: 32 }}><Icon name="sparkle" size={16} /></span>
        <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>{customer ? "O cliente costuma comprar" : "Para oferecer"}</span>
      </div>
      <div className="cell-muted" style={{ marginBottom: 12 }}>{customer ? "Sugira na hora — itens recorrentes de " + customer.name.split(" ")[0] : "Identifique o cliente para sugestões personalizadas · mais vendidos da loja"}</div>
      {sugg.length === 0 ? (
        <div className="cell-muted">Sem sugestões no momento.</div>
      ) : sugg.map((s, i) => (
        <div key={s.it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
          <span className="stat-icon" style={{ width: 36, height: 36, flex: "none" }}><Icon name="pill" size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.it.name}</div>
            <div className="cell-muted">{brl(s.it.price)}{s.q ? " · comprou " + s.q + "×" : " · mais vendido"}</div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ flex: "none" }} onClick={() => onAdd(s.it.id)}><Icon name="plus" size={14} />Oferecer</button>
        </div>
      ))}
    </div>
  );
}

/* Painel de retirada na loja ou entrega — escolhe um endereço já salvo do cliente ou cadastra um novo
   (mesmo padrão de CEP/cobertura do checkout do marketplace), em vez de digitar o CEP a cada venda. */
function PdvFulfillmentPicker({ delivery, setDelivery, checkPdvDeliveryCoverage, savedAddresses = [], onSaveAddress }) {
  const type = delivery.fulfillmentType || "pickup";
  const [cepStatus, setCepStatus] = useState({ loading: false, hint: "", error: "" });
  const [coverage, setCoverage] = useState({ configured: false, covered: true });
  const [mode, setMode] = useState(savedAddresses.length ? "pick" : "new"); // pick | new
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [saveNewAddress, setSaveNewAddress] = useState(true);
  const [savingAddress, setSavingAddress] = useState(false);
  const lastCepRef = React.useRef("");
  const knownAddressIdsRef = React.useRef(new Set());

  // Quando os endereços salvos do cliente chegam (identificação concluída), volta para o modo de escolha.
  useEffect(() => {
    knownAddressIdsRef.current = new Set(savedAddresses.map((a) => a.id));
    if (savedAddresses.length === 0) { setMode("new"); return; }
    setMode("pick");
    setSelectedAddressId("");
  }, [savedAddresses]);

  const pickAddress = (address) => {
    setSelectedAddressId(address.id);
    setDelivery({
      ...delivery,
      fulfillmentType: "delivery",
      addressId: address.id,
      postalCode: address.postalCode,
      addressLine: address.addressLine,
      addressNumber: "",
      district: address.district,
      city: address.city,
      stateCode: address.stateCode,
      recipientName: address.recipientName || delivery.recipientName || "",
      recipientPhone: address.recipientPhone || "",
      referenceNote: address.referenceNote || "",
    });
  };

  const startNewAddress = () => {
    setSelectedAddressId("");
    setMode("new");
    lastCepRef.current = "";
    setDelivery({ ...delivery, fulfillmentType: "delivery", addressId: "", postalCode: "", addressLine: "", addressNumber: "", district: "", city: "", stateCode: "" });
  };

  useEffect(() => {
    const digits = String(delivery.postalCode || "").replace(/\D/g, "");
    if (digits.length !== 8 || type !== "delivery" || mode !== "new" || digits === lastCepRef.current) return;
    let active = true;
    (async () => {
      setCepStatus({ loading: true, hint: "", error: "" });
      try {
        const result = await fetchViaCepAddress(delivery.postalCode);
        if (!active) return;
        lastCepRef.current = digits;
        const next = { ...delivery, postalCode: result.cep, addressLine: result.street || delivery.addressLine, district: result.district || delivery.district, city: result.city || delivery.city, stateCode: result.state || delivery.stateCode };
        setDelivery(next);
        setCepStatus({ loading: false, hint: "Endereço preenchido automaticamente pelo CEP.", error: "" });
        const found = checkPdvDeliveryCoverage ? await checkPdvDeliveryCoverage({ district: next.district, city: next.city, stateCode: next.stateCode, postalCode: next.postalCode }) : { configured: false, covered: true };
        if (active) setCoverage(found);
      } catch (error) {
        if (active) setCepStatus({ loading: false, hint: "", error: error && error.message ? error.message : "Não foi possível buscar o CEP." });
      }
    })();
    return () => { active = false; };
  }, [delivery.postalCode, type, mode]);

  const blocked = coverage.configured && !coverage.covered;

  const handleSaveAddress = async () => {
    if (!onSaveAddress) return;
    setSavingAddress(true);
    try {
      const updated = await onSaveAddress({ ...delivery, isPrimary: savedAddresses.length === 0 });
      if (updated) {
        const created = updated.find((a) => !knownAddressIdsRef.current.has(a.id)) || updated[updated.length - 1];
        if (created) { pickAddress(created); setMode("pick"); }
      }
    } finally {
      setSavingAddress(false);
    }
  };

  return (
    <div className="card card-pad">
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Retirada ou entrega</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: type === "delivery" ? 12 : 0 }}>
        <ChoiceCard on={type === "pickup"} icon="bag" title="Retirar na loja" onClick={() => setDelivery({ ...delivery, fulfillmentType: "pickup" })} style={{ flexDirection: "column", textAlign: "center", justifyContent: "center" }} />
        <ChoiceCard on={type === "delivery"} icon="truck" title="Entregar" onClick={() => setDelivery({ ...delivery, fulfillmentType: "delivery" })} style={{ flexDirection: "column", textAlign: "center", justifyContent: "center" }} />
      </div>

      {type === "delivery" && mode === "pick" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {savedAddresses.map((address) => (
              <ChoiceCard key={address.id} on={selectedAddressId === address.id} onClick={() => pickAddress(address)} icon="pin">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    {address.label}
                    {address.isPrimary && <Badge tone="neutral">Principal</Badge>}
                  </div>
                  <div className="cell-muted">{[address.addressLine, address.district, address.city].filter(Boolean).join(" · ")}</div>
                </div>
              </ChoiceCard>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={startNewAddress}><Icon name="plus" size={14} />Adicionar novo endereço</button>
          {selectedAddressId && (
            <div style={{ marginTop: 10 }}><Field label="Nome de quem recebe"><input className="input" value={delivery.recipientName || ""} onChange={(e) => setDelivery({ ...delivery, recipientName: e.target.value })} /></Field></div>
          )}
          {blocked && <div style={{ fontSize: 12, marginTop: 4, color: "var(--critical)" }}>Fora da área de entrega — escolha retirar na loja.</div>}
        </>
      )}

      {type === "delivery" && mode === "new" && (
        <>
          {savedAddresses.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }} onClick={() => setMode("pick")}><Icon name="chevL" size={14} />Usar um endereço salvo</button>
          )}
          <div style={{ marginBottom: 8 }}>
            <Field label="CEP">
              <input className="input mono" inputMode="numeric" maxLength={9} placeholder="00000-000" value={delivery.postalCode || ""} onChange={(e) => setDelivery({ ...delivery, postalCode: formatCep(e.target.value) })} />
            </Field>
            {cepStatus.loading && <div className="cell-muted" style={{ marginTop: 4 }}>Buscando endereço...</div>}
            {cepStatus.error && <div style={{ fontSize: 12, marginTop: 4, color: "var(--critical)" }}>{cepStatus.error}</div>}
            {blocked && <div style={{ fontSize: 12, marginTop: 4, color: "var(--critical)" }}>Fora da área de entrega — escolha retirar na loja.</div>}
          </div>
          <div style={{ marginBottom: 8 }}>
            <Field label="Endereço"><input className="input" placeholder="Rua, número" value={delivery.addressLine || ""} onChange={(e) => setDelivery({ ...delivery, addressLine: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <Field label="Número"><input className="input" value={delivery.addressNumber || ""} onChange={(e) => setDelivery({ ...delivery, addressNumber: e.target.value })} /></Field>
            <Field label="Bairro"><input className="input" value={delivery.district || ""} onChange={(e) => setDelivery({ ...delivery, district: e.target.value })} /></Field>
          </div>
          <div style={{ marginBottom: 8 }}><Field label="Nome de quem recebe"><input className="input" value={delivery.recipientName || ""} onChange={(e) => setDelivery({ ...delivery, recipientName: e.target.value })} /></Field></div>
          {onSaveAddress && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 10 }} onClick={() => setSaveNewAddress((v) => !v)}>
                <span style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", background: saveNewAddress ? "var(--accent)" : "transparent", borderColor: saveNewAddress ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>{saveNewAddress && <Icon name="check" size={12} />}</span>
                Salvar este endereço para o cliente
              </label>
              {saveNewAddress && (
                <button className="btn btn-primary btn-sm" style={{ width: "100%", justifyContent: "center" }} disabled={savingAddress || !delivery.addressLine} onClick={handleSaveAddress}>
                  <Icon name="check" size={14} />{savingAddress ? "Salvando…" : "Salvar endereço"}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* Painel de recorrência: produtos comprados em vários meses seguidos — sugere configurar recorrência. */
function PdvRecurrenceSuggestions({ candidates, onConfigure }) {
  if (!candidates || candidates.length === 0) return null;
  return (
    <div className="card card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span className="stat-icon" style={{ width: 32, height: 32 }}><Icon name="repeat" size={16} /></span>
        <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Sugestão de recorrência</span>
      </div>
      <div className="cell-muted" style={{ marginBottom: 12 }}>O cliente comprou nos últimos meses seguidos — ofereça recorrência com desconto.</div>
      {candidates.map((c, i) => (
        <div key={c.productKey} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
          <span className="stat-icon" style={{ width: 36, height: 36, flex: "none" }}><Icon name="repeat" size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
            <div className="cell-muted">{c.consecutiveMonths} meses seguidos · {brl(c.lastUnitPrice)} · {c.suggestedDiscountPercent}% de desconto</div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ flex: "none" }} onClick={() => onConfigure && onConfigure(c)}><Icon name="repeat" size={14} />Configurar</button>
        </div>
      ))}
    </div>
  );
}

/* Tela de seleção de paciente — gate compartilhado: o farmacêutico usa para INICIAR o
   atendimento e o caixa para abrir a venda. Mesma tela nos dois papéis. */
function PdvCaixaGate({ operator, onIdentify, onConsumer }) {
  const isPharm = operator === "pharm";
  return (
    <div className="card" style={{ padding: "56px 24px", textAlign: "center" }}>
      <span className="stat-icon" style={{ width: 76, height: 76, margin: "0 auto 18px" }}><Icon name="user" size={36} /></span>
      <h2 style={{ fontWeight: 800, fontSize: 24, margin: 0 }}>Selecione o paciente</h2>
      <p className="page-desc" style={{ marginTop: 8, maxWidth: 420, marginInline: "auto" }}>{isPharm
        ? "Para iniciar o atendimento, identifique primeiro o paciente. O contador do atendimento começa assim que ele é identificado."
        : "Para abrir a venda no caixa, identifique primeiro o paciente. Depois você adiciona os produtos e finaliza com a nota fiscal."}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, margin: "24px auto 0" }}>
        <button className="btn btn-primary btn-lg" style={{ justifyContent: "center" }} onClick={onIdentify}><Icon name="user" size={18} />Identificar paciente</button>
        <button className="btn btn-ghost" style={{ whiteSpace: "normal", lineHeight: 1.3, textAlign: "center", height: "auto", padding: "12px 0", justifyContent: "center" }} onClick={onConsumer}>Continuar como consumidor não identificado</button>
      </div>
      <div className="cell-muted" style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="shield" size={13} />A identificação garante o histórico e o CPF correto na nota.</div>
    </div>
  );
}

/* Lista de atendimentos em andamento do farmacêutico atual — autosalvos no servidor, recuperáveis
   após um reload da página ou uma queda de sessão. RLS garante que cada farmacêutico só veja os seus. */
function PdvDraftRecoveryList({ drafts, onRecover, onDiscard }) {
  if (!drafts || drafts.length === 0) return null;
  return (
    <div className="card card-pad" style={{ marginBottom: 16, textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span className="stat-icon" style={{ width: 32, height: 32 }}><Icon name="clock" size={16} /></span>
        <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Atendimentos em andamento</span>
        <Badge tone="neutral">{drafts.length}</Badge>
      </div>
      <div className="cell-muted" style={{ marginBottom: 12 }}>Salvos automaticamente — recupere de onde parou.</div>
      {drafts.map((draft, i) => {
        const count = (draft.items || []).reduce((s, l) => s + l.qty, 0);
        const name = draft.customer ? draft.customer.name : "Consumidor não identificado";
        return (
          <div key={draft.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <span className="avatar" style={{ width: 38, height: 38, flex: "none" }}>{draft.customer ? (draft.customer.avatar || name[0]) : <Icon name="user" size={17} />}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{name}</div>
              <div className="cell-muted">{count} {count === 1 ? "item" : "itens"} · salvo às {draft.updatedAtLabel || "—"}</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ flex: "none" }} onClick={() => onDiscard(draft)}><Icon name="trash" size={14} />Descartar</button>
            <button className="btn btn-primary btn-sm" style={{ flex: "none" }} onClick={() => onRecover(draft)}><Icon name="repeat" size={14} />Recuperar</button>
          </div>
        );
      })}
    </div>
  );
}

/* Tela do CAIXA — fila de pedidos enviados pelo farmacêutico.
   No caixa, só aparecem os clientes que têm um pedido enviado para cá. */
function PdvCaixaQueue({ queue, onClaim, onPharm, customerByName }) {
  const enrich = (entry) => {
    const lines = entry.items || [];
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const disc = subtotal * ((entry.discount || 0) / 100);
    return { lines, count, subtotal, total: Math.max(0, subtotal - disc), hasControlled: lines.some((l) => l.controlled) };
  };
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
        <span className="stat-icon" style={{ width: 36, height: 36 }}><Icon name="repeat" size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15.5 }}>Pedidos enviados pelo farmacêutico</div>
          <div className="cell-muted">Selecione o cliente para receber o pagamento e emitir a nota</div>
        </div>
        <Badge tone="neutral">{queue.length} na fila</Badge>
      </div>

      {queue.length === 0 ? (
        <div style={{ padding: "52px 24px" }}>
          <EmptyState icon="cash" title="Nenhum pedido na fila do caixa" desc="O caixa só atende clientes com um pedido enviado pelo farmacêutico. Monte um pedido na visão do farmacêutico e toque em “Enviar para o caixa”." />
          <div style={{ textAlign: "center" }}><button className="btn btn-secondary btn-sm" onClick={onPharm}><Icon name="rx" size={14} />Ir para a visão do farmacêutico</button></div>
        </div>
      ) : queue.map((entry, i) => {
        const e = enrich(entry);
        const cust = entry.customer;
        return (
          <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <span className="avatar" style={{ width: 44, height: 44, flex: "none" }}>{cust ? (cust.avatar || cust.name[0]) : <Icon name="user" size={19} />}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
                {cust ? cust.name : "Consumidor não identificado"}
                {cust && cust.recurring && <RecurringBadge name={cust.name} small customerByName={customerByName} />}
                {e.hasControlled && <Badge tone="critical"><Icon name="lock" size={10} />Tarja</Badge>}
              </div>
              <div className="cell-muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {e.count} {e.count === 1 ? "item" : "itens"} · {e.lines.map((l) => l.name.split(" —")[0]).slice(0, 2).join(", ")}{e.lines.length > 2 ? " +" + (e.lines.length - 2) : ""} · enviado {entry.sentAt}
              </div>
            </div>
            <div style={{ textAlign: "right", flex: "none", marginRight: 4 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{brl(e.total)}</div>
              {entry.discount > 0 && <div className="cell-muted" style={{ color: "var(--good)" }}>−{entry.discount}%</div>}
            </div>
            <button className="btn btn-primary btn-sm" style={{ flex: "none" }} onClick={() => onClaim(entry)}><Icon name="cash" size={14} />Receber</button>
          </div>
        );
      })}
    </div>
  );
}

/* Formata segundos como MM:SS (contador do atendimento) */
function fmtAtendimento(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}

/* Selo de status de validação de receita por linha do carrinho */
const PRESCRIPTION_STATUS_META = {
  missing: { label: "Sem receita", tone: "critical", icon: "alert" },
  pending: { label: "Receita pendente", tone: "warning", icon: "clock" },
  approved: { label: "Receita validada", tone: "good", icon: "check" },
  rejected: { label: "Receita recusada", tone: "critical", icon: "close" },
};

function PdvScreen({ ctx }) {
  const { inventory, coupons = [], pdvCart, setPdvCart, pdvCustomer, setPdvCustomer, pdvAdd, pdvSetQty, pdvRemove, pdvClear, pdvSetLocation, fetchPdvItemLocations, pdvSearchProducts, pdvCreateReservation, fetchPdvPrescriptionStatus, createPdvPrescription, fetchCustomerPurchaseInsights, fetchCustomerPaymentMethods, fetchCustomerAddresses, createPdvCustomerAddress, confirmPdvRecurrence, checkPdvDeliveryCoverage, fetchPdvDiscountLimit, fetchPdvDrafts, autosavePdvDraft, deletePdvDraft, finalizeSale, pdvQueue, pdvSendToCashier, pdvClaimFromQueue, recordSale, customers = [], customerByName = {}, storeFiscal = {}, pharmacistProfile = {}, notify, sendFiscalDocumentEmail, createPdvCustomer } = ctx;
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [expandedResultId, setExpandedResultId] = useState(null);
  const [pay, setPay] = useState("pix");
  const [discount, setDiscount] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [cpfNota, setCpfNota] = useState(true);
  const [operator, setOperator] = useState("pharm");
  const [caixaReady, setCaixaReady] = useState(false); // paciente confirmado — atendimento iniciado
  const [idOpen, setIdOpen] = useState(false);
  const [nota, setNota] = useState(null);
  const [sentModal, setSentModal] = useState(false); // confirmação de envio ao caixa
  const [cashWanted, setCashWanted] = useState(0); // cashback que o cliente quer aplicar
  const [startedAt, setStartedAt] = useState(null); // início do atendimento (ms)
  const [elapsed, setElapsed] = useState(0); // segundos decorridos
  const [insights, setInsights] = useState({ topProducts: [], recurrenceCandidates: [] });
  const [discountLimit, setDiscountLimit] = useState(100); // % máximo permitido pela margem mínima + cashback do cliente
  const [recurrenceCandidate, setRecurrenceCandidate] = useState(null); // candidato aberto no modal de configuração
  const [delivery, setDelivery] = useState({ fulfillmentType: "pickup" }); // retirada na loja ou entrega
  const [savedAddresses, setSavedAddresses] = useState([]); // endereços salvos do cliente identificado
  const [draftId, setDraftId] = useState(null); // id do rascunho autosalvo no servidor deste atendimento
  const [drafts, setDrafts] = useState([]); // atendimentos em andamento recuperáveis (deste farmacêutico)
  const [prescriptionStatus, setPrescriptionStatus] = useState({}); // por inventoryItemId: { status, deliveryMethod, prescriptionId }
  const [prescriptionTarget, setPrescriptionTarget] = useState(null); // linha do carrinho aberta no modal de validação de receita
  const [itemLocations, setItemLocations] = useState({}); // por inventoryItemId: [{ locationId, locationCode, locationName, locationType, qty }]

  // Para cada item novo no carrinho, busca de onde ele pode ser retirado (prateleira/estoque/gôndola)
  // e pré-seleciona o primeiro local — o operador continua livre para trocar antes de enviar ao caixa.
  useEffect(() => {
    const missingIds = pdvCart.filter((line) => line.id && !(line.id in itemLocations)).map((line) => line.id);
    if (!missingIds.length || !fetchPdvItemLocations) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(missingIds.map(async (id) => [id, await fetchPdvItemLocations(id)]));
      if (cancelled) return;
      setItemLocations((prev) => {
        const next = { ...prev };
        for (const [id, locations] of entries) next[id] = locations;
        return next;
      });
      for (const [id, locations] of entries) {
        if (locations.length === 1) {
          const line = pdvCart.find((entry) => entry.id === id);
          if (line && !line.locationId) pdvSetLocation(id, locations[0].locationId, locations[0].locationCode);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdvCart.map((line) => line.id).join(",")]);

  // Busca de produtos no servidor (com debounce), agrupados por loja.
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); setExpandedResultId(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const found = pdvSearchProducts ? await pdvSearchProducts(term) : [];
      if (!cancelled) setResults(found);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  // Carrega o histórico real de compra (top produtos + recorrência) assim que o cliente é identificado.
  useEffect(() => {
    let cancelled = false;
    if (!pdvCustomer || !pdvCustomer.id) { setInsights({ topProducts: [], recurrenceCandidates: [] }); return; }
    (async () => {
      const found = fetchCustomerPurchaseInsights ? await fetchCustomerPurchaseInsights(pdvCustomer.id) : { topProducts: [], recurrenceCandidates: [] };
      if (!cancelled) setInsights(found);
    })();
    return () => { cancelled = true; };
  }, [pdvCustomer && pdvCustomer.id]);

  // Carrega os endereços salvos do cliente assim que ele é identificado — evita digitar o CEP de novo a cada venda.
  useEffect(() => {
    let cancelled = false;
    if (!pdvCustomer || !pdvCustomer.id) { setSavedAddresses([]); return; }
    (async () => {
      const found = fetchCustomerAddresses ? await fetchCustomerAddresses(pdvCustomer.id) : [];
      if (!cancelled) setSavedAddresses(found);
    })();
    return () => { cancelled = true; };
  }, [pdvCustomer && pdvCustomer.id]);

  const saveCustomerAddress = async (address) => {
    if (!pdvCustomer || !pdvCustomer.id || !createPdvCustomerAddress) return null;
    const updated = await createPdvCustomerAddress(pdvCustomer.id, address);
    if (updated) setSavedAddresses(updated);
    return updated;
  };

  // Carrega a lista de atendimentos em andamento (autosalvos) sempre que o farmacêutico volta para a tela de seleção de paciente.
  useEffect(() => {
    if (operator !== "pharm" || pdvCustomer || caixaReady) return;
    let cancelled = false;
    (async () => {
      const found = fetchPdvDrafts ? await fetchPdvDrafts() : [];
      if (!cancelled) setDrafts(found);
    })();
    return () => { cancelled = true; };
  }, [operator, pdvCustomer, caixaReady]);

  // Autosalva o atendimento em andamento (farmacêutico, com cliente identificado), com debounce de 2s a cada mudança relevante.
  useEffect(() => {
    if (operator !== "pharm" || !pdvCustomer || nota) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const savedId = autosavePdvDraft ? await autosavePdvDraft({
        id: draftId, customer: pdvCustomer, items: pdvCart, discount, cashWanted, pay, cpfNota, delivery, startedAt, operator,
      }) : null;
      if (!cancelled && savedId) setDraftId(savedId);
    }, 2000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [operator, pdvCustomer, pdvCart, discount, cashWanted, pay, cpfNota, delivery, nota]);

  // Recupera um atendimento em andamento salvo anteriormente (após reload ou queda de sessão).
  const recoverDraft = (draft) => {
    setDraftId(draft.id);
    setPdvCustomer(draft.customer || null);
    setPdvCart(draft.items || []);
    setDiscount(draft.discount || 0);
    setCashWanted(draft.cashWanted || 0);
    setPay(draft.pay || "pix");
    setCpfNota(draft.cpfNota !== false);
    setDelivery(draft.delivery || { fulfillmentType: "pickup" });
    setStartedAt(draft.startedAt || Date.now());
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
  };

  // Descarte de um atendimento em andamento — pede confirmação antes de excluir.
  const [discardTarget, setDiscardTarget] = useState(null);
  const confirmDiscardDraft = async () => {
    const draft = discardTarget;
    if (!draft) return;
    setDiscardTarget(null);
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    if (deletePdvDraft) await deletePdvDraft(draft.id);
  };

  // Consulta (com debounce) o desconto máximo que o carrinho atual comporta sem furar a margem mínima do produto,
  // já reservando espaço para o cashback disponível do cliente — reduz automaticamente o desconto já escolhido se ele ultrapassar o novo teto.
  useEffect(() => {
    const cartLines = pdvCart.filter((l) => l.id);
    if (!cartLines.length) { setDiscountLimit(100); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const result = fetchPdvDiscountLimit ? await fetchPdvDiscountLimit({ items: cartLines, customerId: pdvCustomer && pdvCustomer.id }) : { maxDiscountPercent: 100 };
      if (cancelled) return;
      setDiscountLimit(result.maxDiscountPercent);
      setDiscount((current) => Math.min(current, result.maxDiscountPercent));
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pdvCart, pdvCustomer && pdvCustomer.id]);

  // Consulta o estado de validação de receita de cada item controlado do carrinho (sem receita / pendente / validada / recusada).
  useEffect(() => {
    const controlledIds = pdvCart.filter((l) => l.id && l.controlled).map((l) => l.id);
    if (!pdvCustomer || !pdvCustomer.id || !controlledIds.length) { setPrescriptionStatus({}); return; }
    let cancelled = false;
    (async () => {
      const items = fetchPdvPrescriptionStatus ? await fetchPdvPrescriptionStatus(pdvCustomer.id, controlledIds) : [];
      if (cancelled) return;
      const map = {};
      items.forEach((item) => { map[item.inventoryItemId] = item; });
      setPrescriptionStatus(map);
    })();
    return () => { cancelled = true; };
  }, [pdvCart, pdvCustomer && pdvCustomer.id]);

  // O contador inicia assim que o paciente é identificado (atendimento iniciado).
  useEffect(() => {
    if ((caixaReady || pdvCustomer) && !startedAt) setStartedAt(Date.now());
  }, [caixaReady, pdvCustomer]);
  // Tique de 1s enquanto o atendimento está em andamento (congela ao emitir a nota).
  useEffect(() => {
    if (!startedAt || nota) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt, nota]);

  // Reinicia o atendimento e volta para a tela de seleção de paciente.
  const resetAtendimento = () => {
    if (draftId && deletePdvDraft) deletePdvDraft(draftId);
    pdvClear(); setPdvCustomer(null); setDiscount(0); setDiscountLimit(100); setCashWanted(0);
    setAppliedCoupon(null); setCouponCode(""); setCouponError("");
    setCaixaReady(false); setStartedAt(null); setElapsed(0); setDelivery({ fulfillmentType: "pickup" });
    setDraftId(null);
  };

  // Volta para a tela de seleção de paciente sem perder o atendimento — ele continua salvo (autosave)
  // e aparece na lista de "Atendimentos em andamento" para ser recuperado depois.
  const pauseAtendimento = async () => {
    if (pdvCustomer && autosavePdvDraft) {
      const savedId = await autosavePdvDraft({ id: draftId, customer: pdvCustomer, items: pdvCart, discount, cashWanted, pay, cpfNota, delivery, startedAt, operator });
      if (savedId) setDraftId(savedId);
    }
    pdvClear(); setPdvCustomer(null); setDiscount(0); setDiscountLimit(100); setCashWanted(0);
    setAppliedCoupon(null); setCouponCode(""); setCouponError("");
    setCaixaReady(false); setStartedAt(null); setElapsed(0); setDelivery({ fulfillmentType: "pickup" });
    setDraftId(null);
  };

  // Trocar de papel zera a sessão: cada estação (farmacêutico / caixa) começa do seu próprio ponto de entrada.
  const switchOperator = (role) => { if (role === operator) return; resetAtendimento(); setNota(null); setSentModal(false); setOperator(role); };

  // linhas do carrinho (já vêm com nome/preço/loja resolvidos no momento em que foram adicionadas)
  const lines = pdvCart.filter((l) => l.id);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);

  /* Aplica um cupom ao carrinho — apenas preview local; o backend revalida tudo ao enviar ao caixa. */
  const applyCoupon = () => {
    const result = resolveMarketplaceCoupon(coupons, inventory, lines.map((l) => ({ id: l.id, qty: l.qty })), couponCode, [], null);
    if (result.ok) {
      setAppliedCoupon(result.coupon);
      setCouponError("");
      setDiscount(0);
    } else {
      setAppliedCoupon(null);
      setCouponError(result.message || "Cupom inválido.");
    }
  };
  const removeCoupon = () => { setAppliedCoupon(null); setCouponCode(""); setCouponError(""); };

  const manualDiscVal = subtotal * (discount / 100);
  const discVal = appliedCoupon ? appliedCoupon.discountAmount : manualDiscVal;
  const afterDisc = Math.max(0, subtotal - discVal);
  const cashAvailable = pdvCustomer ? (pdvCustomer.cashback || 0) : 0;
  const cashApplied = Math.max(0, Math.min(cashWanted, cashAvailable, afterDisc));
  const total = Math.max(0, afterDisc - cashApplied);
  const hasControlled = lines.some((l) => l.controlled);

  // Adiciona um componente de loja específico ao carrinho.
  const addComponent = (component) => { pdvAdd(component); setQ(""); setResults([]); setExpandedResultId(null); };

  // Reserva de produto disponível em outra loja — o cliente retira lá, não entra no carrinho desta venda.
  const [reservationTarget, setReservationTarget] = useState(null); // componente de outra loja escolhido para reservar
  const [reservationConfirmed, setReservationConfirmed] = useState(null); // confirmação após reservar com sucesso
  const [reservationQty, setReservationQty] = useState(1);
  const [reservationBusy, setReservationBusy] = useState(false);
  const openReservation = (component) => { setReservationTarget(component); setReservationQty(1); setQ(""); setResults([]); setExpandedResultId(null); };
  const confirmReservation = async () => {
    if (!reservationTarget || !pdvCreateReservation) return;
    setReservationBusy(true);
    const result = await pdvCreateReservation({
      inventoryItemId: reservationTarget.id, storeId: reservationTarget.storeId, quantity: reservationQty, customer: pdvCustomer,
    });
    setReservationBusy(false);
    if (!result) return;
    setReservationTarget(null);
    setReservationConfirmed({ ...result, productName: reservationTarget.name });
  };

  const emit = async () => {
    try {
      const synced = recordSale && await recordSale({ pay, items: lines, customer: pdvCustomer, cpfNota, cashApplied, discVal });
      if (!synced) {
        notify && notify("Não foi possível emitir a nota fiscal agora. Tente novamente.", "warn");
        return;
      }
      // O servidor é a fonte da verdade para o cashback — aplica o saldo resultante no cliente em tela.
      if (pdvCustomer) creditCashback(pdvCustomer, synced.cashback, total, synced.cashApplied);
      setNota({ ...synced, cpfNota, discVal });
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível concluir a venda.", "warn");
    }
  };

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Atendimento" title="Balcão · Venda no momento"
        desc={operator === "pharm" ? "Visão do farmacêutico — monte o pedido e oriente o cliente" : "Visão do caixa — receba o pagamento e emita a nota"}
        actions={<PillNav options={[{ key: "pharm", label: "Farmacêutico" }, { key: "caixa", label: "Caixa" }]} active={operator} onChange={switchOperator} />}
      />

      {/* Aviso do papel atual */}
      <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 16px", borderRadius: "var(--radius-lg)", marginBottom: 18, color: "#fff", background: operator === "pharm" ? "var(--brand)" : "var(--text-primary)" }}>
        <span style={{ width: 38, height: 38, borderRadius: "var(--radius-md)", background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center", flex: "none" }}><Icon name={operator === "pharm" ? "rx" : "cash"} size={19} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{operator === "pharm" ? "Você está como Farmacêutico" : "Você está como Caixa"}</div>
          <div style={{ fontSize: 12.5, opacity: 0.9 }}>{operator === "pharm" ? "Identifique o cliente, insira os medicamentos e ofereça o que ele costuma comprar." : "Selecione um pedido enviado pelo farmacêutico, confira os itens e emita a nota fiscal."}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
          {operator === "pharm" && pdvCustomer && (
            <button className="btn btn-sm" style={{ background: "rgba(255,255,255,.18)", color: "#fff", border: "none" }} onClick={pauseAtendimento}>
              <Icon name="chevL" size={14} />Voltar para seleção
            </button>
          )}
          {startedAt && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: "var(--radius-pill)", background: nota ? "rgba(255,255,255,.32)" : "rgba(255,255,255,.22)", fontWeight: 800, fontSize: 14 }} title="Tempo de atendimento">
              <Icon name="clock" size={14} />
              <span className="mono">{fmtAtendimento(elapsed)}</span>
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: "var(--radius-pill)", background: "rgba(255,255,255,.2)", fontSize: 11, fontWeight: 700 }}><Icon name="repeat" size={11} />Pedido compartilhado</span>
        </div>
      </div>

      {(operator === "caixa" ? !caixaReady : (!pdvCustomer && !caixaReady)) ? (
        operator === "caixa"
          ? <PdvCaixaQueue queue={pdvQueue} onClaim={(entry) => { pdvClaimFromQueue(entry.id); setDiscount(entry.discount || 0); setCaixaReady(true); }} onPharm={() => switchOperator("pharm")} customerByName={customerByName} />
          : (
            <>
              <PdvDraftRecoveryList drafts={drafts} onRecover={recoverDraft} onDiscard={setDiscardTarget} />
              <PdvCaixaGate operator={operator} onIdentify={() => setIdOpen(true)} onConsumer={() => setCaixaReady(true)} />
            </>
          )
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 18, alignItems: "start" }}>
        {/* Coluna: busca + itens */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "2px solid var(--accent)", borderRadius: "var(--radius-lg)", padding: "0 14px", height: 60, boxShadow: "0 0 0 4px var(--accent-soft)" }}>
              <Icon name="scan" size={20} style={{ color: "var(--brand)" }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto, marca ou EAN — ou bipar o código de barras" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 16, fontWeight: 600, color: "var(--text-primary)", minWidth: 0 }} />
              {q && <button className="icon-btn" style={{ border: "none", background: "transparent" }} onClick={() => setQ("")}><Icon name="close" size={16} /></button>}
            </div>
            {results.length > 0 && (
              <div className="card scrollbar-thin" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 60, padding: 6, display: "flex", flexDirection: "column", gap: 2, maxHeight: 420, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
                {results.map((it) => {
                  const own = it.ownStoreComponent;
                  const availableHere = !!(own && own.qty > 0);
                  const otherComponents = it.components.filter((c) => c.qty > 0 && (!own || c.storeId !== own.storeId));
                  const canReserveElsewhere = operator === "pharm" && otherComponents.length > 0;
                  const outOfStock = it.totalStock <= 0;
                  const expanded = expandedResultId === it.id;
                  return (
                    <div key={it.id}>
                      <button
                        style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", border: "none", background: "transparent", padding: 10, borderRadius: "var(--radius-md)", cursor: (outOfStock || (!availableHere && !canReserveElsewhere)) ? "not-allowed" : "pointer", opacity: (outOfStock || (!availableHere && !canReserveElsewhere)) ? 0.5 : 1 }}
                        onClick={() => {
                          if (availableHere) { addComponent(own); return; }
                          if (canReserveElsewhere) setExpandedResultId((prev) => (prev === it.id ? null : it.id));
                        }}
                        disabled={outOfStock || (!availableHere && !canReserveElsewhere)}
                      >
                        <span className="stat-icon" style={{ width: 38, height: 38, flex: "none" }}><Icon name="pill" size={18} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}>{it.name}{it.controlled && <Badge tone="critical">Tarja</Badge>}</div>
                          <div className="cell-muted">
                            {it.brand} · <span className="mono">{it.ean}</span>
                            {availableHere ? " · " + own.loc : canReserveElsewhere ? " · não disponível nesta loja — toque para ver em outras lojas" : ""}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flex: "none" }}>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>{brl(availableHere ? own.price : (otherComponents[0] ? otherComponents[0].price : 0))}</div>
                          <div style={{ fontSize: 12, color: availableHere ? "var(--good)" : (canReserveElsewhere ? "var(--warning)" : "var(--critical)") }}>
                            {availableHere ? own.qty + " em estoque" : canReserveElsewhere ? "em outra loja" : "esgotado"}
                          </div>
                        </div>
                        <Icon name={availableHere ? "plusCircle" : (canReserveElsewhere ? "chevD" : "close")} size={22} style={{ color: outOfStock ? "var(--text-muted)" : "var(--brand)", flex: "none", transform: !availableHere && canReserveElsewhere && expanded ? "rotate(180deg)" : "none" }} />
                      </button>
                      {!availableHere && canReserveElsewhere && expanded && (
                        <div style={{ padding: "4px 10px 8px 56px", display: "flex", flexDirection: "column", gap: 4 }}>
                          {otherComponents.map((component) => (
                            <button key={component.id} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "8px 10px", borderRadius: "var(--radius-md)", cursor: "pointer" }} onClick={() => openReservation(component)}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{component.storeName || "Loja"}</div>
                                <div className="cell-muted">{component.loc}</div>
                              </div>
                              <div style={{ textAlign: "right", flex: "none" }}>
                                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{brl(component.price)}</div>
                                <div style={{ fontSize: 12, color: "var(--good)" }}>{component.qty} em estoque</div>
                              </div>
                              <Badge tone="neutral">Reservar</Badge>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lista de itens */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>Itens da venda</span>
              <Badge tone="neutral">{count}</Badge>
              {lines.length > 0 && <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto", color: "var(--critical)" }} onClick={pdvClear}><Icon name="trash" size={14} />Limpar</button>}
            </div>
            {lines.length === 0 ? (
              <EmptyState icon="scan" title="Comece a registrar a venda" desc="Busque ou bipe um produto para adicioná-lo." />
            ) : lines.map((l, i) => {
              const rx = l.controlled ? (prescriptionStatus[l.id] || { status: "missing" }) : null;
              const rxMeta = rx ? (PRESCRIPTION_STATUS_META[rx.status] || PRESCRIPTION_STATUS_META.missing) : null;
              return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                <span className="stat-icon" style={{ width: 42, height: 42, flex: "none" }}><Icon name="pill" size={19} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    {l.name}
                    {l.controlled && <Badge tone="critical"><Icon name="lock" size={10} />Tarja</Badge>}
                    {rx && (
                      <button
                        style={{ border: "none", cursor: "pointer", padding: 0, background: "transparent" }}
                        onClick={() => setPrescriptionTarget(l)}
                      >
                        <Badge tone={rxMeta.tone}><Icon name={rxMeta.icon} size={10} />{rxMeta.label}</Badge>
                      </button>
                    )}
                  </div>
                  <div className="cell-muted" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{l.brand}{l.storeName ? " · " + l.storeName : ""} · {brl(l.price)} un</span>
                    {(itemLocations[l.id] || []).length > 0 ? (
                      <select
                        className="input"
                        style={{ width: "auto", minWidth: 150, height: 26, padding: "0 8px", fontSize: 12 }}
                        value={l.locationId || ""}
                        onChange={(e) => {
                          const picked = (itemLocations[l.id] || []).find((entry) => entry.locationId === e.target.value);
                          pdvSetLocation(l.id, e.target.value, picked ? picked.locationCode : "");
                        }}
                      >
                        <option value="" disabled>Escolha o local de retirada</option>
                        {(itemLocations[l.id] || []).map((entry) => (
                          <option key={entry.locationId} value={entry.locationId}>
                            {entry.locationCode} · {entry.locationName} ({entry.qty} un)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>· {l.loc || "sem local cadastrado"}</span>
                    )}
                  </div>
                </div>
                <QtyStepper value={l.qty} onChange={(v) => pdvSetQty(l.id, v)} />
                <div style={{ width: 84, textAlign: "right", fontWeight: 800, fontSize: 15, flex: "none" }}>{brl(l.price * l.qty)}</div>
                <button className="icon-btn" aria-label="remover" onClick={() => pdvRemove(l.id)}><Icon name="trash" size={15} /></button>
              </div>
              );
            })}
          </div>

          {hasControlled && (
            <div style={{ display: "flex", gap: 12, padding: 14, background: "var(--info-soft)", borderRadius: "var(--radius-md)", alignItems: "flex-start" }}>
              <Icon name="rx" size={20} style={{ color: "var(--info)", flex: "none", marginTop: 1 }} />
              <div style={{ fontSize: 13, color: "var(--info)", lineHeight: 1.5 }}>Há item <b>controlado (tarja)</b> na venda — toque no selo de receita do item para validar antes de enviar ao caixa.</div>
            </div>
          )}
        </div>

        {/* Coluna: cliente + pagamento + total */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Cliente */}
          <div className="card card-pad">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Cliente</span>
              <button className="btn btn-secondary btn-sm" onClick={() => operator === "caixa" ? resetAtendimento() : setIdOpen(true)}>{operator === "caixa" ? "Trocar pedido" : (pdvCustomer ? "Trocar" : "Identificar")}</button>
            </div>
            {pdvCustomer ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                  <span className="avatar">{pdvCustomer.avatar || (pdvCustomer.name[0] || "?")}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{pdvCustomer.name}</span>
                      {pdvCustomer.tier && <Badge tone={tierTone(pdvCustomer.tier)}>{pdvCustomer.tier}</Badge>}
                    </div>
                    <div className="cell-muted mono">{pdvCustomer.doc || "CPF não informado"}</div>
                  </div>
                  {pdvCustomer.recurring && <RecurringBadge name={pdvCustomer.name} small customerByName={customerByName} />}
                </div>

                <div className="cell-muted" style={{ marginTop: 10 }}>
                  {fmtBirthday(pdvCustomer.birthDate) ? "🎂 " + fmtBirthday(pdvCustomer.birthDate) + "  ·  " : ""}
                  Cliente desde {pdvCustomer.since || "—"}{pdvCustomer.tenureMonths > 0 ? " (" + pdvCustomer.tenureMonths + " meses)" : ""}
                </div>

                {(pdvCustomer.phone || pdvCustomer.email) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                    {pdvCustomer.phone && <div className="cell-muted" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="phone" size={12} />{maskPhone(pdvCustomer.phone)}</div>}
                    {pdvCustomer.email && <div className="cell-muted" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="mail" size={12} />{pdvCustomer.email}</div>}
                  </div>
                )}
                {(pdvCustomer.district || pdvCustomer.city) && (
                  <div className="cell-muted" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <Icon name="pin" size={12} />{[pdvCustomer.district, pdvCustomer.city].filter(Boolean).join(", ")}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 12 }}>
                  <PdvCustomerStat label="Pedidos" value={pdvCustomer.orders || 0} />
                  <PdvCustomerStat label="Total gasto" value={brl(pdvCustomer.totalSpent || 0)} />
                  <PdvCustomerStat label="Ticket médio" value={brl(pdvCustomer.avgTicket || 0)} />
                </div>

                {(pdvCustomer.lastDays != null || pdvCustomer.freqDays) && (
                  <div className="cell-muted" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="clock" size={12} />
                    {[recencyLabel(pdvCustomer.lastDays), pdvCustomer.freqDays ? `costuma comprar a cada ~${pdvCustomer.freqDays} dias` : ""].filter(Boolean).join(" · ")}
                  </div>
                )}

                {Array.isArray(pdvCustomer.interests) && pdvCustomer.interests.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
                    {pdvCustomer.interests.map((tag) => <Badge key={tag} tone="neutral">{tag}</Badge>)}
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span className="stat-icon" style={{ width: 40, height: 40 }}><Icon name="user" size={19} /></span>
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>Consumidor não identificado</div><div className="cell-muted">Venda sem cadastro</div></div>
              </div>
            )}
            {pdvCustomer && pdvCustomer.cashback > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "9px 12px", background: "var(--accent-soft)", borderRadius: "var(--radius-md)", fontSize: 12.5, fontWeight: 600, color: "var(--brand)" }}>
                <Icon name="gift" size={15} />{brl(pdvCustomer.cashback)} de cashback disponível
              </div>
            )}
          </div>

          {/* ===== Visão do FARMACÊUTICO: sugestões do que o cliente mais compra ===== */}
          {operator === "pharm" && <PdvUpsell customer={pdvCustomer} insights={insights} inventory={inventory} cart={pdvCart} onAdd={pdvAdd} />}
          {operator === "pharm" && pdvCustomer && <PdvRecurrenceSuggestions candidates={insights.recurrenceCandidates} onConfigure={setRecurrenceCandidate} />}

          {/* ===== Visão do CAIXA: pagamento + CPF na nota ===== */}
          {operator === "caixa" && (
            <div className="card card-pad">
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Forma de pagamento</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {PAY_METHODS.map((m) => (
                  <ChoiceCard key={m.id} on={pay === m.id} icon={m.icon} title={m.label} onClick={() => setPay(m.id)} style={{ flexDirection: "column", textAlign: "center", justifyContent: "center" }} />
                ))}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 12 }} onClick={() => setCpfNota(!cpfNota)}>
                <span style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", background: cpfNota ? "var(--accent)" : "transparent", borderColor: cpfNota ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>{cpfNota && <Icon name="check" size={12} />}</span>
                Incluir CPF na nota fiscal
              </label>
            </div>
          )}

          {/* Cashback do cliente (visão do caixa) — aplicar saldo além do desconto */}
          {operator === "caixa" && pdvCustomer && cashAvailable > 0 && (
            <div className="card card-pad">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span className="stat-icon" style={{ width: 32, height: 32 }}><Icon name="gift" size={16} /></span>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 14 }}>Cashback do cliente</div><div className="cell-muted">Disponível: <b style={{ color: "var(--brand)" }}>{brl(cashAvailable)}</b></div></div>
              </div>
              <Field label="Quanto aplicar (R$)">
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="input" type="number" min="0" step="0.01" max={Math.min(cashAvailable, afterDisc)} value={cashWanted} onChange={(e) => setCashWanted(Math.max(0, +e.target.value || 0))} placeholder="0,00" style={{ flex: 1 }} />
                  <button className="btn btn-secondary" onClick={() => setCashWanted(Math.min(cashAvailable, afterDisc))}>Usar tudo</button>
                </div>
              </Field>
              {cashApplied > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, padding: "9px 12px", background: "var(--accent-soft)", borderRadius: "var(--radius-md)", fontSize: 13, fontWeight: 700, color: "var(--brand)" }}>
                  <span><Icon name="check" size={14} /> Aplicando {brl(cashApplied)}</span>
                  <button className="btn btn-sm" style={{ background: "transparent", color: "var(--brand)", padding: "2px 6px" }} onClick={() => setCashWanted(0)}>remover</button>
                </div>
              )}
            </div>
          )}

          {/* Retirada na loja ou entrega (visão do farmacêutico, com cliente identificado) */}
          {operator === "pharm" && pdvCustomer && (
            <PdvFulfillmentPicker delivery={delivery} setDelivery={setDelivery} checkPdvDeliveryCoverage={checkPdvDeliveryCoverage} savedAddresses={savedAddresses} onSaveAddress={saveCustomerAddress} />
          )}

          {/* Totais — bruto + com desconto (ambas as visões) */}
          <div className="card card-pad">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "var(--text-secondary)", padding: "3px 0" }}><span>Valor bruto</span><span>{brl(subtotal)}</span></div>
            <div style={{ margin: "8px 0" }}>
              <Field label="Desconto (%)" hint={discountLimit < 100 ? `Desconto máximo permitido: ${discountLimit}% — limite de margem do produto${cashAvailable > 0 ? " e cashback do cliente" : ""}` : undefined}>
                <input className="input" type="number" min="0" max={discountLimit} value={discount} disabled={!!appliedCoupon} onChange={(e) => setDiscount(Math.max(0, Math.min(discountLimit, +e.target.value)))} />
              </Field>
            </div>
            <div style={{ margin: "8px 0" }}>
              <Field label="Cupom">
                {appliedCoupon ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 12px", background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="tag" size={13} />{appliedCoupon.code}</span>
                    <button type="button" className="icon-btn" style={{ width: 22, height: 22 }} onClick={removeCoupon}><Icon name="close" size={13} /></button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="input" style={{ textTransform: "uppercase" }} disabled={discount > 0} value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Código do cupom" />
                    <button type="button" className="btn btn-secondary" disabled={discount > 0 || !couponCode.trim()} onClick={applyCoupon}>Aplicar</button>
                  </div>
                )}
              </Field>
              {discount > 0 && <div className="cell-muted" style={{ marginTop: 4 }}>Zere o desconto manual para aplicar um cupom.</div>}
              {couponError && <div className="cell-muted" style={{ marginTop: 4, color: "var(--critical)" }}>{couponError}</div>}
            </div>
            {discVal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "var(--good)", padding: "3px 0" }}><span>{appliedCoupon ? "Cupom aplicado" : "Desconto aplicado"}</span><span>− {brl(discVal)}</span></div>}
            {cashApplied > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "var(--brand)", padding: "3px 0" }}><span>Cashback aplicado</span><span>− {brl(cashApplied)}</span></div>}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "var(--text-secondary)", padding: "3px 0" }}><span>Itens</span><span>{count}</span></div>
            <div style={{ height: 1, background: "var(--border)", margin: "12px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{discVal > 0 || cashApplied > 0 ? "Total a pagar" : "Total"}</span>
              <span style={{ fontWeight: 800, fontSize: 28, letterSpacing: "-.02em" }}>{brl(total)}</span>
            </div>
            {pdvCustomer && lines.length > 0 && <div className="cell-muted" style={{ textAlign: "right", marginTop: 4 }}>O cashback ganho é calculado ao emitir a nota</div>}

            {operator === "pharm" ? (
              <>
                <button className="btn btn-primary btn-lg" style={{ marginTop: 16, width: "100%", justifyContent: "center" }} disabled={lines.length === 0} onClick={async () => { const ok = await pdvSendToCashier({ customer: pdvCustomer, items: pdvCart, discount, couponCode: appliedCoupon ? appliedCoupon.code : "", delivery, draftId }); if (ok) { setDraftId(null); finalizeSale && finalizeSale("Pedido enviado ao caixa"); setSentModal(true); } }}>
                  <Icon name="arrowR" size={18} />Enviar para o caixa
                </button>
                <div className="cell-muted" style={{ textAlign: "center", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="cash" size={13} />O caixa recebe o pagamento e emite a nota</div>
              </>
            ) : (
              <>
                <button className="btn btn-primary btn-lg" style={{ marginTop: 16, width: "100%", justifyContent: "center" }} disabled={lines.length === 0} onClick={emit}>
                  <Icon name="receipt" size={18} />Finalizar e emitir nota
                </button>
                <div className="cell-muted" style={{ textAlign: "center", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="shield" size={13} />NFC-e · {storeFiscal.cnpj}</div>
              </>
            )}
          </div>
        </div>
      </div>
      )}

      {idOpen && <IdentifyModal current={pdvCustomer} customers={customers} onCreate={createPdvCustomer} onPick={(c) => { setPdvCustomer(c); setCaixaReady(true); setIdOpen(false); }} onClose={() => setIdOpen(false)} />}
      {nota && <NotaFiscalModal nota={nota} storeFiscal={storeFiscal} pharmacistProfile={pharmacistProfile} onSendEmail={sendFiscalDocumentEmail} onClose={() => setNota(null)} onDone={() => { setNota(null); resetAtendimento(); finalizeSale && finalizeSale(); }} />}
      {recurrenceCandidate && pdvCustomer && (
        <RecurrenceConfirmModal
          candidate={recurrenceCandidate}
          customerId={pdvCustomer.id}
          pdvSearchProducts={pdvSearchProducts}
          fetchCustomerPaymentMethods={fetchCustomerPaymentMethods}
          confirmPdvRecurrence={confirmPdvRecurrence}
          onClose={() => setRecurrenceCandidate(null)}
          onConfirmed={async () => {
            setRecurrenceCandidate(null);
            notify && notify("Recorrência configurada e cobrança realizada.", "success");
            const refreshed = fetchCustomerPurchaseInsights ? await fetchCustomerPurchaseInsights(pdvCustomer.id) : insights;
            setInsights(refreshed);
          }}
        />
      )}

      {/* Confirmação: pedido enviado ao caixa (visão do farmacêutico) */}
      {sentModal && (
        <ModalShell open={true} onClose={() => setSentModal(false)} maxw={400}>
          <div style={{ textAlign: "center" }}>
            <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 14px", background: "var(--good-soft)", color: "var(--good)" }}><Icon name="check" size={28} /></span>
            <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Enviado para o caixa</h2>
            <p className="page-desc" style={{ marginTop: 8, lineHeight: 1.55 }}>O pedido foi salvo e enviado para o caixa{pdvCustomer ? " no nome de " + pdvCustomer.name : ""}. O caixa vê os mesmos itens e finaliza com o pagamento e a nota fiscal.</p>
            <button className="btn btn-primary btn-lg" style={{ marginTop: 18, width: "100%", justifyContent: "center" }} onClick={() => { setSentModal(false); resetAtendimento(); }}>Atender próximo paciente</button>
          </div>
        </ModalShell>
      )}

      {/* Confirmação: descartar um atendimento em andamento */}
      {discardTarget && (
        <ModalShell open={true} onClose={() => setDiscardTarget(null)} maxw={400}>
          <div style={{ textAlign: "center" }}>
            <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 14px", background: "var(--critical-soft)", color: "var(--critical)" }}><Icon name="trash" size={26} /></span>
            <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Descartar atendimento?</h2>
            <p className="page-desc" style={{ marginTop: 8, lineHeight: 1.55 }}>
              O atendimento de {discardTarget.customer ? discardTarget.customer.name : "consumidor não identificado"} será excluído e não poderá ser recuperado.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setDiscardTarget(null)}>Cancelar</button>
              <button className="btn btn-danger-solid" style={{ flex: 1, justifyContent: "center" }} onClick={confirmDiscardDraft}><Icon name="trash" size={15} />Descartar</button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Reservar produto disponível em outra loja, para o cliente retirar lá */}
      {reservationTarget && (
        <ModalShell open={true} onClose={() => setReservationTarget(null)} maxw={420}>
          <div style={{ textAlign: "center" }}>
            <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 14px", background: "var(--warning-soft)", color: "var(--warning)" }}><Icon name="pin" size={26} /></span>
            <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Reservar em {reservationTarget.storeName || "outra loja"}</h2>
            <p className="page-desc" style={{ marginTop: 8, lineHeight: 1.55 }}>
              {reservationTarget.name} · {reservationTarget.loc}. O estoque fica travado por 48h para
              {pdvCustomer ? " " + pdvCustomer.name : " o cliente"} retirar diretamente nessa loja.
            </p>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <QtyStepper value={reservationQty} onChange={setReservationQty} min={1} max={reservationTarget.qty} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setReservationTarget(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={reservationBusy} onClick={confirmReservation}>
                <Icon name="pin" size={15} />{reservationBusy ? "Reservando…" : "Reservar para retirada"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Confirmação: reserva concluída com sucesso */}
      {reservationConfirmed && (
        <ModalShell open={true} onClose={() => setReservationConfirmed(null)} maxw={400}>
          <div style={{ textAlign: "center" }}>
            <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 14px", background: "var(--good-soft)", color: "var(--good)" }}><Icon name="check" size={28} /></span>
            <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Reserva confirmada</h2>
            <p className="page-desc" style={{ marginTop: 8, lineHeight: 1.55 }}>
              {reservationConfirmed.productName} reservado na loja {reservationConfirmed.storeName}, válido até {reservationConfirmed.expiresAtLabel}.
              Oriente o cliente a retirar diretamente lá.
            </p>
            <button className="btn btn-primary btn-lg" style={{ marginTop: 18, width: "100%", justifyContent: "center" }} onClick={() => setReservationConfirmed(null)}>Entendi</button>
          </div>
        </ModalShell>
      )}

      {/* Validar receita (física ou digital) de um item controlado do carrinho */}
      {prescriptionTarget && (
        <PdvPrescriptionModal
          line={prescriptionTarget}
          customer={pdvCustomer}
          createPdvPrescription={createPdvPrescription}
          onClose={() => setPrescriptionTarget(null)}
          onSaved={(result) => {
            setPrescriptionStatus((prev) => ({ ...prev, [prescriptionTarget.id]: { inventoryItemId: prescriptionTarget.id, status: result.status, deliveryMethod: result.deliveryMethod, prescriptionId: result.id } }));
            setPrescriptionTarget(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Modal: validar receita de um item controlado (física ou digital) ---------- */
function PdvPrescriptionModal({ line, customer, createPdvPrescription, onClose, onSaved }) {
  const [method, setMethod] = useState("physical");
  const [digitalUrl, setDigitalUrl] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submitPhysical = async (decision) => {
    if (decision === "rejected" && !rejectionReason.trim()) { setRejectionReason(" "); return; }
    setBusy(true);
    const result = await createPdvPrescription({
      customerId: customer && customer.id, inventoryItemId: line.id, medicationName: line.name,
      deliveryMethod: "physical", decision, rejectionReason: decision === "rejected" ? rejectionReason.trim() || "Recusada pelo farmacêutico." : "",
    });
    setBusy(false);
    if (result) onSaved(result);
  };

  const submitDigital = async () => {
    if (!digitalUrl.trim()) return;
    setBusy(true);
    const result = await createPdvPrescription({
      customerId: customer && customer.id, inventoryItemId: line.id, medicationName: line.name,
      deliveryMethod: "digital", digitalReferenceUrl: digitalUrl.trim(),
    });
    setBusy(false);
    if (result) onSaved(result);
  };

  return (
    <ModalShell open={true} onClose={onClose} maxw={440}>
      <span className="stat-icon" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="rx" size={26} /></span>
      <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Validar receita — {line.name}</h2>
      <p className="page-desc" style={{ marginTop: 6, marginBottom: 16 }}>
        Este item exige receita. Confira o documento físico apresentado pelo cliente, ou envie o link
        da receita digital para validação — a venda só pode ser enviada ao caixa depois de validada.
      </p>
      <PillNav options={[{ key: "physical", label: "Receita física" }, { key: "digital", label: "Receita digital" }]} active={method} onChange={setMethod} />
      <div style={{ height: 16 }} />
      {method === "physical" ? (
        <>
          <p className="cell-muted" style={{ marginBottom: 12 }}>O cliente mostrou a receita em papel agora — confira e decida.</p>
          {rejectionReason !== "" && (
            <div style={{ marginBottom: 12 }}>
              <Field label="Motivo da recusa">
                <input className="input" value={rejectionReason.trim()} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Ex.: receita vencida, dose incompatível" />
              </Field>
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-danger-solid" style={{ flex: 1, justifyContent: "center" }} disabled={busy} onClick={() => submitPhysical("rejected")}>
              <Icon name="close" size={15} />Recusar
            </button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={busy} onClick={() => submitPhysical("approved")}>
              <Icon name="check" size={15} />Validar
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <Field label="Link da receita digital">
              <input className="input" value={digitalUrl} onChange={(e) => setDigitalUrl(e.target.value)} placeholder="https://..." />
            </Field>
          </div>
          <p className="cell-muted" style={{ marginBottom: 12 }}>
            O link será enviado na conversa com {customer ? customer.name : "o cliente"} para um farmacêutico validar ou recusar.
          </p>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy || !digitalUrl.trim()} onClick={submitDigital}>
            <Icon name="chat" size={15} />Enviar para validação
          </button>
        </>
      )}
    </ModalShell>
  );
}

/* ---------- Modal: identificar cliente ---------- */
function IdentifyModal({ current, onPick, onClose, customers, onCreate }) {
  const CUSTOMERS = Array.isArray(customers) ? customers : [];
  const [q, setQ] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const list = CUSTOMERS.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || (c.doc || "").includes(q));
  return (
    <ModalShell open={true} onClose={onClose} maxw={460}>
      <span className="stat-icon" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="user" size={26} /></span>
      <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Identificar cliente</h2>
      <p className="page-desc" style={{ marginTop: 6, marginBottom: 16 }}>Vincule a venda a um cliente ou siga como consumidor não identificado.</p>
      <div style={{ marginBottom: 12 }}>
        <input className="input" autoFocus placeholder="Buscar por nome ou CPF" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="scrollbar-thin" style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
        {list.map((c) => (
          <button key={c.name} onClick={() => onPick(c)} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, border: "none", background: "transparent", cursor: "pointer", borderRadius: "var(--radius-md)", textAlign: "left" }}>
            <span className="avatar" style={{ width: 38, height: 38 }}>{c.avatar}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</div>
              <div className="cell-muted mono">{c.doc}</div>
            </div>
            {c.cashback > 0 && <Badge tone="neutral"><Icon name="gift" size={10} />{brl(c.cashback)}</Badge>}
            {c.recurring && <Icon name="repeat" size={14} style={{ color: "var(--good)" }} />}
          </button>
        ))}
        {list.length === 0 && <div className="cell-muted" style={{ textAlign: "center", padding: 12 }}>Nenhum cliente encontrado.</div>}
      </div>

      <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center", borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 2 }} onClick={() => setRegisterOpen(true)}>
        <Icon name="plusCircle" size={16} />Cadastrar cliente
      </button>
      <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => onPick(null)}>Consumidor não identificado</button>

      {registerOpen && (
        <RegisterCustomerModal
          onClose={() => setRegisterOpen(false)}
          onCreate={onCreate}
          onCreated={(created) => { setRegisterOpen(false); onPick(created); }}
        />
      )}
    </ModalShell>
  );
}

/* ---------- Modal: cadastrar cliente (nome, e-mail, CPF e telefone) ---------- */
function RegisterCustomerModal({ onClose, onCreate, onCreated }) {
  const [cpf, setCpf] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const cpfDigits = cpf.replace(/\D/g, "").length;
  const emailValid = !email.trim() || EMAIL_PATTERN.test(email.trim());
  const handleCreate = async () => {
    try {
      setCreateError("");
      setSaving(true);
      const created = await onCreate({ name: nome.trim(), doc: cpf.trim(), phone: telefone.trim(), email: email.trim() });
      onCreated(created);
    } catch (error) {
      setCreateError(error && error.message ? error.message : "Não foi possível cadastrar o cliente agora.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell open={true} onClose={onClose} maxw={420}>
      <span className="stat-icon" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="plusCircle" size={26} /></span>
      <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Cadastrar cliente</h2>
      <p className="page-desc" style={{ marginTop: 6, marginBottom: 16 }}>Nome e/ou CPF são obrigatórios — e-mail e telefone são opcionais. O e-mail habilita o primeiro acesso ao marketplace.</p>
      <div style={{ marginBottom: 10 }}><Field label={"Nome " + (cpfDigits === 11 ? "(opcional)" : "")}><input autoFocus className="input" placeholder="Nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} /></Field></div>
      <div style={{ marginBottom: 10 }}>
        <Field label="E-mail (opcional)">
          <input className="input" type="email" placeholder="cliente@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {!emailValid && <div style={{ marginTop: 4, color: "var(--critical)", fontSize: 12 }}>E-mail inválido.</div>}
      </div>
      <div style={{ marginBottom: 10 }}><Field label={"CPF " + (nome.trim() ? "(opcional)" : "")}><input className="input mono" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} /></Field></div>
      <div style={{ marginBottom: 12 }}><Field label="Telefone (opcional)"><input className="input mono" inputMode="numeric" maxLength={19} placeholder="+55 (00) 00000-0000" value={telefone} onChange={(e) => setTelefone(maskPhone(e.target.value))} /></Field></div>
      {createError ? <div style={{ marginBottom: 10, color: "var(--critical)", fontSize: 12.5 }}>{createError}</div> : null}
      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={saving || !emailValid || !(nome.trim() || cpfDigits === 11)} onClick={handleCreate}>
        <Icon name="user" size={16} />{saving ? "Cadastrando..." : "Cadastrar e usar"}
      </button>
    </ModalShell>
  );
}

/* ---------- Modal: confirmar recorrência e cobrar no cartão salvo ---------- */
function RecurrenceConfirmModal({ candidate, customerId, pdvSearchProducts, fetchCustomerPaymentMethods, confirmPdvRecurrence, onClose, onConfirmed }) {
  const [loading, setLoading] = useState(true);
  const [resolvedItem, setResolvedItem] = useState(null); // componente de estoque real que casa com o candidato
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [frequencyDays, setFrequencyDays] = useState(30);
  const [quantity, setQuantity] = useState(candidate.avgQuantity || 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [products, methods] = await Promise.all([
        pdvSearchProducts ? pdvSearchProducts(candidate.name) : [],
        fetchCustomerPaymentMethods ? fetchCustomerPaymentMethods(customerId) : [],
      ]);
      if (cancelled) return;
      const match = (products || []).find((p) => p.id === candidate.productKey) || (products || [])[0];
      const component = match && match.components && match.components[0];
      setResolvedItem(component || null);
      setPaymentMethods(methods || []);
      const primary = (methods || []).find((m) => m.isPrimary) || (methods || [])[0];
      if (primary) setPaymentMethodId(primary.id);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleConfirm = async () => {
    if (!resolvedItem || !paymentMethodId) return;
    try {
      setSaving(true);
      setError("");
      const response = await confirmPdvRecurrence({
        customerId,
        inventoryItemId: resolvedItem.id,
        quantity,
        frequencyDays,
        paymentMethodId,
      });
      setResult(response);
    } catch (err) {
      setError(err && err.message ? err.message : "Não foi possível confirmar a recorrência agora.");
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <ModalShell open={true} onClose={() => onConfirmed(result)} maxw={420}>
        <span className="stat-icon" style={{ width: 52, height: 52, marginBottom: 14, background: "var(--good-soft)", color: "var(--good)" }}><Icon name="check" size={26} /></span>
        <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Recorrência confirmada</h2>
        <p className="page-desc" style={{ marginTop: 6, marginBottom: 16 }}>Cobrança de {brl(result.totalCharged)} realizada no cartão salvo, com {result.discountPercent}% de desconto aplicado.</p>
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => onConfirmed(result)}>Fechar</button>
      </ModalShell>
    );
  }

  return (
    <ModalShell open={true} onClose={onClose} maxw={440}>
      <span className="stat-icon" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="repeat" size={26} /></span>
      <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Configurar recorrência</h2>
      <p className="page-desc" style={{ marginTop: 6, marginBottom: 16 }}>{candidate.name} · comprado em {candidate.consecutiveMonths} meses seguidos. Cobrança imediata no cartão salvo, com 15% de desconto.</p>
      {loading ? (
        <div className="cell-muted" style={{ padding: "12px 0" }}>Carregando estoque e cartões salvos...</div>
      ) : !resolvedItem ? (
        <div style={{ color: "var(--critical)", fontSize: 13, marginBottom: 12 }}>Este produto não foi encontrado no estoque atual — não é possível confirmar a recorrência agora.</div>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <Field label="Quantidade"><QtyStepper value={quantity} onChange={setQuantity} min={1} max={20} /></Field>
          </div>
          <div style={{ marginBottom: 10 }}>
            <Field label="Frequência (dias)"><input className="input" type="number" min="7" max="365" value={frequencyDays} onChange={(e) => setFrequencyDays(Math.max(7, +e.target.value || 30))} /></Field>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Cartão a cobrar</div>
            {paymentMethods.length === 0 ? (
              <div style={{ color: "var(--critical)", fontSize: 12.5 }}>O cliente não tem cartão salvo — não é possível cobrar a recorrência agora.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {paymentMethods.map((m) => (
                  <ChoiceCard key={m.id} on={paymentMethodId === m.id} radio onClick={() => setPaymentMethodId(m.id)} style={{ padding: "8px 10px" }}>
                    <span style={{ fontSize: 13 }}>{m.brandName} •••• {m.lastFourDigits}{m.isPrimary ? " · principal" : ""}</span>
                  </ChoiceCard>
                ))}
              </div>
            )}
          </div>
          <div className="cell-muted" style={{ marginBottom: 12 }}>Total a cobrar agora: <b>{brl((resolvedItem.price * (1 - 0.15)) * quantity)}</b></div>
          {error ? <div style={{ marginBottom: 10, color: "var(--critical)", fontSize: 12.5 }}>{error}</div> : null}
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={saving || !paymentMethodId} onClick={handleConfirm}>
            <Icon name="repeat" size={16} />{saving ? "Cobrando..." : "Confirmar recorrência e cobrar agora"}
          </button>
        </>
      )}
    </ModalShell>
  );
}

/* ---------- Modal: nota fiscal (NFC-e) emitida ---------- */
function NotaFiscalModal({ nota, storeFiscal, pharmacistProfile, onSendEmail, onClose, onDone }) {
  const F = storeFiscal || {};
  const P = pharmacistProfile || {};
  const [sendOpen, setSendOpen] = useState(false);
  const payLabel = (PAY_METHODS.find((m) => m.id === nota.pay) || {}).label;
  const tributos = Math.round(nota.total * 0.12 * 100) / 100;
  const chaveFmt = (nota.chave || "").replace(/(\d{4})(?=\d)/g, "$1 ");
  return (
    <ModalShell open={true} onClose={onClose} maxw={460}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 12px", background: "var(--good-soft)", color: "var(--good)" }}><Icon name="check" size={28} /></span>
        <h2 style={{ fontWeight: 800, fontSize: 21, margin: 0 }}>Venda concluída</h2>
        <p className="page-desc" style={{ marginTop: 4 }}>Nota fiscal autorizada com sucesso.</p>
      </div>

      {/* Cupom */}
      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 16, background: "var(--bg)" }}>
        <div style={{ textAlign: "center", borderBottom: "1px dashed var(--border)", paddingBottom: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{F.legal}</div>
          <div className="cell-muted">CNPJ {F.cnpj} · IE {F.ie}</div>
          <div className="cell-muted">{F.addr}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
          <span>NFC-e nº {nota.numero}</span><span>Série {nota.serie} · {nota.when}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
          {nota.items.map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.qty}× {l.name}</span>
              <span className="mono" style={{ flex: "none", marginLeft: 8 }}>{brl(l.price * l.qty)}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 10, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16 }}><span>TOTAL</span><span>{brl(nota.total)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }} className="cell-muted"><span>Pagamento</span><span>{payLabel}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="cell-muted"><span>Trib. aprox. (Lei 12.741)</span><span>{brl(tributos)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="cell-muted"><span>Destinatário</span><span>{nota.customer && nota.cpfNota ? (nota.customer.doc || "—") : "CONSUMIDOR"}</span></div>
          {nota.customer && nota.cashback > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "var(--brand)", fontWeight: 700 }} className="cell-muted"><span>Cashback creditado</span><span>+ {brl(nota.cashback)}</span></div>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", borderTop: "1px dashed var(--border)", marginTop: 10, paddingTop: 12 }}>
          <QrPlaceholder seed={parseInt(nota.numero) % 200 + 5} size={84} />
          <div style={{ minWidth: 0 }}>
            <div className="cell-muted" style={{ fontWeight: 700 }}>Consulte pela chave de acesso:</div>
            <div className="mono" style={{ fontSize: 10.5, wordBreak: "break-all", lineHeight: 1.5, marginTop: 4 }}>{chaveFmt}</div>
          </div>
        </div>
        <div className="cell-muted" style={{ textAlign: "center", marginTop: 10 }}>Atendido por {P.name} · {P.crf}</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: "center" }} disabled={!nota.printableUrl} onClick={() => nota.printableUrl && window.open(nota.printableUrl, "_blank", "noopener")}><Icon name="printer" size={16} />Imprimir</button>
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: "center" }} onClick={() => setSendOpen(true)}><Icon name="mail" size={16} />Enviar</button>
        <button className="btn btn-primary" style={{ flex: 1.4, justifyContent: "center" }} onClick={onDone}><Icon name="check" size={16} />Nova venda</button>
      </div>

      {sendOpen && <SendNotaModal nota={nota} onSend={onSendEmail} onClose={() => setSendOpen(false)} />}
    </ModalShell>
  );
}

/* ---------- Modal: enviar nota por e-mail ---------- */
function SendNotaModal({ nota, onClose, onSend }) {
  const registered = nota.customer && nota.customer.email ? nota.customer.email : null;
  const [mode, setMode] = useState(registered ? "registered" : "custom");
  const [custom, setCustom] = useState("");
  const [alsoWa, setAlsoWa] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());
  const target = mode === "registered" ? registered : custom.trim();
  const canSend = (mode === "registered" ? !!registered : validEmail(custom)) && !!(nota.id || nota.fiscalDocumentId);

  const submit = async () => {
    if (!onSend || !(nota.id || nota.fiscalDocumentId)) {
      setError("O documento fiscal ainda não está disponível para envio.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await onSend(nota.id || nota.fiscalDocumentId, target, alsoWa);
      if (response && response.sent === false) {
        setError(response.message || "Não foi possível enviar a nota por e-mail.");
        return;
      }
      setSent(true);
    } catch (requestError) {
      setError(requestError && requestError.message ? requestError.message : "Não foi possível enviar a nota por e-mail.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={true} onClose={onClose} maxw={420}>
      {sent ? (
        <div style={{ textAlign: "center" }}>
          <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 14px", background: "var(--good-soft)", color: "var(--good)" }}><Icon name="check" size={28} /></span>
          <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Nota enviada!</h2>
          <p className="page-desc" style={{ marginTop: 8, lineHeight: 1.55 }}>A NFC-e nº {nota.numero} foi enviada para <b>{target}</b>{alsoWa ? " e por WhatsApp" : ""}.</p>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 18, width: "100%", justifyContent: "center" }} onClick={onClose}>Concluir</button>
        </div>
      ) : (
        <>
          <span className="stat-icon" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="mail" size={26} /></span>
          <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Enviar nota por e-mail</h2>
          <p className="page-desc" style={{ marginTop: 6, marginBottom: 16 }}>Envie a NFC-e nº {nota.numero} ({brl(nota.total)}) para o cliente.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {registered && (
              <ChoiceCard on={mode === "registered"} radio icon="user" title="E-mail cadastrado" sub={registered} onClick={() => setMode("registered")} />
            )}
            <ChoiceCard on={mode === "custom"} radio icon="edit" title="Outro e-mail" sub="Informe o endereço desejado" onClick={() => setMode("custom")} />
          </div>

          {mode === "custom" && (
            <div style={{ marginTop: 12 }}>
              <Field label="E-mail do destinatário">
                <input className="input" type="email" autoFocus value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="nome@email.com" />
              </Field>
              {custom && !validEmail(custom) && <span style={{ fontSize: 12, color: "var(--critical)", fontWeight: 600 }}>Digite um e-mail válido.</span>}
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 10 }} onClick={() => setAlsoWa(!alsoWa)}>
            <span style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", background: alsoWa ? "var(--accent)" : "transparent", borderColor: alsoWa ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>{alsoWa && <Icon name="check" size={12} />}</span>
            Também enviar por WhatsApp{nota.customer && nota.customer.phone ? " (" + nota.customer.phone + ")" : ""}
          </label>

          {error && <div className="card card-pad" style={{ marginTop: 12, background: "var(--warning-soft)", color: "var(--brand)", fontWeight: 600, fontSize: 13 }}>{error}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!canSend || busy} onClick={submit}><Icon name="send" size={16} />{busy ? "Enviando..." : "Enviar nota"}</button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

export { IdentifyModal, NotaFiscalModal, PAY_METHODS, PdvCaixaGate, PdvCaixaQueue, PdvScreen, PdvUpsell, QrPlaceholder, RegisterCustomerModal, SendNotaModal, creditCashback, fmtAtendimento, maskCPF, pdvSuggestions };
