import { useState } from 'react'

type TaskStatus = '진행중' | '새로' | '완료' | '블로킹'

interface AssignedTask {
  id: number
  title: string
  status: TaskStatus
  url?: string
  guide?: string
}

const mockTasks: AssignedTask[] = [
  {
    id: 1,
    title: 'GAN 기반 이미지 합성 논문 리뷰',
    status: '진행중',
    url: 'https://arxiv.org/abs/2406.12345',
    guide: 'Section 3의 loss function 중심으로',
  },
  {
    id: 2,
    title: 'StyleGAN3 벤치마크 테스트',
    status: '새로',
    url: 'https://github.com/NVlabs/stylegan3',
    guide: 'FID score 비교',
  },
  {
    id: 3,
    title: '데이터셋 전처리 스크립트',
    status: '완료',
  },
]

const statusConfig: Record<TaskStatus, { bg: string; color: string }> = {
  '진행중': { bg: '#e0e7ff', color: '#4338ca' },
  '새로': { bg: '#d1fae5', color: '#047857' },
  '완료': { bg: '#f1f5f9', color: '#64748b' },
  '블로킹': { bg: '#ffe4e6', color: '#be123c' },
}

const visibilityOptions = [
  { key: 'private', label: '나만 보기' },
  { key: 'advisor', label: '지도교수 공개' },
  { key: 'internal', label: '내부 공개' },
  { key: 'project', label: '프로젝트 공개' },
]

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

export default function DailyWrite() {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  const [taskStatuses, setTaskStatuses] = useState<Record<number, TaskStatus>>(
    Object.fromEntries(mockTasks.map((t) => [t.id, t.status]))
  )
  const [taskProgress, setTaskProgress] = useState<Record<number, string>>(
    Object.fromEntries(mockTasks.map((t) => [t.id, '']))
  )
  const [memoContent, setMemoContent] = useState('')
  const [memoVisibility, setMemoVisibility] = useState('advisor')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  const handleAddTag = () => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const cycleStatus = (taskId: number) => {
    const order: TaskStatus[] = ['진행중', '완료', '블로킹']
    setTaskStatuses((prev) => {
      const current = prev[taskId]
      const idx = order.indexOf(current)
      const next = order[(idx + 1) % order.length]
      return { ...prev, [taskId]: next }
    })
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          오늘의 데일리
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>{today}</p>
      </div>

      <div style={{ display: 'grid', gap: 24 }}>
        {/* Assigned Tasks Section */}
        <div className="opacity-0 animate-fade-in stagger-1" style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{
            padding: '20px 28px', borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>이번 주 배정 태스크</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                {mockTasks.length}건 배정 / {Object.values(taskStatuses).filter((s) => s === '완료').length}건 완료
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {mockTasks.map((task, idx) => {
              const st = statusConfig[taskStatuses[task.id]]
              const isCompleted = taskStatuses[task.id] === '완료'
              return (
                <div key={task.id} style={{
                  borderBottom: idx < mockTasks.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}>
                  {/* Task card header */}
                  <div style={{
                    padding: '20px 28px 0',
                    opacity: isCompleted ? 0.6 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <button
                            onClick={() => cycleStatus(task.id)}
                            style={{
                              padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                              background: st.bg, color: st.color,
                              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                            }}
                          >
                            {taskStatuses[task.id]}
                          </button>
                          <span style={{
                            fontSize: 15, fontWeight: 600, color: '#0f172a',
                            textDecoration: isCompleted ? 'line-through' : 'none',
                          }}>
                            {task.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
                          {task.url && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <svg style={{ width: 14, height: 14, color: '#94a3b8', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                              <a
                                href={task.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 13, color: '#4f46e5', textDecoration: 'none' }}
                              >
                                {task.url}
                              </a>
                            </div>
                          )}
                          {task.guide && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                              <svg style={{ width: 14, height: 14, color: '#94a3b8', flexShrink: 0, marginTop: 1 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                                {task.guide}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress textarea */}
                  <div style={{ padding: '12px 28px 20px' }}>
                    <textarea
                      value={taskProgress[task.id]}
                      onChange={(e) => setTaskProgress((prev) => ({ ...prev, [task.id]: e.target.value }))}
                      placeholder={isCompleted ? '완료된 태스크입니다.' : '오늘 이 태스크에 대한 진행상황을 기록하세요...'}
                      disabled={isCompleted}
                      style={{
                        width: '100%', minHeight: 80, padding: '12px 16px',
                        borderRadius: 10, border: '1px solid #e2e8f0',
                        fontSize: 13, color: '#0f172a', lineHeight: 1.7,
                        outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit',
                        background: isCompleted ? '#f8fafc' : '#fff',
                        transition: 'border-color 0.15s',
                      }}
                      onFocus={(e) => { if (!isCompleted) e.currentTarget.style.borderColor = '#4f46e5' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Misc Memo Section */}
        <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{
            padding: '20px 28px', borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>기타 메모</h3>
          </div>

          <div style={{ padding: '16px 28px' }}>
            <textarea
              value={memoContent}
              onChange={(e) => setMemoContent(e.target.value)}
              placeholder="태스크와 무관한 메모, 아이디어, 논의사항 등을 자유롭게 기록하세요..."
              style={{
                width: '100%', minHeight: 120, padding: '14px 16px',
                borderRadius: 10, border: '1px solid #e2e8f0',
                fontSize: 13, color: '#0f172a', lineHeight: 1.7,
                outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit',
                background: '#fff', transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#4f46e5' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0' }}
            />
          </div>

          {/* Visibility + Tags */}
          <div style={{ padding: '0 28px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Visibility */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>
                공개 범위
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                {visibilityOptions.map((v) => {
                  const active = memoVisibility === v.key
                  return (
                    <button
                      key={v.key}
                      onClick={() => setMemoVisibility(v.key)}
                      style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                        border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                        background: active ? '#4f46e5' : '#f1f5f9',
                        color: active ? '#fff' : '#475569',
                      }}
                    >
                      {v.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>
                태그
              </label>
              {tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 8 }}>
                  {tags.map((tag) => (
                    <span key={tag} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                      background: '#e0e7ff', color: '#4338ca',
                    }}>
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#4338ca', fontSize: 13, lineHeight: 1, padding: 0,
                        }}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="태그 입력 후 Enter..."
                  style={{
                    flex: 1, padding: '6px 12px', borderRadius: 8,
                    border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none',
                  }}
                />
                <button
                  onClick={handleAddTag}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                    background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer',
                  }}
                >
                  추가
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="opacity-0 animate-fade-in stagger-3" style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end', paddingBottom: 32,
        }}>
          <button style={{
            padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 500,
            background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer',
          }}>
            임시저장
          </button>
          <button style={{
            padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
          }}>
            최종 저장
          </button>
        </div>
      </div>
    </div>
  )
}
