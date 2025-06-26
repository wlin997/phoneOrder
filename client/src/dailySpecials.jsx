import React, { useState, useEffect, useRef } from 'react';
import NavMenu from './components/NavMenu'; // Adjust path as needed
import ErrorBoundary from './components/ErrorBoundary'; // Adjust path as needed

export default function DailySpecialsManager() {
  // State for the list of VAPI files
  const [fileList, setFileList] = useState([]);
  // State for the ID of the currently selected file in VAPI
  const [selectedFileId, setSelectedFileId] = useState(null);
  // State for the structured daily specials data (array of objects)
  const [dailySpecials, setDailySpecials] = useState([]);
  // State for the raw JSON content of the selected file (display only)
  const [selectedFileContent, setSelectedFileContent] = useState('');
  // State for status messages shown to the user
  const [status, setStatus] = useState({ message: '', type: '' });
  // State for controlling the navigation menu visibility
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

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
        setFileList(data); // Set the file list
        // Optionally, if there's a default file (e.g., 'daily_specials.json'), select it
        const defaultFile = data.find(f => f.name === 'daily_specials.json');
        if (defaultFile && !selectedFileId) { // Only auto-select if no file is already selected
          fetchFileContent(defaultFile.id);
        }
        setStatus({ message: 'VAPI file list retrieved successfully!', type: 'success' });
      } else {
        const errorText = await res.text();
        // Log the full error response from the server for debugging
        console.error('Failed to retrieve VAPI file list from backend:', errorText);
        setStatus({ message: `Failed to retrieve VAPI file list: ${errorText.substring(0, 100)}...`, type: 'error' });
        setFileList([]); // Clear file list on error
      }
    } catch (err) {
      console.error('Error fetching VAPI file list:', err);
      // Corrected: Ensure the type string is properly closed with a backtick
      setStatus({ message: `Error retrieving VAPI file list: ${err.message}`, type: 'error' });
      setFileList([]); // Clear file list on error
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
        // The data fetched is the actual content, which should be JSON for daily specials.
        // Set the raw JSON string for display
        setSelectedFileContent(JSON.stringify(data, null, 2));
        // Also parse and set the structured data for the input fields
        if (data.daily_specials && Array.isArray(data.daily_specials)) {
          setDailySpecials(data.daily_specials);
        } else {
          setDailySpecials([]); // Reset if format is unexpected
          setStatus({ message: 'Warning: Fetched content is not in expected daily specials format.', type: 'warning' });
        }
        setSelectedFileId(fileId); // Set the selected file ID
        setStatus({ message: 'File content retrieved successfully!', type: 'success' });
      } else {
        const errorText = await res.text();
        // Log the full error response from the server for debugging
        console.error('Failed to retrieve file content from backend:', errorText);
        setStatus({ message: `Failed to retrieve file content: ${errorText.substring(0, 100)}...`, type: 'error' });
        setSelectedFileContent(''); // Clear content on error
        setDailySpecials([]); // Clear structured data on error
      }
    } catch (err) {
      console.error('Error fetching file content:', err);
      setStatus({ message: `Error retrieving file content: ${err.message}`, type: 'error' });
      setSelectedFileContent(''); // Clear content on error
      setDailySpecials([]); // Clear structured data on error
    }
  };

  /**
   * Updates the content of the currently selected VAPI file via the backend endpoint
   * `/api/daily-specials`. This endpoint internally handles deleting the old file
   * and uploading a new one with the updated content.
   */
  const updateSelectedFileContent = async () => {
    if (!selectedFileId) {
      setStatus({ message: 'No file selected to update.', type: 'error' });
      return;
    }
    setStatus({ message: 'Updating selected file content...', type: 'info' });
    try {
      // Create the payload for the backend. The backend expects { daily_specials: [...] }
      const payloadToSend = {
        daily_specials: dailySpecials
      };

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/daily-specials`, {
        method: 'POST', // Backend uses POST for this update operation (delete+re-upload)
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToSend),
      });

      if (res.ok) {
        const responseData = await res.json();
        setStatus({ message: responseData.message || 'File content updated successfully!', type: 'success' });
        // After successful update, refresh the file list and content to reflect new file ID if changed
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
      if (field === 'price') {
        newSpecials[index][field] = parseFloat(value) || 0; // Convert price to number
      } else {
        newSpecials[index][field] = value;
      }
      return newSpecials;
    });
  };

  /**
   * Adds a new, empty daily special item to the `dailySpecials` array.
   */
  const addSpecial = () => {
    setDailySpecials(prevSpecials => [
      ...prevSpecials,
      { name: '', price: 0.00, description: '' }
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
    fetchFileContent(fileId);
  };

  // Handle menu toggle
  const handleMenuOpen = () => setIsMenuOpen(prev => !prev);
  const handleMenuClose = () => setIsMenuOpen(false);

  // Effect to load file list on component mount
  useEffect(() => {
    fetchFileList();
  }, []);

  // Effect to update the display-only JSON whenever `dailySpecials` changes
  useEffect(() => {
    try {
      setSelectedFileContent(JSON.stringify({ daily_specials: dailySpecials }, null, 2));
    } catch (e) {
      setSelectedFileContent('Error parsing daily specials to JSON.');
    }
  }, [dailySpecials]);


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
        <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg"> {/* Increased max-width for better layout */}
          <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">VAPI File & Daily Specials Manager</h2>

          {/* Top Panel: VAPI File List */}
          <div className="mb-8 p-4 border border-gray-200 rounded-lg bg-gray-50 max-h-64 overflow-y-auto shadow-inner">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">Available VAPI Files</h3>
            {fileList.length > 0 ? (
              <ul className="space-y-2">
                {fileList.map((file) => (
                  <li key={file.id}
                      className={`p-2 rounded-lg cursor-pointer transition-colors duration-200
                                  ${selectedFileId === file.id ? 'bg-blue-200 text-blue-800 font-bold shadow-sm' : 'hover:bg-gray-200'}`}
                      onClick={() => handleFileClick(file.id)}>
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
              onClick={fetchFileList} // Refreshes the file list
              className="w-full mt-4 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              Refresh File List
            </button>
          </div>

          {/* Daily Specials Editor Panel */}
          <div className="mb-8 p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-inner">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">
              {selectedFileId ? `Edit: ${fileList.find(f => f.id === selectedFileId)?.name || 'Selected File'}` : 'Select a file above to edit its content'}
            </h3>

            {selectedFileId && (
              <>
                {dailySpecials.length > 0 ? (
                  <div className="space-y-6">
                    {dailySpecials.map((special, index) => (
                      <div key={index} className="p-4 border border-gray-300 rounded-lg bg-white shadow-sm relative">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Special Item #{index + 1}</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                            <input
                              type="text"
                              value={special.name}
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
                              value={special.price}
                              onChange={(e) => handleSpecialChange(e, index, 'price')}
                              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                              placeholder="e.g., 15.99"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                              value={special.description}
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
                          {/* Trash bin SVG icon */}
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
                    className="flex-1 bg-purple-500 text-white py-2 px-4 rounded-lg hover:bg-purple-600 transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
                  >
                    Add New Special
                  </button>
                  <button
                    onClick={updateSelectedFileContent}
                    className={`flex-1 bg-green-500 text-white py-2 px-4 rounded-lg hover:bg-green-600 transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50
                               ${!selectedFileId && 'opacity-50 cursor-not-allowed'}`}
                    disabled={!selectedFileId}
                  >
                    Update Selected File
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
              readOnly // Make it read-only
              className="w-full p-2 border border-gray-300 rounded-lg mb-4 font-mono text-sm bg-gray-100 text-gray-800"
              rows="10"
              placeholder="Selected file content will appear here..."
            />
            {/* Status Message for the whole page */}
            <div className={`mt-4 text-center text-sm font-medium ${status.type === 'success' ? 'text-green-600' : status.type === 'error' ? 'text-red-600' : 'text-gray-600'}`}>
              {status.message}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
