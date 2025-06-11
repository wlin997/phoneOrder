import React, { useEffect, useState, useRef } from 'react';
import NavMenu from './components/NavMenu';
import ErrorBoundary from './components/ErrorBoundary';

export default function Admin() {
  const [printMode, setPrintMode] = useState('LAN');
  const [printerUrl, setPrinterUrl] = useState('');
  const [contentType, setContentType] = useState('text/html');
  const [printerStatus, setPrinterStatus] = useState('Checking...');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/print-settings');
        if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status}`);
        const data = await res.json();
        console.log('[Admin.jsx] Loaded settings:', data);
        setPrintMode(data.mode || 'LAN');
        setPrinterUrl(data.printerUrl || '');
        setContentType(data.contentType || 'text/html');
        localStorage.setItem('printerSettings', JSON.stringify(data));
      } catch (err) {
        console.error('[Admin.jsx] Error loading settings:', err.message);
        alert('Failed to load printer settings.');
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
        console.log(`[Admin.jsx] Checking printer status for URL: ${printerUrl}`);
        const response = await fetch('http://localhost:3001/api/printer-status');
        if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
        const data = await response.json();
        console.log(`[Admin.jsx] Printer status response:`, data);
        setPrinterStatus(data.available ? 'Online' : `Not Available (${data.error || 'Unknown error'})`);
      } catch (err) {
        console.error('[Admin.jsx] Error checking printer status:', err.message);
        setPrinterStatus(`Offline or Unreachable (${err.message})`);
      }
    };
    checkPrinterStatus();
    const intervalId = setInterval(checkPrinterStatus, 60000);
    return () => clearInterval(intervalId);
  }, [printerUrl]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        const menuButton = menuRef.current.previousElementSibling;
        if (menuButton && !menuButton.contains(event.target)) {
          setIsMenuOpen(false);
        } else if (!menuButton) {
          setIsMenuOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuOpen = () => {
    setIsMenuOpen(prev => !prev);
  };

  const handleMenuClose = () => {
    setIsMenuOpen(false);
  };

  const handleUrlChange = (e) => {
    setPrinterUrl(e.target.value);
  };

  const handleSaveSettings = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/print-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: printMode,
          printerUrl: printerUrl.trim(),
          contentType,
        }),
      });
      if (!res.ok) throw new Error(`Failed to save settings: ${res.status}`);
      const data = await res.json();
      console.log('[Admin.jsx] Saved settings:', data);
      localStorage.setItem('printerSettings', JSON.stringify(data));
      alert('Settings saved successfully!');
    } catch (err) {
      console.error('[Admin.jsx] Error saving settings:', err.message);
      alert('Failed to save settings. Check console for details.');
    }
  };

  // Reset printerUrl to default placeholder when printMode changes
  useEffect(() => {
    let defaultUrl = '';
    switch (printMode) {
      case 'CLOUD':
        defaultUrl = 'e.g., https://your-id.cloudprnt.net/StarWebPRNT/Print';
        break;
      case 'MOCK':
        defaultUrl = 'e.g., https://n8n.example.com/webhook/endpoint-id';
        break;
      case 'LAN':
        defaultUrl = 'e.g., http://192.168.1.45/StarWebPRNT/Print';
        break;
      default:
        defaultUrl = '';
    }
    setPrinterUrl(defaultUrl); // Reset to default placeholder
  }, [printMode]);

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

        <div className="max-w-xl mx-auto p-6 bg-white rounded shadow">
          <h2 className="text-2xl font-bold mb-4 text-center">Admin Settings</h2>

          <div className="text-sm text-gray-700 bg-gray-100 p-3 rounded mb-4">
            <p><b>LAN Mode:</b> Sends the order directly to a printer on your local network using a fixed IP address.</p>
            <p className="mt-2"><b>CloudPRNT Mode:</b> Stores the order on your server. The printer polls the cloud for jobs via Star CloudPRNT every few seconds.</p>
            <p className="mt-2"><b>Mock Mode:</b> Sends orders to an n8n webhook for testing or integration.</p>
          </div>

          <label className="block mb-2 font-medium">Select Print Mode:</label>
          <select
            value={printMode}
            onChange={e => setPrintMode(e.target.value)}
            className="w-full p-2 border rounded mb-6"
          >
            <option value="LAN">LAN (Push to IP)</option>
            <option value="CLOUD">CloudPRNT (Printer Pulls)</option>
            <option value="MOCK">Mock (n8n Webhook)</option>
          </select>

          <label className="block mb-2 font-medium">
            {printMode === 'CLOUD'
              ? 'CloudPRNT Printer URL:'
              : printMode === 'MOCK'
              ? 'n8n Webhook URL:'
              : 'LAN Printer IP Address:'}
          </label>
          <input
            type="text"
            value={printerUrl}
            onChange={handleUrlChange}
            className="w-full p-2 border rounded mb-6"
            placeholder={
              printMode === 'CLOUD'
                ? 'e.g., https://your-id.cloudprnt.net/StarWebPRNT/Print'
                : printMode === 'MOCK'
                ? 'e.g., https://n8n.example.com/webhook/endpoint-id'
                : 'e.g., http://192.168.1.45/StarWebPRNT/Print'
            }
          />

          <div className="mb-4">
            <button
              onClick={async () => {
                if (!printerUrl) {
                  setPrinterStatus('No URL configured');
                  alert('Please enter a printer URL.');
                  return;
                }
                try {
                  console.log(`[Admin.jsx] Manual status check for URL: ${printerUrl}`);
                  const response = await fetch('http://localhost:3001/api/printer-status');
                  if (!response.ok) throw new Error(`Manual status check failed: ${response.status}`);
                  const data = await response.json();
                  console.log(`[Admin.jsx] Manual status response:`, data);
                  setPrinterStatus(data.available ? 'Online' : `Not Available (${data.error || 'Unknown error'})`);
                  alert(`Printer Status: ${data.available ? 'Online' : `Not Available (${data.error})`}`);
                } catch (err) {
                  console.error('[Admin.jsx] Error during manual status check:', err.message);
                  setPrinterStatus(`Offline or Unreachable (${err.message})`);
                  alert(`Failed to check printer status: ${err.message}`);
                }
              }}
              className="w-full bg-gray-200 text-gray-700 py-2 rounded hover:bg-gray-300"
            >
              Check Printer Status
            </button>
            <p className="mt-2 text-sm">
              Printer Status: <span className={printerStatus === 'Online' ? 'text-green-600' : 'text-red-600'}>{printerStatus}</span>
            </p>
          </div>

          <label className="block mb-2 font-medium">Print Content Type:</label>
          <select
            value={contentType}
            onChange={e => setContentType(e.target.value)}
            className="w-full p-2 border rounded mb-6"
          >
            <option value="text/plain">Plain Text</option>
            <option value="text/html">HTML (Styled)</option>
          </select>

          <button
            onClick={handleSaveSettings}
            className="w-full bg-cyan-400 text-white py-2 rounded hover:bg-cyan-500"
          >
            Save Settings
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
}