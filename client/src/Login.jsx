// client/src/Login.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [requiresCaptcha, setRequiresCaptcha] = useState(false); // NEW: State to control CAPTCHA visibility
  const recaptchaRef = useRef(null); // NEW: Ref for reCAPTCHA widget

  // NEW: Load reCAPTCHA script dynamically
  useEffect(() => {
    if (requiresCaptcha && !document.getElementById('recaptcha-script')) {
      const script = document.createElement('script');
      script.id = 'recaptcha-script';
      script.src = `https://www.google.com/recaptcha/api.js?render=explicit`; // Use explicit render
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
      script.onload = () => {
        // Render the reCAPTCHA widget once the script is loaded
        if (recaptchaRef.current && window.grecaptcha) {
          window.grecaptcha.render(recaptchaRef.current, {
            sitekey: import.meta.env.VITE_RECAPTCHA_SITE_KEY, // Your reCAPTCHA Site Key from .env
            callback: (token) => {
              // Token is automatically sent with form submission if widget is part of form
              // For explicit render, you might capture it here if needed for custom submission
            },
            'error-callback': () => {
              setError("reCAPTCHA encountered an error. Please refresh the page.");
            },
            'expired-callback': () => {
              setError("reCAPTCHA expired. Please re-verify.");
              if (window.grecaptcha) {
                window.grecaptcha.reset(); // Reset widget on expiry
              }
            }
          });
        }
      };
    }
  }, [requiresCaptcha]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    let recaptchaToken = null;
    if (requiresCaptcha && window.grecaptcha) {
      // Get the reCAPTCHA token from the widget
      recaptchaToken = window.grecaptcha.getResponse();
      if (!recaptchaToken) {
        setError("Please complete the reCAPTCHA verification.");
        return;
      }
    }

    const result = await login(email, password, recaptchaToken); // NEW: Pass recaptchaToken

    if (!result.success) {
      setError(result.message);
      if (result.requiresCaptcha) { // NEW: Check if backend explicitly requires CAPTCHA
        setRequiresCaptcha(true);
        if (window.grecaptcha) {
          window.grecaptcha.reset(); // Reset CAPTCHA widget on failed attempt
        }
      } else {
        setRequiresCaptcha(false); // Hide CAPTCHA if not explicitly required
      }
    } else {
      navigate("/", { replace: true });
      setRequiresCaptcha(false); // Hide CAPTCHA on successful login
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleSubmit}
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

        {/* NEW: reCAPTCHA Widget */}
        {requiresCaptcha && (
          <div className="flex justify-center mt-4">
            <div ref={recaptchaRef} id="recaptcha-container"></div>
          </div>
        )}

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
