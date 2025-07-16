/*====================================================
  SERVER  (auth.routes.cjs  — MODIFIED)
====================================================*/
const express    = require("express");
const jwt        = require("jsonwebtoken");
const bcrypt     = require("bcryptjs");
const speakeasy  = require("speakeasy");
const qrcode     = require("qrcode");
const pool       = require("./db.js"); // Your database connection pool [cite: 4]
const router     = express.Router();

// Define your JWT secret keys
// IMPORTANT: These should be stored as environment variables and kept secret!
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET; // Using your existing JWT_SECRET for access token
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your_refresh_token_secret_here'; // NEW Secret for refresh tokens

/*────────────────────────────────────────────────────
  TOKEN Generation Utilities (NEW/MODIFIED)
────────────────────────────────────────────────────*/
// Function to generate a short-lived access token
function generateAccessToken(payload) {
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, {
        expiresIn: "15m" // Short-lived, e.g., 15 minutes
    });
}

// Function to generate a long-lived refresh token
function generateRefreshToken(payload) {
    // Refresh token typically has minimal payload, just enough to identify the user
    return jwt.sign({ id: payload.id }, REFRESH_TOKEN_SECRET, {
        expiresIn: "7d" // Long-lived, e.g., 7 days
    });
}

/*────────────────────────────────────────────────────
  ISSUE COOKIES helper (MODIFIED)
────────────────────────────────────────────────────*/
// This function will now set both access and refresh tokens
async function issueAuthCookies(res, user) {
    const accessTokenPayload = {
        id: user.id,
        name: user.name,
        email: user.email,
        permissions: user.permissions,
        mfa: true, // Assuming mfa is true after successful login
    };

    const accessToken = generateAccessToken(accessTokenPayload);
    const refreshToken = generateRefreshToken({ id: user.id }); // Payload for refresh token is minimal

    // Store refresh token securely in your database
    // This is crucial for refresh token invalidation/revocation
    // You'll need to add a `refresh_token` column to your `users` table
    // or create a separate `refresh_tokens` table.
    // For now, let's assume a `refresh_token` column on the `users` table.
    await pool.query("UPDATE users SET refresh_token=$1 WHERE id=$2", [refreshToken, user.id]);

    // Set Access Token as HTTP-only, Secure, SameSite=Strict cookie
    res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // `secure: true` in production (HTTPS)
        sameSite: "strict",
        maxAge: 15 * 60 * 1000 // 15 minutes (matches accessToken expiry)
    });

    // Set Refresh Token as HTTP-only, Secure, SameSite=Strict cookie
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days (matches refreshToken expiry)
    });

    // We no longer return the accessToken to the client body
}

/*────────────────────────────────────────────────────
  LOGIN  — Step 1 (MODIFIED)
────────────────────────────────────────────────────*/
router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, password_hash, permissions, totp_enabled FROM users WHERE email=$1",
      [email]
    );
    if (!rows.length) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    if (user.totp_enabled) {
      // For 2FA enabled users, we still issue a temporary token for step 2 verification
      const tmp = jwt.sign(
        { id: user.id, step: "mfa", name: user.name, email: user.email, permissions: user.permissions },
        ACCESS_TOKEN_SECRET, // Using ACCESS_TOKEN_SECRET for tmp token
        { expiresIn: "5m" }
      );
      return res.json({ need2FA: true, tmp }); // Client needs this tmp token for step 2
    }

    /* ---------- main login success (without 2FA) ---------- */
    // Use the new function to set both access and refresh cookies
    await issueAuthCookies(res, user); // Make sure 'issueAuthCookies' handles the DB update for refresh token
    res.json({ message: "Logged in successfully!" }); // No token in body
  } catch (e) {
    next(e);
  }
});


/*────────────────────────────────────────────────────
  LOGIN  — Step 2 (TOTP) (MODIFIED)
────────────────────────────────────────────────────*/
router.post("/login/step2", async (req, res, next) => {
  const { tmpToken, code } = req.body;
  try {
    const decoded = jwt.verify(tmpToken, ACCESS_TOKEN_SECRET); // Using ACCESS_TOKEN_SECRET to verify tmpToken
    if (decoded.step !== "mfa") {
      return res.status(400).json({ message: "Invalid step" });
    }

    const { rows } = await pool.query(
      "SELECT id, name, email, totp_secret, permissions FROM users WHERE id=$1",
      [decoded.id]
    );
    if (!rows.length) {
        return res.status(400).json({ message: "User missing" });
    }
    const user = rows[0];

    const verified = speakeasy.totp.verify({
      secret: user.totp_secret, // Use totp_secret from fetched user data
      encoding: "base32",
      token: code,
      window: 1,
    });
    if (!verified) {
        return res.status(401).json({ message: "Bad code" });
    }

    // If 2FA is verified, issue proper access and refresh tokens
    await issueAuthCookies(res, user); // Pass the full user object
    res.json({ message: "Logged in successfully with 2FA!" }); // No token in body
  } catch (e) {
    next(e);
  }
});

/*────────────────────────────────────────────────────
  REFRESH TOKEN (NEW ROUTE)
────────────────────────────────────────────────────*/
router.post('/refresh-token', async (req, res) => {
    const refreshToken = req.cookies.refreshToken; // Get refresh token from cookie

    if (!refreshToken) {
        return res.status(401).json({ message: 'Refresh token not found.' });
    }

    try {
        // Verify refresh token using its specific secret
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

        // Fetch user to ensure refresh token is valid and associated with them
        const { rows } = await pool.query("SELECT id, name, email, permissions, refresh_token FROM users WHERE id=$1", [decoded.id]);
        if (!rows.length) {
            return res.status(403).json({ message: 'User not found for refresh token.' });
        }
        const user = rows[0];

        // Validate if the refresh token from cookie matches the one stored in DB for this user
        if (user.refresh_token !== refreshToken) {
            // This could indicate token reuse or compromise. Invalidate all tokens for this user.
            await pool.query("UPDATE users SET refresh_token=NULL WHERE id=$1", [user.id]);
            res.clearCookie('accessToken');
            res.clearCookie('refreshToken');
            return res.status(403).json({ message: 'Invalid or revoked refresh token. Please re-login.' });
        }

        // Generate a new short-lived access token
        const newAccessTokenPayload = {
            id: user.id,
            name: user.name,
            email: user.email,
            permissions: user.permissions,
            mfa: true, // Assuming mfa status carries over
        };
        const newAccessToken = generateAccessToken(newAccessTokenPayload);

        // Optionally: Implement Refresh Token Rotation (generate a new refresh token too)
        // This enhances security by making stolen refresh tokens single-use.
        // const newRefreshToken = generateRefreshToken({ id: user.id });
        // await pool.query("UPDATE users SET refresh_token=$1 WHERE id=$2", [newRefreshToken, user.id]);
        // res.cookie("refreshToken", newRefreshToken, {
        //     httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: "strict",
        //     maxAge: 7 * 24 * 60 * 60 * 1000
        // });

        // Set the new access token as an HTTP-only cookie
        res.cookie('accessToken', newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000 // Matches new accessToken expiry
        });

        res.json({ message: 'New access token granted.' });

    } catch (err) {
        console.error('Refresh token error:', err);
        // Clear cookies if refresh token is invalid or expired
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return res.status(403).json({ message: 'Invalid or expired refresh token. Please log in again.' });
    }
});


/*────────────────────────────────────────────────────
  2‑FA  Setup  (QR) (UNCHANGED)
────────────────────────────────────────────────────*/
const { authenticateToken } = require("./auth.middleware.cjs");
router.post("/2fa/setup", authenticateToken, async (req, res, next) => { // [cite: 14]
  try {
    const secret = speakeasy.generateSecret({ name: "Synthpify.ai" }); [cite: 3]
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
  2‑FA  Enable  (confirm code) (UNCHANGED) [cite: 15]
────────────────────────────────────────────────────*/
router.post("/2fa/enable", authenticateToken, async (req, res, next) => {
  const { code } = req.body;
  try {
    const { rows } = await pool.query(
      "SELECT totp_secret FROM users WHERE id=$1",
      [req.user.id]
    );
    const verified = speakeasy.totp.verify({ [cite: 3]
      secret: rows[0].totp_secret,
      encoding: "base32",
      token: code,
      window: 1,
    });
    if (!verified) {
        return res.status(400).json({ message: "Invalid code" }); [cite: 16]
    }

    await pool.query("UPDATE users SET totp_enabled=true WHERE id=$1", [
      req.user.id,
    ]);
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
});
/*────────────────────────────────────────────────────
  WHO AMI  (session probe) (UNCHANGED) [cite: 17]
────────────────────────────────────────────────────*/
router.get("/whoami", authenticateToken, (req, res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma":        "no-cache",
    "Expires":       "0",
    ETag:            false               // ← prevent 304 by disabling ETag
  });

  res.json({
    id:          req.user.id, [cite: 18]
    permissions: req.user.permissions, [cite: 18]
  });
});

/*────────────────────────────────────────────────────
  LOGOUT (MODIFIED)
────────────────────────────────────────────────────*/
router.post("/logout", (req, res) => {
  res.clearCookie("accessToken"); // Clear the new access token cookie
  res.clearCookie("refreshToken"); // Clear the new refresh token cookie
  // You might also want to invalidate the refresh token in the database here
  // await pool.query("UPDATE users SET refresh_token=NULL WHERE id=$1", [req.user.id]); // If you have req.user.id available
  res.sendStatus(204);
});

module.exports = router;