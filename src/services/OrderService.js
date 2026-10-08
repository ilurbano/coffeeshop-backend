const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const VoucherInstance = require('../models/VoucherInstance');
const VoucherTemplate = require('../models/VoucherTemplate');
const User = require('../models/User');
const OrderResponses = require('../responses/OrderResponses');
const GenericResponses = require('../responses/GenericResponses');
const LogUtils = require('../utils/LogUtils');
const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  ORDER_STATUS_TRANSITIONS,
} = require('../constants/OrderConstants');
const { PRODUCT_STATUS } = require('../constants/ProductConstants');
const { VOUCHER_STATUS, DISCOUNT_TYPE } = require('../constants/VoucherConstants');

const isId = (id) => mongoose.isValidObjectId(id);
const now = () => new Date();

const orderNumber = async () => {
  for (let i = 0; i < 5; i++) {
    const value = `ORD-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

    if (!(await Order.exists({ orderNumber: value }))) {
      return value;
    }
  }

  throw new Error('Unable to generate unique order number.');
};

const validateAddress = (address = {}) => {
  const fields = [
    'latitude',
    'longitude',
    'apartmentBuildingLotNumber',
    'street',
    'barangay',
    'city',
    'province',
    'zipCode',
  ];

  const missing = fields.filter(
    (field) =>
      address[field] === undefined ||
      address[field] === null ||
      (typeof address[field] === 'string' && !address[field].trim())
  );

  const invalid = [];

  if (
    typeof address.latitude !== 'number' ||
    address.latitude < -90 ||
    address.latitude > 90
  ) {
    invalid.push('latitude');
  }

  if (
    typeof address.longitude !== 'number' ||
    address.longitude < -180 ||
    address.longitude > 180
  ) {
    invalid.push('longitude');
  }

  return { missing, invalid };
};

const aggregateRequirements = (items) => {
  const requirements = new Map();

  for (const item of items) {
    const main = String(item.product);
    requirements.set(main, (requirements.get(main) || 0) + item.quantity);

    for (const addon of item.addons || []) {
      const id = String(addon.addon);
      requirements.set(
        id,
        (requirements.get(id) || 0) + addon.quantity * item.quantity
      );
    }
  }

  return requirements;
};

const reserveStock = async (requirements) => {
  const changed = [];

  try {
    for (const [id, quantity] of requirements) {
      const product = await Product.findOneAndUpdate(
        {
          _id: id,
          status: PRODUCT_STATUS.AVAILABLE,
          stock: { $gte: quantity },
        },
        { $inc: { stock: -quantity } },
        { new: true }
      );

      if (!product) {
        throw new Error(`INSUFFICIENT_STOCK:${id}`);
      }

      changed.push({
        id,
        quantity,
        previousStatus:
          product.stock + quantity > 0
            ? PRODUCT_STATUS.AVAILABLE
            : PRODUCT_STATUS.OUT_OF_STOCK,
      });

      if (product.stock === 0) {
        await Product.updateOne(
          { _id: id },
          { $set: { status: PRODUCT_STATUS.OUT_OF_STOCK } }
        );
      }
    }

    return null;
  } catch (error) {
    for (const item of changed) {
      await Product.updateOne(
        { _id: item.id },
        {
          $inc: { stock: item.quantity },
          $set: { status: item.previousStatus },
        }
      );
    }

    return error;
  }
};

const restoreStock = async (order) => {
  const requirements = aggregateRequirements(order.products);

  for (const [id, quantity] of requirements) {
    const product = await Product.findById(id);

    if (!product) {
      continue;
    }

    const stock = product.stock + quantity;
    const status =
      product.status === PRODUCT_STATUS.PHASED_OUT
        ? product.status
        : PRODUCT_STATUS.AVAILABLE;

    await Product.updateOne(
      { _id: id },
      {
        $inc: { stock: quantity },
        $set: { status },
      }
    );
  }
};

const validateAndPriceItems = async (items) => {
  if (!Array.isArray(items) || !items.length) {
    return { invalid: ['products'] };
  }

  const productIds = items.flatMap((item) => [
    item.product,
    ...(item.addons || []).map((addon) => addon.addon),
  ]);

  if (productIds.some((id) => !isId(id))) {
    return { invalid: ['products'] };
  }

  const products = await Product.find({ _id: { $in: productIds } });
  const byId = new Map(products.map((product) => [String(product._id), product]));
  const invalid = [];
  const priced = [];

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      invalid.push('products');
      continue;
    }

    const product = byId.get(String(item.product));

    if (
      !product ||
      product.isAddon ||
      product.status !== PRODUCT_STATUS.AVAILABLE
    ) {
      invalid.push('products');
      continue;
    }

    const configured = new Map(
      (product.allowedAddons || []).map((entry) => [String(entry.addon), entry])
    );
    const requestedAddons = new Map();

    for (const addonItem of item.addons || []) {
      const id = String(addonItem.addon);
      requestedAddons.set(
        id,
        (requestedAddons.get(id) || 0) + addonItem.quantity
      );
    }

    const addons = [];

    for (const [id, quantity] of requestedAddons) {
      const addon = byId.get(id);
      const rule = configured.get(id);

      if (
        !addon ||
        !addon.isAddon ||
        !rule ||
        !Number.isInteger(quantity) ||
        quantity < rule.minQuantity ||
        quantity > rule.maxQuantity
      ) {
        invalid.push('products');
        continue;
      }

      addons.push({
        addon: addon._id,
        addonPrice: addon.price,
        quantity,
      });
    }

    priced.push({
      product: product._id,
      productPrice: product.price,
      addons,
      quantity: item.quantity,
    });
  }

  return invalid.length
    ? { invalid: [...new Set(invalid)] }
    : { items: priced };
};

const calculateVoucherDiscount = (voucher, items, totalPrice) => {
  if (totalPrice < voucher.minOrderValue) {
    return 0;
  }

  if (voucher.allowedProducts?.length) {
    const qualifies = voucher.allowedProducts.some((rule) =>
      items.some(
        (item) =>
          String(item.product) === String(rule.product) &&
          item.quantity >= rule.minQuantity &&
          (rule.addons || []).every((a) =>
            (item.addons || []).some(
              (ia) =>
                String(ia.addon) === String(a.addon) &&
                ia.quantity >= a.quantity
            )
          )
      )
    );

    if (!qualifies) {
      return 0;
    }
  }

  const raw =
    voucher.discountType === DISCOUNT_TYPE.PERCENTAGE
      ? totalPrice * (voucher.discountValue / 100)
      : voucher.discountValue;

  return Math.min(raw, voucher.maxDiscountValue, totalPrice);
};

const applyVouchers = async (voucherIds, userId, items, totalPrice) => {
  if (!voucherIds?.length) {
    return { vouchersApplied: [], discount: 0 };
  }

  if (!Array.isArray(voucherIds) || voucherIds.some((id) => !isId(id))) {
    return { error: 'Invalid voucher IDs.' };
  }

  const unique = [...new Set(voucherIds.map(String))];
  const vouchers = await VoucherInstance.find({
    _id: { $in: unique },
    owner: userId,
  });

  if (vouchers.length !== unique.length) {
    return { error: 'One or more vouchers do not belong to this customer.' };
  }

  const applied = [];
  let discount = 0;

  for (const instance of vouchers) {
    if (
      instance.status !== VOUCHER_STATUS.ACTIVE ||
      instance.expiresAt < now()
    ) {
      return {
        error: `Voucher ${instance.voucher.code} is unavailable.`,
      };
    }

    const amount = calculateVoucherDiscount(
      instance.voucher,
      items,
      Math.max(totalPrice - discount, 0)
    );

    if (amount <= 0) {
      return {
        error: `Voucher ${instance.voucher.code} does not apply to this order.`,
      };
    }

    applied.push({
      voucher: instance._id,
      discountAmount: amount,
    });
    discount += amount;
  }

  return { vouchersApplied: applied, discount };
};

const createOrder = async (data, userId) => {
  if (data?.deliveryAddress !== undefined && data.deliveryAddress !== null) {
    const { missing, invalid } = validateAddress(data.deliveryAddress);

    if (missing.length) {
      return OrderResponses.missingData([`deliveryAddress.${missing[0]}`]);
    }

    if (invalid.length) {
      return OrderResponses.invalidData(
        invalid.map((field) => `deliveryAddress.${field}`)
      );
    }
  }

  if (!data?.products?.length) {
    return OrderResponses.missingData(['products']);
  }

  if (!data.paymentMethod) {
    return OrderResponses.missingData(['paymentMethod']);
  }

  const priced = await validateAndPriceItems(data.products);

  if (priced.invalid) {
    return OrderResponses.invalidData(priced.invalid);
  }

  const totalPrice = priced.items.reduce(
    (sum, item) =>
      sum +
      item.productPrice * item.quantity +
      item.addons.reduce(
        (s, a) => s + a.addonPrice * a.quantity * item.quantity,
        0
      ),
    0
  );

  const voucherResult = await applyVouchers(
    data.voucherIds || [],
    userId,
    priced.items,
    totalPrice
  );

  if (voucherResult.error) {
    return OrderResponses.voucherInvalid(voucherResult.error);
  }

  const stockError = await reserveStock(aggregateRequirements(priced.items));

  if (stockError) {
    return stockError.message.startsWith('INSUFFICIENT_STOCK')
      ? OrderResponses.insufficientStock()
      : GenericResponses.internalServerError();
  }

  try {
    const instanceIds = voucherResult.vouchersApplied.map(
      (item) => item.voucher
    );

    if (instanceIds.length) {
      const updated = await VoucherInstance.updateMany(
        {
          _id: { $in: instanceIds },
          owner: userId,
          status: VOUCHER_STATUS.ACTIVE,
          expiresAt: { $gte: now() },
        },
        { $set: { status: VOUCHER_STATUS.USED } }
      );

      if (updated.modifiedCount !== instanceIds.length) {
        throw new Error('Voucher reservation failed.');
      }
    }

    const order = await Order.create({
      user: userId,
      orderNumber: await orderNumber(),
      products: priced.items,
      totalPrice,
      vouchersApplied: voucherResult.vouchersApplied,
      grandTotal: Math.max(totalPrice - voucherResult.discount, 0),
      notes: data.notes?.trim() || undefined,
      ...(data.deliveryAddress ? { deliveryAddress: data.deliveryAddress } : {}),
      paymentMethod: data.paymentMethod,
      pendingAt: now(),
      pendingBy: userId,
    });

    if (instanceIds.length) {
      await VoucherInstance.updateMany(
        { _id: { $in: instanceIds } },
        { $set: { usedAt: now(), usedInOrder: order._id } }
      );
    }

    return OrderResponses.success(
      await order.populate(
        'products.product products.addons.addon vouchersApplied.voucher'
      ),
      'Order created successfully.'
    );
  } catch (error) {
    await restoreStock({ products: priced.items });
    await VoucherInstance.updateMany(
      {
        _id: { $in: voucherResult.vouchersApplied.map((v) => v.voucher) },
        status: VOUCHER_STATUS.USED,
      },
      {
        $set: { status: VOUCHER_STATUS.ACTIVE },
        $unset: { usedAt: 1, usedInOrder: 1 },
      }
    );

    LogUtils.logError(`Error in createOrder: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const getCustomerOrders = async (userId) => {
  try {
    return OrderResponses.success(
      await Order.find({ user: userId })
        .populate('products.product products.addons.addon')
        .populate({ path: 'deliveryRider', select: '-password' })
        .sort({ createdAt: -1 })
    );
  } catch (error) {
    LogUtils.logError(`Error in getCustomerOrders: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const getCustomerOrder = async (id, userId) => {
  if (!isId(id)) {
    return OrderResponses.invalidData(['id']);
  }

  try {
    const order = await Order.findOne({ _id: id, user: userId }).populate(
      'products.product products.addons.addon deliveryRider'
    );

    return order
      ? OrderResponses.success(order)
      : OrderResponses.notFound();
  } catch (error) {
    LogUtils.logError(`Error in getCustomerOrder: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const getOrders = async (filters = {}) => {
  try {
    const query = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.deliveryRider) {
      query.deliveryRider = filters.deliveryRider;
    }

    return OrderResponses.success(
      await Order.find(query)
        .populate({ path: 'user', select: '-password' })
        .populate('products.product products.addons.addon')
        .populate({ path: 'deliveryRider', select: '-password' })
        .sort({ createdAt: -1 })
    );
  } catch (error) {
    LogUtils.logError(`Error in getOrders: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const getDeliveryOrders = async (riderId, mine = false) => {
  try {
    const query = mine
      ? {
          deliveryRider: riderId,
          deliveryAddress: { $exists: true },
        }
      : {
          status: ORDER_STATUS.READY,
          deliveryAddress: { $exists: true },
          $or: [
            { deliveryRider: { $exists: false } },
            { deliveryRider: null },
          ],
        };

    return OrderResponses.success(
      await Order.find(query)
        .populate({ path: 'user', select: '-password' })
        .populate('products.product products.addons.addon')
        .populate({ path: 'deliveryRider', select: '-password' })
        .sort({ createdAt: 1 })
    );
  } catch (error) {
    LogUtils.logError(`Error in getDeliveryOrders: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const getOrder = async (id) => {
  if (!isId(id)) {
    return OrderResponses.invalidData(['id']);
  }

  try {
    const order = await Order.findById(id).populate(
      { path: 'user', select: '-password' },
      'products.product products.addons.addon',
      { path: 'deliveryRider', select: '-password' }
    );

    return order ? OrderResponses.success(order) : OrderResponses.notFound();
  } catch (error) {
    LogUtils.logError(`Error in getOrder: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const changeStatus = async (id, status, userId, reason) => {
  if (!isId(id)) {
    return OrderResponses.invalidData(['id']);
  }

  const order = await Order.findById(id);

  if (!order) {
    return OrderResponses.notFound();
  }

  const isDeliveryOrder = Boolean(order.deliveryAddress);
  const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.status];

  if (!allowedTransitions?.includes(status)) {
    return OrderResponses.invalidTransition();
  }

  if (!isDeliveryOrder && [ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED].includes(status)) {
    return OrderResponses.invalidTransition(
      'In-store orders cannot use delivery-only statuses.'
    );
  }

  if (isDeliveryOrder && status === ORDER_STATUS.CLAIMED && !order.deliveryRider) {
    return OrderResponses.invalidTransition(
      'Delivery orders must have an assigned rider before being claimed.'
    );
  }

  const stamp = now();
  const fieldMap = {
    confirmed: ['confirmedAt', 'confirmedBy'],
    queued: ['queuedAt', 'queuedBy'],
    ready: ['readyAt', 'readyBy'],
    claimed: ['claimedAt', 'claimedBy'],
    shipped: ['shippedAt', 'shippedBy'],
    delivered: ['deliveredAt', 'deliveredBy'],
    cancelled: ['cancelledAt', 'cancelledBy'],
  };

  order.status = status;

  if (status === ORDER_STATUS.CANCELLED && reason?.trim()) {
    order.cancellationReason = reason.trim();
  }

  if (fieldMap[status]) {
    order[fieldMap[status][0]] = stamp;
    order[fieldMap[status][1]] = userId;
  }

  if (status === ORDER_STATUS.CANCELLED) {
    await restoreStock(order);

    for (const applied of order.vouchersApplied) {
      const instance = await VoucherInstance.findOneAndUpdate(
        {
          _id: applied.voucher,
          status: VOUCHER_STATUS.USED,
        },
        {
          $set: { status: VOUCHER_STATUS.ACTIVE },
          $unset: { usedAt: 1, usedInOrder: 1 },
        },
        { new: true }
      );

      if (instance) {
        await VoucherTemplate.updateOne(
          {
            _id: instance.template,
            usageCountPublic: { $gt: 0 },
          },
          { $inc: { usageCountPublic: -1 } }
        );
      }
    }
  }

  await order.save();

  return OrderResponses.success(order, `Order ${status} successfully.`);
};

const cancelCustomerOrder = async (id, userId, reason) => {
  if (!isId(id)) {
    return OrderResponses.invalidData(['id']);
  }

  const order = await Order.findOne({ _id: id, user: userId });

  if (!order) {
    return OrderResponses.notFound();
  }

  if (order.status !== ORDER_STATUS.PENDING) {
    return OrderResponses.invalidTransition(
      'Customers can only cancel pending orders.'
    );
  }

  return changeStatus(id, ORDER_STATUS.CANCELLED, userId, reason);
};

const assignRider = async (id, riderId) => {
  if (!isId(id) || !isId(riderId)) {
    return OrderResponses.invalidData(['id']);
  }

  const rider = await User.findOne({
    _id: riderId,
    role: 'delivery',
  }).select('_id');

  if (!rider) {
    return OrderResponses.invalidData(['riderId']);
  }

  const order = await Order.findById(id);

  if (!order) {
    return OrderResponses.notFound();
  }

  if (!order.deliveryAddress) {
    return OrderResponses.invalidTransition(
      'Only delivery orders can be assigned to a rider.'
    );
  }

  if (
    ![
      ORDER_STATUS.READY,
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.QUEUED,
    ].includes(order.status)
  ) {
    return OrderResponses.invalidTransition(
      'Only active delivery orders can be assigned.'
    );
  }

  if (order.deliveryRider && String(order.deliveryRider) !== String(riderId)) {
    return OrderResponses.riderConflict();
  }

  order.deliveryRider = riderId;
  await order.save();

  return OrderResponses.success(
    order,
    'Delivery rider assigned successfully.'
  );
};

const claimOrder = async (id, riderId) => {
  if (!isId(id)) {
    return OrderResponses.invalidData(['id']);
  }

  const order = await Order.findOneAndUpdate(
    {
      _id: id,
      status: ORDER_STATUS.READY,
      deliveryAddress: { $exists: true },
      $or: [
        { deliveryRider: { $exists: false } },
        { deliveryRider: null },
        { deliveryRider: riderId },
      ],
    },
    {
      $set: {
        deliveryRider: riderId,
        status: ORDER_STATUS.CLAIMED,
        claimedAt: now(),
        claimedBy: riderId,
      },
    },
    { new: true }
  );

  if (!order) {
    const existing = await Order.findById(id);
    return existing?.deliveryRider
      ? OrderResponses.riderConflict()
      : OrderResponses.notFound();
  }

  return OrderResponses.success(order, 'Order claimed successfully.');
};

const deliveryStatus = async (id, status, riderId) => {
  if (!isId(id)) {
    return OrderResponses.invalidData(['id']);
  }

  const order = await Order.findOne({
    _id: id,
    deliveryRider: riderId,
    deliveryAddress: { $exists: true },
  });

  if (!order) {
    return OrderResponses.notFound();
  }

  if (
    status === ORDER_STATUS.SHIPPED &&
    order.status !== ORDER_STATUS.CLAIMED
  ) {
    return OrderResponses.invalidTransition();
  }

  if (
    status === ORDER_STATUS.DELIVERED &&
    order.status !== ORDER_STATUS.SHIPPED
  ) {
    return OrderResponses.invalidTransition();
  }

  return changeStatus(id, status, riderId);
};

const updatePayment = async (id, data, userId) => {
  if (!isId(id)) {
    return OrderResponses.invalidData(['id']);
  }

  const order = await Order.findById(id);

  if (!order) {
    return OrderResponses.notFound();
  }

  if (
    ![
      PAYMENT_STATUS.PAID,
      PAYMENT_STATUS.FAILED,
      PAYMENT_STATUS.PENDING,
    ].includes(data?.paymentStatus)
  ) {
    return OrderResponses.invalidData(['paymentStatus']);
  }

  order.paymentStatus = data.paymentStatus;
  order.paymentReference = data.paymentReference?.trim();
  order.paymentMethodProvider = data.paymentMethodProvider?.trim();
  order.paymentAmount = data.paymentAmount;
  order.paymentChange = data.paymentChange;
  order.paidAt =
    data.paymentStatus === PAYMENT_STATUS.PAID ? now() : undefined;
  order.paidBy =
    data.paymentStatus === PAYMENT_STATUS.PAID ? userId : undefined;

  await order.save();

  return OrderResponses.success(
    order,
    'Payment information updated successfully.'
  );
};

module.exports = {
  createOrder,
  getCustomerOrders,
  getCustomerOrder,
  getOrders,
  getDeliveryOrders,
  getOrder,
  changeStatus,
  cancelCustomerOrder,
  assignRider,
  claimOrder,
  deliveryStatus,
  updatePayment,
};
