import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Set isolated data directory in temp
const TEST_DATA_DIR = path.join(os.tmpdir(), `margin-test-${crypto.randomUUID()}`);
await fsp.mkdir(TEST_DATA_DIR, { recursive: true });

process.env.MARGIN_DATA_DIR = TEST_DATA_DIR;
process.env.PORT = '3099';
process.env.HOST = '127.0.0.1';
process.env.MARGIN_ADMIN_EMAIL = 'admin@margin.test';
process.env.MARGIN_ADMIN_PASSWORD = 'TestPassword123!';
process.env.MARGIN_PRINT_PIN = '292929';
process.env.MARGIN_PROXY_SECRET = '';

console.log('[test] Starting Margin in isolated test environment...');
console.log(`[test] Data Dir: ${TEST_DATA_DIR}`);

// Import server (it starts listening on PORT)
await import('../server/index.js');

// Give server time to bind
await new Promise((resolve) => setTimeout(resolve, 1000));

const BASE = 'http://127.0.0.1:3099';

async function request(urlPath, { method = 'GET', headers = {}, body = null } = {}) {
  const reqHeaders = { ...headers };
  if (method !== 'GET') {
    reqHeaders['X-Margin-Intent'] = 'app';
  }
  let bodyData = null;
  if (body !== null && typeof body === 'object') {
    reqHeaders['Content-Type'] = 'application/json';
    bodyData = JSON.stringify(body);
  } else if (body) {
    bodyData = body;
  }

  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: reqHeaders,
    body: bodyData,
    redirect: 'manual',
  });

  const cookie = res.headers.get('set-cookie');
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: res.status, headers: res.headers, cookie, json, text };
}

let adminCookie = null;
let userCookie = null;
let inviteCode = null;

async function runTests() {
  console.log('[test] 1. Testing Health Endpoint...');
  const health = await request('/api/health');
  assert.equal(health.status, 200, 'Health endpoint should return 200');
  assert.equal(health.json.ok, true);
  console.log('  ✓ Health passed');

  console.log('[test] 2. Testing Admin Login...');
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'admin@margin.test',
      password: 'TestPassword123!',
    },
  });
  assert.equal(loginRes.status, 200, 'Admin login should succeed');
  assert.equal(loginRes.json.user.role, 'admin');
  adminCookie = loginRes.cookie.split(';')[0];
  assert(adminCookie.startsWith('margin_session='), 'Session cookie set');
  console.log('  ✓ Admin login passed');

  console.log('[test] 3. Testing PIN Status Before Verification...');
  const pinStatus1 = await request('/api/pin/status', {
    headers: { Cookie: adminCookie },
  });
  assert.equal(pinStatus1.status, 200);
  assert.equal(pinStatus1.json.verified, false, 'PIN should not be verified initially');
  console.log('  ✓ PIN initial status passed');

  console.log('[test] 4. Testing PIN Verification with Wrong Code...');
  const badPin = await request('/api/pin/verify', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: { pin: '000000' },
  });
  assert.equal(badPin.status, 403, 'Wrong PIN should return 403');
  console.log('  ✓ Wrong PIN correctly rejected');

  console.log('[test] 5. Testing PIN Verification with 292929...');
  const goodPin = await request('/api/pin/verify', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: { pin: '292929' },
  });
  assert.equal(goodPin.status, 200, 'Valid PIN should return 200');
  assert.equal(goodPin.json.verified, true);

  const pinStatus2 = await request('/api/pin/status', {
    headers: { Cookie: adminCookie },
  });
  assert.equal(pinStatus2.json.verified, true, 'PIN status should now be verified');
  console.log('  ✓ PIN 292929 successfully verified');

  console.log('[test] 6. Testing Admin Invite Creation...');
  const inviteRes = await request('/api/admin/invites', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: { note: 'Test user invite', expiresInDays: 7 },
  });
  assert.equal(inviteRes.status, 201, 'Invite creation should return 201');
  assert(inviteRes.json.code, 'Invite code generated');
  inviteCode = inviteRes.json.code;
  console.log(`  ✓ Invite created: ${inviteCode}`);

  console.log('[test] 7. Testing Member Registration with Invite...');
  const registerRes = await request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Alice Member',
      email: 'alice@margin.test',
      password: 'MemberPassword123!',
      inviteCode,
    },
  });
  assert.equal(registerRes.status, 201, 'Registration should return 201');
  assert.equal(registerRes.json.user.role, 'member');
  userCookie = registerRes.cookie.split(';')[0];
  console.log('  ✓ Member account registered');

  console.log('[test] 8. Testing Member Privacy Isolation...');
  const memberAdminCheck = await request('/api/admin/overview', {
    headers: { Cookie: userCookie },
  });
  assert.equal(memberAdminCheck.status, 403, 'Member must NOT access admin overview');
  console.log('  ✓ Member strictly blocked from admin panel');

  console.log('[test] 9. Testing Member PIN Status (Per-User Isolation)...');
  const memberPinStatus = await request('/api/pin/status', {
    headers: { Cookie: userCookie },
  });
  assert.equal(memberPinStatus.json.verified, false, 'Member has not entered PIN yet');
  console.log('  ✓ Member PIN state is isolated from Admin');

  console.log('[test] 10. Testing Admin Printer Management...');
  const adminPrinters = await request('/api/admin/printers', {
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminPrinters.status, 200);
  assert(Array.isArray(adminPrinters.json.printers), 'Printers array returned');
  console.log(`  ✓ Admin detected ${adminPrinters.json.printers.length} printer(s)`);

  if (adminPrinters.json.printers.length > 0) {
    const targetPrinter = adminPrinters.json.printers[0];
    console.log(`  [test] Selecting printer "${targetPrinter.name}" for client-side use...`);
    const selectRes = await request('/api/admin/printers/select', {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: { printerId: targetPrinter.id },
    });
    assert.equal(selectRes.status, 200);
    assert.equal(selectRes.json.printerName, targetPrinter.name);
    console.log('  ✓ Printer selected successfully');
  }

  console.log('[test] 11. Testing Client-Side Printer View (No Leaks)...');
  const clientBootstrap = await request('/api/bootstrap', {
    headers: { Cookie: userCookie },
  });
  assert.equal(clientBootstrap.status, 200);
  const clientPrinters = clientBootstrap.json.printers;
  for (const p of clientPrinters) {
    assert(!p.name, 'Client printer must NOT expose real printer name');
    assert(!p.port, 'Client printer must NOT expose port');
    assert(!p.driver, 'Client printer must NOT expose driver');
    assert.equal(p.label, 'Your printer', 'Client printer label should be "Your printer"');
  }
  console.log('  ✓ Client-side printer details safely obfuscated');

  console.log('\n=======================================');
  console.log('ALL MULTI-USER & PIN TESTS PASSED! ✓✓✓');
  console.log('=======================================\n');

  // Clean up test data dir
  await fsp.rm(TEST_DATA_DIR, { recursive: true, force: true }).catch(() => {});
  process.exit(0);
}

runTests().catch((err) => {
  console.error('[test ERROR]', err);
  fsp.rm(TEST_DATA_DIR, { recursive: true, force: true }).catch(() => {});
  process.exit(1);
});
