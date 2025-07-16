const express = require('express');
const router = express.Router();
const signatureController = require('../controllers/signature-controller');
const upload = require("../middlewares/upload");
const { authenticate } = require('../middlewares/auth');

router.post('/',upload.single('images'), signatureController.createSignature);
router.get('/', signatureController.getAllSignature);
router.get('/get/:id', signatureController.getSignatureById);
router.put('/update/:userId', upload.single('images'), signatureController.updateSignature);
router.delete('/delete/:userId', signatureController.deleteSignature);
router.get("/me", authenticate, signatureController.getSignatureIsMine);
router.get('/user/:userId', signatureController.getSignatureByUserId);

module.exports = router;
