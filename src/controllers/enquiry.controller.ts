import { Request, Response, NextFunction } from 'express';
import * as enquiryService from '../services/enquiry.service';
import { sendSuccess } from '../utils/response';

/**
 * Public: Submit a new enquiry / contact request
 */
export async function submitEnquiryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const enquiry = await enquiryService.submitEnquiry(req.body);
    sendSuccess(res, 201, 'Enquiry submitted successfully', { enquiry });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: List all enquiries with pagination, search, and sorting
 */
export async function getAdminEnquiriesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const search = req.query.search as string | undefined;
    const sortBy = req.query.sortBy as 'newest' | 'oldest' | undefined;

    const result = await enquiryService.getAdminEnquiries({
      page,
      limit,
      search,
      sortBy,
    });

    sendSuccess(res, 200, 'Enquiries retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Get enquiry details by ID
 */
export async function getEnquiryByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const enquiry = await enquiryService.getEnquiryById(id);
    sendSuccess(res, 200, 'Enquiry details retrieved successfully', { enquiry });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Delete an enquiry permanently by ID
 */
export async function deleteEnquiryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await enquiryService.deleteEnquiry(id);
    sendSuccess(res, 200, 'Enquiry deleted successfully', result);
  } catch (error) {
    next(error);
  }
}
