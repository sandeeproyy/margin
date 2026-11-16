import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CACHE_MS = 45 * 1000;

function connectionLabel(port) {
  if (/^USB/i.test(port)) return 'USB';
  if (/^IP_|WSD|\\\\/i.test(port)) return 'Network';
  return 'Local';
}

function friendlyStatus(status) {
  const level = status?.level ?? 'unknown';
  if (level === 'offline') {
    return { level: 'offline', label: 'Not connected' };
  }
  if (level === 'error') {
    return { level: 'error', label: 'Needs attention' };
  }
  if (level === 'busy') {
    return { level: 'busy', label: 'Printing now' };
  }
  if (level === 'ready') {
    return { level: 'ready', label: 'Ready' };
  }
  return { level: 'ready', label: 'Ready' };
}

function decoratePrinter(printer) {
  const transport = connectionLabel(printer.port);
  const level = printer.status?.level ?? 'unknown';
  return {
    ...printer,
    id: crypto.createHash('sha256').update(String(printer.name)).digest('hex').slice(0, 16),
    transport,
    // Some drivers report "unknown" even when the queue is usable. Only block
    // printers that Windows explicitly marks offline or stopped.
    online: level !== 'offline' && level !== 'error',
    busy: level === 'busy',
    isVirtual: false,
  };
}

function publicPrinter(printer, index, total) {
  const status = friendlyStatus(printer.status);
  return {
    id: printer.id,
    label: total === 1 ? 'Your printer' : `Printer ${index + 1}`,
    online: printer.online,
    busy: printer.busy,
    status,
    supportsColor: Boolean(printer.supportsColor),
    supportsDuplex: Boolean(printer.supportsDuplex),
    maxCopies: Math.min(Math.max(Number(printer.maxCopies) || 1, 1), 999),
    qualities: (printer.qualities ?? []).map((quality) => ({
      id: quality.id,
      label: quality.label,
    })),
    defaultQuality: printer.defaultQuality ?? 'PrinterDefault',
    papers: (printer.papers ?? []).map((paper) => ({
      id: paper.id,
      name: paper.name,
      detail: paper.detail ?? '',
      rawKind: paper.rawKind,
      width: paper.width,
      height: paper.height,
    })),
    defaultPaperId: printer.defaultPaperId ?? null,
    sources: (printer.sources ?? []).map((source) => ({
      id: source.id,
      name: source.name,
      rawKind: source.rawKind,
    })),
  };
}

export function toPublicPrinters(printers) {
  const list = Array.isArray(printers) ? printers : [];
  const sorted = list.slice().sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    return String(left.name).localeCompare(String(right.name));
  });
  return sorted.map((printer, index) => publicPrinter(printer, index, sorted.length));
}

/**
 * The owner picks one printer on the laptop; everyone else only ever sees that
 * one, and never learns what it is called. Everything below exists to keep the
 * machine's real printer names on the laptop side of the tunnel.
 */

export function createPrinterSelectionStore(config) {
  const filePath = config.printerSelectionPath;
  let cached = null;

  async function read() {
    if (cached) return cached;
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      cached = {
        printerName:
          typeof parsed?.printerName === 'string' ? parsed.printerName : null,
        updatedAt: parsed?.updatedAt ?? null,
        updatedBy: parsed?.updatedBy ?? null,
      };
    } catch {
      cached = { printerName: null, updatedAt: null, updatedBy: null };
    }
    return cached;
  }

  async function write(next) {
    cached = next;
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    return next;
  }

  return {
    async get() {
      return read();
    },
    async set(printerName, updatedBy = null) {
      return write({
        printerName: String(printerName),
        updatedAt: new Date().toISOString(),
        updatedBy,
      });
    },
    async clear(updatedBy = null) {
      return write({
        printerName: null,
        updatedAt: new Date().toISOString(),
        updatedBy,
      });
    },
  };
}

/**
 * Resolve which printer the client may use. Honours the owner's selection,
 * falls back to the Windows default, then to any online printer, so the app
 * still works before the owner has chosen one.
 */
export function pickActivePrinter(printers, selection) {
  const list = Array.isArray(printers) ? printers : [];
  const chosenName = selection?.printerName ?? null;

  if (chosenName) {
    const chosen = list.find((printer) => printer.name === chosenName);
    if (chosen) {
      return { printer: chosen, source: 'selected', selectionMissing: false };
    }
    // The owner picked a printer that is no longer attached. Report it rather
    // than silently printing somewhere else.
    return {
      printer: null,
      source: 'selected-missing',
      selectionMissing: true,
      selectedName: chosenName,
    };
  }

  const fallback =
    list.find((printer) => printer.isDefault) ??
    list.find((printer) => printer.online) ??
    null;
  return {
    printer: fallback,
    source: fallback ? 'fallback' : 'none',
    selectionMissing: false,
  };
}

/** Project one printer for a member: no name, no port, no driver details. */
export function toClientPrinter(printer) {
  if (!printer) return null;
  return publicPrinter(printer, 0, 1);
}


export function createPrinterService(config) {
  let cache = null;
  let cacheTime = 0;
  let pending = null;

  async function readPrinters() {
    if (!config.isWindows) {
      return {
        ok: false,
        error: 'The printer is available on Windows only.',
        printers: [],
        defaultPrinter: null,
      };
    }

    const outputPath = path.join(
      config.tempDir,
      `printers-${crypto.randomUUID()}.json`,
    );

    try {
      await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(config.scriptsDir, 'get-printers.ps1'),
          '-OutputPath',
          outputPath,
        ],
        {
          timeout: 30_000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );

      const raw = await fsp.readFile(outputPath, 'utf8');
      const data = JSON.parse(raw);
      if (!data?.ok) throw new Error(data?.error || 'Could not read printers.');
      const printers = (data.printers ?? []).map(decoratePrinter);

      return {
        ok: true,
        printers,
        defaultPrinter:
          data.defaultPrinter ?? printers.find((printer) => printer.isDefault)?.name ?? null,
        generatedAt: data.generatedAt,
      };
    } finally {
      await fsp.rm(outputPath, { force: true }).catch(() => {});
    }
  }

  async function refresh() {
    if (pending) return pending;
    pending = readPrinters()
      .then((data) => {
        cache = data;
        cacheTime = Date.now();
        return data;
      })
      .catch((error) => {
        console.error('[printer]', error.message);
        cache = {
          ok: false,
          error: 'The printer could not be reached. Check that it is switched on and connected.',
          printers: [],
          defaultPrinter: null,
        };
        cacheTime = Date.now();
        return cache;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  async function get(force = false) {
    if (!cache) return refresh();
    if (force || Date.now() - cacheTime > CACHE_MS) return refresh();
    return cache;
  }

  async function findPrinterById(id, force = false) {
    const data = await get(force);
    if (!data.ok) return { data, printer: null };
    const printer =
      data.printers.find((item) => item.id === id) ??
      data.printers.find((item) => item.isDefault) ??
      data.printers.find((item) => item.online) ??
      null;
    return { data, printer };
  }

  return { get, refresh, findPrinterById };
}

export function validateAndNormalizeSettings(printer, input = {}) {
  if (!printer) {
    return { ok: false, error: 'The printer is not available right now.' };
  }

  if (!printer.online) {
    return {
      ok: false,
      error: 'The printer is offline. Check that it is switched on and connected, then try again.',
    };
  }

  const copiesRaw = Number(input.copies);
  const copies = Number.isFinite(copiesRaw) ? Math.round(copiesRaw) : 1;
  if (copies < 1 || copies > printer.maxCopies) {
    return {
      ok: false,
      error: `Choose between 1 and ${printer.maxCopies} copies.`,
    };
  }

  const color = printer.supportsColor ? Boolean(input.color) : false;

  const requestedQuality = String(input.quality ?? printer.defaultQuality);
  const quality = printer.qualities.some((item) => item.id === requestedQuality)
    ? requestedQuality
    : printer.defaultQuality;

  const requestedPaper = String(input.paperId ?? printer.defaultPaperId ?? '');
  const paper =
    printer.papers.find((item) => item.id === requestedPaper) ??
    printer.papers.find((item) => item.id === printer.defaultPaperId) ??
    printer.papers[0] ??
    null;
  if (!paper) {
    return { ok: false, error: 'The printer did not report a paper size.' };
  }

  const orientation = ['auto', 'portrait', 'landscape'].includes(input.orientation)
    ? input.orientation
    : 'auto';

  let sides = ['one-sided', 'long-edge', 'short-edge'].includes(input.sides)
    ? input.sides
    : 'one-sided';
  if (sides !== 'one-sided' && !printer.supportsDuplex) {
    sides = 'one-sided';
  }

  const scale = ['fit', 'actual'].includes(input.scale) ? input.scale : 'fit';

  const sourceId = input.sourceId != null ? String(input.sourceId) : '';
  const source =
    printer.sources?.find((item) => item.id === sourceId) ??
    printer.sources?.[0] ??
    null;

  return {
    ok: true,
    settings: {
      copies,
      color,
      quality,
      paperId: paper.id,
      paper,
      orientation,
      sides,
      scale,
      collate: copies > 1 ? input.collate !== false : true,
      sourceId: source?.id ?? null,
      sourceRawKind: source?.rawKind ?? 0,
    },
  };
}
