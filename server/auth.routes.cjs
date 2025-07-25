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
const axios      = require("axios");

const rateLimit = require("express-rate-limit");

/*────────────────────────────────────────────────────
  Constants for Account Lockout
────────────────────────────────────────────────────*/
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATIONS = [30, 60, 240, 1440, 10080];

/*────────────────────────────────────────────────────
  Constants for CAPTCHA
────────────────────────────────────────────────────*/
const CAPTCHA_REQUIRED_AFTER_ATTEMPTS = 3;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

/*────────────────────────────────────────────────────
  TOKEN Helpers
────────────────────────────────────────────────────*/
function issueAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "15m" });
}

function issueRefreshToken(res, payload) {
  const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, { expiresIn: "7d" });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   7 * 24 * 3600e3,
  });
  return refreshToken;
}

/*────────────────────────────────────────────────────
  Rate Limiting Middleware
────────────────────────────────────────────────────*/
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many login attempts from this IP, please try again after 15 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res, next, options) => {
    const { email } = req.body;
    let user = null;
    if (email) {
      try {
        const { rows } = await pool.query(
          "SELECT lockout_until, lockout_count FROM users WHERE email=$1",
          [email]
        );
        if (rows.length) {
          user = rows[0];
        }
      } catch (error) {
        console.error(`[RateLimitHandler] Error fetching user for lockout check: ${error.message}`);
      }
    }

    if (user && user.lockout_until && new Date(user.lockout_until) > new Date()) {
      const remainingTimeMs = new Date(user.lockout_until).getTime() - new Date().getTime();
      const remainingMinutes = Math.ceil(remainingTimeMs / (1000 * 60));
      return res.status(423).json({
        success: false,
        message: `Account locked due to too many failed attempts. Please try again in ${remainingMinutes} minutes.`
      });
    } else {
      return res.status(options.statusCode).json(options.message);
    }
  },
});

/*────────────────────────────────────────────────────
  LOGIN
────────────────────────────────────────────────────*/
router.post("/login", loginLimiter, async (req, res, next) => {
  const { email, password, recaptchaToken } = req.body;
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, password_hash, totp_enabled, failed_login_attempts, lockout_until, lockout_count FROM users WHERE email=$1",
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: "Invalid credentials", requiresCaptcha: false });
    }

    const user = rows[0];
    console.log(`[Auth Debug] Initial failed_login_attempts for ${user.email}: ${user.failed_login_attempts}`);

    if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
      const remainingTimeMs = new Date(user.lockout_until).getTime() - new Date().getTime();
      const remainingMinutes = Math.ceil(remainingTimeMs / (1000 * 60));
      return res.status(423).json({
        success: false,
        message: `Account locked due to too many failed attempts. Please try again in ${remainingMinutes} minutes.`
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      const newFailedAttempts = user.failed_login_attempts + 1;
      console.log(`[Auth Debug] Password mismatch. newFailedAttempts: ${newFailedAttempts}`);

      await pool.query(
        "UPDATE users SET failed_login_attempts = $1 WHERE id = $2",
        [newFailedAttempts, user.id]
      );
      console.log(`[Auth Debug] Database update for failed_login_attempts sent for ${user.email}.`);

      const updatedUserResult = await pool.query(
        "SELECT failed_login_attempts, lockout_until, lockout_count FROM users WHERE id=$1",
        [user.id]
      );
      const updatedUser = updatedUserResult.rows[0];
      console.log(`[Auth Debug] Re-fetched failed_login_attempts for ${user.email}: ${updatedUser.failed_login_attempts}`);

      let responseMessage = "Invalid credentials";
      let statusCode = 401;

      if (updatedUser.failed_login_attempts >= CAPTCHA_REQUIRED_AFTER_ATTEMPTS) {
        console.log(`[Auth Debug] CAPTCHA required. Current attempts: ${updatedUser.failed_login_attempts}`);
        responseMessage = "CAPTCHA verification required.";
        statusCode = 412;

        console.log(`[Auth Debug] Checking recaptchaToken for ${user.email}:`, { recaptchaToken });
        if (!recaptchaToken) {
          return res.status(statusCode).json({
            success: false,
            message: responseMessage,
            requiresCaptcha: true
          });
        }

        const googleResponse = await axios.post(
          "https://www.google.com/recaptcha/api/siteverify",
          new URLSearchParams({
            secret: RECAPTCHA_SECRET_KEY,
            response: recaptchaToken,
          }),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          }
        ).catch((error) => {
          console.error(`[Auth Debug] Error verifying reCAPTCHA for ${user.email}:`, error.message);
          return { data: { success: false } };
        });

        const { success: captchaSuccess, score } = googleResponse.data;
        console.log(`[Auth Debug] Full reCAPTCHA response for ${user.email}:`, googleResponse.data);

        if (!captchaSuccess) {
          console.log(`[Auth Debug] CAPTCHA verification failed for ${user.email}. Score: ${score || 'N/A'}`);
          responseMessage = "CAPTCHA verification failed. Please try again.";
          return res.status(412).json({ success: false, message: responseMessage, requiresCaptcha: true });
        }

        if (score !== undefined && score < 0.5) {
          console.log(`[Auth Debug] CAPTCHA score too low for ${user.email}. Score: ${score}`);
          responseMessage = "CAPTCHA score too low. Please try again.";
          return res.status(412).json({ success: false, message: responseMessage, requiresCaptcha: true });
        }

        console.log(`[Auth Debug] CAPTCHA verification successful for ${user.email}. Score: ${score || 'N/A'}`);
      }

      if (updatedUser.failed_login_attempts >= MAX_FAILED_ATTEMPTS) {
        let newLockoutUntil = null;
        let newLockoutCount = updatedUser.lockout_count + 1;
        const durationIndex = Math.min(newLockoutCount - 1, LOCKOUT_DURATIONS.length - 1);
        const lockoutDuration = LOCKOUT_DURATIONS[durationIndex];
        newLockoutUntil = new Date(Date.now() + lockoutDuration * 60 * 1000);
        responseMessage = `Account locked due to too many failed attempts. Please try again in ${lockoutDuration} minutes.`;

        await pool.query(
          "UPDATE users SET failed_login_attempts = 0, lockout_until = $1, lockout_count = $2 WHERE id = $3",
          [newLockoutUntil, newLockoutCount, user.id]
        );
        return res.status(401).json({ success: false, message: responseMessage });
      }

      return res.status(statusCode).json({
        success: false,
        message: responseMessage,
        requiresCaptcha: updatedUser.failed_login_attempts >= CAPTCHA_REQUIRED_AFTER_ATTEMPTS
      });
    }

    if (user.failed_login_attempts > 0 || user.lockout_until) {
      await pool.query(
        "UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = $1",
        [user.id]
      );
    }

    const permissions = await getUserPermissions(user.id);
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

    const accessToken = issueAccessToken(tokenPayload);
    const refreshToken = issueRefreshToken(res, { id: user.id });
    await pool.query("UPDATE users SET refresh_token = $1 WHERE id = $2", [refreshToken, user.id]);
    res.json({ success: true, accessToken });
  } catch (e) {
    console.error(`[Auth] Login error for email ${req.body.email}:`, e.message);
    next(e);
  }
});

/*────────────────────────────────────────────────────
  TOTP 2FA Login
────────────────────────────────────────────────────*/
router.post("/login/step2", async (req, res, next) => {
  const { tmpToken, code } = req.body;
  try {
    const decoded = jwt.verify(tmpToken, process.env.JWT_SECRET);
    if (decoded.step !== "mfa") return res.status(400).json({ message: "Invalid step" });

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

    res.json({ success: true, accessToken });
  } catch (e) {
    next(e);
  }
});

/*────────────────────────────────────────────────────
  Refresh Token
────────────────────────────────────────────────────*/
router.post("/refresh", async (req, res, next) => {
  const oldRefreshToken = req.cookies.refreshToken;
  if (!oldRefreshToken) return res.status(401).json({ message: "Refresh token required" });

  try {
    const decoded = jwt.verify(oldRefreshToken, process.env.REFRESH_SECRET);
    const userId = decoded.id;

    const { rows } = await pool.query("SELECT refresh_token FROM users WHERE id = $1", [userId]);
    if (!rows.length || rows[0].refresh_token !== oldRefreshToken) {
      await pool.query("UPDATE users SET refresh_token = NULL WHERE id = $1", [userId]);
      res.clearCookie("refreshToken");
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    await pool.query("UPDATE users SET refresh_token = NULL WHERE id = $1", [userId]);
    const userResult = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [userId]);
    if (!userResult.rows.length) {
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

    res.json({ success: true, accessToken: newAccessToken });
  } catch (e) {
    res.clearCookie("refreshToken");
    return res.status(401).json({ message: "Error refreshing token or refresh token invalid" });
  }
});

/*────────────────────────────────────────────────────
  2FA Setup & Enable
────────────────────────────────────────────────────*/
router.post("/2fa/setup", authenticateToken, async (req, res, next) => {
  try {
    const secret = speakeasy.generateSecret({ name: "Synthpify.ai" });
    await pool.query("UPDATE users SET totp_secret=$1 WHERE id=$2", [secret.base32, req.user.id]);
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ qr });
  } catch (e) {
    next(e);
  }
});

router.post("/2fa/enable", authenticateToken, async (req, res, next) => {
  const { code } = req.body;
  try {
    const { rows } = await pool.query("SELECT totp_secret FROM users WHERE id=$1", [req.user.id]);
    const verified = speakeasy.totp.verify({
      secret: rows[0].totp_secret,
      encoding: "base32",
      token: code,
      window: 1,
    });
    if (!verified) return res.status(400).json({ message: "Invalid code" });
    await pool.query("UPDATE users SET totp_enabled=true WHERE id=$1", [req.user.id]);
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
});

/*────────────────────────────────────────────────────
  WHOAMI
────────────────────────────────────────────────────*/
router.get("/whoami", authenticateToken, (req, res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache",
    "Expires": "0",
    ETag: false
  });
  res.json({
    id: req.user.id,
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
    res.sendStatus(204);
  } catch (e) {
    res.status(500).json({ message: "Logout failed" });
  }
});

module.exports = router;
