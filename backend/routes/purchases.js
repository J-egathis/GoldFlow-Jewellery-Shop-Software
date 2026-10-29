const express = require('express');
const router = express.Router();
const { sequelize, Purchase, PurchaseItem, Supplier, Jewellery, AuditLog } = require('../models');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

// Get all purchases with supplier and items
router.get('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const purchases = await Purchase.findAll({
      include: [
        { model: Supplier },
        { model: PurchaseItem, include: [Jewellery] }
      ],
      order: [['date', 'DESC'], ['createdAt', 'DESC']]
    });
    res.json(purchases);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create Purchase (Atomic: Increases Inventory stock or creates new jewellery, updates supplier balance)
router.post('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      supplier_id,
      purchase_invoice_no,
      date,
      items,
      paid_amount = 0,
      notes
    } = req.body;

    if (!supplier_id || !purchase_invoice_no || !items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Supplier, invoice number and at least one item are required' });
    }

    const supplier = await Supplier.findByPk(supplier_id, { transaction: t });
    if (!supplier) {
      await t.rollback();
      return res.status(404).json({ message: 'Supplier not found' });
    }

    let totalAmount = 0;
    for (const item of items) {
      totalAmount += (parseFloat(item.purchase_cost) || 0) * (parseInt(item.quantity) || 1);
    }

    const paidAmt = parseFloat(paid_amount) || 0;
    const paymentStatus = paidAmt >= totalAmount ? 'PAID' : (paidAmt > 0 ? 'PARTIALLY_PAID' : 'PENDING');

    const purchase = await Purchase.create({
      supplier_id,
      purchase_invoice_no,
      date: date || new Date(),
      total_amount: totalAmount,
      paid_amount: paidAmt,
      payment_status: paymentStatus,
      notes: notes || '',
      created_by: req.user.id
    }, { transaction: t });

    for (const item of items) {
      const qty = parseInt(item.quantity) || 1;
      const cost = parseFloat(item.purchase_cost) || 0;
      const grossWt = parseFloat(item.gross_weight || item.weight || 0);
      const stoneWt = parseFloat(item.stone_weight || 0);
      const netWt = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, grossWt - stoneWt);

      let jewelleryId = item.jewellery_id;

      // If jewellery_id provided, update existing jewellery stock
      if (jewelleryId) {
        const existingJew = await Jewellery.findByPk(jewelleryId, { transaction: t, lock: t.LOCK.UPDATE });
        if (existingJew) {
          existingJew.stock += qty;
          existingJew.purchase_cost = cost;
          if (existingJew.stock > 0 && existingJew.status === 'OUT_OF_STOCK') {
            existingJew.status = 'AVAILABLE';
          }
          await existingJew.save({ transaction: t });
        }
      } else {
        // Create new jewellery item automatically if requested
        const randomCode = `JW-${Date.now().toString().slice(-5)}`;
        const barcode = `GFJ${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
        const newJew = await Jewellery.create({
          code: item.code || randomCode,
          barcode: item.barcode || barcode,
          name: item.name || `${item.purity || '22K'} ${item.metal || 'Gold'} Item`,
          category: item.category || 'Gold Jewellery',
          metal: item.metal || 'Gold',
          purity: item.purity || '22K',
          weight: grossWt,
          gross_weight: grossWt,
          stone_weight: stoneWt,
          net_weight: netWt,
          making_charge: parseFloat(item.making_charge || 12),
          making_charge_type: 'PERCENTAGE',
          wastage_percent: parseFloat(item.wastage_percent || 2),
          stone_charge: parseFloat(item.stone_charge || 0),
          purchase_cost: cost,
          base_price: cost,
          selling_price: parseFloat(item.selling_price || (cost * 1.15)),
          stock: qty,
          min_stock: 1,
          supplier_id: supplier.id,
          status: 'AVAILABLE'
        }, { transaction: t });
        jewelleryId = newJew.id;
      }

      await PurchaseItem.create({
        purchase_id: purchase.id,
        jewellery_id: jewelleryId,
        metal: item.metal || 'Gold',
        purity: item.purity || '22K',
        gross_weight: grossWt,
        stone_weight: stoneWt,
        net_weight: netWt,
        rate: parseFloat(item.rate) || 0,
        making_charge: parseFloat(item.making_charge) || 0,
        purchase_cost: cost,
        quantity: qty
      }, { transaction: t });
    }

    // Update supplier total purchases and balance
    supplier.total_purchases = (supplier.total_purchases || 0) + totalAmount;
    const unpaid = Math.max(0, totalAmount - paidAmt);
    supplier.outstanding_balance = (supplier.outstanding_balance || 0) + unpaid;
    await supplier.save({ transaction: t });

    // Audit Log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_PURCHASE',
      module: 'PURCHASE',
      details: `Created Purchase #${purchase_invoice_no} from ${supplier.name}. Total: ₹${totalAmount}`
    }, { transaction: t });

    await t.commit();

    if (req.io) {
      req.io.emit('stockUpdated');
      req.io.emit('purchaseCreated', purchase);
    }

    const fullPurchase = await Purchase.findByPk(purchase.id, {
      include: [
        { model: Supplier },
        { model: PurchaseItem, include: [Jewellery] }
      ]
    });

    res.status(201).json(fullPurchase);
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Server error creating purchase', error: error.message });
  }
});

module.exports = router;
