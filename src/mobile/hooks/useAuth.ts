import { useEffect, useState } from "react";
import { authenticate, getCurrentUser } from "../services/api.ts";

import { restoreToken, setToken } from "../services/api.ts";
import { clearAttachmentCache } from "../services/attachmentCache.ts";
import type { User } from "../types/api.ts";
import type { AuthMode } from "../types/index.ts";

type AuthCredentials = {
  mode: AuthMode;
  name?: string;
  email: string;
  password: string;
};

type UseAuthOptions = {
  onAuthenticated: () => void;
};

export function useAuth({ onAuthenticated }: UseAuthOptions) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  useEffect(() => {
    void (async () => {
      try {
        if (await restoreToken()) {
          const me = await getCurrentUser();
          setUser(me);
          onAuthenticated();
        }
      } catch {
        await setToken("");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const auth = async ({
    mode,
    name,
    email,
    password,
  }: AuthCredentials) => {
    const register = mode === "register";
    const data = await authenticate(mode, register ? { name, email, password } : { email, password });
    await setToken(data.token);
    onAuthenticated();
    setUser({ ...data.user, _id: data.user.id || data.user._id });
  };

  const clearAuth = async () => {
    if (user?._id)
      await clearAttachmentCache(user._id).catch(() => undefined);
    await setToken("");
    setUser(null);
    setAuthMode("login");
  };

  return {
    user,
    loading,
    authMode,
    setAuthMode,
    auth,
    clearAuth,
  };
}
