// auth.middleware.js
const jwt = require("jsonwebtoken");
const { getUserPermissions } = require("./rbac.service.cjs"); // ✅ correctly using require

function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Missing token" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}

function authorizePermissions(required) {
  return (req, res, next) => {
    const perms = req.user?.permissions || [];
    const ok = required.every(p => perms.includes(p));
    if (!ok) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

module.exports = { authenticateToken, authorizePermissions };
