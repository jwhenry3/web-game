package game

// Tiled map JSON structures (subset of Tiled 1.x TMJ format).

type tiledMapFile struct {
	Width      int            `json:"width"`
	Height     int            `json:"height"`
	TileWidth  int            `json:"tilewidth"`
	TileHeight int            `json:"tileheight"`
	Properties []tiledProp    `json:"properties"`
	Layers     []tiledLayer   `json:"layers"`
	Tilesets   []tiledTileset `json:"tilesets"`
}

type tiledProp struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Value any    `json:"value"`
}

type tiledLayer struct {
	ID      int           `json:"id"`
	Name    string        `json:"name"`
	Type    string        `json:"type"`
	Width   int           `json:"width"`
	Height  int           `json:"height"`
	Visible bool          `json:"visible"`
	Data    []int         `json:"data"`
	Objects []tiledObject `json:"objects"`
	OffsetX float64       `json:"offsetx"`
	OffsetY float64       `json:"offsety"`
}

type tiledObject struct {
	ID         int         `json:"id"`
	Name       string      `json:"name"`
	Type       string      `json:"type"`
	X          float64     `json:"x"`
	Y          float64     `json:"y"`
	Width      float64     `json:"width"`
	Height     float64     `json:"height"`
	Point      bool        `json:"point"`
	Polygon    []Vec2      `json:"polygon"`
	Properties []tiledProp `json:"properties"`
}

type tiledTileset struct {
	FirstGID   int    `json:"firstgid"`
	Source     string `json:"source"`
	Name       string `json:"name"`
	Image      string `json:"image"`
	TileWidth  int    `json:"tilewidth"`
	TileHeight int    `json:"tileheight"`
	TileCount  int    `json:"tilecount"`
	Columns    int    `json:"columns"`
}

func tiledGID(raw int) int {
	return raw & 0x1FFFFFFF
}
