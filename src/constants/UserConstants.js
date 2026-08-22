// TODO: Confirm if `manager` and `admin` roles should be merged or kept separate.
const USER_ROLES = {
  CUSTOMER: 'customer',
  DELIVERY: 'delivery',
  CREW: 'crew',
  MANAGER: 'manager',
  ADMIN: 'admin',
}

const VALID_EMAIL_REGEX = /.+@.+\..+/;
const VALID_PHONE_NUMBER_REGEX = /^(?:\+63|0)9\d{9}$/;

module.exports = {
  USER_ROLES,
  VALID_EMAIL_REGEX,
  VALID_PHONE_NUMBER_REGEX
};
