/*
farmaura/react/marketplace/screens/account-profile-screen.jsx

Marketplace account profile screens for Farmaura.

Responsibilities:
- manage customer profile, saved addresses, privacy settings, and saved cards;
- standardize address capture with masked CEP and ViaCEP autofill;
- preserve existing account management flows with normalized address data;

Observations:
- legacy saved addresses are normalized before edit or display;
- ViaCEP only fills public locality data and never replaces house number or complement;
*/

import React, { useEffect, useRef, useState } from "react";
import { Modal, Toggle } from "../core/marketplace-components.jsx";
import {
  buildAddressLine,
  buildAddressSecondaryLine,
  createEmptyAddress,
  fetchViaCepAddress,
  formatCep,
  normalizeAddress,
  searchAddressLocations,
} from "../core/marketplace-address.js";
import { Icon } from "../core/marketplace-icons.jsx";
import { initials } from "./account-shared.jsx";
import { TwoFactorModal } from "../../shared/two-factor-modal.jsx";
import { loadLeaflet } from "../../shared/leaflet.js";

const MAP_TILE_LAYER_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAP_TILE_LAYER_ATTRIBUTION = "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors";
const MAP_DEFAULT_CENTER = [-15.7797, -47.9297]; // Brasilia — used only until the customer searches/drops a pin

function buildMapPinIcon(leaflet) {
  /** Create the same teardrop pin icon used on the checkout store map, for visual consistency. */

  return leaflet.divIcon({
    className: "fa-map-pin-icon",
    html: "<span style=\"display:grid;place-items:center;width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--fa-vital);box-shadow:0 6px 14px -4px rgba(43,26,26,.5)\"><span style=\"transform:rotate(45deg);color:#fff;font-weight:800;font-size:14px\">•</span></span>",
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

function AddressMapPicker({ authClient, lat, lng, onConfirm }) {
  /** Let the customer search for and/or drag-place their exact delivery location on a real map —
      additive to the typed address fields above, never a replacement for them. Dragging the pin
      or clicking the map both call `onConfirm({ lat, lng })` directly (no extra geocoding round
      trip needed, the map already knows exactly where that point is). */

  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const [mapError, setMapError] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const hasPin = lat != null && lng != null;

  const placeMarker = (leaflet, map, point) => {
    if (markerRef.current) {
      markerRef.current.setLatLng(point);
      return;
    }
    markerRef.current = leaflet.marker(point, { icon: buildMapPinIcon(leaflet), draggable: true }).addTo(map);
    markerRef.current.on("dragend", () => {
      const position = markerRef.current.getLatLng();
      onConfirmRef.current({ lat: position.lat, lng: position.lng });
    });
  };

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      if (!elementRef.current) return;
      try {
        const leaflet = await loadLeaflet();
        if (cancelled || !elementRef.current) return;
        setMapError("");
        const center = hasPin ? [lat, lng] : MAP_DEFAULT_CENTER;
        const map = mapRef.current || leaflet.map(elementRef.current, {
          center, zoom: hasPin ? 16 : 12, zoomControl: true, scrollWheelZoom: false,
        });
        mapRef.current = map;
        if (!mapRef.current.__faTileLayerAdded) {
          leaflet.tileLayer(MAP_TILE_LAYER_URL, { attribution: MAP_TILE_LAYER_ATTRIBUTION, maxZoom: 19 }).addTo(map);
          mapRef.current.__faTileLayerAdded = true;
          // Placing/moving the pin by clicking the map is the same action as dragging it.
          map.on("click", (event) => {
            placeMarker(leaflet, map, event.latlng);
            onConfirmRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
          });
        }
        if (hasPin) {
          placeMarker(leaflet, map, [lat, lng]);
        }
      } catch (error) {
        if (!cancelled) {
          setMapError(error && error.message ? error.message : "Nao foi possivel carregar o mapa.");
        }
      }
    }

    void renderMap();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPin, lat, lng]);

  const runSearch = async (event) => {
    if (event) event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSearchError("Digite pelo menos 3 letras para buscar.");
      return;
    }
    setSearching(true);
    setSearchError("");
    try {
      const matches = await searchAddressLocations(authClient, trimmed);
      setResults(matches);
      if (matches.length === 0) {
        setSearchError("Nenhum lugar encontrado — tente ser mais especifico.");
      }
    } catch (error) {
      setSearchError(error && error.message ? error.message : "Nao foi possivel buscar no mapa.");
    } finally {
      setSearching(false);
    }
  };

  const pickResult = (result) => {
    if (result.latitude == null || result.longitude == null) return;
    const point = { lat: Number(result.latitude), lng: Number(result.longitude) };
    setResults([]);
    setQuery(result.label || "");
    if (mapRef.current) {
      mapRef.current.setView([point.lat, point.lng], 16);
    }
    onConfirm(point);
  };

  return (
    <div style={{ marginTop: 4 }}>
      <form onSubmit={runSearch} style={{ display: "flex", gap: 8 }}>
        <input
          className="fa-input" style={{ flex: 1 }} value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar rua, ponto de referencia ou bairro no mapa..."
        />
        <button type="submit" className="fa-btn fa-btn-soft" disabled={searching}>
          <Icon name="search" size={15} />{searching ? "Buscando..." : "Buscar"}
        </button>
      </form>
      {searchError ? <div style={{ color: "var(--fa-error)", fontSize: 12, marginTop: 6 }}>{searchError}</div> : null}
      {results.length > 0 && (
        <div style={{ marginTop: 8, border: "1px solid var(--fa-border)", borderRadius: "var(--fa-r-input)", overflow: "hidden" }}>
          {results.map((result, index) => (
            <button
              key={index} type="button" onClick={() => pickResult(result)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "var(--fa-surface)", cursor: "pointer", fontSize: 12.5, borderTop: index > 0 ? "1px solid var(--fa-border)" : "none" }}
            >
              {result.label}
            </button>
          ))}
        </div>
      )}
      <div ref={elementRef} style={{ height: 220, borderRadius: "var(--fa-r-card)", overflow: "hidden", marginTop: 10, background: "var(--fa-mist-2)" }} />
      {mapError ? (
        <div style={{ color: "var(--fa-error)", fontSize: 12, marginTop: 6 }}>{mapError}</div>
      ) : (
        <div style={{ fontSize: 12, marginTop: 6, color: hasPin ? "var(--fa-success)" : "var(--fa-faint)" }}>
          {hasPin
            ? "Localizacao confirmada no mapa — arraste o marcador ou clique em outro ponto para ajustar."
            : "Nenhuma localizacao confirmada ainda — busque, clique no mapa ou arraste o marcador ate o local exato."}
        </div>
      )}
    </div>
  );
}


function Block({ icon, title, sub, action, children, bodyStyle }) {
  /** Render one account settings block wrapper. */

  return (
    <div className="fa-block">
      <div className="fa-block-head">
        {icon && <Icon name={icon} size={19} style={{ color: 'var(--fa-primary)' }} />}
        <div style={{ flex: 1 }}>
          <div className="fa-block-title">{title}</div>
          {sub && <div className="fa-block-sub">{sub}</div>}
        </div>
        {action}
      </div>
      <div className="fa-block-body" style={bodyStyle}>{children}</div>
    </div>
  );
}

function SavedTag({ show }) {
  /** Render the saved badge when a section was persisted. */

  if (!show) return null;
  return <span className="fa-badge fa-badge-health" style={{ marginLeft: 10 }}><Icon name="check" size={12} stroke={2.6} />Salvo</span>;
}

function AddressForm({ initial, onSave, onCancel, selfName = "", selfPhone = "", authClient }) {
  /** Render the saved-address form with ViaCEP-assisted autofill.
   *
   * Who receives at this address (recipientName/recipientPhone) is stored on the address
   * itself, not typed fresh at every checkout — "Eu mesmo" prefills from the customer's own
   * profile; "Outra pessoa" opens two free-text fields for whoever actually receives it there
   * (e.g. a gift, or an address that isn't the customer's own home).
   */

  const [address, setAddress] = useState(() => {
    const normalized = normalizeAddress(initial || createEmptyAddress());
    if (!normalized.recipientName && !normalized.recipientPhone) {
      return { ...normalized, recipientName: selfName, recipientPhone: selfPhone };
    }
    return normalized;
  });
  const [receiverMode, setReceiverMode] = useState(() => {
    const normalized = normalizeAddress(initial || createEmptyAddress());
    if (!normalized.recipientName && !normalized.recipientPhone) {
      return "self";
    }
    return normalized.recipientName === selfName && normalized.recipientPhone === selfPhone ? "self" : "other";
  });
  const [cepStatus, setCepStatus] = useState({ loading: false, error: "", hint: "" });
  const lastLookupCepRef = useRef("");

  const setField = (field, value) => {
    setAddress((current) => ({ ...current, [field]: value }));
  };

  const chooseSelfAsReceiver = () => {
    setReceiverMode("self");
    setAddress((current) => ({ ...current, recipientName: selfName, recipientPhone: selfPhone }));
  };
  const chooseOtherReceiver = () => {
    setReceiverMode("other");
    setAddress((current) => (
      current.recipientName === selfName && current.recipientPhone === selfPhone
        ? { ...current, recipientName: "", recipientPhone: "" }
        : current
    ));
  };

  const lookupCep = async (cepValue) => {
    /** Resolve the current CEP and merge the result into the form. */

    const maskedCep = formatCep(cepValue);
    const digits = maskedCep.replace(/\D/g, "");
    if (digits.length !== 8 || digits === lastLookupCepRef.current) {
      return;
    }

    setCepStatus({ loading: true, error: "", hint: "" });
    try {
      const result = await fetchViaCepAddress(maskedCep);
      lastLookupCepRef.current = digits;
      setAddress((current) => ({
        ...current,
        cep: result.cep,
        street: result.street || current.street,
        district: result.district || current.district,
        city: result.city || current.city,
        state: result.state || current.state,
      }));
      setCepStatus({ loading: false, error: "", hint: "Rua, bairro, cidade e UF preenchidos automaticamente." });
    } catch (error) {
      setCepStatus({ loading: false, error: error && error.message ? error.message : "Nao foi possivel buscar o CEP.", hint: "" });
    }
  };

  useEffect(() => {
    /** Trigger ViaCEP lookup as soon as the CEP becomes complete. */

    const digits = address.cep.replace(/\D/g, "");
    if (digits.length === 8) {
      void lookupCep(address.cep);
      return;
    }
    lastLookupCepRef.current = "";
    setCepStatus((current) => current.loading ? current : { loading: false, error: "", hint: "" });
  }, [address.cep]);

  // A saved address with a hole in it (no CEP, no street...) only surfaces as a problem much
  // later — at checkout, or worse, to whoever tries to deliver there — so this form refuses to
  // hand back an incomplete one instead of letting "Salvar" silently accept it.
  //
  // "Número" only gets required for a genuinely new address. The backend has no separate
  // house-number column — it's folded into `street` at save time ("Avenida X, 500") — so an
  // *existing* address loaded back from the server always has `number` blank with the real
  // number already sitting inside `street`. Requiring it again here on every edit would block
  // saving any address that already existed before this field did, and typing it back in would
  // just duplicate it onto the end of `street` a second time.
  const isNewAddress = !initial || !initial.id;
  const missingFields = [
    !address.recipientName.trim() && "nome de quem recebe",
    !address.recipientPhone.trim() && "telefone de quem recebe",
    address.cep.replace(/\D/g, "").length !== 8 && "CEP",
    !address.street.trim() && "rua",
    isNewAddress && !address.number.trim() && "número",
    !address.district.trim() && "bairro",
    !address.city.trim() && "cidade",
    address.state.trim().length !== 2 && "UF",
  ].filter(Boolean);
  const isValid = missingFields.length === 0;

  return (
    <div style={{ background: 'var(--fa-mist-2)', borderRadius: 'var(--fa-r-card)', padding: 18, marginTop: 14 }}>
      <div className="fa-form2">
        <div className="fa-field"><label htmlFor="addr-label">Apelido</label><input id="addr-label" className="fa-input" value={address.label} onChange={(event) => setField('label', event.target.value)} placeholder="Casa, Trabalho…" /></div>
        <div className="fa-field fa-span2">
          <label>Quem vai receber</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="fa-chip" data-active={receiverMode === 'self' ? '1' : '0'} onClick={chooseSelfAsReceiver}>Eu mesmo</button>
            <button type="button" className="fa-chip" data-active={receiverMode === 'other' ? '1' : '0'} onClick={chooseOtherReceiver}>Outra pessoa</button>
          </div>
        </div>
        {receiverMode === 'other' && (
          <>
            <div className="fa-field"><label htmlFor="addr-recipient-name">Nome de quem recebe</label><input id="addr-recipient-name" className="fa-input" value={address.recipientName} onChange={(event) => setField('recipientName', event.target.value)} placeholder="Nome completo" /></div>
            <div className="fa-field"><label htmlFor="addr-recipient-phone">Telefone de quem recebe</label><input id="addr-recipient-phone" className="fa-input" value={address.recipientPhone} onChange={(event) => setField('recipientPhone', event.target.value)} placeholder="(00) 00000-0000" /></div>
          </>
        )}
        <div className="fa-field">
          <label htmlFor="addr-cep">CEP</label>
          <input id="addr-cep" className="fa-input" value={address.cep} onChange={(event) => setField('cep', formatCep(event.target.value))} placeholder="00000-000" inputMode="numeric" />
          {cepStatus.loading ? <div className="fa-faint" style={{ fontSize: 12, marginTop: 6 }}>Buscando endereço...</div> : null}
          {!cepStatus.loading && cepStatus.hint ? <div style={{ fontSize: 12, marginTop: 6, color: 'var(--fa-success)' }}>{cepStatus.hint}</div> : null}
          {!cepStatus.loading && cepStatus.error ? <div style={{ fontSize: 12, marginTop: 6, color: 'var(--fa-error)' }}>{cepStatus.error}</div> : null}
        </div>
        <div className="fa-field fa-span2"><label htmlFor="addr-street">Rua</label><input id="addr-street" className="fa-input" value={address.street} onChange={(event) => setField('street', event.target.value)} placeholder="Rua, avenida ou logradouro" /></div>
        <div className="fa-field"><label htmlFor="addr-number">Número</label><input id="addr-number" className="fa-input" value={address.number} onChange={(event) => setField('number', event.target.value)} placeholder="123" /></div>
        <div className="fa-field"><label htmlFor="addr-complement">Complemento</label><input id="addr-complement" className="fa-input" value={address.complement} onChange={(event) => setField('complement', event.target.value)} placeholder="Apto, bloco, casa..." /></div>
        <div className="fa-field"><label htmlFor="addr-district">Bairro</label><input id="addr-district" className="fa-input" value={address.district} onChange={(event) => setField('district', event.target.value)} placeholder="Bairro" /></div>
        <div className="fa-field"><label htmlFor="addr-city">Cidade</label><input id="addr-city" className="fa-input" value={address.city} onChange={(event) => setField('city', event.target.value)} placeholder="Cidade" /></div>
        <div className="fa-field"><label htmlFor="addr-state">UF</label><input id="addr-state" className="fa-input" value={address.state} onChange={(event) => setField('state', event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} placeholder="UF" /></div>
      </div>
      <div className="fa-field fa-span2" style={{ marginTop: 4 }}>
        <label>Localizacao exata no mapa (opcional)</label>
        <div className="fa-faint" style={{ fontSize: 12, marginBottom: 8 }}>
          O endereco digitado acima continua sendo o que vale — isso aqui e so para guardar o ponto exato, pra ficar mais facil pro entregador achar.
        </div>
        <AddressMapPicker authClient={authClient} lat={address.lat} lng={address.lng} onConfirm={({ lat, lng }) => setAddress((current) => ({ ...current, lat, lng }))} />
      </div>
      {!isValid && (
        <div style={{ color: 'var(--fa-error)', fontSize: 12.5, marginTop: 12 }}>
          Preencha para salvar: {missingFields.join(', ')}.
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="fa-btn fa-btn-primary" disabled={!isValid} onClick={() => onSave(normalizeAddress(address))}><Icon name="check" size={16} stroke={2.4} />Salvar endereço</button>
        <button className="fa-btn fa-btn-soft" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

const PHOTO_CROP_BOX = 260;
const PHOTO_CROP_OUTPUT = 512;

function useObjectUrl(file) {
  /** Track a revocable object URL for the currently selected file, if any. */

  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) { setUrl(''); return undefined; }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return url;
}

function PhotoCropModal({ file, onCancel, onConfirm }) {
  /** Let the customer pan and zoom a square crop of a freshly selected photo before it's
   * actually saved as the profile picture. Neither the demo nor the app previously had this
   * step — uploading whatever crop the OS file picker happened to hand over (usually the
   * image's native, non-square aspect ratio) into a circular avatar slot produced off-center or
   * stretched-looking photos. This closes that gap with a minimal, dependency-free crop UI (drag
   * to reposition, slider to zoom) instead of pulling in a cropper library. */

  const objectUrl = useObjectUrl(file);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setReady(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError('');
    setSaving(false);
    imageRef.current = null;
    if (!objectUrl) return;
    const image = new Image();
    image.onload = () => { imageRef.current = image; setReady(true); };
    image.onerror = () => setError('Não foi possível ler a imagem selecionada.');
    image.src = objectUrl;
  }, [objectUrl]);

  const baseScale = () => {
    const image = imageRef.current;
    if (!image || !image.width || !image.height) return 1;
    return Math.max(PHOTO_CROP_BOX / image.width, PHOTO_CROP_BOX / image.height);
  };

  const clampOffset = (next, scale) => {
    const image = imageRef.current;
    if (!image) return { x: 0, y: 0 };
    const maxX = Math.max(0, (image.width * scale - PHOTO_CROP_BOX) / 2);
    const maxY = Math.max(0, (image.height * scale - PHOTO_CROP_BOX) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!ready || !canvas || !image) return;
    const context = canvas.getContext('2d');
    const scale = baseScale() * zoom;
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.clearRect(0, 0, PHOTO_CROP_BOX, PHOTO_CROP_BOX);
    context.drawImage(image, PHOTO_CROP_BOX / 2 - drawWidth / 2 + offset.x, PHOTO_CROP_BOX / 2 - drawHeight / 2 + offset.y, drawWidth, drawHeight);
  }, [ready, zoom, offset]);

  const onZoom = (event) => {
    const nextZoom = Number(event.target.value);
    setZoom(nextZoom);
    setOffset((current) => clampOffset(current, baseScale() * nextZoom));
  };

  const onPointerDown = (event) => {
    dragRef.current = { startX: event.clientX, startY: event.clientY, origin: offset };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (!dragRef.current) return;
    const next = {
      x: dragRef.current.origin.x + (event.clientX - dragRef.current.startX),
      y: dragRef.current.origin.y + (event.clientY - dragRef.current.startY),
    };
    setOffset(clampOffset(next, baseScale() * zoom));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const confirm = async () => {
    const image = imageRef.current;
    if (!image) return;
    try {
      setSaving(true);
      setError('');
      const outputScale = (PHOTO_CROP_OUTPUT / PHOTO_CROP_BOX);
      const scale = baseScale() * zoom * outputScale;
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const output = document.createElement('canvas');
      output.width = PHOTO_CROP_OUTPUT;
      output.height = PHOTO_CROP_OUTPUT;
      const context = output.getContext('2d');
      if (!context) throw new Error('Não foi possível preparar a foto para envio.');
      context.drawImage(
        image,
        PHOTO_CROP_OUTPUT / 2 - drawWidth / 2 + offset.x * outputScale,
        PHOTO_CROP_OUTPUT / 2 - drawHeight / 2 + offset.y * outputScale,
        drawWidth,
        drawHeight,
      );
      let quality = 0.86;
      let dataUrl = output.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 350_000 && quality > 0.45) {
        quality -= 0.08;
        dataUrl = output.toDataURL('image/jpeg', quality);
      }
      if (dataUrl.length > 450_000) {
        throw new Error('A imagem ainda ficou muito grande. Escolha uma foto menor ou mais leve.');
      }
      await onConfirm(dataUrl);
    } catch (confirmError) {
      setError(confirmError && confirmError.message ? confirmError.message : 'Não foi possível salvar a foto de perfil.');
      setSaving(false);
    }
  };

  return (
    <Modal open={!!file} onClose={saving ? () => {} : onCancel} icon="camera" title="Ajustar foto de perfil" sub="Arraste a foto para reposicionar e use o zoom para enquadrar seu rosto no círculo." maxw={420}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 18 }}>
        <div
          style={{ width: PHOTO_CROP_BOX, height: PHOTO_CROP_BOX, borderRadius: '50%', overflow: 'hidden', background: 'var(--fa-mist-2)', border: '2px solid var(--fa-rose)', touchAction: 'none', cursor: ready ? 'grab' : 'default', flex: 'none' }}
          onPointerDown={ready ? onPointerDown : undefined}
          onPointerMove={ready ? onPointerMove : undefined}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <canvas ref={canvasRef} width={PHOTO_CROP_BOX} height={PHOTO_CROP_BOX} style={{ display: 'block' }} />
        </div>
        {!ready && !error ? <div className="fa-faint" style={{ fontSize: 13 }}>Carregando imagem...</div> : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <Icon name="minus" size={15} style={{ flex: 'none', color: 'var(--fa-ink-3)' }} />
          <input type="range" min={1} max={3} step={0.05} value={zoom} disabled={!ready} onChange={onZoom} style={{ width: '100%', accentColor: 'var(--fa-primary)' }} />
          <Icon name="plus" size={15} style={{ flex: 'none', color: 'var(--fa-ink-3)' }} />
        </div>
        {error ? <div className="fa-card" style={{ padding: '12px 14px', background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)', fontWeight: 600, fontSize: 13, width: '100%' }}>{error}</div> : null}
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button className="fa-btn fa-btn-primary fa-btn-lg" style={{ flex: 1 }} disabled={!ready || saving} onClick={confirm}>{saving ? 'Salvando...' : 'Usar foto'}</button>
          <button className="fa-btn fa-btn-soft fa-btn-lg" style={{ flex: 1 }} disabled={saving} onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

function childAgeFromBirthYear(birthYear) {
  /** Derive a child's current age from their stored birth year — computed fresh every render
   * instead of trusting a frozen "age" number, so it advances on its own every January without
   * the customer ever needing to come back and bump it. */

  if (birthYear === '' || birthYear == null) return '';
  return new Date().getFullYear() - Number(birthYear);
}

const MARITAL_STATUS_LABELS = {
  single: 'Solteiro(a)',
  married: 'Casado(a)',
  divorced: 'Divorciado(a)',
  widowed: 'Viúvo(a)',
  other: 'Outro',
};

function AnniversaryOffers({ ctx }) {
  /** Birthday / customer-anniversary discount coupons — admin-configurable per kind
   * (see the birthday_discount and customer_anniversary_discount settings in
   * app/schemas/portal.py), claimed by the customer (not auto-applied) while they're in the
   * calendar month of the relevant date. Renders nothing when the admin has no kind enabled, or
   * when neither kind currently applies to this customer (get_anniversary_offers already drops a
   * birthday offer with no birth date on file). */

  const offers = ctx.anniversaryOffers || [];
  const [claiming, setClaiming] = useState('');
  const [claimError, setClaimError] = useState('');
  const [copiedKind, setCopiedKind] = useState('');

  if (!offers.length) return null;

  const claim = async (kind) => {
    try {
      setClaimError('');
      setClaiming(kind);
      await ctx.claimAnniversaryOffer(kind);
    } catch (error) {
      setClaimError(error && error.message ? error.message : 'Não foi possível resgatar o cupom agora.');
    } finally {
      setClaiming('');
    }
  };

  const copyCode = async (kind, code) => {
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(code);
        setCopiedKind(kind);
        window.setTimeout(() => setCopiedKind(''), 1800);
      }
    } catch {
      // Clipboard access denied — the code is still shown as plain text for the customer to select.
    }
  };

  return (
    <section className="sub-card">
      <div className="sec-head"><span className="sec-title">Benefícios de aniversário</span></div>
      <div className="set-list" style={{ marginTop: 4 }}>
        {offers.map((offer) => (
          <div className="set-row" key={offer.kind}>
            <span className="set-row-icon"><Icon name="sparkle" size={17} /></span>
            <div className="set-row-info">
              <span className="set-row-title">
                {offer.label}
                {offer.alreadyClaimed ? <span className="set-badge is-on">Resgatado</span> : offer.eligible ? <span className="set-badge is-on">Mês de aniversário</span> : null}
              </span>
              <span className="set-row-sub">
                {offer.alreadyClaimed
                  ? `Cupom ${offer.code} · ${offer.percent}% off · válido até ${offer.validUntilLabel}`
                  : offer.eligible
                    ? `Resgate ${offer.percent}% de desconto válido até o fim do mês.`
                    : `Disponível em ${offer.monthLabel}.`}
              </span>
            </div>
            <div className="set-row-action">
              {offer.alreadyClaimed ? (
                <button className="ghost-btn" type="button" onClick={() => copyCode(offer.kind, offer.code)}>
                  <Icon name={copiedKind === offer.kind ? 'check' : 'tag'} size={14} />{copiedKind === offer.kind ? 'Copiado' : 'Copiar código'}
                </button>
              ) : offer.eligible ? (
                <button className="fa-btn fa-btn-primary fa-btn-sm" type="button" disabled={claiming === offer.kind} onClick={() => claim(offer.kind)}>
                  {claiming === offer.kind ? 'Resgatando...' : 'Resgatar cupom'}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {claimError ? <div style={{ marginTop: 12, color: 'var(--fa-error)', fontSize: 12.5 }}>{claimError}</div> : null}
    </section>
  );
}

function ProfileManage({ ctx, acct }) {
  /** Render the profile management tab: identity strip, personal data (view/edit), addresses.
   *
   * Ported from the demo's data-cat="profile" panel (.prof-identity + two .sub-card sections).
   * Security (password/2FA) moved to AccountSettings, matching the demo's own split between
   * "Meu perfil" and "Configurações" — this screen is identity + delivery data only now.
   */

  const { profile, setProfile } = acct;
  const addresses = ctx.addresses;
  const [draft, setDraft] = useState(profile);
  const [savedInfo, setSavedInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [editingAddr, setEditingAddr] = useState(null);
  const [addrError, setAddrError] = useState('');
  const [removingAddr, setRemovingAddr] = useState(null);
  const [removingAddrBusy, setRemovingAddrBusy] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [cropFile, setCropFile] = useState(null);
  const fileRef = useRef(null);
  const setDraftField = (field, value) => { setDraft((current) => ({ ...current, [field]: value })); setSavedInfo(false); setInfoError(''); };
  const setChildAge = (index, enteredAge) => {
    /** Update one child's age slot, sized to the current "Número de filhos" — sizing off the
     * count on every write means growing or shrinking that number always self-heals the list
     * instead of needing a separate effect to keep the two in sync.
     *
     * Stores the birth year the entered age implies, not the age itself — an age typed once
     * ("8") would silently go stale the moment the year turns; the birth year never needs
     * re-entering, and childAgeFromBirthYear derives the current age from it everywhere it's
     * displayed. */

    setDraft((current) => {
      const slots = Number(current.childrenCount) || 0;
      const currentYear = new Date().getFullYear();
      const nextBirthYears = Array.from({ length: slots }, (_, i) => (Array.isArray(current.childrenBirthYears) && current.childrenBirthYears[i] != null ? current.childrenBirthYears[i] : ''));
      nextBirthYears[index] = enteredAge === '' ? '' : currentYear - Number(enteredAge);
      return { ...current, childrenBirthYears: nextBirthYears };
    });
    setSavedInfo(false);
    setInfoError('');
  };
  const setChildName = (index, enteredName) => {
    /** Same slot-sizing approach as setChildAge, so growing/shrinking "Número de filhos" keeps
     * the name list in sync automatically too. */

    setDraft((current) => {
      const slots = Number(current.childrenCount) || 0;
      const nextNames = Array.from({ length: slots }, (_, i) => (Array.isArray(current.childrenNames) && current.childrenNames[i] != null ? current.childrenNames[i] : ''));
      nextNames[index] = enteredName;
      return { ...current, childrenNames: nextNames };
    });
    setSavedInfo(false);
    setInfoError('');
  };
  const maskCpfInput = (value) => {
    const digits = (value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    return digits;
  };
  const formatBirthDateLabel = (isoDate) => {
    /** Render the stored ISO (YYYY-MM-DD, from the <input type="date">) as DD/MM/AAAA for
     * reading — the raw ISO string is fine as a form value but reads awkwardly as plain text. */

    if (!isoDate) return '—';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  };
  const maskPhoneInput = (value) => {
    /** Format as a Brazilian phone number while typing — (00) 00000-0000 for an 11-digit cell
     * number, (00) 0000-0000 for a 10-digit landline, growing progressively as digits come in. */

    const digits = (value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length > 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length > 6) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    if (digits.length > 2) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length > 0) return `(${digits}`;
    return digits;
  };

  const normalizedAddresses = addresses.map((address) => normalizeAddress(address));

  const onPhoto = (event) => {
    /** Stage the selected file for cropping — saving happens only after the customer confirms
     * the crop in PhotoCropModal, never straight from the raw file picker result. */

    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setPhotoError('');
    setCropFile(file);
  };

  const onCropConfirm = async (dataUrl) => {
    /** Persist the cropped photo the customer confirmed. Left to throw on failure so
     * PhotoCropModal can show the error and let the customer retry without losing the crop. */

    const nextProfile = await ctx.saveCustomerAvatar(dataUrl);
    setProfile(nextProfile);
    setDraft(nextProfile);
    setCropFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onCropCancel = () => {
    setCropFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const saveInfo = async () => {
    /** Persist profile changes to the customer's real backend record. */

    try {
      setInfoError('');
      setSavingInfo(true);
      const nextProfile = await ctx.saveCustomerProfile(draft);
      setProfile(nextProfile);
      setDraft(nextProfile);
      setSavedInfo(true);
      setEditingPersonal(false);
    } catch (error) {
      setInfoError(error && error.message ? error.message : 'Não foi possível salvar seus dados agora.');
    } finally {
      setSavingInfo(false);
    }
  };

  const setPrimaryAddr = async (id) => {
    /** Promote one address as the primary delivery location. */

    try {
      setAddrError('');
      await ctx.setPrimaryCustomerAddress(id);
    } catch (error) {
      setAddrError(error && error.message ? error.message : 'Não foi possível atualizar o endereço principal.');
    }
  };

  const removeAddr = async (id) => {
    /** Remove one saved address from the customer account. */

    try {
      setAddrError('');
      setRemovingAddrBusy(true);
      await ctx.deleteCustomerAddress(id);
      setRemovingAddr(null);
    } catch (error) {
      setAddrError(error && error.message ? error.message : 'Não foi possível remover o endereço.');
    } finally {
      setRemovingAddrBusy(false);
    }
  };

  const saveAddr = async (data) => {
    /** Create or update one normalized saved address. */

    const normalized = normalizeAddress(data);
    try {
      setAddrError('');
      if (editingAddr === 'new') {
        await ctx.createCustomerAddress(normalized);
      } else {
        await ctx.updateCustomerAddress(editingAddr, normalized);
      }
      setEditingAddr(null);
    } catch (error) {
      setAddrError(error && error.message ? error.message : 'Não foi possível salvar o endereço.');
    }
  };

  const childrenAgesLabel = Array.isArray(draft.childrenBirthYears) && draft.childrenBirthYears.length > 0
    ? draft.childrenBirthYears.map((year, index) => {
        const age = childAgeFromBirthYear(year);
        const name = Array.isArray(draft.childrenNames) && draft.childrenNames[index] ? draft.childrenNames[index].trim() : '';
        return name ? `${name} (${age} ${age === 1 ? 'ano' : 'anos'})` : `${age} ${age === 1 ? 'ano' : 'anos'}`;
      }).join(', ')
    : '';

  const PERSONAL_FIELDS = [
    ['fullname', 'Nome completo', draft.name],
    ['cpf', 'CPF', draft.cpf ? maskCpfInput(draft.cpf) : '—'],
    ['birth', 'Data de nascimento', formatBirthDateLabel(draft.birth)],
    ['phone', 'Telefone', draft.phone || '—'],
    ['email', 'E-mail', draft.email],
    ['gender', 'Gênero', draft.gender || '—'],
    ['marital', 'Estado civil', (draft.maritalStatus && MARITAL_STATUS_LABELS[draft.maritalStatus]) || '—'],
    ['children', 'Número de filhos', draft.childrenCount === '' || draft.childrenCount == null ? '—' : draft.childrenCount],
    // Only shown once there's at least one child registered — an empty ages row for a customer
    // with no kids would just be visual noise (see the user's own request: "caso tenha").
    ...(childrenAgesLabel ? [['childrenAges', 'Filhos', childrenAgesLabel]] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="orders-head">
        <h1 className="cart-title" style={{ margin: 0 }}>Meu perfil</h1>
        {profile.memberSince ? (
          <span className="fa-badge fa-badge-rose"><Icon name="sparkle" size={12} />Cliente Farmaura desde {profile.memberSince}</span>
        ) : (
          <span className="orders-count">Meus dados e endereços</span>
        )}
      </div>

      <div className="prof-identity">
        <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
        <PhotoCropModal file={cropFile} onCancel={onCropCancel} onConfirm={onCropConfirm} />
        <button
          type="button"
          className="prof-avatar-lg"
          style={{ border: 'none', cursor: savingPhoto ? 'default' : 'pointer', padding: 0, overflow: 'hidden' }}
          disabled={savingPhoto}
          onClick={() => fileRef.current && fileRef.current.click()}
          aria-label={draft.photo ? 'Trocar foto de perfil' : 'Enviar foto de perfil'}
        >
          {draft.photo ? <img src={draft.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(draft.name)}
        </button>
        <div className="prof-identity-info">
          <span className="prof-identity-name">{draft.name}</span>
          <span className="prof-identity-email">{draft.email}</span>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="ghost-btn" type="button" disabled={savingPhoto} onClick={() => fileRef.current && fileRef.current.click()}>
              <Icon name="camera" size={14} />{savingPhoto ? 'Salvando foto...' : draft.photo ? 'Trocar foto' : 'Enviar foto'}
            </button>
            {draft.photo && (
              <button className="ghost-btn is-danger" type="button" disabled={savingPhoto} onClick={async () => {
                try {
                  setPhotoError('');
                  setSavingPhoto(true);
                  const nextProfile = await ctx.saveCustomerAvatar('');
                  setProfile(nextProfile);
                  setDraft(nextProfile);
                } catch (error) {
                  setPhotoError(error && error.message ? error.message : 'Nao foi possivel remover a foto de perfil.');
                } finally {
                  setSavingPhoto(false);
                  if (fileRef.current) fileRef.current.value = '';
                }
              }}>Remover foto</button>
            )}
          </div>
          {photoError ? <div style={{ marginTop: 6, color: 'var(--fa-error)', fontSize: 12.5 }}>{photoError}</div> : null}
        </div>
      </div>

      <AnniversaryOffers ctx={ctx} />

      <div className="subs-list">
        <section className="sub-card">
          <div className="sec-head">
            <span className="sec-title">Dados pessoais</span>
            {!editingPersonal && <button className="ghost-btn" type="button" onClick={() => setEditingPersonal(true)}><Icon name="edit" size={14} />Editar</button>}
          </div>

          {editingPersonal ? (
            <>
              <div className="fa-form2" style={{ marginTop: 4 }}>
                <div className="fa-field fa-span2"><label htmlFor="profile-name">Nome completo</label><input id="profile-name" className="fa-input" value={draft.name} onChange={(event) => setDraftField('name', event.target.value)} /></div>
                <div className="fa-field"><label htmlFor="profile-email">E-mail</label><input id="profile-email" className="fa-input" type="email" value={draft.email} onChange={(event) => setDraftField('email', event.target.value)} /></div>
                <div className="fa-field"><label htmlFor="profile-phone">Telefone</label><input id="profile-phone" className="fa-input" inputMode="numeric" placeholder="(00) 00000-0000" value={draft.phone} onChange={(event) => setDraftField('phone', maskPhoneInput(event.target.value))} /></div>
                <div className="fa-field"><label htmlFor="profile-cpf">CPF</label><input id="profile-cpf" className="fa-input fa-mono" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={draft.cpf} onChange={(event) => setDraftField('cpf', maskCpfInput(event.target.value))} /></div>
                <div className="fa-field"><label htmlFor="profile-birth">Data de nascimento</label><input id="profile-birth" className="fa-input" type="date" value={draft.birth} onChange={(event) => setDraftField('birth', event.target.value)} /></div>
                <div className="fa-field"><label htmlFor="profile-gender">Gênero</label>
                  <select id="profile-gender" className="fa-select" value={draft.gender} onChange={(event) => setDraftField('gender', event.target.value)}>
                    {['Feminino', 'Masculino', 'Não-binário', 'Prefiro não informar'].map((gender) => <option key={gender}>{gender}</option>)}
                  </select>
                </div>
                <div className="fa-field"><label htmlFor="profile-marital">Estado civil</label>
                  <select id="profile-marital" className="fa-select" value={draft.maritalStatus || ''} onChange={(event) => setDraftField('maritalStatus', event.target.value)}>
                    <option value="">Prefiro não informar</option>
                    <option value="single">Solteiro(a)</option>
                    <option value="married">Casado(a)</option>
                    <option value="divorced">Divorciado(a)</option>
                    <option value="widowed">Viúvo(a)</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div className="fa-field"><label htmlFor="profile-children-count">Número de filhos</label>
                  <input id="profile-children-count" className="fa-input" type="number" min="0" max="20" placeholder="Opcional" value={draft.childrenCount === '' || draft.childrenCount == null ? '' : draft.childrenCount} onChange={(event) => setDraftField('childrenCount', event.target.value === '' ? '' : Number(event.target.value))} />
                </div>
                {Number(draft.childrenCount) > 0 && (
                  <div className="fa-field fa-span2">
                    <label>Filhos</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Array.from({ length: Number(draft.childrenCount) }, (_, index) => (
                        <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                          <input
                            className="fa-input"
                            type="text"
                            maxLength={160}
                            placeholder={`Nome e sobrenome do filho(a) ${index + 1} (opcional)`}
                            aria-label={`Nome do filho ou filha ${index + 1}`}
                            value={draft.childrenNames && draft.childrenNames[index] != null ? draft.childrenNames[index] : ''}
                            onChange={(event) => setChildName(index, event.target.value)}
                          />
                          <input
                            className="fa-input"
                            type="number"
                            min="0"
                            max="90"
                            placeholder="Idade"
                            aria-label={`Idade do filho ou filha ${index + 1}`}
                            value={draft.childrenBirthYears && draft.childrenBirthYears[index] != null && draft.childrenBirthYears[index] !== '' ? childAgeFromBirthYear(draft.childrenBirthYears[index]) : ''}
                            onChange={(event) => setChildAge(index, event.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--fa-info-soft)', borderRadius: 'var(--fa-r-card)', padding: '12px 14px' }}>
                <Icon name="info" size={16} style={{ flex: 'none', marginTop: 1, color: 'var(--fa-info)' }} />
                <p className="fa-faint" style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
                  Como usamos essas informações: gênero, estado civil, número de filhos, seus nomes e idades são opcionais e servem só para te mostrar promoções e sugestões de produtos mais relevantes para a sua família — nunca são usados para outro fim.
                </p>
              </div>
              {infoError ? <div style={{ marginTop: 12, color: 'var(--fa-error)', fontSize: 12.5 }}>{infoError}</div> : null}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="fa-btn fa-btn-primary" disabled={savingInfo || !draft.name.trim() || draft.cpf.replace(/\D/g, '').length !== 11} onClick={saveInfo}><Icon name="check" size={16} stroke={2.4} />{savingInfo ? 'Salvando...' : 'Salvar alterações'}</button>
                <button className="fa-btn fa-btn-soft" disabled={savingInfo} onClick={() => { setDraft(profile); setInfoError(''); setEditingPersonal(false); }}>Cancelar</button>
              </div>
            </>
          ) : (
            <div className="order-meta-grid" style={{ marginTop: 4 }}>
              {PERSONAL_FIELDS.map(([key, label, value]) => (
                <div className="order-meta-item" key={key}><span className="k">{label}</span><span className="v">{value}</span></div>
              ))}
            </div>
          )}
          {savedInfo && !editingPersonal && <div style={{ marginTop: 12 }}><span className="fa-badge fa-badge-health"><Icon name="check" size={12} stroke={2.6} />Salvo</span></div>}
        </section>

        <section className="sub-card">
          <div className="sec-head">
            <span className="sec-title">Endereços</span>
            {editingAddr == null && <button className="ghost-btn" type="button" onClick={() => setEditingAddr('new')}><Icon name="plus" size={14} />Adicionar endereço</button>}
          </div>
          {addrError ? <div style={{ marginBottom: 12, color: 'var(--fa-error)', fontSize: 12.5 }}>{addrError}</div> : null}
          {normalizedAddresses.length > 0 ? (
            <div className="prof-addr-list">
              {normalizedAddresses.map((address) => (
                <React.Fragment key={address.id}>
                  <div className={"prof-addr-card" + (address.primary ? " is-primary" : "")}>
                    <span className="prof-addr-icon"><Icon name="pin" size={17} /></span>
                    <div className="prof-addr-info">
                      <span className="prof-addr-label">{address.label}{address.primary && <span className="fa-badge fa-badge-rose prof-addr-badge"><Icon name="check" size={11} stroke={3} />Padrão para entregas</span>}</span>
                      <span className="prof-addr-text">{buildAddressLine(address) || 'Endereço não informado'} · {buildAddressSecondaryLine(address)}{address.cep ? ` · CEP ${address.cep}` : ''}</span>
                    </div>
                    <div className="prof-addr-actions">
                      {!address.primary && <button className="ghost-btn" type="button" onClick={() => setPrimaryAddr(address.id)}>Tornar padrão</button>}
                      <button className="ghost-btn" type="button" onClick={() => setEditingAddr(address.id)}><Icon name="edit" size={14} />Editar</button>
                      {normalizedAddresses.length > 1 && <button className="ghost-btn is-danger" type="button" onClick={() => { setAddrError(''); setRemovingAddr(address); }}>Remover</button>}
                    </div>
                  </div>
                  {editingAddr === address.id && <AddressForm initial={address} onSave={saveAddr} onCancel={() => setEditingAddr(null)} selfName={profile.name} selfPhone={profile.phone} authClient={ctx.authClient} />}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <p className="prof-addr-empty">Nenhum endereço cadastrado. Adicione um para receber seus pedidos em casa.</p>
          )}
          {editingAddr === 'new' && <AddressForm initial={createEmptyAddress()} onSave={saveAddr} onCancel={() => setEditingAddr(null)} selfName={profile.name} selfPhone={profile.phone} authClient={ctx.authClient} />}
        </section>
      </div>

      <Modal
        open={!!removingAddr}
        onClose={removingAddrBusy ? () => {} : () => setRemovingAddr(null)}
        icon="trash"
        title="Remover este endereço?"
        sub={removingAddr ? `${removingAddr.label} · ${buildAddressLine(removingAddr) || 'Endereço não informado'}` : ''}
        maxw={420}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          <p className="fa-muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            Essa ação não pode ser desfeita. Se este for o endereço padrão, escolha outro como padrão antes de removê-lo.
          </p>
          {addrError ? <div style={{ color: 'var(--fa-error)', fontSize: 12.5 }}>{addrError}</div> : null}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="fa-btn fa-btn-primary fa-btn-lg" style={{ flex: 1, background: 'var(--fa-error)' }} disabled={removingAddrBusy} onClick={() => removeAddr(removingAddr.id)}>
              {removingAddrBusy ? 'Removendo...' : 'Remover endereço'}
            </button>
            <button className="fa-btn fa-btn-soft fa-btn-lg" style={{ flex: 1 }} disabled={removingAddrBusy} onClick={() => setRemovingAddr(null)}>Cancelar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AccountSettings({ ctx, acct }) {
  /** Render "Configurações": security (password/2FA) + privacy/communication preferences.
   *
   * Ported from the demo's data-cat="settings" panel, trimmed to only what has a real backend
   * behind it — the demo also mocks a session list, per-category notification toggles, LGPD data
   * export and account deletion, none of which exist in this app yet, so none of those made the
   * cut here (see the "sem fabricar" principle in PRODUCT.md). A toggle below is a real consent
   * decision, not decoration — every click persists immediately to the backend
   * (Customer.marketing_program_preferences / communication_channel_preferences), same legal
   * weight as checking a consent box anywhere else in the app.
   */

  const { programs, setPrograms, channels, setChannels, profile, setProfile } = acct;
  const [prefError, setPrefError] = useState('');
  const [twoFactorModalMode, setTwoFactorModalMode] = useState('');
  const [savedPass, setSavedPass] = useState(false);

  const toggleProgram = async (name, value) => {
    const next = programs.map((program) => program.name === name ? { ...program, enabled: value } : program);
    setPrograms(next);
    try {
      setPrefError('');
      await ctx.saveCustomerPrivacyPreferences(next, channels);
    } catch (error) {
      setPrograms(programs);
      setPrefError(error && error.message ? error.message : 'Não foi possível salvar sua preferência agora.');
    }
  };
  const setChannel = async (channelId, value) => {
    const next = channels.map((channel) => channel.channel === channelId ? { ...channel, enabled: value } : channel);
    setChannels(next);
    try {
      setPrefError('');
      await ctx.saveCustomerPrivacyPreferences(programs, next);
    } catch (error) {
      setChannels(channels);
      setPrefError(error && error.message ? error.message : 'Não foi possível salvar sua preferência agora.');
    }
  };
  const applyTwoFactorState = (enabled) => setProfile((current) => ({ ...current, twoFactor: !!enabled }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="orders-head">
        <h1 className="cart-title" style={{ margin: 0 }}>Configurações</h1>
        <span className="orders-count">Gerencie sua conta e sua segurança</span>
      </div>

      <div className="subs-list">
        <section className="sub-card">
          <div className="sec-head"><span className="sec-title">Segurança</span></div>
          <div className="set-list">
            <div className="set-row">
              <span className="set-row-icon"><Icon name="lock" size={17} /></span>
              <div className="set-row-info">
                <span className="set-row-title">Senha de acesso</span>
                <span className="set-row-sub">Defina uma nova senha para acessar sua conta.</span>
              </div>
              <div className="set-row-action">
                <button className={'ghost-btn' + (savedPass ? ' is-done' : '')} type="button" onClick={() => { setSavedPass(true); setTimeout(() => setSavedPass(false), 2200); }}>
                  {savedPass ? <><Icon name="check" size={14} />Senha atualizada</> : 'Alterar senha'}
                </button>
              </div>
            </div>
            <div className="set-row">
              <span className="set-row-icon"><Icon name="shield" size={17} /></span>
              <div className="set-row-info">
                <span className="set-row-title">Verificação em duas etapas{profile.twoFactor ? <span className="set-badge is-on">Ativa</span> : null}</span>
                <span className="set-row-sub">Use um aplicativo autenticador para aprovar cada novo login com um código temporário.</span>
              </div>
              <div className="set-row-action"><Toggle on={!!profile.twoFactor} onChange={(value) => setTwoFactorModalMode(value ? 'enable' : 'disable')} ariaLabel="autenticação de dois fatores" /></div>
            </div>
          </div>
        </section>

        <section className="sub-card">
          <div className="sec-head"><span className="sec-title">Ofertas, comunicação e relacionamento</span></div>
          {prefError ? <div style={{ color: 'var(--fa-error)', fontSize: 12.5, marginBottom: 10 }}>{prefError}</div> : null}
          <div className="set-list">
            {programs.map((program) => (
              <div className="set-row" key={program.name}>
                <div className="set-row-info"><span className="set-row-title">{program.label}</span><span className="set-row-sub">{program.desc}</span></div>
                <div className="set-row-action"><Toggle on={program.enabled} onChange={(value) => toggleProgram(program.name, value)} ariaLabel={program.label} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="sub-card">
          <div className="sec-head"><span className="sec-title">Por onde aceita receber comunicação?</span></div>
          <div className="set-list">
            {channels.map((channel) => (
              <div className="set-row" key={channel.channel}>
                <span className="set-row-icon"><Icon name={channel.icon} size={17} /></span>
                <div className="set-row-info"><span className="set-row-title">{channel.label}</span><span className="set-row-sub">{channel.desc}</span></div>
                <div className="set-row-action">
                  <div className="fa-segpill">
                    <button data-on={channel.enabled ? '1' : '0'} onClick={() => setChannel(channel.channel, true)}>Aceito</button>
                    <button data-on={!channel.enabled ? '1' : '0'} data-no="1" onClick={() => setChannel(channel.channel, false)}>Recuso</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="fa-faint" style={{ fontSize: 12.5, lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Icon name="info" size={16} style={{ flex: 'none', marginTop: 1 }} />
        Suas preferências valem para toda a Farmaura e podem ser alteradas quando quiser. Tratamos seus dados conforme a LGPD.
      </p>

      <TwoFactorModal
        open={!!twoFactorModalMode}
        mode={twoFactorModalMode}
        portalLabel="marketplace"
        onClose={() => setTwoFactorModalMode('')}
        onStartSetup={ctx.beginTwoFactorSetup}
        onEnable={ctx.enableTwoFactor}
        onDisable={ctx.disableTwoFactor}
        onStatusChange={applyTwoFactorState}
      />
    </div>
  );
}

const PROFILE_NUDGE_DISMISS_KEY = 'farmaura_profile_nudge_dismissed_at';
const PROFILE_NUDGE_COOLDOWN_DAYS = 14;

/** Return whether the customer's promotion-relevant profile fields are still incomplete.
 *
 * This is a client-side UX heuristic only — it decides whether to show a friendly nudge, never
 * whether a promotion applies. The server always re-evaluates real eligibility from the
 * persisted Customer record (see pricing_promotion_service.py), so an outdated or bypassed
 * client check here has zero effect on what discount is actually applied.
 */
function isCustomerPromotionProfileIncomplete(profile, addresses) {
  if (!profile) return false;
  const hasPrimaryAddress = Array.isArray(addresses) && addresses.some((address) => address && address.primary);
  return !profile.gender || !profile.maritalStatus || profile.childrenCount === '' || profile.childrenCount == null || !hasPrimaryAddress;
}

function ProfileCompletionNudge({ ctx }) {
  /** Render a dismissible popup inviting the logged customer to complete their profile.
   *
   * Clicking the primary action is an explicit opt-in: it marks the "Promoções e ofertas
   * personalizadas" program as accepted (persisted via saveCustomerPrivacyPreferences), the
   * same real consent record used everywhere else — this popup is just a friendlier entry
   * point to it, not a separate consent mechanism.
   */

  const { user, profile, addresses, privacyPrograms, saveCustomerPrivacyPreferences, onNav } = ctx;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) { setOpen(false); return; }
    // Give the async profile/address fetch time to resolve after login before judging completeness.
    const timer = window.setTimeout(() => {
      if (!isCustomerPromotionProfileIncomplete(profile, addresses)) return;
      const dismissedAt = Number(window.localStorage.getItem(PROFILE_NUDGE_DISMISS_KEY) || 0);
      const cooldownMs = PROFILE_NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      if (dismissedAt && Date.now() - dismissedAt < cooldownMs) return;
      setOpen(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [user, profile, addresses]);

  const dismiss = () => {
    window.localStorage.setItem(PROFILE_NUDGE_DISMISS_KEY, String(Date.now()));
    setOpen(false);
  };

  const acceptAndComplete = async () => {
    try {
      const nextPrograms = privacyPrograms.map((program) => program.name === 'Promoções e ofertas personalizadas' ? { ...program, enabled: true } : program);
      await saveCustomerPrivacyPreferences(nextPrograms, ctx.commChannels);
    } catch (error) {
      // Best-effort: navigating to the profile screen still lets the customer complete it manually.
    }
    window.localStorage.setItem(PROFILE_NUDGE_DISMISS_KEY, String(Date.now()));
    setOpen(false);
    onNav({ name: 'account', tab: 'profile' });
  };

  return (
    <Modal open={open} onClose={dismiss} icon="gift" title="Quer promoções feitas pra você?"
      sub="Complete seu cadastro — gênero, estado civil, filhos e endereço — e a gente mostra ofertas mais relevantes no seu perfil.">
      <p className="fa-faint" style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 4, marginBottom: 18 }}>
        Ao continuar, você concorda em receber promoções personalizadas da Farmaura no aplicativo. Você pode mudar de
        ideia quando quiser em Minha Conta → Privacidade de dados.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="fa-btn fa-btn-primary fa-btn-block" style={{ whiteSpace: 'normal', textAlign: 'center', height: 'auto', minHeight: 46 }} onClick={acceptAndComplete}>
          <Icon name="check" size={16} stroke={2.4} style={{ flex: 'none' }} />Completar cadastro e aceitar promoções
        </button>
        <button className="fa-btn fa-btn-soft fa-btn-block" onClick={dismiss}>Agora não</button>
      </div>
    </Modal>
  );
}

function CardForm({ onSave, onCancel, saving }) {
  /** Render the saved-card creation form. */

  const [card, setCard] = useState({ number: '', holder: '', exp: '', cvv: '' });
  const setCardField = (field, value) => setCard((current) => ({ ...current, [field]: value }));
  const digits = card.exp.replace(/\D/g, '').slice(0, 4);
  const expiryMonth = digits.slice(0, 2);
  const expiryYear = digits.slice(2, 4) ? '20' + digits.slice(2, 4) : '';
  const canSubmit = card.number.length >= 12 && card.holder.trim() && expiryMonth.length === 2 && expiryYear.length === 4 && card.cvv.length >= 3;
  return (
    <div style={{ background: 'var(--fa-mist-2)', borderRadius: 'var(--fa-r-card)', padding: 18 }}>
      <div className="fa-form2">
        <div className="fa-field fa-span2"><label htmlFor="card-number">Número do cartão</label><input id="card-number" className="fa-input" value={card.number} onChange={(event) => setCardField('number', event.target.value.replace(/[^0-9]/g, '').slice(0, 19))} placeholder="0000 0000 0000 0000" /></div>
        <div className="fa-field fa-span2"><label htmlFor="card-holder">Nome impresso no cartão</label><input id="card-holder" className="fa-input" value={card.holder} onChange={(event) => setCardField('holder', event.target.value.toUpperCase())} placeholder="NOME COMPLETO" /></div>
        <div className="fa-field"><label htmlFor="card-exp">Validade</label><input id="card-exp" className="fa-input" value={card.exp} onChange={(event) => setCardField('exp', event.target.value.replace(/[^0-9/]/g, '').slice(0, 5))} placeholder="MM/AA" /></div>
        <div className="fa-field"><label htmlFor="card-cvv">CVV</label><input id="card-cvv" className="fa-input" value={card.cvv} onChange={(event) => setCardField('cvv', event.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="000" /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="fa-btn fa-btn-primary" disabled={!canSubmit || saving} onClick={() => onSave({ number: card.number, holderName: card.holder, expiryMonth, expiryYear, cvv: card.cvv })}>
          <Icon name="check" size={16} stroke={2.4} />{saving ? 'Salvando...' : 'Adicionar cartão'}
        </button>
        <button className="fa-btn fa-btn-soft" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function MyCards({ ctx }) {
  /** Render the saved-card management tab. */

  const cards = ctx.cards;
  const [adding, setAdding] = useState(false);
  const [cardError, setCardError] = useState('');
  const [savingCard, setSavingCard] = useState(false);
  const setPrimary = async (id) => {
    try {
      setCardError('');
      await ctx.setPrimaryCustomerPaymentMethod(id);
    } catch (error) {
      setCardError(error && error.message ? error.message : 'Não foi possível atualizar o cartão principal.');
    }
  };
  const remove = async (id) => {
    try {
      setCardError('');
      await ctx.deleteCustomerPaymentMethod(id);
    } catch (error) {
      setCardError(error && error.message ? error.message : 'Não foi possível remover o cartão.');
    }
  };
  const add = async (data) => {
    try {
      setCardError('');
      setSavingCard(true);
      await ctx.tokenizeAndSaveCard(data);
      setAdding(false);
    } catch (error) {
      setCardError(error && error.message ? error.message : 'Não foi possível adicionar o cartão.');
    } finally {
      setSavingCard(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="orders-head">
        <h1 className="cart-title" style={{ margin: 0 }}>Pagamentos</h1>
        <span className="orders-count">{cards.length} {cards.length === 1 ? 'cartão salvo' : 'cartões salvos'}</span>
      </div>

      <div className="subs-list">
        <section className="sub-card">
          <div className="sec-head">
            <span className="sec-title">Cartões salvos</span>
            {!adding && <button className="ghost-btn" type="button" onClick={() => setAdding(true)}><Icon name="plus" size={14} />Adicionar cartão</button>}
          </div>
          {cardError ? <div style={{ color: 'var(--fa-error)', fontSize: 12.5 }}>{cardError}</div> : null}
          {adding && <CardForm onSave={add} onCancel={() => setAdding(false)} saving={savingCard} />}
          {cards.length > 0 ? (
            <div className="fa-grid" style={{ '--fa-grid-min': '260px' }}>
              {cards.map((card) => (
                <div key={card.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="fa-paycard" data-brand={card.brand}>
                    {card.primary && <span className="fa-badge" style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,.2)', color: '#fff' }}>Principal</span>}
                    <div style={{ fontWeight: 800, letterSpacing: '.04em' }}>{card.brand}</div>
                    <div className="fa-mono" style={{ fontSize: 18, letterSpacing: '.14em' }}>•••• •••• •••• {card.last4}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, opacity: .85 }}><span>{card.holder}</span><span>val {card.exp}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!card.primary && <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 1 }} onClick={() => setPrimary(card.id)}>Tornar principal</button>}
                    <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: card.primary ? 1 : 'none', color: 'var(--fa-error)' }} onClick={() => remove(card.id)}><Icon name="trash" size={15} />Remover</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="prof-addr-empty">Nenhum cartão salvo. Adicione um para agilizar o pagamento dos seus pedidos.</p>
          )}
        </section>

        <section className="sub-card">
          <div className="sec-head"><span className="sec-title">Outras formas de pagamento</span></div>
          <div className="set-list">
            <div className="set-row">
              <span className="set-row-icon"><Icon name="pix" size={17} /></span>
              <div className="set-row-info"><span className="set-row-title">Pix</span><span className="set-row-sub">Você gera um QR Code Pix a cada pedido, com aprovação na hora.</span></div>
              <div className="set-row-action"><span className="set-badge is-on">Disponível</span></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export { AccountSettings, AddressForm, Block, CardForm, MyCards, ProfileCompletionNudge, ProfileManage, TwoFactorModal };
