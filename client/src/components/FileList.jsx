import React, { useEffect, useState } from 'react';

export default function FileList() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchFiles() {
      try {
        const res = await fetch('http://localhost:3001/api/list');
        if (!res.ok) throw new Error('Failed to fetch files');
        const data = await res.json();
        setFiles(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchFiles();
  }, []);

  if (loading) return <p>Loading orders...</p>;
  if (error) return <p>Error: {error}</p>;
  if (files.length === 0) return <p>No orders found.</p>;

  return (
    <div>
      <h2>Pickup Orders</h2>
      <ul>
        {files.map(({ id, name }) => (
          <li key={id}>
            <a href={`http://localhost:3001/api/files/${id}`} target="_blank" rel="noopener noreferrer">
              {name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}