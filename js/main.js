// js/main.js
document.addEventListener('DOMContentLoaded', () => {
    // console.log("main.js: DOMContentLoaded event fired.");
    if (typeof ProjectData === 'undefined') { console.error("ProjectData class is not defined! Check script order."); return; }
    if (typeof AudioHandler === 'undefined') { console.error("AudioHandler class is not defined! Check script order."); return; }
    if (typeof XSheet === 'undefined') { console.error("XSheet class is not defined! Check script order."); return; }

    window.XSheetApp = window.XSheetApp || {};

    const statusBarEl = document.getElementById('statusBar');
    window.XSheetApp.updateStatus = function (message) {
        if (statusBarEl) statusBarEl.textContent = "Status: " + message;
        console.log("Status: " + message);
    };

    if (typeof window.XSheetApp?.DrawingTools === 'undefined') { console.warn("XSheetApp.DrawingTools not defined! (Placeholders expected)"); }
    if (typeof window.XSheetApp?.DrawingCanvas === 'undefined') { console.warn("XSheetApp.DrawingCanvas not defined! (Placeholders expected)"); }
    // Check for ExportPrintHandler (new name)
    if (typeof window.XSheetApp?.ExportPrintHandler === 'undefined') { console.error("XSheetApp.ExportPrintHandler not defined! Check exportPrintHandler.js."); return; }


    const projectData = new ProjectData();
    const audioHandler = new AudioHandler(projectData);
    const xsheet = new XSheet(projectData, audioHandler);

    if (window.XSheetApp.DrawingTools) {
        const drawingTools = window.XSheetApp.DrawingTools;
        const leftToolbarEl = document.getElementById('left-toolbar');
        if (leftToolbarEl) drawingTools.init(projectData, leftToolbarEl);
        else console.error("main.js: Left toolbar ('left-toolbar') not found for DrawingTools.");

        if (window.XSheetApp.DrawingCanvas) {
            const drawingCanvasModule = window.XSheetApp.DrawingCanvas;
            const xsheetContainerElForDrawing = document.getElementById('xsheet-container');
            if (xsheetContainerElForDrawing) drawingCanvasModule.init(projectData, xsheetContainerElForDrawing, drawingTools);
            else console.error("main.js: XSheet container ('xsheet-container') not found for DrawingCanvas.");
        }
    }

    // Initialize ExportPrintHandler
    const exportPrintHandler = window.XSheetApp.ExportPrintHandler;
    exportPrintHandler.init(projectData, xsheet);

    const elements = {
        btnImportAudio: document.getElementById('btnImportAudio'), fileInputAudio: document.getElementById('fileInputAudio'),
        btnPlay: document.getElementById('btnPlay'), btnPause: document.getElementById('btnPause'), btnStop: document.getElementById('btnStop'),
        framesInput: document.getElementById('framesInput'), fpsInput: document.getElementById('fpsInput'),
        audioInfoEl: document.getElementById('audioInfo'), audioScrubSlider: document.getElementById('audioScrubSlider'),
        metaProjectNumber: document.getElementById('metaProjectNumber'), metaDate: document.getElementById('metaDate'),
        metaPageNumber: document.getElementById('metaPageNumber'), metaAnimatorName: document.getElementById('metaAnimatorName'),
        metaVersionNumber: document.getElementById('metaVersionNumber'), metaShotNumber: document.getElementById('metaShotNumber'),
        btnClearAllDrawings: document.getElementById('btnClearAllDrawings'),
        btnPrint: document.getElementById('btnPrint'), // Added
        btnExportPDF: document.getElementById('btnExportPDF'), // Added
    };
    let isSliderDragging = false;

    if (xsheet?.render) xsheet.render(); else console.error("main.js: xsheet.render not available!");
    updateFramesInput(); updateFpsInput(); updateAudioInfo(); updateAudioScrubSlider(); updatePlaybackButtonsUI(false);
    if (elements.metaDate) elements.metaDate.valueAsDate = new Date();
    window.XSheetApp.updateStatus("Ready");


    // --- Event Listeners for UI Controls ---
    elements.btnClearAllDrawings?.addEventListener('click', () => {
        if (confirm("Clear all drawings on all layers?")) { projectData.clearAllDrawings(); }
    });
    elements.btnPrint?.addEventListener('click', () => {
        exportPrintHandler.print(); // Use the handler's method
    });
    elements.btnExportPDF?.addEventListener('click', async () => {
        // Status updates handled within exportPDF itself
        await exportPrintHandler.exportPDF();
    });

    // ... (Rest of event listeners for btnImportAudio, btnPlay, etc. from the previous full main.js)
    elements.btnImportAudio?.addEventListener('click', () => elements.fileInputAudio?.click());
    elements.fileInputAudio?.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (file) await audioHandler.loadAudioFile(file); e.target.value = null;
    });
    elements.btnPlay?.addEventListener('click', () => {
        const isCurrentlyPlaying = audioHandler.isPlayingContinuous;
        if (elements.btnPlay.textContent.trim().toUpperCase() === 'PLAY' && !isCurrentlyPlaying) {
            audioHandler.playContinuous(projectData.audio.currentTime || audioHandler.continuousPlaybackOffset || 0);
        } else if (elements.btnPlay.textContent.trim().toUpperCase() === 'PAUSE' && isCurrentlyPlaying) {
            audioHandler.pauseContinuous();
        } else if (!isCurrentlyPlaying) { audioHandler.playContinuous(projectData.audio.currentTime || audioHandler.continuousPlaybackOffset || 0); }
    });
    elements.btnStop?.addEventListener('click', () => audioHandler.stopContinuous());
    elements.framesInput?.addEventListener('change', (e) => {
        const newCount = parseInt(e.target.value);
        if (!isNaN(newCount) && newCount >= 1) { if (projectData.frameCount !== newCount) projectData.setFrameCount(newCount); }
        else if (projectData.frameCount > 0) e.target.value = projectData.frameCount;
    });
    elements.fpsInput?.addEventListener('change', (e) => {
        const newFps = parseInt(e.target.value);
        if (!isNaN(newFps) && newFps > 0 && projectData.metadata.fps !== newFps) {
            projectData.metadata.fps = newFps; projectData.isModified = true; window.XSheetApp.updateStatus(`FPS set to ${newFps}`);
            if (projectData.audio.duration > 0) {
                const requiredFrames = Math.ceil(projectData.audio.duration * newFps);
                if (requiredFrames > projectData.frameCount) {
                    projectData.setFrameCount(requiredFrames); if (elements.framesInput) elements.framesInput.value = projectData.frameCount;
                } else { document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'fpsChangedOrAudioRecalc' } })); }
            } else { document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'fpsChanged' } })); }
        } else if (projectData.metadata.fps > 0) { e.target.value = projectData.metadata.fps; }
    });
    elements.audioScrubSlider?.addEventListener('mousedown', () => { isSliderDragging = true; });
    elements.audioScrubSlider?.addEventListener('mouseup', () => {
        isSliderDragging = false;
        if (projectData.audio.audioBuffer && projectData.audio.duration > 0) {
            const time = (parseFloat(elements.audioScrubSlider.value) / 1000.0) * projectData.audio.duration;
            audioHandler.playScrubSnippet(time, 1.0 / projectData.metadata.fps);
        }
    });
    elements.audioScrubSlider?.addEventListener('input', (e) => {
        if (projectData.audio.audioBuffer && projectData.audio.duration > 0) {
            const time = (parseFloat(e.target.value) / 1000.0) * projectData.audio.duration;
            projectData.audio.currentTime = time;
            audioHandler.playScrubSnippet(time, 1.0 / projectData.metadata.fps);
            if (xsheet?.highlightFrame) xsheet.highlightFrame(Math.floor(time * projectData.metadata.fps));
            updateAudioInfo();
        }
    });

    // --- Custom Event Listeners ---
    // ... (projectDataChanged, audioLoaded, playbackStateChanged, playbackPositionChanged same as before)
    document.addEventListener('projectDataChanged', (e) => {
        const reason = e.detail?.reason;
        if (xsheet?.render && (reason === 'frameCount' || reason === 'newProject' || reason === 'projectLoaded' || reason === 'audioCleared')) {
            xsheet.render();
        }
        updateFramesInput(); updateFpsInput(); updateAudioInfo(); updateAudioScrubSlider();
        if (xsheet?.renderVerticalWaveform && (reason === 'audioLoaded' || reason === 'audioCleared' || reason === 'frameCount' || reason === 'fpsChangedOrAudioRecalc' || reason === 'projectLoaded' || reason === 'newProject')) {
            xsheet.renderVerticalWaveform();
        }
    });
    document.addEventListener('audioLoaded', (e) => {
        updateAudioInfo(); updateAudioScrubSlider(); updatePlaybackButtonsUI(false);
        if (xsheet?.renderVerticalWaveform) xsheet.renderVerticalWaveform();
    });
    document.addEventListener('playbackStateChanged', (e) => {
        const isPlaying = e.detail.isPlaying; updatePlaybackButtonsUI(isPlaying);
        if (isPlaying) requestAnimationFrame(animationLoopForPlayback);
    });
    document.addEventListener('playbackPositionChanged', (e) => {
        const position = e.detail.position; projectData.audio.currentTime = position;
        updateAudioInfo();
        if (!isSliderDragging && elements.audioScrubSlider) {
            if (projectData.audio.duration > 0) elements.audioScrubSlider.value = (position / projectData.audio.duration) * 1000;
            else elements.audioScrubSlider.value = 0;
        }
        if (xsheet?.highlightFrame) xsheet.highlightFrame(Math.floor(position * projectData.metadata.fps));
    });

    // --- UI Update Functions ---
    // ... (updateFramesInput, updateFpsInput, updateAudioInfo, updateAudioScrubSlider, 
    //      updatePlaybackButtonsUI, animationLoopForPlayback same as before. `updateStatus` is now global)
    function updateFramesInput() { if (elements.framesInput) elements.framesInput.value = projectData.frameCount; }
    function updateFpsInput() { if (elements.fpsInput) elements.fpsInput.value = projectData.metadata.fps; }
    function updateAudioInfo() {
        if (!elements.audioInfoEl) return;
        if (projectData.audio.fileName && projectData.audio.duration > 0) {
            const currentTime = projectData.audio.currentTime !== undefined ? projectData.audio.currentTime : 0;
            const duration = projectData.audio.duration;
            elements.audioInfoEl.textContent = `${projectData.audio.fileName} (${currentTime.toFixed(2)}s / ${duration.toFixed(2)}s)`;
        } else { elements.audioInfoEl.textContent = "No audio loaded"; }
    }
    function updateAudioScrubSlider() {
        if (!elements.audioScrubSlider) return;
        if (projectData.audio.audioBuffer && projectData.audio.duration > 0) {
            elements.audioScrubSlider.disabled = false;
            const currentTime = projectData.audio.currentTime !== undefined ? projectData.audio.currentTime : 0;
            elements.audioScrubSlider.value = projectData.audio.duration > 0 ? (currentTime / projectData.audio.duration) * 1000 : 0;
        } else { elements.audioScrubSlider.disabled = true; elements.audioScrubSlider.value = 0; }
    }
    function updatePlaybackButtonsUI(isPlaying) {
        const hasAudio = projectData.audio.audioBuffer && projectData.audio.duration > 0;
        if (elements.btnPlay) { elements.btnPlay.textContent = isPlaying ? 'Pause' : 'Play'; elements.btnPlay.disabled = !hasAudio; }
        if (elements.btnPause) { elements.btnPause.style.display = 'none'; }
        let stopEnabled = hasAudio && (isPlaying || (projectData.audio.currentTime !== undefined && projectData.audio.currentTime > 0.02));
        if (elements.btnStop) elements.btnStop.disabled = !stopEnabled;
    }
    function animationLoopForPlayback() {
        if (audioHandler.isPlayingContinuous) {
            const currentTime = audioHandler.getCurrentContinuousPlaybackTime();
            document.dispatchEvent(new CustomEvent('playbackPositionChanged', { detail: { position: currentTime } }));
            requestAnimationFrame(animationLoopForPlayback);
        }
    }

    console.log("Main app setup complete.");
});