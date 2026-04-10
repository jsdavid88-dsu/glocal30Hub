import { useState, useEffect, useCallback } from 'react'
import { useRole } from '../contexts/RoleContext'

// ── Types ──────────────────────────────────────────────────

type AdminUser = {
  id: string
  email: string
  name: string
  role: string
  status: string
  profile_image_url: string | null
  major_field: string | null
  company: string | null
  created_at: string | null
  last_login_at: string | null
  advisors: { relation_id: string; professor_id: string; professor_name: string | null }[]
}

type AdminProject = {
  id: string
  name: string
  description: string | null
  status: string
  start_date: string | null
  end_date: string | null
  member_count: number
  created_at: string | null
}

type AdminTag = {
  id: string
  name: string
  color: string | null
  scope_type: string
  project_id: string | null
  created_at: string | null
}

type TabKey = 'users' | 'projects' | 'tags'

// ── Helpers ─────────────────────────────────────────────────

const API_BASE = '/api/v1'

async function adminFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`API Error ${res.status}: ${errText}`)
  }
  return res.json()
}

const projectStatusLabels: Record<string, string> = {
  active: '진행중',
  paused: '일시중지',
  completed: '완료',
}

const scopeLabels: Record<string, string> = {
  global: '전역',
  project: '프로젝트',
}

function formatDate(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// ── Styles ──────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  padding: '32px 40px',
  width: '100%',
}

const headerStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: '#1e293b',
  marginBottom: 24,
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  borderBottom: '2px solid #e2e8f0',
  marginBottom: 24,
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 24px',
  fontSize: 14,
  fontWeight: active ? 600 : 400,
  color: active ? '#4f46e5' : '#64748b',
  background: 'none',
  border: 'none',
  borderBottom: active ? '2px solid #4f46e5' : '2px solid transparent',
  marginBottom: -2,
  cursor: 'pointer',
  transition: 'all 0.15s',
})

const searchBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 16,
  gap: 12,
}

const searchInputStyle: React.CSSProperties = {
  padding: '8px 14px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
  width: 280,
  outline: 'none',
}

const btnPrimaryStyle: React.CSSProperties = {
  padding: '8px 18px',
  background: '#4f46e5',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnDangerStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: '#fee2e2',
  color: '#dc2626',
  border: '1px solid #fca5a5',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
}

const btnSmallStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: '#f1f5f9',
  color: '#475569',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '2px solid #e2e8f0',
  color: '#64748b',
  fontWeight: 600,
  fontSize: 13,
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #f1f5f9',
  color: '#334155',
  verticalAlign: 'middle',
}

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  background: '#fff',
  cursor: 'pointer',
}

const badgeStyle = (color: string, bg: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 99,
  fontSize: 12,
  fontWeight: 500,
  color,
  background: bg,
})

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.3)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: '28px 32px',
  minWidth: 420,
  maxWidth: 520,
  boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
}

const modalTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#1e293b',
  marginBottom: 20,
}

const formGroupStyle: React.CSSProperties = {
  marginBottom: 14,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#475569',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const modalBtnRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  marginTop: 20,
}

const emptyStyle: React.CSSProperties = {
  padding: 40,
  textAlign: 'center',
  color: '#94a3b8',
  fontSize: 14,
}

const statusDot = (status: string): React.CSSProperties => ({
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  marginRight: 6,
  background: status === 'active' ? '#22c55e' : status === 'pending' ? '#f59e0b' : '#94a3b8',
})

const tagColorDot = (color: string | null): React.CSSProperties => ({
  display: 'inline-block',
  width: 14,
  height: 14,
  borderRadius: 4,
  background: color || '#94a3b8',
  marginRight: 8,
  verticalAlign: 'middle',
  border: '1px solid rgba(0,0,0,0.1)',
})

// ── Component ───────────────────────────────────────────────

export default function Admin() {
  const { currentRole } = useRole()
  const [activeTab, setActiveTab] = useState<TabKey>('users')

  // Access check
  if (currentRole !== 'professor') {
    return (
      <div style={pageStyle}>
        <div style={{ ...emptyStyle, fontSize: 16 }}>
          관리자 권한이 필요합니다. 교수 또는 관리자만 접근 가능합니다.
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <h1 style={headerStyle}>관리자 설정</h1>
      <div style={tabBarStyle}>
        <button style={tabStyle(activeTab === 'users')} onClick={() => setActiveTab('users')}>
          사용자 관리
        </button>
        <button style={tabStyle(activeTab === 'projects')} onClick={() => setActiveTab('projects')}>
          프로젝트 관리
        </button>
        <button style={tabStyle(activeTab === 'tags')} onClick={() => setActiveTab('tags')}>
          태그 관리
        </button>
      </div>

      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'projects' && <ProjectsTab />}
      {activeTab === 'tags' && <TagsTab />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  사용자 관리 Tab
// ═══════════════════════════════════════════════════════════════

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [advisorModal, setAdvisorModal] = useState<AdminUser | null>(null)
  const [professorList, setProfessorList] = useState<AdminUser[]>([])
  const [selectedProfessor, setSelectedProfessor] = useState('')

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const params = search ? `?q=${encodeURIComponent(search)}&limit=200` : '?limit=200'
      const res = await adminFetch(`/admin/users${params}`)
      setUsers(res.data || [])
    } catch (err) {
      console.error('Failed to fetch users:', err)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await adminFetch(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      })
      fetchUsers()
    } catch (err) {
      console.error('Failed to update role:', err)
      alert('역할 변경에 실패했습니다.')
    }
  }

  const handleStatusChange = async (userId: string, newStatus: string) => {
    try {
      await adminFetch(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      fetchUsers()
    } catch (err) {
      console.error('Failed to update status:', err)
      alert('상태 변경에 실패했습니다.')
    }
  }

  const openAdvisorModal = (user: AdminUser) => {
    setAdvisorModal(user)
    setSelectedProfessor('')
    // Filter professors from current user list
    setProfessorList(users.filter(u => u.role === 'professor'))
  }

  const handleAssignAdvisor = async () => {
    if (!advisorModal || !selectedProfessor) return
    try {
      await adminFetch(`/admin/users/${advisorModal.id}/advisor`, {
        method: 'POST',
        body: JSON.stringify({ professor_id: selectedProfessor }),
      })
      setAdvisorModal(null)
      fetchUsers()
    } catch (err) {
      console.error('Failed to assign advisor:', err)
      alert('지도교수 배정에 실패했습니다.')
    }
  }

  const handleRemoveAdvisor = async (userId: string, relationId: string) => {
    if (!confirm('지도관계를 삭제하시겠습니까?')) return
    try {
      await adminFetch(`/admin/users/${userId}/advisor/${relationId}`, { method: 'DELETE' })
      fetchUsers()
    } catch (err) {
      console.error('Failed to remove advisor:', err)
      alert('지도관계 삭제에 실패했습니다.')
    }
  }

  return (
    <div>
      <div style={searchBarStyle}>
        <input
          type="text"
          placeholder="이름 또는 이메일로 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={searchInputStyle}
        />
        <span style={{ color: '#94a3b8', fontSize: 13 }}>{users.length}명</span>
      </div>

      {loading ? (
        <div style={emptyStyle}>불러오는 중...</div>
      ) : users.length === 0 ? (
        <div style={emptyStyle}>사용자가 없습니다.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>이메일</th>
                <th style={thStyle}>역할</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>지도교수</th>
                <th style={thStyle}>가입일</th>
                <th style={thStyle}>작업</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{user.name}</td>
                  <td style={{ ...tdStyle, color: '#64748b', fontSize: 13 }}>{user.email}</td>
                  <td style={tdStyle}>
                    <select
                      style={selectStyle}
                      value={user.role}
                      onChange={e => handleRoleChange(user.id, e.target.value)}
                    >
                      <option value="admin">관리자</option>
                      <option value="professor">교수</option>
                      <option value="student">학생</option>
                      <option value="external">외부업체</option>
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select
                      style={selectStyle}
                      value={user.status}
                      onChange={e => handleStatusChange(user.id, e.target.value)}
                    >
                      <option value="active">활성</option>
                      <option value="inactive">비활성</option>
                      <option value="pending">대기</option>
                    </select>
                  </td>
                  <td style={tdStyle}>
                    {user.advisors.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {user.advisors.map(a => (
                          <span key={a.relation_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                            <span style={badgeStyle('#4f46e5', '#eef2ff')}>{a.professor_name}</span>
                            <button
                              style={{ ...btnDangerStyle, padding: '2px 6px', fontSize: 11 }}
                              onClick={() => handleRemoveAdvisor(user.id, a.relation_id)}
                              title="지도관계 삭제"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#cbd5e1', fontSize: 13 }}>-</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 13, color: '#94a3b8' }}>
                    {formatDate(user.created_at)}
                  </td>
                  <td style={tdStyle}>
                    {(user.role === 'student') && (
                      <button
                        style={btnSmallStyle}
                        onClick={() => openAdvisorModal(user)}
                      >
                        지도교수 배정
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Advisor Assignment Modal */}
      {advisorModal && (
        <div style={modalOverlayStyle} onClick={() => setAdvisorModal(null)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={modalTitleStyle}>지도교수 배정</div>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
              <strong>{advisorModal.name}</strong> 학생에게 지도교수를 배정합니다.
            </p>
            <div style={formGroupStyle}>
              <label style={labelStyle}>지도교수 선택</label>
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={selectedProfessor}
                onChange={e => setSelectedProfessor(e.target.value)}
              >
                <option value="">-- 교수를 선택하세요 --</option>
                {professorList.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
                ))}
              </select>
            </div>
            <div style={modalBtnRowStyle}>
              <button
                style={{ ...btnSmallStyle, padding: '8px 18px' }}
                onClick={() => setAdvisorModal(null)}
              >
                취소
              </button>
              <button
                style={{ ...btnPrimaryStyle, opacity: selectedProfessor ? 1 : 0.5 }}
                disabled={!selectedProfessor}
                onClick={handleAssignAdvisor}
              >
                배정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  프로젝트 관리 Tab
// ═══════════════════════════════════════════════════════════════

function ProjectsTab() {
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editProject, setEditProject] = useState<AdminProject | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formStatus, setFormStatus] = useState('active')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true)
      const params = search ? `?q=${encodeURIComponent(search)}&limit=200` : '?limit=200'
      const res = await adminFetch(`/admin/projects${params}`)
      setProjects(res.data || [])
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const resetForm = () => {
    setFormName('')
    setFormDesc('')
    setFormStatus('active')
    setFormStartDate('')
    setFormEndDate('')
  }

  const openCreate = () => {
    resetForm()
    setEditProject(null)
    setShowCreateModal(true)
  }

  const openEdit = (p: AdminProject) => {
    setFormName(p.name)
    setFormDesc(p.description || '')
    setFormStatus(p.status)
    setFormStartDate(p.start_date || '')
    setFormEndDate(p.end_date || '')
    setEditProject(p)
    setShowCreateModal(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) return
    try {
      const body: any = {
        name: formName.trim(),
        description: formDesc.trim() || null,
        status: formStatus,
        start_date: formStartDate || null,
        end_date: formEndDate || null,
      }
      if (editProject) {
        await adminFetch(`/admin/projects/${editProject.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
      } else {
        await adminFetch('/admin/projects', {
          method: 'POST',
          body: JSON.stringify(body),
        })
      }
      setShowCreateModal(false)
      resetForm()
      fetchProjects()
    } catch (err) {
      console.error('Failed to save project:', err)
      alert('프로젝트 저장에 실패했습니다.')
    }
  }

  const handleDelete = async (projectId: string, name: string) => {
    if (!confirm(`"${name}" 프로젝트를 삭제하시겠습니까?`)) return
    try {
      await adminFetch(`/admin/projects/${projectId}`, { method: 'DELETE' })
      fetchProjects()
    } catch (err) {
      console.error('Failed to delete project:', err)
      alert('프로젝트 삭제에 실패했습니다.')
    }
  }

  return (
    <div>
      <div style={searchBarStyle}>
        <input
          type="text"
          placeholder="프로젝트 이름으로 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={searchInputStyle}
        />
        <button style={btnPrimaryStyle} onClick={openCreate}>
          + 새 프로젝트
        </button>
      </div>

      {loading ? (
        <div style={emptyStyle}>불러오는 중...</div>
      ) : projects.length === 0 ? (
        <div style={emptyStyle}>프로젝트가 없습니다.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>프로젝트명</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>멤버</th>
                <th style={thStyle}>시작일</th>
                <th style={thStyle}>종료일</th>
                <th style={thStyle}>생성일</th>
                <th style={thStyle}>작업</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={{ ...tdStyle, fontWeight: 500 }}>
                    {p.name}
                    {p.description && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        {p.description.length > 60 ? p.description.slice(0, 60) + '...' : p.description}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(
                      p.status === 'active' ? '#16a34a' : p.status === 'paused' ? '#d97706' : '#64748b',
                      p.status === 'active' ? '#f0fdf4' : p.status === 'paused' ? '#fffbeb' : '#f1f5f9',
                    )}>
                      <span style={statusDot(p.status)} />
                      {projectStatusLabels[p.status] || p.status}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{p.member_count}</td>
                  <td style={{ ...tdStyle, fontSize: 13, color: '#94a3b8' }}>{formatDate(p.start_date)}</td>
                  <td style={{ ...tdStyle, fontSize: 13, color: '#94a3b8' }}>{formatDate(p.end_date)}</td>
                  <td style={{ ...tdStyle, fontSize: 13, color: '#94a3b8' }}>{formatDate(p.created_at)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={btnSmallStyle} onClick={() => openEdit(p)}>수정</button>
                      <button style={btnDangerStyle} onClick={() => handleDelete(p.id, p.name)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Project Modal */}
      {showCreateModal && (
        <div style={modalOverlayStyle} onClick={() => { setShowCreateModal(false); resetForm() }}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={modalTitleStyle}>{editProject ? '프로젝트 수정' : '새 프로젝트 생성'}</div>
            <div style={formGroupStyle}>
              <label style={labelStyle}>프로젝트명 *</label>
              <input style={inputStyle} value={formName} onChange={e => setFormName(e.target.value)} placeholder="프로젝트 이름" />
            </div>
            <div style={formGroupStyle}>
              <label style={labelStyle}>설명</label>
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder="프로젝트 설명 (선택)"
              />
            </div>
            <div style={formGroupStyle}>
              <label style={labelStyle}>상태</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={formStatus} onChange={e => setFormStatus(e.target.value)}>
                <option value="active">진행중</option>
                <option value="paused">일시중지</option>
                <option value="completed">완료</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ ...formGroupStyle, flex: 1 }}>
                <label style={labelStyle}>시작일</label>
                <input style={inputStyle} type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} />
              </div>
              <div style={{ ...formGroupStyle, flex: 1 }}>
                <label style={labelStyle}>종료일</label>
                <input style={inputStyle} type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)} />
              </div>
            </div>
            <div style={modalBtnRowStyle}>
              <button style={{ ...btnSmallStyle, padding: '8px 18px' }} onClick={() => { setShowCreateModal(false); resetForm() }}>
                취소
              </button>
              <button
                style={{ ...btnPrimaryStyle, opacity: formName.trim() ? 1 : 0.5 }}
                disabled={!formName.trim()}
                onClick={handleSave}
              >
                {editProject ? '저장' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  태그 관리 Tab
// ═══════════════════════════════════════════════════════════════

function TagsTab() {
  const [tags, setTags] = useState<AdminTag[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Inline create form
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#4f46e5')
  const [newScope, setNewScope] = useState('global')

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true)
      const params = search ? `?q=${encodeURIComponent(search)}` : ''
      const res = await adminFetch(`/admin/tags${params}`)
      setTags(res.data || [])
    } catch (err) {
      console.error('Failed to fetch tags:', err)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      await adminFetch('/admin/tags', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor || null,
          scope_type: newScope,
        }),
      })
      setNewName('')
      setNewColor('#4f46e5')
      setNewScope('global')
      fetchTags()
    } catch (err) {
      console.error('Failed to create tag:', err)
      alert('태그 생성에 실패했습니다.')
    }
  }

  const startEdit = (tag: AdminTag) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color || '#94a3b8')
  }

  const handleUpdate = async (tagId: string) => {
    if (!editName.trim()) return
    try {
      await adminFetch(`/admin/tags/${tagId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim(), color: editColor || null }),
      })
      setEditingId(null)
      fetchTags()
    } catch (err) {
      console.error('Failed to update tag:', err)
      alert('태그 수정에 실패했습니다.')
    }
  }

  const handleDelete = async (tagId: string, name: string) => {
    if (!confirm(`"${name}" 태그를 삭제하시겠습니까?`)) return
    try {
      await adminFetch(`/admin/tags/${tagId}`, { method: 'DELETE' })
      fetchTags()
    } catch (err) {
      console.error('Failed to delete tag:', err)
      alert('태그 삭제에 실패했습니다.')
    }
  }

  const predefinedColors = ['#4f46e5', '#059669', '#d97706', '#e11d48', '#0284c7', '#7c3aed', '#64748b', '#dc2626', '#0d9488', '#c026d3']

  return (
    <div>
      <div style={searchBarStyle}>
        <input
          type="text"
          placeholder="태그 이름으로 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={searchInputStyle}
        />
        <span style={{ color: '#94a3b8', fontSize: 13 }}>{tags.length}개</span>
      </div>

      {/* Inline create form */}
      <div style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-end',
        padding: '14px 16px',
        background: '#f8fafc',
        borderRadius: 10,
        marginBottom: 16,
        border: '1px solid #e2e8f0',
      }}>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, marginBottom: 4 }}>태그 이름</label>
          <input
            style={{ ...inputStyle, background: '#fff' }}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="새 태그 이름"
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
        </div>
        <div>
          <label style={{ ...labelStyle, marginBottom: 4 }}>색상</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {predefinedColors.map(c => (
              <button
                key={c}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: c,
                  border: newColor === c ? '2px solid #1e293b' : '2px solid transparent',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
        </div>
        <div>
          <label style={{ ...labelStyle, marginBottom: 4 }}>범위</label>
          <select
            style={{ ...selectStyle, padding: '7px 10px' }}
            value={newScope}
            onChange={e => setNewScope(e.target.value)}
          >
            <option value="global">전역</option>
            <option value="project">프로젝트</option>
          </select>
        </div>
        <button
          style={{ ...btnPrimaryStyle, whiteSpace: 'nowrap', opacity: newName.trim() ? 1 : 0.5 }}
          disabled={!newName.trim()}
          onClick={handleCreate}
        >
          추가
        </button>
      </div>

      {loading ? (
        <div style={emptyStyle}>불러오는 중...</div>
      ) : tags.length === 0 ? (
        <div style={emptyStyle}>태그가 없습니다.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>색상</th>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>범위</th>
                <th style={thStyle}>생성일</th>
                <th style={thStyle}>작업</th>
              </tr>
            </thead>
            <tbody>
              {tags.map(tag => (
                <tr key={tag.id}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={{ ...tdStyle, width: 50 }}>
                    {editingId === tag.id ? (
                      <div style={{ display: 'flex', gap: 3 }}>
                        {predefinedColors.slice(0, 5).map(c => (
                          <button
                            key={c}
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              background: c,
                              border: editColor === c ? '2px solid #1e293b' : '1px solid rgba(0,0,0,0.1)',
                              cursor: 'pointer',
                              outline: 'none',
                            }}
                            onClick={() => setEditColor(c)}
                          />
                        ))}
                      </div>
                    ) : (
                      <span style={tagColorDot(tag.color)} />
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>
                    {editingId === tag.id ? (
                      <input
                        style={{ ...inputStyle, width: 200, padding: '4px 8px', fontSize: 13 }}
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUpdate(tag.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        autoFocus
                      />
                    ) : (
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 12px',
                        borderRadius: 99,
                        fontSize: 13,
                        fontWeight: 500,
                        color: tag.color || '#64748b',
                        background: (tag.color || '#94a3b8') + '18',
                      }}>
                        {tag.name}
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 13, color: '#94a3b8' }}>
                    {scopeLabels[tag.scope_type] || tag.scope_type}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 13, color: '#94a3b8' }}>
                    {formatDate(tag.created_at)}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {editingId === tag.id ? (
                        <>
                          <button style={btnPrimaryStyle} onClick={() => handleUpdate(tag.id)}>
                            저장
                          </button>
                          <button style={btnSmallStyle} onClick={() => setEditingId(null)}>
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button style={btnSmallStyle} onClick={() => startEdit(tag)}>수정</button>
                          <button style={btnDangerStyle} onClick={() => handleDelete(tag.id, tag.name)}>삭제</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
