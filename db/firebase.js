const admin = require('firebase-admin');

const serviceAccount = require('../labourlance-86ad6-firebase-adminsdk-6iqsm-ffc01e1d70.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://labourlance-86ad6-default-rtdb.firebaseio.com" // Replace with your database URL
});

module.exports = admin;