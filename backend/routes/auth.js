const express = require('express');
const router = express.Router();
const { User } = require('../models');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'goldflow_secret_key_123';

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '1d' });
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Seed Initial Data (For demo purposes)
router.post('/seed', async (req, res) => {
  try {
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
      const existing = await User.findOne({ where: { username: u.username } });
      if (!existing) {
        await User.create(u);
      }
    }

    res.json({ message: 'Demo users verified and seeded successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
