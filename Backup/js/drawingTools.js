// js/drawingTools.js
console.log("drawingTools.js loaded.");
window.XSheetApp = window.XSheetApp || {};
window.XSheetApp.DrawingTools = {
    activeTool: 'pen',
    activeColor: '#FF0000',
    activeLineWidth: 2,

    init: function (projectData, toolbarContainerEl) {
        console.log("DrawingTools init.");
        this.projectData = projectData;
        this.toolbarContainer = toolbarContainerEl;

        // Get tool buttons
        this.toolButtons = this.toolbarContainer.querySelectorAll('[data-tool]');
        this.colorPicker = document.getElementById('drawingColor');
        this.lineWidthSelect = document.getElementById('lineWidth');
        this.clearButton = document.getElementById('btnClearAllDrawings');

        // Set up tool button listeners
        this.toolButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const tool = button.getAttribute('data-tool');
                this.setActiveTool(tool);
            });
        });

        // Set up color picker
        if (this.colorPicker) {
            this.colorPicker.addEventListener('change', (e) => {
                this.activeColor = e.target.value;
                document.dispatchEvent(new CustomEvent('drawingColorChanged', {
                    detail: { color: this.activeColor }
                }));
            });
        }

        // Set up line width
        if (this.lineWidthSelect) {
            this.lineWidthSelect.addEventListener('change', (e) => {
                this.activeLineWidth = parseInt(e.target.value);
                document.dispatchEvent(new CustomEvent('drawingLineWidthChanged', {
                    detail: { lineWidth: this.activeLineWidth }
                }));
            });
        }

        // Set up clear button
        if (this.clearButton) {
            this.clearButton.addEventListener('click', () => {
                if (confirm('Clear all drawings? This cannot be undone.')) {
                    document.dispatchEvent(new CustomEvent('clearAllDrawings'));
                }
            });
        }

        // Set initial tool
        this.setActiveTool(this.activeTool);
    },

    setActiveTool: function (toolName) {
        console.log("Setting active tool:", toolName);
        this.activeTool = toolName;

        // Update UI
        this.toolButtons.forEach(button => {
            if (button.getAttribute('data-tool') === toolName) {
                button.classList.add('active-tool');
            } else {
                button.classList.remove('active-tool');
            }
        });

        // Dispatch event - PATCHED EVENT NAME
        document.dispatchEvent(new CustomEvent('toolChanged', { // Corrected event name
            detail: { tool: toolName }
        }));
    },

    getActiveTool: function () {
        return this.activeTool;
    },

    getActiveColor: function () {
        return this.activeColor;
    },

    getActiveLineWidth: function () {
        return this.activeLineWidth;
    }
};