<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.10.2" name="BaseChip_pipo" tilewidth="32" tileheight="32" tilecount="1064" columns="8">
 <image source="BaseChip_pipo.png" width="256" height="4256"/>
 <terraintypes>
  <terrain name="Grass Base" tile="48"/>
  <terrain name="Dirt / Path Base" tile="112"/>
  <terrain name="Cliff Ledge" tile="52"/>
  <terrain name="Cobblestone" tile="116"/>
 </terraintypes>
 <tile id="48" terrain="0,0,0,0"/>
 <tile id="112" terrain="1,1,1,1"/>
 <tile id="176">
  <properties>
   <property name="water" type="bool" value="true"/>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="52">
  <properties>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
</tileset>
