import React, { useState, useEffect, useRef } from 'react';
import NavMenu from './components/NavMenu'; // Adjust path as needed
import ErrorBoundary from './components/ErrorBoundary'; // Adjust path as needed

export default function DailySpecialsManager() {
  const [specials, setSpecials] = useState('');
  const [status, setStatus] = useState({ message: '', type: '' });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Fetch current specials from backend
  const fetchSpecials = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/daily-specials`);
      if (res.ok) {
        const data = await res.json();
        setSpecials(JSON.stringify(data, null, 2));
        setStatus({ message: 'Specials retrieved successfully!', type: 'success' });
      } else {
        setStatus({ message: 'Failed to retrieve specials.', type: 'error' });
      }
    } catch (err) {
      setStatus({ message: 'Error retrieving specials.', type: 'error' });
    }
  };

  // Update specials via backend
  const updateSpecials = async () => {
    try {
      const specialsData = JSON.parse(specials);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/daily-specials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(specialsData),
      });
      if (res.ok) {
        setStatus({ message: 'Specials updated successfully!', type: 'success' });
      } else {
        setStatus({ message: 'Failed to update specials.', type: 'error' });
      }
    } catch (err) {
      setStatus({ message: 'Error updating specials.', type: 'error' });
    }
  };

  // Handle menu toggle
  const handleMenuOpen = () => setIsMenuOpen(prev => !prev);
  const handleMenuClose = () => setIsMenuOpen(false);

  // Load specials on mount
  useEffect(() => {
    fetchSpecials();
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100 p-6 font-sans antialiased text-gray-800">
        {/* Menu Button */}
        <button
          onClick={handleMenuOpen}
          className="fixed top-4 right-4 z-50 text-gray-600 hover:text-gray-800 focus:outline-none p-2 bg-white rounded-full shadow-md"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Navigation Menu */}
        <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={handleMenuClose} />

        {/* Main Content */}
        <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Daily Specials Manager</h2>

          {/* Specials Management Section */}
          <div className="mb-8 p-4 border rounded-lg bg-gray-50">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">Manage Daily Specials</h3>
            <label className="block mb-2 font-medium text-gray-600">Current Daily Specials (JSON format):</label>
            <textarea
              value={specials}
              onChange={(e) => setSpecials(e.target.value)}
              className="w-full p-2 border rounded mb-4"
              placeholder="Enter daily specials in JSON format..."
              rows="10"
            />
            <div className="flex gap-4">
              <button
                onClick={fetchSpecials}
                className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors"
              >
                Retrieve Specials
              </button>
              <button
                onClick={updateSpecials}
                className="bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition-colors"
              >
                Update Specials
              </button>
            </div>
            {/* Status Message */}
            <div className={`mt-4 text-sm ${status.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {status.message}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}