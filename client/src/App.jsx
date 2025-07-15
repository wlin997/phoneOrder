// client/src/App.jsx
import React, { useState } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";

import Dashboard            from "./Dashboard.jsx";
import Report               from "./Report.jsx";
import KDS                  from "./KdsComponent.jsx";
import DailySpecialsManager from "./dailySpecials.jsx";
import Admin                from "./Admin.jsx";
import Login                from "./Login.jsx";
import RoleManager          from "./RoleManager.jsx";

import { RequireAuth, RequirePerms, useAuth } from "./AuthContext.jsx";  // ← import hook
import NavMenu from "./components/NavMenu.jsx";

/*────────────────── HEADER with user name ──────────────────*/
function ProtectedLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user } = useAuth();        // ← grab user from context

  return (
    <>
      <header className="flex justify-between items-center bg-white shadow px-4 py-3">
        <h1 className="text-xl font-semibold">Synthpify.ai Dashboard</h1>

        {/* show name if present, otherwise email */}
        {user && (
          <span className="text-sm font-medium text-gray-700">
            Signed in&nbsp;as&nbsp;
            <strong>{user.name ?? user.email}</strong>
          </span>
        )}

        <button
          onClick={() => setIsMenuOpen(p => !p)}
          className="text-gray-700 ml-4"
          aria-label="Open side menu"
        >
          {/* hamburger icon */}
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M4 6h16M4 12h16M4 18h16" />
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
        <Route index element={<Dashboard />} />

        <Route
          path="kds"
          element={
            <RequirePerms perms="manage_kds" fallback={<Navigate to="/" replace />}>
              <KDS />
            </RequirePerms>
          }
        />

        <Route
          path="report"
          element={
            <RequirePerms perms="view_reports" fallback={<Navigate to="/" replace />}>
              <Report />
            </RequirePerms>
          }
        />

        <Route
          path="daily-specials"
          element={
            <RequirePerms perms="edit_daily_specials" fallback={<Navigate to="/" replace />}>
              <DailySpecialsManager />
            </RequirePerms>
          }
        />

        <Route
          path="admin"
          element={
            <RequirePerms perms="manage_admin_settings" fallback={<Navigate to="/" replace />}>
              <Admin />
            </RequirePerms>
          }
        />

        <Route
          path="roles"
          element={
            <RequirePerms perms="manage_admin_settings" fallback={<Navigate to="/" replace />}>
              <RoleManager />
            </RequirePerms>
          }
        />
      </Route>

      {/* Catch‑all → /login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
