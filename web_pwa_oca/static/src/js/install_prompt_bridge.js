/* Copyright 2026
 * License AGPL-3.0 or later (https://www.gnu.org/licenses/agpl). */

(function () {
    "use strict";

    window.__pwaInstallPromptEvent = window.__pwaInstallPromptEvent || null;

    window.addEventListener("beforeinstallprompt", function (event) {
        event.preventDefault();
        window.__pwaInstallPromptEvent = event;
        if (typeof window.CustomEvent === "function") {
            window.dispatchEvent(new CustomEvent("pwa-installprompt-available"));
        }
    });

    window.addEventListener("appinstalled", function () {
        window.__pwaInstallPromptEvent = null;
    });
})();
