// js/main.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("main.js: DOMContentLoaded event fired.");
    if (typeof ProjectData === 'undefined') { console.error("ProjectData class is not defined!"); return; }
    if (typeof AudioHandler === 'undefined') { console.error("AudioHandler class is not defined!"); return; }
    if (typeof XSheet === 'undefined') { console.error("XSheet class is not defined!"); return; }

    const projectData = new ProjectData();
    const audioHandler = new AudioHandler(projectData);
    const xsheet = new XSheet(projectData, audioHandler);

    const elements = {
        btnImportAudio: document.getElementById('btnImportAudio'),
        fileInputAudio: document.getElementById('fileInputAudio'),
        btnPlay: document.getElementById('btnPlay'),
        btnPause: document.getElementById('btnPause'),
        btnStop: document.getElementById('btnStop'),
        framesInput: document.getElementById('framesInput'), // Check this ID in HTML
        fpsInput: document.getElementById('fpsInput'),       // Check this ID in HTML
        audioInfoEl: document.getElementById('audioInfo'),
        audioScrubSlider: document.getElementById('audioScrubSlider'),
        metaProjectNumber: document.getElementById('metaProjectNumber'),
        metaDate: document.getElementById('metaDate'),
        metaPageNumber: document.getElementById('metaPageNumber'),
        metaAnimatorName: document.getElementById('metaAnimatorName'),
        metaVersionNumber: document.getElementById('metaVersionNumber'),
        metaShotNumber: document.getElementById('metaShotNumber'),
        statusBar: document.getElementById('statusBar'),
        btnSaveProject: document.getElementById('btnSaveProject'),
        btnLoadProject: document.getElementById('btnLoadProject'),
        fileInputLoadProject: document.getElementById('fileInputLoadProject')
    };
    let isSliderDragging = false;

    // Module Initializations (DrawingTools, DrawingCanvas, ExportHandler, FileHandler)
    // ... (Ensure these are identical to your last complete version) ...
    if (window.XSheetApp.DrawingTools && typeof window.XSheetApp.DrawingTools.init === 'function') {
        window.XSheetApp.DrawingTools.init(projectData, document.getElementById('left-toolbar'));
    } else { console.error("DrawingTools module not loaded or init function missing."); }

    if (window.XSheetApp.DrawingCanvas && typeof window.XSheetApp.DrawingCanvas.init === 'function') {
        window.XSheetApp.DrawingCanvas.init(projectData, document.getElementById('xsheet-container'), window.XSheetApp.DrawingTools);
    } else { console.error("DrawingCanvas module not loaded or init function missing."); }

    if (window.XSheetApp.ExportHandler && typeof window.XSheetApp.ExportHandler.init === 'function') {
        window.XSheetApp.ExportHandler.init(projectData, xsheet, window.XSheetApp.DrawingCanvas);
    } else { console.error("ExportHandler module not loaded or init function missing."); }

    if (window.XSheetApp.FileHandler && typeof window.XSheetApp.FileHandler.init === 'function') {
        window.XSheetApp.FileHandler.init(projectData, audioHandler, xsheet, elements);
    } else { console.error("FileHandler module not loaded or init function missing."); }


    if (xsheet?.render) { xsheet.render(); } else { console.error("main.js: xsheet.render not available!"); }

    function updateUIFromProjectData() {
        console.log("main.js: updateUIFromProjectData called."); // This is line 59 in your log

        // Check elements before accessing .value
        if (elements.framesInput) { // THIS IS LIKELY AROUND YOUR LINE 53
            elements.framesInput.value = projectData.frameCount;
        } else {
            console.warn("main.js: framesInput element not found in DOM for UI update.");
        }

        if (elements.fpsInput) {
            elements.fpsInput.value = projectData.metadata.fps;
        } else {
            console.warn("main.js: fpsInput element not found in DOM for UI update.");
        }

        if (elements.metaProjectNumber) elements.metaProjectNumber.value = projectData.metadata.projectNumber || "";
        if (elements.metaDate) {
            try {
                if (projectData.metadata.date) {
                    const d = new Date(projectData.metadata.date);
                    // Check if date string was valid enough for Date constructor
                    if (d instanceof Date && !isNaN(d)) {
                        elements.metaDate.valueAsDate = d;
                    } else {
                        console.warn("main.js: projectData.metadata.date is not a valid date string:", projectData.metadata.date, ". Setting input value directly.");
                        elements.metaDate.value = projectData.metadata.date;
                    }
                } else {
                    elements.metaDate.valueAsDate = new Date(); // Default to today
                }
            } catch (e) { // Fallback if valueAsDate itself throws or other issues
                elements.metaDate.value = projectData.metadata.date || new Date().toISOString().slice(0, 10);
                console.warn("Error setting date input with valueAsDate, used fallback string value:", e);
            }
        } else if (document.getElementById('metaDate')) { // If elements.metaDate was somehow null but element exists
            document.getElementById('metaDate').valueAsDate = new Date();
        }


        if (elements.metaPageNumber) elements.metaPageNumber.value = projectData.metadata.pageNumber || "1";
        if (elements.metaAnimatorName) elements.metaAnimatorName.value = projectData.metadata.animatorName || "";
        if (elements.metaVersionNumber) elements.metaVersionNumber.value = projectData.metadata.versionNumber || "1.0";
        if (elements.metaShotNumber) elements.metaShotNumber.value = projectData.metadata.shotNumber || "";

    }

    updateUIFromProjectData();
    updateAudioInfo();
    updateAudioScrubSlider();
    updatePlaybackButtonsUI(false);
    if (elements.statusBar) elements.statusBar.textContent = "Status: Ready";

    // Event listeners for UI elements (audio import, playback, frames, fps, scrub)
    elements.btnImportAudio?.addEventListener('click', () => elements.fileInputAudio?.click());
    elements.fileInputAudio?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (elements.statusBar) elements.statusBar.textContent = `Status: Importing audio ${file.name}...`;
            await audioHandler.loadAudioFile(file);
            if (elements.statusBar) elements.statusBar.textContent = `Status: Audio ${file.name} processed.`;
        }
        e.target.value = null;
    });
    elements.btnPlay?.addEventListener('click', () => {
        const isCurrentlyPlaying = audioHandler.isPlayingContinuous;
        if (elements.btnPlay.textContent.includes('Play')) {
            audioHandler.playContinuous(audioHandler.continuousPlaybackOffset || projectData.audio.currentTime || 0);
        } else {
            audioHandler.pauseContinuous();
        }
    });
    elements.btnStop?.addEventListener('click', () => audioHandler.stopContinuous());
    elements.framesInput?.addEventListener('change', (e) => {
        const newCount = parseInt(e.target.value);
        if (!isNaN(newCount) && newCount >= 1) {
            if (projectData.frameCount !== newCount) projectData.setFrameCount(newCount);
        } else if (projectData.frameCount > 0) {
            e.target.value = projectData.frameCount;
        }
    });
    elements.fpsInput?.addEventListener('change', (e) => {
        const newFps = parseInt(e.target.value);
        if (!isNaN(newFps) && newFps > 0 && projectData.metadata.fps !== newFps) {
            projectData.metadata.fps = newFps; // Consider a setter method in ProjectData for this
            projectData.isModified = true;
            if (elements.statusBar) elements.statusBar.textContent = `Status: FPS set to ${newFps}`;
            document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'fpsChanged' } }));
        } else if (projectData.metadata.fps > 0) {
            e.target.value = projectData.metadata.fps;
        }
    });
    elements.audioScrubSlider?.addEventListener('mousedown', () => { isSliderDragging = true; });
    elements.audioScrubSlider?.addEventListener('mouseup', () => {
        isSliderDragging = false;
        if (projectData.audio.audioBuffer && projectData.audio.duration > 0) {
            const time = (parseFloat(elements.audioScrubSlider.value) / 1000.0) * projectData.audio.duration;
            audioHandler.playScrubSnippet(time, 1.0 / (projectData.metadata.fps || 24));
        }
    });
    elements.audioScrubSlider?.addEventListener('input', (e) => {
        if (projectData.audio.audioBuffer && projectData.audio.duration > 0) {
            const time = (parseFloat(e.target.value) / 1000.0) * projectData.audio.duration;
            projectData.audio.currentTime = time;
            if (xsheet?.highlightFrame) xsheet.highlightFrame(Math.floor(time * (projectData.metadata.fps || 24)));
            updateAudioInfo();
        }
    });

    // Global Custom Event Listeners
    document.addEventListener('projectDataChanged', (e) => {
        const reason = e.detail?.reason;
        // console.log(`main.js: 'projectDataChanged' event received, reason: ${reason}`); // Kept for debugging

        if (xsheet?.render && (reason === 'frameCount' || reason === 'newProject' || reason === 'projectLoaded' || reason === 'audioCleared' || reason === 'fpsChanged')) {
            xsheet.render();
        }
        if (xsheet?.renderVerticalWaveform && (reason === 'audioLoaded' || reason === 'audioCleared' || reason === 'frameCount' || reason === 'fpsChanged' || reason === 'projectLoaded' || reason === 'newProject')) {
            xsheet.renderVerticalWaveform();
        }

        if (reason === 'projectLoaded' || reason === 'newProject') {
            updateUIFromProjectData();
            updateAudioInfo();
            updateAudioScrubSlider();
            updatePlaybackButtonsUI(false);
            if (window.XSheetApp.DrawingCanvas && window.XSheetApp.DrawingCanvas.refresh) {
                window.XSheetApp.DrawingCanvas.refresh();
            }
        } else if (reason === 'frameCount') {
            updateFramesInput();
            if (projectData.audio.audioBuffer) { // If audio exists, its relation to frames might change UI
                updateAudioScrubSlider();
            }
        } else if (reason === 'fpsChanged') {
            updateFpsInput();
            updateFramesInput();
            if (projectData.audio.audioBuffer) {
                updateAudioScrubSlider();
            }
        } else if (reason === 'audioLoaded' || reason === 'audioCleared') {
            updateAudioInfo();
            updateAudioScrubSlider();
            updatePlaybackButtonsUI(false);
            updateFramesInput();
        } else if (reason === 'cellData' || reason === 'metadataChanged') { // Assuming you might add 'metadataChanged'
            // For metadata, updateUIFromProjectData handles it if called
            // For cellData, usually no specific top-level UI needs update beyond the xsheet itself
        }
    });

    document.addEventListener('audioLoaded', (e) => {
        console.log("main.js: audioLoaded event from AudioHandler", e.detail);
        // UI updates are now mostly driven by 'projectDataChanged'
    });

    document.addEventListener('audioMetadataLoaded', (e) => {
        console.log("main.js: audioMetadataLoaded event from FileHandler", e.detail);
        if (elements.audioInfoEl && e.detail.filename) {
            elements.audioInfoEl.textContent = `Audio: "${e.detail.filename}" (${e.detail.duration.toFixed(2)}s). Re-import if needed.`;
        } else if (elements.audioInfoEl) {
            elements.audioInfoEl.textContent = "No audio loaded";
        }
        updateAudioScrubSlider();
        updatePlaybackButtonsUI(false);
    });

    document.addEventListener('playbackStateChanged', (e) => {
        const isPlaying = e.detail.isPlaying;
        updatePlaybackButtonsUI(isPlaying);
        if (isPlaying) requestAnimationFrame(animationLoopForPlayback);
    });
    document.addEventListener('playbackPositionChanged', (e) => {
        const position = e.detail.position;
        if (projectData.audio.audioBuffer) {
            projectData.audio.currentTime = position;
        }
        updateAudioInfo();
        if (!isSliderDragging && elements.audioScrubSlider) {
            if (projectData.audio.duration > 0) {
                elements.audioScrubSlider.value = (position / projectData.audio.duration) * 1000;
            } else {
                elements.audioScrubSlider.value = 0;
            }
        }
        if (xsheet?.highlightFrame) {
            xsheet.highlightFrame(Math.floor(position * (projectData.metadata.fps || 24)));
        }
    });

    function updateFramesInput() {
        if (elements.framesInput) elements.framesInput.value = projectData.frameCount;
        else console.warn("updateFramesInput: elements.framesInput not found");
    }
    function updateFpsInput() {
        if (elements.fpsInput) elements.fpsInput.value = projectData.metadata.fps;
        else console.warn("updateFpsInput: elements.fpsInput not found");
    }
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
        } else {
            elements.audioScrubSlider.disabled = true;
            elements.audioScrubSlider.value = 0;
        }
    }
    function updatePlaybackButtonsUI(isPlaying) {
        const hasAudio = projectData.audio.audioBuffer && projectData.audio.duration > 0;
        if (elements.btnPlay) {
            elements.btnPlay.textContent = isPlaying ? 'Pause' : 'Play';
            elements.btnPlay.disabled = !hasAudio;
        }
        let stopEnabled = hasAudio && (isPlaying || (projectData.audio.currentTime !== undefined && projectData.audio.currentTime > 0.01));
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