const express    = require("express");
const jwt        = require("jsonwebtoken");
const bcrypt     = require("bcryptjs");
const speakeasy  = require("speakeasy");
const qrcode     = require("qrcode");
const pool       = require("./db.js");
const router     = express.Router();

const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your_refresh_token_secret_here';

function generateAccessToken(payload) {
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
}

function generateRefreshToken(payload) {
    return jwt.sign({ id: payload.id }, REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
}

async function issueAuthCookies(req, res, user) {
    const accessTokenPayload = {
        id: user.id,
        name: user.name,
        email: user.email,
        permissions: user.permissions,
        mfa: user.totp_enabled,
    };

    const accessToken = generateAccessToken(accessTokenPayload);
    const refreshToken = generateRefreshToken({ id: user.id });

    try {
        await pool.query("UPDATE users SET refresh_token=$1 WHERE id=$2", [refreshToken, user.id]);
        console.log(`→ [Auth] Refresh token stored in DB for user ${user.id}`);
    } catch (dbErr) {
        console.error(`→ [Auth] ERROR storing refresh token:`, dbErr.message);
    }

    const cookieDomain = req.app?.locals?.cookieDomain || 'localhost';

    res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        domain: cookieDomain,
        maxAge: 15 * 60 * 1000
    });
    console.log('→ [Auth] AccessToken cookie set.');

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        domain: cookieDomain,
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    console.log('→ [Auth] RefreshToken cookie set.');
}

router.post("/login", async (req, res, next) => {
    const { email, password } = req.body;
    console.log(`→ [Auth] Login attempt for email: ${email}`);
    try {
        const { rows } = await pool.query(`
            SELECT u.id, u.name, u.email, u.password_hash, u.totp_enabled,
            COALESCE(json_agg(p.name) FILTER (WHERE p.name IS NOT NULL), '[]') AS permissions
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE u.email = $1
            GROUP BY u.id, u.name, u.email, u.password_hash, u.totp_enabled;
        `, [email]);

        if (!rows.length) return res.status(401).json({ message: "Invalid credentials." });

        const user = rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(401).json({ message: "Invalid credentials." });

        if (user.totp_enabled) {
            const tmp = jwt.sign(
                { id: user.id, step: "mfa", name: user.name, email: user.email, permissions: user.permissions },
                ACCESS_TOKEN_SECRET, { expiresIn: "5m" }
            );
            return res.json({ need2FA: true, tmp });
        }

        await issueAuthCookies(req, res, user);
        res.json({ message: "Logged in successfully!" });
    } catch (e) {
        console.error('→ [Auth] Login route error:', e.message);
        next(e);
    }
});

router.post("/login/step2", async (req, res, next) => {
    const { tmpToken, code } = req.body;
    try {
        const decoded = jwt.verify(tmpToken, ACCESS_TOKEN_SECRET);
        if (decoded.step !== "mfa") return res.status(400).json({ message: "Invalid step" });

        const { rows } = await pool.query(`
            SELECT u.id, u.name, u.email, u.totp_secret,
            COALESCE(json_agg(p.name) FILTER (WHERE p.name IS NOT NULL), '[]') AS permissions
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE u.id = $1
            GROUP BY u.id, u.name, u.email, u.totp_secret;
        `, [decoded.id]);

        if (!rows.length) return res.status(400).json({ message: "User missing" });
        const user = rows[0];

        const verified = speakeasy.totp.verify({
            secret: user.totp_secret,
            encoding: "base32",
            token: code,
            window: 1,
        });

        if (!verified) return res.status(401).json({ message: "Bad code" });

        await issueAuthCookies(req, res, user);
        res.json({ message: "Logged in successfully with 2FA!" });
    } catch (e) {
        console.error('→ [Auth] 2FA Step 2 route error:', e.message);
        next(e);
    }
});

router.post('/refresh-token', async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    console.log('→ [Auth] Refresh token endpoint hit.');
    if (!refreshToken) return res.status(401).json({ message: 'Refresh token not found.' });

    try {
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

        const { rows } = await pool.query(`
            SELECT u.id, u.name, u.email, u.password_hash, u.totp_enabled, u.refresh_token,
            COALESCE(json_agg(p.name) FILTER (WHERE p.name IS NOT NULL), '[]') AS permissions
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE u.id = $1
            GROUP BY u.id, u.name, u.email, u.password_hash, u.totp_enabled, u.refresh_token;
        `, [decoded.id]);

        if (!rows.length) return res.status(403).json({ message: 'User not found for refresh token.' });

        const user = rows[0];
        if (user.refresh_token !== refreshToken) {
            await pool.query("UPDATE users SET refresh_token=NULL WHERE id=$1", [user.id]);
            res.clearCookie('accessToken');
            res.clearCookie('refreshToken');
            return res.status(403).json({ message: 'Invalid or revoked refresh token. Please re-login.' });
        }

        const newAccessToken = generateAccessToken({
            id: user.id,
            name: user.name,
            email: user.email,
            permissions: user.permissions,
            mfa: user.totp_enabled
        });

        const cookieDomain = req.app?.locals?.cookieDomain || 'localhost';

        res.cookie('accessToken', newAccessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'None',
            domain: cookieDomain,
            maxAge: 15 * 60 * 1000
        });

        console.log('→ [Auth] New access token granted. Refresh successful.');
        res.json({ message: 'New access token granted.' });

    } catch (err) {
        console.error('→ [Auth] Refresh token error:', err.message);
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return res.status(err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' ? 401 : 403).json({ message: 'Invalid or expired refresh token. Please log in again.' });
    }
});

const { authenticateToken } = require("./auth.middleware.cjs");

router.get("/whoami", authenticateToken, (req, res) => {
    res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0",
        ETag: false
    });

    res.json({
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        permissions: req.user.permissions,
        mfa: req.user.mfa
    });
});

router.post("/logout", (req, res) => {
    console.log('→ [Auth] Logout attempt.');
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    console.log('→ [Auth] Cookies cleared. Returning 204.');
    res.sendStatus(204);
});

module.exports = router;
