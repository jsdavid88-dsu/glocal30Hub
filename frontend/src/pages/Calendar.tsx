import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventType =
  | 'class'
  | 'meeting'
  | 'deadline'
  | 'presentation'
  | 'leave'
  | 'admin'
  | 'personal'
  | 'project'
  | 'sota'

interface ApiEvent {
  id: string
  title: string
  description: string | null
  event_type: EventType
  start_at: string
  end_at: string
  all_day: boolean
  creator_id: string
  project_id: string | null
  task_id: string | null
  visibility: string
  source: string
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const eventTypeConfig: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  class:        { label: '수업',   bg: '#e0e7ff', color: '#4338ca', dot: '#4f46e5' },
  meeting:      { label: '회의',   bg: '#d1fae5', color: '#047857', dot: '#059669' },
  deadline:     { label: '마감',   bg: '#ffe4e6', color: '#be123c', dot: '#e11d48' },
  presentation: { label: '발표',   bg: '#fef3c7', color: '#b45309', dot: '#d97706' },
  leave:        { label: '휴가',   bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
  admin:        { label: '행정',   bg: '#fce7f3', color: '#9d174d', dot: '#db2777' },
  personal:     { label: '개인',   bg: '#ccfbf1', color: '#0f766e', dot: '#14b8a6' },
  project:      { label: '프로젝트', bg: '#e0e7ff', color: '#3730a3', dot: '#6366f1' },
  sota:         { label: 'SOTA',   bg: '#fef9c3', color: '#854d0e', dot: '#eab308' },
}

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'class', label: '수업' },
  { value: 'meeting', label: '회의' },
  { value: 'deadline', label: '마감' },
  { value: 'presentation', label: '발표' },
  { value: 'leave', label: '휴가' },
  { value: 'admin', label: '행정' },
  { value: 'personal', label: '개인' },
  { value: 'project', label: '프로젝트' },
  { value: 'sota', label: 'SOTA' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function formatDateParam(year: number, month: number, day: number) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function parseDateDay(isoStr: string): number {
  const d = new Date(isoStr)
  return d.getDate()
}

function parseDateMonth(isoStr: string): number {
  const d = new Date(isoStr)
  return d.getMonth()
}

function parseDateYear(isoStr: string): number {
  const d = new Date(isoStr)
  return d.getFullYear()
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr)
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h < 12 ? '오전' : '오후'
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${period} ${displayH}:${pad2(m)}`
}

function formatDateKo(isoStr: string): string {
  const d = new Date(isoStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function isEventOnDate(ev: ApiEvent, year: number, month: number, day: number): boolean {
  return parseDateYear(ev.start_at) === year && parseDateMonth(ev.start_at) === month && parseDateDay(ev.start_at) === day
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Calendar() {
  const realToday = new Date()
  const [currentDate, setCurrentDate] = useState(new Date(realToday.getFullYear(), realToday.getMonth(), 1))
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const [events, setEvents] = useState<ApiEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    event_type: 'meeting' as EventType,
    start_at: '',
    end_at: '',
    all_day: false,
    description: '',
  })
  const [creating, setCreating] = useState(false)

  // Detail modal state
  const [selectedEvent, setSelectedEvent] = useState<ApiEvent | null>(null)

  // ---------------------------------------------------------------------------
  // Fetch events for current month
  // ---------------------------------------------------------------------------

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const start = formatDateParam(year, month, 1)
      const end = formatDateParam(year, month, lastDayOfMonth(year, month))
      const res = await api.events.list({ start_date: start, end_date: end, limit: '200' }) as any
      const data = res?.data ?? res?.items ?? []
      if (Array.isArray(data)) {
        setEvents(data)
      } else {
        setEvents([])
      }
    } catch (err: any) {
      console.error('Failed to fetch events:', err)
      setError('일정을 불러오지 못했습니다.')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // ---------------------------------------------------------------------------
  // Create event
  // ---------------------------------------------------------------------------

  const handleCreate = async () => {
    if (!createForm.title.trim() || !createForm.start_at || !createForm.end_at) return
    setCreating(true)
    try {
      await api.events.create({
        title: createForm.title.trim(),
        event_type: createForm.event_type,
        start_at: new Date(createForm.start_at).toISOString(),
        end_at: new Date(createForm.end_at).toISOString(),
        all_day: createForm.all_day,
        description: createForm.description || null,
      })
      setShowCreate(false)
      setCreateForm({ title: '', event_type: 'meeting', start_at: '', end_at: '', all_day: false, description: '' })
      await fetchEvents()
    } catch (err) {
      console.error('Failed to create event:', err)
      alert('일정 생성에 실패했습니다.')
    } finally {
      setCreating(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToday = () => {
    const now = new Date()
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  // ---------------------------------------------------------------------------
  // Calendar grid
  // ---------------------------------------------------------------------------

  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = lastDayOfMonth(year, month)
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const todayDay = realToday.getDate()
  const todayMonth = realToday.getMonth()
  const todayYear = realToday.getFullYear()

  const cells: { day: number; inMonth: boolean; events: ApiEvent[] }[] = []

  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, inMonth: false, events: [] })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      inMonth: true,
      events: events.filter((e) => isEventOnDate(e, year, month, d)),
    })
  }
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, inMonth: false, events: [] })
  }

  const monthLabel = currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })

  // Upcoming events: events from today onward, sorted by start_at
  const upcomingEvents = events
    .filter((e) => {
      const d = new Date(e.start_at)
      return d >= new Date(todayYear, todayMonth, todayDay)
    })
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    .slice(0, 5)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid #e2e8f0', fontSize: 13, outline: 'none',
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
              캘린더
            </h1>
            <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
              연구 일정 및 마감을 관리합니다.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            새 일정
          </button>
        </div>
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

      {/* Loading / Error */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 14 }}>
          일정을 불러오는 중...
        </div>
      )}
      {error && !loading && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#e11d48', fontSize: 14, marginBottom: 12 }}>
          {error}
          <button onClick={fetchEvents} style={{
            marginLeft: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
            background: '#fff', cursor: 'pointer', fontSize: 12, color: '#4f46e5',
          }}>
            다시 시도
          </button>
        </div>
      )}

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
            const isToday = cell.inMonth && cell.day === todayDay && month === todayMonth && year === todayYear
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
                  {cell.events.map((ev) => {
                    const cfg = eventTypeConfig[ev.event_type] ?? eventTypeConfig.meeting
                    return (
                      <div
                        key={ev.id}
                        onClick={() => setSelectedEvent(ev)}
                        style={{
                          padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                          background: cfg.bg, color: cfg.color,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                          cursor: 'pointer',
                        }}
                        title={ev.title}
                      >
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

      {/* Empty state */}
      {!loading && !error && events.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 14 }}>
          이번 달 일정이 없습니다.
        </div>
      )}

      {/* Upcoming events sidebar */}
      <div className="opacity-0 animate-fade-in stagger-3" style={{ ...cardStyle, marginTop: 20, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>다가오는 일정</h3>
        </div>
        <div>
          {upcomingEvents.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              다가오는 일정이 없습니다.
            </div>
          )}
          {upcomingEvents.map((ev, i) => {
            const cfg = eventTypeConfig[ev.event_type] ?? eventTypeConfig.meeting
            return (
              <div
                key={ev.id}
                onClick={() => setSelectedEvent(ev)}
                style={{
                  padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12,
                  borderBottom: i < upcomingEvents.length - 1 ? '1px solid #f8fafc' : 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{ev.title}</p>
                  {!ev.all_day && (
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{formatTime(ev.start_at)}</p>
                  )}
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  background: cfg.bg, color: cfg.color,
                }}>
                  {cfg.label}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 60, textAlign: 'right' as const }}>
                  {formatDateKo(ev.start_at)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* --------------- Create Event Modal --------------- */}
      {showCreate && (
        <div
          onClick={() => setShowCreate(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, padding: '28px 32px',
              width: 460, maxHeight: '85vh', overflowY: 'auto' as const,
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 20 }}>새 일정</h3>

            {/* Title */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>제목 *</label>
              <input
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="일정 제목"
                style={inputStyle}
              />
            </div>

            {/* Event type */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>유형</label>
              <select
                value={createForm.event_type}
                onChange={(e) => setCreateForm((f) => ({ ...f, event_type: e.target.value as EventType }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* All day */}
            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={createForm.all_day}
                onChange={(e) => setCreateForm((f) => ({ ...f, all_day: e.target.checked }))}
                id="allDayCheck"
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="allDayCheck" style={{ fontSize: 13, color: '#475569', cursor: 'pointer' }}>종일 일정</label>
            </div>

            {/* Start */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                시작 {createForm.all_day ? '날짜' : '날짜/시간'} *
              </label>
              <input
                type={createForm.all_day ? 'date' : 'datetime-local'}
                value={createForm.start_at}
                onChange={(e) => setCreateForm((f) => ({ ...f, start_at: e.target.value }))}
                style={inputStyle}
              />
            </div>

            {/* End */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                종료 {createForm.all_day ? '날짜' : '날짜/시간'} *
              </label>
              <input
                type={createForm.all_day ? 'date' : 'datetime-local'}
                value={createForm.end_at}
                onChange={(e) => setCreateForm((f) => ({ ...f, end_at: e.target.value }))}
                style={inputStyle}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>설명</label>
              <textarea
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="설명 (선택)"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' as const }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0',
                  background: '#fff', fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createForm.title.trim() || !createForm.start_at || !createForm.end_at}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: creating ? '#a5b4fc' : '#4f46e5', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer',
                }}
              >
                {creating ? '생성 중...' : '일정 생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------- Event Detail Modal --------------- */}
      {selectedEvent && (
        <div
          onClick={() => setSelectedEvent(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, padding: '28px 32px',
              width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            }}
          >
            {(() => {
              const cfg = eventTypeConfig[selectedEvent.event_type] ?? eventTypeConfig.meeting
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.dot }} />
                    <span style={{
                      padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: cfg.bg, color: cfg.color,
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
                    {selectedEvent.title}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span style={{ fontSize: 13, color: '#475569' }}>
                        {new Date(selectedEvent.start_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                      </span>
                    </div>
                    {!selectedEvent.all_day && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span style={{ fontSize: 13, color: '#475569' }}>
                          {formatTime(selectedEvent.start_at)} ~ {formatTime(selectedEvent.end_at)}
                        </span>
                      </div>
                    )}
                    {selectedEvent.all_day && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span style={{ fontSize: 13, color: '#475569' }}>종일</span>
                      </div>
                    )}
                  </div>
                  {selectedEvent.description && (
                    <div style={{ marginBottom: 20, padding: '12px 16px', background: '#f8fafc', borderRadius: 10 }}>
                      <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>
                        {selectedEvent.description}
                      </p>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setSelectedEvent(null)}
                      style={{
                        padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0',
                        background: '#fff', fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer',
                      }}
                    >
                      닫기
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
