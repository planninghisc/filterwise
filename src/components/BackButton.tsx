'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

type Props = {
  label?: string
  className?: string
  /** 히스토리가 없을 때 이동할 경로 (예: /data) */
  fallbackHref?: string
}

export default function BackButton({
  label = '← 뒤로가기',
  className = '',
  fallbackHref = '/data',
}: Props) {
  const router = useRouter()

  const onClick = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }, [router, fallbackHref])

  return (
    <button
      onClick={onClick}
      className={`mb-4 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 ${className}`}
      aria-label="뒤로가기"
      type="button"
    >
      {label}
    </button>
  )
}
