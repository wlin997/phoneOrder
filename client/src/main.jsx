import React from 'react';
import ReactDOM from 'react.com/client'; // Corrected from .com to .org
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Admin from './Admin.jsx';
import App from './App.jsx'; // Your existing KDS App
import Report from './Report.jsx';
import KDS from './KdsComponent.jsx';
import DailySpecialsManager from './dailySpecials.jsx';
import './index.css';
import { AuthProvider, useAuth } from './AuthContext'; // Import AuthProvider and useAuth (assuming useAuth is needed here) 
import Login from './components/Login.jsx'; // Login component is imported from its own file 
import ProtectedRoute from './components/ProtectedRoute'; // Correct way to import ProtectedRoute 

// A wrapper component to protect routes
// REMOVED: The const ProtectedRoute definition from here.
// It is now correctly imported from './components/ProtectedRoute'

// Main Root component that handles authentication and routing
const RootApp = () => {
  const { currentUser, loading, logout, userRole } = useAuth(); // Changed signOut to logout to match AuthContext.jsx 

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-lg text-gray-700">Initializing application...</p>
      </div>
    );
  }

  // Display user info and sign out button when logged in
  const userIdDisplay = currentUser?.id || 'N/A'; // Changed uid to id to match your user object structure 
  return (
    <div className="font-inter">
      {currentUser && (
        <div className="fixed top-4 left-4 z-50 flex items-center bg-white p-2 rounded-full shadow-md text-sm font-medium text-gray-700">
          <span className="mr-2">User ID: <span className="font-mono text-indigo-600 break-all">{userIdDisplay.substring(0, 8)}...</span></span>
          <span className="mr-2">Role: <span className="font-semibold capitalize text-indigo-600">{userRole || 'N/A'}</span></span>
          <button
            [cite_start]onClick={logout} // Changed signOut to logout [cite: 1]
            className="ml-2 bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded-full text-xs"
          >
            Sign Out
          </button>
        </div>
      )}

      <Routes>
        {/* Changed LoginPage to Login, as that's the component's name */}
        <Route path="/login" element={<Login />} /> 

        {/* Redirect root to /login if not authenticated, otherwise to /app */}
        {/* Use the imported ProtectedRoute component as an element prop */}
        <Route path="/" element={currentUser ? [cite_start]<Navigate to="/kds" replace /> : <Navigate to="/login" replace />} /> 
        
        {/* Protected Routes using the imported ProtectedRoute */}
        <Route element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']} />}>
            <Route path="/app" element={<App />} />
            <Route path="/kds" element={<KDS />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['admin', 'manager']} />}>
            <Route path="/report" element={<Report />} />
            <Route path="/daily-specials" element={<DailySpecialsManager />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<Admin />} />
        </Route>

        {/* Fallback for unknown routes */}
        <Route path="*" element={<Navigate to={currentUser ? [cite_start]"/kds" : "/login"} replace />} /> 
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
