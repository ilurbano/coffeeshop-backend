const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductResponses = require('../responses/ProductResponses');
const GenericResponses = require('../responses/GenericResponses');
const LogUtils = require('../utils/LogUtils');
const { PRODUCT_STATUS } = require('../constants/ProductConstants');

const isId = (id) => mongoose.isValidObjectId(id);

const validateAddonConfig = async (allowedAddons = []) => {
  if (!Array.isArray(allowedAddons)) {
    return ['allowedAddons'];
  }

  const invalid = [];
  const seen = new Set();

  for (const item of allowedAddons) {
    if (!item || !isId(item.addon)) {
      invalid.push('allowedAddons');
      continue;
    }

    if (seen.has(String(item.addon))) {
      invalid.push('allowedAddons');
    }

    seen.add(String(item.addon));

    if (
      !Number.isInteger(item.minQuantity) ||
      item.minQuantity < 0 ||
      !Number.isInteger(item.maxQuantity) ||
      item.maxQuantity < item.minQuantity
    ) {
      invalid.push('allowedAddons');
    }

    const addon = await Product.findOne({
      _id: item.addon,
      isAddon: true,
    }).select('_id');

    if (!addon) {
      invalid.push('allowedAddons');
    }
  }

  return [...new Set(invalid)];
};

const createProduct = async (data, userId) => {
  const required = [
    'sku',
    'name',
    'description',
    'price',
    'image',
    'category',
    'stock',
  ];

  const missing = required.filter(
    (field) =>
      data?.[field] === undefined ||
      data[field] === null ||
      (typeof data[field] === 'string' && !data[field].trim())
  );

  if (missing.length) {
    return ProductResponses.missingData(missing);
  }

  const invalid = [];

  if (typeof data.price !== 'number' || data.price < 0) {
    invalid.push('price');
  }

  if (!Number.isInteger(data.stock) || data.stock < 0) {
    invalid.push('stock');
  }

  invalid.push(...await validateAddonConfig(data.allowedAddons || []));

  if (invalid.length) {
    return ProductResponses.invalidData([...new Set(invalid)]);
  }

  try {
    const product = await Product.create({
      ...data,
      createdBy: userId,
      updatedBy: userId,
    });

    return ProductResponses.success(product, 'Product created successfully.');
  } catch (error) {
    if (error.code === 11000) {
      return ProductResponses.conflict();
    }

    LogUtils.logError(`Error in createProduct: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const getProducts = async (filters = {}) => {
  try {
    const query = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.isAddon !== undefined) {
      query.isAddon = filters.isAddon === 'true' || filters.isAddon === true;
    }

    return ProductResponses.success(
      await Product.find(query).sort({ category: 1, name: 1 })
    );
  } catch (error) {
    LogUtils.logError(`Error in getProducts: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const getProduct = async (id) => {
  if (!isId(id)) {
    return ProductResponses.invalidData(['id']);
  }

  try {
    const product = await Product.findById(id);
    return product
      ? ProductResponses.success(product)
      : ProductResponses.notFound();
  } catch (error) {
    LogUtils.logError(`Error in getProduct: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const updateProduct = async (id, data, userId) => {
  if (!isId(id)) {
    return ProductResponses.invalidData(['id']);
  }

  const allowed = [
    'sku',
    'name',
    'description',
    'price',
    'image',
    'category',
    'isAddon',
    'status',
    'stock',
    'allowedAddons',
  ];

  const updates = Object.fromEntries(
    Object.entries(data || {}).filter(([key]) => allowed.includes(key))
  );

  if (!Object.keys(updates).length) {
    return ProductResponses.missingData(allowed);
  }

  if (
    updates.price !== undefined &&
    (typeof updates.price !== 'number' || updates.price < 0)
  ) {
    return ProductResponses.invalidData(['price']);
  }

  if (
    updates.stock !== undefined &&
    (!Number.isInteger(updates.stock) || updates.stock < 0)
  ) {
    return ProductResponses.invalidData(['stock']);
  }

  if (updates.allowedAddons !== undefined) {
    const invalid = await validateAddonConfig(updates.allowedAddons);

    if (invalid.length) {
      return ProductResponses.invalidData(invalid);
    }
  }

  try {
    const product = await Product.findByIdAndUpdate(
      id,
      {
        ...updates,
        updatedBy: userId,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    return product
      ? ProductResponses.success(product, 'Product updated successfully.')
      : ProductResponses.notFound();
  } catch (error) {
    if (error.code === 11000) {
      return ProductResponses.conflict();
    }

    LogUtils.logError(`Error in updateProduct: ${error.message}`);
    return GenericResponses.internalServerError();
  }
};

const configureAddons = async (id, allowedAddons, userId) =>
  updateProduct(id, { allowedAddons }, userId);

const phaseOutProduct = async (id, userId) =>
  updateProduct(id, { status: PRODUCT_STATUS.PHASED_OUT }, userId);

module.exports = {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  configureAddons,
  phaseOutProduct,
};
