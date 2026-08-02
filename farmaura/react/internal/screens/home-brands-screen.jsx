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
function HomeBrandsScreen({ ctx }) {
  const { homeBrands, setHomeBrands, saveHomeBrands, homeBrandsBusy, notify } = ctx;
  const mode = (homeBrands && homeBrands.mode) || 'off';
  const circles = (homeBrands && homeBrands.circles) || [];

  const patchCircle = (id, patch) => setHomeBrands({ circles: circles.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const removeCircle = (id) => setHomeBrands({ circles: circles.filter((c) => c.id !== id) });

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
          <button className="fa-btn fa-btn-primary" type="button" onClick={addCircle} disabled={circles.length >= MAX_CIRCLES}>
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
          O logo de cada marca é salvo automaticamente ao enviar. O nome da marca precisa bater exatamente com o campo "Marca" cadastrado no produto (Catálogo → Marcas), pois é isso que filtra a vitrine ao clicar no círculo. "Sem marcas em destaque" só esconde a tira; as marcas continuam guardadas até você reativar.
        </div>

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
            {circles.map((circle) => (
              <div key={circle.id} style={{ border: '1px solid var(--fa-mist)', borderRadius: 16, padding: 14, background: '#fff', width: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
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
                  style={{ width: '100%', textAlign: 'center' }}
                  value={circle.brandName}
                  onChange={(e) => patchCircle(circle.id, { brandName: e.target.value })}
                  placeholder="Nome da marca"
                />
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
            ))}
          </div>
        )}

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
