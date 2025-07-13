// auth.middleware.cjs
const jwt  = require("jsonwebtoken");
const pool = require("./db.js");

/*────────────────────────────────────────────────────────────
  JWT Authentication
────────────────────────────────────────────────────────────*/
function authenticateToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  // DEBUG – BEGIN
  console.log("→ [auth] incoming:", req.method, req.originalUrl);
  console.log("→ [auth] header   :", header || "(none)");
  // DEBUG – END

  if (!token) return res.status(401).json({ message: "Missing token" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log("→ [auth] invalid token:", err.message);   // DEBUG
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
    // DEBUG – BEGIN
    console.log("→ [auth] checking for perm:", permission);
    // DEBUG – END

    const userPerms = req.user?.permissions || [];
    if (!userPerms.includes(permission)) {
      console.log("→ [auth] ❌ missing permission");          // DEBUG
      return res.status(401).json({ message: "Unauthorized" });
    }
    // DEBUG – BEGIN
    console.log("→ [auth] ✅ permission granted");
    // DEBUG – END
    next();
  };
}

module.exports = { authenticateToken, requirePermission };
