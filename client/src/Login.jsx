// client/src/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export default function Login() {
  const { login, loginStep2 } = useAuth(); // Now use loginStep2 as well
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState(""); // State for 2FA code
  const [need2FA, setNeed2FA] = useState(false); // State to control 2FA UI
  const [error, setError] = useState("");

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const result = await login(email, password); // `login` can return { need2FA: true }

      if (result && result.need2FA) {
        setNeed2FA(true); // Show 2FA input field
        setError("Two-factor authentication required.");
      } else if (result && result.success) {
        // Successful login without 2FA or after initial 2FA check
        navigate("/", { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    }
  };

  const handle2FASubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await loginStep2(otpCode);
      navigate("/", { replace: true }); // Navigate on successful 2FA verification
    } catch (err) {
      setError(err.response?.data?.message || "2FA verification failed. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={need2FA ? handle2FASubmit : handleLoginSubmit} // Dynamic form submission
        className="w-full max-w-md bg-white shadow-xl rounded-lg p-10 space-y-6"
      >
        <h2 className="text-2xl font-bold text-center">Sign in</h2>

        {error && (
          <p className="text-red-600 text-sm text-center" role="alert">
            {error}
          </p>
        )}

        {!need2FA ? (
          // Regular login form
          <>
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
          </>
        ) : (
          // 2FA input form
          <>
            <p className="text-center text-gray-700">
              Please enter your 2FA code.
            </p>
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="2FA Code"
              className="w-full border rounded p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-3 rounded-lg font-semibold transition-colors"
            >
              Verify Code
            </button>
            <button
                type="button"
                onClick={() => setNeed2FA(false)} // Allow going back to regular login
                className="w-full mt-2 text-sm text-gray-600 hover:underline"
            >
                Back to Login
            </button>
          </>
        )}
      </form>
    </div>
  );
}