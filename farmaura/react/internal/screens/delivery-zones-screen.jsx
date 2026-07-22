import React, { useEffect, useRef, useState } from "react";
import { fetchViaCepAddress, formatCep } from "../../marketplace/core/marketplace-address.js";
import { Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { AnCard } from "./analytics-screen.jsx";
import { StatCard } from "./dashboard-screen.jsx";

/* FARMAURA Console — Áreas & Frete do marketplace.
   Define, por loja, os bairros de atendimento (validados via busca de CEP)
   e os raios de atendimento (faixas de km) — ambos podem estar ativos ao
   mesmo tempo, cada entrada com seu próprio preço (fixo/grátis/calculado por
   combustível). Endereços fora de tudo isso ficam fora da entrega — o
   checkout do marketplace passa a oferecer só retirada na loja nesse caso.
   "Entregas & rota" continua restrita a despacho e acompanhamento. */

const FUEL_LABELS = { gasoline: 'Gasolina', ethanol: 'Etanol' };

function newPriceRule() {
  return { mode: 'fixed', fixedFee: 0, fuel: { fuelType: 'gasoline', fuelPricePerLiter: 6.0, vehicleKmPerLiter: 12, fuelMarginPercent: 0 } };
}

function fuelFeePreview(fuel, km) {
  const kml = Number(fuel.vehicleKmPerLiter) || 0;
  if (kml <= 0) return 0;
  const liters = km / kml;
  const raw = liters * (Number(fuel.fuelPricePerLiter) || 0);
  const margin = 1 + (Number(fuel.fuelMarginPercent) || 0) / 100;
  return raw * margin;
}

function priceSummary(rule) {
  if (rule.mode === 'free') return 'Grátis';
  if (rule.mode === 'fixed') return 'R$ ' + Number(rule.fixedFee || 0).toFixed(2).replace('.', ',');
  return 'Calculado · combustível';
}

/* ===================== TELA PRINCIPAL ===================== */
function DeliveryZonesScreen({ ctx }) {
  const { deliveryAreas, setDeliveryAreas, saveDeliveryAreas, deliveryAreasBusy, stores: allStores, onLogout, searchDeliveryAddresses } = ctx;
  const stores = Array.isArray(allStores) && allStores.length ? allStores : [{ id: '', name: 'Loja' }];
  const [manualStoreId, setManualStoreId] = useState(null);
  const storeId = manualStoreId != null && stores.some((entry) => entry.id === manualStoreId) ? manualStoreId : stores[0].id;
  const setStoreId = setManualStoreId;
  const activeStore = stores.find((entry) => entry.id === storeId) || stores[0];

  const storeConfigs = Array.isArray(deliveryAreas.stores) ? deliveryAreas.stores : [];
  const storeConfig = storeConfigs.find((entry) => entry.storeId === storeId) || { storeId, neighborhoods: [], radiusTiers: [] };
  const variations = Array.isArray(deliveryAreas.variations) ? deliveryAreas.variations : [];

  const updateStoreConfig = (patch) => {
    const next = { ...storeConfig, ...patch };
    const exists = storeConfigs.some((entry) => entry.storeId === storeId);
    const nextConfigs = exists
      ? storeConfigs.map((entry) => (entry.storeId === storeId ? next : entry))
      : [...storeConfigs, next];
    setDeliveryAreas({ stores: nextConfigs });
  };

  const neighborhoods = Array.isArray(storeConfig.neighborhoods) ? storeConfig.neighborhoods : [];
  const radiusTiers = Array.isArray(storeConfig.radiusTiers) ? storeConfig.radiusTiers : [];
  const activeNeighborhoods = neighborhoods.filter((entry) => entry.isActive !== false).length;
  const activeTiers = radiusTiers.filter((entry) => entry.isActive !== false).length;
  const hasCoverage = neighborhoods.length > 0 || radiusTiers.length > 0;

  return (
    <>
      <Topbar title="Áreas & Frete" sub="Bairros, raios e preços de entrega — o que alimenta o checkout" onLogout={onLogout} ctx={ctx}>
        {stores.length > 1 && (
          <select className="fa-input" style={{ width: 220 }} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        )}
      </Topbar>

      <div className="ph-content ph-content-wide" data-screen-label="Áreas e frete do marketplace">
        <div className="ph-stats" style={{ marginBottom: 18, gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <StatCard icon="pin" value={activeNeighborhoods} label="Bairros ativos" tint={{ bg: 'var(--fa-rose-soft)', fg: 'var(--fa-primary)' }} />
          <StatCard icon="pin" value={activeTiers} label="Raios cadastrados" tint={{ bg: 'var(--fa-info-soft)', fg: 'var(--fa-info)' }} />
          {!hasCoverage ? (
            <StatCard icon="info" value="Sem restrição" label="Nenhuma área configurada ainda" tint={{ bg: 'var(--fa-mist-2)', fg: 'var(--fa-ink-2)' }} />
          ) : (
            <StatCard icon="shield" value="Ativo" label={'Fora dessas áreas, só retirada em ' + (activeStore.name || 'loja')} tint={{ bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)' }} />
          )}
        </div>

        <FreeShippingThreshold value={storeConfig.freeAboveSubtotal || 0} onChange={(v) => updateStoreConfig({ freeAboveSubtotal: v })} />

        <div className="dz-grid">
          <NeighborhoodSection neighborhoods={neighborhoods} setNeighborhoods={(next) => updateStoreConfig({ neighborhoods: next })} searchDeliveryAddresses={searchDeliveryAddresses} />
          <RadiusSection radiusTiers={radiusTiers} setRadiusTiers={(next) => updateStoreConfig({ radiusTiers: next })} />
        </div>

        <VariationsEditor variations={variations} setVariations={(next) => setDeliveryAreas({ variations: next })} />

        <div className="dz-savebar">
          <span className="ph-cell-sub">Bairros, raios, frete grátis e variações são salvos juntos.</span>
          <button className="fa-btn fa-btn-primary" onClick={saveDeliveryAreas} disabled={!!deliveryAreasBusy}>
            <Icon name="check" size={15} />{deliveryAreasBusy ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- Frete grátis acima de um valor mínimo de pedido ---------- */
function FreeShippingThreshold({ value, onChange }) {
  const enabled = Number(value) > 0;
  return (
    <AnCard icon="gift" title="Frete grátis a partir de um valor mínimo" sub="Zera a taxa de entrega (do bairro ou do raio) quando o pedido atinge esse valor — não afeta a taxa extra da entrega expressa"
      right={<span className="fa-badge fa-badge-mist">{enabled ? 'Ativo' : 'Desativado'}</span>} style={{ marginBottom: 18 }}>
      <div className="dz-fee-row">
        <span className="dz-fee-label">Pedidos a partir de</span>
        <span className="fin-prem-pre">R$</span>
        <input className="fa-input" type="number" min="0" step="5" style={{ width: 110 }} value={value}
          onChange={(e) => onChange(Number(e.target.value))} />
        <span className="ph-cell-sub" style={{ marginLeft: 8 }}>{enabled ? '' : 'Deixe em 0 para desativar.'}</span>
      </div>
    </AnCard>
  );
}

/* ---------- Bairros/cidades de atendimento (busca por CEP ou por nome) ---------- */
function NeighborhoodSection({ neighborhoods, setNeighborhoods, searchDeliveryAddresses }) {
  const [mode, setMode] = useState('cep'); // cep | name
  const [cepDraft, setCepDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [lookup, setLookup] = useState({ loading: false, error: '' });
  const [nameResults, setNameResults] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const searchBoxRef = useRef(null);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const onClickOutside = (event) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [dropdownOpen]);

  useEffect(() => {
    /** Search automatically, with a short debounce, once at least 3 characters are typed. */

    if (mode !== 'name' || typeof searchDeliveryAddresses !== 'function') {
      return undefined;
    }
    const query = nameDraft.trim();
    if (query.length < 3) {
      setNameResults([]);
      setLookup((current) => (current.loading ? { ...current, loading: false } : current));
      return undefined;
    }
    let active = true;
    setLookup((current) => ({ ...current, loading: true }));
    const timer = setTimeout(async () => {
      const results = await searchDeliveryAddresses(query);
      if (!active) return;
      const seen = new Set();
      const deduped = results.filter((entry) => {
        if (!entry.district && !entry.city) return false;
        const key = (entry.district || '').trim().toLowerCase() + '|' + (entry.city || '').trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setNameResults(deduped);
      setLookup((current) => ({ ...current, loading: false }));
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [nameDraft, mode, searchDeliveryAddresses]);

  const isDuplicate = (district, city) => {
    const normDistrict = (district || '').trim().toLowerCase();
    const normCity = (city || '').trim().toLowerCase();
    return neighborhoods.some((entry) => (entry.district || '').trim().toLowerCase() === normDistrict && (entry.city || '').trim().toLowerCase() === normCity);
  };

  const appendNeighborhood = ({ postalCode = '', district = '', city = '', stateCode = '' }) => {
    const entry = {
      id: 'bairro-' + Date.now(),
      postalCode, district, city, stateCode,
      price: newPriceRule(),
      isActive: true,
    };
    setNeighborhoods([...neighborhoods, entry]);
    setOpenId(entry.id);
  };

  const addByCep = async () => {
    const digits = cepDraft.replace(/\D/g, '');
    if (digits.length !== 8) {
      setLookup({ loading: false, error: 'Digite um CEP com 8 dígitos.' });
      return;
    }
    setLookup({ loading: true, error: '' });
    try {
      const result = await fetchViaCepAddress(digits);
      if (!result || !result.district) {
        setLookup({ loading: false, error: 'CEP não retornou um bairro válido.' });
        return;
      }
      if (isDuplicate(result.district, result.city)) {
        setLookup({ loading: false, error: 'Esse bairro já está cadastrado.' });
        return;
      }
      appendNeighborhood({ postalCode: result.cep, district: result.district, city: result.city, stateCode: result.state });
      setCepDraft('');
      setLookup({ loading: false, error: '' });
    } catch (error) {
      setLookup({ loading: false, error: error && error.message ? error.message : 'Não foi possível consultar o CEP.' });
    }
  };

  const handleNameChange = (value) => {
    setNameDraft(value);
    setDropdownOpen(value.trim().length > 0);
    if (!value.trim()) {
      setNameResults([]);
    }
  };

  const pickNameResult = (result) => {
    if (isDuplicate(result.district, result.city)) {
      setLookup((current) => ({ ...current, error: 'Esse bairro/cidade já está cadastrado.' }));
      return;
    }
    appendNeighborhood({ district: result.district, city: result.city, stateCode: result.stateCode });
    setNameResults([]);
    setNameDraft('');
    setDropdownOpen(false);
  };

  const updateNeighborhood = (id, patch) => setNeighborhoods(neighborhoods.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  const removeNeighborhood = (id) => setNeighborhoods(neighborhoods.filter((entry) => entry.id !== id));

  return (
    <AnCard icon="pin" title="Bairros/cidades de atendimento" sub="Busque por CEP ou por nome — cada bairro (ou cidade inteira) com seu próprio preço"
      right={<span className="fa-badge fa-badge-mist">{neighborhoods.length ? neighborhoods.length + ' áreas' : 'Nenhuma'}</span>}>
      <div className="ph-seg" style={{ marginBottom: 10 }}>
        <button type="button" data-on={mode === 'cep' ? '1' : '0'} onClick={() => { setMode('cep'); setLookup({ loading: false, error: '' }); setDropdownOpen(false); }}>Por CEP</button>
        <button type="button" data-on={mode === 'name' ? '1' : '0'} onClick={() => { setMode('name'); setLookup({ loading: false, error: '' }); }}>Por bairro/cidade</button>
      </div>

      {mode === 'cep' ? (
        <div className="dz-addrow">
          <input className="fa-input" placeholder="00000-000" value={cepDraft}
            onChange={(e) => setCepDraft(formatCep(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addByCep(); } }} />
          <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={addByCep} disabled={lookup.loading}>
            <Icon name="search" size={14} />{lookup.loading ? 'Buscando…' : 'Buscar e adicionar'}
          </button>
        </div>
      ) : (
        <div className="dz-search-wrap" ref={searchBoxRef}>
          <div className="dz-addrow">
            <input className="fa-input" placeholder="Digite o nome de um bairro ou cidade…" value={nameDraft}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => { if (nameDraft.trim()) setDropdownOpen(true); }} />
            <span className="fa-iconbox" style={{ width: 40, height: 40, flex: 'none' }}><Icon name="search" size={16} /></span>
          </div>
          {dropdownOpen && (
            <div className="dz-dropdown">
              {lookup.loading ? (
                <div className="dz-dropdown-empty">Buscando…</div>
              ) : nameResults.length === 0 ? (
                <div className="dz-dropdown-empty">{nameDraft.trim().length < 3 ? 'Digite ao menos 3 letras…' : 'Nada encontrado para essa busca.'}</div>
              ) : (
                nameResults.map((result, index) => (
                  <button type="button" key={index} className="dz-dropdown-item" onClick={() => pickNameResult(result)}>
                    <span className="dz-row-title">
                      <span className="dz-row-name">{result.district || ('Cidade inteira: ' + (result.city || result.label))}</span>
                      <span className="dz-row-sub">{[result.city, result.stateCode].filter(Boolean).join(' - ') || result.label}</span>
                    </span>
                    {!result.district && <span className="fa-badge fa-badge-mist">Cidade inteira</span>}
                    <Icon name="plus" size={14} />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
      {lookup.error && <div className="dz-error"><Icon name="info" size={13} />{lookup.error}</div>}

      <div className="dz-list">
        {neighborhoods.map((entry) => {
          const active = entry.isActive !== false;
          return (
            <div key={entry.id} className="dz-row" data-open={openId === entry.id ? '1' : '0'} data-active={active ? '1' : '0'}>
              <div className="dz-row-head">
                <button type="button" className="dz-row-head-btn" onClick={() => setOpenId(openId === entry.id ? null : entry.id)}>
                  <span className="dz-row-title">
                    <span className="dz-row-name">{entry.district || ('Cidade inteira: ' + (entry.city || '—'))}</span>
                    <span className="dz-row-sub">{[entry.city, entry.stateCode].filter(Boolean).join(' - ')}</span>
                  </span>
                  {entry.postalCode && <span className="fa-badge fa-badge-mist dz-row-cep">{entry.postalCode}</span>}
                  <span className="fa-badge fa-badge-mist">{priceSummary(entry.price)}</span>
                  {!active && <span className="fa-badge fa-badge-mist">Inativo</span>}
                  <Icon name="chevD" size={14} style={{ transform: openId === entry.id ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                </button>
                <Toggle on={active} onChange={(v) => updateNeighborhood(entry.id, { isActive: v })} ariaLabel={active ? 'Desativar bairro' : 'Ativar bairro'} />
              </div>
              {openId === entry.id && (
                <div className="dz-row-body">
                  <PriceRuleEditor rule={entry.price} onChange={(patch) => updateNeighborhood(entry.id, { price: { ...entry.price, ...patch } })} />
                  <button type="button" className="fa-btn fa-btn-ghost fa-btn-sm" onClick={() => removeNeighborhood(entry.id)}>
                    <Icon name="trash" size={14} />Remover
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {neighborhoods.length === 0 && <div className="fa-muted dz-empty">Nenhum bairro cadastrado ainda.</div>}
      </div>
    </AnCard>
  );
}

/* ---------- Raios de atendimento (faixas de km) ---------- */
function RadiusSection({ radiusTiers, setRadiusTiers }) {
  const [openId, setOpenId] = useState(null);

  const addTier = () => {
    const lastKm = radiusTiers.length ? Number(radiusTiers[radiusTiers.length - 1].upToKm || 0) : 0;
    const entry = { id: 'raio-' + Date.now(), upToKm: lastKm ? lastKm + 3 : 5, price: newPriceRule(), isActive: true };
    setRadiusTiers([...radiusTiers, entry]);
    setOpenId(entry.id);
  };
  const updateTier = (id, patch) => setRadiusTiers(radiusTiers.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  const removeTier = (id) => setRadiusTiers(radiusTiers.filter((entry) => entry.id !== id));
  const sorted = [...radiusTiers].sort((a, b) => Number(a.upToKm || 0) - Number(b.upToKm || 0));

  return (
    <AnCard icon="truck" title="Raios de atendimento" sub="Faixas de km a partir da loja — cada faixa com seu próprio preço"
      right={<span className="fa-badge fa-badge-mist">{radiusTiers.length ? radiusTiers.length + ' raios' : 'Nenhum'}</span>}>
      <div className="dz-list">
        {sorted.map((entry) => {
          const active = entry.isActive !== false;
          return (
            <div key={entry.id} className="dz-row" data-open={openId === entry.id ? '1' : '0'} data-active={active ? '1' : '0'}>
              <div className="dz-row-head">
                <button type="button" className="dz-row-head-btn" onClick={() => setOpenId(openId === entry.id ? null : entry.id)}>
                  <span className="dz-row-title">
                    <span className="dz-row-name">Até {entry.upToKm} km</span>
                    <span className="dz-row-sub">a partir da loja</span>
                  </span>
                  <span className="fa-badge fa-badge-mist">{priceSummary(entry.price)}</span>
                  {!active && <span className="fa-badge fa-badge-mist">Inativo</span>}
                  <Icon name="chevD" size={14} style={{ transform: openId === entry.id ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                </button>
                <Toggle on={active} onChange={(v) => updateTier(entry.id, { isActive: v })} ariaLabel={active ? 'Desativar raio' : 'Ativar raio'} />
              </div>
              {openId === entry.id && (
                <div className="dz-row-body">
                  <div className="dz-fee-row">
                    <span className="dz-fee-label">Até quantos km</span>
                    <input className="fa-input" type="number" min="0.5" step="0.5" style={{ width: 90 }} value={entry.upToKm}
                      onChange={(e) => updateTier(entry.id, { upToKm: Number(e.target.value) })} />
                    <span className="fin-prem-pre">km</span>
                  </div>
                  <PriceRuleEditor rule={entry.price} onChange={(patch) => updateTier(entry.id, { price: { ...entry.price, ...patch } })} />
                  <button type="button" className="fa-btn fa-btn-ghost fa-btn-sm" onClick={() => removeTier(entry.id)}>
                    <Icon name="trash" size={14} />Remover raio
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {radiusTiers.length === 0 && <div className="fa-muted dz-empty">Nenhum raio cadastrado ainda.</div>}
      </div>
      <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={addTier}><Icon name="plus" size={14} />Adicionar raio</button>
    </AnCard>
  );
}

/* ---------- Regra de preço compartilhada (fixo / grátis / calculado por combustível) ---------- */
function PriceRuleEditor({ rule, onChange }) {
  const previewKm = 5;
  const preview = rule.mode === 'calculated' ? fuelFeePreview(rule.fuel, previewKm) : null;
  return (
    <div className="dz-price-rule">
      <div className="ph-seg">
        <button type="button" data-on={rule.mode === 'fixed' ? '1' : '0'} onClick={() => onChange({ mode: 'fixed' })}>Preço fixo</button>
        <button type="button" data-on={rule.mode === 'free' ? '1' : '0'} onClick={() => onChange({ mode: 'free' })}>Grátis</button>
        <button type="button" data-on={rule.mode === 'calculated' ? '1' : '0'} onClick={() => onChange({ mode: 'calculated' })}>Calculado</button>
      </div>

      {rule.mode === 'fixed' && (
        <div className="dz-fee-row">
          <span className="dz-fee-label">Taxa de entrega</span>
          <span className="fin-prem-pre">R$</span>
          <input className="fa-input" type="number" min="0" step="0.5" style={{ width: 90 }} value={rule.fixedFee}
            onChange={(e) => onChange({ fixedFee: Number(e.target.value) })} />
        </div>
      )}

      {rule.mode === 'calculated' && (
        <div className="dz-fuel-grid">
          <div className="dz-fee-row">
            <span className="dz-fee-label">Combustível</span>
            <select className="fa-input" style={{ width: 130 }} value={rule.fuel.fuelType} onChange={(e) => onChange({ fuel: { ...rule.fuel, fuelType: e.target.value } })}>
              <option value="gasoline">Gasolina</option>
              <option value="ethanol">Etanol</option>
            </select>
          </div>
          <div className="dz-fee-row">
            <span className="dz-fee-label">Preço do litro</span>
            <span className="fin-prem-pre">R$</span>
            <input className="fa-input" type="number" min="0" step="0.05" style={{ width: 90 }} value={rule.fuel.fuelPricePerLiter}
              onChange={(e) => onChange({ fuel: { ...rule.fuel, fuelPricePerLiter: Number(e.target.value) } })} />
          </div>
          <div className="dz-fee-row">
            <span className="dz-fee-label">Consumo médio</span>
            <input className="fa-input" type="number" min="0.1" step="0.5" style={{ width: 90 }} value={rule.fuel.vehicleKmPerLiter}
              onChange={(e) => onChange({ fuel: { ...rule.fuel, vehicleKmPerLiter: Number(e.target.value) } })} />
            <span className="fin-prem-pre">km/l</span>
          </div>
          <div className="dz-fee-row">
            <span className="dz-fee-label">Margem sobre custo</span>
            <input className="fa-input" type="number" min="0" step="1" style={{ width: 90 }} value={rule.fuel.fuelMarginPercent}
              onChange={(e) => onChange({ fuel: { ...rule.fuel, fuelMarginPercent: Number(e.target.value) } })} />
            <span className="fin-prem-pre">%</span>
          </div>
          <div className="ph-cell-sub dz-fuel-hint">
            <Icon name="info" size={13} style={{ flex: 'none' }} />Para {previewKm} km, a taxa estimada fica em {'R$ ' + preview.toFixed(2).replace('.', ',')}.
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Variações de entrega (normal/expressa) ---------- */
function VariationsEditor({ variations, setVariations }) {
  const updateVariation = (id, patch) => setVariations(variations.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  return (
    <AnCard icon="bolt" title="Variações de entrega" sub="Taxa extra e prazo de cada modalidade, somados à taxa do bairro/raio que atender o endereço"
      right={<span className="fa-badge fa-badge-mist">{variations.length} modalidades</span>} style={{ marginBottom: 18 }}>
      <div className="dz-variations">
        {variations.map((entry) => (
          <div className="dz-fee-row" key={entry.id}>
            <span className="dz-fee-label"><Icon name={entry.id === 'express' ? 'bolt' : 'clock'} size={14} />{entry.label || entry.id}</span>
            <span className="fin-prem-pre">+R$</span>
            <input className="fa-input" type="number" min="0" step="0.5" style={{ width: 80 }} value={entry.extraFee}
              onChange={(e) => updateVariation(entry.id, { extraFee: Number(e.target.value) })} />
            <span className="fin-prem-pre">·</span>
            <input className="fa-input" type="number" min="1" step="5" style={{ width: 70 }} value={entry.etaMinutes}
              onChange={(e) => updateVariation(entry.id, { etaMinutes: Number(e.target.value) })} />
            <span className="fin-prem-pre">min</span>
          </div>
        ))}
      </div>
    </AnCard>
  );
}

export { DeliveryZonesScreen };
