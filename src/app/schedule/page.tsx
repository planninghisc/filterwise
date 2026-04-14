// src/app/schedule/page.tsx
import ScheduleClient from './schedule.client'

export const dynamic = 'force-dynamic' // 서버 캐시 방지

export default function Page() {
  return <ScheduleClient />
}
