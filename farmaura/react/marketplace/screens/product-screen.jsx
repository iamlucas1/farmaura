import React, { useEffect, useState } from "react";
import { FlagBadge, ProductCard, ProductVisual, QtyStepper, Stars, brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";
import { resolvePaymentBreakdown } from "../../shared/payment-pricing.js";
import { SectionHead } from "./home-screen.jsx";

/* FARMAURA — Product detail page. Two layout variants (A split / B editorial). */

function PriceBlock({ p, big, paymentRules }) {
  const breakdown = resolvePaymentBreakdown(p.price, paymentRules);
  const bestInstallment = breakdown.bestInstallmentLabel;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span className="fa-price" style={{ fontSize: big ? 38 : 30 }}>{brl(p.price)}</span>
        {p.old && <span className="fa-price-old" style={{ fontSize: 17 }}>{brl(p.old)}</span>}
        {p.discount > 0 && <span className="fa-badge fa-badge-vital" style={{ fontSize: 13, padding: '6px 11px' }}>-{p.discount}% OFF</span>}
      </div>
      <div className="fa-muted" style={{ fontSize: 13, marginTop: 6 }}>
        {bestInstallment && bestInstallment.n > 1 && (
          <>ou {bestInstallment.n}x de {brl(bestInstallment.installmentValue)}{bestInstallment.hasInterest ? '' : ' sem juros'} · </>
        )}
        <b style={{ color: 'var(--fa-success)' }}>{brl(breakdown.pixPrice)}</b> no Pix
      </div>
    </div>
  );
}

function BuyBox({ p, qty, setQty, addToCart, onNav, sub, setSub, notified, onNotify }) {
  const unit = sub ? p.price * 0.85 : p.price;
  const outOfStock = Number(p.stock || 0) <= 0;
  return (
    <div className="fa-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: outOfStock ? 'var(--fa-ink-3)' : 'var(--fa-success)', fontWeight: 700, fontSize: 14 }}>
        <Icon name={outOfStock ? 'minus' : 'check'} size={18} stroke={2.4} />{outOfStock ? 'Sem estoque no momento' : 'Em estoque · entrega em 60 min'}
      </div>
      {p.tags.includes('assinatura') && (
        <button onClick={() => setSub(!sub)} style={{ textAlign: 'left', cursor: 'pointer', border: sub ? '1.5px solid var(--fa-success)' : '1px solid var(--fa-mist)', background: sub ? 'var(--fa-success-soft)' : 'var(--fa-surface)', borderRadius: 'var(--fa-r-input)', padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', transition: 'all .15s' }}>
          <span style={{ marginTop: 1, width: 20, height: 20, borderRadius: 6, border: sub ? 'none' : '1.5px solid var(--fa-mist)', background: sub ? 'var(--fa-success)' : 'transparent', display: 'grid', placeItems: 'center', flex: 'none' }}>{sub && <Icon name="check" size={13} stroke={3} style={{ color: '#fff' }} />}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="repeat" size={15} style={{ color: 'var(--fa-success)' }} />Assinar e economizar 15%</div>
            <div className="fa-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Reposição automática + lembretes. Cancele quando quiser.</div>
          </div>
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <QtyStepper value={qty} onChange={setQty} />
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div className="fa-faint" style={{ fontSize: 12 }}>Subtotal</div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>{brl(unit * qty)}</div>
        </div>
      </div>
      {outOfStock ? (
        <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={!!notified} onClick={() => { if (!notified && onNotify) onNotify(p.id, p.name); }}>
          <Icon name="bell" size={19} stroke={2} />{notified ? 'Vamos te avisar por e-mail' : 'Avise-me quando chegar'}
        </button>
      ) : (
        <>
          <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" onClick={() => addToCart(p, qty, sub)}>
            <Icon name="cart" size={19} stroke={2} />Adicionar ao carrinho
          </button>
          <button className="fa-btn fa-btn-vital fa-btn-block" onClick={() => { addToCart(p, qty, sub); onNav({ name: 'cart' }); }}>Comprar agora</button>
        </>
      )}
      <div style={{ display: 'flex', gap: 14, paddingTop: 4 }}>
        {[['truck', 'Entrega 60 min'], ['shield', 'Compra segura'], ['repeat', 'Troca fácil']].map(([iconName, label]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fa-ink-2)', fontWeight: 600 }}><Icon name={iconName} size={15} style={{ color: 'var(--fa-primary)' }} />{label}</span>
        ))}
      </div>
    </div>
  );
}

function RxNotice() {
  return (
    <div style={{ display: 'flex', gap: 12, padding: 14, background: 'var(--fa-info-soft)', borderRadius: 'var(--fa-r-card)', alignItems: 'flex-start' }}>
      <Icon name="rx" size={20} style={{ color: 'var(--fa-info)', flex: 'none', marginTop: 1 }} />
      <div style={{ fontSize: 13, color: 'var(--fa-info)' }}>
        <b>Medicamento com retenção de receita.</b> Você poderá enviar a receita digital no checkout — nosso farmacêutico valida antes do envio.
      </div>
    </div>
  );
}

function PharmacistCard() {
  return (
    <div className="fa-card" style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'center', background: 'var(--fa-rose-soft)', border: 'none' }}>
      <span className="fa-iconbox" style={{ background: '#fff', width: 48, height: 48 }}><Icon name="chat" size={24} /></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Dúvidas sobre este produto?</div>
        <div className="fa-muted" style={{ fontSize: 13 }}>Fale com um farmacêutico agora, sem custo.</div>
      </div>
      <button className="fa-btn fa-btn-primary fa-btn-sm">Abrir chat</button>
    </div>
  );
}

function ProductTabs({ p }) {
  const [tab, setTab] = useState('desc');
  const tabs = [['desc', 'Descrição'], ['info', 'Como usar'], ['reviews', 'Avaliações']];
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--fa-mist)', marginBottom: 18 }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ border: 'none', background: 'none', padding: '12px 16px', fontWeight: 700, fontSize: 14.5, color: tab === id ? 'var(--fa-primary)' : 'var(--fa-ink-3)', borderBottom: tab === id ? '2px solid var(--fa-primary)' : '2px solid transparent', marginBottom: -1 }}>{label}</button>
        ))}
      </div>
      {tab === 'desc' && <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--fa-ink-2)', maxWidth: 680 }}>{p.info} Produto comercializado pela Farmaura com garantia de procedência e armazenamento adequado. As informações não substituem a orientação de um profissional de saúde.</p>}
      {tab === 'info' && (
        <ul style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--fa-ink-2)', maxWidth: 680, paddingLeft: 0, listStyle: 'none' }}>
          {['Siga sempre a posologia indicada na embalagem ou pelo seu médico.', 'Conserve em local seco, ao abrigo da luz e do calor.', 'Mantenha fora do alcance de crianças.', 'Em caso de reações adversas, suspenda o uso e procure orientação.'].map((text, index) => (
            <li key={index} style={{ display: 'flex', gap: 10, marginBottom: 6 }}><Icon name="check" size={18} stroke={2.4} style={{ color: 'var(--fa-success)', flex: 'none', marginTop: 3 }} />{text}</li>
          ))}
        </ul>
      )}
      {tab === 'reviews' && (
        <div style={{ maxWidth: 680 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 44, lineHeight: 1 }}>{p.rating.toFixed(1)}</div>
            <div><Stars value={p.rating} /><div className="fa-muted" style={{ fontSize: 13 }}>{p.reviews} avaliações</div></div>
          </div>
          
{Array.isArray(p.reviewComments) && p.reviewComments.length ? p.reviewComments.map((review, index) => (
            <div key={review.id || index} style={{ padding: '14px 0', borderTop: '1px solid var(--fa-mist)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 12 }}><div><b style={{ fontSize: 14 }}>{review.reviewer_name || 'Cliente Farmaura'}</b>{review.title ? <div className="fa-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{review.title}</div> : null}</div><Stars value={Number(review.rating || 0)} /></div>
              <p className="fa-muted" style={{ fontSize: 14 }}>{review.body || 'Sem comentário adicional.'}</p>
            </div>
          )) : (
            <div style={{ padding: '14px 0', borderTop: '1px solid var(--fa-mist)' }}>
              <p className="fa-muted" style={{ fontSize: 14 }}>Ainda não há avaliações publicadas para este produto.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductScreen({ ctx }) {
  const { products, route, onNav, addToCart, fav, toggleFav, availabilityAlerts, subscribeAvailabilityAlert, productVariant, cardVariant, paymentRules } = ctx;
  const product = products.find((entry) => entry.id === route.id) || products[0];
  const [qty, setQty] = useState(1);
  const [sub, setSub] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  useEffect(() => {
    setQty(1);
    setSub(false);
    setSelectedImageIndex(0);
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

  const sameCategory = products.filter((entry) => entry.cat === product.cat && entry.id !== product.id);
  const relatedFill = products.filter((entry) => entry.id !== product.id && !sameCategory.includes(entry)).sort((left, right) => right.reviews - left.reviews);
  const related = [...sameCategory, ...relatedFill].slice(0, 10);
  const cardProps = { variant: cardVariant, onOpen: (entry) => onNav({ name: 'product', id: entry.id }), onAdd: (entry) => addToCart(entry), onFav: toggleFav, onNotify: subscribeAvailabilityAlert };
  const supportsGallery = product.imagePolicy === 'brand_image';
  const galleryImages = supportsGallery ? Array.from(new Set((Array.isArray(product.gallery) && product.gallery.length ? product.gallery : [product.imageUrl]).filter(Boolean))) : [];
  const activeImageUrl = supportsGallery ? (galleryImages[selectedImageIndex] || '') : '';
  const hasGalleryOptions = supportsGallery && galleryImages.length > 1;

  const gallery = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ProductVisual product={product} imageUrl={activeImageUrl} label="Imagem do produto" style={{ aspectRatio: productVariant === 'B' ? '16/9' : '1/1' }} />
      {hasGalleryOptions && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {galleryImages.map((imageUrl, index) => (
            <button key={imageUrl + index} type="button" onClick={() => setSelectedImageIndex(index)} aria-label={index === selectedImageIndex ? 'Imagem selecionada do produto' : 'Selecionar imagem do produto'} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
              <ProductVisual product={product} imageUrl={imageUrl} label={product.sub} style={{ width: 72, height: 72, aspectRatio: 'auto', border: index === selectedImageIndex ? '2px solid var(--fa-primary)' : '1px solid var(--fa-mist)' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const info = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {product.tags.map((tag) => <FlagBadge key={tag} tag={tag} />)}
        </div>
        <div className="fa-pc-brand" style={{ fontSize: 12.5 }}>{product.brand}</div>
        <h1 className="fa-h1" style={{ fontSize: 'clamp(24px,2.6vw,32px)', marginTop: 6 }}>{product.name}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <Stars value={product.rating} reviews={product.reviews} />
          <span className="fa-faint">·</span>
          <span className="fa-muted" style={{ fontSize: 13.5, color: Number(product.stock || 0) <= 0 ? 'var(--fa-ink-3)' : undefined }}>{Number(product.stock || 0) <= 0 ? 'Sem estoque no momento' : product.stock + ' em estoque'}</span>
        </div>
      </div>
      <PriceBlock p={product} big={productVariant === 'B'} paymentRules={paymentRules} />
      {product.rx && <RxNotice />}
    </div>
  );

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fa-ink-3)', marginBottom: 18 }}>
        <a role="button" onClick={() => onNav({ name: 'home' })}>Início</a><Icon name="chevR" size={13} />
        <a role="button" onClick={() => onNav({ name: 'category', cat: product.cat })} style={{ textTransform: 'capitalize' }}>{product.cat.replace('-', ' ')}</a><Icon name="chevR" size={13} />
        <span style={{ color: 'var(--fa-ink-2)', fontWeight: 600 }}>{product.sub}</span>
      </div>
      {productVariant === 'B' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 32, alignItems: 'center' }} className="fa-prod-bandgrid">
            {gallery}
            {info}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 32, alignItems: 'start' }} className="fa-prod-bandgrid">
            <ProductTabs p={product} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <BuyBox p={product} qty={qty} setQty={setQty} addToCart={addToCart} onNav={onNav} sub={sub} setSub={setSub} notified={availabilityAlerts.includes(product.id)} onNotify={subscribeAvailabilityAlert} />
              <PharmacistCard />
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 360px', gap: 32, alignItems: 'start' }} className="fa-prod-split">
            {gallery}
            {info}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <BuyBox p={product} qty={qty} setQty={setQty} addToCart={addToCart} onNav={onNav} sub={sub} setSub={setSub} notified={availabilityAlerts.includes(product.id)} onNotify={subscribeAvailabilityAlert} />
              <PharmacistCard />
            </div>
          </div>
          <div style={{ marginTop: 40, maxWidth: 760 }}><ProductTabs p={product} /></div>
        </div>
      )}
      <div style={{ marginTop: 48 }}>
        <SectionHead eyebrow="Combina com" title="Quem viu, levou também" />
        <div className="fa-grid-5">
          {related.map((entry) => <ProductCard key={entry.id} product={entry} {...cardProps} fav={fav.includes(entry.id)} notified={availabilityAlerts.includes(entry.id)} />)}
        </div>
      </div>
    </div>
  );
}

export { BuyBox, PharmacistCard, PriceBlock, ProductScreen, ProductTabs, RxNotice };
