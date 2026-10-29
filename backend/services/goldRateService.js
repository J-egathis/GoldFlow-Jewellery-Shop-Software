const https = require('https');
const { GoldRate, AuditLog } = require('../models');

// Configuration
let autoSyncInterval = null;
let lastSyncTimestamp = null;
const lastSyncSource = 'Chennai Bullion Live Market Feed';
let isSyncing = false;
let autoSyncEnabled = true;

/**
 * Helper to fetch HTTPS content with User-Agent and timeout
 */
function fetchHttps(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHttps(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Fetch Live Chennai Gold & Silver Rates
 */
async function fetchLiveMarketRates() {
  let rate24k = 0, rate22k = 0, rate18k = 0, rateSilver999 = 0, rateSilver925 = 0;

  try {
    const goldHtml = await fetchHttps('https://www.goodreturns.in/gold-rates/chennai.html');
    const tableMatch = goldHtml.match(/<table[^>]*>.*?<\/table>/is);
    if (tableMatch) {
      const rows = tableMatch[0].match(/<tr[^>]*>.*?<\/tr>/gis) || [];
      for (const row of rows) {
        const text = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const cleanText = text.replace(/&#x20b9;/gi, '').replace(/&nbsp;/gi, ' ').replace(/[₹,\+]/g, '');
        const parts = cleanText.split(' ').map(p => p.trim()).filter(Boolean);
        if (parts[0] === '1') {
          const nums = parts.slice(1).map(p => parseFloat(p)).filter(n => !isNaN(n) && n > 1000);
          if (nums.length >= 3) {
            rate24k = nums[0];
            rate22k = nums[1];
            rate18k = nums[2];
            break;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[GoldRateService] Warning: Live gold fetch failed:', err.message);
  }

  try {
    const silverHtml = await fetchHttps('https://www.goodreturns.in/silver-rates/chennai.html');
    const sTableMatch = silverHtml.match(/<table[^>]*>.*?<\/table>/is);
    if (sTableMatch) {
      const rows = sTableMatch[0].match(/<tr[^>]*>.*?<\/tr>/gis) || [];
      for (const row of rows) {
        const text = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const cleanText = text.replace(/&#x20b9;/gi, '').replace(/&nbsp;/gi, ' ').replace(/[₹,\+]/g, '');
        const parts = cleanText.split(' ').map(p => p.trim()).filter(Boolean);
        if (parts[0] === '1') {
          const nums = parts.slice(1).map(p => parseFloat(p)).filter(n => !isNaN(n) && n > 10);
          if (nums.length >= 1) {
            rateSilver999 = nums[0];
            break;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[GoldRateService] Warning: Live silver fetch failed:', err.message);
  }

  // Fallbacks if any single metal failed to parse
  if (rate24k && !rate22k) rate22k = Math.round(rate24k * (22 / 24));
  if (rate22k && !rate24k) rate24k = Math.round(rate22k * (24 / 22));
  if (rate22k && !rate18k) rate18k = Math.round(rate24k * (18 / 24));
  if (rateSilver999 && !rateSilver925) rateSilver925 = Math.round(rateSilver999 * 0.925);

  // If still 0, get latest from database
  if (!rate22k) {
    const last22 = await GoldRate.findOne({ where: { purity: '22K' }, order: [['createdAt', 'DESC']] });
    rate22k = last22 ? last22.rate_per_gram : 6880;
  }
  if (!rate24k) {
    const last24 = await GoldRate.findOne({ where: { purity: '24K' }, order: [['createdAt', 'DESC']] });
    rate24k = last24 ? last24.rate_per_gram : Math.round(rate22k * (24 / 22));
  }
  if (!rate18k) {
    const last18 = await GoldRate.findOne({ where: { purity: '18K' }, order: [['createdAt', 'DESC']] });
    rate18k = last18 ? last18.rate_per_gram : Math.round(rate24k * (18 / 24));
  }
  if (!rateSilver999) {
    const lastS = await GoldRate.findOne({ where: { purity: 'SILVER_999' }, order: [['createdAt', 'DESC']] });
    rateSilver999 = lastS ? lastS.rate_per_gram : 98;
  }
  if (!rateSilver925) {
    const lastS2 = await GoldRate.findOne({ where: { purity: 'SILVER_925' }, order: [['createdAt', 'DESC']] });
    rateSilver925 = lastS2 ? lastS2.rate_per_gram : Math.round(rateSilver999 * 0.925);
  }

  return {
    success: true,
    source: lastSyncSource,
    timestamp: new Date().toISOString(),
    rates: {
      '24K': rate24k,
      '22K': rate22k,
      '18K': rate18k,
      'SILVER_999': rateSilver999,
      'SILVER_925': rateSilver925
    }
  };
}

/**
 * Synchronize live rates into the database and broadcast via Socket.IO
 */
async function syncLiveRatesToDb(io, updatedBy = 1, force = false) {
  if (isSyncing) return { status: 'in_progress', message: 'Sync already in progress' };
  isSyncing = true;

  try {
    const liveData = await fetchLiveMarketRates();
    const purities = ['24K', '22K', '18K', 'SILVER_999', 'SILVER_925'];
    const updatedRates = [];
    let hasChanges = false;

    for (const purity of purities) {
      const liveRate = liveData.rates[purity];
      if (!liveRate || liveRate <= 0) continue;

      const lastRate = await GoldRate.findOne({
        where: { purity },
        order: [['createdAt', 'DESC']]
      });

      const prev = lastRate ? lastRate.rate_per_gram : 0;
      const isDiff = Math.abs(prev - liveRate) >= 0.01;

      if (isDiff || force) {
        hasChanges = true;
        const newRecord = await GoldRate.create({
          metal: purity.includes('SILVER') ? 'SILVER' : 'GOLD',
          purity,
          rate_per_gram: liveRate,
          previous_rate: prev,
          updated_by: updatedBy
        });
        updatedRates.push(newRecord);
      }
    }

    lastSyncTimestamp = new Date();

    if (hasChanges && updatedRates.length > 0) {
      await AuditLog.create({
        user_id: updatedBy,
        action: 'LIVE_GOLD_RATE_AUTO_SYNC',
        module: 'GOLD_RATES',
        details: `Live rates synchronized: 22K: ₹${liveData.rates['22K']}, 24K: ₹${liveData.rates['24K']}, 18K: ₹${liveData.rates['18K']}, Silver: ₹${liveData.rates['SILVER_999']}`
      });

      if (io) {
        io.emit('goldRateUpdated', updatedRates);
      }
      console.log(`[GoldRateService] ✅ Live rates updated: 22K = ₹${liveData.rates['22K']}/g, 24K = ₹${liveData.rates['24K']}/g, Silver = ₹${liveData.rates['SILVER_999']}/g`);
    } else {
      console.log(`[GoldRateService] ℹ️ Live rates checked - unchanged (22K = ₹${liveData.rates['22K']}/g)`);
    }

    return {
      success: true,
      updated: hasChanges,
      rates: liveData.rates,
      records: updatedRates,
      timestamp: lastSyncTimestamp,
      source: lastSyncSource
    };
  } catch (error) {
    console.error('[GoldRateService] Error syncing rates:', error);
    return { success: false, error: error.message };
  } finally {
    isSyncing = false;
  }
}

/**
 * Initialize background auto-sync scheduler
 */
function initAutoSyncScheduler(io, intervalMinutes = 15) {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
  }

  // Initial sync after 3 seconds on boot
  setTimeout(async () => {
    if (autoSyncEnabled) {
      console.log('[GoldRateService] 🚀 Running initial boot live rate sync...');
      await syncLiveRatesToDb(io, 1, false);
    }
  }, 3000);

  const ms = intervalMinutes * 60 * 1000;
  autoSyncInterval = setInterval(async () => {
    if (autoSyncEnabled) {
      console.log(`[GoldRateService] 🔄 Running scheduled live rate sync (${new Date().toLocaleTimeString()})...`);
      await syncLiveRatesToDb(io, 1, false);
    }
  }, ms);

  console.log(`[GoldRateService] 🕒 Live Gold Rate scheduler active (Every ${intervalMinutes} minutes)`);
}

function getAutoSyncStatus() {
  return {
    enabled: autoSyncEnabled,
    intervalMinutes: 15,
    lastSync: lastSyncTimestamp,
    source: lastSyncSource
  };
}

function setAutoSyncEnabled(enabled) {
  autoSyncEnabled = !!enabled;
  return getAutoSyncStatus();
}

module.exports = {
  fetchLiveMarketRates,
  syncLiveRatesToDb,
  initAutoSyncScheduler,
  getAutoSyncStatus,
  setAutoSyncEnabled
};
