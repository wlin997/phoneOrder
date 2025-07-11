import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Dashboard from "./Dashboard.jsx";
import Report from "./Report.jsx";
import KDS from "./KdsComponent.jsx";
import DailySpecialsManager from "./dailySpecials.jsx";
import Admin from "./Admin.jsx";
import Login from "./Login.jsx";              // make sure Login.jsx exists

import NavMenu, { RequirePerms } from "./components/NavMenu.jsx";

const App = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen((p) => !p);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* top bar */}
      <header className="flex justify-between items-center bg-white shadow px-4 py-3">
        <h1 className="text-xl font-semibold">Synthpify.ai Dashboard</h1>
        <button onClick={toggleMenu} className="text-gray-700">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* slide-in menu */}
      <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={() => setIsMenuOpen(false)} />

      {/* main router */}
      <main className="p-6">
        <Routes>
          {/* public routes */}
          <Route path="/login" element={<Login />} />

          {/* protected routes */}
          <Route path="/" element={<Dashboard />} />

          <Route
            path="/report"
            element={
              <RequirePerms perms="view_reports" fallback={<Navigate to="/login" replace />}>
                <Report />
              </RequirePerms>
            }
          />

          <Route
            path="/kds"
            element={
              <RequirePerms perms="manage_kds" fallback={<Navigate to="/login" replace />}>
                <KDS />
              </RequirePerms>
            }
          />

          <Route
            path="/daily-specials"
            element={
              <RequirePerms perms="edit_daily_specials" fallback={<Navigate to="/login" replace />}>
                <DailySpecialsManager />
              </RequirePerms>
            }
          />

          <Route
            path="/admin"
            element={
              <RequirePerms perms="manage_admin_settings" fallback={<Navigate to="/login" replace />}>
                <Admin />
              </RequirePerms>
            }
          />

          {/* catch-all → dashboard or 404 */}
          <Route path="/*" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
};

export default App; 
