import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Dashboard from "./Dashboard.jsx";
import Report from "./Report.jsx";
import KDS from "./KdsComponent.jsx";
import DailySpecialsManager from "./dailySpecials.jsx";
import Admin from "./Admin.jsx";
import Login from "./Login.jsx";

import { RequireAuth, RequirePerms } from "./AuthContext.jsx";
import NavMenu from "./components/NavMenu.jsx";

import RoleManager from "./RoleManager.jsx"; 
/*───────────────────────────────────────────────────────────*/

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen((p) => !p);

  return (
    <>
      {/* ---------- GLOBAL HEADER (edge‑to‑edge) ---------- */}
      <header className="flex justify-between items-center bg-white shadow px-4 py-3">
        <h1 className="text-xl font-semibold">Synthpify.ai Dashboard</h1>

        <button
          onClick={toggleMenu}
          className="text-gray-700"
          aria-label="Open side menu"
        >
          <svg
            className="w-7 h-7"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </header>

      {/* ---------- FIXED SIDEBAR ---------- */}
      <NavMenu
        isMenuOpen={isMenuOpen}
        handleMenuClose={() => setIsMenuOpen(false)}
      />

      {/* ---------- PAGE CONTENT ---------- */}
      <main className="p-6">
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Dashboard */}
          <Route
            path="/*"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />

          {/* KDS */}
          <Route
            path="/kds"
            element={
              <RequireAuth>
                <RequirePerms perms="manage_kds" fallback={<Navigate to="/" replace />}>
                  <KDS />
                </RequirePerms>
              </RequireAuth>
            }
          />

          {/* Reports */}
          <Route
            path="/report"
            element={
              <RequireAuth>
                <RequirePerms perms="view_reports" fallback={<Navigate to="/" replace />}>
                  <Report />
                </RequirePerms>
              </RequireAuth>
            }
          />

          {/* Daily Specials */}
          <Route
            path="/daily-specials"
            element={
              <RequireAuth>
                <RequirePerms
                  perms="edit_daily_specials"
                  fallback={<Navigate to="/" replace />}
                >
                  <DailySpecialsManager />
                </RequirePerms>
              </RequireAuth>
            }
          />

          {/* Admin Settings */}
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RequirePerms
                  perms="manage_admin_settings"
                  fallback={<Navigate to="/" replace />}
                >
                  <Admin />
                </RequirePerms>
              </RequireAuth>
            }
          />

          {/* Catch‑all → /login */}
          <Route path="*" element={<Navigate to="/login" replace />} />

          <Route path="/roles" element={<RequirePerms perms="manage_admin_settings"><RoleManager /></RequirePerms>} />
        </Routes>
      </main>
    </>
  );
}
