// src/client/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
  const { currentUser, userRole, loading, isAuthenticated } = useAuth(); // userRole now holds the role_name

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // --- CRITICAL CHANGE HERE ---
  // The 'allowedRoles' prop (e.g., ['admin', 'manager']) now needs to be checked against userRole (e.g., 'admin')
  if (allowedRoles && !allowedRoles.includes(userRole)) {
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
          <p style={{ fontSize: '1em', marginTop: '10px' }}>Your role: <strong>{String(userRole || 'N/A')}</strong></p>
          <button
              onClick={() => window.location.href = '/app'} // Redirect to dashboard
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

  return <Outlet />;
};

export default ProtectedRoute;