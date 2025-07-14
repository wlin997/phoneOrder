/* ======================================================
   CLIENT  AuthContext.jsx  — cookie‑based session
====================================================== */
import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";

export const AuthContext = createContext(null);
export const useAuth     = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const api = axios.create({ baseURL: "/api", withCredentials: true });

  const [user,      setUser]      = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/whoami");
        setUser(data);
      } catch { setUser(null); }
      finally { setAuthReady(true); }
    })();
  }, []);

  const login = async (email, password, code = null, tmp = null) => {
    if (tmp) {
      await api.post("/login/step2", { tmpToken: tmp, code });
    } else {
      const { data } = await api.post("/login", { email, password });
      if (data.need2FA) return data;          // caller will show 6‑digit screen
    }
    const { data } = await api.get("/whoami");
    setUser(data);
    return { ok: true };
  };

  const logout = () => api.post("/logout").then(() => setUser(null));

  return (
    <AuthContext.Provider value={{ api, user, authReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/*─────────────────────────────────────────────────────────
  GUARD HELPERS  (exported for <RequireAuth> / <RequirePerms>)
─────────────────────────────────────────────────────────*/
export const RequireAuth = ({
  children,
  fallback = <Navigate to="/login" replace />,
}) => {
  const { user, authReady } = useAuth();
  if (!authReady) return null;              // or spinner
  return user ? children : fallback;
};

export const RequirePerms = ({
  perms,
  children,
  fallback = null,
}) => {
  const { user, authReady } = useAuth();
  if (!authReady) return null;
  const have = user?.permissions || [];
  const need = Array.isArray(perms) ? perms : [perms];
  const ok   = need.every((p) => have.includes(p));
  return ok ? children : fallback;
};
