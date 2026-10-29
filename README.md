# 👑 GoldFlow — Jewellery Shop ERP & POS Software

**GoldFlow** is a full-featured Jewellery Shop Management ERP & Point-of-Sale (POS) system built with **Node.js, Express, Sequelize (MySQL), and Socket.IO**. It supports multi-role workflows (**Admin, Owner, Seller, Cashier**), live market Gold & Silver rate synchronization, barcode/QR tag scanning, real-time Owner discount approvals, Old Gold exchanges, Customer advances, and GST-compliant invoicing.

---

## 🔐 Demo Login Credentials (Username & Password)

You can log in directly using the **Quick Role Login** buttons on the Sign-In page or by entering the credentials below:

| Role | Username | Password | Access & Responsibilities |
| :--- | :--- | :--- | :--- |
| **⚙️ Admin** | `admin` | `password123` | Full ERP Control, Inventory, Staff Management, Suppliers, Purchases, Settings, Audit Logs |
| **👑 Owner** | `owner` | `password123` | Live Business Analytics, Real-Time Discount Approvals (via Web or QR Scan), Gold Rate Control |
| **🛒 Seller 1** | `seller1` | `password123` | Jewellery POS Billing, Estimate Slip Generation, QR Tag Scanning, Discount Requests |
| **🛒 Seller 2** | `seller2` | `password123` | Jewellery POS Billing, Customer Onboarding, Old Gold Exchange Calculation |
| **🛒 Seller 3** | `seller3` | `password123` | Jewellery POS Billing & Estimate Generation |
| **💵 Cashier** | `cashier` | `cashier123` | Cash Counter Checkout, Bill QR Scan & Payment Collection (Cash/UPI/Card/Split), Customer Dues |

---

## 🗄️ Demo Database Included

This repository includes a complete **20-table MySQL Demo Database** pre-populated with realistic jewellery inventory, live gold/silver rates, customers, suppliers, purchase bills, sales invoices, discount approvals, old gold exchanges, advance bookings, and demo staff credentials:

1. **`demo_database.sql`** — Complete ready-to-import SQL dump (creates the `goldflow` database, all 20 tables, and inserts full demo data + demo users).
2. **`goldflow_database_setup.sql`** — Clean schema + demo user accounts setup script.
3. **`goldflow_workbench_all_tables.sql`** — MySQL Workbench inspection & business reporting queries across all 20 tables.
4. **`seed_all_20_tables.js`** — Node.js automated database seeder (`npm run seed`).
5. **Auto-Seed on Startup** — Even if you start the server on an empty `goldflow` database, `server.js` automatically syncs all 20 tables and seeds the default demo users, gold rates, settings, sample jewellery items, suppliers, and customers!

---

## 🚀 Quick Start & Installation

### 1. Clone the Repository
```bash
git clone https://github.com/J-egathis/GoldFlow-Jewellery-Shop-Software.git
cd GoldFlow-Jewellery-Shop-Software
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure MySQL Database
Make sure **MySQL Server** is running locally, then either:

- **Option A (Import SQL File in MySQL Workbench / CLI):**
  ```bash
  mysql -u root -p < demo_database.sql
  ```
- **Option B (Automatic Setup via Node.js):**
  Simply create an empty database named `goldflow` in MySQL:
  ```sql
  CREATE DATABASE IF NOT EXISTS goldflow;
  ```
  Then copy `.env.example` to `.env` (or update your MySQL password in `.env`):
  ```env
  PORT=3000
  DB_HOST=localhost
  DB_PORT=3306
  DB_NAME=goldflow
  DB_USER=root
  DB_PASS=jasim004
  JWT_SECRET=goldflow_secret_key_123
  ```
  Run the seeder (optional — the server also auto-seeds on first launch):
  ```bash
  npm run seed
  ```

### 4. Start the Server
```bash
npm start
```
Open your browser and visit:
- **PC Browser:** `http://localhost:3000`
- **Mobile / LAN Devices (for QR Scanning):** `http://<YOUR-LOCAL-IP>:3000`

---

## ✨ Key Features

- **📈 Live Gold & Silver Rate Engine:** Supports 24K, 22K, 18K Gold and Silver (999 / 925) with dynamic ornament pricing (`Net Weight × Gold Rate + Making Charge + Wastage + Stone Charge + GST`).
- **📱 Universal QR Scanner & Mobile Estimate Slips:** Print or scan estimate slips (`GF-...`) and ornament barcode tags (`GFJ00001`). Owners can scan a customer's estimate slip QR on their phone to approve or modify discounts in real time!
- **⚡ Real-Time Socket.IO Sync:** Instant notifications between Sellers, Owner, and Cashier when discounts are requested, approved, or ready for payment at the Cash Counter.
- **🔄 Complete Jewellery ERP (20 Tables):**
  - `Users`, `Jewelleries`, `Customers`, `Sales`, `SaleItems`
  - `DiscountRequests`, `GoldRates`, `Suppliers`, `Purchases`, `PurchaseItems`
  - `Payments`, `AdvancePayments`, `GoldExchanges`, `SalesReturns`, `SalesReturnItems`
  - `Expenses`, `AuditLogs`, `Notifications`, `Settings`, `InvoiceSequences`
