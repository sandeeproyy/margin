import compression from 'compression';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import express from 'express';
import qrcode from 'qrcode-terminal';
import { loadConfig } from './config.js';
import {
  analyzeBlankPages,
  createThumbnail,
  displayNameFor,
  kindForExtension,
  parsePageRange,
  prepareDocument,
  renderPagePreview,
} from './documents.js';
import { createHistoryService } from './history.js';
import {
  createPrinterSelectionStore,
  createPrinterService,
  pickActivePrinter,
  toClientPrinter,
  toPublicPrinters,
  validateAndNormalizeSettings,
} from './printers.js';
import { createPrintService } from './print-service.js';
import {
  createSecurity,
  createSlidingLimiter,
  timingSafeEqualString,
} from './security.js';
import { createUserStore } from './users.js';

const config = await loadConfig();
const users = createUserStore({
  filePath: config.usersPath,
  secret: config.sessionSecret,
  admin: config.admin,
  initialPasswordPath: config.adminInitialPasswordPath,
  openSignup: config.openSignup,
});
await users.countUsers();

const security = createSecurity({ config, users });
const printerService = createPrinterService(config);
const printerSelection = createPrinterSelectionStore(config);
const history = createHistoryService({
  filePath: config.historyPath,
  maxEntries: config.maxHistory,
});
const printService = createPrintService({ config, history });

const uploadLimiter = createSlidingLimiter({
  windowMs: 60 * 60 * 1000,
  max: config.uploadsPerHour,
  message: 'You have uploaded a lot in the last hour. Try again a little later.',
});
const printLimiter = createSlidingLimiter({
  windowMs: 60 * 60 * 1000,
  max: config.printsPerHour,
  message: 'You have sent a lot of jobs in the last hour. Try again a little later.',
});
const pinLimiter = createSlidingLimiter({
  windowMs: 15 * 60 * 1000,
  max: config.pinAttemptsPerWindow,
  message: 'Too many PIN attempts. Wait a few minutes, then try again.',
});

// Map of userId -> { verifiedAt: timestamp }
const pinSessions = new Map();

function isPinVerified(userId) {
  const session = pinSessions.get(userId);
  if (!session) return false;
  const elapsed = Date.now() - session.verifiedAt;
  return elapsed < config.printPinUnlockMinutes * 60 * 1000;
}

const uploadSessions = new Map();
const prepareQueue = [];
const PREPARE_CONCURRENCY = 2;
let prepareRunning = 0;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(security.securityHeaders);
app.use(security.requireProxySecret);
app.use(security.createOriginGuard());
app.use(compression());
app.use(security.sessionMiddleware);
app.use(express.json({ limit: '32kb' }));

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

async function quotaForUser(user) {
  const since = startOfToday().toISOString();
  const usedPages = await history.pagesSince(user.id, since);
  return {
    dailyPages: config.dailyPages,
    usedPages,
    remainingPages: Math.max(0, config.dailyPages - usedPages),
  };
}

function publicJob(job) {
  return {
    id: job.id,
    name: job.originalName,
    kind: job.kind,
    size: job.size,
    pages: job.info?.pageCount ?? null,
    firstPageLandscape: job.info?.firstPageLandscape ?? null,
    pageSizes: job.info?.pageSizes ?? null,
    blankPages: Array.isArray(job.blankPages) ? job.blankPages : [],
    sampledPages: Array.isArray(job.sampledPages) ? job.sampledPages : [],
    thumbUrl:
      job.thumbPath && fs.existsSync(job.thumbPath)
        ? `/api/jobs/${job.id}/thumb`
        : null,
    createdAt: job.createdAt,
    status: job.status,
    progress: job.progress ?? 0,
    message: job.message ?? '',
    error: job.error ?? null,
  };
}

function sendJobStatus(res, job) {
  res.json({
    ok: true,
    job: {
      ...publicJob(job),
      ...printService.publicStatus(job),
      thumbUrl:
        job.thumbPath && fs.existsSync(job.thumbPath)
          ? `/api/jobs/${job.id}/thumb`
          : null,
    },
  });
}

function ownedJob(req, res) {
  const job = printService.getJob(req.params.id);
  if (!job || job.userId !== req.user.id) {
    res.status(404).json({ ok: false, error: 'That job is no longer available.' });
    return null;
  }
  return job;
}

function friendlyPrepareError(message) {
  const text = String(message ?? '').trim();
  if (!text) {
    return 'That document could not be prepared. Try exporting it as a PDF first.';
  }
  if (/[\\/]/.test(text) || text.length > 220) {
    return 'That document could not be prepared. Try exporting it as a PDF first.';
  }
  if (
    /(document|file|pdf|image|page|office|paper|text|empty|password|large|limit|prepare|export|read|valid|support)/i.test(
      text,
    )
  ) {
    return text;
  }
  return 'That document could not be prepared. Try exporting it as a PDF first.';
}

function createJobRecord({
  userId,
  id,
  directory,
  originalName,
  extension,
  size,
}) {
  return {
    id,
    userId,
    directory,
    pdfPath: path.join(directory, 'document.pdf'),
    thumbPath: path.join(directory, 'thumb.webp'),
    originalName,
    extension,
    kind: kindForExtension(extension),
    size,
    createdAt: new Date().toISOString(),
    info: null,
    blankPages: [],
    sampledPages: [],
    status: 'processing',
    progress: 0,
    stage: 'processing',
    message: 'Preparing your document',
    error: null,
    warnings: [],
    print: null,
  };
}

async function prepareJob(job) {
  const workspace = path.join(job.directory, 'source');
  const originalPath = path.join(workspace, `original${job.extension}`);
  try {
    printService.updateJob(job, {
      status: 'processing',
      progress: 8,
      stage: 'processing',
      message: 'Preparing your document',
    });

    const info = await prepareDocument({
      inputPath: originalPath,
      extension: job.extension,
      outputPdfPath: job.pdfPath,
      config,
      originalName: job.originalName,
    });
    await createThumbnail({ pdfPath: job.pdfPath, outputPath: job.thumbPath });

    let blanks = { blankPages: [], sampledPages: [] };
    try {
      blanks = await analyzeBlankPages({
        pdfPath: job.pdfPath,
        pageCount: info.pageCount,
      });
    } catch (error) {
      console.warn('[prepare] Blank-page check skipped:', error.message);
    }

    await fsp.rm(workspace, { recursive: true, force: true }).catch(() => {});
    printService.updateJob(job, {
      info,
      blankPages: blanks.blankPages,
      sampledPages: blanks.sampledPages,
      status: 'ready',
      progress: 100,
      stage: 'ready',
      message: 'Ready to print',
      preparedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[prepare]', error.message);
    await fsp.rm(job.directory, { recursive: true, force: true }).catch(() => {});
    printService.updateJob(job, {
      status: 'error',
      progress: 100,
      stage: 'error',
      message: 'That document could not be prepared',
      error: friendlyPrepareError(error.message),
    });
  }
}

function runPrepareQueue() {
  while (prepareRunning < PREPARE_CONCURRENCY && prepareQueue.length > 0) {
    const job = prepareQueue.shift();
    prepareRunning += 1;
    prepareJob(job).finally(() => {
      prepareRunning -= 1;
      runPrepareQueue();
    });
  }
}

function enqueuePrepare(job) {
  prepareQueue.push(job);
  runPrepareQueue();
}

/* ------------------------------------------------------------------ */
/* Health + authentication                                             */
/* ------------------------------------------------------------------ */

app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});

app.get('/api/auth', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    authenticated: Boolean(req.user),
    user: security.publicUser(req.user),
    app: {
      name: 'Margin',
      maxUploadMb: config.maxUploadMb,
      openSignup: config.openSignup,
    },
  });
});

app.post(
  '/api/auth/login',
  security.requireAppIntent,
  security.loginRateLimit,
  security.handleLogin,
);

app.post(
  '/api/auth/register',
  security.requireAppIntent,
  security.registerRateLimit,
  security.handleRegister,
);

app.post('/api/auth/logout', security.requireAppIntent, security.handleLogout);

/* ------------------------------------------------------------------ */
/* Direct upload (bypasses the public edge for the file body)          */
/* ------------------------------------------------------------------ */

app.options('/api/uploads/:id', security.uploadCors);

app.put('/api/uploads/:id', security.uploadCors, async (req, res, next) => {
  const session = uploadSessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ ok: false, error: 'That upload is no longer available.' });
    return;
  }
  if (session.used || Date.now() > session.expiresAt) {
    uploadSessions.delete(session.id);
    res.status(410).json({ ok: false, error: 'That upload expired. Choose the file again.' });
    return;
  }

  const token = req.get('x-upload-token') ?? '';
  if (!timingSafeEqualString(token, session.token)) {
    res.status(403).json({ ok: false, error: 'That upload was not accepted.' });
    return;
  }

  const user = await users.findById(session.userId);
  if (!user || user.status !== 'active') {
    uploadSessions.delete(session.id);
    res.status(401).json({ ok: false, error: 'Please sign in to continue.' });
    return;
  }

  const declaredLength = Number(req.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > config.maxUploadBytes) {
    res.status(413).json({
      ok: false,
      error: `That file is larger than ${config.maxUploadMb} MB.`,
    });
    return;
  }

  session.used = true;
  uploadSessions.delete(session.id);

  const id = crypto.randomUUID();
  const jobDirectory = path.join(config.uploadsDir, user.id, id);
  const workspace = path.join(jobDirectory, 'source');
  const sourcePath = path.join(workspace, `original${session.extension}`);
  const tempPath = path.join(config.tempDir, `upload-${id}-${crypto.randomUUID()}`);

  await fsp.mkdir(workspace, { recursive: true });

  let received = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > config.maxUploadBytes) {
        const error = new Error('TOO_LARGE');
        error.code = 'UPLOAD_TOO_LARGE';
        callback(error);
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      req,
      limiter,
      fs.createWriteStream(tempPath, { mode: 0o600 }),
    );
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    await fsp.rm(jobDirectory, { recursive: true, force: true }).catch(() => {});
    if (error.code === 'UPLOAD_TOO_LARGE') {
      res.status(413).json({
        ok: false,
        error: `That file is larger than ${config.maxUploadMb} MB.`,
      });
      return;
    }
    next(error);
    return;
  }

  if (received === 0) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    await fsp.rm(jobDirectory, { recursive: true, force: true }).catch(() => {});
    res.status(400).json({ ok: false, error: 'That file looks empty.' });
    return;
  }

  try {
    await fsp.rename(tempPath, sourcePath);
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    await fsp.rm(jobDirectory, { recursive: true, force: true }).catch(() => {});
    next(error);
    return;
  }

  const job = createJobRecord({
    userId: user.id,
    id,
    directory: jobDirectory,
    originalName: session.name,
    extension: session.extension,
    size: received,
  });
  printService.registerJob(job);
  enqueuePrepare(job);

  res.status(202).json({ ok: true, job: publicJob(job) });
});

/* ------------------------------------------------------------------ */
/* Authenticated API                                                   */
/* ------------------------------------------------------------------ */

app.use('/api', security.requireAuth);

app.get('/api/bootstrap', async (req, res, next) => {
  try {
    const [printerData, recent, quota, selection] = await Promise.all([
      printerService.get(),
      history.listForUser(req.user.id),
      quotaForUser(req.user),
      printerSelection.get(),
    ]);

    let printers;
    let defaultPrinterId;

    if (req.user.role === 'admin') {
      printers = toPublicPrinters(printerData.printers ?? []);
      const active = pickActivePrinter(printerData.printers ?? [], selection);
      defaultPrinterId = active.printer
        ? printers.find((p) => p.id === active.printer.id)?.id ?? printers[0]?.id ?? null
        : printers[0]?.id ?? null;
    } else {
      const active = pickActivePrinter(printerData.printers ?? [], selection);
      printers = active.printer ? [toClientPrinter(active.printer)] : [];
      defaultPrinterId = printers[0]?.id ?? null;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      account: security.publicUser(req.user),
      app: {
        name: 'Margin',
        version: '2.0.0',
        maxUploadMb: config.maxUploadMb,
        acceptedExtensions: [...config.allowedExtensions],
        openSignup: config.openSignup,
      },
      printers,
      defaultPrinterId,
      printerAvailable: printers.some((printer) => printer.online),
      history: recent,
      quota,
      pinVerified: isPinVerified(req.user.id),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/printers', async (req, res, next) => {
  try {
    const force = req.query.refresh === '1';
    const [data, selection] = await Promise.all([
      force ? printerService.refresh() : printerService.get(),
      printerSelection.get(),
    ]);

    let printers;
    if (req.user.role === 'admin') {
      printers = toPublicPrinters(data.printers ?? []);
    } else {
      const active = pickActivePrinter(data.printers ?? [], selection);
      printers = active.printer ? [toClientPrinter(active.printer)] : [];
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      printers,
      printerAvailable: printers.some((printer) => printer.online),
      message:
        printers.length === 0
          ? 'The printer could not be reached. Check that it is switched on and connected.'
          : null,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/uploads/prepare', security.requireAppIntent, async (req, res, next) => {
  try {
    const originalName = displayNameFor(req.body?.name);
    const extension = path.extname(originalName).toLowerCase();
    const size = Number(req.body?.size);

    if (!config.allowedExtensions.has(extension)) {
      res.status(400).json({
        ok: false,
        error: 'That file type is not supported. Try a PDF, image, Word, Excel, or PowerPoint file.',
      });
      return;
    }
    if (!Number.isFinite(size) || size <= 0) {
      res.status(400).json({ ok: false, error: 'That file looks empty.' });
      return;
    }
    if (size > config.maxUploadBytes) {
      res.status(413).json({
        ok: false,
        error: `That file is larger than ${config.maxUploadMb} MB.`,
      });
      return;
    }

    const rate = uploadLimiter.check(req.user.id);
    if (!rate.ok) {
      res.status(429).json({ ok: false, error: rate.message });
      return;
    }

    const activeForUser = printService
      .listJobs()
      .filter(
        (job) =>
          job.userId === req.user.id &&
          ['processing', 'queued', 'preparing', 'sending'].includes(job.status),
      ).length;
    if (activeForUser >= config.maxActiveJobsPerUser) {
      res.status(429).json({
        ok: false,
        error:
          'You already have a few documents in the print room. Wait for those to finish, then try again.',
      });
      return;
    }

    const session = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(32).toString('base64url'),
      userId: req.user.id,
      name: originalName,
      extension,
      size,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
      used: false,
    };
    uploadSessions.set(session.id, session);

    const uploadUrl = config.publicApiUrl
      ? `${config.publicApiUrl}/api/uploads/${session.id}`
      : `/api/uploads/${session.id}`;

    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({
      ok: true,
      upload: {
        id: session.id,
        url: uploadUrl,
        token: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs/:id/thumb', (req, res) => {
  const job = ownedJob(req, res);
  if (!job) return;
  if (!job.thumbPath || !fs.existsSync(job.thumbPath)) {
    res.status(404).json({ ok: false, error: 'Preview not found.' });
    return;
  }
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.sendFile(job.thumbPath);
});

app.get('/api/jobs/:id/preview/:page', async (req, res, next) => {
  try {
    const job = ownedJob(req, res);
    if (!job) return;
    if (job.status === 'processing' || !job.info) {
      res.status(409).json({ ok: false, error: 'That document is still being prepared.' });
      return;
    }

    const pageNumber = Number(req.params.page);
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > job.info.pageCount
    ) {
      res.status(400).json({ ok: false, error: 'That page is not in this document.' });
      return;
    }

    const previewPath = path.join(job.directory, `preview-${pageNumber}.webp`);
    if (!fs.existsSync(previewPath)) {
      await renderPagePreview({
        pdfPath: job.pdfPath,
        pageNumber,
        outputPath: previewPath,
      });
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(previewPath);
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs/:id', (req, res) => {
  const job = ownedJob(req, res);
  if (!job) return;
  res.setHeader('Cache-Control', 'no-store');
  sendJobStatus(res, job);
});

app.post('/api/jobs/:id/print', security.requireAppIntent, async (req, res, next) => {
  try {
    const job = ownedJob(req, res);
    if (!job) return;

    if (!isPinVerified(req.user.id)) {
      res.status(403).json({
        ok: false,
        error: 'Enter the print room PIN before sending a job.',
        code: 'PIN_REQUIRED',
      });
      return;
    }

    if (!config.isWindows) {
      res.status(503).json({
        ok: false,
        error: 'Automatic printing is not available right now.',
      });
      return;
    }

    const selection = await printerSelection.get();
    const printerData = await printerService.get();
    const active = pickActivePrinter(printerData.printers ?? [], selection);
    const printer = active.printer;
    if (!printer) {
      res.status(409).json({
        ok: false,
        error:
          'The printer is not available right now. Check that it is switched on and connected.',
      });
      return;
    }

    const normalized = validateAndNormalizeSettings(printer, req.body ?? {});
    if (!normalized.ok) {
      res.status(400).json({ ok: false, error: normalized.error });
      return;
    }

    const rate = printLimiter.check(req.user.id);
    if (!rate.ok) {
      res.status(429).json({ ok: false, error: rate.message });
      return;
    }

    if (printService.countActiveForUser(req.user.id) >= config.maxActiveJobsPerUser) {
      res.status(429).json({
        ok: false,
        error:
          'You already have a few jobs in the printer queue. Wait for those to finish, then try again.',
      });
      return;
    }
    if (printService.countActiveGlobal() >= config.maxActiveJobsGlobal) {
      res.status(429).json({
        ok: false,
        error: 'The print room is busy right now. Try again in a moment.',
      });
      return;
    }

    const quota = await quotaForUser(req.user);
    const since = startOfToday().toISOString();
    const globalUsed = await history.globalPagesSince(since);

    const estimateRange = parsePageRange(
      req.body?.pageRange ?? 'all',
      job.info?.pageCount ?? 0,
    );
    if (!estimateRange.ok) {
      res.status(400).json({ ok: false, error: estimateRange.error });
      return;
    }
    const estimate = estimateRange.indices.length * normalized.settings.copies;

    if (quota.usedPages + estimate > quota.dailyPages) {
      res.status(429).json({
        ok: false,
        error:
          quota.remainingPages > 0
            ? `That would go over today's limit. You have ${quota.remainingPages} page${quota.remainingPages === 1 ? '' : 's'} left today.`
            : "You have reached today's print limit. Try again tomorrow.",
      });
      return;
    }
    if (globalUsed + estimate > config.globalDailyPages) {
      res.status(429).json({
        ok: false,
        error: 'The print room has reached its limit for today. Try again tomorrow.',
      });
      return;
    }

    const accepted = printService.accept(
      job,
      printer,
      normalized.settings,
      req.body?.pageRange ?? 'all',
    );
    if (!accepted.ok) {
      res.status(accepted.status || 400).json({ ok: false, error: accepted.error });
      return;
    }

    res.status(202).json({ ok: true, job: printService.publicStatus(job) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/history', async (req, res, next) => {
  try {
    const recent = await history.listForUser(req.user.id);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, history: recent });
  } catch (error) {
    next(error);
  }
});

app.get('/api/account', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      account: security.publicUser(req.user),
      quota: await quotaForUser(req.user),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/account/password', security.requireAppIntent, security.handleChangePassword);

/* ------------------------------------------------------------------ */
/* Print PIN gate                                                      */
/* ------------------------------------------------------------------ */

app.get('/api/pin/status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    verified: isPinVerified(req.user.id),
    unlockMinutes: config.printPinUnlockMinutes,
  });
});

app.post('/api/pin/verify', security.requireAppIntent, (req, res) => {
  const pin = String(req.body?.pin ?? '').trim();
  if (!pin) {
    res.status(400).json({ ok: false, error: 'Enter the print PIN.' });
    return;
  }

  const rate = pinLimiter.check(req.user.id);
  if (!rate.ok) {
    res.status(429).json({ ok: false, error: rate.message });
    return;
  }

  if (!timingSafeEqualString(pin, config.printPin)) {
    res.status(403).json({
      ok: false,
      error: 'That PIN is not correct. Ask the print room owner for the right one.',
    });
    return;
  }

  pinLimiter.reset(req.user.id);
  pinSessions.set(req.user.id, { verifiedAt: Date.now() });
  res.json({ ok: true, verified: true });
});

/* ------------------------------------------------------------------ */
/* Administrator (accounts only, never other people's documents)       */
/* ------------------------------------------------------------------ */

app.get('/api/admin/overview', security.requireAdmin, async (req, res, next) => {
  try {
    const [people, invites] = await Promise.all([
      users.listUsers(),
      users.listInvites(),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      users: people,
      invites,
      limits: {
        dailyPages: config.dailyPages,
        maxActiveJobsPerUser: config.maxActiveJobsPerUser,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/invites', security.requireAdmin, async (req, res, next) => {
  try {
    const result = await users.createInvite({
      createdBy: req.user.id,
      note: req.body?.note,
      expiresInDays: req.body?.expiresInDays,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/invites/:id', security.requireAdmin, async (req, res, next) => {
  try {
    await users.revokeInvite(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    if (error.status && error.code) {
      res.status(error.status).json({ ok: false, error: error.message });
      return;
    }
    next(error);
  }
});

app.patch('/api/admin/users/:id', security.requireAdmin, async (req, res, next) => {
  try {
    const user = await users.setUserStatus({
      id: req.params.id,
      status: req.body?.status,
      actorId: req.user.id,
    });
    res.json({ ok: true, user });
  } catch (error) {
    if (error.status && error.code) {
      res.status(error.status).json({ ok: false, error: error.message });
      return;
    }
    next(error);
  }
});

app.post(
  '/api/admin/users/:id/reset',
  security.requireAdmin,
  async (req, res, next) => {
    try {
      const result = await users.resetUserPassword({
        id: req.params.id,
        actorId: req.user.id,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, ...result });
    } catch (error) {
      if (error.status && error.code) {
        res.status(error.status).json({ ok: false, error: error.message });
        return;
      }
      next(error);
    }
  },
);

app.get(
  '/api/admin/printers',
  security.requireAdmin,
  async (req, res, next) => {
    try {
      const force = req.query.refresh === '1';
      const [data, selection] = await Promise.all([
        force ? printerService.refresh() : printerService.get(),
        printerSelection.get(),
      ]);
      const printers = (data.printers ?? []).map((printer) => ({
        id: printer.id,
        name: printer.name,
        port: printer.port,
        transport: printer.transport,
        online: printer.online,
        busy: printer.busy,
        isDefault: Boolean(printer.isDefault),
        supportsColor: Boolean(printer.supportsColor),
        supportsDuplex: Boolean(printer.supportsDuplex),
      }));

      const selectedId = selection.printerName
        ? printers.find((p) => p.name === selection.printerName)?.id ?? null
        : null;

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        printers,
        selectedId,
        selectionMissing:
          Boolean(selection.printerName) &&
          !printers.some((p) => p.name === selection.printerName),
        selectedName: selection.printerName ?? null,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  '/api/admin/printers/select',
  security.requireAdmin,
  security.requireAppIntent,
  async (req, res, next) => {
    try {
      const printerId = String(req.body?.printerId ?? '').trim();
      if (!printerId) {
        await printerSelection.clear(req.user.id);
        res.json({ ok: true, cleared: true });
        return;
      }

      const data = await printerService.get(true);
      const match = (data.printers ?? []).find((p) => p.id === printerId);
      if (!match) {
        res.status(404).json({
          ok: false,
          error: 'That printer was not found. Refresh the list and try again.',
        });
        return;
      }

      await printerSelection.set(match.name, req.user.id);
      console.log(`[admin] Printer selected: ${match.name} by ${req.user.email}`);
      res.json({ ok: true, printerName: match.name });
    } catch (error) {
      next(error);
    }
  },
);

/* ------------------------------------------------------------------ */
/* Static interface                                                    */
/* ------------------------------------------------------------------ */

app.use(
  express.static(config.publicDir, {
    index: false,
    etag: true,
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (/fonts|icons/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      if (/\.(html|css|js|webmanifest)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  }),
);

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(config.publicDir, 'index.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ ok: false, error: 'Not found.' });
    return;
  }
  res.status(404).type('text').send('Not found');
});

app.use((error, req, res, next) => {
  console.error('[server]', error.message);
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error.type === 'entity.too.large') {
    res.status(413).json({ ok: false, error: 'That request was too large.' });
    return;
  }
  res.status(500).json({
    ok: false,
    error: 'Something went wrong. Try again.',
  });
});

/* ------------------------------------------------------------------ */
/* Cleanup                                                             */
/* ------------------------------------------------------------------ */

async function cleanupExpired() {
  const now = Date.now();
  for (const job of printService.listJobs()) {
    if (job.filesRemoved) continue;
    if (['processing', 'queued', 'preparing', 'sending'].includes(job.status)) {
      continue;
    }
    const age = now - new Date(job.createdAt).getTime();
    if (age > config.fileTtlMs) {
      await printService.removeFiles(job);
    }
  }

  for (const [id, session] of uploadSessions) {
    if (session.used || now > session.expiresAt) uploadSessions.delete(id);
  }

  try {
    const entries = await fsp.readdir(config.tempDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(config.tempDir, entry.name);
      try {
        const info = await fsp.stat(fullPath);
        if (now - info.mtimeMs > 6 * 60 * 60 * 1000) {
          await fsp.rm(fullPath, { recursive: true, force: true });
        }
      } catch {
        // Ignore files that disappear while cleaning.
      }
    }
  } catch {
    // The temp directory is optional.
  }
}

const server = app.listen(config.port, config.host, () => {
  console.log('');
  console.log('  m a r g i n');
  console.log('  print room, online.');
  console.log('');
  console.log(`  Local   ${config.localUrl}`);
  console.log(`  Mobile  ${config.lanUrl}`);
  for (const url of config.lanUrls.slice(1)) {
    console.log(`  Other   ${url}`);
  }
  if (config.publicUrl) {
    console.log(`  Public  ${config.publicUrl}`);
  }
  console.log('');
  console.log(
    `  Printer ${config.isWindows ? 'checking the USB connection...' : 'requires Windows'}`,
  );

  const bootstrap = users.getBootstrap();
  if (bootstrap) {
    console.log(`  Admin   ${bootstrap.email}`);
    if (bootstrap.passwordPath) {
      console.log(`  Password saved once in ${bootstrap.passwordPath}`);
      console.log('  Sign in, change it from Account, then delete that file.');
    } else {
      console.log('  Password comes from MARGIN_ADMIN_PASSWORD.');
    }
  }
  console.log('');

  if (config.publicOrigin) {
    console.log(`  Interface ${config.publicOrigin}`);
  }
  if (config.publicApiUrl) {
    console.log(`  Tunnel   ${config.publicApiUrl}`);
  }
  if (!config.proxySecret) {
    console.log('  Tip      Set MARGIN_PROXY_SECRET before exposing the tunnel.');
  }
  console.log('');

  if (config.host === '0.0.0.0' || config.host === '::') {
    qrcode.generate(config.lanUrl, { small: true }, (code) => {
      console.log(code);
      console.log('  Scan to open Margin on your phone (same network).');
      console.log('');
    });
  }

  printerService.get(true).then((data) => {
    if (!data.ok) {
      console.warn(`[printer] ${data.error}`);
      return;
    }
    const names = data.printers.map((printer) => printer.name).join(', ');
    console.log(`[printer] ${data.printers.length} ready: ${names || 'none found'}`);
  });
});

server.requestTimeout = 10 * 60 * 1000;
server.headersTimeout = 10 * 60 * 1000 + 10_000;

const cleanupTimer = setInterval(cleanupExpired, 15 * 60 * 1000);
cleanupTimer.unref();
cleanupExpired().catch(() => {});

function shutdown(signal) {
  console.log(`\n[margin] ${signal}. Closing the print room...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
