const express = require('express');
const router = express.Router();
const User = require('../models/User');
const admin = require('../db/firebase');

const sendNotification = async (req, res) => { 
    try {
        const { userId, fcmToken, title, body } = req.body;

        const user = await User.findByIdAndUpdate(userId, { $addToSet: { fcmTokens: fcmToken }, $pull: { fcmTokens: { $ne: fcmToken } } }, { new: true });
        console.log('user',user);
        if (!user) {
            res.status(404).json({ msg: 'User not found' });
        } else {
          
            const message = {
                notification: {
                    title: title || 'Default Title',
                    body: body || 'Default Body'
                },
                token: fcmToken
            };
            
       
            const response=await admin.messaging().send(message);
console.log('response',response);
            res.status(200).json({ msg: 'FCM token saved successfully and message sent' });
        }
    } catch (error) {
        res.status(500).json({ msg: 'Error saving FCM token or sending message', error: error.message });
    }
}

module.exports =  sendNotification ;
