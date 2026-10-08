const mongoose = require('mongoose');
const { VOUCHER_STATUS } = require('../constants/VoucherConstants');
const voucherSchema = require('./Voucher');

const VOUCHER_STATUS_ENUM = Object.values(VOUCHER_STATUS);

const voucherInstanceSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VoucherTemplate',
      required: true,
    },
    voucher: { type: voucherSchema, required: true },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: VOUCHER_STATUS_ENUM,
      default: VOUCHER_STATUS.ACTIVE,
    },
    usedAt: { type: Date },
    usedInOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
  },
  { timestamps: true }
);

voucherInstanceSchema.index({ owner: 1, status: 1 });
voucherInstanceSchema.index({ 'voucher.code': 1 });

module.exports = mongoose.model('VoucherInstance', voucherInstanceSchema);
