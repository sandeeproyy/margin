import crypto from 'node:crypto';

const DEFAULT_RESERVATION_TTL_MS = 30 * 60 * 1000;

function validTime(value) {
  const time = new Date(value ?? '').getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Work out whether a member still has their one free page, and whether an
 * unpaid order is currently holding it. A reservation prevents two open
 * checkouts from both claiming the same free page.
 */
export function freePageStatus(
  user,
  { now = Date.now(), reservationTtlMs = DEFAULT_RESERVATION_TTL_MS } = {},
) {
  if (!user || user.role === 'admin') {
    return {
      ownerExempt: true,
      used: false,
      available: false,
      reserved: null,
    };
  }

  if (user.freePageUsedAt) {
    return {
      ownerExempt: false,
      used: true,
      available: false,
      reserved: null,
    };
  }

  const reservedAt = validTime(user.freePageReservedAt);
  if (
    reservedAt !== null &&
    user.freePageReservedOrderId &&
    now - reservedAt >= 0 &&
    now - reservedAt < reservationTtlMs
  ) {
    return {
      ownerExempt: false,
      used: false,
      available: false,
      reserved: {
        orderId: String(user.freePageReservedOrderId),
        jobId: user.freePageReservedJobId
          ? String(user.freePageReservedJobId)
          : null,
        reservedAt,
      },
    };
  }

  return {
    ownerExempt: false,
    used: false,
    available: true,
    reserved: null,
  };
}

/**
 * Price a print job. Amounts are integer paise. A paid job is always at least
 * one rupee because that is Razorpay's minimum INR charge.
 */
export function computeQuote({
  user,
  totalPages,
  pricePerPagePaise = 86,
  minimumChargePaise = 100,
  reservationTtlMs = DEFAULT_RESERVATION_TTL_MS,
  forOrderId = null,
  allowFreePage = false,
  now = Date.now(),
}) {
  const pages = Math.max(0, Math.floor(Number(totalPages) || 0));
  const price = Math.max(0, Math.floor(Number(pricePerPagePaise) || 0));
  const minimum = Math.max(100, Math.floor(Number(minimumChargePaise) || 100));
  const status = freePageStatus(user, { now, reservationTtlMs });

  const reservationForThisOrder = Boolean(
    status.reserved &&
      forOrderId &&
      status.reserved.orderId === String(forOrderId),
  );
  const freePageAvailable =
    status.available || reservationForThisOrder || allowFreePage;
  const freePageApplied =
    !status.ownerExempt && freePageAvailable && pages > 0;
  const chargeablePages = status.ownerExempt
    ? 0
    : Math.max(0, pages - (freePageApplied ? 1 : 0));
  const amountPaise =
    chargeablePages > 0
      ? Math.max(chargeablePages * price, minimum)
      : 0;

  return {
    currency: 'INR',
    totalPages: pages,
    ownerExempt: status.ownerExempt,
    freePageAvailable,
    freePageReserved: Boolean(
      status.reserved && !reservationForThisOrder,
    ),
    freePageApplied,
    chargeablePages,
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
      Boolean(record.freePageApplied) === Boolean(quote.freePageApplied) &&
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
        quote.freePageApplied,
        quote.amountPaise,
      ]),
    )
    .digest('hex');
}
