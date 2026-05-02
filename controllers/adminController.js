import User from '../models/User.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';

// ==================== USER MANAGEMENT ====================

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .populate('projects', 'name');
    
    const totalUsers = users.length;
    const adminCount = users.filter(u => u.role === 'Admin').length;
    const memberCount = users.filter(u => u.role === 'Member').length;

    res.status(200).json({
      success: true,
      count: totalUsers,
      stats: {
        totalUsers,
        adminCount,
        memberCount
      },
      users
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single user by ID
// @route   GET /api/admin/users/:id
// @access  Private/Admin
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('projects', 'name description');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's tasks
    const tasks = await Task.find({ assignedTo: user._id })
      .populate('project', 'name')
      .sort('-createdAt');

    // Get user's projects where they are admin
    const adminProjects = await Project.find({ admin: user._id });

    res.status(200).json({
      success: true,
      user,
      stats: {
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === 'Done').length,
        inProgressTasks: tasks.filter(t => t.status === 'In Progress').length,
        todoTasks: tasks.filter(t => t.status === 'To Do').length,
        adminProjectsCount: adminProjects.length
      },
      recentTasks: tasks.slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user role
// @route   PUT /api/admin/users/:id/role
// @access  Private/Admin
// Alternative implementation that bypasses the pre-save middleware
export const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    
    if (!['Admin', 'Member'].includes(role)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid role. Must be Admin or Member' 
      });
    }

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Prevent changing own role
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ 
        success: false,
        message: 'You cannot change your own role' 
      });
    }

    // Use updateOne to avoid triggering pre-save middleware
    await User.updateOne(
      { _id: req.params.id },
      { $set: { role: role } }
    );

    const updatedUser = await User.findById(req.params.id).select('-password');
    
    res.status(200).json({
      success: true,
      message: `User role updated to ${role}`,
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user role error:', error);
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting self
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    // Find all projects where user is admin
    const adminProjects = await Project.find({ admin: user._id });
    
    if (adminProjects.length > 0) {
      return res.status(400).json({ 
        message: `Cannot delete user. User is admin of ${adminProjects.length} project(s). 
                  Please reassign project admin or delete projects first.`,
        projects: adminProjects.map(p => ({ id: p._id, name: p.name }))
      });
    }

    // Remove user from all projects
    await Project.updateMany(
      { members: user._id },
      { $pull: { members: user._id } }
    );

    // Reassign or delete tasks assigned to this user
    await Task.updateMany(
      { assignedTo: user._id },
      { assignedTo: null } // or you can assign to admin
    );

    // Delete user
    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== PROJECT MANAGEMENT ====================

// @desc    Get all projects (system-wide)
// @route   GET /api/admin/projects
// @access  Private/Admin
export const getAllProjects = async (req, res) => {
  try {
    const projects = await Project.find({})
      .populate('admin', 'name email')
      .populate('members', 'name email')
      .populate('tasks');

    const totalProjects = projects.length;
    const totalTasks = projects.reduce((sum, p) => sum + p.tasks.length, 0);
    const totalMembers = [...new Set(projects.flatMap(p => 
      p.members.map(m => m._id.toString())
    ))].length;

    res.status(200).json({
      success: true,
      stats: {
        totalProjects,
        totalTasks,
        totalMembers,
        averageTasksPerProject: (totalTasks / totalProjects).toFixed(2)
      },
      projects
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete any project (admin override)
// @route   DELETE /api/admin/projects/:id
// @access  Private/Admin
export const deleteAnyProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Delete all tasks in the project
    await Task.deleteMany({ project: project._id });

    // Remove project reference from all users
    await User.updateMany(
      { projects: project._id },
      { $pull: { projects: project._id } }
    );

    // Delete the project
    await project.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Project and all associated tasks deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Transfer project ownership
// @route   PUT /api/admin/projects/:id/transfer
// @access  Private/Admin
export const transferProjectOwnership = async (req, res) => {
  try {
    const { newAdminId } = req.body;
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const newAdmin = await User.findById(newAdminId);
    if (!newAdmin) {
      return res.status(404).json({ message: 'New admin user not found' });
    }

    // Check if new admin is a member of the project
    if (!project.members.includes(newAdminId)) {
      return res.status(400).json({ message: 'New admin must be a member of the project' });
    }

    const oldAdminId = project.admin;
    project.admin = newAdminId;
    await project.save();

    res.status(200).json({
      success: true,
      message: `Project ownership transferred to ${newAdmin.name}`,
      project: {
        id: project._id,
        name: project.name,
        oldAdmin: oldAdminId,
        newAdmin: newAdminId
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== TASK MANAGEMENT ====================

// @desc    Get all tasks (system-wide)
// @route   GET /api/admin/tasks
// @access  Private/Admin
export const getAllTasks = async (req, res, next) => {
  try {
    const { status, priority, projectId } = req.query;
    
    let query = {};
    if (status && status !== '') query.status = status;
    if (priority && priority !== '') query.priority = priority;
    if (projectId && projectId !== '') query.project = projectId;

    const tasks = await Task.find(query)
      .populate('assignedTo', 'name email')
      .populate('project', 'name description')
      .populate('createdBy', 'name email')
      .sort('-createdAt');

    const stats = {
      total: tasks.length,
      byStatus: {
        'To Do': tasks.filter(t => t.status === 'To Do').length,
        'In Progress': tasks.filter(t => t.status === 'In Progress').length,
        'Done': tasks.filter(t => t.status === 'Done').length
      },
      byPriority: {
        'Low': tasks.filter(t => t.priority === 'Low').length,
        'Medium': tasks.filter(t => t.priority === 'Medium').length,
        'High': tasks.filter(t => t.priority === 'High').length
      },
      overdue: tasks.filter(t => new Date(t.dueDate) < new Date() && t.status !== 'Done').length
    };

    res.status(200).json({
      success: true,
      stats,
      tasks: tasks || []
    });
  } catch (error) {
    console.error('Get all tasks error:', error);
    next(error);
  }
};

// @desc    Delete any task (admin override)
// @route   DELETE /api/admin/tasks/:id
// @access  Private/Admin
export const deleteAnyTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Remove task from project
    await Project.findByIdAndUpdate(task.project, {
      $pull: { tasks: task._id }
    });

    await task.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk delete tasks
// @route   POST /api/admin/tasks/bulk-delete
// @access  Private/Admin
export const bulkDeleteTasks = async (req, res) => {
  try {
    const { taskIds } = req.body;
    
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ message: 'Please provide an array of task IDs' });
    }

    // Get all tasks
    const tasks = await Task.find({ _id: { $in: taskIds } });
    
    if (tasks.length === 0) {
      return res.status(404).json({ message: 'No tasks found' });
    }

    // Remove tasks from projects
    for (const task of tasks) {
      await Project.findByIdAndUpdate(task.project, {
        $pull: { tasks: task._id }
      });
    }

    // Delete tasks
    await Task.deleteMany({ _id: { $in: taskIds } });

    res.status(200).json({
      success: true,
      message: `${tasks.length} task(s) deleted successfully`
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== DASHBOARD & ANALYTICS ====================

// @desc    Get system-wide dashboard statistics
// @route   GET /api/admin/dashboard/stats
// @access  Private/Admin
export const getAdminDashboardStats = async (req, res) => {
  try {
    // Get all users
    const users = await User.find({});
    const totalUsers = users.length;
    const adminUsers = users.filter(u => u.role === 'Admin').length;
    const memberUsers = users.filter(u => u.role === 'Member').length;

    // Get all projects
    const projects = await Project.find({});
    const totalProjects = projects.length;
    const activeProjects = projects.filter(p => p.tasks.length > 0).length;

    // Get all tasks
    const tasks = await Task.find({});
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'Done').length;
    const inProgressTasks = tasks.filter(t => t.status === 'In Progress').length;
    const todoTasks = tasks.filter(t => t.status === 'To Do').length;
    const highPriorityTasks = tasks.filter(t => t.priority === 'High').length;
    const overdueTasks = tasks.filter(t => 
      new Date(t.dueDate) < new Date() && t.status !== 'Done'
    ).length;

    // Tasks created per day (last 7 days)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const tasksCount = await Task.countDocuments({
        createdAt: { $gte: date, $lt: nextDate }
      });
      
      last7Days.push({
        date: date.toLocaleDateString(),
        tasks: tasksCount
      });
    }

    // Top performers (users with most completed tasks)
    const userTaskStats = [];
    for (const user of users) {
      const userTasks = await Task.find({ assignedTo: user._id });
      const completedUserTasks = userTasks.filter(t => t.status === 'Done');
      userTaskStats.push({
        userId: user._id,
        name: user.name,
        email: user.email,
        totalTasks: userTasks.length,
        completedTasks: completedUserTasks.length,
        completionRate: userTasks.length > 0 
          ? ((completedUserTasks.length / userTasks.length) * 100).toFixed(2)
          : 0
      });
    }
    
    const topPerformers = userTaskStats
      .sort((a, b) => b.completedTasks - a.completedTasks)
      .slice(0, 5);

    // Project with most tasks
    const projectsWithTaskCount = await Promise.all(projects.map(async (project) => {
      const taskCount = await Task.countDocuments({ project: project._id });
      return {
        projectId: project._id,
        name: project.name,
        taskCount,
        memberCount: project.members.length
      };
    }));
    
    const topProjects = projectsWithTaskCount
      .sort((a, b) => b.taskCount - a.taskCount)
      .slice(0, 5);

    res.status(200).json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          admins: adminUsers,
          members: memberUsers
        },
        projects: {
          total: totalProjects,
          active: activeProjects
        },
        tasks: {
          total: totalTasks,
          completed: completedTasks,
          inProgress: inProgressTasks,
          todo: todoTasks,
          highPriority: highPriorityTasks,
          overdue: overdueTasks,
          completionRate: totalTasks > 0 
            ? ((completedTasks / totalTasks) * 100).toFixed(2)
            : 0
        },
        weeklyActivity: last7Days,
        topPerformers,
        topProjects
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get system logs/activity (recent actions)
// @route   GET /api/admin/activity
// @access  Private/Admin
export const getSystemActivity = async (req, res) => {
  try {
    // Get recent tasks created
    const recentTasks = await Task.find({})
      .sort('-createdAt')
      .limit(10)
      .populate('createdBy', 'name')
      .populate('project', 'name');

    // Get recent projects created
    const recentProjects = await Project.find({})
      .sort('-createdAt')
      .limit(10)
      .populate('admin', 'name');

    // Get recent user registrations
    const recentUsers = await User.find({})
      .sort('-createdAt')
      .limit(10)
      .select('name email role createdAt');

    const activity = {
      recentTasks: recentTasks.map(t => ({
        type: 'task_created',
        title: t.title,
        project: t.project.name,
        createdBy: t.createdBy.name,
        timestamp: t.createdAt,
        status: t.status
      })),
      recentProjects: recentProjects.map(p => ({
        type: 'project_created',
        name: p.name,
        createdBy: p.admin.name,
        timestamp: p.createdAt,
        memberCount: p.members.length
      })),
      recentUsers: recentUsers.map(u => ({
        type: 'user_registered',
        name: u.name,
        email: u.email,
        role: u.role,
        timestamp: u.createdAt
      }))
    };

    res.status(200).json({
      success: true,
      activity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};