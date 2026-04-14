// src/app/protected/page.tsx
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation' // ✅ redirect import 추가

export default async function ProtectedPage() {
  const supabase = createServerComponentClient({ cookies })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login') // ✅ 이제 정상 작동
  }

  return <div>로그인된 사용자만 볼 수 있는 페이지입니다</div>
}
