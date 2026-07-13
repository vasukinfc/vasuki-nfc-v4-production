'use strict';

const {
  evaluateSubscription,
} = require('../domain/subscription-lifecycle.cjs');
const {
  subscriptionPlans,
} = require('../domain/subscription-plans.cjs');

function cleanCustomer(customer) {
  return Object.freeze({
    id: String(customer?.id || '').trim(),
    fullName: String(customer?.fullName || '').trim(),
    email: String(customer?.email || '').trim(),
    mobile: String(customer?.mobile || '').trim(),
  });
}

function requiredNote(value) {
  const note = String(value || '').trim();
  if (note.length < 5) {
    const error = new Error(
      'An audit note of at least 5 characters is required.',
    );
    error.status = 400;
    error.code = 'ADMIN_NOTE_REQUIRED';
    throw error;
  }
  return note.slice(0, 300);
}

function adminActor(admin) {
  const adminId = String(admin?.adminId || '').trim();
  if (!adminId) {
    const error = new Error('Administrator identity is required.');
    error.status = 401;
    error.code = 'ADMIN_IDENTITY_REQUIRED';
    throw error;
  }
  return Object.freeze({ type: 'admin', id: adminId });
}

function createAdminSubscriptionService({
  repository,
  subscriptionService,
  config,
  listCustomers = async () => [],
  clock = () => new Date(),
}) {
  function planList() {
    return subscriptionPlans({ freeTrialDays: config.freeTrialDays });
  }

  async function rows() {
    const [customers, subscriptions] = await Promise.all([
      listCustomers(),
      repository.listAllSubscriptions(),
    ]);
    const customerById = new Map(
      (Array.isArray(customers) ? customers : [])
        .map(cleanCustomer)
        .filter((customer) => customer.id)
        .map((customer) => [customer.id, customer]),
    );
    const subscriptionByOwner = new Map(
      subscriptions.map((subscription) => [
        subscription.ownerId,
        subscription,
      ]),
    );
    const ownerIds = new Set([
      ...customerById.keys(),
      ...subscriptionByOwner.keys(),
    ]);

    return [...ownerIds].map((ownerId) => {
      const subscription = subscriptionByOwner.get(ownerId) || null;
      return Object.freeze({
        customer:
          customerById.get(ownerId) ||
          Object.freeze({
            id: ownerId,
            fullName: 'Unknown customer',
            email: '',
            mobile: '',
          }),
        subscription,
        lifecycle: evaluateSubscription(
          subscription,
          clock(),
          config.reminderDays,
        ),
      });
    });
  }

  async function list({ search = '', plan = '', status = '' } = {}) {
    const query = String(search || '').trim().toLowerCase();
    const planFilter = String(plan || '').trim().toLowerCase();
    const statusFilter = String(status || '').trim().toLowerCase();
    const filtered = (await rows())
      .filter((row) => {
        if (
          query &&
          ![
            row.customer.id,
            row.customer.fullName,
            row.customer.email,
            row.customer.mobile,
          ].some((value) => String(value || '').toLowerCase().includes(query))
        ) {
          return false;
        }
        if (
          planFilter &&
          String(row.subscription?.planCode || 'none') !== planFilter
        ) {
          return false;
        }
        return (
          !statusFilter ||
          String(row.lifecycle.phase || 'none') === statusFilter
        );
      })
      .sort((left, right) =>
        String(left.customer.fullName || left.customer.id).localeCompare(
          String(right.customer.fullName || right.customer.id),
        ),
      );
    return Object.freeze({ plans: planList(), rows: filtered });
  }

  async function details(ownerId) {
    const normalizedOwnerId = String(ownerId || '').trim();
    const row = (await rows()).find(
      (candidate) => candidate.customer.id === normalizedOwnerId,
    );
    if (!row) {
      const error = new Error('Customer not found.');
      error.status = 404;
      error.code = 'CUSTOMER_NOT_FOUND';
      throw error;
    }
    const [history, invoices] = await Promise.all([
      subscriptionService.history(normalizedOwnerId, 200),
      subscriptionService.invoices(normalizedOwnerId, 200),
    ]);
    return Object.freeze({
      plans: planList(),
      ...row,
      history,
      invoices,
    });
  }

  async function action(ownerId, actionName, input, admin) {
    const note = requiredNote(input?.note);
    const actor = adminActor(admin);
    const common = { ownerId, actor, reason: note };
    if (actionName === 'activate') {
      await subscriptionService.activate({
        ...common,
        planCode: input?.planCode,
      });
    } else if (actionName === 'assign-plan') {
      await subscriptionService.assignPlan({
        ...common,
        planCode: input?.planCode,
      });
    } else if (actionName === 'renew') {
      await subscriptionService.renew({
        ...common,
        planCode: input?.planCode,
      });
    } else if (actionName === 'expire') {
      await subscriptionService.expire(common);
    } else if (actionName === 'suspend') {
      await subscriptionService.suspend(common);
    } else if (actionName === 'restore') {
      await subscriptionService.restore(common);
    } else {
      const error = new Error('Unsupported subscription action.');
      error.status = 404;
      error.code = 'ACTION_NOT_FOUND';
      throw error;
    }
    return details(ownerId);
  }

  return Object.freeze({
    action,
    details,
    list,
  });
}

module.exports = {
  createAdminSubscriptionService,
};
