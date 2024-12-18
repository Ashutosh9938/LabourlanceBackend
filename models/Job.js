const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema(
  {
    Title: {
      type: String,
      required: [true, 'Please provide Title name'],
      maxlength: 50,
    },
    workDescription: {
      type: String,
      required: [true, 'Please provide workDescription'],
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'completed'],
      default: 'active',
    },
    userId: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
      required: [true, 'Please provide user'],
    },
    
    userName: {
      type: String,
      required: [true, 'Please provide user name'],
    },
    userLastName: {
      type: String,
      required: [true, 'Please provide user last name'],
    },
    userEmail: {
      type: String,
      required: [true, 'Please provide user email'],
    },
    jobType: {
      type: String,
      enum: ['Technical', 'Household', 'Repair', 'Construction', 'Cleaning', 'Gardening', 'Cooking', 'Shifting Service', 'others'],
      required: [true, 'Select the job categories '],
    },
    price: {
      type: Number,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    applications: [
      {
        workerId: {
          type: mongoose.Types.ObjectId,
          ref: 'User',
        },
        workerName: {
          type: String,
        },
      },
    ],
    assignedWorker: {
      workerId: {
        type: mongoose.Types.ObjectId,
        ref: 'User',
      },
      workerName: {
        type: String,
      },
    },
    completedBy: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    completedByName: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

JobSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    ret.v = ret.__v;
    delete ret.__v;
  },
});

module.exports = mongoose.model('Job', JobSchema);
