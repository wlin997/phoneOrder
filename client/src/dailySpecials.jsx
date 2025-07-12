import React, { useState, useEffect, useRef } from 'react';
import NavMenu from './components/NavMenu';
import ErrorBoundary from './components/ErrorBoundary';

export default function DailySpecialsManager() {
  const [fileList, setFileList] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [dailySpecials, setDailySpecials] = useState([]);
  const [selectedFileContent, setSelectedFileContent] = useState('');
  const [status, setStatus] = useState({ message: '', type: '' });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [dataSource, setDataSource] = useState('vapi'); // 'vapi' or 'postgres'
  const menuRef = useRef(null);

  // Helper function to generate a simple UUID-like string
  const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
      });
  };

  /**
   * Fetches the list of files from VAPI via the backend endpoint `/api/vapi/files`.
   * This endpoint internally retrieves the VAPI API key and assistant ID from the database
   * and then calls the VAPI API to get the list of files.
   */
  const fetchFileList = async () => {
    setStatus({ message: 'Fetching VAPI file list...', type: 'info' });
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/vapi/files`);
      if (res.ok) {
        const data = await res.json();
        setFileList(data);
        const defaultFile = data.find(f => f.name === 'daily_specials.json');
        if (defaultFile && !selectedFileId && dataSource === 'vapi') {
          fetchFileContent(defaultFile.id);
        }
        setStatus({ message: 'VAPI file list retrieved successfully!', type: 'success' });
      } else {
        const errorText = await res.text();
        console.error('Failed to retrieve VAPI file list from backend:', errorText);
        setStatus({ message: `Failed to retrieve VAPI file list: ${errorText.substring(0, 100)}...`, type: 'error' });
        setFileList([]);
      }
    } catch (err) {
      console.error('Error fetching VAPI file list:', err);
      setStatus({ message: `Error retrieving VAPI file list: ${err.message}`, type: 'error' });
      setFileList([]);
    }
  };

  /**
   * Fetches the content of a specific file from VAPI via the backend endpoint
   * `/api/vapi/files/:fileId/content`.
   * @param {string} fileId The ID of the file whose content is to be fetched.
   */
  const fetchFileContent = async (fileId) => {
    setStatus({ message: 'Fetching selected file content...', type: 'info' });
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/vapi/files/${fileId}/content`);
      if (res.ok) {
        const data = await res.json();
        if (data.daily_specials && Array.isArray(data.daily_specials)) {
          setDailySpecials(data.daily_specials.map(item => ({
            ...item,
            price: item.price !== undefined ? parseFloat(item.price) : '' // Set to empty string if price is 0 or undefined for better UX
          })));
        } else {
          setDailySpecials([]);
          setStatus({ message: 'Warning: Fetched content is not in expected daily specials format.', type: 'warning' });
        }
        setSelectedFileContent(JSON.stringify(data, null, 2));
        setSelectedFileId(fileId);
        setStatus({ message: 'File content retrieved successfully!', type: 'success' });
      } else {
        const errorText = await res.text();
        console.error('Failed to retrieve file content from backend:', errorText);
        setStatus({ message: `Failed to retrieve file content: ${errorText.substring(0, 100)}...`, type: 'error' });
        setSelectedFileContent('');
        setDailySpecials([]);
      }
    } catch (err) {
      console.error('Error fetching file content:', err);
      setStatus({ message: `Error retrieving file content: ${err.message}`, type: 'error' });
      setSelectedFileContent('');
      setDailySpecials([]);
    }
  };

  /**
   * Updates the content of the currently selected VAPI file via the backend endpoint
   * `/api/daily-specials`. This endpoint internally handles deleting the old file
   * and uploading a new one with the updated content.
   */
  const updateSelectedFileContent = async () => {
    if (!selectedFileId || dataSource !== 'vapi') return;
    setStatus({ message: 'Updating selected file content...', type: 'info' });
    try {
      const payloadToSend = {
        daily_specials: dailySpecials.map(item => ({
          ...item,
          price: item.price === '' ? 0 : parseFloat(item.price) || 0 // Ensure price is number for sending
        }))
      };
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/daily-specials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToSend),
      });
      if (res.ok) {
        const responseData = await res.json();
        setStatus({ message: responseData.message || 'File content updated successfully!', type: 'success' });
        fetchFileList();
      } else {
        const errorText = await res.text();
        console.error('Failed to update file content from backend:', errorText);
        setStatus({ message: `Failed to update file content: ${errorText.substring(0, 100)}...`, type: 'error' });
      }
    } catch (err) {
      console.error('Error updating file content:', err);
      setStatus({ message: `Error updating file content: ${err.message}`, type: 'error' });
    }
  };

  const fetchBusinesses = async () => {
    setStatus({ message: 'Fetching businesses...', type: 'info' });
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/businesses`);
      if (res.ok) {
        const data = await res.json();
        setBusinesses(data);
        if (data.length > 0 && !selectedBusinessId) {
          setSelectedBusinessId(data[0].business_id);
          fetchDailySpecials(data[0].business_id);
        }
        setStatus({ message: 'Businesses retrieved successfully!', type: 'success' });
      } else {
        const errorText = await res.text();
        console.error('Failed to retrieve businesses from backend:', errorText);
        setStatus({ message: `Failed to retrieve businesses: ${errorText.substring(0, 100)}...`, type: 'error' });
        setBusinesses([]);
      }
    } catch (err) {
      console.error('Error fetching businesses:', err);
      setStatus({ message: `Error retrieving businesses: ${err.message}`, type: 'error' });
      setBusinesses([]);
    }
  };

  const fetchDailySpecials = async (businessId) => {
    setStatus({ message: 'Fetching daily specials...', type: 'info' });
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/daily-specials?business_id=${businessId}`);
      if (res.ok) {
        const data = await res.json();
        setDailySpecials(data.map(item => ({
          name: item.item_name,
          price: item.price !== undefined ? parseFloat(item.price) : '', // Set to empty string if price is 0 or undefined for better UX
          description: item.item_description,
          id: item.special_id,
        })));
        setSelectedFileContent(JSON.stringify({ daily_specials: data }, null, 2));
        setStatus({ message: 'Daily specials retrieved successfully!', type: 'success' });
      } else {
        const errorText = await res.text();
        console.error('Failed to retrieve daily specials from backend:', errorText);
        setStatus({ message: `Failed to retrieve daily specials: ${errorText.substring(0, 100)}...`, type: 'error' });
        setDailySpecials([]);
      }
    } catch (err) {
      console.error('Error fetching daily specials:', err);
      setStatus({ message: `Error retrieving daily specials: ${err.message}`, type: 'error' });
      setDailySpecials([]);
    }
  };

  const updateDailySpecials = async () => {
    if (!selectedBusinessId || dataSource !== 'postgres') return;
    setStatus({ message: 'Updating daily specials...', type: 'info' });
    try {
      // MODIFIED: Changed the endpoint to target the PostgreSQL specific endpoint
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/daily-specials/postgres`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: selectedBusinessId,
          daily_specials: dailySpecials.map(item => ({
            ...item,
            price: item.price === '' ? 0 : parseFloat(item.price) || 0 // Ensure price is number for sending
          }))
        }),
      });
      if (res.ok) {
        const responseData = await res.json();
        setStatus({ message: responseData.message || 'Daily specials updated successfully!', type: 'success' });
        fetchDailySpecials(selectedBusinessId); // Refresh the list
      } else {
        const errorText = await res.text();
        console.error('Failed to update daily specials from backend:', errorText);
        setStatus({ message: `Failed to update daily specials: ${errorText.substring(0, 100)}...`, type: 'error' });
      }
    } catch (err) {
      console.error('Error updating daily specials:', err);
      setStatus({ message: `Error updating daily specials: ${err.message}`, type: 'error' });
    }
  };

  /**
   * Handles changes in the input fields for individual daily special items.
   * Updates the `dailySpecials` state array immutably.
   * @param {Event} e The change event from the input field.
   * @param {number} index The index of the item being changed in the array.
   * @param {string} field The field name being updated (e.g., 'name', 'price', 'description').
   */
  const handleSpecialChange = (e, index, field) => {
    const { value } = e.target;
    setDailySpecials(prevSpecials => {
      const newSpecials = [...prevSpecials];
      // For price, store as string to allow empty field, convert back to number on save
      newSpecials[index][field] = field === 'price' ? value : value;
      return newSpecials;
    });
  };

  /**
   * Adds a new, empty daily special item to the `dailySpecials` array.
   */
  const addSpecial = () => {
    setDailySpecials(prevSpecials => [
      ...prevSpecials,
      { name: '', price: '', description: '', id: generateUUID() } // Price initialized as empty string
    ]);
  };

  /**
   * Deletes a daily special item from the `dailySpecials` array by its index.
   * @param {number} index The index of the item to delete.
   */
  const deleteSpecial = (indexToDelete) => {
    setDailySpecials(prevSpecials =>
      prevSpecials.filter((_, index) => index !== indexToDelete)
    );
  };

  /**
   * Handles click event on a file name in the list.
   * Calls `fetchFileContent` to load the content of the clicked file.
   * @param {string} fileId The ID of the file that was clicked.
   */
  const handleFileClick = (fileId) => {
    if (dataSource === 'vapi') fetchFileContent(fileId);
  };

  // Toggle between VAPI and PostgreSQL
  const handleToggle = () => {
    setDataSource(prev => (prev === 'vapi' ? 'postgres' : 'vapi'));
  };

  // Handle the update button click
  const handleUpdate = () => {
    if (dataSource === 'postgres') {
      updateDailySpecials();
    } else {
      updateSelectedFileContent();
    }
  };

  // Handle menu toggle
  const handleMenuOpen = () => setIsMenuOpen(prev => !prev);
  const handleMenuClose = () => setIsMenuOpen(false);

  // Effect to load file list or businesses on component mount based on data source
  useEffect(() => {
    if (dataSource === 'vapi') {
      fetchFileList();
    } else {
      fetchBusinesses();
    }
  }, [dataSource]);

  // Effect to update the display-only JSON whenever `dailySpecials` changes
  useEffect(() => {
    try {
      setSelectedFileContent(JSON.stringify({ daily_specials: dailySpecials.map(item => ({
        ...item,
        price: item.price === '' ? 0 : parseFloat(item.price) || 0 // Ensure price is number for display JSON
      }))}, null, 2));
    } catch (e) {
      setSelectedFileContent('Error parsing daily specials to JSON.');
    }
  }, [dailySpecials]);

  // Define a common button class string
  const commonButtonClasses = "w-full py-2 rounded-lg transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50 bg-cyan-500 text-white hover:bg-cyan-600";

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100 p-6 font-sans antialiased text-gray-800">
        {/* Menu Button */}
        
        {/* Navigation Menu */}
        <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={handleMenuClose} />

        {/* Main Content */}
        <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Daily Specials Manager</h2>

          {/* Data Source Toggle */}
          <div className="mb-6 flex items-center justify-center gap-4">
            <label className="text-lg font-medium text-gray-700">Data Source:</label>
            <div className="relative inline-block w-14 align-middle select-none transition duration-200 ease-in">
              <input
                type="checkbox"
                id="data-source-toggle"
                checked={dataSource === 'postgres'}
                onChange={handleToggle}
                className="absolute block w-6 h-6 opacity-0 cursor-pointer"
              />
              <label
                htmlFor="data-source-toggle"
                className={`block overflow-hidden h-7 rounded-full bg-gray-300 ${dataSource === 'postgres' ? 'bg-green-400' : ''}`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${dataSource === 'postgres' ? 'translate-x-7' : 'translate-x-0'}`}
                ></span>
              </label>
            </div>
            <span className="text-lg font-medium text-gray-700">{dataSource === 'postgres' ? 'PostgreSQL' : 'VAPI'}</span>
          </div>

          {/* VAPI File List or Business Selector */}
          <div className="mb-8 p-4 border border-gray-200 rounded-lg bg-gray-50 max-h-64 overflow-y-auto shadow-inner">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">
              {dataSource === 'vapi' ? 'Available VAPI Files' : 'Select Business'}
            </h3>
            {dataSource === 'vapi' ? (
              <>
                {fileList.length > 0 ? (
                  <ul className="space-y-2">
                    {fileList.map((file) => (
                      <li
                        key={file.id}
                        className={`p-2 rounded-lg cursor-pointer transition-colors duration-200
                                  ${selectedFileId === file.id ? 'bg-blue-200 text-blue-800 font-bold shadow-sm' : 'hover:bg-gray-200'}`}
                        onClick={() => handleFileClick(file.id)}
                      >
                        <span className="font-medium">{file.name}</span> <span className="text-sm text-gray-500">({file.id})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-600 text-center py-4">
                    No files found or VAPI settings are not configured. <br />
                    Please ensure your VAPI API Key and Assistant ID are set in the <span className="font-semibold">Admin Settings</span>.
                  </p>
                )}
                <button
                  onClick={fetchFileList}
                  className={commonButtonClasses + " mt-4"}
                >
                  Refresh File List
                </button>
              </>
            ) : (
              <>
                {businesses.length > 0 ? (
                  <select
                    value={selectedBusinessId || ''}
                    onChange={(e) => {
                      const businessId = e.target.value;
                      setSelectedBusinessId(businessId);
                      fetchDailySpecials(businessId);
                    }}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    {businesses.map((business) => (
                      <option key={business.business_id} value={business.business_id}>
                        {business.business_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-gray-600 text-center py-4">No businesses found.</p>
                )}
              </>
            )}
          </div>

          {/* Daily Specials Editor Panel */}
          <div className="mb-8 p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-inner">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">
              {dataSource === 'vapi' ? (selectedFileId ? `Edit: ${fileList.find(f => f.id === selectedFileId)?.name || 'Selected File'}` : 'Select a file above to edit its content') : 'Edit Daily Specials'}
            </h3>

            {((dataSource === 'vapi' && selectedFileId) || (dataSource === 'postgres' && selectedBusinessId)) && (
              <>
                {dailySpecials.length > 0 ? (
                  <div className="space-y-6">
                    {dailySpecials.map((special, index) => (
                      <div key={special.id || index} className="p-4 border border-gray-300 rounded-lg bg-white shadow-sm relative">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Special Item #{index + 1}</h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                            <input
                              type="text"
                              value={special.name || ''}
                              onChange={(e) => handleSpecialChange(e, index, 'name')}
                              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                              placeholder="e.g., Truffle Pasta"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                            <input
                              type="number"
                              step="0.01"
                              value={special.price === '' ? '' : parseFloat(special.price)} // Display empty string if price is empty
                              onChange={(e) => handleSpecialChange(e, index, 'price')}
                              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                              placeholder="e.g., 15.99"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                              value={special.description || ''}
                              onChange={(e) => handleSpecialChange(e, index, 'description')}
                              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                              rows="3"
                              placeholder="e.g., Creamy truffle pasta with shiitake mushrooms"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => deleteSpecial(index)}
                          className="absolute top-2 right-2 text-red-500 hover:text-red-700 p-1 rounded-full bg-red-100 hover:bg-red-200 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                          title="Delete Special"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-4">No specials loaded for this file. Click "Add New Special" to start.</p>
                )}

                <div className="flex justify-between items-center mt-6 gap-4">
                  <button
                    onClick={addSpecial}
                    className={commonButtonClasses}
                  >
                    Add New Special
                  </button>
                  <button
                    onClick={handleUpdate}
                    className={`${commonButtonClasses} ${(!selectedFileId && dataSource === 'vapi' || !selectedBusinessId && dataSource === 'postgres') && 'opacity-50 cursor-not-allowed'}`}
                    disabled={!selectedFileId && dataSource === 'vapi' || !selectedBusinessId && dataSource === 'postgres'}
                  >
                    Update Selected {dataSource === 'vapi' ? 'File' : 'Specials'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Display-Only JSON Content Panel */}
          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-inner">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">File Content (JSON Format) - Display Only</h3>
            <textarea
              value={selectedFileContent}
              readOnly
              className="w-full p-2 border border-gray-300 rounded-lg mb-4 font-mono text-sm bg-gray-100 text-gray-800"
              rows="10"
              placeholder="Selected file content will appear here..."
            />
            <div className={`mt-4 text-center text-sm font-medium ${status.type === 'success' ? 'text-green-600' : status.type === 'error' ? 'text-red-600' : 'text-gray-600'}`}>
              {status.message}
            </div>
          </div>

          {/* Summary Table */}
          {dailySpecials.length > 0 && (
            <div className="mt-8 p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-inner">
              <h3 className="text-xl font-semibold mb-4 text-gray-700">Summary</h3>
              <div className="space-y-2">
                {dailySpecials.map((special, index) => (
                  <div key={special.id || index} className="text-gray-700">
                    Name: {special.name}, Price: ${(parseFloat(special.price) || 0).toFixed(2)}, Description: {special.description}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}