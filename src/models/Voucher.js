const mongoose = require('mongoose');

const { DISCOUNT_TYPE } = require('../constants/VoucherConstants');

const DISCOUNT_TYPE_ENUM = Object.values(DISCOUNT_TYPE);

const voucherSchema = new mongoose.Schema({

  //============//
  // BASIC INFO //
  //============//

  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },

  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  termsAndConditions: {
    type: String,
    required: true,
    trim: true,
  },

  //===============//
  // DISCOUNT INFO //
  //===============//

  discountType: {
    type: String,
    required: true,
    enum: DISCOUNT_TYPE_ENUM,
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0,
  },

  minOrderValue: {
    type: Number,
    required: true,
    min: 0,
  },
  allowedProducts: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    addons: [{
      addon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 0,
      },
    }],
    minQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
  }],
  maxDiscountValue: {
    type: Number,
    required: true,
    min: 0,
  },

}, { _id: false });

module.exports = voucherSchema;
