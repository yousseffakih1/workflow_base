from random import randint

from odoo import models, fields, api, exceptions,_

class RequestStage(models.Model):
    _name = "request.stage"
    _description = "Request Stage"
    _order = "sequence asc,id"


    def _default_color(self):
        return randint(1, 11)

    name = fields.Char()
    active = fields.Boolean(default=True)
    sequence = fields.Integer(default=5, index=True)
    type_id = fields.Many2one('request.type', string="Type")
    visible = fields.Boolean('Visible', default=True)
    route_in_ids = fields.One2many(
        'request.stage.route', 'stage_to_id', 'Incoming routes' )
    route_out_ids = fields.One2many(
        'request.stage.route', 'stage_from_id', 'Outgoing routes')
    can_readonly = fields.Text("Can readonly")
    is_draft = fields.Boolean("Est Brouillon")
    is_done = fields.Boolean("Est terminer")
    color = fields.Selection([
        ('0', 'Non'),
        ('1', 'Rouge'),
        ('2', 'Bleue'),
        ('3', 'Grise'),
        ('4', 'Violette'),
        ('5', 'Verte'),
        ('6', 'Brun'),

    ], string="Coleur", default='1')
    
    # Position dans le graphique de workflow
    position_x = fields.Float('Position X', default=0.0)
    position_y = fields.Float('Position Y', default=0.0)
