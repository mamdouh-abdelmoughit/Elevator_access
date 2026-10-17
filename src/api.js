// Thin fetch wrapper: adds the token, turns errors into readable messages,
// and sends the user back to Login when the session has expired.
import * as SecureStore from 'expo-secure-store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL;

let onUnauthorized = null;
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = await SecureStore.getItemAsync('authToken');
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Impossible de joindre le serveur. Vérifiez votre connexion internet.', 0);
  }

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError('Votre session a expiré. Veuillez vous reconnecter.', 401, data);
  }
  if (!res.ok) throw new ApiError(data?.error || `Erreur serveur (${res.status}).`, res.status, data);
  return data;
}

export async function getSession() {
  const [token, userJson] = await Promise.all([
    SecureStore.getItemAsync('authToken'),
    SecureStore.getItemAsync('currentUser'),
  ]);
  let user = null;
  try { user = userJson ? JSON.parse(userJson) : null; } catch { /* corrupted */ }
  return { token, user };
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync('authToken'),
    SecureStore.deleteItemAsync('currentUser'),
  ]);
}
