import { useState, useEffect, useCallback } from 'react'
import { useRole, isPrivileged } from '../contexts/RoleContext'

// ── Types ───────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id: string
  user_id: string
  user_name: string | null
  date: string
  check_in: string | null
  check_out: string | null
  type: string
  status: string
  hours: number | null
  created_at: string
  updated_at: string
}

interface MonthlyStats {
  total_days: number
  avg_hours: number
  late_days: number
  early_leaves: number
  absent_days: number
}

interface StudentAttendance {
  user_id: string
  user_name: string
  attendance: AttendanceRecord | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function formatTime(isoStr: string | null): string {
  if (!isoStr) return '--:--'
  try {
    const d = new Date(isoStr)
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return '--:--'
  }
}

function getDayName(dateStr: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  try {
    return days[new Date(dateStr).getDay()]
  } catch {
    return ''
  }
}

// ── Styles ──────────────────────────────────────────────────────────────────

const statusColors: Record<string, { bg: string; color: string }> = {
  '정상': { bg: '#d1fae5', color: '#047857' },
  '근무중': { bg: '#e0e7ff', color: '#4338ca' },
  '지각': { bg: '#ffe4e6', color: '#be123c' },
  '예정': { bg: '#f1f5f9', color: '#94a3b8' },
  '결근': { bg: '#fee2e2', color: '#dc2626' },
  '미출근': { bg: '#f1f5f9', color: '#94a3b8' },
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Attendance() {
  const { currentRole } = useRole()
  const isProfessor = isPrivileged(currentRole)

  // Today's attendance state
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkedOut, setCheckedOut] = useState(false)
  const [checkInTime, setCheckInTime] = useState<string | null>(null)
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null)

  // Data states
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats>({
    total_days: 0, avg_hours: 0, late_days: 0, early_leaves: 0, absent_days: 0,
  })
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([])
  const [studentsAttendance, setStudentsAttendance] = useState<StudentAttendance[]>([])

  // UI states
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)

  // ── Fetch today's attendance ──────────────────────────────────────────

  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/attendance/today', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        if (data && data.check_in) {
          setCheckedIn(true)
          setCheckInTime(data.check_in)
          if (data.check_out) {
            setCheckedOut(true)
            setCheckOutTime(data.check_out)
          }
        }
      }
    } catch {
      // API not available yet — silent fallback
    }
  }, [])

  // ── Fetch monthly stats ───────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const now = new Date()
      const res = await fetch(
        `/api/v1/attendance/stats?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
        { headers: getHeaders() },
      )
      if (res.ok) {
        const data = await res.json()
        setMonthlyStats(data)
      }
    } catch {
      // silent fallback
    }
  }, [])

  // ── Fetch history ─────────────────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/attendance/history?limit=10', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setHistoryRecords(data.data || [])
      }
    } catch {
      // silent fallback
    }
  }, [])

  // ── Fetch students (professor only) ───────────────────────────────────

  const fetchStudents = useCallback(async () => {
    if (!isProfessor) return
    try {
      const res = await fetch('/api/v1/attendance/students', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setStudentsAttendance(data.data || [])
      }
    } catch {
      // silent fallback
    }
  }, [isProfessor])

  // ── Initial load ──────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([
        fetchToday(),
        fetchStats(),
        fetchHistory(),
        fetchStudents(),
      ])
      setLoading(false)
    }
    load()
  }, [fetchToday, fetchStats, fetchHistory, fetchStudents])

  // ── Check-in handler ──────────────────────────────────────────────────

  async function handleCheckIn() {
    setCheckingIn(true)
    try {
      const res = await fetch('/api/v1/attendance/check-in', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ type: 'daily' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.detail || '출근 처리에 실패했습니다.')
      }
      const data = await res.json()
      setCheckedIn(true)
      setCheckInTime(data.check_in)
      // Refresh stats
      fetchStats()
    } catch (e: any) {
      alert(e.message || '출결 기능은 준비 중입니다.')
    } finally {
      setCheckingIn(false)
    }
  }

  // ── Check-out handler ─────────────────────────────────────────────────

  async function handleCheckOut() {
    setCheckingOut(true)
    try {
      const res = await fetch('/api/v1/attendance/check-out', {
        method: 'POST',
        headers: getHeaders(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.detail || '퇴근 처리에 실패했습니다.')
      }
      const data = await res.json()
      setCheckedOut(true)
      setCheckOutTime(data.check_out)
      // Refresh stats and history
      fetchStats()
      fetchHistory()
    } catch (e: any) {
      alert(e.message || '출결 기능은 준비 중입니다.')
    } finally {
      setCheckingOut(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  const now = new Date()
  const todayStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          출석 관리
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
          {todayStr} · {timeStr}
        </p>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          데이터를 불러오는 중...
        </div>
      )}

      {!loading && (
        <>
          {/* Check-in/out Section */}
          <div className="opacity-0 animate-fade-in stagger-1" style={{
            ...cardStyle, padding: 28, marginBottom: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 20,
          }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>오늘의 출석</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>출근 시각</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: checkedIn ? '#059669' : '#94a3b8' }}>
                    {formatTime(checkInTime)}
                  </p>
                </div>
                <div style={{ width: 1, height: 40, background: '#e2e8f0' }} />
                <div>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>퇴근 시각</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: checkedOut ? '#059669' : '#94a3b8' }}>
                    {formatTime(checkOutTime)}
                  </p>
                </div>
                <div style={{ width: 1, height: 40, background: '#e2e8f0' }} />
                <div>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>상태</p>
                  <span style={{
                    padding: '4px 12px', borderRadius: 99, fontSize: 13, fontWeight: 600,
                    background: checkedOut ? '#d1fae5' : '#e0e7ff',
                    color: checkedOut ? '#047857' : '#4338ca',
                  }}>
                    {checkedOut ? '퇴근 완료' : checkedIn ? '근무중' : '미출근'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleCheckIn}
                disabled={checkedIn || checkingIn}
                style={{
                  padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                  border: 'none', cursor: checkedIn ? 'not-allowed' : 'pointer',
                  background: checkedIn ? '#f1f5f9' : '#059669',
                  color: checkedIn ? '#94a3b8' : '#fff',
                  boxShadow: checkedIn ? 'none' : '0 2px 8px rgba(5,150,105,0.3)',
                }}
              >
                {checkingIn ? '처리중...' : checkedIn ? '출근 완료' : '출근하기'}
              </button>
              <button
                onClick={handleCheckOut}
                disabled={!checkedIn || checkedOut || checkingOut}
                style={{
                  padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                  border: 'none', cursor: (!checkedIn || checkedOut) ? 'not-allowed' : 'pointer',
                  background: checkedOut ? '#f1f5f9' : (!checkedIn ? '#f1f5f9' : '#e11d48'),
                  color: checkedOut || !checkedIn ? '#94a3b8' : '#fff',
                  boxShadow: checkedOut || !checkedIn ? 'none' : '0 2px 8px rgba(225,29,72,0.3)',
                }}
              >
                {checkingOut ? '처리중...' : checkedOut ? '퇴근 완료' : '퇴근하기'}
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="opacity-0 animate-fade-in stagger-2" style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24,
          }}>
            <StatCard label="이번 달 출근일" value={`${monthlyStats.total_days}일`} accent="#4f46e5" />
            <StatCard label="평균 근무시간" value={`${monthlyStats.avg_hours}시간`} accent="#059669" />
            <StatCard label="지각 횟수" value={`${monthlyStats.late_days}회`} accent="#d97706" />
            <StatCard label="조퇴 횟수" value={`${monthlyStats.early_leaves}회`} accent="#64748b" />
          </div>

          {/* Professor: Students Attendance Table */}
          {isProfessor && studentsAttendance.length > 0 && (
            <div className="opacity-0 animate-fade-in stagger-3" style={{ ...cardStyle, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>학생 출석 현황 (오늘)</h3>
              </div>
              <div style={{ overflowX: 'auto' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {['이름', '출근', '퇴근', '근무시간', '상태'].map((h) => (
                        <th key={h} style={{
                          padding: '10px 16px', textAlign: 'left' as const,
                          fontSize: 12, fontWeight: 600, color: '#64748b',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {studentsAttendance.map((s) => {
                      const att = s.attendance
                      const st = att?.status || '미출근'
                      const sc = statusColors[st] || statusColors['미출근']
                      return (
                        <tr key={s.user_id} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 500 }}>{s.user_name}</td>
                          <td style={{ padding: '12px 16px', color: att?.check_in ? '#0f172a' : '#cbd5e1', fontFamily: 'monospace' }}>
                            {formatTime(att?.check_in || null)}
                          </td>
                          <td style={{ padding: '12px 16px', color: att?.check_out ? '#0f172a' : '#cbd5e1', fontFamily: 'monospace' }}>
                            {formatTime(att?.check_out || null)}
                          </td>
                          <td style={{ padding: '12px 16px', color: att?.hours ? '#0f172a' : '#cbd5e1' }}>
                            {att?.hours ? `${att.hours}h` : '-'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500,
                              background: sc.bg, color: sc.color,
                            }}>
                              {st}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* History / Recent Logs */}
          <div className="opacity-0 animate-fade-in stagger-4" style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>출석 기록</h3>
            </div>
            <div style={{ overflowX: 'auto' as const }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {['날짜', '요일', '출근', '퇴근', '근무시간', '상태'].map((h) => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left' as const,
                        fontSize: 12, fontWeight: 600, color: '#64748b',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyRecords.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8' }}>
                        출석 기록이 없습니다.
                      </td>
                    </tr>
                  )}
                  {historyRecords.map((row) => {
                    const sc = statusColors[row.status] || statusColors['정상']
                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 500 }}>{row.date}</td>
                        <td style={{ padding: '12px 16px', color: '#475569' }}>{getDayName(row.date)}</td>
                        <td style={{ padding: '12px 16px', color: row.check_in ? '#0f172a' : '#cbd5e1', fontFamily: 'monospace' }}>
                          {formatTime(row.check_in)}
                        </td>
                        <td style={{ padding: '12px 16px', color: row.check_out ? '#0f172a' : '#cbd5e1', fontFamily: 'monospace' }}>
                          {formatTime(row.check_out)}
                        </td>
                        <td style={{ padding: '12px 16px', color: row.hours ? '#0f172a' : '#cbd5e1' }}>
                          {row.hours ? `${row.hours}h` : '-'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500,
                            background: sc.bg, color: sc.color,
                          }}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      ...{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
      },
      padding: 20,
    }}>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</p>
    </div>
  )
}
