import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
// --- NEW AUTH IMPORTS ---
import { AuthProvider } from './AuthContext'; // Import AuthProvider
import Login from './components/Login.jsx'; // Import the new Login component
// --- END NEW AUTH IMPORTS ---

import Admin from './Admin.jsx';
import App from './App.jsx';
import Report from './Report.jsx';
import KDS from './KdsComponent.jsx';
import DailySpecialsManager from './dailySpecials.jsx'; // Corrected import
import './index.css';

// RootApp component to use AuthProvider
const RootApp = () => {
    // You can add logic here if needed, but for now, it just renders Routes
    return (
        <Routes>
            {/* NEW: Public login route */}
            <Route path="/login" element={<Login />} />

            {/* Existing routes remain public for now */}
            <Route path="/" element={<App />} />
            <Route path="/report" element={<Report />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/daily-specials" element={<DailySpecialsManager />} />
            <Route path="/kds" element={<KDS />} />
        </Routes>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider> {/* NEW: Wrap your entire application with AuthProvider */}
        <RootApp /> {/* NEW: Render RootApp inside AuthProvider */}
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);