// js/drawingCanvas.js
console.log("drawingCanvas.js loaded");
window.XSheetApp = window.XSheetApp || {};

(function () {
    'use strict';

    function makeObject(tool, style) { return { tool, style, points: [] }; }

    let ctx, canvas, xsheetContainer, toolsRef, projectDataRef;
    let currentDrawingObject = null;
    let isDrawing = false;
    let isExportPrepared = false;
    let originalCanvasState = {};
    let activePointerId = null;

    let _hLock_syncScrollTransforms = function () { };

    function _getCanvasAndContainer() {
        if (!xsheetContainer) {
            // console.error("DrawingCanvas: xsheetContainer not set on first call to _getCanvasAndContainer!");
            // This might be called early by _setCanvasStyleForScreen if toolsRef is not ready
        }
        if (!canvas) {
            canvas = document.getElementById("drawingCanvasOverlay");
            if (!canvas) {
                if (xsheetContainer) { // Only create if container exists
                    canvas = document.createElement("canvas"); canvas.id = "drawingCanvasOverlay";
                    canvas.style.position = "absolute"; canvas.style.pointerEvents = "none";
                    canvas.style.zIndex = "20";
                    xsheetContainer.appendChild(canvas);
                    ctx = canvas.getContext("2d");
                } else {
                    // console.error("DrawingCanvas: Cannot create canvas, xsheetContainer not available yet.");
                    return { canvas: null, ctx: null, xsheetContainer: null };
                }
            } else {
                ctx = canvas.getContext("2d");
            }
        }
        return { canvas, ctx, xsheetContainer };
    }

    function _setCanvasStyleForScreen() {
        const elements = _getCanvasAndContainer();
        if (!elements.canvas || !elements.xsheetContainer) return; // Exit if canvas/container not ready
        const { canvas: currentCanvas, xsheetContainer: currentXSheetContainer } = elements;

        const scrollY = currentXSheetContainer.scrollTop;

        currentCanvas.style.position = "absolute";
        currentCanvas.style.left = `0px`;
        currentCanvas.style.top = `${scrollY}px`;
        currentCanvas.style.zIndex = "20";

        let currentToolName = "select";
        if (toolsRef && typeof toolsRef.getActiveTool === 'function') {
            currentToolName = toolsRef.getActiveTool();
        }
        currentCanvas.style.pointerEvents = (currentToolName === "select") ? "none" : "auto";
        currentCanvas.style.cursor = (currentToolName === "select") ? 'default' : 'crosshair';

        const clientWidth = currentXSheetContainer.clientWidth;
        const clientHeight = currentXSheetContainer.clientHeight;

        if (currentCanvas.width !== clientWidth) currentCanvas.width = clientWidth;
        if (currentCanvas.height !== clientHeight) currentCanvas.height = clientHeight;
        currentCanvas.style.width = clientWidth + "px";
        currentCanvas.style.height = clientHeight + "px";

        if (typeof _hLock_syncScrollTransforms === 'function') {
            _hLock_syncScrollTransforms();
        }
    }

    function _evtToCanvasWorldSpace(evt) {
        const { canvas: currentCanvas, xsheetContainer: currentXSheetContainer } = _getCanvasAndContainer();
        if (!currentCanvas || !currentXSheetContainer) return { x: 0, y: 0 };
        const bounds = currentCanvas.getBoundingClientRect();
        return {
            x: evt.clientX - bounds.left + currentXSheetContainer.scrollLeft,
            y: evt.clientY - bounds.top + currentXSheetContainer.scrollTop
        };
    }

    function _drawObject(objToDraw, drawingContext, isForExport) {
        if (!objToDraw?.style || !objToDraw.points || !drawingContext) return;
        // Allow drawing shapes even with only one point during drag (for preview)
        if (objToDraw.points.length === 0 && (objToDraw.tool === 'pen' || objToDraw.tool === 'line')) return;
        if (objToDraw.points.length < 1 && (objToDraw.tool === 'rectangle' || objToDraw.tool === 'ellipse')) return;


        drawingContext.save();

        if (!isForExport) {
            const { xsheetContainer: currentXSheetContainer } = _getCanvasAndContainer();
            const scrollX = currentXSheetContainer?.scrollLeft || 0;
            const scrollY = currentXSheetContainer?.scrollTop || 0;
            drawingContext.translate(-scrollX, -scrollY);
        }

        drawingContext.strokeStyle = objToDraw.style.color;
        drawingContext.lineWidth = objToDraw.style.width;
        drawingContext.lineCap = "round";
        drawingContext.lineJoin = "round";

        drawingContext.beginPath();

        const firstPoint = objToDraw.points[0];
        // For pen and line, we need moveTo. For rect/ellipse, their methods handle path creation.
        if (objToDraw.tool === "pen" || objToDraw.tool === "line") {
            if (!firstPoint) { drawingContext.restore(); return; } // Should have points
            drawingContext.moveTo(firstPoint.x, firstPoint.y);
        }

        if (objToDraw.tool === "pen") {
            for (let i = 1; i < objToDraw.points.length; i++) drawingContext.lineTo(objToDraw.points[i].x, objToDraw.points[i].y);
        } else if (objToDraw.tool === "line" && objToDraw.points.length >= 2) {
            drawingContext.lineTo(objToDraw.points[1].x, objToDraw.points[1].y);
        } else if (objToDraw.tool === "rectangle" && objToDraw.points.length >= 2) {
            const p0 = objToDraw.points[0]; const p1 = objToDraw.points[1];
            drawingContext.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
        } else if (objToDraw.tool === "ellipse" && objToDraw.points.length >= 2) {
            const p0 = objToDraw.points[0]; const p1 = objToDraw.points[1];
            if (p0 && p1) {
                drawingContext.ellipse(
                    (p0.x + p1.x) / 2,
                    (p0.y + p1.y) / 2,
                    Math.abs(p1.x - p0.x) / 2,
                    Math.abs(p1.y - p0.y) / 2,
                    0, 0, Math.PI * 2
                );
            }
        }
        drawingContext.stroke();
        drawingContext.restore();
    }

    function _redrawAllObjects() {
        const { canvas: currentCanvas, ctx: currentCtx } = _getCanvasAndContainer();
        if (!currentCanvas || !currentCtx || !projectDataRef) return;

        currentCtx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);

        const activeLayerIndex = projectDataRef.activeDrawingLayerIndex;
        if (projectDataRef.drawingLayers?.[activeLayerIndex]) {
            const activeLayer = projectDataRef.drawingLayers[activeLayerIndex];
            if (activeLayer.visible && activeLayer.objects) {
                activeLayer.objects.forEach(obj => _drawObject(obj, currentCtx, isExportPrepared));
            }
        }
        if (currentDrawingObject) {
            _drawObject(currentDrawingObject, currentCtx, isExportPrepared);
        }
    }

    function _resetDrawingState(e) {
        if (canvas) {
            canvas.removeEventListener("pointermove", _onPointerMovePen);
            canvas.removeEventListener("pointermove", _onPointerMoveDragShape);
            if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
                try { canvas.releasePointerCapture(activePointerId); } catch (err) { /* ignore */ }
            }
        }
        isDrawing = false;
        activePointerId = null;
        // currentDrawingObject is handled by the calling function (_onPointerUpOrCancel or _handleToolChange)
    }

    function _onPointerDown(e) {
        if (!toolsRef || !canvas || e.button !== 0) return;

        if (isDrawing) {
            console.warn("PointerDown called while isDrawing was true. Resetting.");
            // Don't commit, just reset. The previous interaction should have been finalized by its own pointerup/cancel.
            _resetDrawingState(e);
            currentDrawingObject = null;
        }

        const tool = toolsRef.getActiveTool();
        const style = {
            color: toolsRef.getActiveColor(),
            width: toolsRef.getActiveLineWidth()
        };

        if (tool === "select") return;

        activePointerId = e.pointerId;
        isDrawing = true;

        const pt = _evtToCanvasWorldSpace(e);
        currentDrawingObject = makeObject(tool, style);
        currentDrawingObject.points.push(pt);

        try {
            canvas.setPointerCapture(activePointerId);
        } catch (err) {
            console.error("Failed to set pointer capture:", err);
            _resetDrawingState(e);
            currentDrawingObject = null;
            isDrawing = false;
            return;
        }
        e.preventDefault();

        if (tool === "pen") {
            canvas.addEventListener("pointermove", _onPointerMovePen);
        } else {
            canvas.addEventListener("pointermove", _onPointerMoveDragShape);
        }
        _redrawAllObjects();
    }

    function _onPointerMovePen(e) {
        if (!isDrawing || !currentDrawingObject || e.pointerId !== activePointerId) return;
        const pt = _evtToCanvasWorldSpace(e);
        currentDrawingObject.points.push(pt);
        _redrawAllObjects();
    }

    function _onPointerMoveDragShape(e) {
        if (!isDrawing || !currentDrawingObject || e.pointerId !== activePointerId) return;
        const pt = _evtToCanvasWorldSpace(e);
        if (currentDrawingObject.points.length === 1) currentDrawingObject.points.push(pt);
        else if (currentDrawingObject.points.length >= 2) currentDrawingObject.points[1] = pt;
        _redrawAllObjects();
    }

    function _onPointerUpOrCancel(e) {
        if (!isDrawing || (activePointerId !== null && e.pointerId !== activePointerId && e.type !== "pointercancel" && e.type !== "toolchange_cancel")) {
            if (canvas && e.pointerId && canvas.hasPointerCapture(e.pointerId)) {
                try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
            }
            return;
        }

        const objectToCommit = currentDrawingObject;

        _resetDrawingState(e);

        if (e.type !== "pointercancel" && e.type !== "toolchange_cancel" && objectToCommit) {
            let isValid = true;
            if (!objectToCommit.points || objectToCommit.points.length === 0) {
                isValid = false;
            } else if (objectToCommit.tool === "pen" && objectToCommit.points.length < 2) {
                isValid = false;
            } else if (objectToCommit.tool !== "pen" && objectToCommit.points.length < 2) {
                isValid = false;
            } else if (objectToCommit.tool !== "pen" && objectToCommit.points.length >= 2) {
                const p0 = objectToCommit.points[0];
                const p1 = objectToCommit.points[1];
                if (!p0 || !p1 || (Math.abs(p1.x - p0.x) < 3 && Math.abs(p1.y - p0.y) < 3)) {
                    isValid = false;
                }
            }

            if (isValid) {
                projectDataRef.addDrawingObject(objectToCommit);
                projectDataRef.isModified = true;
            }
        }
        currentDrawingObject = null;
        _redrawAllObjects();
    }

    function _handleToolChange(event) {
        if (isDrawing) {
            console.log("Tool changed during active drawing. Cancelling drawing.");
            _onPointerUpOrCancel({ type: 'toolchange_cancel', pointerId: activePointerId }); // Simulate cancel
            currentDrawingObject = null; // Ensure it's cleared after cancel simulation
        }

        const { canvas: currentCanvas } = _getCanvasAndContainer(); if (!currentCanvas) return;
        const newTool = event.detail.tool;
        if (newTool === "select") {
            currentCanvas.style.pointerEvents = 'none';
            currentCanvas.style.cursor = 'default';
        } else {
            currentCanvas.style.pointerEvents = 'auto';
            currentCanvas.style.cursor = 'crosshair';
        }
    }
    function _handleDrawingDataChanged(event) { _redrawAllObjects(); }


    window.XSheetApp.DrawingCanvas = {
        _onScrollOrResizeBound: null,
        _onProjectDataChangedBound: null,

        init(projData, xsheetContainerEl, drawingToolsRefInstance) {
            if (!projData || !xsheetContainerEl || !drawingToolsRefInstance) {
                console.error("DrawingCanvas init: Missing args."); return;
            }
            projectDataRef = projData;
            xsheetContainer = xsheetContainerEl;
            toolsRef = drawingToolsRefInstance;

            _getCanvasAndContainer();
            if (!canvas || !ctx) {
                console.error("DrawingCanvas init: Failed to ensure canvas and context."); return;
            }

            this._onScrollOrResizeBound = () => {
                if (!isExportPrepared) { _setCanvasStyleForScreen(); _redrawAllObjects(); }
            };
            this._onProjectDataChangedBound = (e) => {
                if (!isExportPrepared && (e.detail?.reason === 'projectLoaded' || e.detail?.reason === 'activeLayerChanged' || e.detail?.reason === 'newProject' || e.detail?.reason === 'audioCleared' || e.detail?.reason === 'frameCount')) {
                    _setCanvasStyleForScreen(); _redrawAllObjects();
                }
            };

            xsheetContainer.removeEventListener("scroll", this._onScrollOrResizeBound);
            window.removeEventListener("resize", this._onScrollOrResizeBound);
            canvas.removeEventListener("pointerdown", _onPointerDown);
            window.removeEventListener("pointerup", _onPointerUpOrCancel);
            window.removeEventListener("pointercancel", _onPointerUpOrCancel);
            document.removeEventListener("toolChanged", _handleToolChange);
            document.removeEventListener("drawingChanged", _handleDrawingDataChanged);
            document.removeEventListener("projectDataChanged", this._onProjectDataChangedBound);

            xsheetContainer.addEventListener("scroll", this._onScrollOrResizeBound);
            window.addEventListener("resize", this._onScrollOrResizeBound);
            canvas.addEventListener("pointerdown", _onPointerDown);
            window.addEventListener("pointerup", _onPointerUpOrCancel);
            window.addEventListener("pointercancel", _onPointerUpOrCancel);
            document.addEventListener("toolChanged", _handleToolChange);
            document.addEventListener("drawingChanged", _handleDrawingDataChanged);
            document.addEventListener("projectDataChanged", this._onProjectDataChangedBound);

            _setCanvasStyleForScreen();
            _redrawAllObjects();
            console.log("DrawingCanvas initialized.");
        },

        refresh: () => _redrawAllObjects(),

        prepareForExport: function (isPreparing) {
            const { canvas: currentCanvas, xsheetContainer: currentXSheetContainer } = _getCanvasAndContainer();
            if (!currentCanvas || !currentXSheetContainer) return;
            isExportPrepared = isPreparing;
            if (isPreparing) {
                originalCanvasState = {
                    styleWidth: currentCanvas.style.width, styleHeight: currentCanvas.style.height,
                    stylePosition: currentCanvas.style.position, styleTop: currentCanvas.style.top,
                    styleLeft: currentCanvas.style.left, styleZIndex: currentCanvas.style.zIndex,
                    stylePointerEvents: currentCanvas.style.pointerEvents,
                    transform: currentCanvas.style.transform,
                    bufferWidth: currentCanvas.width, bufferHeight: currentCanvas.height
                };
                const fullWidth = currentXSheetContainer.scrollWidth;
                const fullHeight = currentXSheetContainer.scrollHeight;
                currentCanvas.width = fullWidth; currentCanvas.height = fullHeight;
                currentCanvas.style.width = fullWidth + "px"; currentCanvas.style.height = fullHeight + "px";
                currentCanvas.style.position = 'absolute';
                currentCanvas.style.top = '0px';
                currentCanvas.style.left = '0px';
                currentCanvas.style.transform = 'none';
            } else {
                if (originalCanvasState.bufferWidth !== undefined) {
                    currentCanvas.width = originalCanvasState.bufferWidth;
                    currentCanvas.height = originalCanvasState.bufferHeight;
                    currentCanvas.style.width = originalCanvasState.styleWidth;
                    currentCanvas.style.height = originalCanvasState.styleHeight;
                    currentCanvas.style.position = originalCanvasState.stylePosition;
                    currentCanvas.style.zIndex = originalCanvasState.styleZIndex;
                    currentCanvas.style.pointerEvents = originalCanvasState.stylePointerEvents;
                }
                _setCanvasStyleForScreen();
            }
            _redrawAllObjects();
        }
    };

    (function addHorizontalLock() {
        let scroller, drawingOverlayCanvasElement;

        function initLockElements() {
            scroller = document.getElementById("xsheet-container");
            drawingOverlayCanvasElement = document.getElementById("drawingCanvasOverlay");
        }

        _hLock_syncScrollTransforms = function () {
            if (!scroller && !drawingOverlayCanvasElement) { initLockElements(); }
            if (!scroller || !drawingOverlayCanvasElement) return;

            if (!isExportPrepared) {
                const scrollLeft = scroller.scrollLeft;
                drawingOverlayCanvasElement.style.transform = `translateX(${-scrollLeft}px)`;
            } else {
                if (drawingOverlayCanvasElement) drawingOverlayCanvasElement.style.transform = 'none';
            }
        }

        function setupScrollListener() {
            if (!scroller) initLockElements();
            if (scroller) {
                scroller.removeEventListener("scroll", _hLock_syncScrollTransforms);
                scroller.addEventListener("scroll", _hLock_syncScrollTransforms, { passive: true });
                _hLock_syncScrollTransforms();
            } else {
                setTimeout(setupScrollListener, 200);
            }
        }

        if (document.readyState === "complete" || document.readyState === "interactive") {
            setTimeout(() => { setupScrollListener(); }, 0);
        } else {
            document.addEventListener("DOMContentLoaded", () => { setupScrollListener(); });
        }
    })();
})();