package game

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
)

// MapTileColors mirrors FILL in wails/frontend/src/world/overworld.ts — the
// map window and minimap must show identical terrain colors whether they use
// the baked image or the cell-array fallback. Keep in sync.
var MapTileColors = map[byte]color.RGBA{
	'H': {0x2a, 0x4a, 0x28, 0xff}, // haven / town ground
	'.': {0x1a, 0x3a, 0x22, 0xff}, // grass
	',': {0x3d, 0x4a, 0x2e, 0xff}, // dirt / path
	'R': {0x4a, 0x40, 0x34, 0xff}, // road
	'T': {0x16, 0x30, 0x1c, 0xff}, // trees
	'#': {0x3a, 0x3a, 0x40, 0xff}, // rock / blocked
	'~': {0x1a, 0x3a, 0x5a, 0xff}, // water
	'S': {0xdf, 0xe8, 0xee, 0xff}, // snow
	'D': {0xd0, 0xb4, 0x7a, 0xff}, // sand / dunes
	'I': {0x8f, 0xbd, 0xd4, 0xff}, // ice
}

var mapTileFallback = color.RGBA{0x1a, 0x3a, 0x22, 0xff}

// RenderMapPNG paints the overworld cell chars into a PNG at scale×scale
// pixels per tile. Water comes out '~'-colored; unknown chars take the grass
// fallback, same as the client rasterizer. Used by the proxy's /api/mapimg
// endpoint and gencontinent's -png bake flag.
func RenderMapPNG(cols, rows int, cells string, scale int) ([]byte, error) {
	if cols <= 0 || rows <= 0 || scale < 1 {
		return nil, fmt.Errorf("invalid overworld dimensions")
	}
	img := image.NewRGBA(image.Rect(0, 0, cols*scale, rows*scale))
	// Fill one scanline per tile row, then copy it scale times — avoids a
	// per-pixel switch over 4.9M pixels on the large map.
	line := make([]byte, cols*scale*4)
	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {
			ch := byte('#')
			if i := r*cols + c; i < len(cells) {
				ch = cells[i]
			}
			rgb, ok := MapTileColors[ch]
			if !ok {
				rgb = mapTileFallback
			}
			for s := 0; s < scale; s++ {
				o := (c*scale + s) * 4
				line[o], line[o+1], line[o+2], line[o+3] = rgb.R, rgb.G, rgb.B, rgb.A
			}
		}
		for s := 0; s < scale; s++ {
			off := (r*scale + s) * img.Stride
			copy(img.Pix[off:off+len(line)], line)
		}
	}
	var buf bytes.Buffer
	// Flat-color terrain compresses well even at BestSpeed, and the encode is
	// ~10x faster on multi-megapixel maps.
	enc := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := enc.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("encode map image: %w", err)
	}
	return buf.Bytes(), nil
}
