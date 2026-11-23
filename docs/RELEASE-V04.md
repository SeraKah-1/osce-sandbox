# OSCE Playground v0.4 — Release Notes

Direct puppet posing replaces editor-style controls. The whole patient/doctor moves when dragging the torso or head; touching hand/foot guides two-joint chains in screen space using a bounded damped solver. A single gesture commits one atomic set of scene operations with Undo support. Direct prop dragging works in both renderers, and camera uses the canvas background plus two-finger zoom/pan. The character inspector is compact until expanded. The touch controller also handles cancellation, offline drafts, and renderer switching.

Version 0.4 keeps the v0.3 database schema and existing 18 MCP tools. Release is a source/deploy bundle; it does not automatically update an existing ChatGPT Site.
