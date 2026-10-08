const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/OrderController');
const {
  requireToken,
  requireCustomer,
  requireDelivery,
  requireOperations,
} = require('../middlewares/AuthMiddleware');

router.post('/', requireToken, requireCustomer, OrderController.createOrder);
router.get('/mine', requireToken, requireCustomer, OrderController.getCustomerOrders);
router.get('/mine/:id', requireToken, requireCustomer, OrderController.getCustomerOrder);
router.post('/mine/:id/cancel', requireToken, requireCustomer, OrderController.cancelCustomerOrder);

router.get('/delivery/available', requireToken, requireDelivery, OrderController.getDeliveryOrders);
router.get('/delivery/mine', requireToken, requireDelivery, OrderController.getMyDeliveryOrders);
router.post('/delivery/:id/claim', requireToken, requireDelivery, OrderController.claimOrder);
router.post('/delivery/:id/ship', requireToken, requireDelivery, OrderController.shipOrder);
router.post('/delivery/:id/deliver', requireToken, requireDelivery, OrderController.deliverOrder);

router.get('/', requireToken, requireOperations, OrderController.getOrders);
router.get('/:id', requireToken, requireOperations, OrderController.getOrder);
router.patch('/:id/status', requireToken, requireOperations, OrderController.changeStatus);
router.patch('/:id/payment', requireToken, requireOperations, OrderController.updatePayment);
router.patch('/:id/rider', requireToken, requireOperations, OrderController.assignRider);

module.exports = router;
