import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Admin from './Admin.jsx';
import App from './App.jsx';
import Report from './Report.jsx';
import KDS from './KdsComponent.jsx';
import DailySpecialsManager from './dailySpecials.jsx'; // Corrected import
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/report" element={<Report />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/daily-specials" element={<DailySpecialsManager />} /> {/* Fixed path and component */}
      <Route path="/kds" element={<KDS />} />
    </Routes>
  </BrowserRouter>
);