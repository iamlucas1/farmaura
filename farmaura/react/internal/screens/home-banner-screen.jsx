import React, { useState } from "react";
import { Icon, PageHead, Field, SwitchToggle, showToast } from "../core/internal-ui.jsx";
import { ImageCropModal } from "./image-crop-modal.jsx";
import { BannerSizeModal } from "./banner-size-modal.jsx";

const LINK_OPTIONS = [
  { value: "none", label: "Sem link" },
  { value: "offers", label: "Ofertas" },
  { value: "services", label: "Serviços de saúde" },
  { value: "prescricao", label: "Enviar receita" },
  { value: "category", label: "Categoria específica" },
  { value: "external", label: "Link externo (URL)" },
];

const _fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
  reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
  reader.readAsDataURL(file);
});

const newSlideId = () => "slide-" + Math.random().toString(36).slice(2, 10);

/* Headless "cover, centered" refit — reframes slides saved at an old target size onto a newly
   chosen one with no per-slide interaction. A slide can still be reframed via "Recortar novamente". */
const fitImageToSize = (src, width, height) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const c2d = canvas.getContext("2d");
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      c2d.drawImage(img, width / 2 - dw / 2, height / 2 - dh / 2, dw, dh);
      resolve(canvas.toDataURL("image/jpeg", 0.87));
    } catch (error) { reject(error); }
  };
  img.onerror = () => reject(new Error("load-failed"));
  img.src = src;
});

/* FARMAURA Console — Configuração do banner de destaque da home do marketplace: carrossel de slides
   (imagem ou HTML próprio), ou desativado. */
function HomeBannerScreen({ ctx }) {
  const { homeBanner, setHomeBanner, saveHomeBanner, homeBannerBusy, categories } = ctx;
  const mode = (homeBanner && homeBanner.mode) || "off";
  const slides = (homeBanner && homeBanner.slides) || [];
  const targetWidth = Number((homeBanner && homeBanner.targetWidth) || 1600);
  const targetHeight = Number((homeBanner && homeBanner.targetHeight) || 480);
  const [cropState, setCropState] = useState(null);
  const [sizeModalOpen, setSizeModalOpen] = useState(false);

  const patchSlide = (id, patch) => setHomeBanner({ slides: slides.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const removeSlide = (id) => setHomeBanner({ slides: slides.filter((s) => s.id !== id) });
  const setSlideKind = (id, kind) => patchSlide(id, kind === "html" ? { kind, image: "" } : { kind, html: "" });
  const moveSlide = (id, dir) => {
    const index = slides.findIndex((s) => s.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= slides.length) return;
    const next = slides.slice();
    const [entry] = next.splice(index, 1);
    next.splice(target, 0, entry);
    setHomeBanner({ slides: next });
  };

  const onPickSlideImage = async (id, event) => {
    const file = (event.target.files || [])[0];
    event.target.value = "";
    if (!file || !/^image\//i.test(file.type)) return;
    try {
      const dataUrl = await _fileToDataUrl(file);
      setCropState({ type: "slide", slideId: id, src: dataUrl, originalImage: dataUrl });
    } catch (error) {
      showToast({ message: (error && error.message) || "Não foi possível carregar a imagem." });
    }
  };

  const openCropForSlide = (id) => {
    const slide = slides.find((s) => s.id === id);
    if (!slide || !slide.image) return;
    const source = slide.originalImage || slide.image;
    setCropState({ type: "slide", slideId: id, src: source, originalImage: source });
  };

  const onPickBulkImages = async (event) => {
    const files = Array.from(event.target.files || []).filter((f) => /^image\//i.test(f.type));
    event.target.value = "";
    if (!files.length) return;
    const remaining = Math.max(0, 8 - slides.length);
    if (!remaining) { showToast({ message: "Limite de 8 slides — remova algum antes de importar mais imagens." }); return; }
    const picked = files.slice(0, remaining);
    try {
      const dataUrls = await Promise.all(picked.map(_fileToDataUrl));
      setCropState({ type: "bulk", queue: dataUrls, index: 0 });
      if (files.length > picked.length) showToast({ message: `Só ${picked.length} de ${files.length} imagens couberam (limite de 8 slides).` });
    } catch (error) {
      showToast({ message: (error && error.message) || "Não foi possível importar as imagens." });
    }
  };

  const handleCropApply = async (croppedDataUrl) => {
    if (!cropState) return;
    if (cropState.type === "slide") {
      const nextSlides = slides.map((s) => (s.id === cropState.slideId ? { ...s, image: croppedDataUrl, originalImage: cropState.originalImage || s.originalImage } : s));
      setCropState(null);
      await saveHomeBanner({ slides: nextSlides }, { silent: true });
      showToast({ message: "Imagem ajustada e salva." });
      return;
    }
    const created = { id: newSlideId(), kind: "image", image: croppedDataUrl, originalImage: cropState.queue[cropState.index], html: "", altText: "", linkType: "none", linkCategory: "", linkUrl: "" };
    const nextSlides = [...slides, created];
    await saveHomeBanner({ mode: "image", slides: nextSlides }, { silent: true });
    const nextIndex = cropState.index + 1;
    if (nextIndex < cropState.queue.length) {
      setCropState({ type: "bulk", queue: cropState.queue, index: nextIndex });
    } else {
      setCropState(null);
      showToast({ message: `${cropState.queue.length} imagem(ns) importada(s) e salva(s). Use as setas para ordenar.` });
    }
  };

  const handleCropCancel = () => {
    if (!cropState) return;
    if (cropState.type === "bulk") {
      const nextIndex = cropState.index + 1;
      if (nextIndex < cropState.queue.length) { setCropState({ type: "bulk", queue: cropState.queue, index: nextIndex }); return; }
    }
    setCropState(null);
  };

  const addSlide = (kind) => {
    if (slides.length >= 8) { showToast({ message: "Limite de 8 slides — remova algum antes de adicionar outro." }); return; }
    setHomeBanner({ mode: "image", slides: [...slides, { id: newSlideId(), kind, image: "", originalImage: "", html: "", altText: "", linkType: "none", linkCategory: "", linkUrl: "" }] });
  };

  const save = async () => {
    try { await saveHomeBanner(); showToast({ message: "Banner da vitrine salvo." }); }
    catch (err) { showToast({ message: (err && err.message) || "Não foi possível salvar." }); }
  };

  const handleSizeApply = async (width, height) => {
    setSizeModalOpen(false);
    const imageSlides = slides.filter((s) => s.kind !== "html" && s.image);
    if (!imageSlides.length) { await saveHomeBanner({ targetWidth: width, targetHeight: height }); return; }
    let failedCount = 0;
    const refitted = await Promise.all(slides.map(async (s) => {
      if (s.kind === "html" || !s.image) return s;
      try { return { ...s, image: await fitImageToSize(s.originalImage || s.image, width, height) }; }
      catch { failedCount += 1; return s; }
    }));
    await saveHomeBanner({ targetWidth: width, targetHeight: height, slides: refitted }, { silent: true });
    showToast({
      message: failedCount
        ? `${failedCount} de ${imageSlides.length} imagem(ns) não puderam ser reencaixadas — use "Recortar novamente".`
        : `Tamanho atualizado — ${imageSlides.length} imagem(ns) reencaixada(s) automaticamente.`,
    });
  };

  const dimmed = mode === "off";

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Vitrine"
        title="Banner da vitrine"
        desc="Área de destaque acima da vitrine, na home do marketplace — carrossel de slides de imagem ou HTML."
        actions={(
          <>
            <SwitchToggle on={mode !== "off"} onChange={(v) => saveHomeBanner({ mode: v ? "image" : "off" })} label="Mostrar banner" />
            <button className="btn btn-primary" disabled={homeBannerBusy} onClick={save}>
              <Icon name="check" size={14} />{homeBannerBusy ? "Salvando…" : "Salvar"}
            </button>
          </>
        )}
      />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="btn btn-primary" htmlFor="banner-bulk-images">
            <Icon name="camera" size={14} />Importar imagens (várias)
          </label>
          <input id="banner-bulk-images" type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onPickBulkImages} disabled={slides.length >= 8} />
          <button className="btn btn-secondary" type="button" onClick={() => addSlide("html")} disabled={slides.length >= 8}>
            <Icon name="sparkle" size={14} />Bloco HTML
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setSizeModalOpen(true)}>
            <Icon name="grid" size={14} />Tamanho: {targetWidth} × {targetHeight}px
          </button>
        </div>
        <p className="page-desc" style={{ marginTop: 12 }}>
          Imagens são salvas assim que você ajusta o corte. Use ▲▼ para reordenar. Desligar só esconde o carrossel; os slides ficam guardados. Mudar o tamanho reencaixa as imagens já salvas (corte centralizado).
        </p>
      </div>

      {dimmed && !slides.length && (
        <div className="card card-pad"><p className="page-desc" style={{ margin: 0 }}>Banner desligado — a home fica sem a área de destaque. Importe imagens ou adicione um bloco HTML para começar.</p></div>
      )}

      {(mode === "image" || slides.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: dimmed ? 0.5 : 1, filter: dimmed ? "grayscale(0.8)" : "none", pointerEvents: dimmed ? "none" : "auto" }}>
          {slides.map((slide, index) => (
            <div key={slide.id} className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <strong>Slide {index + 1}</strong>
                  <div className="pillnav">
                    <button className={slide.kind !== "html" ? "active" : ""} onClick={() => setSlideKind(slide.id, "image")}>Imagem</button>
                    <button className={slide.kind === "html" ? "active" : ""} onClick={() => setSlideKind(slide.id, "html")}>HTML</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" type="button" disabled={index === 0} onClick={() => moveSlide(slide.id, -1)} aria-label="Mover para cima">▲</button>
                  <button className="btn btn-secondary btn-sm" type="button" disabled={index === slides.length - 1} onClick={() => moveSlide(slide.id, 1)} aria-label="Mover para baixo">▼</button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeSlide(slide.id)}><Icon name="trash" size={13} />Remover</button>
                </div>
              </div>

              {slide.kind === "html" ? (
                <Field label="HTML do slide" hint="Higienizado no servidor ao salvar — links devem ir direto no HTML.">
                  <textarea
                    className="input mono" style={{ minHeight: 180, fontSize: 13 }}
                    value={slide.html}
                    onChange={(e) => patchSlide(slide.id, { html: e.target.value })}
                    placeholder={'<div style="padding:40px;background:var(--brand);color:#fff;border-radius:20px;">\n  <h2>Bloco HTML dentro do carrossel</h2>\n</div>'}
                  />
                </Field>
              ) : (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ width: 220, flex: "none" }}>
                    <div style={{ aspectRatio: `${targetWidth} / ${targetHeight}`, borderRadius: 12, overflow: "hidden", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {slide.image
                        ? <img src={slide.image} alt={slide.altText || "Prévia do banner"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        : <Icon name="camera" size={26} style={{ color: "var(--text-muted)" }} />}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      <label className="btn btn-secondary btn-sm" style={{ justifyContent: "center", width: "100%" }} htmlFor={"slide-file-" + slide.id}>
                        <Icon name="camera" size={13} />Enviar arte
                      </label>
                      {!!slide.image && (
                        <button className="btn btn-secondary btn-sm" type="button" style={{ width: "100%", justifyContent: "center" }} onClick={() => openCropForSlide(slide.id)}>
                          <Icon name="edit" size={12} />Recortar novamente
                        </button>
                      )}
                    </div>
                    <input id={"slide-file-" + slide.id} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onPickSlideImage(slide.id, e)} />
                  </div>
                  <div className="grid g-2" style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <Field label="URL da imagem (opcional se já enviou a arte)">
                        <input className="input" value={slide.image} onChange={(e) => patchSlide(slide.id, { image: e.target.value, originalImage: e.target.value })} placeholder="https://..." />
                      </Field>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <Field label="Texto alternativo">
                        <input className="input" value={slide.altText} onChange={(e) => patchSlide(slide.id, { altText: e.target.value })} placeholder="Descrição curta da arte" />
                      </Field>
                    </div>
                    <Field label="Ao clicar, ir para">
                      <select className="input" value={slide.linkType} onChange={(e) => patchSlide(slide.id, { linkType: e.target.value })}>
                        {LINK_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </Field>
                    {slide.linkType === "category" && (
                      <Field label="Categoria">
                        <select className="input" value={slide.linkCategory} onChange={(e) => patchSlide(slide.id, { linkCategory: e.target.value })}>
                          <option value="">Selecione…</option>
                          {(categories || []).map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                      </Field>
                    )}
                    {slide.linkType === "external" && (
                      <Field label="URL de destino">
                        <input className="input" value={slide.linkUrl} onChange={(e) => patchSlide(slide.id, { linkUrl: e.target.value })} placeholder="https://..." />
                      </Field>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {mode === "image" && (
            <button
              className="btn btn-ghost" type="button" onClick={() => addSlide("image")}
              disabled={slides.length >= 8}
              style={{ alignSelf: "flex-start", border: "1px dashed var(--border-strong)" }}
            >
              <Icon name="plus" size={14} />Adicionar slide
            </button>
          )}
          {mode === "image" && !slides.length && <p className="page-desc" style={{ margin: 0 }}>Nenhum slide ainda — importe imagens, adicione um bloco HTML, ou clique em "Adicionar slide".</p>}
        </div>
      )}

      <BannerSizeModal
        open={sizeModalOpen}
        value={{ width: targetWidth, height: targetHeight }}
        onCancel={() => setSizeModalOpen(false)}
        onApply={handleSizeApply}
      />

      <ImageCropModal
        open={!!cropState}
        src={cropState ? (cropState.type === "bulk" ? cropState.queue[cropState.index] : cropState.src) : ""}
        targetWidth={targetWidth}
        targetHeight={targetHeight}
        title={cropState && cropState.type === "bulk" ? "Ajustar imagem do carrossel" : "Ajustar imagem"}
        stepLabel={cropState && cropState.type === "bulk" ? `Imagem ${cropState.index + 1} de ${cropState.queue.length}` : ""}
        onCancel={handleCropCancel}
        onApply={handleCropApply}
      />
    </div>
  );
}

export { HomeBannerScreen };
