import crypto from 'node:crypto';

const DEFAULT_API_BASE = 'https://api.razorpay.com/v1';
const REQUEST_TIMEOUT_MS = 15_000;

function gatewayError(message, { status = null, cause = null } = {}) {
  const error = new Error(message);
  error.code = 'RAZORPAY_ERROR';
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

function normalizeApiBase(value) {
  const base = String(value ?? '').trim() || DEFAULT_API_BASE;
  return base.replace(/\/+$/, '');
}

/**
 * Verify Razorpay's checkout signature:
 * HMAC_SHA256(order_id + "|" + payment_id, key_secret)
 */
export function verifyPaymentSignature({
  orderId,
  paymentId,
  signature,
  keySecret,
}) {
  const order = String(orderId ?? '').trim();
  const payment = String(paymentId ?? '').trim();
  const received = String(signature ?? '').trim();
  const secret = String(keySecret ?? '');
  if (!order || !payment || !received || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${order}|${payment}`)
    .digest('hex');
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(received, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createRazorpayClient({
  keyId,
  keySecret,
  apiBase = DEFAULT_API_BASE,
}) {
  if (!keyId || !keySecret) {
    throw new Error('Razorpay key ID and key secret are required.');
  }

  const base = normalizeApiBase(apiBase);
  const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

  async function request(pathname, { method = 'GET', body = null } = {}) {
    let response;
    try {
      response = await fetch(`${base}${pathname}`, {
        method,
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw gatewayError('The payment gateway could not be reached.', {
        cause: error,
      });
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const description = String(data?.error?.description ?? '').slice(0, 240);
      throw gatewayError(
        description
          ? `The payment gateway rejected the request: ${description}`
          : 'The payment gateway rejected the request.',
        { status: response.status },
      );
    }

    return data;
  }

  return {
    async createOrder({ amountPaise, currency = 'INR', receipt, notes }) {
      return request('/orders', {
        method: 'POST',
        body: {
          amount: Math.round(Number(amountPaise)),
          currency,
          ...(receipt ? { receipt } : {}),
          ...(notes ? { notes } : {}),
          // Ask Razorpay to capture automatically for this order. This also
          // overrides a dashboard set to manual capture. If a payment still
          // arrives authorised, the print route captures it explicitly.
          payment: {
            capture: 'automatic',
            capture_options: {
              automatic_expiry_period: 12,
              manual_expiry_period: 7200,
              refund_speed: 'normal',
            },
          },
        },
      });
    },

    async getOrder(orderId) {
      return request(`/orders/${encodeURIComponent(orderId)}`);
    },

    async getPayment(paymentId) {
      return request(`/payments/${encodeURIComponent(paymentId)}`);
    },

    async capturePayment(paymentId, { amountPaise, currency = 'INR' }) {
      return request(`/payments/${encodeURIComponent(paymentId)}/capture`, {
        method: 'POST',
        body: {
          amount: Math.round(Number(amountPaise)),
          currency,
        },
      });
    },

    verifySignature(input) {
      return verifyPaymentSignature({ ...input, keySecret });
    },
  };
}
