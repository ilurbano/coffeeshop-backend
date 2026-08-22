const GENERIC_RESPONSES = require('../constants/GenericResponseConstants');

//===========================//
// GENERIC SERVICE RESPONSES //
//===========================//

const respond = (payload, message = "Server responded.", code = 0) => {
  return {
    payload,
    message,
    code
  };
}

const success = (payload, message, code) => {
  return respond(
    payload,
    message || GENERIC_RESPONSES.success.message,
    code || GENERIC_RESPONSES.success.code
  );
}

const fail = (payload, message, code) => {
  return respond(
    payload,
    message || GENERIC_RESPONSES.fail.message,
    code || GENERIC_RESPONSES.fail.code
  );
}

const actionRequired = (payload, message, code) => {
  return respond(
    payload,
    message || GENERIC_RESPONSES.actionRequired.message,
    code || GENERIC_RESPONSES.actionRequired.code
  );
}

const internalServerError = (payload, message, code) => {
  return respond(
    payload,
    message || GENERIC_RESPONSES.internalServerError.message,
    code || GENERIC_RESPONSES.internalServerError.code
  );
}

//========//
// EXPORT //
//========//

module.exports = {
  respond,
  success,
  fail,
  actionRequired,
  internalServerError
};
