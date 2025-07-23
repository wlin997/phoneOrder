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
  Constants for Account Lockout
────────────────────────────────────────────────────*/
const MAX_FAILED_ATTEMPTS = 5; // Max consecutive failed login attempts before lockout
const LOCKOUT_DURATION_MINUTES = 30; // How long an account is locked (in minutes)

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
  Rate Limiting Middleware (MODIFIED for Precedence)
────────────────────────────────────────────────────*/
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: {
    message: "Too many login attempts from this IP, please try again after 15 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
  // MODIFIED handler to check for account lockout first
  handler: async (req, res, next, options) => {
    const { email } = req.body;
    let user = null;
    if (email) {
      try {
        // Fetch only lockout_until to minimize DB load for this check
        const { rows } = await pool.query(
          "SELECT lockout_until FROM users WHERE email=$1",
          [email]
        );
        if (rows.length) {
          user = rows[0];
        }
      } catch (error) {
        console.error(`[RateLimitHandler] Error fetching user for lockout check: ${error.message}`);
        // If there's a DB error, fall back to default rate limit message
      }
    }

    if (user && user.lockout_until && new Date(user.lockout_until) > new Date()) {
      // If the account is locked, override the rate limit message with the lockout message
      const remainingTimeMs = new Date(user.lockout_until).getTime() - new Date().getTime();
      const remainingMinutes = Math.ceil(remainingTimeMs / (1000 * 60));
      console.log(`[RateLimitHandler] Account ${email} is locked and also hit IP rate limit. Returning lockout message.`);
      return res.status(423).json({ // 423 Locked status code
        message: `Account locked due to too many failed attempts. Please try again in ${remainingMinutes} minutes.`
      });
    } else {
      // If account is not locked, but IP rate limit is hit, return generic rate limit message
      console.log(`[RateLimit] IP ${req.ip} exceeded login rate limit (Max: ${options.max} requests in ${options.windowMs / 1000 / 60} minutes).`);
      res.status(options.statusCode).send(options.message);
    }
  },
});


/*────────────────────────────────────────────────────
  LOGIN  — Step 1 (MODIFIED: Account Lockout Logic)
────────────────────────────────────────────────────*/
router.post("/login", loginLimiter, async (req, res, next) => {
  console.log(`[Auth] Incoming login request from IP: ${req.ip}`);
  const { email, password } = req.body;
  try {
    // MODIFIED: Select new lockout columns
    const { rows } = await pool.query(
      "SELECT id, name, email, password_hash, totp_enabled, failed_login_attempts, lockout_until FROM users WHERE email=$1",
      [email]
    );

    if (!rows.length) {
      console.log(`[Auth] User not found for email: ${email}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = rows[0];

    // NEW: Check for account lockout (This check is also in the rate limit handler, but kept here for robustness
    // in case the rate limit is not applied or for direct access scenarios, e.g., if loginLimiter is removed)
    if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
      const remainingTimeMs = new Date(user.lockout_until).getTime() - new Date().getTime();
      const remainingMinutes = Math.ceil(remainingTimeMs / (1000 * 60));
      console.log(`[Auth] Account ${email} is locked until ${user.lockout_until}. Remaining: ${remainingMinutes} minutes.`);
      return res.status(423).json({ // 423 Locked status code
        message: `Account locked due to too many failed attempts. Please try again in ${remainingMinutes} minutes.`
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      console.log(`[Auth] Password mismatch for email: ${email}`);
      // NEW: Increment failed login attempts
      const newFailedAttempts = user.failed_login_attempts + 1;
      let newLockoutUntil = null;
      let lockoutMessage = "Invalid credentials";

      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        newLockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
        console.log(`[Auth] Account ${email} locked for ${LOCKOUT_DURATION_MINUTES} minutes.`);
        lockoutMessage = `Account locked due to too many failed attempts. Please try again in ${LOCKOUT_DURATION_MINUTES} minutes.`;
      }

      await pool.query(
        "UPDATE users SET failed_login_attempts = $1, lockout_until = $2 WHERE id = $3",
        [newFailedAttempts, newLockoutUntil, user.id]
      );

      return res.status(401).json({ message: lockoutMessage });
    }

    // NEW: On successful login, reset failed attempts and lockout status
    if (user.failed_login_attempts > 0 || user.lockout_until) {
      await pool.query(
        "UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = $1",
        [user.id]
      );
      console.log(`[Auth] Failed login attempts reset for ${email}.`);
    }

    const permissions = await getUserPermissions(user.id);

    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      permissions: permissions,
    };

    if (user.totp_enabled) {
      console.log(`[Auth] 2FA enabled for ${user.email}. Issuing temporary token.`);
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

    await pool.query("UPDATE users SET refresh_token = $1 WHERE id = $2", [refreshToken, user.id]);
    console.log(`[Auth] Login successful for ${user.email}. Tokens issued.`);

    res.json({ accessToken });
  } catch (e) {
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
