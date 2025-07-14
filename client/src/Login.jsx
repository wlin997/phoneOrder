// client/src/Login.jsx
import React, { useState } from "react";
import { useAuth } from "./AuthContext.jsx";   // cookie‑based context
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";

export default function Login() {
  const { login, user, authReady } = useAuth();

  /* step 1 fields */
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");

  /* step 2 */
  const [step,     setStep]     = useState(1);   // 1 = creds, 2 = TOTP
  const [tmp,      setTmp]      = useState(null); // tmpToken from server
  const [code,     setCode]     = useState("");  // 6‑digit

  /* submit handler */
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (step === 1) {
        const res = await login(email, password);   // first call
        if (res?.need2FA) {                         // server says “need code”
          setTmp(res.tmp);
          setStep(2);
          toast.success("Enter your 6‑digit code");
          return;
        }
      } else {
        await login(null, null, code, tmp);         // step 2 login
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed");
      return;
    }
    // success → context now has user
  };

  /* already logged‑in? redirect */
  if (authReady && user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white p-6 rounded shadow space-y-4"
      >
        <h1 className="text-2xl font-semibold text-center">
          {step === 1 ? "Sign in" : "Two‑Factor Authentication"}
        </h1>

        {step === 1 ? (
          <>
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </>
        ) : (
          <input
            type="text"
            inputMode="numeric"
            pattern="\\d{6}"
            required
            placeholder="6‑digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full border rounded px-3 py-2 text-center tracking-widest"
          />
        )}

        <button
          type="submit"
          className="w-full bg-cyan-600 text-white py-2 rounded hover:bg-cyan-700"
        >
          {step === 1 ? "Next" : "Verify & Sign in"}
        </button>
      </form>
    </div>
  );
}
