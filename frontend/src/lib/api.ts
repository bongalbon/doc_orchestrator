export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8008/api";
export const WS_BASE = API_BASE.replace("http://", "ws://").replace("https://", "wss://").replace(/\/api$/, "");

export function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const access = window.localStorage.getItem("jwtAccess");
  if (access) return { Authorization: `Bearer ${access}` };
  const token = window.localStorage.getItem("authToken");
  return token ? { Authorization: `Token ${token}` } : {};
}

export async function refreshAccessToken(): Promise<boolean> {
  const refresh = window.localStorage.getItem("jwtRefresh");
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access: string };
    window.localStorage.setItem("jwtAccess", data.access);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
  });
  if (res.status === 401 && (await refreshAccessToken())) {
    // Retry once
    const retryRes = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      ...init,
      headers: { ...authHeaders(), ...(init?.headers || {}) },
    });
    if (!retryRes.ok) throw new Error(`${init?.method || "GET"} ${path} failed`);
    return retryRes.json();
  }
  if (!res.ok) throw new Error(`${init?.method || "GET"} ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
