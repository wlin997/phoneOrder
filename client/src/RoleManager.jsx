// client/src/RoleManager.jsx
import React, { useState, useEffect } from "react";
import clsx from "clsx";
import toast from "react-hot-toast";
import { useAuth } from "./AuthContext.jsx";

export default function RoleManager() {
  const { api } = useAuth();

  /*────────────────────────── state ──────────────────────────*/
  const [roles, setRoles]                 = useState([]);
  const [originalRoles, setOriginalRoles] = useState([]);
  const [perms, setPerms]                 = useState([]);
  const [users, setUsers]                 = useState([]);

  const [activeTab, setActiveTab]         = useState("permissions");
  const [matrixDirty, setMatrixDirty]     = useState(false); // permissions matrix

  const [newName, setNewName]             = useState("");
  const [newEmail, setNewEmail]           = useState("");
  const [newPwd, setNewPwd]               = useState("");
  const [newRole, setNewRole]             = useState("");
  const [submitting, setSubmitting]       = useState(false);

  /*────────────────────────── initial load ──────────────────*/
  useEffect(() => {
    (async () => {
      try {
        const [rolesRes, permsRes, usersRes] = await Promise.all([
          api.get("/api/admin/roles"),
          api.get("/api/admin/permissions"),
          api.get("/api/admin/users"),
        ]);
        setRoles(rolesRes.data);
        setOriginalRoles(JSON.parse(JSON.stringify(rolesRes.data)));
        setPerms(permsRes.data);
        setUsers(usersRes.data);
      } catch {
        toast.error("Failed to load RBAC data");
      }
    })();
  }, [api]);

  /*────────────────────────── permission toggling ───────────*/
  const togglePerm = (roleId, permId) => {
    setRoles(prev =>
      prev.map(r =>
        r.id === roleId
          ? {
              ...r,
              perms: r.perms.includes(permId)
                ? r.perms.filter(p => p !== permId)
                : [...r.perms, permId],
            }
          : r
      )
    );
    setMatrixDirty(true);
  };

  /*────────────────────────── bulk‑save matrix ──────────────*/
  const saveMatrix = async () => {
    try {
      for (const role of roles) {
        const orig = originalRoles.find(r => r.id === role.id) || { perms: [] };
        const add    = role.perms.filter(p => !orig.perms.includes(p)).map(Number);
        const remove = orig.perms.filter(p => !role.perms.includes(p)).map(Number);
        if (!add.length && !remove.length) continue;
        await api.put(`/api/admin/roles/${role.id}/permissions`, { add, remove });
      }
      toast.success("Permission changes saved");
      setMatrixDirty(false);
      setOriginalRoles(JSON.parse(JSON.stringify(roles)));
    } catch (err) {
      console.error(err);
      toast.error("Save failed");
    }
  };

  /*────────────────────────── create user ───────────────────*/
  const createUser = async () => {
    if (!newName || !newEmail || !newPwd || !newRole)
      return toast.error("Fill all fields");
    setSubmitting(true);
    try {
      const res = await api.post("/api/admin/users", {
        name: newName,
        email: newEmail,
        password: newPwd,
        role_id: Number(newRole),
      });
      setUsers(prev => [...prev, res.data]);
      setNewName(""); setNewEmail(""); setNewPwd(""); setNewRole("");
      toast.success("User created");
    } catch (err) {
      toast.error(err.response?.data?.message || "Create user failed");
    } finally {
      setSubmitting(false);
    }
  };

  /*────────────────────────── update user helper ────────────*/
  const saveUser = async payload => {
    const { id, ...body } = payload;
    await api.put(`/api/admin/users/${id}`, body);
    setUsers(prev =>
      prev.map(u => (u.id === id ? { ...u, ...body, password_hash: undefined } : u))
    );
  };

  const deleteUser = async uid => {
    if (!confirm("Delete this user?")) return;
    try {
      await api.delete(`/api/admin/users/${uid}`);
      setUsers(prev => prev.filter(u => u.id !== uid));
      toast.success("User deleted");
    } catch (err) {
      toast.error(err.response?.data?.message || "Delete failed");
    }
  };

  /*────────────────────────── render ────────────────────────*/
  return (
    <div className="min-h-screen bg-gray-100 p-6 space-y-12">
      <h1 className="text-3xl font-bold text-gray-800">Access Control</h1>

      {matrixDirty && (
        <div className="sticky top-[76px] bg-white/90 backdrop-blur border-y py-3 flex gap-3 px-4 z-20">
          <button
            onClick={saveMatrix}
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
          >
            Save permission changes
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Discard
          </button>
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
                activeTab === id
                  ? "border-b-2 border-cyan-600 text-cyan-700"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {id === "permissions"
                ? "Permissions"
                : id === "users"
                ? "Users"
                : "Add User"}
            </button>
          ))}
        </div>

        {/* Permissions matrix */}
        {activeTab === "permissions" && (
          <PermissionMatrix
            perms={perms}
            roles={roles}
            togglePerm={togglePerm}
          />
        )}

        {/* Users list */}
        {activeTab === "users" && (
          <UserTable
            users={users}
            roles={roles}
            saveUser={saveUser}
            deleteUser={deleteUser}
          />
        )}

        {/* Add‑user form */}
        {activeTab === "adduser" && (
          <AddUserForm
            roles={roles}
            newName={newName}
            newEmail={newEmail}
            newPwd={newPwd}
            newRole={newRole}
            submitting={submitting}
            setNewName={setNewName}
            setNewEmail={setNewEmail}
            setNewPwd={setNewPwd}
            setNewRole={setNewRole}
            createUser={createUser}
          />
        )}
      </div>
    </div>
  );
}

/*────────────────── sub‑components ──────────────────*/
const PermissionMatrix = ({ perms, roles, togglePerm }) => (
  <div className="overflow-auto">
    <table className="min-w-full text-sm">
      <thead>
        <tr>
          <th className="p-3 text-left bg-gray-50">Permission</th>
          {roles.map(r => (
            <th key={r.id} className="p-3 text-center bg-gray-50">
              {r.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {perms.map((perm, i) => (
          <tr key={perm.id} className={i % 2 ? "bg-gray-50" : ""}>
            <td className="p-3 font-medium text-gray-800">{perm.name}</td>
            {roles.map(role => {
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
);

const UserTable = ({ users, roles, saveUser, deleteUser }) => (
  <div className="overflow-auto max-w-5xl">
    <table className="min-w-full text-sm">
      <thead>
        <tr>
          <th className="p-3 bg-gray-50 text-left">Name</th>
          <th className="p-3 bg-gray-50 text-left">Email</th>
          <th className="p-3 bg-gray-50 text-left">Role</th>
          <th className="p-3 bg-gray-50 text-left">Temp Password</th>
          <th className="p-3 bg-gray-50 text-center">Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map(u => (
          <UserRow
            key={u.id}
            user={u}
            roles={roles}
            saveUser={saveUser}
            deleteUser={deleteUser}
          />
        ))}
      </tbody>
    </table>
  </div>
);

const UserRow = React.memo(({ user, roles, saveUser, deleteUser }) => {
  const [name, setName]       = useState(user.name || "");
  const [email, setEmail]     = useState(user.email);
  const [roleId, setRoleId]   = useState(user.role_id);
  const [password, setPwd]    = useState("");
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);

  const markDirty = () => setDirty(true);

  const handleSave = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await saveUser({
        id: user.id,
        name: name.trim(),
        email: email.trim(),
        role_id: roleId,
        password: password || undefined,
      });
      setPwd("");
      setDirty(false);
    } catch {/* toast handled upstream */} finally {
      setSaving(false);
    }
  };

  return (
    <tr className="odd:bg-gray-50">
      <td className="p-3">
        <input
          value={name}
          onChange={e => { setName(e.target.value); markDirty(); }}
          className="border rounded px-2 py-1 w-full text-sm"
        />
      </td>
      <td className="p-3">
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); markDirty(); }}
          className="border rounded px-2 py-1 w-full text-sm"
        />
      </td>
      <td className="p-3">
        <select
          value={roleId}
          onChange={e => { setRoleId(Number(e.target.value)); markDirty(); }}
          className="border rounded px-2 py-1 w-full text-sm"
        >
          {roles.map(r => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </td>
      <td className="p-3">
        <input
          type="password"
          placeholder="(leave blank)"
          value={password}
          onChange={e => { setPwd(e.target.value); markDirty(); }}
          className="border rounded px-2 py-1 w-full text-sm"
        />
      </td>
      <td className="p-3 flex gap-2 justify-center">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={clsx(
            "px-3 py-1 rounded text-xs font-medium",
            dirty
              ? "bg-cyan-600 text-white hover:bg-cyan-700"
              : "bg-gray-300 text-gray-600 cursor-not-allowed"
          )}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => deleteUser(user.id)}
          className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
        >
          Delete
        </button>
      </td>
    </tr>
  );
});

const AddUserForm = ({
  roles,
  newName,
  newEmail,
  newPwd,
  newRole,
  submitting,
  setNewName,
  setNewEmail,
  setNewPwd,
  setNewRole,
  createUser,
}) => (
  <form
    onSubmit={e => { e.preventDefault(); createUser(); }}
    className="max-w-sm space-y-4"
  >
    <div>
      <label className="block text-sm font-medium mb-1">Name</label>
      <input
        type="text"
        required
        value={newName}
        onChange={e => setNewName(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Email</label>
      <input
        type="email"
        required
        value={newEmail}
        onChange={e => setNewEmail(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Temporary Password</label>
      <input
        type="password"
        autoComplete="new-password"
        required
        value={newPwd}
        onChange={e => setNewPwd(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Role</label>
      <select
        required
        value={newRole}
        onChange={e => setNewRole(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm"
      >
        <option value="">Choose…</option>
        {roles.map(r => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>

    <button
      type="submit"
      disabled={submitting || !newName || !newEmail || !newPwd || !newRole}
      className={clsx(
        "w-full py-2 rounded-lg text-white font-semibold transition",
        submitting || !newName || !newEmail || !newPwd || !newRole
          ? "bg-cyan-300 cursor-not-allowed"
          : "bg-cyan-600 hover:bg-cyan-700"
      )}
    >
      {submitting ? "Creating…" : "Create User"}
    </button>
  </form>
);
