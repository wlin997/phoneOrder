import React, { useEffect, useState } from "react";
import clsx from "clsx";

/* ───────────────────────── MOCK (replace with API) */
const mockPerms = [
  { id: 1, name: "view_dashboard" },
  { id: 2, name: "manage_kds" },
  { id: 3, name: "view_reports" },
  { id: 4, name: "edit_daily_specials" },
  { id: 5, name: "manage_admin_settings" },
];

const mockRoles = [
  { id: 1, name: "admin", perms: [1, 2, 3, 4, 5] },
  { id: 2, name: "manager", perms: [1, 2, 3] },
  { id: 3, name: "employee", perms: [1, 2] },
  { id: 4, name: "customer", perms: [1] },
];

const mockUsers = [
  { id: 1, email: "alice@example.com", role_id: 1 },
  { id: 2, email: "bob@example.com", role_id: 2 },
  { id: 3, email: "eve@example.com", role_id: 4 },
];
/* ──────────────────────────────────────────────── */

export default function RoleManager() {
  /* ───────── state ──────── */
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState("permissions");
  const [dirty, setDirty] = useState(false);

  /* ───────── mount (mock fetch) ──────── */
  useEffect(() => {
    // TODO: swap with real API calls
    setRoles(mockRoles);
    setPerms(mockPerms);
    setUsers(mockUsers);
  }, []);

  /* ───────── helpers ──────── */
  const togglePerm = (roleId, permId) => {
    setRoles((prev) =>
      prev.map((r) =>
        r.id === roleId
          ? {
              ...r,
              perms: r.perms.includes(permId)
                ? r.perms.filter((p) => p !== permId)
                : [...r.perms, permId],
            }
          : r
      )
    );
    setDirty(true);
  };

  const updateUserRole = (uid, rid) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === uid ? { ...u, role_id: rid } : u))
    );
    setDirty(true);
  };

  const discardChanges = () => {
    // just reload mock (or refetch real data)
    setRoles(mockRoles);
    setUsers(mockUsers);
    setDirty(false);
  };

  const saveChanges = () => {
    // TODO: send roles/users to backend
    console.log("Save", { roles, users });
    setDirty(false);
    alert("Changes saved (stub)");
  };

  /* ───────── component ──────── */
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-3xl font-bold mb-6">Access Control</h1>

      {/* tabs */}
      <div className="mb-4 border-b flex gap-6">
        {["permissions", "users"].map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={clsx(
              "py-2 font-semibold",
              activeTab === t
                ? "border-b-2 border-cyan-600 text-cyan-700"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {t === "permissions" ? "Permissions" : "Users"}
          </button>
        ))}
      </div>

      {/* sticky toolbar */}
      {dirty && (
        <div className="sticky top-0 bg-white/70 backdrop-blur z-20 py-3 flex gap-3 border-b mb-4">
          <button
            className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700"
            onClick={saveChanges}
          >
            Save changes
          </button>
          <button
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            onClick={discardChanges}
          >
            Discard
          </button>
        </div>
      )}

      {/* ---------- Permissions tab ---------- */}
      {activeTab === "permissions" && (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="p-3 text-left bg-gray-100">Permission</th>
                {roles.map((role) => (
                  <th key={role.id} className="p-3 text-center bg-gray-100">
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perms.map((perm, pi) => (
                <tr key={perm.id} className={pi % 2 ? "bg-gray-50" : ""}>
                  <td className="p-3 font-medium">{perm.name}</td>
                  {roles.map((role) => {
                    const enabled = role.perms.includes(perm.id);
                    return (
                      <td
                        key={role.id}
                        className="p-3 text-center cursor-pointer"
                        onClick={() => togglePerm(role.id, perm.id)}
                      >
                        <span
                          className={clsx(
                            "inline-block px-2 py-1 rounded-full text-xs",
                            enabled
                              ? "bg-cyan-600 text-white"
                              : "bg-gray-200 text-gray-600"
                          )}
                        >
                          {enabled ? "ON" : "OFF"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Users tab ---------- */}
      {activeTab === "users" && (
        <div className="overflow-auto max-w-3xl">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="p-3 text-left bg-gray-100">User</th>
                <th className="p-3 text-left bg-gray-100">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, ui) => (
                <tr key={u.id} className={ui % 2 ? "bg-gray-50" : ""}>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">
                    <select
                      value={u.role_id}
                      onChange={(e) =>
                        updateUserRole(u.id, Number(e.target.value))
                      }
                      className="border rounded px-2 py-1 text-sm"
                    >
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
      )}
    </div>
  );
}

