import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  computeQuote,
  freePageStatus,
  sameQuote,
} from '../server/paywall.js';
import { createPaymentStore } from '../server/payments.js';
import {
  createRazorpayClient,
  verifyPaymentSignature,
} from '../server/razorpay.js';

const TEST_DIR = path.join(
  os.tmpdir(),
  `margin-paywall-test-${crypto.randomUUID()}`,
);
await fsp.mkdir(TEST_DIR, { recursive: true });

function rupees(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

console.log('[test] Paywall pricing');
const member = { role: 'member' };

const firstOnePage = computeQuote({ user: member, totalPages: 1 });
assert.equal(firstOnePage.freePageApplied, true);
assert.equal(firstOnePage.chargeablePages, 0);
assert.equal(firstOnePage.amountPaise, 0);

const firstTwoPages = computeQuote({ user: member, totalPages: 2 });
assert.equal(firstTwoPages.freePageApplied, true);
assert.equal(firstTwoPages.chargeablePages, 1);
assert.equal(firstTwoPages.amountPaise, 100);

const firstThreePages = computeQuote({ user: member, totalPages: 3 });
assert.equal(firstThreePages.freePageApplied, true);
assert.equal(firstThreePages.chargeablePages, 2);
assert.equal(firstThreePages.amountPaise, 172);

const firstFourPages = computeQuote({ user: member, totalPages: 4 });
assert.equal(firstFourPages.chargeablePages, 3);
assert.equal(firstFourPages.amountPaise, 258);

const usedMember = {
  role: 'member',
  freePageUsedAt: new Date().toISOString(),
};
const paidOnePage = computeQuote({ user: usedMember, totalPages: 1 });
assert.equal(paidOnePage.freePageApplied, false);
assert.equal(paidOnePage.chargeablePages, 1);
assert.equal(paidOnePage.amountPaise, 100);

const paidTwoPages = computeQuote({ user: usedMember, totalPages: 2 });
assert.equal(paidTwoPages.amountPaise, 172);

const owner = computeQuote({
  user: { role: 'admin' },
  totalPages: 9,
});
assert.equal(owner.ownerExempt, true);
assert.equal(owner.chargeablePages, 0);
assert.equal(owner.amountPaise, 0);
console.log(
  `  ok (first page free; 2 pages = ${rupees(firstTwoPages.amountPaise)}, 3 pages = ${rupees(firstThreePages.amountPaise)}, single paid page = ${rupees(paidOnePage.amountPaise)})`,
);

console.log('[test] Free-page reservation');
const reservedMember = {
  role: 'member',
  freePageReservedAt: new Date().toISOString(),
  freePageReservedOrderId: 'order_open',
  freePageReservedJobId: 'job_open',
};
const reservedForThisOrder = computeQuote({
  user: reservedMember,
  totalPages: 3,
  forOrderId: 'order_open',
});
assert.equal(reservedForThisOrder.freePageApplied, true);
assert.equal(reservedForThisOrder.amountPaise, 172);
assert.equal(reservedForThisOrder.freePageReserved, false);

const reservedForAnother = computeQuote({
  user: reservedMember,
  totalPages: 3,
  forOrderId: 'order_other',
});
assert.equal(reservedForAnother.freePageApplied, false);
assert.equal(reservedForAnother.freePageReserved, true);
assert.equal(reservedForAnother.amountPaise, 258);

const expiredReservation = computeQuote({
  user: {
    role: 'member',
    freePageReservedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    freePageReservedOrderId: 'order_old',
  },
  totalPages: 1,
});
assert.equal(expiredReservation.freePageApplied, true);
assert.equal(expiredReservation.amountPaise, 0);

const allowPaidFreePage = computeQuote({
  user: {
    role: 'member',
    freePageReservedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    freePageReservedOrderId: 'order_paid',
  },
  totalPages: 2,
  forOrderId: 'order_paid',
  allowFreePage: true,
});
assert.equal(allowPaidFreePage.freePageApplied, true);
assert.equal(allowPaidFreePage.amountPaise, 100);
assert.equal(freePageStatus({ role: 'admin' }).ownerExempt, true);
console.log('  ok (one open order holds the free page; expired holds release it)');

console.log('[test] Quote comparison');
assert.equal(sameQuote(firstThreePages, { ...firstThreePages }), true);
assert.equal(
  sameQuote(firstThreePages, { ...firstThreePages, amountPaise: 100 }),
  false,
);
assert.equal(
  sameQuote(firstThreePages, { ...firstThreePages, freePageApplied: false }),
  false,
);
console.log('  ok');

console.log('[test] Razorpay signature');
const keySecret = 'test_secret_for_signature';
const orderId = 'order_signature_test';
const paymentId = 'pay_signature_test';
const signature = crypto
  .createHmac('sha256', keySecret)
  .update(`${orderId}|${paymentId}`)
  .digest('hex');
assert.equal(
  verifyPaymentSignature({ orderId, paymentId, signature, keySecret }),
  true,
);
assert.equal(
  verifyPaymentSignature({
    orderId,
    paymentId,
    signature: `${signature[0] === '0' ? '1' : '0'}${signature.slice(1)}`,
    keySecret,
  }),
  false,
);
assert.equal(
  verifyPaymentSignature({ orderId, paymentId, signature: '', keySecret }),
  false,
);
console.log('  ok');

console.log('[test] Payment records persist and stay idempotent');
const paymentStore = createPaymentStore({
  filePath: path.join(TEST_DIR, 'payments.json'),
});
const created = await paymentStore.create({
  orderId: 'order_store_test',
  userId: 'usr_member',
  jobId: 'job_store_test',
  amountPaise: 172,
  totalPages: 3,
  chargeablePages: 2,
  freePageApplied: true,
  receipt: 'mgn_store_test',
});
assert.equal(created.status, 'created');
const duplicate = await paymentStore.create({
  orderId: 'order_store_test',
  userId: 'usr_member',
  jobId: 'job_store_test',
  amountPaise: 999,
  totalPages: 9,
  chargeablePages: 9,
  freePageApplied: false,
});
assert.equal(duplicate.amountPaise, 172);
assert.equal(duplicate.id, created.id);

const active = await paymentStore.findActiveForJob(
  'usr_member',
  'job_store_test',
);
assert.equal(active.orderId, 'order_store_test');
const paid = await paymentStore.markPaid('order_store_test', {
  paymentId: 'pay_store_test',
});
assert.equal(paid.status, 'paid');
assert.equal(paid.signatureVerified, true);
const consumed = await paymentStore.markConsumed('order_store_test', {
  printJobId: 'job_store_test',
});
assert.equal(consumed.status, 'consumed');

const reloadedStore = createPaymentStore({
  filePath: path.join(TEST_DIR, 'payments.json'),
});
const reloaded = await reloadedStore.get('order_store_test');
assert.equal(reloaded.status, 'consumed');
assert.equal(reloaded.paymentId, 'pay_store_test');
console.log('  ok');

console.log('[test] Razorpay client against a local mock');
const calls = [];
const mockServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const expectedAuth = `Basic ${Buffer.from('rzp_test_key:test_secret').toString('base64')}`;
    calls.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      body: body ? JSON.parse(body) : null,
    });

    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (req.headers.authorization !== expectedAuth) {
      send(401, { error: { description: 'Authentication failed' } });
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/orders') {
      send(200, {
        id: 'order_mock_test',
        entity: 'order',
        amount: 172,
        currency: 'INR',
        receipt: 'mgn_mock',
        status: 'created',
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/orders/order_mock_test') {
      send(200, {
        id: 'order_mock_test',
        amount: 172,
        currency: 'INR',
        status: 'paid',
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/payments/pay_mock_test') {
      send(200, {
        id: 'pay_mock_test',
        order_id: 'order_mock_test',
        amount: 172,
        currency: 'INR',
        status: 'authorized',
      });
      return;
    }
    if (
      req.method === 'POST' &&
      req.url === '/v1/payments/pay_mock_test/capture'
    ) {
      send(200, {
        id: 'pay_mock_test',
        order_id: 'order_mock_test',
        amount: 172,
        currency: 'INR',
        status: 'captured',
      });
      return;
    }
    send(400, { error: { description: 'Unexpected mock request' } });
  });
});

await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
const mockPort = mockServer.address().port;

try {
  const client = createRazorpayClient({
    keyId: 'rzp_test_key',
    keySecret: 'test_secret',
    apiBase: `http://127.0.0.1:${mockPort}/v1`,
  });
  const order = await client.createOrder({
    amountPaise: 172,
    currency: 'INR',
    receipt: 'mgn_mock',
    notes: { jobId: 'job_mock_test', freePageApplied: '1' },
  });
  assert.equal(order.id, 'order_mock_test');

  const orderCall = calls.find(
    (call) => call.method === 'POST' && call.url === '/v1/orders',
  );
  assert(orderCall, 'The client should create an order');
  assert.equal(orderCall.body.amount, 172);
  assert.equal(orderCall.body.currency, 'INR');
  assert.equal(orderCall.body.receipt, 'mgn_mock');
  assert.equal(orderCall.body.notes.jobId, 'job_mock_test');
  assert.equal(orderCall.body.payment.capture, 'automatic');
  assert.equal(
    orderCall.body.payment.capture_options.automatic_expiry_period,
    12,
  );
  assert.equal(
    orderCall.authorization,
    `Basic ${Buffer.from('rzp_test_key:test_secret').toString('base64')}`,
  );

  const fetchedOrder = await client.getOrder('order_mock_test');
  assert.equal(fetchedOrder.status, 'paid');
  const fetchedPayment = await client.getPayment('pay_mock_test');
  assert.equal(fetchedPayment.status, 'authorized');
  const captured = await client.capturePayment('pay_mock_test', {
    amountPaise: 172,
  });
  assert.equal(captured.status, 'captured');

  const captureCall = calls.find(
    (call) => call.url === '/v1/payments/pay_mock_test/capture',
  );
  assert.equal(captureCall.body.amount, 172);
  assert.equal(captureCall.body.currency, 'INR');

  const badClient = createRazorpayClient({
    keyId: 'rzp_wrong',
    keySecret: 'test_secret',
    apiBase: `http://127.0.0.1:${mockPort}/v1`,
  });
  await assert.rejects(
    () => badClient.getOrder('order_mock_test'),
    (error) =>
      error.code === 'RAZORPAY_ERROR' &&
      error.status === 401 &&
      !/test_secret/.test(error.message),
  );
  console.log('  ok');
} finally {
  await new Promise((resolve) => mockServer.close(resolve));
}

await fsp.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});

console.log('\n==============================================');
console.log('ALL PAYWALL, PAYMENT AND SIGNATURE TESTS PASSED');
console.log('No Razorpay account was contacted and no print was created.');
console.log('==============================================\n');
