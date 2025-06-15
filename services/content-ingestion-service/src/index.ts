#!/usr/bin/env node

import { startServer, setupGracefulShutdown } from '@/app';
import { contentLogger } from '@/utils/logger';

async function main() {
  try {
    // Start the server
    const app = await startServer();
    
    // Setup graceful shutdown handlers
    setupGracefulShutdown(app);
    
    contentLogger.info('Content Ingestion Service is ready to accept requests');
  } catch (error) {
    contentLogger.error('Failed to start application', error as Error);
    process.exit(1);
  }
}

// Start the application
main();
