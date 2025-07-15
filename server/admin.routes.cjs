// server/admin.routes.cjs  – CommonJS
const express = require("express");
const router  = express.Router();
const bcrypt  = require("bcryptjs");
const pool    = require("./db.js");

const { requirePermission } = require("./auth.middleware.cjs");
router.use(requirePermission("manage_admin_settings"));   // guard all admin routes

/*──────────────────────────  ROLES  ──────────────────────────*/
router.get("/roles", async (_, res, next) => {
  try {
    const sql = `
      SELECT
        r.id,
        r.name,
        COALESCE(
          json_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL),
          '[]'
        ) AS perms
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      GROUP BY r.id
      ORDER BY r.id;
    `;
    const { rows } = await pool.query(sql);
    const roles = rows.map(r => ({
      id:   r.id,
      name: r.name,
      perms: Array.isArray(r.perms) ? r.perms : JSON.parse(r.perms || "[]"),
    }));
    res.json(roles);
  } catch (e) { next(e); }
});

router.post("/roles", async (req, res, next) => {
  const { name, description = null } = req.body;
  try {
    const sql = `INSERT INTO roles (name, description) VALUES ($1,$2) RETURNING *`;
    const { rows } = await pool.query(sql, [name, description]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.put("/roles/:id/permissions", async (req, res, next) => {
  const { add = [], remove = [] } = req.body;
  try {
    await pool.query("BEGIN");

    if (remove.length) {
      await pool.query(
        `DELETE FROM role_permissions
         WHERE role_id=$1 AND permission_id = ANY($2::int[])`,
        [req.params.id, remove]
      );
    }
    if (add.length) {
      const insert = `
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES ($1,$2) ON CONFLICT DO NOTHING`;
      for (const pid of add) {
        await pool.query(insert, [req.params.id, pid]);
      }
    }

    await pool.query("COMMIT");
    res.sendStatus(204);
  } catch (e) { await pool.query("ROLLBACK"); next(e); }
});

/*────────────────────────── PERMISSIONS ─────────────────────*/
router.get("/permissions", async (_, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM permissions ORDER BY id");
    res.json(rows);
  } catch (e) { next(e); }
});

/*────────────────────────── USERS ───────────────────────────*/
router.get("/users", async (_, res, next) => {
  try {
    const sql = `
      SELECT u.id, u.email, u.role_id, r.name AS role_name
      FROM   users u
      LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY u.id`;
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (e) { next(e); }
});

/* update email / password / role */
router.put("/users/:id", async (req, res, next) => {
  const { email, password, role_id } = req.body;
  const fields = [];
  const vals   = [];
  let idx = 1;

  if (email)   { fields.push(`email=$${idx++}`);          vals.push(email); }
  if (password){
    const hash = await bcrypt.hash(password, 10);
    fields.push(`password_hash=$${idx++}`);               vals.push(hash);
  }
  if (role_id !== undefined){
    fields.push(`role_id=$${idx++}`);                     vals.push(role_id);
  }
  if (!fields.length) return res.status(400).json({ message: "Nothing to update" });

  vals.push(req.params.id); // where id param
  const sql = `UPDATE users SET ${fields.join(",")} WHERE id=$${idx} RETURNING *`;
  try {
    const result = await pool.query(sql, vals);
    if (!result.rowCount) return res.status(404).json({ message: "User not found" });
    res.json(result.rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ message: "Email already exists" });
    next(e);
  }
});

router.put(
  "/users/:id/role",
  requirePermission("manage_admin_settings"),
  async (req, res, next) => {
    const roleId = Number(req.body.role_id);
    if (!Number.isInteger(roleId)) {
      return res.status(400).json({ message: "Invalid role_id" });
    }

    try {
      const { rowCount } = await pool.query(
        "UPDATE users SET role_id = $1 WHERE id = $2",
        [roleId, req.params.id]
      );
      if (!rowCount) return res.status(404).json({ message: "User not found" });
      res.sendStatus(204);
    } catch (err) {
      next(err);          // let the global error handler format 500s
    }
  }
);

router.put("/users/:id/password", async (req, res, next) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: "Password required" });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id, email",
      [hash, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ message: "Not found" });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

/*────────────────────────── create USER ──────────────────────────*/
/* POST /api/admin/users */
router.post(
  "/users",
  requirePermission("manage_admin_settings"),   // same guard you use elsewhere
  async (req, res, next) => {
    const { name, email, password, role_id } = req.body;

    if (!name || !email || !password || !Number.isInteger(role_id)) {
      return res
        .status(400)
        .json({ message: "name, email, password, role_id required" });
    }

    try {
      const hash = await bcrypt.hash(password, 10);
      const insert = `
        INSERT INTO users (name, email, password_hash, role_id)
        VALUES ($1,$2,$3,$4)
        RETURNING id, name, email, role_id`;
      const { rows } = await pool.query(insert, [
        name,
        email,
        hash,
        role_id,
      ]);
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === "23505") {
        // unique_violation (duplicate email)
        return res.status(409).json({ message: "Email already exists" });
      }
      next(e);
    }
  }
);

/* delete user */
router.delete("/users/:id", async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "User not found" });
    res.sendStatus(204);
  } catch (e) { next(e); }
});

module.exports = router;
