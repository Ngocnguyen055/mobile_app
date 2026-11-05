import type { User } from "../../types/api.ts";
import type { AuthMode } from "../../types/index.ts";
import { api, json } from "./client.ts";

export const getCurrentUser = () => api<User>("/me");
export const authenticate = (
  mode: AuthMode,
  input: {
    name?: string;
    email: string;
    password: string
  },
) => api<{
  token: string;
  user: User
}>(`/auth/${mode}`, json("POST", input));
