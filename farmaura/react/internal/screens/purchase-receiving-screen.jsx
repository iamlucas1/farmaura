import React, { useEffect, useMemo, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { buildInvoiceDraftLine, InventoryKpi } from "./inventory-screen.jsx";

/* FARMAURA Console — Confirmar Compra.
   Ponte controlada entre Orçamentos e Estoque: o usuário escolhe um orçamento confirmado, decide
   quais itens realmente comprou (e em que quantidade), e essa decisão explícita é lançada no
   estoque real via o mesmo pipeline já usado pela importação de nota fiscal por IA
   (`InventoryInvoiceService.confirm_invoice_import` / `ctx.confirmInventoryInvoice`) — nenhuma
   lógica de gravação de estoque é duplicada aqui, só a montagem do payload de revisão a partir do
   orçamento em vez de a partir de um arquivo. Um orçamento sozinho nunca vira estoque: só essa
   ação explícita de confirmação faz isso. */

function referenceCodeForQuote(quoteId) {
  return 'COMPRA-' + quoteId.slice(0, 8).toUpperCase();
}

function PurchaseReceivingScreen({ ctx }) {
  const {
    inventory, inventoryLocations, fetchPurchaseQuotes, previewPurchaseQuoteReceiving, confirmInventoryInvoice,
    pendingPurchaseQuoteId, setPendingPurchaseQuoteId, notify, onLogout,
  } = ctx;

  const [quotes, setQuotes] = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [stage, setStage] = useState('select');
  const [preview, setPreview] = useState(null);
  const [draftItems, setDraftItems] = useState([]);
  const [note, setNote] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const categoryOptions = useMemo(
    () => [...new Set((inventory || []).map((item) => item.cat || 'Medicamentos'))].sort((left, right) => left.localeCompare(right, 'pt-BR')),
    [inventory]
  );
  const classOptions = useMemo(
    () => [...new Set((inventory || []).map((item) => item.medClass || 'Geral'))].sort((left, right) => left.localeCompare(right, 'pt-BR')),
    [inventory]
  );

  useEffect(() => {
    (async () => {
      setLoadingQuotes(true);
      try {
        const items = await fetchPurchaseQuotes({ status: 'confirmed' });
        setQuotes(items);
      } catch (error) {
        notify && notify(error && error.message ? error.message : 'Não foi possível carregar os orçamentos confirmados.', 'warn');
      } finally {
        setLoadingQuotes(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (pendingPurchaseQuoteId) {
      setSelectedQuoteId(pendingPurchaseQuoteId);
      setPendingPurchaseQuoteId('');
    }
  }, [pendingPurchaseQuoteId]);

  const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteId) || null;

  const setDraftItem = (lineId, patch) => {
    setDraftItems((prev) => prev.map((item) => item.lineId === lineId ? { ...item, ...patch } : item));
  };

  const defaultBoughtAction = (item) => (item.matchCandidates && item.matchCandidates.length ? 'existing' : 'new');
  const toggleBought = (item) => setDraftItem(item.lineId, { action: item.action === 'skip' ? defaultBoughtAction(item) : 'skip' });
  const markAllBought = () => setDraftItems((prev) => prev.map((item) => item.isComodato ? item : { ...item, action: defaultBoughtAction(item) }));
  const markNoneBought = () => setDraftItems((prev) => prev.map((item) => ({ ...item, action: 'skip' })));

  const handleAnalyze = async () => {
    if (!selectedQuoteId) return;
    setBusy(true);
    try {
      const payload = await previewPurchaseQuoteReceiving(selectedQuoteId);
      setPreview(payload);
      setReferenceCode(referenceCodeForQuote(selectedQuoteId));
      setNote('Compra registrada a partir do orçamento de ' + (selectedQuote ? selectedQuote.supplierName : payload.header.supplierName));
      setDraftItems((payload.items || []).map((item) => {
        const draft = buildInvoiceDraftLine(item, inventoryLocations, categoryOptions);
        return { ...draft, isComodato: item.isComodato, action: item.isComodato ? 'skip' : draft.action };
      }));
      setStage('review');
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível analisar os itens deste orçamento.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    const activeLines = draftItems.filter((item) => item.action !== 'skip');
    if (!activeLines.length) {
      notify('Selecione ao menos um item para registrar a compra.', 'warn');
      return;
    }
    const invalidNew = activeLines.find((item) => item.action === 'new' && (!item.name.trim() || !item.storageLocationCode.trim() || !item.medicationClassName.trim() || !item.categoryName.trim()));
    if (invalidNew) {
      notify('Preencha nome, categoria, classe e localização para todos os itens novos antes de confirmar.', 'warn');
      return;
    }
    const invalidExisting = activeLines.find((item) => item.action === 'existing' && !item.matchedItemId);
    if (invalidExisting) {
      notify('Selecione o item correspondente para cada linha vinculada a um produto existente.', 'warn');
      return;
    }
    const invalidThresholds = activeLines.find((item) => Number(item.lowStockThreshold || 0) > Number(item.attentionStockThreshold || 0) || Number(item.attentionStockThreshold || 0) > Number(item.normalStockThreshold || 0));
    if (invalidThresholds) {
      notify('Revise as faixas de estoque. A ordem deve ser baixa <= atenção <= normal.', 'warn');
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
      setStage('done');
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível confirmar a compra.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const resetToSelect = () => {
    setStage('select');
    setSelectedQuoteId('');
    setPreview(null);
    setDraftItems([]);
    setLastResult(null);
  };

  return (
    <>
      <Topbar title="Confirmar Compra" sub="Selecione um orçamento e registre no estoque o que foi realmente comprado" onLogout={onLogout} ctx={ctx} />

      <div className="ph-content ph-content-wide">
        {stage === 'select' && (
          <>
            <div className="fa-card" style={{ padding: 18, marginBottom: 16 }}>
              <div className="fa-field">
                <label>Orçamento confirmado</label>
                <select className="fa-select" value={selectedQuoteId} onChange={(e) => setSelectedQuoteId(e.target.value)} disabled={loadingQuotes}>
                  <option value="">{loadingQuotes ? 'Carregando…' : 'Selecione um orçamento'}</option>
                  {quotes.map((quote) => (
                    <option key={quote.id} value={quote.id}>{quote.supplierName} · cotado em {quote.quoteDate} · {quote.items.length} item(ns)</option>
                  ))}
                </select>
              </div>
              {!loadingQuotes && !quotes.length && (
                <div className="ph-cell-sub" style={{ marginTop: 10 }}>Nenhum orçamento confirmado ainda. Cadastre ou confirme um orçamento na tela <strong>Cotações</strong> primeiro.</div>
              )}
            </div>

            {selectedQuote && (
              <div className="ph-table-wrap" style={{ marginBottom: 16 }}>
                <table className="ph-table">
                  <thead>
                    <tr><th>Item</th><th>Marca</th><th>Unidade</th><th>Qtd. cotada</th><th>Preço unitário</th></tr>
                  </thead>
                  <tbody>
                    {selectedQuote.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}{item.isComodato ? <span className="fa-badge fa-badge-mist" style={{ marginLeft: 6 }}><Icon name="gift" size={11} />Comodato</span> : null}</td>
                        <td>{item.brandName || '—'}</td>
                        <td>{item.unit}</td>
                        <td>{item.quantityReference != null ? item.quantityReference : '—'}</td>
                        <td>{brl(item.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button className="fa-btn fa-btn-primary" disabled={!selectedQuoteId || busy} onClick={handleAnalyze}>
              <Icon name="search" size={16} />{busy ? 'Analisando…' : 'Analisar itens deste orçamento'}
            </button>
          </>
        )}

        {stage === 'review' && preview && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <p className="fa-muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
                  Revise cada linha, ajuste a quantidade realmente comprada e confirme apenas quando estiver
                  consistente. A quantidade abaixo entra no estoque na unidade de venda (unidade avulsa),
                  independente da unidade cotada no orçamento (ex.: caixa).
                </p>
              </div>
              <div className="fa-card" style={{ padding: 16, minWidth: 300, flex: '0 0 340px' }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>{preview.header.supplierName || 'Fornecedor não identificado'}</div>
                <div className="ph-cell-sub" style={{ lineHeight: 1.7 }}>
                  <div>Data da cotação: <span className="fa-mono">{preview.header.issueDate || '—'}</span></div>
                  <div>Itens: <span className="fa-mono">{draftItems.length}</span></div>
                </div>
              </div>
            </div>

            <div className="fa-form2" style={{ marginBottom: 16 }}>
              <div className="fa-field"><label>Referência da movimentação</label><input className="fa-input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} /></div>
              <div className="fa-field fa-span2"><label>Observação geral</label><input className="fa-input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
              <span className="ph-cell-sub">{draftItems.filter((item) => item.action !== 'skip').length} de {draftItems.length} itens marcados como comprados</span>
              <div className="inv-actions">
                <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={markAllBought}><Icon name="check" size={14} />Marcar todos como comprados</button>
                <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={markNoneBought}><Icon name="close" size={14} />Desmarcar todos</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {draftItems.map((item, index) => {
                const matched = (inventory || []).find((entry) => entry.id === item.matchedItemId) || null;
                const bought = item.action !== 'skip';
                const accent = !bought ? 'var(--fa-mist)' : item.action === 'new' ? 'var(--fa-success)' : 'var(--fa-info)';
                return (
                  <div key={item.lineId} className="fa-card" style={{ padding: 16, borderLeft: '4px solid ' + accent }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                      <label className="fa-check" data-on={bought ? '1' : '0'} onClick={() => toggleBought(item)} style={{ marginBottom: 0 }}>
                        <span className="box"><Icon name="check" size={13} stroke={2.6} /></span>Comprei
                      </label>
                      <span className="fa-badge fa-badge-mist">Item {index + 1}</span>
                      <div style={{ fontWeight: 800, flex: 1, minWidth: 220 }}>{item.description || item.name || 'Item sem descrição'}</div>
                      {item.isComodato && <span className="fa-badge fa-badge-mist"><Icon name="gift" size={11} />Comodato</span>}
                      <span className="fa-badge" style={{ background: 'var(--fa-warn-soft)', color: 'var(--fa-warn)' }}>{brl(Number(item.acquisitionCost || 0))} custo</span>
                    </div>
                    {bought && (
                      <div className="ph-seg" style={{ width: '100%', marginBottom: 14 }}>
                        <button style={{ flex: 1 }} data-on={item.action === 'existing' ? '1' : '0'} onClick={() => setDraftItem(item.lineId, { action: 'existing', matchedItemId: item.matchedItemId || (item.matchCandidates[0] ? item.matchCandidates[0].id : '') })}>Vincular existente</button>
                        <button style={{ flex: 1 }} data-on={item.action === 'new' ? '1' : '0'} onClick={() => setDraftItem(item.lineId, { action: 'new' })}>Criar novo</button>
                      </div>
                    )}

                    {item.action === 'existing' && (
                      <div className="fa-form2" style={{ marginBottom: 12 }}>
                        <div className="fa-field fa-span2">
                          <label>Item correspondente</label>
                          <select className="fa-select" value={item.matchedItemId} onChange={(e) => {
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
                              <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.brandName || 'Sem marca'} · {candidate.eanCode || candidate.sku}</option>
                            ))}
                          </select>
                        </div>
                        <div className="fa-field"><label>Localização de entrada</label><select className="fa-select" value={item.storageLocationCode} onChange={(e) => setDraftItem(item.lineId, { storageLocationCode: e.target.value })}>{(inventoryLocations || []).map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></div>
                        <div className="fa-field"><label>Estoque atual</label><input className="fa-input" value={matched ? matched.qty : 0} disabled /></div>
                      </div>
                    )}

                    {item.action === 'new' && (
                      <div className="fa-form2" style={{ marginBottom: 12 }}>
                        <div className="fa-field"><label>SKU</label><input className="fa-input" value={item.sku} onChange={(e) => setDraftItem(item.lineId, { sku: e.target.value })} /></div>
                        <div className="fa-field fa-span2"><label>Nome *</label><input className="fa-input" value={item.name} onChange={(e) => setDraftItem(item.lineId, { name: e.target.value })} /></div>
                        <div className="fa-field"><label>Marca</label><input className="fa-input" value={item.brandName} onChange={(e) => setDraftItem(item.lineId, { brandName: e.target.value })} /></div>
                        <div className="fa-field"><label>Categoria</label><select className="fa-select" value={item.categoryName} onChange={(e) => setDraftItem(item.lineId, { categoryName: e.target.value })}>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
                        <div className="fa-field">
                          <label>Classe terapêutica</label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <select className="fa-select" value={item.useNewMedicationClass ? '__new__' : item.medicationClassName} onChange={(e) => {
                              if (e.target.value === '__new__') { setDraftItem(item.lineId, { useNewMedicationClass: true }); return; }
                              setDraftItem(item.lineId, { useNewMedicationClass: false, medicationClassName: e.target.value });
                            }}>
                              {classOptions.map((itemClass) => <option key={itemClass} value={itemClass}>{itemClass}</option>)}
                              <option value="__new__">Adicionar nova classe terapêutica</option>
                            </select>
                            {!item.useNewMedicationClass && <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setDraftItem(item.lineId, { useNewMedicationClass: true })}><Icon name="plus" size={14} />Nova</button>}
                          </div>
                          {item.useNewMedicationClass && <input className="fa-input" style={{ marginTop: 8 }} value={item.newMedicationClassName || ''} onChange={(e) => setDraftItem(item.lineId, { newMedicationClassName: e.target.value, medicationClassName: e.target.value })} placeholder="Ex.: Antibiótico, Gripal" />}
                        </div>
                        <div className="fa-field"><label>EAN</label><input className="fa-input" value={item.eanCode} onChange={(e) => setDraftItem(item.lineId, { eanCode: e.target.value })} /></div>
                        <div className="fa-field"><label>Localização *</label><select className="fa-select" value={item.storageLocationCode} onChange={(e) => setDraftItem(item.lineId, { storageLocationCode: e.target.value })}>{(inventoryLocations || []).map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></div>
                      </div>
                    )}

                    {item.action !== 'skip' && (
                      <>
                        <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13.5 }}>Quantidade e preço</div>
                        <div className="fa-form2">
                          <div className="fa-field"><label>Lote</label><input className="fa-input" value={item.batchCode} onChange={(e) => setDraftItem(item.lineId, { batchCode: e.target.value })} /></div>
                          <div className="fa-field"><label>Validade</label><input className="fa-input" value={item.expiryLabel} onChange={(e) => setDraftItem(item.lineId, { expiryLabel: e.target.value })} placeholder="MM/AAAA" /></div>
                          <div className="fa-field"><label>Quantidade comprada</label><input className="fa-input" type="number" min="0" value={item.quantity} onChange={(e) => setDraftItem(item.lineId, { quantity: Number(e.target.value || 0) })} /></div>
                          <div className="fa-field"><label>Estoque base</label><input className="fa-input" type="number" min="0" value={item.minimumQuantity} onChange={(e) => setDraftItem(item.lineId, { minimumQuantity: Number(e.target.value || 0) })} /></div>
                          <div className="fa-field"><label>Faixa baixa</label><input className="fa-input" type="number" min="0" value={item.lowStockThreshold} onChange={(e) => setDraftItem(item.lineId, { lowStockThreshold: Number(e.target.value || 0) })} /></div>
                          <div className="fa-field"><label>Faixa atenção</label><input className="fa-input" type="number" min="0" value={item.attentionStockThreshold} onChange={(e) => setDraftItem(item.lineId, { attentionStockThreshold: Number(e.target.value || 0) })} /></div>
                          <div className="fa-field"><label>Faixa normal</label><input className="fa-input" type="number" min="0" value={item.normalStockThreshold} onChange={(e) => setDraftItem(item.lineId, { normalStockThreshold: Number(e.target.value || 0) })} /></div>
                          <div className="fa-field"><label>Custo de aquisição (R$)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.acquisitionCost} onChange={(e) => setDraftItem(item.lineId, { acquisitionCost: Number(e.target.value || 0) })} /></div>
                          <div className="fa-field"><label>Preço de venda (R$)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.salePrice} onChange={(e) => setDraftItem(item.lineId, { salePrice: Number(e.target.value || 0) })} /></div>
                          <div className="fa-field"><label>Preço de referência (R$)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.marketReferencePrice} onChange={(e) => setDraftItem(item.lineId, { marketReferencePrice: Number(e.target.value || 0) })} /></div>
                        </div>
                        <label className="fa-check" data-on={item.isControlled ? '1' : '0'} onClick={() => setDraftItem(item.lineId, { isControlled: !item.isControlled })} style={{ marginTop: 12 }}>
                          <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Tipo regulatório sujeito a controle
                        </label>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={resetToSelect} disabled={busy}>Escolher outro orçamento</button>
              <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={busy} onClick={handleConfirm}><Icon name="check" size={16} />{busy ? 'Confirmando…' : 'Confirmar compra no estoque'}</button>
            </div>
          </>
        )}

        {stage === 'done' && lastResult && (
          <div className="fa-card" style={{ padding: 24, textAlign: 'center' }}>
            <span className="fa-iconbox" style={{ width: 60, height: 60, margin: '0 auto 16px' }}><Icon name="check" size={28} /></span>
            <h2 className="fa-h3" style={{ fontSize: 20 }}>Compra registrada no estoque</h2>
            <div className="inv-kpis" style={{ marginTop: 18 }}>
              <InventoryKpi icon="plusCircle" label="Itens criados" value={lastResult.created_count} />
              <InventoryKpi icon="repeat" label="Itens atualizados" value={lastResult.updated_count} />
              <InventoryKpi icon="close" label="Itens ignorados" value={lastResult.skipped_count} />
            </div>
            <button className="fa-btn fa-btn-primary" style={{ marginTop: 20 }} onClick={resetToSelect}>Registrar outra compra</button>
          </div>
        )}
      </div>
    </>
  );
}

export { PurchaseReceivingScreen };
