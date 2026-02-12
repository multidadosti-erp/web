// initial pager is located in source/addons/web/static/src/js/chrome/pager.js

odoo.define('refresher.pager', function(require) {
    'use strict';

    var AbstractController = require('web.AbstractController');
    var pager = require('web.Pager');
    var core = require('web.core');

    var _t = core._t;

    function _buildRefreshButton() {
        return $('<button>', {
            type: 'button',
            class: 'btn btn-secondary o_cp_refresh_button o_cp_refresh_button--accent',
            title: _t('Refresh'),
            'aria-label': _t('Refresh')
        }).append($('<i>', {class: 'fa fa-refresh'}));
    }
    pager.include({
        start: function() {
            return this._super();
        }
    });

    AbstractController.include({
        _renderControlPanelElements: function () {
            var elements = this._super.apply(this, arguments);
            if (!this.withControlPanel) {
                return elements;
            }

            var $refresh = _buildRefreshButton();
            $refresh.on('click', this._onRefreshClick.bind(this));

            var $switchButtons = elements.$switch_buttons || $();
            if ($switchButtons.find('.o_cp_refresh_button').length) {
                return elements;
            }

            if ($switchButtons.length) {
                elements.$switch_buttons = $refresh.add($switchButtons);
            } else {
                elements.$switch_buttons = $refresh;
            }
            return elements;
        },

        _onRefreshClick: function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (this._refreshInProgress) {
                return;
            }
            this._refreshInProgress = true;
            var $button = $(event.currentTarget);
            $button.prop('disabled', true).addClass('o_cp_refresh_button--loading');
            $button.find('.fa-refresh').addClass('fa-spin');

            var self = this;
            $.when(this.reload()).always(function () {
                self._refreshInProgress = false;
                if (self.isDestroyed()) {
                    return;
                }
                $button.prop('disabled', false).removeClass('o_cp_refresh_button--loading');
                $button.find('.fa-refresh').removeClass('fa-spin');
            });
        },
    });
});
