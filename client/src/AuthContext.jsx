import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import axios from "axios";

/*────────────────────────────────────────────────────────────
  Axios instance configured for credentials (cookies)
────────────────────────────────────────────────────────────*/
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "",
  withCredentials: true, // IMPORTANT: This sends cookies with requests
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
  // `token` state is no longer managed from localStorage for accessToken
  // Instead, we manage `user` and `isAuthenticated` based on successful API calls.
  const [user, setUser] = useState(null); // Stores non-sensitive user data like username, permissions
  const [authReady, setAuthReady] = useState(false); // Indicates if initial authentication check is complete

  const navigate = useNavigate(); // Hook for navigation

  // isAuthenticated is now derived directly from `user` state
  const isAuthenticated = !!user;
  const userPermissions = user?.permissions || [];

  /* helper for permission checks */
  const hasPermission = useCallback(
    (permOrArr) => {
      const needed = Array.isArray(permOrArr) ? permOrArr : [permOrArr];
      return needed.every((p) => userPermissions.includes(p));
    },
    [userPermissions]
  );

  /* Function to fetch user details (e.g., permissions) after login/refresh */
  // This assumes your /api/auth/whoami endpoint returns user details based on the `accessToken` cookie.
  const fetchUserDetails = useCallback(async () => {
    try {
      // Corrected API path to include '/auth' prefix as per server.cjs mounting
      const response = await API.get("/api/auth/whoami");
      setUser(response.data); // Set non-sensitive user data (id, permissions)
      return true;
    } catch (error) {
      console.error("Failed to fetch user details or access token invalid:", error);
      setUser(null); // Clear user if fetching fails
      return false;
    } finally {
      setAuthReady(true); // Always set authReady to true after initial check
    }
  }, [API]); // Added API to dependencies since it's used inside useCallback

  /* Login function */
  const login = async (email, password) => {
    try {
      // Login endpoint is also under '/api/auth'
      const { data } = await API.post("/api/auth/login", { email, password });

      // If 2FA is needed, server returns { need2FA: true, tmp: tmpToken }
      if (data.need2FA) {
        // Store tmpToken locally for the next step, as it's not an httpOnly cookie
        localStorage.setItem("tmpToken", data.tmp);
        // Do not call fetchUserDetails yet, as main auth isn't complete
        return { need2FA: true };
      }

      // If login is successful (no 2FA or 2FA already done), server set cookies
      await fetchUserDetails(); // Fetch user data from /api/auth/whoami as client can't decode httpOnly token
      return { success: true };
    } catch (error) {
      console.error("Login failed:", error);
      setUser(null);
      // Clean up tmpToken if login fails
      localStorage.removeItem("tmpToken");
      throw error; // Re-throw to allow component to handle login failure
    }
  };

  /* Login Step 2 (for TOTP) */
  const loginStep2 = async (code) => {
    const tmpToken = localStorage.getItem("tmpToken");
    if (!tmpToken) {
      throw new Error("No temporary token found for 2FA.");
    }
    try {
      // 2FA login endpoint is also under '/api/auth'
      await API.post("/api/auth/login/step2", { tmpToken, code });
      localStorage.removeItem("tmpToken"); // Clean up temporary token
      await fetchUserDetails(); // Fetch user data after successful 2FA login
      return { success: true };
    } catch (error) {
      console.error("2FA verification failed:", error);
      localStorage.removeItem("tmpToken"); // Clear tmpToken on 2FA failure
      setUser(null);
      throw error;
    }
  };

  /* Logout function */
  const logout = async () => {
    try {
      // Logout endpoint is also under '/api/auth'
      await API.post("/api/auth/logout"); // Server clears httpOnly cookies
    } catch (error) {
      console.error("Logout API call failed:", error);
      // Continue with client-side cleanup even if API call fails
    } finally {
      localStorage.removeItem("tmpToken"); // Ensure tmpToken is cleared on logout
      setUser(null); // Clear user state
      navigate("/login"); // Redirect to login page
    }
  };

  /*──────────────────────────────────────────────────────────
    Initial Authentication Check on Component Mount
  ──────────────────────────────────────────────────────────*/
  useEffect(() => {
    // On initial load, try to fetch user details.
    // If successful, it means the accessToken cookie is valid.
    // If not, fetchUserDetails will set user to null and authReady to true.
    fetchUserDetails();
  }, [fetchUserDetails]);

  /*──────────────────────────────────────────────────────────
    Axios Interceptor for Automatic Token Refresh
  ──────────────────────────────────────────────────────────*/
  useEffect(() => {
    const interceptor = API.interceptors.response.use(
      response => response, // Pass through successful responses
      async error => {
        const originalRequest = error.config;

        // If the error is 401 (Unauthorized), and it's not the refresh token endpoint itself,
        // and we haven't already tried to refresh for this request
        if (error.response?.status === 401 && originalRequest.url !== '/api/auth/refresh-token' && !originalRequest._retry) {
            originalRequest._retry = true; // Mark as retried to prevent infinite loops

            try {
                // Corrected API path for refresh token to include '/auth' prefix
                await API.post('/api/auth/refresh-token');
                console.log('Access token refreshed successfully!');

                // After successful refresh, re-fetch user details to update context (optional but good practice)
                await fetchUserDetails();

                // Retry the original failed request with the new access token (cookies sent automatically)
                return API(originalRequest);
            } catch (refreshError) {
                console.error('Error refreshing token or refresh token invalid:', refreshError);
                // If refresh fails (e.g., refresh token expired or invalid),
                // clear user state and redirect to login
                logout(); // This will navigate to /login
                return Promise.reject(refreshError); // Reject the original request promise
            }
        }
        // For other errors or if already retried, just reject
        return Promise.reject(error);
      }
    );

    return () => {
      // Clean up the interceptor when component unmounts
      API.interceptors.response.eject(interceptor);
    };
  }, [API, fetchUserDetails, logout]); // Dependencies for useEffect

  /* context value */
  const value = {
    user,
    isAuthenticated,
    userPermissions,
    hasPermission,
    login,
    loginStep2, // Expose 2FA step 2
    logout,
    api: API, // Provide the configured axios instance for other components
    authReady, // Expose to consumers
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/*────────────────────────────────────────────────────────────
  Guards (remain largely the same)
────────────────────────────────────────────────────────────*/
export const RequirePerms = ({
  perms,
  children,
  fallback = null,
}) => {
  const { isAuthenticated, hasPermission, authReady } = useAuth();
  if (!authReady) return null; // Or a spinner/loading indicator
  if (!isAuthenticated) return fallback;
  return hasPermission(perms) ? children : fallback;
};

export const RequireAuth = ({
  children,
  fallback = <Navigate to="/login" replace />,
}) => {
  const { isAuthenticated, authReady } = useAuth();
  if (!authReady) return null; // Or a spinner/loading indicator
  return isAuthenticated ? children : fallback;
};