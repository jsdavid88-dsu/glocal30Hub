import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRole } from '../contexts/RoleContext'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'

// ── Types ──────────────────────────────────────────────────

type MemberRow = {
  id: string
  name: string
  email: string
  role: string
  apiRole: string
  department: string
  status: string
  color: string
  projects: { id: string; name: string }[]
  isAdvisee: boolean          // 지도학생 여부
  advisorName: string | null  // 학생의 지도교수 이름
}

type AdvisorRelation = {
  id: string
  professor_id: string
  student_id: string
  professor?: { id: string; name: string; email: string } | null
  student?: { id: string; name: string; email: string } | null
  created_at: string
}

type ProjectInfo = {
  id: string
  name: string
  code?: string
}

type SortKey = 'name' | 'role' | 'status'

// ── Constants ──────────────────────────────────────────────

const roleDisplayMap: Record<string, string> = {
  professor: '교수',
  student: '학생',
  external: '외부 파트너',
}

const avatarColors = ['#4f46e5', '#059669', '#d97706', '#e11d48', '#0284c7', '#7c3aed', '#64748b', '#b45309']

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

// ── Component ──────────────────────────────────────────────

export default function Members() {
  const navigate = useNavigate()
  const { currentRole } = useRole()
  const { user: currentUser } = useAuth()

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('전체')
  const [projectFilter, setProjectFilter] = useState('전체')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [allMembers, setAllMembers] = useState<MemberRow[]>([])
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [advisorRelations, setAdvisorRelations] = useState<AdvisorRelation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [registeringAdvisee, setRegisteringAdvisee] = useState<string | null>(null)

  // ── Fetch data ──────────────────────────────────────────

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        // Fetch users and projects in parallel
        const [usersRes, projectsRes] = await Promise.all([
          api.users.list().catch(() => ({ data: [] })),
          api.projects.list().catch(() => ({ data: [] })),
        ]) as [any, any]

        const userItems: any[] = usersRes?.data || []
        const projectItems: ProjectInfo[] = (projectsRes?.data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          code: p.code || '',
        }))
        setProjects(projectItems)

        // Fetch project membership for each project (in parallel)
        const membershipMap: Record<string, { id: string; name: string }[]> = {}
        const membershipPromises = projectItems.map(async (proj) => {
          try {
            const res: any = await api.projects.members(proj.id)
            const members: any[] = res?.data || res || []
            members.forEach((m: any) => {
              const uid = m.user_id || m.id
              if (!membershipMap[uid]) membershipMap[uid] = []
              membershipMap[uid].push({ id: proj.id, name: proj.name })
            })
          } catch { /* project members endpoint may not exist yet */ }
        })
        await Promise.all(membershipPromises)

        // Fetch advisor relations if current user exists
        let relations: AdvisorRelation[] = []
        if (currentUser?.id) {
          try {
            const token = localStorage.getItem('token')
            const advisorRes = await fetch(`/api/v1/users/${currentUser.id}/advisors`, {
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            })
            if (advisorRes.ok) {
              const advisorData = await advisorRes.json()
              relations = advisorData?.data || []
            }
          } catch { /* advisor endpoint may not be available */ }
        }
        setAdvisorRelations(relations)

        // Build advisee set (students advised by current professor)
        const adviseeIds = new Set(
          relations
            .filter((r) => r.professor_id === currentUser?.id)
            .map((r) => r.student_id)
        )

        // Build advisor name map (professor name for each student)
        const advisorNameMap: Record<string, string> = {}
        relations.forEach((r) => {
          if (r.student?.id && r.professor?.name) {
            advisorNameMap[r.student.id] = r.professor.name
          }
          // Also use professor_id/student_id for matching
          if (r.student_id && r.professor?.name) {
            advisorNameMap[r.student_id] = r.professor.name
          }
        })

        const mapped: MemberRow[] = userItems.map((u: any, idx: number) => ({
          id: u.id || '',
          name: u.name || '',
          email: u.email || '',
          role: roleDisplayMap[u.role] || u.role || '',
          apiRole: u.role || '',
          department: u.major_field || '',
          status: u.status === 'active' ? '재직' : u.status || '',
          color: avatarColors[idx % avatarColors.length],
          projects: membershipMap[u.id] || [],
          isAdvisee: adviseeIds.has(u.id),
          advisorName: advisorNameMap[u.id] || null,
        }))
        setAllMembers(mapped)
      } catch (e: any) {
        setError('데이터를 불러오는 중 오류가 발생했습니다.')
        setAllMembers([])
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [currentUser?.id])

  // ── Role-based filtering ────────────────────────────────

  const visibleMembers = useMemo(() => {
    return allMembers.filter((m) => {
      if (currentRole === 'professor') return true
      if (currentRole === 'student') return m.apiRole === 'student' || m.apiRole === 'professor'
      if (currentRole === 'external') return m.apiRole !== 'external' || m.id === currentUser?.id
      return true
    })
  }, [allMembers, currentRole, currentUser?.id])

  const roleOptions = useMemo(() => {
    return ['전체', ...Array.from(new Set(visibleMembers.map((m) => m.role))).filter(Boolean)]
  }, [visibleMembers])

  const projectOptions = useMemo(() => {
    return ['전체', ...projects.map((p) => p.name)]
  }, [projects])

  const filtered = useMemo(() => {
    let result = visibleMembers.filter((m) => {
      // Search: name, email, role
      if (search) {
        const q = search.toLowerCase()
        const matchesName = m.name.toLowerCase().includes(q)
        const matchesEmail = m.email.toLowerCase().includes(q)
        const matchesRole = m.role.toLowerCase().includes(q)
        if (!matchesName && !matchesEmail && !matchesRole) return false
      }
      if (roleFilter !== '전체' && m.role !== roleFilter) return false
      if (projectFilter !== '전체') {
        if (!m.projects.some((p) => p.name === projectFilter)) return false
      }
      return true
    })

    // Sort
    result = [...result].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ko')
      if (sortKey === 'role') return a.role.localeCompare(b.role, 'ko')
      if (sortKey === 'status') return a.status.localeCompare(b.status, 'ko')
      return 0
    })

    return result
  }, [visibleMembers, search, roleFilter, projectFilter, sortKey])

  // ── Stats ───────────────────────────────────────────────

  const stats = useMemo(() => {
    const byRole: Record<string, number> = {}
    visibleMembers.forEach((m) => {
      byRole[m.role] = (byRole[m.role] || 0) + 1
    })
    return { total: visibleMembers.length, byRole }
  }, [visibleMembers])

  // ── Detail panel ────────────────────────────────────────

  const handleCardClick = useCallback(async (member: MemberRow) => {
    if (expandedId === member.id) {
      setExpandedId(null)
      setDetailData(null)
      return
    }
    setExpandedId(member.id)
    setDetailLoading(true)
    setDetailData(null)

    try {
      const [userDetail, advisorRes] = await Promise.all([
        api.users.get(member.id).catch(() => null),
        (async () => {
          try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/v1/users/${member.id}/advisors`, {
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            })
            if (res.ok) return await res.json()
          } catch { /* ignore */ }
          return { data: [] }
        })(),
      ])

      setDetailData({
        user: userDetail,
        advisors: advisorRes?.data || [],
        projects: member.projects,
      })
    } catch {
      setDetailData(null)
    } finally {
      setDetailLoading(false)
    }
  }, [expandedId])

  // ── Register advisee ────────────────────────────────────

  const handleRegisterAdvisee = useCallback(async (studentId: string) => {
    if (!currentUser?.id) return
    setRegisteringAdvisee(studentId)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/v1/users/${studentId}/advisors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ professor_id: currentUser.id, student_id: studentId }),
      })
      if (res.ok) {
        // Update local state
        setAllMembers((prev) =>
          prev.map((m) => (m.id === studentId ? { ...m, isAdvisee: true } : m))
        )
        const newRelation = await res.json()
        setAdvisorRelations((prev) => [...prev, newRelation])
      } else {
        const err = await res.json().catch(() => null)
        alert(err?.detail || '지도학생 등록에 실패했습니다.')
      }
    } catch {
      alert('지도학생 등록 중 오류가 발생했습니다.')
    } finally {
      setRegisteringAdvisee(null)
    }
  }, [currentUser?.id])

  // ── Mask email for external view ────────────────────────

  const maskEmail = (email: string) => {
    const [local, domain] = email.split('@')
    if (!domain) return email
    const visibleLen = Math.min(2, local.length)
    return local.slice(0, visibleLen) + '***@' + domain
  }

  // ── Descriptions ────────────────────────────────────────

  const roleDescriptions: Record<string, string> = {
    professor: `총 ${stats.total}명의 연구 구성원을 관리합니다`,
    student: `${stats.total}명의 팀원과 함께하고 있습니다`,
    external: `${stats.total}명의 구성원 정보`,
  }

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '48px', color: '#94a3b8', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: 24, height: 24, border: '2.5px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ marginTop: 12, fontSize: 14 }}>로딩 중...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <p style={{ color: '#ef4444', fontSize: 15, marginBottom: 12 }}>{error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', color: '#475569', fontSize: 13, cursor: 'pointer',
          }}
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div key={currentRole} style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          구성원
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
          {roleDescriptions[currentRole]}
        </p>
      </div>

      {/* Stats Summary */}
      <div className="opacity-0 animate-fade-in stagger-1" style={{
        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' as const,
      }}>
        <div style={{
          ...cardStyle, padding: '14px 20px', flex: '1 1 120px', minWidth: 120, textAlign: 'center' as const,
        }}>
          <p style={{ fontSize: 24, fontWeight: 700, color: '#4f46e5' }}>{stats.total}</p>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>전체</p>
        </div>
        {Object.entries(stats.byRole).map(([role, count]) => (
          <div key={role} style={{
            ...cardStyle, padding: '14px 20px', flex: '1 1 120px', minWidth: 120, textAlign: 'center' as const,
          }}>
            <p style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{count}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>{role}</p>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="opacity-0 animate-fade-in stagger-2" style={{
        ...cardStyle, padding: '16px 20px', marginBottom: 20,
        display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'flex-end',
      }}>
        {/* Search */}
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4 }}>검색</label>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#94a3b8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 이메일, 역할 검색..."
              style={{
                width: '100%', padding: '6px 10px 6px 32px', borderRadius: 8,
                border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a', outline: 'none',
              }}
            />
          </div>
        </div>
        {/* Role filter */}
        <div style={{ minWidth: 120 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4 }}>역할</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{
            width: '100%', padding: '6px 10px', borderRadius: 8,
            border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a', background: '#fff', outline: 'none', cursor: 'pointer',
          }}>
            {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {/* Project filter */}
        <div style={{ minWidth: 140 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4 }}>프로젝트</label>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={{
            width: '100%', padding: '6px 10px', borderRadius: 8,
            border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a', background: '#fff', outline: 'none', cursor: 'pointer',
          }}>
            {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {/* Sort */}
        <div style={{ minWidth: 120 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4 }}>정렬</label>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={{
            width: '100%', padding: '6px 10px', borderRadius: 8,
            border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a', background: '#fff', outline: 'none', cursor: 'pointer',
          }}>
            <option value="name">이름순</option>
            <option value="role">역할순</option>
            <option value="status">상태순</option>
          </select>
        </div>
      </div>

      {/* Student view — My advisor info */}
      {currentRole === 'student' && currentUser && (() => {
        const myAdvisor = allMembers.find((m) => {
          return advisorRelations.some(
            (r) => r.student_id === currentUser.id && r.professor_id === m.id
          )
        })
        if (!myAdvisor) return null
        return (
          <div className="opacity-0 animate-fade-in stagger-2" style={{
            ...cardStyle, padding: 20, marginBottom: 20,
            borderLeft: '4px solid #4f46e5',
          }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 }}>
              나의 지도교수
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'linear-gradient(135deg, #4f46e5, #4f46e5dd)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{myAdvisor.name.charAt(0)}</span>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{myAdvisor.name}</p>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{myAdvisor.email}</p>
                {myAdvisor.department && (
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{myAdvisor.department}</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Student view — My task summary */}
      {currentRole === 'student' && currentUser && (() => {
        const myProjects = allMembers.find((m) => m.id === currentUser.id)?.projects || []
        if (myProjects.length === 0) return null
        return (
          <div className="opacity-0 animate-fade-in stagger-2" style={{
            ...cardStyle, padding: 20, marginBottom: 20,
          }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 }}>
              나의 프로젝트
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              {myProjects.map((p) => (
                <span key={p.id} style={{
                  padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: '#ede9fe', color: '#6d28d9',
                }}>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Results count */}
      <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
        {filtered.length}명 표시 중
        {search || roleFilter !== '전체' || projectFilter !== '전체' ? ` (필터 적용)` : ''}
      </p>

      {/* Member Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {filtered.map((member, i) => {
          const isExpanded = expandedId === member.id
          const isExternal = currentRole === 'external'

          return (
            <div key={member.id} style={{ gridColumn: isExpanded ? '1 / -1' : undefined }}>
              <div
                className={`opacity-0 animate-fade-in stagger-${Math.min(i + 3, 6)}`}
                style={{
                  ...cardStyle,
                  padding: 24,
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s, transform 0.2s',
                  borderLeft: member.isAdvisee && currentRole === 'professor'
                    ? '4px solid #f59e0b'
                    : isExpanded ? '4px solid #4f46e5' : undefined,
                }}
                onClick={() => handleCardClick(member)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = cardStyle.boxShadow
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${member.color}, ${member.color}dd)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{member.name.charAt(0)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{member.name}</p>
                      {/* Status badge */}
                      <span style={{
                        padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 500,
                        background: member.status === '재직' ? '#d1fae5' : '#fee2e2',
                        color: member.status === '재직' ? '#047857' : '#dc2626',
                      }}>
                        {member.status}
                      </span>
                      {/* 지도학생 badge */}
                      {currentRole === 'professor' && member.isAdvisee && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600,
                          background: '#fef3c7', color: '#b45309',
                        }}>
                          지도학생
                        </span>
                      )}
                      {/* Role badge for professor view */}
                      {currentRole === 'professor' && member.apiRole === 'student' && !member.isAdvisee && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 500,
                          background: '#e0e7ff', color: '#4338ca',
                        }}>
                          학생
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{member.role}</p>
                    {/* Advisor name for student cards (professor view) */}
                    {currentRole === 'professor' && member.apiRole === 'student' && member.advisorName && !member.isAdvisee && (
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                        지도교수: {member.advisorName}
                      </p>
                    )}
                  </div>
                  {/* Expand indicator */}
                  <svg
                    style={{
                      width: 16, height: 16, color: '#94a3b8', flexShrink: 0,
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform 0.2s',
                    }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Info rows */}
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 13, color: '#64748b' }}>
                  {/* Email — masked for external */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg style={{ width: 14, height: 14, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {isExternal ? maskEmail(member.email) : member.email}
                    </span>
                  </div>
                  {/* Department */}
                  {member.department && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg style={{ width: 14, height: 14, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span>{member.department}</span>
                    </div>
                  )}
                </div>

                {/* Project tags */}
                {member.projects.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                    {member.projects.map((p) => (
                      <span key={p.id} style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500,
                        background: '#f1f5f9', color: '#475569',
                      }}>
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Detail link */}
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/members/${member.id}`)
                    }}
                    style={{
                      padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                      border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569',
                      cursor: 'pointer', transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4338ca' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#475569' }}
                  >
                    프로필 보기
                  </button>
                </div>

                {/* Professor view: register advisee button */}
                {currentRole === 'professor' && member.apiRole === 'student' && !member.isAdvisee && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRegisterAdvisee(member.id)
                      }}
                      disabled={registeringAdvisee === member.id}
                      style={{
                        padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                        border: '1px solid #e2e8f0', background: '#fef3c7', color: '#92400e',
                        cursor: registeringAdvisee === member.id ? 'not-allowed' : 'pointer',
                        opacity: registeringAdvisee === member.id ? 0.6 : 1,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { if (registeringAdvisee !== member.id) e.currentTarget.style.background = '#fde68a' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#fef3c7' }}
                    >
                      {registeringAdvisee === member.id ? '등록 중...' : '지도학생 등록'}
                    </button>
                  </div>
                )}

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div style={{
                    marginTop: 18, paddingTop: 18,
                    borderTop: '1px solid #f1f5f9',
                  }} onClick={(e) => e.stopPropagation()}>
                    {detailLoading ? (
                      <div style={{ textAlign: 'center' as const, padding: 20, color: '#94a3b8' }}>
                        <p style={{ fontSize: 13 }}>상세 정보 로딩 중...</p>
                      </div>
                    ) : detailData ? (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
                        {/* Full profile info */}
                        {detailData.user && (
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 }}>
                              프로필 정보
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: 13 }}>
                              {detailData.user.major_field && (
                                <>
                                  <span style={{ color: '#94a3b8' }}>전공/분야</span>
                                  <span style={{ color: '#334155' }}>{detailData.user.major_field}</span>
                                </>
                              )}
                              {detailData.user.company && (
                                <>
                                  <span style={{ color: '#94a3b8' }}>소속</span>
                                  <span style={{ color: '#334155' }}>{detailData.user.company}</span>
                                </>
                              )}
                              {detailData.user.interest_fields?.length > 0 && (
                                <>
                                  <span style={{ color: '#94a3b8' }}>관심분야</span>
                                  <span style={{ color: '#334155' }}>{detailData.user.interest_fields.join(', ')}</span>
                                </>
                              )}
                              {detailData.user.last_login_at && (
                                <>
                                  <span style={{ color: '#94a3b8' }}>최근 로그인</span>
                                  <span style={{ color: '#334155' }}>
                                    {new Date(detailData.user.last_login_at).toLocaleDateString('ko-KR')}
                                  </span>
                                </>
                              )}
                              <>
                                <span style={{ color: '#94a3b8' }}>가입일</span>
                                <span style={{ color: '#334155' }}>
                                  {new Date(detailData.user.created_at).toLocaleDateString('ko-KR')}
                                </span>
                              </>
                            </div>
                          </div>
                        )}

                        {/* Advisor relationships */}
                        {detailData.advisors?.length > 0 && (
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 }}>
                              지도 관계
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                              {detailData.advisors.map((rel: any) => {
                                const isProfessor = rel.professor_id === member.id
                                const other = isProfessor ? rel.student : rel.professor
                                return (
                                  <div key={rel.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 12px', borderRadius: 8, background: '#fafafa', fontSize: 13,
                                  }}>
                                    <span style={{
                                      padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                      background: isProfessor ? '#dbeafe' : '#fef3c7',
                                      color: isProfessor ? '#1d4ed8' : '#b45309',
                                    }}>
                                      {isProfessor ? '지도학생' : '지도교수'}
                                    </span>
                                    <span style={{ color: '#334155' }}>{other?.name || '(알 수 없음)'}</span>
                                    {other?.email && !isExternal && (
                                      <span style={{ color: '#94a3b8', fontSize: 11 }}>({other.email})</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Project memberships */}
                        {detailData.projects?.length > 0 && (
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 }}>
                              프로젝트 소속
                            </p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                              {detailData.projects.map((p: any) => (
                                <span key={p.id} style={{
                                  padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                                  background: '#ede9fe', color: '#6d28d9',
                                }}>
                                  {p.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center' as const, padding: 16, color: '#94a3b8' }}>
                        <p style={{ fontSize: 13 }}>상세 정보를 불러올 수 없습니다.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center' as const, padding: 60, color: '#94a3b8' }}>
          <svg style={{ width: 48, height: 48, margin: '0 auto 12px', color: '#cbd5e1' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          <p style={{ fontSize: 15 }}>조건에 맞는 구성원이 없습니다.</p>
          <p style={{ fontSize: 13, marginTop: 4, color: '#cbd5e1' }}>검색어나 필터를 변경해 보세요.</p>
        </div>
      )}
    </div>
  )
}
