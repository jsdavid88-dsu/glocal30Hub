import { useState, useCallback, useMemo } from 'react'
import { useRole } from '../contexts/RoleContext'
import MiniCalendar from '../components/MiniCalendar'

const mockEntries = [
  {
    id: 1,
    author: '한감성',
    authorRole: 'student',
    date: '2026-03-11',
    project: 'KOCCA AI Animation Pipeline',
    projectCode: 'KOCCA-2025-001',
    visibility: '프로젝트 공개',
    isAdvisee: true,
    blocks: [
      { section: '어제 한 일', content: 'Diffusion 모델 기반 캐릭터 생성 모듈 v2 학습 완료. FID 스코어 기존 대비 15% 개선 확인.', tags: ['AI/ML', 'Diffusion'] },
      { section: '오늘 할 일', content: '생성된 캐릭터의 모션 리타겟팅 파이프라인 테스트. Blender 연동 스크립트 작성 예정.', tags: ['Animation', 'Pipeline'] },
      { section: '이슈/논의', content: 'GPU 서버 메모리 부족 이슈 - A100 80GB에서도 batch size 4 이상 OOM 발생. 모델 경량화 검토 필요.', tags: ['인프라'] },
    ],
  },
  {
    id: 2,
    author: '강데이',
    authorRole: 'student',
    date: '2026-03-11',
    project: 'NRF GCA Narratology',
    projectCode: 'NRF-2025-042',
    visibility: '내부 공개',
    isAdvisee: true,
    blocks: [
      { section: '어제 한 일', content: '서사 구조 분석 알고리즘 논문 초안 작성 완료. GCA 프레임워크 Section 3 초안 리뷰.', tags: ['논문', 'NLP'] },
      { section: '오늘 할 일', content: '공동연구자 피드백 반영 및 실험 결과 시각화 작업. 한국서사학회 발표자료 준비.', tags: ['학회'] },
    ],
  },
  {
    id: 3,
    author: '윤스마',
    authorRole: 'student',
    date: '2026-03-10',
    project: 'Digital Heritage Archive',
    projectCode: 'MOC-2025-017',
    visibility: '프로젝트 공개',
    isAdvisee: true,
    blocks: [
      { section: '어제 한 일', content: '경복궁 3D 스캔 데이터 정합 완료. 포인트 클라우드 → 메쉬 변환 파이프라인 최적화.', tags: ['3D', 'Heritage'] },
      { section: '이슈/논의', content: '문화재청 데이터 활용 동의서 추가 서류 요청. 행정팀 협조 필요.', tags: ['행정'] },
      { section: '기타', content: '중간보고서 마감 3/31. 현재 90% 진행률 - 최종 검토 일정 조율 중.', tags: ['보고서'] },
    ],
  },
  {
    id: 4,
    author: '이학생',
    authorRole: 'self',
    date: '2026-03-10',
    project: 'KOCCA AI Animation Pipeline',
    projectCode: 'KOCCA-2025-001',
    visibility: '내부 공개',
    isAdvisee: false,
    blocks: [
      { section: '오늘 할 일', content: 'KOCCA 2차년도 중간평가 발표자료 준비. 데모 영상 편집 및 성과 지표 정리.', tags: ['평가', '발표'] },
    ],
  },
  {
    id: 5,
    author: '정인턴',
    authorRole: 'student',
    date: '2026-03-11',
    project: 'KOCCA AI Animation Pipeline',
    projectCode: 'KOCCA-2025-001',
    visibility: '프로젝트 공개',
    isAdvisee: true,
    blocks: [
      { section: '어제 한 일', content: '캐릭터 리깅 자동화 스크립트 v3 테스트 완료. 관절 인식률 92% 달성.', tags: ['Animation', 'Rigging'] },
      { section: '오늘 할 일', content: '리깅 결과물 Diffusion 모듈과 통합 테스트 진행 예정.', tags: ['Pipeline', 'Integration'] },
    ],
  },
  {
    id: 6,
    author: '임연구',
    authorRole: 'student',
    date: '2026-03-11',
    project: 'NRF GCA Narratology',
    projectCode: 'NRF-2025-042',
    visibility: '내부 공개',
    isAdvisee: true,
    blocks: [
      { section: '어제 한 일', content: 'GCA 코퍼스 전처리 파이프라인 구축. 총 1,200편 서사 텍스트 토큰화 완료.', tags: ['NLP', 'Data'] },
      { section: '이슈/논의', content: '저작권 이슈로 일부 텍스트 제외 필요. 법무팀 확인 중.', tags: ['법무'] },
    ],
  },
  {
    id: 7,
    author: '송리서',
    authorRole: 'student',
    date: '2026-03-10',
    visibility: '내부 공개',
    isAdvisee: true,
    blocks: [
      { section: '오늘 할 일', content: '연구 주제 탐색: 생성형 AI 기반 인터랙티브 스토리텔링 관련 선행연구 서베이.', tags: ['서베이', 'AI'] },
      { section: '기타', content: '다음 주 랩 세미나 발표 준비 시작.', tags: ['세미나'] },
    ],
  },
]

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

// Mock marked dates for day-mode calendar
const dailyMarkedDates: Record<string, 'submitted' | 'partial' | 'none'> = {
  '2026-03-03': 'submitted',
  '2026-03-04': 'submitted',
  '2026-03-05': 'partial',
  '2026-03-06': 'submitted',
  '2026-03-07': 'submitted',
  '2026-03-10': 'submitted',
  '2026-03-11': 'submitted',
  '2026-03-12': 'partial',
  '2026-03-13': 'submitted',
  '2026-03-17': 'partial',
  '2026-03-18': 'submitted',
  '2026-03-24': 'submitted',
  '2026-03-25': 'submitted',
  '2026-03-26': 'partial',
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

  const toggleEntry = (id: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Role-based entry filtering
  const roleFilteredEntries = mockEntries.filter((entry) => {
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
  const renderEntryCard = (entry: typeof mockEntries[0], i: number) => {
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
              { value: '2026-03-11', label: '2026-03-11' },
              { value: '2026-03-10', label: '2026-03-10' },
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
          {feedView === 'time' ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              {filteredEntries.map((entry, i) => renderEntryCard(entry, i))}

              {filteredEntries.length === 0 && (
                <div style={{ textAlign: 'center' as const, padding: 60, color: '#94a3b8' }}>
                  <p style={{ fontSize: 15 }}>조건에 맞는 항목이 없습니다.</p>
                </div>
              )}
            </div>
          ) : (
            <div>
              {projectGroupedEntries.length === 0 && (
                <div style={{ textAlign: 'center' as const, padding: 60, color: '#94a3b8' }}>
                  <p style={{ fontSize: 15 }}>조건에 맞는 항목이 없습니다.</p>
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
            markedDates={dailyMarkedDates}
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
