import React, { useEffect, useState } from "react";
import { ModalShell, QtyStepper, brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { fetchViaCepAddress, formatCep } from "../../marketplace/core/marketplace-address.js";
import { RecurringBadge, Topbar } from "../core/internal-shell.jsx";

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
    if (rnd() > 0.52) cells.push(<rect key={r + '-' + c} x={c} y={r} width="1" height="1" fill="#1a1a1a" />);
  }
  const Finder = ({ x, y }) => (<g><rect x={x} y={y} width="7" height="7" fill="none" stroke="#1a1a1a" strokeWidth="1" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#1a1a1a" /></g>);
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" shapeRendering="crispEdges" style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--fa-mist)' }}>
      {cells}<Finder x={0} y={0} /><Finder x={14} y={0} /><Finder x={0} y={14} />
    </svg>
  );
}

const PAY_METHODS = [
  { id: 'cash', label: 'Dinheiro', icon: 'cash' },
  { id: 'pix', label: 'Pix', icon: 'pix' },
  { id: 'debit', label: 'Débito', icon: 'card' },
  { id: 'credit', label: 'Crédito', icon: 'card' },
];

/* Máscara de CPF: 000.000.000-00 */
function maskCPF(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
  return d;
}

/* Máscara de telefone: +DDI (DDD) XXXXX-XXXX, ex. +55 (61) 99811-2201 */
function maskPhone(v) {
  const withoutOwnPrefix = (v || '').replace(/^\+55\s*\(?/, '');
  let d = withoutOwnPrefix.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(-11);
  d = d.slice(0, 11);
  if (!d) return '';
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (d.length <= 2) return `+55 (${ddd}`;
  if (rest.length > 4) return `+55 (${ddd}) ${rest.slice(0, -4)}-${rest.slice(-4)}`;
  return `+55 (${ddd}) ${rest}`;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* Formata "YYYY-MM-DD" como "DD/MM" para exibição no card do cliente. */
function fmtBirthday(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? `${match[3]}/${match[2]}` : '';
}

/* Cores do selo de fidelidade — mesma paleta usada no CRM (crm-screen.jsx), para consistência visual. */
function tierStyle(tier) {
  const map = {
    Ouro: { bg: '#FBF1D8', fg: '#9A7B1F' },
    Prata: { bg: '#ECEEF1', fg: '#5B6675' },
    Bronze: { bg: '#F3E6DC', fg: '#8A5A33' },
    Novo: { bg: 'var(--fa-info-soft)', fg: 'var(--fa-info)' },
  };
  return map[tier] || map.Novo;
}

/* Estatística compacta do cliente no card do balcão (versão reduzida do CrmStat do CRM). */
function PdvCustomerStat({ label, value }) {
  return (
    <div style={{ background: 'var(--fa-mist-2)', borderRadius: 9, padding: '7px 8px' }}>
      <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>{value}</div>
      <div className="fa-faint" style={{ fontSize: 10.5, marginTop: 1 }}>{label}</div>
    </div>
  );
}

/* Rótulo de recência: "há X dias" / "ontem" / "hoje", igual ao usado no CRM. */
function recencyLabel(lastDays) {
  if (lastDays == null) return '';
  if (lastDays === 0) return 'Comprou hoje';
  if (lastDays === 1) return 'Última compra ontem';
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
    const key = tp.name.toLowerCase().split(' ')[0];
    const it = inventory.find((x) => x.name.toLowerCase().includes(key) && x.qty > 0);
    if (it && !pool.find((p) => p.it.id === it.id)) pool.push({ it, q: tp.totalQuantity });
  });
  if (pool.length < 3) {
    inventory.filter((x) => x.qty > 0).slice(0, 6).forEach((it) => { if (!pool.find((p) => p.it.id === it.id)) pool.push({ it, q: null }); });
  }
  return pool.filter((p) => !inCart.has(p.it.id)).slice(0, 4);
}

/* Painel de sugestões (visão do farmacêutico) */
function PdvUpsell({ customer, insights, inventory, cart, onAdd }) {
  const sugg = pdvSuggestions(insights, inventory, cart);
  return (
    <div className="fa-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span className="ph-stat-ic" style={{ width: 32, height: 32, background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}><Icon name="sparkle" size={16} /></span>
        <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>{customer ? 'O cliente costuma comprar' : 'Para oferecer'}</span>
      </div>
      <div className="ph-cell-sub" style={{ marginBottom: 12 }}>{customer ? 'Sugira na hora — itens recorrentes de ' + customer.name.split(' ')[0] : 'Identifique o cliente para sugestões personalizadas · mais vendidos da loja'}</div>
      {sugg.length === 0 ? (
        <div className="fa-faint" style={{ fontSize: 13 }}>Sem sugestões no momento.</div>
      ) : sugg.map((s) => (
        <div key={s.it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--fa-mist)' }}>
          <span className="fa-iconbox" style={{ width: 36, height: 36, flex: 'none' }}><Icon name="pill" size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.it.name}</div>
            <div className="ph-cell-sub">{brl(s.it.price)}{s.q ? ' · comprou ' + s.q + '×' : ' · mais vendido'}</div>
          </div>
          <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 'none' }} onClick={() => onAdd(s.it.id)}><Icon name="plus" size={14} stroke={2.2} />Oferecer</button>
        </div>
      ))}
    </div>
  );
}

/* Painel de retirada na loja ou entrega — escolhe um endereço já salvo do cliente ou cadastra um novo
   (mesmo padrão de CEP/cobertura do checkout do marketplace), em vez de digitar o CEP a cada venda. */
function PdvFulfillmentPicker({ delivery, setDelivery, checkPdvDeliveryCoverage, savedAddresses = [], onSaveAddress }) {
  const type = delivery.fulfillmentType || 'pickup';
  const [cepStatus, setCepStatus] = useState({ loading: false, hint: '', error: '' });
  const [coverage, setCoverage] = useState({ configured: false, covered: true });
  const [mode, setMode] = useState(savedAddresses.length ? 'pick' : 'new'); // pick | new
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [saveNewAddress, setSaveNewAddress] = useState(true);
  const [savingAddress, setSavingAddress] = useState(false);
  const lastCepRef = React.useRef('');
  const knownAddressIdsRef = React.useRef(new Set());

  // Quando os endereços salvos do cliente chegam (identificação concluída), volta para o modo de escolha.
  useEffect(() => {
    knownAddressIdsRef.current = new Set(savedAddresses.map((a) => a.id));
    if (savedAddresses.length === 0) { setMode('new'); return; }
    setMode('pick');
    setSelectedAddressId('');
  }, [savedAddresses]);

  const pickAddress = (address) => {
    setSelectedAddressId(address.id);
    setDelivery({
      ...delivery,
      fulfillmentType: 'delivery',
      addressId: address.id,
      postalCode: address.postalCode,
      addressLine: address.addressLine,
      addressNumber: '',
      district: address.district,
      city: address.city,
      stateCode: address.stateCode,
      recipientName: address.recipientName || delivery.recipientName || '',
      recipientPhone: address.recipientPhone || '',
      referenceNote: address.referenceNote || '',
    });
  };

  const startNewAddress = () => {
    setSelectedAddressId('');
    setMode('new');
    lastCepRef.current = '';
    setDelivery({ ...delivery, fulfillmentType: 'delivery', addressId: '', postalCode: '', addressLine: '', addressNumber: '', district: '', city: '', stateCode: '' });
  };

  useEffect(() => {
    const digits = String(delivery.postalCode || '').replace(/\D/g, '');
    if (digits.length !== 8 || type !== 'delivery' || mode !== 'new' || digits === lastCepRef.current) return;
    let active = true;
    (async () => {
      setCepStatus({ loading: true, hint: '', error: '' });
      try {
        const result = await fetchViaCepAddress(delivery.postalCode);
        if (!active) return;
        lastCepRef.current = digits;
        const next = { ...delivery, postalCode: result.cep, addressLine: result.street || delivery.addressLine, district: result.district || delivery.district, city: result.city || delivery.city, stateCode: result.state || delivery.stateCode };
        setDelivery(next);
        setCepStatus({ loading: false, hint: 'Endereço preenchido automaticamente pelo CEP.', error: '' });
        const found = checkPdvDeliveryCoverage ? await checkPdvDeliveryCoverage({ district: next.district, city: next.city, stateCode: next.stateCode, postalCode: next.postalCode }) : { configured: false, covered: true };
        if (active) setCoverage(found);
      } catch (error) {
        if (active) setCepStatus({ loading: false, hint: '', error: error && error.message ? error.message : 'Não foi possível buscar o CEP.' });
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
        if (created) { pickAddress(created); setMode('pick'); }
      }
    } finally {
      setSavingAddress(false);
    }
  };

  return (
    <div className="fa-card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Retirada ou entrega</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: type === 'delivery' ? 12 : 0 }}>
        <button className="fa-choice" data-on={type === 'pickup' ? '1' : '0'} style={{ padding: 12 }} onClick={() => setDelivery({ ...delivery, fulfillmentType: 'pickup' })}>
          <span className="fa-iconbox" style={{ width: 32, height: 32 }}><Icon name="bag" size={16} /></span>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Retirar na loja</span>
        </button>
        <button className="fa-choice" data-on={type === 'delivery' ? '1' : '0'} style={{ padding: 12 }} onClick={() => setDelivery({ ...delivery, fulfillmentType: 'delivery' })}>
          <span className="fa-iconbox" style={{ width: 32, height: 32 }}><Icon name="truck" size={16} /></span>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Entregar</span>
        </button>
      </div>

      {type === 'delivery' && mode === 'pick' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {savedAddresses.map((address) => (
              <button key={address.id} className="fa-choice" data-on={selectedAddressId === address.id ? '1' : '0'} style={{ padding: 10, textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 8 }} onClick={() => pickAddress(address)}>
                <span className="fa-iconbox" style={{ width: 30, height: 30, flex: 'none' }}><Icon name="pin" size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {address.label}
                    {address.isPrimary && <span className="fa-badge fa-badge-mist" style={{ fontSize: 10 }}>Principal</span>}
                  </div>
                  <div className="ph-cell-sub">{[address.addressLine, address.district, address.city].filter(Boolean).join(' · ')}</div>
                </div>
              </button>
            ))}
          </div>
          <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ width: '100%' }} onClick={startNewAddress}><Icon name="plus" size={14} />Adicionar novo endereço</button>
          {selectedAddressId && (
            <div className="fa-field" style={{ marginTop: 10 }}><label>Nome de quem recebe</label><input className="fa-input" value={delivery.recipientName || ''} onChange={(e) => setDelivery({ ...delivery, recipientName: e.target.value })} /></div>
          )}
          {blocked && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--fa-error)' }}>Fora da área de entrega — escolha retirar na loja.</div>}
        </>
      )}

      {type === 'delivery' && mode === 'new' && (
        <>
          {savedAddresses.length > 0 && (
            <button className="fa-btn fa-btn-ghost fa-btn-sm" style={{ marginBottom: 10 }} onClick={() => setMode('pick')}><Icon name="chevL" size={14} />Usar um endereço salvo</button>
          )}
          <div className="fa-field" style={{ marginBottom: 8 }}>
            <label>CEP</label>
            <input className="fa-input fa-mono" inputMode="numeric" maxLength={9} placeholder="00000-000" value={delivery.postalCode || ''} onChange={(e) => setDelivery({ ...delivery, postalCode: formatCep(e.target.value) })} />
            {cepStatus.loading && <div className="fa-faint" style={{ fontSize: 12, marginTop: 4 }}>Buscando endereço...</div>}
            {cepStatus.error && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--fa-error)' }}>{cepStatus.error}</div>}
            {blocked && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--fa-error)' }}>Fora da área de entrega — escolha retirar na loja.</div>}
          </div>
          <div className="fa-field" style={{ marginBottom: 8 }}>
            <label>Endereço</label>
            <input className="fa-input" placeholder="Rua, número" value={delivery.addressLine || ''} onChange={(e) => setDelivery({ ...delivery, addressLine: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div className="fa-field"><label>Número</label><input className="fa-input" value={delivery.addressNumber || ''} onChange={(e) => setDelivery({ ...delivery, addressNumber: e.target.value })} /></div>
            <div className="fa-field"><label>Bairro</label><input className="fa-input" value={delivery.district || ''} onChange={(e) => setDelivery({ ...delivery, district: e.target.value })} /></div>
          </div>
          <div className="fa-field" style={{ marginBottom: 8 }}><label>Nome de quem recebe</label><input className="fa-input" value={delivery.recipientName || ''} onChange={(e) => setDelivery({ ...delivery, recipientName: e.target.value })} /></div>
          {onSaveAddress && (
            <>
              <label className="fa-check" data-on={saveNewAddress ? '1' : '0'} onClick={() => setSaveNewAddress((v) => !v)} style={{ marginBottom: 10 }}>
                <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Salvar este endereço para o cliente
              </label>
              {saveNewAddress && (
                <button className="fa-btn fa-btn-primary fa-btn-sm" style={{ width: '100%' }} disabled={savingAddress || !delivery.addressLine} onClick={handleSaveAddress}>
                  <Icon name="check" size={14} />{savingAddress ? 'Salvando…' : 'Salvar endereço'}
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
    <div className="fa-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span className="ph-stat-ic" style={{ width: 32, height: 32, background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}><Icon name="repeat" size={16} /></span>
        <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Sugestão de recorrência</span>
      </div>
      <div className="ph-cell-sub" style={{ marginBottom: 12 }}>O cliente comprou nos últimos meses seguidos — ofereça recorrência com desconto.</div>
      {candidates.map((c) => (
        <div key={c.productKey} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--fa-mist)' }}>
          <span className="fa-iconbox" style={{ width: 36, height: 36, flex: 'none' }}><Icon name="repeat" size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
            <div className="ph-cell-sub">{c.consecutiveMonths} meses seguidos · {brl(c.lastUnitPrice)} · {c.suggestedDiscountPercent}% de desconto</div>
          </div>
          <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 'none' }} onClick={() => onConfigure && onConfigure(c)}><Icon name="repeat" size={14} stroke={2.2} />Configurar</button>
        </div>
      ))}
    </div>
  );
}

/* Tela de seleção de paciente — gate compartilhado: o farmacêutico usa para INICIAR o
   atendimento e o caixa para abrir a venda. Mesma tela nos dois papéis. */
function PdvCaixaGate({ operator, onIdentify, onConsumer }) {
  const isPharm = operator === 'pharm';
  return (
    <div className="fa-card pdv-gate">
      <span className="fa-iconbox" style={{ width: 76, height: 76, margin: '0 auto 18px' }}><Icon name="user" size={36} /></span>
      <h2 className="fa-h2" style={{ fontSize: 24 }}>Selecione o paciente</h2>
      <p className="fa-lead" style={{ marginTop: 8, maxWidth: 420, marginInline: 'auto' }}>{isPharm
        ? 'Para iniciar o atendimento, identifique primeiro o paciente. O contador do atendimento começa assim que ele é identificado.'
        : 'Para abrir a venda no caixa, identifique primeiro o paciente. Depois você adiciona os produtos e finaliza com a nota fiscal.'}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '24px auto 0' }}>
        <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" onClick={onIdentify}><Icon name="user" size={18} />Identificar paciente</button>
        <button className="fa-btn fa-btn-ghost fa-btn-block" style={{ whiteSpace: 'normal', lineHeight: 1.3, textAlign: 'center', height: 'auto', paddingTop: 12, paddingBottom: 12 }} onClick={onConsumer}>Continuar como consumidor não identificado</button>
      </div>
      <div className="ph-cell-sub" style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="shield" size={13} />A identificação garante o histórico e o CPF correto na nota.</div>
    </div>
  );
}

/* Lista de atendimentos em andamento do farmacêutico atual — autosalvos no servidor, recuperáveis
   após um reload da página ou uma queda de sessão. RLS garante que cada farmacêutico só veja os seus. */
function PdvDraftRecoveryList({ drafts, onRecover, onDiscard }) {
  if (!drafts || drafts.length === 0) return null;
  return (
    <div className="fa-card" style={{ padding: 16, marginBottom: 16, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span className="ph-stat-ic" style={{ width: 32, height: 32, background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}><Icon name="clock" size={16} /></span>
        <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Atendimentos em andamento</span>
        <span className="fa-badge fa-badge-mist">{drafts.length}</span>
      </div>
      <div className="ph-cell-sub" style={{ marginBottom: 12 }}>Salvos automaticamente — recupere de onde parou.</div>
      {drafts.map((draft) => {
        const count = (draft.items || []).reduce((s, l) => s + l.qty, 0);
        const name = draft.customer ? draft.customer.name : 'Consumidor não identificado';
        return (
          <div key={draft.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--fa-mist)' }}>
            <span className="fa-avatar fa-avatar-sm" style={{ width: 38, height: 38, flex: 'none', background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}>{draft.customer ? (draft.customer.avatar || name[0]) : <Icon name="user" size={17} />}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{name}</div>
              <div className="ph-cell-sub">{count} {count === 1 ? 'item' : 'itens'} · salvo às {draft.updatedAtLabel || '—'}</div>
            </div>
            <button className="fa-btn fa-btn-ghost fa-btn-sm" style={{ flex: 'none' }} onClick={() => onDiscard(draft)}><Icon name="trash" size={14} />Descartar</button>
            <button className="fa-btn fa-btn-primary fa-btn-sm" style={{ flex: 'none' }} onClick={() => onRecover(draft)}><Icon name="repeat" size={14} />Recuperar</button>
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
    <div className="fa-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--fa-mist)' }}>
        <span className="ph-stat-ic" style={{ width: 36, height: 36, background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}><Icon name="repeat" size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15.5 }}>Pedidos enviados pelo farmacêutico</div>
          <div className="ph-cell-sub">Selecione o cliente para receber o pagamento e emitir a nota</div>
        </div>
        <span className="fa-badge fa-badge-mist" style={{ flex: 'none' }}>{queue.length} na fila</span>
      </div>

      {queue.length === 0 ? (
        <div className="ph-empty" style={{ padding: '52px 24px' }}>
          <span className="fa-iconbox"><Icon name="cash" size={28} /></span>
          <div style={{ fontWeight: 700, color: 'var(--fa-ink-2)' }}>Nenhum pedido na fila do caixa</div>
          <div className="fa-faint" style={{ fontSize: 13, marginTop: 4, maxWidth: 360, textAlign: 'center' }}>O caixa só atende clientes com um pedido enviado pelo farmacêutico. Monte um pedido na visão do farmacêutico e toque em “Enviar para o caixa”.</div>
          <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 14 }} onClick={onPharm}><Icon name="rx" size={14} />Ir para a visão do farmacêutico</button>
        </div>
      ) : queue.map((entry) => {
        const e = enrich(entry);
        const cust = entry.customer;
        return (
          <div key={entry.id} className="pdv-line" style={{ alignItems: 'center' }}>
            <span className="fa-avatar fa-avatar-sm" style={{ width: 44, height: 44, flex: 'none', background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}>{cust ? (cust.avatar || cust.name[0]) : <Icon name="user" size={19} />}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                {cust ? cust.name : 'Consumidor não identificado'}
                {cust && cust.recurring && <RecurringBadge name={cust.name} small customerByName={customerByName} />}
                {e.hasControlled && <span className="fa-badge fa-badge-rx" style={{ fontSize: 10 }}><Icon name="lock" size={10} />Tarja</span>}
              </div>
              <div className="ph-cell-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {e.count} {e.count === 1 ? 'item' : 'itens'} · {e.lines.map((l) => l.name.split(' —')[0]).slice(0, 2).join(', ')}{e.lines.length > 2 ? ' +' + (e.lines.length - 2) : ''} · enviado {entry.sentAt}
              </div>
            </div>
            <div style={{ textAlign: 'right', flex: 'none', marginRight: 4 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{brl(e.total)}</div>
              {entry.discount > 0 && <div className="ph-cell-sub" style={{ color: 'var(--fa-success)' }}>−{entry.discount}%</div>}
            </div>
            <button className="fa-btn fa-btn-primary fa-btn-sm" style={{ flex: 'none' }} onClick={() => onClaim(entry)}><Icon name="cash" size={14} />Receber</button>
          </div>
        );
      })}
    </div>
  );
}

/* Formata segundos como MM:SS (contador do atendimento) */
function fmtAtendimento(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

/* Selo de status de validação de receita por linha do carrinho */
const PRESCRIPTION_STATUS_META = {
  missing: { label: 'Sem receita', bg: '#FBEAE9', fg: 'var(--fa-error)', icon: 'alert' },
  pending: { label: 'Receita pendente', bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)', icon: 'clock' },
  approved: { label: 'Receita validada', bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)', icon: 'check' },
  rejected: { label: 'Receita recusada', bg: '#FBEAE9', fg: 'var(--fa-error)', icon: 'close' },
};

function PdvScreen({ ctx }) {
  const { inventory, pdvCart, setPdvCart, pdvCustomer, setPdvCustomer, pdvAdd, pdvSetQty, pdvRemove, pdvClear, pdvSetLocation, fetchPdvItemLocations, pdvSearchProducts, pdvCreateReservation, fetchPdvPrescriptionStatus, createPdvPrescription, fetchCustomerPurchaseInsights, fetchCustomerPaymentMethods, fetchCustomerAddresses, createPdvCustomerAddress, confirmPdvRecurrence, checkPdvDeliveryCoverage, fetchPdvDiscountLimit, fetchPdvDrafts, autosavePdvDraft, deletePdvDraft, onLogout, finalizeSale, pdvQueue, pdvSendToCashier, pdvClaimFromQueue, recordSale, customers = [], customerByName = {}, storeFiscal = {}, pharmacistProfile = {}, notify, sendFiscalDocumentEmail, createPdvCustomer } = ctx;
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [expandedResultId, setExpandedResultId] = useState(null);
  const [pay, setPay] = useState('pix');
  const [discount, setDiscount] = useState(0);
  const [cpfNota, setCpfNota] = useState(true);
  const [operator, setOperator] = useState('pharm');
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
  const [delivery, setDelivery] = useState({ fulfillmentType: 'pickup' }); // retirada na loja ou entrega
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
  }, [pdvCart.map((line) => line.id).join(',')]);

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
    if (operator !== 'pharm' || pdvCustomer || caixaReady) return;
    let cancelled = false;
    (async () => {
      const found = fetchPdvDrafts ? await fetchPdvDrafts() : [];
      if (!cancelled) setDrafts(found);
    })();
    return () => { cancelled = true; };
  }, [operator, pdvCustomer, caixaReady]);

  // Autosalva o atendimento em andamento (farmacêutico, com cliente identificado), com debounce de 2s a cada mudança relevante.
  useEffect(() => {
    if (operator !== 'pharm' || !pdvCustomer || nota) return;
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
    setPay(draft.pay || 'pix');
    setCpfNota(draft.cpfNota !== false);
    setDelivery(draft.delivery || { fulfillmentType: 'pickup' });
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
    setCaixaReady(false); setStartedAt(null); setElapsed(0); setDelivery({ fulfillmentType: 'pickup' });
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
    setCaixaReady(false); setStartedAt(null); setElapsed(0); setDelivery({ fulfillmentType: 'pickup' });
    setDraftId(null);
  };

  // Trocar de papel zera a sessão: cada estação (farmacêutico / caixa) começa do seu próprio ponto de entrada.
  const switchOperator = (role) => { if (role === operator) return; resetAtendimento(); setNota(null); setSentModal(false); setOperator(role); };

  // linhas do carrinho (já vêm com nome/preço/loja resolvidos no momento em que foram adicionadas)
  const lines = pdvCart.filter((l) => l.id);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discVal = subtotal * (discount / 100);
  const afterDisc = Math.max(0, subtotal - discVal);
  const cashAvailable = pdvCustomer ? (pdvCustomer.cashback || 0) : 0;
  const cashApplied = Math.max(0, Math.min(cashWanted, cashAvailable, afterDisc));
  const total = Math.max(0, afterDisc - cashApplied);
  const hasControlled = lines.some((l) => l.controlled);

  // Adiciona um componente de loja específico ao carrinho.
  const addComponent = (component) => { pdvAdd(component); setQ(''); setResults([]); setExpandedResultId(null); };

  // Reserva de produto disponível em outra loja — o cliente retira lá, não entra no carrinho desta venda.
  const [reservationTarget, setReservationTarget] = useState(null); // componente de outra loja escolhido para reservar
  const [reservationConfirmed, setReservationConfirmed] = useState(null); // confirmação após reservar com sucesso
  const [reservationQty, setReservationQty] = useState(1);
  const [reservationBusy, setReservationBusy] = useState(false);
  const openReservation = (component) => { setReservationTarget(component); setReservationQty(1); setQ(''); setResults([]); setExpandedResultId(null); };
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
        notify && notify('Não foi possível emitir a nota fiscal agora. Tente novamente.', 'warn');
        return;
      }
      // O servidor é a fonte da verdade para o cashback — aplica o saldo resultante no cliente em tela.
      if (pdvCustomer) creditCashback(pdvCustomer, synced.cashback, total, synced.cashApplied);
      setNota({ ...synced, cpfNota, discVal });
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível concluir a venda.', 'warn');
    }
  };

  return (
    <>
      <Topbar title="Balcão · Venda no momento" sub={operator === 'pharm' ? 'Visão do farmacêutico — monte o pedido e oriente o cliente' : 'Visão do caixa — receba o pagamento e emita a nota'} onLogout={onLogout} ctx={ctx}>
        <div className="ph-seg" style={{ marginRight: 4 }}>
          <button data-on={operator === 'pharm' ? '1' : '0'} onClick={() => switchOperator('pharm')}><Icon name="rx" size={14} />Farmacêutico</button>
          <button data-on={operator === 'caixa' ? '1' : '0'} onClick={() => switchOperator('caixa')}><Icon name="cash" size={14} />Caixa</button>
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        {/* Aviso do papel atual */}
        <div className="pdv-rolebar" data-role={operator}>
          <span className="fa-iconbox" style={{ width: 38, height: 38, flex: 'none', background: 'rgba(255,255,255,.18)', color: '#fff' }}><Icon name={operator === 'pharm' ? 'rx' : 'cash'} size={19} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5 }}>{operator === 'pharm' ? 'Você está como Farmacêutico' : 'Você está como Caixa'}</div>
            <div style={{ fontSize: 12.5, opacity: .9 }}>{operator === 'pharm' ? 'Identifique o cliente, insira os medicamentos e ofereça o que ele costuma comprar.' : 'Selecione um pedido enviado pelo farmacêutico, confira os itens e emita a nota fiscal.'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            {operator === 'pharm' && pdvCustomer && (
              <button className="fa-btn fa-btn-sm" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', border: 'none' }} onClick={pauseAtendimento}>
                <Icon name="chevL" size={14} />Voltar para seleção
              </button>
            )}
            {startedAt && (
              <span className="pdv-timer" data-done={nota ? '1' : '0'} title="Tempo de atendimento">
                <Icon name="clock" size={14} />
                <span className="fa-mono">{fmtAtendimento(elapsed)}</span>
              </span>
            )}
            <span className="fa-badge" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}><Icon name="repeat" size={11} />Pedido compartilhado</span>
          </div>
        </div>

        {(operator === 'caixa' ? !caixaReady : (!pdvCustomer && !caixaReady)) ? (
          operator === 'caixa'
            ? <PdvCaixaQueue queue={pdvQueue} onClaim={(entry) => { pdvClaimFromQueue(entry.id); setDiscount(entry.discount || 0); setCaixaReady(true); }} onPharm={() => switchOperator('pharm')} customerByName={customerByName} />
            : (
              <>
                <PdvDraftRecoveryList drafts={drafts} onRecover={recoverDraft} onDiscard={setDiscardTarget} />
                <PdvCaixaGate operator={operator} onIdentify={() => setIdOpen(true)} onConsumer={() => setCaixaReady(true)} />
              </>
            )
        ) : (
        <div className="pdv-grid">
          {/* Coluna: busca + itens */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div style={{ position: 'relative' }}>
              <div className="pdv-search">
                <Icon name="scan" size={20} style={{ color: 'var(--fa-primary)' }} />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto, marca ou EAN — ou bipar o código de barras" />
                {q && <button className="fa-iconbtn" style={{ width: 34, height: 34, border: 'none', background: 'transparent' }} onClick={() => setQ('')}><Icon name="close" size={16} /></button>}
              </div>
              {results.length > 0 && (
                <div className="pdv-results">
                  {results.map((it) => {
                    const own = it.ownStoreComponent;
                    const availableHere = !!(own && own.qty > 0);
                    const otherComponents = it.components.filter((c) => c.qty > 0 && (!own || c.storeId !== own.storeId));
                    const canReserveElsewhere = operator === 'pharm' && otherComponents.length > 0;
                    const outOfStock = it.totalStock <= 0;
                    const expanded = expandedResultId === it.id;
                    return (
                      <div key={it.id}>
                        <button
                          className="pdv-result"
                          onClick={() => {
                            if (availableHere) { addComponent(own); return; }
                            if (canReserveElsewhere) setExpandedResultId((prev) => (prev === it.id ? null : it.id));
                          }}
                          disabled={outOfStock || (!availableHere && !canReserveElsewhere)}
                        >
                          <span className="fa-iconbox" style={{ width: 38, height: 38, flex: 'none' }}><Icon name="pill" size={18} /></span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>{it.name}{it.controlled && <span className="fa-badge fa-badge-rx" style={{ fontSize: 9 }}>Tarja</span>}</div>
                            <div className="ph-cell-sub">
                              {it.brand} · <span className="fa-mono">{it.ean}</span>
                              {availableHere ? ' · ' + own.loc : canReserveElsewhere ? ' · não disponível nesta loja — toque para ver em outras lojas' : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flex: 'none' }}>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{brl(availableHere ? own.price : (otherComponents[0] ? otherComponents[0].price : 0))}</div>
                            <div className="ph-cell-sub" style={{ color: availableHere ? 'var(--fa-success)' : (canReserveElsewhere ? 'var(--fa-warn)' : 'var(--fa-error)') }}>
                              {availableHere ? own.qty + ' em estoque' : canReserveElsewhere ? 'em outra loja' : 'esgotado'}
                            </div>
                          </div>
                          <Icon name={availableHere ? 'plusCircle' : (canReserveElsewhere ? 'chevD' : 'close')} size={22} style={{ color: outOfStock ? 'var(--fa-ink-3)' : 'var(--fa-primary)', flex: 'none', transform: !availableHere && canReserveElsewhere && expanded ? 'rotate(180deg)' : 'none' }} />
                        </button>
                        {!availableHere && canReserveElsewhere && expanded && (
                          <div style={{ padding: '4px 10px 8px 56px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {otherComponents.map((component) => (
                              <button key={component.id} className="pdv-result" style={{ padding: '8px 10px' }} onClick={() => openReservation(component)}>
                                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                  <div style={{ fontWeight: 700, fontSize: 13 }}>{component.storeName || 'Loja'}</div>
                                  <div className="ph-cell-sub">{component.loc}</div>
                                </div>
                                <div style={{ textAlign: 'right', flex: 'none' }}>
                                  <div style={{ fontWeight: 800, fontSize: 13.5 }}>{brl(component.price)}</div>
                                  <div className="ph-cell-sub" style={{ color: 'var(--fa-success)' }}>{component.qty} em estoque</div>
                                </div>
                                <span className="fa-badge fa-badge-mist" style={{ flex: 'none' }}>Reservar</span>
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
            <div className="fa-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--fa-mist)' }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>Itens da venda</span>
                <span className="fa-badge fa-badge-mist">{count}</span>
                {lines.length > 0 && <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginLeft: 'auto', color: 'var(--fa-error)' }} onClick={pdvClear}><Icon name="trash" size={14} />Limpar</button>}
              </div>
              {lines.length === 0 ? (
                <div className="ph-empty" style={{ padding: '48px 20px' }}>
                  <span className="fa-iconbox"><Icon name="scan" size={28} /></span>
                  <div style={{ fontWeight: 700, color: 'var(--fa-ink-2)' }}>Comece a registrar a venda</div>
                  <div className="fa-faint" style={{ fontSize: 13, marginTop: 4 }}>Busque ou bipe um produto para adicioná-lo.</div>
                </div>
              ) : lines.map((l) => {
                const rx = l.controlled ? (prescriptionStatus[l.id] || { status: 'missing' }) : null;
                const rxMeta = rx ? (PRESCRIPTION_STATUS_META[rx.status] || PRESCRIPTION_STATUS_META.missing) : null;
                return (
                <div className="pdv-line" key={l.id}>
                  <span className="fa-iconbox" style={{ width: 42, height: 42, flex: 'none' }}><Icon name="pill" size={19} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      {l.name}
                      {l.controlled && <span className="fa-badge fa-badge-rx" style={{ fontSize: 10 }}><Icon name="lock" size={10} />Tarja</span>}
                      {rx && (
                        <button
                          className="fa-badge"
                          style={{ fontSize: 10, background: rxMeta.bg, color: rxMeta.fg, border: 'none', cursor: 'pointer' }}
                          onClick={() => setPrescriptionTarget(l)}
                        >
                          <Icon name={rxMeta.icon} size={10} />{rxMeta.label}
                        </button>
                      )}
                    </div>
                    <div className="ph-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{l.brand}{l.storeName ? ' · ' + l.storeName : ''} · {brl(l.price)} un</span>
                      {(itemLocations[l.id] || []).length > 0 ? (
                        <select
                          className="fa-select"
                          style={{ width: 'auto', minWidth: 150, height: 26, padding: '0 8px', fontSize: 12 }}
                          value={l.locationId || ''}
                          onChange={(e) => {
                            const picked = (itemLocations[l.id] || []).find((entry) => entry.locationId === e.target.value);
                            pdvSetLocation(l.id, e.target.value, picked ? picked.locationCode : '');
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
                        <span>· {l.loc || 'sem local cadastrado'}</span>
                      )}
                    </div>
                  </div>
                  <QtyStepper value={l.qty} onChange={(v) => pdvSetQty(l.id, v)} />
                  <div style={{ width: 84, textAlign: 'right', fontWeight: 800, fontSize: 15, flex: 'none' }}>{brl(l.price * l.qty)}</div>
                  <button className="fa-iconbtn" style={{ width: 34, height: 34 }} aria-label="remover" onClick={() => pdvRemove(l.id)}><Icon name="trash" size={15} /></button>
                </div>
                );
              })}
            </div>

            {hasControlled && (
              <div style={{ display: 'flex', gap: 12, padding: 14, background: 'var(--fa-info-soft)', borderRadius: 12, alignItems: 'flex-start' }}>
                <Icon name="rx" size={20} style={{ color: 'var(--fa-info)', flex: 'none', marginTop: 1 }} />
                <div style={{ fontSize: 13, color: 'var(--fa-info)', lineHeight: 1.5 }}>Há item <b>controlado (tarja)</b> na venda — toque no selo de receita do item para validar antes de enviar ao caixa.</div>
              </div>
            )}
          </div>

          {/* Coluna: cliente + pagamento + total */}
          <div className="pdv-side">
            {/* Cliente */}
            <div className="fa-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Cliente</span>
                <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => operator === 'caixa' ? resetAtendimento() : setIdOpen(true)}>{operator === 'caixa' ? 'Trocar pedido' : (pdvCustomer ? 'Trocar' : 'Identificar')}</button>
              </div>
              {pdvCustomer ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <span className="fa-avatar fa-avatar-sm" style={{ background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}>{pdvCustomer.avatar || (pdvCustomer.name[0] || '?')}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{pdvCustomer.name}</span>
                        {pdvCustomer.tier && <span className="fa-badge" style={{ background: tierStyle(pdvCustomer.tier).bg, color: tierStyle(pdvCustomer.tier).fg, fontSize: 10 }}>{pdvCustomer.tier}</span>}
                      </div>
                      <div className="ph-cell-sub fa-mono">{pdvCustomer.doc || 'CPF não informado'}</div>
                    </div>
                    {pdvCustomer.recurring && <RecurringBadge name={pdvCustomer.name} small customerByName={customerByName} />}
                  </div>

                  <div className="ph-cell-sub" style={{ marginTop: 10 }}>
                    {fmtBirthday(pdvCustomer.birthDate) ? '🎂 ' + fmtBirthday(pdvCustomer.birthDate) + '  ·  ' : ''}
                    Cliente desde {pdvCustomer.since || '—'}{pdvCustomer.tenureMonths > 0 ? ' (' + pdvCustomer.tenureMonths + ' meses)' : ''}
                  </div>

                  {(pdvCustomer.phone || pdvCustomer.email) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                      {pdvCustomer.phone && <div className="ph-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="phone" size={12} />{maskPhone(pdvCustomer.phone)}</div>}
                      {pdvCustomer.email && <div className="ph-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="mail" size={12} />{pdvCustomer.email}</div>}
                    </div>
                  )}
                  {(pdvCustomer.district || pdvCustomer.city) && (
                    <div className="ph-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <Icon name="pin" size={12} />{[pdvCustomer.district, pdvCustomer.city].filter(Boolean).join(', ')}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 12 }}>
                    <PdvCustomerStat label="Pedidos" value={pdvCustomer.orders || 0} />
                    <PdvCustomerStat label="Total gasto" value={brl(pdvCustomer.totalSpent || 0)} />
                    <PdvCustomerStat label="Ticket médio" value={brl(pdvCustomer.avgTicket || 0)} />
                  </div>

                  {(pdvCustomer.lastDays != null || pdvCustomer.freqDays) && (
                    <div className="ph-cell-sub" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="clock" size={12} />
                      {[recencyLabel(pdvCustomer.lastDays), pdvCustomer.freqDays ? `costuma comprar a cada ~${pdvCustomer.freqDays} dias` : ''].filter(Boolean).join(' · ')}
                    </div>
                  )}

                  {Array.isArray(pdvCustomer.interests) && pdvCustomer.interests.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                      {pdvCustomer.interests.map((tag) => <span key={tag} className="fa-badge fa-badge-rose" style={{ fontSize: 10 }}>{tag}</span>)}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, color: 'var(--fa-ink-3)' }}>
                  <span className="fa-iconbox" style={{ width: 40, height: 40, background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}><Icon name="user" size={19} /></span>
                  <div><div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fa-ink-2)' }}>Consumidor não identificado</div><div className="ph-cell-sub">Venda sem cadastro</div></div>
                </div>
              )}
              {pdvCustomer && pdvCustomer.cashback > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '9px 12px', background: 'var(--fa-rose-soft)', borderRadius: 10, fontSize: 12.5, fontWeight: 600, color: 'var(--fa-primary)' }}>
                  <Icon name="gift" size={15} />{brl(pdvCustomer.cashback)} de cashback disponível
                </div>
              )}
            </div>

            {/* ===== Visão do FARMACÊUTICO: sugestões do que o cliente mais compra ===== */}
            {operator === 'pharm' && <PdvUpsell customer={pdvCustomer} insights={insights} inventory={inventory} cart={pdvCart} onAdd={pdvAdd} />}
            {operator === 'pharm' && pdvCustomer && <PdvRecurrenceSuggestions candidates={insights.recurrenceCandidates} onConfigure={setRecurrenceCandidate} />}

            {/* ===== Visão do CAIXA: pagamento + CPF na nota ===== */}
            {operator === 'caixa' && (
              <div className="fa-card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Forma de pagamento</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {PAY_METHODS.map((m) => (
                    <button key={m.id} className="fa-choice" data-on={pay === m.id ? '1' : '0'} onClick={() => setPay(m.id)} style={{ padding: 12 }}>
                      <span className="fa-iconbox" style={{ width: 34, height: 34 }}><Icon name={m.icon} size={17} /></span>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{m.label}</span>
                    </button>
                  ))}
                </div>
                <label className="fa-check" data-on={cpfNota ? '1' : '0'} onClick={() => setCpfNota(!cpfNota)} style={{ marginTop: 12, fontSize: 13 }}>
                  <span className="box"><Icon name="check" size={13} stroke={2.6} /></span>Incluir CPF na nota fiscal
                </label>
              </div>
            )}

            {/* Cashback do cliente (visão do caixa) — aplicar saldo além do desconto */}
            {operator === 'caixa' && pdvCustomer && cashAvailable > 0 && (
              <div className="fa-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className="ph-stat-ic" style={{ width: 32, height: 32, background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}><Icon name="gift" size={16} /></span>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 14 }}>Cashback do cliente</div><div className="ph-cell-sub">Disponível: <b style={{ color: 'var(--fa-primary)' }}>{brl(cashAvailable)}</b></div></div>
                </div>
                <div className="fa-field"><label>Quanto aplicar (R$)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="fa-input" type="number" min="0" step="0.01" max={Math.min(cashAvailable, afterDisc)} value={cashWanted} onChange={(e) => setCashWanted(Math.max(0, +e.target.value || 0))} placeholder="0,00" style={{ flex: 1 }} />
                    <button className="fa-btn fa-btn-soft" onClick={() => setCashWanted(Math.min(cashAvailable, afterDisc))}>Usar tudo</button>
                  </div>
                </div>
                {cashApplied > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, padding: '9px 12px', background: 'var(--fa-rose-soft)', borderRadius: 10, fontSize: 13, fontWeight: 700, color: 'var(--fa-primary)' }}>
                    <span><Icon name="check" size={14} /> Aplicando {brl(cashApplied)}</span>
                    <button className="fa-btn fa-btn-sm" style={{ background: 'transparent', color: 'var(--fa-primary)', padding: '2px 6px' }} onClick={() => setCashWanted(0)}>remover</button>
                  </div>
                )}
              </div>
            )}

            {/* Retirada na loja ou entrega (visão do farmacêutico, com cliente identificado) */}
            {operator === 'pharm' && pdvCustomer && (
              <PdvFulfillmentPicker delivery={delivery} setDelivery={setDelivery} checkPdvDeliveryCoverage={checkPdvDeliveryCoverage} savedAddresses={savedAddresses} onSaveAddress={saveCustomerAddress} />
            )}

            {/* Totais — bruto + com desconto (ambas as visões) */}
            <div className="fa-card" style={{ padding: 18 }}>
              <div className="pdv-totrow"><span>Valor bruto</span><span>{brl(subtotal)}</span></div>
              <div className="fa-field" style={{ margin: '8px 0' }}>
                <label>Desconto (%)</label>
                <input className="fa-input" type="number" min="0" max={discountLimit} value={discount} onChange={(e) => setDiscount(Math.max(0, Math.min(discountLimit, +e.target.value)))} />
                {discountLimit < 100 && (
                  <div className="ph-cell-sub" style={{ marginTop: 4 }}>
                    Desconto máximo permitido: {discountLimit}% — limite de margem do produto{cashAvailable > 0 ? ' e cashback do cliente' : ''}
                  </div>
                )}
              </div>
              {discVal > 0 && <div className="pdv-totrow" style={{ color: 'var(--fa-success)' }}><span>Desconto aplicado</span><span>− {brl(discVal)}</span></div>}
              {cashApplied > 0 && <div className="pdv-totrow" style={{ color: 'var(--fa-primary)' }}><span>Cashback aplicado</span><span>− {brl(cashApplied)}</span></div>}
              <div className="pdv-totrow"><span>Itens</span><span>{count}</span></div>
              <div style={{ height: 1, background: 'var(--fa-mist)', margin: '12px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>{discVal > 0 || cashApplied > 0 ? 'Total a pagar' : 'Total'}</span>
                <span style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-.02em' }}>{brl(total)}</span>
              </div>
              {pdvCustomer && lines.length > 0 && <div className="ph-cell-sub" style={{ textAlign: 'right', marginTop: 4 }}>O cashback ganho é calculado ao emitir a nota</div>}

              {operator === 'pharm' ? (
                <>
                  <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" style={{ marginTop: 16 }} disabled={lines.length === 0} onClick={async () => { const ok = await pdvSendToCashier({ customer: pdvCustomer, items: pdvCart, discount, delivery, draftId }); if (ok) { setDraftId(null); finalizeSale && finalizeSale('Pedido enviado ao caixa'); setSentModal(true); } }}>
                    <Icon name="arrowR" size={18} />Enviar para o caixa
                  </button>
                  <div className="ph-cell-sub" style={{ textAlign: 'center', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="cash" size={13} />O caixa recebe o pagamento e emite a nota</div>
                </>
              ) : (
                <>
                  <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" style={{ marginTop: 16 }} disabled={lines.length === 0} onClick={emit}>
                    <Icon name="receipt" size={18} />Finalizar e emitir nota
                  </button>
                  <div className="ph-cell-sub" style={{ textAlign: 'center', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="shield" size={13} />NFC-e · {storeFiscal.cnpj}</div>
                </>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

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
            notify && notify('Recorrência configurada e cobrança realizada.', 'success');
            const refreshed = fetchCustomerPurchaseInsights ? await fetchCustomerPurchaseInsights(pdvCustomer.id) : insights;
            setInsights(refreshed);
          }}
        />
      )}

      {/* Confirmação: pedido enviado ao caixa (visão do farmacêutico) */}
      {sentModal && (
        <ModalShell open={true} onClose={() => setSentModal(false)} maxw={400}>
          <div style={{ textAlign: 'center' }}>
            <span className="fa-iconbox" style={{ width: 56, height: 56, margin: '0 auto 14px', background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="check" size={28} stroke={2.4} /></span>
            <h2 className="fa-h3" style={{ fontSize: 20 }}>Enviado para o caixa</h2>
            <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.55 }}>O pedido foi salvo e enviado para o caixa{pdvCustomer ? ' no nome de ' + pdvCustomer.name : ''}. O caixa vê os mesmos itens e finaliza com o pagamento e a nota fiscal.</p>
            <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" style={{ marginTop: 18 }} onClick={() => { setSentModal(false); resetAtendimento(); }}>Atender próximo paciente</button>
          </div>
        </ModalShell>
      )}

      {/* Confirmação: descartar um atendimento em andamento */}
      {discardTarget && (
        <ModalShell open={true} onClose={() => setDiscardTarget(null)} maxw={400}>
          <div style={{ textAlign: 'center' }}>
            <span className="fa-iconbox" style={{ width: 56, height: 56, margin: '0 auto 14px', background: '#FBEAE9', color: 'var(--fa-error)' }}><Icon name="trash" size={26} /></span>
            <h2 className="fa-h3" style={{ fontSize: 20 }}>Descartar atendimento?</h2>
            <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.55 }}>
              O atendimento de {discardTarget.customer ? discardTarget.customer.name : 'consumidor não identificado'} será excluído e não poderá ser recuperado.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="fa-btn fa-btn-ghost fa-btn-block" onClick={() => setDiscardTarget(null)}>Cancelar</button>
              <button className="fa-btn fa-btn-block" style={{ background: 'var(--fa-error)', color: '#fff', border: 'none' }} onClick={confirmDiscardDraft}><Icon name="trash" size={15} />Descartar</button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Reservar produto disponível em outra loja, para o cliente retirar lá */}
      {reservationTarget && (
        <ModalShell open={true} onClose={() => setReservationTarget(null)} maxw={420}>
          <div style={{ textAlign: 'center' }}>
            <span className="fa-iconbox" style={{ width: 56, height: 56, margin: '0 auto 14px', background: 'var(--fa-warn-soft)', color: 'var(--fa-warn)' }}><Icon name="pin" size={26} /></span>
            <h2 className="fa-h3" style={{ fontSize: 20 }}>Reservar em {reservationTarget.storeName || 'outra loja'}</h2>
            <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.55 }}>
              {reservationTarget.name} · {reservationTarget.loc}. O estoque fica travado por 48h para
              {pdvCustomer ? ' ' + pdvCustomer.name : ' o cliente'} retirar diretamente nessa loja.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <QtyStepper value={reservationQty} onChange={setReservationQty} min={1} max={reservationTarget.qty} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="fa-btn fa-btn-ghost fa-btn-block" onClick={() => setReservationTarget(null)}>Cancelar</button>
              <button className="fa-btn fa-btn-primary fa-btn-block" disabled={reservationBusy} onClick={confirmReservation}>
                <Icon name="pin" size={15} />{reservationBusy ? 'Reservando…' : 'Reservar para retirada'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Confirmação: reserva concluída com sucesso */}
      {reservationConfirmed && (
        <ModalShell open={true} onClose={() => setReservationConfirmed(null)} maxw={400}>
          <div style={{ textAlign: 'center' }}>
            <span className="fa-iconbox" style={{ width: 56, height: 56, margin: '0 auto 14px', background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="check" size={28} stroke={2.4} /></span>
            <h2 className="fa-h3" style={{ fontSize: 20 }}>Reserva confirmada</h2>
            <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.55 }}>
              {reservationConfirmed.productName} reservado na loja {reservationConfirmed.storeName}, válido até {reservationConfirmed.expiresAtLabel}.
              Oriente o cliente a retirar diretamente lá.
            </p>
            <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" style={{ marginTop: 18 }} onClick={() => setReservationConfirmed(null)}>Entendi</button>
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
    </>
  );
}

/* ---------- Modal: validar receita de um item controlado (física ou digital) ---------- */
function PdvPrescriptionModal({ line, customer, createPdvPrescription, onClose, onSaved }) {
  const [method, setMethod] = useState('physical');
  const [digitalUrl, setDigitalUrl] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submitPhysical = async (decision) => {
    if (decision === 'rejected' && !rejectionReason.trim()) { setRejectionReason(' '); return; }
    setBusy(true);
    const result = await createPdvPrescription({
      customerId: customer && customer.id, inventoryItemId: line.id, medicationName: line.name,
      deliveryMethod: 'physical', decision, rejectionReason: decision === 'rejected' ? rejectionReason.trim() || 'Recusada pelo farmacêutico.' : '',
    });
    setBusy(false);
    if (result) onSaved(result);
  };

  const submitDigital = async () => {
    if (!digitalUrl.trim()) return;
    setBusy(true);
    const result = await createPdvPrescription({
      customerId: customer && customer.id, inventoryItemId: line.id, medicationName: line.name,
      deliveryMethod: 'digital', digitalReferenceUrl: digitalUrl.trim(),
    });
    setBusy(false);
    if (result) onSaved(result);
  };

  return (
    <ModalShell open={true} onClose={onClose} maxw={440}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="rx" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Validar receita — {line.name}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 16 }}>
        Este item exige receita. Confira o documento físico apresentado pelo cliente, ou envie o link
        da receita digital para validação — a venda só pode ser enviada ao caixa depois de validada.
      </p>
      <div className="ph-seg" style={{ marginBottom: 16 }}>
        <button data-on={method === 'physical' ? '1' : '0'} onClick={() => setMethod('physical')}>Receita física</button>
        <button data-on={method === 'digital' ? '1' : '0'} onClick={() => setMethod('digital')}>Receita digital</button>
      </div>
      {method === 'physical' ? (
        <>
          <p className="ph-cell-sub" style={{ marginBottom: 12 }}>O cliente mostrou a receita em papel agora — confira e decida.</p>
          {rejectionReason !== '' && (
            <div className="fa-field" style={{ marginBottom: 12 }}>
              <label>Motivo da recusa</label>
              <input className="fa-input" value={rejectionReason.trim()} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Ex.: receita vencida, dose incompatível" />
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="fa-btn fa-btn-block" style={{ background: 'var(--fa-error)', color: '#fff', border: 'none' }} disabled={busy} onClick={() => submitPhysical('rejected')}>
              <Icon name="close" size={15} />Recusar
            </button>
            <button className="fa-btn fa-btn-primary fa-btn-block" disabled={busy} onClick={() => submitPhysical('approved')}>
              <Icon name="check" size={15} />Validar
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="fa-field" style={{ marginBottom: 12 }}>
            <label>Link da receita digital</label>
            <input className="fa-input" value={digitalUrl} onChange={(e) => setDigitalUrl(e.target.value)} placeholder="https://..." />
          </div>
          <p className="ph-cell-sub" style={{ marginBottom: 12 }}>
            O link será enviado na conversa com {customer ? customer.name : 'o cliente'} para um farmacêutico validar ou recusar.
          </p>
          <button className="fa-btn fa-btn-primary fa-btn-block" disabled={busy || !digitalUrl.trim()} onClick={submitDigital}>
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
  const [q, setQ] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const list = CUSTOMERS.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || (c.doc || '').includes(q));
  return (
    <ModalShell open={true} onClose={onClose} maxw={460}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="user" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Identificar cliente</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 16 }}>Vincule a venda a um cliente ou siga como consumidor não identificado.</p>
      <div className="ph-topsearch" style={{ width: '100%', marginBottom: 12 }}><Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} /><input autoFocus placeholder="Buscar por nome ou CPF" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
        {list.map((c) => (
          <button key={c.name} className="ph-user-menu-item" onClick={() => onPick(c)} style={{ padding: 10 }}>
            <span className="fa-avatar fa-avatar-sm" style={{ width: 38, height: 38, background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}>{c.avatar}</span>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</div>
              <div className="ph-cell-sub fa-mono">{c.doc}</div>
            </div>
            {c.cashback > 0 && <span className="fa-badge fa-badge-rose" style={{ fontSize: 10 }}><Icon name="gift" size={10} />{brl(c.cashback)}</span>}
            {c.recurring && <Icon name="repeat" size={14} style={{ color: 'var(--fa-success)' }} />}
          </button>
        ))}
        {list.length === 0 && <div className="fa-faint" style={{ fontSize: 13, textAlign: 'center', padding: 12 }}>Nenhum cliente encontrado.</div>}
      </div>

      <button className="fa-btn fa-btn-soft fa-btn-block" style={{ borderTop: '1px solid var(--fa-mist)', paddingTop: 14, marginTop: 2 }} onClick={() => setRegisterOpen(true)}>
        <Icon name="plusCircle" size={16} />Cadastrar cliente
      </button>
      <button className="fa-btn fa-btn-ghost fa-btn-block" style={{ marginTop: 10 }} onClick={() => onPick(null)}>Consumidor não identificado</button>

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
  const [cpf, setCpf] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const cpfDigits = cpf.replace(/\D/g, '').length;
  const emailValid = !email.trim() || EMAIL_PATTERN.test(email.trim());
  const handleCreate = async () => {
    try {
      setCreateError('');
      setSaving(true);
      const created = await onCreate({ name: nome.trim(), doc: cpf.trim(), phone: telefone.trim(), email: email.trim() });
      onCreated(created);
    } catch (error) {
      setCreateError(error && error.message ? error.message : 'Não foi possível cadastrar o cliente agora.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell open={true} onClose={onClose} maxw={420}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="plusCircle" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Cadastrar cliente</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 16 }}>Nome e/ou CPF são obrigatórios — e-mail e telefone são opcionais. O e-mail habilita o primeiro acesso ao marketplace.</p>
      <div className="fa-field" style={{ marginBottom: 10 }}><label>Nome {cpfDigits === 11 ? '(opcional)' : ''}</label><input autoFocus className="fa-input" placeholder="Nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
      <div className="fa-field" style={{ marginBottom: 10 }}>
        <label>E-mail (opcional)</label>
        <input className="fa-input" type="email" placeholder="cliente@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        {!emailValid && <div style={{ marginTop: 4, color: 'var(--fa-error)', fontSize: 12 }}>E-mail inválido.</div>}
      </div>
      <div className="fa-field" style={{ marginBottom: 10 }}><label>CPF {nome.trim() ? '(opcional)' : ''}</label><input className="fa-input fa-mono" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} /></div>
      <div className="fa-field" style={{ marginBottom: 12 }}><label>Telefone (opcional)</label><input className="fa-input fa-mono" inputMode="numeric" maxLength={19} placeholder="+55 (00) 00000-0000" value={telefone} onChange={(e) => setTelefone(maskPhone(e.target.value))} /></div>
      {createError ? <div style={{ marginBottom: 10, color: 'var(--fa-error)', fontSize: 12.5 }}>{createError}</div> : null}
      <button className="fa-btn fa-btn-primary fa-btn-block" disabled={saving || !emailValid || !(nome.trim() || cpfDigits === 11)} onClick={handleCreate}>
        <Icon name="user" size={16} />{saving ? 'Cadastrando...' : 'Cadastrar e usar'}
      </button>
    </ModalShell>
  );
}

/* ---------- Modal: confirmar recorrência e cobrar no cartão salvo ---------- */
function RecurrenceConfirmModal({ candidate, customerId, pdvSearchProducts, fetchCustomerPaymentMethods, confirmPdvRecurrence, onClose, onConfirmed }) {
  const [loading, setLoading] = useState(true);
  const [resolvedItem, setResolvedItem] = useState(null); // componente de estoque real que casa com o candidato
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [frequencyDays, setFrequencyDays] = useState(30);
  const [quantity, setQuantity] = useState(candidate.avgQuantity || 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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
      setError('');
      const response = await confirmPdvRecurrence({
        customerId,
        inventoryItemId: resolvedItem.id,
        quantity,
        frequencyDays,
        paymentMethodId,
      });
      setResult(response);
    } catch (err) {
      setError(err && err.message ? err.message : 'Não foi possível confirmar a recorrência agora.');
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <ModalShell open={true} onClose={() => onConfirmed(result)} maxw={420}>
        <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14, background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="check" size={26} stroke={2.4} /></span>
        <h2 className="fa-h3" style={{ fontSize: 20 }}>Recorrência confirmada</h2>
        <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 16 }}>Cobrança de {brl(result.totalCharged)} realizada no cartão salvo, com {result.discountPercent}% de desconto aplicado.</p>
        <button className="fa-btn fa-btn-primary fa-btn-block" onClick={() => onConfirmed(result)}>Fechar</button>
      </ModalShell>
    );
  }

  return (
    <ModalShell open={true} onClose={onClose} maxw={440}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="repeat" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Configurar recorrência</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 16 }}>{candidate.name} · comprado em {candidate.consecutiveMonths} meses seguidos. Cobrança imediata no cartão salvo, com 15% de desconto.</p>
      {loading ? (
        <div className="fa-faint" style={{ fontSize: 13, padding: '12px 0' }}>Carregando estoque e cartões salvos...</div>
      ) : !resolvedItem ? (
        <div style={{ color: 'var(--fa-error)', fontSize: 13, marginBottom: 12 }}>Este produto não foi encontrado no estoque atual — não é possível confirmar a recorrência agora.</div>
      ) : (
        <>
          <div className="fa-field" style={{ marginBottom: 10 }}>
            <label>Quantidade</label>
            <QtyStepper value={quantity} onChange={setQuantity} min={1} max={20} />
          </div>
          <div className="fa-field" style={{ marginBottom: 10 }}>
            <label>Frequência (dias)</label>
            <input className="fa-input" type="number" min="7" max="365" value={frequencyDays} onChange={(e) => setFrequencyDays(Math.max(7, +e.target.value || 30))} />
          </div>
          <div className="fa-field" style={{ marginBottom: 12 }}>
            <label>Cartão a cobrar</label>
            {paymentMethods.length === 0 ? (
              <div style={{ color: 'var(--fa-error)', fontSize: 12.5, marginTop: 4 }}>O cliente não tem cartão salvo — não é possível cobrar a recorrência agora.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {paymentMethods.map((m) => (
                  <label key={m.id} className="fa-check" data-on={paymentMethodId === m.id ? '1' : '0'} style={{ fontSize: 13 }} onClick={() => setPaymentMethodId(m.id)}>
                    <span className="box"><Icon name="check" size={13} stroke={2.6} /></span>{m.brandName} •••• {m.lastFourDigits}{m.isPrimary ? ' · principal' : ''}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="ph-cell-sub" style={{ marginBottom: 12 }}>Total a cobrar agora: <b>{brl((resolvedItem.price * (1 - 0.15)) * quantity)}</b></div>
          {error ? <div style={{ marginBottom: 10, color: 'var(--fa-error)', fontSize: 12.5 }}>{error}</div> : null}
          <button className="fa-btn fa-btn-primary fa-btn-block" disabled={saving || !paymentMethodId} onClick={handleConfirm}>
            <Icon name="repeat" size={16} />{saving ? 'Cobrando...' : 'Confirmar recorrência e cobrar agora'}
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
  const chaveFmt = (nota.chave || '').replace(/(\d{4})(?=\d)/g, '$1 ');
  return (
    <ModalShell open={true} onClose={onClose} maxw={460}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <span className="fa-iconbox" style={{ width: 56, height: 56, margin: '0 auto 12px', background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="check" size={28} stroke={2.4} /></span>
        <h2 className="fa-h3" style={{ fontSize: 21 }}>Venda concluída</h2>
        <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 4 }}>Nota fiscal autorizada com sucesso.</p>
      </div>

      {/* Cupom */}
      <div style={{ border: '1px solid var(--fa-mist)', borderRadius: 12, padding: 16, background: 'var(--fa-bg)' }}>
        <div style={{ textAlign: 'center', borderBottom: '1px dashed var(--fa-mist)', paddingBottom: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{F.legal}</div>
          <div className="ph-cell-sub">CNPJ {F.cnpj} · IE {F.ie}</div>
          <div className="ph-cell-sub">{F.addr}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
          <span>NFC-e nº {nota.numero}</span><span>Série {nota.serie} · {nota.when}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
          {nota.items.map((l) => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.qty}× {l.name}</span>
              <span className="fa-mono" style={{ flex: 'none', marginLeft: 8 }}>{brl(l.price * l.qty)}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px dashed var(--fa-mist)', paddingTop: 10, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}><span>TOTAL</span><span>{brl(nota.total)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }} className="ph-cell-sub"><span>Pagamento</span><span>{payLabel}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }} className="ph-cell-sub"><span>Trib. aprox. (Lei 12.741)</span><span>{brl(tributos)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }} className="ph-cell-sub"><span>Destinatário</span><span>{nota.customer && nota.cpfNota ? (nota.customer.doc || '—') : 'CONSUMIDOR'}</span></div>
          {nota.customer && nota.cashback > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fa-primary)', fontWeight: 700 }} className="ph-cell-sub"><span>Cashback creditado</span><span>+ {brl(nota.cashback)}</span></div>}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', borderTop: '1px dashed var(--fa-mist)', marginTop: 10, paddingTop: 12 }}>
          <QrPlaceholder seed={parseInt(nota.numero) % 200 + 5} size={84} />
          <div style={{ minWidth: 0 }}>
            <div className="ph-cell-sub" style={{ fontWeight: 700 }}>Consulte pela chave de acesso:</div>
            <div className="fa-mono" style={{ fontSize: 10.5, wordBreak: 'break-all', lineHeight: 1.5, marginTop: 4 }}>{chaveFmt}</div>
          </div>
        </div>
        <div className="ph-cell-sub" style={{ textAlign: 'center', marginTop: 10 }}>Atendido por {P.name} · {P.crf}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} disabled={!nota.printableUrl} onClick={() => nota.printableUrl && window.open(nota.printableUrl, '_blank', 'noopener')}><Icon name="printer" size={16} />Imprimir</button>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={() => setSendOpen(true)}><Icon name="mail" size={16} />Enviar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 1.4 }} onClick={onDone}><Icon name="check" size={16} />Nova venda</button>
      </div>

      {sendOpen && <SendNotaModal nota={nota} onSend={onSendEmail} onClose={() => setSendOpen(false)} />}
    </ModalShell>
  );
}

/* ---------- Modal: enviar nota por e-mail ---------- */
function SendNotaModal({ nota, onClose, onSend }) {
  const registered = nota.customer && nota.customer.email ? nota.customer.email : null;
  const [mode, setMode] = useState(registered ? 'registered' : 'custom');
  const [custom, setCustom] = useState('');
  const [alsoWa, setAlsoWa] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());
  const target = mode === 'registered' ? registered : custom.trim();
  const canSend = (mode === 'registered' ? !!registered : validEmail(custom)) && !!(nota.id || nota.fiscalDocumentId);

  const submit = async () => {
    if (!onSend || !(nota.id || nota.fiscalDocumentId)) {
      setError('O documento fiscal ainda não está disponível para envio.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await onSend(nota.id || nota.fiscalDocumentId, target, alsoWa);
      if (response && response.sent === false) {
        setError(response.message || 'Não foi possível enviar a nota por e-mail.');
        return;
      }
      setSent(true);
    } catch (requestError) {
      setError(requestError && requestError.message ? requestError.message : 'Não foi possível enviar a nota por e-mail.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={true} onClose={onClose} maxw={420}>
      {sent ? (
        <div style={{ textAlign: 'center' }}>
          <span className="fa-iconbox" style={{ width: 56, height: 56, margin: '0 auto 14px', background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="check" size={28} stroke={2.4} /></span>
          <h2 className="fa-h3" style={{ fontSize: 20 }}>Nota enviada!</h2>
          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.55 }}>A NFC-e nº {nota.numero} foi enviada para <b>{target}</b>{alsoWa ? ' e por WhatsApp' : ''}.</p>
          <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" style={{ marginTop: 18 }} onClick={onClose}>Concluir</button>
        </div>
      ) : (
        <>
          <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="mail" size={26} /></span>
          <h2 className="fa-h3" style={{ fontSize: 20 }}>Enviar nota por e-mail</h2>
          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 16 }}>Envie a NFC-e nº {nota.numero} ({brl(nota.total)}) para o cliente.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {registered && (
              <button className="fa-choice" data-on={mode === 'registered' ? '1' : '0'} onClick={() => setMode('registered')}>
                <span className="fa-choice-radio" />
                <span className="fa-iconbox" style={{ width: 38, height: 38 }}><Icon name="user" size={18} /></span>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>E-mail cadastrado</div>
                  <div className="ph-cell-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{registered}</div>
                </div>
              </button>
            )}
            <button className="fa-choice" data-on={mode === 'custom' ? '1' : '0'} onClick={() => setMode('custom')}>
              <span className="fa-choice-radio" />
              <span className="fa-iconbox" style={{ width: 38, height: 38 }}><Icon name="edit" size={17} /></span>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>Outro e-mail</div>
                <div className="ph-cell-sub">Informe o endereço desejado</div>
              </div>
            </button>
          </div>

          {mode === 'custom' && (
            <div className="fa-field" style={{ marginTop: 12 }}>
              <label>E-mail do destinatário</label>
              <input className="fa-input" type="email" autoFocus value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="nome@email.com" />
              {custom && !validEmail(custom) && <span style={{ fontSize: 12, color: 'var(--fa-error)', fontWeight: 600 }}>Digite um e-mail válido.</span>}
            </div>
          )}

          <label className="fa-check" data-on={alsoWa ? '1' : '0'} onClick={() => setAlsoWa(!alsoWa)} style={{ marginTop: 10, fontSize: 13 }}>
            <span className="box"><Icon name="check" size={13} stroke={2.6} /></span>Também enviar por WhatsApp{nota.customer && nota.customer.phone ? ' (' + nota.customer.phone + ')' : ''}
          </label>

          {error && <div className="fa-card" style={{ padding: '12px 14px', marginTop: 12, background: 'var(--fa-warn-soft)', color: 'var(--fa-primary)', fontWeight: 600, fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
            <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!canSend || busy} onClick={submit}><Icon name="send" size={16} />{busy ? 'Enviando...' : 'Enviar nota'}</button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

export { IdentifyModal, NotaFiscalModal, PAY_METHODS, PdvCaixaGate, PdvCaixaQueue, PdvScreen, PdvUpsell, QrPlaceholder, RegisterCustomerModal, SendNotaModal, creditCashback, fmtAtendimento, maskCPF, pdvSuggestions };
