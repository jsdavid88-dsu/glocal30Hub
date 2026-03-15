import { useState, useEffect } from 'react'
import { api } from '../api/client'

const projectHistory = [
  { name: 'KOCCA AI Animation Pipeline', role: 'PI', period: '2025.01 ~ 2026.06', status: '진행중' },
  { name: 'NRF GCA Narratology', role: '공동연구원', period: '2025.03 ~ 2027.02', status: '진행중' },
  { name: 'Smart Campus IoT Network', role: 'PI', period: '2024.01 ~ 2025.12', status: '완료' },
]

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

export default function Profile() {
  const [editing, setEditing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [name, setName] = useState('김연구')
  const [bio, setBio] = useState('')
  const [areas, setAreas] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [department, setDepartment] = useState('')
  const [phone, setPhone] = useState('')
  const [joinDate, setJoinDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.auth.me().then((user: any) => {
      setUserId(user.id || null)
      setName(user.name || '')
      setBio(user.bio || '')
      setEmail(user.email || '')
      setRole(user.role || '')
      setDepartment(user.department || user.major_field || '')
      setPhone(user.phone || '')
      setJoinDate(user.created_at ? user.created_at.slice(0, 10) : '')
      const interestFields = user.interest_fields || []
      setAreas(Array.isArray(interestFields) ? interestFields.join(', ') : interestFields)
    }).catch(() => {
      // Fallback to placeholder values on error
    })
  }, [])

  async function handleSave() {
    if (!userId) return
    setSaving(true)
    try {
      await api.users.update(userId, {
        name,
        bio,
        interest_fields: areas.split(',').map((a: string) => a.trim()).filter(Boolean),
      })
      setEditing(false)
    } catch {
      // ignore error silently
    } finally {
      setSaving(false)
    }
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
                <div style={{
                  width: 100, height: 100, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ color: '#fff', fontSize: 36, fontWeight: 700 }}>
                    {name.charAt(0) || '?'}
                  </span>
                </div>
                {editing && (
                  <button style={{
                    fontSize: 12, color: '#4f46e5', background: 'none', border: '1px solid #e0e7ff',
                    borderRadius: 8, padding: '4px 12px', cursor: 'pointer',
                  }}>
                    사진 변경
                  </button>
                )}
              </div>

              {/* Info Fields */}
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
                  <InfoField label="이름" value={name} editing={editing} onChange={setName} />
                  <InfoField label="이메일" value={email} editing={false} />
                  <InfoField label="역할" value={role} editing={false} />
                  <InfoField label="소속" value={department} editing={false} />
                  <InfoField label="연락처" value={phone} editing={false} />
                  <InfoField label="합류일" value={joinDate} editing={false} />
                </div>

                <div style={{ marginTop: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>
                    연구 분야
                  </label>
                  {editing ? (
                    <input
                      value={areas}
                      onChange={(e) => setAreas(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 8,
                        border: '1px solid #e2e8f0', fontSize: 14, color: '#0f172a',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                      {areas.split(',').map((area) => area.trim()).filter(Boolean).map((area) => (
                        <span key={area} style={{
                          padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                          background: '#e0e7ff', color: '#4338ca',
                        }}>
                          {area}
                        </span>
                      ))}
                    </div>
                  )}
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
                    <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.7 }}>{bio}</p>
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

        {/* Advisor Card */}
        <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>지도교수 정보</h3>
          </div>
          <div style={{ padding: 28, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg, #059669, #047857)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>{advisorInfo.name.charAt(0)}</span>
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{advisorInfo.name}</p>
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{advisorInfo.role} · {advisorInfo.department}</p>
              <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{advisorInfo.email}</p>
            </div>
          </div>
        </div>

        {/* Project History */}
        <div className="opacity-0 animate-fade-in stagger-3" style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>참여 과제 이력</h3>
          </div>
          <div>
            {projectHistory.map((p, idx) => (
              <div key={p.name} style={{
                padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: idx < projectHistory.length - 1 ? '1px solid #f8fafc' : 'none',
              }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{p.name}</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{p.role} · {p.period}</p>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                  background: p.status === '진행중' ? '#e0e7ff' : '#d1fae5',
                  color: p.status === '진행중' ? '#4338ca' : '#047857',
                }}>
                  {p.status}
                </span>
              </div>
            ))}
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
        <p style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{value}</p>
      )}
    </div>
  )
}
