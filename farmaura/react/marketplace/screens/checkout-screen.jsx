/*
farmaura/react/marketplace/screens/checkout-screen.jsx

Marketplace checkout screen for Farmaura.

Responsibilities:
- collect delivery, prescription, and payment data for checkout;
- prefill and standardize delivery details from saved customer addresses;
- assist CEP completion with ViaCEP and submit a consistent delivery payload;

Observations:
- checkout reuses normalized saved addresses when available;
- ViaCEP fills public address fields but house number and complement remain user-provided;
*/

import React, { useEffect, useRef, useState } from "react";
import { brl } from "../core/marketplace-components.jsx";
import {
  fetchViaCepAddress,
  formatCep,
  normalizeAddress,
} from "../core/marketplace-address.js";
import { Icon } from "../core/marketplace-icons.jsx";
import { OrderSummary } from "./cart-screen.jsx";


function resolvePrimaryAddress(addresses) {
  /** Return the selected primary address or the first available address. */

  if (!Array.isArray(addresses) || addresses.length === 0) {
    return {};
  }
  return normalizeAddress(addresses.find((address) => address && address.primary) || addresses[0] || {});
}

function Field({ label, children, full }) {
  /** Render one checkout form field wrapper. */

  return <div className="fa-field" style={full ? { gridColumn: '1 / -1' } : {}}><label>{label}</label>{children}</div>;
}

function StoreMap({ store, stores, onPick }) {
  /** Render the pickup store chooser map placeholder. */

  return (
    <div style={{ marginTop: 4, border: '1px solid var(--fa-mist)', borderRadius: 'var(--fa-r-card)', overflow: 'hidden' }}>
      <div style={{ position: 'relative', height: 200, background: '#EAE6E3',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 38px, rgba(43,26,26,.06) 38px 40px), repeating-linear-gradient(90deg, transparent 0 52px, rgba(43,26,26,.06) 52px 54px)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(58deg, transparent 46%, rgba(255,255,255,.7) 46% 52%, transparent 52%)' }} />
        <div style={{ position: 'absolute', left: '12%', top: '14%', width: 70, height: 54, borderRadius: 10, background: 'rgba(46,125,91,.18)', border: '1px solid rgba(46,125,91,.3)' }} />
        {stores.filter((entry) => entry.id !== store.id).map((entry) => (
          <button key={entry.id} onClick={() => onPick(entry.id)} title={entry.name} aria-label={entry.name}
            style={{ position: 'absolute', left: entry.x + '%', top: entry.y + '%', transform: 'translate(-50%,-100%)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: '#fff', border: '2px solid var(--fa-ink-3)' }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: 'var(--fa-ink-3)', transform: 'rotate(45deg)' }} />
            </span>
          </button>
        ))}
        <div style={{ position: 'absolute', left: store.x + '%', top: store.y + '%', transform: 'translate(-50%,-100%)', zIndex: 2 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: 'var(--fa-vital)', boxShadow: '0 6px 14px -4px rgba(0,0,0,.5)' }}>
            <span style={{ transform: 'rotate(45deg)', display: 'grid', placeItems: 'center' }}><Icon name="pin" size={16} style={{ color: '#fff' }} stroke={2.4} /></span>
          </span>
        </div>
        <span className="fa-mono" style={{ position: 'absolute', bottom: 8, right: 10, fontSize: 10, color: 'var(--fa-ink-3)', background: 'rgba(255,255,255,.7)', padding: '2px 6px', borderRadius: 6 }}>mapa · {store.name}</span>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span className="fa-iconbox" style={{ width: 40, height: 40, flex: 'none' }}><Icon name="pin" size={20} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{store.name}</div>
            <div className="fa-muted" style={{ fontSize: 13.5 }}>{store.addr}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap', fontSize: 12.5 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--fa-success)', fontWeight: 600 }}><Icon name="clock" size={14} />{store.hours}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--fa-ink-2)', fontWeight: 600 }}><Icon name="bag" size={14} />Pronto em {store.ready} · {store.dist}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 1 }}><Icon name="pin" size={15} />Ver rotas</button>
          <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 1 }}><Icon name="phone" size={15} />Ligar para loja</button>
        </div>
      </div>
    </div>
  );
}

function DeliveryForm({ data, set, stores = [] }) {
  /** Render the delivery and pickup form section. */

  const [method, setMethod] = [data.method, (value) => set({ ...data, method: value })];
  const [cepStatus, setCepStatus] = useState({ loading: false, error: "", hint: "" });
  const lastLookupCepRef = useRef("");
  const storeId = data.store || (stores[0] && stores[0].id);
  const store = stores.find((entry) => entry.id === storeId) || stores[0];
  const methods = [
    { id: 'express', t: 'Entrega expressa', d: 'Em até 60 minutos', price: 'R$ 9,90', icon: 'bolt' },
    { id: 'standard', t: 'Entrega padrão', d: 'Hoje, até 3h', price: 'Grátis', icon: 'truck' },
    { id: 'pickup', t: 'Retirar na loja', d: 'Pronto em 20 min · escolha a unidade', price: 'Grátis', icon: 'bag' },
  ];

  useEffect(() => {
    /** Trigger ViaCEP lookup once the typed CEP becomes complete. */

    const digits = String(data.cep || "").replace(/\D/g, "");
    if (digits.length !== 8 || method === 'pickup' || digits === lastLookupCepRef.current) {
      if (digits.length !== 8) {
        lastLookupCepRef.current = "";
        setCepStatus((current) => current.loading ? current : { loading: false, error: "", hint: "" });
      }
      return;
    }

    let active = true;

    async function run() {
      /** Resolve ViaCEP data and merge the result into the form state. */

      setCepStatus({ loading: true, error: "", hint: "" });
      try {
        const result = await fetchViaCepAddress(data.cep);
        if (!active) {
          return;
        }
        lastLookupCepRef.current = digits;
        set({
          ...data,
          cep: result.cep,
          street: result.street || data.street,
          district: result.district || data.district,
          city: result.city || data.city,
          state: result.state || data.state,
        });
        setCepStatus({ loading: false, error: "", hint: "Rua, bairro, cidade e UF preenchidos automaticamente." });
      } catch (error) {
        if (!active) {
          return;
        }
        setCepStatus({ loading: false, error: error && error.message ? error.message : "Nao foi possivel buscar o CEP.", hint: "" });
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [data, method, set]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {method !== 'pickup' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Nome completo" full><input className="fa-input" value={data.recipientName || ''} onChange={(event) => set({ ...data, recipientName: event.target.value })} /></Field>
          <Field label="CEP">
            <input className="fa-input" value={data.cep || ''} onChange={(event) => set({ ...data, cep: formatCep(event.target.value) })} inputMode="numeric" placeholder="00000-000" />
            {cepStatus.loading ? <div className="fa-faint" style={{ fontSize: 12, marginTop: 6 }}>Buscando endereço...</div> : null}
            {!cepStatus.loading && cepStatus.hint ? <div style={{ fontSize: 12, marginTop: 6, color: 'var(--fa-success)' }}>{cepStatus.hint}</div> : null}
            {!cepStatus.loading && cepStatus.error ? <div style={{ fontSize: 12, marginTop: 6, color: 'var(--fa-error)' }}>{cepStatus.error}</div> : null}
          </Field>
          <Field label="Telefone"><input className="fa-input" value={data.phone || ''} onChange={(event) => set({ ...data, phone: event.target.value })} /></Field>
          <Field label="Rua" full><input className="fa-input" value={data.street || ''} onChange={(event) => set({ ...data, street: event.target.value })} /></Field>
          <Field label="Número"><input className="fa-input" value={data.number || ''} onChange={(event) => set({ ...data, number: event.target.value })} /></Field>
          <Field label="Complemento"><input className="fa-input" placeholder="Apto, bloco…" value={data.complement || ''} onChange={(event) => set({ ...data, complement: event.target.value })} /></Field>
          <Field label="Bairro"><input className="fa-input" value={data.district || ''} onChange={(event) => set({ ...data, district: event.target.value })} /></Field>
          <Field label="Cidade"><input className="fa-input" value={data.city || ''} onChange={(event) => set({ ...data, city: event.target.value })} /></Field>
          <Field label="UF"><input className="fa-input" value={data.state || ''} onChange={(event) => set({ ...data, state: event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) })} /></Field>
          <Field label="Referência" full><input className="fa-input" value={data.reference || ''} onChange={(event) => set({ ...data, reference: event.target.value })} placeholder="Ponto de referência para a entrega" /></Field>
        </div>
      )}
      <div>
        <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 10 }}>Como você quer receber?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {methods.map((entry) => (
            <button key={entry.id} type="button" onClick={() => setMethod(entry.id)} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 'var(--fa-r-input)', border: method === entry.id ? '1.5px solid var(--fa-primary)' : '1px solid var(--fa-mist)', background: method === entry.id ? 'var(--fa-rose-soft)' : 'var(--fa-surface)', transition: 'all .15s' }}>
              <span className="fa-iconbox" style={{ background: '#fff', width: 44, height: 44, color: 'var(--fa-primary)' }}><Icon name={entry.icon} size={22} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{entry.t}</div>
                <div className="fa-muted" style={{ fontSize: 13 }}>{entry.d}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 14, color: entry.price === 'Grátis' ? 'var(--fa-success)' : 'var(--fa-ink)' }}>{entry.price}</div>
              <span style={{ width: 22, height: 22, borderRadius: 99, border: method === entry.id ? '6px solid var(--fa-primary)' : '2px solid var(--fa-mist)', flex: 'none', transition: 'all .15s' }} />
            </button>
          ))}
        </div>
      </div>

      {method === 'pickup' && store && (
        <div>
          <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 10 }}>Escolha a unidade</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {stores.map((entry) => (
              <button key={entry.id} type="button" onClick={() => set({ ...data, store: entry.id })} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 'var(--fa-r-input)', border: entry.id === storeId ? '1.5px solid var(--fa-primary)' : '1px solid var(--fa-mist)', background: entry.id === storeId ? 'var(--fa-rose-soft)' : 'var(--fa-surface)' }}>
                <span style={{ width: 20, height: 20, borderRadius: 99, border: entry.id === storeId ? '6px solid var(--fa-primary)' : '2px solid var(--fa-mist)', flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{entry.name}</div>
                  <div className="fa-faint" style={{ fontSize: 12 }}>{entry.addr}</div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--fa-primary)' }}>{entry.dist}</div>
                  <div className="fa-faint" style={{ fontSize: 11.5 }}>pronto em {entry.ready}</div>
                </div>
              </button>
            ))}
          </div>
          <StoreMap store={store} stores={stores} onPick={(id) => set({ ...data, store: id })} />
        </div>
      )}
    </div>
  );
}

function PrescriptionCard({ data, set }) {
  /** Render the prescription upload prompt. */

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, padding: 14, background: 'var(--fa-info-soft)', borderRadius: 'var(--fa-r-card)', marginBottom: 14 }}>
        <Icon name="rx" size={20} style={{ color: 'var(--fa-info)', flex: 'none', marginTop: 1 }} />
        <div style={{ fontSize: 13, color: 'var(--fa-info)' }}>Há itens com retenção de receita no pedido. Envie a receita digital — nosso farmacêutico valida antes do envio.</div>
      </div>
      <button onClick={() => set({ ...data, sent: !data.sent })} style={{ width: '100%', cursor: 'pointer', border: data.sent ? '1.5px solid var(--fa-success)' : '1.5px dashed var(--fa-mist)', background: data.sent ? 'var(--fa-success-soft)' : 'var(--fa-surface)', borderRadius: 'var(--fa-r-card)', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'all .15s' }}>
        <span className="fa-iconbox" style={{ background: data.sent ? 'var(--fa-success)' : 'var(--fa-rose-soft)', color: data.sent ? '#fff' : 'var(--fa-primary)', width: 52, height: 52 }}><Icon name={data.sent ? 'check' : 'rx'} size={26} stroke={data.sent ? 2.4 : 1.8} /></span>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{data.sent ? 'Receita enviada para validação' : 'Enviar receita digital'}</div>
        <div className="fa-muted" style={{ fontSize: 13 }}>{data.sent ? 'receita-mariana.pdf · trocar arquivo' : 'Arraste um arquivo ou clique para enviar (PDF, JPG)'}</div>
      </button>
    </div>
  );
}

function PaymentForm({ data, set }) {
  /** Render the payment method chooser. */

  const methods = [
    { id: 'pix', t: 'Pix', d: '5% de desconto · aprovação imediata', icon: 'pix' },
    { id: 'card', t: 'Cartão de crédito', d: 'Até 3x sem juros', icon: 'card' },
    { id: 'boleto', t: 'Boleto bancário', d: 'Vence em 1 dia útil', icon: 'tag' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {methods.map((method) => (
        <div key={method.id}>
          <button onClick={() => set({ ...data, method: method.id })} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 'var(--fa-r-input)', border: data.method === method.id ? '1.5px solid var(--fa-primary)' : '1px solid var(--fa-mist)', background: data.method === method.id ? 'var(--fa-rose-soft)' : 'var(--fa-surface)', transition: 'all .15s' }}>
            <span className="fa-iconbox" style={{ background: '#fff', width: 44, height: 44, color: 'var(--fa-primary)' }}><Icon name={method.icon} size={22} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{method.t}</div>
              <div className="fa-muted" style={{ fontSize: 13 }}>{method.d}</div>
            </div>
            <span style={{ width: 22, height: 22, borderRadius: 99, border: data.method === method.id ? '6px solid var(--fa-primary)' : '2px solid var(--fa-mist)', flex: 'none' }} />
          </button>
          {data.method === 'card' && method.id === 'card' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 4px 4px' }}>
              <Field label="Número do cartão" full><input className="fa-input" placeholder="0000 0000 0000 0000" /></Field>
              <Field label="Nome impresso" full><input className="fa-input" placeholder="Como no cartão" /></Field>
              <Field label="Validade"><input className="fa-input" placeholder="MM/AA" /></Field>
              <Field label="CVV"><input className="fa-input" placeholder="123" /></Field>
            </div>
          )}
          {data.method === 'pix' && method.id === 'pix' && (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 16, margin: '4px 0', background: 'var(--fa-success-soft)', borderRadius: 'var(--fa-r-card)' }}>
              <span className="fa-iconbox" style={{ background: '#fff', color: 'var(--fa-success)' }}><Icon name="pix" size={24} /></span>
              <div style={{ fontSize: 13.5, color: 'var(--fa-success)' }}><b>Você economiza 5% no Pix.</b> O QR Code aparece na confirmação do pedido.</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StepHead({ n, title, sub }) {
  /** Render the current checkout step heading. */

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 28, height: 28, borderRadius: 99, background: 'var(--fa-primary)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, flex: 'none' }}>{n}</span>
        <h2 className="fa-h3" style={{ fontSize: 19 }}>{title}</h2>
      </div>
      {sub && <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginLeft: 38 }}>{sub}</p>}
    </div>
  );
}

function CheckoutScreen({ ctx }) {
  /** Render the checkout flow using the configured variant. */

  const { items, products, coupon, onNav, placeOrder, checkoutVariant, stores = [], profile, addresses = [], placingOrder } = ctx;
  const hasRx = items.some((item) => products.find((product) => product.id === item.id)?.rx);
  const primaryAddress = resolvePrimaryAddress(addresses);
  const [delivery, setDelivery] = useState({
    method: 'express',
    recipientName: profile && profile.name || '',
    cep: primaryAddress.cep || '',
    phone: profile && profile.phone || '',
    street: primaryAddress.street || '',
    number: primaryAddress.number || '',
    complement: primaryAddress.complement || '',
    district: primaryAddress.district || '',
    city: primaryAddress.city || '',
    state: primaryAddress.state || 'SP',
    reference: '',
    store: stores[0] ? stores[0].id : '',
  });
  const [rx, setRx] = useState({ sent: false });
  const [payment, setPayment] = useState({ method: 'pix' });
  const [step, setStep] = useState(0);

  const steps = [
    { id: 'delivery', label: 'Entrega' },
    ...(hasRx ? [{ id: 'rx', label: 'Receita' }] : []),
    { id: 'payment', label: 'Pagamento' },
    { id: 'review', label: 'Revisão' },
  ];

  const summaryItems = items.map((item) => {
    const product = products.find((entry) => entry.id === item.id);
    return {
      item,
      product,
      lineTotal: product ? (item.sub ? product.price * 0.85 : product.price) * item.qty : 0,
    };
  });

  const summaryCard = (
    <div className="fa-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 180 }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>Resumo do pedido</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto' }} className="fa-noscroll">
        {summaryItems.map(({ item, product, lineTotal }) => (
          <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="fa-ph" data-cat={product ? product.cat : 'medicamentos'} style={{ width: 44, height: 44, aspectRatio: 'auto', flex: 'none' }}>
              <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--fa-primary)', color: '#fff', borderRadius: 99, fontSize: 11, fontWeight: 800, width: 18, height: 18, display: 'grid', placeItems: 'center' }}>{item.qty}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {product ? product.name : 'Item indisponível'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{brl(lineTotal)}</div>
          </div>
        ))}
      </div>
      <hr className="fa-divider" />
      <OrderSummary items={items} products={products} coupon={coupon} />
    </div>
  );

  const hasValidCpf = !!(profile && (profile.cpf || '').replace(/\D/g, '').length === 11);
  const placeBtn = hasValidCpf ? (
    <button className="fa-btn fa-btn-vital fa-btn-lg fa-btn-block" disabled={placingOrder} onClick={() => placeOrder({ delivery, payment, rx })}>
      <Icon name="shield" size={18} />{placingOrder ? 'Processando pedido...' : 'Confirmar e pagar'}
    </button>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 'var(--fa-r-input)', background: 'var(--fa-warn-soft, #FFF6E5)', color: 'var(--fa-warn, #9A6700)', fontSize: 13 }}>
        <Icon name="info" size={18} style={{ flex: 'none', marginTop: 1 }} />
        <span>Complete seu CPF em Minha Conta para emitirmos a nota fiscal da compra.</span>
      </div>
      <button className="fa-btn fa-btn-vital fa-btn-lg fa-btn-block" onClick={() => onNav({ name: 'account', tab: 'profile' })}>
        <Icon name="user" size={18} />Completar CPF
      </button>
    </div>
  );

  if (checkoutVariant === 'A') {
    const currentStep = steps[step];
    return (
      <div className="fa-wrap fa-fadein" style={{ paddingTop: 24, paddingBottom: 30 }}>
        <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginBottom: 18 }} onClick={() => onNav({ name: 'cart' })}><Icon name="chevL" size={16} />Voltar ao carrinho</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
          {steps.map((entry, index) => (
            <React.Fragment key={entry.id}>
              <button onClick={() => index <= step && setStep(index)} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', cursor: index <= step ? 'pointer' : 'default' }}>
                <span style={{ width: 30, height: 30, borderRadius: 99, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, background: index < step ? 'var(--fa-success)' : index === step ? 'var(--fa-primary)' : 'var(--fa-mist)', color: index <= step ? '#fff' : 'var(--fa-ink-3)' }}>{index < step ? <Icon name="check" size={16} stroke={2.6} /> : index + 1}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: index === step ? 'var(--fa-primary)' : 'var(--fa-ink-2)' }}>{entry.label}</span>
              </button>
              {index < steps.length - 1 && <span style={{ flex: 1, minWidth: 20, height: 2, background: index < step ? 'var(--fa-success)' : 'var(--fa-mist)' }} />}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--fa-gap)', alignItems: 'start' }} className="fa-ck-grid">
          <div className="fa-card" style={{ padding: 24 }}>
            {currentStep.id === 'delivery' && <><StepHead n="1" title="Entrega" sub="Para onde levamos seu cuidado?" /><DeliveryForm data={delivery} set={setDelivery} stores={stores} /></>}
            {currentStep.id === 'rx' && <><StepHead n="2" title="Receita digital" sub="Validação rápida pelo farmacêutico." /><PrescriptionCard data={rx} set={setRx} /></>}
            {currentStep.id === 'payment' && <><StepHead n={hasRx ? '3' : '2'} title="Pagamento" sub="Escolha como prefere pagar." /><PaymentForm data={payment} set={setPayment} /></>}
            {currentStep.id === 'review' && (
              <>
                <StepHead n={steps.length} title="Revise seu pedido" sub="Tudo certo? É só confirmar." />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[['Entrega', delivery.method === 'express' ? 'Expressa · 60 min' : delivery.method === 'pickup' ? ('Retirada · ' + ((stores.find((entry) => entry.id === (delivery.store || (stores[0] && stores[0].id))) || {}).name || 'loja')) : 'Padrão · hoje', 'truck'], ['Pagamento', payment.method === 'pix' ? 'Pix (-5%)' : payment.method === 'card' ? 'Cartão · até 3x' : 'Boleto', 'card'], ...(hasRx ? [['Receita', rx.sent ? 'Enviada ✓' : 'Pendente', 'rx']] : [])].map(([label, value, icon]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, border: '1px solid var(--fa-mist)', borderRadius: 'var(--fa-r-input)' }}>
                      <Icon name={icon} size={20} style={{ color: 'var(--fa-primary)' }} />
                      <div style={{ flex: 1 }}><div className="fa-faint" style={{ fontSize: 12 }}>{label}</div><div style={{ fontWeight: 700, fontSize: 14 }}>{value}</div></div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
              {step > 0 && <button className="fa-btn fa-btn-soft fa-btn-lg" onClick={() => setStep(step - 1)}>Voltar</button>}
              {step < steps.length - 1
                ? <button className="fa-btn fa-btn-primary fa-btn-lg" style={{ flex: 1 }} onClick={() => setStep(step + 1)}>Continuar<Icon name="arrowR" size={18} /></button>
                : <div style={{ flex: 1 }}>{placeBtn}</div>}
            </div>
          </div>
          {summaryCard}
        </div>
      </div>
    );
  }

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 24, paddingBottom: 30 }}>
      <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginBottom: 18 }} onClick={() => onNav({ name: 'cart' })}><Icon name="chevL" size={16} />Voltar ao carrinho</button>
      <h1 className="fa-h1" style={{ fontSize: 'clamp(26px,3vw,36px)', marginBottom: 24 }}>Finalizar compra</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--fa-gap)', alignItems: 'start' }} className="fa-ck-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="fa-card" style={{ padding: 24 }}><StepHead n="1" title="Entrega" /><DeliveryForm data={delivery} set={setDelivery} stores={stores} /></div>
          {hasRx && <div className="fa-card" style={{ padding: 24 }}><StepHead n="2" title="Receita digital" /><PrescriptionCard data={rx} set={setRx} /></div>}
          <div className="fa-card" style={{ padding: 24 }}><StepHead n={hasRx ? '3' : '2'} title="Pagamento" /><PaymentForm data={payment} set={setPayment} /></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 180 }}>
          {summaryCard}
          {placeBtn}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: 'var(--fa-ink-3)' }}><Icon name="shield" size={15} />Ambiente seguro e criptografado</div>
        </div>
      </div>
    </div>
  );
}

function ConfirmScreen({ ctx }) {
  /** Render the final purchase confirmation state. */

  const { onNav, lastOrder } = ctx;
  const etaLabel = lastOrder && lastOrder.eta ? lastOrder.eta : '—';
  const orderCode = lastOrder && (lastOrder.id || lastOrder.code) ? lastOrder.id || lastOrder.code : '—';
  const totalAmount = lastOrder ? Number(lastOrder.total || lastOrder.total_amount || 0) : 0;
  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 50, paddingBottom: 80, maxWidth: 600, textAlign: 'center' }}>
      <span className="fa-iconbox" style={{ margin: '0 auto 20px', width: 84, height: 84, background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="check" size={42} stroke={2.4} /></span>
      <h1 className="fa-h1" style={{ fontSize: 'clamp(26px,3vw,36px)' }}>Pedido confirmado!</h1>
      <p className="fa-lead" style={{ marginTop: 10 }}>Seu pedido foi enviado para a operacao da Farmaura com pagamento registrado e aprovado. Agora ele segue para separacao, retirada ou entrega conforme o fluxo escolhido.</p>
      <div className="fa-card" style={{ padding: 22, marginTop: 28, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="fa-muted">Pedido</span><b className="fa-mono">#{orderCode}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="fa-muted">Total</span><b>{lastOrder ? brl(totalAmount) : '—'}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="fa-muted">Fluxo</span><b>{lastOrder && lastOrder.fulfillment === 'pickup' ? 'Pronto para retirada' : 'Entrega em preparacao'}</b></div>
        {lastOrder && lastOrder.fulfillment === 'pickup' && lastOrder.pickupCode ? (
          <div style={{ background: 'var(--fa-info-soft)', borderRadius: 'var(--fa-r-card)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fa-info)', fontWeight: 800, fontSize: 13.5 }}><Icon name="bag" size={16} />Codigo de retirada</div>
            <div className="fa-mono" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '.08em', color: 'var(--fa-ink)' }}>{lastOrder.pickupCode}</div>
            <div className="fa-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>Mostre ou informe este código ao farmacêutico no momento da retirada para validação no sistema.</div>
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="fa-muted">Previsao</span><b style={{ color: 'var(--fa-success)' }}>{etaLabel}</b></div>
        <hr className="fa-divider" />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="fa-iconbox" style={{ background: 'var(--fa-rose-soft)' }}><Icon name="chat" size={22} /></span>
          <div style={{ fontSize: 13.5 }} className="fa-muted">A equipe interna ja recebeu o pedido. Qualquer duvida, o farmacêutico consegue acompanhar a separacao pelo sistema.</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
        <button className="fa-btn fa-btn-primary fa-btn-lg" onClick={() => onNav({ name: 'orders', tab: 'orders' })}>Ver meus pedidos</button>
        <button className="fa-btn fa-btn-ghost fa-btn-lg" onClick={() => onNav({ name: 'offers' })}>Continuar comprando</button>
      </div>
    </div>
  );
}

export { CheckoutScreen, ConfirmScreen, DeliveryForm, Field, PaymentForm, PrescriptionCard, StepHead, StoreMap };
