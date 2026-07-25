import { notification } from 'antd';

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = localStorage.getItem('token');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path.startsWith('/api') ? path : `/api${path}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      try {
        const text = await res.text();
        if (text) message = text;
      } catch {}
    }
    notification.error({ message: '接口错误', description: message, placement: 'topRight' });
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res;
}

export const api = {
  login: payload => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),

  listApps: () => request('/apps'),
  createApp: payload => request('/apps', { method: 'POST', body: JSON.stringify(payload) }),

  listChildrenAgents: () => request('/agents/children'),
  createChildAgent: payload => request('/agents', { method: 'POST', body: JSON.stringify(payload) }),
  updateChildAgent: (id, payload) => request(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  getHierarchy: () => request('/agents/hierarchy'),

  generateCardKeys: payload => request('/card-keys/generate', { method: 'POST', body: JSON.stringify(payload) }),
  listCardKeys: params => {
    const qs = new URLSearchParams(params || {}).toString();
    return request(`/card-keys${qs ? `?${qs}` : ''}`);
  },
  revokeCardKeysBatch: payload => request('/card-keys/revoke-batch', { method: 'POST', body: JSON.stringify(payload) }),
  exportCardKeys: params => {
    const qs = new URLSearchParams(params || {}).toString();
    return request(`/card-keys/export${qs ? `?${qs}` : ''}`);
  }
};
