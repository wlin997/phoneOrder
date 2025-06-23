// =================================================================================
// SETUP & CONFIGURATION
// =================================================================================
process.env.TZ = 'America/New_York'; // Set default timezone

const express = require("express");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const cors = require("cors");
const cron = require('node-cron');
const http = require('http');
const https = require('https');
const net = require('net');
const axios = require('axios');
const { Pool } = require('pg'); // Import the pg Pool
const { DateTime } = require('luxon');

const app = express();
const PORT = process.env.PORT || 3001;

// --- File paths for local settings ---
const appSettingsFilePath = path.join(__dirname, 'appSettings.json');
const printerSettingsFilePath = path.join(__dirname, 'printerSettings.json');


const now = DateTime.now()
  .setZone('America/New_York')
  .toISO();  // Example: '2025-06-23T16:55:00.123-04:00'

// --- Load app settings from file or use defaults ---
const getAppSettings = () => {
  try {
    const data = fs.readFileSync(appSettingsFilePath, 'utf8');
    return JSON.parse(data);
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
  }
}));
app.use(express.json());

// =================================================================================
// DATABASE CONNECTION (PostgreSQL)
// =================================================================================
// ... your other requires like express, cors, etc.


// ADD THIS DEBUGGING LINE:
console.log('--- DEBUG --- DATABASE_URL is:', process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

console.log("✅ PostgreSQL client initialized.");

// =================================================================================
// HELPER AND UTILITY FUNCTIONS
// =================================================================================
let cloudPrintJobs = []; // Preserve this from original code

// This new function completely replaces getSheetData() and getOrderRows()
async function getOrdersFromDB() {
  const query = `
  SELECT
    o.id AS order_id,
    o.order_type,
    o.total_price,
    o.notes,
    o.created_at,
    o.utensil_request,
    o.category,
    o.food_prep_time,
    o.order_update_status,
    o.printed_count,
    o.is_the_usual,
    o.archived,
    c.id AS customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    c.email AS customer_email,
    c.address AS customer_address,
    i.id AS item_id,
    i.item_name,
    i.quantity,
    i.base_price,
    i.total_price AS total_price_each,
    m.id AS modifier_id,
    m.modifier_name,
    m.price_delta
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  LEFT JOIN order_items i ON o.id = i.order_id
  LEFT JOIN order_item_modifiers m ON i.id = m.order_item_id
  WHERE o.archived = FALSE
  ORDER BY o.created_at DESC;
`;


  const { rows } = await pool.query(query);

  // Restructure the flat SQL result into the nested JSON the frontend expects
  const ordersMap = new Map();

  for (const row of rows) {
    if (!ordersMap.has(row.order_id)) {
      ordersMap.set(row.order_id, {
        id: row.order_id,
        rowIndex: row.order_id, // For backward compatibility with frontend
        orderNum: row.order_id,
        orderType: row.order_type,
        totalCost: row.total_price,
        notes: row.notes,
        timeOrdered: row.created_at,
        utensil: row.utensil_request,
        category: row.category,
        orderUpdateStatus: row.order_update_status,
        printedCount: row.printed_count,
        isTheUsual: row.is_the_usual,
        orderProcessed: row.printed_count > 0, // Logic: if printed, it's processed
        orderPrepped: row.order_update_status === 'Prepped', // New logic for KDS
        cancelled: row.order_update_status === 'Cancelled', // New logic
        callerName: row.customer_name,
        callerPhone: row.customer_phone,
        email: row.customer_email,
        callerAddress: row.customer_address,
        items: [],
      });
    }

    const order = ordersMap.get(row.order_id);

    if (row.item_id && !order.items.some(i => i.id === row.item_id)) {
      order.items.push({
        id: row.item_id,
        item: row.item_name,
        qty: row.quantity,
        modifier: '', // Will be built from modifiers array
        modifiers: [],
      });
    }

    if (row.modifier_id) {
      const item = order.items.find(i => i.id === row.item_id);
      if (item && !item.modifiers.some(m => m.id === row.modifier_id)) {
        item.modifiers.push({
          id: row.modifier_id,
          name: row.modifier_name,
          price_delta: row.price_delta,
        });
      }
    }
  }

  // Final pass to format the modifier string the old frontend expects
  for (const order of ordersMap.values()) {
      for (const item of order.items) {
          item.modifier = item.modifiers.map(m => m.name).join(', ');
      }
  }

  return Array.from(ordersMap.values());
}

async function archiveOrders() {
    console.log(`[Cron Job] Running archiveOrders at ${new Date().toLocaleTimeString()}`);
    // This logic is now handled by querying based on date ranges.
    // Archiving can be a more complex database operation (e.g., moving to another table).
    // For now, we will log that the concept exists.
    console.log("[Cron Job] Archive logic would run here. No action taken in this version.");
}


// =================================================================================
// EXPRESS API ENDPOINTS (Refactored for PostgreSQL)
// =================================================================================

app.get("/", (req, res) => res.send("✅ Backend server is alive"));

const isTodayFilter = (order) => {
    if (!order || !order.timeOrdered) return false;
    const now = new Date();
    const orderDate = new Date(order.timeOrdered);
    return orderDate.getFullYear() === now.getFullYear() &&
           orderDate.getMonth() === now.getMonth() &&
           orderDate.getDate() === now.getDate();
};

app.get("/api/list", async (req, res) => {
  try {
    const allOrders = await getOrdersFromDB();
    const incomingOrdersToday = allOrders
      .filter(o => !o.orderProcessed && o.orderUpdateStatus !== 'ChkRecExist' && isTodayFilter(o))
      .sort((a, b) => new Date(a.timeOrdered).getTime() - new Date(b.timeOrdered).getTime());
    res.json(incomingOrdersToday);
  } catch (err) {
    console.error("[Backend] ❌ Failed to fetch incoming orders:", err.message);
    res.status(500).json({ error: "Failed to fetch incoming orders: " + err.message });
  }
});

app.get("/api/updating", async (req, res) => {
    try {
        const allOrders = await getOrdersFromDB();
        const updatingOrdersToday = allOrders
            .filter(o => !o.orderProcessed && o.orderUpdateStatus === 'ChkRecExist' && isTodayFilter(o))
            .sort((a, b) => new Date(b.timeOrdered).getTime() - new Date(a.timeOrdered).getTime());
        res.json(updatingOrdersToday);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch updating orders: " + err.message });
    }
});

app.get("/api/printed", async (req, res) => {
    try {
        const allOrders = await getOrdersFromDB();
        const processedOrders = allOrders
            .filter(order => order.orderProcessed)
            .sort((a, b) => new Date(b.timeOrdered).getTime() - new Date(a.timeOrdered).getTime());
        res.json(processedOrders);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch processed orders: " + err.message });
   }
});

app.get("/api/order-by-row/:orderId", async (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId, 10);
        if (isNaN(orderId)) return res.status(400).json({ error: "Invalid orderId." });
        const allOrders = await getOrdersFromDB();
        const order = allOrders.find(o => o.id === orderId);
        order ? res.json(order) : res.status(404).json({ error: "Order not found." });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch order by ID: " + err.message });
    }
});


// =================================================================================
// REPORTING AND SETTINGS ENDPOINTS (Refactored for PostgreSQL)
// =================================================================================
app.get('/api/today-stats', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE printed_count > 0) AS processed
            FROM orders
            WHERE created_at >= current_date AT TIME ZONE $1;
        `, [appSettings.timezone]);
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching today\'s stats:', error);
        res.status(500).json({ error: 'Failed to fetch today\'s stats: ' + error.message });
    }
});

app.get('/api/order-stats', async (req, res) => {
    try {
        const { range } = req.query;
        const days = range === 'YTD' ? 365 : parseInt(range, 10);
        const query = `
            SELECT
                DATE(created_at AT TIME ZONE $1) as order_date,
                COUNT(*) as count
            FROM orders
            WHERE created_at > (NOW() - INTERVAL '${days} days')
            GROUP BY order_date
            ORDER BY order_date;
        `;
        const { rows } = await pool.query(query, [appSettings.timezone]);
        const stats = rows.reduce((acc, row) => {
            acc[new Date(row.order_date).toISOString().split('T')[0]] = parseInt(row.count, 10);
            return acc;
        }, {});
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order stats: ' + error.message });
    }
});

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
        `;
        const { rows } = await pool.query(query);
        const itemCounts = rows.reduce((acc, row) => {
            acc[row.item_name] = parseInt(row.count, 10);
            return acc;
        }, {});
        res.json(itemCounts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch popular items: ' + error.message });
    }
});

app.get('/api/hourly-orders', async (req, res) => {
    try {
        const startHour = parseInt(appSettings.reportStartHour, 10) || 4;
        const query = `
            SELECT
                EXTRACT(HOUR FROM created_at AT TIME ZONE $1) as hour,
                COUNT(*) as count
            FROM orders
            WHERE created_at >= current_date AT TIME ZONE $1
            GROUP BY hour
            ORDER BY hour;
        `;
        const { rows } = await pool.query(query, [appSettings.timezone]);
        const hourlyCounts = {};
        for (let h = startHour; h <= 23; h++) {
            const hourLabel = h < 12 ? `${h === 0 ? 12 : h} AM` : `${h === 12 ? 12 : h - 12} PM`;
            hourlyCounts[hourLabel] = 0;
        }
        rows.forEach(row => {
            const orderHour = parseInt(row.hour, 10);
            const hourLabel = orderHour < 12 ? `${orderHour === 0 ? 12 : orderHour} AM` : `${orderHour === 12 ? 12 : orderHour - 12} PM`;
            if (hourlyCounts.hasOwnProperty(hourLabel)) {
                hourlyCounts[hourLabel] += parseInt(row.count, 10);
            }
        });
        res.json(hourlyCounts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch hourly orders: ' + error.message });
    }
});

app.get('/api/customer-stats', async (req, res) => {
    try {
        const { range } = req.query;
        const days = range === 'YTD' ? 365 : parseInt(range, 10);
        const query = `
            SELECT
                c.id,
                c.name,
                c.phone,
                COUNT(o.id) as count
            FROM customers c
            JOIN orders o ON c.id = o.customer_id
            WHERE o.created_at > (NOW() - INTERVAL '${days} days')
            GROUP BY c.id, c.name, c.phone;
        `;
        const { rows } = await pool.query(query);
        const totalOrders = rows.reduce((sum, row) => sum + parseInt(row.count, 10), 0);
        const repeatCustomers = rows.filter(row => parseInt(row.count, 10) > 1).length;
        const topCustomers = rows
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map(row => ({ name: row.name, phone: row.phone, count: parseInt(row.count, 10) }));
        res.json({ totalOrders, repeatCustomers, topCustomers });
    } catch (error) {
        console.error('Error fetching customer stats:', error);
        res.status(500).json({ error: 'Failed to fetch customer stats: ' + error.message });
    }
});

// Settings Endpoints
app.get('/api/app-settings', (req, res) => res.json(appSettings));
app.post('/api/app-settings', async (req, res) => {
    try {
        const newSettings = req.body;
        await saveAppSettings(newSettings);
        appSettings = newSettings;

        // 🔁 Restart the cron job with updated schedule
        if (cronJob) cronJob.stop();
        startCronJob();

        res.json({ success: true, message: 'App settings updated and cron job restarted.' });
    } catch (err) {
        console.error("[App Settings] Failed to update settings:", err);
        res.status(500).json({ error: "Failed to update app settings" });
    }
});
app.get('/api/print-settings', async (req, res) => {
    try {
        const data = await fsp.readFile(printerSettingsFilePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(404).json({ error: 'Printer settings not found.' });
    }
});
app.post('/api/print-settings', async (req, res) => {
    try {
        await fsp.writeFile(printerSettingsFilePath, JSON.stringify(req.body, null, 2));
        res.json(req.body);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save printer settings: ' + err.message });
    }
});


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
            const cutCommand = '\x1b\x64\x00';
            client.write(payload + '\n\n\n' + cutCommand);
            client.end();
            resolve({ status: "success", message: "Print job sent to LAN printer." });
        });
        client.on('error', (err) => {
            console.error('[LAN] Printer connection error:', err);
            client.destroy();
            reject({ error: "Failed to connect to LAN printer", details: err.message });
        });
        client.on('timeout', () => {
            console.error(`[LAN] Connection to ${printerIp}:${port} timed out.`);
            client.destroy();
            reject({ error: "Connection to LAN printer timed out." });
        });
    });
}

async function testPrinterConnectivity(printerUrl, mode = 'LAN') {
    if (mode === 'LAN') {
        return new Promise((resolve) => {
            const client = new net.Socket();
            client.setTimeout(3000);
            client.connect(9100, printerUrl, () => {
                client.end();
                resolve({ available: true, message: 'LAN printer is responsive.' });
            });
            client.on('error', (err) => resolve({ available: false, error: `LAN printer error: ${err.message}` }));
            client.on('timeout', () => {
                client.destroy();
                resolve({ available: false, error: 'Connection to LAN printer timed out.' });
            });
        });
    }

    // For CLOUD and MOCK, we perform an HTTP check
    return new Promise((resolve) => {
        let url;
        try {
            url = new URL(printerUrl);
        } catch (err) {
            return resolve({ available: false, error: `Invalid URL: ${err.message}` });
        }

        const protocol = url.protocol === 'https:' ? https : http;
        const method = mode === 'MOCK' ? 'POST' : 'HEAD';
        const testPayload = mode === 'MOCK' ? JSON.stringify({ test: true, from: 'PrinterStatusCheck' }) : '';

        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + (url.search || ''),
            method,
            timeout: 5000,
            headers: {
                'User-Agent': 'Node.js Printer Status Check',
                ...(mode === 'MOCK' ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(testPayload) } : {})
            }
        };

        const req = protocol.request(options, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 400) {
                 resolve({ available: true, message: `Endpoint responded with status ${res.statusCode}` });
            } else {
                 resolve({ available: false, error: `Endpoint not available (Status: ${res.statusCode})` });
            }
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ available: false, error: 'Connection timed out.' });
        });
        req.on('error', (err) => resolve({ available: false, error: `Request error: ${err.message}` }));
        if (method === 'POST') {
            req.write(testPayload);
        }
        req.end();
    });
}

function buildOrderHTML(order) {
    const items = order.items.map(item => {
        const name = item.item || 'Unknown Item';
        const qty = item.qty || '1';
        const mod = item.modifier ? `<br>  <span style="color: red;">- ${item.modifier}</span>` : '';
        return `${qty}x ${name}${mod}`;
    }).join('<br>');
    const timeOrdered = new Date(order.timeOrdered || Date.now()).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const firedAt = new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const utensilLine = order.utensil ? `Utensils:     ${order.utensil}\n\n` : '';
    const totalLine = order.totalCost ? `Total:        $${order.totalCost}\n` : '';

    return `<pre style="font-family: 'Courier New', Courier, monospace; font-size: 12pt; width: 80mm; margin: 0; padding: 0; line-height: 1.2;">
--------------------------------
    ** ORDER #${order.orderNum || 'N/A'} **
--------------------------------
Order Type:   ${order.orderType || 'N/A'}
Time Ordered: ${timeOrdered}
Status:       ${order.orderUpdateStatus || 'N/A'}
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
</pre>`;
}

app.post("/api/fire-order", async (req, res) => {
    const { rowIndex: orderId } = req.body;
    if (!orderId || typeof orderId !== "number") {
        return res.status(400).json({ error: "Invalid order ID" });
    }

    try {
        // Load printer settings
        let printerSettings;
        try {
            const data = await fsp.readFile(printerSettingsFilePath, 'utf8');
            printerSettings = JSON.parse(data);
        } catch (err) {
            return res.status(400).json({ error: "Printer settings not configured." });
        }

        // Fetch order
        const allOrders = await getOrdersFromDB();
        const orderToProcess = allOrders.find(o => o.id === orderId);
        if (!orderToProcess) {
            return res.status(404).json({ error: "Order not found" });
        }

        // Format receipt
        const htmlReceipt = buildOrderHTML(orderToProcess);
        let printerResponseData = null;
        let printerError = null;

        // Send to printer
        switch (printerSettings.mode) {
            case 'MOCK':
                try {
                    if (!printerSettings.printerUrl) throw new Error("No URL for MOCK mode");
                    const response = await axios.post(
                        printerSettings.printerUrl,
                        { ...orderToProcess, mode: 'MOCK' },
                        { timeout: 10000 }
                    );
                    printerResponseData = response.data;
                } catch (mockErr) {
                    printerError = { error: "Failed to send to MOCK webhook", details: mockErr.message };
                }
                break;

            case 'LAN':
                try {
                    if (!printerSettings.printerUrl) throw new Error("No IP address for LAN mode");
                    const plainTextReceipt = htmlReceipt
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/  +/g, ' ');
                    printerResponseData = await printViaLan(printerSettings.printerUrl, plainTextReceipt);
                } catch (lanErr) {
                    printerError = lanErr;
                }
                break;

            case 'CLOUD':
                const newJob = {
                    jobId: `job-${Date.now()}`,
                    content: htmlReceipt,
                    contentType: 'text/html'
                };
                cloudPrintJobs.push(newJob);
                printerResponseData = { status: "CLOUD job staged", jobId: newJob.jobId };
                break;

            default:
                printerError = { error: `Invalid printer mode: ${printerSettings.mode}` };
        }

        if (printerError) {
            return res.status(503).json(printerError);
        }

        // Get timestamp in Eastern Time (New York)
        const now = DateTime.now()
            .setZone("America/New_York")
            .toISO();  // e.g. 2025-06-23T17:45:00.123-04:00

        // Update DB: increment count and add timestamp
        const updateQuery = `
            UPDATE orders
            SET 
                printed_count = printed_count + 1,
                printed_timestamps = 
                    CASE 
                        WHEN printed_timestamps IS NULL THEN ARRAY[$2]::text[]
                        ELSE array_append(printed_timestamps, $2)
                    END
            WHERE id = $1
            RETURNING printed_count, printed_timestamps;
        `;
        const { rows } = await pool.query(updateQuery, [orderId, now]);

        res.json({
            success: true,
            printerResponse: printerResponseData,
            message: `Order processed successfully.`,
            printedCount: rows[0].printed_count,
            printedTimestamps: rows[0].printed_timestamps
        });

    } catch (err) {
        console.error("[🔥 API Error /api/fire-order]", err);
        res.status(500).json({ error: "Failed to process order", details: err.message });
    }
});


app.get("/api/kds/active-orders", async (req, res) => {
    try {
        const allOrders = await getOrdersFromDB();
        const activeKitchenOrders = allOrders
            .filter(o => o.printedCount > 0 && o.orderUpdateStatus !== 'Prepped')
            .sort((a, b) => new Date(a.timeOrdered).getTime() - new Date(b.timeOrdered).getTime());

        // Fix the id mapping
        const formattedOrders = activeKitchenOrders.map(order => ({
            ...order,
            id: order.id // <-- this ensures frontend gets the DB id
        }));

        res.json(formattedOrders);

    } catch (err) {
        console.error("[KDS API] Failed to fetch active orders:", err);
        res.status(500).json({ error: "Failed to fetch active kitchen orders", details: err.message });
    }
});


app.post("/api/kds/prep-order/:orderId", async (req, res) => {
    const { orderId } = req.params;
    const { prepTime } = req.body;

    if (!orderId || prepTime === undefined) {
        return res.status(400).json({ error: "Missing orderId or prepTime" });
    }

    try {
        const updateQuery = `
            UPDATE orders
            SET
                order_update_status = 'Prepped',
                food_prep_time = $1
            WHERE id = $2;
        `;
        await pool.query(updateQuery, [prepTime, orderId]);
        res.json({ success: true, message: `Order #${orderId} marked as prepped.` });
    } catch (err) {
        console.error(`[KDS API] Failed to update order #${orderId}:`, err);
        res.status(500).json({ error: "Failed to update order in database", details: err.message });
    }
});

// ADD THIS ENTIRE NEW ENDPOINT to server.cjs

app.get("/api/kds/prepped-orders", async (req, res) => {
    try {
        const allOrders = await getOrdersFromDB(); // This function should already exist in your file
        console.log("🔎 Raw orders from DB:", allOrders);
        // Filter for orders that are marked as 'Prepped'
        const preppedKitchenOrders = allOrders
            .filter(o => o.orderUpdateStatus === 'Prepped')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) // Sort newest first
            .slice(0, 20); // Optionally limit to the last 20 prepped orders

        // Format the data for the frontend (id vs order_id)
        const formattedOrders = preppedKitchenOrders.map(order => ({
            ...order,
            id: order.id
        }));

        res.json(formattedOrders);

    } catch (err) {
        console.error("[KDS API] Failed to fetch prepped orders:", err);
        res.status(500).json({ error: "Failed to fetch prepped orders", details: err.message });
    }
});


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
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const getUrl = `${protocol}://${host}/api/cloudprnt-content/${job.jobId}`;
        res.json({ jobReady: true, mediaTypes: [job.contentType], jobToken: job.jobId, get: getUrl });
    } else {
        res.json({ jobReady: false, pollInterval: 30000 });
    }
});

app.get('/api/cloudprnt-content/:jobId', (req, res) => {
    const job = cloudPrintJobs.find(j => j.jobId === req.params.jobId);
    if (job) {
        res.type(job.contentType).send(job.content);
    } else {
        res.status(404).send('Job not found.');
    }
});

app.get('/api/printer-status', async (req, res) => {
    try {
        const data = await fsp.readFile(printerSettingsFilePath, 'utf8');
        const settings = JSON.parse(data);
        if (!settings.printerUrl) {
            return res.status(400).json({ available: false, mode: settings.mode, error: 'No printer URL configured' });
        }
        const printerCheck = await testPrinterConnectivity(settings.printerUrl, settings.mode);
        res.status(printerCheck.available ? 200 : 503).json({ ...printerCheck, mode: settings.mode });
    } catch (err) {
        res.status(500).json({ available: false, error: 'Failed to check printer status: ' + err.message });
    }
});

// =================================================================================
// SERVER INITIALIZATION
// =================================================================================
let cronJob;

const startCronJob = () => {
    if (cronJob) {
        cronJob.stop();
    }

    cronJob = cron.schedule(
        appSettings.archiveCronSchedule,
        async function archiveOrders() {
            console.log(`[Cron Job] Running archiveOrders at ${new Date().toLocaleTimeString()}`);

            try {
                const result = await pool.query(`
                    UPDATE orders
                    SET archived = TRUE
                    WHERE created_at < CURRENT_DATE
                      AND archived = FALSE;
                `);
                console.log(`[Cron Job] Archived ${result.rowCount} old unprocessed orders.`);
            } catch (err) {
                console.error("[Cron Job] Failed to archive orders:", err);
            }
        },
        {
            scheduled: true,
            timezone: appSettings.timezone
        }
    );

    console.log(`[Cron Job] Scheduled to run at: ${appSettings.archiveCronSchedule} in timezone ${appSettings.timezone}`);
};


pool.connect()
    .then(() => {
        console.log("✅ Database connection successful.");
        startCronJob();
        app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
            if (process.env.RENDER_URL) {
                console.log(`✅ Server is publicly available at: ${process.env.RENDER_URL}`);
            }
        });
    })
    .catch(err => {
        console.error("❌ Failed to connect to the database and start server:", err.message);
        process.exit(1);
    });
