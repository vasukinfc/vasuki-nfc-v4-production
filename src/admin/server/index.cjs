'use strict';

const express = require('express');
const path = require('path');
const { getAdminCrmConfig } = require('./config.cjs');
const { createAuthRouter } = require('./routes/auth-routes.cjs');
const {
  createAuthenticateAdmin,
} = require('./middleware/authenticate-admin.cjs');
const {
  authorizeRoles,
} = require('./middleware/authorize-role.cjs');
const {
  createAdminAuthRepository,
} = require('./repositories/admin-auth-repository.cjs');
const {
  createAdminAuthService,
} = require('./services/admin-auth-service.cjs');
const {
  createAdminCrmRepository,
} = require('./repositories/admin-crm-repository.cjs');
const {
  createAdminCustomerService,
} = require('./services/admin-customer-service.cjs');
const {
  createAdminOrderService,
} = require('./services/admin-order-service.cjs');
const {
  createAdminCustomerRouter,
} = require('./routes/customer-routes.cjs');
const {
  createAdminOrderRouter,
} = require('./routes/order-routes.cjs');
const passwordSecurity = require('./security/admin-password.cjs');
const sessionSecurity = require('./security/admin-session.cjs');
const {
  createSubscriptionFoundation,
} = require('../../subscription/server/index.cjs');
const {
  mountAdminSubscriptionManager,
} = require('../../subscription/server/admin/index.cjs');
const {
  mountAdminNotificationModule,
} = require('../../notifications/server/admin/index.cjs');
const {
  mountAdminAnalyticsModule,
} = require('../../analytics/server/admin/index.cjs');

/**
 * Mounts the Phase 1A Admin CRM shell when explicitly enabled.
 *
 * @param {import('express').Express} app
 * @param {{
 *   environment?: NodeJS.ProcessEnv | Record<string, unknown>,
 *   getDatabase?: () => unknown | Promise<unknown>,
 *   usersFile?: string,
 *   ordersFile?: string,
 *   subscriptionDataFile?: string,
 *   listSubscriptionCustomers?: () => object[] | Promise<object[]>,
 *   notificationFoundation?: object,
 *   analyticsFoundation?: object
 * }} [options]
 * @returns {boolean} Whether the admin module was mounted.
 */
function mountAdminCrm(app, options = {}) {
  const environment = options.environment || process.env;
  const config = getAdminCrmConfig(environment);
  if (!config.enabled) return false;

  const clientDirectory = path.resolve(__dirname, '..', 'client');
  const shellFile = path.join(clientDirectory, 'index.html');
  const loginFile = path.join(clientDirectory, 'login.html');
  const customersFile = path.join(clientDirectory, 'customers.html');
  const ordersFile = path.join(clientDirectory, 'orders.html');
  const getDatabase =
    typeof options.getDatabase === 'function'
      ? options.getDatabase
      : () => null;
  const repository = createAdminAuthRepository({ getDatabase });
  const authService = createAdminAuthService({
    repository,
    passwordSecurity,
    sessionSecurity,
    config,
  });
  const crmRepository = createAdminCrmRepository({
    getDatabase,
    usersFile: options.usersFile,
    ordersFile: options.ordersFile,
  });
  const adminCustomerService = createAdminCustomerService({
    repository: crmRepository,
  });
  const adminOrderService = createAdminOrderService({
    repository: crmRepository,
  });
  const authenticateApi = createAuthenticateAdmin({
    authService,
    sessionSecurity,
    config,
  });
  const authenticatePage = createAuthenticateAdmin({
    authService,
    sessionSecurity,
    config,
    redirectToLogin: true,
  });
  const authorizeAdmin = authorizeRoles('super_admin', 'admin');

  app.use(
    '/admin/assets',
    express.static(clientDirectory, {
      dotfiles: 'deny',
      index: false,
      fallthrough: true,
    }),
  );

  const sendAdminShell = (request, response) => {
    response.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    response.sendFile(shellFile);
  };

  app.get('/admin/login', (request, response) => {
    response.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    response.sendFile(loginFile);
  });

  app.use(
    '/api/admin/v1/auth',
    createAuthRouter({
      authService,
      authenticateAdmin: authenticateApi,
      authorizeAdmin,
      sessionSecurity,
      config,
    }),
  );
  app.use(
    '/api/admin/v1/customers',
    createAdminCustomerRouter({
      authenticateAdmin: authenticateApi,
      authorizeAdmin,
      adminCustomerService,
    }),
  );
  app.use(
    '/api/admin/v1/orders',
    createAdminOrderRouter({
      authenticateAdmin: authenticateApi,
      authorizeAdmin,
      adminOrderService,
    }),
  );

  const subscriptionFoundation = createSubscriptionFoundation({
    environment,
    getDatabase,
    dataFile: options.subscriptionDataFile,
  });
  mountAdminSubscriptionManager(app, {
    foundation: subscriptionFoundation,
    authenticateAdmin: authenticateApi,
    authenticateAdminPage: authenticatePage,
    authorizeAdmin,
    listCustomers:
      typeof options.listSubscriptionCustomers === 'function'
        ? options.listSubscriptionCustomers
        : async () => [],
  });
  mountAdminNotificationModule(app, {
    foundation: options.notificationFoundation,
    authenticateAdmin: authenticateApi,
    authenticateAdminPage: authenticatePage,
    authorizeAdmin,
  });
  mountAdminAnalyticsModule(app, {
    foundation: options.analyticsFoundation,
    authenticateAdmin: authenticateApi,
    authenticateAdminPage: authenticatePage,
    authorizeAdmin,
  });

  app.get(
    ['/admin', '/admin/'],
    authenticatePage,
    authorizeAdmin,
    sendAdminShell,
  );
  app.get(
    ['/admin/customers', '/admin/customers/'],
    authenticatePage,
    authorizeAdmin,
    (request, response) => {
      response.set({
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      });
      response.sendFile(customersFile);
    },
  );
  app.get(
    ['/admin/orders', '/admin/orders/'],
    authenticatePage,
    authorizeAdmin,
    (request, response) => {
      response.set({
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      });
      response.sendFile(ordersFile);
    },
  );
  return true;
}

module.exports = {
  mountAdminCrm,
};
