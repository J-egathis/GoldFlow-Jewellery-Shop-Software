const express = require('express');
const router = express.Router();
const { AdvancePayment, Customer, AuditLog } = require('../models');
const { authenticate } = require('../middleware/authMiddleware');

// Get all advance payments
router.get('/', authenticate, async (req, res) => {
  try {
    const advances = await AdvancePayment.findAll({
      include: [{ model: Customer }],
      order: [['createdAt', 'DESC']]
    });
    res.json(advances);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create advance payment / customer booking order
router.post('/', authenticate, async (req, res) => {
  try {
    const { customer_id, order_ref, advance_amount, payment_method = 'CASH', total_order_amount = 0, notes } = req.body;
    if (!customer_id || !advance_amount) {
      return res.status(400).json({ message: 'Customer and advance amount are required' });
    }

    const adv = parseFloat(advance_amount) || 0;
    const tot = parseFloat(total_order_amount) || adv;
    const bal = Math.max(0, tot - adv);

    const advance = await AdvancePayment.create({
      customer_id,
      order_ref: order_ref || `ORD-${Date.now().toString().slice(-6)}`,
      advance_amount: adv,
      payment_method,
      total_order_amount: tot,
      balance_amount: bal,
      status: 'ACTIVE',
      notes: notes || '',
      recorded_by: req.user.id
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'ADVANCE_PAYMENT',
      module: 'PAYMENTS',
      details: `Recorded advance payment of ₹${adv} for customer #${customer_id} (Ref: ${advance.order_ref})`
    });

    const full = await AdvancePayment.findByPk(advance.id, { include: [Customer] });
    res.status(201).json(full);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Adjust or settle advance payment against bill
router.put('/:id/adjust', authenticate, async (req, res) => {
  try {
    const advance = await AdvancePayment.findByPk(req.params.id);
    if (!advance) return res.status(404).json({ message: 'Advance record not found' });

    advance.status = 'ADJUSTED';
    await advance.save();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'ADJUST_ADVANCE',
      module: 'PAYMENTS',
      details: `Settled/Adjusted advance ${advance.order_ref} of ₹${advance.advance_amount}`
    });

    res.json({ message: 'Advance adjusted successfully', advance });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
