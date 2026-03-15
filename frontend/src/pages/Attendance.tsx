import { useState, useEffect } from 'react'

const weeklyData = [
  { date: '2026-03-09', day: '월', checkIn: '09:12', checkOut: '18:30', hours: 9.3, status: '정상' },
  { date: '2026-03-10', day: '화', checkIn: '08:55', checkOut: '19:15', hours: 10.3, status: '정상' },
  { date: '2026-03-11', day: '수', checkIn: '09:45', checkOut: null, hours: null, status: '근무중' },
  { date: '2026-03-12', day: '목', checkIn: null, checkOut: null, hours: null, status: '예정' },
  { date: '2026-03-13', day: '금', checkIn: null, checkOut: null, hours: null, status: '예정' },
]

const monthlyStats = {
  totalDays: 8,
  avgHours: 9.1,
  lateDays: 1,
  earlyLeaves: 0,
}

const recentLogs = [
  { date: '2026-03-07', day: '금', checkIn: '09:05', checkOut: '18:00', hours: 8.9, status: '정상' },
  { date: '2026-03-06', day: '목', checkIn: '08:50', checkOut: '18:45', hours: 9.9, status: '정상' },
  { date: '2026-03-05', day: '수', checkIn: '10:15', checkOut: '19:30', hours: 9.2, status: '지각' },
  { date: '2026-03-04', day: '화', checkIn: '09:00', checkOut: '18:10', hours: 9.2, status: '정상' },
  { date: '2026-03-03', day: '월', checkIn: '08:45', checkOut: '18:30', hours: 9.7, status: '정상' },
]

const statusColors: Record<string, { bg: string; color: string }> = {
  '정상': { bg: '#d1fae5', color: '#047857' },
  '근무중': { bg: '#e0e7ff', color: '#4338ca' },
  '지각': { bg: '#ffe4e6', color: '#be123c' },
  '예정': { bg: '#f1f5f9', color: '#94a3b8' },
  '결근': { bg: '#fee2e2', color: '#dc2626' },
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

export default function Attendance() {
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkedOut, setCheckedOut] = useState(false)
  const [checkInTime, setCheckInTime] = useState<string | null>(null)
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null)

  useEffect(() => {
    // TODO: Phase 3 - attendance API
    fetch('/api/v1/attendance/today', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          if (data.check_in_time) {
            setCheckedIn(true)
            setCheckInTime(data.check_in_time.slice(11, 16))
          }
          if (data.check_out_time) {
            setCheckedOut(true)
            setCheckOutTime(data.check_out_time.slice(11, 16))
          }
        }
      })
      .catch(() => {})
  }, [])

  async function handleCheckIn() {
    // TODO: Phase 3 - attendance API
    try {
      const res = await fetch('/api/v1/attendance/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })
      if (!res.ok) throw new Error('API not available')
      const data = await res.json()
      setCheckedIn(true)
      setCheckInTime(data.check_in_time ? data.check_in_time.slice(11, 16) : new Date().toTimeString().slice(0, 5))
    } catch {
      alert('출결 기능은 준비 중입니다.')
    }
  }

  async function handleCheckOut() {
    // TODO: Phase 3 - attendance API
    try {
      const res = await fetch('/api/v1/attendance/check-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })
      if (!res.ok) throw new Error('API not available')
      const data = await res.json()
      setCheckedOut(true)
      setCheckOutTime(data.check_out_time ? data.check_out_time.slice(11, 16) : new Date().toTimeString().slice(0, 5))
    } catch {
      alert('출결 기능은 준비 중입니다.')
    }
  }

  const now = new Date()
  const todayStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          출석 관리
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
          {todayStr} · {timeStr}
        </p>
      </div>

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
                {checkedIn && checkInTime ? checkInTime : '--:--'}
              </p>
            </div>
            <div style={{ width: 1, height: 40, background: '#e2e8f0' }} />
            <div>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>퇴근 시각</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: checkedOut ? '#059669' : '#94a3b8' }}>
                {checkedOut && checkOutTime ? checkOutTime : '--:--'}
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
            disabled={checkedIn}
            style={{
              padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 600,
              border: 'none', cursor: checkedIn ? 'not-allowed' : 'pointer',
              background: checkedIn ? '#f1f5f9' : '#059669',
              color: checkedIn ? '#94a3b8' : '#fff',
              boxShadow: checkedIn ? 'none' : '0 2px 8px rgba(5,150,105,0.3)',
            }}
          >
            {checkedIn ? '출근 완료' : '출근하기'}
          </button>
          <button
            onClick={handleCheckOut}
            disabled={!checkedIn || checkedOut}
            style={{
              padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 600,
              border: 'none', cursor: (!checkedIn || checkedOut) ? 'not-allowed' : 'pointer',
              background: checkedOut ? '#f1f5f9' : (!checkedIn ? '#f1f5f9' : '#e11d48'),
              color: checkedOut || !checkedIn ? '#94a3b8' : '#fff',
              boxShadow: checkedOut || !checkedIn ? 'none' : '0 2px 8px rgba(225,29,72,0.3)',
            }}
          >
            {checkedOut ? '퇴근 완료' : '퇴근하기'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="opacity-0 animate-fade-in stagger-2" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24,
      }}>
        <StatCard label="이번 달 출근일" value={`${monthlyStats.totalDays}일`} accent="#4f46e5" />
        <StatCard label="평균 근무시간" value={`${monthlyStats.avgHours}시간`} accent="#059669" />
        <StatCard label="지각 횟수" value={`${monthlyStats.lateDays}회`} accent="#d97706" />
        <StatCard label="조퇴 횟수" value={`${monthlyStats.earlyLeaves}회`} accent="#64748b" />
      </div>

      {/* Weekly Table */}
      <div className="opacity-0 animate-fade-in stagger-3" style={{ ...cardStyle, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>이번 주 출석 현황</h3>
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
              {weeklyData.map((row) => {
                const sc = statusColors[row.status] || statusColors['예정']
                return (
                  <tr key={row.date} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 500 }}>{row.date}</td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{row.day}</td>
                    <td style={{ padding: '12px 16px', color: row.checkIn ? '#0f172a' : '#cbd5e1', fontFamily: 'monospace' }}>
                      {row.checkIn || '--:--'}
                    </td>
                    <td style={{ padding: '12px 16px', color: row.checkOut ? '#0f172a' : '#cbd5e1', fontFamily: 'monospace' }}>
                      {row.checkOut || '--:--'}
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

      {/* Recent Logs */}
      <div className="opacity-0 animate-fade-in stagger-4" style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>지난 출석 기록</h3>
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
              {recentLogs.map((row) => {
                const sc = statusColors[row.status] || statusColors['정상']
                return (
                  <tr key={row.date} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 500 }}>{row.date}</td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{row.day}</td>
                    <td style={{ padding: '12px 16px', color: '#0f172a', fontFamily: 'monospace' }}>{row.checkIn}</td>
                    <td style={{ padding: '12px 16px', color: '#0f172a', fontFamily: 'monospace' }}>{row.checkOut}</td>
                    <td style={{ padding: '12px 16px', color: '#0f172a' }}>{row.hours}h</td>
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
