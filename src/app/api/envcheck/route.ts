// src/app/api/envcheck/route.ts
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic' // 캐시 막기

function hasValue(v?: string | null) {
  return !!(v && v.trim().length > 0)
}
function mask(v?: string | null) {
  if (!v) return null
  if (v.length <= 8) return '*'.repeat(v.length)
  return `${v.slice(0, 4)}...${v.slice(-4)}`
}

export async function GET(_req: Request) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null
  const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null
  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
  const KOSIS = process.env.KOSIS_API_KEY ?? null

  const checks = {
    supabaseUrl: hasValue(SUPABASE_URL) && /^https?:\/\/.+/i.test(SUPABASE_URL || ''),
    supabaseAnonKey: hasValue(SUPABASE_ANON),
    supabaseServiceRoleKey: hasValue(SUPABASE_SERVICE),
    kosisApiKey: hasValue(KOSIS),
  }

  const ok = Object.values(checks).every(Boolean)

  return NextResponse.json(
    {
      ok,
      checks,
      masked: {
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, // URL은 그대로 보여줘도 됨
        NEXT_PUBLIC_SUPABASE_ANON_KEY: mask(SUPABASE_ANON),
        SUPABASE_SERVICE_ROLE_KEY: mask(SUPABASE_SERVICE),
        KOSIS_API_KEY: mask(KOSIS),
      },
      vercel: {
        env: process.env.VERCEL_ENV ?? null,
        url: process.env.VERCEL_URL ?? null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      },
    },
    { status: ok ? 200 : 500 }
  )
}
