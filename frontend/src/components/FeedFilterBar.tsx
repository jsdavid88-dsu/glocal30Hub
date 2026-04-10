import { useEffect, useState } from 'react'
import { api } from '../api/client'

export interface FeedFilters {
  scope: 'all' | 'member' | 'project'
  authorId?: string
  projectId?: string
  q: string
}

interface MemberOption {
  id: string
  name: string
}

interface ProjectOption {
  id: string
  name: string
}

interface Props {
  value: FeedFilters
  onChange: (next: FeedFilters) => void
}

export default function FeedFilterBar({ value, onChange }: Props) {
  const [members, setMembers] = useState<MemberOption[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [qDraft, setQDraft] = useState(value.q)

  // Sync external q changes back into the input
  useEffect(() => {
    setQDraft(value.q)
  }, [value.q])

  // Load members + projects once
  useEffect(() => {
    (async () => {
      try {
        const u: any = await api.users.list({ limit: '200' })
        const items = Array.isArray(u) ? u : (u?.data ?? [])
        setMembers(items.map((m: any) => ({ id: String(m.id), name: m.name })))
      } catch {
        // ignore
      }
      try {
        const p: any = await api.projects.list({ limit: '100' })
        const items = Array.isArray(p) ? p : (p?.data ?? [])
        setProjects(items.map((pr: any) => ({ id: String(pr.id), name: pr.name })))
      } catch {
        // ignore
      }
    })()
  }, [])

  // Debounce keyword input (300ms)
  useEffect(() => {
    if (qDraft === value.q) return
    const t = setTimeout(() => {
      onChange({ ...value, q: qDraft })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft])

  const scopeButton = (s: FeedFilters['scope'], label: string) => (
    <button
      key={s}
      onClick={() =>
        onChange({
          ...value,
          scope: s,
          authorId: s === 'member' ? value.authorId : undefined,
          projectId: s === 'project' ? value.projectId : undefined,
        })
      }
      style={{
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer',
        background: value.scope === s ? '#4f46e5' : 'transparent',
        color: value.scope === s ? '#fff' : '#64748b',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: 12,
        background: '#f8fafc',
        borderRadius: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      {/* Scope toggle */}
      <div
        style={{
          display: 'inline-flex',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#fff',
        }}
      >
        {scopeButton('all', '전체')}
        {scopeButton('member', '멤버별')}
        {scopeButton('project', '프로젝트별')}
      </div>

      {/* Member dropdown */}
      {value.scope === 'member' && (
        <select
          value={value.authorId ?? ''}
          onChange={(e) => onChange({ ...value, authorId: e.target.value || undefined })}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            fontSize: 13,
            background: '#fff',
          }}
        >
          <option value="">멤버 선택...</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}

      {/* Project dropdown */}
      {value.scope === 'project' && (
        <select
          value={value.projectId ?? ''}
          onChange={(e) => onChange({ ...value, projectId: e.target.value || undefined })}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            fontSize: 13,
            background: '#fff',
          }}
        >
          <option value="">프로젝트 선택...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {/* Search input */}
      <input
        type="search"
        placeholder="🔍 키워드 검색..."
        value={qDraft}
        onChange={(e) => setQDraft(e.target.value)}
        style={{
          flex: 1,
          minWidth: 200,
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          fontSize: 13,
          background: '#fff',
        }}
      />
    </div>
  )
}
