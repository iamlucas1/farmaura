import React, { useEffect, useRef, useState } from "react";
import { fetchViaCepAddress, formatCep } from "../../marketplace/core/marketplace-address.js";
import {
  Icon, PageHead, StatCard, Badge, PillNav, SwitchToggle, EmptyState, money, showToast,
} from "../core/internal-ui.jsx";

/* FARMAURA Console — Áreas & Frete do marketplace.
   Define, por loja, os bairros de atendimento (validados via busca de CEP) e os raios de
   atendimento (faixas de km) — ambos podem estar ativos ao mesmo tempo, cada entrada com seu
   próprio preço (fixo/grátis/calculado por combustível). Endereços fora de tudo isso ficam fora
   da entrega — o checkout passa a oferecer só retirada na loja nesse caso. */

function newPriceRule() {
  return { mode: "fixed", fixedFee: 0, fuel: { fuelType: "gasoline", fuelPricePerLiter: 6.0, vehicleKmPerLiter: 12, fuelMarginPercent: 0 } };
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
  if (rule.mode === "free") return "Grátis";
  if (rule.mode === "fixed") return money(rule.fixedFee || 0);
  return "Calculado · combustível";
}

function DeliveryZonesScreen({ ctx }) {
  const { deliveryAreas, setDeliveryAreas, saveDeliveryAreas, deliveryAreasBusy, stores: allStores, searchDeliveryAddresses } = ctx;
  const stores = Array.isArray(allStores) && allStores.length ? allStores : [{ id: "", name: "Loja" }];
  const [manualStoreId, setManualStoreId] = useState(null);
  const storeId = manualStoreId != null && stores.some((entry) => entry.id === manualStoreId) ? manualStoreId : stores[0].id;
  const activeStore = stores.find((entry) => entry.id === storeId) || stores[0];

  const storeConfigs = Array.isArray(deliveryAreas.stores) ? deliveryAreas.stores : [];
  const storeConfig = storeConfigs.find((entry) => entry.storeId === storeId) || { storeId, neighborhoods: [], radiusTiers: [] };
  const variations = Array.isArray(deliveryAreas.variations) ? deliveryAreas.variations : [];

  const updateStoreConfig = (patch) => {
    const next = { ...storeConfig, ...patch };
    const exists = storeConfigs.some((entry) => entry.storeId === storeId);
    const nextConfigs = exists ? storeConfigs.map((entry) => (entry.storeId === storeId ? next : entry)) : [...storeConfigs, next];
    setDeliveryAreas({ stores: nextConfigs });
  };

  const neighborhoods = Array.isArray(storeConfig.neighborhoods) ? storeConfig.neighborhoods : [];
  const radiusTiers = Array.isArray(storeConfig.radiusTiers) ? storeConfig.radiusTiers : [];
  const activeNeighborhoods = neighborhoods.filter((entry) => entry.isActive !== false).length;
  const activeTiers = radiusTiers.filter((entry) => entry.isActive !== false).length;
  const hasCoverage = neighborhoods.length > 0 || radiusTiers.length > 0;

  const save = async () => {
    try { await saveDeliveryAreas(); showToast({ message: "Áreas e frete salvos." }); }
    catch (err) { showToast({ message: (err && err.message) || "Não foi possível salvar." }); }
  };

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Preço & Promoções"
        title="Áreas & Frete"
        desc="Bairros, raios e preços de entrega — o que alimenta o checkout."
        actions={stores.length > 1 && (
          <select className="input" style={{ width: "auto", minWidth: 200 }} value={storeId} onChange={(e) => setManualStoreId(e.target.value)}>
            {stores.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        )}
      />

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <StatCard icon="pin" value={activeNeighborhoods} label="Bairros ativos" />
        <StatCard icon="pin" value={activeTiers} label="Raios cadastrados" />
        {!hasCoverage
          ? <StatCard icon="info" value="Sem restrição" label="Nenhuma área configurada ainda" />
          : <StatCard icon="shield" value="Ativo" label={`Fora dessas áreas, só retirada em ${activeStore.name || "loja"}`} tone="good" />}
      </div>

      <FreeShippingThreshold value={storeConfig.freeAboveSubtotal || 0} onChange={(v) => updateStoreConfig({ freeAboveSubtotal: v })} />

      <div className="grid g-2" style={{ marginBottom: 16, alignItems: "start" }}>
        <NeighborhoodSection neighborhoods={neighborhoods} setNeighborhoods={(next) => updateStoreConfig({ neighborhoods: next })} searchDeliveryAddresses={searchDeliveryAddresses} />
        <RadiusSection radiusTiers={radiusTiers} setRadiusTiers={(next) => updateStoreConfig({ radiusTiers: next })} />
      </div>

      <VariationsEditor variations={variations} setVariations={(next) => setDeliveryAreas({ variations: next })} />

      <div className="card card-pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span className="page-desc" style={{ margin: 0 }}>Bairros, raios, frete grátis e variações são salvos juntos.</span>
        <button className="btn btn-primary" onClick={save} disabled={!!deliveryAreasBusy}>
          <Icon name="check" size={14} />{deliveryAreasBusy ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}

function FreeShippingThreshold({ value, onChange }) {
  const enabled = Number(value) > 0;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <div><h3>Frete grátis a partir de um valor mínimo</h3><div className="card-head-sub">Zera a taxa de entrega quando o pedido atinge esse valor — não afeta a taxa extra da entrega expressa.</div></div>
        <Badge tone={enabled ? "good" : "neutral"} dot>{enabled ? "Ativo" : "Desativado"}</Badge>
      </div>
      <div className="card-pad" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Pedidos a partir de</span>
        <span className="cell-muted">R$</span>
        <input className="input" type="number" min="0" step="5" style={{ width: 110 }} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        {!enabled && <span className="page-desc" style={{ margin: 0 }}>Deixe em 0 para desativar.</span>}
      </div>
    </div>
  );
}

function CollapsibleRow({ title, sub, badges, active, onToggleActive, activeLabel, open, onToggleOpen, children }) {
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
        <button type="button" onClick={onToggleOpen} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, font: "inherit", color: "inherit" }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
            {sub && <div className="cell-muted" style={{ fontSize: 12 }}>{sub}</div>}
          </span>
          {badges}
          {!active && <Badge tone="neutral">Inativo</Badge>}
          <Icon name="chevD" size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flex: "none" }} />
        </button>
        <SwitchToggle on={active} onChange={onToggleActive} label={activeLabel} />
      </div>
      {open && <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}>{children}</div>}
    </div>
  );
}

function NeighborhoodSection({ neighborhoods, setNeighborhoods, searchDeliveryAddresses }) {
  const [mode, setMode] = useState("cep");
  const [cepDraft, setCepDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [lookup, setLookup] = useState({ loading: false, error: "" });
  const [nameResults, setNameResults] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const searchBoxRef = useRef(null);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const onClickOutside = (event) => { if (searchBoxRef.current && !searchBoxRef.current.contains(event.target)) setDropdownOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [dropdownOpen]);

  useEffect(() => {
    if (mode !== "name" || typeof searchDeliveryAddresses !== "function") return undefined;
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
        const key = (entry.district || "").trim().toLowerCase() + "|" + (entry.city || "").trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      setNameResults(deduped);
      setLookup((current) => ({ ...current, loading: false }));
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [nameDraft, mode, searchDeliveryAddresses]);

  const isDuplicate = (district, city) => {
    const normDistrict = (district || "").trim().toLowerCase();
    const normCity = (city || "").trim().toLowerCase();
    return neighborhoods.some((entry) => (entry.district || "").trim().toLowerCase() === normDistrict && (entry.city || "").trim().toLowerCase() === normCity);
  };

  const appendNeighborhood = ({ postalCode = "", district = "", city = "", stateCode = "" }) => {
    const entry = { id: "bairro-" + Date.now(), postalCode, district, city, stateCode, price: newPriceRule(), isActive: true };
    setNeighborhoods([...neighborhoods, entry]);
    setOpenId(entry.id);
  };

  const addByCep = async () => {
    const digits = cepDraft.replace(/\D/g, "");
    if (digits.length !== 8) { setLookup({ loading: false, error: "Digite um CEP com 8 dígitos." }); return; }
    setLookup({ loading: true, error: "" });
    try {
      const result = await fetchViaCepAddress(digits);
      if (!result || !result.district) { setLookup({ loading: false, error: "CEP não retornou um bairro válido." }); return; }
      if (isDuplicate(result.district, result.city)) { setLookup({ loading: false, error: "Esse bairro já está cadastrado." }); return; }
      appendNeighborhood({ postalCode: result.cep, district: result.district, city: result.city, stateCode: result.state });
      setCepDraft(""); setLookup({ loading: false, error: "" });
    } catch (error) {
      setLookup({ loading: false, error: (error && error.message) || "Não foi possível consultar o CEP." });
    }
  };

  const handleNameChange = (value) => {
    setNameDraft(value);
    setDropdownOpen(value.trim().length > 0);
    if (!value.trim()) setNameResults([]);
  };

  const pickNameResult = (result) => {
    if (isDuplicate(result.district, result.city)) { setLookup((c) => ({ ...c, error: "Esse bairro/cidade já está cadastrado." })); return; }
    appendNeighborhood({ district: result.district, city: result.city, stateCode: result.stateCode });
    setNameResults([]); setNameDraft(""); setDropdownOpen(false);
  };

  const updateNeighborhood = (id, patch) => setNeighborhoods(neighborhoods.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  const removeNeighborhood = (id) => setNeighborhoods(neighborhoods.filter((entry) => entry.id !== id));

  return (
    <div className="card">
      <div className="card-head">
        <div><h3>Bairros/cidades de atendimento</h3><div className="card-head-sub">Busque por CEP ou por nome — cada área com seu próprio preço.</div></div>
        <Badge tone="neutral">{neighborhoods.length ? neighborhoods.length + " áreas" : "Nenhuma"}</Badge>
      </div>
      <div className="card-pad">
        <PillNav options={[{ key: "cep", label: "Por CEP" }, { key: "name", label: "Por bairro/cidade" }]} active={mode} onChange={(m) => { setMode(m); setLookup({ loading: false, error: "" }); setDropdownOpen(false); }} />
        <div style={{ marginTop: 12 }}>
          {mode === "cep" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" placeholder="00000-000" value={cepDraft} onChange={(e) => setCepDraft(formatCep(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addByCep(); } }} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={addByCep} disabled={lookup.loading}>
                <Icon name="search" size={13} />{lookup.loading ? "Buscando…" : "Buscar e adicionar"}
              </button>
            </div>
          ) : (
            <div ref={searchBoxRef} style={{ position: "relative" }}>
              <input className="input" placeholder="Digite o nome de um bairro ou cidade…" value={nameDraft} onChange={(e) => handleNameChange(e.target.value)} onFocus={() => { if (nameDraft.trim()) setDropdownOpen(true); }} />
              {dropdownOpen && (
                <div className="card" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 5, maxHeight: 220, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
                  {lookup.loading ? (
                    <div className="page-desc" style={{ padding: 12 }}>Buscando…</div>
                  ) : nameResults.length === 0 ? (
                    <div className="page-desc" style={{ padding: 12 }}>{nameDraft.trim().length < 3 ? "Digite ao menos 3 letras…" : "Nada encontrado para essa busca."}</div>
                  ) : nameResults.map((result, index) => (
                    <button type="button" key={index} onClick={() => pickNameResult(result)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", border: "none", borderBottom: "1px solid var(--border)", background: "none", cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{result.district || ("Cidade inteira: " + (result.city || result.label))}</div>
                        <div className="cell-muted" style={{ fontSize: 11.5 }}>{[result.city, result.stateCode].filter(Boolean).join(" - ") || result.label}</div>
                      </span>
                      {!result.district && <Badge tone="neutral">Cidade inteira</Badge>}
                      <Icon name="plus" size={13} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {lookup.error && <div className="field-error" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}><Icon name="info" size={12} />{lookup.error}</div>}
        </div>

        <div style={{ marginTop: 14 }}>
          {neighborhoods.map((entry) => {
            const active = entry.isActive !== false;
            return (
              <CollapsibleRow
                key={entry.id}
                title={entry.district || ("Cidade inteira: " + (entry.city || "—"))}
                sub={[entry.city, entry.stateCode].filter(Boolean).join(" - ")}
                badges={<>{entry.postalCode && <Badge tone="neutral">{entry.postalCode}</Badge>}<Badge tone="neutral">{priceSummary(entry.price)}</Badge></>}
                active={active}
                activeLabel={active ? "Desativar bairro" : "Ativar bairro"}
                onToggleActive={(v) => updateNeighborhood(entry.id, { isActive: v })}
                open={openId === entry.id}
                onToggleOpen={() => setOpenId(openId === entry.id ? null : entry.id)}
              >
                <PriceRuleEditor rule={entry.price} onChange={(patch) => updateNeighborhood(entry.id, { price: { ...entry.price, ...patch } })} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeNeighborhood(entry.id)} style={{ marginTop: 10 }}>
                  <Icon name="trash" size={13} />Remover
                </button>
              </CollapsibleRow>
            );
          })}
          {neighborhoods.length === 0 && <EmptyState icon="pin" title="Nenhum bairro cadastrado ainda" />}
        </div>
      </div>
    </div>
  );
}

function RadiusSection({ radiusTiers, setRadiusTiers }) {
  const [openId, setOpenId] = useState(null);
  const addTier = () => {
    const lastKm = radiusTiers.length ? Number(radiusTiers[radiusTiers.length - 1].upToKm || 0) : 0;
    const entry = { id: "raio-" + Date.now(), upToKm: lastKm ? lastKm + 3 : 5, price: newPriceRule(), isActive: true };
    setRadiusTiers([...radiusTiers, entry]);
    setOpenId(entry.id);
  };
  const updateTier = (id, patch) => setRadiusTiers(radiusTiers.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  const removeTier = (id) => setRadiusTiers(radiusTiers.filter((entry) => entry.id !== id));
  const sorted = [...radiusTiers].sort((a, b) => Number(a.upToKm || 0) - Number(b.upToKm || 0));

  return (
    <div className="card">
      <div className="card-head">
        <div><h3>Raios de atendimento</h3><div className="card-head-sub">Faixas de km a partir da loja — cada faixa com seu próprio preço.</div></div>
        <Badge tone="neutral">{radiusTiers.length ? radiusTiers.length + " raios" : "Nenhum"}</Badge>
      </div>
      <div className="card-pad">
        {sorted.map((entry) => {
          const active = entry.isActive !== false;
          return (
            <CollapsibleRow
              key={entry.id}
              title={`Até ${entry.upToKm} km`}
              sub="a partir da loja"
              badges={<Badge tone="neutral">{priceSummary(entry.price)}</Badge>}
              active={active}
              activeLabel={active ? "Desativar raio" : "Ativar raio"}
              onToggleActive={(v) => updateTier(entry.id, { isActive: v })}
              open={openId === entry.id}
              onToggleOpen={() => setOpenId(openId === entry.id ? null : entry.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>Até quantos km</span>
                <input className="input" type="number" min="0.5" step="0.5" style={{ width: 90 }} value={entry.upToKm} onChange={(e) => updateTier(entry.id, { upToKm: Number(e.target.value) })} />
                <span className="cell-muted">km</span>
              </div>
              <PriceRuleEditor rule={entry.price} onChange={(patch) => updateTier(entry.id, { price: { ...entry.price, ...patch } })} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeTier(entry.id)} style={{ marginTop: 10 }}>
                <Icon name="trash" size={13} />Remover raio
              </button>
            </CollapsibleRow>
          );
        })}
        {radiusTiers.length === 0 && <EmptyState icon="truck" title="Nenhum raio cadastrado ainda" />}
        <button type="button" className="btn btn-secondary btn-sm" onClick={addTier}><Icon name="plus" size={13} />Adicionar raio</button>
      </div>
    </div>
  );
}

function PriceRuleEditor({ rule, onChange }) {
  const previewKm = 5;
  const preview = rule.mode === "calculated" ? fuelFeePreview(rule.fuel, previewKm) : null;
  return (
    <div>
      <PillNav options={[{ key: "fixed", label: "Preço fixo" }, { key: "free", label: "Grátis" }, { key: "calculated", label: "Calculado" }]} active={rule.mode} onChange={(mode) => onChange({ mode })} />

      {rule.mode === "fixed" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Taxa de entrega</span>
          <span className="cell-muted">R$</span>
          <input className="input" type="number" min="0" step="0.5" style={{ width: 90 }} value={rule.fixedFee} onChange={(e) => onChange({ fixedFee: Number(e.target.value) })} />
        </div>
      )}

      {rule.mode === "calculated" && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 120 }}>Combustível</span>
            <select className="input" style={{ width: 130 }} value={rule.fuel.fuelType} onChange={(e) => onChange({ fuel: { ...rule.fuel, fuelType: e.target.value } })}>
              <option value="gasoline">Gasolina</option>
              <option value="ethanol">Etanol</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 120 }}>Preço do litro</span>
            <span className="cell-muted">R$</span>
            <input className="input" type="number" min="0" step="0.05" style={{ width: 90 }} value={rule.fuel.fuelPricePerLiter} onChange={(e) => onChange({ fuel: { ...rule.fuel, fuelPricePerLiter: Number(e.target.value) } })} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 120 }}>Consumo médio</span>
            <input className="input" type="number" min="0.1" step="0.5" style={{ width: 90 }} value={rule.fuel.vehicleKmPerLiter} onChange={(e) => onChange({ fuel: { ...rule.fuel, vehicleKmPerLiter: Number(e.target.value) } })} />
            <span className="cell-muted">km/l</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 120 }}>Margem sobre custo</span>
            <input className="input" type="number" min="0" step="1" style={{ width: 90 }} value={rule.fuel.fuelMarginPercent} onChange={(e) => onChange({ fuel: { ...rule.fuel, fuelMarginPercent: Number(e.target.value) } })} />
            <span className="cell-muted">%</span>
          </div>
          <p className="page-desc" style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <Icon name="info" size={12} style={{ flex: "none", marginTop: 2 }} />Para {previewKm} km, a taxa estimada fica em {money(preview)}.
          </p>
        </div>
      )}
    </div>
  );
}

function VariationsEditor({ variations, setVariations }) {
  const updateVariation = (id, patch) => setVariations(variations.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <div><h3>Variações de entrega</h3><div className="card-head-sub">Taxa extra e prazo de cada modalidade, somados à taxa do bairro/raio.</div></div>
        <Badge tone="neutral">{variations.length} modalidades</Badge>
      </div>
      <div className="card-pad" style={{ display: "grid", gap: 10 }}>
        {variations.map((entry) => (
          <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 140, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name={entry.id === "express" ? "bolt" : "clock"} size={13} />{entry.label || entry.id}
            </span>
            <span className="cell-muted">+R$</span>
            <input className="input" type="number" min="0" step="0.5" style={{ width: 80 }} value={entry.extraFee} onChange={(e) => updateVariation(entry.id, { extraFee: Number(e.target.value) })} />
            <span className="cell-muted">·</span>
            <input className="input" type="number" min="1" step="5" style={{ width: 70 }} value={entry.etaMinutes} onChange={(e) => updateVariation(entry.id, { etaMinutes: Number(e.target.value) })} />
            <span className="cell-muted">min</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { DeliveryZonesScreen };
