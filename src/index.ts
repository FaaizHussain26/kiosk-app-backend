import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { createSessionRouter } from './routes/sessionRoutes';
import { port } from './constants/environment';
import { initializeWebSocketServer, notifyStatusUpdate } from './services/websocketService';
import { updateSession } from './services/sessionService';

const app = express();
const PORT = port;
const server = createServer(app);

// -----------------------------
// Middleware
// -----------------------------

// CORS – allow frontend origins (configure via env if needed)
const allowedOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length === 1 && allowedOrigins[0] === '*' ? '*' : allowedOrigins,
    credentials: true,  
  })
);

// Skip JSON/urlencoded parsers for multipart uploads so they never touch the
// raw request stream before multer/busboy.
const jsonParser = express.json();
const urlencodedParser = express.urlencoded({ extended: true });
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  jsonParser(req, res, (err) => {
    if (err) return next(err);
    urlencodedParser(req, res, next);
  });
});

// -----------------------------
// Basic routes
// -----------------------------

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to the Kiosk App API' });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// -----------------------------
// Kiosk/session routes
// -----------------------------

app.use(createSessionRouter(PORT));

// -----------------------------
// Error handling
// -----------------------------

const isUploadParseError = (err: Error): boolean =>
  err.name === 'MulterError' ||
  err.message === 'Unexpected end of form' ||
  err.message === 'Unexpected end of file' ||
  err.message === 'Multipart: Boundary not found' ||
  err.message.startsWith('Multipart:');

const tokenFromRequest = (req: Request): string | undefined => {
  const fromParams = (req.params as { token?: string }).token;
  if (fromParams) return fromParams;
  const match = req.originalUrl?.match(/\/session\/([^/]+)\//);
  return match?.[1];
};

// req.params is scoped to the router layer that matched the route; by the time an
// error bubbles up to this app-level handler, Express has already restored req.params
// to the outer (empty) scope. Pull the token back out of the path directly instead.
const extractSessionToken = (req: Request): string | undefined =>
  req.path.match(/^\/session\/([^/]+)\/(?:image|print)\b/)?.[1];

// Must be mounted last, and must keep the 4-arg (err, req, res, next) signature
// for Express to recognize it as error-handling middleware.
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent || req.socket.destroyed) {
    console.warn(`[error] Request aborted before response could be sent: ${err.message}`);
    return;
  }

  if (isUploadParseError(err)) {
    const token = tokenFromRequest(req);
    console.warn('[upload] Parse failed', {
      message: err.message,
      method: req.method,
      url: req.originalUrl,
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length'],
      token,
    });
    if (token) {
      updateSession(token, { status: 'error' });
      notifyStatusUpdate(token, 'error', 'Upload failed');
    }
    return res.status(400).json({
      error: 'Upload was interrupted or invalid. Please try again.',
      detail: err.message,
    });
  }

  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// -----------------------------
// Initialize WebSocket Server
// -----------------------------

initializeWebSocketServer(server);

// -----------------------------
// Start server
// -----------------------------

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}/ws`);
});
