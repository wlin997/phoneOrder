// auth.middleware.cjs
const jwt  = require("jsonwebtoken");
const pool = require("./db.js");

/*────────────────────────────────────────────────────────────
  JWT Authentication
────────────────────────────────────────────────────────────*/
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const tokenFromHeader = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const tokenFromCookie = req.cookies?.accessToken || null;

  const token = tokenFromHeader || tokenFromCookie;

  if (!token) {
    return res.status(401).json({ message: "Missing access token" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ message: "Invalid access token" });
    }

    req.user = user; // e.g., { id, email, permissions }
    next();
  });
}

/*────────────────────────────────────────────────────────────
  Permission Guard
  Usage: router.get("/secure", requirePermission("manage_admin_settings"), …)
────────────────────────────────────────────────────────────*/
function requirePermission(permission) {
  return (req, res, next) => {
    // Normalize input: always treat as array
    const requiredPerms = Array.isArray(permission) ? permission : [permission];
    const userPerms = req.user?.permissions || [];

    // console.log removed: "→ [auth] checking for perm(s):", requiredPerms

    const hasPermission = requiredPerms.some((p) => userPerms.includes(p));
    if (!hasPermission) {
      // console.log removed: "→ [auth] ❌ missing permission"
      return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
    }

    // console.log removed: "→ [auth] ✅ permission granted"
    next();
  };
}

module.exports = { authenticateToken, requirePermission };
