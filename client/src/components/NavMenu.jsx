import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";  // adjust path if necessary

/**
 * Wrapper: show children only if user has given perm(s)
 */
export const RequirePerms = ({ perms, children, fallback = null }) => {
  const { isAuthenticated, hasPermission } = useAuth();
  if (!isAuthenticated) return fallback;
  return hasPermission(perms) ? children : fallback;
};

/**
 * Slide‑in sidebar navigation that hides/shows links
 * based on the RBAC permissions in AuthContext.
 */
const NavMenu = ({ isMenuOpen, handleMenuClose }) => {
  const menuRef = useRef(null);
  const { hasPermission, isAuthenticated, logout } = useAuth(); // ← added logout

  /* Close menu when clicking outside */
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        handleMenuClose();
      }
    }
    if (isMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen, handleMenuClose]);

  const menuClasses =
    `fixed top-0 right-0 h-full w-64 bg-white shadow-xl z-50 p-6 ` +
    `transform transition-transform duration-300 ease-in-out ` +
    (isMenuOpen ? "translate-x-0" : "translate-x-full");

  return (
    <div ref={menuRef} className={menuClasses}>
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-xl font-bold text-gray-800">Menu</h2>
        <button
          onClick={handleMenuClose}
          className="text-gray-500 hover:text-gray-800"
          aria-label="Close menu"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Show links only after login */}
      {!isAuthenticated ? (
        <p className="text-gray-500">Please log in.</p>
      ) : (
        <nav>
          <ul>
            {/* Dashboard */}
            <RequirePerms perms="view_dashboard">
              <li className="mb-4">
                <Link
                  to="/"
                  onClick={handleMenuClose}
                  className="flex items-center p-2 text-gray-700 rounded-lg hover:bg-cyan-50 hover:text-cyan-600"
                >
                  <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10..." />
                  </svg>
                  <span>Dashboard</span>
                </Link>
              </li>
            </RequirePerms>

            {/* KDS */}
            <RequirePerms perms="manage_kds">
              <li className="mb-4">
                <Link
                  to="/kds"
                  onClick={handleMenuClose}
                  className="flex items-center p-2 text-gray-700 rounded-lg hover:bg-cyan-50 hover:text-cyan-600"
                >
                  <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1..." />
                  </svg>
                  <span>KDS</span>
                </Link>
              </li>
            </RequirePerms>

            {/* Reports */}
            <RequirePerms perms="view_reports">
              <li className="mb-4">
                <Link
                  to="/report"
                  onClick={handleMenuClose}
                  className="flex items-center p-2 text-gray-700 rounded-lg hover:bg-cyan-50 hover:text-cyan-600"
                >
                  <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6..." />
                  </svg>
                  <span>Reports</span>
                </Link>
              </li>
            </RequirePerms>

            {/* Daily Specials */}
            <RequirePerms perms="edit_daily_specials">
              <li className="mb-4">
                <Link
                  to="/daily-specials"
                  onClick={handleMenuClose}
                  className="flex items-center p-2 text-gray-700 rounded-lg hover:bg-cyan-50 hover:text-cyan-600"
                >
                  <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4..." />
                  </svg>
                  <span>Daily Specials</span>
                </Link>
              </li>
            </RequirePerms>

            {/* Admin Settings */}
            <RequirePerms perms="manage_admin_settings">
              <li className="mb-4">
                <Link
                  to="/admin"
                  onClick={handleMenuClose}
                  className="flex items-center p-2 text-gray-700 rounded-lg hover:bg-cyan-50 hover:text-cyan-600"
                >
                  <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756..." />
                  </svg>
                  <span>Admin Settings</span>
                </Link>
              </li>
            </RequirePerms>

            {/* ---------- Log Out ---------- */}
            <li className="mt-8 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  logout();          // clear token
                  handleMenuClose(); // close sidebar
                }}
                className="flex items-center w-full p-2 text-gray-700 rounded-lg hover:bg-red-50 hover:text-red-600 transition"
              >
                <svg
                  className="w-6 h-6 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                </svg>
                <span>Log Out</span>
              </button>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
};

export default NavMenu;
