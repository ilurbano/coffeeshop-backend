const mongoose = require('mongoose');
const VoucherTemplate = require('../models/VoucherTemplate');
const VoucherInstance = require('../models/VoucherInstance');
const VoucherResponses = require('../responses/VoucherResponses');
const GenericResponses = require('../responses/GenericResponses');
const LogUtils = require('../utils/LogUtils');
const { DISCOUNT_TYPE, VOUCHER_STATUS } = require('../constants/VoucherConstants');

const isId = (id) => mongoose.isValidObjectId(id);
const voucherFields = [
  'code',
  'name',
  'description',
  'termsAndConditions',
  'discountType',
  'discountValue',
  'minOrderValue',
  'allowedProducts',
  'maxDiscountValue',
];

const validateVoucher = (voucher = {}) => {
  const invalid = [];

  if (
    ![DISCOUNT_TYPE.PERCENTAGE, DISCOUNT_TYPE.FIXED].includes(
      voucher.discountType
    )
  ) {
    invalid.push('discountType');
  }

  if (
    typeof voucher.discountValue !== 'number' ||
    voucher.discountValue < 0
  ) {
    invalid.push('discountValue');
  }

  if (
    voucher.discountType === DISCOUNT_TYPE.PERCENTAGE &&
    voucher.discountValue > 100
  ) {
    invalid.push('discountValue');
  }

  if (
    typeof voucher.minOrderValue !== 'number' ||
    voucher.minOrderValue < 0
  ) {
    invalid.push('minOrderValue');
  }

  if (
    typeof voucher.maxDiscountValue !== 'number' ||
    voucher.maxDiscountValue < 0
  ) {
    invalid.push('maxDiscountValue');
  }

  if (!Array.isArray(voucher.allowedProducts)) {
    invalid.push('allowedProducts');
  } else {
    const seenProducts = new Set();

    for (const rule of voucher.allowedProducts) {
      if (
        !isId(rule?.product) ||
        seenProducts.has(String(rule.product)) ||
        !Number.isInteger(rule?.minQuantity) ||
        rule.minQuantity < 1 ||
        !Array.isArray(rule?.addons)
      ) {
        invalid.push('allowedProducts');
        continue;
      }

      seenProducts.add(String(rule.product));

      const seenAddons = new Set();

      for (const addon of rule.addons) {
        if (
          !isId(addon?.addon) ||
          seenAddons.has(String(addon.addon)) ||
          !Number.isInteger(addon?.quantity) ||
          addon.quantity < 1
        ) {
          invalid.push('allowedProducts');
          continue;
        }

        seenAddons.add(String(addon.addon));
      }
    }
  }

  return [...new Set(invalid)];
};

const createVoucher = async (data, userId) => {
  const voucher = data?.voucher || data;
  const missing = voucherFields.filter(
    (field) => voucher?.[field] === undefined || voucher[field] === null
  );

  for (const field of [
    'startDate',
    'endDate',
    'usageLimitPublic',
    'usageLimitPerUser',
  ]) {
    if (data?.[field] === undefined || data[field] === null) {
      missing.push(field);
    }
  }

  if (missing.length) {
    return VoucherResponses.missingData([...new Set(missing)]);
  }

  const invalid = validateVoucher(voucher);

  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    startDate >= endDate
  ) {
    invalid.push('dateRange');
  }

  if (
    !Number.isInteger(data.usageLimitPublic) ||
    data.usageLimitPublic < 0
  ) {
    invalid.push('usageLimitPublic');
  }

  if (
    !Number.isInteger(data.usageLimitPerUser) ||
    data.usageLimitPerUser < 0
  ) {
    invalid.push('usageLimitPerUser');
  }

  if (invalid.length) {
    return VoucherResponses.invalidData([...new Set(invalid)]);
  }

  try {
    const template = await VoucherTemplate.create({
      voucher,
      startDate: data.startDate,
      endDate: data.endDate,
      usageLimitPublic: data.usageLimitPublic,
      usageLimitPerUser: data.usageLimitPerUser,
      createdBy: userId,
      updatedBy: userId,
    });

    return VoucherResponses.success(template, 'Voucher created successfully.');
  } catch (error) {
    if (error.code === 11000) {
      return VoucherResponses.conflict();
    }

    LogUtils.logError(`Error in createVoucher: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const getVouchers = async (filters = {}) => {
  try {
    const query = { deletedAt: null };

    if (filters.code) {
      query['voucher.code'] = filters.code;
    }

    return VoucherResponses.success(
      await VoucherTemplate.find(query).sort({ createdAt: -1 })
    );
  } catch (error) {
    LogUtils.logError(`Error in getVouchers: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const getVoucher = async (id) => {
  if (!isId(id)) {
    return VoucherResponses.invalidData(['id']);
  }

  try {
    const voucher = await VoucherTemplate.findOne({ _id: id, deletedAt: null });
    return voucher
      ? VoucherResponses.success(voucher)
      : VoucherResponses.notFound();
  } catch (error) {
    LogUtils.logError(`Error in getVoucher: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const updateVoucher = async (id, data, userId) => {
  if (!isId(id)) {
    return VoucherResponses.invalidData(['id']);
  }

  const current = await VoucherTemplate.findOne({ _id: id, deletedAt: null });

  if (!current) {
    return VoucherResponses.notFound();
  }

  const nextVoucher = {
    ...current.voucher.toObject(),
    ...(data?.voucher || data || {}),
  };
  const invalid = validateVoucher(nextVoucher);

  if (data?.startDate !== undefined || data?.endDate !== undefined) {
    const start = new Date(data.startDate ?? current.startDate);
    const end = new Date(data.endDate ?? current.endDate);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start >= end
    ) {
      invalid.push('dateRange');
    }
  }

  for (const field of ['usageLimitPublic', 'usageLimitPerUser']) {
    if (
      data?.[field] !== undefined &&
      (!Number.isInteger(data[field]) || data[field] < 0)
    ) {
      invalid.push(field);
    }
  }

  if (invalid.length) {
    return VoucherResponses.invalidData([...new Set(invalid)]);
  }

  const updates = {
    voucher: nextVoucher,
  };

  for (const field of [
    'startDate',
    'endDate',
    'usageLimitPublic',
    'usageLimitPerUser',
  ]) {
    if (data?.[field] !== undefined) {
      updates[field] = data[field];
    }
  }

  updates.updatedBy = userId;

  try {
    return VoucherResponses.success(
      await VoucherTemplate.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      }),
      'Voucher updated successfully.'
    );
  } catch (error) {
    LogUtils.logError(`Error in updateVoucher: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const deleteVoucher = async (id) => {
  if (!isId(id)) {
    return VoucherResponses.invalidData(['id']);
  }

  try {
    const deleted = await VoucherTemplate.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );

    if (!deleted) {
      return VoucherResponses.notFound();
    }

    return VoucherResponses.success(deleted, 'Voucher deleted successfully.');
  } catch (error) {
    LogUtils.logError(`Error in deleteVoucher: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const claimVoucher = async (code, userId) => {
  if (!code?.trim()) {
    return VoucherResponses.missingData(['code']);
  }

  let template;
  let publicUsageIncremented = false;

  try {
    const now = new Date();
    template = await VoucherTemplate.findOne({
      'voucher.code': code.trim(),
      deletedAt: null,
    });

    if (!template) {
      return VoucherResponses.notFound();
    }

    if (now < template.startDate || now > template.endDate) {
      return VoucherResponses.unavailable(
        'Voucher is outside its validity period.'
      );
    }

    const existingCount = await VoucherInstance.countDocuments({
      template: template._id,
      owner: userId,
    });

    if (
      template.usageLimitPerUser > 0 &&
      existingCount >= template.usageLimitPerUser
    ) {
      return VoucherResponses.unavailable(
        'You have reached this voucher limit.'
      );
    }

    let claimed = template;

    if (template.usageLimitPublic > 0) {
      claimed = await VoucherTemplate.findOneAndUpdate(
        {
          _id: template._id,
          usageCountPublic: { $lt: template.usageLimitPublic },
        },
        { $inc: { usageCountPublic: 1 } },
        { new: true }
      );

      if (!claimed) {
        return VoucherResponses.unavailable(
          'Voucher public usage limit has been reached.'
        );
      }

      publicUsageIncremented = true;
    }

    const instance = await VoucherInstance.create({
      owner: userId,
      template: template._id,
      voucher: template.voucher,
      expiresAt: template.endDate,
    });

    return VoucherResponses.success(instance, 'Voucher claimed successfully.');
  } catch (error) {
    if (publicUsageIncremented) {
      await VoucherTemplate.findByIdAndUpdate(
        template._id,
        { $inc: { usageCountPublic: -1 } }
      );
    }

    LogUtils.logError(`Error in claimVoucher: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const getCustomerVouchers = async (userId) => {
  try {
    const now = new Date();

    await VoucherInstance.updateMany(
      {
        owner: userId,
        status: VOUCHER_STATUS.ACTIVE,
        expiresAt: { $lt: now },
      },
      { $set: { status: VOUCHER_STATUS.EXPIRED } }
    );

    return VoucherResponses.success(
      await VoucherInstance.find({ owner: userId }).sort({ createdAt: -1 })
    );
  } catch (error) {
    LogUtils.logError(`Error in getCustomerVouchers: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const getCustomerVoucher = async (id, userId) => {
  if (!isId(id)) {
    return VoucherResponses.invalidData(['id']);
  }

  try {
    await VoucherInstance.updateOne(
      {
        _id: id,
        owner: userId,
        status: VOUCHER_STATUS.ACTIVE,
        expiresAt: { $lt: new Date() },
      },
      { $set: { status: VOUCHER_STATUS.EXPIRED } }
    );

    const voucher = await VoucherInstance.findOne({
      _id: id,
      owner: userId,
    });

    return voucher
      ? VoucherResponses.success(voucher)
      : VoucherResponses.notFound();
  } catch (error) {
    LogUtils.logError(`Error in getCustomerVoucher: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

module.exports = {
  createVoucher,
  getVouchers,
  getVoucher,
  updateVoucher,
  deleteVoucher,
  claimVoucher,
  getCustomerVouchers,
  getCustomerVoucher,
};
