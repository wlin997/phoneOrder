import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { ShieldCheck } from "lucide-react";   // or any icon library yo


/**
 * Wrapper for permission-based rendering
 */
export const RequirePerms = ({ perms, children, fallback = null }) => {
  const { isAuthenticated, hasPermission } = useAuth();
  if (!isAuthenticated) return fallback;
  return hasPermission(perms) ? children : fallback;
};

const NavMenu = ({ isMenuOpen, handleMenuClose }) => {
  const menuRef = useRef(null);
  const { hasPermission, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        handleMenuClose();
      }
    }
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen, handleMenuClose]);

  const menuClasses = `fixed top-0 right-0 h-full w-64 bg-white shadow-xl z-50 p-6 transform transition-transform duration-300 ease-in-out ${
    isMenuOpen ? "translate-x-0" : "translate-x-full"
  }`;

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
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {!isAuthenticated ? (
        <p className="text-gray-500">Please log in.</p>
      ) : (
        <nav>
          <ul>
            <RequirePerms perms="view_dashboard">
              <li className="mb-4">
                <Link
                  to="/"
                  onClick={handleMenuClose}
                  className="flex items-center p-2 text-gray-700 rounded-lg hover:bg-cyan-50 hover:text-cyan-600"
                >
                  <svg
                    className="w-6 h-6 mr-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                  </svg>
                  <span>Dashboard</span>
                </Link>
              </li>
            </RequirePerms>

            <RequirePerms perms="manage_kds">
              <li className="mb-4">
                <Link
                  to="/kds"
                  onClick={handleMenuClose}
                  className="flex items-center p-2 text-gray-700 rounded-lg hover:bg-cyan-50 hover:text-cyan-600"
                >
                  <svg
                    className="w-6 h-6 mr-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span>KDS</span>
                </Link>
              </li>
            </RequirePerms>

            <RequirePerms perms="view_reports">
              <li className="mb-4">
                <Link
                  to="/report"
                  onClick={handleMenuClose}
                  className="flex items-center p-2 text-gray-700 rounded-lg hover:bg-cyan-50 hover:text-cyan-600"
                >
                  <svg
                    className="w-6 h-6 mr-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span>Reports</span>
                </Link>
              </li>
            </RequirePerms>

            <RequirePerms perms="edit_daily_specials">
              <li className="mb-4">
                <Link
                  to="/daily-specials"
                  onClick={handleMenuClose}
                  className="flex items-center p-2 text-gray-700 rounded-lg hover:bg-cyan-50 hover:text-cyan-600"
                >
                  <svg
                    className="w-6 h-6 mr-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                  <span>Daily Specials</span>
                </Link>
              </li>
            </RequirePerms>

            <RequirePerms perms="manage_admin_settings">
              <li className="mb-4">
                <Link
                  to="/admin"
                  onClick={handleMenuClose}
                  className="flex items-center p-2 text-gray-700 rounded-lg hover:bg-cyan-50 hover:text-cyan-600"
                >
                  <svg
                    className="w-6 h-6 mr-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>Admin Settings</span>
                </Link>
              </li>
            </RequirePerms>
            <RequirePerms perms="manage_admin_settings">
              <li className="mb-4">
                <Link to="/roles" onClick={handleMenuClose} className="flex items-center p-2 text-gray-700 rounded-lg hover:bg-cyan-50 hover:text-cyan-600">
                  <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Role Manager</span>
                </Link>
              </li>
            </RequirePerms>

            {/* Log Out */}
            <li className="mt-6 pt-4 border-t">
              <button
                onClick={logout}
                className="flex items-center p-2 text-red-600 rounded-lg hover:bg-red-50 hover:text-red-800 w-full"
              >
                <svg
                  className="w-6 h-6 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"
                  />
                </svg>
                <span>Log Out</span>
              </button>
            </li>
            {/* Security link */}
            <li className="mt-1">
              <Link
                to="/profile/security"
                className={({ isActive }) =>
                  `flex items-center p-2 rounded-lg hover:bg-gray-100 w-full ${
                    isActive ? "bg-gray-100 font-semibold" : "text-gray-700"
                  }`
                }
              >
                <ShieldCheck className="w-5 h-5 mr-3" />
                <span>Security</span>
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
};

export default NavMenu;
