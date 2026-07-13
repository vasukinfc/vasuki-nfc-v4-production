'use strict';

const {
  evaluateSubscription,
} = require('../../../subscription/server/domain/subscription-lifecycle.cjs');
const {
  planByCode,
} = require('../../../subscription/server/domain/subscription-plans.cjs');
const {
  normalizeNotification,
} = require('../schemas/notification-schema.cjs');

function requiredId(value, field) {
  const result = String(value || '').trim();
  if (!result) {
    const error = new Error(`${field} is required.`);
    error.status = 400;
    error.code = 'IDENTIFIER_REQUIRED';
    throw error;
  }
  return result;
}

function utcDateKey(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : '';
}

function sameUtcDay(left, right) {
  return utcDateKey(left) && utcDateKey(left) === utcDateKey(right);
}

function createNotificationService({
  repository,
  subscriptionRepository,
  notificationConfig,
  subscriptionConfig,
  clock = () => new Date(),
}) {
  const planOptions = {
    freeTrialDays: subscriptionConfig.freeTrialDays,
  };

  function planName(code) {
    return planByCode(code, planOptions)?.name || 'subscription';
  }

  async function create(input) {
    if (!notificationConfig.enabled) return null;
    return repository.createIfMissing(
      normalizeNotification({
        ...input,
        createdAt: input.createdAt || clock(),
      }),
    );
  }

  async function customerNotification({
    ownerId,
    type,
    severity,
    title,
    message,
    entityId,
    dedupeKey,
    createdAt,
  }) {
    return create({
      audience: 'customer',
      recipientId: ownerId,
      type,
      severity,
      title,
      message,
      entityType: 'subscription',
      entityId,
      dedupeKey,
      reads: [],
      createdAt,
    });
  }

  async function adminNotification({
    type,
    severity,
    title,
    message,
    entityType,
    entityId,
    dedupeKey,
    createdAt,
  }) {
    return create({
      audience: 'admin',
      recipientId: 'admin',
      type,
      severity,
      title,
      message,
      entityType,
      entityId,
      dedupeKey,
      reads: [],
      createdAt,
    });
  }

  async function syncCustomerHistory(ownerId, history) {
    for (const event of history) {
      const common = {
        ownerId,
        entityId: event.subscriptionId,
        createdAt: event.occurredAt,
      };
      if (
        event.eventType === 'activated' ||
        event.eventType === 'plan_assigned'
      ) {
        await customerNotification({
          ...common,
          type: 'subscription_activated',
          severity: 'success',
          title: 'Subscription activated',
          message: `Your ${planName(event.toPlanCode)} plan is active.`,
          dedupeKey: `customer:activated:${event.historyId}`,
        });
      } else if (event.eventType === 'renewed') {
        await customerNotification({
          ...common,
          type: 'subscription_renewed',
          severity: 'success',
          title: 'Subscription renewed',
          message: `Your ${planName(event.toPlanCode)} plan was renewed.`,
          dedupeKey: `customer:renewed:${event.historyId}`,
        });
      } else if (event.eventType === 'expired') {
        await customerNotification({
          ...common,
          type: 'subscription_expired',
          severity: 'error',
          title: 'Subscription expired',
          message: 'Your subscription has expired. Access is currently locked.',
          dedupeKey:
            `customer:expired:${event.subscriptionId}:` +
            utcDateKey(event.occurredAt),
        });
      }
    }
  }

  async function syncCustomerLifecycle(ownerId, subscription) {
    if (!subscription) return;
    const lifecycle = evaluateSubscription(
      subscription,
      clock(),
      subscriptionConfig.reminderDays,
    );
    if (
      lifecycle.phase === 'active' &&
      notificationConfig.expiryWarningDays.includes(
        lifecycle.remainingDays,
      )
    ) {
      await customerNotification({
        ownerId,
        type: 'subscription_expiry_warning',
        severity: 'warning',
        title: 'Subscription expiry reminder',
        message: `Your subscription expires in ${lifecycle.remainingDays} day${lifecycle.remainingDays === 1 ? '' : 's'}.`,
        entityId: subscription.subscriptionId,
        dedupeKey:
          `customer:expiry-warning:${subscription.subscriptionId}:` +
          `${utcDateKey(subscription.expiresAt)}:${lifecycle.remainingDays}`,
      });
    }
    if (lifecycle.phase === 'grace') {
      await customerNotification({
        ownerId,
        type: 'subscription_grace_period',
        severity: 'warning',
        title: 'Grace period active',
        message: `Your grace period has ${lifecycle.graceRemainingDays} day${lifecycle.graceRemainingDays === 1 ? '' : 's'} remaining.`,
        entityId: subscription.subscriptionId,
        dedupeKey:
          `customer:grace:${subscription.subscriptionId}:` +
          utcDateKey(subscription.graceEndsAt),
      });
    }
    if (lifecycle.phase === 'expired') {
      await customerNotification({
        ownerId,
        type: 'subscription_expired',
        severity: 'error',
        title: 'Subscription expired',
        message: 'Your subscription has expired. Access is currently locked.',
        entityId: subscription.subscriptionId,
        dedupeKey:
          `customer:expired:${subscription.subscriptionId}:` +
          utcDateKey(subscription.endedAt || subscription.expiresAt),
      });
    }
  }

  async function syncAdminHistory(history) {
    for (const event of history) {
      if (
        event.eventType === 'renewed' &&
        event.actor?.type === 'admin'
      ) {
        await adminNotification({
          type: 'manual_renewal_completed',
          severity: 'success',
          title: 'Manual renewal completed',
          message: `${event.ownerId} was renewed on the ${planName(event.toPlanCode)} plan.`,
          entityType: 'subscription',
          entityId: event.subscriptionId,
          dedupeKey: `admin:manual-renewal:${event.historyId}`,
          createdAt: event.occurredAt,
        });
      }
      if (event.eventType === 'expired') {
        await adminNotification({
          type: 'subscription_expired',
          severity: 'error',
          title: 'Subscription expired',
          message: `${event.ownerId} subscription was marked expired.`,
          entityType: 'subscription',
          entityId: event.subscriptionId,
          dedupeKey:
            `admin:expired:${event.subscriptionId}:` +
            utcDateKey(event.occurredAt),
          createdAt: event.occurredAt,
        });
      }
      if (
        event.toPlanCode === 'lifetime' &&
        ['activated', 'plan_assigned'].includes(event.eventType)
      ) {
        await adminNotification({
          type: 'lifetime_plan_activated',
          severity: 'success',
          title: 'Lifetime plan activated',
          message: `${event.ownerId} received Lifetime subscription access.`,
          entityType: 'subscription',
          entityId: event.subscriptionId,
          dedupeKey: `admin:lifetime:${event.historyId}`,
          createdAt: event.occurredAt,
        });
      }
    }
  }

  async function syncAdminLifecycle(subscriptions) {
    for (const subscription of subscriptions) {
      const lifecycle = evaluateSubscription(
        subscription,
        clock(),
        subscriptionConfig.reminderDays,
      );
      if (
        lifecycle.phase === 'active' &&
        sameUtcDay(subscription.expiresAt, clock())
      ) {
        await adminNotification({
          type: 'subscription_expiring_today',
          severity: 'warning',
          title: 'Subscription expires today',
          message: `${subscription.ownerId} subscription expires today.`,
          entityType: 'subscription',
          entityId: subscription.subscriptionId,
          dedupeKey:
            `admin:expiring-today:${subscription.subscriptionId}:` +
            utcDateKey(subscription.expiresAt),
        });
      }
      if (lifecycle.phase === 'expired') {
        await adminNotification({
          type: 'subscription_expired',
          severity: 'error',
          title: 'Subscription expired',
          message: `${subscription.ownerId} subscription has expired.`,
          entityType: 'subscription',
          entityId: subscription.subscriptionId,
          dedupeKey:
            `admin:expired:${subscription.subscriptionId}:` +
            utcDateKey(subscription.endedAt || subscription.expiresAt),
        });
      }
    }
  }

  async function synchronizeCustomer(ownerId) {
    if (!notificationConfig.enabled) return;
    const normalizedOwnerId = requiredId(ownerId, 'Customer');
    const [subscription, history] = await Promise.all([
      subscriptionRepository.findByOwnerId(normalizedOwnerId),
      subscriptionRepository.listHistory(normalizedOwnerId, 200),
    ]);
    await syncCustomerHistory(normalizedOwnerId, history);
    await syncCustomerLifecycle(normalizedOwnerId, subscription);
  }

  async function synchronizeAdmin() {
    if (!notificationConfig.enabled) return;
    const [subscriptions, history] = await Promise.all([
      subscriptionRepository.listAllSubscriptions(),
      subscriptionRepository.listAllHistory(),
    ]);
    await syncAdminHistory(history);
    await syncAdminLifecycle(subscriptions);
  }

  function publicNotification(notification) {
    return Object.freeze({
      notificationId: notification.notificationId,
      type: notification.type,
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
    });
  }

  async function listFor({
    audience,
    recipientId,
    readerId,
    unreadOnly = false,
  }) {
    const all = await repository.list({
      audience,
      recipientId,
      readerId,
      unreadOnly: false,
      limit: notificationConfig.historyLimit,
    });
    const unreadCount = all.filter((item) => !item.readAt).length;
    const visible = unreadOnly
      ? all.filter((item) => !item.readAt)
      : all;
    return Object.freeze({
      notifications: visible.map(publicNotification),
      unreadCount,
    });
  }

  async function listCustomer(ownerId, { unreadOnly = false } = {}) {
    const normalizedOwnerId = requiredId(ownerId, 'Customer');
    await synchronizeCustomer(normalizedOwnerId);
    return listFor({
      audience: 'customer',
      recipientId: normalizedOwnerId,
      readerId: normalizedOwnerId,
      unreadOnly,
    });
  }

  async function listAdmin(adminId, { unreadOnly = false } = {}) {
    const normalizedAdminId = requiredId(adminId, 'Administrator');
    await synchronizeAdmin();
    return listFor({
      audience: 'admin',
      recipientId: 'admin',
      readerId: normalizedAdminId,
      unreadOnly,
    });
  }

  async function markRead({
    notificationId,
    audience,
    recipientId,
    readerId,
  }) {
    const result = await repository.markRead({
      notificationId: requiredId(notificationId, 'Notification'),
      audience,
      recipientId,
      readerId,
      readAt: new Date(clock()).toISOString(),
    });
    if (!result) {
      const error = new Error('Notification not found.');
      error.status = 404;
      error.code = 'NOTIFICATION_NOT_FOUND';
      throw error;
    }
    return Object.freeze({ success: true });
  }

  async function markAllRead({ audience, recipientId, readerId }) {
    const modifiedCount = await repository.markAllRead({
      audience,
      recipientId,
      readerId,
      readAt: new Date(clock()).toISOString(),
    });
    return Object.freeze({ success: true, modifiedCount });
  }

  async function notifyCustomerRegistered(customer) {
    const customerId = requiredId(customer?.id, 'Customer');
    return adminNotification({
      type: 'customer_registered',
      severity: 'info',
      title: 'New customer registered',
      message: `${customer.fullName || customer.email || customerId} created a customer account.`,
      entityType: 'customer',
      entityId: customerId,
      dedupeKey: `admin:customer-registered:${customerId}`,
      createdAt: customer.createdAt || clock(),
    });
  }

  return Object.freeze({
    listAdmin,
    listCustomer,
    markAllRead,
    markRead,
    notifyCustomerRegistered,
    synchronizeAdmin,
    synchronizeCustomer,
  });
}

module.exports = {
  createNotificationService,
};
