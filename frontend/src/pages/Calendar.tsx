import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useRole } from '../contexts/RoleContext'

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

type ViewMode = 'monthly' | 'weekly'

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

interface StudentUser {
  id: string
  name: string
  email: string
  role: string
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
const DAYS_KO_WEEKLY = ['월', '화', '수', '목', '금', '토', '일']

const WEEKLY_HOURS = Array.from({ length: 15 }, (_, i) => i + 8) // 8am - 10pm

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

/** Get Monday of the week containing the given date */
function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

/** Format datetime-local input value from ISO string */
function toDatetimeLocalValue(isoStr: string): string {
  const d = new Date(isoStr)
  const yyyy = d.getFullYear()
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const min = pad2(d.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

function toDateValue(isoStr: string): string {
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Calendar() {
  const { currentRole } = useRole()
  const realToday = new Date()
  const [currentDate, setCurrentDate] = useState(new Date(realToday.getFullYear(), realToday.getMonth(), 1))
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [weekStart, setWeekStart] = useState(() => getMonday(realToday))

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

  // Detail/Edit modal state
  const [selectedEvent, setSelectedEvent] = useState<ApiEvent | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    event_type: 'meeting' as EventType,
    start_at: '',
    end_at: '',
    all_day: false,
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Professor student filter
  const [students, setStudents] = useState<StudentUser[]>([])
  const [studentFilter, setStudentFilter] = useState<string>('all') // 'all' | 'advisees' | specific user id

  // ---------------------------------------------------------------------------
  // Fetch students for professor filter
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (currentRole !== 'professor') return
    const fetchStudents = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch('/api/v1/users/?role=student', {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (!res.ok) return
        const data = await res.json()
        const list = data?.data ?? data?.items ?? data
        if (Array.isArray(list)) {
          setStudents(list)
        }
      } catch {
        // silently fail
      }
    }
    fetchStudents()
  }, [currentRole])

  // ---------------------------------------------------------------------------
  // Fetch events
  // ---------------------------------------------------------------------------

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let start: string, end: string
      if (viewMode === 'monthly') {
        start = formatDateParam(year, month, 1)
        end = formatDateParam(year, month, lastDayOfMonth(year, month))
      } else {
        const ws = new Date(weekStart)
        const we = new Date(ws)
        we.setDate(we.getDate() + 6)
        start = `${ws.getFullYear()}-${pad2(ws.getMonth() + 1)}-${pad2(ws.getDate())}`
        end = `${we.getFullYear()}-${pad2(we.getMonth() + 1)}-${pad2(we.getDate())}`
      }
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
  }, [year, month, viewMode, weekStart])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // ---------------------------------------------------------------------------
  // Filter events by student (professor only)
  // ---------------------------------------------------------------------------

  const filteredEvents = (() => {
    if (currentRole !== 'professor' || studentFilter === 'all') return events
    if (studentFilter === 'advisees') {
      // Show events from all students (advisees concept - show all student-created events)
      const studentIds = new Set(students.map(s => s.id))
      return events.filter(e => studentIds.has(e.creator_id))
    }
    // specific student
    return events.filter(e => e.creator_id === studentFilter)
  })()

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
  // Edit event
  // ---------------------------------------------------------------------------

  const openEditMode = (ev: ApiEvent) => {
    setEditMode(true)
    setEditForm({
      title: ev.title,
      event_type: ev.event_type,
      start_at: ev.all_day ? toDateValue(ev.start_at) : toDatetimeLocalValue(ev.start_at),
      end_at: ev.all_day ? toDateValue(ev.end_at) : toDatetimeLocalValue(ev.end_at),
      all_day: ev.all_day,
      description: ev.description || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!selectedEvent || !editForm.title.trim() || !editForm.start_at || !editForm.end_at) return
    setSaving(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/v1/events/${selectedEvent.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: editForm.title.trim(),
          event_type: editForm.event_type,
          start_at: new Date(editForm.start_at).toISOString(),
          end_at: new Date(editForm.end_at).toISOString(),
          all_day: editForm.all_day,
          description: editForm.description || null,
        }),
      })
      if (!res.ok) throw new Error(`API Error: ${res.status}`)
      setSelectedEvent(null)
      setEditMode(false)
      await fetchEvents()
    } catch (err) {
      console.error('Failed to update event:', err)
      alert('일정 수정에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Delete event
  // ---------------------------------------------------------------------------

  const handleDelete = async () => {
    if (!selectedEvent) return
    setDeleting(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/v1/events/${selectedEvent.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) throw new Error(`API Error: ${res.status}`)
      setSelectedEvent(null)
      setEditMode(false)
      setShowDeleteConfirm(false)
      await fetchEvents()
    } catch (err) {
      console.error('Failed to delete event:', err)
      alert('일정 삭제에 실패했습니다.')
    } finally {
      setDeleting(false)
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
    setWeekStart(getMonday(now))
  }
  const prevWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }
  const nextWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  // ---------------------------------------------------------------------------
  // Monthly Calendar grid
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
      events: filteredEvents.filter((e) => isEventOnDate(e, year, month, d)),
    })
  }
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, inMonth: false, events: [] })
  }

  const monthLabel = currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })

  // ---------------------------------------------------------------------------
  // Weekly view data
  // ---------------------------------------------------------------------------

  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const weekLabel = (() => {
    const ws = weekDays[0]
    const we = weekDays[6]
    const sameMonth = ws.getMonth() === we.getMonth()
    if (sameMonth) {
      return `${ws.getFullYear()}년 ${ws.getMonth() + 1}월 ${ws.getDate()}일 - ${we.getDate()}일`
    }
    return `${ws.getMonth() + 1}/${ws.getDate()} - ${we.getMonth() + 1}/${we.getDate()}`
  })()

  /** Get events for a specific day in the weekly view */
  function getWeekDayEvents(date: Date): ApiEvent[] {
    return filteredEvents.filter(e =>
      isEventOnDate(e, date.getFullYear(), date.getMonth(), date.getDate())
    )
  }

  /** Check if a date is today */
  function isDayToday(date: Date): boolean {
    return date.getFullYear() === todayYear && date.getMonth() === todayMonth && date.getDate() === todayDay
  }

  // Upcoming events
  const upcomingEvents = filteredEvents
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

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 8,
    border: active ? 'none' : '1px solid #e2e8f0',
    background: active ? '#4f46e5' : '#fff',
    color: active ? '#fff' : '#64748b',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    transition: 'all 0.15s ease',
  })

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <style>{`
        @media (max-width: 767px) {
          .cal-header-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .cal-nav-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .cal-legend {
            display: none !important;
          }
          .cal-grid-wrap {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .cal-grid-wrap > div {
            min-width: 500px;
          }
        }
      `}</style>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <div className="cal-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
              캘린더
            </h1>
            <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
              연구 일정 및 마감을 관리합니다.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* View Mode Toggle */}
            <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
              <button onClick={() => setViewMode('monthly')} style={toggleBtnStyle(viewMode === 'monthly')}>
                월간
              </button>
              <button onClick={() => setViewMode('weekly')} style={toggleBtnStyle(viewMode === 'weekly')}>
                주간
              </button>
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
      </div>

      {/* Professor student filter */}
      {currentRole === 'professor' && (
        <div className="opacity-0 animate-fade-in stagger-1" style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px', background: '#f8fafc', borderRadius: 10,
          }}>
            <svg style={{ width: 16, height: 16, color: '#64748b', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m3 5.197V21" />
            </svg>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#475569', flexShrink: 0 }}>학생 필터:</label>
            <select
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              style={{
                padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                fontSize: 13, color: '#334155', cursor: 'pointer', outline: 'none',
                background: '#fff', minWidth: 140,
              }}
            >
              <option value="all">전체</option>
              <option value="advisees">지도학생만</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="opacity-0 animate-fade-in stagger-1 cal-nav-row" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={viewMode === 'monthly' ? prevMonth : prevWeek} style={{
            width: 36, height: 36, borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg style={{ width: 16, height: 16, color: '#475569' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', minWidth: 200, textAlign: 'center' as const }}>
            {viewMode === 'monthly' ? monthLabel : weekLabel}
          </h2>
          <button onClick={viewMode === 'monthly' ? nextMonth : nextWeek} style={{
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
        <div className="cal-legend" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const }}>
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

      {/* ===================== MONTHLY VIEW ===================== */}
      {viewMode === 'monthly' && (
        <>
          <div className="opacity-0 animate-fade-in stagger-2 cal-grid-wrap" style={{ ...cardStyle, overflow: 'hidden' }}>
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
          {!loading && !error && filteredEvents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 14 }}>
              이번 달 일정이 없습니다.
            </div>
          )}
        </>
      )}

      {/* ===================== WEEKLY VIEW ===================== */}
      {viewMode === 'weekly' && (
        <div className="opacity-0 animate-fade-in stagger-2 cal-grid-wrap" style={{ ...cardStyle, overflow: 'hidden' }}>
          {/* Day headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)',
            borderBottom: '1px solid #e2e8f0',
          }}>
            <div style={{ padding: '10px 4px', borderRight: '1px solid #f1f5f9' }} />
            {weekDays.map((date, i) => {
              const isToday = isDayToday(date)
              return (
                <div key={i} style={{
                  padding: '10px 4px', textAlign: 'center' as const,
                  borderRight: i < 6 ? '1px solid #f1f5f9' : 'none',
                  background: isToday ? '#eef2ff' : 'transparent',
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 600,
                    color: i >= 5 ? (i === 6 ? '#e11d48' : '#4f46e5') : '#64748b',
                    marginBottom: 2,
                  }}>
                    {DAYS_KO_WEEKLY[i]}
                  </div>
                  <div style={{
                    fontSize: 16, fontWeight: isToday ? 700 : 400,
                    color: isToday ? '#fff' : '#334155',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: isToday ? 30 : 'auto', height: isToday ? 30 : 'auto',
                    borderRadius: isToday ? '50%' : 0,
                    background: isToday ? '#4f46e5' : 'transparent',
                  }}>
                    {date.getDate()}
                  </div>
                </div>
              )
            })}
          </div>

          {/* All-day events row */}
          {(() => {
            const hasAllDay = weekDays.some(date => getWeekDayEvents(date).some(e => e.all_day))
            if (!hasAllDay) return null
            return (
              <div style={{
                display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)',
                borderBottom: '1px solid #e2e8f0',
              }}>
                <div style={{
                  padding: '6px 4px', fontSize: 10, color: '#94a3b8', textAlign: 'right' as const,
                  borderRight: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  종일
                </div>
                {weekDays.map((date, i) => {
                  const dayEvents = getWeekDayEvents(date).filter(e => e.all_day)
                  const isToday = isDayToday(date)
                  return (
                    <div key={i} style={{
                      padding: '4px', minHeight: 28,
                      borderRight: i < 6 ? '1px solid #f1f5f9' : 'none',
                      background: isToday ? '#eef2ff' : 'transparent',
                      display: 'flex', flexDirection: 'column' as const, gap: 2,
                    }}>
                      {dayEvents.map(ev => {
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
                  )
                })}
              </div>
            )
          })()}

          {/* Time grid */}
          <div style={{ maxHeight: 600, overflowY: 'auto' as const }}>
            {WEEKLY_HOURS.map((hour) => (
              <div key={hour} style={{
                display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)',
                minHeight: 48,
              }}>
                {/* Time label */}
                <div style={{
                  padding: '2px 8px 2px 4px', fontSize: 11, color: '#94a3b8',
                  textAlign: 'right' as const, borderRight: '1px solid #f1f5f9',
                  borderBottom: '1px solid #f8fafc',
                }}>
                  {hour < 12 ? `오전 ${hour}` : hour === 12 ? '오후 12' : `오후 ${hour - 12}`}시
                </div>
                {/* Day columns */}
                {weekDays.map((date, i) => {
                  const dayEvents = getWeekDayEvents(date).filter(e => {
                    if (e.all_day) return false
                    const startHour = new Date(e.start_at).getHours()
                    return startHour === hour
                  })
                  const isToday = isDayToday(date)
                  return (
                    <div key={i} style={{
                      padding: '2px 3px',
                      borderRight: i < 6 ? '1px solid #f1f5f9' : 'none',
                      borderBottom: '1px solid #f8fafc',
                      background: isToday ? '#fafaff' : 'transparent',
                      display: 'flex', flexDirection: 'column' as const, gap: 2,
                    }}>
                      {dayEvents.map(ev => {
                        const cfg = eventTypeConfig[ev.event_type] ?? eventTypeConfig.meeting
                        const startH = new Date(ev.start_at).getHours()
                        const endH = new Date(ev.end_at).getHours()
                        const endM = new Date(ev.end_at).getMinutes()
                        const durationHours = Math.max((endH + endM / 60) - startH, 0.5)
                        const blockHeight = Math.min(durationHours * 44, 180)
                        return (
                          <div
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            style={{
                              padding: '4px 6px', borderRadius: 6,
                              background: cfg.bg, color: cfg.color,
                              fontSize: 11, fontWeight: 500,
                              borderLeft: `3px solid ${cfg.dot}`,
                              cursor: 'pointer',
                              minHeight: blockHeight,
                              overflow: 'hidden',
                              position: 'relative' as const,
                            }}
                            title={`${ev.title} (${formatTime(ev.start_at)} ~ ${formatTime(ev.end_at)})`}
                          >
                            <div style={{
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' as const, marginBottom: 1,
                            }}>
                              {ev.title}
                            </div>
                            <div style={{ fontSize: 9, opacity: 0.8 }}>
                              {formatTime(ev.start_at)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Empty state for weekly */}
          {!loading && !error && filteredEvents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 14 }}>
              이번 주 일정이 없습니다.
            </div>
          )}
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

      {/* --------------- Event Detail / Edit Modal --------------- */}
      {selectedEvent && (
        <div
          onClick={() => { setSelectedEvent(null); setEditMode(false); setShowDeleteConfirm(false) }}
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
            {/* Delete confirmation overlay */}
            {showDeleteConfirm && (
              <div style={{
                padding: '20px', background: '#fff7ed', borderRadius: 12, marginBottom: 16,
                border: '1px solid #fed7aa',
              }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: '#9a3412', marginBottom: 12 }}>
                  정말 삭제하시겠습니까?
                </p>
                <p style={{ fontSize: 12, color: '#c2410c', marginBottom: 16 }}>
                  이 일정을 삭제하면 복구할 수 없습니다.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    style={{
                      padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0',
                      background: '#fff', fontSize: 12, color: '#64748b', cursor: 'pointer',
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{
                      padding: '6px 14px', borderRadius: 6, border: 'none',
                      background: deleting ? '#fca5a5' : '#dc2626', color: '#fff',
                      fontSize: 12, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {deleting ? '삭제 중...' : '삭제'}
                  </button>
                </div>
              </div>
            )}

            {!editMode ? (
              /* ---------- VIEW MODE ---------- */
              (() => {
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
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => openEditMode(selectedEvent)}
                          style={{
                            padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
                            background: '#fff', fontSize: 13, fontWeight: 500, color: '#4f46e5', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          수정
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          style={{
                            padding: '8px 16px', borderRadius: 8, border: '1px solid #fecaca',
                            background: '#fff', fontSize: 13, fontWeight: 500, color: '#dc2626', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          삭제
                        </button>
                      </div>
                      <button
                        onClick={() => { setSelectedEvent(null); setShowDeleteConfirm(false) }}
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
              })()
            ) : (
              /* ---------- EDIT MODE ---------- */
              <>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 20 }}>일정 수정</h3>

                {/* Title */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>제목 *</label>
                  <input
                    value={editForm.title}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="일정 제목"
                    style={inputStyle}
                  />
                </div>

                {/* Event type */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>유형</label>
                  <select
                    value={editForm.event_type}
                    onChange={(e) => setEditForm((f) => ({ ...f, event_type: e.target.value as EventType }))}
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
                    checked={editForm.all_day}
                    onChange={(e) => setEditForm((f) => ({ ...f, all_day: e.target.checked }))}
                    id="editAllDayCheck"
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="editAllDayCheck" style={{ fontSize: 13, color: '#475569', cursor: 'pointer' }}>종일 일정</label>
                </div>

                {/* Start */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                    시작 {editForm.all_day ? '날짜' : '날짜/시간'} *
                  </label>
                  <input
                    type={editForm.all_day ? 'date' : 'datetime-local'}
                    value={editForm.start_at}
                    onChange={(e) => setEditForm((f) => ({ ...f, start_at: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                {/* End */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                    종료 {editForm.all_day ? '날짜' : '날짜/시간'} *
                  </label>
                  <input
                    type={editForm.all_day ? 'date' : 'datetime-local'}
                    value={editForm.end_at}
                    onChange={(e) => setEditForm((f) => ({ ...f, end_at: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>설명</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="설명 (선택)"
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' as const }}
                  />
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setEditMode(false)}
                    style={{
                      padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0',
                      background: '#fff', fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer',
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving || !editForm.title.trim() || !editForm.start_at || !editForm.end_at}
                    style={{
                      padding: '8px 18px', borderRadius: 8, border: 'none',
                      background: saving ? '#a5b4fc' : '#4f46e5', color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
