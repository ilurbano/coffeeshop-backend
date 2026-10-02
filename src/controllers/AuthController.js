const AUTH_RESPONSES = require('../constants/AuthResponseConstants');
const GENERIC_RESPONSES = require('../constants/GenericResponseConstants');

const AuthService = require('../services/AuthService');

const registerCustomer = async (req, res) => {
  const userData = req.body;

  const response = await AuthService.registerCustomer(userData);

  switch (response.code) {
    case AUTH_RESPONSES.registration.success.code:
      return res.status(201).json(response);
    case AUTH_RESPONSES.registration.userAlreadyExists.code:
      return res.status(409).json(response);
    case AUTH_RESPONSES.registration.missingData.code:
      return res.status(400).json(response);
    case AUTH_RESPONSES.registration.invalidData.code:
      return res.status(400).json(response);
    case GENERIC_RESPONSES.internalServerError.code:
      return res.status(500).json(response);
  }
}

const login = async (req, res) => {
  const { email, password } = req.body || {};

  const response = await AuthService.login(email, password);

  switch (response.code) {
    case AUTH_RESPONSES.login.success.code:
      return res.status(200).json(response);
    case AUTH_RESPONSES.login.userNotExists.code:
      return res.status(404).json(response);
    case AUTH_RESPONSES.login.missingData.code:
      return res.status(400).json(response);
    case AUTH_RESPONSES.login.invalidData.code:
      return res.status(400).json(response);
    case GENERIC_RESPONSES.internalServerError.code:
      return res.status(500).json(response);
  }
}

module.exports = {
  registerCustomer,
  login,
};
