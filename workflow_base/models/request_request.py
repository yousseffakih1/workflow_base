from odoo import models, fields, api, exceptions, _
import json
import logging

from odoo.tools.convert import safe_eval

_logger = logging.getLogger(__name__)


class RequestRequest(models.Model):
    _name = "request.request"
    _description = "Request"

    def _default_type_id(self):
        type_id = self.env['request.type'].sudo().search([('model_id.model', '=', self._name)], limit=1)

        return type_id

    def _default_stage_id(self):
        type_id = self.env['request.type'].sudo().search([('model_id.model', '=', self._name)], limit=1)
        if type_id:
            return self.env['request.stage'].search([('type_id', '=', type_id.id)], limit=1)
        return False

    type_id = fields.Many2one(
        'request.type', 'Type stage', default=_default_type_id)
    stage_id = fields.Many2one(
        'request.stage', 'État', ondelete='restrict', group_expand='_read_group_stage_ids',
        required=True, index=True, tracking=True, copy=False, default=_default_stage_id)

    stage_id_color = fields.Selection(related='stage_id.color', string='État coleur')

    stage_route_out_json = fields.Char(
        compute='_compute_stage_route_out_json', readonly=True)
    can_readonly = fields.Boolean('Can readonly boolean', compute="_can_readonly_comput")
    can_readonly_json = fields.Json('Can readonly json', compute="_can_readonly_comput")
    active = fields.Boolean(default=True ,tracking=True,)


    def hook_next_stage(self):
        self.next_stage_by_id(self.env.context.get('route_id',False))

    def write(self, vals):

        res = super(RequestRequest, self).write(vals)
        if self.env.context.get('route_id',False):
            self.next_stage_by_id(self.env.context.get('route_id',False))
        return res

    @api.depends('stage_id')
    def _can_readonly_comput(self):
        for rec in self:
            if rec.stage_id and rec.stage_id.can_readonly:
                localdict = {
                    'rec': rec,
                    'self': self
                }
                res = safe_eval(rec.stage_id.can_readonly, localdict)
                if res.get('all', None) == None:
                    rec.can_readonly = False
                elif res.get('all', None):
                    rec.can_readonly = True
                else:
                    rec.can_readonly = False
                # for k in res :
                #     r.update({
                #         k : res[k]
                #     })

                rec.can_readonly_json = res
                print(rec.can_readonly_json)
            else:
                rec.can_readonly = False
                rec.can_readonly_json = {'ok':1}
                print('sd')


    @api.model
    def _read_group_stage_ids(self, stages, domain):
        type_id = self.env['request.type'].sudo().search([('model_id.model', '=', self._name)], limit=1)
        if type_id:
            return self.env['request.stage'].search([('type_id','=',type_id.id)])
        return self.env['request.stage'].search([])


    def next_stage_by_id(self,id_rout):
        route_id = self.env['request.stage.route'].browse(id_rout)
        if route_id:
            self.next_stage(route_id)



    def next_stage(self, route_id):
        if self.stage_id != route_id.stage_to_id:
            self.stage_id = route_id.stage_to_id

    def api_move_request(self, route_id):

        self.ensure_one()
        route = self.env['request.stage.route'].browse(route_id)
        if route in self.stage_id.route_out_ids:
            if route.action_id:
                action = route.action_id.with_context(active_model=self._name, active_ids=self.ids,
                                                      route_id=route.id).run()

                if action:
                    return action
                if route.stage_to_id:
                    self.stage_id = route.stage_to_id.id
                #return  True

            self.stage_id = route.stage_to_id.id
            return None

        raise exceptions.UserError(_(
            "Cannot move request (%(request)s) by this route (%(route)s)"
        ) % {
                                       'request': self.name,
                                       'route': route.display_name,
                                   })

    @api.depends('stage_id')
    def _compute_stage_route_out_json(self):
        for rec in self:
            routes = []

            for route in rec.stage_id.route_out_ids:
                try:
                    route._ensure_can_move(rec)
                except exceptions.AccessError:  # pylint: disable=except-pass
                    # We have to ignore routes that cannot be used
                    # to move request
                    pass
                except exceptions.UserError:
                    # In case of user error, we have to log this error,
                    # and make this route not available for user.
                    _logger.warning(
                        "Cannot check availability of route %s, skipping...",
                        route.display_name, exc_info=True)
                else:
                    # Add route to those allowed to move
                    if route.name:
                        route_name = route.name
                    else:
                        route_name = route.stage_to_id.name
                    routes += [{
                        'id': route.id,
                        'name': route_name,
                        'stage_to_id': route.stage_to_id.id,
                        'close': False,  # route.close,
                        'btn_class': route.btn_class,
                    }]

            rec.stage_route_out_json = json.dumps({'routes': routes})
