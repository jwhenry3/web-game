package game

import (
	"fmt"
	"strings"
)

// regionFromObject builds a Region from an editor/Tiled object.
// Polygon vertices are absolute world pixels; stored Region.Polygon is tile-space.
func regionFromObject(obj OverrideObject, tileSize int) (Region, error) {
	if tileSize <= 0 {
		tileSize = DefaultTileSize
	}
	tw := float64(tileSize)
	th := float64(tileSize)

	typ := strings.ToLower(obj.Type)
	sanctuary := typ == "sanctuary" || tiledPropBool(obj.Properties, "sanctuary")
	id := tiledPropString(obj.Properties, "id")
	if id == "" {
		id = obj.Name
	}
	if id == "" {
		return Region{}, fmt.Errorf("region object missing id")
	}

	var poly []Vec2
	if len(obj.Polygon) >= 3 {
		poly = make([]Vec2, len(obj.Polygon))
		for i, p := range obj.Polygon {
			poly[i] = Vec2{X: p.X / tw, Y: p.Y / th}
		}
	} else {
		minC := int(obj.X / tw)
		minR := int((obj.Y - obj.Height) / th)
		maxC := int((obj.X+obj.Width)/tw) - 1
		maxR := int(obj.Y/th) - 1
		if maxC < minC {
			maxC = minC
		}
		if maxR < minR {
			maxR = minR
		}
		poly = rectPolygonTile(minC, minR, maxC, maxR)
	}

	minC, minR, maxC, maxR := bboxFromPolygon(poly)
	return Region{
		ID:        id,
		MinC:      minC,
		MinR:      minR,
		MaxC:      maxC,
		MaxR:      maxR,
		Sanctuary: sanctuary,
		Kind:      tiledPropString(obj.Properties, "kind"),
		Polygon:   poly,
	}, nil
}

func regionsFromObjects(objects []OverrideObject, tileSize int) ([]Region, error) {
	out := make([]Region, 0)
	for _, obj := range objects {
		typ := strings.ToLower(obj.Type)
		if typ != "region" && typ != "sanctuary" {
			continue
		}
		reg, err := regionFromObject(obj, tileSize)
		if err != nil {
			return nil, err
		}
		out = append(out, reg)
	}
	return out, nil
}

func validateRegionOverlaps(regions []Region) error {
	for i := 0; i < len(regions); i++ {
		a := regions[i].EnsurePolygon()
		for j := i + 1; j < len(regions); j++ {
			b := regions[j].EnsurePolygon()
			if a.Sanctuary != b.Sanctuary {
				continue
			}
			if polygonsOverlap(a.Polygon, b.Polygon) {
				kind := "region"
				if a.Sanctuary {
					kind = "sanctuary"
				}
				return fmt.Errorf("%s %q overlaps %q", kind, a.ID, b.ID)
			}
		}
	}
	return nil
}
