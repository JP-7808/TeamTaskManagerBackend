import Task from '../models/Task.js';
import Project from '../models/Project.js';
import User from '../models/User.js';

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private/Admin
export const createTask = async (req, res, next) => {
  try {
    const { title, description, dueDate, priority, assignedTo, projectId } = req.body;

    // Validate required fields
    if (!title || !description || !dueDate || !assignedTo || !projectId) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ 
        success: false,
        message: 'Project not found' 
      });
    }

    // Check if user is admin of project
    if (project.admin.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Only project admin can create tasks' 
      });
    }

    // Check if assigned user is a member of the project
    if (!project.members.includes(assignedTo)) {
      return res.status(400).json({ 
        success: false,
        message: 'Assigned user must be a project member' 
      });
    }

    // Create task
    const task = await Task.create({
      title,
      description,
      dueDate: new Date(dueDate),
      priority: priority || 'Medium',
      assignedTo,
      project: projectId,
      createdBy: req.user.id
    });

    // Add task to project
    project.tasks.push(task._id);
    await project.save();

    // Populate the task with related data
    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('project', 'name')
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      task: populatedTask
    });
  } catch (error) {
    console.error('Create task error:', error);
    next(error);
  }
};

// @desc    Get all tasks for a user
// @route   GET /api/tasks
// @access  Private
export const getTasks = async (req, res, next) => {
  try {
    let tasks;
    
    if (req.user.role === 'Admin') {
      // Admin can see all tasks from projects they admin
      const projects = await Project.find({ admin: req.user.id });
      const projectIds = projects.map(p => p._id);
      tasks = await Task.find({ 
        project: { $in: projectIds }
      }).populate('assignedTo', 'name email')
        .populate('project', 'name')
        .populate('createdBy', 'name');
    } else {
      // Members can only see tasks assigned to them
      tasks = await Task.find({ assignedTo: req.user.id })
        .populate('assignedTo', 'name email')
        .populate('project', 'name')
        .populate('createdBy', 'name');
    }

    res.status(200).json({
      success: true,
      tasks
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    next(error);
  }
};

// @desc    Get single task by ID
// @route   GET /api/tasks/:id
// @access  Private
export const getTaskById = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('project', 'name')
      .populate('createdBy', 'name');

    if (!task) {
      return res.status(404).json({ 
        success: false,
        message: 'Task not found' 
      });
    }

    // Check access
    const project = await Project.findById(task.project);
    if (!project) {
      return res.status(404).json({ 
        success: false,
        message: 'Project not found' 
      });
    }
    
    const isAdmin = project.admin.toString() === req.user.id;
    const isAssigned = task.assignedTo._id.toString() === req.user.id;

    if (!isAdmin && !isAssigned) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied' 
      });
    }

    res.status(200).json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Get task by ID error:', error);
    next(error);
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
// @access  Private
export const updateTask = async (req, res, next) => {
  try {
    const { title, description, dueDate, priority, status, assignedTo } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ 
        success: false,
        message: 'Task not found' 
      });
    }

    // Check access
    const project = await Project.findById(task.project);
    if (!project) {
      return res.status(404).json({ 
        success: false,
        message: 'Project not found' 
      });
    }
    
    const isAdmin = project.admin.toString() === req.user.id;
    const isAssigned = task.assignedTo.toString() === req.user.id;

    if (!isAdmin && !isAssigned) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied' 
      });
    }

    // Members can only update status
    if (!isAdmin && isAssigned) {
      if (status) {
        task.status = status;
      } else {
        return res.status(403).json({ 
          success: false,
          message: 'Members can only update task status' 
        });
      }
    } else {
      // Admin can update everything
      if (title) task.title = title;
      if (description) task.description = description;
      if (dueDate) task.dueDate = new Date(dueDate);
      if (priority) task.priority = priority;
      if (status) task.status = status;
      if (assignedTo) {
        // Check if new assignee is project member
        if (!project.members.includes(assignedTo)) {
          return res.status(400).json({ 
            success: false,
            message: 'Assigned user must be a project member' 
          });
        }
        task.assignedTo = assignedTo;
      }
    }

    task.updatedAt = Date.now();
    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('project', 'name')
      .populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      task: updatedTask
    });
  } catch (error) {
    console.error('Update task error:', error);
    next(error);
  }
};

// @desc    Delete task (project admin only)
// @route   DELETE /api/tasks/:id
// @access  Private/Admin
export const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ 
        success: false,
        message: 'Task not found' 
      });
    }

    // Check if user is project admin
    const project = await Project.findById(task.project);
    if (!project) {
      return res.status(404).json({ 
        success: false,
        message: 'Project not found' 
      });
    }
    
    if (project.admin.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Only project admin can delete tasks' 
      });
    }

    // Remove task from project
    project.tasks = project.tasks.filter(t => t.toString() !== task._id.toString());
    await project.save();

    await task.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Delete task error:', error);
    next(error);
  }
};

// @desc    Delete any task (super admin override)
// @route   DELETE /api/admin/tasks/:id
// @access  Private/Admin
export const deleteAnyTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ 
        success: false,
        message: 'Task not found' 
      });
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
    console.error('Delete any task error:', error);
    next(error);
  }
};

// @desc    Bulk delete tasks
// @route   POST /api/admin/tasks/bulk-delete
// @access  Private/Admin
export const bulkDeleteTasks = async (req, res, next) => {
  try {
    const { taskIds } = req.body;
    
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide an array of task IDs' 
      });
    }

    // Get all tasks
    const tasks = await Task.find({ _id: { $in: taskIds } });
    
    if (tasks.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'No tasks found' 
      });
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
    console.error('Bulk delete error:', error);
    next(error);
  }
};

// @desc    Get all tasks for admin (with filters)
// @route   GET /api/admin/tasks
// @access  Private/Admin
export const getAllTasksForAdmin = async (req, res, next) => {
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
    console.error('Get all tasks for admin error:', error);
    next(error);
  }
};