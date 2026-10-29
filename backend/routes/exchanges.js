const express = require('express');
const router = express.Router();
const { sequelize, GoldExchange, Customer, Sale, AuditLog } = require('../models');
const { authenticate } = require('../middleware/authMiddleware');
const { generateNextExchangeNumber } = require('../utils/invoiceGenerator');
const { Op } = require('sequelize');

// Get all exchanges
router.get('/', authenticate, async (req, res) => {
  try {
    const exchanges = await GoldExchange.findAll({
      include: [
        { model: Customer },
        { model: Sale }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(exchanges);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create Gold Exchange valuation / record
router.post('/', authenticate, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      customer_id,
      sale_id,
      old_metal = 'Gold',
      old_purity = '22K',
      old_gross_weight = 0,
      old_stone_weight = 0,
      old_net_weight = 0,
      old_rate = 0,
      deduction_percent = 0,
      new_jewellery_value = 0,
      notes
    } = req.body;

    const gross = parseFloat(old_gross_weight) || 0;
    const stone = parseFloat(old_stone_weight) || 0;
    const net = old_net_weight ? parseFloat(old_net_weight) : Math.max(0, gross - stone);
    const rate = parseFloat(old_rate) || 0;
    const deductPct = parseFloat(deduction_percent) || 0;

    // Raw value = Net Weight * Rate
    const rawGoldVal = net * rate;
    const deductionVal = rawGoldVal * (deductPct / 100);
    const oldGoldValue = Math.round((rawGoldVal - deductionVal) * 100) / 100;

    const newJewVal = parseFloat(new_jewellery_value) || 0;
    const amountDifference = Math.round((newJewVal - oldGoldValue) * 100) / 100;

    const exchangeNo = await generateNextExchangeNumber(t);

    const exchange = await GoldExchange.create({
      exchange_no: exchangeNo,
      customer_id: customer_id || null,
      sale_id: sale_id || null,
      old_metal,
      old_purity,
      old_gross_weight: gross,
      old_stone_weight: stone,
      old_net_weight: net,
      old_rate: rate,
      deduction_percent: deductPct,
      old_gold_value: oldGoldValue,
      new_jewellery_value: newJewVal,
      amount_difference: amountDifference,
      notes: notes || '',
      created_by: req.user.id
    }, { transaction: t });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'GOLD_EXCHANGE',
      module: 'EXCHANGE',
      details: `Created Gold Exchange ${exchangeNo}. Old Gold Value: ₹${oldGoldValue}, Net Payable/Diff: ₹${amountDifference}`
    }, { transaction: t });

    await t.commit();

    if (req.io) {
      req.io.emit('exchangeCreated', exchange);
    }

    res.status(201).json(exchange);
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Server error creating exchange', error: error.message });
  }
});

// Delete single exchange
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const exchange = await GoldExchange.findByPk(req.params.id);
    if (!exchange) return res.status(404).json({ message: 'Exchange not found' });

    const exNo = exchange.exchange_no || '#' + exchange.id;
    await exchange.destroy();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_EXCHANGE',
      module: 'EXCHANGE',
      details: `Deleted Gold Exchange ${exNo}`
    });

    res.json({ success: true, message: `Exchange ${exNo} deleted successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting exchange', error: error.message });
  }
});

// Bulk Delete exchanges
router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No exchanges selected' });
    }

    const deletedCount = await GoldExchange.destroy({ where: { id: { [Op.in]: ids } } });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'BULK_DELETE_EXCHANGES',
      module: 'EXCHANGE',
      details: `Bulk deleted ${deletedCount} exchanges`
    });

    res.json({ success: true, deletedCount, message: `${deletedCount} exchange(s) deleted successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error in bulk deleting exchanges', error: error.message });
  }
});

module.exports = router;
