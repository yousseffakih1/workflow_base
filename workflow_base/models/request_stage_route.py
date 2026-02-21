from odoo import models, fields, api, exceptions,_
from odoo.tools.convert import safe_eval


class RequestStageRoute(models.Model):
    _name = "request.stage.route"
    _description = "Request Stage Route"
    _order = "sequence"

    name = fields.Char(readonly=False, translate=True)
    active = fields.Boolean(default=True)
    sequence = fields.Integer(
        default=5, index=True, required=True, tracking=True)
    description = fields.Char('Description')
    type_id = fields.Many2one('request.type', string="Type")
    model_id = fields.Many2one(related='type_id.model_id', string='Model', store=True)
    stage_from_id = fields.Many2one(
        'request.stage', 'From', ondelete='restrict',
        required=True, index=True, tracking=True,
        domain="[('type_id', '=', type_id)]")
    stage_to_id = fields.Many2one(
        'request.stage', 'To', ondelete='restrict',
        required=True, index=True, tracking=True,
        domain="[('type_id', '=', type_id)]")
    action_id = fields.Many2one('ir.actions.server', string="Action", domain="[('model_id', '=', type_id.model_id)]")

    allowed_group_ids = fields.Many2many(
        'res.groups', string='Allowed groups',
        help="If the field is empty, then the restrictions are not applied."
             " If the field is filled, only users belonging to any"
             " of the specified groups will be able to move the request"
             " along this route.")
    allowed_user_ids = fields.Many2many(
        'res.users', string='Allowed users',
        help="If the field is empty, then the restrictions are not applied."
             " If the field is filled, only the specified users will be abble"
             " to move the request along this route.")
    condition_invisible =  fields.Char("Condition visible bouton")
    btn_class = fields.Char('Btn Class', default="btn-primary")

    def _ensure_can_move(self, request):
        self.ensure_one()

        if self.env.su:
            # no access rights checks for superuser
            return

        # Access rights checks (user & group)
        not_allowed_by_user = (
                self.allowed_user_ids and
                self.env.user not in self.allowed_user_ids)
        not_allowed_by_group = (
                self.allowed_group_ids and
                not self.allowed_group_ids & self.env.user.groups_id)
        not_allowed_by_condition = False
        if self.condition_invisible:
            localdict = {
                    'rec':request.sudo(),
                    'self':self.sudo()
            }
            res = safe_eval(self.condition_invisible, localdict)
            if not res :
                not_allowed_by_condition = True

        if not_allowed_by_user or not_allowed_by_group  or not_allowed_by_condition:
            raise exceptions.AccessError(
                _(
                    "This stage change '%(route)s' restricted by "
                    "access rights.\n"
                    "Request: %(request)s\n"
                ) % {
                    'route': self.display_name,
                    'request': request.sudo().display_name,

                }
            )