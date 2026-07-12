import React, { useState } from "react";
import { ModalShell, brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { OC_STATUS, Topbar, customerOf } from "../core/internal-shell.jsx";
import { QrPlaceholder, SendNotaModal } from "./point-of-sale-screen.jsx";

/* FARMAURA Console — Vendas & Notas: registro unificado das vendas PAGAS
   (online + balcão/PDV) com emissão e consulta da nota fiscal (NFC-e).
   - Balcão: aparece quando a venda foi concluída (nota emitida no caixa).
   - Online: aparece quando o pagamento foi confirmado, mesmo sem entrega ainda. */

const PAY_LABELS = { cash: 'Dinheiro', pix: 'Pix', debit: 'Débito', credit: 'Crédito' };
const PAY_ICONS = { cash: 'cash', pix: 'pix', debit: 'card', credit: 'card' };
function methodLabel(p) { return PAY_LABELS[p] || p || '—'; }
function onlinePayLabel(s) { return (s || '').split('·')[0].trim(); }

/* Card de métrica do topo */
function SalesStat({ icon, label, value, tone }) {
  const bg = tone === 'warn' ? 'var(--fa-warn-soft)' : tone === 'success' ? 'var(--fa-success-soft)' : 'var(--fa-rose-soft)';
  const fg = tone === 'warn' ? 'var(--fa-warn)' : tone === 'success' ? 'var(--fa-success)' : 'var(--fa-primary)';
  return (
    <div className="ph-stat">
      <div className="ph-stat-top">
        <span className="ph-stat-ic" style={{ background: bg, color: fg }}><Icon name={icon} size={20} /></span>
      </div>
      <div className="ph-stat-val">{value}</div>
      <div className="ph-stat-label">{label}</div>
    </div>
  );
}

function SalesScreen({ ctx }) {
  const { orders, pdvSales, onLogout, customerByName = {}, storeFiscal = {}, pharmacistProfile = {}, sendFiscalDocumentEmail, notify } = ctx;
  const [chan, setChan] = useState('all');        // all | online | pdv
  const [showPending, setShowPending] = useState(false); // exibir pedidos aguardando pagamento
  const [q, setQ] = useState('');
  const [modalSale, setModalSale] = useState(null);

  // ---- normaliza vendas online ----
  const onlineSales = orders.map((o) => ({
    key: 'o-' + o.id, source: 'online', id: o.id,
    channelLabel: o.channel,
    customerName: o.customer, customerDoc: o.doc,
    when: o.placed, items: o.items, count: o.items.reduce((s, i) => s + i.qty, 0),
    total: o.total, payLabel: onlinePayLabel(o.payment),
    paid: /pago/i.test(o.payment),
    fulfillment: o.fulfillment, status: o.status,
    nfce: o.nfce || null,
    customerObj: customerOf(o.customer, customerByName) || { name: o.customer, email: '', phone: '', doc: o.doc },
  }));

  // ---- normaliza vendas de balcão (todas pagas/concluídas) ----
  const balcaoSales = pdvSales.map((s) => ({
    key: 'p-' + s.numero, source: 'pdv', id: 'NFC-e ' + s.numero,
    channelLabel: 'Balcão',
    customerName: s.customer ? s.customer.name : 'Consumidor não identificado',
    customerDoc: s.customer && s.cpfNota ? s.customer.doc : null,
    when: s.when, items: s.items, count: s.items.reduce((sum, i) => sum + i.qty, 0),
    total: s.total, payLabel: methodLabel(s.pay), payMethod: s.pay,
    paid: true, fulfillment: 'balcao', status: 'concluida',
    nfce: { numero: s.numero, chave: s.chave, serie: s.serie || '001', when: s.when },
    cashback: s.cashback, discVal: s.discVal, cpfNota: s.cpfNota,
    customerObj: s.customer || { name: 'Consumidor não identificado', email: '', phone: '' },
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
  if (chan !== 'all') list = list.filter((s) => s.source === chan);
  if (q.trim()) { const k = q.toLowerCase(); list = list.filter((s) => (s.customerName + ' ' + s.id + ' ' + (s.nfce ? s.nfce.numero : '')).toLowerCase().includes(k)); }

  const counts = {
    all: everything.filter((s) => s.paid || showPending).length,
    online: onlineSales.filter((s) => s.paid || showPending).length,
    pdv: balcaoSales.length,
  };

  const genNota = (sale) => {
    if (!sale.nfce) {
      notify && notify('A nota fiscal desta venda ainda está sendo processada. Atualize a página em instantes.', 'warn');
      return;
    }
    setModalSale(sale);
  };

  const sitOf = (s) => s.source === 'pdv'
    ? { label: 'Venda concluída', cls: 'fa-badge-health', icon: 'check' }
    : (OC_STATUS[s.status] || { label: '—', cls: 'fa-badge-mist', icon: 'clock' });

  return (
    <>
      <Topbar title="Vendas & Notas" sub="Vendas pagas — online e balcão — com emissão e consulta de nota fiscal" onLogout={onLogout}>
        <div className="ph-topsearch"><Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} /><input placeholder="Buscar venda, cliente ou nº da nota" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        {/* Métricas — somente vendas pagas */}
        <div className="ph-stats" style={{ marginBottom: 20 }}>
          <SalesStat icon="money" label="Faturamento pago" value={brl(faturamento)} />
          <SalesStat icon="check" label="Vendas pagas" value={paidAll.length} tone="success" />
          <SalesStat icon="receipt" label="Notas emitidas" value={emitidas} />
          <SalesStat icon="printer" label="Notas a emitir" value={aEmitir} tone="warn" />
        </div>

        {/* Filtros por canal + alternar pendentes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="ph-seg">
            <button data-on={chan === 'all' ? '1' : '0'} onClick={() => setChan('all')}>Todas <span className="ph-seg-n">{counts.all}</span></button>
            <button data-on={chan === 'online' ? '1' : '0'} onClick={() => setChan('online')}><Icon name="bag" size={15} />Online <span className="ph-seg-n">{counts.online}</span></button>
            <button data-on={chan === 'pdv' ? '1' : '0'} onClick={() => setChan('pdv')}><Icon name="cash" size={15} />Balcão <span className="ph-seg-n">{counts.pdv}</span></button>
          </div>
          <label className="fa-check" data-on={showPending ? '1' : '0'} onClick={() => setShowPending(!showPending)} style={{ marginLeft: 'auto', fontSize: 13 }}>
            <span className="box"><Icon name="check" size={13} stroke={2.6} /></span>
            Mostrar aguardando pagamento{pendentes > 0 ? ' (' + pendentes + ')' : ''}
          </label>
          <button className="fa-btn fa-btn-soft fa-btn-sm"><Icon name="download" size={15} />Exportar</button>
        </div>

        {/* Tabela de vendas */}
        <div className="fa-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="sales-head">
            <span style={{ width: 44, flex: 'none' }}></span>
            <span style={{ flex: 1 }}>Venda · cliente</span>
            <span className="sales-sit-h">Situação</span>
            <span style={{ width: 96, flex: 'none', textAlign: 'right' }}>Total</span>
            <span style={{ width: 132, flex: 'none', textAlign: 'right' }}>Nota fiscal</span>
          </div>

          {list.length === 0 ? (
            <div className="ph-empty" style={{ padding: '56px 24px' }}>
              <span className="fa-iconbox"><Icon name="receipt" size={28} /></span>
              <div style={{ fontWeight: 700, color: 'var(--fa-ink-2)' }}>Nenhuma venda neste filtro</div>
              <div className="fa-faint" style={{ fontSize: 13, marginTop: 4 }}>Só aparecem vendas pagas — balcão concluído e online com pagamento confirmado.</div>
            </div>
          ) : list.map((s) => {
            const sit = sitOf(s);
            return (
              <div className="pdv-line" key={s.key}>
                <span className="fa-iconbox" style={{ width: 44, height: 44, flex: 'none' }}><Icon name={s.source === 'pdv' ? 'cash' : (s.fulfillment === 'pickup' ? 'store' : 'truck')} size={20} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={{ flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.customerName}</span>
                    <span className={'fa-badge ' + (s.source === 'pdv' ? 'fa-badge-rose' : 'fa-badge-mist')} style={{ fontSize: 10, flex: 'none' }}>
                      <Icon name={s.source === 'pdv' ? 'cash' : 'bag'} size={10} />{s.source === 'pdv' ? 'Balcão' : s.channelLabel}
                    </span>
                  </div>
                  <div className="ph-cell-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.id} · {s.count} {s.count === 1 ? 'item' : 'itens'} · {s.payLabel} · {s.when}
                  </div>
                </div>

                {/* Situação: pago/aguardando + estágio */}
                <div className="sales-sit">
                  {s.paid
                    ? <span className="fa-badge fa-badge-health" style={{ fontSize: 10.5 }}><Icon name="check" size={11} stroke={2.4} />Pago · {s.payLabel}</span>
                    : <span className="fa-badge fa-badge-warn" style={{ fontSize: 10.5 }}><Icon name="clock" size={11} />Aguardando pagamento</span>}
                  <span className={'fa-badge ' + sit.cls} style={{ fontSize: 10 }}><Icon name={sit.icon} size={10} />{sit.label}</span>
                </div>

                <div style={{ width: 96, flex: 'none', textAlign: 'right', fontWeight: 800, fontSize: 15 }}>{brl(s.total)}</div>

                <div style={{ width: 132, flex: 'none', display: 'flex', justifyContent: 'flex-end' }}>
                  {!s.paid ? (
                    <span className="fa-badge fa-badge-mist" style={{ fontSize: 10.5 }}>Indisponível</span>
                  ) : s.nfce ? (
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setModalSale(s)}><Icon name="receipt" size={14} />Ver nota</button>
                  ) : (
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => genNota(s)}><Icon name="clock" size={14} />Em processamento</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="ph-cell-sub" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="shield" size={13} />Apenas vendas com pagamento confirmado entram no registro fiscal · NFC-e {storeFiscal.cnpj}
        </div>
      </div>

      {modalSale && <SaleNotaModal sale={modalSale} storeFiscal={storeFiscal} pharmacistProfile={pharmacistProfile} onSendEmail={sendFiscalDocumentEmail} onClose={() => setModalSale(null)} />}
    </>
  );
}

/* ---------- Modal: visualizar / consultar a nota (NFC-e) de uma venda ---------- */
function SaleNotaModal({ sale, storeFiscal, pharmacistProfile, onSendEmail, onClose }) {
  const F = storeFiscal || {};
  const P = pharmacistProfile || {};
  const [sendOpen, setSendOpen] = useState(false);
  const n = sale.nfce;
  const tributos = Math.round(sale.total * 0.12 * 100) / 100;
  const chaveFmt = (n.chave || '').replace(/(\d{4})(?=\d)/g, '$1 ');
  const channelTag = sale.source === 'pdv'
    ? 'Balcão · venda no momento'
    : 'Online · ' + (sale.channelLabel || '') + (sale.fulfillment === 'pickup' ? ' · retirada' : ' · entrega');
  const dest = sale.customerDoc || (sale.customerName && !/consumidor/i.test(sale.customerName) ? sale.customerName : 'CONSUMIDOR');
  const sendNota = { id: n.id, numero: n.numero, total: sale.total, customer: sale.customerObj };

  return (
    <ModalShell open={true} onClose={onClose} maxw={460}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <span className="fa-iconbox" style={{ width: 56, height: 56, margin: '0 auto 12px', background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="receipt" size={27} /></span>
        <h2 className="fa-h3" style={{ fontSize: 21 }}>Nota fiscal</h2>
        <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 4 }}>NFC-e nº {n.numero} · autorizada</p>
      </div>

      <div style={{ border: '1px solid var(--fa-mist)', borderRadius: 12, padding: 16, background: 'var(--fa-bg)' }}>
        <div style={{ textAlign: 'center', borderBottom: '1px dashed var(--fa-mist)', paddingBottom: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{F.legal}</div>
          <div className="ph-cell-sub">CNPJ {F.cnpj} · IE {F.ie}</div>
          <div className="ph-cell-sub">{F.addr}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
          <span>NFC-e nº {n.numero}</span><span>Série {n.serie || '001'} · {n.when}</span>
        </div>
        <div className="ph-cell-sub" style={{ marginBottom: 8 }}>{channelTag}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
          {sale.items.map((l, i) => (
            <div key={l.id || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.qty}× {l.name}</span>
              {l.price != null && <span className="fa-mono" style={{ flex: 'none', marginLeft: 8 }}>{brl(l.price * l.qty)}</span>}
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px dashed var(--fa-mist)', paddingTop: 10, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}><span>TOTAL</span><span>{brl(sale.total)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }} className="ph-cell-sub"><span>Pagamento</span><span>{sale.payLabel}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }} className="ph-cell-sub"><span>Trib. aprox. (Lei 12.741)</span><span>{brl(tributos)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }} className="ph-cell-sub"><span>Destinatário</span><span>{dest}</span></div>
          {sale.cashback > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fa-primary)', fontWeight: 700 }} className="ph-cell-sub"><span>Cashback creditado</span><span>+ {brl(sale.cashback)}</span></div>}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', borderTop: '1px dashed var(--fa-mist)', marginTop: 10, paddingTop: 12 }}>
          <QrPlaceholder seed={parseInt(n.numero) % 200 + 5} size={84} />
          <div style={{ minWidth: 0 }}>
            <div className="ph-cell-sub" style={{ fontWeight: 700 }}>Consulte pela chave de acesso:</div>
            <div className="fa-mono" style={{ fontSize: 10.5, wordBreak: 'break-all', lineHeight: 1.5, marginTop: 4 }}>{chaveFmt}</div>
          </div>
        </div>
        <div className="ph-cell-sub" style={{ textAlign: 'center', marginTop: 10 }}>Emitida por {P.name} · {P.crf}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} disabled={!n.printableUrl} onClick={() => n.printableUrl && window.open(n.printableUrl, '_blank', 'noopener')}><Icon name="printer" size={16} />Imprimir</button>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={() => setSendOpen(true)}><Icon name="mail" size={16} />Enviar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 1 }} onClick={onClose}><Icon name="check" size={16} />Fechar</button>
      </div>

      {sendOpen && <SendNotaModal nota={sendNota} onSend={onSendEmail} onClose={() => setSendOpen(false)} />}
    </ModalShell>
  );
}

export { PAY_ICONS, PAY_LABELS, SaleNotaModal, SalesScreen, SalesStat, methodLabel, onlinePayLabel };
