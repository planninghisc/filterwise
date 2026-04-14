'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Post = {
  id: string
  title: string
  content: string
  author: string | null
  created_at: string
  user_id: string | null
}

type Comment = {
  id: string
  post_id: string
  content: string
  author: string | null
  created_at: string
  user_id: string | null
}

type Me = { id: string } | null

export default function BoardDetailClient({ postId }: { postId: string }) {
  const router = useRouter()

  const [me, setMe] = useState<Me>(null)
  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newComment, setNewComment] = useState('')

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')

  const [editingPost, setEditingPost] = useState(false)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingContent, setEditingContent] = useState('')

  /** 현재 로그인 사용자 로드 */
  useEffect(() => {
    const loadMe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setMe(user ? { id: user.id } : null)
    }
    void loadMe()

    const { data: sub } = supabase.auth.onAuthStateChange(() => void loadMe())
    return () => sub.subscription?.unsubscribe()
  }, [])

  /** 게시글 + 댓글 로드 */
  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)

        const { data: postData, error: postErr } = await supabase
          .from('posts')
          .select('id, title, content, author, created_at, user_id')
          .eq('id', postId)
          .single()
        if (postErr) throw postErr

        const typedPost = postData as Post
        setPost(typedPost)
        setEditingTitle(typedPost.title)
        setEditingContent(typedPost.content)

        const { data: commentData, error: cErr } = await supabase
          .from('comments')
          .select('id, post_id, content, author, created_at, user_id')
          .eq('post_id', postId)
          .order('created_at', { ascending: true })
        if (cErr) throw cErr

        setComments((commentData ?? []) as Comment[])
      } catch (e) {
        const msg = e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [postId])

  /** 게시글 삭제 (RLS: 본인만 가능) */
  const handleDeletePost = async () => {
    if (!confirm('이 게시글을 삭제할까요?')) return
    const { error: delErr } = await supabase.from('posts').delete().eq('id', postId)
    if (delErr) return alert(`삭제 실패: ${delErr.message}`)
    router.push('/board')
  }

  /** 게시글 수정 저장 (RLS: 본인만 가능) */
  const handleSavePost = async () => {
    if (!editingTitle.trim() || !editingContent.trim()) {
      alert('제목과 내용을 입력하세요.')
      return
    }
    const { error: upErr } = await supabase
      .from('posts')
      .update({ title: editingTitle, content: editingContent })
      .eq('id', postId)
    if (upErr) return alert(`수정 실패: ${upErr.message}`)

    setPost((prev) => (prev ? { ...prev, title: editingTitle, content: editingContent } : prev))
    setEditingPost(false)
  }

  /** 댓글 등록 (RLS: 본인 user_id로만 삽입 허용) */
  const handleAddComment = async () => {
    const text = newComment.trim()
    if (!text) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      alert('로그인이 필요합니다.')
      return
    }

    // 표시용 author
    let author = '익명'
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    author = profile?.display_name || user.email || '익명'

    const { data, error: insErr } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: user.id, content: text, author })
      .select('*')
      .single()

    if (insErr) {
      alert(`댓글 등록 실패: ${insErr.message}`)
      return
    }

    setComments((prev) => [...prev, data as Comment])
    setNewComment('')
  }

  /** 댓글 수정 상태 진입 */
  const startEditComment = (c: Comment) => {
    if (!me || !c.user_id || me.id !== c.user_id) {
      alert('본인 댓글만 수정할 수 있습니다.')
      return
    }
    setEditingCommentId(c.id)
    setEditingCommentText(c.content)
  }
  const cancelEditComment = () => {
    setEditingCommentId(null)
    setEditingCommentText('')
  }

  /** 댓글 저장 (RLS: 본인만 가능) */
  const saveEditComment = async () => {
    if (!editingCommentId) return
    const text = editingCommentText.trim()
    if (!text) return alert('내용을 입력하세요.')

    const { error: upErr } = await supabase
      .from('comments')
      .update({ content: text })
      .eq('id', editingCommentId)
    if (upErr) return alert(`댓글 수정 실패: ${upErr.message}`)

    setComments((prev) => prev.map((c) => (c.id === editingCommentId ? { ...c, content: text } : c)))
    setEditingCommentId(null)
    setEditingCommentText('')
  }

  /** ✅ 댓글 삭제 (RLS: 본인만 가능) — 빠지면 빌드 에러 발생 */
  const handleDeleteComment = async (id: string) => {
    if (!confirm('이 댓글을 삭제할까요?')) return
    const { error: delErr } = await supabase.from('comments').delete().eq('id', id)
    if (delErr) return alert(`댓글 삭제 실패: ${delErr.message}`)
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  /** 로딩/에러 처리 */
  if (loading) return <div className="text-gray-600">불러오는 중...</div>

  if (error || !post) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">오류: {error ?? '게시글을 찾을 수 없습니다.'}</p>
        <Link href="/board" className="text-blue-600 underline">
          목록으로 돌아가기
        </Link>
      </div>
    )
  }

  /** 소유자 판별 */
  const isMyPost = !!(me?.id && post.user_id && me.id === post.user_id)

  return (
    <div className="max-w-3xl">
      {/* 🔘 상단 액션 */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link
          href="/board"
          className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
        >
          ← 목록으로
        </Link>

        {!editingPost ? (
          <>
            {isMyPost && (
              <>
                <button
                  onClick={() => setEditingPost(true)}
                  className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
                >
                  게시글 수정
                </button>
                <button
                  onClick={handleDeletePost}
                  className="px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
                >
                  게시글 삭제
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <button
              onClick={handleSavePost}
              className="px-3 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
            >
              수정 저장
            </button>
            <button
              onClick={() => {
                setEditingPost(false)
                setEditingTitle(post.title)
                setEditingContent(post.content)
              }}
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
            >
              취소
            </button>
          </>
        )}
      </div>

      {/* 게시글 */}
      {!editingPost ? (
        <article className="bg-white p-6 rounded-xl shadow border overflow-hidden">
          <h1 className="text-2xl font-bold mb-2 break-words [overflow-wrap:anywhere]">
            {post.title}
          </h1>
          <p className="text-sm text-gray-500 mb-4">
            작성자: {post.author ?? '익명'} · {new Date(post.created_at).toLocaleString('ko-KR')}
          </p>
          <div className="leading-7 break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
            {post.content}
          </div>
        </article>
      ) : (
        <div className="bg-white p-6 rounded-xl shadow border">
          <div className="mb-3">
            <label className="block text-sm mb-1">제목</label>
            <input
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              className="w-full border rounded px-3 py-2 break-words [overflow-wrap:anywhere]"
              placeholder="제목을 입력하세요"
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm mb-1">내용</label>
            <textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              className="w-full border rounded px-3 py-2 h-48 break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
              placeholder="내용을 입력하세요"
            />
          </div>
        </div>
      )}

      {/*  댓글  */}
      <section className="mt-8">
        <h2 className="text-xl font-bold mb-4">댓글 {comments.length}개</h2>

        {/* 새 댓글 입력 */}
        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="flex-1 border rounded px-3 py-2 break-words [overflow-wrap:anywhere]"
            placeholder="댓글을 입력하세요"
          />
          <button
            onClick={handleAddComment}
            className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
          >
            등록
          </button>
        </div>

        {/* 댓글 목록 */}
        <ul className="space-y-4">
          {comments.map((c) => {
            const isMyComment = !!(me?.id && c.user_id && me.id === c.user_id)
            return (
              <li key={c.id} className="bg-white p-4 rounded border overflow-hidden">
                <div className="text-sm text-gray-500 mb-2">
                  {c.author ?? '익명'} · {new Date(c.created_at).toLocaleString('ko-KR')}
                </div>

                {editingCommentId === c.id ? (
                  <>
                    <textarea
                      value={editingCommentText}
                      onChange={(e) => setEditingCommentText(e.target.value)}
                      className="w-full border rounded px-3 py-2 mb-2 break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={saveEditComment}
                        className="px-3 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
                      >
                        저장
                      </button>
                      <button
                        onClick={cancelEditComment}
                        className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
                      >
                        취소
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap leading-7 mb-2 break-words [overflow-wrap:anywhere]">
                      {c.content}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {isMyComment && (
                        <>
                          <button
                            onClick={() => startEditComment(c)}
                            className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 whitespace-nowrap text-[clamp(12px,3.5vw,14px)]"
                          >
                            삭제
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
 