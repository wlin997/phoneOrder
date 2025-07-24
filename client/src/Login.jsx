// client/src/Login.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

// Ensure onRecaptchaLoadCallback is defined globally before the script loads
if (typeof window !== 'undefined' && typeof window.onRecaptchaLoadCallback === 'undefined') {
  window.onRecaptchaLoadCallback = () => {
    console.log("DEBUG: onRecaptchaLoadCallback fired. grecaptcha is ready.");
    const event = new Event("recaptchaLoaded");
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
  const recaptchaRef = useRef(null);

  const renderRecaptchaWidget = () => {
    if (window.grecaptcha && recaptchaRef.current) {
      if (recaptchaRef.current.dataset.recaptchaRendered !== 'true') {
        try {
          recaptchaRef.current.innerHTML = "";
          window.grecaptcha.render(recaptchaRef.current, {
            sitekey: import.meta.env.VITE_RECAPTCHA_SITE_KEY,
            callback: () => {},
            'error-callback': () => {
              setError("reCAPTCHA encountered an error. Please refresh the page.");
            },
            'expired-callback': () => {
              setError("reCAPTCHA expired. Please re-verify.");
              window.grecaptcha.reset();
            }
          });
          recaptchaRef.current.dataset.recaptchaRendered = 'true';
          console.log("DEBUG: reCAPTCHA widget rendered.");
        } catch (e) {
          console.error("ERROR: Failed to render reCAPTCHA widget:", e);
          setError("Failed to load CAPTCHA. Please try again later.");
        }
      } else {
        window.grecaptcha.reset();
        console.log("DEBUG: reCAPTCHA widget reset.");
      }
    } else {
      console.log("DEBUG: grecaptcha or ref not ready.", {
        grecaptchaReady: !!window.grecaptcha,
        recaptchaRefCurrent: !!recaptchaRef.current,
      });
    }
  };

  useEffect(() => {
    const handleRecaptchaReady = () => {
      if (requiresCaptcha && recaptchaRef.current) {
        renderRecaptchaWidget();
      }
    };

    window.addEventListener("recaptchaLoaded", handleRecaptchaReady);

    // Load script if not already loaded
    if (requiresCaptcha && !document.getElementById("recaptcha-script")) {
      const script = document.createElement("script");
      script.id = "recaptcha-script";
      script.src = "https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoadCallback&render=explicit";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    } else if (requiresCaptcha && window.grecaptcha && recaptchaRef.current) {
      renderRecaptchaWidget();
    } else if (!requiresCaptcha && recaptchaRef.current?.dataset.recaptchaRendered === 'true') {
      window.grecaptcha.reset();
      delete recaptchaRef.current.dataset.recaptchaRendered;
      console.log("DEBUG: CAPTCHA reset due to requiresCaptcha=false");
    }

    return () => {
      window.removeEventListener("recaptchaLoaded", handleRecaptchaReady);
    };
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
      setRequiresCaptcha(result.requiresCaptcha || false);
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
