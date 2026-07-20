const express = require('express');
const authMiddleware = require('../middlewares/auth');
const testController = require('../controllers/test-controller');

const router = express.Router();

router.post('/test/:id', authMiddleware.authenticate, testController.sendEmailTest);
router.post('/test2', testController.sendEmailTest2);

// ทดสอบส่งอีเมลทุกเทมเพลต (POST /test/send-all-templates body: { email })
router.post('/send-all-templates', testController.sendAllTemplates);

module.exports = router;