import { useState } from 'react'
import { useRole } from '../contexts/RoleContext'

const allMembers = [
  { name: '김연구', email: 'kim@university.ac.kr', role: 'PI (연구책임자)', department: '디지털콘텐츠학과', projects: ['KOCCA-2025-001'], status: '재직', color: '#4f46e5', isAdvisee: false, isProjectTeam: true, sharedProject: true },
  { name: '이서사', email: 'lee@university.ac.kr', role: '공동연구원', department: '디지털콘텐츠학과', projects: ['NRF-2025-042'], status: '재직', color: '#059669', isAdvisee: false, isProjectTeam: true, sharedProject: false },
  { name: '박디지', email: 'park@university.ac.kr', role: '공동연구원', department: '문화유산학과', projects: ['MOC-2025-017'], status: '재직', color: '#d97706', isAdvisee: false, isProjectTeam: true, sharedProject: true },
  { name: '최이머', email: 'choi@university.ac.kr', role: '연구교수', department: '컴퓨터공학과', projects: ['IITP-2026-003'], status: '재직', color: '#e11d48', isAdvisee: false, isProjectTeam: false, sharedProject: false },
  { name: '한감성', email: 'han@university.ac.kr', role: '박사과정', department: '디지털콘텐츠학과', projects: ['NRF-2026-088', 'KOCCA-2025-001'], status: '재학', color: '#0284c7', isAdvisee: true, isProjectTeam: true, sharedProject: true },
  { name: '윤스마', email: 'yoon@university.ac.kr', role: '석사과정', department: '컴퓨터공학과', projects: ['MSIT-2025-055'], status: '재학', color: '#7c3aed', isAdvisee: true, isProjectTeam: true, sharedProject: false },
  { name: '정인턴', email: 'jung@university.ac.kr', role: '학부 인턴', department: '디지털콘텐츠학과', projects: ['KOCCA-2025-001'], status: '재학', color: '#64748b', isAdvisee: true, isProjectTeam: true, sharedProject: true },
  { name: '강데이', email: 'kang@university.ac.kr', role: '연구원', department: '디지털콘텐츠학과', projects: ['NRF-2025-042', 'MOC-2025-017'], status: '재직', color: '#059669', isAdvisee: true, isProjectTeam: true, sharedProject: true },
]

const roleOptions = ['전체', 'PI (연구책임자)', '공동연구원', '연구교수', '박사과정', '석사과정', '학부 인턴', '연구원']
const projectOptions = ['전체', 'KOCCA-2025-001', 'NRF-2025-042', 'MOC-2025-017', 'IITP-2026-003', 'NRF-2026-088', 'MSIT-2025-055']

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

export default function Members() {
  const { currentRole } = useRole()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('전체')
  const [projectFilter, setProjectFilter] = useState('전체')

  // Role-based member visibility
  const visibleMembers = allMembers.filter((m) => {
    if (currentRole === 'professor') return true // sees all, especially advisees with detail
    if (currentRole === 'student') return m.isProjectTeam // sees project team members
    if (currentRole === 'external') return m.sharedProject // sees only members from shared projects
    return true
  })

  const filtered = visibleMembers.filter((m) => {
    if (search && !m.name.includes(search) && !m.email.includes(search)) return false
    if (roleFilter !== '전체' && m.role !== roleFilter) return false
    if (projectFilter !== '전체' && !m.projects.includes(projectFilter)) return false
    return true
  })

  const roleDescriptions: Record<string, string> = {
    professor: `${allMembers.length}명의 연구 구성원 (지도학생 ${allMembers.filter(m => m.isAdvisee).length}명)`,
    student: `${visibleMembers.length}명의 프로젝트 팀원`,
    external: `${visibleMembers.length}명의 공유 프로젝트 구성원`,
  }

  return (
    <div key={currentRole} style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          구성원
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
          {roleDescriptions[currentRole]}
        </p>
      </div>

      {/* Search & Filters */}
      <div className="opacity-0 animate-fade-in stagger-1" style={{
        ...cardStyle, padding: '16px 20px', marginBottom: 20,
        display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'flex-end',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4 }}>검색</label>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#94a3b8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름 또는 이메일 검색..."
              style={{
                width: '100%', padding: '6px 10px 6px 32px', borderRadius: 8,
                border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a', outline: 'none',
              }}
            />
          </div>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4 }}>역할</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{
            width: '100%', padding: '6px 10px', borderRadius: 8,
            border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a', background: '#fff', outline: 'none', cursor: 'pointer',
          }}>
            {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4 }}>과제</label>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={{
            width: '100%', padding: '6px 10px', borderRadius: 8,
            border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a', background: '#fff', outline: 'none', cursor: 'pointer',
          }}>
            {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Member Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {filtered.map((member, i) => (
          <div
            key={member.email}
            className={`opacity-0 animate-fade-in stagger-${Math.min(i + 2, 6)}`}
            style={{
              ...cardStyle, padding: 24, cursor: 'pointer', transition: 'box-shadow 0.2s, transform 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = cardStyle.boxShadow
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: `linear-gradient(135deg, ${member.color}, ${member.color}dd)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{member.name.charAt(0)}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{member.name}</p>
                  <span style={{
                    padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 500,
                    background: member.status === '재직' ? '#d1fae5' : '#e0e7ff',
                    color: member.status === '재직' ? '#047857' : '#4338ca',
                  }}>
                    {member.status}
                  </span>
                  {currentRole === 'professor' && member.isAdvisee && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600,
                      background: '#fef3c7', color: '#b45309',
                    }}>
                      지도학생
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{member.role}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 13, color: '#64748b' }}>
              {/* External: hide email for privacy */}
              {currentRole !== 'external' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg style={{ width: 14, height: 14, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{member.email}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg style={{ width: 14, height: 14, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span>{member.department}</span>
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
              {member.projects.map((p) => (
                <span key={p} style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500,
                  background: '#f1f5f9', color: '#475569', fontFamily: 'monospace',
                }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center' as const, padding: 60, color: '#94a3b8' }}>
          <p style={{ fontSize: 15 }}>조건에 맞는 구성원이 없습니다.</p>
        </div>
      )}
    </div>
  )
}
