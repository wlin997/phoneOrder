// auth.middleware.js ── ESM version
import jwt from "jsonwebtoken";
import { getUserPermissions } from "./rbac.service.js";

/**
 * JWT Authentication Middleware
 */
export function authenticateToken(req, res, next) {
  const header = req.headers["authorization"];
  const token = header && header.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Missing token" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}

/**
 * Permission Guard
 * @param {string[]} required - Permissions like ['edit_orders']
 */
export function authorizePermissions(required) {
  return (req, res, next) => {
    const perms = req.user?.permissions || [];
    const ok = required.every(p => perms.includes(p));
    if (!ok) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}
