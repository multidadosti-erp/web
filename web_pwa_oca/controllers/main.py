# Copyright 2020 Lorenzo Battistini @ TAKOBI
# Copyright 2020 Tecnativa - Alexandre D. Díaz
# Copyright 2020 Tecnativa - João Marques
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
import json
import base64
from urllib.parse import unquote
from werkzeug.utils import redirect

from odoo.http import request, Controller, route


class PWA(Controller):
    def _get_pwa_scripts(self):
        """Scripts to be imported in the service worker (Order is important)"""
        return [
            "/web/static/lib/underscore/underscore.js",
            "/web_pwa_oca/static/src/js/worker/jquery-sw-compat.js",
            "/web/static/src/js/boot.js",
            "/web/static/src/js/core/class.js",
            "/web_pwa_oca/static/src/js/worker/pwa.js",
        ]

    @route("/service-worker.js", type="http", auth="public")
    def render_service_worker(self):
        """Route to register the service worker in the 'main' scope ('/')"""
        return request.render(
            "web_pwa_oca.service_worker",
            {
                "pwa_scripts": self._get_pwa_scripts(),
                "pwa_params": self._get_pwa_params(),
            },
            headers=[("Content-Type", "text/javascript;charset=utf-8")],
        )

    def _get_pwa_params(self):
        """Get javascript PWA class initialzation params"""
        return {}

    def _get_pwa_manifest_icons(self, pwa_icon, icon_version):
        icons = []
        version_suffix = "?v=%s" % icon_version if icon_version else ""
        if not pwa_icon:
            for size in [
                (128, 128),
                (144, 144),
                (152, 152),
                (192, 192),
                (256, 256),
                (512, 512),
            ]:
                icons.append(
                    {
                        "src": (
                            "/web_pwa_oca/static/img/icons/icon-%sx%s.png%s"
                            % (str(size[0]), str(size[1]), version_suffix)
                        ),
                        "sizes": "%sx%s" % (str(size[0]), str(size[1])),
                        "type": "image/png",
                    }
                )
        elif not pwa_icon.mimetype.startswith("image/svg"):
            all_icons = (
                request.env["ir.attachment"]
                .sudo()
                .search(
                    [
                        ("url", "like", "/web_pwa_oca/icon"),
                        (
                            "url",
                            "not like",
                            "/web_pwa_oca/icon.",
                        ),  # Get only resized icons
                    ]
                )
            )
            for icon in all_icons:
                icon_size_name = icon.url.split("/")[-1].lstrip("icon").split(".")[0]
                icons.append(
                    {
                        "src": "%s%s" % (icon.url, version_suffix),
                        "sizes": icon_size_name,
                        "type": icon.mimetype,
                    }
                )
        else:
            icons = [
                {
                    "src": "%s%s" % (pwa_icon.url, version_suffix),
                    "sizes": "128x128 144x144 152x152 192x192 256x256 512x512",
                    "type": pwa_icon.mimetype,
                }
            ]
        return icons

    def _get_pwa_manifest(self, db_name=None):
        """Webapp manifest"""
        config_param_sudo = request.env["ir.config_parameter"].sudo()
        pwa_name = config_param_sudo.get_param("pwa.manifest.name", "Odoo PWA")
        pwa_short_name = config_param_sudo.get_param(
            "pwa.manifest.short_name", "Odoo PWA"
        )
        pwa_icon = (
            request.env["ir.attachment"]
            .sudo()
            .search([("url", "like", "/web_pwa_oca/icon.")])
        )
        background_color = config_param_sudo.get_param(
            "pwa.manifest.background_color", "#2E69B5"
        )
        theme_color = config_param_sudo.get_param("pwa.manifest.theme_color", "#2E69B5")
        icon_version = config_param_sudo.get_param("pwa.icon.version", "1")
        db_value = db_name or request.db or request.session.db
        start_url = "/web"
        manifest_id = "/web"
        if db_value:
            manifest_id = "/web?db=%s" % db_value
        return {
            "name": pwa_name,
            "short_name": pwa_short_name,
            "description": pwa_name,
            "lang": "pt-BR",
            "icons": self._get_pwa_manifest_icons(pwa_icon, icon_version),
            "id": manifest_id,
            "start_url": start_url,
            "scope": "/web",
            "display": "standalone",
            "display_override": ["standalone", "minimal-ui"],
            "orientation": "any",
            "prefer_related_applications": False,
            "background_color": background_color,
            "theme_color": theme_color,
        }

    @route("/web_pwa_oca/manifest.webmanifest", type="http", auth="public")
    def pwa_manifest(self, **kwargs):
        """Returns the manifest used to install the page as app"""
        db_name = kwargs.get("db") or request.db or request.session.db
        return request.make_response(
            json.dumps(self._get_pwa_manifest(db_name=db_name)),
            headers=[
                ("Content-Type", "application/manifest+json;charset=utf-8"),
                ("Cache-Control", "no-cache, no-store, must-revalidate"),
                ("Pragma", "no-cache"),
            ],
        )

    @route(
        [
            "/web_pwa_oca/icon.<string:ext>",
            "/web_pwa_oca/icon<int:width>x<int:height>.<string:ext>",
        ],
        type="http",
        auth="public",
    )
    def pwa_icon(self, ext=None, width=None, height=None, **kwargs):
        if width and height:
            url = "/web_pwa_oca/icon%sx%s.%s" % (width, height, ext)
        else:
            url = "/web_pwa_oca/icon.%s" % ext

        attachment = (
            request.env["ir.attachment"]
            .sudo()
            .search([("url", "=", url)], limit=1)
        )
        if not attachment or not attachment.datas:
            return request.not_found()

        return request.make_response(
            base64.b64decode(attachment.datas),
            headers=[("Content-Type", attachment.mimetype or "image/png")],
        )

    @route("/web_pwa_oca/mobile/log", type="json", auth="user")
    def pwa_mobile_log(
        self,
        event_type,
        latitude=None,
        longitude=None,
        accuracy=None,
        country=None,
        state=None,
        city=None,
        suburb=None,
        road=None,
        postcode=None,
        display_name=None,
        image_data=None,
        image_mimetype=None,
        transcript=None,
        transcript_lang=None,
        command_intent=None,
        command_confidence=None,
        command_status=None,
        command_payload=None,
        user_agent=None,
        note=None,
    ):
        if event_type not in ("geolocation", "camera", "microphone"):
            return {"ok": False, "error": "invalid_event_type"}

        vals = {
            "event_type": event_type,
            "user_id": request.env.user.id,
            "latitude": latitude,
            "longitude": longitude,
            "accuracy": accuracy,
            "country": country,
            "state": state,
            "city": city,
            "suburb": suburb,
            "road": road,
            "postcode": postcode,
            "display_name": display_name,
            "image_mimetype": image_mimetype,
            "transcript": transcript,
            "transcript_lang": transcript_lang,
            "command_intent": command_intent,
            "command_confidence": command_confidence,
            "command_status": command_status,
            "command_payload": command_payload,
            "user_agent": user_agent,
            "note": note,
        }
        if image_data:
            vals["image"] = image_data.split(",", 1)[-1] if "," in image_data else image_data

        rec = request.env["web.pwa.mobile.log"].sudo().create(vals)
        return {"ok": True, "id": rec.id}

    @route("/web_pwa_oca/open_in_browser", type="http", auth="user")
    def pwa_open_in_browser(self, next=None, **kwargs):
        """Bridge route outside /web scope to open current screen in browser mode."""
        target = unquote(next) if next else "/web"
        if not isinstance(target, str) or not target.startswith("/web"):
            target = "/web"
        return redirect(target, code=302)
