const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const getToken  = () => (typeof window !== 'undefined' ? localStorage.getItem('authToken') : null);
export const setToken  = (t) => localStorage.setItem('authToken', t);
export const clearToken = () => localStorage.removeItem('authToken');
export const getUser   = () => {
  try { return JSON.parse(localStorage.getItem('authUser') || 'null'); } catch { return null; }
};
export const setUser   = (u) => localStorage.setItem('authUser', JSON.stringify(u));
export const clearUser = () => localStorage.removeItem('authUser');

export async function apiFetch(path, options = {}) {
  const token = getToken();
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export async function downloadBlob(path, filename) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) throw new Error('no_logs');
  if (!res.ok) throw new Error('download_failed');
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
