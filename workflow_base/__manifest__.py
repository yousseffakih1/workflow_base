# -*- coding: utf-8 -*-
{
    'name': "add_base",

    'summary': """
        Short (1 phrase/line) summary of the module's purpose, used as
        subtitle on modules listing or apps.openerp.com""",

    'description': """
        Long description of module's purpose
    """,

    'author': "My Company",
    'website': "https://www.yourcompany.com",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/16.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Uncategorized',
    'version': '18.0.0.1',
    'license': 'LGPL-3',

    # any module necessary for this one to work correctly
    'depends': ['base','hr'],

    # always loaded
    'data': [
        'security/ir.model.access.csv',
        'security/security.xml',
      
        'views/res_country_province.xml',
        'views/res_country_collective.xml',
        'views/res_country_state.xml',
        'views/fleet_location.xml',
       
     
        # 'views/mission_order.xml',
        'views/menu.xml',
        'views/request_request.xml',
        'views/request_stype.xml',
        'views/request_stage.xml',
        'views/request_stage_route.xml',
    ],
    'assets': {
        'web.assets_backend': [
            # JointJS Dependencies
            ('include', 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js'),
            ('include', 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js'),
            ('include', 'https://cdnjs.cloudflare.com/ajax/libs/backbone.js/1.4.1/backbone-min.js'),
            ('include', 'https://cdnjs.cloudflare.com/ajax/libs/jointjs/3.7.5/joint.min.js'),
            ('include', 'https://cdnjs.cloudflare.com/ajax/libs/jointjs/3.7.5/joint.css'),
            
            # Existing widgets
            'add_base/static/src/js/stage_route_out/stage_buttons.js',
            'add_base/static/src/js/stage_route_out/stage_buttons.xml',
            
            # Workflow Graph Widget
            'add_base/static/src/js/workflow_graph/workflow_graph.js',
            'add_base/static/src/js/workflow_graph/workflow_graph.xml',
            'add_base/static/src/js/workflow_graph/workflow_graph.scss',
        ],
    },
}
