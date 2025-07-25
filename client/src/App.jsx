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
import OrderHistory from "./OrderHistory.jsx";

import { RequireAuth, RequirePerms, useAuth } from "./AuthContext.jsx";
import NavMenu from "./components/NavMenu.jsx";

// NEW Import for the Unauthorized Page
import UnauthorizedPage from "./UnauthorizedPage.jsx";
// NEW Import for the Default Landing Page
import DefaultLandingPage from "./DefaultLandingPage.jsx";


/*────────────────── Layout (header + sidebar) ──────────────────*/
function ProtectedLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user } = useAuth();

  return (
    <>
      {/* ───── Global header ───── */}
      <header className="flex justify-between items-start bg-white shadow px-4 py-3">
        {/* left : brand + signed‑in label */}
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold leading-none">
            Synthpify.ai Dashboard
          </h1>
          {user && (
            <span className="text-sm font-medium text-gray-700 mt-1">
              Signed in as <strong>{user.name ?? user.email}</strong>
            </span>
          )}
        </div>

        {/* right : hamburger */}
        <button
          onClick={() => setIsMenuOpen((p) => !p)}
          className="text-gray-700 ml-4"
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

      {/* ───── Fixed sidebar ───── */}
      <NavMenu
        isMenuOpen={isMenuOpen}
        handleMenuClose={() => setIsMenuOpen(false)}
      />

      {/* ───── Page content ───── */}
      <main className="p-6">
        <Outlet />
      </main>
    </>
  );
}

/*────────────────── Routes ──────────────────*/
export default function App() {
  return (
    <Routes>
      {/* public */}
      <Route path="/login" element={<Login />} />
      {/* NEW: Unauthorized Page */}
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* protected */}
      <Route
        element={
          <RequireAuth>
            <ProtectedLayout />
          </RequireAuth>
        }
      >
        {/* Changed: index now points to the new DefaultLandingPage */}
        <Route index element={<DefaultLandingPage />} />

        {/* The Dashboard route will now explicitly require 'view_dashboard' permission */}
        <Route
          path="dashboard"
          element={
            <RequirePerms perms="view_dashboard" fallback={<Navigate to="/unauthorized" replace />}>
              <Dashboard />
            </RequirePerms>
          }
        />

        <Route
          path="kds"
          element={
            <RequirePerms perms="manage_kds" fallback={<Navigate to="/unauthorized" replace />}>
              <KDS />
            </RequirePerms>
          }
        />
        <Route
          path="order-history"
          element={
            <RequirePerms perms="view_order_history" fallback={<Navigate to="/unauthorized" replace />}>
              <OrderHistory />
            </RequirePerms>
          }
        />

        <Route
          path="report"
          element={
            <RequirePerms perms="view_reports" fallback={<Navigate to="/unauthorized" replace />}>
              <Report />
            </RequirePerms>
          }
        />

        <Route
          path="daily-specials"
          element={
            <RequirePerms perms="edit_daily_specials" fallback={<Navigate to="/unauthorized" replace />}>
              <DailySpecialsManager />
            </RequirePerms>
          }
        />

        <Route
          path="admin"
          element={
            <RequirePerms perms="manage_admin_settings" fallback={<Navigate to="/unauthorized" replace />}>
              <Admin />
            </RequirePerms>
          }
        />

        <Route
          path="roles"
          element={
            <RequirePerms perms="manage_admin_settings" fallback={<Navigate to="/unauthorized" replace />}>
              <RoleManager />
            </RequirePerms>
          }
        />
      </Route>

      {/* catch‑all */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
