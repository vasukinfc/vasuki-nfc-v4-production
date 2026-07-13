'use strict';

/**
 * Backward-compatible health endpoint. Existing keys remain at the top level.
 */
function createHealthHandler({
  applicationName,
  config,
  environmentReport,
  getDatabaseConnected,
  getRazorpayMode,
}) {
  return function health(request, response) {
    const databaseConnected = Boolean(getDatabaseConnected());
    const databaseConfigured = config.databaseConfigured;
    const ready =
      environmentReport.ready &&
      (!databaseConfigured || databaseConnected);
    response.set('Cache-Control', 'no-store');
    return response.json({
      ok: true,
      store: applicationName,
      db: databaseConnected,
      razorpayMode: getRazorpayMode(),
      time: new Date().toISOString(),
      ready,
      status: ready ? 'ready' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      environment: config.nodeEnvironment,
      features: config.featureFlags,
      checks: {
        environment: environmentReport.ready,
        databaseConfigured,
        databaseConnected,
      },
      environmentIssues: environmentReport.issues.map((item) => ({
        severity: item.severity,
        code: item.code,
      })),
      requestId: response.locals.requestId,
    });
  };
}

module.exports = {
  createHealthHandler,
};
