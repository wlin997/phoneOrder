// src/client/src/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = useCallback(async (email, password) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const data = await response.json();
      console.log("[AuthContext Login] Raw data from backend:", data);
      console.log("[AuthContext Login] User data received:", data.user);
      console.log("[AuthContext Login] Role ID from backend:", data.user.role_id);

      const userToStore = {
          id: data.user.id,
          email: data.user.email,
          role_id: Number(data.user.role_id), // CRITICAL: Convert role_id to Number here
          role_name: getRoleNameFromId(Number(data.user.role_id)) // Pass Number to helper
      };
      console.log("[AuthContext Login] User object prepared for storage:", userToStore);
      localStorage.setItem('user', JSON.stringify(userToStore));
      localStorage.setItem('accessToken', data.accessToken); // Set access token after user data
      setCurrentUser(userToStore);
      setUserRole(userToStore.role_name);

      return userToStore;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    setCurrentUser(null);
    setUserRole(null);
  }, []);

  // Helper to map role_id to a display name (Temporary until full RBAC is implemented)
  const getRoleNameFromId = (id) => {
      // Ensure 'id' is explicitly a number for the switch statement
      const numericId = Number(id); // Use Number() to convert to a number type

      switch(numericId) { // Use the numericId here
          case 1: return 'admin';
          case 2: return 'manager';
          case 3: return 'employee';
          case 4: return 'customer';
          default: return 'unknown';
      }
  };

  useEffect(() => {
    const checkAuthStatus = () => {
      const storedToken = localStorage.getItem('accessToken');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          console.log("[AuthContext useEffect] Parsed user from localStorage:", parsedUser);
          console.log("[AuthContext useEffect] Role ID from localStorage (before conversion):", parsedUser.role_id); // LOG

          // CRITICAL FIX: Convert role_id to Number from localStorage
          parsedUser.role_id = Number(parsedUser.role_id); // <--- ADD THIS LINE (Explicit conversion)

          // Check if role_id exists and is a valid number AFTER conversion
          if (parsedUser && parsedUser.id && parsedUser.email && !isNaN(parsedUser.role_id)) { // <--- MODIFIED TYPE CHECK
            if (!parsedUser.role_name) {
                parsedUser.role_name = getRoleNameFromId(parsedUser.role_id);
            }
            console.log("[AuthContext useEffect] Role ID from localStorage (after conversion):", parsedUser.role_id); // LOG
            console.log("[AuthContext useEffect] Role Name derived:", parsedUser.role_name); // LOG
            setCurrentUser(parsedUser);
            setUserRole(parsedUser.role_name);
          } else {
            console.warn("[AuthContext useEffect] Invalid user data or role_id is not a valid number after conversion. Clearing..."); // LOG
            logout();
          }
        } catch (e) {
          console.error("Error parsing stored user data:", e);
          logout();
        }
      }
      setLoading(false);
    };

    checkAuthStatus();
  }, [logout]);

  const authContextValue = {
    currentUser,
    userRole,
    loading,
    login,
    logout,
    isAuthenticated: !!currentUser,
    isAdmin: userRole === 'admin',
    isManager: userRole === 'manager',
    isEmployee: userRole === 'employee',
    isCustomer: userRole === 'customer',
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '24px', color: '#333' }}>
        Loading authentication...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
}; 