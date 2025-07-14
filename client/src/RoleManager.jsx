// client/src/RoleManager.jsx
import React, { useState, useEffect } from "react";
import clsx from "clsx";
import toast from "react-hot-toast";
import { useAuth } from "./AuthContext.jsx";

const mockPerms = [ /* … remove in production … */ ];

export default function RoleManager() {
  const { api } = useAuth();

  const [roles, setRoles]   = useState([]);
  const [origRoles, setOrigRoles] = useState([]);
  const [perms, setPerms]   = useState([]);
  const [users, setUsers]   = useState([]);

  const [activeTab, setActiveTab] = useState("permissions");
  const [dirty, setDirty] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newPwd,   setNewPwd]   = useState("");
  const [newRole,  setNewRole]  = useState("");
  const [submitting, setSubmitting] = useState(false);

  /*────────────────────────  LOAD DATA  ─────────────────────*/
  useEffect(() => {
    (async () => {
      try {
        const [rolesRes, permsRes, usersRes] = await Promise.all([
          api.get("/api/admin/roles"),
          api.get("/api/admin/permissions"),
          api.get("/api/admin/users"),
        ]);
        setRoles(rolesRes.data);
        setOrigRoles(JSON.parse(JSON.stringify(rolesRes.data)));
        setPerms(permsRes.data);
        setUsers(usersRes.data.map(u => ({ ...u, editedEmail: u.email, dirty: false })));
      } catch {
        toast.error("Failed to load RBAC data");
        setPerms(mockPerms);
      }
    })();
  }, [api]);

  /*────────────────────────  PERMISSION MATRIX  ─────────────*/
  const togglePerm = (rid, pid) => {
    setRoles(prev =>
      prev.map(r =>
        r.id === rid
          ? { ...r, perms: r.perms.includes(pid) ? r.perms.filter(p => p !== pid) : [...r.perms, pid] }
          : r
      )
    );
    setDirty(true);
  };

  /*────────────────────────  USER EDIT  ─────────────────────*/
  const updateUserField = (uid, field, value) => {
    setUsers(prev => prev.map(u => u.id === uid ? { ...u, [field]: value, dirty: true } : u));
  };

  const saveUser = async (uid) => {
    const user = users.find(u => u.id === uid);
    try {
      await api.put(`/api/admin/users/${uid}`, {
        email:   user.editedEmail,
        role_id: user.role_id,
      });
      toast.success("User updated");
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, email: user.editedEmail, dirty: false } : u));
    } catch (err) {
      toast.error(err.response?.data?.message || "Update failed");
    }
  };

  const deleteUser = async (uid) => {
    const user = users.find(u => u.id === uid);
    if (!window.confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/admin/users/${uid}`);
      setUsers(prev => prev.filter(u => u.id !== uid));
      toast.success("User deleted");
    } catch (err) {
      toast.error(err.response?.data?.message || "Delete failed");
    }
  };

  /*────────────────────────  ROLE PERM SAVE  ───────────────*/
  const delta = (before, after) => ({
    add:    after.filter(p => !before.includes(p)),
    remove: before.filter(p => !after.includes(p)),
  });

  const saveChanges = async () => {
    try {
      const calls = roles.map(r => {
        const orig = origRoles.find(o => o.id === r.id) || { perms: [] };
        const d = delta(orig.perms, r.perms);
        if (!d.add.length && !d.remove.length) return null;
        return api.put(`/api/admin/roles/${r.id}/permissions`, d);
      });
      await Promise.all(calls.filter(Boolean));
      toast.success("Changes saved");
      setDirty(false);
      setOrigRoles(JSON.parse(JSON.stringify(roles)));
    } catch (err) {
      toast.error(err.response?.data?.message || "Save failed");
    }
  };

  const discardChanges = () => window.location.reload();

  /*────────────────────────  CREATE USER  ──────────────────*/
  const createUser = async () => {
    if (!newEmail || !newPwd || !newRole) return toast.error("Fill all fields");
    setSubmitting(true);
    try {
      const { data } = await api.post("/api/admin/users", {
        email: newEmail,
        password: newPwd,
        role_id: Number(newRole),
      });
      setUsers(prev => [...prev, { ...data, editedEmail: data.email, dirty: false }]);
      setNewEmail(""); setNewPwd(""); setNewRole("");
      toast.success("User created");
    } catch (err) {
      toast.error(err.response?.data?.message || "Create user failed");
    } finally {
      setSubmitting(false);
    }
  };

  /*────────────────────────  RENDER  ───────────────────────*/
  return (
    <div className="min-h-screen bg-gray-100 p-6 space-y-12">
      <h1 className="text-3xl font-bold text-gray-800">Access Control</h1>

      {dirty && (
        <div className="sticky top-[76px] bg-white/90 backdrop-blur border-y py-3 px-4 flex gap-3 z-20">
          <button onClick={saveChanges} className="px-4 py-2 rounded-lg bg-cyan-600 text-white">Save changes</button>
          <button onClick={discardChanges} className="px-4 py-2 rounded-lg bg-gray-200">Discard</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-6">
        {/* Tabs */}
        <div className="flex gap-6 border-b mb-6">
          {["permissions", "users", "adduser"].map(id => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={clsx(
                "py-2 font-semibold",
                activeTab === id ? "border-b-2 border-cyan-600 text-cyan-700" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {id === "permissions" ? "Permissions" : id === "users" ? "Users" : "Add User"}
            </button>
          ))}
        </div>

        {/* Permissions Tab */}
        {activeTab === "permissions" && (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-left bg-gray-50">Permission</th>
                  {roles.map(r => (
                    <th key={r.id} className="p-3 text-center bg-gray-50">{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perms.map((perm, pi) => (
                  <tr key={perm.id} className={pi % 2 ? "bg-gray-50" : ""}>
                    <td className="p-3 font-medium text-gray-800">{perm.name}</td>
                    {roles.map(role => {
                      const enabled = role.perms.includes(perm.id);
                      return (
                        <td key={role.id} className="p-3 text-center cursor-pointer" onClick={() => togglePerm(role.id, perm.id)}>
                          <span className={clsx("inline-block px-2 py-1 rounded-full text-xs font-semibold", enabled ? "bg-cyan-600 text-white" : "bg-gray-200 text-gray-600")}>
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

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="overflow-auto max-w-4xl">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-left bg-gray-50">Email</th>
                  <th className="p-3 text-left bg-gray-50">Role</th>
                  <th className="p-3 bg-gray-50">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <tr key={u.id} className={idx % 2 ? "bg-gray-50" : ""}>
                    <td className="p-3">
                      <input
                        className="border rounded px-2 py-1 w-full text-sm"
                        value={u.editedEmail}
                        onChange={e => updateUserField(u.id, "editedEmail", e.target.value)}
                      />
                    </td>
                    <td className="p-3">
                      <select
                        className="border rounded px-2 py-1 w-full text-sm"
                        value={u.role_id}
                        onChange={e => updateUserField(u.id, "role_id", Number(e.target.value))}
                      >
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </td>
                    <td className="p-3 flex justify-center gap-2">
                      <button
                        onClick={() => saveUser(u.id)}
                        disabled={!u.dirty}
                        className={clsx("px-3 py-1 rounded text-sm font-medium",
                          u.dirty ? "bg-cyan-600 text-white hover:bg-cyan-700" : "bg-gray-300 text-gray-600 cursor-not-allowed")}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => deleteUser(u.id)}
                        className="px-3 py-1 rounded text-sm font-medium bg-red-500 text-white hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add User */}
        {activeTab === "adduser" && (
          <form onSubmit={e => { e.preventDefault(); createUser(); }} className="max-w-sm space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Temporary Password</label>
              <input type="password" required value={newPwd} onChange={e => setNewPwd(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select required value={newRole} onChange={e => setNewRole(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
                <option value="">Choose…</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <button type="submit" disabled={submitting} className={clsx("w-full py-2 rounded text-white font-semibold", submitting ? "bg-cyan-300" : "bg-cyan-600 hover:bg-cyan-700")}>
              {submitting ? "Creating…" : "Create User"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
