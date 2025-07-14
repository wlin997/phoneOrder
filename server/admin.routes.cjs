// server/admin.routes.cjs  – CommonJS
const express = require("express");
const router  = express.Router();
const bcrypt  = require("bcryptjs");
const pool    = require("./db.js");

// ─────────────────────────────────────────────────────────────
// Middleware: every /api/admin/* route requires manage_admin_settings
const { requirePermission } = require("./auth.middleware.cjs");
router.use(requirePermission("manage_admin_settings"));   // single string OK
// ─────────────────────────────────────────────────────────────


// -------- ROLES --------------------------------------------------
router.get("/roles", async (_, res, next) => {
  try {
    const sql = `
      SELECT
        r.id,
        r.name,
        COALESCE(
          json_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL),
          '[]'
        ) AS perms           -- JSON array text (e.g. "[1,2,3]")
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      GROUP BY r.id
      ORDER BY r.id;
    `;
    const { rows } = await pool.query(sql);

    // Ensure perms is a JS array
    const roles = rows.map((row) => ({
      id:   row.id,
      name: row.name,
      perms: Array.isArray(row.perms)        // driver already parsed?
        ? row.perms
        : JSON.parse(row.perms || "[]")      // fallback for text
    }));

    res.json(roles);
  } catch (e) {
    next(e);
  }
});

router.post("/roles", async (req, res, next) => {
  const { name, description = null } = req.body;
  try {
    const sql  = `INSERT INTO roles (name, description)
                  VALUES ($1,$2) RETURNING *`;
    const { rows } = await pool.query(sql, [name, description]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.get("/permissions", async (_, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM permissions ORDER BY id"
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.get("/roles/:id/permissions", async (req, res, next) => {
  try {
    const sql = `
      SELECT p.*
      FROM   role_permissions rp
      JOIN   permissions      p ON p.id = rp.permission_id
      WHERE  rp.role_id = $1
      ORDER BY p.id`;
    const { rows } = await pool.query(sql, [req.params.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

// admin.routes.cjs
router.put("/roles/:id/permissions", async (req, res, next) => {
  // Expect { add: [id,id], remove: [id,id] }
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
        VALUES ($1,$2)
        ON CONFLICT DO NOTHING`;
      for (const pid of add) {
        await pool.query(insert, [req.params.id, pid]);
      }
    }

    await pool.query("COMMIT");
    res.sendStatus(204);
  } catch (e) {
    await pool.query("ROLLBACK");
    next(e);
  }
});



// -------- USERS --------------------------------------------------
router.get("/users", async (_, res, next) => {
  try {
    const sql = `
      SELECT
        u.id,
        u.email,
        u.role_id,
        r.name AS role_name
      FROM   users u
      LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY u.id`;
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (e) { next(e); }
});

router.put("/users/:id/role", async (req, res, next) => {
  try {
    const sql = "UPDATE users SET role_id=$1 WHERE id=$2";
    const result = await pool.query(sql, [req.body.role_id, req.params.id]);
    if (!result.rowCount) {
      return res.status(404).json({ message: "User not found" });
    }
    res.sendStatus(204);
  } catch (e) { next(e); }
});


// ---- NEW: create user ------------------------------------------
router.post("/users", async (req, res, next) => {
  const { email, password, role_id } = req.body;
  if (!email || !password || !role_id) {
    return res.status(400).json({
      message: "email, password & role_id required"
    });
  }

  try {
    // verify role exists
    const roleChk = await pool.query(
      "SELECT 1 FROM roles WHERE id=$1",
      [role_id]
    );
    if (!roleChk.rowCount) {
      return res.status(400).json({ message: "Invalid role_id" });
    }

    // hash password
    const hash = await bcrypt.hash(password, 10);

    // insert user
    const insert = `
      INSERT INTO users (email, password_hash, role_id)
      VALUES ($1,$2,$3)
      RETURNING id, email, role_id`;
    const { rows } = await pool.query(insert, [email, hash, role_id]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505") {          // unique_violation
      return res.status(409).json({ message: "Email already exists" });
    }
    next(e);
  }
});

module.exports = router;
