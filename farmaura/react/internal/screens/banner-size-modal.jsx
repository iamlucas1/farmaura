import React, { useEffect, useState } from "react";
import { ModalShell } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";

// Self-contained sample banner artwork (gradient + decorative shapes mimicking a real slide: badge,
// title/subtitle bars on the left, a big icon circle on the right) — purely a visual aid so the admin
// can see how much of a design survives at each candidate crop ratio, not anything that gets saved.
const SAMPLE_BANNER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 480">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#A11017"/>
      <stop offset="1" stop-color="#7C0C12"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="480" fill="url(#bg)"/>
  <circle cx="1300" cy="240" r="260" fill="#ffffff" opacity="0.08"/>
  <circle cx="1420" cy="140" r="120" fill="#ffffff" opacity="0.06"/>
  <rect x="120" y="140" width="220" height="40" rx="20" fill="#ffffff" opacity="0.18"/>
  <rect x="120" y="210" width="480" height="54" rx="10" fill="#ffffff" opacity="0.92"/>
  <rect x="120" y="278" width="360" height="26" rx="8" fill="#ffffff" opacity="0.55"/>
  <rect x="120" y="340" width="200" height="52" rx="26" fill="#ffffff" opacity="0.92"/>
  <circle cx="1300" cy="240" r="150" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="6"/>
  <rect x="1240" y="180" width="120" height="120" rx="30" fill="#ffffff" opacity="0.85"/>
</svg>`;
const SAMPLE_BANNER_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(SAMPLE_BANNER_SVG)}`;

const PRESETS = [
  { id: 'wide', label: 'Panorâmico', width: 1920, height: 480, desc: 'Carrossel bem largo, texto com bastante respiro (4:1).' },
  { id: 'standard', label: 'Padrão (recomendado)', width: 1600, height: 480, desc: 'Equilíbrio entre destaque e altura da página (3.3:1).' },
  { id: 'classic', label: 'Clássico', width: 1200, height: 400, desc: 'Mais compacto, sobra mais espaço pra vitrine logo abaixo (3:1).' },
  { id: 'tall', label: 'Alto', width: 1200, height: 600, desc: 'Banner mais alto, bom pra artes com mais elementos (2:1).' },
  { id: 'square', label: 'Quadrado', width: 900, height: 900, desc: 'Estilo post de rede social — chama mais atenção (1:1).' },
  { id: 'portrait', label: 'Retrato', width: 640, height: 800, desc: 'Vertical, útil pra reaproveitar arte feita para stories (4:5).' },
];

const PREVIEW_MAX_W = 200;
const PREVIEW_MAX_H = 132;

function fitBox(width, height) {
  const ratio = width / height;
  let boxW = PREVIEW_MAX_W;
  let boxH = boxW / ratio;
  if (boxH > PREVIEW_MAX_H) {
    boxH = PREVIEW_MAX_H;
    boxW = boxH * ratio;
  }
  return { boxW, boxH };
}

function SizePreview({ width, height, selected }) {
  const { boxW, boxH } = fitBox(width, height);
  return (
    <div style={{ width: PREVIEW_MAX_W, height: PREVIEW_MAX_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: boxW, height: boxH, borderRadius: 10, overflow: 'hidden',
        boxShadow: selected ? '0 0 0 3px var(--fa-primary)' : '0 0 0 1px var(--fa-mist)',
      }}>
        <img src={SAMPLE_BANNER_SRC} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    </div>
  );
}

/* FARMAURA Console — Escolha visual do tamanho padrão dos slides do banner: presets com preview real da
 * mesma arte de exemplo cortada em cada proporção, mais um tamanho personalizado com preview ao vivo. */
function BannerSizeModal({ open, value, onCancel, onApply }) {
  const [selectedId, setSelectedId] = useState('standard');
  const [customWidth, setCustomWidth] = useState(1600);
  const [customHeight, setCustomHeight] = useState(480);

  useEffect(() => {
    if (!open) return;
    const width = (value && value.width) || 1600;
    const height = (value && value.height) || 480;
    const matched = PRESETS.find((p) => p.width === width && p.height === height);
    setSelectedId(matched ? matched.id : 'custom');
    setCustomWidth(width);
    setCustomHeight(height);
  }, [open, value]);

  if (!open) return null;

  const selectedPreset = PRESETS.find((p) => p.id === selectedId);
  const finalWidth = selectedPreset ? selectedPreset.width : Math.max(320, Math.min(3840, Number(customWidth) || 1600));
  const finalHeight = selectedPreset ? selectedPreset.height : Math.max(120, Math.min(1600, Number(customHeight) || 480));

  return (
    <ModalShell open={open} onClose={onCancel} maxw={780}>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Escolher tamanho do banner</h2>
      <p className="ph-cell-sub" style={{ marginTop: 4 }}>
        Mesma arte de exemplo, cortada em cada proporção — dá pra comparar visualmente antes de decidir. Todo slide de imagem novo (ou ajustado) usa o tamanho escolhido aqui.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginTop: 16 }}>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setSelectedId(preset.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              border: '1px solid ' + (selectedId === preset.id ? 'var(--fa-primary)' : 'var(--fa-mist)'),
              background: selectedId === preset.id ? 'var(--fa-rose-soft)' : '#fff',
              borderRadius: 14, padding: 12, cursor: 'pointer', textAlign: 'center',
            }}
          >
            <SizePreview width={preset.width} height={preset.height} selected={selectedId === preset.id} />
            <div style={{ fontWeight: 700, fontSize: 14 }}>{preset.label}</div>
            <div className="ph-cell-sub" style={{ fontSize: 12 }}>{preset.width} × {preset.height}px</div>
            <div className="ph-cell-sub" style={{ fontSize: 11.5 }}>{preset.desc}</div>
          </button>
        ))}

        <button
          type="button"
          onClick={() => setSelectedId('custom')}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            border: '1px dashed ' + (selectedId === 'custom' ? 'var(--fa-primary)' : 'var(--fa-mist)'),
            background: selectedId === 'custom' ? 'var(--fa-rose-soft)' : '#fff',
            borderRadius: 14, padding: 12, cursor: 'pointer', textAlign: 'center',
          }}
        >
          <SizePreview width={finalWidth} height={finalHeight} selected={selectedId === 'custom'} />
          <div style={{ fontWeight: 700, fontSize: 14 }}><Icon name="edit" size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Personalizado</div>
          {selectedId === 'custom' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }} onClick={(e) => e.stopPropagation()}>
              <input
                className="fa-input" type="number" min="320" max="3840" step="10" value={customWidth}
                onChange={(e) => setCustomWidth(e.target.value)}
                style={{ width: 76, fontSize: 12.5, padding: '6px 8px' }}
              />
              <span style={{ alignSelf: 'center', color: 'var(--fa-ink-3)' }}>×</span>
              <input
                className="fa-input" type="number" min="120" max="1600" step="10" value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value)}
                style={{ width: 76, fontSize: 12.5, padding: '6px 8px' }}
              />
            </div>
          )}
          {selectedId !== 'custom' && <div className="ph-cell-sub" style={{ fontSize: 11.5 }}>Defina sua própria largura e altura.</div>}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} onClick={() => onApply(finalWidth, finalHeight)}>
          <Icon name="check" size={16} />Usar {finalWidth} × {finalHeight}px
        </button>
      </div>
    </ModalShell>
  );
}

export { BannerSizeModal };
