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
      console.log("[AuthContext Login] Raw data from backend:", data); // LOG
      console.log("[AuthContext Login] User data received:", data.user); // LOG
      console.log("[AuthContext Login] Role ID from backend:", data.user.role_id); // LOG

      localStorage.setItem('accessToken', data.accessToken);

      const userToStore = {
          id: data.user.id,
          email: data.user.email,
          role_id: data.user.role_id, // This will be a number from backend, but getRoleNameFromId might expect string
          role_name: getRoleNameFromId(data.user.role_id) // This is where the 'unknown' likely comes from if type mismatch
      };
      console.log("[AuthContext Login] User object prepared for storage:", userToStore); // LOG
      localStorage.setItem('user', JSON.stringify(userToStore));
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

  // Helper to map role_id to a display name
  const getRoleNameFromId = (id) => {
      switch(id) { // This switch expects a number, but 'id' might be a string from JWT/localStorage
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
          console.log("[AuthContext useEffect] Parsed user from localStorage:", parsedUser); // LOG
          console.log("[AuthContext useEffect] Role ID from localStorage:", parsedUser.role_id); // LOG
          // This check 'typeof parsedUser.role_id === 'number'' will fail if it's a string "1"
          if (parsedUser && parsedUser.id && parsedUser.email && typeof parsedUser.role_id === 'number') {
            if (!parsedUser.role_name) {
                parsedUser.role_name = getRoleNameFromId(parsedUser.role_id);
            }
            console.log("[AuthContext useEffect] Role Name derived:", parsedUser.role_name); // LOG
            setCurrentUser(parsedUser);
            setUserRole(parsedUser.role_name);
          } else {
            console.warn("[AuthContext useEffect] Invalid user data or role_id type in localStorage. Clearing..."); // LOG
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