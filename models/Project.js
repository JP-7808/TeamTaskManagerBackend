import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a project name'],
    trim: true,
    unique: true
  },
  description: {
    type: String,
    required: [true, 'Please add a description']
  },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  tasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Project = mongoose.model('Project', projectSchema);
export default Project;