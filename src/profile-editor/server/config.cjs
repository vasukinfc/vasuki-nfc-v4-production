'use strict';

const {
  explicitBoolean,
} = require('../../platform/server/config-utils.cjs');

/**
 * Returns true only when the profile editor is explicitly enabled.
 *
 * @param {NodeJS.ProcessEnv | Record<string, unknown>} [environment]
 */
function isProfileEditorEnabled(environment = process.env) {
  return explicitBoolean(environment.PROFILE_EDITOR_ENABLED);
}

function getProfileEditorConfig(environment = process.env) {
  return Object.freeze({
    enabled: isProfileEditorEnabled(environment),
  });
}

module.exports = {
  getProfileEditorConfig,
  isProfileEditorEnabled,
};
