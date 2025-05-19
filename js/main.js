// js/main.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("main.js: DOMContentLoaded event fired.");
    if (typeof ProjectData === 'undefined') { console.error("ProjectData class is not defined! Check script order."); return; }
    if (typeof AudioHandler === 'undefined') { console.error("AudioHandler class is not defined! Check script order."); return; }
    if (typeof XSheet === 'undefined') { console.error("XSheet class is not defined! Check script order."); return; }
    if (typeof window.XSheetApp?.DrawingTools === 'undefined') { console.error("XSheetApp.DrawingTools is not defined! Check drawingTools.js."); return; }
    if (typeof window.XSheetApp?.DrawingCanvas === 'undefined') { console.error("XSheetApp.DrawingCanvas is not defined! Check drawingCanvas.js."); return; }

    const projectData = new ProjectData();
    const audioHandler = new AudioHandler(projectData);
    const xsheet = new XSheet(projectData, audioHandler);

    // --- Initialize Drawing Subsystem ---
    const drawingTools = window.XSheetApp.DrawingTools;
    const leftToolbarEl = document.getElementById('left-toolbar');
    if (leftToolbarEl) drawingTools.init(projectData, leftToolbarEl);
    else console.error("main.js: Left toolbar ('left-toolbar') not found for DrawingTools.");

    const drawingCanvasModule = window.XSheetApp.DrawingCanvas;
    const xsheetContainerEl = document.getElementById('xsheet-container');
    if (xsheetContainerEl) drawingCanvasModule.init(projectData, xsheetContainerEl, drawingTools);
    else console.error("main.js: XSheet container ('xsheet-container') not found for DrawingCanvas.");
    // --- End Drawing Subsystem Init ---

    const elements = { /* ... (same element caching as previous main.js) ... */
        btnImportAudio: document.getElementById('btnImportAudio'), fileInputAudio: document.getElementById('fileInputAudio'),
        btnPlay: document.getElementById('btnPlay'), btnPause: document.getElementById('btnPause'), btnStop: document.getElementById('btnStop'),
        framesInput: document.getElementById('framesInput'), fpsInput: document.getElementById('fpsInput'),
        audioInfoEl: document.getElementById('audioInfo'), audioScrubSlider: document.getElementById('audioScrubSlider'),
        metaProjectNumber: document.getElementById('metaProjectNumber'), metaDate: document.getElementById('metaDate'),
        metaPageNumber: document.getElementById('metaPageNumber'), metaAnimatorName: document.getElementById('metaAnimatorName'),
        metaVersionNumber: document.getElementById('metaVersionNumber'), metaShotNumber: document.getElementById('metaShotNumber'),
        statusBar: document.getElementById('statusBar'),
        btnClearAllDrawings: document.getElementById('btnClearAllDrawings'),
    };
    let isSliderDragging = false;

    if (xsheet?.render) xsheet.render(); else console.error("main.js: xsheet.render not available!");
    updateFramesInput(); updateFpsInput(); updateAudioInfo(); updateAudioScrubSlider(); updatePlaybackButtonsUI(false);
    if (elements.metaDate) elements.metaDate.valueAsDate = new Date(); updateStatus("Ready");

    // --- Event Listeners for UI Controls ---
    elements.btnClearAllDrawings?.addEventListener('click', () => {
        if (confirm("Clear all drawings on the current active layer?")) {
            projectData.clearAllDrawings(); // This dispatches 'drawingChanged'
        }
    });
    // ... (Rest of event listeners from previous full main.js, like btnImportAudio, btnPlay, etc.) ...
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
            projectData.metadata.fps = newFps; projectData.isModified = true; updateStatus(`FPS set to ${newFps}`);
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
    document.addEventListener('projectDataChanged', (e) => { /* ... same as previous ... */
        const reason = e.detail?.reason;
        if (xsheet?.render && (reason === 'frameCount' || reason === 'newProject' || reason === 'projectLoaded' || reason === 'audioCleared')) {
            xsheet.render();
        }
        updateFramesInput(); updateFpsInput(); updateAudioInfo(); updateAudioScrubSlider();
        if (xsheet?.renderVerticalWaveform && (reason === 'audioLoaded' || reason === 'audioCleared' || reason === 'frameCount' || reason === 'fpsChangedOrAudioRecalc' || reason === 'projectLoaded' || reason === 'newProject')) {
            xsheet.renderVerticalWaveform();
        }
    });
    document.addEventListener('audioLoaded', (e) => { /* ... same as previous ... */
        updateAudioInfo(); updateAudioScrubSlider(); updatePlaybackButtonsUI(false);
        if (xsheet?.renderVerticalWaveform) xsheet.renderVerticalWaveform();
    });
    document.addEventListener('playbackStateChanged', (e) => { /* ... same as before ... */
        const isPlaying = e.detail.isPlaying; updatePlaybackButtonsUI(isPlaying);
        if (isPlaying) requestAnimationFrame(animationLoopForPlayback);
    });
    document.addEventListener('playbackPositionChanged', (e) => { /* ... same as before ... */
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
    //      updatePlaybackButtonsUI, animationLoopForPlayback, updateStatus
    //      are the same as the previous complete main.js listing)
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
    function updateStatus(message) { if (elements.statusBar) elements.statusBar.textContent = "Status: " + message; }

    console.log("Main app setup complete. Initial UI should be rendered.");
});