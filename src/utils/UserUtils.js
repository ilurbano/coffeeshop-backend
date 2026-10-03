const { VALID_EMAIL_REGEX, VALID_PHONE_NUMBER_REGEX } = require('../constants/UserConstants');

const isValidEmail = (email) => VALID_EMAIL_REGEX.test(email);
const isValidPhoneNumber = (phoneNumber) => VALID_PHONE_NUMBER_REGEX.test(phoneNumber);

module.exports = {
  isValidEmail,
  isValidPhoneNumber
};
