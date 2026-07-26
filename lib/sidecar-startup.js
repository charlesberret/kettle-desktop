'use strict';

/**
 * Decide whether desktop owns a new sidecar or attaches to the canonical core.
 * Dependencies are injected so the port policy is unit-testable without binding
 * or probing the live 4242 process.
 */
async function planSidecarStartup(options) {
  const {
    defaultPort,
    isPortFree,
    pingCompatibleCore,
    findFreePort,
  } = options;

  if (await isPortFree(defaultPort)) {
    return {
      mode: 'spawn',
      port: defaultPort,
      reason: 'default-port-free',
    };
  }

  try {
    const identity = await pingCompatibleCore(defaultPort);
    return {
      mode: 'attach',
      port: defaultPort,
      identity,
      reason: 'compatible-core-already-running',
    };
  } catch (err) {
    return {
      mode: 'spawn',
      port: await findFreePort(),
      reason: 'default-port-incompatible',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

module.exports = { planSidecarStartup };
