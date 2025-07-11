import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);   // calls /api/login and stores token
      navigate("/");                  // go to dashboard on success
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-md rounded p-6 w-80 space-y-4"
      >
        <h2 className="text-xl font-bold text-center">Sign in</h2>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full border rounded p-2"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full border rounded p-2"
          required
        />

        <button
          type="submit"
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded"
        >
          Log In
        </button>
      </form>
    </div>
  );
};

export default Login;
