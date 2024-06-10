const User = require('../models/User');
const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const CustomError = require('../errors');
const {createJWT}= require('../utils');
const twilio = require('twilio');


const client = twilio(process.env.Account_SID, process.env.Auth_Token);
const otpStore = {};
const tempUserStore = {};

const verifyPhonenumber = async (req, res) => {
    const { phoneNumber, email, newPassword, confirmPassword } = req.body;
    const phoneNumberRegex = /^\+977\s\d{10}$/;
    const isValidPhoneNumber = phoneNumber && phoneNumberRegex.test(phoneNumber);
  
    if (!email && !phoneNumber) {
      throw new CustomError.BadRequestError('Either email or phone number must be provided');
    }
  
    try {
      if (phoneNumber) {
        if (!isValidPhoneNumber) {
          throw new CustomError.BadRequestError('Invalid phone number format');
        }
  
        const existingUser = await User.findOne({ phoneNumber });
        if (!existingUser) {
          throw new CustomError.BadRequestError('Phone number not registered');
        }
  
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[otp] = existingUser._id; // Store user ID associated with OTP
  
        await client.messages.create({
          body: `Your OTP code is ${otp}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phoneNumber,
        });
  
        return res.status(StatusCodes.CREATED).json({ msg: 'OTP sent to phone number. Please verify.' });
      }
      //test only since we have only one phone number
      else if (email) {
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
          throw new CustomError.BadRequestError('Email not registered');
        }
  
        if (!newPassword || !confirmPassword) {
          throw new CustomError.BadRequestError('New password and confirm password fields cannot be empty');
        }
  
        if (newPassword !== confirmPassword) {
          throw new CustomError.BadRequestError('Passwords do not match');
        }
  
        existingUser.password = newPassword; 
        await existingUser.save();
  
        return res.status(StatusCodes.OK).json({ msg: 'Password updated successfully' });
      }
    } catch (error) {
      console.error('Error in processing request:', error);
      throw new CustomError.BadRequestError('Failed to process request');
    }
  };

  const resetPassword = async (req, res) => {
    const { otp, newPassword, confirmPassword } = req.body;
  
    // Log the OTP store and provided OTP
    console.log('otpStore:', otpStore);
    console.log('Provided OTP:', otp);
  
    const userId = otpStore[otp];
    console.log('Stored User ID:', userId);
  
    if (!userId) {
      throw new CustomError.BadRequestError('Invalid or expired OTP');
    }
  
    if (!newPassword || !confirmPassword) {
      throw new CustomError.BadRequestError('New password and confirm password fields cannot be empty');
    }
  
    if (newPassword !== confirmPassword) {
      throw new CustomError.BadRequestError('New password and confirm password do not match');
    }
  
    // Log the query and result
    const user = await User.findById(userId);
    console.log('User found:', user);
  
    if (!user) {
      throw new CustomError.BadRequestError('No user found for this ID');
    }
  
    // Hash the password before saving (if necessary)
    user.password = newPassword; 
    await user.save();
  
    delete otpStore[otp];
    delete tempUserStore[user.phoneNumber];
  
    res.status(StatusCodes.OK).json({ msg: 'Password updated successfully' });
  };


  module.exports={verifyPhonenumber,resetPassword}