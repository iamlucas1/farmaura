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
import { CHECKOUT_PHASES, CheckoutPhaseBar, Modal, PrescriptionKindModal, ProductVisual, RemoveItemModal, Toggle, brl } from "../core/marketplace-components.jsx";
import { FullBleedBand } from "../core/marketplace-bands.jsx";
import {
  buildAddressLine,
  buildAddressSecondaryLine,
  createEmptyAddress,
  fetchViaCepAddress,
  formatCep,
  normalizeAddress,
} from "../core/marketplace-address.js";
import { Icon } from "../core/marketplace-icons.jsx";
import { AddressForm } from "./account-profile-screen.jsx";
import { OrderSummary, computeMarketplaceOrderTotal } from "./cart-screen.jsx";
import { loadLeaflet } from "../../shared/leaflet.js";

const MAP_TILE_LAYER_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAP_TILE_LAYER_ATTRIBUTION = "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors";


function resolvePrimaryAddress(addresses) {
  /** Return the selected primary address or the first available address. */

  if (!Array.isArray(addresses) || addresses.length === 0) {
    return {};
  }
  return normalizeAddress(addresses.find((address) => address && address.primary) || addresses[0] || {});
}

function isAddressComplete(address) {
  /** Return whether a saved address has everything a real delivery needs — an address saved
   * before this validation existed (or one edited into a broken state some other way) shouldn't
   * silently reach a courier with a missing house number or CEP.
   *
   * Deliberately doesn't check recipientName/recipientPhone here: those already have a real
   * fallback (the customer's own profile name/phone — see the delivery-sync effect), so an
   * address saved before that field existed is still a perfectly deliverable address, not a
   * broken one.
   *
   * Deliberately doesn't check `number` as its own field either — the backend has no separate
   * house-number column (`fromBackendAddress` in marketplace-app.jsx), it's folded into `street`
   * at save time ("Avenida X, 500") and always comes back empty on `number` after a reload. The
   * AddressForm itself still requires it while the customer is actively typing (that's real,
   * unmerged input at that point) — this check just can't ask for it again post-save without
   * flagging every already-saved address in the system as broken. */

  return !!(
    address
    && address.cep && address.cep.replace(/\D/g, '').length === 8
    && address.street && address.street.trim()
    && address.district && address.district.trim()
    && address.city && address.city.trim()
    && address.state && address.state.trim().length === 2
  );
}

const FORM_CONTROL_TAGS = new Set(['input', 'select', 'textarea']);

function Field({ label, children, full }) {
  /** Render one checkout form field wrapper, with the label programmatically associated to its
   * form control (screen readers otherwise can't tell which label belongs to which field). Some
   * fields render extra siblings after the control (inline hints/errors) — only the first real
   * input/select/textarea gets the id, everything else passes through untouched. */

  const generatedId = React.useId();
  let idAssigned = false;
  const withIds = React.Children.map(children, (child) => {
    if (!idAssigned && React.isValidElement(child) && FORM_CONTROL_TAGS.has(child.type)) {
      idAssigned = true;
      return React.cloneElement(child, { id: child.props.id || generatedId });
    }
    return child;
  });
  return (
    <div className="fa-field" style={full ? { gridColumn: '1 / -1' } : {}}>
      <label htmlFor={idAssigned ? generatedId : undefined}>{label}</label>
      {withIds}
    </div>
  );
}

function getStoreCoordinates(store) {
  /** Return one valid latitude/longitude pair for a store, or null when unresolved. */

  if (!store || store.lat == null || store.lng == null) {
    return null;
  }
  const lat = Number(store.lat);
  const lng = Number(store.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return null;
  }
  return { lat, lng };
}

function StoreMap({ store, stores, onPick }) {
  /** Render a real map pinpointing exactly where the store is located. */

  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapError, setMapError] = useState('');
  const coordinates = getStoreCoordinates(store);

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      if (!elementRef.current || !coordinates) {
        return;
      }
      try {
        const leaflet = await loadLeaflet();
        if (cancelled || !elementRef.current) {
          return;
        }
        setMapError('');
        const map = mapRef.current || leaflet.map(elementRef.current, {
          center: [coordinates.lat, coordinates.lng],
          zoom: 15,
          zoomControl: true,
          scrollWheelZoom: false,
        });
        mapRef.current = map;
        map.setView([coordinates.lat, coordinates.lng], 15);
        leaflet.tileLayer(MAP_TILE_LAYER_URL, { attribution: MAP_TILE_LAYER_ATTRIBUTION, maxZoom: 19 }).addTo(map);
        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];
        const icon = leaflet.divIcon({
          className: 'fa-map-pin-icon',
          html: '<span style="display:grid;place-items:center;width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--fa-vital);box-shadow:0 6px 14px -4px rgba(43,26,26,.5)"><span style="transform:rotate(45deg);color:#fff;font-weight:800;font-size:14px">•</span></span>',
          iconSize: [34, 34],
          iconAnchor: [17, 34],
        });
        const marker = leaflet.marker([coordinates.lat, coordinates.lng], { icon, title: store.name }).addTo(map);
        markersRef.current.push(marker);
      } catch (error) {
        if (!cancelled) {
          setMapError(error && error.message ? error.message : 'Nao foi possivel carregar o mapa.');
        }
      }
    }

    void renderMap();
    return () => { cancelled = true; };
  }, [coordinates && coordinates.lat, coordinates && coordinates.lng, store && store.name]);

  const directionsUrl = coordinates ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lng}` : '';

  return (
    <div style={{ marginTop: 4, border: '1px solid var(--fa-mist)', borderRadius: 'var(--fa-r-card)', overflow: 'hidden' }}>
      {coordinates ? (
        <div ref={elementRef} style={{ height: 200, background: '#EAE6E3' }} />
      ) : (
        <div style={{ height: 200, background: '#EAE6E3', display: 'grid', placeItems: 'center' }}>
          <span className="fa-muted" style={{ fontSize: 12.5 }}>{mapError || 'Localização da loja indisponível no momento.'}</span>
        </div>
      )}
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
          {coordinates ? (
            <a href={directionsUrl} target="_blank" rel="noreferrer" className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 1, textDecoration: 'none' }}>
              <Icon name="pin" size={15} />Ver rotas
            </a>
          ) : (
            <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 1 }} disabled><Icon name="pin" size={15} />Ver rotas</button>
          )}
          <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 1 }}><Icon name="phone" size={15} />Ligar para loja</button>
        </div>
        {stores.filter((entry) => entry.id !== store.id).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stores.filter((entry) => entry.id !== store.id).map((entry) => (
              <button key={entry.id} type="button" className="fa-btn fa-btn-ghost fa-btn-sm" onClick={() => onPick(entry.id)}>
                <Icon name="pin" size={13} />{entry.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PickupStorePicker({ data, set, stores = [] }) {
  /** Render the pickup unit picker plus its map — shared between the legacy full delivery
   * form (checkoutVariant 'B', unreachable) and the variant-A left card, which only needs the
   * pickup section now that the address/method choices live in the order-summary sidebar. */

  const storeId = data.store || (stores[0] && stores[0].id);
  const store = stores.find((entry) => entry.id === storeId) || stores[0];
  if (!store) {
    return null;
  }
  return (
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
  );
}

function PhysicalPrescriptionModal({ open, onClose, delivery, setDelivery, stores = [] }) {
  /** Explain the pickup-only constraint right when física is picked, with the store picker
   * folded in so choosing a unit doesn't need a separate trip back to the delivery step. */

  return (
    <Modal open={open} onClose={onClose} icon="bag" title="Esse pedido só pode ser retirado na farmácia" sub="Por lei, o farmacêutico precisa reter em mãos o papel original da receita física — por isso não é possível receber esse pedido em casa." maxw={520}>
      <div style={{ marginTop: 16 }}>
        <PickupStorePicker data={delivery} set={setDelivery} stores={stores} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 16, padding: 12, borderRadius: 'var(--fa-r-input)', background: 'var(--fa-warn-soft)', fontSize: 12.5, color: 'var(--fa-warn-ink)' }}>
        <Icon name="rx" size={14} style={{ flex: 'none', marginTop: 1 }} />
        <span>Leve a receita física original com você na retirada — sem ela, a farmácia não pode liberar o pedido.</span>
      </div>
      <button type="button" className="fa-btn fa-btn-primary fa-btn-block" style={{ marginTop: 16 }} disabled={!delivery.store} onClick={onClose}>
        <Icon name="check" size={16} />Confirmar unidade de retirada
      </button>
    </Modal>
  );
}

function DeliveryForm({ data, set, stores = [], checkCoverage }) {
  /** Render the delivery and pickup form section. */

  const [method, setMethod] = [data.method, (value) => set({ ...data, method: value })];
  const [cepStatus, setCepStatus] = useState({ loading: false, error: "", hint: "" });
  const [coverage, setCoverage] = useState({ configured: false, covered: true });
  const lastLookupCepRef = useRef("");
  const lastCoverageCepRef = useRef("");
  const requiresShipping = coverage.requires_shipping === true;
  const blockedForDelivery = (coverage.configured && !coverage.covered) || requiresShipping;
  const methods = [
    { id: 'express', t: 'Entrega expressa', d: blockedForDelivery ? 'Fora da área de entrega por motoboy' : 'Em até 60 minutos', price: 'R$ 9,90', icon: 'bolt', disabled: blockedForDelivery },
    { id: 'standard', t: 'Entrega padrão', d: blockedForDelivery ? 'Fora da área de entrega por motoboy' : 'Hoje, até 3h', price: 'Grátis', icon: 'truck', disabled: blockedForDelivery },
    { id: 'pickup', t: 'Retirar na loja', d: 'Pronto em 20 min · escolha a unidade', price: 'Grátis', icon: 'bag', disabled: false },
    { id: 'shipping', t: 'Envio por transportadora', d: requiresShipping ? `Fora do raio de entrega${coverage.nearestStoreName ? ' · sai de ' + coverage.nearestStoreName : ''}` : 'Rastreio pela transportadora', price: 'Calculado no endereço', icon: 'nav', disabled: false },
  ];

  useEffect(() => {
    /** Trigger ViaCEP lookup once the typed CEP becomes complete. */

    const digits = String(data.cep || "").replace(/\D/g, "");
    if (digits.length !== 8 || method === 'pickup' || digits === lastLookupCepRef.current) {
      if (digits.length !== 8) {
        lastLookupCepRef.current = "";
        setCepStatus((current) => current.loading ? current : { loading: false, error: "", hint: "" });
        setCoverage({ configured: false, covered: true });
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

  useEffect(() => {
    /** Check delivery coverage once the district/city/state are known, independent of the CEP-lookup effect above. */

    const digits = String(data.cep || "").replace(/\D/g, "");
    if (typeof checkCoverage !== 'function' || method === 'pickup' || !data.district || digits.length !== 8) {
      return;
    }
    if (digits === lastCoverageCepRef.current) {
      return;
    }
    lastCoverageCepRef.current = digits;

    let active = true;

    async function run() {
      const coverageResult = await checkCoverage({ district: data.district, city: data.city, state: data.state, cep: data.cep });
      if (!active) {
        return;
      }
      setCoverage(coverageResult);
      if (coverageResult.requires_shipping) {
        if (method !== 'pickup' && method !== 'shipping') {
          setMethod('shipping');
        }
      } else if (coverageResult.configured && !coverageResult.covered && method !== 'pickup') {
        setMethod('pickup');
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [data.district, data.city, data.state, data.cep, method, checkCoverage]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {method !== 'pickup' && (
        <div className="fa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Nome completo" full><input className="fa-input" value={data.recipientName || ''} onChange={(event) => set({ ...data, recipientName: event.target.value })} /></Field>
          <Field label="CEP">
            <input className="fa-input" value={data.cep || ''} onChange={(event) => set({ ...data, cep: formatCep(event.target.value) })} inputMode="numeric" placeholder="00000-000" />
            {cepStatus.loading ? <div className="fa-faint" style={{ fontSize: 12, marginTop: 6 }}>Buscando endereço...</div> : null}
            {!cepStatus.loading && cepStatus.hint ? <div style={{ fontSize: 12, marginTop: 6, color: 'var(--fa-success)' }}>{cepStatus.hint}</div> : null}
            {!cepStatus.loading && cepStatus.error ? <div style={{ fontSize: 12, marginTop: 6, color: 'var(--fa-error)' }}>{cepStatus.error}</div> : null}
            {!cepStatus.loading && blockedForDelivery ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, marginTop: 6, color: 'var(--fa-warn)', fontWeight: 600 }}>
                <Icon name="info" size={13} style={{ flex: 'none', marginTop: 1 }} />
                Este endereço não está na nossa área de entrega. Apenas retirada na loja está disponível.
              </div>
            ) : null}
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
            <button key={entry.id} type="button" disabled={entry.disabled} onClick={() => { if (!entry.disabled) setMethod(entry.id); }}
              style={{ textAlign: 'left', cursor: entry.disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 'var(--fa-r-input)', border: method === entry.id ? '1.5px solid var(--fa-primary)' : '1px solid var(--fa-mist)', background: entry.disabled ? 'var(--fa-mist-2)' : method === entry.id ? 'var(--fa-rose-soft)' : 'var(--fa-surface)', opacity: entry.disabled ? 0.6 : 1, transition: 'all .15s' }}>
              <span className="fa-iconbox" style={{ background: '#fff', width: 44, height: 44, color: 'var(--fa-primary)' }}><Icon name={entry.icon} size={22} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{entry.t}</div>
                <div className="fa-muted" style={{ fontSize: 13, color: entry.disabled ? 'var(--fa-warn)' : undefined }}>{entry.d}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 14, color: entry.price === 'Grátis' ? 'var(--fa-success)' : 'var(--fa-ink)' }}>{entry.price}</div>
              <span style={{ width: 22, height: 22, borderRadius: 99, border: method === entry.id ? '6px solid var(--fa-primary)' : '2px solid var(--fa-mist)', flex: 'none', transition: 'all .15s' }} />
            </button>
          ))}
        </div>
      </div>

      {method === 'pickup' && <PickupStorePicker data={data} set={set} stores={stores} />}
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

function CardFieldsForm({ card, onChange }) {
  /** Render the raw card capture fields for a new saved card. */

  const value = card || {};
  const update = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="fa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 4px 4px' }}>
      <Field label="Número do cartão" full>
        <input className="fa-input" placeholder="0000 0000 0000 0000" inputMode="numeric" value={value.number || ''} onChange={(event) => update({ number: event.target.value.replace(/\D/g, '').slice(0, 19) })} />
      </Field>
      <Field label="Nome impresso" full>
        <input className="fa-input" placeholder="Como no cartão" value={value.holderName || ''} onChange={(event) => update({ holderName: event.target.value })} />
      </Field>
      <Field label="Validade">
        <input className="fa-input" placeholder="MM/AA" inputMode="numeric" value={value.expiry || ''} onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
          update({
            expiry: digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits,
            expiryMonth: digits.slice(0, 2),
            expiryYear: digits.slice(2, 4) ? '20' + digits.slice(2, 4) : '',
          });
        }} />
      </Field>
      <Field label="CVV">
        <input className="fa-input" placeholder="123" inputMode="numeric" value={value.cvv || ''} onChange={(event) => update({ cvv: event.target.value.replace(/\D/g, '').slice(0, 4) })} />
      </Field>
    </div>
  );
}

function CardMethodDetail({ data, set, cards = [] }) {
  /** Render the saved-card picker plus new-card entry for one card payment method. */

  const savedCards = Array.isArray(cards) ? cards : [];
  const usingNewCard = !data.paymentMethodId;
  return (
    <div style={{ padding: '16px 4px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {savedCards.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {savedCards.map((card) => (
            <button key={card.id} type="button" onClick={() => set({ ...data, paymentMethodId: card.id, newCard: null })}
              style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--fa-r-input)', border: data.paymentMethodId === card.id ? '1.5px solid var(--fa-primary)' : '1px solid var(--fa-mist)', background: data.paymentMethodId === card.id ? 'var(--fa-rose-soft)' : 'var(--fa-surface)' }}>
              <Icon name="card" size={18} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{card.brand || 'Cartão'} •••• {card.last4 || card.lastFourDigits}</span>
              <span style={{ width: 18, height: 18, borderRadius: 99, border: data.paymentMethodId === card.id ? '5px solid var(--fa-primary)' : '2px solid var(--fa-mist)', flex: 'none' }} />
            </button>
          ))}
          <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ ...data, paymentMethodId: '', newCard: data.newCard || {} })}>
            <Icon name="plus" size={14} />Usar outro cartão
          </button>
        </div>
      )}
      {(usingNewCard || savedCards.length === 0) && (
        <CardFieldsForm card={data.newCard} onChange={(card) => set({ ...data, paymentMethodId: '', newCard: card })} />
      )}
    </div>
  );
}

function PaymentForm({ data, set, cards = [] }) {
  /** Render the payment method chooser. */

  const methods = [
    { id: 'pix', t: 'Pix', d: 'Confirmação via QR Code', icon: 'pix' },
    { id: 'credit_card', t: 'Cartão de crédito', d: 'Cobrança à vista no cartão', icon: 'card' },
    { id: 'debit_card', t: 'Cartão de débito', d: 'Débito imediato na conta', icon: 'card' },
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
          {(data.method === 'credit_card' || data.method === 'debit_card') && method.id === data.method && (
            <CardMethodDetail data={data} set={set} cards={cards} />
          )}
          {data.method === 'pix' && method.id === 'pix' && (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 16, margin: '4px 0', background: 'var(--fa-success-soft)', borderRadius: 'var(--fa-r-card)' }}>
              <span className="fa-iconbox" style={{ background: '#fff', color: 'var(--fa-success)' }}><Icon name="pix" size={24} /></span>
              <div style={{ fontSize: 13.5, color: 'var(--fa-success)' }}><b>Pagamento instantâneo.</b> O QR Code aparece na confirmação do pedido.</div>
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

  const { items, products, coupon, onNav, placeOrder, checkoutVariant, stores = [], profile, addresses = [], placingOrder, cards = [], checkCoverage, deliveryEstimate, openWidgetChatPanel, user, prescriptionStatus, refreshPrescriptionStatus, prescriptionKind, setPrescriptionKind, removeItem, cashbackWallet } = ctx;
  const orderGrossTotal = computeMarketplaceOrderTotal(items, products, coupon, deliveryEstimate).total;
  const cashbackMaxRedeemable = cashbackWallet ? Math.max(0, Math.min(
    cashbackWallet.availableBalance,
    Math.round(orderGrossTotal * (cashbackWallet.redeemMaxPercent / 100) * 100) / 100,
  )) : 0;
  const [cashbackUseWallet, setCashbackUseWallet] = useState(false);
  const cashbackApplied = cashbackUseWallet ? cashbackMaxRedeemable : 0;
  useEffect(() => {
    // The redeemable ceiling moves with the cart (coupon applied, item removed, etc.) — never
    // let a stale toggle keep asking for more than is currently allowed.
    if (cashbackUseWallet && cashbackMaxRedeemable <= 0) {
      setCashbackUseWallet(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashbackMaxRedeemable]);
  const hasRx = items.some((item) => products.find((product) => product.id === item.id)?.rx);
  const rxItems = items
    .map((item) => ({ item, product: products.find((entry) => entry.id === item.id) }))
    .filter(({ product }) => product && product.rx);
  // A physical (paper-born) prescription never goes through online approval — the original is
  // checked in person at pickup (see the ADR) — so it clears the gate the moment it's declared,
  // same as "no rx at all". Digital still needs the pharmacist's online approval.
  const rxCleared = !hasRx || prescriptionKind === 'physical' || prescriptionStatus.status === 'approved';
  const [prescriptionKindModalOpen, setPrescriptionKindModalOpen] = useState(false);
  // Shown once, right when física is picked (from any entry point — first pick or a later
  // correction) — explains the pickup-only constraint up front instead of leaving the customer to
  // discover it from the inline card alone, and doubles as the store picker so there's one less
  // step before payment.
  const [physicalInfoModalOpen, setPhysicalInfoModalOpen] = useState(false);
  // Only offered while the last submission is 'rejected' — lets the customer drop the rx product
  // that's blocking payment instead of being stuck until a new prescription gets approved.
  const [removingRxItemId, setRemovingRxItemId] = useState('');

  useEffect(() => {
    if (hasRx && prescriptionKind !== 'physical' && typeof refreshPrescriptionStatus === 'function') {
      void refreshPrescriptionStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hasUnavailableItems = items.some((item) => {
    const product = products.find((entry) => entry.id === item.id);
    return !product || Number(product.stock || 0) <= 0;
  });
  const primaryAddress = resolvePrimaryAddress(addresses);
  const normalizedAddresses = addresses.map(normalizeAddress);
  const [delivery, setDelivery] = useState({
    method: 'express',
    recipientName: primaryAddress.recipientName || (profile && profile.name) || '',
    cep: primaryAddress.cep || '',
    phone: primaryAddress.recipientPhone || (profile && profile.phone) || '',
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
  // Phase 1 (Revisão) already happened on the cart page — this screen only ever covers phases 2-3
  // of the same CHECKOUT_PHASES journey, so `step` is just delivery(0)/payment(1).
  const [step, setStep] = useState(0);

  useEffect(() => {
    // A physical prescription's original must be handed over in person and can only be validated
    // at the counter — delivery by motoboy/transportadora isn't an option, and nothing is charged
    // online (see the ADR). Force both the moment the customer declares it, same as the existing
    // coverage effect forces 'pickup' when an address falls outside the delivery radius.
    if (hasRx && prescriptionKind === 'physical') {
      setDelivery((current) => (current.method === 'pickup' ? current : { ...current, method: 'pickup' }));
      setPayment((current) => {
        const next = current.method === 'pickup_cash' ? current : { ...current, method: 'pickup_cash' };
        // The customer already trusts this card enough to have saved it — don't make them
        // re-click it just to confirm what's already the obvious default. Only preselects once
        // (never overwrites a card the customer already picked or is actively typing in).
        if (!next.paymentMethodId && !next.newCard && cards.length > 0) {
          return { ...next, paymentMethodId: cards[0].id };
        }
        return next;
      });
    }
  }, [hasRx, prescriptionKind, cards]);

  // Address selection + coverage now live here (not inside DeliveryForm, which only the dead
  // checkoutVariant 'B' path still renders) because the order-summary sidebar is the single
  // place that both picks the saved address and chooses the delivery method — see the ADR.
  const [selectedAddressId, setSelectedAddressId] = useState(() => (primaryAddress && primaryAddress.id) || '');
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addingNewAddress, setAddingNewAddress] = useState(normalizedAddresses.length === 0);
  // Set from the pencil icon in the address-picker modal — a customer who saved an address with
  // a typo shouldn't have to delete it and start over. Distinct from `addingNewAddress`: same
  // form, but pre-filled and saved via update instead of create.
  const [editingAddressId, setEditingAddressId] = useState('');
  const isEditingAddress = addingNewAddress || !!editingAddressId;
  const [addressError, setAddressError] = useState('');
  const [coverage, setCoverage] = useState({ configured: false, covered: true });
  const lastCoverageCepRef = useRef('');
  const selectedAddress = normalizedAddresses.find((entry) => entry.id === selectedAddressId) || null;

  useEffect(() => {
    /** Once saved addresses arrive (they may still be loading on first render), auto-select the
     * primary one if nothing has been picked yet. */

    if (selectedAddressId || normalizedAddresses.length === 0) {
      return;
    }
    const primary = normalizedAddresses.find((entry) => entry.primary) || normalizedAddresses[0];
    if (primary && primary.id) {
      setSelectedAddressId(primary.id);
      // `addingNewAddress` was lazily seeded from `addresses.length === 0` at first render —
      // on a hard reload landing directly on /checkout, that fetch hasn't resolved yet, so it
      // locks in `true` even though the customer does have a saved address. This is the exact
      // moment that address shows up, so undo the auto-open now (never touches a genuine
      // customer-initiated "add new" — that only runs once `selectedAddressId` is already set,
      // so this effect no-ops by then).
      setAddingNewAddress(false);
    }
  }, [addresses]);

  useEffect(() => {
    /** Carry the selected saved address's location fields into the delivery payload. */

    if (!selectedAddressId) {
      return;
    }
    const address = normalizedAddresses.find((entry) => entry.id === selectedAddressId);
    if (!address) {
      return;
    }
    setDelivery((current) => ({
      ...current,
      cep: address.cep,
      street: address.street,
      number: address.number,
      complement: address.complement,
      district: address.district,
      city: address.city,
      state: address.state,
      // Who receives is stored on the address itself now (see AddressForm's "Eu mesmo"/"Outra
      // pessoa") — no more separate ad-hoc name/phone form on this screen.
      recipientName: address.recipientName || (profile && profile.name) || '',
      phone: address.recipientPhone || (profile && profile.phone) || '',
    }));
  }, [selectedAddressId]);

  useEffect(() => {
    /** Check delivery coverage once a selected address resolves a district/CEP — same check
     * DeliveryForm used to run internally, lifted here since the method chooser lives in the
     * summary sidebar now. */

    const digits = String(delivery.cep || '').replace(/\D/g, '');
    if (typeof checkCoverage !== 'function' || delivery.method === 'pickup' || !delivery.district || digits.length !== 8) {
      return;
    }
    if (digits === lastCoverageCepRef.current) {
      return;
    }
    lastCoverageCepRef.current = digits;
    let active = true;
    (async () => {
      const coverageResult = await checkCoverage({ district: delivery.district, city: delivery.city, state: delivery.state, cep: delivery.cep });
      if (!active) {
        return;
      }
      setCoverage(coverageResult);
      if (coverageResult.requires_shipping) {
        if (delivery.method !== 'pickup' && delivery.method !== 'shipping') {
          setDelivery((current) => ({ ...current, method: 'shipping' }));
        }
      } else if (coverageResult.configured && !coverageResult.covered && delivery.method !== 'pickup') {
        setDelivery((current) => ({ ...current, method: 'pickup' }));
      }
    })();
    return () => { active = false; };
  }, [delivery.district, delivery.city, delivery.state, delivery.cep, delivery.method, checkCoverage]);

  const requiresShipping = coverage.requires_shipping === true;
  const blockedForDelivery = (coverage.configured && !coverage.covered) || requiresShipping;
  // Physical prescription: the original has to be handed over and checked in person, so pickup
  // is the only legitimate delivery option — express/padrão/transportadora are hidden entirely
  // rather than merely disabled, since there's no coverage/CEP reason a customer would need
  // explained here (the reason is regulatory, already stated in the rx gate card below).
  const requiresPickupOnly = hasRx && prescriptionKind === 'physical';
  const deliveryMethods = requiresPickupOnly ? [
    { id: 'pickup', t: 'Retirar na loja', d: 'Leve a receita original · pague na retirada', price: 'Grátis', icon: 'bag', disabled: false },
  ] : [
    { id: 'express', t: 'Entrega expressa', d: blockedForDelivery ? 'Fora da área de entrega por motoboy' : 'Em até 60 minutos', price: 'R$ 9,90', icon: 'bolt', disabled: blockedForDelivery },
    { id: 'standard', t: 'Entrega padrão', d: blockedForDelivery ? 'Fora da área de entrega por motoboy' : 'Hoje, até 3h', price: 'Grátis', icon: 'truck', disabled: blockedForDelivery },
    { id: 'pickup', t: 'Retirar na loja', d: 'Pronto em 20 min · escolha a unidade', price: 'Grátis', icon: 'bag', disabled: false },
    ...(requiresShipping ? [{ id: 'shipping', t: 'Envio por transportadora', d: coverage.nearestStoreName ? 'Fora do raio de entrega · sai de ' + coverage.nearestStoreName : 'Fora do raio de entrega', price: 'Calculado no endereço', icon: 'nav', disabled: false }] : []),
  ];

  const saveNewAddress = async (data) => {
    /** Persist a brand-new saved address (from the sidebar's "cadastrar novo endereço") and
     * select it as the delivery address for this order. */

    const normalized = normalizeAddress(data);
    try {
      setAddressError('');
      const previousIds = new Set(addresses.map((entry) => entry.id));
      const updatedAddresses = await ctx.createCustomerAddress(normalized);
      const created = updatedAddresses.find((entry) => !previousIds.has(entry.id)) || updatedAddresses[updatedAddresses.length - 1];
      if (created && created.id) {
        setSelectedAddressId(created.id);
      }
      setAddingNewAddress(false);
    } catch (error) {
      setAddressError(error && error.message ? error.message : 'Não foi possível salvar o endereço.');
    }
  };

  const saveEditedAddress = async (data) => {
    /** Persist edits to an existing saved address (pencil icon in the address picker) — for a
     * typo caught after saving, not a new address. */

    const normalized = normalizeAddress(data);
    try {
      setAddressError('');
      await ctx.updateCustomerAddress(editingAddressId, normalized);
      setSelectedAddressId(editingAddressId);
      setEditingAddressId('');
    } catch (error) {
      setAddressError(error && error.message ? error.message : 'Não foi possível salvar o endereço.');
    }
  };

  const deliveryMethodLabel = delivery.method === 'express' ? 'Expressa · 60 min'
    : delivery.method === 'pickup' ? ('Retirada · ' + ((stores.find((entry) => entry.id === (delivery.store || (stores[0] && stores[0].id))) || {}).name || 'loja'))
    : delivery.method === 'shipping' ? 'Envio por transportadora'
    : 'Padrão · hoje';

  const summaryItems = items.map((item) => {
    const product = products.find((entry) => entry.id === item.id);
    return {
      item,
      product,
      lineTotal: product ? (item.sub ? product.price * 0.85 : product.price) * item.qty : 0,
    };
  });

  const SUMMARY_VISIBLE_ITEMS = 5;
  const [summaryScrollOffset, setSummaryScrollOffset] = useState(0);
  useEffect(() => {
    setSummaryScrollOffset((current) => Math.min(current, Math.max(0, summaryItems.length - SUMMARY_VISIBLE_ITEMS)));
  }, [summaryItems.length]);
  const canScrollSummaryUp = summaryScrollOffset > 0;
  const canScrollSummaryDown = summaryScrollOffset + SUMMARY_VISIBLE_ITEMS < summaryItems.length;
  const visibleSummaryItems = summaryItems.slice(summaryScrollOffset, summaryScrollOffset + SUMMARY_VISIBLE_ITEMS);

  const summaryCard = (
    <div className="fa-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 130 }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>Resumo do pedido</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {canScrollSummaryUp && (
          <button type="button" onClick={() => setSummaryScrollOffset((offset) => Math.max(0, offset - 1))}
            aria-label="Ver produto anterior" style={{ display: 'flex', justifyContent: 'center', padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fa-ink-3)' }}>
            <Icon name="chevD" size={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        {visibleSummaryItems.map(({ item, product, lineTotal }) => (
          <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 44, height: 44, flex: 'none' }}>
              {product ? (
                <ProductVisual product={product} style={{ width: 44, height: 44, aspectRatio: 'auto' }} />
              ) : (
                <div className="fa-ph" data-cat="medicamentos" style={{ width: 44, height: 44, aspectRatio: 'auto' }}>
                  <Icon name="bag" size={18} style={{ color: 'var(--fa-primary)', opacity: .35 }} />
                </div>
              )}
              {item.qty > 1 && (
                <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--fa-primary)', color: '#fff', borderRadius: 99, fontSize: 11, fontWeight: 800, minWidth: 18, height: 18, padding: '0 4px', display: 'grid', placeItems: 'center' }}>{item.qty}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {product ? product.name : 'Item indisponível'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{brl(lineTotal)}</div>
          </div>
        ))}
        {canScrollSummaryDown && (
          <button type="button" onClick={() => setSummaryScrollOffset((offset) => offset + 1)}
            aria-label="Ver próximo produto" style={{ display: 'flex', justifyContent: 'center', padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fa-ink-3)' }}>
            <Icon name="chevD" size={16} />
          </button>
        )}
      </div>
      <hr className="fa-divider" />
      {/* Delivery method + address now live at the top of the main "Entrega" column (the actual
          decision point), and step 1 already carries its own compact recap row — this sidebar
          doesn't need a third copy of the same controls. */}
      <OrderSummary items={items} products={products} coupon={coupon} deliveryEstimate={deliveryEstimate} cashbackApplied={cashbackApplied} />
    </div>
  );

  const addressPickerModal = (
    <Modal open={addressModalOpen} onClose={() => setAddressModalOpen(false)} title="Escolher endereço de entrega" maxw={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {normalizedAddresses.map((address) => (
          <div key={address.id} role="button" tabIndex={0}
            onClick={() => { setSelectedAddressId(address.id); setAddressModalOpen(false); }}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedAddressId(address.id); setAddressModalOpen(false); } }}
            style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 'var(--fa-r-input)', border: address.id === selectedAddressId ? '1.5px solid var(--fa-primary)' : '1px solid var(--fa-mist)', background: address.id === selectedAddressId ? 'var(--fa-rose-soft)' : 'var(--fa-surface)' }}>
            <Icon name="pin" size={18} style={{ color: 'var(--fa-primary)', marginTop: 2, flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{address.label}</div>
              <div style={{ fontSize: 13 }}>{buildAddressLine(address) || 'Endereço não informado'}</div>
              <div className="fa-muted" style={{ fontSize: 12.5 }}>{buildAddressSecondaryLine(address)}</div>
            </div>
            <button
              type="button"
              className="fa-iconbtn"
              aria-label={'Editar endereço ' + address.label}
              style={{ flex: 'none', marginTop: 1 }}
              onClick={(event) => {
                event.stopPropagation();
                setEditingAddressId(address.id);
                setAddressModalOpen(false);
              }}
            >
              <Icon name="edit" size={15} />
            </button>
            <span style={{ width: 20, height: 20, borderRadius: 99, border: address.id === selectedAddressId ? '6px solid var(--fa-primary)' : '2px solid var(--fa-mist)', flex: 'none', marginTop: 2 }} />
          </div>
        ))}
        <button type="button" className="fa-btn fa-btn-soft"
          onClick={() => { setAddingNewAddress(true); setAddressModalOpen(false); }}>
          <Icon name="plus" size={16} />Cadastrar novo endereço
        </button>
      </div>
    </Modal>
  );

  const addressFormModal = (
    <Modal
      open={isEditingAddress}
      onClose={() => { setAddingNewAddress(false); setEditingAddressId(''); }}
      title={editingAddressId ? 'Editar endereço' : 'Cadastrar novo endereço'}
      maxw={560}
    >
      <div style={{ marginTop: 12 }}>
        <AddressForm
          initial={editingAddressId ? normalizedAddresses.find((entry) => entry.id === editingAddressId) : createEmptyAddress()}
          onSave={editingAddressId ? saveEditedAddress : saveNewAddress}
          onCancel={() => { setAddingNewAddress(false); setEditingAddressId(''); }}
          selfName={profile && profile.name} selfPhone={profile && profile.phone}
        />
        {addressError ? <div style={{ color: 'var(--fa-error)', fontSize: 12.5, marginTop: 8 }}>{addressError}</div> : null}
      </div>
    </Modal>
  );

  // Gates "Continuar" on step 0: a pickup order needs a chosen store, a delivered one needs a
  // complete address — same completeness check the "Entregar para" card's own warning uses, so
  // the two never disagree about whether something's actually wrong.
  const deliveryReady = delivery.method === 'pickup' ? !!delivery.store : isAddressComplete(selectedAddress);

  const hasValidCpf = !!(profile && (profile.cpf || '').replace(/\D/g, '').length === 11);
  // Receita física: nada é cobrado agora, mas a cobrança na retirada só é possível com um token
  // de cartão já em mãos — sem isso, não há como cobrar depois sem o cliente presente. Mesma
  // checagem de "campos preenchidos" que a etapa de cartão de crédito/débito já faz antes de
  // deixar tokenizar (ver placeOrder em marketplace-app.jsx).
  const physicalCardReady = !(hasRx && prescriptionKind === 'physical') || !!payment.paymentMethodId || !!(
    payment.newCard && payment.newCard.number && payment.newCard.holderName && payment.newCard.expiryMonth && payment.newCard.expiryYear && payment.newCard.cvv
  );
  const placeBtn = !rxCleared ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 'var(--fa-r-input)', background: 'var(--fa-warn-soft)', color: 'var(--fa-warn-ink)', fontSize: 13 }}>
        <Icon name="rx" size={18} style={{ flex: 'none', marginTop: 1 }} />
        <span>O pagamento fica bloqueado até a validação da receita — veja o aviso acima.</span>
      </div>
      <button className="fa-btn fa-btn-vital fa-btn-lg fa-btn-block" disabled>
        <Icon name="lock" size={18} />Pagamento bloqueado
      </button>
    </div>
  ) : hasUnavailableItems ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 'var(--fa-r-input)', background: 'var(--fa-warn-soft)', color: 'var(--fa-warn-ink)', fontSize: 13 }}>
        <Icon name="info" size={18} style={{ flex: 'none', marginTop: 1 }} />
        <span>Seu carrinho tem itens sem estoque ou que saíram de venda. Volte ao carrinho e remova-os para continuar.</span>
      </div>
      <button className="fa-btn fa-btn-vital fa-btn-lg fa-btn-block" onClick={() => onNav({ name: 'cart' })}>
        <Icon name="cart" size={18} />Voltar ao carrinho
      </button>
    </div>
  ) : !physicalCardReady ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 'var(--fa-r-input)', background: 'var(--fa-warn-soft)', color: 'var(--fa-warn-ink)', fontSize: 13 }}>
        <Icon name="card" size={18} style={{ flex: 'none', marginTop: 1 }} />
        <span>Cadastre ou selecione um cartão para a cobrança na retirada — veja o aviso acima.</span>
      </div>
      <button className="fa-btn fa-btn-vital fa-btn-lg fa-btn-block" disabled>
        <Icon name="lock" size={18} />Pagamento bloqueado
      </button>
    </div>
  ) : hasValidCpf ? (
    <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={placingOrder} onClick={() => placeOrder({ delivery, payment, rx, cashbackRedeemAmount: cashbackApplied })}>
      <Icon name="shield" size={18} />
      {placingOrder ? 'Processando pedido...' : hasRx && prescriptionKind === 'physical' ? 'Confirmar pré-pedido' : 'Confirmar e pagar'}
    </button>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 'var(--fa-r-input)', background: 'var(--fa-warn-soft)', color: 'var(--fa-warn-ink)', fontSize: 13 }}>
        <Icon name="info" size={18} style={{ flex: 'none', marginTop: 1 }} />
        <span>Complete seu CPF em Minha Conta para emitirmos a nota fiscal da compra.</span>
      </div>
      <button className="fa-btn fa-btn-vital fa-btn-lg fa-btn-block" onClick={() => onNav({ name: 'account', tab: 'profile' })}>
        <Icon name="user" size={18} />Completar CPF
      </button>
    </div>
  );

  // Reachable directly by URL (typed, bookmarked, or a stale link from before logout) — the
  // "Finalizar compra" button already gates entry via requireAuth, but that only guards the one
  // click path, not the route itself. Same inline-prompt convention as AccountScreen's own
  // `!user` gate, not a redirect, so a reload here doesn't silently bounce the visitor away.
  if (!user) {
    return (
      <div className="fa-wrap fa-fadein" style={{ paddingTop: 60, paddingBottom: 80, textAlign: 'center' }}>
        <span className="fa-iconbox" style={{ margin: '0 auto 18px', width: 72, height: 72 }}><Icon name="lock" size={32} /></span>
        <h1 className="fa-h2">Entre para continuar sua compra</h1>
        <p className="fa-lead" style={{ marginTop: 8 }}>Precisamos confirmar sua conta antes da entrega e do pagamento.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 22 }}>
          <button className="fa-btn fa-btn-primary fa-btn-lg" onClick={() => onNav({ name: 'login' })}>Entrar na conta</button>
          <button className="fa-btn fa-btn-ghost fa-btn-lg" onClick={() => onNav({ name: 'cart' })}>Voltar ao carrinho</button>
        </div>
      </div>
    );
  }

  if (checkoutVariant === 'A') {
    return (
      <div className="fa-fadein">
      <FullBleedBand index={1} contentStyle={{ paddingTop: 22, paddingBottom: 22 }}>
        <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginBottom: 18 }} onClick={() => onNav({ name: 'cart' })}><Icon name="chevL" size={16} />Voltar ao carrinho</button>
        <CheckoutPhaseBar
          phases={CHECKOUT_PHASES}
          activeIndex={step + 1}
          onSelect={(index) => { if (index === 0) onNav({ name: 'cart' }); else setStep(index - 1); }}
        />
      </FullBleedBand>

      <div className="fa-wrap" style={{ paddingTop: 28, paddingBottom: 30 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--fa-gap)', alignItems: 'start' }} className="fa-ck-grid">
          <div className="fa-card" style={{ padding: 24 }}>
            {step === 0 && (
              <>
                <StepHead n="2" title="Entrega" sub="Para onde levamos seu cuidado?" />
                {/* Method + address first — this is the actual decision the customer came here
                    to make, so it opens the step instead of hiding in the sidebar (which nothing
                    on this step pointed at). No mention of prescription here on purpose — that
                    only matters at payment, where it actually blocks something. */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 10 }}>Como você quer receber?</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {deliveryMethods.map((entry) => (
                      <button key={entry.id} type="button" disabled={entry.disabled}
                        onClick={() => { if (!entry.disabled) setDelivery((current) => ({ ...current, method: entry.id })); }}
                        style={{ textAlign: 'left', cursor: entry.disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 'var(--fa-r-input)', border: delivery.method === entry.id ? '1.5px solid var(--fa-primary)' : '1px solid var(--fa-mist)', background: entry.disabled ? 'var(--fa-mist-2)' : delivery.method === entry.id ? 'var(--fa-rose-soft)' : 'var(--fa-surface)', opacity: entry.disabled ? .6 : 1, transition: 'all .15s' }}>
                        <span className="fa-iconbox" style={{ background: '#fff', width: 44, height: 44, color: 'var(--fa-primary)' }}><Icon name={entry.icon} size={22} /></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{entry.t}</div>
                          <div className="fa-muted" style={{ fontSize: 13, color: entry.disabled ? 'var(--fa-warn)' : undefined }}>{entry.d}</div>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: entry.price === 'Grátis' ? 'var(--fa-success)' : 'var(--fa-ink)' }}>{entry.price}</div>
                        <span style={{ width: 22, height: 22, borderRadius: 99, border: delivery.method === entry.id ? '6px solid var(--fa-primary)' : '2px solid var(--fa-mist)', flex: 'none', transition: 'all .15s' }} />
                      </button>
                    ))}
                  </div>
                </div>
                {delivery.method !== 'pickup' && (
                  <div style={{ marginBottom: 20, padding: 16, border: '1px solid var(--fa-mist)', borderRadius: 'var(--fa-r-card)' }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 10 }}>Entregar para</div>
                    {selectedAddress ? (
                      <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>
                        <div style={{ fontWeight: 700 }}>{selectedAddress.label}</div>
                        <div className="fa-muted">
                          {buildAddressLine(selectedAddress) || 'Endereço não informado'}
                          {buildAddressSecondaryLine(selectedAddress) ? ' · ' + buildAddressSecondaryLine(selectedAddress) : ''}
                        </div>
                        {(delivery.recipientName || delivery.phone) && (
                          <div className="fa-muted" style={{ marginTop: 4 }}>
                            Recebe: {delivery.recipientName || '—'}{delivery.phone ? ' · ' + delivery.phone : ''}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="fa-muted" style={{ fontSize: 13.5, marginBottom: 10 }}>Nenhum endereço cadastrado ainda.</div>
                    )}
                    <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ alignSelf: 'flex-start' }}
                      onClick={() => (normalizedAddresses.length > 0 ? setAddressModalOpen(true) : setAddingNewAddress(true))}>
                      <Icon name="edit" size={14} />{selectedAddress ? 'Alterar endereço' : 'Adicionar endereço'}
                    </button>
                    {!isAddressComplete(selectedAddress) && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: 12.5, color: 'var(--fa-warn-ink)' }}>
                        <Icon name="info" size={14} style={{ flex: 'none', marginTop: 1 }} />
                        <span>{selectedAddress ? 'Este endereço está incompleto — corrija antes de continuar.' : 'Cadastre um endereço para continuar.'}</span>
                      </div>
                    )}
                  </div>
                )}
                {delivery.method === 'pickup' && <PickupStorePicker data={delivery} set={setDelivery} stores={stores} />}
              </>
            )}
            {step === 1 && (
              <>
                <StepHead n="3" title="Pagamento" sub="Escolha como prefere pagar." />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, marginBottom: 20, border: '1px solid var(--fa-mist)', borderRadius: 'var(--fa-r-input)' }}>
                  <Icon name="truck" size={20} style={{ color: 'var(--fa-primary)' }} />
                  <div style={{ flex: 1 }}><div className="fa-faint" style={{ fontSize: 12 }}>Entrega</div><div style={{ fontWeight: 700, fontSize: 14 }}>{deliveryMethodLabel}</div></div>
                  <button className="fa-cart-link-btn" type="button" onClick={() => setStep(0)}>Alterar</button>
                </div>
                {hasRx && (
                  // The product that actually needs the prescription, shown once here — every
                  // gate state below just varies what to do about it, not what it's about.
                  <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {rxItems.map(({ item, product }) => (
                      <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, border: '1px solid var(--fa-mist)', borderRadius: 'var(--fa-r-card)' }}>
                        <ProductVisual product={product} style={{ width: 52, height: 52, aspectRatio: 'auto', flex: 'none' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3, fontSize: 12, fontWeight: 700, color: 'var(--fa-warn-ink)' }}>
                            <Icon name="rx" size={12} stroke={2.1} />Receita obrigatória
                          </div>
                        </div>
                        {/* The rejection gate is cart-wide, not per item (see get_prescription_status)
                            — so the only way out without a new/approved receita is to remove
                            whichever rx product is blocking payment. Scoped to 'rejected' only:
                            removing while 'pending'/'none' would just throw away a submission
                            that's still on track or hasn't happened yet. */}
                        {prescriptionStatus.status === 'rejected' && (
                          <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 'none', color: 'var(--fa-error)', border: '1px solid var(--fa-error)' }} aria-label={'remover ' + product.name} onClick={() => setRemovingRxItemId(item.id)}>
                            <Icon name="trash" size={14} />Remover
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {hasRx && prescriptionKind === '' ? (
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, borderRadius: 'var(--fa-r-card)', background: 'var(--fa-warn-soft)' }}>
                    <Icon name="rx" size={22} style={{ flex: 'none', color: 'var(--fa-warn-ink)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>Sua receita é digital ou física?</div>
                      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6 }}>Isso muda como você recebe e paga o pedido.</p>
                      <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 12 }} onClick={() => setPrescriptionKindModalOpen(true)}>
                        <Icon name="rx" size={15} />Escolher tipo de receita
                      </button>
                    </div>
                  </div>
                ) : hasRx && prescriptionKind === 'physical' ? (
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, borderRadius: 'var(--fa-r-card)', background: 'var(--fa-info-soft)' }}>
                    <Icon name="card" size={22} style={{ flex: 'none', color: 'var(--fa-info)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>Pagamento só é feito na retirada</div>
                      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6 }}>Leve a receita original na retirada — por lei, o farmacêutico precisa reter o papel. O pagamento só é efetuado depois disso, automaticamente pelo cartão já cadastrado que você escolher abaixo.</p>
                      <CardMethodDetail data={payment} set={setPayment} cards={cards} />
                      <button type="button" className="fa-btn fa-btn-ghost fa-btn-sm" style={{ marginTop: 10 }} onClick={() => setPrescriptionKindModalOpen(true)}>
                        <Icon name="rx" size={15} />Escolher tipo de receita
                      </button>
                    </div>
                  </div>
                ) : !rxCleared ? (
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, borderRadius: 'var(--fa-r-card)', background: prescriptionStatus.status === 'rejected' ? '#FBEAE9' : prescriptionStatus.status === 'pending' ? 'var(--fa-info-soft)' : 'var(--fa-warn-soft)' }}>
                    <Icon name={prescriptionStatus.status === 'pending' ? 'clock' : 'rx'} size={22} style={{ flex: 'none', color: prescriptionStatus.status === 'rejected' ? 'var(--fa-error)' : prescriptionStatus.status === 'pending' ? 'var(--fa-info)' : 'var(--fa-warn-ink)' }} />
                    <div style={{ flex: 1 }}>
                      {prescriptionStatus.status === 'pending' ? (
                        <>
                          <div style={{ fontWeight: 800, fontSize: 15 }}>Receita digital em análise</div>
                          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6 }}>Sua receita já foi enviada e está sendo validada pelo farmacêutico. Assim que for aprovada, o pagamento é liberado automaticamente — não é preciso voltar aqui.</p>
                        </>
                      ) : prescriptionStatus.status === 'rejected' ? (
                        <>
                          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--fa-error)' }}>Receita digital recusada</div>
                          <p style={{ fontSize: 13.5, marginTop: 6, color: 'var(--fa-error)' }}>Motivo: {prescriptionStatus.rejectionReason || 'não informado.'}</p>
                          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6 }}>Abra o chat para enviar uma nova receita digital e liberar o pagamento — ou remova o produto com receita acima para continuar a compra sem ele.</p>
                        </>
                      ) : (
                        <p className="fa-muted" style={{ fontSize: 13.5 }}>Envie a receita digital (PDF assinado ou link da plataforma) pelo chat com o farmacêutico para liberar o pagamento.</p>
                      )}
                      {/* Every state below keeps BOTH controls always on screen: act on the current
                          state (view/resend/send via chat — chat stays closed until this is
                          clicked), and correct a wrong pick (reopens the same kind-choice modal
                          used for the first selection). Neither ever hides the other. */}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                        {prescriptionStatus.status !== 'pending' && (
                          <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => openWidgetChatPanel('prescription_digital')}>
                            <Icon name="chat" size={15} />{prescriptionStatus.status === 'rejected' ? 'Abrir chat e reenviar receita' : 'Abrir chat e enviar receita'}
                          </button>
                        )}
                        <button type="button" className="fa-btn fa-btn-ghost fa-btn-sm" onClick={() => setPrescriptionKindModalOpen(true)}>
                          <Icon name="rx" size={15} />{prescriptionStatus.status === 'pending' ? 'Ver conversa ou escolher tipo de receita' : 'Escolher tipo de receita'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <PaymentForm data={payment} set={setPayment} cards={cards} />
                    {cashbackMaxRedeemable > 0 && (
                      <div className="fa-card" style={{ marginTop: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span className="fa-iconbox" style={{ width: 40, height: 40, flex: 'none' }}><Icon name="gift" size={19} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14.5 }}>Usar meu cashback</div>
                          <p className="fa-muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                            Saldo disponível: {brl(cashbackWallet.availableBalance)} · pode abater até {brl(cashbackMaxRedeemable)} neste pedido
                          </p>
                        </div>
                        <Toggle on={cashbackUseWallet} onChange={() => setCashbackUseWallet((current) => !current)} ariaLabel="Usar cashback neste pedido" />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 26, alignItems: 'flex-start' }}>
              {step > 0 && <button className="fa-btn fa-btn-soft fa-btn-lg" onClick={() => setStep(step - 1)}>Voltar</button>}
              {step === 0 ? (
                <div style={{ flex: 1 }}>
                  {!deliveryReady && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10, fontSize: 12.5, color: 'var(--fa-error)' }}>
                      <Icon name="info" size={14} style={{ flex: 'none', marginTop: 1 }} />
                      <span>{delivery.method === 'pickup' ? 'Escolha uma unidade para retirada antes de continuar.' : 'Corrija ou complete o endereço de entrega antes de continuar.'}</span>
                    </div>
                  )}
                  <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={!deliveryReady} onClick={() => setStep(1)}>Continuar<Icon name="arrowR" size={18} /></button>
                </div>
              ) : (
                <div style={{ flex: 1 }}>{placeBtn}</div>
              )}
            </div>
          </div>
          {summaryCard}
        </div>
      </div>
      {addressPickerModal}
      {addressFormModal}
      <PrescriptionKindModal
        open={prescriptionKindModalOpen}
        onClose={() => setPrescriptionKindModalOpen(false)}
        onSelectDigital={() => { setPrescriptionKind('digital'); setPrescriptionKindModalOpen(false); openWidgetChatPanel('prescription_digital'); }}
        onSelectPhysical={() => { setPrescriptionKind('physical'); setPrescriptionKindModalOpen(false); setPhysicalInfoModalOpen(true); }}
      />
      <PhysicalPrescriptionModal
        open={physicalInfoModalOpen}
        onClose={() => setPhysicalInfoModalOpen(false)}
        delivery={delivery}
        setDelivery={setDelivery}
        stores={stores}
      />
      <RemoveItemModal
        open={!!removingRxItemId}
        product={products.find((entry) => entry.id === removingRxItemId)}
        qty={(items.find((entry) => entry.id === removingRxItemId) || {}).qty || 1}
        isSubscribed={!!(items.find((entry) => entry.id === removingRxItemId) || {}).sub}
        onClose={() => setRemovingRxItemId('')}
        onConfirm={() => { removeItem(removingRxItemId); setRemovingRxItemId(''); }}
      />
      </div>
    );
  }

  return (
    <div className="fa-fadein">
    <FullBleedBand index={1}>
      <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginBottom: 18 }} onClick={() => onNav({ name: 'cart' })}><Icon name="chevL" size={16} />Voltar ao carrinho</button>
      <h1 className="fa-h1" style={{ fontSize: 'clamp(26px,3vw,36px)' }}>Finalizar compra</h1>
    </FullBleedBand>
    <div className="fa-wrap" style={{ paddingTop: 28, paddingBottom: 30 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--fa-gap)', alignItems: 'start' }} className="fa-ck-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="fa-card" style={{ padding: 24 }}><StepHead n="1" title="Entrega" /><DeliveryForm data={delivery} set={setDelivery} stores={stores} checkCoverage={checkCoverage} /></div>
          {hasRx && <div className="fa-card" style={{ padding: 24 }}><StepHead n="2" title="Receita digital" /><PrescriptionCard data={rx} set={setRx} /></div>}
          <div className="fa-card" style={{ padding: 24 }}><StepHead n={hasRx ? '3' : '2'} title="Pagamento" /><PaymentForm data={payment} set={setPayment} cards={cards} /></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 130 }}>
          {summaryCard}
          {placeBtn}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: 'var(--fa-ink-3)' }}><Icon name="shield" size={15} />Ambiente seguro e criptografado</div>
        </div>
      </div>
    </div>
    </div>
  );
}

function ConfirmScreen({ ctx }) {
  /** Render the final purchase confirmation state. */

  const { onNav, lastOrder, openChat } = ctx;
  const etaLabel = lastOrder && lastOrder.eta ? lastOrder.eta : '—';
  const orderCode = lastOrder && (lastOrder.id || lastOrder.code) ? lastOrder.id || lastOrder.code : '—';
  const totalAmount = lastOrder ? Number(lastOrder.total || lastOrder.total_amount || 0) : 0;
  const paymentApproved = lastOrder && lastOrder.paymentStatus === 'approved';
  const paymentAtPickup = lastOrder && lastOrder.paymentStatus === 'pending_pickup';
  const hasPixQrCode = lastOrder && !paymentApproved && !paymentAtPickup && lastOrder.pixQrCode;
  const cashbackApplied = lastOrder ? Number(lastOrder.cashbackApplied || 0) : 0;
  const cashbackEarned = lastOrder ? Number(lastOrder.cashbackEarned || 0) : 0;
  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 50, paddingBottom: 80, maxWidth: 600, textAlign: 'center' }}>
      <span className="fa-iconbox" style={{ margin: '0 auto 20px', width: 84, height: 84, background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="check" size={42} stroke={2.4} /></span>
      <h1 className="fa-h1" style={{ fontSize: 'clamp(26px,3vw,36px)' }}>{paymentAtPickup ? 'Pré-pedido confirmado!' : 'Pedido confirmado!'}</h1>
      <p className="fa-lead" style={{ marginTop: 10 }}>
        {paymentAtPickup
          ? 'Nada foi cobrado agora. Leve a receita original na retirada — assim que o farmacêutico conferir o papel, o pagamento é feito automaticamente pelo cartão cadastrado.'
          : paymentApproved
          ? 'Seu pedido foi enviado para a operacao da Farmaura com pagamento aprovado. Agora ele segue para separacao, retirada ou entrega conforme o fluxo escolhido.'
          : 'Seu pedido foi registrado e aguarda a confirmação do pagamento. Assim que o pagamento for aprovado, ele segue para separação, retirada ou entrega.'}
      </p>
      {hasPixQrCode ? (
        <div className="fa-card" style={{ padding: 22, marginTop: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Pague com Pix para confirmar o pedido</div>
          <img src={'data:image/png;base64,' + lastOrder.pixQrCode} alt="QR Code Pix" style={{ width: 200, height: 200 }} />
          {lastOrder.pixCopyPaste ? (
            <div className="fa-mono" style={{ fontSize: 11.5, wordBreak: 'break-all', background: 'var(--fa-mist-2)', padding: 10, borderRadius: 'var(--fa-r-input)' }}>{lastOrder.pixCopyPaste}</div>
          ) : null}
        </div>
      ) : null}
      <div className="fa-card" style={{ padding: 22, marginTop: 20, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="fa-muted">Pedido</span><b className="fa-mono">#{orderCode}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="fa-muted">Total</span><b>{lastOrder ? brl(totalAmount) : '—'}</b></div>
        {cashbackApplied > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fa-success)' }}><span className="fa-muted">Cashback usado</span><b>-{brl(cashbackApplied)}</b></div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="fa-muted">Pagamento</span><b style={{ color: paymentApproved ? 'var(--fa-success)' : paymentAtPickup ? 'var(--fa-info)' : 'var(--fa-warn-ink)' }}>{paymentApproved ? 'Aprovado' : paymentAtPickup ? 'Na retirada' : 'Aguardando confirmação'}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="fa-muted">Fluxo</span><b>{lastOrder && lastOrder.fulfillment === 'pickup' ? 'Pronto para retirada' : lastOrder && lastOrder.fulfillment === 'shipping' ? 'Envio por transportadora' : 'Entrega em preparacao'}</b></div>
        {lastOrder && lastOrder.fulfillment === 'pickup' && lastOrder.pickupCode ? (
          <div style={{ background: 'var(--fa-info-soft)', borderRadius: 'var(--fa-r-card)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fa-info)', fontWeight: 800, fontSize: 13.5 }}><Icon name="bag" size={16} />Codigo de retirada</div>
            <div className="fa-mono" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '.08em', color: 'var(--fa-ink)' }}>{lastOrder.pickupCode}</div>
            <div className="fa-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>Mostre ou informe este código ao farmacêutico no momento da retirada para validação no sistema.</div>
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="fa-muted">Previsao</span><b style={{ color: 'var(--fa-success)' }}>{etaLabel}</b></div>
        {cashbackEarned > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--fa-success-soft)', borderRadius: 'var(--fa-r-card)', padding: '12px 14px' }}>
            <Icon name="gift" size={18} style={{ color: 'var(--fa-success)', flex: 'none' }} />
            <span style={{ fontSize: 13, color: 'var(--fa-success)' }}>Você vai ganhar <b>{brl(cashbackEarned)}</b> em cashback — liberado assim que o pedido for entregue/retirado.</span>
          </div>
        )}
        <hr className="fa-divider" />
        <button
          type="button"
          className="fa-btn fa-btn-soft"
          style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', padding: '10px 12px' }}
          onClick={() => openChat({ order: lastOrder })}
        >
          <span className="fa-iconbox" style={{ background: 'var(--fa-rose-soft)' }}><Icon name="chat" size={22} /></span>
          <div style={{ fontSize: 13.5, flex: 1 }} className="fa-muted">Ficou com alguma dúvida sobre este pedido, ou precisa validar uma receita? Fale com o farmacêutico.</div>
          <Icon name="chevR" size={16} style={{ color: 'var(--fa-ink-3)' }} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
        <button className="fa-btn fa-btn-primary fa-btn-lg" onClick={() => onNav({ name: 'orders', tab: 'orders' })}>Ver meus pedidos</button>
        <button className="fa-btn fa-btn-ghost fa-btn-lg" onClick={() => onNav({ name: 'offers' })}>Continuar comprando</button>
      </div>
    </div>
  );
}

export { CheckoutScreen, ConfirmScreen, DeliveryForm, Field, PaymentForm, PrescriptionCard, StepHead, StoreMap };
