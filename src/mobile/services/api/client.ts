import * as SecureStore from "expo-secure-store";
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:4000";
let token = "";
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message);
  }
}
export async function restoreToken() {
  token = (await SecureStore.getItemAsync("api-token")) || "";
  return token;
}
export async function setToken(value: string) {
  token = value;
  if (value) await SecureStore.setItemAsync("api-token", value);
  else await SecureStore.deleteItemAsync("api-token");
}
export function getToken() {
  return token;
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const type = response.headers.get("content-type") || "";
  const result = type.includes("json")
    ? await response.json()
    : await response.text();
  if (!response.ok)
    throw new ApiError(
      typeof result?.error === "string"
        ? result.error
        : `HTTP ${response.status}: ${JSON.stringify(result)}`,
      response.status,
      path,
    );
  return result as T;
}
export const json = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});
