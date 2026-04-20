import { useState, useEffect, useRef, useCallback } from 'react'
import { useRole, isPrivileged } from '../contexts/RoleContext'
import { api } from '../api/client'
import FeedItem, { type FeedItemData } from './FeedItem'
import AnnouncementForm from './AnnouncementForm'

interface Props {
  collapsed: boolean
  onToggle: () => void
}

type TabType = 'all' | 'announcement' | 'activity'

const POLL_INTERVAL = 30_000

export default function FeedPanel({ collapsed, onToggle }: Props) {
  const { currentRole } = useRole()
  const [tab, setTab] = useState<TabType>('all')
  const [myFeed, setMyFeed] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [items, setItems] = useState<FeedItemData[]>([])
  const [pinnedItems, setPinnedItems] = useState<FeedItemData[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchFeed = useCallback(async (pageNum: number, append: boolean) => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(pageNum),
        limit: '20',
      }
      if (tab === 'announcement') params.type = 'announcement'
      if (tab === 'activity') params.type = 'comment,task,daily,attendance'
      if (myFeed) params.my = 'true'

      const res: any = await api.feed.list(params)
      const feedItems: FeedItemData[] = Array.isArray(res) ? res : (res?.data ?? res?.items ?? [])

      if (append) {
        setItems((prev) => [...prev, ...feedItems])
      } else {
        // Separate pinned from regular
        const pinned = feedItems.filter((i: FeedItemData) => i.pinned)
        const regular = feedItems.filter((i: FeedItemData) => !i.pinned)
        setPinnedItems(pinned)
        setItems(regular)
      }
      setHasMore(feedItems.length >= 20)
    } catch (err) {
      console.error('Feed fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [tab, myFeed])

  // Initial fetch + tab/filter change
  useEffect(() => {
    setPage(1)
    fetchFeed(1, false)
  }, [fetchFeed])

  // Polling
  useEffect(() => {
    if (collapsed) return

    const poll = () => {
      if (document.visibilityState === 'visible') {
        fetchFeed(1, false)
      }
    }

    pollRef.current = setInterval(poll, POLL_INTERVAL)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [collapsed, fetchFeed])

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || loading || !hasMore) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    if (nearBottom) {
      const nextPage = page + 1
      setPage(nextPage)
      fetchFeed(nextPage, true)
    }
  }, [loading, hasMore, page, fetchFeed])

  const handleCreated = () => {
    setShowForm(false)
    setPage(1)
    fetchFeed(1, false)
  }

  // Collapsed state
  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          writingMode: 'vertical-rl',
          padding: '12px 6px',
          fontSize: 13,
          fontWeight: 600,
          background: '#4f46e5',
          color: '#fff',
          border: 'none',
          borderRadius: '8px 0 0 8px',
          cursor: 'pointer',
          zIndex: 50,
          letterSpacing: 2,
        }}
      >
        {'\uD53C\uB4DC \u25B6'}
      </button>
    )
  }

  const tabButton = (t: TabType, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      style={{
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer',
        background: tab === t ? '#4f46e5' : 'transparent',
        color: tab === t ? '#fff' : '#64748b',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{
      width: 320,
      height: '100vh',
      borderLeft: '1px solid #e2e8f0',
      background: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 14px 10px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{'\uD53C\uB4DC'}</span>
          <span style={{ flex: 1 }} />
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: '#64748b',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={myFeed}
              onChange={(e) => setMyFeed(e.target.checked)}
              style={{ accentColor: '#4f46e5' }}
            />
            {'\uB0B4 \uD53C\uB4DC'}
          </label>
          <button
            onClick={onToggle}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 16,
              color: '#94a3b8',
              padding: '2px 4px',
            }}
          >
            {'\u25C0'}
          </button>
        </div>

        {/* New announcement button */}
        {isPrivileged(currentRole) && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              width: '100%',
              padding: '7px 0',
              fontSize: 12,
              fontWeight: 600,
              border: '1px dashed #c7d2fe',
              borderRadius: 6,
              background: '#eef2ff',
              color: '#4f46e5',
              cursor: 'pointer',
            }}
          >
            + {'\uC0C8 \uACF5\uC9C0 \uC791\uC131'}
          </button>
        )}

        {/* Announcement form */}
        {showForm && (
          <AnnouncementForm
            onCreated={handleCreated}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Filter tabs */}
        <div style={{
          display: 'inline-flex',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#f8fafc',
          alignSelf: 'flex-start',
        }}>
          {tabButton('all', '\uC804\uCCB4')}
          {tabButton('announcement', '\uACF5\uC9C0')}
          {tabButton('activity', '\uD65C\uB3D9')}
        </div>
      </div>

      {/* Feed content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Pinned announcements */}
        {pinnedItems.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', padding: '4px 4px 0' }}>
              {'\uD83D\uDCCC \uACE0\uC815\uB41C \uACF5\uC9C0'}
            </div>
            {pinnedItems.map((item) => (
              <FeedItem
                key={item.id}
                item={item}
                onRead={() => fetchFeed(1, false)}
              />
            ))}
            <div style={{ borderBottom: '1px solid #f1f5f9', margin: '4px 0' }} />
          </>
        )}

        {/* Regular feed items */}
        {items.map((item) => (
          <FeedItem
            key={item.id}
            item={item}
            onRead={() => fetchFeed(1, false)}
          />
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 12, color: '#94a3b8', fontSize: 12 }}>
            {'\uBD88\uB7EC\uC624\uB294 \uC911...'}
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && pinnedItems.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '40px 16px',
            color: '#94a3b8',
            fontSize: 13,
          }}>
            {'\uD53C\uB4DC\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4'}
          </div>
        )}

        {/* End of feed */}
        {!loading && !hasMore && items.length > 0 && (
          <div style={{ textAlign: 'center', padding: 8, color: '#cbd5e1', fontSize: 11 }}>
            {'\uBAA8\uB450 \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4'}
          </div>
        )}
      </div>
    </div>
  )
}
