import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  computeQuote,
  printsForFree,
  quoteForUser,
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

const onePage = computeQuote({ user: member, totalPages: 1 });
assert.equal(onePage.chargeablePages, 1);
assert.equal(onePage.amountPaise, 100);

const twoPages = computeQuote({ user: member, totalPages: 2 });
assert.equal(twoPages.chargeablePages, 2);
assert.equal(twoPages.amountPaise, 200);

const threePages = computeQuote({ user: member, totalPages: 3 });
assert.equal(threePages.chargeablePages, 3);
assert.equal(threePages.amountPaise, 300);

const fourPages = computeQuote({ user: member, totalPages: 4 });
assert.equal(fourPages.chargeablePages, 4);
assert.equal(fourPages.amountPaise, 400);

const owner = quoteForUser({
  user: { role: 'admin' },
  totalPages: 9,
});
assert.equal(owner.chargeablePages, 0);
assert.equal(owner.amountPaise, 0);
assert.equal(owner.free, true);
const memberQuote = quoteForUser({
  user: { role: 'member' },
  totalPages: 9,
});
assert.equal(memberQuote.chargeablePages, 9);
assert.equal(memberQuote.amountPaise, 900);
assert.equal(memberQuote.free, false);
assert.equal(printsForFree({ role: 'admin' }), true);
assert.equal(printsForFree({ role: 'member' }), false);

const noPages = computeQuote({ user: member, totalPages: 0 });
assert.equal(noPages.chargeablePages, 0);
assert.equal(noPages.amountPaise, 0);
console.log(
  `  ok (₹1 per member page; 2 pages = ${rupees(twoPages.amountPaise)}, 3 pages = ${rupees(threePages.amountPaise)}, owner = free)`,
);

console.log('[test] Quote comparison');
assert.equal(sameQuote(threePages, { ...threePages }), true);
assert.equal(
  sameQuote(threePages, { ...threePages, amountPaise: 200 }),
  false,
);
assert.equal(
  sameQuote(threePages, { ...threePages, totalPages: 2, chargeablePages: 2 }),
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
  amountPaise: 300,
  totalPages: 3,
  chargeablePages: 3,
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
});
assert.equal(duplicate.amountPaise, 300);
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

console.log('[test] Earnings summary counts only completed payments');
const earningsPath = path.join(TEST_DIR, 'earnings.json');
const earningsNow = new Date('2026-11-17T12:00:00+05:30');
await fsp.writeFile(
  earningsPath,
  JSON.stringify([
    {
      orderId: 'order_today01',
      userId: 'usr_a',
      jobId: 'job_today',
      amountPaise: 100,
      chargeablePages: 1,
      status: 'paid',
      createdAt: '2026-11-17T06:00:00.000Z',
      paidAt: '2026-11-17T06:00:00.000Z',
    },
    {
      orderId: 'order_yester1',
      userId: 'usr_b',
      jobId: 'job_yesterday',
      amountPaise: 200,
      chargeablePages: 2,
      status: 'consumed',
      createdAt: '2026-11-16T06:00:00.000Z',
      paidAt: '2026-11-16T06:00:00.000Z',
    },
    {
      orderId: 'order_recent1',
      userId: 'usr_c',
      jobId: 'job_recent',
      amountPaise: 300,
      chargeablePages: 3,
      status: 'paid',
      createdAt: '2026-11-12T06:00:00.000Z',
      paidAt: '2026-11-12T06:00:00.000Z',
    },
    {
      orderId: 'order_old0001',
      userId: 'usr_d',
      jobId: 'job_old',
      amountPaise: 400,
      chargeablePages: 4,
      status: 'paid',
      createdAt: '2026-10-20T06:00:00.000Z',
      paidAt: '2026-10-20T06:00:00.000Z',
    },
    {
      orderId: 'order_open001',
      userId: 'usr_e',
      jobId: 'job_open',
      amountPaise: 900,
      chargeablePages: 9,
      status: 'created',
      createdAt: '2026-11-17T05:00:00.000Z',
    },
    {
      orderId: 'order_cancel1',
      userId: 'usr_f',
      jobId: 'job_cancel',
      amountPaise: 700,
      chargeablePages: 7,
      status: 'cancelled',
      createdAt: '2026-11-17T04:00:00.000Z',
      cancelledAt: '2026-11-17T04:30:00.000Z',
    },
  ]),
  'utf8',
);
const earningsStore = createPaymentStore({ filePath: earningsPath });
const earnings = await earningsStore.summary({ days: 14, now: earningsNow });
assert.equal(earnings.currency, 'INR');
assert.equal(earnings.totals.amountPaise, 1000);
assert.equal(earnings.totals.pages, 10);
assert.equal(earnings.totals.payments, 4);
assert.equal(earnings.totals.averagePaise, 250);
assert.equal(earnings.today.amountPaise, 100);
assert.equal(earnings.today.pages, 1);
assert.equal(earnings.month.amountPaise, 600);
assert.equal(earnings.month.pages, 6);
assert.equal(earnings.series.length, 14);
assert.equal(earnings.series.at(-1).date, '2026-11-17');
assert.equal(earnings.series.at(-1).amountPaise, 100);
assert.equal(
  earnings.series.reduce((sum, point) => sum + point.amountPaise, 0),
  600,
);
assert.equal(earnings.recent.length, 4);
assert.equal(earnings.recent[0].amountPaise, 100);
assert.equal(earnings.recent[0].reference, 'order_…oday01');
for (const payment of earnings.recent) {
  assert.equal('userId' in payment, false);
  assert.equal('email' in payment, false);
  assert.equal('orderId' in payment, false);
}
console.log('  ok (paid and consumed count; created and cancelled do not)');

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
        amount: 300,
        currency: 'INR',
        receipt: 'mgn_mock',
        status: 'created',
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/orders/order_mock_test') {
      send(200, {
        id: 'order_mock_test',
        amount: 300,
        currency: 'INR',
        status: 'paid',
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/payments/pay_mock_test') {
      send(200, {
        id: 'pay_mock_test',
        order_id: 'order_mock_test',
        amount: 300,
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
        amount: 300,
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
    amountPaise: 300,
    currency: 'INR',
    receipt: 'mgn_mock',
    notes: { jobId: 'job_mock_test' },
  });
  assert.equal(order.id, 'order_mock_test');

  const orderCall = calls.find(
    (call) => call.method === 'POST' && call.url === '/v1/orders',
  );
  assert(orderCall, 'The client should create an order');
  assert.equal(orderCall.body.amount, 300);
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
    amountPaise: 300,
  });
  assert.equal(captured.status, 'captured');

  const captureCall = calls.find(
    (call) => call.url === '/v1/payments/pay_mock_test/capture',
  );
  assert.equal(captureCall.body.amount, 300);
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
