import crypto from 'node:crypto';

const COOKIE_NAME = 'margin_session';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

export function timingSafeEqualString(left, right) {
  const leftHash = crypto.createHash('sha256').update(String(left)).digest();
  const rightHash = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function createSessionToken(config, user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      uid: user.id,
      v: user.sessionVersion,
      iat: now,
      exp: now + config.sessionDays * 24 * 60 * 60,
      nonce: crypto.randomBytes(10).toString('hex'),
    }),
  );
  return `${payload}.${sign(payload, config.sessionSecret)}`;
}

function verifySessionToken(token, config) {
  if (!token || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload, config.sessionSecret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!decoded?.exp || decoded.exp < now) return null;
    if (!decoded?.iat || decoded.iat > now + 60) return null;
    if (!decoded?.uid || !decoded?.v) return null;
    return decoded;
  } catch {
    return null;
  }
}

function isSecureRequest(req) {
  return Boolean(
    req.secure ||
      req.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https',
  );
}

function setSessionCookie(req, res, config, user) {
  const token = createSessionToken(config, user);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${config.sessionDays * 24 * 60 * 60}`,
  ];
  if (isSecureRequest(req, config)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req, res, config) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecureRequest(req, config)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function isLocalHost(host) {
  const value = String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!value) return false;
  if (value === 'localhost' || value === '127.0.0.1' || value === '::1') {
    return true;
  }
  const parts = value.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  return (
    parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] === 127
  );
}

function requestHost(req) {
  // Use the Host header, not a forwarded header: a client must not be able to
  // claim it came from localhost just by adding a header to a tunnel request.
  return String(req.get('host') ?? '')
    .trim()
    .replace(/:\d+$/, '');
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function authError(res, message, status = 401) {
  res.status(status).json({ ok: false, error: message });
}

function createAttemptBucket() {
  return new Map();
}

function attemptKey(scope, value) {
  return `${scope}:${String(value ?? '').toLowerCase()}`;
}

function checkAttempts(bucket, key, { windowMs, max }) {
  const now = Date.now();
  const record = bucket.get(key);
  if (!record || now - record.startedAt > windowMs) {
    return { ok: true };
  }
  if (record.count >= max) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((record.startedAt + windowMs - now) / 1000)),
    };
  }
  return { ok: true };
}

function bumpAttempts(bucket, key) {
  const now = Date.now();
  const record = bucket.get(key);
  if (!record) {
    bucket.set(key, { startedAt: now, count: 1 });
    return;
  }
  record.count += 1;
}

function clearAttempts(bucket, key) {
  bucket.delete(key);
}

export function createSecurity({ config, users }) {
  const loginAttempts = createAttemptBucket();
  const loginWindowMs = 15 * 60 * 1000;
  const loginMax = 8;
  const registerAttempts = createAttemptBucket();
  const registerWindowMs = 60 * 60 * 1000;
  const registerMax = 5;

  async function sessionMiddleware(req, res, next) {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const payload = verifySessionToken(cookies[COOKIE_NAME], config);
      req.user = null;
      req.session = payload;

      if (payload) {
        const user = await users.findById(payload.uid);
        if (
          user &&
          user.status === 'active' &&
          Number(payload.v) === Number(user.sessionVersion)
        ) {
          req.user = user;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  }

  function requireAuth(req, res, next) {
    if (!req.user) {
      authError(res, 'Please sign in to continue.');
      return;
    }
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.user) {
      authError(res, 'Please sign in to continue.');
      return;
    }
    if (req.user.role !== 'admin') {
      res.status(403).json({
        ok: false,
        error: 'That area is only available to the print room owner.',
      });
      return;
    }
    next();
  }

  function requireAppIntent(req, res, next) {
    if (req.get('x-margin-intent') !== 'app') {
      res.status(403).json({ ok: false, error: 'Request blocked.' });
      return;
    }
    next();
  }

  function requireProxySecret(req, res, next) {
    if (!config.proxySecret) {
      next();
      return;
    }
    if (!req.path.startsWith('/api/')) {
      next();
      return;
    }
    if (req.method === 'OPTIONS') {
      next();
      return;
    }
    if (req.path === '/api/health') {
      next();
      return;
    }
    // The file body travels straight from the browser to the print room so it
    // never passes through Vercel's request size limit. That one endpoint is
    // protected by a single-use upload token instead of the proxy secret.
    if (/^\/api\/uploads\/[^/]+$/.test(req.path)) {
      next();
      return;
    }
    // The owner also uses the laptop directly at localhost or over the home
    // network. Those requests never traverse the tunnel, so the shared proxy
    // secret is not present (and must never be exposed to a browser).
    if (isLocalHost(requestHost(req))) {
      next();
      return;
    }
    const provided = req.get('x-margin-proxy') ?? '';
    if (!timingSafeEqualString(provided, config.proxySecret)) {
      res.status(404).json({ ok: false, error: 'Not found.' });
      return;
    }
    next();
  }

  function allowedOriginHosts(req) {
    const hosts = new Set();
    const configured = [];
    for (const value of [config.publicOrigin, config.publicApiUrl]) {
      if (!value) continue;
      try {
        configured.push(new URL(value).host);
      } catch {
        // Ignore a malformed optional URL.
      }
    }
    for (const value of [
      req.get('x-forwarded-host'),
      req.get('host'),
      ...configured,
    ]) {
      if (value) hosts.add(String(value).toLowerCase());
    }
    hosts.add(`localhost:${config.port}`);
    hosts.add(`127.0.0.1:${config.port}`);
    return hosts;
  }

  function createOriginGuard() {
    return (req, res, next) => {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        next();
        return;
      }
      if (/^\/api\/uploads\/[^/]+$/.test(req.path)) {
        next();
        return;
      }

      const origin = req.get('origin');
      if (origin) {
        try {
          const originUrl = new URL(origin);
          if (!allowedOriginHosts(req).has(originUrl.host.toLowerCase())) {
            res.status(403).json({ ok: false, error: 'Request blocked.' });
            return;
          }
        } catch {
          res.status(403).json({ ok: false, error: 'Request blocked.' });
          return;
        }
      }
      next();
    };
  }

  function uploadCors(req, res, next) {
    const origin = req.get('origin');
    if (origin) {
      let allowed = false;
      try {
        const originUrl = new URL(origin);
        allowed = allowedOriginHosts(req).has(originUrl.host.toLowerCase());
      } catch {
        allowed = false;
      }
      if (!allowed) {
        res.status(403).json({ ok: false, error: 'Request blocked.' });
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Upload-Token',
      );
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  }

  function loginRateLimit(req, res, next) {
    const email = normalizeEmail(req.body?.email);
    const keys = [
      attemptKey('ip', clientKey(req)),
      email ? attemptKey('email', email) : '',
    ].filter(Boolean);

    for (const key of keys) {
      const result = checkAttempts(loginAttempts, key, {
        windowMs: loginWindowMs,
        max: loginMax,
      });
      if (!result.ok) {
        res.setHeader('Retry-After', String(result.retryAfter));
        res.status(429).json({
          ok: false,
          error: 'Too many sign-in attempts. Wait a few minutes, then try again.',
        });
        return;
      }
    }
    next();
  }

  function recordFailedLogin(req) {
    const email = normalizeEmail(req.body?.email);
    for (const key of [
      attemptKey('ip', clientKey(req)),
      email ? attemptKey('email', email) : '',
    ]) {
      if (!key) continue;
      bumpAttempts(loginAttempts, key);
    }
  }

  function clearLoginAttempts(req) {
    const email = normalizeEmail(req.body?.email);
    clearAttempts(loginAttempts, attemptKey('ip', clientKey(req)));
    if (email) clearAttempts(loginAttempts, attemptKey('email', email));
  }

  function registerRateLimit(req, res, next) {
    const key = attemptKey('ip', clientKey(req));
    const result = checkAttempts(registerAttempts, key, {
      windowMs: registerWindowMs,
      max: registerMax,
    });
    if (!result.ok) {
      res.setHeader('Retry-After', String(result.retryAfter));
      res.status(429).json({
        ok: false,
        error: 'Too many accounts created from here. Try again later.',
      });
      return;
    }
    bumpAttempts(registerAttempts, key);
    next();
  }

  async function handleLogin(req, res, next) {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password ?? '');
      if (!email || !password) {
        authError(res, 'Enter your email and password.');
        return;
      }

      const user = await users.verifyCredentials(email, password);
      if (!user) {
        recordFailedLogin(req);
        authError(res, 'Email or password is not correct.');
        return;
      }

      clearLoginAttempts(req);
      setSessionCookie(req, res, config, user);
      res.json({ ok: true, user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  }

  async function handleRegister(req, res, next) {
    try {
      const user = await users.createUser({
        name: req.body?.name,
        email: req.body?.email,
        password: req.body?.password,
        inviteCode: req.body?.inviteCode,
      });
      setSessionCookie(req, res, config, user);
      res.status(201).json({ ok: true, user: publicUser(user) });
    } catch (error) {
      if (error.status && error.code) {
        res.status(error.status).json({ ok: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  function handleLogout(req, res) {
    clearSessionCookie(req, res, config);
    res.json({ ok: true });
  }

  async function handleChangePassword(req, res, next) {
    try {
      const currentPassword = String(req.body?.currentPassword ?? '');
      const newPassword = String(req.body?.newPassword ?? '');
      const user = await users.changePassword({
        id: req.user.id,
        currentPassword,
        newPassword,
      });
      setSessionCookie(req, res, config, user);
      res.json({ ok: true, user: publicUser(user) });
    } catch (error) {
      if (error.status && error.code) {
        res.status(error.status).json({ ok: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );

    const connectSources = ["'self'"];
    if (config.publicApiUrl) {
      try {
        connectSources.push(new URL(config.publicApiUrl).origin);
      } catch {
        // Ignore a malformed optional URL.
      }
    }

    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data:",
        "font-src 'self'",
        `connect-src ${connectSources.join(' ')}`,
        "frame-src 'self' blob:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    );

    if (isSecureRequest(req, config)) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=15552000; includeSubDomains',
      );
    }
    next();
  }

  return {
    clearSessionCookie,
    createOriginGuard,
    handleChangePassword,
    handleLogin,
    handleLogout,
    handleRegister,
    loginRateLimit,
    publicUser,
    registerRateLimit,
    requireAdmin,
    requireAppIntent,
    requireAuth,
    requireProxySecret,
    securityHeaders,
    sessionMiddleware,
    uploadCors,
  };
}

export function createSlidingLimiter({ windowMs, max, message }) {
  const buckets = new Map();

  return {
    check(key) {
      const now = Date.now();
      const record = buckets.get(key);
      if (!record || now - record.startedAt > windowMs) {
        buckets.set(key, { startedAt: now, count: 1 });
        return { ok: true };
      }
      if (record.count >= max) {
        return {
          ok: false,
          retryAfter: Math.max(
            1,
            Math.ceil((record.startedAt + windowMs - now) / 1000),
          ),
          message,
        };
      }
      record.count += 1;
      return { ok: true };
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}
