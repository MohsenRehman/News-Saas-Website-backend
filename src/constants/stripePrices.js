const STRIPE_PRICES = {
  basic: {
    monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY,
    yearly: process.env.STRIPE_PRICE_BASIC_YEARLY,
  },
  professional: {
    monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
    yearly: process.env.STRIPE_PRICE_PROFESSIONAL_YEARLY,
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY,
  },
  lifetime: {
    one_time: process.env.STRIPE_PRICE_LIFETIME,
  },
};

module.exports = {
  STRIPE_PRICES,
};
