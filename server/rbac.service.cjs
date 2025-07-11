// rbac.service.js  (CommonJS)
const pool = require("./db.js");
class BadRequest extends Error {}

async function getAllRoles() {
  const { rows } = await pool.query("SELECT * FROM roles ORDER BY id");
  return rows;
}

async function getAllPermissions() {
  const { rows } = await pool.query("SELECT * FROM permissions ORDER BY id");
  return rows;
}

async function getRolePermissions(roleId) {
  const sql = `
    SELECT p.id, p.name, p.description
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = $1
    ORDER BY p.id`;
  const { rows } = await pool.query(sql, [roleId]);
  return rows;
}

async function upsertRolePermissions(roleId, permIds) {
  const role = await pool.query("SELECT 1 FROM roles WHERE id=$1", [roleId]);
  if (!role.rowCount) throw new BadRequest("Role not found");

  await pool.query("BEGIN");
  try {
    await pool.query("DELETE FROM role_permissions WHERE role_id=$1", [roleId]);
    const insert =
      "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)";
    for (const pid of permIds) await pool.query(insert, [roleId, pid]);
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }
}

async function updateUserRole(userId, roleId) {
  const sql =
    "UPDATE users SET role_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2";
  const res = await pool.query(sql, [roleId, userId]);
  if (!res.rowCount) throw new BadRequest("User not found");
}

async function getUserPermissions(userId) {
  const sql = `
    SELECT p.name
    FROM users u
    JOIN role_permissions rp ON rp.role_id = u.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE u.id = $1`;
  const { rows } = await pool.query(sql, [userId]);
  return rows.map(r => r.name);
}

module.exports = {
  getAllRoles,
  getAllPermissions,
  getRolePermissions,
  upsertRolePermissions,
  updateUserRole,
  getUserPermissions,
};
