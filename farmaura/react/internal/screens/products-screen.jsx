import React, { useEffect, useState } from "react";
import { ModalShell, Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryKpi } from "./inventory-screen.jsx";

const CONTROLLED_CATEGORY_OPTIONS = [
  { value: 'none', label: 'Não controlado' },
  { value: 'prescription', label: 'Venda sob prescrição' },
  { value: 'prescription_retention', label: 'Prescrição com retenção de receita' },
  { value: 'special_control', label: 'Controle especial' },
  { value: 'black_stripe', label: 'Tarja preta' },
];

// RDC nº 96/2008 (Anvisa) proíbe propaganda/publicidade de medicamentos sujeitos a
// prescrição — por isso nenhuma imagem enviada pela farmácia pode ser exibida para
// essas categorias; o marketplace usa somente o placeholder regulatório padrão.
const MARKETPLACE_IMAGE_RESTRICTED_CATEGORIES = ['prescription', 'prescription_retention', 'special_control', 'black_stripe'];
const _normalizeImageList = (value) => Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || '').trim()).filter(Boolean))).slice(0, 8);
const _uniqueOptions = (list, idKey, nameKey) => {
  const seen = new Map();
  list.forEach((item) => {
    const id = item[idKey];
    if (id && !seen.has(id)) seen.set(id, item[nameKey] || '');
  });
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};
const _fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
  reader.readAsDataURL(file);
});

/* FARMAURA Console — Cadastro de produtos: identidade e configuração, sem dados de estoque. */
function ProductsScreen({ ctx }) {
  const {
    products, brands, categories, therapeuticClasses, storeDirectory, cnaeSettings,
    refreshProducts, refreshBrands, refreshCategories, refreshTherapeuticClasses, refreshStoreDirectory,
    addProduct, updateProduct, setProductActive, setProductDiscarded, fetchProductStoreLinks, linkProductToStore,
    notify, onLogout, user,
  } = ctx;
  const cnaeOptions = (cnaeSettings && cnaeSettings.items) || [];
  const isAdmin = !!(user && window.FA_ACCESS && user.role === window.FA_ACCESS.ROLE.ADMIN);
  const [q, setQ] = useState('');
  const [kpiFilter, setKpiFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [editProduct, setEditProduct] = useState(null);
  const [viewProduct, setViewProduct] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [discardTarget, setDiscardTarget] = useState(null);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [selectedRecoverIds, setSelectedRecoverIds] = useState(() => new Set());
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    refreshProducts && refreshProducts();
    refreshBrands && refreshBrands();
    refreshCategories && refreshCategories();
    refreshTherapeuticClasses && refreshTherapeuticClasses();
    refreshStoreDirectory && refreshStoreDirectory();
  }, []);

  const availableProducts = (products || []).filter((product) => !product.discarded);
  const activeCount = availableProducts.filter((product) => product.active).length;
  const inactiveCount = availableProducts.filter((product) => !product.active).length;
  const controlledCount = availableProducts.filter((product) => product.isControlled).length;
  const genericCount = availableProducts.filter((product) => product.isGeneric).length;
  const noStoreCount = availableProducts.filter((product) => !product.storeCount).length;
  const brandOptions = _uniqueOptions(availableProducts, 'brandId', 'brandName');
  const categoryOptions = _uniqueOptions(availableProducts, 'categoryId', 'categoryName');
  const classOptions = _uniqueOptions(availableProducts, 'therapeuticClassId', 'medicationClassName');
  const hasExtraFilters = kpiFilter !== 'all' || brandFilter !== 'all' || categoryFilter !== 'all' || classFilter !== 'all';

  const rows = availableProducts.filter((product) => {
    if (kpiFilter === 'active' && !product.active) return false;
    if (kpiFilter === 'inactive' && product.active) return false;
    if (kpiFilter === 'controlled' && !product.isControlled) return false;
    if (kpiFilter === 'generic' && !product.isGeneric) return false;
    if (kpiFilter === 'no_store' && product.storeCount) return false;
    if (brandFilter !== 'all' && product.brandId !== brandFilter) return false;
    if (categoryFilter !== 'all' && product.categoryId !== categoryFilter) return false;
    if (classFilter !== 'all' && product.therapeuticClassId !== classFilter) return false;
    if (q) {
      const haystack = (product.name + product.sku + product.brandName + product.categoryName + product.medicationClassName + product.eanCode).toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    return true;
  }).sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR'));

  const clearFilters = () => {
    setKpiFilter('all');
    setBrandFilter('all');
    setCategoryFilter('all');
    setClassFilter('all');
  };

  const handleToggleActive = async (product) => {
    setSavingId(product.id);
    try {
      await setProductActive(product.id, !product.active);
      notify && notify(product.active ? 'Produto desativado.' : 'Produto ativado.', 'success');
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível atualizar o produto.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  const confirmDiscard = async () => {
    const product = discardTarget;
    if (!product) return;
    setSavingId(product.id);
    try {
      await setProductDiscarded(product.id, true);
      notify && notify('Produto descartado.', 'success');
      setDiscardTarget(null);
      setEditProduct((prev) => (prev && prev.id === product.id ? null : prev));
      setViewProduct((prev) => (prev && prev.id === product.id ? null : prev));
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível descartar o produto.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  const discardedProducts = (products || []).filter((product) => product.discarded);

  const openRecoverModal = () => {
    setSelectedRecoverIds(new Set());
    setRecoverOpen(true);
  };

  const toggleRecoverSelection = (productId) => {
    setSelectedRecoverIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const recoverProducts = async (ids) => {
    if (!ids.length) return;
    setRecovering(true);
    try {
      for (const id of ids) {
        await setProductDiscarded(id, false);
      }
      notify && notify(ids.length + ' produto(s) recuperado(s).', 'success');
      setRecoverOpen(false);
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível recuperar os produtos selecionados.', 'warn');
    } finally {
      setRecovering(false);
    }
  };

  const confirmRecoverAll = () => recoverProducts(discardedProducts.map((product) => product.id));
  const confirmRecoverSelected = () => recoverProducts(Array.from(selectedRecoverIds));

  return (
    <>
      <Topbar title="Produtos" sub={rows.length + ' produto(s) exibido(s)'} onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por nome, SKU, marca, categoria ou EAN" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        <div className="inv-kpis">
          <InventoryKpi icon="grid" label="Todos" value={availableProducts.length} active={kpiFilter === 'all'} onClick={() => setKpiFilter('all')} />
          <InventoryKpi icon="check" label="Ativos" value={activeCount} tone="success" active={kpiFilter === 'active'} onClick={() => setKpiFilter('active')} />
          <InventoryKpi icon="pause" label="Inativos" value={inactiveCount} active={kpiFilter === 'inactive'} onClick={() => setKpiFilter('inactive')} />
          <InventoryKpi icon="lock" label="Controlados" value={controlledCount} active={kpiFilter === 'controlled'} onClick={() => setKpiFilter('controlled')} />
          <InventoryKpi icon="leaf" label="Genéricos" value={genericCount} active={kpiFilter === 'generic'} onClick={() => setKpiFilter('generic')} />
          <InventoryKpi icon="bag" label="Sem loja vinculada" value={noStoreCount} tone={noStoreCount ? 'warn' : undefined} active={kpiFilter === 'no_store'} onClick={() => setKpiFilter('no_store')} />
          {isAdmin && (
            <InventoryKpi
              icon="trash"
              label="Descartados"
              value={discardedProducts.length}
              tone={discardedProducts.length ? 'error' : undefined}
              active={false}
              onClick={discardedProducts.length ? openRecoverModal : undefined}
            />
          )}
        </div>

        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="inv-actions">
              {isAdmin && (
                <button
                  className="fa-btn fa-btn-soft fa-btn-sm"
                  disabled={!discardedProducts.length}
                  onClick={openRecoverModal}
                  title={discardedProducts.length ? 'Recuperar produtos descartados' : 'Não há produtos descartados'}
                >
                  <Icon name="repeat" size={15} />Recuperar descartados{discardedProducts.length ? ' (' + discardedProducts.length + ')' : ''}
                </button>
              )}
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={refreshProducts}><Icon name="repeat" size={15} />Atualizar</button>
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setNewOpen(true)}><Icon name="plus" size={15} stroke={2.2} />Novo produto</button>
            </div>
          </div>
          <div className="inv-toolbar-row is-filters">
            <div className="inv-filter-field">
              <label>Marca</label>
              <select className="fa-select" style={{ minWidth: 160 }} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
                <option value="all">Todas as marcas</option>
                {brandOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </div>
            <div className="inv-filter-field">
              <label>Categoria</label>
              <select className="fa-select" style={{ minWidth: 160 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">Todas as categorias</option>
                {categoryOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </div>
            <div className="inv-filter-field">
              <label>Classe terapêutica</label>
              <select className="fa-select" style={{ minWidth: 170 }} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                <option value="all">Todas as classes</option>
                {classOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </div>
            {hasExtraFilters && (
              <button className="fa-btn fa-btn-ghost fa-btn-sm" onClick={clearFilters}>
                <Icon name="close" size={14} />Limpar filtros
              </button>
            )}
          </div>
        </div>

        <div className="ph-table-wrap">
          <table className="ph-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Marca</th>
                <th>Categoria</th>
                <th>Classe terapêutica</th>
                <th>Lojas</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="ph-td-name">{product.name}</div>
                    <div className="ph-cell-sub">
                      {product.eanCode || 'Sem EAN'}
                      {product.isControlled ? ' · Controlado' : ''}
                      {product.isGeneric ? ' · Genérico' : ''}
                    </div>
                  </td>
                  <td className="fa-mono">{product.sku}</td>
                  <td>{product.brandName || '—'}</td>
                  <td>{product.categoryName || '—'}</td>
                  <td>{product.medicationClassName || '—'}</td>
                  <td>{product.storeCount} loja(s) · {product.totalQuantity} un.</td>
                  <td><span className="fa-badge" style={product.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>{product.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="fa-iconbtn"
                      style={{ width: 34, height: 34 }}
                      onClick={() => setViewProduct(product)}
                      aria-label="Visualizar produto"
                      title="Visualizar produto"
                    >
                      <Icon name="eye" size={16} />
                    </button>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginLeft: 8 }} onClick={() => setEditProduct(product)}><Icon name="edit" size={14} />Editar</button>
                    <span style={{ marginLeft: 12, display: 'inline-flex', verticalAlign: 'middle', opacity: savingId === product.id ? 0.5 : 1, pointerEvents: savingId === product.id ? 'none' : 'auto' }}>
                      <Toggle
                        on={product.active}
                        onChange={() => handleToggleActive(product)}
                        ariaLabel={product.active ? 'Desativar produto' : 'Ativar produto'}
                      />
                    </span>
                    <button
                      className="fa-iconbtn"
                      style={{ marginLeft: 8, width: 34, height: 34 }}
                      disabled={savingId === product.id}
                      onClick={() => setDiscardTarget(product)}
                      aria-label="Descartar produto"
                      title="Descartar produto"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="ph-empty">
              <span className="fa-iconbox"><Icon name="capsule" size={28} /></span>
              <div>Nenhum produto encontrado.</div>
              {(hasExtraFilters || q) && (
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10 }} onClick={() => { clearFilters(); setQ(''); }}>
                  <Icon name="close" size={14} />Limpar busca e filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editProduct && (
        <ProductModal
          title="Editar produto"
          submitLabel="Salvar alterações"
          initialProduct={editProduct}
          brands={brands || []}
          categories={categories || []}
          therapeuticClasses={therapeuticClasses || []}
          storeDirectory={storeDirectory || []}
          cnaeOptions={cnaeOptions}
          fetchProductStoreLinks={fetchProductStoreLinks}
          linkProductToStore={linkProductToStore}
          notify={notify}
          activeBusy={savingId === editProduct.id}
          onToggleActive={() => handleToggleActive(editProduct)}
          onDiscard={() => setDiscardTarget(editProduct)}
          onClose={() => setEditProduct(null)}
          onSave={async (payload) => {
            try {
              await updateProduct(editProduct.id, payload);
              setEditProduct(null);
              notify && notify('Produto atualizado.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível atualizar o produto.', 'warn');
            }
          }}
        />
      )}
      {newOpen && (
        <ProductModal
          title="Novo produto"
          submitLabel="Cadastrar produto"
          brands={brands || []}
          categories={categories || []}
          therapeuticClasses={therapeuticClasses || []}
          storeDirectory={storeDirectory || []}
          cnaeOptions={cnaeOptions}
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              await addProduct(payload);
              setNewOpen(false);
              notify && notify('Produto cadastrado. Vá em Estoque para lançar a quantidade em cada loja.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível cadastrar o produto.', 'warn');
            }
          }}
        />
      )}

      {viewProduct && (
        <ViewProductModal
          product={viewProduct}
          onClose={() => setViewProduct(null)}
          onEdit={() => { setEditProduct(viewProduct); setViewProduct(null); }}
        />
      )}

      {discardTarget && (
        <ModalShell open={true} onClose={savingId === discardTarget.id ? () => {} : () => setDiscardTarget(null)} maxw={400}>
          <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14, background: '#FBEAE9', color: 'var(--fa-error)' }}><Icon name="trash" size={24} /></span>
          <h2 className="fa-h3" style={{ fontSize: 20 }}>Descartar produto?</h2>
          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
            <strong>{discardTarget.name}</strong> será descartado e deixará de aparecer na lista de produtos. Um administrador pode recuperá-lo a qualquer momento em "Recuperar descartados".
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="fa-btn fa-btn-ghost fa-btn-block" disabled={savingId === discardTarget.id} onClick={() => setDiscardTarget(null)}>Cancelar</button>
            <button className="fa-btn fa-btn-block" style={{ background: 'var(--fa-error)', color: '#fff', border: 'none' }} disabled={savingId === discardTarget.id} onClick={confirmDiscard}>
              <Icon name="trash" size={15} />Descartar
            </button>
          </div>
        </ModalShell>
      )}

      {recoverOpen && (
        <ModalShell open={true} onClose={recovering ? () => {} : () => setRecoverOpen(false)} maxw={480}>
          <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="repeat" size={24} /></span>
          <h2 className="fa-h3" style={{ fontSize: 20 }}>Recuperar produtos descartados</h2>
          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
            Recupere todos de uma vez ou escolha individualmente quais produtos devem voltar a aparecer na lista.
          </p>
          {discardedProducts.length ? (
            <>
              <button className="fa-btn fa-btn-primary fa-btn-block" disabled={recovering} onClick={confirmRecoverAll}>
                <Icon name="repeat" size={15} />Recuperar todos ({discardedProducts.length})
              </button>
              <div className="ph-cell-sub" style={{ margin: '16px 0 8px' }}>Ou escolha quais recuperar:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: '1px solid var(--fa-mist)', borderRadius: 12, padding: 8 }}>
                {discardedProducts.map((product) => (
                  <label key={product.id} className="fa-check" data-on={selectedRecoverIds.has(product.id) ? '1' : '0'} onClick={() => toggleRecoverSelection(product.id)} style={{ padding: '6px 4px' }}>
                    <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{product.name}</span>
                      <span className="ph-cell-sub">{product.sku}</span>
                    </span>
                  </label>
                ))}
              </div>
              <button
                className="fa-btn fa-btn-soft fa-btn-block"
                style={{ marginTop: 12 }}
                disabled={recovering || !selectedRecoverIds.size}
                onClick={confirmRecoverSelected}
              >
                <Icon name="check" size={15} />Recuperar selecionados ({selectedRecoverIds.size})
              </button>
            </>
          ) : (
            <div className="ph-cell-sub">Nenhum produto descartado no momento.</div>
          )}
          <button className="fa-btn fa-btn-ghost fa-btn-block" style={{ marginTop: 12 }} disabled={recovering} onClick={() => setRecoverOpen(false)}>Fechar</button>
        </ModalShell>
      )}
    </>
  );
}

function ViewProductModal({ product, onClose, onEdit }) {
  const controlledLabel = (CONTROLLED_CATEGORY_OPTIONS.find((option) => option.value === product.controlledCategory) || {}).label || 'Não controlado';
  const galleryUrls = Array.isArray(product.marketplaceGalleryUrls) ? product.marketplaceGalleryUrls : [];
  return (
    <ModalShell open={true} onClose={onClose} maxw={680}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="capsule" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{product.name}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>Dados de identidade e configuração do produto.</p>
      <div className="fa-form2">
        <div className="fa-field"><label>SKU</label><div className="fa-mono">{product.sku || '—'}</div></div>
        <div className="fa-field"><label>Código EAN</label><div>{product.eanCode || '—'}</div></div>
        <div className="fa-field"><label>Marca</label><div>{product.brandName || '—'}</div></div>
        <div className="fa-field"><label>Categoria</label><div>{product.categoryName || '—'}</div></div>
        <div className="fa-field"><label>Classe terapêutica</label><div>{product.medicationClassName || '—'}</div></div>
        <div className="fa-field"><label>Categoria de controle</label><div>{controlledLabel}</div></div>
        <div className="fa-field"><label>Genérico</label><div>{product.isGeneric ? 'Sim' : 'Não'}</div></div>
        <div className="fa-field">
          <label>Status</label>
          <div><span className="fa-badge" style={product.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>{product.active ? 'Ativo' : 'Inativo'}</span></div>
        </div>
        <div className="fa-field"><label>Lojas / estoque</label><div>{product.storeCount || 0} loja(s) · {product.totalQuantity || 0} un.</div></div>
      </div>
      {!!galleryUrls.length && (
        <div style={{ marginTop: 16 }}>
          <label>Galeria do marketplace</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8, marginTop: 8 }}>
            {galleryUrls.map((url, index) => (
              <div key={url.slice(0, 48) + index} style={{ aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--fa-mist)', background: 'var(--fa-mist-2)' }}>
                <img src={url} alt={product.name + ' ' + (index + 1)} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Fechar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 1 }} onClick={onEdit}><Icon name="edit" size={15} />Editar</button>
      </div>
    </ModalShell>
  );
}

function buildProductForm(product) {
  return {
    sku: product && product.sku || '',
    name: product && product.name || '',
    eanCode: product && product.eanCode || '',
    brandId: product && product.brandId || '',
    categoryId: product && product.categoryId || '',
    therapeuticClassId: product && product.therapeuticClassId || '',
    controlledCategory: product && product.controlledCategory || 'none',
    isGeneric: product ? !!product.isGeneric : false,
    cnaeCode: product && product.cnaeCode || '',
    marketplaceGalleryUrls: product && Array.isArray(product.marketplaceGalleryUrls) ? _normalizeImageList(product.marketplaceGalleryUrls) : [],
  };
}

function ProductModal({
  title, submitLabel, initialProduct, brands, categories, therapeuticClasses, storeDirectory, cnaeOptions,
  fetchProductStoreLinks, linkProductToStore, notify, onClose, onSave, onToggleActive, onDiscard, activeBusy,
}) {
  const [form, setForm] = useState(() => buildProductForm(initialProduct));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const valid = form.name.trim().length >= 2;
  const isMarketplaceImageRestricted = MARKETPLACE_IMAGE_RESTRICTED_CATEGORIES.includes(form.controlledCategory);
  const imageInputId = 'product-images-' + (initialProduct ? initialProduct.id : 'new');

  const setControlledCategory = (value) => {
    setForm((prev) => ({
      ...prev,
      controlledCategory: value,
      marketplaceGalleryUrls: MARKETPLACE_IMAGE_RESTRICTED_CATEGORIES.includes(value) ? [] : prev.marketplaceGalleryUrls,
    }));
  };

  const onPickMarketplaceImages = async (event) => {
    if (isMarketplaceImageRestricted) {
      event.target.value = '';
      return;
    }
    const files = Array.from(event.target.files || []).filter((file) => /^image\//i.test(file.type));
    if (!files.length) {
      return;
    }
    try {
      const encoded = await Promise.all(files.map(_fileToDataUrl));
      setForm((prev) => ({ ...prev, marketplaceGalleryUrls: _normalizeImageList([...prev.marketplaceGalleryUrls, ...encoded]) }));
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível adicionar as imagens.', 'warn');
    } finally {
      event.target.value = '';
    }
  };

  const removeMarketplaceImage = (imageUrl) => {
    setForm((prev) => ({ ...prev, marketplaceGalleryUrls: prev.marketplaceGalleryUrls.filter((entry) => entry !== imageUrl) }));
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave({
        ...form,
        marketplaceImageUrl: form.marketplaceGalleryUrls[0] || '',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={780}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="capsule" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        Cadastre a identidade do produto. Quantidade, lote, validade e preço por loja continuam na tela <strong>Estoque</strong>.
      </p>

      {initialProduct && (
        <div className="fa-field" style={{ marginBottom: 18 }}>
          <label>Status do produto</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ opacity: activeBusy ? 0.5 : 1, pointerEvents: activeBusy ? 'none' : 'auto', display: 'inline-flex' }}>
              <Toggle on={initialProduct.active} onChange={onToggleActive} ariaLabel={initialProduct.active ? 'Desativar produto' : 'Ativar produto'} />
            </span>
            <span className="fa-badge" style={initialProduct.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>
              {initialProduct.active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          <div className="ph-cell-sub" style={{ marginTop: 2 }}>Desative para indicar que este produto não é mais vendido pela loja — o produto continua na lista.</div>
          <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10, alignSelf: 'flex-start' }} disabled={activeBusy} onClick={onDiscard}>
            <Icon name="trash" size={14} />Descartar produto
          </button>
          <div className="ph-cell-sub" style={{ marginTop: 4 }}>Descartar remove o produto da lista; um administrador pode recuperá-lo depois.</div>
        </div>
      )}

      <div className="fa-form2">
        <div className="fa-field"><label>SKU</label><input className="fa-input" value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="Gerado automaticamente se vazio" /></div>
        <div className="fa-field fa-span2"><label>Nome do produto *</label><input className="fa-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Paracetamol 750mg — 20 comp." /></div>
        <div className="fa-field"><label>Código EAN</label><input className="fa-input" value={form.eanCode} onChange={(e) => set('eanCode', e.target.value)} /></div>
        <div className="fa-field">
          <label>Marca</label>
          <select className="fa-select" value={form.brandId} onChange={(e) => set('brandId', e.target.value)}>
            <option value="">Sem marca</option>
            {brands.filter((brand) => brand.active && !brand.discarded).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </div>
        <div className="fa-field">
          <label>Categoria</label>
          <select
            className="fa-select"
            value={form.categoryId}
            onChange={(e) => {
              const nextCategoryId = e.target.value;
              setForm((prev) => {
                const currentClass = therapeuticClasses.find((item) => item.id === prev.therapeuticClassId);
                const stillValid = !currentClass || !currentClass.categoryId || currentClass.categoryId === nextCategoryId;
                return { ...prev, categoryId: nextCategoryId, therapeuticClassId: stillValid ? prev.therapeuticClassId : '' };
              });
            }}
          >
            <option value="">Sem categoria</option>
            {categories.filter((category) => category.active && !category.discarded).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div className="fa-field">
          <label>Classe terapêutica</label>
          <select className="fa-select" value={form.therapeuticClassId} onChange={(e) => set('therapeuticClassId', e.target.value)}>
            <option value="">Sem classe</option>
            {therapeuticClasses
              .filter((item) => item.active && !item.discarded)
              .filter((item) => !form.categoryId || !item.categoryId || item.categoryId === form.categoryId)
              .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {form.categoryId && <div className="ph-cell-sub" style={{ marginTop: 6 }}>Mostrando classes vinculadas à categoria selecionada.</div>}
        </div>
        <div className="fa-field">
          <label>CNAE</label>
          <select className="fa-select" value={form.cnaeCode} onChange={(e) => set('cnaeCode', e.target.value)}>
            <option value="">Sem CNAE definido</option>
            {form.cnaeCode && !cnaeOptions.some((entry) => entry.code === form.cnaeCode) && (
              <option value={form.cnaeCode}>{form.cnaeCode} (não cadastrado nas Configurações)</option>
            )}
            {cnaeOptions.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.code}{entry.description ? ' · ' + entry.description : ''}{entry.isPrincipal ? ' (principal)' : ''}
              </option>
            ))}
          </select>
          {!cnaeOptions.length && <div className="ph-cell-sub" style={{ marginTop: 6 }}>Nenhum CNAE cadastrado ainda — cadastre em <strong>Configurações do sistema</strong>.</div>}
        </div>
        <div className="fa-field">
          <label>Categoria de controle</label>
          <select className="fa-select" value={form.controlledCategory} onChange={(e) => setControlledCategory(e.target.value)}>
            {CONTROLLED_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>
      <label className="fa-check" data-on={form.isGeneric ? '1' : '0'} onClick={() => set('isGeneric', !form.isGeneric)} style={{ marginTop: 12 }}>
        <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Medicamento genérico
      </label>

      <div className="prc-compete" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Icon name="image" size={15} style={{ color: 'var(--fa-info)' }} />
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>Galeria do marketplace</span>
          <span className="ph-cell-sub" style={{ marginLeft: 'auto' }}>{isMarketplaceImageRestricted ? 'Imagem regulatória' : form.marketplaceGalleryUrls.length + '/8 imagens'}</span>
        </div>
        {isMarketplaceImageRestricted ? (
          <div className="ph-cell-sub" style={{ marginBottom: 12 }}>
            Imagens e galeria estão bloqueadas para este medicamento. Conforme a RDC nº 96/2008 da Anvisa (propaganda de medicamentos sob prescrição), o marketplace exibirá somente o placeholder regulatório compatível com a categoria de tarja.
          </div>
        ) : <>
          <div className="ph-cell-sub" style={{ marginBottom: 12 }}>
            Adicione uma ou mais imagens para este produto aparecer com galeria própria no marketplace, em todas as lojas que o vendem. Se nenhuma imagem for enviada, a vitrine continua usando o placeholder padrão.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="fa-btn fa-btn-soft" htmlFor={imageInputId}>
              <Icon name="image" size={15} />Adicionar imagens
            </label>
            <input id={imageInputId} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPickMarketplaceImages} />
            {!!form.marketplaceGalleryUrls.length && <button className="fa-btn fa-btn-soft" type="button" onClick={() => set('marketplaceGalleryUrls', [])}><Icon name="close" size={14} />Limpar galeria</button>}
          </div>
        </>}
        {!isMarketplaceImageRestricted && !!form.marketplaceGalleryUrls.length && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 10, marginTop: 14 }}>
            {form.marketplaceGalleryUrls.map((imageUrl, index) => (
              <div key={imageUrl.slice(0, 48) + index} style={{ border: '1px solid var(--fa-mist)', borderRadius: 16, padding: 8, background: '#fff' }}>
                <div style={{ aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', background: 'var(--fa-mist-2)' }}>
                  <img src={imageUrl} alt={form.name + ' ' + (index + 1)} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                  <span className="ph-cell-sub">{index === 0 ? 'Principal' : 'Imagem ' + (index + 1)}</span>
                  <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" onClick={() => removeMarketplaceImage(imageUrl)}>
                    <Icon name="trash" size={13} />Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {initialProduct && (
        <ProductStoreLinksPanel
          product={initialProduct}
          storeDirectory={storeDirectory}
          fetchProductStoreLinks={fetchProductStoreLinks}
          linkProductToStore={linkProductToStore}
          notify={notify}
        />
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />{submitLabel}</button>
      </div>
    </ModalShell>
  );
}

function ProductStoreLinksPanel({ product, storeDirectory, fetchProductStoreLinks, linkProductToStore, notify }) {
  const [links, setLinks] = useState(null);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [linking, setLinking] = useState(false);

  const load = async () => {
    if (!fetchProductStoreLinks) return;
    try {
      const items = await fetchProductStoreLinks(product.id);
      setLinks(items);
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível carregar as lojas vinculadas.', 'warn');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const linkedStoreIds = new Set((links || []).map((link) => link.storeId));
  const availableStores = (storeDirectory || []).filter((store) => store.active && !linkedStoreIds.has(store.id));

  const handleLink = async () => {
    if (!selectedStoreId) return;
    setLinking(true);
    try {
      await linkProductToStore(product.id, selectedStoreId);
      setSelectedStoreId('');
      notify && notify('Loja vinculada. O estoque começa zerado — lance a quantidade na tela Estoque.', 'success');
      await load();
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível vincular a loja.', 'warn');
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="fa-field" style={{ marginTop: 16 }}>
      <label>Lojas vinculadas</label>
      {links === null ? (
        <div className="ph-cell-sub">Carregando...</div>
      ) : links.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {links.map((link) => (
            <div key={link.itemId} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="fa-badge fa-badge-mist">{link.storeName || link.storeId}</span>
              <span className="ph-cell-sub">{link.quantity} un. em estoque</span>
              {!link.isActive && <span className="fa-badge" style={{ background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>Inativo nesta loja</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="ph-cell-sub" style={{ marginBottom: 10 }}>Este produto ainda não está vinculado a nenhuma loja.</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <select className="fa-select" style={{ flex: 1 }} value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
          <option value="">Selecione uma loja para vincular</option>
          {availableStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
        <button className="fa-btn fa-btn-soft fa-btn-sm" disabled={!selectedStoreId || linking} onClick={handleLink}>
          <Icon name="plus" size={14} />Vincular
        </button>
      </div>
      <div className="ph-cell-sub" style={{ marginTop: 6 }}>Desativar o vínculo com uma loja é feito na tela Estoque, editando o item daquela loja.</div>
    </div>
  );
}

export { ProductsScreen };
