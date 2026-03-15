import { useState, useCallback, useMemo, useEffect, useRef, useId } from 'react'
import { useRole } from '../contexts/RoleContext'
import { api } from '../api/client'
import MiniCalendar from '../components/MiniCalendar'

// External can only see project-scope blocks from assigned projects
const externalAssignedProjects = ['KOCCA-2025-001', 'MOC-2025-017']

const sectionColors: Record<string, { bg: string; color: string }> = {
  '어제 한 일': { bg: '#e0e7ff', color: '#4338ca' },
  '오늘 할 일': { bg: '#d1fae5', color: '#047857' },
  '이슈/논의': { bg: '#ffe4e6', color: '#be123c' },
  '기타': { bg: '#f1f5f9', color: '#64748b' },
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}


function formatDateLabel(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${y}년 ${m}월 ${day}일 (${weekdays[d.getDay()]})`
}

// ═══════════════════════════════════════
// View Toggle
// ═══════════════════════════════════════
function ViewToggle({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      overflow: 'hidden',
      background: '#f8fafc',
    }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            background: value === opt.value ? '#4f46e5' : 'transparent',
            color: value === opt.value ? '#fff' : '#64748b',
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════
// Collapsible Project Section
// ═══════════════════════════════════════
function CollapsibleProjectSection({
  title,
  icon,
  count,
  defaultOpen = true,
  children,
}: {
  title: string
  icon?: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: '#f1f5f9',
          borderRadius: 10,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9' }}
      >
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', flex: 1 }}>{title}</span>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{count}건</span>
        <svg
          style={{
            width: 16, height: 16, color: '#94a3b8',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <div
        style={{
          overflow: 'hidden',
          maxHeight: open ? '5000px' : '0px',
          transition: 'max-height 0.35s ease',
        }}
      >
        <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// Block Comments
// ═══════════════════════════════════════
function formatTimeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}시간 전`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 7) return `${diffDays}일 전`
  return d.toLocaleDateString('ko-KR')
}

function CommentInput({
  onSubmit,
  placeholder = '댓글을 입력하세요...',
  autoFocus = false,
  onCancel,
}: {
  onSubmit: (content: string, imageUrl?: string) => Promise<void>
  placeholder?: string
  autoFocus?: boolean
  onCancel?: () => void
}) {
  const [text, setText] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputId = useId().replace(/:/g, '_') + '_file'

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [autoFocus])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    // Show local preview immediately
    const localUrl = URL.createObjectURL(file)
    setImagePreview(localUrl)
    try {
      const res: any = await api.uploads.upload(file)
      const url = res?.file_url || res?.url || ''
      setImageUrl(url)
    } catch {
      setImagePreview(null)
      setImageUrl(null)
    } finally {
      setUploading(false)
      const fileEl = document.getElementById(fileInputId) as HTMLInputElement | null
      if (fileEl) fileEl.value = ''
    }
  }

  const removeImage = () => {
    setImageUrl(null)
    setImagePreview(null)
  }

  const handleSubmit = async () => {
    if ((!text.trim() && !imageUrl) || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(text.trim(), imageUrl || undefined)
      setText('')
      setImageUrl(null)
      setImagePreview(null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape' && onCancel) {
      onCancel()
    }
  }

  const hasContent = text.trim() || imageUrl

  return (
    <div>
      {/* Image preview */}
      {imagePreview && (
        <div style={{ marginBottom: 8, position: 'relative', display: 'inline-block' }}>
          <img
            src={imagePreview}
            alt="첨부 이미지"
            style={{
              maxWidth: 160,
              maxHeight: 120,
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              objectFit: 'cover' as const,
              opacity: uploading ? 0.5 : 1,
            }}
          />
          {!uploading && (
            <button
              onClick={removeImage}
              style={{
                position: 'absolute', top: -6, right: -6,
                width: 20, height: 20, borderRadius: '50%',
                background: '#ef4444', color: '#fff', border: 'none',
                fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              x
            </button>
          )}
          {uploading && (
            <span style={{
              position: 'absolute', bottom: 4, left: 4,
              fontSize: 10, color: '#fff', background: 'rgba(0,0,0,0.5)',
              padding: '1px 6px', borderRadius: 4,
            }}>
              업로드 중...
            </span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Image attach button - label+input for reliable file picker */}
        <label
          htmlFor={fileInputId}
          title="이미지 첨부"
          style={{
            width: 32, height: 32,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid #e2e8f0', borderRadius: 8,
            background: '#f8fafc', cursor: uploading ? 'not-allowed' : 'pointer',
            color: '#94a3b8', flexShrink: 0,
            transition: 'all 0.15s',
            opacity: uploading ? 0.5 : 1,
          }}
          onMouseEnter={(e) => { if (!uploading) { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.color = '#4f46e5' } }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#94a3b8' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <input
            id={fileInputId}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
            disabled={uploading}
          />
        </label>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: '7px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            fontSize: 12,
            color: '#0f172a',
            outline: 'none',
            background: '#f8fafc',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#4f46e5' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0' }}
        />
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: '7px 10px',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              background: '#fff',
              color: '#64748b',
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap' as const,
            }}
          >
            취소
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!hasContent || submitting}
          style={{
            padding: '7px 14px',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            background: hasContent ? '#4f46e5' : '#e2e8f0',
            color: hasContent ? '#fff' : '#94a3b8',
            cursor: hasContent ? 'pointer' : 'default',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap' as const,
          }}
        >
          {submitting ? '...' : '등록'}
        </button>
      </div>
    </div>
  )
}

function SingleComment({
  comment,
  isReply = false,
  onReply,
}: {
  comment: any
  isReply?: boolean
  onReply?: (commentId: string) => void
}) {
  const avatarSize = isReply ? 20 : 24
  const fontSize = isReply ? 11 : 12

  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      ...(isReply ? { marginLeft: 32, paddingLeft: 12, borderLeft: '2px solid #e2e8f0' } : {}),
    }}>
      <div style={{
        width: avatarSize, height: avatarSize, borderRadius: '50%',
        background: isReply ? '#f1f5f9' : '#e0e7ff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
      }}>
        <span style={{ fontSize: isReply ? 9 : 10, fontWeight: 600, color: isReply ? '#64748b' : '#4338ca' }}>
          {(comment.author_name || '?').charAt(0)}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize, fontWeight: 600, color: '#1e293b' }}>
            {comment.author_name || '알 수 없음'}
          </span>
          <span style={{ fontSize: isReply ? 9 : 10, color: '#94a3b8' }}>
            {comment.created_at ? formatTimeAgo(comment.created_at) : ''}
          </span>
        </div>
        <p style={{ fontSize, color: '#475569', lineHeight: 1.6, margin: '2px 0 0' }}>
          {comment.content}
        </p>
        {/* Comment image */}
        {comment.image_url && (
          <a href={comment.image_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 6 }}>
            <img
              src={comment.image_url}
              alt="첨부 이미지"
              style={{
                maxWidth: 200,
                maxHeight: 150,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                objectFit: 'cover' as const,
                cursor: 'pointer',
              }}
            />
          </a>
        )}
        {/* Reply button (only on top-level comments) */}
        {!isReply && onReply && (
          <button
            onClick={() => onReply(comment.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              marginTop: 4, padding: '2px 6px',
              border: 'none', background: 'transparent',
              fontSize: 11, color: '#94a3b8', cursor: 'pointer',
              borderRadius: 4, transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#4f46e5'; e.currentTarget.style.background = '#f1f5f9' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 17 4 12 9 7"/>
              <path d="M20 18v-2a4 4 0 00-4-4H4"/>
            </svg>
            답글
          </button>
        )}
      </div>
    </div>
  )
}

function BlockComments({ blockId }: { blockId: string }) {
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [commentCount, setCommentCount] = useState(0)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Count includes replies
  const totalCount = useMemo(() => {
    let count = comments.length
    for (const c of comments) {
      if (c.replies) count += c.replies.length
    }
    return count
  }, [comments])

  // Fetch comments on mount
  useEffect(() => {
    if (!blockId) return
    ;(async () => {
      try {
        const data: any = await api.comments.list(blockId)
        const items = Array.isArray(data) ? data : (data?.data || [])
        setComments(items)
        let count = items.length
        for (const c of items) {
          if (c.replies) count += c.replies.length
        }
        setCommentCount(count)
      } catch {
        // API not available
      }
    })()
  }, [blockId])

  const refreshComments = async () => {
    try {
      const data: any = await api.comments.list(blockId)
      const items = Array.isArray(data) ? data : (data?.data || [])
      setComments(items)
      let count = items.length
      for (const c of items) {
        if (c.replies) count += c.replies.length
      }
      setCommentCount(count)
    } catch {
      // ignore
    }
  }

  const handleToggle = () => {
    setOpen(!open)
  }

  const handleSubmitComment = async (content: string, imageUrl?: string) => {
    await api.comments.create(blockId, { content, image_url: imageUrl })
    await refreshComments()
  }

  const handleSubmitReply = async (parentId: string, content: string, imageUrl?: string) => {
    await api.comments.create(blockId, { content, parent_id: parentId, image_url: imageUrl })
    setReplyTo(null)
    await refreshComments()
  }

  return (
    <div style={{ marginTop: 6 }}>
      {/* Comment toggle button */}
      <button
        onClick={handleToggle}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 11,
          color: totalCount > 0 ? '#4f46e5' : '#94a3b8',
          fontWeight: totalCount > 0 ? 600 : 400,
          borderRadius: 6,
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        {totalCount > 0 ? `${totalCount}` : '댓글'}
      </button>

      {/* Expanded comment section */}
      {open && (
        <div style={{
          marginTop: 8,
          padding: '14px 16px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
        }}>
          {/* Comment list */}
          {comments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, marginBottom: 14 }}>
              {comments.map((c: any) => (
                <div key={c.id}>
                  <SingleComment
                    comment={c}
                    onReply={(id) => setReplyTo(replyTo === id ? null : id)}
                  />
                  {/* Nested replies */}
                  {c.replies && c.replies.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginTop: 8 }}>
                      {c.replies.map((r: any) => (
                        <SingleComment key={r.id} comment={r} isReply />
                      ))}
                    </div>
                  )}
                  {/* Inline reply input */}
                  {replyTo === c.id && (
                    <div style={{ marginLeft: 32, marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #e0e7ff' }}>
                      <CommentInput
                        placeholder={`${c.author_name || ''}님에게 답글...`}
                        autoFocus
                        onSubmit={(content, imageUrl) => handleSubmitReply(c.id, content, imageUrl)}
                        onCancel={() => setReplyTo(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 12px' }}>아직 댓글이 없습니다.</p>
          )}

          {/* New top-level comment input */}
          <CommentInput
            onSubmit={handleSubmitComment}
            placeholder="댓글을 입력하세요..."
          />
        </div>
      )}
    </div>
  )
}

export default function DailyFeed() {
  const { currentRole } = useRole()
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 2, 12))
  const handleDaySelect = useCallback((d: Date) => setSelectedDate(d), [])
  const selectedDateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate])
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set([1, 2]))
  const [filterDate, setFilterDate] = useState('')
  const [filterAuthor, setFilterAuthor] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [feedView, setFeedView] = useState<'time' | 'project'>('time')
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [apiLoaded, setApiLoaded] = useState(false)
  const [markedDates, setMarkedDates] = useState<Record<string, 'submitted' | 'partial' | 'none'>>({})

  // Map API section enum values to Korean labels
  const sectionLabelMap: Record<string, string> = {
    yesterday: '어제 한 일',
    today: '오늘 할 일',
    issue: '이슈/논의',
    misc: '기타',
  }

  // Map API visibility enum values to Korean labels
  const visibilityLabelMap: Record<string, string> = {
    private: '나만 보기',
    advisor: '지도교수 공개',
    internal: '내부 공개',
    project: '프로젝트 공개',
  }

  // Fetch marked dates for the current month (for mini calendar)
  useEffect(() => {
    (async () => {
      try {
        const year = selectedDate.getFullYear()
        const month = selectedDate.getMonth()
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`
        const lastDate = new Date(year, month + 1, 0).getDate()
        const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`
        const monthLogs: any = await api.daily.list({ date_from: firstDay, date_to: lastDay, limit: '100' })
        const items = Array.isArray(monthLogs) ? monthLogs : (monthLogs?.data || [])
        const dateMap: Record<string, 'submitted' | 'partial' | 'none'> = {}
        for (const log of items) {
          const d = typeof log.date === 'string' ? log.date : ''
          if (d) {
            // Mark as submitted if log exists; could enhance with block count check
            dateMap[d] = 'submitted'
          }
        }
        setMarkedDates(dateMap)
      } catch {
        // Backend not available, leave empty
      }
    })()
  }, [selectedDate.getFullYear(), selectedDate.getMonth()])

  // Fetch entries for the selected date
  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
        // Use date_from and date_to to filter for a specific day
        const apiLogs: any = await api.daily.list({ date_from: dateStr, date_to: dateStr, limit: '50' })
        const items = Array.isArray(apiLogs) ? apiLogs : (apiLogs?.data || [])
        setApiLoaded(true)
        setEntries(items.map((log: any, idx: number) => {
          // Determine visibility label from the first block (or default)
          const firstBlockVisibility = log.blocks?.[0]?.visibility || 'internal'
          const visibilityLabel = visibilityLabelMap[firstBlockVisibility] || '내부 공개'
          return {
            id: log.id || idx + 1,
            author: log.author?.name || log.author_name || '',
            authorRole: log.author?.role || 'student',
            date: typeof log.date === 'string' ? log.date : dateStr,
            project: '',
            projectCode: '',
            visibility: visibilityLabel,
            isAdvisee: true,
            blocks: (log.blocks || []).map((b: any) => ({
              id: b.id || null,
              section: sectionLabelMap[b.section] || b.section || '기타',
              content: b.content || '',
              tags: (b.tags || []).map((t: any) => t.tag?.name || t.name || ''),
            })),
          }
        }))
      } catch {
        // Backend not available, show empty
        setEntries([])
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedDate])

  const toggleEntry = (id: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Role-based entry filtering
  const roleFilteredEntries = entries.filter((entry) => {
    if (currentRole === 'professor') {
      // Professor sees advisee dailies
      return true
    }
    if (currentRole === 'student') {
      // Student sees own + project-shared
      return entry.authorRole === 'self' || entry.visibility === '프로젝트 공개'
    }
    if (currentRole === 'external') {
      // External sees only project-scope blocks from assigned projects
      return entry.visibility === '프로젝트 공개' && externalAssignedProjects.includes(entry.projectCode || '')
    }
    return true
  })

  const filteredEntries = roleFilteredEntries.filter((entry) => {
    if (filterDate && entry.date !== filterDate) return false
    if (filterAuthor && entry.author !== filterAuthor) return false
    if (filterProject && entry.projectCode !== filterProject) return false
    if (filterSection && !entry.blocks.some((b) => b.section === filterSection)) return false
    return true
  })

  // Group entries by project
  const projectGroupedEntries = useMemo(() => {
    const groups: { project: string; projectCode: string; entries: typeof filteredEntries }[] = []
    const projectMap = new Map<string, typeof filteredEntries>()
    const projectNames = new Map<string, string>()

    for (const entry of filteredEntries) {
      const code = entry.projectCode || '__none__'
      const name = entry.project || '프로젝트 없음'
      if (!projectMap.has(code)) {
        projectMap.set(code, [])
        projectNames.set(code, name)
      }
      projectMap.get(code)!.push(entry)
    }

    // Named projects first, then unassigned
    for (const [code, entries] of projectMap) {
      if (code !== '__none__') {
        groups.push({ project: projectNames.get(code)!, projectCode: code, entries })
      }
    }
    if (projectMap.has('__none__')) {
      groups.push({ project: '프로젝트 없음', projectCode: '__none__', entries: projectMap.get('__none__')! })
    }

    return groups
  }, [filteredEntries])

  // Build author options from visible entries
  const visibleAuthors = [...new Set(roleFilteredEntries.map(e => e.author))]
  const visibleProjects = [...new Set(roleFilteredEntries.map(e => ({ code: e.projectCode || '', name: e.project || '' })).filter(p => p.code).map(p => JSON.stringify(p)))].map(p => JSON.parse(p))

  const roleDescription: Record<string, string> = {
    professor: '지도학생들의 연구 활동을 확인합니다.',
    student: '내 데일리와 프로젝트 공유 항목을 확인합니다.',
    external: '참여 프로젝트의 공개 활동을 확인합니다.',
  }

  // Render a single entry card
  const renderEntryCard = (entry: typeof entries[0], i: number) => {
    const expanded = expandedEntries.has(entry.id)
    const visibleBlocks = currentRole === 'external'
      ? entry.blocks.filter(b => b.section !== '기타')
      : entry.blocks

    return (
      <div
        key={entry.id}
        className={`opacity-0 animate-fade-in stagger-${Math.min(i + 2, 6)}`}
        style={{ ...cardStyle, overflow: 'hidden' }}
      >
        {/* Entry Header */}
        <div
          onClick={() => toggleEntry(entry.id)}
          style={{
            padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{entry.author.charAt(0)}</span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{entry.author}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{entry.date}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {entry.project && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                    background: '#f1f5f9', color: '#475569',
                  }}>
                    {entry.project}
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{entry.visibility}</span>
              </div>
            </div>
          </div>
          <svg
            style={{
              width: 18, height: 18, color: '#94a3b8', transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Entry Blocks */}
        {expanded && (
          <div style={{ padding: '0 24px 20px' }}>
            {visibleBlocks.map((block, bi) => {
              const sc = sectionColors[block.section] || sectionColors['기타']
              return (
                <div key={block.id || bi} style={{
                  padding: '14px 16px', borderRadius: 10, marginTop: 8,
                  background: '#f8fafc', border: '1px solid #f1f5f9',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: sc.bg, color: sc.color,
                    }}>
                      {block.section}
                    </span>
                    {block.tags.map((tag) => (
                      <span key={tag} style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500,
                        background: '#e2e8f0', color: '#64748b',
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.7 }}>{block.content}</p>

                  {/* Attachment previews */}
                  {block.attachments && block.attachments.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 10 }}>
                      {block.attachments.map((att: any) => {
                        const isImage = (att.file_type || att.content_type || '').startsWith('image/')
                        const fileUrl = att.file_url || att.url || ''
                        const fileName = att.file_name || att.original_name || 'file'
                        return (
                          <div key={att.id} style={{
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                            overflow: 'hidden',
                            background: '#fff',
                          }}>
                            {isImage ? (
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={fileUrl}
                                  alt={fileName}
                                  style={{
                                    width: 100,
                                    height: 100,
                                    objectFit: 'cover' as const,
                                    display: 'block',
                                  }}
                                />
                              </a>
                            ) : (
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '8px 12px',
                                  textDecoration: 'none',
                                  fontSize: 12,
                                  color: '#4f46e5',
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                  <polyline points="14 2 14 8 20 8"/>
                                </svg>
                                <span style={{
                                  maxWidth: 120,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap' as const,
                                }}>
                                  {fileName}
                                </span>
                              </a>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {block.id && <BlockComments blockId={block.id} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div key={currentRole} className="daily-feed-root" style={{ maxWidth: 1160, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 12 }} className="animate-fade-in">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
            데일리 피드
          </h1>
          <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
            {roleDescription[currentRole]}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ViewToggle
            options={[
              { value: 'time', label: '시간순' },
              { value: 'project', label: '프로젝트별' },
            ]}
            value={feedView}
            onChange={(v) => setFeedView(v as 'time' | 'project')}
          />
          {currentRole === 'student' && (
            <a href="/daily/write" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: '#4f46e5', color: '#fff', textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
            }}>
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              새 글 작성
            </a>
          )}
        </div>
      </div>

      {/* Main content + sidebar layout */}
      <div className="daily-feed-layout" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Left: main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Selected date label */}
          <div className="opacity-0 animate-fade-in stagger-1" style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 16,
            padding: '10px 16px',
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{selectedDateLabel}</span>
          </div>

          {/* Filter Bar */}
          <div className="opacity-0 animate-fade-in stagger-1" style={{
            ...cardStyle, padding: '16px 20px', marginBottom: 20,
            display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'flex-end',
          }}>
            <FilterSelect label="날짜" value={filterDate} onChange={setFilterDate} options={[
              { value: '', label: '전체' },
              ...[...new Set(roleFilteredEntries.map(e => e.date))].sort().reverse().map(d => ({ value: d, label: d })),
            ]} />
            {currentRole === 'professor' && (
              <FilterSelect label="학생" value={filterAuthor} onChange={setFilterAuthor} options={[
                { value: '', label: '전체' },
                ...visibleAuthors.map(a => ({ value: a, label: a })),
              ]} />
            )}
            <FilterSelect label="과제" value={filterProject} onChange={setFilterProject} options={[
              { value: '', label: '전체' },
              ...visibleProjects.map((p: { code: string; name: string }) => ({ value: p.code, label: p.name })),
            ]} />
            <FilterSelect label="섹션" value={filterSection} onChange={setFilterSection} options={[
              { value: '', label: '전체' },
              { value: '어제 한 일', label: '어제 한 일' },
              { value: '오늘 할 일', label: '오늘 할 일' },
              { value: '이슈/논의', label: '이슈/논의' },
              { value: '기타', label: '기타' },
            ]} />
          </div>

          {/* Feed Entries */}
          {loading ? (
            <div style={{ textAlign: 'center' as const, padding: 60, color: '#94a3b8' }}>
              <p style={{ fontSize: 15 }}>로딩 중...</p>
            </div>
          ) : feedView === 'time' ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              {filteredEntries.map((entry, i) => renderEntryCard(entry, i))}

              {filteredEntries.length === 0 && (
                <div style={{ textAlign: 'center' as const, padding: 60, color: '#94a3b8' }}>
                  <p style={{ fontSize: 15 }}>{apiLoaded ? '아직 데일리가 없습니다.' : '조건에 맞는 항목이 없습니다.'}</p>
                </div>
              )}
            </div>
          ) : (
            <div>
              {projectGroupedEntries.length === 0 && (
                <div style={{ textAlign: 'center' as const, padding: 60, color: '#94a3b8' }}>
                  <p style={{ fontSize: 15 }}>{apiLoaded ? '아직 데일리가 없습니다.' : '조건에 맞는 항목이 없습니다.'}</p>
                </div>
              )}
              {projectGroupedEntries.map((group) => (
                <CollapsibleProjectSection
                  key={group.projectCode}
                  title={group.project}
                  icon={group.projectCode === '__none__' ? undefined : '\uD83D\uDCC1'}
                  count={group.entries.length}
                  defaultOpen={true}
                >
                  {group.entries.map((entry, i) => renderEntryCard(entry, i))}
                </CollapsibleProjectSection>
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar: MiniCalendar */}
        <div className="daily-feed-sidebar opacity-0 animate-fade-in stagger-1" style={{ flexShrink: 0 }}>
          <MiniCalendar
            mode="day"
            selectedDate={selectedDate}
            onSelect={handleDaySelect}
            markedDates={markedDates}
          />
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .daily-feed-layout {
            flex-direction: column-reverse !important;
          }
          .daily-feed-sidebar {
            align-self: center;
          }
        }
      `}</style>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ minWidth: 140 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4 }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '6px 10px', borderRadius: 8,
          border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a',
          background: '#fff', outline: 'none', cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
