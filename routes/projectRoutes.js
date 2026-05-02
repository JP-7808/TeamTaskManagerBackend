import express from 'express';
import {
  createProject,
  getProjects,
  getProjectById,
  addMember,
  removeMember
} from '../controllers/projectController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect); // All routes require authentication

router.route('/')
  .post(authorizeRoles('Admin'), createProject)
  .get(getProjects);

router.route('/:id')
  .get(getProjectById);

router.route('/:id/members')
  .post(authorizeRoles('Admin'), addMember);

router.route('/:id/members/:userId')
  .delete(authorizeRoles('Admin'), removeMember);

export default router;