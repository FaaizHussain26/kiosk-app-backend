import path from 'path';
import fs from 'fs';

export type SessionStatus = 'waiting' | 'image_ready' | 'printing' | 'printed' | 'error';

export interface Session {
  token: string;
  status: SessionStatus;
  imagePath?: string;
  createdAt: Date;
}

const sessions = new Map<string, Session>();

export const generateToken = (): string =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export const uploadDir = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const createSession = (): Session => {
  const token = generateToken();
  const session: Session = {
    token,
    status: 'waiting',
    createdAt: new Date(),
  };
  sessions.set(token, session);
  return session;
};

export const getSession = (token: string): Session | undefined => {
  return sessions.get(token);
};

export const updateSession = (token: string, updates: Partial<Session>): Session | undefined => {
  const existing = sessions.get(token);
  if (!existing) return undefined;

  const updated: Session = { ...existing, ...updates };
  sessions.set(token, updated);
  return updated;
};

export const setSessionImage = (token: string, imagePath: string): Session | undefined => {
  return updateSession(token, { imagePath, status: 'image_ready' });
};


