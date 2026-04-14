// src/app/api/google/oauth/callback/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/google'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { Credentials } from 'google-auth-library'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin

  // Google에서 에러로 돌아온 경우
  const errorParam = req.nextUrl.searchParams.get('error')
  if (errorParam) {
    return NextResponse.redirect(
      `${origin}/schedule?connected=0&error=${encodeURIComponent(errorParam)}`
    )
  }

  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(
      `${origin}/schedule?connected=0&error=missing_code`
    )
  }

  try {
    // env에 설정된 REDIRECT_URI를 사용하는 OAuth 클라이언트
    const oauth2Client = getOAuthClient()

    // code -> token 교환
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const t = tokens as Credentials

    // Supabase에 토큰 저장 (label='shared' 1행)
    const { error: upsertErr } = await supabaseAdmin
      .from('google_oauth_tokens')
      .upsert(
        {
          label: 'shared',
          access_token: t.access_token ?? null,
          refresh_token: t.refresh_token ?? null,
          scope: t.scope ?? null,
          token_type: t.token_type ?? null,
          expiry_date: t.expiry_date ?? null,
          id_token: t.id_token ?? null,
        },
        { onConflict: 'label' }
      )

    if (upsertErr) {
      return NextResponse.redirect(
        `${origin}/schedule?connected=0&error=${encodeURIComponent(
          `save_failed:${upsertErr.message}`
        )}`
      )
    }

    // 성공
    return NextResponse.redirect(`${origin}/schedule?connected=1`)
  } catch (e: unknown) {
    // Google/axios 류 에러 안전 처리 (중복 필드 제거)
    type GoogleErrData = {
      error?: string | { message?: string }
      error_description?: string
    }
    type GoogleErr = {
      message?: string
      response?: { data?: GoogleErrData }
    }

    const ge = (e as GoogleErr) ?? {}
    const data = ge.response?.data

    const msg =
      (typeof data?.error === 'string'
        ? data.error
        : data?.error?.message) ||
      data?.error_description ||
      ge.message ||
      'oauth_callback_failed'

    return NextResponse.redirect(
      `${origin}/schedule?connected=0&error=${encodeURIComponent(msg)}`
    )
  }
}
