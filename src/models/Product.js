const mongoose = require('mongoose');

const { PRODUCT_STATUS } = require('../constants/ProductConstants');

const PRODUCT_STATUS_ENUM = Object.values(PRODUCT_STATUS);

const productSchema = new mongoose.Schema({
  
  //============//
  // BASIC INFO //
  //============//

  sku: {
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
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  image: {
    type: String,
    required: true,
    trim: true,
  },

  category: {
    type: String,
    required: true,
    trim: true,
  },

  isAddon: {
    type: Boolean,
    required: true,
    default: false,
  },

  //===================//
  // ADDON VALIDATIONS //
  //===================//

  allowedAddons: [{
    addon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    minQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    maxQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
  }],

  //================//
  // INVENTORY INFO //
  //================//

  status: {
    type: String,
    required: true,
    enum: PRODUCT_STATUS_ENUM,
    default: PRODUCT_STATUS.AVAILABLE,
  },

  stock: {
    type: Number,
    required: true,
    min: 0,
  },

  //============//
  // AUDIT INFO //
  //============//

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
