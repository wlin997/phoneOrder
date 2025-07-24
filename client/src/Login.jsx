// client/src/Login.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

// Define the global callback function for reCAPTCHA readiness.
// This MUST be globally accessible BEFORE the reCAPTCHA script loads.
// We use a guard to prevent re-definition warnings in React Strict Mode.
if (typeof window !== 'undefined' && typeof window.onRecaptchaLoadCallback === 'undefined') {
  window.onRecaptchaLoadCallback = () => {
    console.log("DEBUG: onRecaptchaLoadCallback fired. grecaptcha is ready.");
    // Dispatch a custom event so React components can react to grecaptcha being ready
    const event = new Event('recaptchaLoaded');
    window.dispatchEvent(event);
  };
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [requiresCaptcha, setRequiresCaptcha] = useState(false);
  const recaptchaRef = useRef(null); // Ref for the reCAPTCHA widget container

  // Function to render the reCAPTCHA widget
  const renderRecaptchaWidget = () => {
    // Only attempt to render if grecaptcha is available and the ref is attached
    if (window.grecaptcha && recaptchaRef.current) {
      // Check if it's already rendered into this specific div to avoid re-rendering
      // and instead just reset it for a new challenge.
      if (recaptchaRef.current.dataset.recaptchaRendered !== 'true') {
        try {
          recaptchaRef.current.innerHTML = ''; // Clear any previous content in the div
          window.grecaptcha.render(recaptchaRef.current, {
            sitekey: import.meta.env.VITE_RECAPTCHA_SITE_KEY,
            callback: (token) => { /* Token is handled in handleSubmit */ },
            'error-callback': () => {
              setError("reCAPTCHA encountered an error. Please refresh the page.");
            },
            'expired-callback': () => {
              setError("reCAPTCHA expired. Please re-verify.");
              window.grecaptcha.reset();
            }
          });
          recaptchaRef.current.dataset.recaptchaRendered = 'true'; // Mark as rendered
          console.log("DEBUG: reCAPTCHA widget rendered successfully.");
        } catch (e) {
          console.error("ERROR: Failed to render reCAPTCHA widget:", e);
          setError("Failed to load CAPTCHA. Please try again later. (Error details in console)");
        }
      } else {
        // If already rendered, just reset it for a new challenge
        window.grecaptcha.reset();
        console.log("DEBUG: reCAPTCHA widget reset.");
      }
    } else {
      console.log("DEBUG: renderRecaptchaWidget called, but grecaptcha or ref not ready for render.", {
          grecaptchaReady: !!window.grecaptcha,
          recaptchaRefCurrent: !!recaptchaRef.current
      });
    }
  };

  // Effect to load the reCAPTCHA script and manage rendering based on requiresCaptcha
  // This useEffect now LISTENS for the 'recaptchaLoaded' event
  useEffect(() => {
    console.log("DEBUG: VITE_RECAPTCHA_SITE_KEY:", import.meta.env.VITE_RECAPTCHA_SITE_KEY);

    // Handler for when reCAPTCHA API is ready
    const handleRecaptchaReady = () => {
      console.log("DEBUG: recaptchaLoaded event received.");
      if (requiresCaptcha && window.grecaptcha && recaptchaRef.current) {
        renderRecaptchaWidget();
      }
    };

    // Attach listener for the custom event
    window.addEventListener("recaptchaLoaded", handleRecaptchaReady);

    // Load the script if CAPTCHA is required and the script isn't already there
    if (requiresCaptcha && !document.getElementById('recaptcha-script')) {
      const script = document.createElement('script');
      script.id = 'recaptcha-script';
      // Script src now includes onload=onRecaptchaLoadCallback
      script.src = `https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoadCallback&render=explicit`;
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    } else if (requiresCaptcha && window.grecaptcha && recaptchaRef.current) {
      // If CAPTCHA is required AND script is already loaded AND ref is ready,
      // attempt to render immediately (e.g., on subsequent renders of Login component)
      renderRecaptchaWidget();
    } else if (!requiresCaptcha && window.grecaptcha && recaptchaRef.current && recaptchaRef.current.dataset.recaptchaRendered === 'true') {
      // When CAPTCHA is no longer required, reset it and clear marker
      window.grecaptcha.reset();
      delete recaptchaRef.current.dataset.recaptchaRendered;
      console.log("DEBUG: reCAPTCHA widget hidden/reset due to requiresCaptcha=false.");
    }

    // Cleanup: Remove the event listener when the component unmounts or dependencies change
    return () => {
      window.removeEventListener("recaptchaLoaded", handleRecaptchaReady);
    };
  }, [requiresCaptcha]); // Depend on requiresCaptcha state

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
