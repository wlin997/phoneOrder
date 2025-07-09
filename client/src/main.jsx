import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Admin from './Admin.jsx';
import App from './App.jsx'; // Your existing KDS App
import Report from './Report.jsx';
import KDS from './KdsComponent.jsx';
import DailySpecialsManager from './dailySpecials.jsx';
import './index.css';
import { AuthProvider } from './AuthContext'; // Only AuthProvider is exported from AuthContext
import Login from './components/Login.jsx'; // Login component is imported from its own file
import ProtectedRoute from './components/ProtectedRoute'; // ProtectedRoute is also from its own file

// A wrapper component to protect routes
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, userRole, loading, authReady } = useAuth();

  if (loading || !authReady) {
    // Still loading auth state, show a simple loading indicator
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-lg text-gray-700">Loading application...</p>
      </div>
    );
  }

  if (!currentUser) {
    // Not authenticated, redirect to login
    return <Navigate to="/login" replace />;
  }

  // Authenticated, now check roles
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // Authenticated but not authorized for this role
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-100 text-red-800 p-4">
        <h1 className="text-3xl font-bold mb-4">Access Denied</h1>
        <p className="text-lg text-center">You do not have the required permissions to view this page.</p>
        <p className="text-md mt-2">Your role: <span className="font-semibold capitalize">{userRole}</span></p>
        <button
          onClick={() => useAuth().signOut()} // Directly call signOut from useAuth hook
          className="mt-6 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300"
        >
          Sign Out
        </button>
      </div>
    );
  }

  // Authenticated and authorized
  return children;
};

// Main Root component that handles authentication and routing
const RootApp = () => {
  const { currentUser, loading, signOut, userRole } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-lg text-gray-700">Initializing application...</p>
      </div>
    );
  }

  // Display user info and sign out button when logged in
  const userIdDisplay = currentUser?.uid || 'N/A';
  return (
    <div className="font-inter">
      {currentUser && (
        <div className="fixed top-4 left-4 z-50 flex items-center bg-white p-2 rounded-full shadow-md text-sm font-medium text-gray-700">
          <span className="mr-2">User ID: <span className="font-mono text-indigo-600 break-all">{userIdDisplay.substring(0, 8)}...</span></span>
          <span className="mr-2">Role: <span className="font-semibold capitalize text-indigo-600">{userRole || 'N/A'}</span></span>
          <button
            onClick={signOut}
            className="ml-2 bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded-full text-xs"
          >
            Sign Out
          </button>
        </div>
      )}

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Redirect root to /login if not authenticated, otherwise to /app */}
        <Route path="/" element={currentUser ? <Navigate to="/app" replace /> : <Navigate to="/login" replace />} />

        {/* Protected Routes */}
        <Route path="/app" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}> <App /> </ProtectedRoute>} />
        <Route path="/report" element={<ProtectedRoute allowedRoles={['admin', 'manager']}> <Report /> </ProtectedRoute>} />
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Admin />
          </ProtectedRoute>
        } />
        <Route path="/daily-specials" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}> <DailySpecialsManager /> </ProtectedRoute>} />
        <Route path="/kds" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}> <KDS /> </ProtectedRoute>} />

        {/* Fallback for unknown routes */}
        <Route path="*" element={<Navigate to={currentUser ? "/app" : "/login"} replace />} />
      </Routes>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <RootApp />
    </AuthProvider>
  </BrowserRouter>
);
