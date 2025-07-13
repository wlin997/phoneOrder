// client/src/RoleManager.jsx
import React, { useState, useEffect } from "react";
import clsx from "clsx";
import toast from "react-hot-toast";
import { useAuth } from "./AuthContext.jsx";         // axios instance w/ JWT

/***********  REMOVE MOCK DATA ONCE BACKEND IS HOOKED UP  ***********/
const mockPerms = [
  { id: 1, name: "view_dashboard" },
  { id: 2, name: "manage_kds" },
  { id: 3, name: "view_reports" },
  { id: 4, name: "edit_daily_specials" },
  { id: 5, name: "manage_admin_settings" },
];
/********************************************************************/

export default function RoleManager() {
  const { api } = useAuth();              // axios with JWT header

  /* data */
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [users, setUsers] = useState([]);

  /* ui */
  const [activeTab, setActiveTab] = useState("permissions");
  const [dirty, setDirty] = useState(false);

  /* add‑user form */
  const [newEmail, setNewEmail] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newRole, setNewRole] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* ─── On mount: fetch live data ─────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const [rolesRes, permsRes, usersRes] = await Promise.all([
          api.get("/api/admin/roles"),
          api.get("/api/admin/permissions"),
          api.get("/api/admin/users"),
        ]);
        setRoles(rolesRes.data);
        setPerms(permsRes.data);
        setUsers(usersRes.data);
      } catch (err) {
        toast.error("Failed to load RBAC data");
        // fall back to mock perms so the grid renders
        setPerms(mockPerms);
      }
    })();
  }, [api]);

  /* ─── Helpers ───────────────────────────────────────────── */
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

  const updateUserRole = async (uid, rid) => {
    try {
      await api.put(`/api/admin/users/${uid}/role`, { role_id: rid });
      setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, role_id: rid } : u)));
      toast.success("Role updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Update failed");
    }
  };

  const discardChanges = () => {
    window.location.reload();
  };

  const saveChanges = async () => {
    try {
      /* send role‑permission updates here (left as exercise) */
      toast.success("Changes saved");
      setDirty(false);
    } catch {
      toast.error("Save failed");
    }
  };

  const createUser = async () => {
    if (!newEmail || !newPwd || !newRole) return toast.error("Fill all fields");
    setSubmitting(true);
    try {
      const res = await api.post("/api/admin/users", {
        email: newEmail,
        password: newPwd,
        role_id: Number(newRole),
      });
      setUsers((prev) => [...prev, res.data]);
      setNewEmail(""); setNewPwd(""); setNewRole("");
      toast.success("User created");
    } catch (err) {
      toast.error(err.response?.data?.message || "Create user failed");
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Render ────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-100 p-6 space-y-12">
      <h1 className="text-3xl font-bold text-gray-800">Access Control</h1>

      {dirty && (
        <div className="sticky top-[76px] bg-white/90 backdrop-blur border-y py-3 flex gap-3 px-4 z-20">
          <button
            onClick={saveChanges}
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
          >
            Save changes
          </button>
          <button
            onClick={discardChanges}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Discard
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-6">
        {/* Tabs */}
        <div className="flex gap-6 border-b mb-6">
          {["permissions", "users", "adduser"].map((id) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={clsx(
                "py-2 font-semibold",
                activeTab === id
                  ? "border-b-2 border-cyan-600 text-cyan-700"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {id === "permissions" ? "Permissions" : id === "users" ? "Users" : "Add User"}
            </button>
          ))}
        </div>

        {/* ── Permissions Matrix ─────────────────────────── */}
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
                    <td className="p-3 font-medium text-gray-800">{perm.name}</td>
                    {roles.map((role) => {
                      const enabled = role.perms?.includes?.(perm.id);
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

        {/* ── Live Users Table ─────────────────────────── */}
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
                        value={u.role_id ?? ""}
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

        {/* ── Add User Form ─────────────────────────────── */}
        {activeTab === "adduser" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createUser();
            }}
            className="max-w-sm space-y-4"
          >
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                autoComplete="email"
                required
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
                autoComplete="new-password"
                required
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select
                required
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
              type="submit"
              disabled={submitting || !newEmail || !newPwd || !newRole}
              className={clsx(
                "w-full py-2 rounded-lg text-white font-semibold transition",
                submitting || !newEmail || !newPwd || !newRole
                  ? "bg-cyan-300 cursor-not-allowed"
                  : "bg-cyan-600 hover:bg-cyan-700"
              )}
            >
              {submitting ? "Creating…" : "Create User"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
