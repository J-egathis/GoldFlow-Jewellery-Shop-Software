const express = require('express');
const router = express.Router();
const { AuditLog, User } = require('../models');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// Get audit logs with filter (Admin and Owner only)
router.get('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { module, action, search } = req.query;
    const where = {};

    if (module) where.module = module;
    if (action) where.action = action;
    if (search) {
      where.details = { [Op.like]: `%${search.trim()}%` };
    }

    const logs = await AuditLog.findAll({
      where,
      include: [{ model: User, attributes: ['id', 'name', 'role', 'username'] }],
      order: [['createdAt', 'DESC']],
      limit: 200
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
