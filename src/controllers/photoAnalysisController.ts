import { Request, Response } from 'express';
import { getSession } from '../services/sessionService';
import { analyzePhotoForSession } from '../services/photoAnalysisService';

export const analyzePhotoHandler = async (req: Request, res: Response) => {
  const { token } = req.params;
console.log("analyzePhotoHandler called with token:", token);
  const session = getSession(token as string);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (!session.imagePath) {
    return res.status(400).json({ error: 'No image associated with this session' });
  }
console.log("Session found, analyzing photo at path:", session.imagePath);
  try {
    const recommendation = await analyzePhotoForSession(token as string);
    console.log("Photo analysis recommendation:", recommendation);
    return res.json(recommendation);
  } catch (error) {
    // A failed suggestion should never block editing — fall back to defaults.
    console.log('[photoAnalysis] Unexpected error, returning default recommendation:', error);
    return res.json({ filter: 'original', brightness: 100 });
  }
};
