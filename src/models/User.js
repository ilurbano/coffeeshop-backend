const mongoose = require('mongoose');

const { USER_ROLES } = require('../constants/UserConstants');

const USER_ROLES_ENUM = Object.values(USER_ROLES);

const schema = new mongoose.Schema({

  //============//
  // BASIC INFO //
  //============//

  firstName: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 50,
  },
  middleName: {
    type: String,
    trim: true,
    minlength: 1,
    maxlength: 50,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 50,
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true,
    match: [/^(?:\+63|0)9\d{9}$/, 'Please fill a valid contact number'],
  },

  //==================================//
  // AUTHENTICATION AND AUTHORIZATION //
  //==================================//

  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/.+@.+\..+/, 'Please fill a valid email address'],
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
  },
  role: {
    type: String,
    enum: USER_ROLES_ENUM,
    default: USER_ROLES.CUSTOMER,
  },
}, { timestamps: true });

module.exports = mongoose.model('User', schema);
