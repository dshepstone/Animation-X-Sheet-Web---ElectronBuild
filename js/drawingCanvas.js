// js/drawingCanvas.js – COMPLETE VERSION with columnLayoutAdjusted handling
console.log("drawingCanvas.js loaded (with columnLayoutAdjusted handling)");
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
    let pointerType = 'mouse';
    let isPenHovering = false;
    let lastPressure = 0.5;

    let _hLock_syncScrollTransforms = function () { };

    function _getCanvasAndContainer() {
        if (!xsheetContainer) { /* Will be set on init */ }
        if (!canvas) {
            canvas = document.getElementById('drawingCanvasOverlay');
            if (!canvas) {
                if (xsheetContainer) {
                    canvas = document.createElement('canvas');
                    canvas.id = 'drawingCanvasOverlay';
                    canvas.style.position = 'absolute';
                    canvas.style.pointerEvents = 'none';
                    canvas.style.zIndex = '20';
                    xsheetContainer.appendChild(canvas);
                    ctx = canvas.getContext('2d');
                } else { return { canvas: null, ctx: null, xsheetContainer: null }; }
            } else { ctx = canvas.getContext('2d'); }
        }
        return { canvas, ctx, xsheetContainer };
    }

    function _setCanvasStyleForScreen() {
        const { canvas: cvs, xsheetContainer: cont } = _getCanvasAndContainer();
        if (!cvs || !cont) return;

        const scrollY = cont.scrollTop;
        cvs.style.position = 'absolute';
        cvs.style.left = '0px';
        cvs.style.top = `${scrollY}px`;
        cvs.style.zIndex = '20';

        let currentTool = 'select';
        if (toolsRef && typeof toolsRef.getActiveTool === 'function') {
            currentTool = toolsRef.getActiveTool();
        }
        cvs.style.pointerEvents = currentTool === 'select' ? 'none' : 'auto';

        if (currentTool === 'select') cvs.style.cursor = 'default';
        else if (currentTool === 'eraser') cvs.style.cursor = 'crosshair';
        else if (pointerType === 'pen') cvs.style.cursor = 'crosshair';
        else cvs.style.cursor = 'crosshair';

        const w = cont.clientWidth;
        const h = cont.clientHeight;
        if (cvs.width !== w) cvs.width = w;
        if (cvs.height !== h) cvs.height = h;
        cvs.style.width = w + 'px';
        cvs.style.height = h + 'px';

        if (typeof _hLock_syncScrollTransforms === 'function') _hLock_syncScrollTransforms();
    }

    function _evtToCanvasWorldSpace(evt) {
        const { canvas: cvs, xsheetContainer: cont } = _getCanvasAndContainer();
        if (!cvs || !cont) return { x: 0, y: 0 };
        const bounds = cvs.getBoundingClientRect();
        return {
            x: evt.clientX - bounds.left + cont.scrollLeft,
            y: evt.clientY - bounds.top + cont.scrollTop
        };
    }

    function _getEffectiveLineWidth(base, pressure) {
        if (pointerType === 'pen' && pressure > 0) {
            const mult = Math.max(0.3, Math.min(1.5, 0.5 + pressure));
            return Math.max(1, Math.round(base * mult));
        }
        return base;
    }

    function _drawObject(obj, drawingContext, exporting) {
        if (!obj || !obj.style || !obj.points || !drawingContext || obj.points.length === 0) return;
        drawingContext.save();
        if (!exporting) {
            const { xsheetContainer: cont } = _getCanvasAndContainer();
            if (cont) drawingContext.translate(-cont.scrollLeft, -cont.scrollTop);
        }
        drawingContext.strokeStyle = obj.style.color;
        drawingContext.lineCap = 'round';
        drawingContext.lineJoin = 'round';

        if (obj.tool === 'pen' && obj.points.length > 1 && obj.points.some(p => typeof p.pressure === 'number')) {
            for (let i = 1; i < obj.points.length; i++) {
                const prev = obj.points[i - 1];
                const cur = obj.points[i];
                const avgPressure = ((prev.pressure || 0.5) + (cur.pressure || 0.5)) / 2;
                drawingContext.lineWidth = _getEffectiveLineWidth(obj.style.width, avgPressure);
                drawingContext.beginPath();
                drawingContext.moveTo(prev.x, prev.y);
                drawingContext.lineTo(cur.x, cur.y);
                drawingContext.stroke();
            }
        } else {
            drawingContext.lineWidth = obj.style.width;
            drawingContext.beginPath();
            const p0 = obj.points[0];
            if (obj.tool === 'pen' || obj.tool === 'line') { if (!p0) { drawingContext.restore(); return; } drawingContext.moveTo(p0.x, p0.y); }
            if (obj.tool === 'pen') {
                for (let i = 1; i < obj.points.length; i++) drawingContext.lineTo(obj.points[i].x, obj.points[i].y);
            } else if (obj.tool === 'line' && obj.points.length >= 2) {
                drawingContext.lineTo(obj.points[1].x, obj.points[1].y);
            } else if (obj.tool === 'rectangle' && obj.points.length >= 2) {
                const p1 = obj.points[1];
                drawingContext.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
            } else if (obj.tool === 'ellipse' && obj.points.length >= 2) {
                const p1 = obj.points[1];
                if (p0 && p1) drawingContext.ellipse((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, 0, 0, Math.PI * 2);
            }
            drawingContext.stroke();
        }
        drawingContext.restore();
    }

    function _redrawAllObjects() {
        const { canvas: cvs, ctx: context } = _getCanvasAndContainer();
        if (!cvs || !context || !projectDataRef) return;
        context.clearRect(0, 0, cvs.width, cvs.height);
        const layerIdx = projectDataRef.activeDrawingLayerIndex;
        const layer = projectDataRef.drawingLayers?.[layerIdx];
        if (layer?.visible && layer.objects) layer.objects.forEach(obj => _drawObject(obj, context, isExportPrepared));
        if (currentDrawingObject) _drawObject(currentDrawingObject, context, isExportPrepared);
    }

    function _resetDrawingState(e) {
        if (canvas) {
            canvas.removeEventListener("pointermove", _onPointerMovePen);
            canvas.removeEventListener("pointermove", _onPointerMoveDragShape);
            canvas.removeEventListener("pointermove", _onPointerMoveEraser);
            if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
                try { canvas.releasePointerCapture(activePointerId); } catch (err) { /* ignore */ }
            }
        }
        isDrawing = false; activePointerId = null; isPenHovering = false;
    }

    function _onPointerDown(e) {
        if (!toolsRef || !canvas || (e.button !== 0 && e.button !== undefined)) return;
        pointerType = e.pointerType || 'mouse'; lastPressure = e.pressure || 0.5;
        if (pointerType === 'pen' && e.width && e.height && (e.width * e.height > 400)) { console.log("DrawingCanvas: Palm detected - ignoring"); return; }
        if (isDrawing) { _resetDrawingState(e); currentDrawingObject = null; }

        const tool = toolsRef.getActiveTool();
        const style = { color: toolsRef.getActiveColor(), width: toolsRef.getActiveLineWidth() };

        if (tool === "select") return;
        if (tool === "eraser") {
            const pt = _evtToCanvasWorldSpace(e);
            if (toolsRef.eraseAtPoint(pt.x, pt.y, toolsRef.getActiveLineWidth() * 3)) _redrawAllObjects();
            activePointerId = e.pointerId; isDrawing = true;
            try { canvas.setPointerCapture(activePointerId); } catch (err) { _resetDrawingState(e); isDrawing = false; return; }
            canvas.addEventListener("pointermove", _onPointerMoveEraser); e.preventDefault(); return;
        }
        activePointerId = e.pointerId; isDrawing = true; isPenHovering = false;
        const pt = _evtToCanvasWorldSpace(e); if (pointerType === 'pen') pt.pressure = e.pressure || 0.5;
        currentDrawingObject = makeObject(tool, style); currentDrawingObject.points.push(pt);
        try { canvas.setPointerCapture(activePointerId); } catch (err) { _resetDrawingState(e); currentDrawingObject = null; isDrawing = false; return; }
        e.preventDefault();
        canvas.addEventListener("pointermove", tool === "pen" ? _onPointerMovePen : _onPointerMoveDragShape);
        _redrawAllObjects();
    }

    function _onPointerMovePen(e) {
        if (!isDrawing || !currentDrawingObject || e.pointerId !== activePointerId) return;
        const pt = _evtToCanvasWorldSpace(e); if (pointerType === 'pen') { pt.pressure = e.pressure || lastPressure; lastPressure = pt.pressure; }
        currentDrawingObject.points.push(pt); _redrawAllObjects();
    }

    function _onPointerMoveDragShape(e) {
        if (!isDrawing || !currentDrawingObject || e.pointerId !== activePointerId) return;
        const pt = _evtToCanvasWorldSpace(e); if (pointerType === 'pen') { pt.pressure = e.pressure || lastPressure; lastPressure = pt.pressure; }
        if (currentDrawingObject.points.length === 1) currentDrawingObject.points.push(pt);
        else if (currentDrawingObject.points.length >= 2) currentDrawingObject.points[1] = pt;
        _redrawAllObjects();
    }

    function _onPointerMoveEraser(e) {
        if (!isDrawing || e.pointerId !== activePointerId || !toolsRef) return;
        const pt = _evtToCanvasWorldSpace(e);
        if (toolsRef.eraseAtPoint(pt.x, pt.y, toolsRef.getActiveLineWidth() * 3)) _redrawAllObjects();
    }

    function _onPointerEnter(e) { if (e.pointerType === 'pen' && !isDrawing) { pointerType = 'pen'; isPenHovering = true; _setCanvasStyleForScreen(); } }
    function _onPointerLeave(e) { if (e.pointerType === 'pen') { isPenHovering = false; _redrawAllObjects(); } }
    function _onPointerMove(e) { if (e.pointerType === 'pen' && !isDrawing) { pointerType = 'pen'; isPenHovering = true; } }

    function _onPointerUpOrCancel(e) {
        if (!isDrawing || (activePointerId !== null && e.pointerId !== activePointerId && e.type !== "pointercancel" && e.type !== "toolchange_cancel")) {
            if (canvas && e.pointerId && canvas.hasPointerCapture(e.pointerId)) try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
            return;
        }
        const objectToCommit = currentDrawingObject;
        _resetDrawingState(e);

        if (toolsRef && toolsRef.getActiveTool() === "eraser") { currentDrawingObject = null; return; }

        if (e.type !== "pointercancel" && e.type !== "toolchange_cancel" && objectToCommit) {
            let isValid = true;
            if (!objectToCommit.points || objectToCommit.points.length === 0) isValid = false;
            else if (objectToCommit.tool === "pen" && objectToCommit.points.length < 2) isValid = false;
            else if (objectToCommit.tool !== "pen" && objectToCommit.points.length < 2) isValid = false;
            else if (objectToCommit.tool !== "pen" && objectToCommit.points.length >= 2) {
                const p0 = objectToCommit.points[0], p1 = objectToCommit.points[1];
                if (!p0 || !p1 || (Math.abs(p1.x - p0.x) < 3 && Math.abs(p1.y - p0.y) < 3)) isValid = false;
            }
            if (isValid) { projectDataRef.addDrawingObject(objectToCommit); projectDataRef.isModified = true; }
        }
        currentDrawingObject = null;
        _redrawAllObjects();
    }

    function _handleToolChange(evt) {
        if (isDrawing) { _onPointerUpOrCancel({ type: 'toolchange_cancel', pointerId: activePointerId }); currentDrawingObject = null; }
        _setCanvasStyleForScreen();
    }

    function _handleDrawingDataChanged(event) {
        console.log('DrawingCanvas: Drawing data changed:', event.detail);
        const reason = event.detail?.reason;
        if (reason === 'coordinateTransform' ||
            reason === 'columnLayoutAdjusted' ||
            reason === 'layoutPossiblyChanged_noTransform') {

            if (reason === 'coordinateTransform') console.log(`DrawingCanvas: Coords transformed (e.g. scale) for ${event.detail.transformedObjects || 'N/A'} objects.`);
            else if (reason === 'columnLayoutAdjusted') console.log(`DrawingCanvas: Coords adjusted for column layout. Shift: ${event.detail?.shiftAmount?.toFixed(2)}, OriginalMarker: ${event.detail?.originalMarker?.toFixed(1)}`);
            else if (reason === 'layoutPossiblyChanged_noTransform') console.log(`DrawingCanvas: Layout possibly changed, refreshing canvas style.`);

            _setCanvasStyleForScreen();
        }
        _redrawAllObjects();
    }

    window.XSheetApp.DrawingCanvas = {
        _onScrollOrResizeBound: null,
        _onProjectDataChangedBound: null,
        init(projData, xsheetContainerEl, drawingToolsRef) {
            if (!projData || !xsheetContainerEl || !drawingToolsRef) { console.error('DrawingCanvas init: Missing arguments'); return; }
            projectDataRef = projData; xsheetContainer = xsheetContainerEl; toolsRef = drawingToolsRef;

            _getCanvasAndContainer();
            if (!canvas || !ctx) { console.error('DrawingCanvas init: Failed to create canvas'); return; }

            this._onScrollOrResizeBound = () => { if (!isExportPrepared) { _setCanvasStyleForScreen(); _redrawAllObjects(); } };
            xsheetContainer.addEventListener('scroll', this._onScrollOrResizeBound);
            window.addEventListener('resize', this._onScrollOrResizeBound);

            this._onProjectDataChangedBound = (e) => {
                const r = e.detail?.reason;
                if (!isExportPrepared && (r === 'projectLoaded' || r === 'activeLayerChanged' || r === 'newProject' || r === 'audioCleared' || r === 'frameCount' || r === 'columnAdded' || r === 'columnRemoved')) {
                    console.log(`DrawingCanvas: Project data changed due to '${r}', refreshing canvas style and redrawing.`);
                    _setCanvasStyleForScreen();
                    _redrawAllObjects();
                }
            };
            document.addEventListener('projectDataChanged', this._onProjectDataChangedBound);

            document.addEventListener('customColumnsChanged', () => {
                console.log('DrawingCanvas: Custom columns changed - refreshing canvas style and redrawing.');
                if (!isExportPrepared) {
                    _setCanvasStyleForScreen();
                    _redrawAllObjects();
                }
            });

            document.addEventListener('toolChanged', _handleToolChange);
            document.addEventListener('drawingChanged', _handleDrawingDataChanged);

            canvas.addEventListener('pointerdown', _onPointerDown);
            canvas.addEventListener('pointerenter', _onPointerEnter);
            canvas.addEventListener('pointerleave', _onPointerLeave);
            canvas.addEventListener('pointermove', _onPointerMove);
            window.addEventListener('pointerup', _onPointerUpOrCancel);
            window.addEventListener('pointercancel', _onPointerUpOrCancel);

            if (canvas.style) canvas.style.touchAction = 'none';

            _setCanvasStyleForScreen();
            _redrawAllObjects();
            console.log('DrawingCanvas initialized (for fixed left CSS columns drawing adjustment).');
        },
        refresh() { _setCanvasStyleForScreen(); _redrawAllObjects(); },
        prepareForExport(isPreparing) {
            const { canvas: cvs, xsheetContainer: cont } = _getCanvasAndContainer(); if (!cvs || !cont) return;
            isExportPrepared = isPreparing;
            if (isPreparing) {
                originalCanvasState = {
                    styleWidth: cvs.style.width, styleHeight: cvs.style.height, stylePosition: cvs.style.position,
                    styleTop: cvs.style.top, styleLeft: cvs.style.left, styleZIndex: cvs.style.zIndex,
                    stylePointerEvents: cvs.style.pointerEvents, transform: cvs.style.transform,
                    bufferWidth: cvs.width, bufferHeight: cvs.height
                };
                const fullWidth = cont.scrollWidth, fullHeight = cont.scrollHeight;
                cvs.width = fullWidth; cvs.height = fullHeight;
                cvs.style.width = fullWidth + 'px'; cvs.style.height = fullHeight + 'px';
                cvs.style.position = 'absolute'; cvs.style.top = '0px'; cvs.style.left = '0px';
                cvs.style.transform = 'none';
            } else {
                if (originalCanvasState.bufferWidth !== undefined) {
                    cvs.width = originalCanvasState.bufferWidth; cvs.height = originalCanvasState.bufferHeight;
                    cvs.style.width = originalCanvasState.styleWidth; cvs.style.height = originalCanvasState.styleHeight;
                    cvs.style.position = originalCanvasState.stylePosition; cvs.style.zIndex = originalCanvasState.styleZIndex;
                    cvs.style.pointerEvents = originalCanvasState.stylePointerEvents;
                }
                _setCanvasStyleForScreen();
            }
            _redrawAllObjects();
        }
    };

    (function addHorizontalLock() {
        let scroller, overlay;
        function initLockElements() { scroller = document.getElementById('xsheet-container'); overlay = document.getElementById('drawingCanvasOverlay'); }
        _hLock_syncScrollTransforms = function () {
            if (!scroller && !overlay) initLockElements(); if (!scroller || !overlay) return;
            if (!isExportPrepared) {
                overlay.style.transform = `translateX(${-scroller.scrollLeft}px)`;
            } else {
                if (overlay) overlay.style.transform = 'none';
            }
        };
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
            setTimeout(setupScrollListener, 0);
        } else {
            document.addEventListener("DOMContentLoaded", setupScrollListener);
        }
    })();
})();