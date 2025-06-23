import React, { useState, useEffect, useRef, useCallback } from 'react';
import NavMenu from './components/NavMenu';
import ErrorBoundary from './components/ErrorBoundary';
import { useSwipeable } from 'react-swipeable';

// --- Timer Hook ---
// REVISION #5 & #6: The hook now accepts an initialElapsedTime to start counting from.
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
    // REVISION #5 & #6: Get elapsedTime from the hook to pass it on swipe.
    const { elapsedTime, formattedTime, start } = useTimer();
    
    useEffect(() => {
        start();
    }, [start]);

    const handlers = useSwipeable({
        // REVISION #5 & #6: Pass both the order and the current elapsedTime on swipe.
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
// REVISION #5 & #6: Accept an 'initialTime' prop.
const OrderDetailsModal = ({ order, onClose, onPrep, initialTime }) => {
    if (!order) return null;

    // REVISION #5 & #6: Initialize the timer with the initialTime from the card.
    const { formattedTime, start, stop } = useTimer(initialTime);

    useEffect(() => {
        start();
        return () => stop();
    }, [start, stop]);
    
    const handlePrep = () => {
        onPrep(order, formattedTime);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Order #{order.orderNum}</h2>
                    <div className="text-2xl font-mono font-bold text-red-500">{formattedTime}</div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-800 text-3xl leading-none">&times;</button>
                </div>
                {/* REVISION #4: Dialogue box is now longer (max-h-96). */}
                <div className="p-4 max-h-96 overflow-y-auto">
                    <h4 className="font-semibold mb-2 text-gray-700">Items:</h4>
                    <ul>
                        {order.items.map((item, index) => (
                            <li key={index} className="mb-2 p-2 bg-gray-50 rounded">
                                <span className="font-bold text-gray-800">{item.qty}x {item.item}</span>
                                {item.modifier && <p className="text-sm text-red-600 pl-4">Mod: {item.modifier}</p>}
                            </li>
                        ))}
                    </ul>
                </div>
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
            </div>
        </div>
    );
};


// --- Main KDS Page Component ---
export default function KDS() {
    const [activeOrders, setActiveOrders] = useState([]);
    const [preppedOrders, setPreppedOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    // REVISION #5 & #6: Add state to hold the initial time for the modal.
    const [initialModalTime, setInitialModalTime] = useState(0);
    
    const fetchData = useCallback(async () => {
        try {
            const [activeRes, preppedRes] = await Promise.all([
                fetch(`${import.meta.env.VITE_API_URL}/api/kds/active-orders`),
                fetch(`${import.meta.env.VITE_API_URL}/api/kds/prepped-orders`),
            ]);
            if (!activeRes.ok || !preppedRes.ok) throw new Error("Failed to fetch KDS data");
            
            const activeData = await activeRes.json();
            const preppedData = await preppedRes.json();

            setActiveOrders(activeData);
            setPreppedOrders(preppedData);
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

    // REVISION #5 & #6: handleSwipe now accepts the card's elapsed time.
    const handleSwipe = (order, time) => {
        setSelectedOrder(order);
        setInitialModalTime(time);
    };
    
    const handleCloseModal = () => {
        setSelectedOrder(null);
        setInitialModalTime(0);
    };

    const handlePrepOrder = async (order, prepTime) => {
        console.log('Prepping order:', order); // 👈 Add this

        if (!order?.id) {
            alert("Order is missing ID and cannot be prepped.");
            return;
        }


        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/kds/prep-order/${order.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prepTime }),
            });
            if (!res.ok) throw new Error("Failed to mark order as prepped");
            
            setActiveOrders(prev => prev.filter(o => o.id !== order.id));
            setPreppedOrders(prev => [order, ...prev]);
            setSelectedOrder(null);

        } catch (error) {
            console.error("Error prepping order:", error);
            alert("Could not mark order as prepped. Please try again.");
        }
    };



    
    return (
        <ErrorBoundary>
            {/* REVISION #1 & #2: Switched to light theme and reversed column order. */}
            <div className="min-h-screen bg-gray-100 text-gray-800 font-sans flex flex-row-reverse">
                <button
                    onClick={handleMenuOpen}
                    className="fixed top-4 right-4 z-50 text-gray-600 hover:text-gray-800 focus:outline-none p-2 bg-white rounded-full shadow-md"
                    aria-label="Open menu"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <NavMenu isMenuOpen={isMenuOpen} handleMenuClose={handleMenuClose} />
                
                {/* Right Panel (Previously Left): Completed Orders */}
                <div className="w-1/4 bg-white p-4 border-l border-gray-200 flex flex-col">
                    <h2 className="text-xl font-bold mb-4 text-center">Recently Prepped</h2>
                    <div className="overflow-y-auto flex-grow">
                        {preppedOrders.length === 0 && <p className="text-center text-gray-500 mt-8">No orders prepped yet.</p>}
                        {preppedOrders.map(order => (
                             // REVISION #3: Changed card color to gray and adjusted text.
                             <div key={order.id} className="bg-gray-200 rounded-lg p-3 mb-2 text-gray-700">
                                <p className="font-bold text-gray-800">#{order.orderNum}</p>
                                <p className="text-sm text-gray-600">{order.callerName}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Left Panel (Previously Right): Active Orders */}
                <div className="w-3/4 p-6 overflow-y-auto">
                    <h2 className="text-3xl font-bold mb-6 text-center">Active Orders</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {activeOrders.length === 0 && <p className="text-center text-gray-400 col-span-full mt-12">No active orders in the kitchen.</p>}
                        {activeOrders.map(order => (
                            <OrderCard key={order.id} order={order} onSwipe={handleSwipe} />
                        ))}
                    </div>
                </div>

                {/* REVISION #5 & #6: Pass the initialModalTime to the modal. */}
                <OrderDetailsModal order={selectedOrder} onClose={handleCloseModal} onPrep={handlePrepOrder} initialTime={initialModalTime} />
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