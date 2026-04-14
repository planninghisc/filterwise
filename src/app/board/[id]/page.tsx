// src/app/board/[id]/page.tsx
import BoardDetailClient from './BoardDetailClient'

// Next.js 15에서는 PageProps의 params가 Promise로 올 수 있어요.
// 서버 컴포넌트에서 await 한 뒤, 클라이언트 컴포넌트로 postId를 넘깁니다.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <BoardDetailClient postId={id} />
}
