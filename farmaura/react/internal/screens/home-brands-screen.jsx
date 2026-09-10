import React from "react";
import { Icon, PageHead, SwitchToggle, showToast } from "../core/internal-ui.jsx";

const _fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
  reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
  reader.readAsDataURL(file);
});

const newCircleId = () => "brand-" + Math.random().toString(36).slice(2, 10);
const MAX_CIRCLES = 16;
const BRAND_NAMES_DATALIST_ID = "fa-home-brand-names";

/* FARMAURA Console — "Marcas em destaque": tira de círculos clicáveis logo abaixo dos diferenciais
   da home, cada um levando à vitrine já filtrada pela marca (route.brand na URL do marketplace). */
function HomeBrandsScreen({ ctx }) {
  const { homeBrands, setHomeBrands, saveHomeBrands, homeBrandsBusy, brands } = ctx;
  const mode = (homeBrands && homeBrands.mode) || "off";
  const circles = (homeBrands && homeBrands.circles) || [];
  const catalogBrandNames = [...new Set((brands || []).filter((b) => b.active && !b.discarded).map((b) => b.name))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const unnamedCount = circles.filter((c) => c.image && !(c.brandName || "").trim()).length;

  const patchCircle = (id, patch) => setHomeBrands({ circles: circles.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const removeCircle = (id) => setHomeBrands({ circles: circles.filter((c) => c.id !== id) });
  const moveCircle = (id, dir) => {
    const index = circles.findIndex((c) => c.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= circles.length) return;
    const next = circles.slice();
    const [entry] = next.splice(index, 1);
    next.splice(target, 0, entry);
    setHomeBrands({ circles: next });
  };

  const addCircle = () => {
    if (circles.length >= MAX_CIRCLES) {
      showToast({ message: `Limite de ${MAX_CIRCLES} marcas — remova alguma antes de adicionar outra.` });
      return;
    }
    setHomeBrands({ mode: "on", circles: [...circles, { id: newCircleId(), image: "", altText: "", brandName: "" }] });
  };

  const onPickCircleImage = async (id, event) => {
    const file = (event.target.files || [])[0];
    event.target.value = "";
    if (!file || !/^image\//i.test(file.type)) return;
    try {
      const dataUrl = await _fileToDataUrl(file);
      await saveHomeBrands({ mode: "on", circles: circles.map((c) => (c.id === id ? { ...c, image: dataUrl } : c)) }, { silent: true });
      showToast({ message: "Logo enviado e salvo." });
    } catch (error) {
      showToast({ message: (error && error.message) || "Não foi possível carregar a imagem." });
    }
  };

  const onPickBulkImages = async (event) => {
    const files = Array.from(event.target.files || []).filter((f) => /^image\//i.test(f.type));
    event.target.value = "";
    if (!files.length) return;
    const remaining = Math.max(0, MAX_CIRCLES - circles.length);
    if (!remaining) { showToast({ message: `Limite de ${MAX_CIRCLES} marcas — remova alguma antes de importar mais logos.` }); return; }
    const picked = files.slice(0, remaining);
    try {
      const dataUrls = await Promise.all(picked.map(_fileToDataUrl));
      const created = dataUrls.map((dataUrl) => ({ id: newCircleId(), image: dataUrl, altText: "", brandName: "" }));
      await saveHomeBrands({ mode: "on", circles: [...circles, ...created] }, { silent: true });
      showToast({ message: `${created.length} logo(s) importado(s) e salvo(s) — preencha o nome de cada marca e ordene.` });
      if (files.length > picked.length) showToast({ message: `Só ${picked.length} de ${files.length} imagens couberam (limite de ${MAX_CIRCLES}).` });
    } catch (error) {
      showToast({ message: (error && error.message) || "Não foi possível importar as imagens." });
    }
  };

  const save = async () => {
    try { await saveHomeBrands(); showToast({ message: "Marcas em destaque salvas." }); }
    catch (err) { showToast({ message: (err && err.message) || "Não foi possível salvar." }); }
  };

  const disabled = mode === "off";

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Vitrine"
        title="Marcas em destaque"
        desc="Círculos clicáveis logo abaixo dos diferenciais da home do marketplace — cada um leva à vitrine filtrada pela marca."
        actions={(
          <>
            <SwitchToggle on={mode === "on"} onChange={(v) => saveHomeBrands({ mode: v ? "on" : "off" })} label="Mostrar marcas em destaque" />
            <button className="btn btn-primary" disabled={homeBrandsBusy} onClick={save}>
              <Icon name="check" size={14} />{homeBrandsBusy ? "Salvando…" : "Salvar"}
            </button>
          </>
        )}
      />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="btn btn-primary" htmlFor="home-brands-bulk-images">
            <Icon name="camera" size={14} />Importar logos (vários)
          </label>
          <input id="home-brands-bulk-images" type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onPickBulkImages} disabled={circles.length >= MAX_CIRCLES} />
          <button className="btn btn-secondary" type="button" onClick={addCircle} disabled={circles.length >= MAX_CIRCLES}>
            <Icon name="plus" size={14} />Adicionar marca
          </button>
        </div>
        <p className="page-desc" style={{ marginTop: 12 }}>
          O logo é salvo automaticamente ao enviar. O nome precisa bater exatamente com o campo "Marca" do produto (Catálogo → Marcas) — digite para ver sugestões. Use ▲▼ para ordenar. Desligar só esconde a tira; as marcas ficam guardadas.
        </p>
      </div>

      {unnamedCount > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--warning-soft)" }}>
          <Icon name="info" size={18} style={{ color: "var(--warning)", flex: "none" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{unnamedCount} marca(s) com logo mas sem nome</div>
            <div className="page-desc" style={{ margin: "2px 0 0" }}>Sem o nome preenchido o círculo não aparece no marketplace.</div>
          </div>
        </div>
      )}

      {disabled && !circles.length && (
        <div className="card card-pad"><p className="page-desc" style={{ margin: 0 }}>Marcas em destaque desligadas — a home fica sem a tira de círculos. Adicione uma marca para começar.</p></div>
      )}

      {(mode === "on" || circles.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, opacity: disabled ? 0.5 : 1, filter: disabled ? "grayscale(0.8)" : "none", pointerEvents: disabled ? "none" : "auto" }}>
          {circles.map((circle, index) => {
            const missingName = !!circle.image && !(circle.brandName || "").trim();
            return (
              <div key={circle.id} className="card card-pad" style={{ width: 200, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, borderColor: missingName ? "var(--warning)" : "var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <strong style={{ fontSize: 12.5 }}>Marca {index + 1}</strong>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-secondary btn-sm" type="button" disabled={index === 0} onClick={() => moveCircle(circle.id, -1)} aria-label="Mover para cima">▲</button>
                    <button className="btn btn-secondary btn-sm" type="button" disabled={index === circles.length - 1} onClick={() => moveCircle(circle.id, 1)} aria-label="Mover para baixo">▼</button>
                  </div>
                </div>
                <div style={{ width: 84, height: 84, borderRadius: "50%", overflow: "hidden", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 1px var(--border)" }}>
                  {circle.image
                    ? <img src={circle.image} alt={circle.altText || "Logo da marca"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : <Icon name="camera" size={22} style={{ color: "var(--text-muted)" }} />}
                </div>
                <label className="btn btn-secondary btn-sm" style={{ justifyContent: "center", width: "100%" }} htmlFor={"circle-file-" + circle.id}>
                  <Icon name="camera" size={12} />Enviar logo
                </label>
                <input id={"circle-file-" + circle.id} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onPickCircleImage(circle.id, e)} />
                <input
                  className={"input" + (missingName ? " invalid" : "")}
                  style={{ textAlign: "center" }}
                  value={circle.brandName}
                  onChange={(e) => patchCircle(circle.id, { brandName: e.target.value })}
                  placeholder="Nome da marca"
                  list={BRAND_NAMES_DATALIST_ID}
                />
                {missingName && <div className="field-error" style={{ textAlign: "center" }}>Sem nome — não aparece</div>}
                <input
                  className="input" style={{ textAlign: "center", fontSize: 12 }}
                  value={circle.altText}
                  onChange={(e) => patchCircle(circle.id, { altText: e.target.value })}
                  placeholder="Texto alternativo (opcional)"
                />
                <button className="btn btn-ghost btn-sm" type="button" style={{ width: "100%", justifyContent: "center" }} onClick={() => removeCircle(circle.id)}>
                  <Icon name="trash" size={12} />Remover
                </button>
              </div>
            );
          })}
        </div>
      )}

      <datalist id={BRAND_NAMES_DATALIST_ID}>
        {catalogBrandNames.map((name) => <option key={name} value={name} />)}
      </datalist>
    </div>
  );
}

export { HomeBrandsScreen };
