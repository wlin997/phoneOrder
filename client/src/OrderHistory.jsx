// client/src/OrderHistory.jsx
import React, { useEffect, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import NavMenu from './components/NavMenu';
import { useAuth } from './AuthContext.jsx'; // Import useAuth

export default function OrderHistory() {
  const { api } = useAuth(); // Destructure api from useAuth

  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, [pagination.page, sortField, sortDir, search]);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      // Use the 'api' instance for authenticated requests
      const res = await api.get( // Changed fetch to api.get
        `/api/order-history?page=${pagination.page}&pageSize=${pagination.pageSize}&search=${encodeURIComponent(search)}&sort=${sortField}&dir=${sortDir}`
      );
      const data = res.data; // Axios puts response data in .data
      setOrders(data.orders || []);
      setPagination(prev => ({ ...prev, total: data.pagination.total }));
    } catch (err) {
      console.error('[OrderHistory] Failed to fetch orders:', err);
      alert('Error loading orders.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFullOrderDetails = async (orderId) => { // Renamed rowIndex to orderId for clarity
  try {
    // Use the 'api' instance for authenticated requests
    const res = await api.get(`/api/order-by-id/${orderId}`); // Changed fetch to api.get
    const data = res.data; // Axios puts response data in .data

    const enrichedItems = (data.items || []).map(item => {
      const modifierDelta = item.modifiers?.reduce((sum, mod) => sum + (parseFloat(mod.price_delta) || 0), 0) || 0;
      const computedPrice = item.base_price ? parseFloat(item.base_price) + modifierDelta : 0;
      return {
        ...item,
        total_price_each: computedPrice.toFixed(2)
      };
    });

    setSelectedOrder({ ...data, items: enrichedItems });
  } catch (err) {
    console.error('[OrderHistory] Error fetching full order:', err);
    alert('Failed to load order details.');
  }
};


  const handleSort = (field) => {
    setSortField(field);
    setSortDir(prev => (sortField === field && sortDir === 'desc' ? 'asc' : 'desc'));
  };

  const handlePageChange = (delta) => {
    setPagination(prev => ({
      ...prev,
      page: Math.max(1, prev.page + delta)
    }));
  };

  const handleReprint = async (rowIndex) => {
    try {
      // Use the 'api' instance for authenticated requests
      const response = await api.post(`/api/fire-order`, { rowIndex }); // Changed fetch to api.post
      if (response.status !== 200) throw new Error('Reprint failed'); // Axios throws for 4xx/5xx by default
      alert('Reprint successful!');
    } catch (err) {
      console.error('[OrderHistory] Reprint failed:', err);
      alert('Failed to reprint order.');
    }
  };

  const handleRowClick = async (order) => {
    await fetchFullOrderDetails(order.order_id);
  };

  const formatDate = (isoStr) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleString('en-US', {
        year: '2-digit', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100 p-6 font-sans antialiased text-gray-800">
        <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={() => setIsMenuOpen(false)} />

        <h2 className="text-2xl font-bold mb-4 text-cyan-700">Order History</h2>

        <div className="mb-4 flex justify-between items-center">
          <input
            type="text"
            placeholder="Search by name, phone, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-1/3 p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />

          <div className="space-x-2">
            <button onClick={() => handlePageChange(-1)} disabled={pagination.page === 1}
              className="px-3 py-1 bg-cyan-500 text-white rounded hover:bg-cyan-600 disabled:opacity-50">Previous</button>
            <span className="font-medium">{pagination.page}</span>
            <button onClick={() => handlePageChange(1)} disabled={(pagination.page * pagination.pageSize) >= pagination.total}
              className="px-3 py-1 bg-cyan-500 text-white rounded hover:bg-cyan-600 disabled:opacity-50">Next</button>
          </div>
        </div>

        <div className="overflow-x-auto bg-white shadow rounded-lg">
          <table className="min-w-full text-sm table-auto">
            <thead className="bg-cyan-50 text-cyan-800">
              <tr>
                {["order_id", "order_type", "created_at", "customer_name", "customer_phone", "total_price"].map(field => (
                  <th
                    key={field}
                    onClick={() => handleSort(field)}
                    className="px-4 py-2 text-left cursor-pointer select-none"
                  >
                    {field.replace(/_/g, ' ').toUpperCase()}
                    {sortField === field && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center p-4 text-gray-500">Loading...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={6} className="text-center p-4 text-gray-400">No orders found.</td></tr>
              ) : (
                orders.map(order => (
                  <tr
                    key={order.order_id}
                    className="hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleRowClick(order)}
                  >
                    <td className="px-4 py-2">{order.order_id}</td>
                    <td className="px-4 py-2">{order.order_type}</td>
                    <td className="px-4 py-2">{formatDate(order.created_at)}</td>
                    <td className="px-4 py-2">{order.customer_name}</td>
                    <td className="px-4 py-2">{order.customer_phone}</td>
                    <td className="px-4 py-2">${order.total_price.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Order Details Dialog */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-800">Order #{selectedOrder.order_id}</h3>
                <button onClick={() => setSelectedOrder(null)} className="text-gray-500 hover:text-gray-700 text-xl">×</button>
              </div>

              <div className="space-y-2 text-sm">
                <p><strong>Order Type:</strong> {selectedOrder.order_type}</p>
                <p><strong>Time Ordered:</strong> {formatDate(selectedOrder.created_at)}</p>
                <p><strong>Customer:</strong> {selectedOrder.customer_name}</p>
                <p><strong>Phone:</strong> {selectedOrder.customer_phone}</p>
              </div>

              <div className="mt-4">
                <h4 className="text-lg font-semibold mb-2">Items:</h4>
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  <ul className="space-y-2">
                    {selectedOrder.items.map((item, i) => (
                      <li key={i} className="border rounded p-2 bg-gray-50">
                        <div className="font-semibold text-gray-800">{item.qty} × {item.item_name}</div>
                        <div className="text-gray-700 text-sm">Each: ${item.total_price_each}</div>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <ul className="pl-4 mt-1 text-red-500 text-sm">
                            {item.modifiers.map((mod, j) => (
                              <li key={j}>
                                Mod: {mod.name} {mod.price_delta ? `(+ $${parseFloat(mod.price_delta).toFixed(2)})` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">No items found.</p>
                )}
              </div>

              <div className="mt-6">
                <button
                  onClick={() => handleReprint(selectedOrder.order_id)}
                  className="w-full py-2 px-4 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition font-semibold"
                >
                  Reprint Order
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}