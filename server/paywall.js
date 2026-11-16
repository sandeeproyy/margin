import crypto from 'node:crypto';

/**
 * Price a print job. Every physical page costs the same, including pages
 * printed by the owner. Amounts are integer paise. A paid job is always at
 * least one rupee because that is Razorpay's minimum INR charge.
 */
export function computeQuote({
  totalPages,
  pricePerPagePaise = 100,
  minimumChargePaise = 100,
}) {
  const pages = Math.max(0, Math.floor(Number(totalPages) || 0));
  const price = Math.max(0, Math.floor(Number(pricePerPagePaise) || 0));
  const minimum = Math.max(100, Math.floor(Number(minimumChargePaise) || 100));
  const amountPaise =
    pages > 0 ? Math.max(pages * price, minimum) : 0;

  return {
    currency: 'INR',
    totalPages: pages,
    chargeablePages: pages,
    pricePerPagePaise: price,
    minimumChargePaise: minimum,
    amountPaise,
  };
}

/**
 * Compare an order's saved quote with a freshly calculated one. Every field
 * that influences money is included.
 */
export function sameQuote(record, quote) {
  return Boolean(
    record &&
      quote &&
      Number(record.amountPaise) === Number(quote.amountPaise) &&
      Number(record.chargeablePages) === Number(quote.chargeablePages) &&
      Number(record.totalPages) === Number(quote.totalPages) &&
      String(record.currency || 'INR') === String(quote.currency || 'INR'),
  );
}

export function quoteFingerprint(quote) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        quote.currency,
        quote.totalPages,
        quote.chargeablePages,
        quote.amountPaise,
      ]),
    )
    .digest('hex');
}
