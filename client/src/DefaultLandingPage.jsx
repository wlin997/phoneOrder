// client/src/UnauthorizedPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export default function UnauthorizedPage() {
  const { user, authReady, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5); // Countdown for redirection

  useEffect(() => {
    // If not authenticated, redirect to login
    if (authReady && !isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }

    let timer;
    if (authReady && isAuthenticated) {
      // Start countdown
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }

    // After countdown, redirect to the appropriate page
    if (countdown === 0) {
      clearInterval(timer); // Stop the interval

      // Prioritize admin/dashboard access for users with those permissions
      if (user?.permissions.includes("manage_admin_settings")) {
        navigate("/admin", { replace: true }); // Admin panel for full admins
      } else if (user?.permissions.includes("view_dashboard")) {
        navigate("/dashboard", { replace: true }); // Dashboard for users with dashboard access
      } else if (user?.permissions.includes("manage_kds")) {
        navigate("/kds", { replace: true });
      } else if (user?.permissions.includes("view_reports")) {
        navigate("/report", { replace: true });
      } else if (user?.permissions.includes("edit_daily_specials")) {
        navigate("/daily-specials", { replace: true });
      } else {
        // Fallback if no specific permissions lead to a page
        navigate("/login", { replace: true }); // Redirect to login as a safe fallback
      }
    }

    return () => clearInterval(timer); // Cleanup on unmount
  }, [user, authReady, isAuthenticated, navigate, countdown]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-700">Loading user permissions...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white shadow-xl rounded-lg p-10 text-center space-y-6 max-w-md w-full">
        <h2 className="text-3xl font-bold text-red-600">Access Denied!</h2>
        <p className="text-gray-700 text-lg">
          You do not have permission to view this page.
        </p>
        <p className="text-gray-600 text-sm">
          Redirecting you to an accessible page in {countdown} seconds...
        </p>
        <button
          onClick={() => {
            // Immediately navigate if user clicks button
            if (user?.permissions.includes("manage_admin_settings")) {
              navigate("/admin", { replace: true });
            } else if (user?.permissions.includes("view_dashboard")) {
              navigate("/dashboard", { replace: true });
            } else if (user?.permissions.includes("manage_kds")) {
              navigate("/kds", { replace: true });
            } else if (user?.permissions.includes("view_reports")) {
              navigate("/report", { replace: true });
            } else if (user?.permissions.includes("edit_daily_specials")) {
              navigate("/daily-specials", { replace: true });
            } else {
              navigate("/login", { replace: true });
            }
          }}
          className="mt-4 px-6 py-2 bg-cyan-600 text-white rounded-lg font-semibold hover:bg-cyan-700 transition-colors"
        >
          Go Now
        </button>
      </div>
    </div>
  );
}
