import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface ProjectOption {
  id: string
  name: string
}

interface Props {
  onCreated: () => void
  onCancel: () => void
}

export default function AnnouncementForm({ onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [projectId, setProjectId] = useState('')
  const [pinned, setPinned] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (audience === 'project') {
      api.projects.list({ limit: '100' }).then((res: any) => {
        const items = Array.isArray(res) ? res : (res?.data ?? [])
        setProjects(items.map((p: any) => ({ id: String(p.id), name: p.name })))
      }).catch(() => {})
    }
  }, [audience])

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const data: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim() || undefined,
        audience,
        pinned,
      }
      if (audience === 'project' && projectId) {
        data.project_id = projectId
      }
      if (expiresAt) {
        data.expires_at = new Date(expiresAt).toISOString()
      }
      await api.announcements.create(data)
      onCreated()
    } catch (err) {
      console.error('Failed to create announcement:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #e2e8f0',
    fontSize: 13,
    background: '#fff',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{
      padding: 14,
      background: '#f8fafc',
      borderRadius: 10,
      border: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
        {'\uC0C8 \uACF5\uC9C0 \uC791\uC131'}
      </div>

      {/* Title */}
      <input
        type="text"
        placeholder={'\uC81C\uBAA9'}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={inputStyle}
      />

      {/* Body */}
      <textarea
        placeholder={'\uB0B4\uC6A9 (\uC120\uD0DD)'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        style={{ ...inputStyle, resize: 'vertical' }}
      />

      {/* Audience */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 12, color: '#64748b', minWidth: 50 }}>{'\uB300\uC0C1'}</label>
        <select
          value={audience}
          onChange={(e) => { setAudience(e.target.value); setProjectId('') }}
          style={{ ...inputStyle, width: 'auto', flex: 1 }}
        >
          <option value="all">{'\uC804\uCCB4'}</option>
          <option value="professor">{'\uAD50\uC218'}</option>
          <option value="student">{'\uD559\uC0DD'}</option>
          <option value="project">{'\uD504\uB85C\uC81D\uD2B8'}</option>
        </select>
      </div>

      {/* Project picker */}
      {audience === 'project' && (
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          style={inputStyle}
        >
          <option value="">{'\uD504\uB85C\uC81D\uD2B8 \uC120\uD0DD...'}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}

      {/* Pinned + Expires */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
          />
          {'\uC0C1\uB2E8 \uACE0\uC815'}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#64748b' }}>{'\uB9CC\uB8CC'}</label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={{ ...inputStyle, width: 'auto' }}
          />
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            background: '#fff',
            color: '#64748b',
            cursor: 'pointer',
          }}
        >
          {'\uCDE8\uC18C'}
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !title.trim()}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            borderRadius: 6,
            background: submitting || !title.trim() ? '#94a3b8' : '#4f46e5',
            color: '#fff',
            cursor: submitting || !title.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '\uC800\uC7A5 \uC911...' : '\uACF5\uC9C0 \uB4F1\uB85D'}
        </button>
      </div>
    </div>
  )
}
