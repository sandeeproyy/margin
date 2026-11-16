import { timingSafeEqualString } from './security.js';

/**
 * Shared print PIN gate.
 *
 * Account sign-in proves *who* someone is. The PIN proves the owner actually
 * handed them the code, so an invite that leaks, or a stray click on Print,
 * cannot move paper on its own.
 *
 * Unlocks live in memory, are bound to a single signed-in session, and expire.
 * A restart or a fresh sign-in asks for the PIN again, which is the behaviour
 * the owner expects from a shared secret.
 */
export function createPinGate({ config }) {
  const unlocks = new Map();
  const attempts = new Map();

  const FAIL_WINDOW_MS = 15 * 60 * 1000;
  const maxAttempts = config.pinAttemptsPerWindow;

  function unlockKey(req) {
    const nonce = req.session?.nonce;
    if (!req.user?.id || !nonce) return null;
    return `${req.user.id}:${nonce}`;
  }

  function attemptKey(req) {
    const cookieNonce = req.session?.nonce ?? 'anon';
    return `${req.user?.id ?? 'anon'}:${cookieNonce}`;
  }

  function unlockMs() {
    return config.printPinUnlockMinutes * 60 * 1000;
  }

  function prune() {
    const now = Date.now();
    for (const [key, record] of unlocks) {
      if (record.expiresAt <= now) unlocks.delete(key);
    }
    for (const [key, record] of attempts) {
      if (now - record.startedAt > FAIL_WINDOW_MS) attempts.delete(key);
    }
  }

  function remainingAttempts(req) {
    const record = attempts.get(attemptKey(req));
    if (!record) return maxAttempts;
    if (Date.now() - record.startedAt > FAIL_WINDOW_MS) return maxAttempts;
    return Math.max(0, maxAttempts - record.failures);
  }

  function recordFailure(req) {
    const key = attemptKey(req);
    const now = Date.now();
    const record = attempts.get(key);
    if (!record || now - record.startedAt > FAIL_WINDOW_MS) {
      attempts.set(key, { startedAt: now, failures: 1 });
      return;
    }
    record.failures += 1;
  }

  function clearFailures(req) {
    attempts.delete(attemptKey(req));
  }

  /** Current unlock state for the caller's session. */
  function status(req) {
    prune();
    const key = unlockKey(req);
    if (!key) return { required: true, unlocked: false, expiresAt: null };

    const record = unlocks.get(key);
    if (!record || record.expiresAt <= Date.now()) {
      unlocks.delete(key);
      return {
        required: true,
        unlocked: false,
        expiresAt: null,
        attemptsRemaining: remainingAttempts(req),
      };
    }
    return {
      required: true,
      unlocked: true,
      expiresAt: new Date(record.expiresAt).toISOString(),
      attemptsRemaining: remainingAttempts(req),
    };
  }

  function isUnlocked(req) {
    return status(req).unlocked;
  }

  /**
   * Verify a submitted PIN. Returns a plain result the route can translate
   * into a friendly message; the real code never leaves this module.
   */
  function verify(req, submitted) {
    prune();

    const key = unlockKey(req);
    if (!key) {
      return { ok: false, error: 'Please sign in again to continue.' };
    }

    if (remainingAttempts(req) <= 0) {
      return {
        ok: false,
        error: 'Too many incorrect codes. Wait a few minutes, then try again.',
        locked: true,
      };
    }

    const candidate = String(submitted ?? '').trim();
    if (!/^\d{4,12}$/.test(candidate)) {
      recordFailure(req);
      return { ok: false, error: 'That code is not correct.' };
    }

    if (!timingSafeEqualString(candidate, config.printPin)) {
      recordFailure(req);
      return {
        ok: false,
        error: 'That code is not correct.',
        attemptsRemaining: remainingAttempts(req),
      };
    }

    clearFailures(req);
    const expiresAt = Date.now() + unlockMs();
    unlocks.set(key, { verifiedAt: Date.now(), expiresAt });
    return {
      ok: true,
      expiresAt: new Date(expiresAt).toISOString(),
      status: status(req),
    };
  }

  function lock(req) {
    const key = unlockKey(req);
    if (key) unlocks.delete(key);
    clearFailures(req);
    return status(req);
  }

  return { isUnlocked, lock, status, verify };
}
