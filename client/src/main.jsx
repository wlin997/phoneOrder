import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Admin from './Admin.jsx';
import App from './App.jsx';
import Report from './Report.jsx'; // <-- make sure this exists
import './index.css';
import KDS from './KdsComponent.jsx';
import DailySpecials from './dailySpecials.jsx'; // Fixed import

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/report" element={<Report />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/dailySpecials" element={<DailySpecials />} /> // Updated to match import
      <Route path="/kds" element={<KDS />} />
    </Routes>
  </BrowserRouter>
);