// ✅ Full Revised dailySpecials.jsx (frontend)
import React, { useState, useEffect, useRef } from 'react';
import NavMenu from './components/NavMenu';
import ErrorBoundary from './components/ErrorBoundary';

export default function DailySpecialsManager() {
  const [dailySpecials, setDailySpecials] = useState([]);
  const [selectedFileContent, setSelectedFileContent] = useState('');
  const [status, setStatus] = useState({ message: '', type: '' });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const generateUUID = () => crypto.randomUUID();

  const fetchDailySpecials = async () => {
    setStatus({ message: 'Fetching daily specials...', type: 'info' });
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/menu-items?category=special`);
      if (res.ok) {
        const data = await res.json();
        setDailySpecials(data.map(item => ({
          name: item.item_name,
          price: item.base_price,
          description: item.description,
          id: item.item_id
        })));
        setStatus({ message: 'Daily specials retrieved successfully!', type: 'success' });
      } else {
        const errorText = await res.text();
        setStatus({ message: `Failed to retrieve: ${errorText}`, type: 'error' });
        setDailySpecials([]);
      }
    } catch (err) {
      setStatus({ message: `Error: ${err.message}`, type: 'error' });
      setDailySpecials([]);
    }
  };

  const updateDailySpecials = async () => {
    setStatus({ message: 'Updating daily specials...', type: 'info' });
    try {
      const payload = {
        daily_specials: dailySpecials.map(item => ({
          name: item.name,
          price: parseFloat(item.price) || 0,
          description: item.description
        }))
      };

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/menu-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const json = await res.json();
        setStatus({ message: json.message || 'Update successful', type: 'success' });
        fetchDailySpecials();
      } else {
        const errorText = await res.text();
        setStatus({ message: `Failed to update: ${errorText}`, type: 'error' });
      }
    } catch (err) {
      setStatus({ message: `Error updating: ${err.message}`, type: 'error' });
    }
  };

  const handleSpecialChange = (e, index, field) => {
    const { value } = e.target;
    setDailySpecials(prev => {
      const updated = [...prev];
      updated[index][field] = value;
      return updated;
    });
  };

  const addSpecial = () => {
    setDailySpecials(prev => [...prev, { name: '', price: '', description: '', id: generateUUID() }]);
  };

  const deleteSpecial = (index) => {
    setDailySpecials(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    fetchDailySpecials();
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100 p-6 font-sans text-gray-800">
        <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={() => setIsMenuOpen(false)} />
        <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-6 text-center">Daily Specials Manager</h2>
          <div className="mb-8 p-4 border rounded bg-gray-50">
            <h3 className="text-xl font-semibold mb-4">Edit Daily Specials</h3>
            {dailySpecials.length > 0 ? dailySpecials.map((item, index) => (
              <div key={item.id} className="mb-4 p-4 border rounded bg-white shadow-sm relative">
                <h4 className="font-semibold mb-2">Special Item #{index + 1}</h4>
                <input className="w-full mb-2 p-2 border rounded" placeholder="Name" value={item.name} onChange={e => handleSpecialChange(e, index, 'name')} />
                <input className="w-full mb-2 p-2 border rounded" type="number" step="0.01" placeholder="Price" value={item.price} onChange={e => handleSpecialChange(e, index, 'price')} />
                <textarea className="w-full mb-2 p-2 border rounded" placeholder="Description" value={item.description} onChange={e => handleSpecialChange(e, index, 'description')} />
                <button onClick={() => deleteSpecial(index)} className="absolute top-2 right-2 text-red-500">🗑</button>
              </div>
            )) : <p>No specials loaded. Click below to start.</p>}
            <div className="flex justify-between mt-4">
              <button onClick={addSpecial} className="px-4 py-2 bg-green-500 text-white rounded">Add New Special</button>
              <button onClick={updateDailySpecials} className="px-4 py-2 bg-blue-600 text-white rounded">Update Selected Specials</button>
            </div>
          </div>
          <div className="p-4 text-center text-sm text-gray-700">
            {status.message && (
              <p className={status.type === 'success' ? 'text-green-600' : status.type === 'error' ? 'text-red-600' : 'text-gray-700'}>
                {status.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
} 
