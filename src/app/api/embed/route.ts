import { NextRequest, NextResponse } from 'next/server'
import { qwen, MODELS } from '@/lib/qwen/client'
import { mockCustomers, mockOrders, cosineSimilarity } from '@/lib/store/mock-data'
import { rateLimit, getClientId } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const clientId = getClientId(req)
  const { allowed } = rateLimit(`embed:${clientId}`)
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, { status: 429 })
  }

  const { query, extractedEntities } = await req.json()

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'No query provided' }, { status: 400 })
  }
  if (query.length > 2000) {
    return NextResponse.json({ error: 'Query too long' }, { status: 400 })
  }

  try {
    // Embed the customer query
    const embeddingResponse = await qwen.embeddings.create({
      model: MODELS.EMBEDDING,
      input: query,
    })

    const queryVector = embeddingResponse.data[0].embedding

    // Build order corpus and embed each order description
    const orderDescriptions = mockOrders.map(o =>
      `Order ${o.id}: ${o.product}, $${o.amount}, status: ${o.status}, date: ${o.date}`
    )

    const orderEmbeddings = await qwen.embeddings.create({
      model: MODELS.EMBEDDING,
      input: orderDescriptions,
    })

    // Find most relevant orders via cosine similarity
    const scoredOrders = mockOrders.map((order, i) => ({
      order,
      score: cosineSimilarity(queryVector, orderEmbeddings.data[i].embedding),
    }))

    scoredOrders.sort((a, b) => b.score - a.score)
    const topOrders = scoredOrders.slice(0, 3).map(s => s.order)

    // Match customer — by extracted name/id or pick from top orders
    let customer = mockCustomers[0] // default
    if (extractedEntities?.orderId && typeof extractedEntities.orderId === 'string') {
      const matched = mockOrders.find(o => o.id === extractedEntities.orderId)
      if (matched) {
        customer = mockCustomers.find(c => c.customerId === matched.customerId) || customer
      }
    }

    return NextResponse.json({
      customer,
      relevantOrders: topOrders,
      embeddingModel: MODELS.EMBEDDING,
    })
  } catch (error) {
    console.error('Embed error:', error)
    return NextResponse.json({ error: 'Embedding search failed' }, { status: 500 })
  }
}
