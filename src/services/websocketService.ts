import { WebSocket, WebSocketServer } from 'ws';
import { SessionStatus } from './sessionService';

export interface WebSocketMessage {
  type: 'image_ready' | 'status_update' | 'print_status';
  sessionId: string;
  status?: SessionStatus;
  imageUrl?: string;
  message?: string;
}

// Map of sessionId -> Set of WebSocket connections
const sessionConnections = new Map<string, Set<WebSocket>>();

/**
 * Register a WebSocket connection for a specific session
 */
export const registerConnection = (sessionId: string, ws: WebSocket): void => {
  if (!sessionConnections.has(sessionId)) {
    sessionConnections.set(sessionId, new Set());
  }
  sessionConnections.get(sessionId)!.add(ws);

  // Remove connection when it closes
  ws.on('close', () => {
    const connections = sessionConnections.get(sessionId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        sessionConnections.delete(sessionId);
      }
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for session ${sessionId}:`, error);
  });

  console.log(`Client connected to session: ${sessionId} (Total connections: ${sessionConnections.get(sessionId)?.size || 0})`);
};

/**
 * Broadcast a message to all WebSocket connections for a specific session
 */
export const broadcastToSession = (sessionId: string, message: WebSocketMessage): void => {
  const connections = sessionConnections.get(sessionId);
  if (!connections || connections.size === 0) {
    console.log(`No active connections for session: ${sessionId}`);
    return;
  }

  const messageStr = JSON.stringify(message);
  let sentCount = 0;

  connections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
      sentCount++;
    } else {
      // Remove dead connections
      connections.delete(ws);
    }
  });

  console.log(`Broadcasted to ${sentCount} client(s) for session: ${sessionId}`);

  // Clean up if no connections left
  if (connections.size === 0) {
    sessionConnections.delete(sessionId);
  }
};

/**
 * Notify all clients of a session that an image is ready
 */
export const notifyImageReady = (sessionId: string, imageUrl: string): void => {
  broadcastToSession(sessionId, {
    type: 'image_ready',
    sessionId,
    imageUrl,
    status: 'image_ready',
    message: 'Image uploaded and ready for editing',
  });
};

/**
 * Notify all clients of a session about a status update
 */
export const notifyStatusUpdate = (sessionId: string, status: SessionStatus, message?: string): void => {
  broadcastToSession(sessionId, {
    type: 'status_update',
    sessionId,
    status,
    message: message || `Status updated to: ${status}`,
  });
};

/**
 * Get the number of active connections for a session
 */
export const getConnectionCount = (sessionId: string): number => {
  return sessionConnections.get(sessionId)?.size || 0;
};

/**
 * Initialize WebSocket server and handle connections
 */
export const initializeWebSocketServer = (server: any): WebSocketServer => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    console.log('New WebSocket connection');

    // Extract sessionId from query string
    let sessionId: string | null = null;
    
    if (req.url) {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      sessionId = url.searchParams.get('sessionId') || url.searchParams.get('token');
    }

    if (!sessionId) {
      console.error('WebSocket connection rejected: No sessionId provided');
      ws.close(1008, 'Session ID required');
      return;
    }

    // Register the connection
    registerConnection(sessionId, ws);

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: 'status_update',
        sessionId,
        message: 'Connected to session',
      })
    );

    // Handle incoming messages (optional - for bidirectional communication)
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`Received message from session ${sessionId}:`, message);
        // Handle client messages if needed
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
  });

  console.log('WebSocket server initialized on /ws');
  return wss;
};

