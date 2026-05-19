/**
 * Print service — raw TCP socket printing (AppSocket / JetDirect, port 9100).
 *
 * Most network photo printers accept raw data on port 9100 via a plain TCP
 * connection. No extra packages needed — uses Node's built-in `net` module.
 *
 * Configure via environment variables:
 *   PRINTER_IP    — IP address of the printer (required)
 *   PRINTER_PORT  — TCP port (default: 9100)
 *
 * Fallback (legacy CUPS via lp command):
 *   USE_CUPS_PRINTING — Set to "true" to use CUPS instead of raw socket
 *   PRINTER_NAME      — CUPS printer name (run `lpstat -p` to list)
 */

import * as fs from 'fs';
import * as net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PRINTER_IP    = process.env.PRINTER_IP || '';
const PRINTER_PORT  = parseInt(process.env.PRINTER_PORT || '9100', 10);

const USE_CUPS      = process.env.USE_CUPS_PRINTING === 'true';
const PRINTER_NAME  = process.env.PRINTER_NAME || '';
const PRINTER_TRAY  = process.env.PRINTER_TRAY || 'Rear';
const PRINTER_MEDIA = process.env.PRINTER_MEDIA_TYPE || 'Glossy';
const PRINTER_PAPER = process.env.PRINTER_PAPER_SIZE || 'Custom.4.25x6in';
const PRINTER_QUALITY  = process.env.PRINTER_QUALITY || '5';
const PRINTER_ORIENT   = process.env.PRINTER_ORIENTATION || '3';

export const printImage = async (imagePath: string): Promise<void> => {
  if (PRINTER_IP) {
    await printViaSocket(imagePath);
  } else if (USE_CUPS) {
    await printViaCUPS(imagePath);
  } else {
    console.log('[print] No printer configured. Stub mode — image path:', imagePath);
  }
};

// ── Raw TCP socket printing (AppSocket / JetDirect) ──────────────────────────

const printViaSocket = (imagePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const imageData = fs.readFileSync(imagePath);

    console.log(`[print] Connecting to socket://${PRINTER_IP}:${PRINTER_PORT}`);

    const socket = new net.Socket();
    const TIMEOUT_MS = 30_000;

    const cleanup = (err?: Error) => {
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(TIMEOUT_MS);

    socket.connect(PRINTER_PORT, PRINTER_IP, () => {
      console.log('[print] Socket connected — sending image data...');
      socket.write(imageData, (writeErr) => {
        if (writeErr) {
          cleanup(new Error(`Socket write error: ${writeErr.message}`));
          return;
        }
        socket.end();
      });
    });

    socket.on('close', () => {
      console.log('[print] Socket closed — job sent successfully');
      resolve();
    });

    socket.on('timeout', () => {
      cleanup(new Error(`Socket timed out after ${TIMEOUT_MS / 1000}s`));
    });

    socket.on('error', (err) => {
      cleanup(new Error(`Socket error: ${err.message}`));
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
