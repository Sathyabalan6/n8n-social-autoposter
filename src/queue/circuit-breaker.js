/**
 * Enterprise Circuit Breaker for External Social Media APIs
 * Prevents cascade failures and preserves rate limits when external APIs degrade.
 */

const logger = require('../logger');

const CIRCUIT_STATES = {
  CLOSED: 'CLOSED', // Normal operation
  OPEN: 'OPEN',     // Tripped: fail fast without making API call
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

class PlatformCircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 3;
    this.resetTimeoutMs = options.resetTimeoutMs || 60000; // 1 minute
    this.circuits = new Map();
  }

  getCircuit(platform) {
    const key = String(platform).toLowerCase();
    if (!this.circuits.has(key)) {
      this.circuits.set(key, {
        state: CIRCUIT_STATES.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        consecutiveSuccesses: 0
      });
    }
    return this.circuits.get(key);
  }

  isOpen(platform) {
    const circuit = this.getCircuit(platform);
    const now = Date.now();

    if (circuit.state === CIRCUIT_STATES.OPEN) {
      if (now - circuit.lastFailureTime > this.resetTimeoutMs) {
        logger.info({ platform }, 'Circuit breaker transitioning to HALF_OPEN to test API health');
        circuit.state = CIRCUIT_STATES.HALF_OPEN;
        return false;
      }
      return true;
    }

    return false;
  }

  recordSuccess(platform) {
    const circuit = this.getCircuit(platform);
    if (circuit.state === CIRCUIT_STATES.HALF_OPEN) {
      circuit.consecutiveSuccesses += 1;
      if (circuit.consecutiveSuccesses >= 2) {
        logger.info({ platform }, 'Circuit breaker reset to CLOSED after successful recovery probes');
        circuit.state = CIRCUIT_STATES.CLOSED;
        circuit.failureCount = 0;
        circuit.consecutiveSuccesses = 0;
      }
    } else {
      circuit.failureCount = 0;
    }
  }

  recordFailure(platform, error) {
    const circuit = this.getCircuit(platform);
    circuit.failureCount += 1;
    circuit.lastFailureTime = Date.now();
    circuit.consecutiveSuccesses = 0;

    const isRateLimit = error && (error.status === 429 || String(error.message).includes('429'));

    if (circuit.failureCount >= this.failureThreshold || isRateLimit) {
      circuit.state = CIRCUIT_STATES.OPEN;
      logger.warn(
        { platform, failures: circuit.failureCount, resetTimeoutMs: this.resetTimeoutMs },
        'Circuit breaker TRIPPED to OPEN. Backing off calls to this platform.'
      );
    }
  }

  getStatus() {
    const status = {};
    for (const [platform, circuit] of this.circuits.entries()) {
      status[platform] = {
        state: circuit.state,
        failures: circuit.failureCount,
        lastFailure: circuit.lastFailureTime ? new Date(circuit.lastFailureTime).toISOString() : null
      };
    }
    return status;
  }
}

const circuitBreaker = new PlatformCircuitBreaker();

module.exports = {
  circuitBreaker,
  CIRCUIT_STATES
};
