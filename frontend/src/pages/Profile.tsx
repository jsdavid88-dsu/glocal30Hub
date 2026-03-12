import { useState } from 'react'

const userInfo = {
  name: '김연구',
  email: 'kim.research@university.ac.kr',
  role: '연구책임자 (PI)',
  department: '디지털콘텐츠학과',
  phone: '010-1234-5678',
  joinDate: '2020-03-01',
  researchAreas: ['AI/ML', 'Computer Vision', 'Digital Humanities', 'Animation'],
  bio: 'AI 기반 디지털 콘텐츠 생성 및 분석에 관한 연구를 수행하고 있습니다. 특히 애니메이션 자동 생성 파이프라인과 서사 분석 프레임워크에 관심을 가지고 있습니다.',
}

const advisorInfo = {
  name: '박지도',
  email: 'park.advisor@university.ac.kr',
  role: '지도교수',
  department: '디지털콘텐츠학과',
}

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
  const [name, setName] = useState(userInfo.name)
  const [bio, setBio] = useState(userInfo.bio)
  const [areas, setAreas] = useState(userInfo.researchAreas.join(', '))

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
                    {userInfo.name.charAt(0)}
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
                  <InfoField label="이메일" value={userInfo.email} editing={false} />
                  <InfoField label="역할" value={userInfo.role} editing={false} />
                  <InfoField label="소속" value={userInfo.department} editing={false} />
                  <InfoField label="연락처" value={userInfo.phone} editing={false} />
                  <InfoField label="합류일" value={userInfo.joinDate} editing={false} />
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
                      {userInfo.researchAreas.map((area) => (
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
                    <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.7 }}>{userInfo.bio}</p>
                  )}
                </div>

                {editing && (
                  <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
                    <button style={{
                      padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer',
                    }}>
                      저장
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
