import React, { useEffect } from "react";
import Markdown from "markdown-to-jsx";
import { Icon } from "../core/marketplace-icons.jsx";

/* FARMAURA — Package insert (bula) page, one per product, linked from the product detail page's
"Bula do medicamento" card. Split out of the PDP per explicit request so the bula reads as its own
document instead of competing for space with the buy box. Identification fields below are only
ones this catalog actually has (brand, category, dosage/size via variant_label, SKU) — never the
demo's fabricated regulatory rows (Registro MS, Forma farmacêutica, Via de administração), which
this app has no source of truth for. */

function BulaScreen({ ctx }) {
  const { products, route, onNav } = ctx;
  const product = products.find((entry) => entry.id === route.id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.id]);

  if (!product) {
    return (
      <div className="fa-wrap fa-fadein" style={{ paddingTop: 20, paddingBottom: 20, textAlign: 'center' }}>
        <p className="fa-muted" style={{ fontSize: 15, margin: '40px 0 16px' }}>
          {products.length ? 'Produto não encontrado.' : 'Carregando catálogo...'}
        </p>
        <button className="fa-btn fa-btn-primary" onClick={() => onNav({ name: 'home' })}>Voltar para a loja</button>
      </div>
    );
  }

  const idRows = [
    ['Marca', product.brand],
    ['Categoria', product.sub],
    product.variantLabel ? ['Apresentação', product.variantLabel] : null,
    product.sku ? ['Código do produto', product.sku] : null,
  ].filter(Boolean);
  const markdown = String(product.bulaMarkdown || '').trim();

  return (
    <div className="fa-fadein">
      <div className="fa-wrap" style={{ paddingTop: 20, paddingBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fa-ink-3)' }}>
            <button type="button" className="fa-crumb-link" onClick={() => onNav({ name: 'home' })}>Início</button><Icon name="chevR" size={13} />
            <button type="button" className="fa-crumb-link" onClick={() => onNav({ name: 'product', id: product.id })}>{product.name}</button><Icon name="chevR" size={13} />
            <span style={{ color: 'var(--fa-ink-2)', fontWeight: 600 }}>Bula</span>
          </div>
          <button className="bula-back-btn" type="button" onClick={() => onNav({ name: 'product', id: product.id })}>
            <Icon name="chevL" size={15} stroke={2.2} />Voltar ao medicamento
          </button>
        </div>

        <div className="bula-head">
          <span className="bula-head-icon"><Icon name="capsule" size={26} /></span>
          <div>
            <div className="bula-head-eyebrow">Bula do medicamento</div>
            <h1>{product.name}</h1>
          </div>
        </div>

        <div className="bula-doc">
          {idRows.length > 0 && (
            <dl className="bula-id-grid">
              {idRows.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          )}
          {markdown ? (
            <div className="pd-bula"><Markdown>{markdown}</Markdown></div>
          ) : (
            <p className="pd-desc">Bula ainda não cadastrada para este produto.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export { BulaScreen };
