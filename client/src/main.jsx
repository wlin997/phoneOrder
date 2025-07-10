import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import App from "./App.jsx";
import Admin from "./Admin.jsx";
import Report from "./Report.jsx";
import KDS from "./KdsComponent.jsx";
import DailySpecialsManager from "./dailySpecials.jsx";

import { AuthProvider } from "./AuthContext.jsx";   // ⬅️ NEW
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>            {/* ⬅️ wraps the whole app */}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/report" element={<Report />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/daily-specials" element={<DailySpecialsManager />} />
          <Route path="/kds" element={<KDS />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
