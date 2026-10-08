const { success, fail } = require('./GenericResponses');

const VOUCHER_RESPONSES = {
  success: {
    code: 400,
    message: 'Voucher operation successful.',
  },
  notFound: {
    code: 401,
    message: 'Voucher not found.',
  },
  missingData: {
    code: 402,
    message: 'Missing required voucher data.',
  },
  invalidData: {
    code: 403,
    message: 'Invalid voucher data.',
  },
  conflict: {
    code: 404,
    message: 'Voucher already exists.',
  },
  unavailable: {
    code: 405,
    message: 'Voucher is unavailable.',
  },
};

const response = (key, payload, message) =>
  key === 'success'
    ? success(
        payload,
        message || VOUCHER_RESPONSES[key].message,
        VOUCHER_RESPONSES[key].code
      )
    : fail(
        payload,
        message || VOUCHER_RESPONSES[key].message,
        VOUCHER_RESPONSES[key].code
      );

module.exports = {
  success: (data, message) => response('success', data, message),
  notFound: (message) => response('notFound', null, message),
  missingData: (fields, message) =>
    response('missingData', { missingFields: fields }, message),
  invalidData: (fields, message) =>
    response('invalidData', { invalidFields: fields }, message),
  conflict: (message) => response('conflict', null, message),
  unavailable: (message) => response('unavailable', null, message),
};

module.exports.codes = VOUCHER_RESPONSES;
