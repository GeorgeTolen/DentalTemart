import axios from "axios";

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

// Endpoints that are expected to 401 while logged out (bootstrap / auth), so a
// 401 from them must NOT trigger a session reset.
const authEndpoints = ["/me", "/auth/login", "/auth/platform/login", "/clinics"];

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? "";
    const isAuthCall = authEndpoints.some((e) => url.includes(e));
    if (status === 401 && !isAuthCall) {
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
