import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { Navigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import axios from "axios";

/*────────────────────────────────────────────────────────────
  Axios instance (token header added dynamically)
────────────────────────────────────────────────────────────*/
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "",
  withCredentials: true,
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
  /* accessToken persists as "accessToken" */
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem("accessToken"));
  const [user, setUser] = useState(() => {
    if (!accessToken) return null;
    try {
      return jwtDecode(accessToken);
    } catch {
      return null;
    }
  });
  const [authReady, setAuthReady] = useState(false);
  const isRefreshing = useRef(false);

  /* Set Authorization header for Axios */
  useEffect(() => {
    if (accessToken) {
      API.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    } else {
      delete API.defaults.headers.common.Authorization;
    }
  }, [accessToken]);

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
  const login = async (email, password, recaptchaToken) => {
  try {
    const response = await API.post("/api/auth/login", { email, password, recaptchaToken });
    console.log("DEBUG: Login response data:", response.data); // Log the raw response
    localStorage.setItem("accessToken", response.data.accessToken);
    setAccessToken(response.data.accessToken);
    setUser(jwtDecode(response.data.accessToken));
    return { success: true };
  } catch (error) {
    console.log("DEBUG: Login error - Full error object:", error); // Log the entire error object
    console.log("DEBUG: Login error - Response data:", error.response?.data); // Log the response data specifically
    return error.response?.data || { success: false, message: "Login failed", requiresCaptcha: false };
  }
};

  /* logout */
  const logout = useCallback(async () => {
    try {
      await API.post("/api/auth/logout");
      console.log("Server-side logout initiated successfully.");
    } catch (error) {
      console.error("Error during server-side logout:", error.response?.data?.message || error.message);
    } finally {
      localStorage.removeItem("accessToken");
      setAccessToken(null);
      setUser(null);
      console.log("Client-side logout completed.");
    }
  }, []);

  /*──────────────────────────────────────────────────────────
    Axios Interceptor for Token Refresh
  ──────────────────────────────────────────────────────────*/
  useEffect(() => {
    const interceptor = API.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        console.log("DEBUG: Interceptor - Error status:", error.response?.status, "URL:", originalRequest.url, "Data:", error.response?.data);
        
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !isRefreshing.current &&
          !originalRequest.url.includes("/api/auth/login") &&
          !originalRequest.url.includes("/api/auth/refresh") &&
          !originalRequest.url.includes("/api/auth/logout")
        ) {
          originalRequest._retry = true;
          isRefreshing.current = true;

          try {
            console.log("Attempting to refresh token...");
            const refreshResponse = await API.post("/api/auth/refresh");
            const newAccessToken = refreshResponse.data.accessToken;

            localStorage.setItem("accessToken", newAccessToken);
            setAccessToken(newAccessToken);
            setUser(jwtDecode(newAccessToken));

            console.log("Token refreshed. Retrying original request.");
            originalRequest.headers["Authorization"] = `Bearer ${newAccessToken}`;
            return API(originalRequest);
          } catch (refreshError) {
            console.error("Error refreshing token or refresh token invalid:", refreshError);
            logout();
            return Promise.reject(refreshError);
          } finally {
            isRefreshing.current = false;
          }
        }

        if (error.response?.status === 401) {
          if (originalRequest.url.includes("/api/auth/refresh")) {
            console.log("Refresh token endpoint failed, performing full logout.");
            logout();
          } else if (originalRequest.url.includes("/api/auth/login")) {
            console.log("Login failed directly.");
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      API.interceptors.response.eject(interceptor);
    };
  }, [logout, setAccessToken, setUser]);

  /*──────────────────────────────────────────────────────────
    Validate / restore token on first load & on every change
  ──────────────────────────────────────────────────────────*/
  useEffect(() => {
    if (!accessToken) {
      setUser(null);
      setAuthReady(true);
      return;
    }

    try {
      const decoded = jwtDecode(accessToken);
      const ttl = decoded.exp * 1000 - Date.now();

      if (ttl <= 0) {
        console.log("Access token expired on load. Will attempt refresh on first protected API call.");
      }
      setUser(decoded);
    } catch (e) {
      console.error("Invalid access token on load (format error):", e);
      logout();
    } finally {
      setAuthReady(true);
    }
  }, [accessToken, logout]);

  /* context value */
  const value = {
    accessToken,
    user,
    isAuthenticated,
    userPermissions,
    hasPermission,
    login,
    logout,
    api: API,
    authReady,
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
  if (!authReady) return null;
  if (!isAuthenticated) return fallback;
  return hasPermission(perms) ? children : fallback;
};

export const RequireAuth = ({
  children,
  fallback = <Navigate to="/login" replace />,
}) => {
  const { isAuthenticated, authReady } = useAuth();
  if (!authReady) return null;
  return isAuthenticated ? children : fallback;
};