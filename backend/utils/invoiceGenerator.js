const { InvoiceSequence, Setting } = require('../models');

/**
 * Generate next sequential invoice number in format GF-2026-000001
 * Atomically increments sequence within transaction
 */
async function generateNextInvoiceNumber(transaction = null) {
  const currentYear = new Date().getFullYear();

  // Fetch prefix from settings or default to GF
  let prefix = 'GF';
  try {
    const setting = await Setting.findOne({ where: { key: 'invoice_prefix' } });
    if (setting && setting.value) prefix = setting.value.trim().toUpperCase();
  } catch (e) {
    // fallback
  }

  // Find or create sequence for this year
  let [seq, created] = await InvoiceSequence.findOrCreate({
    where: { year: currentYear },
    defaults: { year: currentYear, prefix, last_number: 0 },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : false
  });

  const { Sale } = require('../models');
  let currentMax = seq.last_number || 0;

  // Verify against highest existing invoice in Sales to guarantee 0 collisions
  const latestSale = await Sale.findOne({
    where: {
      invoice_no: { [require('sequelize').Op.like]: `${prefix}-${currentYear}-%` }
    },
    order: [['invoice_no', 'DESC']],
    attributes: ['invoice_no'],
    transaction
  });

  if (latestSale && latestSale.invoice_no) {
    const match = latestSale.invoice_no.match(/(\d+)$/);
    if (match) {
      currentMax = Math.max(currentMax, parseInt(match[1], 10));
    }
  }

  const nextNum = currentMax + 1;
  seq.last_number = nextNum;
  seq.prefix = prefix;
  await seq.save({ transaction });

  const paddedNum = String(nextNum).padStart(6, '0');
  return `${prefix}-${currentYear}-${paddedNum}`;
}

async function generateNextReturnInvoiceNumber(transaction = null) {
  const currentYear = new Date().getFullYear();
  let [seq] = await InvoiceSequence.findOrCreate({
    where: { year: currentYear, prefix: 'RET' },
    defaults: { year: currentYear, prefix: 'RET', last_number: 0 },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : false
  });

  const nextNum = (seq.last_number || 0) + 1;
  seq.last_number = nextNum;
  await seq.save({ transaction });

  const paddedNum = String(nextNum).padStart(6, '0');
  return `RET-${currentYear}-${paddedNum}`;
}

async function generateNextExchangeNumber(transaction = null) {
  const currentYear = new Date().getFullYear();
  let [seq] = await InvoiceSequence.findOrCreate({
    where: { year: currentYear, prefix: 'EXC' },
    defaults: { year: currentYear, prefix: 'EXC', last_number: 0 },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : false
  });

  const nextNum = (seq.last_number || 0) + 1;
  seq.last_number = nextNum;
  await seq.save({ transaction });

  const paddedNum = String(nextNum).padStart(6, '0');
  return `EXC-${currentYear}-${paddedNum}`;
}

async function generateNextEstimateNumber(transaction = null) {
  const currentYear = new Date().getFullYear();
  let prefix = 'GF-EST';
  try {
    const setting = await Setting.findOne({ where: { key: 'invoice_prefix' } });
    if (setting && setting.value) prefix = `${setting.value.trim().toUpperCase()}-EST`;
  } catch (e) {}

  let [seq] = await InvoiceSequence.findOrCreate({
    where: { year: currentYear, prefix },
    defaults: { year: currentYear, prefix, last_number: 0 },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : false
  });

  const { Sale } = require('../models');
  let currentMax = seq.last_number || 0;

  // Scan all existing estimates in Sale to find absolute maximum sequence
  const existingEstimates = await Sale.findAll({
    where: {
      invoice_no: { [require('sequelize').Op.like]: `${prefix}-${currentYear}-%` }
    },
    attributes: ['invoice_no'],
    transaction
  });

  for (const est of existingEstimates) {
    if (est.invoice_no) {
      const match = est.invoice_no.match(/(\d+)$/);
      if (match) {
        currentMax = Math.max(currentMax, parseInt(match[1], 10));
      }
    }
  }

  const nextNum = currentMax + 1;
  seq.last_number = nextNum;
  await seq.save({ transaction });

  const paddedNum = String(nextNum).padStart(6, '0');
  return `${prefix}-${currentYear}-${paddedNum}`;
}

module.exports = {
  generateNextInvoiceNumber,
  generateNextEstimateNumber,
  generateNextReturnInvoiceNumber,
  generateNextExchangeNumber
};

