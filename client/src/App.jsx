// client/src/App.jsx
import React, { useState } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";

import Dashboard              from "./Dashboard.jsx";
import Report                 from "./Report.jsx";
import KDS                    from "./KdsComponent.jsx";
import DailySpecialsManager   from "./dailySpecials.jsx";
import Admin                  from "./Admin.jsx";
import Login                  from "./Login.jsx";
import RoleManager            from "./RoleManager.jsx";

import { RequireAuth, RequirePerms } from "./AuthContext.jsx";
import NavMenu from "./components/NavMenu.jsx";
import Setup2FA from "./Setup2FA.jsx";

/*───────────────────────────────────────────────────────────*/
/* Shell that shows header + sidebar around protected pages */
function ProtectedLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen((p) => !p);

  return (
    <>
      {/* ---------- GLOBAL HEADER ---------- */}
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
        <Outlet /> {/* nested protected routes render here */}
      </main>
    </>
  );
}

/*───────────────────────────────────────────────────────────*/
export default function App() {
  return (
    <Routes>
      {/* -------- PUBLIC ROUTES -------- */}
      <Route path="/login" element={<Login />} />

      {/* -------- PROTECTED ROUTES -------- */}
      <Route
        element={
          <RequireAuth>
            <ProtectedLayout />
          </RequireAuth>
        }
      >
        {/* Dashboard (no extra perms) */}
        <Route index element={<Dashboard />} />

        {/* KDS */}
        <Route
          path="kds"
          element={
            <RequirePerms perms="manage_kds" fallback={<Navigate to="/" replace />}>
              <KDS />
            </RequirePerms>
          }
        />

        {/* Reports */}
        <Route
          path="report"
          element={
            <RequirePerms perms="view_reports" fallback={<Navigate to="/" replace />}>
              <Report />
            </RequirePerms>
          }
        />

        {/* Daily Specials */}
        <Route
          path="daily-specials"
          element={
            <RequirePerms perms="edit_daily_specials" fallback={<Navigate to="/" replace />}>
              <DailySpecialsManager />
            </RequirePerms>
          }
        />

        {/* Admin Settings */}
        <Route
          path="admin"
          element={
            <RequirePerms perms="manage_admin_settings" fallback={<Navigate to="/" replace />}>
              <Admin />
            </RequirePerms>
          }
        />

        {/* Role Manager */}
        <Route
          path="roles"
          element={
            <RequirePerms perms="manage_admin_settings" fallback={<Navigate to="/" replace />}>
              <RoleManager />
            </RequirePerms>
          }
        />
       <Route
          path="/setup-2fa"
          element={
            <RequireAuth>
              <Setup2FA />
            </RequireAuth>
          }
        /> 
      </Route>
      {/* Catch‑all → /login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
