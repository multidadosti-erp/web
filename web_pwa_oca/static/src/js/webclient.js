/* Copyright 2020 Tecnativa - Alexandre D. Díaz
 * License AGPL-3.0 or later (https://www.gnu.org/licenses/agpl). */

odoo.define("web_pwa_oca.webclient", function (require) {
    "use strict";

    var session = require("web.session");
    var WebClient = require("web.WebClient");
    var PWAManager = require("web_pwa_oca.PWAManager");

    WebClient.include({

        /**
         * Storage key scoped by db and user to avoid collisions.
         *
         * @private
         * @returns {String}
         */
        _getLastScreenStorageKey: function () {
            var db = session.db || "db";
            var uid = session.uid || "uid";
            return "web_pwa_oca.last_screen_state." + db + "." + uid;
        },

        /**
         * Checks whether the web client is running as an installed PWA.
         *
         * @private
         * @returns {Boolean}
         */
        _isStandalonePWA: function () {
            var hasDisplayMode = window.matchMedia && (
                window.matchMedia("(display-mode: standalone)").matches ||
                window.matchMedia("(display-mode: minimal-ui)").matches ||
                window.matchMedia("(display-mode: fullscreen)").matches
            );
            var isIOSStandalone = window.navigator.standalone === true;
            var isAndroidTWA = document.referrer && document.referrer.indexOf("android-app://") === 0;
            return Boolean(hasDisplayMode || isIOSStandalone || isAndroidTWA);
        },

        /**
         * Persist navigable state to recover the same screen on next open.
         *
         * @private
         * @param {Object} state
         */
        _saveLastScreenState: function (state) {
            if (!this._isStandalonePWA()) {
                return;
            }
            if (!window.localStorage || !state) {
                return;
            }
            if (!(state.sa || state.action || state.menu_id || state.model)) {
                return;
            }
            try {
                window.localStorage.setItem(this._getLastScreenStorageKey(), JSON.stringify(state));
            } catch (error) {
                // Ignore storage errors (quota/privacy mode).
            }
        },

        /**
         * Read persisted state from browser storage.
         *
         * @private
         * @returns {Object|null}
         */
        _loadLastScreenState: function () {
            if (!this._isStandalonePWA()) {
                return null;
            }
            if (!window.localStorage) {
                return null;
            }
            try {
                var raw = window.localStorage.getItem(this._getLastScreenStorageKey());
                var parsed = raw ? JSON.parse(raw) : null;
                if (!parsed || _.isEmpty(parsed)) {
                    return null;
                }
                if (!(parsed.sa || parsed.action || parsed.menu_id || parsed.model)) {
                    return null;
                }
                return parsed;
            } catch (error) {
                return null;
            }
        },

        /**
         * @override
         */
        show_application: function () {
            if (this._isStandalonePWA() && _.isEmpty($.bbq.getState(true))) {
                var lastState = this._loadLastScreenState();
                if (lastState) {
                    $.bbq.pushState(lastState);
                }
            }

            var result = this._super.apply(this, arguments);
            if (!this.pwa_manager) {
                this.pwa_manager = new PWAManager(this);
            }
            this.pwa_manager.activate();
            return result;
        },

        /**
         * @override
         */
        on_hashchange: function () {
            var self = this;
            var result = this._super.apply(this, arguments);

            return $.when(result).then(function () {
                self._saveLastScreenState($.bbq.getState(true));
            }, function () {
                return $.Deferred().reject();
            });
        },

        /**
         * @override
         */
        _on_app_clicked_done: function (ev) {
            var self = this;
            var result = this._super.apply(this, arguments);
            return $.when(result).then(function () {
                self._saveLastScreenState($.bbq.getState(true));
            });
        },

        /**
         * @override
         */
        on_menu_clicked: function (ev) {
            var self = this;
            var result = this._super.apply(this, arguments);
            return $.when(result).then(function () {
                self._saveLastScreenState($.bbq.getState(true));
            });
        },
    });
});
