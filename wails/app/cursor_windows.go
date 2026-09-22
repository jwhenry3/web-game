//go:build windows

package app

import (
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows"
)

// OS-level cursor capture for the 3D orbit drag. WebView2's Pointer Lock
// support is unreliable, so the renderer falls back to clipping the cursor
// to the app window and recentering it whenever it nears an edge — the same
// infinite-orbit feel as pointer lock.
var (
	user32           = windows.NewLazySystemDLL("user32.dll")
	procClipCursor   = user32.NewProc("ClipCursor")
	procSetCursorPos = user32.NewProc("SetCursorPos")
)

type clipRect struct{ Left, Top, Right, Bottom int32 }

func (a *App) windowRect() clipRect {
	x, y := runtime.WindowGetPosition(a.ctx)
	w, h := runtime.WindowGetSize(a.ctx)
	return clipRect{int32(x), int32(y), int32(x + w), int32(y + h)}
}

// BeginCursorCapture confines the OS cursor to the app window until
// EndCursorCapture. ClipCursor is system-global, so every capture path must
// end in a release (the renderer also releases on blur and dispose).
func (a *App) BeginCursorCapture() {
	if a.ctx == nil {
		return
	}
	r := a.windowRect()
	procClipCursor.Call(uintptr(unsafe.Pointer(&r)))
}

// RecenterCursor warps the OS cursor to the window center. The renderer
// calls it when the cursor nears a window edge during a captured orbit so
// movement deltas keep flowing; the synthetic move it generates is filtered
// out on the JS side.
func (a *App) RecenterCursor() {
	if a.ctx == nil {
		return
	}
	r := a.windowRect()
	procSetCursorPos.Call(uintptr((r.Left+r.Right)/2), uintptr((r.Top+r.Bottom)/2))
}

// EndCursorCapture releases the OS cursor confinement.
func (a *App) EndCursorCapture() {
	procClipCursor.Call(0)
}
