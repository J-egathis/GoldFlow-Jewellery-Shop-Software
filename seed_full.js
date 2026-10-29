const { sequelize, User, Jewellery, Customer, Sale, SaleItem, DiscountRequest, AuditLog } = require('./backend/models');
const bcrypt = require('bcrypt');

async function seedDatabase() {
  await sequelize.sync({ force: true }); // Clean slate for realistic experience
  console.log('Database synced (clean slate).');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Users: 1 Admin, 1 Owner, 5 Sellers
  const admin = await User.create({ username: 'admin', password_hash: passwordHash, role: 'ADMIN', name: 'System Admin' });
  const owner = await User.create({ username: 'owner', password_hash: passwordHash, role: 'OWNER', name: 'Rajesh Kumar (Owner)' });
  const seller1 = await User.create({ username: 'seller1', password_hash: passwordHash, role: 'SELLER', name: 'Rahul Sharma (Seller 1)' });
  const seller2 = await User.create({ username: 'seller2', password_hash: passwordHash, role: 'SELLER', name: 'Priya Patel (Seller 2)' });
  const seller3 = await User.create({ username: 'seller3', password_hash: passwordHash, role: 'SELLER', name: 'Amit Verma (Seller 3)' });
  const seller4 = await User.create({ username: 'seller4', password_hash: passwordHash, role: 'SELLER', name: 'Sneha Reddy (Seller 4)' });
  const seller5 = await User.create({ username: 'seller5', password_hash: passwordHash, role: 'SELLER', name: 'Vikram Singh (Seller 5)' });

  console.log('Seeded Users (Admin, Owner, 5 Sellers)');

  // 2. Realistic Jewellery Items
  const items = await Jewellery.bulkCreate([
    {
      code: 'NL-22K-001', name: 'Royal Antique Bridal Choker', category: 'Necklace',
      metal: 'Gold', purity: '22K', weight: 48.5, stone_weight: 4.2, making_charge: 12, stone_charge: 15000,
      base_price: 339500, selling_price: 395000, stock: 3, min_stock: 2, status: 'AVAILABLE',
      image_url: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400'
    },
    {
      code: 'RG-18K-015', name: 'Solitaire Diamond Engagement Ring', category: 'Ring',
      metal: 'Gold', purity: '18K', weight: 6.8, stone_weight: 1.2, making_charge: 15, stone_charge: 45000,
      base_price: 135000, selling_price: 185000, stock: 2, min_stock: 2, status: 'LOW_STOCK',
      image_url: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400'
    },
    {
      code: 'BG-22K-044', name: 'Traditional Temple Kada Bangles (Pair)', category: 'Bangle',
      metal: 'Gold', purity: '22K', weight: 62.0, stone_weight: 0, making_charge: 10, stone_charge: 0,
      base_price: 434000, selling_price: 477400, stock: 4, min_stock: 2, status: 'AVAILABLE',
      image_url: 'https://images.unsplash.com/photo-1611591475841-862277d337d1?w=400'
    },
    {
      code: 'ER-22K-092', name: 'Kundan Jhumka Earrings with Pearls', category: 'Earrings',
      metal: 'Gold', purity: '22K', weight: 24.5, stone_weight: 3.5, making_charge: 14, stone_charge: 8000,
      base_price: 171500, selling_price: 203500, stock: 5, min_stock: 2, status: 'AVAILABLE',
      image_url: 'https://images.unsplash.com/photo-1635767798638-3e25273a8236?w=400'
    },
    {
      code: 'CH-24K-008', name: 'Pure Gold Handcrafted Rope Chain', category: 'Chain',
      metal: 'Gold', purity: '24K', weight: 32.0, stone_weight: 0, making_charge: 8, stone_charge: 0,
      base_price: 240000, selling_price: 259200, stock: 1, min_stock: 2, status: 'LOW_STOCK',
      image_url: 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=400'
    },
    {
      code: 'BR-18K-021', name: 'Tennis Diamond Tennis Bracelet', category: 'Bracelet',
      metal: 'Platinum', purity: '18K', weight: 18.2, stone_weight: 5.0, making_charge: 18, stone_charge: 65000,
      base_price: 280000, selling_price: 360000, stock: 0, min_stock: 1, status: 'OUT_OF_STOCK',
      image_url: 'https://images.unsplash.com/photo-1598560917505-59a3ad559071?w=400'
    },
    {
      code: 'NL-22K-019', name: 'Floral Motif Layered Haar', category: 'Necklace',
      metal: 'Gold', purity: '22K', weight: 75.0, stone_weight: 2.0, making_charge: 11, stone_charge: 5000,
      base_price: 525000, selling_price: 587750, stock: 2, min_stock: 1, status: 'AVAILABLE',
      image_url: 'https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?w=400'
    },
    {
      code: 'RG-22K-088', name: 'Peacock Enamel Signet Ring', category: 'Ring',
      metal: 'Gold', purity: '22K', weight: 8.5, stone_weight: 0.5, making_charge: 12, stone_charge: 2000,
      base_price: 59500, selling_price: 68640, stock: 6, min_stock: 3, status: 'AVAILABLE',
      image_url: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=400'
    }
  ]);
  console.log('Seeded 8 Jewellery items');

  // 3. Customers
  const c1 = await Customer.create({ name: 'Ananya Deshmukh', phone: '9820123456', email: 'ananya.d@gmail.com', address: 'Bandra West, Mumbai', total_purchases: 395000 });
  const c2 = await Customer.create({ name: 'Suresh Singhania', phone: '9811234567', email: 'suresh.s@singhania.in', address: 'Civil Lines, Delhi', total_purchases: 477400 });
  const c3 = await Customer.create({ name: 'Meenakshi Iyer', phone: '9444123456', email: 'meenakshi@outlook.com', address: 'T. Nagar, Chennai', total_purchases: 203500 });
  const c4 = await Customer.create({ name: 'Kavita Agarwal', phone: '9830123456', email: 'kavita.ag@gmail.com', address: 'Salt Lake, Kolkata', total_purchases: 0 });
  console.log('Seeded 4 Customers');

  // 4. Completed Sales
  const sale1 = await Sale.create({
    seller_id: seller1.id,
    customer_id: c1.id,
    total_amount: 395000,
    discount_amount: 0,
    final_amount: 395000,
    status: 'COMPLETED',
    payment_method: 'CARD'
  });
  await SaleItem.create({ sale_id: sale1.id, jewellery_id: items[0].id, price: 395000, making_charge: 12 });

  const sale2 = await Sale.create({
    seller_id: seller2.id,
    customer_id: c2.id,
    total_amount: 477400,
    discount_amount: 23870,
    final_amount: 453530,
    status: 'COMPLETED',
    payment_method: 'UPI'
  });
  await SaleItem.create({ sale_id: sale2.id, jewellery_id: items[2].id, price: 477400, making_charge: 10 });

  const sale3 = await Sale.create({
    seller_id: seller1.id,
    customer_id: c3.id,
    total_amount: 203500,
    discount_amount: 0,
    final_amount: 203500,
    status: 'COMPLETED',
    payment_method: 'CASH'
  });
  await SaleItem.create({ sale_id: sale3.id, jewellery_id: items[3].id, price: 203500, making_charge: 14 });

  // 5. Pending Discount Request for Owner Approval!
  const salePending = await Sale.create({
    seller_id: seller1.id,
    customer_id: c4.id,
    total_amount: 185000,
    discount_amount: 0,
    final_amount: 185000,
    status: 'PENDING_APPROVAL',
    payment_method: null
  });
  await SaleItem.create({ sale_id: salePending.id, jewellery_id: items[1].id, price: 185000, making_charge: 15 });

  await DiscountRequest.create({
    sale_id: salePending.id,
    seller_id: seller1.id,
    requested_discount_percent: 10,
    status: 'PENDING',
    reason: 'VIP Wedding Customer requesting 10% discount on diamond engagement ring.'
  });

  // 6. Audit Logs
  await AuditLog.create({ user_id: admin.id, action: 'ADD_JEWELLERY', module: 'INVENTORY', details: 'Added Royal Antique Bridal Choker (NL-22K-001)' });
  await AuditLog.create({ user_id: seller1.id, action: 'CREATE_SALE', module: 'SALES', details: 'Completed Sale #1 for Ananya Deshmukh (₹395,000)' });
  await AuditLog.create({ user_id: owner.id, action: 'APPROVE_DISCOUNT', module: 'SALES', details: 'Approved 5% discount for Suresh Singhania' });
  await AuditLog.create({ user_id: seller2.id, action: 'CREATE_SALE', module: 'SALES', details: 'Completed Sale #2 for Suresh Singhania (₹453,530)' });
  await AuditLog.create({ user_id: seller1.id, action: 'REQUEST_DISCOUNT', module: 'SALES', details: 'Requested 10% discount on Ring RG-18K-015 for Kavita Agarwal' });

  console.log('Seeded complete realistic data successfully!');
  process.exit(0);
}

seedDatabase().catch(err => {
  console.error(err);
  process.exit(1);
});
