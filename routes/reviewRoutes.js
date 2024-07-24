const express = require('express');
const router = express.Router();
const { auth} = require('../middleware/authentication');

const {
  createReview,
  getAllReviews,
  getSingleReview,
  updateReview,
  deleteReview,
} = require('../controllers/reviewController');

router.route('/').post(auth, createReview).get(getAllReviews);

router
  .route('/:id')
  .get(getSingleReview)
  .patch(auth, updateReview)
  .delete(auth, deleteReview);

module.exports = router;
