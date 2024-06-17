const express = require('express');
const router = express.Router();

const sendNotification  = require('../controllers/notification');

router.post('/send-notification', sendNotification);

module.exports = router;