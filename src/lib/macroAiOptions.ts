import {
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
} from '@/lib/geminiGenerate'

/** 대시보드·API에서 공통으로 쓰는 Gemini 호출 옵션 */
export const MACRO_GEMINI_MODEL_OPTIONS = [
  {
    id: 'auto',
    label: '자동 (Flash Lite → Flash 폴백)',
    description: '부하 시 저비용 모델에서 자동 전환',
    modelOrder: undefined as string[] | undefined,
  },
  {
    id: 'primary_only',
    label: `고정: ${GEMINI_PRIMARY_MODEL}`,
    description: '폴백 없이 Flash Lite만',
    modelOrder: [GEMINI_PRIMARY_MODEL],
  },
  {
    id: 'fallback_only',
    label: `고정: ${GEMINI_FALLBACK_MODEL}`,
    description: '폴백 없이 Flash 2.5만',
    modelOrder: [GEMINI_FALLBACK_MODEL],
  },
] as const

export type MacroGeminiModelOptionId = (typeof MACRO_GEMINI_MODEL_OPTIONS)[number]['id']

export function macroModelOrderFromId(id: string | undefined): string[] | undefined {
  const opt = MACRO_GEMINI_MODEL_OPTIONS.find((o) => o.id === id)
  const order = opt?.modelOrder
  return order != null && order.length > 0 ? [...order] : undefined
}
