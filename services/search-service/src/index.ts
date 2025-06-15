#!/usr/bin/env node

import { startServer, setupGracefulShutdown } from '@/app';
import { searchLogger } from '@/utils/logger';

async function main() {
  try {
    // Start the server
    const app = await startServer();
    
    // Setup graceful shutdown handlers
    setupGracefulShutdown(app);
    
    searchLogger.info('Search Service is ready to accept requests');
  } catch (error) {
    searchLogger.error('Failed to start application', error as Error);
    process.exit(1);
  }
}

// Start the application
main();
