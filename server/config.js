import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

function trimUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function isPrivateAddress(address) {
  const parts = String(address).split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  return (
    parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    parts[0] === 127
  );
}

function isVirtualInterface(name) {
  return /virtual|vmware|vbox|virtualbox|hyper-v|vethernet|docker|wsl|loopback|tailscale|zerotier|wireguard|openvpn|bluetooth|npcap|pseudo|tap[-_ ]|tun\d/i.test(
    name,
  );
}

function interfacePriority(name) {
  if (/wi-?fi|wlan|wireless/i.test(name)) return 0;
  if (/ethernet|lan/i.test(name)) return 2;
  return 3;
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    if (isVirtualInterface(name)) continue;
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (!isPrivateAddress(entry.address)) continue;
      candidates.push({
        address: entry.address,
        priority: interfacePriority(name),
      });
    }
  }

  candidates.sort((left, right) => left.priority - right.priority);
  const addresses = [...new Set(candidates.map((candidate) => candidate.address))];
  return addresses.length ? addresses : ['localhost'];
}

function generatedPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  for (let index = 0; index < 16; index += 1) {
    password += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return password;
}

async function getOrCreateSecret(dataDir) {
  const authPath = path.join(dataDir, 'auth.json');
  let data = null;

  try {
    data = JSON.parse(await fsp.readFile(authPath, 'utf8'));
  } catch {
    data = null;
  }

  if (!data || typeof data !== 'object') {
    data = {
      sessionSecret: crypto.randomBytes(32).toString('hex'),
      createdAt: new Date().toISOString(),
    };
  } else if (
    typeof data.sessionSecret !== 'string' ||
    data.sessionSecret.length < 32
  ) {
    data.sessionSecret = crypto.randomBytes(32).toString('hex');
  }

  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.writeFile(authPath, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });

  return { sessionSecret: data.sessionSecret, authPath };
}

export async function loadConfig() {
  loadEnv();

  const dataDir = process.env.MARGIN_DATA_DIR
    ? path.resolve(process.env.MARGIN_DATA_DIR)
    : path.join(ROOT, 'data');
  const uploadsDir = path.join(dataDir, 'uploads');
  const tempDir = path.join(dataDir, 'temp');
  await Promise.all([
    fsp.mkdir(uploadsDir, { recursive: true }),
    fsp.mkdir(tempDir, { recursive: true }),
  ]);

  const secret = await getOrCreateSecret(dataDir);
  const port = parsePositiveInt(process.env.PORT, 3000);
  const host = process.env.HOST?.trim() || '0.0.0.0';
  const maxUploadMb = Math.min(parsePositiveInt(process.env.MAX_UPLOAD_MB, 25), 50);
  const lanAddresses = getLanAddresses();
  const lanAddress = lanAddresses[0];
  const fileTtlHours = parsePositiveInt(process.env.MARGIN_FILE_TTL_HOURS, 2);
  const adminEmail = String(
    process.env.MARGIN_ADMIN_EMAIL ?? 'owner@margin.local',
  ).trim();
  const adminName = String(process.env.MARGIN_ADMIN_NAME ?? 'Owner').trim();
  const adminPassword = String(
    process.env.MARGIN_ADMIN_PASSWORD ?? '',
  ).trim();
  const generatedAdminPassword = adminPassword ? '' : generatedPassword();
  const printPin = /^\d{4,12}$/.test(String(process.env.MARGIN_PRINT_PIN ?? '').trim())
    ? String(process.env.MARGIN_PRINT_PIN).trim()
    : '123456';
  const printPinUnlockMinutes = parsePositiveInt(
    process.env.MARGIN_PIN_UNLOCK_MINUTES,
    30,
  );
  const pinAttemptsPerWindow = parsePositiveInt(
    process.env.MARGIN_PIN_ATTEMPTS,
    10,
  );
  const razorpayKeyId = String(process.env.RAZORPAY_KEY_ID ?? '').trim();
  const razorpayKeySecret = String(
    process.env.RAZORPAY_KEY_SECRET ?? '',
  ).trim();
  const pricePerPagePaise = parsePositiveInt(
    process.env.MARGIN_PRICE_PER_PAGE_PAISE,
    100,
  );
  const minimumChargePaise = Math.max(
    parsePositiveInt(process.env.MARGIN_MINIMUM_CHARGE_PAISE, 100),
    100,
  );
  const paymentOrderTtlMinutes = Math.min(
    Math.max(
      parsePositiveInt(process.env.MARGIN_PAYMENT_ORDER_TTL_MINUTES, 30),
      5,
    ),
    240,
  );

  return {
    root: ROOT,
    publicDir: path.join(ROOT, 'public'),
    scriptsDir: path.join(ROOT, 'scripts'),
    dataDir,
    uploadsDir,
    tempDir,
    usersPath: path.join(dataDir, 'users.json'),
    historyPath: path.join(dataDir, 'history.json'),
    printerSelectionPath: path.join(dataDir, 'printer-selection.json'),
    paymentsPath: path.join(dataDir, 'payments.json'),
    adminInitialPasswordPath: path.join(dataDir, 'admin-initial-password.txt'),
    port,
    host,
    lanAddress,
    lanAddresses,
    localUrl: `http://localhost:${port}`,
    lanUrl: `http://${lanAddress}:${port}`,
    lanUrls: lanAddresses.map((address) => `http://${address}:${port}`),
    publicUrl: trimUrl(process.env.PUBLIC_URL),
    publicOrigin: trimUrl(process.env.MARGIN_PUBLIC_ORIGIN),
    publicApiUrl: trimUrl(process.env.MARGIN_PUBLIC_API_URL),
    proxySecret: String(process.env.MARGIN_PROXY_SECRET ?? '').trim(),
    sessionSecret: secret.sessionSecret,
    authPath: secret.authPath,
    sessionDays: parsePositiveInt(process.env.MARGIN_SESSION_DAYS, 30),
    maxUploadBytes: maxUploadMb * 1024 * 1024,
    maxUploadMb,
    maxPagesPerDocument: parsePositiveInt(process.env.MARGIN_MAX_PAGES, 300),
    fileTtlMs: fileTtlHours * 60 * 60 * 1000,
    maxHistory: parsePositiveInt(process.env.MARGIN_HISTORY_LIMIT, 24),
    dailyPages: parsePositiveInt(process.env.MARGIN_DAILY_PAGES, 120),
    globalDailyPages: parsePositiveInt(process.env.MARGIN_GLOBAL_DAILY_PAGES, 400),
    maxActiveJobsPerUser: parsePositiveInt(process.env.MARGIN_MAX_ACTIVE_JOBS, 3),
    maxActiveJobsGlobal: parsePositiveInt(process.env.MARGIN_MAX_JOBS, 6),
    uploadsPerHour: parsePositiveInt(process.env.MARGIN_UPLOADS_PER_HOUR, 30),
    printsPerHour: parsePositiveInt(process.env.MARGIN_PRINTS_PER_HOUR, 40),
    // Shared print PIN. Every member types this before a page is sent to the
    // printer, so a stray click or an unknown visitor cannot make paper move.
    printPin,
    printPinUnlockMinutes,
    pinAttemptsPerWindow,
    // Payments run on this laptop, never in the browser. Only the public key
    // ID is ever sent to a client, and only after a paid order is requested.
    razorpayKeyId,
    razorpayKeySecret,
    razorpayApiBase: String(
      process.env.MARGIN_RAZORPAY_API_BASE ?? '',
    ).trim(),
    paymentsEnabled: Boolean(razorpayKeyId && razorpayKeySecret),
    pricePerPagePaise,
    minimumChargePaise,
    paymentOrderTtlMinutes,
    openSignup: parseBoolean(process.env.MARGIN_OPEN_SIGNUP),
    admin: {
      email: adminEmail,
      name: adminName,
      password: adminPassword,
      generatedPassword: generatedAdminPassword,
    },
    isWindows: process.platform === 'win32',
    allowedExtensions: new Set([
      '.pdf',
      '.doc',
      '.docx',
      '.rtf',
      '.odt',
      '.txt',
      '.md',
      '.xls',
      '.xlsx',
      '.xlsm',
      '.csv',
      '.ppt',
      '.pptx',
      '.pps',
      '.ppsx',
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.tif',
      '.tiff',
    ]),
  };
}
