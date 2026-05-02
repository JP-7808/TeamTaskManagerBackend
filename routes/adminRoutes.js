import express from 'express';
import {
  // User management
  getAllUsers,
  getUserById,
  updateUserRole,
  deleteUser,
  // Project management
  getAllProjects,
  deleteAnyProject,
  transferProjectOwnership,
  // Task management
  getAllTasks,
  deleteAnyTask,
  bulkDeleteTasks,
  // Dashboard & analytics
  getAdminDashboardStats,
  getSystemActivity
} from '../controllers/adminController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = express.Router();

// All admin routes require authentication and Admin role
router.use(protect);
router.use(authorizeRoles('Admin'));

// ==================== DASHBOARD ROUTES ====================
router.get('/dashboard/stats', getAdminDashboardStats);
router.get('/activity', getSystemActivity);

// ==================== USER MANAGEMENT ROUTES ====================
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);

// ==================== PROJECT MANAGEMENT ROUTES ====================
router.get('/projects', getAllProjects);
router.delete('/projects/:id', deleteAnyProject);
router.put('/projects/:id/transfer', transferProjectOwnership);

// ==================== TASK MANAGEMENT ROUTES ====================
router.get('/tasks', getAllTasks);
router.delete('/tasks/:id', deleteAnyTask);
router.post('/tasks/bulk-delete', bulkDeleteTasks);

export default router;