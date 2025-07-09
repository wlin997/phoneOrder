// src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
  const { currentUser, userRole, loading, isAuthenticated } = useAuth();

  if (loading) {
    // Render nothing or a loading spinner while auth state is being determined
    return null; // Or <LoadingSpinner />
  }

  if (!isAuthenticated) {
    // User is not authenticated, redirect to login page
    return <Navigate to="/login" replace />;
  }

  // User is authenticated, now check roles if required
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // User is authenticated but doesn't have the required role
    // You might want a different redirect here, e.g., to a /forbidden page
    return <Navigate to="/" replace />; // Redirect to home or a forbidden page
  }

  // User is authenticated and has the correct role (if roles were specified)
  return <Outlet />;
};

export default ProtectedRoute;