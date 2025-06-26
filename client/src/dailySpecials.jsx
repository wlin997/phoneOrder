import React, { useState, useEffect, useRef } from 'react';
import NavMenu from './components/NavMenu'; // Adjust path as needed
import ErrorBoundary from './components/ErrorBoundary'; // Adjust path as needed

export default function DailySpecialsManager() {
  const [fileList, setFileList] = useState([]); // Stores the list of files from VAPI
  const [selectedFileId, setSelectedFileId] = useState(null); // ID of the currently selected file
  const [selectedFileContent, setSelectedFileContent] = useState(''); // Content of the selected file
  const [status, setStatus] = useState({ message: '', type: '' }); // Status messages for the user
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
        setStatus({ message: `Failed to retrieve VAPI file list: ${errorText}`, type: 'error' });
        setFileList([]); // Clear file list on error
      }
    } catch (err) {
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
        // Assuming file content is JSON, stringify for display in textarea
        setSelectedFileContent(JSON.stringify(data, null, 2));
        setSelectedFileId(fileId); // Set the selected file ID
        setStatus({ message: 'File content retrieved successfully!', type: 'success' });
      } else {
        const errorText = await res.text();
        setStatus({ message: `Failed to retrieve file content: ${errorText}`, type: 'error' });
        setSelectedFileContent(''); // Clear content on error
      }
    } catch (err) {
      setStatus({ message: `Error retrieving file content: ${err.message}`, type: 'error' });
      setSelectedFileContent(''); // Clear content on error
    }
  };

  /**
   * Updates the content of the currently selected VAPI file via the backend endpoint
   * `/api/daily-specials`. This endpoint uses the `file_id` stored in your database
   * to determine which VAPI file to update.
   */
  const updateSelectedFileContent = async () => {
    if (!selectedFileId) {
      setStatus({ message: 'No file selected to update.', type: 'error' });
      return;
    }
    setStatus({ message: 'Updating selected file content...', type: 'info' });
    try {
      // Ensure content is valid JSON before sending
      let contentToSave;
      try {
        contentToSave = JSON.parse(selectedFileContent);
      } catch (parseError) {
        setStatus({ message: `Invalid JSON format: ${parseError.message}`, type: 'error' });
        return;
      }

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/daily-specials`, {
        method: 'POST', // Backend uses POST for this update operation
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contentToSave),
      });
      if (res.ok) {
        setStatus({ message: 'File content updated successfully!', type: 'success' });
      } else {
        const errorText = await res.text();
        setStatus({ message: `Failed to update file content: ${errorText}`, type: 'error' });
      }
    } catch (err) {
      setStatus({ message: `Error updating file content: ${err.message}`, type: 'error' });
    }
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

  // Load file list on component mount
  useEffect(() => {
    fetchFileList();
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
        <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-lg"> {/* Increased max-width for better layout */}
          <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">VAPI File & Daily Specials Manager</h2>

          {/* Top Panel: VAPI File List */}
          <div className="mb-8 p-4 border rounded-lg bg-gray-50 max-h-64 overflow-y-auto shadow-inner">
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
          </div>

          {/* Bottom Panel: Selected File Content Editor */}
          <div className="mb-8 p-4 border rounded-lg bg-gray-50 shadow-inner">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">
              {selectedFileId ? `Content of: ${fileList.find(f => f.id === selectedFileId)?.name || 'Selected File'}` : 'Select a file above to view/edit its content'}
            </h3>
            <label htmlFor="file-content" className="block mb-2 font-medium text-gray-600">File Content (JSON format):</label>
            <textarea
              id="file-content"
              value={selectedFileContent}
              onChange={(e) => setSelectedFileContent(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-4 font-mono text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
              placeholder="Select a file from above to load its content, or enter new content here..."
              rows="15"
              disabled={!selectedFileId} // Disable if no file is selected
            />
            <div className="flex gap-4">
              <button
                onClick={fetchFileList} // Refreshes the file list
                className="flex-1 bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors shadow-md"
              >
                Refresh File List
              </button>
              <button
                onClick={updateSelectedFileContent} // Updates the content of the selected file
                className={`flex-1 bg-green-500 text-white py-2 px-4 rounded-lg hover:bg-green-600 transition-colors shadow-md
                           ${!selectedFileId && 'opacity-50 cursor-not-allowed'}`}
                disabled={!selectedFileId}
              >
                Update Selected File
              </button>
            </div>
            {/* Status Message */}
            <div className={`mt-4 text-center text-sm font-medium ${status.type === 'success' ? 'text-green-600' : status.type === 'error' ? 'text-red-600' : 'text-gray-600'}`}>
              {status.message}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
