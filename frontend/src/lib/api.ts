// API Configuration - ensure trailing slash consistency
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8008/api").replace(/\/$/, "");
export const WS_BASE = API_BASE.replace("http://", "ws://").replace("https://", "wss://").replace(/\/api$/, "");

// Log configuration in development
if (typeof window !== "undefined" && (process.env.NODE_ENV === "development" || window.location.hostname === "localhost")) {
  console.log("[API] Base URL:", API_BASE);
  console.log("[API] WS Base URL:", WS_BASE);
}

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

export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public path?: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  retries = 2
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const method = init?.method || "GET";

  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: { ...authHeaders(), ...(init?.headers || {}) },
    });

    if (res.status === 401 && (await refreshAccessToken())) {
      // Retry once after token refresh
      const retryRes = await fetch(url, {
        cache: "no-store",
        ...init,
        headers: { ...authHeaders(), ...(init?.headers || {}) },
      });
      if (!retryRes.ok) throw new APIError(`${method} ${path} failed after token refresh`, retryRes.status, path);
      if (retryRes.status === 204) return {} as T;
      return retryRes.json();
    }

    if (!res.ok) throw new APIError(`${method} ${path} failed: ${res.status}`, res.status, path);
    if (res.status === 204) return {} as T;
    return res.json();
  } catch (err) {
    // Handle network/TypeError specifically
    if (err instanceof TypeError && err.message.includes("fetch")) {
      // Retry logic for network errors
      if (retries > 0) {
        console.log(`[API] Retrying ${method} ${path} (${retries} attempts left)...`);
        await new Promise((r) => setTimeout(r, 1000));
        return apiFetch<T>(path, init, retries - 1);
      }

      throw new APIError(
        `Network error: Unable to connect to API at ${API_BASE}. Please check:\n` +
        `1. Backend server is running on port 8008\n` +
        `2. No security software (antivirus/firewall) is blocking the connection\n` +
        `3. Browser extensions are not interfering with requests`,
        undefined,
        path
      );
    }

    // Re-throw APIError instances
    if (err instanceof APIError) throw err;

    // Wrap other errors
    throw new APIError(
      err instanceof Error ? err.message : `${method} ${path} failed`,
      undefined,
      path
    );
  }
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
