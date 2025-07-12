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
  /* token persisted as "accessToken" */
  const [token, setToken] = useState(() => localStorage.getItem("accessToken"));
  const [user, setUser] = useState(() => {
    if (!token) return null;
    try {
      return jwtDecode(token);
    } catch {
      return null;
    }
  });

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
    setToken(data.token);
    setUser(jwtDecode(data.token));
  };

  /* logout */
  const logout = () => {
    localStorage.removeItem("accessToken");
    setToken(null);
    setUser(null);
  };

  /*──────────────────────────────────────────────────────────
    Auto‑restore + expiry check on every token change
  ──────────────────────────────────────────────────────────*/
  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    try {
      const decoded = jwtDecode(token); // { id, exp, permissions, ... }
      const ttl = decoded.exp * 1000 - Date.now();

      if (ttl <= 0) {
        logout(); // token already expired
        return;
      }

      // restore user & attach header
      setUser(decoded);
      API.defaults.headers.common.Authorization = `Bearer ${token}`;

      // schedule auto‑logout
      const id = setTimeout(logout, ttl);
      return () => clearTimeout(id);
    } catch {
      logout(); // invalid token
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
  const { isAuthenticated, hasPermission } = useAuth();
  if (!isAuthenticated) return fallback;
  return hasPermission(perms) ? children : fallback;
};

export const RequireAuth = ({
  children,
  fallback = <Navigate to="/login" replace />,
}) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : fallback;
};
