/*====================================================
  SERVER  (auth.routes.cjs)
====================================================*/
const express    = require("express");
const jwt        = require("jsonwebtoken");
const bcrypt     = require("bcryptjs");
const speakeasy  = require("speakeasy");
const qrcode     = require("qrcode");
const pool       = require("./db.js"); // Your database connection pool
const router     = express.Router();

// Define your JWT secret keys
// IMPORTANT: These should be stored as environment variables and kept secret!
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET; // Using your existing JWT_SECRET for access token
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your_refresh_token_secret_here'; // NEW Secret for refresh tokens

/*────────────────────────────────────────────────────
  TOKEN Generation Utilities
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
  ISSUE COOKIES helper
────────────────────────────────────────────────────*/
// This function will now set both access and refresh tokens
async function issueAuthCookies(res, user) {
    const accessTokenPayload = {
        id: user.id,
        name: user.name,
        email: user.email,
        permissions: user.permissions, // This will now correctly be an array from the DB query
        mfa: user.totp_enabled, // Include actual MFA status from user object if available
    };

    const accessToken = generateAccessToken(accessTokenPayload);
    const refreshToken = generateRefreshToken({ id: user.id }); // Payload for refresh token is minimal

    // Store refresh token securely in your database
    // This is crucial for refresh token invalidation/revocation
    // You'll need to add a `refresh_token` column to your `users` table
    // or create a separate `refresh_tokens` table.
    // For now, let's assume a `refresh_token` column on the `users` table.
    try {
        await pool.query("UPDATE users SET refresh_token=$1 WHERE id=$2", [refreshToken, user.id]);
        console.log(`→ [Auth] Refresh token stored in DB for user ${user.id}`);
    } catch (dbErr) {
        console.error(`→ [Auth] ERROR: Failed to store refresh token for user ${user.id}:`, dbErr.message);
        // Do not block the login process for this, but log the error
    }


    // Set Access Token as HTTP-only, Secure, SameSite=None cookie
    // IMPORTANT: SameSite=None requires Secure=true. This is for cross-site cookie sending.
    res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // `secure: true` in production (HTTPS)
        sameSite: "None", // Changed from "Lax" to "None" for cross-site compatibility
        maxAge: 15 * 60 * 1000 // 15 minutes (matches accessToken expiry)
    });
    console.log('→ [Auth] AccessToken cookie set.');

    // Set Refresh Token as HTTP-only, Secure, SameSite=None cookie
    // IMPORTANT: SameSite=None requires Secure=true. This is for cross-site cookie sending.
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: "None", // Changed from "Lax" to "None"
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days (matches refreshToken expiry)
    });
    console.log('→ [Auth] RefreshToken cookie set.');

    // We no longer return the accessToken to the client body
}

/*────────────────────────────────────────────────────
  LOGIN  — Step 1
────────────────────────────────────────────────────*/
router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;
  console.log(`→ [Auth] Login attempt for email: ${email}`);
  try {
    // MODIFIED: Fetch permissions using JOINs
    const { rows } = await pool.query(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.password_hash,
        u.totp_enabled,
        COALESCE(
          json_agg(p.name) FILTER (WHERE p.name IS NOT NULL),
          '[]'
        ) AS permissions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE u.email = $1
      GROUP BY u.id, u.name, u.email, u.password_hash, u.totp_enabled;`,
      [email]
    );
    if (!rows.length) {
      console.log('→ [Auth] Login failed: Invalid credentials (user not found).');
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const user = rows[0]; // 'user' object now correctly contains the 'permissions' array
    console.log('→ [Auth] User found:', user.email, 'totp_enabled:', user.totp_enabled);


    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      console.log('→ [Auth] Login failed: Invalid credentials (password mismatch).');
      return res.status(401).json({ message: "Invalid credentials." });
    }
    console.log('→ [Auth] Password matched.');

    if (user.totp_enabled) {
      console.log('→ [Auth] 2FA enabled. Issuing temporary token.');
      // For 2FA enabled users, we still issue a temporary token for step 2 verification
      // The 'permissions' in this tmp token also comes from the 'user' object fetched above
      const tmp = jwt.sign(
        { id: user.id, step: "mfa", name: user.name, email: user.email, permissions: user.permissions },
        ACCESS_TOKEN_SECRET, // Using ACCESS_TOKEN_SECRET for tmp token
        { expiresIn: "5m" }
      );
      return res.json({ need2FA: true, tmp }); // Client needs this tmp token for step 2
    }

    /* ---------- main login success (without 2FA) ---------- */
    console.log('→ [Auth] 2FA not enabled. Issuing auth cookies.');
    // Use the new function to set both access and refresh cookies
    await issueAuthCookies(res, user);
    res.json({ message: "Logged in successfully!" }); // No token in body
  } catch (e) {
    console.error('→ [Auth] Login route error:', e.message);
    next(e);
  }
});


/*────────────────────────────────────────────────────
  LOGIN  — Step 2 (TOTP)
────────────────────────────────────────────────────*/
router.post("/login/step2", async (req, res, next) => {
  const { tmpToken, code } = req.body;
  console.log('→ [Auth] 2FA Step 2 verification attempt.');
  try {
    const decoded = jwt.verify(tmpToken, ACCESS_TOKEN_SECRET); // Using ACCESS_TOKEN_SECRET to verify tmpToken
    console.log('→ [Auth] Temporary token decoded. User ID:', decoded.id);
    if (decoded.step !== "mfa") {
      console.log('→ [Auth] Invalid step in temporary token.');
      return res.status(400).json({ message: "Invalid step" });
    }

    // MODIFIED: Fetch permissions using JOINs for 2FA verification
    const { rows } = await pool.query(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.totp_secret,
        COALESCE(
          json_agg(p.name) FILTER (WHERE p.name IS NOT NULL),
          '[]'
        ) AS permissions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE u.id = $1
      GROUP BY u.id, u.name, u.email, u.totp_secret;`, // Group by all non-aggregated columns
      [decoded.id]
    );
    if (!rows.length) {
        console.log('→ [Auth] User not found during 2FA step 2. Returning 400.');
        return res.status(400).json({ message: "User missing" });
    }
    const user = rows[0]; // 'user' object now correctly contains the 'permissions' array
    console.log('→ [Auth] User fetched for 2FA verification:', user.email);

    const verified = speakeasy.totp.verify({
      secret: user.totp_secret, // Use totp_secret from fetched user data
      encoding: "base32",
      token: code,
      window: 1,
    });
    if (!verified) {
        console.log('→ [Auth] 2FA code verification failed. Returning 401.');
        return res.status(401).json({ message: "Bad code" });
    }
    console.log('→ [Auth] 2FA code verified successfully.');

    // If 2FA is verified, issue proper access and refresh tokens
    await issueAuthCookies(res, user); // Pass the full user object with correct permissions
    res.json({ message: "Logged in successfully with 2FA!" }); // No token in body
  } catch (e) {
    console.error('→ [Auth] 2FA Step 2 route error:', e.message);
    next(e);
  }
});

/*────────────────────────────────────────────────────
  REFRESH TOKEN (NEW ROUTE)
────────────────────────────────────────────────────*/
router.post('/refresh-token', async (req, res) => {
    const refreshToken = req.cookies.refreshToken; // Get refresh token from cookie
    console.log('→ [Auth] Refresh token endpoint hit.');
    console.log('→ [Auth] Received refreshToken from cookie:', refreshToken ? 'YES (first few chars: ' + refreshToken.substring(0,10) + '...)' : 'NO');


    if (!refreshToken) {
        console.log('→ [Auth] No refresh token found in cookie. Returning 401.');
        return res.status(401).json({ message: 'Refresh token not found.' });
    }

    try {
        // Verify refresh token using its specific secret
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
        console.log('→ [Auth] Refresh token decoded successfully. User ID:', decoded.id);


        // Fetch user to ensure refresh token is valid and associated with them
        // This query was already updated and is correct.
        const { rows } = await pool.query(
          `SELECT
            u.id,
            u.name,
            u.email,
            u.password_hash,
            u.totp_enabled,
            u.refresh_token, -- Include refresh_token to validate against DB
            COALESCE(
              json_agg(p.name) FILTER (WHERE p.name IS NOT NULL),
              '[]'
            ) AS permissions -- Aggregate permission names into a JSON array
          FROM users u
          LEFT JOIN roles r ON u.role_id = r.id
          LEFT JOIN role_permissions rp ON r.id = rp.role_id
          LEFT JOIN permissions p ON rp.permission_id = p.id
          WHERE u.id = $1
          GROUP BY u.id, u.name, u.email, u.password_hash, u.totp_enabled, u.refresh_token;`, // Added u.refresh_token to GROUP BY
          [decoded.id]
        );
        if (!rows.length) {
            console.log('→ [Auth] User not found for decoded refresh token. Returning 403.');
            return res.status(403).json({ message: 'User not found for refresh token.' });
        }
        const user = rows[0]; // 'user' object now correctly contains the 'permissions' array
        console.log('→ [Auth] User fetched for refresh token validation:', user.email);

        // Validate if the refresh token from cookie matches the one stored in DB for this user
        if (user.refresh_token !== refreshToken) {
            console.log('→ [Auth] Mismatch: Refresh token from cookie does not match DB. Revoking all tokens. Returning 403.');
            // This could indicate token reuse or compromise. Invalidate all tokens for this user.
            await pool.query("UPDATE users SET refresh_token=NULL WHERE id=$1", [user.id]);
            res.clearCookie('accessToken');
            res.clearCookie('refreshToken');
            return res.status(403).json({ message: 'Invalid or revoked refresh token. Please re-login.' });
        }
        console.log('→ [Auth] Refresh token matched DB. Proceeding to issue new access token.');

        // Generate a new short-lived access token
        const newAccessTokenPayload = {
            id: user.id,
            name: user.name,
            email: user.email,
            permissions: user.permissions, // This will now correctly be an array from the DB query
            mfa: user.totp_enabled, // Assuming mfa status carries over
        };
        const newAccessToken = generateAccessToken(newAccessTokenPayload);

        // Optionally: Implement Refresh Token Rotation (generate a new refresh token too)
        // This enhances security by making stolen refresh tokens single-use.
        // If you enable this, remember to update the refresh token in the DB and set a new refresh cookie.
        // const newRefreshToken = generateRefreshToken({ id: user.id });
        // await pool.query("UPDATE users SET refresh_token=$1 WHERE id=$2", [newRefreshToken, user.id]);
        // res.cookie("refreshToken", newRefreshToken, {
        //     httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: "None", // Changed to None
        //     maxAge: 7 * 24 * 60 * 60 * 1000
        // });

        // Set the new access token as an HTTP-only cookie
        res.cookie('accessToken', newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'None', // Changed to None for broader compatibility
            maxAge: 15 * 60 * 1000 // Matches new accessToken expiry
        });

        console.log('→ [Auth] New access token granted. Refresh successful.');
        res.json({ message: 'New access token granted.' });

    } catch (err) {
        console.error('→ [Auth] Refresh token error:', err.message); // Log the error message
        // Clear cookies if refresh token is invalid or expired
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        // Return 401 if the token verification itself failed, otherwise 403 for other issues
        return res.status(err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' ? 401 : 403).json({ message: 'Invalid or expired refresh token. Please log in again.' });
    }
});


/*────────────────────────────────────────────────────
  2‑FA  Setup  (QR)
────────────────────────────────────────────────────*/
const { authenticateToken } = require("./auth.middleware.cjs");
router.post("/2fa/setup", authenticateToken, async (req, res, next) => {
  console.log('→ [Auth] 2FA Setup attempt for user:', req.user.id);
  try {
    const secret = speakeasy.generateSecret({ name: "Synthpify.ai" });
    await pool.query(
      "UPDATE users SET totp_secret=$1 WHERE id=$2",
      [secret.base32, req.user.id]
    );
    console.log('→ [Auth] TOTP secret saved for user:', req.user.id);
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ qr });
  } catch (e) {
    console.error('→ [Auth] 2FA Setup error:', e.message);
    next(e);
  }
});
/*────────────────────────────────────────────────────
  2‑FA  Enable  (confirm code)
────────────────────────────────────────────────────*/
router.post("/2fa/enable", authenticateToken, async (req, res, next) => {
  const { code } = req.body;
  console.log('→ [Auth] 2FA Enable attempt for user:', req.user.id);
  try {
    // This query is fine as it only fetches totp_secret
    const { rows } = await pool.query(
      "SELECT totp_secret FROM users WHERE id=$1",
      [req.user.id]
    );
    if (!rows.length) {
        console.log('→ [Auth] User not found for 2FA enable. Returning 400.');
        return res.status(400).json({ message: "User not found." });
    }
    const verified = speakeasy.totp.verify({
      secret: rows[0].totp_secret,
      encoding: "base32",
      token: code,
      window: 1,
    });
    if (!verified) {
        console.log('→ [Auth] 2FA enable code verification failed. Returning 400.');
        return res.status(400).json({ message: "Invalid code" });
    }

    await pool.query("UPDATE users SET totp_enabled=true WHERE id=$1", [
      req.user.id,
    ]);
    console.log('→ [Auth] 2FA enabled successfully for user:', req.user.id);
    res.sendStatus(204);
  } catch (e) {
    console.error('→ [Auth] 2FA Enable error:', e.message);
    next(e);
  }
});
/*────────────────────────────────────────────────────
  WHO AMI  (session probe)
────────────────────────────────────────────────────*/
router.get("/whoami", authenticateToken, (req, res) => {
  console.log('→ [Auth] WHOAMI endpoint hit. User:', req.user?.email);
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma":        "no-cache",
    "Expires":       "0",
    ETag:            false
  });

  // req.user.permissions will now be correctly populated by the JWT payload
  // which was created using the updated SQL queries in login/refresh routes.
  res.json({
    id:          req.user.id,
    name:        req.user.name,
    email:       req.user.email,
    permissions: req.user.permissions, // This should now be an array
    mfa:         req.user.mfa
  });
});

/*────────────────────────────────────────────────────
  LOGOUT
────────────────────────────────────────────────────*/
router.post("/logout", (req, res) => {
  console.log('→ [Auth] Logout attempt.');
  res.clearCookie("accessToken"); // Clear the new access token cookie
  res.clearCookie("refreshToken"); // Clear the new refresh token cookie
  // Invalidate refresh token in DB if possible (requires req.user.id or similar)
  // Example (if authenticateToken was used before logout):
  // if (req.user && req.user.id) {
  //    pool.query("UPDATE users SET refresh_token=NULL WHERE id=$1", [req.user.id]).catch(e => console.error("Failed to clear refresh token in DB:", e));
  // }
  console.log('→ [Auth] Cookies cleared. Returning 204.');
  res.sendStatus(204);
});

module.exports = router;
