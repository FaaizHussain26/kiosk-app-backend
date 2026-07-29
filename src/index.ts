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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

const isAbortedUploadError = (err: Error): boolean =>
  err.name === 'MulterError' ||
  err.message === 'Unexpected end of form' ||
  err.message === 'Unexpected end of file';

// Must be mounted last, and must keep the 4-arg (err, req, res, next) signature
// for Express to recognize it as error-handling middleware.
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent || req.socket.destroyed) {
    console.warn(`[error] Request aborted before response could be sent: ${err.message}`);
    return;
  }

  const { token } = req.params as { token?: string };
  if (token && isAbortedUploadError(err)) {
    updateSession(token, { status: 'error' });
    notifyStatusUpdate(token, 'error', 'Upload failed');
    console.warn(`[upload] Aborted upload for session ${token}: ${err.message}`);
    return res.status(400).json({ error: 'Upload was interrupted or invalid. Please try again.' });
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
