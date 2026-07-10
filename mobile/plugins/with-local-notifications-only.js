/**
 * with-local-notifications-only
 *
 * expo-notifications' iOS config plugin unconditionally adds the
 * `aps-environment` entitlement and the `remote-notification` background
 * mode — both are for *remote* APNs push. WAVE only schedules **local**
 * notifications (the lock-screen "prophylactic ping"), which need
 * neither.
 *
 * Keeping `aps-environment` would force the Push Notifications capability
 * onto the App ID and require the provisioning profile to carry it — it
 * doesn't (the AdHoc profile from the no-EAS-credits signing recipe), so
 * the EAS build fails at codesign. Stripping these here lets the build
 * sign with the existing profile while local notifications keep working.
 *
 * Registered AFTER "expo-notifications" in app.json so its mods run last.
 */

const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

module.exports = function withLocalNotificationsOnly(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    return cfg;
  });

  config = withInfoPlist(config, (cfg) => {
    const modes = cfg.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      cfg.modResults.UIBackgroundModes = modes.filter(
        (m) => m !== "remote-notification",
      );
      if (cfg.modResults.UIBackgroundModes.length === 0) {
        delete cfg.modResults.UIBackgroundModes;
      }
    }
    return cfg;
  });

  return config;
};
