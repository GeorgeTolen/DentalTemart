import axios from "axios";

// Marker used by the silent-refresh interceptor to retry a request only once.
declare module "axios" {
  export interface InternalAxiosRequestConfig {
    _retried?: boolean;
  }
}

// Single axios instance. withCredentials makes the browser send/receive the
// httpOnly auth cookies.
export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// Event fired when a request is rejected because the session is no longer valid.
// AuthContext listens for it and clears the user, dropping back to the login
// screen. We use an event (not a location redirect) because the login and the
// authenticated home both live at "/", so a path-based redirect wouldn't fire.
export const UNAUTHORIZED_EVENT = "temart:unauthorized";

// A request is an "auth call" (where a 401 is a normal answer and must NOT
// trigger a refresh/reset) when it targets an /auth/ endpoint or the public
// clinic picker. Note: matched precisely so /platform/clinics still refreshes.
function isAuthCall(url: string): boolean {
  const path = url.split("?")[0];
  return path.startsWith("/auth/") || path === "/clinics";
}

// A single in-flight refresh shared by all 401'd requests, so a burst of
// expired calls performs exactly one POST /auth/refresh.
let refreshing: Promise<unknown> | null = null;

// Silent session renewal: when the short-lived access token expires (401), we
// refresh it via the long-lived refresh cookie and retry the request — the
// user signs in once and the session stays active.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error?.response?.status;
    const cfg = error?.config;
    const url: string = cfg?.url ?? "";
    const authCall = isAuthCall(url);
    if (status === 401 && !authCall && cfg && !cfg._retried) {
      try {
        refreshing ??= api
          .post("/auth/refresh")
          .finally(() => (refreshing = null));
        await refreshing;
        cfg._retried = true;
        return api(cfg);
      } catch {
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      }
    } else if (status === 401 && !authCall) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  }
);

// Extract a human-readable message from an API error response.
export function errorMessage(error: unknown, fallback = "Что-то пошло не так"): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error ?? fallback;
  }
  return fallback;
}
