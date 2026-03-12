import { useState, useMemo, useCallback } from 'react'
import { useRole } from '../contexts/RoleContext'
import MiniCalendar from '../components/MiniCalendar'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core'

// ─── Shared styles ───
const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

// ─── Types ───
type TaskType = '연구' | '논문리뷰' | '개발' | '기타'

interface TaskItem {
  id: string
  title: string
  description: string
  type: TaskType
  url?: string
  guide?: string
  carryOver?: boolean
  project?: string
}

interface StudentInfo {
  name: string
  badge: '지도학생' | '프로젝트'
  project?: string
}

// ─── Project definitions ───
const projectList = [
  'KOCCA AI Animation Pipeline',
  'NRF GCA Narratology',
  'Digital Heritage Archive',
]

// ─── Mock Data ───
// Mock marked dates for the mini calendar (weeks with entries)
const weeklyMarkedDates: Record<string, 'submitted' | 'partial' | 'none'> = {
  // Feb 2026
  '2026-02-16': 'submitted', '2026-02-17': 'submitted', '2026-02-18': 'submitted', '2026-02-19': 'submitted', '2026-02-20': 'submitted',
  '2026-02-23': 'submitted', '2026-02-24': 'submitted', '2026-02-25': 'partial', '2026-02-26': 'submitted', '2026-02-27': 'submitted',
  // Mar 2026
  '2026-03-02': 'submitted', '2026-03-03': 'submitted', '2026-03-04': 'submitted', '2026-03-05': 'submitted', '2026-03-06': 'submitted',
  '2026-03-09': 'submitted', '2026-03-10': 'submitted', '2026-03-11': 'partial', '2026-03-12': 'submitted', '2026-03-13': 'submitted',
}

function getWeekLabel(date: Date): string {
  // Get Monday of the selected week
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)

  const m = monday.getMonth() + 1
  const weekNum = Math.ceil(monday.getDate() / 7)
  return `${m}월 ${weekNum}주차 (${m}/${monday.getDate()} ~ ${friday.getMonth() + 1}/${friday.getDate()})`
}

const initialPoolTasks: TaskItem[] = [
  { id: 'task-1', title: 'Diffusion Model Survey 2026', description: '최신 diffusion 모델 동향 파악', type: '논문리뷰' },
  { id: 'task-2', title: 'GAN vs Diffusion 비교 실험', description: 'FID/IS 지표 비교', type: '연구' },
  { id: 'task-3', title: '데이터 전처리 파이프라인 개선', description: '배치 처리 속도 최적화', type: '개발' },
  { id: 'task-4', title: 'NeRF 3D Reconstruction 논문', description: 'SIGGRAPH 2026 논문', type: '논문리뷰' },
  { id: 'task-5', title: '연구실 세미나 발표 준비', description: '3/20 발표', type: '기타' },
]

const initialCarryOverTasks: TaskItem[] = [
  { id: 'carry-1', title: 'StyleGAN3 벤치마크', description: '지난주 미완료', type: '연구', carryOver: true },
]

const mockStudents: StudentInfo[] = [
  { name: '한감성', badge: '지도학생', project: 'KOCCA AI Animation Pipeline' },
  { name: '윤스마', badge: '지도학생', project: 'Digital Heritage Archive' },
  { name: '정인턴', badge: '지도학생', project: 'KOCCA AI Animation Pipeline' },
  { name: '강데이', badge: '지도학생', project: 'NRF GCA Narratology' },
  { name: '박프로', badge: '프로젝트', project: 'KOCCA AI Animation Pipeline' },
  { name: '임연구', badge: '프로젝트', project: 'NRF GCA Narratology' },
  { name: '송리서', badge: '지도학생' },
]

// carry-1 starts assigned to 한감성
const initialAssignments: Record<string, string[]> = {
  '한감성': ['carry-1'],
  '윤스마': [],
  '정인턴': [],
  '강데이': [],
  '박프로': [],
  '임연구': [],
  '송리서': [],
}

const typeBadgeColors: Record<TaskType, { bg: string; color: string }> = {
  '연구': { bg: '#e0e7ff', color: '#4338ca' },
  '논문리뷰': { bg: '#dbeafe', color: '#1d4ed8' },
  '개발': { bg: '#d1fae5', color: '#047857' },
  '기타': { bg: '#f1f5f9', color: '#64748b' },
}

// ─── Student/External Mock Data ───
const studentSummaries = [
  { name: '한감성', done: 3, inProgress: 2, notStarted: 0, dailyCount: 5, project: 'KOCCA AI Animation Pipeline' },
  { name: '윤스마', done: 1, inProgress: 1, notStarted: 2, dailyCount: 3, project: 'Digital Heritage Archive' },
  { name: '정인턴', done: 2, inProgress: 1, notStarted: 1, dailyCount: 4, project: 'KOCCA AI Animation Pipeline' },
  { name: '강데이', done: 4, inProgress: 0, notStarted: 0, dailyCount: 5, project: 'NRF GCA Narratology' },
  { name: '임연구', done: 2, inProgress: 1, notStarted: 0, dailyCount: 4, project: 'NRF GCA Narratology' },
  { name: '송리서', done: 0, inProgress: 2, notStarted: 1, dailyCount: 2 },
]

const myLastWeekSummary = { done: 3, inProgress: 2, notStarted: 0, dailyCount: 5 }

const myAssignedTasks = [
  {
    title: 'GAN 논문 리뷰 (StyleGAN3)',
    description: 'Section 3의 adaptive discriminator augmentation 중심으로 분석',
    url: 'https://arxiv.org/abs/2106.12423',
    guide: 'Section 3 중심으로 읽고, 기존 StyleGAN2 대비 변경점 정리',
    status: '진행중' as const,
    assignedBy: '김교수',
    project: 'KOCCA AI Animation Pipeline',
  },
  {
    title: '모델 A 벤치마크 실행',
    description: 'FID/IS 메트릭으로 CIFAR-10, FFHQ 데이터셋에서 벤치마크',
    url: '',
    guide: 'GPU 서버 3번에서 실행. batch_size=64, epochs=100',
    status: '새로 배정' as const,
    assignedBy: '김교수',
    project: 'KOCCA AI Animation Pipeline',
  },
  {
    title: '중간보고서 Section 2 작성',
    description: '관련 연구 서베이 부분 작성',
    url: '',
    guide: 'Overleaf 프로젝트에서 작업. 3/14까지 초안 완성',
    status: '이월' as const,
    assignedBy: '김교수',
    project: 'NRF GCA Narratology',
  },
]

const externalWeeklySummary = [
  {
    project: 'KOCCA AI Animation Pipeline',
    code: 'KOCCA-2025-001',
    completedTasks: 5,
    inProgressTasks: 3,
    notStartedTasks: 1,
    keyUpdates: ['Phase 2 마일스톤 달성 (3/7)', 'Asset 전달 일정 확정'],
  },
  {
    project: 'Digital Heritage Archive',
    code: 'MOC-2025-017',
    completedTasks: 3,
    inProgressTasks: 2,
    notStartedTasks: 0,
    keyUpdates: ['포인트 클라우드 변환 완료', '최종 QA 준비중'],
  },
]

const taskStatusBadge: Record<string, { bg: string; color: string }> = {
  '완료': { bg: '#d1fae5', color: '#047857' },
  '진행중': { bg: '#e0e7ff', color: '#4338ca' },
  '미시작': { bg: '#f1f5f9', color: '#64748b' },
  '새로 배정': { bg: '#e0e7ff', color: '#4338ca' },
  '이월': { bg: '#fef3c7', color: '#b45309' },
}

// ═══════════════════════════════════════
// Collapsible Section
// ═══════════════════════════════════════
function CollapsibleSection({
  title,
  icon,
  subtitle,
  defaultOpen = true,
  children,
  headerStyle,
}: {
  title: string
  icon?: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
  headerStyle?: React.CSSProperties
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: '#f1f5f9',
          borderRadius: 10,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background 0.15s',
          ...headerStyle,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = headerStyle?.background as string || '#f1f5f9' }}
      >
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', flex: 1 }}>{title}</span>
        {subtitle && (
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{subtitle}</span>
        )}
        <svg
          style={{
            width: 16, height: 16, color: '#94a3b8',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <div
        style={{
          overflow: 'hidden',
          maxHeight: open ? '2000px' : '0px',
          transition: 'max-height 0.35s ease',
        }}
      >
        <div style={{ paddingTop: 8 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// View Toggle
// ═══════════════════════════════════════
function ViewToggle({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      overflow: 'hidden',
      background: '#f8fafc',
    }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            background: value === opt.value ? '#4f46e5' : 'transparent',
            color: value === opt.value ? '#fff' : '#64748b',
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════
// Draggable Task Card
// ═══════════════════════════════════════
function DraggableTaskCard({ task, isOverlay }: { task: TaskItem; isOverlay?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  const badge = typeBadgeColors[task.type]

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={{
        ...style,
        padding: '14px 16px',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        cursor: 'grab',
        userSelect: 'none',
        boxShadow: isOverlay
          ? '0 12px 28px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.08)'
          : '0 1px 2px rgba(0,0,0,0.04)',
        transform: isOverlay ? 'rotate(2deg) scale(1.03)' : style.transform,
        opacity: isOverlay ? 0.92 : style.opacity,
        transition: isOverlay ? 'none' : style.transition,
      }}
      {...(isOverlay ? {} : { ...attributes, ...listeners })}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
          background: badge.bg, color: badge.color,
        }}>
          {task.type}
        </span>
        {task.carryOver && (
          <span style={{
            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: '#fef3c7', color: '#b45309',
          }}>
            이월
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{task.title}</p>
      <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>{task.description}</p>
    </div>
  )
}

// Static version for overlay
function TaskCardOverlay({ task }: { task: TaskItem }) {
  const badge = typeBadgeColors[task.type]
  return (
    <div
      style={{
        padding: '14px 16px',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        cursor: 'grabbing',
        userSelect: 'none',
        boxShadow: '0 12px 28px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.08)',
        transform: 'rotate(2deg) scale(1.03)',
        opacity: 0.92,
        width: 280,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
          background: badge.bg, color: badge.color,
        }}>
          {task.type}
        </span>
        {task.carryOver && (
          <span style={{
            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: '#fef3c7', color: '#b45309',
          }}>
            이월
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{task.title}</p>
      <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>{task.description}</p>
    </div>
  )
}

// ═══════════════════════════════════════
// Droppable Zone Wrapper
// ═══════════════════════════════════════
function DroppableZone({ id, children, isOver }: { id: string; children: React.ReactNode; isOver?: boolean }) {
  const { setNodeRef, isOver: over } = useDroppable({ id })
  const active = isOver !== undefined ? isOver : over

  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 60,
        borderRadius: 12,
        border: active ? '2px dashed #4f46e5' : '2px dashed transparent',
        background: active ? 'rgba(79, 70, 229, 0.04)' : 'transparent',
        transition: 'all 0.2s ease',
        padding: 4,
      }}
    >
      {children}
    </div>
  )
}

// ═══════════════════════════════════════
// Student Drop Card
// ═══════════════════════════════════════
function StudentDropCard({
  student,
  assignedTasks,
  allTasks,
}: {
  student: StudentInfo
  assignedTasks: string[]
  allTasks: TaskItem[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `student-${student.name}` })

  const tasks = assignedTasks
    .map((tid) => allTasks.find((t) => t.id === tid))
    .filter(Boolean) as TaskItem[]

  return (
    <div
      ref={setNodeRef}
      style={{
        ...cardStyle,
        padding: 20,
        border: isOver ? '2px solid #4f46e5' : '1px solid #e2e8f0',
        background: isOver ? 'rgba(79, 70, 229, 0.02)' : '#fff',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Student header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: student.badge === '프로젝트'
            ? 'linear-gradient(135deg, #059669, #047857)'
            : 'linear-gradient(135deg, #4f46e5, #3730a3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{student.name.charAt(0)}</span>
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{student.name}</p>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 6,
            background: student.badge === '프로젝트' ? '#d1fae5' : '#e0e7ff',
            color: student.badge === '프로젝트' ? '#047857' : '#4338ca',
          }}>
            {student.badge}
          </span>
        </div>
        {tasks.length > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#94a3b8',
          }}>
            {tasks.length}건
          </span>
        )}
      </div>

      {/* Assigned task list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.length === 0 && (
          <p style={{
            fontSize: 12, color: '#cbd5e1', textAlign: 'center',
            padding: '16px 0', fontStyle: 'italic',
          }}>
            태스크를 여기에 드롭하세요
          </p>
        )}
        {tasks.map((task) => (
          <DraggableTaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}


export default function Weekly() {
  const { currentRole } = useRole()

  return (
    <div key={`weekly-${currentRole}`} style={{ width: '100%' }}>
      {currentRole === 'professor' && <ProfessorWeekly />}
      {currentRole === 'student' && <StudentWeekly />}
      {currentRole === 'external' && <ExternalWeekly />}
    </div>
  )
}

// ═══════════════════════════════════════
// Professor Weekly View
// ═══════════════════════════════════════
function ProfessorWeekly() {
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 2, 12)) // March 12, 2026
  const weekLabel = useMemo(() => getWeekLabel(selectedDate), [selectedDate])
  const handleWeekSelect = useCallback((d: Date) => setSelectedDate(d), [])
  const [meetingNotes, setMeetingNotes] = useState('')

  // Summary view mode
  const [summaryView, setSummaryView] = useState<'project' | 'all'>('project')

  // Project filter for DnD
  const [dndProjectFilter, setDndProjectFilter] = useState<string>('전체')

  // Task pool state
  const [allTasks, setAllTasks] = useState<TaskItem[]>([...initialPoolTasks, ...initialCarryOverTasks])
  const [assignments, setAssignments] = useState<Record<string, string[]>>(initialAssignments)

  // New task form
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newGuide, setNewGuide] = useState('')
  const [newType, setNewType] = useState<TaskType>('연구')

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Compute which tasks are in the pool (not assigned to any student)
  const assignedTaskIds = useMemo(() => {
    const ids = new Set<string>()
    Object.values(assignments).forEach((taskIds) => taskIds.forEach((id) => ids.add(id)))
    return ids
  }, [assignments])

  const poolTasks = useMemo(
    () => allTasks.filter((t) => !assignedTaskIds.has(t.id) && !t.carryOver),
    [allTasks, assignedTaskIds]
  )

  const carryOverPoolTasks = useMemo(
    () => allTasks.filter((t) => !assignedTaskIds.has(t.id) && t.carryOver),
    [allTasks, assignedTaskIds]
  )

  const activeTask = activeId ? allTasks.find((t) => t.id === activeId) : null

  // Group students by project for DnD filter
  const filteredStudents = useMemo(() => {
    if (dndProjectFilter === '전체') return mockStudents
    if (dndProjectFilter === '프로젝트 미배정') return mockStudents.filter(s => !s.project)
    return mockStudents.filter(s => s.project === dndProjectFilter)
  }, [dndProjectFilter])

  // Group student summaries by project
  const projectGroupedSummaries = useMemo(() => {
    const groups: { project: string; students: typeof studentSummaries }[] = []
    for (const proj of projectList) {
      const students = studentSummaries.filter(s => s.project === proj)
      if (students.length > 0) groups.push({ project: proj, students })
    }
    const unassigned = studentSummaries.filter(s => !s.project)
    if (unassigned.length > 0) groups.push({ project: '프로젝트 미배정', students: unassigned })
    return groups
  }, [])

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const taskId = active.id as string
    const overId = over.id as string

    // Find where the task currently lives
    const currentOwner = Object.entries(assignments).find(([, ids]) => ids.includes(taskId))?.[0]

    // Dropping on a student zone
    if (overId.startsWith('student-')) {
      const studentName = overId.replace('student-', '')

      // Already assigned to this student
      if (currentOwner === studentName) return

      setAssignments((prev) => {
        const next = { ...prev }
        // Remove from previous owner
        if (currentOwner) {
          next[currentOwner] = next[currentOwner].filter((id) => id !== taskId)
        }
        // Add to new student
        next[studentName] = [...(next[studentName] || []), taskId]
        return next
      })
    }

    // Dropping on the pool zone
    if (overId === 'task-pool') {
      if (currentOwner) {
        setAssignments((prev) => {
          const next = { ...prev }
          next[currentOwner] = next[currentOwner].filter((id) => id !== taskId)
          return next
        })
      }
    }
  }

  function addNewTask() {
    if (!newTitle.trim()) return
    const id = `task-${Date.now()}`
    const task: TaskItem = {
      id,
      title: newTitle.trim(),
      description: newDesc.trim(),
      type: newType,
      url: newUrl.trim() || undefined,
      guide: newGuide.trim() || undefined,
    }
    setAllTasks((prev) => [...prev, task])
    setNewTitle('')
    setNewDesc('')
    setNewUrl('')
    setNewGuide('')
    setShowNewTask(false)
  }

  // Render summary table header row
  const summaryHeaderRow = (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr',
      gap: 12, padding: '12px 28px', borderBottom: '1px solid #e2e8f0',
      background: '#f8fafc',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>학생</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' as const }}>완료</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' as const }}>진행중</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' as const }}>미시작</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' as const }}>데일리 제출</span>
    </div>
  )

  // Render a single student row
  const renderStudentRow = (s: typeof studentSummaries[0], idx: number, total: number) => (
    <div
      key={s.name}
      style={{
        display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr',
        gap: 12, padding: '16px 28px', alignItems: 'center',
        borderBottom: idx < total - 1 ? '1px solid #f1f5f9' : 'none',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{s.name.charAt(0)}</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{s.name}</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 13, fontWeight: 600, background: '#d1fae5', color: '#047857' }}>{s.done}</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 13, fontWeight: 600, background: '#e0e7ff', color: '#4338ca' }}>{s.inProgress}</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 13, fontWeight: 600, background: s.notStarted > 0 ? '#ffe4e6' : '#f1f5f9', color: s.notStarted > 0 ? '#be123c' : '#64748b' }}>{s.notStarted}</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{s.dailyCount}/5일</span>
      </div>
    </div>
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div>
        {/* Header */}
        <div style={{ marginBottom: 32 }} className="animate-fade-in">
          <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
            주간 회의
          </h1>
          <p style={{ color: '#64748b', fontSize: 15, marginTop: 6, lineHeight: 1.5 }}>
            태스크를 드래그하여 학생에게 배정하세요.
          </p>
        </div>

        {/* Week Selector with MiniCalendar */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }} className="opacity-0 animate-fade-in stagger-1">
          <MiniCalendar
            mode="week"
            selectedDate={selectedDate}
            onSelect={handleWeekSelect}
            markedDates={weeklyMarkedDates}
          />
          <div style={{
            padding: '14px 20px',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{weekLabel}</span>
          </div>
        </div>

        {/* Student Summary Table */}
        <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, overflow: 'hidden', marginBottom: 28 }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>지난주 학생별 요약</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>자동 집계 결과</p>
            </div>
            <ViewToggle
              options={[
                { value: 'project', label: '프로젝트별 보기' },
                { value: 'all', label: '전체 보기' },
              ]}
              value={summaryView}
              onChange={(v) => setSummaryView(v as 'project' | 'all')}
            />
          </div>

          {summaryView === 'all' ? (
            <>
              {summaryHeaderRow}
              {studentSummaries.map((s, idx) => renderStudentRow(s, idx, studentSummaries.length))}
            </>
          ) : (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {projectGroupedSummaries.map((group) => {
                const totalDone = group.students.reduce((a, s) => a + s.done, 0)
                const totalInProgress = group.students.reduce((a, s) => a + s.inProgress, 0)
                const totalNotStarted = group.students.reduce((a, s) => a + s.notStarted, 0)
                const subtitle = `완료 ${totalDone} / 진행 ${totalInProgress} / 미시작 ${totalNotStarted}`
                return (
                  <CollapsibleSection
                    key={group.project}
                    title={group.project}
                    icon={group.project === '프로젝트 미배정' ? undefined : '\uD83D\uDCC1'}
                    subtitle={subtitle}
                    defaultOpen={true}
                  >
                    <div style={{ ...cardStyle, overflow: 'hidden' }}>
                      {summaryHeaderRow}
                      {group.students.map((s, idx) => renderStudentRow(s, idx, group.students.length))}
                    </div>
                  </CollapsibleSection>
                )
              })}
            </div>
          )}
        </div>

        {/* ═══ Drag & Drop Area: Task Pool (left) + Students (right) ═══ */}
        <div
          className="opacity-0 animate-fade-in stagger-3 weekly-dnd-layout"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
            marginBottom: 28,
            alignItems: 'start',
          }}
        >
          {/* Left: Task Pool */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>태스크 풀</h3>
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>드래그하여 학생에게 배정</p>
              </div>
              <button
                onClick={() => setShowNewTask(!showNewTask)}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: showNewTask ? '#f1f5f9' : '#4f46e5',
                  color: showNewTask ? '#64748b' : '#fff',
                  transition: 'all 0.15s',
                }}
              >
                {showNewTask ? '취소' : '+ 새 태스크 추가'}
              </button>
            </div>

            {/* New Task Inline Form */}
            {showNewTask && (
              <div style={{
                padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
                background: '#f8fafc',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as TaskType)}
                    style={{
                      padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                      fontSize: 13, background: '#fff', color: '#0f172a', outline: 'none',
                    }}
                  >
                    <option value="연구">연구</option>
                    <option value="논문리뷰">논문리뷰</option>
                    <option value="개발">개발</option>
                    <option value="기타">기타</option>
                  </select>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="태스크 제목"
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8,
                      border: '1px solid #e2e8f0', fontSize: 13,
                      background: '#fff', color: '#0f172a', outline: 'none',
                    }}
                  />
                </div>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="설명"
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    border: '1px solid #e2e8f0', fontSize: 13,
                    background: '#fff', color: '#0f172a', outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="URL (선택)"
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8,
                      border: '1px solid #e2e8f0', fontSize: 13,
                      background: '#fff', color: '#0f172a', outline: 'none',
                    }}
                  />
                  <input
                    type="text"
                    value={newGuide}
                    onChange={(e) => setNewGuide(e.target.value)}
                    placeholder="가이드 (선택)"
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8,
                      border: '1px solid #e2e8f0', fontSize: 13,
                      background: '#fff', color: '#0f172a', outline: 'none',
                    }}
                  />
                </div>
                <button
                  onClick={addNewTask}
                  style={{
                    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: 'none', cursor: 'pointer', alignSelf: 'flex-end',
                    background: '#4f46e5', color: '#fff',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#3730a3' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#4f46e5' }}
                >
                  추가
                </button>
              </div>
            )}

            {/* Pool tasks */}
            <DroppableZone id="task-pool">
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {poolTasks.length === 0 && carryOverPoolTasks.length === 0 && (
                  <p style={{ fontSize: 13, color: '#cbd5e1', textAlign: 'center', padding: '20px 0', fontStyle: 'italic' }}>
                    모든 태스크가 배정되었습니다
                  </p>
                )}

                {poolTasks.map((task) => (
                  <DraggableTaskCard key={task.id} task={task} />
                ))}

                {/* Carry-over section */}
                {carryOverPoolTasks.length > 0 && (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      marginTop: poolTasks.length > 0 ? 8 : 0,
                    }}>
                      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#b45309', whiteSpace: 'nowrap' }}>
                        이월된 태스크
                      </span>
                      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                    </div>
                    {carryOverPoolTasks.map((task) => (
                      <DraggableTaskCard key={task.id} task={task} />
                    ))}
                  </>
                )}
              </div>
            </DroppableZone>
          </div>

          {/* Right: Students */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '0 0 4px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>학생</h3>
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>태스크를 드롭하여 배정</p>
              </div>
              <select
                value={dndProjectFilter}
                onChange={(e) => setDndProjectFilter(e.target.value)}
                style={{
                  padding: '6px 10px', borderRadius: 8,
                  border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a',
                  background: '#fff', outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="전체">전체</option>
                {projectList.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
                <option value="프로젝트 미배정">프로젝트 미배정</option>
              </select>
            </div>
            {filteredStudents.map((student) => (
              <StudentDropCard
                key={student.name}
                student={student}
                assignedTasks={assignments[student.name] || []}
                allTasks={allTasks}
              />
            ))}
          </div>
        </div>

        {/* Meeting Notes */}
        <div className="opacity-0 animate-fade-in stagger-4" style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>회의록</h3>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>이번 주 회의 내용을 기록하세요</p>
          </div>
          <div style={{ padding: 28 }}>
            <textarea
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
              placeholder="회의 내용을 자유롭게 기록하세요..."
              rows={6}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                border: '1px solid #e2e8f0', background: '#f8fafc',
                fontSize: 14, color: '#0f172a', outline: 'none',
                resize: 'vertical' as const, fontFamily: 'inherit',
                lineHeight: 1.7,
              }}
            />
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                style={{
                  padding: '10px 24px', borderRadius: 10,
                  fontSize: 14, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: '#059669', color: '#fff',
                  boxShadow: '0 2px 8px rgba(5,150,105,0.25)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#047857' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#059669' }}
              >
                저장
              </button>
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 900px) {
            .weekly-dnd-layout {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

// ═══════════════════════════════════════
// Student Weekly View
// ═══════════════════════════════════════
function StudentWeekly() {
  const [weekPlan, setWeekPlan] = useState('')
  const [taskView, setTaskView] = useState<'project' | 'all'>('project')

  // Group assigned tasks by project
  const projectGroupedTasks = useMemo(() => {
    const groups: { project: string; tasks: typeof myAssignedTasks }[] = []
    const projectMap = new Map<string, typeof myAssignedTasks>()
    for (const task of myAssignedTasks) {
      const proj = task.project || '프로젝트 없음'
      if (!projectMap.has(proj)) projectMap.set(proj, [])
      projectMap.get(proj)!.push(task)
    }
    for (const [project, tasks] of projectMap) {
      groups.push({ project, tasks })
    }
    return groups
  }, [])

  const renderTaskCard = (task: typeof myAssignedTasks[0], idx: number, total: number) => {
    const badge = taskStatusBadge[task.status] || taskStatusBadge['미시작']
    return (
      <div
        key={idx}
        style={{
          padding: '24px 28px',
          borderBottom: idx < total - 1 ? '1px solid #f1f5f9' : 'none',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{task.title}</h4>
          <span style={{
            padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
            background: badge.bg, color: badge.color, flexShrink: 0,
          }}>
            {task.status}
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 12 }}>{task.description}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {task.url && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg style={{ width: 14, height: 14, color: '#94a3b8', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <a href={task.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#4f46e5', textDecoration: 'none' }}>
                {task.url}
              </a>
            </div>
          )}
          {task.guide && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <svg style={{ width: 14, height: 14, color: '#94a3b8', flexShrink: 0, marginTop: 2 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span style={{ fontSize: 13, color: '#475569', fontStyle: 'italic' }}>가이드: {task.guide}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <svg style={{ width: 14, height: 14, color: '#94a3b8', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>배정: {task.assignedBy}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          주간 현황
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 6, lineHeight: 1.5 }}>
          지난주 활동 요약과 이번 주 배정된 태스크를 확인하세요.
        </p>
      </div>

      {/* Last Week Summary */}
      <div className="opacity-0 animate-fade-in stagger-1" style={{ marginBottom: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
          {[
            { label: '완료', value: myLastWeekSummary.done, bg: '#d1fae5', color: '#047857', accent: '#059669' },
            { label: '진행중', value: myLastWeekSummary.inProgress, bg: '#e0e7ff', color: '#4338ca', accent: '#4f46e5' },
            { label: '미시작', value: myLastWeekSummary.notStarted, bg: '#f1f5f9', color: '#64748b', accent: '#64748b' },
            { label: '데일리 제출', value: `${myLastWeekSummary.dailyCount}/5`, bg: '#fff', color: '#0f172a', accent: '#0f172a' },
          ].map((item) => (
            <div key={item.label} style={{ ...cardStyle, padding: 24 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 10 }}>지난주 {item.label}</p>
              <p style={{ fontSize: 32, fontWeight: 700, color: item.accent, letterSpacing: '-0.02em' }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Assigned Tasks */}
      <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, overflow: 'hidden', marginBottom: 28 }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>이번 주 배정된 태스크</h3>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{myAssignedTasks.length}건 배정됨</p>
          </div>
          {projectGroupedTasks.length > 1 && (
            <ViewToggle
              options={[
                { value: 'project', label: '프로젝트별' },
                { value: 'all', label: '전체 보기' },
              ]}
              value={taskView}
              onChange={(v) => setTaskView(v as 'project' | 'all')}
            />
          )}
        </div>

        {taskView === 'all' || projectGroupedTasks.length <= 1 ? (
          myAssignedTasks.map((task, idx) => renderTaskCard(task, idx, myAssignedTasks.length))
        ) : (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {projectGroupedTasks.map((group) => (
              <CollapsibleSection
                key={group.project}
                title={group.project}
                icon={group.project === '프로젝트 없음' ? undefined : '\uD83D\uDCC1'}
                subtitle={`${group.tasks.length}건`}
                defaultOpen={true}
              >
                <div style={{ ...cardStyle, overflow: 'hidden' }}>
                  {group.tasks.map((task, idx) => renderTaskCard(task, idx, group.tasks.length))}
                </div>
              </CollapsibleSection>
            ))}
          </div>
        )}
      </div>

      {/* Week Plan */}
      <div className="opacity-0 animate-fade-in stagger-3" style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>이번 주 계획</h3>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>이번 주 목표와 계획을 작성하세요</p>
        </div>
        <div style={{ padding: 28 }}>
          <textarea
            value={weekPlan}
            onChange={(e) => setWeekPlan(e.target.value)}
            placeholder="이번 주 계획을 자유롭게 작성하세요..."
            rows={5}
            style={{
              width: '100%', padding: '14px', borderRadius: 12,
              border: '1px solid #e2e8f0', background: '#f8fafc',
              fontSize: 14, color: '#0f172a', outline: 'none',
              resize: 'vertical' as const, fontFamily: 'inherit',
              lineHeight: 1.7,
            }}
          />
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              style={{
                padding: '10px 24px', borderRadius: 10,
                fontSize: 14, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: '#059669', color: '#fff',
                boxShadow: '0 2px 8px rgba(5,150,105,0.25)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#047857' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#059669' }}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// External Weekly View
// ═══════════════════════════════════════
function ExternalWeekly() {
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          주간 현황
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 6, lineHeight: 1.5 }}>
          참여 프로젝트의 이번 주 현황을 확인하세요.
        </p>
      </div>

      {/* Project summaries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {externalWeeklySummary.map((proj, pIdx) => (
          <div key={proj.code} className={`opacity-0 animate-fade-in stagger-${pIdx + 1}`} style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{
              padding: '20px 28px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>{proj.project}</h3>
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' }}>{proj.code}</p>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: '20px 28px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 24, fontWeight: 700, color: '#059669' }}>{proj.completedTasks}</p>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>완료</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 24, fontWeight: 700, color: '#4f46e5' }}>{proj.inProgressTasks}</p>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>진행중</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 24, fontWeight: 700, color: '#64748b' }}>{proj.notStartedTasks}</p>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>미시작</p>
              </div>
            </div>

            {/* Key updates */}
            <div style={{ padding: '20px 28px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 12 }}>주요 업데이트</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proj.keyUpdates.map((update, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4f46e5', flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: '#334155' }}>{update}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
