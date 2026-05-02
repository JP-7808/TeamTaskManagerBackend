import Task from '../models/Task.js';
import Project from '../models/Project.js';
import User from '../models/User.js';

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
export const getDashboardStats = async (req, res) => {
  try {
    let tasks;
    let projects;

    if (req.user.role === 'Admin') {
      // Get all projects where user is admin
      projects = await Project.find({ admin: req.user.id });
      const projectIds = projects.map(p => p._id);
      tasks = await Task.find({ project: { $in: projectIds } });
      
      // Get all members from these projects
      const memberIds = [];
      projects.forEach(project => {
        project.members.forEach(member => {
          if (!memberIds.includes(member.toString())) {
            memberIds.push(member.toString());
          }
        });
      });
      
      // Get member details
      const members = await User.find({ _id: { $in: memberIds } });
      
      // Total tasks
      const totalTasks = tasks.length;
      
      // Tasks by status
      const tasksByStatus = {
        'To Do': tasks.filter(t => t.status === 'To Do').length,
        'In Progress': tasks.filter(t => t.status === 'In Progress').length,
        'Done': tasks.filter(t => t.status === 'Done').length
      };
      
      // Tasks per user
      const tasksPerUser = [];
      for (const member of members) {
        const userTasks = tasks.filter(t => t.assignedTo.toString() === member._id.toString());
        tasksPerUser.push({
          userId: member._id,
          name: member.name,
          email: member.email,
          taskCount: userTasks.length
        });
      }
      
      // Overdue tasks
      const today = new Date();
      const overdueTasks = tasks.filter(t => 
        t.dueDate < today && t.status !== 'Done'
      ).length;
      
      // Recent tasks
      const recentTasks = await Task.find({ project: { $in: projectIds } })
        .sort('-createdAt')
        .limit(5)
        .populate('assignedTo', 'name')
        .populate('project', 'name');
      
      res.status(200).json({
        success: true,
        stats: {
          totalTasks,
          tasksByStatus,
          tasksPerUser,
          overdueTasks,
          recentTasks,
          totalProjects: projects.length,
          totalMembers: members.length
        }
      });
    } else {
      // Member view - only their tasks
      tasks = await Task.find({ assignedTo: req.user.id });
      
      const totalTasks = tasks.length;
      
      const tasksByStatus = {
        'To Do': tasks.filter(t => t.status === 'To Do').length,
        'In Progress': tasks.filter(t => t.status === 'In Progress').length,
        'Done': tasks.filter(t => t.status === 'Done').length
      };
      
      const today = new Date();
      const overdueTasks = tasks.filter(t => 
        t.dueDate < today && t.status !== 'Done'
      ).length;
      
      const recentTasks = await Task.find({ assignedTo: req.user.id })
        .sort('-createdAt')
        .limit(5)
        .populate('project', 'name');
      
      // Get user's projects
      const userProjects = await Project.find({ members: req.user.id });
      
      res.status(200).json({
        success: true,
        stats: {
          totalTasks,
          tasksByStatus,
          overdueTasks,
          recentTasks,
          totalProjects: userProjects.length
        }
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};