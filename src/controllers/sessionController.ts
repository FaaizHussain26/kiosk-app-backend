import { Request, Response } from 'express';
import path from 'path';
import {
  createSession,
  getSession,
  setSessionImage,
  updateSession,
} from '../services/sessionService';
import { printImage } from '../services/printService';

const getBaseUrl = (port: number | string) =>
  process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;

export const createSessionHandler = (port: number | string) => (req: Request, res: Response) => {
  const session = createSession();
  const baseUrl = getBaseUrl(port);

  const kioskUrl = `${baseUrl}/kiosk?token=${session.token}`;
  const mobileUrl = `${baseUrl}/m/session?token=${session.token}`;

  res.status(201).json({
    token: session.token,
    status: session.status,
    kioskUrl,
    mobileUrl,
  });
};

export const uploadImageHandler = (req: Request, res: Response) => {
  const { token } = req.params;
  const session = getSession(token);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  setSessionImage(token, req.file.path);

  res.json({
    message: 'Image uploaded successfully',
    status: 'image_ready',
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
    updateSession(token, { status: 'printing' });

    const imagePathToPrint = req.file?.path || session.imagePath!;
    await printImage(imagePathToPrint);

    updateSession(token, { status: 'printed' });

    res.json({
      message: 'Print job submitted',
      status: 'printed',
    });
  } catch (error) {
    console.error(error);
    updateSession(token, { status: 'error' });
    res.status(500).json({ error: 'Failed to print image' });
  }
};


