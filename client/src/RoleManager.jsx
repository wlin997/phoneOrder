// client/src/RoleManager.jsx
import React, { useState, useEffect } from "react";
import clsx from "clsx";
import toast from "react-hot-toast";
import { useAuth } from "../AuthContext.jsx";        // axios instance with auth header

/* ─── MOCK DATA  (swap with real GET calls later) ─────────────────── */
const mockPerms = [
  { id: 1, name: "view_dashboard" },
  { id: 2, name: "manage_kds" },
  { id: 3, name: "view_reports" },
  { id: 4, name: "edit_daily_specials" },
  { id: 5, name: "manage_admin_settings" },
];

const mockRoles = [
  { id: 1, name: "admin",    perms: [1, 2, 3, 4, 5] },
  { id: 2, name: "manager",  perms: [1, 2, 3] },
  { id: 3, name: "employee", perms: [1, 2] },
  { id: 4, name: "customer", perms: [1] },
];

const mockUsers = [
  { id: 1, email: "alice@example.com", role_id: 1 },
  { id: 2, email: "bob@example.com",   role_id: 2 },
  { id: 3, email: "eve@example.com",   role_id: 4 },
];
/* ──────────────────────────────────────────────────────────────── */

export default function RoleManager() {
  const { api } = useAuth();              // axios instance with JWT header

  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState("permissions");
  const [dirty, setDirty] = useState(false);

  /* —— Add‑user form —— */
  const [newEmail, setNewEmail] = useState("");
  const [newPwd,   setNewPwd]   = useState("");
  const [newRole,  setNewRole]  = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* —— Load initial data (mock → replace with real GET) —— */
  useEffect(() => {
    setRoles(mockRoles);
    setPerms(mockPerms);
    setUsers(mockUsers);

    // TODO: replace mocks with:
    // const [rolesRes, permsRes, usersRes] = await Promise.all([
    //   api.get("/api/admin/roles"),
    //   api.get("/api/admin/permissions"),
    //   api.get("/api/admin/users")
    // ]);
    // setRoles(rolesRes.data);
    // setPerms(permsRes.data);
    // setUsers(usersRes.data);
  }, []);

  /* ──────────────────────────────────────────────── */
  /*  Permission matrix helpers                     */
  /* ──────────────────────────────────────────────── */
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

  /* ──────────────────────────────────────────────── */
  /*  Users tab helpers                              */
  /* ──────────────────────────────────────────────── */
  const updateUserRole = (uid, rid) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === uid ? { ...u, role_id: rid } : u))
    );
    setDirty(true);
  };

  /* —— Save / discard changed roles & users —— */
  const discardChanges = () => {
    setRoles(mockRoles);     // re‑load (or re‑fetch)
    setUsers(mockUsers);
    setDirty(false);
  };

  const saveChanges = async () => {
    try {
      // TODO: send diffs to backend
      // await api.put("/api/admin/roles", roles)
      // await api.put("/api/admin/users", users)
      toast.success("Changes saved (stub)");
      setDirty(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save changes");
    }
  };

  /* ──────────────────────────────────────────────── */
  /*  Add User                                       */
  /* ──────────────────────────────────────────────── */
  const createUser = async () => {
    if (!newEmail || !newPwd || !newRole) {
      toast.error("Fill all fields");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/api/admin/users", {
        email: newEmail,
        password: newPwd,
        role_id: Number(newRole),
      });
      setUsers((prev) => [...prev, res.data]);
      setNewEmail("");
      setNewPwd("");
      setNewRole("");
      toast.success("User created");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Create user failed");
    } finally {
      setSubmitting(false);
    }
  };

  /* ──────────────────────────────────────────────── */
  /*  Render                                         */
  /* ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-100 p-6 space-y-12">
      <h1 className="text-3xl font-bold text-gray-800">Access Control</h1>

      {/* sticky action bar when dirty */}
      {dirty && (
        <div className="sticky top-[76px] z-20 bg-white/90 backdrop-blur border-y py-3 flex gap-3 px-4">
          <button
            onClick={saveChanges}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700"
          >
            Save changes
          </button>
          <button
            onClick={discardChanges}
            className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
          >
            Discard
          </button>
        </div>
      )}

      {/* card wrapper */}
      <div className="bg-white rounded-xl shadow p-6">
        {/* Tabs */}
        <div className="flex gap-6 border-b mb-6">
          {[
            { id: "permissions", label: "Permissions" },
            { id: "users",       label: "Users" },
            { id: "adduser",     label: "Add User" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={clsx(
                "py-2 font-semibold",
                activeTab === t.id
                  ? "border-b-2 border-cyan-600 text-cyan-700"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── TAB 1: Permissions matrix ─── */}
        {activeTab === "permissions" && (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-left bg-gray-50">Permission</th>
                  {roles.map((role) => (
                    <th key={role.id} className="p-3 text-center bg-gray-50">
                      {role.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perms.map((perm, pi) => (
                  <tr key={perm.id} className={pi % 2 ? "bg-gray-50" : ""}>
                    <td className="p-3 font-medium text-gray-800">
                      {perm.name}
                    </td>
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
                              "inline-block px-2 py-1 rounded-full text-xs font-semibold",
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

        {/* ─── TAB 2: Users list ─── */}
        {activeTab === "users" && (
          <div className="overflow-auto max-w-3xl">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-left bg-gray-50">User</th>
                  <th className="p-3 text-left bg-gray-50">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, ui) => (
                  <tr key={u.id} className={ui % 2 ? "bg-gray-50" : ""}>
                    <td className="p-3 text-gray-800">{u.email}</td>
                    <td className="p-3">
                      <select
                        value={u.role_id}
                        onChange={(e) =>
                          updateUserRole(u.id, Number(e.target.value))
                        }
                        className="border rounded-lg px-3 py-1 text-sm focus:ring-cyan-500 focus:border-cyan-500"
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

        {/* ─── TAB 3: Add User ─── */}
        {activeTab === "adduser" && (
          <div className="max-w-sm space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Temporary Password
              </label>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Choose…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={createUser}
              disabled={
                submitting || !newEmail || !newPwd || !newRole
              }
              className={clsx(
                "px-4 py-2 w-full rounded-lg text-white font-semibold transition",
                submitting || !newEmail || !newPwd || !newRole
                  ? "bg-cyan-300 cursor-not-allowed"
                  : "bg-cyan-600 hover:bg-cyan-700"
              )}
            >
              {submitting ? "Creating…" : "Create User"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
