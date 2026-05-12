/**
 * Print service — direct IPP printing to a network printer by IP.
 *
 * Configure via environment variables:
 *   PRINTER_IP          — IP address of the printer (required for IPP printing)
 *   PRINTER_PORT        — IPP port (default: 631)
 *   PRINTER_PATH        — IPP URI path (default: /ipp/print)
 *   PRINTER_PAPER_SIZE  — IPP media name (default: Custom.4.25x6in)
 *   PRINTER_QUALITY     — Print quality 3=draft 4=normal 5=high (default: 5)
 *   PRINTER_ORIENTATION — 3=portrait 4=landscape (default: 3)
 *
 * Fallback (legacy CUPS via lp command):
 *   USE_CUPS_PRINTING   — Set to "true" to use CUPS instead of IPP
 *   PRINTER_NAME        — CUPS printer name (run `lpstat -p` to list)
 */

import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PRINTER_IP        = process.env.PRINTER_IP || '';
const PRINTER_PORT      = process.env.PRINTER_PORT || '631';
const PRINTER_PATH      = process.env.PRINTER_PATH || '/ipp/print';
const PRINTER_PAPER     = process.env.PRINTER_PAPER_SIZE || 'Custom.4.25x6in';
const PRINTER_QUALITY   = parseInt(process.env.PRINTER_QUALITY || '5', 10);
const PRINTER_ORIENT    = parseInt(process.env.PRINTER_ORIENTATION || '3', 10);

const USE_CUPS          = process.env.USE_CUPS_PRINTING === 'true';
const PRINTER_NAME      = process.env.PRINTER_NAME || '';
const PRINTER_TRAY      = process.env.PRINTER_TRAY || 'Rear';
const PRINTER_MEDIA     = process.env.PRINTER_MEDIA_TYPE || 'Glossy';

export const printImage = async (imagePath: string): Promise<void> => {
  if (PRINTER_IP) {
    await printViaIPP(imagePath);
  } else if (USE_CUPS) {
    await printViaCUPS(imagePath);
  } else {
    console.log('[print] No printer configured. Stub mode — image path:', imagePath);
  }
};

// ── Direct IPP printing ──────────────────────────────────────────────────────

const printViaIPP = async (imagePath: string): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ipp = require('ipp') as any;

  const printerUrl = `http://${PRINTER_IP}:${PRINTER_PORT}${PRINTER_PATH}`;
  console.log('[print] IPP target:', printerUrl);

  const imageData = fs.readFileSync(imagePath);

  const msg = {
    'operation-attributes-tag': {
      'requesting-user-name': 'Posta Kiosk',
      'job-name': `postcard-${Date.now()}`,
      'document-format': 'image/jpeg',
    },
    'job-attributes-tag': {
      'media': PRINTER_PAPER,
      'sides': 'one-sided',
      'print-quality': PRINTER_QUALITY,
      'orientation-requested': PRINTER_ORIENT,
    },
    data: imageData,
  };

  const printer = new ipp.Printer(printerUrl);

  await new Promise<void>((resolve, reject) => {
    printer.execute('Print-Job', msg, (err: unknown, res: any) => {
      if (err) {
        reject(new Error(`IPP error: ${err instanceof Error ? err.message : String(err)}`));
        return;
      }
      const status: string = res?.['status-code'] ?? '';
      console.log('[print] IPP response status:', status);
      if (status !== 'successful-ok' && status !== 'successful-ok-ignored-or-substituted-attributes') {
        reject(new Error(`Printer rejected job: ${status}`));
        return;
      }
      const jobId = res?.['job-attributes-tag']?.['job-id'];
      console.log('[print] IPP job accepted, job-id:', jobId);
      resolve();
    });
  });
};

// ── CUPS fallback (macOS / Linux only) ──────────────────────────────────────

const printViaCUPS = async (imagePath: string): Promise<void> => {
  const opts: string[] = [];

  if (PRINTER_NAME)  opts.push(`-d "${PRINTER_NAME}"`);
  opts.push(`-o media=${PRINTER_MEDIA}`);
  opts.push(`-o InputSlot=${PRINTER_TRAY}`);
  opts.push(`-o PageSize=${PRINTER_PAPER}`);
  opts.push(`-o print-quality=${PRINTER_QUALITY}`);
  opts.push(`-o orientation-requested=${PRINTER_ORIENT}`);
  opts.push('-o fit-to-page');

  const command = `lp ${opts.join(' ')} "${imagePath}"`;
  console.log('[print] CUPS command:', command);

  const { stdout, stderr } = await execAsync(command);
  if (stderr) console.warn('[print] CUPS stderr:', stderr);
  console.log('[print] CUPS stdout:', stdout);
};
