// js/drawingCanvas.js
console.log("drawingCanvas.js loaded");
window.XSheetApp = window.XSheetApp || {};

(function () {
    'use strict';

    /** Represents 1 stroke OR 1 shape */
    function makeObject(tool, style) {
        return {
            tool,     // "pen", "line", "rectangle", "ellipse"
            style,    // { color: "#RRGGBB", width: 2 }
            points: [], // Array of {x, y} objects
            // For "pen": multiple points
            // For "line", "rectangle", "ellipse": typically 2 points (start and end/corner)
            // Add other type-specific properties as needed, e.g., for text object: textContent, fontSize
        };
    }

    let ctx, canvas, xsheetContainer, toolsRef, projectDataRef;
    let currentDrawingObject = null; // The object currently being drawn by the user
    let isDrawing = false;           // Flag: mouse/pointer is down and drawing
    let lastKnownScrollX = 0;
    let lastKnownScrollY = 0;


    // --- Helper Functions ---

    function _getCanvasAndContainer() {
        if (!canvas && xsheetContainer) { // Initialize if not already done
            canvas = document.getElementById("drawingCanvasOverlay"); // Assuming it might exist
            if (!canvas) {
                canvas = document.createElement("canvas");
                canvas.id = "drawingCanvasOverlay";
                canvas.style.position = "absolute";
                // zIndex should be above waveform but below UI controls if any overlap
                canvas.style.zIndex = "15";
                // Pointer events are enabled when a drawing tool (not select) is active
                canvas.style.pointerEvents = "none";
                xsheetContainer.appendChild(canvas);
                ctx = canvas.getContext("2d");
                console.log("DrawingCanvas: Canvas element created and appended.");
            } else {
                ctx = canvas.getContext("2d");
                console.log("DrawingCanvas: Re-using existing canvas element.");
            }
        }
        return { canvas, ctx, xsheetContainer };
    }


    function _resizeAndPositionCanvas() {
        const elements = _getCanvasAndContainer();
        if (!elements.canvas || !elements.xsheetContainer) return;

        const containerRect = elements.xsheetContainer.getBoundingClientRect();
        const tableRect = document.getElementById('xsheetTable')?.getBoundingClientRect(); // Assumes table exists for alignment

        if (!tableRect) { // Fallback if table isn't rendered yet or not found
            elements.canvas.width = elements.xsheetContainer.clientWidth;
            elements.canvas.height = elements.xsheetContainer.clientHeight;
            elements.canvas.style.left = `0px`;
            elements.canvas.style.top = `0px`;
        } else {
            // Canvas should align with the scrollable content area of the table
            // Its top-left in the DOM should be (0,0) relative to xsheetContainer if table header is sticky
            // Or, if table header scrolls, then relative to table's actual top.
            // For now, assume it covers the whole xsheetContainer viewport.
            elements.canvas.style.left = `0px`;
            elements.canvas.style.top = `0px`;

            // The drawing surface needs to be the size of the *scrollable content* if drawings
            // are in world coordinates that scroll with the table.
            // OR, the canvas is viewport-sized, and drawings are translated by scrollOffset.
            // Let's go with viewport-sized canvas and translate drawings.
            if (elements.canvas.width !== elements.xsheetContainer.clientWidth) {
                elements.canvas.width = elements.xsheetContainer.clientWidth;
            }
            if (elements.canvas.height !== elements.xsheetContainer.clientHeight) {
                elements.canvas.height = elements.xsheetContainer.clientHeight;
            }
        }
        _redrawAllObjects(); // Redraw after resize
    }

    /** Convert mouse-event screen coordinates (clientX/Y) to canvas-local, scroll-adjusted coordinates */
    function _evtToCanvasSpace(evt) {
        const { canvas: currentCanvas, xsheetContainer: currentXSheetContainer } = _getCanvasAndContainer();
        if (!currentCanvas || !currentXSheetContainer) return { x: 0, y: 0 };

        const bounds = currentCanvas.getBoundingClientRect(); // Canvas position relative to viewport
        // Mouse position relative to canvas origin, then add current scroll of the container
        return {
            x: evt.clientX - bounds.left + currentXSheetContainer.scrollLeft,
            y: evt.clientY - bounds.top + currentXSheetContainer.scrollTop
        };
    }

    function _drawObject(objToDraw, drawingContext) {
        if (!objToDraw || !objToDraw.points || objToDraw.points.length === 0) return;

        const { xsheetContainer: currentXSheetContainer } = _getCanvasAndContainer();
        const scrollX = currentXSheetContainer ? currentXSheetContainer.scrollLeft : 0;
        const scrollY = currentXSheetContainer ? currentXSheetContainer.scrollTop : 0;

        drawingContext.strokeStyle = objToDraw.style.color;
        drawingContext.lineWidth = objToDraw.style.width;
        drawingContext.lineCap = "round";
        drawingContext.lineJoin = "round";

        drawingContext.beginPath();
        // Translate points by current scroll offset for drawing
        const firstPoint = objToDraw.points[0];
        drawingContext.moveTo(firstPoint.x - scrollX, firstPoint.y - scrollY);

        if (objToDraw.tool === "pen") {
            for (let i = 1; i < objToDraw.points.length; i++) {
                drawingContext.lineTo(objToDraw.points[i].x - scrollX, objToDraw.points[i].y - scrollY);
            }
        } else if (objToDraw.tool === "line" && objToDraw.points.length >= 2) {
            drawingContext.lineTo(objToDraw.points[1].x - scrollX, objToDraw.points[1].y - scrollY);
        } else if (objToDraw.tool === "rectangle" && objToDraw.points.length >= 2) {
            const p0 = objToDraw.points[0];
            const p1 = objToDraw.points[1];
            drawingContext.rect(p0.x - scrollX, p0.y - scrollY, p1.x - p0.x, p1.y - p0.y);
        } else if (objToDraw.tool === "ellipse" && objToDraw.points.length >= 2) {
            const p0 = objToDraw.points[0];
            const p1 = objToDraw.points[1];
            drawingContext.ellipse(
                (p0.x + p1.x) / 2 - scrollX, (p0.y + p1.y) / 2 - scrollY,
                Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2,
                0, 0, Math.PI * 2
            );
        }
        drawingContext.stroke();
    }

    function _redrawAllObjects() {
        const { canvas: currentCanvas, ctx: currentCtx, xsheetContainer: currentXSheetContainer } = _getCanvasAndContainer();
        if (!currentCanvas || !currentCtx || !projectDataRef || !currentXSheetContainer) return;

        currentCtx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);

        lastKnownScrollX = currentXSheetContainer.scrollLeft; // Update scroll cache
        lastKnownScrollY = currentXSheetContainer.scrollTop;

        const activeLayerIndex = projectDataRef.activeDrawingLayerIndex;
        if (projectDataRef.drawingLayers && projectDataRef.drawingLayers[activeLayerIndex]) {
            const activeLayer = projectDataRef.drawingLayers[activeLayerIndex];
            if (activeLayer.visible && activeLayer.objects) {
                activeLayer.objects.forEach(obj => _drawObject(obj, currentCtx));
            }
        }

        // If an object is currently being drawn, draw its temporary state
        if (currentDrawingObject) {
            _drawObject(currentDrawingObject, currentCtx);
        }
    }

    // --- Event Handlers ---
    function _onMouseDown(e) {
        if (e.button !== 0) return; // Only left click
        const { canvas: currentCanvas } = _getCanvasAndContainer();
        if (!currentCanvas || !toolsRef || !projectDataRef) return;

        const toolState = toolsRef.getCurrentState();
        if (toolState.tool === "select") {
            currentCanvas.style.pointerEvents = 'none'; // Let select tool handle events on a different layer/mechanism
            return;
        }

        currentCanvas.style.pointerEvents = 'auto'; // Ensure canvas captures events for drawing
        isDrawing = true;
        currentCanvas.setPointerCapture(e.pointerId); // Capture pointer for smoother dragging

        currentDrawingObject = makeObject(toolState.tool, toolState.style);
        const pos = _evtToCanvasSpace(e); // Coordinates are now relative to full scrollable content
        currentDrawingObject.points.push(pos);

        if (toolState.tool === "pen") {
            currentCanvas.addEventListener("pointermove", _onPointerMovePen);
        } else { // Line, Rectangle, Ellipse
            currentCanvas.addEventListener("pointermove", _onPointerMoveDragShape);
        }
        // No preventDefault, allow focus/etc.
    }

    function _onPointerMovePen(e) {
        if (!isDrawing || !currentDrawingObject) return;
        const pos = _evtToCanvasSpace(e);
        currentDrawingObject.points.push(pos);
        _redrawAllObjects();
    }

    function _onPointerMoveDragShape(e) {
        if (!isDrawing || !currentDrawingObject) return;
        const pos = _evtToCanvasSpace(e);
        currentDrawingObject.points[1] = pos; // Update the second point for shapes
        _redrawAllObjects();
    }

    function _onMouseUpOrPointerUp(e) { // Unified handler
        const { canvas: currentCanvas } = _getCanvasAndContainer();
        if (currentCanvas && e.pointerId) { // Check if e.pointerId is available
            try {
                if (currentCanvas.hasPointerCapture(e.pointerId)) {
                    currentCanvas.releasePointerCapture(e.pointerId);
                }
            } catch (err) { /* console.warn("Error releasing pointer capture:", err); */ }
        }

        if (!isDrawing) return; // Only act if we were drawing
        isDrawing = false;

        currentCanvas?.removeEventListener("pointermove", _onPointerMovePen);
        currentCanvas?.removeEventListener("pointermove", _onPointerMoveDragShape);

        if (currentDrawingObject) {
            // Filter out tiny objects (e.g. accidental clicks)
            if (currentDrawingObject.tool === "pen" && currentDrawingObject.points.length < 2) {
                currentDrawingObject = null;
            } else if (currentDrawingObject.tool !== "pen" && currentDrawingObject.points.length < 2) {
                currentDrawingObject = null;
            } else if (currentDrawingObject.tool !== "pen" && currentDrawingObject.points.length >= 2) {
                const p0 = currentDrawingObject.points[0];
                const p1 = currentDrawingObject.points[1];
                const dx = Math.abs(p1.x - p0.x);
                const dy = Math.abs(p1.y - p0.y);
                if (dx < 3 && dy < 3) { // Threshold for shapes
                    currentDrawingObject = null;
                }
            }

            if (currentDrawingObject) {
                projectDataRef.addDrawingObject(currentDrawingObject); // This will trigger 'drawingChanged'
                projectDataRef.isModified = true;
                // console.log("DrawingCanvas: Object added to projectData", currentDrawingObject);
            }
            currentDrawingObject = null;
        }
        _redrawAllObjects(); // Final redraw to show committed object or clear temp one
    }

    function _handleToolChange(event) {
        // console.log("DrawingCanvas: Tool changed to", event.detail.tool);
        const { canvas: currentCanvas } = _getCanvasAndContainer();
        if (!currentCanvas) return;

        if (event.detail.tool === "select") {
            currentCanvas.style.pointerEvents = 'none'; // Select tool might use different event handling
            currentCanvas.style.cursor = 'default';
        } else {
            currentCanvas.style.pointerEvents = 'auto';
            currentCanvas.style.cursor = 'crosshair';
        }
    }

    function _handleDrawingChanged(event) {
        // console.log("DrawingCanvas: drawingChanged event received", event.detail);
        _redrawAllObjects();
    }


    // --- Public API ---
    window.XSheetApp.DrawingCanvas = {
        init(projData, xsheetContainerEl, drawingToolsRefInstance) {
            if (!projData || !xsheetContainerEl || !drawingToolsRefInstance) {
                console.error("DrawingCanvas init: Missing one or more required arguments.");
                return;
            }
            projectDataRef = projData;
            xsheetContainer = xsheetContainerEl; // This is the scrollable div
            toolsRef = drawingToolsRefInstance;

            _getCanvasAndContainer(); // Creates canvas if it doesn't exist

            _resizeAndPositionCanvas(); // Initial sizing and positioning

            // Listen to scroll of the XSheet container to redraw with offset
            xsheetContainer.addEventListener("scroll", _redrawAllObjects);
            window.addEventListener("resize", _resizeAndPositionCanvas);

            // Mouse/Pointer events for drawing
            // Use pointer events for better stylus/touch compatibility
            canvas.addEventListener("pointerdown", _onMouseDown);
            // Up and Cancel are on window/document to catch events if mouse leaves canvas while pressed
            window.addEventListener("pointerup", _onMouseUpOrPointerUp);
            window.addEventListener("pointercancel", _onMouseUpOrPointerUp);


            // Listen for external changes that require redraw
            document.addEventListener("toolChanged", _handleToolChange);
            document.addEventListener("drawingChanged", _handleDrawingChanged); // From projectData.addDrawingObject or clearAllDrawings
            document.addEventListener("projectDataChanged", (e) => { // e.g. layer change, project load
                if (e.detail?.reason === 'projectLoaded' || e.detail?.reason === 'activeLayerChanged') {
                    _redrawAllObjects();
                }
            });


            console.log("DrawingCanvas initialised");
        },

        refresh: _redrawAllObjects, // Expose a manual refresh if needed
    };
})();