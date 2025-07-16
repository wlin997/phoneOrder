// client/src/DefaultLandingPage.jsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export default function DefaultLandingPage() {
  const { user, authReady, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If authentication is not yet ready, do nothing and wait for the next render.
    if (!authReady) {
      return;
    }

    // If auth is ready but the user is not authenticated, redirect to login.
    // This handles cases where a token might be invalid or missing.
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }

    // Now, auth is ready and user is authenticated. Proceed with permission-based redirection.
    // Explicitly check if 'user' and 'user.permissions' are available before attempting to navigate.
    if (user && user.permissions) {
      if (user.permissions.includes("view_dashboard")) {
        navigate("/dashboard", { replace: true });
      } else if (user.permissions.includes("manage_admin_settings")) {
        navigate("/admin", { replace: true });
      } else if (user.permissions.includes("manage_kds")) {
        navigate("/kds", { replace: true });
      } else if (user.permissions.includes("view_reports")) {
        navigate("/report", { replace: true });
      } else if (user.permissions.includes("edit_daily_specials")) {
        navigate("/daily-specials", { replace: true });
      } else {
        // If authenticated but no specific routes match,
        // navigate to the unauthorized page as a fallback for users with no specific access.
        navigate("/unauthorized", { replace: true });
      }
    }
    // If user or user.permissions is not yet available, the useEffect will re-run when they are.
  }, [user, authReady, isAuthenticated, navigate]);

  // Render a loading message while waiting for authentication state to be fully resolved.
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-700">Loading your personalized dashboard...</p>
    </div>
  );
}