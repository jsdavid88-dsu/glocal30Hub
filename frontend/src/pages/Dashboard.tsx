import { useState, useEffect } from 'react'
import { useRole, type Role } from '../contexts/RoleContext'
import { api } from '../api/client'

// ─── Types ───
type StudentRow = { name: string; type: string; project: string; dailyStatus: string; attendance: string }
type TaskRow = { title: string; project: string; status: '완료' | '진행중' | '미시작'; url: string; guide: string }

// ─── MOCK DATA: Replace with real API calls when endpoints are ready ───

// MOCK DATA — TODO Phase 3: Replace with notifications/issues API
const professorIssues = [
  { student: '윤스마', issue: 'GPU 서버 접근 권한 요청', time: '2시간 전', urgent: true },
  { student: '정인턴', issue: '중간발표 자료 리뷰 요청', time: '5시간 전', urgent: false },
  { student: '한감성', issue: 'Diffusion 모델 OOM 이슈 논의 필요', time: '1일 전', urgent: true },
  { student: '송리서', issue: '출결 관련 상담 요청', time: '1일 전', urgent: false },
]

// MOCK DATA — TODO Phase 3: Connect to events API (endpoint exists but router not mounted yet)
const professorMilestones = [
  { title: 'KOCCA Phase 2 중간보고', project: 'KOCCA AI Animation', date: '2026-03-15', daysLeft: 4 },
  { title: 'NRF 연차보고서 제출', project: 'NRF GCA', date: '2026-03-20', daysLeft: 9 },
  { title: 'Digital Heritage 최종 납품', project: 'Digital Heritage Archive', date: '2026-03-31', daysLeft: 20 },
]

// MOCK DATA — TODO Phase 3: Replace with events API (calendar events for today)
const studentSchedule = [
  { time: '10:00', title: 'KOCCA 주간 미팅', type: '회의' },
  { time: '14:00', title: '지도교수 면담', type: '면담' },
  { time: '16:00', title: 'GPU 서버 점검', type: '작업' },
]

// ─── Shared Styles ───
const cardStyle: React.CSSProperties = {
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

const sectionHeaderStyle: React.CSSProperties = {
  padding: '20px 28px',
  borderBottom: '1px solid #f1f5f9',
}

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '17px',
  color: 'var(--color-text-primary)',
}

const sectionSubtitleStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--color-text-muted)',
  marginTop: '4px',
}

const badgeStyle = (bg: string, color: string): React.CSSProperties => ({
  padding: '3px 10px',
  borderRadius: 99,
  fontSize: 11,
  fontWeight: 600,
  background: bg,
  color: color,
  whiteSpace: 'nowrap',
})

const hoverRow = {
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = '#f8fafc' },
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'transparent' },
}

// ─── Greeting map ───
const greetingMap: Record<Role, { name: string; subtitle: string }> = {
  professor: { name: '김교수님', subtitle: '지도학생 현황과 연구실 활동을 확인하세요.' },
  student: { name: '이학생님', subtitle: '오늘의 태스크와 일정을 확인하세요.' },
  external: { name: '파트너님', subtitle: '참여 프로젝트 현황을 확인하세요.' },
}

// ─── Status helpers ───
const dailyStatusBadge = (status: string) => {
  if (status === '제출') return badgeStyle('var(--color-success-light)', 'var(--color-success)')
  return badgeStyle('var(--color-danger-light)', 'var(--color-danger)')
}

const attendanceBadge = (status: string) => {
  if (status === '출근') return badgeStyle('var(--color-accent-light)', 'var(--color-accent-dark)')
  if (status === '지각') return badgeStyle('var(--color-warning-light)', 'var(--color-warning)')
  return badgeStyle('var(--color-danger-light)', 'var(--color-danger)')
}

const taskStatusBadge = (status: '완료' | '진행중' | '미시작') => {
  if (status === '완료') return badgeStyle('var(--color-success-light)', 'var(--color-success)')
  if (status === '진행중') return badgeStyle('var(--color-accent-light)', 'var(--color-accent)')
  return badgeStyle('#f1f5f9', 'var(--color-text-muted)')
}


// ─── Main Component ───
export default function Dashboard() {
  const { currentRole } = useRole()
  const greeting = greetingMap[currentRole]

  return (
    <div key={currentRole} style={{ width: '100%' }}>
      {/* Greeting */}
      <div style={{ marginBottom: '32px' }} className="animate-fade-in">
        <h1 style={{ fontSize: '26px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
          안녕하세요, {greeting.name}
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', marginTop: '6px', lineHeight: 1.5 }}>
          {greeting.subtitle}
        </p>
      </div>

      {/* Role-specific content */}
      {currentRole === 'professor' && <ProfessorView />}
      {currentRole === 'student' && <StudentView />}
      {currentRole === 'external' && <ExternalView />}

      <style>{`
        .dash-grid-2col {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }
        @media (min-width: 900px) {
          .dash-grid-2col { grid-template-columns: 2fr 1fr; }
        }
        .dash-grid-3stat {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .dash-summary-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        @media (min-width: 640px) {
          .dash-summary-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1100px) {
          .dash-summary-grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </div>
  )
}

// ════════════════════════════════════════
// ─── Professor View ───
// ════════════════════════════════════════
function ProfessorView() {
  const [students, setStudents] = useState<StudentRow[]>([])
  const [taskSummary, setTaskSummary] = useState({ done: 0, inProgress: 0, notStarted: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    Promise.all([
      api.users.list({ role: 'student' }).catch(() => null),
      api.tasks.my().catch(() => null),
      // Fetch today's daily logs to determine submission status
      api.daily.list({ date_from: today, date_to: today }).catch(() => null),
    ]).then(([apiStudents, apiTasks, apiDailyLogs]) => {
      // Collect author IDs who submitted daily logs today
      const dailyLogEntries: any[] = (apiDailyLogs as any)?.data || []
      const submittedAuthorIds = new Set(dailyLogEntries.map((log: any) => log.author_id || log.author?.id))

      // Map students: response shape is { data: UserSummaryResponse[], meta: dict }
      const rawStudents: any[] = (apiStudents as any)?.data || []
      setStudents(rawStudents.map((s: any) => ({
        name: s.name || '',
        type: '지도학생',
        project: s.major_field || '',
        // Real daily submission status from daily-logs API
        dailyStatus: submittedAuthorIds.has(s.id) ? '제출' : '미제출',
        // TODO Phase 3: Replace with attendance API
        attendance: '미출근',
      })))

      // Map tasks: response shape is { data: TaskSummaryResponse[], meta: dict }
      const rawTasks: any[] = (apiTasks as any)?.data || []
      const done = rawTasks.filter((t: any) => t.status === 'done' || t.status === 'completed').length
      const inProgress = rawTasks.filter((t: any) => t.status === 'in_progress').length
      const notStarted = rawTasks.filter((t: any) => t.status === 'not_started' || t.status === 'new').length
      setTaskSummary({ done, inProgress, notStarted })
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '48px', color: 'var(--color-text-muted)', textAlign: 'center' }}>로딩 중...</div>

  const submitted = students.filter(s => s.dailyStatus === '제출').length
  const notSubmitted = students.filter(s => s.dailyStatus === '미제출').length
  const attendPresent = students.filter(s => s.attendance === '출근').length
  const attendLate = students.filter(s => s.attendance === '지각').length
  const attendAbsent = students.filter(s => s.attendance === '미출근').length

  return (
    <div>
      {/* Summary Row */}
      <div className="dash-summary-grid opacity-0 animate-fade-in stagger-1">
        {/* Daily Submission Status */}
        <div style={{ ...cardStyle, padding: '24px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 16 }}>
            오늘 데일리 제출 현황
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1 }}>{submitted}</span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>/ {students.length}명 제출</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={badgeStyle('var(--color-success-light)', 'var(--color-success)')}>제출 {submitted}</span>
            <span style={badgeStyle('var(--color-danger-light)', 'var(--color-danger)')}>미제출 {notSubmitted}</span>
          </div>
        </div>

        {/* Attendance Status */}
        <div style={{ ...cardStyle, padding: '24px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 16 }}>
            학생 출결 현황
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--color-success)', lineHeight: 1 }}>{attendPresent + attendLate}</span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>/ {students.length}명 출근</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={badgeStyle('var(--color-accent-light)', 'var(--color-accent-dark)')}>출근 {attendPresent}</span>
            <span style={badgeStyle('var(--color-warning-light)', 'var(--color-warning)')}>지각 {attendLate}</span>
            <span style={badgeStyle('var(--color-danger-light)', 'var(--color-danger)')}>미출근 {attendAbsent}</span>
          </div>
        </div>

        {/* Task Summary */}
        <div style={{ ...cardStyle, padding: '24px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 16 }}>
            이번 주 배정 태스크 현황
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1 }}>
              {taskSummary.done + taskSummary.inProgress + taskSummary.notStarted}
            </span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>건 전체</span>
          </div>
          <div className="dash-grid-3stat">
            <div style={{ textAlign: 'center', padding: '10px 0', borderRadius: 10, background: 'var(--color-success-light)' }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-success)' }}>{taskSummary.done}</p>
              <p style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 500 }}>완료</p>
            </div>
            <div style={{ textAlign: 'center', padding: '10px 0', borderRadius: 10, background: 'var(--color-accent-light)' }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-accent)' }}>{taskSummary.inProgress}</p>
              <p style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 500 }}>진행중</p>
            </div>
            <div style={{ textAlign: 'center', padding: '10px 0', borderRadius: 10, background: '#f1f5f9' }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-muted)' }}>{taskSummary.notStarted}</p>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>미시작</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main grid: Students + Issues/Milestones */}
      <div className="dash-grid-2col">
        {/* Student List */}
        <div className="opacity-0 animate-fade-in stagger-2">
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={sectionTitleStyle}>내 학생들</h3>
                <p style={sectionSubtitleStyle}>지도학생 + 프로젝트 학생 통합 ({students.length}명)</p>
              </div>
              <button style={{
                fontSize: 14, fontWeight: 500, color: 'var(--color-accent)', background: 'none',
                border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: 8,
              }}>
                전체 보기
              </button>
            </div>
            <div>
              {students.map((student, idx) => (
                <div
                  key={student.name}
                  style={{
                    padding: '16px 28px',
                    borderBottom: idx < students.length - 1 ? '1px solid #f8fafc' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  {...hoverRow}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: student.type === '지도학생'
                          ? 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))'
                          : 'linear-gradient(135deg, var(--color-warning), #92400e)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{student.name.charAt(0)}</span>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{student.name}</p>
                          <span style={{
                            fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4,
                            background: student.type === '지도학생' ? 'var(--color-accent-light)' : 'var(--color-warning-light)',
                            color: student.type === '지도학생' ? 'var(--color-accent)' : 'var(--color-warning)',
                          }}>
                            {student.type}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{student.project}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={dailyStatusBadge(student.dailyStatus)}>데일리: {student.dailyStatus}</span>
                      <span style={attendanceBadge(student.attendance)}>{student.attendance}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Issues + Milestones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Issues */}
          <div className="opacity-0 animate-fade-in stagger-3">
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={sectionHeaderStyle}>
                <h3 style={sectionTitleStyle}>최근 이슈</h3>
                <p style={sectionSubtitleStyle}>빠른 확인 필요</p>
              </div>
              <div style={{ padding: '12px' }}>
                {professorIssues.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', gap: 14, padding: '14px',
                      borderRadius: 12, transition: 'background 0.15s', cursor: 'pointer',
                    }}
                    {...hoverRow}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: item.urgent ? 'var(--color-danger-light)' : '#f1f5f9',
                    }}>
                      <svg style={{ width: 16, height: 16, color: item.urgent ? 'var(--color-danger)' : 'var(--color-text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.student}</span>
                        {item.urgent && (
                          <span style={badgeStyle('var(--color-danger-light)', 'var(--color-danger)')}>긴급</span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{item.issue}</p>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, display: 'block' }}>{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Milestones */}
          <div className="opacity-0 animate-fade-in stagger-4">
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={sectionHeaderStyle}>
                <h3 style={sectionTitleStyle}>다가오는 마일스톤</h3>
                <p style={sectionSubtitleStyle}>일정 관리</p>
              </div>
              <div style={{ padding: '12px' }}>
                {professorMilestones.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px', borderRadius: 12, transition: 'background 0.15s', cursor: 'pointer',
                      gap: 12,
                    }}
                    {...hoverRow}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.title}</p>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{item.project}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>{item.date}</p>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: item.daysLeft <= 7 ? 'var(--color-danger)' : 'var(--color-text-muted)',
                      }}>
                        D-{item.daysLeft}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════
// ─── Student View ───
// ════════════════════════════════════════
function StudentView() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [weeklyProgress, setWeeklyProgress] = useState({ done: 0, total: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.tasks.my()
      .then((apiTasks: any) => {
        // Response shape: { data: TaskSummaryResponse[], meta: dict }
        const items: any[] = apiTasks?.data || []
        const statusMap: Record<string, '완료' | '진행중' | '미시작'> = {
          done: '완료', completed: '완료',
          in_progress: '진행중',
          not_started: '미시작', new: '미시작',
        }
        const mapped: TaskRow[] = items.map((t: any) => ({
          title: t.title || '',
          project: '',
          status: statusMap[t.status] || '미시작',
          url: '',
          guide: t.description || '',
        }))
        setTasks(mapped)
        const done = mapped.filter(t => t.status === '완료').length
        setWeeklyProgress({ done, total: mapped.length })
      })
      .catch(() => {
        setTasks([])
        setWeeklyProgress({ done: 0, total: 0 })
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '48px', color: 'var(--color-text-muted)', textAlign: 'center' }}>로딩 중...</div>

  const progressPct = weeklyProgress.total > 0
    ? Math.round((weeklyProgress.done / weeklyProgress.total) * 100)
    : 0

  return (
    <div>
      {/* Top row: Attendance + Daily shortcut + Weekly progress */}
      <div className="dash-summary-grid opacity-0 animate-fade-in stagger-1">
        {/* TODO Phase 3: Attendance — connect to attendance API for real check-in/check-out */}
        <div style={{
          ...cardStyle, padding: '24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>출석 체크</h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>오늘 출근: 09:12 | 근무중</p>{/* MOCK DATA */}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{
              padding: '10px 22px', borderRadius: 12, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'not-allowed',
              background: '#f1f5f9', color: 'var(--color-text-muted)',
            }}>
              출근 완료
            </button>
            <button style={{
              padding: '10px 22px', borderRadius: 12, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: 'var(--color-danger)', color: '#fff',
              boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
            }}>
              퇴근하기
            </button>
          </div>
        </div>

        {/* Daily shortcut — TODO Phase 2a: Check if today's daily log exists via api.daily.list */}
        <div style={{
          ...cardStyle, padding: '24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>데일리 작성</h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>오늘 아직 미작성</p>{/* MOCK DATA */}
          </div>
          <a href="/daily/write" style={{
            padding: '10px 22px', borderRadius: 12, fontSize: 13, fontWeight: 600,
            border: 'none', cursor: 'pointer', textDecoration: 'none',
            background: 'var(--color-accent)', color: '#fff',
            boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
          }}>
            작성하기
          </a>
        </div>

        {/* Weekly progress */}
        <div style={{ ...cardStyle, padding: '24px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 12 }}>이번 주 진행률</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1 }}>{progressPct}%</span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{weeklyProgress.done}/{weeklyProgress.total}건 완료</span>
          </div>
          <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--color-accent)', borderRadius: 99,
              width: `${progressPct}%`, transition: 'width 0.7s ease',
            }} />
          </div>
        </div>
      </div>

      {/* Main grid: Tasks + Schedule */}
      <div className="dash-grid-2col">
        {/* Task list with details */}
        <div className="opacity-0 animate-fade-in stagger-2">
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={sectionTitleStyle}>오늘 배정된 태스크</h3>
                <p style={sectionSubtitleStyle}>
                  {tasks.filter(t => t.status !== '완료').length}건 진행중 / {tasks.length}건 전체
                </p>
              </div>
            </div>
            <div>
              {tasks.map((task, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '20px 28px',
                    borderBottom: idx < tasks.length - 1 ? '1px solid #f1f5f9' : 'none',
                    opacity: task.status === '완료' ? 0.55 : 1,
                    transition: 'background 0.15s',
                  }}
                  {...hoverRow}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: task.url || task.guide ? 10 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, marginTop: 1, flexShrink: 0,
                        border: task.status === '완료' ? 'none' : '2px solid var(--color-border)',
                        background: task.status === '완료' ? 'var(--color-success)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {task.status === '완료' && (
                          <svg style={{ width: 12, height: 12, color: '#fff' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)',
                          textDecoration: task.status === '완료' ? 'line-through' : 'none',
                        }}>
                          {task.title}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{task.project}</p>
                      </div>
                    </div>
                    <span style={taskStatusBadge(task.status)}>{task.status}</span>
                  </div>

                  {/* Task details: URL + guide */}
                  {(task.url || task.guide) && (
                    <div style={{
                      marginLeft: 34,
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: '#f8fafc',
                      borderLeft: '3px solid var(--color-accent-light)',
                    }}>
                      {task.url && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: task.guide ? 6 : 0 }}>
                          <svg style={{ width: 12, height: 12, color: 'var(--color-accent)', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          <a
                            href={task.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 12, color: 'var(--color-accent)', textDecoration: 'none', wordBreak: 'break-all' }}
                          >
                            {task.url}
                          </a>
                        </div>
                      )}
                      {task.guide && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <svg style={{ width: 12, height: 12, color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{task.guide}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Schedule — MOCK DATA, TODO Phase 3: Replace with events API */}
        <div className="opacity-0 animate-fade-in stagger-3">
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>오늘 일정</h3>
              <p style={sectionSubtitleStyle}>{studentSchedule.length}건</p>
            </div>
            <div style={{ padding: 12 }}>
              {studentSchedule.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', gap: 14, padding: '14px',
                    borderRadius: 10, transition: 'background 0.15s',
                  }}
                  {...hoverRow}
                >
                  <span style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--color-accent)',
                    minWidth: 48, fontFamily: 'monospace',
                  }}>
                    {item.time}
                  </span>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.title}</p>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 6,
                      background: '#f1f5f9', color: 'var(--color-text-muted)', fontWeight: 500,
                      display: 'inline-block', marginTop: 4,
                    }}>
                      {item.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════
// ─── External View ───
// ════════════════════════════════════════
function ExternalView() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.projects.list()
      .then((res: any) => {
        // Response shape: { data: ProjectSummaryResponse[], meta: dict }
        const items: any[] = res?.data || []
        setProjects(items)
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '48px', color: 'var(--color-text-muted)', textAlign: 'center' }}>로딩 중...</div>

  if (projects.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        참여 중인 프로젝트가 없습니다.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {projects.map((project: any, pi: number) => (
        <div key={project.id || pi} className={`opacity-0 animate-fade-in stagger-${pi + 1}`}>
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            {/* Project header */}
            <div style={{
              ...sectionHeaderStyle,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={sectionTitleStyle}>{project.name}</h3>
                <p style={{ ...sectionSubtitleStyle, fontFamily: 'monospace' }}>{project.status}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  display: 'inline-block', padding: '4px 14px', borderRadius: 99,
                  fontSize: 13, fontWeight: 600,
                  background: 'var(--color-accent-light)', color: 'var(--color-accent)',
                }}>
                  {project.status}
                </span>
              </div>
            </div>

            {/* Info section */}
            <div style={{ padding: '20px 28px' }}>
              {project.description ? (
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  {project.description}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>프로젝트 설명 없음</p>
              )}
              {project.end_date && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                  마감일: {project.end_date}
                </p>
              )}
            </div>

            {/* Issues section — TODO Phase 3: Replace with tasks/issues API per project */}
            <div style={{ padding: '12px 28px 20px', borderTop: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                이슈 및 태스크 정보는 준비 중입니다.
              </p>
            </div>
          </div>
        </div>
      ))}

    </div>
  )
}
