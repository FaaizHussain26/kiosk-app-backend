import { Request, Response } from 'express';
import path from 'path';
import {
  createSession,
  getSession,
  setSessionImage,
  updateSession,
  SessionStatus,
} from '../services/sessionService';
import { printImage } from '../services/printService';
import { notifyImageReady, notifyStatusUpdate } from '../services/websocketService';

const getBaseUrl = (port: number | string) =>
  process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;

export const createSessionHandler = (port: number | string) => (req: Request, res: Response) => {
  const session = createSession();
  const baseUrl = getBaseUrl(port);

  const kioskUrl = `${baseUrl}/kiosk/qr?session=${session.token}`;
  const mobileUrl = `${baseUrl}/mobile/upload?session=${session.token}`;

  res.status(201).json({
    token: session.token,
    status: session.status,
    kioskUrl,
    mobileUrl,
  });
};

export const uploadImageHandler = (port: number | string) => (req: Request, res: Response) => {
  const { token } = req.params;
  const session = getSession(token as string);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  setSessionImage(token as string, req.file.path);

  const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
  const imageUrl = `${baseUrl}/session/${token}/image`;

  // Notify WebSocket clients (kiosk display) that image is ready
  notifyImageReady(token as string, imageUrl);

  res.json({
    message: 'Image uploaded successfully',
    status: 'image_ready',
    imageUrl,
  });
};

export const getStatusHandler = (req: Request, res: Response) => {
  const { token } = req.params;
  const session = getSession(token as string);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    token: session.token,
    status: session.status,
  });
};

export const getImageHandler = (req: Request, res: Response) => {
  const { token } = req.params;
  const session = getSession(token as string);

  if (!session || !session.imagePath) {
    return res.status(404).json({ error: 'Image not found for this session' });
  }

  res.sendFile(path.resolve(session.imagePath));
};

export const printHandler = async (req: Request, res: Response) => {
  const { token } = req.params;
  const session = getSession(token as string);
console.log("printing:",token)
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!session.imagePath && !req.file) {
    return res.status(400).json({ error: 'No image to print' });
  }

  updateSession(token as string, { status: 'printing' });
  notifyStatusUpdate(token as string, 'printing', 'Print job started');

  try {
    const imagePathToPrint = req.file?.path || session.imagePath!;
    await printImage(imagePathToPrint);

    updateSession(token as string, { status: 'printed' });
    notifyStatusUpdate(token as string, 'printed', 'Print job completed');

    res.json({ message: 'Print job submitted', status: 'printed' });
  } catch (error) {
    console.error('[print] Error:', error);
    updateSession(token as string, { status: 'error' });
    notifyStatusUpdate(token as string, 'error', 'Print failed');
    res.status(500).json({ error: 'Failed to print image' });
  }
};

/**
 * Lightweight status-only endpoint for on-device (native AirPrint) printing —
 * no image upload, no server-side printing. Just keeps session status and
 * WebSocket listeners in sync with what happened on the kiosk.
 */
const PRINT_STATUSES: SessionStatus[] = ['printing', 'printed', 'error'];

export const printStatusHandler = (req: Request, res: Response) => {
  const { token } = req.params;
  const { status } = req.body as { status?: SessionStatus };
  const session = getSession(token as string);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!status || !PRINT_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid print status' });
  }

  updateSession(token as string, { status });
  notifyStatusUpdate(token as string, status, `Print ${status}`);

  res.json({ status });
};


