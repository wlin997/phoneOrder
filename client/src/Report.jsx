import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid, ComposedChart, Area, LabelList
} from 'recharts';
import NavMenu from './components/NavMenu';
import ErrorBoundary from './components/ErrorBoundary';

function Report() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [range, setRange] = useState('7');
  const [dateData, setDateData] = useState([]);
  const [popularItems, setPopularItems] = useState([]);
  const [hourlyData, setHourlyData] = useState([]);
  const [customerStats, setCustomerStats] = useState({
    totalOrders: 0,
    repeatCustomers: 0,
    topCustomers: []
  });
  const menuRef = useRef(null);

  const generateDateRange = (days) => {
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  };

  const fetchHourlyData = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/hourly-orders');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const formattedData = Object.entries(data).map(([hour, count]) => ({ hour, count }));
      setHourlyData(formattedData);
    } catch (err) {
      console.error('Failed to fetch hourly data:', err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const statsUrl = `http://localhost:3001/api/order-stats?range=${range}`;
        const itemsUrl = `http://localhost:3001/api/popular-items?range=${range}`;
        const customerStatsUrl = `http://localhost:3001/api/customer-stats?range=${range}`;

        const [statsRes, itemsRes, customerStatsRes] = await Promise.all([
          fetch(statsUrl),
          fetch(itemsUrl),
          fetch(customerStatsUrl)
        ]);

        if (!statsRes.ok || !itemsRes.ok || !customerStatsRes.ok) {
            throw new Error('Failed to fetch all report data.');
        }

        const statsJson = await statsRes.json();
        const itemsJson = await itemsRes.json();
        const customerStatsJson = await customerStatsRes.json();
        
        setCustomerStats(customerStatsJson);

        const dateRange = generateDateRange(parseInt(range, 10) || 7);
        const formattedDateData = dateRange.map(date => ({ date, count: statsJson[date] || 0 }));
        setDateData(formattedDateData);
        
        const formattedItems = Object.entries(itemsJson)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        setPopularItems(formattedItems);
        
      } catch (err) {
        console.error('Failed to fetch report data:', err);
      }
    };

    fetchData();
    fetchHourlyData();
    
    const intervalId = setInterval(fetchHourlyData, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [range]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        const menuButton = menuRef.current.previousElementSibling;
        if (menuButton && !menuButton.contains(event.target)) setIsMenuOpen(false);
        else if (!menuButton) setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuOpen = () => setIsMenuOpen(prev => !prev);
  const handleMenuClose = () => setIsMenuOpen(false);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100 text-gray-800">
        <button
          onClick={handleMenuOpen}
          className="fixed top-4 right-4 z-50 text-gray-600 hover:text-gray-800 focus:outline-none p-2 bg-white rounded-full shadow-md"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>

        <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={handleMenuClose} />

        <div className="mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[1800px]">
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <main className="space-y-8">
              <h2 className="text-2xl font-bold text-gray-800">Order Report</h2>
              
              <div className="flex gap-4 mb-6">
                {['7', '14', '30', '60', '90', 'YTD'].map(option => (
                  <button key={option} className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${range === option ? 'bg-cyan-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`} onClick={() => setRange(option)}>
                    {option === 'YTD' ? 'Year to Date' : `Last ${option} days`}
                  </button>
                ))}
              </div>

              {/* NEW STATS DISPLAY */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Total Orders Card */}
                <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center justify-center text-center border">
                    <div className="text-gray-600 mb-2">
                        {/* --- NEW ICON --- */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-medium text-gray-600">Total Orders</h2>
                    <p className="text-4xl font-bold text-gray-800">{customerStats.totalOrders}</p>
                    <p className="text-sm text-gray-500 mt-1">in selected range</p>
                </div>
                
                {/* Repeat Customers Card */}
                <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center justify-center text-center border">
                    <div className="text-gray-600 mb-2">
                         {/* --- NEW ICON --- */}
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.663M12 10.5h.008v.008H12V10.5z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM12 18.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" />
                         </svg>
                    </div>
                    <h2 className="text-lg font-medium text-gray-600">Repeat Customers</h2>
                    <p className="text-4xl font-bold text-gray-800">{customerStats.repeatCustomers}</p>
                    <p className="text-sm text-gray-500 mt-1">(2+ orders)</p>
                </div>

                {/* Top 5 Customers Card */}
                <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center text-center border overflow-hidden">
                    <div className="text-gray-600 mb-2">
                        {/* --- NEW ICON --- */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-3.152a.563.563 0 00-.652 0l-4.725 3.152a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-medium text-gray-600 mb-2">Top 5 Customers</h2>
                     <ol className="text-sm text-left list-decimal list-inside text-gray-600">
                        {customerStats.topCustomers.map((customer, index) => (
                            <li key={index} className="truncate">
                                {customer.name} ({customer.phone}) - <strong>{customer.count} orders</strong>
                            </li>
                        ))}
                    </ol>
                </div>
            </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-12">
                <div className="bg-white p-4 rounded-xl shadow min-w-0">
                  <h3 className="text-xl font-semibold mb-4">Daily Orders</h3>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dateData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <XAxis dataKey="date" interval={0} angle={-45} textAnchor="end" height={70} tick={{ fontSize: 12 }}/>
                        <YAxis label={{ value: 'Orders', angle: -90, position: 'insideLeft' }} />
                        <Tooltip />
                        <Legend formatter={(value) => <span style={{ color: '#000' }}>{value}</span>} />
                        <Line type="linear" dataKey="count" name="Orders" stroke="#d3f0b2" strokeWidth={2} dot={{ fill: '#d3f0b2', r: 4 }} activeDot={{ r: 6 }}>
                          <LabelList dataKey="count" position="top" />
                       </Line>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow min-w-0">
                  <h3 className="text-xl font-semibold mb-4">Today's Activities by Hour</h3>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }} activeBar={false}>
                        <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                        <YAxis label={{ value: 'Orders', angle: -90, position: 'insideLeft' }} />
                        <Tooltip cursor={{ fill: 'transparent' }} />
                        <Legend formatter={(value) => <span style={{ color: '#000' }}>{value}</span>} />
                        <Bar dataKey="count" name="Orders" fill="#b2e5f0" activeBar={{ fill: '#d3f0b2', stroke: '#d3f0b2', strokeWidth: 1 }}>
                          <LabelList dataKey="count" position="top" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl shadow">
                <h3 className="text-xl font-semibold mb-4">Top 10 Most Popular Items</h3>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={popularItems} layout="vertical" margin={{ top: 5, right: 0, left:0, bottom: 5 }} activeBar={false}>
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={150} tick={{  fontSize: 12, angle: 0, overflow: 'hidden' }} />
                      <Tooltip cursor={{ fill: 'transparent' }} />
                      <Legend formatter={(value) => <span style={{ color: '#000' }}>{value}</span>} />
                      <Bar dataKey="count" name="Quantity Sold" fill="#b2e5f0" activeBar={{ fill: '#d3f0b2', stroke: '#d3f0b2', strokeWidth: 1 }}>
                        <LabelList dataKey="count" position="right" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default Report;
