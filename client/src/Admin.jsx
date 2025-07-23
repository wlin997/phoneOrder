import React, { useEffect, useState, useRef } from 'react';
import NavMenu from './components/NavMenu';
import ErrorBoundary from './components/ErrorBoundary';

const generateRange = (start, end) => {
  return Array.from({ length: (end - start + 1) }, (_, i) => start + i);
};

const padZero = (num) => String(num).padStart(2, '0');

/*────────────────────────────────────────────────────
  Password Policy Constants (Mirror Backend)
────────────────────────────────────────────────────*/
const PASSWORD_POLICY = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
};

/*────────────────────────────────────────────────────
  Password Validation Helper (Mirror Backend)
────────────────────────────────────────────────────*/
function validatePassword(password) {
  if (password.length === 0) {
    return null; // Allow empty password for optional update, backend will handle 'required'
  }
  if (password.length < PASSWORD_POLICY.minLength) {
    return `Password must be at least ${PASSWORD_POLICY.minLength} characters long.`;
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)) {
    return "Password must contain at least one number.";
  }
  if (PASSWORD_POLICY.requireSpecialChar && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return "Password must contain at least one special character.";
  }
  return null; // Password is valid
}


export default function Admin() {
  const [printerSettings, setPrinterSettings] = useState({
    mode: 'LAN',
    url: '',
    contentType: 'text/html',
  });
  const [appSettings, setAppSettings] = useState({
    timezone: 'America/New_York',
    reportStartHour: '8',
    archiveCronSchedule: '0 2 * * *',
  });
  const [printerStatus, setPrinterStatus] = useState('Checking...');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const [vapiSettings, setVapiSettings] = useState({
    apiKey: '',
    assistantId: '',
    fileId: '',
  });

  // NEW: State for new user form
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role_id: '',
  });
  const [newUserPasswordError, setNewUserPasswordError] = useState(null); // NEW: Password validation error for new user
  const [newUserError, setNewUserError] = useState(null); // NEW: General error for new user creation

  // NEW: State for user list and roles for user management section
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [editingUser, setEditingUser] = useState(null); // User currently being edited
  const [editPassword, setEditPassword] = useState(''); // Password for editing user
  const [editPasswordError, setEditPasswordError] = useState(null); // Password validation error for editing user
  const [editUserError, setEditUserError] = useState(null); // General error for editing user

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const printRes = await fetch(`${import.meta.env.VITE_API_URL}/api/print-settings`);
        if (printRes.ok) {
          const printData = await printRes.json();
          setPrinterSettings({
            mode: printData.mode || 'LAN',
            url: printData.printerUrl || '',
            contentType: printData.contentType || 'text/html',
          });
        } else {
          console.error(`Failed to fetch printer settings: ${printRes.status}`);
        }

        const appRes = await fetch(`${import.meta.env.VITE_API_URL}/api/app-settings`);
        if (appRes.ok) {
          const appData = await appRes.json();
          setAppSettings(appData);
        } else {
          console.error(`Failed to fetch app settings: ${appRes.status}`);
        }
      } catch (err) {
        console.error('[Admin.jsx] Could not load initial settings, using defaults.', err.message);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const checkPrinterStatus = async () => {
      if (!printerSettings.url) {
        setPrinterStatus('No URL configured');
        return;
      }
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/printer-status`);
        if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
        const data = await response.json();
        setPrinterStatus(data.available ? 'Online' : `Not Available (${data.error || 'Unknown error'})`);
      } catch (err) {
        setPrinterStatus(`Offline or Unreachable`);
      }
    };
    checkPrinterStatus();
    const intervalId = setInterval(checkPrinterStatus, 60000);
    return () => clearInterval(intervalId);
  }, [printerSettings.url]);

  // NEW: Load users and roles for user management
  useEffect(() => {
    const loadUsersAndRoles = async () => {
      try {
        const usersRes = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/users`);
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setUsers(usersData);
        } else {
          console.error(`Failed to fetch users: ${usersRes.status}`);
        }

        const rolesRes = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/roles`);
        if (rolesRes.ok) {
          const rolesData = await rolesRes.json();
          setRoles(rolesData);
        } else {
          console.error(`Failed to fetch roles: ${rolesRes.status}`);
        }
      } catch (err) {
        console.error('Error loading users or roles:', err.message);
      }
    };
    loadUsersAndRoles();
  }, []);


  const handleMenuOpen = () => setIsMenuOpen((prev) => !prev);
  const handleMenuClose = () => setIsMenuOpen(false);

  const handleAppSettingsChange = (e) => {
    const { name, value } = e.target;
    setAppSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handlePrinterSettingsChange = (e) => {
    const { name, value } = e.target;
    if (name === 'mode') {
      setPrinterSettings((prev) => ({ ...prev, [name]: value, url: '' }));
    } else {
      setPrinterSettings((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleCronChange = (e) => {
    const { name, value } = e.target;
    const [currentMinute, currentHour] = appSettings.archiveCronSchedule.split(' ');

    let newCronString = '';
    if (name === 'hour') {
      newCronString = `${currentMinute} ${value} * * *`;
    } else {
      newCronString = `${value} ${currentHour} * * *`;
    }
    setAppSettings((prev) => ({ ...prev, archiveCronSchedule: newCronString }));
  };

  const handleSaveAppSettings = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/app-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appSettings),
      });
      if (!res.ok) throw new Error(`Failed to save app settings: ${res.status}`);
      alert('Application settings saved successfully!\nNote: Some changes require a server restart.');
    } catch (err) {
      console.error('[Admin.jsx] Error saving app settings:', err.message);
      alert('Failed to save application settings.');
    }
  };

  const handleSavePrinterSettings = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/print-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: printerSettings.mode,
          printerUrl: printerSettings.url.trim(),
          contentType: printerSettings.contentType,
        }),
      });
      if (!res.ok) throw new Error(`Failed to save printer settings: ${res.status}`);
      alert('Printer settings saved successfully!');
    } catch (err) {
      console.error('[Admin.jsx] Error saving printer settings:', err.message);
      alert('Failed to save printer settings.');
    }
  };

  // Load VAPI settings from backend on mount
  useEffect(() => {
    const loadVapiSettings = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/vapi-settings`);
        if (res.ok) {
          const data = await res.json();
          setVapiSettings({
            apiKey: data.api_key || '',
            assistantId: data.assistant_id || '',
            fileId: data.file_id || '',
          });
        }
      } catch (err) {
        console.error('Error loading VAPI settings:', err);
      }
    };
    loadVapiSettings();
  }, []);

  // Handle VAPI settings input changes
  const handleVapiSettingsChange = (e) => {
    const { name, value } = e.target;
    setVapiSettings((prev) => ({ ...prev, [name]: value }));
  };

  // Save VAPI settings to backend
  const handleSaveVapiSettings = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/vapi-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vapiSettings),
      });
      if (!res.ok) throw new Error('Failed to save VAPI settings');
      alert('VAPI settings saved successfully!');
    } catch (err) {
      console.error('Error saving VAPI settings:', err);
      alert('Failed to save VAPI settings.');
    }
  };

  // NEW: Handle new user form changes
  const handleNewUserChange = (e) => {
    const { name, value } = e.target;
    setNewUser((prev) => {
      const updatedUser = { ...prev, [name]: value };
      if (name === 'password') {
        setNewUserPasswordError(validatePassword(value)); // Validate password on change
      }
      return updatedUser;
    });
  };

  // NEW: Handle new user submission
  const handleCreateUser = async () => {
    setNewUserError(null);
    const passwordError = validatePassword(newUser.password);
    if (passwordError) {
      setNewUserPasswordError(passwordError);
      return;
    }

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `Failed to create user: ${res.status}`);
      }
      alert('User created successfully!');
      setNewUser({ name: '', email: '', password: '', role_id: '' }); // Clear form
      setNewUserPasswordError(null);
      // Refresh user list
      const usersRes = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/users`);
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
    } catch (err) {
      console.error('Error creating user:', err.message);
      setNewUserError(err.message);
    }
  };

  // NEW: Handle editing user
  const handleEditUser = (user) => {
    setEditingUser({ ...user, password: '' }); // Load user data, clear password
    setEditPassword(''); // Clear edit password field
    setEditPasswordError(null);
    setEditUserError(null);
  };

  // NEW: Handle changes in editing user form
  const handleEditingUserChange = (e) => {
    const { name, value } = e.target;
    setEditingUser((prev) => {
      const updatedUser = { ...prev, [name]: value };
      if (name === 'password') {
        setEditPassword(value);
        setEditPasswordError(validatePassword(value)); // Validate password on change
      }
      return updatedUser;
    });
  };

  // NEW: Handle save edited user
  const handleSaveEditedUser = async () => {
    setEditUserError(null);
    if (editPassword && editPasswordError) { // Check if password is provided AND has an error
      return;
    }

    const payload = {
      name: editingUser.name,
      email: editingUser.email,
      role_id: editingUser.role_id,
    };
    if (editPassword) { // Only include password if it's been changed
      payload.password = editPassword;
    }

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `Failed to update user: ${res.status}`);
      }
      alert('User updated successfully!');
      setEditingUser(null); // Close edit form
      setEditPassword('');
      setEditPasswordError(null);
      // Refresh user list
      const usersRes = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/users`);
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
    } catch (err) {
      console.error('Error updating user:', err.message);
      setEditUserError(err.message);
    }
  };

  // NEW: Handle delete user
  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `Failed to delete user: ${res.status}`);
      }
      alert('User deleted successfully!');
      // Refresh user list
      const usersRes = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/users`);
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
    } catch (err) {
      console.error('Error deleting user:', err.message);
      alert(`Failed to delete user: ${err.message}`);
    }
  };


  const [cronMinute, cronHour] = appSettings.archiveCronSchedule.split(' ');

  const commonButtonClasses = "w-full py-2 rounded-lg transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50 bg-cyan-500 text-white hover:bg-cyan-600";

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100 p-6 font-sans antialiased text-gray-800">
        <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={handleMenuClose} />

        <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Admin Settings</h2>

          {/* Application Settings Section */}
          <div className="mb-8 p-4 border rounded-lg bg-gray-50">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">Application Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block mb-2 font-medium text-gray-600">Timezone</label>
                <select
                  name="timezone"
                  value={appSettings.timezone}
                  onChange={handleAppSettingsChange}
                  className="w-full p-2 border rounded bg-white"
                >
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="America/Phoenix">Arizona (No DST)</option>
                  <option value="America/Anchorage">Alaska Time</option>
                  <option value="Pacific/Honolulu">Hawaii Time</option>
                </select>
              </div>
              <div>
                <label className="block mb-2 font-medium text-gray-600">Report Start Hour</label>
                <select
                  name="reportStartHour"
                  value={appSettings.reportStartHour}
                  onChange={handleAppSettingsChange}
                  className="w-full p-2 border rounded bg-white"
                >
                  {generateRange(0, 23).map((hour) => (
                    <option key={hour} value={hour}>
                      {padZero(hour)}:00
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-2 font-medium text-gray-600">Daily Order Archiving Time</label>
                <div className="flex gap-4">
                  <select
                    name="hour"
                    value={cronHour}
                    onChange={handleCronChange}
                    className="w-full p-2 border rounded bg-white"
                  >
                    {generateRange(0, 23).map((hour) => (
                      <option key={hour} value={hour}>
                        Hour: {padZero(hour)}
                      </option>
                    ))}
                  </select>
                  <select
                    name="minute"
                    value={cronMinute}
                    onChange={handleCronChange}
                    className="w-full p-2 border rounded bg-white"
                  >
                    {generateRange(0, 59).map((min) => (
                      <option key={min} value={min}>
                        Minute: {padZero(min)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <button
              onClick={handleSaveAppSettings}
              className={commonButtonClasses + " mt-6"}
            >
              Save Application Settings
            </button>
            <p className="text-xs text-amber-600 font-semibold text-center mt-2">
              Note: Timezone and Archiving changes require a server restart.
            </p>
          </div>

          {/* Printer Settings Section */}
          <div className="mb-8 p-4 border rounded-lg bg-gray-50">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">Printer Configuration</h3>
            <label className="block mb-2 font-medium text-gray-600">Select Print Mode:</label>
            <select
              name="mode"
              value={printerSettings.mode}
              onChange={handlePrinterSettingsChange}
              className="w-full p-2 border rounded mb-4"
            >
              <option value="LAN">LAN (Push to IP)</option>
              <option value="CLOUD">CloudPRNT (Printer Pulls)</option>
              <option value="MOCK">Mock (n8n Webhook)</option>
            </select>

            <label className="block mb-2 font-medium text-gray-600">
              {printerSettings.mode === 'LAN'
                ? 'Printer IP Address:'
                : 'Printer/Webhook URL:'}
            </label>
            <input
              name="url"
              type="text"
              value={printerSettings.url}
              onChange={handlePrinterSettingsChange}
              className="w-full p-2 border rounded mb-4"
              placeholder={
                printerSettings.mode === 'CLOUD'
                  ? 'e.g., https://your-id.cloudprnt.net/...'
                  : printerSettings.mode === 'MOCK'
                  ? 'e.g., https://n8n.example.com/webhook/...'
                  : 'e.g., 192.168.1.45'
              }
            />
            <button
              onClick={handleSavePrinterSettings}
              className="w-full bg-cyan-500 text-white py-2 rounded-lg hover:bg-cyan-600 transition-colors"
            >
              Save Printer Settings
            </button>
          </div>

          {/* VAPI Configuration Section */}
          <div className="mb-8 p-4 border rounded-lg bg-gray-50">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">VAPI Configuration</h3>
            <form>
              <div className="space-y-4">
                <div>
                  <label className="block mb-2 font-medium text-gray-600">VAPI API Key</label>
                  <input
                    name="apiKey"
                    type="password"
                    value={vapiSettings.apiKey}
                    onChange={handleVapiSettingsChange}
                    className="w-full p-2 border rounded"
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <label className="block mb-2 font-medium text-gray-600">Assistant ID</label>
                  <input
                    name="assistantId"
                    type="text"
                    value={vapiSettings.assistantId}
                    onChange={handleVapiSettingsChange}
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block mb-2 font-medium text-gray-600">File ID</label>
                  <input
                    name="fileId"
                    type="text"
                    value={vapiSettings.fileId}
                    onChange={handleVapiSettingsChange}
                    className="w-full p-2 border rounded"
                    placeholder="Enter File ID (e.g., cb8a21d2-e264-4791-a0bb-0847d73592d4)..."
                  />
                </div>
              </div>
              <button
                onClick={handleSaveVapiSettings}
                type="button"
                className={commonButtonClasses + " mt-6"}
              >
                Save VAPI Settings
              </button>
            </form>
          </div>

          {/* User Management Section (NEW) */}
          <div className="mb-8 p-4 border rounded-lg bg-gray-50">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">User Management</h3>

            {/* Create New User Form */}
            <h4 className="text-lg font-semibold mb-3 text-gray-700">Create New User</h4>
            <div className="space-y-3 mb-4">
              <input
                type="text"
                name="name"
                value={newUser.name}
                onChange={handleNewUserChange}
                placeholder="Name"
                className="w-full p-2 border rounded"
                required
              />
              <input
                type="email"
                name="email"
                value={newUser.email}
                onChange={handleNewUserChange}
                placeholder="Email"
                className="w-full p-2 border rounded"
                required
              />
              <input
                type="password"
                name="password"
                value={newUser.password}
                onChange={handleNewUserChange}
                placeholder="Password"
                className="w-full p-2 border rounded"
                required
              />
              {newUserPasswordError && (
                <p className="text-red-500 text-sm">{newUserPasswordError}</p>
              )}
              <select
                name="role_id"
                value={newUser.role_id}
                onChange={handleNewUserChange}
                className="w-full p-2 border rounded bg-white"
                required
              >
                <option value="">Select Role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </div>
            {newUserError && (
              <p className="text-red-500 text-sm mb-4">{newUserError}</p>
            )}
            <button
              onClick={handleCreateUser}
              className={commonButtonClasses + " mb-8"}
              disabled={!!newUserPasswordError} // Disable if password has client-side error
            >
              Create User
            </button>

            {/* User List */}
            <h4 className="text-lg font-semibold mb-3 text-gray-700">Existing Users</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white rounded-lg shadow overflow-hidden">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800">{user.name}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800">{user.email}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800">{user.role_name}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="text-indigo-600 hover:text-indigo-900 mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Edit User Modal/Form */}
            {editingUser && (
              <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center">
                <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                  <h4 className="text-xl font-semibold mb-4 text-gray-700">Edit User</h4>
                  <div className="space-y-3 mb-4">
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <input
                      type="text"
                      name="name"
                      value={editingUser.name}
                      onChange={handleEditingUserChange}
                      className="w-full p-2 border rounded"
                      required
                    />
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={editingUser.email}
                      onChange={handleEditingUserChange}
                      className="w-full p-2 border rounded"
                      required
                    />
                    <label className="block text-sm font-medium text-gray-700">New Password (optional)</label>
                    <input
                      type="password"
                      name="password"
                      value={editPassword} // Use separate state for edit password input
                      onChange={handleEditingUserChange}
                      placeholder="Leave blank to keep current password"
                      className="w-full p-2 border rounded"
                    />
                    {editPasswordError && (
                      <p className="text-red-500 text-sm">{editPasswordError}</p>
                    )}
                    <label className="block text-sm font-medium text-gray-700">Role</label>
                    <select
                      name="role_id"
                      value={editingUser.role_id}
                      onChange={handleEditingUserChange}
                      className="w-full p-2 border rounded bg-white"
                      required
                    >
                      <option value="">Select Role</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  {editUserError && (
                    <p className="text-red-500 text-sm mb-4">{editUserError}</p>
                  )}
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setEditingUser(null)}
                      className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEditedUser}
                      className={commonButtonClasses + " w-auto px-4"}
                      disabled={!!editPasswordError} // Disable if password has client-side error
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
