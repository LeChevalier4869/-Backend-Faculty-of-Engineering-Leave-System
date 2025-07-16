const express = require('express');
const router = express.Router();
const signatureController = require('../controllers/signature-controller');
const upload = require("../middlewares/upload");
const { authenticate } = require('../middlewares/auth');

router.post('/',upload.single('images'), signatureController.createSignature);
router.get('/', signatureController.getAllSignature);
router.get('/get/:id', signatureController.getSignatureById);
router.put('/update/:id', upload.single('images'), signatureController.updateSignature);
router.delete('/delete/:id', signatureController.deleteSignature);
router.get("/me", authenticate, signatureController.getSignatureIsMine);
router.get('/signature/:userId', signatureController.getSignatureByUserId);

module.exports = router;
