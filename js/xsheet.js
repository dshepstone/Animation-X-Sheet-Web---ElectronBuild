// js/xsheet.js

const LOGICAL_COLUMNS = [
    { key: "action", displayName: "Action/Description", editable: true, className: "action-col" },
    { key: "frameNumber1", displayName: "Fr", editable: false, className: "frame-col", type: "frameNumber" },
    { key: "audioWaveform", displayName: "Audio Waveform", editable: false, className: "waveform-col", type: "waveform" },
    { key: "dialogue", displayName: "Dialogue", editable: true, className: "dialogue-col" },
    { key: "soundFx", displayName: "Sound FX", editable: true, className: "sound-col" },
    { key: "techNotes", displayName: "Tech. Notes", editable: true, className: "technical-col" },
    { key: "frameNumber2", displayName: "Fr", editable: false, className: "frame-col", type: "frameNumber" },
    { key: "camera", displayName: "Camera Moves", editable: true, className: "camera-col" },
];

class XSheet {
    constructor(projectData, audioHandlerRef) {
        this.projectData = projectData;
        this.audioHandler = audioHandlerRef;
        this.tableBody = document.getElementById('xsheetTableBody');
        this.tableHead = document.getElementById('xsheetTableHead');
        this.xsheetContainer = document.getElementById('xsheet-container');

        this.verticalWaveformCanvas = null;
        this.verticalWaveformCtx = null;
        this.isScrubbingVerticalWaveform = false;
        this.currentFrameHighlight = -1;

        if (!this.tableBody || !this.tableHead || !this.xsheetContainer) {
            console.error("CRITICAL XSheet ERROR: Essential DOM elements not found!");
            return;
        }
        this._renderHeaders();
        this._createVerticalWaveformCanvas();
        this.xsheetContainer.addEventListener('scroll', this._handleScrollOrResize.bind(this));
        window.addEventListener('resize', this._handleScrollOrResize.bind(this));
    }

    _renderHeaders() {
        if (!this.tableHead) return;
        const tr = document.createElement('tr');
        LOGICAL_COLUMNS.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.displayName; th.className = col.className || '';
            tr.appendChild(th);
        });
        this.tableHead.innerHTML = ''; this.tableHead.appendChild(tr);
    }

    render() {
        if (!this.tableBody || !this.projectData) { return; }
        this.tableBody.innerHTML = '';
        for (let i = 0; i < this.projectData.frameCount; i++) {
            const tr = document.createElement('tr');
            tr.dataset.frameIndex = i;
            if (i === this.currentFrameHighlight) tr.classList.add('highlighted-frame');
            const fps = this.projectData.metadata.fps || 24;
            if ((i + 1) % fps === 0) tr.classList.add('major-second-tick');
            else if ((i + 1) % 8 === 0) tr.classList.add('eighth-frame-tick');
            if (i % 2 === 0) tr.classList.add('even-row');
            LOGICAL_COLUMNS.forEach(colConfig => {
                const td = document.createElement('td');
                td.className = colConfig.className || ''; td.dataset.columnKey = colConfig.key;
                if (colConfig.type === "frameNumber") { td.textContent = i + 1; }
                else if (colConfig.type === "waveform") { /* Placeholder */ }
                else {
                    td.textContent = this.projectData.getCellData(i, colConfig.key);
                    if (colConfig.editable) {
                        td.contentEditable = "true"; td.setAttribute('data-placeholder', '');
                        td.addEventListener('blur', (event) => this.projectData.setCellData(i, colConfig.key, event.target.textContent));
                    }
                }
                tr.appendChild(td);
            });
            this.tableBody.appendChild(tr);
        }
        this.renderVerticalWaveform();
    }

    _createVerticalWaveformCanvas() {
        if (this.verticalWaveformCanvas || !this.xsheetContainer) return;
        this.verticalWaveformCanvas = document.createElement('canvas');
        this.verticalWaveformCanvas.id = 'verticalWaveformCanvas';
        this.verticalWaveformCanvas.style.position = 'absolute';
        this.verticalWaveformCanvas.style.pointerEvents = 'auto';
        this.verticalWaveformCanvas.style.zIndex = '5';
        this.xsheetContainer.appendChild(this.verticalWaveformCanvas); // Append to scroll container
        this.verticalWaveformCtx = this.verticalWaveformCanvas.getContext('2d');
        this.verticalWaveformCanvas.addEventListener('mousedown', this._handleVerticalWaveformMouseDown.bind(this));
        document.addEventListener('mousemove', this._handleVerticalWaveformMouseMove.bind(this));
        document.addEventListener('mouseup', this._handleVerticalWaveformMouseUp.bind(this));
    }

    _getWaveformColumnMetrics() {
        if (!this.tableHead || !this.xsheetContainer) return null;
        const thElements = Array.from(this.tableHead.querySelectorAll('tr th'));
        const waveformThIndex = LOGICAL_COLUMNS.findIndex(col => col.type === 'waveform');
        if (waveformThIndex === -1 || waveformThIndex >= thElements.length) return null;
        const waveformTh = thElements[waveformThIndex];
        const thRect = waveformTh.getBoundingClientRect();
        const containerRect = this.xsheetContainer.getBoundingClientRect();
        return {
            leftRelativeToContainer: thRect.left - containerRect.left,
            width: thRect.width,
        };
    }

    _handleScrollOrResize() {
        requestAnimationFrame(() => this.renderVerticalWaveform());
    }

    renderVerticalWaveform() {
        if (!this.verticalWaveformCanvas || !this.verticalWaveformCtx || !this.projectData?.audio || !this.xsheetContainer || !this.tableBody) {
            if (this.verticalWaveformCanvas && this.verticalWaveformCtx) {
                this.verticalWaveformCtx.clearRect(0, 0, this.verticalWaveformCanvas.width, this.verticalWaveformCanvas.height);
            }
            return;
        }

        const colMetrics = this._getWaveformColumnMetrics();
        if (!colMetrics) {
            this.verticalWaveformCanvas.style.display = 'none';
            if (this.verticalWaveformCtx) this.verticalWaveformCtx.clearRect(0, 0, this.verticalWaveformCanvas.width, this.verticalWaveformCanvas.height);
            return;
        }
        this.verticalWaveformCanvas.style.display = 'block';

        const scrollOffsetY = this.xsheetContainer.scrollTop; // Get current scroll offset

        // ** YOUR FIX APPLIED HERE **
        // Position the canvas so its top edge aligns with the current visible top of the scroll container
        const newCanvasTop = `${scrollOffsetY}px`;
        if (this.verticalWaveformCanvas.style.top !== newCanvasTop) {
            this.verticalWaveformCanvas.style.top = newCanvasTop;
        }
        // Position left relative to container, adjusted by horizontal scroll
        const newCanvasLeft = `${colMetrics.leftRelativeToContainer + this.xsheetContainer.scrollLeft}px`;
        if (this.verticalWaveformCanvas.style.left !== newCanvasLeft) {
            this.verticalWaveformCanvas.style.left = newCanvasLeft;
        }

        // Size the canvas to the column width and visible container height
        if (this.verticalWaveformCanvas.width !== colMetrics.width) {
            this.verticalWaveformCanvas.width = colMetrics.width;
        }
        if (this.verticalWaveformCanvas.height !== this.xsheetContainer.clientHeight) {
            this.verticalWaveformCanvas.height = this.xsheetContainer.clientHeight;
        }

        const ctx = this.verticalWaveformCtx;
        // Clear only the *visible part* of the canvas, which is its current dimensions
        ctx.clearRect(0, 0, this.verticalWaveformCanvas.width, this.verticalWaveformCanvas.height);

        const audioDuration = this.projectData.audio.duration;
        const fps = this.projectData.metadata.fps || 24;
        let rowHeight = 22;
        const firstRowEl = this.tableBody.querySelector('tr');
        if (firstRowEl) {
            const cs = getComputedStyle(firstRowEl);
            rowHeight = parseFloat(cs.height) || firstRowEl.offsetHeight || rowHeight;
        }
        if (rowHeight <= 0) rowHeight = 22;

        const totalAudioPixelHeight = audioDuration > 0 ? (audioDuration * fps * rowHeight) : (this.projectData.frameCount * rowHeight);

        const canvasWidth = this.verticalWaveformCanvas.width;
        const canvasHeight = this.verticalWaveformCanvas.height; // This is the viewport height
        const centerX = canvasWidth / 2;

        // 1. Draw Center Line
        if (this.projectData.audio.audioBuffer && this.projectData.audio.waveformData.length > 0 && audioDuration > 1e-6 && totalAudioPixelHeight > 0) {
            ctx.strokeStyle = '#AAAAAA'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, canvasHeight); ctx.stroke();
        }

        // 2. Draw Waveform Path
        if (this.projectData.audio.audioBuffer && this.projectData.audio.waveformData.length > 0 && audioDuration > 1e-6 && totalAudioPixelHeight > 0) {
            const wData = this.projectData.audio.waveformData; const numPoints = wData.length;
            ctx.strokeStyle = '#333333'; ctx.lineWidth = 1;
            const maxAmpDeflection = (canvasWidth / 2) * 0.9;

            ctx.beginPath();
            let currentPathSegmentStarted = false;

            for (let i = 0; i < numPoints; i++) {
                const pointTime = (i / (numPoints - 1 || 1)) * audioDuration;
                const yOnFullStrip = (pointTime / audioDuration) * totalAudioPixelHeight;
                // ** CRITICAL: yDrawPos is now relative to the START of the canvas, because the canvas itself moves with scroll **
                const yDrawPos = yOnFullStrip - scrollOffsetY;

                const amplitude = wData[i]; const xPos = centerX + (amplitude * maxAmpDeflection);
                if (yDrawPos >= -rowHeight && yDrawPos <= canvasHeight + rowHeight) { // Culling
                    if (!currentPathSegmentStarted) { ctx.moveTo(xPos, yDrawPos); currentPathSegmentStarted = true; }
                    else { ctx.lineTo(xPos, yDrawPos); }
                } else if (currentPathSegmentStarted) { ctx.lineTo(xPos, yDrawPos); currentPathSegmentStarted = false; }
            }
            // For the second half of the symmetric waveform
            for (let i = numPoints - 1; i >= 0; i--) {
                const pointTime = (i / (numPoints - 1 || 1)) * audioDuration;
                const yOnFullStrip = (pointTime / audioDuration) * totalAudioPixelHeight;
                const yDrawPos = yOnFullStrip - scrollOffsetY;
                const amplitude = wData[i]; const xPos = centerX - (amplitude * maxAmpDeflection);
                if (yDrawPos >= -rowHeight && yDrawPos <= canvasHeight + rowHeight) { // Culling
                    // We always lineTo here as the path is continuous from the top half
                    if (!currentPathSegmentStarted && i === numPoints - 1) { // If top half ended off-screen, start new segment
                        ctx.moveTo(xPos, yDrawPos);
                        currentPathSegmentStarted = true;
                    } else {
                        ctx.lineTo(xPos, yDrawPos);
                        currentPathSegmentStarted = true; // Ensure it's true if we drew
                    }
                } else if (currentPathSegmentStarted) { ctx.lineTo(xPos, yDrawPos); currentPathSegmentStarted = false; }
            }

            if (numPoints > 0) {
                // If we want a filled waveform, we would closePath before filling
                // ctx.closePath();
                // ctx.fillStyle = "rgba(100,150,200,0.3)"; ctx.fill();
                ctx.stroke(); // Stroke the outline
            }
        }

        // 3. Draw Playhead (on top)
        const currentTime = this.projectData.audio.currentTime || 0;
        if (audioDuration > 1e-6 && totalAudioPixelHeight > 0) {
            const playheadYOnFull = (currentTime / audioDuration) * totalAudioPixelHeight;
            // Playhead's Y position is also relative to the START of the moved canvas
            const playheadYDrawPos = playheadYOnFull - scrollOffsetY;

            if (playheadYDrawPos >= 0 && playheadYDrawPos <= canvasHeight) {
                ctx.strokeStyle = 'red'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(0, playheadYDrawPos); ctx.lineTo(canvasWidth, playheadYDrawPos); ctx.stroke();
            }
        }
    }

    _yPosToAudioTime(canvasY_relativeToCanvas) {
        if (!this.projectData?.audio?.audioBuffer || this.projectData.audio.duration === 0 || !this.tableBody) return 0;
        let rowHeight = 22; const firstRowEl = this.tableBody.querySelector('tr');
        if (firstRowEl) rowHeight = firstRowEl.offsetHeight || rowHeight; if (rowHeight <= 0) rowHeight = 22;
        const audioDuration = this.projectData.audio.duration; const fps = this.projectData.metadata.fps || 24;
        const totalAudioPixelHeightBasedOnAudio = audioDuration * fps * rowHeight;
        if (totalAudioPixelHeightBasedOnAudio <= 0) return 0;

        // canvasY is relative to the canvas's own top edge.
        // The canvas's top edge is already at scrollOffsetY.
        // So, yOnFullCanvas is simply the canvasY added to where the canvas currently starts (scrollOffsetY)
        const scrollOffsetY = this.xsheetContainer.scrollTop;
        const yOnFullCanvas = scrollOffsetY + canvasY_relativeToCanvas;

        let time = (yOnFullCanvas / totalAudioPixelHeightBasedOnAudio) * audioDuration;
        return Math.max(0, Math.min(time, audioDuration));
    }

    _handleVerticalWaveformMouseDown(event) {
        // ... (Mouse down logic remains the same: uses event.offsetY which is correct) ...
        if (!this.projectData?.audio?.audioBuffer || this.projectData.audio.duration === 0 || !this.verticalWaveformCanvas) return;
        const canvasRect = this.verticalWaveformCanvas.getBoundingClientRect();
        if (event.clientX < canvasRect.left || event.clientX > canvasRect.right || event.clientY < canvasRect.top || event.clientY > canvasRect.bottom) return;
        this.isScrubbingVerticalWaveform = true; document.body.style.userSelect = 'none';
        const time = this._yPosToAudioTime(event.offsetY); // event.offsetY is Y relative to the canvas element
        this.projectData.audio.currentTime = time;
        if (this.audioHandler) this.audioHandler.playScrubSnippet(time, 1.0 / (this.projectData.metadata.fps || 24));
        document.dispatchEvent(new CustomEvent('playbackPositionChanged', { detail: { position: time } }));
    }

    _handleVerticalWaveformMouseMove(event) {
        if (!this.isScrubbingVerticalWaveform || !this.projectData?.audio?.audioBuffer || !this.verticalWaveformCanvas) return;
        const canvasRect = this.verticalWaveformCanvas.getBoundingClientRect();
        // Calculate mouse Y relative to the canvas top (which is now at scrollOffsetY)
        const canvasY = event.clientY - canvasRect.top;

        const clampedCanvasY = Math.max(0, Math.min(canvasY, this.verticalWaveformCanvas.height));
        const time = this._yPosToAudioTime(clampedCanvasY);
        const fps = this.projectData.metadata.fps || 24;

        this.projectData.audio.currentTime = time;
        // Dispatch event for UI updates (like bottom slider, blue highlight)
        document.dispatchEvent(new CustomEvent('playbackPositionChanged', { detail: { position: time, visualOnly: true } }));

        if (this.isScrubbingVerticalWaveform && Math.abs(time - (this.projectData.lastScrubPlayTime || 0)) > (0.7 / fps)) {
            if (this.audioHandler) this.audioHandler.playScrubSnippet(time, 1.0 / fps);
            this.projectData.lastScrubPlayTime = time;
        }
    }

    _handleVerticalWaveformMouseUp(event) {
        // ... (Mouse up logic remains the same) ...
        if (this.isScrubbingVerticalWaveform) {
            this.isScrubbingVerticalWaveform = false; document.body.style.userSelect = '';
            if (!this.projectData?.audio?.audioBuffer) return;
            const canvasRect = this.verticalWaveformCanvas.getBoundingClientRect();
            const canvasY = event.clientY - canvasRect.top;
            const clampedCanvasY = Math.max(0, Math.min(canvasY, this.verticalWaveformCanvas.height));
            const time = this._yPosToAudioTime(clampedCanvasY);
            this.projectData.audio.currentTime = time;
            if (this.audioHandler) this.audioHandler.playScrubSnippet(time, 1.0 / (this.projectData.metadata.fps || 24));
            document.dispatchEvent(new CustomEvent('playbackPositionChanged', { detail: { position: time } }));
        }
    }

    highlightFrame(frameIndex) {
        if (!this.tableBody || !this.projectData) return;
        const oldFrame = this.currentFrameHighlight;
        this.currentFrameHighlight = frameIndex;
        const oldHighlightedRow = this.tableBody.querySelector(`tr[data-frame-index="${oldFrame}"]`);
        if (oldHighlightedRow) oldHighlightedRow.classList.remove('highlighted-frame');
        if (frameIndex >= 0 && frameIndex < this.projectData.frameCount) {
            const newHighlightedRow = this.tableBody.querySelector(`tr[data-frame-index="${frameIndex}"]`);
            if (newHighlightedRow) newHighlightedRow.classList.add('highlighted-frame');
        }
        const fps = this.projectData.metadata.fps || 24;
        const newTimeFromFrame = frameIndex / fps;
        if (this.projectData.audio?.audioBuffer && this.projectData.audio.duration > 0) {
            if (Math.abs((this.projectData.audio.currentTime || 0) - newTimeFromFrame) > (0.01 / fps)) {
                this.projectData.audio.currentTime = Math.max(0, Math.min(newTimeFromFrame, this.projectData.audio.duration));
            }
        }
        this.renderVerticalWaveform(); // This will clear and redraw waveform + playhead
    }
}