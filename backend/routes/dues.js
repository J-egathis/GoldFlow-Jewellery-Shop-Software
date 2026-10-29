const express = require('express');
const router = express.Router();
const { sequelize, Sale, Customer, Payment, AuditLog } = require('../models');
const { authenticate } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// Get all dues / outstanding invoices with summary stats
router.get('/', authenticate, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingSales = await Sale.findAll({
      where: {
        status: 'COMPLETED',
        balance_amount: { [Op.gt]: 0 }
      },
      include: [
        { model: Customer },
        { model: Payment }
      ],
      order: [['createdAt', 'DESC']]
    });

    const totalOutstanding = pendingSales.reduce((acc, s) => acc + (s.balance_amount || 0), 0);

    // Today's collections
    const todayPayments = await Payment.findAll({
      where: {
        createdAt: { [Op.gte]: today },
        status: 'SUCCESS'
      }
    });
    const todayCollections = todayPayments.reduce((acc, p) => acc + (p.amount || 0), 0);

    res.json({
      summary: {
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        todayCollections: Math.round(todayCollections * 100) / 100,
        dueCount: pendingSales.length
      },
      dues: pendingSales
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Record payment against outstanding balance
router.post('/:sale_id/pay', authenticate, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { amount, payment_method = 'CASH', reference_no, notes } = req.body;
    const payAmt = parseFloat(amount);

    if (!payAmt || payAmt <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Valid payment amount is required' });
    }

    const sale = await Sale.findByPk(req.params.sale_id, {
      include: [Customer],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (sale.balance_amount <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'This invoice is already fully paid' });
    }

    const newPaid = (sale.paid_amount || 0) + payAmt;
    const newBal = Math.max(0, (sale.balance_amount || 0) - payAmt);

    sale.paid_amount = newPaid;
    sale.balance_amount = newBal;
    sale.payment_status = newBal <= 0 ? 'PAID' : 'PARTIALLY_PAID';
    await sale.save({ transaction: t });

    // Record Payment
    const payment = await Payment.create({
      sale_id: sale.id,
      customer_id: sale.customer_id,
      amount: payAmt,
      payment_method,
      reference_no: reference_no || '',
      status: 'SUCCESS',
      notes: notes || 'Due recovery collection',
      recorded_by: req.user.id
    }, { transaction: t });

    // Deduct from customer's outstanding balance
    if (sale.Customer) {
      sale.Customer.outstanding_balance = Math.max(0, (sale.Customer.outstanding_balance || 0) - payAmt);
      await sale.Customer.save({ transaction: t });
    }

    // Audit Log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'COLLECT_DUE',
      module: 'PAYMENTS',
      details: `Collected ₹${payAmt} for Invoice ${sale.invoice_no || '#' + sale.id} via ${payment_method}. Remaining Balance: ₹${newBal}`
    }, { transaction: t });

    await t.commit();

    if (req.io) {
      req.io.emit('paymentReceived', { sale_id: sale.id, amount: payAmt, balance: newBal });
      req.io.emit('salesUpdated');
    }

    res.json({ message: 'Payment recorded successfully', sale, payment });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Server error collecting payment', error: error.message });
  }
});

module.exports = router;
