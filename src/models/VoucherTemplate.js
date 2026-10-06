const mongoose = require('mongoose');

const voucherSchema = require('./Voucher');

const voucherTemplateSchema = new mongoose.Schema({

  voucher: {
    type: voucherSchema,
    required: true,
  },

  //==============//
  // USAGE LIMITS //
  //==============//

  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },

  usageLimitPublic: {
    type: Number,
    required: true,
    min: 0,
  },
  usageLimitPerUser: {
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

module.exports = mongoose.model('VoucherTemplate', voucherTemplateSchema);
