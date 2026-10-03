const GENERIC_RESPONSES = {
  success: { code: 0, message: 'Success' },
  fail: { code: 1, message: 'Fail' },
  actionRequired: { code: 2, message: 'Action Required' },
  internalServerError: { code: 3, message: 'Internal Server Error' },
}

module.exports = GENERIC_RESPONSES;
