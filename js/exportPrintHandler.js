// js/exportPrintHandler.js
console.log("exportPrintHandler.js loaded");

(function (app) { // app is window.XSheetApp
    "use strict";

    let jsPDFCtor; /* ... jsPDF detection ... */
    if (window.jspdf?.jsPDF) { jsPDFCtor = window.jspdf.jsPDF; }
    else if (window.jsPDF) { jsPDFCtor = window.jsPDF; }
    else { console.error("ExportHandler: jsPDF library not found!"); }
    if (typeof window.html2canvas !== 'function') { console.error("ExportHandler: html2canvas library not found!"); }

    let projectDataRef, xsheetInstanceRef;
    const PRINT_OVERRIDE_STYLE_ID = "xsheet-print-drawing-override-style";

    function addPrintOverrideCss() { /* ... same as before ... */
        if (document.getElementById(PRINT_OVERRIDE_STYLE_ID)) return;
        const style = document.createElement("style"); style.id = PRINT_OVERRIDE_STYLE_ID;
        style.textContent = `@media print { #drawingCanvasOverlay { display:block!important; z-index: 999 !important; } #verticalWaveformCanvas { display: none !important; } }`;
        document.head.appendChild(style);
    }
    function removePrintOverrideCss() { /* ... same as before ... */
        const s = document.getElementById(PRINT_OVERRIDE_STYLE_ID); if (s) s.remove();
    }

    function pushDomStateAndPrepareDrawing(context) {
        const xsheetContainer = document.getElementById("xsheet-container");
        const drawingCanvasEl = document.getElementById("drawingCanvasOverlay");

        const prevState = {
            containerScrollLeft: xsheetContainer?.scrollLeft || 0,
            containerScrollTop: xsheetContainer?.scrollTop || 0,
            bodyClassAdded: null,
            drawingCanvasOriginalStyle: drawingCanvasEl ? { /* ... store original styles ... */
                display: drawingCanvasEl.style.display, zIndex: drawingCanvasEl.style.zIndex,
                position: drawingCanvasEl.style.position, top: drawingCanvasEl.style.top,
                left: drawingCanvasEl.style.left, width: drawingCanvasEl.style.width,
                height: drawingCanvasEl.style.height,
            } : null
        };

        // Apply print-mode styles FIRST, as this can cause layout shifts
        if (context === "print" || context === "pdf") { // Apply for PDF too for consistency
            document.body.classList.add("print-mode");
            prevState.bodyClassAdded = "print-mode";
        }
        if (context === "print") addPrintOverrideCss();

        // Allow layout to reflow after class changes
        if (xsheetContainer) xsheetContainer.offsetHeight; // Force reflow

        // NOW, prepare DrawingCanvas. It will size itself based on current xsheetContainer dimensions.
        if (app.DrawingCanvas?.prepareForExport) {
            app.DrawingCanvas.prepareForExport(true); // true = prepare for full content export
        }
        if (drawingCanvasEl) {
            drawingCanvasEl.style.zIndex = "990"; // Ensure it's on top for capture
            if (context === "print") drawingCanvasEl.style.setProperty("display", "block", "important");
        }

        // Scroll target for capture to top-left AFTER drawing canvas is prepared at full size
        if (xsheetContainer) {
            xsheetContainer.scrollLeft = 0;
            xsheetContainer.scrollTop = 0;
        }
        if (document.getElementById("xsheet-and-metadata-section")) {
            document.getElementById("xsheet-and-metadata-section").scrollLeft = 0;
            document.getElementById("xsheet-and-metadata-section").scrollTop = 0;
        }

        console.log(`pushDomState for ${context}: Scroll reset. DrawingCanvas prepared.`);
        return prevState;
    }

    function popDomStateAndRestoreDrawing(prevState, context) {
        // ... (same as before, but ensure drawingCanvasEl._originalStyleForExport is used if defined there) ...
        const xsheetContainer = document.getElementById("xsheet-container");
        const drawingCanvasEl = document.getElementById("drawingCanvasOverlay");
        if (xsheetContainer) { xsheetContainer.scrollLeft = prevState.containerScrollLeft; xsheetContainer.scrollTop = prevState.containerScrollTop; }
        if (app.DrawingCanvas?.prepareForExport) app.DrawingCanvas.prepareForExport(false);
        if (drawingCanvasEl && prevState.drawingCanvasOriginalStyle) {
            Object.assign(drawingCanvasEl.style, prevState.drawingCanvasOriginalStyle);
        }
        if (context === "print") removePrintOverrideCss();
        if (prevState.bodyClassAdded) document.body.classList.remove(prevState.bodyClassAdded);
        // console.log(`popDomState for ${context}: Scroll restored. DrawingCanvas reverted.`);
    }

    function handleBeforePrint() { /* ... same: calls pushDomStateAndPrepareDrawing('print') ... */
        if (!app.__exportPrint_prevState_print) app.__exportPrint_prevState_print = pushDomStateAndPrepareDrawing("print");
    }
    function handleAfterPrint() { /* ... same: calls popDomStateAndRestoreDrawing ... */
        if (app.__exportPrint_prevState_print) { popDomStateAndRestoreDrawing(app.__exportPrint_prevState_print, "print"); delete app.__exportPrint_prevState_print; }
        app.updateStatus?.("Print dialog closed.");
    }
    function triggerPrint() { /* ... same: calls window.print() ... */
        if (!window.print) { app.updateStatus?.("Printing not supported."); return; }
        app.updateStatus?.("Preparing for print…"); window.print();
    }

    async function exportPDF() {
        if (!window.html2canvas || !jsPDFCtor) { app.updateStatus?.("PDF export unavailable – libraries missing."); return; }

        // ** Capture the #printable-area (or whichever element correctly contains metadata + xsheet-container) **
        const captureEl = document.getElementById("printable-area") || document.getElementById("xsheet-and-metadata-section");
        if (!captureEl) { app.updateStatus?.("Main content element not found for PDF."); return; }

        app.updateStatus?.("Rendering PDF…");
        const prevDOMState = pushDomStateAndPrepareDrawing("pdf");

        // Wait for DOM updates and drawing canvas to be fully rendered at export size
        await new Promise((r) => setTimeout(r, 350)); // Increased delay slightly

        let canvasSnapshot;
        try {
            canvasSnapshot = await html2canvas(captureEl, {
                scale: 1.5, useCORS: true, logging: false, backgroundColor: '#ffffff',
                width: captureEl.scrollWidth,   // Capture full scrollable width of target
                height: captureEl.scrollHeight, // Capture full scrollable height of target
                windowWidth: captureEl.scrollWidth,
                windowHeight: captureEl.scrollHeight,
                x: 0, y: 0, scrollX: 0, scrollY: 0, // Ensure capture starts at top-left of captureEl
            });
        } catch (e) {
            console.error("exportPrintHandler: html2canvas failed", e);
            popDomStateAndRestoreDrawing(prevDOMState, "pdf");
            app.updateStatus?.("PDF capture failed: " + e.message); return;
        }

        try {
            const pdf = new jsPDFCtor({ orientation: "portrait", unit: "mm", format: "letter" });
            const margin = 10;
            const pageW_mm = pdf.internal.pageSize.getWidth() - 2 * margin;
            const pageH_mm = pdf.internal.pageSize.getHeight() - 2 * margin;
            const imgData = canvasSnapshot.toDataURL("image/png");
            const imgPxW = canvasSnapshot.width; const imgPxH = canvasSnapshot.height;

            // Scale image to fit PDF page width, maintaining aspect ratio
            const scaleRatio = pageW_mm / imgPxW;
            const renderW_mm = pageW_mm; // Image will take full usable width
            const renderH_on_pdf_mm_total = imgPxH * scaleRatio; // Total height of image if rendered on PDF

            let yOffsetOnImagePx = 0;
            let pages = 0;

            while (yOffsetOnImagePx < imgPxH) {
                if (pages > 0) pdf.addPage("letter", "portrait");

                // How many pixels from the source image fit into one PDF page's height
                const sourceSliceHeightPx = Math.min(pageH_mm / scaleRatio, imgPxH - yOffsetOnImagePx);

                if (sourceSliceHeightPx <= 0) break;

                pdf.addImage(
                    imgData, 'PNG',
                    margin, margin,
                    renderW_mm,
                    sourceSliceHeightPx * scaleRatio, // Height of this slice on PDF page
                    null, 'FAST', 0,
                    0, yOffsetOnImagePx,
                    imgPxW, sourceSliceHeightPx
                );
                yOffsetOnImagePx += sourceSliceHeightPx; pages++;
                if (pages > 30) { console.warn("PDF Export: Exceeded 30 pages."); break; }
            }
            pdf.save(`${projectDataRef?.projectName || "XSheet"}.pdf`);
            app.updateStatus?.("PDF exported successfully.");
        } catch (e) {
            console.error("Error generating PDF document:", e);
            app.updateStatus?.("Error generating PDF: " + e.message);
        } finally {
            popDomStateAndRestoreDrawing(prevDOMState, "pdf");
        }
    }

    app.ExportPrintHandler = {
        init(projectData, xsheet) {
            projectDataRef = projectData; xsheetRef = xsheet;
            window.addEventListener("beforeprint", handleBeforePrint);
            window.addEventListener("afterprint", handleAfterPrint);
            console.log("ExportPrintHandler initialised");
        },
        print: triggerPrint,
        exportPDF: exportPDF,
    };
})(window.XSheetApp);