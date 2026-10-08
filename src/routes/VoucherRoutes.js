const express = require('express');
const router = express.Router();
const VoucherController = require('../controllers/VoucherController');
const {
  requireToken,
  requireCustomer,
  requireOperations,
} = require('../middlewares/AuthMiddleware');

router.get('/', requireToken, requireOperations, VoucherController.getVouchers);
router.get('/:id', requireToken, requireOperations, VoucherController.getVoucher);
router.post('/', requireToken, requireOperations, VoucherController.createVoucher);
router.patch('/:id', requireToken, requireOperations, VoucherController.updateVoucher);
router.delete('/:id', requireToken, requireOperations, VoucherController.deleteVoucher);
router.post('/claim', requireToken, requireCustomer, VoucherController.claimVoucher);
router.get('/customer/mine', requireToken, requireCustomer, VoucherController.getCustomerVouchers);
router.get('/customer/mine/:id', requireToken, requireCustomer, VoucherController.getCustomerVoucher);

module.exports = router;
