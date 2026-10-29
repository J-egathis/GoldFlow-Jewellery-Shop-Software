const express = require('express');
const router = express.Router();
const { Customer, Sale, SaleItem, Jewellery, Payment, SalesReturn, GoldExchange, AdvancePayment, AuditLog } = require('../models');
const { authenticate } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// Search and list all customers with summary
router.get('/', authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    const where = {};

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: q } },
        { phone: { [Op.like]: q } },
        { email: { [Op.like]: q } }
      ];
    }

    const customers = await Customer.findAll({
      where,
      include: [
        {
          model: Sale,
          where: { status: 'COMPLETED' },
          required: false,
          attributes: ['id', 'invoice_no', 'final_amount', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const response = customers.map(c => {
      const sales = c.Sales || [];
      const totalPurchases = sales.reduce((sum, s) => sum + s.final_amount, 0);
      const lastPurchase = sales.length > 0 ? sales[0].createdAt : null;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        dob: c.dob,
        notes: c.notes,
        outstanding_balance: c.outstanding_balance || 0,
        totalPurchases,
        orderCount: sales.length,
        lastPurchase
      };
    });

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get detailed customer profile with invoices, returns, exchanges, payments, advances
router.get('/:id', authenticate, async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id, {
      include: [
        {
          model: Sale,
          include: [{ model: SaleItem, include: [Jewellery] }, { model: Payment }],
          order: [['createdAt', 'DESC']]
        },
        {
          model: Payment,
          order: [['createdAt', 'DESC']]
        },
        {
          model: SalesReturn,
          order: [['createdAt', 'DESC']]
        },
        {
          model: GoldExchange,
          order: [['createdAt', 'DESC']]
        },
        {
          model: AdvancePayment,
          order: [['createdAt', 'DESC']]
        }
      ]
    });

    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add new customer
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, phone, email, address, dob, notes } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ message: 'Name and phone are required' });
    }

    const customer = await Customer.create({
      name,
      phone,
      email,
      address,
      dob: dob || null,
      notes: notes || '',
      outstanding_balance: 0,
      total_purchases: 0
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_CUSTOMER',
      module: 'CUSTOMERS',
      details: `Added customer ${name} (${phone})`
    });

    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update customer
router.put('/:id', authenticate, async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    await customer.update(req.body);

    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_CUSTOMER',
      module: 'CUSTOMERS',
      details: `Updated customer info for ${customer.name}`
    });

    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete single customer
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const custName = customer.name;
    // Unlink sales and payments so deletion succeeds cleanly
    await Sale.update({ customer_id: null }, { where: { customer_id: customer.id } });
    await Payment.update({ customer_id: null }, { where: { customer_id: customer.id } });
    await AdvancePayment.destroy({ where: { customer_id: customer.id } });
    await customer.destroy();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_CUSTOMER',
      module: 'CUSTOMERS',
      details: `Deleted customer ${custName}`
    });

    res.json({ success: true, message: `Customer "${custName}" deleted successfully.` });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ message: 'Server error deleting customer', error: error.message });
  }
});

// Bulk Delete customers
router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No customers selected' });
    }

    await Sale.update({ customer_id: null }, { where: { customer_id: { [Op.in]: ids } } });
    await Payment.update({ customer_id: null }, { where: { customer_id: { [Op.in]: ids } } });
    await AdvancePayment.destroy({ where: { customer_id: { [Op.in]: ids } } });
    const deletedCount = await Customer.destroy({ where: { id: { [Op.in]: ids } } });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'BULK_DELETE_CUSTOMERS',
      module: 'CUSTOMERS',
      details: `Bulk deleted ${deletedCount} customers`
    });

    res.json({ success: true, deletedCount, message: `${deletedCount} customer(s) deleted successfully.` });
  } catch (error) {
    console.error('Bulk delete customers error:', error);
    res.status(500).json({ message: 'Server error in bulk deleting customers', error: error.message });
  }
});

module.exports = router;
