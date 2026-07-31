import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { uploadDir } from '../services/sessionService';
import {
  createSessionHandler,
  getImageHandler,
  getStatusHandler,
  printHandler,
  printStatusHandler,
  uploadImageHandler,
} from '../controllers/sessionController';
import { createPaymentIntentHandler, confirmPaymentHandler } from '../controllers/paymentController';
import { analyzePhotoHandler } from '../controllers/photoAnalysisController';
import path from 'path';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB — matches frontend validation
    files: 1,
  },
});

/** Ensure multipart requests include a boundary before multer/busboy runs. */
const requireMultipartBoundary = (req: Request, res: Response, next: NextFunction) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({
      error: 'Expected multipart/form-data upload with field name "image"',
    });
  }
  if (!/boundary=/i.test(contentType)) {
    return res.status(400).json({
      error:
        'Missing multipart boundary. Do not set Content-Type manually when uploading FormData.',
    });
  }
  next();
};

const uploadSingleImage = (req: Request, res: Response, next: NextFunction) => {
  upload.single('image')(req, res, (err: unknown) => {
    if (err) return next(err);
    next();
  });
};

/** Optional image upload for print — only runs multer when multipart is sent. */
const optionalImageUpload = (req: Request, res: Response, next: NextFunction) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  if (!/boundary=/i.test(contentType)) {
    return res.status(400).json({
      error:
        'Missing multipart boundary. Do not set Content-Type manually when uploading FormData.',
    });
  }
  uploadSingleImage(req, res, next);
};

export const createSessionRouter = (port: number | string) => {
  router.post('/session', createSessionHandler(port));
  router.post(
    '/session/:token/image',
    requireMultipartBoundary,
    uploadSingleImage,
    uploadImageHandler(port),
  );
  router.get('/session/:token/status', getStatusHandler);
  router.get('/session/:token/image', getImageHandler);

  // Stripe payment endpoints
  router.post('/session/:token/payment-intent', createPaymentIntentHandler);
  router.post('/session/:token/payment-confirm', confirmPaymentHandler);

  // Print may reuse the session image or accept an optional rendered upload
  router.post('/session/:token/print', optionalImageUpload, printHandler);

  // Status-only ping for on-device (native AirPrint) printing — no image upload
  router.post('/session/:token/print-status', printStatusHandler);

  // AI-recommended filter/brightness for the editing screen
  router.post('/session/:token/analyze-photo', analyzePhotoHandler);

  return router;
};


