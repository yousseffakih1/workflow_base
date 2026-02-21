# -*- coding: utf-8 -*-
{
    'name': "Approval Workflow Engine - BPM Process Designer",

    'summary': "Approval workflow, BPM, state machine, process automation, visual designer, stages & transitions",

    'description': """
Workflow Base - Visual Workflow Builder for Odoo 19
====================================================

A powerful and flexible visual workflow management system for Odoo 19.
Design complex approval workflows with an intuitive drag-and-drop interface.

KEY FEATURES
------------
* Visual Workflow Designer - Drag & drop stages and routes on a canvas (JointJS)
* Request Types - Create different workflow types for any Odoo model
* Configurable Stages - Colors, visibility, draft/done flags, readonly controls
* Flexible Routes - Transitions with button styles, descriptions, conditions
* Access Control - Restrict routes by user groups or specific users
* Server Actions - Trigger wizards, emails, or custom code on transitions
* Easy Integration - Simple Python inheritance to add workflows to any model
* Demo Module - Complete demo.request example included

WORKFLOW CONFIGURATION
----------------------
1. Settings > Workflow Configuration > Request Types
2. Create a Request Type linked to your model
3. Use the visual Workflow Designer tab
4. Configure stages (colors, readonly, visibility)
5. Define routes (buttons, permissions, actions)

QUICK START
-----------
Inherit request.request in your model:

    class MyRequest(models.Model):
        _name = 'my.request'
        _inherit = ['request.request', 'mail.thread']

        name = fields.Char(required=True)

Add to your form view:

    <field name="stage_route_out_json" widget="stage_route_out_widget"/>
    <field name="stage_id" widget="statusbar"/>
    <field name="name" readonly="can_readonly"/>

DEMO WORKFLOW
-------------
* 5 Stages: Draft > Pending > Approved/Rejected > Completed
* 5 Routes: Submit, Approve, Reject (with wizard), Complete, Reset
* Readonly fields after submission
* Kanban view with stage grouping
    """,

    'author': "Sappinov",
    'website': "https://github.com/workflow-base/workflow_base",
    'license': 'LGPL-3',

    'category': 'Technical',
    'version': '19.0.1.0.0',

    'price': 100,
    'currency': 'EUR',

    'images': [
        'static/description/captures/2.png',
        'static/description/captures/12.png',
        'static/description/captures/8.png',
    ],

    'depends': ['base', 'mail'],

    'data': [
        'security/ir.model.access.csv',
        'wizard/demo_reject_wizard.xml',
        'views/request_type.xml',
        'views/request_stage.xml',
        'views/request_stage_route.xml',
        'views/request_request.xml',
        'views/demo_request.xml',
        'views/menu.xml',
        'demo/demo_data.xml',
    ],

    'demo': [],

    'assets': {
        'web.assets_backend': [
            # JointJS Dependencies
            ('include', 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js'),
            ('include', 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js'),
            ('include', 'https://cdnjs.cloudflare.com/ajax/libs/backbone.js/1.4.1/backbone-min.js'),
            ('include', 'https://cdnjs.cloudflare.com/ajax/libs/jointjs/3.7.5/joint.min.js'),
            ('include', 'https://cdnjs.cloudflare.com/ajax/libs/jointjs/3.7.5/joint.css'),

            # Stage Buttons Widget
            'workflow_base/static/src/js/stage_route_out/stage_buttons.js',
            'workflow_base/static/src/js/stage_route_out/stage_buttons.xml',
            'workflow_base/static/src/js/stage_route_out/stage_buttons.scss',

            # Workflow Graph Widget
            'workflow_base/static/src/js/workflow_graph/workflow_graph.js',
            'workflow_base/static/src/js/workflow_graph/workflow_graph.xml',
            'workflow_base/static/src/js/workflow_graph/workflow_graph.scss',
        ],
    },

    'installable': True,
    'application': False,
    'auto_install': False,
}
