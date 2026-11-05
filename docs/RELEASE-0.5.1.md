# Whisketch 0.5.1 build 9

- App chrome can be dark while photos and paper keep their actual colours. The internal canvas uses light rendering, avoiding the image counter-inversion/filter dependency that produced photographic negatives on some renderers. Midnight paper remains a deliberate paper colour; existing content is not recoloured.
- Paper is available from the page bar, with plain, ruled, narrow ruled, graph, large graph, dots, Cornell, yellow ruled and midnight options. Changes are saved immediately, including the SVG attachment; selecting another page retains that page's paper.
- OCR excludes locked paper backgrounds. A selected uncropped photo uses original image pixels. Ink is rendered at higher resolution with dark strokes on white, independent of the display theme. Native Vision uses language detection and a smaller minimum text size. Handwriting is still image OCR, with variable accuracy; it is not stroke-based handwriting recognition or automatic transcription.
- Inserted recognition text is placed in the visible canvas, scrolled into view and selected. JavaScript acknowledges insertion. The native review dismisses only on success, otherwise retains editable text and displays a retry error.
- Notebook/whiteboard remain presentations of the same pages: notebook limits the page surface width and adds framing; whiteboard fills the workspace width. Both permit panning/zooming and use identical objects and tools. There is no separate document type or automatic conversion.

Regression coverage includes photo pixel colours in dark chrome, paper persistence after reload, acknowledged insertion, and native OCR followed by pressing Insert text and verifying the review closes. Real handwritten input quality and physical camera/Pencil use remain owner checks.
