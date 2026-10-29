const express = require('express');
const router = express.Router();
const { Jewellery, AuditLog, Supplier, Notification } = require('../models');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// Get all jewellery with filtering, search & pagination
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, category, metal, purity, search } = req.query;
    const filters = {};

    if (status) filters.status = status;
    if (category) filters.category = category;
    if (metal) filters.metal = metal;
    if (purity) filters.purity = purity;

    if (search) {
      const q = `%${search.trim()}%`;
      filters[Op.or] = [
        { code: { [Op.like]: q } },
        { barcode: { [Op.like]: q } },
        { name: { [Op.like]: q } },
        { category: { [Op.like]: q } },
        { subcategory: { [Op.like]: q } }
      ];
    }

    const items = await Jewellery.findAll({
      where: filters,
      include: [{ model: Supplier, attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']]
    });

    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Fast barcode lookup for scanner
router.get('/barcode/:barcode', authenticate, async (req, res) => {
  try {
    const rawBarcode = req.params.barcode ? req.params.barcode.trim() : '';
    const clean = rawBarcode.replace(/[\x00-\x1F\x7F]/g, '').trim();

    let item = await Jewellery.findOne({
      where: {
        [Op.or]: [
          { barcode: clean },
          { code: clean }
        ]
      },
      include: [{ model: Supplier, attributes: ['id', 'name'] }]
    });

    if (!item) {
      // Fallback: search with LIKE
      item = await Jewellery.findOne({
        where: {
          [Op.or]: [
            { barcode: { [Op.like]: `%${clean}%` } },
            { code: { [Op.like]: `%${clean}%` } },
            { name: { [Op.like]: `%${clean}%` } }
          ]
        },
        include: [{ model: Supplier, attributes: ['id', 'name'] }]
      });
    }

    if (!item && !isNaN(clean)) {
      item = await Jewellery.findByPk(parseInt(clean), {
        include: [{ model: Supplier, attributes: ['id', 'name'] }]
      });
    }

    if (!item) {
      return res.status(404).json({ message: `Jewellery with barcode/code '${clean}' not found` });
    }

    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Generate QR Code for Jewellery Item
router.get('/:id/qr', authenticate, async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const item = await Jewellery.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: 'Jewellery item not found' });

    const qrText = item.code || item.barcode || `GFJ${String(item.id).padStart(5, '0')}`;
    const svg = await QRCode.toString(qrText, { type: 'svg', margin: 1 });
    const dataUrl = await QRCode.toDataURL(qrText, { width: 220, margin: 1 });

    res.json({ id: item.id, code: item.code, barcode: item.barcode, qrText, svg, dataUrl });
  } catch (error) {
    res.status(500).json({ message: 'Error generating QR code', error: error.message });
  }
});

// Add new jewellery (Admin and Owner only)
router.post('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const data = { ...req.body };

    // Auto-calculate net weight if not passed
    const gross = parseFloat(data.gross_weight || data.weight || 0);
    const stone = parseFloat(data.stone_weight || 0);
    data.gross_weight = gross;
    data.weight = gross;
    data.stone_weight = stone;
    data.net_weight = data.net_weight ? parseFloat(data.net_weight) : Math.max(0, gross - stone);

    // Auto-generate barcode if not provided
    if (!data.barcode) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      data.barcode = `GFJ${Date.now().toString().slice(-6)}${randomSuffix}`;
    }

    // Set initial status based on stock
    const stockQty = parseInt(data.stock) || 0;
    const minStock = parseInt(data.min_stock) || 1;
    if (stockQty <= 0) {
      data.status = 'OUT_OF_STOCK';
    } else if (stockQty <= minStock) {
      data.status = 'LOW_STOCK';
    } else {
      data.status = data.status || 'AVAILABLE';
    }

    const newItem = await Jewellery.create(data);

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'ADD_JEWELLERY',
      module: 'JEWELLERY',
      details: `Added ${newItem.name} (${newItem.code}) - Net Wt: ${newItem.net_weight}g, Stock: ${newItem.stock}`,
      new_value: JSON.stringify(newItem)
    });

    // Real-time broadcast
    if (req.io) {
      req.io.emit('newJewellery', newItem);
      req.io.emit('stockUpdated');
    }

    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update jewellery
router.put('/:id', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const item = await Jewellery.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: 'Jewellery not found' });

    const prevVal = JSON.stringify(item);
    const data = { ...req.body };

    if (data.gross_weight != null || data.stone_weight != null) {
      const gross = parseFloat(data.gross_weight ?? item.gross_weight ?? item.weight ?? 0);
      const stone = parseFloat(data.stone_weight ?? item.stone_weight ?? 0);
      data.gross_weight = gross;
      data.weight = gross;
      data.stone_weight = stone;
      if (data.net_weight == null) {
        data.net_weight = Math.max(0, gross - stone);
      }
    }

    // Recalculate status based on stock
    if (data.stock != null) {
      const s = parseInt(data.stock);
      const minS = parseInt(data.min_stock != null ? data.min_stock : item.min_stock);
      if (s <= 0) data.status = 'OUT_OF_STOCK';
      else if (s <= minS) data.status = 'LOW_STOCK';
      else if (item.status === 'OUT_OF_STOCK' || item.status === 'LOW_STOCK') data.status = 'AVAILABLE';
    }

    await item.update(data);

    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_JEWELLERY',
      module: 'JEWELLERY',
      details: `Updated ${item.name} (${item.code})`,
      previous_value: prevVal,
      new_value: JSON.stringify(item)
    });

    if (req.io) {
      req.io.emit('jewelleryUpdated', item);
      req.io.emit('stockUpdated');
    }

    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Stock adjustment
router.post('/:id/stock-adjust', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { adjustment, reason } = req.body;
    const adj = parseInt(adjustment) || 0;
    const item = await Jewellery.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: 'Jewellery not found' });

    const oldStock = item.stock;
    const newStock = Math.max(0, oldStock + adj);
    item.stock = newStock;

    if (newStock <= 0) {
      item.status = 'OUT_OF_STOCK';
    } else if (newStock <= item.min_stock) {
      item.status = 'LOW_STOCK';
    } else {
      item.status = 'AVAILABLE';
    }

    await item.save();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'STOCK_ADJUSTMENT',
      module: 'INVENTORY',
      details: `Stock for ${item.name} adjusted by ${adj > 0 ? '+' + adj : adj} (${oldStock} -> ${newStock}). Reason: ${reason || 'Manual Adjustment'}`
    });

    if (req.io) {
      req.io.emit('stockUpdated', { id: item.id, stock: newStock, status: item.status });
      if (item.status === 'LOW_STOCK' || item.status === 'OUT_OF_STOCK') {
        req.io.emit('lowStock', { item: item.name, stock: newStock, status: item.status });
      }
    }

    res.json({ message: 'Stock adjusted successfully', item });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk Delete jewellery (Admin and Owner)
router.post('/bulk-delete', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No item IDs provided for bulk deletion' });
    }

    let deletedCount = 0;
    let archivedCount = 0;
    const deletedNames = [];

    for (const id of ids) {
      const item = await Jewellery.findByPk(id);
      if (!item) continue;

      deletedNames.push(`${item.name} (${item.code})`);
      try {
        await item.destroy();
        deletedCount++;
      } catch (err) {
        // Foreign key constraint fallback: mark inactive so historical sales invoices stay intact
        await item.update({ status: 'INACTIVE', stock: 0 });
        archivedCount++;
      }
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'BULK_DELETE_JEWELLERY',
      module: 'JEWELLERY',
      details: `Bulk deleted ${deletedCount} item(s), archived ${archivedCount} item(s) (linked to transactions). Items: ${deletedNames.slice(0, 10).join(', ')}${deletedNames.length > 10 ? '...' : ''}`
    });

    if (req.io) {
      req.io.emit('jewelleryDeleted', ids);
      req.io.emit('stockUpdated');
    }

    let msg = `Successfully deleted ${deletedCount} jewellery item(s).`;
    if (archivedCount > 0) {
      msg += ` ${archivedCount} item(s) with sales history were marked as Inactive.`;
    }

    res.json({ message: msg, deletedCount, archivedCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error during bulk delete', error: error.message });
  }
});

// Delete single jewellery (Admin and Owner)
router.delete('/:id', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const item = await Jewellery.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: 'Jewellery not found' });

    const itemName = item.name;
    const itemCode = item.code;

    try {
      await item.destroy();
      await AuditLog.create({
        user_id: req.user.id,
        action: 'DELETE_JEWELLERY',
        module: 'JEWELLERY',
        details: `Deleted ${itemName} (${itemCode})`
      });

      if (req.io) {
        req.io.emit('jewelleryDeleted', req.params.id);
        req.io.emit('stockUpdated');
      }

      res.json({ message: `Jewellery "${itemName}" deleted successfully.` });
    } catch (err) {
      // If item is referenced by sales or purchases, mark inactive safely
      await item.update({ status: 'INACTIVE', stock: 0 });

      await AuditLog.create({
        user_id: req.user.id,
        action: 'ARCHIVE_JEWELLERY',
        module: 'JEWELLERY',
        details: `Archived/marked inactive ${itemName} (${itemCode}) due to linked sales history.`
      });

      if (req.io) {
        req.io.emit('jewelleryUpdated', item);
        req.io.emit('stockUpdated');
      }

      res.json({ message: `Jewellery "${itemName}" has linked sales history. It has been marked as Inactive and removed from active stock.` });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk Delete jewellery
router.post('/bulk-delete', authenticate, requireRole(['ADMIN', 'OWNER', 'SELLER']), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No jewellery items selected' });
    }

    let deletedCount = 0;
    for (const id of ids) {
      const item = await Jewellery.findByPk(id);
      if (item) {
        try {
          await item.destroy();
          deletedCount++;
        } catch (e) {
          await item.update({ status: 'INACTIVE', stock: 0 });
          deletedCount++;
        }
      }
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'BULK_DELETE_JEWELLERY',
      module: 'JEWELLERY',
      details: `Bulk deleted ${deletedCount} jewellery items`
    });

    if (req.io) {
      req.io.emit('stockUpdated');
    }

    res.json({ success: true, deletedCount, message: `${deletedCount} jewellery item(s) deleted.` });
  } catch (error) {
    console.error('Bulk delete jewellery error:', error);
    res.status(500).json({ message: 'Server error in bulk deleting jewellery', error: error.message });
  }
});

module.exports = router;
