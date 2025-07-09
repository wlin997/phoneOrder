// src/client/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom'; // 'Outlet' is used when ProtectedRoute is a parent route in main.jsx
import { useAuth } from '../AuthContext'; // Path to AuthContext relative to this file

const ProtectedRoute = ({ allowedRoles }) => {
  const { currentUser, userRole, loading, isAuthenticated } = useAuth(); // Assuming isAuthenticated is derived in useAuth

  // If authentication state is still loading, don't render anything yet
  // You could also show a loading spinner here.
  if (loading) {
    return null; // Or a loading component
  }

  // If user is not authenticated, redirect to the login page
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If allowedRoles are specified, check if the user's role is included
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // If authenticated but not authorized for this role, redirect to dashboard or a forbidden page
    // Here, redirecting to the main dashboard (which is also protected,
    // so it might further redirect based on its allowedRoles if the dashboard itself is role-specific,
    // or simply navigate to a default landing for logged-in users).
    return (
      <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#fef2f2', // red-50
          color: '#b91c1c', // red-700
          padding: '20px',
          textAlign: 'center'
      }}>
          <h1 style={{ fontSize: '2em', marginBottom: '10px' }}>Access Denied</h1>
          <p style={{ fontSize: '1.2em' }}>You do not have the required permissions to view this page.</p>
          <p style={{ fontSize: '1em', marginTop: '10px' }}>Your role: <strong>{String(userRole || 'N/A')}</strong></p> {/* Safeguard String conversion */}
          <button
              onClick={() => window.location.href = '/'} // Redirects to the root (dashboard)
              style={{
                  marginTop: '20px',
                  padding: '10px 20px',
                  fontSize: '1em',
                  backgroundColor: '#ef4444', // red-500
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
              }}
          >
              Go to Dashboard
          </button>
      </div>
    );
  }

  // If authenticated and authorized, render the child routes (via Outlet)
  return <Outlet />;
};

export default ProtectedRoute;