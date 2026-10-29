const express = require('express');
const router = express.Router();
const { User, AuditLog } = require('../models');
const bcrypt = require('bcrypt');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

// List users (Admin & Owner)
router.get('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'role', 'name', 'raw_password', 'createdAt'],
      order: [['createdAt', 'ASC']]
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create user (Admin only)
router.post('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { username, password, role, name } = req.body;
    if (!username || !password || !role || !name) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    const existing = await User.findOne({ where: { username } });
    if (existing) {
      return res.status(400).json({ message: 'Username already taken' });
    }
    const hash = await bcrypt.hash(password, 10);
    const newUser = await User.create({ username, password_hash: hash, raw_password: password, role, name });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_USER',
      module: 'USERS',
      details: `Created ${role} account: ${name} (@${username})`
    });

    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      name: newUser.name
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete user (Admin only)
router.delete('/:id', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.id === req.user.id) return res.status(400).json({ message: 'Cannot delete yourself' });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_USER',
      module: 'USERS',
      details: `Deleted user: ${user.name} (@${user.username})`
    });

    await user.destroy();
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// Bulk Delete users (Admin only)
router.post('/bulk-delete', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No users selected' });
    }

    if (ids.includes(req.user.id.toString()) || ids.includes(req.user.id)) {
      return res.status(400).json({ message: 'Cannot delete yourself in a bulk operation' });
    }

    const users = await User.findAll({ where: { id: ids } });
    const userNames = users.map(u => u.name).join(', ');

    await AuditLog.create({
      user_id: req.user.id,
      action: 'BULK_DELETE_USERS',
      module: 'USERS',
      details: `Deleted users: ${userNames}`
    });

    await User.destroy({ where: { id: ids } });
    res.json({ message: 'Users deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
