import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { jwtDecode } from "jwt-decode";
import axios from "axios";
import { Navigate } from "react-router-dom";

/*********************************************************
 * AuthContext – central login/logout & permission logic *
 *********************************************************/

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "",
});

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  /* ── token persisted in localStorage ─────────────────── */
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser]   = useState(() => {
    if (!token) return null;
    try { return jwtDecode(token); } catch { return null; }
  });

  const isAuthenticated = !!user;
  const userPermissions = user?.permissions || [];

  /* ── helper: check permission(s) ─────────────────────── */
  const hasPermission = useCallback((permOrArr) => {
    const needed = Array.isArray(permOrArr) ? permOrArr : [permOrArr];
    return needed.every((p) => userPermissions.includes(p));
  }, [userPermissions]);

  /* ── login ───────────────────────────────────────────── */
  const login = async (email, password) => {
    const { data } = await API.post("/api/login", { email, password });
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(jwtDecode(data.token));
  };

  /* ── logout ──────────────────────────────────────────── */
  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  /* ── attach token to axios + auto‑logout on expiry ───── */
  useEffect(() => {
    if (!token) return;

    API.defaults.headers.common.Authorization = `Bearer ${token}`;

    const { exp } = jwtDecode(token);
    const ttl = exp * 1000 - Date.now();
    if (ttl > 0) {
      const id = setTimeout(logout, ttl);
      return () => clearTimeout(id);
    } else {
      logout();
    }
  }, [token]);

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

/**********************************************
 * <RequirePerms> – wrapper to guard UI nodes *
 **********************************************/
export const RequirePerms = ({ perms, children, fallback = null }) => {
  const { isAuthenticated, hasPermission } = useAuth();
  if (!isAuthenticated) return fallback;
  return hasPermission(perms) ? children : fallback;
};

export const RequireAuth = ({ children, fallback = <Navigate to="/login" replace /> }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : fallback;
};

