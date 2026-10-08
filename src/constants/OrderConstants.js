const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  QUEUED: 'queued',
  READY: 'ready',
  CLAIMED: 'claimed',
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

const ORDER_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['queued', 'cancelled'],
  queued: ['ready', 'cancelled'],
  ready: ['claimed', 'cancelled'],
  claimed: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

module.exports = {
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  ORDER_STATUS_TRANSITIONS,
};
