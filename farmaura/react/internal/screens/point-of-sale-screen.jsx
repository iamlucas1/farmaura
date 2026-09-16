import React, { useEffect, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { fetchViaCepAddress, formatCep } from "../../marketplace/core/marketplace-address.js";
import { resolveMarketplaceCoupon } from "../../marketplace/screens/cart-screen.jsx";
import { RecurringBadge } from "../core/internal-shell.jsx";
import { Icon, PageHead, Badge, PillNav, EmptyState, Field, Modal, QtyStepper, KV, SwitchToggle, Avatar, SearchInput } from "../core/internal-ui.jsx";

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
/* Remove itens com o mesmo nome (o mesmo produto cadastrado em mais de uma loja aparece como
   uma linha de estoque por loja) — mantém só a primeira ocorrência, para listas de navegação
   onde o usuário só quer ver o produto uma vez, não uma vez por loja. */
function dedupeByName(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = it.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* Retrato de "o que o cliente costuma comprar" para o card do PDV: em vez de ordenar tudo por
   quantidade de compras (o que deixa a lista dominada por um único item muito recorrente, ex.:
   só remédio de uso contínuo), escolhe o item mais comprado DE CADA categoria (Medicamentos,
   Bem-estar, Perfumaria/Cosméticos, Fitoterápicos etc.) — assim a lista reflete a variedade real
   do consumo do cliente, não só a frequência bruta. */
function representativePurchasesByCategory(topProducts, limit = 5) {
  const byCategory = new Map();
  (topProducts || []).forEach((p) => {
    const key = p.cat || "Outros";
    const current = byCategory.get(key);
    if (!current || p.q > current.q) byCategory.set(key, p);
  });
  return [...byCategory.values()].sort((a, b) => b.q - a.q).slice(0, limit);
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

/* Painel de oportunidades de venda (visão do farmacêutico) — o que oferecer para maximizar o
   ticket médio desta venda. Sempre vem do backend (/pdv/upsell-suggestions): com carrinho vazio
   e cliente identificado, analisa só o histórico pessoal dele (perfil de compra, recorrência);
   a partir do primeiro item no carrinho, passa a cruzar também o que costuma ser comprado junto
   com os itens do carrinho — do próprio cliente e entre TODOS os clientes. Sem carrinho e sem
   cliente identificado, não há nada para analisar (ver hasContext). */
const PDV_UPSELL_INLINE_LIMIT = 5;
const PDV_UPSELL_MODAL_LIMIT = 15;

function PdvUpsellRow({ it, isFirst, onAdd }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "10px 0", borderTop: isFirst ? "none" : "1px dashed var(--border)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>{it.name}</div>
        <div className="cell-muted" style={{ fontSize: 11, marginTop: 2 }}>{brl(it.price)}{it.category ? " · " + it.category : ""}</div>
      </div>
      <button className="btn btn-secondary btn-sm" onClick={() => onAdd(it.id)}>Oferecer</button>
    </div>
  );
}

function PdvUpsell({ items, loading, hasContext, onAdd }) {
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const inline = items.slice(0, PDV_UPSELL_INLINE_LIMIT);
  const hasMore = items.length > PDV_UPSELL_INLINE_LIMIT;
  return (
    <div className="card card-pad" style={{ marginBottom: 14, background: "var(--accent-soft)", border: "none" }}>
      <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--accent)", marginBottom: 8 }}>
        <Icon name="sparkle" size={13} style={{ marginRight: 5, verticalAlign: "-2px" }} />
        Oportunidades de venda
      </div>
      {!hasContext ? (
        <div className="cell-muted" style={{ fontSize: 12 }}>Identifique o cliente ou adicione um produto ao carrinho para ver oportunidades de venda.</div>
      ) : loading ? (
        <div className="cell-muted" style={{ fontSize: 12 }}>Buscando as melhores sugestões...</div>
      ) : items.length === 0 ? (
        <div className="cell-muted" style={{ fontSize: 12 }}>Sem sugestões no momento.</div>
      ) : (
        <>
          {inline.map((it, i) => <PdvUpsellRow key={it.id} it={it} isFirst={i === 0} onAdd={onAdd} />)}
          {hasMore && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: "100%", justifyContent: "center" }} onClick={() => setSeeAllOpen(true)}>
              Ver mais oportunidades ({Math.min(items.length, PDV_UPSELL_MODAL_LIMIT) - inline.length})
            </button>
          )}
        </>
      )}
      {seeAllOpen && (
        <Modal open onClose={() => setSeeAllOpen(false)} title="Oportunidades de venda" subtitle="Ordenadas da melhor para a pior oportunidade para esta venda.">
          {items.slice(0, PDV_UPSELL_MODAL_LIMIT).map((it, i) => <PdvUpsellRow key={it.id} it={it} isFirst={i === 0} onAdd={(id) => { onAdd(id); setSeeAllOpen(false); }} />)}
        </Modal>
      )}
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
      <div style={{ display: "flex", gap: 6, marginBottom: type === "delivery" ? 12 : 0 }}>
        <button type="button" className="btn btn-sm" style={{ flex: 1, background: type === "pickup" ? "var(--accent)" : "var(--surface-2)", color: type === "pickup" ? "var(--accent-contrast)" : "var(--text-secondary)" }} onClick={() => setDelivery({ ...delivery, fulfillmentType: "pickup" })}>
          <Icon name="store" size={13} />Retirar na loja
        </button>
        <button type="button" className="btn btn-sm" style={{ flex: 1, background: type === "delivery" ? "var(--accent)" : "var(--surface-2)", color: type === "delivery" ? "var(--accent-contrast)" : "var(--text-secondary)" }} onClick={() => setDelivery({ ...delivery, fulfillmentType: "delivery" })}>
          <Icon name="truck" size={13} />Entregar em casa
        </button>
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

const PDV_RECURRENCE_INLINE_LIMIT = 5;
const PDV_RECURRENCE_MODAL_LIMIT = 15;

/* Uma linha de oportunidade de recorrência — usada tanto na lista inline quanto na modal
   "ver mais". Mostra o padrão real detectado (a cada quantos dias, quantas vezes seguidas)
   ou, para medicamento de uso contínuo sem histórico suficiente ainda, a cadência clínica
   padrão sugerida — nunca as duas coisas confundidas como se fossem a mesma certeza. */
function PdvRecurrenceRow({ c, isFirst, onConfigure }) {
  return (
    <div style={{ padding: "10px 0", borderTop: isFirst ? "none" : "1px dashed var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 12 }}>{c.name}</span>
            {c.continuousUse && <Badge tone="warning">Uso contínuo</Badge>}
          </div>
          <div style={{ fontSize: 11, marginTop: 2 }}>
            <span className="cell-muted" style={{ textDecoration: "line-through" }}>{brl(c.lastUnitPrice)}</span>
            <span style={{ color: "var(--good)", fontWeight: 700, marginLeft: 6 }}>{c.suggestedDiscountPercent}% off</span>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => onConfigure && onConfigure(c)}>Configurar</button>
      </div>
      <div className="cell-muted" style={{ fontSize: 11, marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Icon name="calendar" size={12} />
        {c.intervalDetected
          ? `Padrão identificado: a cada ${c.frequencyDays} dias · comprado ${c.occurrences}× seguindo esse ritmo`
          : `Uso contínuo sugerido · cadência padrão de ${c.frequencyDays} dias`}
      </div>
      <div className="cell-muted" style={{ fontSize: 11, marginTop: 2 }}>
        {c.avgQuantity} un. por ciclo · economiza {brl(c.savingsAmount)} por ciclo na recorrência · {brl(c.savingsAmount * (365 / c.frequencyDays))}/ano
      </div>
    </div>
  );
}

/* Painel de recorrência: identifica o próprio ritmo de compra do cliente (a cada quantos
   dias ele recompra o mesmo produto, 3× seguindo o mesmo padrão) e, separadamente, qualquer
   medicamento de uso contínuo real (sinal clínico do próprio produto, não da quantidade de
   compras) — sugere configurar como assinatura cobrada automaticamente todo mês no Asaas. */
function PdvRecurrenceSuggestions({ candidates, onConfigure }) {
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  if (!candidates || candidates.length === 0) return null;
  const inline = candidates.slice(0, PDV_RECURRENCE_INLINE_LIMIT);
  const hasMore = candidates.length > PDV_RECURRENCE_INLINE_LIMIT;
  return (
    <div className="card card-pad" style={{ marginBottom: 14, background: "var(--info-soft)", border: "none" }}>
      <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--info)", marginBottom: 8 }}>
        <Icon name="repeat" size={13} style={{ marginRight: 5, verticalAlign: "-2px" }} />
        Oportunidades de recorrência
      </div>
      {inline.map((c, i) => <PdvRecurrenceRow key={c.productKey} c={c} isFirst={i === 0} onConfigure={onConfigure} />)}
      {hasMore && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: "100%", justifyContent: "center" }} onClick={() => setSeeAllOpen(true)}>
          Ver mais oportunidades ({Math.min(candidates.length, PDV_RECURRENCE_MODAL_LIMIT) - inline.length})
        </button>
      )}
      {seeAllOpen && (
        <Modal open onClose={() => setSeeAllOpen(false)} title="Oportunidades de recorrência" subtitle="Uso contínuo primeiro, depois pelo padrão de compra mais consistente.">
          {candidates.slice(0, PDV_RECURRENCE_MODAL_LIMIT).map((c, i) => (
            <PdvRecurrenceRow key={c.productKey} c={c} isFirst={i === 0} onConfigure={(candidate) => { onConfigure && onConfigure(candidate); setSeeAllOpen(false); }} />
          ))}
        </Modal>
      )}
    </div>
  );
}

/* "Produto que o cliente queria e não encontramos" — igual ao MissingProductBox do artifact,
   mas com dados reais: busca em todas as lojas via /pdv/products/search e reaproveita a mesma
   reserva entre lojas já usada no catálogo (onReserve = openReservation do PdvScreen). Quando o
   produto não existe em nenhuma loja (ou nem está cadastrado no catálogo), registra a demanda
   via pdvLogDemand em vez de reservar — não há estoque real para travar. */
function PdvMissingProductBox({ pdvSearchProducts, pdvLogDemand, customer, onReserve }) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | elsewhere | noStock | notFound | registered
  const [otherStoreMatches, setOtherStoreMatches] = useState([]);
  const [matchedItemId, setMatchedItemId] = useState(null);
  const [matchedName, setMatchedName] = useState("");

  const reset = () => { setQ(""); setSearching(false); setPhase("idle"); setOtherStoreMatches([]); setMatchedItemId(null); setMatchedName(""); };

  const runSearch = async () => {
    const term = q.trim();
    if (!term || !pdvSearchProducts) return;
    setSearching(true);
    const found = await pdvSearchProducts(term);
    setSearching(false);
    if (!found || found.length === 0) { setMatchedItemId(null); setMatchedName(""); setOtherStoreMatches([]); setPhase("notFound"); return; }
    const withStock = found.find((it) => it.totalStock > 0);
    if (withStock) {
      setMatchedItemId(withStock.id); setMatchedName(withStock.name);
      setOtherStoreMatches(withStock.components.filter((c) => c.qty > 0));
      setPhase("elsewhere");
    } else {
      setMatchedItemId(found[0].id); setMatchedName(found[0].name); setOtherStoreMatches([]);
      setPhase("noStock");
    }
  };

  const registerDemand = async () => {
    if (!pdvLogDemand) return;
    const ok = await pdvLogDemand({ query: q.trim(), matchedItemId, customer });
    if (ok) setPhase("registered");
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>Produto que o cliente queria e não encontramos</div>
      {phase === "idle" && (
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="Nome do medicamento/produto..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} />
          <button className="btn btn-secondary btn-sm" disabled={!q.trim() || searching} onClick={runSearch}>
            <Icon name="search" size={13} />{searching ? "Buscando…" : "Buscar em outras lojas"}
          </button>
        </div>
      )}
      {phase === "elsewhere" && (
        <div>
          <div className="cell-muted" style={{ fontSize: 12, marginBottom: 8 }}>Encontramos <b style={{ color: "var(--text-primary)" }}>{matchedName}</b> em outra(s) loja(s):</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {otherStoreMatches.map((c) => (
              <button type="button" key={c.id} className="identify-result" style={{ border: "1px solid var(--border)", borderRadius: 10 }} onClick={() => { onReserve(c); reset(); }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{c.storeName || "Loja"}</div>
                  <div className="cell-muted" style={{ fontSize: 11 }}>{c.loc} · {brl(c.price)}</div>
                </div>
                <Badge tone="neutral">Reservar</Badge>
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={reset}>Cancelar</button>
        </div>
      )}
      {phase === "noStock" && (
        <div>
          <div className="cell-muted" style={{ fontSize: 12, marginBottom: 10 }}>
            <b style={{ color: "var(--text-primary)" }}>{matchedName}</b> está cadastrado no sistema, mas sem estoque disponível em nenhuma loja da rede no momento.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={reset}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={registerDemand}>Registrar que o cliente quis</button>
          </div>
        </div>
      )}
      {phase === "notFound" && (
        <div>
          <div className="cell-muted" style={{ fontSize: 12, marginBottom: 10 }}>
            <b style={{ color: "var(--text-primary)" }}>{q.trim()}</b> não está cadastrado no sistema. É possível registrar o nome avulso para consulta posterior.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={reset}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={registerDemand}>Registrar nome avulso</button>
          </div>
        </div>
      )}
      {phase === "registered" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--good)", fontWeight: 700, fontSize: 12.5 }}>
            <Icon name="check" size={14} />Registrado — obrigado por avisar
          </span>
          <button className="btn btn-ghost btn-sm" onClick={reset}>Buscar outro</button>
        </div>
      )}
    </div>
  );
}

/* Identificar paciente — busca inline (sem modal), igual ao IdentifyClient do artifact:
   card centrado com busca ao vivo por nome/CPF/telefone e "continuar sem identificar". */
function PdvIdentifyClient({ customers, onPick, onSkip, onCreate, title, desc }) {
  const [q, setQ] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const term = q.trim().toLowerCase();
  const results = term ? (customers || []).filter((c) => c.name.toLowerCase().includes(term) || (c.doc || "").includes(term) || (c.phone || "").includes(term)).slice(0, 8) : [];
  return (
    <div className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="card-pad" style={{ textAlign: "center", paddingBottom: 6 }}>
        <span className="stat-icon" style={{ width: 52, height: 52, borderRadius: 16, margin: "0 auto 14px" }}><Icon name="user" size={24} /></span>
        <h3 style={{ fontSize: 17 }}>{title || "Identificar paciente"}</h3>
        <div className="cell-muted" style={{ fontSize: 12.5, marginTop: 6, maxWidth: "40ch", marginInline: "auto", lineHeight: 1.5 }}>
          {desc || "Para iniciar o atendimento, identifique primeiro o paciente. O contador do atendimento começa assim que ele é identificado."}
        </div>
      </div>
      <div className="card-pad" style={{ paddingTop: 14 }}>
        <div className="identify-search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, CPF ou telefone..." autoFocus />
        </div>
        {results.length > 0 && (
          <div className="scrollbar-thin" style={{ marginTop: 12, maxHeight: 280, overflow: "hidden", overflowY: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
            {results.map((c) => (
              <button type="button" key={c.id || c.name} className="identify-result" onClick={() => onPick(c)}>
                <Avatar initials={c.avatar || c.name.split(" ").map((p) => p[0]).slice(0, 2).join("")} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{c.name}</div>
                  <div className="cell-muted" style={{ fontSize: 11 }}>{c.phone ? maskPhone(c.phone) : (c.doc || "sem CPF")} · {c.orders || 0} pedidos</div>
                </div>
                {c.tier && <Badge tone={tierTone(c.tier)}>{c.tier}</Badge>}
              </button>
            ))}
          </div>
        )}
        {term && results.length === 0 && <div className="cell-muted" style={{ fontSize: 12, padding: "16px 0", textAlign: "center" }}>Nenhum cliente encontrado com "{q}".</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span className="cell-muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>ou</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center", padding: "12px 14px" }} onClick={onSkip}>
            <Icon name="chevR" size={14} />Continuar sem identificar
          </button>
          {onCreate && (
            <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={() => setRegisterOpen(true)}>
              <Icon name="plusCircle" size={14} />Cadastrar novo cliente
            </button>
          )}
        </div>
      </div>
      {registerOpen && (
        <RegisterCustomerModal
          onClose={() => setRegisterOpen(false)}
          onCreate={onCreate}
          onCreated={(created) => { setRegisterOpen(false); onPick(created); }}
        />
      )}
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
function PdvCaixaQueue({ queue, onClaim, customerByName }) {
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

      {queue.map((entry, i) => {
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
  const { inventory, coupons = [], pdvCart, setPdvCart, pdvCustomer, setPdvCustomer, pdvAdd, pdvSetQty, pdvRemove, pdvClear, pdvSetLocation, fetchPdvItemLocations, pdvSearchProducts, pdvCreateReservation, pdvLogDemand, pdvFetchUpsellSuggestions, fetchPdvPrescriptionStatus, createPdvPrescription, fetchCustomerPurchaseInsights, fetchCustomerPaymentMethods, fetchCustomerAddresses, createPdvCustomerAddress, confirmPdvRecurrence, checkPdvDeliveryCoverage, fetchPdvDiscountLimit, fetchPdvDrafts, autosavePdvDraft, deletePdvDraft, finalizeSale, pdvQueue, pdvSendToCashier, pdvClaimFromQueue, recordSale, customers = [], customerByName = {}, storeFiscal = {}, pharmacistProfile = {}, notify, sendFiscalDocumentEmail, createPdvCustomer } = ctx;
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

  // Oportunidades de venda: sempre vem do backend, nunca de uma lista genérica local — com
  // carrinho vazio e cliente identificado, analisa só o histórico dele (perfil de compra e
  // recorrência, sem sinal de "comprado junto" já que não há carrinho pra cruzar); a partir do
  // primeiro item, passa a cruzar também co-compra (do próprio cliente e entre todos os
  // clientes) com o que está no carrinho. Sem carrinho e sem cliente identificado, não há o que
  // analisar — mostra um aviso em vez de uma lista genérica de mais vendidos.
  const [upsellSuggestions, setUpsellSuggestions] = useState([]);
  const [upsellLoading, setUpsellLoading] = useState(false);
  const upsellCustomerId = pdvCustomer && pdvCustomer.id ? pdvCustomer.id : null;
  useEffect(() => {
    if (lines.length === 0 && !upsellCustomerId) {
      setUpsellSuggestions([]);
      setUpsellLoading(false);
      return;
    }
    let cancelled = false;
    setUpsellLoading(true);
    const t = setTimeout(async () => {
      const found = pdvFetchUpsellSuggestions ? await pdvFetchUpsellSuggestions({
        cartItems: lines.map((l) => ({ name: l.name, brand: l.brand })),
        customerId: upsellCustomerId,
      }) : [];
      if (!cancelled) { setUpsellSuggestions(found); setUpsellLoading(false); }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [lines.map((l) => l.id + ":" + l.qty).join(","), upsellCustomerId]);

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
        actions={<PillNav options={[{ key: "pharm", label: "Tela do farmacêutico" }, { key: "caixa", label: "Tela do caixa" }]} active={operator} onChange={switchOperator} />}
      />

      {(operator === "caixa" ? !caixaReady : (!pdvCustomer && !caixaReady)) ? (
        operator === "caixa"
          ? (
            <>
              <div style={{ marginBottom: pdvQueue.length > 0 ? 16 : 0 }}>
                <PdvIdentifyClient
                  customers={customers} onCreate={createPdvCustomer}
                  title="Identificar cliente" desc="Identifique o cliente para abrir a venda no caixa, ou continue sem identificar."
                  onPick={(c) => { setPdvCustomer(c); setCaixaReady(true); }}
                  onSkip={() => setCaixaReady(true)}
                />
              </div>
              {pdvQueue.length > 0 && (
                <PdvCaixaQueue queue={pdvQueue} onClaim={(entry) => { pdvClaimFromQueue(entry.id); setDiscount(entry.discount || 0); setCaixaReady(true); }} customerByName={customerByName} />
              )}
            </>
          )
          : (
            <>
              <PdvDraftRecoveryList drafts={drafts} onRecover={recoverDraft} onDiscard={setDiscardTarget} />
              <PdvIdentifyClient
                customers={customers} onCreate={createPdvCustomer}
                onPick={(c) => { setPdvCustomer(c); setCaixaReady(true); }}
                onSkip={() => setCaixaReady(true)}
              />
            </>
          )
      ) : (
      <>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginBottom: 10 }}>
          {lines.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--critical)" }} onClick={pdvClear}><Icon name="trash" size={13} />Limpar carrinho</button>
          )}
          {operator === "pharm" && pdvCustomer && (
            <button className="btn btn-ghost btn-sm" onClick={pauseAtendimento}><Icon name="chevL" size={14} />Voltar para seleção</button>
          )}
          {startedAt && (
            <span className="badge badge-neutral mono"><Icon name="clock" size={11} />{fmtAtendimento(elapsed)} de atendimento</span>
          )}
        </div>
        <div className="pdv-shell">
        {/* Coluna: cliente + sugestões + busca (rola independente do carrinho) */}
        <div className="scrollbar-thin" style={{ overflowY: "auto", minWidth: 0 }}>
          {/* Cliente — trocar/identificar abre a mesma busca inline usada no gate, sem modal */}
          {idOpen ? (
            <div style={{ marginBottom: 14 }}>
              <PdvIdentifyClient
                customers={customers} onCreate={createPdvCustomer}
                title="Trocar cliente" desc="Busque outro cliente para vincular a esta venda, ou continue sem identificar."
                onPick={(c) => { setPdvCustomer(c); setIdOpen(false); }}
                onSkip={() => { setPdvCustomer(null); setIdOpen(false); }}
              />
            </div>
          ) : pdvCustomer ? (
            <div className="card card-pad" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <Avatar initials={pdvCustomer.avatar || pdvCustomer.name.split(" ").map((p) => p[0]).slice(0, 2).join("")} size={38} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{pdvCustomer.name}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                      {pdvCustomer.tier && <Badge tone={tierTone(pdvCustomer.tier)}>{pdvCustomer.tier}</Badge>}
                      {pdvCustomer.recurring && <RecurringBadge name={pdvCustomer.name} small customerByName={customerByName} />}
                      <span className="cell-muted" style={{ fontSize: 11 }}>{pdvCustomer.phone ? maskPhone(pdvCustomer.phone) : (pdvCustomer.doc || "sem CPF")}</span>
                    </div>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setIdOpen(true)}><Icon name="user" size={13} />Trocar cliente</button>
              </div>
              <div className="grid g-4" style={{ marginTop: 14, gap: 10 }}>
                <div>
                  <div className="cell-muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em" }}>Aniversário</div>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{fmtBirthday(pdvCustomer.birthDate) || "—"}</div>
                </div>
                <div>
                  <div className="cell-muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em" }}>Cliente desde</div>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{pdvCustomer.since || "—"}</div>
                </div>
                <div>
                  <div className="cell-muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em" }}>Última compra</div>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{recencyLabel(pdvCustomer.lastDays) || "—"}</div>
                </div>
                <div>
                  <div className="cell-muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em" }}>Frequência</div>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{pdvCustomer.freqDays ? `a cada ${pdvCustomer.freqDays} dias` : "—"}</div>
                </div>
              </div>
              {Array.isArray(pdvCustomer.children) && pdvCustomer.children.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  <span className="cell-muted">Filhos: </span>
                  {pdvCustomer.children.map((c, i) => (
                    <span key={i}>{i > 0 ? ", " : ""}{c.name ? c.name : "Filho(a)"}{c.age != null ? ` (${c.age} ${c.age === 1 ? "ano" : "anos"})` : ""}</span>
                  ))}
                </div>
              )}
              {Array.isArray(pdvCustomer.topProducts) && pdvCustomer.topProducts.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="cell-muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 5 }}>Costuma comprar</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {representativePurchasesByCategory(pdvCustomer.topProducts).map((p, i) => (
                      <div key={p.n + i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.n}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                          {p.continuous && <Badge tone="accent">Uso contínuo</Badge>}
                          {p.cat && <span className="cell-muted">{p.cat}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card card-pad" style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{operator === "caixa" ? "Consumidor não identificado" : "Cliente não identificado"}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => operator === "caixa" ? resetAtendimento() : setIdOpen(true)}>{operator === "caixa" ? "Trocar pedido" : "Identificar agora"}</button>
            </div>
          )}

          {/* ===== Visão do FARMACÊUTICO: sugestões do que o cliente mais compra + recorrência ===== */}
          {operator === "pharm" && <PdvUpsell items={upsellSuggestions} loading={upsellLoading} hasContext={lines.length > 0 || !!upsellCustomerId} onAdd={pdvAdd} />}
          {operator === "pharm" && pdvCustomer && <PdvRecurrenceSuggestions candidates={insights.recurrenceCandidates} onConfigure={setRecurrenceCandidate} />}

          {/* Retirada na loja ou entrega (visão do farmacêutico, com cliente identificado) */}
          {operator === "pharm" && pdvCustomer && (
            <div style={{ marginBottom: 14 }}><PdvFulfillmentPicker delivery={delivery} setDelivery={setDelivery} checkPdvDeliveryCoverage={checkPdvDeliveryCoverage} savedAddresses={savedAddresses} onSaveAddress={saveCustomerAddress} /></div>
          )}

          {/* Produto que o cliente queria e não encontramos — busca em outras lojas da rede, reserva ou registra a demanda */}
          {operator === "pharm" && (
            <PdvMissingProductBox pdvSearchProducts={pdvSearchProducts} pdvLogDemand={pdvLogDemand} customer={pdvCustomer} onReserve={openReservation} />
          )}

          {/* Catálogo de produtos — cartão persistente com a lista abaixo da busca, igual ao artifact */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
              <SearchInput value={q} onChange={setQ} placeholder="Buscar produto, marca ou EAN — ou bipar o código de barras" />
            </div>
            {q.trim() === "" ? (
              dedupeByName(inventory.filter((it) => it.qty > 0)).length === 0 ? (
                <div className="cell-muted" style={{ padding: "22px 14px", fontSize: 12.5, textAlign: "center" }}>Nenhum produto em estoque nesta loja.</div>
              ) : (
                <div>
                  {dedupeByName(inventory.filter((it) => it.qty > 0)).slice(0, 30).map((it) => (
                    <button type="button" key={it.id} className="identify-result" onClick={() => pdvAdd(it.id)}>
                      <div className="prod-row-icon"><Icon name={it.controlled ? "lock" : "box"} size={16} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{it.name}</div>
                        <div className="cell-muted mono" style={{ fontSize: 10.5 }}>{it.sku || it.ean}</div>
                      </div>
                      {it.controlled && <Badge tone="warning">Controlado</Badge>}
                      <span style={{ fontWeight: 800, fontFamily: "var(--font-display)", fontSize: 13 }}>{brl(it.price)}</span>
                      <Icon name="plus" size={14} style={{ color: "var(--text-muted)", flex: "none" }} />
                    </button>
                  ))}
                </div>
              )
            ) : results.length === 0 ? (
              <div className="cell-muted" style={{ padding: "22px 14px", fontSize: 12.5, textAlign: "center" }}>Nenhum produto encontrado.</div>
            ) : (
              <div>
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
                        type="button" className="identify-result"
                        style={{ cursor: (outOfStock || (!availableHere && !canReserveElsewhere)) ? "not-allowed" : "pointer", opacity: (outOfStock || (!availableHere && !canReserveElsewhere)) ? 0.5 : 1 }}
                        onClick={() => {
                          if (availableHere) { addComponent(own); return; }
                          if (canReserveElsewhere) setExpandedResultId((prev) => (prev === it.id ? null : it.id));
                        }}
                        disabled={outOfStock || (!availableHere && !canReserveElsewhere)}
                      >
                        <div className="prod-row-icon"><Icon name={it.controlled ? "lock" : "box"} size={16} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12.5 }}>{it.name}</div>
                          <div className="cell-muted mono" style={{ fontSize: 10.5 }}>
                            {it.ean}
                            {availableHere ? " · " + own.loc : canReserveElsewhere ? " · em outra loja" : outOfStock ? " · esgotado" : ""}
                          </div>
                        </div>
                        {it.controlled && <Badge tone="warning">Controlado</Badge>}
                        <span style={{ fontWeight: 800, fontFamily: "var(--font-display)", fontSize: 13 }}>{brl(availableHere ? own.price : (otherComponents[0] ? otherComponents[0].price : 0))}</span>
                        <Icon name={availableHere ? "plus" : (canReserveElsewhere ? "chevD" : "x")} size={14} style={{ color: "var(--text-muted)", flex: "none", transform: !availableHere && canReserveElsewhere && expanded ? "rotate(180deg)" : "none" }} />
                      </button>
                      {!availableHere && canReserveElsewhere && expanded && (
                        <div style={{ padding: "4px 10px 8px 56px", display: "flex", flexDirection: "column", gap: 4 }}>
                          {otherComponents.map((component) => (
                            <button key={component.id} type="button" className="identify-result" style={{ border: "1px solid var(--border)", borderRadius: 10 }} onClick={() => openReservation(component)}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 12.5 }}>{component.storeName || "Loja"}</div>
                                <div className="cell-muted" style={{ fontSize: 11 }}>{component.loc} · {brl(component.price)}</div>
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

        </div>

        {/* Coluna: carrinho + pagamento + total — painel fixo, só a lista de itens rola */}
        <div className="pdv-cart">
          <div className="pdv-cart-items scrollbar-thin" style={lines.length > 6 ? { maxHeight: 340 } : undefined}>
            {lines.length === 0 ? (
              <EmptyState icon="scan" title="Comece a registrar a venda" desc="Busque ou bipe um produto para adicioná-lo." />
            ) : lines.map((l) => {
              const rx = l.controlled ? (prescriptionStatus[l.id] || { status: "missing" }) : null;
              const rxMeta = rx ? (PRESCRIPTION_STATUS_META[rx.status] || PRESCRIPTION_STATUS_META.missing) : null;
              return (
              <div key={l.id} className="pdv-cart-line">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
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
                  <div className="cell-muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{brl(l.price)} un · {l.brand}{l.storeName ? " · " + l.storeName : ""}</span>
                    {(itemLocations[l.id] || []).length > 0 ? (
                      <select
                        className="input"
                        style={{ width: "auto", minWidth: 140, height: 24, padding: "0 6px", fontSize: 11 }}
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
                <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => pdvSetQty(l.id, l.qty - 1)}><Icon name="minus" size={11} /></button>
                <span className="mono" style={{ width: 18, textAlign: "center", fontSize: 12 }}>{l.qty}</span>
                <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => pdvSetQty(l.id, l.qty + 1)}><Icon name="plus" size={11} /></button>
                <span className="tnum" style={{ width: 64, textAlign: "right", fontWeight: 700, fontSize: 12 }}>{brl(l.price * l.qty)}</span>
                <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="remover" onClick={() => pdvRemove(l.id)}><Icon name="x" size={11} /></button>
              </div>
              );
            })}
          </div>

          {hasControlled && (
            <div className="pdv-rx-blocked-note">
              <Icon name="lock" size={12} />
              Há item <b>controlado (tarja)</b> na venda — toque no selo de receita do item para validar antes de {operator === "pharm" ? "enviar ao caixa" : "finalizar"}.
            </div>
          )}

          <div style={{ padding: 14, borderTop: "1px solid var(--border)" }}>
            {/* ===== Visão do CAIXA: pagamento + CPF na nota ===== */}
            {operator === "caixa" && (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {PAY_METHODS.map((m) => (
                    <button
                      key={m.id} type="button" className="btn btn-sm" style={{ flex: "1 1 70px", background: pay === m.id ? "var(--accent)" : "var(--surface-2)", color: pay === m.id ? "var(--accent-contrast)" : "var(--text-secondary)" }}
                      onClick={() => setPay(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 14 }} onClick={() => setCpfNota(!cpfNota)}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", background: cpfNota ? "var(--accent)" : "transparent", borderColor: cpfNota ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>{cpfNota && <Icon name="check" size={12} />}</span>
                  Incluir CPF na nota fiscal
                </label>
              </>
            )}

            {/* Retirada/entrega (visão do farmacêutico) — resumo; a escolha em si fica na coluna da esquerda */}
            {operator === "pharm" && pdvCustomer && (
              <div className="cell-muted" style={{ fontSize: 11, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name={delivery.fulfillmentType === "delivery" ? "truck" : "bag"} size={12} />
                {delivery.fulfillmentType === "delivery" ? "Entrega" + (delivery.addressLine ? " · " + delivery.addressLine : "") : "Retirada na loja"}
              </div>
            )}

            <Field label="Desconto adicional (%)" hint={discountLimit < 100 ? `Máximo permitido: ${discountLimit}% — limite de margem do produto${cashAvailable > 0 ? " e cashback do cliente" : ""}` : undefined}>
              <input className="input" type="number" min="0" max={discountLimit} value={discount} disabled={!!appliedCoupon} onChange={(e) => setDiscount(Math.max(0, Math.min(discountLimit, +e.target.value)))} />
            </Field>

            {/* Cashback do cliente (visão do caixa) — aplicar saldo além do desconto, logo abaixo dele */}
            {operator === "caixa" && pdvCustomer && cashAvailable > 0 && (
              <div style={{ margin: "10px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 12 }}>
                  <span>Usar cashback disponível ({brl(cashAvailable)})</span>
                  <SwitchToggle on={cashWanted > 0} onChange={(on) => setCashWanted(on ? Math.min(cashAvailable, afterDisc) : 0)} />
                </div>
                {cashWanted > 0 && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="input" type="number" min="0" step="0.01" max={Math.min(cashAvailable, afterDisc)} value={cashWanted} onChange={(e) => setCashWanted(Math.max(0, +e.target.value || 0))} placeholder="0,00" style={{ flex: 1, fontSize: 11.5 }} />
                  </div>
                )}
              </div>
            )}
            <div style={{ margin: "10px 0" }}>
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

            <KV label="Subtotal" value={brl(subtotal)} />
            {discVal > 0 && <KV label={appliedCoupon ? "Cupom aplicado" : "Desconto aplicado"} value={"− " + brl(discVal)} />}
            {cashApplied > 0 && <KV label="Cashback aplicado" value={"− " + brl(cashApplied)} />}
            <KV label="Itens" value={count} />
            <KV label="Total" value={<span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16 }}>{brl(total)}</span>} />
            {pdvCustomer && lines.length > 0 && <div className="cell-muted" style={{ textAlign: "right", marginTop: 2, marginBottom: 8 }}>O cashback ganho é calculado ao emitir a nota</div>}

            {operator === "pharm" ? (
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12, marginTop: 4 }} disabled={lines.length === 0} onClick={async () => { const ok = await pdvSendToCashier({ customer: pdvCustomer, items: pdvCart, discount, couponCode: appliedCoupon ? appliedCoupon.code : "", delivery, draftId }); if (ok) { setDraftId(null); finalizeSale && finalizeSale("Pedido enviado ao caixa"); setSentModal(true); } }}>
                <Icon name="send" size={15} />Enviar para o caixa
              </button>
            ) : (
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12, marginTop: 4 }} disabled={lines.length === 0} onClick={emit}>
                <Icon name="receipt" size={15} />Gerar nota fiscal
              </button>
            )}
          </div>
        </div>
        </div>
      </>
      )}

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
        <Modal open onClose={() => setSentModal(false)} title="Enviado para o caixa">
          <div style={{ textAlign: "center" }}>
            <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 14px", background: "var(--good-soft)", color: "var(--good)" }}><Icon name="check" size={28} /></span>
            <p className="page-desc" style={{ lineHeight: 1.55 }}>O pedido foi salvo e enviado para o caixa{pdvCustomer ? " no nome de " + pdvCustomer.name : ""}. O caixa vê os mesmos itens e finaliza com o pagamento e a nota fiscal.</p>
            <button className="btn btn-primary btn-lg" style={{ marginTop: 18, width: "100%", justifyContent: "center" }} onClick={() => { setSentModal(false); resetAtendimento(); }}>Atender próximo paciente</button>
          </div>
        </Modal>
      )}

      {/* Confirmação: descartar um atendimento em andamento */}
      {discardTarget && (
        <Modal open onClose={() => setDiscardTarget(null)} title="Descartar atendimento?">
          <div style={{ textAlign: "center" }}>
            <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 14px", background: "var(--critical-soft)", color: "var(--critical)" }}><Icon name="trash" size={26} /></span>
            <p className="page-desc" style={{ lineHeight: 1.55 }}>
              O atendimento de {discardTarget.customer ? discardTarget.customer.name : "consumidor não identificado"} será excluído e não poderá ser recuperado.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setDiscardTarget(null)}>Cancelar</button>
              <button className="btn btn-danger-solid" style={{ flex: 1, justifyContent: "center" }} onClick={confirmDiscardDraft}><Icon name="trash" size={15} />Descartar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reservar produto disponível em outra loja, para o cliente retirar lá */}
      {reservationTarget && (
        <Modal open onClose={() => setReservationTarget(null)} title={"Reservar em " + (reservationTarget.storeName || "outra loja")}>
          <div style={{ textAlign: "center" }}>
            <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 14px", background: "var(--warning-soft)", color: "var(--warning)" }}><Icon name="pin" size={26} /></span>
            <p className="page-desc" style={{ lineHeight: 1.55 }}>
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
        </Modal>
      )}

      {/* Confirmação: reserva concluída com sucesso */}
      {reservationConfirmed && (
        <Modal open onClose={() => setReservationConfirmed(null)} title="Reserva confirmada">
          <div style={{ textAlign: "center" }}>
            <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 14px", background: "var(--good-soft)", color: "var(--good)" }}><Icon name="check" size={28} /></span>
            <p className="page-desc" style={{ lineHeight: 1.55 }}>
              {reservationConfirmed.productName} reservado na loja {reservationConfirmed.storeName}, válido até {reservationConfirmed.expiresAtLabel}.
              Oriente o cliente a retirar diretamente lá.
            </p>
            <button className="btn btn-primary btn-lg" style={{ marginTop: 18, width: "100%", justifyContent: "center" }} onClick={() => setReservationConfirmed(null)}>Entendi</button>
          </div>
        </Modal>
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
    <Modal
      open onClose={onClose} title={"Validar receita — " + line.name}
      subtitle="Este item exige receita. Confira o documento físico apresentado pelo cliente, ou envie o link da receita digital para validação — a venda só pode ser enviada ao caixa depois de validada."
    >
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
    </Modal>
  );
}

/* ---------- Modal: identificar cliente ---------- */
/* ---------- Modal: cadastrar cliente (nome, e-mail, CPF e telefone) ---------- */
function RegisterCustomerModal({ onClose, onCreate, onCreated }) {
  const [cpf, setCpf] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const cpfDigits = cpf.replace(/\D/g, "").length;
  const emailValid = EMAIL_PATTERN.test(email.trim());
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
    <Modal
      open onClose={onClose} title="Cadastrar cliente"
      subtitle="Nome e/ou CPF são obrigatórios. O e-mail também é obrigatório: assim que o cadastro é concluído, enviamos automaticamente uma senha temporária para o cliente acessar a própria conta no marketplace."
    >
      <div style={{ marginBottom: 10 }}><Field label={"Nome " + (cpfDigits === 11 ? "(opcional)" : "")}><input autoFocus className="input" placeholder="Nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} /></Field></div>
      <div style={{ marginBottom: 10 }}>
        <Field label="E-mail" hint="Obrigatório — usado para enviar o acesso à conta do cliente">
          <input className="input" type="email" placeholder="cliente@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {email.trim() && !emailValid && <div style={{ marginTop: 4, color: "var(--critical)", fontSize: 12 }}>E-mail inválido.</div>}
      </div>
      <div style={{ marginBottom: 10 }}><Field label={"CPF " + (nome.trim() ? "(opcional)" : "")}><input className="input mono" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} /></Field></div>
      <div style={{ marginBottom: 12 }}><Field label="Telefone (opcional)"><input className="input mono" inputMode="numeric" maxLength={19} placeholder="+55 (00) 00000-0000" value={telefone} onChange={(e) => setTelefone(maskPhone(e.target.value))} /></Field></div>
      {createError ? <div style={{ marginBottom: 10, color: "var(--critical)", fontSize: 12.5 }}>{createError}</div> : null}
      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={saving || !emailValid || !(nome.trim() || cpfDigits === 11)} onClick={handleCreate}>
        <Icon name="user" size={16} />{saving ? "Cadastrando..." : "Cadastrar e enviar acesso"}
      </button>
    </Modal>
  );
}

/* ---------- Modal: confirmar recorrência e cobrar no cartão salvo ---------- */
function RecurrenceConfirmModal({ candidate, customerId, pdvSearchProducts, fetchCustomerPaymentMethods, confirmPdvRecurrence, onClose, onConfirmed }) {
  const [loading, setLoading] = useState(true);
  const [resolvedItem, setResolvedItem] = useState(null); // componente de estoque real que casa com o candidato
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [frequencyDays, setFrequencyDays] = useState(candidate.frequencyDays || 30);
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
      <Modal open onClose={() => onConfirmed(result)} title="Assinatura confirmada">
        <span className="stat-icon" style={{ width: 52, height: 52, marginBottom: 14, background: "var(--good-soft)", color: "var(--good)" }}><Icon name="check" size={26} /></span>
        <p className="page-desc" style={{ marginBottom: 16 }}>
          Primeira cobrança de {brl(result.totalCharged)} realizada no cartão salvo, com {result.discountPercent}% de desconto aplicado.
          A partir de agora, o Asaas cobra o mesmo valor automaticamente no cartão todos os meses — sem precisar confirmar de novo.
        </p>
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => onConfirmed(result)}>Fechar</button>
      </Modal>
    );
  }

  return (
    <Modal
      open onClose={onClose} title="Configurar recorrência"
      subtitle={
        candidate.name + " · " + (
          candidate.intervalDetected
            ? `padrão identificado: comprado a cada ${candidate.frequencyDays} dias, ${candidate.occurrences}× seguindo esse ritmo.`
            : "medicamento de uso contínuo — sugestão de assinatura mesmo sem 3 compras seguidas ainda."
        ) + " Assinatura no Asaas, cobrada automaticamente no cartão todo mês, com 15% de desconto."
      }
    >
      {loading ? (
        <div className="cell-muted" style={{ padding: "12px 0" }}>Carregando estoque e cartões salvos...</div>
      ) : !resolvedItem ? (
        <div style={{ color: "var(--critical)", fontSize: 13, marginBottom: 12 }}>Este produto não foi encontrado no estoque atual — não é possível confirmar a recorrência agora.</div>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <Field label="Quantidade por ciclo"><QtyStepper value={quantity} onChange={setQuantity} min={1} max={20} /></Field>
          </div>
          <div style={{ marginBottom: 10 }}>
            <Field label="Ciclo de recompra do cliente (dias)" hint="Usado só para calcular a economia por ciclo — a cobrança no Asaas é sempre mensal, para ficar previsível.">
              <input className="input" type="number" min="7" max="365" value={frequencyDays} onChange={(e) => setFrequencyDays(Math.max(7, +e.target.value || 30))} />
            </Field>
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
          <div className="cell-muted" style={{ marginBottom: 4 }}>Primeira cobrança agora, e todo mês a partir daí: <b>{brl((resolvedItem.price * (1 - 0.15)) * quantity)}</b></div>
          <div className="cell-muted" style={{ marginBottom: 12 }}>Economia por ciclo: <b style={{ color: "var(--good)" }}>{brl(resolvedItem.price * 0.15 * quantity)}</b></div>
          {error ? <div style={{ marginBottom: 10, color: "var(--critical)", fontSize: 12.5 }}>{error}</div> : null}
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={saving || !paymentMethodId} onClick={handleConfirm}>
            <Icon name="repeat" size={16} />{saving ? "Assinando..." : "Confirmar assinatura e cobrar agora"}
          </button>
        </>
      )}
    </Modal>
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
    <Modal open onClose={onClose} title="Venda concluída" subtitle="Nota fiscal autorizada com sucesso.">
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
    </Modal>
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
    <Modal
      open onClose={onClose}
      title={sent ? "Nota enviada!" : "Enviar nota por e-mail"}
      subtitle={sent ? undefined : "Envie a NFC-e nº " + nota.numero + " (" + brl(nota.total) + ") para o cliente."}
    >
      {sent ? (
        <div style={{ textAlign: "center" }}>
          <span className="stat-icon" style={{ width: 56, height: 56, margin: "0 auto 14px", background: "var(--good-soft)", color: "var(--good)" }}><Icon name="check" size={28} /></span>
          <p className="page-desc" style={{ lineHeight: 1.55 }}>A NFC-e nº {nota.numero} foi enviada para <b>{target}</b>{alsoWa ? " e por WhatsApp" : ""}.</p>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 18, width: "100%", justifyContent: "center" }} onClick={onClose}>Concluir</button>
        </div>
      ) : (
        <>
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
    </Modal>
  );
}

export { NotaFiscalModal, PAY_METHODS, PdvCaixaQueue, PdvIdentifyClient, PdvScreen, PdvUpsell, QrPlaceholder, RegisterCustomerModal, SendNotaModal, creditCashback, fmtAtendimento, maskCPF };
