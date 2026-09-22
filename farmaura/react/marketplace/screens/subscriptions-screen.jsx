import React, { useState } from "react";
import { ModalShell, ProductVisual, QtyStepper, RecurrenceOffModal, brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";
import { AccountNavShell } from "./account-shared.jsx";
import { LoginGate } from "./extra-screen.jsx";

/* FARMAURA — Compras recorrentes: gestão de assinaturas de medicamentos. */

const FA_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function faDateIn(days) {
  const date = new Date(Date.now() + days * 86400000);
  return date.getDate() + ' ' + FA_MONTHS[date.getMonth()];
}

const FA_FREQS = [{ v: 30, l: 'Todo mês' }, { v: 60, l: 'A cada 2 meses' }, { v: 90, l: 'A cada 3 meses' }];
const faFreqLabel = (value) => (FA_FREQS.find((entry) => entry.v === value) || FA_FREQS[0]).l;

const SUB_CANCEL_REASON_LABEL = {
  no_card_by_due_date: 'Nenhum cartão foi cadastrado até o vencimento.',
  charge_failed: 'A cobrança falhou no vencimento.',
};

/* Um produto do catálogo casado com a assinatura (`p.real`), ou um produto "sintético"
   montado a partir do próprio snapshot da assinatura, para o caso comum de uma assinatura
   criada pelo PDV referenciar um item de estoque sem equivalente no catálogo público do
   marketplace — sem isso, essas linhas some da tela inteiramente. */
function resolveSubProduct(sub, products) {
  const matched = products.find((product) => product.id === sub.id);
  if (matched) return { ...matched, real: true };
  return { id: sub.id, name: sub.name || 'Produto', brand: '', price: sub.unitPrice, cat: 'medicamentos', real: false };
}

function SubscriptionsScreen({ ctx }) {
  const { user, onNav, products, subs, patchSub, removeSub, addSub, skipNextSub } = ctx;
  const [adding, setAdding] = useState(false);
  const [confirmingSub, setConfirmingSub] = useState(null); // { id, action: 'pause' | 'cancel' }

  if (!user) {
    return <LoginGate icon="repeat" title="Entre para gerenciar suas assinaturas" sub="Acompanhe seus medicamentos de uso contínuo, ajuste a frequência e nunca fique sem o que importa." cta="Entrar na conta" onNav={onNav} />;
  }

  const rows = subs.map((sub) => ({ s: sub, p: resolveSubProduct(sub, products) }));
  const confirmingRow = confirmingSub ? rows.find((row) => row.s.id === confirmingSub.id) : null;
  const active = rows.filter((entry) => entry.s.status === 'active' && !entry.s.paused);
  const monthly = active.reduce((sum, entry) => sum + (entry.p.price * 0.85 * entry.s.qty) * (30 / entry.s.freq), 0);
  const eligible = products.filter((product) => product.tags.includes('assinatura') && !subs.find((sub) => sub.id === product.id));

  return (
    <AccountNavShell ctx={ctx} activeKey="subscriptions" crumbLabel="Assinaturas">
      <div className="orders-head" style={{ marginBottom: 4 }}>
        <h1 className="cart-title" style={{ margin: 0 }}>Assinaturas</h1>
        <span className="orders-count">{active.length} {active.length === 1 ? 'assinatura ativa' : 'assinaturas ativas'} · estimativa de {brl(monthly)}/mês</span>
      </div>
      <div className="subs-toolbar">
        <span className="subs-toolbar-hint">Medicamentos de uso contínuo com entrega automática e 15% de desconto garantido.</span>
        <button className="fa-btn fa-btn-primary" type="button" onClick={() => setAdding(true)}><Icon name="plus" size={15} />Assinar novo medicamento</button>
      </div>
      {rows.length === 0 ? (
        <div className="subs-empty">
          <Icon name="repeat" size={34} />
          <p>Você ainda não tem assinaturas ativas. Assine um medicamento de uso contínuo e ganhe 15% de desconto em toda entrega.</p>
          <button className="fa-btn fa-btn-primary" onClick={() => setAdding(true)}>Adicionar medicamento</button>
        </div>
      ) : (
        <div className="subs-list">
          {rows.map(({ s, p }) => {
            const unit = p.price * 0.85;
            const pendingCard = s.status === 'pending_card';
            const cancelled = s.status === 'cancelled';
            const goToProduct = () => p.real && onNav({ name: 'product', id: p.id });
            const pillClass = cancelled ? 'is-canceled' : pendingCard ? 'is-preparing' : s.paused ? 'is-paused' : 'is-delivered';
            const pillIcon = cancelled ? 'close' : pendingCard ? 'card' : s.paused ? 'pause' : 'check';
            const pillLabel = cancelled ? 'Cancelada' : pendingCard ? 'Aguardando cartão' : s.paused ? 'Pausada' : 'Ativa';
            const noteState = cancelled ? 'cancelled' : pendingCard ? 'warn' : s.paused ? 'paused' : undefined;
            const noteIcon = cancelled ? 'close' : pendingCard ? 'card' : s.paused ? 'pause' : 'truck';
            const noteText = cancelled
              ? (SUB_CANCEL_REASON_LABEL[s.cancelReason] || 'Essa assinatura foi cancelada.')
              : pendingCard
              ? `Cadastre um cartão até ${s.dueDateLabel || 'a data prevista'} para não perder o desconto — enviamos lembretes por e-mail.`
              : s.paused
              ? 'Assinatura pausada — retome quando quiser para voltar a receber automaticamente.'
              : `Próxima entrega ${s.nextInDays === 0 ? 'hoje' : `em ${s.nextInDays} ${s.nextInDays === 1 ? 'dia' : 'dias'}`} · ${faDateIn(s.nextInDays)}`;
            return (
              <article className="order-card" key={s.id}>
                <div className="order-card-summary sub-card-summary">
                  <span className="order-summary-thumb" style={{ cursor: p.real ? 'pointer' : 'default' }} onClick={goToProduct}>
                    <ProductVisual product={p} style={{ width: '100%', height: '100%', aspectRatio: 'auto' }} />
                  </span>
                  <span className="order-summary-main">
                    <span className="sub-name" style={{ cursor: p.real ? 'pointer' : 'default' }} onClick={goToProduct}>{p.name}</span>
                    <span className="order-card-date">{p.brand ? p.brand + ' · ' : ''}{faFreqLabel(s.freq)} · Qtd {s.qty}</span>
                  </span>
                  <span className={'order-status ' + pillClass}><Icon name={pillIcon} size={12} stroke={2.4} />{pillLabel}</span>
                  <span className="order-summary-total">{brl(unit * s.qty)}</span>
                </div>

                <div className="order-card-details">
                  <div className="order-progress-panel" data-state={noteState}>
                    <p className="order-progress-note"><Icon name={noteIcon} size={15} stroke={2.2} />{noteText}</p>
                    {pendingCard && (
                      <button className="fa-btn fa-btn-primary fa-btn-sm" style={{ marginTop: 10 }} onClick={() => onNav({ name: 'account' })}>
                        <Icon name="plus" size={13} />Cadastrar cartão
                      </button>
                    )}
                  </div>

                  <div className="order-meta-grid sub-meta-grid">
                    <div className="order-meta-item"><span className="k"><Icon name="repeat" size={13} />Frequência</span><span className="v">{faFreqLabel(s.freq)}</span></div>
                    <div className="order-meta-item"><span className="k"><Icon name="calendar" size={13} />Assinante desde</span><span className="v">{s.since}</span></div>
                    <div className="order-meta-item">
                      <span className="k"><Icon name="tag" size={13} />Preço por entrega</span>
                      <span className="v sub-price-value">
                        <span className="sub-price-was">{brl(p.price * s.qty)}</span>
                        <span className="sub-price-now">{brl(unit * s.qty)}</span>
                        <span className="sub-price-off">-15%</span>
                      </span>
                    </div>
                  </div>

                  {!pendingCard && !cancelled && (
                    <div className="sub-controls-row">
                      <label className="sub-control">
                        Quantidade
                        <QtyStepper value={s.qty} onChange={(qty) => patchSub(s.id, { qty: Math.max(1, qty) })} />
                      </label>
                      <label className="sub-control">
                        Frequência
                        <select className="fa-input" value={s.freq} onChange={(event) => patchSub(s.id, { freq: Number(event.target.value) })} style={{ height: 38, width: 'auto', paddingRight: 30, fontSize: 13 }}>
                          {FA_FREQS.map((freq) => <option key={freq.v} value={freq.v}>{freq.l}</option>)}
                        </select>
                      </label>
                    </div>
                  )}

                  {!pendingCard && !cancelled && (
                    <div className="order-card-foot">
                      <div className="order-card-total-wrap"><span className="k">Total por entrega</span><span className="order-card-total">{brl(unit * s.qty)}</span></div>
                      {s.paused ? (
                        <button className="fa-btn fa-btn-primary" onClick={() => patchSub(s.id, { paused: false })}><Icon name="play" size={16} />Retomar assinatura</button>
                      ) : (
                        <button className="fa-btn fa-btn-primary" onClick={() => skipNextSub(s.id)}><Icon name="chevR" size={16} />Pular próxima entrega</button>
                      )}
                    </div>
                  )}

                  {!pendingCard && !cancelled && (
                    <div className="order-actions-row">
                      {!s.paused && <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setConfirmingSub({ id: s.id, action: 'pause' })}><Icon name="pause" size={14} />Pausar assinatura</button>}
                      <button type="button" className="sub-remove-btn" onClick={() => setConfirmingSub({ id: s.id, action: 'cancel' })}><Icon name="trash" size={14} />Cancelar assinatura</button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="fa-card" style={{ padding: 22, marginTop: 24, background: 'var(--fa-success-soft)', border: 'none' }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="repeat" size={18} style={{ color: 'var(--fa-success)' }} />Como funciona a compra recorrente</div>
        <div className="fa-grid" style={{ '--fa-grid-min': '210px', gap: 16 }}>
          {[
            ['tag', 'Sempre 15% off', 'Desconto fixo em todo item assinado, em cada entrega.'],
            ['bell', 'Lembrete de dose', 'Avisamos antes de cada envio — é só confirmar ou ajustar.'],
            ['pause', 'Flexível de verdade', 'Pause, pule uma entrega ou cancele quando quiser, sem multa.'],
          ].map(([iconName, title, description]) => (
            <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span className="fa-iconbox" style={{ width: 38, height: 38, flex: 'none', background: '#fff', color: 'var(--fa-success)' }}><Icon name={iconName} size={18} /></span>
              <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div><p className="fa-muted" style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 2 }}>{description}</p></div>
            </div>
          ))}
        </div>
      </div>
      {adding && (
        <ModalShell open={adding} onClose={() => setAdding(false)} maxw={520}>
          <div style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span className="fa-iconbox" style={{ width: 40, height: 40, background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="repeat" size={20} /></span>
              <div><div style={{ fontWeight: 800, fontSize: 17 }}>Adicionar à assinatura</div><div className="fa-faint" style={{ fontSize: 13 }}>Produtos disponíveis para compra recorrente</div></div>
            </div>
            {eligible.length === 0 ? (
              <p className="fa-muted" style={{ fontSize: 14, padding: '20px 0', textAlign: 'center' }}>Você já assina todos os produtos elegíveis. 🎉</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, maxHeight: '50vh', overflowY: 'auto' }}>
                {eligible.map((product) => (
                  <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 'var(--fa-r-input)', border: '1px solid var(--fa-mist)' }}>
                    <span className="order-summary-thumb" style={{ width: 48, height: 48, borderRadius: 10, margin: 0 }}><ProductVisual product={product} style={{ width: '100%', height: '100%', aspectRatio: 'auto' }} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3 }}>{product.name}</div>
                      <div className="fa-faint" style={{ fontSize: 12 }}>{brl(product.price * 0.85)} <span style={{ color: 'var(--fa-success)', fontWeight: 600 }}>com assinatura</span></div>
                    </div>
                    <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => { addSub(product.id, 30); setAdding(false); }}><Icon name="plus" size={14} />Assinar</button>
                  </div>
                ))}
              </div>
            )}
            <button className="fa-btn fa-btn-soft fa-btn-block" style={{ marginTop: 16 }} onClick={() => onNav({ name: 'category', cat: 'medicamentos' })}>Explorar mais medicamentos</button>
          </div>
        </ModalShell>
      )}
      <RecurrenceOffModal
        open={!!confirmingSub}
        unitPrice={confirmingRow ? confirmingRow.p.price : 0}
        qty={confirmingRow ? confirmingRow.s.qty : 1}
        freqDays={confirmingRow ? confirmingRow.s.freq : 30}
        onClose={() => setConfirmingSub(null)}
        onConfirm={() => {
          if (confirmingSub.action === 'cancel') removeSub(confirmingSub.id);
          else patchSub(confirmingSub.id, { paused: true });
          setConfirmingSub(null);
        }}
      />
    </AccountNavShell>
  );
}

export { FA_FREQS, SubscriptionsScreen, faDateIn, faFreqLabel };
