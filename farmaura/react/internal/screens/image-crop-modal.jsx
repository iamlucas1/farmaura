import React, { useEffect, useRef, useState } from "react";
import { ModalShell } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";

const STAGE_MAX_WIDTH = 560;

/* FARMAURA Console — Corte/ajuste de imagem para um tamanho de saída fixo (usado pelos slides do banner
 * da vitrine, para manter todos os banners no mesmo padrão de tamanho). Arraste para posicionar e use o
 * controle de zoom para aproximar; "Aplicar" desenha o recorte num canvas na resolução real escolhida. */
function ImageCropModal({ open, src, targetWidth, targetHeight, title, stepLabel, onCancel, onApply }) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const [natural, setNatural] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ratio = targetWidth / targetHeight;
  const stageWidth = STAGE_MAX_WIDTH;
  const stageHeight = Math.round(stageWidth / ratio);

  useEffect(() => {
    if (!open || !src) return;
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError('');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setNatural({ width: img.naturalWidth, height: img.naturalHeight, el: img });
    img.onerror = () => setError('Não foi possível carregar esta imagem para recorte.');
    img.src = src;
  }, [open, src]);

  if (!open) return null;

  const coverScale = natural ? Math.max(stageWidth / natural.width, stageHeight / natural.height) : 1;
  const scale = coverScale * zoom;
  const displayedWidth = natural ? natural.width * scale : 0;
  const displayedHeight = natural ? natural.height * scale : 0;
  const maxOffsetX = Math.max(0, (displayedWidth - stageWidth) / 2);
  const maxOffsetY = Math.max(0, (displayedHeight - stageHeight) / 2);
  const clamp = (value, max) => Math.max(-max, Math.min(max, value));

  const onPointerDown = (event) => {
    if (!natural) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, startOffset: offset };
    setDragging(true);
  };
  const onPointerMove = (event) => {
    if (!dragging || !dragRef.current) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    setOffset({
      x: clamp(dragRef.current.startOffset.x + dx, maxOffsetX),
      y: clamp(dragRef.current.startOffset.y + dy, maxOffsetY),
    });
  };
  const onPointerUp = () => {
    setDragging(false);
    dragRef.current = null;
  };

  const handleZoomChange = (nextZoom) => {
    setZoom(nextZoom);
    const nextScale = coverScale * nextZoom;
    const nextDisplayedWidth = natural ? natural.width * nextScale : 0;
    const nextDisplayedHeight = natural ? natural.height * nextScale : 0;
    const nextMaxX = Math.max(0, (nextDisplayedWidth - stageWidth) / 2);
    const nextMaxY = Math.max(0, (nextDisplayedHeight - stageHeight) / 2);
    setOffset((prev) => ({ x: clamp(prev.x, nextMaxX), y: clamp(prev.y, nextMaxY) }));
  };

  const handleApply = () => {
    if (!natural) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      const exportScale = targetWidth / stageWidth;
      const realScale = scale * exportScale;
      const realDisplayedWidth = natural.width * realScale;
      const realDisplayedHeight = natural.height * realScale;
      const realOffsetX = offset.x * exportScale;
      const realOffsetY = offset.y * exportScale;
      const drawX = targetWidth / 2 - realDisplayedWidth / 2 + realOffsetX;
      const drawY = targetHeight / 2 - realDisplayedHeight / 2 + realOffsetY;
      ctx.drawImage(natural.el, drawX, drawY, realDisplayedWidth, realDisplayedHeight);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.87);
      onApply(dataUrl);
    } catch (err) {
      setError('Não foi possível cortar esta imagem — se ela veio de uma URL externa, baixe o arquivo e envie direto.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={open} onClose={busy ? () => {} : onCancel} maxw={stageWidth + 80}>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title || 'Ajustar imagem'}</h2>
      {stepLabel && <p className="ph-cell-sub" style={{ marginTop: 4 }}>{stepLabel}</p>}
      <p className="ph-cell-sub" style={{ marginTop: 4 }}>
        Saída final: {targetWidth}×{targetHeight}px — arraste para posicionar, use o zoom para aproximar.
      </p>

      {error && <div className="ph-cell-sub" style={{ color: 'var(--fa-danger, #b3261e)', marginTop: 10 }}>{error}</div>}

      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          width: stageWidth, height: stageHeight, marginTop: 14, borderRadius: 16, overflow: 'hidden',
          background: 'var(--fa-mist-2)', position: 'relative', touchAction: 'none',
          cursor: natural ? (dragging ? 'grabbing' : 'grab') : 'default',
          border: '1px solid var(--fa-mist)',
        }}
      >
        {!natural && !error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fa-ink-3)' }}>
            <Icon name="camera" size={26} />
          </div>
        )}
        {natural && (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: stageWidth / 2 - displayedWidth / 2 + offset.x,
              top: stageHeight / 2 - displayedHeight / 2 + offset.y,
              width: displayedWidth, height: displayedHeight,
              userSelect: 'none', pointerEvents: 'none',
            }}
          />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <Icon name="search" size={16} style={{ color: 'var(--fa-ink-3)', flex: 'none' }} />
        <input
          type="range" min="1" max="3" step="0.01" value={zoom}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          disabled={!natural}
          style={{ flex: 1 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onCancel} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} onClick={handleApply} disabled={!natural || busy}>
          <Icon name="check" size={16} />{busy ? 'Aplicando…' : 'Aplicar corte'}
        </button>
      </div>
    </ModalShell>
  );
}

export { ImageCropModal };
