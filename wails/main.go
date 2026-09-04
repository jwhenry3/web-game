package main

import (
	"embed"

	"clara-mundi/wails/app"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	gameApp := app.New()
	gameApp.SetServerURL(app.DefaultServerFromEnv())

	err := wails.Run(&options.App{
		Title:     "Fantasy",
		Width:     1280,
		Height:    800,
		MinWidth:  960,
		MinHeight: 640,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 10, G: 15, B: 30, A: 255},
		OnStartup:        gameApp.Startup,
		OnShutdown:       gameApp.Shutdown,
		Bind: []any{
			gameApp,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
		},
	})
	if err != nil {
		panic(err)
	}
}
