const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const { StatusCodes } = require('http-status-codes');
const { BadRequestError, NotFoundError } = require('../errors');
const Job = require('../models/Job');
const mongoose = require('mongoose');
const  streamifier=require( 'streamifier')
const User = require('../models/User'); 


const createJob = async (req, res, next) => {
  if (!req.user || !req.user.userId) {
    return next(new BadRequestError('Please provide user'));
  }

  const userId = req.user.userId;
  const user = await User.findById(userId);
  if (!user) {
    return next(new BadRequestError('User not found'));
  }

  if (!req.files || !req.files.media) {
    return next(new BadRequestError('No media files uploaded'));
  }

  const mediaFiles = Array.isArray(req.files.media) ? req.files.media : [req.files.media];
  
  try {
    const uploadPromises = mediaFiles.map(file =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto', folder: 'job_media' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        stream.end(file.data);
      })
    );

    const uploadedMedia = await Promise.all(uploadPromises);

    const jobData = {
      ...req.body,
      userId,
      userName: user.name,
      userLastName: user.lastName,
      userEmail: user.email,
      image: uploadedMedia
    };

    const job = await Job.create(jobData);
    res.status(StatusCodes.CREATED).json({ job });
  } catch (error) {
    if (!res.headersSent) {
      res.status(error instanceof NotFoundError ? StatusCodes.NOT_FOUND : StatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  }
};


const getAllPosts = async (req, res) => {//shows all the jobs posted by every user
  const jobs = await Job.find({}).limit(10).sort('-createdAt');
  
  const formattedJobs = jobs.map(job => ({
    id: job._id,
    Title: job.Title,
    workDescription: job.workDescription,
    status: job.status,
    userId: job.userId,
    userName: job.userName,
    userLastName: job.userLastName,
    userEmail: job.userEmail,
    jobType: job.jobType,
    jobLocation: job.jobLocation,
    price: job.price,
    image: job.image,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  }));
  res.status(StatusCodes.OK).json({ jobs: formattedJobs, count: formattedJobs.length });
};

const getAllJobs = async (req, res) => {
  const { search, status, jobType, sort } = req.query;

  const queryObject = {
    userId: req.user.userId,
  };

  if (search) {
    queryObject.workDescription = { $regex: search, $options: 'i' };
  }
  if (status && status !== 'all') {
    queryObject.status = status;
  }
  if (jobType && jobType !== 'all') {
    queryObject.jobType = jobType;
  }
  let result = Job.find(queryObject);

  if (sort === 'latest') {
    result = result.sort('-createdAt');
  }
  if (sort === 'oldest') {
    result = result.sort('createdAt');
  }
  if (sort === 'a-z') {
    result = result.sort('workDescription');
  }
  if (sort === 'z-a') {
    result = result.sort('-workDescription');
  }




  const jobs = await result;

  const totalJobs = await Job.countDocuments(queryObject);
  const formattedJobs = jobs.map(job => ({
    id: job._id,
    Title: job.Title,
    workDescription: job.workDescription,
    status: job.status,
    userId: job.userId,
    userName: job.userName,
    userLastName: job.userLastName,
    userEmail: job.userEmail,
    jobType: job.jobType,
    jobLocation: job.jobLocation,
    price: job.price,
    image: job.image,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  }));

  res.status(StatusCodes.OK).json({ jobs:formattedJobs, totalJobs});
};
const getJob = async (req, res) => {
  const { id: jobId } = req.params;

  console.log(`Fetching job with ID: ${jobId}`);

  const job = await Job.findById(jobId);

  if (!job) {
    console.log(`No job found with ID: ${jobId}`);
    throw new NotFoundError(`No job with id ${jobId}`);
  }

  res.status(StatusCodes.OK).json({ job });
};

const updateJob = async (req, res) => {
  const {
    body: { Title, workDescription, jobType, jobLocation, price, image },
    user: { userId },
    params: { id: jobId },
  } = req;

  const job = await Job.findOne({ _id: jobId, userId: userId });
  if (!job) {
    throw new NotFoundError(`No job with id ${jobId} found for this user`);
  }
  if (Title !== undefined && Title !== null && Title !== '') {
    job.Title = Title;
  }
  if (workDescription !== undefined && workDescription !== null && workDescription !== '') {
    job.workDescription = workDescription;
  }
  if (jobType !== undefined && jobType !== null && jobType !== '') {
    job.jobType = jobType;
  }
  if (jobLocation !== undefined && jobLocation !== null && jobLocation !== '') {
    job.jobLocation = jobLocation;
  }
  if (price !== undefined && price !== null) {
    job.price = price;
  }
  if (image !== undefined && image !== null && image !== '') {
    job.image = image;
  }
  const formattedJobs = jobs.map(job => ({
    id: job._id,
    Title: job.Title,
    workDescription: job.workDescription,
    status: job.status,
    userId: job.userId,
    userName: job.userName,
    userLastName: job.userLastName,
    userEmail: job.userEmail,
    jobType: job.jobType,
    jobLocation: job.jobLocation,
    price: job.price,
    image: job.image,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  }));

  await job.save();

  res.status(StatusCodes.OK).json({ job:formattedJobs });
};

const deleteJob = async (req, res) => {
  const {
    user: { userId },
    params: { id: jobId },
  } = req;

  const job = await Job.findOne({ _id: jobId, userId: userId });
  if (!job) {
    throw new NotFoundError(`No job with id ${jobId} found for this user`);
  }

  await job.remove();

  res.status(StatusCodes.OK).send();
};

const showStats = async (req, res) => {
  let stats = await Job.aggregate([
    { $match: { user_ID: mongoose.Types.ObjectId(req.user.userId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  stats = stats.reduce((acc, curr) => {
    const { _id: title, count } = curr;
    acc[title] = count;
    return acc;
  }, {});

  const defaultStats = {
    pending: stats.pending || 0,
    Taken: stats.interview || 0,
    completed: stats.completed || 0,
  };

  let monthlyApplications = await Job.aggregate([
    { $match: { user_ID: mongoose.Types.ObjectId(req.user.userId) } },
    {
      $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': -1, '_id.month': -1 } },
    { $limit: 6 },
  ]);

  monthlyApplications = monthlyApplications
    .map((item) => {
      const {
        _id: { year, month },
        count,
      } = item;
      const date = moment()
        .month(month - 1)
        .year(year)
        .format('MMM Y');
      return { date, count };
    })
    .reverse();

  res.status(StatusCodes.OK).json({ defaultStats, monthlyApplications });
};

// const uploadProductMedia = async (req, res) => {
//   try {
//     console.log('Incoming files:', req.files);

//     if (!req.files || !req.files.media) {
//       throw new BadRequestError('No File Uploaded');
//     }
//     const productMedia = req.files.media;
//     const files = Array.isArray(productMedia) ? productMedia : [productMedia];
//     console.log('Files to process:', files);
//     const areValidFiles = files.every(file => file.mimetype.startsWith('image') || file.mimetype.startsWith('video'));
//     if (!areValidFiles) {
//       throw new BadRequestError('Please upload image or video files only');
//     }
//     const maxImageSize = 5 * 1024 * 1024; // 5MB for images
//     const maxVideoSize = 50 * 1024 * 1024; // 50MB for videos

//     files.forEach(file => {
//       if (file.mimetype.startsWith('image') && file.size > maxImageSize) {
//         throw new BadRequestError('Please upload images smaller than 5MB');
//       }
//       if (file.mimetype.startsWith('video') && file.size > maxVideoSize) {
//         throw new BadRequestError('Please upload videos smaller than 50MB');
//       }
//     });

//     const uploadPromises = files.map(file => new Promise((resolve, reject) => {
//       const resourceType = file.mimetype.startsWith('image') ? 'image' : 'video';
//       const uploadStream = cloudinary.uploader.upload_stream({
//         use_filename: true,
//         folder: 'file-upload',
//         resource_type: resourceType,
//       }, (error, result) => {
//         if (error) {
//           reject(new InternalServerError('Cloudinary Upload Failed'));
//         } else {
//           resolve({ src: result.secure_url });
//         }
//       });

//       streamifier.createReadStream(file.data).pipe(uploadStream);
//     }));

//     const uploadedMedia = await Promise.all(uploadPromises);

//     return  uploadedMedia ;
//   } catch (error) {
//     // Handle errors
//     console.error('Upload error:', error);
//     throw error;
//   }
// };




module.exports = {
  createJob,
  deleteJob,
  getAllJobs,
  updateJob,
  getJob,
  showStats,
  // uploadProductMedia,
  getAllPosts
};