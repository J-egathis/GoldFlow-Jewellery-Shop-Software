const express = require('express');
const router = express.Router();
const { 
  sequelize, 
  Sale, 
  SaleItem, 
  DiscountRequest, 
  Customer, 
  Jewellery, 
  AuditLog, 
  Notification, 
  User, 
  Payment,
  Setting,
  GoldRate,
  SalesReturn,
  GoldExchange
} = require('../models');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { calculateSaleTotals } = require('../utils/pricingEngine');
const { generateNextInvoiceNumber, generateNextEstimateNumber } = require('../utils/invoiceGenerator');
const { getLanServerUrl } = require('../utils/networkUtils');
const { Op } = require('sequelize');

// Get Sales
router.get('/', authenticate, async (req, res) => {
  try {
    const filters = {};
    if (req.user.role === 'SELLER') {
      filters.seller_id = req.user.id;
    }
    if (req.query.status) {
      filters.status = req.query.status;
    }
    
    const sales = await Sale.findAll({
      where: filters,
      include: [
        { model: Customer },
        { model: SaleItem, include: [Jewellery] },
        { model: User, as: 'Seller', attributes: ['id', 'name', 'username'] },
        { model: Payment },
        { model: DiscountRequest }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get Pending Discount Requests (OWNER and ADMIN)
router.get('/discounts', authenticate, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const reqs = await DiscountRequest.findAll({
      where: { status: 'PENDING' },
      include: [
        { model: Sale, include: [Customer, { model: SaleItem, include: [Jewellery] }] },
        { model: User, as: 'Seller', attributes: ['id', 'name', 'username'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(reqs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get Single Sale by ID or Invoice Number
router.get('/:id', authenticate, async (req, res, next) => {
  if (req.params.id === 'discounts') return next();
  try {
    const id = req.params.id;
    const isNum = !isNaN(id);
    const where = isNum ? { [Op.or]: [{ id }, { invoice_no: id }] } : { invoice_no: id };

    const sale = await Sale.findOne({
      where,
      include: [
        { model: Customer },
        { model: SaleItem, include: [Jewellery] },
        { model: User, as: 'Seller', attributes: ['id', 'name', 'username'] },
        { model: Payment },
        { model: DiscountRequest }
      ]
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (req.user.role === 'SELLER' && sale.seller_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(sale);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create Sale (POS Billing - Direct or Discount Request)
router.post('/', authenticate, requireRole(['SELLER', 'ADMIN', 'OWNER', 'CASHIER']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { 
      customer_id, 
      customer_name, 
      customer_phone, 
      customer_address,
      items, 
      requested_discount_percent = 0,
      payment_method = 'CASH',
      payments = [], // Array for split payments: [{ method: 'CASH', amount: 5000 }, { method: 'UPI', amount: 3000 }]
      notes
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Cart cannot be empty' });
    }

    // 1. Manage Customer
    let customerObj = null;
    if (customer_id) {
      customerObj = await Customer.findByPk(customer_id, { transaction: t });
    }
    if (!customerObj) {
      const cName = customer_name ? customer_name.trim() : 'Walk-in Customer';
      const cPhone = customer_phone ? customer_phone.trim() : 'N/A';
      
      // Look up by phone if provided and not N/A
      if (cPhone !== 'N/A') {
        customerObj = await Customer.findOne({ where: { phone: cPhone }, transaction: t });
      }

      if (!customerObj) {
        customerObj = await Customer.create({
          name: cName,
          phone: cPhone,
          address: customer_address || ''
        }, { transaction: t });
      }
    }

    // 2. Fetch Latest Gold Rates & Tax Settings
    const latestRates = {};
    const rates = await GoldRate.findAll({ order: [['createdAt', 'DESC']] });
    for (const r of rates) {
      if (!latestRates[r.purity]) latestRates[r.purity] = r.rate_per_gram;
    }

    const gstSetting = await Setting.findOne({ where: { key: 'tax_gst_percent' } });
    const taxPercent = (gstSetting && !isNaN(parseFloat(gstSetting.value))) ? parseFloat(gstSetting.value) : 3;

    // 3. Process Cart Items & Validate Stock
    const processedItems = [];
    for (const item of items) {
      const jew = await Jewellery.findByPk(item.jewellery_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!jew) {
        await t.rollback();
        return res.status(404).json({ message: `Jewellery item #${item.jewellery_id} not found` });
      }

      const reqQty = parseInt(item.quantity) || 1;
      if (jew.stock < reqQty) {
        await t.rollback();
        return res.status(400).json({ 
          message: `Insufficient stock for ${jew.name} (${jew.code}). Requested: ${reqQty}, Available: ${jew.stock}` 
        });
      }

      const purity = item.purity || jew.purity || '22K';
      const pricingMode = item.pricing_mode || ((item.selling_price > 0 && (!item.net_weight || parseFloat(item.net_weight) <= 0)) ? 'FIXED_PRICE' : 'WEIGHT_RATE');
      const goldRate = item.gold_rate != null ? parseFloat(item.gold_rate) : (latestRates[purity] || 7000);
      const sellPrice = item.selling_price != null ? parseFloat(item.selling_price) : (jew.selling_price || 0);
      const grossWt = item.gross_weight != null ? parseFloat(item.gross_weight) : (jew.gross_weight || jew.weight || 1);
      const stoneWt = item.stone_weight != null ? parseFloat(item.stone_weight) : (jew.stone_weight || 0);
      const netWt = item.net_weight != null ? parseFloat(item.net_weight) : Math.max(0, grossWt - stoneWt);
      const mc = item.making_charge != null ? parseFloat(item.making_charge) : (jew.making_charge || 0);
      const mcType = item.making_charge_type || jew.making_charge_type || 'PERCENTAGE';
      const wastagePct = item.wastage_percent != null ? parseFloat(item.wastage_percent) : (jew.wastage_percent || 0);
      const stoneChg = item.stone_charge != null ? parseFloat(item.stone_charge) : (jew.stone_charge || 0);
      const otherChg = item.other_charges != null ? parseFloat(item.other_charges) : (jew.other_charges || 0);
      const itemDisc = item.discount_percent != null ? parseFloat(item.discount_percent) : (parseFloat(requested_discount_percent) || 0);

      processedItems.push({
        jewellery_id: jew.id,
        jewellery_obj: jew,
        quantity: reqQty,
        gross_weight: grossWt,
        stone_weight: stoneWt,
        net_weight: netWt,
        purity,
        pricing_mode: pricingMode,
        selling_price: sellPrice,
        gold_rate: goldRate,
        making_charge: mc,
        making_charge_type: mcType,
        wastage_percent: wastagePct,
        stone_charge: stoneChg,
        other_charges: otherChg,
        discount_percent: itemDisc
      });
    }

    // 4. Calculate Totals via Calculation Engine
    const calculation = calculateSaleTotals(processedItems, requested_discount_percent, taxPercent, true);

    // 5. Generate Safe Sequential Invoice Number
    const invoiceNo = await generateNextInvoiceNumber(t);

    const isSeller = req.user.role === 'SELLER';
    const isDiscountRequested = isSeller || (parseFloat(requested_discount_percent) > 0 && req.user.role !== 'OWNER' && req.user.role !== 'ADMIN');
    const initialStatus = isDiscountRequested ? 'PENDING_APPROVAL' : 'COMPLETED';

    // 6. Handle Payments (Split or Single)
    let totalPaid = 0;
    let primaryPaymentMethod = payment_method || 'CASH';
    const paymentRecords = [];

    if (!isDiscountRequested) {
      if (payments && Array.isArray(payments) && payments.length > 0) {
        primaryPaymentMethod = 'SPLIT';
        for (const p of payments) {
          const amt = parseFloat(p.amount) || 0;
          if (amt > 0) {
            totalPaid += amt;
            paymentRecords.push({
              amount: amt,
              payment_method: p.method || 'CASH',
              reference_no: p.ref || '',
              status: 'SUCCESS'
            });
          }
        }
      } else {
        totalPaid = calculation.final_amount;
        paymentRecords.push({
          amount: totalPaid,
          payment_method: primaryPaymentMethod,
          status: 'SUCCESS'
        });
      }
    }

    const balanceAmount = Math.max(0, calculation.final_amount - totalPaid);
    const paymentStatus = isDiscountRequested ? 'PENDING' : (balanceAmount <= 0 ? 'PAID' : (totalPaid > 0 ? 'PARTIALLY_PAID' : 'PENDING'));

    // 7. Create Sale Record
    const sale = await Sale.create({
      invoice_no: invoiceNo,
      seller_id: req.user.id,
      customer_id: customerObj.id,
      total_amount: calculation.gross_amount,
      gross_amount: calculation.gross_amount,
      discount_amount: calculation.discount_amount,
      tax_amount: calculation.tax_amount,
      tax_percent: taxPercent,
      round_off: calculation.round_off,
      final_amount: calculation.final_amount,
      paid_amount: totalPaid,
      balance_amount: balanceAmount,
      status: initialStatus,
      payment_status: paymentStatus,
      payment_method: primaryPaymentMethod,
      notes: notes || ''
    }, { transaction: t });

    // 8. Create Sale Items
    for (const item of calculation.items) {
      await SaleItem.create({
        sale_id: sale.id,
        jewellery_id: item.jewellery_id,
        quantity: item.quantity,
        gross_weight: item.gross_weight,
        stone_weight: item.stone_weight,
        net_weight: item.net_weight,
        purity: item.purity,
        gold_rate: item.gold_rate,
        gold_value: item.gold_value,
        making_charge: item.making_charge,
        wastage_amount: item.wastage_amount,
        stone_charge: item.stone_charge,
        other_charges: item.other_charges,
        discount_amount: item.discount_amount,
        tax_amount: item.tax_amount,
        price: item.gross_amount,
        final_amount: item.final_amount
      }, { transaction: t });
    }

    // 9. If Completed immediately, record payments and deduct inventory atomically
    const stockAlerts = [];
    if (!isDiscountRequested) {
      for (const pr of paymentRecords) {
        await Payment.create({
          sale_id: sale.id,
          customer_id: customerObj.id,
          amount: pr.amount,
          payment_method: pr.payment_method,
          reference_no: pr.reference_no,
          status: 'SUCCESS',
          recorded_by: req.user.id
        }, { transaction: t });
      }

      // Deduct stock
      for (const item of processedItems) {
        const jew = item.jewellery_obj;
        jew.stock = Math.max(0, jew.stock - item.quantity);
        if (jew.stock <= 0) {
          jew.status = 'OUT_OF_STOCK';
          stockAlerts.push({ item: jew.name, code: jew.code, status: 'OUT_OF_STOCK', stock: 0 });
        } else if (jew.stock <= jew.min_stock) {
          jew.status = 'LOW_STOCK';
          stockAlerts.push({ item: jew.name, code: jew.code, status: 'LOW_STOCK', stock: jew.stock });
        }
        await jew.save({ transaction: t });
      }

      // Update customer total purchases & outstanding
      customerObj.total_purchases = (customerObj.total_purchases || 0) + calculation.final_amount;
      if (sale.balance_amount > 0) {
        customerObj.outstanding_balance = (customerObj.outstanding_balance || 0) + sale.balance_amount;
      }
      await customerObj.save({ transaction: t });

      // Audit Log
      await AuditLog.create({
        user_id: req.user.id,
        action: 'CREATE_SALE',
        module: 'SALES',
        details: `Completed Sale ${invoiceNo} (#${sale.id}) for ${customerObj.name}. Total: ₹${calculation.final_amount} via ${primaryPaymentMethod}`
      }, { transaction: t });
    } else {
      // 10. Discount Request Flow
      const discountReq = await DiscountRequest.create({
        sale_id: sale.id,
        seller_id: req.user.id,
        requested_discount_percent: parseFloat(requested_discount_percent) || 0,
        status: 'PENDING',
        reason: notes || (isSeller 
          ? (parseFloat(requested_discount_percent) > 0 
              ? `Seller discount request (${requested_discount_percent}%) for Owner approval` 
              : 'Seller submitted order for Owner billing') 
          : 'Customer requested counter discount')
      }, { transaction: t });

      await Notification.create({
        type: 'DISCOUNT_REQUEST',
        message: isSeller 
          ? (parseFloat(requested_discount_percent) > 0 
              ? `Seller ${req.user.name} requested ${requested_discount_percent}% discount for ${invoiceNo}`
              : `Seller ${req.user.name} submitted order ${invoiceNo} for Owner billing`)
          : `Discount of ${requested_discount_percent}% requested by ${req.user.name} for ${invoiceNo}`,
        metadata: JSON.stringify({ sale_id: sale.id, req_id: discountReq.id, invoice_no: invoiceNo })
      }, { transaction: t });
    }

    await t.commit();

    // 11. Real-time Sockets
    if (req.io) {
      if (isDiscountRequested) {
        req.io.to('OWNER').emit('discountRequested', {
          sale_id: sale.id,
          invoice_no: invoiceNo,
          seller: req.user.name,
          customer: customerObj.name,
          total_amount: calculation.gross_amount,
          requested_discount_percent: parseFloat(requested_discount_percent)
        });
      } else {
        req.io.emit('stockUpdated');
        req.io.emit('newSale', { id: sale.id, invoice_no: invoiceNo, final_amount: sale.final_amount });
        for (const alert of stockAlerts) {
          req.io.emit('lowStock', alert);
        }
      }
    }

    // Fetch full created sale with associations
    const fullSale = await Sale.findByPk(sale.id, {
      include: [
        { model: Customer },
        { model: SaleItem, include: [Jewellery] },
        { model: User, as: 'Seller', attributes: ['id', 'name', 'username'] },
        { model: Payment },
        { model: DiscountRequest }
      ]
    });

    res.status(201).json(fullSale);
  } catch (error) {
    await t.rollback();
    console.error('POS Sale Error:', error);
    res.status(500).json({ message: 'Server error during billing', error: error.message });
  }
});



// Approve/Reject/Modify Discount (OWNER only)
router.put('/discounts/:id', authenticate, requireRole(['OWNER']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { status, modified_discount_percent, complete_bill, payment_method = 'CASH' } = req.body;
    const dReq = await DiscountRequest.findByPk(req.params.id, {
      include: [{ model: Sale, include: [{ model: SaleItem, include: [Jewellery] }, Customer] }],
      transaction: t
    });

    if (!dReq) {
      await t.rollback();
      return res.status(404).json({ message: 'Discount request not found' });
    }

    dReq.status = status;
    if (status === 'MODIFIED') {
      dReq.modified_discount_percent = parseFloat(modified_discount_percent) || 0;
    }
    await dReq.save({ transaction: t });

    const final_discount_percent = status === 'MODIFIED' 
      ? (parseFloat(modified_discount_percent) || 0)
      : (status === 'APPROVED' ? dReq.requested_discount_percent : 0);

    const sale = dReq.Sale;

    if (status === 'APPROVED' || status === 'MODIFIED') {
      const gross = sale.gross_amount || sale.total_amount;
      const discountAmount = Math.round((gross * (final_discount_percent / 100)) * 100) / 100;
      const taxable = Math.max(0, gross - discountAmount);
      const taxRate = sale.tax_percent != null && !isNaN(parseFloat(sale.tax_percent)) ? parseFloat(sale.tax_percent) : 3;
      const taxAmount = Math.round((taxable * (taxRate / 100)) * 100) / 100;
      const rawFinal = taxable + taxAmount;
      const rounded = Math.round(rawFinal);
      const roundOff = Math.round((rounded - rawFinal) * 100) / 100;

      sale.discount_amount = discountAmount;
      sale.tax_amount = taxAmount;
      sale.round_off = roundOff;
      sale.final_amount = rounded;

      if (complete_bill) {
        sale.status = 'COMPLETED';
        sale.paid_amount = rounded;
        sale.balance_amount = 0;
        sale.payment_status = 'PAID';
        sale.payment_method = payment_method;

        // Deduct inventory
        for (const item of (sale.SaleItems || [])) {
          const jew = item.Jewellery || await Jewellery.findByPk(item.jewellery_id, { transaction: t, lock: t.LOCK.UPDATE });
          if (jew) {
            jew.stock = Math.max(0, jew.stock - item.quantity);
            if (jew.stock <= 0) jew.status = 'OUT_OF_STOCK';
            else if (jew.stock <= jew.min_stock) jew.status = 'LOW_STOCK';
            await jew.save({ transaction: t });
          }
        }

        // Record Payment
        await Payment.create({
          sale_id: sale.id,
          customer_id: sale.customer_id,
          amount: rounded,
          payment_method,
          status: 'SUCCESS',
          recorded_by: req.user.id
        }, { transaction: t });

        // Update customer total purchases
        if (sale.Customer) {
          sale.Customer.total_purchases = (sale.Customer.total_purchases || 0) + rounded;
          await sale.Customer.save({ transaction: t });
        }
      } else {
        sale.status = status; // APPROVED or MODIFIED
      }
      await sale.save({ transaction: t });
    } else {
      sale.status = 'REJECTED';
      await sale.save({ transaction: t });
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: complete_bill ? 'DISCOUNT_APPROVED_AND_BILLED' : `DISCOUNT_${status}`,
      module: 'SALES',
      details: `Owner ${status} (${final_discount_percent}%) ${complete_bill ? 'and completed bill ' : ''}for Sale ${sale.invoice_no || '#' + sale.id}`
    }, { transaction: t });

    await t.commit();

    // Notify seller via Socket
    if (req.io) {
      req.io.to(dReq.seller_id.toString()).emit(`discount${status.charAt(0) + status.slice(1).toLowerCase()}`, {
        sale_id: dReq.sale_id,
        invoice_no: sale.invoice_no,
        status: sale.status,
        discount_percent: final_discount_percent,
        final_amount: sale.final_amount,
        completed: !!complete_bill
      });
      req.io.emit('salesUpdated');
      req.io.emit('billApprovedForCashier', {
        sale_id: sale.id,
        invoice_no: sale.invoice_no,
        discount_percent: final_discount_percent,
        discount_amount: sale.discount_amount,
        final_amount: sale.final_amount,
        customer_name: sale.Customer ? sale.Customer.name : 'Walk-in Customer',
        approved_by: req.user.name
      });
      if (complete_bill) req.io.emit('newSale');
    }

    res.json({ message: `Discount ${status} successfully`, sale, sale_id: sale.id, invoice_no: sale.invoice_no, completed: !!complete_bill });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create and Save an Official Estimate / Quotation with QR code
router.post('/estimate', authenticate, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { items, customer, totals, notes, requested_discount_percent = 0, tax_percent } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'At least one item is required for estimate' });
    }

    // Customer
    let customerObj = null;
    if (customer && customer.id) {
      customerObj = await Customer.findByPk(customer.id, { transaction: t });
    }
    if (!customerObj && customer && customer.phone) {
      customerObj = await Customer.findOne({ where: { phone: customer.phone }, transaction: t });
    }
    if (!customerObj) {
      customerObj = await Customer.create({
        name: (customer && customer.name) ? customer.name : 'Walk-in Customer',
        phone: (customer && customer.phone) ? customer.phone : 'Counter Sale',
        address: (customer && customer.address) ? customer.address : ''
      }, { transaction: t });
    }

    // Generate Safe Sequential Estimate Number
    const year = new Date().getFullYear();
    let estInvoiceNo = await generateNextEstimateNumber(t);
    while (await Sale.findOne({ where: { invoice_no: estInvoiceNo }, transaction: t })) {
      const match = estInvoiceNo.match(/(\d+)$/);
      const nextVal = (match ? parseInt(match[1], 10) : 0) + 1;
      estInvoiceNo = `GF-EST-${year}-${String(nextVal).padStart(6, '0')}`;
    }

    let computedItemsGross = 0;
    if (Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        const gross = parseFloat(it.gross_weight || it.weight || 0);
        const stone = parseFloat(it.stone_weight || 0);
        const net = parseFloat(it.net_weight || Math.max(0, gross - stone));
        const rate = parseFloat(it.gold_rate || 7000);
        const qty = parseInt(it.quantity || 1);
        const gVal = it.gold_value != null ? parseFloat(it.gold_value) : Math.round(net * rate * qty);
        let wVal = parseFloat(it.wastage_amount || 0);
        if (!wVal && it.wastage_percent) {
          wVal = Math.round(gVal * ((parseFloat(it.wastage_percent) || 0) / 100));
        }
        let mVal = parseFloat(it.making_charge || 0);
        if (it.making_charge_type === 'PERCENTAGE' && it.gold_value == null) {
          mVal = Math.round(gVal * (mVal / 100));
        } else if (it.making_charge_type === 'PER_GRAM' && it.gold_value == null) {
          mVal = Math.round(net * mVal * qty);
        }
        const sVal = Math.round(parseFloat(it.stone_charge) || 0);
        const oVal = Math.round(parseFloat(it.other_charges) || 0);
        computedItemsGross += (it.line_total != null ? parseFloat(it.line_total) : (gVal + wVal + mVal + sVal + oVal));
      }
    }
    const grossAmt = computedItemsGross > 0 ? computedItemsGross : parseFloat(totals?.grossAmount || 0);
    const discAmt = parseFloat(totals?.discountTotal || 0);
    const taxAmt = parseFloat(totals?.taxAmount || 0);
    const finalAmt = parseFloat(totals?.finalPayable || (grossAmt - discAmt + taxAmt));
    const roundOff = parseFloat(totals?.roundOff || 0);
    const taxRate = tax_percent != null ? parseFloat(tax_percent) : 3;

    const sale = await Sale.create({
      invoice_no: estInvoiceNo,
      seller_id: req.user.id,
      customer_id: customerObj.id,
      total_amount: grossAmt,
      gross_amount: grossAmt,
      discount_amount: discAmt,
      discount_percent: parseFloat(requested_discount_percent) || 0,
      tax_amount: taxAmt,
      tax_percent: taxRate,
      round_off: roundOff,
      final_amount: finalAmt,
      paid_amount: 0,
      balance_amount: finalAmt,
      status: 'PENDING_APPROVAL',
      payment_status: 'PENDING',
      payment_method: 'CASH',
      notes: notes || 'POS Estimate Quotation'
    }, { transaction: t });

    // Save items
    for (const it of items) {
      const gross = parseFloat(it.gross_weight || it.weight || 0);
      const stone = parseFloat(it.stone_weight || 0);
      const net = parseFloat(it.net_weight || Math.max(0, gross - stone));
      const rate = parseFloat(it.gold_rate || 7000);
      const qty = parseInt(it.quantity || 1);
      const gVal = it.gold_value != null ? parseFloat(it.gold_value) : Math.round(net * rate * qty);
      let wVal = parseFloat(it.wastage_amount || 0);
      if (!wVal && it.wastage_percent) {
        wVal = Math.round(gVal * ((parseFloat(it.wastage_percent) || 0) / 100));
      }
      let mVal = parseFloat(it.making_charge || 0);
      if (it.making_charge_type === 'PERCENTAGE' && it.gold_value == null) {
        mVal = Math.round(gVal * (mVal / 100));
      } else if (it.making_charge_type === 'PER_GRAM' && it.gold_value == null) {
        mVal = Math.round(net * mVal * qty);
      }
      const sVal = Math.round(parseFloat(it.stone_charge) || 0);
      const oVal = Math.round(parseFloat(it.other_charges) || 0);
      const lineTotal = it.line_total != null ? parseFloat(it.line_total) : (gVal + wVal + mVal + sVal + oVal);

      await SaleItem.create({
        sale_id: sale.id,
        jewellery_id: it.jewellery_id || it.id || null,
        quantity: qty,
        gross_weight: gross,
        stone_weight: stone,
        net_weight: net,
        purity: it.purity || '22K',
        gold_rate: rate,
        gold_value: gVal,
        making_charge: mVal,
        wastage_amount: wVal,
        stone_charge: sVal,
        other_charges: oVal,
        price: lineTotal,
        final_amount: lineTotal
      }, { transaction: t });
    }

    await t.commit();

    // Generate high-resolution DataURL QR code server-side with reachable LAN URL
    const QRCode = require('qrcode');
    const baseUrl = getLanServerUrl(req);
    const qrUrl = `${baseUrl}/view-estimate.html?code=${encodeURIComponent(estInvoiceNo)}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 280, margin: 1 });
    const qrSvg = await QRCode.toString(qrUrl, { type: 'svg', margin: 1 });

    res.json({
      success: true,
      id: sale.id,
      invoice_no: estInvoiceNo,
      final_amount: finalAmt,
      qrDataUrl,
      qrSvg
    });
  } catch (error) {
    await t.rollback();
    console.error('Error creating estimate:', error);
    res.status(500).json({ message: 'Error creating estimate', error: error.message });
  }
});

// Public endpoint for mobile phone QR scanning without authentication
router.get('/public-estimate/:code', async (req, res) => {
  try {
    let rawCode = req.params.code.trim();
    if (rawCode.includes('code=')) {
      const match = rawCode.match(/code=([^&]+)/);
      if (match) rawCode = decodeURIComponent(match[1]);
    }

    const isPureNumber = /^\d+$/.test(rawCode);
    let sale = await Sale.findOne({
      where: isPureNumber 
        ? { [Op.or]: [{ id: parseInt(rawCode, 10) }, { invoice_no: rawCode }] } 
        : { [Op.or]: [{ invoice_no: rawCode }, { invoice_no: { [Op.like]: `%${rawCode}%` } }] },
      include: [
        { model: Customer, attributes: ['name', 'phone'] },
        { model: SaleItem, include: [{ model: Jewellery, attributes: ['name', 'code', 'category', 'image_url'] }] },
        { model: User, as: 'Seller', attributes: ['name'] },
        { model: DiscountRequest }
      ]
    });

    // Fallback: If still not found and rawCode was a fallback (e.g. GF-EST-XXXXXX), find latest pending estimate
    if (!sale && (rawCode.startsWith('GF-EST-') || isPureNumber)) {
      sale = await Sale.findOne({
        where: {
          invoice_no: { [Op.like]: '%EST%' },
          status: 'PENDING_APPROVAL'
        },
        order: [['createdAt', 'DESC']],
        include: [
          { model: Customer, attributes: ['name', 'phone'] },
          { model: SaleItem, include: [{ model: Jewellery, attributes: ['name', 'code', 'category', 'image_url'] }] },
          { model: User, as: 'Seller', attributes: ['name'] },
          { model: DiscountRequest }
        ]
      });
    }

    if (!sale) {
      return res.status(404).json({ message: 'Estimate not found' });
    }

    res.json(sale);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving estimate', error: error.message });
  }
});

// Public Mobile Owner Discount Update via QR Page
router.post('/public-estimate/:code/owner-discount', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    let rawCode = req.params.code.trim();
    if (rawCode.includes('code=')) {
      const match = rawCode.match(/code=([^&]+)/);
      if (match) rawCode = decodeURIComponent(match[1]);
    }

    const { discount_percent, discount_amount, owner_pin, reason } = req.body;

    // Verify Owner PIN or token
    const validPins = ['1234', '9999', 'admin', 'owner', 'password123'];
    let isAuthorized = false;
    let approvedByName = 'Shop Owner';

    // 1. Check Owner PIN against default list or Owner user passwords
    if (owner_pin && validPins.includes(String(owner_pin).trim())) {
      isAuthorized = true;
    } else if (owner_pin) {
      const bcrypt = require('bcryptjs');
      const owners = await User.findAll({ where: { role: ['OWNER', 'ADMIN'] } });
      for (const o of owners) {
        if (await bcrypt.compare(String(owner_pin).trim(), o.password_hash)) {
          isAuthorized = true;
          approvedByName = o.name;
          break;
        }
      }
    }

    // 2. Or check Authorization Bearer Token if present
    if (!isAuthorized && req.headers.authorization) {
      try {
        const jwt = require('jsonwebtoken');
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'goldflow_secret_key_123');
        if (decoded && (decoded.role === 'OWNER' || decoded.role === 'ADMIN')) {
          isAuthorized = true;
          approvedByName = decoded.name;
        }
      } catch(e) {}
    }

    if (!isAuthorized) {
      await t.rollback();
      return res.status(403).json({ message: 'Invalid Owner PIN. (Default PIN: 1234)' });
    }

    const isPureNumber = /^\d+$/.test(rawCode);
    let sale = await Sale.findOne({
      where: isPureNumber 
        ? { [Op.or]: [{ id: parseInt(rawCode, 10) }, { invoice_no: rawCode }] } 
        : { [Op.or]: [{ invoice_no: rawCode }, { invoice_no: { [Op.like]: `%${rawCode}%` } }] },
      include: [
        { model: SaleItem, include: [Jewellery] },
        { model: Customer },
        { model: DiscountRequest },
        { model: User, as: 'Seller' }
      ],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!sale && (rawCode.startsWith('GF-EST-') || isPureNumber)) {
      sale = await Sale.findOne({
        where: {
          invoice_no: { [Op.like]: '%EST%' },
          status: 'PENDING_APPROVAL'
        },
        order: [['createdAt', 'DESC']],
        include: [
          { model: SaleItem, include: [Jewellery] },
          { model: Customer },
          { model: DiscountRequest },
          { model: User, as: 'Seller' }
        ],
        transaction: t,
        lock: t.LOCK.UPDATE
      });
    }

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ message: 'Estimate bill not found' });
    }

    // 🔒 QR Code Expiry Check: once owner discount is set, or if sale is completed/cancelled, the QR token expires
    if (sale.status === 'APPROVED' || sale.status === 'MODIFIED') {
      await t.rollback();
      return res.status(400).json({
        message: '⚠️ This QR Code is expired! Owner discount has already been applied and locked for this estimate.',
        expired: true,
        already_approved: true,
        status: sale.status,
        discount_amount: sale.discount_amount,
        discount_percent: sale.discount_percent,
        final_amount: sale.final_amount
      });
    }

    if (sale.status === 'COMPLETED') {
      await t.rollback();
      return res.status(400).json({
        message: '🔒 This QR Code is expired! The official Tax Invoice has already been completed and paid.',
        expired: true,
        completed: true,
        status: sale.status
      });
    }

    if (sale.status === 'CANCELLED') {
      await t.rollback();
      return res.status(400).json({
        message: '❌ This QR Code is expired! This estimate has been cancelled.',
        expired: true,
        status: sale.status
      });
    }

    const gross = parseFloat(sale.gross_amount || sale.total_amount || 0);
    let discAmt = 0;
    let discPct = 0;

    if (discount_amount != null && !isNaN(parseFloat(discount_amount))) {
      discAmt = Math.min(gross, Math.max(0, parseFloat(discount_amount)));
      discPct = gross > 0 ? Math.round((discAmt / gross) * 1000) / 10 : 0;
    } else if (discount_percent != null && !isNaN(parseFloat(discount_percent))) {
      discPct = Math.min(100, Math.max(0, parseFloat(discount_percent)));
      discAmt = Math.round((gross * (discPct / 100)) * 100) / 100;
    }

    const taxable = Math.max(0, gross - discAmt);
    const hasTax = (sale.tax_amount != null && parseFloat(sale.tax_amount) > 0);
    const taxRate = hasTax ? (sale.tax_percent != null && !isNaN(parseFloat(sale.tax_percent)) ? parseFloat(sale.tax_percent) : 3) : 0;
    const taxAmount = Math.round((taxable * (taxRate / 100)) * 100) / 100;
    const rawFinal = taxable + taxAmount;
    const rounded = Math.round(rawFinal);
    const roundOff = Math.round((rounded - rawFinal) * 100) / 100;

    sale.discount_amount = discAmt;
    sale.discount_percent = discPct;
    sale.tax_amount = taxAmount;
    sale.round_off = roundOff;
    sale.final_amount = rounded;
    sale.status = 'APPROVED';

    let dReq = sale.DiscountRequest;
    if (!dReq) {
      dReq = await DiscountRequest.create({
        sale_id: sale.id,
        seller_id: sale.seller_id,
        requested_discount_percent: discPct,
        modified_discount_percent: discPct,
        status: 'APPROVED',
        reason: reason || 'Owner Discount via Mobile QR'
      }, { transaction: t });
    } else {
      dReq.modified_discount_percent = discPct;
      dReq.status = 'APPROVED';
      if (reason) dReq.reason = reason;
      await dReq.save({ transaction: t });
    }

    if (reason) sale.notes = reason;
    await sale.save({ transaction: t });

    await AuditLog.create({
      user_id: sale.seller_id || 1,
      action: 'OWNER_MOBILE_QR_DISCOUNT_APPLIED',
      module: 'SALES',
      details: `${approvedByName} approved ₹${discAmt} (${discPct}%) discount on ${sale.invoice_no || '#' + sale.id}`
    }, { transaction: t });

    await t.commit();

    // Broadcast Real-time Sockets to Seller & Cashier
    if (req.io) {
      if (sale.seller_id) {
        req.io.to(sale.seller_id.toString()).emit('discountApproved', {
          sale_id: sale.id,
          invoice_no: sale.invoice_no,
          status: sale.status,
          discount_amount: discAmt,
          discount_percent: discPct,
          final_amount: sale.final_amount,
          approved_by: approvedByName
        });
      }

      req.io.emit('discountApproved', {
        sale_id: sale.id,
        invoice_no: sale.invoice_no,
        status: sale.status,
        discount_amount: discAmt,
        discount_percent: discPct,
        final_amount: sale.final_amount,
        approved_by: approvedByName
      });

      req.io.emit('billApprovedForCashier', {
        sale_id: sale.id,
        invoice_no: sale.invoice_no,
        customer_name: sale.Customer ? sale.Customer.name : 'Walk-in Customer',
        discount_amount: discAmt,
        discount_percent: discPct,
        final_amount: sale.final_amount,
        approved_by: approvedByName
      });

      req.io.emit('salesUpdated');
    }

    res.json({
      success: true,
      message: `Discount ₹${discAmt.toLocaleString('en-IN')} (${discPct}%) successfully approved and synced to Seller and Cashier!`,
      sale: {
        id: sale.id,
        invoice_no: sale.invoice_no,
        status: sale.status,
        discount_amount: discAmt,
        discount_percent: discPct,
        final_amount: rounded,
        tax_amount: taxAmount
      }
    });
  } catch (error) {
    await t.rollback();
    console.error('Error applying owner discount via public mobile:', error);
    res.status(500).json({ message: 'Error applying discount', error: error.message });
  }
});

// Lookup Sale/Estimate by Code or ID (for QR Scanner)
router.get('/find-by-code/:code', authenticate, async (req, res) => {
  try {
    let rawCode = req.params.code.trim();
    if (rawCode.includes('code=')) {
      const match = rawCode.match(/code=([^&]+)/);
      if (match) rawCode = decodeURIComponent(match[1]);
    }

    const isPureNumber = /^\d+$/.test(rawCode);
    let sale = await Sale.findOne({
      where: isPureNumber ? { [Op.or]: [{ id: parseInt(rawCode, 10) }, { invoice_no: rawCode }] } : { invoice_no: rawCode },
      include: [
        { model: Customer },
        { model: SaleItem, include: [Jewellery] },
        { model: User, as: 'Seller', attributes: ['id', 'name', 'username'] },
        { model: Payment },
        { model: DiscountRequest }
      ]
    });

    if (!sale) {
      return res.status(404).json({ message: `Bill/Estimate with code '${rawCode}' not found` });
    }

    res.json(sale);
  } catch (error) {
    res.status(500).json({ message: 'Error finding bill', error: error.message });
  }
});

// Generate QR Code for Sale or Estimate
router.get('/:id/qr', authenticate, async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const sale = await Sale.findByPk(req.params.id);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });

    const qrText = sale.invoice_no || `GF-BILL-${sale.id}`;
    const svg = await QRCode.toString(qrText, { type: 'svg', margin: 1 });
    const dataUrl = await QRCode.toDataURL(qrText, { width: 220, margin: 1 });

    res.json({ id: sale.id, invoice_no: sale.invoice_no, qrText, svg, dataUrl });
  } catch (error) {
    res.status(500).json({ message: 'Error generating QR code', error: error.message });
  }
});

// Direct Owner Discount Update via QR Scan (Owner & Admin only)
router.post('/:id/owner-discount', authenticate, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { discount_percent, discount_amount, reason, complete_bill, payment_method = 'CASH' } = req.body;
    const sale = await Sale.findByPk(req.params.id, {
      include: [
        { model: SaleItem, include: [Jewellery] },
        { model: Customer },
        { model: DiscountRequest }
      ],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ message: 'Sale not found' });
    }

    const gross = sale.gross_amount || sale.total_amount || 0;
    let discAmt = 0;
    let discPct = 0;

    if (discount_amount != null && !isNaN(parseFloat(discount_amount))) {
      discAmt = Math.min(gross, Math.max(0, parseFloat(discount_amount)));
      discPct = gross > 0 ? Math.round((discAmt / gross) * 1000) / 10 : 0;
    } else if (discount_percent != null && !isNaN(parseFloat(discount_percent))) {
      discPct = Math.min(100, Math.max(0, parseFloat(discount_percent)));
      discAmt = Math.round((gross * (discPct / 100)) * 100) / 100;
    }

    const taxable = Math.max(0, gross - discAmt);
    const taxRate = sale.tax_percent != null && !isNaN(parseFloat(sale.tax_percent)) ? parseFloat(sale.tax_percent) : 3;
    const taxAmount = Math.round((taxable * (taxRate / 100)) * 100) / 100;
    const rawFinal = taxable + taxAmount;
    const rounded = Math.round(rawFinal);
    const roundOff = Math.round((rounded - rawFinal) * 100) / 100;

    sale.discount_amount = discAmt;
    sale.tax_amount = taxAmount;
    sale.round_off = roundOff;
    sale.final_amount = rounded;

    // Create or update DiscountRequest record
    let dReq = sale.DiscountRequest;
    if (!dReq) {
      dReq = await DiscountRequest.create({
        sale_id: sale.id,
        seller_id: sale.seller_id,
        requested_discount_percent: discPct,
        modified_discount_percent: discPct,
        status: 'APPROVED',
        reason: reason || 'Owner QR Discount Approval'
      }, { transaction: t });
    } else {
      dReq.modified_discount_percent = discPct;
      dReq.status = 'APPROVED';
      await dReq.save({ transaction: t });
    }

    if (complete_bill) {
      sale.status = 'COMPLETED';
      sale.paid_amount = rounded;
      sale.balance_amount = 0;
      sale.payment_status = 'PAID';
      sale.payment_method = payment_method;

      // Deduct inventory
      for (const item of (sale.SaleItems || [])) {
        const jew = item.Jewellery || await Jewellery.findByPk(item.jewellery_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (jew) {
          jew.stock = Math.max(0, jew.stock - item.quantity);
          if (jew.stock <= 0) jew.status = 'OUT_OF_STOCK';
          else if (jew.stock <= jew.min_stock) jew.status = 'LOW_STOCK';
          await jew.save({ transaction: t });
        }
      }

      await Payment.create({
        sale_id: sale.id,
        customer_id: sale.customer_id,
        amount: rounded,
        payment_method,
        status: 'SUCCESS',
        recorded_by: req.user.id
      }, { transaction: t });

      if (sale.Customer) {
        sale.Customer.total_purchases = (sale.Customer.total_purchases || 0) + rounded;
        await sale.Customer.save({ transaction: t });
      }
    } else {
      sale.status = 'APPROVED';
    }

    await sale.save({ transaction: t });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'OWNER_QR_DISCOUNT_APPLIED',
      module: 'SALES',
      details: `Owner approved ₹${discAmt} (${discPct}%) discount on ${sale.invoice_no || '#' + sale.id}`
    }, { transaction: t });

    await t.commit();

    // Broadcast Real-time Sockets to Seller & Cashier
    if (req.io) {
      // 1. Notify the Seller
      if (sale.seller_id) {
        req.io.to(sale.seller_id.toString()).emit('discountApproved', {
          sale_id: sale.id,
          invoice_no: sale.invoice_no,
          status: sale.status,
          discount_amount: discAmt,
          discount_percent: discPct,
          final_amount: sale.final_amount,
          approved_by: req.user.name,
          completed: !!complete_bill
        });
      }

      // 2. Broadcast to Cashier (and Cash Desks)
      req.io.emit('billApprovedForCashier', {
        sale_id: sale.id,
        invoice_no: sale.invoice_no,
        customer_name: sale.Customer ? sale.Customer.name : 'Walk-in Customer',
        discount_amount: discAmt,
        discount_percent: discPct,
        final_amount: sale.final_amount,
        approved_by: req.user.name,
        completed: !!complete_bill
      });

      // 3. Notify all dashboards to refresh tables
      req.io.emit('salesUpdated');
      if (complete_bill) req.io.emit('newSale');
    }

    res.json({
      message: 'Discount applied and synced to Cashier & Seller successfully',
      sale_id: sale.id,
      invoice_no: sale.invoice_no,
      final_amount: sale.final_amount,
      discount_amount: discAmt,
      discount_percent: discPct,
      status: sale.status
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Server error applying discount', error: error.message });
  }
});

// Complete Sale (After discount approval - ADMIN and OWNER only)
router.post('/:id/complete', authenticate, requireRole(['ADMIN', 'OWNER', 'CASHIER']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { payment_method = 'CASH', payments = [] } = req.body;
    const sale = await Sale.findByPk(req.params.id, { 
      include: [SaleItem, Customer],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ message: 'Sale not found' });
    }
    if (sale.status !== 'APPROVED' && sale.status !== 'MODIFIED') {
      await t.rollback();
      return res.status(400).json({ message: `Sale cannot be completed in '${sale.status}' status` });
    }

    // Process payments
    let totalPaid = 0;
    let primaryMethod = payment_method;

    if (payments && Array.isArray(payments) && payments.length > 0) {
      primaryMethod = 'SPLIT';
      for (const p of payments) {
        const amt = parseFloat(p.amount) || 0;
        if (amt > 0) {
          totalPaid += amt;
          await Payment.create({
            sale_id: sale.id,
            customer_id: sale.customer_id,
            amount: amt,
            payment_method: p.method || 'CASH',
            reference_no: p.ref || '',
            status: 'SUCCESS',
            recorded_by: req.user.id
          }, { transaction: t });
        }
      }
    } else {
      totalPaid = sale.final_amount;
      await Payment.create({
        sale_id: sale.id,
        customer_id: sale.customer_id,
        amount: totalPaid,
        payment_method: primaryMethod,
        status: 'SUCCESS',
        recorded_by: req.user.id
      }, { transaction: t });
    }

    const balanceAmount = Math.max(0, sale.final_amount - totalPaid);
    sale.paid_amount = totalPaid;
    sale.balance_amount = balanceAmount;
    sale.payment_status = balanceAmount <= 0 ? 'PAID' : (totalPaid > 0 ? 'PARTIALLY_PAID' : 'PENDING');
    sale.payment_method = primaryMethod;
    sale.status = 'COMPLETED';
    await sale.save({ transaction: t });

    // Deduct stock atomically
    const stockAlerts = [];
    for (const item of sale.SaleItems) {
      const jew = await Jewellery.findByPk(item.jewellery_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (jew) {
        const qty = item.quantity || 1;
        jew.stock = Math.max(0, jew.stock - qty);
        if (jew.stock <= 0) {
          jew.status = 'OUT_OF_STOCK';
          stockAlerts.push({ item: jew.name, code: jew.code, status: 'OUT_OF_STOCK', stock: 0 });
        } else if (jew.stock <= jew.min_stock) {
          jew.status = 'LOW_STOCK';
          stockAlerts.push({ item: jew.name, code: jew.code, status: 'LOW_STOCK', stock: jew.stock });
        }
        await jew.save({ transaction: t });
      }
    }

    // Update customer stats
    if (sale.Customer) {
      sale.Customer.total_purchases = (sale.Customer.total_purchases || 0) + sale.final_amount;
      if (balanceAmount > 0) {
        sale.Customer.outstanding_balance = (sale.Customer.outstanding_balance || 0) + balanceAmount;
      }
      await sale.Customer.save({ transaction: t });
    }

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'COMPLETE_APPROVED_SALE',
      module: 'SALES',
      details: `Completed approved Sale ${sale.invoice_no || '#' + sale.id}. Paid: ₹${totalPaid}`
    }, { transaction: t });

    await t.commit();

    if (req.io) {
      req.io.emit('stockUpdated');
      req.io.emit('newSale', sale);
      for (const alert of stockAlerts) {
        req.io.emit('lowStock', alert);
      }
    }

    res.json(sale);
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Server error completing sale', error: error.message });
  }
});

// Cancel Sale (Safe cancellation - never delete completed invoices)
router.post('/:id/cancel', authenticate, requireRole(['SELLER', 'ADMIN', 'OWNER', 'CASHIER']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(req.params.id, { 
      include: [SaleItem, Customer],
      transaction: t,
      lock: t.LOCK.UPDATE 
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ message: 'Sale not found' });
    }

    // A seller can only cancel their own sale, and only if not completed (or if allowed)
    if (req.user.role === 'SELLER' && sale.seller_id !== req.user.id) {
      await t.rollback();
      return res.status(403).json({ message: 'Not authorized to cancel this sale' });
    }

    if (sale.status === 'CANCELLED') {
      await t.rollback();
      return res.status(400).json({ message: 'Sale is already cancelled' });
    }

    // If sale was completed, restore stock
    if (sale.status === 'COMPLETED') {
      if (req.user.role === 'SELLER') {
        await t.rollback();
        return res.status(403).json({ message: 'Sellers cannot cancel completed invoices. Please request Cashier/Owner/Admin.' });
      }

      for (const item of (sale.SaleItems || [])) {
        if (!item.jewellery_id) continue;
        const jew = await Jewellery.findByPk(item.jewellery_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (jew) {
          jew.stock += (item.quantity || 1);
          if (jew.stock > jew.min_stock) jew.status = 'AVAILABLE';
          else if (jew.stock > 0) jew.status = 'LOW_STOCK';
          await jew.save({ transaction: t });
        }
      }

      // Reverse customer purchases
      if (sale.Customer) {
        sale.Customer.total_purchases = Math.max(0, (sale.Customer.total_purchases || 0) - sale.final_amount);
        if (sale.balance_amount > 0) {
          sale.Customer.outstanding_balance = Math.max(0, (sale.Customer.outstanding_balance || 0) - sale.balance_amount);
        }
        await sale.Customer.save({ transaction: t });
      }
    }

    sale.status = 'CANCELLED';
    await sale.save({ transaction: t });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CANCEL_SALE',
      module: 'SALES',
      details: `Cancelled Sale ${sale.invoice_no || '#' + sale.id} by ${req.user.role}`
    }, { transaction: t });

    await t.commit();

    if (req.io) {
      req.io.emit('stockUpdated');
      req.io.emit('salesUpdated', { 
        saleId: sale.id, 
        invoice_no: sale.invoice_no || '#' + sale.id,
        status: 'CANCELLED',
        cancelledBy: req.user.role 
      });
    }

    res.json({ message: 'Sale cancelled successfully and inventory stock restored', sale });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Re-request Discount
router.post('/:id/rediscount', authenticate, requireRole(['SELLER']), async (req, res) => {
  try {
    const sale = await Sale.findByPk(req.params.id);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });

    const dReq = await DiscountRequest.findOne({ where: { sale_id: sale.id } });
    if (!dReq) return res.status(404).json({ message: 'Discount request not found' });

    sale.status = 'PENDING_APPROVAL';
    await sale.save();

    dReq.status = 'PENDING';
    await dReq.save();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'REDISCOUNT_REQUESTED',
      module: 'SALES',
      details: `Requested Rediscount for Sale ${sale.invoice_no || '#' + sale.id}`
    });

    if (req.io) {
      req.io.to('OWNER').emit('discountRequested', {
        id: dReq.id,
        sale_id: sale.id,
        invoice_no: sale.invoice_no,
        seller: req.user.name,
        total_amount: sale.total_amount,
        requested_discount_percent: dReq.requested_discount_percent
      });
      req.io.emit('salesUpdated');
    }

    res.json({ message: 'Rediscount requested successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete single sale / estimate
router.delete('/:id', authenticate, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(req.params.id, {
      include: [SaleItem],
      transaction: t
    });
    if (!sale) {
      await t.rollback();
      return res.status(404).json({ message: 'Sale not found' });
    }

    const invoiceNo = sale.invoice_no || `#${sale.id}`;

    // If sale was completed and had stock deducted, restore stock
    if (sale.status === 'COMPLETED' && sale.SaleItems) {
      for (const item of sale.SaleItems) {
        if (item.jewellery_id) {
          const jew = await Jewellery.findByPk(item.jewellery_id, { transaction: t });
          if (jew) {
            const restoredStock = (jew.stock || 0) + (item.quantity || 1);
            let newStatus = 'AVAILABLE';
            if (restoredStock <= 0) newStatus = 'OUT_OF_STOCK';
            else if (restoredStock <= (jew.min_stock || 1)) newStatus = 'LOW_STOCK';
            await jew.update({ stock: restoredStock, status: newStatus }, { transaction: t });
          }
        }
      }
    }

    // Delete associated relations
    await Payment.destroy({ where: { sale_id: sale.id }, transaction: t });
    await DiscountRequest.destroy({ where: { sale_id: sale.id }, transaction: t });
    await SalesReturn.destroy({ where: { sale_id: sale.id }, transaction: t });
    await GoldExchange.destroy({ where: { sale_id: sale.id }, transaction: t });
    await SaleItem.destroy({ where: { sale_id: sale.id }, transaction: t });
    await sale.destroy({ transaction: t });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_SALE',
      module: 'SALES',
      details: `Deleted Sale/Invoice ${invoiceNo}`
    }, { transaction: t });

    await t.commit();

    if (req.io) {
      req.io.emit('stockUpdated');
      req.io.emit('salesUpdated');
      req.io.emit('newSale');
    }

    res.json({ success: true, message: `Invoice ${invoiceNo} deleted successfully.` });
  } catch (error) {
    await t.rollback();
    console.error('Delete sale error:', error);
    res.status(500).json({ message: 'Server error deleting sale', error: error.message });
  }
});

// Bulk Delete sales / estimates
router.post('/bulk-delete', authenticate, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'No sales selected' });
  }

  const t = await sequelize.transaction();
  try {
    const sales = await Sale.findAll({
      where: { id: { [Op.in]: ids } },
      include: [SaleItem],
      transaction: t
    });

    for (const sale of sales) {
      if (sale.status === 'COMPLETED' && sale.SaleItems) {
        for (const item of sale.SaleItems) {
          if (item.jewellery_id) {
            const jew = await Jewellery.findByPk(item.jewellery_id, { transaction: t });
            if (jew) {
              const restoredStock = (jew.stock || 0) + (item.quantity || 1);
              let newStatus = 'AVAILABLE';
              if (restoredStock <= 0) newStatus = 'OUT_OF_STOCK';
              else if (restoredStock <= (jew.min_stock || 1)) newStatus = 'LOW_STOCK';
              await jew.update({ stock: restoredStock, status: newStatus }, { transaction: t });
            }
          }
        }
      }
    }

    await Payment.destroy({ where: { sale_id: { [Op.in]: ids } }, transaction: t });
    await DiscountRequest.destroy({ where: { sale_id: { [Op.in]: ids } }, transaction: t });
    await SalesReturn.destroy({ where: { sale_id: { [Op.in]: ids } }, transaction: t });
    await GoldExchange.destroy({ where: { sale_id: { [Op.in]: ids } }, transaction: t });
    await SaleItem.destroy({ where: { sale_id: { [Op.in]: ids } }, transaction: t });
    const deletedCount = await Sale.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'BULK_DELETE_SALES',
      module: 'SALES',
      details: `Bulk deleted ${deletedCount} sales/invoices`
    }, { transaction: t });

    await t.commit();

    if (req.io) {
      req.io.emit('stockUpdated');
      req.io.emit('salesUpdated');
      req.io.emit('newSale');
    }

    res.json({ success: true, deletedCount, message: `${deletedCount} invoice(s) deleted successfully.` });
  } catch (error) {
    await t.rollback();
    console.error('Bulk delete sales error:', error);
    res.status(500).json({ message: 'Server error in bulk deleting sales', error: error.message });
  }
});

module.exports = router;
