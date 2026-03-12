import { useState } from 'react'
import { useRole } from '../contexts/RoleContext'

// ─── Shared styles ───
const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

// ─── Mock Data: Professor ───
const weekOptions = ['이번 주 (3/10 ~ 3/14)', '지난 주 (3/3 ~ 3/7)', '2주 전 (2/24 ~ 2/28)']

const studentSummaries = [
  { name: '한감성', done: 3, inProgress: 2, notStarted: 0, dailyCount: 5 },
  { name: '윤스마', done: 1, inProgress: 1, notStarted: 2, dailyCount: 3 },
  { name: '정인턴', done: 2, inProgress: 1, notStarted: 1, dailyCount: 4 },
  { name: '강데이', done: 4, inProgress: 0, notStarted: 0, dailyCount: 5 },
  { name: '송리서', done: 0, inProgress: 2, notStarted: 1, dailyCount: 2 },
]

const adviseeStudents = ['한감성', '윤스마', '정인턴', '강데이', '송리서']

const carryOverTasks = [
  { title: 'Diffusion 모델 v3 학습 실행', student: '한감성', status: '진행중', weeks: 2 },
  { title: '데이터셋 라벨링 (Phase 2)', student: '윤스마', status: '진행중', weeks: 1 },
  { title: 'XR 프로토타입 UI 설계', student: '송리서', status: '미시작', weeks: 1 },
]

// ─── Mock Data: Student ───
const myLastWeekSummary = { done: 3, inProgress: 2, notStarted: 0, dailyCount: 5 }

const myAssignedTasks = [
  {
    title: 'GAN 논문 리뷰 (StyleGAN3)',
    description: 'Section 3의 adaptive discriminator augmentation 중심으로 분석',
    url: 'https://arxiv.org/abs/2106.12423',
    guide: 'Section 3 중심으로 읽고, 기존 StyleGAN2 대비 변경점 정리',
    status: '진행중' as const,
    assignedBy: '김교수',
  },
  {
    title: '모델 A 벤치마크 실행',
    description: 'FID/IS 메트릭으로 CIFAR-10, FFHQ 데이터셋에서 벤치마크',
    url: '',
    guide: 'GPU 서버 3번에서 실행. batch_size=64, epochs=100',
    status: '새로 배정' as const,
    assignedBy: '김교수',
  },
  {
    title: '중간보고서 Section 2 작성',
    description: '관련 연구 서베이 부분 작성',
    url: '',
    guide: 'Overleaf 프로젝트에서 작업. 3/14까지 초안 완성',
    status: '이월' as const,
    assignedBy: '김교수',
  },
]

// ─── Mock Data: External ───
const externalWeeklySummary = [
  {
    project: 'KOCCA AI Animation Pipeline',
    code: 'KOCCA-2025-001',
    completedTasks: 5,
    inProgressTasks: 3,
    notStartedTasks: 1,
    keyUpdates: ['Phase 2 마일스톤 달성 (3/7)', 'Asset 전달 일정 확정'],
  },
  {
    project: 'Digital Heritage Archive',
    code: 'MOC-2025-017',
    completedTasks: 3,
    inProgressTasks: 2,
    notStartedTasks: 0,
    keyUpdates: ['포인트 클라우드 변환 완료', '최종 QA 준비중'],
  },
]

const taskStatusBadge: Record<string, { bg: string; color: string }> = {
  '완료': { bg: '#d1fae5', color: '#047857' },
  '진행중': { bg: '#e0e7ff', color: '#4338ca' },
  '미시작': { bg: '#f1f5f9', color: '#64748b' },
  '새로 배정': { bg: '#e0e7ff', color: '#4338ca' },
  '이월': { bg: '#fef3c7', color: '#b45309' },
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
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [assignStudent, setAssignStudent] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskUrl, setTaskUrl] = useState('')
  const [taskGuide, setTaskGuide] = useState('')
  const [meetingNotes, setMeetingNotes] = useState('')

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          주간 회의
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 6, lineHeight: 1.5 }}>
          학생별 주간 현황을 확인하고 이번 주 태스크를 배정하세요.
        </p>
      </div>

      {/* Week Selector */}
      <div style={{ marginBottom: 28 }} className="opacity-0 animate-fade-in stagger-1">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {weekOptions.map((w, i) => (
            <button
              key={i}
              onClick={() => setSelectedWeek(i)}
              style={{
                padding: '8px 18px', borderRadius: 10,
                fontSize: 13, fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: selectedWeek === i ? '#4f46e5' : '#fff',
                color: selectedWeek === i ? '#fff' : '#64748b',
                boxShadow: selectedWeek === i ? '0 2px 8px rgba(79,70,229,0.25)' : '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s',
              }}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Student Summary Table */}
      <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, overflow: 'hidden', marginBottom: 28 }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>지난주 학생별 요약</h3>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>자동 집계 결과</p>
        </div>

        {/* Table header */}
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

        {studentSummaries.map((s, idx) => (
          <div
            key={s.name}
            style={{
              display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr',
              gap: 12, padding: '16px 28px', alignItems: 'center',
              borderBottom: idx < studentSummaries.length - 1 ? '1px solid #f1f5f9' : 'none',
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
              <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 13, fontWeight: 600, background: '#d1fae5', color: '#047857' }}>
                {s.done}
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 13, fontWeight: 600, background: '#e0e7ff', color: '#4338ca' }}>
                {s.inProgress}
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 13, fontWeight: 600, background: s.notStarted > 0 ? '#ffe4e6' : '#f1f5f9', color: s.notStarted > 0 ? '#be123c' : '#64748b' }}>
                {s.notStarted}
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{s.dailyCount}/5일</span>
            </div>
          </div>
        ))}
      </div>

      {/* Carry-over Tasks */}
      <div className="opacity-0 animate-fade-in stagger-3" style={{ ...cardStyle, overflow: 'hidden', marginBottom: 28 }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>이월된 태스크</h3>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>미완료 태스크가 자동 이월되었습니다</p>
        </div>
        {carryOverTasks.map((task, idx) => (
          <div
            key={idx}
            style={{
              padding: '16px 28px',
              borderBottom: idx < carryOverTasks.length - 1 ? '1px solid #f1f5f9' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{task.title}</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                담당: {task.student} · {task.weeks}주차 연속
              </p>
            </div>
            <span style={{
              padding: '4px 12px', borderRadius: 99,
              fontSize: 12, fontWeight: 600,
              background: taskStatusBadge[task.status]?.bg || '#f1f5f9',
              color: taskStatusBadge[task.status]?.color || '#64748b',
            }}>
              {task.status}
            </span>
          </div>
        ))}
      </div>

      {/* Task Assignment Form */}
      <div className="opacity-0 animate-fade-in stagger-4" style={{ ...cardStyle, overflow: 'hidden', marginBottom: 28 }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>이번 주 태스크 배정</h3>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>학생에게 새 태스크를 배정합니다</p>
        </div>
        <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Student select */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>학생 선택</label>
            <select
              value={assignStudent}
              onChange={(e) => setAssignStudent(e.target.value)}
              style={{
                width: '100%', maxWidth: 320,
                padding: '10px 14px', borderRadius: 10,
                border: '1px solid #e2e8f0', background: '#fff',
                fontSize: 14, color: '#0f172a', outline: 'none',
              }}
            >
              <option value="">학생을 선택하세요</option>
              {adviseeStudents.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>태스크 제목</label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="예: StyleGAN3 논문 리뷰"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: '1px solid #e2e8f0', background: '#fff',
                fontSize: 14, color: '#0f172a', outline: 'none',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>설명</label>
            <textarea
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              placeholder="태스크에 대한 상세 설명..."
              rows={3}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: '1px solid #e2e8f0', background: '#fff',
                fontSize: 14, color: '#0f172a', outline: 'none',
                resize: 'vertical' as const, fontFamily: 'inherit',
              }}
            />
          </div>

          {/* URL + Guide side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="weekly-form-row">
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>참고 URL</label>
              <input
                type="url"
                value={taskUrl}
                onChange={(e) => setTaskUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid #e2e8f0', background: '#fff',
                  fontSize: 14, color: '#0f172a', outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>접근법 가이드</label>
              <input
                type="text"
                value={taskGuide}
                onChange={(e) => setTaskGuide(e.target.value)}
                placeholder="예: Section 3 중심으로 읽기"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid #e2e8f0', background: '#fff',
                  fontSize: 14, color: '#0f172a', outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Assign Button */}
          <div>
            <button
              style={{
                padding: '10px 28px', borderRadius: 10,
                fontSize: 14, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: '#4f46e5', color: '#fff',
                boxShadow: '0 2px 8px rgba(79,70,229,0.25)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#3730a3' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#4f46e5' }}
            >
              배정
            </button>
          </div>
        </div>
      </div>

      {/* Meeting Notes */}
      <div className="opacity-0 animate-fade-in stagger-5" style={{ ...cardStyle, overflow: 'hidden' }}>
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
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button
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

      <style>{`
        @media (max-width: 640px) {
          .weekly-form-row {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════
// Student Weekly View
// ═══════════════════════════════════════
function StudentWeekly() {
  const [weekPlan, setWeekPlan] = useState('')

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
        <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>이번 주 배정된 태스크</h3>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{myAssignedTasks.length}건 배정됨</p>
        </div>

        {myAssignedTasks.map((task, idx) => {
          const badge = taskStatusBadge[task.status] || taskStatusBadge['미시작']
          return (
            <div
              key={idx}
              style={{
                padding: '24px 28px',
                borderBottom: idx < myAssignedTasks.length - 1 ? '1px solid #f1f5f9' : 'none',
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
        })}
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
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button
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
    </div>
  )
}

// ═══════════════════════════════════════
// External Weekly View
// ═══════════════════════════════════════
function ExternalWeekly() {
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

      {/* Project summaries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {externalWeeklySummary.map((proj, pIdx) => (
          <div key={proj.code} className={`opacity-0 animate-fade-in stagger-${pIdx + 1}`} style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{
              padding: '20px 28px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ fontWeight: 600, fontSize: 17, color: '#0f172a' }}>{proj.project}</h3>
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' }}>{proj.code}</p>
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
          </div>
        ))}
      </div>
    </div>
  )
}
