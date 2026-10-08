const ORDER_RESPONSES = require('../responses/OrderResponses').codes;
const GENERIC_RESPONSES = require('../constants/GenericResponseConstants');
const OrderService = require('../services/OrderService');

const send = (res, response) => {
  const code = response.code;
  const status = code === ORDER_RESPONSES.success.code
    ? 200
    : code === ORDER_RESPONSES.notFound.code
      ? 404
      : code === ORDER_RESPONSES.riderConflict.code
        ? 409
        : code === GENERIC_RESPONSES.internalServerError.code
          ? 500
          : code === ORDER_RESPONSES.forbidden.code
            ? 403
            : 400;

  return res.status(status).json(response);
};

const createOrder = async (req, res) =>
  send(res, await OrderService.createOrder(req.body, req.user._id));

const getCustomerOrders = async (req, res) =>
  send(res, await OrderService.getCustomerOrders(req.user._id));

const getCustomerOrder = async (req, res) =>
  send(res, await OrderService.getCustomerOrder(req.params.id, req.user._id));

const cancelCustomerOrder = async (req, res) =>
  send(res, await OrderService.cancelCustomerOrder(req.params.id, req.user._id, req.body?.reason));

const getOrders = async (req, res) =>
  send(res, await OrderService.getOrders(req.query));

const getOrder = async (req, res) =>
  send(res, await OrderService.getOrder(req.params.id));

const getDeliveryOrders = async (req, res) =>
  send(res, await OrderService.getDeliveryOrders(req.user._id, false));

const getMyDeliveryOrders = async (req, res) =>
  send(res, await OrderService.getDeliveryOrders(req.user._id, true));

const changeStatus = async (req, res) =>
  send(res, await OrderService.changeStatus(req.params.id, req.body.status, req.user._id, req.body.reason));

const assignRider = async (req, res) =>
  send(res, await OrderService.assignRider(req.params.id, req.body.riderId));

const claimOrder = async (req, res) =>
  send(res, await OrderService.claimOrder(req.params.id, req.user._id));

const shipOrder = async (req, res) =>
  send(res, await OrderService.deliveryStatus(req.params.id, 'shipped', req.user._id));

const deliverOrder = async (req, res) =>
  send(res, await OrderService.deliveryStatus(req.params.id, 'delivered', req.user._id));

const updatePayment = async (req, res) =>
  send(res, await OrderService.updatePayment(req.params.id, req.body, req.user._id));

module.exports = {
  createOrder,
  getCustomerOrders,
  getCustomerOrder,
  cancelCustomerOrder,
  getOrders,
  getOrder,
  getDeliveryOrders,
  getMyDeliveryOrders,
  changeStatus,
  assignRider,
  claimOrder,
  shipOrder,
  deliverOrder,
  updatePayment,
};
