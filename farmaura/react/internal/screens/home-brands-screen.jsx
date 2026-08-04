import React from "react";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";

const _fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
  reader.readAsDataURL(file);
});

const newCircleId = () => 'brand-' + Math.random().toString(36).slice(2, 10);

const MAX_CIRCLES = 16;

/* FARMAURA Console — "Marcas em destaque": tira de círculos clicáveis logo abaixo dos diferenciais
   da home, cada um levando à vitrine já filtrada pela marca (route.brand na URL do marketplace). */
const BRAND_NAMES_DATALIST_ID = 'fa-home-brand-names';

function HomeBrandsScreen({ ctx }) {
  const { homeBrands, setHomeBrands, saveHomeBrands, homeBrandsBusy, notify, brands } = ctx;
  const mode = (homeBrands && homeBrands.mode) || 'off';
  const circles = (homeBrands && homeBrands.circles) || [];
  // Sugestões vêm do catálogo real (mesma fonte que o picker de marca dos orçamentos de compra),
  // então marcas e suas linhas/variantes já cadastradas separadamente (ex.: "Johnson & Johnson" x
  // "Johnson & Johnson Baby") aparecem como opções distintas — o campo continua texto livre (o
  // schema salva só o nome, sem brand_id), mas a sugestão evita digitar o nome errado/genérico.
  const catalogBrandNames = [...new Set((brands || []).filter((brand) => brand.active && !brand.discarded).map((brand) => brand.name))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  // O marketplace descarta silenciosamente qualquer círculo sem nome de marca (normalizeHomeBrands
  // em marketplace-app.jsx só mostra círculo com image E brandName) — a imagem salva sozinha nunca
  // aparece na home. Sinalizar aqui pra não parecer que "salvou mas não apareceu" sem explicação.
  const unnamedCount = circles.filter((circle) => circle.image && !(circle.brandName || '').trim()).length;

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
      notify && notify('Limite de ' + MAX_CIRCLES + ' marcas atingido — remova alguma antes de adicionar outra.', 'warn');
      return;
    }
    setHomeBrands({ mode: 'on', circles: [...circles, { id: newCircleId(), image: '', altText: '', brandName: '' }] });
  };

  const onPickCircleImage = async (id, event) => {
    const file = (event.target.files || [])[0];
    event.target.value = '';
    if (!file || !/^image\//i.test(file.type)) return;
    try {
      const dataUrl = await _fileToDataUrl(file);
      const nextCircles = circles.map((c) => (c.id === id ? { ...c, image: dataUrl } : c));
      await saveHomeBrands({ mode: 'on', circles: nextCircles }, { silent: true });
      notify && notify('Logo enviado e salvo.', 'success');
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível carregar a imagem.', 'warn');
    }
  };

  // Mesmo padrão de "Importar imagens (várias de uma vez)" do banner da vitrine
  // (home-banner-screen.jsx::onPickBulkImages), mas sem etapa de recorte — círculo de marca sempre
  // usa border-radius:50%+object-fit:cover, então qualquer imagem já se enquadra sem ajuste manual
  // (mesma decisão do ADR original da feature). Cada arquivo vira um círculo novo, sem nome ainda —
  // o admin preenche o nome (com sugestão do catálogo) e reordena com as setas depois.
  const onPickBulkImages = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => /^image\//i.test(file.type));
    event.target.value = '';
    if (!files.length) return;
    const remaining = Math.max(0, MAX_CIRCLES - circles.length);
    if (!remaining) {
      notify && notify('Limite de ' + MAX_CIRCLES + ' marcas atingido — remova alguma antes de importar mais logos.', 'warn');
      return;
    }
    const picked = files.slice(0, remaining);
    try {
      const dataUrls = await Promise.all(picked.map(_fileToDataUrl));
      const created = dataUrls.map((dataUrl) => ({ id: newCircleId(), image: dataUrl, altText: '', brandName: '' }));
      const nextCircles = [...circles, ...created];
      await saveHomeBrands({ mode: 'on', circles: nextCircles }, { silent: true });
      notify && notify(created.length + ' logo(s) importado(s) e salvo(s) — preencha o nome de cada marca e use as setas ▲▼ para ordenar.', 'success');
      if (files.length > picked.length) {
        notify && notify('Só ' + picked.length + ' de ' + files.length + ' imagens couberam (limite de ' + MAX_CIRCLES + ' marcas).', 'warn');
      }
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível importar as imagens.', 'warn');
    }
  };

  const handleSave = async () => {
    await saveHomeBrands();
  };

  const handleToggleOff = async () => {
    await saveHomeBrands({ mode: 'off' });
  };

  const handleReactivate = async () => {
    await saveHomeBrands({ mode: 'on' });
  };

  return (
    <>
      <Topbar title="Marcas em destaque" sub="Círculos clicáveis logo abaixo dos diferenciais, na home do marketplace" onLogout={ctx.onLogout} ctx={ctx} />

      <div className="ph-content ph-content-wide">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <label className="fa-btn fa-btn-primary" htmlFor="home-brands-bulk-images">
            <Icon name="camera" size={15} />Importar logos (vários de uma vez)
          </label>
          <input id="home-brands-bulk-images" type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPickBulkImages} disabled={circles.length >= MAX_CIRCLES} />
          <button className="fa-btn fa-btn-soft" type="button" onClick={addCircle} disabled={circles.length >= MAX_CIRCLES}>
            <Icon name="plus" size={15} />Adicionar marca
          </button>
          <button
            className="fa-btn fa-btn-soft"
            type="button"
            onClick={handleToggleOff}
            disabled={homeBrandsBusy}
            style={mode === 'off' ? { border: '2px solid var(--fa-primary)', color: 'var(--fa-primary)' } : undefined}
          >
            <Icon name="close" size={15} />Sem marcas em destaque
          </button>
        </div>
        <div className="ph-cell-sub" style={{ marginBottom: 14 }}>
          O logo de cada marca é salvo automaticamente ao enviar (individual ou em lote). O nome da marca precisa bater exatamente com o campo "Marca" cadastrado no produto (Catálogo → Marcas), pois é isso que filtra a vitrine ao clicar no círculo — digite para ver sugestões das marcas já cadastradas no catálogo. Linhas específicas de uma marca (ex.: "Johnson & Johnson" e "Johnson & Johnson Baby") só ficam diferenciadas se estiverem cadastradas como marcas separadas em Catálogo → Marcas; escolha a sugestão exata correspondente, não o nome genérico. Use as setas ▲▼ de cada marca para definir a ordem de exibição (a primeira aparece primeiro na home). "Sem marcas em destaque" só esconde a tira; as marcas continuam guardadas até você reativar.
        </div>

        {unnamedCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: 14, background: 'color-mix(in srgb, var(--fa-warn) 14%, #fff)', borderRadius: 14, flexWrap: 'wrap' }}>
            <Icon name="info" size={20} style={{ color: 'var(--fa-warn)', flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700 }}>{unnamedCount} marca(s) com logo mas sem nome</div>
              <div className="ph-cell-sub">O logo já está salvo, mas sem o nome da marca preenchido o círculo não aparece no marketplace. Preencha o nome (marcado em laranja abaixo) e clique em "Salvar marcas em destaque".</div>
            </div>
          </div>
        )}

        {mode === 'off' && circles.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: 14, background: 'var(--fa-rose-soft)', borderRadius: 14, flexWrap: 'wrap' }}>
            <Icon name="info" size={20} style={{ color: 'var(--fa-primary)', flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700 }}>Marcas em destaque desativadas</div>
              <div className="ph-cell-sub">A(s) {circles.length} marca(s) abaixo continuam salvas — só não aparecem na home até você reativar.</div>
            </div>
            <button className="fa-btn fa-btn-primary" type="button" onClick={handleReactivate} disabled={homeBrandsBusy}>
              <Icon name="repeat" size={15} />Reativar com estas marcas
            </button>
          </div>
        )}

        {mode === 'off' && !circles.length && (
          <div className="ph-cell-sub">Marcas em destaque desativadas — a home fica sem a tira de círculos. Adicione uma marca para reativar.</div>
        )}

        {(mode === 'on' || circles.length > 0) && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 14,
            opacity: mode === 'off' ? 0.5 : 1,
            filter: mode === 'off' ? 'grayscale(0.8)' : 'none',
            pointerEvents: mode === 'off' ? 'none' : 'auto',
          }}>
            {circles.map((circle, index) => {
              const missingName = !!circle.image && !(circle.brandName || '').trim();
              return (
              <div key={circle.id} style={{ border: missingName ? '1px solid var(--fa-warn)' : '1px solid var(--fa-mist)', borderRadius: 16, padding: 14, background: missingName ? 'color-mix(in srgb, var(--fa-warn) 6%, #fff)' : '#fff', width: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <strong style={{ fontSize: 12.5 }}>Marca {index + 1}</strong>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" disabled={index === 0} onClick={() => moveCircle(circle.id, -1)} aria-label="Mover para cima">▲</button>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" disabled={index === circles.length - 1} onClick={() => moveCircle(circle.id, 1)} aria-label="Mover para baixo">▼</button>
                  </div>
                </div>
                <div style={{ width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', background: 'var(--fa-mist-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 1px var(--fa-mist)' }}>
                  {circle.image ? (
                    <img src={circle.image} alt={circle.altText || 'Logo da marca'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <Icon name="camera" size={24} style={{ color: 'var(--fa-ink-3)' }} />
                  )}
                </div>
                <label className="fa-btn fa-btn-soft fa-btn-sm" style={{ justifyContent: 'center', width: '100%' }} htmlFor={'circle-file-' + circle.id}>
                  <Icon name="camera" size={13} />Enviar logo
                </label>
                <input id={'circle-file-' + circle.id} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onPickCircleImage(circle.id, e)} />
                <input
                  className="fa-input"
                  style={{ width: '100%', textAlign: 'center', ...(missingName ? { borderColor: 'var(--fa-warn)' } : null) }}
                  value={circle.brandName}
                  onChange={(e) => patchCircle(circle.id, { brandName: e.target.value })}
                  placeholder="Nome da marca"
                  list={BRAND_NAMES_DATALIST_ID}
                />
                {missingName && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fa-warn)', textAlign: 'center', lineHeight: 1.3 }}>
                    Sem nome — não aparece no marketplace
                  </div>
                )}
                <input
                  className="fa-input"
                  style={{ width: '100%', textAlign: 'center', fontSize: 12.5 }}
                  value={circle.altText}
                  onChange={(e) => patchCircle(circle.id, { altText: e.target.value })}
                  placeholder="Texto alternativo (opcional)"
                />
                <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" style={{ width: '100%', justifyContent: 'center' }} onClick={() => removeCircle(circle.id)}>
                  <Icon name="trash" size={13} />Remover
                </button>
              </div>
              );
            })}
          </div>
        )}

        <datalist id={BRAND_NAMES_DATALIST_ID}>
          {catalogBrandNames.map((name) => <option key={name} value={name} />)}
        </datalist>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="fa-btn fa-btn-primary" disabled={homeBrandsBusy} onClick={handleSave}>
            <Icon name="check" size={16} />{homeBrandsBusy ? 'Salvando…' : 'Salvar marcas em destaque'}
          </button>
        </div>
      </div>
    </>
  );
}

export { HomeBrandsScreen };
