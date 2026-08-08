import express, { type Express } from 'express'
import { healthRouter } from './routes/health.js';
import { propertiesRouter } from './routes/properties.js';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.js';

export function buildApp(): Express {
    const app = express();

    app.use(pinoHttp({ logger }))

    app.use(express.json());

    app.use('/api/health', healthRouter);
    app.use('/api/properties', propertiesRouter);
    app.use('/api/auth', authRouter);

    app.get('/', (_req, res) => {
        res.send('Hello Nestboard')
    });

    app.use(errorHandler);

    return app;
}
