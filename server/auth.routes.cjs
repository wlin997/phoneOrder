/*====================================================
  SERVER  (auth.routes.cjs  — NEW ROUTER)
====================================================*/
const express    = require("express");
const jwt        = require("jsonwebtoken");
const bcrypt     = require("bcryptjs");
const speakeasy  = require("speakeasy");
const qrcode     = require("qrcode");
const pool       = require("./db.js");
const router     = express.Router();
const { authenticateToken } = require("./auth.middleware.cjs");
const { getUserPermissions } = require("./rbac.service.cjs");

// NEW: Import express-rate-limit
const rateLimit = require("express-rate-limit");

/*────────────────────────────────────────────────────
  TOKEN Helpers
────────────────────────────────────────────────────*/
// Helper to issue access token (for client-side Authorization header)
function issueAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "15m" });
}

// Helper to issue refresh token (for httpOnly cookie)
function issueRefreshToken(res, payload) {
  const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, { expiresIn: "7d" });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   7 * 24 * 3600e3, // 7 days in milliseconds
  });
  return refreshToken;
}

/*────────────────────────────────────────────────────
  Rate Limiting Middleware (NEW)
────────────────────────────────────────────────────*/
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: {
    message: "Too many login attempts from this IP, please try again after 15 minutes."
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // You can add a `store` option here if you need a persistent store (e.g., Redis)
  // For a single Render instance, the default in-memory store is usually fine.
});


/*────────────────────────────────────────────────────
  LOGIN  — Step 1 (MODIFIED: Apply Rate Limiter)
────────────────────────────────────────────────────*/
router.post("/login", loginLimiter, async (req, res, next) => { // Apply loginLimiter here
  const { email, password } = req.body;
  // Removed all previous DEBUG console.log statements
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, password_hash, totp_enabled FROM users WHERE email=$1",
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Fetch permissions dynamically for the access token payload
    const permissions = await getUserPermissions(user.id);

    // Payload for both tokens
    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      permissions: permissions,
    };

    if (user.totp_enabled) {
      const tmp = jwt.sign(
        { id: user.id, step: "mfa", permissions: permissions, name: user.name, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );
      return res.json({ need2FA: true, tmp });
    }

    /* ---------- main login success ---------- */
    const accessToken = issueAccessToken(tokenPayload);
    const refreshToken = issueRefreshToken(res, { id: user.id });

    // Store refresh token in DB
    await pool.query("UPDATE users SET refresh_token = $1 WHERE id = $2", [refreshToken, user.id]);

    res.json({ accessToken });
  } catch (e) {
    // Keep this error log for general unexpected errors
    console.error(`[Auth] Login error for email ${req.body.email}:`, e.message);
    next(e);
  }
});


/*────────────────────────────────────────────────────
  LOGIN  — Step 2 (TOTP)
────────────────────────────────────────────────────*/
router.post("/login/step2", async (req, res, next) => {
  const { tmpToken, code } = req.body;
  try {
    const decoded = jwt.verify(tmpToken, process.env.JWT_SECRET);
    if (decoded.step !== "mfa") {
      return res.status(400).json({ message: "Invalid step" });
    }

    const { rows } = await pool.query(
      "SELECT totp_secret FROM users WHERE id=$1",
      [decoded.id]
    );
    if (!rows.length) return res.status(400).json({ message: "User missing" });

    const { totp_secret } = rows[0];
    const verified = speakeasy.totp.verify({
      secret: totp_secret,
      encoding: "base32",
      token: code,
      window: 1,
    });
    if (!verified) return res.status(401).json({ message: "Bad code" });

    const permissions = await getUserPermissions(decoded.id);

    const tokenPayload = {
      id: decoded.id,
      name: decoded.name,
      email: decoded.email,
      permissions: permissions,
    };

    const accessToken = issueAccessToken(tokenPayload);
    const refreshToken = issueRefreshToken(res, { id: decoded.id });

    await pool.query("UPDATE users SET refresh_token = $1 WHERE id = $2", [refreshToken, decoded.id]);

    res.json({ accessToken });
  } catch (e) {
    next(e);
  }
});

/*────────────────────────────────────────────────────
  REFRESH TOKEN
────────────────────────────────────────────────────*/
router.post("/refresh", async (req, res, next) => {
  const oldRefreshToken = req.cookies.refreshToken;

  if (!oldRefreshToken) {
    console.log("→ [Auth] Refresh token missing from cookie.");
    return res.status(401).json({ message: "Refresh token required" });
  }

  try {
    const decoded = jwt.verify(oldRefreshToken, process.env.REFRESH_SECRET);
    const userId = decoded.id;

    const { rows } = await pool.query("SELECT refresh_token FROM users WHERE id = $1", [userId]);
    if (!rows.length || rows[0].refresh_token !== oldRefreshToken) {
      console.log("→ [Auth] Invalid or mismatched refresh token in DB.");
      await pool.query("UPDATE users SET refresh_token = NULL WHERE id = $1", [userId]);
      res.clearCookie("refreshToken");
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    await pool.query("UPDATE users SET refresh_token = NULL WHERE id = $1", [userId]);

    const userResult = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [userId]);
    if (!userResult.rows.length) {
        console.log("→ [Auth] User not found during refresh.");
        res.clearCookie("refreshToken");
        return res.status(401).json({ message: "User not found" });
    }
    const user = userResult.rows[0];
    const permissions = await getUserPermissions(user.id);

    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      permissions: permissions,
    };

    const newAccessToken = issueAccessToken(tokenPayload);
    const newRefreshToken = issueRefreshToken(res, { id: user.id });

    await pool.query("UPDATE users SET refresh_token = $1 WHERE id = $2", [newRefreshToken, user.id]);

    console.log("→ [Auth] Token refreshed successfully for user:", userId);
    res.json({ accessToken: newAccessToken });
  } catch (e) {
    console.error("→ [Auth] Error refreshing token:", e.message);
    res.clearCookie("refreshToken");
    return res.status(401).json({ message: "Error refreshing token or refresh token invalid" });
  }
});

/*────────────────────────────────────────────────────
  2‑FA  Setup  (QR)
────────────────────────────────────────────────────*/
router.post("/2fa/setup", authenticateToken, async (req, res, next) => {
  try {
    const secret = speakeasy.generateSecret({ name: "Synthpify.ai" });
    await pool.query(
      "UPDATE users SET totp_secret=$1 WHERE id=$2",
      [secret.base32, req.user.id]
    );
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ qr });
  } catch (e) {
    next(e);
  }
});
/*────────────────────────────────────────────────────
  2‑FA  Enable  (confirm code)
────────────────────────────────────────────────────*/
router.post("/2fa/enable", authenticateToken, async (req, res, next) => {
  const { code } = req.body;
  try {
    const { rows } = await pool.query(
      "SELECT totp_secret FROM users WHERE id=$1",
      [req.user.id]
    );
    const verified = speakeasy.totp.verify({
      secret: rows[0].totp_secret,
      encoding: "base32",
      token: code,
      window: 1,
    });
    if (!verified)
return res.status(400).json({ message: "Invalid code" });

    await pool.query("UPDATE users SET totp_enabled=true WHERE id=$1", [
      req.user.id,
    ]);
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
});
/*────────────────────────────────────────────────────
  WHO AMI  (session probe)
────────────────────────────────────────────────────*/
router.get("/whoami", authenticateToken, (req, res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma":        "no-cache",
    "Expires":       "0",
    ETag:            false
  });

  res.json({
    id:          req.user.id,
    permissions: req.user.permissions,
  });
});

/*────────────────────────────────────────────────────
  LOGOUT
────────────────────────────────────────────────────*/
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    await pool.query("UPDATE users SET refresh_token = NULL WHERE id = $1", [req.user.id]);
    res.clearCookie("refreshToken");
    console.log("→ [Auth] Logout successful. Cookies cleared and DB token removed.");
    res.sendStatus(204);
  } catch (e) {
    console.error("→ [Auth] Error during logout:", e.message);
    res.status(500).json({ message: "Logout failed" });
  }
});

module.exports = router;
