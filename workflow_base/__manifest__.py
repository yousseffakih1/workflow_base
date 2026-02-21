# -*- coding: utf-8 -*-
{
    'name': "Workflow Base",

    'summary': """
        Visual workflow builder for Odoo - Create and manage request workflows with drag & drop designer""",

    'description': """
Workflow Base - Visual Workflow Builder for Odoo
=================================================

This module provides a powerful and flexible workflow management system for Odoo 18.

Features:
---------
* **Visual Workflow Designer**: Drag & drop interface to create and manage workflows
* **Request Types**: Define different types of workflows for your business processes
* **Stages**: Configure workflow stages with colors, visibility, and readonly settings
* **Routes**: Define transitions between stages with conditions and actions
* **Access Control**: Control who can move requests through specific routes
* **Server Actions**: Trigger server actions when transitioning between stages
* **Inherit & Extend**: Easy to extend for your own models

Usage:
------
1. Go to Administration > Workflow Configuration > Request Types
2. Create a new Request Type and link it to your model
3. Use the Workflow Designer to visually create stages and routes
4. Inherit `request.request` in your model to enable workflow functionality

Example:
--------
```python
class MyRequest(models.Model):
    _name = 'my.request'
    _inherit = ['request.request', 'mail.thread']
    _description = 'My Request'

    name = fields.Char(string='Name', required=True)
    # Add your fields here
```
    """,

    'author': "Workflow Base Contributors",
    'website': "https://github.com/workflow-base/workflow_base",
    'license': 'LGPL-3',

    'category': 'Technical',
    'version': '18.0.1.0.0',

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
