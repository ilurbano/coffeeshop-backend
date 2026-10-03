const AUTH_RESPONSES = {

  //============//
  // AUTH (1xx) //
  //============//

  // REGISTRATION (10x) //

  registration: {
    success: { code: 100, message: 'Registration successful.' },
    userAlreadyExists: { code: 101, message: 'User already exists.' },
    missingData: { code: 102, message: 'Missing required registration data.' },
    invalidData: { code: 103, message: 'Invalid registration data.' },
  },

  // LOGIN (11x) //

  login: {
    success: { code: 110, message: 'Login successful.' },
    userNotExists: { code: 111, message: 'User does not exist.' },
    missingData: { code: 112, message: 'Missing required login data.' },
    invalidData: { code: 113, message: 'Invalid login data.' },
  },

  // SESSION (12x) //

  session: {
    logoutSuccess: { code: 120, message: 'Logout successful.' },
    invalidSession: { code: 121, message: 'Invalid session.' },
    forbidden: { code: 122, message: 'Forbidden.' },
  },

  // FORGOT PASSWORD (13x) //

  forgotPassword: {
    passwordResetSuccess: { code: 130, message: 'Password reset successful.' },
    passwordResetOtpVerified: { code: 131, message: 'Password reset OTP verified.' },
    passwordResetRequested: { code: 132, message: 'Password reset requested.' },
    userNotExists: { code: 133, message: 'User does not exist.' },
    missingData: { code: 134, message: 'Missing required data for password reset.' },
    invalidData: { code: 135, message: 'Invalid data for password reset.' },
  },

  // RESOURCE ACCESS (14x) //

  resourceAccess: {
    granted: { code: 140, message: 'Resource access granted.' },
    denied: { code: 141, message: 'Resource access denied.' },
  }

};

module.exports = AUTH_RESPONSES;
