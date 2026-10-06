const mongoose = require('mongoose');

const { VOUCHER_STATUS } = require('../constants/VoucherConstants');

const voucherSchema = require('./Voucher');

const VOUCHER_STATUS_ENUM = Object.values(VOUCHER_STATUS);

const voucherInstanceSchema = new mongoose.Schema({

  //============//
  // BASIC INFO //
  //============//

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  voucher: {
    type: voucherSchema,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    required: true,
    enum: VOUCHER_STATUS_ENUM,
    default: VOUCHER_STATUS.ACTIVE,
  }

}, { timestamps: true });

module.exports = mongoose.model('VoucherInstance', voucherInstanceSchema);
