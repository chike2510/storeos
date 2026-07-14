import { Order, CustomerContext } from '@/types'

export const mockOrders: Order[] = [
  {
    id: 'ORD-001',
    customerId: 'cust-123',
    product: 'Wireless Earbuds Pro',
    amount: 89.99,
    status: 'delivered',
    date: '2026-06-28',
  },
  {
    id: 'ORD-002',
    customerId: 'cust-123',
    product: 'Phone Case Ultra',
    amount: 24.99,
    status: 'shipped',
    date: '2026-07-01',
  },
  {
    id: 'ORD-003',
    customerId: 'cust-456',
    product: 'Smart Watch Band',
    amount: 45.00,
    status: 'pending',
    date: '2026-07-02',
  },
  {
    id: 'ORD-004',
    customerId: 'cust-789',
    product: 'Laptop Stand',
    amount: 67.50,
    status: 'delivered',
    date: '2026-06-25',
  },
]

export const mockCustomers: CustomerContext[] = [
  {
    customerId: 'cust-123',
    name: 'James Okafor',
    email: 'james@example.com',
    totalOrders: 8,
    recentOrders: mockOrders.filter(o => o.customerId === 'cust-123'),
    sentimentHistory: 'positive',
  },
  {
    customerId: 'cust-456',
    name: 'Amara Diallo',
    email: 'amara@example.com',
    totalOrders: 2,
    recentOrders: mockOrders.filter(o => o.customerId === 'cust-456'),
    sentimentHistory: 'neutral',
  },
  {
    customerId: 'cust-789',
    name: 'David Chen',
    email: 'david@example.com',
    totalOrders: 15,
    recentOrders: mockOrders.filter(o => o.customerId === 'cust-789'),
    sentimentHistory: 'negative',
  },
]

// Cosine similarity for embedding search
export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
  return dot / (magA * magB)
}
