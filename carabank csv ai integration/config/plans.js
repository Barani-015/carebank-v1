const PLAN_MAP = {
  free: { name: 'Free', price: 0, billing: 'free', emoji: '🌟', isPremium: false, duration: null },
  monthly: { name: 'Pro Monthly', price: 499, billing: 'monthly', emoji: '🚀', isPremium: true, duration: 30 },
  yearly: { name: 'Pro Yearly', price: 4999, billing: 'yearly', emoji: '💎', isPremium: true, duration: 365 }
};

module.exports = { PLAN_MAP };