// src/main.jsx

// 1. Core React and Routing Imports
import React from 'react'; // Imports React library for JSX syntax and component definition.
import ReactDOM from 'react-dom/client'; // Imports ReactDOM to render React components to the DOM.
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'; // Imports components for client-side routing.

// 2. Application Component Imports
import Admin from './Admin.jsx'; // Imports the Admin component.
import App from './App.jsx'; // Imports the main App dashboard component.
import Report from './Report.jsx'; // Imports the Report component.
import KDS from './KdsComponent.jsx'; // Imports the KDS component.
import DailySpecialsManager from './dailySpecials.jsx'; // Imports the DailySpecialsManager component.
import './index.css'; // Imports global CSS styles.

// 3. Authentication Component/Context Imports (Crucial for auth system)
import { AuthProvider, useAuth } from './AuthContext'; // Imports AuthProvider (to wrap the app) and useAuth hook (to access auth context).
import Login from './components/Login.jsx'; // Imports the Login component from its location.
import ProtectedRoute from './components/ProtectedRoute'; // Imports the ProtectedRoute component from its location.

// ==============================================================================
// RootApp Component (Centralized application logic and routing)
// This component manages the overall application state, authentication loading,
// and conditionally renders routes based on user authentication status and roles.
// ==============================================================================
const RootApp = () => {
  // Use the useAuth hook to get the current authentication state
  const { currentUser, loading, logout, userRole } = useAuth();

  // If authentication state is still loading, display a loading message
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-lg text-gray-700">Initializing application...</p>
      </div>
    );
  }

  // Display user ID and role for logged-in users (fixed header element)
  const userIdDisplay = currentUser?.id || 'N/A'; // Access 'id' from currentUser object
  return (
    <div className="font-inter">
      {currentUser && (
        <div className="fixed top-4 left-4 z-50 flex items-center bg-white p-2 rounded-full shadow-md text-sm font-medium text-gray-700">
          <span className="mr-2">User ID: <span className="font-mono text-indigo-600 break-all">{userIdDisplay.substring(0, 8)}...</span></span>
          <span className="mr-2">Role: <span className="font-semibold capitalize text-indigo-600">{userRole || 'N/A'}</span></span>
          <button
            onClick={logout} // Calls the logout function from AuthContext
            className="ml-2 bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded-full text-xs"
          >
            Sign Out
          </button>
        </div>
      )}

      {/* Define application routes */}
      <Routes>
        {/* Public login route */}
        <Route path="/login" element={<Login />} />

        {/* Root path: Redirects to /kds if authenticated, otherwise to /login */}
        <Route path="/" element={currentUser ? <Navigate to="/kds" replace /> : <Navigate to="/login" replace />} />

        {/* Protected Routes using the imported ProtectedRoute component */}
        {/* These routes require authentication and specific roles */}

        {/* Group 1: Admin, Manager, Employee access */}
        <Route element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']} />}>
            <Route path="/app" element={<App />} /> {/* Dashboard app */}
            <Route path="/kds" element={<KDS />} /> {/* KDS kitchen display */}
        </Route>

        {/* Group 2: Admin, Manager access */}
        <Route element={<ProtectedRoute allowedRoles={['admin', 'manager']} />}>
            <Route path="/report" element={<Report />} /> {/* Reports page */}
            <Route path="/daily-specials" element={<DailySpecialsManager />} /> {/* Daily Specials management */}
        </Route>

        {/* Group 3: Admin only access */}
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<Admin />} /> {/* Admin settings */}
        </Route>

        {/* Fallback for unknown routes: Redirects authenticated users to /kds, others to /login */}
        <Route path="*" element={<Navigate to={currentUser ? "/kds" : "/login"} replace />} />
      </Routes>
    </div>
  );
};

// ==============================================================================
// ReactDOM Render Call (Mounts the RootApp to the DOM)
// ==============================================================================
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter> {/* Provides routing context to the application */}
    <AuthProvider> {/* Provides authentication context to the entire application */}
      <RootApp /> {/* Renders the main application component */}
    </AuthProvider>
  </BrowserRouter>
);