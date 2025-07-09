// src/client/src/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Create the Auth Context
const AuthContext = createContext(null);

// Custom hook to use the Auth Context
export const useAuth = () => {
  return useContext(AuthContext);
};

// Auth Provider Component
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null); // Stores user object { id, email, role }
  const [userRole, setUserRole] = useState(null); // Stores the user's role string
  const [loading, setLoading] = useState(true); // To indicate if auth state is still loading

  // Memoized login function
  const login = useCallback(async (email, password) => {
    try {
      // NOTE: This URL will need to point to your backend's login endpoint.
      // We haven't implemented the login endpoint on the backend yet in server3.txt.
      // This will fail with 404 until we add the backend /api/login endpoint.
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
      localStorage.setItem('user', JSON.stringify(data.user)); // Store user data
      setCurrentUser(data.user);
      setUserRole(data.user.role);
      return data.user; // Return user data on success
    } catch (error) {
      console.error('Login error:', error);
      throw error; // Re-throw to be caught by the calling component (e.g., login form)
    }
  }, []);

  // Memoized logout function
  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    setCurrentUser(null);
    setUserRole(null);
  }, []);

  // Effect to check for existing token and user data on app load
  useEffect(() => {
    const checkAuthStatus = () => {
      const storedToken = localStorage.getItem('accessToken');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          // Minimal validation: check if required fields exist
          if (parsedUser && parsedUser.id && parsedUser.email && parsedUser.role) {
            setCurrentUser(parsedUser);
            setUserRole(parsedUser.role);
          } else {
            // Invalid stored user data, clear it
            console.warn("Invalid user data found in localStorage. Clearing...");
            logout();
          }
        } catch (e) {
          console.error("Error parsing stored user data:", e);
          logout(); // Clear invalid data
        }
      }
      setLoading(false); // Authentication check is complete
    };

    checkAuthStatus();
  }, [logout]);

  // Value provided by the context to its consumers
  const authContextValue = {
    currentUser,
    userRole,
    loading,
    login,
    logout,
    isAuthenticated: !!currentUser, // Convenience flag
    isAdmin: userRole === 'admin',
    isManager: userRole === 'manager',
    isEmployee: userRole === 'employee',
    isCustomer: userRole === 'customer',
  };

  if (loading) {
    // Optionally render a loading spinner or splash screen
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