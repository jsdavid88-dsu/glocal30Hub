import { useState, useMemo } from 'react'

interface MiniCalendarProps {
  mode: 'week' | 'day'
  selectedDate: Date
  onSelect: (date: Date) => void
  markedDates: Record<string, 'submitted' | 'partial' | 'none'>
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function formatKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getMonday(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy
}

function isSameWeek(a: Date, b: Date): boolean {
  const monA = getMonday(a)
  const monB = getMonday(b)
  return isSameDay(monA, monB)
}

export default function MiniCalendar({ mode, selectedDate, onSelect, markedDates }: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth())
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear())

  const today = useMemo(() => new Date(), [])

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const startDay = firstDay.getDay() // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    const days: (Date | null)[] = []
    // Leading blanks
    for (let i = 0; i < startDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(viewYear, viewMonth, d))
    // Trailing blanks to complete the grid
    while (days.length % 7 !== 0) days.push(null)

    return days
  }, [viewMonth, viewYear])

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  function handleClick(d: Date) {
    onSelect(d)
  }

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

  const dotColors: Record<string, string> = {
    submitted: '#059669',
    partial: '#d97706',
    none: 'transparent',
  }

  return (
    <div style={{
      width: 250,
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 14,
      padding: '14px 12px 10px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      userSelect: 'none',
    }}>
      {/* Month/Year header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, padding: '0 2px',
      }}>
        <button onClick={prevMonth} style={navBtnStyle} aria-label="이전 달">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
          {viewYear}년 {monthNames[viewMonth]}
        </span>
        <button onClick={nextMonth} style={navBtnStyle} aria-label="다음 달">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {/* Day of week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, marginBottom: 4 }}>
        {DAY_LABELS.map((label, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 10, fontWeight: 600,
            color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#94a3b8',
            padding: '2px 0',
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0 }}>
        {calendarDays.map((day, idx) => {
          if (!day) {
            return <div key={`blank-${idx}`} style={{ height: 30 }} />
          }

          const key = formatKey(day)
          const isToday = isSameDay(day, today)
          const marked = markedDates[key]
          const isCurrentMonth = day.getMonth() === viewMonth

          let isSelected = false
          let isInSelectedWeek = false

          if (mode === 'day') {
            isSelected = isSameDay(day, selectedDate)
          } else {
            isSelected = isSameDay(day, selectedDate)
            isInSelectedWeek = isSameWeek(day, selectedDate)
            // Only highlight Mon-Fri for week mode
            const dayOfWeek = day.getDay()
            if (isInSelectedWeek && (dayOfWeek === 0 || dayOfWeek === 6)) {
              isInSelectedWeek = false
            }
          }

          const dayOfWeek = day.getDay()
          let textColor = '#0f172a'
          if (dayOfWeek === 0) textColor = '#dc2626'
          if (dayOfWeek === 6) textColor = '#2563eb'
          if (!isCurrentMonth) textColor = '#cbd5e1'

          return (
            <div
              key={key}
              onClick={() => handleClick(day)}
              style={{
                height: 30,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: mode === 'day' ? 8 : 4,
                background: isSelected
                  ? '#4f46e5'
                  : isInSelectedWeek
                    ? '#e0e7ff'
                    : 'transparent',
                transition: 'background 0.12s',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isSelected && !isInSelectedWeek) {
                  e.currentTarget.style.background = '#f1f5f9'
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected && !isInSelectedWeek) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <span style={{
                fontSize: 11,
                fontWeight: isToday || isSelected ? 700 : 500,
                color: isSelected ? '#fff' : textColor,
                width: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                border: isToday && !isSelected ? '2px solid #4f46e5' : 'none',
              }}>
                {day.getDate()}
              </span>
              {/* Dot indicator */}
              {marked && marked !== 'none' && (
                <div style={{
                  position: 'absolute',
                  bottom: 1,
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: dotColors[marked],
                }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 6,
  color: '#64748b',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s',
}
