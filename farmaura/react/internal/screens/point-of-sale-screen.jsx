import React, { useEffect, useState } from "react";
import { ModalShell, QtyStepper, brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { RecurringBadge, Topbar, stockState } from "../core/internal-shell.jsx";

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

/* Credita o cashback ganho e debita o cashback usado no cadastro do cliente. */
function creditCashback(customer, earned, ticket, applied) {
  if (!customer) return;
  customer.cashback = Math.round(Math.max(0, (customer.cashback || 0) - (applied || 0) + (earned || 0)) * 100) / 100;
  customer.orders = (customer.orders || 0) + 1;
  customer.totalSpent = Math.round(((customer.totalSpent || 0) + (ticket || 0)) * 100) / 100;
  customer.lastDays = 0;
}

/* Sugestões: o que o cliente mais compra (casado com o estoque), para oferecer no balcão. */
function pdvSuggestions(customer, inventory, cart) {
  const inCart = new Set(cart.map((c) => c.id));
  const pool = [];
  if (customer && customer.topProducts) {
    customer.topProducts.forEach((tp) => {
      const key = tp.n.toLowerCase().split(' ')[0];
      const it = inventory.find((x) => x.name.toLowerCase().includes(key) && x.qty > 0);
      if (it && !pool.find((p) => p.it.id === it.id)) pool.push({ it, q: tp.q });
    });
  }
  if (pool.length < 3) {
    inventory.filter((x) => x.qty > 0).slice(0, 6).forEach((it) => { if (!pool.find((p) => p.it.id === it.id)) pool.push({ it, q: null }); });
  }
  return pool.filter((p) => !inCart.has(p.it.id)).slice(0, 4);
}

/* Painel de sugestões (visão do farmacêutico) */
function PdvUpsell({ customer, inventory, cart, onAdd }) {
  const sugg = pdvSuggestions(customer, inventory, cart);
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

/* Tela do CAIXA — fila de pedidos enviados pelo farmacêutico.
   No caixa, só aparecem os clientes que têm um pedido enviado para cá. */
function PdvCaixaQueue({ queue, inventory, onClaim, onPharm, customerByName }) {
  const enrich = (entry) => {
    const lines = (entry.items || []).map((it) => { const p = inventory.find((x) => x.id === it.id); return p ? { ...p, qty: it.qty } : null; }).filter(Boolean);
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

function PdvScreen({ ctx }) {
  const { inventory, pdvCart, pdvCustomer, setPdvCustomer, pdvAdd, pdvSetQty, pdvRemove, pdvClear, onLogout, finalizeSale, pdvQueue, pdvSendToCashier, pdvClaimFromQueue, recordSale, customers = [], customerByName = {}, storeFiscal = {}, pharmacistProfile = {}, notify, sendFiscalDocumentEmail, createPdvCustomer } = ctx;
  const [q, setQ] = useState('');
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
    pdvClear(); setPdvCustomer(null); setDiscount(0); setCashWanted(0);
    setCaixaReady(false); setStartedAt(null); setElapsed(0);
  };

  // Trocar de papel zera a sessão: cada estação (farmacêutico / caixa) começa do seu próprio ponto de entrada.
  const switchOperator = (role) => { if (role === operator) return; resetAtendimento(); setNota(null); setSentModal(false); setOperator(role); };

  // resultados de busca
  const results = q.trim() ? inventory.filter((it) => (it.name + it.brand + it.ean).toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  // linhas do carrinho (junta com o estoque)
  const lines = pdvCart.map((c) => ({ ...inventory.find((it) => it.id === c.id), qty: c.qty })).filter((l) => l.id);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discVal = subtotal * (discount / 100);
  const afterDisc = Math.max(0, subtotal - discVal);
  const cashAvailable = pdvCustomer ? (pdvCustomer.cashback || 0) : 0;
  const cashApplied = Math.max(0, Math.min(cashWanted, cashAvailable, afterDisc));
  const total = Math.max(0, afterDisc - cashApplied);
  const hasControlled = lines.some((l) => l.controlled);
  const cashback = pdvCustomer ? Math.round(total * 0.05 * 100) / 100 : 0;

  const addProduct = (it) => { pdvAdd(it.id); setQ(''); };
  const emit = async () => {
    if (pdvCustomer) creditCashback(pdvCustomer, cashback, total, cashApplied);
    try {
      const synced = recordSale && await recordSale({ pay, items: lines, customer: pdvCustomer, cpfNota, cashback, cashApplied, discVal });
      if (!synced) {
        notify && notify('Não foi possível emitir a nota fiscal agora. Tente novamente.', 'warn');
        return;
      }
      setNota({ ...synced, cpfNota, cashback, cashApplied, discVal });
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível concluir a venda.', 'warn');
    }
  };

  return (
    <>
      <Topbar title="Balcão · Venda no momento" sub={operator === 'pharm' ? 'Visão do farmacêutico — monte o pedido e oriente o cliente' : 'Visão do caixa — receba o pagamento e emita a nota'} onLogout={onLogout}>
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
            ? <PdvCaixaQueue queue={pdvQueue} inventory={inventory} onClaim={(entry) => { pdvClaimFromQueue(entry.id); setDiscount(entry.discount || 0); setCaixaReady(true); }} onPharm={() => switchOperator('pharm')} customerByName={customerByName} />
            : <PdvCaixaGate operator={operator} onIdentify={() => setIdOpen(true)} onConsumer={() => setCaixaReady(true)} />
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
                    const ss = stockState(it);
                    return (
                      <button key={it.id} className="pdv-result" onClick={() => addProduct(it)} disabled={it.qty <= 0}>
                        <span className="fa-iconbox" style={{ width: 38, height: 38, flex: 'none' }}><Icon name="pill" size={18} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>{it.name}{it.controlled && <span className="fa-badge fa-badge-rx" style={{ fontSize: 9 }}>Tarja</span>}</div>
                          <div className="ph-cell-sub">{it.brand} · <span className="fa-mono">{it.ean}</span> · {it.loc}</div>
                        </div>
                        <div style={{ textAlign: 'right', flex: 'none' }}>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>{brl(it.price)}</div>
                          <div className="ph-cell-sub" style={{ color: ss.color }}>{it.qty > 0 ? it.qty + ' em estoque' : 'esgotado'}</div>
                        </div>
                        <Icon name="plusCircle" size={22} style={{ color: it.qty > 0 ? 'var(--fa-primary)' : 'var(--fa-ink-3)', flex: 'none' }} />
                      </button>
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
              ) : lines.map((l) => (
                <div className="pdv-line" key={l.id}>
                  <span className="fa-iconbox" style={{ width: 42, height: 42, flex: 'none' }}><Icon name="pill" size={19} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>{l.name}{l.controlled && <span className="fa-badge fa-badge-rx" style={{ fontSize: 10 }}><Icon name="lock" size={10} />Tarja</span>}</div>
                    <div className="ph-cell-sub">{l.brand} · {l.loc} · {brl(l.price)} un</div>
                  </div>
                  <QtyStepper value={l.qty} onChange={(v) => pdvSetQty(l.id, v)} />
                  <div style={{ width: 84, textAlign: 'right', fontWeight: 800, fontSize: 15, flex: 'none' }}>{brl(l.price * l.qty)}</div>
                  <button className="fa-iconbtn" style={{ width: 34, height: 34 }} aria-label="remover" onClick={() => pdvRemove(l.id)}><Icon name="trash" size={15} /></button>
                </div>
              ))}
            </div>

            {hasControlled && (
              <div style={{ display: 'flex', gap: 12, padding: 14, background: 'var(--fa-info-soft)', borderRadius: 12, alignItems: 'flex-start' }}>
                <Icon name="rx" size={20} style={{ color: 'var(--fa-info)', flex: 'none', marginTop: 1 }} />
                <div style={{ fontSize: 13, color: 'var(--fa-info)', lineHeight: 1.5 }}>Há item <b>controlado (tarja)</b> na venda — confira a receita e registre a retenção no SNGPC antes de finalizar.</div>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span className="fa-avatar fa-avatar-sm" style={{ background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}>{pdvCustomer.avatar || (pdvCustomer.name[0] || '?')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{pdvCustomer.name}</div>
                    <div className="ph-cell-sub fa-mono">{pdvCustomer.doc || 'CPF não informado'}</div>
                  </div>
                  {pdvCustomer.recurring && <RecurringBadge name={pdvCustomer.name} small customerByName={customerByName} />}
                </div>
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
            {operator === 'pharm' && <PdvUpsell customer={pdvCustomer} inventory={inventory} cart={pdvCart} onAdd={pdvAdd} />}

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

            {/* Totais — bruto + com desconto (ambas as visões) */}
            <div className="fa-card" style={{ padding: 18 }}>
              <div className="pdv-totrow"><span>Valor bruto</span><span>{brl(subtotal)}</span></div>
              <div className="fa-field" style={{ margin: '8px 0' }}>
                <label>Desconto (%)</label>
                <input className="fa-input" type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(Math.max(0, Math.min(100, +e.target.value)))} />
              </div>
              {discVal > 0 && <div className="pdv-totrow" style={{ color: 'var(--fa-success)' }}><span>Desconto aplicado</span><span>− {brl(discVal)}</span></div>}
              {cashApplied > 0 && <div className="pdv-totrow" style={{ color: 'var(--fa-primary)' }}><span>Cashback aplicado</span><span>− {brl(cashApplied)}</span></div>}
              <div className="pdv-totrow"><span>Itens</span><span>{count}</span></div>
              <div style={{ height: 1, background: 'var(--fa-mist)', margin: '12px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>{discVal > 0 || cashApplied > 0 ? 'Total a pagar' : 'Total'}</span>
                <span style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-.02em' }}>{brl(total)}</span>
              </div>
              {cashback > 0 && <div className="ph-cell-sub" style={{ textAlign: 'right', marginTop: 4, color: 'var(--fa-primary)' }}>+ {brl(cashback)} de cashback p/ o cliente</div>}

              {operator === 'pharm' ? (
                <>
                  <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" style={{ marginTop: 16 }} disabled={lines.length === 0} onClick={() => { pdvSendToCashier({ customer: pdvCustomer, items: pdvCart, discount }); finalizeSale && finalizeSale('Pedido enviado ao caixa'); setSentModal(true); }}>
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
    </>
  );
}

/* ---------- Modal: identificar cliente ---------- */
function IdentifyModal({ current, onPick, onClose, customers, onCreate }) {
  const CUSTOMERS = Array.isArray(customers) ? customers : [];
  const [q, setQ] = useState('');
  const [cpf, setCpf] = useState('');
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const cpfDigits = cpf.replace(/\D/g, '').length;
  const list = CUSTOMERS.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || (c.doc || '').includes(q));
  const handleCreate = async () => {
    try {
      setCreateError('');
      setSaving(true);
      const created = await onCreate({ name: nome.trim(), doc: cpf.trim(), phone: '' });
      onPick(created);
    } catch (error) {
      setCreateError(error && error.message ? error.message : 'Não foi possível cadastrar o cliente agora.');
    } finally {
      setSaving(false);
    }
  };
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

      {/* Cliente sem cadastro: nome e/ou CPF para identificar e armazenar o cashback */}
      <div style={{ borderTop: '1px solid var(--fa-mist)', paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className="fa-iconbox" style={{ width: 32, height: 32 }}><Icon name="plusCircle" size={16} /></span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 13.5 }}>Cliente sem cadastro</div><div className="ph-cell-sub">Informe o nome e/ou o CPF — o que o cliente preferir</div></div>
        </div>
        <div className="fa-field" style={{ marginBottom: 10 }}><label>Nome {cpfDigits === 11 ? '(opcional)' : ''}</label><input className="fa-input" placeholder="Nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        <div className="fa-field" style={{ marginBottom: 12 }}><label>CPF {nome.trim() ? '(opcional)' : ''}</label><input className="fa-input fa-mono" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} /></div>
        {createError ? <div style={{ marginBottom: 10, color: 'var(--fa-error)', fontSize: 12.5 }}>{createError}</div> : null}
        <button className="fa-btn fa-btn-primary fa-btn-block" disabled={saving || !(nome.trim() || cpfDigits === 11)} onClick={handleCreate}>
          <Icon name="user" size={16} />{saving ? 'Cadastrando...' : 'Cadastrar e usar'}
        </button>
      </div>

      <button className="fa-btn fa-btn-ghost fa-btn-block" style={{ marginTop: 10 }} onClick={() => onPick(null)}>Consumidor não identificado</button>
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

export { IdentifyModal, NotaFiscalModal, PAY_METHODS, PdvCaixaGate, PdvCaixaQueue, PdvScreen, PdvUpsell, QrPlaceholder, SendNotaModal, creditCashback, fmtAtendimento, maskCPF, pdvSuggestions };
