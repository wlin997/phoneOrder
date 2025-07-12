import React, { useEffect, useState, useRef } from 'react';
import NavMenu from './components/NavMenu';
import ErrorBoundary from './components/ErrorBoundary';

const generateRange = (start, end) => {
  return Array.from({ length: (end - start + 1) }, (_, i) => start + i);
};

const padZero = (num) => String(num).padStart(2, '0');

export default function Admin() {
  // State separated for clarity
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

  // Updated VAPI settings to include fileId
  const [vapiSettings, setVapiSettings] = useState({
    apiKey: '',
    assistantId: '',
    fileId: '', // New field for file ID
  });

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
            fileId: data.file_id || '', // Load file ID from backend
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

  const [cronMinute, cronHour] = appSettings.archiveCronSchedule.split(' ');

  // Define a common button class string
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
              // Applied common button classes
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
              // Retained original specific styling for "Save Printer Settings" as per request
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
                // Applied common button classes
                className={commonButtonClasses + " mt-6"}
              >
                Save VAPI Settings
              </button>
            </form>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
