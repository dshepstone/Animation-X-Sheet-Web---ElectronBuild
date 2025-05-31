// js/projectData.js – Max 4 Custom Columns, Corrected Right-Side Shift
// -----------------------------------------------------------------------------
// - Assumes CSS has fixed widths for columns left of where custom columns are inserted.
// - The reference point for shifts is consistently 'frameNumber2'.
// - Drawings over fixed left columns are NOT touched.
// - Drawings over custom columns, frameNumber2, camera-col ARE shifted.
// - Max custom columns set to 4.
// -----------------------------------------------------------------------------

class ProjectData {
    constructor(projectName = `AnimationXSheet_${new Date().toISOString().slice(0, 10)}`) {
        this.projectName = projectName;
        this.filePath = null;
        this.isModified = false;
        this.projectFolderHandle = null;
        this.sceneFolderHandle = null;
        this.audioFolderHandle = null;
        this.exportsFolderHandle = null;
        this.projectPath = null;
        this.metadata = {
            projectNumber: "", date: new Date().toISOString().slice(0, 10), pageNumber: "1",
            animatorName: "", versionNumber: "1.0", shotNumber: "", fps: 24,
        };
        this.frameCount = 48;
        this.rows = [];
        this.customColumns = [];
        this.maxCustomColumns = 4; // UPDATED MAX CUSTOM COLUMNS
        this.nextCustomColumnId = 1;
        this.audio = {
            fileName: null, filePath: null, audioBuffer: null,
            duration: 0, sampleRate: 0, numberOfChannels: 0,
            waveformData: [], currentTime: 0,
        };
        this.lastScrubPlayTime = 0;
        this.drawingLayers = [{ name: "foreground", visible: true, objects: [] }];
        this.activeDrawingLayerIndex = 0;
        this.initNewProject(this.metadata.fps, this.frameCount);
        console.log("ProjectData initialized (Max 4 Custom, Fixed Left CSS):", this.projectName);
    }

    initNewProject(fps = 24, frameCount = 48) {
        console.log("ProjectData: initNewProject called");
        this.projectName = `AnimationXSheet_${new Date().toISOString().slice(0, 10)}`;
        this.filePath = null; this.isModified = false;
        this.projectFolderHandle = null; this.sceneFolderHandle = null; this.audioFolderHandle = null; this.exportsFolderHandle = null; this.projectPath = null;
        this.metadata = { projectNumber: "", date: new Date().toISOString().slice(0, 10), pageNumber: "1", animatorName: "", versionNumber: "1.0", shotNumber: "", fps: parseInt(fps) || 24 };
        this.frameCount = parseInt(frameCount) || 48;
        this.rows = []; this.customColumns = []; this.nextCustomColumnId = 1;
        this._initializeRows(); this.clearAudioData(false);
        this.drawingLayers = [{ name: "foreground", visible: true, objects: [] }]; this.activeDrawingLayerIndex = 0;
        document.dispatchEvent(new CustomEvent('projectFolderChanged', { detail: { projectPath: null } }));
        document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'newProject' } }));
    }

    _initializeRows() {
        this.rows = [];
        const defaultCellData = { action: "", dialogue: "", soundFx: "", techNotes: "", camera: "" };
        this.customColumns.forEach(col => { defaultCellData[col.key] = ""; });
        for (let i = 0; i < this.frameCount; i++) {
            this.rows.push({ ...defaultCellData });
        }
    }

    _getColumnLeftEdge(columnKey) {
        const tbl = document.getElementById('xsheetTable');
        if (!tbl) {
            console.warn(`ProjectData: Cannot find table for column edge detection (key: ${columnKey})`);
            return null;
        }
        const th = tbl.querySelector(`thead th[data-column-key="${columnKey}"]`);
        if (!th) {
            if (!columnKey.startsWith("custom")) {
                console.warn(`ProjectData: Cannot find header for non-custom column "${columnKey}"`);
            }
            return null;
        }
        return th.offsetLeft;
    }

    addCustomColumn(displayName = null) {
        if (this.customColumns.length >= this.maxCustomColumns) { // Check against updated max
            console.warn(`ProjectData: Max ${this.maxCustomColumns} custom columns reached.`);
            return { success: false, reason: 'maxColumnsReached' };
        }

        const frame2LeftBefore = this._getColumnLeftEdge('frameNumber2');

        const columnKey = `custom${this.nextCustomColumnId}`;
        const finalDisplayName = displayName || `Custom ${this.nextCustomColumnId}`;
        const newColumn = { key: columnKey, displayName: finalDisplayName, editable: true, className: 'custom-col', id: this.nextCustomColumnId };

        this.customColumns.push(newColumn);
        this.nextCustomColumnId++;
        this.rows.forEach(row => { row[columnKey] = ""; });
        this.isModified = true;
        const reason = 'columnAdded';

        document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: reason, columnKey: columnKey, displayName: finalDisplayName } }));
        document.dispatchEvent(new CustomEvent('customColumnsChanged', { detail: { count: this.customColumns.length, maxCount: this.maxCustomColumns, action: 'added' } }));

        requestAnimationFrame(() => {
            const frame2LeftAfter = this._getColumnLeftEdge('frameNumber2');
            this._adjustDrawingsBasedOnReferenceShift(frame2LeftBefore, frame2LeftAfter, reason);
        });
        return { success: true, columnKey: columnKey, displayName: finalDisplayName };
    }

    removeCustomColumn() {
        if (this.customColumns.length === 0) {
            console.warn("ProjectData: No custom columns to remove.");
            return { success: false, reason: 'noColumnsToRemove' };
        }

        const frame2LeftBefore = this._getColumnLeftEdge('frameNumber2');

        const removedColumn = this.customColumns.pop();
        this.rows.forEach(row => { delete row[removedColumn.key]; });
        this.isModified = true;
        const reason = 'columnRemoved';

        document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: reason, columnKey: removedColumn.key } }));
        document.dispatchEvent(new CustomEvent('customColumnsChanged', { detail: { count: this.customColumns.length, maxCount: this.maxCustomColumns, action: 'removed' } }));

        setTimeout(() => {
            const frame2LeftAfter = this._getColumnLeftEdge('frameNumber2');
            this._adjustDrawingsBasedOnReferenceShift(frame2LeftBefore, frame2LeftAfter, reason);
        }, 150);
        return { success: true, removedColumn: removedColumn };
    }

    _adjustDrawingsBasedOnReferenceShift(originalReferenceX, newReferenceX, reason) {
        if (originalReferenceX === null || !isFinite(originalReferenceX) ||
            newReferenceX === null || !isFinite(newReferenceX)) {
            console.warn(`ProjectData (${reason}): Invalid reference X positions for adjustment. OriginalX: ${originalReferenceX}, NewX: ${newReferenceX}. Drawings not adjusted.`);
            document.dispatchEvent(new CustomEvent('drawingChanged', {
                detail: { allLayers: true, reason: 'layoutPossiblyChanged_noTransform' }
            }));
            return;
        }

        const shiftAmount = newReferenceX - originalReferenceX;

        if (Math.abs(shiftAmount) < 0.5) {
            console.log(`ProjectData (${reason}): Negligible shift for reference point (${shiftAmount.toFixed(2)}px). No drawing data adjustment.`);
            document.dispatchEvent(new CustomEvent('drawingChanged', {
                detail: { allLayers: true, reason: 'layoutPossiblyChanged_noTransform' }
            }));
            return;
        }

        console.log(`ProjectData (${reason}): Shifting drawings originally at or right of reference ${originalReferenceX.toFixed(1)}px by ${shiftAmount.toFixed(2)}px. New reference at ${newReferenceX.toFixed(1)}px.`);

        let pointsAdjustedCount = 0;
        this.drawingLayers.forEach(layer => {
            if (!layer.objects) return;
            layer.objects.forEach(obj => {
                if (!obj.points) return;
                obj.points.forEach(point => {
                    if (typeof point.x !== 'number' || !isFinite(point.x)) return;
                    if (point.x >= originalReferenceX) {
                        point.x += shiftAmount;
                        pointsAdjustedCount++;
                    }
                });
            });
        });

        if (pointsAdjustedCount > 0) {
            this.isModified = true;
            console.log(`ProjectData (${reason}): ✅ Shifted ${pointsAdjustedCount} drawing point coordinates.`);
            document.dispatchEvent(new CustomEvent('drawingChanged', {
                detail: { allLayers: true, reason: 'columnLayoutAdjusted', shiftAmount: shiftAmount, originalMarker: originalReferenceX }
            }));
        } else {
            console.log(`ProjectData (${reason}): No drawing points qualified for adjustment or no points exist right of the marker.`);
            document.dispatchEvent(new CustomEvent('drawingChanged', {
                detail: { allLayers: true, reason: 'layoutPossiblyChanged_noTransform' }
            }));
        }
    }

    renameCustomColumn(columnKey, newDisplayName) {
        const column = this.customColumns.find(col => col.key === columnKey);
        if (!column) return { success: false, reason: 'columnNotFound' };
        const oldName = column.displayName;
        column.displayName = newDisplayName;
        this.isModified = true;
        console.log(`ProjectData: Renamed column "${oldName}" to "${newDisplayName}"`);
        document.dispatchEvent(new CustomEvent('projectDataChanged', {
            detail: { reason: 'columnRenamed', columnKey: columnKey, oldName: oldName, newName: newDisplayName }
        }));
        return { success: true, oldName: oldName, newName: newDisplayName };
    }

    getCustomColumnInfo() {
        return {
            count: this.customColumns.length, maxCount: this.maxCustomColumns, // Uses updated maxCustomColumns
            canAdd: this.customColumns.length < this.maxCustomColumns,
            canRemove: this.customColumns.length > 0,
            columns: [...this.customColumns]
        };
    }

    setFrameCount(count) {
        count = Math.max(1, parseInt(count) || 1);
        if (this.frameCount === count) return;
        const oldCount = this.frameCount;
        this.frameCount = count;
        const defaultCellData = { action: "", dialogue: "", soundFx: "", techNotes: "", camera: "" };
        this.customColumns.forEach(col => { defaultCellData[col.key] = ""; });
        if (count > oldCount) {
            for (let i = oldCount; i < count; i++) this.rows.push({ ...defaultCellData });
        } else {
            this.rows = this.rows.slice(0, count);
        }
        this.isModified = true;
        document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'frameCount', frameCount: this.frameCount } }));
    }

    getCellData(frameIndex, columnKey) {
        return (frameIndex >= 0 && frameIndex < this.rows.length) ? (this.rows[frameIndex][columnKey] || "") : "";
    }

    setCellData(frameIndex, columnKey, value) {
        if (frameIndex >= 0 && frameIndex < this.rows.length) {
            if (!this.rows[frameIndex]) this.rows[frameIndex] = {};
            if (this.rows[frameIndex][columnKey] !== value) {
                this.rows[frameIndex][columnKey] = value;
                this.isModified = true;
                document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'cellData', frameIndex: frameIndex, columnKey: columnKey } }));
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
            if (requiredFrames > this.frameCount) this.setFrameCount(requiredFrames);
            document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'audioLoaded' } }));
        } else {
            this.clearAudioData();
        }
    }

    clearAudioData(dispatchEvent = true) {
        this.audio = { fileName: null, filePath: null, audioBuffer: null, duration: 0, sampleRate: 0, numberOfChannels: 0, waveformData: [], currentTime: 0 };
        this.lastScrubPlayTime = 0;
        this.isModified = true;
        if (dispatchEvent) document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'audioCleared' } }));
    }

    generateWaveformData(targetPoints = 2000) {
        if (!this.audio.audioBuffer || this.audio.numberOfChannels === 0) { this.audio.waveformData = []; return; }
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
        this.audio.waveformData = waveform.map(val => maxVal > 1e-5 ? (val / maxVal) : 0);
    }

    addDrawingObject(object, layerIndex = this.activeDrawingLayerIndex) {
        if (layerIndex >= 0 && layerIndex < this.drawingLayers.length) {
            this.drawingLayers[layerIndex].objects.push(object);
            this.isModified = true;
            document.dispatchEvent(new CustomEvent('drawingChanged', { detail: { layerIndex: layerIndex } }));
        }
    }

    clearAllDrawings() {
        this.drawingLayers.forEach(layer => { layer.objects = []; });
        this.isModified = true;
        document.dispatchEvent(new CustomEvent('drawingChanged', { detail: { allLayers: true } }));
    }

    setProjectFolder(projectFolderHandle, sceneFolderHandle, audioFolderHandle, exportsFolderHandle, projectPath) {
        this.projectFolderHandle = projectFolderHandle;
        this.sceneFolderHandle = sceneFolderHandle;
        this.audioFolderHandle = audioFolderHandle;
        this.exportsFolderHandle = exportsFolderHandle;
        this.projectPath = projectPath;
        console.log(`ProjectData: Project folder set to "${projectPath}" with exports folder`);
        document.dispatchEvent(new CustomEvent('projectFolderChanged', { detail: { projectPath: this.projectPath } }));
    }

    toSerializableObject() {
        return {
            projectName: this.projectName, metadata: { ...this.metadata }, frameCount: this.frameCount,
            rows: JSON.parse(JSON.stringify(this.rows)),
            customColumns: JSON.parse(JSON.stringify(this.customColumns)),
            nextCustomColumnId: this.nextCustomColumnId,
            audio: {
                fileName: this.audio.fileName, filePath: this.audio.filePath, duration: this.audio.duration,
                sampleRate: this.audio.sampleRate, numberOfChannels: this.audio.numberOfChannels,
                currentTime: this.audio.currentTime,
            },
            drawingLayers: JSON.parse(JSON.stringify(this.drawingLayers.map(layer => {
                return {
                    name: layer.name, visible: layer.visible,
                    objects: layer.objects.map(obj => (typeof obj.toJSON === 'function') ? obj.toJSON() : { ...obj })
                };
            }))),
            activeDrawingLayerIndex: this.activeDrawingLayerIndex
        };
    }

    fromSerializableObject(data) {
        this.projectName = data.projectName || `AnimationXSheet_${new Date().toISOString().slice(0, 10)}`;
        this.metadata = { ...this.metadata, ...(data.metadata || {}) };
        this.frameCount = data.frameCount || 48;

        this.customColumns = data.customColumns || [];

        if (typeof data.nextCustomColumnId === 'number' && isFinite(data.nextCustomColumnId) && data.nextCustomColumnId > 0) {
            this.nextCustomColumnId = data.nextCustomColumnId;
        } else {
            if (this.customColumns.length > 0) {
                const numericIds = this.customColumns
                    .map(c => c.id)
                    .filter(id => typeof id === 'number' && isFinite(id));

                if (numericIds.length > 0) {
                    this.nextCustomColumnId = Math.max(1, ...numericIds) + 1;
                } else {
                    this.nextCustomColumnId = this.customColumns.length + 1;
                }
            } else {
                this.nextCustomColumnId = 1;
            }
        }
        this.nextCustomColumnId = Math.max(1, this.nextCustomColumnId);

        this._initializeRows();
        if (data.rows && Array.isArray(data.rows)) {
            for (let i = 0; i < Math.min(this.rows.length, data.rows.length); i++) {
                if (data.rows[i]) {
                    this.rows[i] = { ...this.rows[i], ...data.rows[i] };
                }
            }
        }
        this.clearAudioData(false);
        if (data.audio) {
            this.audio.fileName = data.audio.fileName || null;
            this.audio.filePath = data.audio.filePath || null;
            this.audio.duration = (typeof data.audio.duration === 'number') ? data.audio.duration : 0;
            this.audio.sampleRate = (typeof data.audio.sampleRate === 'number') ? data.audio.sampleRate : 0;
            this.audio.numberOfChannels = (typeof data.audio.numberOfChannels === 'number') ? data.audio.numberOfChannels : 0;
            this.audio.currentTime = (typeof data.audio.currentTime === 'number') ? data.audio.currentTime : 0;
        }
        if (data.drawingLayers && Array.isArray(data.drawingLayers)) {
            this.drawingLayers = data.drawingLayers.map(layerData => {
                return {
                    name: layerData.name,
                    visible: layerData.visible,
                    objects: (Array.isArray(layerData.objects)) ? layerData.objects.map(objData => ({ ...objData })) : []
                };
            });
        } else {
            this.drawingLayers = [{ name: "foreground", visible: true, objects: [] }];
        }
        this.activeDrawingLayerIndex = (typeof data.activeDrawingLayerIndex === 'number') ? data.activeDrawingLayerIndex : 0;
        if (this.activeDrawingLayerIndex >= this.drawingLayers.length || this.activeDrawingLayerIndex < 0) {
            this.activeDrawingLayerIndex = 0;
        }

        this.isModified = false;
        console.log(`ProjectData: Loaded project with ${this.customColumns.length} custom columns. Next ID: ${this.nextCustomColumnId}`);
        document.dispatchEvent(new CustomEvent('projectDataChanged', { detail: { reason: 'projectLoaded' } }));
    }

    // General utility for scaling, not used directly by column add/remove now.
    _transformDrawingsForTableResize(oldTableWidth, newTableWidth, reason) {
        if (!oldTableWidth || !newTableWidth || !isFinite(oldTableWidth) || !isFinite(newTableWidth) || oldTableWidth <= 0 || newTableWidth <= 0) {
            console.log(`ProjectData (_transformDrawingsForTableResize - Utility): Invalid widths (${oldTableWidth} → ${newTableWidth}), cannot transform.`);
            return 0;
        }
        if (Math.abs(oldTableWidth - newTableWidth) < 0.5) {
            console.log(`ProjectData (_transformDrawingsForTableResize - Utility): No significant width change (${oldTableWidth.toFixed(1)}px → ${newTableWidth.toFixed(1)}px), transformation skipped.`);
            document.dispatchEvent(new CustomEvent('drawingChanged', {
                detail: { allLayers: true, reason: 'layoutPossiblyChanged_noTransform', oldWidth: oldTableWidth, newWidth: newTableWidth }
            }));
            return 0;
        }

        const scaleX = newTableWidth / oldTableWidth;
        if (!isFinite(scaleX) || Math.abs(scaleX - 1) < 0.0001) {
            console.log(`ProjectData (_transformDrawingsForTableResize - Utility): Scale factor too small, invalid, or ~1 (${scaleX.toFixed(4)}), skipping actual scaling.`);
            document.dispatchEvent(new CustomEvent('drawingChanged', {
                detail: { allLayers: true, reason: 'layoutPossiblyChanged_noTransform', oldWidth: oldTableWidth, newWidth: newTableWidth }
            }));
            return 0;
        }

        let transformedObjects = 0;
        console.log(`ProjectData (_transformDrawingsForTableResize - Utility): Scaling drawings for table resize (${oldTableWidth.toFixed(1)}px → ${newTableWidth.toFixed(1)}px, scaleX: ${scaleX.toFixed(4)}) due to ${reason}`);

        this.drawingLayers.forEach((layer) => {
            if (!layer.objects || layer.objects.length === 0) return;
            layer.objects.forEach((obj) => {
                if (!obj.points || obj.points.length === 0) return;
                let pointsTransformed = 0;
                obj.points.forEach((point) => {
                    if (typeof point.x === 'number' && isFinite(point.x)) {
                        point.x = point.x * scaleX;
                        pointsTransformed++;
                    }
                });
                if (pointsTransformed > 0) transformedObjects++;
            });
        });

        if (transformedObjects > 0) {
            this.isModified = true;
            console.log(`ProjectData (_transformDrawingsForTableResize - Utility): ✅ Scaled ${transformedObjects} drawing objects for ${reason}.`);
        } else {
            console.log(`ProjectData (_transformDrawingsForTableResize - Utility): No drawing objects met criteria for scaling.`);
        }

        document.dispatchEvent(new CustomEvent('drawingChanged', {
            detail: {
                allLayers: true,
                reason: 'coordinateTransform',
                scaleX: scaleX,
                transformedObjects: transformedObjects,
                oldWidth: oldTableWidth,
                newWidth: newTableWidth
            }
        }));
        return transformedObjects;
    }
}

window.ProjectData = ProjectData;