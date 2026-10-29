const express = require('express');
const router = express.Router();
const { GoldRate, AuditLog } = require('../models');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// Get latest rates for each purity
router.get('/', authenticate, async (req, res) => {
  try {
    const purities = ['24K', '22K', '18K', 'SILVER_999', 'SILVER_925'];
    const latestRates = {};

    for (const purity of purities) {
      const rate = await GoldRate.findOne({
        where: { purity },
        order: [['createdAt', 'DESC']]
      });
      if (rate) {
        latestRates[purity] = rate;
      }
    }

    res.json(latestRates);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get rate update history
router.get('/history', authenticate, async (req, res) => {
  try {
    const history = await GoldRate.findAll({
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete single rate history entry (Admin and Owner only)
router.delete('/history/:id', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { id } = req.params;
    const rate = await GoldRate.findByPk(id);
    if (!rate) {
      return res.status(404).json({ message: 'Rate history entry not found' });
    }

    const details = `${rate.metal} ${rate.purity} @ ₹${rate.rate_per_gram} (dated ${rate.createdAt})`;
    await rate.destroy();

    try {
      await AuditLog.create({
        user_id: req.user.id,
        action: 'DELETE_GOLD_RATE',
        module: 'GOLD_RATES',
        details: `Deleted rate history record ID #${id} (${details})`,
        previous_value: JSON.stringify(rate)
      });
    } catch (auditErr) {
      console.warn('AuditLog error:', auditErr.message);
    }

    res.json({ message: 'Rate history entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk delete rate history entries (Admin and Owner only)
router.post('/history/bulk-delete', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { ids, all } = req.body;
    let deletedCount = 0;

    if (all === true) {
      deletedCount = await GoldRate.destroy({ where: {} });
    } else if (Array.isArray(ids) && ids.length > 0) {
      deletedCount = await GoldRate.destroy({
        where: {
          id: { [Op.in]: ids }
        }
      });
    } else {
      return res.status(400).json({ message: 'No valid IDs provided for bulk deletion' });
    }

    try {
      await AuditLog.create({
        user_id: req.user.id,
        action: 'BULK_DELETE_GOLD_RATE',
        module: 'GOLD_RATES',
        details: `Bulk deleted ${deletedCount} rate history record(s)`,
        previous_value: JSON.stringify({ count: deletedCount, ids, all })
      });
    } catch (auditErr) {
      console.warn('AuditLog error:', auditErr.message);
    }

    res.json({ message: `Successfully deleted ${deletedCount} rate history record(s)`, count: deletedCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update rates (Admin and Owner only)
router.post('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { rates } = req.body; // e.g. [{ metal: 'GOLD', purity: '22K', rate_per_gram: 6900 }, ...]
    if (!rates || !Array.isArray(rates) || rates.length === 0) {
      return res.status(400).json({ message: 'Rates array is required' });
    }

    const updated = [];

    for (const item of rates) {
      const lastRate = await GoldRate.findOne({
        where: { purity: item.purity },
        order: [['createdAt', 'DESC']]
      });

      const prev = lastRate ? lastRate.rate_per_gram : 0;
      const newRate = await GoldRate.create({
        metal: item.metal || (item.purity.includes('SILVER') ? 'SILVER' : 'GOLD'),
        purity: item.purity,
        rate_per_gram: parseFloat(item.rate_per_gram),
        previous_rate: prev,
        updated_by: req.user.id
      });

      updated.push(newRate);

      // Audit Log
      await AuditLog.create({
        user_id: req.user.id,
        action: 'UPDATE_GOLD_RATE',
        module: 'GOLD_RATES',
        details: `Updated ${item.purity} rate from ₹${prev} to ₹${item.rate_per_gram}/g`,
        previous_value: String(prev),
        new_value: String(item.rate_per_gram)
      });
    }

    // Real-time broadcast
    if (req.io) {
      req.io.emit('goldRateUpdated', updated);
    }

    res.status(201).json({ message: 'Gold rates updated successfully', rates: updated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Fetch Live Market Rate Feed directly
router.get('/live', authenticate, async (req, res) => {
  try {
    const goldRateService = require('../services/goldRateService');
    const liveData = await goldRateService.fetchLiveMarketRates();
    res.json(liveData);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching live rates', error: error.message });
  }
});

// Sync Live Rates to Database (Admin & Owner)
router.post('/sync-live', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const goldRateService = require('../services/goldRateService');
    const result = await goldRateService.syncLiveRatesToDb(req.io, req.user.id, true);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error syncing live rates', error: error.message });
  }
});

// Get Auto-Sync Status
router.get('/auto-sync-status', authenticate, async (req, res) => {
  try {
    const goldRateService = require('../services/goldRateService');
    res.json(goldRateService.getAutoSyncStatus());
  } catch (error) {
    res.status(500).json({ message: 'Error getting auto-sync status', error: error.message });
  }
});

// Toggle Auto-Sync
router.post('/toggle-auto-sync', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { enabled } = req.body;
    const goldRateService = require('../services/goldRateService');
    const status = goldRateService.setAutoSyncEnabled(enabled);
    if (req.io) {
      req.io.emit('autoSyncStatusChanged', status);
    }
    res.json({ message: `Live Gold Rate Auto-Sync ${status.enabled ? 'Enabled' : 'Disabled'}`, status });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling auto-sync', error: error.message });
  }
});

module.exports = router;
