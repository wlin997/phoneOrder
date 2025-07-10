// auth.middleware.js ── JWT verify + permission guard
const { getUserPermissions } = require("./rbac.service.js");
const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const header = req.headers["authorization"];
  const token  = header && header.split(" ")[1];
  if (!token)
    return res.status(401).json({ message: "Missing token" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;      // payload from generateAccessToken()
    next();
  });
}

/** Guard for granular routes
 *  Usage:  app.post("/api/specials", authorizePermissions(["edit_daily_specials"]), …)
 */
function authorizePermissions(required) {
  return (req, res, next) => {
    const perms = req.user.permissions || [];
    const ok = required.every(p => perms.includes(p));
    if (!ok) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

module.exports = {
  authenticateToken,
  authorizePermissions
};
