# Copyright 2026
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).

from odoo import fields, models


class WebPWAMobileLog(models.Model):
    _name = "web.pwa.mobile.log"
    _description = "Web PWA Mobile Log"
    _order = "captured_at desc, id desc"

    event_type = fields.Selection(
        selection=[
            ("geolocation", "Geolocation"),
            ("camera", "Camera"),
            ("microphone", "Microphone"),
        ],
        required=True,
        index=True,
    )
    user_id = fields.Many2one(
        comodel_name="res.users",
        required=True,
        index=True,
        default=lambda self: self.env.user,
        ondelete="cascade",
    )
    captured_at = fields.Datetime(required=True, default=fields.Datetime.now, index=True)

    latitude = fields.Float(digits=(10, 6))
    longitude = fields.Float(digits=(10, 6))
    accuracy = fields.Float()
    country = fields.Char()
    state = fields.Char()
    city = fields.Char()
    suburb = fields.Char()
    road = fields.Char()
    postcode = fields.Char()
    display_name = fields.Char()

    image = fields.Binary(attachment=True)
    image_mimetype = fields.Char()
    transcript = fields.Text()
    transcript_lang = fields.Char()
    command_intent = fields.Char()
    command_confidence = fields.Float(digits=(3, 2))
    command_status = fields.Selection(
        selection=[("draft", "Draft"), ("ready", "Ready"), ("ignored", "Ignored")],
        default="draft",
    )
    command_payload = fields.Text()

    user_agent = fields.Char()
    note = fields.Char()
