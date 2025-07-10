// src/client/src/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // This will store the role name (e.g., 'admin')
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
      localStorage.setItem('accessToken', data.accessToken);

      // --- CRITICAL CHANGE HERE ---
      // The backend is now sending role_id. We need to store role_id and the role_name if available.
      const userToStore = {
          id: data.user.id,
          email: data.user.email,
          role_id: data.user.role_id,
          // TEMP HACK: For now, we manually map common role_ids to names on the frontend.
          // This will be replaced by dynamic permissions in the future.
          role_name: getRoleNameFromId(data.user.role_id) // Get role name based on ID
      };
      localStorage.setItem('user', JSON.stringify(userToStore));
      setCurrentUser(userToStore);
      setUserRole(userToStore.role_name); // Set userRole to the name
      // --- END CRITICAL CHANGE ---

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
      switch(id) {
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
          if (parsedUser && parsedUser.id && parsedUser.email && parsedUser.role_id) { // Check for role_id
            // If user object from localStorage doesn't have role_name, derive it
            if (!parsedUser.role_name) {
                parsedUser.role_name = getRoleNameFromId(parsedUser.role_id);
            }
            setCurrentUser(parsedUser);
            setUserRole(parsedUser.role_name); // Set userRole to the name
          } else {
            console.warn("Invalid user data found in localStorage. Clearing...");
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
    userRole, // This is now the role name string
    loading,
    login,
    logout,
    isAuthenticated: !!currentUser,
    // These now check against the role name string
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