const express = require('express');
const router = express.Router();
const { Notification } = require('../models');
const { authenticate } = require('../middleware/authMiddleware');

// Get all notifications for current user's role (or personal)
router.get('/', authenticate, async (req, res) => {
  try {
    // For now, if OWNER, show all OWNER relevant notifications (where user_id is null, or we can just fetch all)
    // Actually, Notification.create in sales.js doesn't set user_id for OWNER notifications.
    const notifs = await Notification.findAll({
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    res.json(notifs);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark all as read
router.post('/read', authenticate, async (req, res) => {
  try {
    await Notification.update({ is_read: true }, { where: { is_read: false } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
