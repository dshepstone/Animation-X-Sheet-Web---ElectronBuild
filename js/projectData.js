// js/projectData.js
class ProjectData {
    constructor(projectName = `AnimationXSheet_${new Date().toISOString().slice(0, 10)}`) {
        this.projectName = projectName;
        this.filePath = null;
        this.isModified = false;

        this.metadata = {
            projectNumber: "", date: new Date().toISOString().slice(0, 10), pageNumber: "1",
            animatorName: "", versionNumber: "1.0", shotNumber: "", fps: 24,
        };

        this.frameCount = 48;
        this.rows = [];

        this.audio = {
            fileName: null, filePath: null, audioBuffer: null,
            duration: 0, sampleRate: 0, numberOfChannels: 0,
            waveformData: [],
            currentTime: 0,
        };

        this.drawingLayers = [{ name: "foreground", visible: true, objects: [] }];
        this.activeDrawingLayerIndex = 0;

        this.initNewProject(this.metadata.fps, this.frameCount);
        console.log("ProjectData initialized for:", this.projectName);
    }

    initNewProject(fps = 24, frameCount = 48) {
        this.projectName = `AnimationXSheet_${new Date().toISOString().slice(0, 10)}`;
        this.filePath = null; this.isModified = false;
        this.metadata = {
            projectNumber: "", date: new Date().toISOString().slice(0, 10), pageNumber: "1",
            animatorName: "", versionNumber: "1.0", shotNumber: "", fps: parseInt(fps) || 24,
        };
        this.frameCount = parseInt(frameCount) || 48;
        this.rows = [];
        this._initializeRows();
        this.clearAudioData(false);
        this.drawingLayers = [{ name: "foreground", visible: true, objects: [] }];
        this.activeDrawingLayerIndex = 0;
        document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'newProject' } }));
    }


    _initializeRows() {
        this.rows = [];
        const defaultCellData = { action: "", dialogue: "", soundFx: "", techNotes: "", camera: "" };
        for (let i = 0; i < this.frameCount; i++) {
            this.rows.push({ ...defaultCellData });
        }
    }

    setFrameCount(count) {
        count = Math.max(1, parseInt(count) || 1);
        const oldCount = this.frameCount;
        if (oldCount === count) return;

        console.log(`ProjectData: Setting frame count from ${oldCount} to ${count}`);
        this.frameCount = count;

        if (count > oldCount) {
            const defaultCellData = { action: "", dialogue: "", soundFx: "", techNotes: "", camera: "" };
            for (let i = oldCount; i < count; i++) {
                this.rows.push({ ...defaultCellData });
            }
        } else {
            this.rows = this.rows.slice(0, count);
        }
        this.isModified = true;
        document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'frameCount', frameCount: this.frameCount } }));
    }

    getCellData(frameIndex, columnKey) {
        if (frameIndex >= 0 && frameIndex < this.rows.length) {
            return this.rows[frameIndex][columnKey] || "";
        }
        return "";
    }

    setCellData(frameIndex, columnKey, value) {
        if (frameIndex >= 0 && frameIndex < this.rows.length) {
            if (!this.rows[frameIndex]) this.rows[frameIndex] = {};
            if (this.rows[frameIndex][columnKey] !== value) {
                this.rows[frameIndex][columnKey] = value;
                this.isModified = true;
                document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'cellData', frameIndex, columnKey } }));
            }
        }
    }


    loadAudioData(audioBuffer, fileName, filePath = null) {
        this.audio.audioBuffer = audioBuffer;
        this.audio.fileName = fileName;
        this.audio.filePath = filePath;
        if (audioBuffer) {
            this.audio.duration = audioBuffer.duration;
            this.audio.sampleRate = audioBuffer.sampleRate;
            this.audio.numberOfChannels = audioBuffer.numberOfChannels;
            this.audio.currentTime = 0;
            this.generateWaveformData();
            this.isModified = true;

            const requiredFrames = Math.ceil(this.audio.duration * this.metadata.fps);
            // Update the frame count FIRST, then dispatch audioLoaded
            if (requiredFrames > this.frameCount) {
                this.setFrameCount(requiredFrames); // This will dispatch 'frameCount' reason
            }
            // Now dispatch audioLoaded after frame count is updated
            document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'audioLoaded' } }));
        } else {
            this.clearAudioData();
        }
    }

    clearAudioData(dispatchEvent = true) {
        this.audio = {
            fileName: null, filePath: null, audioBuffer: null,
            duration: 0, sampleRate: 0, numberOfChannels: 0, waveformData: [],
            currentTime: 0
        };
        this.isModified = true;
        // console.log("ProjectData: Audio data cleared.");
        if (dispatchEvent) {
            document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'audioCleared' } }));
        }
    }

    generateWaveformData(targetPoints = 2000) {
        if (!this.audio.audioBuffer || this.audio.numberOfChannels === 0) {
            this.audio.waveformData = []; return;
        }
        const channelData = this.audio.audioBuffer.getChannelData(0);
        const totalSamples = channelData.length;
        targetPoints = Math.min(targetPoints, totalSamples);
        if (targetPoints <= 0) { this.audio.waveformData = []; return; }
        const samplesPerPoint = Math.max(1, Math.floor(totalSamples / targetPoints));
        const waveform = []; let maxVal = 1e-5;
        for (let i = 0; i < targetPoints; i++) {
            const start = i * samplesPerPoint;
            const end = Math.min(start + samplesPerPoint, totalSamples);
            let sumSquares = 0; let count = 0;
            for (let j = start; j < end; j++) { sumSquares += channelData[j] * channelData[j]; count++; }
            const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
            waveform.push(rms);
            if (rms > maxVal) maxVal = rms;
        }
        this.audio.waveformData = waveform.map(val => val / maxVal);
    }

    addDrawingObject(object, layerIndex = this.activeDrawingLayerIndex) {
        if (layerIndex >= 0 && layerIndex < this.drawingLayers.length) {
            this.drawingLayers[layerIndex].objects.push(object);
            this.isModified = true;
            document.dispatchEvent(new CustomEvent('drawingChanged', { detail: { layerIndex } }));
        }
    }
    clearAllDrawings() {
        this.drawingLayers.forEach(layer => layer.objects = []);
        this.isModified = true;
        document.dispatchEvent(new CustomEvent('drawingChanged', { detail: { allLayers: true } }));
    }

    toSerializableObject() {
        return {
            projectName: this.projectName,
            metadata: { ...this.metadata },
            frameCount: this.frameCount,
            rows: JSON.parse(JSON.stringify(this.rows)),
            audio: {
                fileName: this.audio.fileName, filePath: this.audio.filePath,
                duration: this.audio.duration, sampleRate: this.audio.sampleRate,
                numberOfChannels: this.audio.numberOfChannels, currentTime: this.audio.currentTime,
            },
            drawingLayers: JSON.parse(JSON.stringify(this.drawingLayers.map(layer => ({
                name: layer.name, visible: layer.visible,
                objects: layer.objects.map(obj => typeof obj.toJSON === 'function' ? obj.toJSON() : { ...obj })
            })))),
            activeDrawingLayerIndex: this.activeDrawingLayerIndex,
        };
    }

    fromSerializableObject(data) {
        this.projectName = data.projectName || `AnimationXSheet_${new Date().toISOString().slice(0, 10)}`;
        this.metadata = { ...(this.metadata), ...(data.metadata || {}) };
        this.frameCount = data.frameCount || 48;
        this._initializeRows();
        if (data.rows) {
            for (let i = 0; i < Math.min(this.rows.length, data.rows.length); i++) {
                this.rows[i] = { ...(this.rows[i]), ...(data.rows[i]) };
            }
        }
        if (data.audio) {
            this.audio.fileName = data.audio.fileName || null;
            this.audio.filePath = data.audio.filePath || null;
            this.audio.audioBuffer = null;
            this.audio.duration = data.audio.duration || 0;
            this.audio.sampleRate = data.audio.sampleRate || 0;
            this.audio.numberOfChannels = data.audio.numberOfChannels || 0;
            this.audio.currentTime = data.audio.currentTime || 0;
            this.audio.waveformData = [];
        }
        if (data.drawingLayers) {
            this.drawingLayers = data.drawingLayers.map(layerData => ({
                name: layerData.name, visible: layerData.visible,
                objects: layerData.objects.map(objData => ({ ...objData }))
            }));
        }
        this.activeDrawingLayerIndex = data.activeDrawingLayerIndex !== undefined ? data.activeDrawingLayerIndex : 0;
        this.isModified = false;
        document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'projectLoaded' } }));
    }
}