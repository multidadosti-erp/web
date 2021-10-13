# Copyright 2019 Brainbean Apps (https://brainbeanapps.com)
# License AGPL-3.0 or later (https://www.gnu.org/licenses/agpl.html).

from odoo import api, models


class WebWidgetDropdownDynamic(models.Model):
    _name = 'web.widget.dropdown.dynamic'
    _description = 'Web Widget Dropdown Dynamic'

    @api.model
    def values_char_field(self):
        options = self.env.context.get('options').strip().split('\n')
        return list(map(
            lambda option: (option, option),
            filter(
                lambda option: bool(option),
                options
            )
        ))

    @api.model
    def values_int_field(self):
        min_value = int(self.env.context.get('min'))
        max_value = int(self.env.context.get('max'))
        options = []
        for value in range(min_value, max_value + 1):
            options.append((value, str(value)))
        return options

    @api.model
    def values_selection_field(self):
        options = self.env.context.get('options').strip().split('\n')
        return list(map(
            lambda option: (option, option),
            filter(
                lambda option: bool(option),
                options
            )
        ))
