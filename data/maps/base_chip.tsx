<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.10.2" name="BaseChip_pipo" tilewidth="32" tileheight="32" tilecount="1064" columns="8">
 <image source="base_chip.png" width="256" height="4256"/>
 <!-- Terrain centers are SOLID fills (samplemap uses local 0 for grass). Wang overlay blocks 48/112/52 are transitions, not fills. -->
 <terraintypes>
  <terrain name="Grass Fill" tile="0"/>
  <terrain name="Dirt Fill" tile="5"/>
  <terrain name="Stone Fill" tile="256"/>
  <terrain name="Cobblestone" tile="116"/>
 </terraintypes>
 <tile id="0" terrain="0,0,0,0"/>
 <tile id="5" terrain="1,1,1,1"/>
 <tile id="256">
  <properties>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="33">
  <properties>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="34">
  <properties>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="176">
  <properties>
   <property name="water" type="bool" value="true"/>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
</tileset>
