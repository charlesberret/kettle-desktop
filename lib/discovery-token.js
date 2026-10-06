'use strict';

/**
 * Token to send when probing a core port.
 * The discovery file holds one core's token. Sending it to a different port
 * makes that core answer 403, which is not evidence the port is a foreign service.
 */
function tokenForProbe(discovery, port) {
  if (!discovery || Number(discovery.port) !== Number(port)) return null;
  if (typeof discovery.token !== 'string' || !discovery.token) return null;
  return discovery.token;
}

module.exports = { tokenForProbe };
