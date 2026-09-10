# fix-keyboard-shortcut-suppression

Fix Ctrl+B prefix chord being eaten by a page-level capture-phase keydown listener (e.g. Vimium binding Ctrl+B to scroll-up) before it reaches kanhrd's bubble-phase window:keydown handler
