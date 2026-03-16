const API_BASE = '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

export const api = {
  // Auth
  auth: {
    me: () => request('/auth/me'),
    devLogin: (email: string) =>
      request<{ access_token: string; user: any }>('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
  },
  // Users
  users: {
    list: (params?: Record<string, string>) => request(`/users/?${new URLSearchParams(params)}`),
    get: (id: string) => request(`/users/${id}`),
    update: (id: string, data: any) =>
      request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  // Projects
  projects: {
    list: (params?: Record<string, string>) => request(`/projects/?${new URLSearchParams(params)}`),
    get: (id: string) => request(`/projects/${id}`),
    create: (data: any) => request('/projects/', { method: 'POST', body: JSON.stringify(data) }),
    members: (id: string) => request(`/projects/${id}/members`),
  },
  // Tasks
  tasks: {
    listByProject: (projectId: string, params?: Record<string, string>) =>
      request(`/projects/${projectId}/tasks?${new URLSearchParams(params)}`),
    my: (params?: Record<string, string>) => request(`/tasks/my?${new URLSearchParams(params)}`),
    get: (id: string) => request(`/tasks/${id}`),
    create: (projectId: string, data: any) =>
      request(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) =>
      request(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    assign: (id: string, userId: string, isPrimary?: boolean) =>
      request(`/tasks/${id}/assignees`, { method: 'POST', body: JSON.stringify({ user_id: userId, is_primary: isPrimary }) }),
    unassign: (id: string, userId: string) =>
      request(`/tasks/${id}/assignees/${userId}`, { method: 'DELETE' }),
    carryover: (taskIds: string[], newDueDate: string) =>
      request('/tasks/carryover', { method: 'POST', body: JSON.stringify({ task_ids: taskIds, new_due_date: newDueDate }) }),
    summaryByStudent: (weekStart: string) => request(`/tasks/summary-by-student?week_start=${weekStart}`),
  },
  // Task Groups
  groups: {
    list: (projectId: string) => request(`/projects/${projectId}/groups`),
    create: (projectId: string, data: any) =>
      request(`/projects/${projectId}/groups`, { method: 'POST', body: JSON.stringify(data) }),
    update: (groupId: string, data: any) =>
      request(`/groups/${groupId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (groupId: string) =>
      request(`/groups/${groupId}`, { method: 'DELETE' }),
    reorder: (projectId: string, groupIds: string[]) =>
      request(`/projects/${projectId}/groups/reorder`, { method: 'POST', body: JSON.stringify({ group_ids: groupIds }) }),
    merge: (groupId: string, targetGroupId: string) =>
      request(`/groups/${groupId}/merge/${targetGroupId}`, { method: 'POST' }),
  },
  // Daily
  daily: {
    list: (params?: Record<string, string>) => request(`/daily-logs/?${new URLSearchParams(params)}`),
    get: (id: string) => request(`/daily-logs/${id}`),
    create: (data: any) => request('/daily-logs/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request(`/daily-logs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    createBlocks: (logId: string, blocks: any[]) =>
      request(`/daily-logs/${logId}/blocks`, { method: 'POST', body: JSON.stringify(blocks) }),
  },
  // Tags
  tags: {
    list: (params?: Record<string, string>) => request(`/tags/?${new URLSearchParams(params)}`),
    create: (data: any) => request('/tags/', { method: 'POST', body: JSON.stringify(data) }),
  },
  // Comments
  comments: {
    list: (blockId: string) => request(`/daily-blocks/${blockId}/comments`),
    create: (blockId: string, data: { content: string; parent_id?: string; image_url?: string }) =>
      request(`/daily-blocks/${blockId}/comments`, { method: 'POST', body: JSON.stringify(data) }),
  },
  // Uploads
  uploads: {
    upload: (file: File, blockId?: string) => {
      const formData = new FormData();
      formData.append('file', file);
      if (blockId) formData.append('block_id', blockId);
      const token = localStorage.getItem('token');
      return fetch(`${API_BASE}/uploads/`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }).then(r => {
        if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
        return r.json();
      });
    },
    getUrl: (fileId: string) => `${API_BASE}/uploads/${fileId}`,
  },
  // Weekly
  weekly: {
    getNotes: (weekStart: string) => request(`/weekly-notes/?week_start=${weekStart}`),
    saveNotes: (weekStart: string, content: string) =>
      request('/weekly-notes/', { method: 'POST', body: JSON.stringify({ week_start: weekStart, content }) }),
    getSummary: (weekStart: string) => request(`/weekly-notes/summary?week_start=${weekStart}`),
  },
  // Events
  events: {
    list: (params?: Record<string, string>) => request(`/events/?${new URLSearchParams(params)}`),
    get: (id: string) => request(`/events/${id}`),
    create: (data: any) => request('/events/', { method: 'POST', body: JSON.stringify(data) }),
  },
  // Attendance
  attendance: {
    today: () => request('/attendance/today'),
    checkIn: (type = 'daily') =>
      request('/attendance/check-in', { method: 'POST', body: JSON.stringify({ type }) }),
    checkOut: () =>
      request('/attendance/check-out', { method: 'POST' }),
    history: (params?: Record<string, string>) =>
      request(`/attendance/history?${new URLSearchParams(params)}`),
    stats: (params?: Record<string, string>) =>
      request(`/attendance/stats?${new URLSearchParams(params)}`),
    students: (params?: Record<string, string>) =>
      request(`/attendance/students?${new URLSearchParams(params)}`),
  },
  // Notifications
  notifications: {
    list: (params?: Record<string, string>) =>
      request(`/notifications/?${new URLSearchParams(params)}`),
    unreadCount: () => request('/notifications/unread-count'),
    markRead: (id: string) =>
      request(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () =>
      request('/notifications/read-all', { method: 'POST' }),
    delete: (id: string) =>
      request(`/notifications/${id}`, { method: 'DELETE' }),
  },
  // Admin
  admin: {
    users: () => request('/admin/users'),
    updateUserRole: (userId: string, role: string) =>
      request(`/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    updateUserStatus: (userId: string, status: string) =>
      request(`/admin/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    assignAdvisor: (userId: string, advisorId: string) =>
      request(`/admin/users/${userId}/advisor`, { method: 'POST', body: JSON.stringify({ advisor_id: advisorId }) }),
    removeAdvisor: (userId: string, advisorId: string) =>
      request(`/admin/users/${userId}/advisor/${advisorId}`, { method: 'DELETE' }),
    projects: () => request('/admin/projects'),
    createProject: (data: any) =>
      request('/admin/projects', { method: 'POST', body: JSON.stringify(data) }),
    updateProject: (id: string, data: any) =>
      request(`/admin/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteProject: (id: string) =>
      request(`/admin/projects/${id}`, { method: 'DELETE' }),
    tags: () => request('/admin/tags'),
    createTag: (data: any) =>
      request('/admin/tags', { method: 'POST', body: JSON.stringify(data) }),
    updateTag: (id: string, data: any) =>
      request(`/admin/tags/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteTag: (id: string) =>
      request(`/admin/tags/${id}`, { method: 'DELETE' }),
  },
};
