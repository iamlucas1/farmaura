import React, { useState } from "react";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { ImageCropModal } from "./image-crop-modal.jsx";
import { BannerSizeModal } from "./banner-size-modal.jsx";

const LINK_OPTIONS = [
  { value: 'none', label: 'Sem link' },
  { value: 'offers', label: 'Ofertas' },
  { value: 'services', label: 'Serviços de saúde' },
  { value: 'prescricao', label: 'Enviar receita' },
  { value: 'category', label: 'Categoria específica' },
  { value: 'external', label: 'Link externo (URL)' },
];

const _fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
  reader.readAsDataURL(file);
});

const newSlideId = () => 'slide-' + Math.random().toString(36).slice(2, 10);

// Same "cover, centered" framing ImageCropModal starts every crop with, but headless — used to
// auto-refit slides already saved at an old target size onto a newly chosen one, with no per-slide
// interaction required. A slide the admin already fine-tuned can still be reframed via "Recortar
// novamente" afterward if the automatic centered crop isn't quite right for that particular image.
const fitImageToSize = (src, width, height) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const drawWidth = img.naturalWidth * scale;
      const drawHeight = img.naturalHeight * scale;
      ctx.drawImage(img, width / 2 - drawWidth / 2, height / 2 - drawHeight / 2, drawWidth, drawHeight);
      resolve(canvas.toDataURL('image/jpeg', 0.87));
    } catch (error) {
      reject(error);
    }
  };
  img.onerror = () => reject(new Error('load-failed'));
  img.src = src;
});

/* FARMAURA Console — Configuração do banner de destaque da home do marketplace: um carrossel de slides (imagem ou HTML próprio), ou desativado. */
function HomeBannerScreen({ ctx }) {
  const { homeBanner, setHomeBanner, saveHomeBanner, homeBannerBusy, categories, notify } = ctx;
  const mode = (homeBanner && homeBanner.mode) || 'off';
  const slides = (homeBanner && homeBanner.slides) || [];
  const targetWidth = Number((homeBanner && homeBanner.targetWidth) || 1600);
  const targetHeight = Number((homeBanner && homeBanner.targetHeight) || 480);
  const [cropState, setCropState] = useState(null);
  const [sizeModalOpen, setSizeModalOpen] = useState(false);

  const patchSlide = (id, patch) => setHomeBanner({ slides: slides.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const removeSlide = (id) => setHomeBanner({ slides: slides.filter((s) => s.id !== id) });
  const setSlideKind = (id, kind) => patchSlide(id, kind === 'html' ? { kind, image: '' } : { kind, html: '' });
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
    event.target.value = '';
    if (!file || !/^image\//i.test(file.type)) return;
    try {
      const dataUrl = await _fileToDataUrl(file);
      setCropState({ type: 'slide', slideId: id, src: dataUrl, originalImage: dataUrl });
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível carregar a imagem.', 'warn');
    }
  };

  // Re-crop from the pristine upload whenever we have it — cropping an already-cropped (often
  // already zoomed-in) image compounds quality loss fast. Slides created before this field existed
  // fall back to their current `image` as the best available source.
  const openCropForSlide = (id) => {
    const slide = slides.find((s) => s.id === id);
    if (!slide || !slide.image) return;
    const source = slide.originalImage || slide.image;
    setCropState({ type: 'slide', slideId: id, src: source, originalImage: source });
  };

  const onPickBulkImages = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => /^image\//i.test(file.type));
    event.target.value = '';
    if (!files.length) return;
    const remaining = Math.max(0, 8 - slides.length);
    if (!remaining) {
      notify && notify('Limite de 8 slides atingido — remova algum antes de importar mais imagens.', 'warn');
      return;
    }
    const picked = files.slice(0, remaining);
    try {
      const dataUrls = await Promise.all(picked.map(_fileToDataUrl));
      setCropState({ type: 'bulk', queue: dataUrls, index: 0 });
      if (files.length > picked.length) {
        notify && notify('Só ' + picked.length + ' de ' + files.length + ' imagens couberam (limite de 8 slides).', 'warn');
      }
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível importar as imagens.', 'warn');
    }
  };

  // Every successful crop — single slide, re-adjust, or one step of a bulk import — saves right away
  // (silently, no toast per step) so an import is never left stranded only in local state.
  const handleCropApply = async (croppedDataUrl) => {
    if (!cropState) return;
    if (cropState.type === 'slide') {
      const nextSlides = slides.map((s) => (s.id === cropState.slideId ? { ...s, image: croppedDataUrl, originalImage: cropState.originalImage || s.originalImage } : s));
      setCropState(null);
      await saveHomeBanner({ slides: nextSlides }, { silent: true });
      notify && notify('Imagem ajustada e salva.', 'success');
      return;
    }
    const created = { id: newSlideId(), kind: 'image', image: croppedDataUrl, originalImage: cropState.queue[cropState.index], html: '', altText: '', linkType: 'none', linkCategory: '', linkUrl: '' };
    const nextSlides = [...slides, created];
    await saveHomeBanner({ mode: 'image', slides: nextSlides }, { silent: true });
    const nextIndex = cropState.index + 1;
    if (nextIndex < cropState.queue.length) {
      setCropState({ type: 'bulk', queue: cropState.queue, index: nextIndex });
    } else {
      setCropState(null);
      notify && notify(cropState.queue.length + ' imagem(ns) importada(s) e salva(s) automaticamente. Use as setas para ordenar.', 'success');
    }
  };

  const handleCropCancel = () => {
    if (!cropState) return;
    if (cropState.type === 'bulk') {
      const nextIndex = cropState.index + 1;
      if (nextIndex < cropState.queue.length) {
        setCropState({ type: 'bulk', queue: cropState.queue, index: nextIndex });
        return;
      }
    }
    setCropState(null);
  };

  const addHtmlSlide = () => {
    if (slides.length >= 8) {
      notify && notify('Limite de 8 slides atingido — remova algum antes de adicionar outro.', 'warn');
      return;
    }
    setHomeBanner({ mode: 'image', slides: [...slides, { id: newSlideId(), kind: 'html', image: '', originalImage: '', html: '', altText: '', linkType: 'none', linkCategory: '', linkUrl: '' }] });
  };

  const addBlankSlide = () => {
    if (slides.length >= 8) {
      notify && notify('Limite de 8 slides atingido — remova algum antes de adicionar outro.', 'warn');
      return;
    }
    setHomeBanner({ mode: 'image', slides: [...slides, { id: newSlideId(), kind: 'image', image: '', originalImage: '', html: '', altText: '', linkType: 'none', linkCategory: '', linkUrl: '' }] });
  };

  const handleSave = async () => {
    await saveHomeBanner();
  };

  const handleToggleOff = async () => {
    await saveHomeBanner({ mode: 'off' });
  };

  const handleReactivate = async () => {
    await saveHomeBanner({ mode: 'image' });
  };

  const handleSizeApply = async (width, height) => {
    setSizeModalOpen(false);
    const imageSlides = slides.filter((s) => s.kind !== 'html' && s.image);
    if (!imageSlides.length) {
      await saveHomeBanner({ targetWidth: width, targetHeight: height });
      return;
    }
    let failedCount = 0;
    const refittedSlides = await Promise.all(slides.map(async (s) => {
      if (s.kind === 'html' || !s.image) return s;
      try {
        const fitted = await fitImageToSize(s.originalImage || s.image, width, height);
        return { ...s, image: fitted };
      } catch (error) {
        failedCount += 1;
        return s;
      }
    }));
    await saveHomeBanner({ targetWidth: width, targetHeight: height, slides: refittedSlides }, { silent: true });
    if (failedCount) {
      notify && notify(failedCount + ' de ' + imageSlides.length + ' imagem(ns) não puderam ser reencaixadas automaticamente (provavelmente vieram de uma URL externa sem CORS) — use "Recortar novamente" nelas.', 'warn');
    } else {
      notify && notify('Tamanho atualizado — as ' + imageSlides.length + ' imagem(ns) já salva(s) foram reencaixadas automaticamente.', 'success');
    }
  };

  return (
    <>
      <Topbar title="Banner da vitrine" sub="Área de destaque acima da vitrine, na home do marketplace" onLogout={ctx.onLogout} ctx={ctx} />

      <div className="ph-content ph-content-wide">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <label className="fa-btn fa-btn-primary" htmlFor="banner-bulk-images">
            <Icon name="camera" size={15} />Importar imagens (várias de uma vez)
          </label>
          <input id="banner-bulk-images" type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPickBulkImages} disabled={slides.length >= 8} />
          <button className="fa-btn fa-btn-soft" type="button" onClick={addHtmlSlide} disabled={slides.length >= 8}>
            <Icon name="sparkle" size={15} />Adicionar bloco HTML ao carrossel
          </button>
          <button
            className="fa-btn fa-btn-soft"
            type="button"
            onClick={handleToggleOff}
            disabled={homeBannerBusy}
            style={mode === 'off' ? { border: '2px solid var(--fa-primary)', color: 'var(--fa-primary)' } : undefined}
          >
            <Icon name="close" size={15} />Sem banner
          </button>
        </div>
        <div className="ph-cell-sub" style={{ marginBottom: 14 }}>
          Imagens são salvas automaticamente assim que você ajusta o corte — não precisa clicar em "Salvar banner" pra elas. Use as setas ▲▼ de cada slide para reordenar. "Sem banner" só esconde o carrossel da home; os slides continuam guardados até você clicar em "Reativar".
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18, padding: 14, background: 'var(--fa-mist-2)', borderRadius: 14 }}>
          <div style={{ width: 84, aspectRatio: `${targetWidth} / ${targetHeight}`, maxHeight: 56, borderRadius: 8, overflow: 'hidden', boxShadow: '0 0 0 1px var(--fa-mist)', flex: 'none' }}>
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(120deg, var(--fa-primary), var(--fa-primary-ink))' }} />
          </div>
          <div style={{ flex: 'none' }}>
            <div style={{ fontWeight: 700 }}>{targetWidth} × {targetHeight}px</div>
            <div className="ph-cell-sub">Tamanho padrão dos slides de imagem</div>
          </div>
          <button className="fa-btn fa-btn-soft" type="button" onClick={() => setSizeModalOpen(true)}>
            <Icon name="grid" size={15} />Escolher tamanho visualmente
          </button>
          <div className="ph-cell-sub" style={{ flex: 1, minWidth: 220 }}>
            Todo slide de imagem é cortado para este tamanho ao ser enviado. Mudar o tamanho aqui reencaixa automaticamente as imagens já salvas (recorte centralizado) — use "Recortar novamente" em algum slide se quiser reposicionar o enquadramento manualmente.
          </div>
        </div>

        {mode === 'off' && slides.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: 14, background: 'var(--fa-rose-soft)', borderRadius: 14, flexWrap: 'wrap' }}>
            <Icon name="info" size={20} style={{ color: 'var(--fa-primary)', flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700 }}>Banner desativado</div>
              <div className="ph-cell-sub">Os {slides.length} slide(s) abaixo continuam salvos — só não aparecem na home até você reativar.</div>
            </div>
            <button className="fa-btn fa-btn-primary" type="button" onClick={handleReactivate} disabled={homeBannerBusy}>
              <Icon name="repeat" size={15} />Reativar com estes slides
            </button>
          </div>
        )}

        {mode === 'off' && !slides.length && (
          <div className="ph-cell-sub">Banner desativado — a home fica sem a área de destaque acima da vitrine. Importe imagens ou adicione um bloco HTML para reativar.</div>
        )}

        {(mode === 'image' || slides.length > 0) && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 14,
            opacity: mode === 'off' ? 0.5 : 1,
            filter: mode === 'off' ? 'grayscale(0.8)' : 'none',
            pointerEvents: mode === 'off' ? 'none' : 'auto',
          }}>
            {slides.map((slide, index) => (
              <div key={slide.id} style={{ border: '1px solid var(--fa-mist)', borderRadius: 16, padding: 16, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <strong>Slide {index + 1}</strong>
                    <div style={{ display: 'inline-flex', border: '1px solid var(--fa-mist)', borderRadius: 999, overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => setSlideKind(slide.id, 'image')}
                        style={{ border: 'none', padding: '5px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: slide.kind !== 'html' ? 'var(--fa-primary)' : '#fff', color: slide.kind !== 'html' ? '#fff' : 'var(--fa-ink-2)' }}
                      >
                        Imagem
                      </button>
                      <button
                        type="button"
                        onClick={() => setSlideKind(slide.id, 'html')}
                        style={{ border: 'none', padding: '5px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: slide.kind === 'html' ? 'var(--fa-primary)' : '#fff', color: slide.kind === 'html' ? '#fff' : 'var(--fa-ink-2)' }}
                      >
                        HTML
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" disabled={index === 0} onClick={() => moveSlide(slide.id, -1)} aria-label="Mover para cima">▲</button>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" disabled={index === slides.length - 1} onClick={() => moveSlide(slide.id, 1)} aria-label="Mover para baixo">▼</button>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" onClick={() => removeSlide(slide.id)}><Icon name="trash" size={14} />Remover</button>
                  </div>
                </div>

                {slide.kind === 'html' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="ph-cell-sub">HTML higienizado no servidor ao salvar — links devem ser escritos direto no HTML (os campos de link do slide de imagem não se aplicam aqui).</div>
                    <textarea
                      className="fa-input"
                      style={{ minHeight: 180, fontFamily: 'monospace', fontSize: 13 }}
                      value={slide.html}
                      onChange={(e) => patchSlide(slide.id, { html: e.target.value })}
                      placeholder={'<div style="padding:40px;background:var(--fa-primary);color:#fff;border-radius:20px;">\n  <h2>Bloco HTML dentro do carrossel</h2>\n</div>'}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ width: 220, flex: 'none' }}>
                      <div style={{ aspectRatio: `${targetWidth} / ${targetHeight}`, borderRadius: 12, overflow: 'hidden', background: 'var(--fa-mist-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {slide.image ? (
                          <img src={slide.image} alt={slide.altText || 'Prévia do banner'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <Icon name="camera" size={28} style={{ color: 'var(--fa-ink-3)' }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        <label className="fa-btn fa-btn-soft fa-btn-sm" style={{ justifyContent: 'center', width: '100%' }} htmlFor={'slide-file-' + slide.id}>
                          <Icon name="camera" size={14} />Enviar arte
                        </label>
                        {!!slide.image && (
                          <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" style={{ width: '100%', justifyContent: 'center' }} onClick={() => openCropForSlide(slide.id)}>
                            <Icon name="edit" size={13} />Recortar novamente
                          </button>
                        )}
                      </div>
                      <input id={'slide-file-' + slide.id} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onPickSlideImage(slide.id, e)} />
                    </div>
                    <div className="fa-form2" style={{ flex: 1, minWidth: 260 }}>
                      <div className="fa-field fa-span2"><label>URL da imagem (opcional se já enviou a arte)</label><input className="fa-input" value={slide.image} onChange={(e) => patchSlide(slide.id, { image: e.target.value, originalImage: e.target.value })} placeholder="https://..." /></div>
                      <div className="fa-field fa-span2"><label>Texto alternativo</label><input className="fa-input" value={slide.altText} onChange={(e) => patchSlide(slide.id, { altText: e.target.value })} placeholder="Descrição curta da arte" /></div>
                      <div className="fa-field"><label>Ao clicar, ir para</label>
                        <select className="fa-input" value={slide.linkType} onChange={(e) => patchSlide(slide.id, { linkType: e.target.value })}>
                          {LINK_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                      {slide.linkType === 'category' && (
                        <div className="fa-field"><label>Categoria</label>
                          <select className="fa-input" value={slide.linkCategory} onChange={(e) => patchSlide(slide.id, { linkCategory: e.target.value })}>
                            <option value="">Selecione…</option>
                            {(categories || []).map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                          </select>
                        </div>
                      )}
                      {slide.linkType === 'external' && (
                        <div className="fa-field"><label>URL de destino</label><input className="fa-input" value={slide.linkUrl} onChange={(e) => patchSlide(slide.id, { linkUrl: e.target.value })} placeholder="https://..." /></div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {mode === 'image' && (
              <button
                className="fa-btn fa-btn-soft"
                type="button"
                onClick={addBlankSlide}
                disabled={slides.length >= 8}
                style={{ alignSelf: 'flex-start', border: '1px dashed var(--fa-mist)' }}
                aria-label="Adicionar slide"
              >
                <Icon name="plus" size={16} stroke={2.2} />Adicionar slide
              </button>
            )}
            {mode === 'image' && !slides.length && <div className="ph-cell-sub">Nenhum slide ainda — importe imagens, adicione um bloco HTML, ou clique em "Adicionar slide".</div>}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="fa-btn fa-btn-primary" disabled={homeBannerBusy} onClick={handleSave}>
            <Icon name="check" size={16} />{homeBannerBusy ? 'Salvando…' : 'Salvar banner'}
          </button>
        </div>
      </div>

      <BannerSizeModal
        open={sizeModalOpen}
        value={{ width: targetWidth, height: targetHeight }}
        onCancel={() => setSizeModalOpen(false)}
        onApply={handleSizeApply}
      />

      <ImageCropModal
        open={!!cropState}
        src={cropState ? (cropState.type === 'bulk' ? cropState.queue[cropState.index] : cropState.src) : ''}
        targetWidth={targetWidth}
        targetHeight={targetHeight}
        title={cropState && cropState.type === 'bulk' ? 'Ajustar imagem do carrossel' : 'Ajustar imagem'}
        stepLabel={cropState && cropState.type === 'bulk' ? `Imagem ${cropState.index + 1} de ${cropState.queue.length}` : ''}
        onCancel={handleCropCancel}
        onApply={handleCropApply}
      />
    </>
  );
}

export { HomeBannerScreen };
