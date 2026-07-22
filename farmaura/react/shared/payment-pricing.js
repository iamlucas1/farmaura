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

/** Build the Pix price and the per-installment breakdown for one table price. */
function resolvePaymentBreakdown(price, paymentRules) {
  const basePrice = Math.max(0, Number(price) || 0);
  const rules = paymentRules || {};
  const pixDiscountPercent = Math.max(0, Number(rules.pixDiscountPercent ?? rules.pix_discount_percent ?? 0));
  const maxInstallments = Math.max(1, Math.round(Number(rules.maxInstallments ?? rules.max_installments ?? 1)));
  const interestFreeInstallments = Math.max(1, Math.round(Number(rules.interestFreeInstallments ?? rules.interest_free_installments ?? 1)));
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
