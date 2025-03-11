odoo.define("web.web_group_expand", function(require) {
    "use strict";

    var qweb = require("web.core").qweb;
    var ListController = require("web.ListController");
    var ListRenderer = require("web.ListRenderer");

    ListController.include({
        start: function () {
            this.$expandGroupButtons = $(qweb.render("web_group_expand.Buttons"));
            this.$expandGroupButtons.find("#oe_group_by_expand").on(
                "click", this.expandAllGroups.bind(this)
            );
            this.$expandGroupButtons.find("#oe_group_by_collapse").on(
                "click", this.collapseAllGroups.bind(this)
            );
            return this._super.apply(this, arguments);
        },

        renderPager: function ($node) {
            this._super.apply(this, arguments);
            this.$expandGroupButtons.toggleClass("o_hidden", !this.renderer.isGrouped);
            $node.append(this.$expandGroupButtons);
        },

        expandAllGroups: function () {
            var layer = this.renderer.state.data;
            while (layer.length) {
                var closed = this._getClosedGroups(layer);
                if (closed.length) {
                    this._toggleGroups(closed);
                    break;
                }
                layer = this._getNextLayer(layer);
            }
        },

        collapseAllGroups: function () {
            var layer = this._getOpenGroups(this.renderer.state.data);
            while (layer.length) {
                var next = this._getOpenGroups(this._getNextLayer(layer));
                if (!next.length) {
                    this._toggleGroups(layer);
                    break;
                }
                layer = next;
            }
        },

        _toggleGroups: function (groups) {
            var self = this;
            /**
             * Mapeia os grupos e alterna o estado de cada grupo.
             * 
             * @param {Array} groups - Lista de grupos a serem alternados.
             * @returns {Array} defs - Lista de promessas que representam a alternância de cada grupo.
             */
            var defs = groups.map(function (group) {
                return self.model.toggleGroup(group.id);
            });
            $.when(...defs).then(this.update.bind(this, {}, {keepSelection: true, reload: false}));
        },

        _getClosedGroups: function (layer) {
            return layer.filter(function (group) { return !group.isOpen; });
        },

        _getOpenGroups: function (layer) {
            return layer.filter(function (group) { return group.isOpen; });
        },

        _getNextLayer: function (layer) {
            return _.flatten(layer.map(function (group) { return group.data; }), true);
        }
    });

    ListRenderer.include({
        updateState: function () {
            var res = this._super.apply(this, arguments);
            $("nav.oe_group_by_expand_buttons").toggleClass("o_hidden", !this.isGrouped);
            return res;
        },
    });
});
