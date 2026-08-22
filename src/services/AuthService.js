const User = require('../models/User');

const AuthResponses = require('../responses/AuthResponses');
const GenericResponses = require('../responses/GenericResponses');

const { encryptPassword, passwordsMatch, generateJWT } = require('../utils/AuthUtils');
const LogUtils = require('../utils/LogUtils');
const { isValidEmail, isValidPhoneNumber } = require('../utils/UserUtils');

//=======================//
// CUSTOMER REGISTRATION //
//=======================//

const registerCustomer = async (userData) => {
  const { firstName, middleName, lastName, contactNumber, username, email, password } = userData;

  // Validate required fields

  const missingFields = [];

  if (!firstName?.trim()) missingFields.push('firstName');
  if (!lastName?.trim()) missingFields.push('lastName');
  if (!contactNumber?.trim()) missingFields.push('contactNumber');

  if (!username?.trim()) missingFields.push('username');
  if (!email?.trim()) missingFields.push('email');
  if (!password) missingFields.push('password');

  if (missingFields.length > 0)
    return AuthResponses.registration.missingData(missingFields);

  // Validate email and contact number formats

  const invalidFields = [];

  if (!isValidPhoneNumber(contactNumber.trim())) invalidFields.push('contactNumber');
  if (!isValidEmail(email.trim())) invalidFields.push('email');

  if (invalidFields.length > 0)
    return AuthResponses.registration.invalidData(invalidFields);

  try {
    const existingUser = await User.findOne({
      or: [
        { email: email.trim().toLowerCase() },
        { username: username.trim() },
        { contactNumber: contactNumber.trim() }
      ]
    });

    if (existingUser) return AuthResponses.registration.userAlreadyExists();

    const hashedPassword = await encryptPassword(password);

    const newUser = await User.create({
      firstName: firstName.trim(),
      middleName: middleName?.trim() || '',
      lastName: lastName.trim(),
      contactNumber: contactNumber.trim(),
      
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
    });

    delete newUser.password;

    return AuthResponses.registration.success(newUser);
  } catch (error) {
    LogUtils.logError(`Error in registerCustomer: ${error.message}`);
    return GenericResponses.internalServerError();
  }
}

//============//
// USER LOGIN //
//============//

const login = async (email, password) => {
  let username;
  let contactNumber;

  // Validate required fields

  const missingFields = [];

  if (!email?.trim()) missingFields.push('email');
  if (!password) missingFields.push('password');

  if (missingFields.length > 0)
    return AuthResponses.login.missingData(missingFields);

  // Assume contact number if email is not valid and is a valid phone number,
  // otherwise assume username
  
  if (!isValidEmail(email.trim()) && isValidPhoneNumber(email.trim()))
    contactNumber = email.trim();
  else
    username = email.trim();

  try {
    const user = await User.findOne({
      $or: [
        { email: email.trim().toLowerCase() },
        { username },
        { contactNumber }
      ]
    });

    // User enumeration attack trap

    if (!user) {
      // Dummy hash for timing attack mitigation
      await passwordsMatch(password, '$2a$10$2kOvhI7tsdn5dimSrOISxe8BDG7YlzRz6xiu8CPC.CJBL1nzzkaKq')
      return AuthResponses.login.invalidData(['email', 'password']);
    }

    const isPasswordMatch = await passwordsMatch(password, user.password);

    if (!isPasswordMatch) return AuthResponses.login.invalidData(['email', 'password']);

    const token = generateJWT(user);

    delete user.password;

    return AuthResponses.login.success({ user, token });
  } catch (error) {
    LogUtils.logError(`Error in login: ${error.message}`);
    return GenericResponses.internalServerError();
  }
}

//========//
// EXPORT //
//========//

module.exports = {
  registerCustomer,
  login,
};
