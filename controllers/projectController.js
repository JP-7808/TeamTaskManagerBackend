import Project from '../models/Project.js';
import User from '../models/User.js';
import Task from '../models/Task.js';

// @desc    Create a new project
// @route   POST /api/projects
// @access  Private/Admin
export const createProject = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if project exists
    const projectExists = await Project.findOne({ name });
    if (projectExists) {
      return res.status(400).json({ message: 'Project with this name already exists' });
    }

    // Create project
    const project = await Project.create({
      name,
      description,
      admin: req.user.id,
      members: [req.user.id]
    });

    // Add project to user's projects
    await User.findByIdAndUpdate(req.user.id, {
      $push: { projects: project._id }
    });

    res.status(201).json({
      success: true,
      project
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all projects for a user
// @route   GET /api/projects
// @access  Private
export const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        { admin: req.user.id },
        { members: req.user.id }
      ]
    }).populate('admin', 'name email')
      .populate('members', 'name email')
      .populate('tasks');

    res.status(200).json({
      success: true,
      projects
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single project
// @route   GET /api/projects/:id
// @access  Private
export const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('admin', 'name email')
      .populate('members', 'name email')
      .populate('tasks');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user has access
    if (project.admin.toString() !== req.user.id && 
        !project.members.some(member => member._id.toString() === req.user.id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.status(200).json({
      success: true,
      project
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add member to project
// @route   POST /api/projects/:id/members
// @access  Private/Admin
export const addMember = async (req, res) => {
  try {
    const { email } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user is admin
    if (project.admin.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only admin can add members' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already a member
    if (project.members.includes(user._id)) {
      return res.status(400).json({ message: 'User is already a member' });
    }

    // Add to project
    project.members.push(user._id);
    await project.save();

    // Add project to user's projects
    await User.findByIdAndUpdate(user._id, {
      $push: { projects: project._id }
    });

    res.status(200).json({
      success: true,
      project
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Remove member from project
// @route   DELETE /api/projects/:id/members/:userId
// @access  Private/Admin
export const removeMember = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user is admin
    if (project.admin.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only admin can remove members' });
    }

    // Remove member
    project.members = project.members.filter(
      member => member.toString() !== req.params.userId
    );
    await project.save();

    // Remove project from user's projects
    await User.findByIdAndUpdate(req.params.userId, {
      $pull: { projects: project._id }
    });

    res.status(200).json({
      success: true,
      project
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};