const express = require('express');
const router = express.Router();
const { sequelize, SalesReturn, SalesReturnItem, Sale, SaleItem, Jewellery, Customer, AuditLog } = require('../models');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { generateNextReturnInvoiceNumber } = require('../utils/invoiceGenerator');
const { Op } = require('sequelize');

// Get all sales returns
router.get('/', authenticate, async (req, res) => {
  try {
    const returns = await SalesReturn.findAll({
      include: [
        { model: Sale },
        { model: Customer },
        { model: SalesReturnItem, include: [Jewellery] }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(returns);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Process Sales Return (Atomic transaction)
router.post('/', authenticate, requireRole(['ADMIN', 'OWNER', 'SELLER']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { sale_id, items, reason } = req.body;
    // items: [{ sale_item_id, jewellery_id, quantity, refund_amount, return_reason, condition }]

    if (!sale_id || !items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Sale ID and returned items are required' });
    }

    const sale = await Sale.findByPk(sale_id, {
      include: [SaleItem, Customer],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ message: 'Original Sale not found' });
    }

    if (sale.status !== 'COMPLETED') {
      await t.rollback();
      return res.status(400).json({ message: `Cannot return items from a sale with status '${sale.status}'` });
    }

    const returnInvoiceNo = await generateNextReturnInvoiceNumber(t);

    let totalRefund = 0;
    for (const it of items) {
      totalRefund += parseFloat(it.refund_amount) || 0;
    }

    const salesReturn = await SalesReturn.create({
      return_invoice_no: returnInvoiceNo,
      sale_id: sale.id,
      customer_id: sale.customer_id,
      total_refund_amount: totalRefund,
      reason: reason || 'Customer Return',
      status: 'COMPLETED',
      processed_by: req.user.id
    }, { transaction: t });

    // Restock jewellery and create return items
    for (const it of items) {
      const qty = parseInt(it.quantity) || 1;
      const refAmt = parseFloat(it.refund_amount) || 0;

      await SalesReturnItem.create({
        return_id: salesReturn.id,
        sale_item_id: it.sale_item_id || null,
        jewellery_id: it.jewellery_id,
        quantity: qty,
        refund_amount: refAmt,
        return_reason: it.return_reason || reason || 'Return',
        condition: it.condition || 'Good'
      }, { transaction: t });

      // Automatically restore inventory stock
      const jew = await Jewellery.findByPk(it.jewellery_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (jew) {
        jew.stock += qty;
        if (jew.stock > jew.min_stock) jew.status = 'AVAILABLE';
        else if (jew.stock > 0) jew.status = 'LOW_STOCK';
        await jew.save({ transaction: t });
      }
    }

    // Deduct from customer total purchases
    if (sale.Customer) {
      sale.Customer.total_purchases = Math.max(0, (sale.Customer.total_purchases || 0) - totalRefund);
      await sale.Customer.save({ transaction: t });
    }

    // Audit Log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'SALES_RETURN',
      module: 'RETURNS',
      details: `Processed return ${returnInvoiceNo} for Sale ${sale.invoice_no || '#' + sale.id}. Refund: ₹${totalRefund}`
    }, { transaction: t });

    await t.commit();

    if (req.io) {
      req.io.emit('stockUpdated');
      req.io.emit('returnProcessed', salesReturn);
    }

    const fullReturn = await SalesReturn.findByPk(salesReturn.id, {
      include: [
        { model: Sale },
        { model: Customer },
        { model: SalesReturnItem, include: [Jewellery] }
      ]
    });

    res.status(201).json(fullReturn);
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Server error processing return', error: error.message });
  }
});

// Delete single return
router.delete('/:id', authenticate, requireRole(['ADMIN', 'OWNER', 'SELLER']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const sr = await SalesReturn.findByPk(req.params.id, { transaction: t });
    if (!sr) {
      await t.rollback();
      return res.status(404).json({ message: 'Return not found' });
    }

    const retInv = sr.return_invoice_no || '#' + sr.id;
    await SalesReturnItem.destroy({ where: { return_id: sr.id }, transaction: t });
    await sr.destroy({ transaction: t });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_SALES_RETURN',
      module: 'RETURNS',
      details: `Deleted return ${retInv}`
    }, { transaction: t });

    await t.commit();
    res.json({ success: true, message: `Return ${retInv} deleted successfully.` });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Server error deleting return', error: error.message });
  }
});

// Bulk Delete returns
router.post('/bulk-delete', authenticate, requireRole(['ADMIN', 'OWNER', 'SELLER']), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'No returns selected' });
  }

  const t = await sequelize.transaction();
  try {
    await SalesReturnItem.destroy({ where: { return_id: { [Op.in]: ids } }, transaction: t });
    const deletedCount = await SalesReturn.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'BULK_DELETE_RETURNS',
      module: 'RETURNS',
      details: `Bulk deleted ${deletedCount} returns`
    }, { transaction: t });

    await t.commit();
    res.json({ success: true, deletedCount, message: `${deletedCount} return(s) deleted successfully.` });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Server error in bulk deleting returns', error: error.message });
  }
});

module.exports = router;
