from odoo import models, fields, api, exceptions,_

class RequestType(models.Model):
    _name = "request.type"
    _description = "Request Type"

    name = fields.Char()
    active = fields.Boolean(default=True)
    model_id = fields.Many2one('ir.model', string='Modèle')
    stage_ids = fields.One2many('request.stage', 'type_id', string='Stages', ondelete='cascade')
    route_ids = fields.One2many('request.stage.route', 'type_id', string='Routes', ondelete='cascade')
    workflow_graph = fields.Text(string='Workflow Graph', default='{}')