import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { supabaseUrl } from '@/lib/env'

/**
 * Service-role client. Bypasses RLS — use only in trusted server code that
 * cannot run as a user (webhooks, Shopify sync). Not used by v1 UI flows.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
