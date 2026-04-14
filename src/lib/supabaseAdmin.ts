// src/lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const missing: string[] = []
if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)')
if (!SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')

if (missing.length) {
  throw new Error(`Missing SUPABASE env vars: ${missing.join(', ')}`)
}

export const supabaseAdmin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
