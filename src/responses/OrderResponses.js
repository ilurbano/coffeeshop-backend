const { success, fail } = require('./GenericResponses');

const ORDER_RESPONSES = {
  success: {
    code: 300,
    message: 'Order operation successful.',
  },
  notFound: {
    code: 301,
    message: 'Order not found.',
  },
  missingData: {
    code: 302,
    message: 'Missing required order data.',
  },
  invalidData: {
    code: 303,
    message: 'Invalid order data.',
  },
  invalidTransition: {
    code: 304,
    message: 'Invalid order status transition.',
  },
  insufficientStock: {
    code: 305,
    message: 'Insufficient product stock.',
  },
  voucherInvalid: {
    code: 306,
    message: 'Invalid voucher.',
  },
  riderConflict: {
    code: 307,
    message: 'Order is already assigned to another rider.',
  },
  forbidden: {
    code: 308,
    message: 'You are not allowed to manage this order.',
  },
};

const response = (key, payload, message) =>
  key === 'success'
    ? success(
        payload,
        message || ORDER_RESPONSES[key].message,
        ORDER_RESPONSES[key].code
      )
    : fail(
        payload,
        message || ORDER_RESPONSES[key].message,
        ORDER_RESPONSES[key].code
      );

module.exports = {
  success: (data, message) => response('success', data, message),
  notFound: (message) => response('notFound', null, message),
  missingData: (fields, message) =>
    response('missingData', { missingFields: fields }, message),
  invalidData: (fields, message) =>
    response('invalidData', { invalidFields: fields }, message),
  invalidTransition: (message) =>
    response('invalidTransition', null, message),
  insufficientStock: (message) =>
    response('insufficientStock', null, message),
  voucherInvalid: (message) =>
    response('voucherInvalid', null, message),
  riderConflict: (message) =>
    response('riderConflict', null, message),
  forbidden: (message) => response('forbidden', null, message),
};

module.exports.codes = ORDER_RESPONSES;
