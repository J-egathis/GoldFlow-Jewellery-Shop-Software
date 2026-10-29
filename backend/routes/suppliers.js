const express = require('express');
const router = express.Router();
const { Supplier, Purchase, PurchaseItem, Jewellery, AuditLog } = require('../models');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// Get all suppliers
router.get('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const suppliers = await Supplier.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get supplier profile with purchase history
router.get('/:id', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id, {
      include: [
        {
          model: Purchase,
          include: [{ model: PurchaseItem, include: [Jewellery] }],
          order: [['date', 'DESC']]
        }
      ]
    });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create Supplier
router.post('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { name, phone, email, address, gst_number, bank_details, opening_balance = 0 } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ message: 'Supplier name and phone are required' });
    }

    const opBal = parseFloat(opening_balance) || 0;
    const supplier = await Supplier.create({
      name,
      phone,
      email,
      address,
      gst_number,
      bank_details,
      opening_balance: opBal,
      outstanding_balance: opBal
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_SUPPLIER',
      module: 'SUPPLIERS',
      details: `Created supplier ${name} (${phone})`
    });

    res.status(201).json(supplier);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update Supplier
router.put('/:id', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    await supplier.update(req.body);

    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_SUPPLIER',
      module: 'SUPPLIERS',
      details: `Updated supplier ${supplier.name}`
    });

    res.json(supplier);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete single supplier
router.delete('/:id', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const sName = supplier.name;
    await Purchase.update({ supplier_id: null }, { where: { supplier_id: supplier.id } });
    await supplier.destroy();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_SUPPLIER',
      module: 'SUPPLIERS',
      details: `Deleted supplier ${sName}`
    });

    res.json({ success: true, message: `Supplier "${sName}" deleted successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting supplier', error: error.message });
  }
});

// Bulk Delete suppliers
router.post('/bulk-delete', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No suppliers selected' });
    }

    await Purchase.update({ supplier_id: null }, { where: { supplier_id: { [Op.in]: ids } } });
    const deletedCount = await Supplier.destroy({ where: { id: { [Op.in]: ids } } });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'BULK_DELETE_SUPPLIERS',
      module: 'SUPPLIERS',
      details: `Bulk deleted ${deletedCount} suppliers`
    });

    res.json({ success: true, deletedCount, message: `${deletedCount} supplier(s) deleted successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error in bulk deleting suppliers', error: error.message });
  }
});

module.exports = router;
