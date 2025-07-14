import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Navigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import axios from "axios";

/*────────────────────────────────────────────────────────────
  Axios instance (token header added dynamically)
────────────────────────────────────────────────────────────*/
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "",
});

/*────────────────────────────────────────────────────────────
  Context boilerplate
────────────────────────────────────────────────────────────*/
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

/*────────────────────────────────────────────────────────────
  Provider
────────────────────────────────────────────────────────────*/
export function AuthProvider({ children }) {
  /* token persists as "accessToken" */
  const [token, setToken] = useState(() => localStorage.getItem("accessToken"));
  const [user, setUser]   = useState(() => {
    if (!token) return null;
    try {
      return jwtDecode(token);
    } catch { return null; }
  });
  const [authReady, setAuthReady] = useState(false); // ← NEW

  /* attach header immediately if we already have a token */
  if (token && !API.defaults.headers.common.Authorization) {
    API.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  const isAuthenticated = !!user;
  const userPermissions = user?.permissions || [];

  /* helper */
  const hasPermission = useCallback(
    (permOrArr) => {
      const needed = Array.isArray(permOrArr) ? permOrArr : [permOrArr];
      return needed.every((p) => userPermissions.includes(p));
    },
    [userPermissions]
  );

  /* login */
  const login = async (email, password) => {
    const { data } = await API.post("/api/login", { email, password });
    localStorage.setItem("accessToken", data.token);
    API.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    setToken(data.token);
    setUser(jwtDecode(data.token));
  };

  /* logout */
  const logout = () => {
    localStorage.removeItem("accessToken");
    delete API.defaults.headers.common.Authorization;
    setToken(null);
    setUser(null);
  };

  /*──────────────────────────────────────────────────────────
    Validate / restore token on first load & on every change
  ──────────────────────────────────────────────────────────*/
  useEffect(() => {
    if (!token) {
      setUser(null);
      setAuthReady(true);
      return;
    }

    try {
      const decoded = jwtDecode(token); // { id, exp, permissions, ... }
      const ttl = decoded.exp * 1000 - Date.now();

      if (ttl <= 0) {
        logout();          // token expired
        setAuthReady(true);
        return;
      }

      setUser(decoded);    // restore user info
      API.defaults.headers.common.Authorization = `Bearer ${token}`;

      /* schedule auto‑logout right before expiry */
      const id = setTimeout(logout, ttl);
      return () => clearTimeout(id);
    } catch {
      logout();            // invalid token
    } finally {
      setAuthReady(true);  // signal that we’re done checking
    }
  }, [token]);

  /* context value */
  const value = {
    token,
    user,
    isAuthenticated,
    userPermissions,
    hasPermission,
    login,
    logout,
    api: API,
    authReady,            // ← expose to consumers
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/*────────────────────────────────────────────────────────────
  Guards
────────────────────────────────────────────────────────────*/
export const RequirePerms = ({
  perms,
  children,
  fallback = null,
}) => {
  const { isAuthenticated, hasPermission, authReady } = useAuth();
  if (!authReady) return null;          // or a spinner
  if (!isAuthenticated) return fallback;
  return hasPermission(perms) ? children : fallback;
};

export const RequireAuth = ({
  children,
  fallback = <Navigate to="/login" replace />,
}) => {
  const { isAuthenticated, authReady } = useAuth();
  if (!authReady) return null;          // or a spinner
  return isAuthenticated ? children : fallback;
};
