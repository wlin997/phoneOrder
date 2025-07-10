import { useEffect, useState, useRef, useCallback } from "react";
import "./App.css";
import "./index.css";
import { Link, useNavigate } from 'react-router-dom';
import NavMenu from './components/NavMenu';
import ErrorBoundary from './components/ErrorBoundary';
import axios from 'axios';
// Removed: import.meta.env.VITE_API_URL; // This line does nothing, can be removed
// Removed: import KDS from './KdsComponent.jsx'; // KDS is not directly rendered in App.jsx

// --- AUTH IMPORT (Ensure these are correctly imported for use within App component) ---
import { useAuth } from './AuthContext';
// --- END AUTH IMPORT ---

console.log("------------------------------------------");
console.log("[App.jsx] Component file loaded and parsing.");
console.log("------------------------------------------");

const MAX_PRINTED_ORDERS = 1000;

const loadViewedOrders = () => {
    try {
        const stored = localStorage.getItem('viewedOrders');
        return stored ? JSON.parse(stored) : {};
    } catch (err) {
        console.error('Error loading viewed orders from localStorage:', err);
        return {};
    }
};

const saveViewedOrders = (viewedOrders) => {
    try {
        localStorage.setItem('viewedOrders', JSON.stringify(viewedOrders));
    } catch (err) {
        console.error('Error saving viewed orders to localStorage:', err);
    }
};

function OrderDetailsDisplay({ order, onFireToKitchen, isProcessing }) {
    useEffect(() => {
        const handleResize = () => {};
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [order]);

    if (!order) {
        return (
            <div className="text-gray-500 text-center flex flex-col items-center justify-center h-full">
                <svg className="mx-auto h-24 w-24 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                <p className="mt-2 text-lg">No order selected.</p>
                <p className="text-base">Toggle an incoming order or click 'View Details' to preview.</p>
            </div>
        );
    }

    const formatItem = (item) => {
        console.log('[Debug] Item Data (OrderDetailsDisplay):', item);
        const price = item.qty > 1
            ? `$${parseFloat(item.total_price_each * item.qty).toFixed(2)}`
            : item.base_price
                ? `$${parseFloat(item.base_price).toFixed(2)}`
                : '$0.00';
        console.log(`[Debug] Item: ${item.item_name || 'undefined'}, total_price_each: ${item.total_price_each}, base_price: ${item.base_price}, price: ${price}`);
        return `${price} - ${item.qty} x ${item.item_name || 'undefined'}`;
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-inner overflow-y-auto h-full text-base text-left">
            <h4 className="text-xl font-bold mb-4 text-gray-800">Order Details - #{order.orderNum}</h4>

            {order && !order.orderProcessed && order.orderUpdateStatus !== 'ChkRecExist' && (
                <button
                    onClick={() => onFireToKitchen(order.rowIndex)}
                    className="mb-4 w-full bg-orange-500 text-white py-3 px-6 rounded-full hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-opacity-50 transition duration-200 text-lg font-semibold flex items-center justify-center"
                    disabled={isProcessing}
                >
                    {isProcessing ? (
                        <span className="flex items-center">
                            <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            Firing to Kitchen...
                        </span>
                    ) : (
                        <span className="flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M12 11l-3 3-3-3m0 0v-4m0-4h6m-3-1v4m0 4h6m-3-1v4m0 4h6m-3-1v4"></path></svg>
                            Fire to Kitchen
                        </span>
                    )}
                </button>
            )}

            <div className="mb-4 mt-6">
                <p><strong>Order Type:</strong> {order.orderType}</p>
                <p><strong>Time Ordered:</strong> {new Date(order.timeOrdered).toLocaleString()}</p>
                <p><strong>Status:</strong> {order.orderUpdateStatus === 'ChkRecExist' ? 'Customer Updating' : (order.orderProcessed ? 'Processed' : 'Incoming')}</p>
            </div>

            <div className="mb-4">
                <p><strong>Caller:</strong> {order.callerName}</p>
                <p><strong>Phone:</strong> {String(order.callerPhone || 'N/A')}</p>
                <p><strong>Email:</strong> {order.email}</p>
                <p><strong>Address:</strong> {order.callerAddress}, {order.callerCity}, {order.callerState} {order.callerZip}</p>
                {order.utensil && <p className="mt-3"><strong>Utensils:</strong> {order.utensil}</p>}
            </div>

            <h5 className="font-semibold text-lg mb-2">Order Items:</h5>
            {order.items && order.items.length > 0 ? (
                <ul className="mb-4">
                    {order.items.map((item, index) => (
                        <li key={index} className="mb-1">
                            <span>{formatItem(item)}</span>
                            {item.modifiers && item.modifiers.length > 0 && (
                                <div className="ml-6">
                                    {item.modifiers.map((mod, modIndex) => (
                                        <div key={modIndex} className="text-red-500">
                                            Mod: {mod.name} {mod.price_delta ? `(+$${parseFloat(mod.price_delta).toFixed(2)})` : ''}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-gray-500 mb-4">No items listed.</p>
            )}

            {order.totalCost && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-lg font-semibold">Total Cost: <span className="font-bold text-gray-800">${order.totalCost}</span></p>
                </div>
            )}

            {order.orderSummary && (
                <div className="mb-4">
                    <h5 className="font-semibold text-lg mb-2">Order Summary:</h5>
                    <p className="whitespace-pre-wrap">{order.orderSummary}</p>
                </div>
            )}

            <div className="text-xs text-gray-500 mt-auto pt-4 border-t border-gray-100">
                <p>Last Data Modified: {order.sheetLastModified ? new Date(order.sheetLastModified).toLocaleString() : 'N/A'}</p>
                <p>Processed Count: {String(order.printedCount || 0)}</p>
                {order.printedTimestamps && order.printedTimestamps.length > 0 && (
                    <div>
                        <p>Processed Times:</p>
                        <ul className="list-disc list-inside pl-4">
                            {order.printedTimestamps.map((ts, idx) => (
                                <li key={idx}>{new Date(ts).toLocaleString()}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

function App() {
    console.log('[App.jsx] App component START of function.');
    const [incomingOrders, setIncomingOrders] = useState([]);
    const [printedOrders, setPrintedOrders] = useState([]);
    const [updatingOrders, setUpdatingOrders] = useState([]);
    const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [printerStatus, setPrinterStatus] = useState('Unknown');
    const menuRef = useRef(null);

    const [sortConfig, setSortConfig] = useState({ key: 'timeOrdered', direction: 'ascending' });

    const toggledOrdersRef = useRef({});
    const viewedOrdersRef = useRef(loadViewedOrders());

    const { isAuthenticated, userRole, logout } = useAuth(); // ADDED: useAuth hook

    console.log("[App.jsx] App component state initialized. IsAuthenticated:", isAuthenticated);

    useEffect(() => {
        console.log("[App.jsx main useEffect] Initial and interval fetches initiated. IsAuthenticated:", isAuthenticated);
        const initiateFetches = async () => {
            if (isAuthenticated) {
                console.log("[App.jsx main useEffect] User is authenticated, initiating data fetches.");
                await fetchOrders();
                await fetchPrintedOrders();
                await fetchUpdatingOrders();
            } else {
                console.log("[App.jsx main useEffect] User is NOT authenticated, skipping data fetches and clearing state.");
                setIncomingOrders([]);
                setPrintedOrders([]);
                setUpdatingOrders([]);
            }
        };
        initiateFetches();

        const interval = setInterval(() => {
            console.log("[App.jsx main useEffect] Interval fetch running. IsAuthenticated:", isAuthenticated);
            if (isAuthenticated) {
                fetchOrders();
                fetchPrintedOrders();
                fetchUpdatingOrders();
            } else {
                 console.log("[App.jsx main useEffect] User not authenticated, skipping interval fetch.");
            }
        }, 15000);

        return () => {
            console.log("[App.jsx main useEffect] Clearing main interval.");
            clearInterval(interval);
        }
    }, [fetchOrders, fetchPrintedOrders, fetchUpdatingOrders, isAuthenticated, logout]);

    useEffect(() => {
        console.log("[App.jsx useEffect] Saving viewed orders.");
        saveViewedOrders(viewedOrdersRef.current);
    }, [viewedOrdersRef.current]);

    useEffect(() => {
        console.log("[App.jsx useEffect] Setting up click outside listener.");
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                const menuButton = menuRef.current.previousElementSibling;
                if (menuButton && !menuButton.contains(event.target)) {
                    setIsMenuOpen(false);
                } else if (!menuButton) {
                    setIsMenuOpen(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            console.log("[App.jsx useEffect] Cleaning up click outside listener.");
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const fetchOrders = useCallback(async () => {
        console.log("[App.jsx fetchOrders] Attempting to fetch incoming orders.");
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.log("[App.jsx fetchOrders] No access token found, skipping fetch.");
            logout();
            return;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/list`, {
                signal: controller.signal,
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    console.error("[App.jsx fetchOrders] Auth error fetching incoming orders. Logging out.");
                    logout();
                    return;
                }
                throw new Error(`Failed to fetch incoming orders: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            console.log("[App.jsx fetchOrders] Data received from /api/list:", data);

            setIncomingOrders(() => {
                const newOrderObjs = data.map((order) => {
                    const isViewed = !!viewedOrdersRef.current[order.id];
                    const currentToggledState = toggledOrdersRef.current[order.id] || false;

                    return {
                        ...order,
                        flashing: true,
                        toggled: currentToggledState,
                        viewed: isViewed
                    };
                });
                return newOrderObjs;
            });

            if (selectedOrderDetails) {
                const updatedSelected = data.find(o => o.id === selectedOrderDetails.id);
                if (updatedSelected) {
                    if (toggledOrdersRef.current[selectedOrderDetails.id] || selectedOrderDetails.orderProcessed) {
                        setSelectedOrderDetails({
                            ...updatedSelected,
                            viewed: !!viewedOrdersRef.current[selectedOrderDetails.id],
                            items: updatedSelected.items.map(item => ({
                                ...item,
                                total_price_each: item.total_price_each || item.base_price
                            }))
                        });
                    }
                } else if (toggledOrdersRef.current[selectedOrderDetails.id] && !selectedOrderDetails.orderProcessed) {
                    setSelectedOrderDetails(null);
                    delete toggledOrdersRef.current[selectedOrderDetails.id];
                }
            }

        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[App.jsx fetchOrders] Fetch incoming orders timed out.');
            } else {
                console.error("[App.jsx fetchOrders] Failed to fetch incoming orders:", err.message, err.stack);
            }
        }
    }, [selectedOrderDetails, logout]);

    const fetchPrintedOrders = useCallback(async () => {
        console.log("[App.jsx fetchPrintedOrders] Attempting to fetch printed orders.");
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.log("[App.jsx fetchPrintedOrders] No access token found, skipping fetch.");
            logout();
            return;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/printed`, {
                signal: controller.signal,
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    console.error("[App.jsx fetchPrintedOrders] Auth error fetching printed orders. Logging out.");
                    logout();
                    return;
                }
                throw new Error(`Failed to fetch processed orders: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            console.log("[App.jsx fetchPrintedOrders] Data received from /api/printed:", data);

            setPrintedOrders(() => {
                const newPrintedOrderObjs = data.map((order) => {
                    return {
                        ...order,
                        printHistory: order.printedTimestamps,
                        reprinted: order.printedCount > 1,
                    };
                });
                return newPrintedOrderObjs.slice(0, MAX_PRINTED_ORDERS);
            });
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[App.jsx fetchPrintedOrders] Fetch processed orders timed out.');
            } else {
                console.error("[App.jsx fetchPrintedOrders] Failed to fetch processed orders:", err.message, err.stack);
            }
        }
    }, [logout]);

    const fetchUpdatingOrders = useCallback(async () => {
        console.log("[App.jsx fetchUpdatingOrders] Attempting to fetch updating orders.");
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.log("[App.jsx fetchUpdatingOrders] No access token found, skipping fetch.");
            logout();
            return;
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/updating`, {
                signal: controller.signal,
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    console.error("[App.jsx fetchUpdatingOrders] Auth error fetching updating orders. Logging out.");
                    logout();
                    return;
                }
                throw new Error(`Failed to fetch updating orders: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            console.log("[App.jsx fetchUpdatingOrders] Data received from /api/updating:", data);

            setUpdatingOrders(data.map(order => ({ ...order })));

            if (selectedOrderDetails && selectedOrderDetails.orderUpdateStatus === 'ChkRecExist') {
                const updatedSelected = data.find(o => o.id === selectedOrderDetails.id);
                if (updatedSelected) {
                    setSelectedOrderDetails({
                        ...updatedSelected,
                        viewed: !!viewedOrdersRef.current[selectedOrderDetails.id],
                        items: updatedSelected.items.map(item => ({
                            ...item,
                            total_price_each: item.total_price_each || item.base_price
                        }))
                    });
                } else {
                    setSelectedOrderDetails(null);
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[App.jsx fetchUpdatingOrders] Fetch updating orders timed out.');
            } else {
                console.error("[App.jsx fetchUpdatingOrders] Failed to fetch customer updating orders:", err.message, err.stack);
            }
        }
    }, [selectedOrderDetails, logout]);

    const handleFireToKitchen = async (rowIndex) => {
        console.log("[App.jsx handleFireToKitchen] Firing order to kitchen:", rowIndex);
        setIsProcessing(true);
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            alert("Authentication token missing. Please log in again.");
            logout();
            setIsProcessing(false);
            return;
        }
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/fire-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ rowIndex })
            });
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    alert("Authentication expired or unauthorized. Please log in again.");
                    logout();
                    return;
                }
                throw new Error(data.error || 'Backend error');
            }
            alert('Order fired successfully!');
        } catch (err) {
            console.error("[App.jsx handleFireToKitchen] Error firing order:", err);
            alert(`Failed to fire order: ${err.message}`);
        } finally {
            setIsProcessing(false);
            await fetchOrders();
            await fetchPrintedOrders();
            await fetchUpdatingOrders();
        }
    };

    const handleReprint = async (order) => {
        console.log(`[App.jsx handleReprint] Reprinting order at rowIndex: ${order.rowIndex}`);
        setIsProcessing(true);
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            alert("Authentication token missing. Please log in again.");
            logout();
            setIsProcessing(false);
            return;
        }
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/fire-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ rowIndex: order.rowIndex })
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    alert("Authentication expired or unauthorized. Please log in again.");
                    logout();
                    return;
                }
                const errorData = await response.json();
                throw new Error(errorData.details || `Reprint failed: ${response.status}`);
            }

            const data = await response.json();
            console.log(`[App.jsx handleReprint] Order ${order.orderNum} re-processed. New count: ${data.printedCount}`);
            alert('Order sent for reprint!');
            await fetchPrintedOrders();
            await fetchUpdatingOrders();
        } catch (error) {
            console.error('[App.jsx handleReprint] Error reprocessing order:', error);
            alert(`Failed to re-process order: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    useEffect(() => {
        console.log("[App.jsx main useEffect] Initial and interval fetches initiated. IsAuthenticated:", isAuthenticated);
        const initiateFetches = async () => {
            if (isAuthenticated) {
                console.log("[App.jsx main useEffect] User is authenticated, initiating data fetches.");
                await fetchOrders();
                await fetchPrintedOrders();
                await fetchUpdatingOrders();
            } else {
                console.log("[App.jsx main useEffect] User is NOT authenticated, skipping data fetches and clearing state.");
                setIncomingOrders([]);
                setPrintedOrders([]);
                setUpdatingOrders([]);
            }
        };
        initiateFetches();

        const interval = setInterval(() => {
            console.log("[App.jsx main useEffect] Interval fetch running. IsAuthenticated:", isAuthenticated);
            if (isAuthenticated) {
                fetchOrders();
                fetchPrintedOrders();
                fetchUpdatingOrders();
            } else {
                 console.log("[App.jsx main useEffect] User not authenticated, skipping interval fetch.");
            }
        }, 15000);

        return () => {
            console.log("[App.jsx main useEffect] Clearing main interval.");
            clearInterval(interval);
        }
    }, [fetchOrders, fetchPrintedOrders, fetchUpdatingOrders, isAuthenticated, logout]);

const handleToggle = async (id, orderNum) => {
    console.log(`[App.jsx handleToggle] Toggling order ID: ${id}, Order Num: ${orderNum}`);
    viewedOrdersRef.current = {
        ...viewedOrdersRef.current,
        [id]: true
    };

    const isCurrentlyToggled = toggledOrdersRef.current[id];

    if (isCurrentlyToggled) {
        toggledOrdersRef.current[id] = false;
        setSelectedOrderDetails(null);
    } else {
        Object.keys(toggledOrdersRef.current).forEach(key => {
            toggledOrdersRef.current[key] = false;
        });
        toggledOrdersRef.current[id] = true;

        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            alert("Authentication token missing. Please log in again.");
            logout();
            return;
        }
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/order-by-row/${id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    alert("Authentication expired or unauthorized. Please log in again.");
                    logout();
                    return;
                }
                throw new Error(`Failed to fetch order details for rowIndex ${id}: ${response.status} ${response.statusText}`);
            }
            const text = await response.text();
            console.log('[App.jsx handleToggle] Raw API Response Text for handleToggle:', text);
            const orderData = JSON.parse(text);
            console.log('[App.jsx handleToggle] Parsed API Response for handleToggle:', orderData);
            setSelectedOrderDetails({
                ...orderData,
                viewed: !!viewedOrdersRef.current[orderData.id],
                items: orderData.items?.map(item => ({
                    ...item,
                    item_name: item.item_name, // Explicitly map item_name
                })) || []
            });
        } catch (error) {
            console.error('[App.jsx handleToggle] Error fetching order details:', error);
            setSelectedOrderDetails(null);
            alert(`Failed to load order details: ${error.message}`);
        }
    }

    setIncomingOrders((prevOrders) =>
        prevOrders.map((order) => ({
            ...order,
            toggled: toggledOrdersRef.current[order.id] || false,
            viewed: !!viewedOrdersRef.current[order.id],
            flashing: !viewedOrdersRef.current[order.id]
        }))
    );
    saveViewedOrders(viewedOrdersRef.current);
};

// This formatItem is a duplicate, likely from a copy-paste mistake. The one above is used.
// const formatItem = (item) => {
//     console.log('[Debug] Item Data:', item);
//     const price = item.qty > 1
//         ? `$${parseFloat(item.total_price_each * item.qty).toFixed(2)}`
//         : item.base_price
//             ? `$${parseFloat(item.base_price).toFixed(2)}`
//             : '$0.00';
//     console.log(`[Debug] Item: ${item.item_name || 'undefined'}, total_price_each: ${item.total_price_each}, base_price: ${item.base_price}, price: ${price}`);
//     return `${price} - ${item.qty} x ${item.item_name || 'undefined'}`; // Use item_name or fallback
// };

const handleViewDetails = async (order) => {
    console.log('handleViewDetails for order:', order.orderNum, 'rowIndex:', order.rowIndex);

    if (order.rowIndex && !order.orderProcessed) {
        viewedOrdersRef.current = {
            ...viewedOrdersRef.current,
            [order.rowIndex]: true
        };
        saveViewedOrders(viewedOrdersRef.current);

        setIncomingOrders(prev => prev.map(o => o.id === order.rowIndex ? {...o, viewed: true, flashing: false} : o));
        setUpdatingOrders(prev => prev.map(o => o.id === order.rowIndex ? {...o, viewed: true} : o));
    }

    if (selectedOrderDetails && selectedOrderDetails.rowIndex !== order.rowIndex) {
        if (toggledOrdersRef.current[selectedOrderDetails.rowIndex]) {
            toggledOrdersRef.current[selectedOrderDetails.rowIndex] = false;
        }
    }

    if (order.orderProcessed || order.orderUpdateStatus === 'ChkRecExist') {
        Object.keys(toggledOrdersRef.current).forEach(key => {
            toggledOrdersRef.current[key] = false;
        });
        setIncomingOrders(prev => prev.map(o => ({...o, toggled: false})));
    }

    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
        alert("Authentication token missing. Please log in again.");
        logout();
        return;
    }

    try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/order-by-row/${order.rowIndex}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                alert("Authentication expired or unauthorized. Please log in again.");
                logout();
                return;
            }
            throw new Error(`Failed to fetch order details for rowIndex ${order.rowIndex}: ${response.status} ${response.statusText}`);
        }
        const orderData = await response.json();
        console.log('[App.jsx handleViewDetails] Parsed API Response for handleViewDetails:', orderData);
        setSelectedOrderDetails({
            ...orderData,
            viewed: true,
            items: orderData.items?.map(item => {
                const modifierDelta = item.modifiers?.reduce((sum, mod) => sum + (parseFloat(mod.price_delta) || 0), 0) || 0;
                const computedPrice = item.base_price ? parseFloat(item.base_price) + modifierDelta : '0.00';
                return {
                    ...item,
                    total_price_each: item.total_price_each || computedPrice.toFixed(2)
                };
            }) || [] // Default to empty array if items is undefined
        });
    } catch (error) {
        console.error('[App.jsx handleViewDetails] Error fetching order details:', error);
        setSelectedOrderDetails(null);
        alert(`Failed to load order details: ${error.message}`);
    }
};

    const handleMenuOpen = () => {
        setIsMenuOpen(prev => !prev);
    };

    const handleMenuClose = () => {
        setIsMenuOpen(false);
    };

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const sortedIncomingOrders = [...incomingOrders].sort((a, b) => {
        if (sortConfig.key) {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            if (sortConfig.key === 'timeOrdered') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            } else if (sortConfig.key === 'callerName') {
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
            }

            if (valA < valB) {
                return sortConfig.direction === 'ascending' ? -1 : 1;
            }
            if (valA > valB) {
                return sortConfig.direction === 'ascending' ? 1 : -1;
            }
        }
        return 0;
    });

    const formatOrderTimestamp = (timestamp) => {
        if (!timestamp) return { date: 'N/A', time: '' };
        try {
            const dateObj = new Date(timestamp);
            if (isNaN(dateObj.getTime())) return { date: 'Invalid Date', time: '' };

            const date = dateObj.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' });
            const time = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            return { date, time };
        } catch (e) {
            return { date: 'Error Formatting', time: ''};
        }
    };

    useEffect(() => {
        console.log("[App.jsx printer useEffect] Checking printer status initiated.");
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.log("[App.jsx printer useEffect] No access token found, skipping printer status check.");
            logout();
            setPrinterStatus('N/A (Auth Needed)');
            return;
        }

        const checkPrinterStatus = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_URL}/api/printer-status`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (!response.ok) {
                    if (response.status === 401 || response.status === 403) {
                        console.error("[App.jsx printer useEffect] Auth error checking printer status. Logging out.");
                        logout();
                        return;
                    }
                    throw new Error(`Status check failed: ${response.status}`);
                }
                const data = await response.json();
                setPrinterStatus(data.available ? 'Connected' : 'Not Connected');
            } catch (err) {
                console.error('[App.jsx printer useEffect] Error checking printer status:', err.message);
                setPrinterStatus('Not Connected');
            }
        };
        checkPrinterStatus();
        const intervalId = setInterval(checkPrinterStatus, 60000);
        return () => {
            console.log("[App.jsx printer useEffect] Clearing printer interval.");
            clearInterval(intervalId);
        }
    }, [logout]);

    console.log("[App.jsx] App component JSX return.");
    return (
        <ErrorBoundary>
            <div className="relative">
                <button
                    onClick={handleMenuOpen}
                    className="fixed top-4 right-4 z-50 text-gray-600 hover:text-gray-800 focus:outline-none p-2 bg-white rounded-full shadow-md"
                    aria-label="Open menu"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>

                <div className="fixed top-4 left-4 z-50 flex items-center bg-white p-2 rounded-full shadow-md">
                    <svg
                        className={`w-5 h-5 mr-2 ${printerStatus === 'Connected' ? 'text-green-500' : 'text-red-500'}`}
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700">{printerStatus}</span>
                </div>

                <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={handleMenuClose} />

                <div className="min-h-screen bg-gray-100 p-6 font-sans antialiased text-gray-800 rounded-xl">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center justify-center text-center">
                            <div className="text-gray-600 mb-2">
                                <svg className="w-8 h-8 mx-auto text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2 2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                            </div>
                            <h2 className="text-lg font-medium text-gray-600">Total Orders</h2>
                            <p className="text-4xl font-bold text-gray-800">{incomingOrders.length + printedOrders.length + updatingOrders.length}</p>
                            <p className="text-sm text-gray-500 mt-1">Overall count</p>
                        </div>

                        <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center justify-center text-center">
                            <div className="text-gray-600 mb-2">
                                <svg className="w-8 h-8 mx-auto text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m7 0V5a2 2 0 012-2h2a2 2 0 012 2v6m-6 0h6"></path></svg>
                            </div>
                            <h2 className="text-lg font-medium text-gray-600">Incoming Orders</h2>
                            <p className="text-4xl font-bold text-gray-800">{incomingOrders.length}</p>
                            <p className="text-sm text-gray-500 mt-1">Ready for processing</p>
                        </div>

                        <div className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center justify-center text-center">
                            <div className="text-gray-600 mb-2">
                                <svg className="w-8 h-8 mx-auto text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <h2 className="text-lg font-medium text-gray-600">Processed Orders</h2>
                            <p className="text-4xl font-bold text-gray-800">{printedOrders.length}</p>
                            <p className="text-sm text-gray-500 mt-1">Completed orders</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-md p-6 mb-6 grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-8 min-h-[600px]">
                        <div className="flex flex-col">
                            <h3 className="text-xl font-bold text-gray-800 mb-4">Incoming Orders</h3>
                            <div className="space-y-3 mb-4">
                                <div className="text-sm text-gray-600">
                                    <div className="flex justify-center space-x-6 border border-gray-300 rounded-md p-3">
                                        <div className="flex items-center text-center">
                                            <span className="relative flex h-3 w-3 mr-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                            </span>
                                            <span>New or updated order</span>
                                        </div>
                                        <div className="flex items-center text-center">
                                            <svg className="w-4 h-4 mr-2 text-yellow-400" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M12 2l10 18H2L12 2z" />
                                            </svg>
                                            <span>Viewed (not fired)</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2 text-sm mt-3 mb-2">
                                    <span className="font-semibold text-gray-700">Sort by:</span>
                                    <button
                                        onClick={() => requestSort('timeOrdered')}
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${sortConfig.key === 'timeOrdered' ? 'bg-cyan-500 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                                    >
                                        Date/Time {sortConfig.key === 'timeOrdered' ? (sortConfig.direction === 'ascending' ? 'â–²' : 'â–¼') : ''}
                                    </button>
                                    <button
                                        onClick={() => requestSort('callerName')}
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${sortConfig.key === 'callerName' ? 'bg-cyan-500 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                                    >
                                        Name {sortConfig.key === 'callerName' ? (sortConfig.direction === 'ascending' ? 'â–²' : 'â–¼') : ''}
                                    </button>
                                </div>
                            </div>

                            <div className="flex-grow overflow-y-auto custom-scrollbar bg-white rounded-lg p-4 shadow-inner text-lg">
                                {sortedIncomingOrders.length === 0 && (
                                    <div className="text-gray-500 text-center py-8">
                                        <svg className="mx-auto h-16 w-16 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m7 0V5a2 2 0 012-2h2a2 2 0 012 2v6m-6 0h6"></path></svg>
                                        No new orders available.
                                    </div>
                                )}
                                {sortedIncomingOrders.map((order) => {
                                    const { date: orderDate, time: orderTime } = formatOrderTimestamp(order.timeOrdered);
                                    return (
                                        <div
                                            key={order.id}
                                            className="flex justify-between items-center py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
                                            onClick={() => handleToggle(order.id, order.orderNum)}
                                        >
                                            <div className="grid grid-cols-[20px,100px,80px,60px,1fr] gap-2 items-center flex-grow">
                                                {order.viewed && !order.orderProcessed ? (
                                                    <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M12 2l10 18H2L12 2z" />
                                                    </svg>
                                                ) : order.flashing ? (
                                                    <span className="relative flex h-3 w-3">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                                    </span>
                                                ) : <div className="w-3 h-3"></div>}
                                                <div className="text-gray-700" title={orderDate}>{orderDate}</div>
                                                <div className="text-gray-700" title={orderTime}>{orderTime}</div>
                                                <div className="font-medium text-gray-800" title={`Order #${order.orderNum}`}>#{order.orderNum}</div>
                                                <div className="text-gray-600 truncate" title={`${order.callerName} - ${order.callerPhone}`}>{order.callerName} ({order.callerPhone})</div>
                                            </div>
                                            <label className="flex items-center cursor-pointer ml-3 flex-shrink-0">
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={order.toggled}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        handleToggle(order.id, order.orderNum);
                                                    }}
                                                />
                                                <span
                                                    className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ease-in-out ${
                                                        order.toggled ? "bg-cyan-500" : "bg-gray-300"
                                                    }`}
                                                >
                                                    <span
                                                        className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform duration-300 ease-in-out ${
                                                            order.toggled ? "translate-x-6" : ""
                                                        }`}
                                                    />
                                                </span>
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex flex-col">
                            <h3 className="text-xl font-bold text-gray-800 mb-4">Order Details</h3>
                            <div className="flex-grow flex flex-col relative bg-gray-50 rounded-xl p-4 text-lg">
                                <OrderDetailsDisplay
                                    order={selectedOrderDetails}
                                    isProcessing={isProcessing}
                                    onFireToKitchen={handleFireToKitchen}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-md p-6 mb-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Customer Updating Orders</h3>
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar text-base">
                            {updatingOrders.length === 0 && (
                                <p className="text-gray-500 text-center py-4">No orders currently being updated.</p>
                            )}
                            {Array.isArray(updatingOrders) && updatingOrders.map((order) => {
                                const { date: orderDate, time: orderTime } = formatOrderTimestamp(order.timeOrdered);
                                return (
                                    <div
                                        key={order.id}
                                        className="flex justify-between items-center py-3 border-b border-gray-100 last:border-b-0"
                                    >
                                        <div className="grid grid-cols-[20px,120px,80px,1fr] gap-2 items-center flex-grow">
                                            <div className="w-3 h-3 rounded-full bg-orange-400"></div>
                                            <div className="text-gray-700 truncate">{orderDate} {orderTime}</div>
                                            <div className="font-medium text-gray-800 truncate">#{order.orderNum}</div>
                                            <div className="text-gray-600 truncate">{order.callerName} ({order.callerPhone})</div>
                                        </div>
                                        <button
                                            onClick={() => handleViewDetails(order)}
                                            className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm font-semibold hover:bg-gray-300 transition duration-200 flex-shrink-0 ml-2"
                                        >
                                            View Details
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-md p-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Processed Orders</h3>
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar text-base">
                            {printedOrders.length === 0 && <p className="text-gray-500 text-center py-4">No processed orders yet.</p>}
                            {Array.isArray(printedOrders) && printedOrders.map((order) => {
                                const { date: orderDate, time: orderTime } = formatOrderTimestamp(order.timeOrdered);
                                return (
                                    <div
                                        key={order.id}
                                        className="flex flex-wrap justify-between items-center py-3 border-b border-gray-100 last:border-b-0"
                                    >
                                        <div className="grid grid-cols-[20px,120px,80px,1fr] gap-2 items-center flex-grow min-w-[300px] mb-2 md:mb-0">
                                            <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                                            <div className="text-gray-700 whitespace-nowrap min-w-[160px]">{orderDate} {orderTime}</div>
                                            <div className="font-medium text-gray-800 truncate">#{order.orderNum}</div>
                                            <div className="text-gray-600 truncate">{order.callerName} ({order.callerPhone})</div>
                                        </div>
                                        <div className="flex-shrink-0 ml-auto">
                                            <button
                                                onClick={() => handleReprint(order)}
                                                className="bg-cyan-500 text-white px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-50 transition duration-200 mr-2"
                                                disabled={isProcessing}
                                            >
                                                {isProcessing ? 'Processing...' : 'Re-process'}
                                            </button>
                                            <button
                                                onClick={() => handleViewDetails(order)}
                                                className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm font-semibold hover:bg-gray-300 transition duration-200"
                                            >
                                                View Details
                                            </button>
                                        </div>
                                        {Array.isArray(order.printedTimestamps) && order.printedTimestamps.length > 0 && (
                                          <div className="text-xs text-gray-500 mt-1 w-full pl-6">
                                            {order.printedTimestamps.map((ts, idx) => (
                                              <div key={idx}>{new Date(ts).toLocaleString()}</div>
                                            ))}
                                          </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </ErrorBoundary>
    );
}

export default App;