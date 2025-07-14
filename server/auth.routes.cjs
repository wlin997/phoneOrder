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

/*────────────────────────────────────────────────────
  COOKIE helper
────────────────────────────────────────────────────*/
function issueCookie(res, payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "24h",
  });
  res.cookie("access", token, {
    httpOnly: true,
    secure:   true,
    sameSite: "strict",
    maxAge:   24 * 3600e3,
  });
  return token;
}

/*────────────────────────────────────────────────────
  LOGIN  — Step 1
────────────────────────────────────────────────────*/
router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );
    if (!rows.length) return res.status(401).json({ message: "Invalid" });

    const user = rows[0];
    const ok   = await bcrypt.compare(password, user.password_hash);
    if (!ok)   return res.status(401).json({ message: "Invalid" });

    if (user.totp_enabled) {
      const tmp = jwt.sign(
        { id: user.id, step: "mfa" },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );
      return res.json({ need2FA: true, tmp });
    }

    issueCookie(res, {
      id: user.id,
      permissions: user.permissions,
      mfa: true,
    });
    res.json({ ok: true });
  } catch (e) {
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
      "SELECT totp_secret, permissions FROM users WHERE id=$1",
      [decoded.id]
    );
    if (!rows.length) return res.status(400).json({ message: "User missing" });

    const { totp_secret, permissions } = rows[0];
    const verified = speakeasy.totp.verify({
      secret: totp_secret,
      encoding: "base32",
      token: code,
      window: 1,
    });
    if (!verified) return res.status(401).json({ message: "Bad code" });

    issueCookie(res, { id: decoded.id, permissions, mfa: true });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/*────────────────────────────────────────────────────
  2‑FA  Setup  (QR)
────────────────────────────────────────────────────*/
const { authenticateToken } = require("./auth.middleware.cjs");

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
    if (!verified) return res.status(400).json({ message: "Invalid code" });

    await pool.query("UPDATE users SET totp_enabled=true WHERE id=$1", [
      req.user.id,
    ]);
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
});

/*────────────────────────────────────────────────────
  WHO AMI  (session probe)   ← ADDED
────────────────────────────────────────────────────*/
router.get("/whoami", authenticateToken, (req, res) => {
  res.set("Cache-Control", "no-store");          // <- prevent 304 caching
  res.json({
    id:          req.user.id,
    permissions: req.user.permissions,
  });
});

/*────────────────────────────────────────────────────
  LOGOUT
────────────────────────────────────────────────────*/
router.post("/logout", (req, res) => {
  res.clearCookie("access");
  res.sendStatus(204);
});

module.exports = router;
