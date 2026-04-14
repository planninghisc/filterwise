// src/lib/google.ts
import { google } from 'googleapis'

export function getOAuthClient(redirectUri?: string) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env

  // redirectUri는 인자로 받거나(.env가 비어있어도 통과) .env에 있어야 함
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || (!GOOGLE_REDIRECT_URI && !redirectUri)) {
    throw new Error(
      [
        'Missing Google OAuth envs.',
        `GOOGLE_CLIENT_ID=${!!GOOGLE_CLIENT_ID}`,
        `GOOGLE_CLIENT_SECRET=${!!GOOGLE_CLIENT_SECRET}`,
        `GOOGLE_REDIRECT_URI=${GOOGLE_REDIRECT_URI || '(empty)'}`,
        `redirectUriArg=${redirectUri ? 'provided' : '(none)'}`
      ].join(' ')
    )
  }

  const finalRedirect = redirectUri ?? GOOGLE_REDIRECT_URI!

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    finalRedirect
  )
}

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
]
