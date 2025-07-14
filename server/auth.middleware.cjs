// server/auth.middleware.cjs
const jwt = require("jsonwebtoken");

/*────────────────────────────────────────────────────────────
  1. authenticateToken
     – reads JWT from the http‑only SameSite cookie “access”
────────────────────────────────────────────────────────────*/
function authenticateToken(req, res, next) {
  const token = req.cookies?.access;          // ← cookie, not header
  if (!token) return res.status(401).json({ message: "Missing token" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(401).json({ message: "Invalid token" });
    req.user = user;                          // { id, permissions, mfa }
    next();
  });
}

/*────────────────────────────────────────────────────────────
  2. require2FACompleted   (use on routes that must have MFA)
────────────────────────────────────────────────────────────*/
function require2FACompleted(req, res, next) {
  if (!req.user?.mfa) {
    return res.status(401).json({ message: "Two‑factor required" });
  }
  next();
}

/*────────────────────────────────────────────────────────────
  3. requirePermission   (unchanged guard logic)
────────────────────────────────────────────────────────────*/
function requirePermission(required) {
  const need = Array.isArray(required) ? required : [required];
  return (req, res, next) => {
    const have = req.user?.permissions || [];
    const ok = need.every((p) => have.includes(p));
    if (!ok) return res.status(401).json({ message: "Unauthorized" });
    next();
  };
}

module.exports = {
  authenticateToken,
  require2FACompleted,   // optional guard
  requirePermission,
};
