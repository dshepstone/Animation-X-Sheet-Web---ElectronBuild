// js/drawingTools.js
console.log("drawingTools.js loaded");
window.XSheetApp = window.XSheetApp || {};

(function () {
    'use strict';

    const TOOL_IDS = ["select", "pen", "line", "rectangle", "ellipse"];
    /** A simple stroke/shape style object */
    function makeStyle(color = "#FF0000", width = 2) { // Default color red, width 2
        return { color, width };
    }

    let state = {
        activeTool: "pen", // Default tool
        currentStyle: makeStyle(),
        toolbarEl: null,
        projectData: null, // Will be set by init
    };

    /** Dispatch a custom event when tool or style changes */
    function _notify() {
        document.dispatchEvent(
            new CustomEvent("toolChanged", {
                detail: {
                    tool: state.activeTool,
                    style: { ...state.currentStyle } // Send a copy
                }
            })
        );
    }

    /** Highlight the correct button in the toolbar */
    function _updateButtonUI() {
        if (!state.toolbarEl) return;
        state.toolbarEl.querySelectorAll("button[data-tool]").forEach((btn) => {
            const isActive = btn.dataset.tool === state.activeTool;
            btn.classList.toggle("active-tool", isActive);
            // Assuming active-tool class handles styling, or set styles directly:
            // btn.style.backgroundColor = isActive ? '#4CAF50' : 'white';
            // btn.style.color = isActive ? 'white' : 'black';
        });
    }

    window.XSheetApp.DrawingTools = {
        /** 
         * @param {ProjectData} projectDataInstance
         * @param {HTMLElement} toolbarContainerEl 
         */
        init(projectDataInstance, toolbarContainerEl) {
            if (!projectDataInstance || !toolbarContainerEl) {
                console.error("DrawingTools init: Missing projectData or toolbarContainerEl");
                return;
            }
            state.projectData = projectDataInstance;
            state.toolbarEl = toolbarContainerEl;

            // Wire tool buttons
            TOOL_IDS.forEach((id) => {
                const btn = state.toolbarEl.querySelector(`button[data-tool="${id}"]`);
                if (btn) {
                    btn.addEventListener("click", () => {
                        if (state.activeTool !== id) {
                            state.activeTool = id;
                            _updateButtonUI();
                            _notify();
                        }
                    });
                } else {
                    console.warn(`DrawingTools init: Button for tool "${id}" not found in toolbar.`);
                }
            });

            // Color picker
            const colorInput = state.toolbarEl.querySelector("#drawingColor");
            if (colorInput) {
                state.currentStyle.color = colorInput.value; // Initialize with current color picker value
                colorInput.addEventListener("input", (e) => {
                    state.currentStyle.color = e.target.value;
                    _notify();
                });
            } else {
                console.warn("DrawingTools init: Color picker #drawingColor not found.");
            }

            // Line-width select
            const widthSelect = state.toolbarEl.querySelector("#lineWidth");
            if (widthSelect) {
                state.currentStyle.width = parseInt(widthSelect.value, 10) || 2; // Initialize
                widthSelect.addEventListener("change", (e) => {
                    state.currentStyle.width = parseInt(e.target.value, 10) || 2;
                    _notify();
                });
            } else {
                console.warn("DrawingTools init: Line width select #lineWidth not found.");
            }

            // Initial UI update and notification
            _updateButtonUI(); // Highlight the default 'pen' tool
            _notify();
            console.log("DrawingTools initialised with state:", JSON.parse(JSON.stringify(state))); // Log a copy
        },

        /** Called by canvas when user starts a stroke and wants current params */
        getCurrentState() {
            return {
                tool: state.activeTool,
                style: { ...state.currentStyle } // Return a copy to prevent direct modification
            };
        },

        // Getter for active tool if needed by other modules (though event is preferred)
        getActiveTool() {
            return state.activeTool;
        }
    };
})();