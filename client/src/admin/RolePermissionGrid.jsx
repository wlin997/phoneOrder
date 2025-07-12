import React from "react";

/**
 * RolePermissionGrid
 * @param {Array} roles  [{ id, name, perms:[id,…] }]
 * @param {Array} perms  [{ id, name }]
 * @param {Function} onToggle (roleId, permId) => void
 */
const RolePermissionGrid = ({ roles = [], perms = [], onToggle }) => {
  // Defensive guards
  if (!Array.isArray(roles) || !Array.isArray(perms)) {
    console.warn("RolePermissionGrid expected arrays:", { roles, perms });
    return (
      <p className="text-red-600 px-4 py-2">
        Failed to load role/permission data (see console).
      </p>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2 text-left">Role</th>
            {perms.map((perm) => (
              <th key={perm.id} className="px-4 py-2 text-center">
                {perm.name}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {roles.map((role, ri) => (
            <tr key={role.id} className={ri % 2 ? "bg-gray-50" : "bg-white"}>
              <td className="px-4 py-2 font-medium">{role.name}</td>

              {perms.map((perm) => (
                <td key={perm.id} className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={role.perms?.includes(perm.id)}
                    onChange={() => onToggle?.(role.id, perm.id)}
                    className="h-4 w-4 text-cyan-600 focus:ring-cyan-500"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RolePermissionGrid;
