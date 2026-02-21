# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.



from odoo import api, models, tools, _


import  odoo
from odoo.exceptions import UserError


class BaseModel(models.AbstractModel):
    _inherit = 'base'

    #def unlink(self):
    #    if self._name not in (
    #    'account.analytic.line', 'stock.move.line', 'ir.default', 'mail.mail', 'mail.partner.device', 'stock.quant',
    #    'mail.message', 'ir.module.addons.path', 'mail.message.translation' ,'mail.activity','ir.model.data','ir.attachment','stock.move'):

    #        print(self.env.user)
    #        print(odoo.SUPERUSER_ID)
    #        if self.env.user.id != odoo.SUPERUSER_ID:
    #            raise UserError(_("Il est impossible de supprimer ces données. %s (%s)", str(self.mapped('display_name')), self._name))
    #    return super().unlink()