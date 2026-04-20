import { useState } from 'react'
import { api } from '../api/client'

interface FeedItemData {
  id: string
  type: 'announcement' | 'comment' | 'task' | 'daily' | 'attendance'
  title: string
  body?: string
  author_name?: string
  created_at: string
  pinned?: boolean
  is_read?: boolean
  url?: string
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  announcement: { icon: '\uD83D\uDCE2', color: '#4338ca', bg: '#e0e7ff', label: '\uACF5\uC9C0' },
  comment:      { icon: '\uD83D\uDCAC', color: '#0369a1', bg: '#e0f2fe', label: '\uB313\uAE00' },
  task:         { icon: '\u2705',       color: '#047857', bg: '#d1fae5', label: '\uD0DC\uC2A4\uD06C' },
  daily:        { icon: '\uD83D\uDCDD', color: '#7c3aed', bg: '#ede9fe', label: '\uB370\uC77C\uB9AC' },
  attendance:   { icon: '\u23F0',       color: '#ea580c', bg: '#fff7ed', label: '\uCD9C\uACB0' },
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '\uBC29\uAE08 \uC804'
  if (minutes < 60) return `${minutes}\uBD84 \uC804`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}\uC2DC\uAC04 \uC804`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}\uC77C \uC804`
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

interface Props {
  item: FeedItemData
  onRead?: () => void
}

export default function FeedItem({ item, onRead }: Props) {
  const [read, setRead] = useState(item.is_read ?? true)
  const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.daily

  const handleClick = async () => {
    if (item.type === 'announcement' && !read) {
      try {
        await api.announcements.markRead(item.id)
        setRead(true)
        onRead?.()
      } catch {
        // ignore
      }
    }
  }

  return (
    <div
      onClick={handleClick}
      style={{
        padding: '12px 14px',
        background: !read ? '#fffbeb' : '#ffffff',
        border: '1px solid',
        borderColor: !read ? '#fde68a' : '#e2e8f0',
        borderRadius: 10,
        cursor: item.type === 'announcement' && !read ? 'pointer' : 'default',
        transition: 'all 0.15s',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {/* Type badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          background: cfg.bg,
          color: cfg.color,
        }}>
          {cfg.icon} {cfg.label}
        </span>

        {/* Pin badge */}
        {item.pinned && (
          <span style={{
            padding: '2px 6px',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 700,
            background: '#fef3c7',
            color: '#92400e',
          }}>
            PIN
          </span>
        )}

        {/* Unread dot */}
        {!read && (
          <span style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#ef4444',
            flexShrink: 0,
          }} />
        )}

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        {/* Time */}
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {timeAgo(item.created_at)}
        </span>
      </div>

      {/* Title */}
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: '#1e293b',
        marginBottom: item.body ? 4 : 0,
        lineHeight: 1.4,
      }}>
        {item.title}
      </div>

      {/* Body preview */}
      {item.body && (
        <div style={{
          fontSize: 12,
          color: '#64748b',
          lineHeight: 1.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {item.body}
        </div>
      )}

      {/* Author */}
      {item.author_name && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
          {item.author_name}
        </div>
      )}
    </div>
  )
}

export type { FeedItemData }
