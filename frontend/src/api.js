const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'minipay.token';

export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Every call goes through fetch (AJAX). Errors always become an ApiError with a readable message.
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    const detail = e.details?.map((d) => d.message).join(' ');
    throw new ApiError(res.status, e.code || 'ERROR', detail || e.message || 'Request failed.', e.details);
  }
  return data;
}

export const newIdempotencyKey = () => crypto.randomUUID();
