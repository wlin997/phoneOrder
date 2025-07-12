import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import "./index.css";

import { Toaster } from "react-hot-toast";
/**
 * Root entry: we wrap App in
 *   • AuthProvider  – global auth state
 *   • BrowserRouter – exactly once (no nested routers)
 */
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
        <Toaster position="top-right" />   {/* NEW */}
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
