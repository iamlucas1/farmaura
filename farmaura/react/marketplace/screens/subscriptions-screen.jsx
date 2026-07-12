import React, { useState } from "react";
import { ModalShell, QtyStepper, brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";
import { LoginGate } from "./extra-screen.jsx";

/* FARMAURA — Compras recorrentes: gestão de assinaturas de medicamentos. */

const FA_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function faDateIn(days) {
  const date = new Date(Date.now() + days * 86400000);
  return date.getDate() + ' ' + FA_MONTHS[date.getMonth()];
}

const FA_FREQS = [{ v: 30, l: 'Todo mês' }, { v: 60, l: 'A cada 2 meses' }, { v: 90, l: 'A cada 3 meses' }];
const faFreqLabel = (value) => (FA_FREQS.find((entry) => entry.v === value) || FA_FREQS[0]).l;

function SubProductIcon({ cat, size = 30 }) {
  const name = cat === 'medicamentos' ? 'pill' : cat === 'perfumaria' ? 'sparkle' : cat === 'bem-estar' ? 'leaf' : 'heart';
  return <Icon name={name} size={size} style={{ color: 'var(--fa-primary)', opacity: .5 }} />;
}

function SubscriptionsScreen({ ctx }) {
  const { user, onNav, products, subs, patchSub, removeSub, addSub, skipNextSub } = ctx;
  const [adding, setAdding] = useState(false);

  if (!user) {
    return <LoginGate icon="repeat" title="Entre para gerenciar suas assinaturas" sub="Acompanhe seus medicamentos de uso contínuo, ajuste a frequência e nunca fique sem o que importa." cta="Entrar na conta" onNav={onNav} />;
  }

  const rows = subs.map((sub) => ({ s: sub, p: products.find((product) => product.id === sub.id) })).filter((entry) => entry.p);
  const active = rows.filter((entry) => !entry.s.paused);
  const monthly = active.reduce((sum, entry) => sum + (entry.p.price * 0.85 * entry.s.qty) * (30 / entry.s.freq), 0);
  const nextRow = active.slice().sort((left, right) => left.s.nextInDays - right.s.nextInDays)[0];
  const eligible = products.filter((product) => product.tags.includes('assinatura') && !subs.find((sub) => sub.id === product.id));

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 24, paddingBottom: 36, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fa-ink-3)', marginBottom: 16 }}>
        <a role="button" onClick={() => onNav({ name: 'home' })}>Início</a><Icon name="chevR" size={13} />
        <span style={{ color: 'var(--fa-ink-2)', fontWeight: 600 }}>Compras recorrentes</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <span className="fa-iconbox" style={{ width: 56, height: 56, flex: 'none', background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="repeat" size={28} /></span>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="fa-h1" style={{ fontSize: 'clamp(26px,3vw,36px)' }}>Compras recorrentes</h1>
          <p className="fa-lead" style={{ marginTop: 6 }}>Gerencie os medicamentos que chegam automaticamente — com 15% de desconto e lembrete de dose.</p>
        </div>
      </div>
      <div className="fa-grid" style={{ '--fa-grid-min': '210px', gap: 14, marginBottom: 24 }}>
        {[
          ['repeat', active.length, active.length === 1 ? 'Assinatura ativa' : 'Assinaturas ativas', 'var(--fa-success)'],
          ['truck', nextRow ? faDateIn(nextRow.s.nextInDays) : '—', nextRow ? 'Próxima entrega · ' + nextRow.p.name.split('—')[0].trim() : 'Sem entregas agendadas', 'var(--fa-info)'],
          ['tag', brl(monthly), 'Estimativa por mês', 'var(--fa-primary)'],
        ].map(([iconName, value, label, color]) => (
          <div key={label} className="fa-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="fa-iconbox" style={{ width: 42, height: 42, flex: 'none', background: 'color-mix(in srgb,' + color + ' 12%, transparent)', color }}><Icon name={iconName} size={20} /></span>
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1 }}>{value}</div><div className="fa-faint" style={{ fontSize: 12, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div></div>
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="fa-card" style={{ padding: 48, textAlign: 'center' }}>
          <span className="fa-iconbox" style={{ width: 64, height: 64, margin: '0 auto 16px', background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="repeat" size={30} /></span>
          <h2 className="fa-h3" style={{ fontSize: 18 }}>Você ainda não tem assinaturas</h2>
          <p className="fa-muted" style={{ marginTop: 8, fontSize: 14, maxWidth: 420, marginInline: 'auto' }}>Assine seus medicamentos de uso contínuo e receba com 15% de desconto, sem precisar refazer o pedido.</p>
          <button className="fa-btn fa-btn-primary fa-btn-lg" style={{ marginTop: 18 }} onClick={() => setAdding(true)}>Adicionar medicamento</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map(({ s, p }) => {
            const unit = p.price * 0.85;
            return (
              <div key={s.id} className="fa-card" style={{ padding: 0, overflow: 'hidden', opacity: s.paused ? .72 : 1 }}>
                <div style={{ display: 'flex', gap: 16, padding: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div className="fa-ph" data-cat={p.cat} style={{ width: 84, height: 84, aspectRatio: 'auto', flex: 'none', cursor: 'pointer', borderRadius: 'var(--fa-r-input)' }} onClick={() => onNav({ name: 'product', id: p.id })}>
                    <SubProductIcon cat={p.cat} size={26} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="fa-pc-brand">{p.brand}</span>
                      {s.paused ? <span className="fa-badge fa-badge-mist"><Icon name="pause" size={11} stroke={2.2} />Pausada</span> : <span className="fa-badge fa-badge-health"><Icon name="repeat" size={11} stroke={2.1} />Ativa</span>}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.3, marginTop: 2, cursor: 'pointer' }} onClick={() => onNav({ name: 'product', id: p.id })}>{p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, color: 'var(--fa-ink-2)' }}>
                      <Icon name="truck" size={15} style={{ color: 'var(--fa-success)' }} />
                      {s.paused ? <span>Entregas pausadas</span> : <span>Próxima entrega <strong style={{ color: 'var(--fa-ink)' }}>{faDateIn(s.nextInDays)}</strong> · {faFreqLabel(s.freq).toLowerCase()}</span>}
                      <span className="fa-faint">· assina desde {s.since}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{brl(unit * s.qty)}</div>
                    <div className="fa-price-old" style={{ fontSize: 12.5 }}>{brl(p.price * s.qty)}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fa-success)', fontWeight: 700 }}>-15% assinatura</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--fa-mist)', background: 'var(--fa-mist-2)', padding: '12px 18px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--fa-ink-2)' }}>
                    Quantidade
                    <QtyStepper value={s.qty} onChange={(qty) => patchSub(s.id, { qty: Math.max(1, qty) })} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--fa-ink-2)' }}>
                    Frequência
                    <select className="fa-input" value={s.freq} onChange={(event) => patchSub(s.id, { freq: Number(event.target.value) })} style={{ height: 38, width: 'auto', paddingRight: 30, fontSize: 13 }}>
                      {FA_FREQS.map((freq) => <option key={freq.v} value={freq.v}>{freq.l}</option>)}
                    </select>
                  </label>
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                    {!s.paused && <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => skipNextSub(s.id)}><Icon name="chevR" size={14} />Pular próxima</button>}
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => patchSub(s.id, { paused: !s.paused })}><Icon name={s.paused ? 'play' : 'pause'} size={14} />{s.paused ? 'Retomar' : 'Pausar'}</button>
                    <button className="fa-btn fa-btn-sm" style={{ color: 'var(--fa-error)', background: 'transparent' }} onClick={() => removeSub(s.id)}><Icon name="trash" size={14} />Cancelar</button>
                  </div>
                </div>
              </div>
            );
          })}
          <button className="fa-btn fa-btn-soft" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}><Icon name="plus" size={16} />Adicionar medicamento</button>
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
                    <div className="fa-ph" data-cat={product.cat} style={{ width: 48, height: 48, aspectRatio: 'auto', flex: 'none', borderRadius: 10 }}><SubProductIcon cat={product.cat} size={20} /></div>
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
    </div>
  );
}

export { FA_FREQS, SubProductIcon, SubscriptionsScreen, faDateIn, faFreqLabel };
