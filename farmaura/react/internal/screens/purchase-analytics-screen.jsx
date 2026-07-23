import React, { useEffect, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { StatCard } from "./dashboard-screen.jsx";
import { AnCard } from "./analytics-screen.jsx";
import { paymentMethodLabel } from "./quotes-screen.jsx";

/* FARMAURA Console — Painel de Compras (Fase 2 de Orçamentos).
   Classifica produtos por valor (ABC, Pareto) e por variabilidade de demanda (XYZ, coeficiente
   de variação) a partir das vendas reais (pedidos online + balcão), cruza com os orçamentos
   confirmados (Fase 1) e sugere o que comprar. Sem histórico de vendas suficiente, mostra um
   estado vazio explicativo em vez de uma tabela vazia — a classificação aparece sozinha conforme
   as vendas forem sendo registradas. */

const ABC_BADGE_STYLE = {
  A: { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' },
  B: { background: 'var(--fa-info-soft)', color: 'var(--fa-primary)' },
  C: { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' },
};
const XYZ_COLUMNS = [
  { key: 'X', label: 'X · Estável' },
  { key: 'Y', label: 'Y · Variável' },
  { key: 'Z', label: 'Z · Errático' },
  { key: '', label: 'Aguardando histórico' },
];
const ABC_ROWS = ['A', 'B', 'C'];

/* Matriz ABC (valor) × XYZ (variabilidade): heatmap de contagem em um único tom (sequencial),
   sempre com o número escrito na célula — a cor nunca é a única forma de ler o valor. */
function AbcXyzMatrix({ items }) {
  const counts = {};
  let max = 0;
  ABC_ROWS.forEach((abc) => {
    XYZ_COLUMNS.forEach((col) => {
      const count = items.filter((item) => item.abcClass === abc && item.xyzClass === col.key).length;
      counts[abc + '|' + col.key] = count;
      if (count > max) max = count;
    });
  });
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 6, width: '100%', minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ width: 84 }}></th>
            {XYZ_COLUMNS.map((col) => (
              <th key={col.key || 'none'} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fa-ink-3)', textAlign: 'center', padding: '0 4px' }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ABC_ROWS.map((abc) => (
            <tr key={abc}>
              <td style={{ fontSize: 13, fontWeight: 800 }}>Classe {abc}</td>
              {XYZ_COLUMNS.map((col) => {
                const count = counts[abc + '|' + col.key];
                const ratio = max > 0 ? count / max : 0;
                const background = count === 0 ? 'var(--fa-mist)' : 'color-mix(in srgb, var(--fa-primary) ' + Math.round(18 + ratio * 67) + '%, white)';
                const color = ratio > 0.55 ? '#fff' : 'var(--fa-ink)';
                return (
                  <td key={col.key || 'none'} style={{ textAlign: 'center', padding: '16px 6px', borderRadius: 10, background, color, fontWeight: 800, fontSize: 18 }}>
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PurchaseAnalyticsScreen({ ctx }) {
  const { fetchPurchaseAnalytics, categories, notify, onLogout, onNav } = ctx;
  const [months, setMonths] = useState(12);
  const [categoryId, setCategoryId] = useState('');
  const [abcClass, setAbcClass] = useState('');
  const [xyzClass, setXyzClass] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const payload = await fetchPurchaseAnalytics({ months, categoryId, abcClass, xyzClass });
      setData(payload);
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível carregar o painel de compras.', 'warn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [months, categoryId, abcClass, xyzClass]);

  const summary = data && data.summary;
  const items = (data && data.items) || [];
  const hasData = !!summary && summary.totalProductsWithSales > 0;
  const hasFilters = !!categoryId || !!abcClass || !!xyzClass;

  return (
    <>
      <Topbar title="Painel de Compras" sub="Classificação ABC/XYZ e sugestão de compra" onLogout={onLogout} ctx={ctx}>
        <div className="ph-seg">
          {[3, 6, 12].map((option) => (
            <button key={option} data-on={months === option ? '1' : '0'} onClick={() => setMonths(option)}>{option} meses</button>
          ))}
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        {loading && !data && (
          <div className="ph-empty"><span className="fa-iconbox"><Icon name="gauge" size={28} /></span><div>Carregando painel de compras…</div></div>
        )}

        {!loading && data && !hasData && (
          <div className="ph-empty">
            <span className="fa-iconbox"><Icon name="gauge" size={28} /></span>
            <div style={{ maxWidth: 480, margin: '0 auto' }}>
              Ainda não há histórico de vendas suficiente para classificar os produtos. A
              classificação ABC/XYZ e as sugestões de compra aparecem aqui automaticamente
              conforme os pedidos online e as vendas do balcão forem sendo registrados.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => onNav('quotes')}><Icon name="card" size={14} />Ver cotações</button>
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => onNav('quotes-compare')}><Icon name="activity" size={14} />Comparar fornecedores</button>
            </div>
          </div>
        )}

        {data && hasData && (
          <>
            <div className="inv-kpis">
              <StatCard icon="capsule" value={summary.totalProductsWithSales} label="Produtos analisados" />
              <StatCard icon="star" value={summary.classACount} label="Produtos classe A" />
              <StatCard
                icon="bell"
                value={summary.classAWithoutOfferCount}
                label="Classe A sem orçamento ativo"
                tint={summary.classAWithoutOfferCount ? { bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)' } : undefined}
              />
              <StatCard icon="tag" value={brl(summary.totalRevenueAnalyzed)} label={'Receita analisada · ' + summary.months + ' meses'} />
            </div>

            {summary.monthsWithData < 2 && (
              <div className="fa-card" style={{ padding: '14px 16px', marginBottom: 16, background: 'var(--fa-info-soft)', color: 'var(--fa-primary)', fontSize: 13.5, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Icon name="info" size={16} />
                A classificação XYZ (variabilidade de demanda) fica mais precisa conforme mais
                meses de venda forem registrados — por enquanto, produtos aparecem como
                "Aguardando histórico".
              </div>
            )}

            <div className="inv-toolbar">
              <div className="inv-toolbar-row is-filters">
                <div className="inv-filter-field">
                  <label>Categoria</label>
                  <select className="fa-select" style={{ minWidth: 170 }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">Todas as categorias</option>
                    {(categories || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </div>
                <div className="inv-filter-field">
                  <label>Classe ABC</label>
                  <select className="fa-select" style={{ minWidth: 120 }} value={abcClass} onChange={(e) => setAbcClass(e.target.value)}>
                    <option value="">Todas</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </div>
                <div className="inv-filter-field">
                  <label>Classe XYZ</label>
                  <select className="fa-select" style={{ minWidth: 120 }} value={xyzClass} onChange={(e) => setXyzClass(e.target.value)}>
                    <option value="">Todas</option>
                    <option value="X">X</option>
                    <option value="Y">Y</option>
                    <option value="Z">Z</option>
                  </select>
                </div>
                {hasFilters && (
                  <button className="fa-btn fa-btn-ghost fa-btn-sm" onClick={() => { setCategoryId(''); setAbcClass(''); setXyzClass(''); }}>
                    <Icon name="close" size={14} />Limpar filtros
                  </button>
                )}
              </div>
            </div>

            <AnCard icon="grid" title="Matriz ABC × XYZ" sub="Quantidade de produtos por combinação de classe" style={{ marginBottom: 16 }}>
              <AbcXyzMatrix items={items} />
            </AnCard>

            <div className="ph-table-wrap">
              <table className="ph-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th>ABC</th>
                    <th>XYZ</th>
                    <th>Consumo médio/mês</th>
                    <th>Estoque atual</th>
                    <th>Cobertura</th>
                    <th>Melhor fornecedor</th>
                    <th>Sugestão de compra</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const needsAttention = item.abcClass === 'A' && (item.coverageDays == null || item.coverageDays < 15);
                    return (
                      <tr key={item.productId}>
                        <td>
                          <div className="ph-td-name">{item.name}</div>
                          <div className="ph-cell-sub">{item.brandName || 'Sem marca'}</div>
                        </td>
                        <td>{item.categoryName || '—'}</td>
                        <td><span className="fa-badge" style={ABC_BADGE_STYLE[item.abcClass]}>{item.abcClass}</span></td>
                        <td>{item.xyzClass ? <span className="fa-badge fa-badge-mist">{item.xyzClass}</span> : <span className="ph-cell-sub">Aguardando</span>}</td>
                        <td className="fa-mono">{item.averageMonthlyQuantity}</td>
                        <td className="fa-mono">{item.currentStock}</td>
                        <td>{item.coverageDays != null ? item.coverageDays + ' dias' : '—'}</td>
                        <td>
                          {item.bestOffer ? (
                            <>
                              <div className="ph-td-name" style={{ fontSize: 13 }}>{item.bestOffer.supplierName}</div>
                              <div className="ph-cell-sub">{brl(item.bestOffer.effectivePrice)} · {paymentMethodLabel(item.bestOffer.paymentMethod)}</div>
                            </>
                          ) : (
                            <span className="fa-badge fa-badge-warn"><Icon name="bell" size={11} />Sem orçamento</span>
                          )}
                        </td>
                        <td>
                          {item.suggestedPurchaseQuantity > 0 ? (
                            <span className="fa-badge" style={needsAttention ? { background: 'var(--fa-warn-soft)', color: 'var(--fa-warn)' } : { background: 'var(--fa-info-soft)', color: 'var(--fa-primary)' }}>
                              {item.suggestedPurchaseQuantity} un
                            </span>
                          ) : (
                            <span className="ph-cell-sub">Estoque OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!items.length && (
                <div className="ph-empty">
                  <span className="fa-iconbox"><Icon name="search" size={28} /></span>
                  <div>Nenhum produto encontrado com os filtros aplicados.</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export { PurchaseAnalyticsScreen };
