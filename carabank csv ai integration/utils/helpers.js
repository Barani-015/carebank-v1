const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

const calculateDiscount = (price, discountPercent) => {
  const discountAmount = (price * discountPercent) / 100;
  const finalPrice = Math.max(0, price - discountAmount);
  return { discountAmount, finalPrice };
};

module.exports = { formatCurrency, calculateDiscount };