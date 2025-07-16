// auth.middleware.cjs
const jwt  = require("jsonwebtoken");
const pool = require("./db.js");
/*────────────────────────────────────────────────────────────
  JWT Authentication
────────────────────────────────────────────────────────────*/
function authenticateToken(req, res, next) {
  let token = null;

  // 1. Try to get token from httpOnly cookie
  if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
      console.log("→ [auth] Token found in cookie.");
  }

  // 2. Fallback: Try to get token from Authorization header
  const header = req.headers.authorization || "";
  if (!token && header.startsWith("Bearer ")) {
      token = header.slice(7);
      console.log("→ [auth] Token found in header.");
  }

  // DEBUG – BEGIN
  console.log("→ [auth] incoming:", req.method, req.originalUrl);
  console.log("→ [auth] header   :", header || "(none)");
  console.log("→ [auth] cookie token (if present):", req.cookies?.accessToken || "(none)");
  console.log("→ [auth] effective token:", token ? "YES (first few chars: " + token.substring(0,10) + "..." : "NO");
  // DEBUG – END

  if (!token) return res.status(401).json({ message: "Missing token" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log("→ [auth] invalid token:", err.message);
      // Clear potentially bad cookies if verification fails
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      return res.status(401).json({ message: "Invalid token" });
    }
    req.user = user;               // { id, email, permissions, ... }

    // DEBUG – BEGIN
    console.log("→ [auth] decoded   :", req.user);
    // DEBUG – END

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

    console.log("→ [auth] checking for perm(s):", requiredPerms);
    const hasPermission = requiredPerms.some((p) => userPerms.includes(p));
    if (!hasPermission) {
      console.log("→ [auth] ❌ missing permission");
      return res.status(401).json({ message: "Unauthorized" });
    }

    console.log("→ [auth] ✅ permission granted");
    next();
  };
}

module.exports = { authenticateToken, requirePermission };