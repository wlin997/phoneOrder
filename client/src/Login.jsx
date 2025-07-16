// client/src/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx"; //

export default function Login() {
  const { login, user } = useAuth(); // Destructure 'user' here to access permissions after login
  const navigate = useNavigate(); //
  const [email, setEmail] = useState(""); //
  const [password, setPassword] = useState(""); //
  const [error, setError] = useState(""); //

  const handleSubmit = async (e) => { //
    e.preventDefault(); //
    setError(""); //
    try {
      await login(email, password); // This updates the `user` object in AuthContext

      // NEW: Conditional navigation based on permissions
      if (user?.permissions.includes("manage_kds") && !user?.permissions.includes("view_dashboard")) { // Assuming 'view_dashboard' is a permission for dashboard access
        navigate("/kds");
      } else {
        navigate("/"); // Default for others (e.g., admins or users with dashboard access)
      }
    } catch (err) { //
      setError(err.response?.data?.message || "Login failed"); //
    }
  };

  return (
    // ... rest of your Login component remains the same
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleSubmit}
        /* width: 100% up to 448px (28rem)  */
        className="w-full max-w-md bg-white shadow-xl rounded-lg p-10 space-y-6"
      >
        <h2 className="text-2xl font-bold text-center">Sign in</h2>

        {error && (
          <p className="text-red-600 text-sm text-center" role="alert">
            {error}
          </p>
        )}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="username"
          className="w-full border rounded p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          required
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="w-full border rounded p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          required
        />

        <button
          type="submit"
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-3 rounded-lg font-semibold transition-colors"
        >
          Log In
        </button>
      </form>
    </div>
  );
}