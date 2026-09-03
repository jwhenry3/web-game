<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.10.2" name="BaseChip_pipo" tilewidth="32" tileheight="32" tilecount="1064" columns="8">
 <image source="base_chip.png" width="256" height="4256"/>
 
 <!-- TERRAIN DEFINITIONS (AUTOTILE CONFIGURATION) -->
 <terraintypes>
  <terrain name="Grass Base" tile="48"/>
  <terrain name="Dirt / Path Base" tile="112"/>
  <terrain name="Cliff Ledge" tile="52"/>
  <terrain name="Cobblestone" tile="116"/>
 </terraintypes>

 <!-- TILE TERRAIN MAPS (Corner/Edge Rules for Autotiling) -->
 
 <!-- 1. Grass Autotile Block (Rows 6-9) -->
 <tile id="48" terrain="0,0,0,0"/> <!-- Full Grass Center -->
 <tile id="49" terrain="0,0,0,0"/>
 <tile id="50" terrain="0,0,0,0"/>
 <tile id="51" terrain="0,0,0,0"/>
 
 <tile id="56" terrain="0,0,0,0"/>
 <tile id="57" terrain="0,0,0,0"/>
 <tile id="58" terrain="0,0,0,0"/>
 <tile id="59" terrain="0,0,0,0"/>

 <!-- 2. Dirt Autotile Block (Rows 14-17) -->
 <tile id="112" terrain="1,1,1,1"/> <!-- Full Dirt Center -->
 <tile id="113" terrain="1,1,1,1"/>
 <tile id="114" terrain="1,1,1,1"/>
 <tile id="115" terrain="1,1,1,1"/>

 <tile id="120" terrain="1,1,1,1"/>
 <tile id="121" terrain="1,1,1,1"/>
 <tile id="122" terrain="1,1,1,1"/>
 <tile id="123" terrain="1,1,1,1"/>

 <!-- TILE PROPERTIES & COLLISION PASSABILITY -->
 <!-- Water / Ocean Tiles -->
 <tile id="176">
  <properties>
   <property name="collides" type="bool" value="true"/>
   <property name="water" type="bool" value="true"/>
  </properties>
 </tile>
 
 <!-- Solid Cliff / Wall Tiles -->
 <tile id="52">
  <properties>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
</tileset>