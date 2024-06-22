const admin = require('firebase-admin');
const serviceAccount = require('../shrami-329b1-firebase-adminsdk-9lt4u-0d45533262.json');
const messaging = admin.messaging();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});