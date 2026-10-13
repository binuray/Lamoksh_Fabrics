import { Request, Response, NextFunction } from 'express';
import * as categoryService from '../services/category.service';
import { sendSuccess } from '../utils/response';

export async function createCategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const category = await categoryService.createCategory(req.body.name);
    sendSuccess(res, 201, 'Category created successfully', { category });
  } catch (error) {
    next(error);
  }
}

export async function getAdminCategoriesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const search = req.query.search as string;

    const result = await categoryService.getAdminCategories(page, limit, search);
    sendSuccess(res, 200, 'Categories retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function getCategoryByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const category = await categoryService.getCategoryById(id);
    sendSuccess(res, 200, 'Category details retrieved successfully', { category });
  } catch (error) {
    next(error);
  }
}

export async function updateCategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const category = await categoryService.updateCategory(id, req.body.name);
    sendSuccess(res, 200, 'Category updated successfully', { category });
  } catch (error) {
    next(error);
  }
}

export async function deleteCategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await categoryService.deleteCategory(id);
    sendSuccess(res, 200, 'Category deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function getPublicCategoriesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const search = req.query.search as string;

    const result = await categoryService.getPublicCategories(page, limit, search);
    sendSuccess(res, 200, 'Categories retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function getPublicCategoryByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const category = await categoryService.getPublicCategoryById(id);
    sendSuccess(res, 200, 'Category details retrieved successfully', { category });
  } catch (error) {
    next(error);
  }
}
