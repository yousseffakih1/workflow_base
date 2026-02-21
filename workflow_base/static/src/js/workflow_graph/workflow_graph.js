/** @odoo-module **/

import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { Component, onMounted, useRef, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

export class WorkflowGraphField extends Component {
    static template = "add_base.WorkflowGraphWidget";
    static props = {
        ...standardFieldProps,
    };

    setup() {
        this.graphRef = useRef("graph");
        this.graph = null;
        this.paper = null;
        this.isUpdating = false;
        this.isConnecting = false;
        this.sourceElement = null;
        this.dialog = useService("dialog");
        this.orm = useService("orm");
        this.notification = useService("notification");
        
        // Variables pour le zoom et le pan
        this.currentScale = 1;
        this.currentPan = { x: 0, y: 0 };
        
        this.state = useState({
            selectedElement: null,
            selectedElementType: null,
            selectedElementName: null,
            selectedElementDetails: {},
            selectedLink: null,
            selectedLinkName: null,
            selectedLinkFrom: null,
            selectedLinkTo: null,
            selectedLinkDetails: {},
            isEmpty: true
        });
        
        onMounted(async () => {
            // Patch SVGMatrix.prototype.translate pour éviter les erreurs avec des valeurs non-finies
            if (typeof SVGMatrix !== 'undefined' && SVGMatrix.prototype && !SVGMatrix.prototype._patchedTranslate) {
                const originalTranslate = SVGMatrix.prototype.translate;
                SVGMatrix.prototype.translate = function(x, y) {
                    const safeX = (typeof x === 'number' && isFinite(x)) ? x : 0;
                    const safeY = (typeof y === 'number' && isFinite(y)) ? y : 0;
                    if (safeX !== x || safeY !== y) {
                        console.warn('SVGMatrix.translate received invalid values, corrected:', { original: {x, y}, corrected: {x: safeX, y: safeY} });
                    }
                    return originalTranslate.call(this, safeX, safeY);
                };
                SVGMatrix.prototype._patchedTranslate = true;
            }

            // Patch DOMMatrix aussi (utilisé dans les navigateurs modernes)
            if (typeof DOMMatrix !== 'undefined' && DOMMatrix.prototype && !DOMMatrix.prototype._patchedTranslateSelf) {
                const originalTranslateSelf = DOMMatrix.prototype.translateSelf;
                if (originalTranslateSelf) {
                    DOMMatrix.prototype.translateSelf = function(tx, ty, tz) {
                        const safeTx = (typeof tx === 'number' && isFinite(tx)) ? tx : 0;
                        const safeTy = (typeof ty === 'number' && isFinite(ty)) ? ty : 0;
                        const safeTz = (typeof tz === 'number' && isFinite(tz)) ? tz : 0;
                        if (safeTx !== tx || safeTy !== ty) {
                            console.warn('DOMMatrix.translateSelf received invalid values, corrected:', { original: {tx, ty, tz}, corrected: {tx: safeTx, ty: safeTy, tz: safeTz} });
                        }
                        return originalTranslateSelf.call(this, safeTx, safeTy, safeTz);
                    };
                    DOMMatrix.prototype._patchedTranslateSelf = true;
                }
            }

            await this.loadJointJS();
            await this.initializeGraph();
            this.loadGraph();
            
            // Ajouter le gestionnaire d'événements pour la suppression des liens
            if (this.paper) {
                this.paper.on('link:pointerdown', (linkView, evt) => {
                    // Vérifier si le clic est sur le bouton de suppression
                    if (evt.target.classList.contains('link-remove-button')) {
                        const link = linkView.model;
                        if (link.route_id) {
                            // Demander confirmation
                            this.dialog.add(ConfirmationDialog, {
                                title: _t("Confirmation"),
                                body: _t("Voulez-vous vraiment supprimer cette route ?"),
                                confirm: async () => {
                                    try {
                                        // Supprimer la route dans Odoo
                                        await this.orm.unlink('request.stage.route', [link.route_id]);
                                        // Supprimer le lien du graphe
                                        link.remove();
                                    } catch (error) {
                                        console.error('Error removing route:', error);
                                    }
                                },
                                cancel: () => {}
                            });
                        } else {
                            // Si pas de route_id, supprimer directement le lien
                            link.remove();
                        }
                    }
                });
            }
        });
    }

    async loadJointJS() {
        // Charger jQuery d'abord
        if (!window.jQuery) {
            await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js');
        }
        
        // Puis Lodash
        if (!window._) {
            await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js');
        }
        
        // Puis Backbone
        if (!window.Backbone) {
            await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/backbone.js/1.4.1/backbone-min.js');
        }
        
        // Enfin JointJS
        if (!window.joint) {
            await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jointjs/3.7.5/joint.min.js');
            await this.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/jointjs/3.7.5/joint.css');
        }

        // Attendre un peu pour s'assurer que tout est bien chargé
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    loadCSS(href) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`link[href="${href}"]`)) {
                resolve();
                return;
            }
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }

    async initializeGraph() {
        if (!window.joint) {
            console.error('JointJS not loaded');
            return;
        }

        const namespace = window.joint.shapes;
        
        // Création du graphe
        this.graph = new window.joint.dia.Graph({}, { cellNamespace: namespace });
        
        // Obtenir les dimensions du conteneur
        const containerWidth = this.graphRef.el.clientWidth || 800;
        const containerHeight = this.graphRef.el.clientHeight || 600;
        
        // Création du paper (zone de dessin) avec des dimensions plus grandes pour le scroll
        this.paper = new window.joint.dia.Paper({
            el: this.graphRef.el,
            model: this.graph,
            width: Math.max(containerWidth, 2000),
            height: Math.max(containerHeight, 1500),
            gridSize: 1,  // Désactiver le snap to grid (était 10)
            drawGrid: false,  // Désactiver l'affichage de la grille
            snapLinks: false,  // Désactiver le snap des liens
            linkPinning: false,  // Empêcher les liens de flotter
            background: {
                color: '#fafafa'
            },
            cellViewNamespace: namespace,
            defaultLink: () => {
                return new window.joint.shapes.standard.Link({
                    attrs: {
                        line: {
                            stroke: '#666',
                            strokeWidth: 2,
                            strokeDasharray: '5 3',
                            targetMarker: {
                                type: 'path',
                                d: 'M 10 -5 0 0 10 5 Z',
                                fill: '#666',
                                stroke: '#666'
                            }
                        }
                    },
                    connector: { name: 'smooth' },
                    router: { name: 'normal' },
                    labels: [{
                        position: 0.5,
                        attrs: {
                            rect: {
                                fill: 'white',
                                stroke: '#666',
                                strokeWidth: 1,
                                rx: 12,
                                ry: 12,
                                width: 120,
                                height: 30,
                                x: -60,
                                y: -15
                            },
                            text: {
                                text: 'Action',
                                fill: '#333',
                                fontSize: 14,
                                fontWeight: 500,
                                textAnchor: 'middle',
                                textVerticalAnchor: 'middle',
                                x: 0,
                                y: 0
                            },
                             
                        },
                        markup: [
                            {
                                tagName: 'rect',
                                selector: 'rect'
                            },
                            {
                                tagName: 'text',
                                selector: 'text'
                            },
                             
                        ]
                    }],
                });
            },
            interactive: {
                vertexAdd: false,
                addLinkFromMagnet: !this.props.readonly,
                linkMove: !this.props.readonly,
                elementMove: !this.props.readonly,
                validateConnection: (cellViewS, magnetS, cellViewT, magnetT, _end, linkView) => {
                    if (!magnetS || !magnetT) return false;
                    if (cellViewS === cellViewT) return false;
                    if (this.graph.getLinks().some(link => 
                        (link.get('source').id === cellViewS.model.id && link.get('target').id === cellViewT.model.id)
                    )) return false;

                    setTimeout(() => {
                        try {
                            const link = linkView.model;
                            this.promptLinkLabel(link);
                        } catch (e) {
                            console.warn('Error in validateConnection promptLinkLabel:', e);
                        }
                    }, 100);

                    return true;
                },
                validateMagnet: (_cellView, magnet) => {
                    return magnet && magnet.getAttribute('port-group') === 'ports';
                }
            }
        });

        // S'assurer que le paper a une transformation valide
        this.paper.scale(1, 1);
        this.paper.translate(0, 0);

        // Intercepter les erreurs de transformation SVG
        const origTranslate = this.paper.translate.bind(this.paper);
        this.paper.translate = (tx, ty) => {
            // Si appelé sans arguments, c'est un getter - laisser passer
            if (tx === undefined && ty === undefined) {
                return origTranslate();
            }
            if (isFinite(tx) && isFinite(ty)) {
                return origTranslate(tx, ty);
            }
            console.warn('Blocked invalid translate:', tx, ty);
            return origTranslate(); // Retourner l'état actuel au lieu de bloquer
        };

        const origScale = this.paper.scale.bind(this.paper);
        this.paper.scale = (sx, sy, ox, oy) => {
            // Si appelé sans arguments, c'est un getter - laisser passer
            if (sx === undefined) {
                return origScale();
            }
            // Si sy n'est pas défini, utiliser sx pour les deux
            const safeY = sy === undefined ? sx : sy;
            if (isFinite(sx) && isFinite(safeY) && (ox === undefined || isFinite(ox)) && (oy === undefined || isFinite(oy))) {
                return origScale(sx, safeY, ox, oy);
            }
            console.warn('Blocked invalid scale:', sx, sy, ox, oy);
            return origScale(); // Retourner l'état actuel au lieu de bloquer
        };

        // Ajouter les outils de lien
        const linkTools = new window.joint.dia.ToolsView({
            tools: [
                new window.joint.linkTools.Remove({
                    distance: 0.5,
                    offset: { x: 40, y: -20 }, // Position en haut à droite du texte
                    markup: [{
                        tagName: 'circle',
                        selector: 'button',
                        attributes: {
                            'r': 7,
                            'fill': '#f6f6f6',
                            'stroke': '#ff5555',
                            'stroke-width': 2,
                            'cursor': 'pointer'
                        }
                    }, {
                        tagName: 'path',
                        selector: 'icon',
                        attributes: {
                            'd': 'M -3 -3 3 3 M -3 3 3 -3',
                            'fill': 'none',
                            'stroke': '#ff5555',
                            'stroke-width': 2,
                            'pointer-events': 'none'
                        }
                    }]
                })
            ]
        });

        // Ajouter les outils aux liens lors du survol
        this.paper.on('link:mouseenter', (linkView) => {
            linkView.addTools(linkTools);
        });

        this.paper.on('link:mouseleave', (linkView) => {
            linkView.removeTools();
        });


        // Événements du paper

        // Valider la position avant le début du drag pour éviter les erreurs SVGMatrix
        this.paper.on('element:pointerdown', (elementView) => {
            const element = elementView.model;
            const pos = element.get('position');
            if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) {
                // Corriger la position invalide avant le drag
                element.set('position', { x: 100, y: 100 }, { silent: true });
                console.warn('Corrected invalid position before drag for element:', element.id);
            }
        });

        this.paper.on('element:pointerclick', (elementView) => {
            this.unselectAll();
            this.selectElement(elementView.model);
        });

        this.paper.on('link:pointerclick', (linkView) => {
            this.unselectAll();
            this.selectLink(linkView.model);
        });

        this.paper.on('blank:pointerclick', () => {
            this.unselectAll();
        });


        // Double-clic pour ouvrir le formulaire d'édition
        this.paper.on('element:pointerdblclick', async (elementView) => {
            const element = elementView.model;
            if (element.stage_id) {
                this.openStageEditWizard(element);
            } else {
                // Nouvel élément, il faut d'abord le créer
                await this.createAndEditStage(element);
            }
        });

        // Ajouter l'événement link:connect
        this.paper.on('link:connect', (linkView) => {
            const link = linkView.model;
            this.promptLinkLabel(link);
        });

        // Double-clic sur les liens pour ouvrir le formulaire d'édition
        this.paper.on('link:pointerdblclick', (linkView, _evt) => {
            const link = linkView.model;
            if (link.route_id) {
                this.openRouteEditWizard(link);
            }
        });

        this.paper.on('link:mouseover', (linkView) => {
            if (!linkView.model.isSelected) {
                linkView.showTools();
            }
        });

        this.paper.on('link:mouseout', (linkView) => {
            if (!linkView.model.isSelected) {
                linkView.hideTools();
            }
        });

        // Ajuster la taille lors du redimensionnement
        // TEMPORAIREMENT DÉSACTIVÉ pour debug
        /*
        const resizeObserver = new ResizeObserver(() => {
            console.log('ResizeObserver triggered');
            if (this.paper && this.graphRef.el) {
                const newWidth = this.graphRef.el.clientWidth;
                const newHeight = this.graphRef.el.clientHeight;
                console.log('New dimensions:', newWidth, newHeight);
                // Valider les dimensions avant de les appliquer
                if (isFinite(newWidth) && isFinite(newHeight) && newWidth > 0 && newHeight > 0) {
                    try {
                        this.paper.setDimensions(newWidth, newHeight);
                    } catch (resizeError) {
                        console.error('Error in setDimensions:', resizeError);
                    }
                }
            }
        });

        if (this.graphRef.el) {
            resizeObserver.observe(this.graphRef.el);
        }
        */

        // Événements du graphe

        // Valider les positions des éléments lors de leur ajout au graphe
        this.graph.on('add', (cell) => {
            if (cell.isElement()) {
                const pos = cell.get('position');
                if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) {
                    cell.set('position', { x: 100, y: 100 }, { silent: true });
                    console.warn('Corrected invalid position on add for element:', cell.id);
                }
            }
        });

        this.graph.on('change', (cell, opt) => {
            // Ignorer pendant le chargement
            if (this.isUpdating) return;

            try {
                if (!this.props.readonly) {
                    this.saveGraph();
                }
            } catch (changeError) {
                console.error('Error in graph change handler:', changeError);
            }
        });

        // Événements de déplacement d'éléments - Valider les positions pour éviter les erreurs SVGMatrix
        this.graph.on('change:position', (element, newPosition) => {
            // Ignorer pendant le chargement
            if (this.isUpdating) return;

            if (element.isElement()) {
                // Vérifier si la nouvelle position est valide
                if (!newPosition || !isFinite(newPosition.x) || !isFinite(newPosition.y)) {
                    // Corriger la position invalide
                    const currentPos = element.get('position') || { x: 100, y: 100 };
                    const safeX = isFinite(currentPos.x) ? currentPos.x : 100;
                    const safeY = isFinite(currentPos.y) ? currentPos.y : 100;
                    element.set('position', { x: safeX, y: safeY }, { silent: true });
                    console.warn('Corrected invalid position for element:', element.id);
                    return;
                }
                // Mettre à jour les connexions liées à cet élément
                this.updateElementConnections(element);
            }
        });

        // Gestion du drag & drop si non readonly
        if (!this.props.readonly) {
            this.setupDragAndDrop();
        }

        // Ajouter les fonctionnalités de zoom et de scroll
        this.setupZoomAndPan();
    }

    setupDragAndDrop() {
        if (!this.graphRef.el) return;

        // Sélectionner tous les éléments draggables (états, rôles et actions)
        const draggables = this.graphRef.el.parentElement.querySelectorAll('[draggable="true"]');
        
        draggables.forEach(element => {
            element.addEventListener('dragstart', (e) => {
                const type = e.target.dataset.type || 'state';
                const shape = e.target.dataset.shape;
                const role = e.target.dataset.role;
                const action = e.target.dataset.action;
                const text = e.target.textContent || e.target.innerText;

                // Set both JSON and text data for fallback
                e.dataTransfer.setData('application/json', JSON.stringify({
                    type,
                    shape,
                    role,
                    action
                }));
                e.dataTransfer.setData('text/plain', text);

                // Ajouter une classe pour le style pendant le drag
                element.classList.add('dragging');
            });

            element.addEventListener('dragend', (_e) => {
                element.classList.remove('dragging');
            });
        });

        const graphEl = this.graphRef.el;
        
        graphEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            graphEl.classList.add('drag-over');
        });

        graphEl.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            graphEl.classList.remove('drag-over');
        });

        graphEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            graphEl.classList.remove('drag-over');

            try {
                const jsonData = e.dataTransfer.getData('application/json');
                if (!jsonData || jsonData.trim() === '') {
                    // Fallback: check if this is a draggable element from sidebar
                    const textData = e.dataTransfer.getData('text/plain');
                    if (textData === 'Add State' || !textData) {
                        // Default to creating a state
                        const point = this.paper.clientToLocalPoint({ 
                            x: e.clientX, 
                            y: e.clientY 
                        });
                        this.addState(point, 'state');
                        return;
                    }
                }
                
                const data = JSON.parse(jsonData);
                const point = this.paper.clientToLocalPoint({ 
                    x: e.clientX, 
                    y: e.clientY 
                });

                let element;
                switch (data.type) {
                    case 'state':
                        element = this.addState(point, 'state');
                        break;
                    case 'role':
                        element = this.addState(point, 'role');
                        if (element && data.role) {
                            element.attr('label/text', data.role);
                        }
                        break;
                    case 'action':
                        element = this.addState(point, 'action');
                        if (element && data.action) {
                            element.attr('label/text', data.action);
                            switch (data.action) {
                                case 'approve':
                                    element.attr({
                                        body: {
                                            fill: '#e8f5e9',
                                            stroke: '#a5d6a7'
                                        },
                                        label: {
                                            fill: '#2e7d32'
                                        }
                                    });
                                    break;
                                case 'reject':
                                    element.attr({
                                        body: {
                                            fill: '#ffebee',
                                            stroke: '#ffcdd2'
                                        },
                                        label: {
                                            fill: '#c62828'
                                        }
                                    });
                                    break;
                                case 'cancel':
                                    element.attr({
                                        body: {
                                            fill: '#fff3e0',
                                            stroke: '#ffe0b2'
                                        },
                                        label: {
                                            fill: '#ef6c00'
                                        }
                                    });
                                    break;
                            }
                        }
                        break;
                }

                if (element) {
                    // Centrer l'élément sur le point de dépôt
                    const elementBBox = element.getBBox();
                    const newX = point.x - elementBBox.width / 2;
                    const newY = point.y - elementBBox.height / 2;
                    // Valider les coordonnées avant de les appliquer
                    if (isFinite(newX) && isFinite(newY)) {
                        element.position(newX, newY);
                    }
                }
            } catch (error) {
                console.error('Error during drop:', error);
                // Fallback: create a default state if drag and drop fails
                try {
                    const point = this.paper.clientToLocalPoint({ 
                        x: e.clientX, 
                        y: e.clientY 
                    });
                    this.addState(point, 'state');
                } catch (fallbackError) {
                    console.error('Fallback creation also failed:', fallbackError);
                    this.notification.add(_t("Erreur lors de la création de l'état"), {
                        type: 'danger',
                    });
                }
            }
        });
    }

    setupZoomAndPan() {
        if (!this.paper || !this.graphRef.el) return;

        let isPanning = false;
        let lastPanPoint = { x: 0, y: 0 };

        // Variables pour le zoom et pan
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };

        // Zoom avec la molette de la souris
        this.graphRef.el.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const rect = this.graphRef.el.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Calculer le facteur de zoom
            const oldScale = this.paper.scale();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(0.1, Math.min(3, oldScale.sx * zoomFactor));
            
            // Zoomer vers la position de la souris
            const localPoint = this.paper.clientToLocalPoint({ x: mouseX, y: mouseY });
            // Valider les coordonnées avant de les utiliser pour le zoom
            const safeLocalX = isFinite(localPoint.x) ? localPoint.x : 0;
            const safeLocalY = isFinite(localPoint.y) ? localPoint.y : 0;
            this.paper.scale(newScale, newScale, safeLocalX, safeLocalY);
        });

        // Pan avec le clic gauche sur zone vide, clic droit ou clic milieu
        let isOnElement = false;
        
        // Détecter si on clique sur un élément ou une zone vide
        this.paper.on('element:pointerdown', () => {
            isOnElement = true;
        });
        
        this.paper.on('link:pointerdown', () => {
            isOnElement = true;
        });
        
        this.paper.on('blank:pointerdown', (evt) => {
            isOnElement = false;
            // Permettre le pan sur zone vide avec clic gauche
            const originalEvent = evt.originalEvent || (evt.data && evt.data.originalEvent) || evt;
            if (originalEvent && originalEvent.button === 0) { // Clic gauche
                isDragging = true;
                dragStart = { x: originalEvent.clientX, y: originalEvent.clientY };
                this.graphRef.el.style.cursor = 'grabbing';
            }
        });
        
        this.graphRef.el.addEventListener('mousedown', (e) => {
            if (e.button === 1 || e.button === 2) { // Clic milieu ou droit
                e.preventDefault();
                isDragging = true;
                dragStart = { x: e.clientX, y: e.clientY };
                this.graphRef.el.style.cursor = 'grabbing';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const deltaX = e.clientX - dragStart.x;
                const deltaY = e.clientY - dragStart.y;

                const currentTranslate = this.paper.translate();
                // Valider les coordonnées avant de les utiliser pour le translate
                const newTx = currentTranslate.tx + deltaX;
                const newTy = currentTranslate.ty + deltaY;
                if (isFinite(newTx) && isFinite(newTy)) {
                    this.paper.translate(newTx, newTy);
                }

                dragStart = { x: e.clientX, y: e.clientY };
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                this.graphRef.el.style.cursor = 'default';
            }
        });

        // Désactiver le menu contextuel sur clic droit
        this.graphRef.el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Les boutons de zoom sont maintenant dans le template XML
    }

    // Fonctions pour les boutons de zoom du template

    zoomIn() {
        if (this.paper) {
            this.paper.scale(this.paper.scale().sx * 1.2, this.paper.scale().sy * 1.2);
        }
    }

    zoomOut() {
        if (this.paper) {
            this.paper.scale(this.paper.scale().sx * 0.8, this.paper.scale().sy * 0.8);
        }
    }

    resetZoom() {
        if (this.paper) {
            this.paper.scale(1, 1);
            this.paper.translate(0, 0);
        }
    }

    fitToContent() {
        if (this.paper && this.graph) {
            try {
                const bbox = this.graph.getBBox();
                if (bbox && isFinite(bbox.x) && isFinite(bbox.y) && isFinite(bbox.width) && isFinite(bbox.height)) {
                    // Réinitialiser la transformation
                    this.paper.scale(1, 1);
                    this.paper.translate(0, 0);

                    // Calculer un décalage pour afficher le contenu avec du padding
                    const padding = 50;
                    const offsetX = padding - Math.min(0, bbox.x);
                    const offsetY = padding - Math.min(0, bbox.y);

                    if (isFinite(offsetX) && isFinite(offsetY)) {
                        this.paper.translate(offsetX, offsetY);
                    }
                }
            } catch (error) {
                console.warn('Error in fitToContent:', error);
                this.paper.scale(1, 1);
                this.paper.translate(0, 0);
            }
        }
    }

    autoLayout() {
        if (!this.graph) return;

        const elements = this.graph.getElements();
        if (elements.length === 0) return;

        // Algorithme de layout automatique
        this.applyHierarchicalLayout(elements);
        
        // Ajuster la vue après le layout
        setTimeout(() => {
            try {
                this.fitToContent();
                this.ensurePaperSize();
            } catch (e) {
                console.warn('Error in autoLayout deferred callback:', e);
            }
        }, 100);
    }

    applyHierarchicalLayout(elements) {
        // Trouver l'élément de départ (sans liens entrants ou marqué comme draft)
        const startElements = elements.filter(el => {
            const incomingLinks = this.graph.getConnectedLinks(el, { inbound: true });
            const isDraft = el.stage_id && this.getStageById(el.stage_id)?.is_draft;
            return incomingLinks.length === 0 || isDraft;
        });

        if (startElements.length === 0) {
            // Si aucun élément de départ, utiliser le premier
            startElements.push(elements[0]);
        }

        const processed = new Set();
        const levels = [];
        let currentLevel = 0;

        // BFS pour organiser par niveaux
        let queue = startElements.map(el => ({ element: el, level: 0 }));
        
        while (queue.length > 0) {
            const { element, level } = queue.shift();
            
            if (processed.has(element.id)) continue;
            processed.add(element.id);

            // Initialiser le niveau si nécessaire
            if (!levels[level]) levels[level] = [];
            levels[level].push(element);

            // Ajouter les éléments connectés au niveau suivant
            const outgoingLinks = this.graph.getConnectedLinks(element, { outbound: true });
            outgoingLinks.forEach(link => {
                const targetId = link.get('target').id;
                const targetElement = this.graph.getCell(targetId);
                if (targetElement && !processed.has(targetId)) {
                    queue.push({ element: targetElement, level: level + 1 });
                }
            });
        }

        // Positionner les éléments
        const levelSpacing = 200;
        const elementSpacing = 180;
        const startX = 100;
        const startY = 100;

        levels.forEach((levelElements, levelIndex) => {
            const y = startY + (levelIndex * levelSpacing);
            const totalWidth = (levelElements.length - 1) * elementSpacing;
            const startXForLevel = startX - (totalWidth / 2);

            levelElements.forEach((element, elementIndex) => {
                const x = startXForLevel + (elementIndex * elementSpacing);
                // Valider les coordonnées avant de les appliquer
                const safeX = isFinite(x) ? x : 100;
                const safeY = isFinite(y) ? y : 100;
                element.position(safeX, safeY);
            });
        });

        // Sauvegarder les nouvelles positions
        if (!this.isUpdating) {
            setTimeout(() => {
                try {
                    this.saveGraph();
                } catch (e) {
                    console.warn('Error in deferred saveGraph:', e);
                }
            }, 200);
        }
    }

    getStageById(stageId) {
        // Méthode helper pour récupérer les données d'un stage
        if (this.stagesData) {
            return this.stagesData.find(stage => stage.id === stageId);
        }
        return null;
    }

    getRouteById(routeId) {
        // Méthode helper pour récupérer les données d'une route
        if (this.routesData) {
            return this.routesData.find(route => route.id === routeId);
        }
        return null;
    }

    getElementDetails(element) {
        const details = {};
        
        if (element.stage_id) {
            const stageData = this.getStageById(element.stage_id);
            if (stageData) {
                details.sequence = stageData.sequence;
                details.visible = stageData.visible;
                details.is_draft = stageData.is_draft;
                details.is_done = stageData.is_done;
                details.color = stageData.color;
                details.can_readonly = stageData.can_readonly;
                details.position_x = element.position().x;
                details.position_y = element.position().y;
                
                // Convertir le code couleur en nom et valeur hex
                if (stageData.color) {
                    const colorMap = {
                        '1': { name: 'Rouge', hex: '#ffcdd2' },
                        '2': { name: 'Bleue', hex: '#bbdefb' },
                        '3': { name: 'Grise', hex: '#cfd8dc' },
                        '4': { name: 'Violette', hex: '#e1bee7' },
                        '5': { name: 'Verte', hex: '#c8e6c9' },
                        '6': { name: 'Brune', hex: '#d7ccc8' }
                    };
                    const colorInfo = colorMap[stageData.color];
                    if (colorInfo) {
                        details.colorName = colorInfo.name;
                        details.colorHex = colorInfo.hex;
                    }
                }
            }
        }
        
        return details;
    }

    getLinkDetails(link) {
        const details = {};
        
        if (link.route_id) {
            const routeData = this.getRouteById(link.route_id);
            if (routeData) {
                details.description = routeData.description;
                details.sequence = routeData.sequence;
                details.btn_class = routeData.btn_class;
                details.visible = routeData.visible;
                details.require_comment = routeData.require_comment;
                details.user_group_ids = routeData.user_group_ids;
                
                // Convertir btn_class en nom lisible
                const btnClassMap = {
                    'btn-primary': 'Principal',
                    'btn-success': 'Succès',
                    'btn-danger': 'Danger',
                    'btn-warning': 'Attention',
                    'btn-info': 'Information',
                    'btn-secondary': 'Secondaire'
                };
                details.btn_class_name = btnClassMap[routeData.btn_class] || routeData.btn_class;
                
                // TODO: Récupérer les noms des groupes d'utilisateurs si nécessaire
                if (routeData.user_group_ids && routeData.user_group_ids.length > 0) {
                    details.user_group_names = ['Groupes spécifiés']; // Placeholder
                }
            }
        }
        
        return details;
    }

    // Ajuster la taille du paper pour le contenu
    ensurePaperSize() {
        if (!this.paper || !this.graph) return;

        const bbox = this.graph.getBBox();
        if (bbox && bbox.width && bbox.height) {
            // Valider les valeurs du bounding box
            const bboxX = isFinite(bbox.x) ? bbox.x : 0;
            const bboxY = isFinite(bbox.y) ? bbox.y : 0;
            const bboxWidth = isFinite(bbox.width) ? bbox.width : 0;
            const bboxHeight = isFinite(bbox.height) ? bbox.height : 0;

            const minWidth = Math.max(bboxX + bboxWidth + 200, 2000);
            const minHeight = Math.max(bboxY + bboxHeight + 200, 1500);

            if (isFinite(minWidth) && isFinite(minHeight)) {
                this.paper.setDimensions(minWidth, minHeight);
            }
        }
    }

    // Mettre à jour les connexions quand un élément est déplacé
    updateElementConnections(element) {
        // JointJS gère automatiquement les liens attachés aux ports
        // Il suffit de sauvegarder les nouvelles positions
        if (!this.isUpdating) {
            setTimeout(() => {
                try {
                    this.saveGraph();
                } catch (e) {
                    console.warn('Error in updateElementConnections saveGraph:', e);
                }
            }, 100);
        }
    }

    // Utilise les méthodes natives de JointJS pour le zoom et pan

    addState(position, shape = 'state') {
        if (!window.joint) return;

        // Valider et corriger les coordonnées de position
        const safeX = (typeof position.x === 'number' && isFinite(position.x)) ? position.x : 100;
        const safeY = (typeof position.y === 'number' && isFinite(position.y)) ? position.y : 100;
        const safePosition = { x: safeX, y: safeY };

        let element;
        const commonAttrs = {
            body: {
                fill: '#ffffff',
                stroke: '#3498db',
                strokeWidth: 2,
                rx: 25,
                ry: 25,
                magnet: false  // Désactiver complètement le magnet sur le corps
            },
            label: {
                text: 'Nouvel État',
                fill: '#2c3e50',
                fontSize: 14,
                fontWeight: 500,
                textAnchor: 'middle',
                textVerticalAnchor: 'middle',
                refX: '50%',
                refY: '50%'
            }
        };

        switch (shape) {
            case 'state':
                element = new window.joint.shapes.standard.Rectangle({
                    position: safePosition,
                    size: { width: 160, height: 50 },
                    attrs: commonAttrs,
                    ports: {
                        groups: {
                            'ports': {
                                markup: [{
                                    tagName: 'circle',
                                    selector: 'port'
                                }],
                                attrs: {
                                    port: {
                                        r: 6,
                                        magnet: true,  // Activer le magnet uniquement sur les ports
                                        fill: '#3498db',
                                        stroke: '#2980b9',
                                        strokeWidth: 2,
                                        cursor: 'crosshair',
                                        opacity: 0.8
                                    }
                                },
                                position: {
                                    name: 'absolute'
                                }
                            }
                        },
                        items: [
                            { group: 'ports', id: 'port-north', args: { x: '50%', y: '0%' } },
                            { group: 'ports', id: 'port-south', args: { x: '50%', y: '100%' } },
                            { group: 'ports', id: 'port-east', args: { x: '100%', y: '50%' } },
                            { group: 'ports', id: 'port-west', args: { x: '0%', y: '50%' } }
                        ]
                    }
                });
                element.isState = true;
                break;
            case 'role':
                element = new window.joint.shapes.standard.Rectangle({
                    position: safePosition,
                    size: { width: 100, height: 40 },
                    attrs: {
                        body: {
                            fill: '#ebf5ff',
                            stroke: '#b3d7ff',
                            strokeWidth: 2,
                            rx: 20,
                            ry: 20
                        },
                        label: {
                            text: 'Rôle',
                            fill: '#0056b3',
                            fontSize: 12,
                            fontWeight: 500,
                            textAnchor: 'middle',
                            textVerticalAnchor: 'middle',
                            refX: '50%',
                            refY: '50%'
                        }
                    }
                });
                break;
            case 'action':
                element = new window.joint.shapes.standard.Rectangle({
                    position: safePosition,
                    size: { width: 80, height: 30 },
                    attrs: {
                        body: {
                            fill: '#e8f5e9',
                            stroke: '#a5d6a7',
                            strokeWidth: 2,
                            rx: 15,
                            ry: 15
                        },
                        label: {
                            text: 'Action',
                            fill: '#2e7d32',
                            fontSize: 12,
                            fontWeight: 500,
                            textAnchor: 'middle',
                            textVerticalAnchor: 'middle',
                            refX: '50%',
                            refY: '50%'
                        }
                    }
                });
                break;
        }

        if (element) {
            // Vérifier une dernière fois la position avant d'ajouter au graphe
            const finalPos = element.get('position');
            if (!finalPos || !isFinite(finalPos.x) || !isFinite(finalPos.y)) {
                element.set('position', { x: safeX, y: safeY }, { silent: true });
            }
            this.graph.addCell(element);
            // Ajuster la taille du paper après ajout d'élément
            setTimeout(() => {
                try {
                    this.ensurePaperSize();
                } catch (e) {
                    console.warn('Error in deferred ensurePaperSize:', e);
                }
            }, 100);
            return element;
        }
    }

    updateStateType(type) {
        if (!this.state.selectedElement || !this.state.selectedElement.isState) return;

        const element = this.state.selectedElement;
        switch (type) {
            case 'start':
                element.attr({
                    body: {
                        fill: '#e8f5e9',
                        stroke: '#4caf50',
                        strokeWidth: 3
                    },
                    label: {
                        fill: '#2e7d32'
                    }
                });
                break;
            case 'end':
                element.attr({
                    body: {
                        fill: '#fff3e0',
                        stroke: '#ff9800',
                        strokeWidth: 3,
                        strokeDasharray: '0'
                    },
                    label: {
                        fill: '#ef6c00'
                    }
                });
                break;
            default:
                element.attr({
                    body: {
                        fill: '#ffffff',
                        stroke: '#3498db',
                        strokeWidth: 2,
                        strokeDasharray: '0'
                    },
                    label: {
                        fill: '#2c3e50'
                    }
                });
        }
    }

    createLink(source, target, sourcePort = null, targetPort = null) {
        // Déterminer les meilleurs ports pour la connexion
        if (!sourcePort || !targetPort) {
            const sourceBBox = source.getBBox();
            const targetBBox = target.getBBox();
            
            // Calculer la direction générale de la connexion
            const deltaX = targetBBox.x - sourceBBox.x;
            const deltaY = targetBBox.y - sourceBBox.y;
            
            // Choisir les ports en fonction de la position relative
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                // Connexion horizontale
                sourcePort = deltaX > 0 ? 'port-east' : 'port-west';
                targetPort = deltaX > 0 ? 'port-west' : 'port-east';
            } else {
                // Connexion verticale
                sourcePort = deltaY > 0 ? 'port-south' : 'port-north';
                targetPort = deltaY > 0 ? 'port-north' : 'port-south';
            }
        }

        const link = new window.joint.shapes.standard.Link({
            source: { 
                id: source.id,
                port: sourcePort
            },
            target: { 
                id: target.id,
                port: targetPort
            },
            router: { name: 'normal' },
            connector: { name: 'smooth' },
            attrs: {
                line: {
                    stroke: '#666',
                    strokeWidth: 2,
                    strokeDasharray: '5 3',
                    targetMarker: {
                        type: 'path',
                        d: 'M 10 -5 0 0 10 5 Z',
                        fill: '#666',
                        stroke: '#666'
                    }
                }
            },
            labels: [{
                position: {
                    distance: 0.5,
                    offset: {
                        x: 0,
                        y: 0
                    }
                },
                attrs: {
                    rect: {
                        fill: 'white',
                        stroke: '#666',
                        strokeWidth: 1,
                        rx: 12,
                        ry: 12,
                        width: 120,
                        height: 30,
                        x: -60,
                        y: -15
                    },
                    text: {
                        text: 'Action',
                        fill: '#333',
                        fontSize: 14,
                        fontWeight: 500,
                        textAnchor: 'middle',
                        textVerticalAnchor: 'middle',
                        x: 0,
                        y: 0
                    },
                    
                },
                markup: [
                    {
                        tagName: 'rect',
                        selector: 'rect'
                    },
                    {
                        tagName: 'text',
                        selector: 'text'
                    },
                     
                ]
            }]
        });

        // Ajouter l'événement de suppression
        const linkView = this.paper.findViewByModel(link);
        if (linkView) {
            linkView.on('element:delete', () => {
                if (link.route_id) {
                    this.dialog.add(ConfirmationDialog, {
                        title: _t("Confirmation"),
                        body: _t("Voulez-vous vraiment supprimer cette route ?"),
                        confirm: async () => {
                            try {
                                await this.orm.unlink('request.stage.route', [link.route_id]);
                                link.remove();
                            } catch (error) {
                                console.error('Error removing route:', error);
                            }
                        },
                        cancel: () => {}
                    });
                } else {
                    link.remove();
                }
            });
        }

        this.graph.addCell(link);
        return link;
    }

    selectElement(element) {
        if (this.state.selectedElement) {
            const view = this.paper.findViewByModel(this.state.selectedElement);
            if (view) view.unhighlight();
        }

        const view = this.paper.findViewByModel(element);
        if (view) {
            view.highlight();
            this.state.selectedElement = element;
            this.state.selectedElementName = element.attr('label/text') || 'Sans nom';
            this.state.selectedElementType = element.isState ? 'État' : 'Élément';
            
            // Enrichir les détails de l'élément
            this.state.selectedElementDetails = this.getElementDetails(element);
        } else {
            this.state.selectedElement = null;
            this.state.selectedElementName = null;
            this.state.selectedElementType = null;
            this.state.selectedElementDetails = {};
        }
    }

    toggleConnection() {
        this.isConnecting = !this.isConnecting;
        if (!this.isConnecting && this.sourceElement) {
            const view = this.paper.findViewByModel(this.sourceElement);
            if (view) view.unhighlight();
            this.sourceElement = null;
        }
    }

    async deleteSelected() {
        if (this.state.selectedElement && !this.props.readonly) {
            const element = this.state.selectedElement;
            
            if (element.stage_id) {
                // L'élément existe dans la base de données, demander confirmation
                this.dialog.add(ConfirmationDialog, {
                    title: _t("Confirmation"),
                    body: _t("Voulez-vous vraiment supprimer cet état ?"),
                    confirm: async () => {
                        try {
                            await this.orm.unlink('request.stage', [element.stage_id]);
                            element.remove();
                            this.unselectAll();
                        } catch (error) {
                            console.error('Error removing stage:', error);
                            this.notification.add(
                                _t("Erreur lors de la suppression : ") + error.message,
                                { type: "danger" }
                            );
                        }
                    },
                    cancel: () => {}
                });
            } else {
                // Nouvel élément non sauvegardé, supprimer directement
                element.remove();
                this.unselectAll();
            }
        }
    }

    async editSelected() {
        if (this.state.selectedElement) {
            if (this.state.selectedElement.stage_id) {
                // L'élément existe déjà dans la base de données
                this.openStageEditWizard(this.state.selectedElement);
            } else {
                // Nouvel élément, il faut d'abord le créer
                await this.createAndEditStage(this.state.selectedElement);
            }
        }
    }

    async createAndEditStage(element) {
        try {
            // Vérifier que nous avons les données nécessaires
            if (!this.props.record || !this.props.record.resId) {
                console.error('No record ID available');
                this.notification.add(
                    _t("Impossible de créer l'état : aucun type de requête sélectionné."),
                    { type: "danger" }
                );
                return;
            }

            // Créer le stage dans la base de données
            const position = element.position();
            // Valider les positions avant de les sauvegarder
            const posX = (typeof position.x === 'number' && isFinite(position.x)) ? Math.round(position.x) : 100;
            const posY = (typeof position.y === 'number' && isFinite(position.y)) ? Math.round(position.y) : 100;
            const stageData = {
                name: element.attr('label/text') || 'Nouvel État',
                type_id: this.props.record.resId,
                sequence: this.graph.getElements().length,
                position_x: posX,
                position_y: posY,
                visible: true,
                active: true,
                is_draft: false,
                is_done: false
            };

            console.log('Creating stage with data:', stageData);
            const result = await this.orm.create('request.stage', [stageData]);
            
            // orm.create retourne un tableau d'IDs, on prend le premier
            const stageId = Array.isArray(result) ? result[0] : result;
            
            if (!stageId || typeof stageId !== 'number') {
                throw new Error('Failed to create stage - invalid ID returned: ' + stageId);
            }

            // Assigner l'ID au stage
            element.stage_id = stageId;
            
            // Ouvrir le wizard d'édition
            this.openStageEditWizard(element);
            
        } catch (error) {
            console.error('Error creating stage:', error);
            this.notification.add(
                _t("Erreur lors de la création de l'état : ") + error.message,
                { type: "danger" }
            );
        }
    }

    async deleteSelectedLink() {
        if (this.state.selectedLink && !this.props.readonly) {
            const link = this.state.selectedLink;
            
            if (link.route_id) {
                this.dialog.add(ConfirmationDialog, {
                    title: _t("Confirmation"),
                    body: _t("Voulez-vous vraiment supprimer cette route ?"),
                    confirm: async () => {
                        try {
                            await this.orm.unlink('request.stage.route', [link.route_id]);
                            link.remove();
                            this.unselectAll();
                        } catch (error) {
                            console.error('Error removing route:', error);
                            this.notification.add(
                                _t("Erreur lors de la suppression de la route : ") + error.message,
                                { type: "danger" }
                            );
                        }
                    },
                    cancel: () => {}
                });
            } else {
                link.remove();
                this.unselectAll();
            }
        }
    }

    editSelectedLink() {
        if (this.state.selectedLink && this.state.selectedLink.route_id) {
            this.openRouteEditWizard(this.state.selectedLink);
        }
    }

    updateElementLabel(value) {
        if (this.state.selectedElement) {
            this.state.selectedElement.attr('label/text', value);
        }
    }

    updateElementColor(value) {
        if (this.state.selectedElement) {
            this.state.selectedElement.attr('body/fill', value);
        }
    }

    async reloadGraph() {
        try {
            console.log('Reloading graph...');
            // Marquer comme en cours de mise à jour pour éviter les événements parasites
            this.isUpdating = true;

            // Nettoyer le graphique existant
            this.graph.clear();
            // Désélectionner tout
            this.unselectAll();

            // Forcer le rechargement du record avec ses relations
            await this.props.record.load({
                reload: true,
                fieldNames: ['stage_ids', 'route_ids']
            });

            // Réinitialiser le paper avant de recharger
            if (this.paper) {
                this.paper.scale(1, 1);
                this.paper.translate(0, 0);
            }

            // Recharger les données du graphique
            await this.loadGraph();
            console.log('Graph reload complete');
        } catch (error) {
            console.error('Error reloading graph:', error);
            // En cas d'erreur, essayer un rechargement simple
            try {
                await this.loadGraph();
            } catch (fallbackError) {
                console.error('Fallback load also failed:', fallbackError);
            }
        } finally {
            this.isUpdating = false;
        }
    }

    async loadGraph() {
        try {
            // Bloquer les événements pendant le chargement
            this.isUpdating = true;

            // Charger les stages et routes directement depuis la base de données
            const typeId = this.props.record.resId;
            console.log('Loading graph for type ID:', typeId);
            
            // Charger tous les stages de ce type - champs de base d'abord
            const stagesData = await this.orm.searchRead(
                'request.stage',
                [['type_id', '=', typeId]],
                ['id', 'name', 'sequence', 'type_id', 'position_x', 'position_y', 'color', 'is_draft', 'is_done']
            );
            
            // Stocker les données pour l'auto-layout
            this.stagesData = stagesData;
            
            // Charger toutes les routes de ce type - avec champs de base d'abord
            const routesData = await this.orm.searchRead(
                'request.stage.route',
                [['type_id', '=', typeId]],
                ['id', 'name', 'sequence', 'description', 'stage_from_id', 'stage_to_id', 'btn_class']
            );
            
            // Stocker les données des routes pour les détails
            this.routesData = routesData;
            
            console.log('Loaded stages:', stagesData.length);
            console.log('Loaded routes:', routesData.length);

            // Mettre à jour l'état vide
            this.state.isEmpty = stagesData.length === 0;
            
            // Debug: afficher les données chargées
            console.log('Stages data:', stagesData);
            console.log('Routes data:', routesData);

            // Traiter les stages
            if (stagesData.length > 0) {
                stagesData.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).forEach((stage, index) => {
                    // Debug détaillé des positions
                    console.log(`Stage ${stage.id} (${stage.name}): position_x=${stage.position_x} (type: ${typeof stage.position_x}), position_y=${stage.position_y} (type: ${typeof stage.position_y})`);

                    // Utiliser la position sauvegardée ou calculer une position par défaut
                    let x, y;
                    // Vérifier que les positions sont des nombres finis et non nuls
                    const hasValidPosition = typeof stage.position_x === 'number' &&
                                             typeof stage.position_y === 'number' &&
                                             isFinite(stage.position_x) &&
                                             isFinite(stage.position_y) &&
                                             (stage.position_x !== 0 || stage.position_y !== 0);

                    console.log(`  hasValidPosition: ${hasValidPosition}`);

                    if (hasValidPosition) {
                        x = stage.position_x;
                        y = stage.position_y;
                    } else {
                        // Calculer la position en zigzag si pas de position sauvegardée valide
                        const row = Math.floor(index / 3); // 3 états par ligne
                        const col = index % 3;
                        x = 100 + (col * 400); // Plus d'espace horizontal
                        y = 100 + (row * 200); // Espace vertical entre les lignes
                        console.log(`  Using calculated position: x=${x}, y=${y}`);
                    }

                    // Double vérification finale
                    if (!isFinite(x) || !isFinite(y)) {
                        console.error(`  INVALID final position! x=${x}, y=${y}. Resetting to defaults.`);
                        x = 100 + (index % 3) * 400;
                        y = 100 + Math.floor(index / 3) * 200;
                    }

                    try {
                        const stageElement = this.addState(
                            { x, y },
                            'state'
                        );

                        if (!stageElement) {
                            console.error(`Failed to create element for stage ${stage.id}`);
                            return;
                        }

                        stageElement.attr('label/text', stage.name || 'Nouvel État');
                        stageElement.stage_id = stage.id;

                        // Appliquer le style en fonction des propriétés
                        let fillColor = '#ffffff';
                        let strokeColor = '#3498db';

                        if (stage.is_draft) {
                            fillColor = '#e8f5e9';
                            strokeColor = '#4caf50';
                        } else if (stage.is_done) {
                            fillColor = '#fff3e0';
                            strokeColor = '#ff9800';
                        }

                        // Appliquer la couleur depuis le champ color
                        if (stage.color) {
                            switch (stage.color) {
                                case '1': fillColor = '#ffcdd2'; break; // Rouge
                                case '2': fillColor = '#bbdefb'; break; // Bleu
                                case '3': fillColor = '#cfd8dc'; break; // Gris
                                case '4': fillColor = '#e1bee7'; break; // Violet
                                case '5': fillColor = '#c8e6c9'; break; // Vert
                                case '6': fillColor = '#d7ccc8'; break; // Brun
                            }
                        }

                        stageElement.attr({
                            body: {
                                fill: fillColor,
                                stroke: strokeColor
                            }
                        });

                        if (!stage.visible) {
                            stageElement.attr({
                                body: {
                                    opacity: 0.5
                                }
                            });
                        }

                        console.log(`  Element created successfully with position:`, stageElement.get('position'));
                    } catch (elementError) {
                        console.error(`Error creating element for stage ${stage.id}:`, elementError);
                    }
                });
            }

            // Traiter les routes
            console.log('Creating routes...');
            if (routesData.length > 0) {
                routesData.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).forEach((route, index) => {
                    try {
                        console.log(`Creating route ${index + 1}/${routesData.length}: ${route.name}`);
                        const sourceElement = this.graph.getElements().find(el => el.stage_id === route.stage_from_id[0]);
                        const targetElement = this.graph.getElements().find(el => el.stage_id === route.stage_to_id[0]);

                        if (sourceElement && targetElement) {
                            const link = this.createLink(sourceElement, targetElement);
                            link.label(0, { attrs: { text: { text: route.name || route.description || 'Action' } } });
                            link.route_id = route.id;

                        // Appliquer le style en fonction de btn_class
                        let linkColor = '#666';
                        switch (route.btn_class) {
                            case 'btn-primary': linkColor = '#007bff'; break;
                            case 'btn-success': linkColor = '#28a745'; break;
                            case 'btn-danger': linkColor = '#dc3545'; break;
                            case 'btn-warning': linkColor = '#ffc107'; break;
                            case 'btn-info': linkColor = '#17a2b8'; break;
                        }

                        link.attr('line/stroke', linkColor);
                        link.attr('line/targetMarker/fill', linkColor);
                        link.attr('line/targetMarker/stroke', linkColor);
                        link.attr('line/sourceMarker/fill', linkColor);
                        link.attr('line/sourceMarker/stroke', linkColor);
                            console.log(`  Route ${route.id} created successfully`);
                        }
                    } catch (routeError) {
                        console.error(`Error creating route ${route.id}:`, routeError);
                    }
                });
            }
            console.log('All routes created');

            // Valider toutes les positions des éléments après le chargement
            console.log('Validating element positions...');
            this.validateAllElementPositions();
            console.log('Validation complete');

            // Ajuster la vue pour montrer tout le contenu
            console.log('Adjusting view...');
            if (this.paper) {
                // Utiliser une approche manuelle au lieu de fitToContent pour éviter les erreurs SVGMatrix
                try {
                    const bbox = this.graph.getBBox();
                    console.log('Graph BBox:', bbox);
                    if (bbox && isFinite(bbox.x) && isFinite(bbox.y) && isFinite(bbox.width) && isFinite(bbox.height)) {
                        // Réinitialiser la transformation d'abord
                        this.paper.scale(1, 1);
                        this.paper.translate(0, 0);

                        // Calculer un décalage pour centrer le contenu avec du padding
                        const padding = 50;
                        const offsetX = padding - Math.min(0, bbox.x);
                        const offsetY = padding - Math.min(0, bbox.y);

                        if (isFinite(offsetX) && isFinite(offsetY)) {
                            this.paper.translate(offsetX, offsetY);
                        }
                    } else {
                        // Si pas de bbox valide, juste réinitialiser
                        this.paper.scale(1, 1);
                        this.paper.translate(0, 0);
                    }
                } catch (fitError) {
                    console.warn('Error adjusting view, resetting:', fitError);
                    this.paper.scale(1, 1);
                    this.paper.translate(0, 0);
                }

                // Ajuster la taille du paper pour le contenu
                console.log('Ensuring paper size...');
                this.ensurePaperSize();
                console.log('Paper size adjusted');
            }
            console.log('Graph loading complete!');

            // Forcer un rendu complet et attendre que JointJS termine
            if (this.paper) {
                // Désactiver temporairement les interactions pour éviter les erreurs
                this.paper.setInteractivity(false);

                // Attendre plusieurs frames pour que JointJS termine son rendu
                await new Promise(resolve => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                resolve();
                            });
                        });
                    });
                });

                // Réactiver les interactions
                this.paper.setInteractivity({
                    elementMove: !this.props.readonly,
                    addLinkFromMagnet: !this.props.readonly,
                    linkMove: !this.props.readonly,
                    vertexAdd: false
                });
            }
        } catch (error) {
            console.error('Error loading graph:', error);
        } finally {
            // Réactiver les événements après le chargement
            this.isUpdating = false;
            console.log('Events re-enabled');
        }
    }

    // Valider et corriger les positions de tous les éléments du graphe
    validateAllElementPositions() {
        if (!this.graph) return;

        // Valider les positions des éléments
        this.graph.getElements().forEach(element => {
            const pos = element.get('position');
            if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) {
                console.warn('Fixing invalid position for element:', element.id, pos);
                element.set('position', { x: 100, y: 100 }, { silent: true });
            }
        });

        // Valider les liens - supprimer ceux qui ont des sources/cibles invalides
        this.graph.getLinks().forEach(link => {
            const sourceId = link.get('source')?.id;
            const targetId = link.get('target')?.id;
            const sourceExists = sourceId && this.graph.getCell(sourceId);
            const targetExists = targetId && this.graph.getCell(targetId);

            if (!sourceExists || !targetExists) {
                console.warn('Removing invalid link:', link.id, 'source:', sourceId, 'target:', targetId);
                link.remove();
            }
        });
    }

    async saveGraph() {
        if (!this.graph || this.isUpdating) return;
        
        try {
            this.isUpdating = true;
            
            // Filtrer les éléments valides
            const validElements = this.graph.getElements().filter(el => el.stage_id);
            const validLinks = this.graph.getLinks().filter(link => {
                const source = this.graph.getCell(link.get('source').id);
                const target = this.graph.getCell(link.get('target').id);
                return link.route_id && source && target && source.stage_id && target.stage_id;
            });
            
            // Mettre à jour les positions des stages
            for (const element of validElements) {
                const position = element.position();
                // Ne sauvegarder que des positions valides
                const posX = (typeof position.x === 'number' && isFinite(position.x)) ? Math.round(position.x) : 100;
                const posY = (typeof position.y === 'number' && isFinite(position.y)) ? Math.round(position.y) : 100;
                await this.orm.write('request.stage', [element.stage_id], {
                    position_x: posX,
                    position_y: posY
                });
            }

            // Mettre à jour les routes si nécessaire
            for (const link of validLinks) {
                const source = this.graph.getCell(link.get('source').id);
                const target = this.graph.getCell(link.get('target').id);
                if (source && target) {
                    await this.orm.write('request.stage.route', [link.route_id], {
                        stage_from_id: source.stage_id,
                        stage_to_id: target.stage_id
                    });
                }
            }

        } catch (error) {
            console.error('Error saving graph:', error);
        } finally {
            this.isUpdating = false;
        }
    }

    promptLinkLabel(link) {
        const sourceId = link.get('source').id;
        const targetId = link.get('target').id;
        const sourceElement = this.graph.getCell(sourceId);
        const targetElement = this.graph.getCell(targetId);

        // Vérifier si les deux éléments sont des stages
        if (!sourceElement.stage_id || !targetElement.stage_id) {
            link.remove();
            return;
        }

        // Marquer le lien comme temporaire
        link.isTemporary = true;
        link.attr('line/strokeDasharray', '10 5'); // Style pointillé pour indiquer que c'est temporaire
        
        // Créer un contexte avec les données nécessaires
        const context = {
            'default_stage_from_id': sourceElement.stage_id,
            'default_stage_to_id': targetElement.stage_id,
            'default_type_id': this.props.record.resId,
        };


        // Appeler le wizard pour créer une nouvelle route
        this.env.services.action.doAction({
            type: 'ir.actions.act_window',
            res_model: 'request.stage.route',
            view_mode: 'form',
            view_type: 'form',
            views: [[false, 'form']],
            target: 'new',
            context: context
        }, {
            onClose: async (_result) => {
                try {
                    console.log('Form closing, preparing to reload...');
                    // Supprimer le lien temporaire
                    if (link && !link.removed) {
                        try {
                            link.remove();
                        } catch (removeError) {
                            console.warn('Error removing temporary link:', removeError);
                        }
                    }

                    // Attendre un peu pour que JointJS termine ses opérations
                    await new Promise(resolve => setTimeout(resolve, 100));

                    // Toujours recharger le graphique pour vérifier s'il y a de nouvelles routes
                    await this.reloadGraph();

                    // Note: On ne peut pas se fier à 'result' car il est souvent undefined
                    // Le rechargement du graphique montrera automatiquement les nouvelles routes
                    console.log('Form closed, graph reloaded');
                } catch (closeError) {
                    console.error('Error in onClose handler:', closeError);
                }
            }
        });
    }

    unselectAll() {
        // Déselectionner les éléments
        if (this.state.selectedElement) {
            const view = this.paper.findViewByModel(this.state.selectedElement);
            if (view) view.unhighlight();
            this.state.selectedElement = null;
            this.state.selectedElementName = null;
            this.state.selectedElementType = null;
        }
        
        // Réinitialiser les informations sur les liens
        this.state.selectedLink = null;
        this.state.selectedLinkName = null;
        this.state.selectedLinkFrom = null;
        this.state.selectedLinkTo = null;

        // Déselectionner les liens
        this.graph.getLinks().forEach(link => {
            const view = this.paper.findViewByModel(link);
            if (view) {
                view.hideTools();
                view.$el.removeClass('selected');
            }
            link.isSelected = false;
        });
    }

    selectLink(link) {
        // Désélectionner tout d'abord
        this.unselectAll();
        
        const view = this.paper.findViewByModel(link);
        if (view) {
            view.showTools();
            view.$el.addClass('selected');
            link.isSelected = true;
            
            // Récupérer les informations sur la route
            const sourceElement = this.graph.getCell(link.get('source').id);
            const targetElement = this.graph.getCell(link.get('target').id);
            
            this.state.selectedLink = link;
            this.state.selectedLinkName = link.labels()[0]?.attrs?.text?.text || 'Sans nom';
            this.state.selectedLinkFrom = sourceElement?.attr('label/text') || 'Inconnu';
            this.state.selectedLinkTo = targetElement?.attr('label/text') || 'Inconnu';
            
            // Enrichir les détails de la route
            this.state.selectedLinkDetails = this.getLinkDetails(link);
        }
    }

    openRouteEditWizard(link) {
        const sourceElement = this.graph.getCell(link.get('source').id);
        const targetElement = this.graph.getCell(link.get('target').id);

        // Créer un contexte avec les données nécessaires
        const context = {
            'default_source_stage_id': sourceElement.stage_id,
            'default_target_stage_id': targetElement.stage_id,
            'default_type_id': this.props.record.resId || this.props.record.data?.id,
        };

        // Ouvrir le formulaire de la route en mode édition
        this.env.services.action.doAction({
            type: 'ir.actions.act_window',
            res_model: 'request.stage.route',
            res_id: link.route_id,
            view_mode: 'form',
            view_type: 'form',
            views: [[false, 'form']],
            target: 'new',
            context: context
        }, {
            onClose: async (_result) => {
                // Recharger le graphique pour prendre en compte les modifications
                await this.reloadGraph();
            }
        });
    }

    openStageEditWizard(element) {
        if (!element.stage_id || typeof element.stage_id !== 'number') {
            console.error('Invalid stage_id for element:', element.stage_id);
            return;
        }

        // Créer un contexte avec les données nécessaires
        const context = {
            'default_type_id': this.props.record.resId || this.props.record.data?.id,
        };

        console.log('Opening stage edit wizard with ID:', element.stage_id);

        // Ouvrir le formulaire du stage en mode édition
        this.env.services.action.doAction({
            type: 'ir.actions.act_window',
            res_model: 'request.stage',
            res_id: element.stage_id,
            view_mode: 'form',
            view_type: 'form',
            views: [[false, 'form']],
            target: 'new',
            context: context
        }, {
            onClose: async (_result) => {
                // Recharger le graphique pour prendre en compte les modifications
                await this.reloadGraph();
            }
        });
    }
}

export const workflowGraphField = {
    component: WorkflowGraphField,
    supportedTypes: ["text", "char"],
    extractProps: ({ attrs }) => ({
        readonly: attrs.readonly,
    }),
};

registry.category("fields").add("workflow_graph", workflowGraphField); 