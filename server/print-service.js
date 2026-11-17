import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { pdf as rasterPdf } from 'pdf-to-img';
import { parsePageRange } from './documents.js';

const execFileAsync = promisify(execFile);

const QUALITY_DPI = {
  High: 360,
  Medium: 240,
  Low: 180,
  Draft: 120,
  PrinterDefault: 200,
};

// The XPS path keeps every rendered page in memory until the job is spooled.
// Cap the raster on long jobs so a 100-page document cannot exhaust the laptop.
function rasterDpiFor(quality, pageCount) {
  const base = QUALITY_DPI[quality] ?? 200;
  const pages = Math.max(1, Number(pageCount) || 1);
  if (pages > 25) return Math.min(base, 200);
  if (pages > 10) return Math.min(base, 240);
  return base;
}

const QUALITY_LABEL = {
  High: 'Fine',
  Medium: 'Standard',
  Low: 'Light',
  Draft: 'Draft',
  PrinterDefault: 'Printer default',
};

const DUPLEX_VALUE = {
  'one-sided': 'simplex',
  'long-edge': 'long',
  'short-edge': 'short',
};

const ACTIVE_STATUSES = new Set(['queued', 'preparing', 'sending']);

async function pageLooksBlank(pageBuffer) {
  const { data, info } = await sharp(pageBuffer)
    .greyscale()
    .resize({ width: 240, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  if (!total) return false;
  let dark = 0;
  for (const value of data) {
    if (value < 238) dark += 1;
  }
  return dark / total < 0.0007;
}

function publicPrintSummary(job, settings, pageCount, range, blankPages) {
  return {
    pages: pageCount,
    copies: settings.copies,
    color: settings.color,
    quality: settings.quality,
    qualityLabel: QUALITY_LABEL[settings.quality] ?? settings.quality,
    paper: settings.paper.name,
    orientation: settings.orientation,
    sides: settings.sides,
    scale: settings.scale,
    collate: settings.collate,
    range: range.label,
    blankPages,
  };
}

function friendlyPrintError(raw) {
  const message = String(raw || '').trim();
  if (!message) return 'The printer did not accept the job. Try again.';
  if (/not found|does not exist|no longer available/i.test(message)) {
    return 'The printer is not available right now. Check that it is switched on and connected.';
  }
  if (/offline|not available|not connected|no printer/i.test(message)) {
    return 'The printer looks offline. Check that it is switched on and connected.';
  }
  if (/paper|media/i.test(message)) {
    return 'The printer needs paper, or the selected paper size is not loaded.';
  }
  if (/rejected these settings/i.test(message)) {
    return 'The printer did not accept one of those settings. Try Standard quality or another paper size.';
  }
  return 'The printer did not take the job. Check the printer, then try again.';
}

export function createPrintService({ config, history }) {
  const queue = [];
  const jobsById = new Map();
  let active = false;

  function registerJob(job) {
    jobsById.set(job.id, job);
  }

  function getJob(id) {
    return jobsById.get(id) ?? null;
  }

  function updateJob(job, updates) {
    Object.assign(job, updates);
  }

  function listJobs() {
    return [...jobsById.values()];
  }

  function countActiveForUser(userId) {
    return listJobs().filter(
      (job) => job.userId === userId && ACTIVE_STATUSES.has(job.status),
    ).length;
  }

  function countActiveGlobal() {
    return listJobs().filter((job) => ACTIVE_STATUSES.has(job.status)).length;
  }

  function enqueue(task) {
    queue.push(task);
    runNext();
  }

  async function runNext() {
    if (active) return;
    const task = queue.shift();
    if (!task) return;
    active = true;
    try {
      await task();
    } catch (error) {
      console.error('[print] Unexpected queue error:', error);
    } finally {
      active = false;
      if (queue.length > 0) runNext();
    }
  }

  function accept(job, printer, settings, rawRange) {
    if (!job || !fs.existsSync(job.pdfPath)) {
      return { ok: false, status: 404, error: 'That file has expired. Upload it again.' };
    }
    if (job.status === 'processing') {
      return {
        ok: false,
        status: 409,
        error: 'That document is still being prepared. Give it a moment, then try again.',
      };
    }
    if (ACTIVE_STATUSES.has(job.status)) {
      return {
        ok: false,
        status: 409,
        error: 'This document is already on its way to the printer.',
      };
    }
    if (job.status === 'sent') {
      return {
        ok: false,
        status: 409,
        error: 'This document has already printed. Upload it again to make another copy.',
      };
    }
    if (job.status !== 'ready') {
      return {
        ok: false,
        status: 409,
        error: 'That document is not ready to print. Upload it again.',
      };
    }

    const range = parsePageRange(rawRange, job.info.pageCount);
    if (!range.ok) {
      return { ok: false, status: 400, error: range.error };
    }

    const summary = publicPrintSummary(
      job,
      settings,
      range.indices.length,
      range,
      [],
    );
    updateJob(job, {
      status: 'queued',
      progress: 6,
      stage: 'queued',
      message: 'Waiting for the printer',
      error: null,
      warnings: [],
      print: summary,
      rangeLabel: range.label,
      selectedIndices: range.indices,
    });

    enqueue(() => runPrint(job, printer, settings, range));
    return { ok: true, job };
  }

  async function runPrint(job, printer, settings, range) {
    const printDirectory = path.join(
      config.tempDir,
      `job-${job.id}-${crypto.randomUUID()}`,
    );
    const manifestPath = path.join(printDirectory, 'manifest.json');
    const resultPath = path.join(printDirectory, 'result.json');
    const documentName = `Margin - ${job.originalName}`.slice(0, 120);

    await fsp.mkdir(printDirectory, { recursive: true });
    updateJob(job, {
      status: 'preparing',
      progress: 14,
      stage: 'preparing',
      message: 'Rendering your pages',
    });

    try {
      const firstIndex = range.indices[0];
      let landscape;
      if (settings.orientation === 'landscape') {
        landscape = true;
      } else if (settings.orientation === 'portrait') {
        landscape = false;
      } else {
        landscape = job.info.pageLandscape?.[firstIndex] ?? job.info.firstPageLandscape;
      }

      const qualityDpi = rasterDpiFor(settings.quality, range.indices.length);
      const document = await rasterPdf(job.pdfPath, { scale: qualityDpi / 72 });
      const pagePaths = [];
      const blankPages = [];

      try {
        for (let i = 0; i < range.indices.length; i += 1) {
          const pageIndex = range.indices[i];
          updateJob(job, {
            progress: 16 + Math.round((i / range.indices.length) * 42),
            message:
              range.indices.length === 1
                ? 'Rendering your page'
                : `Rendering page ${i + 1} of ${range.indices.length}`,
          });

          const source = await document.getPage(pageIndex + 1);
          const sourceMeta = await sharp(source).metadata();
          if (!sourceMeta.width || !sourceMeta.height) {
            throw new Error('One of the pages could not be rendered.');
          }
          if (await pageLooksBlank(source)) {
            blankPages.push(pageIndex + 1);
          }

          // Keep every page upright. If a page's shape does not match the
          // selected paper orientation it is scaled to fit with margins rather
          // than rotated sideways.
          let pipeline = sharp(source);
          if (!settings.color) pipeline = pipeline.grayscale();

          const pagePath = path.join(
            printDirectory,
            `page-${String(i + 1).padStart(3, '0')}.jpg`,
          );
          await pipeline
            .withMetadata({ density: qualityDpi })
            .jpeg({
              quality: settings.quality === 'High' ? 94 : 89,
              chromaSubsampling: '4:4:4',
              mozjpeg: true,
            })
            .toFile(pagePath);
          pagePaths.push(pagePath);
        }
      } finally {
        if (typeof document.destroy === 'function') document.destroy();
      }

      if (pagePaths.length === 0) {
        throw new Error('No printable pages were rendered.');
      }

      const warnings = [];
      if (blankPages.length > 0) {
        warnings.push(
          blankPages.length === 1
            ? `Page ${blankPages[0]} looks blank in the original document.`
            : `Pages ${blankPages.join(', ')} look blank in the original document.`,
        );
      }
      updateJob(job, {
        status: 'sending',
        progress: 72,
        stage: 'sending',
        message: 'Sending it to the printer',
        warnings,
        print: {
          ...(job.print ?? {}),
          blankPages,
        },
      });

      const manifest = {
        printer: printer.name,
        pagePaths,
        copies: settings.copies,
        collate: settings.collate,
        color: settings.color,
        quality: settings.quality,
        landscape,
        duplex: DUPLEX_VALUE[settings.sides] ?? 'simplex',
        paperRawKind: settings.paper.rawKind,
        paperWidth: settings.paper.width,
        paperHeight: settings.paper.height,
        paperSourceRawKind: settings.sourceRawKind ?? 0,
        scale: settings.scale,
        renderDpi: qualityDpi,
        documentName,
      };
      await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

      let processError = null;
      try {
        await execFileAsync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            path.join(config.scriptsDir, 'print-pages.ps1'),
            '-ManifestPath',
            manifestPath,
            '-ResultPath',
            resultPath,
          ],
          {
            timeout: 8 * 60 * 1000,
            windowsHide: true,
            maxBuffer: 2 * 1024 * 1024,
          },
        );
      } catch (error) {
        processError = error;
      }

      let result = null;
      try {
        result = JSON.parse(await fsp.readFile(resultPath, 'utf8'));
      } catch {
        result = null;
      }

      if (result && !result.ok) {
        console.error('[print]', result.error);
        throw new Error(friendlyPrintError(result.error));
      }
      if (processError || !result) {
        if (processError) console.error('[print]', processError.message);
        throw new Error(
          'The printer did not respond. Check the printer, then try again.',
        );
      }
      if (result.mode === 'gdi' && result.xpsError) {
        // The job still printed, but through the older GDI path. Keep the
        // driver's reason here so a silent color/quality fallback is visible
        // in the laptop log.
        console.error('[print] XPS path fell back to GDI:', result.xpsError);
      }

      updateJob(job, {
        status: 'sent',
        progress: 100,
        stage: 'sent',
        message: 'Sent to the printer',
        sentAt: new Date().toISOString(),
        spoolJobId: result.jobId,
      });

      await history.upsert({
        id: job.id,
        userId: job.userId,
        name: job.originalName,
        kind: job.kind,
        pageCount: job.info.pageCount,
        printedPages: range.indices.length,
        copies: settings.copies,
        color: settings.color,
        quality: settings.quality,
        qualityLabel: QUALITY_LABEL[settings.quality] ?? settings.quality,
        paper: settings.paper.name,
        status: 'sent',
        createdAt: new Date().toISOString(),
        range: range.label,
        blankPages,
      });
    } catch (error) {
      const friendly = friendlyPrintError(error.message);
      console.error(`[print] Job ${job.id} failed:`, error.message);
      updateJob(job, {
        status: 'error',
        progress: 100,
        stage: 'error',
        message: 'The print job stopped',
        error: friendly,
      });

      await history.upsert({
        id: job.id,
        userId: job.userId,
        name: job.originalName,
        kind: job.kind,
        pageCount: job.info.pageCount,
        printedPages: range.indices.length,
        copies: settings.copies,
        color: settings.color,
        quality: settings.quality,
        qualityLabel: QUALITY_LABEL[settings.quality] ?? settings.quality,
        paper: settings.paper.name,
        status: 'error',
        error: friendly,
        createdAt: new Date().toISOString(),
        range: range.label,
      });
    } finally {
      await fsp.rm(printDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }

  function publicStatus(job) {
    return {
      id: job.id,
      status: job.status,
      progress: job.progress ?? 0,
      stage: job.stage ?? null,
      message: job.message ?? '',
      error: job.error ?? null,
      warnings: Array.isArray(job.warnings) ? job.warnings : [],
      print: job.print ?? null,
      sentAt: job.sentAt ?? null,
      canRetry: job.status === 'error' && fs.existsSync(job.pdfPath),
    };
  }

  async function removeFiles(job) {
    if (!job) return;
    try {
      await fsp.rm(job.directory, { recursive: true, force: true });
    } catch {
      // A file can be locked briefly by Word or a preview.
    }
    job.filesRemoved = true;
  }

  return {
    accept,
    countActiveForUser,
    countActiveGlobal,
    getJob,
    listJobs,
    publicStatus,
    registerJob,
    removeFiles,
    updateJob,
  };
}
