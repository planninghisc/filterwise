/** KST(Asia/Seoul) calendar date YYYY-MM-DD for an instant (matches daily-summary day boundaries). */
export function kstCalendarYmdFromInstant(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function kstTodayYmd(): string {
  return kstCalendarYmdFromInstant(new Date())
}

/** Parse YYYY-MM-DD as KST noon to avoid boundary quirks, then add signed calendar days. */
export function addKstCalendarDays(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T12:00:00+09:00`)
  d.setDate(d.getDate() + deltaDays)
  return kstCalendarYmdFromInstant(d)
}

/** Inclusive KST day range [startYmd, endYmd] as ISO strings for DB `published_at` filter. */
export function kstDayRangeToPublishedAtFilter(startYmd: string, endYmd: string): {
  gte: string
  lte: string
} {
  return {
    gte: `${startYmd}T00:00:00+09:00`,
    lte: `${endYmd}T23:59:59.999+09:00`,
  }
}
