const mongoose = require('mongoose');

const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
} = require('../constants/OrderConstants');

const ORDER_STATUS_ENUM = Object.values(ORDER_STATUS);
const PAYMENT_STATUS_ENUM = Object.values(PAYMENT_STATUS);
const PAYMENT_METHOD_ENUM = Object.values(PAYMENT_METHOD);

const deliveryAddressSchema = new mongoose.Schema(
  {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    apartmentBuildingLotNumber: { type: String, required: true, trim: true },
    street: { type: String, required: true, trim: true },
    villageSubdivision: { type: String, trim: true },
    barangay: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    province: { type: String, required: true, trim: true },
    zipCode: { type: String, required: true, trim: true },
    riderInstructions: { type: String, trim: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderNumber: { type: String, required: true, unique: true, trim: true },
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        productPrice: { type: Number, required: true, min: 0 },
        addons: [
          {
            addon: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'Product',
              required: true,
            },
            addonPrice: { type: Number, required: true, min: 0 },
            quantity: { type: Number, required: true, min: 0 },
          },
        ],
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    totalPrice: { type: Number, required: true, min: 0 },
    vouchersApplied: [
      {
        voucher: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'VoucherInstance',
          required: true,
        },
        discountAmount: { type: Number, required: true, min: 0 },
      },
    ],
    grandTotal: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
    deliveryAddress: { type: deliveryAddressSchema },

    status: {
      type: String,
      enum: ORDER_STATUS_ENUM,
      default: ORDER_STATUS.PENDING,
    },
    pendingAt: { type: Date },
    pendingBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: { type: Date },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    queuedAt: { type: Date },
    queuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readyAt: { type: Date },
    readyBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    claimedAt: { type: Date },
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    shippedAt: { type: Date },
    shippedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deliveredAt: { type: Date },
    deliveredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: { type: String, trim: true },

    deliveryRider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUS_ENUM,
      default: PAYMENT_STATUS.PENDING,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHOD_ENUM,
      default: PAYMENT_METHOD.CASH,
    },
    paymentMethodProvider: { type: String, trim: true },
    paymentReference: { type: String, trim: true },
    paymentAmount: { type: Number, min: 0 },
    paymentChange: { type: Number, min: 0 },
    paidAt: { type: Date },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
