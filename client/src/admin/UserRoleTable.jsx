import React, { useEffect, useState } from "react";
import axios from "axios";

const UserRoleTable = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    async function fetch() {
      const [userRes, roleRes] = await Promise.all([
        axios.get("/api/admin/users"),
        axios.get("/api/admin/roles"),
      ]);
      setUsers(userRes.data);
      setRoles(roleRes.data);
    }
    fetch();
  }, []);

  const updateRole = async (userId, roleId) => {
    await axios.put(`/api/admin/users/${userId}/role`, { role_id: roleId });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role_name: roles.find(r => r.id === roleId).name } : u))
    );
  };

  return (
    <table className="mt-10 border text-sm min-w-max">
      <thead>
        <tr>
          <th className="border px-4 py-2 text-left">User</th>
          <th className="border px-4 py-2">Current Role</th>
          <th className="border px-4 py-2">Change Role</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td className="border px-4 py-2">{u.email}</td>
            <td className="border px-4 py-2">{u.role_name ?? "—"}</td>
            <td className="border px-4 py-2">
              <select
                className="border rounded p-1"
                value={roles.find(r => r.name === u.role_name)?.id || ""}
                onChange={(e) => updateRole(u.id, Number(e.target.value))}
              >
                <option value="" disabled>
                  select role
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
  );
};

export default UserRoleTable;
