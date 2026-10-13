import { Router } from 'express';
import {
  submitEnquiryHandler,
  getAdminEnquiriesHandler,
  getEnquiryByIdHandler,
  deleteEnquiryHandler,
} from '../controllers/enquiry.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { submitEnquirySchema } from '../validators/enquiry.validator';

/**
 * Public Enquiry / Contact Routes (No Auth Required)
 */
export const publicEnquiryRouter = Router();

/**
 * @openapi
 * /enquiries:
 *   post:
 *     summary: Submit a contact / enquiry request
 *     tags:
 *       - Contact & Enquiries
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               mobileNumber:
 *                 type: string
 *                 example: "+919876543210"
 *               message:
 *                 type: string
 *                 example: "I would like to inquire about fabric bulk orders."
 *     responses:
 *       201:
 *         description: Enquiry submitted successfully
 *       422:
 *         description: Validation error
 */
publicEnquiryRouter.post('/', validateRequest(submitEnquirySchema), submitEnquiryHandler);

/**
 * Admin Enquiry Management Routes (Protected by Auth & RBAC)
 */
export const adminEnquiryRouter = Router();

adminEnquiryRouter.use(authenticate);
adminEnquiryRouter.use(authorizeRoles('SUPER_ADMIN', 'ADMIN'));

/**
 * @openapi
 * /admin/enquiries:
 *   get:
 *     summary: List all enquiries with pagination and search (Admin only)
 *     tags:
 *       - Contact & Enquiries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, oldest]
 *     responses:
 *       200:
 *         description: Enquiries retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
adminEnquiryRouter.get('/', getAdminEnquiriesHandler);

/**
 * @openapi
 * /admin/enquiries/{id}:
 *   get:
 *     summary: Get single enquiry details (Admin only)
 *     tags:
 *       - Contact & Enquiries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Enquiry details retrieved successfully
 *       404:
 *         description: Enquiry not found
 */
adminEnquiryRouter.get('/:id', getEnquiryByIdHandler);

/**
 * @openapi
 * /admin/enquiries/{id}:
 *   delete:
 *     summary: Delete enquiry permanently (Admin only)
 *     tags:
 *       - Contact & Enquiries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Enquiry deleted successfully
 *       404:
 *         description: Enquiry not found
 */
adminEnquiryRouter.delete('/:id', deleteEnquiryHandler);
