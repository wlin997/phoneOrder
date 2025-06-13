// This line is kept for local development consistency.
// The primary setting should be the TZ variable in your Render dashboard.
process.env.TZ = 'America/New_York';

const axios = require('axios');
const express = require("express");
const { google } = require("googleapis");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const cron = require('node-cron');
const http = require('http');
const https = require('https');
const net = require('net');

const app = express();
const PORT = process.env.PORT || 3001;

// --- File paths for settings ---
const appSettingsFilePath = path.join(__dirname, 'appSettings.json');
const printerSettingsFilePath = path.join(__dirname, 'printerSettings.json');

// --- Function to load app settings from file or use defaults ---
const getAppSettings = () => {
  try {
    const data = fs.readFileSync(appSettingsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // If file doesn't exist or is invalid, return defaults
    return {
      timezone: 'America/New_York',
      reportStartHour: 8,
      archiveCronSchedule: '0 2 * * *' // Default to 2 AM
    };
  }
};

// --- MODIFIED: Load settings on startup ---
let appSettings = getAppSettings();
process.env.TZ = appSettings.timezone;


const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173',
  process.env.RENDER_FRONTEND_URL
];

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

const SERVICE_ACCOUNT_FILE = path.join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS);
const SHEET_ID = '1jhfeNgtIsnZZya8R91dPoMmXdbAUT_0wtcCq_022MGE';
const SHEET_TAB = 'orderItems';
const ORDER_HISTORY_TAB = 'orderHistory';

const COLUMN_HEADERS = {
    CATEGORY: 'Category',
    CANCELLED: 'Cancelled',
    ORDER_PROCESSED: 'Order_Processed',
    ORDER_TYPE: 'Order_type',
    ORDER_UPDATE_STATUS: 'Order_Update_Status',
    TIME_ORDERED: 'Time_ordered',
    EMAIL: 'Email',
    ORDER_NUM: 'OrderNum',
    CALLER_NAME: 'Caller_name',
    CALLER_PHONE: 'Caller_phone',
    CALLER_ADDRESS: 'Caller_address',
    CALLER_CITY: 'Caller_City',
    CALLER_STATE: 'Caller_State',
    CALLER_ZIP: 'Caller_Zip',
    SHEET_LAST_MODIFIED: 'Sheet_Last_Modified',
    PRINTED_COUNT: 'Printed_Count',
    PRINTED_TIMESTAMPS: 'Printed_Timestamps',
    ORDER_ITEM_PREFIX: 'Order_item_',
    QTY_PREFIX: 'Qty_',
    MODIFIER_PREFIX: 'modifier_',
    ORDER_SUMMARY: 'orderSummary',
    // --- NEW: Column headers for KDS ---
    ORDER_PREP: 'Order_prep',
    FOOD_PREP_TIME: 'Food_prep_time'
};

const printHistoryFile = path.join(__dirname, "printHistory.json");
let printHistory = [];
let sheets;
let cloudPrintJobs = [];

let sheetDataCache = {
    data: [],
    lastFetchTime: 0,
    isFetching: false,
    fetchPromise: null
};

// =================================================================================
// HELPER AND UTILITY FUNCTIONS
// =================================================================================

function columnToLetter(n) {
    let s = '';
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

function invalidateSheetDataCache() {
    sheetDataCache.data = [];
    sheetDataCache.lastFetchTime = 0;
    console.log("[Backend Cache] Sheet data cache invalidated.");
}

function buildOrderHTML(order) {
    const items = order.items.map(item => {
        const name = item.item || 'Unknown Item';
        const qty = item.qty || '1';
        const mod = item.modifier ? `<br>  <span style="color: red;">- ${item.modifier}</span>` : '';
        return `${qty}x ${name}${mod}`;
    }).join('<br>');

    const timeOrdered = new Date(order.timeOrdered || Date.now()).toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    const firedAt = new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    return `
<pre style="font-family: 'Courier New', Courier, monospace; font-size: 12pt; width: 80mm; margin: 0; padding: 0; line-height: 1.2;">
--------------------------------
    ** ORDER #${order.orderNum || 'N/A'} **
--------------------------------
Order Type:   ${order.orderType || 'N/A'}
Time Ordered: ${timeOrdered}
Status:       ${order.orderUpdateStatus || 'N/A'}
--------------------------------
Caller:  ${order.callerName || 'N/A'}
Phone:   ${order.callerPhone || 'N/A'}
Email:   ${order.email || 'N/A'}
Address: ${[order.callerAddress, order.callerCity, order.callerState, order.callerZip].filter(Boolean).join(', ') || 'N/A'}
--------------------------------
ITEMS:
${items}
--------------------------------
Fired at: ${firedAt}
</pre>
  `;
}

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

// =================================================================================
// GOOGLE SHEETS AND DATA LOGIC
// =================================================================================

const normalizeToUTCMidnight = (date) => {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
};

async function getOrderRows() {
    if (!sheets) throw new Error("Google Sheets client not initialized.");
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: ORDER_HISTORY_TAB });
        const rows = response.data.values || [];
        if (rows.length === 0) return [];
        const header = rows[0].map(h => String(h).trim());
        const dataRows = rows.slice(1);
        return dataRows.map(row => {
            const obj = {};
            header.forEach((colName, index) => obj[colName] = row[index] !== undefined ? String(row[index]).trim() : '');
            return obj;
        });
    } catch (err) {
        console.error(`Error reading Google Sheet from ${ORDER_HISTORY_TAB}:`, err.message);
        throw new Error(`Failed to read Google Sheet data for report: ${err.message}`);
    }
}

async function initializeGoogleClients() {
    try {
        await fsp.access(SERVICE_ACCOUNT_FILE);
        const auth = new google.auth.GoogleAuth({ keyFile: SERVICE_ACCOUNT_FILE, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
        const authClient = await auth.getClient();
        sheets = google.sheets({ version: "v4", auth: authClient });
        console.log("✅ Google Sheets client initialized successfully.");
    } catch (err) {
        console.error("❌ Failed to initialize Google Sheets client:", err.message);
        throw new Error(`Google Sheets client initialization failed: ${err.message}`);
    }
}

async function ensurePrintHistory() {
    try {
        await fsp.access(printHistoryFile);
    } catch (err) {
        await fsp.writeFile(printHistoryFile, JSON.stringify([]));
    }
}

async function loadPrintHistory() {
    try {
        const data = await fsp.readFile(printHistoryFile, "utf8");
        printHistory = JSON.parse(data);
    } catch (err) {
        console.error("Error loading printHistory.json:", err.message);
    }
}

async function savePrintHistory() {
    try {
        await fsp.writeFile(printHistoryFile, JSON.stringify(printHistory, null, 2));
    } catch (err) {
        console.error("Error saving printHistory.json:", err.message);
    }
}

async function getSheetData(forceFetch = false) {
    const now = Date.now();
    const CACHE_DURATION = 30000;
    if (sheetDataCache.isFetching) return sheetDataCache.fetchPromise;
    if (!forceFetch && sheetDataCache.data.length > 0 && (now - sheetDataCache.lastFetchTime < CACHE_DURATION)) {
        return Promise.resolve(sheetDataCache.data);
    }
    sheetDataCache.isFetching = true;
    sheetDataCache.fetchPromise = (async () => {
        try {
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_TAB });
            const rows = response.data.values || [];
            if (rows.length < 1) {
                sheetDataCache.data = [];
                sheetDataCache.lastFetchTime = now;
                return [];
            }
            const header = rows[0];
            const colMap = Object.fromEntries(header.map((h, i) => [h, i]));
            const dataRows = rows.slice(1);
            const parsedData = dataRows.map((row, index) => {
                const getVal = (colName) => row[colMap[colName]] !== undefined ? String(row[colMap[colName]]).trim() : '';
                const order = {
                    id: (index + 2),
                    orderNum: getVal(COLUMN_HEADERS.ORDER_NUM) || `TEMP-${uuidv4().substring(0, 8)}-${index + 2}`,
                    category: getVal(COLUMN_HEADERS.CATEGORY),
                    cancelled: getVal(COLUMN_HEADERS.CANCELLED).toUpperCase() === 'TRUE',
                    orderProcessed: getVal(COLUMN_HEADERS.ORDER_PROCESSED).toUpperCase() === 'Y',
                    orderType: getVal(COLUMN_HEADERS.ORDER_TYPE),
                    orderUpdateStatus: getVal(COLUMN_HEADERS.ORDER_UPDATE_STATUS) || 'NONE',
                    timeOrdered: getVal(COLUMN_HEADERS.TIME_ORDERED),
                    email: getVal(COLUMN_HEADERS.EMAIL),
                    callerName: getVal(COLUMN_HEADERS.CALLER_NAME),
                    callerPhone: getVal(COLUMN_HEADERS.CALLER_PHONE),
                    callerAddress: getVal(COLUMN_HEADERS.CALLER_ADDRESS),
                    callerCity: getVal(COLUMN_HEADERS.CALLER_CITY),
                    callerState: getVal(COLUMN_HEADERS.CALLER_STATE),
                    callerZip: getVal(COLUMN_HEADERS.CALLER_ZIP),
                    sheetLastModified: getVal(COLUMN_HEADERS.SHEET_LAST_MODIFIED),
                    printedCount: parseInt(getVal(COLUMN_HEADERS.PRINTED_COUNT) || '0', 10),
                    printedTimestamps: getVal(COLUMN_HEADERS.PRINTED_TIMESTAMPS).split(',').filter(Boolean),
                    orderSummary: getVal(COLUMN_HEADERS.ORDER_SUMMARY),
                    rowIndex: index + 2,
                    orderPrepped: getVal(COLUMN_HEADERS.ORDER_PREP).toUpperCase() === 'Y',
                    foodPrepTime: getVal(COLUMN_HEADERS.FOOD_PREP_TIME),
                    items: []
                };
                for (let j = 1; j <= 20; j++) {
                    const itemCol = COLUMN_HEADERS.ORDER_ITEM_PREFIX + j;
                    if (colMap[itemCol] !== undefined && getVal(itemCol)) {
                        order.items.push({
                            item: getVal(itemCol),
                            qty: getVal(COLUMN_HEADERS.QTY_PREFIX + j) || '1',
                            modifier: getVal(COLUMN_HEADERS.MODIFIER_PREFIX + j) || ''
                        });
                    }
                }
                return order;
            });
            sheetDataCache.data = parsedData;
            sheetDataCache.lastFetchTime = now;
            return parsedData;
        } catch (err) {
            console.error("Error reading Google Sheet data:", err.message);
            throw new Error("Failed to read Google Sheet data: " + err.message);
        } finally {
            sheetDataCache.isFetching = false;
        }
    })();
    return sheetDataCache.fetchPromise;
}

async function archiveOrders() {
    console.log(`[Cron Job] Running archiveOrders at ${new Date().toLocaleTimeString()}`);
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_TAB });
        const rows = response.data.values || [];
        if (rows.length <= 1) return;
        const dataRowsToArchive = rows.slice(1);
        if (dataRowsToArchive.length === 0) return;
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: ORDER_HISTORY_TAB,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: dataRowsToArchive },
        });
        const endColumnLetter = columnToLetter(rows[0].length || 26);
        await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB}!A2:${endColumnLetter}` });
        invalidateSheetDataCache();
        console.log("[Cron Job] Archiving complete.");
    } catch (err) {
        console.error('[Cron Job] Error during archiveOrders:', err.message);
    }
}

// =================================================================================
// EXPRESS API ENDPOINTS
// =================================================================================

app.get("/", (req, res) => res.send("✅ Backend server is alive"));

const isTodayFilter = (order) => {
    if (!order || !order.timeOrdered) {
        return false;
    }
    try {
        const now = new Date();
        const orderDate = new Date(order.timeOrdered);
        const isMatch = orderDate.getFullYear() === now.getFullYear() &&
                        orderDate.getMonth() === now.getMonth() &&
                        orderDate.getDate() === now.getDate();
        return isMatch;
    } catch (e) {
        console.error(`Error parsing date for order: ${order.orderNum}`, e);
        return false;
    }
};

app.get("/api/list", async (req, res) => {
  try {
    const allOrders = await getSheetData();
    const incomingOrdersToday = allOrders
      .filter(o => {
          return (
            !o.cancelled &&
            !o.orderProcessed &&
            (o.orderUpdateStatus || '').toUpperCase() === 'NONE' &&
            isTodayFilter(o)
          );
        })
      .sort((a, b) => new Date(a.timeOrdered).getTime() - new Date(b.timeOrdered).getTime());
    res.json(incomingOrdersToday);
  } catch (err) {
    console.error("[Backend] ❌ Failed to fetch incoming orders:", err.message);
    res.status(500).json({ error: "Failed to fetch incoming orders: " + err.message });
  }
});

app.get("/api/updating", async (req, res) => {
    try {
        const allOrders = await getSheetData();
        const updatingOrdersToday = allOrders
            .filter(o => !o.cancelled && !o.orderProcessed && o.orderUpdateStatus === 'ChkRecExist' && isTodayFilter(o))
            .sort((a, b) => new Date(b.timeOrdered).getTime() - new Date(a.timeOrdered).getTime());
        res.json(updatingOrdersToday);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch updating orders: " + err.message });
    }
});

app.get("/api/printed", async (req, res) => {
    try {
        const allOrders = await getSheetData();
        const processedOrders = allOrders
            .filter(order => order.orderProcessed)
            .sort((a, b) => new Date(b.timeOrdered).getTime() - new Date(a.timeOrdered).getTime());
        res.json(processedOrders);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch processed orders: " + err.message });
    }
});

app.get("/api/order-by-row/:rowIndex", async (req, res) => {
    try {
        const rowIndex = parseInt(req.params.rowIndex, 10);
        if (isNaN(rowIndex)) return res.status(400).json({ error: "Invalid rowIndex." });
        const allOrders = await getSheetData();
        const order = allOrders.find(o => o.rowIndex === rowIndex);
        order ? res.json(order) : res.status(404).json({ error: "Order not found." });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch order by rowIndex: " + err.message });
    }
});

// =================================================================================
// REPORTING AND SETTINGS ENDPOINTS
// =================================================================================

app.get('/api/today-stats', async (req, res) => {
    try {
        const allOrders = await getSheetData(true);
        const todayOrders = allOrders.filter(order => isTodayFilter(order));
        
        const total = todayOrders.filter(o => !o.cancelled).length;
        const processed = todayOrders.filter(o => !o.cancelled && o.orderProcessed).length;

        res.json({ total, processed });
    } catch (error) {
        console.error('Error fetching today\'s stats:', error);
        res.status(500).json({ error: 'Failed to fetch today\'s stats: ' + error.message });
    }
});


app.get('/api/order-stats', async (req, res) => {
    try {
        const { range } = req.query;
        const days = range === 'YTD' ?
            Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)) :
            parseInt(range, 10);

        const dateRange = [];
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(0, 0, 0, 0);

        for (let i = 0; i < days; i++) {
            const date = new Date(endDate);
            date.setDate(date.getDate() - i);
            dateRange.push(date.toLocaleDateString('en-CA'));
        }

        const orderRows = await getOrderRows();
        const countByDate = {};
        dateRange.forEach(date => countByDate[date] = 0);

        orderRows.forEach(row => {
            const rawDate = row[COLUMN_HEADERS.TIME_ORDERED];
            const processed = row[COLUMN_HEADERS.ORDER_PROCESSED];
            const cancelled = row[COLUMN_HEADERS.CANCELLED];

            if (rawDate && processed === 'Y' && cancelled !== 'TRUE') {
                const orderDate = new Date(rawDate).toLocaleDateString('en-CA');
                if (countByDate.hasOwnProperty(orderDate)) {
                    countByDate[orderDate]++;
                }
            }
        });
        res.json(countByDate);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order stats: ' + error.message });
    }
});

app.get('/api/popular-items', async (req, res) => {
    try {
        const { range } = req.query;
        const days = range === 'YTD'
            ? Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24))
            : parseInt(range, 10);

        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - (days - 1));
        startDate.setHours(0, 0, 0, 0);

        const orderRows = await getOrderRows();
        const itemCounts = {};

        const normalize = (str) => str.toLowerCase().trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        orderRows.forEach(row => {
            const rawDate = row[COLUMN_HEADERS.TIME_ORDERED];
            if (!rawDate) return;
            const orderDate = new Date(rawDate);
            if (orderDate < startDate || orderDate > endDate) return;

             if (row[COLUMN_HEADERS.ORDER_PROCESSED] === 'Y' && row[COLUMN_HEADERS.CANCELLED] !== 'TRUE') {
                for (let i = 1; i <= 20; i++) {
                    let itemName = row[COLUMN_HEADERS.ORDER_ITEM_PREFIX + i];
                    if (!itemName) continue;
                    itemName = normalize(itemName);
                    const quantity = parseInt(row[COLUMN_HEADERS.QTY_PREFIX + i] || '1', 10);
                    if (itemName) {
                        itemCounts[itemName] = (itemCounts[itemName] || 0) + quantity;
                    }
                }
            }
        });
        res.json(itemCounts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch popular items: ' + error.message });
    }
});

app.get('/api/hourly-orders', async (req, res) => {
    try {
        const now = new Date();
        const currentHour = now.getHours();
        const startHour = parseInt(appSettings.reportStartHour, 10) || 4;
        
        const hourlyCounts = {};
        for (let h = startHour; h <= 23; h++) {
            const hourLabel = h < 12 ? `${h === 0 ? 12 : h} AM` : `${h === 12 ? 12 : h - 12} PM`;
            hourlyCounts[hourLabel] = 0;
        }

        const allOrders = await getSheetData();
        const todayOrders = allOrders.filter(order => isTodayFilter(order));

        todayOrders.forEach(order => {
            if (order.timeOrdered) {
                const orderHour = new Date(order.timeOrdered).getHours();
                const hourLabel = orderHour < 12 ? `${orderHour === 0 ? 12 : orderHour} AM` : `${orderHour === 12 ? 12 : orderHour - 12} PM`;
                if (hourlyCounts.hasOwnProperty(hourLabel)) {
                    hourlyCounts[hourLabel]++;
                }
            }
        });

        const finalHourlyCounts = {};
        for (let h = startHour; h <= currentHour; h++) {
             const hourLabel = h < 12 ? `${h === 0 ? 12 : h} AM` : `${h === 12 ? 12 : h - 12} PM`;
             finalHourlyCounts[hourLabel] = hourlyCounts[hourLabel];
        }

        res.json(finalHourlyCounts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch hourly orders: ' + error.message });
    }
});

app.get('/api/customer-stats', async (req, res) => {
    try {
        const { range } = req.query;
        const days = range === 'YTD' ? 
            Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)) :
            parseInt(range, 10);

        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - (days - 1));
        startDate.setHours(0, 0, 0, 0);
        
        const orderRows = await getOrderRows();

        const filteredOrders = orderRows.filter(row => {
            const rawDate = row[COLUMN_HEADERS.TIME_ORDERED];
            if (!rawDate) return false;
            const orderDate = new Date(rawDate);
            return orderDate >= startDate && orderDate <= endDate &&
                   row[COLUMN_HEADERS.ORDER_PROCESSED] === 'Y' && 
                   row[COLUMN_HEADERS.CANCELLED] !== 'TRUE';
        });

        const customerData = {}; 
        filteredOrders.forEach(order => {
            const phone = order[COLUMN_HEADERS.CALLER_PHONE];
            if (!phone) return;

            if (!customerData[phone]) {
                customerData[phone] = { count: 0, name: order[COLUMN_HEADERS.CALLER_NAME] };
            }
            customerData[phone].count++;
            customerData[phone].name = order[COLUMN_HEADERS.CALLER_NAME];
        });

        const totalOrders = filteredOrders.length;
        const repeatCustomers = Object.values(customerData).filter(data => data.count > 1).length;

        const topCustomers = Object.entries(customerData)
            .sort(([, a], [, b]) => b.count - a.count)
            .slice(0, 5)
            .map(([phone, data]) => ({
                phone,
                name: data.name,
                count: data.count
            }));

        res.json({ totalOrders, repeatCustomers, topCustomers });

    } catch (error) {
        console.error('Error fetching customer stats:', error);
        res.status(500).json({ error: 'Failed to fetch customer stats: ' + error.message });
    }
});

// --- Settings Endpoints ---
app.get('/api/app-settings', (req, res) => {
    res.json(appSettings);
});

app.post('/api/app-settings', async (req, res) => {
    try {
        await fsp.writeFile(appSettingsFilePath, JSON.stringify(req.body, null, 2));
        appSettings = req.body;
        // Re-schedule cron job if it has changed
        if (cronJob) cronJob.stop();
        startCronJob();
        res.json({ success: true, message: 'App settings saved.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save app settings: ' + err.message });
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
// MAIN PRINTING AND SETTINGS ENDPOINTS
// =================================================================================

app.post("/api/fire-order", async (req, res) => {
    const order = req.body;
    if (!order || typeof order.rowIndex !== "number") {
        return res.status(400).json({ error: "Invalid order format or missing rowIndex" });
    }
    try {
        let printerSettings;
        try {
            const data = await fsp.readFile(printerSettingsFilePath, 'utf8');
            printerSettings = JSON.parse(data);
        } catch (err) {
            return res.status(400).json({ error: "Printer settings not configured." });
        }

        const allOrders = await getSheetData(true);
        const orderToProcess = allOrders.find(o => o.rowIndex === order.rowIndex);
        if (!orderToProcess) {
            return res.status(404).json({ error: "Order not found" });
        }

        let printerResponseData = null;
        let printerError = null;
        const htmlReceipt = buildOrderHTML(orderToProcess);

        switch (printerSettings.mode) {
            case 'MOCK':
                try {
                    if (!printerSettings.printerUrl) throw new Error("No URL for MOCK mode");
                    const response = await axios.post(printerSettings.printerUrl, { ...orderToProcess, mode: 'MOCK' }, { timeout: 10000 });
                    printerResponseData = response.data;
                } catch (mockErr) {
                    printerError = { error: "Failed to send to MOCK webhook", details: mockErr.message };
                }
                break;
            case 'LAN':
                try {
                    if (!printerSettings.printerUrl) throw new Error("No IP address for LAN mode");
                    const plainTextReceipt = htmlReceipt.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/  +/g, ' ');
                    printerResponseData = await printViaLan(printerSettings.printerUrl, plainTextReceipt);
                } catch (lanErr) {
                    printerError = lanErr;
                }
                break;
            case 'CLOUD':
                const newJob = { jobId: `job-${Date.now()}`, content: htmlReceipt, contentType: 'text/html' };
                cloudPrintJobs.push(newJob);
                printerResponseData = { status: "CLOUD job staged", jobId: newJob.jobId };
                break;
            default:
                printerError = { error: `Invalid printer mode: ${printerSettings.mode}` };
        }

        if (printerError) {
            return res.status(503).json(printerError);
        }

        // Update Google Sheet
        const now = new Date().toISOString();
        const newPrintedCount = (orderToProcess.printedCount || 0) + 1;
        const newPrintedTimestamps = [...(orderToProcess.printedTimestamps || []), now];

        const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB}!1:1` });
        const header = headerResponse.data.values[0];
        const colMap = Object.fromEntries(header.map((h, i) => [h, i + 1]));

        const updates = [];
        if (orderToProcess.orderProcessed !== true) {
             if (colMap[COLUMN_HEADERS.ORDER_PROCESSED]) {
                updates.push({ range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.ORDER_PROCESSED])}${order.rowIndex}`, values: [['Y']] });
             }
        }
        if (colMap[COLUMN_HEADERS.SHEET_LAST_MODIFIED]) updates.push({ range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.SHEET_LAST_MODIFIED])}${order.rowIndex}`, values: [[now]] });
        if (colMap[COLUMN_HEADERS.PRINTED_COUNT]) updates.push({ range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.PRINTED_COUNT])}${order.rowIndex}`, values: [[newPrintedCount]] });
        if (colMap[COLUMN_HEADERS.PRINTED_TIMESTAMPS]) updates.push({ range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.PRINTED_TIMESTAMPS])}${order.rowIndex}`, values: [[newPrintedTimestamps.join(',')]] });

        if (updates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SHEET_ID,
                resource: { data: updates, valueInputOption: "USER_ENTERED" }
            });
            invalidateSheetDataCache();
        }

        printHistory.push({ id: orderToProcess.rowIndex, orderNum: orderToProcess.orderNum, printedAt: now, mode: printerSettings.mode });
        await savePrintHistory();

        res.json({
            success: true,
            printerResponse: printerResponseData,
            message: `Order processed successfully.`,
            printedCount: newPrintedCount
        });
    } catch (err) {
        console.error("[🔥 API Error /api/fire-order]", err);
        res.status(500).json({ error: "Failed to process order", details: err.message });
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

// --- NEW: KDS API ENDPOINTS ---
app.get("/api/kds/active-orders", async (req, res) => {
    try {
        const allOrders = await getSheetData(true); // Force fetch for real-time data
        const activeKitchenOrders = allOrders
            .filter(o => {
                return o.orderProcessed && // Must be processed/fired
                       !o.cancelled &&     // Must not be cancelled
                       !o.orderPrepped;    // Must not be prepped yet
            })
            .sort((a, b) => new Date(a.timeOrdered).getTime() - new Date(b.timeOrdered).getTime()); // Ascending time order

        res.json(activeKitchenOrders);
    } catch (err) {
        console.error("[KDS API] Failed to fetch active orders:", err);
        res.status(500).json({ error: "Failed to fetch active kitchen orders", details: err.message });
    }
});

app.get("/api/kds/prepped-orders", async (req, res) => {
    try {
        const allOrders = await getSheetData(true); // Force fetch for real-time data
        const preppedOrders = allOrders
            .filter(o => o.orderPrepped && !o.cancelled)
            .sort((a, b) => new Date(b.timeOrdered).getTime() - new Date(a.timeOrdered).getTime()) // Descending time order
            .slice(0, 20); // Limit to the last 20 for performance

        res.json(preppedOrders);
    } catch (err) {
        console.error("[KDS API] Failed to fetch prepped orders:", err);
        res.status(500).json({ error: "Failed to fetch prepped orders", details: err.message });
    }
});

app.post("/api/kds/prep-order/:rowIndex", async (req, res) => {
    const { rowIndex } = req.params;
    const { prepTime } = req.body; // e.g., "05:30"

    if (!rowIndex || prepTime === undefined) {
        return res.status(400).json({ error: "Missing rowIndex or prepTime in request" });
    }

    try {
        const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB}!1:1` });
        const header = headerResponse.data.values[0];

        const orderPrepColIndex = header.indexOf(COLUMN_HEADERS.ORDER_PREP);
        const prepTimeColIndex = header.indexOf(COLUMN_HEADERS.FOOD_PREP_TIME);

        if (orderPrepColIndex === -1 || prepTimeColIndex === -1) {
            return res.status(500).json({ error: "Could not find 'Order_prep' or 'Food_prep_time' columns in the sheet." });
        }
        
        const orderPrepColLetter = columnToLetter(orderPrepColIndex + 1);
        const prepTimeColLetter = columnToLetter(prepTimeColIndex + 1);

        const updates = [{
            range: `${SHEET_TAB}!${orderPrepColLetter}${rowIndex}`,
            values: [['Y']]
        }, {
            range: `${SHEET_TAB}!${prepTimeColLetter}${rowIndex}`,
            values: [[prepTime]]
        }];

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            resource: {
                data: updates,
                valueInputOption: "USER_ENTERED"
            }
        });

        invalidateSheetDataCache();
        res.json({ success: true, message: `Order at row ${rowIndex} marked as prepped.` });

    } catch (err) {
        console.error(`[KDS API] Failed to update order at row ${rowIndex}:`, err);
        res.status(500).json({ error: "Failed to update order in Google Sheet", details: err.message });
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
    cronJob = cron.schedule(appSettings.archiveCronSchedule, archiveOrders, {
        scheduled: true,
        timezone: appSettings.timezone
    });
    console.log(`[Cron Job] Scheduled to run at: ${appSettings.archiveCronSchedule} in timezone ${appSettings.timezone}`);
}

initializeGoogleClients().then(async () => {
    await ensurePrintHistory();
    await loadPrintHistory();
    try {
        await getSheetData(true);
    } catch (err) {
        console.error("Initial sheet data fetch failed:", err.message);
    }
    
    startCronJob();
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
        if (process.env.RENDER_URL) {
            console.log(`✅ Server is publicly available at: ${process.env.RENDER_URL}`);
        }
    });
}).catch(err => {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
});
