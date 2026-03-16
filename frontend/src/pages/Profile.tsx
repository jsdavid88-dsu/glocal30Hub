import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

interface UserInfo {
  id: string
  name: string
  email: string
  role: string
  department?: string
  major_field?: string
  bio?: string
  phone?: string
  avatar_url?: string
  interest_fields?: string[]
  advisor_id?: string
  created_at?: string
}

interface ProjectInfo {
  id: string
  name: string
  status: string
  start_date?: string
  end_date?: string
  members?: Array<{ user_id: string; role: string }>
}

export default function Profile() {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [department, setDepartment] = useState('')
  const [phone, setPhone] = useState('')
  const [joinDate, setJoinDate] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Interest fields as tags
  const [interests, setInterests] = useState<string[]>([])
  const [newInterest, setNewInterest] = useState('')

  // Advisor / Advisee info
  const [advisorInfo, setAdvisorInfo] = useState<UserInfo | null>(null)
  const [advisees, setAdvisees] = useState<UserInfo[]>([])

  // Projects from API
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.auth.me().then(async (user: any) => {
      setUserId(user.id || null)
      setName(user.name || '')
      setBio(user.bio || '')
      setEmail(user.email || '')
      setRole(user.role || '')
      setDepartment(user.department || user.major_field || '')
      setPhone(user.phone || '')
      setAvatarUrl(user.avatar_url || null)
      setJoinDate(user.created_at ? user.created_at.slice(0, 10) : '')
      const interestFields = user.interest_fields || []
      setInterests(Array.isArray(interestFields) ? interestFields : interestFields.split(',').map((s: string) => s.trim()).filter(Boolean))

      // Fetch advisor info for students
      if (user.role === 'student' && user.advisor_id) {
        try {
          const advisor: any = await api.users.get(user.advisor_id)
          setAdvisorInfo(advisor)
        } catch {
          // advisor not found
        }
      }

      // Fetch advisees for professors via advisors API
      if (user.role === 'professor') {
        try {
          const token = localStorage.getItem('token')
          const res = await fetch(`/api/v1/users/${user.id}/advisees`, {
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          })
          if (res.ok) {
            const data = await res.json()
            const adviseeList = Array.isArray(data) ? data : (data.items || data.data || [])
            setAdvisees(adviseeList)
          }
        } catch {
          // advisees endpoint not available
        }
      }

      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    // Fetch projects
    setProjectsLoading(true)
    api.projects.list().then((data: any) => {
      const list = Array.isArray(data) ? data : (data.items || data.data || [])
      setProjects(list)
    }).catch(() => {
      // ignore
    }).finally(() => setProjectsLoading(false))
  }, [])

  async function handleSave() {
    if (!userId) return
    setSaving(true)
    try {
      await api.users.update(userId, {
        name,
        bio,
        interest_fields: interests,
        avatar_url: avatarUrl,
      })
      setEditing(false)
    } catch {
      alert('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result: any = await api.uploads.upload(file)
      const url = result.url || result.file_url || api.uploads.getUrl(result.id || result.file_id)
      setAvatarUrl(url)
      // Auto-save avatar
      if (userId) {
        await api.users.update(userId, { avatar_url: url })
      }
    } catch {
      // upload failed
    } finally {
      setUploading(false)
    }
  }

  function addInterest() {
    const tag = newInterest.trim()
    if (tag && !interests.includes(tag)) {
      setInterests([...interests, tag])
      setNewInterest('')
    }
  }

  function removeInterest(tag: string) {
    setInterests(interests.filter(i => i !== tag))
  }

  function handleInterestKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addInterest()
    }
  }

  const roleLabel = (r: string) => {
    const map: Record<string, string> = { professor: '교수', student: '학생', external: '외부업체' }
    return map[r] || r
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 0', textAlign: 'center' }}>
        <div style={{ color: '#94a3b8', fontSize: 15 }}>프로필 로딩 중...</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          프로필
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
          개인 정보 및 연구 활동을 관리합니다.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
        {/* Profile Card */}
        <div className="opacity-0 animate-fade-in stagger-1" style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '28px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>기본 정보</h3>
            <button
              onClick={() => setEditing(!editing)}
              style={{
                fontSize: 13, fontWeight: 500, color: editing ? '#dc2626' : '#4f46e5',
                background: editing ? '#fee2e2' : '#eef2ff', border: 'none',
                cursor: 'pointer', padding: '6px 16px', borderRadius: 8,
              }}
            >
              {editing ? '취소' : '편집'}
            </button>
          </div>

          <div style={{ padding: 28 }}>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' as const }}>
              {/* Avatar */}
              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 100, height: 100, borderRadius: '50%',
                    background: avatarUrl ? 'none' : 'linear-gradient(135deg, #4f46e5, #3730a3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', position: 'relative' as const,
                    cursor: editing ? 'pointer' : 'default',
                  }}
                  onClick={() => editing && fileInputRef.current?.click()}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="avatar"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ color: '#fff', fontSize: 36, fontWeight: 700 }}>
                      {name.charAt(0) || '?'}
                    </span>
                  )}
                  {editing && (
                    <div style={{
                      position: 'absolute' as const, bottom: 0, left: 0, right: 0,
                      height: 30, background: 'rgba(0,0,0,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleAvatarUpload}
                />
                {editing && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      fontSize: 12, color: '#4f46e5', background: 'none', border: '1px solid #e0e7ff',
                      borderRadius: 8, padding: '4px 12px', cursor: uploading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {uploading ? '업로드 중...' : '사진 변경'}
                  </button>
                )}
              </div>

              {/* Info Fields */}
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
                  <InfoField label="이름" value={name} editing={editing} onChange={setName} />
                  <InfoField label="이메일" value={email} editing={false} />
                  <InfoField label="역할" value={roleLabel(role)} editing={false} />
                  <InfoField label="소속" value={department} editing={false} />
                  <InfoField label="연락처" value={phone} editing={false} />
                  <InfoField label="합류일" value={joinDate} editing={false} />
                </div>

                {/* Interest Fields - Tag style */}
                <div style={{ marginTop: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>
                    관심 분야
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                    {interests.map((tag) => (
                      <span key={tag} style={{
                        padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                        background: '#e0e7ff', color: '#4338ca',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                        {tag}
                        {editing && (
                          <button
                            onClick={() => removeInterest(tag)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: '#6366f1', fontSize: 14, padding: 0, lineHeight: 1,
                              display: 'flex', alignItems: 'center',
                            }}
                            title="삭제"
                          >
                            &times;
                          </button>
                        )}
                      </span>
                    ))}
                    {editing && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <input
                          value={newInterest}
                          onChange={(e) => setNewInterest(e.target.value)}
                          onKeyDown={handleInterestKeyDown}
                          placeholder="분야 입력 후 Enter"
                          style={{
                            padding: '4px 10px', borderRadius: 8,
                            border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a',
                            outline: 'none', width: 140,
                          }}
                        />
                        <button
                          onClick={addInterest}
                          style={{
                            padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                            background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer',
                          }}
                        >
                          추가
                        </button>
                      </div>
                    )}
                    {!editing && interests.length === 0 && (
                      <span style={{ fontSize: 13, color: '#94a3b8' }}>등록된 관심 분야가 없습니다.</span>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>
                    소개
                  </label>
                  {editing ? (
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 8,
                        border: '1px solid #e2e8f0', fontSize: 14, color: '#0f172a',
                        outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
                      {bio || <span style={{ color: '#94a3b8' }}>소개가 없습니다.</span>}
                    </p>
                  )}
                </div>

                {editing && (
                  <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      style={{
                        padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: saving ? '#c7d2fe' : '#4f46e5', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {saving ? '저장 중...' : '저장'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Advisor Card (for students) */}
        {role === 'student' && (
          <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>지도교수 정보</h3>
            </div>
            <div style={{ padding: 28 }}>
              {advisorInfo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    overflow: 'hidden',
                  }}>
                    {advisorInfo.avatar_url ? (
                      <img src={advisorInfo.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>
                        {advisorInfo.name?.charAt(0) || '?'}
                      </span>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{advisorInfo.name}</p>
                    <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                      {roleLabel(advisorInfo.role)}{advisorInfo.department || advisorInfo.major_field ? ` · ${advisorInfo.department || advisorInfo.major_field}` : ''}
                    </p>
                    <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{advisorInfo.email}</p>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 14, color: '#94a3b8' }}>지도교수 정보가 등록되지 않았습니다.</p>
              )}
            </div>
          </div>
        )}

        {/* Advisees Card (for professors) */}
        {role === 'professor' && (
          <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>지도학생 목록</h3>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>{advisees.length}명</span>
            </div>
            <div>
              {advisees.length === 0 ? (
                <div style={{ padding: 28 }}>
                  <p style={{ fontSize: 14, color: '#94a3b8' }}>등록된 지도학생이 없습니다.</p>
                </div>
              ) : (
                advisees.map((s, idx) => (
                  <div key={s.id} style={{
                    padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 16,
                    borderBottom: idx < advisees.length - 1 ? '1px solid #f8fafc' : 'none',
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      overflow: 'hidden',
                    }}>
                      {s.avatar_url ? (
                        <img src={s.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>
                          {s.name?.charAt(0) || '?'}
                        </span>
                      )}
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{s.name}</p>
                      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>
                        {s.department || s.major_field || ''}{s.email ? ` · ${s.email}` : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Project History */}
        <div className="opacity-0 animate-fade-in stagger-3" style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>참여 과제 이력</h3>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>{projects.length}개</span>
          </div>
          <div>
            {projectsLoading ? (
              <div style={{ padding: 28, textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: '#94a3b8' }}>과제 목록 로딩 중...</p>
              </div>
            ) : projects.length === 0 ? (
              <div style={{ padding: 28 }}>
                <p style={{ fontSize: 14, color: '#94a3b8' }}>참여 중인 과제가 없습니다.</p>
              </div>
            ) : (
              projects.map((p, idx) => {
                const memberEntry = p.members?.find((m: any) => m.user_id === userId)
                const memberRole = memberEntry?.role || '멤버'
                const period = [
                  p.start_date ? p.start_date.slice(0, 10).replace(/-/g, '.') : '',
                  p.end_date ? p.end_date.slice(0, 10).replace(/-/g, '.') : '',
                ].filter(Boolean).join(' ~ ')
                const statusLabel = p.status === 'active' ? '진행중' : p.status === 'completed' ? '완료' : p.status === 'archived' ? '종료' : p.status || '진행중'
                const isActive = statusLabel === '진행중'
                return (
                  <div key={p.id} style={{
                    padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: idx < projects.length - 1 ? '1px solid #f8fafc' : 'none',
                  }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{p.name}</p>
                      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        {memberRole}{period ? ` · ${period}` : ''}
                      </p>
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                      background: isActive ? '#e0e7ff' : '#d1fae5',
                      color: isActive ? '#4338ca' : '#047857',
                    }}>
                      {statusLabel}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoField({ label, value, editing, onChange }: {
  label: string; value: string; editing: boolean; onChange?: (v: string) => void
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
        {label}
      </label>
      {editing && onChange ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid #e2e8f0', fontSize: 14, color: '#0f172a', outline: 'none',
          }}
        />
      ) : (
        <p style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{value || '-'}</p>
      )}
    </div>
  )
}
