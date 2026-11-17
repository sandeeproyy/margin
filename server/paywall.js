import crypto from 'node:crypto';

/**
 * Price a print job. Members pay the same rate for every physical page; the
 * room owner prints without a charge. Amounts are integer paise. A paid job is
 * always at least one rupee because that is Razorpay's minimum INR charge.
 */
export function printsForFree(user) {
  return user?.role === 'admin';
}

export function computeQuote({
  totalPages,
  pricePerPagePaise = 100,
  minimumChargePaise = 100,
  free = false,
}) {
  const pages = Math.max(0, Math.floor(Number(totalPages) || 0));
  const price = Math.max(0, Math.floor(Number(pricePerPagePaise) || 0));
  const minimum = Math.max(100, Math.floor(Number(minimumChargePaise) || 100));
  const chargeablePages = free ? 0 : pages;
  const amountPaise =
    free || pages === 0 ? 0 : Math.max(pages * price, minimum);

  return {
    currency: 'INR',
    totalPages: pages,
    chargeablePages,
    pricePerPagePaise: price,
    minimumChargePaise: minimum,
    amountPaise,
    free: Boolean(free),
  };
}

/** Quote a job for a specific account, including the owner exemption. */
export function quoteForUser({
  user,
  totalPages,
  pricePerPagePaise = 100,
  minimumChargePaise = 100,
}) {
  return computeQuote({
    totalPages,
    pricePerPagePaise,
    minimumChargePaise,
    free: printsForFree(user),
  });
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
