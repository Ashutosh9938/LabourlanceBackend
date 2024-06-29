require('dotenv').config();
const axios = require('axios');
const FcmToken = require('../models/fcmToken');
const mongoose = require('mongoose');
const firebaseUrl = process.env.FIREBASE_URL;

const storeFcmToken = async (req, res) => {
  try {
    console.log('Request received to store FCM token:', req.body);

    const { registrationToken } = req.body;
    const userId = req.user.userId; // Get the userId from the authenticated session
console.log('User ID:', userId);  
    if (!registrationToken) {
      return res.status(400).send({ message: 'Registration token is required' });
    }
    let fcmToken = await FcmToken.findOne({ userId });
    if (fcmToken) {
      if (!fcmToken.registrationToken.includes(registrationToken)) {
        fcmToken.registrationToken.push(registrationToken);
        await fcmToken.save();
      }
    } else {
      fcmToken = new FcmToken({ userId, registrationToken: [registrationToken] });
      await fcmToken.save();
    }

    res.status(200).send({ message: 'FCM token stored successfully' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send({ message: 'Failed to store FCM token', error: error.message });
  }
};

const sendNotification = async (req, res) => {
  try {
    console.log('Request received:', req.body);

    const { title, body, registrationToken } = req.body;

    if (!title || !body || !registrationToken) {
      return res.status(400).send({ message: 'Title, body, and registrationToken are required' });
    }

    const message = {
      "message": {
        "token": registrationToken,
        "notification": {
          "body": body,
          "title": title
        }
      }
    };

    console.log('Sending request to Firebase with message:', message);

    const response = await axios.post(firebaseUrl, message);
    console.log('Response:', response.data);

    res.status(200).send({ message: 'Notification sent successfully', data: response.data });
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(500).send({ message: 'Failed to send notification', error: error.response ? error.response.data : error.message });
  }
};

module.exports = {sendNotification, storeFcmToken};
