// js/drawingCanvas.js
// ... (makeObject, other private vars at top of IIFE as before) ...
(function () {
    'use strict';
    function makeObject(tool, style) { return { tool, style, points: [] }; }
    let ctx, canvas, xsheetContainer, toolsRef, projectDataRef;
    let currentDrawingObject = null; let isDrawing = false;
    let originalCanvasStyleState = {}; // Store more complete style state
    let isExportPrepared = false;

    function _getCanvasAndContainer() { /* ... same ... */
        if (!canvas && xsheetContainer) {
            canvas = document.getElementById("drawingCanvasOverlay");
            if (!canvas) {
                canvas = document.createElement("canvas"); canvas.id = "drawingCanvasOverlay";
                xsheetContainer.appendChild(canvas); ctx = canvas.getContext("2d");
            } else { ctx = canvas.getContext("2d"); }
        }
        return { canvas, ctx, xsheetContainer };
    }

    function _setCanvasStyleForScreen() { // Sets canvas for normal screen interaction
        const elements = _getCanvasAndContainer();
        if (!elements.canvas || !elements.xsheetContainer) return;
        const { canvas: currentCanvas, xsheetContainer: currentXSheetContainer } = elements;

        currentCanvas.style.position = "absolute";
        currentCanvas.style.left = `0px`;
        currentCanvas.style.top = `0px`;
        currentCanvas.style.zIndex = "20"; // Ensure it's above waveform, etc.
        currentCanvas.style.pointerEvents = (toolsRef && toolsRef.getActiveTool() === "select") ? "none" : "auto";

        // Buffer size and CSS size match viewport for screen display
        const clientWidth = currentXSheetContainer.clientWidth;
        const clientHeight = currentXSheetContainer.clientHeight;
        if (currentCanvas.width !== clientWidth) currentCanvas.width = clientWidth;
        if (currentCanvas.height !== clientHeight) currentCanvas.height = clientHeight;
        currentCanvas.style.width = clientWidth + "px";
        currentCanvas.style.height = clientHeight + "px";
    }

    function _evtToCanvasWorldSpace(evt) { /* ... same ... */
        const { canvas: currentCanvas, xsheetContainer: currentXSheetContainer } = _getCanvasAndContainer();
        if (!currentCanvas || !currentXSheetContainer) return { x: 0, y: 0 };
        const bounds = currentCanvas.getBoundingClientRect();
        return {
            x: evt.clientX - bounds.left + currentXSheetContainer.scrollLeft,
            y: evt.clientY - bounds.top + currentXSheetContainer.scrollTop
        };
    }

    function _drawObject(objToDraw, drawingContext) { /* ... same (draws using world coords) ... */
        if (!objToDraw?.points?.length || !drawingContext) return;
        drawingContext.strokeStyle = objToDraw.style.color; drawingContext.lineWidth = objToDraw.style.width;
        drawingContext.lineCap = "round"; drawingContext.lineJoin = "round"; drawingContext.beginPath();
        const firstPoint = objToDraw.points[0]; drawingContext.moveTo(firstPoint.x, firstPoint.y);
        if (objToDraw.tool === "pen") { for (let i = 1; i < objToDraw.points.length; i++) drawingContext.lineTo(objToDraw.points[i].x, objToDraw.points[i].y); }
        else if (objToDraw.tool === "line" && objToDraw.points.length >= 2) { drawingContext.lineTo(objToDraw.points[1].x, objToDraw.points[1].y); }
        else if (objToDraw.tool === "rectangle" && objToDraw.points.length >= 2) { const p0 = objToDraw.points[0]; const p1 = objToDraw.points[1]; drawingContext.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y); }
        else if (objToDraw.tool === "ellipse" && objToDraw.points.length >= 2) { const p0 = objToDraw.points[0]; const p1 = objToDraw.points[1]; drawingContext.ellipse((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, 0, 0, Math.PI * 2); }
        drawingContext.stroke();
    }

    function _redrawAllObjects() {
        const { canvas: currentCanvas, ctx: currentCtx, xsheetContainer: currentXSheetContainer } = _getCanvasAndContainer();
        if (!currentCanvas || !currentCtx || !projectDataRef || !currentXSheetContainer) return;
        currentCtx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
        const scrollX = isExportPrepared ? 0 : currentXSheetContainer.scrollLeft;
        const scrollY = isExportPrepared ? 0 : currentXSheetContainer.scrollTop;
        currentCtx.save(); currentCtx.translate(-scrollX, -scrollY);
        const activeLayerIndex = projectDataRef.activeDrawingLayerIndex;
        if (projectDataRef.drawingLayers?.[activeLayerIndex]) {
            const activeLayer = projectDataRef.drawingLayers[activeLayerIndex];
            if (activeLayer.visible && activeLayer.objects) {
                activeLayer.objects.forEach(obj => _drawObject(obj, currentCtx));
            }
        }
        if (currentDrawingObject) _drawObject(currentDrawingObject, currentCtx);
        currentCtx.restore();
    }

    // Event Handlers _onPointerDown, _onPointerMovePen, _onPointerMoveDragShape, _onPointerUpOrCancel, 
    // _handleToolChange, _handleDrawingDataChanged can remain the same as previous complete version.
    function _onPointerDown(e) { /* ... same ... */
        if (e.button !== 0) return;
        const { canvas: currentCanvas } = _getCanvasAndContainer();
        if (!currentCanvas || !toolsRef || !projectDataRef) return;
        const toolState = toolsRef.getCurrentState();
        if (toolState.tool === "select") { currentCanvas.style.pointerEvents = 'none'; return; }
        currentCanvas.style.pointerEvents = 'auto'; isDrawing = true;
        currentCanvas.setPointerCapture(e.pointerId);
        currentDrawingObject = makeObject(toolState.tool, toolState.style);
        const pos = _evtToCanvasWorldSpace(e); currentDrawingObject.points.push(pos);
        if (toolState.tool === "pen") currentCanvas.addEventListener("pointermove", _onPointerMovePen);
        else currentCanvas.addEventListener("pointermove", _onPointerMoveDragShape);
    }
    function _onPointerMovePen(e) { /* ... same ... */
        if (!isDrawing || !currentDrawingObject) return;
        const pos = _evtToCanvasWorldSpace(e); currentDrawingObject.points.push(pos); _redrawAllObjects();
    }
    function _onPointerMoveDragShape(e) { /* ... same ... */
        if (!isDrawing || !currentDrawingObject) return;
        const pos = _evtToCanvasWorldSpace(e); currentDrawingObject.points[1] = pos; _redrawAllObjects();
    }
    function _onPointerUpOrCancel(e) { /* ... same ... */
        const { canvas: currentCanvas } = _getCanvasAndContainer();
        if (currentCanvas && e.pointerId && currentCanvas.hasPointerCapture(e.pointerId)) { currentCanvas.releasePointerCapture(e.pointerId); }
        if (!isDrawing) return; isDrawing = false;
        currentCanvas?.removeEventListener("pointermove", _onPointerMovePen);
        currentCanvas?.removeEventListener("pointermove", _onPointerMoveDragShape);
        if (currentDrawingObject) {
            if (currentDrawingObject.tool === "pen" && currentDrawingObject.points.length < 2) currentDrawingObject = null;
            else if (currentDrawingObject.tool !== "pen" && currentDrawingObject.points.length < 2) currentDrawingObject = null;
            else if (currentDrawingObject.tool !== "pen" && currentDrawingObject.points.length >= 2) {
                const p0 = currentDrawingObject.points[0]; const p1 = currentDrawingObject.points[1];
                if (Math.abs(p1.x - p0.x) < 3 && Math.abs(p1.y - p0.y) < 3) currentDrawingObject = null;
            }
            if (currentDrawingObject) { projectDataRef.addDrawingObject(currentDrawingObject); projectDataRef.isModified = true; }
            currentDrawingObject = null;
        }
        _redrawAllObjects();
    }
    function _handleToolChange(event) { /* ... same ... */
        const { canvas: currentCanvas } = _getCanvasAndContainer(); if (!currentCanvas) return;
        if (event.detail.tool === "select") { currentCanvas.style.pointerEvents = 'none'; currentCanvas.style.cursor = 'default'; }
        else { currentCanvas.style.pointerEvents = 'auto'; currentCanvas.style.cursor = 'crosshair'; }
    }
    function _handleDrawingDataChanged(event) { _redrawAllObjects(); }

    window.XSheetApp.DrawingCanvas = {
        init(projData, xsheetContainerEl, drawingToolsRefInstance) {
            // ... (init logic from previous, ensure canvas created and initial _setCanvasStyleForScreen() + _redrawAllObjects()) ...
            if (!projData || !xsheetContainerEl || !drawingToolsRefInstance) { console.error("DrawingCanvas init: Missing args."); return; }
            projectDataRef = projData; xsheetContainer = xsheetContainerEl; toolsRef = drawingToolsRefInstance;
            _getCanvasAndContainer();
            _setCanvasStyleForScreen(); // Setup for screen display
            _redrawAllObjects();

            xsheetContainer.addEventListener("scroll", () => _redrawAllObjects());
            window.addEventListener("resize", () => _setCanvasStyleForScreen());
            canvas.addEventListener("pointerdown", _onPointerDown);
            window.addEventListener("pointerup", _onPointerUpOrCancel);
            window.addEventListener("pointercancel", _onPointerUpOrCancel);
            document.addEventListener("toolChanged", _handleToolChange);
            document.addEventListener("drawingChanged", _handleDrawingDataChanged);
            document.addEventListener("projectDataChanged", (e) => {
                if (e.detail?.reason === 'projectLoaded' || e.detail?.reason === 'activeLayerChanged' || e.detail?.reason === 'newProject' || e.detail?.reason === 'audioCleared' || e.detail?.reason === 'frameCount') {
                    _setCanvasStyleForScreen(); // Re-evaluate screen size
                    _redrawAllObjects();
                }
            });
            // console.log("DrawingCanvas initialised");
        },
        refresh: () => _redrawAllObjects(),

        prepareForExport: function (isPreparing) {
            const { canvas: currentCanvas, xsheetContainer: currentXSheetContainer } = _getCanvasAndContainer();
            if (!currentCanvas || !currentXSheetContainer) return;

            isExportPrepared = isPreparing;

            if (isPreparing) {
                // console.log("DrawingCanvas: Preparing for export (full size)...");
                originalCanvasStyleState = { // Store current screen styles and buffer size
                    styleWidth: currentCanvas.style.width, styleHeight: currentCanvas.style.height,
                    stylePosition: currentCanvas.style.position, styleTop: currentCanvas.style.top,
                    styleLeft: currentCanvas.style.left, styleZIndex: currentCanvas.style.zIndex,
                    stylePointerEvents: currentCanvas.style.pointerEvents,
                    bufferWidth: currentCanvas.width, bufferHeight: currentCanvas.height
                };

                // For export, canvas buffer AND style dimensions match full scrollable content
                const fullWidth = currentXSheetContainer.scrollWidth;
                const fullHeight = currentXSheetContainer.scrollHeight;
                currentCanvas.width = fullWidth; currentCanvas.height = fullHeight;
                currentCanvas.style.width = fullWidth + "px"; currentCanvas.style.height = fullHeight + "px";

                // Canvas element is positioned at 0,0 of xsheetContainer (its offset parent)
                currentCanvas.style.position = 'absolute';
                currentCanvas.style.top = '0px';
                currentCanvas.style.left = '0px';
                // zIndex and pointerEvents are handled by exportPrintHandler during push/pop
            } else {
                // console.log("DrawingCanvas: Reverting to screen mode after export.");
                // Restore buffer size
                currentCanvas.width = originalCanvasStyleState.bufferWidth || currentXSheetContainer.clientWidth;
                currentCanvas.height = originalCanvasStyleState.bufferHeight || currentXSheetContainer.clientHeight;
                // Restore styles
                currentCanvas.style.width = originalCanvasStyleState.styleWidth || (currentXSheetContainer.clientWidth + "px");
                currentCanvas.style.height = originalCanvasStyleState.styleHeight || (currentXSheetContainer.clientHeight + "px");
                currentCanvas.style.position = originalCanvasStyleState.stylePosition || 'absolute';
                currentCanvas.style.top = originalCanvasStyleState.styleTop || '0px';
                currentCanvas.style.left = originalCanvasStyleState.styleLeft || '0px';
                currentCanvas.style.zIndex = originalCanvasStyleState.styleZIndex || '20';
                currentCanvas.style.pointerEvents = originalCanvasStyleState.stylePointerEvents || 'auto';
            }
            _redrawAllObjects(); // Redraw with the new mode (isExportPrepared will be true or false)
        }
    };
})();