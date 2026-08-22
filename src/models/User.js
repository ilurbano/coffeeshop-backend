const mongoose = require('mongoose');

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
    // TODO: Confirm if `manager` and `admin` roles should be merged or kept separate.
    enum: ['customer', 'delivery', 'crew', 'manager', 'admin'],
    default: 'customer',
  },
}, { timestamps: true });

module.exports = mongoose.model('User', schema);