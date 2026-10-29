const {
  GoldRate, Setting, Jewellery, Sale, SaleItem, InvoiceSequence,
  User, Supplier, Customer, Purchase, PurchaseItem, Payment,
  DiscountRequest, GoldExchange, Expense, AdvancePayment, AuditLog, Notification
} = require('../models');
const bcrypt = require('bcrypt');

async function initializeDefaultData() {
  try {
    // 0. Ensure Default Demo Users exist (Admin, Owner, Sellers, Cashier)
    const defaultHash = await bcrypt.hash('password123', 10);
    const cashierHash = await bcrypt.hash('cashier123', 10);
    const demoUsers = [
      { username: 'admin', password_hash: defaultHash, raw_password: 'password123', role: 'ADMIN', name: 'System Admin' },
      { username: 'owner', password_hash: defaultHash, raw_password: 'password123', role: 'OWNER', name: 'Rajesh Kumar (Owner)' },
      { username: 'seller1', password_hash: defaultHash, raw_password: 'password123', role: 'SELLER', name: 'Rahul Sharma (Seller 1)' },
      { username: 'seller2', password_hash: defaultHash, raw_password: 'password123', role: 'SELLER', name: 'Priya Patel (Seller 2)' },
      { username: 'seller3', password_hash: defaultHash, raw_password: 'password123', role: 'SELLER', name: 'Amit Verma (Seller 3)' },
      { username: 'cashier', password_hash: cashierHash, raw_password: 'cashier123', role: 'CASHIER', name: 'Karthik Nair (Cashier)' }
    ];
    for (const u of demoUsers) {
      const existingUser = await User.findOne({ where: { username: u.username } });
      if (!existingUser) {
        await User.create(u);
      }
    }
    console.log('✅ Default Demo Users verified');

    // 1. Gold Rates
    const rateCount = await GoldRate.count();
    if (rateCount === 0) {
      const defaultRates = [
        { metal: 'GOLD', purity: '24K', rate_per_gram: 7500, previous_rate: 7450 },
        { metal: 'GOLD', purity: '22K', rate_per_gram: 6875, previous_rate: 6830 },
        { metal: 'GOLD', purity: '18K', rate_per_gram: 5625, previous_rate: 5590 },
        { metal: 'SILVER', purity: 'SILVER_999', rate_per_gram: 98, previous_rate: 96 },
        { metal: 'SILVER', purity: 'SILVER_925', rate_per_gram: 90, previous_rate: 89 }
      ];
      await GoldRate.bulkCreate(defaultRates);
      console.log('✅ Default Gold Rates initialized');
    }

    // 2. Settings
    const defaultSettings = [
      { key: 'shop_name', value: 'GoldFlow Jewellers', description: 'Business Store Name' },
      { key: 'shop_tagline', value: 'Fine Gold & Luxury Jewellery', description: 'Tagline on Invoices' },
      { key: 'shop_address', value: '123 Commercial Street, Gold Bazaar, Chennai, Tamil Nadu - 600001', description: 'Store Address' },
      { key: 'shop_phone', value: '+91 98765 43210 / 044-28345678', description: 'Store Phone' },
      { key: 'shop_email', value: 'contact@goldflowjewellers.com', description: 'Store Email' },
      { key: 'shop_gst', value: '33AAAAA0000A1Z5', description: 'GST Identification Number' },
      { key: 'invoice_prefix', value: 'GF', description: 'Invoice Number Prefix' },
      { key: 'tax_gst_percent', value: '3', description: 'Standard Jewellery GST (%)' },
      { key: 'round_off_enabled', value: 'true', description: 'Round off final invoice amount' },
      { key: 'default_making_charge', value: '12', description: 'Default Making Charge (%)' },
      { key: 'default_wastage_percent', value: '2', description: 'Default Wastage (%)' },
      { key: 'terms_and_conditions', value: 'Returns accepted within 7 days in original condition with bill. Weight and purity certified.', description: 'Terms printed on invoice' }
    ];

    for (const s of defaultSettings) {
      const exists = await Setting.findOne({ where: { key: s.key } });
      if (!exists) {
        await Setting.create(s);
      }
    }
    console.log('✅ System Settings initialized');

    // 2b. Seed Demo Inventory & Sample Records if Database is Empty
    if (await Supplier.count() === 0) {
      await Supplier.bulkCreate([
        {
          name: 'Vasanth Bullion & Casting',
          phone: '9876500001',
          email: 'vasanth@bullion.com',
          address: '12/4 Bazaar St, Sowcarpet, Chennai',
          gst_number: '33ABCDE1234F1Z5',
          opening_balance: 0,
          total_purchases: 850000,
          outstanding_balance: 150000
        },
        {
          name: 'Emerald Chains & Ornaments Ltd',
          phone: '9876500002',
          email: 'orders@emeraldchains.in',
          address: 'Industrial Area, Coimbatore',
          gst_number: '33EMRLD5678K2Z9',
          opening_balance: 0,
          total_purchases: 1240000,
          outstanding_balance: 0
        }
      ]);
    }

    if (await Jewellery.count() === 0) {
      const sup1 = await Supplier.findOne();
      await Jewellery.bulkCreate([
        {
          code: 'NL-22K-001', barcode: 'GFJ00001', name: 'Royal Antique Bridal Choker', category: 'Necklace',
          metal: 'Gold', purity: '22K', weight: 48.5, gross_weight: 48.5, stone_weight: 4.2, net_weight: 44.3,
          making_charge: 12, making_charge_type: 'PERCENTAGE', wastage_percent: 2, stone_charge: 15000,
          base_price: 339500, selling_price: 395000, stock: 3, min_stock: 2, status: 'AVAILABLE',
          image_url: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400',
          supplier_id: sup1 ? sup1.id : null
        },
        {
          code: 'RG-18K-015', barcode: 'GFJ00002', name: 'Solitaire Diamond Engagement Ring', category: 'Ring',
          metal: 'Gold', purity: '18K', weight: 6.8, gross_weight: 6.8, stone_weight: 1.2, net_weight: 5.6,
          making_charge: 15, making_charge_type: 'PERCENTAGE', wastage_percent: 2, stone_charge: 45000,
          base_price: 135000, selling_price: 185000, stock: 2, min_stock: 2, status: 'LOW_STOCK',
          image_url: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400',
          supplier_id: sup1 ? sup1.id : null
        },
        {
          code: 'BG-22K-044', barcode: 'GFJ00003', name: 'Traditional Temple Kada Bangles (Pair)', category: 'Bangle',
          metal: 'Gold', purity: '22K', weight: 62.0, gross_weight: 62.0, stone_weight: 0, net_weight: 62.0,
          making_charge: 10, making_charge_type: 'PERCENTAGE', wastage_percent: 1.5, stone_charge: 0,
          base_price: 434000, selling_price: 477400, stock: 4, min_stock: 2, status: 'AVAILABLE',
          image_url: 'https://images.unsplash.com/photo-1611591475841-862277d337d1?w=400',
          supplier_id: sup1 ? sup1.id : null
        },
        {
          code: 'ER-22K-092', barcode: 'GFJ00004', name: 'Kundan Jhumka Earrings with Pearls', category: 'Earrings',
          metal: 'Gold', purity: '22K', weight: 24.5, gross_weight: 24.5, stone_weight: 3.5, net_weight: 21.0,
          making_charge: 14, making_charge_type: 'PERCENTAGE', wastage_percent: 2.5, stone_charge: 8000,
          base_price: 171500, selling_price: 203500, stock: 5, min_stock: 2, status: 'AVAILABLE',
          image_url: 'https://images.unsplash.com/photo-1635767798638-3e25273a8236?w=400',
          supplier_id: sup1 ? sup1.id : null
        },
        {
          code: 'CH-24K-008', barcode: 'GFJ00005', name: 'Pure Gold Handcrafted Rope Chain', category: 'Chain',
          metal: 'Gold', purity: '24K', weight: 32.0, gross_weight: 32.0, stone_weight: 0, net_weight: 32.0,
          making_charge: 8, making_charge_type: 'PERCENTAGE', wastage_percent: 1, stone_charge: 0,
          base_price: 240000, selling_price: 259200, stock: 1, min_stock: 2, status: 'LOW_STOCK',
          image_url: 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=400',
          supplier_id: sup1 ? sup1.id : null
        },
        {
          code: 'SL-999-011', barcode: 'GFJ00006', name: 'Sterling Silver Pooja Diya & Bell Set', category: 'Silverware',
          metal: 'Silver', purity: 'SILVER_999', weight: 250.0, gross_weight: 250.0, stone_weight: 0, net_weight: 250.0,
          making_charge: 15, making_charge_type: 'PER_GRAM', wastage_percent: 0, stone_charge: 0,
          base_price: 24500, selling_price: 28500, stock: 8, min_stock: 3, status: 'AVAILABLE',
          image_url: 'https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?w=400',
          supplier_id: sup1 ? sup1.id : null
        }
      ]);
      console.log('✅ Demo Jewellery inventory initialized');
    }

    if (await Customer.count() === 0) {
      await Customer.bulkCreate([
        { name: 'Ananya Deshmukh', phone: '9820123456', email: 'ananya.d@gmail.com', address: 'Bandra West, Mumbai', total_purchases: 395000, outstanding_balance: 0 },
        { name: 'Suresh Singhania', phone: '9811234567', email: 'suresh.s@singhania.in', address: 'Civil Lines, Delhi', total_purchases: 477400, outstanding_balance: 0 },
        { name: 'Meenakshi Iyer', phone: '9444123456', email: 'meenakshi@outlook.com', address: 'T. Nagar, Chennai', total_purchases: 203500, outstanding_balance: 0 },
        { name: 'Kavita Agarwal', phone: '9830123456', email: 'kavita.ag@gmail.com', address: 'Salt Lake, Kolkata', total_purchases: 0, outstanding_balance: 0 }
      ]);
      console.log('✅ Demo Customers initialized');
    }

    // 3. Backfill Barcodes and Net Weights for existing Jewellery
    const items = await Jewellery.findAll();
    for (const item of items) {
      let needsSave = false;
      if (!item.barcode) {
        item.barcode = `GFJ${String(item.id).padStart(5, '0')}`;
        needsSave = true;
      }
      if (!item.gross_weight || item.gross_weight === 0) {
        item.gross_weight = item.weight || 1;
        needsSave = true;
      }
      if (!item.net_weight || item.net_weight === 0) {
        item.net_weight = Math.max(0, (item.gross_weight || item.weight || 1) - (item.stone_weight || 0));
        needsSave = true;
      }
      if (needsSave) {
        await item.save();
      }
    }

    // 4. Backfill Invoice Numbers for existing Sales
    const sales = await Sale.findAll({ order: [['id', 'ASC']] });
    let maxNum = 0;
    for (const sale of sales) {
      if (!sale.invoice_no) {
        const year = sale.createdAt ? new Date(sale.createdAt).getFullYear() : 2026;
        const numStr = String(sale.id).padStart(6, '0');
        sale.invoice_no = `GF-${year}-${numStr}`;
        if (!sale.paid_amount || sale.paid_amount === 0) {
          sale.paid_amount = sale.final_amount;
        }
        await sale.save();
      }
      maxNum = Math.max(maxNum, sale.id);
    }

    // Update sequence table
    const currentYear = new Date().getFullYear();
    const [seq] = await InvoiceSequence.findOrCreate({
      where: { year: currentYear },
      defaults: { year: currentYear, prefix: 'GF', last_number: maxNum }
    });
    if (seq.last_number < maxNum) {
      seq.last_number = maxNum;
      await seq.save();
    }

    console.log('✅ GoldFlow initial data check completed');
  } catch (error) {
    console.error('Error initializing defaults:', error);
  }
}

module.exports = { initializeDefaultData };
