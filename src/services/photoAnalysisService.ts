import fs from 'fs';
import dotenv from 'dotenv';
import { getSession, updateSession, AiRecommendation, FilterType } from './sessionService';
dotenv.config();

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

if (!openaiApiKey) {
  console.warn(
    '[photoAnalysis] OPENAI_API_KEY is not set. Filter recommendations will fall back to defaults.'
  );
}

const ALLOWED_FILTERS: FilterType[] = ['original', 'warm', 'cool', 'pastel', 'mono', 'sepia'];
const DEFAULT_RECOMMENDATION: AiRecommendation = { filter: 'original', brightness: 100 };

const clampBrightness = (value: unknown): number => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 100;
  return Math.min(150, Math.max(50, Math.round(num)));
};

const parseRecommendation = (raw: string): AiRecommendation => {
  const parsed = JSON.parse(raw);
  const filter: FilterType = ALLOWED_FILTERS.includes(parsed?.filter)
    ? parsed.filter
    : 'original';
  return { filter, brightness: clampBrightness(parsed?.brightness) };
};

const requestRecommendationFromOpenAI = async (imagePath: string): Promise<AiRecommendation> => {
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const dataUri = `data:image/jpeg;base64,${imageBase64}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      response_format: { type: 'json_object' },
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content:
            'You are a photo editing assistant for a postcard-printing kiosk. You recommend the best-fitting filter and brightness for a photo, similar to a Lightroom "Auto" suggestion.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Analyze this photo and recommend the best filter and brightness for printing it as a postcard. ' +
                'The filter MUST be exactly one of: "original", "warm", "cool", "pastel", "mono", "sepia". ' +
                'Brightness MUST be an integer between 50 and 150 (100 = neutral/unchanged). ' +
                'Respond with ONLY a JSON object in this exact shape, no other text: ' +
                '{"filter": "...", "brightness": number, "reason": "short reason"}',
            },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenAI response missing message content');
  }

  return parseRecommendation(content);
};

export const analyzePhotoForSession = async (token: string): Promise<AiRecommendation> => {
  console.log('getting session for token:', token);
  const session = getSession(token);
console.log('session called for token:', token, 'session:', session);
  if (!session) {
    throw new Error('Session not found');
  }
  if (!session.imagePath) {
    throw new Error('No image associated with this session');
  }

  if (session.aiRecommendation) {
    return session.aiRecommendation;
  }

  let recommendation: AiRecommendation;
  console.log('[photoAnalysis] Analyzing photo for session:', token, 'imagePath:', session.imagePath);
  if (!openaiApiKey) {
    recommendation = DEFAULT_RECOMMENDATION;
  } else {
    try {
      recommendation = await requestRecommendationFromOpenAI(session.imagePath);
    } catch (error) {
      console.error('[photoAnalysis] Falling back to default recommendation:', error);
      recommendation = DEFAULT_RECOMMENDATION;
    }
  }

  updateSession(token, { aiRecommendation: recommendation });
  return recommendation;
};
