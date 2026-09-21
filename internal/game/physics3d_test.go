package game

import (
 "math"
 "testing"
)

func testPhysicsWorld() PhysicsWorld3D {
 return PhysicsWorld3D{Bounds:AABB3D{Min:Vec3{-1000,-1000,-1000},Max:Vec3{1000,1000,1000}},HeightAt:func(x,y float64)float64{return 0},Gravity:320,StepHeight:8,MaxSlope:1}
}

func TestPhysics3DStopsSweptBodyAtWall(t *testing.T) {
 w:=testPhysicsWorld(); w.Colliders=[]AABB3D{{Min:Vec3{40,-50,0},Max:Vec3{41,50,100}}}
 b:=NewCharacterBody3D(0,0,0); b.Grounded=true
 got:=w.Move(b,Vec2{100,0},.05)
 if got.Position.X>40-b.Radius+.001 {t.Fatalf("tunneled through wall: %+v",got)}
}

func TestPhysics3DAllowsPassingUnderElevatedObject(t *testing.T) {
 w:=testPhysicsWorld(); w.Colliders=[]AABB3D{{Min:Vec3{40,-50,80},Max:Vec3{50,50,100}}}
 b:=NewCharacterBody3D(0,0,0); b.Grounded=true
 got:=w.Move(b,Vec2{100,0},.05)
 if math.Abs(got.Position.X-100)>.001 {t.Fatalf("elevated object blocks ground: %+v",got)}
}

func TestPhysics3DGravityLandsOnPlatform(t *testing.T) {
 w:=testPhysicsWorld();w.Colliders=[]AABB3D{{Min:Vec3{-50,-50,20},Max:Vec3{50,50,30}}}
 b:=NewCharacterBody3D(0,0,120)
 for i:=0;i<80;i++ {b=w.Move(b,Vec2{0,0},.05)}
 if b.Position.Z!=30 || !b.Grounded || b.Velocity.Z!=0 {t.Fatalf("not grounded on platform: %+v",b)}
}

func TestPhysics3DRejectsSteepTerrainAndClimbsSmallStep(t *testing.T) {
 w:=testPhysicsWorld(); w.HeightAt=func(x,y float64)float64 {return math.Max(0,x)*2}
 b:=NewCharacterBody3D(0,0,0);b.Grounded=true
 got:=w.Move(b,Vec2{50,0},.05)
 if got.Position.X>1 {t.Fatalf("climbed steep slope: %+v",got)}
 w.HeightAt=func(x,y float64)float64{return 0};w.Colliders=[]AABB3D{{Min:Vec3{20,-50,0},Max:Vec3{100,50,6}}}
 got=w.Move(b,Vec2{60,0},.05)
 if got.Position.X<59 || got.Position.Z!=6 {t.Fatalf("cannot climb small step: %+v",got)}
}

func TestPhysics3DLineOfSightRespectsElevation(t *testing.T) {
 w:=testPhysicsWorld();w.Colliders=[]AABB3D{{Min:Vec3{40,-10,0},Max:Vec3{45,10,20}}}
 if w.LineOfSight(Vec3{0,0,10},Vec3{100,0,10}) {t.Fatal("ray crossed solid obstacle")}
 if !w.LineOfSight(Vec3{0,0,30},Vec3{100,0,30}) {t.Fatal("clear elevated ray rejected")}
}

func TestTerrainHeight3DMatchesTownAndTriangleInterpolation(t *testing.T) {
 ow:=&Overworld{Cols:2,Rows:2,TileSize:32,Cells:[]string{"HH","HH"}}
 if got:=ow.TerrainHeightAt(25,12);math.Abs(got-7.68)>.00001 {t.Fatalf("town height = %v",got)}
 ow.Cells=[]string{"..",".."}
 a,b,d:=ow.TerrainHeightAt(0,0),ow.TerrainHeightAt(32,0),ow.TerrainHeightAt(0,32)
 if got:=ow.TerrainHeightAt(8,8);math.Abs(got-(a*.5+b*.25+d*.25))>.00001 {t.Fatalf("mesh triangle mismatch: %v",got)}
}
