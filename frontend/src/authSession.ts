export type AuthUser = {
  id: string;
  username: string | null;
  display_name: string;
  role: "STUDENT" | "TEACHER" | "ADMIN" | string;
};

const TOKEN_KEY = "codetrack.accessToken";

export function getAccessToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

