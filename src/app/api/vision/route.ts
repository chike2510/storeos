import { NextRequest, NextResponse } from 'next/server'
import { qwen, MODELS } from '@/lib/qwen/client'
import { rateLimit, getClientId } from '@/lib/rate-limit'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_BASE64_LENGTH = 7_000_000 // ~5MB image, base64-inflated

export async function POST(req: NextRequest) {
  const clientId = getClientId(req)
  const { allowed } = rateLimit(`vision:${clientId}`, 10)
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, { status: 429 })
  }

  const { imageBase64, mimeType = 'image/jpeg' } = await req.json()

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 })
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json({ error: 'Image too large (max ~5MB)' }, { status: 400 })
  }

  try {
    const response = await qwen.chat.completions.create({
      model: MODELS.OMNI,
      messages: [
        {
          role: 'system',
          content: `You are a product listing generator for an e-commerce store. 
Analyze the product image and return ONLY valid JSON:
{
  "title": "compelling product title",
  "description": "detailed 2-3 sentence product description",
  "category": "product category",
  "suggestedPrice": "price range like $X - $Y",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "highlights": ["key feature 1", "key feature 2", "key feature 3"]
}
No markdown. No explanation. JSON only.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
            },
            {
              type: 'text',
              text: 'Generate a complete product listing for this item.',
            },
          ],
        },
      ],
    })

    const raw = response.choices[0].message.content || '{}'
    const listing = JSON.parse(raw.replace(/```json|```/g, '').trim())

    return NextResponse.json({
      listing,
      model: MODELS.OMNI,
    })
  } catch (error) {
    console.error('Vision error:', error)
    return NextResponse.json({ error: 'Vision processing failed' }, { status: 500 })
  }
}
