import OpenAI from 'openai'

// Qwen Cloud is OpenAI-compatible
export const qwen = new OpenAI({
  // A harmless placeholder keeps the app bootable for reviewers without a key.
  // Routes use isDemoMode to avoid making provider calls in this mode.
  apiKey: process.env.QWEN_API_KEY || 'storeos-demo-mode',
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
})

export const isDemoMode = process.env.STOREOS_MODE !== 'live' || !process.env.QWEN_API_KEY

// The 4 models powering StoreOS
export const MODELS = {
  // Customer message drafting, supplier emails, general text
  MAX: 'qwen-max',
  // Dispute resolution, refund decisions, ambiguous reasoning
  THINKING: process.env.QWEN_THINKING_MODEL || 'qwen3-235b-thinking',
  // Product photo → listing generation (vision + text)
  OMNI: 'qwen-omni-turbo',
  // Semantic search over orders, products, customer history
  EMBEDDING: 'text-embedding-v4',
} as const
