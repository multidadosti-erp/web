/* Copyright 2019 Onestein
 * License AGPL-3.0 or later (https://www.gnu.org/licenses/agpl). */

odoo.define('web_group_by_percentage', function (require) {
    "use strict";

    var ListRenderer = require('web.ListRenderer'),
        BasicModel = require('web.BasicModel');

    ListRenderer.include({
        /**
         * Renderiza a porcentagem na linha do grupo.
         *
         * @override
         * @param {Object} group - O grupo de dados a ser renderizado.
         * @returns {jQuery} - A linha do grupo renderizada.
         */
        _renderGroupRow: function (group) {
            var self = this;
            var res = this._super.apply(this, arguments);
            _.each(group.aggregatePercentages, function (percentage, field) {
                var cellIndex = _.findIndex(self.columns, function (column) {
                    return field === column.attrs.name;
                });

                if (cellIndex !== -1) {
                    var $cell = $(res.find('td').get(cellIndex - 1));
                    if ($cell.length) {
                        var $b = $('<span>', {
                            class: 'web_group_by_percentage',
                            html: _.str.sprintf(' (%s%%)', percentage.toFixed(2)),
                            'data-percentage': percentage
                        });
                        $cell.append($b);
                    }
                }});
            return res;
        },
    });

    BasicModel.include({
        /**
         * Adiciona aggregatePercentages ao resultado.
         *
         * @override
         * @returns {Object} - O resultado com aggregatePercentages adicionados.
         */
        get: function () {
            var result = this._super.apply(this, arguments);
            if (result && result.id && this.localData[result.id] && this.localData[result.id].aggregatePercentages) {
                result.aggregatePercentages = this.localData[result.id].aggregatePercentages;
            }
            return result;
        },
        
        /**
         * Calcula as porcentagens.
         *
         * @override
         * @returns {Deferred} - A promessa que representa a leitura do grupo.
         */
        _readGroup: function () {
            var self = this,
                res = this._super.apply(this, arguments);

            res.done(function (list) {
                // Calcula os totais
                var sums = _.reduce(list.data, function (acc, groupId) {
                    var group = self.get(groupId);
                    _.each(group.aggregateValues, function (value, field) {
                        acc[field] = (acc[field] || 0) + value;
                    });
                    return acc;
                }, {});

                // Calcula as porcentagens
                _.each(list.data, function (groupId) {
                    var group = self.get(groupId),
                        aggregatePercentages = {};
                    _.each(sums, function (sum, field) {
                        var percentage = sum ? (group.aggregateValues[field] / sum) * 100 : 0;
                        aggregatePercentages[field] = percentage;
                    });
                    self.localData[groupId].aggregatePercentages = aggregatePercentages;
                });
            });

            return res;
        },
    });
});
