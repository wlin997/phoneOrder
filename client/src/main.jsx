import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'; // CORRECTED: Added Navigate
// --- NEW AUTH IMPORTS ---
import { AuthProvider, useAuth } from './AuthContext';  // Import AuthProvider and useAuth
import Login from './components/Login.jsx';  // Import the new Login component
import ProtectedRoute from './components/ProtectedRoute';  // Import ProtectedRoute
// --- END NEW AUTH IMPORTS ---

import Admin from './Admin.jsx'; 
import App from './App.jsx'; // Your existing KDS App 
import Report from './Report.jsx'; 
import KDS from './KdsComponent.jsx'; 
import DailySpecialsManager from './dailySpecials.jsx';  // Corrected import
import './index.css'; 

// RootApp component to use AuthProvider and manage main routing logic
const RootApp = () => {
    const { currentUser, loading, logout, userRole } = useAuth(); 

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100"> 
                <p className="text-lg text-gray-700">Initializing application...</p> 
            </div>
        );
    }

    // Fixed header element to display user info and logout button when logged in
    const userIdDisplay = currentUser?.id || 'N/A'; 
    return (
        <div className="font-inter"> 
            {currentUser && (
                <div className="fixed top-4 left-4 z-50 flex items-center bg-white p-2 rounded-full shadow-md text-sm font-medium text-gray-700"> 
                    <span className="mr-2">User ID: <span className="font-mono text-indigo-600 break-all">{String(userIdDisplay).substring(0, 8)}...</span></span> 
                    <span className="mr-2">Role: <span className="font-semibold capitalize text-indigo-600">{String(userRole || 'N/A')}</span></span> 
                    <button
                        onClick={logout}  // Calls the logout function from AuthContext
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
                {/* This route needs to be outside a ProtectedRoute to handle the initial redirect */}
                <Route path="/" element={currentUser ? <Navigate to="/app" replace /> : <Navigate to="/login" replace />} />
                {/* Protected Routes using the imported ProtectedRoute component */}
                {/* These routes require authentication and specific roles */}

                {/* Group 1: Admin, Manager, Employee access */}
                <Route element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']} />}> 
                    <Route path="/app" element={<App />} />  {/* Dashboard app */}
                    <Route path="/kds" element={<KDS />} />  {/* KDS kitchen display */}
                </Route>

                {/* Group 2: Admin, Manager access */}
                <Route element={<ProtectedRoute allowedRoles={['admin', 'manager']} />}> 
                    <Route path="/report" element={<Report />} />  {/* Reports page */}
                    <Route path="/daily-specials" element={<DailySpecialsManager />} />  {/* Daily Specials management */}
                </Route>

                {/* Group 3: Admin only access */}
                <Route element={<ProtectedRoute allowedRoles={['admin']} />}> 
                    <Route path="/admin" element={<Admin />} />  {/* Admin settings */}
                </Route>

                {/* Fallback for unknown routes: Redirects authenticated users to /kds, others to /login */}
                <Route path="*" element={<Navigate to={currentUser ? "/app" : "/login"} replace />} />
            </Routes> 
        </div>
    );
};

// Mount the RootApp to the DOM, wrapping it with BrowserRouter and AuthProvider
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider> 
        <RootApp /> 
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);