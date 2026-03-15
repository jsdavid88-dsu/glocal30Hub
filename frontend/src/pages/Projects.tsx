import { useState, useEffect, useCallback } from 'react'
import { useRole } from '../contexts/RoleContext'
import { api } from '../api/client'

type Status = '진행중' | '일시중단' | '계획중' | '완료'

type ProjectRow = {
  id: string
  name: string
  code: string
  description: string
  status: Status
  progress: number
  pi: string
  team: number
  deadline: string
}

type ProjectMember = {
  id: string
  name: string
  email: string
  project_role: string
}

type TaskItem = {
  id: string
  title: string
  status: string
  priority: string
  assignees?: { user_name: string }[]
}

const statusTabs: { label: string; value: Status | 'all' }[] = [
  { label: '전체', value: 'all' },
  { label: '진행중', value: '진행중' },
  { label: '계획중', value: '계획중' },
  { label: '일시중단', value: '일시중단' },
  { label: '완료', value: '완료' },
]

const statusBadge: Record<Status, { bg: string; color: string }> = {
  '진행중': { bg: '#e0e7ff', color: '#4338ca' },
  '일시중단': { bg: '#fef3c7', color: '#b45309' },
  '계획중': { bg: '#f1f5f9', color: '#64748b' },
  '완료': { bg: '#d1fae5', color: '#047857' },
}

const taskStatusLabel: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: '대기', bg: '#f1f5f9', color: '#64748b' },
  in_progress: { label: '진행중', bg: '#e0e7ff', color: '#4338ca' },
  done: { label: '완료', bg: '#d1fae5', color: '#047857' },
  blocked: { label: '차단', bg: '#fee2e2', color: '#dc2626' },
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

export default function Projects() {
  const { currentRole } = useRole()
  const [activeTab, setActiveTab] = useState<Status | 'all'>('all')
  const [search, setSearch] = useState('')
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<Record<string, { members: ProjectMember[]; tasks: TaskItem[]; loading: boolean }>>({})

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true)
      const res: any = await api.projects.list()
      const items: any[] = res?.data || []

      const statusMap: Record<string, Status> = {
        active: '진행중', in_progress: '진행중',
        paused: '일시중단',
        planning: '계획중',
        completed: '완료', done: '완료',
      }

      // Build initial project rows with enriched fields where available
      const rows: ProjectRow[] = items.map((p: any) => {
        const taskDone = p.task_done ?? 0
        const taskTotal = p.task_total ?? 0
        const progress = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0

        return {
          id: p.id || '',
          name: p.name || '',
          code: p.code || '',
          description: p.description || '',
          status: (statusMap[p.status] || '진행중') as Status,
          progress,
          pi: '',
          team: p.member_count ?? 0,
          deadline: p.end_date || '',
        }
      })

      // Fetch PI for each project in parallel
      const piResults = await Promise.allSettled(
        rows.map(async (row) => {
          if (!row.id) return { id: row.id, pi: '' }
          try {
            const membersRes: any = await api.projects.members(row.id)
            const members: any[] = membersRes?.data || membersRes || []
            const lead = members.find((m: any) => m.project_role === 'lead')
            return { id: row.id, pi: lead?.name || lead?.user_name || '' }
          } catch {
            return { id: row.id, pi: '' }
          }
        })
      )

      // Merge PI into rows
      const piMap: Record<string, string> = {}
      piResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          piMap[result.value.id] = result.value.pi
        }
      })

      const enrichedRows = rows.map((row) => ({
        ...row,
        pi: piMap[row.id] || '',
      }))

      setProjects(enrichedRows)
    } catch {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleRowClick = async (projectId: string) => {
    if (expandedId === projectId) {
      setExpandedId(null)
      return
    }

    setExpandedId(projectId)

    // If already loaded, don't refetch
    if (detailData[projectId] && !detailData[projectId].loading) return

    setDetailData((prev) => ({
      ...prev,
      [projectId]: { members: [], tasks: [], loading: true },
    }))

    try {
      const [membersRes, tasksRes] = await Promise.allSettled([
        api.projects.members(projectId),
        api.tasks.listByProject(projectId),
      ])

      const members: ProjectMember[] = (() => {
        if (membersRes.status === 'fulfilled') {
          const data = (membersRes.value as any)?.data || membersRes.value || []
          return Array.isArray(data) ? data : []
        }
        return []
      })()

      const tasks: TaskItem[] = (() => {
        if (tasksRes.status === 'fulfilled') {
          const data = (tasksRes.value as any)?.data || tasksRes.value || []
          return Array.isArray(data) ? data.slice(0, 10) : [] // show up to 10 recent tasks
        }
        return []
      })()

      setDetailData((prev) => ({
        ...prev,
        [projectId]: { members, tasks, loading: false },
      }))
    } catch {
      setDetailData((prev) => ({
        ...prev,
        [projectId]: { members: [], tasks: [], loading: false },
      }))
    }
  }

  const filtered = projects.filter((p) => {
    const matchTab = activeTab === 'all' || p.status === activeTab
    const matchSearch =
      search === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.pi.toLowerCase().includes(search.toLowerCase())
    return matchTab && matchSearch
  })

  if (loading) return <div style={{ padding: '48px', color: '#94a3b8', textAlign: 'center' }}>로딩 중...</div>

  return (
    <div key="projects" style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }} className="animate-fade-in">
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
            프로젝트
          </h1>
          <p style={{ color: '#64748b', fontSize: '15px', marginTop: '6px', lineHeight: 1.5 }}>
            {projects.length}개 프로젝트 · {projects.filter(p => p.status === '진행중').length}개 진행중
          </p>
        </div>
        {(currentRole === 'professor') && (
          <button
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 12,
              fontSize: 14, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: '#4f46e5', color: '#fff',
              boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#3730a3' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#4f46e5' }}
          >
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            새 프로젝트
          </button>
        )}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }} className="opacity-0 animate-fade-in stagger-1">
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94a3b8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="프로젝트명, 코드, PI로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 40px',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              background: '#fff',
              fontSize: 14,
              color: '#0f172a',
              outline: 'none',
            }}
          />
        </div>

        {/* Status Tabs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: '#fff', borderRadius: 12,
          border: '1px solid #e2e8f0', padding: 4,
        }}>
          {statusTabs.map((tab) => {
            const active = activeTab === tab.value
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                style={{
                  padding: '6px 14px', borderRadius: 8,
                  fontSize: 13, fontWeight: 500,
                  border: 'none', cursor: 'pointer',
                  background: active ? '#f1f5f9' : 'transparent',
                  color: active ? '#0f172a' : '#94a3b8',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Project List */}
      <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, overflow: 'hidden' }}>
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 140px 160px 1fr 80px 120px',
          gap: 16,
          padding: '14px 28px',
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc',
        }} className="projects-table-header">
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>프로젝트</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>상태</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>진행률</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>PI</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' as const }}>팀원</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'right' as const }}>마감일</span>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 28px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: '#94a3b8' }}>검색 결과가 없습니다.</p>
          </div>
        ) : (
          filtered.map((project, idx) => {
            const badge = statusBadge[project.status]
            const isExpanded = expandedId === project.id
            const detail = detailData[project.id]

            return (
              <div key={project.id || project.code}>
                {/* Row */}
                <div
                  className="projects-table-row"
                  onClick={() => handleRowClick(project.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 140px 160px 1fr 80px 120px',
                    gap: 16,
                    padding: '20px 28px',
                    borderBottom: (idx < filtered.length - 1 && !isExpanded) ? '1px solid #f1f5f9' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    alignItems: 'center',
                    background: isExpanded ? '#f8fafc' : 'transparent',
                  }}
                  onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Name + Code */}
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg
                      style={{
                        width: 14, height: 14, color: '#94a3b8', flexShrink: 0,
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                      }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {project.name}
                      </p>
                      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, fontFamily: 'monospace' }}>
                        {project.code}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px', borderRadius: 99,
                      fontSize: 12, fontWeight: 600,
                      background: badge.bg, color: badge.color,
                    }}>
                      {project.status}
                    </span>
                  </div>

                  {/* Progress */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 99,
                        background: project.progress === 100 ? '#059669' : '#4f46e5',
                        width: `${project.progress}%`,
                        transition: 'width 0.7s ease',
                      }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', minWidth: 36, textAlign: 'right' as const }}>
                      {project.progress}%
                    </span>
                  </div>

                  {/* PI */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {project.pi ? (
                      <>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>{project.pi.charAt(0)}</span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#334155' }}>{project.pi}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 13, color: '#cbd5e1' }}>-</span>
                    )}
                  </div>

                  {/* Team count */}
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>
                      {project.team > 0 ? `${project.team}명` : '-'}
                    </span>
                  </div>

                  {/* Deadline */}
                  <div style={{ textAlign: 'right' as const }}>
                    <span style={{ fontSize: 13, color: '#475569' }}>{project.deadline}</span>
                  </div>
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div style={{
                    padding: '0 28px 24px 28px',
                    background: '#f8fafc',
                    borderBottom: idx < filtered.length - 1 ? '1px solid #e2e8f0' : 'none',
                  }}>
                    {/* Description */}
                    {project.description && (
                      <div style={{ marginBottom: 20, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                          설명
                        </p>
                        <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
                          {project.description}
                        </p>
                      </div>
                    )}

                    {detail?.loading ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                        상세 정보 로딩 중...
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="projects-detail-grid">
                        {/* Members */}
                        <div style={{ padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                            팀원 ({detail?.members?.length || 0})
                          </p>
                          {(!detail?.members || detail.members.length === 0) ? (
                            <p style={{ fontSize: 13, color: '#cbd5e1' }}>등록된 팀원이 없습니다.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {detail.members.map((member) => (
                                <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: member.project_role === 'lead'
                                      ? 'linear-gradient(135deg, #4f46e5, #3730a3)'
                                      : 'linear-gradient(135deg, #94a3b8, #64748b)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                  }}>
                                    <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>
                                      {(member.name || '?').charAt(0)}
                                    </span>
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>
                                      {member.name || member.email}
                                    </span>
                                    {member.project_role === 'lead' && (
                                      <span style={{
                                        marginLeft: 6, fontSize: 11, fontWeight: 600,
                                        padding: '1px 6px', borderRadius: 4,
                                        background: '#e0e7ff', color: '#4338ca',
                                      }}>
                                        리더
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Recent Tasks */}
                        <div style={{ padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                            최근 태스크 ({detail?.tasks?.length || 0})
                          </p>
                          {(!detail?.tasks || detail.tasks.length === 0) ? (
                            <p style={{ fontSize: 13, color: '#cbd5e1' }}>등록된 태스크가 없습니다.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {detail.tasks.map((task) => {
                                const statusInfo = taskStatusLabel[task.status] || { label: task.status, bg: '#f1f5f9', color: '#64748b' }
                                return (
                                  <div key={task.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    gap: 8, padding: '6px 0',
                                    borderBottom: '1px solid #f8fafc',
                                  }}>
                                    <span style={{
                                      fontSize: 13, color: '#334155',
                                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                      flex: 1, minWidth: 0,
                                    }}>
                                      {task.title}
                                    </span>
                                    <span style={{
                                      fontSize: 11, fontWeight: 600, flexShrink: 0,
                                      padding: '2px 8px', borderRadius: 4,
                                      background: statusInfo.bg, color: statusInfo.color,
                                    }}>
                                      {statusInfo.label}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Summary footer */}
      <div style={{ marginTop: 20, display: 'flex', gap: 24, padding: '0 4px' }} className="opacity-0 animate-fade-in stagger-3">
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          총 {filtered.length}개 프로젝트 표시
        </span>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .projects-table-header,
          .projects-table-row {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }
          .projects-table-header {
            display: none !important;
          }
          .projects-table-row {
            padding: 20px 20px !important;
          }
          .projects-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
