import { Request, Response, NextFunction } from 'express';
import * as productService from '../services/product.service';
import { sendSuccess } from '../utils/response';

export async function createProductHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const imageFiles = files?.images || [];
    const videoFiles = files?.videos || [];

    const product = await productService.createProduct(req.body, imageFiles, videoFiles);
    sendSuccess(res, 201, 'Product created successfully', { product });
  } catch (error) {
    next(error);
  }
}

export async function getAdminProductsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const search = req.query.search as string;
    const categoryId = req.query.categoryId as string;
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    const result = await productService.getAdminProducts(
      page,
      limit,
      search,
      categoryId,
      minPrice,
      maxPrice,
      sortBy,
      sortOrder
    );

    sendSuccess(res, 200, 'Products retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function getProductByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const product = await productService.getProductById(id);
    sendSuccess(res, 200, 'Product details retrieved successfully', { product });
  } catch (error) {
    next(error);
  }
}

export async function updateProductHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const imageFiles = files?.images || [];
    const videoFiles = files?.videos || [];

    const product = await productService.updateProduct(id, req.body, imageFiles, videoFiles);
    sendSuccess(res, 200, 'Product updated successfully', { product });
  } catch (error) {
    next(error);
  }
}

export async function deleteProductHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await productService.deleteProduct(id);
    sendSuccess(res, 200, 'Product deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function getPublicProductsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const search = req.query.search as string;
    const categoryId = req.query.categoryId as string;
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    const result = await productService.getPublicProducts(
      page,
      limit,
      search,
      categoryId,
      minPrice,
      maxPrice,
      sortBy,
      sortOrder
    );

    sendSuccess(res, 200, 'Products retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function getPublicProductByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const product = await productService.getPublicProductById(id);
    sendSuccess(res, 200, 'Product details retrieved successfully', { product });
  } catch (error) {
    next(error);
  }
}
