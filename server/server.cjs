// =================================================================================
// SETUP & CONFIGURATION
// =================================================================================
process.env.TZ = 'America/New_York'; // Set default timezone 

const express = require("express");
const adminRoutes = require("./admin.routes.cjs");
const authRoutes = require("./auth.routes.cjs"); // Import the new auth routes [cite: 15]
const { authenticateToken, authorizePermissions } = require("./auth.middleware.cjs"); // [cite: 15]

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const cors = require("cors"); // [cite: 16]
const cron = require('node-cron');
const http = require('http');
const https = require('https');
const net = require('net');
const axios = require('axios'); // [cite: 17]
const { Pool } = require('pg'); // [cite: 17]
// Import the pg Pool
const { DateTime } = require('luxon'); // [cite: 17]
// Import form-data for multipart/form-data uploads
const FormData = require('form-data'); // Make sure to 'npm install form-data' [cite: 18]
const cookieParser = require('cookie-parser'); // NEW: Import cookie-parser for handling httpOnly cookies

// ── Login route (inline) ─────────────────────────────────
const bcrypt = require("bcryptjs"); // [cite: 18]
const jwt    = require("jsonwebtoken"); // [cite: 19]
const { getUserPermissions } = require("./rbac.service.cjs"); // [cite: 19]


const app = express();
const PORT = process.env.PORT || 3001; // [cite: 20]
// --- File paths for local settings ---
const appSettingsFilePath = path.join(__dirname, 'appSettings.json'); // [cite: 20]
const printerSettingsFilePath = path.join(__dirname, 'printerSettings.json'); // [cite: 21]

// --- Load app settings from file or use defaults ---
const getAppSettings = () => {
  try {
    const data = fs.readFileSync(appSettingsFilePath, 'utf8'); // [cite: 21]
    return JSON.parse(data); // [cite: 22]
  } catch (err) {
    return {
      timezone: 'America/New_York',
      reportStartHour: 8,
      archiveCronSchedule: '0 2 * * *' // Default to 2 AM
    };
  }
};

let appSettings = getAppSettings();
process.env.TZ = appSettings.timezone;

// --- CORS Configuration ---
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173',
  process.env.RENDER_FRONTEND_URL
].filter(Boolean);
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // ADDED: Allow cookies to be sent and received
})); // 
app.use(express.json()); // [cite: 25]
app.use(cookieParser()); // NEW: Add cookie-parser middleware here to parse cookies before routes

// =================================================================================
// DATABASE CONNECTION (PostgreSQL)
// =================================================================================
console.log('--- DEBUG --- DATABASE_URL is:', process.env.DATABASE_URL); // [cite: 25]
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
}); // [cite: 26]
console.log("✅ PostgreSQL client initialized."); // [cite: 27]

// =================================================================================
// HELPER AND UTILITY FUNCTIONS
// =================================================================================
let cloudPrintJobs = []; // [cite: 27]
// This new function completely replaces getSheetData() and getOrderRows()
async function getOrdersFromDB() {
    const query = `
        SELECT
            o.id AS order_id,
            o.order_type,
            o.total_price,
            o.notes,
            o.created_at,
            
${'o.utensil_request'}, // [cite: 29]
            o.category,
            o.food_prep_time,
            o.order_update_status,
            o.printed_count,
            o.printed_timestamps,
            o.is_the_usual,
            o.archived,
            c.id AS customer_id,
  
${'          c.name AS customer_name'}, // [cite: 30]
            c.phone AS customer_phone,
            c.email AS customer_email,
            c.address AS customer_address,
            i.id AS item_id,
            i.item_name,
            i.quantity,
        
${'    i.base_price'}, // [cite: 31]
            i.total_price AS total_price_each,
            m.id AS modifier_id,
            m.modifier_name,
            m.price_delta,
            o.prepped_at_timestamp -- ADDED: Select the new column
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
  
${'      LEFT JOIN order_items i ON o.id = i.order_id'}, // [cite: 32]
        LEFT JOIN order_item_modifiers m ON i.id = m.order_item_id
        WHERE o.archived = FALSE
        ORDER BY o.created_at DESC;
`; // [cite: 33]

    const { rows } = await pool.query(query);
    console.log("[Backend] Raw rows from DB query:", rows);
    const ordersMap = new Map();
    for (const row of rows) { // [cite: 34]
        if (!ordersMap.has(row.order_id)) {
            ordersMap.set(row.order_id, {
                id: row.order_id,
                rowIndex: row.order_id, // For backward compatibility with frontend
                orderNum: row.order_id,
               
${' orderType: row.order_type'}, // [cite: 35]
                totalCost: row.total_price,
                notes: row.notes,
                timeOrdered: row.created_at,
                utensil: row.utensil_request,
                category: row.category,
             
${'    orderUpdateStatus: row.order_update_status'}, // [cite: 36]
                printedCount: row.printed_count,
                printedTimestamps: row.printed_timestamps || [], // Ensure this is an array
                isTheUsual: row.is_the_usual,
                orderProcessed: row.printed_count > 0, // Logic: if printed, it's processed
            
${'    orderPrepped: row.order_update_status === \'Prepped\''}, // [cite: 37]
                cancelled: row.order_update_status === 'Cancelled',
                callerName: row.customer_name,
                callerPhone: row.customer_phone,
                email: row.customer_email,
                callerAddress: row.customer_address,
      
${'          items: []'}, // [cite: 38]
                foodPrepTime: row.food_prep_time, // ADDED: Pass this from DB
                preppedTimestamp: row.prepped_at_timestamp // ADDED: Pass this from DB
            });
        } // [cite: 39]

        // Add item to the order if it exists
        if (row.item_id) {
            const order = ordersMap.get(row.order_id);
            const existingItem = order.items.find(item => item.item_id === row.item_id); // [cite: 40]
            if (!existingItem) {
                order.items.push({
                    item_id: row.item_id,
                    item_name: row.item_name,
                    qty: row.quantity,
           
${'          base_price: row.base_price'}, // [cite: 41]
                    total_price_each: row.total_price_each,
                    modifiers: [],
                });
            } // [cite: 42]

            // Add modifier if it exists
            if (row.modifier_id) {
                const item = order.items.find(item => item.item_id === row.item_id);
                item.modifiers.push({ // [cite: 43]
                    id: row.modifier_id,
                    name: row.modifier_name,
                    price_delta: row.price_delta,
                });
            } // [cite: 44]
        }
    }

    // Final pass to format the modifier string the old frontend expects
    for (const order of ordersMap.values()) {
        for (const item of order.items) {
            item.modifier = item.modifiers.map(m => m.name).join(', '); // [cite: 45]
        }
    }
    console.log("[Backend] ordersMap values (pre-filter):", Array.from(ordersMap.values()));
    return Array.from(ordersMap.values()); // [cite: 46]
}


async function archiveOrders() {
    console.log(`[Cron Job] Running archiveOrders at ${new Date().toLocaleTimeString()}`); // [cite: 46]
// This logic is now handled by querying based on date ranges. [cite: 47]
// Archiving can be a more complex database operation (e.g., moving to another table). [cite: 48]
// For now, we will log that the concept exists. [cite: 49]
    console.log("[Cron Job] Archive logic would run here. No action taken in this version."); // [cite: 50]
}


// =================================================================================
// EXPRESS API ENDPOINTS (Refactored for PostgreSQL)
// =================================================================================

app.get("/", (req, res) => res.send("✅ Backend server is alive")); // [cite: 52]
const isTodayFilter = (order) => {
    if (!order || !order.timeOrdered) return false; // [cite: 53]
// Use fromJSDate() because order.timeOrdered is already a JavaScript Date object from the PG driver. [cite: 54]
    const orderDateTime = DateTime.fromJSDate(order.timeOrdered).setZone(appSettings.timezone || 'America/New_York'); // Rectified: Use appSettings.timezone

    // Get the current time in the same desired comparison timezone
    const nowDateTime = DateTime.now().setZone(appSettings.timezone || 'America/New_York'); // [cite: 55]
// Keep your logs for verification (these are very helpful!)
    console.log(`[isTodayFilter] Checking Order ${order.orderNum}:`); // [cite: 56]
    console.log(`[isTodayFilter] Order time (${appSettings.timezone || 'America/New_York'}): ${orderDateTime.toISO()}`);
    console.log(`[isTodayFilter] Server's 'now' (${appSettings.timezone || 'America/New_York'}): ${nowDateTime.toISO()}`);
    console.log(`[isTodayFilter] Comparison: ${orderDateTime.toISODate()} === ${nowDateTime.toISODate()}`);
    console.log(`[isTodayFilter] Result: ${orderDateTime.toISODate() === nowDateTime.toISODate()}`); // [cite: 57]
    return orderDateTime.toISODate() === nowDateTime.toISODate();
};
app.get("/api/list", async (req, res) => { // [cite: 58]
  try {
    const allOrders = await getOrdersFromDB();
    const incomingOrdersToday = allOrders
      .filter(o => !o.orderProcessed && o.orderUpdateStatus !== 'ChkRecExist' && isTodayFilter(o))
      .sort((a, b) => new Date(a.timeOrdered).getTime() - new Date(b.timeOrdered).getTime());
    console.log("[Backend] incomingOrdersToday array sent to frontend:", incomingOrdersToday); // ADD THIS LINE
    res.json(incomingOrdersToday);
  } catch (err) {
    console.error("[Backend] ❌ Failed to fetch incoming orders:", err.message);
    res.status(500).json({ error: "Failed to fetch incoming orders: " + err.message });
  
  } // [cite: 59]
});

app.get("/api/updating", async (req, res) => {
    try {
        const allOrders = await getOrdersFromDB();
        const updatingOrdersToday = allOrders
            .filter(o => !o.orderProcessed && o.orderUpdateStatus === 'ChkRecExist' && isTodayFilter(o))
            .sort((a, b) => new Date(b.timeOrdered).getTime() - new Date(a.timeOrdered).getTime());
        res.json(updatingOrdersToday);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch updating orders: " + err.message }); // [cite: 60]
    }
}); // [cite: 61]
app.get("/api/printed", async (req, res) => {
    try {
        const allOrders = await getOrdersFromDB();
        const processedOrders = allOrders
            .filter(order => order.orderProcessed)
            .sort((a, b) => new Date(b.timeOrdered).getTime() - new Date(a.timeOrdered).getTime());
        res.json(processedOrders);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch processed orders: " + err.message });
 
    } // [cite: 62]
});

app.get("/api/order-by-row/:orderId", async (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId, 10);
        if (isNaN(orderId)) return res.status(400).json({ error: "Invalid orderId." });
        const allOrders = await getOrdersFromDB();
        const order = allOrders.find(o => o.id === orderId);
        console.log('[Backend] Order data before sending to frontend:', order);
        order ? res.json(order) : 
res.status(404).json({ error: "Order not found." }); // [cite: 63]
    } catch (err) {
        res.status(500).json({ 
            error: "Failed to fetch order by ID: " + err.message 
        });
    }
}); // [cite: 64]
// =================================================================================
// REPORTING AND SETTINGS ENDPOINTS (Refactored for PostgreSQL)
// =================================================================================
app.get('/api/today-stats', async (req, res) => {
    try {
        // Get the current date in the specific timezone (America/New_York)
        // using Luxon to ensure precise start and end of the day.
        const nowInNY = DateTime.now().setZone(appSettings.timezone);
        const todayNYStart = nowInNY.startOf('day');
        const todayNYEnd = nowInNY.endOf('day'); 
 
        // End of day in NY time

        // Convert these Luxon DateTime objects to ISO strings for PostgreSQL
        // PostgreSQL will correctly interpret these UTC ISO strings as timestamps
        const startDateISO = todayNYStart.toISO();
        const endDateISO = todayNYEnd.toISO();     

        const query = `
        
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE printed_count > 0) AS processed
            FROM orders
            WHERE created_at >= $1 AND created_at <= $2;
`; // [cite: 66]
        // Pass the calculated start and end dates as parameters
        const { rows } = await pool.query(query, [startDateISO, endDateISO]); // [cite: 67]
        console.log("[Backend] /api/today-stats - Raw SQL rows response:", rows); // [cite: 68]
        res.json(rows[0]);
        console.log("[Backend] /api/today-stats - Final JSON sent:", rows[0]); // [cite: 69]
    } catch (error) {
        console.error('Error fetching today\'s stats:', error); // [cite: 70]
        res.status(500).json({ error: 'Failed to fetch today\'s stats: ' + error.message });
    }
}); // [cite: 71]
app.get('/api/order-stats', async (req, res) => {
    try {
        const { range } = req.query;
        const days = range === 'YTD' ? 365 : parseInt(range, 10);
        const query = `
            SELECT
                DATE(created_at AT TIME ZONE $1) as order_date,
            COUNT(*) as 
${'count'} // [cite: 72]
            FROM orders
            WHERE created_at > (NOW() - INTERVAL '${days} days')
            GROUP BY order_date
            ORDER BY order_date;
        `;
        const { rows } = await pool.query(query, [appSettings.timezone]);
        const stats = rows.reduce((acc, row) => {
   
            acc[new Date(row.order_date).toISOString().split('T')[0]] = parseInt(row.count, 10); // [cite: 73]
            return acc;
        }, {});
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order stats: ' + error.message });
    }
}); // [cite: 74]
app.get('/api/popular-items', async (req, res) => {
    try {
        const { range } = req.query;
        const days = range === 'YTD' ? 365 : parseInt(range, 10);
        const query = `
            SELECT item_name, SUM(quantity) as count
            FROM order_items
            JOIN orders ON order_items.order_id = orders.id
  
            WHERE orders.created_at > (NOW() - INTERVAL '${days} days')
            GROUP BY item_name
            ORDER BY count DESC
            LIMIT 10;
        `; // [cite: 75]
        const { rows } = await pool.query(query);
        const itemCounts = rows.reduce((acc, row) => {
     
            acc[row.item_name] = parseInt(row.count, 10); // [cite: 76]
            return acc;
        }, {});
        res.json(itemCounts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch popular items: ' + error.message });
    }
}); // [cite: 77]
app.get('/api/hourly-orders', async (req, res) => {
    try {
        const startHour = parseInt(appSettings.reportStartHour, 10) || 0;
        const endHour = 23;

        const nowInNY 
= DateTime.now().setZone(appSettings.timezone); // [cite: 78]
        const todayNYStart = nowInNY.startOf('day');
        const todayNYEnd = nowInNY.endOf('day');

        const startDateISO = todayNYStart.toISO();
        const endDateISO = todayNYEnd.toISO();   

        const query = 
`
            SELECT
                EXTRACT(HOUR FROM created_at AT TIME ZONE $1) as hour,
                COUNT(*) as count
            FROM orders
            WHERE created_at >= $2 AND created_at <= $3  
 
            GROUP BY hour
            ORDER BY hour;
`; // [cite: 81]
        const { rows } = await pool.query(query, [appSettings.timezone, startDateISO, endDateISO]); // [cite: 82]
        const hourlyCounts = {}; // [cite: 82]
        for (let h = 0; h <= 23; h++) { // [cite: 83]
            const hourLabel = h < 12 ?
`${h === 0 ? 12 : h} AM` : `${h === 12 ? 12 : h - 12} PM`; // [cite: 84]
            hourlyCounts[hourLabel] = 0; // [cite: 85]
            }
                rows.forEach(row => {
                    const orderHour = parseInt(row.hour, 10);
                    const hourLabel = orderHour < 12 ? `${orderHour === 0 ? 12 : orderHour} AM` : `${orderHour === 12 ? 12 : orderHour - 12} PM`;
          
                    if (hourlyCounts.hasOwnProperty(hourLabel)) { // [cite: 86]
                        hourlyCounts[hourLabel] += parseInt(row.count, 10);
                    }
                });
        console.log("[Backend] /api/hourly-orders - Final hourlyCounts sent:", hourlyCounts); // [cite: 87]
                res.json(hourlyCounts);
            } catch (error) {
                console.error('Error fetching hourly orders:', error); // [cite: 88]
                res.status(500).json({ error: 'Failed to fetch hourly orders: ' + error.message });
            }
        }); // [cite: 89]
app.get('/api/customer-stats', async (req, res) => {
    try {
        const { range } = req.query;
        const days = range === 'YTD' ? 365 : parseInt(range, 10);
        const query = `
            SELECT
                c.id,
                c.name,
    
${'            c.phone'}, // [cite: 90]
                COUNT(o.id) as count
            FROM customers c
            JOIN orders o ON c.id = o.customer_id
            WHERE o.created_at > (NOW() - INTERVAL '${days} days')
            GROUP BY c.id, c.name, c.phone;
   
      `; // [cite: 91]
        const { rows } = await pool.query(query);
        const totalOrders = rows.reduce((sum, row) => sum + parseInt(row.count, 10), 0);
        const repeatCustomers = rows.filter(row => parseInt(row.count, 10) > 1).length;
        const topCustomers = rows
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
      
            .map(row => ({ name: row.name, phone: row.phone, count: parseInt(row.count, 10) })); // [cite: 92]
        res.json({ totalOrders, repeatCustomers, topCustomers }); // [cite: 93]
    } catch (error) {
        console.error('Error fetching customer stats:', error); // [cite: 94]
        res.status(500).json({ error: 'Failed to fetch customer stats: ' + error.message });
    }
});

// Settings Endpoints
app.get('/api/app-settings', (req, res) => res.json(appSettings)); // [cite: 95]
app.post('/api/app-settings', async (req, res) => {
    try {
        const newSettings = req.body;
        await saveAppSettings(newSettings);
        appSettings = newSettings;

        // 🔁 Restart the cron job with updated schedule
        if (cronJob) cronJob.stop();
        startCronJob();

        res.json({ success: true, message: 'App settings updated and cron job restarted.' });
    } catch (err) 
 
{ // [cite: 96]
        console.error("[App Settings] Failed to update settings:", err);
        res.status(500).json({ error: "Failed to update app settings" });
    }
}); // [cite: 97]
app.get('/api/print-settings', async (req, res) => {
    try {
        const data = await fsp.readFile(printerSettingsFilePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(404).json({ error: 'Printer settings not found.' });
    }
}); // [cite: 98]
app.post('/api/print-settings', async (req, res) => {
    try {
        await fsp.writeFile(printerSettingsFilePath, JSON.stringify(req.body, null, 2));
        res.json(req.body);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save printer settings: ' + err.message });
    }
}); // [cite: 99]
// =================================================================================
// MAIN PRINTING AND KDS ENDPOINTS (Refactored)
// =================================================================================
// Preserved helper functions for printing
function printViaLan(printerIp, payload) {
    return new Promise((resolve, reject) => {
        const port = 9100;
        const client = new net.Socket();
        client.setTimeout(5000);
        client.connect(port, printerIp, () => {
            console.log(`[LAN] Connected to printer at ${printerIp}:${port}`);
            const cutCommand = 
'\\x1b\\x64\\x00'; // [cite: 100]
            client.write(payload + '\\n\\n\\n' + cutCommand);
            client.end();
            resolve({ status: "success", message: "Print job sent to LAN printer." });
        });
        client.on('error', (err) => {
            console.error('[LAN] Printer connection error:', err);
            client.destroy();
   
            reject({ error: "Failed to connect to LAN printer", details: err.message }); // [cite: 101]
        });
        client.on('timeout', () => {
            console.error(`[LAN] Connection to ${printerIp}:${port} timed out.`);
            client.destroy();
            reject({ error: "Connection to LAN printer timed out." });
        }); // [cite: 102]
    });
}

async function testPrinterConnectivity(printerUrl, mode = 'LAN') {
    if (mode === 'LAN') {
        return new Promise((resolve) => {
            const client = new net.Socket();
            client.setTimeout(3000);
            client.connect(9100, printerUrl, () => {
                client.end();
             
                resolve({ available: true, message: 'LAN printer is responsive.' }); // [cite: 104]
            });
            client.on('error', (err) => resolve({ available: false, error: `LAN printer error: ${err.message}` }));
            client.on('timeout', () => {
                client.destroy();
                resolve({ available: false, error: 'Connection to LAN printer timed out.' }); // [cite: 105]
            });
        }); // [cite: 106]
    }

    // For CLOUD and MOCK, we perform an HTTP check
    return new Promise((resolve) => {
        let url;
        try {
            url = new URL(printerUrl);
        } catch (err) {
            return resolve({ available: false, error: `Invalid URL: ${err.message}` });
        }

       
        const protocol = url.protocol === 'https:' ? https : http; // [cite: 107]
        const method = mode === 'MOCK' ? 'POST' : 'HEAD';
        const testPayload = mode === 'MOCK' ? JSON.stringify({ test: true, from: 'PrinterStatusCheck' }) : '';

        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
      
            path: url.pathname + (url.search || ''), // [cite: 108]
            method,
            timeout: 5000,
            headers: {
                'User-Agent': 'Node.js Printer Status Check',
                ...(mode === 'MOCK' ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(testPayload) } : {})
    
            } // [cite: 109]
        };

        const req = protocol.request(options, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 400) {
                 resolve({ available: true, message: `Endpoint responded with status ${res.statusCode}` }); // [cite: 110]
            } else {
                 resolve({ available: false, error: `Endpoint not available (Status: ${res.statusCode})` }); // [cite: 111]
            }
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ available: false, error: 'Connection timed out.' });
        });
        req.on('error', (err) => resolve({ available: false, error: `Request error: ${err.message}` })); // [cite: 112]
        if (method === 'POST') {
            req.write(testPayload); // [cite: 113]
        }
        req.end(); // [cite: 114]
    }); // [cite: 115]
}

function buildOrderHTML(order) {
    const items = order.items.map(item => {
        const name = item.item || 'Unknown Item';
        const qty = item.qty || '1';
        const mod = item.modifier ? `<br>  <span style="color: red;">- ${item.modifier}</span>` : '';
        return `${qty}x ${name}${mod}`;
    }).join('<br>');
    const timeOrdered = new Date(order.timeOrdered || Date.now()).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); // [cite: 116]
    const firedAt = new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); // [cite: 117]
    const utensilLine = order.utensil ?
`Utensils:     ${order.utensil}\\n\\n` : ''; // [cite: 118]
    const totalLine = order.totalCost ?
`Total:        $${order.totalCost}\\n` : ''; // [cite: 119]
    return `<pre style="font-family: 'Courier New', Courier, monospace; font-size: 12pt; width: 80mm; margin: 0; padding: 0; line-height: 1.2;">
--------------------------------
    ** ORDER #${order.orderNum ||
'N/A'} **
--------------------------------
Order Type:   ${order.orderType || 'N/A'}
Time Ordered: ${timeOrdered}
Status:       ${order.orderUpdateStatus ||
'N/A'}
--------------------------------
Caller:  ${order.callerName || 'N/A'}
Phone:   ${order.callerPhone || 'N/A'}
Email:   ${order.email ||'N/A'}
Address: ${order.callerAddress || 'N/A'}
--------------------------------
${utensilLine}ITEMS:
${items}
--------------------------------
${totalLine}Fired at: ${firedAt}
</pre>`; // [cite: 123]
}

app.post("/api/fire-order", async (req, res) => {
    const { rowIndex: orderId } = req.body;
    if (!orderId || typeof orderId !== "number") {
        return res.status(400).json({ error: "Invalid order ID" });
    }

    try {
        let printerSettings;
        try {
            const data = await fsp.readFile(printerSettingsFilePath, 'utf8');
     
            printerSettings = JSON.parse(data); // [cite: 124]
        } catch (err) {
            return res.status(400).json({ error: "Printer settings not configured." });
        }

        const allOrders = await getOrdersFromDB();
        const orderToProcess = allOrders.find(o => o.id === orderId);
        if (!orderToProcess) {
      
            return res.status(404).json({ error: "Order not found" }); // [cite: 125]
        }

        const htmlReceipt = buildOrderHTML(orderToProcess);
        let printerResponseData = null;
        let printerError = null;

        switch (printerSettings.mode) {
            case 'MOCK':
   
                try { // [cite: 126]
                    if (!printerSettings.printerUrl) throw new Error("No URL for MOCK mode"); // [cite: 127]
                    const response = await axios.post(
                        printerSettings.printerUrl,
                        { ...orderToProcess, mode: 'MOCK' },
                        { timeout: 10000 }
                 
                    ); // [cite: 128]
                    printerResponseData = response.data;
                } catch (mockErr) {
                    printerError = { error: "Failed to send to MOCK webhook", details: mockErr.message }; // [cite: 129]
                }
                break; // [cite: 130]
            case 'LAN':
                try {
                    if (!printerSettings.printerUrl) throw new Error("No IP address for LAN mode"); // [cite: 131]
                    const plainTextReceipt = htmlReceipt
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/  +/g, ' '); // [cite: 132]
                    printerResponseData = await printViaLan(printerSettings.printerUrl, plainTextReceipt);
                } catch (lanErr) {
                    printerError = lanErr; // [cite: 133]
                }
                break; // [cite: 134]
            case 'CLOUD':
                const newJob = {
                    jobId: `job-${Date.now()}`,
                    content: htmlReceipt,
                    contentType: 'text/html'
                }; // [cite: 135]
                cloudPrintJobs.push(newJob);
                printerResponseData = { status: "CLOUD job staged", jobId: newJob.jobId };
                break; // [cite: 136]
            default:
                printerError = { error: `Invalid printer mode: ${printerSettings.mode}` }; // [cite: 137]
        }

        if (printerError) {
            return res.status(503).json(printerError); // [cite: 138]
        }

        // Get timestamp in Eastern Time (New York)
        const now = DateTime.now()
            .setZone(appSettings.timezone) // Rectified: Use appSettings.timezone
            .toISO(); // [cite: 139]

        // Update DB: increment count and add timestamp
        const updateQuery = `
            UPDATE orders
            SET 
                printed_count = printed_count + 1,
                printed_timestamps = 
        
${'    CASE'} // [cite: 140]
                        WHEN printed_timestamps IS NULL THEN ARRAY[$2]::text[]
                        ELSE array_append(printed_timestamps, $2)
                    END
            WHERE id = $1
      
${'       RETURNING printed_count, printed_timestamps;'} // [cite: 141]
        `;
        const { rows } = await pool.query(updateQuery, [orderId, now]); // [cite: 142]
        res.json({
            success: true,
            printerResponse: printerResponseData,
            message: `Order processed successfully.`,
            printedCount: rows[0].printed_count,
            printedTimestamps: rows[0].printed_timestamps
        }); // [cite: 143]
    } catch (err) {
        console.error("[🔥 API Error /api/fire-order]", err); // [cite: 144]
        res.status(500).json({ error: "Failed to process order", details: err.message });
    }
}); // [cite: 145]
app.get("/api/kds/active-orders", async (req, res) => {
    try {
        const allOrders = await getOrdersFromDB();
        const activeKitchenOrders = allOrders
            .filter(o => o.printedCount > 0 && o.orderUpdateStatus !== 'Prepped')
            .sort((a, b) => new Date(a.timeOrdered).getTime() - new Date(b.timeOrdered).getTime());

        // Fix the id mapping
        const formattedOrders = activeKitchenOrders.map(order => ({
   
${'          ...order'}, // [cite: 146]
            id: order.id // <-- this ensures frontend gets the DB id
        }));

        res.json(formattedOrders);

    } catch (err) {
        console.error("[KDS API] Failed to fetch active orders:", err);
        res.status(500).json({ error: "Failed to fetch active kitchen orders", details: err.message });
    }
}); // [cite: 147]
app.post("/api/kds/prep-order/:orderId", async (req, res) => {
    const { orderId } = req.params;
    const { prepTimeMs, prepTimestamp } = req.body;

    console.log(`[KDS API] Received prep request for Order #${orderId}`);
    console.log(`[KDS API] prepTimeMs: ${prepTimeMs}, type: ${typeof prepTimeMs}`);
    console.log(`[KDS API] prepTimestamp: ${prepTimestamp}, type: ${typeof prepTimestamp}`);

    if (!orderId || prepTimeMs === undefined || prepTimeMs === null || !prepTimestamp) {
        console.error(`[KDS API] Missing required 
${'fields for order #${orderId}: prepTimeMs=${prepTimeMs}, prepTimestamp=${prepTimestamp}'}`); // [cite: 148]
        return res.status(400).json({ error: "Missing orderId, prepTimeMs, or prepTimestamp" });
    }

    const finalPrepTime = typeof prepTimeMs === 'string' ?
parseInt(prepTimeMs, 10) : prepTimeMs; // [cite: 149]
    if (isNaN(finalPrepTime)) {
        console.error(`[KDS API] Invalid prepTimeMs for order #${orderId}: ${prepTimeMs}`);
        return res.status(400).json({ error: "Invalid prepTimeMs format" }); // [cite: 150]
    }


    try {
        const updateQuery = `
            UPDATE orders
            SET
                order_update_status = 'Prepped',
                food_prep_time = $1,
           
${'      prepped_at_timestamp = $2'} // [cite: 151]
            WHERE id = $3;
`; // [cite: 152]
        await pool.query(updateQuery, [finalPrepTime, prepTimestamp, orderId]); // [cite: 153]
        res.json({ success: true, message: `Order #${orderId} marked as prepped.` }); // [cite: 154]
    } catch (err) {
        console.error(`[KDS API] Failed to update order #${orderId}:`, err); // [cite: 155]
        res.status(500).json({ error: "Failed to update order in database", details: err.message });
    }
}); // [cite: 156]
app.get("/api/kds/prepped-orders", async (req, res) => {
    try {
        const allOrders = await getOrdersFromDB();
        console.log("🔎 Raw orders from DB:", allOrders);
        const preppedKitchenOrders = allOrders
            .filter(o => o.orderUpdateStatus === 'Prepped')
      
            .sort((a, b) => new Date(b.preppedTimestamp || b.created_at) - new Date(a.preppedTimestamp || a.created_at)); // [cite: 157]

        const formattedOrders = preppedKitchenOrders.map(order => ({
            ...order,
 
            id: order.id
        })); // [cite: 158]

        res.json(formattedOrders);

    } catch (err) {
        console.error("[KDS API] Failed to fetch prepped orders:", err);
        res.status(500).json({ error: "Failed to fetch prepped orders", details: err.message }); // [cite: 159]
    }
}); // [cite: 160]
// ** PRESERVED PRINTER AND SETTINGS CODE **
app.post("/api/cloudprnt", (req, res) => {
    if (req.body && req.body.jobToken) {
        const jobIndex = cloudPrintJobs.findIndex(job => job.jobId === req.body.jobToken);
        if (jobIndex > -1) cloudPrintJobs.splice(jobIndex, 1);
        return res.status(200).send("OK");
    }
    if (cloudPrintJobs.length > 0) {
        const job = cloudPrintJobs[0];
        const host = req.get('host');
        const 
protocol 
= req.get('x-forwarded-proto') || req.protocol; // [cite: 161]
        const getUrl = `${protocol}://${host}/api/cloudprnt-content/${job.jobId}`;
        res.json({ jobReady: true, mediaTypes: [job.contentType], jobToken: job.jobId, get: getUrl });
    } else {
        res.json({ jobReady: false, pollInterval: 30000 });
    }
}); // [cite: 162]
app.get('/api/cloudprnt-content/:jobId', (req, res) => {
    const job = cloudPrintJobs.find(j => j.jobId === req.params.jobId);
    if (job) {
        res.type(job.contentType).send(job.content);
    } else {
        res.status(404).send('Job not found.');
    }
}); // [cite: 163]
app.get('/api/printer-status', async (req, res) => {
    try {
        const data = await fsp.readFile(printerSettingsFilePath, 'utf8');
        const settings = JSON.parse(data);
        if (!settings.printerUrl) {
            return res.status(400).json({ available: false, mode: settings.mode, error: 'No printer URL configured' });
        }
        const printerCheck = await testPrinterConnectivity(settings.printerUrl, settings.mode);
        res.status(printerCheck.available ? 200 : 
 
503).json({ ...printerCheck, mode: settings.mode }); // [cite: 164]
    } catch (err) {
        res.status(500).json({ available: false, error: 'Failed to check printer status: ' + err.message });
    }
}); // [cite: 165]
// =================================================================================
// VAPI SETTING ENDPOINTS (Updated)
// =================================================================================

// Get VAPI settings from PostgreSQL
app.get('/api/vapi-settings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT api_key, assistant_id, file_id FROM vapi_settings WHERE id = 1');
    if (rows.length === 0) {
      // If no settings exist, return default empty values
      return res.json({ api_key: '', assistant_id: '', file_id: '' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching VAPI settings:', err);
    res.status(500).send('Error ${'fetching VAPI settings');'} // [cite: 166]
  }
});

// Save/Update VAPI settings to PostgreSQL (UPSERT logic)
app.post('/api/vapi-settings', async (req, res) => {
  try {
    const { apiKey, assistantId, fileId } = req.body;
    const result = await pool.query(
      'UPDATE vapi_settings SET api_key = $1, assistant_id = $2, file_id = $3 WHERE id = 1 RETURNING *',
      [apiKey, assistantId, fileId]
  
    ); // [cite: 167]

    if (result.rowCount === 0) {
      await pool.query(
        'INSERT INTO vapi_settings (id, api_key, assistant_id, file_id) VALUES (1, $1, $2, $3)',
        [apiKey, assistantId, fileId]
      );
    }
    res.json({ success: true, message: 'VAPI settings saved successfully.' });
  } catch (err) {
    console.error('Error saving VAPI settings:', err);
    res.status(500).send('Error saving ${'VAPI settings');'} // [cite: 168]
  }
});

// NEW ENDPOINT: Get list of files from VAPI
app.get('/api/vapi/files', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT api_key, assistant_id FROM vapi_settings WHERE id = 1');
    if (rows.length === 0 || !rows[0].api_key || !rows[0].assistant_id) {
      console.log('VAPI API Key or Assistant ID not configured.');
      return res.json([]); 
    }
    const 
${'{ api_key, assistant_id } = rows[0];'} // [cite: 169]

    // Make request to VAPI to get file list
    const response = await axios.get(`https://api.vapi.ai/file?assistantId=${assistant_id}`, {
      headers: { Authorization: `Bearer ${api_key}` },
    });
    res.json(response.data);
  } catch (err) {
    console.error('Error listing VAPI files:', err.response ? err.response.data : err.message);
    res.status(500).send('Error listing VAPI files.');
  }
}); // [cite: 170]
// NEW ENDPOINT: Get content of a specific file from VAPI (Updated to VAPI spec)
app.get('/api/vapi/files/:fileId/content', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { rows } = await pool.query('SELECT api_key FROM vapi_settings WHERE id = 1');
    if (rows.length === 0 || !rows[0].api_key) {
      console.log('VAPI API Key not configured.');
      return res.status(400).send('VAPI API Key not configured.');
    }
    const { api_key } = rows[0];

    // Step 1: Get 
${'file metadata from VAPI using GET /file/:id'} // [cite: 171]
    const vapiMetadataResponse = await axios.get(`https://api.vapi.ai/file/${fileId}`, {
      headers: { Authorization: `Bearer ${api_key}` },
    });

    const fileMetadata = vapiMetadataResponse.data;

    if (fileMetadata && fileMetadata.url) {
        console.log(`[VAPI Content] Fetching content from external URL: ${fileMetadata.url}`);
        // Step 2: Fetch content from the external URL
        const externalContentResponse 
= await axios.get(fileMetadata.url); // [cite: 172]
        res.json(externalContentResponse.data);
    } else if (fileMetadata && fileMetadata.content !== undefined) {
        // If VAPI returns content directly (e.g., for smaller, directly stored files)
        console.log(`[VAPI Content] Content found directly in VAPI metadata.`);
        res.json(fileMetadata.content); // [cite: 173]
    } else {
        // If neither URL nor direct content is found
        console.warn(`File ${fileId} data retrieved, but neither 'url' nor 'content' field found. File metadata:`, fileMetadata);
        res.status(404).send('File content not found or file is not a text-based format accessible via URL/direct content.'); // [cite: 174]
    } // [cite: 175]
  } catch (err) {
    console.error(`Error retrieving VAPI file content for ${fileId}:`, err.response ? err.response.data : err.message); // [cite: 176]
    res.status(500).send('Error retrieving VAPI file content.');
  }
});

// NEW ENDPOINT: Delete a file from VAPI
app.delete('/api/vapi/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const { rows } = await pool.query('SELECT api_key FROM vapi_settings WHERE id = 1');
        if (rows.length === 0 || !rows[0].api_key) {
            console.log('VAPI API Key not configured.');
            return 
${'res.status(400).send(\'VAPI API Key not configured.\');'} // [cite: 177]
        }
        const { api_key } = rows[0];

        console.log(`[VAPI Delete] Attempting to delete file: ${fileId}`);
        const response = await axios.delete(`https://api.vapi.ai/file/${fileId}`, {
            headers: { Authorization: `Bearer ${api_key}` },
        });

        console.log('[VAPI Delete] Successful VAPI delete response:', response.data);
        res.json({ 
${'success: true, message: `File ${fileId} deleted from VAPI!`, vapiResponse: response.data'}); // [cite: 178]
    } catch (err) {
        console.error(`Error deleting VAPI file ${req.params.fileId}:`, err.response ?
${'err.response.data : err.message);'} // [cite: 179]
        res.status(500).send('Error deleting VAPI file.');
    }
});


// MODIFIED ENDPOINT: Update daily specials in VAPI (Implements delete and re-upload)
app.post('/api/daily-specials', async (req, res) => {
  try {
    const newContent = req.body;
    const { rows } = await pool.query('SELECT api_key, file_id AS vapi_file_id FROM vapi_settings WHERE id = 1');
    if (rows.length === 0 || !rows[0].api_key || !rows[0].vapi_file_id) {
      console.log('VAPI API ${'Key or File ID not configured for daily specials update.');'} // [cite: 180]
      return res.status(400).send('VAPI API Key or File ID not configured for daily specials update.');
    }
    const { api_key, vapi_file_id: old_vapi_file_id } = rows[0];

    console.log(`[VAPI Update Flow] Attempting to update daily specials.`);
    const fileName = 'daily_specials.json';
    const fileMimeType = 'application/json';
    const jsonContentString = JSON.stringify(newContent);
    const contentBuffer = Buffer.from(jsonContentString, 'utf8'); // [cite: 181]

    // Step 1: Delete the old file
    try {
        console.log(`[VAPI Update Flow] Deleting old file ${old_vapi_file_id}...`); // [cite: 182]
        await axios.delete(`https://api.vapi.ai/file/${old_vapi_file_id}`, {
            headers: { Authorization: `Bearer ${api_key}` },
        }); // [cite: 183]
        console.log(`[VAPI Update Flow] Old file ${old_vapi_file_id} deleted successfully.`);
    } catch (deleteErr) {
        console.warn(`[VAPI Update Flow] Warning: Failed to delete old file ${old_vapi_file_id}. Error: ${deleteErr.response ? deleteErr.response.data : deleteErr.message}`); // [cite: 184]
    }

    // Step 2: Upload the new content as a new file using FormData
    console.log('[VAPI Update Flow] Uploading new file with updated content using FormData...'); // [cite: 185]
    const formData = new FormData();
    formData.append('file', contentBuffer, {
        filename: fileName,
        contentType: fileMimeType
    }); // [cite: 186]
    formData.append('purpose', 'assistant');

    const uploadResponse = await axios.post('https://api.vapi.ai/file', formData, {
        headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${api_key}`
        },
    }); // [cite: 187]
    const newVapiFile = uploadResponse.data;
    console.log('[VAPI Update Flow] New file uploaded successfully:', newVapiFile); // [cite: 188]
    // Step 3: Update the file_id in your database to the new file's ID
    console.log(`[VAPI Update Flow] Updating database with new file ID: ${newVapiFile.id}`); // [cite: 189]
    await pool.query(
      'UPDATE vapi_settings SET file_id = $1 WHERE id = 1',
      [newVapiFile.id]
    ); // [cite: 190]
    console.log('[VAPI Update Flow] Daily specials updated successfully in VAPI (via re-upload)!'); // [cite: 191]
    res.json({
        success: true,
        message: 'Daily specials updated in VAPI (via re-upload)!',
        newFileId: newVapiFile.id,
        vapiResponse: newVapiFile
    }); // [cite: 192]
  } catch (err) {
    console.error('Error updating daily specials in VAPI:', err.response ? err.response.data : err.message); // [cite: 193]
    res.status(500).send('Error updating daily specials.');
  }
});


//=================================================================================
// get daily special from postgre
//=================================================================================
app.get('/api/businesses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT business_id, business_name FROM businesses');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching businesses:', err);
    res.status(500).json({ error: 'Failed to fetch businesses: ' + err.message });
  }
}); // [cite: 194]
app.get('/api/daily-specials', async (req, res) => {
  try {
    const { business_id } = req.query;
    if (!business_id) return res.status(400).json({ error: 'business_id is required' });
    const { rows } = await pool.query(
      'SELECT special_id, business_id, special_date, item_name, item_description, price FROM daily_specials WHERE business_id = $1',
      [business_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching daily specials:', err);
    res.status(500).json({ error: 'Failed to fetch daily specials: ' + err.message });
  
  } // [cite: 195]
});

// NEW/MODIFIED ENDPOINT: Update daily specials in PostgreSQL
app.post('/api/daily-specials/postgres', async (req, res) => {
  try {
    const { business_id, daily_specials } = req.body;
    if (!business_id || !daily_specials) return res.status(400).json({ error: 'business_id and daily_specials are required' });

    // Delete existing specials for the business
    await pool.query('DELETE FROM daily_specials WHERE business_id = $1', [business_id]);

    // Insert new specials with unique special_id
    const query = `
      INSERT INTO daily_specials (special_id, business_id, special_date, item_name, item_description, 
${'price, created_at, updated_at)'} // [cite: 196]
      VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    for (const special of daily_specials) {
      const specialId = special.id || `special-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await pool.query(query, [specialId, business_id, special.name, special.description, special.price]); // [cite: 197]
    }

    res.json({ success: true, message: 'Daily specials updated successfully in PostgreSQL!' }); // [cite: 198]
  } catch (err) {
    console.error('Error updating daily specials in PostgreSQL:', err); // [cite: 199]
    res.status(500).json({ error: 'Failed to update daily specials in PostgreSQL: ' + err.message }); // [cite: 200]
  }
});



// ── Login route (inline) ─────────────────────────────────
// THIS INLINE LOGIN ROUTE IS NO LONGER USED, AS IT'S BEEN MOVED TO auth.routes.cjs
// Keeping it commented out here for reference.
/*
app.post("/api/login", async (req, res, next) => { // [cite: 201]
  try {
    const { email, password } = req.body;

    // 1️⃣  select name in addition to id + email
    const { rows } = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email=$1",
      [email]
    );
    if (!rows.length)
      return res.status(401).json({ message: "Invalid credentials" });

    const user = rows[0];

   
    // 2️⃣  verify password
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ message: "Invalid credentials" });

    // 3️⃣  look up permissions (unchanged)
    const permissions = await getUserPermissions(user.id);

    // 4️⃣  include name in the JWT payload
    const token = jwt.sign(
      {
        id:    user.id,
        name:  user.name,  // [cite: 202]
        email: user.email,    // ← keeps fallback
        permissions,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );
    // 5️⃣  return the token to front‑end
    res.json({ token }); // [cite: 203]
  } catch (err) {
    next(err); // [cite: 204]
  }
});
*/


// =================================================================================
// SERVER INITIALIZATION
// =================================================================================
let cronJob; // [cite: 205]
const startCronJob = () => {
    if (cronJob) { // [cite: 205]
        cronJob.stop(); // [cite: 206]
    }

    cronJob = cron.schedule(
        appSettings.archiveCronSchedule,
        async function () {
            console.log(`[Cron Job] Running archiveOrders at ${new Date().toLocaleTimeString()}`);

            try {
                const yesterdayInAppTimezone = DateTime.now().setZone(appSettings.timezone).minus({ days: 1 }).endOf('day'); // [cite: 207]
                const archiveCutoffISO = yesterdayInAppTimezone.toISO();

                const result = await pool.query(`
                    UPDATE orders
                    SET archived = TRUE
 
                    WHERE created_at <= $1
                      AND archived = FALSE;
                `, [archiveCutoffISO]); // [cite: 208]
                
    
                console.log(`[Cron Job] Archived ${result.rowCount} old unprocessed orders.`); // [cite: 209]
            } catch (err) { // [cite: 210]
                console.error("[Cron Job] Failed to archive orders:", err); // [cite: 211]
            }
        },
        {
            scheduled: true,
            timezone: appSettings.timezone
        }
    ); // [cite: 212]
    console.log(`[Cron Job] Scheduled to run at: ${appSettings.archiveCronSchedule} in timezone ${appSettings.timezone}`);
}; // [cite: 213]

// OLD RBAC generateAccessToken function - no longer used as issueAccessToken handles it in auth.routes.cjs
/*
async function generateAccessToken(user) { // [cite: 214]
  // 1) get permission names for this user
  const sql = `
    SELECT p.name
    FROM   users u
    JOIN   role_permissions rp ON rp.role_id = u.role_id
    JOIN   permissions      
 p  ON p.id = rp.permission_id
    WHERE  u.id = $1;
`; // [cite: 216]
  const { rows } = await pool.query(sql, [user.id]);
  const permissions = rows.map(r => r.name);
// 2) build payload
  const payload = { // [cite: 217]
    id: user.id,
    email: user.email,
    role_id: user.role_id,
    permissions           // ← include array
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "24h" }); // 
}
*/

pool.connect()
    .then(() => {
        console.log("✅ Database connection successful.");
        startCronJob();
        
        // Auth API routes (login, logout, refresh) - MOUNT THESE BEFORE ADMIN ROUTES
        app.use("/api/auth", authRoutes);

        // Admin API - these should be *inside* the .then block's callback
        app.use("/api/admin", authenticateToken, adminRoutes);

        app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
    
            if (process.env.RENDER_URL) {
                console.log(`✅ Server is publicly available at: ${process.env.RENDER_URL}`); // [cite: 219]
            }
        });
    })
    .catch(err => {
        console.error("❌ Failed to connect to the database and start server:", err.message);
   
        process.exit(1); // [cite: 220]
    }); // [cite: 221]
const saveAppSettings = async (settings) => {
    try {
        await fsp.writeFile(appSettingsFilePath, JSON.stringify(settings, null, 2)); // [cite: 222]
    } catch (err) {
        console.error("[App Settings] Failed to save settings to file:", err); // [cite: 223]
        throw err;
    }
};