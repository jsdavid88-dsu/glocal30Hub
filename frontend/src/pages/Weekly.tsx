import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { api } from '../api/client'
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
  id?: string
  name: string
  badge: '지도학생' | '프로젝트'
  project?: string
}

interface StudentSummary {
  name: string
  done: number
  inProgress: number
  notStarted: number
  dailyCount: number
  project?: string
}

interface AssignedTask {
  title: string
  description: string
  url: string
  guide: string
  status: '완료' | '진행중' | '미시작' | '새로 배정' | '이월'
  assignedBy: string
  project: string
}

interface ExternalProjectSummary {
  project: string
  code: string
  completedTasks: number
  inProgressTasks: number
  notStartedTasks: number
  keyUpdates: string[]
}

// ─── Helpers ───
function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return date
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekLabel(date: Date): string {
  const monday = getMonday(date)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)

  const m = monday.getMonth() + 1
  const weekNum = Math.ceil(monday.getDate() / 7)
  return `${m}월 ${weekNum}주차 (${m}/${monday.getDate()} ~ ${friday.getMonth() + 1}/${friday.getDate()})`
}

function mapApiTaskToTaskItem(t: any, projectName?: string): TaskItem {
  return {
    id: String(t.id),
    title: t.title,
    description: t.description || '',
    type: (t.task_type || t.type || '기타') as TaskType,
    url: t.reference_url || t.url || undefined,
    guide: t.guide || undefined,
    carryOver: t.is_carry_over || t.carryOver || false,
    project: t.project_name || t.project || projectName || undefined,
  }
}

const typeBadgeColors: Record<TaskType, { bg: string; color: string }> = {
  '연구': { bg: '#e0e7ff', color: '#4338ca' },
  '논문리뷰': { bg: '#dbeafe', color: '#1d4ed8' },
  '개발': { bg: '#d1fae5', color: '#047857' },
  '기타': { bg: '#f1f5f9', color: '#64748b' },
}

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
  const { setNodeRef, isOver } = useDroppable({ id: `student-${student.id || student.name}` })

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
  const [selectedDate, setSelectedDate] = useState(new Date())
  const weekLabel = useMemo(() => getWeekLabel(selectedDate), [selectedDate])
  const handleWeekSelect = useCallback((d: Date) => setSelectedDate(d), [])

  // Compute weekStart key (Monday of selected week) in YYYY-MM-DD format
  const weekStartKey = useMemo(() => formatDateKey(getMonday(selectedDate)), [selectedDate])

  // Loading state
  const [loading, setLoading] = useState(true)

  // Meeting notes with API persistence (localStorage fallback)
  const [meetingNotes, setMeetingNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)

  // Summary view mode
  const [summaryView, setSummaryView] = useState<'project' | 'all'>('project')

  // Project filter for DnD
  const [dndProjectFilter, setDndProjectFilter] = useState<string>('전체')

  // Dynamic students and projects from API
  const [apiStudents, setApiStudents] = useState<StudentInfo[]>([])
  const [apiProjects, setApiProjects] = useState<string[]>([])
  const [apiProjectObjects, setApiProjectObjects] = useState<{ id: string; name: string }[]>([])

  // Task pool state
  const [allTasks, setAllTasks] = useState<TaskItem[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})

  // Save status for drag-and-drop assignments
  const [assignSaveStatus, setAssignSaveStatus] = useState<'saving' | 'saved' | 'error' | null>(null)
  // Queue to serialize assignment API calls and prevent race conditions
  const assignQueueRef = useRef<Promise<void>>(Promise.resolve())

  // Student summaries from API
  const [apiStudentSummaries, setApiStudentSummaries] = useState<StudentSummary[]>([])

  // Marked dates for calendar
  const [weeklyMarkedDates] = useState<Record<string, 'submitted' | 'partial' | 'none'>>({})

  // Load meeting notes when week changes
  useEffect(() => {
    // Try API first, fallback to localStorage
    const loadNotes = async () => {
      try {
        const res: any = await (api as any).weekly?.getNotes(weekStartKey)
        if (res && res.content !== undefined) {
          setMeetingNotes(res.content || '')
          return
        }
      } catch {
        // API not available yet
      }
      // Fallback to localStorage
      const saved = localStorage.getItem(`weekly-notes-${weekStartKey}`)
      setMeetingNotes(saved || '')
    }
    loadNotes()
    setNotesSaved(false)
  }, [weekStartKey])

  async function handleSaveMeetingNotes() {
    // Save to localStorage always
    localStorage.setItem(`weekly-notes-${weekStartKey}`, meetingNotes)
    // Try API save
    try {
      await (api as any).weekly?.saveNotes(weekStartKey, meetingNotes)
    } catch {
      // API not available yet, localStorage save is enough
    }
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  // Load students, projects, and tasks from API
  useEffect(() => {
    setLoading(true)

    const fetchData = async () => {
      try {
        const [usersRes, projectsRes] = await Promise.all([
          api.users.list({ role: 'student' }).catch(() => ({ items: [] })),
          api.projects.list().catch(() => ({ items: [] })),
        ])

        const students: any[] = (usersRes as any).items || (usersRes as any).data || (Array.isArray(usersRes) ? usersRes : [])
        const projects: any[] = (projectsRes as any).items || (projectsRes as any).data || (Array.isArray(projectsRes) ? projectsRes : [])

        // Map projects
        const projectNames = projects.map((p: any) => p.name || p.title || p.id)
        const projectObjects = projects.map((p: any) => ({
          id: String(p.id),
          name: p.name || p.title || p.id,
        }))
        setApiProjects(projectNames)
        setApiProjectObjects(projectObjects)

        // Fetch tasks for each project
        let allApiTasks: any[] = []
        if (projects.length > 0) {
          const taskResults = await Promise.all(
            projects.map((p: any) =>
              api.tasks.listByProject(String(p.id), { week_start: weekStartKey }).catch(() => ({ items: [], data: [] }))
            )
          )
          for (let i = 0; i < taskResults.length; i++) {
            const res: any = taskResults[i]
            const tasks: any[] = res.items || res.data || (Array.isArray(res) ? res : [])
            const projName = projectObjects[i]?.name
            allApiTasks.push(...tasks.map((t: any) => ({ ...t, _projectName: projName })))
          }
        }

        // Map students
        const mappedStudents: StudentInfo[] = students.map((u: any) => ({
          id: u.id,
          name: u.display_name || u.name || u.email || u.id,
          badge: (u.role === 'student' ? '지도학생' : '프로젝트') as '지도학생' | '프로젝트',
          project: u.project_name || undefined,
        }))

        // If we have students, also try to determine their project membership
        if (mappedStudents.length > 0 && projects.length > 0) {
          try {
            const memberResults = await Promise.all(
              projects.map((p: any) =>
                api.projects.members(String(p.id)).catch(() => ({ items: [], data: [] }))
              )
            )
            for (let i = 0; i < memberResults.length; i++) {
              const res: any = memberResults[i]
              const members: any[] = res.items || res.data || (Array.isArray(res) ? res : [])
              const projName = projectObjects[i]?.name
              for (const m of members) {
                const memberId = m.user_id || m.id
                const student = mappedStudents.find(s => s.id === memberId)
                if (student && !student.project) {
                  student.project = projName
                }
              }
            }
          } catch {
            // Project members API might not be available
          }
        }

        setApiStudents(mappedStudents)

        // Map tasks
        const mappedTasks: TaskItem[] = allApiTasks.map((t: any) => mapApiTaskToTaskItem(t, t._projectName))
        setAllTasks(mappedTasks)

        // Build assignments from task assignees
        const newAssignments: Record<string, string[]> = {}
        // Initialize all students with empty arrays
        for (const s of mappedStudents) {
          newAssignments[s.name] = []
        }
        for (const t of allApiTasks) {
          const assignees: any[] = t.assignees || []
          for (const a of assignees) {
            const userId = a.user_id || a.id
            const student = mappedStudents.find(s => s.id === userId)
            if (student) {
              if (!newAssignments[student.name]) newAssignments[student.name] = []
              newAssignments[student.name].push(String(t.id))
            }
          }
        }
        setAssignments(newAssignments)

        // Build student summaries
        // Try dedicated API first
        let summaries: StudentSummary[] = []
        try {
          const summaryRes: any = await api.weekly.getSummary(weekStartKey)
          if (summaryRes && Array.isArray(summaryRes.data || summaryRes.items || summaryRes)) {
            const rawSummaries: any[] = summaryRes.data || summaryRes.items || summaryRes
            summaries = rawSummaries.map((s: any) => ({
              name: s.student_name || s.name || '',
              done: s.done || s.completed || 0,
              inProgress: s.in_progress || s.inProgress || 0,
              notStarted: s.not_started || s.notStarted || s.todo || 0,
              dailyCount: s.daily_count || s.dailyCount || 0,
              project: s.project || s.project_name || undefined,
            }))
          }
        } catch {
          // API not available, compute from tasks
        }

        if (summaries.length === 0) {
          // Compute summaries from fetched tasks
          summaries = mappedStudents.map(s => {
            const studentTaskIds = newAssignments[s.name] || []
            const studentTasks = allApiTasks.filter((t: any) => studentTaskIds.includes(String(t.id)))
            return {
              name: s.name,
              done: studentTasks.filter((t: any) => t.status === 'done' || t.status === 'completed').length,
              inProgress: studentTasks.filter((t: any) => t.status === 'in_progress').length,
              notStarted: studentTasks.filter((t: any) => t.status === 'todo' || t.status === 'not_started' || !t.status).length,
              dailyCount: 0,
              project: s.project,
            }
          })
        }
        setApiStudentSummaries(summaries)

      } catch {
        // Total fetch failure - show empty state
        setApiStudents([])
        setApiProjects([])
        setApiProjectObjects([])
        setAllTasks([])
        setAssignments({})
        setApiStudentSummaries([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [weekStartKey])

  // New task form
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newGuide, setNewGuide] = useState('')
  const [newType, setNewType] = useState<TaskType>('연구')
  const [newProject, setNewProject] = useState('')
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [isCreatingTask, setIsCreatingTask] = useState(false)

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
    if (dndProjectFilter === '전체') return apiStudents
    if (dndProjectFilter === '프로젝트 미배정') return apiStudents.filter(s => !s.project)
    return apiStudents.filter(s => s.project === dndProjectFilter)
  }, [dndProjectFilter, apiStudents])

  // Group student summaries by project
  const projectGroupedSummaries = useMemo(() => {
    const groups: { project: string; students: StudentSummary[] }[] = []
    for (const proj of apiProjects) {
      const students = apiStudentSummaries.filter(s => s.project === proj)
      if (students.length > 0) groups.push({ project: proj, students })
    }
    const unassigned = apiStudentSummaries.filter(s => !s.project)
    if (unassigned.length > 0) groups.push({ project: '프로젝트 미배정', students: unassigned })
    return groups
  }, [apiProjects, apiStudentSummaries])

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
      const studentIdentifier = overId.replace('student-', '')
      const student = apiStudents.find((s) => s.id === studentIdentifier) || apiStudents.find((s) => s.name === studentIdentifier)
      if (!student) return

      const studentName = student.name

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

      // Persist assignment to API with rollback on failure (serialized via queue)
      if (student.id) {
        setAssignSaveStatus('saving')
        const prevStudent = currentOwner ? apiStudents.find((s) => s.name === currentOwner) : null
        const capturedStudentId = student.id
        const capturedStudentName = studentName

        assignQueueRef.current = assignQueueRef.current.then(async () => {
          try {
            // Unassign from previous student first if needed
            if (prevStudent?.id) {
              await api.tasks.unassign(taskId, prevStudent.id).catch(() => {})
            }
            await api.tasks.assign(taskId, capturedStudentId, true)
            setAssignSaveStatus('saved')
            setTimeout(() => setAssignSaveStatus(null), 2000)
          } catch (err: any) {
            // 409 = already assigned to this student, treat as success
            if (err?.message?.includes('409')) {
              setAssignSaveStatus('saved')
              setTimeout(() => setAssignSaveStatus(null), 2000)
              return
            }
            setAssignSaveStatus('error')
            setTimeout(() => setAssignSaveStatus(null), 3000)
            setAssignments((prev) => {
              const next = { ...prev }
              next[capturedStudentName] = next[capturedStudentName].filter((id) => id !== taskId)
              if (currentOwner) {
                next[currentOwner] = [...(next[currentOwner] || []), taskId]
              }
              return next
            })
          }
        })
      }
    }

    // Dropping on the pool zone
    if (overId === 'task-pool') {
      if (currentOwner) {
        setAssignments((prev) => {
          const next = { ...prev }
          next[currentOwner] = next[currentOwner].filter((id) => id !== taskId)
          return next
        })
        // Unassign from API with rollback on failure (serialized via queue)
        const student = apiStudents.find((s) => s.name === currentOwner)
        if (student?.id) {
          setAssignSaveStatus('saving')
          const capturedStudentId = student.id
          const capturedOwner = currentOwner

          assignQueueRef.current = assignQueueRef.current.then(async () => {
            try {
              await api.tasks.unassign(taskId, capturedStudentId)
              setAssignSaveStatus('saved')
              setTimeout(() => setAssignSaveStatus(null), 2000)
            } catch {
              setAssignSaveStatus('error')
              setTimeout(() => setAssignSaveStatus(null), 3000)
              setAssignments((prev) => {
                const next = { ...prev }
                next[capturedOwner] = [...(next[capturedOwner] || []), taskId]
                return next
              })
            }
          })
        }
      }
    }
  }

  async function addNewTask() {
    if (!newTitle.trim()) return
    if (!newProject && apiProjectObjects.length === 0) {
      // No projects available - create locally only
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
      resetNewTaskForm()
      return
    }

    const projectId = newProject || apiProjectObjects[0]?.id
    if (!projectId) return

    setIsCreatingTask(true)
    try {
      const projectObj = apiProjectObjects.find(p => p.id === projectId)
      const result: any = await api.tasks.create(projectId, {
        title: newTitle.trim(),
        description: newDesc.trim(),
        task_type: newType,
        priority: newPriority,
        reference_url: newUrl.trim() || undefined,
        guide: newGuide.trim() || undefined,
      })

      const task: TaskItem = {
        id: String(result.id || `task-${Date.now()}`),
        title: result.title || newTitle.trim(),
        description: result.description || newDesc.trim(),
        type: (result.task_type || newType) as TaskType,
        url: result.reference_url || newUrl.trim() || undefined,
        guide: result.guide || newGuide.trim() || undefined,
        project: projectObj?.name || undefined,
      }
      setAllTasks((prev) => [...prev, task])
      resetNewTaskForm()
    } catch {
      // API failed - create locally as fallback
      const id = `task-${Date.now()}`
      const projectObj = apiProjectObjects.find(p => p.id === projectId)
      const task: TaskItem = {
        id,
        title: newTitle.trim(),
        description: newDesc.trim(),
        type: newType,
        url: newUrl.trim() || undefined,
        guide: newGuide.trim() || undefined,
        project: projectObj?.name || undefined,
      }
      setAllTasks((prev) => [...prev, task])
      resetNewTaskForm()
    } finally {
      setIsCreatingTask(false)
    }
  }

  function resetNewTaskForm() {
    setNewTitle('')
    setNewDesc('')
    setNewUrl('')
    setNewGuide('')
    setNewProject('')
    setNewPriority('medium')
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
  const renderStudentRow = (s: StudentSummary, idx: number, total: number) => (
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

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 15 }}>
            로딩 중...
          </div>
        )}

        {!loading && (
          <>
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

              {apiStudentSummaries.length === 0 ? (
                <div style={{ padding: '40px 28px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  학생 데이터가 없습니다
                </div>
              ) : summaryView === 'all' ? (
                <div className="weekly-summary-table">
                  <div>
                    {summaryHeaderRow}
                    {apiStudentSummaries.map((s, idx) => renderStudentRow(s, idx, apiStudentSummaries.length))}
                  </div>
                </div>
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
                    <div style={{ display: 'flex', gap: 10 }}>
                      <select
                        value={newProject}
                        onChange={(e) => setNewProject(e.target.value)}
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                          fontSize: 13, background: '#fff', color: '#0f172a', outline: 'none',
                        }}
                      >
                        <option value="">프로젝트 선택</option>
                        {apiProjectObjects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <select
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value as 'low' | 'medium' | 'high' | 'urgent')}
                        style={{
                          padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                          fontSize: 13, background: '#fff', color: '#0f172a', outline: 'none',
                        }}
                      >
                        <option value="low">낮음</option>
                        <option value="medium">보통</option>
                        <option value="high">높음</option>
                        <option value="urgent">긴급</option>
                      </select>
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
                      disabled={isCreatingTask || !newTitle.trim()}
                      style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        border: 'none', cursor: isCreatingTask ? 'wait' : 'pointer', alignSelf: 'flex-end',
                        background: isCreatingTask ? '#94a3b8' : '#4f46e5', color: '#fff',
                        transition: 'all 0.15s',
                        opacity: !newTitle.trim() ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => { if (!isCreatingTask) e.currentTarget.style.background = '#3730a3' }}
                      onMouseLeave={(e) => { if (!isCreatingTask) e.currentTarget.style.background = '#4f46e5' }}
                    >
                      {isCreatingTask ? '생성 중...' : '추가'}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <p style={{ fontSize: 13, color: '#94a3b8' }}>태스크를 드롭하여 배정</p>
                      {assignSaveStatus === 'saving' && (
                        <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 500 }}>저장 중...</span>
                      )}
                      {assignSaveStatus === 'saved' && (
                        <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>저장됨</span>
                      )}
                      {assignSaveStatus === 'error' && (
                        <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 500 }}>저장 실패 - 배정이 취소되었습니다</span>
                      )}
                    </div>
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
                    {apiProjects.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    <option value="프로젝트 미배정">프로젝트 미배정</option>
                  </select>
                </div>
                {filteredStudents.length === 0 && (
                  <div style={{ ...cardStyle, padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                    학생이 없습니다
                  </div>
                )}
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
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                  {notesSaved && (
                    <span style={{ fontSize: 13, color: '#059669', fontWeight: 500 }}>저장되었습니다</span>
                  )}
                  <button
                    onClick={handleSaveMeetingNotes}
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
          </>
        )}

        <style>{`
          @media (max-width: 900px) {
            .weekly-dnd-layout {
              grid-template-columns: 1fr !important;
            }
          }
          @media (max-width: 767px) {
            .weekly-summary-table {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            .weekly-summary-table > div {
              min-width: 520px;
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
  const [planSaved, setPlanSaved] = useState(false)
  const [taskView, setTaskView] = useState<'project' | 'all'>('project')
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([])
  const [loading, setLoading] = useState(true)

  // Last week summary computed from tasks
  const [myLastWeekSummary, setMyLastWeekSummary] = useState({ done: 0, inProgress: 0, notStarted: 0, dailyCount: 0 })

  // Load week plan from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('weekly-plan-student')
    if (saved) setWeekPlan(saved)
  }, [])

  function handleSaveWeekPlan() {
    localStorage.setItem('weekly-plan-student', weekPlan)
    setPlanSaved(true)
    setTimeout(() => setPlanSaved(false), 2000)
  }

  // Fetch tasks from API
  useEffect(() => {
    setLoading(true)

    const fetchData = async () => {
      try {
        const res: any = await api.tasks.my()
        const tasks: any[] = res.items || res.data || (Array.isArray(res) ? res : [])

        const mapped: AssignedTask[] = tasks.map((t: any) => ({
          title: t.title,
          description: t.description || '',
          url: t.reference_url || t.url || '',
          guide: t.guide || '',
          status: t.status === 'done' || t.status === 'completed'
            ? '완료'
            : t.status === 'in_progress'
              ? '진행중'
              : t.status === 'carry_over' || t.is_carry_over
                ? '이월'
                : t.status === 'todo' || t.status === 'not_started'
                  ? '새로 배정'
                  : '새로 배정',
          assignedBy: t.assigned_by_name || t.assigned_by || '',
          project: t.project_name || t.project || '',
        }))
        setAssignedTasks(mapped)

        // Compute last week summary from tasks
        const done = mapped.filter(t => t.status === '완료').length
        const inProgress = mapped.filter(t => t.status === '진행중').length
        const notStarted = mapped.filter(t => t.status === '새로 배정' || t.status === '미시작').length
        setMyLastWeekSummary({ done, inProgress, notStarted, dailyCount: 0 })

        // Try to get summary from dedicated API
        try {
          const weekStart = formatDateKey(getMonday(new Date()))
          const summaryRes: any = await api.weekly.getSummary(weekStart)
          if (summaryRes) {
            const data = summaryRes.data || summaryRes.items || summaryRes
            if (data && !Array.isArray(data)) {
              setMyLastWeekSummary({
                done: data.done || data.completed || done,
                inProgress: data.in_progress || data.inProgress || inProgress,
                notStarted: data.not_started || data.notStarted || data.todo || notStarted,
                dailyCount: data.daily_count || data.dailyCount || 0,
              })
            }
          }
        } catch {
          // API not available yet
        }
      } catch {
        // API failed - show empty state
        setAssignedTasks([])
        setMyLastWeekSummary({ done: 0, inProgress: 0, notStarted: 0, dailyCount: 0 })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Group assigned tasks by project
  const projectGroupedTasks = useMemo(() => {
    const groups: { project: string; tasks: AssignedTask[] }[] = []
    const projectMap = new Map<string, AssignedTask[]>()
    for (const task of assignedTasks) {
      const proj = task.project || '프로젝트 없음'
      if (!projectMap.has(proj)) projectMap.set(proj, [])
      projectMap.get(proj)!.push(task)
    }
    for (const [project, tasks] of projectMap) {
      groups.push({ project, tasks })
    }
    return groups
  }, [assignedTasks])

  const renderTaskCard = (task: AssignedTask, idx: number, total: number) => {
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 15 }}>
          로딩 중...
        </div>
      ) : (
        <>
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
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{assignedTasks.length}건 배정됨</p>
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

            {assignedTasks.length === 0 ? (
              <div style={{ padding: '40px 28px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                배정된 태스크가 없습니다
              </div>
            ) : taskView === 'all' || projectGroupedTasks.length <= 1 ? (
              assignedTasks.map((task, idx) => renderTaskCard(task, idx, assignedTasks.length))
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
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                {planSaved && (
                  <span style={{ fontSize: 13, color: '#059669', fontWeight: 500 }}>저장되었습니다</span>
                )}
                <button
                  onClick={handleSaveWeekPlan}
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
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// External Weekly View
// ═══════════════════════════════════════
function ExternalWeekly() {
  const [loading, setLoading] = useState(true)
  const [projectSummaries, setProjectSummaries] = useState<ExternalProjectSummary[]>([])

  useEffect(() => {
    setLoading(true)

    const fetchData = async () => {
      try {
        const projectsRes: any = await api.projects.list()
        const projects: any[] = projectsRes.items || projectsRes.data || (Array.isArray(projectsRes) ? projectsRes : [])

        if (projects.length === 0) {
          setProjectSummaries([])
          return
        }

        // Fetch tasks for each project to compute stats
        const taskResults = await Promise.all(
          projects.map((p: any) =>
            api.tasks.listByProject(String(p.id)).catch(() => ({ items: [], data: [] }))
          )
        )

        const summaries: ExternalProjectSummary[] = projects.map((p: any, i: number) => {
          const res: any = taskResults[i]
          const tasks: any[] = res.items || res.data || (Array.isArray(res) ? res : [])

          const completed = tasks.filter((t: any) => t.status === 'done' || t.status === 'completed').length
          const inProgress = tasks.filter((t: any) => t.status === 'in_progress').length
          const notStarted = tasks.filter((t: any) => t.status === 'todo' || t.status === 'not_started' || !t.status).length

          return {
            project: p.name || p.title || p.id,
            code: p.code || p.project_code || '',
            completedTasks: completed,
            inProgressTasks: inProgress,
            notStartedTasks: notStarted,
            keyUpdates: [], // Could be populated from a separate API in the future
          }
        })

        setProjectSummaries(summaries)
      } catch {
        setProjectSummaries([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 15 }}>
          로딩 중...
        </div>
      ) : projectSummaries.length === 0 ? (
        <div style={{ ...cardStyle, padding: '40px 28px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
          참여 중인 프로젝트가 없습니다
        </div>
      ) : (
        /* Project summaries */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {projectSummaries.map((proj, pIdx) => (
            <div key={proj.code || pIdx} className={`opacity-0 animate-fade-in stagger-${pIdx + 1}`} style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{
                padding: '20px 28px', borderBottom: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>{proj.project}</h3>
                  {proj.code && (
                    <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' }}>{proj.code}</p>
                  )}
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
              {proj.keyUpdates.length > 0 && (
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
