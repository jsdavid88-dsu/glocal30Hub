import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'

type TaskStatus = '진행중' | '새로' | '완료' | '블로킹'
type SectionType = 'progress' | 'issue' | 'plan' | 'misc'
type VisibilityType = 'private' | 'advisor' | 'internal' | 'project'

interface UploadedFile {
  id: string
  filename: string
  original_name: string
  content_type: string
  size: number
  url: string
}

interface AssignedTask {
  id: number
  title: string
  status: TaskStatus
  url?: string
  guide?: string
  project_id?: number
}

interface ProjectOption {
  id: number
  name: string
  code: string
}

const DRAFT_STORAGE_KEY = 'dailyWrite_draft'
const AUTOSAVE_INTERVAL = 30000 // 30 seconds

const defaultMockTasks: AssignedTask[] = [
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

const sectionOptions: { key: SectionType; label: string }[] = [
  { key: 'progress', label: '진행 상황' },
  { key: 'issue', label: '이슈/논의' },
  { key: 'plan', label: '계획' },
  { key: 'misc', label: '기타' },
]

const visibilityOptions: { key: VisibilityType; label: string }[] = [
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

// ── Small inline dropdown ──
function SmallSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { key: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' as const }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          padding: '3px 6px',
          borderRadius: 6,
          border: '1px solid #e2e8f0',
          fontSize: 11,
          color: '#475569',
          background: '#f8fafc',
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function FileAttachmentZone({
  files,
  uploading,
  onUpload,
  onRemove,
}: {
  files: UploadedFile[]
  uploading: boolean
  onUpload: (files: FileList | null) => void
  onRemove: (fileId: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    onUpload(e.dataTransfer.files)
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: '12px 16px',
          borderRadius: 8,
          border: `1.5px dashed ${dragOver ? '#4f46e5' : '#cbd5e1'}`,
          background: dragOver ? '#eef2ff' : '#f8fafc',
          cursor: 'pointer',
          transition: 'all 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { onUpload(e.target.files); e.target.value = '' }}
        />
        {uploading ? (
          <span style={{ fontSize: 12, color: '#4f46e5', fontWeight: 500 }}>업로드 중...</span>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              파일 첨부 (이미지, PDF / 최대 10MB)
            </span>
          </>
        )}
      </div>

      {/* Uploaded file previews */}
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 8 }}>
          {files.map((f) => {
            const isImage = f.content_type.startsWith('image/')
            return (
              <div
                key={f.id}
                style={{
                  position: 'relative' as const,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                  background: '#f8fafc',
                }}
              >
                {isImage ? (
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={f.url}
                      alt={f.original_name}
                      style={{
                        width: 80,
                        height: 80,
                        objectFit: 'cover' as const,
                        display: 'block',
                      }}
                    />
                  </a>
                ) : (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      flexDirection: 'column' as const,
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 80,
                      height: 80,
                      textDecoration: 'none',
                      padding: 6,
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    <span style={{
                      fontSize: 10,
                      color: '#64748b',
                      marginTop: 4,
                      maxWidth: 68,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' as const,
                      textAlign: 'center' as const,
                    }}>
                      {f.original_name}
                    </span>
                  </a>
                )}
                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(f.id) }}
                  style={{
                    position: 'absolute' as const,
                    top: 2,
                    right: 2,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    lineHeight: '18px',
                    textAlign: 'center' as const,
                    padding: 0,
                  }}
                >
                  x
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Draft shape for localStorage ──
interface DraftData {
  taskStatuses: Record<number, TaskStatus>
  taskProgress: Record<number, string>
  taskSections: Record<number, SectionType>
  taskVisibilities: Record<number, VisibilityType>
  taskProjectIds: Record<number, number | null>
  memoContent: string
  memoVisibility: string
  memoSection: SectionType
  memoProjectId: number | null
  tags: string[]
  savedAt: string // ISO string
}

export default function DailyWrite() {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  const [tasks, setTasks] = useState<AssignedTask[]>(defaultMockTasks)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [draftIndicator, setDraftIndicator] = useState<string | null>(null)
  const [showDraftRestore, setShowDraftRestore] = useState(false)

  // Per-block settings
  const [taskStatuses, setTaskStatuses] = useState<Record<number, TaskStatus>>(
    Object.fromEntries(defaultMockTasks.map((t) => [t.id, t.status]))
  )
  const [taskProgress, setTaskProgress] = useState<Record<number, string>>(
    Object.fromEntries(defaultMockTasks.map((t) => [t.id, '']))
  )
  const [taskSections, setTaskSections] = useState<Record<number, SectionType>>(
    Object.fromEntries(defaultMockTasks.map((t) => [t.id, 'progress' as SectionType]))
  )
  const [taskVisibilities, setTaskVisibilities] = useState<Record<number, VisibilityType>>(
    Object.fromEntries(defaultMockTasks.map((t) => [t.id, 'advisor' as VisibilityType]))
  )
  const [taskProjectIds, setTaskProjectIds] = useState<Record<number, number | null>>(
    Object.fromEntries(defaultMockTasks.map((t) => [t.id, null]))
  )

  // Memo block settings
  const [memoContent, setMemoContent] = useState('')
  const [memoVisibility, setMemoVisibility] = useState<VisibilityType>('advisor')
  const [memoSection, setMemoSection] = useState<SectionType>('misc')
  const [memoProjectId, setMemoProjectId] = useState<number | null>(null)

  // Tags
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  // File attachments per task and memo
  const [taskFiles, setTaskFiles] = useState<Record<number, UploadedFile[]>>({})
  const [memoFiles, setMemoFiles] = useState<UploadedFile[]>([])
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)

  // ── Fetch projects ──
  useEffect(() => {
    (async () => {
      try {
        const res: any = await api.projects.list()
        const items = Array.isArray(res) ? res : (res?.data || [])
        setProjects(items.map((p: any) => ({
          id: p.id,
          name: p.name || p.title || '',
          code: p.code || '',
        })))
      } catch {
        // Backend not available
      }
    })()
  }, [])

  // ── Fetch tasks ──
  useEffect(() => {
    (async () => {
      try {
        const apiTasks: any = await api.tasks.my()
        const items = Array.isArray(apiTasks) ? apiTasks : (apiTasks?.data || [])
        if (items.length > 0) {
          const statusMap: Record<string, TaskStatus> = {
            in_progress: '진행중', review: '진행중', '진행중': '진행중',
            todo: '새로', new: '새로', not_started: '새로', '새로': '새로', '미시작': '새로',
            done: '완료', completed: '완료', '완료': '완료',
            blocked: '블로킹', '블로킹': '블로킹',
          }
          const mapped: AssignedTask[] = items.map((t: any) => ({
            id: t.id || Math.random(),
            title: t.title || '',
            status: statusMap[t.status] || '새로',
            url: t.url || t.reference_url || undefined,
            guide: t.guide || t.description || undefined,
            project_id: t.project_id || undefined,
          }))
          setTasks(mapped)
        }
      } catch {
        // Backend not available, keep mock data
      }
    })()
  }, [])

  // Re-initialize statuses when tasks change from API
  useEffect(() => {
    setTaskStatuses(Object.fromEntries(tasks.map((t) => [t.id, t.status])))
    setTaskProgress(Object.fromEntries(tasks.map((t) => [t.id, ''])))
    setTaskSections(Object.fromEntries(tasks.map((t) => [t.id, 'progress' as SectionType])))
    setTaskVisibilities(Object.fromEntries(tasks.map((t) => [t.id, 'advisor' as VisibilityType])))
    setTaskProjectIds(Object.fromEntries(tasks.map((t) => [t.id, t.project_id ?? null])))
  }, [tasks])

  // ── Draft: check for existing draft on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (raw) {
        const draft: DraftData = JSON.parse(raw)
        // Only offer restore if draft is from today
        const draftDate = new Date(draft.savedAt).toISOString().split('T')[0]
        const todayISO = new Date().toISOString().split('T')[0]
        if (draftDate === todayISO) {
          setShowDraftRestore(true)
        } else {
          // Old draft, remove it
          localStorage.removeItem(DRAFT_STORAGE_KEY)
        }
      }
    } catch {
      // ignore
    }
  }, [])

  const restoreDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (!raw) return
      const draft: DraftData = JSON.parse(raw)
      // Restore per-task data (only for tasks that exist)
      const taskIds = new Set(tasks.map(t => t.id))
      const filteredStatuses: Record<number, TaskStatus> = {}
      const filteredProgress: Record<number, string> = {}
      const filteredSections: Record<number, SectionType> = {}
      const filteredVisibilities: Record<number, VisibilityType> = {}
      const filteredProjectIds: Record<number, number | null> = {}
      for (const t of tasks) {
        filteredStatuses[t.id] = draft.taskStatuses?.[t.id] ?? t.status
        filteredProgress[t.id] = draft.taskProgress?.[t.id] ?? ''
        filteredSections[t.id] = draft.taskSections?.[t.id] ?? 'progress'
        filteredVisibilities[t.id] = draft.taskVisibilities?.[t.id] ?? 'advisor'
        filteredProjectIds[t.id] = draft.taskProjectIds?.[t.id] ?? (t.project_id ?? null)
      }
      setTaskStatuses(filteredStatuses)
      setTaskProgress(filteredProgress)
      setTaskSections(filteredSections)
      setTaskVisibilities(filteredVisibilities)
      setTaskProjectIds(filteredProjectIds)
      setMemoContent(draft.memoContent || '')
      setMemoVisibility((draft.memoVisibility as VisibilityType) || 'advisor')
      setMemoSection(draft.memoSection || 'misc')
      setMemoProjectId(draft.memoProjectId ?? null)
      setTags(draft.tags || [])
      const savedTime = new Date(draft.savedAt)
      setDraftIndicator(`임시저장됨 ${savedTime.getHours().toString().padStart(2, '0')}:${savedTime.getMinutes().toString().padStart(2, '0')}`)
    } catch {
      // ignore
    }
    setShowDraftRestore(false)
  }, [tasks])

  const dismissDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    setShowDraftRestore(false)
  }, [])

  // Build draft data
  const buildDraft = useCallback((): DraftData => {
    return {
      taskStatuses,
      taskProgress,
      taskSections,
      taskVisibilities,
      taskProjectIds,
      memoContent,
      memoVisibility,
      memoSection,
      memoProjectId,
      tags,
      savedAt: new Date().toISOString(),
    }
  }, [taskStatuses, taskProgress, taskSections, taskVisibilities, taskProjectIds, memoContent, memoVisibility, memoSection, memoProjectId, tags])

  const saveDraftToStorage = useCallback(() => {
    try {
      const draft = buildDraft()
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
      const now = new Date()
      setDraftIndicator(`임시저장됨 ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`)
    } catch {
      // ignore
    }
  }, [buildDraft])

  // ── Auto-save every 30 seconds ──
  useEffect(() => {
    const timer = setInterval(() => {
      // Only auto-save if there's any content
      const hasContent = Object.values(taskProgress).some(v => v.trim()) || memoContent.trim()
      if (hasContent) {
        saveDraftToStorage()
      }
    }, AUTOSAVE_INTERVAL)
    return () => clearInterval(timer)
  }, [saveDraftToStorage, taskProgress, memoContent])

  const handleFileUpload = useCallback(async (files: FileList | null, target: string, taskId?: number) => {
    if (!files || files.length === 0) return
    const uploadKey = taskId !== undefined ? `task-${taskId}` : target
    setUploadingFor(uploadKey)
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          setSaveMessage(`파일 크기 초과: ${file.name} (최대 10MB)`)
          continue
        }
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
        if (!allowed.includes(file.type)) {
          setSaveMessage(`허용되지 않는 형식: ${file.name}`)
          continue
        }
        const result = await api.uploads.upload(file)
        const uploaded: UploadedFile = result as UploadedFile
        if (taskId !== undefined) {
          setTaskFiles(prev => ({
            ...prev,
            [taskId]: [...(prev[taskId] || []), uploaded],
          }))
        } else {
          setMemoFiles(prev => [...prev, uploaded])
        }
      }
    } catch {
      setSaveMessage('파일 업로드 실패')
    } finally {
      setUploadingFor(null)
    }
  }, [])

  const removeFile = useCallback((fileId: string, taskId?: number) => {
    if (taskId !== undefined) {
      setTaskFiles(prev => ({
        ...prev,
        [taskId]: (prev[taskId] || []).filter(f => f.id !== fileId),
      }))
    } else {
      setMemoFiles(prev => prev.filter(f => f.id !== fileId))
    }
  }, [])

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

  const statusToApi: Record<TaskStatus, string> = {
    '진행중': 'in_progress',
    '새로': 'not_started',
    '완료': 'done',
    '블로킹': 'blocked',
  }

  const cycleStatus = async (taskId: number) => {
    const order: TaskStatus[] = ['진행중', '완료', '블로킹']
    let nextStatus: TaskStatus = '진행중'
    setTaskStatuses((prev) => {
      const current = prev[taskId]
      const idx = order.indexOf(current)
      nextStatus = order[(idx + 1) % order.length]
      return { ...prev, [taskId]: nextStatus }
    })
    try {
      await api.tasks.updateStatus(String(taskId), statusToApi[nextStatus])
    } catch {
      // Silently ignore if backend is unavailable
    }
  }

  // ── Build blocks and save ──
  const handleSave = async (isFinal: boolean) => {
    setSaving(true)
    setSaveMessage('')
    try {
      const todayISO = new Date().toISOString().split('T')[0]
      const taskLines = tasks
        .filter(t => taskProgress[t.id]?.trim())
        .map(t => `[${taskStatuses[t.id]}] ${t.title}: ${taskProgress[t.id]}`)
      const rawContent = [...taskLines, memoContent.trim()].filter(Boolean).join('\n\n')
      const log: any = await api.daily.create({ date: todayISO, raw_content: rawContent })

      // Resolve tag names to IDs (create if needed)
      const tagIds: number[] = []
      for (const tagName of tags) {
        try {
          const created: any = await api.tags.create({ name: tagName })
          if (created?.id) tagIds.push(created.id)
        } catch {
          // Tag may already exist; try listing
          try {
            const list: any = await api.tags.list({ name: tagName })
            const items = Array.isArray(list) ? list : (list?.data || [])
            const found = items.find((t: any) => t.name === tagName)
            if (found?.id) tagIds.push(found.id)
          } catch {
            // skip
          }
        }
      }

      let blockOrder = 0
      const blocks: any[] = []
      tasks.filter(t => taskProgress[t.id]?.trim()).forEach(t => {
        const block: any = {
          content: `[${taskStatuses[t.id]}] ${t.title}\n${taskProgress[t.id]}`,
          block_order: blockOrder++,
          section: taskSections[t.id] || 'progress',
          visibility: taskVisibilities[t.id] || 'advisor',
        }
        if (taskProjectIds[t.id]) {
          block.project_id = taskProjectIds[t.id]
        }
        if (tagIds.length > 0) {
          block.tag_ids = tagIds
        }
        // Associate uploaded files
        const files = taskFiles[t.id]
        if (files && files.length > 0) {
          block.file_ids = files.map(f => f.id)
        }
        blocks.push(block)
      })
      if (memoContent.trim()) {
        const memoBlock: any = {
          content: memoContent,
          block_order: blockOrder++,
          section: memoSection,
          visibility: memoVisibility,
        }
        if (memoProjectId) {
          memoBlock.project_id = memoProjectId
        }
        if (tagIds.length > 0) {
          memoBlock.tag_ids = tagIds
        }
        if (memoFiles.length > 0) {
          memoBlock.file_ids = memoFiles.map(f => f.id)
        }
        blocks.push(memoBlock)
      }
      if (log?.id && blocks.length > 0) {
        await api.daily.createBlocks(String(log.id), blocks)
      }
      if (isFinal) {
        // Clear draft on final save
        localStorage.removeItem(DRAFT_STORAGE_KEY)
        setDraftIndicator(null)
        setSaveMessage('최종 저장 완료')
      } else {
        saveDraftToStorage()
        setSaveMessage('임시 저장 완료')
      }
    } catch {
      setSaveMessage('저장 실패 (서버 연결 확인)')
    } finally {
      setSaving(false)
    }
  }

  // Project selector options including "없음"
  const projectSelectOptions: { key: string; label: string }[] = [
    { key: '', label: '프로젝트 없음' },
    ...projects.map(p => ({ key: String(p.id), label: p.name || p.code })),
  ]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          오늘의 데일리
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <p style={{ color: '#64748b', fontSize: 15 }}>{today}</p>
          {draftIndicator && (
            <span style={{
              fontSize: 11, color: '#4f46e5', fontWeight: 500,
              padding: '2px 8px', borderRadius: 6, background: '#eef2ff',
            }}>
              {draftIndicator}
            </span>
          )}
        </div>
      </div>

      {/* Draft restore banner */}
      {showDraftRestore && (
        <div style={{
          ...cardStyle,
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fffbeb',
          border: '1px solid #fde68a',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ fontSize: 13, color: '#92400e' }}>이전에 작성하던 임시저장 데이터가 있습니다.</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={restoreDraft}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              복원
            </button>
            <button
              onClick={dismissDraft}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer',
              }}
            >
              삭제
            </button>
          </div>
        </div>
      )}

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
                {tasks.length}건 배정 / {Object.values(taskStatuses).filter((s) => s === '완료').length}건 완료
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {tasks.map((task, idx) => {
              const st = statusConfig[taskStatuses[task.id]] || statusConfig['새로']
              const isCompleted = taskStatuses[task.id] === '완료'
              return (
                <div key={task.id} style={{
                  borderBottom: idx < tasks.length - 1 ? '1px solid #f1f5f9' : 'none',
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

                    {/* Per-block selectors: project, section, visibility */}
                    {!isCompleted && (
                      <div style={{
                        display: 'flex', gap: 12, flexWrap: 'wrap' as const,
                        marginTop: 10, paddingLeft: 4,
                      }}>
                        <SmallSelect
                          label="프로젝트"
                          value={String(taskProjectIds[task.id] ?? '')}
                          options={projectSelectOptions as any}
                          onChange={(v) => setTaskProjectIds(prev => ({ ...prev, [task.id]: v ? Number(v) : null }))}
                        />
                        <SmallSelect
                          label="섹션"
                          value={taskSections[task.id] || 'progress'}
                          options={sectionOptions}
                          onChange={(v) => setTaskSections(prev => ({ ...prev, [task.id]: v as SectionType }))}
                        />
                        <SmallSelect
                          label="공개"
                          value={taskVisibilities[task.id] || 'advisor'}
                          options={visibilityOptions}
                          onChange={(v) => setTaskVisibilities(prev => ({ ...prev, [task.id]: v as VisibilityType }))}
                        />
                      </div>
                    )}
                  </div>

                  {/* Progress textarea + file attachment */}
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
                    {!isCompleted && (
                      <FileAttachmentZone
                        files={taskFiles[task.id] || []}
                        uploading={uploadingFor === `task-${task.id}`}
                        onUpload={(files) => handleFileUpload(files, 'task', task.id)}
                        onRemove={(fileId) => removeFile(fileId, task.id)}
                      />
                    )}
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
            <FileAttachmentZone
              files={memoFiles}
              uploading={uploadingFor === 'memo'}
              onUpload={(files) => handleFileUpload(files, 'memo')}
              onRemove={(fileId) => removeFile(fileId)}
            />
          </div>

          {/* Memo block selectors + Visibility + Tags */}
          <div style={{ padding: '0 28px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Per-block selectors for memo */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>
                  프로젝트
                </label>
                <select
                  value={String(memoProjectId ?? '')}
                  onChange={(e) => setMemoProjectId(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12,
                    border: '1px solid #e2e8f0', color: '#475569',
                    background: '#fff', outline: 'none', cursor: 'pointer',
                  }}
                >
                  <option value="">프로젝트 없음</option>
                  {projects.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.name || p.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>
                  섹션
                </label>
                <select
                  value={memoSection}
                  onChange={(e) => setMemoSection(e.target.value as SectionType)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12,
                    border: '1px solid #e2e8f0', color: '#475569',
                    background: '#fff', outline: 'none', cursor: 'pointer',
                  }}
                >
                  {sectionOptions.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

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
          display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 32,
        }}>
          {saveMessage && (
            <span style={{ fontSize: 13, color: saveMessage.includes('실패') ? '#be123c' : '#047857', alignSelf: 'center' }}>
              {saveMessage}
            </span>
          )}
          <button
            disabled={saving}
            onClick={() => saveDraftToStorage()}
            style={{
              padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 500,
              background: '#f1f5f9', color: '#475569', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            임시저장
          </button>
          <button
            disabled={saving}
            onClick={() => handleSave(false)}
            style={{
              padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 500,
              background: '#f1f5f9', color: '#475569', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            서버 임시저장
          </button>
          <button
            disabled={saving}
            onClick={() => handleSave(true)}
            style={{
              padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: '#4f46e5', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '저장중...' : '최종 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
