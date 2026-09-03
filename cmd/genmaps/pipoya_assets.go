package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"ffv-web-game/internal/game"
)

type pipoyaAsset struct {
	SrcName string // filename under pipoya root or SampleMap
	SrcDir  string // "" = SampleMap, "type3" = [A]_type3
	DstName string
}

var pipoyaAssets = []pipoyaAsset{
	{SrcName: "[A]WaterFall_pipo.png", DstName: "pipoya_waterfall.png"},
	{SrcName: "[A]Grass_pipo.png", DstName: "pipoya_grass.png"},
	{SrcName: "[A]Water_pipo.png", DstName: "pipoya_water.png"},
	{SrcName: "[A]Flower_pipo.png", DstName: "pipoya_flower.png"},
	{SrcName: "[A]LongGrass_pipo.png", SrcDir: "type3", DstName: "pipoya_longgrass.png"},
}

type pipoyaTilesetDef struct {
	FirstGID    int
	Name        string
	Image       string
	TileCount   int
	Columns     int
	ImageWidth  int
	ImageHeight int
}

var pipoyaTilesets = []pipoyaTilesetDef{
	{FirstGID: 1, Name: "pipoya_waterfall", Image: "pipoya_waterfall.png", TileCount: 576, Columns: 32, ImageWidth: 1024, ImageHeight: 576},
	{FirstGID: 1641, Name: "pipoya_grass", Image: "pipoya_grass.png", TileCount: 528, Columns: 8, ImageWidth: 256, ImageHeight: 2112},
	{FirstGID: 2169, Name: "pipoya_water", Image: "pipoya_water.png", TileCount: 3072, Columns: 64, ImageWidth: 2048, ImageHeight: 1536},
	{FirstGID: 5241, Name: "pipoya_flower", Image: "pipoya_flower.png", TileCount: 48, Columns: 8, ImageWidth: 256, ImageHeight: 192},
	{FirstGID: 5289, Name: "pipoya_longgrass", Image: "pipoya_longgrass.png", TileCount: 48, Columns: 8, ImageWidth: 256, ImageHeight: 192},
}

func pipoyaRoot(root string) string {
	return filepath.Join(root, "compressed", "pipoya", "Pipoya RPG Tileset 32x32")
}

func copyPipoyaAssets(root string) error {
	base := pipoyaRoot(root)
	sample := filepath.Join(base, "SampleMap")
	for _, a := range pipoyaAssets {
		var src string
		switch a.SrcDir {
		case "type3":
			src = filepath.Join(base, "[A]_type3", a.SrcName)
		default:
			src = filepath.Join(sample, a.SrcName)
		}
		dst := filepath.Join(root, "maps", a.DstName)
		if err := copyFileStream(src, dst); err != nil {
			return fmt.Errorf("copy %s: %w", a.SrcName, err)
		}
	}
	return nil
}

func copyFileStream(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

func pipoyaTilesetsTMJ(cfg *game.BaseChipConfig) []tmjTileset {
	out := make([]tmjTileset, 0, len(pipoyaTilesets)+1)
	out = append(out, tmjTileset{
		FirstGID:    game.PipoyaFirstBaseChip,
		Name:        cfg.Name,
		Image:       cfg.Image,
		TileWidth:   cfg.TileWidth,
		TileHeight:  cfg.TileHeight,
		TileCount:   cfg.TileCount,
		Columns:     cfg.Columns,
		ImageWidth:  cfg.ImageWidth,
		ImageHeight: cfg.ImageHeight,
	})
	for _, ts := range pipoyaTilesets {
		out = append(out, tmjTileset{
			FirstGID:    ts.FirstGID,
			Name:        ts.Name,
			Image:       ts.Image,
			TileWidth:   tileSize,
			TileHeight:  tileSize,
			TileCount:   ts.TileCount,
			Columns:     ts.Columns,
			ImageWidth:  ts.ImageWidth,
			ImageHeight: ts.ImageHeight,
		})
	}
	return out
}

func pipoyaPublicAssets() []string {
	names := []string{"greenwood.tmj", "north.tmj", "base_chip.png", "base_chip.tsx"}
	for _, a := range pipoyaAssets {
		names = append(names, a.DstName)
	}
	return names
}
