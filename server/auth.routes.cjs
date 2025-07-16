/*====================================================
  SERVER  (auth.routes.cjs  — MODIFIED)
====================================================*/
const express    = require("express"); [cite: 1]
const jwt        = require("jsonwebtoken"); [cite: 2]
const bcrypt     = require("bcryptjs"); [cite: 2]
const speakeasy  = require("speakeasy"); [cite: 3]
const qrcode     = require("qrcode"); [cite: 3]
const pool       = require("./db.js"); // Your database connection pool [cite: 4, 5]
const router     = express.Router(); [cite: 5]

// Define your JWT secret keys
// IMPORTANT: These should be stored as environment variables and kept secret! [cite: 6]
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET; // Using your existing JWT_SECRET for access token [cite: 7]
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your_refresh_token_secret_here'; // NEW Secret for refresh tokens [cite: 7, 8]

/*────────────────────────────────────────────────────
  TOKEN Generation Utilities (NEW/MODIFIED)
────────────────────────────────────────────────────*/
// Function to generate a short-lived access token
function generateAccessToken(payload) {
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, {
        expiresIn: "15m" // Short-lived, e.g., 15 minutes [cite: 9]
    });
}

// Function to generate a long-lived refresh token
function generateRefreshToken(payload) {
    // Refresh token typically has minimal payload, just enough to identify the user
    return jwt.sign({ id: payload.id }, REFRESH_TOKEN_SECRET, {
        expiresIn: "7d" // Long-lived, e.g., 7 days [cite: 10]
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
        // mfa: user.totp_enabled, // Include actual MFA status from user object if available
    }; [cite: 11]

    const accessToken = generateAccessToken(accessTokenPayload); [cite: 11]
    const refreshToken = generateRefreshToken({ id: user.id }); // Payload for refresh token is minimal [cite: 12]

    // Store refresh token securely in your database
    // This is crucial for refresh token invalidation/revocation
    // You'll need to add a `refresh_token` column to your `users` table
    // or create a separate `refresh_tokens` table.
    // For now, let's assume a `refresh_token` column on the `users` table. [cite: 13]
    await pool.query("UPDATE users SET refresh_token=$1 WHERE id=$2", [refreshToken, user.id]); [cite: 14]

    // Set Access Token as HTTP-only, Secure, SameSite=Strict cookie
    res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // `secure: true` in production (HTTPS)
        sameSite: "strict",
        maxAge: 15 * 60 * 1000 // 15 minutes (matches accessToken expiry)
    }); [cite: 14]

    // Set Refresh Token as HTTP-only, Secure, SameSite=Strict cookie
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', [cite: 15]
        sameSite: "strict", [cite: 15]
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days (matches refreshToken expiry) [cite: 15]
    });

    // We no longer return the accessToken to the client body [cite: 16]
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

    const ok = await bcrypt.compare(password, user.password_hash); [cite: 17]
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    if (user.totp_enabled) {
      // For 2FA enabled users, we still issue a temporary token for step 2 verification
      const tmp = jwt.sign(
        { id: user.id, step: "mfa", name: user.name, email: user.email, permissions: user.permissions },
        ACCESS_TOKEN_SECRET, // Using ACCESS_TOKEN_SECRET for tmp token [cite: 18]
        { expiresIn: "5m" } [cite: 18]
      );
      return res.json({ need2FA: true, tmp }); // Client needs this tmp token for step 2 [cite: 19]
    }

    /* ---------- main login success (without 2FA) ---------- */
    // Use the new function to set both access and refresh cookies
    await issueAuthCookies(res, user); [cite: 20]
    res.json({ message: "Logged in successfully!" }); // No token in body [cite: 21]
  } catch (e) {
    next(e);
  }
});


/*────────────────────────────────────────────────────
  LOGIN  — Step 2 (TOTP) (MODIFIED)
────────────────────────────────────────────────────*/
router.post("/login/step2", async (req, res, next) => { [cite: 22]
  const { tmpToken, code } = req.body;
  try {
    const decoded = jwt.verify(tmpToken, ACCESS_TOKEN_SECRET); // Using ACCESS_TOKEN_SECRET to verify tmpToken [cite: 22]
    if (decoded.step !== "mfa") { [cite: 22]
      return res.status(400).json({ message: "Invalid step" }); [cite: 22]
    }

    const { rows } = await pool.query(
      "SELECT id, name, email, totp_secret, permissions FROM users WHERE id=$1",
      [decoded.id]
    );
    if (!rows.length) { [cite: 23]
        return res.status(400).json({ message: "User missing" }); [cite: 23]
    }
    const user = rows[0]; [cite: 23]

    const verified = speakeasy.totp.verify({
      secret: user.totp_secret, // Use totp_secret from fetched user data [cite: 24]
      encoding: "base32", [cite: 24]
      token: code, [cite: 24]
      window: 1, [cite: 24]
    });
    if (!verified) { [cite: 24]
        return res.status(401).json({ message: "Bad code" }); [cite: 24]
    }

    // If 2FA is verified, issue proper access and refresh tokens
    await issueAuthCookies(res, user); // Pass the full user object [cite: 25]
    res.json({ message: "Logged in successfully with 2FA!" }); // No token in body [cite: 26]
  } catch (e) {
    next(e);
  }
});

/*────────────────────────────────────────────────────
  REFRESH TOKEN (NEW ROUTE)
────────────────────────────────────────────────────*/
router.post('/refresh-token', async (req, res) => { [cite: 27]
    const refreshToken = req.cookies.refreshToken; // Get refresh token from cookie [cite: 27]

    if (!refreshToken) { [cite: 27]
        return res.status(401).json({ message: 'Refresh token not found.' }); [cite: 27]
    }

    try {
        // Verify refresh token using its specific secret
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET); [cite: 28]

        // Fetch user to ensure refresh token is valid and associated with them [cite: 28]
        const { rows } = await pool.query("SELECT id, name, email, permissions, refresh_token FROM users WHERE id=$1", [decoded.id]); [cite: 28]
        if (!rows.length) { [cite: 28]
            return res.status(403).json({ message: 'User not found for refresh token.' }); [cite: 28]
        }
        const user = rows[0]; [cite: 28]

        // Validate if the refresh token from cookie matches the one stored in DB for this user [cite: 29]
        if (user.refresh_token !== refreshToken) { [cite: 29]
            // This could indicate token reuse or compromise. Invalidate all tokens for this user. [cite: 30]
            await pool.query("UPDATE users SET refresh_token=NULL WHERE id=$1", [user.id]); [cite: 31]
            res.clearCookie('accessToken'); [cite: 31]
            res.clearCookie('refreshToken'); [cite: 31]
            return res.status(403).json({ message: 'Invalid or revoked refresh token. Please re-login.' }); [cite: 31]
        }

        // Generate a new short-lived access token
        const newAccessTokenPayload = {
            id: user.id, [cite: 33]
            name: user.name, [cite: 33]
            email: user.email, [cite: 33]
            permissions: user.permissions, [cite: 33]
            mfa: user.totp_enabled, // Assuming mfa status carries over [cite: 33]
        };
        const newAccessToken = generateAccessToken(newAccessTokenPayload); [cite: 33]

        // Optionally: Implement Refresh Token Rotation (generate a new refresh token too) [cite: 34]
        // This enhances security by making stolen refresh tokens single-use. [cite: 34]
        // If you enable this, remember to update the refresh token in the DB and set a new refresh cookie.
        // const newRefreshToken = generateRefreshToken({ id: user.id }); [cite: 34]
        // await pool.query("UPDATE users SET refresh_token=$1 WHERE id=$2", [newRefreshToken, user.id]); [cite: 35]
        // res.cookie("refreshToken", newRefreshToken, { [cite: 35]
        //     httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: "strict", [cite: 35]
        //     maxAge: 7 * 24 * 60 * 60 * 1000 [cite: 35]
        // });

        // Set the new access token as an HTTP-only cookie [cite: 36]
        res.cookie('accessToken', newAccessToken, {
            httpOnly: true, [cite: 36]
            secure: process.env.NODE_ENV === 'production', [cite: 36]
            sameSite: 'strict', [cite: 36]
            maxAge: 15 * 60 * 1000 // Matches new accessToken expiry [cite: 36]
        });

        res.json({ message: 'New access token granted.' }); [cite: 37]

    } catch (err) {
        console.error('Refresh token error:', err); [cite: 38]
        // Clear cookies if refresh token is invalid or expired [cite: 38]
        res.clearCookie('accessToken'); [cite: 39]
        res.clearCookie('refreshToken'); [cite: 39]
        return res.status(403).json({ message: 'Invalid or expired refresh token. Please log in again.' }); [cite: 39]
    }
});


/*────────────────────────────────────────────────────
  2‑FA  Setup  (QR) (UNCHANGED)
────────────────────────────────────────────────────*/
const { authenticateToken } = require("./auth.middleware.cjs"); [cite: 40]
router.post("/2fa/setup", authenticateToken, async (req, res, next) => { // [cite: 41]
  try {
    const secret = speakeasy.generateSecret({ name: "Synthpify.ai" }); [cite: 3]
    await pool.query(
      "UPDATE users SET totp_secret=$1 WHERE id=$2",
      [secret.base32, req.user.id]
    );
    const qr = await qrcode.toDataURL(secret.otpauth_url); [cite: 41]
    res.json({ qr }); [cite: 41]
  } catch (e) {
    next(e);
  }
});
/*────────────────────────────────────────────────────
  2‑FA  Enable  (confirm code) (UNCHANGED)
────────────────────────────────────────────────────*/
router.post("/2fa/enable", authenticateToken, async (req, res, next) => { [cite: 42]
  const { code } = req.body; [cite: 42]
  try {
    const { rows } = await pool.query(
      "SELECT totp_secret FROM users WHERE id=$1",
      [req.user.id]
    );
    const verified = speakeasy.totp.verify({ [cite: 43]
      secret: rows[0].totp_secret, [cite: 43]
      encoding: "base32", [cite: 43]
      token: code, [cite: 43]
      window: 1, [cite: 43]
    });
    if (!verified) { [cite: 43]
        return res.status(400).json({ message: "Invalid code" }); [cite: 43]
    }

    await pool.query("UPDATE users SET totp_enabled=true WHERE id=$1", [
      req.user.id,
    ]); [cite: 43]
    res.sendStatus(204); [cite: 43]
  } catch (e) {
    next(e);
  }
});
/*────────────────────────────────────────────────────
  WHO AMI  (session probe) (UNCHANGED)
────────────────────────────────────────────────────*/
router.get("/whoami", authenticateToken, (req, res) => { [cite: 44]
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private", [cite: 44]
    "Pragma":        "no-cache", [cite: 44]
    "Expires":       "0", [cite: 44]
    ETag:            false               // ← prevent 304 by disabling ETag [cite: 44]
  });

  // Ensure all necessary user fields are sent back, including 'name'
  res.json({
    id:          req.user.id, [cite: 45]
    name:        req.user.name, // NEW: Include name
    email:       req.user.email, // NEW: Include email
    permissions: req.user.permissions, [cite: 45]
    mfa:         req.user.mfa // NEW: Include mfa status if available in token payload
  });
});

/*────────────────────────────────────────────────────
  LOGOUT (MODIFIED)
────────────────────────────────────────────────────*/
router.post("/logout", (req, res) => { [cite: 46]
  res.clearCookie("accessToken"); // Clear the new access token cookie [cite: 46]
  res.clearCookie("refreshToken"); // Clear the new refresh token cookie [cite: 46]
  // Invalidate refresh token in DB if possible (requires req.user.id or similar)
  // Example (if authenticateToken was used before logout):
  // if (req.user && req.user.id) {
  //    pool.query("UPDATE users SET refresh_token=NULL WHERE id=$1", [req.user.id]).catch(e => console.error("Failed to clear refresh token in DB:", e));
  // }
  res.sendStatus(204); [cite: 46]
});

module.exports = router; [cite: 47]