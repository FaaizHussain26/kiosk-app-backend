import express, { Request, Response } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createSessionRouter } from './routes/sessionRoutes';
import { port } from './constants/environment';
import { initializeWebSocketServer } from './services/websocketService';

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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

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
