const express = require('express');
const router = express.Router();
const { 
  Sale, 
  SaleItem, 
  Jewellery, 
  User, 
  Customer, 
  Supplier, 
  Purchase, 
  PurchaseItem, 
  SalesReturn, 
  GoldExchange, 
  Expense, 
  Payment,
  sequelize 
} = require('../models');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// Comprehensive Reporting Endpoint
router.get('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { 
      type = 'sales', 
      range, 
      startDate: qStart, 
      endDate: qEnd, 
      seller_id, 
      category, 
      payment_method 
    } = req.query;

    let startDate = new Date(2020, 0, 1);
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (qStart && qEnd) {
      startDate = new Date(qStart);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(qEnd);
      endDate.setHours(23, 59, 59, 999);
    } else if (range === 'today') {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    } else if (range === 'week') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (range === 'month') {
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (range === 'year') {
      startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
      startDate.setHours(0, 0, 0, 0);
    }

    // 1. SALES REPORT
    if (type === 'sales') {
      const whereSale = {
        status: 'COMPLETED',
        createdAt: { [Op.between]: [startDate, endDate] }
      };
      if (seller_id) whereSale.seller_id = seller_id;
      if (payment_method) whereSale.payment_method = payment_method;

      const sales = await Sale.findAll({
        where: whereSale,
        include: [
          { model: Customer, attributes: ['name', 'phone'] },
          { model: User, as: 'Seller', attributes: ['name'] },
          { model: SaleItem, include: [Jewellery] },
          { model: Payment }
        ],
        order: [['createdAt', 'DESC']]
      });

      const totalRevenue = sales.reduce((acc, s) => acc + s.final_amount, 0);
      const totalDiscount = sales.reduce((acc, s) => acc + (s.discount_amount || 0), 0);
      const totalTax = sales.reduce((acc, s) => acc + (s.tax_amount || 0), 0);
      const totalOutstanding = sales.reduce((acc, s) => acc + (s.balance_amount || 0), 0);

      return res.json({
        type: 'sales',
        summary: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalDiscount: Math.round(totalDiscount * 100) / 100,
          totalTax: Math.round(totalTax * 100) / 100,
          totalOutstanding: Math.round(totalOutstanding * 100) / 100,
          orderCount: sales.length
        },
        data: sales
      });
    }

    // 2. SELLER PERFORMANCE REPORT
    if (type === 'seller_performance') {
      const sellers = await User.findAll({ where: { role: 'SELLER' } });
      const sellerStats = [];

      for (const s of sellers) {
        const sales = await Sale.findAll({
          where: {
            seller_id: s.id,
            status: 'COMPLETED',
            createdAt: { [Op.between]: [startDate, endDate] }
          }
        });

        const rev = sales.reduce((acc, row) => acc + row.final_amount, 0);
        const disc = sales.reduce((acc, row) => acc + (row.discount_amount || 0), 0);
        const avg = sales.length > 0 ? Math.round(rev / sales.length) : 0;

        sellerStats.push({
          seller_id: s.id,
          name: s.name,
          username: s.username,
          billCount: sales.length,
          revenue: rev,
          totalDiscount: disc,
          averageBillValue: avg,
          target: 500000,
          achievementPct: Math.min(100, Math.round((rev / 500000) * 100))
        });
      }

      return res.json({
        type: 'seller_performance',
        data: sellerStats
      });
    }

    // 3. PROFIT & MARGIN REPORT
    if (type === 'profit') {
      const saleItems = await SaleItem.findAll({
        include: [
          { model: Jewellery },
          { 
            model: Sale, 
            where: { status: 'COMPLETED', createdAt: { [Op.between]: [startDate, endDate] } } 
          }
        ]
      });

      let totalSelling = 0;
      let totalPurchaseCost = 0;
      const breakdown = [];

      for (const si of saleItems) {
        const jew = si.Jewellery || {};
        const sellPrice = si.final_amount || si.price || 0;
        const purchaseCost = (jew.purchase_cost || (sellPrice * 0.85)) * (si.quantity || 1);
        const profit = sellPrice - purchaseCost;
        const marginPct = sellPrice > 0 ? Math.round((profit / sellPrice) * 10000) / 100 : 0;

        totalSelling += sellPrice;
        totalPurchaseCost += purchaseCost;

        breakdown.push({
          id: si.id,
          jewellery_name: jew.name || 'Custom Jewellery',
          code: jew.code || '-',
          quantity: si.quantity || 1,
          selling_price: sellPrice,
          purchase_cost: purchaseCost,
          profit,
          margin_percent: marginPct,
          date: si.Sale ? si.Sale.createdAt : null
        });
      }

      const grossProfit = totalSelling - totalPurchaseCost;
      const overallMargin = totalSelling > 0 ? Math.round((grossProfit / totalSelling) * 10000) / 100 : 0;

      return res.json({
        type: 'profit',
        summary: {
          totalRevenue: Math.round(totalSelling * 100) / 100,
          totalPurchaseCost: Math.round(totalPurchaseCost * 100) / 100,
          grossProfit: Math.round(grossProfit * 100) / 100,
          overallMargin
        },
        data: breakdown
      });
    }

    // 4. STOCK & VALUATION REPORT
    if (type === 'stock') {
      const items = await Jewellery.findAll({
        include: [{ model: Supplier, attributes: ['name'] }],
        order: [['stock', 'ASC']]
      });

      let totalStockCount = 0;
      let totalStockValue = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      items.forEach(i => {
        totalStockCount += (i.stock || 0);
        totalStockValue += (i.stock || 0) * (i.selling_price || 0);
        if (i.stock <= 0) outOfStockCount++;
        else if (i.stock <= i.min_stock) lowStockCount++;
      });

      return res.json({
        type: 'stock',
        summary: {
          totalItems: items.length,
          totalStockCount,
          totalStockValue: Math.round(totalStockValue * 100) / 100,
          lowStockCount,
          outOfStockCount
        },
        data: items
      });
    }

    // 5. EXPENSE REPORT
    if (type === 'expense') {
      const expenses = await Expense.findAll({
        where: { date: { [Op.between]: [startDate, endDate] } },
        order: [['date', 'DESC']]
      });

      const total = expenses.reduce((acc, e) => acc + e.amount, 0);

      // Group by category
      const byCategory = {};
      expenses.forEach(e => {
        byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      });

      return res.json({
        type: 'expense',
        summary: {
          totalExpense: Math.round(total * 100) / 100,
          byCategory
        },
        data: expenses
      });
    }

    // 6. PURCHASES REPORT
    if (type === 'purchase') {
      const purchases = await Purchase.findAll({
        where: { date: { [Op.between]: [startDate, endDate] } },
        include: [{ model: Supplier }, { model: PurchaseItem, include: [Jewellery] }],
        order: [['date', 'DESC']]
      });
      const totalPurchasesAmount = purchases.reduce((acc, p) => acc + p.total_amount, 0);

      return res.json({
        type: 'purchase',
        summary: {
          totalPurchasesAmount: Math.round(totalPurchasesAmount * 100) / 100,
          count: purchases.length
        },
        data: purchases
      });
    }

    // 7. RETURNS & EXCHANGES REPORT
    if (type === 'returns') {
      const returns = await SalesReturn.findAll({
        where: { createdAt: { [Op.between]: [startDate, endDate] } },
        include: [{ model: Customer }, { model: Sale }]
      });
      const exchanges = await GoldExchange.findAll({
        where: { createdAt: { [Op.between]: [startDate, endDate] } },
        include: [{ model: Customer }]
      });

      const totalRefunds = returns.reduce((acc, r) => acc + r.total_refund_amount, 0);

      return res.json({
        type: 'returns',
        summary: {
          returnCount: returns.length,
          exchangeCount: exchanges.length,
          totalRefunds: Math.round(totalRefunds * 100) / 100
        },
        returns,
        exchanges
      });
    }

    // Default fallback
    res.json({ message: 'Select report type' });
  } catch (error) {
    res.status(500).json({ message: 'Server error generating report', error: error.message });
  }
});

module.exports = router;
