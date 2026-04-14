export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient, CALENDAR_SCOPES } from '@/lib/google'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/google/oauth/callback`

  const oauth2Client = getOAuthClient(redirectUri)
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    prompt: 'consent',
    scope: [...CALENDAR_SCOPES, 'openid', 'email', 'profile'],
  })

  return NextResponse.redirect(authUrl)
}
