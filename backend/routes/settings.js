const express = require('express');
const router = express.Router();
const { Setting, AuditLog } = require('../models');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { getPrimaryLanIp, getLanServerUrl } = require('../utils/networkUtils');

// Get LAN Network details for QR codes and mobile access
router.get('/lan-info', (req, res) => {
  const lanIp = getPrimaryLanIp();
  const lanUrl = getLanServerUrl(req);
  res.json({ success: true, lanIp, lanUrl });
});

// Get all settings
router.get('/', authenticate, async (req, res) => {
  try {
    const settings = await Setting.findAll();
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.key] = s.value;
    });
    res.json({ list: settings, map: settingsMap });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update settings (Admin, Owner & Manager)
router.post('/', authenticate, requireRole(['ADMIN', 'OWNER', 'MANAGER']), async (req, res) => {
  try {
    const { settings } = req.body; // e.g. { shop_name: '...', tax_gst_percent: '3', ... }
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ message: 'Settings object is required' });
    }

    for (const [key, value] of Object.entries(settings)) {
      const [record] = await Setting.findOrCreate({
        where: { key },
        defaults: { key, value: String(value) }
      });
      record.value = String(value);
      await record.save();
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_SETTINGS',
      module: 'SETTINGS',
      details: `Updated system settings (${Object.keys(settings).join(', ')})`
    });

    if (req.io) {
      req.io.emit('settingsUpdated', settings);
    }

    res.json({ message: 'Settings saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
