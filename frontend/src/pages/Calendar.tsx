import { useState, useEffect } from 'react'

interface CalendarEvent {
  date: number
  title: string
  type: 'class' | 'meeting' | 'deadline' | 'presentation'
}

const eventTypeConfig = {
  class: { label: '수업', bg: '#e0e7ff', color: '#4338ca', dot: '#4f46e5' },
  meeting: { label: '회의', bg: '#d1fae5', color: '#047857', dot: '#059669' },
  deadline: { label: '마감', bg: '#ffe4e6', color: '#be123c', dot: '#e11d48' },
  presentation: { label: '발표', bg: '#fef3c7', color: '#b45309', dot: '#d97706' },
}

// TODO: Phase 3 - events API
const mockEventsForMonth = (): CalendarEvent[] => [
  { date: 3, title: '대학원 세미나', type: 'class' },
  { date: 5, title: 'KOCCA 주간회의', type: 'meeting' },
  { date: 7, title: 'NRF 논문 초안 마감', type: 'deadline' },
  { date: 10, title: '대학원 세미나', type: 'class' },
  { date: 11, title: '지도교수 면담', type: 'meeting' },
  { date: 12, title: 'KOCCA 주간회의', type: 'meeting' },
  { date: 14, title: 'CHI 2026 발표', type: 'presentation' },
  { date: 15, title: '중간보고서 제출', type: 'deadline' },
  { date: 17, title: '대학원 세미나', type: 'class' },
  { date: 19, title: 'KOCCA 주간회의', type: 'meeting' },
  { date: 20, title: '한국서사학회 발표', type: 'presentation' },
  { date: 22, title: '예산 보고서 마감', type: 'deadline' },
  { date: 24, title: '대학원 세미나', type: 'class' },
  { date: 25, title: '프로젝트 전체 회의', type: 'meeting' },
  { date: 26, title: 'KOCCA 주간회의', type: 'meeting' },
  { date: 28, title: 'XR 플랫폼 데모', type: 'presentation' },
  { date: 31, title: 'MOC 중간보고서 마감', type: 'deadline' },
]

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1)) // March 2026
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const [allEvents, setAllEvents] = useState<CalendarEvent[]>(mockEventsForMonth())

  useEffect(() => {
    // TODO: Phase 3 - events API
    fetch('/api/v1/events', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => {
        const items = data.items || data
        if (Array.isArray(items) && items.length > 0) {
          // Map API event shape to CalendarEvent; fallback to mock if shape doesn't match
          setAllEvents(items)
        } else {
          setAllEvents(mockEventsForMonth())
        }
      })
      .catch(() => setAllEvents(mockEventsForMonth()))
  }, [])

  const events = allEvents.filter((e) => {
    // If events come from API they may have a full date; for now we filter by day number
    return true
  })

  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToday = () => setCurrentDate(new Date(2026, 2, 11))

  const today = 11 // Mock today as March 11

  // Build calendar grid
  const cells: { day: number; inMonth: boolean; events: CalendarEvent[] }[] = []

  // Previous month trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, inMonth: false, events: [] })
  }
  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, events: events.filter((e) => e.date === d) })
  }
  // Next month leading days
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, inMonth: false, events: [] })
  }

  const monthLabel = currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          캘린더
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
          연구 일정 및 마감을 관리합니다.
        </p>
      </div>

      {/* Navigation */}
      <div className="opacity-0 animate-fade-in stagger-1" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={prevMonth} style={{
            width: 36, height: 36, borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg style={{ width: 16, height: 16, color: '#475569' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', minWidth: 160, textAlign: 'center' as const }}>
            {monthLabel}
          </h2>
          <button onClick={nextMonth} style={{
            width: 36, height: 36, borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg style={{ width: 16, height: 16, color: '#475569' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={goToday} style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#4f46e5',
          }}>
            오늘
          </button>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const }}>
          {Object.entries(eventTypeConfig).map(([key, cfg]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot }} />
              <span style={{ fontSize: 12, color: '#64748b' }}>{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, overflow: 'hidden' }}>
        {/* Day Headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: '1px solid #e2e8f0',
        }}>
          {DAYS_KO.map((day, i) => (
            <div key={day} style={{
              padding: '10px', textAlign: 'center' as const,
              fontSize: 12, fontWeight: 600,
              color: i === 0 ? '#e11d48' : i === 6 ? '#4f46e5' : '#64748b',
            }}>
              {day}
            </div>
          ))}
        </div>

        {/* Date Cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((cell, idx) => {
            const isToday = cell.inMonth && cell.day === today && month === 2
            const dayOfWeek = idx % 7
            return (
              <div
                key={idx}
                style={{
                  minHeight: 100, padding: '6px 8px',
                  borderRight: dayOfWeek < 6 ? '1px solid #f1f5f9' : 'none',
                  borderBottom: idx < 35 ? '1px solid #f1f5f9' : 'none',
                  background: isToday ? '#eef2ff' : cell.inMonth ? '#fff' : '#fafbfc',
                }}
              >
                <div style={{
                  fontSize: 13, fontWeight: isToday ? 700 : 400,
                  color: !cell.inMonth ? '#cbd5e1' : isToday ? '#4f46e5' :
                    dayOfWeek === 0 ? '#e11d48' : dayOfWeek === 6 ? '#4f46e5' : '#334155',
                  marginBottom: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: isToday ? 28 : 'auto', height: isToday ? 28 : 'auto',
                  borderRadius: isToday ? '50%' : 0,
                  background: isToday ? '#4f46e5' : 'transparent',
                  ...(isToday ? { color: '#fff' } : {}),
                }}>
                  {cell.day}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
                  {cell.events.map((ev, ei) => {
                    const cfg = eventTypeConfig[ev.type]
                    return (
                      <div key={ei} style={{
                        padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                        background: cfg.bg, color: cfg.color,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                        cursor: 'pointer',
                      }}>
                        {ev.title}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Upcoming events sidebar */}
      <div className="opacity-0 animate-fade-in stagger-3" style={{ ...cardStyle, marginTop: 20, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>다가오는 일정</h3>
        </div>
        <div>
          {events.filter((e) => e.date >= today).slice(0, 5).map((ev, i) => {
            const cfg = eventTypeConfig[ev.type]
            return (
              <div key={i} style={{
                padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: i < 4 ? '1px solid #f8fafc' : 'none',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{ev.title}</p>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  background: cfg.bg, color: cfg.color,
                }}>
                  {cfg.label}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 60, textAlign: 'right' as const }}>
                  3/{ev.date}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
