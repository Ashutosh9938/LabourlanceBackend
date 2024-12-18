const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const { StatusCodes } = require('http-status-codes');
const { BadRequestError, NotFoundError, UnauthenticatedError, InternalServerError } = require('../errors');
const Job = require('../models/Job');
const mongoose = require('mongoose');
const  streamifier=require( 'streamifier')
const User = require('../models/User'); 
const { sendNotificationOfJobPosted ,sendNotificationToUser } = require('./notification');

const createJob = async (req, res, next) => {
  if (!req.user || !req.user.userId) {
    return next(new BadRequestError('Please provide user'));
  }

  const userId = req.user.userId;
  const user = await User.findById(userId);

  if (!user) {
    return next(new BadRequestError('User not found'));
  }

  if (user.role !== 'WorkProvider' ) {
    return next(new BadRequestError('Only work providers can create jobs'));
  }

  if (!req.files || !req.files.media) {
    return next(new BadRequestError('No media file uploaded'));
  }

  const mediaFile = req.files.media;
  const { Title, workDescription, jobType, price, latitude, longitude } = req.body;

  try {
    const uploadPromise = new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'auto', folder: 'job_media', tags: [userId, user.name] },
        (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        }
      );
      stream.end(mediaFile.data);
    });

    const uploadedMediaUrl = await uploadPromise;

    const jobData = {
      Title,
      workDescription,
      userId,
      userName: user.name,
      userLastName: user.lastName,
      userEmail: user.email,
      jobType,
      price,
      image: uploadedMediaUrl,
      applications: [],
      assignedWorker: {
        workerId: null,
        workerName: null,
      },
      completedBy: null,
      completedByName: null,
      // jobLocation: {
      //   type: 'Point',
      //   coordinates: [parseFloat(longitude), parseFloat(latitude)]
      // }
    };

    const job = await Job.create(jobData);
    const notificationTitle = 'New Job Posted';
    const notificationBody = `${user.name} ${user.lastName} posted a new job: ${Title}`;

    await sendNotificationOfJobPosted(notificationTitle, notificationBody, userId);
    res.status(StatusCodes.CREATED).json({ job });
  } catch (error) {
    console.error('Error creating job:', error.message);
    if (!res.headersSent) {
      res.status(200).json({ message: 'Server error' });
    }
  }
};
const applyForJob = async (req, res, next) => {
  const { jobId } = req.body;
  const workerId = req.user.userId;

  if (!workerId) {
    return next(new BadRequestError('User not authenticated'));
  }

  const user = await User.findById(workerId);
  if (!user || user.role !== 'Worker') {
    return next(new BadRequestError('You are not authorized to apply for jobs'));
  }

  const job = await Job.findById(jobId);
  if (!job) {
    return next(new BadRequestError('Job not found'));
  }

  // Ensure applications field is initialized
  if (!job.applications) {
    job.applications = [];
  }

  if (job.applications.some(app => app.workerId.toString() === workerId)) {
    return next(new BadRequestError('You have already applied for this job'));
  }

  job.applications.push({
    workerId,
    workerName: user.name
  });

  await job.save();

  const jobProvider = await User.findById(job.userId);
  if (!jobProvider) {
    return next(new BadRequestError('Job provider not found'));
  }

  const notificationTitle = 'Job Application';
  const notificationBody = `${user.name} has applied for your job: ${job.Title}`;

  try {
    await sendNotificationToUser(notificationTitle, notificationBody, job.userId,jobId);
  } catch (error) {
    console.error('Error sending notification:', error.message);
    return next(new BadRequestError('Failed to send notification'));
  }

  res.status(200).json({ message: 'Application submitted successfully'});
};

const assignJob = async (req, res, next) => {
  const { jobId, workerId } = req.body;
  const job = await Job.findById(jobId);

  if (!job) {
    throw new BadRequestError('Job not found');
  }

  if (job.userId.toString() !== req.user.userId) {
    throw new UnauthenticatedError('You are not authorized to assign this job');
  }

  if (job.assignedWorker && job.assignedWorker.workerId) {
    throw new BadRequestError('Job already assigned to a worker');
  }

  const applicant = job.applications.find(app => app.workerId.toString() === workerId);

  if (!applicant) {
    throw new BadRequestError('Worker not found in applications');
  }

  const worker = await User.findById(workerId);
  if (!worker || worker.role !== 'Worker') {
    throw new BadRequestError('Only users with role Worker can be assigned');
  }

  job.assignedWorker = {
    workerId: applicant.workerId,
    workerName: applicant.workerName,
  }; 

  job.status = 'pending';
 
  await job.save();

  const notificationTitle = 'Job Assigned';
  const notificationBody = `You have been assigned to the job: ${job.Title}`;
  await sendNotificationToUser(notificationTitle, notificationBody, workerId,jobId);

  res.status(200).json({ message: 'Job assigned successfully' });
};

const confirmJobCompletion = async (req, res, next) => {
  const { jobId } = req.body;
  const providerId = req.user.userId;

  const job = await Job.findById(jobId);
  if (!job) {
    return next(new BadRequestError('Job not found'));
  }

  if (job.userId.toString() !== providerId) {
    return next(new UnauthenticatedError('You are not authorized to confirm this job'));
  }

  if (job.status === 'completed') {
    return next(new BadRequestError('Job is already completed'));
  }

  const assignedWorker = job.assignedWorker;

  if (!assignedWorker || !assignedWorker.workerId) {
    return next(new BadRequestError('No worker assigned to this job'));
  }

  job.status = 'completed';
  job.completedBy = assignedWorker.workerId;
  await job.save();

  const worker = await User.findById(assignedWorker.workerId);
  if (!worker || worker.role !== 'Worker') {
    return next(new BadRequestError('Assigned worker not found or not valid'));
  }

  if (!worker.completedJobs) {
    worker.completedJobs = [];
  }
  worker.completedJobs.push({
    jobId,
    jobTitle: job.Title
  });
  await worker.save();

  const notificationTitle = 'Job Completed';
  const notificationBody = `The job '${job.Title}' has been marked as completed. Check your profile for details.`;

  try {
    await sendNotificationToUser(notificationTitle, notificationBody, worker._id);
  } catch (error) {
    console.error('Error sending notification:', error.message);
    return next(new BadRequestError('Failed to send notification'));
  }

  res.status(200).json({ message: 'Job confirmed as completed and worker notified' });
};


const getCompletedJobs = async (req, res, next) => {
  const workerId = req.user.userId; 

  const worker = await User.findById(workerId).select('completedJobs');
  if (!worker) {
    return next(new BadRequestError('Worker not found'));
  }

  res.status(200).json({ completedJobs: worker.completedJobs });
};



const getAllPosts = async (req, res) => {//shows all the jobs posted by every user
  const jobs = await Job.find({}).limit(10).sort('-createdAt');
  res.status(200).json({ jobs, count: jobs.length });
};

const getAllJobs = async (req, res) => {
  const jobId = req.body.jobId;
  const userId = req.user.userId;

  try {
    let queryObject = {};

    if (jobId) {
      const job = await Job.findById(jobId);
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }
      queryObject.userId = job.userId;
    } else {
      queryObject.userId = userId;
    }

    const result = Job.find(queryObject);

    const jobs = await result;
    const totalJobs = await Job.countDocuments(queryObject);


    res.status(200).json({ totalJobs, jobs});
  } catch (error) {
    console.error(error);
    res.status(200).json({ message: 'Server error' });
  }
};

const getJob = async (req, res, next) => {
  const { jobId } = req.body;

  console.log(`Fetching job with ID: ${jobId}`);

  try {
    const job = await Job.findById(jobId)
      .populate('applications.workerId', 'name')
      .populate('completedBy', 'name')
      .populate('assignedWorker.workerId', 'name'); // Populate assignedWorker with user's details

    if (!job) {
      console.log(`No job found with ID: ${jobId}`);
      return next(new NotFoundError(`No job with id ${jobId}`));
    }

    res.status(200).json({
      job: {
        id: job._id,
        v: job.__v,
        Title: job.Title,
        status: job.status,
        userId: job.userId,
        userName: job.userName,
        userLastName: job.userLastName,
        userEmail: job.userEmail,
        jobType: job.jobType,
        price: job.price,
        image: job.image,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        workDescription: job.workDescription,
        applications: job.applications.map(app => ({
          workerId: app.workerId ? app.workerId._id : null,
          workerName: app.workerId ? app.workerId.name : null
        })),
        assignedWorker: job.assignedWorker && job.assignedWorker.workerId ? {
          workerId: job.assignedWorker.workerId._id,
          workerName: job.assignedWorker.workerId.name
        } : {
          workerId: null,
          workerName: null
        },
        completedBy: job.completedBy ? {
          workerId: job.completedBy._id,
          name: job.completedBy.name
        } : {
          workerId: null,
          name: null
        }
      }
    });
  } catch (error) {
    console.error('Error fetching job:', error.message);
    return next(new BadRequestError('Failed to fetch job details'));
  }
};



const updateJob = async (req, res, next) => {
  const {
    body: { jobId, Title, workDescription, jobType, jobLocation, price },
    files,
    user: { userId }
  } = req;

  try {
    const job = await Job.findOne({ _id: jobId, userId });
    if (!job) {
      return next(new NotFoundError(`No job with id ${jobId} found for this user`));
    }

    if (Title) {
      job.Title = Title;
    }
    if (workDescription) {
      job.workDescription = workDescription;
    }
    if (jobType) {
      job.jobType = jobType;
    }
    if (jobLocation) {
      job.jobLocation = jobLocation;
    }
    if (price ) {
      job.price = price;
    }

    if (files && files.media) {
      const mediaFile = files.media;

      const uploadPromise = new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto', folder: 'job_media' ,tags: [userId, User.name] },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        stream.end(mediaFile.data);
      });

      const uploadedMediaUrl = await uploadPromise;
      job.image = uploadedMediaUrl;
    }

    await job.save();
    res.status(200).json( job );
  } catch (error) {
    if (!res.headersSent) {
      res.status(error instanceof NotFoundError ? StatusCodes.NOT_FOUND : StatusCodes.BAD_REQUEST).json({ error: error.message });
    } else {
      next(error);
    }
  }
};

const deleteJob = async (req, res) => {
  const {
    user: { userId },
    body: { jobId },
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

  res.status(200).json({ defaultStats, monthlyApplications });
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
  getAllPosts,
  applyForJob,
  assignJob,
  confirmJobCompletion,
  getCompletedJobs
}; 