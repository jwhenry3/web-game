//go:build !windows

package app

// Cursor capture is implemented via user32 on Windows only — other
// platforms' webviews support the Pointer Lock API directly, so the
// renderer's OS-capture fallback never engages.
func (a *App) BeginCursorCapture() {}
func (a *App) RecenterCursor()     {}
func (a *App) EndCursorCapture()   {}
