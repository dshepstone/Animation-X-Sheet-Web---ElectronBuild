// js/exportPrintHandler.js
console.log("exportPrintHandler.js loaded");

// Ensure the main app namespace exists
window.XSheetApp = window.XSheetApp || {};

// Immediately Invoked Function Expression (IIFE) to create a private scope
(function (app) {
    "use strict";

    /* ------------------------------------------------------------------
     *  Library detection
     * ----------------------------------------------------------------*/
    const jsPDFCtor = (function () {
        if (window.jspdf?.jsPDF) return window.jspdf.jsPDF; // For jsPDF v3+ UMD
        if (window.jsPDF) return window.jsPDF;             // For jsPDF v2.x UMD
        console.error("exportPrintHandler: jsPDF library not found on window object!");
        return null;
    })();

    if (typeof window.html2canvas !== 'function') {
        console.error("exportPrintHandler: html2canvas library not found on window object!");
    }

    /* ------------------------------------------------------------------
     *  Private state helpers
     * ----------------------------------------------------------------*/
    let projectDataRef, xsheetRef; // These will be set by init
    const PRINT_OVERRIDE_ID = "print-drawing-override-style";

    function addPrintOverrideCss() {
        if (document.getElementById(PRINT_OVERRIDE_ID)) return;
        const style = document.createElement("style");
        style.id = PRINT_OVERRIDE_ID;
        // This CSS rule forces the drawing canvas overlay to be visible for printing
        style.textContent = `@media print { 
        #drawingCanvasOverlay { display:block!important; z-index: 999 !important; } 
        /* You might also need to ensure #verticalWaveformCanvas is hidden for print */
        #verticalWaveformCanvas { display: none !important; }
    }`;
        document.head.appendChild(style);
    }

    function removePrintOverrideCss() {
        const s = document.getElementById(PRINT_OVERRIDE_ID);
        if (s) s.remove();
    }

    /* ------------------------------------------------------------------
     *  Canvas & scroll orchestration for export/print
     * ----------------------------------------------------------------*/
    function pushDomState(context) { // context is 'pdf' or 'print'
        const xsheetContainer = document.getElementById("xsheet-container");
        const drawingCanvasEl = document.getElementById("drawingCanvasOverlay");

        const prevState = {
            scrollLeft: xsheetContainer?.scrollLeft || 0,
            scrollTop: xsheetContainer?.scrollTop || 0,
            bodyClassAdded: null,
            drawingCanvasOriginalStyle: null,
        };

        if (context === "print") {
            document.body.classList.add("print-mode");
            prevState.bodyClassAdded = "print-mode";
            addPrintOverrideCss();
        }

        // Prepare DrawingCanvas for full content capture (no scroll offsets internally)
        if (app.DrawingCanvas && typeof app.DrawingCanvas.prepareForExport === 'function') {
            // Store original style if not already done by prepareForExport
            if (drawingCanvasEl && !drawingCanvasEl._originalStyleForExport) {
                drawingCanvasEl._originalStyleForExport = {
                    display: drawingCanvasEl.style.display,
                    zIndex: drawingCanvasEl.style.zIndex,
                    // Any other styles you might change for export
                };
            }
            app.DrawingCanvas.prepareForExport(true); // true = prepare for export (full size, no scroll offset)
            if (drawingCanvasEl) {
                drawingCanvasEl.style.zIndex = "999"; // Ensure it's on top for capture
                if (context === "print") {
                    drawingCanvasEl.style.setProperty("display", "block", "important");
                }
            }
        }

        // Reset scroll of the container for capture, store original scroll
        if (xsheetContainer) {
            xsheetContainer.scrollLeft = 0;
            xsheetContainer.scrollTop = 0;
        }

        // console.log(`pushDomState for ${context} complete. Scroll reset. Drawing canvas prepared for export.`);
        return prevState;
    }

    function popDomState(prevState, context) {
        const xsheetContainer = document.getElementById("xsheet-container");
        const drawingCanvasEl = document.getElementById("drawingCanvasOverlay");

        if (xsheetContainer) {
            xsheetContainer.scrollLeft = prevState.scrollLeft;
            xsheetContainer.scrollTop = prevState.scrollTop;
        }

        // Revert DrawingCanvas to screen mode
        if (app.DrawingCanvas && typeof app.DrawingCanvas.prepareForExport === 'function') {
            app.DrawingCanvas.prepareForExport(false); // false = revert to screen mode
            if (drawingCanvasEl && drawingCanvasEl._originalStyleForExport) {
                drawingCanvasEl.style.zIndex = drawingCanvasEl._originalStyleForExport.zIndex || "20"; // Revert z-index
                if (context === "print") { // Only revert display if it was specifically for print override
                    drawingCanvasEl.style.display = drawingCanvasEl._originalStyleForExport.display || 'block';
                }
                delete drawingCanvasEl._originalStyleForExport;
            }
        }

        if (context === "print") {
            removePrintOverrideCss();
        }

        if (prevState.bodyClassAdded) {
            document.body.classList.remove(prevState.bodyClassAdded);
        }
        // console.log(`popDomState for ${context} complete. Scroll restored. Drawing canvas reverted.`);
    }

    /* ------------------------------------------------------------------
     *  Browser print
     * ----------------------------------------------------------------*/
    function handleBeforePrint() {
        // console.log("handleBeforePrint triggered");
        // Store state before browser manipulates DOM for printing
        // Ensure this is idempotent or safe if called multiple times by browser
        if (!app.__exportPrint_prevState) { // Only push if not already pushed
            app.__exportPrint_prevState = pushDomState("print");
        }
    }
    function handleAfterPrint() {
        // console.log("handleAfterPrint triggered");
        if (app.__exportPrint_prevState) { // Only pop if state was pushed
            popDomState(app.__exportPrint_prevState, "print");
            delete app.__exportPrint_prevState; // Clear stored state
        }
        app.updateStatus?.("Print dialog closed.");
    }

    function triggerPrint() {
        if (!window.print) {
            app.updateStatus?.("Printing not supported in this browser.");
            return;
        }
        app.updateStatus?.("Preparing document for print…");

        // beforeprint event should handle pushDomState.
        // If some browsers don't fire it reliably before `window.print` dialog appears,
        // calling it here might be too late for DOM changes to reflect in print preview.
        // The standard way is to rely on 'beforeprint'.
        // For safety, one could call `handleBeforePrint` but it might lead to double calls.
        // Let's rely on the event listener. If issues, this is a place to investigate.

        window.print(); // This will trigger 'beforeprint' then 'afterprint'
    }

    /* ------------------------------------------------------------------
     *  PDF export
     * ----------------------------------------------------------------*/
    async function exportPDF() {
        if (!window.html2canvas || !jsPDFCtor) {
            app.updateStatus?.("PDF export unavailable – missing libraries.");
            return;
        }

        const captureEl = document.getElementById("xsheet-and-metadata-section");
        if (!captureEl) {
            app.updateStatus?.("Main sheet element not found – aborting PDF export.");
            return;
        }

        app.updateStatus?.("Rendering PDF… this may take a moment.");
        const prevDOMState = pushDomState("pdf"); // Prepare DOM for full capture

        // Allow re-layout and drawing canvas to settle after DOM changes
        await new Promise((r) => setTimeout(r, 300)); // Slightly longer delay for full canvas redraw

        let canvasSnapshot;
        try {
            // console.log("ExportPDF: Starting html2canvas capture on target:", captureEl);
            // console.log(`ExportPDF: Capturing with dimensions: ${captureEl.scrollWidth} x ${captureEl.scrollHeight}`);
            canvasSnapshot = await html2canvas(captureEl, {
                scale: 2, // Higher scale for better text clarity
                useCORS: true,
                logging: false, // Set to true for html2canvas debugging
                width: captureEl.scrollWidth,   // Ensure full width is captured
                height: captureEl.scrollHeight, // Ensure full height is captured
                windowWidth: captureEl.scrollWidth, // Hint to html2canvas
                windowHeight: captureEl.scrollHeight,
                x: 0, // Start capture from top-left of the element
                y: 0,
                scrollX: 0, // Element itself is not scrolled, its content might be
                scrollY: 0,
            });
            // console.log("ExportPDF: html2canvas capture complete. Snapshot size:", canvasSnapshot.width, "x", canvasSnapshot.height);
        } catch (e) {
            console.error("exportPrintHandler: html2canvas failed", e);
            popDomState(prevDOMState, "pdf"); // Cleanup
            app.updateStatus?.("Could not capture sheet for PDF export. " + e.message);
            return;
        }

        try {
            const pdf = new jsPDFCtor({ orientation: "portrait", unit: "mm", format: "letter" });
            const margin = 10; // mm
            const pageW_mm = pdf.internal.pageSize.getWidth() - 2 * margin;
            const pageH_mm = pdf.internal.pageSize.getHeight() - 2 * margin;

            const imgData = canvasSnapshot.toDataURL("image/png");
            const imgPxW = canvasSnapshot.width;
            const imgPxH = canvasSnapshot.height;

            // Scale image to fit PDF page width (maintaining aspect ratio)
            const scaleFactor = pageW_mm / imgPxW;
            const scaledImgRenderW_mm = imgPxW * scaleFactor;
            const scaledImgRenderH_mm = imgPxH * scaleFactor;

            let yOffsetOnImagePx = 0; // Current Y position on the source snapshot canvas
            let pages = 0;

            while (yOffsetOnImagePx < imgPxH) {
                if (pages > 0) pdf.addPage("letter", "portrait");

                // Calculate how many pixels of the source image correspond to one PDF page height
                const sourceSliceHeightPx = Math.min(pageH_mm / scaleFactor, imgPxH - yOffsetOnImagePx);

                if (sourceSliceHeightPx <= 0) break; // No more content to print

                // Add the image slice to the PDF page
                // The addImage function can take source coordinates to slice the image
                pdf.addImage(
                    imgData,
                    'PNG',
                    margin, // x position on PDF page
                    margin, // y position on PDF page
                    scaledImgRenderW_mm, // width of image on PDF page
                    sourceSliceHeightPx * scaleFactor, // height of image on PDF page
                    null, // alias
                    'FAST', // compression
                    0, // rotation
                    0, // sx - source X on original image (always 0 for full width slice)
                    yOffsetOnImagePx, // sy - source Y on original image (where to start slice)
                    imgPxW, // sWidth - width of slice from original image (full width)
                    sourceSliceHeightPx // sHeight - height of slice from original image
                );

                yOffsetOnImagePx += sourceSliceHeightPx;
                pages++;
                if (pages > 40) { console.warn("PDF Export: Exceeded 40 pages, aborting."); break; } // Safety
            }

            pdf.save(`${projectDataRef?.projectName || "XSheet"}.pdf`);
            app.updateStatus?.("PDF exported successfully.");
        } catch (e) {
            console.error("Error during PDF document generation:", e);
            app.updateStatus?.("Error generating PDF document: " + e.message);
        } finally {
            popDomState(prevDOMState, "pdf"); // Ensure DOM state is restored
        }
    }

    /* ------------------------------------------------------------------
     *  Public API
     * ----------------------------------------------------------------*/
    app.ExportPrintHandler = {
        init(projectData, xsheet) { // projectData is the projectDataInstance, xsheet is xsheetInstanceRef
            projectDataRef = projectData;
            xsheetRef = xsheet; // Stored for potential use in before/after print if needed
            window.addEventListener("beforeprint", handleBeforePrint);
            window.addEventListener("afterprint", handleAfterPrint);
            console.log("ExportPrintHandler initialised");
        },
        print: triggerPrint,
        exportPDF: exportPDF, // Expose the async function
    };

})(window.XSheetApp);