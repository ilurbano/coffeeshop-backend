const express = require('express');
const router = express.Router();

const AuthController = require('../controllers/AuthController');

//=======================//
// CUSTOMER REGISTRATION //
//=======================//

router.post('/register-customer', AuthController.registerCustomer);

//============//
// USER LOGIN //
//============//

router.post('/login', AuthController.login);

module.exports = router;
