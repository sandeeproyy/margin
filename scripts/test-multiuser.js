import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const TEST_DATA_DIR = path.join(
  os.tmpdir(),
  `margin-test-${crypto.randomUUID()}`,
);
await fsp.mkdir(TEST_DATA_DIR, { recursive: true });

const PORT = 3100 + crypto.randomInt(0, 700);
process.env.MARGIN_DATA_DIR = TEST_DATA_DIR;
process.env.PORT = String(PORT);
process.env.HOST = '127.0.0.1';
process.env.MARGIN_ADMIN_EMAIL = 'admin@margin.test';
process.env.MARGIN_ADMIN_NAME = 'Owner';
process.env.MARGIN_ADMIN_PASSWORD = 'TestPassword123!';
process.env.MARGIN_PROXY_SECRET = '';
process.env.MARGIN_PUBLIC_ORIGIN = '';
process.env.MARGIN_PUBLIC_API_URL = '';
process.env.MARGIN_OPEN_SIGNUP = 'false';
process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';

console.log('[test] Starting Margin in an isolated test environment...');
console.log(`[test] Data directory: ${TEST_DATA_DIR}`);
console.log(`[test] Port: ${PORT}`);

await import('../server/index.js');

const BASE = `http://127.0.0.1:${PORT}`;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      // The server is still binding.
    }
    await sleep(150);
  }
  throw new Error('The test server did not start in time.');
}

async function request(
  urlPath,
  { method = 'GET', headers = {}, body = null } = {},
) {
  const reqHeaders = { ...headers };
  if (method !== 'GET' && method !== 'HEAD') {
    reqHeaders['X-Margin-Intent'] ??= 'app';
  }

  let bodyData = null;
  if (body instanceof Uint8Array) {
    bodyData = body;
  } else if (body !== null && typeof body === 'object') {
    reqHeaders['Content-Type'] = 'application/json';
    bodyData = JSON.stringify(body);
  } else if (body !== null) {
    bodyData = body;
  }

  const response = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: reqHeaders,
    body: bodyData,
    redirect: 'manual',
  });

  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
  let json = null;
  const text = await response.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return {
    status: response.status,
    headers: response.headers,
    cookies: setCookies,
    json,
    text,
  };
}

function cookieFrom(response) {
  const cookie = response.cookies.find((value) =>
    value.startsWith('margin_session='),
  );
  assert(cookie, 'Session cookie should be set');
  return cookie.split(';')[0];
}

async function createPdf() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 1; pageNumber <= 2; pageNumber += 1) {
    const page = document.addPage([595, 842]);
    page.drawText(`Margin privacy check / page ${pageNumber}`, {
      x: 64,
      y: 742,
      size: 18,
      font,
      color: rgb(0.09, 0.09, 0.06),
    });
    page.drawText('This page never reaches a real printer during tests.', {
      x: 64,
      y: 712,
      size: 11,
      font,
      color: rgb(0.35, 0.35, 0.3),
    });
  }
  return document.save();
}

async function pollJob(cookie, id) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await request(`/api/jobs/${id}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 200, 'Job status should be readable');
    const job = response.json.job;
    if (job.status === 'ready' || job.status === 'error') return job;
    await sleep(250);
  }
  throw new Error('The test job was not prepared in time.');
}

let adminCookie = null;
let aliceCookie = null;
let bobCookie = null;
let aliceJobId = null;

async function runTests() {
  await waitForServer();

  console.log('[test] 1. Health endpoint');
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);
  console.log('  ok');

  console.log('[test] 2. Bad sign-in is rejected');
  const badLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@margin.test', password: 'NotThePassword!' },
  });
  assert.equal(badLogin.status, 401);
  console.log('  ok');

  console.log('[test] 3. Admin sign-in');
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@margin.test', password: 'TestPassword123!' },
  });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.role, 'admin');
  adminCookie = cookieFrom(login);
  console.log('  ok');

  console.log('[test] 4. Admin bootstrap exposes only a client-safe printer');
  const adminBootstrap = await request('/api/bootstrap', {
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminBootstrap.status, 200);
  assert.equal(adminBootstrap.json.account.role, 'admin');
  assert.equal(adminBootstrap.json.paywall.pricePerPagePaise, 100);
  assert.equal(adminBootstrap.json.paywall.ownerExempt, undefined);
  assert.equal(adminBootstrap.json.paywall.freePageAvailable, undefined);
  assert(
    Array.isArray(adminBootstrap.json.printers) &&
      adminBootstrap.json.printers.length <= 1,
    'The print sheet should show at most one printer',
  );
  for (const printer of adminBootstrap.json.printers) {
    assert.equal(printer.name, undefined);
    assert.equal(printer.port, undefined);
    assert.equal(printer.driver, undefined);
    assert.equal(printer.label, 'Your printer');
  }
  console.log('  ok');

  console.log('[test] 5. PIN gate is removed');
  const pinStatus = await request('/api/pin/status', {
    headers: { Cookie: adminCookie },
  });
  assert.equal(pinStatus.status, 404);
  console.log('  ok');

  console.log('[test] 6. Owner sees the full printer list only in the admin panel');
  const adminPrinters = await request('/api/admin/printers', {
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminPrinters.status, 200);
  assert(Array.isArray(adminPrinters.json.printers));

  let selectedPrinter = null;
  if (adminPrinters.json.printers.length > 0) {
    selectedPrinter =
      adminPrinters.json.printers.find((printer) =>
        /microsoft print to pdf/i.test(printer.name),
      ) || adminPrinters.json.printers[0];
    const selection = await request('/api/admin/printers/select', {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: { printerId: selectedPrinter.id },
    });
    assert.equal(selection.status, 200);
    assert.equal(selection.json.printerName, selectedPrinter.name);
  }

  const adminSheetPrinters = await request('/api/printers?refresh=1', {
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminSheetPrinters.status, 200);
  assert(
    adminSheetPrinters.json.printers.length <= 1,
    'The admin print sheet must not reveal every printer',
  );
  for (const printer of adminSheetPrinters.json.printers) {
    assert.equal(printer.name, undefined);
    assert.equal(printer.port, undefined);
  }
  console.log(
    selectedPrinter
      ? `  ok (selected a test printer: ${selectedPrinter.name})`
      : '  ok (no printers installed on this test machine)',
  );

  console.log('[test] 7. Invite and member registration');
  const invite = await request('/api/admin/invites', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: { note: 'Alice test invite', expiresInDays: 7 },
  });
  assert.equal(invite.status, 201);
  assert(invite.json.code);

  const register = await request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Alice Member',
      email: 'alice@margin.test',
      password: 'MemberPassword123!',
      inviteCode: invite.json.code,
    },
  });
  assert.equal(register.status, 201);
  assert.equal(register.json.user.role, 'member');
  aliceCookie = cookieFrom(register);

  const reuse = await request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Someone Else',
      email: 'someone@margin.test',
      password: 'MemberPassword123!',
      inviteCode: invite.json.code,
    },
  });
  assert(
    reuse.status === 400 || reuse.status === 409,
    'An invitation must only work once',
  );
  console.log('  ok');

  console.log('[test] 8. Member isolation');
  const memberAdmin = await request('/api/admin/overview', {
    headers: { Cookie: aliceCookie },
  });
  assert.equal(memberAdmin.status, 403);

  const memberBootstrap = await request('/api/bootstrap', {
    headers: { Cookie: aliceCookie },
  });
  assert.equal(memberBootstrap.status, 200);
  assert.equal(memberBootstrap.json.pinVerified, undefined);
  assert.equal(memberBootstrap.json.paywall.ownerExempt, undefined);
  assert.equal(memberBootstrap.json.paywall.freePageAvailable, undefined);
  assert.equal(memberBootstrap.json.paywall.pricePerPagePaise, 100);
  assert.equal(memberBootstrap.json.paywall.minimumChargePaise, 100);
  assert.equal(memberBootstrap.json.paywall.enabled, false);
  assert.equal(memberBootstrap.json.paywall.keyId, undefined);
  assert(
    memberBootstrap.json.printers.length <= 1,
    'A member should see at most the active printer',
  );
  for (const printer of memberBootstrap.json.printers) {
    assert.equal(printer.name, undefined);
    assert.equal(printer.port, undefined);
    assert.equal(printer.driver, undefined);
    assert.equal(printer.label, 'Your printer');
  }
  assert.deepEqual(memberBootstrap.json.history, []);
  console.log('  ok');

  console.log('[test] 9. Direct upload preparation requires a session');
  const anonymousPrepare = await request('/api/uploads/prepare', {
    method: 'POST',
    body: { name: 'private.pdf', size: 1000 },
  });
  assert.equal(anonymousPrepare.status, 401);

  console.log('[test] 10. Member upload, preparation, thumbnail and preview');
  const pdfBytes = await createPdf();
  const prepare = await request('/api/uploads/prepare', {
    method: 'POST',
    headers: { Cookie: aliceCookie },
    body: { name: 'privacy-check.pdf', size: pdfBytes.length },
  });
  assert.equal(prepare.status, 201);
  assert(prepare.json.upload.url);
  assert(prepare.json.upload.token);

  const upload = await fetch(`${BASE}${prepare.json.upload.url}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf',
      'X-Upload-Token': prepare.json.upload.token,
    },
    body: pdfBytes,
  });
  assert.equal(upload.status, 202);
  const uploaded = await upload.json();
  aliceJobId = uploaded.job.id;

  const job = await pollJob(aliceCookie, aliceJobId);
  assert.equal(job.status, 'ready');
  assert.equal(job.pages, 2);

  const thumbnail = await fetch(`${BASE}/api/jobs/${aliceJobId}/thumb`, {
    headers: { Cookie: aliceCookie },
  });
  assert.equal(thumbnail.status, 200);
  assert.match(thumbnail.headers.get('content-type') || '', /image\/webp/);

  const preview = await fetch(`${BASE}/api/jobs/${aliceJobId}/preview/1`, {
    headers: { Cookie: aliceCookie },
  });
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-type') || '', /image\/webp/);
  console.log('  ok');

  console.log('[test] 11. A second member and the owner cannot open that job');
  const bobInvite = await request('/api/admin/invites', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: { note: 'Bob test invite', expiresInDays: 7 },
  });
  const bobRegister = await request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Bob Member',
      email: 'bob@margin.test',
      password: 'MemberPassword123!',
      inviteCode: bobInvite.json.code,
    },
  });
  assert.equal(bobRegister.status, 201);
  bobCookie = cookieFrom(bobRegister);

  for (const cookie of [adminCookie, bobCookie]) {
    const denied = await request(`/api/jobs/${aliceJobId}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(denied.status, 404);
  }

  const bobBootstrap = await request('/api/bootstrap', {
    headers: { Cookie: bobCookie },
  });
  assert.deepEqual(bobBootstrap.json.history, []);
  console.log('  ok');

  console.log('[test] 12. Printing is blocked until payment is completed');
  const printAttempt = await request(`/api/jobs/${aliceJobId}/print`, {
    method: 'POST',
    headers: { Cookie: aliceCookie },
    body: {
      copies: 1,
      paperId: '9-827-1169',
      orientation: 'auto',
      sides: 'one-sided',
      scale: 'fit',
      pageRange: 'all',
    },
  });
  assert.equal(printAttempt.status, 402);
  assert.equal(printAttempt.json.code, 'PAYMENT_REQUIRED');
  console.log('  ok (nothing was sent to a printer)');

  console.log('[test] 13. Admin responses hide member emails');
  const overview = await request('/api/admin/overview', {
    headers: { Cookie: adminCookie },
  });
  assert.equal(overview.status, 200);
  const aliceRecord = overview.json.users.find(
    (user) => user.name === 'Alice Member',
  );
  const bobRecord = overview.json.users.find(
    (user) => user.name === 'Bob Member',
  );
  const ownerRecord = overview.json.users.find(
    (user) => user.email === 'admin@margin.test',
  );
  assert(aliceRecord, 'Alice should appear in the admin overview');
  assert(bobRecord, 'Bob should appear in the admin overview');
  assert(ownerRecord, 'The owner should still see their own email');
  assert.equal('email' in aliceRecord, false);
  assert.equal('email' in bobRecord, false);
  assert.equal(JSON.stringify(overview.json).includes('alice@margin.test'), false);
  assert.equal(JSON.stringify(overview.json).includes('bob@margin.test'), false);
  console.log('  ok');

  console.log('[test] 14. Status and reset responses stay email-free');
  const disableBob = await request(`/api/admin/users/${bobRecord.id}`, {
    method: 'PATCH',
    headers: { Cookie: adminCookie },
    body: { status: 'disabled' },
  });
  assert.equal(disableBob.status, 200);
  assert.equal(disableBob.json.user.status, 'disabled');
  assert.equal('email' in disableBob.json.user, false);

  const enableBob = await request(`/api/admin/users/${bobRecord.id}`, {
    method: 'PATCH',
    headers: { Cookie: adminCookie },
    body: { status: 'active' },
  });
  assert.equal(enableBob.status, 200);
  assert.equal('email' in enableBob.json.user, false);

  const resetBob = await request(`/api/admin/users/${bobRecord.id}/reset`, {
    method: 'POST',
    headers: { Cookie: adminCookie },
  });
  assert.equal(resetBob.status, 200);
  assert(resetBob.json.password, 'A temporary password should be returned');
  assert.equal('email' in resetBob.json.user, false);
  assert.equal(resetBob.text.includes('bob@margin.test'), false);
  console.log('  ok');

  console.log('[test] 15. Earnings are owner-only and contain no customer identity');
  const memberEarnings = await request('/api/admin/earnings', {
    headers: { Cookie: aliceCookie },
  });
  assert.equal(memberEarnings.status, 403);

  const earnings = await request('/api/admin/earnings', {
    headers: { Cookie: adminCookie },
  });
  assert.equal(earnings.status, 200);
  assert.equal(earnings.json.earnings.currency, 'INR');
  assert.equal(earnings.json.earnings.series.length, 14);
  assert.equal(Array.isArray(earnings.json.earnings.recent), true);
  assert.equal(typeof earnings.json.earnings.totals.amountPaise, 'number');
  assert.equal(earnings.text.includes('@margin.test'), false);
  for (const payment of earnings.json.earnings.recent) {
    assert.equal('userId' in payment, false);
    assert.equal('email' in payment, false);
    assert.equal('orderId' in payment, false);
  }
  console.log('  ok');

  console.log('[test] 16. Cookie policy and security headers');
  const cookiePage = await request('/cookies.html');
  assert.equal(cookiePage.status, 200);
  assert.equal(cookiePage.text.includes('Cookie settings'), true);
  assert.equal(cookiePage.text.includes('/cookies.js?v=9'), true);

  const healthHeaders = await request('/api/health');
  assert.match(
    healthHeaders.headers.get('cache-control') || '',
    /no-store/,
  );
  assert.match(
    healthHeaders.headers.get('permissions-policy') || '',
    /payment=\(self/,
  );
  assert.match(
    healthHeaders.headers.get('cross-origin-opener-policy') || '',
    /same-origin-allow-popups/,
  );
  const csp = healthHeaders.headers.get('content-security-policy') || '';
  assert.equal(csp.includes('https://*.trycloudflare.com'), true);
  assert.equal(/\shttps:\s/.test(csp), false);

  const intentless = await fetch(`${BASE}/api/admin/invites`, {
    method: 'POST',
    headers: {
      Cookie: adminCookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ note: 'intent check' }),
  });
  assert.equal(intentless.status, 403);
  console.log('  ok');

  console.log('[test] 17. The owner is exempt from payment');
  const ownerPdf = await createPdf();
  const ownerPrepare = await request('/api/uploads/prepare', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: { name: 'owner-free-check.pdf', size: ownerPdf.length },
  });
  assert.equal(ownerPrepare.status, 201);

  const ownerUpload = await fetch(
    `${BASE}${ownerPrepare.json.upload.url}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
        'X-Upload-Token': ownerPrepare.json.upload.token,
      },
      body: ownerPdf,
    },
  );
  assert.equal(ownerUpload.status, 202);
  const ownerJobId = (await ownerUpload.json()).job.id;
  const ownerJob = await pollJob(adminCookie, ownerJobId);
  assert.equal(ownerJob.status, 'ready');

  const ownerOrder = await request(
    `/api/jobs/${ownerJobId}/payment-order`,
    {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: {
        copies: 1,
        paperId: '9-827-1169',
        orientation: 'auto',
        sides: 'one-sided',
        scale: 'fit',
        pageRange: 'all',
      },
    },
  );
  assert.equal(ownerOrder.status, 400);
  assert.equal(ownerOrder.json.code, 'PAYMENT_NOT_REQUIRED');
  assert.equal(ownerOrder.json.quote.amountPaise, 0);
  assert.equal(ownerOrder.json.quote.chargeablePages, 0);
  assert.equal(ownerOrder.json.quote.free, true);

  const ownerBootstrap = await request('/api/bootstrap', {
    headers: { Cookie: adminCookie },
  });
  assert.equal(ownerBootstrap.status, 200);
  assert.equal(ownerBootstrap.json.paywall.freeForYou, true);

  const aliceBootstrap = await request('/api/bootstrap', {
    headers: { Cookie: aliceCookie },
  });
  assert.equal(aliceBootstrap.status, 200);
  assert.equal(aliceBootstrap.json.paywall.freeForYou, false);
  console.log('  ok (owner quote is ₹0; no Razorpay order and no print)');

  console.log('\n==============================================');
  console.log('ALL MULTI-USER, PRIVACY & PAYMENT GATE TESTS PASSED');
  console.log('No physical print job was created.');
  console.log('==============================================\n');

  await fsp.rm(TEST_DATA_DIR, { recursive: true, force: true }).catch(() => {});
  process.exit(0);
}

runTests().catch((error) => {
  console.error('\n[test] FAILED:', error);
  fsp
    .rm(TEST_DATA_DIR, { recursive: true, force: true })
    .catch(() => {})
    .finally(() => process.exit(1));
});
