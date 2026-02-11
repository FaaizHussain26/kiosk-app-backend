/**
 * Print service using CUPS (Common UNIX Printing System).
 *
 * Works on macOS and Linux. The `lp` command is used to send print jobs
 * with full control over tray, media type, paper size, and quality —
 * settings that browsers cannot configure via window.print().
 *
 * Configure via environment variables:
 *   PRINTER_NAME        — CUPS printer name (run `lpstat -p` to list printers).
 *                          If empty, uses the system default printer.
 *   PRINTER_TRAY        — Input tray, e.g. "Rear", "Front", "Auto"   (default: Rear)
 *   PRINTER_MEDIA_TYPE  — Media type, e.g. "Glossy", "Plain", "Matte" (default: Glossy)
 *   PRINTER_PAPER_SIZE  — Paper size, e.g. "4x6", "Custom.4.25x6in"  (default: 4x6)
 *   PRINTER_QUALITY     — Print quality 3=draft, 4=normal, 5=high     (default: 5)
 *   PRINTER_ORIENTATION — 3=portrait, 4=landscape                     (default: 3)
 *   USE_CUPS_PRINTING   — Set to "true" to enable CUPS; otherwise logs only (default: false)
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PRINTER_NAME = process.env.PRINTER_NAME || '';
const PRINTER_TRAY = process.env.PRINTER_TRAY || 'Rear';
const PRINTER_MEDIA_TYPE = process.env.PRINTER_MEDIA_TYPE || 'Glossy';
const PRINTER_PAPER_SIZE = process.env.PRINTER_PAPER_SIZE || '4x6';
const PRINTER_QUALITY = process.env.PRINTER_QUALITY || '5';
const PRINTER_ORIENTATION = process.env.PRINTER_ORIENTATION || '3';
const USE_CUPS = process.env.USE_CUPS_PRINTING === 'true';

export const printImage = async (imagePath: string): Promise<void> => {
  if (!USE_CUPS) {
    // Stub mode — log only (for development or when CUPS is not configured)
    console.log('[print] CUPS disabled (USE_CUPS_PRINTING != "true"). Image path:', imagePath);
    return;
  }

  // Build the CUPS `lp` command with the configured options
  const opts: string[] = [];

  if (PRINTER_NAME) {
    opts.push(`-d "${PRINTER_NAME}"`);
  }

  opts.push(`-o media=${PRINTER_MEDIA_TYPE}`);
  opts.push(`-o InputSlot=${PRINTER_TRAY}`);
  opts.push(`-o PageSize=${PRINTER_PAPER_SIZE}`);
  opts.push(`-o print-quality=${PRINTER_QUALITY}`);
  opts.push(`-o orientation-requested=${PRINTER_ORIENTATION}`);
  opts.push('-o fit-to-page');

  const command = `lp ${opts.join(' ')} "${imagePath}"`;

  console.log('[print] Executing CUPS command:', command);

  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
      console.warn('[print] CUPS stderr:', stderr);
    }
    console.log('[print] CUPS stdout:', stdout);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[print] CUPS command failed:', message);
    throw new Error(`Print failed: ${message}`);
  }
};
