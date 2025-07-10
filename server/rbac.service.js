// rbac.service.js  ── all DB helpers for roles & permissions
import pool from "./db.js";           // ← your existing pool export
import { BadRequest } from "./errors.js"; // (or just use Error)

/*───────────────────────────────────────────────────────────
  Lookups
───────────────────────────────────────────────────────────*/
export async function getAllRoles() {
  const { rows } = await pool.query("SELECT * FROM roles ORDER BY id");
  return rows;
}

export async function getAllPermissions() {
  const { rows } = await pool.query("SELECT * FROM permissions ORDER BY id");
  return rows;
}

export async function getRolePermissions(roleId) {
  const sql = `
      SELECT p.id, p.name, p.description
      FROM   role_permissions rp
      JOIN   permissions      p ON p.id = rp.permission_id
      WHERE  rp.role_id = $1
      ORDER  BY p.id;
  `;
  const { rows } = await pool.query(sql, [roleId]);
  return rows;
}

export async function upsertRolePermissions(roleId, permissionIds) {
  // Validate role exists
  const role = await pool.query("SELECT 1 FROM roles WHERE id=$1", [roleId]);
  if (!role.rowCount) throw new BadRequest("Role not found");

  await pool.query("BEGIN");
  try {
    await pool.query("DELETE FROM role_permissions WHERE role_id=$1", [roleId]);
    const insert =
      "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)";
    for (const pid of permissionIds) {
      await pool.query(insert, [roleId, pid]);
    }
    await pool.query("COMMIT");
  } catch (err) { await pool.query("ROLLBACK"); throw err; }
}

export async function updateUserRole(userId, roleId) {
  const sql =
    "UPDATE users SET role_id=$1, updated_at = CURRENT_TIMESTAMP WHERE id=$2";
  const res = await pool.query(sql, [roleId, userId]);
  if (!res.rowCount) throw new BadRequest("User not found");
}

/*───────────────────────────────────────────────────────────
  Convenience: fetch permissions for a given user (by id)
───────────────────────────────────────────────────────────*/
export async function getUserPermissions(userId) {
  const sql = `
     SELECT p.name
     FROM   users            u
     JOIN   role_permissions rp ON rp.role_id = u.role_id
     JOIN   permissions      p  ON p.id = rp.permission_id
     WHERE  u.id = $1;
  `;
  const { rows } = await pool.query(sql, [userId]);
  return rows.map(r => r.name);
}
