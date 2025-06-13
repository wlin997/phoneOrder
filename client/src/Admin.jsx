import React, { useEffect, useState, useRef } from 'react';
import NavMenu from './components/NavMenu';
import ErrorBoundary from './components/ErrorBoundary';
import.meta.env.VITE_API_URL;

// Helper to generate a range of numbers for dropdowns
const generateRange = (start, end) => {
    return Array.from({ length: (end - start + 1) }, (_, i) => start + i);
};

// Helper to format numbers with a leading zero
const padZero = (num) => String(num).padStart(2, '0');

export default function Admin() {
  // State for Printer Settings
  const [printMode, setPrintMode] = useState('LAN');
  const [printerUrl, setPrinterUrl] = useState('');
  const [contentType, setContentType] = useState('text/html');
  const [printerStatus, setPrinterStatus] = useState('Checking...');
  
  // State for Application Settings
  const [appSettings, setAppSettings] = useState({
    timezone: 'America/New_York',
    reportStartHour: '8',
    archiveCronSchedule: '0 0 * * *' // Default to midnight
  });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Load both printer and app settings on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const printRes = await fetch(`${import.meta.env.VITE_API_URL}/api/print-settings`);
        if (printRes.ok) {
            const printData = await printRes.json();
            setPrintMode(printData.mode || 'LAN');
            setPrinterUrl(printData.printerUrl || '');
            setContentType(printData.contentType || 'text/html');
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
        console.error('[Admin.jsx] Could not load settings, using defaults. This is expected on first run.', err.message);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const checkPrinterStatus = async () => {
      if (!printerUrl) {
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
  }, [printerUrl]);
  
  // --- FIX: Re-added the logic to clear the printerUrl when changing modes ---
  useEffect(() => {
    setPrinterUrl('');
  }, [printMode]);

  const handleMenuOpen = () => setIsMenuOpen(prev => !prev);
  const handleMenuClose = () => setIsMenuOpen(false);

  // Handle changes for simple app settings fields
  const handleAppSettingsChange = (e) => {
    const { name, value } = e.target;
    setAppSettings(prev => ({...prev, [name]: value}));
  };

  const handleCronChange = (e) => {
    const { name, value } = e.target;
    const currentCron = appSettings.archiveCronSchedule.split(' ');
    
    let newCronString = '';
    if (name === 'hour') {
      newCronString = `${currentCron[0]} ${value} * * *`;
    } else { // minute
      newCronString = `${value} ${currentCron[1]} * * *`;
    }

    setAppSettings(prev => ({...prev, archiveCronSchedule: newCronString }));
  };
  
  const handleSaveAllSettings = async () => {
    try {
      const printRes = await fetch(`${import.meta.env.VITE_API_URL}/api/print-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: printMode,
          printerUrl: printerUrl.trim(),
          contentType,
        }),
      });
      if (!printRes.ok) throw new Error(`Failed to save printer settings: ${printRes.status}`);
      
      const appRes = await fetch(`${import.meta.env.VITE_API_URL}/api/app-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appSettings),
      });
      if (!appRes.ok) throw new Error(`Failed to save app settings: ${appRes.status}`);

      alert('All settings saved successfully! Note: Some changes may require a server restart to take effect.');
    } catch (err) {
      console.error('[Admin.jsx] Error saving settings:', err.message);
      alert('Failed to save settings. Check console for details.');
    }
  };

  const [cronMinute, cronHour] = appSettings.archiveCronSchedule.split(' ');

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100 p-6 font-sans antialiased text-gray-800">
        <button
          onClick={handleMenuOpen}
          className="fixed top-4 right-4 z-50 text-gray-600 hover:text-gray-800 focus:outline-none p-2 bg-white rounded-full shadow-md"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={handleMenuClose} />

        <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Admin Settings</h2>

          {/* --- Application Settings Section --- */}
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
                <p className="text-xs text-amber-600 font-semibold mt-1">Note: Timezone changes require a server restart.</p>
              </div>
              <div>
                <label className="block mb-2 font-medium text-gray-600">Report Start Hour</label>
                <select
                  name="reportStartHour"
                  value={appSettings.reportStartHour}
                  onChange={handleAppSettingsChange}
                  className="w-full p-2 border rounded bg-white"
                >
                  {generateRange(0, 23).map(hour => (
                    <option key={hour} value={hour}>{padZero(hour)}:00</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">The hour the "Today's Activities" chart begins.</p>
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
                    {generateRange(0, 23).map(hour => (
                      <option key={hour} value={hour}>Hour: {padZero(hour)}</option>
                    ))}
                  </select>
                  <select
                    name="minute"
                    value={cronMinute}
                    onChange={handleCronChange}
                    className="w-full p-2 border rounded bg-white"
                  >
                    {generateRange(0, 59).map(min => (
                      <option key={min} value={min}>Minute: {padZero(min)}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-amber-600 font-semibold mt-1">Note: Changes to the archiving time require a server restart to take effect.</p>
              </div>
            </div>
          </div>
          
          {/* --- Printer Settings Section --- */}
          <div className="mb-6 p-4 border rounded-lg bg-gray-50">
             <h3 className="text-xl font-semibold mb-4 text-gray-700">Printer Configuration</h3>
            <div className="text-sm text-gray-700 bg-gray-100 p-3 rounded mb-4">
              <p><b>LAN Mode:</b> Sends the order directly to a printer on your local network.</p>
              <p className="mt-2"><b>CloudPRNT Mode:</b> The printer polls the server for jobs.</p>
              <p className="mt-2"><b>Mock Mode:</b> Sends orders to a webhook for testing.</p>
            </div>

            <label className="block mb-2 font-medium text-gray-600">Select Print Mode:</label>
            <select
              value={printMode}
              onChange={e => setPrintMode(e.target.value)}
              className="w-full p-2 border rounded mb-4"
            >
              <option value="LAN">LAN (Push to IP)</option>
              <option value="CLOUD">CloudPRNT (Printer Pulls)</option>
              <option value="MOCK">Mock (n8n Webhook)</option>
            </select>

            <label className="block mb-2 font-medium text-gray-600">
              {printMode === 'LAN' ? 'Printer IP Address:' : 'Printer/Webhook URL:'}
            </label>
            <input
              type="text"
              value={printerUrl}
              onChange={e => setPrinterUrl(e.target.value)}
              className="w-full p-2 border rounded mb-4"
              // --- FIX: Added the dynamic placeholder back in ---
              placeholder={
                printMode === 'CLOUD'
                  ? 'e.g., https://your-id.cloudprnt.net/StarWebPRNT/Print'
                  : printMode === 'MOCK'
                  ? 'e.g., https://n8n.example.com/webhook/endpoint-id'
                  : 'e.g., 192.168.1.45'
              }
            />
          </div>

          <button
            onClick={handleSaveAllSettings}
            className="w-full bg-cyan-500 text-white py-3 rounded-lg hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-50 transition-all font-semibold"
          >
            Save All Settings
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
}
