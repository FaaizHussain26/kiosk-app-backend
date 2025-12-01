import { Router } from 'express';
import multer from 'multer';
import { uploadDir } from '../services/sessionService';
import {
  createSessionHandler,
  getImageHandler,
  getStatusHandler,
  printHandler,
  uploadImageHandler,
} from '../controllers/sessionController';
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

const upload = multer({ storage });

export const createSessionRouter = (port: number | string) => {
  router.post('/session', createSessionHandler(port));
  router.post('/session/:token/image', upload.single('image'), uploadImageHandler);
  router.get('/session/:token/status', getStatusHandler);
  router.get('/session/:token/image', getImageHandler);
  router.post('/session/:token/print', upload.single('image'), printHandler);

  return router;
};


