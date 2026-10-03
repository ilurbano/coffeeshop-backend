const AUTH_RESPONSES = require('../constants/AuthResponseConstants');

const { success, fail } = require('./GenericResponses')

//==============//
// REGISTRATION //
//==============//

const registrationSuccess = (data) => success(
  data,
  AUTH_RESPONSES.registration.success.message,
  AUTH_RESPONSES.registration.success.code
);

const registrationUserAlreadyExists = (message) => fail(
  null,
  message || AUTH_RESPONSES.registration.userAlreadyExists.message,
  AUTH_RESPONSES.registration.userAlreadyExists.code
);

const registrationMissingData = (missingFields, message) => fail(
  { missingFields },
  message || AUTH_RESPONSES.registration.missingData.message,
  AUTH_RESPONSES.registration.missingData.code
);

const registrationInvalidData = (invalidFields, message) => fail(
  { invalidFields },
  message || AUTH_RESPONSES.registration.invalidData.message,
  AUTH_RESPONSES.registration.invalidData.code
);

//=======//
// LOGIN //
//=======//

const loginSuccess = (data) => success(
  data,
  AUTH_RESPONSES.login.success.message,
  AUTH_RESPONSES.login.success.code
);

const loginUserNotExists = (message) => fail(
  null,
  message || AUTH_RESPONSES.login.userNotExists.message,
  AUTH_RESPONSES.login.userNotExists.code
);

const loginMissingData = (missingFields, message) => fail(
  { missingFields },
  message || AUTH_RESPONSES.login.missingData.message,
  AUTH_RESPONSES.login.missingData.code
);

const loginInvalidData = (invalidFields, message) => fail(
  { invalidFields },
  message || AUTH_RESPONSES.login.invalidData.message,
  AUTH_RESPONSES.login.invalidData.code
);

//=========//
// SESSION //
//=========//

const sessionLogoutSuccess = (message) => success(
  null,
  message || AUTH_RESPONSES.session.logoutSuccess.message,
  AUTH_RESPONSES.session.logoutSuccess.code
);

const sessionInvalidSession = (message) => fail(
  null,
  message || AUTH_RESPONSES.session.invalidSession.message,
  AUTH_RESPONSES.session.invalidSession.code
);

const sessionForbidden = (message) => fail(
  null,
  message || AUTH_RESPONSES.session.forbidden.message,
  AUTH_RESPONSES.session.forbidden.code
);

//=================//
// FORGOT PASSWORD //
//=================//

const forgotPasswordResetSuccess = (message) => success(
  null,
  message || AUTH_RESPONSES.forgotPassword.passwordResetSuccess.message,
  AUTH_RESPONSES.forgotPassword.passwordResetSuccess.code
);

const forgotPasswordOtpVerified = (message) => success(
  null,
  message || AUTH_RESPONSES.forgotPassword.passwordResetOtpVerified.message,
  AUTH_RESPONSES.forgotPassword.passwordResetOtpVerified.code
);

const forgotPasswordRequested = (message) => success(
  null,
  message || AUTH_RESPONSES.forgotPassword.passwordResetRequested.message,
  AUTH_RESPONSES.forgotPassword.passwordResetRequested.code
);

const forgotPasswordUserNotExists = (message) => fail(
  null,
  message || AUTH_RESPONSES.forgotPassword.userNotExists.message,
  AUTH_RESPONSES.forgotPassword.userNotExists.code
);

const forgotPasswordMissingData = (missingFields, message) => fail(
  { missingFields },
  message || AUTH_RESPONSES.forgotPassword.missingData.message,
  AUTH_RESPONSES.forgotPassword.missingData.code
);

const forgotPasswordInvalidData = (invalidFields, message) => fail(
  { invalidFields },
  message || AUTH_RESPONSES.forgotPassword.invalidData.message,
  AUTH_RESPONSES.forgotPassword.invalidData.code
);

//=================//
// RESOURCE ACCESS //
//=================//

const accessGranted = (data, message) => success(
  data,
  message || AUTH_RESPONSES.resourceAccess.granted.message,
  AUTH_RESPONSES.resourceAccess.granted.code
);

const accessDenied = (message) => fail(
  null,
  message || AUTH_RESPONSES.resourceAccess.denied.message,
  AUTH_RESPONSES.resourceAccess.denied.code
);

//========//
// EXPORT //
//========//

module.exports = {
  registration: {
    success: registrationSuccess,
    userAlreadyExists: registrationUserAlreadyExists,
    missingData: registrationMissingData,
    invalidData: registrationInvalidData
  },
  login: {
    success: loginSuccess,
    userNotExists: loginUserNotExists,
    missingData: loginMissingData,
    invalidData: loginInvalidData
  },
  session: {
    logoutSuccess: sessionLogoutSuccess,
    invalidSession: sessionInvalidSession,
    forbidden: sessionForbidden
  },
  forgotPassword: {
    passwordResetSuccess: forgotPasswordResetSuccess,
    passwordResetOtpVerified: forgotPasswordOtpVerified,
    passwordResetRequested: forgotPasswordRequested,
    userNotExists: forgotPasswordUserNotExists,
    missingData: forgotPasswordMissingData,
    invalidData: forgotPasswordInvalidData
  },
  resourceAccess: {
    granted: accessGranted,
    denied: accessDenied
  }
}
