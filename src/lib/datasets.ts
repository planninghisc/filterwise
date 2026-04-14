// src/lib/datasets.ts

// 사용 가능한 데이터셋 키
export type DatasetKey = 'hcsi' | 'unsold' | 'unsold_after'

// 각 데이터셋의 메타 정보
export const DATASETS: Record<
  DatasetKey,
  { table: string; title: string; desc: string; source: string }
> = {
  hcsi: {
    table: 'kosis_hcsi',
    title: '주택시장 소비심리지수',
    desc: '주택매매/전세 시장의 체감 심리를 수치화한 지표 (월별).',
    source: 'KOSIS',
  },
  unsold: {
    table: 'kosis_unsold',
    title: '미분양주택현황(시도/시군구)',
    desc: '지역별 미분양주택 물량 현황 (월별).',
    source: 'KOSIS',
  },
  unsold_after: {
    table: 'kosis_unsold_after',
    title: '공사완료후 미분양현황',
    desc: '준공(공사완료) 이후 발생한 미분양 물량 현황 (월별).',
    source: 'KOSIS',
  },
}

// 테이블명 선택 헬퍼
export function pickTable(dataset: DatasetKey): string {
  return DATASETS[dataset].table
}

// (옵션) 기본 내보내기
export default DATASETS
