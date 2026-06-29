import axios from "axios";

// Single axios instance. withCredentials makes the browser send/receive the
// httpOnly auth cookies.
export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// On 401, drop the user back to the login screen (except while logging in).
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? "";
    if (status === 401 && !url.includes("/auth/login")) {
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
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
