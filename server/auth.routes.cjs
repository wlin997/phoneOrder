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
const { authenticateToken } = require("./auth.middleware.cjs"); // Import here for logout and 2FA setup/enable
const { getUserPermissions } = require("./rbac.service.cjs"); // Import rbac service for permissions

/*────────────────────────────────────────────────────
  TOKEN Helpers (NEW/MODIFIED)
────────────────────────────────────────────────────*/
// Helper to issue access token (for client-side Authorization header)
function issueAccessToken(payload) {
  // Access tokens should be relatively short-lived (e.g., 15-30 minutes)
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "15m" });
}

// Helper to issue refresh token (for httpOnly cookie)
function issueRefreshToken(res, payload) {
  // Refresh tokens are longer-lived (e.g., 7 days or more)
  const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, { expiresIn: "7d" });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production", // Use secure in production
    sameSite: "strict",
    maxAge:   7 * 24 * 3600e3, // 7 days in milliseconds
  });
  return refreshToken;
}

/*────────────────────────────────────────────────────
  LOGIN  — Step 1 (MODIFIED with Debug Logs)
────────────────────────────────────────────────────*/
router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;
  console.log(`[Auth] Login attempt for email: ${email}`); // DEBUG: Log incoming email
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, password_hash, totp_enabled FROM users WHERE email=$1",
      [email]
    );

    if (!rows.length) {
      console.log(`[Auth] User not found for email: ${email}`); // DEBUG: Log if user not found
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = rows[0];
    console.log(`[Auth] User found: ${user.email}, comparing password...`); // DEBUG: Log user found
    // console.log(`[Auth] Stored hash: ${user.password_hash}`); // DANGER: Do NOT log in production!
    // console.log(`[Auth] Provided password: ${password}`); // DANGER: Do NOT log in production!

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      console.log(`[Auth] Password mismatch for email: ${email}`); // DEBUG: Log password mismatch
      return res.status(401).json({ message: "Invalid credentials" });
    }
    console.log(`[Auth] Password matched for email: ${email}`); // DEBUG: Log password match

    // Fetch permissions dynamically for the access token payload
    const permissions = await getUserPermissions(user.id);
    console.log(`[Auth] Permissions fetched for ${user.email}:`, permissions); // DEBUG: Log permissions

    // Payload for both tokens
    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      permissions: permissions, // Include permissions in access token
    };

    if (user.totp_enabled) {
      console.log(`[Auth] 2FA enabled for ${user.email}. Issuing temporary token.`); // DEBUG: Log 2FA path
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
    console.log(`[Auth] Login successful for ${user.email}. Tokens issued.`); // DEBUG: Final success log

    res.json({ accessToken });
  } catch (e) {
    console.error(`[Auth] Login error for email ${req.body.email}:`, e.message); // DEBUG: Log general error
    next(e); // Pass error to Express error handler
  }
});


/*────────────────────────────────────────────────────
  LOGIN  — Step 2 (TOTP) (MODIFIED)
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

    // Fetch permissions dynamically for the final token
    const permissions = await getUserPermissions(decoded.id);

    const tokenPayload = {
      id: decoded.id,
      name: decoded.name,
      email: decoded.email,
      permissions: permissions,
    };

    const accessToken = issueAccessToken(tokenPayload);
    const refreshToken = issueRefreshToken(res, { id: decoded.id });

    // Store refresh token in DB
    await pool.query("UPDATE users SET refresh_token = $1 WHERE id = $2", [refreshToken, decoded.id]);

    res.json({ accessToken });
  } catch (e) {
    next(e);
  }
});

/*────────────────────────────────────────────────────
  REFRESH TOKEN (NEW ENDPOINT)
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
  LOGOUT (MODIFIED)
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
