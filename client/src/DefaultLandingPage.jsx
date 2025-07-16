// client/src/DefaultLandingPage.jsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export default function DefaultLandingPage() {
  const { user, authReady } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authReady) {
      if (user?.permissions.includes("manage_kds")) {
        navigate("/kds", { replace: true });
      } else if (user?.permissions.includes("view_reports")) {
        navigate("/report", { replace: true });
      } else if (user?.permissions.includes("edit_daily_specials")) {
        navigate("/daily-specials", { replace: true });
      } else if (user?.permissions.includes("manage_admin_settings")) {
        navigate("/admin", { replace: true });
      } else {
        // Fallback if no specific permissions lead to a page,
        // or a page for users with very limited access
        navigate("/no-access", { replace: true }); // Create a 'no-access' page if needed
      }
    }
  }, [user, authReady, navigate]);

  return null; // This component doesn't render anything, it just redirects
}