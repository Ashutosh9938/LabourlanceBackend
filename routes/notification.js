const express = require('express');
const router = express.Router();
const {sendNotification , storeFcmToken} = require('../controllers/notification');
const authenticate = require('../middleware/authentication');

router.post('/store-fcm-token', authenticate, storeFcmToken);
router.post('/send-notification', authenticate, sendNotification);

module.exports = router;
