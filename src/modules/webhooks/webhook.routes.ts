import { Router } from 'express';
import { webhookController } from './webhook.controller';

const router = Router();

router.post('/dispatch', webhookController.dispatch);
router.get('/:jobId', webhookController.getStatus);
router.get('/:jobId/attempts', webhookController.getAttempts);

export const webhookRoutes = router;

