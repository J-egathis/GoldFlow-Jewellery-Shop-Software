-- =======================================================================
-- GOLDFLOW JEWELLERY MANAGEMENT SYSTEM
-- COMPLETE DATABASE WORKBENCH SCRIPT (ALL 20 TABLES)
-- =======================================================================
-- Database: goldflow
-- Host: localhost | User: root
-- 
-- HOW TO RUN IN MYSQL WORKBENCH:
-- 1. Open MySQL Workbench and connect to your Local instance.
-- 2. Open this file (File -> Open SQL Script...) or paste into a Query tab.
-- 3. To run an individual query: Click on the query line and press:
--    Windows: Ctrl + Enter  (or click the Lightning Bolt ⚡ icon)
-- 4. To run everything: Press Ctrl + Shift + Enter
-- =======================================================================

CREATE DATABASE IF NOT EXISTS goldflow;
USE goldflow;

-- =======================================================================
-- SECTION 1: ALL 20 TABLES ROW COUNT OVERVIEW
-- Run this single query to see the live status of all 20 tables at once!
-- =======================================================================
SELECT 'users' AS table_name, COUNT(*) AS total_records FROM users
UNION ALL SELECT 'jewelleries', COUNT(*) FROM jewelleries
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'saleitems', COUNT(*) FROM saleitems
UNION ALL SELECT 'discountrequests', COUNT(*) FROM discountrequests
UNION ALL SELECT 'goldrates', COUNT(*) FROM goldrates
UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'purchases', COUNT(*) FROM purchases
UNION ALL SELECT 'purchaseitems', COUNT(*) FROM purchaseitems
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'advancepayments', COUNT(*) FROM advancepayments
UNION ALL SELECT 'goldexchanges', COUNT(*) FROM goldexchanges
UNION ALL SELECT 'salesreturns', COUNT(*) FROM salesreturns
UNION ALL SELECT 'salesreturnitems', COUNT(*) FROM salesreturnitems
UNION ALL SELECT 'expenses', COUNT(*) FROM expenses
UNION ALL SELECT 'auditlogs', COUNT(*) FROM auditlogs
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'settings', COUNT(*) FROM settings
UNION ALL SELECT 'invoicesequences', COUNT(*) FROM invoicesequences;


-- =======================================================================
-- SECTION 2: VIEW ALL 20 TABLES (SELECT * INDIVIDUAL QUERIES)
-- =======================================================================

-- 1. USERS (Admin, Owner, Sellers)
-- Shows all staff login credentials and roles
SELECT 
    id, username, role, name, raw_password, createdAt, updatedAt 
FROM users 
ORDER BY id ASC;

-- 2. JEWELLERIES (Stock & Inventory)
-- Shows all ornaments, gold/silver weight, making charge, stock and prices
SELECT 
    id, code, barcode, name, category, metal, purity, 
    weight AS gross_weight, stone_weight, net_weight,
    making_charge, making_charge_type, wastage_percent, stone_charge,
    selling_price, stock, min_stock, status 
FROM jewelleries 
ORDER BY id DESC;

-- 3. CUSTOMERS (Customer Directory)
-- Shows customer contacts, total purchases, and outstanding dues
SELECT 
    id, name, phone, email, address, total_purchases, outstanding_balance, createdAt 
FROM customers 
ORDER BY id DESC;

-- 4. SALES (Invoices & Billing Header)
-- Shows bill invoice numbers, gross, discount, tax, final amounts, and status
SELECT 
    id, invoice_no, gross_amount, discount_amount, tax_amount, round_off, 
    final_amount, paid_amount, balance_amount, status, payment_status, payment_method, 
    seller_id, customer_id, createdAt 
FROM sales 
ORDER BY id DESC;

-- 5. SALEITEMS (Line items in each sale invoice)
-- Shows individual ornaments sold, gold rate applied, making charge, and item total
SELECT 
    si.id, si.sale_id, si.jewellery_id, si.quantity, si.purity, 
    si.gross_weight, si.net_weight, si.gold_rate, si.gold_value, 
    si.making_charge, si.wastage_amount, si.price, si.final_amount 
FROM saleitems si 
ORDER BY si.id DESC;

-- 6. DISCOUNTREQUESTS (Owner Discount Approval Queue)
-- Shows seller requests sent to owner for special discounts
SELECT 
    id, sale_id, seller_id, requested_discount_percent, 
    status, modified_discount_percent, reason, createdAt 
FROM discountrequests 
ORDER BY id DESC;

-- 7. GOLDRATES (Live Market Rates)
-- Shows active rates for 24K, 22K, 18K Gold and Silver
SELECT 
    id, metal, purity, rate_per_gram, previous_rate, updatedAt 
FROM goldrates 
ORDER BY metal ASC, purity ASC;

-- 8. SUPPLIERS (Wholesale Vendors / Karigars)
-- Shows supplier names, GST, phone, and outstanding balances
SELECT 
    id, name, phone, email, gst_number, opening_balance, 
    total_purchases, outstanding_balance 
FROM suppliers 
ORDER BY id DESC;

-- 9. PURCHASES (Stock Inward / Purchase Bills)
-- Shows purchase invoice number, supplier, total amount, and payment status
SELECT 
    id, purchase_invoice_no, supplier_id, date, total_amount, 
    paid_amount, payment_status, notes, createdAt 
FROM purchases 
ORDER BY id DESC;

-- 10. PURCHASEITEMS (Items inside Purchase Bills)
-- Shows ornaments received from suppliers with weights and costs
SELECT 
    id, purchase_id, jewellery_id, metal, purity, 
    gross_weight, net_weight, rate, making_charge, purchase_cost, quantity 
FROM purchaseitems 
ORDER BY id DESC;

-- 11. PAYMENTS (Payment Ledger / Cash, UPI, Card)
-- Shows customer payment records, split payments, and reference numbers
SELECT 
    id, sale_id, customer_id, amount, payment_method, 
    reference_no, payment_date, status, notes 
FROM payments 
ORDER BY id DESC;

-- 12. ADVANCEPAYMENTS (Advance Order Bookings)
-- Shows customer advance deposits for custom jewellery orders
SELECT 
    id, customer_id, order_ref, advance_amount, payment_method, 
    total_order_amount, balance_amount, status, createdAt 
FROM advancepayments 
ORDER BY id DESC;

-- 13. GOLDEXCHANGES (Old Gold Exchange)
-- Shows old jewellery brought by customers, purity, weight, deductions and value credited
SELECT 
    id, exchange_no, sale_id, customer_id, old_metal, old_purity, 
    old_gross_weight, old_net_weight, old_rate, deduction_percent, 
    old_gold_value, new_jewellery_value, amount_difference, createdAt 
FROM goldexchanges 
ORDER BY id DESC;

-- 14. SALESRETURNS (Return & Exchange Bills)
-- Shows returned bills, refund amounts, and reasons
SELECT 
    id, return_invoice_no, sale_id, customer_id, total_refund_amount, 
    reason, status, createdAt 
FROM salesreturns 
ORDER BY id DESC;

-- 15. SALESRETURNITEMS (Returned items details)
-- Shows specific ornaments returned by customer and refund calculated
SELECT 
    id, return_id, sale_item_id, jewellery_id, quantity, 
    refund_amount, return_reason, `condition` 
FROM salesreturnitems 
ORDER BY id DESC;

-- 16. EXPENSES (Shop Operating Expenses)
-- Shows Rent, Electricity, Staff Salary, Transport, Tea/Snacks, etc.
SELECT 
    id, category, amount, description, payment_method, `date`, created_by 
FROM expenses 
ORDER BY id DESC;

-- 17. AUDITLOGS (System Security & Activity Trail)
-- Logs every action: login, rate update, bill approval, stock changes
SELECT 
    id, action, module, details, previous_value, new_value, user_id, createdAt 
FROM auditlogs 
ORDER BY id DESC LIMIT 50;

-- 18. NOTIFICATIONS (Live Alerts)
-- Shows discount request alerts, live rate change alerts, stock warnings
SELECT 
    id, message, is_read, type, user_id, createdAt 
FROM notifications 
ORDER BY id DESC LIMIT 50;

-- 19. SETTINGS (Store Config & App Preferences)
-- Shows GST rates, store contact info, live rate auto-sync configurations
SELECT 
    id, `key`, `value`, description 
FROM settings 
ORDER BY id ASC;

-- 20. INVOICESEQUENCES (Invoice Counter Sequence)
-- Tracks the running bill serial number per year (e.g. GF-2026-0001)
SELECT 
    id, `year`, prefix, last_number 
FROM invoicesequences 
ORDER BY `year` DESC;


-- =======================================================================
-- SECTION 3: BUSINESS REPORTS & RELATIONAL JOINS (MOST USEFUL QUERIES)
-- =======================================================================

-- 🛒 REPORT 1: DETAILED SALES REGISTER (Sales + Customer + Staff)
-- Shows complete bill details with Customer Name, Phone, and Seller Name
SELECT 
    s.invoice_no AS 'Invoice #',
    s.createdAt AS 'Bill Date',
    COALESCE(c.name, 'Walk-in Customer') AS 'Customer Name',
    COALESCE(c.phone, '-') AS 'Customer Phone',
    u.name AS 'Billed By (Seller)',
    s.gross_amount AS 'Gross (₹)',
    s.discount_amount AS 'Discount (₹)',
    s.tax_amount AS 'GST (₹)',
    s.final_amount AS 'Net Total (₹)',
    s.payment_method AS 'Payment Mode',
    s.status AS 'Bill Status'
FROM sales s
LEFT JOIN customers c ON s.customer_id = c.id
LEFT JOIN users u ON s.seller_id = u.id
ORDER BY s.id DESC;


-- 📜 REPORT 2: INVOICE BREAKDOWN WITH INDIVIDUAL JEWELLERY ITEMS
-- View every item sold inside invoices with ornament name, weight, and price
SELECT 
    s.invoice_no AS 'Invoice #',
    COALESCE(c.name, 'Walk-in') AS 'Customer',
    j.code AS 'Jewellery Code',
    j.name AS 'Item Name',
    j.category AS 'Category',
    si.purity AS 'Purity',
    si.net_weight AS 'Net Weight (g)',
    si.gold_rate AS 'Gold Rate/g (₹)',
    si.making_charge AS 'Making Charge (₹)',
    si.price AS 'Item Amount (₹)'
FROM saleitems si
JOIN sales s ON si.sale_id = s.id
LEFT JOIN jewelleries j ON si.jewellery_id = j.id
LEFT JOIN customers c ON s.customer_id = c.id
ORDER BY s.id DESC, si.id ASC;


-- 💎 REPORT 3: INVENTORY STOCK & VALUATION REPORT
-- See all current stock in hand, weight, category, and total retail value
SELECT 
    category AS 'Category',
    metal AS 'Metal',
    purity AS 'Purity',
    COUNT(*) AS 'Total Items',
    SUM(stock) AS 'Stock Qty',
    ROUND(SUM(weight * stock), 2) AS 'Total Weight (g)',
    ROUND(SUM(selling_price * stock), 2) AS 'Total Inventory Value (₹)'
FROM jewelleries
WHERE status != 'INACTIVE'
GROUP BY category, metal, purity
ORDER BY metal, category;


-- 📦 REPORT 4: PURCHASE ORDERS & VENDOR BILLS (With Supplier Info)
SELECT 
    p.purchase_invoice_no AS 'Purchase Bill #',
    p.date AS 'Purchase Date',
    s.name AS 'Supplier Name',
    s.phone AS 'Supplier Phone',
    p.total_amount AS 'Total Bill (₹)',
    p.paid_amount AS 'Paid (₹)',
    (p.total_amount - p.paid_amount) AS 'Balance Due (₹)',
    p.payment_status AS 'Payment Status'
FROM purchases p
JOIN suppliers s ON p.supplier_id = s.id
ORDER BY p.id DESC;


-- 👑 REPORT 5: DISCOUNT APPROVAL HISTORY
-- See which seller requested discounts and whether the owner approved or modified
SELECT 
    dr.id AS 'Req ID',
    s.invoice_no AS 'Invoice #',
    u.name AS 'Seller Name',
    dr.requested_discount_percent AS 'Requested Discount %',
    dr.modified_discount_percent AS 'Owner Approved %',
    dr.status AS 'Approval Status',
    dr.reason AS 'Reason',
    dr.createdAt AS 'Request Time'
FROM discountrequests dr
JOIN sales s ON dr.sale_id = s.id
JOIN users u ON dr.seller_id = u.id
ORDER BY dr.id DESC;


-- 🔄 REPORT 6: OLD GOLD EXCHANGE TRANSACTIONS
-- View all old gold traded in against new jewellery purchases
SELECT 
    ge.exchange_no AS 'Exchange #',
    s.invoice_no AS 'Sales Invoice #',
    c.name AS 'Customer Name',
    ge.old_metal AS 'Metal',
    ge.old_purity AS 'Purity',
    ge.old_net_weight AS 'Net Wt (g)',
    ge.old_rate AS 'Exchange Rate/g (₹)',
    ge.deduction_percent AS 'Melting/Wastage %',
    ge.old_gold_value AS 'Old Gold Value Credited (₹)',
    ge.createdAt AS 'Date'
FROM goldexchanges ge
LEFT JOIN sales s ON ge.sale_id = s.id
LEFT JOIN customers c ON ge.customer_id = c.id
ORDER BY ge.id DESC;


-- =======================================================================
-- SECTION 4: SAMPLE TEST DATA FOR EMPTY TABLES (OPTIONAL)
-- (Run this if you want to test Suppliers, Purchases, Expenses, etc.)
-- =======================================================================

-- 1. Insert a Test Supplier (if none exist)
INSERT IGNORE INTO suppliers (id, name, phone, email, address, gst_number, opening_balance, total_purchases, outstanding_balance, createdAt, updatedAt)
VALUES (1, 'Vasanth Bullion & Casting', '9876500001', 'vasanth@bullion.com', '12/4 Bazaar St, Sowcarpet, Chennai', '33ABCDE1234F1Z5', 0, 0, 0, NOW(), NOW());

-- 2. Insert a Sample Expense
INSERT IGNORE INTO expenses (id, category, amount, description, payment_method, `date`, created_by, createdAt, updatedAt)
VALUES (1, 'ELECTRICITY', 4500, 'EB Bill for Showroom - AC & Spotlights', 'UPI', CURDATE(), 1, NOW(), NOW());

-- 3. Insert a Sample Customer Advance Order
INSERT IGNORE INTO advancepayments (id, customer_id, order_ref, advance_amount, payment_method, total_order_amount, balance_amount, status, notes, recorded_by, createdAt, updatedAt)
VALUES (1, 1, 'ORD-2026-001', 25000, 'UPI', 120000, 95000, 'ACTIVE', 'Advance for 22K Bridal Necklace custom order', 1, NOW(), NOW());


-- =======================================================================
-- SECTION 5: COMPLETE DDL (TABLE DEFINITIONS REFERENCE)
-- All 20 tables exact schema structure as defined in Sequelize
-- =======================================================================

/*
-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    raw_password VARCHAR(255) NULL,
    role ENUM('ADMIN', 'OWNER', 'SELLER') NOT NULL,
    name VARCHAR(255) NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- JEWELLERIES TABLE
CREATE TABLE IF NOT EXISTS jewelleries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(255) NOT NULL UNIQUE,
    barcode VARCHAR(255) NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(255) NOT NULL,
    subcategory VARCHAR(255) DEFAULT 'Standard',
    metal VARCHAR(255) NOT NULL DEFAULT 'Gold',
    purity VARCHAR(255) NOT NULL DEFAULT '22K',
    weight FLOAT NOT NULL,
    gross_weight FLOAT DEFAULT 0,
    stone_weight FLOAT DEFAULT 0,
    net_weight FLOAT DEFAULT 0,
    making_charge FLOAT NOT NULL DEFAULT 0,
    making_charge_type ENUM('PERCENTAGE', 'PER_GRAM', 'FIXED') DEFAULT 'PERCENTAGE',
    wastage_percent FLOAT DEFAULT 0,
    stone_charge FLOAT DEFAULT 0,
    other_charges FLOAT DEFAULT 0,
    purchase_cost FLOAT DEFAULT 0,
    base_price FLOAT NOT NULL DEFAULT 0,
    selling_price FLOAT NOT NULL DEFAULT 0,
    stock INT NOT NULL DEFAULT 1,
    min_stock INT DEFAULT 1,
    supplier_id INT NULL,
    status ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'LOW_STOCK', 'OUT_OF_STOCK', 'INACTIVE') DEFAULT 'AVAILABLE',
    image_url VARCHAR(255) NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(255) NOT NULL,
    email VARCHAR(255) NULL,
    address TEXT NULL,
    dob DATE NULL,
    notes TEXT NULL,
    total_purchases FLOAT DEFAULT 0,
    outstanding_balance FLOAT DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- SALES TABLE
CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_no VARCHAR(255) NULL UNIQUE,
    total_amount FLOAT NOT NULL,
    gross_amount FLOAT DEFAULT 0,
    discount_amount FLOAT DEFAULT 0,
    tax_amount FLOAT DEFAULT 0,
    tax_percent FLOAT DEFAULT 3,
    round_off FLOAT DEFAULT 0,
    final_amount FLOAT NOT NULL,
    paid_amount FLOAT DEFAULT 0,
    balance_amount FLOAT DEFAULT 0,
    status ENUM('PENDING_APPROVAL', 'APPROVED', 'MODIFIED', 'REJECTED', 'COMPLETED', 'CANCELLED') DEFAULT 'COMPLETED',
    payment_status ENUM('PAID', 'PARTIALLY_PAID', 'PENDING', 'REFUNDED') DEFAULT 'PAID',
    payment_method ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'SPLIT', 'OTHER') NULL,
    seller_id INT NULL,
    customer_id INT NULL,
    notes TEXT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- SALEITEMS TABLE
CREATE TABLE IF NOT EXISTS saleitems (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quantity INT DEFAULT 1,
    gross_weight FLOAT DEFAULT 0,
    stone_weight FLOAT DEFAULT 0,
    net_weight FLOAT DEFAULT 0,
    purity VARCHAR(255) DEFAULT '22K',
    gold_rate FLOAT DEFAULT 0,
    gold_value FLOAT DEFAULT 0,
    making_charge FLOAT DEFAULT 0,
    wastage_amount FLOAT DEFAULT 0,
    stone_charge FLOAT DEFAULT 0,
    other_charges FLOAT DEFAULT 0,
    discount_amount FLOAT DEFAULT 0,
    tax_amount FLOAT DEFAULT 0,
    price FLOAT NOT NULL,
    final_amount FLOAT DEFAULT 0,
    sale_id INT NULL,
    jewellery_id INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- DISCOUNTREQUESTS TABLE
CREATE TABLE IF NOT EXISTS discountrequests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requested_discount_percent FLOAT NOT NULL,
    status ENUM('PENDING', 'APPROVED', 'REJECTED', 'MODIFIED') DEFAULT 'PENDING',
    modified_discount_percent FLOAT NULL,
    reason TEXT NULL,
    sale_id INT NULL,
    seller_id INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- GOLDRATES TABLE
CREATE TABLE IF NOT EXISTS goldrates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    metal ENUM('GOLD', 'SILVER', 'PLATINUM') DEFAULT 'GOLD',
    purity VARCHAR(255) NOT NULL,
    rate_per_gram FLOAT NOT NULL,
    previous_rate FLOAT DEFAULT 0,
    updated_by INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- SUPPLIERS TABLE
CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(255) NOT NULL,
    email VARCHAR(255) NULL,
    address TEXT NULL,
    gst_number VARCHAR(255) NULL,
    bank_details TEXT NULL,
    opening_balance FLOAT DEFAULT 0,
    total_purchases FLOAT DEFAULT 0,
    outstanding_balance FLOAT DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- PURCHASES TABLE
CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_invoice_no VARCHAR(255) NOT NULL,
    supplier_id INT NOT NULL,
    date DATE NULL,
    total_amount FLOAT NOT NULL DEFAULT 0,
    paid_amount FLOAT DEFAULT 0,
    payment_status ENUM('PAID', 'PARTIALLY_PAID', 'PENDING') DEFAULT 'PAID',
    notes TEXT NULL,
    created_by INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- PURCHASEITEMS TABLE
CREATE TABLE IF NOT EXISTS purchaseitems (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    jewellery_id INT NULL,
    metal VARCHAR(255) DEFAULT 'Gold',
    purity VARCHAR(255) DEFAULT '22K',
    gross_weight FLOAT DEFAULT 0,
    stone_weight FLOAT DEFAULT 0,
    net_weight FLOAT DEFAULT 0,
    rate FLOAT DEFAULT 0,
    making_charge FLOAT DEFAULT 0,
    purchase_cost FLOAT NOT NULL DEFAULT 0,
    quantity INT DEFAULT 1,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NULL,
    customer_id INT NULL,
    amount FLOAT NOT NULL,
    payment_method ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER') DEFAULT 'CASH',
    reference_no VARCHAR(255) NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status ENUM('SUCCESS', 'PENDING', 'REFUNDED') DEFAULT 'SUCCESS',
    notes VARCHAR(255) NULL,
    recorded_by INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ADVANCEPAYMENTS TABLE
CREATE TABLE IF NOT EXISTS advancepayments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    order_ref VARCHAR(255) NULL,
    advance_amount FLOAT NOT NULL,
    payment_method ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER') DEFAULT 'CASH',
    total_order_amount FLOAT DEFAULT 0,
    balance_amount FLOAT DEFAULT 0,
    status ENUM('ACTIVE', 'ADJUSTED', 'CANCELLED') DEFAULT 'ACTIVE',
    notes TEXT NULL,
    recorded_by INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- SALESRETURNS TABLE
CREATE TABLE IF NOT EXISTS salesreturns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_invoice_no VARCHAR(255) NOT NULL UNIQUE,
    sale_id INT NOT NULL,
    customer_id INT NULL,
    total_refund_amount FLOAT NOT NULL,
    reason TEXT NULL,
    status ENUM('COMPLETED', 'PENDING') DEFAULT 'COMPLETED',
    processed_by INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- SALESRETURNITEMS TABLE
CREATE TABLE IF NOT EXISTS salesreturnitems (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_id INT NOT NULL,
    sale_item_id INT NULL,
    jewellery_id INT NOT NULL,
    quantity INT DEFAULT 1,
    refund_amount FLOAT NOT NULL,
    return_reason VARCHAR(255) NULL,
    `condition` VARCHAR(255) DEFAULT 'Good',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- GOLDEXCHANGES TABLE
CREATE TABLE IF NOT EXISTS goldexchanges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exchange_no VARCHAR(255) NOT NULL UNIQUE,
    sale_id INT NULL,
    customer_id INT NULL,
    old_metal VARCHAR(255) DEFAULT 'Gold',
    old_purity VARCHAR(255) DEFAULT '22K',
    old_gross_weight FLOAT DEFAULT 0,
    old_stone_weight FLOAT DEFAULT 0,
    old_net_weight FLOAT DEFAULT 0,
    old_rate FLOAT DEFAULT 0,
    deduction_percent FLOAT DEFAULT 0,
    old_gold_value FLOAT DEFAULT 0,
    new_jewellery_value FLOAT DEFAULT 0,
    amount_difference FLOAT DEFAULT 0,
    notes TEXT NULL,
    created_by INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- EXPENSES TABLE
CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category ENUM('RENT', 'ELECTRICITY', 'SALARY', 'TRANSPORT', 'MAINTENANCE', 'MARKETING', 'OFFICE', 'OTHER') DEFAULT 'OTHER',
    amount FLOAT NOT NULL,
    description TEXT NULL,
    payment_method ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER') DEFAULT 'CASH',
    `date` DATE NULL,
    created_by INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- AUDITLOGS TABLE
CREATE TABLE IF NOT EXISTS auditlogs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(255) NOT NULL,
    module VARCHAR(255) NOT NULL,
    details TEXT NULL,
    previous_value TEXT NULL,
    new_value TEXT NULL,
    user_id INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message VARCHAR(255) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    type VARCHAR(255) NOT NULL,
    metadata TEXT NULL,
    user_id INT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- SETTINGS TABLE
CREATE TABLE IF NOT EXISTS settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(255) NOT NULL UNIQUE,
    `value` TEXT NOT NULL,
    description VARCHAR(255) NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- INVOICESEQUENCES TABLE
CREATE TABLE IF NOT EXISTS invoicesequences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    `year` INT NOT NULL,
    prefix VARCHAR(255) DEFAULT 'GF',
    last_number INT DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
*/
