const express = require('express');
const router = express.Router();
const {verifyPhonenumber,resetPassword}=require('../controllers/forgetPassword')

router.route('/verifyPhonenumber').post(verifyPhonenumber)
router.route('/resetPassword').patch(resetPassword)

module.exports=router