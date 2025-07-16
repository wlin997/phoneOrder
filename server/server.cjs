// =================================================================================
// SETUP & CONFIGURATION
// =================================================================================
process.env.TZ = 'America/New_York'; // Set default timezone

const express = require("express");
const cookieParser = require('cookie-parser');
const adminRoutes = require("./admin.routes.cjs");
const authRoutes = require("./auth.routes.cjs");
const { authenticateToken, authorizePermissions } = require("./auth.middleware.cjs");

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const cors = require("cors");
const cron = require('node-cron');
const http = require('http');
const https = require('https');
const net = require('net');
const axios = require('axios');
const { Pool } = require('pg');
const { DateTime } = require('luxon');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3001;
const appSettingsFilePath = path.join(__dirname, 'appSettings.json');
const printerSettingsFilePath = path.join(__dirname, 'printerSettings.json');

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
  process.env.RENDER_FRONTEND_URL,
  'https://synthpify-phoneorder-front.qorender.com'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(cookieParser()); // Add cookie-parser middleware here

// =================================================================================
// DATABASE CONNECTION (PostgreSQL)
// =================================================================================
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
let cloudPrintJobs = [];
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
            o.printed_timestamps,
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
            m.price_delta,
            o.prepped_at_timestamp
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        LEFT JOIN order_items i ON o.id = i.order_id
        LEFT JOIN order_item_modifiers m ON i.id = m.order_item_id
        WHERE o.archived = FALSE
        ORDER BY o.created_at DESC;
    `;

    const { rows } = await pool.query(query);
    console.log("[Backend] Raw rows from DB query:", rows);
    const ordersMap = new Map();
    for (const row of rows) {
        if (!ordersMap.has(row.order_id)) {
            ordersMap.set(row.order_id, {
                id: row.order_id,
                rowIndex: row.order_id,
                orderNum: row.order_id,
                orderType: row.order_type,
                totalCost: row.total_price,
                notes: row.notes,
                timeOrdered: row.created_at,
                utensil: row.utensil_request,
                category: row.category,
                orderUpdateStatus: row.order_update_status,
                printedCount: row.printed_count,
                printedTimestamps: row.printed_timestamps || [],
                isTheUsual: row.is_the_usual,
                orderProcessed: row.printed_count > 0,
                orderPrepped: row.order_update_status === 'Prepped',
                cancelled: row.order_update_status === 'Cancelled',
                callerName: row.customer_name,
                callerPhone: row.customer_phone,
                email: row.customer_email,
                callerAddress: row.customer_address,
                items: [],
                foodPrepTime: row.food_prep_time,
                preppedTimestamp: row.prepped_at_timestamp
            });
        }

        if (row.item_id) {
            const order = ordersMap.get(row.order_id);
            const existingItem = order.items.find(item => item.item_id === row.item_id);
            if (!existingItem) {
                order.items.push({
                    item_id: row.item_id,
                    item_name: row.item_name,
                    qty: row.quantity,
                    base_price: row.base_price,
                    total_price_each: row.total_price_each,
                    modifiers: [],
                });
            }

            if (row.modifier_id) {
                const item = order.items.find(item => item.item_id === row.item_id);
                item.modifiers.push({
                    id: row.modifier_id,
                    name: row.modifier_name,
                    price_delta: row.price_delta,
                });
            }
        }
    }

    for (const order of ordersMap.values()) {
        for (const item of order.items) {
            item.modifier = item.modifiers.map(m => m.name).join(', ');
        }
    }
    console.log("[Backend] ordersMap values (pre-filter):", Array.from(ordersMap.values()));
    return Array.from(ordersMap.values());
}

async function archiveOrders() {
    console.log(`[Cron Job] Running archiveOrders at ${new Date().toLocaleTimeString()}`);
    console.log("[Cron Job] Archive logic would run here. No action taken in this version.");
}

// =================================================================================
// EXPRESS API ENDPOINTS (Refactored for PostgreSQL)
// =================================================================================

app.get("/", (req, res) => res.send("✅ Backend server is alive"));
const isTodayFilter = (order) => {
    if (!order || !order.timeOrdered) return false;
    const orderDateTime = DateTime.fromJSDate(order.timeOrdered).setZone(appSettings.timezone || 'America/New_York');

    const nowDateTime = DateTime.now().setZone(appSettings.timezone || 'America/New_York');
    console.log(`[isTodayFilter] Checking Order ${order.orderNum}:`);
    console.log(`[isTodayFilter] Order time (${appSettings.timezone || 'America/New_York'}): ${orderDateTime.toISO()}`);
    console.log(`[isTodayFilter] Server's 'now' (${appSettings.timezone || 'America/New_York'}): ${nowDateTime.toISO()}`);
    console.log(`[isTodayFilter] Comparison: ${orderDateTime.toISODate()} === ${nowDateTime.toISODate()}`);
    console.log(`[isTodayFilter] Result: ${orderDateTime.toISODate() === nowDateTime.toISODate()}`);
    return orderDateTime.toISODate() === nowDateTime.toISODate();
};
app.get("/api/list", async (req, res) => {
  try {
    const allOrders = await getOrdersFromDB();
    const incomingOrdersToday = allOrders
      .filter(o => !o.orderProcessed && o.orderUpdateStatus !== 'ChkRecExist' && isTodayFilter(o))
      .sort((a, b) => new Date(a.timeOrdered).getTime() - new Date(b.timeOrdered).getTime());
    console.log("[Backend] incomingOrdersToday array sent to frontend:", incomingOrdersToday);
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
        console.log('[Backend] Order data before sending to frontend:', order);
        order ? res.json(order) : res.status(404).json({ error: "Order not found." });
    } catch (err) {
        res.status(500).json({
            error: "Failed to fetch order by ID: " + err.message
        });
    }
});
// =================================================================================
// REPORTING AND SETTINGS ENDPOINTS (Refactored for PostgreSQL)
// =================================================================================
app.get('/api/today-stats', async (req, res) => {
    try {
        const nowInNY = DateTime.now().setZone(appSettings.timezone);
        const todayNYStart = nowInNY.startOf('day');
        const todayNYEnd = nowInNY.endOf('day');

        const startDateISO = todayNYStart.toISO();
        const endDateISO = todayNYEnd.toISO();

        const query = `
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE printed_count > 0) AS processed
            FROM orders
            WHERE created_at >= $1 AND created_at <= $2;
        `;
        const { rows } = await pool.query(query, [startDateISO, endDateISO]);
        console.log("[Backend] /api/today-stats - Raw SQL rows response:", rows);
        res.json(rows[0]);
        console.log("[Backend] /api/today-stats - Final JSON sent:", rows[0]);
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
        const startHour = parseInt(appSettings.reportStartHour, 10) || 0;
        const endHour = 23;

        const nowInNY = DateTime.now().setZone(appSettings.timezone);
        const todayNYStart = nowInNY.startOf('day');
        const todayNYEnd = nowInNY.endOf('day');

        const startDateISO = todayNYStart.toISO();
        const endDateISO = todayNYEnd.toISO();

        const query = `
            SELECT
                EXTRACT(HOUR FROM created_at AT TIME ZONE $1) as hour,
                COUNT(*) as count
            FROM orders
            WHERE created_at >= $2 AND created_at <= $3
            GROUP BY hour
            ORDER BY hour;
        `;
        const { rows } = await pool.query(query, [appSettings.timezone, startDateISO, endDateISO]);
        const hourlyCounts = {};
        for (let h = 0; h <= 23; h++) {
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
        console.log("[Backend] /api/hourly-orders - Final hourlyCounts sent:", hourlyCounts);
                res.json(hourlyCounts);
            } catch (error) {
                console.error('Error fetching hourly orders:', error);
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
        let printerSettings;
        try {
            const data = await fsp.readFile(printerSettingsFilePath, 'utf8');
            printerSettings = JSON.parse(data);
        } catch (err) {
            return res.status(400).json({ error: "Printer settings not configured." });
        }

        const allOrders = await getOrdersFromDB();
        const orderToProcess = allOrders.find(o => o.id === orderId);
        if (!orderToProcess) {
            return res.status(404).json({ error: "Order not found" });
        }

        const htmlReceipt = buildOrderHTML(orderToProcess);
        let printerResponseData = null;
        let printerError = null;

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

        const now = DateTime.now()
            .setZone(appSettings.timezone)
            .toISO();

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

        const formattedOrders = activeKitchenOrders.map(order => ({
            ...order,
            id: order.id
        }));

        res.json(formattedOrders);

    } catch (err) {
        console.error("[KDS API] Failed to fetch active orders:", err);
        res.status(500).json({ error: "Failed to fetch active kitchen orders", details: err.message });
    }
});
app.post("/api/kds/prep-order/:orderId", async (req, res) => {
    const { orderId } = req.params;
    const { prepTimeMs, prepTimestamp } = req.body;

    console.log(`[KDS API] Received prep request for Order #${orderId}`);
    console.log(`[KDS API] prepTimeMs: ${prepTimeMs}, type: ${typeof prepTimeMs}`);
    console.log(`[KDS API] prepTimestamp: ${prepTimestamp}, type: ${typeof prepTimestamp}`);

    if (!orderId || prepTimeMs === undefined || prepTimeMs === null || !prepTimestamp) {
        console.error(`[KDS API] Missing required fields for order #${orderId}: prepTimeMs=${prepTimeMs}, prepTimestamp=${prepTimestamp}`);
        return res.status(400).json({ error: "Missing orderId, prepTimeMs, or prepTimestamp" });
    }

    const finalPrepTime = typeof prepTimeMs === 'string' ? parseInt(prepTimeMs, 10) : prepTimeMs;
    if (isNaN(finalPrepTime)) {
        console.error(`[KDS API] Invalid prepTimeMs for order #${orderId}: ${prepTimeMs}`);
        return res.status(400).json({ error: "Invalid prepTimeMs format" });
    }

    try {
        const updateQuery = `
            UPDATE orders
            SET
                order_update_status = 'Prepped',
                food_prep_time = $1,
                prepped_at_timestamp = $2
            WHERE id = $3;
        `;
        await pool.query(updateQuery, [finalPrepTime, prepTimestamp, orderId]);
        res.json({ success: true, message: `Order #${orderId} marked as prepped.` });
    } catch (err) {
        console.error(`[KDS API] Failed to update order #${orderId}:`, err);
        res.status(500).json({ error: "Failed to update order in database", details: err.message });
    }
});

app.get("/api/kds/prepped-orders", async (req, res) => {
    try {
        const allOrders = await getOrdersFromDB();
        console.log("🔎 Raw orders from DB:", allOrders);
        const preppedKitchenOrders = allOrders
            .filter(o => o.orderUpdateStatus === 'Prepped')
            .sort((a, b) => new Date(b.preppedTimestamp || b.created_at) - new Date(a.preppedTimestamp || a.created_at));

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
// VAPI SETTING ENDPOINTS (Updated)
// =================================================================================

// Get VAPI settings from PostgreSQL
app.get('/api/vapi-settings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT api_key, assistant_id, file_id FROM vapi_settings WHERE id = 1');
    if (rows.length === 0) {
      return res.json({ api_key: '', assistant_id: '', file_id: '' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching VAPI settings:', err);
    res.status(500).send('Error fetching VAPI settings');
  }
});

// Save/Update VAPI settings to PostgreSQL (UPSERT logic)
app.post('/api/vapi-settings', async (req, res) => {
  try {
    const { apiKey, assistantId, fileId } = req.body;
    const result = await pool.query(
      'UPDATE vapi_settings SET api_key = $1, assistant_id = $2, file_id = $3 WHERE id = 1 RETURNING *',
      [apiKey, assistantId, fileId]
    );

    if (result.rowCount === 0) {
      await pool.query(
        'INSERT INTO vapi_settings (id, api_key, assistant_id, file_id) VALUES (1, $1, $2, $3)',
        [apiKey, assistantId, fileId]
      );
    }
    res.json({ success: true, message: 'VAPI settings saved successfully.' });
  } catch (err) {
    console.error('Error saving VAPI settings:', err);
    res.status(500).send('Error saving VAPI settings');
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
    const { api_key, assistant_id } = rows[0];

    const response = await axios.get(`https://api.vapi.ai/file?assistantId=${assistant_id}`, {
      headers: { Authorization: `Bearer ${api_key}` },
    });
    res.json(response.data);
  } catch (err) {
    console.error('Error listing VAPI files:', err.response ? err.response.data : err.message);
    res.status(500).send('Error listing VAPI files.');
  }
});
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

    const vapiMetadataResponse = await axios.get(`https://api.vapi.ai/file/${fileId}`, {
      headers: { Authorization: `Bearer ${api_key}` },
    });

    const fileMetadata = vapiMetadataResponse.data;

    if (fileMetadata && fileMetadata.url) {
        console.log(`[VAPI Content] Fetching content from external URL: ${fileMetadata.url}`);
        const externalContentResponse = await axios.get(fileMetadata.url);
        res.json(externalContentResponse.data);
    } else if (fileMetadata && fileMetadata.content !== undefined) {
        console.log(`[VAPI Content] Content found directly in VAPI metadata.`);
        res.json(fileMetadata.content);
    } else {
        console.warn(`File ${fileId} data retrieved, but neither 'url' nor 'content' field found. File metadata:`, fileMetadata);
        res.status(404).send('File content not found or file is not a text-based format accessible via URL/direct content.');
    }
  } catch (err) {
    console.error(`Error retrieving VAPI file content for ${fileId}:`, err.response ? err.response.data : err.message);
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
            return res.status(400).send('VAPI API Key not configured.');
        }
        const { api_key } = rows[0];

        console.log(`[VAPI Delete] Attempting to delete file: ${fileId}`);
        const response = await axios.delete(`https://api.vapi.ai/file/${fileId}`, {
            headers: { Authorization: `Bearer ${api_key}` },
        });

        console.log('[VAPI Delete] Successful VAPI delete response:', response.data);
        res.json({ success: true, message: `File ${fileId} deleted from VAPI!`, vapiResponse: response.data });
    } catch (err) {
        console.error(`Error deleting VAPI file ${req.params.fileId}:`, err.response ? err.response.data : err.message);
        res.status(500).send('Error deleting VAPI file.');
    }
});

// MODIFIED ENDPOINT: Update daily specials in VAPI (Implements delete and re-upload)
app.post('/api/daily-specials', async (req, res) => {
  try {
    const newContent = req.body;
    const { rows } = await pool.query('SELECT api_key, file_id AS vapi_file_id FROM vapi_settings WHERE id = 1');
    if (rows.length === 0 || !rows[0].api_key || !rows[0].vapi_file_id) {
      console.log('VAPI API Key or File ID not configured for daily specials update.');
      return res.status(400).send('VAPI API Key or File ID not configured for daily specials update.');
    }
    const { api_key, vapi_file_id: old_vapi_file_id } = rows[0];

    console.log(`[VAPI Update Flow] Attempting to update daily specials.`);
    const fileName = 'daily_specials.json';
    const fileMimeType = 'application/json';
    const jsonContentString = JSON.stringify(newContent);
    const contentBuffer = Buffer.from(jsonContentString, 'utf8');

    // Step 1: Delete the old file
    try {
        console.log(`[VAPI Update Flow] Deleting old file ${old_vapi_file_id}...`);
        await axios.delete(`https://api.vapi.ai/file/${old_vapi_file_id}`, {
            headers: { Authorization: `Bearer ${api_key}` },
        });
        console.log(`[VAPI Update Flow] Old file ${old_vapi_file_id} deleted successfully.`);
    } catch (deleteErr) {
        console.warn(`[VAPI Update Flow] Warning: Failed to delete old file ${old_vapi_file_id}. Error: ${deleteErr.response ? deleteErr.response.data : deleteErr.message}`);
    }

    // Step 2: Upload the new content as a new file using FormData
    console.log('[VAPI Update Flow] Uploading new file with updated content using FormData...');
    const formData = new FormData();
    formData.append('file', contentBuffer, {
        filename: fileName,
        contentType: fileMimeType
    });
    formData.append('purpose', 'assistant');

    const uploadResponse = await axios.post('https://api.vapi.ai/file', formData, {
        headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${api_key}`
        },
    });
    const newVapiFile = uploadResponse.data;
    console.log('[VAPI Update Flow] New file uploaded successfully:', newVapiFile);
    // Step 3: Update the file_id in your database to the new file's ID
    console.log(`[VAPI Update Flow] Updating database with new file ID: ${newVapiFile.id}`);
    await pool.query(
      'UPDATE vapi_settings SET file_id = $1 WHERE id = 1',
      [newVapiFile.id]
    );
    console.log('[VAPI Update Flow] Daily specials updated successfully in VAPI (via re-upload)!');
    res.json({
        success: true,
        message: 'Daily specials updated in VAPI (via re-upload)!',
        newFileId: newVapiFile.id,
        vapiResponse: newVapiFile
    });
  } catch (err) {
    console.error('Error updating daily specials in VAPI:', err.response ? err.response.data : err.message);
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
});
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
  }
});

// NEW/MODIFIED ENDPOINT: Update daily specials in PostgreSQL
app.post('/api/daily-specials/postgres', async (req, res) => {
  try {
    const { business_id, daily_specials } = req.body;
    if (!business_id || !daily_specials) return res.status(400).json({ error: 'business_id and daily_specials are required' });

    await pool.query('DELETE FROM daily_specials WHERE business_id = $1', [business_id]);

    const query = `
      INSERT INTO daily_specials (special_id, business_id, special_date, item_name, item_description, price, created_at, updated_at)
      VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    for (const special of daily_specials) {
      const specialId = special.id || `special-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await pool.query(query, [specialId, business_id, special.name, special.description, special.price]);
    }

    res.json({ success: true, message: 'Daily specials updated successfully in PostgreSQL!' });
  } catch (err) {
    console.error('Error updating daily specials in PostgreSQL:', err);
    res.status(500).json({ error: 'Failed to update daily specials in PostgreSQL: ' + err.message });
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
        async function () {
            console.log(`[Cron Job] Running archiveOrders at ${new Date().toLocaleTimeString()}`);

            try {
                const yesterdayInAppTimezone = DateTime.now().setZone(appSettings.timezone).minus({ days: 1 }).endOf('day');
                const archiveCutoffISO = yesterdayInAppTimezone.toISO();

                const result = await pool.query(`
                    UPDATE orders
                    SET archived = TRUE
                    WHERE created_at <= $1
                      AND archived = FALSE;
                `, [archiveCutoffISO]);

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

        app.use("/api/admin", authenticateToken, adminRoutes);
        app.use("/api/auth", authRoutes); // Mount auth.routes.cjs under /api/auth

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

const saveAppSettings = async (settings) => {
    try {
        await fsp.writeFile(appSettingsFilePath, JSON.stringify(settings, null, 2));
    } catch (err) {
        console.error("[App Settings] Failed to save settings to file:", err);
        throw err;
    }
};