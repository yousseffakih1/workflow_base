# -*- coding: utf-8 -*-

from odoo import models, fields, api


class DemoRequest(models.Model):
    _name = "demo.request"
    _description = "Demo Request"
    _inherit = ["request.request", "mail.thread", "mail.activity.mixin"]
    _order = "id desc"

    def _default_type_id(self):
        return self.env.ref('workflow_base.demo_request_type', raise_if_not_found=False)

    def _default_stage_id(self):
        return self.env.ref('workflow_base.demo_stage_draft', raise_if_not_found=False)

    reference = fields.Char(
        string='Reference',
        required=True,
        copy=False,
        readonly=True,
        default=lambda self: ('New')
    )
    name = fields.Char(string='Subject', required=True, tracking=True)
    description = fields.Html(string='Description')
    date_request = fields.Date(
        string='Request Date',
        default=fields.Date.context_today,
        tracking=True
    )
    user_id = fields.Many2one(
        'res.users',
        string='Requester',
        default=lambda self: self.env.user,
        tracking=True
    )
    priority = fields.Selection([
        ('0', 'Low'),
        ('1', 'Normal'),
        ('2', 'High'),
        ('3', 'Urgent'),
    ], string='Priority', default='1', tracking=True)

    type_id = fields.Many2one(default=_default_type_id)
    stage_id = fields.Many2one(default=_default_stage_id)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('reference', 'New') == 'New':
                vals['reference'] = self.env['ir.sequence'].next_by_code('demo.request') or 'New'
        return super().create(vals_list)

    def name_get(self):
        result = []
        for record in self:
            name = f"[{record.reference}] {record.name}" if record.reference else record.name
            result.append((record.id, name))
        return result
