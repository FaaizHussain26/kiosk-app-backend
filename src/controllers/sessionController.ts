import { Request, Response } from 'express';
import path from 'path';
import {
  createSession,
  getSession,
  setSessionImage,
  updateSession,
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
  const session = getSession(token);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  setSessionImage(token, req.file.path);

  const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
  const imageUrl = `${baseUrl}/session/${token}/image`;

  // Notify WebSocket clients (kiosk display) that image is ready
  notifyImageReady(token, imageUrl);

  res.json({
    message: 'Image uploaded successfully',
    status: 'image_ready',
    imageUrl,
  });
};

export const getStatusHandler = (req: Request, res: Response) => {
  const { token } = req.params;
  const session = getSession(token);

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
  const session = getSession(token);

  if (!session || !session.imagePath) {
    return res.status(404).json({ error: 'Image not found for this session' });
  }

  res.sendFile(path.resolve(session.imagePath));
};

export const printHandler = async (req: Request, res: Response) => {
  const { token } = req.params;
  const session = getSession(token);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!session.imagePath && !req.file) {
    return res.status(400).json({ error: 'No image to print' });
  }

  try {
    // Update status and notify via WebSocket
    updateSession(token, { status: 'printing' });
    notifyStatusUpdate(token, 'printing', 'Print job started');

    const imagePathToPrint = req.file?.path || session.imagePath!;
    await printImage(imagePathToPrint);

    // Update status and notify via WebSocket
    updateSession(token, { status: 'printed' });
    notifyStatusUpdate(token, 'printed', 'Print job completed successfully');

    res.json({
      message: 'Print job submitted',
      status: 'printed',
    });
  } catch (error) {
    console.error(error);
    updateSession(token, { status: 'error' });
    notifyStatusUpdate(token, 'error', 'Failed to print image');
    res.status(500).json({ error: 'Failed to print image' });
  }
};


