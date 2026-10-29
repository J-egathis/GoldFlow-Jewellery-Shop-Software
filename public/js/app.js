/**
 * GoldFlow - Professional Jewellery POS, Billing, Inventory & Business Management System
 * Production-ready Desktop & Web Experience
 */

const token = sessionStorage.getItem('token');
const userStr = sessionStorage.getItem('user');

if (!token || !userStr) {
  window.location.href = '/index.html';
}

const user = JSON.parse(userStr);

// UI User Setup
if (document.getElementById('userName')) document.getElementById('userName').innerText = user.name;
if (document.getElementById('userRole')) document.getElementById('userRole').innerText = user.role;
if (document.getElementById('userInitial')) document.getElementById('userInitial').innerText = user.name.charAt(0).toUpperCase();

// Socket IO Client
const socket = io();
socket.emit('join', user.id);
socket.emit('join_role', user.role);

// -------------------------------------------------------------------------
// ISOLATED PRINT WINDOWS
// A popup created with window.open('') + document.write() shares the dashboard's renderer
// process / event loop. window.print() is a blocking modal, so while the print dialog was
// open the dashboard (and other GoldFlow tabs in the same process) froze and page refresh
// appeared to hang. These helpers open print documents as same-origin Blob URLs with
// 'noopener' (separate browsing context group => separate process), so the dashboard stays
// responsive. A BroadcastChannel handshake lets us pre-open a "Generating..." window during
// the user click (avoids popup blockers) and deliver the final HTML after async API calls.
// -------------------------------------------------------------------------
function gfPrepareIsolatedHtml(html) {
  // Blob documents have no hierarchical base URL, so relative paths (/vendor, /uploads)
  // must be anchored to the server origin.
  const baseTag = `<base href="${window.location.origin}/">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + baseTag);
  return baseTag + html;
}

function gfPrintLoaderHtml(message, channelId) {
  const safeMsg = String(message || 'Preparing Print...').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const script = channelId ? `<script>
    (function () {
      var ch = new BroadcastChannel(${JSON.stringify(channelId)});
      ch.onmessage = function (e) {
        var m = e.data || {};
        if (m.type === 'html') {
          ch.postMessage({ type: 'done' });
          ch.close();
          var url = URL.createObjectURL(new Blob([m.html], { type: 'text/html' }));
          location.replace(url);
        } else if (m.type === 'close') {
          ch.close();
          window.close();
        }
      };
      ch.postMessage({ type: 'ready' });
    })();
  <\/script>` : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>GoldFlow - ${safeMsg}</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:85vh;color:#475569;margin:0;background:#f8fafc;} .box{text-align:center;padding:24px;background:#fff;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.05);border:1px solid #e2e8f0;} .spin{font-size:36px;animation:spin 1.5s linear infinite;display:inline-block;} @keyframes spin{100%{transform:rotate(360deg);}}</style></head><body><div class="box"><div class="spin">⏳</div><div style="font-weight:800;font-size:16px;color:#0f172a;margin-top:10px;">${safeMsg}</div><div style="font-size:12px;color:#94a3b8;margin-top:4px;">Please wait while your document is generated.</div></div>${script}</body></html>`;
}

/**
 * Opens a print window immediately (call it synchronously inside the click handler) and
 * returns a handle: handle.write(html) delivers the final document, handle.close() closes it.
 */
window.gfOpenPrintWindow = function (features = 'width=950,height=950', loadingMessage = 'Preparing Print...') {
  // Fallback for very old browsers without BroadcastChannel: legacy same-process popup.
  if (typeof BroadcastChannel === 'undefined') {
    const w = window.open('', '_blank', features);
    if (!w) {
      showToast('Pop-up blocked. Please allow pop-ups for GoldFlow to print.', 'warning');
      return { closed: true, write() {}, close() {} };
    }
    w.document.write(gfPrintLoaderHtml(loadingMessage, null));
    w.document.close();
    return {
      get closed() { return w.closed; },
      write(html) { if (w.closed) return; w.document.open(); w.document.write(html); w.document.close(); },
      close() { if (!w.closed) w.close(); }
    };
  }

  const channelId = 'gf-print-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const channel = new BroadcastChannel(channelId);
  let ready = false;
  let pendingHtml = null;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    handle.closed = true;
    setTimeout(() => { try { channel.close(); } catch (e) {} }, 500);
  };

  const handle = {
    closed: false,
    write(html) {
      if (this.closed) return;
      const doc = gfPrepareIsolatedHtml(html);
      if (ready) channel.postMessage({ type: 'html', html: doc });
      else pendingHtml = doc;
    },
    close() {
      if (this.closed) return;
      channel.postMessage({ type: 'close' });
      finish();
    }
  };

  channel.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.type === 'ready') {
      ready = true;
      if (pendingHtml) {
        channel.postMessage({ type: 'html', html: pendingHtml });
        pendingHtml = null;
      }
    } else if (msg.type === 'done') {
      finish();
    }
  };

  const loaderUrl = URL.createObjectURL(new Blob([gfPrintLoaderHtml(loadingMessage, channelId)], { type: 'text/html' }));
  window.open(loaderUrl, '_blank', 'noopener,' + features);
  setTimeout(() => URL.revokeObjectURL(loaderUrl), 60000);

  // With 'noopener' window.open() always returns null, so detect popup blocking via handshake.
  setTimeout(() => {
    if (!ready && !finished) {
      finish();
      showToast('Pop-up blocked. Please allow pop-ups for GoldFlow to print.', 'warning');
    }
  }, 6000);

  return handle;
};

/** Opens a ready-made HTML document in an isolated print window. */
window.gfOpenPrintDocument = function (html, features = 'width=950,height=950') {
  const handle = window.gfOpenPrintWindow(features, 'Preparing Print...');
  handle.write(html);
  return handle;
};

// Global State
window.allSales = [];
window.jewelleryItems = [];
window.currentCart = [];
window.itemDiscounts = {};
window.latestRates = {
  '24K': 7500,
  '22K': 6875,
  '18K': 5625,
  'SILVER_999': 98,
  'SILVER_925': 90
};
window.systemSettings = {
  shop_name: 'GoldFlow Jewellers',
  shop_tagline: 'Fine Gold & Luxury Jewellery',
  shop_address: '123 Commercial Street, Gold Bazaar, Chennai, Tamil Nadu',
  shop_phone: '+91 98765 43210',
  shop_email: 'billing@goldflow.com',
  shop_gst: '33AAAAA0000A1Z5',
  invoice_prefix: 'GF',
  tax_gst_percent: '3',
  round_off_enabled: 'true',
  terms_and_conditions: 'Returns accepted within 7 days in original condition with bill. Weight and purity certified.'
};

window.getCurrentGstPercent = function() {
  const raw = window.systemSettings?.tax_gst_percent;
  if (raw !== undefined && raw !== null && raw !== '' && !isNaN(parseFloat(raw))) {
    return parseFloat(raw);
  }
  return 3;
};
function getCurrentGstPercent() {
  return window.getCurrentGstPercent();
}

window.calculateJewelleryEstimatedPrice = function(item) {
  if (!item) return 0;
  const sellPrice = parseFloat(item.selling_price) || 0;
  const gross = parseFloat(item.gross_weight || item.weight || 0);
  const stone = parseFloat(item.stone_weight || 0);
  const net = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, gross - stone);
  
  // If explicitly fixed price with zero net gold, return sellPrice
  if (item.pricing_mode === 'FIXED_PRICE' || (sellPrice > 0 && net <= 0)) {
    return sellPrice;
  }

  const purity = item.purity || '22K';
  const rate = (window.latestRates && window.latestRates[purity]) ? window.latestRates[purity] : 7000;
  
  if (net > 0 && rate > 0) {
    const gVal = Math.round(net * rate);
    const wVal = Math.round(gVal * ((parseFloat(item.wastage_percent) || 0) / 100));
    let mVal = 0;
    const mcVal = parseFloat(item.making_charge) || 0;
    if (item.making_charge_type === 'PERCENTAGE') {
      mVal = Math.round(gVal * (mcVal / 100));
    } else if (item.making_charge_type === 'PER_GRAM') {
      mVal = Math.round(net * mcVal);
    } else {
      mVal = Math.round(mcVal);
    }
    const sVal = Math.round(parseFloat(item.stone_charge) || 0);
    const oVal = Math.round(parseFloat(item.other_charges) || 0);
    return gVal + wVal + mVal + sVal + oVal;
  }
  
  return sellPrice;
};

window.updateAllGoldRateBadges = function() {
  const r22 = (window.latestRates && window.latestRates['22K']) ? window.latestRates['22K'] : 6875;
  const r24 = (window.latestRates && window.latestRates['24K']) ? window.latestRates['24K'] : 7500;
  const rSil = (window.latestRates && window.latestRates['SILVER_999']) ? window.latestRates['SILVER_999'] : 98;

  if (document.getElementById('topbarRate22k')) {
    document.getElementById('topbarRate22k').innerText = `22K: ₹${Number(r22).toLocaleString('en-IN')}/g`;
  }
  if (document.getElementById('topbarRate24k')) {
    document.getElementById('topbarRate24k').innerText = `(24K: ₹${Number(r24).toLocaleString('en-IN')}/g)`;
  }
  if (document.getElementById('jewelleryGoldRateVal')) {
    document.getElementById('jewelleryGoldRateVal').innerText = Number(r22).toLocaleString('en-IN');
  }
  if (document.getElementById('posHeaderGoldRate')) {
    document.getElementById('posHeaderGoldRate').innerText = `22K: ₹${Number(r22).toLocaleString('en-IN')}/g`;
  }
  if (document.getElementById('ownerDashGoldRate22')) {
    document.getElementById('ownerDashGoldRate22').innerHTML = `₹${Number(r22).toLocaleString('en-IN')}<span class="text-xs font-normal text-amber-100">/g</span>`;
  }
  if (document.getElementById('ownerDashGoldRate24')) {
    document.getElementById('ownerDashGoldRate24').innerText = `₹${Number(r24).toLocaleString('en-IN')}/g`;
  }
  if (document.getElementById('ownerDashSilverRate')) {
    document.getElementById('ownerDashSilverRate').innerText = `₹${Number(rSil).toLocaleString('en-IN')}/g`;
  }
};
function updateAllGoldRateBadges() {
  return window.updateAllGoldRateBadges();
}

// API Helper
async function api(url, options = {}) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers
  };
  const res = await fetch('/api' + url, { credentials: 'omit', ...options, headers });
  if (res.status === 401) {
    sessionStorage.clear();
    window.location.href = '/index.html';
    throw new Error('Session expired. Please log in again.');
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Server error');
  }
  return data;
}

// Notification Toast with Duplicate Suppression
let lastToastMsg = '';
let lastToastTime = 0;
function showToast(msg, type = 'info') {
  const now = Date.now();
  // Prevent duplicate toast if same message was shown within 1.5 seconds
  if (msg === lastToastMsg && (now - lastToastTime) < 1500) {
    return;
  }
  lastToastMsg = msg;
  lastToastTime = now;

  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  let borderColor = 'border-l-4 border-blue-500';
  let icon = 'ℹ️';
  if (type === 'success') { borderColor = 'border-l-4 border-green-500'; icon = '✅'; }
  if (type === 'warning') { borderColor = 'border-l-4 border-yellow-500'; icon = '⚠️'; }
  if (type === 'error') { borderColor = 'border-l-4 border-red-500'; icon = '❌'; }

  toast.className = `toast-enter bg-white ${borderColor} shadow-xl rounded-r-lg p-4 mb-2 flex items-center justify-between min-w-[320px] max-w-md z-50 border border-gray-100`;
  toast.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-lg">${icon}</span>
      <div class="text-sm font-medium text-gray-800">${msg}</div>
    </div>
    <button class="text-gray-400 hover:text-gray-600 font-bold ml-3" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentElement) toast.remove(); }, 4000);
}

// Format Currency
function formatMoney(amount) {
  const n = parseFloat(amount) || 0;
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

// Fetch System Settings & Rates on startup
async function initAppData() {
  try {
    const [rateData, settingData, lanData] = await Promise.all([
      api('/gold-rates').catch(() => ({})),
      api('/settings').catch(() => ({ map: {} })),
      api('/settings/lan-info').catch(() => null)
    ]);
    if (rateData) {
      for (const [purity, r] of Object.entries(rateData)) {
        window.latestRates[purity] = r.rate_per_gram;
      }
      updateAllGoldRateBadges();
    }
    if (settingData && settingData.map) {
      window.systemSettings = { ...window.systemSettings, ...settingData.map };
    }
    if (lanData && lanData.lanUrl) {
      window.lanServerUrl = lanData.lanUrl;
    }
  } catch (e) {
    console.error('Init App Data error:', e);
  }
}

// -------------------------------------------------------------------------
// Navigation Configuration
// -------------------------------------------------------------------------
const navItems = {
  ADMIN: [
    { id: 'sell', label: 'POS Billing', icon: '🛒' },
    { id: 'catalog', label: 'Jewellery Showcase', icon: '💎' },
    { id: 'sales', label: 'Sales & Invoices', icon: '🧾' },
    { id: 'jewellery', label: 'Jewellery & Stock', icon: '💍' },
    { id: 'rates', label: 'Gold Rates', icon: '🪙' },
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'suppliers', label: 'Suppliers', icon: '🏭' },
    { id: 'customers', label: 'Customers CRM', icon: '👥' },
    { id: 'returns_exchange', label: 'Returns & Exchange', icon: '🔄' },
    { id: 'expenses', label: 'Expenses', icon: '💰' },
    { id: 'users', label: 'Manage Staff', icon: '👤' },
    { id: 'reports', label: 'Reports', icon: '📈' },
    { id: 'audit', label: 'Audit Logs', icon: '📋' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ],
  OWNER: [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'sell', label: 'POS Billing', icon: '🛒' },
    { id: 'catalog', label: 'Jewellery Showcase', icon: '💎' },
    { id: 'sales', label: 'Sales & Invoices', icon: '🧾' },
    { id: 'jewellery', label: 'Jewellery & Stock', icon: '💍' },
    { id: 'rates', label: 'Gold Rates', icon: '🪙' },
    { id: 'suppliers', label: 'Suppliers', icon: '🏭' },
    { id: 'customers', label: 'Customers CRM', icon: '👥' },
    { id: 'discounts', label: 'Discount Requests', icon: '💸' },
    { id: 'seller_perf', label: 'Seller Performance', icon: '🏆' },
    { id: 'returns_exchange', label: 'Returns & Exchange', icon: '🔄' },
    { id: 'reports', label: 'Reports', icon: '📈' },
    { id: 'audit', label: 'Audit Logs', icon: '📋' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ],
  SELLER: [
    { id: 'sell', label: 'POS Billing', icon: '🛒' },
    { id: 'catalog', label: 'Jewellery Showcase', icon: '💎' },
    { id: 'sales', label: 'My Sales', icon: '🧾' },
    { id: 'jewellery', label: 'Available Jewellery', icon: '💍' },
    { id: 'customers', label: 'Customers', icon: '👥' },
    { id: 'returns_exchange', label: 'Gold Exchange', icon: '🔄' },
    { id: 'dashboard', label: 'Seller Dashboard', icon: '📊' }
  ],
  CASHIER: [
    { id: 'dashboard', label: 'Cash Desk Dashboard', icon: '📊' },
    { id: 'sell', label: 'Cash Billing (POS)', icon: '🛒' },
    { id: 'catalog', label: 'Jewellery Showcase', icon: '💎' },
    { id: 'sales', label: 'Invoices & Receipts', icon: '🧾' },
    { id: 'dues', label: 'Customer Dues', icon: '💰' }
  ]
};

const navItemStyles = {
  dashboard: {
    bg: 'bg-[#3F3F46]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>'
  },
  catalog: {
    bg: 'bg-[#9333EA]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M11 3l-3 6 4 12 4-12-3-6"/><path d="M2 9h20"/></svg>'
  },
  sell: {
    bg: 'bg-[#0284C7]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>'
  },
  jewellery: {
    bg: 'bg-[#D97706]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M11 3l-3 6 4 12 4-12-3-6"/><path d="M2 9h20"/></svg>'
  },
  sales: {
    bg: 'bg-[#0F766E]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
  },
  discounts: {
    bg: 'bg-[#DB2777]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>'
  },
  rates: {
    bg: 'bg-[#4D7C0F]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 6v12M9 9h6M9 15h6"/></svg>'
  },
  purchases: {
    bg: 'bg-[#059669]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/></svg>'
  },
  suppliers: {
    bg: 'bg-[#2563EB]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>'
  },
  customers: {
    bg: 'bg-[#7C3AED]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
  },
  returns_exchange: {
    bg: 'bg-[#0891B2]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>'
  },
  dues: {
    bg: 'bg-[#EA580C]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>'
  },
  expenses: {
    bg: 'bg-[#E11D48]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
  },
  users: {
    bg: 'bg-[#4F46E5]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
  },
  seller_perf: {
    bg: 'bg-[#CA8A04]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34"/><path d="M6 4h12v7a6 6 0 0 1-12 0V4z"/></svg>'
  },
  reports: {
    bg: 'bg-[#C026D3]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
  },
  audit: {
    bg: 'bg-[#52525B]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></svg>'
  },
  settings: {
    bg: 'bg-[#475569]',
    icon: '<svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  }
};

function highlightActiveNavItem(pageId) {
  document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
    const p = el.getAttribute('data-page');
    if (p === pageId) {
      el.classList.add('active-nav-item', 'bg-[#2B2B30]', 'border', 'border-zinc-700/80', 'text-white', 'shadow-sm');
      el.classList.remove('text-zinc-300', 'hover:bg-zinc-800/60');
      const label = el.querySelector('.nav-label');
      if (label) {
        label.classList.add('font-semibold');
        label.classList.remove('font-medium');
      }
    } else {
      el.classList.remove('active-nav-item', 'bg-[#2B2B30]', 'border', 'border-zinc-700/80', 'text-white', 'shadow-sm');
      el.classList.add('text-zinc-300', 'hover:bg-zinc-800/60');
      const label = el.querySelector('.nav-label');
      if (label) {
        label.classList.remove('font-semibold');
        label.classList.add('font-medium');
      }
    }
  });
}
window.highlightActiveNavItem = highlightActiveNavItem;

function applySidebarCollapsedState(isCollapsed) {
  const sidebar = document.getElementById('sidebar');
  const brandName = document.getElementById('sidebarBrandName');
  const brandContainer = document.getElementById('sidebarBrandContainer');
  const collapseBtn = document.getElementById('sidebarCollapseBtn');
  const userDetails = document.getElementById('sidebarUserDetails');
  const logoutBtn = document.getElementById('sidebarLogoutBtn');
  const profileContainer = document.getElementById('sidebarProfileContainer');
  if (!sidebar) return;

  if (isCollapsed) {
    sidebar.classList.remove('md:w-[250px]', 'w-[250px]');
    sidebar.classList.add('md:w-[72px]', 'w-[72px]', 'sidebar-is-collapsed');

    if (brandName) brandName.classList.add('hidden');
    if (brandContainer) brandContainer.classList.add('hidden');
    if (collapseBtn) {
      collapseBtn.classList.add('mx-auto');
      collapseBtn.title = 'Expand Sidebar';
      collapseBtn.innerHTML = `
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
          <path d="M9 9l3 3-3 3"/>
        </svg>
      `;
    }
    if (userDetails) userDetails.classList.add('hidden');
    if (profileContainer) profileContainer.classList.add('justify-center');
    if (logoutBtn) {
      const logoutLabel = logoutBtn.querySelector('.nav-label');
      if (logoutLabel) logoutLabel.classList.add('hidden');
      logoutBtn.title = 'Logout';
      logoutBtn.classList.add('justify-center');
    }
    document.querySelectorAll('.nav-label').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.drag-handle').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
      el.classList.add('justify-center', 'px-1');
      el.classList.remove('px-2.5');
    });
    document.querySelectorAll('.sidebar-tooltip').forEach(el => {
      el.classList.remove('hidden-override');
    });
  } else {
    sidebar.classList.remove('md:w-[72px]', 'w-[72px]', 'sidebar-is-collapsed');
    sidebar.classList.add('md:w-[250px]', 'w-[250px]');

    if (brandName) brandName.classList.remove('hidden');
    if (brandContainer) brandContainer.classList.remove('hidden');
    if (collapseBtn) {
      collapseBtn.classList.remove('mx-auto');
      collapseBtn.title = 'Collapse Sidebar';
      collapseBtn.innerHTML = `
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
          <path d="M15 15l-3-3 3-3"/>
        </svg>
      `;
    }
    if (userDetails) userDetails.classList.remove('hidden');
    if (profileContainer) profileContainer.classList.remove('justify-center');
    if (logoutBtn) {
      const logoutLabel = logoutBtn.querySelector('.nav-label');
      if (logoutLabel) logoutLabel.classList.remove('hidden');
      logoutBtn.removeAttribute('title');
      logoutBtn.classList.remove('justify-center');
    }
    document.querySelectorAll('.nav-label').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('.drag-handle').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
      el.classList.remove('justify-center', 'px-1');
      el.classList.add('px-2.5');
    });
    document.querySelectorAll('.sidebar-tooltip').forEach(el => {
      el.classList.add('hidden-override');
    });
  }
  if (typeof updateMenuNotificationBadges === 'function') {
    updateMenuNotificationBadges();
  }
}
window.applySidebarCollapsedState = applySidebarCollapsedState;

function toggleSidebarCollapse() {
  const isCurrentlyCollapsed = localStorage.getItem('goldflow_sidebar_collapsed') === 'true';
  const newState = !isCurrentlyCollapsed;
  localStorage.setItem('goldflow_sidebar_collapsed', newState ? 'true' : 'false');
  applySidebarCollapsedState(newState);
}
window.toggleSidebarCollapse = toggleSidebarCollapse;

let draggedNavId = null;
let isDraggingNav = false;

function getOrderedNavItems() {
  const baseItems = navItems[user.role] || [];
  try {
    let savedOrder = JSON.parse(localStorage.getItem(`goldflow_menu_order_${user.role}`) || '[]');
    if (Array.isArray(savedOrder) && savedOrder.length > 0) {
      if (user.role === 'OWNER') {
        if (savedOrder.includes('rates')) {
          savedOrder = savedOrder.filter(id => id !== 'rates');
        }
        const jIdx = savedOrder.indexOf('jewellery');
        if (jIdx !== -1) {
          savedOrder.splice(jIdx + 1, 0, 'rates');
        } else {
          savedOrder.push('rates');
        }

        if (baseItems.some(i => i.id === 'suppliers')) {
          if (savedOrder.includes('suppliers')) {
            savedOrder = savedOrder.filter(id => id !== 'suppliers');
          }
          const rIdx = savedOrder.indexOf('rates');
          if (rIdx !== -1) {
            savedOrder.splice(rIdx + 1, 0, 'suppliers');
          } else {
            savedOrder.push('suppliers');
          }
        }

        if (baseItems.some(i => i.id === 'settings')) {
          if (!savedOrder.includes('settings')) {
            savedOrder.push('settings');
          }
        }

        localStorage.setItem(`goldflow_menu_order_${user.role}`, JSON.stringify(savedOrder));
      }
      const ordered = [];
      const itemMap = new Map(baseItems.map(item => [item.id, item]));
      savedOrder.forEach(id => {
        if (itemMap.has(id)) {
          ordered.push(itemMap.get(id));
          itemMap.delete(id);
        }
      });
      // Append any new or remaining items
      itemMap.forEach(item => ordered.push(item));
      if (savedOrder.some(id => !baseItems.some(i => i.id === id))) {
        localStorage.setItem(`goldflow_menu_order_${user.role}`, JSON.stringify(ordered.map(i => i.id)));
      }
      return ordered;
    }
  } catch (e) {
    console.error('Error reading custom menu order:', e);
  }
  return [...baseItems];
}

window.resetMenuOrder = function() {
  localStorage.removeItem(`goldflow_menu_order_${user.role}`);
  renderNav();
  showToast('Menu order reset to default', 'success');
};

function renderNav() {
  const items = getOrderedNavItems();
  const navContainer = document.getElementById('sidebarNav');
  if (!navContainer) return;
  navContainer.innerHTML = '';

  const isCollapsed = localStorage.getItem('goldflow_sidebar_collapsed') === 'true';

  items.forEach((item, index) => {
    const a = document.createElement('a');
    a.href = `#${item.id}`;
    a.setAttribute('data-page', item.id);
    a.setAttribute('data-index', index);
    a.title = item.label;

    const style = navItemStyles[item.id] || {
      bg: 'bg-zinc-700',
      icon: `<span class="text-sm font-bold text-white">${item.icon || '✦'}</span>`
    };

    const paddingClass = isCollapsed ? 'px-1 justify-center' : 'px-2.5';

    // Normal mouse pointer for entire button
    a.className = `nav-item group relative flex items-center gap-2.5 ${paddingClass} py-1.5 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition cursor-pointer border border-transparent select-none`;

    a.innerHTML = `
      <div class="relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${style.bg} pointer-events-none">
        ${style.icon}
      </div>
      <span class="nav-label text-[13px] font-medium tracking-tight truncate flex-1 pointer-events-none ${isCollapsed ? 'hidden' : ''}">${item.label}</span>
      <div class="drag-handle p-1.5 -mr-1 rounded-md text-zinc-200 hover:text-[#D4AF37] hover:bg-zinc-700/80 transition-all cursor-grab active:cursor-grabbing shrink-0 flex items-center justify-center ${isCollapsed ? 'hidden' : ''}" title="Drag up or down to reorder">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="8" cy="5" r="2"/>
          <circle cx="16" cy="5" r="2"/>
          <circle cx="8" cy="12" r="2"/>
          <circle cx="16" cy="12" r="2"/>
          <circle cx="8" cy="19" r="2"/>
          <circle cx="16" cy="19" r="2"/>
        </svg>
      </div>
      <div class="sidebar-tooltip ${isCollapsed ? '' : 'hidden-override'} opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-[64px] bg-[#222227] text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-2xl border border-zinc-700/80 whitespace-nowrap z-50 pointer-events-none">
        ${item.label}
      </div>
    `;

    // Only activate dragging when mouse down is on the drag handle
    const dragBtn = a.querySelector('.drag-handle');
    if (dragBtn) {
      dragBtn.addEventListener('mousedown', () => {
        a.setAttribute('draggable', 'true');
      });
      dragBtn.addEventListener('mouseup', () => {
        if (!isDraggingNav) a.removeAttribute('draggable');
      });
    }

    // Click handler for navigation
    a.onclick = (e) => {
      if (isDraggingNav || (dragBtn && dragBtn.contains(e.target))) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      window.history.pushState(null, '', `#${item.id}`);
      loadPage(item.id, item.label);
    };

    // Drag and Drop event listeners
    a.addEventListener('dragstart', (e) => {
      draggedNavId = item.id;
      isDraggingNav = true;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
      setTimeout(() => {
        a.classList.add('opacity-40', 'bg-amber-500/10', 'border-amber-500/50', 'scale-[0.98]');
      }, 0);
    });

    a.addEventListener('dragend', () => {
      draggedNavId = null;
      a.removeAttribute('draggable');
      setTimeout(() => { isDraggingNav = false; }, 50);
      document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
        el.removeAttribute('draggable');
        el.classList.remove('opacity-40', 'bg-amber-500/10', 'border-amber-500/50', 'scale-[0.98]', 'border-t-2', 'border-b-2', 'border-amber-400');
      });
    });

    a.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!draggedNavId || draggedNavId === item.id) return;

      const rect = a.getBoundingClientRect();
      const offset = e.clientY - rect.top;
      if (offset < rect.height / 2) {
        a.classList.add('border-t-2', 'border-amber-400');
        a.classList.remove('border-b-2');
      } else {
        a.classList.add('border-b-2', 'border-amber-400');
        a.classList.remove('border-t-2');
      }
    });

    a.addEventListener('dragleave', () => {
      a.classList.remove('border-t-2', 'border-b-2', 'border-amber-400');
    });

    a.addEventListener('drop', (e) => {
      e.preventDefault();
      a.classList.remove('border-t-2', 'border-b-2', 'border-amber-400');
      if (!draggedNavId || draggedNavId === item.id) return;

      const currentList = getOrderedNavItems();
      const fromIdx = currentList.findIndex(i => i.id === draggedNavId);
      const toIdx = currentList.findIndex(i => i.id === item.id);

      if (fromIdx !== -1 && toIdx !== -1) {
        const [movedItem] = currentList.splice(fromIdx, 1);
        const rect = a.getBoundingClientRect();
        const offset = e.clientY - rect.top;
        const targetInsert = offset < rect.height / 2 ? toIdx : toIdx + 1;
        const finalInsert = fromIdx < targetInsert ? targetInsert - 1 : targetInsert;
        currentList.splice(finalInsert, 0, movedItem);

        localStorage.setItem(`goldflow_menu_order_${user.role}`, JSON.stringify(currentList.map(i => i.id)));
        renderNav();
        showToast(`Menu reordered: ${movedItem.label}`, 'info');
      }
    });

    navContainer.appendChild(a);
  });

  if (window.currentPageId) {
    highlightActiveNavItem(window.currentPageId);
  }
}

window.menuNotificationCounts = {};

async function fetchMenuBadges() {
  // Notification numbers removed as requested
}
window.fetchMenuBadges = fetchMenuBadges;

function updateMenuNotificationBadges() {
  // Notification numbers removed as requested
}
window.updateMenuNotificationBadges = updateMenuNotificationBadges;

function loadPage(pageId, title) {
  window.currentPageId = pageId;
  highlightActiveNavItem(pageId);
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) pageTitleEl.innerText = title;
  const content = document.getElementById('mainContent');
  if (!content) return;

  content.innerHTML = '<div class="flex justify-center items-center h-64"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-[#D4AF37]"></div></div>';

  setTimeout(() => {
    if (pageId === 'dashboard') renderDashboard(content);
    else if (pageId === 'sell') renderSell(content);
    else if (pageId === 'catalog') renderCatalog(content);
    else if (pageId === 'jewellery') renderJewellery(content);
    else if (pageId === 'sales') renderSales(content);
    else if (pageId === 'discounts') renderDiscounts(content);
    else if (pageId === 'rates') renderRates(content);
    else if (pageId === 'dues') renderDues(content);
    else if (pageId === 'purchases') {
      const fallbackId = (user && user.role === 'SELLER') ? 'sell' : 'dashboard';
      const fallbackTitle = (user && user.role === 'SELLER') ? 'POS Billing' : 'Dashboard';
      window.location.hash = '#' + fallbackId;
      return loadPage(fallbackId, fallbackTitle);
    }
    else if (pageId === 'suppliers') renderSuppliers(content);
    else if (pageId === 'customers') renderCustomers(content);
    else if (pageId === 'returns_exchange') renderReturnsExchange(content);
    else if (pageId === 'expenses') renderExpenses(content);
    else if (pageId === 'users') renderUsers(content);
    else if (pageId === 'seller_perf') renderSellerPerf(content);
    else if (pageId === 'reports') renderReports(content);
    else if (pageId === 'audit') renderAudit(content);
    else if (pageId === 'settings') renderSettings(content);
    else content.innerHTML = `<div class="p-8 bg-white rounded-xl shadow-sm border border-gray-100 text-gray-600">Module '${title}' active.</div>`;
  }, 100);
}

function logout() {
  sessionStorage.clear();
  window.location.href = '/index.html';
}

// -------------------------------------------------------------------------
// Global Search (Code, Barcode, Name, Customer, Invoice)
// -------------------------------------------------------------------------
let searchDebounceTimer = null;
window.handleGlobalSearch = function(query) {
  clearTimeout(searchDebounceTimer);
  if (!query || query.trim().length < 2) {
    const existing = document.getElementById('globalSearchResults');
    if (existing) existing.remove();
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    try {
      const q = encodeURIComponent(query.trim());
      const [items, customers, sales] = await Promise.all([
        api(`/jewellery?search=${q}`).catch(() => []),
        api(`/customers?search=${q}`).catch(() => []),
        api(`/sales`).then(all => all.filter(s => (s.invoice_no && s.invoice_no.toLowerCase().includes(query.toLowerCase())) || String(s.id) === query)).catch(() => [])
      ]);

      let resDiv = document.getElementById('globalSearchResults');
      if (!resDiv) {
        resDiv = document.createElement('div');
        resDiv.id = 'globalSearchResults';
        resDiv.className = 'absolute top-16 right-20 w-96 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 max-h-[80vh] overflow-y-auto p-4 space-y-3';
        document.body.appendChild(resDiv);
      }

      let html = `
        <div class="flex justify-between items-center border-b pb-2">
          <h4 class="font-bold text-gray-800 text-xs uppercase tracking-wider">Search Results ("${query}")</h4>
          <button onclick="document.getElementById('globalSearchResults').remove()" class="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>
      `;

      if (items.length > 0) {
        html += `<div class="text-xs font-bold text-gray-400 uppercase mt-2">Jewellery Items (${items.length})</div><div class="space-y-1">`;
        items.slice(0, 5).forEach(it => {
          html += `
            <div class="p-2 hover:bg-gray-50 rounded flex justify-between items-center cursor-pointer border border-transparent hover:border-gray-200" onclick="document.getElementById('globalSearchResults').remove(); window.quickViewJewellery(${it.id})">
              <div>
                <div class="font-semibold text-sm text-gray-900">${it.name}</div>
                <div class="text-xs text-gray-500">${it.code} | ${it.purity} | ${it.net_weight || it.weight}g</div>
              </div>
              <div class="text-right">
                <div class="font-bold text-sm text-gray-900">${formatMoney(calculateJewelleryEstimatedPrice(it))}</div>
                <span class="text-[10px] px-1.5 py-0.5 rounded ${it.stock > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">Stock: ${it.stock}</span>
              </div>
            </div>
          `;
        });
        html += `</div>`;
      }

      if (customers.length > 0) {
        html += `<div class="text-xs font-bold text-gray-400 uppercase mt-2">Customers (${customers.length})</div><div class="space-y-1">`;
        customers.slice(0, 4).forEach(c => {
          html += `
            <div class="p-2 hover:bg-gray-50 rounded flex justify-between items-center cursor-pointer" onclick="document.getElementById('globalSearchResults').remove(); window.openCustomerProfile(${c.id})">
              <div>
                <div class="font-medium text-sm text-gray-800">${c.name}</div>
                <div class="text-xs text-gray-500">📞 ${c.phone}</div>
              </div>
              <div class="text-xs text-[#D4AF37] font-semibold">View CRM →</div>
            </div>
          `;
        });
        html += `</div>`;
      }

      if (sales.length > 0) {
        html += `<div class="text-xs font-bold text-gray-400 uppercase mt-2">Invoices (${sales.length})</div><div class="space-y-1">`;
        sales.slice(0, 4).forEach(s => {
          html += `
            <div class="p-2 hover:bg-gray-50 rounded flex justify-between items-center cursor-pointer" onclick="document.getElementById('globalSearchResults').remove(); window.printInvoice(${s.id})">
              <div>
                <div class="font-bold text-sm text-gray-800">${s.invoice_no || '#' + s.id}</div>
                <div class="text-xs text-gray-500">${new Date(s.createdAt).toLocaleDateString()}</div>
              </div>
              <div class="text-right">
                <div class="font-bold text-sm text-gray-900">${formatMoney(s.final_amount)}</div>
                <span class="text-xs text-blue-600 font-medium">Print Bill</span>
              </div>
            </div>
          `;
        });
        html += `</div>`;
      }

      if (items.length === 0 && customers.length === 0 && sales.length === 0) {
        html += `<div class="text-center py-6 text-gray-400 text-sm">No matching records found</div>`;
      }

      resDiv.innerHTML = html;
    } catch (e) {
      console.error(e);
    }
  }, 300);
};

// -------------------------------------------------------------------------
// Notifications Center
// -------------------------------------------------------------------------
window.toggleNotifications = async function() {
  const dd = document.getElementById('notifDropdown');
  if (!dd) return;
  const isHidden = dd.classList.contains('hidden');
  if (isHidden) {
    dd.classList.remove('hidden');
    try {
      const notifs = await api('/notifications');
      const listEl = document.getElementById('notifList');
      if (notifs.length === 0) {
        listEl.innerHTML = `<div class="p-4 text-gray-400 text-center text-sm">No new notifications</div>`;
      } else {
        listEl.innerHTML = notifs.map(n => `
          <div class="p-2.5 rounded-lg border-b border-gray-50 hover:bg-gray-50 text-xs">
            <div class="font-semibold text-gray-800">${n.message}</div>
            <div class="text-gray-400 text-[10px] mt-1">${new Date(n.createdAt).toLocaleTimeString()}</div>
          </div>
        `).join('');
      }
      await api('/notifications/read', { method: 'POST' }).catch(() => {});
      const badge = document.getElementById('notifBadge');
      if (badge) badge.classList.add('hidden');
    } catch (e) {
      console.error(e);
    }
  } else {
    dd.classList.add('hidden');
  }
};

// -------------------------------------------------------------------------
// Real-Time Socket.IO Listeners
// -------------------------------------------------------------------------
socket.on('discountRequested', (data) => {
  if (user.role === 'OWNER') {
    showToast(`🔔 Discount Request: ${data.requested_discount_percent}% requested for ${data.invoice_no || 'Sale'} by ${data.seller}`, 'warning');
    if (window.currentPageId === 'discounts') loadPage('discounts', 'Discount Requests');
    if (window.currentPageId === 'dashboard') loadPage('dashboard', 'Dashboard');
  }
  if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
});

socket.on('discountApproved', (data) => {
  if (typeof playNotificationSound === 'function') playNotificationSound('success');
  if (user.role === 'SELLER') {
    showToast(`✅ Owner APPROVED discount for ${data.invoice_no}! You can now complete the bill.`, 'success');
    if (window.currentPageId === 'sales') loadPage('sales', 'My Sales');
  }
  if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
});

socket.on('billApprovedForCashier', (data) => {
  if (typeof playNotificationSound === 'function') playNotificationSound('cash');
  if (user.role === 'CASHIER' || user.role === 'ADMIN' || user.role === 'OWNER') {
    showToast(`💵 Bill Approved for Payment: ${data.invoice_no || data.id} • ${formatMoney(data.final_amount)}`, 'success');
    if (window.currentPageId === 'dashboard') loadPage('dashboard', 'Dashboard');
    if (window.currentPageId === 'sales') loadPage('sales', 'Sales Queue');
  }
  if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
});

socket.on('discountModified', (data) => {
  if (typeof playNotificationSound === 'function') playNotificationSound('success');
  if (user.role === 'SELLER') {
    showToast(`ℹ️ Owner MODIFIED discount to ${data.discount_percent}% for ${data.invoice_no}. Total: ${formatMoney(data.final_amount)}.`, 'warning');
    if (window.currentPageId === 'sales') loadPage('sales', 'My Sales');
  }
  if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
});

socket.on('discountRejected', (data) => {
  if (user.role === 'SELLER') {
    showToast(`❌ Owner REJECTED discount request for ${data.invoice_no}.`, 'error');
    if (window.currentPageId === 'sales') loadPage('sales', 'My Sales');
  }
  if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
});

socket.on('stockUpdated', () => {
  if (window.currentPageId === 'jewellery') loadPage('jewellery', 'Jewellery & Stock');
  if (window.currentPageId === 'sell') refreshAvailableJewellery();
  if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
});

socket.on('salesUpdated', (data) => {
  if (window.currentPageId === 'sales') {
    loadPage('sales', user.role === 'SELLER' ? 'My Sales' : 'Sales & Invoices');
  }
  if (window.currentPageId === 'dashboard') {
    loadPage('dashboard', user.role === 'SELLER' ? 'Seller Dashboard' : (user.role === 'CASHIER' ? 'Cash Desk Dashboard' : 'Dashboard'));
  }
  if (data && data.status === 'CANCELLED') {
    showToast(`Bill ${data.invoice_no} was CANCELLED and stock restored!`, 'warning');
  }
  if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
});

socket.on('lowStock', (alert) => {
  if (user.role === 'ADMIN' || user.role === 'OWNER') {
    showToast(`⚠️ Stock Alert: ${alert.item} is ${alert.status} (Units: ${alert.stock})`, 'warning');
  }
  if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
});

socket.on('newSale', () => {
  if (window.currentPageId === 'sales') loadPage('sales', 'Sales & Invoices');
  if (window.currentPageId === 'dashboard') loadPage('dashboard', 'Dashboard');
  if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
});

socket.on('goldRateUpdated', (rates) => {
  const r22 = (rates || []).find(r => r.purity === '22K');
  const msg = r22 
    ? `🪙 Live Gold Rate Updated! 22K (916): ₹${r22.rate_per_gram.toLocaleString()}/g`
    : '🪙 Gold & Silver benchmark rates updated!';
  showToast(msg, 'info');
  for (const r of (rates || [])) {
    window.latestRates[r.purity] = r.rate_per_gram;
  }
  updateAllGoldRateBadges();
  if (window.currentPageId === 'rates') loadPage('rates', 'Gold Rates');
  if (window.currentPageId === 'sell') {
    if (typeof calculateCartTotals === 'function') calculateCartTotals();
    renderCart();
  }
});

// -------------------------------------------------------------------------
// 1. DASHBOARD MODULE (Role Specific: ADMIN, OWNER, SELLER)
// -------------------------------------------------------------------------
async function renderDashboard(container) {
  try {
    const stats = await api('/dashboard/stats');
    
    // ADMIN DASHBOARD
    if (user.role === 'ADMIN') {
      container.innerHTML = `
        <div class="space-y-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Jewellery</div>
                <div class="text-2xl font-black text-gray-900 mt-1">${stats.totalJewellery} items</div>
                <div class="text-xs text-gray-400 mt-1">Units in Stock: ${stats.availableStock}</div>
              </div>
              <div class="w-12 h-12 bg-amber-50 text-[#D4AF37] rounded-xl flex items-center justify-center text-2xl font-bold">💍</div>
            </div>

            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock Valuation</div>
                <div class="text-2xl font-black text-gray-900 mt-1">${formatMoney(stats.stockValue)}</div>
                <div class="text-xs text-green-600 font-semibold mt-1">Live Inventory Worth</div>
              </div>
              <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-2xl font-bold">💎</div>
            </div>

            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Today's Sales</div>
                <div class="text-2xl font-black text-gray-900 mt-1">${formatMoney(stats.todaySalesRevenue)}</div>
                <div class="text-xs text-gray-500 mt-1">${stats.todaySalesCount} completed bills</div>
              </div>
              <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-2xl font-bold">🧾</div>
            </div>

            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inventory Alerts</div>
                <div class="text-2xl font-black ${stats.lowStock + stats.outOfStock > 0 ? 'text-red-600' : 'text-gray-900'} mt-1">${stats.lowStock + stats.outOfStock}</div>
                <div class="text-xs text-gray-500 mt-1">${stats.lowStock} Low Stock | ${stats.outOfStock} Out</div>
              </div>
              <div class="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center text-2xl font-bold">⚠️</div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 class="font-bold text-gray-800 text-base mb-4">Weekly Sales Performance</h3>
              <div class="h-64"><canvas id="salesOverviewChart"></canvas></div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 class="font-bold text-gray-800 text-base mb-4">Stock Breakdown</h3>
              <div class="h-64"><canvas id="categoryChart"></canvas></div>
            </div>
          </div>

          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div class="flex justify-between items-center mb-4">
              <h3 class="font-bold text-gray-800 text-base">Recent Audit & System Activities</h3>
              <button onclick="loadPage('audit', 'Audit Logs')" class="text-xs text-[#D4AF37] font-bold hover:underline">View All Logs →</button>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-gray-50 border-b text-gray-500 uppercase">
                    <th class="p-3">Time</th>
                    <th class="p-3">User</th>
                    <th class="p-3">Module</th>
                    <th class="p-3">Action</th>
                    <th class="p-3">Details</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  ${(stats.recentActivity || []).slice(0, 6).map(a => `
                    <tr>
                      <td class="p-3 text-gray-500">${new Date(a.createdAt).toLocaleTimeString()}</td>
                      <td class="p-3 font-semibold text-gray-800">${a.User ? a.User.name : 'System'}</td>
                      <td class="p-3"><span class="px-2 py-0.5 rounded bg-gray-100 font-mono text-[10px]">${a.module}</span></td>
                      <td class="p-3 font-bold text-gray-700">${a.action}</td>
                      <td class="p-3 text-gray-600 truncate max-w-xs">${a.details || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      setTimeout(() => {
        new Chart(document.getElementById('salesOverviewChart'), {
          type: 'line',
          data: {
            labels: stats.salesOverview.labels,
            datasets: [{
              label: 'Sales (₹)',
              data: stats.salesOverview.data,
              borderColor: '#D4AF37',
              backgroundColor: 'rgba(212, 175, 55, 0.1)',
              fill: true,
              tension: 0.3
            }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });

        new Chart(document.getElementById('categoryChart'), {
          type: 'doughnut',
          data: {
            labels: stats.categoryDistribution.labels,
            datasets: [{
              data: stats.categoryDistribution.data,
              backgroundColor: ['#D4AF37', '#1F2937', '#4EA685', '#60A5FA', '#F59E0B', '#EC4899', '#8B5CF6']
            }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }, 50);
      return;
    }

    // OWNER DASHBOARD
    if (user.role === 'OWNER') {
      container.innerHTML = `
        <div class="space-y-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div class="text-xs font-semibold text-gray-500 uppercase">Today's Revenue</div>
              <div class="text-2xl font-black text-gray-900 mt-1">${formatMoney(stats.todaySalesRevenue)}</div>
              <div class="text-xs text-gray-500 mt-1">${stats.todaySalesCount} completed orders</div>
            </div>

            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div class="text-xs font-semibold text-gray-500 uppercase">Monthly Revenue</div>
              <div class="text-2xl font-black text-emerald-600 mt-1">${formatMoney(stats.monthlySalesRevenue)}</div>
              <div class="text-xs text-gray-500 mt-1">Est. Profit: ${formatMoney(stats.monthlyProfit)}</div>
            </div>

            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:border-[#D4AF37] transition" onclick="loadPage('discounts', 'Discount Requests')">
              <div class="text-xs font-semibold text-gray-500 uppercase">Pending Discounts</div>
              <div class="text-2xl font-black ${stats.pendingDiscountsCount > 0 ? 'text-amber-500 animate-pulse' : 'text-gray-900'} mt-1">${stats.pendingDiscountsCount} Requests</div>
              <div class="text-xs text-blue-600 font-bold mt-1">Click to Review →</div>
            </div>

            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div class="text-xs font-semibold text-gray-500 uppercase">Total Outstanding Due</div>
              <div class="text-2xl font-black text-red-600 mt-1">${formatMoney(stats.totalOutstanding)}</div>
              <div class="text-xs text-gray-500 mt-1">Customer Credit Receivables</div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div class="flex justify-between items-center mb-4">
                <h3 class="font-bold text-gray-800 text-base">Top Performing Sellers</h3>
                <button onclick="loadPage('seller_perf', 'Seller Performance')" class="text-xs text-[#D4AF37] font-bold">View Comparison →</button>
              </div>
              <div class="space-y-4">
                ${(stats.sellerPerformance || []).map(s => `
                  <div class="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                    <div class="flex items-center gap-3">
                      <div class="w-9 h-9 rounded-full bg-gray-800 text-white font-bold flex items-center justify-center text-sm">${s.name.charAt(0)}</div>
                      <div>
                        <div class="font-semibold text-sm text-gray-900">${s.name}</div>
                        <div class="text-xs text-gray-500">${s.orders} completed sales</div>
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="font-bold text-sm text-gray-900">${formatMoney(s.revenue)}</div>
                      <div class="text-[10px] text-green-600 font-semibold">Active Seller</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 class="font-bold text-gray-800 text-base mb-4">Top Selling Jewellery</h3>
              <div class="space-y-3">
                ${(stats.topJewellery || []).map((tj, idx) => `
                  <div class="flex justify-between items-center text-sm p-2 rounded hover:bg-gray-50">
                    <div class="flex items-center gap-2">
                      <span class="w-6 h-6 rounded-full bg-amber-100 text-[#D4AF37] font-bold flex items-center justify-center text-xs">#${idx+1}</span>
                      <span class="font-medium text-gray-800 truncate max-w-[130px]">${tj.name}</span>
                    </div>
                    <span class="font-bold text-gray-900">${tj.count} sold</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // SELLER DASHBOARD
    if (user.role === 'SELLER') {
      container.innerHTML = `
        <div class="space-y-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div class="text-xs font-semibold text-gray-500 uppercase">My Today's Sales</div>
              <div class="text-2xl font-black text-gray-900 mt-1">${formatMoney(stats.todaySalesRevenue)}</div>
              <div class="text-xs text-gray-500 mt-1">${stats.todayOrdersCount} completed bills</div>
            </div>

            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 cursor-pointer" onclick="loadPage('sell', 'POS Billing')">
              <div class="text-xs font-semibold text-gray-500 uppercase">Start New Bill</div>
              <div class="text-2xl font-black text-[#D4AF37] mt-1">POS Billing</div>
              <div class="text-xs text-blue-600 font-semibold mt-1">Barcode & Fast Counter →</div>
            </div>

            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div class="text-xs font-semibold text-gray-500 uppercase">Pending Approvals</div>
              <div class="text-2xl font-black text-amber-500 mt-1">${stats.pendingDiscountsCount}</div>
              <div class="text-xs text-gray-500 mt-1">Waiting for Owner</div>
            </div>

            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div class="text-xs font-semibold text-gray-500 uppercase">Approved Bills (Ready)</div>
              <div class="text-2xl font-black text-green-600 mt-1">${stats.approvedDiscountsCount}</div>
              <div class="text-xs text-green-600 font-semibold mt-1">Ready to complete</div>
            </div>
          </div>

          <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div class="flex justify-between items-center mb-4">
              <h3 class="font-bold text-gray-800 text-base">My Recent Sales</h3>
              <button onclick="loadPage('sales', 'My Sales')" class="text-xs text-[#D4AF37] font-bold">View Full History →</button>
            </div>
            <div class="space-y-2">
              ${(stats.recentSales || []).map(s => `
                <div class="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div>
                    <div class="font-bold text-sm text-gray-900">${s.invoice_no || '#' + s.id}</div>
                    <div class="text-xs text-gray-500">Customer: ${s.Customer ? s.Customer.name : 'Walk-in'} | ${new Date(s.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="font-black text-sm text-gray-900">${formatMoney(s.final_amount)}</span>
                    <button onclick="printInvoice(${s.id})" class="text-xs btn-gold px-3 py-1.5 rounded font-medium">Invoice</button>
                    <button onclick="deleteSingleSale(${s.id}, '${s.invoice_no || '#' + s.id}')" class="text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2.5 py-1.5 rounded font-bold transition flex items-center gap-1" title="Delete Sale"><span>🗑️</span> Delete</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    // CASHIER DASHBOARD (Cash Desk Summary)
    if (user.role === 'CASHIER') {
      container.innerHTML = `
        <div class="space-y-6">
          <!-- Cashier Welcome Banner -->
          <div class="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 rounded-2xl p-6 text-white shadow-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-2xl">💵</span>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/20 text-white backdrop-blur-sm">Cash Counter & Billing Desk</span>
              </div>
              <h2 class="text-xl sm:text-2xl font-black">Welcome, ${user.name || 'Store Cashier'}</h2>
              <p class="text-xs text-amber-100 mt-1">Live Cash Register, Instant Bill Completion, & Due Recovery</p>
            </div>
            <div class="flex gap-2.5">
              <button onclick="loadPage('sell', 'Cash Billing (POS)')" class="px-5 py-2.5 bg-white text-amber-900 hover:bg-amber-50 rounded-xl font-black text-xs shadow-md transition flex items-center gap-2">
                <span>🛒</span> Open Cash POS Terminal
              </button>
            </div>
          </div>

          <!-- Cash Drawer & Collections Metric Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <div class="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Today's Total Sales</div>
                <div class="text-2xl font-black text-gray-900 mt-1">${formatMoney(stats.todaySalesRevenue || 0)}</div>
                <div class="text-xs text-green-600 font-semibold mt-1">${stats.todaySalesCount || 0} Bills Completed</div>
              </div>
              <div class="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center text-2xl font-bold">🧾</div>
            </div>

            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <div class="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Cash Drawer (Cash Only)</div>
                <div class="text-2xl font-black text-emerald-600 mt-1">${formatMoney(stats.todayCashCollected || 0)}</div>
                <div class="text-xs text-gray-400 mt-1">Cash in hand</div>
              </div>
              <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-2xl font-bold">💵</div>
            </div>

            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <div class="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Digital (UPI / Card)</div>
                <div class="text-2xl font-black text-blue-600 mt-1">${formatMoney(stats.todayDigitalCollected || 0)}</div>
                <div class="text-xs text-gray-400 mt-1">Bank settlements</div>
              </div>
              <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-2xl font-bold">💳</div>
            </div>

            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <div class="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Approved Bills to Collect</div>
                <div class="text-2xl font-black ${stats.readyToCompleteBillsCount > 0 ? 'text-amber-600' : 'text-gray-900'} mt-1">${stats.readyToCompleteBillsCount || 0}</div>
                <div class="text-xs text-amber-600 font-semibold mt-1">Ready for payment</div>
              </div>
              <div class="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-2xl font-bold">⏳</div>
            </div>
          </div>

          <!-- Quick Navigation Actions -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-200/80 hover:border-amber-400 transition cursor-pointer flex items-center gap-4 group" onclick="loadPage('sell', 'Cash Billing (POS)')">
              <div class="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center text-2xl shadow">🛒</div>
              <div>
                <h4 class="font-bold text-sm text-gray-900 group-hover:text-amber-700 transition">Cash POS Billing</h4>
                <p class="text-xs text-gray-400 mt-0.5">Quick barcode checkout & cash entry</p>
              </div>
            </div>

            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-200/80 hover:border-amber-400 transition cursor-pointer flex items-center gap-4 group" onclick="loadPage('sales', 'Invoices & Receipts')">
              <div class="w-12 h-12 rounded-xl bg-teal-600 text-white flex items-center justify-center text-2xl shadow">🧾</div>
              <div>
                <h4 class="font-bold text-sm text-gray-900 group-hover:text-teal-700 transition">Invoices & Receipts</h4>
                <p class="text-xs text-gray-400 mt-0.5">Print bills & complete approved sales</p>
              </div>
            </div>

            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-200/80 hover:border-amber-400 transition cursor-pointer flex items-center gap-4 group" onclick="loadPage('dues', 'Customer Dues')">
              <div class="w-12 h-12 rounded-xl bg-orange-600 text-white flex items-center justify-center text-2xl shadow">💰</div>
              <div>
                <h4 class="font-bold text-sm text-gray-900 group-hover:text-orange-700 transition">Customer Due Recovery</h4>
                <p class="text-xs text-gray-400 mt-0.5">Collect balance payments & credit</p>
              </div>
            </div>
          </div>

          <!-- Today's Recent Sales & Cash Receipts -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="p-5 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 class="font-bold text-gray-900 text-sm">Recent Counter Invoices & Bills</h3>
                <p class="text-xs text-gray-400 mt-0.5">Today's transactions handled at counter</p>
              </div>
              <button onclick="loadPage('sales', 'Invoices & Receipts')" class="text-xs font-bold text-amber-600 hover:text-amber-800 transition">
                View All Bills →
              </button>
            </div>
            <div class="divide-y divide-gray-100">
              ${(!stats.recentSales || stats.recentSales.length === 0) 
                ? '<div class="p-8 text-center text-gray-400 text-xs">No transactions recorded yet today. Click "Open Cash POS Terminal" to start billing!</div>' 
                : stats.recentSales.map(s => `
                <div class="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-gray-50/80 transition">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-mono font-bold text-xs text-gray-900">${s.invoice_no || '#' + s.id}</span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.payment_status === 'PAID' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">${s.payment_status || 'PAID'}</span>
                      <span class="text-[11px] text-gray-400 font-mono">(${s.payment_method || 'CASH'})</span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                      Customer: <b class="text-gray-800">${s.Customer ? s.Customer.name : 'Walk-in'}</b> 
                      ${s.Seller ? `• Staff: <span class="text-gray-600">${s.Seller.name}</span>` : ''} 
                      • Time: ${new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div class="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <span class="font-black text-sm text-gray-900">${formatMoney(s.final_amount)}</span>
                    <button onclick="printInvoice(${s.id})" class="btn-gold px-3 py-1.5 rounded-lg text-xs font-bold shadow flex items-center gap-1">
                      <span>🖨️</span> Print Bill
                    </button>
                    <button onclick="deleteSingleSale(${s.id}, '${s.invoice_no || '#' + s.id}')" class="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded-lg text-xs transition flex items-center gap-1" title="Delete Sale">
                      <span>🗑️</span> Delete
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      return;
    }
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading dashboard: ${e.message}</div>`;
  }
}

// -------------------------------------------------------------------------
// 2. PROFESSIONAL POS BILLING SCREEN (Barcode, Pricing Engine, Split Payment)
// -------------------------------------------------------------------------
window.currentCart = [];
window.selectedCustomer = null;
window.posPaymentMethod = 'CASH';
window.posSplitPayments = [];

async function renderSell(container) {
  try {
    const [allItems, customers] = await Promise.all([
      api('/jewellery'),
      api('/customers').catch(() => [])
    ]);

    // Include AVAILABLE and LOW_STOCK items (any item with stock > 0 or AVAILABLE)
    const items = (allItems || []).filter(i => (i.stock > 0 || i.status === 'AVAILABLE' || i.status === 'LOW_STOCK') && i.status !== 'INACTIVE');

    window.jewelleryItems = items;
    window.allCustomers = customers;

    container.innerHTML = `
      <div class="flex flex-col h-[calc(100vh-115px)] bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden" id="posBillingDeskContainer">
        
        <!-- 1. Top Executive POS Action & Scanner Bar -->
        <div class="p-3.5 border-b border-gray-200 bg-gray-50/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          <!-- Left: Barcode Scanner & Showcase Button -->
          <div class="flex items-center gap-2 flex-1 min-w-[320px] max-w-xl">
            <div class="relative flex-1">
              <span class="absolute left-3.5 top-2.5 text-gray-400 text-sm">🏷️</span>
              <input type="text" id="barcodeScannerInput" placeholder="Scan Jewellery Barcode or Enter Product Code..." 
                autocomplete="off" autocorrect="off" spellcheck="false"
                class="w-full pl-10 pr-28 py-2 bg-white border-2 border-gray-300 focus:border-[#D4AF37] rounded-xl text-xs font-mono font-bold outline-none shadow-xs transition text-gray-900">
              <div class="absolute right-2 top-1.5 flex items-center gap-1 pointer-events-none">
                <span id="barcodeScannerStatusBadge" class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-xs">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span> <span>Ready</span>
                </span>
              </div>
            </div>
            <button type="button" onclick="openPosCatalogModal()" class="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs shrink-0" title="Browse Catalogue to Pick Items">
              <span>💎</span> Showcase
            </button>
          </div>

          <!-- Center: Customer Search & Selector -->
          <div class="flex items-center gap-2 min-w-[280px]">
            <div class="relative flex-1">
              <input type="text" id="posCustomerSearch" placeholder="🔍 Search Customer by Name / Mobile..." 
                class="w-full pl-3 pr-2 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:border-[#D4AF37] bg-white shadow-xs"
                oninput="handlePosCustomerSearch(this.value)">
              <div id="posCustomerDropdown" class="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-2xl z-40 max-h-56 overflow-y-auto hidden mt-1"></div>
            </div>
            <button onclick="openQuickAddCustomerModal()" class="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-xl text-xs shrink-0 flex items-center gap-1 shadow-xs" title="Add New Customer">
              <span>+</span> New
            </button>
          </div>

          <!-- Right: Customer Tag, Invoice Ref & Clear Bill -->
          <div class="flex items-center gap-2 shrink-0">
            <div id="posSelectedCustomerDisplay" class="bg-amber-50/80 border border-amber-200 rounded-xl px-3 py-1.5 text-xs flex items-center gap-2 shadow-xs">
              <span class="text-amber-800">👤</span>
              <div class="truncate max-w-[140px]">
                <span class="font-bold text-gray-900 text-xs" id="posCustNameLabel">Walk-in Customer</span>
                <span class="text-gray-500 text-[10px] ml-1" id="posCustPhoneLabel">(Default)</span>
              </div>
            </div>
            <div class="hidden lg:flex items-center gap-1.5 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-xl text-xs font-mono text-gray-600">
              <span class="text-gray-400">🧾</span>
              <span>${window.systemSettings.invoice_prefix || 'GF'}-${new Date().getFullYear()}-AUTO</span>
            </div>
            <button onclick="clearPosCart()" class="text-xs text-red-600 hover:text-red-700 font-bold px-3 py-1.5 rounded-xl hover:bg-red-50 border border-transparent hover:border-red-200 transition flex items-center gap-1">
              <span>✕</span> Clear Bill
            </button>
          </div>
        </div>

        <!-- 2. Spacious Center: Full-Width Billing Desk Table -->
        <div class="flex-1 overflow-y-auto" id="posCartItemsList">
          <!-- Populated by renderPosCartTable() -->
        </div>

        <!-- 3. Bottom Executive Financial Dock & Checkout -->
        <div class="border-t border-gray-200 bg-gray-50/95 p-3.5 space-y-2.5 shrink-0">
          <!-- Row A: 6 High-Contrast Stat Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
            <div class="bg-white p-2 rounded-xl border border-gray-200 shadow-xs">
              <span class="text-[10px] text-gray-500 uppercase font-bold block">Total Net Gold Wt</span>
              <span class="font-mono font-black text-amber-950 text-sm mt-0.5 block" id="posTotalNetWeightDisplay">0.000 g</span>
            </div>
            <div class="bg-white p-2 rounded-xl border border-gray-200 shadow-xs">
              <span class="text-[10px] text-gray-500 uppercase font-bold block">Pure Gold Value</span>
              <span class="font-mono font-black text-gray-900 text-sm mt-0.5 block" id="posGoldValTotal">₹0.00</span>
            </div>
            <div class="bg-white p-2 rounded-xl border border-gray-200 shadow-xs">
              <span class="text-[10px] text-gray-500 uppercase font-bold block">Making & Wastage</span>
              <span class="font-mono font-bold text-gray-800 text-sm mt-0.5 block" id="posMakingWastageTotal">₹0.00</span>
            </div>
            <div class="bg-white p-2 rounded-xl border border-gray-200 shadow-xs">
              <span class="text-[10px] text-gray-500 uppercase font-bold block">Stone Charges</span>
              <span class="font-mono font-bold text-gray-800 text-sm mt-0.5 block" id="posStoneTotal">₹0.00</span>
            </div>
            <!-- Discount Control -->
            <div class="bg-white p-2 rounded-xl border border-gray-200 shadow-xs flex flex-col justify-between">
              <div class="flex justify-between items-center">
                <span class="text-[10px] text-gray-500 uppercase font-bold">Discount %</span>
                <span class="font-mono font-bold text-red-600 text-xs" id="posDiscountAmountDisplay">-₹0.00</span>
              </div>
              <div class="flex items-center gap-1 mt-0.5">
                <input type="number" id="posGlobalDiscountInput" min="0" max="100" step="0.5" placeholder="0" 
                  class="w-full bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-[#D4AF37]"
                  oninput="updatePosCalculations()">
                <span class="text-[11px] font-bold text-gray-400">%</span>
              </div>
            </div>
            <!-- Tax Card -->
            <div class="bg-white p-2 rounded-xl border border-gray-200 shadow-xs">
              <span class="text-[10px] text-gray-500 uppercase font-bold block" id="posTaxLabel">GST Tax (${getCurrentGstPercent()}%):</span>
              <span class="font-mono font-bold text-gray-900 text-sm mt-0.5 block" id="posTaxDisplay">₹0.00</span>
            </div>
          </div>

          <!-- Row B: Payment Modes & Net Payable Checkout -->
          <div class="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-gray-200/80">
            <!-- Payment Methods -->
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-gray-600 mr-1 hidden sm:inline">Payment:</span>
              <button type="button" onclick="setPosPaymentMethod('CASH')" id="pmBtn_CASH" class="pos-pm-btn px-3 py-1.5 rounded-lg border border-[#D4AF37] bg-amber-50 font-bold text-xs text-gray-900 transition">Cash</button>
              <button type="button" onclick="setPosPaymentMethod('UPI')" id="pmBtn_UPI" class="pos-pm-btn px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-medium text-xs text-gray-700 hover:bg-gray-50 transition">UPI</button>
              <button type="button" onclick="setPosPaymentMethod('CARD')" id="pmBtn_CARD" class="pos-pm-btn px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-medium text-xs text-gray-700 hover:bg-gray-50 transition">Card</button>
              <button type="button" onclick="openSplitPaymentModal()" id="pmBtn_SPLIT" class="pos-pm-btn px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-medium text-xs text-gray-700 hover:bg-gray-50 transition">Split</button>
            </div>

            <!-- Grand Total / Net Payable -->
            <div class="flex items-baseline gap-2 bg-amber-50/80 border border-amber-200/90 px-4 py-1.5 rounded-xl">
              <span class="font-bold text-gray-700 text-xs uppercase tracking-wider">Net Payable:</span>
              <span class="font-black text-[#D4AF37] text-xl font-mono" id="posNetPayableDisplay">₹0.00</span>
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center gap-2">
              <button type="button" onclick="printPosEstimate('thermal')" class="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition flex items-center gap-1 shadow-md shadow-amber-500/20 active:scale-95" title="Print Slip (Universal for All Printers: TVS, RP3160, Epson, etc.)">
                🧾 Print Slip
              </button>
              ${user.role === 'SELLER' ? '' : `<button type="button" onclick="printPosEstimate('a4')" class="px-3.5 py-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border border-yellow-300 font-bold rounded-xl text-xs transition flex items-center gap-1 shadow-xs" title="Print Luxury A4 PDF">
                📄 A4 PDF
              </button>`}
              <button type="button" id="btnProcessPosSale" onclick="processPosCheckout()" class="btn-gold px-5 py-2 rounded-xl text-xs font-black shadow hover:shadow-lg transition flex items-center gap-1.5">
                <span>✓</span> Complete Sale & Bill
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Focus barcode scanner input automatically
    setTimeout(() => {
      const bInput = document.getElementById('barcodeScannerInput');
      if (bInput) bInput.focus();
    }, 150);

    // Initialize global barcode scanner listener for hardware USB/Bluetooth readers
    initPosGlobalBarcodeScanner();

    // Auto re-focus scanner input when clicking empty space or table background
    const deskContainer = document.getElementById('posBillingDeskContainer');
    if (deskContainer) {
      deskContainer.addEventListener('click', (e) => {
        if (e.target.closest('button, input, select, textarea, [onclick], .cursor-pointer')) return;
        const bInput = document.getElementById('barcodeScannerInput');
        if (bInput && document.activeElement !== bInput) bInput.focus();
      });
    }

    renderPosCartTable();
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading POS: ${e.message}</div>`;
  }
}

// -------------------------------------------------------------------------
// HARDWARE BARCODE SCANNER ENGINE & AUDIO FEEDBACK
// -------------------------------------------------------------------------
function playPosBarcodeSound(isSuccess = true) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (isSuccess) {
      // Crisp POS supermarket chime (1800Hz)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else {
      // Low dual warning buzzer
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch(e){}
}

let posGlobalBarcodeBuffer = '';
let posLastKeyTime = 0;
let posBarcodeTimer = null;

function initPosGlobalBarcodeScanner() {
  if (window._posScannerListenerAttached) return;
  window._posScannerListenerAttached = true;

  window.addEventListener('keydown', (e) => {
    // Only capture when user is on the POS Sell screen
    if (window.location.hash !== '#sell') return;

    const activeEl = document.activeElement;
    const activeTag = activeEl ? activeEl.tagName.toLowerCase() : '';
    const activeId = activeEl ? activeEl.id : '';
    const isBarcodeInput = activeId === 'barcodeScannerInput';
    const isOtherInput = (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') && !isBarcodeInput;

    const now = Date.now();
    const timeSinceLastKey = now - posLastKeyTime;
    posLastKeyTime = now;

    // Fast keystrokes (< 50ms) are typical of hardware barcode scanners
    const isRapidKey = timeSinceLastKey < 50;

    // If scanner emits Enter or Tab (common barcode terminators)
    if (e.key === 'Enter' || e.keyCode === 13 || e.key === 'Tab' || e.keyCode === 9) {
      clearTimeout(posBarcodeTimer);
      const bInput = document.getElementById('barcodeScannerInput');
      const valFromInput = bInput ? bInput.value.trim() : '';
      const valFromBuffer = posGlobalBarcodeBuffer.trim();
      const codeToScan = valFromInput || valFromBuffer;

      posGlobalBarcodeBuffer = '';
      if (bInput) bInput.value = '';

      if (codeToScan && (!isOtherInput || isRapidKey || isBarcodeInput)) {
        e.preventDefault();
        e.stopPropagation();
        window.handleBarcodeScan(codeToScan);
        return;
      }
      return;
    }

    // Capture printable characters
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (isOtherInput && !isRapidKey) {
        // User is manually typing in customer search or modal, don't capture
        posGlobalBarcodeBuffer = '';
        return;
      }

      // Reset buffer if delay indicates human typing outside any input
      if (timeSinceLastKey > 150 && !isBarcodeInput) {
        posGlobalBarcodeBuffer = '';
      }

      posGlobalBarcodeBuffer += e.key;

      const bInput = document.getElementById('barcodeScannerInput');
      if (bInput && !isOtherInput && document.activeElement !== bInput) {
        bInput.value = posGlobalBarcodeBuffer;
      }

      // Fallback debounce in case scanner does NOT send Enter/Tab terminator
      clearTimeout(posBarcodeTimer);
      posBarcodeTimer = setTimeout(() => {
        if (posGlobalBarcodeBuffer.length >= 3 && isRapidKey) {
          const codeToScan = posGlobalBarcodeBuffer.trim();
          posGlobalBarcodeBuffer = '';
          if (bInput) bInput.value = '';
          window.handleBarcodeScan(codeToScan);
        }
      }, 120);
    }
  });
}

// -------------------------------------------------------------------------
// DEDICATED JEWELLERY SHOWCASE & LIVE CATALOG SECTION (#catalog)
// -------------------------------------------------------------------------
window.catalogFilterState = {
  category: 'ALL',
  searchQuery: '',
  sortBy: 'DEFAULT'
};

async function renderCatalog(container) {
  try {
    const [items, rates] = await Promise.all([
      api('/jewellery'),
      api('/gold-rates').catch(() => ({}))
    ]);

    window.jewelleryItems = (items || []).filter(i => i.status !== 'INACTIVE');
    window.latestRates = rates || window.latestRates || {};

    const categories = ['ALL', 'Gold', 'Silver', 'Necklace', 'Ring', 'Chain', 'Bangle', 'Earrings', 'Bracelet', 'Coin'];

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Showcase Header -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
          <div>
            <div class="flex items-center gap-2.5">
              <span class="text-2xl">💎</span>
              <h2 class="text-xl font-bold text-gray-900">Jewellery Showcase & Live Catalog</h2>
              <span class="bg-purple-100 text-purple-900 text-xs font-bold px-2.5 py-0.5 rounded-full border border-purple-200">Showroom View</span>
            </div>
            <p class="text-xs text-gray-500 mt-1">Browse premium jewellery designs, inspect gold weights & purities, print barcode tags, or add directly to POS Billing Desk.</p>
          </div>
          <div class="flex items-center gap-2.5">
            <button onclick="window.location.hash='#sell'; loadPage('sell', 'POS Billing')" class="btn-gold px-4 py-2.5 rounded-xl text-xs font-bold shadow flex items-center gap-2 transition hover:shadow-md">
              <span>🛒</span> Go to POS Billing Desk (<span id="showcaseCartBadge">${window.currentCart ? window.currentCart.length : 0}</span>)
            </button>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 space-y-3">
          <!-- Top Row: Search & Sort -->
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="relative flex-1 min-w-[260px] max-w-md">
              <span class="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
              <input type="text" id="catalogSearchInput" placeholder="Search by jewellery name, design, code, or barcode..." 
                value="${window.catalogFilterState.searchQuery || ''}"
                oninput="handleCatalogSearch(this.value)"
                class="w-full pl-9 pr-3 py-2 border border-gray-300 focus:border-[#D4AF37] rounded-xl text-xs outline-none bg-gray-50/50 focus:bg-white transition shadow-xs">
            </div>

            <div class="flex items-center gap-3 text-xs">
              <div class="flex items-center gap-1.5">
                <span class="text-gray-500 font-semibold">Sort by:</span>
                <select id="catalogSortSelect" onchange="handleCatalogSort(this.value)" class="border border-gray-300 rounded-xl px-2.5 py-1.5 outline-none bg-white text-xs font-medium focus:border-[#D4AF37]">
                  <option value="DEFAULT">Featured / Newest</option>
                  <option value="PRICE_ASC">Price: Low to High</option>
                  <option value="PRICE_DESC">Price: High to Low</option>
                  <option value="WEIGHT_ASC">Weight: Low to High</option>
                  <option value="WEIGHT_DESC">Weight: High to Low</option>
                  <option value="NAME_ASC">Name (A - Z)</option>
                </select>
              </div>

              <span class="text-gray-300">|</span>
              <span class="text-gray-600 font-bold" id="catalogCountDisplay">${window.jewelleryItems.length} items</span>
            </div>
          </div>

          <!-- Bottom Row: Category Pills -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            ${categories.map(cat => `
              <button onclick="handleCatalogCategorySelect('${cat}')" 
                id="catPill_${cat}" 
                class="catalog-pill px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${window.catalogFilterState.category === cat ? 'bg-gray-900 text-white shadow-xs' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">
                ${cat === 'ALL' ? '✨ All Designs' : cat}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Product Cards Showcase Grid -->
        <div id="catalogGridContainer" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
          ${renderShowcaseCardsHtml(getFilteredCatalogItems())}
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading Showcase: ${e.message}</div>`;
  }
}

function renderShowcaseCardsHtml(items) {
  if (!items || items.length === 0) {
    return `
      <div class="col-span-full py-16 text-center text-gray-400 bg-white rounded-2xl border border-gray-200 p-8 shadow-xs">
        <div class="text-4xl mb-3">💎</div>
        <h4 class="font-bold text-gray-700 text-sm mb-1">No Jewellery Items Found</h4>
        <p class="text-xs text-gray-500">Try adjusting your category filter or search keywords.</p>
      </div>
    `;
  }

  return items.map(item => {
    const imgUrl = item.image_url || 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400';
    const gross = parseFloat(item.gross_weight || item.weight || 0);
    const stone = parseFloat(item.stone_weight || 0);
    const net = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, gross - stone);
    const purity = item.purity || '22K';
    const rate = (window.latestRates && window.latestRates[purity]) ? window.latestRates[purity] : 7000;
    const sellPrice = window.calculateJewelleryEstimatedPrice(item);
    const isLowStock = item.stock <= (item.min_stock || 1);
    const isOutStock = item.stock <= 0;

    return `
      <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:border-[#D4AF37] hover:shadow-lg transition flex flex-col justify-between group shadow-xs" id="catalog_card_${item.id}">
        <!-- Image & Top Badges -->
        <div class="relative w-full h-44 bg-gray-100 overflow-hidden cursor-pointer" onclick="quickViewJewellery(${item.id})">
          <img src="${imgUrl}" alt="${item.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
            <span class="bg-white/90 text-gray-900 text-xs font-bold px-3 py-1.5 rounded-xl shadow backdrop-blur-xs flex items-center gap-1">
              👁️ Quick View
            </span>
          </div>
          <!-- Top Badges -->
          <div class="absolute top-2 left-2 flex items-center gap-1">
            <span class="bg-black/70 backdrop-blur-xs text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border border-white/20">
              ${item.code}
            </span>
          </div>
          <div class="absolute top-2 right-2">
            <span class="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black font-mono px-2 py-0.5 rounded-lg shadow-xs">
              ${item.purity}
            </span>
          </div>
        </div>

        <!-- Card Body -->
        <div class="p-3.5 flex-1 flex flex-col justify-between space-y-2">
          <div>
            <div class="flex items-baseline justify-between text-[11px] text-gray-400 font-mono mb-1">
              <span class="truncate uppercase text-[10px] tracking-wider font-semibold text-gray-500">${item.category || 'Jewellery'}</span>
              ${item.barcode ? `<span class="truncate text-[10px] text-gray-400">🏷️ ${item.barcode}</span>` : ''}
            </div>
            <h3 class="font-bold text-gray-900 text-xs line-clamp-2 leading-snug group-hover:text-amber-800 transition" title="${item.name}">
              ${item.name}
            </h3>
          </div>

          <!-- Weights & Price -->
          <div class="bg-gray-50/80 rounded-xl p-2.5 border border-gray-100 space-y-1 text-xs">
            <div class="flex justify-between items-center text-[11px]">
              <span class="text-gray-500 font-medium">Net Gold Wt:</span>
              <span class="font-bold font-mono text-amber-950">${Number(net).toFixed(3)}g</span>
            </div>
            <div class="flex justify-between items-center text-[11px]">
              <span class="text-gray-500 font-medium">Gross Wt:</span>
              <span class="font-mono text-gray-700">${Number(gross).toFixed(3)}g</span>
            </div>
            <div class="flex justify-between items-center pt-1 border-t border-gray-200/70">
              <span class="text-[10px] text-gray-500 uppercase font-bold">Estimated Val:</span>
              <span class="font-black text-gray-900 font-mono text-xs">${formatMoney(sellPrice)}</span>
            </div>
          </div>

          <!-- Stock & Actions -->
          <div class="space-y-2 pt-1">
            <div class="flex justify-between items-center text-[10px]">
              <span class="font-semibold text-gray-500">Showroom Stock:</span>
              <span class="px-2 py-0.5 rounded-full font-bold font-mono ${isOutStock ? 'bg-red-100 text-red-700' : (isLowStock ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}">
                ${item.stock} units
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <button type="button" onclick="addShowcaseItemToCart(${item.id})" 
                class="flex-1 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                ${isOutStock ? 'disabled class="opacity-50 cursor-not-allowed"' : ''}>
                <span>🛒</span> Add to POS Bill
              </button>
              <button type="button" onclick="printBarcodeLabel(${item.id})" class="p-2 border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-xl text-xs transition" title="Print Barcode Tag">
                🏷️
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.handleCatalogCategorySelect = function(cat) {
  window.catalogFilterState.category = cat;
  document.querySelectorAll('.catalog-pill').forEach(btn => {
    btn.className = 'catalog-pill px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap bg-gray-100 text-gray-700 hover:bg-gray-200';
  });
  const el = document.getElementById(`catPill_${cat}`);
  if (el) el.className = 'catalog-pill px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap bg-gray-900 text-white shadow-xs';

  updateCatalogGrid();
};

window.handleCatalogSearch = function(query) {
  window.catalogFilterState.searchQuery = query || '';
  updateCatalogGrid();
};

window.handleCatalogSort = function(sortBy) {
  window.catalogFilterState.sortBy = sortBy || 'DEFAULT';
  updateCatalogGrid();
};

function getFilteredCatalogItems() {
  let items = [...(window.jewelleryItems || [])];
  const { category, searchQuery, sortBy } = window.catalogFilterState;

  if (category && category !== 'ALL') {
    const c = category.toLowerCase();
    items = items.filter(i => (i.category && i.category.toLowerCase().includes(c)) || (i.metal && i.metal.toLowerCase().includes(c)));
  }

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    items = items.filter(i => 
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.code && i.code.toLowerCase().includes(q)) ||
      (i.barcode && i.barcode.toLowerCase().includes(q)) ||
      (i.category && i.category.toLowerCase().includes(q))
    );
  }

  if (sortBy === 'PRICE_ASC') {
    items.sort((a, b) => (window.calculateJewelleryEstimatedPrice(a) || 0) - (window.calculateJewelleryEstimatedPrice(b) || 0));
  } else if (sortBy === 'PRICE_DESC') {
    items.sort((a, b) => (window.calculateJewelleryEstimatedPrice(b) || 0) - (window.calculateJewelleryEstimatedPrice(a) || 0));
  } else if (sortBy === 'WEIGHT_ASC') {
    items.sort((a, b) => (parseFloat(a.net_weight || a.weight) || 0) - (parseFloat(b.net_weight || b.weight) || 0));
  } else if (sortBy === 'WEIGHT_DESC') {
    items.sort((a, b) => (parseFloat(b.net_weight || b.weight) || 0) - (parseFloat(a.net_weight || a.weight) || 0));
  } else if (sortBy === 'NAME_ASC') {
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  return items;
}

function updateCatalogGrid() {
  const container = document.getElementById('catalogGridContainer');
  const countEl = document.getElementById('catalogCountDisplay');
  const filtered = getFilteredCatalogItems();
  if (container) container.innerHTML = renderShowcaseCardsHtml(filtered);
  if (countEl) countEl.innerText = `${filtered.length} items`;
}

window.addShowcaseItemToCart = function(id) {
  const item = (window.jewelleryItems || []).find(i => i.id === id);
  if (!item) return;

  addJewelleryToCart(id);
  showToast(`✓ Added to POS Bill: ${item.name}`, 'success');

  const b = document.getElementById('showcaseCartBadge');
  if (b) b.innerText = window.currentCart.length;
};

// Quick Jewellery Details Modal (Quick View)
window.quickViewJewellery = function(id) {
  const item = (window.jewelleryItems || []).find(i => i.id === id) || (window.allJewellery || []).find(i => i.id === id);
  if (!item) return;

  const existing = document.getElementById('jewelleryQuickViewModal');
  if (existing) existing.remove();

  const imgUrl = item.image_url || 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400';
  const gross = parseFloat(item.gross_weight || item.weight || 0);
  const stone = parseFloat(item.stone_weight || 0);
  const net = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, gross - stone);
  const purity = item.purity || '22K';
  const rate = (window.latestRates && window.latestRates[purity]) ? window.latestRates[purity] : 7000;
  const sellPrice = window.calculateJewelleryEstimatedPrice(item);

  const modal = document.createElement('div');
  modal.id = 'jewelleryQuickViewModal';
  modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200">
      <div class="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-4 flex justify-between items-center">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">💎</span>
          <div>
            <h3 class="font-bold text-sm">${item.name}</h3>
            <span class="text-[11px] text-amber-100 font-mono">${item.code} | ${item.purity}</span>
          </div>
        </div>
        <button onclick="document.getElementById('jewelleryQuickViewModal').remove()" class="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center font-bold text-sm transition">✕</button>
      </div>

      <div class="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        <div class="flex gap-4 items-start">
          <div class="w-36 h-36 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 shadow-inner">
            <img src="${imgUrl}" alt="${item.name}" class="w-full h-full object-cover">
          </div>
          <div class="flex-1 space-y-2 text-xs">
            <div class="flex justify-between items-center py-0.5 border-b">
              <span class="text-gray-500 font-medium">Category:</span>
              <span class="font-bold text-gray-800">${item.category || 'Jewellery'}</span>
            </div>
            <div class="flex justify-between items-center py-0.5 border-b">
              <span class="text-gray-500 font-medium">Gold Purity:</span>
              <span class="font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-mono">${item.purity}</span>
            </div>
            <div class="flex justify-between items-center py-0.5 border-b">
              <span class="text-gray-500 font-medium">Barcode:</span>
              <span class="font-mono text-gray-800 font-semibold">${item.barcode || 'N/A'}</span>
            </div>
            <div class="flex justify-between items-center py-0.5">
              <span class="text-gray-500 font-medium">Showroom Stock:</span>
              <span class="font-bold text-green-700 font-mono">${item.stock} units</span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
          <div class="bg-white p-2 rounded-lg border text-center">
            <span class="text-[10px] text-gray-400 uppercase font-bold block">Gross Wt</span>
            <span class="font-bold font-mono text-gray-900 text-xs">${Number(gross).toFixed(3)}g</span>
          </div>
          <div class="bg-white p-2 rounded-lg border text-center">
            <span class="text-[10px] text-gray-400 uppercase font-bold block">Stone Wt</span>
            <span class="font-bold font-mono text-gray-900 text-xs">${Number(stone).toFixed(3)}g</span>
          </div>
          <div class="bg-amber-100/70 p-2 rounded-lg border border-amber-200 text-center">
            <span class="text-[10px] text-amber-900 uppercase font-black block">Net Gold Wt</span>
            <span class="font-black font-mono text-amber-950 text-xs">${Number(net).toFixed(3)}g</span>
          </div>
        </div>

        <div class="flex justify-between items-center bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs">
          <span class="font-bold text-amber-900">Estimated Retail Price:</span>
          <span class="font-black text-gray-900 font-mono text-base">${formatMoney(sellPrice)}</span>
        </div>
      </div>

      <div class="bg-gray-100 p-3.5 flex justify-end gap-2 border-t border-gray-200">
        <button onclick="addJewelleryToCart(${item.id}); showToast('✓ Added to POS Bill', 'success'); document.getElementById('jewelleryQuickViewModal').remove();" class="btn-gold px-4 py-2 rounded-lg font-bold text-xs">
          🛒 Add to POS Bill
        </button>
        <button onclick="document.getElementById('jewelleryQuickViewModal').remove()" class="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-bold text-xs transition">
          Close
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

// Modal for picking showcase items directly from POS Billing Desk
window.openPosCatalogModal = function() {
  const existing = document.getElementById('posCatalogModal');
  if (existing) existing.remove();

  const items = (window.jewelleryItems || []).filter(i => (i.stock > 0 || i.status === 'AVAILABLE' || i.status === 'LOW_STOCK') && i.status !== 'INACTIVE');
  const categories = ['ALL', 'Gold', 'Silver', 'Necklace', 'Ring', 'Chain', 'Bangle', 'Earrings', 'Bracelet', 'Coin'];

  const modal = document.createElement('div');
  modal.id = 'posCatalogModal';
  modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-gray-200">
      <!-- Modal Header -->
      <div class="bg-gray-900 text-white p-4 flex justify-between items-center shrink-0">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">💎</span>
          <div>
            <h3 class="font-bold text-sm">Jewellery Showcase Picker</h3>
            <p class="text-[11px] text-gray-300">Click any jewellery item to add directly to current POS bill</p>
          </div>
        </div>
        <button onclick="document.getElementById('posCatalogModal').remove()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm transition">✕</button>
      </div>

      <!-- Filter Controls -->
      <div class="p-3.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div class="relative flex-1 min-w-[220px]">
          <span class="absolute left-3 top-2 text-gray-400 text-xs">🔍</span>
          <input type="text" id="posModalSearchInput" placeholder="Filter by code or name..." 
            class="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#D4AF37] bg-white"
            oninput="filterPosModalGrid(this.value)">
        </div>
        <div class="flex items-center gap-1 overflow-x-auto">
          ${categories.map(c => `
            <button onclick="filterPosModalCategory('${c}')" class="pos-modal-cat-btn px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300">
              ${c}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Grid Body -->
      <div class="flex-1 overflow-y-auto p-4" id="posModalGridContainer">
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
          ${items.map(item => {
            const imgUrl = item.image_url || 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=200';
            const gross = parseFloat(item.gross_weight || item.weight || 0);
            const stone = parseFloat(item.stone_weight || 0);
            const net = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, gross - stone);
            return `
              <div onclick="addJewelleryToCart(${item.id}); showToast('✓ Added: ${item.name.replace(/'/g, "\\'")}', 'success'); document.getElementById('posCatalogModal').remove();"
                class="border border-gray-200 rounded-xl p-2.5 bg-white hover:border-[#D4AF37] hover:shadow-md transition cursor-pointer flex flex-col justify-between group">
                <div class="w-full h-24 bg-gray-100 rounded-lg overflow-hidden mb-2">
                  <img src="${imgUrl}" alt="${item.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                </div>
                <div>
                  <div class="flex justify-between items-center text-[10px] text-gray-400 font-mono">
                    <span class="font-bold text-gray-700">${item.code}</span>
                    <span class="bg-amber-100 text-amber-900 px-1 rounded font-bold">${item.purity}</span>
                  </div>
                  <div class="font-bold text-gray-900 text-xs truncate mt-0.5" title="${item.name}">${item.name}</div>
                  <div class="text-[11px] text-amber-800 font-semibold font-mono mt-0.5">Net: ${Number(net).toFixed(3)}g</div>
                  <div class="flex justify-between items-center mt-1.5 pt-1 border-t border-gray-100 text-xs font-black text-gray-900">
                    <span>${formatMoney(window.calculateJewelleryEstimatedPrice(item))}</span>
                    <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded">Stock ${item.stock}</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.filterPosModalGrid = function(query) {
  const q = (query || '').toLowerCase().trim();
  const items = (window.jewelleryItems || []).filter(i => {
    if (!q) return true;
    return (i.name && i.name.toLowerCase().includes(q)) || 
           (i.code && i.code.toLowerCase().includes(q)) || 
           (i.barcode && i.barcode.toLowerCase().includes(q));
  });
  renderPosModalItems(items);
};

window.filterPosModalCategory = function(cat) {
  document.querySelectorAll('.pos-modal-cat-btn').forEach(b => b.className = 'pos-modal-cat-btn px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300');
  if (event && event.target) {
    event.target.className = 'pos-modal-cat-btn px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-900 text-white';
  }
  const items = cat === 'ALL'
    ? window.jewelleryItems
    : (window.jewelleryItems || []).filter(i => (i.category && i.category.toLowerCase().includes(cat.toLowerCase())) || (i.metal && i.metal.toLowerCase().includes(cat.toLowerCase())));
  renderPosModalItems(items);
};

function renderPosModalItems(items) {
  const container = document.getElementById('posModalGridContainer');
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = `<div class="py-12 text-center text-gray-400 text-xs">No matching jewellery items found</div>`;
    return;
  }
  container.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
      ${items.map(item => {
        const imgUrl = item.image_url || 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=200';
        const gross = parseFloat(item.gross_weight || item.weight || 0);
        const stone = parseFloat(item.stone_weight || 0);
        const net = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, gross - stone);
        return `
          <div onclick="addJewelleryToCart(${item.id}); showToast('✓ Added: ${item.name.replace(/'/g, "\\'")}', 'success'); document.getElementById('posCatalogModal').remove();"
            class="border border-gray-200 rounded-xl p-2.5 bg-white hover:border-[#D4AF37] hover:shadow-md transition cursor-pointer flex flex-col justify-between group">
            <div class="w-full h-24 bg-gray-100 rounded-lg overflow-hidden mb-2">
              <img src="${imgUrl}" alt="${item.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
            </div>
            <div>
              <div class="flex justify-between items-center text-[10px] text-gray-400 font-mono">
                <span class="font-bold text-gray-700">${item.code}</span>
                <span class="bg-amber-100 text-amber-900 px-1 rounded font-bold">${item.purity}</span>
              </div>
              <div class="font-bold text-gray-900 text-xs truncate mt-0.5" title="${item.name}">${item.name}</div>
              <div class="text-[11px] text-amber-800 font-semibold font-mono mt-0.5">Net: ${Number(net).toFixed(3)}g</div>
              <div class="flex justify-between items-center mt-1.5 pt-1 border-t border-gray-100 text-xs font-black text-gray-900">
                <span>${formatMoney(window.calculateJewelleryEstimatedPrice(item))}</span>
                <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded">Stock ${item.stock}</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

let lastProcessedBarcode = '';
let lastProcessedBarcodeTime = 0;

// Robust Barcode & Product Code Scan Handler
window.handleBarcodeScan = async function(barcode) {
  if (!barcode || !String(barcode).trim()) return;
  
  // Clean scanned string: strip hidden non-printable ASCII control characters (STX, ETX, CR, LF, etc.)
  const raw = String(barcode);
  const clean = raw.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (!clean) return;

  const now = Date.now();
  // Prevent duplicate execution within 800ms
  if (clean.toUpperCase() === lastProcessedBarcode && (now - lastProcessedBarcodeTime) < 800) {
    return;
  }
  lastProcessedBarcode = clean.toUpperCase();
  lastProcessedBarcodeTime = now;

  const upper = clean.toUpperCase();
  const unhyphenated = upper.replace(/[^A-Z0-9]/g, '');

  const bInput = document.getElementById('barcodeScannerInput');
  const badge = document.getElementById('barcodeScannerStatusBadge');
  if (badge) {
    badge.className = 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 shadow-xs';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-600 animate-spin"></span> <span>Searching...</span>`;
  }

  // 1. Try local match in window.jewelleryItems
  let matched = (window.jewelleryItems || []).find(i => {
    if (!i) return false;
    const bCode = i.barcode ? String(i.barcode).trim().toUpperCase() : '';
    const iCode = i.code ? String(i.code).trim().toUpperCase() : '';
    const bUnhyphenated = bCode.replace(/[^A-Z0-9]/g, '');
    const iUnhyphenated = iCode.replace(/[^A-Z0-9]/g, '');

    // Exact matches
    if (bCode && bCode === upper) return true;
    if (iCode && iCode === upper) return true;
    // Unhyphenated matches (e.g. NL22K001 == NL-22K-001)
    if (unhyphenated.length >= 3 && (bUnhyphenated === unhyphenated || iUnhyphenated === unhyphenated)) return true;
    // Exact ID match
    if (String(i.id) === clean) return true;
    return false;
  });

  // 2. If not found locally, query backend barcode API
  if (!matched) {
    try {
      const serverItem = await api('/jewellery/barcode/' + encodeURIComponent(clean));
      if (serverItem && serverItem.id) {
        matched = serverItem;
        if (!window.jewelleryItems) window.jewelleryItems = [];
        if (!window.jewelleryItems.some(i => i.id === matched.id)) {
          window.jewelleryItems.push(matched);
        }
      }
    } catch(err) {
      // 3. Fallback: query search endpoint
      try {
        const searchItems = await api('/jewellery?search=' + encodeURIComponent(clean));
        if (Array.isArray(searchItems) && searchItems.length > 0) {
          matched = searchItems[0];
          if (!window.jewelleryItems) window.jewelleryItems = [];
          if (!window.jewelleryItems.some(i => i.id === matched.id)) {
            window.jewelleryItems.push(matched);
          }
        }
      } catch(e){}
    }
  }

  // Reset status badge
  if (badge) {
    badge.className = 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-xs';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span> <span>Ready</span>`;
  }

  if (matched) {
    // Check stock
    if (matched.stock <= 0) {
      playPosBarcodeSound(false);
      showToast(`⚠️ ${matched.name} (${matched.code}) is OUT OF STOCK`, 'warning');
      return;
    }

    addJewelleryToCart(matched.id);
    playPosBarcodeSound(true);
    showToast(`✅ Scanned &amp; Added: ${matched.name} (${matched.code})`, 'success');

    // Visual pulse on matching product card in catalog
    const cardEl = document.getElementById(`pos_product_card_${matched.id}`);
    if (cardEl) {
      cardEl.classList.add('ring-4', 'ring-[#D4AF37]', 'scale-105');
      setTimeout(() => cardEl.classList.remove('ring-4', 'ring-[#D4AF37]', 'scale-105'), 600);
    }

    // Visual feedback on input
    if (bInput) {
      bInput.value = '';
      bInput.classList.add('border-emerald-500', 'bg-emerald-50/40');
      setTimeout(() => {
        bInput.classList.remove('border-emerald-500', 'bg-emerald-50/40');
        bInput.focus();
      }, 400);
    }
  } else {
    playPosBarcodeSound(false);
    showToast(`⚠️ No item found for barcode '${clean}'`, 'error');
    if (bInput) {
      bInput.classList.add('border-red-500', 'bg-red-50/40');
      setTimeout(() => {
        bInput.classList.remove('border-red-500', 'bg-red-50/40');
        bInput.focus();
      }, 1000);
    }
  }
};

window.addJewelleryToCart = function(id) {
  const item = (window.jewelleryItems || []).find(i => i.id === id);
  if (!item) return;

  const existing = window.currentCart.find(c => c.jewellery_id === id);
  if (existing) {
    if (existing.quantity >= item.stock) {
      return showToast(`Only ${item.stock} units in stock for ${item.name}`, 'warning');
    }
    existing.quantity += 1;
  } else {
    const purity = item.purity || '22K';
    const rate = (window.latestRates && window.latestRates[purity]) ? window.latestRates[purity] : 7000;
    const gross = parseFloat(item.gross_weight || item.weight || 1);
    const stone = parseFloat(item.stone_weight || 0);
    const net = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, gross - stone);
    const sellPrice = parseFloat(item.selling_price) || 0;
    const isFixed = item.pricing_mode === 'FIXED_PRICE' || (sellPrice > 0 && (!net || net <= 0));

    window.currentCart.push({
      jewellery_id: item.id,
      name: item.name,
      code: item.code,
      barcode: item.barcode,
      image_url: item.image_url,
      category: item.category,
      purity,
      pricing_mode: isFixed ? 'FIXED_PRICE' : 'WEIGHT_RATE',
      selling_price: sellPrice,
      gold_rate: rate,
      gross_weight: gross,
      stone_weight: stone,
      net_weight: net,
      making_charge: parseFloat(item.making_charge || 0),
      making_charge_type: item.making_charge_type || 'FIXED',
      wastage_percent: parseFloat(item.wastage_percent || 0),
      stone_charge: parseFloat(item.stone_charge || 0),
      other_charges: parseFloat(item.other_charges || 0),
      discount_percent: 0,
      quantity: 1,
      stock: item.stock
    });
    window.cartItemExpanded = window.cartItemExpanded || {};
    window.cartItemExpanded[window.currentCart.length - 1] = true;
  }
  renderPosCartTable();

  // Keep barcode input focused for next scan
  const bInput = document.getElementById('barcodeScannerInput');
  if (bInput) {
    bInput.value = '';
    bInput.focus();
  }

  // Scroll cart to bottom so the new item is clearly visible
  setTimeout(() => {
    const cartList = document.getElementById('posCartItemsList');
    if (cartList) cartList.scrollTop = cartList.scrollHeight;
  }, 50);
};

window.toggleCartItemDetails = function(idx) {
  window.cartItemExpanded = window.cartItemExpanded || {};
  window.cartItemExpanded[idx] = !window.cartItemExpanded[idx];
  renderPosCartTable();
};

window.updatePosCartItemMode = function(idx, mode) {
  if (!window.currentCart[idx]) return;
  window.currentCart[idx].pricing_mode = mode;
  renderPosCartTable();
};

window.updatePosCartItem = function(idx, field, value) {
  if (!window.currentCart[idx]) return;
  window.currentCart[idx][field] = parseFloat(value) || 0;
  renderPosCartTable();
};

window.updatePosCartItemField = function(idx, field, value) {
  if (!window.currentCart[idx]) return;
  const num = parseFloat(value) || 0;
  window.currentCart[idx][field] = num;

  if (field === 'selling_price') {
    window.currentCart[idx].pricing_mode = 'FIXED_PRICE';
  } else if (field === 'gold_rate') {
    window.currentCart[idx].pricing_mode = 'WEIGHT_RATE';
  }

  // Recalculate line total for this item
  const item = window.currentCart[idx];
  const gross = parseFloat(item.gross_weight || item.weight || 0);
  const stone = parseFloat(item.stone_weight || 0);
  const net = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, gross - stone);
  const rate = parseFloat(item.gold_rate) || 0;
  const qty = parseInt(item.quantity) || 1;
  const isFixed = item.pricing_mode === 'FIXED_PRICE' && (parseFloat(item.selling_price) || 0) > 0;
  
  let gVal = 0, wVal = 0, mVal = 0, sVal = 0, lineVal = 0;
  if (isFixed) {
    lineVal = (parseFloat(item.selling_price) || 0) * qty;
    sVal = Math.min(lineVal, Math.round((parseFloat(item.stone_charge) || 0) * qty));
    gVal = Math.max(0, lineVal - sVal);
  } else {
    gVal = Math.round(net * rate * qty);
    wVal = Math.round(gVal * ((parseFloat(item.wastage_percent) || 0) / 100));

    const mcVal = parseFloat(item.making_charge) || 0;
    if (item.making_charge_type === 'PERCENTAGE') {
      mVal = Math.round(gVal * (mcVal / 100));
    } else if (item.making_charge_type === 'PER_GRAM') {
      mVal = Math.round(net * mcVal * qty);
    } else {
      mVal = Math.round(mcVal * qty);
    }

    sVal = Math.round((parseFloat(item.stone_charge) || 0) * qty);
    const oVal = Math.round((parseFloat(item.other_charges) || 0) * qty);
    lineVal = gVal + wVal + mVal + sVal + oVal;
  }

  const gEl = document.getElementById(`pos_gval_${idx}`);
  if (gEl) gEl.innerText = formatMoney(gVal);

  const wEl = document.getElementById(`pos_wval_${idx}`);
  if (wEl) wEl.innerText = formatMoney(wVal);

  const mEl = document.getElementById(`pos_mval_${idx}`);
  if (mEl) mEl.innerText = formatMoney(mVal);

  const sEl = document.getElementById(`pos_sval_${idx}`);
  if (sEl) sEl.innerText = `Total: ${formatMoney(sVal)}`;

  const lineEl = document.getElementById(`pos_item_val_${idx}`);
  if (lineEl) lineEl.innerText = formatMoney(lineVal);

  updatePosCalculations();
};

window.updatePosCartItemMakingType = function(idx, type) {
  if (!window.currentCart[idx]) return;
  window.currentCart[idx].making_charge_type = type;
  renderPosCartTable();
};

window.removePosCartItem = function(idx) {
  window.currentCart.splice(idx, 1);
  renderPosCartTable();
};

window.clearPosCart = function() {
  window.currentCart = [];
  renderPosCartTable();
};

// Real-time calculation on cart
function calculateCartTotals() {
  const taxPercent = getCurrentGstPercent();
  const globalDisc = parseFloat(document.getElementById('posGlobalDiscountInput')?.value) || 0;

  let totalGrossWeight = 0;
  let totalStoneWeight = 0;
  let totalNetWeight = 0;
  let totalQuantity = 0;
  let goldValueTotal = 0;
  let wastageTotal = 0;
  let makingTotal = 0;
  let stoneTotal = 0;
  let grossAmount = 0;
  let discountTotal = 0;

  window.currentCart.forEach(item => {
    const gross = parseFloat(item.gross_weight || item.weight || 0);
    const stone = parseFloat(item.stone_weight || 0);
    const net = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, gross - stone);
    const rate = parseFloat(item.gold_rate) || 0;
    const qty = parseInt(item.quantity) || 1;
    const isFixed = item.pricing_mode === 'FIXED_PRICE' && (parseFloat(item.selling_price) || 0) > 0;
    const sellPrice = parseFloat(item.selling_price) || 0;

    totalGrossWeight += gross * qty;
    totalStoneWeight += stone * qty;
    totalNetWeight += net * qty;
    totalQuantity += qty;

    let gVal = 0;
    let wVal = 0;
    let mVal = 0;
    let sVal = 0;
    let oVal = 0;
    let lineGross = 0;

    if (isFixed) {
      const totalItemVal = sellPrice * qty;
      sVal = Math.min(totalItemVal, Math.round((parseFloat(item.stone_charge) || 0) * qty));
      oVal = 0;
      wVal = 0;
      mVal = 0;
      gVal = Math.max(0, totalItemVal - sVal);
      lineGross = totalItemVal;
    } else {
      gVal = Math.round(net * rate * qty);
      wVal = Math.round(gVal * ((parseFloat(item.wastage_percent) || 0) / 100));

      const mcVal = parseFloat(item.making_charge) || 0;
      if (item.making_charge_type === 'PERCENTAGE') {
        mVal = Math.round(gVal * (mcVal / 100));
      } else if (item.making_charge_type === 'PER_GRAM') {
        mVal = Math.round(net * mcVal * qty);
      } else {
        mVal = Math.round(mcVal * qty);
      }

      sVal = Math.round((parseFloat(item.stone_charge) || 0) * qty);
      oVal = Math.round((parseFloat(item.other_charges) || 0) * qty);
      lineGross = gVal + wVal + mVal + sVal + oVal;
    }

    const discPct = item.discount_percent > 0 ? item.discount_percent : globalDisc;
    const lineDisc = lineGross * (discPct / 100);

    goldValueTotal += gVal;
    wastageTotal += wVal;
    makingTotal += mVal;
    stoneTotal += (sVal + oVal);
    grossAmount += lineGross;
    discountTotal += lineDisc;
  });

  const taxableAmount = Math.max(0, grossAmount - discountTotal);
  const taxAmount = taxableAmount * (taxPercent / 100);
  const rawFinal = taxableAmount + taxAmount;
  const finalPayable = Math.round(rawFinal);
  const roundOff = Number((finalPayable - rawFinal).toFixed(2));

  return {
    totalGrossWeight,
    totalStoneWeight,
    totalNetWeight,
    totalQuantity,
    goldValueTotal,
    wastageTotal,
    makingTotal,
    stoneTotal,
    grossAmount,
    discountTotal,
    taxableAmount,
    taxAmount,
    roundOff,
    finalPayable
  };
}

function renderPosCartTable() {
  if (typeof updateMenuNotificationBadges === 'function') {
    updateMenuNotificationBadges();
  }
  const container = document.getElementById('posCartItemsList');
  if (!container) return;

  if (window.currentCart.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full min-h-[380px] py-16 text-center text-gray-400">
        <div class="w-20 h-20 bg-amber-50 border-2 border-amber-200 rounded-3xl flex items-center justify-center text-4xl mb-4 shadow-sm animate-pulse">
          ⚡
        </div>
        <h3 class="text-base font-black text-gray-800 mb-1">POS Billing Desk Ready</h3>
        <p class="text-xs text-gray-500 max-w-md mb-5 leading-relaxed">
          Scan jewellery barcode using hardware scanner, or type item code above to instantly add items to invoice.
        </p>
        <div class="flex items-center gap-3">
          <button onclick="openPosCatalogModal()" class="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold shadow flex items-center gap-1.5 transition">
            <span>💎</span> Browse Showcase
          </button>
          <button onclick="const b = document.getElementById('barcodeScannerInput'); if(b) b.focus();" class="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold transition">
            <span>🏷️</span> Focus Scanner
          </button>
        </div>
      </div>
    `;
    updatePosSummaryElements({ 
      totalGrossWeight: 0,
      totalStoneWeight: 0,
      totalNetWeight: 0,
      totalQuantity: 0,
      goldValueTotal: 0, 
      wastageTotal: 0, 
      makingTotal: 0, 
      stoneTotal: 0, 
      discountTotal: 0, 
      taxAmount: 0, 
      finalPayable: 0 
    });
    return;
  }

  const rowsHtml = window.currentCart.map((item, idx) => {
    const gross = parseFloat(item.gross_weight || item.weight || 0);
    const stone = parseFloat(item.stone_weight || 0);
    const net = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, gross - stone);
    const isFixed = item.pricing_mode === 'FIXED_PRICE' && (parseFloat(item.selling_price) || 0) > 0;
    const rate = parseFloat(item.gold_rate) || 0;
    const qty = parseInt(item.quantity) || 1;
    const imgUrl = item.image_url || 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=200';
    
    let gVal = 0, wVal = 0, mVal = 0, sVal = 0, oVal = 0, lineVal = 0;
    if (isFixed) {
      lineVal = (parseFloat(item.selling_price) || 0) * qty;
      sVal = Math.min(lineVal, Math.round((parseFloat(item.stone_charge) || 0) * qty));
      gVal = Math.max(0, lineVal - sVal);
    } else {
      gVal = Math.round(net * rate * qty);
      wVal = Math.round(gVal * ((parseFloat(item.wastage_percent) || 0) / 100));

      const mcVal = parseFloat(item.making_charge) || 0;
      if (item.making_charge_type === 'PERCENTAGE') {
        mVal = Math.round(gVal * (mcVal / 100));
      } else if (item.making_charge_type === 'PER_GRAM') {
        mVal = Math.round(net * mcVal * qty);
      } else {
        mVal = Math.round(mcVal * qty);
      }

      sVal = Math.round((parseFloat(item.stone_charge) || 0) * qty);
      const oVal = Math.round((parseFloat(item.other_charges) || 0) * qty);
      lineVal = gVal + wVal + mVal + sVal + oVal;
    }

    return `
      <tr class="hover:bg-amber-50/40 transition border-b border-gray-100 group">
        <!-- # S.No -->
        <td class="py-3 px-3 text-center font-mono font-bold text-gray-400 text-xs">
          ${idx + 1}
        </td>

        <!-- Item & Code -->
        <td class="py-3 px-3">
          <div class="flex items-center gap-3">
            <div class="relative w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 cursor-pointer shadow-xs group-hover:border-amber-300 transition"
                 onclick="openPosItemDetailsModal(${idx})" title="Click to view full jewellery details">
              <img src="${imgUrl}" alt="${item.name}" class="w-full h-full object-cover">
              <div class="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 flex items-center justify-center transition text-white text-xs">
                👁️
              </div>
            </div>
            <div class="min-w-0">
              <div class="font-bold text-gray-900 text-xs truncate max-w-[200px] sm:max-w-xs" title="${item.name}">${item.name}</div>
              <div class="flex items-center gap-2 text-[10px] text-gray-500 font-mono mt-0.5">
                <span class="bg-gray-100 px-1.5 py-0.2 rounded font-semibold text-gray-700">${item.code}</span>
                ${item.barcode ? `<span>🏷️ ${item.barcode}</span>` : ''}
              </div>
            </div>
          </div>
        </td>

        <!-- Purity -->
        <td class="py-3 px-2 text-center">
          <span class="bg-amber-100 text-amber-950 border border-amber-300 px-2 py-0.5 rounded-lg font-black font-mono text-[11px] shadow-xs">
            ${item.purity}
          </span>
        </td>

        <!-- Gross Wt -->
        <td class="py-3 px-2 text-right font-mono text-gray-700 font-semibold text-xs whitespace-nowrap">
          ${Number(gross).toFixed(3)}g
        </td>

        <!-- Stone Wt -->
        <td class="py-3 px-2 text-right font-mono text-gray-500 text-xs whitespace-nowrap">
          ${Number(stone).toFixed(3)}g
        </td>

        <!-- Net Gold Wt (Highlighted) -->
        <td class="py-3 px-2 text-right bg-amber-50/60 border-x border-amber-100/80 font-mono font-black text-amber-950 text-xs whitespace-nowrap">
          ${Number(net).toFixed(3)}g
        </td>

        <!-- Gold Rate & Value -->
        <td class="py-3 px-3 text-right">
          <div class="flex items-center justify-end gap-1">
            <span class="text-[10px] text-gray-400">₹</span>
            <input type="number" value="${rate}" 
              class="w-20 bg-gray-50 border border-gray-200 focus:border-[#D4AF37] focus:bg-white rounded px-1.5 py-0.5 text-right font-mono font-bold text-xs outline-none transition" 
              ${isFixed ? 'disabled' : ''} 
              oninput="updatePosCartItemField(${idx}, 'gold_rate', this.value)">
            <span class="text-[10px] text-gray-400">/g</span>
          </div>
          <div class="font-mono font-black text-gray-900 text-xs mt-0.5" id="pos_gval_${idx}">
            ${formatMoney(gVal)}
          </div>
        </td>

        <!-- Wastage (VA) -->
        <td class="py-3 px-2 text-right">
          <div class="flex items-center justify-end gap-1">
            <input type="number" step="0.5" value="${item.wastage_percent}" 
              class="w-14 bg-gray-50 border border-gray-200 focus:border-[#D4AF37] focus:bg-white rounded px-1 py-0.5 text-right font-mono text-xs outline-none transition" 
              ${isFixed ? 'disabled' : ''} 
              oninput="updatePosCartItemField(${idx}, 'wastage_percent', this.value)">
            <span class="text-[10px] text-gray-400 font-bold">%</span>
          </div>
          <div class="font-mono text-gray-600 text-[11px] mt-0.5" id="pos_wval_${idx}">
            ${formatMoney(wVal)}
          </div>
        </td>

        <!-- Making Charge -->
        <td class="py-3 px-2 text-right">
          <div class="flex items-center justify-end gap-1">
            <select onchange="updatePosCartItemMakingType(${idx}, this.value)" 
              class="text-[10px] bg-gray-100 border border-gray-200 rounded p-0.5 font-bold outline-none" 
              ${isFixed ? 'disabled' : ''}>
              <option value="FIXED" ${item.making_charge_type === 'FIXED' ? 'selected' : ''}>₹</option>
              <option value="PERCENTAGE" ${item.making_charge_type === 'PERCENTAGE' ? 'selected' : ''}>%</option>
              <option value="PER_GRAM" ${item.making_charge_type === 'PER_GRAM' ? 'selected' : ''}>/g</option>
            </select>
            <input type="number" step="1" value="${item.making_charge}" 
              class="w-14 bg-gray-50 border border-gray-200 focus:border-[#D4AF37] focus:bg-white rounded px-1 py-0.5 text-right font-mono text-xs outline-none transition" 
              ${isFixed ? 'disabled' : ''} 
              oninput="updatePosCartItemField(${idx}, 'making_charge', this.value)">
          </div>
          <div class="font-mono text-gray-600 text-[11px] mt-0.5" id="pos_mval_${idx}">
            ${formatMoney(mVal)}
          </div>
        </td>

        <!-- Stone Charge -->
        <td class="py-3 px-2 text-right">
          <div class="flex items-center justify-end gap-1">
            <span class="text-[10px] text-gray-400">₹</span>
            <input type="number" step="1" value="${item.stone_charge}" 
              class="w-16 bg-gray-50 border border-gray-200 focus:border-[#D4AF37] focus:bg-white rounded px-1 py-0.5 text-right font-mono text-xs outline-none transition" 
              ${isFixed ? 'disabled' : ''} 
              oninput="updatePosCartItemField(${idx}, 'stone_charge', this.value)">
          </div>
          <div class="font-mono text-gray-500 text-[10px] mt-0.5" id="pos_sval_${idx}">
            ${formatMoney(sVal)}
          </div>
        </td>

        <!-- Qty -->
        <td class="py-3 px-2 text-center">
          <div class="flex items-center justify-center border border-gray-200 rounded-lg bg-gray-50 overflow-hidden w-20 mx-auto shadow-xs">
            <button type="button" onclick="if(window.currentCart[${idx}].quantity > 1){ window.currentCart[${idx}].quantity--; renderPosCartTable(); }" class="w-6 h-6 flex items-center justify-center hover:bg-gray-200 font-black text-gray-700 text-xs transition">-</button>
            <span class="flex-1 text-center font-bold text-gray-900 font-mono text-xs">${item.quantity}</span>
            <button type="button" onclick="if(window.currentCart[${idx}].quantity < ${item.stock}){ window.currentCart[${idx}].quantity++; renderPosCartTable(); }" class="w-6 h-6 flex items-center justify-center hover:bg-gray-200 font-black text-gray-700 text-xs transition">+</button>
          </div>
          <div class="text-[9px] text-gray-400 font-mono mt-0.5 text-center">Stock: ${item.stock}</div>
        </td>

        <!-- Line Total -->
        <td class="py-3 px-3 text-right">
          <span class="font-black font-mono text-gray-900 text-sm whitespace-nowrap" id="pos_item_val_${idx}">
            ${formatMoney(lineVal)}
          </span>
        </td>

        <!-- Actions -->
        <td class="py-3 px-2 text-center">
          <div class="flex items-center justify-center gap-1">
            <button type="button" onclick="openPosItemDetailsModal(${idx})" class="p-1.5 hover:bg-amber-100 text-amber-800 rounded-lg transition" title="Full Jewellery Details">
              👁️
            </button>
            <button type="button" onclick="removePosCartItem(${idx})" class="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-lg transition font-bold" title="Remove Item">
              ✕
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="overflow-x-auto w-full h-full no-scrollbar">
      <table class="w-full text-left text-xs border-collapse">
        <thead class="bg-gray-100/90 text-gray-600 uppercase text-[10px] font-black tracking-wider border-b border-gray-200 sticky top-0 z-10 backdrop-blur-sm">
          <tr>
            <th class="py-3 px-3 w-10 text-center">#</th>
            <th class="py-3 px-3 min-w-[220px]">Jewellery Item & Code</th>
            <th class="py-3 px-2 text-center w-24">Purity</th>
            <th class="py-3 px-2 text-right w-24">Gross Wt</th>
            <th class="py-3 px-2 text-right w-24">Stone Wt</th>
            <th class="py-3 px-2 text-right w-28 bg-amber-50/80 border-x border-amber-200 text-amber-950 font-black">Net Gold Wt</th>
            <th class="py-3 px-3 text-right min-w-[140px]">Gold Rate & Value</th>
            <th class="py-3 px-2 text-right w-28">Wastage (VA)</th>
            <th class="py-3 px-2 text-right w-32">Making Charge</th>
            <th class="py-3 px-2 text-right w-24">Stone Chg</th>
            <th class="py-3 px-2 text-center w-28">Quantity</th>
            <th class="py-3 px-3 text-right min-w-[130px]">Line Total</th>
            <th class="py-3 px-2 text-center w-20">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 bg-white">
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  updatePosCalculations();
}

window.openPosItemDetailsModal = function(idx) {
  const item = window.currentCart[idx];
  if (!item) return;

  const existing = document.getElementById('posItemDetailsModal');
  if (existing) existing.remove();

  const gross = parseFloat(item.gross_weight || item.weight || 0);
  const stone = parseFloat(item.stone_weight || 0);
  const net = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, gross - stone);
  const rate = parseFloat(item.gold_rate) || 0;
  const qty = parseInt(item.quantity) || 1;
  const isFixed = item.pricing_mode === 'FIXED_PRICE' && (parseFloat(item.selling_price) || 0) > 0;

  let gVal = 0, wVal = 0, mVal = 0, sVal = 0, lineVal = 0;
  if (isFixed) {
    lineVal = (parseFloat(item.selling_price) || 0) * qty;
    gVal = lineVal;
  } else {
    gVal = Math.round(net * rate * qty);
    wVal = Math.round(gVal * ((parseFloat(item.wastage_percent) || 0) / 100));

    const mcVal = parseFloat(item.making_charge) || 0;
    if (item.making_charge_type === 'PERCENTAGE') {
      mVal = Math.round(gVal * (mcVal / 100));
    } else if (item.making_charge_type === 'PER_GRAM') {
      mVal = Math.round(net * mcVal * qty);
    } else {
      mVal = Math.round(mcVal * qty);
    }

    sVal = Math.round((parseFloat(item.stone_charge) || 0) * qty);
    const oVal = Math.round((parseFloat(item.other_charges) || 0) * qty);
    lineVal = gVal + wVal + mVal + sVal + oVal;
  }

  const imgUrl = item.image_url || 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400';

  const modal = document.createElement('div');
  modal.id = 'posItemDetailsModal';
  modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200">
      <!-- Modal Header -->
      <div class="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-4 flex justify-between items-center">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">💍</span>
          <div>
            <h3 class="font-bold text-sm leading-tight">${item.name}</h3>
            <span class="text-[11px] text-amber-100 font-mono">${item.code} | ${item.purity} Gold</span>
          </div>
        </div>
        <button onclick="document.getElementById('posItemDetailsModal').remove()" class="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center font-bold text-sm transition">✕</button>
      </div>

      <!-- Modal Body -->
      <div class="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        <!-- Top: Large Image & Quick Specs -->
        <div class="flex gap-4 items-start">
          <div class="w-32 h-32 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 shadow-inner">
            <img src="${imgUrl}" alt="${item.name}" class="w-full h-full object-cover">
          </div>
          <div class="flex-1 space-y-2 text-xs">
            <div class="flex justify-between items-center py-0.5 border-b">
              <span class="text-gray-500 font-medium">Gold Purity:</span>
              <span class="font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-mono">${item.purity}</span>
            </div>
            <div class="flex justify-between items-center py-0.5 border-b">
              <span class="text-gray-500 font-medium">Barcode:</span>
              <span class="font-mono text-gray-800 font-semibold">${item.barcode || 'N/A'}</span>
            </div>
            <div class="flex justify-between items-center py-0.5 border-b">
              <span class="text-gray-500 font-medium">Stock in Shop:</span>
              <span class="font-bold text-green-700 font-mono">${item.stock} units</span>
            </div>
            <div class="flex justify-between items-center py-0.5">
              <span class="text-gray-500 font-medium">Quantity in Bill:</span>
              <span class="font-black text-gray-900 font-mono">${qty}</span>
            </div>
          </div>
        </div>

        <!-- 9-Point Complete Breakdown Table -->
        <div class="bg-gray-50 rounded-xl p-3.5 border border-gray-200 text-xs space-y-2.5">
          <div class="font-bold text-gray-800 text-xs uppercase tracking-wider flex items-center gap-1.5 pb-1.5 border-b border-gray-200">
            <span>⚖️</span> Complete Gold & Price Breakdown
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="bg-white p-2.5 rounded-lg border border-gray-200">
              <span class="text-[10px] text-gray-500 uppercase font-bold block">Gross Weight</span>
              <span class="font-bold font-mono text-gray-900 text-sm">${Number(gross).toFixed(3)} g</span>
            </div>
            <div class="bg-white p-2.5 rounded-lg border border-gray-200">
              <span class="text-[10px] text-gray-500 uppercase font-bold block">Stone Weight</span>
              <span class="font-bold font-mono text-gray-900 text-sm">${Number(stone).toFixed(3)} g</span>
            </div>
            <div class="bg-amber-50 p-2.5 rounded-lg border border-amber-200 col-span-2 flex justify-between items-center">
              <div>
                <span class="text-[10px] text-amber-900 font-black uppercase block">Net Gold Weight</span>
                <span class="text-[10px] text-gray-500 font-mono">Gross Wt - Stone Wt</span>
              </div>
              <span class="font-black font-mono text-amber-950 text-base">${Number(net).toFixed(3)} g</span>
            </div>
          </div>

          <div class="space-y-1.5 pt-1">
            <div class="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-200">
              <span class="text-gray-600 font-medium">${item.purity} Gold Rate:</span>
              <span class="font-mono font-bold text-gray-900">₹${rate.toLocaleString()}/g</span>
            </div>
            <div class="flex justify-between items-center bg-amber-50/70 p-2 rounded-lg border border-amber-200">
              <span class="text-amber-900 font-bold">Gold Value (Net Wt × Rate):</span>
              <span class="font-mono font-black text-gray-900">${formatMoney(gVal)}</span>
            </div>
            <div class="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-200">
              <span class="text-gray-600 font-medium">Wastage (${item.wastage_percent}%):</span>
              <span class="font-mono font-bold text-gray-900">${formatMoney(wVal)}</span>
            </div>
            <div class="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-200">
              <span class="text-gray-600 font-medium">Making Charge:</span>
              <span class="font-mono font-bold text-gray-900">${formatMoney(mVal)}</span>
            </div>
            <div class="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-200">
              <span class="text-gray-600 font-medium">Stone Charge:</span>
              <span class="font-mono font-bold text-gray-900">${formatMoney(sVal)}</span>
            </div>
            <div class="flex justify-between items-center bg-gradient-to-r from-amber-500 to-amber-600 text-white p-3 rounded-lg shadow-sm">
              <span class="font-black text-sm">Line Total (Qty: ${qty}):</span>
              <span class="font-black font-mono text-base">${formatMoney(lineVal)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="bg-gray-100 p-3.5 flex justify-end gap-2 border-t border-gray-200">
        <button onclick="document.getElementById('posItemDetailsModal').remove()" class="px-5 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-bold text-xs transition">
          Close Window
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

function updatePosCalculations() {
  const calc = calculateCartTotals();
  updatePosSummaryElements(calc);

  const btn = document.getElementById('btnProcessPosSale');
  const globalDisc = parseFloat(document.getElementById('posGlobalDiscountInput')?.value) || 0;
  if (btn) {
    if (user.role === 'SELLER') {
      btn.innerText = globalDisc > 0 
        ? `📨 Request Owner Approval (${globalDisc}% Disc)` 
        : `📨 Send to Owner for Approval`;
      btn.className = 'flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-black shadow transition';
      btn.title = 'Seller order will be submitted to Owner for approval.';
    } else {
      btn.innerText = 'Complete Sale & Bill';
      btn.className = 'flex-1 btn-gold py-2 rounded-lg text-xs font-black shadow hover:shadow-lg transition';
      btn.title = 'Complete sale and print invoice';
    }
  }
}

function updatePosSummaryElements(calc) {
  if (document.getElementById('posTotalNetWeightDisplay')) {
    document.getElementById('posTotalNetWeightDisplay').innerText = (calc.totalNetWeight || 0).toFixed(3) + ' g';
  }
  if (document.getElementById('posGoldValTotal')) document.getElementById('posGoldValTotal').innerText = formatMoney(calc.goldValueTotal);
  if (document.getElementById('posMakingWastageTotal')) document.getElementById('posMakingWastageTotal').innerText = formatMoney(calc.makingTotal + calc.wastageTotal);
  if (document.getElementById('posStoneTotal')) document.getElementById('posStoneTotal').innerText = formatMoney(calc.stoneTotal);
  if (document.getElementById('posDiscountAmountDisplay')) document.getElementById('posDiscountAmountDisplay').innerText = '-' + formatMoney(calc.discountTotal);
  if (document.getElementById('posTaxLabel')) document.getElementById('posTaxLabel').innerText = `GST Tax (${getCurrentGstPercent()}%):`;
  if (document.getElementById('posTaxDisplay')) document.getElementById('posTaxDisplay').innerText = formatMoney(calc.taxAmount);
  if (document.getElementById('posNetPayableDisplay')) document.getElementById('posNetPayableDisplay').innerText = formatMoney(calc.finalPayable);
}

// Payment Methods
window.setPosPaymentMethod = function(method) {
  window.posPaymentMethod = method;
  window.posSplitPayments = [];
  document.querySelectorAll('.pos-pm-btn').forEach(btn => {
    btn.className = 'pos-pm-btn py-1.5 rounded border border-gray-200 bg-white font-medium text-xs text-gray-700';
  });
  const activeBtn = document.getElementById(`pmBtn_${method}`);
  if (activeBtn) {
    activeBtn.className = 'pos-pm-btn py-1.5 rounded border border-[#D4AF37] bg-amber-50 font-bold text-xs text-gray-900';
  }
};

window.openSplitPaymentModal = function() {
  const calc = calculateCartTotals();
  const existing = document.getElementById('splitPaymentModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'splitPaymentModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
      <div class="flex justify-between items-center border-b pb-3 mb-4">
        <h3 class="font-bold text-gray-900 text-base">Split Payment Breakdown</h3>
        <button onclick="document.getElementById('splitPaymentModal').remove()" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
      </div>

      <div class="bg-amber-50 p-3 rounded-lg border border-amber-200 mb-4 text-xs">
        <div class="flex justify-between font-bold text-gray-800">
          <span>Net Invoice Total:</span>
          <span>${formatMoney(calc.finalPayable)}</span>
        </div>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Cash Amount (₹)</label>
          <input type="number" id="split_cash" class="w-full border rounded-lg p-2 outline-none focus:border-[#D4AF37]" placeholder="0" oninput="validateSplitTotal()">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">UPI / GooglePay / PhonePe (₹)</label>
          <input type="number" id="split_upi" class="w-full border rounded-lg p-2 outline-none focus:border-[#D4AF37]" placeholder="0" oninput="validateSplitTotal()">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Debit / Credit Card (₹)</label>
          <input type="number" id="split_card" class="w-full border rounded-lg p-2 outline-none focus:border-[#D4AF37]" placeholder="0" oninput="validateSplitTotal()">
        </div>
      </div>

      <div class="mt-4 pt-3 border-t flex justify-between text-xs font-bold">
        <span>Total Entered:</span>
        <span id="splitEnteredDisplay">₹0.00</span>
      </div>

      <div class="mt-5 flex gap-2">
        <button onclick="document.getElementById('splitPaymentModal').remove()" class="flex-1 py-2 border rounded-lg text-xs font-bold text-gray-600">Cancel</button>
        <button onclick="confirmSplitPayment(${calc.finalPayable})" class="flex-1 btn-gold py-2 rounded-lg text-xs font-bold">Confirm Split</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.validateSplitTotal = function() {
  const cash = parseFloat(document.getElementById('split_cash')?.value) || 0;
  const upi = parseFloat(document.getElementById('split_upi')?.value) || 0;
  const card = parseFloat(document.getElementById('split_card')?.value) || 0;
  const sum = cash + upi + card;
  const el = document.getElementById('splitEnteredDisplay');
  if (el) el.innerText = formatMoney(sum);
};

window.confirmSplitPayment = function(totalRequired) {
  const cash = parseFloat(document.getElementById('split_cash')?.value) || 0;
  const upi = parseFloat(document.getElementById('split_upi')?.value) || 0;
  const card = parseFloat(document.getElementById('split_card')?.value) || 0;

  window.posSplitPayments = [];
  if (cash > 0) window.posSplitPayments.push({ method: 'CASH', amount: cash });
  if (upi > 0) window.posSplitPayments.push({ method: 'UPI', amount: upi });
  if (card > 0) window.posSplitPayments.push({ method: 'CARD', amount: card });

  window.posPaymentMethod = 'SPLIT';
  document.querySelectorAll('.pos-pm-btn').forEach(b => b.className = 'pos-pm-btn py-1.5 rounded border border-gray-200 bg-white font-medium text-xs text-gray-700');
  const splitBtn = document.getElementById('pmBtn_SPLIT');
  if (splitBtn) splitBtn.className = 'pos-pm-btn py-1.5 rounded border border-[#D4AF37] bg-amber-50 font-bold text-xs text-gray-900';

  document.getElementById('splitPaymentModal').remove();
  showToast(`Split payment confirmed: ${window.posSplitPayments.length} methods configured`, 'success');
};

// Customer Selection in POS
window.handlePosCustomerSearch = function(query) {
  const dd = document.getElementById('posCustomerDropdown');
  if (!query || query.trim().length < 1) {
    if (dd) dd.classList.add('hidden');
    return;
  }
  const q = query.toLowerCase();
  const matched = (window.allCustomers || []).filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  if (matched.length === 0) {
    dd.innerHTML = `<div class="p-3 text-gray-400 text-xs text-center">No customer found. Click '+ New' to add.</div>`;
    dd.classList.remove('hidden');
    return;
  }
  dd.innerHTML = matched.map(c => `
    <div class="p-2.5 hover:bg-gray-50 border-b border-gray-100 cursor-pointer flex justify-between items-center text-xs"
      onclick="selectPosCustomer(${c.id}, '${c.name.replace(/'/g, "\\'")}', '${c.phone}')">
      <div>
        <div class="font-bold text-gray-800">${c.name}</div>
        <div class="text-gray-500">${c.phone}</div>
      </div>
      ${c.outstanding_balance > 0 ? `<span class="text-[10px] text-red-600 font-bold">Due: ${formatMoney(c.outstanding_balance)}</span>` : ''}
    </div>
  `).join('');
  dd.classList.remove('hidden');
};

window.selectPosCustomer = function(id, name, phone) {
  window.selectedCustomer = { id, name, phone };
  document.getElementById('posCustNameLabel').innerText = name;
  document.getElementById('posCustPhoneLabel').innerText = `(${phone})`;
  document.getElementById('posCustomerSearch').value = '';
  document.getElementById('posCustomerDropdown').classList.add('hidden');
  showToast(`Customer selected: ${name}`, 'info');
};

window.openQuickAddCustomerModal = function() {
  const existing = document.getElementById('quickAddCustModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'quickAddCustModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
      <h3 class="font-bold text-gray-900 text-sm mb-3">Add Customer</h3>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Customer Name *</label>
          <input type="text" id="qc_name" class="w-full border rounded-lg p-2 outline-none focus:border-[#D4AF37]" placeholder="e.g. Ramesh Kumar">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Phone Number *</label>
          <input type="text" id="qc_phone" class="w-full border rounded-lg p-2 outline-none focus:border-[#D4AF37]" placeholder="e.g. 9876543210">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Address (Optional)</label>
          <input type="text" id="qc_addr" class="w-full border rounded-lg p-2 outline-none focus:border-[#D4AF37]" placeholder="City / Area">
        </div>
      </div>
      <div class="mt-4 flex gap-2">
        <button onclick="document.getElementById('quickAddCustModal').remove()" class="flex-1 py-2 border rounded-lg text-xs font-semibold text-gray-600">Cancel</button>
        <button onclick="submitQuickCustomer()" class="flex-1 btn-gold py-2 rounded-lg text-xs font-bold">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.submitQuickCustomer = async function() {
  const name = document.getElementById('qc_name')?.value.trim();
  const phone = document.getElementById('qc_phone')?.value.trim();
  const address = document.getElementById('qc_addr')?.value.trim();
  if (!name || !phone) return showToast('Name and phone are required', 'error');

  try {
    const cust = await api('/customers', {
      method: 'POST',
      body: JSON.stringify({ name, phone, address })
    });
    window.allCustomers.push(cust);
    selectPosCustomer(cust.id, cust.name, cust.phone);
    document.getElementById('quickAddCustModal').remove();
    showToast('Customer added successfully', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// Checkout & Submit Sale
window.processPosCheckout = async function() {
  if (window.currentCart.length === 0) return showToast('Cart is empty. Please add items.', 'error');

  const globalDisc = parseFloat(document.getElementById('posGlobalDiscountInput')?.value) || 0;
  const isDiscReq = user.role === 'SELLER' && globalDisc > 0;

  const payload = {
    customer_id: window.selectedCustomer ? window.selectedCustomer.id : null,
    customer_name: window.selectedCustomer ? window.selectedCustomer.name : 'Walk-in Customer',
    customer_phone: window.selectedCustomer ? window.selectedCustomer.phone : 'N/A',
    requested_discount_percent: globalDisc,
    payment_method: window.posPaymentMethod,
    payments: window.posSplitPayments,
    items: window.currentCart.map(c => ({
      jewellery_id: c.jewellery_id,
      quantity: c.quantity,
      pricing_mode: c.pricing_mode || ((c.selling_price > 0 && (!c.net_weight || parseFloat(c.net_weight) <= 0)) ? 'FIXED_PRICE' : 'WEIGHT_RATE'),
      selling_price: c.selling_price || 0,
      gross_weight: c.gross_weight,
      stone_weight: c.stone_weight,
      net_weight: c.net_weight,
      purity: c.purity,
      gold_rate: c.gold_rate,
      making_charge: c.making_charge,
      making_charge_type: c.making_charge_type,
      wastage_percent: c.wastage_percent,
      stone_charge: c.stone_charge,
      other_charges: c.other_charges,
      discount_percent: c.discount_percent || globalDisc
    }))
  };

  const isSeller = user.role === 'SELLER';

  const btn = document.getElementById('btnProcessPosSale');
  btn.disabled = true;
  btn.innerText = isSeller ? 'Submitting to Owner...' : 'Processing Bill...';

  try {
    const sale = await api('/sales', { method: 'POST', body: JSON.stringify(payload) });

    if (isSeller) {
      showToast(`✓ Order #${sale.invoice_no || sale.id} sent to Owner for approval!`, 'success');
      // Reset POS cart and customer, stay in POS terminal
      window.currentCart = [];
      window.selectedCustomer = null;
      window.posSplitPayments = [];
      const discInput = document.getElementById('posGlobalDiscountInput');
      if (discInput) discInput.value = '';
      const nameLbl = document.getElementById('posCustNameLabel');
      if (nameLbl) nameLbl.innerText = 'Walk-in Customer';
      const phoneLbl = document.getElementById('posCustPhoneLabel');
      if (phoneLbl) phoneLbl.innerText = '(Default)';
      renderPosCartTable();
      btn.disabled = false;
      updatePosCalculations();
      return;
    } else {
      showToast(`Sale completed successfully! Invoice #${sale.invoice_no}`, 'success');
      // Print finalized 80mm thermal receipt for counter RP3160 printer
      window.printInvoice(sale.id, 'thermal');
      window.currentCart = [];
      window.selectedCustomer = null;
      window.posSplitPayments = [];
      renderPosCartTable();
      loadPage('sales', 'Sales & Invoices');
    }
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false;
    updatePosCalculations();
  }
};

// -------------------------------------------------------------------------
// LUXURY JEWELLERY PRINTING & PDF GENERATOR
// -------------------------------------------------------------------------
function numberToWordsINR(amount) {
  if (!amount || isNaN(amount)) return 'Zero Rupees Only';
  const num = Math.round(amount);
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n) {
    if ((n = n.toString()).length > 9) return 'Overflow';
    const nArr = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!nArr) return '';
    let str = '';
    str += (Number(nArr[1]) !== 0) ? (a[Number(nArr[1])] || b[nArr[1][0]] + ' ' + a[nArr[1][1]]) + 'Crore ' : '';
    str += (Number(nArr[2]) !== 0) ? (a[Number(nArr[2])] || b[nArr[2][0]] + ' ' + a[nArr[2][1]]) + 'Lakh ' : '';
    str += (Number(nArr[3]) !== 0) ? (a[Number(nArr[3])] || b[nArr[3][0]] + ' ' + a[nArr[3][1]]) + 'Thousand ' : '';
    str += (Number(nArr[4]) !== 0) ? (a[Number(nArr[4])] || b[nArr[4][0]] + ' ' + a[nArr[4][1]]) + 'Hundred ' : '';
    str += (Number(nArr[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(nArr[5])] || b[nArr[5][0]] + ' ' + a[nArr[5][1]]) : '';
    return str.trim();
  }
  return 'Rupees ' + inWords(num) + ' Only';
}

function buildLuxuryJewelleryDocumentHtml(opt) {
  const isEstimate = opt.docType === 'ESTIMATE';
  const minimalSlip = !!opt.minimalSlip;
  const shop = opt.shop || window.systemSettings || {};
  const docRef = opt.docNumber || (isEstimate ? 'GF-EST-DEMO' : 'GF-INV-DEMO');
  const qrDataUrl = opt.qrDataUrl || '';
  const qrUrl = opt.qrUrl || docRef;
  const dateStr = opt.dateStr || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = opt.timeStr || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const cust = opt.customer || { name: 'Walk-in Customer', phone: '-', address: '' };
  const sellerName = opt.sellerName || 'Staff';
  const amountInWords = numberToWordsINR(opt.totals.finalPayable || 0);

  const docTaxPercent = (opt.totals && opt.totals.taxPercent != null && !isNaN(parseFloat(opt.totals.taxPercent))) 
    ? parseFloat(opt.totals.taxPercent) 
    : getCurrentGstPercent();
  const halfTaxStr = (docTaxPercent / 2).toFixed(2).replace(/\.?0+$/, '') || '0';

  const grossAmt = parseFloat(opt.totals.grossAmount || 0);
  const discountTotal = parseFloat(opt.totals.discountTotal || 0);
  let discountPercent = parseFloat(opt.totals.discountPercent || 0);
  if (!discountPercent && grossAmt > 0 && discountTotal > 0) {
    discountPercent = parseFloat(((discountTotal / grossAmt) * 100).toFixed(1));
  }
  const discPercentStr = discountPercent > 0 ? (discountPercent % 1 === 0 ? discountPercent.toFixed(0) : discountPercent.toFixed(1)) + '%' : '';

  let sheetsHtml = '';
  if (isEstimate) {
    sheetsHtml = `
      <div class="doc-sheet">
        <div class="corner-accent top-left"></div>
        <div class="corner-accent top-right"></div>
        <div class="corner-accent bottom-left"></div>
        <div class="corner-accent bottom-right"></div>

        <!-- Header -->
        <div class="doc-header">
          <div class="brand-section">
            <div class="brand-crest">
              <span class="crest-star">✦</span>
            </div>
            <div>
              <div class="brand-name">${shop.shop_name || 'GOLDFLOW JEWELLERS'}</div>
              <div class="brand-tagline">
                <span>✦ 100% BIS 916 HALLMARKED CERTIFIED JEWELLERY &amp; BULLION ✦</span>
              </div>
              <div class="brand-details">
                ${shop.shop_address || '124, Gold Bazaar, Cathedral Road, Chennai - 600086'}<br>
                <span class="badge-contact">📞 ${shop.shop_phone || '+91 98765 43210'}</span>
                <span class="badge-gst">GSTIN: <strong>${shop.shop_gst || '33AAAAA0000A1Z5'}</strong></span>
                <span class="badge-bis">BIS Lic: <strong>HM-916-TN-4589</strong></span>
              </div>
            </div>
          </div>

          <div class="doc-badge-container">
            <div class="doc-type-pill doc-type-estimate">
              ✦ PRICE ESTIMATION / QUOTATION ✦
            </div>
            <div class="doc-number">${docRef}</div>
            <div class="doc-meta-pills">
              <span class="meta-pill">📅 ${dateStr}</span>
              <span class="meta-pill">⏰ ${timeStr}</span>
            </div>
            <div class="doc-staff-badge">Billed by: <strong>${sellerName}</strong></div>
          </div>
        </div>

        <!-- Customer Particulars -->
        <div class="meta-grid" style="margin-bottom:20px;">
          <div class="meta-card card-customer" style="width:100%;">
            <div class="meta-card-header">
              <span class="card-icon">👤</span>
              <span class="card-title">CUSTOMER ESTIMATION PARTICULARS</span>
            </div>
            <div class="meta-card-body" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px;">
              <div><span class="meta-label">Customer Name:</span> <strong class="customer-name">${cust.name}</strong></div>
              <div><span class="meta-label">Phone:</span> <strong class="font-mono">${cust.phone || 'Counter Sale'}</strong></div>
              <div><span class="meta-label">Quotation Ref:</span> <strong class="font-mono" style="color:#b45309;">${docRef}</strong></div>
            </div>
          </div>
        </div>

        <!-- BIG BOLD QR CODE CARD ONLY (AS REQUESTED) -->
        <div style="text-align:center; padding:36px 20px; background:#fffdf5; border:2px dashed #d4af37; border-radius:12px; margin:20px 0;">
          <div style="font-family:'Cinzel', serif; font-size:16px; font-weight:900; color:#b45309; letter-spacing:1px; margin-bottom:6px;">
            ✦ SCAN QR CODE FOR COMPLETE GOLD SPECIFICATIONS ✦
          </div>
          <div style="font-size:11.5px; color:#64748b; max-width:440px; margin:0 auto 18px auto; line-height:1.4;">
            Scan using any smartphone camera or GoldFlow Scanner to view itemized ornament weights, 22K benchmark rate, pure gold value, and charges.
          </div>
          ${qrDataUrl ? `
            <img src="${qrDataUrl}" alt="Estimate QR" style="width:190px; height:190px; margin:0 auto; display:block; padding:6px; background:#fff; border:2px solid #b45309; border-radius:12px; box-shadow:0 6px 20px rgba(180,83,9,0.15);" />
          ` : `
            <canvas class="doc-qr-canvas" data-qr="${qrUrl}" data-size="190" style="width:190px; height:190px; margin:0 auto; background:#fff; padding:6px; display:inline-block; border:2px solid #b45309; border-radius:12px;"></canvas>
          `}
          <div style="font-family:monospace; font-size:14px; font-weight:800; color:#0f172a; margin-top:12px;">
            REFERENCE: <strong>${docRef}</strong>
          </div>
          <div style="margin-top:18px; padding:12px 30px; background:#fef3c7; border:1px solid #fde68a; border-radius:8px; display:inline-block;">
            <span style="font-size:12px; font-weight:700; color:#92400e; text-transform:uppercase;">Estimated Total Amount:</span>
            <span style="font-family:monospace; font-size:20px; font-weight:900; color:#b45309; margin-left:10px;">${formatMoney(opt.totals.finalPayable || 0)}</span>
          </div>
        </div>

        <!-- Footer Note -->
        <div class="sig-container" style="justify-content:center; text-align:center; padding-top:16px; border-top:1px solid #e2e8f0; margin-top:24px;">
          <div class="sig-center-note" style="max-width:100%;">
            <span class="gold-star">✦</span> Thank You For Visiting ${shop.shop_name || 'GoldFlow Jewellers'} <span class="gold-star">✦</span>
            <div style="font-size:9px; color:#64748b; margin-top:3px; font-weight:600;">Price Estimation Quotation • Valid for Today Only Based on Live Market Rates</div>
          </div>
        </div>
      </div>
    `;
  } else {
    sheetsHtml = (opt.sheets || [opt.items]).map((itemList, sheetIdx) => {
    const isMultiSheet = (opt.sheets && opt.sheets.length > 1);
    const sheetPageBreak = isMultiSheet && sheetIdx < opt.sheets.length - 1 ? '<div class="page-break"></div>' : '';

    let sheetGrossWt = 0, sheetStoneWt = 0, sheetNetWt = 0, sheetGoldVal = 0, sheetWastage = 0, sheetMaking = 0, sheetStone = 0, sheetLineTotal = 0;
    const rowsHtml = itemList.map((item, idx) => {
      const gross = parseFloat(item.gross_weight || 0);
      const stone = parseFloat(item.stone_weight || 0);
      const net = parseFloat(item.net_weight || Math.max(0, gross - stone));
      const rate = parseFloat(item.gold_rate || 7000);
      const qty = parseInt(item.quantity || 1);
      const gVal = item.gold_value != null ? item.gold_value : Math.round(net * rate * qty);
      const wVal = item.wastage_amount != null ? item.wastage_amount : 0;
      const mVal = item.making_charge != null ? item.making_charge : 0;
      const sVal = item.stone_charge != null ? item.stone_charge : 0;
      const total = item.line_total != null ? item.line_total : (gVal + wVal + mVal + sVal);

      sheetGrossWt += gross * qty;
      sheetStoneWt += stone * qty;
      sheetNetWt += net * qty;
      sheetGoldVal += gVal;
      sheetWastage += wVal;
      sheetMaking += mVal;
      sheetStone += sVal;
      sheetLineTotal += total;

      let purityClass = 'purity-22k';
      const pStr = (item.purity || '22K').toUpperCase();
      if (pStr.includes('18')) purityClass = 'purity-18k';
      else if (pStr.includes('24') || pStr.includes('999')) purityClass = 'purity-24k';
      else if (pStr.includes('SILVER')) purityClass = 'purity-silver';

      return `
        <tr>
          <td class="text-center font-mono item-idx">${idx + 1}</td>
          <td>
            <div class="item-name">${item.name}</div>
            <div class="item-sub">
              ${item.code ? `<span class="tag-chip">TAG: <strong>${item.code}</strong></span>` : ''}
              ${item.barcode ? `<span class="barcode-chip">BARCODE: ${item.barcode}</span>` : ''}
              ${qty > 1 ? `<span class="qty-chip">QTY: <strong>${qty}</strong></span>` : ''}
            </div>
          </td>
          <td class="text-center">
            <span class="purity-badge ${purityClass}">${item.purity || '22K'}</span>
          </td>
          <td class="text-right font-mono">${gross.toFixed(3)}g</td>
          <td class="text-right font-mono stone-val">${stone > 0 ? stone.toFixed(3) + 'g' : '0.000g'}</td>
          <td class="text-right font-mono net-val">${net.toFixed(3)}g</td>
          <td class="text-right font-mono rate-val">₹${rate.toLocaleString('en-IN')}/g</td>
          <td class="text-right font-mono gval-val">${formatMoney(gVal)}</td>
          <td class="text-right font-mono fee-val">${wVal > 0 ? formatMoney(wVal) : (item.wastage_percent ? item.wastage_percent + '%' : '-')}</td>
          <td class="text-right font-mono fee-val">${mVal > 0 ? formatMoney(mVal) : '-'}</td>
          <td class="text-right font-mono fee-val">${sVal > 0 ? formatMoney(sVal) : '-'}</td>
          <td class="text-right font-mono line-total-val">${formatMoney(total)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="doc-sheet">
        <div class="corner-accent top-left"></div>
        <div class="corner-accent top-right"></div>
        <div class="corner-accent bottom-left"></div>
        <div class="corner-accent bottom-right"></div>

        <!-- Header -->
        <div class="doc-header">
          <div class="brand-section">
            <div class="brand-crest">
              <span class="crest-star">✦</span>
            </div>
            <div>
              <div class="brand-name">${shop.shop_name || 'GOLDFLOW JEWELLERS'}</div>
              <div class="brand-tagline">
                <span>✦ 100% BIS 916 HALLMARKED CERTIFIED JEWELLERY &amp; BULLION ✦</span>
              </div>
              <div class="brand-details">
                ${shop.shop_address || '124, Gold Bazaar, Cathedral Road, Chennai - 600086'}<br>
                <span class="badge-contact">📞 ${shop.shop_phone || '+91 98765 43210'}</span>
                <span class="badge-gst">GSTIN: <strong>${shop.shop_gst || '33AAAAA0000A1Z5'}</strong></span>
                <span class="badge-bis">BIS Lic: <strong>HM-916-TN-4589</strong></span>
              </div>
            </div>
          </div>

          <div class="doc-badge-container">
            <div class="doc-type-pill ${isEstimate ? 'doc-type-estimate' : 'doc-type-invoice'}">
              ${isEstimate ? '✦ PRICE ESTIMATION / QUOTATION ✦' : '✦ OFFICIAL TAX INVOICE ✦'}
            </div>
            <div class="doc-number">${docRef}${isMultiSheet ? '-' + (sheetIdx + 1) : ''}</div>
            <div class="doc-meta-pills">
              <span class="meta-pill">📅 ${dateStr}</span>
              <span class="meta-pill">⏰ ${timeStr}</span>
            </div>
            <div class="doc-staff-badge">Billed by: <strong>${sellerName}</strong></div>
          </div>
        </div>

        <!-- Customer & Billing Metadata -->
        <div class="meta-grid">
          <div class="meta-card card-customer">
            <div class="meta-card-header">
              <span class="card-icon">👤</span>
              <span class="card-title">CUSTOMER PARTICULARS</span>
            </div>
            <div class="meta-card-body">
              <div class="meta-card-row">
                <span class="meta-label">Customer Name:</span>
                <strong class="meta-val customer-name">${cust.name}</strong>
              </div>
              <div class="meta-card-row">
                <span class="meta-label">Contact Phone:</span>
                <strong class="meta-val font-mono">${cust.phone || 'Counter / Walk-in'}</strong>
              </div>
              <div class="meta-card-row">
                <span class="meta-label">Billing Address:</span>
                <span class="meta-val address-val">${cust.address ? cust.address : 'Store Counter Sale'}</span>
              </div>
            </div>
          </div>

          <div class="meta-card card-billing">
            <div class="meta-card-header">
              <span class="card-icon">⚖️</span>
              <span class="card-title">BENCHMARK &amp; BILLING</span>
            </div>
            <div class="meta-card-body">
              <div class="meta-card-row">
                <span class="meta-label">Live Benchmark Rate:</span>
                <span class="rate-benchmark font-mono">₹${(window.latestRates && window.latestRates['22K'] ? window.latestRates['22K'] : 7000).toLocaleString('en-IN')}/g (22K)</span>
              </div>
              <div class="meta-card-row">
                <span class="meta-label">Payment Mode:</span>
                <span class="payment-badge font-mono">${opt.paymentMethod || 'CASH'}</span>
              </div>
              <div class="meta-card-row">
                <span class="meta-label">Invoice Status:</span>
                <span class="status-badge ${isEstimate ? 'status-estimate' : 'status-paid'}">${isEstimate ? 'QUOTATION (NON-TAX)' : (opt.paymentStatus || 'PAID')}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Jewellery Specification Table -->
        <table class="jewellery-table">
          <thead>
            <tr>
              <th style="width: 26px;" class="text-center">#</th>
              <th>Ornament Description</th>
              <th style="width: 70px;" class="text-center">Purity</th>
              <th style="width: 66px;" class="text-right">Gross Wt</th>
              <th style="width: 62px;" class="text-right">Stone Wt</th>
              <th style="width: 68px;" class="text-right th-highlight">Net Gold</th>
              <th style="width: 68px;" class="text-right">Rate/g</th>
              <th style="width: 80px;" class="text-right">Gold Value</th>
              <th style="width: 60px;" class="text-right">VA / Wast</th>
              <th style="width: 58px;" class="text-right">Making</th>
              <th style="width: 54px;" class="text-right">Stone</th>
              <th style="width: 86px;" class="text-right th-highlight-amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr class="tfoot-totals">
              <td colspan="3" class="text-right" style="font-weight:900; text-transform:uppercase; letter-spacing:0.6px; color:#1e293b; font-size:9.5px; padding-right:10px;">
                TOTAL WEIGHTS &amp; SUB-TOTAL:
              </td>
              <td class="text-right font-mono" style="font-weight:800; color:#0f172a;">${sheetGrossWt.toFixed(3)}g</td>
              <td class="text-right font-mono" style="font-weight:600; color:#64748b;">${sheetStoneWt.toFixed(3)}g</td>
              <td class="text-right font-mono tfoot-net-gold">${sheetNetWt.toFixed(3)}g</td>
              <td class="text-right font-mono">-</td>
              <td class="text-right font-mono" style="font-weight:800; color:#0f172a;">${formatMoney(sheetGoldVal)}</td>
              <td class="text-right font-mono" style="color:#64748b;">${sheetWastage > 0 ? formatMoney(sheetWastage) : '-'}</td>
              <td class="text-right font-mono" style="color:#64748b;">${sheetMaking > 0 ? formatMoney(sheetMaking) : '-'}</td>
              <td class="text-right font-mono" style="color:#64748b;">${sheetStone > 0 ? formatMoney(sheetStone) : '-'}</td>
              <td class="text-right font-mono tfoot-amount">${formatMoney(sheetLineTotal)}</td>
            </tr>
          </tfoot>
        </table>

        <!-- Summary & Totals -->
        <div class="summary-grid">
          <div class="summary-left">
            <div class="hallmark-cert">
              <div class="hallmark-icon-wrap">🛡️</div>
              <div class="hallmark-content">
                <div class="hallmark-title">100% BIS 916 HALLMARKED CERTIFIED GUARANTEE</div>
                <div class="hallmark-desc">Authentic certified jewellery bearing the official BIS Triangular Mark &amp; Unique Laser HUID identification.</div>
                <div class="hallmark-chips">
                  <span>✓ BIS Logo</span>
                  <span>✓ 916 Purity</span>
                  <span>✓ Assayed Centre</span>
                  <span>✓ Laser HUID</span>
                </div>
              </div>
            </div>


            <div class="words-card">
              <div class="words-card-label">✦ AMOUNT IN WORDS (INDIAN RUPEES) ✦</div>
              <div class="words-card-body">${amountInWords}</div>
            </div>

            <div class="terms-card">
              <div class="terms-title">TERMS &amp; CONDITIONS:</div>
              <p>${shop.terms_and_conditions || '1. Price estimations are valid only for today based on live gold market rates. 2. Returns & exchange accepted within 7 days in original condition with bill. Weight and purity certified.'}</p>
            </div>
          </div>

          <div class="summary-right">
            <div class="totals-box">
              <div class="totals-header">
                <span>✦ TAX INVOICE CALCULATION ✦</span>
              </div>
              <div class="totals-body">
                <div class="calc-row"><span>Pure Gold Value:</span><strong class="font-mono">${formatMoney(opt.totals.goldValueTotal || 0)}</strong></div>
                ${opt.totals.wastageTotal > 0 ? `<div class="calc-row"><span>Wastage Charges (VA):</span><span class="font-mono">${formatMoney(opt.totals.wastageTotal)}</span></div>` : ''}
                ${opt.totals.makingTotal > 0 ? `<div class="calc-row"><span>Making Charges:</span><span class="font-mono">${formatMoney(opt.totals.makingTotal)}</span></div>` : ''}
                ${opt.totals.stoneTotal > 0 ? `<div class="calc-row"><span>Stone Charges:</span><span class="font-mono">${formatMoney(opt.totals.stoneTotal)}</span></div>` : ''}
                <div class="calc-row divider"><span>Gross Subtotal:</span><strong class="font-mono">${formatMoney(opt.totals.grossAmount || 0)}</strong></div>
                ${opt.totals.discountTotal > 0 ? `
                  <div class="calc-row discount-row">
                    <span>Discount ${discPercentStr ? '(' + discPercentStr + ')' : ''}:</span>
                    <strong class="font-mono">-${formatMoney(opt.totals.discountTotal)}</strong>
                  </div>
                ` : ''}
                <div class="calc-row"><span>Taxable Value:</span><span class="font-mono">${formatMoney(opt.totals.taxableAmount || (opt.totals.grossAmount - opt.totals.discountTotal) || 0)}</span></div>
                <div class="calc-row tax-row"><span>CGST (${halfTaxStr}%):</span><span class="font-mono">${formatMoney((opt.totals.taxAmount || 0) / 2)}</span></div>
                <div class="calc-row tax-row"><span>SGST (${halfTaxStr}%):</span><span class="font-mono">${formatMoney((opt.totals.taxAmount || 0) / 2)}</span></div>
                ${opt.totals.roundOff ? `
                  <div class="calc-row"><span>Round Off:</span><span class="font-mono">${opt.totals.roundOff > 0 ? '+' : ''}${opt.totals.roundOff.toFixed(2)}</span></div>
                ` : ''}
              </div>
              <div class="calc-row final-highlight">
                <div class="final-title">${isEstimate ? 'ESTIMATED TOTAL' : 'TOTAL AMOUNT PAYABLE'}:</div>
                <div class="final-amount font-mono">${formatMoney(opt.totals.finalPayable || 0)}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Note (Signatures Removed as Requested) -->
        <div class="sig-container" style="justify-content:center; text-align:center; padding-top:12px; border-top:1px solid #e2e8f0;">
          <div class="sig-center-note" style="max-width:100%;">
            <span class="gold-star">✦</span> Thank You For Choosing ${shop.shop_name || 'GoldFlow Jewellers'} <span class="gold-star">✦</span>
            <div style="font-size:8px; color:#64748b; margin-top:3px; font-weight:600;">Original Tax Invoice • Computer Generated Invoice • No Signature Required</div>
          </div>
        </div>
      </div>
      ${sheetPageBreak}
    `;
  }).join('');
}

  let totalGrossWt = 0, totalStoneWt = 0, totalNetWt = 0;
  const thermalItemsHtml = opt.items.map((item, idx) => {
    const gross = parseFloat(item.gross_weight || 0);
    const stone = parseFloat(item.stone_weight || 0);
    const net = parseFloat(item.net_weight || Math.max(0, gross - stone));
    const rate = parseFloat(item.gold_rate || 7000);
    const qty = parseInt(item.quantity || 1);
    const gVal = item.gold_value != null ? item.gold_value : Math.round(net * rate * qty);
    const wVal = item.wastage_amount != null ? item.wastage_amount : 0;
    const mVal = item.making_charge != null ? item.making_charge : 0;
    const sVal = item.stone_charge != null ? item.stone_charge : 0;
    const total = item.line_total != null ? item.line_total : (gVal + wVal + mVal + sVal);

    totalGrossWt += gross * qty;
    totalStoneWt += stone * qty;
    totalNetWt += net * qty;

    const tagStr = [item.code ? `Tag: ${item.code}` : '', item.barcode ? `Barcode: ${item.barcode}` : '', qty > 1 ? `Qty: ${qty}` : ''].filter(Boolean).join(' | ');

    return `
      <div class="th-item-entry">
        <div class="th-item-title-row">
          <span>${idx + 1}. ${item.name}</span>
          <span class="th-purity-tag">${item.purity || '22K 916'}</span>
        </div>
        ${tagStr ? `<div class="th-item-details-row">${tagStr}</div>` : ''}
        <div class="th-item-wt-row">
          <span>Gross: <strong>${gross.toFixed(3)}g</strong></span>
          <span>Stone: <strong>${stone.toFixed(3)}g</strong></span>
          <span class="th-net-pill">Net Gold: <strong>${net.toFixed(3)}g</strong></span>
        </div>
        <div class="th-item-val-row">
          <span>Rate: ₹${rate.toLocaleString('en-IN')}/g</span>
          <span>Gold Val: <strong>${formatMoney(gVal)}</strong></span>
        </div>
        ${(wVal > 0 || mVal > 0 || sVal > 0) ? `
          <div class="th-item-val-row" style="color:#000;">
            ${wVal > 0 ? `<span>VA (${item.wastage_percent ? item.wastage_percent + '%' : 'VA'}): ${formatMoney(wVal)}</span>` : ''}
            ${mVal > 0 ? `<span>MC: ${formatMoney(mVal)}</span>` : ''}
            ${sVal > 0 ? `<span>Stone: ${formatMoney(sVal)}</span>` : ''}
          </div>
        ` : ''}
        <div class="th-item-total">
          <span>Item Total:</span>
          <strong>${formatMoney(total)}</strong>
        </div>
      </div>
    `;
  }).join('');

  const benchmarkRate = (window.latestRates && window.latestRates['22K']) ? window.latestRates['22K'] : 7000;
  const hasExtraCharges = (opt.totals.wastageTotal > 0 || opt.totals.makingTotal > 0 || opt.totals.stoneTotal > 0);
  const hasDiscount = (opt.totals.discountTotal > 0);

  // -------------------------------------------------------------
  // UNIVERSAL THERMAL SLIP (ALL PRINTERS: 4-INCH, 3-INCH, 2-INCH, TVS, RP3160, EPSON, ETC.)
  // -------------------------------------------------------------
  let thermalContentHtml = '';

  if (minimalSlip) {
    // Seller POS slip: Modern Luxury Compact Card with Small Content, QR Code & 1D Barcode
    const itemsCount = opt.items ? opt.items.length : 1;
    const estTotalFormatted = formatMoney(opt.totals ? (opt.totals.finalPayable || 0) : 0);
    thermalContentHtml = `
      <div id="thermalContainer" class="thermal-receipt" style="text-align:center; padding:3mm 4mm; max-width:92mm; margin:0 auto; box-sizing:border-box;">
        <!-- Store Header (Modern Luxury) -->
        <div class="th-header" style="margin-bottom:2px;">
          <div class="th-shop-name" style="font-size:15px; font-weight:900; letter-spacing:0.5px;">✦ ${shop.shop_name || 'GOLDFLOW JEWELLERS'} ✦</div>
          <div class="th-shop-sub" style="font-size:7.5px; font-weight:800; margin-top:1px;">100% BIS 916 HALLMARKED CERTIFIED JEWELLERY</div>
          <div class="th-shop-info" style="font-size:7px; color:#222; margin-top:1px;">
            ${shop.shop_address || '123 Commercial Street, Gold Bazaar, Chennai'} &bull; Ph: ${shop.shop_phone || '+91 98765 43210'}<br>
            GSTIN: <strong>${shop.shop_gst || '33AAAAA0000A1Z5'}</strong>
          </div>
        </div>

        <div class="th-divider-dashed" style="margin:2px 0;"></div>

        <!-- Document Title Banner -->
        <div class="th-doc-title" style="font-size:9.5px; font-weight:900; letter-spacing:0.6px; padding:1px 0;">
          *** ESTIMATION QUOTATION SLIP ***
        </div>

        <div class="th-divider-dashed" style="margin:2px 0;"></div>

        <!-- Compact Metadata Grid -->
        <div class="th-meta-grid" style="font-size:8px; line-height:1.25; margin:1.5px 0;">
          <div class="th-meta-row" style="display:flex; justify-content:space-between;">
            <span>Est No: <strong>${docRef}</strong></span>
            <span>Date: <strong>${dateStr} ${timeStr}</strong></span>
          </div>
          <div class="th-meta-row" style="display:flex; justify-content:space-between; margin-top:1px;">
            <span>Customer: <strong>${cust.name || 'Walk-in Customer'}${cust.phone && cust.phone !== '-' ? ' (' + cust.phone + ')' : ''}</strong></span>
            <span>Valid: <strong>Today Only</strong></span>
          </div>
        </div>

        <!-- Modern Summary Box (Dashed Card) -->
        <div class="th-weights-box" style="border:1px dashed #000; border-radius:3px; padding:2.5px 4px; margin:2.5px 0; background:#fafafa;">
          <div style="display:flex; justify-content:space-around; align-items:center;">
            <div style="text-align:center;">
              <span style="font-size:6.5px; font-weight:800; color:#333; display:block;">ITEMS</span>
              <strong style="font-size:9px; color:#000;">${itemsCount}</strong>
            </div>
            <div style="width:1px; height:16px; border-right:1px dashed #666;"></div>
            <div style="text-align:center;">
              <span style="font-size:6.5px; font-weight:800; color:#333; display:block;">NET GOLD</span>
              <strong style="font-size:9px; color:#000;">${totalNetWt.toFixed(3)}g</strong>
            </div>
            <div style="width:1px; height:16px; border-right:1px dashed #666;"></div>
            <div style="text-align:center;">
              <span style="font-size:6.5px; font-weight:800; color:#333; display:block;">EST. TOTAL</span>
              <strong style="font-size:11px; color:#000;">${estTotalFormatted}</strong>
            </div>
          </div>
        </div>

        <!-- QR Code Section -->
        <div class="th-qr-card" style="border:1px dashed #000; border-radius:3px; padding:2px 2px 3px 2px; margin:2.5px 0;">
          <div class="th-qr-badge" style="font-size:7px; font-weight:900; letter-spacing:0.3px; margin-bottom:2px;">
            ★ SCAN QR FOR FULL SPECS &amp; LIVE RATES ★
          </div>
          <div class="th-qr-img-wrap">
            ${qrDataUrl ? `
              <img src="${qrDataUrl}" alt="QR" style="width:38mm; height:38mm; margin:0 auto; display:block; background:#fff; border:1px dashed #000; padding:2px;" />
            ` : `
              <canvas class="doc-qr-canvas" data-qr="${qrUrl}" data-size="145" style="width:38mm; height:38mm; margin:0 auto; display:block; background:#fff; border:1px dashed #000; padding:2px;"></canvas>
            `}
          </div>
        </div>

        <!-- 1D Linear Barcode Section (Required by User: "aana bar code show aaganum bro") -->
        <div style="margin:2.5px 0 1.5px 0; text-align:center;">
          <div style="display:inline-block; margin:0 auto;">
            <svg class="doc-barcode-svg" data-barcode="${docRef}" style="max-width:54mm; height:24px; margin:0 auto; display:block;"></svg>
          </div>
          <div style="font-family:monospace; font-size:8px; font-weight:900; letter-spacing:1px; color:#000; margin-top:1px;">
            ${docRef}
          </div>
        </div>

        <div class="th-divider-dashed" style="margin:2px 0;"></div>

        <!-- Footer -->
        <div class="th-thanks-sign" style="font-size:7.5px; font-weight:800; margin-top:2px;">
          ★ THANK YOU • VISIT AGAIN ★ • ${shop.shop_name || 'GoldFlow Jewellers'}<br>
          <span style="font-size:6.5px; font-weight:600; color:#333;">Price quotation valid for today only based on live gold market rates.</span>
        </div>
      </div>
    `;
  } else if (isEstimate) {
    thermalContentHtml = `
      <div id="thermalContainer" class="thermal-receipt">
        <!-- Store Header -->
        <div class="th-header">
          <div class="th-shop-name">✦ ${shop.shop_name || 'GOLDFLOW JEWELLERS'} ✦</div>
          <div class="th-shop-sub">100% BIS 916 HALLMARKED CERTIFIED JEWELLERY</div>
          <div class="th-shop-info">
            ${shop.shop_address || '123 Commercial Street, Gold Bazaar, Chennai'} &bull; Ph: ${shop.shop_phone || '+91 98765 43210'}<br>
            GSTIN: <strong>${shop.shop_gst || '33AAAAA0000A1Z5'}</strong>
          </div>
        </div>

        <div class="th-divider-dashed"></div>

        <!-- Document Title Banner -->
        <div class="th-doc-title">
          *** PRICE ESTIMATION / QUOTATION ***
        </div>

        <div class="th-divider-dashed"></div>

        <!-- Metadata Grid (Compact 2 Rows) -->
        <div class="th-meta-grid">
          <div class="th-meta-row"><span>Est No: <strong>${docRef}</strong></span><span>Date: <strong>${dateStr} ${timeStr}</strong></span></div>
          <div class="th-meta-row"><span>Customer: <strong>${cust.name}${cust.phone && cust.phone !== 'N/A' ? ' (' + cust.phone + ')' : ''}</strong></span><span>Valid: <strong>Today Only</strong></span></div>
        </div>

        <!-- Live 22K Benchmark Rate -->
        <div class="th-live-rate">
          <span>TODAY LIVE 22K (916) BENCHMARK RATE:</span>
          <strong>₹${benchmarkRate.toLocaleString('en-IN')}/g</strong>
        </div>

        <div class="th-divider-dashed"></div>

        <!-- Ornament Specifications Table / Cards -->
        <div class="th-section-heading">ORNAMENT SPECIFICATIONS &amp; CHARGES:</div>
        ${thermalItemsHtml}

        <!-- Total Weights Summary Box (Dashed Rectangle) -->
        <div class="th-weights-box">
          <div class="th-wt-summary-row">
            <div class="th-wt-summary-cell">
              <span class="th-wt-label">GROSS WT:</span>
              <span class="th-wt-val">${totalGrossWt.toFixed(3)}g</span>
            </div>
            <div class="th-wt-summary-cell">
              <span class="th-wt-label">STONE WT:</span>
              <span class="th-wt-val">${totalStoneWt.toFixed(3)}g</span>
            </div>
            <div class="th-wt-summary-cell th-net-highlight">
              <span class="th-wt-label">NET GOLD:</span>
              <span class="th-wt-val">${totalNetWt.toFixed(3)}g</span>
            </div>
          </div>
        </div>

        <!-- Financial Valuation Calculation Block -->
        <div class="th-calc-block">
          <div class="th-calc-row"><span>Pure Gold Value:</span><strong>${formatMoney(opt.totals.goldValueTotal || 0)}</strong></div>
          ${opt.totals.wastageTotal > 0 ? `<div class="th-calc-row"><span>Total Wastage (VA):</span><span>${formatMoney(opt.totals.wastageTotal)}</span></div>` : ''}
          ${opt.totals.makingTotal > 0 ? `<div class="th-calc-row"><span>Making Charges:</span><span>${formatMoney(opt.totals.makingTotal)}</span></div>` : ''}
          ${opt.totals.stoneTotal > 0 ? `<div class="th-calc-row"><span>Stone Charges:</span><span>${formatMoney(opt.totals.stoneTotal)}</span></div>` : ''}
          
          ${hasExtraCharges ? `
            <div class="th-calc-row th-divider-top">
              <span>Gross Subtotal:</span><strong>${formatMoney(opt.totals.grossAmount || 0)}</strong>
            </div>
          ` : ''}

          ${hasDiscount ? `
            <div class="th-calc-discount">
              <span>OWNER APPROVED DISCOUNT ${discPercentStr ? '(' + discPercentStr + ')' : ''}:</span>
              <strong>-${formatMoney(opt.totals.discountTotal)}</strong>
            </div>
            <div class="th-calc-row"><span>Taxable Value:</span><span>${formatMoney(opt.totals.taxableAmount || (opt.totals.grossAmount - opt.totals.discountTotal) || 0)}</span></div>
          ` : ''}

          ${(opt.totals.taxAmount > 0) ? `
            <div class="th-calc-row"><span>CGST (${halfTaxStr}%):</span><span>${formatMoney((opt.totals.taxAmount || 0) / 2)}</span></div>
            <div class="th-calc-row"><span>SGST (${halfTaxStr}%):</span><span>${formatMoney((opt.totals.taxAmount || 0) / 2)}</span></div>
          ` : ''}
          
          ${opt.totals.roundOff ? `
            <div class="th-calc-row"><span>Round Off:</span><span>${opt.totals.roundOff > 0 ? '+' : ''}${opt.totals.roundOff.toFixed(2)}</span></div>
          ` : ''}
        </div>

        <!-- Estimated Net Total Banner (Dashed Rectangle Box) -->
        <div class="th-net-payable-box">
          <div class="th-payable-label">ESTIMATED NET TOTAL</div>
          <div class="th-payable-amount">${formatMoney(opt.totals.finalPayable || 0)}</div>
          <div class="th-payable-sub">(Valid for Today Only Based on Live Market Rates)</div>
        </div>

        <!-- Amount in Words -->
        <div class="th-words-block">
          <div class="th-words-label">AMOUNT IN WORDS (INDIAN RUPEES):</div>
          <div class="th-words-body">${amountInWords}</div>
        </div>

        <!-- HIGH RESOLUTION CRISP COMPACT QR CODE (Fits cleanly on 1 sheet!) -->
        <div class="th-qr-card">
          <div class="th-qr-badge">★ SCAN QR FOR FULL SPECS &amp; OWNER DISCOUNT ★</div>
          <div class="th-qr-img-wrap">
            ${qrDataUrl ? `
              <img src="${qrDataUrl}" alt="Estimate QR" style="width: 65px; height: 65px; margin: 0 auto; display: block; border: 1px dashed #000; padding: 2px; background: #fff;" />
            ` : `
              <canvas class="doc-qr-canvas" data-qr="${qrUrl}" data-size="65" style="width:65px; height:65px; margin:0 auto; background:#fff; padding:2px; display:inline-block; border:1px dashed #000;"></canvas>
            `}
          </div>
          <div class="th-qr-ref">${docRef}</div>
        </div>

        <!-- 100% BIS 916 Hallmark Certification Badge (Dashed Rectangle Box) -->
        <div class="th-hallmark-box">
          <div class="th-hallmark-title">❖ 100% BIS 916 HALLMARKED CERTIFIED GUARANTEE ❖</div>
          <div class="th-hallmark-chips">
            <span>✓ BIS Logo</span>
            <span>✓ 916 Purity</span>
            <span>✓ Assay Centre</span>
            <span>✓ Laser HUID</span>
          </div>
          <div class="th-hallmark-note">Price estimation quotation valid for today only.</div>
        </div>

        <!-- Terms & Conditions -->
        <div class="th-terms-box">
          <strong>Terms:</strong> Returns accepted within 7 days with bill. Purity &amp; weight certified as per BIS standards.
        </div>

        <div class="th-divider-dashed"></div>

        <!-- Footer & Barcode -->
        <div class="th-thanks-sign">
          ★ THANK YOU • VISIT AGAIN ★ • ${shop.shop_name || 'GoldFlow Jewellers'}<br>
          <span style="font-family:monospace; letter-spacing:2px; font-size:10px;">||| | ||||| || |||||| ||||</span> &bull; <strong>${docRef}</strong>
        </div>
      </div>
    `;
  } else {
    thermalContentHtml = `
      <div id="thermalContainer" class="thermal-receipt">
        <!-- Store Header -->
        <div class="th-header">
          <div class="th-shop-name">✦ ${shop.shop_name || 'GOLDFLOW JEWELLERS'} ✦</div>
          <div class="th-shop-sub">100% BIS 916 HALLMARKED CERTIFIED JEWELLERY</div>
          <div class="th-shop-info">
            ${shop.shop_address || '123 Commercial Street, Gold Bazaar, Chennai'} &bull; Ph: ${shop.shop_phone || '+91 98765 43210'}<br>
            GSTIN: <strong>${shop.shop_gst || '33AAAAA0000A1Z5'}</strong>
          </div>
        </div>

        <div class="th-divider-dashed"></div>

        <!-- Document Title Banner -->
        <div class="th-doc-title">
          *** OFFICIAL TAX INVOICE ***
        </div>

        <div class="th-divider-dashed"></div>

        <!-- Metadata Grid (Compact 2 Rows) -->
        <div class="th-meta-grid">
          <div class="th-meta-row"><span>Inv No: <strong>${docRef}</strong></span><span>Date: <strong>${dateStr} ${timeStr}</strong></span></div>
          <div class="th-meta-row"><span>Customer: <strong>${cust.name}${cust.phone && cust.phone !== 'N/A' ? ' (' + cust.phone + ')' : ''}</strong></span><span>Payment: <strong>${opt.paymentMethod || 'CASH'} (${opt.paymentStatus || 'PAID'})</strong></span></div>
        </div>

        <!-- Live 22K Benchmark Rate -->
        <div class="th-live-rate">
          <span>TODAY LIVE 22K (916) BENCHMARK RATE:</span>
          <strong>₹${benchmarkRate.toLocaleString('en-IN')}/g</strong>
        </div>

        <div class="th-divider-dashed"></div>

        <!-- Ornament Specifications Table / Cards -->
        <div class="th-section-heading">ORNAMENT SPECIFICATIONS &amp; CHARGES:</div>
        ${thermalItemsHtml}

        <!-- Total Weights Summary Box (Dashed Rectangle) -->
        <div class="th-weights-box">
          <div class="th-wt-summary-row">
            <div class="th-wt-summary-cell">
              <span class="th-wt-label">GROSS WT:</span>
              <span class="th-wt-val">${totalGrossWt.toFixed(3)}g</span>
            </div>
            <div class="th-wt-summary-cell">
              <span class="th-wt-label">STONE WT:</span>
              <span class="th-wt-val">${totalStoneWt.toFixed(3)}g</span>
            </div>
            <div class="th-wt-summary-cell th-net-highlight">
              <span class="th-wt-label">NET GOLD:</span>
              <span class="th-wt-val">${totalNetWt.toFixed(3)}g</span>
            </div>
          </div>
        </div>

        <!-- Financial Valuation Calculation Block -->
        <div class="th-calc-block">
          <div class="th-calc-row"><span>Pure Gold Value:</span><strong>${formatMoney(opt.totals.goldValueTotal || 0)}</strong></div>
          ${opt.totals.wastageTotal > 0 ? `<div class="th-calc-row"><span>Total Wastage (VA):</span><span>${formatMoney(opt.totals.wastageTotal)}</span></div>` : ''}
          ${opt.totals.makingTotal > 0 ? `<div class="th-calc-row"><span>Making Charges:</span><span>${formatMoney(opt.totals.makingTotal)}</span></div>` : ''}
          ${opt.totals.stoneTotal > 0 ? `<div class="th-calc-row"><span>Stone Charges:</span><span>${formatMoney(opt.totals.stoneTotal)}</span></div>` : ''}
          
          ${hasExtraCharges ? `
            <div class="th-calc-row th-divider-top">
              <span>Gross Subtotal:</span><strong>${formatMoney(opt.totals.grossAmount || 0)}</strong>
            </div>
          ` : ''}

          ${hasDiscount ? `
            <div class="th-calc-discount">
              <span>DISCOUNT / OWNER APPROVED ${discPercentStr ? '(' + discPercentStr + ')' : ''}:</span>
              <strong>-${formatMoney(opt.totals.discountTotal)}</strong>
            </div>
            <div class="th-calc-row"><span>Taxable Value:</span><span>${formatMoney(opt.totals.taxableAmount || (opt.totals.grossAmount - opt.totals.discountTotal) || 0)}</span></div>
          ` : ''}

          ${(opt.totals.taxAmount > 0) ? `
            <div class="th-calc-row"><span>CGST (${halfTaxStr}%):</span><span>${formatMoney((opt.totals.taxAmount || 0) / 2)}</span></div>
            <div class="th-calc-row"><span>SGST (${halfTaxStr}%):</span><span>${formatMoney((opt.totals.taxAmount || 0) / 2)}</span></div>
          ` : `
            <div class="th-calc-row"><span>GST (0%):</span><span>₹0.00</span></div>
          `}
          
          ${opt.totals.roundOff ? `
            <div class="th-calc-row"><span>Round Off:</span><span>${opt.totals.roundOff > 0 ? '+' : ''}${opt.totals.roundOff.toFixed(2)}</span></div>
          ` : ''}
        </div>

        <!-- Net Amount Payable Banner (Dashed Rectangle Box) -->
        <div class="th-net-payable-box">
          <div class="th-payable-label">TOTAL AMOUNT PAYABLE</div>
          <div class="th-payable-amount">${formatMoney(opt.totals.finalPayable || 0)}</div>
          <div class="th-payable-sub">Net Amount Paid in Full</div>
        </div>

        <!-- Amount in Words -->
        <div class="th-words-block">
          <div class="th-words-label">AMOUNT IN WORDS (INDIAN RUPEES):</div>
          <div class="th-words-body">${amountInWords}</div>
        </div>

        <!-- 100% BIS 916 Hallmark Certification Badge (Dashed Rectangle Box) -->
        <div class="th-hallmark-box">
          <div class="th-hallmark-title">❖ 100% BIS 916 HALLMARKED CERTIFIED GUARANTEE ❖</div>
          <div class="th-hallmark-chips">
            <span>✓ BIS Logo</span>
            <span>✓ 916 Purity</span>
            <span>✓ Assay Centre</span>
            <span>✓ Laser HUID</span>
          </div>
          <div class="th-hallmark-note">Official Computer Generated Tax Invoice • No Signature Required</div>
        </div>

        <!-- Terms & Conditions -->
        <div class="th-terms-box">
          <strong>Terms:</strong> Returns accepted within 7 days with bill. Purity &amp; weight certified as per BIS standards.
        </div>

        <div class="th-divider-dashed"></div>

        <!-- Footer & Barcode -->
        <div class="th-thanks-sign">
          ★ THANK YOU • VISIT AGAIN ★ • ${shop.shop_name || 'GoldFlow Jewellers'}<br>
          <span style="font-family:monospace; letter-spacing:2px; font-size:10px;">||| | ||||| || |||||| ||||</span> &bull; <strong>${docRef}</strong>
        </div>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${isEstimate ? 'Estimation Quotation' : 'Tax Invoice'} - ${docRef}</title>
      <script src="/vendor/qrcode.min.js"></script>
      <script src="/vendor/jsbarcode.min.js"></script>
      <style id="dynamicPageStyle">
        @page { size: auto; margin: 0; }
      </style>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          color: #1a202c;
          background-color: #f1f5f9;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .screen-toolbar {
          position: sticky;
          top: 0;
          z-index: 1000;
          background: #0f172a;
          color: #ffffff;
          padding: 10px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 4px 15px rgba(0,0,0,0.25);
        }
        .screen-toolbar .title {
          font-size: 13px;
          font-weight: 700;
          color: #facc15;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .format-switcher {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .format-btn {
          background: #1e293b;
          color: #94a3b8;
          font-weight: 700;
          font-size: 11px;
          border: 1px solid #475569;
          border-radius: 6px;
          padding: 5px 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .format-btn:hover {
          color: #ffffff;
          border-color: #d4af37;
        }
        .format-btn.active {
          background: #d4af37;
          color: #0f172a;
          border-color: #b8860b;
          font-weight: 800;
          box-shadow: 0 2px 8px rgba(212,175,55,0.4);
        }
        .screen-toolbar .actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .btn-print {
          background: linear-gradient(135deg, #d4af37, #b8860b);
          color: #0f172a;
          font-weight: 800;
          font-size: 12px;
          border: none;
          border-radius: 6px;
          padding: 7px 16px;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(212,175,55,0.4);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .btn-print:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(212,175,55,0.6);
        }
        .btn-close {
          background: #334155;
          color: #e2e8f0;
          font-weight: 600;
          font-size: 12px;
          border: none;
          border-radius: 6px;
          padding: 7px 12px;
          cursor: pointer;
        }
        .btn-close:hover { background: #475569; }

        /* Mode visibility */
        body.mode-thermal #a4Container,
        body.mode-tvs4 #a4Container {
          display: none !important;
        }
        body.mode-thermal #thermalContainer,
        body.mode-tvs4 #thermalContainer {
          display: block !important;
        }

        body.mode-a4 #thermalContainer {
          display: none !important;
        }
        body.mode-a4 #a4Container {
          display: block !important;
        }

        /* Universal Thermal Receipt Slip Styling (Supports ALL printers: 100mm/4", 80mm/3", 58mm/2", TVS, RP3160, Epson, etc.) */
        .thermal-receipt {
          width: 100%;
          max-width: 95mm;
          margin: 0 auto;
          background: #ffffff;
          padding: 1.5mm 3mm;
          box-shadow: 0 4px 15px rgba(0,0,0,0.15);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, monospace;
          font-size: 8.5px;
          line-height: 1.2;
          color: #000000;
          box-sizing: border-box;
        }
        .th-header { text-align: center; margin-bottom: 1px; }
        .th-shop-name { font-size: 13.5px; font-weight: 900; letter-spacing: 0.3px; line-height: 1.15; color: #000000; }
        .th-shop-sub { font-size: 7.5px; font-weight: 800; letter-spacing: 0.2px; margin-top: 0.5px; color: #000000; }
        .th-shop-info { font-size: 7px; line-height: 1.2; color: #000000; margin-top: 1px; }
        .th-divider-dashed { border-top: 1px dashed #000000; margin: 1.5px 0; }
        .th-doc-title { text-align: center; padding: 1px 0; font-size: 9.5px; font-weight: 900; letter-spacing: 0.4px; color: #000000; }
        .th-meta-grid { margin: 1px 0; font-size: 8px; line-height: 1.2; color: #000000; }
        .th-meta-row { display: flex; justify-content: space-between; align-items: baseline; margin: 0.5px 0; font-size: 8px; }
        .th-live-rate { display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #000000; border-bottom: 1px dashed #000000; padding: 1.5px 0; font-size: 8px; font-weight: 900; margin: 1.5px 0; color: #000000; }
        .th-section-heading { font-weight: 900; font-size: 8px; margin-bottom: 1px; letter-spacing: 0.2px; color: #000000; }
        .th-item-entry { border-bottom: 1px dashed #000000; padding: 1.5px 0; margin-bottom: 1px; }
        .th-item-title-row { display: flex; justify-content: space-between; align-items: baseline; font-weight: 900; font-size: 8.5px; color: #000000; }
        .th-purity-tag { font-weight: 900; border: 1px dashed #000000; border-radius: 2px; padding: 0.5px 3px; font-size: 7px; }
        .th-item-details-row { font-size: 7px; color: #222222; margin: 0.5px 0; }
        .th-item-wt-row { display: flex; justify-content: space-between; font-size: 8px; margin: 0.5px 0; color: #000000; }
        .th-net-pill { font-weight: 900; }
        .th-item-val-row { display: flex; justify-content: space-between; font-size: 7.5px; margin: 0.5px 0; color: #000000; }
        .th-item-total { display: flex; justify-content: space-between; font-size: 8.5px; font-weight: 900; margin-top: 0.5px; border-top: 1px dashed #000000; padding-top: 0.5px; }
        .th-weights-box { border: 1px dashed #000000; border-radius: 2px; padding: 1.5px 3px; margin: 1.5px 0; font-size: 8px; font-weight: 900; }
        .th-wt-summary-row { display: flex; justify-content: space-between; align-items: center; }
        .th-wt-summary-cell { text-align: center; }
        .th-wt-label { display: inline-block; font-size: 7px; font-weight: 800; color: #222222; text-transform: uppercase; }
        .th-wt-val { display: inline-block; font-size: 8.5px; font-weight: 900; color: #000000; margin-left: 2px; }
        .th-calc-block { margin: 1px 0; }
        .th-calc-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 8px; margin: 0.5px 0; color: #000000; }
        .th-divider-top { border-top: 1px dashed #000000; padding-top: 1px; margin-top: 1px; font-weight: 900; }
        .th-calc-discount { display: flex; justify-content: space-between; align-items: baseline; font-size: 8.5px; font-weight: 900; border-top: 1px dashed #000000; border-bottom: 1px dashed #000000; padding: 1px 0; margin: 1px 0; color: #000000; }
        .th-net-payable-box { border: 1.5px dashed #000000; border-radius: 3px; text-align: center; padding: 2.5px 2px; margin: 2px 0; }
        .th-payable-label { font-size: 8.5px; font-weight: 900; letter-spacing: 0.4px; color: #000000; }
        .th-payable-amount { font-size: 15px; font-weight: 900; letter-spacing: 0.4px; color: #000000; margin: 0.5px 0; }
        .th-payable-sub { font-size: 6.5px; color: #333333; font-weight: 700; }
        .th-words-block { 
          text-align: center; 
          font-size: 7.5px; 
          font-weight: 800; 
          line-height: 1.35; 
          margin: 6px 0; 
          color: #000000; 
          border-top: 1px dashed #000000; 
          border-bottom: 1px dashed #000000; 
          padding: 4px 2px; 
        }
        .th-words-label { 
          font-size: 6.5px; 
          text-transform: uppercase; 
          color: #222222; 
          font-weight: 800;
          letter-spacing: 0.3px;
          margin-bottom: 2px; 
        }
        .th-words-body { 
          font-size: 8px; 
          font-weight: 900; 
          line-height: 1.35;
          padding: 0 4px;
        }
        .th-qr-card { text-align: center; padding: 2px 0; border: 1px dashed #000000; border-radius: 2px; margin: 1.5px 0; }
        .th-qr-badge { font-size: 6.5px; font-weight: 900; letter-spacing: 0.2px; text-transform: uppercase; margin-bottom: 1px; color: #000000; }
        .th-qr-img-wrap { margin: 0 auto; display: block; }
        .th-qr-ref { font-family: monospace; font-size: 8px; font-weight: 900; margin-top: 1px; letter-spacing: 0.4px; color: #000000; }
        .th-hallmark-box { border: 1px dashed #000000; border-radius: 2px; padding: 1.5px 2px; text-align: center; margin: 1.5px 0; }
        .th-hallmark-title { font-size: 7px; font-weight: 900; color: #000000; }
        .th-hallmark-chips { display: flex; justify-content: space-around; font-size: 6.5px; font-weight: 800; margin: 0.5px 0; color: #000000; }
        .th-hallmark-note { font-size: 6px; color: #333333; }
        .th-terms-box { font-size: 6px; line-height: 1.15; color: #111111; margin: 1px 0; }
        .th-thanks-sign { text-align: center; font-size: 7.5px; font-weight: 800; margin-top: 1.5px; color: #000000; }

        /* A4 Luxury Sheet Styling - Modern & Colorful Theme */
        .doc-sheet {
          max-width: 820px;
          margin: 16px auto 30px auto;
          background: #ffffff;
          border: 2px solid #b45309;
          box-shadow: 0 0 0 3px #fef3c7, 0 12px 32px rgba(180, 83, 9, 0.12);
          border-radius: 12px;
          padding: 20px 24px;
          position: relative;
          box-sizing: border-box;
        }

        .corner-accent {
          position: absolute;
          width: 18px;
          height: 18px;
          border: 2px solid #d97706;
        }
        .top-left { top: 6px; left: 6px; border-right: none; border-bottom: none; }
        .top-right { top: 6px; right: 6px; border-left: none; border-bottom: none; }
        .bottom-left { bottom: 6px; left: 6px; border-right: none; border-top: none; }
        .bottom-right { bottom: 6px; right: 6px; border-left: none; border-top: none; }

        .doc-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #f1f5f9;
          padding-bottom: 10px;
          margin-bottom: 12px;
        }
        .brand-section {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .brand-crest {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          background: radial-gradient(circle, #fef08a 0%, #d4af37 60%, #b45309 100%);
          border: 2px solid #b45309;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          color: #ffffff;
          text-shadow: 0 1px 3px rgba(0,0,0,0.4);
          box-shadow: 0 3px 10px rgba(180, 83, 9, 0.35);
          flex-shrink: 0;
        }
        .crest-star { line-height: 1; }
        .brand-name {
          font-family: 'Cinzel', serif;
          font-size: 22px;
          font-weight: 900;
          color: #0f172a;
          letter-spacing: 1.5px;
          line-height: 1.1;
        }
        .brand-tagline {
          display: inline-block;
          background: linear-gradient(90deg, #fffbeb, #fef3c7, #fffbeb);
          border: 1px solid #fde68a;
          color: #92400e;
          font-weight: 800;
          font-size: 8.5px;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 4px;
          margin-top: 3px;
        }
        .brand-details {
          font-size: 9.5px;
          color: #475569;
          line-height: 1.4;
          margin-top: 4px;
        }
        .badge-contact {
          display: inline-block;
          background: #eff6ff;
          color: #1e40af;
          border: 1px solid #bfdbfe;
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 8.5px;
          font-weight: 700;
          margin-right: 4px;
        }
        .badge-gst {
          display: inline-block;
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 8.5px;
          font-weight: 800;
          margin-right: 4px;
        }
        .badge-bis {
          display: inline-block;
          background: #fffbeb;
          color: #92400e;
          border: 1px solid #fde68a;
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 8.5px;
          font-weight: 800;
        }

        .doc-badge-container {
          text-align: right;
        }
        .doc-type-pill {
          display: inline-block;
          padding: 4px 14px;
          border-radius: 20px;
          font-weight: 900;
          font-size: 10px;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .doc-type-estimate {
          background: linear-gradient(135deg, #d97706, #b45309);
          color: #ffffff;
          box-shadow: 0 3px 10px rgba(217, 119, 6, 0.35);
        }
        .doc-type-invoice {
          background: linear-gradient(135deg, #059669, #047857);
          color: #ffffff;
          box-shadow: 0 3px 10px rgba(5, 150, 105, 0.35);
        }
        .doc-number {
          font-family: 'JetBrains Mono', monospace;
          font-size: 16px;
          font-weight: 900;
          color: #0f172a;
          margin-top: 4px;
          letter-spacing: 0.5px;
        }
        .doc-meta-pills {
          display: flex;
          gap: 4px;
          justify-content: flex-end;
          margin-top: 3px;
        }
        .meta-pill {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 1.5px 6px;
          font-size: 9px;
          font-weight: 700;
          color: #334155;
          font-family: 'JetBrains Mono', monospace;
        }
        .doc-staff-badge {
          font-size: 8.5px;
          color: #64748b;
          margin-top: 2px;
        }

        .meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        .meta-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.03);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 90px;
          box-sizing: border-box;
        }
        .card-customer {
          border-left: 4px solid #3b82f6;
        }
        .card-billing {
          border-left: 4px solid #f59e0b;
        }
        .meta-card-header {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          font-size: 8.5px;
          font-weight: 800;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          border-bottom: 1px solid #f1f5f9;
        }
        .card-customer .meta-card-header {
          background: #eff6ff;
          color: #1d4ed8;
        }
        .card-billing .meta-card-header {
          background: #fffbeb;
          color: #b45309;
        }
        .meta-card-body {
          padding: 6px 10px 8px 10px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          flex-grow: 1;
          gap: 2px;
        }
        .meta-card-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
          line-height: 1.35;
        }
        .meta-label {
          color: #64748b;
          font-size: 9.5px;
        }
        .meta-val {
          text-align: right;
        }
        .customer-name {
          font-size: 12px;
          font-weight: 800;
          color: #0f172a;
        }
        .address-val {
          color: #475569;
          max-width: 210px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rate-benchmark {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
          padding: 1.5px 6px;
          border-radius: 4px;
          font-weight: 800;
          font-size: 9.5px;
        }
        .payment-badge {
          background: #f1f5f9;
          color: #0f172a;
          border: 1px solid #cbd5e1;
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 800;
          font-size: 9px;
        }
        .status-badge {
          padding: 1.5px 7px;
          border-radius: 4px;
          font-weight: 800;
          font-size: 9px;
          text-transform: uppercase;
        }
        .status-paid {
          background: #dcfce7;
          color: #15803d;
          border: 1px solid #86efac;
        }
        .status-estimate {
          background: #fffbeb;
          color: #b45309;
          border: 1px solid #fde68a;
        }

        .jewellery-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9.5px;
          margin-bottom: 12px;
          background: #ffffff;
          border-radius: 6px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }
        .jewellery-table th {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #ffffff;
          font-weight: 800;
          padding: 7px 5px;
          font-size: 8.5px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          border-bottom: 3px solid #d4af37;
          vertical-align: middle;
          white-space: nowrap;
        }
        .jewellery-table th.th-highlight {
          color: #fde047;
        }
        .jewellery-table th.th-highlight-amount {
          color: #fde047;
        }
        .jewellery-table th.text-right { text-align: right; }
        .jewellery-table th.text-center { text-align: center; }
        .jewellery-table td {
          padding: 6px 5px;
          border-bottom: 1px solid #e2e8f0;
          color: #334155;
          vertical-align: middle;
        }
        .jewellery-table td.text-right { text-align: right; }
        .jewellery-table td.text-center { text-align: center; }
        .jewellery-table tbody tr:nth-child(even) { background-color: #f8fafc; }
        .jewellery-table tbody tr:hover { background-color: #f1f5f9; }

        .item-name {
          font-weight: 800;
          color: #0f172a;
          font-size: 11px;
          line-height: 1.25;
        }
        .item-sub {
          display: flex;
          gap: 4px;
          align-items: center;
          margin-top: 2px;
          font-size: 8.5px;
        }
        .tag-chip {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 3px;
          padding: 1px 4px;
          color: #475569;
          font-family: 'JetBrains Mono', monospace;
          font-size: 8px;
        }
        .barcode-chip {
          color: #64748b;
          font-family: 'JetBrains Mono', monospace;
          font-size: 8px;
        }
        .qty-chip {
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
          border-radius: 3px;
          padding: 1px 4px;
          font-size: 8px;
          font-weight: 700;
        }

        .purity-badge {
          font-weight: 800;
          font-size: 8px;
          padding: 2px 6px;
          border-radius: 4px;
          display: inline-block;
          white-space: nowrap;
          letter-spacing: 0.3px;
        }
        .purity-22k {
          background: linear-gradient(135deg, #fef9c3, #fde047);
          color: #78350f;
          border: 1px solid #facc15;
          box-shadow: 0 1px 2px rgba(234, 179, 8, 0.25);
        }
        .purity-18k {
          background: linear-gradient(135deg, #ffe4e6, #fecdd3);
          color: #9f1239;
          border: 1px solid #f43f5e;
          box-shadow: 0 1px 2px rgba(244, 63, 94, 0.2);
        }
        .purity-24k {
          background: linear-gradient(135deg, #fef08a, #eab308);
          color: #422006;
          border: 1px solid #ca8a04;
          box-shadow: 0 1px 2px rgba(202, 138, 4, 0.3);
        }
        .purity-silver {
          background: linear-gradient(135deg, #f1f5f9, #cbd5e1);
          color: #0f172a;
          border: 1px solid #94a3b8;
          box-shadow: 0 1px 2px rgba(148, 163, 184, 0.2);
        }

        .net-val {
          font-weight: 800;
          color: #b45309;
          background: #fffbeb;
          border: 1px solid #fef3c7;
          border-radius: 3px;
          padding: 1px 4px;
        }
        .gval-val {
          font-weight: 800;
          color: #0f172a;
        }
        .line-total-val {
          font-weight: 900;
          color: #0f172a;
          font-size: 10.5px;
        }

        .jewellery-table tfoot tr.tfoot-totals td {
          padding: 7px 5px;
          border-top: 2px solid #0f172a;
          border-bottom: 2px solid #0f172a;
          background: linear-gradient(90deg, #f1f5f9, #f8fafc, #f1f5f9);
          font-size: 9.5px;
          vertical-align: middle;
        }
        .tfoot-net-gold {
          font-weight: 900;
          color: #b45309;
          background: #fef3c7;
          border-radius: 3px;
          padding: 1px 4px;
        }
        .tfoot-amount {
          font-weight: 900;
          color: #0f172a;
          font-size: 11px;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 12px;
          align-items: stretch;
          margin-bottom: 12px;
        }
        .summary-left {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 6px;
        }
        .summary-right {
          display: flex;
          flex-direction: column;
        }

        .hallmark-cert {
          display: flex;
          align-items: center;
          gap: 10px;
          background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
          border: 1.5px solid #6ee7b7;
          border-radius: 8px;
          padding: 7px 10px;
          box-shadow: 0 2px 6px rgba(16, 185, 129, 0.08);
        }
        .hallmark-icon-wrap {
          font-size: 24px;
          line-height: 1;
          flex-shrink: 0;
        }
        .hallmark-title {
          font-weight: 900;
          letter-spacing: 0.5px;
          color: #065f46;
          font-size: 9.5px;
        }
        .hallmark-desc {
          font-size: 8.5px;
          color: #047857;
          line-height: 1.35;
          margin-top: 1px;
        }
        .hallmark-chips {
          display: flex;
          gap: 4px;
          margin-top: 4px;
        }
        .hallmark-chips span {
          background: #dcfce7;
          color: #15803d;
          border: 1px solid #86efac;
          border-radius: 3px;
          font-size: 7.5px;
          font-weight: 800;
          padding: 1px 4px;
        }

        .words-card {
          background: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-left: 4px solid #d4af37;
          border-radius: 8px;
          padding: 7px 10px;
        }
        .words-card-label {
          color: #b45309;
          font-weight: 800;
          text-transform: uppercase;
          font-size: 8px;
          letter-spacing: 0.6px;
          margin-bottom: 2px;
        }
        .words-card-body {
          color: #0f172a;
          font-size: 10.5px;
          font-weight: 800;
          line-height: 1.35;
        }
        .terms-card {
          font-size: 8.5px;
          color: #64748b;
          line-height: 1.35;
          background: #ffffff;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          padding: 6px 10px;
        }
        .terms-title {
          color: #475569;
          font-weight: 800;
          font-size: 8.5px;
          letter-spacing: 0.4px;
          margin-bottom: 2px;
        }

        .totals-box {
          background: #ffffff;
          border: 2px solid #d4af37;
          border-radius: 10px;
          box-shadow: 0 4px 15px rgba(212, 175, 55, 0.12);
          overflow: hidden;
        }
        .totals-header {
          background: linear-gradient(90deg, #fffbeb, #fef3c7);
          border-bottom: 1.5px solid #fde68a;
          padding: 5px 12px;
          font-size: 8.5px;
          font-weight: 800;
          color: #92400e;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          text-align: center;
        }
        .totals-body {
          padding: 6px 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .calc-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 9.5px;
          color: #475569;
        }
        .calc-row.divider {
          border-top: 1px dashed #cbd5e1;
          margin-top: 2px;
          padding-top: 2px;
        }
        .calc-row.discount-row {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 4px;
          padding: 2px 6px;
          color: #b91c1c;
          font-weight: 800;
        }
        .calc-row.tax-row {
          color: #065f46;
        }
        .calc-row.final-highlight {
          background: linear-gradient(135deg, #b45309 0%, #d97706 40%, #f59e0b 100%);
          color: #ffffff;
          padding: 7px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-radius: 0 0 8px 8px;
          box-shadow: inset 0 1px 2px rgba(255,255,255,0.3);
        }
        .final-title {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .final-amount {
          font-family: 'JetBrains Mono', monospace;
          font-size: 17px;
          font-weight: 900;
          letter-spacing: 0.5px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.25);
        }

        .sig-container {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1.5px solid #f1f5f9;
        }
        .sig-box {
          text-align: center;
          width: 160px;
        }
        .sig-line {
          border-bottom: 1.5px dashed #94a3b8;
          height: 22px;
          margin-bottom: 3px;
        }
        .sig-title {
          font-size: 9px;
          font-weight: 800;
          color: #1e293b;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .sig-sub {
          font-size: 8px;
          color: #94a3b8;
          margin-top: 1px;
        }
        .gold-star {
          color: #d4af37;
          font-size: 11px;
        }
        .sig-center-note {
          text-align: center;
          font-size: 9px;
          color: #475569;
          font-weight: 700;
          letter-spacing: 0.5px;
          padding-bottom: 4px;
        }

        /* Print Media Styles */
        @media print {
          @page {
            size: auto;
            margin: 0;
          }
          .screen-toolbar {
            display: none !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body.mode-thermal,
          body.mode-tvs4 {
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          body.mode-thermal #a4Container,
          body.mode-tvs4 #a4Container {
            display: none !important;
          }
          body.mode-thermal #tvs4Container,
          body.mode-tvs4 #tvs4Container {
            display: none !important;
          }
          body.mode-thermal #thermalContainer,
          body.mode-tvs4 #thermalContainer {
            display: block !important;
            width: 100% !important;
            max-width: 96mm !important;
            margin: 0 auto !important;
            padding: 2mm 3.5mm !important;
            box-shadow: none !important;
            border: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .thermal-receipt {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          body.mode-a4 {
            width: 100% !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          body.mode-a4 #thermalContainer,
          body.mode-a4 #tvs4Container {
            display: none !important;
          }
          body.mode-a4 #a4Container {
            display: block !important;
          }
          body.mode-a4 .doc-sheet {
            margin: 0 !important;
            max-width: 100% !important;
            border: 2px solid #b45309 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 12px 16px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .jewellery-table, .summary-grid, .sig-container {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .page-break {
            page-break-after: always;
          }
        }
      </style>
    </head>
    <body>
      <div class="screen-toolbar">
        <div class="title">
          <span>✦</span>
          <span>${shop.shop_name || 'GoldFlow Jewellers'}</span>
        </div>
        <div class="format-switcher">
          <span style="font-size:11px; color:#cbd5e1; font-weight:700;">Format:</span>
          <button id="btnThermal" onclick="switchFormat('thermal')" class="format-btn" title="Universal Thermal Slip (All Printers: 4-inch, 3-inch, 2-inch)">
            🧾 Thermal Slip (Universal)
          </button>
          ${minimalSlip ? '' : `<button id="btnA4" onclick="switchFormat('a4')" class="format-btn" title="Format for A4 Luxury PDF / Full Page">
            📄 A4 Luxury (PDF)
          </button>`}
        </div>
        <div class="actions">
          <button onclick="window.print()" class="btn-print">
            <span>🖨️ Print Now</span>
          </button>
          <button onclick="window.close()" class="btn-close">✕ Close</button>
        </div>
      </div>

      ${thermalContentHtml}

      <div id="a4Container" class="a4-wrapper">
        ${sheetsHtml}
      </div>

      <script>
        function switchFormat(fmt) {
          if (fmt === 'tvs4') fmt = 'thermal';
          document.body.className = 'mode-' + fmt;
          const pStyle = document.getElementById('dynamicPageStyle');
          if (pStyle) {
            if (fmt === 'thermal') {
              pStyle.innerHTML = '@page { size: auto; margin: 0; }';
            } else {
              pStyle.innerHTML = '@page { size: A4 portrait; margin: 6mm 8mm; }';
            }
          }
          const bt = document.getElementById('btnThermal');
          const ba = document.getElementById('btnA4');
          if (bt) bt.className = 'format-btn' + (fmt === 'thermal' ? ' active' : '');
          if (ba) ba.className = 'format-btn' + (fmt === 'a4' ? ' active' : '');
          try { localStorage.setItem('gf_preferred_format', fmt); } catch(e){}
        }

        (function initDocument() {
          if (window.QRCode) {
            document.querySelectorAll('.doc-qr-canvas').forEach(function(canvas) {
              var text = canvas.getAttribute('data-qr') || '';
              var size = parseInt(canvas.getAttribute('data-size') || '110', 10);
              QRCode.toCanvas(canvas, text, { width: size, margin: 1, color: { dark: '#000000', light: '#ffffff' } }, function(err) {
                if (err) console.error('QR Render err:', err);
              });
            });
          }
          if (window.JsBarcode) {
            document.querySelectorAll('.doc-barcode-svg').forEach(function(svg) {
              var code = svg.getAttribute('data-barcode') || '';
              if (code) {
                try {
                  JsBarcode(svg, code, {
                    format: "CODE128",
                    width: 1.4,
                    height: 24,
                    displayValue: false,
                    margin: 0
                  });
                } catch(e) { console.error('Barcode error:', e); }
              }
            });
          }
          const savedPref = (function() { try { return localStorage.getItem('gf_preferred_format'); } catch(e){ return null; } })();
          let pref = ${minimalSlip ? "'thermal'" : `'${opt.defaultFormat || ''}' || savedPref || 'thermal'`};
          if (pref === 'tvs4') pref = 'thermal';
          switchFormat(pref);
        })();

        var gfAutoPrinted = false;
        function gfAutoPrint() {
          if (gfAutoPrinted) return;
          gfAutoPrinted = true;
          window.print();
        }
        window.onload = function() {
          setTimeout(gfAutoPrint, 450);
        };
        // Safety net: web fonts on a slow connection can delay window.onload; print anyway.
        setTimeout(gfAutoPrint, 2500);
      </script>
    </body>
    </html>
  `;
}

window.printPosEstimate = async function(format = 'thermal') {
  if (format === 'tvs4') format = 'thermal';
  if (window.currentCart.length === 0) return showToast('Cart is empty. Add jewellery first.', 'error');
  const calc = calculateCartTotals();
  const custName = window.selectedCustomer ? window.selectedCustomer.name : 'Valued Customer';
  const custPhone = window.selectedCustomer ? window.selectedCustomer.phone : '-';
  const custAddr = window.selectedCustomer ? window.selectedCustomer.address : '';
  const globalDisc = parseFloat(document.getElementById('posGlobalDiscountInput')?.value) || 0;

  const items = window.currentCart.map(c => {
    const gross = parseFloat(c.gross_weight || c.weight || 0);
    const stone = parseFloat(c.stone_weight || 0);
    const net = c.net_weight != null ? parseFloat(c.net_weight) : Math.max(0, gross - stone);
    const rate = parseFloat(c.gold_rate) || 0;
    const qty = parseInt(c.quantity) || 1;
    const isFixed = c.pricing_mode === 'FIXED_PRICE' && (parseFloat(c.selling_price) || 0) > 0;
    const sellPrice = parseFloat(c.selling_price) || 0;

    let gVal = 0, wVal = 0, mVal = 0, sVal = 0, oVal = 0, lineVal = 0;
    if (isFixed) {
      lineVal = sellPrice * qty;
      sVal = Math.min(lineVal, Math.round((parseFloat(c.stone_charge) || 0) * qty));
      gVal = Math.max(0, lineVal - sVal);
    } else {
      gVal = Math.round(net * rate * qty);
      wVal = Math.round(gVal * ((parseFloat(c.wastage_percent) || 0) / 100));
      const mcVal = parseFloat(c.making_charge) || 0;
      if (c.making_charge_type === 'PERCENTAGE') {
        mVal = Math.round(gVal * (mcVal / 100));
      } else if (c.making_charge_type === 'PER_GRAM') {
        mVal = Math.round(net * mcVal * qty);
      } else {
        mVal = Math.round(mcVal * qty);
      }
      sVal = Math.round((parseFloat(c.stone_charge) || 0) * qty);
      oVal = Math.round((parseFloat(c.other_charges) || 0) * qty);
      lineVal = gVal + wVal + mVal + sVal + oVal;
    }

    return {
      jewellery_id: c.jewellery_id || c.id || null,
      name: c.name || 'Fine Jewellery',
      code: c.code || '',
      barcode: c.barcode || '',
      purity: c.purity || '22K',
      gross_weight: gross,
      stone_weight: stone,
      net_weight: net,
      gold_rate: rate,
      gold_value: gVal,
      wastage_percent: parseFloat(c.wastage_percent) || 0,
      wastage_amount: wVal,
      making_charge: mVal,
      stone_charge: sVal,
      other_charges: oVal,
      quantity: qty,
      line_total: lineVal
    };
  });

  let estInvoiceNo = 'GF-EST-' + Math.floor(100000 + Math.random() * 900000);
  let qrDataUrl = '';

  try {
    const saveRes = await api('/sales/estimate', {
      method: 'POST',
      body: JSON.stringify({
        items: items,
        customer: window.selectedCustomer || { name: custName, phone: custPhone, address: custAddr },
        totals: {
          goldValueTotal: calc.goldValueTotal,
          wastageTotal: calc.wastageTotal,
          makingTotal: calc.makingTotal,
          stoneTotal: calc.stoneTotal,
          grossAmount: calc.grossAmount,
          discountTotal: calc.discountTotal,
          finalPayable: calc.finalPayable,
          taxAmount: calc.taxAmount,
          taxPercent: getCurrentGstPercent(),
          roundOff: calc.roundOff
        },
        requested_discount_percent: globalDisc
      })
    });

    if (saveRes && saveRes.invoice_no) {
      estInvoiceNo = saveRes.invoice_no;
      qrDataUrl = saveRes.qrDataUrl || '';
    }
  } catch(e) {
    console.error('Backend estimate save error:', e);
  }

  const hostOrigin = window.lanServerUrl || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? `${window.location.protocol}//192.168.29.221:${window.location.port || 3000}` : window.location.origin);
  const qrTargetUrl = `${hostOrigin}/view-estimate.html?code=${estInvoiceNo}`;
  if (!qrDataUrl && window.QRCode) {
    try {
      if (typeof QRCode.toDataURL === 'function') {
        qrDataUrl = await new Promise((resolve) => {
          QRCode.toDataURL(qrTargetUrl, { width: 280, margin: 1 }, (err, url) => {
            if (!err && url) resolve(url);
            else resolve('');
          });
        });
      }
    } catch(e) {
      console.warn('Client QR gen error:', e);
    }
  }

  const html = buildLuxuryJewelleryDocumentHtml({
    docType: 'ESTIMATE',
    defaultFormat: (user && user.role === 'SELLER') ? 'thermal' : format,
    minimalSlip: !!(user && user.role === 'SELLER'),
    docNumber: estInvoiceNo,
    qrDataUrl: qrDataUrl,
    qrUrl: qrTargetUrl,
    dateStr: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    timeStr: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    shop: window.systemSettings,
    customer: { name: custName, phone: custPhone, address: custAddr },
    sellerName: user.name || 'Sales Staff',
    paymentMethod: window.posPaymentMethod || 'CASH',
    paymentStatus: 'ESTIMATION ONLY',
    items,
    totals: {
      goldValueTotal: calc.goldValueTotal,
      wastageTotal: calc.wastageTotal,
      makingTotal: calc.makingTotal,
      stoneTotal: calc.stoneTotal,
      grossAmount: calc.grossAmount,
      discountTotal: calc.discountTotal,
      discountPercent: globalDisc || (calc.grossAmount > 0 && calc.discountTotal > 0 ? parseFloat(((calc.discountTotal / calc.grossAmount) * 100).toFixed(1)) : 0),
      taxableAmount: calc.taxableAmount,
      taxPercent: getCurrentGstPercent(),
      taxAmount: calc.taxAmount,
      roundOff: calc.roundOff,
      finalPayable: calc.finalPayable
    }
  });

  window.gfOpenPrintDocument(html, 'width=950,height=950');
};

// -------------------------------------------------------------------------
// 3. JEWELLERY INVENTORY & BARCODE LABEL GENERATION
// -------------------------------------------------------------------------
async function renderJewellery(container) {
  try {
    const items = await api('/jewellery');
    window.allJewellery = items;
    window.selectedJewelleryIds = new Set();

    let availableCount = 0;
    let lowStockCount = 0;
    let outStockCount = 0;

    items.forEach(i => {
      if (i.stock <= 0) outStockCount++;
      else if (i.stock <= i.min_stock) lowStockCount++;
      else availableCount++;
    });

    container.innerHTML = `
      <div class="space-y-6">
        
        <!-- Header & Action Buttons -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Jewellery & Stock Inventory</h2>
            <p class="text-xs text-gray-500 mt-1">Live Inventory Tracking, Barcodes & Weight Management</p>
          </div>
          ${user.role !== 'SELLER' ? `
            <div class="flex gap-2 items-center">
              <button id="topBulkDeleteBtn" onclick="confirmBulkDeleteJewellery()" class="hidden px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5 transition">
                <span>🗑️</span> Delete Selected (<span id="topBulkCount">0</span>)
              </button>
              <button type="button" onclick="openCustomizeGstModal()" class="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg text-sm font-bold shadow flex items-center gap-1.5 transition" title="Customize GST Tax Rate">
                <span>⚙️</span> GST Tax (<span id="jewelleryGstBadge">${getCurrentGstPercent()}%</span>)
              </button>
              <button onclick="openAddJewelleryModal()" class="btn-gold px-4 py-2 rounded-lg text-sm font-bold shadow flex items-center gap-2">
                <span>+</span> Add Jewellery
              </button>
            </div>
          ` : ''}
        </div>

        <!-- Inventory Metric Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <span class="text-gray-500 font-semibold block uppercase">Total Catalog</span>
            <span class="text-xl font-black text-gray-900 mt-1 block">${items.length} Products</span>
          </div>
          <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <span class="text-gray-500 font-semibold block uppercase">Available Stock</span>
            <span class="text-xl font-black text-green-600 mt-1 block">${availableCount} In Stock</span>
          </div>
          <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <span class="text-gray-500 font-semibold block uppercase">Low Stock Alerts</span>
            <span class="text-xl font-black text-amber-500 mt-1 block">${lowStockCount} Low</span>
          </div>
          <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <span class="text-gray-500 font-semibold block uppercase">Out of Stock</span>
            <span class="text-xl font-black text-red-500 mt-1 block">${outStockCount} Depleted</span>
          </div>
        </div>

        <!-- Filter & Search Bar -->
        <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-3 items-center justify-between">
          <div class="flex gap-2 flex-1 min-w-[200px]">
            <input type="text" id="jewellerySearchInput" placeholder="Filter by Code, Barcode, or Name..." 
              class="border border-gray-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#D4AF37] w-full max-w-sm"
              oninput="filterJewelleryTable(this.value)">
          </div>
          <div class="flex gap-2 text-xs">
            <select id="jewelleryCatFilter" onchange="filterJewelleryTable()" class="border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none">
              <option value="">All Categories</option>
              <option value="Necklace">Necklaces</option>
              <option value="Ring">Rings</option>
              <option value="Chain">Chains</option>
              <option value="Bangle">Bangles</option>
              <option value="Earrings">Earrings</option>
              <option value="Bracelet">Bracelets</option>
            </select>
            <select id="jewelleryStatusFilter" onchange="filterJewelleryTable()" class="border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none">
              <option value="">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="LOW_STOCK">Low Stock</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
              <option value="INACTIVE">Inactive / Archived</option>
            </select>
          </div>
        </div>

        <!-- Bulk Action Bar -->
        ${user.role !== 'SELLER' ? `
        <div id="jewelleryBulkActionBar" class="hidden bg-amber-50/90 border-2 border-[#D4AF37] p-3.5 rounded-xl flex items-center justify-between shadow-md transition-all">
          <div class="flex items-center gap-3">
            <span class="text-2xl">💎</span>
            <div>
              <div class="font-bold text-gray-900 text-xs">
                <span id="selectedJewelleryCount" class="font-black text-amber-900 text-sm">0</span> jewellery item(s) selected
              </div>
              <span class="text-[11px] text-gray-500">Select multiple items to delete or manage stock in bulk</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="clearJewellerySelection()" class="px-3.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-semibold rounded-lg text-xs transition">
              ✕ Clear Selection
            </button>
            <button onclick="confirmBulkDeleteJewellery()" class="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1.5 transition">
              <span>🗑️</span> Bulk Delete Selected (<span id="btnDeleteSelectedCount">0</span>)
            </button>
          </div>
        </div>
        ` : ''}

        <!-- Inventory Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase tracking-wider font-semibold">
                  ${user.role !== 'SELLER' ? `
                    <th class="p-3.5 w-10 text-center">
                      <input type="checkbox" id="selectAllJewellery" onchange="toggleSelectAllJewellery(this.checked)" class="rounded text-[#D4AF37] focus:ring-0 cursor-pointer w-4 h-4" title="Select All">
                    </th>
                  ` : ''}
                  <th class="p-3.5">Item</th>
                  <th class="p-3.5">Code / Barcode</th>
                  <th class="p-3.5">Metal & Purity</th>
                  <th class="p-3.5">Weights (Gross/Net)</th>
                  <th class="p-3.5">Selling Price</th>
                  <th class="p-3.5">Stock</th>
                  <th class="p-3.5">Status</th>
                  <th class="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100" id="jewelleryTableBody">
                ${renderJewelleryRowsHtml(items)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading inventory: ${e.message}</div>`;
  }
}

function renderJewelleryRowsHtml(items) {
  const isSeller = user.role === 'SELLER';
  if (items.length === 0) {
    return `<tr><td colspan="${isSeller ? 8 : 9}" class="p-8 text-center text-gray-400">No jewellery items found.</td></tr>`;
  }
  return items.map(item => {
    const imgUrl = item.image_url || 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=80';
    let statusClass = 'bg-green-100 text-green-800';
    if (item.status === 'LOW_STOCK') statusClass = 'bg-yellow-100 text-yellow-800';
    if (item.status === 'OUT_OF_STOCK') statusClass = 'bg-red-100 text-red-800';
    if (item.status === 'INACTIVE') statusClass = 'bg-gray-100 text-gray-800';
    const isSelected = !isSeller && window.selectedJewelleryIds && window.selectedJewelleryIds.has(item.id);

    return `
      <tr class="hover:bg-gray-50/80 transition ${isSelected ? 'bg-amber-50/40' : ''}">
        ${!isSeller ? `
          <td class="p-3.5 text-center w-10">
            <input type="checkbox" class="jewellery-select-chk rounded text-[#D4AF37] focus:ring-0 cursor-pointer w-4 h-4" 
              value="${item.id}" ${isSelected ? 'checked' : ''} 
              onchange="toggleJewellerySelection(${item.id}, this.checked)">
          </td>
        ` : ''}
        <td class="p-3.5 flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
            <img src="${imgUrl}" class="w-full h-full object-cover">
          </div>
          <div>
            <div class="font-bold text-gray-900 text-xs">${item.name}</div>
            <div class="text-[10px] text-gray-400">${item.category || 'Jewellery'}</div>
          </div>
        </td>
        <td class="p-3.5 font-mono">
          <div class="font-bold text-gray-800">${item.code}</div>
          <div class="text-[10px] text-gray-400">${item.barcode || '-'}</div>
        </td>
        <td class="p-3.5">
          <div class="font-semibold text-gray-800">${item.metal}</div>
          <div class="text-[10px] text-gray-500">${item.purity}</div>
        </td>
        <td class="p-3.5">
          <div><span class="text-gray-400">Gross:</span> <span class="font-semibold">${Number(item.gross_weight || item.weight).toFixed(3)}g</span></div>
          <div><span class="text-gray-400">Net:</span> <span class="font-bold text-gray-800">${Number(item.net_weight || item.weight).toFixed(3)}g</span></div>
        </td>
        <td class="p-3.5 font-bold text-gray-900">
          <div>${formatMoney(calculateJewelleryEstimatedPrice(item))}</div>
          ${item.selling_price && Math.abs((parseFloat(item.selling_price) || 0) - calculateJewelleryEstimatedPrice(item)) > 100 ? `<div class="text-[10px] text-gray-400 font-normal">Base: ${formatMoney(item.selling_price)}</div>` : ''}
        </td>
        <td class="p-3.5 font-black text-sm">${item.stock}</td>
        <td class="p-3.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${statusClass}">${item.status}</span></td>
        <td class="p-3.5 text-right space-x-1.5 whitespace-nowrap">
          <button onclick="openJewelleryQrInspectionModal('${item.code}')" class="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded text-[11px] font-bold" title="Scan / Inspect QR Code">📱 QR Tag</button>
          <button onclick="printBarcodeLabel(${item.id})" class="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-medium" title="Print Barcode & QR Tag">🏷️ Tag</button>
          ${user.role !== 'SELLER' ? `
            <button onclick="openStockAdjustModal(${item.id})" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded text-[11px] font-semibold">Stock ±</button>
            <button onclick="openEditJewelleryModal(${item.id})" class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[11px] font-semibold">Edit</button>
            <button onclick="confirmDeleteJewellery(${item.id}, '${item.name.replace(/'/g, "\\'")}', '${item.code}')" class="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-[11px] font-bold" title="Delete Jewellery">🗑️ Delete</button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

window.filterJewelleryTable = function() {
  const search = document.getElementById('jewellerySearchInput')?.value.toLowerCase() || '';
  const cat = document.getElementById('jewelleryCatFilter')?.value || '';
  const stat = document.getElementById('jewelleryStatusFilter')?.value || '';

  const filtered = (window.allJewellery || []).filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search) || item.code.toLowerCase().includes(search) || (item.barcode && item.barcode.toLowerCase().includes(search));
    const matchCat = !cat || item.category === cat;
    const matchStat = !stat || item.status === stat;
    return matchSearch && matchCat && matchStat;
  });

  const tbody = document.getElementById('jewelleryTableBody');
  if (tbody) tbody.innerHTML = renderJewelleryRowsHtml(filtered);
  updateJewellerySelectionState();
};

// Barcode & QR Label Printable Sticker (50mm x 30mm)
window.printBarcodeLabel = function(id) {
  const item = (window.allJewellery || []).find(i => i.id === id) || (window.jewelleryItems || []).find(i => i.id === id);
  if (!item) return showToast('Item not found', 'error');

  const barcodeVal = item.barcode || item.code;
  const grossFormatted = Number(item.gross_weight || item.weight || 0).toFixed(3);
  const netFormatted = Number(item.net_weight || item.weight || 0).toFixed(3);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Jewellery Tag - ${item.code}</title>
      <script src="/vendor/jsbarcode.min.js"></script>
      <script src="/vendor/qrcode.min.js"></script>
      <style>
        @page { size: auto; margin: 0mm !important; }
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        html, body { 
          width: 100% !important; 
          height: 100% !important; 
          margin: 0 !important; 
          padding: 0 !important; 
          background: #ffffff !important; 
          overflow: hidden !important; 
          page-break-inside: avoid !important; 
          break-inside: avoid !important; 
        }
        .barcode-tag-card { 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; 
          width: 50mm; 
          max-width: 100%; 
          height: 28.5mm; 
          max-height: 100%; 
          margin: 0 auto; 
          padding: 1.2mm 2mm; 
          display: flex; 
          flex-direction: column; 
          justify-content: space-between; 
          background: #fff; 
          color: #000; 
          overflow: hidden; 
          box-sizing: border-box; 
          page-break-inside: avoid !important; 
          break-inside: avoid !important; 
        }
        .tag-head { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          border-bottom: 0.6px solid #000; 
          padding-bottom: 0.8px; 
        }
        .shop { 
          font-size: 7.5pt; 
          font-weight: 900; 
          letter-spacing: 0.5px; 
        }
        .purity { 
          font-size: 6.8pt; 
          font-weight: 900; 
          background: #000; 
          color: #fff; 
          padding: 0.5px 3.5px; 
          border-radius: 2px; 
          letter-spacing: 0.3px; 
        }
        .item-info { 
          font-size: 6.5pt; 
          font-weight: 700; 
          white-space: nowrap; 
          overflow: hidden; 
          text-overflow: ellipsis; 
          margin: 0.8px 0; 
          color: #111; 
        }
        .tag-body { 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          gap: 1.5mm; 
          flex: 1; 
          margin: 0.5mm 0; 
        }
        .tag-left { 
          flex: 1; 
          min-width: 0; 
          display: flex; 
          flex-direction: column; 
          justify-content: center; 
          overflow: hidden; 
        }
        .wt-line { 
          display: flex; 
          align-items: baseline; 
          justify-content: flex-start; 
          gap: 1.8mm; 
          white-space: nowrap !important; 
          font-size: 6.3pt; 
          font-weight: 700; 
          line-height: 1.1; 
          margin-bottom: 0.8mm; 
          color: #000; 
          width: 100%; 
        }
        .wt-item { 
          white-space: nowrap !important; 
          display: inline-flex; 
          align-items: baseline; 
          gap: 0.5mm; 
        }
        .wt-label { 
          font-weight: 800; 
          color: #000; 
        }
        .wt-val { 
          font-weight: 900; 
          color: #000; 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; 
        }
        .wt-sep { 
          color: #555; 
          font-weight: 400; 
        }
        .barcode-wrap { 
          width: 100%; 
          display: flex; 
          align-items: center; 
          overflow: hidden; 
        }
        .barcode-wrap svg { 
          width: 100%; 
          max-width: 32mm; 
          max-height: 8mm; 
          display: block; 
        }
        .tag-right { 
          width: 12.5mm; 
          height: 12.5mm; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          flex-shrink: 0; 
        }
        .tag-right canvas { 
          width: 12.5mm !important; 
          height: 12.5mm !important; 
          display: block; 
        }
        .tag-foot { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          border-top: 0.6px solid #000; 
          padding-top: 0.8px; 
        }
        .huid { 
          font-size: 6pt; 
          font-weight: 800; 
          color: #000; 
          letter-spacing: 0.2px; 
        }
        .price { 
          font-size: 8.5pt; 
          font-weight: 900; 
          color: #000; 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; 
        }
      </style>
    </head>
    <body>
      <div class="barcode-tag-card">
        <div class="tag-head">
          <span class="shop">GOLDFLOW</span>
          <span class="purity">${item.purity || '22K 916'}</span>
        </div>
        <div class="item-info">${item.name} (${item.code})</div>
        <div class="tag-body">
          <div class="tag-left">
            <div class="wt-line">
              <span class="wt-item"><span class="wt-label">G:</span> <span class="wt-val">${grossFormatted}g</span></span>
              <span class="wt-sep">|</span>
              <span class="wt-item"><span class="wt-label">N:</span> <span class="wt-val">${netFormatted}g</span></span>
            </div>
            <div class="barcode-wrap"><svg id="barcodeSvg"></svg></div>
          </div>
          <div class="tag-right">
            <canvas id="qrCanvas"></canvas>
          </div>
        </div>
        <div class="tag-foot">
          <span class="huid">BIS 916 &bull; ${item.code}</span>
          <span class="price">&#8377;${Math.round(calculateJewelleryEstimatedPrice(item) || item.selling_price || 0).toLocaleString('en-IN')}</span>
        </div>
      </div>
      <script>
        JsBarcode("#barcodeSvg", "${barcodeVal}", {
          format: "CODE128",
          width: 0.9,
          height: 16,
          displayValue: false,
          margin: 0
        });
        if (window.QRCode) {
          QRCode.toCanvas(document.getElementById('qrCanvas'), "${item.code}", { width: 50, margin: 0 }, function(err) {
            if (err) console.error(err);
          });
        }
        window.onload = () => { setTimeout(() => window.print(), 400); };
      </script>
    </body>
    </html>
  `;
  window.gfOpenPrintDocument(html, 'width=400,height=300');
};

// Stock Adjust Modal
window.openStockAdjustModal = function(id) {
  const item = (window.allJewellery || []).find(i => i.id === id);
  if (!item) return;

  const existing = document.getElementById('stockAdjustModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'stockAdjustModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
      <h3 class="font-bold text-gray-900 text-sm mb-1">Adjust Inventory Stock</h3>
      <p class="text-xs text-gray-500 mb-3">${item.name} (${item.code}) - Current: <b>${item.stock}</b></p>
      
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Quantity Adjustment (+ to add, - to reduce)</label>
          <input type="number" id="adj_qty" class="w-full border rounded-lg p-2 outline-none focus:border-[#D4AF37]" placeholder="e.g. 5 or -2">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Reason for Adjustment</label>
          <input type="text" id="adj_reason" class="w-full border rounded-lg p-2 outline-none focus:border-[#D4AF37]" placeholder="e.g. Physical inventory count / damaged">
        </div>
      </div>

      <div class="mt-4 flex gap-2">
        <button onclick="document.getElementById('stockAdjustModal').remove()" class="flex-1 py-2 border rounded-lg text-xs font-semibold text-gray-600">Cancel</button>
        <button onclick="submitStockAdjust(${item.id})" class="flex-1 btn-gold py-2 rounded-lg text-xs font-bold">Apply</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.submitStockAdjust = async function(id) {
  const qty = parseInt(document.getElementById('adj_qty')?.value);
  const reason = document.getElementById('adj_reason')?.value.trim();
  if (isNaN(qty) || qty === 0) return showToast('Please enter a valid adjustment amount', 'error');

  try {
    await api(`/jewellery/${id}/stock-adjust`, {
      method: 'POST',
      body: JSON.stringify({ adjustment: qty, reason })
    });
    document.getElementById('stockAdjustModal').remove();
    showToast('Stock adjusted successfully', 'success');
    loadPage('jewellery', 'Jewellery & Stock');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// -------------------------------------------------------------------------
// JEWELLERY SELECTION & BULK DELETE HANDLERS
// -------------------------------------------------------------------------
window.toggleSelectAllJewellery = function(checked) {
  if (!window.selectedJewelleryIds) window.selectedJewelleryIds = new Set();
  const visibleChks = document.querySelectorAll('.jewellery-select-chk');
  visibleChks.forEach(chk => {
    chk.checked = checked;
    const id = parseInt(chk.value);
    if (checked) {
      window.selectedJewelleryIds.add(id);
    } else {
      window.selectedJewelleryIds.delete(id);
    }
  });
  updateJewellerySelectionState();
};

window.toggleJewellerySelection = function(id, checked) {
  if (!window.selectedJewelleryIds) window.selectedJewelleryIds = new Set();
  if (checked) {
    window.selectedJewelleryIds.add(id);
  } else {
    window.selectedJewelleryIds.delete(id);
  }
  updateJewellerySelectionState();
};

window.clearJewellerySelection = function() {
  if (window.selectedJewelleryIds) window.selectedJewelleryIds.clear();
  document.querySelectorAll('.jewellery-select-chk').forEach(chk => chk.checked = false);
  const selectAll = document.getElementById('selectAllJewellery');
  if (selectAll) selectAll.checked = false;
  updateJewellerySelectionState();
};

window.updateJewellerySelectionState = function() {
  const count = window.selectedJewelleryIds ? window.selectedJewelleryIds.size : 0;
  const bar = document.getElementById('jewelleryBulkActionBar');
  const countEl = document.getElementById('selectedJewelleryCount');
  const btnCountEl = document.getElementById('btnDeleteSelectedCount');
  const topBtn = document.getElementById('topBulkDeleteBtn');
  const topCount = document.getElementById('topBulkCount');

  if (countEl) countEl.innerText = count;
  if (btnCountEl) btnCountEl.innerText = count;
  if (topCount) topCount.innerText = count;

  if (count > 0) {
    if (bar) bar.classList.remove('hidden');
    if (topBtn) topBtn.classList.remove('hidden');
  } else {
    if (bar) bar.classList.add('hidden');
    if (topBtn) topBtn.classList.add('hidden');
  }

  // Highlight selected table rows
  document.querySelectorAll('.jewellery-select-chk').forEach(chk => {
    const row = chk.closest('tr');
    if (row) {
      if (chk.checked) {
        row.classList.add('bg-amber-50/50');
      } else {
        row.classList.remove('bg-amber-50/50');
      }
    }
  });

  // Update select all checkbox state
  const visibleChks = document.querySelectorAll('.jewellery-select-chk');
  const selectAll = document.getElementById('selectAllJewellery');
  if (selectAll && visibleChks.length > 0) {
    selectAll.checked = Array.from(visibleChks).every(c => c.checked);
  }
};

// Single Delete Confirmation Modal
window.confirmDeleteJewellery = function(id, name, code) {
  const existing = document.getElementById('deleteConfirmModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'deleteConfirmModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center space-y-4">
      <div class="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl mx-auto shadow-inner">
        🗑️
      </div>
      <div>
        <h3 class="text-lg font-bold text-gray-900">Delete Jewellery Item?</h3>
        <p class="text-xs text-gray-500 mt-1">Are you sure you want to delete <span class="font-bold text-gray-900">${name}</span> (${code})?</p>
        <div class="bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-3 text-[11px] text-left mt-3">
          <strong>⚠️ Data Safety:</strong> If this jewellery has already been billed in previous sales invoices, it will be safely marked as <strong>Inactive</strong> to preserve customer bill records without breaking historical reports.
        </div>
      </div>
      <div class="flex justify-center gap-3 pt-2">
        <button onclick="document.getElementById('deleteConfirmModal').remove()" class="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold text-xs hover:bg-gray-100 transition">
          Cancel
        </button>
        <button id="btnConfirmDeleteSingle" onclick="executeDeleteJewellery(${id})" class="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition">
          Yes, Delete Item
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.executeDeleteJewellery = async function(id) {
  const btn = document.getElementById('btnConfirmDeleteSingle');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Deleting...';
  }
  try {
    const res = await api(`/jewellery/${id}`, { method: 'DELETE' });
    document.getElementById('deleteConfirmModal')?.remove();
    showToast(res.message || 'Jewellery deleted successfully', 'success');
    if (window.selectedJewelleryIds) window.selectedJewelleryIds.delete(id);
    loadPage('jewellery', 'Jewellery & Stock');
  } catch (e) {
    showToast(e.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Yes, Delete Item';
    }
  }
};

// Bulk Delete Confirmation Modal
window.confirmBulkDeleteJewellery = function() {
  const count = window.selectedJewelleryIds ? window.selectedJewelleryIds.size : 0;
  if (count === 0) {
    return showToast('Please select at least 1 jewellery item using the checkboxes to delete.', 'warning');
  }

  const existing = document.getElementById('bulkDeleteConfirmModal');
  if (existing) existing.remove();

  const selectedItems = (window.allJewellery || []).filter(i => window.selectedJewelleryIds.has(i.id));
  const previewList = selectedItems.slice(0, 6).map(i => `<li class="truncate">• <strong>${i.name}</strong> (${i.code}) - ${i.purity}</li>`).join('');
  const remaining = count - 6;

  const modal = document.createElement('div');
  modal.id = 'bulkDeleteConfirmModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
      <div class="flex items-center gap-3 border-b pb-3">
        <div class="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl shrink-0 shadow-inner">
          🗑️
        </div>
        <div>
          <h3 class="text-base font-bold text-gray-900">Bulk Delete ${count} Jewellery Item(s)</h3>
          <p class="text-xs text-gray-500">Confirm permanent deletion or archiving from inventory</p>
        </div>
      </div>

      <div class="text-xs text-gray-600 space-y-2">
        <p>The following <strong class="text-gray-900">${count} items</strong> are selected for deletion:</p>
        <ul class="bg-gray-50 p-3 rounded-lg border font-mono text-[11px] space-y-1 text-gray-800 max-h-36 overflow-y-auto">
          ${previewList}
          ${remaining > 0 ? `<li class="text-gray-500 font-sans italic pt-1">+ and ${remaining} more item(s)...</li>` : ''}
        </ul>
        <div class="bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-3 text-[11px]">
          <strong>⚠️ Historical Protection:</strong> Items linked to completed sales transactions will be safely marked as <strong>Inactive</strong> to preserve customer bill invoices and accounting integrity.
        </div>
      </div>

      <div class="flex justify-end gap-3 pt-3 border-t">
        <button onclick="document.getElementById('bulkDeleteConfirmModal').remove()" class="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold text-xs hover:bg-gray-100 transition">
          Cancel
        </button>
        <button id="btnExecuteBulkDelete" onclick="executeBulkDeleteJewellery()" class="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition">
          Yes, Delete ${count} Items
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.executeBulkDeleteJewellery = async function() {
  const ids = Array.from(window.selectedJewelleryIds || []);
  if (ids.length === 0) return;

  const btn = document.getElementById('btnExecuteBulkDelete');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Deleting...';
  }

  try {
    const res = await api('/jewellery/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    document.getElementById('bulkDeleteConfirmModal')?.remove();
    showToast(res.message || 'Items deleted successfully', 'success');
    if (window.selectedJewelleryIds) window.selectedJewelleryIds.clear();
    loadPage('jewellery', 'Jewellery & Stock');
  } catch (e) {
    showToast(e.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerText = `Yes, Delete ${ids.length} Items`;
    }
  }
};

window.deleteJewelleryItem = function(id) {
  const item = (window.allJewellery || []).find(i => i.id === id);
  const name = item ? item.name : 'Item #' + id;
  const code = item ? item.code : '';
  confirmDeleteJewellery(id, name, code);
};

// -------------------------------------------------------------------------
// Global Single & Bulk Delete Modal & Utilities
// -------------------------------------------------------------------------
window.showDeleteConfirmModal = function({ title, message, onConfirm }) {
  const existing = document.getElementById('goldflowDeleteConfirmModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'goldflowDeleteConfirmModal';
  modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-red-100 animate-fadeIn">
      <div class="flex items-center gap-3.5 border-b border-gray-100 pb-3">
        <div class="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl shrink-0 shadow-inner">
          🗑️
        </div>
        <div>
          <h3 class="text-base font-bold text-gray-900">${title || 'Confirm Deletion'}</h3>
          <p class="text-xs text-gray-500">This action cannot be undone</p>
        </div>
      </div>
      <div class="text-xs text-gray-600 leading-relaxed">
        ${message}
      </div>
      <div class="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
        <button type="button" onclick="document.getElementById('goldflowDeleteConfirmModal').remove()" class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold text-xs hover:bg-gray-50 transition cursor-pointer">
          Cancel
        </button>
        <button type="button" id="confirmDeleteModalBtn" class="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center gap-1.5">
          <span>Yes, Delete</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const confirmBtn = document.getElementById('confirmDeleteModalBtn');
  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerText = 'Deleting...';
    try {
      await onConfirm();
      modal.remove();
    } catch (err) {
      confirmBtn.disabled = false;
      confirmBtn.innerText = 'Yes, Delete';
      showToast(err.message || 'Deletion failed', 'error');
    }
  };
};

// 1. SALES DELETE & BULK DELETE
window.selectedSalesIds = new Set();

window.toggleSelectAllSales = function(isChecked) {
  const all = window.allSales || [];
  if (isChecked) {
    all.forEach(s => window.selectedSalesIds.add(s.id));
  } else {
    window.selectedSalesIds.clear();
  }
  document.querySelectorAll('.sale-row-checkbox').forEach(cb => {
    cb.checked = isChecked;
  });
  window.updateSalesBulkBar();
};

window.toggleSaleSelection = function(id, isChecked) {
  if (isChecked) {
    window.selectedSalesIds.add(id);
  } else {
    window.selectedSalesIds.delete(id);
  }
  const all = window.allSales || [];
  const selectAllCb = document.getElementById('selectAllSalesCheckbox');
  if (selectAllCb) {
    selectAllCb.checked = all.length > 0 && window.selectedSalesIds.size === all.length;
  }
  window.updateSalesBulkBar();
};

window.clearSalesSelection = function() {
  window.selectedSalesIds.clear();
  const selectAllCb = document.getElementById('selectAllSalesCheckbox');
  if (selectAllCb) selectAllCb.checked = false;
  document.querySelectorAll('.sale-row-checkbox').forEach(cb => cb.checked = false);
  window.updateSalesBulkBar();
};

window.updateSalesBulkBar = function() {
  const bar = document.getElementById('salesBulkActionBar');
  const countEl = document.getElementById('salesSelectedCount');
  const count = window.selectedSalesIds ? window.selectedSalesIds.size : 0;
  if (!bar) return;
  if (count > 0) {
    bar.classList.remove('hidden');
    if (countEl) countEl.innerText = `${count} Selected`;
  } else {
    bar.classList.add('hidden');
  }
};

window.deleteSingleSale = function(id, invoiceNo) {
  window.showDeleteConfirmModal({
    title: `Delete Invoice ${invoiceNo || '#' + id}`,
    message: `<p>Are you sure you want to permanently delete invoice <strong>${invoiceNo || '#' + id}</strong>?</p><p class="mt-2 text-gray-500">All associated items, payment records, and discount requests will be removed. Stock will be restored if applicable.</p>`,
    onConfirm: async () => {
      const res = await api(`/sales/${id}`, { method: 'DELETE' });
      showToast(res.message || 'Invoice deleted successfully', 'success');
      window.selectedSalesIds.delete(id);
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      if (window.currentPageId === 'sales') {
        loadPage('sales', user.role === 'SELLER' ? 'My Sales' : 'Sales & Invoices');
      } else if (window.currentPageId === 'dashboard') {
        loadPage('dashboard', user.role === 'SELLER' ? 'Seller Dashboard' : (user.role === 'CASHIER' ? 'Cash Desk Dashboard' : 'Dashboard'));
      }
    }
  });
};

window.bulkDeleteSelectedSales = function() {
  const ids = Array.from(window.selectedSalesIds || []);
  if (ids.length === 0) return showToast('Please select at least 1 invoice to delete', 'warning');

  window.showDeleteConfirmModal({
    title: `Bulk Delete ${ids.length} Invoices`,
    message: `<p>Are you sure you want to permanently delete the <strong>${ids.length} selected invoice(s)</strong>?</p><p class="mt-2 text-red-600 font-medium">⚠️ This will delete all selected invoices, line items, and payment logs!</p>`,
    onConfirm: async () => {
      const res = await api('/sales/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids })
      });
      showToast(res.message || `${ids.length} invoices deleted`, 'success');
      window.selectedSalesIds.clear();
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      if (window.currentPageId === 'sales') {
        loadPage('sales', user.role === 'SELLER' ? 'My Sales' : 'Sales & Invoices');
      } else if (window.currentPageId === 'dashboard') {
        loadPage('dashboard', user.role === 'SELLER' ? 'Seller Dashboard' : (user.role === 'CASHIER' ? 'Cash Desk Dashboard' : 'Dashboard'));
      }
    }
  });
};

// 2. CUSTOMERS DELETE & BULK DELETE
window.selectedCustomerIds = new Set();

window.toggleSelectAllCustomers = function(isChecked) {
  const all = window.allCustomersList || [];
  if (isChecked) {
    all.forEach(c => window.selectedCustomerIds.add(c.id));
  } else {
    window.selectedCustomerIds.clear();
  }
  document.querySelectorAll('.customer-row-checkbox').forEach(cb => {
    cb.checked = isChecked;
  });
  window.updateCustomersBulkBar();
};

window.toggleCustomerSelection = function(id, isChecked) {
  if (isChecked) {
    window.selectedCustomerIds.add(id);
  } else {
    window.selectedCustomerIds.delete(id);
  }
  const all = window.allCustomersList || [];
  const selectAllCb = document.getElementById('selectAllCustomersCheckbox');
  if (selectAllCb) {
    selectAllCb.checked = all.length > 0 && window.selectedCustomerIds.size === all.length;
  }
  window.updateCustomersBulkBar();
};

window.clearCustomersSelection = function() {
  window.selectedCustomerIds.clear();
  const selectAllCb = document.getElementById('selectAllCustomersCheckbox');
  if (selectAllCb) selectAllCb.checked = false;
  document.querySelectorAll('.customer-row-checkbox').forEach(cb => cb.checked = false);
  window.updateCustomersBulkBar();
};

window.updateCustomersBulkBar = function() {
  const bar = document.getElementById('customersBulkActionBar');
  const countEl = document.getElementById('customersSelectedCount');
  const count = window.selectedCustomerIds ? window.selectedCustomerIds.size : 0;
  if (!bar) return;
  if (count > 0) {
    bar.classList.remove('hidden');
    if (countEl) countEl.innerText = `${count} Selected`;
  } else {
    bar.classList.add('hidden');
  }
};

window.deleteSingleCustomer = function(id, name) {
  window.showDeleteConfirmModal({
    title: `Delete Customer "${name}"`,
    message: `<p>Are you sure you want to permanently delete customer <strong>${name}</strong>?</p><p class="mt-2 text-gray-500">Historical invoice logs will be safely retained without customer profile linkage.</p>`,
    onConfirm: async () => {
      const res = await api(`/customers/${id}`, { method: 'DELETE' });
      showToast(res.message || 'Customer deleted successfully', 'success');
      window.selectedCustomerIds.delete(id);
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      loadPage('customers', 'Customers CRM');
    }
  });
};

window.bulkDeleteSelectedCustomers = function() {
  const ids = Array.from(window.selectedCustomerIds || []);
  if (ids.length === 0) return showToast('Please select at least 1 customer to delete', 'warning');

  window.showDeleteConfirmModal({
    title: `Bulk Delete ${ids.length} Customers`,
    message: `<p>Are you sure you want to permanently delete the <strong>${ids.length} selected customer(s)</strong>?</p>`,
    onConfirm: async () => {
      const res = await api('/customers/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids })
      });
      showToast(res.message || `${ids.length} customers deleted`, 'success');
      window.selectedCustomerIds.clear();
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      loadPage('customers', 'Customers CRM');
    }
  });
};

// 3. SUPPLIERS DELETE & BULK DELETE
window.selectedSupplierIds = new Set();

window.toggleSelectAllSuppliers = function(isChecked) {
  const all = window.allSuppliersList || [];
  if (isChecked) {
    all.forEach(s => window.selectedSupplierIds.add(s.id));
  } else {
    window.selectedSupplierIds.clear();
  }
  document.querySelectorAll('.supplier-card-checkbox').forEach(cb => {
    cb.checked = isChecked;
  });
  window.updateSuppliersBulkBar();
};

window.toggleSupplierSelection = function(id, isChecked) {
  if (isChecked) {
    window.selectedSupplierIds.add(id);
  } else {
    window.selectedSupplierIds.delete(id);
  }
  const all = window.allSuppliersList || [];
  const selectAllCb = document.getElementById('selectAllSuppliersCheckbox');
  if (selectAllCb) {
    selectAllCb.checked = all.length > 0 && window.selectedSupplierIds.size === all.length;
  }
  window.updateSuppliersBulkBar();
};

window.clearSuppliersSelection = function() {
  window.selectedSupplierIds.clear();
  const selectAllCb = document.getElementById('selectAllSuppliersCheckbox');
  if (selectAllCb) selectAllCb.checked = false;
  document.querySelectorAll('.supplier-card-checkbox').forEach(cb => cb.checked = false);
  window.updateSuppliersBulkBar();
};

window.updateSuppliersBulkBar = function() {
  const bar = document.getElementById('suppliersBulkActionBar');
  const countEl = document.getElementById('suppliersSelectedCount');
  const count = window.selectedSupplierIds ? window.selectedSupplierIds.size : 0;
  if (!bar) return;
  if (count > 0) {
    bar.classList.remove('hidden');
    if (countEl) countEl.innerText = `${count} Selected`;
  } else {
    bar.classList.add('hidden');
  }
};

window.deleteSingleSupplier = function(id, name) {
  window.showDeleteConfirmModal({
    title: `Delete Supplier "${name}"`,
    message: `<p>Are you sure you want to delete supplier <strong>${name}</strong>?</p>`,
    onConfirm: async () => {
      const res = await api(`/suppliers/${id}`, { method: 'DELETE' });
      showToast(res.message || 'Supplier deleted successfully', 'success');
      window.selectedSupplierIds.delete(id);
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      loadPage('suppliers', 'Suppliers');
    }
  });
};

window.bulkDeleteSelectedSuppliers = function() {
  const ids = Array.from(window.selectedSupplierIds || []);
  if (ids.length === 0) return showToast('Please select at least 1 supplier to delete', 'warning');

  window.showDeleteConfirmModal({
    title: `Bulk Delete ${ids.length} Suppliers`,
    message: `<p>Are you sure you want to delete the <strong>${ids.length} selected supplier(s)</strong>?</p>`,
    onConfirm: async () => {
      const res = await api('/suppliers/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids })
      });
      showToast(res.message || `${ids.length} suppliers deleted`, 'success');
      window.selectedSupplierIds.clear();
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      loadPage('suppliers', 'Suppliers');
    }
  });
};

// 4. EXPENSES BULK DELETE
window.selectedExpenseIds = new Set();

window.toggleSelectAllExpenses = function(isChecked) {
  const all = window.allExpensesList || [];
  if (isChecked) {
    all.forEach(e => window.selectedExpenseIds.add(e.id));
  } else {
    window.selectedExpenseIds.clear();
  }
  document.querySelectorAll('.expense-row-checkbox').forEach(cb => {
    cb.checked = isChecked;
  });
  window.updateExpensesBulkBar();
};

window.toggleExpenseSelection = function(id, isChecked) {
  if (isChecked) {
    window.selectedExpenseIds.add(id);
  } else {
    window.selectedExpenseIds.delete(id);
  }
  const all = window.allExpensesList || [];
  const selectAllCb = document.getElementById('selectAllExpensesCheckbox');
  if (selectAllCb) {
    selectAllCb.checked = all.length > 0 && window.selectedExpenseIds.size === all.length;
  }
  window.updateExpensesBulkBar();
};

window.clearExpensesSelection = function() {
  window.selectedExpenseIds.clear();
  const selectAllCb = document.getElementById('selectAllExpensesCheckbox');
  if (selectAllCb) selectAllCb.checked = false;
  document.querySelectorAll('.expense-row-checkbox').forEach(cb => cb.checked = false);
  window.updateExpensesBulkBar();
};

window.updateExpensesBulkBar = function() {
  const bar = document.getElementById('expensesBulkActionBar');
  const countEl = document.getElementById('expensesSelectedCount');
  const count = window.selectedExpenseIds ? window.selectedExpenseIds.size : 0;
  if (!bar) return;
  if (count > 0) {
    bar.classList.remove('hidden');
    if (countEl) countEl.innerText = `${count} Selected`;
  } else {
    bar.classList.add('hidden');
  }
};

window.bulkDeleteSelectedExpenses = function() {
  const ids = Array.from(window.selectedExpenseIds || []);
  if (ids.length === 0) return showToast('Please select at least 1 expense to delete', 'warning');

  window.showDeleteConfirmModal({
    title: `Bulk Delete ${ids.length} Expenses`,
    message: `<p>Are you sure you want to delete the <strong>${ids.length} selected expense(s)</strong>?</p>`,
    onConfirm: async () => {
      const res = await api('/expenses/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids })
      });
      showToast(res.message || `${ids.length} expenses deleted`, 'success');
      window.selectedExpenseIds.clear();
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      loadPage('expenses', 'Expenses');
    }
  });
};

// 5. STAFF USERS BULK DELETE
window.selectedStaffIds = new Set();

window.toggleSelectAllStaff = function(isChecked) {
  const all = window.allStaffList || [];
  if (isChecked) {
    all.forEach(u => {
      if (u.id !== user.id) window.selectedStaffIds.add(u.id);
    });
  } else {
    window.selectedStaffIds.clear();
  }
  document.querySelectorAll('.staff-row-checkbox').forEach(cb => {
    cb.checked = isChecked;
  });
  window.updateStaffBulkBar();
};

window.toggleStaffSelection = function(id, isChecked) {
  if (isChecked) {
    window.selectedStaffIds.add(id);
  } else {
    window.selectedStaffIds.delete(id);
  }
  window.updateStaffBulkBar();
};

window.clearStaffSelection = function() {
  window.selectedStaffIds.clear();
  const selectAllCb = document.getElementById('selectAllStaffCheckbox');
  if (selectAllCb) selectAllCb.checked = false;
  document.querySelectorAll('.staff-row-checkbox').forEach(cb => cb.checked = false);
  window.updateStaffBulkBar();
};

window.updateStaffBulkBar = function() {
  const bar = document.getElementById('staffBulkActionBar');
  const countEl = document.getElementById('staffSelectedCount');
  const count = window.selectedStaffIds ? window.selectedStaffIds.size : 0;
  if (!bar) return;
  if (count > 0) {
    bar.classList.remove('hidden');
    if (countEl) countEl.innerText = `${count} Selected`;
  } else {
    bar.classList.add('hidden');
  }
};

window.bulkDeleteSelectedStaff = function() {
  const ids = Array.from(window.selectedStaffIds || []);
  if (ids.length === 0) return showToast('Please select at least 1 staff user to delete', 'warning');

  window.showDeleteConfirmModal({
    title: `Bulk Remove ${ids.length} Staff Users`,
    message: `<p>Are you sure you want to remove the <strong>${ids.length} selected staff users</strong>?</p>`,
    onConfirm: async () => {
      const res = await api('/users/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids })
      });
      showToast(res.message || `${ids.length} staff users removed`, 'success');
      window.selectedStaffIds.clear();
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      loadPage('users', 'Manage Staff');
    }
  });
};

// 6. RETURNS & EXCHANGES DELETE & BULK DELETE
window.selectedReturnIds = new Set();
window.selectedExchangeIds = new Set();

window.deleteSingleReturn = function(id, invoiceNo) {
  window.showDeleteConfirmModal({
    title: `Delete Return ${invoiceNo || '#' + id}`,
    message: `<p>Are you sure you want to delete return <strong>${invoiceNo || '#' + id}</strong>?</p>`,
    onConfirm: async () => {
      const res = await api(`/returns/${id}`, { method: 'DELETE' });
      showToast(res.message || 'Return record deleted', 'success');
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      loadPage('returns_exchange', 'Returns & Exchange');
    }
  });
};

window.deleteSingleExchange = function(id, exchangeNo) {
  window.showDeleteConfirmModal({
    title: `Delete Exchange ${exchangeNo || '#' + id}`,
    message: `<p>Are you sure you want to delete gold exchange <strong>${exchangeNo || '#' + id}</strong>?</p>`,
    onConfirm: async () => {
      const res = await api(`/exchanges/${id}`, { method: 'DELETE' });
      showToast(res.message || 'Exchange record deleted', 'success');
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      loadPage('returns_exchange', 'Returns & Exchange');
    }
  });
};

window.toggleSelectAllReturns = function(isChecked) {
  const all = window.allReturnsList || [];
  if (isChecked) {
    all.forEach(r => window.selectedReturnIds.add(r.id));
  } else {
    window.selectedReturnIds.clear();
  }
  document.querySelectorAll('.return-row-checkbox').forEach(cb => {
    cb.checked = isChecked;
  });
  window.updateReturnsBulkBar();
};

window.toggleReturnSelection = function(id, isChecked) {
  if (isChecked) {
    window.selectedReturnIds.add(id);
  } else {
    window.selectedReturnIds.delete(id);
  }
  const all = window.allReturnsList || [];
  const selectAllCb = document.getElementById('selectAllReturnsCheckbox');
  if (selectAllCb) {
    selectAllCb.checked = all.length > 0 && window.selectedReturnIds.size === all.length;
  }
  window.updateReturnsBulkBar();
};

window.clearReturnsSelection = function() {
  window.selectedReturnIds.clear();
  const selectAllCb = document.getElementById('selectAllReturnsCheckbox');
  if (selectAllCb) selectAllCb.checked = false;
  document.querySelectorAll('.return-row-checkbox').forEach(cb => cb.checked = false);
  window.updateReturnsBulkBar();
};

window.updateReturnsBulkBar = function() {
  const bar = document.getElementById('returnsBulkActionBar');
  const countEl = document.getElementById('returnsSelectedCount');
  const count = window.selectedReturnIds ? window.selectedReturnIds.size : 0;
  if (!bar) return;
  if (count > 0) {
    bar.classList.remove('hidden');
    if (countEl) countEl.innerText = `${count} Selected`;
  } else {
    bar.classList.add('hidden');
  }
};

window.bulkDeleteSelectedReturns = function() {
  const ids = Array.from(window.selectedReturnIds || []);
  if (ids.length === 0) return showToast('Please select at least 1 return to delete', 'warning');

  window.showDeleteConfirmModal({
    title: `Bulk Delete ${ids.length} Returns`,
    message: `<p>Are you sure you want to delete the <strong>${ids.length} selected return record(s)</strong>?</p>`,
    onConfirm: async () => {
      const res = await api('/returns/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids })
      });
      showToast(res.message || `${ids.length} returns deleted`, 'success');
      window.selectedReturnIds.clear();
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      loadPage('returns_exchange', 'Returns & Exchange');
    }
  });
};

window.toggleSelectAllExchanges = function(isChecked) {
  const all = window.allExchangesList || [];
  if (isChecked) {
    all.forEach(e => window.selectedExchangeIds.add(e.id));
  } else {
    window.selectedExchangeIds.clear();
  }
  document.querySelectorAll('.exchange-row-checkbox').forEach(cb => {
    cb.checked = isChecked;
  });
  window.updateExchangesBulkBar();
};

window.toggleExchangeSelection = function(id, isChecked) {
  if (isChecked) {
    window.selectedExchangeIds.add(id);
  } else {
    window.selectedExchangeIds.delete(id);
  }
  const all = window.allExchangesList || [];
  const selectAllCb = document.getElementById('selectAllExchangesCheckbox');
  if (selectAllCb) {
    selectAllCb.checked = all.length > 0 && window.selectedExchangeIds.size === all.length;
  }
  window.updateExchangesBulkBar();
};

window.clearExchangesSelection = function() {
  window.selectedExchangeIds.clear();
  const selectAllCb = document.getElementById('selectAllExchangesCheckbox');
  if (selectAllCb) selectAllCb.checked = false;
  document.querySelectorAll('.exchange-row-checkbox').forEach(cb => cb.checked = false);
  window.updateExchangesBulkBar();
};

window.updateExchangesBulkBar = function() {
  const bar = document.getElementById('exchangesBulkActionBar');
  const countEl = document.getElementById('exchangesSelectedCount');
  const count = window.selectedExchangeIds ? window.selectedExchangeIds.size : 0;
  if (!bar) return;
  if (count > 0) {
    bar.classList.remove('hidden');
    if (countEl) countEl.innerText = `${count} Selected`;
  } else {
    bar.classList.add('hidden');
  }
};

window.bulkDeleteSelectedExchanges = function() {
  const ids = Array.from(window.selectedExchangeIds || []);
  if (ids.length === 0) return showToast('Please select at least 1 exchange to delete', 'warning');

  window.showDeleteConfirmModal({
    title: `Bulk Delete ${ids.length} Gold Exchanges`,
    message: `<p>Are you sure you want to delete the <strong>${ids.length} selected gold exchange record(s)</strong>?</p>`,
    onConfirm: async () => {
      const res = await api('/exchanges/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids })
      });
      showToast(res.message || `${ids.length} exchanges deleted`, 'success');
      window.selectedExchangeIds.clear();
      if (typeof fetchMenuBadges === 'function') fetchMenuBadges();
      loadPage('returns_exchange', 'Returns & Exchange');
    }
  });
};

// -------------------------------------------------------------------------
// 4. SALES MONITORING & PROFESSIONAL INVOICE PRINTING
// -------------------------------------------------------------------------
async function renderSales(container) {
  try {
    const sales = await api('/sales');
    window.allSales = sales || [];

    container.innerHTML = `
      <div class="space-y-4">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">${user.role === 'SELLER' ? 'My Sales History' : 'Sales & Invoices Management'}</h2>
            <p class="text-xs text-gray-500 mt-1">Generate invoices, print individual jewellery bills, track payments and returns</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="loadPage('sales', user.role === 'SELLER' ? 'My Sales' : 'Sales & Invoices')" class="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition">
              <span>🔄</span> Refresh Sales
            </button>
          </div>
        </div>

        <!-- Single Clean Search Keyword Filter (As Requested) -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="relative flex-1 max-w-md">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <span class="text-xs">🔍</span>
            </div>
            <input type="text" id="salesSearchInput" 
              placeholder="Search by Invoice # (e.g. GF-EST-...), Customer, Phone..." 
              oninput="window.applySalesSearch(this.value)" 
              class="w-full border border-gray-300 rounded-lg pl-8 pr-8 py-2 text-xs text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]" />
            <button type="button" onclick="document.getElementById('salesSearchInput').value=''; window.applySalesSearch('');" class="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 text-xs font-bold" title="Clear search">✕</button>
          </div>
          <div id="salesFilterResultText" class="text-xs text-gray-500 font-medium">
            Showing <strong>${sales.length}</strong> invoices
          </div>
        </div>

        <!-- Bulk Action Bar for Sales -->
        <div id="salesBulkActionBar" class="hidden bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between transition-all">
          <div class="flex items-center gap-2">
            <span class="text-base">🗑️</span>
            <span id="salesSelectedCount" class="text-xs font-bold text-red-800">0 Selected</span>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="clearSalesSelection()" class="px-2.5 py-1 text-xs text-gray-600 hover:text-gray-800 font-medium bg-white rounded border border-gray-300 transition">
              Cancel
            </button>
            <button onclick="bulkDeleteSelectedSales()" class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold shadow-sm transition flex items-center gap-1.5">
              <span>🗑️</span> Delete Selected
            </button>
          </div>
        </div>

        <!-- Sales Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                  <th class="p-3.5 w-10 text-center">
                    <input type="checkbox" id="selectAllSalesCheckbox" onchange="toggleSelectAllSales(this.checked)" class="rounded text-red-600 focus:ring-red-500 cursor-pointer" title="Select All">
                  </th>
                  <th class="p-3.5">Invoice #</th>
                  <th class="p-3.5">Date & Time</th>
                  <th class="p-3.5">Customer</th>
                  ${user.role !== 'SELLER' ? '<th class="p-3.5">Seller</th>' : ''}
                  <th class="p-3.5">Bill Amount</th>
                  <th class="p-3.5">Paid / Balance</th>
                  <th class="p-3.5">Status</th>
                  <th class="p-3.5 text-right">Invoice Actions</th>
                </tr>
              </thead>
              <tbody id="salesTableBody" class="divide-y divide-gray-100">
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Initial render of all sales rows
    window.renderSalesTableRows(sales);
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading sales: ${e.message}</div>`;
  }
}

// Render Sales Table Rows
window.renderSalesTableRows = function(salesList, searchQuery = '') {
  const tbody = document.getElementById('salesTableBody');
  if (!tbody) return;

  if (!salesList || salesList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${user.role !== 'SELLER' ? 9 : 8}" class="p-10 text-center text-gray-400">
          <div class="text-3xl mb-2">🔍</div>
          <div class="font-bold text-gray-700 text-sm">No invoices found matching "${searchQuery}"</div>
          <div class="text-xs text-gray-500 mt-1">Please check the invoice number or keyword.</div>
          <button onclick="document.getElementById('salesSearchInput').value=''; window.applySalesSearch('');" class="mt-3 px-3 py-1.5 bg-[#1F2937] hover:bg-black text-white rounded-lg text-xs font-bold transition">
            Show All Invoices
          </button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = salesList.map(s => {
    const invNo = s.invoice_no || '#' + s.id;
    const isExactMatch = searchQuery && invNo.toLowerCase().includes(searchQuery.toLowerCase());

    const dReq = s.DiscountRequest || {};
    const modPercent = dReq.modified_discount_percent != null 
      ? dReq.modified_discount_percent 
      : (s.gross_amount && s.discount_amount ? Number(((s.discount_amount / s.gross_amount) * 100).toFixed(1)) : '');
    const reqPercent = dReq.requested_discount_percent != null 
      ? dReq.requested_discount_percent 
      : (s.gross_amount && s.discount_amount ? Number(((s.discount_amount / s.gross_amount) * 100).toFixed(1)) : '');

    let statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800">Completed</span>';
    if (s.status === 'PENDING_APPROVAL') {
      statusBadge = `
        <div class="flex flex-col items-start gap-0.5">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-900 border border-yellow-300 animate-pulse flex items-center gap-1">
            <span>⏳</span> Pending ${reqPercent ? `(${reqPercent}%)` : ''}
          </span>
        </div>
      `;
    } else if (s.status === 'APPROVED') {
      statusBadge = `
        <div class="flex flex-col items-start gap-0.5">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 flex items-center gap-1">
            <span>✓</span> Approved ${reqPercent ? `(${reqPercent}%)` : ''}
          </span>
        </div>
      `;
    } else if (s.status === 'MODIFIED') {
      statusBadge = `
        <div class="flex flex-col items-start gap-0.5">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-300 shadow-sm flex items-center gap-1">
            <span>✏️</span> Modified (${modPercent}%)
          </span>
          ${reqPercent ? `<span class="text-[9px] text-gray-500 font-mono pl-1">Req: ${reqPercent}%</span>` : ''}
        </div>
      `;
    } else if (s.status === 'REJECTED') {
      statusBadge = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">Rejected (0%)</span>';
    } else if (s.status === 'CANCELLED') {
      statusBadge = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 inline-flex"><span>🚫</span> Cancelled</span>';
    }

    const dateStr = new Date(s.createdAt).toLocaleDateString() + ' ' + new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const custName = s.Customer ? s.Customer.name : 'Walk-in';

    return `
      <tr class="${isExactMatch ? 'bg-amber-50/70 border-l-4 border-amber-500' : 'hover:bg-gray-50/80'} transition duration-150">
        <td class="p-3.5 w-10 text-center">
          <input type="checkbox" class="sale-row-checkbox rounded text-red-600 focus:ring-red-500 cursor-pointer" value="${s.id}" ${window.selectedSalesIds && window.selectedSalesIds.has(s.id) ? 'checked' : ''} onchange="toggleSaleSelection(${s.id}, this.checked)">
        </td>
        <td class="p-3.5 font-bold font-mono text-gray-900">${invNo}</td>
        <td class="p-3.5 text-gray-500">${dateStr}</td>
        <td class="p-3.5 font-semibold text-gray-800">${custName}</td>
        ${user.role !== 'SELLER' ? `<td class="p-3.5 text-gray-600">${s.Seller ? s.Seller.name : '-'}</td>` : ''}
        <td class="p-3.5 font-black text-gray-900">${formatMoney(s.final_amount)}</td>
        <td class="p-3.5">
          <span class="font-bold text-green-700">${formatMoney(s.paid_amount || s.final_amount)}</span>
          ${s.balance_amount > 0 ? `<div class="text-[10px] text-red-600 font-bold">Due: ${formatMoney(s.balance_amount)}</div>` : ''}
        </td>
        <td class="p-3.5">${statusBadge}</td>
        <td class="p-3.5 text-right space-x-1">
          ${s.status === 'COMPLETED' ? `
            <button onclick="printInvoice(${s.id})" class="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded text-[11px] shadow-sm transition inline-flex items-center gap-1" title="Print Invoice (Universal for All Printers)">🖨️ Print</button>
            ${user.role !== 'SELLER' ? `
              <button onclick="cancelCompletedSale(${s.id})" class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded text-[11px]" title="Cancel Invoice">Cancel</button>
            ` : ''}
          ` : ''}
          ${s.status === 'CANCELLED' ? `
            <span class="px-2.5 py-0.5 rounded text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 inline-block">🚫 Cancelled</span>
          ` : ''}
          ${(s.status === 'APPROVED' || s.status === 'MODIFIED' || s.status === 'PENDING_APPROVAL') && user.role !== 'SELLER' ? `
            <button onclick="completeApprovedSalePrompt(${s.id})" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-black rounded text-[11px] shadow flex items-center gap-1.5 transition inline-flex">
              <span>✓ Complete Bill</span>
              ${s.status === 'MODIFIED' ? `<span class="bg-green-800/80 px-1.5 py-0.5 rounded text-[10px] font-mono">(${modPercent}%)</span>` : (s.status === 'APPROVED' ? `<span class="bg-green-800/80 px-1.5 py-0.5 rounded text-[10px] font-mono">(${reqPercent}%)</span>` : '')}
            </button>
          ` : ''}
          ${s.status === 'PENDING_APPROVAL' && user.role === 'SELLER' ? `
            <span class="px-2.5 py-1 rounded bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200 inline-block">⏳ Waiting for Owner Bill</span>
          ` : ''}
          ${(s.status === 'APPROVED' || s.status === 'MODIFIED') && user.role === 'SELLER' ? `
            <span class="px-2.5 py-1 rounded bg-blue-50 text-blue-800 text-[11px] font-bold border border-blue-200 inline-block">✓ Owner Approved (Pending Bill)</span>
          ` : ''}
          <button onclick="deleteSingleSale(${s.id}, '${invNo}')" class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-800 border border-red-200 font-semibold rounded text-[11px] inline-flex items-center gap-1 transition" title="Delete Invoice">
            <span>🗑️</span> Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
};

// Search Keyword Engine
window.applySalesSearch = function(query = '') {
  const all = window.allSales || [];
  const q = (query || document.getElementById('salesSearchInput')?.value || '').trim().toLowerCase();

  const filtered = all.filter(s => {
    if (!q) return true;
    const invNo = (s.invoice_no || '#' + s.id).toLowerCase();
    const custName = (s.Customer?.name || '').toLowerCase();
    const custPhone = (s.Customer?.phone || '').toLowerCase();
    const sellerName = (s.Seller?.name || '').toLowerCase();
    const idStr = String(s.id);

    return invNo.includes(q) ||
           custName.includes(q) ||
           custPhone.includes(q) ||
           sellerName.includes(q) ||
           idStr === q;
  });

  const resultText = document.getElementById('salesFilterResultText');
  if (resultText) {
    if (q) {
      resultText.innerHTML = `Showing <strong>${filtered.length}</strong> of <strong>${all.length}</strong> invoices`;
    } else {
      resultText.innerHTML = `Showing <strong>${all.length}</strong> invoices`;
    }
  }

  window.renderSalesTableRows(filtered, q);
};

// Complete Approved Sale (Owner/Admin)
window.completeApprovedSalePrompt = async function(id) {
  const sale = (window.allSales || []).find(s => s.id === id);
  const dReq = sale?.DiscountRequest || {};
  const disc = sale?.status === 'MODIFIED' 
    ? (dReq.modified_discount_percent != null ? dReq.modified_discount_percent : 0) 
    : (dReq.requested_discount_percent != null ? dReq.requested_discount_percent : 0);
  const payable = sale ? formatMoney(sale.final_amount) : '';

  const confirmMsg = `Complete billing for ${sale?.invoice_no || 'Sale #' + id}?\n\n` +
    (disc > 0 ? `• Discount: ${disc}%\n` : '') +
    `• Final Amount Payable: ${payable}\n\n` +
    `Complete sale, deduct stock and print invoice now?`;

  if (!confirm(confirmMsg)) return;

  const printWin = window.gfOpenPrintWindow('width=950,height=950', 'Completing Sale & Generating Invoice...');

  try {
    await api(`/sales/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ payment_method: sale?.payment_method || 'CASH' })
    });
    showToast('Sale completed and official invoice generated!', 'success');
    loadPage('sales', user.role === 'SELLER' ? 'My Sales' : 'Sales & Invoices');
    await window.printInvoice(id, 'thermal', printWin);
  } catch (e) {
    if (printWin) printWin.close();
    showToast(e.message, 'error');
  }
};

window.cancelCompletedSale = async function(id) {
  if (!confirm('Are you sure you want to cancel this invoice? Inventory stock will be automatically restored.')) return;
  try {
    await api(`/sales/${id}/cancel`, { method: 'POST' });
    showToast('Invoice cancelled and stock restored successfully', 'success');
    loadPage('sales', user.role === 'SELLER' ? 'My Sales' : 'Sales & Invoices');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// -------------------------------------------------------------------------
// PROFESSIONAL INVOICE PRINTER (Supports Combined & Per-Jewellery Invoices)
// -------------------------------------------------------------------------
window.printInvoice = async function(id, mode = null, existingWin = null) {
  let sale = null;
  try {
    sale = await api(`/sales/${id}`);
    if (sale) {
      window.allSales = window.allSales || [];
      const existingIdx = window.allSales.findIndex(s => s.id === sale.id);
      if (existingIdx >= 0) window.allSales[existingIdx] = sale;
      else window.allSales.push(sale);
    }
  } catch (e) {
    console.error('Failed to fetch sale details for invoice printing, falling back to cache:', e);
    sale = (window.allSales || []).find(s => s.id === id);
  }
  if (!sale) {
    if (existingWin && !existingWin.closed) existingWin.close();
    return showToast('Sale not found', 'error');
  }

  const shop = window.systemSettings || {};
  const sellerName = sale.Seller ? sale.Seller.name : 'Staff';
  const custName = sale.Customer ? sale.Customer.name : 'Walk-in Customer';
  const custPhone = sale.Customer ? sale.Customer.phone : '-';
  const custAddr = sale.Customer ? sale.Customer.address : '';
  const dateStr = new Date(sale.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = new Date(sale.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const items = (sale.SaleItems || []).map(si => {
    const jew = si.Jewellery || {};
    const gross = parseFloat(si.gross_weight || jew.gross_weight || jew.weight || 0);
    const stone = parseFloat(si.stone_weight || jew.stone_weight || 0);
    const net = parseFloat(si.net_weight || jew.net_weight || Math.max(0, gross - stone));
    const rate = parseFloat(si.gold_rate || 7000);
    const qty = parseInt(si.quantity || 1);
    const gVal = si.gold_value != null ? parseFloat(si.gold_value) : Math.round(net * rate * qty);
    const wVal = parseFloat(si.wastage_amount || 0);
    const mVal = parseFloat(si.making_charge || 0);
    const sVal = parseFloat(si.stone_charge || 0);
    const total = parseFloat(si.final_amount || si.price || (gVal + wVal + mVal + sVal));

    return {
      name: jew.name || 'Fine Jewellery Ornament',
      code: jew.code || '',
      barcode: jew.barcode || '',
      purity: si.purity || jew.purity || '22K',
      gross_weight: gross,
      stone_weight: stone,
      net_weight: net,
      gold_rate: rate,
      gold_value: gVal,
      wastage_percent: parseFloat(si.wastage_percent || jew.wastage_percent || 0),
      wastage_amount: wVal,
      making_charge: mVal,
      stone_charge: sVal,
      other_charges: 0,
      quantity: qty,
      line_total: total
    };
  });

  const saleGross = parseFloat(sale.gross_amount || sale.total_amount || 0);
  const saleDisc = parseFloat(sale.discount_amount || 0);
  let saleDiscPercent = 0;
  if (sale.DiscountRequest) {
    const dReq = sale.DiscountRequest;
    if (dReq.modified_discount_percent != null && (dReq.status === 'MODIFIED' || dReq.status === 'APPROVED' || sale.status === 'COMPLETED')) {
      saleDiscPercent = parseFloat(dReq.modified_discount_percent) || parseFloat(dReq.requested_discount_percent) || 0;
    } else if (dReq.requested_discount_percent != null) {
      saleDiscPercent = parseFloat(dReq.requested_discount_percent) || 0;
    }
  }
  if (!saleDiscPercent && sale.discount_percent != null) {
    saleDiscPercent = parseFloat(sale.discount_percent);
  }
  if (!saleDiscPercent && saleGross > 0 && saleDisc > 0) {
    saleDiscPercent = parseFloat(((saleDisc / saleGross) * 100).toFixed(1));
  }

  const totals = {
    goldValueTotal: parseFloat(sale.total_gold_value) || items.reduce((s, i) => s + i.gold_value, 0),
    wastageTotal: parseFloat(sale.total_wastage_charges) || items.reduce((s, i) => s + i.wastage_amount, 0),
    makingTotal: parseFloat(sale.total_making_charges) || items.reduce((s, i) => s + i.making_charge, 0),
    stoneTotal: parseFloat(sale.total_stone_charges) || items.reduce((s, i) => s + i.stone_charge, 0),
    grossAmount: saleGross,
    discountTotal: saleDisc,
    discountPercent: saleDiscPercent,
    taxableAmount: Math.max(0, saleGross - saleDisc),
    taxPercent: (sale.tax_percent != null && !isNaN(parseFloat(sale.tax_percent))) ? parseFloat(sale.tax_percent) : getCurrentGstPercent(),
    taxAmount: parseFloat(sale.tax_amount || 0),
    roundOff: parseFloat(sale.round_off || 0),
    finalPayable: parseFloat(sale.final_amount || 0)
  };

  let sheets = [];
  if (mode === 'individual') {
    // Each jewellery item gets its own luxury certificate page
    sheets = items.map(item => [item]);
  } else {
    // All items on one combined luxury tax invoice sheet
    sheets = [items];
  }

  const savedPref = (function() { try { return localStorage.getItem('gf_preferred_format'); } catch(e){ return null; } })();
  let preferredFmt = 'thermal';
  if (mode === 'individual' || mode === 'a4') {
    preferredFmt = 'a4';
  } else if (mode === 'thermal' || mode === 'tvs4') {
    preferredFmt = 'thermal';
  } else if (savedPref) {
    preferredFmt = (savedPref === 'tvs4') ? 'thermal' : savedPref;
  }

  const html = buildLuxuryJewelleryDocumentHtml({
    docType: 'INVOICE',
    defaultFormat: preferredFmt,
    docNumber: sale.invoice_no || ('GF-INV-' + sale.id),
    dateStr,
    timeStr,
    shop,
    customer: { name: custName, phone: custPhone, address: custAddr },
    sellerName,
    paymentMethod: sale.payment_method || 'CASH',
    paymentStatus: sale.payment_status || 'PAID',
    items,
    sheets,
    totals
  });

  if (existingWin && typeof existingWin.write === 'function' && !existingWin.closed) {
    existingWin.write(html);
  } else {
    window.gfOpenPrintDocument(html, 'width=950,height=950');
  }
};

// -------------------------------------------------------------------------
// 5. DISCOUNT APPROVAL SYSTEM (Owner Screen)
// -------------------------------------------------------------------------
async function renderDiscounts(container) {
  try {
    const reqs = await api('/sales/discounts');

    if (reqs.length === 0) {
      container.innerHTML = `
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center text-gray-400">
          <div class="text-4xl mb-3">✅</div>
          <div class="font-bold text-gray-700 text-base">All Caught Up!</div>
          <div class="text-xs mt-1">No pending discount requests waiting for approval.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="space-y-5">
        <div class="flex justify-between items-center mb-1">
          <div>
            <h2 class="text-xl font-bold text-gray-900">Pending Discount Approvals (${reqs.length})</h2>
            <p class="text-xs text-gray-500">Review complete gold weight, wastage, and making charges before approving discounts</p>
          </div>
          <span class="text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 px-3 py-1 rounded-full">
            Real-time Owner Authorization
          </span>
        </div>

        ${reqs.map(req => {
          const sale = req.Sale || {};
          const saleItems = sale.SaleItems || [];
          const custName = sale.Customer ? sale.Customer.name : 'Walk-in Customer';
          const custPhone = sale.Customer && sale.Customer.phone !== 'N/A' ? sale.Customer.phone : 'Counter Sale';
          const sellerName = req.Seller ? req.Seller.name : 'Staff';
          const grossTotal = parseFloat(sale.gross_amount || sale.total_amount) || 0;
          const discPct = parseFloat(req.requested_discount_percent) || 0;
          const discountAmt = Math.round(grossTotal * (discPct / 100));
          const taxableAmt = Math.max(0, grossTotal - discountAmt);
          const taxAmt = Math.round(taxableAmt * 0.03);
          const finalPayable = taxableAmt + taxAmt;

          return `
            <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4 hover:border-amber-300 transition">
              
              <!-- Card Header -->
              <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-3">
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="bg-amber-100 text-amber-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-amber-300">
                      ⏳ Pending Approval
                    </span>
                    <span class="text-xs font-mono font-bold text-gray-700">${sale.invoice_no || '#' + sale.id}</span>
                    <span class="text-[11px] text-gray-400">• ${new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ${new Date(req.createdAt).toLocaleDateString()}</span>
                  </div>
                  <h3 class="font-bold text-sm text-gray-900">
                    ${custName} <span class="text-xs font-normal text-gray-500">(${custPhone})</span>
                  </h3>
                  <div class="text-[11px] text-gray-600 mt-0.5">
                    Billed by Seller: <span class="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">${sellerName}</span>
                  </div>
                </div>

                <!-- Seller Discount Request Badge -->
                <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-right shrink-0">
                  <span class="text-[10px] uppercase font-bold text-red-600 tracking-wider block">Requested Discount</span>
                  <div class="text-xl font-black text-red-600 font-mono">
                    ${discPct}% <span class="text-xs font-bold text-red-500">(-${formatMoney(discountAmt)})</span>
                  </div>
                </div>
              </div>

              <!-- Itemized Gold & Jewellery Breakdown -->
              <div class="space-y-2.5">
                <div class="text-[11px] font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span>💍</span> Jewellery Specifications & Gold Valuation (${saleItems.length} item${saleItems.length === 1 ? '' : 's'})
                </div>

                ${saleItems.length === 0 ? `
                  <div class="text-xs text-gray-500 italic p-3 bg-gray-50 rounded-lg border">
                    No itemized breakdown recorded for this legacy sale record (Gross Total: ${formatMoney(grossTotal)}).
                  </div>
                ` : saleItems.map(si => {
                  const jew = si.Jewellery || {};
                  const grossWt = parseFloat(si.gross_weight || jew.gross_weight || jew.weight || 0);
                  const stoneWt = parseFloat(si.stone_weight || jew.stone_weight || 0);
                  const netWt = parseFloat(si.net_weight || jew.net_weight || Math.max(0, grossWt - stoneWt));
                  const purity = si.purity || jew.purity || '22K';
                  const rate = parseFloat(si.gold_rate || (window.latestRates && window.latestRates[purity]) || 6880);
                  const qty = parseInt(si.quantity) || 1;

                  let goldVal = parseFloat(si.gold_value);
                  if (!goldVal || isNaN(goldVal)) {
                    goldVal = Math.round(netWt * rate * qty);
                  }

                  const wastagePct = parseFloat(jew.wastage_percent || 0);
                  let wastageVal = parseFloat(si.wastage_amount);
                  if (!wastageVal || isNaN(wastageVal)) {
                    wastageVal = Math.round(goldVal * (wastagePct / 100));
                  }

                  let makingVal = parseFloat(si.making_charge);
                  if (!makingVal || isNaN(makingVal)) {
                    makingVal = parseFloat(jew.making_charge || 0) * qty;
                  }

                  let stoneVal = parseFloat(si.stone_charge);
                  if (!stoneVal || isNaN(stoneVal)) {
                    stoneVal = parseFloat(jew.stone_charge || 0) * qty;
                  }

                  const itemTotal = parseFloat(si.price || si.final_amount) || (goldVal + wastageVal + makingVal + stoneVal);
                  const imgUrl = jew.image_url || 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=100';

                  return `
                    <div class="border border-amber-200/80 bg-amber-50/25 rounded-xl p-3 space-y-2">
                      <!-- Top Line: Image, Name, Code, Purity & Line Total -->
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-3">
                          <div class="w-10 h-10 rounded-lg overflow-hidden bg-white border border-gray-200 shrink-0">
                            <img src="${imgUrl}" class="w-full h-full object-cover">
                          </div>
                          <div>
                            <div class="flex items-center gap-1.5">
                              <span class="font-bold text-gray-900 text-xs">${jew.name || 'Jewellery Item'}</span>
                              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-mono">${purity}</span>
                              ${qty > 1 ? `<span class="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-800">Qty ${qty}</span>` : ''}
                            </div>
                            <div class="text-[10px] text-gray-500 font-mono">
                              Code: <span class="font-semibold text-gray-700">${jew.code || '-'}</span> | Barcode: <span class="text-gray-600">${jew.barcode || '-'}</span>
                            </div>
                          </div>
                        </div>
                        <div class="text-right">
                          <span class="text-[9px] text-gray-400 uppercase font-bold block">Item Value</span>
                          <span class="font-black text-gray-900 font-mono text-xs">${formatMoney(itemTotal)}</span>
                        </div>
                      </div>

                      <!-- 9-Field Specification Breakdown Grid -->
                      <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5 text-[10px] bg-white p-2 rounded-lg border border-gray-200">
                        <div>
                          <span class="text-gray-400 block text-[9px] uppercase font-bold">Gross Wt</span>
                          <span class="font-mono font-bold text-gray-800">${Number(grossWt).toFixed(3)}g</span>
                        </div>
                        <div>
                          <span class="text-gray-400 block text-[9px] uppercase font-bold">Stone Wt</span>
                          <span class="font-mono font-bold text-gray-800">${Number(stoneWt).toFixed(3)}g</span>
                        </div>
                        <div class="bg-amber-50 p-1 rounded border border-amber-200">
                          <span class="text-amber-800 block text-[9px] uppercase font-bold">Net Gold Wt</span>
                          <span class="font-mono font-black text-amber-900">${Number(netWt).toFixed(3)}g</span>
                        </div>
                        <div>
                          <span class="text-gray-400 block text-[9px] uppercase font-bold">${purity} Rate</span>
                          <span class="font-mono font-bold text-gray-800">₹${Number(rate).toLocaleString()}/g</span>
                        </div>
                        <div class="bg-amber-50/70 p-1 rounded border border-amber-200">
                          <span class="text-amber-900 block text-[9px] uppercase font-bold">Gold Value</span>
                          <span class="font-mono font-black text-gray-900">${formatMoney(goldVal)}</span>
                        </div>
                        <div>
                          <span class="text-gray-400 block text-[9px] uppercase font-bold">Wastage (${wastagePct}%)</span>
                          <span class="font-mono font-bold text-gray-800">${formatMoney(wastageVal)}</span>
                        </div>
                        <div>
                          <span class="text-gray-400 block text-[9px] uppercase font-bold">Making / Stone</span>
                          <span class="font-mono font-bold text-gray-800">${formatMoney(makingVal + stoneVal)}</span>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <!-- Bottom Financials & Owner Action Buttons -->
              <div class="pt-3 border-t border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/80 p-3.5 rounded-xl">
                <!-- Price Summary -->
                <div class="flex flex-wrap gap-5 text-xs w-full md:w-auto">
                  <div>
                    <span class="text-gray-400 block text-[10px]">Gross Total</span>
                    <span class="font-bold text-gray-900 text-xs font-mono">${formatMoney(grossTotal)}</span>
                  </div>
                  <div>
                    <span class="text-gray-400 block text-[10px]">Discount (${discPct}%)</span>
                    <span class="font-bold text-red-600 text-xs font-mono">-${formatMoney(discountAmt)}</span>
                  </div>
                  <div>
                    <span class="text-gray-400 block text-[10px]">GST Tax (3%)</span>
                    <span class="font-bold text-gray-800 text-xs font-mono">${formatMoney(taxAmt)}</span>
                  </div>
                  <div>
                    <span class="text-gray-400 block text-[10px]">Net Payable</span>
                    <span class="font-black text-[#D4AF37] text-sm font-mono">${formatMoney(finalPayable)}</span>
                  </div>
                </div>

                <!-- Owner Actions -->
                <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                  <button onclick="respondDiscount(${req.id}, 'REJECTED')" class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded-lg text-xs transition">
                    ✕ Reject
                  </button>

                  <div class="flex items-center gap-1 bg-white border border-blue-200 rounded-lg p-0.5 shadow-sm">
                    <input type="number" id="modDiscInput_${req.id}" placeholder="%" class="w-12 px-1.5 py-1 text-xs font-bold outline-none text-center" min="0" max="100" step="0.5">
                    <button onclick="modifyDiscountAction(${req.id})" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md text-xs transition">
                      Set % & Bill
                    </button>
                  </div>

                  <button onclick="respondDiscount(${req.id}, 'APPROVED', true)" class="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white font-black rounded-lg text-xs shadow-md hover:shadow transition flex items-center gap-1">
                    <span>✓</span> Approve & Complete Bill (${discPct}%)
                  </button>
                </div>
              </div>

            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading discount requests: ${e.message}</div>`;
  }
}

window.respondDiscount = async function(id, status, complete_bill = false) {
  let printWin = null;
  if (complete_bill) {
    printWin = window.gfOpenPrintWindow('width=950,height=950', 'Completing Sale & Generating Invoice...');
  }

  try {
    const res = await api(`/sales/discounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status, complete_bill })
    });
    if (complete_bill && res.sale_id) {
      showToast(`Discount approved & Bill completed! Invoice #${res.invoice_no}`, 'success');
      await window.printInvoice(res.sale_id, 'thermal', printWin);
    } else {
      if (printWin) printWin.close();
      showToast(`Discount request ${status.toLowerCase()} successfully`, 'success');
    }
    loadPage('discounts', 'Discount Requests');
  } catch (e) {
    if (printWin) printWin.close();
    showToast(e.message, 'error');
  }
};

window.modifyDiscountAction = async function(id) {
  const val = parseFloat(document.getElementById(`modDiscInput_${id}`)?.value);
  if (isNaN(val) || val < 0 || val > 100) return showToast('Please enter a valid discount percentage', 'error');

  const completeNow = confirm(`Set discount to ${val}% and finalize bill immediately?\n\n• Click OK to finalize bill and deduct inventory now.\n• Click Cancel to only update approved discount without billing yet.`);

  let printWin = null;
  if (completeNow) {
    printWin = window.gfOpenPrintWindow('width=950,height=950', 'Completing Sale & Generating Invoice...');
  }

  try {
    const res = await api(`/sales/discounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ 
        status: 'MODIFIED', 
        modified_discount_percent: val,
        complete_bill: completeNow
      })
    });
    if (completeNow && res.sale_id) {
      showToast(`Discount modified to ${val}% and Bill completed!`, 'success');
      await window.printInvoice(res.sale_id, 'thermal', printWin);
    } else {
      if (printWin) printWin.close();
      showToast(`Discount modified to ${val}% and approved!`, 'success');
    }
    loadPage('discounts', 'Discount Requests');
  } catch (e) {
    if (printWin) printWin.close();
    showToast(e.message, 'error');
  }
};

// -------------------------------------------------------------------------
// 6. GOLD RATE MANAGEMENT
// -------------------------------------------------------------------------
async function renderRates(container) {
  try {
    const [latest, history, autoSync] = await Promise.all([
      api('/gold-rates'),
      api('/gold-rates/history'),
      api('/gold-rates/auto-sync-status').catch(() => ({ enabled: true, source: 'Chennai Bullion Live Market Feed' }))
    ]);

    const purities = [
      { key: '24K', title: '24K Fine Gold (999)', icon: '👑', desc: 'Pure Sovereign Gold' },
      { key: '22K', title: '22K Standard Gold (916)', icon: '🪙', desc: 'Standard Hallmarked Jewellery' },
      { key: '18K', title: '18K Gold (750)', icon: '✨', desc: 'Diamond & Gemstone Jewellery' },
      { key: 'SILVER_999', title: 'Silver 999 Fine', icon: '🥈', desc: 'Pure Silver Bullion' },
      { key: 'SILVER_925', title: 'Sterling Silver 925', icon: '🔘', desc: 'Silver Articles & Jewellery' }
    ];

    const isAutoSyncOn = autoSync && autoSync.enabled;
    const canManageRates = user && (user.role === 'ADMIN' || user.role === 'OWNER');

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Live Header Banner -->
        <div class="flex flex-col lg:flex-row justify-between lg:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div>
            <div class="flex flex-wrap items-center gap-2.5">
              <h2 class="text-2xl font-black text-gray-900 tracking-tight">Live Gold &amp; Silver Rate Board</h2>
              <span class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${isAutoSyncOn ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}">
                <span class="relative flex h-2.5 w-2.5">
                  ${isAutoSyncOn ? '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>' : ''}
                  <span class="relative inline-flex rounded-full h-2.5 w-2.5 ${isAutoSyncOn ? 'bg-green-500' : 'bg-amber-500'}"></span>
                </span>
                <span>${isAutoSyncOn ? '⚡ Live Auto-Sync Active' : '⏸ Auto-Sync Paused'}</span>
              </span>
            </div>
            <p class="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
              <span>📍 Market Source: <strong class="text-gray-700">${autoSync?.source || 'Chennai Live Bullion Feed'}</strong></span>
              <span class="text-gray-300">•</span>
              <span>Auto checks &amp; updates database every 15 minutes</span>
              <span class="text-gray-300">•</span>
              <span class="text-amber-700 font-semibold">Instant Socket.IO Push to all POS Terminals</span>
            </p>
          </div>

          ${user.role !== 'SELLER' ? `
            <div class="flex flex-wrap items-center gap-2.5">
              <!-- Auto Sync Toggle Switch -->
              <label class="flex items-center gap-2.5 bg-gray-50 hover:bg-gray-100 px-3.5 py-2 rounded-xl border border-gray-200 shadow-sm cursor-pointer select-none transition" title="Toggle automatic background rate updates">
                <input type="checkbox" id="autoSyncRateToggle" ${isAutoSyncOn ? 'checked' : ''} onchange="toggleLiveRateAutoSync(this.checked)" class="sr-only peer">
                <div class="w-8 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-green-600 relative"></div>
                <span class="text-xs font-bold text-gray-700">Auto Live Sync</span>
              </label>

              <!-- Instant Live Sync Button -->
              <button id="btnSyncLiveMarket" onclick="syncLiveGoldRatesNow()" class="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white font-black rounded-xl text-xs shadow-md transition flex items-center gap-1.5 active:scale-95" title="Fetch real-time live market rates right now">
                <span class="text-sm">🔄</span>
                <span>Sync Live Rate Now</span>
              </button>

              <!-- Manual Override Button -->
              <button onclick="openUpdateRatesModal()" class="px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-bold rounded-xl text-xs shadow-sm transition flex items-center gap-1">
                <span>✏️</span>
                <span>Manual Override</span>
              </button>
            </div>
          ` : ''}
        </div>

        <!-- Live Rate Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          ${purities.map(p => {
            const r = latest[p.key] || { rate_per_gram: 0, previous_rate: 0 };
            const diff = (r.rate_per_gram || 0) - (r.previous_rate || 0);
            return `
              <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center transition hover:shadow-md">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-xl">${p.icon}</span>
                    <span class="font-bold text-gray-800 text-sm">${p.title}</span>
                  </div>
                  <div class="text-2xl font-black text-gray-900 mt-2">₹${(r.rate_per_gram || 0).toLocaleString()} <span class="text-xs font-normal text-gray-500">/ gram</span></div>
                  <div class="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                    <span>Prev: ₹${(r.previous_rate || 0).toLocaleString()}</span>
                    ${diff > 0 ? `<span class="text-green-600 font-bold">▲ +₹${diff.toLocaleString()}</span>` : (diff < 0 ? `<span class="text-red-600 font-bold">▼ ₹${diff.toLocaleString()}</span>` : '<span class="text-gray-400 font-medium">(Unchanged)</span>')}
                  </div>
                </div>
                <div class="text-right">
                  <span class="text-[10px] text-gray-400 block">${p.desc}</span>
                  <span class="text-[10px] text-green-700 font-bold bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full mt-2 inline-block">Active Benchmark</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Historical Rate Log Table -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="p-4 border-b border-gray-100 flex flex-wrap justify-between items-center bg-gray-50/50 gap-2">
            <div class="flex items-center gap-3">
              <div class="font-bold text-gray-800 text-sm">Rate Change History</div>
              <span class="text-[11px] text-gray-400 font-mono">Last 50 market changes</span>
            </div>
            ${canManageRates ? `
              <div class="flex items-center gap-2">
                <button id="btnBulkDeleteRateHistory" onclick="deleteSelectedRateHistory()" style="display:none;" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 active:scale-95" title="Delete selected rate change records">
                  <span>🗑️</span>
                  <span id="bulkDeleteRateCount">Delete Selected (0)</span>
                </button>
                ${history.length > 0 ? `
                  <button onclick="clearAllRateHistory()" class="px-3 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1 active:scale-95" title="Clear all rate change history logs">
                    <span>🧹</span>
                    <span>Clear All History</span>
                  </button>
                ` : ''}
              </div>
            ` : ''}
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                  ${canManageRates ? '<th class="p-3.5 w-10 text-center"><input type="checkbox" id="selectAllRateHistory" onchange="toggleSelectAllRateHistory(this.checked)" class="rounded text-amber-600 focus:ring-amber-500 cursor-pointer h-4 w-4" title="Select All"></th>' : ''}
                  <th class="p-3.5">Date &amp; Time</th>
                  <th class="p-3.5">Metal</th>
                  <th class="p-3.5">Purity</th>
                  <th class="p-3.5">Previous Rate</th>
                  <th class="p-3.5">Updated Rate</th>
                  <th class="p-3.5">Change</th>
                  ${canManageRates ? '<th class="p-3.5 text-center w-16">Action</th>' : ''}
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${history.length === 0 ? `<tr><td colspan="${canManageRates ? 8 : 6}" class="p-6 text-center text-gray-400">No rate history recorded.</td></tr>` : ''}
                ${history.map(h => {
                  const d = (h.rate_per_gram || 0) - (h.previous_rate || 0);
                  return `
                    <tr class="hover:bg-gray-50 transition" id="rate-history-row-${h.id}">
                      ${canManageRates ? `
                        <td class="p-3.5 text-center">
                          <input type="checkbox" class="rate-history-cb rounded text-amber-600 focus:ring-amber-500 cursor-pointer h-4 w-4" value="${h.id}" onchange="updateRateHistorySelectionUI()">
                        </td>
                      ` : ''}
                      <td class="p-3.5 text-gray-500">${new Date(h.createdAt).toLocaleDateString()} ${new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td class="p-3.5 font-bold text-gray-800">${h.metal}</td>
                      <td class="p-3.5 font-semibold">${h.purity}</td>
                      <td class="p-3.5 font-mono text-gray-500">₹${(h.previous_rate || 0).toLocaleString()}</td>
                      <td class="p-3.5 font-mono font-bold text-gray-900">₹${(h.rate_per_gram || 0).toLocaleString()}</td>
                      <td class="p-3.5 font-bold ${d > 0 ? 'text-green-600' : (d < 0 ? 'text-red-600' : 'text-gray-400')}">
                        ${d > 0 ? '+₹' + d.toLocaleString() : (d < 0 ? '-₹' + Math.abs(d).toLocaleString() : '₹0')}
                      </td>
                      ${canManageRates ? `
                        <td class="p-3.5 text-center">
                          <button onclick="deleteSingleRateHistory(${h.id}, '${h.metal}', '${h.purity}', ${h.rate_per_gram})" class="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-lg transition" title="Delete this entry">
                            <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      ` : ''}
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading rates: ${e.message}</div>`;
  }
}

window.syncLiveGoldRatesNow = async function() {
  const btn = document.getElementById('btnSyncLiveMarket');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin inline-block">⏳</span> <span>Connecting Live Feed...</span>`;
  }

  try {
    const res = await api('/gold-rates/sync-live', { method: 'POST' });
    if (res.success) {
      const r22 = res.rates ? res.rates['22K'] : 0;
      showToast(`✅ Live market rates synced! 22K (916): ₹${r22?.toLocaleString()}/g`, 'success');
      loadPage('rates', 'Gold Rates');
    } else {
      showToast(res.message || 'Checked live rates', 'info');
    }
  } catch (err) {
    showToast('Failed to sync live market rate: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
};

window.toggleLiveRateAutoSync = async function(enabled) {
  try {
    const res = await api('/gold-rates/toggle-auto-sync', {
      method: 'POST',
      body: JSON.stringify({ enabled })
    });
    showToast(res.message || `Auto-sync ${enabled ? 'Enabled' : 'Disabled'}`, 'success');
    loadPage('rates', 'Gold Rates');
  } catch (err) {
    showToast('Error changing auto-sync: ' + err.message, 'error');
    const chk = document.getElementById('autoSyncRateToggle');
    if (chk) chk.checked = !enabled;
  }
};

window.toggleSelectAllRateHistory = function(checked) {
  const cbs = document.querySelectorAll('.rate-history-cb');
  cbs.forEach(cb => { cb.checked = checked; });
  updateRateHistorySelectionUI();
};

window.updateRateHistorySelectionUI = function() {
  const cbs = document.querySelectorAll('.rate-history-cb');
  const checked = Array.from(cbs).filter(cb => cb.checked);
  const btnBulk = document.getElementById('btnBulkDeleteRateHistory');
  const countSpan = document.getElementById('bulkDeleteRateCount');
  const selectAll = document.getElementById('selectAllRateHistory');

  if (selectAll && cbs.length > 0) {
    selectAll.checked = (checked.length === cbs.length);
    selectAll.indeterminate = (checked.length > 0 && checked.length < cbs.length);
  }

  if (btnBulk) {
    if (checked.length > 0) {
      btnBulk.style.display = 'inline-flex';
      if (countSpan) countSpan.innerText = `Delete Selected (${checked.length})`;
    } else {
      btnBulk.style.display = 'none';
    }
  }
};

window.deleteSingleRateHistory = async function(id, metal, purity, rate) {
  const label = metal && purity ? `${metal} (${purity}) @ ₹${Number(rate || 0).toLocaleString()}/g` : `Record #${id}`;
  if (!confirm(`Are you sure you want to delete this rate log entry?\n\n• ${label}\n\nThis record will be permanently removed.`)) {
    return;
  }

  try {
    const res = await api(`/gold-rates/history/${id}`, { method: 'DELETE' });
    showToast(res.message || 'Rate history entry deleted', 'success');
    loadPage('rates', 'Gold Rates');
  } catch (err) {
    showToast('Failed to delete rate entry: ' + err.message, 'error');
  }
};

window.deleteSelectedRateHistory = async function() {
  const cbs = document.querySelectorAll('.rate-history-cb:checked');
  const ids = Array.from(cbs).map(cb => parseInt(cb.value)).filter(Boolean);

  if (ids.length === 0) {
    showToast('No entries selected for deletion', 'info');
    return;
  }

  if (!confirm(`Are you sure you want to delete ${ids.length} selected rate history record(s)?\n\nThis action cannot be undone.`)) {
    return;
  }

  const btnBulk = document.getElementById('btnBulkDeleteRateHistory');
  const origText = btnBulk ? btnBulk.innerHTML : '';
  if (btnBulk) {
    btnBulk.disabled = true;
    btnBulk.innerHTML = '⏳ Deleting...';
  }

  try {
    const res = await api('/gold-rates/history/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    showToast(res.message || `Deleted ${ids.length} rate history records`, 'success');
    loadPage('rates', 'Gold Rates');
  } catch (err) {
    showToast('Failed to bulk delete rate records: ' + err.message, 'error');
  } finally {
    if (btnBulk) {
      btnBulk.disabled = false;
      btnBulk.innerHTML = origText;
    }
  }
};

window.clearAllRateHistory = async function() {
  if (!confirm('⚠️ WARNING: Clear All Rate Change History?\n\nThis will permanently delete all rate change history logs from the database.\n\nAre you sure you want to proceed?')) {
    return;
  }

  try {
    const res = await api('/gold-rates/history/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ all: true })
    });
    showToast(res.message || 'All rate change history cleared', 'success');
    loadPage('rates', 'Gold Rates');
  } catch (err) {
    showToast('Failed to clear rate history: ' + err.message, 'error');
  }
};

window.autofillLiveRatesInModal = async function() {
  const btn = document.getElementById('btnAutofillLive');
  if (btn) btn.innerHTML = '⏳ Fetching Market Feed...';
  try {
    const live = await api('/gold-rates/live');
    if (live && live.rates) {
      if (document.getElementById('rate_24k')) document.getElementById('rate_24k').value = live.rates['24K'] || 0;
      if (document.getElementById('rate_22k')) document.getElementById('rate_22k').value = live.rates['22K'] || 0;
      if (document.getElementById('rate_18k')) document.getElementById('rate_18k').value = live.rates['18K'] || 0;
      if (document.getElementById('rate_silver999')) document.getElementById('rate_silver999').value = live.rates['SILVER_999'] || 0;
      if (document.getElementById('rate_silver925')) document.getElementById('rate_silver925').value = live.rates['SILVER_925'] || 0;
      showToast('Live market rates autofilled into fields!', 'success');
    }
  } catch (err) {
    showToast('Failed to fetch live rates: ' + err.message, 'error');
  } finally {
    if (btn) btn.innerHTML = '⚡ Autofill Live Market Rate';
  }
};

window.openUpdateRatesModal = function() {
  const existing = document.getElementById('updateRatesModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'updateRatesModal';
  modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100">
      <div class="flex justify-between items-center border-b pb-3 mb-4">
        <div>
          <h3 class="font-black text-gray-900 text-base">Update Benchmark Gold Rates</h3>
          <p class="text-[11px] text-gray-400">Manually override or autofill from live feed</p>
        </div>
        <button onclick="document.getElementById('updateRatesModal').remove()" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
      </div>

      <div class="mb-4">
        <button id="btnAutofillLive" onclick="autofillLiveRatesInModal()" class="w-full py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition">
          <span>⚡</span>
          <span>Autofill Live Market Rate</span>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-gray-700 mb-1">24K Pure Gold (₹/g)</label>
          <input type="number" id="rate_24k" value="${window.latestRates['24K'] || 7500}" class="w-full border rounded-lg p-2 font-mono outline-none focus:border-[#D4AF37]">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">22K Standard Gold (₹/g)</label>
          <input type="number" id="rate_22k" value="${window.latestRates['22K'] || 6875}" class="w-full border rounded-lg p-2 font-mono outline-none focus:border-[#D4AF37]">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">18K Gold (₹/g)</label>
          <input type="number" id="rate_18k" value="${window.latestRates['18K'] || 5625}" class="w-full border rounded-lg p-2 font-mono outline-none focus:border-[#D4AF37]">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Silver 999 Fine (₹/g)</label>
          <input type="number" id="rate_silver999" value="${window.latestRates['SILVER_999'] || 98}" class="w-full border rounded-lg p-2 font-mono outline-none focus:border-[#D4AF37]">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Silver 925 Sterling (₹/g)</label>
          <input type="number" id="rate_silver925" value="${window.latestRates['SILVER_925'] || 90}" class="w-full border rounded-lg p-2 font-mono outline-none focus:border-[#D4AF37]">
        </div>
      </div>

      <div class="mt-5 flex gap-2">
        <button onclick="document.getElementById('updateRatesModal').remove()" class="flex-1 py-2.5 border rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
        <button onclick="submitUpdateRates()" class="flex-1 btn-gold py-2.5 rounded-xl text-xs font-bold shadow-md transition">Publish Rates</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.submitUpdateRates = async function() {
  const r24 = parseFloat(document.getElementById('rate_24k')?.value);
  const r22 = parseFloat(document.getElementById('rate_22k')?.value);
  const r18 = parseFloat(document.getElementById('rate_18k')?.value);
  const rSil999 = parseFloat(document.getElementById('rate_silver999')?.value);
  const rSil925 = parseFloat(document.getElementById('rate_silver925')?.value);

  const payload = {
    rates: [
      { metal: 'GOLD', purity: '24K', rate_per_gram: r24 },
      { metal: 'GOLD', purity: '22K', rate_per_gram: r22 },
      { metal: 'GOLD', purity: '18K', rate_per_gram: r18 },
      { metal: 'SILVER', purity: 'SILVER_999', rate_per_gram: rSil999 },
      { metal: 'SILVER', purity: 'SILVER_925', rate_per_gram: rSil925 }
    ]
  };

  try {
    await api('/gold-rates', { method: 'POST', body: JSON.stringify(payload) });
    if (!isNaN(r24)) window.latestRates['24K'] = r24;
    if (!isNaN(r22)) window.latestRates['22K'] = r22;
    if (!isNaN(r18)) window.latestRates['18K'] = r18;
    if (!isNaN(rSil999)) window.latestRates['SILVER_999'] = rSil999;
    if (!isNaN(rSil925)) window.latestRates['SILVER_925'] = rSil925;

    updateAllGoldRateBadges();

    document.getElementById('updateRatesModal').remove();
    showToast('New benchmark rates published!', 'success');

    if (window.currentPageId === 'rates') {
      loadPage('rates', 'Gold Rates');
    } else if (window.currentPageId === 'dashboard') {
      loadPage('dashboard', 'Dashboard');
    } else if (window.currentPageId === 'sell' && typeof calculateCartTotals === 'function') {
      updatePosCalculations();
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// -------------------------------------------------------------------------
// 7. PURCHASE MANAGEMENT (Supplier Stock-In)
// -------------------------------------------------------------------------
async function renderPurchases(container) {
  try {
    const [purchases, suppliers] = await Promise.all([
      api('/purchases'),
      api('/suppliers').catch(() => [])
    ]);
    window.allSuppliers = suppliers;

    const totalPurchased = purchases.reduce((sum, p) => sum + (p.total_amount || 0), 0);

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Purchase Management</h2>
            <p class="text-xs text-gray-500 mt-1">Record bullion & jewellery purchases from suppliers with automatic inventory stock addition</p>
          </div>
          <button onclick="openNewPurchaseModal()" class="btn-gold px-4 py-2 rounded-lg text-sm font-bold shadow">
            + Record Supplier Purchase
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <span class="text-xs font-semibold text-gray-500 uppercase">Total Purchases</span>
            <span class="text-2xl font-black text-gray-900 mt-1 block">${formatMoney(totalPurchased)}</span>
          </div>
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <span class="text-xs font-semibold text-gray-500 uppercase">Total Invoices</span>
            <span class="text-2xl font-black text-blue-600 mt-1 block">${purchases.length} Records</span>
          </div>
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <span class="text-xs font-semibold text-gray-500 uppercase">Registered Suppliers</span>
            <span class="text-2xl font-black text-emerald-600 mt-1 block">${suppliers.length} Suppliers</span>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                  <th class="p-3.5">Invoice #</th>
                  <th class="p-3.5">Date</th>
                  <th class="p-3.5">Supplier</th>
                  <th class="p-3.5">Total Amount</th>
                  <th class="p-3.5">Payment Status</th>
                  <th class="p-3.5">Notes</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${purchases.length === 0 ? '<tr><td colspan="6" class="p-8 text-center text-gray-400">No purchases recorded yet.</td></tr>' : ''}
                ${purchases.map(p => `
                  <tr class="hover:bg-gray-50">
                    <td class="p-3.5 font-mono font-bold text-gray-900">${p.purchase_invoice_no}</td>
                    <td class="p-3.5 text-gray-500">${new Date(p.date).toLocaleDateString()}</td>
                    <td class="p-3.5 font-semibold text-gray-800">${p.Supplier ? p.Supplier.name : 'Unknown'}</td>
                    <td class="p-3.5 font-black text-gray-900">${formatMoney(p.total_amount)}</td>
                    <td class="p-3.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">${p.payment_status}</span></td>
                    <td class="p-3.5 text-gray-500">${p.notes || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading purchases: ${e.message}</div>`;
  }
}

window.openNewPurchaseModal = function() {
  const existing = document.getElementById('newPurchaseModal');
  if (existing) existing.remove();

  const suppliersOptions = (window.allSuppliers || []).map(s => `<option value="${s.id}">${s.name} (${s.phone})</option>`).join('');

  const modal = document.createElement('div');
  modal.id = 'newPurchaseModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center border-b pb-3 mb-4">
        <h3 class="font-bold text-gray-900 text-base">Record Supplier Purchase</h3>
        <button onclick="document.getElementById('newPurchaseModal').remove()" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Select Supplier *</label>
          <select id="pur_supplier" class="w-full border rounded-lg p-2 outline-none">
            ${suppliersOptions || '<option value="">No suppliers found. Create one first.</option>'}
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Supplier Invoice No *</label>
            <input type="text" id="pur_inv_no" class="w-full border rounded-lg p-2" placeholder="e.g. SUP-9982">
          </div>
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Date</label>
            <input type="date" id="pur_date" value="${new Date().toISOString().split('T')[0]}" class="w-full border rounded-lg p-2">
          </div>
        </div>

        <div class="border-t pt-3">
          <h4 class="font-bold text-gray-800 mb-2">Jewellery Item Stock-In</h4>
          <div class="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Item Name *</label>
              <input type="text" id="pur_item_name" class="w-full border rounded-lg p-2" placeholder="e.g. Gold Bangles 22K">
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Purity</label>
              <select id="pur_purity" class="w-full border rounded-lg p-2">
                <option value="22K">22K</option>
                <option value="24K">24K</option>
                <option value="18K">18K</option>
                <option value="SILVER_999">Silver 999</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3 mb-2">
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Gross Wt (g)</label>
              <input type="number" step="0.01" id="pur_gross_wt" class="w-full border rounded-lg p-2" placeholder="0.00">
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Stone Wt (g)</label>
              <input type="number" step="0.01" id="pur_stone_wt" class="w-full border rounded-lg p-2" value="0">
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Quantity *</label>
              <input type="number" id="pur_qty" value="1" min="1" class="w-full border rounded-lg p-2">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Total Purchase Cost (₹) *</label>
              <input type="number" id="pur_cost" class="w-full border rounded-lg p-2" placeholder="Total cost">
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Retail Selling Price (₹) *</label>
              <input type="number" id="pur_sell_price" class="w-full border rounded-lg p-2" placeholder="Selling price">
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6 flex gap-2">
        <button onclick="document.getElementById('newPurchaseModal').remove()" class="flex-1 py-2 border rounded-lg text-xs font-semibold text-gray-600">Cancel</button>
        <button onclick="submitNewPurchase()" class="flex-1 btn-gold py-2 rounded-lg text-xs font-bold">Record & Restock</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.submitNewPurchase = async function() {
  const supplierId = document.getElementById('pur_supplier')?.value;
  const invNo = document.getElementById('pur_inv_no')?.value.trim();
  const date = document.getElementById('pur_date')?.value;
  const itemName = document.getElementById('pur_item_name')?.value.trim();
  const purity = document.getElementById('pur_purity')?.value;
  const gross = parseFloat(document.getElementById('pur_gross_wt')?.value) || 0;
  const stone = parseFloat(document.getElementById('pur_stone_wt')?.value) || 0;
  const qty = parseInt(document.getElementById('pur_qty')?.value) || 1;
  const cost = parseFloat(document.getElementById('pur_cost')?.value) || 0;
  const sellPrice = parseFloat(document.getElementById('pur_sell_price')?.value) || (cost * 1.15);

  if (!supplierId || !invNo || !itemName || cost <= 0) {
    return showToast('Please fill all required purchase details', 'error');
  }

  const payload = {
    supplier_id: supplierId,
    purchase_invoice_no: invNo,
    date,
    paid_amount: cost,
    items: [
      {
        name: itemName,
        metal: purity.includes('SILVER') ? 'Silver' : 'Gold',
        purity,
        gross_weight: gross,
        stone_weight: stone,
        net_weight: Math.max(0, gross - stone),
        purchase_cost: cost,
        selling_price: sellPrice,
        quantity: qty
      }
    ]
  };

  try {
    await api('/purchases', { method: 'POST', body: JSON.stringify(payload) });
    document.getElementById('newPurchaseModal').remove();
    showToast('Purchase recorded! Inventory stock increased automatically.', 'success');
    loadPage('purchases', 'Purchases');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// -------------------------------------------------------------------------
// 8. SUPPLIER MANAGEMENT
// -------------------------------------------------------------------------
async function renderSuppliers(container) {
  try {
    const suppliers = await api('/suppliers');
    window.allSuppliersList = suppliers || [];
    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Supplier Ledger & Directory</h2>
            <p class="text-xs text-gray-500 mt-1">Manage wholesale bullion & jewellery vendor profiles and balances</p>
          </div>
          <button onclick="openAddSupplierModal()" class="btn-gold px-4 py-2 rounded-lg text-sm font-bold shadow">
            + Add Supplier
          </button>
        </div>

        <!-- Bulk Action Bar for Suppliers -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div class="flex items-center gap-2">
            <input type="checkbox" id="selectAllSuppliersCheckbox" onchange="toggleSelectAllSuppliers(this.checked)" class="rounded text-red-600 focus:ring-red-500 cursor-pointer" title="Select All">
            <label for="selectAllSuppliersCheckbox" class="text-xs font-semibold text-gray-700 cursor-pointer">Select All Suppliers</label>
          </div>
          <div id="suppliersBulkActionBar" class="hidden bg-red-50 border border-red-200 rounded-xl px-3 py-1.5 flex items-center gap-3">
            <span id="suppliersSelectedCount" class="text-xs font-bold text-red-800">0 Selected</span>
            <button onclick="clearSuppliersSelection()" class="text-xs text-gray-500 hover:text-gray-700 underline">Cancel</button>
            <button onclick="bulkDeleteSelectedSuppliers()" class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold shadow-sm flex items-center gap-1.5">
              <span>🗑️</span> Delete Selected
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          ${suppliers.length === 0 ? '<div class="col-span-3 text-center py-12 text-gray-400">No suppliers registered.</div>' : ''}
          ${suppliers.map(s => `
            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
              <div>
                <div class="flex justify-between items-start">
                  <div class="flex items-center gap-2">
                    <input type="checkbox" class="supplier-card-checkbox rounded text-red-600 focus:ring-red-500 cursor-pointer" value="${s.id}" ${window.selectedSupplierIds && window.selectedSupplierIds.has(s.id) ? 'checked' : ''} onchange="toggleSupplierSelection(${s.id}, this.checked)">
                    <h3 class="font-bold text-gray-900 text-sm">${s.name}</h3>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-mono bg-gray-100 px-2 py-0.5 rounded">ID: ${s.id}</span>
                    <button onclick="deleteSingleSupplier(${s.id}, '${(s.name || '').replace(/'/g, "\\'")}')" class="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-800 border border-red-200 font-bold rounded text-[11px] transition" title="Delete Supplier">
                      <span>🗑️</span>
                    </button>
                  </div>
                </div>
                <p class="text-xs text-gray-500 mt-1">📞 ${s.phone} | ✉️ ${s.email || '-'}</p>
                <p class="text-xs text-gray-400 mt-1">${s.address || 'Address not listed'}</p>
                <div class="text-[11px] font-mono text-gray-600 mt-2">GST: <span class="font-bold">${s.gst_number || 'Unregistered'}</span></div>
              </div>

              <div class="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
                <div>
                  <span class="text-gray-400 block">Total Purchases</span>
                  <span class="font-bold text-gray-900">${formatMoney(s.total_purchases)}</span>
                </div>
                <div class="text-right">
                  <span class="text-gray-400 block">Outstanding</span>
                  <span class="font-bold text-red-600">${formatMoney(s.outstanding_balance)}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading suppliers: ${e.message}</div>`;
  }
}

window.openAddSupplierModal = function() {
  const existing = document.getElementById('addSupplierModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'addSupplierModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
      <h3 class="font-bold text-gray-900 text-sm mb-3">Add Supplier Profile</h3>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Company / Supplier Name *</label>
          <input type="text" id="sup_name" class="w-full border rounded-lg p-2" placeholder="e.g. Swarna Bullion Wholesalers">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Phone *</label>
          <input type="text" id="sup_phone" class="w-full border rounded-lg p-2" placeholder="e.g. 9840012345">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Email</label>
          <input type="email" id="sup_email" class="w-full border rounded-lg p-2" placeholder="vendor@example.com">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">GSTIN Number</label>
          <input type="text" id="sup_gst" class="w-full border rounded-lg p-2 font-mono uppercase" placeholder="33AAAAA0000A1Z5">
        </div>
      </div>

      <div class="mt-5 flex gap-2">
        <button onclick="document.getElementById('addSupplierModal').remove()" class="flex-1 py-2 border rounded-lg text-xs font-semibold text-gray-600">Cancel</button>
        <button onclick="submitAddSupplier()" class="flex-1 btn-gold py-2 rounded-lg text-xs font-bold">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.submitAddSupplier = async function() {
  const name = document.getElementById('sup_name')?.value.trim();
  const phone = document.getElementById('sup_phone')?.value.trim();
  const email = document.getElementById('sup_email')?.value.trim();
  const gst = document.getElementById('sup_gst')?.value.trim();

  if (!name || !phone) return showToast('Name and phone are required', 'error');

  try {
    await api('/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name, phone, email, gst_number: gst })
    });
    document.getElementById('addSupplierModal').remove();
    showToast('Supplier created successfully', 'success');
    loadPage('suppliers', 'Suppliers');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// -------------------------------------------------------------------------
// 9. CUSTOMER CRM (Profile, Previous Invoices, Returns & Outstanding)
// -------------------------------------------------------------------------
async function renderCustomers(container) {
  try {
    const customers = await api('/customers');
    window.allCustomersList = customers || [];
    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Customer Relationship Management (CRM)</h2>
            <p class="text-xs text-gray-500 mt-1">Track customer purchase portfolios, outstanding credit, and previous invoices</p>
          </div>
          <button onclick="openQuickAddCustomerModal()" class="btn-gold px-4 py-2 rounded-lg text-sm font-bold shadow">
            + Add Customer
          </button>
        </div>

        <!-- Bulk Action Bar for Customers -->
        <div id="customersBulkActionBar" class="hidden bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between transition-all">
          <div class="flex items-center gap-2">
            <span class="text-base">🗑️</span>
            <span id="customersSelectedCount" class="text-xs font-bold text-red-800">0 Selected</span>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="clearCustomersSelection()" class="px-2.5 py-1 text-xs text-gray-600 hover:text-gray-800 font-medium bg-white rounded border border-gray-300 transition">
              Cancel
            </button>
            <button onclick="bulkDeleteSelectedCustomers()" class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold shadow-sm transition flex items-center gap-1.5">
              <span>🗑️</span> Delete Selected
            </button>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                  <th class="p-3.5 w-10 text-center">
                    <input type="checkbox" id="selectAllCustomersCheckbox" onchange="toggleSelectAllCustomers(this.checked)" class="rounded text-red-600 focus:ring-red-500 cursor-pointer" title="Select All">
                  </th>
                  <th class="p-3.5">Customer Name</th>
                  <th class="p-3.5">Phone</th>
                  <th class="p-3.5">Email / Address</th>
                  <th class="p-3.5">Total Purchases</th>
                  <th class="p-3.5">Bills Count</th>
                  <th class="p-3.5">Outstanding Due</th>
                  <th class="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${customers.length === 0 ? '<tr><td colspan="8" class="p-8 text-center text-gray-400">No customers registered yet.</td></tr>' : ''}
                ${customers.map(c => `
                  <tr class="hover:bg-gray-50 transition cursor-pointer" onclick="openCustomerProfile(${c.id})">
                    <td class="p-3.5 w-10 text-center" onclick="event.stopPropagation()">
                      <input type="checkbox" class="customer-row-checkbox rounded text-red-600 focus:ring-red-500 cursor-pointer" value="${c.id}" ${window.selectedCustomerIds && window.selectedCustomerIds.has(c.id) ? 'checked' : ''} onchange="toggleCustomerSelection(${c.id}, this.checked)">
                    </td>
                    <td class="p-3.5 font-bold text-gray-900">${c.name}</td>
                    <td class="p-3.5 text-gray-600 font-mono">${c.phone}</td>
                    <td class="p-3.5 text-gray-500">${c.email || c.address || '-'}</td>
                    <td class="p-3.5 font-bold text-gray-900">${formatMoney(c.totalPurchases)}</td>
                    <td class="p-3.5 font-semibold text-gray-700">${c.orderCount} Bills</td>
                    <td class="p-3.5 font-bold ${c.outstanding_balance > 0 ? 'text-red-600' : 'text-gray-400'}">${formatMoney(c.outstanding_balance)}</td>
                    <td class="p-3.5 text-right space-x-2">
                      <button onclick="event.stopPropagation(); openCustomerProfile(${c.id})" class="text-xs text-[#D4AF37] font-bold hover:underline">View 360° Profile →</button>
                      <button onclick="event.stopPropagation(); deleteSingleCustomer(${c.id}, '${(c.name || '').replace(/'/g, "\\'")}')" class="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-800 border border-red-200 font-bold rounded text-[11px] inline-flex items-center gap-1 transition" title="Delete Customer">
                        <span>🗑️</span> Delete
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading customers: ${e.message}</div>`;
  }
}

window.openCustomerProfile = async function(id) {
  try {
    const c = await api(`/customers/${id}`);
    const existing = document.getElementById('customerProfileModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'customerProfileModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-start border-b pb-4 mb-4">
          <div>
            <h3 class="text-lg font-bold text-gray-900">${c.name}</h3>
            <p class="text-xs text-gray-500">📞 ${c.phone} | ✉️ ${c.email || 'N/A'}</p>
            <p class="text-xs text-gray-500 mt-0.5">Address: ${c.address || 'N/A'}</p>
          </div>
          <button onclick="document.getElementById('customerProfileModal').remove()" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 p-3 rounded-lg border text-xs">
            <span class="text-gray-400 block uppercase">Total Purchases</span>
            <span class="text-base font-black text-gray-900 mt-1 block">${formatMoney(c.total_purchases)}</span>
          </div>
          <div class="bg-gray-50 p-3 rounded-lg border text-xs">
            <span class="text-gray-400 block uppercase">Outstanding Credit Due</span>
            <span class="text-base font-black text-red-600 mt-1 block">${formatMoney(c.outstanding_balance)}</span>
          </div>
        </div>

        <h4 class="font-bold text-gray-800 text-xs uppercase tracking-wider mb-2">Previous Invoices (${(c.Sales || []).length})</h4>
        <div class="space-y-2 max-h-48 overflow-y-auto mb-6 text-xs">
          ${(c.Sales || []).length === 0 ? '<div class="text-gray-400">No invoices on file.</div>' : ''}
          ${(c.Sales || []).map(s => `
            <div class="p-2.5 rounded border border-gray-100 flex justify-between items-center hover:bg-gray-50">
              <div>
                <span class="font-bold font-mono text-gray-800">${s.invoice_no || '#' + s.id}</span>
                <span class="text-gray-400 ml-2">${new Date(s.createdAt).toLocaleDateString()}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="font-black text-gray-900">${formatMoney(s.final_amount)}</span>
                <button onclick="printInvoice(${s.id})" class="text-xs btn-gold px-2 py-0.5 rounded">Invoice</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// -------------------------------------------------------------------------
// 10. RETURNS & GOLD EXCHANGE MODULE
// -------------------------------------------------------------------------
async function renderReturnsExchange(container) {
  try {
    const [returns, exchanges] = await Promise.all([
      api('/returns').catch(() => []),
      api('/exchanges').catch(() => [])
    ]);

    window.allReturnsList = returns || [];
    window.allExchangesList = exchanges || [];

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Sales Returns & Old Gold Exchange</h2>
            <p class="text-xs text-gray-500 mt-1">Process returns with inventory restock or evaluate customer old gold against new jewellery</p>
          </div>
          <div class="flex gap-2">
            <button onclick="openGoldExchangeModal()" class="btn-gold px-3.5 py-2 rounded-lg text-xs font-bold shadow">
              🪙 Old Gold Exchange Calculator
            </button>
            <button onclick="openProcessReturnModal()" class="bg-gray-900 hover:bg-black text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow">
              🔄 Process Sale Return
            </button>
          </div>
        </div>

        <!-- Returns Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div class="font-bold text-gray-800 text-sm">Completed Returns (${returns.length})</div>
            <div id="returnsBulkActionBar" class="hidden bg-red-50 border border-red-200 rounded-xl px-3 py-1 flex items-center gap-3">
              <span id="returnsSelectedCount" class="text-xs font-bold text-red-800">0 Selected</span>
              <button onclick="clearReturnsSelection()" class="text-xs text-gray-500 hover:text-gray-700 underline">Cancel</button>
              <button onclick="bulkDeleteSelectedReturns()" class="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold shadow-xs">🗑️ Delete Selected</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                  <th class="p-3.5 w-10 text-center">
                    <input type="checkbox" id="selectAllReturnsCheckbox" onchange="toggleSelectAllReturns(this.checked)" class="rounded text-red-600 focus:ring-red-500 cursor-pointer" title="Select All">
                  </th>
                  <th class="p-3.5">Return #</th>
                  <th class="p-3.5">Original Sale</th>
                  <th class="p-3.5">Customer</th>
                  <th class="p-3.5">Refund Amount</th>
                  <th class="p-3.5">Reason</th>
                  <th class="p-3.5">Date</th>
                  <th class="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${returns.length === 0 ? '<tr><td colspan="8" class="p-6 text-center text-gray-400">No returns processed.</td></tr>' : ''}
                ${returns.map(r => `
                  <tr class="hover:bg-gray-50">
                    <td class="p-3.5 w-10 text-center">
                      <input type="checkbox" class="return-row-checkbox rounded text-red-600 focus:ring-red-500 cursor-pointer" value="${r.id}" ${window.selectedReturnIds && window.selectedReturnIds.has(r.id) ? 'checked' : ''} onchange="toggleReturnSelection(${r.id}, this.checked)">
                    </td>
                    <td class="p-3.5 font-bold font-mono text-gray-900">${r.return_invoice_no}</td>
                    <td class="p-3.5 font-mono text-gray-700">${r.Sale ? (r.Sale.invoice_no || '#' + r.Sale.id) : '-'}</td>
                    <td class="p-3.5 font-semibold text-gray-800">${r.Customer ? r.Customer.name : 'Customer'}</td>
                    <td class="p-3.5 font-black text-red-600">${formatMoney(r.total_refund_amount)}</td>
                    <td class="p-3.5 text-gray-500">${r.reason || 'Return'}</td>
                    <td class="p-3.5 text-gray-500">${new Date(r.createdAt).toLocaleDateString()}</td>
                    <td class="p-3.5 text-right">
                      <button onclick="deleteSingleReturn(${r.id}, '${r.return_invoice_no}')" class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded text-[11px] inline-flex items-center gap-1 transition" title="Delete Return">
                        <span>🗑️</span> Delete
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Gold Exchanges Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div class="font-bold text-gray-800 text-sm">Old Gold Exchange History (${exchanges.length})</div>
            <div id="exchangesBulkActionBar" class="hidden bg-red-50 border border-red-200 rounded-xl px-3 py-1 flex items-center gap-3">
              <span id="exchangesSelectedCount" class="text-xs font-bold text-red-800">0 Selected</span>
              <button onclick="clearExchangesSelection()" class="text-xs text-gray-500 hover:text-gray-700 underline">Cancel</button>
              <button onclick="bulkDeleteSelectedExchanges()" class="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold shadow-xs">🗑️ Delete Selected</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                  <th class="p-3.5 w-10 text-center">
                    <input type="checkbox" id="selectAllExchangesCheckbox" onchange="toggleSelectAllExchanges(this.checked)" class="rounded text-red-600 focus:ring-red-500 cursor-pointer" title="Select All">
                  </th>
                  <th class="p-3.5">Exchange #</th>
                  <th class="p-3.5">Old Purity / Wt</th>
                  <th class="p-3.5">Evaluated Rate</th>
                  <th class="p-3.5">Old Gold Value</th>
                  <th class="p-3.5">New Jewellery Value</th>
                  <th class="p-3.5">Amount Payable / Diff</th>
                  <th class="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${exchanges.length === 0 ? '<tr><td colspan="8" class="p-6 text-center text-gray-400">No gold exchanges recorded.</td></tr>' : ''}
                ${exchanges.map(e => `
                  <tr class="hover:bg-gray-50">
                    <td class="p-3.5 w-10 text-center">
                      <input type="checkbox" class="exchange-row-checkbox rounded text-red-600 focus:ring-red-500 cursor-pointer" value="${e.id}" ${window.selectedExchangeIds && window.selectedExchangeIds.has(e.id) ? 'checked' : ''} onchange="toggleExchangeSelection(${e.id}, this.checked)">
                    </td>
                    <td class="p-3.5 font-bold font-mono text-gray-900">${e.exchange_no}</td>
                    <td class="p-3.5 font-semibold text-gray-800">${e.old_purity} | ${e.old_net_weight}g Net</td>
                    <td class="p-3.5 font-mono">₹${e.old_rate}/g</td>
                    <td class="p-3.5 font-bold text-green-700">${formatMoney(e.old_gold_value)}</td>
                    <td class="p-3.5 font-bold text-gray-900">${formatMoney(e.new_jewellery_value)}</td>
                    <td class="p-3.5 font-black ${e.amount_difference >= 0 ? 'text-gray-900' : 'text-red-600'}">
                      ${e.amount_difference >= 0 ? `Payable: ${formatMoney(e.amount_difference)}` : `Refund: ${formatMoney(Math.abs(e.amount_difference))}`}
                    </td>
                    <td class="p-3.5 text-right">
                      <button onclick="deleteSingleExchange(${e.id}, '${e.exchange_no}')" class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded text-[11px] inline-flex items-center gap-1 transition" title="Delete Exchange">
                        <span>🗑️</span> Delete
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading returns: ${e.message}</div>`;
  }
}

window.openGoldExchangeModal = function() {
  const existing = document.getElementById('goldExchangeModal');
  if (existing) existing.remove();

  const rate22 = window.latestRates['22K'] || 6875;

  const modal = document.createElement('div');
  modal.id = 'goldExchangeModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
      <div class="flex justify-between items-center border-b pb-3 mb-4">
        <h3 class="font-bold text-gray-900 text-base">Old Gold Exchange Valuation</h3>
        <button onclick="document.getElementById('goldExchangeModal').remove()" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
      </div>

      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Old Gold Purity</label>
            <select id="ge_purity" class="w-full border rounded-lg p-2" onchange="updateExchangeCalc()">
              <option value="22K">22K (916)</option>
              <option value="24K">24K (999)</option>
              <option value="18K">18K (750)</option>
              <option value="SILVER_999">Silver 999</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Exchange Gold Rate (₹/g)</label>
            <input type="number" id="ge_rate" value="${rate22}" class="w-full border rounded-lg p-2 font-mono" oninput="updateExchangeCalc()">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Gross Weight (g)</label>
            <input type="number" step="0.01" id="ge_gross_wt" class="w-full border rounded-lg p-2" placeholder="0.00" oninput="updateExchangeCalc()">
          </div>
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Stone / Dust Weight (g)</label>
            <input type="number" step="0.01" id="ge_stone_wt" value="0" class="w-full border rounded-lg p-2" oninput="updateExchangeCalc()">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Deduction / Melting Loss (%)</label>
            <input type="number" step="0.5" id="ge_deduct_pct" value="2" class="w-full border rounded-lg p-2" oninput="updateExchangeCalc()">
          </div>
          <div>
            <label class="block font-semibold text-gray-700 mb-1">New Jewellery Amount (₹)</label>
            <input type="number" id="ge_new_val" class="w-full border rounded-lg p-2" placeholder="0.00" oninput="updateExchangeCalc()">
          </div>
        </div>

        <!-- Calculated Outcome Box -->
        <div class="bg-amber-50 p-4 rounded-xl border border-amber-200 mt-4 space-y-1.5">
          <div class="flex justify-between font-semibold text-gray-700">
            <span>Net Gold Weight:</span>
            <span id="geNetWtDisplay">0.00 g</span>
          </div>
          <div class="flex justify-between font-semibold text-gray-700">
            <span>Old Gold Value:</span>
            <span id="geOldValDisplay" class="font-bold text-green-700">₹0.00</span>
          </div>
          <div class="flex justify-between font-black text-gray-900 border-t border-amber-300 pt-2 text-sm">
            <span>Customer Payable / Difference:</span>
            <span id="geDiffDisplay" class="text-[#D4AF37]">₹0.00</span>
          </div>
        </div>
      </div>

      <div class="mt-5 flex gap-2">
        <button onclick="document.getElementById('goldExchangeModal').remove()" class="flex-1 py-2 border rounded-lg text-xs font-semibold text-gray-600">Cancel</button>
        <button onclick="submitGoldExchange()" class="flex-1 btn-gold py-2 rounded-lg text-xs font-bold">Record Exchange</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.updateExchangeCalc = function() {
  const gross = parseFloat(document.getElementById('ge_gross_wt')?.value) || 0;
  const stone = parseFloat(document.getElementById('ge_stone_wt')?.value) || 0;
  const net = Math.max(0, gross - stone);
  const rate = parseFloat(document.getElementById('ge_rate')?.value) || 0;
  const deduct = parseFloat(document.getElementById('ge_deduct_pct')?.value) || 0;
  const newVal = parseFloat(document.getElementById('ge_new_val')?.value) || 0;

  const rawVal = net * rate;
  const oldVal = Math.round((rawVal - (rawVal * (deduct / 100))) * 100) / 100;
  const diff = Math.round((newVal - oldVal) * 100) / 100;

  if (document.getElementById('geNetWtDisplay')) document.getElementById('geNetWtDisplay').innerText = net.toFixed(3) + ' g';
  if (document.getElementById('geOldValDisplay')) document.getElementById('geOldValDisplay').innerText = formatMoney(oldVal);
  if (document.getElementById('geDiffDisplay')) {
    document.getElementById('geDiffDisplay').innerText = diff >= 0 ? `Payable: ${formatMoney(diff)}` : `Refund: ${formatMoney(Math.abs(diff))}`;
  }
};

window.submitGoldExchange = async function() {
  const purity = document.getElementById('ge_purity')?.value;
  const rate = parseFloat(document.getElementById('ge_rate')?.value) || 0;
  const gross = parseFloat(document.getElementById('ge_gross_wt')?.value) || 0;
  const stone = parseFloat(document.getElementById('ge_stone_wt')?.value) || 0;
  const deduct = parseFloat(document.getElementById('ge_deduct_pct')?.value) || 0;
  const newVal = parseFloat(document.getElementById('ge_new_val')?.value) || 0;

  if (gross <= 0 || rate <= 0) return showToast('Please enter gross weight and rate', 'error');

  try {
    await api('/exchanges', {
      method: 'POST',
      body: JSON.stringify({
        old_purity: purity,
        old_rate: rate,
        old_gross_weight: gross,
        old_stone_weight: stone,
        deduction_percent: deduct,
        new_jewellery_value: newVal
      })
    });
    document.getElementById('goldExchangeModal').remove();
    showToast('Gold Exchange recorded successfully', 'success');
    loadPage('returns_exchange', 'Returns & Exchange');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

window.openProcessReturnModal = function() {
  const invoicePrompt = prompt('Enter Invoice Number to Return (e.g. GF-2026-000001):');
  if (!invoicePrompt || !invoicePrompt.trim()) return;

  api(`/sales/${encodeURIComponent(invoicePrompt.trim())}`).then(sale => {
    if (!sale) return showToast('Invoice not found', 'error');
    if (sale.status !== 'COMPLETED') return showToast(`Cannot return invoice in '${sale.status}' state`, 'error');

    const firstItem = (sale.SaleItems && sale.SaleItems[0]) ? sale.SaleItems[0] : null;
    if (!firstItem) return showToast('No items found in this invoice', 'error');

    const reason = prompt('Enter Return Reason:', 'Customer preference / exchange');
    if (reason === null) return;

    api('/returns', {
      method: 'POST',
      body: JSON.stringify({
        sale_id: sale.id,
        reason: reason || 'Customer Return',
        items: [
          {
            sale_item_id: firstItem.id,
            jewellery_id: firstItem.jewellery_id,
            quantity: firstItem.quantity || 1,
            refund_amount: firstItem.final_amount || firstItem.price
          }
        ]
      })
    }).then(res => {
      showToast(`Return processed! Credit Voucher: ${res.return_invoice_no}. Stock restored.`, 'success');
      loadPage('returns_exchange', 'Returns & Exchange');
    }).catch(err => showToast(err.message, 'error'));
  }).catch(err => showToast(err.message, 'error'));
};

// -------------------------------------------------------------------------
// 11. DUES & ADVANCE PAYMENTS MANAGEMENT
// -------------------------------------------------------------------------
async function renderDues(container) {
  try {
    const [duesData, advances] = await Promise.all([
      api('/dues'),
      api('/advances').catch(() => [])
    ]);

    const summary = duesData.summary || { totalOutstanding: 0, todayCollections: 0, dueCount: 0 };
    const dues = duesData.dues || [];

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Customer Dues & Advance Orders</h2>
            <p class="text-xs text-gray-500 mt-1">Track pending customer credits, collect dues, and manage advance custom jewellery bookings</p>
          </div>
          <button onclick="openNewAdvanceModal()" class="btn-gold px-4 py-2 rounded-lg text-sm font-bold shadow">
            + New Advance Booking
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <span class="text-xs font-semibold text-gray-500 uppercase">Total Outstanding Credit</span>
            <span class="text-2xl font-black text-red-600 mt-1 block">${formatMoney(summary.totalOutstanding)}</span>
          </div>
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <span class="text-xs font-semibold text-gray-500 uppercase">Today's Collections</span>
            <span class="text-2xl font-black text-green-600 mt-1 block">${formatMoney(summary.todayCollections)}</span>
          </div>
          <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <span class="text-xs font-semibold text-gray-500 uppercase">Unsettled Accounts</span>
            <span class="text-2xl font-black text-gray-900 mt-1 block">${summary.dueCount} Invoices</span>
          </div>
        </div>

        <!-- Dues Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="p-4 border-b border-gray-100 font-bold text-gray-800 text-sm">Outstanding Due Invoices</div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                  <th class="p-3.5">Invoice #</th>
                  <th class="p-3.5">Customer</th>
                  <th class="p-3.5">Bill Total</th>
                  <th class="p-3.5">Amount Paid</th>
                  <th class="p-3.5">Remaining Due</th>
                  <th class="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${dues.length === 0 ? '<tr><td colspan="6" class="p-6 text-center text-gray-400">All customer invoices are fully settled!</td></tr>' : ''}
                ${dues.map(d => `
                  <tr class="hover:bg-gray-50">
                    <td class="p-3.5 font-bold font-mono text-gray-900">${d.invoice_no || '#' + d.id}</td>
                    <td class="p-3.5 font-semibold text-gray-800">${d.Customer ? d.Customer.name : 'Customer'}</td>
                    <td class="p-3.5 font-bold text-gray-900">${formatMoney(d.final_amount)}</td>
                    <td class="p-3.5 text-green-700 font-bold">${formatMoney(d.paid_amount)}</td>
                    <td class="p-3.5 text-red-600 font-black text-sm">${formatMoney(d.balance_amount)}</td>
                    <td class="p-3.5 text-right">
                      <button onclick="openCollectDueModal(${d.id}, ${d.balance_amount}, '${d.invoice_no}')" class="btn-gold px-3 py-1.5 rounded font-bold text-xs">Collect Payment</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Advance Bookings Table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="p-4 border-b border-gray-100 font-bold text-gray-800 text-sm">Advance Jewellery Bookings (${advances.length})</div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                  <th class="p-3.5">Order Ref</th>
                  <th class="p-3.5">Customer</th>
                  <th class="p-3.5">Advance Amount</th>
                  <th class="p-3.5">Total Order Value</th>
                  <th class="p-3.5">Balance Amount</th>
                  <th class="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${advances.length === 0 ? '<tr><td colspan="6" class="p-6 text-center text-gray-400">No active advance orders.</td></tr>' : ''}
                ${advances.map(a => `
                  <tr class="hover:bg-gray-50">
                    <td class="p-3.5 font-mono font-bold text-gray-900">${a.order_ref}</td>
                    <td class="p-3.5 font-semibold text-gray-800">${a.Customer ? a.Customer.name : 'Customer'}</td>
                    <td class="p-3.5 font-bold text-green-700">${formatMoney(a.advance_amount)}</td>
                    <td class="p-3.5 font-bold text-gray-900">${formatMoney(a.total_order_amount)}</td>
                    <td class="p-3.5 font-bold text-red-600">${formatMoney(a.balance_amount)}</td>
                    <td class="p-3.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${a.status === 'ACTIVE' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">${a.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading dues: ${e.message}</div>`;
  }
}

window.openCollectDueModal = function(saleId, balance, invoiceNo) {
  const existing = document.getElementById('collectDueModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'collectDueModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
      <h3 class="font-bold text-gray-900 text-sm mb-1">Record Outstanding Payment</h3>
      <p class="text-xs text-gray-500 mb-3">${invoiceNo} - Due Balance: <b class="text-red-600">${formatMoney(balance)}</b></p>
      
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Payment Amount (₹) *</label>
          <input type="number" id="due_pay_amt" value="${balance}" max="${balance}" class="w-full border rounded-lg p-2 font-mono font-bold outline-none focus:border-[#D4AF37]">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Payment Mode</label>
          <select id="due_pay_mode" class="w-full border rounded-lg p-2 outline-none">
            <option value="CASH">Cash</option>
            <option value="UPI">UPI / GPay / PhonePe</option>
            <option value="CARD">Debit / Credit Card</option>
            <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
          </select>
        </div>
      </div>

      <div class="mt-4 flex gap-2">
        <button onclick="document.getElementById('collectDueModal').remove()" class="flex-1 py-2 border rounded-lg text-xs font-semibold text-gray-600">Cancel</button>
        <button onclick="submitCollectDue(${saleId})" class="flex-1 btn-gold py-2 rounded-lg text-xs font-bold">Record Collection</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.submitCollectDue = async function(saleId) {
  const amt = parseFloat(document.getElementById('due_pay_amt')?.value);
  const mode = document.getElementById('due_pay_mode')?.value;
  if (!amt || amt <= 0) return showToast('Please enter a valid payment amount', 'error');

  try {
    await api(`/dues/${saleId}/pay`, {
      method: 'POST',
      body: JSON.stringify({ amount: amt, payment_method: mode })
    });
    document.getElementById('collectDueModal').remove();
    showToast('Payment recorded and due balance cleared!', 'success');
    loadPage('dues', 'Dues & Advances');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

window.openNewAdvanceModal = function() {
  const existing = document.getElementById('newAdvanceModal');
  if (existing) existing.remove();

  const custOptions = (window.allCustomers || []).map(c => `<option value="${c.id}">${c.name} (${c.phone})</option>`).join('');

  const modal = document.createElement('div');
  modal.id = 'newAdvanceModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
      <h3 class="font-bold text-gray-900 text-sm mb-3">Record Advance Booking</h3>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Customer *</label>
          <select id="adv_cust" class="w-full border rounded-lg p-2 outline-none">
            ${custOptions || '<option value="">No customers available</option>'}
          </select>
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Total Estimated Order Value (₹) *</label>
          <input type="number" id="adv_total_order" class="w-full border rounded-lg p-2 font-mono" placeholder="e.g. 150000">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Advance Amount Received (₹) *</label>
          <input type="number" id="adv_received" class="w-full border rounded-lg p-2 font-mono font-bold" placeholder="e.g. 50000">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Payment Method</label>
          <select id="adv_method" class="w-full border rounded-lg p-2">
            <option value="CASH">Cash</option>
            <option value="UPI">UPI / Online</option>
            <option value="CARD">Card</option>
          </select>
        </div>
      </div>

      <div class="mt-4 flex gap-2">
        <button onclick="document.getElementById('newAdvanceModal').remove()" class="flex-1 py-2 border rounded-lg text-xs font-semibold text-gray-600">Cancel</button>
        <button onclick="submitNewAdvance()" class="flex-1 btn-gold py-2 rounded-lg text-xs font-bold">Save Booking</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.submitNewAdvance = async function() {
  const custId = document.getElementById('adv_cust')?.value;
  const tot = parseFloat(document.getElementById('adv_total_order')?.value) || 0;
  const adv = parseFloat(document.getElementById('adv_received')?.value) || 0;
  const mode = document.getElementById('adv_method')?.value;

  if (!custId || adv <= 0) return showToast('Please enter customer and valid advance amount', 'error');

  try {
    await api('/advances', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: custId,
        advance_amount: adv,
        total_order_amount: tot || adv,
        payment_method: mode
      })
    });
    document.getElementById('newAdvanceModal').remove();
    showToast('Advance booking recorded successfully', 'success');
    loadPage('dues', 'Dues & Advances');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// -------------------------------------------------------------------------
// 12. EXPENSE MANAGEMENT
// -------------------------------------------------------------------------
async function renderExpenses(container) {
  try {
    const res = await api('/expenses');
    const expenses = res.expenses || [];
    const totalExp = res.totalExpense || 0;
    window.allExpensesList = expenses;

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Expense Management</h2>
            <p class="text-xs text-gray-500 mt-1">Track store operational costs: Rent, Electricity, Staff Salaries, Maintenance & Marketing</p>
          </div>
          <button onclick="openAddExpenseModal()" class="btn-gold px-4 py-2 rounded-lg text-sm font-bold shadow">
            + Record Expense
          </button>
        </div>

        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center max-w-sm">
          <div>
            <span class="text-xs font-semibold text-gray-500 uppercase">Total Expenses</span>
            <span class="text-2xl font-black text-red-600 mt-1 block">${formatMoney(totalExp)}</span>
          </div>
          <span class="text-3xl">💰</span>
        </div>

        <!-- Bulk Action Bar for Expenses -->
        <div id="expensesBulkActionBar" class="hidden bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between transition-all">
          <div class="flex items-center gap-2">
            <span class="text-base">🗑️</span>
            <span id="expensesSelectedCount" class="text-xs font-bold text-red-800">0 Selected</span>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="clearExpensesSelection()" class="px-2.5 py-1 text-xs text-gray-600 hover:text-gray-800 font-medium bg-white rounded border border-gray-300 transition">
              Cancel
            </button>
            <button onclick="bulkDeleteSelectedExpenses()" class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold shadow-sm transition flex items-center gap-1.5">
              <span>🗑️</span> Delete Selected
            </button>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                  <th class="p-3.5 w-10 text-center">
                    <input type="checkbox" id="selectAllExpensesCheckbox" onchange="toggleSelectAllExpenses(this.checked)" class="rounded text-red-600 focus:ring-red-500 cursor-pointer" title="Select All">
                  </th>
                  <th class="p-3.5">Date</th>
                  <th class="p-3.5">Category</th>
                  <th class="p-3.5">Amount</th>
                  <th class="p-3.5">Payment Method</th>
                  <th class="p-3.5">Description</th>
                  <th class="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${expenses.length === 0 ? '<tr><td colspan="7" class="p-8 text-center text-gray-400">No expenses recorded.</td></tr>' : ''}
                ${expenses.map(e => `
                  <tr class="hover:bg-gray-50">
                    <td class="p-3.5 w-10 text-center">
                      <input type="checkbox" class="expense-row-checkbox rounded text-red-600 focus:ring-red-500 cursor-pointer" value="${e.id}" ${window.selectedExpenseIds && window.selectedExpenseIds.has(e.id) ? 'checked' : ''} onchange="toggleExpenseSelection(${e.id}, this.checked)">
                    </td>
                    <td class="p-3.5 text-gray-500">${new Date(e.date).toLocaleDateString()}</td>
                    <td class="p-3.5"><span class="px-2 py-0.5 rounded font-bold bg-amber-50 text-amber-900 text-[10px]">${e.category}</span></td>
                    <td class="p-3.5 font-black text-gray-900">${formatMoney(e.amount)}</td>
                    <td class="p-3.5 text-gray-600 font-semibold">${e.payment_method}</td>
                    <td class="p-3.5 text-gray-600">${e.description || '-'}</td>
                    <td class="p-3.5 text-right">
                      <button onclick="deleteExpenseItem(${e.id})" class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded text-[11px] inline-flex items-center gap-1 transition" title="Delete Expense">
                        <span>🗑️</span> Delete
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading expenses: ${e.message}</div>`;
  }
}

window.openAddExpenseModal = function() {
  const existing = document.getElementById('addExpenseModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'addExpenseModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
      <h3 class="font-bold text-gray-900 text-sm mb-3">Record Store Expense</h3>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Expense Category *</label>
          <select id="exp_cat" class="w-full border rounded-lg p-2">
            <option value="RENT">Rent</option>
            <option value="ELECTRICITY">Electricity & Utilities</option>
            <option value="SALARY">Staff Salary</option>
            <option value="TRANSPORT">Transport & Delivery</option>
            <option value="MAINTENANCE">Maintenance & Security</option>
            <option value="MARKETING">Marketing & Advertisements</option>
            <option value="OFFICE">Office Expense</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Amount (₹) *</label>
          <input type="number" id="exp_amt" class="w-full border rounded-lg p-2 font-mono font-bold" placeholder="0.00">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Payment Method</label>
          <select id="exp_method" class="w-full border rounded-lg p-2">
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CARD">Card</option>
          </select>
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Description</label>
          <input type="text" id="exp_desc" class="w-full border rounded-lg p-2" placeholder="e.g. October Showroom Rent">
        </div>
      </div>

      <div class="mt-5 flex gap-2">
        <button onclick="document.getElementById('addExpenseModal').remove()" class="flex-1 py-2 border rounded-lg text-xs font-semibold text-gray-600">Cancel</button>
        <button onclick="submitAddExpense()" class="flex-1 btn-gold py-2 rounded-lg text-xs font-bold">Save Expense</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.submitAddExpense = async function() {
  const cat = document.getElementById('exp_cat')?.value;
  const amt = parseFloat(document.getElementById('exp_amt')?.value);
  const method = document.getElementById('exp_method')?.value;
  const desc = document.getElementById('exp_desc')?.value.trim();

  if (!amt || amt <= 0) return showToast('Please enter a valid expense amount', 'error');

  try {
    await api('/expenses', {
      method: 'POST',
      body: JSON.stringify({ category: cat, amount: amt, payment_method: method, description: desc })
    });
    document.getElementById('addExpenseModal').remove();
    showToast('Expense recorded successfully', 'success');
    loadPage('expenses', 'Expenses');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

window.deleteExpenseItem = async function(id) {
  if (!confirm('Are you sure you want to delete this expense record?')) return;
  try {
    await api(`/expenses/${id}`, { method: 'DELETE' });
    showToast('Expense deleted', 'success');
    loadPage('expenses', 'Expenses');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// -------------------------------------------------------------------------
// 13. SELLER PERFORMANCE DASHBOARD (Owner & Admin)
// -------------------------------------------------------------------------
async function renderSellerPerf(container) {
  try {
    const res = await api('/reports?type=seller_performance');
    const sellers = res.data || [];

    container.innerHTML = `
      <div class="space-y-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Seller Performance & Targets</h2>
          <p class="text-xs text-gray-500 mt-1">Compare salesperson revenue, order volume, average ticket size, and target achievements</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          ${sellers.map(s => `
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
              <div class="flex items-center gap-3 border-b pb-3">
                <div class="w-12 h-12 rounded-full bg-gray-900 text-white font-bold text-lg flex items-center justify-center">${s.name.charAt(0)}</div>
                <div>
                  <h3 class="font-bold text-base text-gray-900">${s.name}</h3>
                  <p class="text-xs text-gray-400">@${s.username}</p>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 text-xs">
                <div class="bg-gray-50 p-2.5 rounded-lg">
                  <span class="text-gray-400 block">Total Revenue</span>
                  <span class="font-black text-gray-900 text-sm mt-0.5 block">${formatMoney(s.revenue)}</span>
                </div>
                <div class="bg-gray-50 p-2.5 rounded-lg">
                  <span class="text-gray-400 block">Completed Bills</span>
                  <span class="font-black text-blue-600 text-sm mt-0.5 block">${s.billCount} Bills</span>
                </div>
                <div class="bg-gray-50 p-2.5 rounded-lg">
                  <span class="text-gray-400 block">Avg Bill Ticket</span>
                  <span class="font-bold text-gray-800 text-xs mt-0.5 block">${formatMoney(s.averageBillValue)}</span>
                </div>
                <div class="bg-gray-50 p-2.5 rounded-lg">
                  <span class="text-gray-400 block">Total Discounts</span>
                  <span class="font-bold text-red-600 text-xs mt-0.5 block">${formatMoney(s.totalDiscount)}</span>
                </div>
              </div>

              <div>
                <div class="flex justify-between text-xs font-semibold mb-1">
                  <span>Monthly Target (₹5L)</span>
                  <span class="text-[#D4AF37]">${s.achievementPct}%</span>
                </div>
                <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div class="bg-[#D4AF37] h-2 rounded-full transition-all duration-500" style="width: ${Math.min(100, s.achievementPct)}%"></div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading seller performance: ${e.message}</div>`;
  }
}

// -------------------------------------------------------------------------
// 14. COMPREHENSIVE REPORTING MODULE (Export Excel/CSV, Print, Range Filter)
// -------------------------------------------------------------------------
window.currentReportData = null;

async function renderReports(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Comprehensive Business Reports</h2>
          <p class="text-xs text-gray-500 mt-1">Financial analytics, profit margins, stock valuation, and tax ledgers</p>
        </div>
        <div class="flex gap-2">
          <button onclick="exportReportToCsv()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold shadow flex items-center gap-1.5">
            📥 Export CSV / Excel
          </button>
          <button onclick="printReportDocument()" class="btn-gold px-3 py-2 rounded-lg text-xs font-bold shadow flex items-center gap-1.5">
            🖨️ Print Report
          </button>
        </div>
      </div>

      <!-- Controls: Report Type & Date Filter -->
      <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-3 items-center justify-between text-xs">
        <div class="flex gap-2 items-center flex-wrap">
          <label class="font-bold text-gray-700">Report:</label>
          <select id="reportTypeSelect" onchange="fetchReportData()" class="border border-gray-300 rounded-lg p-2 font-semibold">
            <option value="sales">Sales & Revenue Report</option>
            <option value="profit">Profit & Margin Analysis</option>
            <option value="stock">Stock Valuation Report</option>
            <option value="seller_performance">Seller Performance</option>
            <option value="expense">Expense Report</option>
            <option value="purchase">Purchase Report</option>
            <option value="returns">Returns & Exchange Report</option>
          </select>
        </div>

        <div class="flex gap-1.5 items-center flex-wrap">
          <button onclick="setReportRange('today')" class="rep-range-btn px-2.5 py-1.5 rounded-lg border bg-gray-50 text-gray-700 font-semibold">Today</button>
          <button onclick="setReportRange('week')" class="rep-range-btn px-2.5 py-1.5 rounded-lg border bg-gray-50 text-gray-700 font-semibold">This Week</button>
          <button onclick="setReportRange('month')" class="rep-range-btn px-2.5 py-1.5 rounded-lg border bg-[#1F2937] text-white font-bold">This Month</button>
          <button onclick="setReportRange('year')" class="rep-range-btn px-2.5 py-1.5 rounded-lg border bg-gray-50 text-gray-700 font-semibold">This Year</button>
        </div>
      </div>

      <!-- Report Content Display -->
      <div id="reportContentContainer" class="space-y-6">
        <div class="flex justify-center items-center h-48"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4AF37]"></div></div>
      </div>
    </div>
  `;

  window.currentReportRange = 'month';
  fetchReportData();
}

window.setReportRange = function(range) {
  window.currentReportRange = range;
  document.querySelectorAll('.rep-range-btn').forEach(btn => {
    btn.className = 'rep-range-btn px-2.5 py-1.5 rounded-lg border bg-gray-50 text-gray-700 font-semibold';
  });
  if (event && event.target) {
    event.target.className = 'rep-range-btn px-2.5 py-1.5 rounded-lg border bg-[#1F2937] text-white font-bold';
  }
  fetchReportData();
};

async function fetchReportData() {
  const type = document.getElementById('reportTypeSelect')?.value || 'sales';
  const range = window.currentReportRange || 'month';
  const container = document.getElementById('reportContentContainer');
  if (!container) return;

  try {
    const data = await api(`/reports?type=${type}&range=${range}`);
    window.currentReportData = data;

    if (type === 'sales') {
      const summary = data.summary || {};
      const sales = data.data || [];
      container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Total Sales Revenue</span><span class="text-xl font-black text-gray-900 mt-1 block">${formatMoney(summary.totalRevenue)}</span></div>
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Total Discounts Given</span><span class="text-xl font-black text-red-600 mt-1 block">${formatMoney(summary.totalDiscount)}</span></div>
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Total GST Tax Collected</span><span class="text-xl font-black text-blue-600 mt-1 block">${formatMoney(summary.totalTax)}</span></div>
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Order Count</span><span class="text-xl font-black text-emerald-600 mt-1 block">${summary.orderCount} Bills</span></div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                <th class="p-3">Invoice #</th>
                <th class="p-3">Date</th>
                <th class="p-3">Customer</th>
                <th class="p-3">Seller</th>
                <th class="p-3">Subtotal</th>
                <th class="p-3">Discount</th>
                <th class="p-3">Tax</th>
                <th class="p-3 text-right">Net Amount</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${sales.map(s => `
                <tr class="hover:bg-gray-50">
                  <td class="p-3 font-mono font-bold">${s.invoice_no || '#' + s.id}</td>
                  <td class="p-3 text-gray-500">${new Date(s.createdAt).toLocaleDateString()}</td>
                  <td class="p-3 font-semibold">${s.Customer ? s.Customer.name : 'Walk-in'}</td>
                  <td class="p-3">${s.Seller ? s.Seller.name : '-'}</td>
                  <td class="p-3">${formatMoney(s.total_amount)}</td>
                  <td class="p-3 text-red-600">-${formatMoney(s.discount_amount)}</td>
                  <td class="p-3">${formatMoney(s.tax_amount)}</td>
                  <td class="p-3 text-right font-black">${formatMoney(s.final_amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (type === 'profit') {
      const summary = data.summary || {};
      const items = data.data || [];
      container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Total Sales</span><span class="text-xl font-black text-gray-900 mt-1 block">${formatMoney(summary.totalRevenue)}</span></div>
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Total Purchase Cost</span><span class="text-xl font-black text-gray-500 mt-1 block">${formatMoney(summary.totalPurchaseCost)}</span></div>
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Gross Profit</span><span class="text-xl font-black text-emerald-600 mt-1 block">${formatMoney(summary.grossProfit)}</span></div>
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Profit Margin</span><span class="text-xl font-black text-[#D4AF37] mt-1 block">${summary.overallMargin}%</span></div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                <th class="p-3">Jewellery Name</th>
                <th class="p-3">Code</th>
                <th class="p-3">Qty</th>
                <th class="p-3">Selling Price</th>
                <th class="p-3">Purchase Cost</th>
                <th class="p-3">Gross Profit</th>
                <th class="p-3 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${items.map(it => `
                <tr class="hover:bg-gray-50">
                  <td class="p-3 font-bold text-gray-900">${it.jewellery_name}</td>
                  <td class="p-3 font-mono text-gray-500">${it.code}</td>
                  <td class="p-3">${it.quantity}</td>
                  <td class="p-3 font-semibold">${formatMoney(it.selling_price)}</td>
                  <td class="p-3 text-gray-500">${formatMoney(it.purchase_cost)}</td>
                  <td class="p-3 font-bold text-emerald-600">${formatMoney(it.profit)}</td>
                  <td class="p-3 text-right font-black text-[#D4AF37]">${it.margin_percent}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (type === 'stock') {
      const summary = data.summary || {};
      const items = data.data || [];
      container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Total Products</span><span class="text-xl font-black text-gray-900 mt-1 block">${summary.totalItems}</span></div>
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Total Units in Stock</span><span class="text-xl font-black text-blue-600 mt-1 block">${summary.totalStockCount} Units</span></div>
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Total Inventory Value</span><span class="text-xl font-black text-emerald-600 mt-1 block">${formatMoney(summary.totalStockValue)}</span></div>
          <div class="bg-white p-4 rounded-xl border"><span class="text-gray-400 block uppercase">Low Stock Alerts</span><span class="text-xl font-black text-amber-500 mt-1 block">${summary.lowStockCount} Items</span></div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                <th class="p-3">Item Name</th>
                <th class="p-3">Code / Barcode</th>
                <th class="p-3">Purity & Metal</th>
                <th class="p-3">Net Weight</th>
                <th class="p-3">Selling Price</th>
                <th class="p-3">Stock Units</th>
                <th class="p-3 text-right">Total Line Value</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${items.map(i => `
                <tr class="hover:bg-gray-50">
                  <td class="p-3 font-bold text-gray-900">${i.name}</td>
                  <td class="p-3 font-mono text-gray-500">${i.code}</td>
                  <td class="p-3">${i.purity} ${i.metal}</td>
                  <td class="p-3">${i.net_weight || i.weight}g</td>
                  <td class="p-3">${formatMoney(i.selling_price)}</td>
                  <td class="p-3 font-black">${i.stock}</td>
                  <td class="p-3 text-right font-black">${formatMoney((i.stock || 0) * (i.selling_price || 0))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      container.innerHTML = `<div class="bg-white p-8 rounded-xl shadow-sm border text-gray-600 text-xs"><pre class="overflow-x-auto">${JSON.stringify(data, null, 2)}</pre></div>`;
    }
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500 text-xs">Error generating report: ${e.message}</div>`;
  }
}

window.exportReportToCsv = function() {
  if (!window.currentReportData) return showToast('No report data to export', 'error');
  const d = window.currentReportData.data || [];
  if (d.length === 0) return showToast('No records found to export', 'warning');

  // Convert array of objects to CSV
  const keys = Object.keys(d[0]).filter(k => typeof d[0][k] !== 'object');
  let csv = keys.join(',') + '\n';
  d.forEach(row => {
    csv += keys.map(k => `"${String(row[k] || '').replace(/"/g, '""')}"`).join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GoldFlow_Report_${document.getElementById('reportTypeSelect')?.value}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast('Report CSV exported successfully', 'success');
};

window.printReportDocument = function() {
  const container = document.getElementById('reportContentContainer');
  if (!container) return;
  const reportHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>GoldFlow Report</title>
      <script src="/vendor/tailwindcss.js"></script>
    </head>
    <body class="p-8 font-sans">
      <div class="border-b pb-4 mb-4 flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-black text-[#D4AF37]">✦ GoldFlow</h1>
          <p class="text-xs text-gray-500 uppercase">${window.systemSettings.shop_name}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-500">Generated: ${new Date().toLocaleString()}</p>
          <p class="text-xs font-bold text-gray-800 uppercase">Report: ${document.getElementById('reportTypeSelect')?.value}</p>
        </div>
      </div>
      ${container.innerHTML}
      <script>window.onload=()=>{ setTimeout(()=>window.print(), 400); };</script>
    </body>
    </html>
  `;
  window.gfOpenPrintDocument(reportHtml, 'width=900,height=800');
};

// -------------------------------------------------------------------------
// 15. AUDIT LOGS (Read-Only Trail)
// -------------------------------------------------------------------------
async function renderAudit(container) {
  try {
    const logs = await api('/audit-logs');
    container.innerHTML = `
      <div class="space-y-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">System Audit Logs</h2>
          <p class="text-xs text-gray-500 mt-1">Read-only tamper-proof log of critical financial, inventory, and user transactions</p>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                  <th class="p-3.5">Timestamp</th>
                  <th class="p-3.5">User</th>
                  <th class="p-3.5">Role</th>
                  <th class="p-3.5">Module</th>
                  <th class="p-3.5">Action</th>
                  <th class="p-3.5">Details</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${logs.length === 0 ? '<tr><td colspan="6" class="p-8 text-center text-gray-400">No audit records available.</td></tr>' : ''}
                ${logs.map(l => `
                  <tr class="hover:bg-gray-50 font-mono">
                    <td class="p-3.5 text-gray-500 whitespace-nowrap">${new Date(l.createdAt).toLocaleDateString()} ${new Date(l.createdAt).toLocaleTimeString()}</td>
                    <td class="p-3.5 font-bold text-gray-900">${l.User ? l.User.name : 'System'}</td>
                    <td class="p-3.5"><span class="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-sans font-bold">${l.User ? l.User.role : '-'}</span></td>
                    <td class="p-3.5 text-gray-700">${l.module}</td>
                    <td class="p-3.5 font-bold text-gray-800">${l.action}</td>
                    <td class="p-3.5 text-gray-600 truncate max-w-sm font-sans">${l.details || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading audit logs: ${e.message}</div>`;
  }
}

// -------------------------------------------------------------------------
// -------------------------------------------------------------------------
// 16. BUSINESS SETTINGS MODULE (Admin & Owner)
// -------------------------------------------------------------------------
async function renderSettings(container) {
  try {
    const res = await api('/settings');
    const s = res.map || window.systemSettings || {};
    const currentGst = (s.tax_gst_percent !== undefined && s.tax_gst_percent !== null && s.tax_gst_percent !== '') ? s.tax_gst_percent : '3';
    const isRoundOff = s.round_off_enabled !== 'false' && s.round_off_enabled !== false;

    container.innerHTML = `
      <div class="space-y-6 max-w-4xl pb-10">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center text-xl shadow-md">
              ⚙️
            </div>
            <div>
              <h2 class="text-2xl font-bold text-gray-900">Store & System Settings</h2>
              <p class="text-xs text-gray-500 mt-0.5">Configure store credentials, GST tax rate, invoice prefixes, and default POS rules</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-sm flex items-center gap-1.5">
              <span>👑</span> ${user.role} Access
            </span>
          </div>
        </div>

        <!-- Form Cards Container -->
        <div class="space-y-5">
          
          <!-- Card 1: Business Profile & Invoice Header -->
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-200/80 space-y-4">
            <div class="flex items-center justify-between border-b pb-3">
              <div class="flex items-center gap-2">
                <span class="text-base">🏪</span>
                <h3 class="font-bold text-sm text-gray-900">Business Profile & Bill Header</h3>
              </div>
              <span class="text-[11px] text-gray-400">Printed on all invoices & estimates</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label class="block font-semibold text-gray-700 mb-1">Store / Business Name *</label>
                <input type="text" id="set_shop_name" value="${s.shop_name || 'GoldFlow Jewellers'}" 
                  class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition font-medium text-gray-800">
              </div>
              <div>
                <label class="block font-semibold text-gray-700 mb-1">Tagline / Subheading</label>
                <input type="text" id="set_shop_tagline" value="${s.shop_tagline || 'Fine Gold & Luxury Jewellery'}" 
                  class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition text-gray-800">
              </div>
              <div>
                <label class="block font-semibold text-gray-700 mb-1">Contact Phone Numbers *</label>
                <input type="text" id="set_shop_phone" value="${s.shop_phone || ''}" 
                  placeholder="+91 98765 43210"
                  class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition text-gray-800">
              </div>
              <div>
                <label class="block font-semibold text-gray-700 mb-1">Official Email</label>
                <input type="email" id="set_shop_email" value="${s.shop_email || ''}" 
                  placeholder="contact@store.com"
                  class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition text-gray-800">
              </div>
              <div class="sm:col-span-2">
                <label class="block font-semibold text-gray-700 mb-1">Physical Store Address *</label>
                <input type="text" id="set_shop_address" value="${s.shop_address || ''}" 
                  placeholder="Door No, Street Name, City, State - PIN"
                  class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition text-gray-800">
              </div>
              <div>
                <label class="block font-semibold text-gray-700 mb-1">GSTIN Number *</label>
                <input type="text" id="set_shop_gst" value="${s.shop_gst || ''}" 
                  placeholder="33AAAAA0000A1Z5"
                  class="w-full border border-gray-300 rounded-lg p-2.5 font-mono uppercase font-bold text-gray-800 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition">
              </div>
              <div>
                <label class="block font-semibold text-gray-700 mb-1">Invoice Prefix</label>
                <input type="text" id="set_invoice_prefix" value="${s.invoice_prefix || 'GF'}" 
                  placeholder="GF"
                  class="w-full border border-gray-300 rounded-lg p-2.5 font-mono uppercase font-bold text-gray-800 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition">
                <p class="text-[10px] text-gray-400 mt-1">Example: ${s.invoice_prefix || 'GF'}-2026-000101</p>
              </div>
            </div>
          </div>

          <!-- Card 2: GST & POS Calculation Rules -->
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-200/80 space-y-4">
            <div class="flex items-center justify-between border-b pb-3">
              <div class="flex items-center gap-2">
                <span class="text-base">⚖️</span>
                <h3 class="font-bold text-sm text-gray-900">GST Tax & Billing Calculation Rules</h3>
              </div>
              <span class="text-[11px] text-gray-400">Controls automated POS calculations</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <!-- GST Rate with Quick Presets -->
              <div class="sm:col-span-3 bg-amber-50/50 p-4 rounded-xl border border-amber-200/70">
                <label class="block font-bold text-gray-800 mb-1">Active GST Tax Rate (%) *</label>
                <p class="text-[11px] text-gray-500 mb-2">Used automatically on Tax Invoices and POS calculations</p>
                <div class="flex flex-wrap items-center gap-2 mb-2">
                  <button type="button" onclick="document.getElementById('set_tax_gst').value='0'" class="px-3 py-1 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg text-xs font-semibold transition shadow-sm">0% (Tax-Free)</button>
                  <button type="button" onclick="document.getElementById('set_tax_gst').value='1.5'" class="px-3 py-1 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg text-xs font-semibold transition shadow-sm">1.5%</button>
                  <button type="button" onclick="document.getElementById('set_tax_gst').value='3'" class="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition shadow-sm">3% (Jewellery Standard)</button>
                  <button type="button" onclick="document.getElementById('set_tax_gst').value='5'" class="px-3 py-1 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg text-xs font-semibold transition shadow-sm">5%</button>
                  <button type="button" onclick="document.getElementById('set_tax_gst').value='18'" class="px-3 py-1 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg text-xs font-semibold transition shadow-sm">18%</button>
                </div>
                <div class="w-full max-w-xs">
                  <div class="relative">
                    <input type="number" step="0.1" id="set_tax_gst" value="${currentGst}" 
                      class="w-full border border-gray-300 rounded-lg p-2.5 pr-8 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] font-bold text-base text-gray-900 bg-white">
                    <span class="absolute right-3 top-2.5 font-bold text-gray-400">%</span>
                  </div>
                </div>
              </div>

              <div>
                <label class="block font-semibold text-gray-700 mb-1">Default Making Charge (%)</label>
                <input type="number" step="0.5" id="set_making_def" value="${s.default_making_charge || '12'}" 
                  class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition font-medium text-gray-800">
                <p class="text-[10px] text-gray-400 mt-1">Pre-filled when adding new items</p>
              </div>

              <div>
                <label class="block font-semibold text-gray-700 mb-1">Default Wastage (%)</label>
                <input type="number" step="0.5" id="set_wastage_def" value="${s.default_wastage_percent || '2'}" 
                  class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition font-medium text-gray-800">
                <p class="text-[10px] text-gray-400 mt-1">Pre-filled wastage allowance</p>
              </div>

              <div class="flex items-center gap-3 pt-4 sm:pt-6">
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="set_round_off" class="sr-only peer" ${isRoundOff ? 'checked' : ''}>
                  <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                  <span class="ml-2 font-semibold text-gray-800 text-xs">Round Off Bill Amounts</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Card 3: Invoice Footer & Terms & Conditions -->
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-200/80 space-y-4">
            <div class="flex items-center justify-between border-b pb-3">
              <div class="flex items-center gap-2">
                <span class="text-base">📜</span>
                <h3 class="font-bold text-sm text-gray-900">Invoice Terms & Conditions</h3>
              </div>
              <span class="text-[11px] text-gray-400">Appears at bottom of printed bills & estimates</span>
            </div>

            <div>
              <label class="block font-semibold text-gray-700 mb-1 text-xs">Terms & Conditions Text</label>
              <textarea id="set_terms" rows="3" 
                placeholder="Returns accepted within 7 days in original condition with bill. Weight and purity certified."
                class="w-full border border-gray-300 rounded-lg p-3 text-xs outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition text-gray-800">${s.terms_and_conditions || ''}</textarea>
            </div>
          </div>

          <!-- Save Button Bar -->
          <div class="flex justify-end items-center gap-3 pt-2">
            <button type="button" id="saveSettingsBtn" onclick="saveSystemSettings()" 
              class="btn-gold px-7 py-3 rounded-xl text-sm font-bold shadow-md hover:shadow-xl flex items-center gap-2 transition transform active:scale-95">
              <span>💾</span> Save All Settings
            </button>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `
      <div class="p-8 bg-red-50 border border-red-200 rounded-2xl text-red-700 max-w-xl">
        <h3 class="font-bold text-base mb-1">Unable to load Settings</h3>
        <p class="text-xs">${e.message}</p>
      </div>
    `;
  }
}

window.saveSystemSettings = async function() {
  const saveBtn = document.getElementById('saveSettingsBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span>⏳</span> Saving Settings...';
  }

  const payload = {
    settings: {
      shop_name: document.getElementById('set_shop_name')?.value.trim(),
      shop_tagline: document.getElementById('set_shop_tagline')?.value.trim(),
      shop_phone: document.getElementById('set_shop_phone')?.value.trim(),
      shop_email: document.getElementById('set_shop_email')?.value.trim(),
      shop_address: document.getElementById('set_shop_address')?.value.trim(),
      shop_gst: document.getElementById('set_shop_gst')?.value.trim(),
      invoice_prefix: document.getElementById('set_invoice_prefix')?.value.trim() || 'GF',
      tax_gst_percent: document.getElementById('set_tax_gst')?.value || '3',
      default_making_charge: document.getElementById('set_making_def')?.value || '12',
      default_wastage_percent: document.getElementById('set_wastage_def')?.value || '2',
      round_off_enabled: document.getElementById('set_round_off')?.checked ? 'true' : 'false',
      terms_and_conditions: document.getElementById('set_terms')?.value.trim()
    }
  };

  try {
    await api('/settings', { method: 'POST', body: JSON.stringify(payload) });
    window.systemSettings = { ...window.systemSettings, ...payload.settings };
    
    // Update GST badge on Jewellery page if present
    const gstBadge = document.getElementById('jewelleryGstBadge');
    if (gstBadge) {
      gstBadge.textContent = `${payload.settings.tax_gst_percent}%`;
    }

    showToast('Store settings saved successfully', 'success');
  } catch (e) {
    showToast(`Error saving settings: ${e.message}`, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>💾</span> Save All Settings';
    }
  }
};

// -------------------------------------------------------------------------
// 17. MANAGE STAFF & USERS (Admin & Owner)
// -------------------------------------------------------------------------
async function renderUsers(container) {
  try {
    const usersList = await api('/users');
    window.allStaffList = usersList || [];

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Manage Store Staff</h2>
            <p class="text-xs text-gray-500 mt-1">Configure user accounts and role permissions for Admin, Owner, and Sellers</p>
          </div>
          <button onclick="openAddUserModal()" class="btn-gold px-4 py-2 rounded-lg text-sm font-bold shadow">
            + Add Staff User
          </button>
        </div>

        <!-- Bulk Action Bar for Staff -->
        <div id="staffBulkActionBar" class="hidden bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between transition-all">
          <div class="flex items-center gap-2">
            <span class="text-base">🗑️</span>
            <span id="staffSelectedCount" class="text-xs font-bold text-red-800">0 Selected</span>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="clearStaffSelection()" class="px-2.5 py-1 text-xs text-gray-600 hover:text-gray-800 font-medium bg-white rounded border border-gray-300 transition">
              Cancel
            </button>
            <button onclick="bulkDeleteSelectedStaff()" class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold shadow-sm transition flex items-center gap-1.5">
              <span>🗑️</span> Remove Selected
            </button>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 border-b text-gray-500 uppercase font-semibold">
                  <th class="p-3.5 w-10 text-center">
                    <input type="checkbox" id="selectAllStaffCheckbox" onchange="toggleSelectAllStaff(this.checked)" class="rounded text-red-600 focus:ring-red-500 cursor-pointer" title="Select All">
                  </th>
                  <th class="p-3.5">Staff Name</th>
                  <th class="p-3.5">Username</th>
                  <th class="p-3.5">Assigned Role</th>
                  ${user.role === 'ADMIN' ? '<th class="p-3.5">Password</th>' : ''}
                  <th class="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${usersList.map(u => `
                  <tr class="hover:bg-gray-50">
                    <td class="p-3.5 w-10 text-center">
                      ${u.id !== user.id ? `
                        <input type="checkbox" class="staff-row-checkbox rounded text-red-600 focus:ring-red-500 cursor-pointer" value="${u.id}" ${window.selectedStaffIds && window.selectedStaffIds.has(u.id) ? 'checked' : ''} onchange="toggleStaffSelection(${u.id}, this.checked)">
                      ` : ''}
                    </td>
                    <td class="p-3.5 font-bold text-gray-900">${u.name}</td>
                    <td class="p-3.5 font-mono text-gray-600">@${u.username}</td>
                    <td class="p-3.5">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.role === 'ADMIN' ? 'bg-red-100 text-red-800' : (u.role === 'OWNER' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800')}">${u.role}</span>
                    </td>
                    ${user.role === 'ADMIN' ? `<td class="p-3.5 font-mono text-gray-400">${u.raw_password || '••••••••'}</td>` : ''}
                    <td class="p-3.5 text-right">
                      ${u.id !== user.id ? `
                        <button onclick="deleteStaffUser(${u.id})" class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded text-[11px] inline-flex items-center gap-1 transition">
                          <span>🗑️</span> Remove
                        </button>
                      ` : '<span class="text-gray-400 font-semibold">You</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="p-6 text-red-500">Error loading users: ${e.message}</div>`;
  }
}

window.openAddUserModal = function() {
  const existing = document.getElementById('addUserModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'addUserModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
      <h3 class="font-bold text-gray-900 text-sm mb-3">Add Staff Member</h3>
      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Full Name *</label>
          <input type="text" id="usr_name" class="w-full border rounded-lg p-2" placeholder="e.g. Anand Kumar">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Username *</label>
          <input type="text" id="usr_uname" class="w-full border rounded-lg p-2" placeholder="e.g. anand">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Password *</label>
          <input type="password" id="usr_pass" class="w-full border rounded-lg p-2">
        </div>
        <div>
          <label class="block font-semibold text-gray-700 mb-1">Role *</label>
          <select id="usr_role" class="w-full border rounded-lg p-2">
            <option value="CASHIER">Cashier (Cash Counter & Due Recovery)</option>
            <option value="SELLER">Seller (Counter POS & Sales)</option>
            <option value="OWNER">Owner (Discounts & Monitoring)</option>
            <option value="ADMIN">Admin (Full System Controls)</option>
          </select>
        </div>
      </div>

      <div class="mt-5 flex gap-2">
        <button onclick="document.getElementById('addUserModal').remove()" class="flex-1 py-2 border rounded-lg text-xs font-semibold text-gray-600">Cancel</button>
        <button onclick="submitAddUser()" class="flex-1 btn-gold py-2 rounded-lg text-xs font-bold">Create Account</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.submitAddUser = async function() {
  const name = document.getElementById('usr_name')?.value.trim();
  const username = document.getElementById('usr_uname')?.value.trim();
  const password = document.getElementById('usr_pass')?.value;
  const role = document.getElementById('usr_role')?.value;

  if (!name || !username || !password) return showToast('All fields are required', 'error');

  try {
    await api('/users', {
      method: 'POST',
      body: JSON.stringify({ name, username, password, role })
    });
    document.getElementById('addUserModal').remove();
    showToast('Staff user created successfully', 'success');
    loadPage('users', 'Manage Staff');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

window.deleteStaffUser = async function(id) {
  if (!confirm('Remove this staff user?')) return;
  try {
    await api(`/users/${id}`, { method: 'DELETE' });
    showToast('Staff user removed', 'success');
    loadPage('users', 'Manage Staff');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// -------------------------------------------------------------------------
// GST Tax Rate Customization Modal & Settings Handler
// -------------------------------------------------------------------------
window.openCustomizeGstModal = function() {
  const existing = document.getElementById('customizeGstModal');
  if (existing) existing.remove();

  const currentGst = getCurrentGstPercent();
  const shopGstin = (window.systemSettings && window.systemSettings.shop_gst) ? window.systemSettings.shop_gst : '33AAAAA0000A1Z5';

  const presets = [
    { label: '0%', sub: 'Tax Exempt', val: 0 },
    { label: '1.5%', sub: 'Precious Stones', val: 1.5 },
    { label: '3%', sub: 'Gold Standard', val: 3 },
    { label: '5%', sub: 'Special / Silver', val: 5 },
    { label: '12%', sub: 'Standard Slab', val: 12 },
    { label: '18%', sub: 'Full Slab', val: 18 }
  ];

  const modal = document.createElement('div');
  modal.id = 'customizeGstModal';
  modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-amber-200">
      <!-- Modal Header -->
      <div class="p-5 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-amber-50 via-yellow-50 to-white">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37] to-amber-600 flex items-center justify-center text-white text-lg shadow-sm">
            ⚙️
          </div>
          <div>
            <h3 class="font-bold text-gray-900 text-lg">Customize GST Tax Rate</h3>
            <p class="text-xs text-gray-500">Configure shop-wide GST % for POS, Invoices & Estimates</p>
          </div>
        </div>
        <button onclick="document.getElementById('customizeGstModal').remove()" class="text-gray-400 hover:text-gray-700 text-xl font-bold p-1 rounded-lg hover:bg-gray-100 transition">✕</button>
      </div>

      <div class="p-6 space-y-5 text-xs">
        <!-- Preset Rate Buttons -->
        <div>
          <label class="block font-bold text-gray-700 mb-2">Popular GST Tax Presets:</label>
          <div class="grid grid-cols-3 gap-2">
            ${presets.map(p => `
              <button type="button" onclick="setGstModalValue(${p.val})" 
                class="gst-preset-btn p-2.5 rounded-xl border text-center transition ${p.val === currentGst ? 'border-[#D4AF37] bg-amber-50 text-amber-900 font-bold ring-2 ring-[#D4AF37]/30' : 'border-gray-200 hover:border-amber-300 hover:bg-gray-50 text-gray-700'}"
                id="gst_preset_${p.val}">
                <div class="text-base font-black">${p.label}</div>
                <div class="text-[10px] text-gray-500">${p.sub}</div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Custom GST Input & GSTIN Input -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block font-bold text-gray-700 mb-1">Custom GST Rate (%) *</label>
            <div class="relative">
              <input type="number" id="customGstRateInput" min="0" max="100" step="0.01" value="${currentGst}" 
                class="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-base font-bold font-mono outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
                oninput="updateGstModalPreview()">
              <span class="absolute right-3.5 top-3 text-gray-400 font-bold text-sm">%</span>
            </div>
            <p class="text-[10px] text-gray-500 mt-1">Enter any value from 0 to 100</p>
          </div>

          <div>
            <label class="block font-bold text-gray-700 mb-1">Shop GSTIN Number</label>
            <input type="text" id="customShopGstinInput" value="${shopGstin}" placeholder="33AAAAA0000A1Z5"
              class="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold font-mono uppercase outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20">
            <p class="text-[10px] text-gray-500 mt-1">Appears on Tax Invoices & Slips</p>
          </div>
        </div>

        <!-- Real-time Split Breakdown Preview Card -->
        <div class="bg-gradient-to-br from-amber-50 to-orange-50/50 p-4 rounded-xl border border-amber-200 space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="font-bold text-amber-950 text-xs uppercase tracking-wider">Live Tax Split Preview:</span>
            <span class="text-[11px] font-bold text-amber-800" id="gstPreviewTotalBadge">Total GST: ${currentGst}%</span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-center">
            <div class="bg-white p-2.5 rounded-lg border border-amber-200/80 shadow-sm">
              <span class="text-[10px] font-bold text-gray-500 block uppercase">Central GST (CGST)</span>
              <span class="text-sm font-black text-amber-900 font-mono" id="gstPreviewCgst">${(currentGst / 2).toFixed(2).replace(/\.?0+$/, '') || '0'}%</span>
            </div>
            <div class="bg-white p-2.5 rounded-lg border border-amber-200/80 shadow-sm">
              <span class="text-[10px] font-bold text-gray-500 block uppercase">State GST (SGST)</span>
              <span class="text-sm font-black text-amber-900 font-mono" id="gstPreviewSgst">${(currentGst / 2).toFixed(2).replace(/\.?0+$/, '') || '0'}%</span>
            </div>
          </div>

          <div class="text-[11px] text-gray-600 bg-white/70 p-2.5 rounded-lg border border-amber-100 flex items-center justify-between">
            <span>Example on ₹1,00,000 Taxable Bill:</span>
            <strong class="text-gray-900 font-mono" id="gstPreviewExample">
              Tax: ₹${((100000 * currentGst) / 100).toLocaleString('en-IN')} | Total: ₹${(100000 + (100000 * currentGst) / 100).toLocaleString('en-IN')}
            </strong>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2.5">
        <button type="button" onclick="document.getElementById('customizeGstModal').remove()" 
          class="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition">
          Cancel
        </button>
        <button type="button" id="btnSaveCustomGst" onclick="saveCustomGstSettings()" 
          class="btn-gold px-5 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg flex items-center gap-1.5 transition">
          <span>💾</span> Save GST Settings
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.setGstModalValue = function(val) {
  const input = document.getElementById('customGstRateInput');
  if (input) {
    input.value = val;
    window.updateGstModalPreview();
  }
  document.querySelectorAll('.gst-preset-btn').forEach(btn => {
    btn.className = 'gst-preset-btn p-2.5 rounded-xl border text-center transition border-gray-200 hover:border-amber-300 hover:bg-gray-50 text-gray-700';
  });
  const activeBtn = document.getElementById(`gst_preset_${val}`);
  if (activeBtn) {
    activeBtn.className = 'gst-preset-btn p-2.5 rounded-xl border text-center transition border-[#D4AF37] bg-amber-50 text-amber-900 font-bold ring-2 ring-[#D4AF37]/30';
  }
};

window.updateGstModalPreview = function() {
  const input = document.getElementById('customGstRateInput');
  const val = parseFloat(input?.value);
  const gstRate = !isNaN(val) && val >= 0 ? val : 0;
  const half = (gstRate / 2).toFixed(2).replace(/\.?0+$/, '') || '0';

  const badge = document.getElementById('gstPreviewTotalBadge');
  if (badge) badge.innerText = `Total GST: ${gstRate}%`;

  const cgst = document.getElementById('gstPreviewCgst');
  if (cgst) cgst.innerText = `${half}%`;

  const sgst = document.getElementById('gstPreviewSgst');
  if (sgst) sgst.innerText = `${half}%`;

  const ex = document.getElementById('gstPreviewExample');
  if (ex) {
    const taxAmt = (100000 * gstRate) / 100;
    const tot = 100000 + taxAmt;
    ex.innerText = `Tax: ₹${taxAmt.toLocaleString('en-IN')} | Total: ₹${tot.toLocaleString('en-IN')}`;
  }
};

window.saveCustomGstSettings = async function() {
  const input = document.getElementById('customGstRateInput');
  const gstinInput = document.getElementById('customShopGstinInput');
  const saveBtn = document.getElementById('btnSaveCustomGst');

  const rawVal = input?.value?.trim();
  const gstVal = parseFloat(rawVal);
  if (isNaN(gstVal) || gstVal < 0 || gstVal > 100) {
    return showToast('Please enter a valid GST tax percentage between 0% and 100%', 'error');
  }

  const gstinVal = gstinInput ? gstinInput.value.trim().toUpperCase() : '';

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = 'Saving...';
    }

    const payload = {
      settings: {
        tax_gst_percent: String(gstVal),
        ...(gstinVal ? { shop_gst: gstinVal } : {})
      }
    };

    await api('/settings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    // Update in-memory settings immediately
    window.systemSettings.tax_gst_percent = String(gstVal);
    if (gstinVal) {
      window.systemSettings.shop_gst = gstinVal;
    }

    // Update badges or labels on screen
    const badge = document.getElementById('jewelleryGstBadge');
    if (badge) badge.innerText = `${gstVal}%`;

    const posTax = document.getElementById('posTaxLabel');
    if (posTax) posTax.innerText = `GST Tax (${gstVal}%):`;

    const setInput = document.getElementById('set_tax_gst');
    if (setInput) setInput.value = gstVal;

    // Recalculate POS if active
    if (typeof calculateCartTotals === 'function' && typeof updatePosCalculations === 'function' && document.getElementById('posNetPayableDisplay')) {
      updatePosCalculations();
    }

    const modal = document.getElementById('customizeGstModal');
    if (modal) modal.remove();

    showToast(`GST Tax rate saved: ${gstVal}% (CGST ${(gstVal / 2).toFixed(2).replace(/\.?0+$/, '') || 0}% + SGST ${(gstVal / 2).toFixed(2).replace(/\.?0+$/, '') || 0}%)`, 'success');
  } catch (e) {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>💾</span> Save GST Settings';
    }
    showToast(`Error saving GST settings: ${e.message}`, 'error');
  }
};

// -------------------------------------------------------------------------
// Jewellery Add, Edit, and Quick View Modals
// -------------------------------------------------------------------------
window.openAddJewelleryModal = function() {
  const existing = document.getElementById('addJewelleryModal');
  if (existing) existing.remove();

  const suppliersOptions = (window.allSuppliers || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  const modal = document.createElement('div');
  modal.id = 'addJewelleryModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
      <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
        <div>
          <h3 class="font-bold text-gray-900 text-base">Add New Jewellery Item</h3>
          <p class="text-xs text-gray-500">Enter gold weights, rates & charges with real-time jewellery calculation</p>
        </div>
        <button onclick="document.getElementById('addJewelleryModal').remove()" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
      </div>

      <div class="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
        <!-- Photo & Name -->
        <div class="flex items-center gap-4">
          <div class="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 overflow-hidden shrink-0">
            <img id="j_add_img_preview" class="w-full h-full object-cover hidden">
            <span id="j_add_img_text" class="text-[10px]">Photo</span>
          </div>
          <div class="flex-1 grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Product Photograph</label>
              <input type="file" id="j_add_file" accept="image/*" class="text-xs" onchange="previewAddJewelleryImage(this)">
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Product Name *</label>
              <input type="text" id="j_add_name" class="w-full border rounded-lg p-2" placeholder="e.g. 22K Gold Chain">
            </div>
          </div>
        </div>

        <!-- Codes, Category, Purity -->
        <div class="grid grid-cols-4 gap-3">
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Product Code *</label>
            <input type="text" id="j_add_code" class="w-full border rounded-lg p-2 font-mono uppercase" placeholder="e.g. 22K-CH-101">
          </div>
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Barcode (Optional)</label>
            <input type="text" id="j_add_barcode" class="w-full border rounded-lg p-2 font-mono uppercase" placeholder="Auto-generated if empty">
          </div>
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Category *</label>
            <select id="j_add_cat" class="w-full border rounded-lg p-2">
              <option value="Chain">Chain</option>
              <option value="Necklace">Necklace</option>
              <option value="Ring">Ring</option>
              <option value="Bangle">Bangle</option>
              <option value="Earrings">Earrings</option>
              <option value="Bracelet">Bracelet</option>
              <option value="Coin">Gold Coin</option>
              <option value="Silver Article">Silver Article</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Gold Purity *</label>
            <select id="j_add_purity" class="w-full border rounded-lg p-2 font-bold text-amber-900 bg-amber-50" onchange="onAddPurityChanged()">
              <option value="22K" selected>22K (916)</option>
              <option value="24K">24K (999)</option>
              <option value="18K">18K (750)</option>
              <option value="SILVER_999">Silver 999</option>
              <option value="SILVER_925">Silver 925</option>
            </select>
          </div>
        </div>

        <!-- 1. Gold & Stone Weights (Golden Card) -->
        <div class="p-3.5 rounded-xl border border-amber-300 bg-amber-50/50 space-y-3">
          <div class="flex justify-between items-center">
            <span class="font-bold text-gray-800 text-xs uppercase tracking-wide">⚖️ Weight & Metal Valuation</span>
            <span class="text-[11px] text-amber-800 font-semibold font-mono" id="j_add_purity_badge">Live 22K Rate: ₹${(window.latestRates['22K'] || 7000).toLocaleString()}/g</span>
          </div>

          <div class="grid grid-cols-4 gap-3">
            <div>
              <label class="block font-bold text-gray-800 mb-1">Gross Weight (g) *</label>
              <input type="number" step="0.001" id="j_add_gross" class="w-full border border-gray-300 rounded-lg p-2 font-mono font-bold bg-white" placeholder="20.000" oninput="recalcAddJewelleryPricing()">
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Stone Weight (g)</label>
              <input type="number" step="0.001" id="j_add_stone" class="w-full border border-gray-300 rounded-lg p-2 font-mono bg-white" value="0" oninput="recalcAddJewelleryPricing()">
            </div>
            <div>
              <label class="block font-bold text-amber-900 mb-1">Net Gold Weight (g)</label>
              <input type="number" step="0.001" id="j_add_net" class="w-full border border-amber-300 rounded-lg p-2 font-mono font-black text-amber-900 bg-amber-100/60" readonly placeholder="0.000">
            </div>
            <div>
              <label class="block font-bold text-gray-800 mb-1">Gold Rate (₹/g)</label>
              <input type="number" id="j_add_rate" value="${window.latestRates['22K'] || 7000}" class="w-full border border-gray-300 rounded-lg p-2 font-mono font-bold bg-white" oninput="recalcAddJewelleryPricing()">
            </div>
          </div>

          <div class="flex justify-between items-center bg-white p-2.5 rounded-lg border border-amber-200">
            <div>
              <span class="text-xs font-semibold text-gray-700 block">Gold Value = Net Gold Weight × Gold Rate:</span>
              <span class="text-[10px] text-gray-400 font-mono" id="j_add_gold_formula">0.000g × ₹0/g</span>
            </div>
            <span class="text-base font-black text-amber-900 font-mono" id="j_add_gold_val">₹0.00</span>
          </div>
        </div>

        <!-- 2. Wastage & Making Charges (Silver Card) -->
        <div class="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70 space-y-3">
          <span class="font-bold text-gray-800 text-xs uppercase tracking-wide">🏷️ Wastage & Additional Charges</span>

          <div class="grid grid-cols-3 gap-3">
            <!-- Wastage -->
            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="block font-semibold text-gray-700">Wastage %</label>
                <span class="text-[10px] text-gray-500 font-mono font-bold" id="j_add_wastage_val">= ₹0.00</span>
              </div>
              <input type="number" step="0.5" id="j_add_wastage" value="0" class="w-full border rounded-lg p-2 font-mono bg-white" placeholder="e.g. 5" oninput="recalcAddJewelleryPricing()">
            </div>

            <!-- Making Charge -->
            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="block font-semibold text-gray-700">Making Charge</label>
                <select id="j_add_making_type" class="text-[10px] border rounded px-1 py-0.5 bg-gray-100 font-bold" onchange="recalcAddJewelleryPricing()">
                  <option value="FIXED">₹ Flat Amount</option>
                  <option value="PERCENTAGE">% of Gold</option>
                  <option value="PER_GRAM">₹ / gram</option>
                </select>
              </div>
              <input type="number" step="1" id="j_add_making" value="0" class="w-full border rounded-lg p-2 font-mono bg-white" placeholder="e.g. 8000" oninput="recalcAddJewelleryPricing()">
              <span class="text-[10px] text-gray-500 font-mono mt-0.5 block font-bold" id="j_add_making_val">= ₹0.00</span>
            </div>

            <!-- Stone Charge -->
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Stone Charge (₹)</label>
              <input type="number" step="1" id="j_add_stone_chg" value="0" class="w-full border rounded-lg p-2 font-mono bg-white" placeholder="e.g. 1000" oninput="recalcAddJewelleryPricing()">
            </div>
          </div>
        </div>

        <!-- 3. Final Total / Selling Price, Purchase Cost, Stock & Supplier -->
        <div class="grid grid-cols-4 gap-3 pt-1">
          <div>
            <label class="block font-bold text-gray-900 mb-1">Calculated Selling Price (₹) *</label>
            <input type="number" id="j_add_sell" class="w-full border-2 border-[#D4AF37] rounded-lg p-2 font-mono font-black text-sm text-gray-900 bg-amber-50/40" placeholder="0">
          </div>
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Purchase Cost (₹)</label>
            <input type="number" id="j_add_cost" class="w-full border rounded-lg p-2 font-mono" placeholder="0">
          </div>
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Stock Qty *</label>
            <input type="number" id="j_add_stock" value="1" min="0" class="w-full border rounded-lg p-2 font-bold">
          </div>
          <div>
            <label class="block font-semibold text-gray-700 mb-1">Supplier</label>
            <select id="j_add_supplier" class="w-full border rounded-lg p-2">
              <option value="">None / Self</option>
              ${suppliersOptions}
            </select>
          </div>
        </div>
      </div>

      <div class="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-between items-center">
        <div class="text-xs">
          <span class="text-gray-500">Live Item Value:</span>
          <span class="font-black text-base text-gray-900 ml-1 font-mono" id="j_add_total_display">₹0.00</span>
        </div>
        <div class="flex gap-2">
          <button onclick="document.getElementById('addJewelleryModal').remove()" class="px-5 py-2 font-semibold text-gray-600 rounded-lg border bg-white">Cancel</button>
          <button id="btnSaveNewJewellery" onclick="submitAddNewJewellery()" class="btn-gold px-6 py-2 rounded-lg font-bold shadow">Save Jewellery</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  recalcAddJewelleryPricing();
};

window.onAddPurityChanged = function() {
  const purity = document.getElementById('j_add_purity')?.value || '22K';
  const liveRate = window.latestRates[purity] || 7000;
  const rateInput = document.getElementById('j_add_rate');
  if (rateInput) rateInput.value = liveRate;

  const badge = document.getElementById('j_add_purity_badge');
  if (badge) badge.innerText = `Live ${purity} Rate: ₹${liveRate.toLocaleString()}/g`;

  recalcAddJewelleryPricing();
};

window.recalcAddJewelleryPricing = function() {
  const purity = document.getElementById('j_add_purity')?.value || '22K';
  const liveRate = window.latestRates[purity] || 7000;
  
  const rateInput = document.getElementById('j_add_rate');
  let rate = parseFloat(rateInput?.value);
  if (isNaN(rate) || rate <= 0) {
    rate = liveRate;
    if (rateInput) rateInput.value = rate;
  }

  const gross = parseFloat(document.getElementById('j_add_gross')?.value) || 0;
  const stone = parseFloat(document.getElementById('j_add_stone')?.value) || 0;
  const net = Math.max(0, gross - stone);

  const netEl = document.getElementById('j_add_net');
  if (netEl) netEl.value = net.toFixed(3);

  // Gold Value = Net Gold Weight * Gold Rate
  const gVal = Math.round(net * rate);
  const gValEl = document.getElementById('j_add_gold_val');
  if (gValEl) gValEl.innerText = formatMoney(gVal);

  const gFormulaEl = document.getElementById('j_add_gold_formula');
  if (gFormulaEl) gFormulaEl.innerText = `${net.toFixed(3)}g × ₹${rate.toLocaleString()}/g`;

  // Wastage %
  const wastagePct = parseFloat(document.getElementById('j_add_wastage')?.value) || 0;
  const wVal = Math.round(gVal * (wastagePct / 100));
  const wValEl = document.getElementById('j_add_wastage_val');
  if (wValEl) wValEl.innerText = `= ${formatMoney(wVal)}`;

  // Making Charge
  const mcType = document.getElementById('j_add_making_type')?.value || 'FIXED';
  const mcVal = parseFloat(document.getElementById('j_add_making')?.value) || 0;
  let mVal = 0;
  if (mcType === 'PERCENTAGE') {
    mVal = Math.round(gVal * (mcVal / 100));
  } else if (mcType === 'PER_GRAM') {
    mVal = Math.round(net * mcVal);
  } else {
    mVal = Math.round(mcVal);
  }
  const mValEl = document.getElementById('j_add_making_val');
  if (mValEl) mValEl.innerText = `= ${formatMoney(mVal)}`;

  // Stone Charge
  const stoneChg = Math.round(parseFloat(document.getElementById('j_add_stone_chg')?.value) || 0);

  // Total Selling Price = Gold Value + Wastage + Making + Stone
  const total = gVal + wVal + mVal + stoneChg;
  const sellEl = document.getElementById('j_add_sell');
  if (sellEl) sellEl.value = total;

  const totalEl = document.getElementById('j_add_total_display');
  if (totalEl) totalEl.innerText = formatMoney(total);
};

window.previewAddJewelleryImage = function(input) {
  const img = document.getElementById('j_add_img_preview');
  const txt = document.getElementById('j_add_img_text');
  if (input.files && input.files[0]) {
    img.src = URL.createObjectURL(input.files[0]);
    img.classList.remove('hidden');
    txt.classList.add('hidden');
  }
};

window.submitAddNewJewellery = async function() {
  const code = document.getElementById('j_add_code')?.value.trim();
  const name = document.getElementById('j_add_name')?.value.trim();
  const barcode = document.getElementById('j_add_barcode')?.value.trim();
  const cat = document.getElementById('j_add_cat')?.value;
  const metal = document.getElementById('j_add_purity')?.value.includes('SILVER') ? 'Silver' : 'Gold';
  const purity = document.getElementById('j_add_purity')?.value;
  const gross = parseFloat(document.getElementById('j_add_gross')?.value);
  const stone = parseFloat(document.getElementById('j_add_stone')?.value) || 0;
  const net = parseFloat(document.getElementById('j_add_net')?.value) || Math.max(0, gross - stone);
  const making = parseFloat(document.getElementById('j_add_making')?.value) || 0;
  const makingType = document.getElementById('j_add_making_type')?.value || 'FIXED';
  const wastage = parseFloat(document.getElementById('j_add_wastage')?.value) || 0;
  const stoneChg = parseFloat(document.getElementById('j_add_stone_chg')?.value) || 0;
  const cost = parseFloat(document.getElementById('j_add_cost')?.value) || 0;
  const sell = parseFloat(document.getElementById('j_add_sell')?.value);
  const stock = parseInt(document.getElementById('j_add_stock')?.value) || 1;
  const supplierId = document.getElementById('j_add_supplier')?.value || null;

  if (!code || !name || isNaN(gross) || isNaN(sell)) {
    return showToast('Code, Name, Gross Weight, and Selling Price are required', 'error');
  }

  const btn = document.getElementById('btnSaveNewJewellery');
  btn.disabled = true;
  btn.innerText = 'Saving...';

  const payload = {
    code,
    barcode: barcode || undefined,
    name,
    category: cat,
    metal,
    purity,
    gross_weight: gross,
    weight: gross,
    stone_weight: stone,
    net_weight: net,
    making_charge: making,
    making_charge_type: makingType,
    wastage_percent: wastage,
    stone_charge: stoneChg,
    purchase_cost: cost,
    base_price: cost || sell,
    selling_price: sell,
    stock,
    supplier_id: supplierId ? parseInt(supplierId) : null,
    status: stock > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK'
  };

  try {
    const fileInput = document.getElementById('j_add_file');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const fd = new FormData();
      fd.append('image', fileInput.files[0]);
      const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
      if (upRes.ok) {
        const upData = await upRes.json();
        payload.image_url = upData.url;
      }
    }

    await api('/jewellery', { method: 'POST', body: JSON.stringify(payload) });
    document.getElementById('addJewelleryModal').remove();
    showToast('Jewellery added to inventory successfully', 'success');
    loadPage('jewellery', 'Jewellery & Stock');
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false;
    btn.innerText = 'Save Jewellery';
  }
};

window.openEditJewelleryModal = async function(id) {
  try {
    const items = await api('/jewellery');
    const item = items.find(i => i.id === id);
    if (!item) return showToast('Jewellery item not found', 'error');

    const existing = document.getElementById('editJewelleryModal');
    if (existing) existing.remove();

    const rate = window.latestRates[item.purity || '22K'] || 7000;
    const gross = item.gross_weight || item.weight || 0;
    const stone = item.stone_weight || 0;
    const net = item.net_weight != null ? item.net_weight : Math.max(0, gross - stone);

    const modal = document.createElement('div');
    modal.id = 'editJewelleryModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col text-xs">
        <div class="p-4 border-b pb-3 flex justify-between items-center bg-gray-50 rounded-t-xl">
          <div>
            <h3 class="font-bold text-gray-900 text-base">Edit Jewellery Item</h3>
            <p class="text-xs text-gray-500">${item.name} (${item.code})</p>
          </div>
          <button onclick="document.getElementById('editJewelleryModal').remove()" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        <div class="p-6 overflow-y-auto flex-1 space-y-4">
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Code</label>
              <input type="text" id="ej_code" value="${item.code}" class="w-full border rounded-lg p-2 font-mono uppercase">
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Name</label>
              <input type="text" id="ej_name" value="${item.name}" class="w-full border rounded-lg p-2">
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Purity</label>
              <select id="ej_purity" class="w-full border rounded-lg p-2 font-bold text-amber-900 bg-amber-50" onchange="onEditPurityChanged()">
                <option value="22K" ${item.purity === '22K' ? 'selected' : ''}>22K (916)</option>
                <option value="24K" ${item.purity === '24K' ? 'selected' : ''}>24K (999)</option>
                <option value="18K" ${item.purity === '18K' ? 'selected' : ''}>18K (750)</option>
                <option value="SILVER_999" ${item.purity === 'SILVER_999' ? 'selected' : ''}>Silver 999</option>
                <option value="SILVER_925" ${item.purity === 'SILVER_925' ? 'selected' : ''}>Silver 925</option>
              </select>
            </div>
          </div>

          <!-- Weights & Rates (Golden Card) -->
          <div class="p-3.5 rounded-xl border border-amber-300 bg-amber-50/50 space-y-3">
            <div class="grid grid-cols-4 gap-3">
              <div>
                <label class="block font-bold text-gray-800 mb-1">Gross Weight (g)</label>
                <input type="number" step="0.001" id="ej_gross" value="${gross}" class="w-full border border-gray-300 rounded-lg p-2 font-mono font-bold bg-white" oninput="recalcEditJewelleryPricing()">
              </div>
              <div>
                <label class="block font-semibold text-gray-700 mb-1">Stone Weight (g)</label>
                <input type="number" step="0.001" id="ej_stone" value="${stone}" class="w-full border border-gray-300 rounded-lg p-2 font-mono bg-white" oninput="recalcEditJewelleryPricing()">
              </div>
              <div>
                <label class="block font-bold text-amber-900 mb-1">Net Gold Weight (g)</label>
                <input type="number" step="0.001" id="ej_net" value="${Number(net).toFixed(3)}" class="w-full border border-amber-300 rounded-lg p-2 font-mono font-black text-amber-900 bg-amber-100/60" readonly>
              </div>
              <div>
                <label class="block font-bold text-gray-800 mb-1">Gold Rate (₹/g)</label>
                <input type="number" id="ej_rate" value="${rate}" class="w-full border border-gray-300 rounded-lg p-2 font-mono font-bold bg-white" oninput="recalcEditJewelleryPricing()">
              </div>
            </div>

            <div class="flex justify-between items-center bg-white p-2.5 rounded-lg border border-amber-200">
              <span class="text-xs font-semibold text-gray-700">Gold Value (Net Wt × Rate):</span>
              <span class="text-base font-black text-amber-900 font-mono" id="ej_gold_val">₹0.00</span>
            </div>
          </div>

          <!-- Charges & Wastage (Silver Card) -->
          <div class="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70 space-y-3">
            <div class="grid grid-cols-3 gap-3">
              <div>
                <div class="flex justify-between items-center mb-1">
                  <label class="block font-semibold text-gray-700">Wastage %</label>
                  <span class="text-[10px] text-gray-500 font-mono font-bold" id="ej_wastage_val">= ₹0.00</span>
                </div>
                <input type="number" step="0.5" id="ej_wastage" value="${item.wastage_percent || 0}" class="w-full border rounded-lg p-2 font-mono bg-white" oninput="recalcEditJewelleryPricing()">
              </div>

              <div>
                <div class="flex justify-between items-center mb-1">
                  <label class="block font-semibold text-gray-700">Making Charge</label>
                  <select id="ej_making_type" class="text-[10px] border rounded px-1 py-0.5 bg-gray-100 font-bold" onchange="recalcEditJewelleryPricing()">
                    <option value="FIXED" ${item.making_charge_type === 'FIXED' ? 'selected' : ''}>₹ Flat Amount</option>
                    <option value="PERCENTAGE" ${item.making_charge_type === 'PERCENTAGE' ? 'selected' : ''}>% of Gold</option>
                    <option value="PER_GRAM" ${item.making_charge_type === 'PER_GRAM' ? 'selected' : ''}>₹ / gram</option>
                  </select>
                </div>
                <input type="number" step="1" id="ej_making" value="${item.making_charge || 0}" class="w-full border rounded-lg p-2 font-mono bg-white" oninput="recalcEditJewelleryPricing()">
                <span class="text-[10px] text-gray-500 font-mono mt-0.5 block font-bold" id="ej_making_val">= ₹0.00</span>
              </div>

              <div>
                <label class="block font-semibold text-gray-700 mb-1">Stone Charge (₹)</label>
                <input type="number" step="1" id="ej_stone_chg" value="${item.stone_charge || 0}" class="w-full border rounded-lg p-2 font-mono bg-white" oninput="recalcEditJewelleryPricing()">
              </div>
            </div>
          </div>

          <!-- Total Selling Price & Stock -->
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block font-bold text-gray-900 mb-1">Selling Price (₹) *</label>
              <input type="number" id="ej_sell" value="${item.selling_price}" class="w-full border-2 border-[#D4AF37] rounded-lg p-2 font-mono font-black text-sm text-gray-900 bg-amber-50/40">
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Stock Quantity</label>
              <input type="number" id="ej_stock" value="${item.stock}" class="w-full border rounded-lg p-2 font-bold">
            </div>
            <div>
              <label class="block font-semibold text-gray-700 mb-1">Status</label>
              <select id="ej_status" class="w-full border rounded-lg p-2 font-bold">
                <option value="AVAILABLE" ${item.status === 'AVAILABLE' ? 'selected' : ''}>Available</option>
                <option value="LOW_STOCK" ${item.status === 'LOW_STOCK' ? 'selected' : ''}>Low Stock</option>
                <option value="OUT_OF_STOCK" ${item.status === 'OUT_OF_STOCK' ? 'selected' : ''}>Out of Stock</option>
              </select>
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-between items-center">
          <div class="text-xs">
            <span class="text-gray-500">Calculated Value:</span>
            <span class="font-black text-base text-gray-900 ml-1 font-mono" id="ej_total_display">₹0.00</span>
          </div>
          <div class="flex gap-2">
            <button onclick="document.getElementById('editJewelleryModal').remove()" class="px-5 py-2 border rounded-lg font-semibold text-gray-600 bg-white">Cancel</button>
            <button onclick="submitEditJewellery(${item.id})" class="btn-gold px-6 py-2 rounded-lg font-bold shadow">Save Changes</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    recalcEditJewelleryPricing();
  } catch (e) {
    showToast(e.message, 'error');
  }
};

window.onEditPurityChanged = function() {
  const purity = document.getElementById('ej_purity')?.value || '22K';
  const liveRate = window.latestRates[purity] || 7000;
  const rateInput = document.getElementById('ej_rate');
  if (rateInput) rateInput.value = liveRate;
  recalcEditJewelleryPricing();
};

window.recalcEditJewelleryPricing = function() {
  const purity = document.getElementById('ej_purity')?.value || '22K';
  const rate = parseFloat(document.getElementById('ej_rate')?.value) || window.latestRates[purity] || 7000;
  const gross = parseFloat(document.getElementById('ej_gross')?.value) || 0;
  const stone = parseFloat(document.getElementById('ej_stone')?.value) || 0;
  const net = Math.max(0, gross - stone);

  const netEl = document.getElementById('ej_net');
  if (netEl) netEl.value = net.toFixed(3);

  const gVal = Math.round(net * rate);
  const gValEl = document.getElementById('ej_gold_val');
  if (gValEl) gValEl.innerText = formatMoney(gVal);

  const wastagePct = parseFloat(document.getElementById('ej_wastage')?.value) || 0;
  const wVal = Math.round(gVal * (wastagePct / 100));
  const wValEl = document.getElementById('ej_wastage_val');
  if (wValEl) wValEl.innerText = `= ${formatMoney(wVal)}`;

  const mcType = document.getElementById('ej_making_type')?.value || 'FIXED';
  const mcVal = parseFloat(document.getElementById('ej_making')?.value) || 0;
  let mVal = 0;
  if (mcType === 'PERCENTAGE') mVal = Math.round(gVal * (mcVal / 100));
  else if (mcType === 'PER_GRAM') mVal = Math.round(net * mcVal);
  else mVal = Math.round(mcVal);
  const mValEl = document.getElementById('ej_making_val');
  if (mValEl) mValEl.innerText = `= ${formatMoney(mVal)}`;

  const stoneChg = Math.round(parseFloat(document.getElementById('ej_stone_chg')?.value) || 0);
  const total = gVal + wVal + mVal + stoneChg;

  const sellEl = document.getElementById('ej_sell');
  if (sellEl) sellEl.value = total;

  const totalEl = document.getElementById('ej_total_display');
  if (totalEl) totalEl.innerText = formatMoney(total);
};

window.submitEditJewellery = async function(id) {
  const code = document.getElementById('ej_code')?.value.trim();
  const name = document.getElementById('ej_name')?.value.trim();
  const purity = document.getElementById('ej_purity')?.value;
  const gross = parseFloat(document.getElementById('ej_gross')?.value);
  const stone = parseFloat(document.getElementById('ej_stone')?.value) || 0;
  const net = parseFloat(document.getElementById('ej_net')?.value) || Math.max(0, gross - stone);
  const making = parseFloat(document.getElementById('ej_making')?.value) || 0;
  const makingType = document.getElementById('ej_making_type')?.value || 'FIXED';
  const wastage = parseFloat(document.getElementById('ej_wastage')?.value) || 0;
  const stoneChg = parseFloat(document.getElementById('ej_stone_chg')?.value) || 0;
  const sell = parseFloat(document.getElementById('ej_sell')?.value);
  const stock = parseInt(document.getElementById('ej_stock')?.value) || 0;
  const status = document.getElementById('ej_status')?.value;

  try {
    await api(`/jewellery/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        code,
        name,
        purity,
        gross_weight: gross,
        weight: gross,
        stone_weight: stone,
        net_weight: net,
        making_charge: making,
        making_charge_type: makingType,
        wastage_percent: wastage,
        stone_charge: stoneChg,
        selling_price: sell,
        stock,
        status
      })
    });
    document.getElementById('editJewelleryModal').remove();
    showToast('Jewellery updated successfully', 'success');
    loadPage('jewellery', 'Jewellery & Stock');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

window.quickViewJewellery = function(id) {
  const item = (window.jewelleryItems || []).find(i => i.id === id) || (window.allJewellery || []).find(i => i.id === id);
  if (!item) return;

  const existing = document.getElementById('quickViewModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'quickViewModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-xs text-center space-y-3">
      <div class="w-32 h-32 rounded-xl bg-gray-100 mx-auto overflow-hidden border">
        <img src="${item.image_url || 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=200'}" class="w-full h-full object-cover">
      </div>
      <h3 class="font-bold text-gray-900 text-sm">${item.name}</h3>
      <p class="text-gray-500 font-mono">${item.code} | Barcode: ${item.barcode || '-'}</p>
      <div class="bg-gray-50 p-3 rounded-lg border flex justify-between">
        <div><span class="text-gray-400 block">Purity</span><span class="font-bold text-gray-800">${item.purity}</span></div>
        <div><span class="text-gray-400 block">Net Wt</span><span class="font-bold text-gray-800">${item.net_weight || item.weight}g</span></div>
        <div><span class="text-gray-400 block">Stock</span><span class="font-bold text-green-700">${item.stock}</span></div>
      </div>
      <div class="text-xl font-black text-gray-900">${formatMoney(item.selling_price)}</div>
      <div class="flex gap-2 pt-2">
        <button onclick="document.getElementById('quickViewModal').remove()" class="flex-1 py-2 border rounded-lg font-semibold text-gray-600">Close</button>
        <button onclick="document.getElementById('quickViewModal').remove(); loadPage('sell', 'POS Billing'); setTimeout(() => addJewelleryToCart(${item.id}), 300);" class="flex-1 btn-gold py-2 rounded-lg font-bold">Add to Bill 🛒</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

// -------------------------------------------------------------------------
// QR Scanner, Tag Inspection, Owner Discount & Cashier Checkout System
// -------------------------------------------------------------------------
window.playNotificationSound = function(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'cash') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(784, ctx.currentTime); // G5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch(e) {}
};

window.openJewelleryQrInspectionModal = async function(codeOrId) {
  if (!codeOrId) return;
  try {
    let item = (window.allJewellery || []).find(i => i.code === codeOrId || i.id === codeOrId || i.barcode === codeOrId);
    if (!item) {
      try {
        item = await api('/jewellery/barcode/' + encodeURIComponent(codeOrId));
      } catch(e) {
        if (!isNaN(codeOrId)) {
          item = await api('/jewellery/' + codeOrId);
        }
      }
    }
    if (!item) return showToast('Jewellery item not found for ' + codeOrId, 'error');

    const gross = parseFloat(item.gross_weight || item.weight || 0);
    const stone = parseFloat(item.stone_weight || 0);
    const net = parseFloat(item.net_weight || Math.max(0, gross - stone));
    const purity = (item.purity || '22K').toUpperCase();
    const liveRate = (window.latestRates && window.latestRates[purity]) ? window.latestRates[purity] : (window.latestRates && window.latestRates['22K'] ? window.latestRates['22K'] : 7000);
    
    const isFixed = item.pricing_mode === 'FIXED_PRICE' && parseFloat(item.selling_price) > 0;
    let goldVal = 0, wVal = 0, mVal = 0, sVal = 0, subtotal = 0, finalPrice = 0;
    
    if (isFixed) {
      finalPrice = parseFloat(item.selling_price);
      subtotal = finalPrice;
    } else {
      goldVal = Math.round(net * liveRate);
      wVal = Math.round(goldVal * ((parseFloat(item.wastage_percent) || 0) / 100));
      const mcVal = parseFloat(item.making_charge) || 0;
      if (item.making_charge_type === 'PERCENTAGE') mVal = Math.round(goldVal * (mcVal / 100));
      else if (item.making_charge_type === 'PER_GRAM') mVal = Math.round(net * mcVal);
      else mVal = Math.round(mcVal);
      sVal = Math.round(parseFloat(item.stone_charge) || 0);
      subtotal = goldVal + wVal + mVal + sVal;
      const gstPct = getCurrentGstPercent();
      const gstAmt = Math.round(subtotal * (gstPct / 100));
      finalPrice = subtotal + gstAmt;
    }

    const existing = document.getElementById('jewelleryQrInspectModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'jewelleryQrInspectModal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-amber-200">
        <!-- Header -->
        <div class="bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-700 px-6 py-4 text-white flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">📱</span>
            <div>
              <h3 class="font-extrabold text-base tracking-wide uppercase font-serif">Jewellery QR Verification</h3>
              <p class="text-[11px] text-amber-100 font-mono">Tag Code: <strong>${item.code}</strong></p>
            </div>
          </div>
          <button onclick="document.getElementById('jewelleryQrInspectModal').remove()" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition">✕</button>
        </div>

        <div class="p-5 max-h-[80vh] overflow-y-auto space-y-4">
          <!-- Top Row: Image & Live QR Code -->
          <div class="flex gap-4 items-center bg-amber-50/50 p-3.5 rounded-xl border border-amber-100">
            <div class="w-24 h-24 rounded-lg overflow-hidden border bg-white shrink-0 shadow-sm">
              <img src="${item.image_url || 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=200'}" class="w-full h-full object-cover">
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-black">${item.purity || '22K 916'}</span>
                <span class="text-xs text-gray-500 font-mono">HUID: <b>HM-916-OK</b></span>
              </div>
              <h4 class="font-bold text-gray-900 text-sm mt-1 truncate">${item.name}</h4>
              <p class="text-[11px] text-gray-500 font-mono">Barcode: ${item.barcode || '-'}</p>
              <div class="mt-2 text-xs">
                <span class="text-gray-500">Inventory Stock: </span>
                <span class="font-bold text-emerald-700">${item.stock || 1} Units Available</span>
              </div>
            </div>
            <div class="shrink-0 flex flex-col items-center">
              <canvas id="inspectQrCanvas" class="w-20 h-20 bg-white p-1 border rounded shadow-inner"></canvas>
              <span class="text-[9px] font-mono text-gray-500 mt-1">Scan Tag</span>
            </div>
          </div>

          <!-- Weights Grid -->
          <div class="grid grid-cols-3 gap-2.5 text-center">
            <div class="bg-gray-50 p-2.5 rounded-xl border border-gray-200">
              <span class="text-[10px] text-gray-400 uppercase font-bold block">Gross Weight</span>
              <span class="text-sm font-extrabold text-gray-800 font-mono">${gross.toFixed(3)}g</span>
            </div>
            <div class="bg-gray-50 p-2.5 rounded-xl border border-gray-200">
              <span class="text-[10px] text-gray-400 uppercase font-bold block">Stone Weight</span>
              <span class="text-sm font-extrabold text-amber-700 font-mono">${stone.toFixed(3)}g</span>
            </div>
            <div class="bg-amber-100/70 p-2.5 rounded-xl border border-amber-300">
              <span class="text-[10px] text-amber-900 uppercase font-black block">Net Gold Wt</span>
              <span class="text-sm font-black text-amber-900 font-mono">${net.toFixed(3)}g</span>
            </div>
          </div>

          <!-- Live Pricing Breakdown -->
          <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-xs shadow-sm">
            <div class="flex justify-between items-center pb-2 border-b border-gray-100 font-bold text-gray-700">
              <span class="flex items-center gap-1.5">⚖️ Benchmark Rate (${purity}):</span>
              <span class="font-mono text-amber-700 font-black">₹${liveRate.toLocaleString('en-IN')}/g</span>
            </div>
            ${!isFixed ? `
              <div class="flex justify-between text-gray-600">
                <span>Pure Gold Value (${net.toFixed(3)}g × ₹${liveRate.toLocaleString('en-IN')}):</span>
                <span class="font-mono font-bold">${formatMoney(goldVal)}</span>
              </div>
              <div class="flex justify-between text-gray-600">
                <span>Wastage Charge (${item.wastage_percent || 0}% VA):</span>
                <span class="font-mono">${formatMoney(wVal)}</span>
              </div>
              <div class="flex justify-between text-gray-600">
                <span>Making Charges (${item.making_charge_type || 'FLAT'}):</span>
                <span class="font-mono">${formatMoney(mVal)}</span>
              </div>
              ${sVal > 0 ? `
                <div class="flex justify-between text-gray-600">
                  <span>Stone Charges:</span>
                  <span class="font-mono">${formatMoney(sVal)}</span>
                </div>
              ` : ''}
              <div class="flex justify-between text-gray-500 pt-1 border-t text-[11px]">
                <span>Est. Tax (GST ${getCurrentGstPercent()}%):</span>
                <span class="font-mono">${formatMoney(finalPrice - subtotal)}</span>
              </div>
            ` : `
              <div class="flex justify-between text-gray-600">
                <span>Fixed Selling Price:</span>
                <span class="font-mono font-bold">${formatMoney(finalPrice)}</span>
              </div>
            `}
            <div class="flex justify-between items-center pt-2 border-t-2 border-amber-200 text-sm font-black text-gray-900">
              <span class="text-amber-800">Total Live Value:</span>
              <span class="text-lg text-amber-700 font-mono">${formatMoney(finalPrice)}</span>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-2.5 pt-1">
            <button onclick="document.getElementById('jewelleryQrInspectModal').remove()" class="px-4 py-2.5 border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition text-xs">
              Close
            </button>
            <button onclick="printBarcodeLabel(${item.id})" class="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold transition text-xs flex items-center gap-1.5 shadow-sm">
              🏷️ Print Tag
            </button>
            <button onclick="document.getElementById('jewelleryQrInspectModal').remove(); loadPage('sell', 'POS Billing'); setTimeout(() => addJewelleryToCart(${item.id}), 300);" class="flex-1 py-2.5 btn-gold rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md">
              🛒 Add to POS Bill
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    if (window.QRCode) {
      QRCode.toCanvas(document.getElementById('inspectQrCanvas'), item.code, { width: 80, margin: 1 }, (err) => {
        if (err) console.error(err);
      });
    }
  } catch(err) {
    console.error('Error opening Jewellery QR Modal:', err);
    showToast('Failed to load jewellery QR details: ' + (err.message || err), 'error');
  }
};

window.loadEstimateIntoPosCart = async function(saleId) {
  try {
    const sale = await api('/sales/' + saleId);
    if (!sale) return showToast('Estimate not found', 'error');

    window.currentCart = (sale.SaleItems || []).map(it => {
      const jew = it.Jewellery || {};
      const gross = parseFloat(it.gross_weight || jew.gross_weight || jew.weight || 0);
      const stone = parseFloat(it.stone_weight || jew.stone_weight || 0);
      const net = parseFloat(it.net_weight || Math.max(0, gross - stone));
      const rate = parseFloat(it.gold_rate || 7000);
      return {
        id: it.jewellery_id || jew.id,
        name: jew.name || it.name || 'Jewellery Item',
        code: jew.code || it.code || '',
        barcode: jew.barcode || '',
        category: jew.category || 'Gold',
        purity: it.purity || jew.purity || '22K',
        gross_weight: gross,
        stone_weight: stone,
        net_weight: net,
        gold_rate: rate,
        gold_value: parseFloat(it.gold_value || (net * rate)),
        wastage_percent: parseFloat(it.wastage_percent || jew.wastage_percent || 0),
        wastage_amount: parseFloat(it.wastage_amount || 0),
        making_charge: parseFloat(it.making_charge || jew.making_charge || 0),
        making_charge_type: it.making_charge_type || jew.making_charge_type || 'PERCENTAGE',
        stone_charge: parseFloat(it.stone_charge || 0),
        other_charges: parseFloat(it.other_charges || 0),
        quantity: parseInt(it.quantity || 1),
        line_total: parseFloat(it.total_price || 0),
        image_url: jew.image_url
      };
    });

    if (sale.Customer) {
      window.selectedCustomer = sale.Customer;
      const cInput = document.getElementById('posCustomerSearch');
      if (cInput) cInput.value = sale.Customer.name + ' (' + (sale.Customer.phone || '') + ')';
    }

    document.getElementById('estimateInspectModal')?.remove();
    document.getElementById('ownerDiscountModal')?.remove();
    document.getElementById('cashierCheckoutModal')?.remove();

    loadPage('sell', 'POS Billing');
    renderCart();
    showToast('Estimate ornaments loaded into POS Bill Cart!', 'success');
  } catch(err) {
    showToast('Failed to load into cart: ' + (err.message || err), 'error');
  }
};

window.printEstimateQrSlip = async function(saleId, format = 'thermal') {
  try {
    const sale = await api('/sales/' + saleId);
    if (!sale) return showToast('Estimate not found', 'error');

    const shop = window.systemSettings || {};
    const sellerName = sale.Seller ? sale.Seller.name : 'Staff';
    const cust = sale.Customer || { name: 'Valued Customer', phone: '-' };
    const dateStr = new Date(sale.createdAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = new Date(sale.createdAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const items = (sale.SaleItems || []).map(si => {
      const jew = si.Jewellery || {};
      const gross = parseFloat(si.gross_weight || jew.gross_weight || jew.weight || 0);
      const stone = parseFloat(si.stone_weight || jew.stone_weight || 0);
      const net = parseFloat(si.net_weight || Math.max(0, gross - stone));
      const rate = parseFloat(si.gold_rate || 7000);
      const qty = parseInt(si.quantity || 1);
      const gVal = si.gold_value != null ? parseFloat(si.gold_value) : Math.round(net * rate * qty);
      const wVal = parseFloat(si.wastage_amount || 0);
      const mVal = parseFloat(si.making_charge || 0);
      const sVal = parseFloat(si.stone_charge || 0);
      const total = parseFloat(si.total_price || (gVal + wVal + mVal + sVal));
      return {
        name: jew.name || si.name || 'Fine Jewellery',
        code: jew.code || si.code || '',
        barcode: jew.barcode || '',
        purity: si.purity || jew.purity || '22K',
        gross_weight: gross,
        stone_weight: stone,
        net_weight: net,
        gold_rate: rate,
        gold_value: gVal,
        wastage_amount: wVal,
        making_charge: mVal,
        stone_charge: sVal,
        quantity: qty,
        line_total: total
      };
    });

    const estInvoiceNo = sale.invoice_no || ('GF-EST-' + sale.id);
    const hostOrigin = window.lanServerUrl || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? `${window.location.protocol}//192.168.29.221:${window.location.port || 3000}` : window.location.origin);
    const qrTargetUrl = `${hostOrigin}/view-estimate.html?code=${encodeURIComponent(estInvoiceNo)}`;
    let qrDataUrl = '';
    if (window.QRCode) {
      try {
        if (typeof QRCode.toDataURL === 'function') {
          qrDataUrl = await new Promise((resolve) => {
            QRCode.toDataURL(qrTargetUrl, { width: 280, margin: 1 }, (err, url) => {
              if (!err && url) resolve(url);
              else resolve('');
            });
          });
        }
      } catch(e) {}
    }

    const grossSubtotal = parseFloat(sale.gross_amount || sale.total_amount || 0);
    const discAmount = parseFloat(sale.discount_amount || 0);
    const taxAmt = parseFloat(sale.tax_amount || 0);
    const finalAmt = parseFloat(sale.final_amount || (grossSubtotal - discAmount + taxAmt));

    const html = buildLuxuryJewelleryDocumentHtml({
      docType: 'ESTIMATE',
      defaultFormat: (user && user.role === 'SELLER') ? 'thermal' : format,
      minimalSlip: !!(user && user.role === 'SELLER'),
      docNumber: estInvoiceNo,
      qrDataUrl: qrDataUrl,
      qrUrl: qrTargetUrl,
      dateStr,
      timeStr,
      shop,
      customer: cust,
      sellerName,
      items,
      totals: {
        grossAmount: grossSubtotal,
        discountTotal: discAmount,
        finalPayable: finalAmt,
        taxAmount: taxAmt
      }
    });

    window.gfOpenPrintDocument(html, 'width=900,height=750,top=50,left=100');
  } catch(e) {
    showToast('Failed to print estimate: ' + (e.message || e), 'error');
  }
};

window.openEstimateInspectionModal = async function(codeOrId) {
  if (!codeOrId) return;
  try {
    let cleanCode = String(codeOrId).trim();
    if (cleanCode.includes('code=')) {
      const match = cleanCode.match(/code=([^&]+)/);
      if (match) cleanCode = decodeURIComponent(match[1]);
    }
    const sale = await api('/sales/find-by-code/' + encodeURIComponent(cleanCode));
    if (!sale) return showToast('Estimate record not found for ' + cleanCode, 'error');

    const items = sale.SaleItems || sale.sale_items || [];
    const customer = sale.Customer || sale.customer || { name: 'Walk-in Customer', phone: '-' };
    const grossSubtotal = parseFloat(sale.gross_amount || sale.total_amount || 0);
    const discAmount = parseFloat(sale.discount_amount || 0);
    const taxAmt = parseFloat(sale.tax_amount || 0);
    const finalAmount = parseFloat(sale.final_amount || (grossSubtotal - discAmount + taxAmt));

    let totalGross = 0, totalStone = 0, totalNet = 0;
    items.forEach(it => {
      const g = parseFloat(it.gross_weight || 0);
      const s = parseFloat(it.stone_weight || 0);
      const n = parseFloat(it.net_weight || Math.max(0, g - s));
      const q = parseInt(it.quantity || 1);
      totalGross += g * q;
      totalStone += s * q;
      totalNet += n * q;
    });

    const existing = document.getElementById('estimateInspectModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'estimateInspectModal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-amber-300">
        <!-- Header -->
        <div class="bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 px-6 py-4 text-white flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">📋</span>
            <div>
              <h3 class="font-extrabold text-base tracking-wide uppercase font-serif">Gold Estimate Details</h3>
              <p class="text-[11px] text-amber-100 font-mono">Ref: <strong>${sale.invoice_no || ('GF-EST-' + sale.id)}</strong></p>
            </div>
          </div>
          <button onclick="document.getElementById('estimateInspectModal').remove()" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition">✕</button>
        </div>

        <div class="p-5 max-h-[82vh] overflow-y-auto space-y-4">
          <!-- Customer & Status Banner -->
          <div class="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 flex justify-between items-start text-xs">
            <div>
              <div class="font-bold text-gray-900 text-sm">${customer.name || 'Walk-in Customer'}</div>
              <div class="text-gray-500 font-mono text-[11px]">📞 ${customer.phone || 'No phone'}</div>
              <div class="text-gray-500 text-[10px] mt-0.5">Billed by: <b>${sale.Seller?.name || 'Staff'}</b> • Date: ${new Date(sale.createdAt || Date.now()).toLocaleDateString('en-IN')}</div>
            </div>
            <div class="text-right">
              <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${sale.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : (sale.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}">
                ${sale.status || 'ESTIMATE'}
              </span>
              <div class="font-mono font-bold text-gray-700 mt-1">${items.length} Ornaments</div>
            </div>
          </div>

          <!-- Total Weights Grid -->
          <div class="grid grid-cols-3 gap-2.5 text-center">
            <div class="bg-gray-50 p-2.5 rounded-xl border border-gray-200">
              <span class="text-[10px] text-gray-400 uppercase font-bold block">Gross Weight</span>
              <span class="text-sm font-extrabold text-gray-800 font-mono">${totalGross.toFixed(3)}g</span>
            </div>
            <div class="bg-gray-50 p-2.5 rounded-xl border border-gray-200">
              <span class="text-[10px] text-gray-400 uppercase font-bold block">Stone Weight</span>
              <span class="text-sm font-extrabold text-amber-700 font-mono">${totalStone.toFixed(3)}g</span>
            </div>
            <div class="bg-amber-100/70 p-2.5 rounded-xl border border-amber-300">
              <span class="text-[10px] text-amber-900 uppercase font-black block">Net Gold Wt</span>
              <span class="text-sm font-black text-amber-900 font-mono">${totalNet.toFixed(3)}g</span>
            </div>
          </div>

          <!-- Ornament Details Table -->
          <div class="border rounded-xl overflow-hidden max-h-52 overflow-y-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-gray-100 text-gray-600 text-[10px] uppercase font-bold sticky top-0">
                <tr>
                  <th class="p-2.5">Ornament</th>
                  <th class="p-2.5 text-center">Purity</th>
                  <th class="p-2.5 text-right">Net Wt</th>
                  <th class="p-2.5 text-right">Rate/g</th>
                  <th class="p-2.5 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 text-[11px]">
                ${items.map(it => {
                  const g = parseFloat(it.gross_weight || 0);
                  const s = parseFloat(it.stone_weight || 0);
                  const n = parseFloat(it.net_weight || Math.max(0, g - s));
                  const r = parseFloat(it.gold_rate || 7000);
                  const lineTot = parseFloat(it.total_price || (n * r));
                  return `
                    <tr class="hover:bg-amber-50/50">
                      <td class="p-2.5">
                        <div class="font-bold text-gray-900">${it.Jewellery?.name || it.name || 'Fine Jewellery'}</div>
                        <div class="text-[10px] text-gray-500 font-mono">${it.Jewellery?.code || it.code || ''}</div>
                      </td>
                      <td class="p-2.5 text-center">
                        <span class="px-1.5 py-0.5 bg-amber-100 text-amber-900 font-bold rounded text-[10px]">${it.purity || '22K'}</span>
                      </td>
                      <td class="p-2.5 text-right font-mono font-bold text-amber-900">${n.toFixed(3)}g</td>
                      <td class="p-2.5 text-right font-mono text-gray-600">₹${r.toLocaleString('en-IN')}</td>
                      <td class="p-2.5 text-right font-mono font-black text-gray-900">${formatMoney(lineTot)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Financial Summary -->
          <div class="bg-white rounded-xl border border-gray-200 p-3.5 space-y-2 text-xs shadow-sm">
            <div class="flex justify-between text-gray-600">
              <span>Gross Subtotal:</span>
              <span class="font-mono font-bold text-gray-800">${formatMoney(grossSubtotal)}</span>
            </div>
            ${discAmount > 0 ? `
              <div class="flex justify-between text-emerald-700 font-bold">
                <span>Owner Discount:</span>
                <span class="font-mono">-${formatMoney(discAmount)}</span>
              </div>
            ` : ''}
            <div class="flex justify-between items-center pt-2 border-t-2 border-amber-200 text-sm font-black text-gray-900">
              <span class="text-amber-800">Estimated Total:</span>
              <span class="text-lg text-amber-700 font-mono">${formatMoney(finalAmount)}</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-wrap gap-2.5 pt-2">
            <button onclick="document.getElementById('estimateInspectModal').remove()" class="px-3.5 py-2 border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition text-xs">
              Close
            </button>
            <button onclick="printEstimateQrSlip(${sale.id}, 'thermal')" class="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-xs flex items-center gap-1 transition">
              🖨️ Re-Print QR
            </button>
            ${(user.role === 'OWNER' || user.role === 'ADMIN') ? `
              <button onclick="document.getElementById('estimateInspectModal').remove(); openOwnerDiscountModal('${sale.invoice_no || sale.id}');" class="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md">
                👑 Owner Discount
              </button>
            ` : ''}
            ${user.role === 'CASHIER' ? `
              <button onclick="document.getElementById('estimateInspectModal').remove(); openCashierCheckoutModal('${sale.invoice_no || sale.id}');" class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md">
                💵 Cashier Checkout
              </button>
            ` : ''}
            <button onclick="loadEstimateIntoPosCart(${sale.id})" class="flex-1 py-2 btn-gold rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md">
              🛒 Load into POS Cart
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch(err) {
    console.error('Error opening Estimate Inspection Modal:', err);
    showToast('Failed to load estimate: ' + (err.message || err), 'error');
  }
};

window.openOwnerDiscountModal = async function(codeOrId) {
  if (!codeOrId) return;
  try {
    const sale = await api('/sales/find-by-code/' + encodeURIComponent(codeOrId));
    if (!sale) return showToast('Estimate bill not found for ' + codeOrId, 'error');

    const grossSubtotal = parseFloat(sale.gross_amount || sale.total_amount || sale.subtotal || 0);
    const existingDisc = parseFloat(sale.discount_amount || 0);
    const taxRate = parseFloat(sale.tax_percent != null ? sale.tax_percent : getCurrentGstPercent());

    let totalGold = 0, totalWastage = 0, totalMaking = 0, totalStone = 0;
    (sale.SaleItems || sale.sale_items || []).forEach(it => {
      const net = parseFloat(it.net_weight || it.weight || 0);
      const rate = parseFloat(it.gold_rate || 7000);
      const gVal = it.gold_value != null ? parseFloat(it.gold_value) : Math.round(net * rate);
      const wVal = parseFloat(it.wastage_amount || 0);
      const mVal = parseFloat(it.making_charge || 0);
      const sVal = parseFloat(it.stone_charge || 0);
      totalGold += gVal;
      totalWastage += wVal;
      totalMaking += mVal;
      totalStone += sVal;
    });
    const vmsTotal = totalWastage + totalMaking + totalStone;

    const modal = document.createElement('div');
    modal.id = 'ownerDiscountModal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in';
    
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-amber-300">
        <!-- Header -->
        <div class="bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 px-6 py-4 text-white flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">👑</span>
            <div>
              <h3 class="font-extrabold text-base tracking-wide uppercase font-serif">Owner Discount Control</h3>
              <p class="text-[11px] text-amber-100 font-mono">Ref: <strong>${sale.invoice_no || ('GF-EST-' + sale.id)}</strong></p>
            </div>
          </div>
          <button onclick="document.getElementById('ownerDiscountModal').remove()" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition">✕</button>
        </div>

        <div class="p-5 max-h-[82vh] overflow-y-auto space-y-4">
          <!-- Sale & Customer Card -->
          <div class="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 flex justify-between items-start text-xs">
            <div>
              <div class="font-bold text-gray-900">${sale.Customer?.name || sale.customer?.name || 'Walk-in Customer'}</div>
              <div class="text-gray-500 font-mono text-[11px]">📞 ${sale.Customer?.phone || sale.customer?.phone || 'No phone'}</div>
              <div class="text-gray-500 text-[10px] mt-0.5">Billed by: <b>${sale.Seller?.name || sale.seller?.name || 'Seller'}</b></div>
            </div>
            <div class="text-right">
              <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase ${sale.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">
                ${sale.status || 'ESTIMATE'}
              </span>
              <div class="font-mono font-bold text-gray-700 mt-1">${(sale.SaleItems || sale.sale_items || []).length} Items</div>
            </div>
          </div>

          <!-- Items Table Preview -->
          <div class="border rounded-xl overflow-hidden max-h-32 overflow-y-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-gray-100 text-gray-600 text-[10px] uppercase font-bold sticky top-0">
                <tr>
                  <th class="p-2">Ornament</th>
                  <th class="p-2 text-center">Purity</th>
                  <th class="p-2 text-right">Net Wt</th>
                  <th class="p-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 text-[11px]">
                ${(sale.SaleItems || sale.sale_items || []).map(it => `
                  <tr>
                    <td class="p-2 font-medium text-gray-800">${it.Jewellery?.name || it.jewellery?.name || it.name || 'Item'}</td>
                    <td class="p-2 text-center font-bold text-amber-700">${it.Jewellery?.purity || it.jewellery?.purity || it.purity || '22K'}</td>
                    <td class="p-2 text-right font-mono">${parseFloat(it.net_weight || it.weight || 0).toFixed(3)}g</td>
                    <td class="p-2 text-right font-mono font-bold">${formatMoney(it.line_total || it.total_price || 0)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Financial Snapshot & 3 Charges Breakdown -->
          <div class="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-1.5 text-xs">
            <div class="flex justify-between text-gray-600 text-[11px]">
              <span>Pure Gold Value (Net Gold × Rate):</span>
              <span class="font-mono font-bold text-gray-800">${formatMoney(totalGold)}</span>
            </div>
            <div class="flex justify-between text-gray-600 text-[11px]" id="modalRowWastage">
              <span>Value Addition / Wastage (VA):</span>
              <span class="font-mono text-gray-700">${formatMoney(totalWastage)}</span>
            </div>
            <div class="flex justify-between text-gray-600 text-[11px]" id="modalRowMaking">
              <span>Making Charges:</span>
              <span class="font-mono text-gray-700">${formatMoney(totalMaking)}</span>
            </div>
            <div class="flex justify-between text-gray-600 text-[11px]" id="modalRowStone">
              <span>Stone Charges:</span>
              <span class="font-mono text-gray-700">${formatMoney(totalStone)}</span>
            </div>
            <div class="flex justify-between items-center bg-amber-100/70 px-2 py-1 rounded text-amber-900 font-bold text-[11px] border border-amber-200">
              <span>🏷️ Total 3 Charges (VA + Making + Stone):</span>
              <span class="font-mono font-bold">${formatMoney(vmsTotal)}</span>
            </div>
            <div class="flex justify-between text-gray-800 font-bold pt-1 border-t border-gray-200">
              <span>Gross Subtotal:</span>
              <span class="font-mono font-bold text-gray-900" id="ownerGrossSubtotal">${formatMoney(grossSubtotal)}</span>
            </div>
            <div class="flex justify-between text-amber-700 font-semibold">
              <span>Discount Deduction:</span>
              <span class="font-mono font-bold" id="ownerPreviewDiscAmount">-${formatMoney(existingDisc)}</span>
            </div>
            <div class="flex justify-between text-gray-500 text-[11px]">
              <span>Tax (GST ${taxRate}%):</span>
              <span class="font-mono" id="ownerPreviewTax">${formatMoney(sale.tax_amount || 0)}</span>
            </div>
            <div class="flex justify-between items-center pt-2 border-t font-black text-gray-900 text-sm">
              <span class="text-amber-900">New Final Payable:</span>
              <span class="text-lg text-emerald-700 font-mono" id="ownerPreviewFinalPayable">${formatMoney(sale.final_amount || grossSubtotal)}</span>
            </div>
          </div>

          <!-- Discount Controls -->
          <div class="space-y-3 bg-white p-3.5 rounded-xl border-2 border-amber-400">
            <!-- Step 1: Target selector -->
            <div>
              <label class="text-[10px] font-black text-gray-700 uppercase tracking-wide block mb-1">1. Select Target Charge to Reduce:</label>
              <div class="grid grid-cols-2 gap-1.5 text-xs">
                <button type="button" id="btnAppTargetMaking" onclick="setOwnerTarget('MAKING')" class="p-1.5 rounded-lg border border-gray-200 text-left font-bold transition flex justify-between items-center bg-white text-gray-700 hover:border-amber-400">
                  <span>🔨 Making</span>
                  <span class="font-mono font-bold">${formatMoney(totalMaking)}</span>
                </button>
                <button type="button" id="btnAppTargetWastage" onclick="setOwnerTarget('WASTAGE')" class="p-1.5 rounded-lg border border-gray-200 text-left font-bold transition flex justify-between items-center bg-white text-gray-700 hover:border-amber-400">
                  <span>🪙 Wastage</span>
                  <span class="font-mono font-bold">${formatMoney(totalWastage)}</span>
                </button>
                <button type="button" id="btnAppTargetStone" onclick="setOwnerTarget('STONE')" class="p-1.5 rounded-lg border border-gray-200 text-left font-bold transition flex justify-between items-center bg-white text-gray-700 hover:border-amber-400">
                  <span>💎 Stone</span>
                  <span class="font-mono font-bold">${formatMoney(totalStone)}</span>
                </button>
                <button type="button" id="btnAppTargetGross" onclick="setOwnerTarget('FULL_BILL')" class="p-1.5 rounded-lg border border-gray-200 text-left font-bold transition flex justify-between items-center bg-white text-gray-700 hover:border-amber-400">
                  <span>🌐 Full Bill</span>
                  <span class="font-mono font-bold">${formatMoney(grossSubtotal)}</span>
                </button>
              </div>
            </div>

            <!-- Step 2: Mode Switcher -->
            <div class="flex items-center justify-between pt-1 border-t border-gray-100">
              <label class="text-[10px] font-black text-gray-700 uppercase tracking-wide">2. How to Reduce:</label>
              <div class="flex rounded-lg border overflow-hidden text-[11px] font-bold">
                <button type="button" id="btnOwnerDiscModePct" onclick="setOwnerDiscMode('PCT')" class="px-2.5 py-1 bg-amber-500 text-white">Percent (%)</button>
                <button type="button" id="btnOwnerDiscModeFlat" onclick="setOwnerDiscMode('FLAT')" class="px-2.5 py-1 bg-gray-100 text-gray-700">Flat (₹)</button>
              </div>
            </div>

            <!-- Quick Preset Chips -->
            <div>
              <div id="ownerPctChips" class="flex flex-wrap gap-1.5">
                <button type="button" onclick="applyOwnerPresetDisc(100, 'PCT')" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-black transition active:scale-95">
                  100% Free
                </button>
                ${[75, 50, 25, 10, 5].map(pct => `
                  <button type="button" onclick="applyOwnerPresetDisc(${pct}, 'PCT')" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-lg text-xs font-bold transition active:scale-95">
                    ${pct}%
                  </button>
                `).join('')}
              </div>
              <div id="ownerFlatChips" class="flex flex-wrap gap-1.5 hidden">
                <!-- Dynamically populated in setOwnerTarget -->
              </div>
            </div>

            <!-- Input Box -->
            <div class="flex gap-2 items-center">
              <div class="relative flex-1">
                <span class="absolute left-3 top-2.5 text-gray-400 font-bold" id="ownerDiscInputPrefix">%</span>
                <input type="number" id="ownerDiscInputVal" min="0" step="any" placeholder="0" class="w-full pl-8 pr-3 py-2 border rounded-xl font-bold font-mono text-base text-gray-900 focus:ring-2 focus:ring-amber-500 outline-none" oninput="recalcOwnerDiscountPreview()">
              </div>
              <input type="text" id="ownerDiscRemarks" placeholder="Remarks" class="flex-1 px-3 py-2 border rounded-xl text-xs text-gray-700 focus:ring-2 focus:ring-amber-500 outline-none">
            </div>
          </div>

          <!-- Submit Button -->
          <div class="flex gap-2.5 pt-2">
            <button onclick="document.getElementById('ownerDiscountModal').remove()" class="px-4 py-2.5 border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition text-xs">
              Cancel
            </button>
            <button onclick="submitOwnerDiscount(${sale.id})" id="btnSubmitOwnerDisc" class="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition">
              <span>✅ Approve &amp; Sync to Cashier &amp; Seller</span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    window._ownerActiveSale = sale;
    window._ownerDiscMode = 'PCT';
    window._ownerDiscTarget = (totalMaking > 0 ? 'MAKING' : (totalWastage > 0 ? 'WASTAGE' : (totalStone > 0 ? 'STONE' : 'FULL_BILL')));

    function getAppOwnerTargetPool() {
      if (window._ownerDiscTarget === 'MAKING') return totalMaking;
      if (window._ownerDiscTarget === 'WASTAGE') return totalWastage;
      if (window._ownerDiscTarget === 'STONE') return totalStone;
      if (window._ownerDiscTarget === 'FULL_BILL') return grossSubtotal;
      return totalMaking || grossSubtotal;
    }

    function getAppOwnerTargetLabel() {
      if (window._ownerDiscTarget === 'MAKING') return 'Making Charges';
      if (window._ownerDiscTarget === 'WASTAGE') return 'Wastage (VA)';
      if (window._ownerDiscTarget === 'STONE') return 'Stone Charges';
      if (window._ownerDiscTarget === 'FULL_BILL') return 'Gross Bill';
      return 'Extra Charges';
    }

    window.setOwnerTarget = function(target) {
      window._ownerDiscTarget = target;
      const buttons = [
        { id: 'btnAppTargetMaking', key: 'MAKING' },
        { id: 'btnAppTargetWastage', key: 'WASTAGE' },
        { id: 'btnAppTargetStone', key: 'STONE' },
        { id: 'btnAppTargetGross', key: 'FULL_BILL' }
      ];
      buttons.forEach(b => {
        const el = document.getElementById(b.id);
        if (!el) return;
        const isSel = b.key === target;
        if (isSel) {
          el.className = 'p-1.5 rounded-lg border-2 text-left font-bold transition flex justify-between items-center bg-amber-500 text-white border-amber-600 shadow-sm ring-1 ring-amber-400';
        } else {
          el.className = 'p-1.5 rounded-lg border border-gray-200 text-left font-bold transition flex justify-between items-center bg-white text-gray-700 hover:border-amber-400';
        }
      });

      renderAppFlatChips();
      recalcOwnerDiscountPreview();
    };

    function renderAppFlatChips() {
      const flatContainer = document.getElementById('ownerFlatChips');
      if (!flatContainer) return;
      const pool = getAppOwnerTargetPool();
      let chips = [];
      if (pool > 0) {
        chips.push({ label: `Zero Out (${formatMoney(pool)})`, val: pool, hl: true });
        if (pool > 500) {
          [5000, 2000, 1000, 500].filter(a => a < pool).forEach(a => chips.push({ label: `₹${a}`, val: a }));
        } else if (pool > 50) {
          [200, 100, 50, 20].filter(a => a < pool).forEach(a => chips.push({ label: `₹${a}`, val: a }));
        } else {
          [10, 5, 2, 1].filter(a => a < pool).forEach(a => chips.push({ label: `₹${a}`, val: a }));
        }
      } else {
        chips.push({ label: '₹0', val: 0 });
      }
      flatContainer.innerHTML = chips.map(c => `
        <button type="button" onclick="applyOwnerPresetDisc(${c.val}, 'FLAT')" class="px-2 py-1 ${c.hl ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-black' : 'bg-amber-50 border-amber-200 text-amber-800 font-bold'} border rounded-lg text-xs transition active:scale-95">
          ${c.label}
        </button>
      `).join('');
    }

    window.setOwnerDiscMode = function(mode) {
      window._ownerDiscMode = mode;
      const bPct = document.getElementById('btnOwnerDiscModePct');
      const bFlat = document.getElementById('btnOwnerDiscModeFlat');
      const chipsPct = document.getElementById('ownerPctChips');
      const chipsFlat = document.getElementById('ownerFlatChips');
      const pfx = document.getElementById('ownerDiscInputPrefix');
      if (mode === 'PCT') {
        bPct.className = 'px-2.5 py-1 bg-amber-500 text-white';
        bFlat.className = 'px-2.5 py-1 bg-gray-100 text-gray-700';
        chipsPct.classList.remove('hidden');
        chipsFlat.classList.add('hidden');
        pfx.innerText = '%';
      } else {
        bFlat.className = 'px-2.5 py-1 bg-emerald-600 text-white';
        bPct.className = 'px-2.5 py-1 bg-gray-100 text-gray-700';
        chipsFlat.classList.remove('hidden');
        chipsPct.classList.add('hidden');
        pfx.innerText = '₹';
      }
      recalcOwnerDiscountPreview();
    };

    window.applyOwnerPresetDisc = function(val, mode) {
      setOwnerDiscMode(mode);
      const input = document.getElementById('ownerDiscInputVal');
      if (input) input.value = val;
      recalcOwnerDiscountPreview();
    };

    window.recalcOwnerDiscountPreview = function() {
      const pool = getAppOwnerTargetPool();
      const inputVal = parseFloat(document.getElementById('ownerDiscInputVal')?.value) || 0;
      let discAmt = 0;
      let discPctOfTarget = 0;

      if (window._ownerDiscMode === 'PCT') {
        discPctOfTarget = Math.min(100, Math.max(0, inputVal));
        discAmt = Math.round(pool * (discPctOfTarget / 100));
      } else {
        discAmt = Math.min(pool, Math.max(0, inputVal));
        discPctOfTarget = pool > 0 ? parseFloat(((discAmt / pool) * 100).toFixed(1)) : 0;
      }

      const taxable = Math.max(0, grossSubtotal - discAmt);
      const taxAmt = Math.round(taxable * (taxRate / 100));
      const finalAmt = taxable + taxAmt;
      const overallBillPct = grossSubtotal > 0 ? parseFloat(((discAmt / grossSubtotal) * 100).toFixed(2)) : 0;
      const targetLabel = getAppOwnerTargetLabel();

      document.getElementById('ownerPreviewDiscAmount').innerText = '-' + formatMoney(discAmt) + (discPctOfTarget > 0 ? ` (${discPctOfTarget}% off ${targetLabel})` : '');
      document.getElementById('ownerPreviewTax').innerText = formatMoney(taxAmt);
      document.getElementById('ownerPreviewFinalPayable').innerText = formatMoney(finalAmt);

      const remEl = document.getElementById('ownerDiscRemarks');
      if (remEl && (!remEl.value || remEl.value.startsWith('Owner Approved'))) {
        remEl.value = window._ownerDiscMode === 'PCT'
          ? `Owner Approved: ${discPctOfTarget}% off ${targetLabel} (-₹${discAmt})`
          : `Owner Approved: -₹${discAmt} on ${targetLabel}`;
      }
    };

    window.submitOwnerDiscount = async function(saleId) {
      const pool = getAppOwnerTargetPool();
      const inputVal = parseFloat(document.getElementById('ownerDiscInputVal')?.value) || 0;
      const targetLabel = getAppOwnerTargetLabel();
      let discAmt = 0;
      let discPctOfTarget = 0;

      if (window._ownerDiscMode === 'PCT') {
        discPctOfTarget = Math.min(100, Math.max(0, inputVal));
        discAmt = Math.round(pool * (discPctOfTarget / 100));
      } else {
        discAmt = Math.min(pool, Math.max(0, inputVal));
        discPctOfTarget = pool > 0 ? parseFloat(((discAmt / pool) * 100).toFixed(1)) : 0;
      }

      const overallBillPct = grossSubtotal > 0 ? parseFloat(((discAmt / grossSubtotal) * 100).toFixed(2)) : 0;
      const remarks = document.getElementById('ownerDiscRemarks')?.value || `Owner Approved: -₹${discAmt} on ${targetLabel}`;

      const btn = document.getElementById('btnSubmitOwnerDisc');
      if (btn) { btn.disabled = true; btn.innerText = 'Syncing...'; }

      try {
        const res = await api('/sales/' + saleId + '/owner-discount', {
          method: 'POST',
          body: JSON.stringify({
            discount_percent: overallBillPct,
            discount_amount: discAmt,
            remarks
          })
        });

        playNotificationSound('cash');
        showToast(`🎉 Discount ${discPctOfTarget}% (₹${discAmt}) synced to Cashier & Seller!`, 'success');
        document.getElementById('ownerDiscountModal')?.remove();
        if (window.currentPageId === 'sales') loadPage('sales', 'Sales & Invoices');
        if (window.currentPageId === 'dashboard') loadPage('dashboard', 'Dashboard');
      } catch(err) {
        if (btn) { btn.disabled = false; btn.innerText = '✅ Approve & Sync to Cashier & Seller'; }
        showToast('Failed to update discount: ' + (err.message || err), 'error');
      }
    };

    // Initialize target and flat chips
    window.setOwnerTarget(window._ownerDiscTarget);

    if (existingDisc > 0) {
      const existingPct = sale.discount_percent || (grossSubtotal > 0 ? ((existingDisc / grossSubtotal) * 100).toFixed(1) : 0);
      document.getElementById('ownerDiscInputVal').value = existingPct;
      recalcOwnerDiscountPreview();
    }
  } catch(err) {
    console.error('Owner discount error:', err);
    showToast('Failed to open Owner Discount modal: ' + (err.message || err), 'error');
  }
};

window.openCashierCheckoutModal = async function(codeOrId) {
  if (!codeOrId) return;
  try {
    const sale = await api('/sales/find-by-code/' + encodeURIComponent(codeOrId));
    if (!sale) return showToast('Bill not found for ' + codeOrId, 'error');

    const gross = parseFloat(sale.gross_amount || sale.total_amount || sale.subtotal || 0);
    const discAmt = parseFloat(sale.discount_amount || 0);
    const discPct = sale.discount_percent || (gross > 0 && discAmt > 0 ? ((discAmt / gross) * 100).toFixed(1) : 0);
    const taxAmt = parseFloat(sale.tax_amount || 0);
    const finalAmt = parseFloat(sale.final_amount || (gross - discAmt + taxAmt));

    const existing = document.getElementById('cashierCheckoutModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'cashierCheckoutModal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-emerald-300">
        <!-- Header -->
        <div class="bg-gradient-to-r from-emerald-600 via-teal-600 to-green-700 px-6 py-4 text-white flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">💵</span>
            <div>
              <h3 class="font-extrabold text-base tracking-wide uppercase font-serif">Cash Desk Checkout</h3>
              <p class="text-[11px] text-emerald-100 font-mono">Invoice Ref: <strong>${sale.invoice_no || ('GF-EST-' + sale.id)}</strong></p>
            </div>
          </div>
          <button onclick="document.getElementById('cashierCheckoutModal').remove()" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition">✕</button>
        </div>

        <div class="p-5 max-h-[82vh] overflow-y-auto space-y-4">
          <!-- Customer & Status Banner -->
          <div class="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
            <div>
              <div class="font-bold text-gray-900">${sale.Customer?.name || sale.customer?.name || 'Walk-in Customer'}</div>
              <div class="text-gray-500 font-mono text-[11px]">📞 ${sale.Customer?.phone || sale.customer?.phone || 'No phone'}</div>
            </div>
            <div class="text-right">
              <span class="px-2.5 py-1 rounded text-[10px] font-black uppercase ${sale.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                ${sale.status === 'APPROVED' ? '✓ OWNER APPROVED' : (sale.status || 'PENDING')}
              </span>
            </div>
          </div>

          <!-- Highlight Owner Discount if any -->
          ${discAmt > 0 ? `
            <div class="bg-emerald-50 border-2 border-emerald-400 p-3 rounded-xl flex items-center gap-3">
              <span class="text-2xl">🎉</span>
              <div class="flex-1 text-xs">
                <div class="font-black text-emerald-900 uppercase">Owner Discount Applied!</div>
                <div class="text-emerald-700">A special discount of <strong>${formatMoney(discAmt)}</strong> (${discPct}%) has been deducted from this bill.</div>
              </div>
            </div>
          ` : `
            <div class="bg-amber-50/70 border border-amber-200 p-2.5 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <span>ℹ️</span> <span>No owner discount applied. Standard catalog pricing.</span>
            </div>
          `}

          <!-- Financial Calculation Breakdown -->
          <div class="bg-white rounded-xl border border-gray-200 p-3.5 space-y-1.5 text-xs shadow-sm">
            <div class="flex justify-between text-gray-600">
              <span>Gross Total:</span>
              <span class="font-mono font-bold">${formatMoney(gross)}</span>
            </div>
            ${discAmt > 0 ? `
              <div class="flex justify-between text-emerald-700 font-bold">
                <span>Discount (${discPct}%):</span>
                <span class="font-mono">-${formatMoney(discAmt)}</span>
              </div>
            ` : ''}
            <div class="flex justify-between text-gray-500 text-[11px]">
              <span>Tax (GST):</span>
              <span class="font-mono">${formatMoney(taxAmt)}</span>
            </div>
            <div class="flex justify-between items-center pt-2 border-t font-black text-gray-900 text-base">
              <span class="text-gray-900">Total Due Amount:</span>
              <span class="text-xl text-emerald-700 font-mono">${formatMoney(finalAmt)}</span>
            </div>
          </div>

          <!-- Payment Mode Selection -->
          <div class="space-y-2">
            <label class="text-xs font-black text-gray-800 uppercase">Payment Method</label>
            <div class="grid grid-cols-4 gap-2">
              ${['CASH', 'UPI', 'CARD', 'NET_BANKING'].map(mode => `
                <button type="button" onclick="selectCashierPayMode('${mode}')" id="btnPayMode_${mode}" class="pay-mode-btn py-2.5 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition ${mode === 'CASH' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'}">
                  <span class="text-base">${mode === 'CASH' ? '💵' : mode === 'UPI' ? '📱' : mode === 'CARD' ? '💳' : '🏦'}</span>
                  <span>${mode}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Cash Change Calculation -->
          <div id="cashierCashRow" class="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
            <div>
              <label class="font-bold text-gray-700 block mb-1">Cash Received (₹)</label>
              <input type="number" id="cashierReceivedInput" placeholder="${finalAmt}" class="w-full px-3 py-2 border rounded-lg font-mono font-bold text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none" oninput="calcCashierChange(${finalAmt})">
            </div>
            <div>
              <label class="font-bold text-gray-700 block mb-1">Change to Return (₹)</label>
              <div id="cashierChangeDisplay" class="font-mono font-black text-lg text-emerald-700 pt-1.5">₹0</div>
            </div>
          </div>

          <!-- Submit Button -->
          <div class="flex gap-2.5 pt-2">
            <button onclick="document.getElementById('cashierCheckoutModal').remove()" class="px-4 py-2.5 border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition text-xs">
              Close
            </button>
            <button onclick="submitCashierPayment(${sale.id}, ${finalAmt})" id="btnSubmitCashierPay" class="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition">
              <span>💵 Complete Payment &amp; Print Tax Invoice</span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    window._cashierSelectedPayMode = 'CASH';

    window.selectCashierPayMode = function(mode) {
      window._cashierSelectedPayMode = mode;
      document.querySelectorAll('.pay-mode-btn').forEach(btn => {
        btn.className = 'pay-mode-btn py-2.5 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100';
      });
      const activeBtn = document.getElementById('btnPayMode_' + mode);
      if (activeBtn) {
        activeBtn.className = 'pay-mode-btn py-2.5 rounded-xl border font-bold text-xs flex flex-col items-center gap-1 transition border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500';
      }
      const cashRow = document.getElementById('cashierCashRow');
      if (cashRow) cashRow.style.display = (mode === 'CASH') ? 'grid' : 'none';
    };

    window.calcCashierChange = function(due) {
      const rec = parseFloat(document.getElementById('cashierReceivedInput')?.value) || 0;
      const change = Math.max(0, rec - due);
      document.getElementById('cashierChangeDisplay').innerText = '₹' + change.toLocaleString('en-IN');
    };

    window.submitCashierPayment = async function(saleId, payable) {
      const btn = document.getElementById('btnSubmitCashierPay');
      if (btn) { btn.disabled = true; btn.innerText = 'Processing Payment...'; }

      try {
        const payMode = window._cashierSelectedPayMode || 'CASH';
        const receivedAmt = parseFloat(document.getElementById('cashierReceivedInput')?.value) || payable;

        const res = await api('/sales/' + saleId + '/complete', {
          method: 'POST',
          body: JSON.stringify({
            payment_method: payMode,
            payment_status: 'PAID',
            amount_paid: receivedAmt,
            notes: 'Payment collected at cash desk'
          })
        });

        playNotificationSound('cash');
        showToast('Payment successful! Opening Tax Invoice...', 'success');
        document.getElementById('cashierCheckoutModal')?.remove();

        if (typeof openTaxInvoicePrintPreview === 'function') {
          openTaxInvoicePrintPreview(saleId, 'a4');
        } else if (typeof viewSaleInvoice === 'function') {
          viewSaleInvoice(saleId);
        }

        if (window.currentPageId === 'dashboard') loadPage('dashboard', 'Dashboard');
        if (window.currentPageId === 'sales') loadPage('sales', 'Sales Queue');
      } catch(err) {
        if (btn) { btn.disabled = false; btn.innerText = '💵 Complete Payment & Print Tax Invoice'; }
        showToast('Payment completion failed: ' + (err.message || err), 'error');
      }
    };
  } catch(err) {
    console.error('Cashier checkout error:', err);
    showToast('Failed to open Cashier Checkout: ' + (err.message || err), 'error');
  }
};

window.openUniversalQrScannerModal = function() {
  const existing = document.getElementById('universalQrScannerModal');
  if (existing) {
    try { if (window._html5QrScanner) window._html5QrScanner.stop(); } catch(e){}
    existing.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'universalQrScannerModal';
  modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-amber-300">
      <!-- Header -->
      <div class="bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-700 px-5 py-3.5 text-white flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">📷</span>
          <h3 class="font-extrabold text-sm uppercase tracking-wide font-serif">GoldFlow QR &amp; Barcode Scanner</h3>
        </div>
        <button onclick="closeUniversalQrScannerModal()" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition">✕</button>
      </div>

      <div class="p-4 space-y-3">
        <!-- Camera Viewport -->
        <div class="relative bg-black rounded-xl overflow-hidden min-h-[260px] flex items-center justify-center border-2 border-amber-400">
          <div id="universalQrReaderBox" class="w-full h-full"></div>
          <div id="scannerPlaceholder" class="absolute inset-0 flex flex-col items-center justify-center text-white text-xs p-4 text-center space-y-2 pointer-events-none">
            <span class="text-3xl animate-pulse">📷</span>
            <span class="font-bold">Point Camera at Jewellery Tag or Estimate Bill QR</span>
          </div>
        </div>

        <!-- Manual or USB Scanner Gun Input -->
        <div class="bg-gray-50 p-3 rounded-xl border border-gray-200">
          <label class="text-[11px] font-bold text-gray-700 uppercase block mb-1.5 flex items-center gap-1">
            <span>🔫</span> <span>USB Scanner Gun or Manual Code</span>
          </label>
          <div class="flex gap-2">
            <input type="text" id="manualQrScanInput" placeholder="Scan or type e.g. GF-RG-001 or GF-EST-..." class="flex-1 px-3 py-2 border rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500 outline-none" autofocus onkeydown="if(event.key === 'Enter') submitManualQrScan()">
            <button type="button" onclick="submitManualQrScan()" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition active:scale-95 shadow">
              Submit
            </button>
          </div>
        </div>

        <!-- Help Info -->
        <div class="text-[10px] text-gray-500 flex justify-between px-1">
          <span>• Jewellery QR Tag ➜ Full Specs &amp; Live Price</span>
          <span>• Bill QR ➜ Owner Discount / Cashier Pay</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  setTimeout(() => {
    document.getElementById('manualQrScanInput')?.focus();
  }, 200);

  if (window.Html5Qrcode) {
    try {
      const html5Qr = new Html5Qrcode('universalQrReaderBox');
      window._html5QrScanner = html5Qr;
      const config = { fps: 10, qrbox: { width: 220, height: 220 } };
      html5Qr.start({ facingMode: "environment" }, config, (decodedText) => {
        playNotificationSound('success');
        closeUniversalQrScannerModal();
        handleQrScanResult(decodedText);
      }, (err) => {
        // frame scan loop
      }).catch(err => {
        console.warn('Camera access error:', err);
        const pl = document.getElementById('scannerPlaceholder');
        if (pl) pl.innerHTML = `<span class="text-amber-300">Camera unavailable or permission denied. Please use the USB scanner gun or type the code below.</span>`;
      });
    } catch(err) {
      console.warn('Html5Qrcode init error:', err);
    }
  }

  window.closeUniversalQrScannerModal = function() {
    if (window._html5QrScanner) {
      try { window._html5QrScanner.stop().catch(()=>{}); } catch(e){}
      window._html5QrScanner = null;
    }
    document.getElementById('universalQrScannerModal')?.remove();
  };

  window.submitManualQrScan = function() {
    const val = document.getElementById('manualQrScanInput')?.value.trim();
    if (!val) return showToast('Please enter or scan a code', 'warning');
    closeUniversalQrScannerModal();
    handleQrScanResult(val);
  };
};

window.handleQrScanResult = async function(scannedText) {
  if (!scannedText) return;
  let code = String(scannedText).trim();
  if (code.includes('code=')) {
    const match = code.match(/code=([^&]+)/);
    if (match) code = decodeURIComponent(match[1]);
  }
  playNotificationSound('success');

  const isBill = code.startsWith('GF-EST-') || code.startsWith('GF-INV-') || code.startsWith('EST-') || code.startsWith('INV-');
  
  if (isBill) {
    if (user.role === 'OWNER' || user.role === 'ADMIN') {
      return openOwnerDiscountModal(code);
    } else if (user.role === 'CASHIER') {
      return openCashierCheckoutModal(code);
    } else {
      return openEstimateInspectionModal(code);
    }
  }

  // If user is on POS billing screen and scanned a product, add it directly to billing cart
  if (window.location.hash === '#sell') {
    return window.handleBarcodeScan(code);
  }

  let item = (window.allJewellery || []).find(i => i.code.toLowerCase() === code.toLowerCase() || (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()));
  if (item) {
    return openJewelleryQrInspectionModal(item.code);
  }

  try {
    const jItem = await api('/jewellery/barcode/' + encodeURIComponent(code));
    if (jItem && jItem.id) {
      return openJewelleryQrInspectionModal(jItem.code);
    }
  } catch(e) {}

  try {
    const sale = await api('/sales/find-by-code/' + encodeURIComponent(code));
    if (sale && sale.id) {
      if (user.role === 'OWNER' || user.role === 'ADMIN') return openOwnerDiscountModal(code);
      if (user.role === 'CASHIER') return openCashierCheckoutModal(code);
      return openEstimateInspectionModal(code);
    }
  } catch(e) {}

  showToast('Unrecognized QR or Barcode: ' + code, 'warning');
};

// -------------------------------------------------------------------------
// Startup & Initialization
// -------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  const isCollapsed = localStorage.getItem('goldflow_sidebar_collapsed') === 'true';
  applySidebarCollapsedState(isCollapsed);
  renderNav();
  await initAppData();

  const rawHash = window.location.hash.substring(1);
  const defaultPage = (user.role === 'SELLER' || user.role === 'CASHIER') ? 'sell' : 'dashboard';
  const hash = (rawHash === 'purchases') ? '' : rawHash;
  if (rawHash === 'purchases') {
    window.location.hash = '#' + defaultPage;
  }
  const target = hash || defaultPage;
  const currentNavs = getOrderedNavItems();
  const item = currentNavs.find(n => n.id === target) || currentNavs[0];
  if (item) {
    loadPage(item.id, item.label);
  }
});

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.substring(1);
  if (hash) {
    if (hash === 'purchases') {
      window.location.hash = '#' + ((user.role === 'SELLER' || user.role === 'CASHIER') ? 'sell' : 'dashboard');
      return;
    }
    const currentNavs = getOrderedNavItems();
    const match = currentNavs.find(item => item.id === hash);
    if (match) {
      loadPage(match.id, match.label);
    }
  }
});
