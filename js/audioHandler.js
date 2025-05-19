// js/audioHandler.js
// For pure browser, sounddevice is not applicable. Web Audio API is used.
// The try-catch for sounddevice was for a previous Python context.

class AudioHandler {
    constructor(projectData) {
        this.projectData = projectData;
        this.audioContext = null;
        this.mainAudioBuffer = null;
        this.currentMainSourceNode = null;      // For continuous playback
        this.currentScrubSourceNode = null;     // For discrete scrub snippets
        this.isPlayingContinuous = false;
        this.continuousPlayStartTimeInAc = 0; // AudioContext's time when playback logically started
        this.continuousPlaybackOffset = 0;    // Accumulated pause/resume offset for continuous play

        this._init();
    }

    _init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log("AudioHandler: Web Audio API Context created.");
        } catch (e) {
            console.error("AudioHandler: Web Audio API is not supported in this browser.", e);
            // Consider a user-facing alert if audio is critical and context fails
            // alert("Web Audio API is not supported. Audio features will not work.");
        }
    }

    async loadAudioFile(file) {
        if (!this.audioContext || !file) {
            console.error("AudioHandler: AudioContext not available or no file provided for loading.");
            this.projectData.clearAudioData();
            document.dispatchEvent(new CustomEvent('audioLoadFailed'));
            return null;
        }
        console.log(`AudioHandler: Loading audio file: ${file.name}`);
        this.stopContinuous();
        this.projectData.clearAudioData(false); // Clear current data without dispatching yet

        try {
            const arrayBuffer = await file.arrayBuffer();
            this.mainAudioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            console.log("AudioHandler: Audio decoded successfully.");

            this.projectData.loadAudioData(this.mainAudioBuffer, file.name, null); // This will update projectData and dispatch 'projectDataChanged'

            document.dispatchEvent(new CustomEvent('audioLoaded', {
                detail: { filename: file.name, duration: this.mainAudioBuffer.duration }
            }));
            return this.mainAudioBuffer;
        } catch (e) {
            console.error(`AudioHandler: Error decoding audio data for ${file.name}:`, e);
            // alert(`Error decoding audio file: ${e.message}`); // User-facing error
            this.projectData.clearAudioData(); // Ensure project data is cleared on error
            document.dispatchEvent(new CustomEvent('audioLoadFailed'));
            return null;
        }
    }

    playContinuous(startOffsetSeconds = 0) {
        if (!this.mainAudioBuffer || !this.audioContext) { console.warn("AudioHandler: No audio buffer or context to play."); return; }
        if (this.isPlayingContinuous && this.currentMainSourceNode) { /* console.log("AudioHandler: Already playing continuously."); */ return; }

        this.stopContinuous(); // Clear any existing source & stop scrub snippets

        this.currentMainSourceNode = this.audioContext.createBufferSource();
        this.currentMainSourceNode.buffer = this.mainAudioBuffer;
        this.currentMainSourceNode.connect(this.audioContext.destination);

        const offset = Math.max(0, Math.min(startOffsetSeconds || this.continuousPlaybackOffset, this.mainAudioBuffer.duration));
        this.continuousPlaybackOffset = offset;

        try {
            this.currentMainSourceNode.start(0, offset);
            this.continuousPlaybackStartTimeInAc = this.audioContext.currentTime - offset;
            this.isPlayingContinuous = true;
            // console.log(`AudioHandler: Playing continuous from ${offset.toFixed(2)}s`);
            document.dispatchEvent(new CustomEvent('playbackStateChanged', { detail: { isPlaying: true } }));

            this.currentMainSourceNode.onended = () => {
                if (this.isPlayingContinuous && this.currentMainSourceNode) {
                    const timeWhenEnded = this.audioContext.currentTime - this.continuousPlaybackStartTimeInAc;
                    const endedNaturallyAtEnd = Math.abs(this.mainAudioBuffer.duration - timeWhenEnded) < 0.1;

                    this.isPlayingContinuous = false;
                    this.continuousPlaybackOffset = endedNaturallyAtEnd ? 0 : timeWhenEnded;

                    document.dispatchEvent(new CustomEvent('playbackStateChanged', { detail: { isPlaying: false } }));
                    document.dispatchEvent(new CustomEvent('playbackPositionChanged', { detail: { position: this.continuousPlaybackOffset } }));
                }
                this.currentMainSourceNode = null;
            };
        } catch (e) {
            console.error("AudioHandler: Error starting continuous playback:", e);
            this.isPlayingContinuous = false; this.currentMainSourceNode = null;
        }
    }

    pauseContinuous() {
        if (!this.currentMainSourceNode || !this.isPlayingContinuous || !this.audioContext) return;
        try { this.currentMainSourceNode.onended = null; this.currentMainSourceNode.stop(); }
        catch (e) { /* Might already be stopped */ }

        this.continuousPlaybackOffset = this.audioContext.currentTime - this.continuousPlaybackStartTimeInAc;
        this.isPlayingContinuous = false; this.currentMainSourceNode = null;
        // console.log(`AudioHandler: Paused continuous at ${this.continuousPlaybackOffset.toFixed(2)}s`);
        document.dispatchEvent(new CustomEvent('playbackStateChanged', { detail: { isPlaying: false } }));
        // Position update is implicitly handled by continuousPlaybackOffset for resume
    }

    stopContinuous() {
        if (this.currentScrubSourceNode) { // Also stop any active scrub snippet
            try { this.currentScrubSourceNode.stop(); } catch (e) { }
            this.currentScrubSourceNode.disconnect(); this.currentScrubSourceNode = null;
        }
        if (this.currentMainSourceNode) {
            try { this.currentMainSourceNode.onended = null; this.currentMainSourceNode.stop(); } catch (e) { }
            this.currentMainSourceNode.disconnect(); this.currentMainSourceNode = null;
        }
        this.isPlayingContinuous = false; this.continuousPlaybackOffset = 0;
        if (this.projectData && this.projectData.audio) this.projectData.audio.currentTime = 0;
        // console.log("AudioHandler: Stopped continuous playback.");
        document.dispatchEvent(new CustomEvent('playbackStateChanged', { detail: { isPlaying: false } }));
        document.dispatchEvent(new CustomEvent('playbackPositionChanged', { detail: { position: 0 } }));
    }

    playScrubSnippet(timeInSeconds, snippetDurationHintSeconds = 0.05) {
        if (!this.mainAudioBuffer || !this.audioContext) return;

        if (this.currentScrubSourceNode) {
            try { this.currentScrubSourceNode.stop(); } catch (e) { }
            this.currentScrubSourceNode.disconnect(); this.currentScrubSourceNode = null;
        }
        // If continuous play is active, pausing it for a scrub snippet might be jarring.
        // For now, scrub snippet takes precedence.
        if (this.isPlayingContinuous) {
            // console.log("AudioHandler: Pausing continuous play for scrub snippet.");
            // this.pauseContinuous(); // This might be too disruptive if user is just hovering
        }

        this.currentScrubSourceNode = this.audioContext.createBufferSource();
        this.currentScrubSourceNode.buffer = this.mainAudioBuffer;
        this.currentScrubSourceNode.connect(this.audioContext.destination);
        const actualSnippetDuration = Math.max(0.03, snippetDurationHintSeconds); // Min 30ms
        try {
            const startTime = Math.max(0, Math.min(timeInSeconds, this.mainAudioBuffer.duration - actualSnippetDuration));
            this.currentScrubSourceNode.start(0, startTime, actualSnippetDuration);
        } catch (e) {
            console.error("AudioHandler: Error starting scrub snippet:", e);
            this.currentScrubSourceNode = null;
        }
    }

    getCurrentContinuousPlaybackTime() {
        if (!this.audioContext) return this.continuousPlaybackOffset;
        if (!this.isPlayingContinuous) return this.continuousPlaybackOffset;
        return (this.audioContext.currentTime - this.continuousPlaybackStartTimeInAc);
    }
    getDuration() { return this.mainAudioBuffer ? this.mainAudioBuffer.duration : 0; }
}