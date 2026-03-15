import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRole } from '../contexts/RoleContext'
import { api } from '../api/client'
import MiniCalendar from '../components/MiniCalendar'

// External can only see project-scope blocks from assigned projects
const externalAssignedProjects = ['KOCCA-2025-001', 'MOC-2025-017']

const sectionColors: Record<string, { bg: string; color: string }> = {
  '어제 한 일': { bg: '#e0e7ff', color: '#4338ca' },
  '오늘 할 일': { bg: '#d1fae5', color: '#047857' },
  '이슈/논의': { bg: '#ffe4e6', color: '#be123c' },
  '기타': { bg: '#f1f5f9', color: '#64748b' },
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}


function formatDateLabel(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${y}년 ${m}월 ${day}일 (${weekdays[d.getDay()]})`
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
// Collapsible Project Section
// ═══════════════════════════════════════
function CollapsibleProjectSection({
  title,
  icon,
  count,
  defaultOpen = true,
  children,
}: {
  title: string
  icon?: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ marginBottom: 16 }}>
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
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9' }}
      >
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', flex: 1 }}>{title}</span>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{count}건</span>
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
          maxHeight: open ? '5000px' : '0px',
          transition: 'max-height 0.35s ease',
        }}
      >
        <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function DailyFeed() {
  const { currentRole } = useRole()
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 2, 12))
  const handleDaySelect = useCallback((d: Date) => setSelectedDate(d), [])
  const selectedDateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate])
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set([1, 2]))
  const [filterDate, setFilterDate] = useState('')
  const [filterAuthor, setFilterAuthor] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [feedView, setFeedView] = useState<'time' | 'project'>('time')
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [apiLoaded, setApiLoaded] = useState(false)
  const [markedDates, setMarkedDates] = useState<Record<string, 'submitted' | 'partial' | 'none'>>({})

  // Map API section enum values to Korean labels
  const sectionLabelMap: Record<string, string> = {
    yesterday: '어제 한 일',
    today: '오늘 할 일',
    issue: '이슈/논의',
    misc: '기타',
  }

  // Map API visibility enum values to Korean labels
  const visibilityLabelMap: Record<string, string> = {
    private: '나만 보기',
    advisor: '지도교수 공개',
    internal: '내부 공개',
    project: '프로젝트 공개',
  }

  // Fetch marked dates for the current month (for mini calendar)
  useEffect(() => {
    (async () => {
      try {
        const year = selectedDate.getFullYear()
        const month = selectedDate.getMonth()
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`
        const lastDate = new Date(year, month + 1, 0).getDate()
        const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`
        const monthLogs: any = await api.daily.list({ date_from: firstDay, date_to: lastDay, limit: '100' })
        const items = Array.isArray(monthLogs) ? monthLogs : (monthLogs?.data || [])
        const dateMap: Record<string, 'submitted' | 'partial' | 'none'> = {}
        for (const log of items) {
          const d = typeof log.date === 'string' ? log.date : ''
          if (d) {
            // Mark as submitted if log exists; could enhance with block count check
            dateMap[d] = 'submitted'
          }
        }
        setMarkedDates(dateMap)
      } catch {
        // Backend not available, leave empty
      }
    })()
  }, [selectedDate.getFullYear(), selectedDate.getMonth()])

  // Fetch entries for the selected date
  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
        // Use date_from and date_to to filter for a specific day
        const apiLogs: any = await api.daily.list({ date_from: dateStr, date_to: dateStr, limit: '50' })
        const items = Array.isArray(apiLogs) ? apiLogs : (apiLogs?.data || [])
        setApiLoaded(true)
        setEntries(items.map((log: any, idx: number) => {
          // Determine visibility label from the first block (or default)
          const firstBlockVisibility = log.blocks?.[0]?.visibility || 'internal'
          const visibilityLabel = visibilityLabelMap[firstBlockVisibility] || '내부 공개'
          return {
            id: log.id || idx + 1,
            author: log.author?.name || log.author_name || '',
            authorRole: log.author?.role || 'student',
            date: typeof log.date === 'string' ? log.date : dateStr,
            project: '',
            projectCode: '',
            visibility: visibilityLabel,
            isAdvisee: true,
            blocks: (log.blocks || []).map((b: any) => ({
              section: sectionLabelMap[b.section] || b.section || '기타',
              content: b.content || '',
              tags: (b.tags || []).map((t: any) => t.tag?.name || t.name || ''),
            })),
          }
        }))
      } catch {
        // Backend not available, show empty
        setEntries([])
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedDate])

  const toggleEntry = (id: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Role-based entry filtering
  const roleFilteredEntries = entries.filter((entry) => {
    if (currentRole === 'professor') {
      // Professor sees advisee dailies
      return true
    }
    if (currentRole === 'student') {
      // Student sees own + project-shared
      return entry.authorRole === 'self' || entry.visibility === '프로젝트 공개'
    }
    if (currentRole === 'external') {
      // External sees only project-scope blocks from assigned projects
      return entry.visibility === '프로젝트 공개' && externalAssignedProjects.includes(entry.projectCode || '')
    }
    return true
  })

  const filteredEntries = roleFilteredEntries.filter((entry) => {
    if (filterDate && entry.date !== filterDate) return false
    if (filterAuthor && entry.author !== filterAuthor) return false
    if (filterProject && entry.projectCode !== filterProject) return false
    if (filterSection && !entry.blocks.some((b) => b.section === filterSection)) return false
    return true
  })

  // Group entries by project
  const projectGroupedEntries = useMemo(() => {
    const groups: { project: string; projectCode: string; entries: typeof filteredEntries }[] = []
    const projectMap = new Map<string, typeof filteredEntries>()
    const projectNames = new Map<string, string>()

    for (const entry of filteredEntries) {
      const code = entry.projectCode || '__none__'
      const name = entry.project || '프로젝트 없음'
      if (!projectMap.has(code)) {
        projectMap.set(code, [])
        projectNames.set(code, name)
      }
      projectMap.get(code)!.push(entry)
    }

    // Named projects first, then unassigned
    for (const [code, entries] of projectMap) {
      if (code !== '__none__') {
        groups.push({ project: projectNames.get(code)!, projectCode: code, entries })
      }
    }
    if (projectMap.has('__none__')) {
      groups.push({ project: '프로젝트 없음', projectCode: '__none__', entries: projectMap.get('__none__')! })
    }

    return groups
  }, [filteredEntries])

  // Build author options from visible entries
  const visibleAuthors = [...new Set(roleFilteredEntries.map(e => e.author))]
  const visibleProjects = [...new Set(roleFilteredEntries.map(e => ({ code: e.projectCode || '', name: e.project || '' })).filter(p => p.code).map(p => JSON.stringify(p)))].map(p => JSON.parse(p))

  const roleDescription: Record<string, string> = {
    professor: '지도학생들의 연구 활동을 확인합니다.',
    student: '내 데일리와 프로젝트 공유 항목을 확인합니다.',
    external: '참여 프로젝트의 공개 활동을 확인합니다.',
  }

  // Render a single entry card
  const renderEntryCard = (entry: typeof entries[0], i: number) => {
    const expanded = expandedEntries.has(entry.id)
    const visibleBlocks = currentRole === 'external'
      ? entry.blocks.filter(b => b.section !== '기타')
      : entry.blocks

    return (
      <div
        key={entry.id}
        className={`opacity-0 animate-fade-in stagger-${Math.min(i + 2, 6)}`}
        style={{ ...cardStyle, overflow: 'hidden' }}
      >
        {/* Entry Header */}
        <div
          onClick={() => toggleEntry(entry.id)}
          style={{
            padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{entry.author.charAt(0)}</span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{entry.author}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{entry.date}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {entry.project && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                    background: '#f1f5f9', color: '#475569',
                  }}>
                    {entry.project}
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{entry.visibility}</span>
              </div>
            </div>
          </div>
          <svg
            style={{
              width: 18, height: 18, color: '#94a3b8', transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Entry Blocks */}
        {expanded && (
          <div style={{ padding: '0 24px 20px' }}>
            {visibleBlocks.map((block, bi) => {
              const sc = sectionColors[block.section] || sectionColors['기타']
              return (
                <div key={bi} style={{
                  padding: '14px 16px', borderRadius: 10, marginTop: 8,
                  background: '#f8fafc', border: '1px solid #f1f5f9',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: sc.bg, color: sc.color,
                    }}>
                      {block.section}
                    </span>
                    {block.tags.map((tag) => (
                      <span key={tag} style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500,
                        background: '#e2e8f0', color: '#64748b',
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.7 }}>{block.content}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div key={currentRole} className="daily-feed-root" style={{ maxWidth: 1160, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 12 }} className="animate-fade-in">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
            데일리 피드
          </h1>
          <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
            {roleDescription[currentRole]}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ViewToggle
            options={[
              { value: 'time', label: '시간순' },
              { value: 'project', label: '프로젝트별' },
            ]}
            value={feedView}
            onChange={(v) => setFeedView(v as 'time' | 'project')}
          />
          {currentRole === 'student' && (
            <a href="/daily/write" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: '#4f46e5', color: '#fff', textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
            }}>
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              새 글 작성
            </a>
          )}
        </div>
      </div>

      {/* Main content + sidebar layout */}
      <div className="daily-feed-layout" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Left: main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Selected date label */}
          <div className="opacity-0 animate-fade-in stagger-1" style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 16,
            padding: '10px 16px',
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{selectedDateLabel}</span>
          </div>

          {/* Filter Bar */}
          <div className="opacity-0 animate-fade-in stagger-1" style={{
            ...cardStyle, padding: '16px 20px', marginBottom: 20,
            display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'flex-end',
          }}>
            <FilterSelect label="날짜" value={filterDate} onChange={setFilterDate} options={[
              { value: '', label: '전체' },
              ...[...new Set(roleFilteredEntries.map(e => e.date))].sort().reverse().map(d => ({ value: d, label: d })),
            ]} />
            {currentRole === 'professor' && (
              <FilterSelect label="학생" value={filterAuthor} onChange={setFilterAuthor} options={[
                { value: '', label: '전체' },
                ...visibleAuthors.map(a => ({ value: a, label: a })),
              ]} />
            )}
            <FilterSelect label="과제" value={filterProject} onChange={setFilterProject} options={[
              { value: '', label: '전체' },
              ...visibleProjects.map((p: { code: string; name: string }) => ({ value: p.code, label: p.name })),
            ]} />
            <FilterSelect label="섹션" value={filterSection} onChange={setFilterSection} options={[
              { value: '', label: '전체' },
              { value: '어제 한 일', label: '어제 한 일' },
              { value: '오늘 할 일', label: '오늘 할 일' },
              { value: '이슈/논의', label: '이슈/논의' },
              { value: '기타', label: '기타' },
            ]} />
          </div>

          {/* Feed Entries */}
          {loading ? (
            <div style={{ textAlign: 'center' as const, padding: 60, color: '#94a3b8' }}>
              <p style={{ fontSize: 15 }}>로딩 중...</p>
            </div>
          ) : feedView === 'time' ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              {filteredEntries.map((entry, i) => renderEntryCard(entry, i))}

              {filteredEntries.length === 0 && (
                <div style={{ textAlign: 'center' as const, padding: 60, color: '#94a3b8' }}>
                  <p style={{ fontSize: 15 }}>{apiLoaded ? '아직 데일리가 없습니다.' : '조건에 맞는 항목이 없습니다.'}</p>
                </div>
              )}
            </div>
          ) : (
            <div>
              {projectGroupedEntries.length === 0 && (
                <div style={{ textAlign: 'center' as const, padding: 60, color: '#94a3b8' }}>
                  <p style={{ fontSize: 15 }}>{apiLoaded ? '아직 데일리가 없습니다.' : '조건에 맞는 항목이 없습니다.'}</p>
                </div>
              )}
              {projectGroupedEntries.map((group) => (
                <CollapsibleProjectSection
                  key={group.projectCode}
                  title={group.project}
                  icon={group.projectCode === '__none__' ? undefined : '\uD83D\uDCC1'}
                  count={group.entries.length}
                  defaultOpen={true}
                >
                  {group.entries.map((entry, i) => renderEntryCard(entry, i))}
                </CollapsibleProjectSection>
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar: MiniCalendar */}
        <div className="daily-feed-sidebar opacity-0 animate-fade-in stagger-1" style={{ flexShrink: 0 }}>
          <MiniCalendar
            mode="day"
            selectedDate={selectedDate}
            onSelect={handleDaySelect}
            markedDates={markedDates}
          />
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .daily-feed-layout {
            flex-direction: column-reverse !important;
          }
          .daily-feed-sidebar {
            align-self: center;
          }
        }
      `}</style>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ minWidth: 140 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4 }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '6px 10px', borderRadius: 8,
          border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a',
          background: '#fff', outline: 'none', cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
