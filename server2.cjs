const express = require("express");
const { google } = require("googleapis");
const fs = require("fs").promises;
const path = require("path");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const cron = require('node-cron'); // Added for cron job

const app = express();
const PORT = 3001; // Changed to 3001 to avoid potential conflict with default React app port

app.use(cors());
app.use(express.json());

const SERVICE_ACCOUNT_FILE = path.join(__dirname, "accountAuthenticaltion.json");

const SHEET_ID = '1j';
const SHEET_TAB = 'orderItems';
const ORDER_HISTORY_TAB = 'orderHistory'; // Define the history tab name

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
let sheets; // This will hold the authenticated Google Sheets client

let sheetDataCache = {
    data: [],
    lastFetchTime: 0,
    fetchInterval: 10000, // 10 seconds
    isFetching: false,
    fetchPromise: null
};

// --- Helper function to normalize any Date object to the start of its UTC calendar day ---
// This is crucial for consistent date-only comparisons, stripping out time and timezone offsets.
const normalizeToUTCMidnight = (date) => {
    // Uses Date.UTC to ensure the result is always UTC midnight, regardless of
    // the server's local timezone.
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
};

// --- Utility Function to Load Orders for Report (from History) ---
async function getOrderRows() {
    if (!sheets) {
        throw new Error("Google Sheets client not initialized for getOrderRows.");
    }

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: ORDER_HISTORY_TAB, // Fetching from ORDER_HISTORY_TAB for historical report data
        });

        const rows = response.data.values || [];
        if (rows.length === 0) {
            console.log(`No data rows found in ${ORDER_HISTORY_TAB}.`);
            return [];
        }

        const header = rows[0]; // Assuming the first row is always the header
        const dataRows = rows.slice(1); // Data starts from the second row

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
        await fs.access(SERVICE_ACCOUNT_FILE);
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
        await fs.access(printHistoryFile);
    } catch (err) {
        await fs.writeFile(printHistoryFile, JSON.stringify([]));
        console.log(`Created printHistory.json at ${printHistoryFile}`);
    }
}

async function loadPrintHistory() {
    try {
        const data = await fs.readFile(printHistoryFile, "utf8");
        const parsed = JSON.parse(data);
        printHistory = parsed;
        return parsed;
    } catch (err) {
        console.error("Error loading printHistory.json:", err.message, err.stack);
        return [];
    }
}

// Function to save print history (assuming it exists elsewhere or is missing from provided code)
// async function savePrintHistory() {
//     try {
//         await fs.writeFile(printHistoryFile, JSON.stringify(printHistory, null, 2));
//     } catch (err) {
//         console.error("Error saving printHistory.json:", err.message, err.stack);
//     }
// }


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

async function getSheetData(forceFetch = false) {
    const now = Date.now();

    if (sheetDataCache.isFetching && sheetDataCache.fetchPromise) {
        console.log("[Backend Cache] A fetch is already in progress, returning existing promise.");
        return sheetDataCache.fetchPromise;
    }

    if (!forceFetch && sheetDataCache.data.length > 0 && (now - sheetDataCache.lastFetchTime < sheetDataCache.fetchInterval)) {
        console.log("[Backend Cache] Returning cached sheet data.");
        return sheetDataCache.data;
    }

    sheetDataCache.isFetching = true;
    sheetDataCache.fetchPromise = (async () => {
        try {
            console.log("Fetching new sheet data from Google Sheets API...");
            const range = SHEET_TAB; // Fetches from 'orderItems'
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
                    id: (index + 2), // Row number in the sheet is the ID
                    orderNum: displayOrderNum,
                    category: getVal(COLUMN_HEADERS.CATEGORY),
                    cancelled: getVal(COLUMN_HEADERS.CANCELLED).toUpperCase() === 'TRUE',
                    orderProcessed: getVal(COLUMN_HEADERS.ORDER_PROCESSED).toUpperCase() === 'Y',
                    orderType: getVal(COLUMN_HEADERS.ORDER_TYPE),
                    orderUpdateStatus: getVal(COLUMN_HEADERS.ORDER_UPDATE_STATUS) || 'NONE',
                    timeOrdered: getVal(COLUMN_HEADERS.TIME_ORDERED), // Keep as string from sheet
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
            range: SHEET_TAB, // Source tab ('orderItems')
        });
        const rows = response.data.values || [];

        if (rows.length <= 1) { // Only header or empty
            console.log(`[Cron Job] No data rows to archive from ${SHEET_TAB}.`);
            return;
        }

        const headerRow = rows[0]; // Keep for column count reference if needed
        const dataRowsToArchive = rows.slice(1);

        if (dataRowsToArchive.length === 0) {
            console.log(`[Cron Job] No actual data rows to archive from ${SHEET_TAB} after slicing header.`);
            return;
        }
        
        console.log(`[Cron Job] Found ${dataRowsToArchive.length} rows to archive from ${SHEET_TAB}.`);

        // Append data to ORDER_HISTORY_TAB
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: ORDER_HISTORY_TAB, // e.g., 'orderHistory!A1' or just 'orderHistory'
            valueInputOption: 'USER_ENTERED', // Or 'RAW'
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: dataRowsToArchive,
            },
        });
        console.log(`[Cron Job] Successfully appended ${dataRowsToArchive.length} rows to ${ORDER_HISTORY_TAB}.`);

        // Clear data rows from SHEET_TAB (orderItems), leaving the header
        const endColumnLetter = columnToLetter(headerRow.length > 0 ? headerRow.length : 26); // Default to Z if no header
        const clearRange = `${SHEET_TAB}!A2:${endColumnLetter}`;
        
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SHEET_ID,
            range: clearRange,
        });
        console.log(`[Cron Job] Successfully cleared data from ${clearRange} in ${SHEET_TAB}.`);

        invalidateSheetDataCache(); // Crucial to reflect changes
        console.log("[Cron Job] Sheet data cache invalidated after archiving.");

    } catch (err) {
        console.error('[Cron Job] Error during archiveOrders:', err.message, err.stack);
    }
}


initializeGoogleClients().then(async () => {
    await ensurePrintHistory();
    await loadPrintHistory();

    try {
        await getSheetData(true); // Initial fetch
    } catch (err) {
        console.error("Initial sheet data fetch failed, server will start with potentially empty cache:", err.message);
    }

    // Schedule cron job
    // Runs at 1:00 AM server time (America/New_York).
    cron.schedule('10 8 * * *', archiveOrders, {
        scheduled: true,
        timezone: "America/New_York" // Specify the timezone for cron scheduling
    });
    console.log(`Cron job scheduled to archive orders at 8:10 AM (America/New_York). Current time: ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}`);


    app.get("/", (req, res) => {
        res.send("✅ Backend server is alive (Sheets direct integration with cron)");
    });

    // --- REVISED: filterByCurrentDate using UTC normalization for consistency ---
    const filterByCurrentDate = (order) => {
        if (!order.timeOrdered) return false;
        try {
            const orderDate = new Date(order.timeOrdered);
            if (isNaN(orderDate.getTime())) return false; // Invalid date

            // Normalize the order's date to its UTC midnight
            const normalizedOrderDate = normalizeToUTCMidnight(orderDate);

            // Get 'today's UTC midnight for comparison
            const now = new Date();
            const todayUtcMidnight = normalizeToUTCMidnight(now);

            // Set the end of today's range to tomorrow's UTC midnight (half-open interval)
            const tomorrowUtcMidnight = new Date(todayUtcMidnight.getTime() + 24 * 60 * 60 * 1000);

            // Check if the normalized order date falls within today's UTC calendar day
            return normalizedOrderDate >= todayUtcMidnight && normalizedOrderDate < tomorrowUtcMidnight;
        } catch (e) {
            console.warn(`Could not parse or normalize date for order ${order.orderNum}: ${order.timeOrdered}`, e);
            return false;
        }
    };

    app.get("/api/list", async (req, res) => {
        try {
            const allOrders = await getSheetData(); // Fetches from 'orderItems' (active orders)
            const incomingOrdersToday = allOrders.filter(order =>
                !order.cancelled &&
                !order.orderProcessed &&
                order.orderUpdateStatus === 'NONE' &&
                filterByCurrentDate(order) // Filter for current date based on UTC normalization
            ).sort((a, b) => new Date(a.timeOrdered).getTime() - new Date(b.timeOrdered).getTime());

            res.json(incomingOrdersToday);
        } catch (err) {
            console.error("Error fetching incoming orders:", err.message, err.stack);
            res.status(500).json({ error: "Failed to fetch incoming orders: " + err.message });
        }
    });

    app.get("/api/updating", async (req, res) => {
        try {
            const allOrders = await getSheetData(); // Fetches from 'orderItems' (active orders)
            const updatingOrdersToday = allOrders.filter(order =>
                !order.cancelled &&
                !order.orderProcessed &&
                order.orderUpdateStatus === 'ChkRecExist' &&
                filterByCurrentDate(order) // Filter for current date based on UTC normalization
            ).sort((a, b) => new Date(b.timeOrdered).getTime() - new Date(a.timeOrdered).getTime());

            res.json(updatingOrdersToday);
        } catch (err) {
            console.error("Error fetching updating orders:", err.message, err.stack);
            res.status(500).json({ error: "Failed to fetch updating orders: " + err.message });
        }
    });

    app.get("/api/printed", async (req, res) => {
        try {
            // For 'printed' orders, if they are moved to ORDER_HISTORY_TAB by cron,
            // you might want to fetch directly from ORDER_HISTORY_TAB for a complete history.
            // For now, it continues to use getSheetData() which fetches from SHEET_TAB ('orderItems').
            // This means 'printed' will only show processed orders that haven't been archived yet.
            const allOrders = await getSheetData();
            const processedOrders = allOrders.filter(order =>
                order.orderProcessed
            ).sort((a, b) => new Date(b.timeOrdered).getTime() - new Date(a.timeOrdered).getTime());
            
            // Augmenting with local print history (if any)
            const historyMap = new Map(printHistory.map(entry => [entry.id, entry]));
            const augmentedPrintedOrders = processedOrders.map(order => {
                const localHistory = historyMap.get(order.id) || { printHistory: [], reprinted: false };
                return {
                    ...order,
                    // Prefer sheet's timestamps if present, otherwise local file history
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
            const allOrders = await getSheetData(); // This gets data from the active sheet
            const order = allOrders.find(o => o.rowIndex === rowIndex);
            if (order) {
                console.log(`Returning details for order at rowIndex: ${rowIndex}`);
                res.json(order);
            } else {
                console.warn(`Order not found at rowIndex ${rowIndex} in current sheetDataCache.`);
                // OPTIONAL: If order not found in current sheet, you could attempt to fetch from ORDER_HISTORY_TAB here.
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

            const allOrders = await getSheetData(true); // Force fetch to ensure latest state
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

            const now = new Date().toISOString(); // Using ISO string for timestamps in sheet

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

            const allOrders = await getSheetData(true); // Force fetch
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

    // --- REVISED: /api/order-stats endpoint for robust date range counting ---
    app.get('/api/order-stats', async (req, res) => {
        try {
            const { range, start, end } = req.query;

            console.log(`[Report API] Received range: ${range}, start: ${start}, end: ${end}`);

            let startDate, endDate;
            const now = new Date(); // Current instant
            const todayUtcMidnight = normalizeToUTCMidnight(now); // Current calendar day at UTC midnight

            if (range === 'custom') {
                if (!start || !end) {
                    console.warn('[Report API] Custom range requested but start or end date is missing.');
                    return res.status(400).json({ error: 'Start and end dates are required for custom range.' });
                }
                
                // Parse the incoming 'YYYY-MM-DD' strings.
                // It's safer to create a date as local (e.g., '2025-06-05T00:00:00')
                // and then normalize it to UTC midnight.
                const parsedStartLocal = new Date(`${start}T00:00:00`);
                const parsedEndLocal = new Date(`${end}T00:00:00`);

                if (isNaN(parsedStartLocal.getTime()) || isNaN(parsedEndLocal.getTime())) {
                    console.warn(`[Report API] Invalid date format for custom range. Start: ${start}, End: ${end}`);
                    return res.status(400).json({ error: 'Invalid date format provided. Use YYYY-MM-DD.' });
                }

                // Normalize start date to UTC midnight of its calendar day
                startDate = normalizeToUTCMidnight(parsedStartLocal);
                // For end date, set it to UTC midnight of the *next* day for a half-open interval
                endDate = new Date(normalizeToUTCMidnight(parsedEndLocal).getTime() + 24 * 60 * 60 * 1000);
                
            } else {
                // Logic for predefined ranges, all calculated relative to today's UTC midnight
                switch (range) {
                    case '7': // Last 7 days including today
                    case '14':
                    case '30':
                    case '90':
                        startDate = new Date(todayUtcMidnight.getTime() - (parseInt(range, 10) - 1) * 24 * 60 * 60 * 1000);
                        endDate = new Date(todayUtcMidnight.getTime() + 24 * 60 * 60 * 1000); // End of today (midnight of tomorrow)
                        break;
                    case 'YTD': // Year to Date
                        startDate = new Date(Date.UTC(now.getFullYear(), 0, 1)); // January 1st of current year, 00:00:00 UTC
                        endDate = new Date(todayUtcMidnight.getTime() + 24 * 60 * 60 * 1000); // End of today (midnight of tomorrow)
                        break;
                    default: // Default to last 7 days including today
                        startDate = new Date(todayUtcMidnight.getTime() - 6 * 24 * 60 * 60 * 1000);
                        endDate = new Date(todayUtcMidnight.getTime() + 24 * 60 * 60 * 1000); // End of today (midnight of tomorrow)
                        break;
                }
            }

            // At this point, startDate and endDate are UTC Date objects,
            // representing UTC midnights. startDate is inclusive, endDate is exclusive.
            console.log(`[Report API] Calculated Date Range (UTC) - Start: ${startDate.toISOString()}, End (Exclusive): ${endDate.toISOString()}`);

            // Fetch order data from history tab
            const orderRows = await getOrderRows();
            console.log(`[Report API] Fetched ${orderRows.length} rows from order history.`);

            const countByDate = {};
            orderRows.forEach(row => {
                const rawDate = row[COLUMN_HEADERS.TIME_ORDERED];
                if (rawDate) {
                    // Parse the raw timestamp from the sheet
                    const parsedOrderDate = new Date(rawDate);

                    if (!isNaN(parsedOrderDate.getTime())) {
                        // Normalize the transaction's date to its UTC midnight for comparison
                        const normalizedOrderDate = normalizeToUTCMidnight(parsedOrderDate);

                        // Compare the normalized transaction date with the normalized range boundaries
                        if (normalizedOrderDate >= startDate && normalizedOrderDate < endDate) {
                            // Group by the *local* date string for output (e.g., '2025-06-05').
                            // This is typically what users expect for reports.
                            const year = parsedOrderDate.getFullYear();
                            const month = String(parsedOrderDate.getMonth() + 1).padStart(2, '0');
                            const day = String(parsedOrderDate.getDate()).padStart(2, '0');
                            const dateKey = `${year}-${month}-${day}`;
                            
                            countByDate[dateKey] = (countByDate[dateKey] || 0) + 1;
                        }
                    } else {
                        console.warn(`[Report API] Invalid date found in order row for TIME_ORDERED: '${rawDate}'`);
                    }
                }
            });

            res.json(countByDate);
        } catch (error) {
            console.error('Error fetching order stats:', error);
            res.status(500).json({ error: 'Failed to fetch order stats: ' + error.message });
        }
    });

    app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
    });

}).catch(err => {
    console.error("Failed to start server due to initialization error:", err.message);
    process.exit(1); // Exit if initialization fails
});