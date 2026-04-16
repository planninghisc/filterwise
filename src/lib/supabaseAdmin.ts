// src/lib/supabaseAdmin.ts
// Lazy init: `next build` / static analysis loads API routes without env; throw only at first real use.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    const missing: string[] = []
    if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)')
    if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY')
    throw new Error(`Missing SUPABASE env vars: ${missing.join(', ')}`)
  }
  _client = createClient(url, key, { auth: { persistSession: false } })
  return _client
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, _receiver) {
    const client = getClient()
    const value = Reflect.get(client as object, prop, client)
    if (typeof value === 'function') {
      return (value as (...a: unknown[]) => unknown).bind(client)
    }
    return value
  },
}) as SupabaseClient
