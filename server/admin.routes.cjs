// server/admin.routes.cjs  – CommonJS
const express = require("express");
const router  = express.Router();
const bcrypt  = require("bcryptjs");
const pool    = require("./db.js");

const { requirePermission } = require("./auth.middleware.cjs");
router.use(requirePermission("manage_admin_settings"));   // guard all admin routes

/*────────────────────────────────────────────────────
  Password Policy Constants (NEW)
────────────────────────────────────────────────────*/
const PASSWORD_POLICY = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
};

/*────────────────────────────────────────────────────
  Password Validation Helper (NEW)
────────────────────────────────────────────────────*/
function validatePassword(password) {
  if (password.length < PASSWORD_POLICY.minLength) {
    return `Password must be at least ${PASSWORD_POLICY.minLength} characters long.`;
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)) {
    return "Password must contain at least one number.";
  }
  if (PASSWORD_POLICY.requireSpecialChar && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return "Password must contain at least one special character.";
  }
  return null; // Password is valid
}


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


/* ───────── USERS ───────── */
router.get("/users", async (_, res, next) => {
  try {
    const sql = `
      SELECT u.id,
             u.name,
             u.email,
             u.role_id,
             r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY u.id`;
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post("/users", async (req, res, next) => {
  const { name, email, password, role_id } = req.body;
  if (!name || !email || !password || !role_id)
    return res.status(400).json({ message: "name, email, password, role_id required" });

  // NEW: Validate password complexity for new user creation
  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const sql = `
      INSERT INTO users (name,email,password_hash,role_id)
      VALUES ($1,$2,$3,$4)
      RETURNING id,name,email,role_id`;
    const { rows } = await pool.query(sql, [name, email, hash, role_id]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505")
      return res.status(409).json({ message: "Email already exists" });
    next(e);
  }
});

/* generic UPDATE (name/email/role/password) */
router.put("/users/:id", async (req, res, next) => {
  const { name, email, role_id, password } = req.body;
  const fields = [];
  const vals   = [];
  let idx = 1;

  if (name !== undefined)    { fields.push(`name=$${idx++}`);    vals.push(name); }
  if (email !== undefined)   { fields.push(`email=$${idx++}`);   vals.push(email); }
  if (role_id !== undefined) { fields.push(`role_id=$${idx++}`); vals.push(role_id); }
  
  // NEW: Validate password complexity if password is being updated
  if (password) {
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }
    const hash = await bcrypt.hash(password, 10);
    fields.push(`password_hash=$${idx++}`);
    vals.push(hash);
  }
  if (!fields.length)
    return res.status(400).json({ message: "Nothing to update" });

  vals.push(req.params.id);
  const sql =
    `UPDATE users SET ${fields.join(",")}
     WHERE id=$${idx}
     RETURNING id,name,email,role_id`;
  try {
    const { rows, rowCount } = await pool.query(sql, vals);
    if (!rowCount)
      return res.status(404).json({ message: "User not found" });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/* ‑‑‑‑‑‑‑‑‑ dedicated ROLE endpoint (still used by front‑end) ‑‑‑‑‑‑‑‑‑ */
router.put(
  "/users/:id/role",
  requirePermission("manage_admin_settings"),
  async (req, res, next) => {
    const roleId = Number(req.body.role_id);
    if (!Number.isInteger(roleId))
      return res.status(400).json({ message: "Invalid role_id" });

    try {
      const { rowCount } = await pool.query(
        "UPDATE users SET role_id=$1 WHERE id=$2",
        [roleId, req.params.id]
      );
      if (!rowCount) return res.status(404).json({ message: "User not found" });
      res.sendStatus(204);
    } catch (err) { next(err); }
  }
);

/* ‑‑‑‑‑‑‑‑‑ dedicated PASSWORD endpoint (still used) ‑‑‑‑‑‑‑‑‑ */
router.put("/users/:id/password", async (req, res, next) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: "Password required" });

  // NEW: Validate password complexity for dedicated password change
  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `UPDATE users
          SET password_hash=$1
        WHERE id=$2
        RETURNING id,name,email`,
      [hash, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ message: "Not found" });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

/* DELETE user */
router.delete("/users/:id", async (req, res, next) => {
  try {
    const del = await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
    if (!del.rowCount)
      return res.status(404).json({ message: "User not found" });
    res.sendStatus(204);
  } catch (e) { next(e); }
});

module.exports = router;
