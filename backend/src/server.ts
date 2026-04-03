import dotenv from 'dotenv';

// Charger les variables d'environnement EN PREMIER
dotenv.config();

// =====================================================
// 🛡️ GLOBAL ERROR HANDLERS — avant tout import lourd
// =====================================================
import logger from './lib/logger';

process.on('uncaughtException', (error: Error) => {
  logger.error('💥 uncaughtException — Crash non géré', {
    message: error.message,
    stack: error.stack,
    name: error.name,
  });
  // PM2 / process manager redémarrera automatiquement
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('💥 unhandledRejection — Promise non gérée', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // Ne pas tuer le process sur rejection — juste alerter
});

process.on('SIGTERM', () => {
  logger.info('⚠️ SIGTERM reçu — Arrêt gracieux du serveur...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('⚠️ SIGINT reçu (Ctrl+C) — Arrêt gracieux du serveur...');
  process.exit(0);
});

// =====================================================
// 🔍 SENTRY — Error tracking
// =====================================================
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      // Ne pas envoyer les erreurs 404 à Sentry
      if (event.exception?.values?.[0]?.value?.includes('Route non trouvée')) {
        return null;
      }
      return event;
    },
  });
  logger.info('✅ Sentry initialisé', { env: process.env.NODE_ENV });
} else {
  logger.warn('⚠️ SENTRY_DSN non configuré — Error tracking désactivé');
}

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import smsRoutes from './routes/sms.routes';
import documentsRoutes from './routes/documents.routes';
import emailRoutes from './routes/email.routes';
import authRoutes from './routes/auth.routes';
import sireneRoutes from './routes/sirene.routes';
import paymentsRoutes from './routes/payments.routes';
import webhooksRoutes from './routes/webhooks.routes';
import stripeExpressRoutes from './routes/stripe-express';
import stripeRoutes from './routes/stripe.routes';
import adminEmailMonitoringRoutes from './routes/admin-email-monitoring.routes';
import supportRoutes from './routes/support.routes';
import { startEmailWatcher } from './services/email-service';

const app: Express = express();
const port = process.env.PORT || 5000;

// Middleware CORS
app.use(cors());

// ⚠️ IMPORTANT : Webhooks Stripe AVANT express.json()
// Stripe nécessite le raw body pour vérifier la signature
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }), webhooksRoutes);

// Webhook Stripe Connect (raw body requis)
app.use('/api/v1/stripe/webhook', express.raw({ type: 'application/json' }));

// Middleware JSON (pour toutes les autres routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes de base
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'success', 
    message: 'Artisan Dispo API fonctionne correctement',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
    },
  });
});

// Routes SMS
app.use('/api/v1/sms', smsRoutes);

// Routes Documents
app.use('/api/v1/documents', documentsRoutes);

// Routes Emails
app.use('/api/v1/emails', emailRoutes);

// Routes Auth (gestion utilisateurs Firebase)
app.use('/api/v1/auth', authRoutes);

// Routes SIRENE (vérification SIRET)
app.use('/api/v1/sirene', sireneRoutes);

// Routes Paiements (Stripe escrow)
app.use('/api/v1/payments', paymentsRoutes);

// Routes Stripe Express (webhook inclut son propre raw body middleware)
app.use('/api/v1/stripe-express', stripeExpressRoutes);

// Routes Stripe Connect (onboarding artisans)
app.use('/api/v1/stripe', stripeRoutes);

// Routes Support Tickets
app.use('/api/v1/support', supportRoutes);

// Routes Admin - Monitoring Emails
app.use('/api/v1/admin', adminEmailMonitoringRoutes);

// Gestion des erreurs 404
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route non trouvée'
    }
  });
});

// =====================================================
// 🚨 MIDDLEWARE GLOBAL ERREURS — doit être DERNIER
// =====================================================
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Reporter à Sentry si configuré
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }

  logger.error('🚨 Erreur Express non gérée', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Une erreur interne s\'est produite. Notre équipe a été alertée.',
    }
  });
});

// Démarrer le serveur
const server = app.listen(port, async () => {
  logger.info(`🚀 Serveur démarré sur http://localhost:${port}`);
  logger.info(`📍 API disponible sur http://localhost:${port}/api/v1`);
  logger.info(`🔧 MODE BYPASS SIRENE: ${process.env.SIRENE_BYPASS_VERIFICATION === 'true' ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
  
  // Démarrer la surveillance des emails APRÈS l'initialisation complète
  if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    setTimeout(() => {
      startEmailWatcher().catch((err) => logger.error('Email watcher error', { error: err.message }));
      logger.info('✅ Service email configuré - Surveillance active (toutes les 5 minutes)');
    }, 2000);
  } else {
    logger.warn('⚠️ Configuration SMTP manquante - Envoi d\'emails désactivé');
  }
});

// Timeout serveur pour éviter les connexions zombies
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

export default app;
