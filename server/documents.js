import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { pdf as rasterPdf } from 'pdf-to-img';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv']);
const OFFICE_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.rtf',
  '.odt',
  '.xls',
  '.xlsx',
  '.xlsm',
  '.csv',
  '.ppt',
  '.pptx',
  '.pps',
  '.ppsx',
]);

const ZIP_OFFICE_EXTENSIONS = new Set([
  '.docx',
  '.xlsx',
  '.xlsm',
  '.pptx',
  '.ppsx',
  '.odt',
]);
const OLE_OFFICE_EXTENSIONS = new Set(['.doc', '.xls', '.ppt', '.pps']);

function startsWith(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

function isTextLike(buffer) {
  if (buffer.length === 0) return false;
  let binary = 0;
  for (const byte of buffer) {
    if (byte === 0) return false;
    if (byte < 7 || (byte > 13 && byte < 32)) binary += 1;
  }
  return binary / buffer.length < 0.02;
}

export async function validateFileSignature(inputPath, extension) {
  const ext = extension.toLowerCase();
  const handle = await fsp.open(inputPath, 'r');
  let header;
  try {
    header = Buffer.alloc(512);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    header = header.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }

  if (header.length === 0) {
    throw new Error('That file looks empty.');
  }

  if (ext === '.pdf') {
    if (!startsWith(header, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
      throw new Error('That file is not a valid PDF.');
    }
    return;
  }

  if (['.jpg', '.jpeg'].includes(ext)) {
    if (!startsWith(header, [0xff, 0xd8, 0xff])) {
      throw new Error('That image is not a valid JPEG.');
    }
    return;
  }

  if (ext === '.png') {
    if (
      !startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ) {
      throw new Error('That image is not a valid PNG.');
    }
    return;
  }

  if (ext === '.webp') {
    if (
      header.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      header.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      throw new Error('That image is not a valid WebP file.');
    }
    return;
  }

  if (['.tif', '.tiff'].includes(ext)) {
    if (
      !startsWith(header, [0x49, 0x49, 0x2a, 0x00]) &&
      !startsWith(header, [0x4d, 0x4d, 0x00, 0x2a])
    ) {
      throw new Error('That image is not a valid TIFF file.');
    }
    return;
  }

  if (ZIP_OFFICE_EXTENSIONS.has(ext)) {
    if (!startsWith(header, [0x50, 0x4b, 0x03, 0x04])) {
      throw new Error('That document is not a valid Office file.');
    }
    return;
  }

  if (OLE_OFFICE_EXTENSIONS.has(ext)) {
    if (
      !startsWith(header, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    ) {
      throw new Error('That document is not a valid Office file.');
    }
    return;
  }

  if (ext === '.rtf') {
    if (header.subarray(0, 5).toString('ascii') !== '{\\rtf') {
      throw new Error('That file is not a valid RTF document.');
    }
    return;
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    if (!isTextLike(header)) {
      throw new Error('That file does not look like readable text.');
    }
  }
}

export function displayNameFor(name) {
  const base = path.basename(String(name || 'document'));
  return base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'untitled';
}

export function kindForExtension(extension) {
  const ext = extension.toLowerCase();
  if (ext === '.pdf') return 'PDF';
  if (IMAGE_EXTENSIONS.has(ext)) return 'Image';
  if (TEXT_EXTENSIONS.has(ext)) return ext === '.md' ? 'Markdown' : 'Text';
  if (['.doc', '.docx', '.rtf', '.odt'].includes(ext)) return 'Document';
  if (['.xls', '.xlsx', '.xlsm', '.csv'].includes(ext)) return 'Spreadsheet';
  if (['.ppt', '.pptx', '.pps', '.ppsx'].includes(ext)) return 'Presentation';
  return 'File';
}

export async function loadPdfInfo(pdfPath) {
  const bytes = await fsp.readFile(pdfPath);
  let document;
  try {
    document = await PDFLibDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch (error) {
    if (/encrypted/i.test(error.message)) {
      throw new Error('Password-protected PDFs are not supported yet.');
    }
    throw new Error('That PDF could not be read. Try saving it again and re-uploading.');
  }

  const pages = document.getPages();
  if (pages.length === 0) {
    throw new Error('That PDF has no pages to print.');
  }

  const pageSizes = pages.map((page) => {
    const size = page.getSize();
    return {
      width: Math.round(size.width * 100) / 100,
      height: Math.round(size.height * 100) / 100,
      landscape: size.width > size.height,
    };
  });
  const first = pageSizes[0];
  return {
    pageCount: pages.length,
    firstPageLandscape: first.landscape,
    pageLandscape: pageSizes.map((size) => size.landscape),
    pageSizes,
  };
}

function stripMarkdown(input) {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/^```.*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

async function createTextPdf({ inputPath, outputPath, extension }) {
  const raw = await fsp.readFile(inputPath, 'utf8');
  const text = extension === '.md' ? stripMarkdown(raw) : raw.replace(/\r\n?/g, '\n');

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 64, bottom: 64, left: 68, right: 68 },
      info: { Title: 'Margin print' },
      bufferPages: false,
    });

    const stream = fs.createWriteStream(outputPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    const regularFont = 'C:\\Windows\\Fonts\\segoeui.ttf';
    const boldFont = 'C:\\Windows\\Fonts\\segoeuib.ttf';
    let font = 'Helvetica';
    let bold = 'Helvetica-Bold';
    try {
      if (fs.existsSync(regularFont)) {
        doc.registerFont('MarginSans', regularFont);
        font = 'MarginSans';
      }
      if (fs.existsSync(boldFont)) {
        doc.registerFont('MarginSansBold', boldFont);
        bold = 'MarginSansBold';
      }
    } catch {
      font = 'Helvetica';
      bold = 'Helvetica-Bold';
    }

    const paragraphs = text.split(/\n{2,}/);
    const title = paragraphs[0]?.trim();

    if (title && title.length < 110 && !title.includes('\n')) {
      doc.font(bold).fontSize(21).fillColor('#171810').text(title, {
        lineGap: 2,
      });
      doc.moveDown(0.8);
    }

    const body = title && title.length < 110 ? paragraphs.slice(1).join('\n\n') : text;
    doc.font(font).fontSize(11).fillColor('#171810').text(body || text, {
      lineGap: 4.5,
      paragraphGap: 12,
    });

    if (doc.y > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
    }
    doc
      .font(font)
      .fontSize(8)
      .fillColor('#8b897d')
      .text('MARGIN', doc.page.margins.left, doc.page.height - 42, {
        lineBreak: false,
        characterSpacing: 1.6,
      });

    doc.end();
  });

  return loadPdfInfo(outputPath);
}

function fitInside(width, height, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: width * ratio,
    height: height * ratio,
  };
}

async function createImagePdf({ inputPath, outputPath }) {
  const normalizedPath = `${outputPath}.image.jpg`;
  try {
    const base = sharp(inputPath, { failOn: 'error' }).rotate().flatten({
      background: '#ffffff',
    });

    const metadata = await base.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('That image could not be read.');
    }

    await base
      .jpeg({ quality: 93, mozjpeg: true, chromaSubsampling: '4:4:4' })
      .toFile(normalizedPath);

    const imageBytes = await fsp.readFile(normalizedPath);
    const image = await sharp(normalizedPath).metadata();
    const width = image.width;
    const height = image.height;
    if (!width || !height) throw new Error('That image could not be read.');

    const doc = await PDFLibDocument.create();
    const landscape = width > height;
    const pageWidth = landscape ? 841.89 : 595.28;
    const pageHeight = landscape ? 595.28 : 841.89;
    const margin = 36;
    const size = fitInside(width, height, pageWidth - margin * 2, pageHeight - margin * 2);
    const embedded = await doc.embedJpg(imageBytes);
    const page = doc.addPage([pageWidth, pageHeight]);
    page.drawImage(embedded, {
      x: (pageWidth - size.width) / 2,
      y: (pageHeight - size.height) / 2,
      width: size.width,
      height: size.height,
    });
    await fsp.writeFile(outputPath, await doc.save());
  } finally {
    await fsp.rm(normalizedPath, { force: true }).catch(() => {});
  }

  return loadPdfInfo(outputPath);
}

async function convertOfficeDocument({ inputPath, outputPath, config }) {
  const resultPath = path.join(
    config.tempDir,
    `convert-${crypto.randomUUID()}.json`,
  );

  try {
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
          path.join(config.scriptsDir, 'convert-document.ps1'),
          '-InputPath',
          inputPath,
          '-OutputPath',
          outputPath,
          '-ResultPath',
          resultPath,
        ],
        {
          timeout: 180_000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
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
      console.error('[convert]', result.error || 'Office conversion failed.');
      throw new Error(
        'That document could not be prepared. Try exporting it as a PDF first.',
      );
    }

    if (processError) {
      console.error('[convert]', processError.message);
      throw new Error(
        'The document took too long to prepare. Try a smaller file or export it as a PDF first.',
      );
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(
        'This file could not be converted. Try exporting it as a PDF and uploading that instead.',
      );
    }
  } finally {
    await fsp.rm(resultPath, { force: true }).catch(() => {});
  }

  return loadPdfInfo(outputPath);
}

export async function prepareDocument({
  inputPath,
  extension,
  outputPdfPath,
  config,
  originalName,
}) {
  const ext = extension.toLowerCase();
  await validateFileSignature(inputPath, ext);

  if (ext === '.pdf') {
    await fsp.copyFile(inputPath, outputPdfPath);
  } else if (IMAGE_EXTENSIONS.has(ext)) {
    await createImagePdf({ inputPath, outputPath: outputPdfPath });
  } else if (TEXT_EXTENSIONS.has(ext)) {
    await createTextPdf({
      inputPath,
      outputPath: outputPdfPath,
      extension: ext,
    });
  } else if (OFFICE_EXTENSIONS.has(ext)) {
    await convertOfficeDocument({
      inputPath,
      outputPath: outputPdfPath,
      config,
    });
  } else {
    throw new Error('That file type is not supported yet.');
  }

  const info = await loadPdfInfo(outputPdfPath);
  const maxPages = config?.maxPagesPerDocument ?? 300;
  if (info.pageCount > maxPages) {
    throw new Error(
      `That document has ${info.pageCount} pages. The limit is ${maxPages} pages per document.`,
    );
  }
  return info;
}

export async function createThumbnail({ pdfPath, outputPath }) {
  const document = await rasterPdf(pdfPath, { scale: 1.15 });
  try {
    const firstPage = await document.getPage(1);
    await sharp(firstPage)
      .resize({ width: 660, height: 900, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toFile(outputPath);
  } finally {
    if (typeof document.destroy === 'function') document.destroy();
  }
}

export async function renderPagePreview({
  pdfPath,
  pageNumber,
  outputPath,
  width = 460,
}) {
  const document = await rasterPdf(pdfPath, { scale: 1.35 });
  try {
    const page = await document.getPage(pageNumber);
    await sharp(page)
      .resize({ width, height: 680, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 76, effort: 4 })
      .toFile(outputPath);
  } finally {
    if (typeof document.destroy === 'function') document.destroy();
  }
}

async function inkCoverage(pageBuffer) {
  const { data, info } = await sharp(pageBuffer)
    .greyscale()
    .resize({ width: 240, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  if (!total) return 0;
  let dark = 0;
  for (const value of data) {
    if (value < 238) dark += 1;
  }
  return dark / total;
}

export async function analyzeBlankPages({
  pdfPath,
  pageCount,
  maxSamples = 12,
}) {
  if (!pageCount || pageCount < 1) {
    return { blankPages: [], sampledPages: [] };
  }

  const samples = new Set();
  if (pageCount <= maxSamples) {
    for (let page = 1; page <= pageCount; page += 1) samples.add(page);
  } else {
    for (let index = 0; index < maxSamples; index += 1) {
      const page = Math.round(1 + (index * (pageCount - 1)) / (maxSamples - 1));
      samples.add(page);
    }
  }

  const blankPages = [];
  const document = await rasterPdf(pdfPath, { scale: 0.85 });
  try {
    for (const pageNumber of [...samples].sort((left, right) => left - right)) {
      const page = await document.getPage(pageNumber);
      const coverage = await inkCoverage(page);
      if (coverage < 0.0007) blankPages.push(pageNumber);
    }
  } finally {
    if (typeof document.destroy === 'function') document.destroy();
  }

  return { blankPages, sampledPages: [...samples].sort((left, right) => left - right) };
}

export function parsePageRange(input, pageCount) {
  const raw = String(input ?? '')
    .replace(/[\u2012\u2013\u2014\u2015]/g, '-')
    .trim();
  if (!raw || raw.toLowerCase() === 'all') {
    return {
      ok: true,
      indices: Array.from({ length: pageCount }, (_, index) => index),
      label: `All ${pageCount} page${pageCount === 1 ? '' : 's'}`,
    };
  }

  if (raw.length > 160) {
    return { ok: false, error: 'That page range is too long.' };
  }

  const selected = new Set();
  const tokens = raw.split(',');
  if (tokens.length > 60) {
    return { ok: false, error: 'That page range is too long.' };
  }

  for (const tokenRaw of tokens) {
    const token = tokenRaw.trim();
    if (!token) continue;

    const single = token.match(/^(\d+)$/);
    const range = token.match(/^(\d+)?\s*-\s*(\d+)?$/);
    if (!single && !range) {
      return {
        ok: false,
        error: 'Use page numbers and ranges, like 1-3, 5.',
      };
    }

    const start = single ? Number(single[1]) : Number(range[1] ?? 1);
    const end = single ? Number(single[1]) : Number(range[2] ?? pageCount);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < 1 ||
      start > pageCount ||
      end > pageCount
    ) {
      return {
        ok: false,
        error: `Pages must be between 1 and ${pageCount}.`,
      };
    }
    if (start > end) {
      return { ok: false, error: 'Page ranges need to run lowest to highest.' };
    }
    for (let page = start; page <= end; page += 1) {
      selected.add(page - 1);
    }
  }

  if (selected.size === 0) {
    return { ok: false, error: 'Choose at least one page to print.' };
  }

  const indices = [...selected].sort((left, right) => left - right);
  return {
    ok: true,
    indices,
    label:
      indices.length === pageCount
        ? `All ${pageCount} page${pageCount === 1 ? '' : 's'}`
        : `${indices.length} selected page${indices.length === 1 ? '' : 's'}`,
  };
}
