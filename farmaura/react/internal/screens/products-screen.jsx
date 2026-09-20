import React, { useEffect, useState } from "react";
import {
  Icon, PageHead, Badge, Tabs, SearchInput, EmptyState, Modal, Field,
  SwitchToggle, RecoverModal, confirmAction,
} from "../core/internal-ui.jsx";

const CONTROLLED_CATEGORY_OPTIONS = [
  { value: "none", label: "Não controlado" },
  { value: "prescription", label: "Venda sob prescrição" },
  { value: "prescription_retention", label: "Prescrição com retenção de receita" },
  { value: "special_control", label: "Controle especial" },
  { value: "black_stripe", label: "Tarja preta" },
];

// RDC nº 96/2008 (Anvisa) proíbe propaganda/publicidade de medicamentos sujeitos a
// prescrição — por isso nenhuma imagem enviada pela farmácia pode ser exibida para
// essas categorias; o marketplace usa somente o placeholder regulatório padrão.
const MARKETPLACE_IMAGE_RESTRICTED_CATEGORIES = ["prescription", "prescription_retention", "special_control", "black_stripe"];
const _normalizeImageList = (value) => Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean))).slice(0, 8);
const _uniqueOptions = (list, idKey, nameKey) => {
  const seen = new Map();
  list.forEach((item) => {
    const id = item[idKey];
    if (id && !seen.has(id)) seen.set(id, item[nameKey] || "");
  });
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
};
const _fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
  reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
  reader.readAsDataURL(file);
});

/* FARMAURA Console — Cadastro de produtos: identidade e configuração, sem dados de estoque. */
function ProductsScreen({ ctx }) {
  const {
    products, brands, categories, therapeuticClasses, storeDirectory, cnaeSettings,
    refreshProducts, refreshBrands, refreshCategories, refreshTherapeuticClasses, refreshStoreDirectory,
    addProduct, updateProduct, setProductActive, setProductDiscarded, fetchProductStoreLinks, linkProductToStore,
    linkProductVariant, unlinkProductVariant,
    notify, user,
  } = ctx;
  const cnaeOptions = (cnaeSettings && cnaeSettings.items) || [];
  const isAdmin = !!(user && window.FA_ACCESS && user.role === window.FA_ACCESS.ROLE.ADMIN);
  const [q, setQ] = useState("");
  const [editProduct, setEditProduct] = useState(null);
  const [viewProduct, setViewProduct] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    refreshProducts && refreshProducts();
    refreshBrands && refreshBrands();
    refreshCategories && refreshCategories();
    refreshTherapeuticClasses && refreshTherapeuticClasses();
    refreshStoreDirectory && refreshStoreDirectory();
  }, []);

  const availableProducts = (products || []).filter((product) => !product.discarded);
  const brandOptions = _uniqueOptions(availableProducts, "brandId", "brandName");
  const categoryOptions = _uniqueOptions(availableProducts, "categoryId", "categoryName");
  const classOptions = _uniqueOptions(availableProducts, "therapeuticClassId", "medicationClassName");

  const rows = availableProducts.filter((product) => {
    if (q) {
      const haystack = (product.name + product.sku + product.brandName + product.categoryName + product.medicationClassName + product.eanCode).toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    return true;
  }).sort((left, right) => (left.name || "").localeCompare(right.name || "", "pt-BR"));

  const handleToggleActive = async (product) => {
    setSavingId(product.id);
    try {
      await setProductActive(product.id, !product.active);
      notify && notify(product.active ? "Produto desativado." : "Produto ativado.", "success");
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível atualizar o produto.", "warn");
    } finally {
      setSavingId("");
    }
  };

  const discardProduct = async (product) => {
    const ok = await confirmAction({
      title: "Descartar produto?",
      body: "O produto deixará de aparecer na lista de produtos. Um administrador pode recuperá-lo a qualquer momento em \"Recuperar descartados\".",
      entity: product.name, danger: true, confirmLabel: "Descartar",
    });
    if (!ok) return;
    setSavingId(product.id);
    try {
      await setProductDiscarded(product.id, true);
      notify && notify("Produto descartado.", "success");
      setEditProduct((prev) => (prev && prev.id === product.id ? null : prev));
      setViewProduct((prev) => (prev && prev.id === product.id ? null : prev));
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível descartar o produto.", "warn");
    } finally {
      setSavingId("");
    }
  };

  const discardedProducts = (products || []).filter((product) => product.discarded);

  const recoverProducts = async (ids) => {
    if (!ids.length) return;
    setRecovering(true);
    try {
      for (const id of ids) {
        await setProductDiscarded(id, false);
      }
      notify && notify(ids.length + " produto(s) recuperado(s).", "success");
      setRecoverOpen(false);
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível recuperar os produtos selecionados.", "warn");
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Catálogo & Estoque" title="Produtos" desc="Cadastro completo com fornecedor, tributação, classe terapêutica e CNAE."
        actions={(
          <>
            {isAdmin && discardedProducts.length > 0 && (
              <button className="btn btn-secondary" onClick={() => setRecoverOpen(true)}>
                <Icon name="repeat" size={14} />Recuperar descartados ({discardedProducts.length})
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Icon name="plus" size={14} />Novo produto</button>
          </>
        )}
      />

      <div className="card">
        <div className="card-head">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome, SKU, marca, categoria ou EAN" />
          <span className="card-head-sub">{rows.length} de {availableProducts.length} registros</span>
        </div>
        <div className="table-wrap">
          <table>
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
                    <div className="cell-strong">{product.name}</div>
                    <div className="cell-muted">
                      {product.eanCode || "Sem EAN"}
                      {product.isControlled ? " · Controlado" : ""}
                      {product.isGeneric ? " · Genérico" : ""}
                    </div>
                  </td>
                  <td className="mono">{product.sku}</td>
                  <td>{product.brandName || "—"}</td>
                  <td>{product.categoryName || "—"}</td>
                  <td>{product.medicationClassName || "—"}</td>
                  <td>{product.storeCount} loja(s) · {product.totalQuantity} un.</td>
                  <td><Badge tone={product.active ? "good" : "neutral"}>{product.active ? "Ativo" : "Inativo"}</Badge></td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                      <button className="icon-btn" onClick={() => setViewProduct(product)} aria-label="Visualizar produto" title="Visualizar produto"><Icon name="eye" size={16} /></button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditProduct(product)}><Icon name="edit" size={14} />Editar</button>
                      <span style={{ opacity: savingId === product.id ? 0.5 : 1, pointerEvents: savingId === product.id ? "none" : "auto" }}>
                        <SwitchToggle on={product.active} onChange={() => handleToggleActive(product)} label={product.active ? "Desativar produto" : "Ativar produto"} />
                      </span>
                      <button className="icon-btn" disabled={savingId === product.id} onClick={() => discardProduct(product)} aria-label="Descartar produto" title="Descartar produto"><Icon name="trash" size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <EmptyState icon="capsule" title="Nenhum produto encontrado" desc={q ? "Limpe a busca para ver todos os produtos." : undefined} />
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
          allProducts={products || []}
          linkProductVariant={linkProductVariant}
          unlinkProductVariant={unlinkProductVariant}
          notify={notify}
          activeBusy={savingId === editProduct.id}
          onToggleActive={() => handleToggleActive(editProduct)}
          onDiscard={() => discardProduct(editProduct)}
          onClose={() => setEditProduct(null)}
          onSave={async (payload) => {
            try {
              await updateProduct(editProduct.id, payload);
              setEditProduct(null);
              notify && notify("Produto atualizado.", "success");
            } catch (error) {
              notify && notify(error && error.message ? error.message : "Não foi possível atualizar o produto.", "warn");
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
              notify && notify("Produto cadastrado. Vá em Estoque para lançar a quantidade em cada loja.", "success");
            } catch (error) {
              notify && notify(error && error.message ? error.message : "Não foi possível cadastrar o produto.", "warn");
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

      {recoverOpen && (
        <RecoverModal
          label="produtos" discarded={discardedProducts} nameOf={(p) => p.name + " · " + p.sku}
          onClose={() => setRecoverOpen(false)}
          onRecover={recoverProducts}
        />
      )}
    </div>
  );
}

function ViewProductModal({ product, onClose, onEdit }) {
  const controlledLabel = (CONTROLLED_CATEGORY_OPTIONS.find((option) => option.value === product.controlledCategory) || {}).label || "Não controlado";
  const galleryUrls = Array.isArray(product.marketplaceGalleryUrls) ? product.marketplaceGalleryUrls : [];
  return (
    <Modal
      open onClose={onClose} title={product.name} subtitle="Dados de identidade e configuração do produto."
      footer={(
        <>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>Fechar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={onEdit}><Icon name="edit" size={15} />Editar</button>
        </>
      )}
    >
      <div className="grid g-2">
        <Field label="SKU"><div className="mono">{product.sku || "—"}</div></Field>
        <Field label="Código EAN"><div>{product.eanCode || "—"}</div></Field>
        <Field label="Marca"><div>{product.brandName || "—"}</div></Field>
        <Field label="Categoria"><div>{product.categoryName || "—"}</div></Field>
        <Field label="Classe terapêutica"><div>{product.medicationClassName || "—"}</div></Field>
        <Field label="Categoria de controle"><div>{controlledLabel}</div></Field>
        <Field label="Genérico"><div>{product.isGeneric ? "Sim" : "Não"}</div></Field>
        <Field label="Status"><Badge tone={product.active ? "good" : "neutral"}>{product.active ? "Ativo" : "Inativo"}</Badge></Field>
        <Field label="Lojas / estoque"><div>{product.storeCount || 0} loja(s) · {product.totalQuantity || 0} un.</div></Field>
      </div>
      {!!galleryUrls.length && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Galeria do marketplace</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}>
            {galleryUrls.map((url, index) => (
              <div key={url.slice(0, 48) + index} style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)", background: "#fff" }}>
                <img src={url} alt={product.name + " " + (index + 1)} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function buildProductForm(product) {
  return {
    sku: product && product.sku || "",
    name: product && product.name || "",
    eanCode: product && product.eanCode || "",
    brandId: product && product.brandId || "",
    categoryId: product && product.categoryId || "",
    therapeuticClassId: product && product.therapeuticClassId || "",
    controlledCategory: product && product.controlledCategory || "none",
    isGeneric: product ? !!product.isGeneric : false,
    cnaeCode: product && product.cnaeCode || "",
    marketplaceGalleryUrls: product && Array.isArray(product.marketplaceGalleryUrls) ? _normalizeImageList(product.marketplaceGalleryUrls) : [],
    shortDescription: product && product.shortDescription || "",
    bulaMarkdown: product && product.bulaMarkdown || "",
    marketingHighlights: product && Array.isArray(product.marketingHighlights) ? product.marketingHighlights : [],
    variantLabel: product && product.variantLabel || "",
    cashbackPercent: product && product.cashbackPercent != null ? product.cashbackPercent : "",
  };
}

function ProductModal({
  title, submitLabel, initialProduct, brands, categories, therapeuticClasses, storeDirectory, cnaeOptions,
  fetchProductStoreLinks, linkProductToStore, allProducts, linkProductVariant, unlinkProductVariant,
  notify, onClose, onSave, onToggleActive, onDiscard, activeBusy,
}) {
  const [form, setForm] = useState(() => buildProductForm(initialProduct));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const valid = form.name.trim().length >= 2;
  const isMarketplaceImageRestricted = MARKETPLACE_IMAGE_RESTRICTED_CATEGORIES.includes(form.controlledCategory);
  const imageInputId = "product-images-" + (initialProduct ? initialProduct.id : "new");

  const setControlledCategory = (value) => {
    setForm((prev) => ({
      ...prev,
      controlledCategory: value,
      marketplaceGalleryUrls: MARKETPLACE_IMAGE_RESTRICTED_CATEGORIES.includes(value) ? [] : prev.marketplaceGalleryUrls,
    }));
  };

  const onPickMarketplaceImages = async (event) => {
    if (isMarketplaceImageRestricted) {
      event.target.value = "";
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
      notify && notify(error && error.message ? error.message : "Não foi possível adicionar as imagens.", "warn");
    } finally {
      event.target.value = "";
    }
  };

  const removeMarketplaceImage = (imageUrl) => {
    setForm((prev) => ({ ...prev, marketplaceGalleryUrls: prev.marketplaceGalleryUrls.filter((entry) => entry !== imageUrl) }));
  };

  const [highlightDraft, setHighlightDraft] = useState("");
  const addHighlight = () => {
    const value = highlightDraft.trim();
    if (!value || form.marketingHighlights.length >= 8) return;
    setForm((prev) => ({ ...prev, marketingHighlights: [...prev.marketingHighlights, value] }));
    setHighlightDraft("");
  };
  const removeHighlight = (index) => {
    setForm((prev) => ({ ...prev, marketingHighlights: prev.marketingHighlights.filter((_, i) => i !== index) }));
  };

  // Grouping (variant_group_id) lives on the server, mutated only through link/unlink — kept as
  // local state seeded from initialProduct and updated from each call's response, independent of
  // the regular save flow, since it's a relationship between two products, not a field of one.
  const [variantGroupId, setVariantGroupId] = useState(initialProduct && initialProduct.variantGroupId || "");
  const [variantLabel, setVariantLabel] = useState(initialProduct && initialProduct.variantLabel || "");
  const [variantTargetId, setVariantTargetId] = useState("");
  const [variantLabelDraft, setVariantLabelDraft] = useState("");
  const [variantBusy, setVariantBusy] = useState(false);

  const handleLinkVariant = async () => {
    if (!variantTargetId || !variantLabelDraft.trim() || !linkProductVariant) return;
    setVariantBusy(true);
    try {
      const updated = await linkProductVariant(initialProduct.id, variantTargetId, variantLabelDraft.trim());
      setVariantGroupId(updated.variantGroupId || "");
      setVariantLabel(updated.variantLabel || "");
      setVariantTargetId("");
      setVariantLabelDraft("");
      notify && notify("Produto vinculado como variação.", "success");
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível vincular a variação.", "warn");
    } finally {
      setVariantBusy(false);
    }
  };

  const handleUnlinkVariant = async () => {
    if (!unlinkProductVariant) return;
    setVariantBusy(true);
    try {
      const updated = await unlinkProductVariant(initialProduct.id);
      setVariantGroupId(updated.variantGroupId || "");
      setVariantLabel(updated.variantLabel || "");
      notify && notify("Produto desvinculado da variação.", "success");
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível desvincular.", "warn");
    } finally {
      setVariantBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave({
        ...form,
        marketplaceImageUrl: form.marketplaceGalleryUrls[0] || "",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={busy ? () => {} : onClose} title={title} wide
      subtitle="Cadastre a identidade do produto. Quantidade, lote, validade e preço por loja continuam na tela Estoque."
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />{submitLabel}</button>
        </>
      )}
    >
      {initialProduct && (
        <Field label="Status do produto">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ opacity: activeBusy ? 0.5 : 1, pointerEvents: activeBusy ? "none" : "auto", display: "inline-flex" }}>
              <SwitchToggle on={initialProduct.active} onChange={onToggleActive} label={initialProduct.active ? "Desativar produto" : "Ativar produto"} />
            </span>
            <Badge tone={initialProduct.active ? "good" : "neutral"}>{initialProduct.active ? "Ativo" : "Inativo"}</Badge>
          </div>
          <div className="cell-muted" style={{ marginTop: 2 }}>Desative para indicar que este produto não é mais vendido pela loja — o produto continua na lista.</div>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10, alignSelf: "flex-start" }} disabled={activeBusy} onClick={onDiscard}>
            <Icon name="trash" size={14} />Descartar produto
          </button>
          <div className="cell-muted" style={{ marginTop: 4 }}>Descartar remove o produto da lista; um administrador pode recuperá-lo depois.</div>
        </Field>
      )}

      <div className="grid g-2">
        <Field label="SKU"><input className="input" value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="Gerado automaticamente se vazio" /></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Nome do produto *"><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Paracetamol 750mg — 20 comp." /></Field></div>
        <Field label="Código EAN"><input className="input" value={form.eanCode} onChange={(e) => set("eanCode", e.target.value)} /></Field>
        <Field label="Marca">
          <select className="input" value={form.brandId} onChange={(e) => set("brandId", e.target.value)}>
            <option value="">Sem marca</option>
            {brands.filter((brand) => brand.active && !brand.discarded).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </Field>
        <Field label="Categoria">
          <select
            className="input"
            value={form.categoryId}
            onChange={(e) => {
              const nextCategoryId = e.target.value;
              setForm((prev) => {
                const currentClass = therapeuticClasses.find((item) => item.id === prev.therapeuticClassId);
                const stillValid = !currentClass || !currentClass.categoryId || currentClass.categoryId === nextCategoryId;
                return { ...prev, categoryId: nextCategoryId, therapeuticClassId: stillValid ? prev.therapeuticClassId : "" };
              });
            }}
          >
            <option value="">Sem categoria</option>
            {categories.filter((category) => category.active && !category.discarded).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
        <Field label="Classe terapêutica" hint={form.categoryId ? "Mostrando classes vinculadas à categoria selecionada." : undefined}>
          <select className="input" value={form.therapeuticClassId} onChange={(e) => set("therapeuticClassId", e.target.value)}>
            <option value="">Sem classe</option>
            {therapeuticClasses
              .filter((item) => item.active && !item.discarded)
              .filter((item) => !form.categoryId || !item.categoryId || item.categoryId === form.categoryId)
              .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="CNAE" hint={!cnaeOptions.length ? "Nenhum CNAE cadastrado ainda — cadastre em Configurações do sistema." : undefined}>
          <select className="input" value={form.cnaeCode} onChange={(e) => set("cnaeCode", e.target.value)}>
            <option value="">Sem CNAE definido</option>
            {form.cnaeCode && !cnaeOptions.some((entry) => entry.code === form.cnaeCode) && (
              <option value={form.cnaeCode}>{form.cnaeCode} (não cadastrado nas Configurações)</option>
            )}
            {cnaeOptions.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.code}{entry.description ? " · " + entry.description : ""}{entry.isPrincipal ? " (principal)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Categoria de controle">
          <select className="input" value={form.controlledCategory} onChange={(e) => setControlledCategory(e.target.value)}>
            {CONTROLLED_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 12 }} onClick={() => set("isGeneric", !form.isGeneric)}>
        <span style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", background: form.isGeneric ? "var(--accent)" : "transparent", borderColor: form.isGeneric ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>
          {form.isGeneric && <Icon name="check" size={12} />}
        </span>
        Medicamento genérico
      </label>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <Icon name="image" size={15} style={{ color: "var(--info)" }} />
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>Galeria do marketplace</span>
          <span className="cell-muted" style={{ marginLeft: "auto" }}>{isMarketplaceImageRestricted ? "Imagem regulatória" : form.marketplaceGalleryUrls.length + "/8 imagens"}</span>
        </div>
        {isMarketplaceImageRestricted ? (
          <div className="cell-muted" style={{ marginBottom: 12 }}>
            Imagens e galeria estão bloqueadas para este medicamento. Conforme a RDC nº 96/2008 da Anvisa (propaganda de medicamentos sob prescrição), o marketplace exibirá somente o placeholder regulatório compatível com a categoria de tarja.
          </div>
        ) : <>
          <div className="cell-muted" style={{ marginBottom: 12 }}>
            Adicione uma ou mais imagens para este produto aparecer com galeria própria no marketplace, em todas as lojas que o vendem. Se nenhuma imagem for enviada, a vitrine continua usando o placeholder padrão.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label className="btn btn-secondary" htmlFor={imageInputId}><Icon name="image" size={15} />Adicionar imagens</label>
            <input id={imageInputId} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onPickMarketplaceImages} />
            {!!form.marketplaceGalleryUrls.length && <button className="btn btn-secondary" type="button" onClick={() => set("marketplaceGalleryUrls", [])}><Icon name="close" size={14} />Limpar galeria</button>}
          </div>
        </>}
        {!isMarketplaceImageRestricted && !!form.marketplaceGalleryUrls.length && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))", gap: 10, marginTop: 14 }}>
            {form.marketplaceGalleryUrls.map((imageUrl, index) => (
              <div key={imageUrl.slice(0, 48) + index} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 8, background: "#fff" }}>
                <div style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--surface-2)" }}>
                  <img src={imageUrl} alt={form.name + " " + (index + 1)} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                  <span className="cell-muted">{index === 0 ? "Principal" : "Imagem " + (index + 1)}</span>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => removeMarketplaceImage(imageUrl)}><Icon name="trash" size={13} />Remover</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Field label="Descrição do produto (marketplace)" hint='Parágrafo curto exibido na página do produto, no painel "Descrição" — diferente da bula e dos tópicos abaixo.'>
          <textarea className="input" style={{ height: 90, resize: "vertical", fontFamily: "inherit" }} value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} placeholder="Ex.: Losartana Potássica é indicada para o tratamento da hipertensão arterial..." />
        </Field>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Descrição em tópicos (marketplace)</div>
        <div className="cell-muted" style={{ marginBottom: 8 }}>Frases curtas exibidas na página do produto — número de unidades, tempo de ação, tamanho etc. Até 8 tópicos.</div>
        {!!form.marketingHighlights.length && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {form.marketingHighlights.map((topic, index) => (
              <span key={index} style={{ display: "inline-flex" }}>
                <Badge tone="neutral">
                  {topic}
                  <button type="button" onClick={() => removeHighlight(index)} aria-label="Remover tópico" style={{ border: "none", background: "none", padding: 0, display: "inline-flex", cursor: "pointer", color: "inherit", marginLeft: 4 }}>
                    <Icon name="close" size={12} />
                  </button>
                </Badge>
              </span>
            ))}
          </div>
        )}
        {form.marketingHighlights.length < 8 && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input" value={highlightDraft} placeholder="Ex.: 30 comprimidos por caixa"
              onChange={(e) => setHighlightDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addHighlight(); } }}
            />
            <button type="button" className="btn btn-secondary" onClick={addHighlight}><Icon name="plus" size={14} />Adicionar</button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Field label="Bula do medicamento (Markdown)" hint="Indicações, contraindicações, modo de uso — exibida na página do produto. Deixe em branco se não aplicável.">
          <textarea className="input" style={{ height: 160, resize: "vertical", fontFamily: "inherit" }} value={form.bulaMarkdown} onChange={(e) => set("bulaMarkdown", e.target.value)} placeholder={"## Indicações\n\n..."} />
        </Field>
      </div>

      <div style={{ marginTop: 16, maxWidth: 220 }}>
        <Field label="% de cashback" hint="Percentual do valor da compra creditado na carteira do cliente. Em branco usa o padrão da loja (configurado em Precificação).">
          <input className="input" type="number" min={0} max={100} step="0.1" value={form.cashbackPercent} onChange={(e) => set("cashbackPercent", e.target.value)} placeholder="Padrão da loja" />
        </Field>
      </div>

      {initialProduct && (
        <ProductVariantPanel
          currentProduct={initialProduct}
          allProducts={allProducts}
          variantGroupId={variantGroupId}
          variantLabel={variantLabel}
          variantTargetId={variantTargetId}
          setVariantTargetId={setVariantTargetId}
          variantLabelDraft={variantLabelDraft}
          setVariantLabelDraft={setVariantLabelDraft}
          variantBusy={variantBusy}
          onLink={handleLinkVariant}
          onUnlink={handleUnlinkVariant}
        />
      )}

      {initialProduct && (
        <ProductStoreLinksPanel
          product={initialProduct}
          storeDirectory={storeDirectory}
          fetchProductStoreLinks={fetchProductStoreLinks}
          linkProductToStore={linkProductToStore}
          notify={notify}
        />
      )}
    </Modal>
  );
}

function ProductStoreLinksPanel({ product, storeDirectory, fetchProductStoreLinks, linkProductToStore, notify }) {
  const [links, setLinks] = useState(null);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [linking, setLinking] = useState(false);

  const load = async () => {
    if (!fetchProductStoreLinks) return;
    try {
      const items = await fetchProductStoreLinks(product.id);
      setLinks(items);
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível carregar as lojas vinculadas.", "warn");
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
      setSelectedStoreId("");
      notify && notify("Loja vinculada. O estoque começa zerado — lance a quantidade na tela Estoque.", "success");
      await load();
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível vincular a loja.", "warn");
    } finally {
      setLinking(false);
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Lojas vinculadas</div>
      {links === null ? (
        <div className="cell-muted">Carregando...</div>
      ) : links.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {links.map((link) => (
            <div key={link.itemId} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge tone="neutral">{link.storeName || link.storeId}</Badge>
              <span className="cell-muted">{link.quantity} un. em estoque</span>
              {!link.isActive && <Badge tone="neutral">Inativo nesta loja</Badge>}
            </div>
          ))}
        </div>
      ) : (
        <div className="cell-muted" style={{ marginBottom: 10 }}>Este produto ainda não está vinculado a nenhuma loja.</div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <select className="input" style={{ flex: 1 }} value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
          <option value="">Selecione uma loja para vincular</option>
          {availableStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" disabled={!selectedStoreId || linking} onClick={handleLink}><Icon name="plus" size={14} />Vincular</button>
      </div>
      <div className="cell-muted" style={{ marginTop: 6 }}>Desativar o vínculo com uma loja é feito na tela Estoque, editando o item daquela loja.</div>
    </div>
  );
}

/* Dosagem/tamanho: vincula este produto a outro já cadastrado como variação — o cliente escolhe
   entre eles na própria página do produto (navegação real entre dois produtos independentes, cada
   um com seu próprio preço/estoque, não um estado compartilhado fake). */
function ProductVariantPanel({
  currentProduct, allProducts, variantGroupId, variantLabel,
  variantTargetId, setVariantTargetId, variantLabelDraft, setVariantLabelDraft, variantBusy, onLink, onUnlink,
}) {
  const siblings = (allProducts || []).filter(
    (product) => product.id !== currentProduct.id && variantGroupId && product.variantGroupId === variantGroupId,
  );
  const linkableProducts = (allProducts || []).filter(
    (product) => product.id !== currentProduct.id && !product.discarded,
  );

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Dosagem / tamanho (variação de outro produto)</div>
      {variantGroupId ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Badge tone="neutral">Rótulo desta variação: {variantLabel || "—"}</Badge>
            <button className="btn btn-secondary btn-sm" disabled={variantBusy} onClick={onUnlink}><Icon name="close" size={13} />Desvincular</button>
          </div>
          {siblings.length ? (
            <div className="cell-muted">Outras variações deste grupo: {siblings.map((sibling) => sibling.variantLabel || sibling.name).join(", ")}</div>
          ) : (
            <div className="cell-muted">Nenhum outro produto está vinculado a este grupo no momento.</div>
          )}
        </div>
      ) : (
        <div className="cell-muted" style={{ marginBottom: 10 }}>Este produto ainda não é uma variação de outro. Vincule para que o cliente possa trocar entre dosagens/tamanhos na página do produto.</div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select className="input" style={{ flex: 1, minWidth: 200 }} value={variantTargetId} onChange={(e) => setVariantTargetId(e.target.value)}>
          <option value="">Selecione o produto para vincular</option>
          {linkableProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <input className="input" style={{ maxWidth: 160 }} value={variantLabelDraft} placeholder="Rótulo, ex.: 50mg" onChange={(e) => setVariantLabelDraft(e.target.value)} />
        <button className="btn btn-secondary btn-sm" disabled={!variantTargetId || !variantLabelDraft.trim() || variantBusy} onClick={onLink}><Icon name="plus" size={14} />Vincular</button>
      </div>
    </div>
  );
}

export { ProductsScreen };
