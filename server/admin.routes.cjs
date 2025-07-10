// admin.routes.js  (CommonJS)
const express = require("express");
const {
  getAllRoles,
  getAllPermissions,
  getRolePermissions,
  upsertRolePermissions,
  updateUserRole,
} = require("./rbac.service.js");
const { authorizePermissions } = require("./auth.middleware.js");

const router = express.Router();
router.use(authorizePermissions(["manage_admin_settings"]));

router.get("/roles", async (_, res, next) => {
  try { res.json(await getAllRoles()); } catch (e) { next(e); }
});

router.post("/roles", async (req, res, next) => {
  try {
    const { name, description = null } = req.body;
    const sql = `INSERT INTO roles (name, description) VALUES ($1,$2) RETURNING *`;
    const { rows } = await req.app.locals.pool.query(sql, [name, description]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.get("/permissions", async (_, res, next) => {
  try { res.json(await getAllPermissions()); } catch (e) { next(e); }
});

router.get("/roles/:id/permissions", async (req, res, next) => {
  try { res.json(await getRolePermissions(req.params.id)); } catch (e) { next(e); }
});

router.put("/roles/:id/permissions", async (req, res, next) => {
  try { await upsertRolePermissions(req.params.id, req.body); res.sendStatus(204); }
  catch (e) { next(e); }
});

router.get("/users", async (req, res, next) => {
  try {
    const sql = `
      SELECT u.id, u.email, r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY u.id`;
    const { rows } = await req.app.locals.pool.query(sql);
    res.json(rows);
  } catch (e) { next(e); }
});

router.put("/users/:id/role", async (req, res, next) => {
  try { await updateUserRole(req.params.id, req.body.role_id); res.sendStatus(204); }
  catch (e) { next(e); }
});

module.exports = router;
