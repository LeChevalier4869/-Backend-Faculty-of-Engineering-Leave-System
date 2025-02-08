const express = require('express');
const authMiddleware = require('../middlewares/auth');
const testController = require('../controllers/test-controller');

const router = express.Router();

router.post('/:id', authMiddleware.authenticate, testController.sendEmailTest);

module.exports = router;