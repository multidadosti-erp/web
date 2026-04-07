# Copyright 2020 Tecnativa - João Marques
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
import sys
import base64
import io

from PIL import Image

from odoo import api, exceptions, fields, models, _
from odoo.tools.mimetypes import guess_mimetype


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"
    _pwa_icon_url_base = "/web_pwa_oca/icon"

    pwa_name = fields.Char(
        "Progressive Web App Name", help="Name of the Progressive Web Application"
    )
    pwa_short_name = fields.Char(
        "Progressive Web App Short Name",
        help="Short Name of the Progressive Web Application",
    )
    pwa_icon = fields.Binary("Icon", readonly=False)
    pwa_background_color = fields.Char("Background Color")
    pwa_theme_color = fields.Char("Theme Color")
    pwa_enable_quick_actions = fields.Boolean("Enable PWA Quick Actions")
    pwa_enable_install_button = fields.Boolean("Enable Install Button")
    pwa_enable_geolocation = fields.Boolean("Enable Geolocation")
    pwa_enable_camera = fields.Boolean("Enable Camera")
    pwa_enable_microphone = fields.Boolean("Enable Microphone")
    pwa_enable_voice_command_prep = fields.Boolean("Prepare Voice Commands")
    pwa_voice_auto_stop_seconds = fields.Integer("Voice Auto-stop (seconds)")
    pwa_enable_share = fields.Boolean("Enable Share")
    pwa_enable_sw_update = fields.Boolean("Enable Service Worker Update")

    @api.model
    def get_values(self):
        config_parameter_obj_sudo = self.env["ir.config_parameter"].sudo()
        res = super(ResConfigSettings, self).get_values()
        res["pwa_name"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.manifest.name", default="Odoo PWA")
        )
        res["pwa_short_name"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.manifest.short_name", default="Odoo")
        )
        pwa_icon_ir_attachment = (
            self.env["ir.attachment"]
            .sudo()
            .search([("url", "like", self._pwa_icon_url_base + ".")])
        )
        res["pwa_icon"] = (
            pwa_icon_ir_attachment.datas if pwa_icon_ir_attachment else False
        )
        res["pwa_background_color"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.manifest.background_color", default="#2E69B5")
        )
        res["pwa_theme_color"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.manifest.theme_color", default="#2E69B5")
        )
        res["pwa_enable_quick_actions"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.features.quick_actions", default="True") == "True"
        )
        res["pwa_enable_install_button"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.features.install_button", default="True") == "True"
        )
        res["pwa_enable_geolocation"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.features.geolocation", default="True") == "True"
        )
        res["pwa_enable_camera"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.features.camera", default="True") == "True"
        )
        res["pwa_enable_microphone"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.features.microphone", default="True") == "True"
        )
        res["pwa_enable_voice_command_prep"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.features.voice_command_prep", default="False") == "True"
        )
        res["pwa_voice_auto_stop_seconds"] = int(
            config_parameter_obj_sudo.get_param(
                "pwa.features.voice_auto_stop_seconds", default="5"
            )
        )
        res["pwa_enable_share"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.features.share", default="True") == "True"
        )
        res["pwa_enable_sw_update"] = (
            config_parameter_obj_sudo.get_param(
                "pwa.features.sw_update", default="True") == "True"
        )
        return res

    def _unpack_icon(self, icon):
        # Wrap decoded_icon in BytesIO object
        decoded_icon = base64.b64decode(icon)
        icon_bytes = io.BytesIO(decoded_icon)
        return Image.open(icon_bytes)

    def _normalize_png_icon(self, icon):
        image = self._unpack_icon(icon)
        width, height = image.size
        if width >= 512 and height >= 512:
            return icon

        # Keep original pixels and center the icon in a transparent square canvas.
        side = max(512, width, height)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        x = int((side - width) / 2)
        y = int((side - height) / 2)
        canvas.paste(image.convert("RGBA"), (x, y))

        output = io.BytesIO()
        canvas.save(output, format="PNG")
        return base64.b64encode(output.getvalue())

    def _touch_icon_version(self):
        self.env["ir.config_parameter"].sudo().set_param(
            "pwa.icon.version", fields.Datetime.now()
        )

    def _write_icon_to_attachment(self, extension, mimetype, size=None, icon_data=None):
        url = self._pwa_icon_url_base + extension
        icon = icon_data or self.pwa_icon
        # Resize image
        if size:
            image = self._unpack_icon(icon)
            resized_image = image.resize(size)
            icon_bytes_output = io.BytesIO()
            resized_image.save(icon_bytes_output, format=extension.lstrip(".").upper())
            icon = base64.b64encode(icon_bytes_output.getvalue())
            url = "%s%sx%s%s" % (
                self._pwa_icon_url_base,
                str(size[0]),
                str(size[1]),
                extension,
            )
        # Retreive existing attachment
        existing_attachment = (
            self.env["ir.attachment"].sudo().search([("url", "like", url)])
        )
        # Write values to ir_attachment
        values = {
            "datas": icon,
            "db_datas": icon,
            "url": url,
            "name": url,
            "type": "binary",
            "mimetype": mimetype,
        }
        # Rewrite if exists, else create
        if existing_attachment:
            existing_attachment.sudo().write(values)
        else:
            self.env["ir.attachment"].sudo().create(values)

    @api.model
    def set_values(self):
        config_parameter_obj_sudo = self.env["ir.config_parameter"].sudo()
        res = super(ResConfigSettings, self).set_values()
        config_parameter_obj_sudo.set_param(
            "pwa.manifest.name", self.pwa_name
        )
        config_parameter_obj_sudo.set_param(
            "pwa.manifest.short_name", self.pwa_short_name
        )
        config_parameter_obj_sudo.set_param(
            "pwa.manifest.background_color", self.pwa_background_color
        )
        config_parameter_obj_sudo.set_param(
            "pwa.manifest.theme_color", self.pwa_theme_color
        )
        config_parameter_obj_sudo.set_param(
            "pwa.features.quick_actions", str(bool(self.pwa_enable_quick_actions))
        )
        config_parameter_obj_sudo.set_param(
            "pwa.features.install_button", str(bool(self.pwa_enable_install_button))
        )
        config_parameter_obj_sudo.set_param(
            "pwa.features.geolocation", str(bool(self.pwa_enable_geolocation))
        )
        config_parameter_obj_sudo.set_param(
            "pwa.features.camera", str(bool(self.pwa_enable_camera))
        )
        config_parameter_obj_sudo.set_param(
            "pwa.features.microphone", str(bool(self.pwa_enable_microphone))
        )
        config_parameter_obj_sudo.set_param(
            "pwa.features.voice_command_prep",
            str(bool(self.pwa_enable_voice_command_prep)),
        )
        config_parameter_obj_sudo.set_param(
            "pwa.features.voice_auto_stop_seconds",
            str(max(1, self.pwa_voice_auto_stop_seconds or 5)),
        )
        config_parameter_obj_sudo.set_param(
            "pwa.features.share", str(bool(self.pwa_enable_share))
        )
        config_parameter_obj_sudo.set_param(
            "pwa.features.sw_update", str(bool(self.pwa_enable_sw_update))
        )
        # Retrieve previous value for pwa_icon from ir_attachment
        pwa_icon_ir_attachments = (
            self.env["ir.attachment"]
            .sudo()
            .search([("url", "like", self._pwa_icon_url_base)])
        )
        # Delete or ignore if no icon provided
        if not self.pwa_icon:
            if pwa_icon_ir_attachments:
                pwa_icon_ir_attachments.unlink()
                self._touch_icon_version()
            return res
        # Fail if icon provided is larger than 2mb
        if sys.getsizeof(self.pwa_icon) > 2196608:
            raise exceptions.UserError(
                _("You can't upload a file with more than 2 MB.")
            )
        # Confirm if the pwa_icon binary content is an SVG or PNG
        # and process accordingly
        decoded_pwa_icon = base64.b64decode(self.pwa_icon)
        # Full mimetype detection
        pwa_icon_mimetype = guess_mimetype(decoded_pwa_icon)
        pwa_icon_extension = "." + pwa_icon_mimetype.split("/")[-1].split("+")[0]
        if not pwa_icon_mimetype.startswith(
            "image/svg"
        ) and not pwa_icon_mimetype.startswith("image/png"):
            raise exceptions.UserError(_("You can only upload SVG or PNG files"))
        # Delete all previous records if we are writting new ones
        if pwa_icon_ir_attachments:
            pwa_icon_ir_attachments.unlink()
        icon_payload = self.pwa_icon
        if pwa_icon_extension == ".png":
            icon_payload = self._normalize_png_icon(icon_payload)

        self._write_icon_to_attachment(
            pwa_icon_extension,
            pwa_icon_mimetype,
            icon_data=icon_payload,
        )
        self._touch_icon_version()
        # write multiple sizes if not SVG
        if pwa_icon_extension != ".svg":
            for size in [
                (128, 128),
                (144, 144),
                (152, 152),
                (192, 192),
                (256, 256),
                (512, 512),
            ]:
                self._write_icon_to_attachment(
                    pwa_icon_extension,
                    pwa_icon_mimetype,
                    size=size,
                    icon_data=icon_payload,
                )
