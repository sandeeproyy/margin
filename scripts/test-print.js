#!/usr/bin/env node
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { pdf as rasterPdf } from 'pdf-to-img';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'scripts');

const args = process.argv.slice(2);
const assumeYes = args.includes('--yes') || args.includes('-y');
const dryRun = args.includes('--dry-run');
const printerFlag = args.indexOf('--printer');
const requestedPrinter =
  printerFlag >= 0 ? String(args[printerFlag + 1] ?? '').trim() : '';
const copiesFlag = args.indexOf('--copies');
const requestedCopies =
  copiesFlag >= 0 ? Number.parseInt(args[copiesFlag + 1] ?? '', 10) : 1;

const QUALITY_DPI = {
  High: 288,
  Medium: 200,
  Low: 150,
  Draft: 120,
  PrinterDefault: 200,
};

function line(message = '') {
  console.log(message);
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exitCode = 1;
}

async function getPrinters(tempDir) {
  const outputPath = path.join(tempDir, 'printers.json');
  try {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(SCRIPTS, 'get-printers.ps1'),
        '-OutputPath',
        outputPath,
      ],
      { timeout: 45_000, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const data = JSON.parse(await fsp.readFile(outputPath, 'utf8'));
    if (!data?.ok) throw new Error(data?.error || 'Could not read the printer list.');
    return data;
  } finally {
    await fsp.rm(outputPath, { force: true }).catch(() => {});
  }
}

function choosePrinter(data) {
  const printers = Array.isArray(data.printers) ? data.printers : [];
  if (!printers.length) {
    throw new Error(
      'No printers found. Connect the printer by USB and make sure it is switched on.',
    );
  }

  if (requestedPrinter) {
    const match = printers.find(
      (printer) =>
        printer.name.toLowerCase() === requestedPrinter.toLowerCase(),
    );
    if (!match) {
      throw new Error(
        `Printer "${requestedPrinter}" was not found. Available: ${printers
          .map((printer) => printer.name)
          .join(', ')}`,
      );
    }
    return match;
  }

  return (
    printers.find((printer) => printer.name === data.defaultPrinter) ??
    printers.find(
      (printer) =>
        printer.status?.level !== 'offline' && printer.status?.level !== 'error',
    ) ??
    printers[0]
  );
}

function choosePaper(printer) {
  const papers = Array.isArray(printer.papers) ? printer.papers : [];
  return (
    papers.find((paper) => /^A4\b/i.test(paper.name)) ??
    papers.find((paper) => paper.id === printer.defaultPaperId) ??
    papers[0] ?? {
      name: 'A4',
      detail: '210 x 297 mm',
      rawKind: 9,
      width: 2100,
      height: 2970,
    }
  );
}

function chooseSource(printer) {
  const sources = Array.isArray(printer.sources) ? printer.sources : [];
  return (
    sources.find((source) => !/borderless/i.test(source.name)) ??
    sources[0] ??
    null
  );
}

function registrationMark(doc, x, y, horizontal, vertical) {
  doc.save().lineWidth(0.55).strokeColor('#8b897d');
  doc.moveTo(x - horizontal, y).lineTo(x + horizontal, y).stroke();
  doc.moveTo(x, y - vertical).lineTo(x, y + vertical).stroke();
  doc.restore();
}

async function makeTestPdf({ pdfPath, printer, paper, source, quality, copies }) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 56, bottom: 56, left: 62, right: 62 },
    info: {
      Title: 'Margin test page',
      Author: 'Margin',
      Subject: 'USB print path test',
    },
  });

  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

  const ink = '#171810';
  const muted = '#777467';
  const lineColor = '#b9b4a5';
  const orange = '#ef542f';
  const paperWidth = doc.page.width;
  const paperHeight = doc.page.height;

  registrationMark(doc, 30, 30, 10, 10);
  registrationMark(doc, paperWidth - 30, 30, 10, 10);
  registrationMark(doc, 30, paperHeight - 30, 10, 10);
  registrationMark(doc, paperWidth - 30, paperHeight - 30, 10, 10);

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(muted)
    .text('MARGIN  /  TEST PAGE', 62, 52, { characterSpacing: 1.4 });

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(muted)
    .text('USB PRINT PATH', 62, 52, { width: paperWidth - 124, align: 'right' });

  doc
    .moveTo(62, 72)
    .lineTo(paperWidth - 62, 72)
    .lineWidth(1)
    .strokeColor(ink)
    .stroke();

  doc
    .font('Times-Roman')
    .fontSize(46)
    .fillColor(ink)
    .text('A test page.', 62, 102, { lineGap: -4 });
  doc
    .font('Times-Italic')
    .fontSize(20)
    .fillColor(orange)
    .text('from your phone, through the laptop, to the tray.', 64, 157, {
      width: paperWidth - 128,
    });

  doc
    .font('Helvetica')
    .fontSize(12.5)
    .fillColor('#44443a')
    .text(
      'If you can read this, the file travelled through Margin, became a PDF, was rendered into pages, and reached Windows through the USB print queue.',
      62,
      204,
      { width: paperWidth - 124, lineGap: 5 },
    );

  const detailY = 286;
  doc
    .moveTo(62, detailY)
    .lineTo(paperWidth - 62, detailY)
    .lineWidth(0.75)
    .strokeColor(lineColor)
    .stroke();

  const details = [
    ['Printer', printer.name],
    ['Paper', `${paper.name}${paper.detail ? ` - ${paper.detail}` : ''}`],
    ['Quality', quality],
    ['Copies', String(copies)],
    ['Feed', source?.name || 'Driver default'],
    ['Printed', new Date().toLocaleString()],
  ];

  const columnWidth = (paperWidth - 124) / 2;
  details.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 62 + column * columnWidth;
    const y = detailY + 18 + row * 37;
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor(muted)
      .text(label.toUpperCase(), x, y, { characterSpacing: 0.8 });
    doc.font('Helvetica').fontSize(11.5).fillColor(ink).text(value, x, y + 11, {
      width: columnWidth - 18,
      ellipsis: true,
    });
  });

  const swatchY = 436;
  doc
    .moveTo(62, swatchY - 18)
    .lineTo(paperWidth - 62, swatchY - 18)
    .lineWidth(0.75)
    .strokeColor(lineColor)
    .stroke();

  const swatches = [
    ['#ef542f', 'Orange'],
    ['#2f7656', 'Green'],
    ['#2e5f9e', 'Blue'],
    ['#171810', 'Ink'],
    ['#e6e0d2', 'Paper'],
  ];
  const swatchWidth = (paperWidth - 124 - 4 * 10) / 5;
  swatches.forEach(([fill, label], index) => {
    const x = 62 + index * (swatchWidth + 10);
    doc
      .rect(x, swatchY, swatchWidth, 34)
      .fillColor(fill)
      .fill();
    doc
      .rect(x, swatchY, swatchWidth, 34)
      .lineWidth(0.5)
      .strokeColor(lineColor)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(muted)
      .text(label, x, swatchY + 40, {
        width: swatchWidth,
        align: 'center',
      });
  });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(muted)
    .text(
      'If a color is missing or streaked, the matching ink cartridge may be low.',
      62,
      swatchY + 57,
      { width: paperWidth - 124 },
    );

  const textY = 560;
  doc
    .font('Helvetica')
    .fontSize(8.2)
    .fillColor('#44443a')
    .text(
      'A print room in miniature. Margin runs on one laptop, keeps your files out of someone else\'s cloud, and hands the pages to the printer by your desk. A private PIN guards the door. The rest is paper, ink, and a small amount of patience.',
      62,
      textY,
      { width: paperWidth - 124, lineGap: 4.2 },
    );

  for (let row = 0; row < 5; row += 1) {
    const y = 625 + row * 13;
    const width = [paperWidth - 124, 330, 420, 260, 370][row];
    doc
      .moveTo(62, y)
      .lineTo(62 + width, y)
      .lineWidth(0.55)
      .strokeColor(row === 0 ? '#777467' : lineColor)
      .stroke();
  }

  doc
    .moveTo(62, paperHeight - 48)
    .lineTo(paperWidth - 62, paperHeight - 48)
    .lineWidth(0.6)
    .strokeColor(lineColor)
    .stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(muted)
    .text('MARGIN PRINT CO.', 62, paperHeight - 38, { characterSpacing: 1.2 });
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(muted)
    .text('One test page. Nothing else.', 62, paperHeight - 38, {
      width: paperWidth - 124,
      align: 'right',
    });

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
  });
}

async function run() {
  if (process.platform !== 'win32') {
    fail('This test prints through Windows. Run it on the laptop that holds the printer.');
    return;
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'margin-test-'));
  let keepFiles = dryRun;

  line('');
  line('  m a r g i n  /  test print');
  line('');
  line('  Looking for the printer...');

  try {
    const data = await getPrinters(tempDir);
    const printer = choosePrinter(data);
    const paper = choosePaper(printer);
    const source = chooseSource(printer);
    const quality =
      printer.qualities?.some((item) => item.id === printer.defaultQuality)
        ? printer.defaultQuality
        : printer.qualities?.[0]?.id || 'Medium';
    const renderDpi = QUALITY_DPI[quality] ?? 200;
    const maxCopies = Math.max(1, Number(printer.maxCopies) || 1);
    const copies = Math.max(
      1,
      Math.min(
        Number.isFinite(requestedCopies) && requestedCopies > 0
          ? requestedCopies
          : 1,
        maxCopies,
        5,
      ),
    );

    line(`  Printer   ${printer.name}`);
    line(`  Paper     ${paper.name}${paper.detail ? ` - ${paper.detail}` : ''}`);
    line(`  Quality   ${quality} (${renderDpi} dpi raster)`);
    line(`  Feed      ${source?.name || 'Driver default'}`);
    line(`  Copies    ${copies}`);
    line('');

    if (!dryRun && !assumeYes) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(
        '  This will print a real page. Continue? [y/N] ',
      );
      rl.close();
      if (!/^y(es)?$/i.test(answer.trim())) {
        line('');
        line('  Cancelled. No paper was touched.');
        return;
      }
    }

    const pdfPath = path.join(tempDir, 'margin-test-page.pdf');
    const imagePath = path.join(tempDir, 'margin-test-page-001.jpg');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const resultPath = path.join(tempDir, 'result.json');

    line('  Drawing the test page...');
    await makeTestPdf({ pdfPath, printer, paper, source, quality, copies });

    line('  Rasterizing at print quality...');
    const document = await rasterPdf(pdfPath, { scale: renderDpi / 72 });
    try {
      const firstPage = await document.getPage(1);
      await sharp(firstPage)
        .jpeg({ quality: 93, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toFile(imagePath);
    } finally {
      if (typeof document.destroy === 'function') document.destroy();
    }

    const manifest = {
      printer: printer.name,
      pagePaths: [imagePath],
      copies,
      collate: true,
      color: Boolean(printer.supportsColor),
      quality,
      landscape: false,
      duplex: 'simplex',
      paperRawKind: paper.rawKind,
      paperWidth: paper.width,
      paperHeight: paper.height,
      paperSourceRawKind: source?.rawKind ?? 0,
      scale: 'fit',
      renderDpi,
      documentName: `Margin test page ${crypto.randomUUID().slice(0, 4)}`,
    };
    await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    if (dryRun) {
      line('');
      line('  Dry run complete. Nothing was sent to the printer.');
      line(`  PDF     ${pdfPath}`);
      line(`  Image   ${imagePath}`);
      line(`  Files   ${manifestPath}`);
      line('');
      return;
    }

    line('  Sending it through Windows...');
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
          path.join(SCRIPTS, 'print-pages.ps1'),
          '-ManifestPath',
          manifestPath,
          '-ResultPath',
          resultPath,
        ],
        { timeout: 8 * 60 * 1000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
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
      throw new Error(result.error || 'The printer rejected the test page.');
    }
    if (processError || !result) {
      throw new Error(
        'The printer driver did not respond. Check the printer and the Windows print queue.',
      );
    }

    line('');
    line(`  Sent. Windows spool job ${result.jobId}.`);
    line('  Pick up the page. If it looks right, the USB path is working.');
    line('');
  } catch (error) {
    keepFiles = true;
    fail(error.message || 'The test print failed.');
    line(`  Files kept for inspection: ${tempDir}`);
    line('');
  } finally {
    if (!keepFiles) {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

void run();
