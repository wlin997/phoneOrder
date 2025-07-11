import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Dashboard from "./Dashboard.jsx";
import Report from "./Report.jsx";
import KDS from "./KdsComponent.jsx";
import DailySpecialsManager from "./dailySpecials.jsx";
import Admin from "./Admin.jsx";
import NavMenu from "./components/NavMenu.jsx";         // ✅ CORRECTED
import { RequirePerms } from "./AuthContext.jsx";
import RoleManager from "./RoleManager.jsx";
import Login from "./Login.jsx";

const App = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen((prev) => !prev);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between bg-white shadow px-4 py-3">
        <h1 className="text-xl font-semibold text-gray-800">Synthpify.ai Dashboard</h1>
        <button onClick={toggleMenu} className="text-gray-700 hover:text-cyan-600" aria-label="Open menu">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={closeMenu} />

      <main className="p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />

          <Route path="/report" element={
            <RequirePerms perms="view_reports" fallback={<Navigate to="/" replace />}><Report /></RequirePerms>
          }/>

          <Route path="/kds" element={
            <RequirePerms perms="manage_kds" fallback={<Navigate to="/" replace />}><KDS /></RequirePerms>
          }/>

          <Route path="/daily-specials" element={
            <RequirePerms perms="edit_daily_specials" fallback={<Navigate to="/" replace />}><DailySpecialsManager /></RequirePerms>
          }/>

          <Route path="/admin" element={
            <RequirePerms perms="manage_admin_settings" fallback={<Navigate to="/" replace />}><Admin /></RequirePerms>
          }/>
          <Route path="/admin/roles" element={
             <RequirePerms perms="manage_admin_settings" fallback={<Navigate to="/" replace />}><RoleManager /></RequirePerms>
          }/>
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
