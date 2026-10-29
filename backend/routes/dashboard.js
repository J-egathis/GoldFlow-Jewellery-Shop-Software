const express = require('express');
const router = express.Router();
const { 
  sequelize, 
  Sale, 
  SaleItem, 
  Jewellery, 
  User, 
  DiscountRequest, 
  Customer, 
  AuditLog,
  Purchase,
  Payment,
  Supplier,
  SalesReturn,
  GoldExchange,
  Expense
} = require('../models');
const { authenticate } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

router.get('/stats', authenticate, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Common Counts & Stock Metrics
    const totalJewellery = await Jewellery.count();
    const availableStock = await Jewellery.sum('stock', { where: { status: 'AVAILABLE' } }) || 0;
    const lowStock = await Jewellery.count({ where: { status: 'LOW_STOCK' } });
    const outOfStock = await Jewellery.count({ where: { status: 'OUT_OF_STOCK' } });
    const activeSellersCount = await User.count({ where: { role: 'SELLER' } });

    // Stock Value Calculation
    const allJewellery = await Jewellery.findAll({ attributes: ['stock', 'selling_price', 'category'] });
    const totalStockValue = allJewellery.reduce((acc, j) => acc + ((j.stock || 0) * (j.selling_price || 0)), 0);

    // Category Distribution
    const categoriesMap = {};
    allJewellery.forEach(j => {
      categoriesMap[j.category] = (categoriesMap[j.category] || 0) + (j.stock || 0);
    });
    const categoryDistribution = {
      labels: Object.keys(categoriesMap),
      data: Object.values(categoriesMap)
    };

    // Stock Status Breakdown
    const stockStatus = {
      labels: ['Available', 'Low Stock', 'Out of Stock'],
      data: [availableStock, lowStock, outOfStock]
    };

    // Today's Sales
    const todaySalesRows = await Sale.findAll({
      where: {
        status: 'COMPLETED',
        createdAt: { [Op.gte]: today }
      }
    });
    const todaySalesRevenue = todaySalesRows.reduce((sum, s) => sum + s.final_amount, 0);
    const todaySalesCount = todaySalesRows.length;

    // Monthly Sales
    const monthlySalesRows = await Sale.findAll({
      where: {
        status: 'COMPLETED',
        createdAt: { [Op.gte]: startOfMonth }
      }
    });
    const monthlySalesRevenue = monthlySalesRows.reduce((sum, s) => sum + s.final_amount, 0);
    const monthlySalesCount = monthlySalesRows.length;

    // Total Outstanding Credit across all completed sales
    const outstandingRows = await Sale.findAll({
      where: {
        status: 'COMPLETED',
        balance_amount: { [Op.gt]: 0 }
      },
      attributes: ['balance_amount']
    });
    const totalOutstanding = outstandingRows.reduce((sum, s) => sum + s.balance_amount, 0);

    // Total Purchases Value
    const purchasesTotal = await Purchase.sum('total_amount') || 0;

    // Last 7 days sales trend
    const last7DaysLabels = [];
    const last7DaysData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);

      const daySales = await Sale.findAll({
        where: {
          status: 'COMPLETED',
          createdAt: { [Op.gte]: d, [Op.lt]: nextD }
        }
      });
      const dayRev = daySales.reduce((sum, s) => sum + s.final_amount, 0);
      last7DaysLabels.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }));
      last7DaysData.push(dayRev);
    }

    // Seller Sales Performance
    const sellers = await User.findAll({ where: { role: 'SELLER' } });
    const sellerPerformance = [];
    for (const seller of sellers) {
      const sellerSales = await Sale.findAll({
        where: { seller_id: seller.id, status: 'COMPLETED' }
      });
      const rev = sellerSales.reduce((acc, s) => acc + s.final_amount, 0);
      sellerPerformance.push({
        id: seller.id,
        name: seller.name,
        orders: sellerSales.length,
        revenue: rev
      });
    }

    // Top Selling Jewellery
    const topItemsRaw = await SaleItem.findAll({
      attributes: [
        'jewellery_id',
        [sequelize.fn('COUNT', sequelize.col('jewellery_id')), 'saleCount'],
        [sequelize.fn('SUM', sequelize.col('price')), 'totalValue']
      ],
      include: [{ model: Jewellery, attributes: ['name', 'code', 'category'] }],
      group: ['jewellery_id', 'Jewellery.id'],
      order: [[sequelize.literal('saleCount'), 'DESC']],
      limit: 5
    });

    const topJewellery = topItemsRaw.map(ti => ({
      name: ti.Jewellery ? ti.Jewellery.name : 'Custom Item',
      code: ti.Jewellery ? ti.Jewellery.code : '-',
      count: ti.get('saleCount'),
      revenue: ti.get('totalValue')
    }));

    // Recent Transactions
    const recentTransactions = await Sale.findAll({
      include: [
        { model: Customer, attributes: ['name', 'phone'] },
        { model: User, as: 'Seller', attributes: ['name'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 8
    });

    // Recent Activity / Audit Logs
    const recentActivity = await AuditLog.findAll({
      include: [{ model: User, attributes: ['name', 'role'] }],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    // 1. ADMIN DASHBOARD
    if (req.user.role === 'ADMIN') {
      return res.json({
        role: 'ADMIN',
        totalJewellery,
        stockValue: Math.round(totalStockValue),
        availableStock,
        lowStock,
        outOfStock,
        todaySalesCount,
        todaySalesRevenue,
        monthlySalesCount,
        monthlySalesRevenue,
        purchasesTotal: Math.round(purchasesTotal),
        activeSellers: activeSellersCount,
        categoryDistribution,
        stockStatus,
        sellerPerformance,
        salesOverview: {
          labels: last7DaysLabels,
          data: last7DaysData
        },
        recentActivity
      });
    }

    // 2. OWNER DASHBOARD
    if (req.user.role === 'OWNER') {
      const pendingDiscountsCount = await DiscountRequest.count({ where: { status: 'PENDING' } });
      const pendingDiscounts = await DiscountRequest.findAll({
        where: { status: 'PENDING' },
        include: [
          { model: Sale, include: [Customer, { model: SaleItem, include: [Jewellery] }] },
          { model: User, as: 'Seller', attributes: ['name'] }
        ],
        order: [['createdAt', 'DESC']]
      });

      // Estimated Profit this month (Selling - Estimated purchase cost)
      const monthlyProfit = Math.round(monthlySalesRevenue * 0.15); // ~15% gold margins

      // Top Seller
      const sortedSellers = [...sellerPerformance].sort((a, b) => b.revenue - a.revenue);
      const topSeller = sortedSellers.length > 0 ? sortedSellers[0].name : 'N/A';

      return res.json({
        role: 'OWNER',
        todaySalesRevenue,
        todaySalesCount,
        monthlySalesRevenue,
        monthlyProfit,
        pendingDiscountsCount,
        totalOutstanding: Math.round(totalOutstanding),
        activeSellers: activeSellersCount,
        totalJewellery,
        availableStock,
        topSeller,
        topJewellery,
        recentTransactions,
        sellerPerformance,
        pendingDiscounts,
        salesOverview: {
          labels: last7DaysLabels,
          data: last7DaysData
        },
        recentActivity
      });
    }

    // 3. SELLER DASHBOARD
    if (req.user.role === 'SELLER') {
      const myTodaySales = await Sale.findAll({
        where: {
          seller_id: req.user.id,
          status: 'COMPLETED',
          createdAt: { [Op.gte]: today }
        }
      });
      const myTodaySalesRevenue = myTodaySales.reduce((sum, s) => sum + s.final_amount, 0);
      const myTodayOrdersCount = myTodaySales.length;

      const myPendingDiscounts = await DiscountRequest.count({
        where: { seller_id: req.user.id, status: 'PENDING' }
      });

      const myApprovedDiscounts = await Sale.count({
        where: { seller_id: req.user.id, status: 'APPROVED' }
      });

      const myRecentSales = await Sale.findAll({
        where: { seller_id: req.user.id },
        include: [{ model: Customer, attributes: ['name'] }],
        order: [['createdAt', 'DESC']],
        limit: 5
      });

      return res.json({
        role: 'SELLER',
        todaySalesRevenue: myTodaySalesRevenue,
        todayOrdersCount: myTodayOrdersCount,
        pendingDiscountsCount: myPendingDiscounts,
        approvedDiscountsCount: myApprovedDiscounts,
        availableStock,
        totalJewellery,
        recentSales: myRecentSales
      });
    }

    // 4. CASHIER DASHBOARD (Cash Counter & Dues Collection)
    if (req.user.role === 'CASHIER') {
      const todayPayments = await Payment.findAll({
        where: {
          createdAt: { [Op.gte]: today },
          status: 'SUCCESS'
        }
      });
      let todayCashCollected = 0;
      let todayDigitalCollected = 0;
      todayPayments.forEach(p => {
        if (p.payment_method === 'CASH') todayCashCollected += (p.amount || 0);
        else todayDigitalCollected += (p.amount || 0);
      });

      const readyToCompleteBillsCount = await Sale.count({
        where: {
          status: { [Op.in]: ['APPROVED', 'MODIFIED'] }
        }
      });

      const pendingDueInvoicesCount = await Sale.count({
        where: {
          status: 'COMPLETED',
          balance_amount: { [Op.gt]: 0 }
        }
      });

      const cashierRecentSales = await Sale.findAll({
        include: [
          { model: Customer, attributes: ['name', 'phone'] },
          { model: User, as: 'Seller', attributes: ['name'] }
        ],
        order: [['createdAt', 'DESC']],
        limit: 8
      });

      return res.json({
        role: 'CASHIER',
        todaySalesRevenue,
        todaySalesCount,
        todayCashCollected,
        todayDigitalCollected,
        readyToCompleteBillsCount,
        pendingDueInvoicesCount,
        totalOutstanding,
        recentSales: cashierRecentSales
      });
    }

    res.json({ message: 'Role not recognized' });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Dynamic Notification Badges for Left Sidebar Navigation Menu across all roles
router.get('/menu-badges', authenticate, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      lowStockCount,
      availableStockCount,
      pendingDiscountsCount,
      readyToCompleteBillsCount,
      pendingApprovalSalesCount,
      todaySalesCount,
      todaySellerSalesCount,
      customersCount,
      customersWithDuesCount,
      suppliersCount,
      suppliersWithDuesCount,
      todayReturnsCount,
      todayExchangesCount,
      totalReturnsAndExchanges,
      todayExpensesCount,
      totalExpensesCount,
      activeUsersCount,
      activeSellersCount,
      todayAuditCount
    ] = await Promise.all([
      Jewellery.count({ where: { status: { [Op.in]: ['LOW_STOCK', 'OUT_OF_STOCK'] } } }).catch(() => 0),
      Jewellery.count({ where: { status: 'AVAILABLE' } }).catch(() => 0),
      DiscountRequest.count({ where: { status: 'PENDING' } }).catch(() => 0),
      Sale.count({ where: { status: { [Op.in]: ['APPROVED', 'MODIFIED'] } } }).catch(() => 0),
      Sale.count({ where: { status: 'PENDING_APPROVAL' } }).catch(() => 0),
      Sale.count({ where: { status: 'COMPLETED', createdAt: { [Op.gte]: today } } }).catch(() => 0),
      Sale.count({ where: { seller_id: req.user.id, status: 'COMPLETED', createdAt: { [Op.gte]: today } } }).catch(() => 0),
      Customer.count().catch(() => 0),
      Sale.count({ where: { status: 'COMPLETED', balance_amount: { [Op.gt]: 0 } } }).catch(() => 0),
      Supplier.count().catch(() => 0),
      Supplier.count({ where: { outstanding_balance: { [Op.gt]: 0 } } }).catch(() => 0),
      SalesReturn.count({ where: { createdAt: { [Op.gte]: today } } }).catch(() => 0),
      GoldExchange.count({ where: { createdAt: { [Op.gte]: today } } }).catch(() => 0),
      GoldExchange.count().catch(() => 0),
      Expense.count({ where: { date: { [Op.gte]: today } } }).catch(() => 0),
      Expense.count().catch(() => 0),
      User.count().catch(() => 0),
      User.count({ where: { role: 'SELLER' } }).catch(() => 0),
      AuditLog.count({ where: { createdAt: { [Op.gte]: today } } }).catch(() => 0)
    ]);

    const badges = {
      ADMIN: {
        sell: 0,
        sales: pendingApprovalSalesCount,
        jewellery: lowStockCount,
        rates: 0,
        dashboard: (pendingApprovalSalesCount + lowStockCount),
        suppliers: suppliersWithDuesCount,
        customers: customersWithDuesCount,
        returns_exchange: (todayReturnsCount + todayExchangesCount),
        expenses: todayExpensesCount,
        users: 0,
        reports: 0,
        audit: 0,
        settings: 0
      },
      OWNER: {
        dashboard: (pendingDiscountsCount + pendingApprovalSalesCount + lowStockCount),
        sell: 0,
        sales: pendingApprovalSalesCount,
        jewellery: lowStockCount,
        rates: 0,
        suppliers: suppliersWithDuesCount,
        customers: customersWithDuesCount,
        discounts: pendingDiscountsCount,
        seller_perf: 0,
        returns_exchange: (todayReturnsCount + todayExchangesCount),
        reports: 0,
        audit: 0,
        settings: 0
      },
      SELLER: {
        sell: 0,
        sales: readyToCompleteBillsCount,
        jewellery: 0,
        customers: customersWithDuesCount,
        returns_exchange: (todayReturnsCount + todayExchangesCount),
        dashboard: 0
      },
      CASHIER: {
        dashboard: readyToCompleteBillsCount,
        sell: 0,
        sales: readyToCompleteBillsCount,
        dues: customersWithDuesCount
      }
    };

    res.json({
      success: true,
      badges: badges[req.user.role] || {}
    });
  } catch (error) {
    console.error('Menu badges error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
