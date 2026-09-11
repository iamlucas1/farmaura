import React, { useEffect, useMemo, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { buildInvoiceDraftLine } from "./inventory-screen.jsx";
import { Icon, PageHead, Badge, StatCard, PillNav, EmptyState, Field } from "../core/internal-ui.jsx";

/* FARMAURA Console — Confirmar Compra.
   Ponte controlada entre Orçamentos e Estoque: o usuário escolhe um orçamento confirmado, decide
   quais itens realmente comprou (e em que quantidade), e essa decisão explícita é lançada no
   estoque real via o mesmo pipeline já usado pela importação de nota fiscal por IA
   (`InventoryInvoiceService.confirm_invoice_import` / `ctx.confirmInventoryInvoice`) — nenhuma
   lógica de gravação de estoque é duplicada aqui, só a montagem do payload de revisão a partir do
   orçamento em vez de a partir de um arquivo. Um orçamento sozinho nunca vira estoque: só essa
   ação explícita de confirmação faz isso. */

function referenceCodeForQuote(quoteId) {
  return "COMPRA-" + quoteId.slice(0, 8).toUpperCase();
}

function PurchaseReceivingScreen({ ctx }) {
  const {
    inventory, inventoryLocations, fetchPurchaseQuotes, previewPurchaseQuoteReceiving, confirmInventoryInvoice,
    pendingPurchaseQuoteId, setPendingPurchaseQuoteId, notify,
  } = ctx;

  const [quotes, setQuotes] = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [stage, setStage] = useState("select");
  const [preview, setPreview] = useState(null);
  const [draftItems, setDraftItems] = useState([]);
  const [note, setNote] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const categoryOptions = useMemo(
    () => [...new Set((inventory || []).map((item) => item.cat || "Medicamentos"))].sort((left, right) => left.localeCompare(right, "pt-BR")),
    [inventory]
  );
  const classOptions = useMemo(
    () => [...new Set((inventory || []).map((item) => item.medClass || "Geral"))].sort((left, right) => left.localeCompare(right, "pt-BR")),
    [inventory]
  );

  useEffect(() => {
    (async () => {
      setLoadingQuotes(true);
      try {
        const items = await fetchPurchaseQuotes({ status: "confirmed" });
        setQuotes(items);
      } catch (error) {
        notify && notify(error && error.message ? error.message : "Não foi possível carregar os orçamentos confirmados.", "warn");
      } finally {
        setLoadingQuotes(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (pendingPurchaseQuoteId) {
      setSelectedQuoteId(pendingPurchaseQuoteId);
      setPendingPurchaseQuoteId("");
    }
  }, [pendingPurchaseQuoteId]);

  const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteId) || null;

  const setDraftItem = (lineId, patch) => {
    setDraftItems((prev) => prev.map((item) => item.lineId === lineId ? { ...item, ...patch } : item));
  };

  const defaultBoughtAction = (item) => (item.matchCandidates && item.matchCandidates.length ? "existing" : "new");
  const toggleBought = (item) => setDraftItem(item.lineId, { action: item.action === "skip" ? defaultBoughtAction(item) : "skip" });
  const markAllBought = () => setDraftItems((prev) => prev.map((item) => item.isComodato ? item : { ...item, action: defaultBoughtAction(item) }));
  const markNoneBought = () => setDraftItems((prev) => prev.map((item) => ({ ...item, action: "skip" })));
  const toggleExpanded = (lineId) => setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
    return next;
  });

  const handleAnalyze = async () => {
    if (!selectedQuoteId) return;
    setBusy(true);
    try {
      const payload = await previewPurchaseQuoteReceiving(selectedQuoteId);
      setPreview(payload);
      setReferenceCode(referenceCodeForQuote(selectedQuoteId));
      setNote("Compra registrada a partir do orçamento de " + (selectedQuote ? selectedQuote.supplierName : payload.header.supplierName));
      const drafts = (payload.items || []).map((item) => {
        const draft = buildInvoiceDraftLine(item, inventoryLocations, categoryOptions);
        return { ...draft, isComodato: item.isComodato, action: item.isComodato ? "skip" : draft.action };
      });
      setDraftItems(drafts);
      setExpandedIds(new Set(drafts.filter((item) => item.action === "new").map((item) => item.lineId)));
      setStage("review");
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível analisar os itens deste orçamento.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    const activeLines = draftItems.filter((item) => item.action !== "skip");
    if (!activeLines.length) {
      notify("Selecione ao menos um item para registrar a compra.", "warn");
      return;
    }
    const invalidNew = activeLines.find((item) => item.action === "new" && (!item.name.trim() || !item.storageLocationCode.trim() || !item.medicationClassName.trim() || !item.categoryName.trim()));
    if (invalidNew) {
      notify("Preencha nome, categoria, classe e localização para todos os itens novos antes de confirmar.", "warn");
      return;
    }
    const invalidExisting = activeLines.find((item) => item.action === "existing" && !item.matchedItemId);
    if (invalidExisting) {
      notify("Selecione o item correspondente para cada linha vinculada a um produto existente.", "warn");
      return;
    }
    const invalidThresholds = activeLines.find((item) => Number(item.lowStockThreshold || 0) > Number(item.attentionStockThreshold || 0) || Number(item.attentionStockThreshold || 0) > Number(item.normalStockThreshold || 0));
    if (invalidThresholds) {
      notify("Revise as faixas de estoque. A ordem deve ser baixa <= atenção <= normal.", "warn");
      return;
    }
    setBusy(true);
    try {
      const response = await confirmInventoryInvoice({
        supplierName: preview.header.supplierName,
        referenceCode,
        note,
        items: draftItems,
      });
      setLastResult(response);
      setStage("done");
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível confirmar a compra.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const resetToSelect = () => {
    setStage("select");
    setSelectedQuoteId("");
    setPreview(null);
    setDraftItems([]);
    setLastResult(null);
  };

  return (
    <div className="route-fade">
      <PageHead eyebrow="Compras" title="Confirmar Compra" desc="Selecione um orçamento e registre no estoque o que foi realmente comprado" />

      {stage === "select" && (
        <>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <Field label="Orçamento confirmado">
              <select className="input" value={selectedQuoteId} onChange={(e) => setSelectedQuoteId(e.target.value)} disabled={loadingQuotes}>
                <option value="">{loadingQuotes ? "Carregando…" : "Selecione um orçamento"}</option>
                {quotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>{quote.supplierName} · cotado em {quote.quoteDate} · {quote.items.length} item(ns)</option>
                ))}
              </select>
            </Field>
            {!loadingQuotes && !quotes.length && (
              <div className="cell-muted" style={{ marginTop: 10 }}>Nenhum orçamento confirmado ainda. Cadastre ou confirme um orçamento na tela <strong>Cotações</strong> primeiro.</div>
            )}
          </div>

          {selectedQuote && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Item</th><th>Marca</th><th>Unidade</th><th>Qtd. cotada</th><th>Preço unitário</th></tr>
                  </thead>
                  <tbody>
                    {selectedQuote.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}{item.isComodato ? <span style={{ marginLeft: 6 }}><Badge tone="neutral"><Icon name="gift" size={11} />Comodato</Badge></span> : null}</td>
                        <td>{item.brandName || "—"}</td>
                        <td>{item.unit}</td>
                        <td>{item.quantityReference != null ? item.quantityReference : "—"}</td>
                        <td>{brl(item.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button className="btn btn-primary" disabled={!selectedQuoteId || busy} onClick={handleAnalyze}>
            <Icon name="search" size={16} />{busy ? "Analisando…" : "Analisar itens deste orçamento"}
          </button>
        </>
      )}

      {stage === "review" && preview && (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <p className="cell-muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
                Revise cada linha, ajuste a quantidade realmente comprada e confirme apenas quando estiver
                consistente. A quantidade abaixo entra no estoque na unidade de venda (unidade avulsa). Quando
                o item foi cotado por caixa/pacote com a quantidade de unidades informada, a conversão já vem
                sugerida aqui — confira antes de confirmar.
              </p>
            </div>
            <div className="card card-pad" style={{ minWidth: 300, flex: "0 0 340px" }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{preview.header.supplierName || "Fornecedor não identificado"}</div>
              <div className="cell-muted" style={{ lineHeight: 1.7 }}>
                <div>Data da cotação: <span className="mono">{preview.header.issueDate || "—"}</span></div>
                <div>Itens: <span className="mono">{draftItems.length}</span></div>
              </div>
            </div>
          </div>

          <div className="grid g-2" style={{ marginBottom: 16 }}>
            <Field label="Referência da movimentação"><input className="input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} /></Field>
            <Field label="Observação geral"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
            <span className="cell-muted">{draftItems.filter((item) => item.action !== "skip").length} de {draftItems.length} itens marcados como comprados</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={markAllBought}><Icon name="check" size={14} />Marcar todos como comprados</button>
              <button className="btn btn-secondary btn-sm" onClick={markNoneBought}><Icon name="close" size={14} />Desmarcar todos</button>
            </div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={draftItems.length > 0 && draftItems.every((item) => item.action !== "skip")} onChange={() => (draftItems.every((item) => item.action !== "skip") ? markNoneBought() : markAllBought())} aria-label="Marcar todos como comprados" /></th>
                    <th>Produto</th>
                    <th>Ação</th>
                    <th>Vincular a / Nome</th>
                    <th>Localização</th>
                    <th>Quantidade</th>
                    <th>Custo (R$)</th>
                    <th>Preço venda (R$)</th>
                    <th>Valor total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {draftItems.map((item, index) => {
                    const bought = item.action !== "skip";
                    const expanded = expandedIds.has(item.lineId);
                    const lineTotal = Number(item.quantity || 0) * Number(item.acquisitionCost || 0);
                    return (
                      <React.Fragment key={item.lineId}>
                        <tr style={!bought ? { opacity: 0.55 } : undefined}>
                          <td><input type="checkbox" checked={bought} onChange={() => toggleBought(item)} aria-label={"Comprei " + (item.description || item.name)} /></td>
                          <td>
                            <div className="cell-strong">{item.description || item.name || "Item " + (index + 1)}</div>
                            {item.isComodato && <div style={{ marginTop: 4 }}><Badge tone="neutral"><Icon name="gift" size={11} />Comodato</Badge></div>}
                          </td>
                          <td>
                            {bought ? (
                              <PillNav
                                options={[{ key: "existing", label: "Existente" }, { key: "new", label: "Novo" }]}
                                active={item.action}
                                onChange={(key) => {
                                  if (key === "existing") setDraftItem(item.lineId, { action: "existing", matchedItemId: item.matchedItemId || (item.matchCandidates[0] ? item.matchCandidates[0].id : "") });
                                  else { setDraftItem(item.lineId, { action: "new" }); setExpandedIds((prev) => new Set(prev).add(item.lineId)); }
                                }}
                              />
                            ) : <span className="cell-muted">Não comprei</span>}
                          </td>
                          <td style={{ minWidth: 220 }}>
                            {!bought ? <span className="cell-muted">—</span> : item.action === "existing" ? (
                              <select className="input" value={item.matchedItemId} onChange={(e) => {
                                const selected = item.matchCandidates.find((candidate) => candidate.id === e.target.value);
                                setDraftItem(item.lineId, {
                                  matchedItemId: e.target.value,
                                  storageLocationCode: selected ? selected.storageLocationCode : item.storageLocationCode,
                                  isControlled: selected ? selected.isControlled : item.isControlled,
                                  minimumQuantity: selected ? selected.minimumQuantity : item.minimumQuantity,
                                  categoryName: selected ? selected.categoryName || item.categoryName : item.categoryName,
                                  medicationClassName: selected ? selected.medicationClassName : item.medicationClassName,
                                  lowStockThreshold: selected ? selected.lowStockThreshold : item.lowStockThreshold,
                                  attentionStockThreshold: selected ? selected.attentionStockThreshold : item.attentionStockThreshold,
                                  normalStockThreshold: selected ? selected.normalStockThreshold : item.normalStockThreshold,
                                });
                              }}>
                                <option value="">Selecione um item já cadastrado</option>
                                {item.matchCandidates.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.brandName || "Sem marca"} · {candidate.eanCode || candidate.sku}</option>
                                ))}
                              </select>
                            ) : (
                              <input className="input" value={item.name} onChange={(e) => setDraftItem(item.lineId, { name: e.target.value })} placeholder="Nome do novo produto *" />
                            )}
                          </td>
                          <td style={{ minWidth: 160 }}>
                            {bought ? (
                              <select className="input" value={item.storageLocationCode} onChange={(e) => setDraftItem(item.lineId, { storageLocationCode: e.target.value })}>
                                {(inventoryLocations || []).map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}
                              </select>
                            ) : <span className="cell-muted">—</span>}
                          </td>
                          <td style={{ minWidth: 90 }}>
                            {bought ? <input className="input" type="number" min="0" value={item.quantity} onChange={(e) => setDraftItem(item.lineId, { quantity: Number(e.target.value || 0) })} /> : <span className="cell-muted">—</span>}
                          </td>
                          <td style={{ minWidth: 100 }}>
                            {bought ? <input className="input" type="number" step="0.01" min="0" value={item.acquisitionCost} onChange={(e) => setDraftItem(item.lineId, { acquisitionCost: Number(e.target.value || 0) })} /> : <span className="cell-muted">—</span>}
                          </td>
                          <td style={{ minWidth: 100 }}>
                            {bought ? <input className="input" type="number" step="0.01" min="0" value={item.salePrice} onChange={(e) => setDraftItem(item.lineId, { salePrice: Number(e.target.value || 0) })} /> : <span className="cell-muted">—</span>}
                          </td>
                          <td style={{ fontWeight: 700 }}>{bought ? brl(lineTotal) : "—"}</td>
                          <td>
                            <button className="icon-btn" onClick={() => toggleExpanded(item.lineId)} aria-label="Mais detalhes" title="Mais detalhes">
                              <Icon name="chevD" size={14} style={expanded ? { transform: "rotate(180deg)" } : undefined} />
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={10} style={{ background: "var(--surface-2)" }}>
                              <div className="grid g-3" style={{ padding: "12px 4px" }}>
                                <Field label="SKU"><input className="input" value={item.sku} onChange={(e) => setDraftItem(item.lineId, { sku: e.target.value })} disabled={!bought || item.action === "existing"} /></Field>
                                <Field label="Marca"><input className="input" value={item.brandName} onChange={(e) => setDraftItem(item.lineId, { brandName: e.target.value })} disabled={!bought || item.action === "existing"} /></Field>
                                <Field label="EAN"><input className="input" value={item.eanCode} onChange={(e) => setDraftItem(item.lineId, { eanCode: e.target.value })} disabled={!bought || item.action === "existing"} /></Field>
                                <Field label="Categoria"><select className="input" value={item.categoryName} onChange={(e) => setDraftItem(item.lineId, { categoryName: e.target.value })} disabled={!bought || item.action === "existing"}>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
                                <Field label="Classe terapêutica">
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <select className="input" value={item.useNewMedicationClass ? "__new__" : item.medicationClassName} disabled={!bought || item.action === "existing"} onChange={(e) => {
                                      if (e.target.value === "__new__") { setDraftItem(item.lineId, { useNewMedicationClass: true }); return; }
                                      setDraftItem(item.lineId, { useNewMedicationClass: false, medicationClassName: e.target.value });
                                    }}>
                                      {classOptions.map((itemClass) => <option key={itemClass} value={itemClass}>{itemClass}</option>)}
                                      <option value="__new__">Adicionar nova classe terapêutica</option>
                                    </select>
                                    {bought && item.action === "new" && !item.useNewMedicationClass && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraftItem(item.lineId, { useNewMedicationClass: true })}><Icon name="plus" size={14} />Nova</button>}
                                  </div>
                                  {item.useNewMedicationClass && <input className="input" style={{ marginTop: 8 }} value={item.newMedicationClassName || ""} onChange={(e) => setDraftItem(item.lineId, { newMedicationClassName: e.target.value, medicationClassName: e.target.value })} placeholder="Ex.: Antibiótico, Gripal" />}
                                </Field>
                                <Field label="Lote"><input className="input" value={item.batchCode} onChange={(e) => setDraftItem(item.lineId, { batchCode: e.target.value })} /></Field>
                                <Field label="Validade"><input className="input" value={item.expiryLabel} onChange={(e) => setDraftItem(item.lineId, { expiryLabel: e.target.value })} placeholder="MM/AAAA" /></Field>
                                <Field label="Estoque base"><input className="input" type="number" min="0" value={item.minimumQuantity} onChange={(e) => setDraftItem(item.lineId, { minimumQuantity: Number(e.target.value || 0) })} /></Field>
                                <Field label="Faixa baixa"><input className="input" type="number" min="0" value={item.lowStockThreshold} onChange={(e) => setDraftItem(item.lineId, { lowStockThreshold: Number(e.target.value || 0) })} /></Field>
                                <Field label="Faixa atenção"><input className="input" type="number" min="0" value={item.attentionStockThreshold} onChange={(e) => setDraftItem(item.lineId, { attentionStockThreshold: Number(e.target.value || 0) })} /></Field>
                                <Field label="Faixa normal"><input className="input" type="number" min="0" value={item.normalStockThreshold} onChange={(e) => setDraftItem(item.lineId, { normalStockThreshold: Number(e.target.value || 0) })} /></Field>
                                <Field label="Preço de referência (R$)"><input className="input" type="number" step="0.01" min="0" value={item.marketReferencePrice} onChange={(e) => setDraftItem(item.lineId, { marketReferencePrice: Number(e.target.value || 0) })} /></Field>
                              </div>
                              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px" }} onClick={() => setDraftItem(item.lineId, { isControlled: !item.isControlled })}>
                                <span style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", background: item.isControlled ? "var(--accent)" : "transparent", borderColor: item.isControlled ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>{item.isControlled && <Icon name="check" size={12} />}</span>
                                Tipo regulatório sujeito a controle
                              </label>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card card-pad" style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--accent-soft)" }}>
            <span style={{ fontWeight: 700 }}>Valor total da compra</span>
            <span style={{ fontWeight: 800, fontSize: 20, color: "var(--brand)" }}>
              {brl(draftItems.filter((item) => item.action !== "skip").reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.acquisitionCost || 0), 0))}
            </span>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="btn btn-secondary" style={{ flex: 1, justifyContent: "center" }} onClick={resetToSelect} disabled={busy}>Escolher outro orçamento</button>
            <button className="btn btn-primary" style={{ flex: 2, justifyContent: "center" }} disabled={busy} onClick={handleConfirm}><Icon name="check" size={16} />{busy ? "Confirmando…" : "Confirmar compra no estoque"}</button>
          </div>
        </>
      )}

      {stage === "done" && lastResult && (
        <div className="card card-pad" style={{ textAlign: "center" }}>
          <span className="stat-icon" style={{ width: 60, height: 60, margin: "0 auto 16px" }}><Icon name="check" size={28} /></span>
          <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>Compra registrada no estoque</h2>
          <div className="grid g-3" style={{ marginTop: 18 }}>
            <StatCard icon="plusCircle" label="Itens criados" value={lastResult.created_count} />
            <StatCard icon="repeat" label="Itens atualizados" value={lastResult.updated_count} />
            <StatCard icon="close" label="Itens ignorados" value={lastResult.skipped_count} />
          </div>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={resetToSelect}>Registrar outra compra</button>
        </div>
      )}
    </div>
  );
}

export { PurchaseReceivingScreen };
