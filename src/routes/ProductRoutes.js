const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/ProductController');
const { requireToken, requireOperations } = require('../middlewares/AuthMiddleware');

router.get('/', requireToken, ProductController.getProducts);
router.get('/:id', requireToken, ProductController.getProduct);
router.post('/', requireToken, requireOperations, ProductController.createProduct);
router.patch('/:id', requireToken, requireOperations, ProductController.updateProduct);
router.put('/:id/addons', requireToken, requireOperations, ProductController.configureAddons);
router.delete('/:id', requireToken, requireOperations, ProductController.phaseOutProduct);

module.exports = router;
