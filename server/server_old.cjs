const express = require("express");
const { google } = require("googleapis");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const cron = require('node-cron');
const { sendToPrinter } = require('./firePrinter.cjs');
const http = require('http'); // Added for printer connectivity checks

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const SERVICE_ACCOUNT_FILE = path.join(__dirname, "orderagent-460001-5fb1b5608046.json");

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
    ORDER_SUMMARY: 'orderSummary'
};

const printHistoryFile = path.join(__dirname, "printHistory.json");
let printHistory = [];
let sheets;

let sheetDataCache = {
    data: [],
    lastFetchTime: 0,
    fetchInterval: 10000,
    isFetching: false,
    fetchPromise: null
};

// --- New: Function to test printer connectivity ---
async function testPrinterConnectivity(printerUrl, mode = 'LAN') {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(printerUrl);
    } catch (err) {
      console.error(`[server.cjs] Invalid URL: ${printerUrl}`, err.message);
      return resolve({ available: false, error: `Invalid URL: ${err.message}` });
    }

    const protocol = url.protocol === 'https:' ? https : http;
    const isMockMode = mode === 'MOCK';
    const method = isMockMode ? 'POST' : 'HEAD';
    const testPayload = isMockMode ? JSON.stringify({ test: true }) : '';

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method,
      timeout: 5000,
      headers: {
        'User-Agent': 'Node.js Printer Status Check',
        ...(isMockMode ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(testPayload) } : {})
      }
    };

    console.log(`[server.cjs] Testing printer connectivity: ${method} ${printerUrl}`);

    const req = protocol.request(options, (res) => {
      console.log(`[server.cjs] Response status: ${res.statusCode}, Headers:`, res.headers);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve({ available: true, message: `Printer responded with status ${res.statusCode}` });
      } else {
        resolve({
          available: false,
          error: `Printer not found (Status: ${res.statusCode})`
        });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      console.log(`[server.cjs] Request timed out for ${printerUrl}`);
      resolve({ available: false, error: 'Lost connection to printer (timeout)' });
    });

    req.on('error', (err) => {
      console.error(`[server.cjs] Request error for ${printerUrl}: ${err.message}`);
      resolve({ available: false, error: `Printer error: ${err.message}` });
    });

    if (isMockMode) {
      req.write(testPayload);
    }
    req.end();
  });
}

const normalizeToUTCMidnight = (date) => {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
};

async function getOrderRows() {
    if (!sheets) {
        throw new Error("Google Sheets client not initialized for getOrderRows.");
    }

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: ORDER_HISTORY_TAB,
        });
        console.log("📄 Raw values from Sheets API:", JSON.stringify(response.data.values, null, 2));

        const rows = response.data.values || [];
        if (rows.length === 0) {
            console.log(`No data rows found in ${ORDER_HISTORY_TAB}.`);
            return [];
        }

        const header = rows[0].map(h => String(h).trim());
        const dataRows = rows.slice(1);

        const parsedData = dataRows.map(row => {
            const obj = {};
            header.forEach((colName, index) => {
                obj[colName] = row[index] !== undefined ? String(row[index]).trim() : '';
            });
            return obj;
        });

        return parsedData;

    } catch (err) {
        console.error(`Error reading Google Sheet data from ${ORDER_HISTORY_TAB}:`, err.message, err.stack);
        throw new Error(`Failed to read Google Sheet data for report: ${err.message}`);
    }
}

async function initializeGoogleClients() {
    try {
        console.log("Initializing Google Sheets client...");
        await fsp.access(SERVICE_ACCOUNT_FILE);
        console.log(`Found service account file at ${SERVICE_ACCOUNT_FILE}`);

        const auth = new google.auth.GoogleAuth({
            keyFile: SERVICE_ACCOUNT_FILE,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const authClient = await auth.getClient();
        console.log("Authentication successful");

        sheets = google.sheets({ version: "v4", auth: authClient });
    } catch (err) {
        console.error("Failed to initialize Google Sheets client:", err.message, err.stack);
        throw new Error(`Google Sheets client initialization failed: ${err.message}`);
    }
}

async function ensurePrintHistory() {
    try {
        await fsp.access(printHistoryFile);
    } catch (err) {
        await fsp.writeFile(printHistoryFile, JSON.stringify([]));
        console.log(`Created printHistory.json at ${printHistoryFile}`);
    }
}

async function loadPrintHistory() {
    try {
        const data = await fsp.readFile(printHistoryFile, "utf8");
        const parsed = JSON.parse(data);
        printHistory = parsed;
        return parsed;
    } catch (err) {
        console.error("Error loading printHistory.json:", err.message, err.stack);
        return [];
    }
}

async function savePrintHistory() {
    try {
        await fsp.writeFile(printHistoryFile, JSON.stringify(printHistory, null, 2));
    } catch (err) {
        console.error("Error saving printHistory.json:", err.message, err.stack);
    }
}

function columnToLetter(n) {
    let s = '';
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = (n - m) / 26 | 0;
    }
    return s;
}

function invalidateSheetDataCache() {
    sheetDataCache.data = [];
    sheetDataCache.lastFetchTime = 0;
    console.log("[Backend Cache] Sheet data cache invalidated.");
}

function parseOrderItems(row) {
    const parsedItems = [];

    for (let i = 1; i <= 40; i++) {
        const nameField = `Order_item_${i}`;
        const qtyField = `Qty_${i}`;
        const modifierField = `modifier_${i}`;

        const name = row[nameField] ? row[nameField].toString().trim() : '';
        const qty = row[qtyField] ? row[qtyField].toString().trim() : '';
        const modifier = row[modifierField] ? row[modifierField].toString().trim() : '';

        if (name) {
            parsedItems.push({
                name,
                qty: qty || '1',
                modifier: modifier || ''
            });
        }
    }

    console.log("✅ Parsed items:", parsedItems);
    return parsedItems;
}

async function getSheetData(forceFetch = false) {
    const now = Date.now();
    const CACHE_DURATION = 30000;

    if (sheetDataCache.isFetching && sheetDataCache.fetchPromise) {
        console.log("[Backend Cache] A fetch is already in progress, returning existing promise.");
        return sheetDataCache.fetchPromise;
    }

    if (!forceFetch && sheetDataCache.data.length > 0 && (now - sheetDataCache.lastFetchTime < CACHE_DURATION)) {
        console.log("[Backend Cache] Returning cached sheet data.");
        return Promise.resolve(sheetDataCache.data);
    }

    sheetDataCache.isFetching = true;
    sheetDataCache.fetchPromise = (async () => {
        try {
            console.log("Fetching new sheet data from Google Sheets API...");
            const range = SHEET_TAB;
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range,
            });
            const rows = response.data.values || [];
            if (rows.length < 1) {
                console.log("No data rows found in sheet.");
                sheetDataCache.data = [];
                sheetDataCache.lastFetchTime = now;
                return [];
            }

            const header = rows[0];
            const colMap = Object.fromEntries(header.map((h, i) => [h, i]));
            const dataRows = rows.slice(1);

            const parsedData = dataRows.map((row, index) => {
                const getVal = (colName) => {
                    const colIndex = colMap[colName];
                    return colIndex !== undefined && row[colIndex] !== undefined ? String(row[colIndex]).trim() : '';
                };

                const sheetOrderNum = getVal(COLUMN_HEADERS.ORDER_NUM);
                const displayOrderNum = sheetOrderNum || `TEMP-${uuidv4().substring(0, 8)}-${index + 2}`;

                const order = {
                    id: (index + 2),
                    orderNum: displayOrderNum,
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
                    items: []
                };

                for (let j = 1; j <= 20; j++) {
                    const itemCol = COLUMN_HEADERS.ORDER_ITEM_PREFIX + j;
                    const qtyCol = COLUMN_HEADERS.QTY_PREFIX + j;
                    const modCol = COLUMN_HEADERS.MODIFIER_PREFIX + j;

                    if (colMap[itemCol] !== undefined && getVal(itemCol)) {
                        order.items.push({
                            item: getVal(itemCol),
                            qty: getVal(qtyCol) || '1',
                            modifier: getVal(modCol) || ''
                        });
                    }
                }
                return order;
            });

            console.log(`Fetched and parsed ${parsedData.length} data rows from sheet. Updating cache.`);
            sheetDataCache.data = parsedData;
            sheetDataCache.lastFetchTime = now;
            return parsedData;

        } catch (err) {
            console.error("Error reading Google Sheet data:", err.message, err.stack);
            throw new Error("Failed to read Google Sheet data: " + err.message);
        } finally {
            sheetDataCache.isFetching = false;
            sheetDataCache.fetchPromise = null;
        }
    })();

    return sheetDataCache.fetchPromise;
}

async function archiveOrders() {
    console.log(`[Cron Job] Attempting to run archiveOrders at ${new Date().toLocaleTimeString()}`);
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: SHEET_TAB,
        });
        const rows = response.data.values || [];

        if (rows.length <= 1) {
            console.log(`[Cron Job] No data rows to archive from ${SHEET_TAB}.`);
            return;
        }

        const headerRow = rows[0];
        const dataRowsToArchive = rows.slice(1);

        if (dataRowsToArchive.length === 0) {
            console.log(`[Cron Job] No actual data rows to archive from ${SHEET_TAB} after slicing header.`);
            return;
        }
        
        console.log(`[Cron Job] Found ${dataRowsToArchive.length} rows to archive from ${SHEET_TAB}.`);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: ORDER_HISTORY_TAB,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: dataRowsToArchive,
            },
        });
        console.log(`[Cron Job] Successfully appended ${dataRowsToArchive.length} rows to ${ORDER_HISTORY_TAB}.`);

        const endColumnLetter = columnToLetter(headerRow.length > 0 ? headerRow.length : 26);
        const clearRange = `${SHEET_TAB}!A2:${endColumnLetter}`;
        
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SHEET_ID,
            range: clearRange,
        });
        console.log(`[Cron Job] Successfully cleared data from ${clearRange} in ${SHEET_TAB}.`);

        invalidateSheetDataCache();
        console.log("[Cron Job] Sheet data cache invalidated after archiving.");

    } catch (err) {
        console.error('[Cron Job] Error during archiveOrders:', err.message, err.stack);
    }
}

// Removed updateOrderAsProcessed function as it was incomplete and unused

initializeGoogleClients().then(async () => {
    await ensurePrintHistory();
    await loadPrintHistory();

    try {
        await getSheetData(true);
    } catch (err) {
        console.error("Initial sheet data fetch failed, server will start with potentially empty cache:", err.message);
    }

    cron.schedule('16 0 * * *', archiveOrders, {
        scheduled: true,
        timezone: "America/New_York"
    });
    console.log(`Cron job scheduled to archive orders at 12:16 AM (America/New_York). Current time: ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}`);

    app.get("/", (req, res) => {
        res.send("✅ Backend server is alive (Sheets direct integration with cron)");
    });

    const filterByCurrentDate = (order) => {
        if (!order.timeOrdered) return false;
        try {
            const orderDate = new Date(order.timeOrdered);
            if (isNaN(orderDate.getTime())) return false;

            const normalizedOrderDate = normalizeToUTCMidnight(orderDate);
            const now = new Date();
            const todayUtcMidnight = normalizeToUTCMidnight(now);
            const tomorrowUtcMidnight = new Date(todayUtcMidnight.getTime() + 24 * 60 * 60 * 1000);

            return normalizedOrderDate >= todayUtcMidnight && normalizedOrderDate < tomorrowUtcMidnight;
        } catch (e) {
            console.warn(`Could not parse or normalize date for order ${order.orderNum}: ${order.timeOrdered}`, e);
            return false;
        }
    };

    app.get("/api/list", async (req, res) => {
        try {
            const allOrders = await getSheetData();
            const incomingOrdersToday = allOrders.filter(order =>
                !order.cancelled &&
                !order.orderProcessed &&
                order.orderUpdateStatus === 'NONE' &&
                filterByCurrentDate(order)
            ).sort((a, b) => new Date(a.timeOrdered).getTime() - new Date(b.timeOrdered).getTime());

            res.json(incomingOrdersToday);
        } catch (err) {
            console.error("Error fetching incoming orders:", err.message, err.stack);
            res.status(500).json({ error: "Failed to fetch incoming orders: " + err.message });
        }
    });

    app.get("/api/updating", async (req, res) => {
        try {
            const allOrders = await getSheetData();
            const updatingOrdersToday = allOrders.filter(order =>
                !order.cancelled &&
                !order.orderProcessed &&
                order.orderUpdateStatus === 'ChkRecExist' &&
                filterByCurrentDate(order)
            ).sort((a, b) => new Date(b.timeOrdered).getTime() - new Date(a.timeOrdered).getTime());

            res.json(updatingOrdersToday);
        } catch (err) {
            console.error("Error fetching updating orders:", err.message, err.stack);
            res.status(500).json({ error: "Failed to fetch updating orders: " + err.message });
        }
    });

    app.get("/api/printed", async (req, res) => {
        try {
            const allOrders = await getSheetData();
            const processedOrders = allOrders.filter(order =>
                order.orderProcessed
            ).sort((a, b) => new Date(b.timeOrdered).getTime() - new Date(a.timeOrdered).getTime());
            
            const historyMap = new Map(printHistory.map(entry => [entry.id, entry]));
            const augmentedPrintedOrders = processedOrders.map(order => {
                const localHistory = historyMap.get(order.id) || { printHistory: [], reprinted: false };
                return {
                    ...order,
                    printedTimestamps: order.printedTimestamps.length > 0 ? order.printedTimestamps : localHistory.printHistory,
                    reprinted: order.printedCount > 1 || localHistory.reprinted
                };
            });

            res.json(augmentedPrintedOrders);
        } catch (err) {
            console.error("Error fetching processed orders:", err.message, err.stack);
            res.status(500).json({ error: "Failed to fetch processed orders: " + err.message });
        }
    });
    
    app.get("/api/order-by-row/:rowIndex", async (req, res) => {
        const rowIndex = parseInt(req.params.rowIndex, 10);
        if (isNaN(rowIndex)) {
            return res.status(400).json({ error: "Invalid rowIndex provided." });
        }
        try {
            const allOrders = await getSheetData();
            const order = allOrders.find(o => o.rowIndex === rowIndex);
            if (order) {
                console.log(`Returning details for order at rowIndex: ${rowIndex}`);
                res.json(order);
            } else {
                console.warn(`Order not found at rowIndex ${rowIndex} in current sheetDataCache.`);
                res.status(404).json({ error: "Order not found at specified rowIndex in active sheet." });
            }
        } catch (err) {
            console.error(`Error fetching order by rowIndex ${rowIndex}:`, err.message, err.stack);
            res.status(500).json({ error: "Failed to fetch order details by rowIndex: " + err.message });
        }
    });

    app.post("/api/fire-to-kitchen/:rowIndex", async (req, res) => {
        const rowIndex = parseInt(req.params.rowIndex, 10);
        if (isNaN(rowIndex)) {
            return res.status(400).json({ error: "Invalid rowIndex provided." });
        }
        try {
            console.log(`[Backend] Firing order at rowIndex: ${rowIndex} to kitchen (marking as processed)...`);

            const allOrders = await getSheetData(true);
            const orderToProcess = allOrders.find(o => o.rowIndex === rowIndex);

            if (!orderToProcess) {
                console.warn(`[Backend] Order not found at rowIndex ${rowIndex} for processing.`);
                return res.status(404).json({ error: "Order not found for processing" });
            }

            const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB}!1:1` });
            if (!headerResponse.data.values || headerResponse.data.values.length === 0) {
                throw new Error("Could not fetch header row from sheet.");
            }
            const header = headerResponse.data.values[0];
            const colMap = Object.fromEntries(header.map((h, i) => [h, i]));

            const now = new Date().toISOString();

            const currentPrintedCount = orderToProcess.printedCount || 0;
            const currentPrintedTimestamps = orderToProcess.printedTimestamps || [];

            const newPrintedCount = currentPrintedCount + 1;
            const newPrintedTimestamps = [...currentPrintedTimestamps, now];

            const updates = [];
            if (colMap[COLUMN_HEADERS.ORDER_PROCESSED] !== undefined) {
                updates.push({
                    range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.ORDER_PROCESSED] + 1)}${rowIndex}`,
                    values: [['Y']]
                });
            }
            if (colMap[COLUMN_HEADERS.SHEET_LAST_MODIFIED] !== undefined) {
                updates.push({
                    range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.SHEET_LAST_MODIFIED] + 1)}${rowIndex}`,
                    values: [[now]]
                });
            }
            if (colMap[COLUMN_HEADERS.PRINTED_COUNT] !== undefined) {
                updates.push({
                    range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.PRINTED_COUNT] + 1)}${rowIndex}`,
                    values: [[newPrintedCount]]
                });
            }
            if (colMap[COLUMN_HEADERS.PRINTED_TIMESTAMPS] !== undefined) {
                updates.push({
                    range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.PRINTED_TIMESTAMPS] + 1)}${rowIndex}`,
                    values: [[newPrintedTimestamps.join(',')]]
                });
            }
            
            if (updates.length > 0) {
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: SHEET_ID,
                    requestBody: {
                        data: updates,
                        valueInputOption: 'USER_ENTERED',
                    },
                });
                invalidateSheetDataCache();
                console.log(`[Backend] Order at rowIndex ${rowIndex} successfully marked as processed.`);
                res.json({ success: true, message: `Order ${orderToProcess.orderNum} marked as processed.`, printedCount: newPrintedCount, printedTimestamps: newPrintedTimestamps });
            } else {
                console.warn(`[Backend] No relevant columns found in sheet for updating order at rowIndex ${rowIndex}.`);
                res.status(500).json({ error: "Sheet columns not configured correctly for update." });
            }

        } catch (err) {
            console.error("[Backend] Error processing 'fire to kitchen' action:", err.message, err.stack);
            res.status(500).json({ error: "Failed to fire order to kitchen: " + err.message });
        }
    });

    app.post("/api/reprint/:rowIndex", async (req, res) => {
        const rowIndex = parseInt(req.params.rowIndex, 10);
        if (isNaN(rowIndex)) {
            return res.status(400).json({ error: "Invalid rowIndex provided." });
        }
        try {
            console.log(`[Backend] Reprocessing order at rowIndex: ${rowIndex} (updating print count/timestamps)...`);

            const allOrders = await getSheetData(true);
            const orderToReprocess = allOrders.find(o => o.rowIndex === rowIndex);

            if (!orderToReprocess) {
                console.warn(`[Backend] Order not found at rowIndex ${rowIndex} for re-processing.`);
                return res.status(404).json({ error: "Order not found for re-processing" });
            }
            
            const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB}!1:1` });
            if (!headerResponse.data.values || headerResponse.data.values.length === 0) {
                throw new Error("Could not fetch header row from sheet for reprint.");
            }
            const header = headerResponse.data.values[0];
            const colMap = Object.fromEntries(header.map((h, i) => [h, i]));

            const now = new Date().toISOString();

            const currentPrintedCount = orderToReprocess.printedCount || 0;
            const currentPrintedTimestamps = orderToReprocess.printedTimestamps || [];

            const newPrintedCount = currentPrintedCount + 1;
            const newPrintedTimestamps = [...currentPrintedTimestamps, now];

            const updates = [];
            if (colMap[COLUMN_HEADERS.PRINTED_COUNT] !== undefined) {
                updates.push({
                    range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.PRINTED_COUNT] + 1)}${rowIndex}`,
                    values: [[newPrintedCount]]
                });
            }
            if (colMap[COLUMN_HEADERS.PRINTED_TIMESTAMPS] !== undefined) {
                updates.push({
                    range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.PRINTED_TIMESTAMPS] + 1)}${rowIndex}`,
                    values: [[newPrintedTimestamps.join(',')]]
                });
            }
            if (colMap[COLUMN_HEADERS.SHEET_LAST_MODIFIED] !== undefined) {
                updates.push({
                    range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.SHEET_LAST_MODIFIED] + 1)}${rowIndex}`,
                    values: [[now]]
                });
            }

            if (updates.length > 0) {
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: SHEET_ID,
                    requestBody: {
                        data: updates,
                        valueInputOption: 'USER_ENTERED',
                    },
                });
                invalidateSheetDataCache();
                console.log(`[Backend] Order at rowIndex ${rowIndex} successfully re-processed.`);
                res.json({ success: true, message: `Order ${orderToReprocess.orderNum} re-processed.`, printedCount: newPrintedCount, printedTimestamps: newPrintedTimestamps });
            } else {
                console.warn(`[Backend] No relevant columns found for reprinting order at ${rowIndex}.`);
                res.status(500).json({ error: "Sheet columns not configured correctly for reprint." });
            }

        } catch (err) {
            console.error("[Backend] Error processing 're-process' action:", err.message, err.stack);
            res.status(500).json({ error: "Failed to re-process order: " + err.message });
        }
    });

    app.get('/api/order-stats', async (req, res) => {
        try {
            const { range } = req.query;
            const days = range === 'YTD' ? 
                Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)) + 1 :
                parseInt(range, 10);

            const dateRange = [];
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (let i = days - 1; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                dateRange.push(date.toLocaleDateString('en-CA'));
            }

            const orderRows = await getOrderRows();

            const countByDate = {};
            dateRange.forEach(date => {
                countByDate[date] = 0;
            });

            orderRows.forEach(row => {
                const rawDate = row[COLUMN_HEADERS.TIME_ORDERED];
                const processed = row[COLUMN_HEADERS.ORDER_PROCESSED];
                const cancelled = row[COLUMN_HEADERS.CANCELLED];

                if (
                    rawDate &&
                    processed === 'Y' &&
                    cancelled === 'FALSE'
                ) {
                    const orderDate = new Date(rawDate).toLocaleDateString('en-CA');
                    if (countByDate.hasOwnProperty(orderDate)) {
                        countByDate[orderDate]++;
                    }
                }
            });

            res.json(countByDate);
        } catch (error) {
            console.error('Error fetching order stats:', error);
            res.status(500).json({ error: 'Failed to fetch order stats: ' + error.message });
        }
    });

    app.get('/api/popular-items', async (req, res) => {
        try {
            const { range } = req.query;
            const days = range === 'YTD'
                ? Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)) + 1
                : parseInt(range, 10);

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            startDate.setHours(0, 0, 0, 0);

            const orderRows = await getOrderRows();
            const itemCounts = {};

            const normalize = (str) =>
                str
                    .toLowerCase()
                    .trim()
                    .replace(/\s+/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase());

            orderRows.forEach(row => {
                const rawDate = row[COLUMN_HEADERS.TIME_ORDERED];
                if (!rawDate) return;

                const orderDate = new Date(rawDate);
                if (orderDate < startDate) return;

                for (let i = 1; i <= 20; i++) {
                    const itemCol = COLUMN_HEADERS.ORDER_ITEM_PREFIX + i;
                    const qtyCol = COLUMN_HEADERS.QTY_PREFIX + i;

                    let itemName = row[itemCol];
                    if (!itemName) continue;

                    itemName = normalize(itemName);
                    const quantity = parseInt(row[qtyCol] || '1', 10);

                    if (itemName) {
                        itemCounts[itemName] = (itemCounts[itemName] || 0) + quantity;
                    }
                }
            });

            res.json(itemCounts);
        } catch (error) {
            console.error('Error fetching popular items:', error);
            res.status(500).json({ error: 'Failed to fetch popular items: ' + error.message });
        }
    });

    app.get('/api/hourly-orders', async (req, res) => {
        try {
            const now = new Date();
            const currentHour = now.getHours();
            const startHour = 8;
            
            const hourlyCounts = {};
            for (let h = startHour; h <= currentHour; h++) {
                const hourLabel = h <= 12 ? `${h} AM` : `${h - 12} PM`;
                hourlyCounts[hourLabel] = 0;
            }

            const allOrders = await getSheetData();
            const todayOrders = allOrders.filter(order => {
                if (!order.timeOrdered) return false;
                const orderDate = new Date(order.timeOrdered);
                return orderDate.getDate() === now.getDate() && 
                       orderDate.getMonth() === now.getMonth() && 
                       orderDate.getFullYear() === now.getFullYear();
            });

            todayOrders.forEach(order => {
                if (order.timeOrdered) {
                    const orderDate = new Date(order.timeOrdered);
                    const orderHour = orderDate.getHours();
                    if (orderHour >= startHour && orderHour <= currentHour) {
                        const hourLabel = orderHour <= 12 ? `${orderHour} AM` : `${orderHour - 12} PM`;
                        hourlyCounts[hourLabel] = (hourlyCounts[hourLabel] || 0) + 1;
                    }
                }
            });

            res.json(hourlyCounts);
        } catch (error) {
            console.error('Error fetching hourly orders:', error);
            res.status(500).json({ error: 'Failed to fetch hourly orders: ' + error.message });
        }
    });

    app.post("/api/fire-order", express.json(), async (req, res) => {
        const order = req.body;

        if (!order || typeof order.rowIndex !== "number") {
            return res.status(400).json({ error: "Invalid order format or missing rowIndex" });
        }

        try {
            console.log("🔥 Received print request:", order);

            // Step 1: Fetch printer settings
            let printerSettings;
            try {
                const data = await fs.promises.readFile('./printerSettings.json', 'utf8');
                printerSettings = JSON.parse(data);
            } catch (err) {
                console.warn("Printer settings not found, defaulting to no printing.");
                return res.status(400).json({ error: "Printer settings not configured" });
            }

            // Step 2: Check printer connectivity if in LAN mode
            if (printerSettings.mode === 'LAN') {
                const printerCheck = await testPrinterConnectivity(printerSettings.printerUrl);
                if (!printerCheck.available) {
                    console.error(`Printer unavailable: ${printerCheck.error}`);
                    return res.status(503).json({ 
                        error: "Printer unavailable",
                        details: printerCheck.error
                    });
                }
            }

            // Step 3: Fetch full row from Google Sheet
            const allOrders = await getSheetData(true);
            const orderToProcess = allOrders.find(o => o.rowIndex === order.rowIndex);

            if (!orderToProcess) {
                console.warn(`[Backend] Order not found at rowIndex ${order.rowIndex}`);
                return res.status(404).json({ error: "Order not found" });
            }

            // Step 4: Send to printer if in LAN mode
            let printerResponse = null;
            if (printerSettings.mode === 'LAN') {
                try {
                    printerResponse = await sendToPrinter(orderToProcess);
                } catch (printErr) {
                    console.error("Printer error during sendToPrinter:", printErr.message);
                    return res.status(503).json({
                        error: "Failed to send to printer",
                        details: printErr.message
                    });
                }
            }

            // Step 5: Update sheet with print status
            const headerResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range: `${SHEET_TAB}!1:1`
            });

            const header = headerResponse.data.values[0];
            const colMap = Object.fromEntries(header.map((h, i) => [h, i]));

            const now = new Date().toISOString();
            const newPrintedCount = (orderToProcess.printedCount || 0) + 1;
            const newPrintedTimestamps = [...(orderToProcess.printedTimestamps || []), now];

            const updates = [];

            if (colMap[COLUMN_HEADERS.ORDER_PROCESSED] !== undefined) {
                updates.push({
                    range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.ORDER_PROCESSED] + 1)}${order.rowIndex}`,
                    values: [["Y"]]
                });
            }
            if (colMap[COLUMN_HEADERS.SHEET_LAST_MODIFIED] !== undefined) {
                updates.push({
                    range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.SHEET_LAST_MODIFIED] + 1)}${order.rowIndex}`,
                    values: [[now]]
                });
            }
            if (colMap[COLUMN_HEADERS.PRINTED_COUNT] !== undefined) {
                updates.push({
                    range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.PRINTED_COUNT] + 1)}${order.rowIndex}`,
                    values: [[newPrintedCount]]
                });
            }
            if (colMap[COLUMN_HEADERS.PRINTED_TIMESTAMPS] !== undefined) {
                updates.push({
                    range: `${SHEET_TAB}!${columnToLetter(colMap[COLUMN_HEADERS.PRINTED_TIMESTAMPS] + 1)}${order.rowIndex}`,
                    values: [[newPrintedTimestamps.join(",")]]
                });
            }

            if (updates.length > 0) {
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: SHEET_ID,
                    requestBody: {
                        data: updates,
                        valueInputOption: "USER_ENTERED"
                    }
                });
                invalidateSheetDataCache();
            }

            // Step 6: Update print history
            printHistory.push({
                id: orderToProcess.id,
                orderNum: orderToProcess.orderNum,
                printedAt: now,
                mode: printerSettings.mode
            });
            await savePrintHistory();

            res.json({
                success: true,
                printerResponse,
                message: `Order at rowIndex ${order.rowIndex} successfully fired.`,
                printedCount: newPrintedCount,
                printedTimestamps: newPrintedTimestamps
            });

        } catch (err) {
            console.error("[🔥 Printer Error]", err.message, err.stack);
            res.status(500).json({ error: "Failed to process order", details: err.message });
        }
    });

    app.get('/api/print-settings', async (req, res) => {
      try {
        const data = await fs.readFile('./printerSettings.json', { encoding: 'utf8' });
        res.json(JSON.parse(data));
      } catch (err) {
        console.error('[server.cjs] Error loading printer settings:', err.message);
        res.status(500).json({ error: 'Failed to load printer settings: ' + err.message });
      }
    });

    app.post('/api/print-settings', express.json(), async (req, res) => {
      try {
        const settings = req.body;
        await fs.writeFile('./printerSettings.json', JSON.stringify(settings, null, 2));
        res.json(settings);
      } catch (err) {
        console.error('[server.cjs] Error saving printer settings:', err.message);
        res.status(500).json({ error: 'Failed to save printer settings: ' + err.message });
      }
    });

    app.listen(3001, () => {
      console.log('🚀 Server running at http://localhost:3001');
    });

    // --- New: Endpoint to check printer status ---
   const http = require('http');
const https = require('https');
const fs = require('fs').promises;

async function testPrinterConnectivity(printerUrl, mode = 'LAN') {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(printerUrl);
    } catch (err) {
      console.error(`[server.cjs] Invalid URL: ${printerUrl}`, err.message);
      return resolve({ available: false, error: `Invalid URL: ${err.message}` });
    }

    const protocol = url.protocol === 'https:' ? https : http;
    const isMockMode = mode === 'MOCK';
    const method = isMockMode ? 'POST' : 'HEAD';
    const testPayload = isMockMode ? JSON.stringify({ test: true }) : '';

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method,
      timeout: 5000,
      headers: {
        'User-Agent': 'Node.js Printer Status Check',
        ...(isMockMode ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(testPayload) } : {})
      }
    };

    console.log(`[server.cjs] Testing printer connectivity: ${method} ${printerUrl}`);

    const req = protocol.request(options, (res) => {
      console.log(`[server.cjs] Response status: ${res.statusCode}, Headers:`, res.headers);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve({ available: true, message: `Printer responded with status ${res.statusCode}` });
      } else {
        resolve({
          available: false,
          error: `Printer not found (Status: ${res.statusCode})`
        });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      console.log(`[server.cjs] Request timed out for ${printerUrl}`);
      resolve({ available: false, error: 'Lost connection to printer (timeout)' });
    });

    req.on('error', (err) => {
      console.error(`[server.cjs] Request error for ${printerUrl}: ${err.message}`);
      resolve({ available: false, error: `Printer error: ${err.message}` });
    });

    if (isMockMode) {
      req.write(testPayload);
    }
    req.end();
  });
}

app.get('/api/printer-status', async (req, res) => {
  try {
    const data = await fs.readFile('./printerSettings.json', { encoding: 'utf8' });
    const settings = JSON.parse(data);
    console.log(`[server.cjs] Printer settings for status check:`, settings);

    if (!settings.printerUrl) {
      return res.status(400).json({
        available: false,
        mode: settings.mode,
        error: 'No printer URL configured'
      });
    }

    if (settings.mode !== 'LAN' && settings.mode !== 'MOCK' && settings.mode !== 'CLOUD') {
      return res.json({
        available: true,
        mode: settings.mode,
        message: 'Non-supported mode, no printer check needed.'
      });
    }

    const printerCheck = await testPrinterConnectivity(settings.printerUrl, settings.mode);
    if (printerCheck.available) {
      res.json({
        available: true,
        mode: settings.mode,
        message: printerCheck.message || 'Printer is available.'
      });
    } else {
      res.status(503).json({
        available: false,
        mode: settings.mode,
        error: printerCheck.error
      });
    }
  } catch (err) {
    console.error('[server.cjs] Error checking printer status:', err.message);
    if (err.code === 'ENOENT') {
      res.status(500).json({
        available: false,
        error: 'Printer settings file not found'
      });
    } else {
      res.status(500).json({
        available: false,
        error: 'Failed to check printer status: ' + err.message
      });
    }
  }
});

}).catch(err => {
    console.error("Failed to start server due to initialization error:", err.message);
    process.exit(1);
});