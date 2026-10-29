const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'goldflow',
  process.env.DB_USER || 'root',
  process.env.DB_PASS !== undefined ? process.env.DB_PASS : 'jasim004',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: process.env.DB_DIALECT || 'mysql',
    logging: false,
    define: {
      timestamps: true
    }
  }
);

// Users
const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, unique: true, allowNull: false },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  raw_password: { type: DataTypes.STRING },
  role: { type: DataTypes.ENUM('ADMIN', 'OWNER', 'SELLER', 'CASHIER'), allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false }
});

// Jewellery
const Jewellery = sequelize.define('Jewellery', {
  code: { type: DataTypes.STRING, unique: true, allowNull: false },
  barcode: { type: DataTypes.STRING, unique: true, allowNull: true },
  name: { type: DataTypes.STRING, allowNull: false },
  category: { type: DataTypes.STRING, allowNull: false },
  subcategory: { type: DataTypes.STRING, defaultValue: 'Standard' },
  metal: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Gold' }, // Gold, Silver, Platinum
  purity: { type: DataTypes.STRING, allowNull: false, defaultValue: '22K' }, // 24K, 22K, 18K, 925
  weight: { type: DataTypes.FLOAT, allowNull: false }, // gross weight
  gross_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  stone_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  net_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  making_charge: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 }, // percentage or fixed / per gram
  making_charge_type: { type: DataTypes.ENUM('PERCENTAGE', 'PER_GRAM', 'FIXED'), defaultValue: 'PERCENTAGE' },
  wastage_percent: { type: DataTypes.FLOAT, defaultValue: 0 },
  stone_charge: { type: DataTypes.FLOAT, defaultValue: 0 },
  other_charges: { type: DataTypes.FLOAT, defaultValue: 0 },
  purchase_cost: { type: DataTypes.FLOAT, defaultValue: 0 },
  base_price: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  selling_price: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  min_stock: { type: DataTypes.INTEGER, defaultValue: 1 },
  supplier_id: { type: DataTypes.INTEGER, allowNull: true },
  status: { 
    type: DataTypes.ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'LOW_STOCK', 'OUT_OF_STOCK', 'INACTIVE'), 
    defaultValue: 'AVAILABLE' 
  },
  image_url: { type: DataTypes.STRING }
});

// Customers
const Customer = sequelize.define('Customer', {
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING },
  address: { type: DataTypes.TEXT },
  dob: { type: DataTypes.DATEONLY, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  total_purchases: { type: DataTypes.FLOAT, defaultValue: 0 },
  outstanding_balance: { type: DataTypes.FLOAT, defaultValue: 0 }
});

// Sales
const Sale = sequelize.define('Sale', {
  invoice_no: { type: DataTypes.STRING, unique: true, allowNull: true },
  total_amount: { type: DataTypes.FLOAT, allowNull: false }, // gross amount
  gross_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  discount_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  tax_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  tax_percent: { type: DataTypes.FLOAT, defaultValue: 3 },
  round_off: { type: DataTypes.FLOAT, defaultValue: 0 },
  final_amount: { type: DataTypes.FLOAT, allowNull: false },
  paid_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  balance_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  status: { 
    type: DataTypes.ENUM('PENDING_APPROVAL', 'APPROVED', 'MODIFIED', 'REJECTED', 'COMPLETED', 'CANCELLED'), 
    defaultValue: 'COMPLETED' 
  },
  payment_status: {
    type: DataTypes.ENUM('PAID', 'PARTIALLY_PAID', 'PENDING', 'REFUNDED'),
    defaultValue: 'PAID'
  },
  payment_method: { type: DataTypes.ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'SPLIT', 'OTHER'), allowNull: true },
  seller_id: { type: DataTypes.INTEGER },
  customer_id: { type: DataTypes.INTEGER },
  notes: { type: DataTypes.TEXT, allowNull: true }
});

// Sale Items
const SaleItem = sequelize.define('SaleItem', {
  quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
  gross_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  stone_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  net_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  purity: { type: DataTypes.STRING, defaultValue: '22K' },
  gold_rate: { type: DataTypes.FLOAT, defaultValue: 0 },
  gold_value: { type: DataTypes.FLOAT, defaultValue: 0 },
  making_charge: { type: DataTypes.FLOAT, defaultValue: 0 },
  wastage_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  stone_charge: { type: DataTypes.FLOAT, defaultValue: 0 },
  other_charges: { type: DataTypes.FLOAT, defaultValue: 0 },
  discount_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  tax_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  price: { type: DataTypes.FLOAT, allowNull: false },
  final_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  sale_id: { type: DataTypes.INTEGER },
  jewellery_id: { type: DataTypes.INTEGER }
});

// Discount Requests
const DiscountRequest = sequelize.define('DiscountRequest', {
  requested_discount_percent: { type: DataTypes.FLOAT, allowNull: false },
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'MODIFIED'), defaultValue: 'PENDING' },
  modified_discount_percent: { type: DataTypes.FLOAT, allowNull: true },
  reason: { type: DataTypes.TEXT },
  sale_id: { type: DataTypes.INTEGER },
  seller_id: { type: DataTypes.INTEGER }
});

// Notifications
const Notification = sequelize.define('Notification', {
  message: { type: DataTypes.STRING, allowNull: false },
  is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
  type: { type: DataTypes.STRING, allowNull: false },
  metadata: { type: DataTypes.TEXT },
  user_id: { type: DataTypes.INTEGER, allowNull: true }
});

// Audit Logs
const AuditLog = sequelize.define('AuditLog', {
  action: { type: DataTypes.STRING, allowNull: false },
  module: { type: DataTypes.STRING, allowNull: false },
  details: { type: DataTypes.TEXT },
  previous_value: { type: DataTypes.TEXT, allowNull: true },
  new_value: { type: DataTypes.TEXT, allowNull: true },
  user_id: { type: DataTypes.INTEGER, allowNull: true }
});

// Gold Rates
const GoldRate = sequelize.define('GoldRate', {
  metal: { type: DataTypes.ENUM('GOLD', 'SILVER', 'PLATINUM'), defaultValue: 'GOLD' },
  purity: { type: DataTypes.STRING, allowNull: false }, // 24K, 22K, 18K, SILVER_999, SILVER_925
  rate_per_gram: { type: DataTypes.FLOAT, allowNull: false },
  previous_rate: { type: DataTypes.FLOAT, defaultValue: 0 },
  updated_by: { type: DataTypes.INTEGER, allowNull: true }
});

// Suppliers
const Supplier = sequelize.define('Supplier', {
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING },
  address: { type: DataTypes.TEXT },
  gst_number: { type: DataTypes.STRING },
  bank_details: { type: DataTypes.TEXT },
  opening_balance: { type: DataTypes.FLOAT, defaultValue: 0 },
  total_purchases: { type: DataTypes.FLOAT, defaultValue: 0 },
  outstanding_balance: { type: DataTypes.FLOAT, defaultValue: 0 }
});

// Purchases
const Purchase = sequelize.define('Purchase', {
  purchase_invoice_no: { type: DataTypes.STRING, allowNull: false },
  supplier_id: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
  total_amount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  paid_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  payment_status: { type: DataTypes.ENUM('PAID', 'PARTIALLY_PAID', 'PENDING'), defaultValue: 'PAID' },
  notes: { type: DataTypes.TEXT },
  created_by: { type: DataTypes.INTEGER }
});

// Purchase Items
const PurchaseItem = sequelize.define('PurchaseItem', {
  purchase_id: { type: DataTypes.INTEGER, allowNull: false },
  jewellery_id: { type: DataTypes.INTEGER, allowNull: true },
  metal: { type: DataTypes.STRING, defaultValue: 'Gold' },
  purity: { type: DataTypes.STRING, defaultValue: '22K' },
  gross_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  stone_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  net_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  rate: { type: DataTypes.FLOAT, defaultValue: 0 },
  making_charge: { type: DataTypes.FLOAT, defaultValue: 0 },
  purchase_cost: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  quantity: { type: DataTypes.INTEGER, defaultValue: 1 }
});

// Payments (Supports Split payments & Due payments)
const Payment = sequelize.define('Payment', {
  sale_id: { type: DataTypes.INTEGER, allowNull: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: true },
  amount: { type: DataTypes.FLOAT, allowNull: false },
  payment_method: { type: DataTypes.ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'), defaultValue: 'CASH' },
  reference_no: { type: DataTypes.STRING, allowNull: true },
  payment_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  status: { type: DataTypes.ENUM('SUCCESS', 'PENDING', 'REFUNDED'), defaultValue: 'SUCCESS' },
  notes: { type: DataTypes.STRING },
  recorded_by: { type: DataTypes.INTEGER, allowNull: true }
});

// Advance Payments
const AdvancePayment = sequelize.define('AdvancePayment', {
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  order_ref: { type: DataTypes.STRING, allowNull: true },
  advance_amount: { type: DataTypes.FLOAT, allowNull: false },
  payment_method: { type: DataTypes.ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'), defaultValue: 'CASH' },
  total_order_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  balance_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
  status: { type: DataTypes.ENUM('ACTIVE', 'ADJUSTED', 'CANCELLED'), defaultValue: 'ACTIVE' },
  notes: { type: DataTypes.TEXT },
  recorded_by: { type: DataTypes.INTEGER }
});

// Sales Returns
const SalesReturn = sequelize.define('SalesReturn', {
  return_invoice_no: { type: DataTypes.STRING, unique: true, allowNull: false },
  sale_id: { type: DataTypes.INTEGER, allowNull: false },
  customer_id: { type: DataTypes.INTEGER, allowNull: true },
  total_refund_amount: { type: DataTypes.FLOAT, allowNull: false },
  reason: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('COMPLETED', 'PENDING'), defaultValue: 'COMPLETED' },
  processed_by: { type: DataTypes.INTEGER }
});

// Sales Return Items
const SalesReturnItem = sequelize.define('SalesReturnItem', {
  return_id: { type: DataTypes.INTEGER, allowNull: false },
  sale_item_id: { type: DataTypes.INTEGER, allowNull: true },
  jewellery_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
  refund_amount: { type: DataTypes.FLOAT, allowNull: false },
  return_reason: { type: DataTypes.STRING },
  condition: { type: DataTypes.STRING, defaultValue: 'Good' }
});

// Gold Exchanges
const GoldExchange = sequelize.define('GoldExchange', {
  exchange_no: { type: DataTypes.STRING, unique: true, allowNull: false },
  sale_id: { type: DataTypes.INTEGER, allowNull: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: true },
  old_metal: { type: DataTypes.STRING, defaultValue: 'Gold' },
  old_purity: { type: DataTypes.STRING, defaultValue: '22K' },
  old_gross_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  old_stone_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  old_net_weight: { type: DataTypes.FLOAT, defaultValue: 0 },
  old_rate: { type: DataTypes.FLOAT, defaultValue: 0 },
  deduction_percent: { type: DataTypes.FLOAT, defaultValue: 0 },
  old_gold_value: { type: DataTypes.FLOAT, defaultValue: 0 },
  new_jewellery_value: { type: DataTypes.FLOAT, defaultValue: 0 },
  amount_difference: { type: DataTypes.FLOAT, defaultValue: 0 }, // Payable by customer if positive, refundable if negative
  notes: { type: DataTypes.TEXT },
  created_by: { type: DataTypes.INTEGER }
});

// Expenses
const Expense = sequelize.define('Expense', {
  category: { 
    type: DataTypes.ENUM('RENT', 'ELECTRICITY', 'SALARY', 'TRANSPORT', 'MAINTENANCE', 'MARKETING', 'OFFICE', 'OTHER'),
    defaultValue: 'OTHER'
  },
  amount: { type: DataTypes.FLOAT, allowNull: false },
  description: { type: DataTypes.TEXT },
  payment_method: { type: DataTypes.ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'), defaultValue: 'CASH' },
  date: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
  created_by: { type: DataTypes.INTEGER }
});

// System Settings
const Setting = sequelize.define('Setting', {
  key: { type: DataTypes.STRING, unique: true, allowNull: false },
  value: { type: DataTypes.TEXT, allowNull: false },
  description: { type: DataTypes.STRING }
});

// Invoice Sequences
const InvoiceSequence = sequelize.define('InvoiceSequence', {
  year: { type: DataTypes.INTEGER, allowNull: false },
  prefix: { type: DataTypes.STRING, defaultValue: 'GF' },
  last_number: { type: DataTypes.INTEGER, defaultValue: 0 }
});

// Relationships
User.hasMany(Sale, { foreignKey: 'seller_id' });
Sale.belongsTo(User, { as: 'Seller', foreignKey: 'seller_id' });

Customer.hasMany(Sale, { foreignKey: 'customer_id' });
Sale.belongsTo(Customer, { foreignKey: 'customer_id' });

Sale.hasMany(SaleItem, { foreignKey: 'sale_id' });
SaleItem.belongsTo(Sale, { foreignKey: 'sale_id' });

Jewellery.hasMany(SaleItem, { foreignKey: 'jewellery_id' });
SaleItem.belongsTo(Jewellery, { foreignKey: 'jewellery_id' });

Sale.hasOne(DiscountRequest, { foreignKey: 'sale_id' });
DiscountRequest.belongsTo(Sale, { foreignKey: 'sale_id' });

User.hasMany(DiscountRequest, { foreignKey: 'seller_id' });
DiscountRequest.belongsTo(User, { as: 'Seller', foreignKey: 'seller_id' });

User.hasMany(Notification, { foreignKey: 'user_id' });
Notification.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(AuditLog, { foreignKey: 'user_id' });
AuditLog.belongsTo(User, { foreignKey: 'user_id' });

// Supplier & Purchases
Supplier.hasMany(Purchase, { foreignKey: 'supplier_id' });
Purchase.belongsTo(Supplier, { foreignKey: 'supplier_id' });

Purchase.hasMany(PurchaseItem, { foreignKey: 'purchase_id' });
PurchaseItem.belongsTo(Purchase, { foreignKey: 'purchase_id' });

Jewellery.belongsTo(Supplier, { foreignKey: 'supplier_id' });
Supplier.hasMany(Jewellery, { foreignKey: 'supplier_id' });

// Payments
Sale.hasMany(Payment, { foreignKey: 'sale_id' });
Payment.belongsTo(Sale, { foreignKey: 'sale_id' });

Customer.hasMany(Payment, { foreignKey: 'customer_id' });
Payment.belongsTo(Customer, { foreignKey: 'customer_id' });

Customer.hasMany(AdvancePayment, { foreignKey: 'customer_id' });
AdvancePayment.belongsTo(Customer, { foreignKey: 'customer_id' });

// Returns
Sale.hasMany(SalesReturn, { foreignKey: 'sale_id' });
SalesReturn.belongsTo(Sale, { foreignKey: 'sale_id' });

SalesReturn.hasMany(SalesReturnItem, { foreignKey: 'return_id' });
SalesReturnItem.belongsTo(SalesReturn, { foreignKey: 'return_id' });

Customer.hasMany(SalesReturn, { foreignKey: 'customer_id' });
SalesReturn.belongsTo(Customer, { foreignKey: 'customer_id' });

// Gold Exchange
Customer.hasMany(GoldExchange, { foreignKey: 'customer_id' });
GoldExchange.belongsTo(Customer, { foreignKey: 'customer_id' });

Sale.hasOne(GoldExchange, { foreignKey: 'sale_id' });
GoldExchange.belongsTo(Sale, { foreignKey: 'sale_id' });

// Additional Associations
PurchaseItem.belongsTo(Jewellery, { foreignKey: 'jewellery_id' });
Jewellery.hasMany(PurchaseItem, { foreignKey: 'jewellery_id' });

SalesReturnItem.belongsTo(Jewellery, { foreignKey: 'jewellery_id' });
Jewellery.hasMany(SalesReturnItem, { foreignKey: 'jewellery_id' });

Expense.belongsTo(User, { foreignKey: 'created_by' });
User.hasMany(Expense, { foreignKey: 'created_by' });

module.exports = {
  sequelize,
  User,
  Jewellery,
  Customer,
  Sale,
  SaleItem,
  DiscountRequest,
  Notification,
  AuditLog,
  GoldRate,
  Supplier,
  Purchase,
  PurchaseItem,
  Payment,
  AdvancePayment,
  SalesReturn,
  SalesReturnItem,
  GoldExchange,
  Expense,
  Setting,
  InvoiceSequence
};
