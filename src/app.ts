import path from 'path';
import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { swaggerSpec } from './swagger';
import { env } from './config/env';
import { prisma } from './config/database';
import { sendSuccess, sendError } from './utils/response';

const app: Application = express();

// Security HTTP headers
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Serve static uploads directory for local development
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Cross-Origin Resource Sharing
const allowedOrigins = [
  'http://localhost:5173',
  'https://www.lamokshfabric.com',
  'https://lamokshfabric.com',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

if (env.CLIENT_URL) {
  env.CLIENT_URL.split(',').forEach((url) => {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
}

if (env.ALLOWED_ORIGINS) {
  env.ALLOWED_ORIGINS.split(',').forEach((url) => {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/+$/, '').toLowerCase();
      const isAllowed = allowedOrigins.some(
        (allowed) => allowed.replace(/\/+$/, '').toLowerCase() === normalizedOrigin
      );

      if (isAllowed) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    optionsSuccessStatus: 200,
  })
);

// Payload size limits (supports rich blog content and articles)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Structured HTTP logging (disabled terminal request logging for Postman/API calls)
// app.use(pinoHttp({ logger }));

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
