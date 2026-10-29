/**
 * GoldFlow Jewellery Calculation Engine
 * Reusable pricing engine for jewellery POS billing, estimation, and custom orders.
 */

function calculateJewelleryItem({
  gross_weight = 0,
  stone_weight = 0,
  net_weight = null,
  purity = '22K',
  gold_rate = 0,
  making_charge = 0,
  making_charge_type = 'PERCENTAGE', // 'PERCENTAGE', 'PER_GRAM', 'FIXED'
  wastage_percent = 0,
  stone_charge = 0,
  other_charges = 0,
  discount_percent = 0,
  tax_percent = 3, // Standard 3% GST on Gold Jewellery in India
  quantity = 1,
  selling_price = 0,
  pricing_mode = 'WEIGHT_RATE' // 'FIXED_PRICE' or 'WEIGHT_RATE'
}) {
  const gross = Math.max(0, parseFloat(gross_weight) || 0);
  const stone = Math.max(0, parseFloat(stone_weight) || 0);
  const net = net_weight != null && !isNaN(net_weight) && parseFloat(net_weight) > 0 
    ? parseFloat(net_weight) 
    : Math.max(0, gross - stone);
  
  const rate = Math.max(0, parseFloat(gold_rate) || 0);
  const qty = Math.max(1, parseInt(quantity) || 1);
  const sellPrice = Math.max(0, parseFloat(selling_price) || 0);
  const isFixed = pricing_mode === 'FIXED_PRICE' && sellPrice > 0;

  let singleGoldValue = 0;
  let totalGoldValue = 0;
  let singleWastageAmount = 0;
  let totalWastageAmount = 0;
  let singleMakingAmount = 0;
  let totalMakingAmount = 0;
  let totalStoneCharge = 0;
  let totalOtherCharges = 0;
  let itemGrossAmount = 0;

  if (isFixed) {
    // 1. Fixed / Tag Selling Price is the all-inclusive total item price
    itemGrossAmount = sellPrice * qty;
    totalStoneCharge = Math.min(itemGrossAmount, Math.max(0, parseFloat(stone_charge) || 0) * qty);
    totalOtherCharges = 0;
    totalGoldValue = Math.max(0, itemGrossAmount - totalStoneCharge);
    singleGoldValue = qty > 0 ? (totalGoldValue / qty) : 0;
    singleWastageAmount = 0;
    totalWastageAmount = 0;
    singleMakingAmount = 0;
    totalMakingAmount = 0;
  } else {
    // 1. Gold Value = Net Weight * Gold Rate * Quantity
    singleGoldValue = net * rate;
    totalGoldValue = singleGoldValue * qty;

    // 2. Wastage = Gold Value * (Wastage % / 100)
    const wastagePct = Math.max(0, parseFloat(wastage_percent) || 0);
    singleWastageAmount = singleGoldValue * (wastagePct / 100);
    totalWastageAmount = singleWastageAmount * qty;

    // 3. Making Charges
    const mcVal = Math.max(0, parseFloat(making_charge) || 0);
    if (making_charge_type === 'PERCENTAGE') {
      singleMakingAmount = singleGoldValue * (mcVal / 100);
    } else if (making_charge_type === 'PER_GRAM') {
      singleMakingAmount = net * mcVal;
    } else {
      // FIXED
      singleMakingAmount = mcVal;
    }
    totalMakingAmount = singleMakingAmount * qty;

    // 4. Stone & Other Charges
    totalStoneCharge = Math.max(0, parseFloat(stone_charge) || 0) * qty;
    totalOtherCharges = Math.max(0, parseFloat(other_charges) || 0) * qty;

    // 5. Item Gross Subtotal before discount
    itemGrossAmount = totalGoldValue + totalWastageAmount + totalMakingAmount + totalStoneCharge + totalOtherCharges;
  }

  // 6. Discount
  const discPct = Math.max(0, Math.min(100, parseFloat(discount_percent) || 0));
  const discountAmount = itemGrossAmount * (discPct / 100);
  const taxableAmount = Math.max(0, itemGrossAmount - discountAmount);

  // 7. Tax (GST)
  const taxPct = Math.max(0, parseFloat(tax_percent) || 0);
  const taxAmount = taxableAmount * (taxPct / 100);

  // 8. Final Amount
  const finalAmount = taxableAmount + taxAmount;

  return {
    quantity: qty,
    gross_weight: Number(gross.toFixed(3)),
    stone_weight: Number(stone.toFixed(3)),
    net_weight: Number(net.toFixed(3)),
    purity,
    pricing_mode: isFixed ? 'FIXED_PRICE' : 'WEIGHT_RATE',
    selling_price: sellPrice,
    gold_rate: isFixed ? (net > 0 ? Number((sellPrice / net).toFixed(2)) : rate) : Number(rate.toFixed(2)),
    gold_value: Number(totalGoldValue.toFixed(2)),
    wastage_percent: isFixed ? 0 : Math.max(0, parseFloat(wastage_percent) || 0),
    wastage_amount: Number(totalWastageAmount.toFixed(2)),
    making_charge: isFixed ? 0 : Math.max(0, parseFloat(making_charge) || 0),
    making_charge_type,
    making_amount: Number(totalMakingAmount.toFixed(2)),
    stone_charge: Number(totalStoneCharge.toFixed(2)),
    other_charges: Number(totalOtherCharges.toFixed(2)),
    gross_amount: Number(itemGrossAmount.toFixed(2)),
    discount_percent: discPct,
    discount_amount: Number(discountAmount.toFixed(2)),
    taxable_amount: Number(taxableAmount.toFixed(2)),
    tax_percent: taxPct,
    tax_amount: Number(taxAmount.toFixed(2)),
    final_amount: Number(finalAmount.toFixed(2))
  };
}

/**
 * Calculate totals for a full sale with round-off
 */
function calculateSaleTotals(items = [], globalDiscountPct = 0, taxPercent = 3, roundOffEnabled = true) {
  let gross_amount = 0;
  let gold_value_total = 0;
  let wastage_amount_total = 0;
  let making_amount_total = 0;
  let stone_charge_total = 0;
  let other_charges_total = 0;
  let discount_amount_total = 0;
  let taxable_amount_total = 0;
  let tax_amount_total = 0;
  let raw_final_amount = 0;

  const calculatedItems = items.map(item => {
    // If item has individual discount, use it; otherwise use global if applied
    const disc = item.discount_percent != null && !isNaN(item.discount_percent) 
      ? parseFloat(item.discount_percent) 
      : parseFloat(globalDiscountPct) || 0;

    const calc = calculateJewelleryItem({
      ...item,
      discount_percent: disc,
      tax_percent: taxPercent
    });

    gross_amount += calc.gross_amount;
    gold_value_total += calc.gold_value;
    wastage_amount_total += calc.wastage_amount;
    making_amount_total += calc.making_amount;
    stone_charge_total += calc.stone_charge;
    other_charges_total += calc.other_charges;
    discount_amount_total += calc.discount_amount;
    taxable_amount_total += calc.taxable_amount;
    tax_amount_total += calc.tax_amount;
    raw_final_amount += calc.final_amount;

    return { ...item, ...calc };
  });

  let round_off = 0;
  let final_amount = raw_final_amount;

  if (roundOffEnabled) {
    const rounded = Math.round(raw_final_amount);
    round_off = Number((rounded - raw_final_amount).toFixed(2));
    final_amount = rounded;
  }

  return {
    items: calculatedItems,
    gross_amount: Number(gross_amount.toFixed(2)),
    gold_value_total: Number(gold_value_total.toFixed(2)),
    wastage_amount_total: Number(wastage_amount_total.toFixed(2)),
    making_amount_total: Number(making_amount_total.toFixed(2)),
    stone_charge_total: Number(stone_charge_total.toFixed(2)),
    other_charges_total: Number(other_charges_total.toFixed(2)),
    discount_amount: Number(discount_amount_total.toFixed(2)),
    taxable_amount: Number(taxable_amount_total.toFixed(2)),
    tax_amount: Number(tax_amount_total.toFixed(2)),
    tax_percent: taxPercent,
    round_off,
    final_amount: Number(final_amount.toFixed(2))
  };
}

module.exports = {
  calculateJewelleryItem,
  calculateSaleTotals
};
