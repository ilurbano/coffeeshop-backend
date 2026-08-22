const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');

const LogUtils = require('./LogUtils');

const encryptPassword = async (password) => {
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  return hashedPassword;
}

const passwordsMatch = async (password, hashedPassword) => {
  const match = await bcrypt.compare(password, hashedPassword);
  return match;
}

const generateJWT = (user) => {
  const payload = {
    id: user._id,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
  return token;
}

const verifyJWT = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    return user;
  } catch (error) {
    LogUtils.logWarn(`Error verifying JWT: ${error.message}`);
    return null;
  }
}

module.exports = {
  encryptPassword,
  passwordsMatch,
  generateJWT,
  verifyJWT,
};
