import React, { useEffect, useState } from "react";
import axios from "axios";

const RolePermissionGrid = () => {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [matrix, setMatrix] = useState({}); // { roleId: Set(permissionId) }
  const [saving, setSaving] = useState(false);

  /* ─────────── Load roles & permissions ─────────── */
  useEffect(() => {
    async function fetchData() {
      const [roleRes, permRes] = await Promise.all([
        axios.get("/api/admin/roles"),
        axios.get("/api/admin/permissions"),
      ]);
      setRoles(roleRes.data);
      setPermissions(permRes.data);

      // build matrix
      const map = {};
      await Promise.all(
        roleRes.data.map(async (role) => {
          const { data } = await axios.get(
            `/api/admin/roles/${role.id}/permissions`
          );
          map[role.id] = new Set(data.map((p) => p.id));
        })
      );
      setMatrix(map);
    }
    fetchData();
  }, []);

  /* ─────────── Toggle checkbox ─────────── */
  const handleToggle = (roleId, permId) => {
    setMatrix((prev) => {
      const next = { ...prev };
      const set = new Set(next[roleId]);
      if (set.has(permId)) set.delete(permId);
      else set.add(permId);
      next[roleId] = set;
      return next;
    });
  };

  /* ─────────── Save to server ─────────── */
  const saveRole = async (roleId) => {
    setSaving(true);
    try {
      await axios.put(`/api/admin/roles/${roleId}/permissions`, [
        ...matrix[roleId],
      ]);
    } finally {
      setSaving(false);
    }
  };

  if (!roles.length) return <p>Loading roles…</p>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-max border text-sm">
        <thead>
          <tr>
            <th className="border px-4 py-2 text-left">Role</th>
            {permissions.map((perm) => (
              <th key={perm.id} className="border px-2 py-1 rotate-45">
                {perm.name}
              </th>
            ))}
            <th className="border px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id}>
              <td className="border px-4 py-2 font-medium">{role.name}</td>
              {permissions.map((perm) => (
                <td key={perm.id} className="border text-center">
                  <input
                    type="checkbox"
                    checked={matrix[role.id]?.has(perm.id) || false}
                    onChange={() => handleToggle(role.id, perm.id)}
                  />
                </td>
              ))}
              <td className="border px-4 py-2">
                <button
                  className="px-2 py-1 bg-cyan-600 text-white rounded"
                  disabled={saving}
                  onClick={() => saveRole(role.id)}
                >
                  Save
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RolePermissionGrid;
