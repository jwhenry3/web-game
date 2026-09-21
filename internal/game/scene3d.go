package game

import (
 "encoding/json"
 "fmt"
 "math"
 "os"
 "path/filepath"
 "strconv"
 "strings"
)

// Scene transforms use Three.js units (16 map pixels), Y up, XYZ degrees.
// Network and physics coordinates remain map pixels, with Z up.
type SceneTransform struct {
 Position [3]float64 `json:"position"`
 Rotation [3]float64 `json:"rotation"`
 Scale [3]float64 `json:"scale"`
}
type SceneCollider struct {
 Enabled bool `json:"enabled"`
 Shape string `json:"shape"`
 Size [3]float64 `json:"size"`
 Offset [3]float64 `json:"offset"`
 IsTrigger bool `json:"isTrigger"`
}
type SceneNPC struct { Enabled bool `json:"enabled"`; Archetype string `json:"archetype"`; Level int `json:"level"`; Hostile bool `json:"hostile"`; RespawnSeconds float64 `json:"respawnSeconds"` }
type ScenePOI struct { Enabled bool `json:"enabled"`; Type string `json:"type"`; Label string `json:"label"`; InteractionRadius float64 `json:"interactionRadius"`; DestinationMap string `json:"destinationMap"` }
type SceneItem struct { Enabled bool `json:"enabled"`; ItemID string `json:"itemId"`; Quantity int `json:"quantity"`; RespawnSeconds float64 `json:"respawnSeconds"` }
type SceneComponents struct { Collider *SceneCollider `json:"collider,omitempty"`; NPC *SceneNPC `json:"npc,omitempty"`; POI *ScenePOI `json:"poi,omitempty"`; Item *SceneItem `json:"item,omitempty"` }
type ScenePrefabInstance struct { AssetID string `json:"assetId"`; NodeID string `json:"nodeId"`; RootID string `json:"rootId"`; Overrides []string `json:"overrides"` }
type SceneObject struct {
 ID string `json:"id"`; Name string `json:"name"`; Parent string `json:"parent,omitempty"`; Prefab string `json:"prefab"`
 Transform SceneTransform `json:"transform"`; Visible bool `json:"visible"`; Props map[string]any `json:"props"`
 Components SceneComponents `json:"components,omitempty"`; PrefabInstance *ScenePrefabInstance `json:"prefabInstance,omitempty"`
}
type ScenePrefabAsset struct { ID string `json:"id"`; Name string `json:"name"`; Kind string `json:"kind"`; Revision int `json:"revision"`; Objects []SceneObject `json:"objects"` }
type SceneTerrain struct { Version int `json:"version"`; Heights map[string]float64 `json:"heights"`; Cells map[string]string `json:"cells"` }
type Scene3D struct {
 Version int `json:"version"`; Map string `json:"map"`; Environment map[string]any `json:"environment"`
 Objects []SceneObject `json:"objects"`; Prefabs []ScenePrefabAsset `json:"prefabs"`; Terrain SceneTerrain `json:"terrain"`
}
func EmptyScene3D(id string) *Scene3D { return &Scene3D{Version:2,Map:id,Environment:map[string]any{"sunColor":"#ffe5b7","sunIntensity":2.6,"skyColor":"#bccdd0","fogNear":28,"fogFar":65},Objects:[]SceneObject{},Prefabs:[]ScenePrefabAsset{},Terrain:SceneTerrain{Version:1,Heights:map[string]float64{},Cells:map[string]string{}}} }

func sceneIndex(key string, cols, rows int, vertex bool) bool {
 p:=strings.Split(key,",");if len(p)!=2{return false};c,e:=strconv.Atoi(p[0]);r,e2:=strconv.Atoi(p[1]);if vertex{cols++;rows++};return e==nil&&e2==nil&&c>=0&&r>=0&&c<cols&&r<rows&&key==fmt.Sprintf("%d,%d",c,r)
}
func validateSceneObjects(objects []SceneObject) error {
 ids:=map[string]SceneObject{}
 for _,o:=range objects {
  if o.ID=="" {return fmt.Errorf("object id is required")};if _,ok:=ids[o.ID];ok{return fmt.Errorf("duplicate object %s",o.ID)};ids[o.ID]=o
  for _,v:=range [][3]float64{o.Transform.Position,o.Transform.Rotation,o.Transform.Scale} {for _,n:=range v{if math.IsNaN(n)||math.IsInf(n,0)||math.Abs(n)>1e7{return fmt.Errorf("invalid transform on %s",o.ID)}}}
  if c:=o.Components.Collider;c!=nil {for i,n:=range c.Size {if n<=0||n>10000||math.IsNaN(n)||math.IsInf(n,0)||math.Abs(c.Offset[i])>1e7{return fmt.Errorf("invalid collider on %s",o.ID)}}}
  if n:=o.Components.NPC;n!=nil&&(n.Level<1||n.Level>1000||n.RespawnSeconds<0){return fmt.Errorf("invalid NPC on %s",o.ID)}
  if i:=o.Components.Item;i!=nil&&(i.Quantity<1||i.Quantity>9999||i.RespawnSeconds<0){return fmt.Errorf("invalid item on %s",o.ID)}
 }
 for _,o:=range objects {seen:=map[string]bool{o.ID:true};p:=o.Parent;for p!="" {if seen[p]{return fmt.Errorf("parent cycle at %s",o.ID)};seen[p]=true;parent,ok:=ids[p];if !ok{return fmt.Errorf("missing parent %s",p)};p=parent.Parent}}
 return nil
}
func (s *Scene3D) Validate(cols, rows int) error {
 if s.Version<1||s.Version>2{return fmt.Errorf("unsupported scene version %d",s.Version)}
 if len(s.Objects)>10000||len(s.Prefabs)>2000{return fmt.Errorf("scene exceeds object budget")}
 if err:=validateSceneObjects(s.Objects);err!=nil{return err};assets:=map[string]bool{}
 for _,p:=range s.Prefabs{if p.ID==""||assets[p.ID]{return fmt.Errorf("invalid prefab id")};assets[p.ID]=true;if err:=validateSceneObjects(p.Objects);err!=nil{return err}}
 for k,h:=range s.Terrain.Heights {if !sceneIndex(k,cols,rows,true)||math.IsNaN(h)||math.IsInf(h,0)||h < -4096||h>16384{return fmt.Errorf("invalid terrain height %s",k)}}
 for k,c:=range s.Terrain.Cells {if !sceneIndex(k,cols,rows,false)||len(c)!=1||!strings.Contains(".HRTSDI#~P",c){return fmt.Errorf("invalid terrain cell %s",k)}}
 s.Version=2;s.Terrain.Version=1
 if s.Objects==nil{s.Objects=[]SceneObject{}};if s.Prefabs==nil{s.Prefabs=[]ScenePrefabAsset{}};if s.Environment==nil{s.Environment=EmptyScene3D(s.Map).Environment};if s.Terrain.Heights==nil{s.Terrain.Heights=map[string]float64{}};if s.Terrain.Cells==nil{s.Terrain.Cells=map[string]string{}}
 return nil
}

type sceneMatrix [16]float64
func sceneIdentity() sceneMatrix {return sceneMatrix{1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1}}
func sceneMultiply(a,b sceneMatrix)(r sceneMatrix){for i:=0;i<4;i++{for j:=0;j<4;j++{for k:=0;k<4;k++{r[i*4+j]+=a[i*4+k]*b[k*4+j]}}};return}
func sceneLocal(t SceneTransform)sceneMatrix {
 x,y,z:=t.Rotation[0]*math.Pi/180,t.Rotation[1]*math.Pi/180,t.Rotation[2]*math.Pi/180
 cx,sx,cy,sy,cz,sz:=math.Cos(x),math.Sin(x),math.Cos(y),math.Sin(y),math.Cos(z),math.Sin(z)
 a:=sceneIdentity();a[0]=cy*cz*t.Scale[0];a[1]=-cy*sz*t.Scale[1];a[2]=sy*t.Scale[2]
 a[4]=(cx*sz+sx*sy*cz)*t.Scale[0];a[5]=(cx*cz-sx*sy*sz)*t.Scale[1];a[6]=-sx*cy*t.Scale[2]
 a[8]=(sx*sz-cx*sy*cz)*t.Scale[0];a[9]=(sx*cz+cx*sy*sz)*t.Scale[1];a[10]=cx*cy*t.Scale[2]
 a[3]=t.Position[0];a[7]=t.Position[1];a[11]=t.Position[2];return a
}
func (m sceneMatrix) point(p [3]float64)[3]float64 {return [3]float64{m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3],m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7],m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11]}}
type SceneWorldObject struct { SceneObject; Matrix sceneMatrix; Position Vec3 }
func(s *Scene3D)WorldObjects()[]SceneWorldObject {
 if s==nil{return nil};byID:=map[string]SceneObject{};for _,o:=range s.Objects{byID[o.ID]=o};cache:=map[string]sceneMatrix{}
 var world func(string,int)sceneMatrix;world=func(id string,depth int)sceneMatrix{if m,ok:=cache[id];ok{return m};o,ok:=byID[id];if !ok||depth>len(s.Objects){return sceneIdentity()};m:=sceneLocal(o.Transform);if o.Parent!=""{m=sceneMultiply(world(o.Parent,depth+1),m)};cache[id]=m;return m}
 out:=make([]SceneWorldObject,0,len(s.Objects));for _,o:=range s.Objects {m:=world(o.ID,0);p:=m.point([3]float64{});out=append(out,SceneWorldObject{o,m,Vec3{p[0]*16,p[2]*16,p[1]*16}})};return out
}
func(o *Overworld)SceneColliders3D()[]AABB3D {
 if o==nil||o.Scene3D==nil{return nil};out:=[]AABB3D{}
 for _,obj:=range o.Scene3D.WorldObjects(){c:=obj.Components.Collider;if c==nil||!c.Enabled||c.IsTrigger{continue};b:=AABB3D{Min:Vec3{math.Inf(1),math.Inf(1),math.Inf(1)},Max:Vec3{math.Inf(-1),math.Inf(-1),math.Inf(-1)}}
  for i:=0;i<8;i++{p:=c.Offset;for axis:=0;axis<3;axis++{sign:=-1.;if i&(1<<axis)!=0{sign=1};p[axis]+=sign*c.Size[axis]/2};v:=obj.Matrix.point(p);x,y,z:=v[0]*16,v[2]*16,v[1]*16;b.Min.X=math.Min(b.Min.X,x);b.Min.Y=math.Min(b.Min.Y,y);b.Min.Z=math.Min(b.Min.Z,z);b.Max.X=math.Max(b.Max.X,x);b.Max.Y=math.Max(b.Max.Y,y);b.Max.Z=math.Max(b.Max.Z,z)};out=append(out,b)
 };return out
}
func Scene3DPath(mapPath string)string {if strings.HasSuffix(mapPath,".map.json"){return strings.TrimSuffix(mapPath,".map.json")+".scene3d.json"};return strings.TrimSuffix(mapPath,filepath.Ext(mapPath))+".scene3d.json"}
func LoadScene3D(path string,cols,rows int)(*Scene3D,error){data,err:=os.ReadFile(path);if os.IsNotExist(err){return nil,nil};if err!=nil{return nil,err};var s Scene3D;if err=json.Unmarshal(data,&s);err!=nil{return nil,err};if err=s.Validate(cols,rows);err!=nil{return nil,err};return &s,nil}
func SaveScene3D(path string,s *Scene3D)error {data,err:=json.MarshalIndent(s,"","  ");if err!=nil{return err};f,err:=os.CreateTemp(filepath.Dir(path),".scene-*.json");if err!=nil{return err};tmp:=f.Name();defer os.Remove(tmp);if _,err=f.Write(data);err!=nil{f.Close();return err};if err=f.Close();err!=nil{return err};return os.Rename(tmp,path)}
func(o *Overworld)ApplyScene3D(s *Scene3D) {
 o.Scene3D=s;if s==nil{return};for k,v:=range s.Terrain.Cells{var c,r int;fmt.Sscanf(k,"%d,%d",&c,&r);if r>=0&&r<len(o.Cells)&&c>=0&&c<len(o.Cells[r]){row:=[]byte(o.Cells[r]);row[c]=v[0];o.Cells[r]=string(row)}}
}
