import { Request, Response, NextFunction } from 'express';

export interface NormalizationOptions {
  numberFields?: string[];
  jsonFields?: string[];
}

export function normalizeBody(options: NormalizationOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.body || typeof req.body !== 'object') {
      return next();
    }

    const { numberFields = [], jsonFields = [] } = options;

    for (const field of numberFields) {
      if (field in req.body && typeof req.body[field] === 'string') {
        const trimmed = req.body[field].trim();
        if (trimmed !== '' && !isNaN(Number(trimmed))) {
          req.body[field] = Number(trimmed);
        }
      }
    }

    for (const field of jsonFields) {
      if (field in req.body && typeof req.body[field] === 'string') {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch {
          // If JSON parsing fails, leave as original string so Zod schema flags invalid type
        }
      }
    }

    next();
  };
}
