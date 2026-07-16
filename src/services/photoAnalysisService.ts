import dotenv from 'dotenv';
import sharp from 'sharp';
import { getSession, updateSession, AiRecommendation, FilterType } from './sessionService';
dotenv.config();

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
console.log('[photoAnalysis] Using OpenAI model:', openaiModel);
if (!openaiApiKey) {
  console.log(
    '[photoAnalysis] OPENAI_API_KEY is not set. Filter recommendations will fall back to defaults.'
  );
}

const ALLOWED_FILTERS: FilterType[] = ['original', 'warm', 'cool', 'pastel', 'mono', 'sepia'];
const DEFAULT_RECOMMENDATION: AiRecommendation = {
  filter: 'original',
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
};

const clampInRange = (value: unknown, min: number, max: number, fallback: number): number => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
};

const parseRecommendation = (raw: string): AiRecommendation => {
  const parsed = JSON.parse(raw);
  const filter: FilterType = ALLOWED_FILTERS.includes(parsed?.filter)
    ? parsed.filter
    : 'original';
  return {
    filter,
    brightness: clampInRange(parsed?.brightness, 50, 150, 100),
    contrast: clampInRange(parsed?.contrast, 50, 150, 100),
    saturation: clampInRange(parsed?.saturation, 0, 200, 100),
    warmth: clampInRange(parsed?.warmth, -30, 30, 0),
  };
};

const requestRecommendationFromOpenAI = async (imagePath: string): Promise<AiRecommendation> => {
  const compressed = await sharp(imagePath)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const dataUri = `data:image/jpeg;base64,${compressed.toString('base64')}`;

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
            'You are a photo editing assistant for a postcard-printing kiosk. You recommend the best-fitting filter, brightness, contrast, saturation, and warmth for a photo, similar to a Lightroom "Auto" suggestion.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Analyze this photo and recommend the best filter and adjustment values for printing it as a postcard. ' +
                'The filter MUST be exactly one of: "original", "warm", "cool", "pastel", "mono", "sepia". ' +
                'Brightness MUST be an integer between 50 and 150 (100 = neutral/unchanged). ' +
                'Contrast MUST be an integer between 50 and 150 (100 = neutral/unchanged). ' +
                'Saturation MUST be an integer between 0 and 200 (100 = neutral/unchanged, 0 = grayscale). ' +
                'Warmth MUST be an integer between -30 and 30 (0 = neutral, negative = cooler/bluer, positive = warmer). ' +
                'Respond with ONLY a JSON object in this exact shape, no other text: ' +
                '{"filter": "...", "brightness": number, "contrast": number, "saturation": number, "warmth": number, "reason": "short reason"}',
            },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
    }),
  });
console.log("response got from OpenAI:", response);
  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  console.log("OpenAI response content:", content);
  if (typeof content !== 'string') {
    throw new Error('OpenAI response missing message content');
  }

  return parseRecommendation(content);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const requestRecommendationWithRetry = async (
  imagePath: string,
  attempts = 3,
  delayMs = 700
): Promise<AiRecommendation> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await requestRecommendationFromOpenAI(imagePath);
    } catch (error) {
      lastError = error;
      console.error(`[photoAnalysis] Attempt ${attempt}/${attempts} failed:`, error);
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
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
  let fromOpenAI = false;
  console.log('[photoAnalysis] Analyzing photo for session:', token, 'imagePath:', session.imagePath);
  if (!openaiApiKey) {
    recommendation = DEFAULT_RECOMMENDATION;
  } else {
    try {
      recommendation = await requestRecommendationWithRetry(session.imagePath);
      fromOpenAI = true;
    } catch (error) {
      console.error('[photoAnalysis] All retries failed, falling back to default recommendation:', error);
      recommendation = DEFAULT_RECOMMENDATION;
    }
  }

  if (fromOpenAI) {
    updateSession(token, { aiRecommendation: recommendation });
  }
  return recommendation;
};
