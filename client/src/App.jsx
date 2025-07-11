import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Dashboard from "./Dashboard.jsx";
import Report from "./Report.jsx";
import KDS from "./KdsComponent.jsx";
import DailySpecialsManager from "./dailySpecials.jsx";
import Admin from "./Admin.jsx";
import Login from "./Login.jsx";

import NavMenu, { RequirePerms } from "./components/NavMenu.jsx";

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen((prev) => !prev);

  return (
    <>
      {/* ------------ Top bar ------------- */}
      <header className="flex justify-between items-center bg-white shadow px-4 py-3">
        <h1 className="text-xl font-semibold">Synthpify.ai Dashboard</h1>
        <button onClick={toggleMenu} className="text-gray-700" aria-label="Menu">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* ------------ Slide-in sidebar ------------- */}
      <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={() => setIsMenuOpen(false)} />

      {/* ------------ Main router ------------- */}
      <main className="p-6">
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<Login />} />

          {/* Dashboard acts as layout for routes under / → use /* */}
          <Route path="/*" element={<Dashboard />} />

          {/* Protected single-page routes */}
          <Route
            path="/kds"
            element={
              <RequirePerms perms="manage_kds" fallback={<Navigate to="/login" replace />}>
                <KDS />
              </RequirePerms>
            }
          />

          <Route
            path="/report"
            element={
              <RequirePerms perms="view_reports" fallback={<Navigate to="/login" replace />}>
                <Report />
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

          {/* Catch-all → Dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
