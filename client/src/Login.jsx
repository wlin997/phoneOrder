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
  const [requiresCaptcha, setRequiresCaptcha] = useState(false);
  const recaptchaRef = useRef(null);

  // Function to load the reCAPTCHA script
  const loadRecaptchaScript = () => {
    if (!document.getElementById('recaptcha-script')) {
      const script = document.createElement('script');
      script.id = 'recaptcha-script';
      script.src = `https://www.google.com/recaptcha/api.js?render=explicit`;
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  };

  // Effect to handle reCAPTCHA rendering and resetting
  useEffect(() => {
    // NEW DEBUG LOG: Check the site key value
    console.log("DEBUG: VITE_RECAPTCHA_SITE_KEY:", import.meta.env.VITE_RECAPTCHA_SITE_KEY);

    if (requiresCaptcha) {
      loadRecaptchaScript(); // Ensure script is loaded when CAPTCHA is required

      const interval = setInterval(() => {
        if (window.grecaptcha && recaptchaRef.current) {
          clearInterval(interval); // Stop checking once ready

          // Only render if not already rendered into this div
          if (recaptchaRef.current.dataset.recaptchaRendered !== 'true') {
            window.grecaptcha.render(recaptchaRef.current, {
              sitekey: import.meta.env.VITE_RECAPTCHA_SITE_KEY,
              callback: (token) => { /* token is handled in handleSubmit */ },
              'error-callback': () => {
                setError("reCAPTCHA encountered an error. Please refresh the page.");
              },
              'expired-callback': () => {
                setError("reCAPTCHA expired. Please re-verify.");
                window.grecaptcha.reset();
              }
            });
            recaptchaRef.current.dataset.recaptchaRendered = 'true'; // Mark as rendered
          } else {
            // If already rendered, just reset it for a new challenge
            window.grecaptcha.reset();
          }
        }
      }, 200); // Check every 200ms

      return () => {
        clearInterval(interval); // Cleanup interval on unmount or if requiresCaptcha becomes false
      };
    } else {
      // When CAPTCHA is no longer required, reset it if it was rendered
      if (window.grecaptcha && recaptchaRef.current && recaptchaRef.current.dataset.recaptchaRendered === 'true') {
        window.grecaptcha.reset();
        delete recaptchaRef.current.dataset.recaptchaRendered; // Clear marker
      }
    }
  }, [requiresCaptcha]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    let recaptchaToken = null;
    if (requiresCaptcha && window.grecaptcha) {
      recaptchaToken = window.grecaptcha.getResponse();
      if (!recaptchaToken) {
        setError("Please complete the reCAPTCHA verification.");
        return;
      }
    }

    const result = await login(email, password, recaptchaToken);

    if (!result.success) {
      setError(result.message);
      if (result.requiresCaptcha) {
        setRequiresCaptcha(true);
      } else {
        setRequiresCaptcha(false);
      }
    } else {
      navigate("/", { replace: true });
      setRequiresCaptcha(false);
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
