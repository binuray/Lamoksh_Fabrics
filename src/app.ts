import path from 'path';
import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';
import { apiLimiter } from './middleware/rateLimiter.middleware';
import { logger } from './utils/logger';
import { swaggerSpec } from './swagger';
import { prisma } from './config/database';
import { sendSuccess, sendError } from './utils/response';

const app: Application = express();

// Security HTTP headers
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Serve static uploads directory for local development
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Cross-Origin Resource Sharing
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
);

// Payload size limits to prevent DOS
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Structured HTTP logging (disabled terminal request logging for Postman/API calls)
// app.use(pinoHttp({ logger }));

// Rate limiting
app.use('/api/', apiLimiter);

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health Endpoints
app.get('/health', (req: Request, res: Response) => {
  sendSuccess(res, 200, 'Server is healthy', { status: 'ok', timestamp: new Date() });
});

app.get('/health/db', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    sendSuccess(res, 200, 'Database connection is healthy', { database: 'lamkosh', status: 'connected' });
  } catch (error: any) {
    sendError(res, 500, 'Database connection failure', [error.message]);
  }
});

// API Routes
app.use('/api/v1', routes);

// 404 Handler
app.use((req: Request, res: Response) => {
  sendError(res, 404, `Route ${req.method} ${req.originalUrl} not found`);
});

// Centralized Error Handler
app.use(errorHandler);

export default app;
