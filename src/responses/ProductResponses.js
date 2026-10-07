const { success, fail } = require('./GenericResponses');

const PRODUCT_RESPONSES = {
  success: {
    code: 200,
    message: 'Product operation successful.',
  },
  notFound: {
    code: 201,
    message: 'Product not found.',
  },
  missingData: {
    code: 202,
    message: 'Missing required product data.',
  },
  invalidData: {
    code: 203,
    message: 'Invalid product data.',
  },
  conflict: {
    code: 204,
    message: 'Product already exists.',
  },
};

const response = (key, payload, message) =>
  key === 'success'
    ? success(
        payload,
        message || PRODUCT_RESPONSES[key].message,
        PRODUCT_RESPONSES[key].code
      )
    : fail(
        payload,
        message || PRODUCT_RESPONSES[key].message,
        PRODUCT_RESPONSES[key].code
      );

module.exports = {
  success: (data, message) => response('success', data, message),
  notFound: (message) => response('notFound', null, message),
  missingData: (fields, message) =>
    response('missingData', { missingFields: fields }, message),
  invalidData: (fields, message) =>
    response('invalidData', { invalidFields: fields }, message),
  conflict: (message) => response('conflict', null, message),
};

module.exports.codes = PRODUCT_RESPONSES;
