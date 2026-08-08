const express = require('express');
const ctrl = require('../controllers/address.controller');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { addressRules, objectId } = require('../validators');

const router = express.Router();

router.use(protect);

router.get('/', ctrl.listAddresses);
router.post('/', addressRules, validate, ctrl.createAddress);
router.patch('/:id', objectId('id'), validate, ctrl.updateAddress);
router.delete('/:id', objectId('id'), validate, ctrl.deleteAddress);
router.patch('/:id/default', objectId('id'), validate, ctrl.setDefaultAddress);

module.exports = router;
