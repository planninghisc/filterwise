import { GoogleGenerativeAI } from '@google/generative-ai';

/** Prefer cost/speed; may return 503 under load — see {@link generateContentWithResilience}. */
export const GEMINI_PRIMARY_MODEL = 'gemini-3.1-flash-lite-preview';

/** Used when the primary model is overloaded or unavailable. */
export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash';

function isTransientGeminiFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b503\b/.test(msg) ||
    /\b429\b/.test(msg) ||
    /UNAVAILABLE/i.test(msg) ||
    /RESOURCE_EXHAUSTED/i.test(msg) ||
    /Service Unavailable/i.test(msg) ||
    /try again later/i.test(msg) ||
    /overloaded/i.test(msg)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retries on transient API failures, then tries the fallback model.
 */
export async function generateContentWithResilience(
  genAI: GoogleGenerativeAI,
  prompt: string,
  opts?: {
    maxAttemptsPerModel?: number;
    initialDelayMs?: number;
    /** 비어 있지 않으면 이 순서로만 호출(단일 모델 고정 가능). 미지정 시 Flash Lite → Flash 폴백. */
    modelOrder?: string[];
  }
): Promise<{ text: string; modelUsed: string }> {
  const maxAttemptsPerModel = opts?.maxAttemptsPerModel ?? 4;
  const initialDelayMs = opts?.initialDelayMs ?? 750;
  const custom = opts?.modelOrder?.filter((m) => typeof m === 'string' && m.trim().length > 0) ?? [];
  const modelOrder =
    custom.length > 0 ? custom : [GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL];
  let lastError: unknown;

  for (const modelName of modelOrder) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        return { text: result.response.text(), modelUsed: modelName };
      } catch (e) {
        lastError = e;
        if (!isTransientGeminiFailure(e)) throw e;
        if (attempt < maxAttemptsPerModel - 1) {
          await sleep(initialDelayMs * 2 ** attempt);
        }
      }
    }
  }

  throw lastError;
}
