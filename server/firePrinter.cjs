// server/firePrinter.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const settingsFilePath = path.join(__dirname, 'printerSettings.json');

function buildOrderHTML(order) {
  const items = order.items.map((item, index) => {
    const name = item.item || 'Unknown Item';
    const qty = item.qty || '1';
    const mod = item.modifier ? `<br>  <span style="color: red;">- ${item.modifier}</span>` : '';
    return `${qty}x ${name}${mod}`;
  }).join('<br>');

  const timeOrdered = new Date(order.timeOrdered || Date.now()).toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const firedAt = new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return `
<pre style="font-family: 'Courier', monospace; font-size: 12pt; width: 80mm; margin: 0; padding: 0;">
ORDER #${order.orderNum || order.id || 'Unknown'}
Order Type: ${order.orderType || 'N/A'}
Time Ordered: ${order.timeOrdered || 'N/A'}
Status: ${order.status || 'N/A'}
Caller: ${order.callerName || 'N/A'}
Phone: ${order.callerPhone || 'N/A'}
Email: ${order.email || 'N/A'}
Address: ${[order.callerAddress, order.callerCity, order.callerState, order.callerZip].filter(Boolean).join(', ') || 'N/A'}

${items}
<br>
Fired at ${firedAt}
</pre>
  `;
}

function buildOrderText(order) {
  const lines = order.items.map(item => `${item.qty}x ${item.name}`).join('\n');
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  });

  return `ORDER #${order.id || ''}\n\n${lines}\n\nFired at ${time}`;
}


function getPrintSettings() {
  const filePath = path.join(__dirname, 'printerSettings.json');
  const rawData = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(rawData);
}


async function sendToPrinter(order) {
  const settings = await getPrintSettings();
  if (!settings || !settings.printerUrl) throw new Error('No printer settings configured');

  // Determine content type and build the payload
  const contentType = settings.contentType || 'text/html';
  const payload = contentType === 'text/html'
    ? buildOrderHTML(order)
    : buildOrderText(order);

  // Set the post body: LAN mode wraps payload in JSON, others send payload directly
  const postBody = settings.mode === 'LAN'
    ? { request: [{ document: payload }] }
    : payload;

  // Set the content-type header: JSON for LAN, settings-defined type for others
  const headers = {
    'Content-Type': settings.mode === 'LAN' ? 'application/json' : contentType
  };

  const url = settings.printerUrl;

  try {
    console.log("📡 Sending to:", url);
    console.log("🧾 Payload:", postBody);
    const response = await axios.post(url, postBody, { headers });
    return response.data;
  } catch (err) {
    console.error('Failed to print:', err.message);
    throw err;
  }
}

module.exports = { sendToPrinter };