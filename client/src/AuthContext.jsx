/* ======================================================
   CLIENT  AuthContext.jsx  — cookie‑based session
====================================================== */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,          // ← add this
} from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";

export const AuthContext = createContext(null);
export const useAuth     = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const api = axios.create({ baseURL: "/api", withCredentials: true });

  const [user,      setUser]      = useState(null);
  const [authReady, setAuthReady] = useState(false);

  /* ── restore session ───────────────────────────── */
  useEffect(() => {
    (async () => {
      try   { const { data } = await api.get("/whoami"); setUser(data); }
      catch { setUser(null); }
      finally { setAuthReady(true); }
    })();
  }, []);

  /* ── login helpers ─────────────────────────────── */
  const login = async (email, password, code = null, tmp = null) => {
    if (tmp) {
      await api.post("/login/step2", { tmpToken: tmp, code });
    } else {
      const { data } = await api.post("/login", { email, password });
      if (data.need2FA) return data;    // show 6‑digit screen
    }
    const { data } = await api.get("/whoami");
    setUser(data);
    return { ok: true };
  };

  const logout = () => api.post("/logout").then(() => setUser(null));

  /* ── computed helpers ──────────────────────────── */
  const isAuthenticated = !!user;

  const hasPermission = useCallback(
    (permOrArr) => {
      const need = Array.isArray(permOrArr) ? permOrArr : [permOrArr];
      const have = user?.permissions || [];
      return need.every((p) => have.includes(p));
    },
    [user]
  );

  /* ── context value ─────────────────────────────── */
  const value = {
    api,
    user,
    authReady,
    login,
    logout,
    isAuthenticated,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/*─────────────────────────────────────────────────────────
  Guards
─────────────────────────────────────────────────────────*/
export const RequireAuth = ({
  children,
  fallback = <Navigate to="/login" replace />,
}) => {
  const { isAuthenticated, authReady } = useAuth();
  if (!authReady) return null;      // spinner / loader could go here
  return isAuthenticated ? children : fallback;
};

export const RequirePerms = ({
  perms,
  children,
  fallback = null,
}) => {
  const { isAuthenticated, hasPermission, authReady } = useAuth();
  if (!authReady) return null;
  if (!isAuthenticated) return fallback;
  return hasPermission(perms) ? children : fallback;
};
