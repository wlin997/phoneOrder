// watchSheet.js
import { google } from 'googleapis';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFile } from 'fs/promises';
import { Readable } from 'stream';

/* ───── 1. CONFIG ───── */
const SHEET_ID = '1jhfeNgtIsnZZya8R91dPoMmXdbAUT_0wtcCq_022MGE';
const SHEET_TAB = 'orderItems';
const POLL_INTERVAL = 15_000;                         // 15 s
const KEY_FILE = '../orderagent-460001-5fb1b5608046.json';
const DRIVE_FOLDER_ID = '1XDclFMonHKlHHkvYMmGNl977o298N3p0'; // Incoming Orders folder
const CUSTOMER_UPDATING_FOLDER_ID = '1ERlaBdPbmObPfMbpRoaCyTFwCrvNQeJV'; // <<< REPLACE WITH YOUR ACTUAL FOLDER ID

const ORDERPROCESSED_HEADER = 'Order_processed';
const ORDERNUM_HEADER = 'OrderNum';
const PRINTED_HEADER = 'Printed to PDF (timestamp)';
const PDF_DRIVE_ID_HEADER = 'PDF_Drive_ID'; // New: Header for storing PDF Drive ID
const SHEET_LAST_MODIFIED_HEADER = 'Sheet_Last_Modified'; // New: Header for tracking sheet row changes
const ORDER_UPDATE_STATUS_HEADER = 'Order_Update_Status'; // New: Header for the update status

/* ───── 2. GOOGLE AUTH ───── */
const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive', // Ensure full drive scope for updates/moves/deletes
  ],
});
const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

/* ───── 3. MAIN LOOP ───── */
console.log(`Watcher started — polling every ${POLL_INTERVAL / 1000}s`);
setInterval(pollSheet, POLL_INTERVAL);
await pollSheet();

async function pollSheet() {
  try {
    const range = SHEET_TAB; // Fetch entire sheet to include all columns
    const rows = (await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range,
    })).data.values ?? [];

    if (rows.length < 2) return;        // header only
    console.log(`Pulled ${rows.length - 1} data rows`);

    /* header → index map */
    const header = rows[0];
    const colMap = Object.fromEntries(header.map((h, i) => [h, i]));

    const printedCol = colMap[PRINTED_HEADER];
    const orderNumCol = colMap[ORDERNUM_HEADER];
    const firstItemCol = colMap['Order_item_1'];
    const pdfDriveIdCol = colMap[PDF_DRIVE_ID_HEADER]; // NEW
    const sheetLastModifiedCol = colMap[SHEET_LAST_MODIFIED_HEADER]; // NEW
    const orderUpdateStatusCol = colMap[ORDER_UPDATE_STATUS_HEADER]; // NEW

    console.log('DEBUG Order# column index', orderNumCol);
    if (
      printedCol === undefined ||
      orderNumCol === undefined ||
      firstItemCol === undefined ||
      pdfDriveIdCol === undefined ||
      sheetLastModifiedCol === undefined ||
      orderUpdateStatusCol === undefined
    ) {
      console.error('ERROR: expected headers missing: Printed to PDF (timestamp), OrderNum, Order_item_1, PDF_Drive_ID, Sheet_Last_Modified, or Order_Update_Status');
      return;
    }

    console.log('Header map built ✓');

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 1;

      const printedByWatcher = (row[printedCol] || '').trim();
      const pdfDriveId = (row[pdfDriveIdCol] || '').trim();
      const sheetLastModified = (row[sheetLastModifiedCol] || '').trim();
      const orderUpdateStatus = (row[orderUpdateStatusCol] || '').trim(); // Get the status

      console.log(`Row ${rowIndex}: Status='${orderUpdateStatus}', Printed by Watcher='${printedByWatcher}', PDF_Drive_ID='${pdfDriveId}', Sheet_Last_Modified='${sheetLastModified}'`);

      if (!row[firstItemCol]) {
        console.log(`Row ${rowIndex}: skipped (no Order_item_1 - likely empty row)`);
        continue;
      }

      /* Ensure Order# exists */
      while (row.length <= orderNumCol) row.push('');
      let orderNum = row[orderNumCol];

      if (!orderNum) {
        orderNum = String(rowIndex - 1);
        await writeSheetCell(orderNumCol, rowIndex, orderNum, 'USER_ENTERED');
        row[orderNumCol] = orderNum;
        console.log(`   ↳ wrote Order # ${orderNum}`);
      }

      // Determine current PDF location for accurate moving
      const currentPdfParentFolderId = pdfDriveId ? await getPdfParentFolder(pdfDriveId) : null;
      console.log(`   Current PDF parent folder for ${orderNum}: ${currentPdfParentFolderId}`);


      if (orderUpdateStatus === 'ChkRecExist') {
        // Condition: Order is flagged for customer update
        if (pdfDriveId && currentPdfParentFolderId === DRIVE_FOLDER_ID) {
          console.log(`Row ${rowIndex}: Order flagged for update. Moving PDF ${pdfDriveId} from Incoming to Customer Updating folder.`);
          await moveDriveFile(pdfDriveId, CUSTOMER_UPDATING_FOLDER_ID, DRIVE_FOLDER_ID);
          console.log(` → PDF moved to Customer Updating Orders folder ✓`);
        } else if (!pdfDriveId) {
            console.warn(`Row ${rowIndex}: Order_Update_Status is 'ChkRecExist' but no PDF_Drive_ID found. Skipping move.`);
        } else if (currentPdfParentFolderId === CUSTOMER_UPDATING_FOLDER_ID) {
            console.log(`Row ${rowIndex}: PDF is already in Customer Updating Orders folder. Skipping move.`);
        }
        continue; // Skip further processing for this row until status is 'NONE'
      } else if (orderUpdateStatus === 'NONE') {
        // Condition: Update complete, move back to Incoming and update PDF content if necessary
        let shouldUpdatePdf = false;
        if (!printedByWatcher || !pdfDriveId) {
          // PDF has not been generated by watcher or ID is missing (initial creation or missing PDF_Drive_ID)
          shouldUpdatePdf = true;
          console.log(`Row ${rowIndex}: PDF needs initial generation or PDF_Drive_ID was missing.`);
        } else {
          // PDF exists and has a Drive ID, check if sheet data has been modified since PDF was last updated
          try {
            const driveFile = await drive.files.get({
              fileId: pdfDriveId,
              fields: 'modifiedTime',
              supportsAllDrives: true,
            });
            const pdfModifiedTime = new Date(driveFile.data.modifiedTime).getTime();
            const sheetModifiedTime = new Date(sheetLastModified).getTime();

            if (isNaN(sheetModifiedTime)) {
              console.warn(`Row ${rowIndex}: Invalid Sheet_Last_Modified timestamp: '${sheetLastModified}'. Assuming update needed.`);
              shouldUpdatePdf = true;
            } else if (sheetModifiedTime > pdfModifiedTime) {
              shouldUpdatePdf = true;
              console.log(`Row ${rowIndex}: Sheet data (Modified: ${sheetLastModified}) is newer than PDF (Modified: ${driveFile.data.modifiedTime}). Will update PDF.`);
            } else {
              console.log(`Row ${rowIndex}: PDF is up-to-date. Skipped content update.`);
            }
          } catch (err) {
            if (err.code === 404) {
              console.warn(`Row ${rowIndex}: PDF with ID ${pdfDriveId} not found in Drive. Will re-create.`);
              shouldUpdatePdf = true; // PDF linked in sheet but not found in Drive
            } else {
              console.error(`Error checking PDF modified time for row ${rowIndex}:`, err.message);
              shouldUpdatePdf = true; // For robustness, force update on error
            }
          }
        }

        if (shouldUpdatePdf) {
          const newPdfDriveId = await createOrUpdatePdf(row, orderNum, colMap, pdfDriveId, DRIVE_FOLDER_ID); // Ensure it's created/updated in the Incoming folder
          await writeSheetCell(printedCol, rowIndex, new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }), 'RAW');
          await writeSheetCell(pdfDriveIdCol, rowIndex, newPdfDriveId, 'RAW');
          console.log(` → PDF generated/updated and timestamped by watcher ✓`);
        }

        // Always ensure PDF is in the Incoming folder if status is 'NONE' and it's not already there
        if (pdfDriveId && currentPdfParentFolderId === CUSTOMER_UPDATING_FOLDER_ID) {
            console.log(`Row ${rowIndex}: Order status 'NONE'. Moving PDF ${pdfDriveId} from Customer Updating to Incoming folder.`);
            await moveDriveFile(pdfDriveId, DRIVE_FOLDER_ID, CUSTOMER_UPDATING_FOLDER_ID);
            console.log(` → PDF moved back to Incoming Orders folder ✓`);
        }

      } else {
        // Default condition: Process as normal "Incoming Order" (not updating, not printed yet)
        let shouldUpdatePdf = false;
        if (!printedByWatcher || !pdfDriveId) {
            shouldUpdatePdf = true; // Initial creation
            console.log(`Row ${rowIndex}: New order or missing PDF_Drive_ID. Will create/update PDF.`);
        } else {
             // Existing logic for checking sheetLastModified vs pdfModifiedTime
             try {
                const driveFile = await drive.files.get({
                    fileId: pdfDriveId,
                    fields: 'modifiedTime',
                    supportsAllDrives: true,
                });
                const pdfModifiedTime = new Date(driveFile.data.modifiedTime).getTime();
                const sheetModifiedTime = new Date(sheetLastModified).getTime();

                if (isNaN(sheetModifiedTime)) {
                    console.warn(`Row ${rowIndex}: Invalid Sheet_Last_Modified timestamp: '${sheetLastModified}'. Assuming update needed.`);
                    shouldUpdatePdf = true;
                } else if (sheetModifiedTime > pdfModifiedTime) {
                    shouldUpdatePdf = true;
                    console.log(`Row ${rowIndex}: Sheet data (Modified: ${sheetLastModified}) is newer than PDF (Modified: ${driveFile.data.modifiedTime}). Will update PDF.`);
                }
             } catch (err) {
                 if (err.code === 404) {
                    console.warn(`Row ${rowIndex}: PDF with ID ${pdfDriveId} not found in Drive. Will re-create.`);
                    shouldUpdatePdf = true;
                 } else {
                    console.error(`Error checking PDF modified time for row ${rowIndex}:`, err.message);
                    shouldUpdatePdf = true;
                 }
             }
        }

        if (shouldUpdatePdf) {
            // Ensure the PDF is in the Incoming Orders folder for normal processing
            if (pdfDriveId && currentPdfParentFolderId === CUSTOMER_UPDATING_FOLDER_ID) {
                console.log(`Row ${rowIndex}: Order status not 'ChkRecExist' or 'NONE'. Moving PDF ${pdfDriveId} to Incoming Orders folder.`);
                await moveDriveFile(pdfDriveId, DRIVE_FOLDER_ID, CUSTOMER_UPDATING_FOLDER_ID);
            }
            const newPdfDriveId = await createOrUpdatePdf(row, orderNum, colMap, pdfDriveId, DRIVE_FOLDER_ID);
            await writeSheetCell(printedCol, rowIndex, new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }), 'RAW');
            await writeSheetCell(pdfDriveIdCol, rowIndex, newPdfDriveId, 'RAW');
            console.log(' → Initial PDF generated and timestamped by watcher ✓');
        }
      }
    }
  } catch (err) { console.error('pollSheet error:', err.message); }
}

/* ───── HELPERS ───── */
async function writeSheetCell(colIdx, rowIdx, value, mode = 'RAW') {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!${columnToLetter(colIdx + 1)}${rowIdx}`,
    valueInputOption: mode,
    requestBody: { values: [[value]] },
  });
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

// NEW: Helper to get the current parent folder of a Drive file
async function getPdfParentFolder(fileId) {
    if (!fileId) return null;
    try {
        const response = await drive.files.get({
            fileId: fileId,
            fields: 'parents',
            supportsAllDrives: true,
        });
        // Returns the first parent ID if available, otherwise null
        return response.data.parents && response.data.parents.length > 0 ? response.data.parents[0] : null;
    } catch (err) {
        if (err.code === 404) {
            console.warn(`File ${fileId} not found in Drive.`);
            return null; // File doesn't exist, so no parent folder
        }
        console.error(`Error getting parent folder for file ${fileId}:`, err.message);
        throw err;
    }
}

// NEW: Helper to move a Drive file between folders
async function moveDriveFile(fileId, newParentFolderId, currentParentFolderId) {
    if (!fileId) return;
    try {
        const removeParents = currentParentFolderId ? currentParentFolderId : ''; // Only remove if a current parent is provided
        await drive.files.update({
            fileId: fileId,
            addParents: newParentFolderId,
            removeParents: removeParents,
            fields: 'id, parents', // Request fields to confirm success
            supportsAllDrives: true,
        });
        console.log(`File ${fileId} moved from ${currentParentFolderId || 'root/unknown'} to folder ${newParentFolderId}.`);
    } catch (err) {
        console.error(`Error moving file ${fileId}:`, err.message);
        throw err;
    }
}

// Modified createOrUpdatePdf to take a destination folder ID
async function createOrUpdatePdf(row, orderNum, colMap, existingPdfDriveId, destinationFolderId) {
  const col = h => colMap[h];

  /* Extract order details using exact header names from the Google Sheet */
  const orderType = row[col('Order_type')] || 'N/A';
  const timeOrdered = row[col('Time_ordered')] || 'N/A';
  const printed = row[col(PRINTED_HEADER)] || ''; // Use PRINTED_HEADER
  const callerName = row[col('Caller_name')] || '';
  const callerPhone = row[col('Caller_phone')] || '';
  const callerAddress = row[col('Caller_address')] || '';
  const callerCity = row[col('Caller_City')] || '';
  const callerState = row[col('Caller_State')] || '';
  const callerZip = row[col('Caller_Zip')] || '';

  /* Combine caller and address info */
  const caller = [callerName, callerPhone].filter(Boolean).join(', ');
  const address = [callerAddress, callerCity, callerState, callerZip].filter(Boolean).join(', ');

  /* Collect all items (up to 20 as per your headers) */
  const items = [];
  for (let n = 1; n <= 20; n++) {
    const itemCol = `Order_item_${n}`;
    const qtyCol = `Qty_${n}`;
    const modCol = `modifier_${n}`;
    if (row[col(itemCol)]) {
      const item = row[col(itemCol)];
      const qty = row[col(qtyCol)] || '1';
      const mod = row[col(modCol)] || '';
      items.push({ item, qty, mod });
    }
  }

  /* Build PDF with pagination */
  const pdfDoc = await PDFDocument.create();
  let currentPage = pdfDoc.addPage([400, 600]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = 580;

  const INDENT = 20; // Indentation for modifiers
  const LINE_HEIGHT = 14; // Line height for size 10 text

  const drawText = (text, size = 10, xOffset = 0) => {
    const x = 10 + xOffset;
    if (y < 50) {
      currentPage = pdfDoc.addPage([400, 600]);
      y = 580;
    }
    currentPage.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
    y -= size + 4; // Decrease y based on text size
  };

  /* Draw order details */
  drawText(`Order Number: ${orderNum}`, 14);
  drawText(`Order Type: ${orderType}`, 12);
  drawText(`Time Ordered: ${timeOrdered}`, 12);
  drawText(`Printed: ${printed}`, 12); // This will be empty initially for new orders
  drawText(`Caller: ${caller}`, 12);
  drawText(`Address: ${address}`, 12);
  drawText('================================================', 10);

  /* Draw all items with indentation and blank lines */
  for (const item of items) {
    drawText(`Item: ${item.item}    Qty: ${item.qty}`, 10);
    if (item.mod) {
      drawText(`Modifier: ${item.mod}`, 10, INDENT); // Indented modifier
    }
    y -= LINE_HEIGHT; // Add a blank line after each item
  }

  const bytes = await pdfDoc.save();
  const buffer = Buffer.from(bytes);

  /* Format timestamp for filename */
  const now = new Date();
  const formattedTimestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19);
  const fileName = `Pickup-Order-${orderNum}-${formattedTimestamp}.pdf`;

  let driveRes;
  if (existingPdfDriveId) {
    try {
      // Update existing file. No need to update parents here, as moveDriveFile handles it.
      driveRes = await drive.files.update({
        fileId: existingPdfDriveId,
        requestBody: { name: fileName },
        media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
        fields: 'id',
        supportsAllDrives: true,
      });
      console.log(`   ↳ updated ${fileName} (Drive ID: ${driveRes.data.id})`);
    } catch (updateErr) {
      console.warn(`Could not update existing PDF ${existingPdfDriveId}: ${updateErr.message}. Creating a new one in ${destinationFolderId}.`);
      // If update fails (e.g., file deleted), fall back to creating a new one in the specified destination folder
      driveRes = await drive.files.create({
        requestBody: { name: fileName, parents: [destinationFolderId] }, // Create in destination folder
        media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
        fields: 'id',
        supportsAllDrives: true,
      });
      console.log(`   ↳ created new ${fileName} (Drive ID: ${driveRes.data.id})`);
    }
  } else {
    // Create new file directly in the specified destination folder
    driveRes = await drive.files.create({
      requestBody: { name: fileName, parents: [destinationFolderId] }, // Create in destination folder
      media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
      fields: 'id',
      supportsAllDrives: true,
    });
    console.log(`   ↳ uploaded ${fileName} (Drive ID: ${driveRes.data.id})`);
  }
  return driveRes.data.id; // Return the ID of the created/updated PDF
}