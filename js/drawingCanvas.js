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

    // This will be assigned by the H-Lock IIFE later
    let _hLock_syncScrollTransforms = function () { };

    function _getCanvasAndContainer() {
        if (!xsheetContainer) {
            console.error("DrawingCanvas: xsheetContainer not set!");
            return { canvas: null, ctx: null, xsheetContainer: null };
        }
        if (!canvas) {
            canvas = document.getElementById("drawingCanvasOverlay");
            if (!canvas) {
                canvas = document.createElement("canvas"); canvas.id = "drawingCanvasOverlay";
                canvas.style.position = "absolute"; canvas.style.pointerEvents = "none";
                canvas.style.zIndex = "20";
                xsheetContainer.appendChild(canvas); ctx = canvas.getContext("2d");
            } else { ctx = canvas.getContext("2d"); }
        }
        return { canvas, ctx, xsheetContainer };
    }

    function _setCanvasStyleForScreen() {
        const elements = _getCanvasAndContainer();
        if (!elements.canvas || !elements.xsheetContainer) return;
        const { canvas: currentCanvas, xsheetContainer: currentXSheetContainer } = elements;

        const scrollX = currentXSheetContainer.scrollLeft; // Needed for H-Lock
        const scrollY = currentXSheetContainer.scrollTop;

        currentCanvas.style.position = "absolute";
        currentCanvas.style.left = `0px`; // H-Lock will apply translateX based on scrollX
        currentCanvas.style.top = `${scrollY}px`; // Pins canvas top to viewport top
        currentCanvas.style.zIndex = "20";
        currentCanvas.style.pointerEvents = (toolsRef && toolsRef.getActiveTool() === "select") ? "none" : "auto";

        const clientWidth = currentXSheetContainer.clientWidth;
        const clientHeight = currentXSheetContainer.clientHeight;

        if (currentCanvas.width !== clientWidth) currentCanvas.width = clientWidth;
        if (currentCanvas.height !== clientHeight) currentCanvas.height = clientHeight;
        currentCanvas.style.width = clientWidth + "px";
        currentCanvas.style.height = clientHeight + "px";

        if (typeof _hLock_syncScrollTransforms === 'function') {
            _hLock_syncScrollTransforms(); // Call H-Lock to apply translateX
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

    // Original _drawObject that translates coordinates for screen drawing
    function _drawObject_screen(objToDraw, drawingContext) {
        if (!objToDraw?.points?.length || !drawingContext) return;
        const { xsheetContainer: currentXSheetContainer } = _getCanvasAndContainer();
        const scrollX = currentXSheetContainer?.scrollLeft || 0;
        const scrollY = currentXSheetContainer?.scrollTop || 0;

        drawingContext.save();
        drawingContext.translate(-scrollX, -scrollY); // Apply scroll offset for screen drawing

        drawingContext.strokeStyle = objToDraw.style.color;
        drawingContext.lineWidth = objToDraw.style.width;
        drawingContext.lineCap = "round"; drawingContext.lineJoin = "round";
        drawingContext.beginPath();
        const firstPoint = objToDraw.points[0];
        drawingContext.moveTo(firstPoint.x, firstPoint.y);
        if (objToDraw.tool === "pen") {
            for (let i = 1; i < objToDraw.points.length; i++) drawingContext.lineTo(objToDraw.points[i].x, objToDraw.points[i].y);
        } else if (objToDraw.tool === "line" && objToDraw.points.length >= 2) {
            drawingContext.lineTo(objToDraw.points[1].x, objToDraw.points[1].y);
        } else if (objToDraw.tool === "rectangle" && objToDraw.points.length >= 2) {
            const p0 = objToDraw.points[0]; const p1 = objToDraw.points[1];
            drawingContext.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
        } else if (objToDraw.tool === "ellipse" && objToDraw.points.length >= 2) {
            const p0 = objToDraw.points[0]; const p1 = objToDraw.points[1];
            drawingContext.ellipse((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, 0, 0, Math.PI * 2);
        }
        drawingContext.stroke();
        drawingContext.restore();
    }

    // _drawObject for export (no scroll translation in context)
    function _drawObject_export(objToDraw, drawingContext) {
        if (!objToDraw?.points?.length || !drawingContext) return;
        drawingContext.strokeStyle = objToDraw.style.color;
        drawingContext.lineWidth = objToDraw.style.width;
        drawingContext.lineCap = "round"; drawingContext.lineJoin = "round";
        drawingContext.beginPath();
        const firstPoint = objToDraw.points[0];
        drawingContext.moveTo(firstPoint.x, firstPoint.y);
        if (objToDraw.tool === "pen") {
            for (let i = 1; i < objToDraw.points.length; i++) drawingContext.lineTo(objToDraw.points[i].x, objToDraw.points[i].y);
        } else if (objToDraw.tool === "line" && objToDraw.points.length >= 2) {
            drawingContext.lineTo(objToDraw.points[1].x, objToDraw.points[1].y);
        } else if (objToDraw.tool === "rectangle" && objToDraw.points.length >= 2) {
            const p0 = objToDraw.points[0]; const p1 = objToDraw.points[1];
            drawingContext.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
        } else if (objToDraw.tool === "ellipse" && objToDraw.points.length >= 2) {
            const p0 = objToDraw.points[0]; const p1 = objToDraw.points[1];
            drawingContext.ellipse((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, 0, 0, Math.PI * 2);
        }
        drawingContext.stroke();
    }


    function _redrawAllObjects() {
        const { canvas: currentCanvas, ctx: currentCtx } = _getCanvasAndContainer();
        if (!currentCanvas || !currentCtx || !projectDataRef) return;

        currentCtx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);

        const drawFn = isExportPrepared ? _drawObject_export : _drawObject_screen;

        const activeLayerIndex = projectDataRef.activeDrawingLayerIndex;
        if (projectDataRef.drawingLayers?.[activeLayerIndex]) {
            const activeLayer = projectDataRef.drawingLayers[activeLayerIndex];
            if (activeLayer.visible && activeLayer.objects) {
                activeLayer.objects.forEach(obj => drawFn(obj, currentCtx));
            }
        }
        if (currentDrawingObject) drawFn(currentDrawingObject, currentCtx);
    }

    function _onPointerDown(e) {
        if (!toolsRef || !canvas) return;
        if (e.button !== 0) return;

        // --- PATCHED CODE START ---
        const tool = toolsRef.getActiveTool();
        const style = {
            color: toolsRef.getActiveColor(),
            width: toolsRef.getActiveLineWidth()
        };
        // --- PATCHED CODE END ---

        if (tool === "select") return;
        const pt = _evtToCanvasWorldSpace(e);
        currentDrawingObject = makeObject(tool, style); // Pass the constructed tool and style
        currentDrawingObject.points.push(pt);
        isDrawing = true;
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault(); // Prevent text selection during drag
        if (tool === "pen") canvas.addEventListener("pointermove", _onPointerMovePen);
        else canvas.addEventListener("pointermove", _onPointerMoveDragShape);
    }
    function _onPointerMovePen(e) {
        if (!isDrawing || !currentDrawingObject || !canvas.hasPointerCapture(e.pointerId)) return;
        const pt = _evtToCanvasWorldSpace(e); currentDrawingObject.points.push(pt);
        _redrawAllObjects();
    }
    function _onPointerMoveDragShape(e) {
        if (!isDrawing || !currentDrawingObject || !canvas.hasPointerCapture(e.pointerId)) return;
        const pt = _evtToCanvasWorldSpace(e);
        if (currentDrawingObject.points.length === 1) currentDrawingObject.points.push(pt);
        else currentDrawingObject.points[1] = pt;
        _redrawAllObjects();
    }
    function _onPointerUpOrCancel(e) {
        if (!isDrawing || !currentDrawingObject) {
            if (canvas && e.pointerId && canvas.hasPointerCapture(e.pointerId)) { try { canvas.releasePointerCapture(e.pointerId); } catch (err) { } }
            isDrawing = false; return;
        }
        if (canvas && canvas.hasPointerCapture(e.pointerId)) { try { canvas.releasePointerCapture(e.pointerId); } catch (err) { } }
        isDrawing = false;
        let objectToCommit = currentDrawingObject; currentDrawingObject = null;
        canvas.removeEventListener("pointermove", _onPointerMovePen);
        canvas.removeEventListener("pointermove", _onPointerMoveDragShape);
        if (objectToCommit) { // Check if object is valid before committing
            let isValid = true;
            if (objectToCommit.tool === "pen" && objectToCommit.points.length < 2) isValid = false;
            else if (objectToCommit.tool !== "pen" && objectToCommit.points.length < 2) isValid = false;
            else if (objectToCommit.tool !== "pen" && objectToCommit.points.length >= 2) {
                const p0 = objectToCommit.points[0]; const p1 = objectToCommit.points[objectToCommit.points.length - 1];
                if (Math.abs(p1.x - p0.x) < 5 && Math.abs(p1.y - p0.y) < 5) isValid = false;
            }
            if (isValid) { projectDataRef.addDrawingObject(objectToCommit); projectDataRef.isModified = true; }
        }
        _redrawAllObjects();
    }
    function _handleToolChange(event) {
        const { canvas: currentCanvas } = _getCanvasAndContainer(); if (!currentCanvas) return;
        if (event.detail.tool === "select") { currentCanvas.style.pointerEvents = 'none'; currentCanvas.style.cursor = 'default'; }
        else { currentCanvas.style.pointerEvents = 'auto'; currentCanvas.style.cursor = 'crosshair'; }
    }
    function _handleDrawingDataChanged(event) { _redrawAllObjects(); }


    window.XSheetApp.DrawingCanvas = {
        init(projData, xsheetContainerEl, drawingToolsRefInstance) {
            if (!projData || !xsheetContainerEl || !drawingToolsRefInstance) { console.error("DrawingCanvas init: Missing args."); return; }
            projectDataRef = projData; xsheetContainer = xsheetContainerEl; toolsRef = drawingToolsRefInstance;
            _getCanvasAndContainer();
            if (!canvas || !ctx) { console.error("DrawingCanvas init: Failed to ensure canvas and context."); return; }
            _setCanvasStyleForScreen(); _redrawAllObjects();
            xsheetContainer.addEventListener("scroll", () => { if (!isExportPrepared) { _setCanvasStyleForScreen(); _redrawAllObjects(); } });
            window.addEventListener("resize", () => { if (!isExportPrepared) { _setCanvasStyleForScreen(); _redrawAllObjects(); } });
            canvas.addEventListener("pointerdown", _onPointerDown);
            window.addEventListener("pointerup", _onPointerUpOrCancel);
            window.addEventListener("pointercancel", _onPointerUpOrCancel);
            document.addEventListener("toolChanged", _handleToolChange); // Listens for 'toolChanged'
            document.addEventListener("drawingChanged", _handleDrawingDataChanged);
            document.addEventListener("projectDataChanged", (e) => {
                if (!isExportPrepared && (e.detail?.reason === 'projectLoaded' || e.detail?.reason === 'activeLayerChanged' || e.detail?.reason === 'newProject' || e.detail?.reason === 'audioCleared' || e.detail?.reason === 'frameCount')) {
                    _setCanvasStyleForScreen(); _redrawAllObjects();
                }
            });
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
                currentCanvas.style.transform = 'translateX(0px)';
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

    /******************************************************************
     *  H-Lock: translate the overlay left whenever the sheet scrolls
     ******************************************************************/
    (function addHorizontalLock() {
        let scroller, drawingOverlayCanvasElement;

        function initLockElements() {
            scroller = document.getElementById("xsheet-container");
            drawingOverlayCanvasElement = document.getElementById("drawingCanvasOverlay");
        }

        _hLock_syncScrollTransforms = function () {
            if (!scroller && !drawingOverlayCanvasElement) initLockElements();
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
                scroller.addEventListener("scroll", _hLock_syncScrollTransforms, { passive: true });
                _hLock_syncScrollTransforms();
            } else {
                setTimeout(setupScrollListener, 200);
            }
        }

        if (document.readyState === "complete" || document.readyState === "interactive") {
            setTimeout(setupScrollListener, 0);
        } else {
            document.addEventListener("DOMContentLoaded", () => setTimeout(setupScrollListener, 0));
        }

        function patchPrepareForExport() {
            if (window.XSheetApp.DrawingCanvas && window.XSheetApp.DrawingCanvas.prepareForExport) {
                const originalDCPrepareForExport = window.XSheetApp.DrawingCanvas.prepareForExport;
                window.XSheetApp.DrawingCanvas.prepareForExport = function (isPreparing) {
                    originalDCPrepareForExport.call(this, isPreparing);
                    if (!isPreparing) {
                        requestAnimationFrame(_hLock_syncScrollTransforms);
                    } else {
                        if (drawingOverlayCanvasElement) drawingOverlayCanvasElement.style.transform = 'none';
                    }
                };
            } else {
                setTimeout(patchPrepareForExport, 100);
            }
        }
        if (document.readyState === "complete" || document.readyState === "interactive") {
            setTimeout(patchPrepareForExport, 50);
        } else {
            document.addEventListener("DOMContentLoaded", () => setTimeout(patchPrepareForExport, 50));
        }
    })();
})();