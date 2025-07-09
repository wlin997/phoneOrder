import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './AuthContext'; // Import AuthProvider 
import ProtectedRoute from './components/ProtectedRoute'; // Import ProtectedRoute 
import Login from './components/Login.jsx'; // Import the new Login component 

import Admin from './Admin.jsx';
import App from './App.jsx';
import Report from './Report.jsx';
import KDS from './KdsComponent.jsx';
import DailySpecialsManager from './dailySpecials.jsx';

import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider> {/* Wrap your entire application with AuthProvider */} 
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} /> 

          {/* Protected Routes */}
          {/* The main App dashboard, accessible by admin, manager, employee */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']} />}> 
            <Route path="/" element={<App />} />
          </Route>

          {/* KDS is accessible by admin, manager, employee */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']} />}> 
            <Route path="/kds" element={<KDS />} />
          </Route>

          {/* Reports accessible by admin, manager */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'manager']} />}> 
            <Route path="/report" element={<Report />} />
          </Route>

          {/* Admin settings accessible only by admin */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}> 
            <Route path="/admin" element={<Admin />} />
          </Route>

          {/* Daily Specials Manager accessible by admin, manager */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'manager']} />}> 
            <Route path="/daily-specials" element={<DailySpecialsManager />} />
          </Route>

          {/* Fallback route for any undefined paths */}
          <Route path="*" element={<div>404 - Page Not Found</div>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);