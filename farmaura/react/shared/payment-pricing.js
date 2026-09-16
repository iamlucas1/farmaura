/*
farmaura/react/shared/payment-pricing.js

Pix/installment price breakdown shared by the internal Precificador and the public marketplace.

Responsibilities:
- resolve the Pix price and per-installment values from one centralized, tenant-wide rule set;
- keep the math identical between the admin preview (Precificador) and what customers see (storefront).

Observations:
- rules are centralized for the whole tenant (every store) — see PortalMarketplaceMetaResponse's
  pix_discount_percent/max_installments/interest_free_installments/installment_interest_percent;
- this only resolves what price to show per payment method, it never touches real charge/capture
  logic (Asaas integration keeps charging the full order amount as it does today).
*/

/** Return the installment-count override that applies to this price/cart context, or null.
 *
 * `productRef` is the product's display name (case-insensitive) — same scoping convention
 * `PricingPromotion.target_products` already uses (see _matches_scope in
 * pricing_promotion_service.py), so the admin picks products the same way in both places
 * (CouponTargetPicker/buildCouponProductOptions) instead of a second, id-based scheme.
 *
 * Precedence: a rule scoped to this exact product wins over any value-threshold rule; among
 * min_value rules whose threshold is met, the highest (most specific) threshold wins. Only
 * max_installments/interest_free_installments are overridden — Pix discount and interest rate
 * always come from the tenant-wide default, that axis was never part of this feature.
 */
function resolveInstallmentOverride(rules, basePrice, { productRef, cartTotal } = {}) {
  const overrides = Array.isArray(rules.installmentOverrides ?? rules.installment_overrides)
    ? (rules.installmentOverrides ?? rules.installment_overrides)
    : [];
  if (!overrides.length) return null;
  const normalized = overrides.map((entry) => ({
    scopeType: entry.scopeType ?? entry.scope_type,
    productRef: String(entry.productRef ?? entry.product_ref ?? '').trim().toLowerCase(),
    minValue: Number(entry.minValue ?? entry.min_value ?? 0),
    maxInstallments: Math.max(1, Math.round(Number(entry.maxInstallments ?? entry.max_installments ?? 1))),
    interestFreeInstallments: Math.max(1, Math.round(Number(entry.interestFreeInstallments ?? entry.interest_free_installments ?? 1))),
  }));
  const normalizedProductRef = String(productRef || '').trim().toLowerCase();
  if (normalizedProductRef) {
    const productMatch = normalized.find((entry) => entry.scopeType === 'product' && entry.productRef === normalizedProductRef);
    if (productMatch) return productMatch;
  }
  const referenceValue = cartTotal != null ? Number(cartTotal) : basePrice;
  const valueMatches = normalized
    .filter((entry) => entry.scopeType === 'min_value' && entry.minValue <= referenceValue)
    .sort((a, b) => b.minValue - a.minValue);
  return valueMatches[0] || null;
}

/** Build the Pix price and the per-installment breakdown for one table price.
 *
 * `context` (optional) — `{ productRef, cartTotal }` — resolves an installment-count override
 * (see resolveInstallmentOverride) before falling back to the tenant-wide defaults.
 */
function resolvePaymentBreakdown(price, paymentRules, context) {
  const basePrice = Math.max(0, Number(price) || 0);
  const rules = paymentRules || {};
  const pixDiscountPercent = Math.max(0, Number(rules.pixDiscountPercent ?? rules.pix_discount_percent ?? 0));
  const override = resolveInstallmentOverride(rules, basePrice, context || {});
  const maxInstallments = override
    ? override.maxInstallments
    : Math.max(1, Math.round(Number(rules.maxInstallments ?? rules.max_installments ?? 1)));
  const interestFreeInstallments = override
    ? override.interestFreeInstallments
    : Math.max(1, Math.round(Number(rules.interestFreeInstallments ?? rules.interest_free_installments ?? 1)));
  const installmentInterestPercent = Math.max(0, Number(rules.installmentInterestPercent ?? rules.installment_interest_percent ?? 0));

  const pixPrice = Math.round(basePrice * (1 - pixDiscountPercent / 100) * 100) / 100;

  const installments = [];
  for (let n = 1; n <= maxInstallments; n += 1) {
    const hasInterest = n > interestFreeInstallments;
    let installmentValue;
    let totalValue;
    if (!hasInterest) {
      installmentValue = Math.round((basePrice / n) * 100) / 100;
      totalValue = basePrice;
    } else {
      const monthlyRate = installmentInterestPercent / 100;
      // Price (PMT) formula for a fixed-rate installment plan.
      const factor = monthlyRate > 0
        ? (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)
        : 1 / n;
      installmentValue = Math.round(basePrice * factor * 100) / 100;
      totalValue = Math.round(installmentValue * n * 100) / 100;
    }
    installments.push({ n, hasInterest, installmentValue, totalValue });
  }

  const bestInstallmentLabel = (() => {
    const lastInterestFree = installments.filter((entry) => !entry.hasInterest).pop();
    return lastInterestFree || installments[0] || null;
  })();

  return { pixPrice, pixDiscountPercent, installments, bestInstallmentLabel };
}

if (typeof window !== 'undefined') {
  window.FA_PAYMENT_PRICING = { resolvePaymentBreakdown };
}

export { resolvePaymentBreakdown };
