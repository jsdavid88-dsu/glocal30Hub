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
    create: (blockId: string, content: string) =>
      request(`/daily-blocks/${blockId}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
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
  // Events (TODO: router not yet mounted in backend — calls will 404 until Phase 3)
  events: {
    list: (params?: Record<string, string>) => request(`/events/?${new URLSearchParams(params)}`),
    get: (id: string) => request(`/events/${id}`),
    create: (data: any) => request('/events/', { method: 'POST', body: JSON.stringify(data) }),
  },
};
