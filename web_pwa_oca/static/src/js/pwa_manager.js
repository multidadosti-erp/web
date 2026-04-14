/* Copyright 2020 Tecnativa - Alexandre D. Díaz
 * License AGPL-3.0 or later (https://www.gnu.org/licenses/agpl). */

odoo.define("web_pwa_oca.PWAManager", function (require) {
    "use strict";

    var core = require("web.core");
    var Dialog = require("web.Dialog");
    var rpc = require("web.rpc");
    var Widget = require("web.Widget");

    var _t = core._t;


    var PWAManager = Widget.extend({
        /**
         * @override
         */
        init: function () {
            this._super.apply(this, arguments);
            this._service_worker = null;
            this._sw_registration = null;
            this._deferred_install_prompt = window.__pwaInstallPromptEvent || null;
            this._features = this._readFeaturesFromMeta();
            this._$panel = null;
            this._$status = null;
            this._$network = null;
            this._$nav_toggle_btn = null;
            this._$geo_btn = null;
            this._$camera_btn = null;
            this._$mic_btn = null;
            this._$share_btn = null;
            this._$update_btn = null;
            this._panel_open = false;
            this._systray_retry_count = 0;
            this._speech_recognition = null;
            this._speech_is_listening = false;
            this._speech_auto_stop_timer = null;
            this._speech_pending_start_timer = null;
            this._speech_manual_stop_fallback_timer = null;
            this._speech_buffer = "";
            this._speech_partial_buffer = "";
            this._speech_manual_stop = false;
            this._speech_auto_stopped = false;
            this._speech_auto_stop_seconds = this._getIntMetaValue("pwa-feature-voice-auto-stop-seconds", 5);
            this._speech_initial_wait_seconds = Math.max(12, this._speech_auto_stop_seconds * 3);
            this._speech_received_any_result = false;
            this._speech_retry_count = 0;
            this._speech_max_retries = 2;
            this._is_ios = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
            this._is_standalone_ios = window.navigator.standalone === true;
            this._is_standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
        },

        /**
         * Initializes all PWA integrations in the current page.
         */
        activate: function () {
            if (!this._features.quick_actions) {
                return;
            }
            this._bindInstallPromptEvents();
            this._bindConnectivityEvents();
            this._ensureNavbarToggle();
            this._renderQuickActions();

            if (!("serviceWorker" in navigator)) {
                this._setStatus(_t("Service Worker indisponivel. Verifique HTTPS e modo privado."));
                return;
            }
            this._service_worker = navigator.serviceWorker;
            this.registerServiceWorker("/service-worker.js");
        },

        /**
         *
         * @returns {Object}
         * @private
         */
        _readFeaturesFromMeta: function () {
            return {
                quick_actions: this._isFeatureEnabled("pwa-feature-quick-actions", true),
                install_button: this._isFeatureEnabled("pwa-feature-install-button", true),
                geolocation: this._isFeatureEnabled("pwa-feature-geolocation", true),
                camera: this._isFeatureEnabled("pwa-feature-camera", true),
                microphone: this._isFeatureEnabled("pwa-feature-microphone", true),
                voice_command_prep: this._isFeatureEnabled("pwa-feature-voice-command-prep", false),
                share: this._isFeatureEnabled("pwa-feature-share", true),
                sw_update: this._isFeatureEnabled("pwa-feature-sw-update", true),
            };
        },

        /**
         *
         * @param {String} name
         * @param {Boolean} defaultValue
         * @returns {Boolean}
         * @private
         */
        _isFeatureEnabled: function (name, defaultValue) {
            var meta = document.querySelector('meta[name="' + name + '"]');
            if (!meta || !meta.content) {
                return defaultValue;
            }
            return meta.content === "True";
        },

        /**
         *
         * @param {String} name
         * @param {Number} defaultValue
         * @returns {Number}
         * @private
         */
        _getIntMetaValue: function (name, defaultValue) {
            var meta = document.querySelector('meta[name="' + name + '"]');
            if (!meta || !meta.content) {
                return defaultValue;
            }
            var parsed = parseInt(meta.content, 10);
            if (isNaN(parsed) || parsed < 1) {
                return defaultValue;
            }
            return parsed;
        },

        /**
         * @param {String} sw_script
         * @returns {Promise}
         */
        registerServiceWorker: function (sw_script) {
            var self = this;
            return this._service_worker.register(sw_script)
                .then(function (registration) {
                    self._sw_registration = registration;
                    self._onRegisterServiceWorker(registration);
                    self._refreshButtonAvailability();
                    return registration;
                })
                .catch(function (error) {
                    console.log(_t('[ServiceWorker] Registration failed: '), error);
                });
        },

        /**
         * Need register some extra API? override this!
         *
         * @private
         * @param {ServiceWorkerRegistration} registration
         */
        _onRegisterServiceWorker: function (registration) {
            console.log(_t('[ServiceWorker] Registered:'), registration);
        },

        /**
         * Binds install-related browser events.
         *
         * @private
         */
        _bindInstallPromptEvents: function () {
            var self = this;
            window.addEventListener("beforeinstallprompt", function (event) {
                event.preventDefault();
                self._deferred_install_prompt = event;
                window.__pwaInstallPromptEvent = event;
                self._toggleInstallButton(true);
                self._setStatus(_t("Aplicativo pronto para instalacao."));
            });

            window.addEventListener("pwa-installprompt-available", function () {
                self._deferred_install_prompt = window.__pwaInstallPromptEvent;
                self._toggleInstallButton(true);
                self._setStatus(_t("Aplicativo pronto para instalacao."));
            });

            window.addEventListener("appinstalled", function () {
                self._deferred_install_prompt = null;
                window.__pwaInstallPromptEvent = null;
                self._toggleInstallButton(false);
                self._setStatus(_t("Aplicativo instalado com sucesso."));
            });
        },

        /**
         *
         * @private
         */
        _bindConnectivityEvents: function () {
            var self = this;
            window.addEventListener("online", function () {
                self._updateNetworkBadge();
                self._setStatus(_t("Conexao restabelecida."));
            });
            window.addEventListener("offline", function () {
                self._updateNetworkBadge();
                self._setStatus(_t("Sem conexao. Recursos online podem falhar."));
            });
        },

        /**
         * Creates a compact floating panel with PWA actions.
         *
         * @private
         */
        _renderQuickActions: function () {
            if (document.getElementById("o_pwa_quick_actions")) {
                this._$panel = $("#o_pwa_quick_actions");
                this._$status = this._$panel.find(".o_pwa_status");
                this._$network = this._$panel.find(".o_pwa_network");
                this._$geo_btn = this._$panel.find(".o_pwa_btn_geo");
                this._$camera_btn = this._$panel.find(".o_pwa_btn_camera");
                this._$mic_btn = this._$panel.find(".o_pwa_btn_mic");
                this._$share_btn = this._$panel.find(".o_pwa_btn_share");
                this._$update_btn = this._$panel.find(".o_pwa_btn_update");
                this._refreshButtonAvailability();
                this._applyPanelVisibility();
                return;
            }

            var html = [
                '<div id="o_pwa_quick_actions" class="o_pwa_quick_actions o_pwa_is_hidden">',
                '  <div class="o_pwa_head">',
                '    <span class="o_pwa_title">' + _t("PWA") + '</span>',
                '    <span class="o_pwa_network"></span>',
                '  </div>',
                '  <button type="button" class="btn btn-secondary btn-sm o_pwa_btn_geo">' + _t("Localizacao") + '</button>',
                '  <button type="button" class="btn btn-secondary btn-sm o_pwa_btn_camera">' + _t("Camera") + '</button>',
                '  <button type="button" class="btn btn-secondary btn-sm o_pwa_btn_mic">' + _t("Microfone") + '</button>',
                '  <button type="button" class="btn btn-secondary btn-sm o_pwa_btn_share">' + _t("Compartilhar") + '</button>',
                '  <button type="button" class="btn btn-secondary btn-sm o_pwa_btn_update">' + _t("Atualizar/Instalar") + '</button>',
                '  <button type="button" class="btn btn-secondary btn-sm o_pwa_btn_help">' + _t("Instrucoes de instalacao") + '</button>',
                '  <div class="o_pwa_status"></div>',
                '</div>',
            ].join("");

            this._$panel = $(html);
            this._$status = this._$panel.find(".o_pwa_status");
            this._$network = this._$panel.find(".o_pwa_network");
            this._$geo_btn = this._$panel.find(".o_pwa_btn_geo");
            this._$camera_btn = this._$panel.find(".o_pwa_btn_camera");
            this._$mic_btn = this._$panel.find(".o_pwa_btn_mic");
            this._$share_btn = this._$panel.find(".o_pwa_btn_share");
            this._$update_btn = this._$panel.find(".o_pwa_btn_update");

            this._$panel.find(".o_pwa_btn_geo").on("click", this._onGeolocationClick.bind(this));
            this._$panel.find(".o_pwa_btn_camera").on("click", this._onCameraClick.bind(this));
            this._$panel.find(".o_pwa_btn_mic").on("click", this._onMicrophoneClick.bind(this));
            this._$panel.find(".o_pwa_btn_share").on("click", this._onShareClick.bind(this));
            this._$panel.find(".o_pwa_btn_update").on("click", this._onUpdateAppClick.bind(this));
            this._$panel.find(".o_pwa_btn_help").on("click", this._onInstallHelpClick.bind(this));

            $(document.body).append(this._$panel);
            this._refreshButtonAvailability();
            this._updateNetworkBadge();
            this._setInitialStatus();
            this._applyPanelVisibility();
        },

        /**
         * Adds a systray toggle button to open/close the PWA panel.
         *
         * @private
         */
        _ensureNavbarToggle: function () {
            var self = this;
            var $existing = $("#o_pwa_systray_toggle");
            if ($existing.length) {
                this._$nav_toggle_btn = $existing;
                return;
            }

            var $systray = $(".o_menu_systray, .oe_systray").first();
            if (!$systray.length) {
                if (this._systray_retry_count < 20) {
                    this._systray_retry_count += 1;
                    setTimeout(function () {
                        self._ensureNavbarToggle();
                    }, 300);
                }
                return;
            }

            var $item = $([
                '<li class="o_pwa_systray_item">',
                '  <a href="#" id="o_pwa_systray_toggle" title="' + _t("PWA") + '">',
                '    <i class="fa fa-mobile"></i>',
                '  </a>',
                '</li>',
            ].join(""));

            this._$nav_toggle_btn = $item.find("#o_pwa_systray_toggle");
            this._$nav_toggle_btn.on("click", function (ev) {
                ev.preventDefault();
                self._panel_open = !self._panel_open;
                self._applyPanelVisibility();
            });

            // Append at the end to avoid reordering existing systray buttons.
            $systray.append($item);
            this._systray_retry_count = 0;
        },

        /**
         *
         * @private
         */
        _applyPanelVisibility: function () {
            if (!this._$panel) {
                return;
            }
            this._$panel.toggleClass("o_pwa_is_hidden", !this._panel_open);
            if (this._$nav_toggle_btn) {
                this._$nav_toggle_btn.toggleClass("o_pwa_active", this._panel_open);
            }
        },

        /**
         *
         * @private
         */
        _refreshButtonAvailability: function () {
            var hasShare = this._features.share && Boolean(navigator.share);
            var hasGeo = this._features.geolocation;
            var hasCamera = this._features.camera;
            var hasMic = this._features.microphone;
            var hasUpdate = this._features.sw_update || this._features.install_button;

            if (this._$geo_btn) {
                this._$geo_btn.toggle(hasGeo);
            }
            if (this._$camera_btn) {
                this._$camera_btn.toggle(hasCamera);
            }
            if (this._$mic_btn) {
                this._$mic_btn.toggle(hasMic);
            }
            if (this._$share_btn) {
                this._$share_btn.toggle(hasShare);
            }
            if (this._$update_btn) {
                this._$update_btn.toggle(hasUpdate);
            }
            this._toggleInstallButton(Boolean(this._deferred_install_prompt));
        },

        /**
         *
         * @private
         */
        _updateNetworkBadge: function () {
            if (!this._$network) {
                return;
            }
            var online = navigator.onLine;
            this._$network.text(online ? _t("Online") : _t("Offline"));
            this._$network.toggleClass("is-online", online);
            this._$network.toggleClass("is-offline", !online);
        },

        /**
         *
         * @private
         */
        _setInitialStatus: function () {
            if (!window.isSecureContext) {
                this._setStatus(_t("Contexto inseguro: use HTTPS para instalar, geolocalizacao e camera."));
                return;
            }
            if (this._is_standalone || this._is_standalone_ios) {
                this._setStatus(_t("Aplicativo em modo instalado."));
                return;
            }
            if (this._is_ios) {
                this._setStatus(_t("No iOS, use Compartilhar > Adicionar a Tela de Inicio."));
                return;
            }
            this._setStatus(_t("Aguardando elegibilidade de instalacao do navegador."));
        },

        /**
         *
         * @param {Boolean} visible
         * @private
         */
        _toggleInstallButton: function (visible) {
            if (!this._$update_btn) {
                return;
            }
            this._$update_btn.toggle(this._features.sw_update || this._features.install_button);
            this._$update_btn.toggleClass("o_pwa_install_ready", Boolean(visible));
        },

        /**
         *
         * @param {String} message
         * @private
         */
        _setStatus: function (message) {
            if (this._$status) {
                this._$status.text(message);
            }
        },

        /**
         *
         * @private
         */
        _onInstallClick: function () {
            this._startInstallFlow();
        },

        /**
         *
         * @private
         */
        _startInstallFlow: function () {
            var self = this;
            if (this._is_standalone || this._is_standalone_ios) {
                this._setStatus(_t("Aplicativo ja esta em modo instalado."));
                return;
            }

            if (!this._deferred_install_prompt) {
                if (this._service_worker && !this._sw_registration) {
                    this.registerServiceWorker("/service-worker.js").then(function () {
                        self._guideInstallFlow();
                    });
                    return;
                }
                this._guideInstallFlow();
                return;
            }

            this._deferred_install_prompt.prompt();
            this._deferred_install_prompt.userChoice.then(function (choice) {
                var accepted = choice && choice.outcome === "accepted";
                self._setStatus(accepted ? _t("Instalacao aceita pelo usuario.") : _t("Instalacao cancelada."));
                self._deferred_install_prompt = null;
                self._toggleInstallButton(false);
            });
        },

        /**
         * Shows installation guidance when browser does not expose beforeinstallprompt.
         *
         * @private
         */
        _guideInstallFlow: function () {
            var browserLabel = this._detectBrowserLabel();
            var steps = [];

            if (!window.isSecureContext) {
                this._setStatus(_t("Instalacao requer HTTPS."));
                steps.push(_t("Acesse por HTTPS. Em HTTP o navegador bloqueia instalacao PWA."));
                this._showInstallDialog(browserLabel, steps);
                return;
            }
            if (this._is_ios) {
                this._setStatus(_t("No iOS/iPadOS use Compartilhar > Adicionar a Tela de Inicio."));
                steps.push(_t("No Safari toque em Compartilhar e depois em 'Adicionar a Tela de Inicio'."));
                this._showInstallDialog(browserLabel, steps);
                return;
            }

            if (browserLabel === "Firefox") {
                this._setStatus(_t("Firefox desktop nao suporta instalacao de PWA como app independente."));
                steps.push(_t("Firefox desktop removeu o suporte a instalacao PWA em 2021 e nao o re-adicionou."));
                steps.push(_t("O Service Worker funciona normalmente, mas o app nao pode ser instalado pelo Firefox."));
                steps.push(_t("Para instalar como app: use Chrome, Edge ou Opera (eles suportam instalacao PWA no desktop)."));
                steps.push(_t("No Android: Firefox para Android suporta instalacao PWA pelo menu do navegador."));
                steps.push(_t("Alternativa no desktop: arraste a URL para a area de trabalho para criar um atalho de site."));
                this._showInstallDialog(browserLabel, steps);
                return;
            }

            if (browserLabel === "Opera") {
                this._setStatus(_t("No Opera, o app pode ser instalado pelo icone na barra de enderecos."));
                steps.push(_t("Olhe na barra de enderecos (direita): procure um icone de monitor/tela com um '+' ou seta para baixo."));
                steps.push(_t("Clique nesse icone e selecione 'Instalar' para adicionar o app."));
                steps.push(_t("Alternativa: clique no menu do Opera (letra O no canto) e procure 'Instalar [nome do app]' ou 'Sites' > 'Instalar'."));
                steps.push(_t("Para verificar se ja esta instalado, acesse opera://apps na barra de enderecos."));
                steps.push(_t("Se o icone nao aparecer, recarregue a pagina (F5) e aguarde alguns segundos navegando no site."));
                steps.push(_t("Caso nenhuma opcao funcione, use Chrome ou Edge para instalar com maior compatibilidade."));
                this._showInstallDialog(browserLabel, steps);
                return;
            }

            this._setStatus(
                _t("No desktop/tablet use o menu do navegador e escolha 'Instalar app' ou 'Adicionar a area de trabalho'.")
            );
            if (this._deferred_install_prompt) {
                steps.push(_t("Prompt de instalacao disponivel. Clique novamente em 'Instalar app'."));
            } else {
                steps.push(_t("No Chrome/Edge: abra o menu do navegador e use 'Instalar app' ou 'Adicionar a area de trabalho'."));
                steps.push(_t("Se a opcao nao aparecer, recarregue a pagina e navegue alguns segundos antes de tentar instalar."));
                steps.push(_t("Verifique se o app nao foi instalado anteriormente neste navegador/perfil."));
            }
            this._showInstallDialog(browserLabel, steps);
        },

        /**
         *
         * @returns {String}
         * @private
         */
        _detectBrowserLabel: function () {
            var ua = window.navigator.userAgent;
            if (/OPR\//.test(ua)) {
                return "Opera";
            }
            if (/Edg\//.test(ua)) {
                return "Edge";
            }
            if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) {
                return "Chrome";
            }
            if (/Firefox\//.test(ua)) {
                return "Firefox";
            }
            if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) {
                return "Safari";
            }
            return _t("navegador atual");
        },

        /**
         *
         * @param {String} browserLabel
         * @param {Array<String>} steps
         * @private
         */
        _showInstallDialog: function (browserLabel, steps) {
            var self = this;
            var swState = this._sw_registration ? _t("registrado") : _t("nao registrado");
            var modeState = (this._is_standalone || this._is_standalone_ios) ? _t("instalado") : _t("browser");
            var report = this._getInstallabilityReport(browserLabel);
            var recommendation = report.recommendation;
            var html = [
                '<div class="o_pwa_install_help">',
                '<p><strong>' + _t("Score de instalabilidade") + '</strong>: ' + report.score + '/100 (' + recommendation + ')</p>',
                '<ul>',
                report.items.map(function (item) {
                    var statusLabel = item.status === "ok" ? _t("OK") : (item.status === "warn" ? _t("Alerta") : _t("Falha"));
                    return '<li><strong>[' + statusLabel + ']</strong> ' + item.label + ': ' + item.value + '</li>';
                }).join(''),
                '</ul>',
                '<p><strong>' + _t("Diagnostico rapido") + '</strong></p>',
                '<ul>',
                '<li>' + _t("Navegador") + ': ' + browserLabel + '</li>',
                '<li>HTTPS: ' + (window.isSecureContext ? _t("ok") : _t("nao")) + '</li>',
                '<li>Service Worker: ' + swState + '</li>',
                '<li>Modo: ' + modeState + '</li>',
                '</ul>',
                '<p><strong>' + _t("Como instalar") + '</strong></p>',
                '<ol>',
                steps.map(function (step) { return '<li>' + step + '</li>'; }).join(''),
                '</ol>',
                '</div>',
            ].join("");

            var diagnosticText = this._buildInstallDiagnosticText(
                browserLabel,
                report,
                recommendation,
                steps,
                swState,
                modeState
            );

            new Dialog(this, {
                title: _t("Instalacao do app PWA"),
                $content: $(html),
                buttons: [
                    {
                        text: _t("Copiar diagnostico"),
                        classes: "btn-secondary",
                        close: false,
                        click: function () {
                            self._copyToClipboard(diagnosticText).then(function () {
                                self._setStatus(_t("Diagnostico copiado para a area de transferencia."));
                            }, function () {
                                self._setStatus(_t("Falha ao copiar diagnostico."));
                            });
                        },
                    },
                    !report.blocked && {
                        text: _t("Tentar instalar agora"),
                        classes: "btn-primary",
                        close: true,
                        click: function () {
                            self._tryInstallFromDeferred();
                        },
                    },
                    {
                        text: _t("Fechar"),
                        close: true,
                    },
                ],
            }).open();
        },

        /**
         *
         * @param {String} browserLabel
         * @param {Object} report
         * @param {String} recommendation
         * @param {Array<String>} steps
         * @param {String} swState
         * @param {String} modeState
         * @returns {String}
         * @private
         */
        _buildInstallDiagnosticText: function (browserLabel, report, recommendation, steps, swState, modeState) {
            var lines = [];
            lines.push("Instalacao do app PWA");
            lines.push("Score: " + report.score + "/100 (" + recommendation + ")");
            lines.push("Navegador: " + browserLabel);
            lines.push("HTTPS: " + (window.isSecureContext ? "ok" : "nao"));
            lines.push("Service Worker: " + swState);
            lines.push("Modo: " + modeState);
            lines.push("Detalhes:");
            report.items.forEach(function (item) {
                var statusLabel = item.status === "ok" ? "OK" : (item.status === "warn" ? "ALERTA" : "FALHA");
                lines.push("- [" + statusLabel + "] " + item.label + ": " + item.value);
            });
            lines.push("Passos sugeridos:");
            steps.forEach(function (step, index) {
                lines.push((index + 1) + ". " + step);
            });
            return lines.join("\n");
        },

        /**
         *
         * @param {String} text
         * @returns {Promise}
         * @private
         */
        _copyToClipboard: function (text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text);
            }

            return new Promise(function (resolve, reject) {
                try {
                    var textarea = document.createElement("textarea");
                    textarea.value = text;
                    textarea.setAttribute("readonly", "readonly");
                    textarea.style.position = "fixed";
                    textarea.style.opacity = "0";
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    var ok = document.execCommand("copy");
                    document.body.removeChild(textarea);
                    if (ok) {
                        resolve();
                        return;
                    }
                    reject(new Error("copy failed"));
                } catch (error) {
                    reject(error);
                }
            });
        },

        /**
         *
         * @param {String} browserLabel
         * @returns {Object}
         * @private
         */
        _getInstallabilityReport: function (browserLabel) {
            var items = [];
            var addItem = function (label, status, value, weight) {
                items.push({
                    label: label,
                    status: status,
                    value: value,
                    weight: weight,
                });
            };

            var hasManifest = Boolean(document.querySelector('link[rel="manifest"]'));
            addItem(_t("Manifest"), hasManifest ? "ok" : "fail", hasManifest ? _t("detectado") : _t("ausente"), 20);

            var secure = Boolean(window.isSecureContext);
            addItem(_t("HTTPS"), secure ? "ok" : "fail", secure ? _t("ok") : _t("obrigatorio"), 25);

            var hasSWApi = Boolean("serviceWorker" in navigator);
            addItem(_t("API Service Worker"), hasSWApi ? "ok" : "fail", hasSWApi ? _t("suportada") : _t("nao suportada"), 20);

            var swRegistered = Boolean(this._sw_registration);
            addItem(_t("Service Worker registrado"), swRegistered ? "ok" : "warn", swRegistered ? _t("sim") : _t("ainda nao"), 15);

            var canPrompt = Boolean(this._deferred_install_prompt);
            addItem(_t("Prompt nativo"), canPrompt ? "ok" : "warn", canPrompt ? _t("disponivel") : _t("indisponivel"), 10);

            var browserInstallability = browserLabel === "Firefox" ? "fail" : "ok";
            var browserHint = browserLabel === "Firefox" ? _t("nao suporta PWA no desktop") : _t("compativel");
            addItem(_t("Compatibilidade do navegador"), browserInstallability, browserHint, 10);

            var totalWeight = items.reduce(function (acc, item) {
                return acc + item.weight;
            }, 0);
            var earnedWeight = items.reduce(function (acc, item) {
                if (item.status === "ok") {
                    return acc + item.weight;
                }
                if (item.status === "warn") {
                    return acc + (item.weight * 0.5);
                }
                return acc;
            }, 0);
            var score = totalWeight ? Math.round((earnedWeight / totalWeight) * 100) : 0;

            // Hard blocker: browser does not support PWA installation at all.
            var hardBlocked = browserInstallability === "fail";
            var recommendation;
            if (hardBlocked) {
                recommendation = _t("Nao instalavel neste navegador");
            } else if (score >= 80) {
                recommendation = _t("Pronto para instalar");
            } else if (score >= 50) {
                recommendation = _t("Parcialmente pronto");
            } else {
                recommendation = _t("Nao pronto para instalar");
            }

            return {
                score: score,
                items: items,
                blocked: hardBlocked,
                recommendation: recommendation,
            };
        },

        /**
         * Tries native install prompt without reopening guidance loop.
         *
         * @private
         */
        _tryInstallFromDeferred: function () {
            var self = this;
            if (!this._deferred_install_prompt) {
                this._guideInstallFlow();
                return;
            }
            this._deferred_install_prompt.prompt();
            this._deferred_install_prompt.userChoice.then(function (choice) {
                var accepted = choice && choice.outcome === "accepted";
                self._setStatus(accepted ? _t("Instalacao aceita pelo usuario.") : _t("Instalacao cancelada."));
                self._deferred_install_prompt = null;
                self._toggleInstallButton(false);
            });
        },

        /**
         *
         * @private
         */
        _onGeolocationClick: function () {
            var self = this;
            if (!window.isSecureContext) {
                this._setStatus(_t("Geolocalizacao requer HTTPS."));
                return;
            }
            if (!("geolocation" in navigator)) {
                this._setStatus(_t("Geolocalizacao nao suportada pelo navegador."));
                return;
            }
            navigator.geolocation.getCurrentPosition(function (position) {
                var lat = position.coords.latitude.toFixed(6);
                var lng = position.coords.longitude.toFixed(6);
                self._reverseGeocode(position.coords.latitude, position.coords.longitude)
                    .then(function (addressData) {
                        var payload = {
                            event_type: "geolocation",
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            user_agent: window.navigator.userAgent,
                            note: "Captured from PWA panel",
                        };
                        if (addressData) {
                            $.extend(payload, addressData);
                        }
                        return self._rpcLogMobileEvent(payload)
                            .then(function (result) {
                                var suffix = result && result.id ? " (#" + result.id + ")" : "";
                                var cityText = addressData && addressData.city ? " - " + addressData.city : "";
                                self._setStatus(_t("Localizacao obtida e salva:") + " " + lat + ", " + lng + cityText + suffix);
                            }, function () {
                                self._setStatus(_t("Localizacao obtida, mas falhou ao salvar."));
                            });
                    }, function () {
                        return self._rpcLogMobileEvent({
                            event_type: "geolocation",
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            user_agent: window.navigator.userAgent,
                            note: "Captured from PWA panel",
                        }).then(function (result) {
                            var suffix = result && result.id ? " (#" + result.id + ")" : "";
                            self._setStatus(_t("Localizacao obtida e salva:") + " " + lat + ", " + lng + suffix);
                        }, function () {
                            self._setStatus(_t("Localizacao obtida, mas falhou ao salvar."));
                        });
                    });
            }, function (error) {
                self._setStatus(_t("Falha na geolocalizacao:") + " " + error.message);
            }, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
            });
        },

        /**
         * Reverse geocoding using OpenStreetMap Nominatim service.
         *
         * @param {Number} latitude
         * @param {Number} longitude
         * @returns {Promise<Object|null>}
         * @private
         */
        _reverseGeocode: function (latitude, longitude) {
            var url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=pt-BR&lat=" +
                encodeURIComponent(latitude) + "&lon=" + encodeURIComponent(longitude);

            return new Promise(function (resolve, reject) {
                window.fetch(url, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json",
                    },
                }).then(function (response) {
                    if (!response.ok) {
                        reject(new Error("reverse geocode failed"));
                        return;
                    }
                    response.json().then(function (data) {
                        var address = data && data.address ? data.address : {};
                        resolve({
                            country: address.country || null,
                            state: address.state || null,
                            city: address.city || address.town || address.village || address.municipality || null,
                            suburb: address.suburb || address.neighbourhood || null,
                            road: address.road || null,
                            postcode: address.postcode || null,
                            display_name: data.display_name || null,
                        });
                    }, reject);
                }, reject);
            });
        },

        /**
         *
         * @private
         */
        _onCameraClick: function () {
            var self = this;
            if (!window.isSecureContext) {
                this._setStatus(_t("Camera requer HTTPS."));
                return;
            }
            if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
                this._setStatus(_t("Camera nao suportada pelo navegador."));
                return;
            }

            navigator.mediaDevices
                .getUserMedia({
                    video: {
                        facingMode: "environment",
                    },
                    audio: false,
                })
                .then(function (stream) {
                    self._openCameraCaptureModal(stream);
                })
                .catch(function (error) {
                    self._setStatus(_t("Falha ao acessar camera:") + " " + error.message);
                });
        },

        /**
         *
         * @private
         */
        _onMicrophoneClick: function () {
            if (!window.isSecureContext) {
                this._setStatus(_t("Microfone requer HTTPS."));
                return;
            }

            var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                this._setStatus(_t("Reconhecimento de voz nao suportado neste navegador."));
                return;
            }

            // Toggle behavior: first click starts listening, second click stops.
            if (this._speech_is_listening && this._speech_recognition) {
                this._speech_manual_stop = true;
                this._speech_auto_stopped = false;
                this._speech_is_listening = false;
                this._speech_retry_count = 0;
                this._clearSpeechAutoStopTimer();
                this._clearPendingSpeechStartTimer();
                this._setMicButtonActive(false);
                this._setStatus(_t("Parando microfone..."));
                try {
                    this._speech_recognition.stop();
                } catch (error) {
                    this._finalizeManualStop();
                }
                this._scheduleManualStopFallback();
                return;
            }

            this._startSpeechRecognition(SpeechRecognition);
        },

        /**
         *
         * @param {Function} SpeechRecognition
         * @private
         */
        _startSpeechRecognition: function (SpeechRecognition) {
            var self = this;
            var recognition = this._speech_recognition;

            if (!recognition) {
                recognition = new SpeechRecognition();
                recognition.lang = "pt-BR";
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.maxAlternatives = 1;

                recognition.onresult = function (event) {
                    var finalTranscript = "";
                    var partialTranscript = "";
                    for (var i = event.resultIndex; i < event.results.length; i++) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript || "";
                        } else {
                            partialTranscript += event.results[i][0].transcript || "";
                        }
                    }

                    self._speech_received_any_result = true;

                    if (partialTranscript.trim()) {
                        self._speech_partial_buffer = partialTranscript.trim();
                        self._setStatus(_t("Microfone ouvindo...") + " " + self._speech_partial_buffer);
                    }
                    self._resetSpeechAutoStopTimer();

                    if (!finalTranscript.trim()) {
                        return;
                    }

                    self._speech_buffer = (self._speech_buffer + " " + finalTranscript.trim()).trim();
                    self._speech_partial_buffer = "";
                    self._setStatus(_t("Fala detectada. Aguardando auto-parada..."));
                };

                recognition.onerror = function (event) {
                    self._speech_is_listening = false;
                    self._clearSpeechAutoStopTimer();
                    self._clearPendingSpeechStartTimer();
                    self._clearManualStopFallbackTimer();
                    self._setMicButtonActive(false);
                    self._speech_retry_count = 0;
                    if (self._speech_manual_stop && event && event.error === "aborted") {
                        self._finalizeManualStop(recognition.lang);
                        return;
                    }
                    // Descarta a instancia com erro para forcar criacao nova na proxima tentativa.
                    self._speech_recognition = null;
                    self._setStatus(_t("Falha no reconhecimento de voz:") + " " + (event.error || "unknown"));
                };

                recognition.onend = function () {
                    self._speech_is_listening = false;
                    self._clearSpeechAutoStopTimer();
                    self._clearPendingSpeechStartTimer();
                    self._clearManualStopFallbackTimer();
                    self._setMicButtonActive(false);
                    if (self._speech_manual_stop) {
                        self._finalizeManualStop(recognition.lang);
                        return;
                    } else if (self._speech_auto_stopped) {
                        self._speech_auto_stopped = false;
                        if (!self._speech_received_any_result) {
                            if (self._speech_retry_count < self._speech_max_retries) {
                                self._speech_retry_count += 1;
                                self._setStatus(
                                    _t("Sem deteccao de fala. Tentando novamente") +
                                    " (" + self._speech_retry_count + "/" + self._speech_max_retries + ")"
                                );
                                self._speech_buffer = "";
                                self._speech_partial_buffer = "";
                                self._speech_pending_start_timer = setTimeout(function () {
                                    self._startRecognitionInstance(recognition);
                                }, 300);
                                return;
                            }
                            self._setStatus(_t("Sem deteccao de fala inicial. Verifique permissao de microfone e tente novamente."));
                        } else {
                            self._speech_retry_count = 0;
                            self._setStatus(_t("Microfone parado por tempo."));
                        }
                    }
                    self._flushSpeechBuffer(recognition.lang);
                };

                this._speech_recognition = recognition;
            }

            // Inicia diretamente sem getUserMedia pre-check.
            // O pre-check com getUserMedia+stop causava race condition no Windows:
            // o OS nao libera o dispositivo de audio a tempo e o SpeechRecognition
            // iniciava com stream corrompido, gerando "No speech detected".
            // A propria API SpeechRecognition gerencia a permissao de microfone.
            self._startRecognitionInstance(recognition);
        },

        /**
         *
         * @param {Object} recognition
         * @private
         */
        _startRecognitionInstance: function (recognition) {
            var self = this;
            this._clearPendingSpeechStartTimer();

            if (this._speech_is_listening) {
                return;
            }

            try {
                this._speech_buffer = "";
                this._speech_partial_buffer = "";
                recognition.start();
                this._speech_is_listening = true;
                this._speech_manual_stop = false;
                this._speech_auto_stopped = false;
                this._speech_received_any_result = false;
                this._resetSpeechAutoStopTimer(this._speech_initial_wait_seconds);
                this._setMicButtonActive(true);
                this._setStatus(_t("Microfone ativo. Fale agora... Aguardando fala inicial por") + " " + this._speech_initial_wait_seconds + "s");
            } catch (error) {
                // Some engines throw if start is called too quickly after stop.
                if (error && error.name === "InvalidStateError") {
                    this._speech_pending_start_timer = setTimeout(function () {
                        if (self._speech_is_listening || self._speech_manual_stop) {
                            return;
                        }
                        try {
                            self._speech_buffer = "";
                            self._speech_partial_buffer = "";
                            recognition.start();
                            self._speech_is_listening = true;
                            self._speech_manual_stop = false;
                            self._speech_auto_stopped = false;
                            self._speech_received_any_result = false;
                            self._resetSpeechAutoStopTimer(self._speech_initial_wait_seconds);
                            self._setMicButtonActive(true);
                            self._setStatus(_t("Microfone ativo. Fale agora... Aguardando fala inicial por") + " " + self._speech_initial_wait_seconds + "s");
                        } catch (retryError) {
                            self._setStatus(_t("Nao foi possivel iniciar o microfone agora."));
                        }
                    }, 250);
                    return;
                }
                this._setStatus(_t("Nao foi possivel iniciar o microfone agora."));
            }
        },

        /**
         *
         * @private
         */
        _resetSpeechAutoStopTimer: function (seconds) {
            var self = this;
            this._clearSpeechAutoStopTimer();
            var timeoutSeconds = seconds || this._speech_auto_stop_seconds;
            this._speech_auto_stop_timer = setTimeout(function () {
                if (self._speech_recognition && self._speech_is_listening) {
                    self._speech_auto_stopped = true;
                    self._setStatus(_t("Auto-parada do microfone por tempo."));
                    self._speech_recognition.stop();
                }
            }, timeoutSeconds * 1000);
        },

        /**
         *
         * @param {Boolean} active
         * @private
         */
        _setMicButtonActive: function (active) {
            if (!this._$mic_btn) {
                return;
            }
            this._$mic_btn.toggleClass("btn-danger", Boolean(active));
            this._$mic_btn.toggleClass("btn-secondary", !Boolean(active));
        },

        /**
         *
         * @private
         */
        _clearSpeechAutoStopTimer: function () {
            if (this._speech_auto_stop_timer) {
                clearTimeout(this._speech_auto_stop_timer);
                this._speech_auto_stop_timer = null;
            }
        },

        /**
         *
         * @private
         */
        _clearPendingSpeechStartTimer: function () {
            if (this._speech_pending_start_timer) {
                clearTimeout(this._speech_pending_start_timer);
                this._speech_pending_start_timer = null;
            }
        },

        /**
         *
         * @private
         */
        _scheduleManualStopFallback: function () {
            var self = this;
            this._clearManualStopFallbackTimer();
            this._speech_manual_stop_fallback_timer = setTimeout(function () {
                if (!self._speech_manual_stop) {
                    return;
                }
                self._finalizeManualStop();
            }, 1200);
        },

        /**
         *
         * @private
         */
        _clearManualStopFallbackTimer: function () {
            if (this._speech_manual_stop_fallback_timer) {
                clearTimeout(this._speech_manual_stop_fallback_timer);
                this._speech_manual_stop_fallback_timer = null;
            }
        },

        /**
         *
         * @param {String} lang
         * @private
         */
        _finalizeManualStop: function (lang) {
            this._speech_manual_stop = false;
            this._clearManualStopFallbackTimer();
            this._setMicButtonActive(false);
            this._setStatus(_t("Microfone parado manualmente."));
            this._flushSpeechBuffer(lang || "pt-BR");
        },

        /**
         *
         * @param {String} lang
         * @private
         */
        _flushSpeechBuffer: function (lang) {
            var transcript = (this._speech_buffer || "").trim();
            if (!transcript) {
                transcript = (this._speech_partial_buffer || "").trim();
            }
            this._speech_buffer = "";
            this._speech_partial_buffer = "";
            this._speech_retry_count = 0;

            if (!transcript) {
                this._saveMicrophoneLog(null, lang || "pt-BR", _t("No speech detected before stop"), null);
                return;
            }

            var commandMeta = this._features.voice_command_prep ? this._prepareVoiceCommand(transcript) : null;
            this._saveMicrophoneLog(transcript, lang || "pt-BR", "Speech captured from PWA panel", commandMeta);
        },

        /**
         *
         * @param {String|null} transcript
         * @param {String} lang
         * @param {String} note
         * @param {Object|null} commandMeta
         * @private
         */
        _saveMicrophoneLog: function (transcript, lang, note, commandMeta) {
            var self = this;
            var payload = {
                event_type: "microphone",
                transcript: transcript,
                transcript_lang: lang,
                user_agent: window.navigator.userAgent,
                note: note,
            };
            if (commandMeta) {
                payload.command_intent = commandMeta.intent;
                payload.command_confidence = commandMeta.confidence;
                payload.command_status = "draft";
                payload.command_payload = JSON.stringify(commandMeta.payload || {});
            }

            this._rpcLogMobileEvent(payload).then(function (result) {
                var suffix = result && result.id ? " (#" + result.id + ")" : "";
                var intentText = commandMeta && commandMeta.intent ? " - " + commandMeta.intent : "";
                if (transcript) {
                    self._setStatus(_t("Fala capturada e salva") + intentText + suffix + ".");
                } else {
                    self._setStatus(_t("Evento de microfone salvo") + suffix + ".");
                }
            }, function (error) {
                var detail = error && (error.message || error.data && error.data.message) ?
                    (error.message || error.data.message) : _t("erro desconhecido");
                self._setStatus(_t("Falha ao salvar log de microfone:") + " " + detail);
            });
        },

        /**
         * Prepare a lightweight command suggestion from transcript text.
         * Does not execute commands, only stores draft metadata for future integrations.
         *
         * @param {String} transcript
         * @returns {Object|null}
         * @private
         */
        _prepareVoiceCommand: function (transcript) {
            if (!transcript) {
                return null;
            }
            var text = transcript.toLowerCase();
            var intent = "unknown";
            var confidence = 0.35;

            if (text.indexOf("pedido") >= 0 || text.indexOf("venda") >= 0) {
                intent = "open_sale_order";
                confidence = 0.65;
            } else if (text.indexOf("cliente") >= 0 || text.indexOf("contato") >= 0) {
                intent = "search_partner";
                confidence = 0.65;
            } else if (text.indexOf("fatura") >= 0 || text.indexOf("boleto") >= 0) {
                intent = "open_invoice";
                confidence = 0.65;
            } else if (text.indexOf("estoque") >= 0 || text.indexOf("entrega") >= 0) {
                intent = "open_stock_picking";
                confidence = 0.65;
            }

            return {
                intent: intent,
                confidence: confidence,
                payload: {
                    transcript: transcript,
                    source: "web_pwa_oca",
                    prepared_only: true,
                },
            };
        },

        /**
         *
         * @private
         */
        _onShareClick: function () {
            var self = this;
            if (!(navigator.share && this._features.share)) {
                this._setStatus(_t("Compartilhamento nao suportado pelo navegador."));
                return;
            }
            navigator.share({
                title: document.title,
                text: _t("Acesse o app PWA no Odoo"),
                url: window.location.href,
            }).then(function () {
                self._setStatus(_t("Link compartilhado com sucesso."));
            }, function (error) {
                if (error && error.name === "AbortError") {
                    self._setStatus(_t("Compartilhamento cancelado."));
                    return;
                }
                self._setStatus(_t("Falha ao compartilhar."));
            });
        },

        /**
         *
         * @private
         */
        _onUpdateAppClick: function () {
            var self = this;
            if (!this._sw_registration) {
                this._setStatus(_t("Service worker ainda nao registrado. Tentando instalar mesmo assim."));
                this._startInstallFlow();
                return;
            }
            this._sw_registration.update().then(function () {
                self._setStatus(_t("Verificacao de atualizacao concluida."));
                self._startInstallFlow();
            }, function () {
                self._setStatus(_t("Falha ao verificar atualizacao do app."));
                self._startInstallFlow();
            });
        },

        /**
         *
         * @private
         */
        _onInstallHelpClick: function () {
            this._guideInstallFlow();
        },

        /**
         *
         * @param {MediaStream} stream
         * @private
         */
        _openCameraCaptureModal: function (stream) {
            var self = this;
            var $modal = $([
                '<div class="o_pwa_camera_modal">',
                '  <div class="o_pwa_camera_card">',
                '    <video autoplay playsinline class="o_pwa_camera_video"></video>',
                '    <div class="o_pwa_camera_actions">',
                '      <button type="button" class="btn btn-primary btn-sm o_pwa_capture_btn">' + _t("Capturar") + '</button>',
                '      <button type="button" class="btn btn-secondary btn-sm o_pwa_cancel_btn">' + _t("Cancelar") + '</button>',
                '    </div>',
                '  </div>',
                '</div>',
            ].join(""));
            var video = $modal.find(".o_pwa_camera_video").get(0);
            video.srcObject = stream;

            var closeModal = function () {
                stream.getTracks().forEach(function (track) {
                    track.stop();
                });
                $modal.remove();
            };

            $modal.find(".o_pwa_cancel_btn").on("click", function () {
                closeModal();
                self._setStatus(_t("Captura de camera cancelada."));
            });

            $modal.find(".o_pwa_capture_btn").on("click", function () {
                var canvas = document.createElement("canvas");
                var width = video.videoWidth || 1280;
                var height = video.videoHeight || 720;
                canvas.width = width;
                canvas.height = height;
                canvas.getContext("2d").drawImage(video, 0, 0, width, height);
                var imageData = canvas.toDataURL("image/jpeg", 0.85);

                self._rpcLogMobileEvent({
                    event_type: "camera",
                    image_data: imageData,
                    image_mimetype: "image/jpeg",
                    user_agent: window.navigator.userAgent,
                    note: "Captured from PWA panel",
                }).then(function (result) {
                    var suffix = result && result.id ? " (#" + result.id + ")" : "";
                    self._setStatus(_t("Imagem capturada e salva") + suffix + ".");
                }, function () {
                    self._setStatus(_t("Imagem capturada, mas falhou ao salvar."));
                }).then(function () {
                    closeModal();
                });
            });

            $(document.body).append($modal);
            this._setStatus(_t("Camera pronta para captura."));
        },

        /**
         *
         * @param {Object} payload
         * @returns {Promise}
         * @private
         */
        _rpcLogMobileEvent: function (payload) {
            return rpc.query({
                route: "/web_pwa_oca/mobile/log",
                params: payload,
            });
        },
    });

    return PWAManager;
});
