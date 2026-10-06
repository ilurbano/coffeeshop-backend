const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  QUEUED: 'queued',
  READY: 'ready',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
};

const PAYMENT_METHOD = {
  CASH: 'cash',
  CARD: 'card',
  ONLINE: 'online',
};

module.exports = {
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
};
