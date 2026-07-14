'use strict';

const BASE_PLANS = Object.freeze([
  Object.freeze({
    code: 'free_trial',
    name: 'Free Trial',
    kind: 'trial',
    duration: Object.freeze({ unit: 'days', value: 14 }),
  }),
  Object.freeze({
    code: 'month_1',
    name: '1 Month',
    kind: 'recurring',
    duration: Object.freeze({ unit: 'months', value: 1 }),
  }),
  Object.freeze({
    code: 'month_3',
    name: '3 Months',
    kind: 'recurring',
    duration: Object.freeze({ unit: 'months', value: 3 }),
  }),
  Object.freeze({
    code: 'month_6',
    name: '6 Months',
    kind: 'recurring',
    duration: Object.freeze({ unit: 'months', value: 6 }),
  }),
  Object.freeze({
    code: 'year_1',
    name: '1 Year',
    kind: 'recurring',
    duration: Object.freeze({ unit: 'years', value: 1 }),
  }),
  Object.freeze({
    code: 'lifetime',
    name: 'Lifetime',
    kind: 'lifetime',
    duration: null,
  }),
]);

/**
 * Returns immutable plan definitions, applying only the configurable trial
 * length. Commercial prices are intentionally excluded until a later phase.
 */
function subscriptionPlans({ freeTrialDays = 14 } = {}) {
  return Object.freeze(
    BASE_PLANS.map((plan) =>
      plan.code === 'free_trial'
        ? Object.freeze({
            ...plan,
            duration: Object.freeze({
              unit: 'days',
              value: freeTrialDays,
            }),
          })
        : plan,
    ),
  );
}

function planByCode(code, options) {
  return (
    subscriptionPlans(options).find(
      (plan) => plan.code === String(code || '').trim().toLowerCase(),
    ) || null
  );
}

module.exports = {
  planByCode,
  subscriptionPlans,
};
