/**
 * KRX data.krx.co.kr JSON API는 2026년 전후부터 비로그인 시 `LOGOUT`으로 응답하는 경우가 많습니다.
 * pykrx와 동일한 워밍업 + MDCCOMS001D1 로그인으로 세션 쿠키를 얻습니다.
 * @see https://github.com/sharebook-kr/pykrx/blob/master/pykrx/website/comm/auth.py
 */

const UA =
  process.env.KRX_USER_AGENT?.trim() ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const LOGIN_PAGE = 'https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001.cmd'
const LOGIN_JSP = 'https://data.krx.co.kr/contents/MDC/COMS/client/view/login.jsp?site=mdc'
const LOGIN_POST = 'https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001D1.cmd'

/** 로그인 후 getJsonData에 쓰는 Referer (pykrx webio 기본) */
export const KRX_REFERER_OUTER_LOADER =
  'https://data.krx.co.kr/contents/MDC/MDI/outerLoader/index.cmd'

export function appendCookiesFromResponse(parts: string[], res: Response) {
  const h = res.headers as Headers & { getSetCookie?: () => string[] }
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : undefined
  if (list?.length) {
    for (const line of list) {
      const nv = line.split(';')[0]?.trim()
      if (nv?.includes('=')) parts.push(nv)
    }
    return
  }
  const single = res.headers.get('set-cookie')
  if (!single) return
  for (const chunk of single.split(/,(?=[A-Za-z0-9_]+=)/)) {
    const nv = chunk.split(';')[0]?.trim()
    if (nv?.includes('=')) parts.push(nv)
  }
}

/** `name=value` 조각들을 이름 기준으로 합쳐 Cookie 헤더 한 줄로 */
export function mergeCookieParts(parts: string[]): string {
  const map = new Map<string, string>()
  for (const p of parts) {
    const i = p.indexOf('=')
    if (i > 0) map.set(p.slice(0, i).trim(), p.trim())
  }
  return [...map.values()].join('; ')
}

async function fetchWithCookies(
  url: string,
  init: RequestInit & { cookieHeader?: string },
): Promise<Response> {
  const { cookieHeader, headers: hInit, ...rest } = init
  const headers = new Headers(hInit)
  headers.set('User-Agent', UA)
  if (cookieHeader) headers.set('Cookie', cookieHeader)
  return fetch(url, { ...rest, headers, cache: 'no-store' })
}

/**
 * 환경변수 KRX_COOKIE가 있으면 그대로 사용.
 * KRX_ID + KRX_PW(또는 KRX_MBR_ID + KRX_PW)가 있으면 KRX에 로그인해 쿠키 문자열 생성.
 * 둘 다 없으면 undefined.
 */
export async function resolveKrxJsonCookieHeader(): Promise<{
  cookie: string | undefined
  /** getJsonData Referer: 로그인 세션이면 outerLoader 권장 */
  useAuthReferer: boolean
  loginError?: string
}> {
  const manual = process.env.KRX_COOKIE?.trim()
  if (manual) {
    return { cookie: manual, useAuthReferer: true }
  }

  const id = (process.env.KRX_ID ?? process.env.KRX_MBR_ID)?.trim()
  const pw = process.env.KRX_PW?.trim()
  if (!id || !pw) {
    return { cookie: undefined, useAuthReferer: false }
  }

  const parts: string[] = []

  try {
    const r1 = await fetchWithCookies(LOGIN_PAGE, { method: 'GET' })
    appendCookiesFromResponse(parts, r1)

    let c1 = mergeCookieParts(parts)
    const r2 = await fetchWithCookies(LOGIN_JSP, {
      method: 'GET',
      headers: { Referer: LOGIN_PAGE },
      cookieHeader: c1 || undefined,
    })
    appendCookiesFromResponse(parts, r2)

    const cookieBeforeLogin = mergeCookieParts(parts)

    const postLogin = async (extra: Record<string, string> = {}) => {
      const b = new URLSearchParams({
        mbrNm: '',
        telNo: '',
        di: '',
        certType: '',
        mbrId: id,
        pw,
        ...extra,
      })
      return fetch(LOGIN_POST, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          Referer: LOGIN_PAGE,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json, text/plain, */*',
          ...(cookieBeforeLogin ? { Cookie: cookieBeforeLogin } : {}),
        },
        body: b.toString(),
        cache: 'no-store',
      })
    }

    let resp = await postLogin({})
    appendCookiesFromResponse(parts, resp)
    let text = await resp.text()
    let data: { _error_code?: string; _error_message?: string } = {}
    try {
      data = JSON.parse(text) as typeof data
    } catch {
      return {
        cookie: undefined,
        useAuthReferer: false,
        loginError: `KRX 로그인 응답이 JSON이 아닙니다: ${text.slice(0, 120)}`,
      }
    }

    let code = data._error_code ?? ''
    if (code === 'CD011') {
      resp = await postLogin({ skipDup: 'Y' })
      appendCookiesFromResponse(parts, resp)
      text = await resp.text()
      try {
        data = JSON.parse(text) as typeof data
      } catch {
        return {
          cookie: undefined,
          useAuthReferer: false,
          loginError: 'KRX 중복로그인(skipDup) 처리 후 JSON 파싱 실패',
        }
      }
      code = data._error_code ?? ''
    }

    if (code === 'CD010') {
      return {
        cookie: undefined,
        useAuthReferer: false,
        loginError: 'KRX 비밀번호 변경 필요(CD010). krx.co.kr에서 변경 후 재시도하세요.',
      }
    }
    if (code !== 'CD001') {
      return {
        cookie: undefined,
        useAuthReferer: false,
        loginError: `KRX 로그인 실패: ${code} ${data._error_message ?? ''}`.trim(),
      }
    }

    const finalCookie = mergeCookieParts(parts)
    if (!finalCookie) {
      return { cookie: undefined, useAuthReferer: false, loginError: 'KRX 로그인 성공(CD001)이나 쿠키가 비었습니다.' }
    }
    return { cookie: finalCookie, useAuthReferer: true }
  } catch (e) {
    return {
      cookie: undefined,
      useAuthReferer: false,
      loginError: (e as Error).message,
    }
  }
}
