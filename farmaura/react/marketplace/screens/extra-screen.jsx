import React, { useState } from "react";
import { brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";
import { MARKETPLACE_LOGO_MARK_URL } from "../core/marketplace-assets.js";
import { AccountNavShell } from "./account-shared.jsx";
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

// Ported from the demo's data-cat="cashback" panel (.cb-balance/.cb-extract). The demo's
// ".cb-expiry" block (cashback expiring in N days) was dropped on purpose — there is no real
// expiration mechanic behind it yet (CashbackTransaction.expires_at_label exists in the schema
// but nothing computes or enforces it, see the RLS/cashback ADR) — showing a countdown here
// would be fabricating a feature. Same for "30 dias" in/out flow totals from the demo's hero:
// ledger entries only carry a display label ("agora"), not a real timestamp to sum a real window
// from, so the hero only shows the two real running totals (available, pending).
function CashbackScreen({ ctx }) {
  const { user, onNav, orders, cashbackWallet } = ctx;
  if (!user) {
    return <LoginGate icon="gift" title="Entre para ver seu cashback" sub="Acompanhe quanto você acumulou em cada compra e use o saldo em pedidos futuros." cta="Entrar na conta" onNav={onNav} />;
  }

  const wallet = cashbackWallet || { availableBalance: 0, pendingBalance: 0, lifetimeEarnedTotal: 0, redeemedTotal: 0, entries: [] };
  const [filter, setFilter] = useState('all');
  // "in" = wallet grew (earn); "out" = wallet shrank (redeem, or a reversal that took back an
  // earlier earn/redeem). "release" entries are omitted from the extract — they move value from
  // pending to available without changing the total, so they'd read as a phantom third movement.
  const extractEntries = wallet.entries.filter((entry) => entry.type !== 'release');
  const visibleEntries = filter === 'all' ? extractEntries : extractEntries.filter((entry) => (
    filter === 'in' ? entry.type === 'earn' : entry.type === 'redeem' || entry.type === 'reversal'
  ));

  return (
    <AccountNavShell ctx={ctx} activeKey="cashback" crumbLabel="Cashback">
      <div className="orders-head" style={{ marginBottom: 20 }}>
        <h1 className="cart-title" style={{ margin: 0 }}>Cashback</h1>
        <span className="orders-count">Sua carteira de cashback Farmaura</span>
      </div>
      <div className="cb-layout">
        <div className="cb-balance">
          <span className="cb-balance-coin" aria-hidden="true" />
          <img className="cb-balance-coin-mark" src={MARKETPLACE_LOGO_MARK_URL} alt="" aria-hidden="true" />
          <div className="cb-balance-info">
            <span className="cb-balance-label">Saldo disponível</span>
            <span className="cb-balance-value">{brl(wallet.availableBalance)}</span>
            <span className="cb-balance-sub">
              {wallet.pendingBalance > 0
                ? `+ ${brl(wallet.pendingBalance)} a liberar quando seus pedidos forem entregues/retirados`
                : 'Vale desconto à vista no seu próximo pedido, sem valor mínimo.'}
            </span>
          </div>
          <div className="cb-balance-cta">
            <button className="cb-balance-btn" type="button" onClick={() => onNav({ name: 'cart' })}><Icon name="cart" size={16} />Usar no carrinho</button>
            <span className="cb-balance-fineprint">Aplicado no pagamento, sem valor mínimo.</span>
          </div>
        </div>

        <div className="cb-extract">
          <div className="cb-extract-head">
            <span className="cb-extract-title">Extrato</span>
            <span className="cb-extract-count">{extractEntries.length} {extractEntries.length === 1 ? 'movimentação' : 'movimentações'}</span>
          </div>
          <div className="cb-filters">
            <button className={'cb-filter' + (filter === 'all' ? ' is-on' : '')} type="button" onClick={() => setFilter('all')}>Tudo</button>
            <button className={'cb-filter' + (filter === 'in' ? ' is-on' : '')} type="button" onClick={() => setFilter('in')}>Entradas</button>
            <button className={'cb-filter' + (filter === 'out' ? ' is-on' : '')} type="button" onClick={() => setFilter('out')}>Saídas</button>
          </div>
          {visibleEntries.length === 0 ? (
            <div className="cb-empty">Nenhuma movimentação ainda — o cashback aparece aqui assim que seu primeiro pedido for pago.</div>
          ) : (
            <div>
              {visibleEntries.map((entry) => {
                const matchedOrder = orders.find((order) => order.recordId === entry.orderId);
                const isIn = entry.type === 'earn';
                const title = entry.type === 'earn'
                  ? 'Cashback do pedido' + (entry.status === 'pending' ? ' (a liberar)' : '')
                  : entry.type === 'redeem' ? 'Usado no pagamento' : 'Estorno';
                return (
                  <div className="cb-entry" key={entry.id}>
                    <span className={'cb-entry-icon ' + (isIn ? 'in' : 'out')}><Icon name={isIn ? 'gift' : entry.type === 'redeem' ? 'cart' : 'repeat'} size={17} /></span>
                    <div className="cb-entry-body">
                      <span className="cb-entry-title">{title}</span>
                      <span className="cb-entry-sub">{matchedOrder ? `Pedido #${matchedOrder.id} · ${matchedOrder.date}` : entry.notes}</span>
                    </div>
                    <span className="cb-entry-amt">
                      <span className={'v ' + (isIn ? 'pos' : 'neg')}>{isIn ? '+' : '−'} {brl(entry.amount)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="cb-howto">
          <div className="cb-howto-title">Como funciona o cashback</div>
          <div className="cb-howto-list">
            {[
              ['gift', 'Ganhe em cada compra', 'Uma % do valor de cada produto (definida pela farmácia) volta para sua carteira.'],
              ['clock', 'Liberado após a entrega', 'O cashback fica pendente até seu pedido ser entregue ou retirado.'],
              ['cart', 'Use no pagamento', 'Abata parte do próximo pedido — até um teto definido pela farmácia sobre o total.'],
            ].map(([iconName, title, desc]) => (
              <div className="cb-howto-item" key={title}><Icon name={iconName} size={16} /><span><b>{title}</b> — {desc}</span></div>
            ))}
          </div>
        </div>
      </div>
    </AccountNavShell>
  );
}

function SavedScreen({ ctx }) {
  const { user, onNav } = ctx;
  if (!user) {
    return <LoginGate icon="heart" title="Entre para ver seus produtos salvos" sub="Faça login para acessar os produtos que você favoritou e mantê-los salvos em qualquer dispositivo." cta="Entrar para ver salvos" onNav={onNav} />;
  }
  return <ShopScreen ctx={ctx} mode="saved" />;
}

export { CashbackScreen, LoginGate, SavedScreen };
