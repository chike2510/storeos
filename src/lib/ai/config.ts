import 'server-only'
import OpenAI from 'openai'

/**
 * Provider-agnostic AI configuration. Any OpenAI-compatible endpoint works:
 * Google Gemini (default), Qwen/DashScope, OpenAI, OpenRouter, Groq, etc.
 * When AI_API_KEY is empty StoreOS uses deterministic demo logic instead.
 */
export const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/'
export const DEFAULT_MODEL = 'gemini-2.5-flash'

export function aiConfig() {
  const baseURL = process.env.AI_BASE_URL || DEFAULT_BASE_URL
  const apiKey = process.env.AI_API_KEY || ''
  const model = process.env.AI_MODEL || DEFAULT_MODEL
  const visionModel = process.env.AI_VISION_MODEL || model
  return {
    baseURL,
    apiKey,
    model,
    visionModel,
    mode: (apiKey ? 'live' : 'demo') as 'live' | 'demo',
    provider: providerName(baseURL),
  }
}

export function isAIDemoMode() {
  return !process.env.AI_API_KEY
}

function providerName(baseURL: string) {
  if (baseURL.includes('generativelanguage.googleapis.com')) return 'Google Gemini'
  if (baseURL.includes('dashscope')) return 'Qwen (DashScope)'
  if (baseURL.includes('openai.com')) return 'OpenAI'
  if (baseURL.includes('openrouter')) return 'OpenRouter'
  return 'OpenAI-compatible'
}

let client: OpenAI | null = null

export function getAIClient() {
  const cfg = aiConfig()
  if (!cfg.apiKey) throw new Error('AI_API_KEY is not configured')
  if (!client) {
    client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, timeout: 45_000, maxRetries: 1 })
  }
  return client
}

/** Extract the first JSON object from a model response (tolerates ```json fences / prose). */
export function parseJSON<T = Record<string, unknown>>(raw: string | null | undefined): T | null {
  if (!raw) return null
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T
  } catch {
    return null
  }
}
