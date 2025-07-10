import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { jwtDecode } from "jwt-decode";
import axios from "axios";

/**
 * Shape of the JWT payload we expect from the backend
 * {
 *   id: number,
 *   email: string,
 *   role_name: string,         // e.g. "admin"
 *   permissions: string[]      // ["manage_kds", "view_reports", ...]
 * }
 */

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    if (!token) return null;
    try {
      return jwtDecode(token);
    } catch (e) {
      console.error("Invalid stored token", e);
      localStorage.removeItem("token");
      return null;
    }
  });

  /* ─────────────────────────── Helpers ─────────────────────────── */
  const isAuthenticated = !!user;
  const userPermissions = user?.permissions || [];

  const hasPermission = useCallback(
    (perm) => {
      if (!perm) return false;
      if (!Array.isArray(perm)) return userPermissions.includes(perm);
      // array case: return true if ALL perms present
      return perm.every((p) => userPermissions.includes(p));
    },
    [userPermissions]
  );

  /* ─────────────────────────── Login ─────────────────────────── */
  const login = async (email, password) => {
    const { data } = await axios.post("/api/login", { email, password });
    const incomingToken = data.token;
    const decoded = jwtDecode(incomingToken);
    setToken(incomingToken);
    setUser(decoded);
    localStorage.setItem("token", incomingToken);
    // Set axios default header so subsequent requests include the token
    axios.defaults.headers.common["Authorization"] = `Bearer ${incomingToken}`;
  };

  /* ─────────────────────────── Logout ─────────────────────────── */
  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    delete axios.defaults.headers.common["Authorization"];
  };

  /* ─────────────────────────── Token Bootstrap ─────────────────────────── */
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

      // Auto-logout if token expired (simple client check)
      const { exp } = jwtDecode(token);
      const timeout = exp * 1000 - Date.now();
      if (timeout > 0) {
        const id = setTimeout(logout, timeout);
        return () => clearTimeout(id);
      } else {
        logout();
      }
    }
  }, [token]);

  const value = {
    isAuthenticated,
    user,
    userPermissions,
    hasPermission,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

/* ─────────────────────────── Higher‑order guard ─────────────────────────── */
export const RequirePerms = ({ perms, children, fallback = null }) => {
  const { isAuthenticated, hasPermission } = useAuth();
  if (!isAuthenticated) return fallback;
  if (hasPermission(perms)) return children;
  return fallback;
};
