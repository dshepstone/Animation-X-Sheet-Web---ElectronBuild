// js/fileHandler.js
console.log("fileHandler.js loaded.");
window.XSheetApp = window.XSheetApp || {};
window.XSheetApp.FileHandler = {
    projectDataRef: null,
    audioHandlerRef: null,
    xsheetRef: null,
    uiElements: null,

    init: function (projectData, audioHandler, xsheet, domElements) {
        console.log("FileHandler: init.");
        this.projectDataRef = projectData;
        this.audioHandlerRef = audioHandler;
        this.xsheetRef = xsheet;
        this.uiElements = domElements;

        if (this.uiElements.btnSaveProject) {
            this.uiElements.btnSaveProject.addEventListener('click', () => this.saveProject());
        } else {
            console.warn("FileHandler: btnSaveProject not found in domElements.");
        }

        if (this.uiElements.btnLoadProject) {
            this.uiElements.btnLoadProject.addEventListener('click', () => this.loadProjectFilePicker());
        } else {
            console.warn("FileHandler: btnLoadProject not found in domElements.");
        }

        if (this.uiElements.fileInputLoadProject) {
            // Corrected: Call the method using 'this._handleLegacyFileLoad'
            this.uiElements.fileInputLoadProject.addEventListener('change', (event) => this._handleLegacyFileLoad(event));
        } else {
            console.warn("FileHandler: fileInputLoadProject not found for fallback.");
        }
    },

    saveProject: async function () {
        if (!this.projectDataRef) {
            alert("No project data to save.");
            console.error("FileHandler: projectDataRef is not set. Cannot save.");
            return;
        }
        if (this.uiElements.statusBar) this.uiElements.statusBar.textContent = "Status: Saving project...";

        const serializable = this.projectDataRef.toSerializableObject();
        const jsonData = JSON.stringify(serializable, null, 2);
        const fileName = (this.projectDataRef.projectName || 'xsheet_project')
            + '_' + new Date().toISOString().slice(0, 10).replace(/-/g, '')
            + '.json';

        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{ description: "X-Sheet Project", accept: { "application/json": [".json"] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(jsonData);
                await writable.close();
                console.log("FileHandler: Project saved via File System Access API →", fileName);
            } else {
                const blob = new Blob([jsonData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = fileName;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
                console.log("FileHandler: Project saved via download link →", fileName);
            }

            if (this.uiElements.statusBar) this.uiElements.statusBar.textContent = "Status: Project saved 🙂";
            this.projectDataRef.isModified = false;

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("FileHandler: Save error:", err);
                alert("Couldn’t save file: " + err.message);
                if (this.uiElements.statusBar) this.uiElements.statusBar.textContent = "Status: Save error";
            } else {
                console.log("FileHandler: Save operation cancelled by user.");
                if (this.uiElements.statusBar) this.uiElements.statusBar.textContent = "Status: Save cancelled.";
            }
        }
    },

    loadProjectFilePicker: async function () {
        if (!this.projectDataRef || !this.audioHandlerRef || !this.xsheetRef) {
            alert("Error: Application not ready to load project.");
            console.error("FileHandler: Core references not initialized for loadProjectFilePicker.");
            return;
        }

        if (window.showOpenFilePicker) {
            try {
                console.log("FileHandler: Using File System Access API for loading.");
                const [handle] = await window.showOpenFilePicker({
                    types: [{ description: "X-Sheet Project", accept: { "application/json": [".json"] } }],
                    multiple: false
                });
                const file = await handle.getFile();
                // Corrected: Call the method using 'this._processLoadedFile'
                await this._processLoadedFile(file);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("FileHandler: Load error (File System Access API):", err);
                    alert("Error opening file: " + err.message);
                    if (this.uiElements.statusBar) this.uiElements.statusBar.textContent = "Status: Error opening file.";
                } else {
                    console.log("FileHandler: File open operation cancelled by user.");
                    if (this.uiElements.statusBar) this.uiElements.statusBar.textContent = "Status: Load cancelled.";
                }
            }
            return;
        }

        console.log("FileHandler: Falling back to legacy file input for loading.");
        if (this.uiElements.fileInputLoadProject) {
            this.uiElements.fileInputLoadProject.click();
        } else {
            alert("Error: File input element not found for loading.");
            console.error("FileHandler: fileInputLoadProject element not found for fallback.");
        }
    },

    // Corrected: Changed from #handleLegacyFileLoad to _handleLegacyFileLoad
    _handleLegacyFileLoad: async function (event) {
        const file = event?.target?.files?.[0];
        if (file) {
            // Corrected: Call the method using 'this._processLoadedFile'
            await this._processLoadedFile(file);
        }
        if (event?.target) event.target.value = null;
    },

    // Corrected: Changed from #processLoadedFile to _processLoadedFile
    _processLoadedFile: async function (file) {
        if (!file) {
            console.warn("FileHandler _processLoadedFile: No file provided.");
            return;
        }
        console.log(`FileHandler: Processing file: ${file.name}`);
        if (this.uiElements.statusBar) this.uiElements.statusBar.textContent = "Status: Loading " + file.name + "...";

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            this.projectDataRef.fromSerializableObject(data);

            if (data.audio && data.audio.fileName) {
                this.audioHandlerRef.stopContinuous();
                this.audioHandlerRef.mainAudioBuffer = null;

                const audioMsg = `Project loaded. Audio specified: "${data.audio.fileName}". Please re-import this audio file if different from current.`;
                console.log(audioMsg);
                document.dispatchEvent(new CustomEvent('audioMetadataLoaded', {
                    detail: { filename: data.audio.fileName, duration: data.audio.duration || 0 }
                }));
            } else {
                this.projectDataRef.clearAudioData(true);
                this.audioHandlerRef.stopContinuous();
                this.audioHandlerRef.mainAudioBuffer = null;
                console.log("FileHandler: Project loaded. No audio information in project; current audio cleared.");
                document.dispatchEvent(new CustomEvent('audioMetadataLoaded', {
                    detail: { filename: null, duration: 0 }
                }));
            }

            console.log("FileHandler: Project data successfully loaded and applied from file ←", file.name);
            if (this.uiElements.statusBar) this.uiElements.statusBar.textContent = "Status: Project loaded 👍";
            this.projectDataRef.isModified = false;

        } catch (err) {
            console.error("FileHandler: Error loading or parsing file content:", err);
            alert("Couldn’t load or parse file: " + err.message + "\nIs it a valid X-Sheet JSON file?");
            if (this.uiElements.statusBar) this.uiElements.statusBar.textContent = "Status: Error loading project file";
        }
    }
};