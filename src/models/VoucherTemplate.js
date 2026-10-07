const mongoose = require('mongoose');
const voucherSchema = require('./Voucher');

const voucherTemplateSchema = new mongoose.Schema(
  {
    voucher: { type: voucherSchema, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    usageLimitPublic: { type: Number, required: true, min: 0 },
    usageLimitPerUser: { type: Number, required: true, min: 0 },
    usageCountPublic: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

voucherTemplateSchema.index({ 'voucher.code': 1 }, { unique: true });

module.exports = mongoose.model('VoucherTemplate', voucherTemplateSchema);
