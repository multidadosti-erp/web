# Copyright 2016 Serpent Consulting Services Pvt. Ltd
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
from odoo import http
from odoo.http import request


class WebFieldData(http.Controller):

    @http.route(['/web/fetch_x2m_data'], type='json', auth='public')
    def get_o2x_data(self, **kwargs):
        """Melhorias de performance:
           - Agrupa requisições por modelo e conjunto de campos solicitados, fazendo
             uma única leitura por grupo em vez de uma por registro.
           - Mantém a ordem dos ids no resultado e preserva comportamentos quando
             não há campos especificados.
        """
        o2x_records = kwargs.get('o2x_records', []) or []
        # Resultado final na mesma ordem de entrada
        o2x_datas = [None] * len(o2x_records)

        # Agrupar por (modelo, tuple(campos)) -> armazenar ids e referência aos registros
        groups = {}
        for idx, record in enumerate(o2x_records):
            o2x_model = record.get('relation')
            o2x_fields = tuple(record.get('options', {}).get('fields', []))
            o2x_ids = record.get('raw_value') or []

            if not o2x_model or not o2x_ids:
                o2x_datas[idx] = []
                continue

            key = (o2x_model, o2x_fields)
            entry = groups.setdefault(key, {'ids': set(), 'refs': []})
            entry['ids'].update(o2x_ids)
            entry['refs'].append((idx, list(o2x_ids)))

        # Executar uma leitura por grupo e distribuir os resultados para cada registro
        for (o2x_model, o2x_fields), entry in groups.items():
            ids = list(entry['ids'])
            o2x_obj = request.env[o2x_model]

            # Se campos foram explicitamente fornecidos, ler apenas esses campos.
            # Caso contrário, usamos search_read com lista vazia para reproduzir
            # o comportamento original (depende da versão do Odoo).
            if o2x_fields:
                records_data = o2x_obj.browse(ids).read(list(o2x_fields))
            else:
                records_data = o2x_obj.search_read([('id', 'in', ids)], [])

            # Mapear id -> dados
            map_by_id = {rec['id']: rec for rec in records_data}

            # Preencher resultados na ordem original de cada registro
            for idx, ids_list in entry['refs']:
                o2x_datas[idx] = [map_by_id[i] for i in ids_list if i in map_by_id]

        return o2x_datas
