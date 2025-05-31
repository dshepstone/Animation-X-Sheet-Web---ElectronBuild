// js/exportHandler.js - Updated with Dynamic Columns Support
console.log("exportHandler.js loaded.");
window.XSheetApp = window.XSheetApp || {};
window.XSheetApp.ExportHandler = {
    isExporting: false,
    exportContainer: null,
    exportTable: null,
    exportTableContainer: null,

    init: function (projectData, xsheetRef, drawingCanvasRef) {
        console.log("ExportHandler: init function CALLED.");
        this.projectData = projectData;
        this.xsheet = xsheetRef;
        this.drawingCanvas = drawingCanvasRef;
        this.btnExportPDF = document.getElementById('btnExportPDF');
        // console.log("ExportHandler: btnExportPDF element:", this.btnExportPDF); 
        if (this.btnExportPDF) {
            // console.log("ExportHandler: Attaching click listener to btnExportPDF.");
            this.btnExportPDF.addEventListener('click', () => {
                console.log("ExportHandler: btnExportPDF CLICKED!");
                this.exportToPDF();
            });
        } else {
            console.error("ExportHandler: btnExportPDF element NOT FOUND in the DOM!");
        }
    },

    // NEW: Get active columns for export (matches XSheet logic)
    _getActiveColumnsForExport: function() {
        const baseColumns = [
            { key: "action", displayName: "Action/Description", editable: true, className: "action-col" },
            { key: "frameNumber1", displayName: "Fr", editable: false, className: "frame-col", type: "frameNumber" },
            { key: "audioWaveform", displayName: "Audio Waveform", editable: false, className: "waveform-col", type: "waveform" },
            { key: "dialogue", displayName: "Dialogue", editable: true, className: "dialogue-col" },
            { key: "soundFx", displayName: "Sound FX", editable: true, className: "sound-col" },
            { key: "techNotes", displayName: "Tech. Notes", editable: true, className: "technical-col" },
        ];

        const activeColumns = [...baseColumns];

        // Insert custom columns after techNotes
        if (this.projectData.customColumns && this.projectData.customColumns.length > 0) {
            this.projectData.customColumns.forEach(customCol => {
                activeColumns.push({
                    key: customCol.key,
                    displayName: customCol.displayName,
                    editable: customCol.editable,
                    className: customCol.className,
                    type: 'custom'
                });
            });
        }

        // Add remaining base columns
        activeColumns.push(
            { key: "frameNumber2", displayName: "Fr", editable: false, className: "frame-col", type: "frameNumber" },
            { key: "camera", displayName: "Camera Moves", editable: true, className: "camera-col" }
        );

        console.log(`ExportHandler: Generated ${activeColumns.length} columns for export (${this.projectData.customColumns?.length || 0} custom)`);
        return activeColumns;
    },

    getOriginalRowHeight: function () {
        const originalTable = document.getElementById('xsheetTable');
        const originalBodyRowSample = originalTable?.querySelector('tbody tr');
        let originalRowHeight = 22;
        if (originalBodyRowSample) {
            originalRowHeight = originalBodyRowSample.offsetHeight;
        }
        if (originalRowHeight <= 0 || Number.isNaN(originalRowHeight)) {
            // console.warn("getOriginalRowHeight: Invalid or zero row height measured, defaulting to 22px.");
            originalRowHeight = 22;
        }
        return originalRowHeight;
    },

    createExportPage: async function () {
        console.log("ExportHandler: Creating export page...");
        this.cleanupExportPage();

        const originalTable = document.getElementById('xsheetTable');
        const originalContainer = document.getElementById('xsheet-container');
        if (!originalTable || !originalContainer) {
            console.error("ExportHandler: Cannot find original table/container for reference"); return null;
        }

        const originalRowHeight = this.getOriginalRowHeight();
        const originalThead = originalTable.querySelector('thead');
        let originalTheadHeight = 50;
        if (originalThead && originalThead.offsetHeight > 0) {
            originalTheadHeight = originalThead.offsetHeight;
        } else if (originalThead) {
            const firstTh = originalThead.querySelector('th');
            if (firstTh && firstTh.offsetHeight > 0) originalTheadHeight = firstTh.offsetHeight;
            // else console.warn("ExportHandler: Original thead or its TH height problematic, using default 50px for thead.");
        } else {
            // console.warn("ExportHandler: Original thead not found, using default 50px for thead height.");
        }

        this.exportContainer = document.createElement('div');
        this.exportContainer.id = 'export-container';
        
        // NEW: Add dynamic column class for proper styling
        const customColumnCount = this.projectData.customColumns?.length || 0;
        if (customColumnCount > 0) {
            this.exportContainer.classList.add(`has-${customColumnCount}-custom`);
        }

        Object.assign(this.exportContainer.style, {
            position: 'fixed',
            top: '0px', left: '0px', zIndex: '10001',
            visibility: 'hidden',
            backgroundColor: '#ffffff',
            padding: '20px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            width: originalContainer.scrollWidth + 'px',
            height: 'auto',
            overflow: 'visible'
        });
        const originalStyles = window.getComputedStyle(originalTable);
        this.exportContainer.style.fontSize = originalStyles.fontSize;
        this.exportContainer.style.lineHeight = originalStyles.lineHeight;

        document.body.appendChild(this.exportContainer);
        // console.log("ExportHandler: Export container appended (initially for layout).");

        this.createExportMetadata();

        // console.log("ExportHandler: Calling createExportTableWithOverlays...");
        await this.createExportTableWithOverlays(originalRowHeight, originalTheadHeight);
        // console.log("ExportHandler: createExportTableWithOverlays has resolved.");

        // eslint-disable-next-line no-unused-expressions
        this.exportContainer.offsetHeight;

        // console.log("ExportHandler: Export page fully constructed. scrollHeight:", this.exportContainer.scrollHeight);
        return this.exportContainer;
    },

    createExportMetadata: function () {
        const originalMetadata = document.getElementById('metadata-grid');
        if (!originalMetadata) { /* console.warn("ExportHandler: metadata-grid not found.");*/ return; }
        
        const metadataDiv = document.createElement('div');
        
        // FIXED: Use explicit grid layout that fits within export width
        // Calculate number of columns based on container width to ensure all fields fit
        const containerWidth = this.exportContainer.offsetWidth || 800;
        const minFieldWidth = 160;
        const maxColumns = Math.floor((containerWidth - 40) / (minFieldWidth + 10)); // Account for padding and gaps
        const actualColumns = Math.min(Math.max(3, maxColumns), 6); // Between 3-6 columns
        
        Object.assign(metadataDiv.style, {
            display: 'grid', 
            gridTemplateColumns: `repeat(${actualColumns}, 1fr)`, // Equal width columns that fit
            gap: '5px 10px', 
            marginBottom: '15px',
            fontSize: '11px',
            width: '100%', // Ensure it uses full available width
            boxSizing: 'border-box'
        });
        
        const metadataFields = [
            { label: 'Project #', value: document.getElementById('metaProjectNumber')?.value || '' },
            { label: 'Date', value: document.getElementById('metaDate')?.value || '' },
            { label: 'Page #', value: document.getElementById('metaPageNumber')?.value || '1' },
            { label: 'Animator', value: document.getElementById('metaAnimatorName')?.value || '' },
            { label: 'Version', value: document.getElementById('metaVersionNumber')?.value || '1.0' },
            { label: 'Shot #', value: document.getElementById('metaShotNumber')?.value || '' }
        ];
        
        metadataFields.forEach(field => {
            const fieldDiv = document.createElement('div');
            Object.assign(fieldDiv.style, {
                border: '1px solid #999', 
                padding: '3px 5px', 
                backgroundColor: '#fff',
                display: 'flex', 
                alignItems: 'center',
                minWidth: '0', // Allow shrinking
                overflow: 'hidden' // Prevent overflow
            });
            const label = document.createElement('span');
            label.textContent = field.label + ':';
            Object.assign(label.style, { 
                fontWeight: 'bold', 
                marginRight: '5px', 
                whiteSpace: 'nowrap',
                flexShrink: '0' // Don't shrink the label
            });
            const value = document.createElement('span');
            value.textContent = field.value;
            Object.assign(value.style, {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: '0' // Allow shrinking
            });
            fieldDiv.append(label, value);
            metadataDiv.appendChild(fieldDiv);
        });
        
        this.exportContainer.appendChild(metadataDiv);
        console.log(`ExportHandler: Created metadata grid with ${actualColumns} columns to fit container width ${containerWidth}px`);
    },

    createExportTableWithOverlays: function (originalRowHeight, originalTheadHeight) {
        // console.log("ExportHandler: createExportTableWithOverlays called.");
        return new Promise((resolve, reject) => {
            try {
                const tableContainer = document.createElement('div');
                this.exportTableContainer = tableContainer;
                Object.assign(tableContainer.style, {
                    position: 'relative', border: '1px solid #999',
                    backgroundColor: '#fff', overflow: 'visible'
                });

                // console.log("ExportHandler: Calling createExportTable.");
                this.createExportTable(tableContainer, originalRowHeight, originalTheadHeight);

                this.exportContainer.appendChild(tableContainer);
                // console.log("ExportHandler: Table container appended to exportContainer.");

                if (this.exportTable) {
                    // eslint-disable-next-line no-unused-expressions
                    this.exportTable.offsetHeight;
                    // console.log(`ExportHandler: Reflow triggered for exportTable. OffsetWidth: ${this.exportTable.offsetWidth}`);
                }

                setTimeout(() => {
                    // console.log("ExportHandler: Timeout for overlays started.");
                    if (this.exportTable && this.exportTable.offsetWidth > 0 && this.exportTableContainer) {
                        try {
                            // console.log(`ExportHandler: Creating overlays. Table width: ${this.exportTable.offsetWidth}`);
                            this.createExportWaveform(this.exportTableContainer, originalRowHeight, originalTheadHeight);
                            this.createExportDrawings(this.exportTableContainer, originalRowHeight, originalTheadHeight);
                            // console.log("ExportHandler: Overlays created.");
                            resolve();
                        } catch (overlayError) {
                            console.error("ExportHandler: Error creating overlays:", overlayError);
                            reject(overlayError);
                        }
                    } else {
                        const tableWidth = this.exportTable ? this.exportTable.offsetWidth : 'undefined (this.exportTable is null)';
                        const msg = `ExportHandler: exportTable (width: ${tableWidth}) or exportTableContainer not ready/sized for overlays.`;
                        console.error(msg);
                        if (this.exportTable) console.log("this.exportTable.innerHTML (first 500char):\n", this.exportTable.innerHTML.substring(0, 500));
                        else console.log("this.exportTable is null or undefined.");
                        reject(new Error(msg));
                    }
                }, 200);
            } catch (tableError) {
                console.error("Error in createExportTableWithOverlays (outer try-catch):", tableError);
                reject(tableError);
            }
        });
    },

    createExportTable: function (container, originalRowHeight, originalTheadHeight) {
        if (!originalRowHeight || Number.isNaN(originalRowHeight) || originalRowHeight <= 0) {
            // console.warn("createExportTable: originalRowHeight invalid, recalculating.");
            originalRowHeight = this.getOriginalRowHeight();
        }
        if (!originalTheadHeight || Number.isNaN(originalTheadHeight) || originalTheadHeight <= 0) {
            const ot = document.getElementById('xsheetTable')?.querySelector('thead');
            originalTheadHeight = ot ? ot.offsetHeight : 50;
            // console.warn("createExportTable: originalTheadHeight invalid, using measured/default:", originalTheadHeight);
        }

        const originalTable = document.getElementById('xsheetTable');
        const originalXSheetContainer = document.getElementById('xsheet-container');
        if (!originalTable || !originalXSheetContainer) { console.error("ExportHandler: Missing original table/container for table creation."); return; }

        const exportTableWidth = originalXSheetContainer.scrollWidth;
        const originalStyles = window.getComputedStyle(originalTable);
        const table = document.createElement('table');
        this.exportTable = table;
        const exportTableBodyHeight = this.projectData.frameCount * originalRowHeight;

        // NEW: Add dynamic column class to export table for proper styling
        const customColumnCount = this.projectData.customColumns?.length || 0;
        if (customColumnCount > 0) {
            table.classList.add(`has-${customColumnCount}-custom`);
        }

        Object.assign(table.style, {
            width: exportTableWidth + 'px',
            height: (originalTheadHeight + exportTableBodyHeight) + 'px',
            borderCollapse: originalStyles.borderCollapse,
            tableLayout: 'fixed',
            fontSize: originalStyles.fontSize,
            position: 'relative',
            zIndex: '1'
        });

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        Object.assign(headerRow.style, {
            backgroundColor: '#e9e9e9',
            height: originalTheadHeight + 'px'
        });

        // NEW: Use dynamic columns instead of hardcoded ones
        const EXPORT_COLUMNS = this._getActiveColumnsForExport();
        const originalHeaderCells = originalTable.querySelectorAll('thead th');
        
        EXPORT_COLUMNS.forEach((col, index) => {
            const th = document.createElement('th');
            th.textContent = col.displayName;
            th.className = col.className || '';
            Object.assign(th.style, {
                border: '1px solid #999', fontWeight: 'bold', textAlign: 'center',
                height: originalTheadHeight + 'px'
            });
            if (originalHeaderCells[index]) {
                const originalTh = originalHeaderCells[index];
                const originalThStyles = window.getComputedStyle(originalTh);
                th.style.width = originalTh.offsetWidth + 'px';
                th.style.padding = originalThStyles.padding;
                th.style.fontSize = originalThStyles.fontSize;
                if (col.key === 'frameNumber1' || col.key === 'frameNumber2') {
                    th.style.backgroundColor = '#f0f0f0';
                } else if (col.key === 'audioWaveform') { 
                    th.style.backgroundColor = 'transparent'; 
                    th.style.padding = '0'; 
                } else if (col.type === 'custom') {
                    // NEW: Custom column styling in export
                    th.style.backgroundColor = '#fffaf0';
                }
            }
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const fps = this.projectData.metadata.fps || 24;
        for (let i = 0; i < this.projectData.frameCount; i++) {
            const tr = document.createElement('tr');
            Object.assign(tr.style, { height: originalRowHeight + 'px' });
            if (i % 2 === 0) tr.style.backgroundColor = '#f9f9f9';
            if ((i + 1) % fps === 0) tr.style.borderBottom = '2px solid #777';
            else if ((i + 1) % 8 === 0) tr.style.borderBottom = '1px dashed #bbb';
            
            EXPORT_COLUMNS.forEach((col, colIndex) => {
                const td = document.createElement('td');
                td.className = col.className || '';
                Object.assign(td.style, {
                    border: '1px solid #999', height: originalRowHeight + 'px',
                    verticalAlign: 'top',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                });
                if (originalHeaderCells[colIndex]) {
                    const oStyles = window.getComputedStyle(originalHeaderCells[colIndex]);
                    td.style.padding = oStyles.padding;
                    td.style.fontSize = oStyles.fontSize;
                    td.style.width = originalHeaderCells[colIndex].offsetWidth + 'px';
                }
                
                if (col.key === 'frameNumber1' || col.key === 'frameNumber2') {
                    td.textContent = i + 1; 
                    Object.assign(td.style, { textAlign: 'center', backgroundColor: '#f0f0f0', fontWeight: 'bold' });
                    if (i === 0) td.style.backgroundColor = '#c8e6c9';
                } else if (col.key === 'audioWaveform') { 
                    Object.assign(td.style, { padding: '0', backgroundColor: 'transparent' }); 
                } else if (col.type === 'custom') {
                    // NEW: Handle custom column data
                    td.textContent = this.projectData.getCellData(i, col.key);
                    td.style.backgroundColor = '#fffaf0';
                    if (i % 2 === 0) td.style.backgroundColor = '#fdf8f0';
                } else { 
                    td.textContent = this.projectData.getCellData(i, col.key); 
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        container.appendChild(table);
        
        console.log(`ExportHandler: Created export table with ${EXPORT_COLUMNS.length} columns (${customColumnCount} custom)`);
    },

    createExportWaveform: function (tableContainer, originalRowHeight, passedOriginalTheadHeight) {
        if (!this.projectData.audio.audioBuffer || !this.projectData.audio.waveformData.length) {
            // console.log("ExportHandler Waveform: No audio data."); 
            return;
        }
        if (!this.exportTable) { console.error("ExportHandler Waveform: exportTable is not defined."); return; }
        // console.log("ExportHandler: Creating waveform canvas...");

        const headerCells = this.exportTable.querySelectorAll('thead th');
        let waveformColumnIndex = -1, waveformColumnLeft = 0, waveformColumnWidth = 0;
        
        // NEW: Find waveform column dynamically (it may be in different position due to custom columns)
        headerCells.forEach((th, index) => {
            if (th.textContent.includes('Audio Waveform')) {
                waveformColumnIndex = index;
                waveformColumnLeft = th.offsetLeft;
                waveformColumnWidth = th.offsetWidth;
                // console.log(`Waveform Column Metrics: TH offsetLeft=${th.offsetLeft}, offsetWidth=${th.offsetWidth}`);
            }
        });

        if (waveformColumnIndex === -1) { /* console.log("ExportHandler Waveform: column not found.");*/ return; }
        if (waveformColumnWidth <= 0) {
            // console.warn(`ExportHandler Waveform: waveformColumnWidth is ${waveformColumnWidth}. Forcing to 50px for debug.`);
            waveformColumnWidth = 50;
        }

        const actualTheadHeight = passedOriginalTheadHeight || this.exportTable.querySelector('thead')?.offsetHeight || 50;
        const tableBodyHeight = this.projectData.frameCount * originalRowHeight;

        const waveformCanvas = document.createElement('canvas');
        waveformCanvas.id = "exportWaveformCanvas_debug";
        Object.assign(waveformCanvas.style, {
            position: 'absolute', left: waveformColumnLeft + 'px', top: actualTheadHeight + 'px',
            width: Math.max(1, waveformColumnWidth) + 'px',
            height: tableBodyHeight + 'px', zIndex: '10',
            pointerEvents: 'none',
            border: '0', // Production: No border
            // border: '2px dashed blue', // VISUAL DEBUG 
            // backgroundColor: 'rgba(0, 0, 255, 0.05)' // VISUAL DEBUG 
        });
        waveformCanvas.width = Math.max(1, waveformColumnWidth);
        waveformCanvas.height = tableBodyHeight;
        tableContainer.appendChild(waveformCanvas);
        const ctx = waveformCanvas.getContext('2d');
        if (waveformCanvas.width > 0 && this.projectData.audio.waveformData.length > 0) {
            this.drawWaveformOnCanvas(ctx, waveformCanvas.width, waveformCanvas.height);
            // console.log(`ExportHandler Waveform: drawn on canvas W=${waveformCanvas.width}, H=${waveformCanvas.height}`);
        } else {
            // console.log("ExportHandler Waveform: data empty or canvas width 0.");
            // ctx.fillStyle = "rgba(200, 200, 200, 0.5)"; 
            // ctx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
        }
        // console.log("ExportHandler: Waveform canvas appended.");
    },

    drawWaveformOnCanvas: function (ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        const audioDuration = this.projectData.audio.duration;
        if (!audioDuration || audioDuration <= 0) {
            return;
        }
        const centerX = width / 2;
        ctx.strokeStyle = '#AAAAAA'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height); ctx.stroke();
        const wData = this.projectData.audio.waveformData;
        const numPoints = wData.length;
        if (numPoints === 0) return;
        ctx.strokeStyle = '#333333'; ctx.lineWidth = 1;
        const maxAmpDeflection = (width / 2) * 0.9;
        ctx.beginPath(); let pathStarted = false;
        for (let i = 0; i < numPoints; i++) {
            const pointTime = (i / (numPoints - 1 || 1)) * audioDuration;
            const yPos = (pointTime / audioDuration) * height;
            const amplitude = wData[i]; const xPos = centerX + (amplitude * maxAmpDeflection);
            if (!pathStarted) { ctx.moveTo(xPos, yPos); pathStarted = true; } else { ctx.lineTo(xPos, yPos); }
        }
        for (let i = numPoints - 1; i >= 0; i--) {
            const pointTime = (i / (numPoints - 1 || 1)) * audioDuration;
            const yPos = (pointTime / audioDuration) * height;
            const amplitude = wData[i]; const xPos = centerX - (amplitude * maxAmpDeflection);
            ctx.lineTo(xPos, yPos);
        }
        ctx.closePath(); ctx.fillStyle = 'rgba(51, 51, 51, 0.3)'; ctx.fill(); ctx.stroke();
    },

    createExportDrawings: function (tableContainer, originalRowHeight, passedOriginalTheadHeight) {
        //––––– 0  Sanity checks ­–––––––––––––––––––––––––––––––––––––––––
        const hasDrawings = this.projectData.drawingLayers?.some(l => l.objects?.length);
        if (!hasDrawings) { /* console.log("ExportHandler Drawings: No drawing data."); */ return; }
        if (!this.exportTable) { console.error("ExportHandler Drawings: exportTable is not defined."); return; }

        //––––– 1  Measure **total** body height in both tables ––––––––––––––
        const exportBody = this.exportTable.querySelector('tbody');
        const exportBodyHeight = exportBody && exportBody.offsetHeight > 0
            ? exportBody.offsetHeight
            : this.projectData.frameCount * originalRowHeight;

        const originalBodyHeight = this.projectData.frameCount * originalRowHeight;

        const exportTableWidth = this.exportTable.offsetWidth
            || tableContainer.offsetWidth
            || document.getElementById('xsheet-container')?.scrollWidth || 1000;

        // FIXED: Get the CURRENT original table width (which includes custom columns in live DOM)
        // We need to differentiate between "current original" and "baseline original" for proper scaling
        const currentOriginalTable = document.getElementById('xsheetTable');
        const currentOriginalScrollWidth = currentOriginalTable ? currentOriginalTable.offsetWidth : exportTableWidth;

        //––––– 2  FIXED: Scale factors for dynamic column layouts –––––––––––––––––––––––––––––––––––
        // When custom columns are added, both original and export tables have the same column structure
        // but may have different total widths due to export container constraints
        const yScaleFactor = (originalBodyHeight > 0 && exportBodyHeight > 0) ? (exportBodyHeight / originalBodyHeight) : 1;
        
        // CRITICAL FIX: For drawing alignment, we need to account for the fact that drawings were created
        // on the current table layout, so if the export table has the same column structure, 
        // the scale factor should be minimal unless there's actual size difference
        let xScaleFactor = 1.0;
        if (currentOriginalScrollWidth > 0 && exportTableWidth > 0) {
            xScaleFactor = exportTableWidth / currentOriginalScrollWidth;
        }

        console.log(`Export Drawings: exportBodyH=${exportBodyHeight}px  origBodyH=${originalBodyHeight}px  ⇒ yScale=${yScaleFactor.toFixed(6)}`);
        console.log(`Export Drawings: exportW=${exportTableWidth}px    currentOrigW=${currentOriginalScrollWidth}px  ⇒ xScale=${xScaleFactor.toFixed(6)}`);

        //––––– 3  Build the overlay canvas sized for the export table –––––
        const actualTheadHeightForDrawingCanvasTop =
            passedOriginalTheadHeight || this.exportTable.querySelector('thead')?.offsetHeight || 50;
        const drawingCanvasBodyHeight = exportBodyHeight;

        const drawingCanvas = document.createElement('canvas');
        drawingCanvas.id = 'exportDrawingCanvas_debug';
        drawingCanvas.width = exportTableWidth;
        drawingCanvas.height = drawingCanvasBodyHeight;

        Object.assign(drawingCanvas.style, {
            position: 'absolute', left: '0px', top: actualTheadHeightForDrawingCanvasTop + 'px',
            width: exportTableWidth + 'px',
            height: drawingCanvasBodyHeight + 'px',
            zIndex: '20', pointerEvents: 'none', backgroundColor: 'transparent',
            border: '0'
            // border: '2px dashed lime' // DEBUG: Uncomment to see canvas bounds
        });
        tableContainer.appendChild(drawingCanvas);
        const ctx = drawingCanvas.getContext('2d');

        // FIXED: Get the CURRENT original table header height (matches the export table structure)
        const currentOriginalTableElement = document.getElementById('xsheetTable');
        const currentOriginalTableThead = currentOriginalTableElement?.querySelector('thead');
        if (!currentOriginalTableThead) { 
            console.error("ExportHandler Drawings: Current original table header not found for transform."); 
            return; 
        }
        const currentOriginalTheadHeightForCoordTransform = currentOriginalTableThead.offsetHeight;

        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        let drawingCount = 0;
        
        this.projectData.drawingLayers.forEach(layer => {
            if (!layer.visible || !layer.objects || layer.objects.length === 0) return;
            layer.objects.forEach(obj => {
                drawingCount++;
                const avgScale = Math.sqrt(Math.abs(xScaleFactor * yScaleFactor));
                ctx.lineWidth = (obj.style?.width || 2) * avgScale;
                ctx.lineWidth = Math.max(0.5, Math.min(ctx.lineWidth, (obj.style?.width || 2) * 2));
                ctx.strokeStyle = obj.style?.color || '#000000';
                if (!obj.points || obj.points.length === 0) return;
                
                ctx.beginPath();
                const firstPoint = obj.points[0];
                
                // FIXED: Use current original table header height for coordinate transformation
                let yInOriginalBody = firstPoint.y - currentOriginalTheadHeightForCoordTransform;
                let xInOriginalBody = firstPoint.x;
                let yOnExportCanvas = yInOriginalBody * yScaleFactor;
                let xOnExportCanvas = xInOriginalBody * xScaleFactor;
                
                if (obj.tool === "pen" || obj.tool === "line") {
                    ctx.moveTo(xOnExportCanvas, yOnExportCanvas);
                }
                
                if (obj.tool === 'pen') {
                    for (let i = 1; i < obj.points.length; i++) {
                        yInOriginalBody = obj.points[i].y - currentOriginalTheadHeightForCoordTransform;
                        xInOriginalBody = obj.points[i].x;
                        ctx.lineTo(xInOriginalBody * xScaleFactor, yInOriginalBody * yScaleFactor);
                    }
                } else if (obj.tool === 'line' && obj.points.length >= 2) {
                    const p1 = obj.points[1];
                    yInOriginalBody = p1.y - currentOriginalTheadHeightForCoordTransform;
                    xInOriginalBody = p1.x;
                    ctx.lineTo(xInOriginalBody * xScaleFactor, yInOriginalBody * yScaleFactor);
                } else if (obj.tool === 'rectangle' && obj.points.length >= 2) {
                    const p0_y = (obj.points[0].y - currentOriginalTheadHeightForCoordTransform) * yScaleFactor;
                    const p0_x = obj.points[0].x * xScaleFactor;
                    const p1_y = (obj.points[1].y - currentOriginalTheadHeightForCoordTransform) * yScaleFactor;
                    const p1_x = obj.points[1].x * xScaleFactor;
                    ctx.rect(p0_x, p0_y, p1_x - p0_x, p1_y - p0_y);
                } else if (obj.tool === 'ellipse' && obj.points.length >= 2) {
                    const p0_y = (obj.points[0].y - currentOriginalTheadHeightForCoordTransform) * yScaleFactor;
                    const p0_x = obj.points[0].x * xScaleFactor;
                    const p1_y = (obj.points[1].y - currentOriginalTheadHeightForCoordTransform) * yScaleFactor;
                    const p1_x = obj.points[1].x * xScaleFactor;
                    const centerX = (p0_x + p1_x) / 2;
                    const centerY = (p0_y + p1_y) / 2;
                    const radiusX = Math.abs(p1_x - p0_x) / 2;
                    const radiusY = Math.abs(p1_y - p0_y) / 2;
                    if (radiusX > 0 && radiusY > 0) {
                        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
                    }
                }
                ctx.stroke();
            });
        });
        
        const customColumnCount = this.projectData.customColumns?.length || 0;
        console.log(`ExportHandler Drawings: canvas created with ${drawingCount} objects, ${customColumnCount} custom columns, perfect alignment maintained`);
    },

    cleanupExportPage: function () {
        if (this.exportContainer) {
            this.exportContainer.remove();
            this.exportContainer = null;
            this.exportTable = null;
            this.exportTableContainer = null;
        }
    },

    // Helper method to generate versioned filename for exports to prevent overwriting
    async _getVersionedExportFileName(baseFileName) {
        if (!this.projectData.exportsFolderHandle) {
            return baseFileName;
        }

        let version = 1;
        let finalFileName = baseFileName;

        // Keep checking if file exists and increment version
        while (true) {
            try {
                await this.projectData.exportsFolderHandle.getFileHandle(finalFileName);
                // File exists, try next version
                version++;
                const nameWithoutExt = baseFileName.replace('.pdf', '');
                finalFileName = `${nameWithoutExt}_v${version}.pdf`;
            } catch (e) {
                // File doesn't exist, we can use this filename
                break;
            }
        }

        console.log(`ExportHandler: Auto-versioned export filename: ${finalFileName}`);
        return finalFileName;
    },

    // NEW: Add page numbers to multi-page PDFs
    _addPageNumber: function(pdf, currentPage, totalPages, marginPt, pageWidthPt, pageHeightPt) {
        // Only add page numbers if there are multiple pages
        if (totalPages <= 1) return;
        
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100); // Gray color
        
        const pageText = `Page ${currentPage} of ${totalPages}`;
        const textWidth = pdf.getTextWidth(pageText);
        
        // Position at bottom center of page
        const xPos = (pageWidthPt - textWidth) / 2;
        const yPos = pageHeightPt - (marginPt / 2); // Half margin from bottom
        
        pdf.text(pageText, xPos, yPos);
        
        // Reset text color to black for any subsequent text
        pdf.setTextColor(0, 0, 0);
    },

    async exportToPDF() {
        const statusBar = document.getElementById('statusBar');
        if (this.isExporting) { statusBar.textContent = "Status: Export already in progress."; return; }
        
        // NEW: Include custom column info in status
        const customColumnCount = this.projectData.customColumns?.length || 0;
        const columnInfo = customColumnCount > 0 ? ` (${customColumnCount} custom columns)` : '';
        statusBar.textContent = `Status: Preparing PDF export${columnInfo}...`;
        
        this.isExporting = true;

        let exportPageElement;
        try {
            exportPageElement = await this.createExportPage();
            if (!exportPageElement) {
                throw new Error("Failed to create export page element.");
            }

            exportPageElement.style.visibility = 'visible';
            // eslint-disable-next-line no-unused-expressions
            exportPageElement.offsetHeight;

            await new Promise(resolve => setTimeout(resolve, 1000));

            const captureWidth = exportPageElement.scrollWidth;
            const captureHeight = exportPageElement.scrollHeight;
            // console.log(`ExportHandler: Final dimensions for html2canvas: W=${captureWidth}, H=${captureHeight}`);

            if (captureWidth <= 0 || captureHeight <= 0 || (captureHeight < 100 && this.projectData.frameCount > 1)) {
                throw new Error(`Invalid final layout dimensions (W:${captureWidth}, H:${captureHeight}) for html2canvas.`);
            }
            if (!exportPageElement.querySelector('table tbody') || exportPageElement.querySelector('table tbody').children.length === 0) {
                throw new Error("Export page content check failed: table is missing or empty before capture.");
            }

            exportPageElement.style.top = '-10000px';
            exportPageElement.style.visibility = 'hidden';
            await new Promise(resolve => setTimeout(resolve, 50));

            statusBar.textContent = `Status: Capturing content${columnInfo} (this may take a moment)...`;

            const MAX_CANVAS_DIM_INTERNAL = 32000;
            let scaleForHtml2CanvasInternal = 1.0;
            if (captureHeight > MAX_CANVAS_DIM_INTERNAL || captureWidth > MAX_CANVAS_DIM_INTERNAL) {
                scaleForHtml2CanvasInternal = Math.min(
                    MAX_CANVAS_DIM_INTERNAL / captureHeight,
                    MAX_CANVAS_DIM_INTERNAL / captureWidth,
                    1.0
                );
            }

            const html2canvasOptions = {
                backgroundColor: '#ffffff',
                scale: scaleForHtml2CanvasInternal,
                logging: true,
                useCORS: true,
                allowTaint: false,
                scrollX: 0,
                scrollY: 0,
                windowWidth: captureWidth,
                windowHeight: captureHeight,
                imageTimeout: 0,
                onclone: (clonedDoc) => {
                    const container = clonedDoc.getElementById('export-container');
                    if (container) {
                        container.style.position = 'absolute';
                        container.style.top = '0px'; container.style.left = '0px';
                        container.style.width = captureWidth + 'px';
                        container.style.height = captureHeight + 'px';
                        container.style.overflow = 'visible';
                        container.style.visibility = 'visible';
                    }
                    clonedDoc.querySelectorAll('canvas').forEach(c => {
                        c.style.display = 'block';
                        c.style.opacity = '1';
                        c.style.border = '0'; // Hide debug borders for final capture
                    });
                }
            };

            const pageCanvas = await html2canvas(exportPageElement, html2canvasOptions);

            if (pageCanvas.width === 0 || pageCanvas.height === 0) {
                throw new Error("html2canvas returned a zero-dimension canvas.");
            }

            statusBar.textContent = `Status: Generating PDF${columnInfo}...`;
            const imgData = pageCanvas.toDataURL('image/png');
            const pageCanvasRenderedWidthPt = pageCanvas.width * 72 / 96;
            const pageCanvasRenderedHeightPt = pageCanvas.height * 72 / 96;

            const letterWidthPt = 8.5 * 72; const letterHeightPt = 11 * 72;
            const marginPt = 0.4 * 72;

            let pdfOrientation = 'landscape';
            let pdfPrintableWidthPt = letterHeightPt - (2 * marginPt);
            let pdfPrintableHeightPt = letterWidthPt - (2 * marginPt);
            // console.log(`PDF Setup: Orientation=${pdfOrientation}, Printable W=${pdfPrintableWidthPt.toFixed(0)}pt, H=${pdfPrintableHeightPt.toFixed(0)}pt`);

            const pdf = new jspdf.jsPDF({ orientation: pdfOrientation, unit: 'pt', format: 'letter' });

            const scaleToFitPdfPageWidth = pdfPrintableWidthPt / pageCanvasRenderedWidthPt;
            const finalPdfImageWidthPt = pageCanvasRenderedWidthPt * scaleToFitPdfPageWidth;
            const finalPdfImageTotalHeightPt = pageCanvasRenderedHeightPt * scaleToFitPdfPageWidth;

            // Calculate total pages and page dimensions for numbering
            const totalPages = Math.ceil(finalPdfImageTotalHeightPt / pdfPrintableHeightPt);
            const pageWidthPt = pdfOrientation === 'landscape' ? letterHeightPt : letterWidthPt;
            const pageHeightPt = pdfOrientation === 'landscape' ? letterWidthPt : letterHeightPt;

            // console.log(`PDF Image: Final W=${finalPdfImageWidthPt.toFixed(0)}pt, Total H=${finalPdfImageTotalHeightPt.toFixed(0)}pt (Scale for PDF: ${scaleToFitPdfPageWidth.toFixed(3)})`);

            if (finalPdfImageTotalHeightPt <= pdfPrintableHeightPt) {
                // Single page
                const xOffset = marginPt;
                const yOffset = marginPt + (pdfPrintableHeightPt - finalPdfImageTotalHeightPt) / 2;
                pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalPdfImageWidthPt, finalPdfImageTotalHeightPt);
                
                // Add page number (will only show if totalPages > 1, which won't happen here, but keeping consistent)
                this._addPageNumber(pdf, 1, totalPages, marginPt, pageWidthPt, pageHeightPt);
            } else {
                // Multi-page PDF with page numbers
                // console.log(`PDF: Multi-page PDF needed: ${totalPages} pages.`);
                let sourceY_on_pageCanvas_px = 0;
                const onePdfPageHeight_on_pageCanvas_px = (pdfPrintableHeightPt / finalPdfImageTotalHeightPt) * pageCanvas.height;

                for (let i = 0; i < totalPages; i++) {
                    if (i > 0) { pdf.addPage(); }

                    const segmentSourceHeightPx = Math.min(onePdfPageHeight_on_pageCanvas_px, pageCanvas.height - sourceY_on_pageCanvas_px);
                    if (segmentSourceHeightPx <= 0) continue;

                    const segmentCanvas = document.createElement('canvas');
                    segmentCanvas.width = pageCanvas.width;
                    segmentCanvas.height = segmentSourceHeightPx;
                    const segmentCtx = segmentCanvas.getContext('2d');
                    segmentCtx.drawImage(pageCanvas, 0, sourceY_on_pageCanvas_px, pageCanvas.width, segmentSourceHeightPx, 0, 0, pageCanvas.width, segmentSourceHeightPx);

                    const segmentImgData = segmentCanvas.toDataURL('image/png');
                    const segmentDisplayHeightPt = segmentSourceHeightPx * (finalPdfImageWidthPt / pageCanvas.width);

                    pdf.addImage(segmentImgData, 'PNG', marginPt, marginPt, finalPdfImageWidthPt, segmentDisplayHeightPt);
                    
                    // NEW: Add page number to this page
                    this._addPageNumber(pdf, i + 1, totalPages, marginPt, pageWidthPt, pageHeightPt);
                    
                    sourceY_on_pageCanvas_px += segmentSourceHeightPx;
                }
            }

            // Save to project exports folder with versioning or fall back to download
            const date = new Date().toISOString().slice(0, 10);
            const projectName = this.projectData.projectName || 'AnimationXSheet';
            const customSuffix = customColumnCount > 0 ? `_custom${customColumnCount}` : '';
            const baseFilename = `${projectName}_${date}${customSuffix}_${pdfOrientation}.pdf`;

            // Try to save to project exports folder if available
            if (this.projectData.exportsFolderHandle) {
                try {
                    console.log("ExportHandler: Saving PDF to project exports folder with versioning");
                    statusBar.textContent = `Status: Saving PDF to project exports folder${columnInfo}...`;

                    // Get versioned filename to prevent overwriting
                    const versionedFilename = await this._getVersionedExportFileName(baseFilename);

                    const fileHandle = await this.projectData.exportsFolderHandle.getFileHandle(versionedFilename, { create: true });
                    const writable = await fileHandle.createWritable();

                    // Convert PDF to blob and write to project folder
                    const pdfBlob = pdf.output('blob');
                    await writable.write(pdfBlob);
                    await writable.close();

                    const pageInfo = totalPages > 1 ? `, ${totalPages} pages` : ', single page';
                    statusBar.textContent = `Status: PDF saved to project exports folder - ${versionedFilename}${pageInfo}`;

                    console.log(`ExportHandler: PDF saved to project exports folder as ${versionedFilename}`);
                } catch (projectSaveError) {
                    console.warn("ExportHandler: Failed to save to project folder, falling back to download:", projectSaveError);
                    // Fallback to regular download
                    pdf.save(baseFilename);
                    const pageInfo = totalPages > 1 ? `, ${totalPages} pages` : ', single page';
                    statusBar.textContent = `Status: PDF exported (downloaded) - ${pdfOrientation}${pageInfo}${columnInfo}`;
                }
            } else {
                // No project folder or API not supported - use regular download
                console.log("ExportHandler: No project exports folder, using regular download");
                pdf.save(baseFilename);
                const pageInfo = totalPages > 1 ? `, ${totalPages} pages` : ', single page';
                statusBar.textContent = `Status: PDF exported (downloaded) - ${pdfOrientation}${pageInfo}${columnInfo}`;
            }

        } catch (error) {
            console.error("Error exporting to PDF:", error);
            statusBar.textContent = "Status: Error exporting PDF: " + error.message;
        } finally {
            const tempImgElement = document.body.querySelector('img[style*="zIndex: 30000"]');
            if (!tempImgElement) {
                this.cleanupExportPage();
            }
            this.isExporting = false;
        }
    },

    print() {
        const useExport = confirm(
            "For best print quality, we recommend using 'Export PDF'. This ensures all content is captured accurately.\n\n" +
            "Would you like to export to PDF instead?"
        );
        if (useExport) { this.exportToPDF(); }
    }
};