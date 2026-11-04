import { Router } from 'express';
import { healthCheckHandler } from './health.controller';

const router = Router();

router.get('/', healthCheckHandler);

export const healthRoutes = router;

