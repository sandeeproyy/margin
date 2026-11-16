import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;
const NAME_MAX = 80;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_GROUPS = 3;
const INVITE_GROUP_SIZE = 4;

function userError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function cleanName(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

function validateEmail(email) {
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw userError('Enter a valid email address.', 'EMAIL_INVALID');
  }
}

function validatePassword(password) {
  const value = String(password ?? '');
  if (value.length < PASSWORD_MIN) {
    throw userError(
      `Use at least ${PASSWORD_MIN} characters for your password.`,
      'PASSWORD_SHORT',
    );
  }
  if (value.length > PASSWORD_MAX) {
    throw userError('That password is too long.', 'PASSWORD_LONG');
  }
}

function normalizeInviteCode(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function inviteHash(secret, code) {
  return crypto
    .createHmac('sha256', secret)
    .update(`invite:${normalizeInviteCode(code)}`)
    .digest('base64url');
}

function generateInviteCode() {
  const groups = [];
  for (let group = 0; group < INVITE_GROUPS; group += 1) {
    let part = '';
    for (let index = 0; index < INVITE_GROUP_SIZE; index += 1) {
      part += INVITE_ALPHABET[crypto.randomInt(0, INVITE_ALPHABET.length)];
    }
    groups.push(part);
  }
  return groups.join('-');
}

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  for (let index = 0; index < 14; index += 1) {
    password += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return password;
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    'scrypt',
    '16384',
    '8',
    '1',
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!N || !r || !p) return false;

  try {
    const salt = Buffer.from(saltRaw, 'base64url');
    const expected = Buffer.from(hashRaw, 'base64url');
    const derived = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: Math.max(64 * 1024 * 1024, 128 * N * r * 2),
    });
    return (
      derived.length === expected.length &&
      crypto.timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

function publicUser(user) {
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

function publicInvite(invite) {
  return {
    id: invite.id,
    note: invite.note ?? '',
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    usedAt: invite.usedAt ?? null,
    usedBy: invite.usedBy ?? null,
  };
}

function isExpired(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

export function createUserStore({
  filePath,
  secret,
  admin,
  initialPasswordPath,
  openSignup = false,
}) {
  let users = [];
  let invites = [];
  let loaded = false;
  let loadingPromise = null;
  let writeChain = Promise.resolve();
  let bootstrap = null;

  async function persist() {
    const payload = `${JSON.stringify(
      { version: 2, users, invites },
      null,
      2,
    )}\n`;
    const temporary = `${filePath}.tmp`;
    const write = writeChain.then(async () => {
      await fsp.writeFile(temporary, payload, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fsp.rename(temporary, filePath);
    });
    writeChain = write.catch(() => {});
    await write;
  }

  async function createBootstrapAdmin() {
    const email = normalizeEmail(admin?.email);
    const displayName = cleanName(admin?.name) || 'Owner';
    const password =
      String(admin?.password ?? '').trim() ||
      String(admin?.generatedPassword ?? '').trim();

    if (!EMAIL_PATTERN.test(email) || !password) return null;

    const now = new Date().toISOString();
    const user = {
      id: makeId('usr'),
      name: displayName,
      email,
      passwordHash: await hashPassword(password),
      role: 'admin',
      status: 'active',
      createdAt: now,
      lastLoginAt: null,
      sessionVersion: 1,
    };
    users.push(user);

    const generated = !String(admin?.password ?? '').trim();
    if (generated && initialPasswordPath) {
      const note = [
        'Margin initial administrator access',
        '',
        `Email:    ${email}`,
        `Password: ${password}`,
        '',
        'Sign in at the Margin site and change this password from Account.',
        'Keep this file private, then delete it after saving the password.',
        '',
        `Created: ${now}`,
        '',
      ].join('\n');
      await fsp.writeFile(initialPasswordPath, note, {
        encoding: 'utf8',
        mode: 0o600,
      });
    }

    bootstrap = {
      email,
      generated,
      passwordPath: generated ? initialPasswordPath : null,
    };
    return user;
  }

  async function load() {
    if (loaded) return;
    if (loadingPromise) {
      await loadingPromise;
      return;
    }

    loadingPromise = (async () => {
      try {
        const raw = await fsp.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          users = parsed;
        } else if (parsed && Array.isArray(parsed.users)) {
          users = parsed.users;
          invites = Array.isArray(parsed.invites) ? parsed.invites : [];
        }
      } catch {
        users = [];
        invites = [];
      }

      users = users.filter((user) => user && typeof user === 'object');
      for (const user of users) {
        user.name = cleanName(user.name) || 'Member';
        user.email = normalizeEmail(user.email);
        user.role = user.role === 'admin' ? 'admin' : 'member';
        user.status = user.status === 'disabled' ? 'disabled' : 'active';
        user.sessionVersion = Number(user.sessionVersion) || 1;
        if (!user.createdAt) user.createdAt = new Date().toISOString();
      }
      invites = invites.filter((invite) => invite && typeof invite === 'object');

      if (users.length === 0) {
        const created = await createBootstrapAdmin();
        if (created) await persist();
      } else {
        const activeAdmins = users.filter(
          (user) => user.role === 'admin' && user.status === 'active',
        );
        if (activeAdmins.length === 0) {
          const candidate = users.find((user) => user.status === 'active');
          if (candidate) {
            candidate.role = 'admin';
            candidate.sessionVersion += 1;
          }
        }
        await persist();
      }

      loaded = true;
    })().finally(() => {
      loadingPromise = null;
    });

    await loadingPromise;
  }

  async function findById(id) {
    await load();
    return users.find((user) => user.id === id) ?? null;
  }

  async function findByEmail(email) {
    await load();
    const normalized = normalizeEmail(email);
    return users.find((user) => user.email === normalized) ?? null;
  }

  async function verifyCredentials(email, password) {
    await load();
    const user = await findByEmail(email);
    if (!user || user.status !== 'active') return null;
    const valid = await verifyPassword(String(password ?? ''), user.passwordHash);
    if (!valid) return null;
    user.lastLoginAt = new Date().toISOString();
    await persist();
    return user;
  }

  async function createUser({ name, email, password, inviteCode, role = 'member' }) {
    await load();
    const displayName = cleanName(name);
    const normalizedEmail = normalizeEmail(email);

    if (!displayName) {
      throw userError('Enter your name.', 'NAME_REQUIRED');
    }
    validateEmail(normalizedEmail);
    validatePassword(password);

    if (users.some((user) => user.email === normalizedEmail)) {
      throw userError(
        'An account with that email already exists.',
        'EMAIL_TAKEN',
        409,
      );
    }

    let usedInvite = null;
    if (!openSignup) {
      const code = normalizeInviteCode(inviteCode);
      if (!code) {
        throw userError(
          'Enter the invitation code you were given.',
          'INVITE_REQUIRED',
        );
      }
      const hashed = inviteHash(secret, code);
      usedInvite = invites.find(
        (invite) =>
          invite.codeHash === hashed &&
          !invite.usedAt &&
          !isExpired(invite.expiresAt),
      );
      if (!usedInvite) {
        throw userError(
          'That invitation code is not valid or has expired.',
          'INVITE_INVALID',
        );
      }
    }

    const now = new Date().toISOString();
    const user = {
      id: makeId('usr'),
      name: displayName,
      email: normalizedEmail,
      passwordHash: await hashPassword(String(password)),
      role: role === 'admin' ? 'admin' : 'member',
      status: 'active',
      createdAt: now,
      lastLoginAt: now,
      sessionVersion: 1,
    };

    if (usedInvite) {
      usedInvite.usedAt = now;
      usedInvite.usedBy = user.id;
    }

    users.push(user);
    await persist();
    return user;
  }

  async function listUsers() {
    await load();
    return users
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(publicUser);
  }

  async function createInvite({ createdBy, note = '', expiresInDays = 14 }) {
    await load();
    const days = Math.min(Math.max(Number(expiresInDays) || 14, 1), 30);
    const safeNote = String(note ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 80);

    let code = '';
    let hashed = '';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      code = generateInviteCode();
      hashed = inviteHash(secret, code);
      if (!invites.some((invite) => invite.codeHash === hashed)) break;
    }

    const now = new Date();
    const invite = {
      id: makeId('inv'),
      codeHash: hashed,
      note: safeNote,
      createdBy,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + days * 24 * 60 * 60 * 1000,
      ).toISOString(),
      usedAt: null,
      usedBy: null,
    };
    invites.unshift(invite);
    invites = invites.slice(0, 200);
    await persist();
    return { invite: publicInvite(invite), code };
  }

  async function listInvites() {
    await load();
    return invites
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 40)
      .map(publicInvite);
  }

  async function revokeInvite(id) {
    await load();
    const before = invites.length;
    invites = invites.filter((invite) => invite.id !== id || invite.usedAt);
    if (invites.length === before) {
      throw userError('That invitation is no longer available.', 'INVITE_MISSING', 404);
    }
    await persist();
    return true;
  }

  async function setUserStatus({ id, status, actorId }) {
    await load();
    const user = users.find((item) => item.id === id);
    if (!user) {
      throw userError('That account was not found.', 'USER_MISSING', 404);
    }
    if (user.id === actorId) {
      throw userError(
        'You cannot disable the account you are using.',
        'SELF_DISABLE',
      );
    }
    if (!['active', 'disabled'].includes(status)) {
      throw userError('That account state is not supported.', 'STATUS_INVALID');
    }
    if (status === 'disabled' && user.role === 'admin') {
      const otherAdmins = users.filter(
        (item) =>
          item.id !== user.id &&
          item.role === 'admin' &&
          item.status === 'active',
      );
      if (otherAdmins.length === 0) {
        throw userError(
          'Keep at least one active administrator.',
          'LAST_ADMIN',
        );
      }
    }

    user.status = status;
    user.sessionVersion += 1;
    await persist();
    return publicUser(user);
  }

  async function resetUserPassword({ id, actorId }) {
    await load();
    const user = users.find((item) => item.id === id);
    if (!user) {
      throw userError('That account was not found.', 'USER_MISSING', 404);
    }
    if (user.id === actorId) {
      throw userError(
        'Change your own password from your account.',
        'SELF_RESET',
      );
    }
    const temporaryPassword = generatePassword();
    user.passwordHash = await hashPassword(temporaryPassword);
    user.sessionVersion += 1;
    await persist();
    return { password: temporaryPassword, user: publicUser(user) };
  }

  async function changePassword({ id, currentPassword, newPassword }) {
    await load();
    const user = users.find((item) => item.id === id);
    if (!user) {
      throw userError('That account was not found.', 'USER_MISSING', 404);
    }
    const valid = await verifyPassword(
      String(currentPassword ?? ''),
      user.passwordHash,
    );
    if (!valid) {
      throw userError(
        'Your current password is not correct.',
        'PASSWORD_WRONG',
      );
    }
    validatePassword(newPassword);
    user.passwordHash = await hashPassword(String(newPassword));
    user.sessionVersion += 1;
    await persist();
    return user;
  }

  async function countUsers() {
    await load();
    return users.length;
  }

  function getBootstrap() {
    return bootstrap;
  }

  return {
    changePassword,
    countUsers,
    createInvite,
    createUser,
    findByEmail,
    findById,
    getBootstrap,
    listInvites,
    listUsers,
    publicUser,
    resetUserPassword,
    revokeInvite,
    setUserStatus,
    verifyCredentials,
  };
}
