const express = require('express');
const router = express.Router();
const signatureController = require('../controllers/signature-controller');
const upload = require("../middlewares/upload");
const { authenticate } = require('../middlewares/auth');

router.post('/',upload.single('images'), signatureController.createSignature);
router.get('/', signatureController.getAllSignature);
router.get('/:id', signatureController.getSignatureById);
router.put('/:id', upload.single('images'), signatureController.updateSignature);
router.delete('/:id', signatureController.deleteSignature);
router.get("/me", authenticate, signatureController.getSignatureIsMine);

module.exports = router;
