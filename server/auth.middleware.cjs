// auth.middleware.cjs
const jwt  = require("jsonwebtoken");
const pool = require("./db.js");

/*────────────────────────────────────────────────────────────
  JWT Authentication (MODIFIED)
────────────────────────────────────────────────────────────*/
function authenticateToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  // DEBUG – BEGIN
  console.log("→ [auth] incoming:", req.method, req.originalUrl);
  console.log("→ [auth] header   :", header || "(none)");
  // DEBUG – END

  if (!token) {
    console.log("→ [auth] Missing access token in Authorization header.");
    return res.status(401).json({ message: "Missing access token" }); // More specific message
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log("→ [auth] invalid access token:", err.message);   // DEBUG // More specific message
      return res.status(401).json({ message: "Invalid access token" }); // More specific message
    }
    req.user = user;               // { id, email, permissions, ... }

    // DEBUG – BEGIN
    console.log("→ [auth] decoded   :", req.user);
    // DEBUG – END

    next();
  });
}

/*────────────────────────────────────────────────────────────
  Permission Guard (No Changes)
  Usage: router.get("/secure", requirePermission("manage_admin_settings"), …)
────────────────────────────────────────────────────────────*/
function requirePermission(permission) {
  return (req, res, next) => {
    // Normalize input: always treat as array
    const requiredPerms = Array.isArray(permission) ?
permission : [permission];
    const userPerms = req.user?.permissions || [];

    console.log("→ [auth] checking for perm(s):", requiredPerms);
    const hasPermission = requiredPerms.some((p) => userPerms.includes(p));
    if (!hasPermission) {
      console.log("→ [auth] ❌ missing permission");
      return res.status(403).json({ message: "Forbidden: Insufficient permissions" }); // Changed to 403 for permission denied
    }

    console.log("→ [auth] ✅ permission granted");
    next();
  };
}

module.exports = { authenticateToken, requirePermission };