import React, { useRef, useState } from "react";
import { PharmacistChatPanel, PrescriptionModal } from "../core/marketplace-care-actions.jsx";
import { brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";
import { faCashback, resolveOrderLineProduct, resolveOrderLineTotal } from "./account-shared.jsx";
import { ShopScreen } from "./shop-screen.jsx";

/* FARMAURA — Telas extras: Saldo de cashback + Mais buscados/Favoritos. */

function LoginGate({ icon, title, sub, cta, onNav }) {
  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 60, paddingBottom: 80, textAlign: 'center' }}>
      <span className="fa-iconbox" style={{ margin: '0 auto 18px', width: 72, height: 72 }}><Icon name={icon} size={32} /></span>
      <h1 className="fa-h2">{title}</h1>
      <p className="fa-lead" style={{ marginTop: 8, maxWidth: 460, marginInline: 'auto' }}>{sub}</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
        <button className="fa-btn fa-btn-primary fa-btn-lg" onClick={() => onNav({ name: 'login' })}>{cta}</button>
        <button className="fa-btn fa-btn-ghost fa-btn-lg" onClick={() => onNav({ name: 'home' })}>Voltar ao início</button>
      </div>
    </div>
  );
}

function CashbackScreen({ ctx }) {
  const { user, onNav, orders, products } = ctx;
  if (!user) {
    return <LoginGate icon="gift" title="Entre para ver seu cashback" sub="Acompanhe quanto você acumulou em cada compra e use o saldo em pedidos futuros." cta="Entrar na conta" onNav={onNav} />;
  }

  const { rows, earned, available, pending, rate } = faCashback(orders, products);
  const withCash = rows.filter((row) => row.cash > 0).length;

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 24, paddingBottom: 32, maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fa-ink-3)', marginBottom: 16 }}>
        <a role="button" onClick={() => onNav({ name: 'home' })}>Início</a><Icon name="chevR" size={13} />
        <span style={{ color: 'var(--fa-ink-2)', fontWeight: 600 }}>Cashback</span>
      </div>
      <section className="fa-cb-hero">
        <div className="fa-cb-hero-glow" />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span className="fa-cb-badge"><Icon name="gift" size={26} stroke={2} /></span>
          <div style={{ flex: 1 }}>
            <p className="fa-cb-kicker">Saldo disponível</p>
            <div className="fa-cb-balance">{brl(available)}</div>
            <p className="fa-cb-note">
              {pending > 0 ? <>+ {brl(pending)} a liberar quando seus pedidos forem entregues</> : <>Acumulado em {withCash} {withCash === 1 ? 'compra' : 'compras'} · {Math.round(rate * 100)}% de volta em cada pedido</>}
            </p>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          <button className="fa-btn fa-btn-lg" style={{ background: '#fff', color: 'var(--fa-primary)' }} onClick={() => onNav({ name: 'offers' })}>Usar em uma compra<Icon name="arrowR" size={18} /></button>
          <button className="fa-btn fa-btn-lg" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }} onClick={() => onNav({ name: 'discover' })}>Ver mais buscados</button>
        </div>
      </section>
      <div className="fa-grid" style={{ '--fa-grid-min': '160px', gap: 14, marginTop: 18 }}>
        {[['gift', brl(earned), 'Total acumulado'], ['bag', withCash, withCash === 1 ? 'Compra com cashback' : 'Compras com cashback'], ['percent', Math.round(rate * 100) + '%', 'De volta por pedido']].map(([iconName, value, label]) => (
          <div key={label} className="fa-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="fa-iconbox" style={{ width: 40, height: 40 }}><Icon name={iconName} size={20} /></span>
            <div><div style={{ fontWeight: 800, fontSize: 19, lineHeight: 1 }}>{value}</div><div className="fa-faint" style={{ fontSize: 12.5, marginTop: 3 }}>{label}</div></div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 26 }}>
        <h2 className="fa-h3" style={{ fontSize: 18, marginBottom: 4 }}>Cashback por compra</h2>
        <p className="fa-faint" style={{ fontSize: 13, marginBottom: 14 }}>Veja quanto cada pedido devolveu para a sua carteira.</p>
        <div className="fa-card" style={{ padding: '4px 22px' }}>
          {rows.map((row) => {
            const pickup = row.order.fulfillment === 'pickup';
            return (
              <div className="fa-row" key={row.order.id} style={{ gap: 14 }}>
                <span className="fa-iconbox" style={{ width: 44, height: 44, flex: 'none', background: row.released ? 'var(--fa-success-soft)' : 'var(--fa-warn-soft)', color: row.released ? 'var(--fa-success)' : 'var(--fa-warn)' }}>
                  <Icon name={row.released ? 'gift' : 'clock'} size={20} />
                </span>
                <div className="fa-row-main">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="fa-row-label fa-mono">#{row.order.id}</span>
                    <span className={'fa-badge ' + (pickup ? 'fa-badge-mist' : 'fa-badge-health')}><Icon name={pickup ? 'bag' : 'truck'} size={12} />{pickup ? 'Retirada' : 'Entrega'}</span>
                  </div>
                  <div className="fa-row-desc">{row.order.date} · {row.count} {row.count === 1 ? 'item' : 'itens'} · pedido de {brl(row.total)}</div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: row.released ? 'var(--fa-success)' : 'var(--fa-ink-2)' }}>+ {brl(row.cash)}</div>
                  <div className="fa-faint" style={{ fontSize: 11.5 }}>{row.released ? 'liberado' : 'a liberar'}</div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="fa-faint" style={{ fontSize: 12, marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="shield" size={13} />O cashback é liberado após a entrega e vale por 90 dias.</p>
      </div>
    </div>
  );
}

function SavedScreen({ ctx }) {
  const { user, onNav } = ctx;
  if (!user) {
    return <LoginGate icon="heart" title="Entre para ver seus produtos salvos" sub="Faça login para acessar os produtos que você favoritou e mantê-los salvos em qualquer dispositivo." cta="Entrar para ver salvos" onNav={onNav} />;
  }
  return <ShopScreen ctx={ctx} mode="saved" />;
}

function PrescriptionScreen({ ctx }) {
  const { onNav, openChat } = ctx;
  const [files, setFiles] = useState([]);
  const [sent, setSent] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const addFiles = (list) => {
    const nextFiles = [...list].map((file) => ({ name: file.name, size: (file.size / 1024).toFixed(0) + ' KB' }));
    if (nextFiles.length) {
      setFiles((current) => [...current, ...nextFiles]);
    }
  };
  const notices = [
    { ic: 'rx', tone: 'info', t: 'Medicamentos com retenção de receita', d: 'Itens tarjados só são liberados após a validação da prescrição pelo nosso farmacêutico.' },
    { ic: 'shield', tone: 'success', t: 'Validação por farmacêutico', d: 'Conferimos a prescrição, a dosagem e a validade antes de qualquer envio do pedido.' },
    { ic: 'clock', tone: 'warn', t: 'Resposta em até 30 minutos', d: 'Você recebe um aviso assim que a receita for validada. Atendimento todos os dias, 24h.' },
    { ic: 'lock', tone: 'mist', t: 'Seus dados estão protegidos', d: 'A receita é usada apenas para a dispensação e fica visível só para a equipe farmacêutica.' },
  ];
  const toneBg = { info: 'var(--fa-info-soft)', success: 'var(--fa-success-soft)', warn: 'var(--fa-warn-soft)', mist: 'var(--fa-mist-2)' };
  const toneFg = { info: 'var(--fa-info)', success: 'var(--fa-success)', warn: 'var(--fa-warn)', mist: 'var(--fa-ink-2)' };

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 24, paddingBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fa-ink-3)', marginBottom: 14 }}>
        <a role="button" onClick={() => onNav({ name: 'home' })}>Início</a><Icon name="chevR" size={13} />
        <span style={{ color: 'var(--fa-ink-2)', fontWeight: 600 }}>Receita digital</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <span className="fa-iconbox" style={{ width: 56, height: 56, flex: 'none' }}><Icon name="rx" size={28} /></span>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="fa-h1" style={{ fontSize: 'clamp(26px,3vw,36px)' }}>Receita digital</h1>
          <p className="fa-lead" style={{ marginTop: 6 }}>Envie sua receita, acompanhe a validação e fale direto com o farmacêutico — tudo em um só lugar.</p>
        </div>
      </div>
      <div className="fa-cart-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 'var(--fa-gap)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div className="fa-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span className="fa-iconbox" style={{ width: 38, height: 38, background: sent ? 'var(--fa-success-soft)' : 'var(--fa-rose-soft)', color: sent ? 'var(--fa-success)' : 'var(--fa-primary)' }}><Icon name={sent ? 'check' : 'camera'} size={19} /></span>
              <div><div style={{ fontWeight: 800, fontSize: 17 }}>{sent ? 'Receita enviada!' : 'Enviar receita'}</div><div className="fa-faint" style={{ fontSize: 13 }}>{sent ? 'Em validação pela equipe farmacêutica' : 'Anexe a foto ou o PDF da sua receita'}</div></div>
            </div>
            {!sent ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className={'fa-drop' + (drag ? ' is-drag' : '')} onClick={() => inputRef.current && inputRef.current.click()} onDragOver={(event) => { event.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(event) => { event.preventDefault(); setDrag(false); addFiles(event.dataTransfer.files); }} style={{ padding: 32 }}>
                  <input ref={inputRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={(event) => addFiles(event.target.files)} />
                  <span className="fa-iconbox" style={{ width: 52, height: 52, margin: '0 auto 12px' }}><Icon name="camera" size={26} /></span>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Toque para anexar ou arraste aqui</div>
                  <div className="fa-faint" style={{ fontSize: 13, marginTop: 4 }}>JPG, PNG ou PDF · até 10 MB por arquivo</div>
                </div>
                {files.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {files.map((file, index) => (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--fa-mist-2)', borderRadius: 'var(--fa-r-btn)', padding: '10px 12px' }}>
                        <span className="fa-iconbox" style={{ width: 34, height: 34 }}><Icon name="rx" size={17} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
                          <div className="fa-faint" style={{ fontSize: 11.5 }}>{file.size}</div>
                        </div>
                        <button className="fa-iconbtn" style={{ width: 32, height: 32 }} aria-label="remover" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Icon name="trash" size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={files.length === 0} onClick={() => setSent(true)}>
                  <Icon name="rx" size={17} />Enviar receita para validação
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 12, padding: 16, background: 'var(--fa-success-soft)', borderRadius: 'var(--fa-r-card)', alignItems: 'flex-start' }}>
                  <Icon name="check" size={20} stroke={2.4} style={{ color: 'var(--fa-success)', flex: 'none', marginTop: 1 }} />
                  <div style={{ fontSize: 13.5, color: 'var(--fa-success)', lineHeight: 1.5 }}>Recebemos {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}. Nossa equipe farmacêutica vai validar e organizar seus medicamentos — você recebe um aviso em instantes.</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="fa-btn fa-btn-primary" onClick={() => openChat && openChat()}><Icon name="chat" size={16} />Falar com o farmacêutico</button>
                  <button className="fa-btn fa-btn-soft" onClick={() => { setSent(false); setFiles([]); }}>Enviar outra receita</button>
                </div>
              </div>
            )}
          </div>
          <div className="fa-card" style={{ padding: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Avisos importantes</div>
            <p className="fa-faint" style={{ fontSize: 13, marginBottom: 16 }}>Leia antes de enviar — assim seu pedido é liberado mais rápido.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {notices.map((notice) => (
                <div key={notice.t} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <span className="fa-iconbox" style={{ width: 42, height: 42, flex: 'none', background: toneBg[notice.tone], color: toneFg[notice.tone] }}><Icon name={notice.ic} size={20} /></span>
                  <div><div style={{ fontWeight: 700, fontSize: 14.5 }}>{notice.t}</div><p className="fa-muted" style={{ fontSize: 13, lineHeight: 1.45, marginTop: 2 }}>{notice.d}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="fa-cart-summary" style={{ position: 'sticky', top: 150, padding: 0 }}>
          <div className="fa-card" style={{ overflow: 'hidden', padding: 0 }}>
            <PharmacistChatPanel style={{ height: 'min(74vh, 560px)' }} headStyle={{ paddingRight: 18 }} />
          </div>
          <p className="fa-faint" style={{ fontSize: 12, marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}><Icon name="shield" size={13} />Orientação farmacêutica · não substitui a consulta médica.</p>
        </div>
      </div>
    </div>
  );
}

export { CashbackScreen, LoginGate, PrescriptionScreen, SavedScreen, faCashback };
