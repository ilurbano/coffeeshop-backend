const PRODUCT_RESPONSES = require('../responses/ProductResponses').codes;
const GENERIC_RESPONSES = require('../constants/GenericResponseConstants');
const ProductService = require('../services/ProductService');

const send = (res, response) => {
  const code = response.code;
  const status = code === PRODUCT_RESPONSES.success.code
    ? 200
    : code === PRODUCT_RESPONSES.notFound.code
      ? 404
      : code === PRODUCT_RESPONSES.conflict.code
        ? 409
        : code === GENERIC_RESPONSES.internalServerError.code
          ? 500
          : 400;

  return res.status(status).json(response);
};

const getProducts = async (req, res) =>
  send(res, await ProductService.getProducts(req.query));

const getProduct = async (req, res) =>
  send(res, await ProductService.getProduct(req.params.id));

const createProduct = async (req, res) =>
  send(res, await ProductService.createProduct(req.body, req.user._id));

const updateProduct = async (req, res) =>
  send(res, await ProductService.updateProduct(req.params.id, req.body, req.user._id));

const configureAddons = async (req, res) =>
  send(res, await ProductService.configureAddons(req.params.id, req.body.allowedAddons, req.user._id));

const phaseOutProduct = async (req, res) =>
  send(res, await ProductService.phaseOutProduct(req.params.id, req.user._id));

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  configureAddons,
  phaseOutProduct,
};
