import { useState } from 'react'
import { useRole } from '../contexts/RoleContext'

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

export default function DailyFeed() {
  const { currentRole } = useRole()
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set([1, 2]))
  const [filterDate, setFilterDate] = useState('')
  const [filterAuthor, setFilterAuthor] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterSection, setFilterSection] = useState('')

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
      return entry.visibility === '프로젝트 공개' && externalAssignedProjects.includes(entry.projectCode)
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

  // Build author options from visible entries
  const visibleAuthors = [...new Set(roleFilteredEntries.map(e => e.author))]
  const visibleProjects = [...new Set(roleFilteredEntries.map(e => ({ code: e.projectCode, name: e.project })).map(p => JSON.stringify(p)))].map(p => JSON.parse(p))

  const roleDescription: Record<string, string> = {
    professor: '지도학생들의 연구 활동을 확인합니다.',
    student: '내 데일리와 프로젝트 공유 항목을 확인합니다.',
    external: '참여 프로젝트의 공개 활동을 확인합니다.',
  }

  return (
    <div key={currentRole} style={{ maxWidth: 900, margin: '0 auto' }}>
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
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
        {filteredEntries.map((entry, i) => {
          const expanded = expandedEntries.has(entry.id)
          // External: filter out non-project-scope blocks (e.g. private sections)
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
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                        background: '#f1f5f9', color: '#475569',
                      }}>
                        {entry.project}
                      </span>
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
        })}

        {filteredEntries.length === 0 && (
          <div style={{ textAlign: 'center' as const, padding: 60, color: '#94a3b8' }}>
            <p style={{ fontSize: 15 }}>조건에 맞는 항목이 없습니다.</p>
          </div>
        )}
      </div>
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
