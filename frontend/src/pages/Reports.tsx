import { useState, useEffect, useCallback } from 'react'
import { useRole, isPrivileged } from '../contexts/RoleContext'

const API_BASE = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (!res.ok) throw new Error(`API Error: ${res.status}`)
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Types ──────────────────────────────────────────────────────────────────

type ReportType = 'weekly' | 'project_summary' | 'advisor_summary' | 'student_summary' | 'tag_summary' | 'organization_summary'
type ScopeType = 'organization' | 'project' | 'professor' | 'student' | 'tag'

type Report = {
  id: string
  report_type: ReportType
  title: string
  scope_type: ScopeType
  scope_id: string | null
  period_start: string
  period_end: string
  content: any
  generated_by: string | null
  created_at: string
}

const reportTypeLabels: Record<ReportType, string> = {
  weekly: '주간',
  project_summary: '프로젝트',
  advisor_summary: '지도교수',
  student_summary: '학생',
  tag_summary: '태그',
  organization_summary: '조직',
}

const reportTypeBadge: Record<ReportType, { bg: string; color: string }> = {
  weekly: { bg: '#e0e7ff', color: '#4338ca' },
  project_summary: { bg: '#d1fae5', color: '#047857' },
  advisor_summary: { bg: '#fef3c7', color: '#b45309' },
  student_summary: { bg: '#e0f2fe', color: '#0369a1' },
  tag_summary: { bg: '#f3e8ff', color: '#7c3aed' },
  organization_summary: { bg: '#f1f5f9', color: '#475569' },
}

const scopeTypeLabels: Record<ScopeType, string> = {
  organization: '조직',
  project: '프로젝트',
  professor: '교수',
  student: '학생',
  tag: '태그',
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

const taskStatusLabels: Record<string, { label: string; color: string }> = {
  done: { label: '완료', color: '#059669' },
  in_progress: { label: '진행중', color: '#4f46e5' },
  todo: { label: '대기', color: '#64748b' },
  blocked: { label: '차단', color: '#dc2626' },
  review: { label: '검토', color: '#d97706' },
}

export default function Reports() {
  const { currentRole } = useRole()

  // ── State ──────────────────────────────────────────────────────────────
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<ReportType | ''>('')
  const [filterScope, setFilterScope] = useState<ScopeType | ''>('')
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')

  // Detail modal
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false)
  const [genForm, setGenForm] = useState({
    report_type: 'weekly' as ReportType,
    scope_type: 'organization' as ScopeType,
    scope_id: '',
    period_start: '',
    period_end: '',
  })
  const [generating, setGenerating] = useState(false)

  // ── Fetch reports ──────────────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filterType) params.set('report_type', filterType)
      if (filterScope) params.set('scope_type', filterScope)
      if (filterStart) params.set('period_start', filterStart)
      if (filterEnd) params.set('period_end', filterEnd)
      const qs = params.toString()
      const data = await request<Report[]>(`/reports/${qs ? '?' + qs : ''}`)
      setReports(Array.isArray(data) ? data : [])
    } catch {
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [filterType, filterScope, filterStart, filterEnd])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  // ── Generate report ────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!genForm.period_start || !genForm.period_end) return
    setGenerating(true)
    try {
      const body: any = {
        report_type: genForm.report_type,
        scope_type: genForm.scope_type,
        period_start: genForm.period_start,
        period_end: genForm.period_end,
      }
      if (genForm.scope_id) body.scope_id = genForm.scope_id
      const report = await request<Report>('/reports/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setShowGenerate(false)
      setGenForm({ report_type: 'weekly', scope_type: 'organization', scope_id: '', period_start: '', period_end: '' })
      fetchReports()
      setSelectedReport(report)
    } catch {
      alert('리포트 생성에 실패했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Delete report ──────────────────────────────────────────────────────
  const handleDelete = async (reportId: string) => {
    if (!confirm('이 리포트를 삭제하시겠습니까?')) return
    try {
      await request(`/reports/${reportId}`, { method: 'DELETE' })
      setSelectedReport(null)
      fetchReports()
    } catch {
      alert('삭제에 실패했습니다.')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: '48px', color: '#94a3b8', textAlign: 'center' }}>로딩 중...</div>
  }

  return (
    <div key="reports" style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }} className="animate-fade-in">
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
            리포트
          </h1>
          <p style={{ color: '#64748b', fontSize: '15px', marginTop: '6px', lineHeight: 1.5 }}>
            {reports.length}개 리포트
          </p>
        </div>
        <button
          onClick={() => setShowGenerate(true)}
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
          리포트 생성
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }} className="opacity-0 animate-fade-in stagger-1">
        {/* Report Type */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as ReportType | '')}
          style={{
            padding: '9px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
            background: '#fff', fontSize: 13, color: '#334155', outline: 'none',
            minWidth: 130,
          }}
        >
          <option value="">유형: 전체</option>
          {Object.entries(reportTypeLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Scope Type */}
        <select
          value={filterScope}
          onChange={(e) => setFilterScope(e.target.value as ScopeType | '')}
          style={{
            padding: '9px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
            background: '#fff', fontSize: 13, color: '#334155', outline: 'none',
            minWidth: 130,
          }}
        >
          <option value="">범위: 전체</option>
          {Object.entries(scopeTypeLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Date Range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="date"
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
            style={{
              padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0',
              background: '#fff', fontSize: 13, color: '#334155', outline: 'none',
            }}
          />
          <span style={{ color: '#94a3b8', fontSize: 13 }}>~</span>
          <input
            type="date"
            value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
            style={{
              padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0',
              background: '#fff', fontSize: 13, color: '#334155', outline: 'none',
            }}
          />
        </div>

        {/* Clear filters */}
        {(filterType || filterScope || filterStart || filterEnd) && (
          <button
            onClick={() => { setFilterType(''); setFilterScope(''); setFilterStart(''); setFilterEnd('') }}
            style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
              background: '#fff', fontSize: 12, fontWeight: 500, color: '#64748b',
              cursor: 'pointer',
            }}
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* Report List */}
      <div className="opacity-0 animate-fade-in stagger-2" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reports.length === 0 ? (
          <div style={{ ...cardStyle, padding: '48px 28px', textAlign: 'center' }}>
            <svg style={{ width: 48, height: 48, color: '#cbd5e1', margin: '0 auto 16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p style={{ fontSize: 15, color: '#94a3b8' }}>생성된 리포트가 없습니다.</p>
            <p style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6 }}>
              "리포트 생성" 버튼을 눌러 첫 리포트를 만들어보세요.
            </p>
          </div>
        ) : (
          reports.map((report) => {
            const badge = reportTypeBadge[report.report_type] || { bg: '#f1f5f9', color: '#475569' }
            return (
              <div
                key={report.id}
                onClick={() => setSelectedReport(report)}
                style={{
                  ...cardStyle,
                  padding: '20px 24px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#c7d2fe'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(79,70,229,0.08)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0'
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 99,
                        fontSize: 11, fontWeight: 600,
                        background: badge.bg, color: badge.color,
                      }}>
                        {reportTypeLabels[report.report_type]}
                      </span>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 99,
                        fontSize: 11, fontWeight: 500,
                        background: '#f1f5f9', color: '#64748b',
                      }}>
                        {scopeTypeLabels[report.scope_type]}
                      </span>
                    </div>
                    <h3 style={{
                      fontSize: 15, fontWeight: 600, color: '#0f172a',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {report.title}
                    </h3>
                    <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
                      {report.period_start} ~ {report.period_end}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 12, color: '#94a3b8' }}>
                      {new Date(report.created_at).toLocaleDateString('ko-KR')}
                    </p>
                    {report.content?.daily_count !== undefined && (
                      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: '#64748b' }}>
                        <span>데일리 {report.content.daily_count}</span>
                        <span>태스크 {Object.values(report.content.task_summary || {}).reduce((a: number, b: any) => a + (b || 0), 0)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Summary footer */}
      <div style={{ marginTop: 20, display: 'flex', gap: 24, padding: '0 4px' }} className="opacity-0 animate-fade-in stagger-3">
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          총 {reports.length}개 리포트 표시
        </span>
      </div>

      {/* ── Detail Modal ───────────────────────────────────────────────────── */}
      {selectedReport && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setSelectedReport(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, padding: 0,
              width: 640, maxWidth: '100%', maxHeight: '85vh',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '24px 28px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                      background: (reportTypeBadge[selectedReport.report_type] || { bg: '#f1f5f9' }).bg,
                      color: (reportTypeBadge[selectedReport.report_type] || { color: '#475569' }).color,
                    }}>
                      {reportTypeLabels[selectedReport.report_type]}
                    </span>
                    <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, background: '#f1f5f9', color: '#64748b' }}>
                      {scopeTypeLabels[selectedReport.scope_type]}
                    </span>
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{selectedReport.title}</h2>
                  <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
                    {selectedReport.period_start} ~ {selectedReport.period_end} | 생성: {new Date(selectedReport.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedReport(null)}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0',
                    background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#94a3b8', flexShrink: 0,
                  }}
                >
                  <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body — scrollable */}
            <div style={{ padding: '20px 28px 28px', overflowY: 'auto', flex: 1 }}>
              {/* Summary Stats */}
              {selectedReport.content && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                    {/* Daily count */}
                    <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #f1f5f9', textAlign: 'center' }}>
                      <p style={{ fontSize: 28, fontWeight: 700, color: '#4f46e5' }}>
                        {selectedReport.content.daily_count ?? '-'}
                      </p>
                      <p style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginTop: 4 }}>데일리 로그</p>
                    </div>
                    {/* Attendance */}
                    <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #f1f5f9', textAlign: 'center' }}>
                      <p style={{ fontSize: 28, fontWeight: 700, color: '#059669' }}>
                        {selectedReport.content.attendance_summary?.total_days ?? '-'}
                      </p>
                      <p style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginTop: 4 }}>출석일</p>
                    </div>
                    {/* Avg hours */}
                    <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #f1f5f9', textAlign: 'center' }}>
                      <p style={{ fontSize: 28, fontWeight: 700, color: '#d97706' }}>
                        {selectedReport.content.attendance_summary?.avg_hours ?? '-'}
                      </p>
                      <p style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginTop: 4 }}>평균 근무(h)</p>
                    </div>
                  </div>

                  {/* Task Breakdown */}
                  {selectedReport.content.task_summary && (
                    <div style={{ marginBottom: 24 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                        태스크 현황
                      </h4>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {Object.entries(selectedReport.content.task_summary).map(([key, val]) => {
                          const info = taskStatusLabels[key] || { label: key, color: '#64748b' }
                          return (
                            <div key={key} style={{
                              padding: '10px 16px', background: '#f8fafc', borderRadius: 10,
                              border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                              <span style={{ fontSize: 18, fontWeight: 700, color: info.color }}>{val as number}</span>
                              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>{info.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Daily Highlights */}
                  {selectedReport.content.daily_highlights && selectedReport.content.daily_highlights.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                        최근 데일리 하이라이트
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {selectedReport.content.daily_highlights.map((h: any, i: number) => (
                          <div key={i} style={{
                            padding: '12px 16px', background: '#f8fafc', borderRadius: 10,
                            border: '1px solid #f1f5f9',
                          }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                              {h.date}
                            </p>
                            <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                              {h.snippet || '(내용 없음)'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* LLM Summary Placeholder */}
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                      AI 요약
                    </h4>
                    <div style={{
                      padding: '20px', background: '#fafafa', borderRadius: 12,
                      border: '1px dashed #d1d5db', textAlign: 'center',
                    }}>
                      {selectedReport.content.llm_summary ? (
                        <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, textAlign: 'left' }}>
                          {selectedReport.content.llm_summary}
                        </p>
                      ) : (
                        <>
                          <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }}>
                            AI 요약이 아직 생성되지 않았습니다
                          </p>
                          <button
                            disabled
                            style={{
                              padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0',
                              background: '#f1f5f9', fontSize: 13, fontWeight: 500,
                              color: '#94a3b8', cursor: 'not-allowed',
                            }}
                          >
                            AI 요약 생성
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                {isPrivileged(currentRole) && (
                  <button
                    onClick={() => handleDelete(selectedReport.id)}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: '1px solid #fecaca',
                      background: '#fff', fontSize: 13, fontWeight: 500,
                      color: '#dc2626', cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
                  >
                    삭제
                  </button>
                )}
                <button
                  onClick={() => setSelectedReport(null)}
                  style={{
                    padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0',
                    background: '#fff', fontSize: 13, fontWeight: 500,
                    color: '#64748b', cursor: 'pointer',
                  }}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate Modal ─────────────────────────────────────────────────── */}
      {showGenerate && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowGenerate(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, padding: 32,
              width: 480, maxWidth: '90vw',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>리포트 생성</h3>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              {/* Report Type */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>리포트 유형 *</label>
                <select
                  value={genForm.report_type}
                  onChange={(e) => setGenForm(f => ({ ...f, report_type: e.target.value as ReportType }))}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    border: '1px solid #e2e8f0', fontSize: 14, outline: 'none',
                    boxSizing: 'border-box' as const, background: '#fff',
                  }}
                >
                  {Object.entries(reportTypeLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Scope Type */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>범위 *</label>
                <select
                  value={genForm.scope_type}
                  onChange={(e) => setGenForm(f => ({ ...f, scope_type: e.target.value as ScopeType }))}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    border: '1px solid #e2e8f0', fontSize: 14, outline: 'none',
                    boxSizing: 'border-box' as const, background: '#fff',
                  }}
                >
                  {Object.entries(scopeTypeLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Scope ID (optional) */}
              {(genForm.scope_type === 'project' || genForm.scope_type === 'student' || genForm.scope_type === 'professor') && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>대상 ID (선택)</label>
                  <input
                    value={genForm.scope_id}
                    onChange={(e) => setGenForm(f => ({ ...f, scope_id: e.target.value }))}
                    placeholder="UUID (비워두면 전체)"
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 8,
                      border: '1px solid #e2e8f0', fontSize: 14, outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                </div>
              )}

              {/* Period */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>시작일 *</label>
                  <input
                    type="date"
                    value={genForm.period_start}
                    onChange={(e) => setGenForm(f => ({ ...f, period_start: e.target.value }))}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 8,
                      border: '1px solid #e2e8f0', fontSize: 14, outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>종료일 *</label>
                  <input
                    type="date"
                    value={genForm.period_end}
                    onChange={(e) => setGenForm(f => ({ ...f, period_end: e.target.value }))}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 8,
                      border: '1px solid #e2e8f0', fontSize: 14, outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 28 }}>
              <button
                onClick={() => { setShowGenerate(false); setGenForm({ report_type: 'weekly', scope_type: 'organization', scope_id: '', period_start: '', period_end: '' }) }}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0',
                  background: '#fff', fontSize: 14, fontWeight: 500,
                  cursor: 'pointer', color: '#64748b',
                }}
              >
                취소
              </button>
              <button
                disabled={!genForm.period_start || !genForm.period_end || generating}
                onClick={handleGenerate}
                style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none',
                  fontSize: 14, fontWeight: 600,
                  cursor: genForm.period_start && genForm.period_end && !generating ? 'pointer' : 'not-allowed',
                  background: genForm.period_start && genForm.period_end && !generating ? '#4f46e5' : '#c7d2fe',
                  color: '#fff', transition: 'all 0.15s',
                }}
              >
                {generating ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
