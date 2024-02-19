# Copyright 2016 Serpent Consulting Services Pvt. Ltd
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
from odoo import http
from odoo.http import request


class WebFieldData(http.Controller):

    @http.route(['/web/fetch_x2m_data'], type='json', auth='public')
    def get_o2x_data(self, **kwargs):
        """ - Obtém valores dos registros contidos em um campo relacional
        one2many, para a formatação no kanban.
        - Quando os campos de um registro são renderizados no kanban, os campos
        one2many carregados para o kanban, tem uma lista com os IDS dos registros
        relacionados. Essa função obtém os valores desses objetos relacionados.

        - Nota Multidados: Foi adicionado a possibilidade de deixar explícito
            os campos a carregar dos objetos relacionados. Essa melhoria resolve
            um importante problema de performance. No XML basta informar no atributo
            'options' do campo relacional, informando os campos a partir da chave
            'fields'.
            Exemplo: <field name="line_ids" options="{'fields': ['name', 'qty', 'value']}">

        Returns:
            list: lista dos valores dos registros relacionados a partir de um
                campo relacional 'one2many'.
        """
        o2x_records = kwargs.get('o2x_records')
        o2x_datas = []

        # Cada record são os valores do campo renderizado para QWeb
        for record in o2x_records:
            # Campos a ler os valores dos registros relacionados
            o2x_fields = record.get('options', dict()).get('fields', [])

            # Tabela que o campo relacional se relaciona
            o2x_model = record.get('relation', False)

            # Ids dos registros relacionados
            o2x_ids = record.get('raw_value', False)

            if o2x_model:
                # Leitura dos objetos relacionados pelo campo one2many
                o2x_obj = request.env[o2x_model]
                o2x_datas.append(o2x_obj.search_read([('id', 'in', o2x_ids)], o2x_fields))
        return o2x_datas
