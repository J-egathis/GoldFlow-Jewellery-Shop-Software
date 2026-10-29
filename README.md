<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&height=120&section=header" width="100%" />

# 👑 GOLDFLOW — JEWELLERY SHOP SOFTWARE

### Weigh • Scan • Bill • Manage

![GOLDFLOW ERP](https://img.shields.io/badge/GOLDFLOW%20ERP-4A6FA5?style=for-the-badge)
![MODERN UI/UX](https://img.shields.io/badge/MODERN-UI%2FUX-F4A2B8?style=for-the-badge)
![RESPONSIVE DESIGN](https://img.shields.io/badge/RESPONSIVE-DESIGN-88D4AB?style=for-the-badge)
![DIGITAL POS](https://img.shields.io/badge/DIGITAL-POS%20%26%20ERP-FCEEA7?style=for-the-badge)
![2026 PREMIUM](https://img.shields.io/badge/2026-PREMIUM-111827?style=for-the-badge)

### A Modern QR-Powered Jewellery Shop ERP & POS Experience

**GoldFlow** is a full-stack Jewellery Showroom Management ERP & Point-of-Sale (POS) platform built with **Node.js, Express, Sequelize (MySQL), and Socket.IO**. It streamlines ornament inventory, live Gold & Silver market rate synchronization, QR estimate slips, real-time Owner discount approvals, Old Gold exchanges, and Cashier checkout.

</div>

---

## 🔐 Demo Login Credentials (Username & Password)

You can sign in with a single click using the **Quick Role Login** chips on the login page or enter the demo credentials below:

| Role | Username | Password | Dashboard & Responsibilities |
| :--- | :--- | :--- | :--- |
| **⚙️ Admin** | `admin` | `password123` | Full ERP Control, Inventory, Staff Management, Suppliers, Purchases, Settings, Audit Logs |
| **👑 Owner** | `owner` | `password123` | Live Revenue Analytics, Real-Time Discount Approvals (Web & Mobile QR Scan), Gold Rate Control |
| **🛒 Seller 1** | `seller1` | `password123` | Jewellery POS Billing, Estimate Slip Generation, Ornament Barcode/QR Scanning, Discount Requests |
| **🛒 Seller 2** | `seller2` | `password123` | Jewellery POS Billing, Customer Onboarding, Old Gold Exchange Calculation |
| **🛒 Seller 3** | `seller3` | `password123` | Jewellery POS Billing & Estimate Generation |
| **💵 Cashier** | `cashier` | `cashier123` | Cash Counter Checkout, Bill QR Scan & Payment Collection (Cash / UPI / Card / Split), Customer Dues |

---

## 🗄️ Demo Database Included (20 MySQL Tables)

This repository includes a complete **20-table MySQL Demo Database** pre-loaded with demo staff accounts, live 24K/22K/18K gold & silver rates, jewellery inventory, suppliers, customers, purchase bills, sales invoices, discount requests, old gold exchanges, advance bookings, and expenses:

| File | Description |
| :--- | :--- |
| **`demo_database.sql`** | Complete ready-to-import MySQL dump (creates `goldflow` database, all 20 tables, and inserts full demo data & login credentials) |
| **`goldflow_database_setup.sql`** | Clean 20-table schema + demo user accounts setup script |
| **`goldflow_workbench_all_tables.sql`** | MySQL Workbench inspection & business report queries across all 20 tables |
| **`seed_all_20_tables.js`** | Automated Node.js seeder script (`npm run seed`) |

> 💡 **Auto-Seed on Startup:** Even if you start the server on an empty `goldflow` database, `server.js` automatically syncs all 20 tables and seeds the default demo users, gold rates, settings, sample jewellery items, suppliers, and customers!

---

## ✨ Key Features

- **📈 Live Gold & Silver Rate Engine** — Supports **24K, 22K, 18K Gold** and **Silver (999 / 925)** with automated ornament pricing (`Net Weight × Gold Rate + Making Charge + Wastage + Stone Charge + GST`).
- **📱 Universal QR Scanner & Digital Estimate Slips** — Generate thermal/A4 estimate slips with QR codes (`GF-...`) and scan ornament barcode tags (`GFJ00001`). Owners can scan a customer's estimate slip QR on their phone to approve or modify discounts instantly.
- **⚡ Real-Time Socket.IO Sync** — Instant live notifications across Seller, Owner, and Cashier terminals when discounts are requested, approved, or sent to the Cash Counter.
- **🔄 Old Gold Exchange & Returns** — Calculate melting/wastage deductions on old gold and credit net exchange value directly against new jewellery invoices.
- **📊 Complete 20-Table ERP Architecture** — Covers `Users`, `Jewelleries`, `Customers`, `Sales`, `SaleItems`, `DiscountRequests`, `GoldRates`, `Suppliers`, `Purchases`, `PurchaseItems`, `Payments`, `AdvancePayments`, `GoldExchanges`, `SalesReturns`, `SalesReturnItems`, `Expenses`, `AuditLogs`, `Notifications`, `Settings`, and `InvoiceSequences`.

---

## 🛠️ Tech Stack

<div align="center">

![NodeJS](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Sequelize](https://img.shields.io/badge/Sequelize-52B0E7?style=for-the-badge&logo=sequelize&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=JSON%20web%20tokens&logoColor=white)

</div>

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

### 3. Setup the Demo Database
Ensure **MySQL Server** is running locally, then choose either method:

- **Option A — Import Demo SQL File (MySQL Workbench / CLI):**
  ```bash
  mysql -u root -p < demo_database.sql
  ```
- **Option B — Automatic Setup via Node.js:**
  Create an empty database in MySQL (`CREATE DATABASE IF NOT EXISTS goldflow;`), configure `.env` from `.env.example`, and run:
  ```bash
  npm run seed
  ```

### 4. Start the Application
```bash
npm start
```
- **💻 Access on PC:** `http://localhost:3000`
- **📱 Access on Phones (Same Wi-Fi):** `http://<YOUR-LOCAL-IP>:3000`

---

## 📜 License

This project is created for **educational, portfolio, and demonstration purposes.**

© 2026 **Jegathis M**

---

## 👨‍💻 Developer

### Jegathis M

🎓 B.Sc Computer Science  
💻 Full Stack Developer  
🎨 Frontend Developer  
🤖 AI Enthusiast  

### GitHub

https://github.com/J-egathis

---

<div align="center">

## 👑 GOLDFLOW JEWELLERY ERP

---

### Weigh. Scan. Bill. Manage.

**Transforming Traditional Jewellery Showrooms into Digital Experiences.**

<br>

⭐ **If you like this project, consider giving the repository a Star!**

<br>

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&height=120&section=footer" width="100%" />

</div>
