const express = require('express');
const router = express.Router();
const { Expense, User, AuditLog } = require('../models');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { Op } = require('sequelize');

// Get all expenses with optional date/category filter
router.get('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { category, startDate, endDate } = req.query;
    const where = {};

    if (category) where.category = category;
    if (startDate && endDate) {
      where.date = { [Op.between]: [startDate, endDate] };
    }

    const expenses = await Expense.findAll({
      where,
      include: [{ model: User, attributes: ['id', 'name', 'role'] }],
      order: [['date', 'DESC'], ['createdAt', 'DESC']]
    });

    const totalExpense = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);

    res.json({
      totalExpense: Math.round(totalExpense * 100) / 100,
      expenses
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create Expense
router.post('/', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { category, amount, description, payment_method = 'CASH', date } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ message: 'Valid expense amount is required' });
    }

    const expense = await Expense.create({
      category: category || 'OTHER',
      amount: amt,
      description: description || '',
      payment_method,
      date: date || new Date(),
      created_by: req.user.id
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'ADD_EXPENSE',
      module: 'EXPENSES',
      details: `Added ${category} expense of ₹${amt} (${description || 'No description'})`
    });

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete Expense
router.delete('/:id', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const expense = await Expense.findByPk(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_EXPENSE',
      module: 'EXPENSES',
      details: `Deleted ${expense.category} expense of ₹${expense.amount}`
    });

    await expense.destroy();
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk Delete Expenses
router.post('/bulk-delete', authenticate, requireRole(['ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No expenses selected' });
    }

    const deletedCount = await Expense.destroy({ where: { id: { [Op.in]: ids } } });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'BULK_DELETE_EXPENSES',
      module: 'EXPENSES',
      details: `Bulk deleted ${deletedCount} expenses`
    });

    res.json({ success: true, deletedCount, message: `${deletedCount} expense(s) deleted successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error in bulk deleting expenses', error: error.message });
  }
});

module.exports = router;
