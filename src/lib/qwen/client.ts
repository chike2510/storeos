import OpenAI from 'openai'

// Qwen Cloud is OpenAI-compatible
export const qwen = new OpenAI({
  apiKey: process.env.QWEN_API_KEY!,
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
})

// The 4 models powering StoreOS
export const MODELS = {
  // Customer message drafting, supplier emails, general text
  MAX: 'qwen-max',
  // Dispute resolution, refund decisions, ambiguous reasoning
  THINKING: 'qwen-max',
  // Product photo → listing generation (vision + text)
  OMNI: 'qwen-omni-turbo',
  // Semantic search over orders, products, customer history
  EMBEDDING: 'text-embedding-v4',
} as const
