# -*- coding: utf-8 -*-

from odoo import models, fields, api, _


class DemoRejectWizard(models.TransientModel):
    _name = 'demo.reject.wizard'
    _description = 'Demo Request Rejection Wizard'

    demo_request_id = fields.Many2one(
        'demo.request',
        string='Demo Request',
        required=True
    )
    rejection_reason = fields.Text(
        string='Rejection Reason',
        required=True,
        help='Please provide a reason for rejecting this request'
    )

    def action_reject(self):
        """Reject the demo request with the provided reason"""
        self.ensure_one()

        if not self.demo_request_id:
            return {'type': 'ir.actions.act_window_close'}

        # Get the rejected stage
        rejected_stage = self.env.ref('workflow_base.demo_stage_rejected', raise_if_not_found=False)

        if rejected_stage:
            # Update the request stage
            self.demo_request_id.write({
                'stage_id': rejected_stage.id
            })

            # Post the rejection reason as a message
            self.demo_request_id.message_post(
                body=_('<strong>Request Rejected</strong><br/>Reason: %s') % self.rejection_reason,
                message_type='comment',
                subtype_xmlid='mail.mt_note'
            )

        return {'type': 'ir.actions.act_window_close'}
