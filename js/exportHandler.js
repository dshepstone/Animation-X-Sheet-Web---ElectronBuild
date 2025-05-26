// js/exportHandler.js
console.log("exportHandler.js loaded.");
window.XSheetApp = window.XSheetApp || {};
window.XSheetApp.ExportHandler = {
    isExporting: false,
    exportContainer: null,
    exportTable: null,
    exportTableContainer: null,

    init: function (projectData, xsheetRef, drawingCanvasRef) {
        console.log("ExportHandler init.");
        this.projectData = projectData;
        this.xsheet = xsheetRef;
        this.drawingCanvas = drawingCanvasRef;

        this.btnExportPDF = document.getElementById('btnExportPDF');
        this.btnPrint = document.getElementById('btnPrint');

        if (this.btnExportPDF) {
            this.btnExportPDF.addEventListener('click', () => this.exportToPDF());
        }
        if (this.btnPrint) {
            this.btnPrint.addEventListener('click', () => this.print());
        }
    },

    createExportPage: function () {
        console.log("Creating export page with original dimensions...");
        this.cleanupExportPage();

        const originalTable = document.getElementById('xsheetTable');
        const originalContainer = document.getElementById('xsheet-container');
        if (!originalTable || !originalContainer) {
            console.error("Cannot find original table/container for dimension reference");
            return null;
        }

        this.exportContainer = document.createElement('div');
        this.exportContainer.id = 'export-container';
        Object.assign(this.exportContainer.style, {
            position: 'fixed', top: '-10000px', left: '0px', zIndex: '-1000',
            backgroundColor: '#ffffff', padding: '20px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            width: 'auto', height: 'auto', minWidth: originalTable.offsetWidth + 'px'
        });
        const originalStyles = window.getComputedStyle(originalTable);
        this.exportContainer.style.fontSize = originalStyles.fontSize;
        this.exportContainer.style.lineHeight = originalStyles.lineHeight;

        console.log("Original table for export page metrics:", {
            width: originalTable.offsetWidth, height: originalTable.offsetHeight, fontSize: originalStyles.fontSize
        });

        this.createExportMetadata();
        this.createExportTableWithOverlays();

        document.body.appendChild(this.exportContainer);
        console.log("Export page created with original dimensions");
        return this.exportContainer;
    },

    createExportMetadata: function () {
        const originalMetadata = document.getElementById('metadata-grid');
        const originalStyles = window.getComputedStyle(originalMetadata);
        const metadataDiv = document.createElement('div');
        Object.assign(metadataDiv.style, {
            display: 'grid', gridTemplateColumns: originalStyles.gridTemplateColumns,
            gap: originalStyles.gap, marginBottom: '15px', fontSize: originalStyles.fontSize
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
                border: '1px solid #999', padding: '3px 5px', backgroundColor: '#fff',
                display: 'flex', alignItems: 'center'
            });
            const label = document.createElement('span');
            label.textContent = field.label + ':';
            Object.assign(label.style, { fontWeight: 'bold', marginRight: '5px', whiteSpace: 'nowrap' });
            const value = document.createElement('span');
            value.textContent = field.value;
            fieldDiv.append(label, value);
            metadataDiv.appendChild(fieldDiv);
        });
        this.exportContainer.appendChild(metadataDiv);
    },

    createExportTableWithOverlays: function () {
        const tableContainer = document.createElement('div');
        this.exportTableContainer = tableContainer;
        Object.assign(tableContainer.style, {
            position: 'relative', border: '1px solid #999',
            backgroundColor: '#fff', overflow: 'visible'
        });

        this.createExportTable(tableContainer);

        setTimeout(() => {
            if (this.exportTable && this.exportTableContainer) {
                this.createExportWaveform(this.exportTableContainer);
                this.createExportDrawings(this.exportTableContainer);
            }
        }, 150); // Increased from 100 for safety

        this.exportContainer.appendChild(tableContainer);
    },

    createExportTable: function (container) {
        const originalTable = document.getElementById('xsheetTable');
        const originalXSheetContainer = document.getElementById('xsheet-container');
        const exportTableWidth = Math.max(originalTable.offsetWidth, originalXSheetContainer.scrollWidth);

        const originalStyles = window.getComputedStyle(originalTable);
        const table = document.createElement('table');
        this.exportTable = table;
        Object.assign(table.style, {
            width: exportTableWidth + 'px',
            borderCollapse: originalStyles.borderCollapse,
            tableLayout: originalStyles.tableLayout, fontSize: originalStyles.fontSize,
            position: 'relative', zIndex: '1'
        });

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.style.backgroundColor = '#e9e9e9';
        const LOGICAL_COLUMNS = [
            { key: "action", displayName: "Action/Description" }, { key: "frameNumber1", displayName: "Fr" },
            { key: "audioWaveform", displayName: "Audio Waveform" }, { key: "dialogue", displayName: "Dialogue" },
            { key: "soundFx", displayName: "Sound FX" }, { key: "techNotes", displayName: "Tech. Notes" },
            { key: "frameNumber2", displayName: "Fr" }, { key: "camera", displayName: "Camera Moves" }
        ];
        const originalHeaderCells = originalTable.querySelectorAll('thead th');
        LOGICAL_COLUMNS.forEach((col, index) => {
            const th = document.createElement('th');
            th.textContent = col.displayName;
            Object.assign(th.style, { border: '1px solid #999', fontWeight: 'bold', textAlign: 'center' });
            if (originalHeaderCells[index]) {
                const originalTh = originalHeaderCells[index];
                const originalThStyles = window.getComputedStyle(originalTh);
                th.style.width = originalTh.offsetWidth + 'px';
                th.style.height = originalTh.offsetHeight + 'px';
                th.style.padding = originalThStyles.padding;
                th.style.fontSize = originalThStyles.fontSize;
                if (col.key === 'frameNumber1' || col.key === 'frameNumber2') th.style.backgroundColor = '#f0f0f0';
                else if (col.key === 'audioWaveform') { th.style.backgroundColor = 'transparent'; th.style.padding = '0'; }
            }
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const fps = this.projectData.metadata.fps || 24;
        const originalBodyCells = originalTable.querySelectorAll('tbody td'); // For row height reference
        let originalRowHeight = 22;
        if (originalBodyCells.length > 0) { // Get first actual TD for height
            const firstActualTd = Array.from(originalBodyCells).find(td => !td.classList.contains('waveform-col')); // Avoid waveform col with 0 padding
            if (firstActualTd) originalRowHeight = firstActualTd.offsetHeight;
            else if (originalBodyCells[0]) originalRowHeight = originalBodyCells[0].offsetHeight; // Fallback
        }


        for (let i = 0; i < this.projectData.frameCount; i++) {
            const tr = document.createElement('tr');
            if (i % 2 === 0) tr.style.backgroundColor = '#f9f9f9';
            if ((i + 1) % fps === 0) tr.style.borderBottom = '2px solid #777';
            else if ((i + 1) % 8 === 0) tr.style.borderBottom = '1px dashed #bbb';

            LOGICAL_COLUMNS.forEach((col, colIndex) => {
                const td = document.createElement('td');
                Object.assign(td.style, {
                    border: '1px solid #999', height: originalRowHeight + 'px', verticalAlign: 'top',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                });
                if (originalHeaderCells[colIndex]) {
                    const oStyles = window.getComputedStyle(originalHeaderCells[colIndex]);
                    td.style.padding = oStyles.padding; td.style.fontSize = oStyles.fontSize;
                    td.style.width = originalHeaderCells[colIndex].offsetWidth + 'px';
                }
                if (col.key === 'frameNumber1' || col.key === 'frameNumber2') {
                    td.textContent = i + 1; Object.assign(td.style, { textAlign: 'center', backgroundColor: '#f0f0f0', fontWeight: 'bold' });
                    if (i === 0) td.style.backgroundColor = '#c8e6c9';
                } else if (col.key === 'audioWaveform') { Object.assign(td.style, { padding: '0', backgroundColor: 'transparent' }); }
                else { td.textContent = this.projectData.getCellData(i, col.key); }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        container.appendChild(table);
        console.log("Export table created with dimensions:", { width: table.offsetWidth, height: table.offsetHeight });
    },

    createExportWaveform: function (tableContainer) {
        if (!this.projectData.audio.audioBuffer || !this.projectData.audio.waveformData.length) return;
        console.log("Creating export waveform relative to export table...");
        const headerCells = this.exportTable.querySelectorAll('thead th');
        let waveformColumnIndex = -1, waveformColumnLeft = 0, waveformColumnWidth = 0;
        headerCells.forEach((th, index) => {
            if (th.textContent.includes('Audio Waveform')) {
                waveformColumnIndex = index; waveformColumnLeft = th.offsetLeft; waveformColumnWidth = th.offsetWidth;
            }
        });
        if (waveformColumnIndex === -1) { console.log("Waveform column not found in export table"); return; }

        const exportThead = this.exportTable.querySelector('thead');
        if (!exportThead) { console.error("Export table thead not found for waveform positioning."); return; }
        const exportTheadHeight = exportThead.offsetHeight;
        const tableBodyHeight = this.exportTable.offsetHeight - exportTheadHeight;

        const waveformCanvas = document.createElement('canvas');
        Object.assign(waveformCanvas.style, {
            position: 'absolute', left: waveformColumnLeft + 'px', top: exportTheadHeight + 'px',
            width: waveformColumnWidth + 'px', height: tableBodyHeight + 'px', zIndex: '10',
            pointerEvents: 'none', backgroundColor: 'rgba(255,255,255,0.9)'
        });
        waveformCanvas.width = waveformColumnWidth; waveformCanvas.height = tableBodyHeight;
        const ctx = waveformCanvas.getContext('2d');
        this.drawWaveformOnCanvas(ctx, waveformCanvas.width, waveformCanvas.height);
        tableContainer.appendChild(waveformCanvas);
        console.log("Waveform canvas for export created.");
    },

    drawWaveformOnCanvas: function (ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        const audioDuration = this.projectData.audio.duration;
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
        const currentTime = this.projectData.audio.currentTime || 0;
        if (audioDuration > 0) {
            const playheadY = (currentTime / audioDuration) * height;
            ctx.strokeStyle = 'red'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(0, playheadY); ctx.lineTo(width, playheadY); ctx.stroke();
        }
    },

    createExportDrawings: function (tableContainer) {
        let hasAnyDrawings = this.projectData.drawingLayers?.some(layer => layer.objects?.length > 0);
        if (!hasAnyDrawings) { console.log("No drawing data for export."); return; }

        console.log("Creating export drawings relative to export table...");

        // --- Heights from EXPORT table ---
        const exportThead = this.exportTable.querySelector('thead');
        if (!exportThead) { console.error("Export table thead not found for drawing positioning."); return; }
        const exportTheadHeight = exportThead.offsetHeight;
        const exportTableBodyHeight = this.exportTable.offsetHeight - exportTheadHeight;

        // --- Heights and Widths from ORIGINAL interactive table for scaling ---
        const originalTableElement = document.getElementById('xsheetTable');
        if (!originalTableElement) { console.error("Original table element not found."); return; }
        const originalTableThead = originalTableElement.querySelector('thead');
        if (!originalTableThead) { console.error("Could not find original table header for Y-offset calculation."); return; }
        const originalTheadHeight = originalTableThead.offsetHeight;

        const originalTableBodyCells = originalTableElement.querySelectorAll('tbody tr:first-child td');
        let measuredOriginalRowHeight = 22;
        if (originalTableBodyCells.length > 0) {
            const firstActualTd = Array.from(originalTableBodyCells).find(td => !td.classList.contains('waveform-col'));
            if (firstActualTd) measuredOriginalRowHeight = firstActualTd.offsetHeight;
            else if (originalTableBodyCells[0]) measuredOriginalRowHeight = originalTableBodyCells[0].offsetHeight;
        }
        const originalTableCalculatedBodyHeight = this.projectData.frameCount * measuredOriginalRowHeight;

        // Use scrollWidth of the original container for original content width, as drawings can span this.
        const originalXSheetContainer = document.getElementById('xsheet-container');
        const originalContentWidth = originalXSheetContainer.scrollWidth;


        // --- Create Canvas ---
        const drawingCanvas = document.createElement('canvas');
        Object.assign(drawingCanvas.style, {
            position: 'absolute', left: '0px', top: exportTheadHeight + 'px',
            width: this.exportTable.offsetWidth + 'px', height: exportTableBodyHeight + 'px',
            zIndex: '20', pointerEvents: 'none', backgroundColor: 'transparent',
        });
        drawingCanvas.width = this.exportTable.offsetWidth;
        drawingCanvas.height = exportTableBodyHeight;

        const ctx = drawingCanvas.getContext('2d');
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';

        // --- Calculate Scale Factors ---
        let yScaleFactor = 1.0;
        if (originalTableCalculatedBodyHeight > 0 && exportTableBodyHeight > 0) {
            yScaleFactor = exportTableBodyHeight / originalTableCalculatedBodyHeight;
        }
        console.log(`Drawing yScaleFactor: ${yScaleFactor} (exportBodyH: ${exportTableBodyHeight}, originalCalcBodyH: ${originalTableCalculatedBodyHeight})`);

        let xScaleFactor = 1.0;
        if (originalContentWidth > 0 && this.exportTable.offsetWidth > 0) {
            xScaleFactor = this.exportTable.offsetWidth / originalContentWidth;
        }
        console.log(`Drawing xScaleFactor: ${xScaleFactor} (exportTableW: ${this.exportTable.offsetWidth}, originalContentW: ${originalContentWidth})`);

        let drawingCount = 0;
        this.projectData.drawingLayers.forEach(layer => {
            if (!layer.visible || !layer.objects || layer.objects.length === 0) return;
            layer.objects.forEach(obj => {
                drawingCount++;
                // Scale line width slightly, but prevent it from becoming too thin/thick
                const baseLineWidth = obj.style?.width || 2;
                const scaledLineWidth = baseLineWidth * Math.sqrt(xScaleFactor * yScaleFactor); // Geometric mean for less extreme scaling
                ctx.lineWidth = Math.max(0.5, Math.min(baseLineWidth * 2, scaledLineWidth)); // Clamp line width
                ctx.strokeStyle = obj.style?.color || '#000000';

                if (!obj.points || obj.points.length === 0) return;

                ctx.beginPath();

                const firstPoint = obj.points[0];
                let yInOriginalBody = firstPoint.y - originalTheadHeight;
                let xInOriginalBody = firstPoint.x;

                let yOnExportCanvas = yInOriginalBody * yScaleFactor;
                let xOnExportCanvas = xInOriginalBody * xScaleFactor;

                ctx.moveTo(xOnExportCanvas, yOnExportCanvas);

                if (obj.tool === 'pen') {
                    for (let i = 1; i < obj.points.length; i++) {
                        yInOriginalBody = obj.points[i].y - originalTheadHeight;
                        xInOriginalBody = obj.points[i].x;
                        yOnExportCanvas = yInOriginalBody * yScaleFactor;
                        xOnExportCanvas = xInOriginalBody * xScaleFactor;
                        ctx.lineTo(xOnExportCanvas, yOnExportCanvas);
                    }
                } else if (obj.tool === 'line' && obj.points.length >= 2) {
                    const p1 = obj.points[1];
                    yInOriginalBody = p1.y - originalTheadHeight;
                    xInOriginalBody = p1.x;
                    yOnExportCanvas = yInOriginalBody * yScaleFactor;
                    xOnExportCanvas = xInOriginalBody * xScaleFactor;
                    ctx.lineTo(xOnExportCanvas, yOnExportCanvas);
                } else if (obj.tool === 'rectangle' && obj.points.length >= 2) {
                    const p0_orig_y_body = obj.points[0].y - originalTheadHeight;
                    const p0_orig_x_body = obj.points[0].x;
                    const p1_orig_y_body = obj.points[1].y - originalTheadHeight;
                    const p1_orig_x_body = obj.points[1].x;

                    const x0_export = p0_orig_x_body * xScaleFactor;
                    const y0_export = p0_orig_y_body * yScaleFactor;
                    const x1_export = p1_orig_x_body * xScaleFactor;
                    const y1_export = p1_orig_y_body * yScaleFactor;

                    ctx.rect(x0_export, y0_export, x1_export - x0_export, y1_export - y0_export);

                } else if (obj.tool === 'ellipse' && obj.points.length >= 2) {
                    const p0_orig_y_body = obj.points[0].y - originalTheadHeight;
                    const p0_orig_x_body = obj.points[0].x;
                    const p1_orig_y_body = obj.points[1].y - originalTheadHeight;
                    const p1_orig_x_body = obj.points[1].x;

                    const x0_export = p0_orig_x_body * xScaleFactor;
                    const y0_export = p0_orig_y_body * yScaleFactor;
                    const x1_export = p1_orig_x_body * xScaleFactor;
                    const y1_export = p1_orig_y_body * yScaleFactor;

                    const centerX_export = (x0_export + x1_export) / 2;
                    const centerY_export = (y0_export + y1_export) / 2;
                    const radiusX_export = Math.abs(x1_export - x0_export) / 2;
                    const radiusY_export = Math.abs(y1_export - y0_export) / 2;
                    if (radiusX_export > 0 && radiusY_export > 0) ctx.ellipse(centerX_export, centerY_export, radiusX_export, radiusY_export, 0, 0, 2 * Math.PI);
                }
                ctx.stroke();
            });
        });
        tableContainer.appendChild(drawingCanvas);
        console.log("Drawing canvas for export created with", drawingCount, "objects.");
    },

    cleanupExportPage: function () {
        if (this.exportContainer) {
            this.exportContainer.remove();
            this.exportContainer = null;
            this.exportTable = null;
            this.exportTableContainer = null;
        }
    },

    async exportToPDF() {
        const statusBar = document.getElementById('statusBar');
        if (this.isExporting) { if (statusBar) statusBar.textContent = "Status: Export already in progress."; return; }
        if (statusBar) statusBar.textContent = "Status: Preparing PDF export...";
        try {
            this.isExporting = true;
            const exportPageElement = this.createExportPage();
            if (!exportPageElement) throw new Error("Failed to create export page element");

            await new Promise(resolve => setTimeout(resolve, 350));

            if (statusBar) statusBar.textContent = "Status: Capturing content...";
            const captureWidth = exportPageElement.scrollWidth;
            const captureHeight = exportPageElement.scrollHeight;

            const pageCanvas = await html2canvas(exportPageElement, {
                backgroundColor: '#ffffff', scale: 1, logging: false, useCORS: true, allowTaint: true,
                scrollX: 0, scrollY: 0,
                width: captureWidth,
                height: captureHeight,
                onclone: (clonedDoc) => {
                    clonedDoc.querySelectorAll('canvas').forEach(c => { c.style.display = 'block'; c.style.opacity = '1'; });
                    const exportContainerClone = clonedDoc.getElementById('export-container');
                    if (exportContainerClone) {
                        exportContainerClone.style.top = '0px';
                        exportContainerClone.style.left = '0px';
                        exportContainerClone.style.width = captureWidth + 'px';
                        exportContainerClone.style.height = captureHeight + 'px';
                    }
                }
            });

            if (statusBar) statusBar.textContent = "Status: Generating PDF...";
            const imgData = pageCanvas.toDataURL('image/png');
            const pageCanvasWidthPt = pageCanvas.width * 72 / 96;
            const pageCanvasHeightPt = pageCanvas.height * 72 / 96;

            const letterWidthPt = 8.5 * 72; const letterHeightPt = 11 * 72;
            const marginPt = 0.5 * 72;

            let pdfOrientation = 'portrait';
            let pdfPrintableWidthPt = letterWidthPt - (2 * marginPt);
            let pdfPrintableHeightPt = letterHeightPt - (2 * marginPt);

            if (pageCanvasWidthPt > pdfPrintableWidthPt && pageCanvasWidthPt > pageCanvasHeightPt) {
                pdfOrientation = 'landscape';
                pdfPrintableWidthPt = letterHeightPt - (2 * marginPt);
                pdfPrintableHeightPt = letterWidthPt - (2 * marginPt);
            }
            console.log(`PDF setup: Orientation: ${pdfOrientation}, Printable W: ${pdfPrintableWidthPt.toFixed(0)}pt, H: ${pdfPrintableHeightPt.toFixed(0)}pt`);
            console.log(`Canvas content: W: ${pageCanvasWidthPt.toFixed(0)}pt, H: ${pageCanvasHeightPt.toFixed(0)}pt`);

            const pdf = new jspdf.jsPDF({ orientation: pdfOrientation, unit: 'pt', format: 'letter' });

            const scaleToFitPdfWidth = pdfPrintableWidthPt / pageCanvasWidthPt;
            const scaledContentWidthPt = pageCanvasWidthPt * scaleToFitPdfWidth;
            const scaledContentHeightPt = pageCanvasHeightPt * scaleToFitPdfWidth;

            if (scaledContentHeightPt <= pdfPrintableHeightPt) {
                const xOffset = marginPt;
                const yOffset = marginPt + (pdfPrintableHeightPt - scaledContentHeightPt) / 2;
                pdf.addImage(imgData, 'PNG', xOffset, yOffset, scaledContentWidthPt, scaledContentHeightPt);
                console.log("PDF: Single page content.");
            } else {
                console.log("PDF: Multi-page content needed.");
                const numPages = Math.ceil(scaledContentHeightPt / pdfPrintableHeightPt);
                let sourceYpx = 0;

                for (let i = 0; i < numPages; i++) {
                    if (i > 0) pdf.addPage();

                    const pdfPageHeightInCanvasPx = (pdfPrintableHeightPt / scaledContentHeightPt) * pageCanvas.height;
                    const sourceHeightPx = Math.min(pdfPageHeightInCanvasPx, pageCanvas.height - sourceYpx);

                    if (sourceHeightPx <= 0) continue;

                    const segmentCanvas = document.createElement('canvas');
                    segmentCanvas.width = pageCanvas.width;
                    segmentCanvas.height = sourceHeightPx;
                    const segmentCtx = segmentCanvas.getContext('2d');
                    segmentCtx.drawImage(pageCanvas, 0, sourceYpx, pageCanvas.width, sourceHeightPx, 0, 0, pageCanvas.width, sourceHeightPx);

                    const segmentImgData = segmentCanvas.toDataURL('image/png');
                    const segmentDisplayHeightPt = sourceHeightPx * scaleToFitPdfWidth;

                    pdf.addImage(segmentImgData, 'PNG', marginPt, marginPt, scaledContentWidthPt, segmentDisplayHeightPt);
                    sourceYpx += sourceHeightPx;
                    console.log(`PDF: Page ${i + 1}, segment height on PDF: ${segmentDisplayHeightPt.toFixed(0)}pt`);
                }
            }

            const date = new Date().toISOString().slice(0, 10);
            const projectName = this.projectData.projectName || 'AnimationXSheet';
            const filename = `${projectName}_${date}_${pdfOrientation}.pdf`;
            pdf.save(filename);
            const pageInfo = scaledContentHeightPt > pdfPrintableHeightPt ? ', multiple pages' : ', single page';
            if (statusBar) statusBar.textContent = `Status: PDF exported - ${pdfOrientation}${pageInfo}`;

        } catch (error) {
            console.error("Error exporting to PDF:", error);
            if (statusBar) statusBar.textContent = "Status: Error exporting PDF: " + error.message;
        } finally {
            this.cleanupExportPage();
            this.isExporting = false;
        }
    },

    print() {
        const useExport = confirm(
            "For best print quality with original dimensions, we recommend using 'Export PDF'.\n\n" +
            "Would you like to export to PDF instead?"
        );
        if (useExport) { this.exportToPDF(); }
    }
};