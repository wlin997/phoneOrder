// KdsComponent.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import NavMenu from './components/NavMenu';
import ErrorBoundary from './components/ErrorBoundary';
import { useSwipeable } from 'react-swipeable';

// --- Timer Hook ---
const useTimer = (initialElapsedTime = 0) => {
    const [elapsedTime, setElapsedTime] = useState(initialElapsedTime);
    const intervalRef = useRef(null);

    const start = useCallback(() => {
        if (intervalRef.current) return;
        const startTime = Date.now() - elapsedTime;
        intervalRef.current = setInterval(() => {
            setElapsedTime(Date.now() - startTime);
        }, 1000);
    }, [elapsedTime]);

    const stop = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const reset = useCallback(() => {
        stop();
        setElapsedTime(0);
    }, [stop]);
    
    const formatTime = (timeInMs) => {
        const totalSeconds = Math.floor(timeInMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    return { elapsedTime, start, stop, reset, formattedTime: formatTime(elapsedTime) };
};

// --- Order Card Component ---
const OrderCard = ({ order, onSwipe }) => {
    const { elapsedTime, formattedTime, start } = useTimer();
    
    useEffect(() => {
        start();
    }, [start]);

    const handlers = useSwipeable({
        onSwiped: () => onSwipe(order, elapsedTime),
        preventScrollOnSwipe: true,
        trackMouse: true,
    });

    return (
        <div {...handlers} className="bg-white rounded-lg shadow-lg p-4 mb-4 flex flex-col justify-between transform hover:scale-105 transition-transform duration-200 cursor-pointer">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-lg font-bold text-gray-800">#{order.orderNum}</h3>
                    <p className="text-sm text-gray-600">{order.callerName}</p>
                    <p className="text-xs text-gray-500">{order.callerPhone}</p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-mono font-bold text-red-500">{formattedTime}</p>
                    <p className="text-xs text-gray-400">Time Elapsed</p>
                </div>
            </div>
            <div className="text-center mt-2 text-xs text-gray-400">
                Swipe to view details & prep
            </div>
        </div>
    );
};

// --- Order Details Modal Component ---
// Added a 'readOnly' prop to control the visibility of the "Mark as Prepped" toggle
const OrderDetailsModal = ({ order, onClose, onPrep, initialTime, readOnly = false }) => {
    if (!order) return null;

    // If readOnly, we don't need a live timer, just format the initialTime or preppedTime
    const { formattedTime, start, stop } = useTimer(initialTime);

    useEffect(() => {
        if (!readOnly) { // Only start timer if not in read-only mode
            start();
        }
        return () => stop();
    }, [start, stop, readOnly]);
    
    const handlePrep = () => {
        onPrep(order, formattedTime);
    };

    // Determine the time to display in the modal header
    const displayTime = readOnly && order.timePrepped ? order.timePrepped : formattedTime;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Order #{order.orderNum}</h2>
                    <div className="text-2xl font-mono font-bold text-red-500">{displayTime}</div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-800 text-3xl leading-none">&times;</button>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto">
                    <h4 className="font-semibold mb-2 text-gray-700">Items:</h4>
                    <ul>
                        {order.items.map((item, index) => (
                            <li key={index} className="mb-2 p-2 bg-gray-50 rounded">
                                <span className="font-bold text-gray-800">{item.qty}x {item.item_name}</span>
                                {item.modifier && <p className="text-sm text-red-600 pl-4">Mod: {item.modifier}</p>}
                            </li>
                        ))}
                    </ul>
                </div>
                {/* Conditionally render the "Mark as Prepped" toggle */}
                {!readOnly && (
                    <div className="p-4 bg-gray-100 rounded-b-xl flex items-center justify-center">
                        <label htmlFor="prep-toggle" className="flex items-center cursor-pointer">
                            <span className="mr-3 text-lg font-semibold text-gray-700">Mark as Prepped</span>
                            <div className="relative">
                                <input id="prep-toggle" type="checkbox" className="sr-only" onChange={handlePrep} />
                                <div className="block bg-gray-600 w-14 h-8 rounded-full"></div>
                                <div className="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition"></div>
                            </div>
                        </label>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Prepped Order Display Component ---
// This new component will display prepped order details and be clickable.
const PreppedOrderDisplay = ({ order, onClick }) => {
    // Format prepped timestamp and prep duration for display
    const formatTime = (timeInMs) => {
        const totalSeconds = Math.floor(timeInMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const preppedTimestamp = order.preppedTimestamp ? new Date(order.preppedTimestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A';
    const totalPrepTime = order.foodPrepTime ? formatTime(order.foodPrepTime) : 'N/A'; // Assuming foodPrepTime is in milliseconds

    return (
        <div
            onClick={() => onClick(order)}
            className="bg-gray-200 rounded-lg p-3 mb-2 text-gray-700 cursor-pointer hover:bg-gray-300 transition-colors duration-200"
        >
            <p className="font-bold text-gray-800">#{order.orderNum}</p>
            <p className="text-sm text-gray-600">{order.callerName}</p>
            <p className="text-xs text-gray-500">Prepped: {preppedTimestamp}</p>
            <p className="text-xs text-gray-500">Total Prep Time: {totalPrepTime}</p>
        </div>
    );
};


// --- Main KDS Page Component ---
export default function KDS() {
    const [activeOrders, setActiveOrders] = useState([]);
    const [preppedOrders, setPreppedOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [initialModalTime, setInitialModalTime] = useState(0);
    const [modalReadOnly, setModalReadOnly] = useState(false); // New state for read-only modal

    const fetchData = useCallback(async () => {
        try {
            const [activeRes, preppedRes] = await Promise.all([
                fetch(`${import.meta.env.VITE_API_URL}/api/kds/active-orders`),
                fetch(`${import.meta.env.VITE_API_URL}/api/kds/prepped-orders`),
            ]);
            if (!activeRes.ok || !preppedRes.ok) throw new Error("Failed to fetch KDS data");
            
            const activeData = await activeRes.json();
            const preppedData = await preppedRes.json();

            // Filter prepped orders to disappear after an hour
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            const filteredPreppedData = preppedData.filter(order => {
                // Ensure preppedTimestamp exists and is a valid date
                if (order.preppedTimestamp) {
                    const preppedTime = new Date(order.preppedTimestamp).getTime();
                    return preppedTime > oneHourAgo;
                }
                return false; // If no preppedTimestamp, filter it out
            });

            setActiveOrders(activeData);
            setPreppedOrders(filteredPreppedData);
            console.log("✅ Prepped Orders received from backend:", filteredPreppedData);
        } catch (error) {
            console.error("Error fetching KDS data:", error);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const intervalId = setInterval(fetchData, 15000); // Refresh every 15 seconds
        return () => clearInterval(intervalId);
    }, [fetchData]);
    
    const handleMenuOpen = () => setIsMenuOpen(true);
    const handleMenuClose = () => setIsMenuOpen(false);

    const handleSwipe = (order, time) => {
        setSelectedOrder(order);
        setInitialModalTime(time);
        setModalReadOnly(false); // Active orders are not read-only
    };

    const handlePreppedOrderClick = (order) => {
        setSelectedOrder(order);
        // For prepped orders, initialTime isn't a live timer, but rather the prep duration
        // We'll pass the foodPrepTime to the modal, which can then format it as the "initial time" to display.
        setInitialModalTime(order.foodPrepTime || 0); // Pass the total prep time
        setModalReadOnly(true); // Prepped orders are read-only in the modal
    };
    
    const handleCloseModal = () => {
        setSelectedOrder(null);
        setInitialModalTime(0);
        setModalReadOnly(false); // Reset read-only state
    };

    const handlePrepOrder = async (order, prepTime) => {
        console.log('Prepping order:', order);

        if (!order?.id) {
            alert("Order is missing ID and cannot be prepped.");
            return;
        }

        try {
            // Send prepTime as a number (milliseconds) and also send a timestamp of when it was prepped
            const prepTimestamp = new Date().toISOString(); // Current time in ISO format for backend
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/kds/prep-order/${order.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prepTimeMs: prepTime, prepTimestamp: prepTimestamp }), // Use prepTimeMs for clarity
            });

            if (!res.ok) throw new Error("Failed to mark order as prepped");

            await fetchData(); // ✅ ensures UI syncs with DB
            setSelectedOrder(null);

        } catch (error) {
            console.error("Error prepping order:", error);
            alert("Could not mark order as prepped. Please try again.");
        }
    };
    
    return (
        <ErrorBoundary>
            {/* Ensure the parent flex container takes full width */}
            <div className="min-h-screen w-full bg-gray-100 text-gray-800 font-sans flex flex-row-reverse">
                <button
                    onClick={handleMenuOpen}
                    className="fixed top-4 right-4 z-50 text-gray-600 hover:text-gray-800 focus:outline-none p-2 bg-white rounded-full shadow-md"
                    aria-label="Open menu"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={handleMenuClose} />
                
                {/* Right Panel: Recently Prepped - Give it a fixed, generous width */}
                <div className="flex-shrink-0 w-80 bg-white p-4 border-l border-gray-200 flex flex-col"> {/* Increased to w-80 (20rem) for more space */}
                    <h2 className="text-xl font-bold mb-4 text-center">Recently Prepped</h2>
                    <div className="overflow-y-auto flex-grow">
                        {preppedOrders.length === 0 && <p className="text-center text-gray-500 mt-8">No orders prepped yet.</p>}
                        {preppedOrders.map(order => (
                             <PreppedOrderDisplay key={order.id} order={order} onClick={handlePreppedOrderClick} />
                        ))}
                    </div>
                </div>

                {/* Left Panel: Active Orders - Let it take all remaining space */}
                <div className="flex-grow p-6 overflow-y-auto">
                    <h2 className="text-3xl font-bold mb-6 text-center">Active Orders</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {activeOrders.length === 0 && <p className="text-center text-gray-400 col-span-full mt-12">No active orders in the kitchen.</p>}
                        {activeOrders.map(order => (
                            <OrderCard key={order.id} order={order} onSwipe={handleSwipe} />
                        ))}
                    </div>
                </div>

                <OrderDetailsModal 
                    order={selectedOrder} 
                    onClose={handleCloseModal} 
                    onPrep={handlePrepOrder} 
                    initialTime={initialModalTime}
                    readOnly={modalReadOnly} // Pass the readOnly state
                />
            </div>
            <style>{`
                #prep-toggle:checked ~ .dot {
                    transform: translateX(100%);
                    background-color: #48bb78; /* green-500 */
                }
                #prep-toggle:checked ~ .block {
                    background-color: #a0aec0; /* gray-500 */
                }
            `}</style>
        </ErrorBoundary>
    );
}