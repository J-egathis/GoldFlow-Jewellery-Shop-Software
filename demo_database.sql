-- =======================================================================
-- GOLDFLOW JEWELLERY SHOP ERP & POS SOFTWARE - COMPLETE DEMO DATABASE
-- =======================================================================
-- Database Name : goldflow
-- Total Tables  : 20 Tables (Pre-populated with Demo Data)
--
-- DEMO LOGIN CREDENTIALS:
-- +-----------+-------------+---------+-------------------------------+
-- | Username  | Password    | Role    | Name                          |
-- +-----------+-------------+---------+-------------------------------+
-- | admin     | password123 | ADMIN   | System Admin                  |
-- | owner     | password123 | OWNER   | Rajesh Kumar (Owner)          |
-- | seller1   | password123 | SELLER  | Rahul Sharma (Seller 1)       |
-- | seller2   | password123 | SELLER  | Priya Patel (Seller 2)        |
-- | seller3   | password123 | SELLER  | Amit Verma (Seller 3)         |
-- | cashier   | cashier123  | CASHIER | Karthik Nair (Cashier)        |
-- +-----------+-------------+---------+-------------------------------+
-- =======================================================================

CREATE DATABASE IF NOT EXISTS goldflow;
USE goldflow;

SET FOREIGN_KEY_CHECKS = 0;

-- Drop existing tables if re-importing
DROP TABLE IF EXISTS InvoiceSequences;
DROP TABLE IF EXISTS Settings;
DROP TABLE IF EXISTS Notifications;
DROP TABLE IF EXISTS AuditLogs;
DROP TABLE IF EXISTS Expenses;
DROP TABLE IF EXISTS GoldExchanges;
DROP TABLE IF EXISTS SalesReturnItems;
DROP TABLE IF EXISTS SalesReturns;
DROP TABLE IF EXISTS AdvancePayments;
DROP TABLE IF EXISTS Payments;
DROP TABLE IF EXISTS PurchaseItems;
DROP TABLE IF EXISTS Purchases;
DROP TABLE IF EXISTS Suppliers;
DROP TABLE IF EXISTS GoldRates;
DROP TABLE IF EXISTS DiscountRequests;
DROP TABLE IF EXISTS SaleItems;
DROP TABLE IF EXISTS Sales;
DROP TABLE IF EXISTS Customers;
DROP TABLE IF EXISTS Jewelleries;
DROP TABLE IF EXISTS Users;

-- 1. Users Table
CREATE TABLE Users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    raw_password VARCHAR(255) DEFAULT NULL,
    role ENUM('ADMIN', 'OWNER', 'SELLER', 'CASHIER') NOT NULL,
    name VARCHAR(255) NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Suppliers Table
CREATE TABLE Suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(255) NOT NULL,
    email VARCHAR(255) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    gst_number VARCHAR(255) DEFAULT NULL,
    bank_details TEXT DEFAULT NULL,
    opening_balance FLOAT DEFAULT 0,
    total_purchases FLOAT DEFAULT 0,
    outstanding_balance FLOAT DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Jewelleries Table
CREATE TABLE Jewelleries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(255) NOT NULL UNIQUE,
    barcode VARCHAR(255) DEFAULT NULL UNIQUE,
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
    supplier_id INT DEFAULT NULL,
    status ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'LOW_STOCK', 'OUT_OF_STOCK', 'INACTIVE') DEFAULT 'AVAILABLE',
    image_url VARCHAR(255) DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES Suppliers(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 4. Customers Table
CREATE TABLE Customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(255) NOT NULL,
    email VARCHAR(255) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    dob DATE DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    total_purchases FLOAT DEFAULT 0,
    outstanding_balance FLOAT DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. Sales Table
CREATE TABLE Sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_no VARCHAR(255) DEFAULT NULL UNIQUE,
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
    payment_method ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'SPLIT', 'OTHER') DEFAULT NULL,
    seller_id INT DEFAULT NULL,
    customer_id INT DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES Customers(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 6. SaleItems Table
CREATE TABLE SaleItems (
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
    sale_id INT DEFAULT NULL,
    jewellery_id INT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES Sales(id) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (jewellery_id) REFERENCES Jewelleries(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 7. DiscountRequests Table
CREATE TABLE DiscountRequests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requested_discount_percent FLOAT NOT NULL,
    status ENUM('PENDING', 'APPROVED', 'REJECTED', 'MODIFIED') DEFAULT 'PENDING',
    modified_discount_percent FLOAT DEFAULT NULL,
    reason TEXT DEFAULT NULL,
    sale_id INT DEFAULT NULL,
    seller_id INT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES Sales(id) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 8. GoldRates Table
CREATE TABLE GoldRates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    metal ENUM('GOLD', 'SILVER', 'PLATINUM') DEFAULT 'GOLD',
    purity VARCHAR(255) NOT NULL,
    rate_per_gram FLOAT NOT NULL,
    previous_rate FLOAT DEFAULT 0,
    updated_by INT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 9. Purchases Table
CREATE TABLE Purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_invoice_no VARCHAR(255) NOT NULL,
    supplier_id INT NOT NULL,
    date DATE DEFAULT NULL,
    total_amount FLOAT NOT NULL DEFAULT 0,
    paid_amount FLOAT DEFAULT 0,
    payment_status ENUM('PAID', 'PARTIALLY_PAID', 'PENDING') DEFAULT 'PAID',
    notes TEXT DEFAULT NULL,
    created_by INT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES Suppliers(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 10. PurchaseItems Table
CREATE TABLE PurchaseItems (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    jewellery_id INT DEFAULT NULL,
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
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_id) REFERENCES Purchases(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (jewellery_id) REFERENCES Jewelleries(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 11. Payments Table
CREATE TABLE Payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT DEFAULT NULL,
    customer_id INT DEFAULT NULL,
    amount FLOAT NOT NULL,
    payment_method ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER') DEFAULT 'CASH',
    reference_no VARCHAR(255) DEFAULT NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status ENUM('SUCCESS', 'PENDING', 'REFUNDED') DEFAULT 'SUCCESS',
    notes VARCHAR(255) DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES Sales(id) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES Customers(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 12. AdvancePayments Table
CREATE TABLE AdvancePayments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    order_ref VARCHAR(255) DEFAULT NULL,
    advance_amount FLOAT NOT NULL,
    payment_method ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER') DEFAULT 'CASH',
    total_order_amount FLOAT DEFAULT 0,
    balance_amount FLOAT DEFAULT 0,
    status ENUM('ACTIVE', 'ADJUSTED', 'CANCELLED') DEFAULT 'ACTIVE',
    notes TEXT DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES Customers(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 13. SalesReturns Table
CREATE TABLE SalesReturns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_invoice_no VARCHAR(255) NOT NULL UNIQUE,
    sale_id INT NOT NULL,
    customer_id INT DEFAULT NULL,
    total_refund_amount FLOAT NOT NULL,
    reason TEXT DEFAULT NULL,
    status ENUM('COMPLETED', 'PENDING') DEFAULT 'COMPLETED',
    processed_by INT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES Sales(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES Customers(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 14. SalesReturnItems Table
CREATE TABLE SalesReturnItems (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_id INT NOT NULL,
    sale_item_id INT DEFAULT NULL,
    jewellery_id INT NOT NULL,
    quantity INT DEFAULT 1,
    refund_amount FLOAT NOT NULL,
    return_reason VARCHAR(255) DEFAULT NULL,
    `condition` VARCHAR(255) DEFAULT 'Good',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (return_id) REFERENCES SalesReturns(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (jewellery_id) REFERENCES Jewelleries(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 15. GoldExchanges Table
CREATE TABLE GoldExchanges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exchange_no VARCHAR(255) NOT NULL UNIQUE,
    sale_id INT DEFAULT NULL,
    customer_id INT DEFAULT NULL,
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
    notes TEXT DEFAULT NULL,
    created_by INT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES Sales(id) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES Customers(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 16. Expenses Table
CREATE TABLE Expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category ENUM('RENT', 'ELECTRICITY', 'SALARY', 'TRANSPORT', 'MAINTENANCE', 'MARKETING', 'OFFICE', 'OTHER') DEFAULT 'OTHER',
    amount FLOAT NOT NULL,
    description TEXT DEFAULT NULL,
    payment_method ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER') DEFAULT 'CASH',
    `date` DATE DEFAULT NULL,
    created_by INT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 17. AuditLogs Table
CREATE TABLE AuditLogs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(255) NOT NULL,
    module VARCHAR(255) NOT NULL,
    details TEXT DEFAULT NULL,
    previous_value TEXT DEFAULT NULL,
    new_value TEXT DEFAULT NULL,
    user_id INT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 18. Notifications Table
CREATE TABLE Notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message VARCHAR(255) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    type VARCHAR(255) NOT NULL,
    metadata TEXT DEFAULT NULL,
    user_id INT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 19. Settings Table
CREATE TABLE Settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(255) NOT NULL UNIQUE,
    `value` TEXT NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 20. InvoiceSequences Table
CREATE TABLE InvoiceSequences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    `year` INT NOT NULL,
    prefix VARCHAR(255) DEFAULT 'GF',
    last_number INT DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =======================================================================
-- SEED DEMO DATA FOR ALL 20 TABLES
-- =======================================================================

-- 1. Seed Demo Users (Passwords: password123 for admin/owner/sellers, cashier123 for cashier)
INSERT INTO Users (id, username, password_hash, raw_password, role, name, createdAt, updatedAt) VALUES
(1, 'admin', '$2b$10$vffVgtRqnYjeWzK9XhTHsOBL.2a2iFUU93xLWVhw8CGro7MMiWxbi', 'password123', 'ADMIN', 'System Admin', NOW(), NOW()),
(2, 'owner', '$2b$10$vffVgtRqnYjeWzK9XhTHsOBL.2a2iFUU93xLWVhw8CGro7MMiWxbi', 'password123', 'OWNER', 'Rajesh Kumar (Owner)', NOW(), NOW()),
(3, 'seller1', '$2b$10$vffVgtRqnYjeWzK9XhTHsOBL.2a2iFUU93xLWVhw8CGro7MMiWxbi', 'password123', 'SELLER', 'Rahul Sharma (Seller 1)', NOW(), NOW()),
(4, 'seller2', '$2b$10$vffVgtRqnYjeWzK9XhTHsOBL.2a2iFUU93xLWVhw8CGro7MMiWxbi', 'password123', 'SELLER', 'Priya Patel (Seller 2)', NOW(), NOW()),
(5, 'seller3', '$2b$10$vffVgtRqnYjeWzK9XhTHsOBL.2a2iFUU93xLWVhw8CGro7MMiWxbi', 'password123', 'SELLER', 'Amit Verma (Seller 3)', NOW(), NOW()),
(6, 'cashier', '$2b$10$7L7RkPzLq7Zko3O.evwYx.pFaKJ0A0CHtusGxdudniY7WYna8gjZ.', 'cashier123', 'CASHIER', 'Karthik Nair (Cashier)', NOW(), NOW());

-- 2. Seed Gold Rates
INSERT INTO GoldRates (id, metal, purity, rate_per_gram, previous_rate, updated_by, createdAt, updatedAt) VALUES
(1, 'GOLD', '24K', 7500, 7450, 1, NOW(), NOW()),
(2, 'GOLD', '22K', 6875, 6830, 1, NOW(), NOW()),
(3, 'GOLD', '18K', 5625, 5590, 1, NOW(), NOW()),
(4, 'SILVER', 'SILVER_999', 98, 96, 1, NOW(), NOW()),
(5, 'SILVER', 'SILVER_925', 90, 89, 1, NOW(), NOW());

-- 3. Seed System Settings
INSERT INTO Settings (`key`, `value`, description, createdAt, updatedAt) VALUES
('shop_name', 'GoldFlow Jewellers', 'Business Store Name', NOW(), NOW()),
('shop_tagline', 'Fine Gold & Luxury Jewellery', 'Tagline on Invoices', NOW(), NOW()),
('shop_address', '123 Commercial Street, Gold Bazaar, Chennai, Tamil Nadu - 600001', 'Store Address', NOW(), NOW()),
('shop_phone', '+91 98765 43210 / 044-28345678', 'Store Phone', NOW(), NOW()),
('shop_email', 'contact@goldflowjewellers.com', 'Store Email', NOW(), NOW()),
('shop_gst', '33AAAAA0000A1Z5', 'GST Identification Number', NOW(), NOW()),
('invoice_prefix', 'GF', 'Invoice Number Prefix', NOW(), NOW()),
('tax_gst_percent', '3', 'Standard Jewellery GST (%)', NOW(), NOW()),
('round_off_enabled', 'true', 'Round off final invoice amount', NOW(), NOW()),
('default_making_charge', '12', 'Default Making Charge (%)', NOW(), NOW()),
('default_wastage_percent', '2', 'Default Wastage (%)', NOW(), NOW()),
('terms_and_conditions', 'Returns accepted within 7 days in original condition with bill. Weight and purity certified.', 'Terms printed on invoice', NOW(), NOW());

-- 4. Seed Suppliers
INSERT INTO Suppliers (id, name, phone, email, address, gst_number, opening_balance, total_purchases, outstanding_balance, createdAt, updatedAt) VALUES
(1, 'Vasanth Bullion & Casting', '9876500001', 'vasanth@bullion.com', '12/4 Bazaar St, Sowcarpet, Chennai', '33ABCDE1234F1Z5', 0, 850000, 150000, NOW(), NOW()),
(2, 'Emerald Chains & Ornaments Ltd', '9876500002', 'orders@emeraldchains.in', 'Industrial Area, Coimbatore', '33EMRLD5678K2Z9', 0, 1240000, 0, NOW(), NOW());

-- 5. Seed Jewelleries
INSERT INTO Jewelleries (id, code, barcode, name, category, metal, purity, weight, gross_weight, stone_weight, net_weight, making_charge, making_charge_type, wastage_percent, stone_charge, base_price, selling_price, stock, min_stock, status, image_url, supplier_id, createdAt, updatedAt) VALUES
(1, 'NL-22K-001', 'GFJ00001', 'Royal Antique Bridal Choker', 'Necklace', 'Gold', '22K', 48.5, 48.5, 4.2, 44.3, 12, 'PERCENTAGE', 2, 15000, 339500, 395000, 3, 2, 'AVAILABLE', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400', 1, NOW(), NOW()),
(2, 'RG-18K-015', 'GFJ00002', 'Solitaire Diamond Engagement Ring', 'Ring', 'Gold', '18K', 6.8, 6.8, 1.2, 5.6, 15, 'PERCENTAGE', 2, 45000, 135000, 185000, 2, 2, 'LOW_STOCK', 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400', 1, NOW(), NOW()),
(3, 'BG-22K-044', 'GFJ00003', 'Traditional Temple Kada Bangles (Pair)', 'Bangle', 'Gold', '22K', 62.0, 62.0, 0, 62.0, 10, 'PERCENTAGE', 1.5, 0, 434000, 477400, 4, 2, 'AVAILABLE', 'https://images.unsplash.com/photo-1611591475841-862277d337d1?w=400', 1, NOW(), NOW()),
(4, 'ER-22K-092', 'GFJ00004', 'Kundan Jhumka Earrings with Pearls', 'Earrings', 'Gold', '22K', 24.5, 24.5, 3.5, 21.0, 14, 'PERCENTAGE', 2.5, 8000, 171500, 203500, 5, 2, 'AVAILABLE', 'https://images.unsplash.com/photo-1635767798638-3e25273a8236?w=400', 1, NOW(), NOW()),
(5, 'CH-24K-008', 'GFJ00005', 'Pure Gold Handcrafted Rope Chain', 'Chain', 'Gold', '24K', 32.0, 32.0, 0, 32.0, 8, 'PERCENTAGE', 1, 0, 240000, 259200, 1, 2, 'LOW_STOCK', 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=400', 1, NOW(), NOW()),
(6, 'SL-999-011', 'GFJ00006', 'Sterling Silver Pooja Diya & Bell Set', 'Silverware', 'Silver', 'SILVER_999', 250.0, 250.0, 0, 250.0, 15, 'PER_GRAM', 0, 0, 24500, 28500, 8, 3, 'AVAILABLE', 'https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?w=400', 2, NOW(), NOW()),
(7, 'NL-22K-019', 'GFJ00007', 'Floral Motif Layered Haar', 'Necklace', 'Gold', '22K', 75.0, 75.0, 2.0, 73.0, 11, 'PERCENTAGE', 2, 5000, 525000, 587750, 2, 1, 'AVAILABLE', 'https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?w=400', 1, NOW(), NOW()),
(8, 'RG-22K-088', 'GFJ00008', 'Peacock Enamel Signet Ring', 'Ring', 'Gold', '22K', 8.5, 8.5, 0.5, 8.0, 12, 'PERCENTAGE', 1.5, 2000, 59500, 68640, 6, 3, 'AVAILABLE', 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=400', 1, NOW(), NOW());

-- 6. Seed Customers
INSERT INTO Customers (id, name, phone, email, address, total_purchases, outstanding_balance, createdAt, updatedAt) VALUES
(1, 'Ananya Deshmukh', '9820123456', 'ananya.d@gmail.com', 'Bandra West, Mumbai', 406850, 0, NOW(), NOW()),
(2, 'Suresh Singhania', '9811234567', 'suresh.s@singhania.in', 'Civil Lines, Delhi', 171495, 0, NOW(), NOW()),
(3, 'Meenakshi Iyer', '9444123456', 'meenakshi@outlook.com', 'T. Nagar, Chennai', 203500, 0, NOW(), NOW()),
(4, 'Kavita Agarwal', '9830123456', 'kavita.ag@gmail.com', 'Salt Lake, Kolkata', 0, 0, NOW(), NOW());

-- 7. Seed Purchases & PurchaseItems
INSERT INTO Purchases (id, purchase_invoice_no, supplier_id, date, total_amount, paid_amount, payment_status, notes, created_by, createdAt, updatedAt) VALUES
(1, 'PUR-2026-001', 1, '2026-10-01', 850000, 700000, 'PARTIALLY_PAID', 'Initial festival batch intake from Chennai bullion.', 1, NOW(), NOW());

INSERT INTO PurchaseItems (id, purchase_id, jewellery_id, metal, purity, gross_weight, stone_weight, net_weight, rate, making_charge, purchase_cost, quantity, createdAt, updatedAt) VALUES
(1, 1, 1, 'Gold', '22K', 120.5, 5.5, 115.0, 6850, 350, 850000, 3, NOW(), NOW());

-- 8. Seed Sales & SaleItems
INSERT INTO Sales (id, invoice_no, seller_id, customer_id, total_amount, gross_amount, discount_amount, tax_amount, tax_percent, round_off, final_amount, paid_amount, balance_amount, status, payment_status, payment_method, createdAt, updatedAt) VALUES
(1, 'GF-2026-000001', 3, 1, 395000, 395000, 0, 11850, 3, 0, 406850, 406850, 0, 'COMPLETED', 'PAID', 'CARD', NOW(), NOW()),
(2, 'GF-2026-000002', 3, 2, 185000, 185000, 18500, 4995, 3, 0, 171495, 171495, 0, 'APPROVED', 'PAID', 'UPI', NOW(), NOW());

INSERT INTO SaleItems (id, sale_id, jewellery_id, quantity, gross_weight, stone_weight, net_weight, purity, gold_rate, gold_value, making_charge, wastage_amount, stone_charge, price, final_amount, createdAt, updatedAt) VALUES
(1, 1, 1, 1, 48.5, 4.2, 44.3, '22K', 6875, 304562, 36547, 6091, 15000, 395000, 406850, NOW(), NOW()),
(2, 2, 2, 1, 6.8, 1.2, 5.6, '18K', 5625, 31500, 4725, 630, 45000, 185000, 171495, NOW(), NOW());

-- 9. Seed Payments
INSERT INTO Payments (id, sale_id, customer_id, amount, payment_method, reference_no, status, recorded_by, createdAt, updatedAt) VALUES
(1, 1, 1, 406850, 'CARD', 'HDFC-POS-99881', 'SUCCESS', 6, NOW(), NOW()),
(2, 2, 2, 171495, 'UPI', 'UPI-4288192011', 'SUCCESS', 6, NOW(), NOW());

-- 10. Seed DiscountRequests
INSERT INTO DiscountRequests (id, sale_id, seller_id, requested_discount_percent, modified_discount_percent, status, reason, createdAt, updatedAt) VALUES
(1, 2, 3, 10, 10, 'APPROVED', 'VIP Customer Festival Purchase', NOW(), NOW());

-- 11. Seed GoldExchanges
INSERT INTO GoldExchanges (id, exchange_no, sale_id, customer_id, old_metal, old_purity, old_gross_weight, old_stone_weight, old_net_weight, old_rate, deduction_percent, old_gold_value, new_jewellery_value, amount_difference, notes, created_by, createdAt, updatedAt) VALUES
(1, 'EXC-2026-00001', 1, 1, 'Gold', '22K', 20.0, 0.5, 19.5, 6850, 2, 130880, 395000, 264120, 'Customer exchanged old vintage necklace towards new bridal choker.', 3, NOW(), NOW());

-- 12. Seed AdvancePayments
INSERT INTO AdvancePayments (id, customer_id, order_ref, advance_amount, payment_method, total_order_amount, balance_amount, status, notes, recorded_by, createdAt, updatedAt) VALUES
(1, 3, 'ORD-2026-008', 25000, 'UPI', 110000, 85000, 'ACTIVE', 'Advance booking for 22K Lakshmi Pendant.', 3, NOW(), NOW());

-- 13. Seed Expenses
INSERT INTO Expenses (id, category, amount, description, payment_method, `date`, created_by, createdAt, updatedAt) VALUES
(1, 'ELECTRICITY', 4500, 'Showroom Electricity & AC bill', 'UPI', '2026-10-05', 1, NOW(), NOW());

-- 14. Seed AuditLogs & Notifications
INSERT INTO AuditLogs (id, action, module, details, user_id, createdAt, updatedAt) VALUES
(1, 'SYSTEM_INIT', 'DATABASE', 'All 20 tables verified and synchronized with default demo seed data.', 1, NOW(), NOW());

INSERT INTO Notifications (id, message, is_read, type, user_id, createdAt, updatedAt) VALUES
(1, 'Welcome to GoldFlow ERP! Demo database is loaded and ready.', FALSE, 'INFO', 1, NOW(), NOW());

-- 15. Seed InvoiceSequences
INSERT INTO InvoiceSequences (id, `year`, prefix, last_number, createdAt, updatedAt) VALUES
(1, 2026, 'GF', 2, NOW(), NOW());

SET FOREIGN_KEY_CHECKS = 1;
