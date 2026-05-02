import express from 'express';
import {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask
} from '../controllers/taskController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Route order matters - specific routes before parameter routes
router.route('/')
  .post(authorizeRoles('Admin'), createTask)
  .get(getTasks);

router.route('/:id')
  .get(getTaskById)
  .put(updateTask)
  .delete(authorizeRoles('Admin'), deleteTask);

export default router;