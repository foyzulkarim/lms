import { EventEmitter } from 'eventemitter3';
import { config } from '../config';
import { logger } from '../utils/logger';
import { CircuitBreakerState } from '../types';

export class CircuitBreaker extends EventEmitter {
  private states: Map<string, CircuitBreakerState>;
  private threshold: number;
  private timeout: number;
  private resetTimeout: number;

  constructor() {
    super();
    this.states = new Map();
    this.threshold = config.fallback.circuitBreakerThreshold;
    this.timeout = config.fallback.circuitBreakerTimeout;
    this.resetTimeout = config.fallback.circuitBreakerResetTimeout;
  }

  async execute<T>(
    key: string,
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const state = this.getState(key);

    // Check if circuit is open
    if (state.state === 'open') {
      if (Date.now() < (state.nextAttemptTime?.getTime() || 0)) {
        logger.debug('Circuit breaker is open, using fallback', {
          key,
          workerId: config.worker.id,
          state: state.state,
          failureCount: state.failureCount,
        });

        if (fallback) {
          return await fallback();
        } else {
          throw new Error(`Circuit breaker is open for ${key}`);
        }
      } else {
        // Try to transition to half-open
        this.transitionToHalfOpen(key);
      }
    }

    try {
      const result = await operation();
      this.onSuccess(key);
      return result;
    } catch (error) {
      this.onFailure(key);
      
      // If circuit is now open and we have a fallback, use it
      const currentState = this.getState(key);
      if (currentState.state === 'open' && fallback) {
        logger.info('Circuit breaker opened, using fallback', {
          key,
          workerId: config.worker.id,
          failureCount: currentState.failureCount,
        });
        return await fallback();
      }
      
      throw error;
    }
  }

  private getState(key: string): CircuitBreakerState {
    if (!this.states.has(key)) {
      this.states.set(key, {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
      });
    }
    return this.states.get(key)!;
  }

  private onSuccess(key: string): void {
    const state = this.getState(key);
    state.successCount++;

    if (state.state === 'half-open') {
      // If we're in half-open state and got a success, close the circuit
      this.transitionToClosed(key);
    } else if (state.state === 'closed') {
      // Reset failure count on success
      state.failureCount = 0;
    }

    logger.debug('Circuit breaker success', {
      key,
      workerId: config.worker.id,
      state: state.state,
      successCount: state.successCount,
      failureCount: state.failureCount,
    });
  }

  private onFailure(key: string): void {
    const state = this.getState(key);
    state.failureCount++;
    state.lastFailureTime = new Date();

    if (state.state === 'half-open') {
      // If we're in half-open state and got a failure, open the circuit
      this.transitionToOpen(key);
    } else if (state.state === 'closed' && state.failureCount >= this.threshold) {
      // If we've exceeded the threshold, open the circuit
      this.transitionToOpen(key);
    }

    logger.debug('Circuit breaker failure', {
      key,
      workerId: config.worker.id,
      state: state.state,
      failureCount: state.failureCount,
      threshold: this.threshold,
    });
  }

  private transitionToClosed(key: string): void {
    const state = this.getState(key);
    const previousState = state.state;
    
    state.state = 'closed';
    state.failureCount = 0;
    state.successCount = 0;
    state.lastFailureTime = undefined;
    state.nextAttemptTime = undefined;

    if (previousState !== 'closed') {
      logger.info('Circuit breaker closed', {
        key,
        workerId: config.worker.id,
        previousState,
      });
      this.emit('stateChanged', { key, state: 'closed', previousState });
    }
  }

  private transitionToOpen(key: string): void {
    const state = this.getState(key);
    const previousState = state.state;
    
    state.state = 'open';
    state.nextAttemptTime = new Date(Date.now() + this.resetTimeout);

    if (previousState !== 'open') {
      logger.warn('Circuit breaker opened', {
        key,
        workerId: config.worker.id,
        failureCount: state.failureCount,
        nextAttemptTime: state.nextAttemptTime,
      });
      this.emit('stateChanged', { key, state: 'open', previousState });
    }
  }

  private transitionToHalfOpen(key: string): void {
    const state = this.getState(key);
    const previousState = state.state;
    
    state.state = 'half-open';
    state.successCount = 0;

    logger.info('Circuit breaker half-open', {
      key,
      workerId: config.worker.id,
      previousState,
    });
    this.emit('stateChanged', { key, state: 'half-open', previousState });
  }

  getCircuitState(key: string): CircuitBreakerState {
    return { ...this.getState(key) };
  }

  getAllStates(): Map<string, CircuitBreakerState> {
    const result = new Map();
    for (const [key, state] of this.states) {
      result.set(key, { ...state });
    }
    return result;
  }

  reset(key: string): void {
    logger.info('Resetting circuit breaker', {
      key,
      workerId: config.worker.id,
    });
    
    this.transitionToClosed(key);
    this.emit('reset', { key });
  }

  resetAll(): void {
    logger.info('Resetting all circuit breakers', {
      workerId: config.worker.id,
      count: this.states.size,
    });

    for (const key of this.states.keys()) {
      this.transitionToClosed(key);
    }
    
    this.emit('resetAll');
  }

  isOpen(key: string): boolean {
    const state = this.getState(key);
    return state.state === 'open' && 
           Date.now() < (state.nextAttemptTime?.getTime() || 0);
  }

  isHalfOpen(key: string): boolean {
    return this.getState(key).state === 'half-open';
  }

  isClosed(key: string): boolean {
    return this.getState(key).state === 'closed';
  }

  getFailureCount(key: string): number {
    return this.getState(key).failureCount;
  }

  getSuccessCount(key: string): number {
    return this.getState(key).successCount;
  }

  // Health monitoring
  getHealthStatus(): {
    totalCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    closedCircuits: number;
    circuits: Array<{
      key: string;
      state: string;
      failureCount: number;
      successCount: number;
      lastFailureTime?: Date;
      nextAttemptTime?: Date;
    }>;
  } {
    const circuits = Array.from(this.states.entries()).map(([key, state]) => ({
      key,
      state: state.state,
      failureCount: state.failureCount,
      successCount: state.successCount,
      lastFailureTime: state.lastFailureTime,
      nextAttemptTime: state.nextAttemptTime,
    }));

    return {
      totalCircuits: this.states.size,
      openCircuits: circuits.filter(c => c.state === 'open').length,
      halfOpenCircuits: circuits.filter(c => c.state === 'half-open').length,
      closedCircuits: circuits.filter(c => c.state === 'closed').length,
      circuits,
    };
  }

  // Configuration methods
  setThreshold(threshold: number): void {
    this.threshold = threshold;
    logger.info('Circuit breaker threshold updated', {
      threshold,
      workerId: config.worker.id,
    });
  }

  setTimeout(timeout: number): void {
    this.timeout = timeout;
    logger.info('Circuit breaker timeout updated', {
      timeout,
      workerId: config.worker.id,
    });
  }

  setResetTimeout(resetTimeout: number): void {
    this.resetTimeout = resetTimeout;
    logger.info('Circuit breaker reset timeout updated', {
      resetTimeout,
      workerId: config.worker.id,
    });
  }
}
