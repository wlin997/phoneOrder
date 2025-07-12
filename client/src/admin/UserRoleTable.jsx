import React from "react";

/**
 * UserRoleTable
 * @param {Array} users [{ id, email, role_id }]
 * @param {Array} roles [{ id, name }]
 * @param {Function} onSetRole (userId, roleId) => void
 */
const UserRoleTable = ({ users = [], roles = [], onSetRole }) => {
  if (!Array.isArray(users) || !Array.isArray(roles)) {
    console.warn("UserRoleTable expected arrays:", { users, roles });
    return (
      <p className="text-red-600 px-4 py-2">
        Failed to load user/role data (see console).
      </p>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2 text-left">User</th>
            <th className="px-4 py-2 text-left">Role</th>
          </tr>
        </thead>

        <tbody>
          {users.map((u, ui) => (
            <tr key={u.id} className={ui % 2 ? "bg-gray-50" : "bg-white"}>
              <td className="px-4 py-2">{u.email}</td>
              <td className="px-4 py-2">
                <select
                  value={u.role_id ?? ""}
                  onChange={(e) => onSetRole?.(u.id, Number(e.target.value))}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="" disabled>
                    —
                  </option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UserRoleTable;
