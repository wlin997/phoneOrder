// client/src/RoleManager.jsx
import React, { useState, useEffect } from "react";
import clsx from "clsx";
import toast from "react-hot-toast";
import { useAuth } from "./AuthContext.jsx";        // axios instance with auth header

/* ─── MOCK DATA  ‑‑ replace with real GET calls later ───────────── */
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
/* ─────────────────────────────────────────────────────────── */

export default function RoleManager() {
  const { api } = useAuth();          // axios with JWT

  /* data */
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [users, setUsers] = useState([]);

  /* ui state */
  const [activeTab, setActiveTab] = useState("permissions");
  const [dirty, setDirty] = useState(false);

  /* add‑user form */
  const [newEmail, setNewEmail] = useState("");
  const [newPwd,   setNewPwd]   = useState("");
  const [newRole,  setNewRole]  = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* load mock data (swap for real fetch) */
  useEffect(() => {
    setRoles(mockRoles);
    setPerms(mockPerms);
    setUsers(mockUsers);
  }, []);

  /* helpers omitted for brevity – unchanged ... (togglePerm, updateUserRole, etc.) */
  const togglePerm = (roleId, permId) => {
    setRoles(prev =>
      prev.map(r =>
        r.id === roleId
          ? { ...r, perms: r.perms.includes(permId) ? r.perms.filter(p => p !== permId) : [...r.perms, permId] }
          : r
      )
    );
    setDirty(true);
  };
  const updateUserRole = (uid, rid) => {
    setUsers(prev => prev.map(u => (u.id === uid ? { ...u, role_id: rid } : u)));
    setDirty(true);
  };
  const discardChanges = () => { setRoles(mockRoles); setUsers(mockUsers); setDirty(false); };
  const saveChanges = async () => { toast.success("Changes saved (stub)"); setDirty(false); };

  /* create user */
  const createUser = async () => {
    if (!newEmail || !newPwd || !newRole) return toast.error("Fill all fields");
    setSubmitting(true);
    try {
      const res = await api.post("/api/admin/users", {
        email: newEmail,
        password: newPwd,
        role_id: Number(newRole),
      });
      setUsers(prev => [...prev, res.data]);
      setNewEmail(""); setNewPwd(""); setNewRole("");
      toast.success("User created");
    } catch (err) {
      toast.error(err.response?.data?.message || "Create user failed");
    } finally {
      setSubmitting(false);
    }
  };

  /* ──────────────── render ──────────────── */
  return (
    <div className="min-h-screen bg-gray-100 p-6 space-y-12">
      <h1 className="text-3xl font-bold text-gray-800">Access Control</h1>

      {dirty && (
        <div className="sticky top-[76px] bg-white/90 backdrop-blur border-y py-3 flex gap-3 px-4 z-20">
          <button onClick={saveChanges}    className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700">Save changes</button>
          <button onClick={discardChanges} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Discard</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-6">
        {/* Tabs */}
        <div className="flex gap-6 border-b mb-6">
          {["permissions","users","adduser"].map(id => (
            <button
              key={id}
              className={clsx("py-2 font-semibold",
                activeTab===id ? "border-b-2 border-cyan-600 text-cyan-700" : "text-gray-500 hover:text-gray-700")}
              onClick={()=>setActiveTab(id)}
            >
              {id === "permissions" ? "Permissions" : id === "users" ? "Users" : "Add User"}
            </button>
          ))}
        </div>

        {/* ---------- TAB 3 : Add User (wrapped in <form>) ---------- */}
        {activeTab==="adduser" && (
          <form
            onSubmit={(e)=>{e.preventDefault(); createUser();}}
            className="max-w-sm space-y-4"
          >
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e)=>setNewEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Temporary Password</label>
              <input
                type="password"
                required
                value={newPwd}
                onChange={(e)=>setNewPwd(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select
                required
                value={newRole}
                onChange={(e)=>setNewRole(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Choose…</option>
                {roles.map(r=>(
                  <option key={r.id} value={r.id}>{r.name}</option>
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
                  : "bg-cyan-600 hover:bg-cyan-700")}
            >
              {submitting ? "Creating…" : "Create User"}
            </button>
          </form>
        )}

        {/* ---------- TAB 1 & TAB 2 remain unchanged ---------- */}
        {activeTab==="permissions" && (
          <div className="overflow-auto">
            {/* … permissions matrix (unchanged) … */}
          </div>
        )}

        {activeTab==="users" && (
          <div className="overflow-auto max-w-3xl">
            {/* … users table (unchanged) … */}
          </div>
        )}
      </div>
    </div>
  );
}
