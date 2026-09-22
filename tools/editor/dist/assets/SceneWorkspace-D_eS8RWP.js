import{n as e,t}from"./index-hNOkWKwV.js";import{$ as n,$n as r,$r as i,$t as a,A as o,Ar as s,At as c,B as l,Br as u,Bt as d,Cr as f,Ct as p,D as m,Dr as h,Dt as g,E as _,Et as v,F as y,Fr as b,Ft as x,G as S,Gr as C,Gt as w,H as T,Hr as E,Ht as D,I as O,Ir as ee,It as k,J as A,Jn as j,Jr as M,Jt as N,K as P,Kn as te,Kr as ne,Kt as re,L as F,Lr as ie,Lt as I,M as L,Mr as R,Mt as ae,N as z,Nr as oe,Nt as se,O as ce,Or as le,Ot as ue,Pr as de,Pt as B,Q as fe,Qn as pe,Qr as me,Qt as he,R as V,Rr as ge,Rt as H,S as _e,Sr as ve,St as ye,T as be,Tr as xe,Tt as Se,U as Ce,Ur as we,Ut as Te,V as U,Vr as Ee,Vt as De,W as Oe,Wr as ke,Wt as Ae,X as W,Xr as je,Xt as G,Y as K,Yn as Me,Yr as Ne,Yt as Pe,Z as Fe,Zn as Ie,Zr as Le,Zt as Re,_ as ze,_i as Be,_r as Ve,a as He,ai as Ue,an as We,ar as Ge,at as Ke,b as qe,bi as Je,br as Ye,bt as Xe,c as Ze,ci as Qe,cn as $e,cr as et,d as tt,di as nt,dn as rt,dr as it,dt as at,ei as ot,en as st,er as ct,et as lt,f as ut,fi as dt,fr as ft,ft as pt,g as mt,gi as ht,gn as gt,gr as _t,gt as vt,h as yt,hi as bt,hn as xt,hr as St,ht as Ct,i as wt,ii as Tt,in as Et,it as Dt,j as Ot,jr as kt,jt as At,k as jt,kr as Mt,kt as Nt,l as Pt,li as Ft,ln as It,lt as Lt,m as Rt,mi as zt,mr as Bt,mt as Vt,n as Ht,ni as Ut,nn as Wt,nt as Gt,o as Kt,oi as qt,on as Jt,or as Yt,ot as Xt,p as Zt,pr as Qt,pt as $t,q as en,qn as tn,qr as q,qt as nn,r as rn,ri as an,rn as on,rt as sn,s as cn,si as ln,sn as un,sr as dn,st as fn,t as pn,ti as mn,tn as hn,tt as gn,u as _n,ui as vn,ur as yn,ut as bn,v as xn,vi as Sn,vr as Cn,vt as wn,w as Tn,wt as En,x as Dn,xi as On,xr as kn,xt as An,y as jn,yi as Mn,yr as Nn,yt as Pn,z as Fn,zr as In,zt as Ln}from"./prefabs-C9q24iH4.js";var J=e();function Rn(){let e=null,t=!1,n=null,r=null;function i(t,a){r=e.requestAnimationFrame(i),n(t,a)}return{start:function(){t!==!0&&n!==null&&e!==null&&(r=e.requestAnimationFrame(i),t=!0)},stop:function(){e!==null&&e.cancelAnimationFrame(r),t=!1},setAnimationLoop:function(e){n=e},setContext:function(t){e=t}}}function zn(e){let t=new WeakMap;function n(t,n){let r=t.array,i=t.usage,a=r.byteLength,o=e.createBuffer();e.bindBuffer(n,o),e.bufferData(n,r,i),t.onUploadCallback();let s;if(r instanceof Float32Array)s=e.FLOAT;else if(typeof Float16Array<`u`&&r instanceof Float16Array)s=e.HALF_FLOAT;else if(r instanceof Uint16Array)s=t.isFloat16BufferAttribute?e.HALF_FLOAT:e.UNSIGNED_SHORT;else if(r instanceof Int16Array)s=e.SHORT;else if(r instanceof Uint32Array)s=e.UNSIGNED_INT;else if(r instanceof Int32Array)s=e.INT;else if(r instanceof Int8Array)s=e.BYTE;else if(r instanceof Uint8Array)s=e.UNSIGNED_BYTE;else if(r instanceof Uint8ClampedArray)s=e.UNSIGNED_BYTE;else throw Error(`THREE.WebGLAttributes: Unsupported buffer data format: `+r);return{buffer:o,type:s,bytesPerElement:r.BYTES_PER_ELEMENT,version:t.version,size:a}}function r(t,n,r){let i=n.array,a=n.updateRanges;if(e.bindBuffer(r,t),a.length===0)e.bufferSubData(r,0,i);else{a.sort((e,t)=>e.start-t.start);let t=0;for(let e=1;e<a.length;e++){let n=a[t],r=a[e];r.start<=n.start+n.count+1?n.count=Math.max(n.count,r.start+r.count-n.start):(++t,a[t]=r)}a.length=t+1;for(let t=0,n=a.length;t<n;t++){let n=a[t];e.bufferSubData(r,n.start*i.BYTES_PER_ELEMENT,i,n.start,n.count)}n.clearUpdateRanges()}n.onUploadCallback()}function i(e){return e.isInterleavedBufferAttribute&&(e=e.data),t.get(e)}function a(n){n.isInterleavedBufferAttribute&&(n=n.data);let r=t.get(n);r&&(e.deleteBuffer(r.buffer),t.delete(n))}function o(e,i){if(e.isInterleavedBufferAttribute&&(e=e.data),e.isGLBufferAttribute){let n=t.get(e);(!n||n.version<e.version)&&t.set(e,{buffer:e.buffer,type:e.type,bytesPerElement:e.elementSize,version:e.version});return}let a=t.get(e);if(a===void 0)t.set(e,n(e,i));else if(a.version<e.version){if(a.size!==e.array.byteLength)throw Error(`THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.`);r(a.buffer,e,i),a.version=e.version}}return{get:i,remove:a,update:o}}var Y={alphahash_fragment:`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,alphahash_pars_fragment:`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,alphamap_fragment:`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,alphamap_pars_fragment:`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,alphatest_fragment:`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,alphatest_pars_fragment:`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,aomap_fragment:`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,aomap_pars_fragment:`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,batching_pars_vertex:`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,batching_vertex:`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,begin_vertex:`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,beginnormal_vertex:`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,bsdfs:`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,iridescence_fragment:`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,bumpmap_pars_fragment:`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,clipping_planes_fragment:`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,clipping_planes_pars_fragment:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,clipping_planes_pars_vertex:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,clipping_planes_vertex:`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,color_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,color_pars_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,color_pars_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,color_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,common:`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,cube_uv_reflection_fragment:`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,defaultnormal_vertex:`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,displacementmap_pars_vertex:`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,displacementmap_vertex:`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,emissivemap_fragment:`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,emissivemap_pars_fragment:`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,colorspace_fragment:`gl_FragColor = linearToOutputTexel( gl_FragColor );`,colorspace_pars_fragment:`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,envmap_fragment:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,envmap_common_pars_fragment:`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,envmap_pars_fragment:`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,envmap_pars_vertex:`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,envmap_physical_pars_fragment:`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureCubeUV( envMap, envMapRotation * retroVec, roughness );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_CUBE_UV
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,envmap_vertex:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,fog_vertex:`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,fog_pars_vertex:`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,fog_fragment:`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fog_pars_fragment:`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,gradientmap_pars_fragment:`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,lightmap_pars_fragment:`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,lights_lambert_fragment:`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,lights_lambert_pars_fragment:`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,lights_pars_begin:`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,lights_toon_fragment:`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,lights_toon_pars_fragment:`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lights_phong_fragment:`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,lights_phong_pars_fragment:`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,lights_physical_fragment:`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,lights_physical_pars_fragment:`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,lights_fragment_begin:`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,lights_fragment_maps:`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,lights_fragment_end:`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,lightprobes_pars_fragment:`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,logdepthbuf_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,logdepthbuf_pars_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_pars_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,map_fragment:`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,map_pars_fragment:`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,map_particle_fragment:`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,map_particle_pars_fragment:`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,metalnessmap_fragment:`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,metalnessmap_pars_fragment:`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,morphinstance_vertex:`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,morphcolor_vertex:`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,morphnormal_vertex:`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,morphtarget_pars_vertex:`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,morphtarget_vertex:`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,normal_fragment_begin:`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,normal_fragment_maps:`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,normal_pars_fragment:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_pars_vertex:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_vertex:`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,normalmap_pars_fragment:`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,clearcoat_normal_fragment_begin:`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,clearcoat_normal_fragment_maps:`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,clearcoat_pars_fragment:`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,iridescence_pars_fragment:`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,opaque_fragment:`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,packing:`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,premultiplied_alpha_fragment:`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,project_vertex:`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,dithering_fragment:`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,dithering_pars_fragment:`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,roughnessmap_fragment:`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,roughnessmap_pars_fragment:`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,shadowmap_pars_fragment:`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,shadowmap_pars_vertex:`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,shadowmap_vertex:`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,shadowmask_pars_fragment:`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,skinbase_vertex:`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,skinning_pars_vertex:`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,skinning_vertex:`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,skinnormal_vertex:`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,specularmap_fragment:`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,specularmap_pars_fragment:`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,tonemapping_fragment:`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,tonemapping_pars_fragment:`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,transmission_fragment:`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,transmission_pars_fragment:`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,uv_pars_fragment:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_pars_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,worldpos_vertex:`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,background_vert:`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,background_frag:`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,backgroundCube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,backgroundCube_frag:`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cube_frag:`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,depth_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,depth_frag:`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,distance_vert:`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,distance_frag:`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,equirect_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,equirect_frag:`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,linedashed_vert:`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,linedashed_frag:`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,meshbasic_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,meshbasic_frag:`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshlambert_vert:`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshlambert_frag:`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshmatcap_vert:`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,meshmatcap_frag:`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshnormal_vert:`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,meshnormal_frag:`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,meshphong_vert:`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshphong_frag:`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshphysical_vert:`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,meshphysical_frag:`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshtoon_vert:`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshtoon_frag:`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,points_vert:`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,points_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,shadow_vert:`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,shadow_frag:`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,sprite_vert:`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,sprite_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`},X={common:{diffuse:{value:new V(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new H},alphaMap:{value:null},alphaMapTransform:{value:new H},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new H}},envmap:{envMap:{value:null},envMapRotation:{value:new H},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new H}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new H}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new H},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new H},normalScale:{value:new kt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new H},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new H}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new H}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new H}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new V(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new R},probesMax:{value:new R},probesResolution:{value:new R}},points:{diffuse:{value:new V(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new H},alphaTest:{value:0},uvTransform:{value:new H}},sprite:{diffuse:{value:new V(16777215)},opacity:{value:1},center:{value:new kt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new H},alphaMap:{value:null},alphaMapTransform:{value:new H},alphaTest:{value:0}}},Bn={basic:{uniforms:C([X.common,X.specularmap,X.envmap,X.aomap,X.lightmap,X.fog]),vertexShader:Y.meshbasic_vert,fragmentShader:Y.meshbasic_frag},lambert:{uniforms:C([X.common,X.specularmap,X.envmap,X.aomap,X.lightmap,X.emissivemap,X.bumpmap,X.normalmap,X.displacementmap,X.fog,X.lights,{emissive:{value:new V(0)},envMapIntensity:{value:1}}]),vertexShader:Y.meshlambert_vert,fragmentShader:Y.meshlambert_frag},phong:{uniforms:C([X.common,X.specularmap,X.envmap,X.aomap,X.lightmap,X.emissivemap,X.bumpmap,X.normalmap,X.displacementmap,X.fog,X.lights,{emissive:{value:new V(0)},specular:{value:new V(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Y.meshphong_vert,fragmentShader:Y.meshphong_frag},standard:{uniforms:C([X.common,X.envmap,X.aomap,X.lightmap,X.emissivemap,X.bumpmap,X.normalmap,X.displacementmap,X.roughnessmap,X.metalnessmap,X.fog,X.lights,{emissive:{value:new V(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Y.meshphysical_vert,fragmentShader:Y.meshphysical_frag},toon:{uniforms:C([X.common,X.aomap,X.lightmap,X.emissivemap,X.bumpmap,X.normalmap,X.displacementmap,X.gradientmap,X.fog,X.lights,{emissive:{value:new V(0)}}]),vertexShader:Y.meshtoon_vert,fragmentShader:Y.meshtoon_frag},matcap:{uniforms:C([X.common,X.bumpmap,X.normalmap,X.displacementmap,X.fog,{matcap:{value:null}}]),vertexShader:Y.meshmatcap_vert,fragmentShader:Y.meshmatcap_frag},points:{uniforms:C([X.points,X.fog]),vertexShader:Y.points_vert,fragmentShader:Y.points_frag},dashed:{uniforms:C([X.common,X.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Y.linedashed_vert,fragmentShader:Y.linedashed_frag},depth:{uniforms:C([X.common,X.displacementmap]),vertexShader:Y.depth_vert,fragmentShader:Y.depth_frag},normal:{uniforms:C([X.common,X.bumpmap,X.normalmap,X.displacementmap,{opacity:{value:1}}]),vertexShader:Y.meshnormal_vert,fragmentShader:Y.meshnormal_frag},sprite:{uniforms:C([X.sprite,X.fog]),vertexShader:Y.sprite_vert,fragmentShader:Y.sprite_frag},background:{uniforms:{uvTransform:{value:new H},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Y.background_vert,fragmentShader:Y.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new H}},vertexShader:Y.backgroundCube_vert,fragmentShader:Y.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Y.cube_vert,fragmentShader:Y.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Y.equirect_vert,fragmentShader:Y.equirect_frag},distance:{uniforms:C([X.common,X.displacementmap,{referencePosition:{value:new R},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Y.distance_vert,fragmentShader:Y.distance_frag},shadow:{uniforms:C([X.lights,X.fog,{color:{value:new V(0)},opacity:{value:1}}]),vertexShader:Y.shadow_vert,fragmentShader:Y.shadow_frag}};Bn.physical={uniforms:C([Bn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new H},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new H},clearcoatNormalScale:{value:new kt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new H},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new H},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new H},sheen:{value:0},sheenColor:{value:new V(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new H},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new H},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new H},transmissionSamplerSize:{value:new kt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new H},attenuationDistance:{value:0},attenuationColor:{value:new V(0)},specularColor:{value:new V(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new H},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new H},anisotropyVector:{value:new kt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new H}}]),vertexShader:Y.meshphysical_vert,fragmentShader:Y.meshphysical_frag};var Vn={r:0,b:0,g:0},Hn=new Ln,Un=new H;Un.set(-1,0,0,0,1,0,0,0,1);function Wn(e,t,n,r,i,a){let s=new V(0),c=i===!0?0:1,l,u,f=null,p=0,m=null;function h(e){let n=e.isScene===!0?e.background:null;if(n&&n.isTexture){let r=e.backgroundBlurriness>0;n=t.get(n,r)}return n}function g(t){let r=!1,i=h(t);i===null?v(s,c):i&&i.isColor&&(v(i,1),r=!0);let o=e.xr.getEnvironmentBlendMode();o===`additive`?n.buffers.color.setClear(0,0,0,1,a):o===`alpha-blend`&&n.buffers.color.setClear(0,0,0,0,a),(e.autoClear||r)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function _(t,n){let i=h(n);i&&(i.isCubeTexture||i.mapping===306)?(u===void 0&&(u=new d(new o(1,1,1),new et({name:`BackgroundCubeMaterial`,uniforms:ge(Bn.backgroundCube.uniforms),vertexShader:Bn.backgroundCube.vertexShader,fragmentShader:Bn.backgroundCube.fragmentShader,side:1,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),u.geometry.deleteAttribute(`normal`),u.geometry.deleteAttribute(`uv`),u.onBeforeRender=function(e,t,n){this.matrixWorld.copyPosition(n.matrixWorld)},Object.defineProperty(u.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),r.update(u)),u.material.uniforms.envMap.value=i,u.material.uniforms.backgroundBlurriness.value=n.backgroundBlurriness,u.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,u.material.uniforms.backgroundRotation.value.setFromMatrix4(Hn.makeRotationFromEuler(n.backgroundRotation)).transpose(),i.isCubeTexture&&i.isRenderTargetTexture===!1&&u.material.uniforms.backgroundRotation.value.premultiply(Un),u.material.toneMapped=Fn.getTransfer(i.colorSpace)!==Yt,(f!==i||p!==i.version||m!==e.toneMapping)&&(u.material.needsUpdate=!0,f=i,p=i.version,m=e.toneMapping),u.layers.enableAll(),t.unshift(u,u.geometry,u.material,0,0,null)):i&&i.isTexture&&(l===void 0&&(l=new d(new on(2,2),new et({name:`BackgroundMaterial`,uniforms:ge(Bn.background.uniforms),vertexShader:Bn.background.vertexShader,fragmentShader:Bn.background.fragmentShader,side:0,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute(`normal`),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),r.update(l)),l.material.uniforms.t2D.value=i,l.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,l.material.toneMapped=Fn.getTransfer(i.colorSpace)!==Yt,i.matrixAutoUpdate===!0&&i.updateMatrix(),l.material.uniforms.uvTransform.value.copy(i.matrix),(f!==i||p!==i.version||m!==e.toneMapping)&&(l.material.needsUpdate=!0,f=i,p=i.version,m=e.toneMapping),l.layers.enableAll(),t.unshift(l,l.geometry,l.material,0,0,null))}function v(t,r){t.getRGB(Vn,we(e)),n.buffers.color.setClear(Vn.r,Vn.g,Vn.b,r,a)}function y(){u!==void 0&&(u.geometry.dispose(),u.material.dispose(),u=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return s},setClearColor:function(e,t=1){s.set(e),c=t,v(s,c)},getClearAlpha:function(){return c},setClearAlpha:function(e){c=e,v(s,c)},render:g,addToRenderList:_,dispose:y}}function Gn(e,t){let n=e.getParameter(e.MAX_VERTEX_ATTRIBS),r={},i=f(null),a=i,o=!1;function s(n,r,i,s,c){let u=!1,f=d(n,s,i,r);a!==f&&(a=f,l(a.object)),u=p(n,s,i,c),u&&m(n,s,i,c),c!==null&&t.update(c,e.ELEMENT_ARRAY_BUFFER),(u||o)&&(o=!1,b(n,r,i,s),c!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(c).buffer))}function c(){return e.createVertexArray()}function l(t){return e.bindVertexArray(t)}function u(t){return e.deleteVertexArray(t)}function d(e,t,n,i){let a=i.wireframe===!0,o=r[t.id];o===void 0&&(o={},r[t.id]=o);let s=e.isInstancedMesh===!0?e.id:0,l=o[s];l===void 0&&(l={},o[s]=l);let u=l[n.id];u===void 0&&(u={},l[n.id]=u);let d=u[a];return d===void 0&&(d=f(c()),u[a]=d),d}function f(e){let t=[],r=[],i=[];for(let e=0;e<n;e++)t[e]=0,r[e]=0,i[e]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:t,enabledAttributes:r,attributeDivisors:i,object:e,attributes:{},index:null}}function p(e,t,n,r){let i=a.attributes,o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=i[t],r=o[t];if(r===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(r=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(r=e.instanceColor)),n===void 0||n.attribute!==r||r&&n.data!==r.data)return!0;s++}return a.attributesNum!==s||a.index!==r}function m(e,t,n,r){let i={},o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=o[t];n===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(n=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(n=e.instanceColor));let r={};r.attribute=n,n&&n.data&&(r.data=n.data),i[t]=r,s++}a.attributes=i,a.attributesNum=s,a.index=r}function h(){let e=a.newAttributes;for(let t=0,n=e.length;t<n;t++)e[t]=0}function g(e){_(e,0)}function _(t,n){let r=a.newAttributes,i=a.enabledAttributes,o=a.attributeDivisors;r[t]=1,i[t]===0&&(e.enableVertexAttribArray(t),i[t]=1),o[t]!==n&&(e.vertexAttribDivisor(t,n),o[t]=n)}function v(){let t=a.newAttributes,n=a.enabledAttributes;for(let r=0,i=n.length;r<i;r++)n[r]!==t[r]&&(e.disableVertexAttribArray(r),n[r]=0)}function y(t,n,r,i,a,o,s){s===!0?e.vertexAttribIPointer(t,n,r,a,o):e.vertexAttribPointer(t,n,r,i,a,o)}function b(n,r,i,a){h();let o=a.attributes,s=i.getAttributes(),c=r.defaultAttributeValues;for(let r in s){let i=s[r];if(i.location>=0){let s=o[r];if(s===void 0&&(r===`instanceMatrix`&&n.instanceMatrix&&(s=n.instanceMatrix),r===`instanceColor`&&n.instanceColor&&(s=n.instanceColor)),s!==void 0){let r=s.normalized,o=s.itemSize,c=t.get(s);if(c===void 0)continue;let l=c.buffer,u=c.type,d=c.bytesPerElement,f=u===e.INT||u===e.UNSIGNED_INT||s.gpuType===1013;if(s.isInterleavedBufferAttribute){let t=s.data,c=t.stride,p=s.offset;if(t.isInstancedInterleavedBuffer){for(let e=0;e<i.locationSize;e++)_(i.location+e,t.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=t.meshPerAttribute*t.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,c*d,(p+o/i.locationSize*e)*d,f)}else{if(s.isInstancedBufferAttribute){for(let e=0;e<i.locationSize;e++)_(i.location+e,s.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=s.meshPerAttribute*s.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,o*d,o/i.locationSize*e*d,f)}}else if(c!==void 0){let t=c[r];if(t!==void 0)switch(t.length){case 2:e.vertexAttrib2fv(i.location,t);break;case 3:e.vertexAttrib3fv(i.location,t);break;case 4:e.vertexAttrib4fv(i.location,t);break;default:e.vertexAttrib1fv(i.location,t)}}}}v()}function x(){T();for(let e in r){let t=r[e];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e]}}function S(e){if(r[e.id]===void 0)return;let t=r[e.id];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e.id]}function C(e){for(let t in r){let n=r[t];for(let t in n){let r=n[t];if(r[e.id]===void 0)continue;let i=r[e.id];for(let e in i)u(i[e].object),delete i[e];delete r[e.id]}}}function w(e){for(let t in r){let n=r[t],i=e.isInstancedMesh===!0?e.id:0,a=n[i];if(a!==void 0){for(let e in a){let t=a[e];for(let e in t)u(t[e].object),delete t[e];delete a[e]}delete n[i],Object.keys(n).length===0&&delete r[t]}}}function T(){E(),o=!0,a!==i&&(a=i,l(a.object))}function E(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:s,reset:T,resetDefaultState:E,dispose:x,releaseStatesOfGeometry:S,releaseStatesOfObject:w,releaseStatesOfProgram:C,initAttributes:h,enableAttribute:g,disableUnusedAttributes:v}}function Kn(e,t,n){let r;function i(e){r=e}function a(t,i){e.drawArrays(r,t,i),n.update(i,r,1)}function o(t,i,a){a!==0&&(e.drawArraysInstanced(r,t,i,a),n.update(i,r,a))}function s(e,i,a){if(a===0)return;t.get(`WEBGL_multi_draw`).multiDrawArraysWEBGL(r,e,0,i,0,a);let o=0;for(let e=0;e<a;e++)o+=i[e];n.update(o,r,1)}this.setMode=i,this.render=a,this.renderInstances=o,this.renderMultiDraw=s}function qn(e,t,n,r){let i;function a(){if(i!==void 0)return i;if(t.has(`EXT_texture_filter_anisotropic`)===!0){let n=t.get(`EXT_texture_filter_anisotropic`);i=e.getParameter(n.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(t){return t===1023||r.convert(t)===e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT)}function s(n){let i=n===1016&&(t.has(`EXT_color_buffer_half_float`)||t.has(`EXT_color_buffer_float`));return!(n!==1009&&n!==1015&&!i&&r.convert(n)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE))}function c(t){if(t===`highp`){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return`highp`;t=`mediump`}return t===`mediump`&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?`mediump`:`lowp`}let l=n.precision===void 0?`highp`:n.precision,u=c(l);u!==l&&(q(`WebGLRenderer:`,l,`not supported, using`,u,`instead.`),l=u);let d=n.logarithmicDepthBuffer===!0,f=n.reversedDepthBuffer===!0&&t.has(`EXT_clip_control`);n.reversedDepthBuffer===!0&&f===!1&&q(`WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.`);let p=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),m=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),h=e.getParameter(e.MAX_TEXTURE_SIZE),g=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),_=e.getParameter(e.MAX_VERTEX_ATTRIBS),v=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),y=e.getParameter(e.MAX_VARYING_VECTORS),b=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),x=e.getParameter(e.MAX_SAMPLES),S=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:a,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:s,precision:l,logarithmicDepthBuffer:d,reversedDepthBuffer:f,maxTextures:p,maxVertexTextures:m,maxTextureSize:h,maxCubemapSize:g,maxAttributes:_,maxVertexUniforms:v,maxVaryings:y,maxFragmentUniforms:b,maxSamples:x,samples:S}}function Jn(e){let t=this,n=null,r=0,i=!1,a=!1,o=new Wt,s=new H,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(e,t){let n=e.length!==0||t||r!==0||i;return i=t,r=e.length,n},this.beginShadows=function(){a=!0,u(null)},this.endShadows=function(){a=!1},this.setGlobalState=function(e,t){n=u(e,t,0)},this.setState=function(t,o,s){let d=t.clippingPlanes,f=t.clipIntersection,p=t.clipShadows,m=e.get(t);if(!i||d===null||d.length===0||a&&!p)a?u(null):l();else{let e=a?0:r,t=e*4,i=m.clippingState||null;c.value=i,i=u(d,o,t,s);for(let e=0;e!==t;++e)i[e]=n[e];m.clippingState=i,this.numIntersection=f?this.numPlanes:0,this.numPlanes+=e}};function l(){c.value!==n&&(c.value=n,c.needsUpdate=r>0),t.numPlanes=r,t.numIntersection=0}function u(e,n,r,i){let a=e===null?0:e.length,l=null;if(a!==0){if(l=c.value,i!==!0||l===null){let t=r+a*4,i=n.matrixWorldInverse;s.getNormalMatrix(i),(l===null||l.length<t)&&(l=new Float32Array(t));for(let t=0,n=r;t!==a;++t,n+=4)o.copy(e[t]).applyMatrix4(i,s),o.normal.toArray(l,n),l[n+3]=o.constant}c.value=l,c.needsUpdate=!0}return t.numPlanes=a,t.numIntersection=0,l}}var Yn=4,Xn=6,Zn=20,Qn=256,$n=new st,er=new V,tr=null,nr=0,rr=0,ir=!1,ar=new R,or=new R,sr=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,r=100,i={}){let{size:a=256,position:o=ar}=i;tr=this._renderer.getRenderTarget(),nr=this._renderer.getActiveCubeFace(),rr=this._renderer.getActiveMipmapLevel(),ir=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let s=this._allocateTargets();return s.depthBuffer=!0,this._sceneToCubeUV(e,n,r,s,o),t>0&&this._blur(s,0,0,t),this._applyPMREM(s),this._cleanup(s),s}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=mr(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=pr(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=2**this._lodMax}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(tr,nr,rr),this._renderer.xr.enabled=ir,e.scissorTest=!1,ur(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===301||e.mapping===302?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),tr=this._renderer.getRenderTarget(),nr=this._renderer.getActiveCubeFace(),rr=this._renderer.getActiveMipmapLevel(),ir=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:ue,minFilter:ue,generateMipmaps:!1,type:at,format:xt,colorSpace:At,depthBuffer:!1},r=lr(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=lr(e,t,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=cr(r)),this._blurMaterial=fr(r,e,t),this._ggxMaterial=dr(r,e,t)}return r}_compileMaterial(e){let t=new d(new z,e);this._renderer.compile(t,$n)}_sceneToCubeUV(e,t,n,r,i){let a=new hn(90,1,t,n),s=[1,-1,1,1,1,1],c=[1,1,1,-1,-1,-1],l=this._renderer,u=l.autoClear,f=l.toneMapping;l.getClearColor(er),l.toneMapping=0,l.autoClear=!1,l.state.buffers.depth.getReversed()&&(l.setRenderTarget(r),l.clearDepth(),l.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new d(new o,new De({name:`PMREM.Background`,side:1,depthWrite:!1,depthTest:!1})));let p=this._backgroundBox,m=p.material,h=!1,g=e.background;g?g.isColor&&(m.color.copy(g),e.background=null,h=!0):(m.color.copy(er),h=!0);for(let t=0;t<6;t++){let n=t%3;n===0?(a.up.set(0,s[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x+c[t],i.y,i.z)):n===1?(a.up.set(0,0,s[t]),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y+c[t],i.z)):(a.up.set(0,s[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y,i.z+c[t]));let o=this._cubeSize;ur(r,n*o,t>2?o:0,o,o),l.setRenderTarget(r),h&&l.render(p,a),l.render(e,a)}l.toneMapping=f,l.autoClear=u,e.background=g}_textureToCubeUV(e,t){let n=this._renderer,r=e.mapping===301||e.mapping===302;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=mr()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=pr());let i=r?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=i;let o=i.uniforms;o.envMap.value=e;let s=this._cubeSize;ur(t,0,0,3*s,2*s),n.setRenderTarget(t),n.render(a,$n)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let r=this._lodMeshes.length;for(let t=1;t<r;t++)this._applyGGXFilter(e,t-1,t);t.autoClear=n}_applyGGXFilter(e,t,n){let r=this._renderer,i=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;let s=a.uniforms,c=n/(this._lodMeshes.length-1),l=t/(this._lodMeshes.length-1),u=Math.sqrt(c*c-l*l)*(c*1.25),{_lodMax:d}=this,f=this._sizeLods[n],p=3*f*(n>d-Yn?n-d+Yn:0),m=4*(this._cubeSize-f);s.envMap.value=e.texture,s.roughness.value=u,s.mipInt.value=d-t,ur(i,p,m,3*f,2*f),r.setRenderTarget(i),r.render(o,$n),s.envMap.value=i.texture,s.roughness.value=0,s.mipInt.value=d-n,ur(e,p,m,3*f,2*f),r.setRenderTarget(e),r.render(o,$n)}_blur(e,t,n,r){let i=this._pingPongRenderTarget,a=Math.min(r,Math.PI)/Math.SQRT2;this._blurPass(e,i,t,n,a),this._blurPass(i,e,n,n,a)}_blurPass(e,t,n,r,i){let a=this._renderer,o=this._blurMaterial,s=this._lodMeshes[r];s.material=o;let c=o.uniforms;c.envMap.value=e.texture,c.sigma.value=i,c.mipInt.value=this._lodMax-n;let l=this._sizeLods[r];ur(t,3*l*(r>this._lodMax-Yn?r-this._lodMax+Yn:0),4*(this._cubeSize-l),3*l,2*l),a.setRenderTarget(t),a.render(s,$n)}};function cr(e){let t=[],n=[],r=e,i=e-Yn+1+Xn;for(let e=0;e<i;e++){let e=2**r;t.push(e);let i=1/(e-2),a=-i,o=1+i,s=[a,a,o,a,o,o,a,a,o,o,a,o],c=new Float32Array(108),l=new Float32Array(108);for(let e=0;e<6;e++){let t=e%3*2/3-1,n=e>2?0:-1,r=[t,n,0,t+2/3,n,0,t+2/3,n+1,0,t,n,0,t+2/3,n+1,0,t,n+1,0];c.set(r,18*e);for(let t=0;t<6;t++){let n=s[t*2]*2-1,r=s[t*2+1]*2-1;e===0?or.set(1,r,n):e===1?or.set(-n,1,-r):e===2?or.set(-n,r,1):e===3?or.set(-1,r,-n):e===4?or.set(-n,-1,r):or.set(n,r,-1),or.toArray(l,(e*6+t)*3)}}let u=new z;u.setAttribute(`position`,new L(c,3)),u.setAttribute(`outputDirection`,new L(l,3)),n.push(new d(u,null)),r>Yn&&r--}return{lodMeshes:n,sizeLods:t}}function lr(e,t,n){let r=new ee(e,t,n);return r.texture.mapping=306,r.texture.name=`PMREM.cubeUv`,r.scissorTest=!0,r}function ur(e,t,n,r,i){e.viewport.set(t,n,r,i),e.scissor.set(t,n,r,i)}function dr(e,t,n){return new et({name:`PMREMGGXConvolution`,defines:{GGX_SAMPLES:Qn,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:hr(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function fr(e,t,n){return new et({name:`SphericalGaussianBlur`,defines:{SAMPLES:Zn,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:hr(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float sigma;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359
			#define GOLDEN_ANGLE 2.39996322973

			void main() {

				if ( sigma == 0.0 ) {

					gl_FragColor = vec4( bilinearCubeUV( envMap, vOutputDirection, mipInt ), 1.0 );
					return;

				}

				vec3 outputDirection = normalize( vOutputDirection );

				vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
				vec3 tangent = normalize( cross( up, outputDirection ) );
				vec3 bitangent = cross( outputDirection, tangent );

				// Truncate the kernel at three standard deviations or at the antipode.
				float thetaMax = min( 3.0 * sigma, PI );
				float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

				vec3 accumColor = vec3( 0.0 );
				float accumWeight = 0.0;

				for ( int i = 0; i < SAMPLES; i ++ ) {

					// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
					float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
					float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
					float phi = float( i ) * GOLDEN_ANGLE;

					vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
					vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

					// Correct the planar sample density to solid angle.
					float weight = sin( theta ) / theta;

					accumColor += weight * bilinearCubeUV( envMap, sampleDirection, mipInt );
					accumWeight += weight;

				}

				gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function pr(){return new et({name:`EquirectangularToCubeUV`,uniforms:{envMap:{value:null}},vertexShader:hr(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function mr(){return new et({name:`CubemapToCubeUV`,uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:hr(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function hr(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}var gr=class extends ee{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},r=[n,n,n,n,n,n];this.texture=new Oe(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},r=new o(5,5,5),i=new et({name:`CubemapFromEquirect`,uniforms:ge(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:1,blending:0});i.uniforms.tEquirect.value=t;let a=new d(r,i),s=t.minFilter;return t.minFilter===1008&&(t.minFilter=ue),new T(1,10,this).update(e,a),t.minFilter=s,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,r=!0){let i=e.getRenderTarget();for(let i=0;i<6;i++)e.setRenderTarget(this,i),e.clear(t,n,r);e.setRenderTarget(i)}};function _r(e){let t=new WeakMap,n=new WeakMap,r=null;function i(e,t=!1){return e==null?null:t?o(e):a(e)}function a(n){if(n&&n.isTexture){let r=n.mapping;if(r===303||r===304){if(t.has(n)){let e=t.get(n).texture;return s(e,n.mapping)}{let r=n.image;if(r&&r.height>0){let i=new gr(r.height);return i.fromEquirectangularTexture(e,n),t.set(n,i),n.addEventListener(`dispose`,l),s(i.texture,n.mapping)}return null}}}return n}function o(t){if(t&&t.isTexture){let i=t.mapping,a=i===303||i===304,o=i===301||i===302;if(a||o){let i=n.get(t),s=i===void 0?0:i.texture.pmremVersion;if(t.isRenderTargetTexture&&t.pmremVersion!==s)return r===null&&(r=new sr(e)),i=a?r.fromEquirectangular(t,i):r.fromCubemap(t,i),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),i.texture;if(i!==void 0)return i.texture;{let s=t.image;return a&&s&&s.height>0||o&&s&&c(s)?(r===null&&(r=new sr(e)),i=a?r.fromEquirectangular(t):r.fromCubemap(t),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),t.addEventListener(`dispose`,u),i.texture):null}}}return t}function s(e,t){return t===303?e.mapping=301:t===304&&(e.mapping=302),e}function c(e){let t=0;for(let n=0;n<6;n++)e[n]!==void 0&&t++;return t===6}function l(e){let n=e.target;n.removeEventListener(`dispose`,l);let r=t.get(n);r!==void 0&&(t.delete(n),r.dispose())}function u(e){let t=e.target;t.removeEventListener(`dispose`,u);let r=n.get(t);r!==void 0&&(n.delete(t),r.dispose())}function d(){t=new WeakMap,n=new WeakMap,r!==null&&(r.dispose(),r=null)}return{get:i,dispose:d}}function vr(e){let t={};function n(n){if(t[n]!==void 0)return t[n];let r=e.getExtension(n);return t[n]=r,r}return{has:function(e){return n(e)!==null},init:function(){n(`EXT_color_buffer_float`),n(`WEBGL_clip_cull_distance`),n(`OES_texture_float_linear`),n(`EXT_color_buffer_half_float`),n(`WEBGL_multisampled_render_to_texture`),n(`WEBGL_render_shared_exponent`)},get:function(e){let t=n(e);return t===null&&M(`WebGLRenderer: `+e+` extension not supported.`),t}}}function yr(e,t,n,r){let i={},a=new WeakMap;function o(e){let s=e.target;s.index!==null&&t.remove(s.index);for(let e in s.attributes)t.remove(s.attributes[e]);s.removeEventListener(`dispose`,o),delete i[s.id];let c=a.get(s);c&&(t.remove(c),a.delete(s)),r.releaseStatesOfGeometry(s),s.isInstancedBufferGeometry===!0&&delete s._maxInstanceCount,n.memory.geometries--}function s(e,t){return i[t.id]===!0?t:(t.addEventListener(`dispose`,o),i[t.id]=!0,n.memory.geometries++,t)}function c(n){let r=n.attributes;for(let n in r)t.update(r[n],e.ARRAY_BUFFER)}function l(e){let n=[],r=e.index,i=e.attributes.position,o=0;if(i===void 0)return;if(r!==null){let e=r.array;o=r.version;for(let t=0,r=e.length;t<r;t+=3){let r=e[t+0],i=e[t+1],a=e[t+2];n.push(r,i,i,a,a,r)}}else{let e=i.array;o=i.version;for(let t=0,r=e.length/3-1;t<r;t+=3){let e=t+0,r=t+1,i=t+2;n.push(e,r,r,i,i,e)}}let s=new(i.count>=65535?kn:Ye)(n,1);s.version=o;let c=a.get(e);c&&t.remove(c),a.set(e,s)}function u(e){let t=a.get(e);if(t){let n=e.index;n!==null&&t.version<n.version&&l(e)}else l(e);return a.get(e)}return{get:s,update:c,getWireframeAttribute:u}}function br(e,t,n){let r;function i(e){r=e}let a,o;function s(e){a=e.type,o=e.bytesPerElement}function c(t,i){e.drawElements(r,i,a,t*o),n.update(i,r,1)}function l(t,i,s){s!==0&&(e.drawElementsInstanced(r,i,a,t*o,s),n.update(i,r,s))}function u(e,i,o){if(o===0)return;t.get(`WEBGL_multi_draw`).multiDrawElementsWEBGL(r,i,0,a,e,0,o);let s=0;for(let e=0;e<o;e++)s+=i[e];n.update(s,r,1)}this.setMode=i,this.setIndex=s,this.render=c,this.renderInstances=l,this.renderMultiDraw=u}function xr(e){let t={geometries:0,textures:0},n={frame:0,calls:0,triangles:0,points:0,lines:0};function r(t,r,i){switch(n.calls++,r){case e.TRIANGLES:n.triangles+=t/3*i;break;case e.LINES:n.lines+=t/2*i;break;case e.LINE_STRIP:n.lines+=i*(t-1);break;case e.LINE_LOOP:n.lines+=i*t;break;case e.POINTS:n.points+=i*t;break;default:Ee(`WebGLInfo: Unknown draw mode:`,r)}}function i(){n.calls=0,n.triangles=0,n.points=0,n.lines=0}return{memory:t,render:n,programs:null,autoReset:!0,reset:i,update:r}}function Sr(e,t,n){let r=new WeakMap,i=new oe;function a(a,o,s){let c=a.morphTargetInfluences,l=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,u=l===void 0?0:l.length,d=r.get(o);if(d===void 0||d.count!==u){d!==void 0&&d.texture.dispose();let e=o.morphAttributes.position!==void 0,n=o.morphAttributes.normal!==void 0,a=o.morphAttributes.color!==void 0,s=o.morphAttributes.position||[],c=o.morphAttributes.normal||[],l=o.morphAttributes.color||[],f=0;e===!0&&(f=1),n===!0&&(f=2),a===!0&&(f=3);let p=o.attributes.position.count*f,m=1;p>t.maxTextureSize&&(m=Math.ceil(p/t.maxTextureSize),p=t.maxTextureSize);let h=new Float32Array(p*m*4*u),g=new en(h,p,m,u);g.type=Ke,g.needsUpdate=!0;let _=f*4;for(let t=0;t<u;t++){let r=s[t],o=c[t],u=l[t],d=p*m*4*t;for(let t=0;t<r.count;t++){let s=t*_;e===!0&&(i.fromBufferAttribute(r,t),h[d+s+0]=i.x,h[d+s+1]=i.y,h[d+s+2]=i.z,h[d+s+3]=0),n===!0&&(i.fromBufferAttribute(o,t),h[d+s+4]=i.x,h[d+s+5]=i.y,h[d+s+6]=i.z,h[d+s+7]=0),a===!0&&(i.fromBufferAttribute(u,t),h[d+s+8]=i.x,h[d+s+9]=i.y,h[d+s+10]=i.z,h[d+s+11]=u.itemSize===4?i.w:1)}}d={count:u,texture:g,size:new kt(p,m)},r.set(o,d);function v(){g.dispose(),r.delete(o),o.removeEventListener(`dispose`,v)}o.addEventListener(`dispose`,v)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)s.getUniforms().setValue(e,`morphTexture`,a.morphTexture,n);else{let t=0;for(let e=0;e<c.length;e++)t+=c[e];let n=o.morphTargetsRelative?1:1-t;s.getUniforms().setValue(e,`morphTargetBaseInfluence`,n),s.getUniforms().setValue(e,`morphTargetInfluences`,c)}s.getUniforms().setValue(e,`morphTargetsTexture`,d.texture,n),s.getUniforms().setValue(e,`morphTargetsTextureSize`,d.size)}return{update:a}}function Cr(e,t,n,r,i){let a=new WeakMap;function o(r){let o=i.render.frame,s=r.geometry,l=t.get(r,s);if(a.get(l)!==o&&(t.update(l),a.set(l,o)),r.isInstancedMesh&&(r.hasEventListener(`dispose`,c)===!1&&r.addEventListener(`dispose`,c),a.get(r)!==o&&(n.update(r.instanceMatrix,e.ARRAY_BUFFER),r.instanceColor!==null&&n.update(r.instanceColor,e.ARRAY_BUFFER),a.set(r,o))),r.isSkinnedMesh){let e=r.skeleton;a.get(e)!==o&&(e.update(),a.set(e,o))}return l}function s(){a=new WeakMap}function c(e){let t=e.target;t.removeEventListener(`dispose`,c),r.releaseStatesOfObject(t),n.remove(t.instanceMatrix),t.instanceColor!==null&&n.remove(t.instanceColor)}return{update:o,dispose:s}}var wr={1:`LINEAR_TONE_MAPPING`,2:`REINHARD_TONE_MAPPING`,3:`CINEON_TONE_MAPPING`,4:`ACES_FILMIC_TONE_MAPPING`,6:`AGX_TONE_MAPPING`,7:`NEUTRAL_TONE_MAPPING`,5:`CUSTOM_TONE_MAPPING`};function Tr(e,t,n,r,i,a){let o=new ee(t,n,{type:e,depthBuffer:i,stencilBuffer:a,samples:r?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1}),s=null,c=null,l=new z;l.setAttribute(`position`,new Dt([-1,3,0,-1,-1,0,3,-1,0],3)),l.setAttribute(`uv`,new Dt([0,2,0,0,2,0],2));let u=new j({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),f=new d(l,u),p=new st(-1,1,1,-1,0,1),m=null,h=null,g=!1,_,v=null,y=[],b=!1;this.setSize=function(e,t){o.setSize(e,t),s!==null&&s.setSize(e,t),c!==null&&c.setSize(e,t);for(let n=0;n<y.length;n++){let r=y[n];r.setSize&&r.setSize(e,t)}},this.setEffects=function(e){y=e,b=y.length>0&&y[0].isRenderPass===!0;let t=o.width,n=o.height;y.length>0&&s===null&&(s=new ee(t,n,{type:at,depthBuffer:!1,stencilBuffer:!1}),c=new ee(t,n,{type:at,depthBuffer:!1,stencilBuffer:!1}));for(let e=0;e<y.length;e++){let r=y[e];r.setSize&&r.setSize(t,n)}},this.begin=function(e,t){if(g||e.toneMapping===0&&y.length===0)return!1;if(v=t,t!==null){let e=t.width,n=t.height;(o.width!==e||o.height!==n)&&this.setSize(e,n)}return b===!1&&e.setRenderTarget(o),_=e.toneMapping,e.toneMapping=0,!0},this.hasRenderPass=function(){return b},this.end=function(e,t){e.toneMapping=_,g=!0;let n=o,r=s;for(let i=0;i<y.length;i++){let a=y[i];a.enabled!==!1&&(a.render(e,r,n,t),a.needsSwap!==!1&&(n=r,r=r===s?c:s))}if(m!==e.outputColorSpace||h!==e.toneMapping){m=e.outputColorSpace,h=e.toneMapping,u.defines={},Fn.getTransfer(m)===`srgb`&&(u.defines.SRGB_TRANSFER=``);let t=wr[h];t&&(u.defines[t]=``),u.needsUpdate=!0}u.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(v),e.render(f,p),v=null,g=!1},this.isCompositing=function(){return g},this.dispose=function(){o.dispose(),s!==null&&s.dispose(),c!==null&&c.dispose(),l.dispose(),u.dispose()}}var Er=new Ve,Dr=new Fe(1,1),Or=new en,kr=new P,Ar=new Oe,jr=[],Mr=[],Nr=new Float32Array(16),Pr=new Float32Array(9),Fr=new Float32Array(4);function Ir(e,t,n){let r=e[0];if(r<=0||r>0)return e;let i=t*n,a=jr[i];if(a===void 0&&(a=new Float32Array(i),jr[i]=a),t!==0){r.toArray(a,0);for(let r=1,i=0;r!==t;++r)i+=n,e[r].toArray(a,i)}return a}function Lr(e,t){if(e.length!==t.length)return!1;for(let n=0,r=e.length;n<r;n++)if(e[n]!==t[n])return!1;return!0}function Rr(e,t){for(let n=0,r=t.length;n<r;n++)e[n]=t[n]}function zr(e,t){let n=Mr[t];n===void 0&&(n=new Int32Array(t),Mr[t]=n);for(let r=0;r!==t;++r)n[r]=e.allocateTextureUnit();return n}function Br(e,t){let n=this.cache;n[0]!==t&&(e.uniform1f(this.addr,t),n[0]=t)}function Vr(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2f(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(Lr(n,t))return;e.uniform2fv(this.addr,t),Rr(n,t)}}function Hr(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3f(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else if(t.r!==void 0)(n[0]!==t.r||n[1]!==t.g||n[2]!==t.b)&&(e.uniform3f(this.addr,t.r,t.g,t.b),n[0]=t.r,n[1]=t.g,n[2]=t.b);else{if(Lr(n,t))return;e.uniform3fv(this.addr,t),Rr(n,t)}}function Ur(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4f(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(Lr(n,t))return;e.uniform4fv(this.addr,t),Rr(n,t)}}function Wr(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(Lr(n,t))return;e.uniformMatrix2fv(this.addr,!1,t),Rr(n,t)}else{if(Lr(n,r))return;Fr.set(r),e.uniformMatrix2fv(this.addr,!1,Fr),Rr(n,r)}}function Gr(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(Lr(n,t))return;e.uniformMatrix3fv(this.addr,!1,t),Rr(n,t)}else{if(Lr(n,r))return;Pr.set(r),e.uniformMatrix3fv(this.addr,!1,Pr),Rr(n,r)}}function Kr(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(Lr(n,t))return;e.uniformMatrix4fv(this.addr,!1,t),Rr(n,t)}else{if(Lr(n,r))return;Nr.set(r),e.uniformMatrix4fv(this.addr,!1,Nr),Rr(n,r)}}function qr(e,t){let n=this.cache;n[0]!==t&&(e.uniform1i(this.addr,t),n[0]=t)}function Jr(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2i(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(Lr(n,t))return;e.uniform2iv(this.addr,t),Rr(n,t)}}function Yr(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3i(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(Lr(n,t))return;e.uniform3iv(this.addr,t),Rr(n,t)}}function Xr(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4i(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(Lr(n,t))return;e.uniform4iv(this.addr,t),Rr(n,t)}}function Zr(e,t){let n=this.cache;n[0]!==t&&(e.uniform1ui(this.addr,t),n[0]=t)}function Qr(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2ui(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(Lr(n,t))return;e.uniform2uiv(this.addr,t),Rr(n,t)}}function $r(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3ui(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(Lr(n,t))return;e.uniform3uiv(this.addr,t),Rr(n,t)}}function ei(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(Lr(n,t))return;e.uniform4uiv(this.addr,t),Rr(n,t)}}function ti(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i);let a;this.type===e.SAMPLER_2D_SHADOW?(Dr.compareFunction=n.isReversedDepthBuffer()?518:515,a=Dr):a=Er,n.setTexture2D(t||a,i)}function ni(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture3D(t||kr,i)}function ri(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTextureCube(t||Ar,i)}function ii(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture2DArray(t||Or,i)}function ai(e){switch(e){case 5126:return Br;case 35664:return Vr;case 35665:return Hr;case 35666:return Ur;case 35674:return Wr;case 35675:return Gr;case 35676:return Kr;case 5124:case 35670:return qr;case 35667:case 35671:return Jr;case 35668:case 35672:return Yr;case 35669:case 35673:return Xr;case 5125:return Zr;case 36294:return Qr;case 36295:return $r;case 36296:return ei;case 35678:case 36198:case 36298:case 36306:case 35682:return ti;case 35679:case 36299:case 36307:return ni;case 35680:case 36300:case 36308:case 36293:return ri;case 36289:case 36303:case 36311:case 36292:return ii}}function oi(e,t){e.uniform1fv(this.addr,t)}function si(e,t){let n=Ir(t,this.size,2);e.uniform2fv(this.addr,n)}function ci(e,t){let n=Ir(t,this.size,3);e.uniform3fv(this.addr,n)}function li(e,t){let n=Ir(t,this.size,4);e.uniform4fv(this.addr,n)}function ui(e,t){let n=Ir(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,n)}function di(e,t){let n=Ir(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,n)}function fi(e,t){let n=Ir(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,n)}function pi(e,t){e.uniform1iv(this.addr,t)}function mi(e,t){e.uniform2iv(this.addr,t)}function hi(e,t){e.uniform3iv(this.addr,t)}function gi(e,t){e.uniform4iv(this.addr,t)}function _i(e,t){e.uniform1uiv(this.addr,t)}function vi(e,t){e.uniform2uiv(this.addr,t)}function yi(e,t){e.uniform3uiv(this.addr,t)}function bi(e,t){e.uniform4uiv(this.addr,t)}function xi(e,t,n){let r=this.cache,i=t.length,a=zr(n,i);Lr(r,a)||(e.uniform1iv(this.addr,a),Rr(r,a));let o;o=this.type===e.SAMPLER_2D_SHADOW?Dr:Er;for(let e=0;e!==i;++e)n.setTexture2D(t[e]||o,a[e])}function Si(e,t,n){let r=this.cache,i=t.length,a=zr(n,i);Lr(r,a)||(e.uniform1iv(this.addr,a),Rr(r,a));for(let e=0;e!==i;++e)n.setTexture3D(t[e]||kr,a[e])}function Ci(e,t,n){let r=this.cache,i=t.length,a=zr(n,i);Lr(r,a)||(e.uniform1iv(this.addr,a),Rr(r,a));for(let e=0;e!==i;++e)n.setTextureCube(t[e]||Ar,a[e])}function wi(e,t,n){let r=this.cache,i=t.length,a=zr(n,i);Lr(r,a)||(e.uniform1iv(this.addr,a),Rr(r,a));for(let e=0;e!==i;++e)n.setTexture2DArray(t[e]||Or,a[e])}function Ti(e){switch(e){case 5126:return oi;case 35664:return si;case 35665:return ci;case 35666:return li;case 35674:return ui;case 35675:return di;case 35676:return fi;case 5124:case 35670:return pi;case 35667:case 35671:return mi;case 35668:case 35672:return hi;case 35669:case 35673:return gi;case 5125:return _i;case 36294:return vi;case 36295:return yi;case 36296:return bi;case 35678:case 36198:case 36298:case 36306:case 35682:return xi;case 35679:case 36299:case 36307:return Si;case 35680:case 36300:case 36308:case 36293:return Ci;case 36289:case 36303:case 36311:case 36292:return wi}}var Ei=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=ai(t.type)}},Di=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Ti(t.type)}},Oi=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let r=this.seq;for(let i=0,a=r.length;i!==a;++i){let a=r[i];a.setValue(e,t[a.id],n)}}},ki=/(\w+)(\])?(\[|\.)?/g;function Ai(e,t){e.seq.push(t),e.map[t.id]=t}function ji(e,t,n){let r=e.name,i=r.length;for(ki.lastIndex=0;;){let a=ki.exec(r),o=ki.lastIndex,s=a[1],c=a[2]===`]`,l=a[3];if(c&&(s|=0),l===void 0||l===`[`&&o+2===i){Ai(n,l===void 0?new Ei(s,e,t):new Di(s,e,t));break}{let e=n.map[s];e===void 0&&(e=new Oi(s),Ai(n,e)),n=e}}}var Mi=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let r=0;r<n;++r){let n=e.getActiveUniform(t,r);ji(n,e.getUniformLocation(t,n.name),this)}let r=[],i=[];for(let t of this.seq)t.type===e.SAMPLER_2D_SHADOW||t.type===e.SAMPLER_CUBE_SHADOW||t.type===e.SAMPLER_2D_ARRAY_SHADOW?r.push(t):i.push(t);r.length>0&&(this.seq=r.concat(i))}setValue(e,t,n,r){let i=this.map[t];i!==void 0&&i.setValue(e,n,r)}setOptional(e,t,n){let r=t[n];r!==void 0&&this.setValue(e,n,r)}static upload(e,t,n,r){for(let i=0,a=t.length;i!==a;++i){let a=t[i],o=n[a.id];o.needsUpdate!==!1&&a.setValue(e,o.value,r)}}static seqWithValue(e,t){let n=[];for(let r=0,i=e.length;r!==i;++r){let i=e[r];i.id in t&&n.push(i)}return n}};function Ni(e,t,n){let r=e.createShader(t);return e.shaderSource(r,n),e.compileShader(r),r}var Pi=37297,Fi=0;function Ii(e,t){let n=e.split(`
`),r=[],i=Math.max(t-6,0),a=Math.min(t+6,n.length);for(let e=i;e<a;e++){let i=e+1;r.push(`${i===t?`>`:` `} ${i}: ${n[e]}`)}return r.join(`
`)}var Li=new H;function Ri(e){Fn._getMatrix(Li,Fn.workingColorSpace,e);let t=`mat3( ${Li.elements.map(e=>e.toFixed(4))} )`;switch(Fn.getTransfer(e)){case ae:return[t,`LinearTransferOETF`];case Yt:return[t,`sRGBTransferOETF`];default:return q(`WebGLProgram: Unsupported color space: `,e),[t,`LinearTransferOETF`]}}function zi(e,t,n){let r=e.getShaderParameter(t,e.COMPILE_STATUS),i=(e.getShaderInfoLog(t)||``).trim();if(r&&i===``)return``;let a=/ERROR: 0:(\d+)/.exec(i);if(a){let r=parseInt(a[1]);return n.toUpperCase()+`

`+i+`

`+Ii(e.getShaderSource(t),r)}return i}function Bi(e,t){let n=Ri(t);return[`vec4 ${e}( vec4 value ) {`,`	return ${n[1]}( vec4( value.rgb * ${n[0]}, value.a ) );`,`}`].join(`
`)}var Vi={1:`Linear`,2:`Reinhard`,3:`Cineon`,4:`ACESFilmic`,6:`AgX`,7:`Neutral`,5:`Custom`};function Hi(e,t){let n=Vi[t];return n===void 0?(q(`WebGLProgram: Unsupported toneMapping:`,t),`vec3 `+e+`( vec3 color ) { return LinearToneMapping( color ); }`):`vec3 `+e+`( vec3 color ) { return `+n+`ToneMapping( color ); }`}var Ui=new R;function Wi(){return Fn.getLuminanceCoefficients(Ui),[`float luminance( const in vec3 rgb ) {`,`	const vec3 weights = vec3( ${Ui.x.toFixed(4)}, ${Ui.y.toFixed(4)}, ${Ui.z.toFixed(4)} );`,`	return dot( weights, rgb );`,`}`].join(`
`)}function Gi(e){return[e.extensionClipCullDistance?`#extension GL_ANGLE_clip_cull_distance : require`:``,e.extensionMultiDraw?`#extension GL_ANGLE_multi_draw : require`:``].filter(Ji).join(`
`)}function Ki(e){let t=[];for(let n in e){let r=e[n];r!==!1&&t.push(`#define `+n+` `+r)}return t.join(`
`)}function qi(e,t){let n={},r=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let i=0;i<r;i++){let r=e.getActiveAttrib(t,i),a=r.name,o=1;r.type===e.FLOAT_MAT2&&(o=2),r.type===e.FLOAT_MAT3&&(o=3),r.type===e.FLOAT_MAT4&&(o=4),n[a]={type:r.type,location:e.getAttribLocation(t,a),locationSize:o}}return n}function Ji(e){return e!==``}function Yi(e,t){let n=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_SUN_LIGHTS/g,t.numSunLights).replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,n).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,t.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function Xi(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var Zi=/^[ \t]*#include +<([\w\d./]+)>/gm;function Qi(e){return e.replace(Zi,ea)}var $i=new Map;function ea(e,t){let n=Y[t];if(n===void 0){let e=$i.get(t);if(e!==void 0)n=Y[e],q(`WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.`,t,e);else throw Error(`THREE.WebGLProgram: Can not resolve #include <`+t+`>`)}return Qi(n)}var ta=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function na(e){return e.replace(ta,ra)}function ra(e,t,n,r){let i=``;for(let e=parseInt(t);e<parseInt(n);e++)i+=r.replace(/\[\s*i\s*\]/g,`[ `+e+` ]`).replace(/UNROLLED_LOOP_INDEX/g,e);return i}function ia(e){let t=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision===`highp`?t+=`
#define HIGH_PRECISION`:e.precision===`mediump`?t+=`
#define MEDIUM_PRECISION`:e.precision===`lowp`&&(t+=`
#define LOW_PRECISION`),t}var aa={1:`SHADOWMAP_TYPE_PCF`,3:`SHADOWMAP_TYPE_VSM`};function oa(e){return aa[e.shadowMapType]||`SHADOWMAP_TYPE_BASIC`}var sa={301:`ENVMAP_TYPE_CUBE`,302:`ENVMAP_TYPE_CUBE`,306:`ENVMAP_TYPE_CUBE_UV`};function ca(e){return e.envMap===!1?`ENVMAP_TYPE_CUBE`:sa[e.envMapMode]||`ENVMAP_TYPE_CUBE`}var la={302:`ENVMAP_MODE_REFRACTION`};function ua(e){return e.envMap===!1?`ENVMAP_MODE_REFLECTION`:la[e.envMapMode]||`ENVMAP_MODE_REFLECTION`}var da={0:`ENVMAP_BLENDING_MULTIPLY`,1:`ENVMAP_BLENDING_MIX`,2:`ENVMAP_BLENDING_ADD`};function fa(e){return e.envMap===!1?`ENVMAP_BLENDING_NONE`:da[e.combine]||`ENVMAP_BLENDING_NONE`}function pa(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let n=Math.log2(t)-2,r=1/t;return{texelWidth:1/(3*Math.max(2**n,112)),texelHeight:r,maxMip:n}}function ma(e,t,n,r){let i=e.getContext(),a=n.defines,o=n.vertexShader,s=n.fragmentShader,c=oa(n),l=ca(n),u=ua(n),d=fa(n),f=pa(n),p=Gi(n),m=Ki(a),h=i.createProgram(),g,_,v=n.glslVersion?`#version `+n.glslVersion+`
`:``;n.isRawShaderMaterial?(g=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(Ji).join(`
`),g.length>0&&(g+=`
`),_=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(Ji).join(`
`),_.length>0&&(_+=`
`)):(g=[ia(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.extensionClipCullDistance?`#define USE_CLIP_DISTANCE`:``,n.batching?`#define USE_BATCHING`:``,n.batchingColor?`#define USE_BATCHING_COLOR`:``,n.instancing?`#define USE_INSTANCING`:``,n.instancingColor?`#define USE_INSTANCING_COLOR`:``,n.instancingMorph?`#define USE_INSTANCING_MORPH`:``,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.map?`#define USE_MAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+u:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.displacementMap?`#define USE_DISPLACEMENTMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.mapUv?`#define MAP_UV `+n.mapUv:``,n.alphaMapUv?`#define ALPHAMAP_UV `+n.alphaMapUv:``,n.lightMapUv?`#define LIGHTMAP_UV `+n.lightMapUv:``,n.aoMapUv?`#define AOMAP_UV `+n.aoMapUv:``,n.emissiveMapUv?`#define EMISSIVEMAP_UV `+n.emissiveMapUv:``,n.bumpMapUv?`#define BUMPMAP_UV `+n.bumpMapUv:``,n.normalMapUv?`#define NORMALMAP_UV `+n.normalMapUv:``,n.displacementMapUv?`#define DISPLACEMENTMAP_UV `+n.displacementMapUv:``,n.metalnessMapUv?`#define METALNESSMAP_UV `+n.metalnessMapUv:``,n.roughnessMapUv?`#define ROUGHNESSMAP_UV `+n.roughnessMapUv:``,n.anisotropyMapUv?`#define ANISOTROPYMAP_UV `+n.anisotropyMapUv:``,n.clearcoatMapUv?`#define CLEARCOATMAP_UV `+n.clearcoatMapUv:``,n.clearcoatNormalMapUv?`#define CLEARCOAT_NORMALMAP_UV `+n.clearcoatNormalMapUv:``,n.clearcoatRoughnessMapUv?`#define CLEARCOAT_ROUGHNESSMAP_UV `+n.clearcoatRoughnessMapUv:``,n.iridescenceMapUv?`#define IRIDESCENCEMAP_UV `+n.iridescenceMapUv:``,n.iridescenceThicknessMapUv?`#define IRIDESCENCE_THICKNESSMAP_UV `+n.iridescenceThicknessMapUv:``,n.sheenColorMapUv?`#define SHEEN_COLORMAP_UV `+n.sheenColorMapUv:``,n.sheenRoughnessMapUv?`#define SHEEN_ROUGHNESSMAP_UV `+n.sheenRoughnessMapUv:``,n.specularMapUv?`#define SPECULARMAP_UV `+n.specularMapUv:``,n.specularColorMapUv?`#define SPECULAR_COLORMAP_UV `+n.specularColorMapUv:``,n.specularIntensityMapUv?`#define SPECULAR_INTENSITYMAP_UV `+n.specularIntensityMapUv:``,n.transmissionMapUv?`#define TRANSMISSIONMAP_UV `+n.transmissionMapUv:``,n.thicknessMapUv?`#define THICKNESSMAP_UV `+n.thicknessMapUv:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexNormals?`#define HAS_NORMAL`:``,n.vertexColors?`#define USE_COLOR`:``,n.vertexAlphas?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.flatShading?`#define FLAT_SHADED`:``,n.skinning?`#define USE_SKINNING`:``,n.morphTargets?`#define USE_MORPHTARGETS`:``,n.morphNormals&&n.flatShading===!1?`#define USE_MORPHNORMALS`:``,n.morphColors?`#define USE_MORPHCOLORS`:``,n.morphTargetsCount>0?`#define MORPHTARGETS_TEXTURE_STRIDE `+n.morphTextureStride:``,n.morphTargetsCount>0?`#define MORPHTARGETS_COUNT `+n.morphTargetsCount:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.sizeAttenuation?`#define USE_SIZEATTENUATION`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 modelMatrix;`,`uniform mat4 modelViewMatrix;`,`uniform mat4 projectionMatrix;`,`uniform mat4 viewMatrix;`,`uniform mat3 normalMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,`#ifdef USE_INSTANCING`,`	attribute mat4 instanceMatrix;`,`#endif`,`#ifdef USE_INSTANCING_COLOR`,`	attribute vec3 instanceColor;`,`#endif`,`#ifdef USE_INSTANCING_MORPH`,`	uniform sampler2D morphTexture;`,`#endif`,`attribute vec3 position;`,`attribute vec3 normal;`,`attribute vec2 uv;`,`#ifdef USE_UV1`,`	attribute vec2 uv1;`,`#endif`,`#ifdef USE_UV2`,`	attribute vec2 uv2;`,`#endif`,`#ifdef USE_UV3`,`	attribute vec2 uv3;`,`#endif`,`#ifdef USE_TANGENT`,`	attribute vec4 tangent;`,`#endif`,`#if defined( USE_COLOR_ALPHA )`,`	attribute vec4 color;`,`#elif defined( USE_COLOR )`,`	attribute vec3 color;`,`#endif`,`#ifdef USE_SKINNING`,`	attribute vec4 skinIndex;`,`	attribute vec4 skinWeight;`,`#endif`,`
`].filter(Ji).join(`
`),_=[ia(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.alphaToCoverage?`#define ALPHA_TO_COVERAGE`:``,n.map?`#define USE_MAP`:``,n.matcap?`#define USE_MATCAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+l:``,n.envMap?`#define `+u:``,n.envMap?`#define `+d:``,f?`#define CUBEUV_TEXEL_WIDTH `+f.texelWidth:``,f?`#define CUBEUV_TEXEL_HEIGHT `+f.texelHeight:``,f?`#define CUBEUV_MAX_MIP `+f.maxMip+`.0`:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.packedNormalMap?`#define USE_PACKED_NORMALMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoat?`#define USE_CLEARCOAT`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.dispersion?`#define USE_DISPERSION`:``,n.retroreflection?`#define USE_RETROREFLECTION`:``,n.iridescence?`#define USE_IRIDESCENCE`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaTest?`#define USE_ALPHATEST`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.sheen?`#define USE_SHEEN`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexColors||n.instancingColor?`#define USE_COLOR`:``,n.vertexAlphas||n.batchingColor?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.gradientMap?`#define USE_GRADIENTMAP`:``,n.flatShading?`#define FLAT_SHADED`:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.premultipliedAlpha?`#define PREMULTIPLIED_ALPHA`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.numLightProbeGrids>0?`#define USE_LIGHT_PROBES_GRID`:``,n.decodeVideoTexture?`#define DECODE_VIDEO_TEXTURE`:``,n.decodeVideoTextureEmissive?`#define DECODE_VIDEO_TEXTURE_EMISSIVE`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 viewMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,n.toneMapping===0?``:`#define TONE_MAPPING`,n.toneMapping===0?``:Y.tonemapping_pars_fragment,n.toneMapping===0?``:Hi(`toneMapping`,n.toneMapping),n.dithering?`#define DITHERING`:``,n.opaque?`#define OPAQUE`:``,Y.colorspace_pars_fragment,Bi(`linearToOutputTexel`,n.outputColorSpace),Wi(),n.useDepthPacking?`#define DEPTH_PACKING `+n.depthPacking:``,`
`].filter(Ji).join(`
`)),o=Qi(o),o=Yi(o,n),o=Xi(o,n),s=Qi(s),s=Yi(s,n),s=Xi(s,n),o=na(o),s=na(s),n.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,g=[p,`#define attribute in`,`#define varying out`,`#define texture2D texture`].join(`
`)+`
`+g,_=[`#define varying in`,n.glslVersion===`300 es`?``:`layout(location = 0) out highp vec4 pc_fragColor;`,n.glslVersion===`300 es`?``:`#define gl_FragColor pc_fragColor`,`#define gl_FragDepthEXT gl_FragDepth`,`#define texture2D texture`,`#define textureCube texture`,`#define texture2DProj textureProj`,`#define texture2DLodEXT textureLod`,`#define texture2DProjLodEXT textureProjLod`,`#define textureCubeLodEXT textureLod`,`#define texture2DGradEXT textureGrad`,`#define texture2DProjGradEXT textureProjGrad`,`#define textureCubeGradEXT textureGrad`].join(`
`)+`
`+_);let y=v+g+o,b=v+_+s,x=Ni(i,i.VERTEX_SHADER,y),S=Ni(i,i.FRAGMENT_SHADER,b);i.attachShader(h,x),i.attachShader(h,S),n.index0AttributeName===void 0?n.hasPositionAttribute===!0&&i.bindAttribLocation(h,0,`position`):i.bindAttribLocation(h,0,n.index0AttributeName),i.linkProgram(h);function C(t){if(e.debug.checkShaderErrors){let n=i.getProgramInfoLog(h)||``,r=i.getShaderInfoLog(x)||``,a=i.getShaderInfoLog(S)||``,o=n.trim(),s=r.trim(),c=a.trim(),l=!0,u=!0;if(i.getProgramParameter(h,i.LINK_STATUS)===!1){if(l=!1,typeof e.debug.onShaderError==`function`)e.debug.onShaderError(i,h,x,S);else{let e=zi(i,x,`vertex`),n=zi(i,S,`fragment`);Ee(`WebGLProgram: Shader Error `+i.getError()+` - VALIDATE_STATUS `+i.getProgramParameter(h,i.VALIDATE_STATUS)+`

Material Name: `+t.name+`
Material Type: `+t.type+`

Program Info Log: `+o+`
`+e+`
`+n)}}else o===``?(s===``||c===``)&&(u=!1):q(`WebGLProgram: Program Info Log:`,o);u&&(t.diagnostics={runnable:l,programLog:o,vertexShader:{log:s,prefix:g},fragmentShader:{log:c,prefix:_}})}i.deleteShader(x),i.deleteShader(S),w=new Mi(i,h),T=qi(i,h)}let w;this.getUniforms=function(){return w===void 0&&C(this),w};let T;this.getAttributes=function(){return T===void 0&&C(this),T};let E=n.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return E===!1&&(E=i.getProgramParameter(h,Pi)),E},this.destroy=function(){r.releaseStatesOfProgram(this),i.deleteProgram(h),this.program=void 0},this.type=n.shaderType,this.name=n.shaderName,this.id=Fi++,this.cacheKey=t,this.usedTimes=1,this.program=h,this.vertexShader=x,this.fragmentShader=S,this}var ha=0,ga=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){let r=this._getShaderCacheForMaterial(e);return r.has(t)===!1&&(r.add(t),t.usedTimes++),r.has(n)===!1&&(r.add(n),n.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let e of t)e.usedTimes--,e.usedTimes===0&&this.shaderCache.delete(e.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new _a(e),t.set(e,n)),n}},_a=class{constructor(e){this.id=ha++,this.code=e,this.usedTimes=0}};function va(e){return e===1030||e===37490||e===36285}function ya(e,t,n,r,i,a){let o=new p,s=new ga,c=new Set,l=[],u=new Map,d=r.logarithmicDepthBuffer,f=r.precision,m={MeshDepthMaterial:`depth`,MeshDistanceMaterial:`distance`,MeshNormalMaterial:`normal`,MeshBasicMaterial:`basic`,MeshLambertMaterial:`lambert`,MeshPhongMaterial:`phong`,MeshToonMaterial:`toon`,MeshStandardMaterial:`physical`,MeshPhysicalMaterial:`physical`,MeshMatcapMaterial:`matcap`,LineBasicMaterial:`basic`,LineDashedMaterial:`dashed`,PointsMaterial:`points`,ShadowMaterial:`shadow`,SpriteMaterial:`sprite`};function h(e){return c.add(e),e===0?`uv`:`uv${e}`}function g(i,o,l,u,p,g){let _=u.fog,v=p.geometry,y=i.isMeshStandardMaterial||i.isMeshLambertMaterial||i.isMeshPhongMaterial?u.environment:null,b=i.isMeshStandardMaterial||i.isMeshLambertMaterial&&!i.envMap||i.isMeshPhongMaterial&&!i.envMap,x=t.get(i.envMap||y,b),S=x&&x.mapping===306?x.image.height:null,C=m[i.type];i.precision!==null&&(f=r.getMaxPrecision(i.precision),f!==i.precision&&q(`WebGLProgram.getParameters:`,i.precision,`not supported, using`,f,`instead.`));let w=v.morphAttributes.position||v.morphAttributes.normal||v.morphAttributes.color,T=w===void 0?0:w.length,E=0;v.morphAttributes.position!==void 0&&(E=1),v.morphAttributes.normal!==void 0&&(E=2),v.morphAttributes.color!==void 0&&(E=3);let D,O,ee,k;if(C){let e=Bn[C];D=e.vertexShader,O=e.fragmentShader}else{D=i.vertexShader,O=i.fragmentShader;let e=s.getVertexShaderStage(i),t=s.getFragmentShaderStage(i);s.update(i,e,t),ee=e.id,k=t.id}let A=e.getRenderTarget(),j=e.state.buffers.depth.getReversed(),M=p.isInstancedMesh===!0,N=p.isBatchedMesh===!0,P=!!i.map,te=!!i.matcap,ne=!!x,re=!!i.aoMap,F=!!i.lightMap,ie=!!i.bumpMap&&i.wireframe===!1,I=!!i.normalMap,L=!!i.displacementMap,R=!!i.emissiveMap,ae=!!i.metalnessMap,z=!!i.roughnessMap,oe=i.anisotropy>0,se=i.clearcoat>0,ce=i.dispersion>0,le=i.retroreflectivity>0,ue=i.iridescence>0,de=i.sheen>0,B=i.transmission>0,fe=oe&&!!i.anisotropyMap,pe=se&&!!i.clearcoatMap,me=se&&!!i.clearcoatNormalMap,he=se&&!!i.clearcoatRoughnessMap,V=ue&&!!i.iridescenceMap,ge=ue&&!!i.iridescenceThicknessMap,H=de&&!!i.sheenColorMap,_e=de&&!!i.sheenRoughnessMap,ve=!!i.specularMap,ye=!!i.specularColorMap,be=!!i.specularIntensityMap,xe=B&&!!i.transmissionMap,Se=B&&!!i.thicknessMap,Ce=!!i.gradientMap,we=!!i.alphaMap,Te=i.alphaTest>0,U=!!i.alphaHash,Ee=!!i.extensions,De=0;i.toneMapped&&(A===null||A.isXRRenderTarget===!0)&&(De=e.toneMapping);let Oe={shaderID:C,shaderType:i.type,shaderName:i.name,vertexShader:D,fragmentShader:O,defines:i.defines,customVertexShaderID:ee,customFragmentShaderID:k,isRawShaderMaterial:i.isRawShaderMaterial===!0,glslVersion:i.glslVersion,precision:f,batching:N,batchingColor:N&&p._colorsTexture!==null,instancing:M,instancingColor:M&&p.instanceColor!==null,instancingMorph:M&&p.morphTexture!==null,outputColorSpace:A===null?e.outputColorSpace:A.isXRRenderTarget===!0?A.texture.colorSpace:Fn.workingColorSpace,alphaToCoverage:!!i.alphaToCoverage,map:P,matcap:te,envMap:ne,envMapMode:ne&&x.mapping,envMapCubeUVHeight:S,aoMap:re,lightMap:F,bumpMap:ie,normalMap:I,displacementMap:L,emissiveMap:R,normalMapObjectSpace:I&&i.normalMapType===1,normalMapTangentSpace:I&&i.normalMapType===0,packedNormalMap:I&&i.normalMapType===0&&va(i.normalMap.format),metalnessMap:ae,roughnessMap:z,anisotropy:oe,anisotropyMap:fe,clearcoat:se,clearcoatMap:pe,clearcoatNormalMap:me,clearcoatRoughnessMap:he,dispersion:ce,retroreflection:le,iridescence:ue,iridescenceMap:V,iridescenceThicknessMap:ge,sheen:de,sheenColorMap:H,sheenRoughnessMap:_e,specularMap:ve,specularColorMap:ye,specularIntensityMap:be,transmission:B,transmissionMap:xe,thicknessMap:Se,gradientMap:Ce,opaque:i.transparent===!1&&i.blending===1&&i.alphaToCoverage===!1,alphaMap:we,alphaTest:Te,alphaHash:U,combine:i.combine,mapUv:P&&h(i.map.channel),aoMapUv:re&&h(i.aoMap.channel),lightMapUv:F&&h(i.lightMap.channel),bumpMapUv:ie&&h(i.bumpMap.channel),normalMapUv:I&&h(i.normalMap.channel),displacementMapUv:L&&h(i.displacementMap.channel),emissiveMapUv:R&&h(i.emissiveMap.channel),metalnessMapUv:ae&&h(i.metalnessMap.channel),roughnessMapUv:z&&h(i.roughnessMap.channel),anisotropyMapUv:fe&&h(i.anisotropyMap.channel),clearcoatMapUv:pe&&h(i.clearcoatMap.channel),clearcoatNormalMapUv:me&&h(i.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:he&&h(i.clearcoatRoughnessMap.channel),iridescenceMapUv:V&&h(i.iridescenceMap.channel),iridescenceThicknessMapUv:ge&&h(i.iridescenceThicknessMap.channel),sheenColorMapUv:H&&h(i.sheenColorMap.channel),sheenRoughnessMapUv:_e&&h(i.sheenRoughnessMap.channel),specularMapUv:ve&&h(i.specularMap.channel),specularColorMapUv:ye&&h(i.specularColorMap.channel),specularIntensityMapUv:be&&h(i.specularIntensityMap.channel),transmissionMapUv:xe&&h(i.transmissionMap.channel),thicknessMapUv:Se&&h(i.thicknessMap.channel),alphaMapUv:we&&h(i.alphaMap.channel),vertexTangents:!!v.attributes.tangent&&(I||oe),vertexNormals:!!v.attributes.normal,vertexColors:i.vertexColors,vertexAlphas:i.vertexColors===!0&&!!v.attributes.color&&v.attributes.color.itemSize===4,pointsUvs:p.isPoints===!0&&!!v.attributes.uv&&(P||we),fog:!!_,useFog:i.fog===!0,fogExp2:!!_&&_.isFogExp2,flatShading:i.wireframe===!1&&(i.flatShading===!0||v.attributes.normal===void 0&&I===!1&&(i.isMeshLambertMaterial||i.isMeshPhongMaterial||i.isMeshStandardMaterial||i.isMeshPhysicalMaterial)),sizeAttenuation:i.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:j,skinning:p.isSkinnedMesh===!0,hasPositionAttribute:v.attributes.position!==void 0,morphTargets:v.morphAttributes.position!==void 0,morphNormals:v.morphAttributes.normal!==void 0,morphColors:v.morphAttributes.color!==void 0,morphTargetsCount:T,morphTextureStride:E,numSunLights:o.sun.length,numDirLights:o.directional.length,numPointLights:o.point.length,numSpotLights:o.spot.length,numSpotLightMaps:o.spotLightMap.length,numRectAreaLights:o.rectArea.length,numHemiLights:o.hemi.length,numSunLightShadows:o.sunShadowMap.length,numDirLightShadows:o.directionalShadowMap.length,numPointLightShadows:o.pointShadowMap.length,numSpotLightShadows:o.spotShadowMap.length,numSpotLightShadowsWithMaps:o.numSpotLightShadowsWithMaps,numLightProbes:o.numLightProbes,numLightProbeGrids:g.length,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:i.dithering,shadowMapEnabled:e.shadowMap.enabled&&l.length>0,shadowMapType:e.shadowMap.type,toneMapping:De,decodeVideoTexture:P&&i.map.isVideoTexture===!0&&Fn.getTransfer(i.map.colorSpace)===`srgb`,decodeVideoTextureEmissive:R&&i.emissiveMap.isVideoTexture===!0&&Fn.getTransfer(i.emissiveMap.colorSpace)===`srgb`,premultipliedAlpha:i.premultipliedAlpha,doubleSided:i.side===2,flipSided:i.side===1,useDepthPacking:i.depthPacking>=0,depthPacking:i.depthPacking||0,index0AttributeName:i.index0AttributeName,extensionClipCullDistance:Ee&&i.extensions.clipCullDistance===!0&&n.has(`WEBGL_clip_cull_distance`),extensionMultiDraw:(Ee&&i.extensions.multiDraw===!0||N)&&n.has(`WEBGL_multi_draw`),rendererExtensionParallelShaderCompile:n.has(`KHR_parallel_shader_compile`),customProgramCacheKey:i.customProgramCacheKey()};return Oe.vertexUv1s=c.has(1),Oe.vertexUv2s=c.has(2),Oe.vertexUv3s=c.has(3),c.clear(),Oe}function _(t){let n=[];if(t.shaderID?n.push(t.shaderID):(n.push(t.customVertexShaderID),n.push(t.customFragmentShaderID)),t.defines!==void 0)for(let e in t.defines)n.push(e),n.push(t.defines[e]);return t.isRawShaderMaterial===!1&&(v(n,t),y(n,t),n.push(e.outputColorSpace)),n.push(t.customProgramCacheKey),n.join()}function v(e,t){e.push(t.precision),e.push(t.outputColorSpace),e.push(t.envMapMode),e.push(t.envMapCubeUVHeight),e.push(t.mapUv),e.push(t.alphaMapUv),e.push(t.lightMapUv),e.push(t.aoMapUv),e.push(t.bumpMapUv),e.push(t.normalMapUv),e.push(t.displacementMapUv),e.push(t.emissiveMapUv),e.push(t.metalnessMapUv),e.push(t.roughnessMapUv),e.push(t.anisotropyMapUv),e.push(t.clearcoatMapUv),e.push(t.clearcoatNormalMapUv),e.push(t.clearcoatRoughnessMapUv),e.push(t.iridescenceMapUv),e.push(t.iridescenceThicknessMapUv),e.push(t.sheenColorMapUv),e.push(t.sheenRoughnessMapUv),e.push(t.specularMapUv),e.push(t.specularColorMapUv),e.push(t.specularIntensityMapUv),e.push(t.transmissionMapUv),e.push(t.thicknessMapUv),e.push(t.combine),e.push(t.fogExp2),e.push(t.sizeAttenuation),e.push(t.morphTargetsCount),e.push(t.morphAttributeCount),e.push(t.numSunLights),e.push(t.numDirLights),e.push(t.numPointLights),e.push(t.numSpotLights),e.push(t.numSpotLightMaps),e.push(t.numHemiLights),e.push(t.numRectAreaLights),e.push(t.numSunLightShadows),e.push(t.numDirLightShadows),e.push(t.numPointLightShadows),e.push(t.numSpotLightShadows),e.push(t.numSpotLightShadowsWithMaps),e.push(t.numLightProbes),e.push(t.shadowMapType),e.push(t.toneMapping),e.push(t.numClippingPlanes),e.push(t.numClipIntersection),e.push(t.depthPacking)}function y(e,t){o.disableAll(),t.instancing&&o.enable(0),t.instancingColor&&o.enable(1),t.instancingMorph&&o.enable(2),t.matcap&&o.enable(3),t.envMap&&o.enable(4),t.normalMapObjectSpace&&o.enable(5),t.normalMapTangentSpace&&o.enable(6),t.clearcoat&&o.enable(7),t.iridescence&&o.enable(8),t.alphaTest&&o.enable(9),t.vertexColors&&o.enable(10),t.vertexAlphas&&o.enable(11),t.vertexUv1s&&o.enable(12),t.vertexUv2s&&o.enable(13),t.vertexUv3s&&o.enable(14),t.vertexTangents&&o.enable(15),t.anisotropy&&o.enable(16),t.alphaHash&&o.enable(17),t.batching&&o.enable(18),t.dispersion&&o.enable(19),t.retroreflection&&o.enable(24),t.batchingColor&&o.enable(20),t.gradientMap&&o.enable(21),t.packedNormalMap&&o.enable(22),t.vertexNormals&&o.enable(23),e.push(o.mask),o.disableAll(),t.fog&&o.enable(0),t.useFog&&o.enable(1),t.flatShading&&o.enable(2),t.logarithmicDepthBuffer&&o.enable(3),t.reversedDepthBuffer&&o.enable(4),t.skinning&&o.enable(5),t.morphTargets&&o.enable(6),t.morphNormals&&o.enable(7),t.morphColors&&o.enable(8),t.premultipliedAlpha&&o.enable(9),t.shadowMapEnabled&&o.enable(10),t.doubleSided&&o.enable(11),t.flipSided&&o.enable(12),t.useDepthPacking&&o.enable(13),t.dithering&&o.enable(14),t.transmission&&o.enable(15),t.sheen&&o.enable(16),t.opaque&&o.enable(17),t.pointsUvs&&o.enable(18),t.decodeVideoTexture&&o.enable(19),t.decodeVideoTextureEmissive&&o.enable(20),t.alphaToCoverage&&o.enable(21),t.numLightProbeGrids>0&&o.enable(22),t.hasPositionAttribute&&o.enable(23),e.push(o.mask)}function b(e){let t=m[e.type],n;if(t){let e=Bn[t];n=ve.clone(e.uniforms)}else n=e.uniforms;return n}function x(t,n){let r=u.get(n);return r===void 0?(r=new ma(e,n,t,i),l.push(r),u.set(n,r)):++r.usedTimes,r}function S(e){if(--e.usedTimes===0){let t=l.indexOf(e);l[t]=l[l.length-1],l.pop(),u.delete(e.cacheKey),e.destroy()}}function C(e){s.remove(e)}function w(){s.dispose()}return{getParameters:g,getProgramCacheKey:_,getUniforms:b,acquireProgram:x,releaseProgram:S,releaseShaderCache:C,programs:l,dispose:w}}function ba(){let e=new WeakMap;function t(t){return e.has(t)}function n(t){let n=e.get(t);return n===void 0&&(n={},e.set(t,n)),n}function r(t){e.delete(t)}function i(t,n,r){e.get(t)[n]=r}function a(){e=new WeakMap}return{has:t,get:n,remove:r,update:i,dispose:a}}function xa(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.material.id===t.material.id?e.materialVariant===t.materialVariant?e.z===t.z?e.id-t.id:e.z-t.z:e.materialVariant-t.materialVariant:e.material.id-t.material.id:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function Sa(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.z===t.z?e.id-t.id:t.z-e.z:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function Ca(){let e=[],t=0,n=[],r=[],i=[];function a(){t=0,n.length=0,r.length=0,i.length=0}function o(e){let t=0;return e.isInstancedMesh&&(t+=2),e.isSkinnedMesh&&(t+=1),t}function s(n,r,i,a,s,c){let l=e[t];return l===void 0?(l={id:n.id,object:n,geometry:r,material:i,materialVariant:o(n),groupOrder:a,renderOrder:n.renderOrder,z:s,group:c},e[t]=l):(l.id=n.id,l.object=n,l.geometry=r,l.material=i,l.materialVariant=o(n),l.groupOrder=a,l.renderOrder=n.renderOrder,l.z=s,l.group=c),t++,l}function c(e,t,a,o,c,l,u){u.reversedDepth===!0&&(c=-c);let d=s(e,t,a,o,c,l);a.transmission>0?r.push(d):a.transparent===!0?i.push(d):n.push(d)}function l(e,t,a,o,c,l){let u=s(e,t,a,o,c,l);a.transmission>0?r.unshift(u):a.transparent===!0?i.unshift(u):n.unshift(u)}function u(e,t){n.length>1&&n.sort(e||xa),r.length>1&&r.sort(t||Sa),i.length>1&&i.sort(t||Sa)}function d(){for(let n=t,r=e.length;n<r;n++){let t=e[n];if(t.id===null)break;t.id=null,t.object=null,t.geometry=null,t.material=null,t.group=null}}return{opaque:n,transmissive:r,transparent:i,init:a,push:c,unshift:l,finish:d,sort:u}}function wa(){let e=new WeakMap;function t(t,n){let r=e.get(t),i;return r===void 0?(i=new Ca,e.set(t,[i])):n>=r.length?(i=new Ca,r.push(i)):i=r[n],i}function n(){e=new WeakMap}return{get:t,dispose:n}}function Ta(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`SunLight`:case`DirectionalLight`:n={direction:new R,color:new V};break;case`SpotLight`:n={position:new R,direction:new R,color:new V,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case`PointLight`:n={position:new R,color:new V,distance:0,decay:0};break;case`HemisphereLight`:n={direction:new R,skyColor:new V,groundColor:new V};break;case`RectAreaLight`:n={color:new V,position:new R,halfWidth:new R,halfHeight:new R}}return e[t.id]=n,n}}}function Ea(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`SunLight`:case`DirectionalLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new kt};break;case`SpotLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new kt};break;case`PointLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new kt,shadowCameraNear:1,shadowCameraFar:1e3}}return e[t.id]=n,n}}}var Da=0;function Oa(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+ +!!t.map-!!e.map}function ka(e){let t=new Ta,n=Ea(),r={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let e=0;e<9;e++)r.probe.push(new R);let i=new R,a=new Ln,o=new Ln;function s(i){let a=0,o=0,s=0;for(let e=0;e<9;e++)r.probe[e].set(0,0,0);let c=0,l=0,u=0,d=0,f=0,p=0,m=0,h=0,g=0,_=0,v=0,y=0,b=0,x=0;i.sort(Oa);for(let e=0,S=i.length;e<S;e++){let S=i[e],C=S.color,w=S.intensity,T=S.distance,E=null;if(S.shadow&&S.shadow.map&&(E=S.shadow.map.texture.format===1030?S.shadow.map.texture:S.shadow.map.depthTexture||S.shadow.map.texture),S.isAmbientLight)a+=C.r*w,o+=C.g*w,s+=C.b*w;else if(S.isLightProbe){for(let e=0;e<9;e++)r.probe[e].addScaledVector(S.sh.coefficients[e],w);x++}else if(S.isSunLight){let e=t.get(S);if(e.color.copy(S.color).multiplyScalar(S.intensity),S.castShadow){let e=S.shadow,t=n.get(S);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize.copy(e.mapSize).multiply(e.getFrameExtents()),r.sunShadow[l]=t,r.sunShadowMap[l]=E;let i=e.getViewportCount();for(let t=0;t<i;t++)r.sunShadowMatrix[u+t]=e.getMatrix(t),r.sunShadowCascade[u+t]=e._cascadeData[t];u+=i,l++}r.sun[c]=e,c++}else if(S.isDirectionalLight){let e=t.get(S);if(e.color.copy(S.color).multiplyScalar(S.intensity),S.castShadow){let e=S.shadow,t=n.get(S);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,r.directionalShadow[d]=t,r.directionalShadowMap[d]=E,r.directionalShadowMatrix[d]=S.shadow.matrix,g++}r.directional[d]=e,d++}else if(S.isSpotLight){let e=t.get(S);e.position.setFromMatrixPosition(S.matrixWorld),e.color.copy(C).multiplyScalar(w),e.distance=T,e.coneCos=Math.cos(S.angle),e.penumbraCos=Math.cos(S.angle*(1-S.penumbra)),e.decay=S.decay,r.spot[p]=e;let i=S.shadow;if(S.map&&(r.spotLightMap[y]=S.map,y++,i.updateMatrices(S),S.castShadow&&b++),r.spotLightMatrix[p]=i.matrix,S.castShadow){let e=n.get(S);e.shadowIntensity=i.intensity,e.shadowBias=i.bias,e.shadowNormalBias=i.normalBias,e.shadowRadius=i.radius,e.shadowMapSize=i.mapSize,r.spotShadow[p]=e,r.spotShadowMap[p]=E,v++}p++}else if(S.isRectAreaLight){let e=t.get(S);e.color.copy(C).multiplyScalar(w),e.halfWidth.set(S.width*.5,0,0),e.halfHeight.set(0,S.height*.5,0),r.rectArea[m]=e,m++}else if(S.isPointLight){let e=t.get(S);if(e.color.copy(S.color).multiplyScalar(S.intensity),e.distance=S.distance,e.decay=S.decay,S.castShadow){let e=S.shadow,t=n.get(S);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,t.shadowCameraNear=e.camera.near,t.shadowCameraFar=e.camera.far,r.pointShadow[f]=t,r.pointShadowMap[f]=E,r.pointShadowMatrix[f]=S.shadow.matrix,_++}r.point[f]=e,f++}else if(S.isHemisphereLight){let e=t.get(S);e.skyColor.copy(S.color).multiplyScalar(w),e.groundColor.copy(S.groundColor).multiplyScalar(w),r.hemi[h]=e,h++}}m>0&&(e.has(`OES_texture_float_linear`)===!0?(r.rectAreaLTC1=X.LTC_FLOAT_1,r.rectAreaLTC2=X.LTC_FLOAT_2):(r.rectAreaLTC1=X.LTC_HALF_1,r.rectAreaLTC2=X.LTC_HALF_2)),r.ambient[0]=a,r.ambient[1]=o,r.ambient[2]=s;let S=r.hash;(S.sunLength!==c||S.directionalLength!==d||S.pointLength!==f||S.spotLength!==p||S.rectAreaLength!==m||S.hemiLength!==h||S.numSunShadows!==l||S.numDirectionalShadows!==g||S.numPointShadows!==_||S.numSpotShadows!==v||S.numSpotMaps!==y||S.numLightProbes!==x)&&(r.sun.length=c,r.directional.length=d,r.spot.length=p,r.rectArea.length=m,r.point.length=f,r.hemi.length=h,r.sunShadow.length=l,r.sunShadowMap.length=l,r.sunShadowMatrix.length=u,r.sunShadowCascade.length=u,r.directionalShadow.length=g,r.directionalShadowMap.length=g,r.directionalShadowMatrix.length=g,r.pointShadow.length=_,r.pointShadowMap.length=_,r.pointShadowMatrix.length=_,r.spotShadow.length=v,r.spotShadowMap.length=v,r.spotLightMatrix.length=v+y-b,r.spotLightMap.length=y,r.numSpotLightShadowsWithMaps=b,r.numLightProbes=x,S.sunLength=c,S.directionalLength=d,S.pointLength=f,S.spotLength=p,S.rectAreaLength=m,S.hemiLength=h,S.numSunShadows=l,S.numDirectionalShadows=g,S.numPointShadows=_,S.numSpotShadows=v,S.numSpotMaps=y,S.numLightProbes=x,r.version=Da++)}function c(e,t){let n=0,s=0,c=0,l=0,u=0,d=0,f=t.matrixWorldInverse;for(let t=0,p=e.length;t<p;t++){let p=e[t];if(p.isSunLight){let e=r.sun[n];e.direction.setFromMatrixPosition(p.matrixWorld),e.direction.transformDirection(f),n++}else if(p.isDirectionalLight){let e=r.directional[s];e.direction.setFromMatrixPosition(p.matrixWorld),i.setFromMatrixPosition(p.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(f),s++}else if(p.isSpotLight){let e=r.spot[l];e.position.setFromMatrixPosition(p.matrixWorld),e.position.applyMatrix4(f),e.direction.setFromMatrixPosition(p.matrixWorld),i.setFromMatrixPosition(p.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(f),l++}else if(p.isRectAreaLight){let e=r.rectArea[u];e.position.setFromMatrixPosition(p.matrixWorld),e.position.applyMatrix4(f),o.identity(),a.copy(p.matrixWorld),a.premultiply(f),o.extractRotation(a),e.halfWidth.set(p.width*.5,0,0),e.halfHeight.set(0,p.height*.5,0),e.halfWidth.applyMatrix4(o),e.halfHeight.applyMatrix4(o),u++}else if(p.isPointLight){let e=r.point[c];e.position.setFromMatrixPosition(p.matrixWorld),e.position.applyMatrix4(f),c++}else if(p.isHemisphereLight){let e=r.hemi[d];e.direction.setFromMatrixPosition(p.matrixWorld),e.direction.transformDirection(f),d++}}}return{setup:s,setupView:c,state:r}}function Aa(e){let t=new ka(e),n=[],r=[],i=[];function a(e){d.camera=e,n.length=0,r.length=0,i.length=0}function o(e){n.push(e)}function s(e){r.push(e)}function c(e){i.push(e)}function l(){t.setup(n)}function u(e){t.setupView(n,e)}let d={lightsArray:n,shadowsArray:r,lightProbeGridArray:i,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:a,state:d,setupLights:l,setupLightsView:u,pushLight:o,pushShadow:s,pushLightProbeGrid:c}}function ja(e){let t=new WeakMap;function n(n,r=0){let i=t.get(n),a;return i===void 0?(a=new Aa(e),t.set(n,[a])):r>=i.length?(a=new Aa(e),i.push(a)):a=i[r],a}function r(){t=new WeakMap}return{get:n,dispose:r}}var Ma=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Na=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,Pa=[new R(1,0,0),new R(-1,0,0),new R(0,1,0),new R(0,-1,0),new R(0,0,1),new R(0,0,-1)],Fa=[new R(0,-1,0),new R(0,-1,0),new R(0,0,1),new R(0,0,-1),new R(0,-1,0),new R(0,-1,0)],Ia=new Ln,La=new R,Ra=new R;function za(e,t,n){let r=new fn,i=new kt,a=new kt,o=new oe,s=new D,c=new Te,l={},u=n.maxTextureSize,f={0:1,1:0,2:2},p=new et({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new kt},radius:{value:4}},vertexShader:Ma,fragmentShader:Na}),m=p.clone();m.defines.HORIZONTAL_PASS=1;let g=new z;g.setAttribute(`position`,new L(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let _=new d(g,p),v=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=1;let y=this.type;this.render=function(t,n,s){if(v.enabled===!1||v.autoUpdate===!1&&v.needsUpdate===!1||t.length===0)return;this.type===2&&(q(`WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.`),this.type=1);let c=e.getRenderTarget(),l=e.getActiveCubeFace(),d=e.getActiveMipmapLevel(),f=e.state;f.setBlending(0),f.buffers.depth.getReversed()===!0?f.buffers.color.setClear(0,0,0,0):f.buffers.color.setClear(1,1,1,1),f.buffers.depth.setTest(!0),f.setScissorTest(!1);let p=y!==this.type;p&&n.traverse(function(e){e.material&&(Array.isArray(e.material)?e.material.forEach(e=>e.needsUpdate=!0):e.material.needsUpdate=!0)});for(let c=0,l=t.length;c<l;c++){let l=t[c],d=l.shadow;if(d===void 0){q(`WebGLShadowMap:`,l,`has no shadow.`);continue}if(d.autoUpdate===!1&&d.needsUpdate===!1)continue;i.copy(d.mapSize);let m=d.getFrameExtents();i.multiply(m),a.copy(d.mapSize),(i.x>u||i.y>u)&&(i.x>u&&(a.x=Math.floor(u/m.x),i.x=a.x*m.x,d.mapSize.x=a.x),i.y>u&&(a.y=Math.floor(u/m.y),i.y=a.y*m.y,d.mapSize.y=a.y));let g=e.state.buffers.depth.getReversed();if(d.camera._reversedDepth=g,d.map===null||p===!0){if(d.map!==null&&(d.map.depthTexture!==null&&(d.map.depthTexture.dispose(),d.map.depthTexture=null),d.map.dispose()),this.type===3){if(l.isPointLight){q(`WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.`);continue}d.map=new ee(i.x,i.y,{format:te,type:at,minFilter:ue,magFilter:ue,generateMipmaps:!1}),d.map.texture.name=l.name+`.shadowMap`,d.map.depthTexture=new Fe(i.x,i.y,Ke),d.map.depthTexture.name=l.name+`.shadowMapDepth`,d.map.depthTexture.format=K,d.map.depthTexture.compareFunction=null,d.map.depthTexture.minFilter=N,d.map.depthTexture.magFilter=N}else l.isPointLight?(d.map=new gr(i.x),d.map.depthTexture=new Ce(i.x,h)):(d.map=new ee(i.x,i.y),d.map.depthTexture=new Fe(i.x,i.y,h)),d.map.depthTexture.name=l.name+`.shadowMap`,d.map.depthTexture.format=K,this.type===1?(d.map.depthTexture.compareFunction=g?518:515,d.map.depthTexture.minFilter=ue,d.map.depthTexture.magFilter=ue):(d.map.depthTexture.compareFunction=null,d.map.depthTexture.minFilter=N,d.map.depthTexture.magFilter=N);d.camera.updateProjectionMatrix()}d.map.isWebGLCubeRenderTarget!==!0&&(d.map.width!==i.x||d.map.height!==i.y)&&d.map.setSize(i.x,i.y);let _=d.map.isWebGLCubeRenderTarget?6:d.getViewportCount();l.isPointLight!==!0&&d.updateMatrices(l,s);for(let t=0;t<_;t++){let i=d.getCamera(t);if(l.isPointLight){let e=d.camera,n=d.matrix,r=l.distance||e.far;r!==e.far&&(e.far=r,e.updateProjectionMatrix()),La.setFromMatrixPosition(l.matrixWorld),e.position.copy(La),Ra.copy(e.position),Ra.add(Pa[t]),e.up.copy(Fa[t]),e.lookAt(Ra),e.updateMatrixWorld(),n.makeTranslation(-La.x,-La.y,-La.z),Ia.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),d._frustum.setFromProjectionMatrix(Ia,e.coordinateSystem,e.reversedDepth)}if(d.map.isWebGLCubeRenderTarget)e.setRenderTarget(d.map,t),e.clear();else{t===0&&(e.setRenderTarget(d.map),e.clear());let n=d.getViewport(t);o.set(a.x*n.x,a.y*n.y,a.x*n.z,a.y*n.w),f.viewport(o)}r=d.getFrustum(t),S(n,s,i,l,this.type)}d.isPointLightShadow!==!0&&this.type===3&&b(d,s),d.needsUpdate=!1}y=this.type,v.needsUpdate=!1,e.setRenderTarget(c,l,d)};function b(n,r){let a=t.update(_);p.defines.VSM_SAMPLES!==n.blurSamples&&(p.defines.VSM_SAMPLES=n.blurSamples,m.defines.VSM_SAMPLES=n.blurSamples,p.needsUpdate=!0,m.needsUpdate=!0),n.mapPass===null?n.mapPass=new ee(i.x,i.y,{format:te,type:at}):(n.mapPass.width!==n.map.width||n.mapPass.height!==n.map.height)&&n.mapPass.setSize(n.map.width,n.map.height),p.uniforms.shadow_pass.value=n.map.depthTexture,p.uniforms.resolution.value.set(n.map.width,n.map.height),p.uniforms.radius.value=n.radius,e.setRenderTarget(n.mapPass),e.clear(),e.renderBufferDirect(r,null,a,p,_,null),m.uniforms.shadow_pass.value=n.mapPass.texture,m.uniforms.resolution.value.set(n.map.width,n.map.height),m.uniforms.radius.value=n.radius,e.setRenderTarget(n.map),e.clear(),e.renderBufferDirect(r,null,a,m,_,null)}function x(t,n,r,i){let a=null,o=r.isPointLight===!0?t.customDistanceMaterial:t.customDepthMaterial;if(o!==void 0)a=o;else if(a=r.isPointLight===!0?c:s,e.localClippingEnabled&&n.clipShadows===!0&&Array.isArray(n.clippingPlanes)&&n.clippingPlanes.length!==0||n.displacementMap&&n.displacementScale!==0||n.alphaMap&&n.alphaTest>0||n.map&&n.alphaTest>0||n.alphaToCoverage===!0){let e=a.uuid,t=n.uuid,r=l[e];r===void 0&&(r={},l[e]=r);let i=r[t];i===void 0&&(i=a.clone(),r[t]=i,n.addEventListener(`dispose`,C)),a=i}if(a.visible=n.visible,a.wireframe=n.wireframe,i===3?a.side=n.shadowSide===null?n.side:n.shadowSide:a.side=n.shadowSide===null?f[n.side]:n.shadowSide,a.alphaMap=n.alphaMap,a.alphaTest=n.alphaToCoverage===!0?.5:n.alphaTest,a.map=n.map,a.clipShadows=n.clipShadows,a.clippingPlanes=n.clippingPlanes,a.clipIntersection=n.clipIntersection,a.displacementMap=n.displacementMap,a.displacementScale=n.displacementScale,a.displacementBias=n.displacementBias,a.wireframeLinewidth=n.wireframeLinewidth,a.linewidth=n.linewidth,r.isPointLight===!0&&a.isMeshDistanceMaterial===!0){let t=e.properties.get(a);t.light=r}return a}function S(n,i,a,o,s){if(n.visible===!1)return;if(n.layers.test(i.layers)&&(n.isMesh||n.isLine||n.isPoints)&&(n.castShadow||n.receiveShadow&&s===3)&&(!n.frustumCulled||n.intersectsFrustum(r))){n.modelViewMatrix.multiplyMatrices(a.matrixWorldInverse,n.matrixWorld);let r=t.update(n),c=n.material;if(Array.isArray(c)){let t=r.groups;for(let l=0,u=t.length;l<u;l++){let u=t[l],d=c[u.materialIndex];if(d&&d.visible){let t=x(n,d,o,s);n.onBeforeShadow(e,n,i,a,r,t,u),e.renderBufferDirect(a,null,r,t,n,u),n.onAfterShadow(e,n,i,a,r,t,u)}}}else if(c.visible){let t=x(n,c,o,s);n.onBeforeShadow(e,n,i,a,r,t,null),e.renderBufferDirect(a,null,r,t,n,null),n.onAfterShadow(e,n,i,a,r,t,null)}}let c=n.children;for(let e=0,t=c.length;e<t;e++)S(c[e],i,a,o,s)}function C(e){e.target.removeEventListener(`dispose`,C);for(let t in l){let n=l[t],r=e.target.uuid;r in n&&(n[r].dispose(),delete n[r])}}}function Ba(e,t){function n(){let t=!1,n=new oe,r=null,i=new oe(0,0,0,0);return{setMask:function(n){r!==n&&!t&&(e.colorMask(n,n,n,n),r=n)},setLocked:function(e){t=e},setClear:function(t,r,a,o,s){s===!0&&(t*=o,r*=o,a*=o),n.set(t,r,a,o),i.equals(n)===!1&&(e.clearColor(t,r,a,o),i.copy(n))},reset:function(){t=!1,r=null,i.set(-1,0,0,0)}}}function i(){let n=!1,i=!1,a=null,o=null,s=null;return{setReversed:function(e){if(i!==e){let n=t.get(`EXT_clip_control`);e?n.clipControlEXT(n.LOWER_LEFT_EXT,n.ZERO_TO_ONE_EXT):n.clipControlEXT(n.LOWER_LEFT_EXT,n.NEGATIVE_ONE_TO_ONE_EXT),i=e;let r=s;s=null,this.setClear(r)}},getReversed:function(){return i},setTest:function(t){t?z(e.DEPTH_TEST):se(e.DEPTH_TEST)},setMask:function(t){a!==t&&!n&&(e.depthMask(t),a=t)},setFunc:function(t){if(i&&(t=r[t]),o!==t){switch(t){case 0:e.depthFunc(e.NEVER);break;case 1:e.depthFunc(e.ALWAYS);break;case 2:e.depthFunc(e.LESS);break;case 3:e.depthFunc(e.LEQUAL);break;case 4:e.depthFunc(e.EQUAL);break;case 5:e.depthFunc(e.GEQUAL);break;case 6:e.depthFunc(e.GREATER);break;case 7:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}o=t}},setLocked:function(e){n=e},setClear:function(t){s!==t&&(s=t,i&&(t=1-t),e.clearDepth(t))},reset:function(){n=!1,a=null,o=null,s=null,i=!1}}}function a(){let t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null;return{setTest:function(n){t||(n?z(e.STENCIL_TEST):se(e.STENCIL_TEST))},setMask:function(r){n!==r&&!t&&(e.stencilMask(r),n=r)},setFunc:function(t,n,o){(r!==t||i!==n||a!==o)&&(e.stencilFunc(t,n,o),r=t,i=n,a=o)},setOp:function(t,n,r){(o!==t||s!==n||c!==r)&&(e.stencilOp(t,n,r),o=t,s=n,c=r)},setLocked:function(e){t=e},setClear:function(t){l!==t&&(e.clearStencil(t),l=t)},reset:function(){t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null}}}let o=new n,s=new i,c=new a,l=new WeakMap,u=new WeakMap,d={},f={},p={},m=new WeakMap,h=[],g=null,_=!1,v=null,y=null,b=null,x=null,S=null,C=null,w=null,T=new V(0,0,0),E=0,D=!1,O=null,ee=null,k=null,A=null,j=null,M=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),N=!1,P=0,te=e.getParameter(e.VERSION);te.indexOf(`WebGL`)===-1?te.indexOf(`OpenGL ES`)!==-1&&(P=parseFloat(/^OpenGL ES (\d)/.exec(te)[1]),N=P>=2):(P=parseFloat(/^WebGL (\d)/.exec(te)[1]),N=P>=1);let ne=null,re={},F=e.getParameter(e.SCISSOR_BOX),ie=e.getParameter(e.VIEWPORT),I=new oe().fromArray(F),L=new oe().fromArray(ie);function R(t,n,r,i){let a=new Uint8Array(4),o=e.createTexture();e.bindTexture(t,o),e.texParameteri(t,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(t,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let o=0;o<r;o++)t===e.TEXTURE_3D||t===e.TEXTURE_2D_ARRAY?e.texImage3D(n,0,e.RGBA,1,1,i,0,e.RGBA,e.UNSIGNED_BYTE,a):e.texImage2D(n+o,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,a);return o}let ae={};ae[e.TEXTURE_2D]=R(e.TEXTURE_2D,e.TEXTURE_2D,1),ae[e.TEXTURE_CUBE_MAP]=R(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),ae[e.TEXTURE_2D_ARRAY]=R(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),ae[e.TEXTURE_3D]=R(e.TEXTURE_3D,e.TEXTURE_3D,1,1),o.setClear(0,0,0,1),s.setClear(1),c.setClear(0),z(e.DEPTH_TEST),s.setFunc(3),me(!1),he(1),z(e.CULL_FACE),fe(0);function z(t){d[t]!==!0&&(e.enable(t),d[t]=!0)}function se(t){d[t]!==!1&&(e.disable(t),d[t]=!1)}function ce(t,n){return p[t]!==n&&(e.bindFramebuffer(t,n),p[t]=n,t===e.DRAW_FRAMEBUFFER&&(p[e.FRAMEBUFFER]=n),t===e.FRAMEBUFFER&&(p[e.DRAW_FRAMEBUFFER]=n),!0)}function le(t,n){let r=h,i=!1;if(t){r=m.get(n),r===void 0&&(r=[],m.set(n,r));let a=t.textures;if(r.length!==a.length||r[0]!==e.COLOR_ATTACHMENT0){for(let t=0,n=a.length;t<n;t++)r[t]=e.COLOR_ATTACHMENT0+t;r.length=a.length,i=!0}}else r[0]!==e.BACK&&(r[0]=e.BACK,i=!0);i&&e.drawBuffers(r)}function ue(t){return g!==t&&(e.useProgram(t),g=t,!0)}let de={100:e.FUNC_ADD,101:e.FUNC_SUBTRACT,102:e.FUNC_REVERSE_SUBTRACT};de[103]=e.MIN,de[104]=e.MAX;let B={200:e.ZERO,201:e.ONE,202:e.SRC_COLOR,204:e.SRC_ALPHA,210:e.SRC_ALPHA_SATURATE,208:e.DST_COLOR,206:e.DST_ALPHA,203:e.ONE_MINUS_SRC_COLOR,205:e.ONE_MINUS_SRC_ALPHA,209:e.ONE_MINUS_DST_COLOR,207:e.ONE_MINUS_DST_ALPHA,211:e.CONSTANT_COLOR,212:e.ONE_MINUS_CONSTANT_COLOR,213:e.CONSTANT_ALPHA,214:e.ONE_MINUS_CONSTANT_ALPHA};function fe(t,n,r,i,a,o,s,c,l,u){if(t===0){_===!0&&(se(e.BLEND),_=!1);return}if(_===!1&&(z(e.BLEND),_=!0),t!==5){if(t!==v||u!==D){if((y!==100||S!==100)&&(e.blendEquation(e.FUNC_ADD),y=100,S=100),u)switch(t){case 1:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFunc(e.ONE,e.ONE);break;case 3:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case 4:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:Ee(`WebGLState: Invalid blending: `,t)}else switch(t){case 1:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case 3:Ee(`WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true`);break;case 4:Ee(`WebGLState: MultiplyBlending requires material.premultipliedAlpha = true`);break;default:Ee(`WebGLState: Invalid blending: `,t)}b=null,x=null,C=null,w=null,T.set(0,0,0),E=0,v=t,D=u}return}a||=n,o||=r,s||=i,(n!==y||a!==S)&&(e.blendEquationSeparate(de[n],de[a]),y=n,S=a),(r!==b||i!==x||o!==C||s!==w)&&(e.blendFuncSeparate(B[r],B[i],B[o],B[s]),b=r,x=i,C=o,w=s),(c.equals(T)===!1||l!==E)&&(e.blendColor(c.r,c.g,c.b,l),T.copy(c),E=l),v=t,D=!1}function pe(t,n){t.side===2?se(e.CULL_FACE):z(e.CULL_FACE);let r=t.side===1;n&&(r=!r),me(r),t.blending===1&&t.transparent===!1?fe(0):fe(t.blending,t.blendEquation,t.blendSrc,t.blendDst,t.blendEquationAlpha,t.blendSrcAlpha,t.blendDstAlpha,t.blendColor,t.blendAlpha,t.premultipliedAlpha),s.setFunc(t.depthFunc),s.setTest(t.depthTest),s.setMask(t.depthWrite),o.setMask(t.colorWrite);let i=t.stencilWrite;c.setTest(i),i&&(c.setMask(t.stencilWriteMask),c.setFunc(t.stencilFunc,t.stencilRef,t.stencilFuncMask),c.setOp(t.stencilFail,t.stencilZFail,t.stencilZPass)),H(t.polygonOffset,t.polygonOffsetFactor,t.polygonOffsetUnits),t.alphaToCoverage===!0?z(e.SAMPLE_ALPHA_TO_COVERAGE):se(e.SAMPLE_ALPHA_TO_COVERAGE)}function me(t){O!==t&&(t?e.frontFace(e.CW):e.frontFace(e.CCW),O=t)}function he(t){t===0?se(e.CULL_FACE):(z(e.CULL_FACE),t!==ee&&(t===1?e.cullFace(e.BACK):t===2?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))),ee=t}function ge(t){t!==k&&(N&&e.lineWidth(t),k=t)}function H(t,n,r){t?(z(e.POLYGON_OFFSET_FILL),(A!==n||j!==r)&&(A=n,j=r,s.getReversed()&&(n=-n),e.polygonOffset(n,r))):se(e.POLYGON_OFFSET_FILL)}function _e(t){t?z(e.SCISSOR_TEST):se(e.SCISSOR_TEST)}function ve(t){t===void 0&&(t=e.TEXTURE0+M-1),ne!==t&&(e.activeTexture(t),ne=t)}function ye(t,n,r){r===void 0&&(r=ne===null?e.TEXTURE0+M-1:ne);let i=re[r];i===void 0&&(i={type:void 0,texture:void 0},re[r]=i),(i.type!==t||i.texture!==n)&&(ne!==r&&(e.activeTexture(r),ne=r),e.bindTexture(t,n||ae[t]),i.type=t,i.texture=n)}function be(){let t=re[ne];t!==void 0&&t.type!==void 0&&(e.bindTexture(t.type,null),t.type=void 0,t.texture=void 0)}function xe(){try{e.compressedTexImage2D(...arguments)}catch(e){Ee(`WebGLState:`,e)}}function Se(){try{e.compressedTexImage3D(...arguments)}catch(e){Ee(`WebGLState:`,e)}}function Ce(){try{e.texSubImage2D(...arguments)}catch(e){Ee(`WebGLState:`,e)}}function we(){try{e.texSubImage3D(...arguments)}catch(e){Ee(`WebGLState:`,e)}}function Te(){try{e.compressedTexSubImage2D(...arguments)}catch(e){Ee(`WebGLState:`,e)}}function U(){try{e.compressedTexSubImage3D(...arguments)}catch(e){Ee(`WebGLState:`,e)}}function De(){try{e.texStorage2D(...arguments)}catch(e){Ee(`WebGLState:`,e)}}function Oe(){try{e.texStorage3D(...arguments)}catch(e){Ee(`WebGLState:`,e)}}function ke(){try{e.texImage2D(...arguments)}catch(e){Ee(`WebGLState:`,e)}}function Ae(){try{e.texImage3D(...arguments)}catch(e){Ee(`WebGLState:`,e)}}function W(t){return f[t]===void 0?e.getParameter(t):f[t]}function je(t,n){f[t]!==n&&(e.pixelStorei(t,n),f[t]=n)}function G(t){I.equals(t)===!1&&(e.scissor(t.x,t.y,t.z,t.w),I.copy(t))}function K(t){L.equals(t)===!1&&(e.viewport(t.x,t.y,t.z,t.w),L.copy(t))}function Me(t,n){let r=u.get(n);r===void 0&&(r=new WeakMap,u.set(n,r));let i=r.get(t);i===void 0&&(i=e.getUniformBlockIndex(n,t.name),r.set(t,i))}function Ne(t,n){let r=u.get(n).get(t);l.get(n)!==r&&(e.uniformBlockBinding(n,r,t.__bindingPointIndex),l.set(n,r))}function Pe(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),s.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),e.pixelStorei(e.PACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,e.BROWSER_DEFAULT_WEBGL),e.pixelStorei(e.PACK_ROW_LENGTH,0),e.pixelStorei(e.PACK_SKIP_PIXELS,0),e.pixelStorei(e.PACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_ROW_LENGTH,0),e.pixelStorei(e.UNPACK_IMAGE_HEIGHT,0),e.pixelStorei(e.UNPACK_SKIP_PIXELS,0),e.pixelStorei(e.UNPACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_SKIP_IMAGES,0),d={},f={},ne=null,re={},p={},m=new WeakMap,h=[],g=null,_=!1,v=null,y=null,b=null,x=null,S=null,C=null,w=null,T=new V(0,0,0),E=0,D=!1,O=null,ee=null,k=null,A=null,j=null,I.set(0,0,e.canvas.width,e.canvas.height),L.set(0,0,e.canvas.width,e.canvas.height),o.reset(),s.reset(),c.reset()}return{buffers:{color:o,depth:s,stencil:c},enable:z,disable:se,bindFramebuffer:ce,drawBuffers:le,useProgram:ue,setBlending:fe,setMaterial:pe,setFlipSided:me,setCullFace:he,setLineWidth:ge,setPolygonOffset:H,setScissorTest:_e,activeTexture:ve,bindTexture:ye,unbindTexture:be,compressedTexImage2D:xe,compressedTexImage3D:Se,texImage2D:ke,texImage3D:Ae,pixelStorei:je,getParameter:W,updateUBOMapping:Me,uniformBlockBinding:Ne,texStorage2D:De,texStorage3D:Oe,texSubImage2D:Ce,texSubImage3D:we,compressedTexSubImage2D:Te,compressedTexSubImage3D:U,scissor:G,viewport:K,reset:Pe}}function Va(e,t,n,r,i,a,o){let s=t.has(`WEBGL_multisampled_render_to_texture`)?t.get(`WEBGL_multisampled_render_to_texture`):null,l=typeof navigator>`u`?!1:/OculusBrowser/g.test(navigator.userAgent),d=new kt,f=new WeakMap,p=new Set,m,h=new WeakMap,g=!1;try{g=typeof OffscreenCanvas<`u`&&new OffscreenCanvas(1,1).getContext(`2d`)!==null}catch{}function _(e,t){return g?new OffscreenCanvas(e,t):u(`canvas`)}function v(e,t,n){let r=1,i=U(e);if((i.width>n||i.height>n)&&(r=n/Math.max(i.width,i.height)),r<1){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap||typeof VideoFrame<`u`&&e instanceof VideoFrame){let n=Math.floor(r*i.width),a=Math.floor(r*i.height);m===void 0&&(m=_(n,a));let o=t?_(n,a):m;return o.width=n,o.height=a,o.getContext(`2d`).drawImage(e,0,0,n,a),q(`WebGLRenderer: Texture has been resized from (`+i.width+`x`+i.height+`) to (`+n+`x`+a+`).`),o}return`data`in e&&q(`WebGLRenderer: Image in DataTexture is too big (`+i.width+`x`+i.height+`).`),e}return e}function y(e){return e.generateMipmaps}function b(t){e.generateMipmap(t)}function x(t){return t.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:t.isWebGL3DRenderTarget?e.TEXTURE_3D:t.isWebGLArrayRenderTarget||t.isCompressedArrayTexture?e.TEXTURE_2D_ARRAY:e.TEXTURE_2D}function S(n,r,i,a,o,s=!1){if(n!==null){if(e[n]!==void 0)return e[n];q(`WebGLRenderer: Attempt to use non-existing WebGL internal format '`+n+`'`)}let c;a&&(c=t.get(`EXT_texture_norm16`),c||q(`WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension`));let l=r;if(r===e.RED&&(i===e.FLOAT&&(l=e.R32F),i===e.HALF_FLOAT&&(l=e.R16F),i===e.UNSIGNED_BYTE&&(l=e.R8),i===e.UNSIGNED_SHORT&&c&&(l=c.R16_EXT),i===e.SHORT&&c&&(l=c.R16_SNORM_EXT)),r===e.RED_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.R8UI),i===e.UNSIGNED_SHORT&&(l=e.R16UI),i===e.UNSIGNED_INT&&(l=e.R32UI),i===e.BYTE&&(l=e.R8I),i===e.SHORT&&(l=e.R16I),i===e.INT&&(l=e.R32I)),r===e.RG&&(i===e.FLOAT&&(l=e.RG32F),i===e.HALF_FLOAT&&(l=e.RG16F),i===e.UNSIGNED_BYTE&&(l=e.RG8),i===e.UNSIGNED_SHORT&&c&&(l=c.RG16_EXT),i===e.SHORT&&c&&(l=c.RG16_SNORM_EXT)),r===e.RG_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RG8UI),i===e.UNSIGNED_SHORT&&(l=e.RG16UI),i===e.UNSIGNED_INT&&(l=e.RG32UI),i===e.BYTE&&(l=e.RG8I),i===e.SHORT&&(l=e.RG16I),i===e.INT&&(l=e.RG32I)),r===e.RGB_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RGB8UI),i===e.UNSIGNED_SHORT&&(l=e.RGB16UI),i===e.UNSIGNED_INT&&(l=e.RGB32UI),i===e.BYTE&&(l=e.RGB8I),i===e.SHORT&&(l=e.RGB16I),i===e.INT&&(l=e.RGB32I)),r===e.RGBA_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RGBA8UI),i===e.UNSIGNED_SHORT&&(l=e.RGBA16UI),i===e.UNSIGNED_INT&&(l=e.RGBA32UI),i===e.BYTE&&(l=e.RGBA8I),i===e.SHORT&&(l=e.RGBA16I),i===e.INT&&(l=e.RGBA32I)),r===e.RGB&&(i===e.UNSIGNED_SHORT&&c&&(l=c.RGB16_EXT),i===e.SHORT&&c&&(l=c.RGB16_SNORM_EXT),i===e.UNSIGNED_INT_5_9_9_9_REV&&(l=e.RGB9_E5),i===e.UNSIGNED_INT_10F_11F_11F_REV&&(l=e.R11F_G11F_B10F)),r===e.RGBA){let t=s?ae:Fn.getTransfer(o);i===e.FLOAT&&(l=e.RGBA32F),i===e.HALF_FLOAT&&(l=e.RGBA16F),i===e.UNSIGNED_BYTE&&(l=t===`srgb`?e.SRGB8_ALPHA8:e.RGBA8),i===e.UNSIGNED_SHORT&&c&&(l=c.RGBA16_EXT),i===e.SHORT&&c&&(l=c.RGBA16_SNORM_EXT),i===e.UNSIGNED_SHORT_4_4_4_4&&(l=e.RGBA4),i===e.UNSIGNED_SHORT_5_5_5_1&&(l=e.RGB5_A1)}return(l===e.R16F||l===e.R32F||l===e.RG16F||l===e.RG32F||l===e.RGBA16F||l===e.RGBA32F)&&t.get(`EXT_color_buffer_float`),l}function C(t,n){let r;return t?n===null||n===1014||n===1020?r=e.DEPTH24_STENCIL8:n===1015?r=e.DEPTH32F_STENCIL8:n===1012&&(r=e.DEPTH24_STENCIL8,q(`DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.`)):n===null||n===1014||n===1020?r=e.DEPTH_COMPONENT24:n===1015?r=e.DEPTH_COMPONENT32F:n===1012&&(r=e.DEPTH_COMPONENT16),r}function w(e,t){return y(e)===!0||e.isFramebufferTexture&&e.minFilter!==1003&&e.minFilter!==1006?Math.log2(Math.max(t.width,t.height))+1:e.mipmaps!==void 0&&e.mipmaps.length>0?e.mipmaps.length:e.isCompressedTexture&&Array.isArray(e.image)?t.mipmaps.length:1}function T(e){let t=e.target;t.removeEventListener(`dispose`,T),O(t),t.isVideoTexture&&f.delete(t),t.isHTMLTexture&&p.delete(t)}function D(e){let t=e.target;t.removeEventListener(`dispose`,D),k(t)}function O(e){let t=r.get(e);if(t.__webglInit===void 0)return;let n=e.source,i=h.get(n);if(i){let r=i[t.__cacheKey];r.usedTimes--,r.usedTimes===0&&ee(e),Object.keys(i).length===0&&h.delete(n)}r.remove(e)}function ee(t){let n=r.get(t);e.deleteTexture(n.__webglTexture);let i=t.source,a=h.get(i);delete a[n.__cacheKey],o.memory.textures--}function k(t){let n=r.get(t);if(t.depthTexture&&(t.depthTexture.dispose(),r.remove(t.depthTexture)),t.isWebGLCubeRenderTarget)for(let t=0;t<6;t++){if(Array.isArray(n.__webglFramebuffer[t]))for(let r=0;r<n.__webglFramebuffer[t].length;r++)e.deleteFramebuffer(n.__webglFramebuffer[t][r]);else e.deleteFramebuffer(n.__webglFramebuffer[t]);n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer[t])}else{if(Array.isArray(n.__webglFramebuffer))for(let t=0;t<n.__webglFramebuffer.length;t++)e.deleteFramebuffer(n.__webglFramebuffer[t]);else e.deleteFramebuffer(n.__webglFramebuffer);if(n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer),n.__webglMultisampledFramebuffer&&e.deleteFramebuffer(n.__webglMultisampledFramebuffer),n.__webglColorRenderbuffer)for(let t=0;t<n.__webglColorRenderbuffer.length;t++)n.__webglColorRenderbuffer[t]&&e.deleteRenderbuffer(n.__webglColorRenderbuffer[t]);n.__webglDepthRenderbuffer&&e.deleteRenderbuffer(n.__webglDepthRenderbuffer)}let i=t.textures;for(let t=0,n=i.length;t<n;t++){let n=r.get(i[t]);n.__webglTexture&&(e.deleteTexture(n.__webglTexture),o.memory.textures--),r.remove(i[t])}r.remove(t)}let A=0;function j(){A=0}function M(){return A}function P(e){A=e}function te(){let e=A;return e>=i.maxTextures&&q(`WebGLTextures: Trying to use `+(e+1)+` texture units while this GPU supports only `+i.maxTextures),A+=1,e}function ne(e){let t=[];return t.push(e.wrapS),t.push(e.wrapT),t.push(e.wrapR||0),t.push(e.magFilter),t.push(e.minFilter),t.push(e.anisotropy),t.push(e.internalFormat),t.push(e.format),t.push(e.type),t.push(e.generateMipmaps),t.push(e.premultiplyAlpha),t.push(e.flipY),t.push(e.unpackAlignment),t.push(e.colorSpace),t.join()}function re(t,i){let a=r.get(t);if(t.isVideoTexture&&we(t),t.isRenderTargetTexture===!1&&t.isExternalTexture!==!0&&t.version>0&&a.__version!==t.version){let e=t.image;if(e===null)q(`WebGLRenderer: Texture marked for update but no image data found.`);else if(e.complete===!1)q(`WebGLRenderer: Texture marked for update but image is incomplete`);else{B(a,t,i);return}}else t.isExternalTexture&&(a.__webglTexture=t.sourceTexture?t.sourceTexture:null);n.bindTexture(e.TEXTURE_2D,a.__webglTexture,e.TEXTURE0+i)}function ie(t,i){let a=r.get(t);if(t.isRenderTargetTexture===!1&&t.version>0&&a.__version!==t.version){B(a,t,i);return}t.isExternalTexture&&(a.__webglTexture=t.sourceTexture?t.sourceTexture:null),n.bindTexture(e.TEXTURE_2D_ARRAY,a.__webglTexture,e.TEXTURE0+i)}function I(t,i){let a=r.get(t);if(t.isRenderTargetTexture===!1&&t.version>0&&a.__version!==t.version){B(a,t,i);return}n.bindTexture(e.TEXTURE_3D,a.__webglTexture,e.TEXTURE0+i)}function L(t,i){let a=r.get(t);if(t.isCubeDepthTexture!==!0&&t.version>0&&a.__version!==t.version){fe(a,t,i);return}n.bindTexture(e.TEXTURE_CUBE_MAP,a.__webglTexture,e.TEXTURE0+i)}let R={[pe]:e.REPEAT,[F]:e.CLAMP_TO_EDGE,[nn]:e.MIRRORED_REPEAT},z={[N]:e.NEAREST,[G]:e.NEAREST_MIPMAP_NEAREST,[Pe]:e.NEAREST_MIPMAP_LINEAR,[ue]:e.LINEAR,[c]:e.LINEAR_MIPMAP_NEAREST,[Nt]:e.LINEAR_MIPMAP_LINEAR},oe={512:e.NEVER,519:e.ALWAYS,513:e.LESS,515:e.LEQUAL,514:e.EQUAL,518:e.GEQUAL,516:e.GREATER,517:e.NOTEQUAL};function se(n,a){if(a.type===1015&&t.has(`OES_texture_float_linear`)===!1&&(a.magFilter===1006||a.magFilter===1007||a.magFilter===1005||a.magFilter===1008||a.minFilter===1006||a.minFilter===1007||a.minFilter===1005||a.minFilter===1008)&&q(`WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device.`),e.texParameteri(n,e.TEXTURE_WRAP_S,R[a.wrapS]),e.texParameteri(n,e.TEXTURE_WRAP_T,R[a.wrapT]),(n===e.TEXTURE_3D||n===e.TEXTURE_2D_ARRAY)&&e.texParameteri(n,e.TEXTURE_WRAP_R,R[a.wrapR]),e.texParameteri(n,e.TEXTURE_MAG_FILTER,z[a.magFilter]),e.texParameteri(n,e.TEXTURE_MIN_FILTER,z[a.minFilter]),a.compareFunction&&(e.texParameteri(n,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(n,e.TEXTURE_COMPARE_FUNC,oe[a.compareFunction])),t.has(`EXT_texture_filter_anisotropic`)===!0){if(a.magFilter===1003||a.minFilter!==1005&&a.minFilter!==1008||a.type===1015&&t.has(`OES_texture_float_linear`)===!1)return;if(a.anisotropy>1||r.get(a).__currentAnisotropy){let o=t.get(`EXT_texture_filter_anisotropic`);e.texParameterf(n,o.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(a.anisotropy,i.getMaxAnisotropy())),r.get(a).__currentAnisotropy=a.anisotropy}}}function ce(t,n){let r=!1;t.__webglInit===void 0&&(t.__webglInit=!0,n.addEventListener(`dispose`,T));let i=n.source,a=h.get(i);a===void 0&&(a={},h.set(i,a));let s=ne(n);if(s!==t.__cacheKey){a[s]===void 0&&(a[s]={texture:e.createTexture(),usedTimes:0},o.memory.textures++,r=!0),a[s].usedTimes++;let i=a[t.__cacheKey];i!==void 0&&(a[t.__cacheKey].usedTimes--,i.usedTimes===0&&ee(n)),t.__cacheKey=s,t.__webglTexture=a[s].texture}return r}function le(e,t,n){return Math.floor(Math.floor(e/n)/t)}function de(t,r,i,a){let o=t.updateRanges;if(o.length===0)n.texSubImage2D(e.TEXTURE_2D,0,0,0,r.width,r.height,i,a,r.data);else{o.sort((e,t)=>e.start-t.start);let s=0;for(let e=1;e<o.length;e++){let t=o[s],n=o[e],i=t.start+t.count,a=le(n.start,r.width,4),c=le(t.start,r.width,4);n.start<=i+1&&a===c&&le(n.start+n.count-1,r.width,4)===a?t.count=Math.max(t.count,n.start+n.count-t.start):(++s,o[s]=n)}o.length=s+1;let c=n.getParameter(e.UNPACK_ROW_LENGTH),l=n.getParameter(e.UNPACK_SKIP_PIXELS),u=n.getParameter(e.UNPACK_SKIP_ROWS);n.pixelStorei(e.UNPACK_ROW_LENGTH,r.width);for(let t=0,s=o.length;t<s;t++){let s=o[t],c=Math.floor(s.start/4),l=Math.ceil(s.count/4),u=c%r.width,d=Math.floor(c/r.width),f=l;n.pixelStorei(e.UNPACK_SKIP_PIXELS,u),n.pixelStorei(e.UNPACK_SKIP_ROWS,d),n.texSubImage2D(e.TEXTURE_2D,0,u,d,f,1,i,a,r.data)}t.clearUpdateRanges(),n.pixelStorei(e.UNPACK_ROW_LENGTH,c),n.pixelStorei(e.UNPACK_SKIP_PIXELS,l),n.pixelStorei(e.UNPACK_SKIP_ROWS,u)}}function B(t,o,s){let c=e.TEXTURE_2D;(o.isDataArrayTexture||o.isCompressedArrayTexture)&&(c=e.TEXTURE_2D_ARRAY),o.isData3DTexture&&(c=e.TEXTURE_3D);let l=ce(t,o),u=o.source;n.bindTexture(c,t.__webglTexture,e.TEXTURE0+s);let d=r.get(u);if(u.version!==d.__version||l===!0){if(n.activeTexture(e.TEXTURE0+s),!(typeof ImageBitmap<`u`&&o.image instanceof ImageBitmap)){let t=Fn.getPrimaries(Fn.workingColorSpace),r=o.colorSpace===``?null:Fn.getPrimaries(o.colorSpace),i=o.colorSpace===``||t===r?e.NONE:e.BROWSER_DEFAULT_WEBGL;n.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,o.flipY),n.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,o.premultiplyAlpha),n.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,i)}n.pixelStorei(e.UNPACK_ALIGNMENT,o.unpackAlignment);let t=v(o.image,!1,i.maxTextureSize);t=Te(o,t);let r=a.convert(o.format,o.colorSpace),f=a.convert(o.type),m=S(o.internalFormat,r,f,o.normalized,o.colorSpace,o.isVideoTexture);se(c,o);let h,g=o.mipmaps,_=o.isVideoTexture!==!0,x=d.__version===void 0||l===!0,T=u.dataReady,D=w(o,t);if(o.isDepthTexture)m=C(o.format===W,o.type),x&&(_?n.texStorage2D(e.TEXTURE_2D,1,m,t.width,t.height):n.texImage2D(e.TEXTURE_2D,0,m,t.width,t.height,0,r,f,null));else if(o.isDataTexture){if(g.length>0){_&&x&&n.texStorage2D(e.TEXTURE_2D,D,m,g[0].width,g[0].height);for(let t=0,i=g.length;t<i;t++)h=g[t],_?T&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,h.width,h.height,r,f,h.data):n.texImage2D(e.TEXTURE_2D,t,m,h.width,h.height,0,r,f,h.data);o.generateMipmaps=!1}else _?(x&&n.texStorage2D(e.TEXTURE_2D,D,m,t.width,t.height),T&&de(o,t,r,f)):n.texImage2D(e.TEXTURE_2D,0,m,t.width,t.height,0,r,f,t.data)}else if(o.isCompressedTexture){if(o.isCompressedArrayTexture){_&&x&&n.texStorage3D(e.TEXTURE_2D_ARRAY,D,m,g[0].width,g[0].height,t.depth);for(let i=0,a=g.length;i<a;i++)if(h=g[i],o.format!==1023){if(r!==null){if(_){if(T){if(o.layerUpdates.size>0){let t=E(h.width,h.height,o.format,o.type);for(let a of o.layerUpdates){let o=h.data.subarray(a*t/h.data.BYTES_PER_ELEMENT,(a+1)*t/h.data.BYTES_PER_ELEMENT);n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,i,0,0,a,h.width,h.height,1,r,o)}}else n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,i,0,0,0,h.width,h.height,t.depth,r,h.data)}}else n.compressedTexImage3D(e.TEXTURE_2D_ARRAY,i,m,h.width,h.height,t.depth,0,h.data,0,0)}else q(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`)}else _?T&&n.texSubImage3D(e.TEXTURE_2D_ARRAY,i,0,0,0,h.width,h.height,t.depth,r,f,h.data):n.texImage3D(e.TEXTURE_2D_ARRAY,i,m,h.width,h.height,t.depth,0,r,f,h.data);o.layerUpdates.size>0&&o.clearLayerUpdates()}else{_&&x&&n.texStorage2D(e.TEXTURE_2D,D,m,g[0].width,g[0].height);for(let t=0,i=g.length;t<i;t++)h=g[t],o.format===1023?_?T&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,h.width,h.height,r,f,h.data):n.texImage2D(e.TEXTURE_2D,t,m,h.width,h.height,0,r,f,h.data):r===null?q(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`):_?T&&n.compressedTexSubImage2D(e.TEXTURE_2D,t,0,0,h.width,h.height,r,h.data):n.compressedTexImage2D(e.TEXTURE_2D,t,m,h.width,h.height,0,h.data)}}else if(o.isDataArrayTexture){if(_){if(x&&n.texStorage3D(e.TEXTURE_2D_ARRAY,D,m,t.width,t.height,t.depth),T){if(o.layerUpdates.size>0){let i=E(t.width,t.height,o.format,o.type);for(let a of o.layerUpdates){let o=t.data.subarray(a*i/t.data.BYTES_PER_ELEMENT,(a+1)*i/t.data.BYTES_PER_ELEMENT);n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,a,t.width,t.height,1,r,f,o)}o.clearLayerUpdates()}else n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,t.width,t.height,t.depth,r,f,t.data)}}else n.texImage3D(e.TEXTURE_2D_ARRAY,0,m,t.width,t.height,t.depth,0,r,f,t.data)}else if(o.isData3DTexture)_?(x&&n.texStorage3D(e.TEXTURE_3D,D,m,t.width,t.height,t.depth),T&&n.texSubImage3D(e.TEXTURE_3D,0,0,0,0,t.width,t.height,t.depth,r,f,t.data)):n.texImage3D(e.TEXTURE_3D,0,m,t.width,t.height,t.depth,0,r,f,t.data);else if(o.isFramebufferTexture){if(x){if(_)n.texStorage2D(e.TEXTURE_2D,D,m,t.width,t.height);else{let i=t.width,a=t.height;for(let t=0;t<D;t++)n.texImage2D(e.TEXTURE_2D,t,m,i,a,0,r,f,null),i>>=1,a>>=1}}}else if(o.isHTMLTexture){if(`texElementImage2D`in e){let n=e.canvas;if(n.hasAttribute(`layoutsubtree`)||n.setAttribute(`layoutsubtree`,`true`),t.parentNode!==n){n.appendChild(t),p.add(o),n.onpaint=e=>{let t=e.changedElements;for(let e of p)t.includes(e.image)&&(e.needsUpdate=!0)},n.requestPaint();return}if(e.texElementImage2D.length===3)e.texElementImage2D(e.TEXTURE_2D,e.RGBA8,t);else{let n=e.RGBA,r=e.RGBA,i=e.UNSIGNED_BYTE;e.texElementImage2D(e.TEXTURE_2D,0,n,r,i,t)}e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}}else if(g.length>0){if(_&&x){let t=U(g[0]);n.texStorage2D(e.TEXTURE_2D,D,m,t.width,t.height)}for(let t=0,i=g.length;t<i;t++)h=g[t],_?T&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,r,f,h):n.texImage2D(e.TEXTURE_2D,t,m,r,f,h);o.generateMipmaps=!1}else if(_){if(x){let r=U(t);n.texStorage2D(e.TEXTURE_2D,D,m,r.width,r.height)}T&&n.texSubImage2D(e.TEXTURE_2D,0,0,0,r,f,t)}else n.texImage2D(e.TEXTURE_2D,0,m,r,f,t);y(o)&&b(c),d.__version=u.version,o.onUpdate&&o.onUpdate(o)}t.__version=o.version}function fe(t,o,s){if(o.image.length!==6)return;let c=ce(t,o),l=o.source;n.bindTexture(e.TEXTURE_CUBE_MAP,t.__webglTexture,e.TEXTURE0+s);let u=r.get(l);if(l.version!==u.__version||c===!0){n.activeTexture(e.TEXTURE0+s);let t=Fn.getPrimaries(Fn.workingColorSpace),r=o.colorSpace===``?null:Fn.getPrimaries(o.colorSpace),d=o.colorSpace===``||t===r?e.NONE:e.BROWSER_DEFAULT_WEBGL;n.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,o.flipY),n.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,o.premultiplyAlpha),n.pixelStorei(e.UNPACK_ALIGNMENT,o.unpackAlignment),n.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,d);let f=o.isCompressedTexture||o.image[0].isCompressedTexture,p=o.image[0]&&o.image[0].isDataTexture,m=[];for(let e=0;e<6;e++)!f&&!p?m[e]=v(o.image[e],!0,i.maxCubemapSize):m[e]=p?o.image[e].image:o.image[e],m[e]=Te(o,m[e]);let h=m[0],g=a.convert(o.format,o.colorSpace),_=a.convert(o.type),x=S(o.internalFormat,g,_,o.normalized,o.colorSpace),C=o.isVideoTexture!==!0,T=u.__version===void 0||c===!0,E=l.dataReady,D=w(o,h);se(e.TEXTURE_CUBE_MAP,o);let O;if(f){C&&T&&n.texStorage2D(e.TEXTURE_CUBE_MAP,D,x,h.width,h.height);for(let t=0;t<6;t++){O=m[t].mipmaps;for(let r=0;r<O.length;r++){let i=O[r];o.format===1023?C?E&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,0,0,i.width,i.height,g,_,i.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,x,i.width,i.height,0,g,_,i.data):g===null?q(`WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()`):C?E&&n.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,0,0,i.width,i.height,g,i.data):n.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,x,i.width,i.height,0,i.data)}}}else{if(O=o.mipmaps,C&&T){O.length>0&&D++;let t=U(m[0]);n.texStorage2D(e.TEXTURE_CUBE_MAP,D,x,t.width,t.height)}for(let t=0;t<6;t++)if(p){C?E&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,m[t].width,m[t].height,g,_,m[t].data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,x,m[t].width,m[t].height,0,g,_,m[t].data);for(let r=0;r<O.length;r++){let i=O[r].image[t].image;C?E&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,0,0,i.width,i.height,g,_,i.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,x,i.width,i.height,0,g,_,i.data)}}else{C?E&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,g,_,m[t]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,x,g,_,m[t]);for(let r=0;r<O.length;r++){let i=O[r];C?E&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,0,0,g,_,i.image[t]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,x,g,_,i.image[t])}}}y(o)&&b(e.TEXTURE_CUBE_MAP),u.__version=l.version,o.onUpdate&&o.onUpdate(o)}t.__version=o.version}function me(t,i,o,c,l,u){let d=a.convert(o.format,o.colorSpace),f=a.convert(o.type),p=S(o.internalFormat,d,f,o.normalized,o.colorSpace),m=r.get(i),h=r.get(o);if(h.__renderTarget=i,!m.__hasExternalTextures){let t=Math.max(1,i.width>>u),r=Math.max(1,i.height>>u);l===e.TEXTURE_3D||l===e.TEXTURE_2D_ARRAY?n.texImage3D(l,u,p,t,r,i.depth,0,d,f,null):n.texImage2D(l,u,p,t,r,0,d,f,null)}n.bindFramebuffer(e.FRAMEBUFFER,t),Ce(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,c,l,h.__webglTexture,0,Se(i)):(l===e.TEXTURE_2D||l>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&l<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,c,l,h.__webglTexture,u),n.bindFramebuffer(e.FRAMEBUFFER,null)}function he(t,n,r){if(e.bindRenderbuffer(e.RENDERBUFFER,t),n.depthBuffer){let i=n.depthTexture,a=i&&i.isDepthTexture?i.type:null,o=C(n.stencilBuffer,a),c=n.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;Ce(n)?s.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Se(n),o,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,Se(n),o,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,o,n.width,n.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,c,e.RENDERBUFFER,t)}else{let t=n.textures;for(let i=0;i<t.length;i++){let o=t[i],c=a.convert(o.format,o.colorSpace),l=a.convert(o.type),u=S(o.internalFormat,c,l,o.normalized,o.colorSpace);Ce(n)?s.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Se(n),u,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,Se(n),u,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,u,n.width,n.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function V(t,i,o){let c=i.isWebGLCubeRenderTarget===!0;if(n.bindFramebuffer(e.FRAMEBUFFER,t),!(i.depthTexture&&i.depthTexture.isDepthTexture))throw Error(`THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.`);let l=r.get(i.depthTexture);if(l.__renderTarget=i,(!l.__webglTexture||i.depthTexture.image.width!==i.width||i.depthTexture.image.height!==i.height)&&(i.depthTexture.image.width=i.width,i.depthTexture.image.height=i.height,i.depthTexture.needsUpdate=!0),c){if(l.__webglInit===void 0&&(l.__webglInit=!0,i.depthTexture.addEventListener(`dispose`,T)),l.__webglTexture===void 0){l.__webglTexture=e.createTexture(),n.bindTexture(e.TEXTURE_CUBE_MAP,l.__webglTexture),se(e.TEXTURE_CUBE_MAP,i.depthTexture);let t=a.convert(i.depthTexture.format),r=a.convert(i.depthTexture.type),o;i.depthTexture.format===1026?o=e.DEPTH_COMPONENT24:i.depthTexture.format===1027&&(o=e.DEPTH24_STENCIL8);for(let n=0;n<6;n++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+n,0,o,i.width,i.height,0,t,r,null)}}else re(i.depthTexture,0);let u=l.__webglTexture,d=Se(i),f=c?e.TEXTURE_CUBE_MAP_POSITIVE_X+o:e.TEXTURE_2D,p=i.depthTexture.format===1027?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(i.depthTexture.format===1026)Ce(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,p,f,u,0,d):e.framebufferTexture2D(e.FRAMEBUFFER,p,f,u,0);else if(i.depthTexture.format===1027)Ce(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,p,f,u,0,d):e.framebufferTexture2D(e.FRAMEBUFFER,p,f,u,0);else throw Error(`THREE.WebGLTextures: Unknown depthTexture format.`)}function ge(t){let i=r.get(t),a=t.isWebGLCubeRenderTarget===!0;if(i.__boundDepthTexture!==t.depthTexture){let e=t.depthTexture;if(i.__depthDisposeCallback&&i.__depthDisposeCallback(),e){let t=()=>{delete i.__boundDepthTexture,delete i.__depthDisposeCallback,e.removeEventListener(`dispose`,t)};e.addEventListener(`dispose`,t),i.__depthDisposeCallback=t}i.__boundDepthTexture=e}if(t.depthTexture&&!i.__autoAllocateDepthBuffer){if(a)for(let e=0;e<6;e++)V(i.__webglFramebuffer[e],t,e);else{let e=t.texture.mipmaps;e&&e.length>0?V(i.__webglFramebuffer[0],t,0):V(i.__webglFramebuffer,t,0)}}else if(a){i.__webglDepthbuffer=[];for(let r=0;r<6;r++)if(n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer[r]),i.__webglDepthbuffer[r]===void 0)i.__webglDepthbuffer[r]=e.createRenderbuffer(),he(i.__webglDepthbuffer[r],t,!1);else{let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,a=i.__webglDepthbuffer[r];e.bindRenderbuffer(e.RENDERBUFFER,a),e.framebufferRenderbuffer(e.FRAMEBUFFER,n,e.RENDERBUFFER,a)}}else{let r=t.texture.mipmaps;if(r&&r.length>0?n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer[0]):n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer),i.__webglDepthbuffer===void 0)i.__webglDepthbuffer=e.createRenderbuffer(),he(i.__webglDepthbuffer,t,!1);else{let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,r=i.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,r),e.framebufferRenderbuffer(e.FRAMEBUFFER,n,e.RENDERBUFFER,r)}}n.bindFramebuffer(e.FRAMEBUFFER,null)}function H(t,n,i){let a=r.get(t);n!==void 0&&me(a.__webglFramebuffer,t,t.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),i!==void 0&&ge(t)}function _e(t){let i=t.texture,s=r.get(t),c=r.get(i);t.addEventListener(`dispose`,D);let l=t.textures,u=t.isWebGLCubeRenderTarget===!0,d=l.length>1;if(d||(c.__webglTexture===void 0&&(c.__webglTexture=e.createTexture()),c.__version=i.version,o.memory.textures++),u){s.__webglFramebuffer=[];for(let t=0;t<6;t++)if(i.mipmaps&&i.mipmaps.length>0){s.__webglFramebuffer[t]=[];for(let n=0;n<i.mipmaps.length;n++)s.__webglFramebuffer[t][n]=e.createFramebuffer()}else s.__webglFramebuffer[t]=e.createFramebuffer()}else{if(i.mipmaps&&i.mipmaps.length>0){s.__webglFramebuffer=[];for(let t=0;t<i.mipmaps.length;t++)s.__webglFramebuffer[t]=e.createFramebuffer()}else s.__webglFramebuffer=e.createFramebuffer();if(d)for(let t=0,n=l.length;t<n;t++){let n=r.get(l[t]);n.__webglTexture===void 0&&(n.__webglTexture=e.createTexture(),o.memory.textures++)}if(t.samples>0&&Ce(t)===!1){s.__webglMultisampledFramebuffer=e.createFramebuffer(),s.__webglColorRenderbuffer=[],n.bindFramebuffer(e.FRAMEBUFFER,s.__webglMultisampledFramebuffer);for(let n=0;n<l.length;n++){let r=l[n];s.__webglColorRenderbuffer[n]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,s.__webglColorRenderbuffer[n]);let i=a.convert(r.format,r.colorSpace),o=a.convert(r.type),c=S(r.internalFormat,i,o,r.normalized,r.colorSpace,t.isXRRenderTarget===!0),u=Se(t);e.renderbufferStorageMultisample(e.RENDERBUFFER,u,c,t.width,t.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+n,e.RENDERBUFFER,s.__webglColorRenderbuffer[n])}e.bindRenderbuffer(e.RENDERBUFFER,null),t.depthBuffer&&(s.__webglDepthRenderbuffer=e.createRenderbuffer(),he(s.__webglDepthRenderbuffer,t,!0)),n.bindFramebuffer(e.FRAMEBUFFER,null)}}if(u){n.bindTexture(e.TEXTURE_CUBE_MAP,c.__webglTexture),se(e.TEXTURE_CUBE_MAP,i);for(let n=0;n<6;n++)if(i.mipmaps&&i.mipmaps.length>0)for(let r=0;r<i.mipmaps.length;r++)me(s.__webglFramebuffer[n][r],t,i,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+n,r);else me(s.__webglFramebuffer[n],t,i,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+n,0);y(i)&&b(e.TEXTURE_CUBE_MAP),n.unbindTexture()}else if(d){for(let i=0,a=l.length;i<a;i++){let a=l[i],o=r.get(a),c=e.TEXTURE_2D;(t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(c=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),n.bindTexture(c,o.__webglTexture),se(c,a),me(s.__webglFramebuffer,t,a,e.COLOR_ATTACHMENT0+i,c,0),y(a)&&b(c)}n.unbindTexture()}else{let r=e.TEXTURE_2D;if((t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(r=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),n.bindTexture(r,c.__webglTexture),se(r,i),i.mipmaps&&i.mipmaps.length>0)for(let n=0;n<i.mipmaps.length;n++)me(s.__webglFramebuffer[n],t,i,e.COLOR_ATTACHMENT0,r,n);else me(s.__webglFramebuffer,t,i,e.COLOR_ATTACHMENT0,r,0);y(i)&&b(r),n.unbindTexture()}t.depthBuffer&&ge(t)}function ve(e){let t=e.textures;for(let i=0,a=t.length;i<a;i++){let a=t[i];if(y(a)){let t=x(e),i=r.get(a).__webglTexture;n.bindTexture(t,i),b(t),n.unbindTexture()}}}let ye=[],be=[];function xe(t){if(t.samples>0){if(Ce(t)===!1){let i=t.textures,a=t.width,o=t.height,s=e.COLOR_BUFFER_BIT,c=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,u=r.get(t),d=i.length>1;if(d)for(let t=0;t<i.length;t++)n.bindFramebuffer(e.FRAMEBUFFER,u.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,null),n.bindFramebuffer(e.FRAMEBUFFER,u.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,null,0);n.bindFramebuffer(e.READ_FRAMEBUFFER,u.__webglMultisampledFramebuffer);let f=t.texture.mipmaps;f&&f.length>0?n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglFramebuffer[0]):n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglFramebuffer);for(let n=0;n<i.length;n++){if(t.resolveDepthBuffer&&(t.depthBuffer&&(s|=e.DEPTH_BUFFER_BIT),t.stencilBuffer&&t.resolveStencilBuffer&&(s|=e.STENCIL_BUFFER_BIT)),d){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,u.__webglColorRenderbuffer[n]);let t=r.get(i[n]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t,0)}e.blitFramebuffer(0,0,a,o,0,0,a,o,s,e.NEAREST),l===!0&&(ye.length=0,be.length=0,ye.push(e.COLOR_ATTACHMENT0+n),t.depthBuffer&&t.storeMultisampledDepthBuffer===!1&&(ye.push(c),be.push(c),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,be)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,ye))}if(n.bindFramebuffer(e.READ_FRAMEBUFFER,null),n.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),d)for(let t=0;t<i.length;t++){n.bindFramebuffer(e.FRAMEBUFFER,u.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,u.__webglColorRenderbuffer[t]);let a=r.get(i[t]).__webglTexture;n.bindFramebuffer(e.FRAMEBUFFER,u.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,a,0)}n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglMultisampledFramebuffer)}else if(t.depthBuffer&&t.storeMultisampledDepthBuffer===!1&&l){let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[n])}}}function Se(e){return Math.min(i.maxSamples,e.samples)}function Ce(e){let n=r.get(e);return e.samples>0&&t.has(`WEBGL_multisampled_render_to_texture`)===!0&&n.__useRenderToTexture!==!1}function we(e){let t=o.render.frame;f.get(e)!==t&&(f.set(e,t),e.update())}function Te(e,t){let n=e.colorSpace,r=e.format,i=e.type;return e.isCompressedTexture===!0||e.isVideoTexture===!0||n!==`srgb-linear`&&n!==``&&(Fn.getTransfer(n)===`srgb`?(r!==1023||i!==1009)&&q(`WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.`):Ee(`WebGLTextures: Unsupported texture color space:`,n)),t}function U(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement?(d.width=e.naturalWidth||e.width,d.height=e.naturalHeight||e.height):typeof VideoFrame<`u`&&e instanceof VideoFrame?(d.width=e.displayWidth,d.height=e.displayHeight):(d.width=e.width,d.height=e.height),d}this.allocateTextureUnit=te,this.resetTextureUnits=j,this.getTextureUnits=M,this.setTextureUnits=P,this.setTexture2D=re,this.setTexture2DArray=ie,this.setTexture3D=I,this.setTextureCube=L,this.rebindTextures=H,this.setupRenderTarget=_e,this.updateRenderTargetMipmap=ve,this.updateMultisampleRenderTarget=xe,this.setupDepthRenderbuffer=ge,this.setupFrameBufferTexture=me,this.useMultisampledRTT=Ce,this.isReversedDepthBuffer=function(){return n.buffers.depth.getReversed()}}function Ha(e,t){function n(n,r=``){let i,a=Fn.getTransfer(r);if(n===1009)return e.UNSIGNED_BYTE;if(n===1017)return e.UNSIGNED_SHORT_4_4_4_4;if(n===1018)return e.UNSIGNED_SHORT_5_5_5_1;if(n===35902)return e.UNSIGNED_INT_5_9_9_9_REV;if(n===35899)return e.UNSIGNED_INT_10F_11F_11F_REV;if(n===1010)return e.BYTE;if(n===1011)return e.SHORT;if(n===1012)return e.UNSIGNED_SHORT;if(n===1013)return e.INT;if(n===1014)return e.UNSIGNED_INT;if(n===1015)return e.FLOAT;if(n===1016)return e.HALF_FLOAT;if(n===1021)return e.ALPHA;if(n===1022)return e.RGB;if(n===1023)return e.RGBA;if(n===1026)return e.DEPTH_COMPONENT;if(n===1027)return e.DEPTH_STENCIL;if(n===1028)return e.RED;if(n===1029)return e.RED_INTEGER;if(n===1030)return e.RG;if(n===1031)return e.RG_INTEGER;if(n===1033)return e.RGBA_INTEGER;if(n===33776||n===33777||n===33778||n===33779){if(a===`srgb`){if(i=t.get(`WEBGL_compressed_texture_s3tc_srgb`),i!==null){if(n===33776)return i.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null}else if(i=t.get(`WEBGL_compressed_texture_s3tc`),i!==null){if(n===33776)return i.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null}if(n===35840||n===35841||n===35842||n===35843){if(i=t.get(`WEBGL_compressed_texture_pvrtc`),i!==null){if(n===35840)return i.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===35841)return i.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===35842)return i.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===35843)return i.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null}if(n===36196||n===37492||n===37496||n===37488||n===37489||n===37490||n===37491){if(i=t.get(`WEBGL_compressed_texture_etc`),i!==null){if(n===36196||n===37492)return a===`srgb`?i.COMPRESSED_SRGB8_ETC2:i.COMPRESSED_RGB8_ETC2;if(n===37496)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:i.COMPRESSED_RGBA8_ETC2_EAC;if(n===37488)return i.COMPRESSED_R11_EAC;if(n===37489)return i.COMPRESSED_SIGNED_R11_EAC;if(n===37490)return i.COMPRESSED_RG11_EAC;if(n===37491)return i.COMPRESSED_SIGNED_RG11_EAC}else return null}if(n===37808||n===37809||n===37810||n===37811||n===37812||n===37813||n===37814||n===37815||n===37816||n===37817||n===37818||n===37819||n===37820||n===37821){if(i=t.get(`WEBGL_compressed_texture_astc`),i!==null){if(n===37808)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:i.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===37809)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:i.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===37810)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:i.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===37811)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:i.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===37812)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:i.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===37813)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:i.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===37814)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:i.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===37815)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:i.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===37816)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:i.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===37817)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:i.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===37818)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:i.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===37819)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:i.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===37820)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:i.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===37821)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:i.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null}if(n===36492||n===36494||n===36495){if(i=t.get(`EXT_texture_compression_bptc`),i!==null){if(n===36492)return a===`srgb`?i.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:i.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===36494)return i.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===36495)return i.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null}if(n===36283||n===36284||n===36285||n===36286){if(i=t.get(`EXT_texture_compression_rgtc`),i!==null){if(n===36283)return i.COMPRESSED_RED_RGTC1_EXT;if(n===36284)return i.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===36285)return i.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===36286)return i.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null}return n===1020?e.UNSIGNED_INT_24_8:e[n]===void 0?null:e[n]}return{convert:n}}var Ua=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Wa=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,Ga=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new Gt(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new et({vertexShader:Ua,fragmentShader:Wa,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new d(new on(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Ka=class extends gn{constructor(e,t){super();let n=this,r=null,i=1,a=null,o=`local-floor`,s=1,c=null,l=null,u=null,d=null,p=null,m=null,g=typeof XRWebGLBinding<`u`,v=new Ga,y={},b=t.getContextAttributes(),x=null,S=null,C=[],w=[],T=new kt,E=null,D=null,O=new hn;O.viewport=new oe;let k=new hn;k.viewport=new oe;let A=[O,k],j=new _,M=null,N=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(e){let t=C[e];return t===void 0&&(t=new ie,C[e]=t),t.getTargetRaySpace()},this.getControllerGrip=function(e){let t=C[e];return t===void 0&&(t=new ie,C[e]=t),t.getGripSpace()},this.getHand=function(e){let t=C[e];return t===void 0&&(t=new ie,C[e]=t),t.getHandSpace()};function P(e){let t=w.indexOf(e.inputSource);if(t===-1)return;let n=C[t];n!==void 0&&(n.update(e.inputSource,e.frame,c||a),n.dispatchEvent({type:e.type,data:e.inputSource}))}function te(){r.removeEventListener(`select`,P),r.removeEventListener(`selectstart`,P),r.removeEventListener(`selectend`,P),r.removeEventListener(`squeeze`,P),r.removeEventListener(`squeezestart`,P),r.removeEventListener(`squeezeend`,P),r.removeEventListener(`end`,te),r.removeEventListener(`inputsourceschange`,ne);for(let e=0;e<C.length;e++){let t=w[e];t!==null&&(w[e]=null,C[e].disconnect(t))}M=null,N=null,v.reset();for(let e in y)delete y[e];if(e.setRenderTarget(x),p=null,d=null,u=null,r=null,S=null,ce.stop(),n.isPresenting=!1,e.setPixelRatio(E),e.setSize(T.width,T.height,!1),D!==null){let e=D.camera;e.fov=D.fov,e.zoom=D.zoom,e.updateProjectionMatrix(),D=null}n.dispatchEvent({type:`sessionend`})}this.setFramebufferScaleFactor=function(e){i=e,n.isPresenting===!0&&q(`WebXRManager: Cannot change framebuffer scale while presenting.`)},this.setReferenceSpaceType=function(e){o=e,n.isPresenting===!0&&q(`WebXRManager: Cannot change reference space type while presenting.`)},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(e){c=e},this.getBaseLayer=function(){return d===null?p:d},this.getBinding=function(){return u===null&&g&&(u=new XRWebGLBinding(r,t)),u},this.getFrame=function(){return m},this.getSession=function(){return r},this.setSession=async function(l){if(r=l,r!==null){if(x=e.getRenderTarget(),r.addEventListener(`select`,P),r.addEventListener(`selectstart`,P),r.addEventListener(`selectend`,P),r.addEventListener(`squeeze`,P),r.addEventListener(`squeezestart`,P),r.addEventListener(`squeezeend`,P),r.addEventListener(`end`,te),r.addEventListener(`inputsourceschange`,ne),b.xrCompatible!==!0&&await t.makeXRCompatible(),E=e.getPixelRatio(),e.getSize(T),g&&`createProjectionLayer`in XRWebGLBinding.prototype){let n=null,a=null,o=null;b.depth&&(o=b.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,n=b.stencil?W:K,a=b.stencil?xe:h);let s={colorFormat:t.RGBA8,depthFormat:o,scaleFactor:i};u=this.getBinding(),d=u.createProjectionLayer(s),r.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),S=new ee(d.textureWidth,d.textureHeight,{format:xt,type:f,depthTexture:new Fe(d.textureWidth,d.textureHeight,a,void 0,void 0,void 0,void 0,void 0,void 0,n),stencilBuffer:b.stencil,colorSpace:e.outputColorSpace,samples:b.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1,storeMultisampledDepthBuffer:d.ignoreDepthValues===!1,storeMultisampledStencilBuffer:d.ignoreDepthValues===!1})}else{let n={antialias:b.antialias,alpha:!0,depth:b.depth,stencil:b.stencil,framebufferScaleFactor:i};p=new XRWebGLLayer(r,t,n),r.updateRenderState({baseLayer:p}),e.setPixelRatio(1),e.setSize(p.framebufferWidth,p.framebufferHeight,!1),S=new ee(p.framebufferWidth,p.framebufferHeight,{format:xt,type:f,colorSpace:e.outputColorSpace,stencilBuffer:b.stencil,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1,storeMultisampledDepthBuffer:p.ignoreDepthValues===!1,storeMultisampledStencilBuffer:p.ignoreDepthValues===!1})}S.isXRRenderTarget=!0,this.setFoveation(s),c=null,a=await r.requestReferenceSpace(o),ce.setContext(r),ce.start(),n.isPresenting=!0,n.dispatchEvent({type:`sessionstart`})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return v.getDepthTexture()};function ne(e){for(let t=0;t<e.removed.length;t++){let n=e.removed[t],r=w.indexOf(n);r>=0&&(w[r]=null,C[r].disconnect(n))}for(let t=0;t<e.added.length;t++){let n=e.added[t],r=w.indexOf(n);if(r===-1){for(let e=0;e<C.length;e++)if(e>=w.length){w.push(n),r=e;break}else if(w[e]===null){w[e]=n,r=e;break}if(r===-1)break}let i=C[r];i&&i.connect(n)}}let re=new R,F=new R;function I(e,t,n){re.setFromMatrixPosition(t.matrixWorld),F.setFromMatrixPosition(n.matrixWorld);let r=re.distanceTo(F),i=t.projectionMatrix.elements,a=n.projectionMatrix.elements,o=i[14]/(i[10]-1),s=i[14]/(i[10]+1),c=(i[9]+1)/i[5],l=(i[9]-1)/i[5],u=(i[8]-1)/i[0],d=(a[8]+1)/a[0],f=o*u,p=o*d,m=r/(-u+d),h=m*-u;if(t.matrixWorld.decompose(e.position,e.quaternion,e.scale),e.translateX(h),e.translateZ(m),e.matrixWorld.compose(e.position,e.quaternion,e.scale),e.matrixWorldInverse.copy(e.matrixWorld).invert(),i[10]===-1)e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse);else{let t=o+m,n=s+m,i=f-h,a=p+(r-h),u=c*s/n*t,d=l*s/n*t;e.projectionMatrix.makePerspective(i,a,u,d,t,n),e.projectionMatrixInverse.copy(e.projectionMatrix).invert()}}function L(e,t){t===null?e.matrixWorld.copy(e.matrix):e.matrixWorld.multiplyMatrices(t.matrixWorld,e.matrix),e.matrixWorldInverse.copy(e.matrixWorld).invert()}this.updateCamera=function(e){if(r===null)return;let t=e.near,n=e.far;v.texture!==null&&(v.depthNear>0&&(t=v.depthNear),v.depthFar>0&&(n=v.depthFar)),j.near=k.near=O.near=t,j.far=k.far=O.far=n,(M!==j.near||N!==j.far)&&(r.updateRenderState({depthNear:j.near,depthFar:j.far}),M=j.near,N=j.far),j.layers.mask=e.layers.mask|6,O.layers.mask=j.layers.mask&-5,k.layers.mask=j.layers.mask&-3;let i=e.parent,a=j.cameras;L(j,i);for(let e=0;e<a.length;e++)L(a[e],i);a.length===2?I(j,O,k):j.projectionMatrix.copy(O.projectionMatrix),D===null&&e.isPerspectiveCamera&&(D={camera:e,fov:e.fov,zoom:e.zoom}),ae(e,j,i)};function ae(e,t,n){n===null?e.matrix.copy(t.matrixWorld):(e.matrix.copy(n.matrixWorld),e.matrix.invert(),e.matrix.multiply(t.matrixWorld)),e.matrix.decompose(e.position,e.quaternion,e.scale),e.updateMatrixWorld(!0),e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse),e.isPerspectiveCamera&&(e.fov=rt*2*Math.atan(1/e.projectionMatrix.elements[5]),e.zoom=1)}this.getCamera=function(){return j},this.getFoveation=function(){if(d!==null||p!==null)return s},this.setFoveation=function(e){s=e,d!==null&&(d.fixedFoveation=e),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=e)},this.hasDepthSensing=function(){return v.texture!==null},this.getDepthSensingMesh=function(){return v.getMesh(j)},this.getCameraTexture=function(e){return y[e]};let z=null;function se(t,i){if(l=i.getViewerPose(c||a),m=i,l!==null){let t=l.views;p!==null&&(e.setRenderTargetFramebuffer(S,p.framebuffer),e.setRenderTarget(S));let i=!1;t.length!==j.cameras.length&&(j.cameras.length=0,i=!0);for(let n=0;n<t.length;n++){let r=t[n],a=null;if(p!==null)a=p.getViewport(r);else{let t=u.getViewSubImage(d,r);a=t.viewport,n===0&&(e.setRenderTargetTextures(S,t.colorTexture,t.depthStencilTexture),e.setRenderTarget(S))}let o=A[n];o===void 0&&(o=new hn,o.layers.enable(n),o.viewport=new oe,A[n]=o),o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.quaternion,o.scale),o.projectionMatrix.fromArray(r.projectionMatrix),o.projectionMatrixInverse.copy(o.projectionMatrix).invert(),o.viewport.set(a.x,a.y,a.width,a.height),n===0&&(j.matrix.copy(o.matrix),j.matrix.decompose(j.position,j.quaternion,j.scale)),i===!0&&j.cameras.push(o)}let a=r.enabledFeatures;if(a&&a.includes(`depth-sensing`)&&r.depthUsage==`gpu-optimized`&&g){u=n.getBinding();let e=u.getDepthInformation(t[0]);e&&e.isValid&&e.texture&&v.init(e,r.renderState)}if(a&&a.includes(`camera-access`)&&g){e.state.unbindTexture(),u=n.getBinding();for(let e=0;e<t.length;e++){let n=t[e].camera;if(n){let e=y[n];e||(e=new Gt,y[n]=e);let t=u.getCameraImage(n);e.sourceTexture=t}}}}for(let e=0;e<C.length;e++){let t=w[e],n=C[e];t!==null&&n!==void 0&&n.update(t,i,c||a)}z&&z(t,i),i.detectedPlanes&&n.dispatchEvent({type:`planesdetected`,data:i}),m=null}let ce=new Rn;ce.setAnimationLoop(se),this.setAnimationLoop=function(e){z=e},this.dispose=function(){}}},qa=new Ln,Ja=new H;Ja.set(-1,0,0,0,1,0,0,0,1);function Ya(e,t){function n(e,t){e.matrixAutoUpdate===!0&&e.updateMatrix(),t.value.copy(e.matrix)}function r(t,n){n.color.getRGB(t.fogColor.value,we(e)),n.isFog?(t.fogNear.value=n.near,t.fogFar.value=n.far):n.isFogExp2&&(t.fogDensity.value=n.density)}function i(e,t,n,r,i){t.isNodeMaterial?t.uniformsNeedUpdate=!1:t.isMeshBasicMaterial?a(e,t):t.isMeshLambertMaterial?(a(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshToonMaterial?(a(e,t),d(e,t)):t.isMeshPhongMaterial?(a(e,t),u(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshStandardMaterial?(a(e,t),f(e,t),t.isMeshPhysicalMaterial&&p(e,t,i)):t.isMeshMatcapMaterial?(a(e,t),m(e,t)):t.isMeshDepthMaterial?a(e,t):t.isMeshDistanceMaterial?(a(e,t),h(e,t)):t.isMeshNormalMaterial?a(e,t):t.isLineBasicMaterial?(o(e,t),t.isLineDashedMaterial&&s(e,t)):t.isPointsMaterial?c(e,t,n,r):t.isSpriteMaterial?l(e,t):t.isShadowMaterial?(e.color.value.copy(t.color),e.opacity.value=t.opacity):t.isShaderMaterial&&(t.uniformsNeedUpdate=!1)}function a(e,r){e.opacity.value=r.opacity,r.color&&e.diffuse.value.copy(r.color),r.emissive&&e.emissive.value.copy(r.emissive).multiplyScalar(r.emissiveIntensity),r.map&&(e.map.value=r.map,n(r.map,e.mapTransform)),r.alphaMap&&(e.alphaMap.value=r.alphaMap,n(r.alphaMap,e.alphaMapTransform)),r.bumpMap&&(e.bumpMap.value=r.bumpMap,n(r.bumpMap,e.bumpMapTransform),e.bumpScale.value=r.bumpScale,r.side===1&&(e.bumpScale.value*=-1)),r.normalMap&&(e.normalMap.value=r.normalMap,n(r.normalMap,e.normalMapTransform),e.normalScale.value.copy(r.normalScale),r.side===1&&e.normalScale.value.negate()),r.displacementMap&&(e.displacementMap.value=r.displacementMap,n(r.displacementMap,e.displacementMapTransform),e.displacementScale.value=r.displacementScale,e.displacementBias.value=r.displacementBias),r.emissiveMap&&(e.emissiveMap.value=r.emissiveMap,n(r.emissiveMap,e.emissiveMapTransform)),r.specularMap&&(e.specularMap.value=r.specularMap,n(r.specularMap,e.specularMapTransform)),r.alphaTest>0&&(e.alphaTest.value=r.alphaTest);let i=t.get(r),a=i.envMap,o=i.envMapRotation;a&&(e.envMap.value=a,e.envMapRotation.value.setFromMatrix4(qa.makeRotationFromEuler(o)).transpose(),a.isCubeTexture&&a.isRenderTargetTexture===!1&&e.envMapRotation.value.premultiply(Ja),e.reflectivity.value=r.reflectivity,e.ior.value=r.ior,e.refractionRatio.value=r.refractionRatio),r.lightMap&&(e.lightMap.value=r.lightMap,e.lightMapIntensity.value=r.lightMapIntensity,n(r.lightMap,e.lightMapTransform)),r.aoMap&&(e.aoMap.value=r.aoMap,e.aoMapIntensity.value=r.aoMapIntensity,n(r.aoMap,e.aoMapTransform))}function o(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform))}function s(e,t){e.dashSize.value=t.dashSize,e.totalSize.value=t.dashSize+t.gapSize,e.scale.value=t.scale}function c(e,t,r,i){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.size.value=t.size*r,e.scale.value=i*.5,t.map&&(e.map.value=t.map,n(t.map,e.uvTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function l(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.rotation.value=t.rotation,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function u(e,t){e.specular.value.copy(t.specular),e.shininess.value=Math.max(t.shininess,1e-4)}function d(e,t){t.gradientMap&&(e.gradientMap.value=t.gradientMap)}function f(e,t){e.metalness.value=t.metalness,t.metalnessMap&&(e.metalnessMap.value=t.metalnessMap,n(t.metalnessMap,e.metalnessMapTransform)),e.roughness.value=t.roughness,t.roughnessMap&&(e.roughnessMap.value=t.roughnessMap,n(t.roughnessMap,e.roughnessMapTransform)),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)}function p(e,t,r){e.ior.value=t.ior,t.sheen>0&&(e.sheenColor.value.copy(t.sheenColor).multiplyScalar(t.sheen),e.sheenRoughness.value=t.sheenRoughness,t.sheenColorMap&&(e.sheenColorMap.value=t.sheenColorMap,n(t.sheenColorMap,e.sheenColorMapTransform)),t.sheenRoughnessMap&&(e.sheenRoughnessMap.value=t.sheenRoughnessMap,n(t.sheenRoughnessMap,e.sheenRoughnessMapTransform))),t.clearcoat>0&&(e.clearcoat.value=t.clearcoat,e.clearcoatRoughness.value=t.clearcoatRoughness,t.clearcoatMap&&(e.clearcoatMap.value=t.clearcoatMap,n(t.clearcoatMap,e.clearcoatMapTransform)),t.clearcoatRoughnessMap&&(e.clearcoatRoughnessMap.value=t.clearcoatRoughnessMap,n(t.clearcoatRoughnessMap,e.clearcoatRoughnessMapTransform)),t.clearcoatNormalMap&&(e.clearcoatNormalMap.value=t.clearcoatNormalMap,n(t.clearcoatNormalMap,e.clearcoatNormalMapTransform),e.clearcoatNormalScale.value.copy(t.clearcoatNormalScale),t.side===1&&e.clearcoatNormalScale.value.negate())),t.dispersion>0&&(e.dispersion.value=t.dispersion),t.retroreflectivity>0&&(e.retroreflectivity.value=t.retroreflectivity),t.iridescence>0&&(e.iridescence.value=t.iridescence,e.iridescenceIOR.value=t.iridescenceIOR,e.iridescenceThicknessMinimum.value=t.iridescenceThicknessRange[0],e.iridescenceThicknessMaximum.value=t.iridescenceThicknessRange[1],t.iridescenceMap&&(e.iridescenceMap.value=t.iridescenceMap,n(t.iridescenceMap,e.iridescenceMapTransform)),t.iridescenceThicknessMap&&(e.iridescenceThicknessMap.value=t.iridescenceThicknessMap,n(t.iridescenceThicknessMap,e.iridescenceThicknessMapTransform))),t.transmission>0&&(e.transmission.value=t.transmission,e.transmissionSamplerMap.value=r.texture,e.transmissionSamplerSize.value.set(r.width,r.height),t.transmissionMap&&(e.transmissionMap.value=t.transmissionMap,n(t.transmissionMap,e.transmissionMapTransform)),e.thickness.value=t.thickness,t.thicknessMap&&(e.thicknessMap.value=t.thicknessMap,n(t.thicknessMap,e.thicknessMapTransform)),e.attenuationDistance.value=t.attenuationDistance,e.attenuationColor.value.copy(t.attenuationColor)),t.anisotropy>0&&(e.anisotropyVector.value.set(t.anisotropy*Math.cos(t.anisotropyRotation),t.anisotropy*Math.sin(t.anisotropyRotation)),t.anisotropyMap&&(e.anisotropyMap.value=t.anisotropyMap,n(t.anisotropyMap,e.anisotropyMapTransform))),e.specularIntensity.value=t.specularIntensity,e.specularColor.value.copy(t.specularColor),t.specularColorMap&&(e.specularColorMap.value=t.specularColorMap,n(t.specularColorMap,e.specularColorMapTransform)),t.specularIntensityMap&&(e.specularIntensityMap.value=t.specularIntensityMap,n(t.specularIntensityMap,e.specularIntensityMapTransform))}function m(e,t){t.matcap&&(e.matcap.value=t.matcap)}function h(e,n){let r=t.get(n).light;e.referencePosition.value.setFromMatrixPosition(r.matrixWorld),e.nearDistance.value=r.shadow.camera.near,e.farDistance.value=r.shadow.camera.far}return{refreshFogUniforms:r,refreshMaterialUniforms:i}}function Xa(e,t,n,r){let i={},a={},o=[],s=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function c(e,t){let n=t.program;r.uniformBlockBinding(e,n)}function l(e,n){let o=i[e.id];o===void 0&&(g(e),o=u(e),i[e.id]=o,e.addEventListener(`dispose`,v));let s=n.program;r.updateUBOMapping(e,s);let c=t.render.frame;a[e.id]!==c&&(f(e),a[e.id]=c)}function u(t){let n=d();t.__bindingPointIndex=n;let r=e.createBuffer(),i=t.__size,a=t.usage;return e.bindBuffer(e.UNIFORM_BUFFER,r),e.bufferData(e.UNIFORM_BUFFER,i,a),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,n,r),r}function d(){for(let e=0;e<s;e++)if(o.indexOf(e)===-1)return o.push(e),e;return Ee(`WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached.`),0}function f(t){let n=i[t.id],r=t.uniforms,a=t.__cache;e.bindBuffer(e.UNIFORM_BUFFER,n);for(let e=0,t=r.length;e<t;e++){let t=r[e];if(Array.isArray(t))for(let n=0,r=t.length;n<r;n++)p(t[n],e,n,a);else p(t,e,0,a)}e.bindBuffer(e.UNIFORM_BUFFER,null)}function p(t,n,r,i){if(h(t,n,r,i)===!0){let n=t.__offset,r=t.value;if(Array.isArray(r)){let e=0;for(let n=0;n<r.length;n++){let i=r[n],a=_(i);m(i,t.__data,e),typeof i!=`number`&&typeof i!=`boolean`&&!i.isMatrix3&&!ArrayBuffer.isView(i)&&(e+=a.storage/Float32Array.BYTES_PER_ELEMENT)}}else m(r,t.__data,0);e.bufferSubData(e.UNIFORM_BUFFER,n,t.__data)}}function m(e,t,n){typeof e==`number`||typeof e==`boolean`?t[0]=e:e.isMatrix3?(t[0]=e.elements[0],t[1]=e.elements[1],t[2]=e.elements[2],t[3]=0,t[4]=e.elements[3],t[5]=e.elements[4],t[6]=e.elements[5],t[7]=0,t[8]=e.elements[6],t[9]=e.elements[7],t[10]=e.elements[8],t[11]=0):ArrayBuffer.isView(e)?t.set(new e.constructor(e.buffer,e.byteOffset,t.length)):e.toArray(t,n)}function h(e,t,n,r){let i=e.value,a=t+`_`+n;if(r[a]===void 0)return r[a]=typeof i==`number`||typeof i==`boolean`?i:ArrayBuffer.isView(i)?i.slice():i.clone(),!0;{let e=r[a];if(typeof i==`number`||typeof i==`boolean`){if(e!==i)return r[a]=i,!0}else if(ArrayBuffer.isView(i))return!0;else if(e.equals(i)===!1)return e.copy(i),!0}return!1}function g(e){let t=e.uniforms,n=0;for(let e=0,r=t.length;e<r;e++){let r=Array.isArray(t[e])?t[e]:[t[e]];for(let e=0,t=r.length;e<t;e++){let t=r[e],i=Array.isArray(t.value)?t.value:[t.value];for(let e=0,r=i.length;e<r;e++){let r=i[e],a=_(r),o=n%16,s=o%a.boundary,c=o+s;n+=s,c!==0&&16-c<a.storage&&(n+=16-c),t.__data=new Float32Array(a.storage/Float32Array.BYTES_PER_ELEMENT),t.__offset=n,n+=a.storage}}}let r=n%16;return r>0&&(n+=16-r),e.__size=n,e.__cache={},this}function _(e){let t={boundary:0,storage:0};return typeof e==`number`||typeof e==`boolean`?(t.boundary=4,t.storage=4):e.isVector2?(t.boundary=8,t.storage=8):e.isVector3||e.isColor?(t.boundary=16,t.storage=12):e.isVector4?(t.boundary=16,t.storage=16):e.isMatrix3?(t.boundary=48,t.storage=48):e.isMatrix4?(t.boundary=64,t.storage=64):e.isTexture?q(`WebGLRenderer: Texture samplers can not be part of an uniforms group.`):ArrayBuffer.isView(e)?(t.boundary=16,t.storage=e.byteLength):q(`WebGLRenderer: Unsupported uniform value type.`,e),t}function v(t){let n=t.target;n.removeEventListener(`dispose`,v);let r=o.indexOf(n.__bindingPointIndex);o.splice(r,1),e.deleteBuffer(i[n.id]),delete i[n.id],delete a[n.id]}function y(){for(let t in i)e.deleteBuffer(i[t]);o=[],i={},a={}}return{bind:c,update:l,dispose:y}}var Za=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),Qa=null;function $a(){return Qa===null&&(Qa=new A(Za,16,16,te,at),Qa.name=`DFG_LUT`,Qa.minFilter=ue,Qa.magFilter=ue,Qa.wrapS=F,Qa.wrapT=F,Qa.generateMipmaps=!1,Qa.needsUpdate=!0),Qa}var eo=class{constructor(e={}){let{canvas:t=In(),context:n=null,depth:r=!0,stencil:i=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:u=`default`,failIfMajorPerformanceCaveat:d=!1,reversedDepthBuffer:p=!1,outputBufferType:m=f}=e;this.isWebGLRenderer=!0;let g;if(n!==null){if(typeof WebGLRenderingContext<`u`&&n instanceof WebGLRenderingContext)throw Error(`THREE.WebGLRenderer: WebGL 1 is not supported since r163.`);g=n.getContextAttributes().alpha}else g=a;let _=m,v=new Set([gt,tn,Ie]),y=new Set([f,h,s,xe,le,Mt]),x=new Uint32Array(4),S=new Int32Array(4),C=new R,w=null,T=null,E=[],D=[],O=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=0,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let k=this,A=!1,j=null,M=null,N=null,P=null;this._outputColorSpace=Ge;let te=0,re=0,F=null,ie=-1,I=null,L=new oe,ae=new oe,z=null,se=new V(0),ce=0,ue=t.width,de=t.height,B=1,fe=null,pe=null,me=new oe(0,0,ue,de),he=new oe(0,0,ue,de),ge=!1,H=new fn,_e=!1,ve=!1,ye=new Ln,be=new R,Se=new oe,Ce={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},we=!1;function Te(){return F===null?B:1}let U=n;function De(e,n){return t.getContext(e,n)}let Oe,Ae,W,je,G,K,Me,Ne,Pe,Fe,Le,Re,ze,Be,Ve,He,Ue,We,Ke,qe,Je,Ye,Xe;try{let e={alpha:!0,depth:r,stencil:i,antialias:o,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:u,failIfMajorPerformanceCaveat:d};if(`setAttribute`in t&&t.setAttribute(`data-engine`,`three.js r186`),t.addEventListener(`webglcontextlost`,$e,!1),t.addEventListener(`webglcontextrestored`,et,!1),t.addEventListener(`webglcontextcreationerror`,tt,!1),U===null){let t=`webgl2`;if(U=De(t,e),U===null)throw De(t)?Error(`THREE.WebGLRenderer: Error creating WebGL context with your selected attributes.`):Error(`THREE.WebGLRenderer: Error creating WebGL context.`)}Ze()}catch(e){throw t.removeEventListener(`webglcontextlost`,$e,!1),t.removeEventListener(`webglcontextrestored`,et,!1),t.removeEventListener(`webglcontextcreationerror`,tt,!1),Ee(`WebGLRenderer: `+e.message),e}function Ze(){Oe=new vr(U),Oe.init(),Je=new Ha(U,Oe),Ae=new qn(U,Oe,e,Je),W=new Ba(U,Oe),Ae.reversedDepthBuffer&&p&&W.buffers.depth.setReversed(!0),M=U.createFramebuffer(),N=U.createFramebuffer(),P=U.createFramebuffer(),je=new xr(U),G=new ba,K=new Va(U,Oe,W,G,Ae,Je,je),Me=new _r(k),Ne=new zn(U),Ye=new Gn(U,Ne),Pe=new yr(U,Ne,je,Ye),Fe=new Cr(U,Pe,Ne,Ye,je),We=new Sr(U,Ae,K),Ve=new Jn(G),Le=new ya(k,Me,Oe,Ae,Ye,Ve),Re=new Ya(k,G),ze=new wa,Be=new ja(Oe),Ue=new Wn(k,Me,W,Fe,g,c),He=new za(k,Fe,Ae),Xe=new Xa(U,je,Ae,W),Ke=new Kn(U,Oe,je),qe=new br(U,Oe,je),je.programs=Le.programs,k.capabilities=Ae,k.extensions=Oe,k.properties=G,k.renderLists=ze,k.shadowMap=He,k.state=W,k.info=je}_!==1009&&(O=new Tr(_,t.width,t.height,o,r,i));let Qe=new Ka(k,U);this.xr=Qe,this.getContext=function(){return U},this.getContextAttributes=function(){return U.getContextAttributes()},this.forceContextLoss=function(){let e=Oe.get(`WEBGL_lose_context`);e&&e.loseContext()},this.forceContextRestore=function(){let e=Oe.get(`WEBGL_lose_context`);e&&e.restoreContext()},this.getPixelRatio=function(){return B},this.setPixelRatio=function(e){e!==void 0&&(B=e,this.setSize(ue,de,!1))},this.getSize=function(e){return e.set(ue,de)},this.setSize=function(e,n,r=!0){if(Qe.isPresenting){q(`WebGLRenderer: Can't change size while VR device is presenting.`);return}ue=e,de=n,t.width=Math.floor(e*B),t.height=Math.floor(n*B),r===!0&&(t.style.width=e+`px`,t.style.height=n+`px`),O!==null&&O.setSize(t.width,t.height),this.setViewport(0,0,e,n)},this.getDrawingBufferSize=function(e){return e.set(ue*B,de*B).floor()},this.setDrawingBufferSize=function(e,n,r){ue=e,de=n,B=r,t.width=Math.floor(e*r),t.height=Math.floor(n*r),this.setViewport(0,0,e,n)},this.setEffects=function(e){if(_===1009){Ee(`WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.`);return}if(e){for(let t=0;t<e.length;t++)if(e[t].isOutputPass===!0){q(`WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.`);break}}O.setEffects(e||[])},this.getCurrentViewport=function(e){return e.copy(L)},this.getViewport=function(e){return e.copy(me)},this.setViewport=function(e,t,n,r){e.isVector4?me.set(e.x,e.y,e.z,e.w):me.set(e,t,n,r),W.viewport(L.copy(me).multiplyScalar(B).round())},this.getScissor=function(e){return e.copy(he)},this.setScissor=function(e,t,n,r){e.isVector4?he.set(e.x,e.y,e.z,e.w):he.set(e,t,n,r),W.scissor(ae.copy(he).multiplyScalar(B).round())},this.getScissorTest=function(){return ge},this.setScissorTest=function(e){W.setScissorTest(ge=e)},this.setOpaqueSort=function(e){fe=e},this.setTransparentSort=function(e){pe=e},this.getClearColor=function(e){return e.copy(Ue.getClearColor())},this.setClearColor=function(){Ue.setClearColor(...arguments)},this.getClearAlpha=function(){return Ue.getClearAlpha()},this.setClearAlpha=function(){Ue.setClearAlpha(...arguments)},this.clear=function(e=!0,t=!0,n=!0){let r=0;if(e){let e=!1;if(F!==null){let t=F.texture.format;e=v.has(t)}if(e){let e=F.texture.type,t=y.has(e),n=Ue.getClearColor(),r=Ue.getClearAlpha(),i=n.r,a=n.g,o=n.b;t?(x[0]=i,x[1]=a,x[2]=o,x[3]=r,U.clearBufferuiv(U.COLOR,0,x)):(S[0]=i,S[1]=a,S[2]=o,S[3]=r,U.clearBufferiv(U.COLOR,0,S))}else r|=U.COLOR_BUFFER_BIT}t&&(r|=U.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),n&&(r|=U.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),r!==0&&U.clear(r)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(e){e.setRenderer(this),j=e},this.dispose=function(){t.removeEventListener(`webglcontextlost`,$e,!1),t.removeEventListener(`webglcontextrestored`,et,!1),t.removeEventListener(`webglcontextcreationerror`,tt,!1),Ue.dispose(),ze.dispose(),Be.dispose(),G.dispose(),Me.dispose(),Fe.dispose(),Ye.dispose(),Xe.dispose(),Le.dispose(),Qe.dispose(),Qe.removeEventListener(`sessionstart`,lt),Qe.removeEventListener(`sessionend`,ut),dt.stop()};function $e(e){e.preventDefault(),ke(`WebGLRenderer: Context Lost.`),A=!0}function et(){ke(`WebGLRenderer: Context Restored.`),A=!1;let e=je.autoReset,t=He.enabled,n=He.autoUpdate,r=He.needsUpdate,i=He.type;Ze(),je.autoReset=e,He.enabled=t,He.autoUpdate=n,He.needsUpdate=r,He.type=i}function tt(e){Ee(`WebGLRenderer: A WebGL context could not be created. Reason: `,e.statusMessage)}function nt(e){let t=e.target;t.removeEventListener(`dispose`,nt),rt(t)}function rt(e){it(e),G.remove(e)}function it(e){let t=G.get(e).programs;t!==void 0&&(t.forEach(function(e){Le.releaseProgram(e)}),e.isShaderMaterial&&Le.releaseShaderCache(e))}this.renderBufferDirect=function(e,t,n,r,i,a){t===null&&(t=Ce);let o=i.isMesh&&i.matrixWorld.determinantAffine()<0,s=St(e,t,n,r,i);W.setMaterial(r,o);let c=n.index,l=1;if(r.wireframe===!0){if(c=Pe.getWireframeAttribute(n),c===void 0)return;l=2}let u=n.drawRange,d=n.attributes.position,f=u.start*l,p=(u.start+u.count)*l;a!==null&&(f=Math.max(f,a.start*l),p=Math.min(p,(a.start+a.count)*l)),c===null?d!=null&&(f=Math.max(f,0),p=Math.min(p,d.count)):(f=Math.max(f,0),p=Math.min(p,c.count));let m=p-f;if(m<0||m===1/0)return;Ye.setup(i,r,s,n,c);let h,g=Ke;if(c!==null&&(h=Ne.get(c),g=qe,g.setIndex(h)),i.isMesh)r.wireframe===!0?(W.setLineWidth(r.wireframeLinewidth*Te()),g.setMode(U.LINES)):g.setMode(U.TRIANGLES);else if(i.isLine){let e=r.linewidth;e===void 0&&(e=1),W.setLineWidth(e*Te()),i.isLineSegments?g.setMode(U.LINES):i.isLineLoop?g.setMode(U.LINE_LOOP):g.setMode(U.LINE_STRIP)}else i.isPoints?g.setMode(U.POINTS):i.isSprite&&g.setMode(U.TRIANGLES);if(i.isBatchedMesh){if(Oe.get(`WEBGL_multi_draw`))g.renderMultiDraw(i._multiDrawStarts,i._multiDrawCounts,i._multiDrawCount);else{let e=i._multiDrawStarts,t=i._multiDrawCounts,n=i._multiDrawCount,a=c?Ne.get(c).bytesPerElement:1,o=G.get(r).currentProgram.getUniforms();for(let r=0;r<n;r++)o.setValue(U,`_gl_DrawID`,r),g.render(e[r]/a,t[r])}}else if(i.isInstancedMesh)g.renderInstances(f,m,i.count);else if(n.isInstancedBufferGeometry){let e=n._maxInstanceCount===void 0?1/0:n._maxInstanceCount,t=Math.min(n.instanceCount,e);g.renderInstances(f,m,t)}else g.render(f,m)};function ot(e,t,n,r){j!==null&&e.isNodeMaterial&&j.setObject(r,e),_e===!0&&Ve.setState(e,n,!1),e.transparent===!0&&e.side===2&&e.forceSinglePass===!1?(e.side=1,e.needsUpdate=!0,vt(e,t,r),e.side=0,e.needsUpdate=!0,vt(e,t,r),e.side=2):vt(e,t,r)}this.compile=function(e,t,n=null){n===null&&(n=e),j!==null&&j.renderStart(e,t,n),T=Be.get(n),T.init(t),D.push(T),n.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(T.pushLight(e),e.castShadow&&T.pushShadow(e))}),e!==n&&e.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(T.pushLight(e),e.castShadow&&T.pushShadow(e))}),T.setupLights(),j!==null&&j.updateLights(T.state.lightsArray),ve=this.localClippingEnabled,_e=Ve.init(this.clippingPlanes,ve),_e===!0&&Ve.setGlobalState(this.clippingPlanes,t),j!==null&&He.render(T.state.shadowsArray,n,t);let r=new Set;return e.traverse(function(e){if(!(e.isMesh||e.isPoints||e.isLine||e.isSprite))return;let i=e.material;if(i){if(Array.isArray(i))for(let a=0;a<i.length;a++){let o=i[a];ot(o,n,t,e),r.add(o)}else ot(i,n,t,e),r.add(i)}}),T=D.pop(),j!==null&&j.renderEnd(),r},this.compileAsync=function(e,t,n=null){let r=this.compile(e,t,n);return new Promise(t=>{function n(){if(r.forEach(function(e){let t=G.get(e).currentProgram;(t===void 0||t.isReady())&&r.delete(e)}),r.size===0){t(e);return}setTimeout(n,10)}Oe.get(`KHR_parallel_shader_compile`)===null?setTimeout(n,10):n()})};let st=null;function ct(e){st&&st(e)}function lt(){dt.stop()}function ut(){dt.start()}let dt=new Rn;dt.setAnimationLoop(ct),typeof self<`u`&&dt.setContext(self),this.setAnimationLoop=function(e){st=e,Qe.setAnimationLoop(e),e===null?dt.stop():dt.start()},Qe.addEventListener(`sessionstart`,lt),Qe.addEventListener(`sessionend`,ut),this.render=function(e,t){if(t!==void 0&&t.isCamera!==!0){Ee(`WebGLRenderer.render: camera is not an instance of THREE.Camera.`);return}if(A===!0)return;j!==null&&j.renderStart(e,t);let n=Qe.enabled===!0&&Qe.isPresenting===!0,r=O!==null&&(F===null||n)&&O.begin(k,F);if(e.matrixWorldAutoUpdate===!0&&e.updateMatrixWorld(),t.parent===null&&t.matrixWorldAutoUpdate===!0&&t.updateMatrixWorld(),Qe.enabled===!0&&Qe.isPresenting===!0&&(O===null||O.isCompositing()===!1)&&(Qe.cameraAutoUpdate===!0&&Qe.updateCamera(t),t=Qe.getCamera()),e.isScene===!0&&e.onBeforeRender(k,e,t,F),T=Be.get(e,D.length),T.init(t),T.state.textureUnits=K.getTextureUnits(),D.push(T),ye.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),H.setFromProjectionMatrix(ye,b,t.reversedDepth),ve=this.localClippingEnabled,_e=Ve.init(this.clippingPlanes,ve),w=ze.get(e,E.length),w.init(),E.push(w),Qe.enabled===!0&&Qe.isPresenting===!0){let e=k.xr.getDepthSensingMesh();e!==null&&ft(e,t,-1/0,k.sortObjects)}ft(e,t,0,k.sortObjects),w.finish(),j!==null&&j.updateLights(T.state.lightsArray),k.sortObjects===!0&&w.sort(fe,pe),we=Qe.enabled===!1||Qe.isPresenting===!1||Qe.hasDepthSensing()===!1,we&&Ue.addToRenderList(w,e),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),_e===!0&&Ve.beginShadows();let i=T.state.shadowsArray;if(He.render(i,e,t),_e===!0&&Ve.endShadows(),(r&&O.hasRenderPass())===!1){let n=w.opaque,r=w.transmissive;if(T.setupLights(),t.isArrayCamera){let i=t.cameras;if(r.length>0)for(let t=0,a=i.length;t<a;t++){let a=i[t];mt(n,r,e,a)}we&&Ue.render(e);for(let t=0,n=i.length;t<n;t++){let n=i[t];pt(w,e,n,n.viewport)}}else r.length>0&&mt(n,r,e,t),we&&Ue.render(e),pt(w,e,t)}F!==null&&re===0&&(K.updateMultisampleRenderTarget(F),K.updateRenderTargetMipmap(F)),r&&O.end(k),e.isScene===!0&&e.onAfterRender(k,e,t),Ye.resetDefaultState(),ie=-1,I=null,D.pop(),D.length>0?(T=D[D.length-1],K.setTextureUnits(T.state.textureUnits),_e===!0&&Ve.setGlobalState(k.clippingPlanes,T.state.camera)):T=null,E.pop(),w=E.length>0?E[E.length-1]:null,j!==null&&j.renderEnd()};function ft(e,t,n,r){if(e.visible===!1)return;if(e.layers.test(t.layers)){if(e.isGroup)n=e.renderOrder;else if(e.isLOD)e.autoUpdate===!0&&e.update(t);else if(e.isLightProbeGrid)T.pushLightProbeGrid(e);else if(e.isLight)T.pushLight(e),e.castShadow&&T.pushShadow(e);else if(e.isSprite){if(!e.frustumCulled||e.intersectsFrustum(H)){r&&Se.setFromMatrixPosition(e.matrixWorld).applyMatrix4(ye);let i=Fe.update(e),a=e.material;a.visible&&w.push(e,i,a,n,Se.z,null,t)}}else if((e.isMesh||e.isLine||e.isPoints)&&(!e.frustumCulled||e.intersectsFrustum(H))){let i=Fe.update(e),a=e.material;if(r&&(e.boundingSphere===void 0?(i.boundingSphere===null&&i.computeBoundingSphere(),Se.copy(i.boundingSphere.center)):(e.boundingSphere===null&&e.computeBoundingSphere(),Se.copy(e.boundingSphere.center)),Se.applyMatrix4(e.matrixWorld).applyMatrix4(ye)),Array.isArray(a)){let r=i.groups;for(let o=0,s=r.length;o<s;o++){let s=r[o],c=a[s.materialIndex];c&&c.visible&&w.push(e,i,c,n,Se.z,s,t)}}else a.visible&&w.push(e,i,a,n,Se.z,null,t)}}let i=e.children;for(let e=0,a=i.length;e<a;e++)ft(i[e],t,n,r)}function pt(e,t,n,r){let{opaque:i,transmissive:a,transparent:o}=e;T.setupLightsView(n),_e===!0&&Ve.setGlobalState(k.clippingPlanes,n),r&&W.viewport(L.copy(r)),i.length>0&&ht(i,t,n),a.length>0&&ht(a,t,n),o.length>0&&ht(o,t,n),W.buffers.depth.setTest(!0),W.buffers.depth.setMask(!0),W.buffers.color.setMask(!0),W.setPolygonOffset(!1)}function mt(e,t,n,r){if((n.isScene===!0?n.overrideMaterial:null)!==null)return;if(T.state.transmissionRenderTarget[r.id]===void 0){let e=Oe.has(`EXT_color_buffer_half_float`)||Oe.has(`EXT_color_buffer_float`);T.state.transmissionRenderTarget[r.id]=new ee(1,1,{generateMipmaps:!0,type:e?at:f,minFilter:Nt,samples:Math.max(4,Ae.samples),stencilBuffer:i,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:Fn.workingColorSpace})}let a=T.state.transmissionRenderTarget[r.id],o=r.viewport||L;a.setSize(o.z*k.transmissionResolutionScale,o.w*k.transmissionResolutionScale);let s=k.getRenderTarget(),c=k.getActiveCubeFace(),l=k.getActiveMipmapLevel();k.setRenderTarget(a),k.getClearColor(se),ce=k.getClearAlpha(),ce<1&&k.setClearColor(16777215,.5),k.clear(),we&&Ue.render(n);let u=k.toneMapping;k.toneMapping=0;let d=r.viewport;if(r.viewport!==void 0&&(r.viewport=void 0),T.setupLightsView(r),_e===!0&&Ve.setGlobalState(k.clippingPlanes,r),ht(e,n,r),K.updateMultisampleRenderTarget(a),K.updateRenderTargetMipmap(a),Oe.has(`WEBGL_multisampled_render_to_texture`)===!1){let e=!1;for(let i=0,a=t.length;i<a;i++){let{object:a,geometry:o,material:s,group:c}=t[i];if(s.side===2&&a.layers.test(r.layers)){let t=s.side;s.side=1,s.needsUpdate=!0,_t(a,n,r,o,s,c),s.side=t,s.needsUpdate=!0,e=!0}}e===!0&&(K.updateMultisampleRenderTarget(a),K.updateRenderTargetMipmap(a))}k.setRenderTarget(s,c,l),k.setClearColor(se,ce),d!==void 0&&(r.viewport=d),k.toneMapping=u}function ht(e,t,n){let r=t.isScene===!0?t.overrideMaterial:null;for(let i=0,a=e.length;i<a;i++){let a=e[i],{object:o,geometry:s,group:c}=a,l=a.material;l.allowOverride===!0&&r!==null&&(l=r),o.layers.test(n.layers)&&_t(o,t,n,s,l,c)}}function _t(e,t,n,r,i,a){j!==null&&i.isNodeMaterial&&j.setObject(e,i),e.onBeforeRender(k,t,n,r,i,a),e.modelViewMatrix.multiplyMatrices(n.matrixWorldInverse,e.matrixWorld),e.normalMatrix.getNormalMatrix(e.modelViewMatrix),i.onBeforeRender(k,t,n,r,e,a),i.transparent===!0&&i.side===2&&i.forceSinglePass===!1?(i.side=1,i.needsUpdate=!0,k.renderBufferDirect(n,t,r,i,e,a),i.side=0,i.needsUpdate=!0,k.renderBufferDirect(n,t,r,i,e,a),i.side=2):k.renderBufferDirect(n,t,r,i,e,a),e.onAfterRender(k,t,n,r,i,a)}function vt(e,t,n){t.isScene!==!0&&(t=Ce);let r=G.get(e),i=T.state.lights,a=T.state.shadowsArray,o=i.state.version,s=Le.getParameters(e,i.state,a,t,n,T.state.lightProbeGridArray),c=Le.getProgramCacheKey(s),l=r.programs;r.environment=e.isMeshStandardMaterial||e.isMeshLambertMaterial||e.isMeshPhongMaterial?t.environment:null,r.fog=t.fog;let u=e.isMeshStandardMaterial||e.isMeshLambertMaterial&&!e.envMap||e.isMeshPhongMaterial&&!e.envMap;r.envMap=Me.get(e.envMap||r.environment,u),r.envMapRotation=r.environment!==null&&e.envMap===null?t.environmentRotation:e.envMapRotation,l===void 0&&(e.addEventListener(`dispose`,nt),l=new Map,r.programs=l);let d=l.get(c);if(d!==void 0){if(r.currentProgram===d&&r.lightsStateVersion===o)return bt(e,s),d}else s.uniforms=Le.getUniforms(e),j!==null&&e.isNodeMaterial&&j.build(e,n,s),e.onBeforeCompile(s,k),d=Le.acquireProgram(s,c),l.set(c,d),r.uniforms=s.uniforms;let f=r.uniforms;return(!e.isShaderMaterial&&!e.isRawShaderMaterial||e.clipping===!0)&&(f.clippingPlanes=Ve.uniform),bt(e,s),r.needsLights=wt(e),r.lightsStateVersion=o,r.needsLights&&(f.ambientLightColor.value=i.state.ambient,f.lightProbe.value=i.state.probe,f.sunLights.value=i.state.sun,f.sunLightShadows.value=i.state.sunShadow,f.directionalLights.value=i.state.directional,f.directionalLightShadows.value=i.state.directionalShadow,f.spotLights.value=i.state.spot,f.spotLightShadows.value=i.state.spotShadow,f.rectAreaLights.value=i.state.rectArea,f.ltc_1.value=i.state.rectAreaLTC1,f.ltc_2.value=i.state.rectAreaLTC2,f.pointLights.value=i.state.point,f.pointLightShadows.value=i.state.pointShadow,f.hemisphereLights.value=i.state.hemi,f.sunShadowMatrix.value=i.state.sunShadowMatrix,f.sunShadowCascade.value=i.state.sunShadowCascade,f.directionalShadowMatrix.value=i.state.directionalShadowMatrix,f.spotLightMatrix.value=i.state.spotLightMatrix,f.spotLightMap.value=i.state.spotLightMap,f.pointShadowMatrix.value=i.state.pointShadowMatrix),r.lightProbeGrid=T.state.lightProbeGridArray.length>0,r.currentProgram=d,r.uniformsList=null,d}function yt(e){if(e.uniformsList===null){let t=e.currentProgram.getUniforms();e.uniformsList=Mi.seqWithValue(t.seq,e.uniforms)}return e.uniformsList}function bt(e,t){let n=G.get(e);n.outputColorSpace=t.outputColorSpace,n.batching=t.batching,n.batchingColor=t.batchingColor,n.instancing=t.instancing,n.instancingColor=t.instancingColor,n.instancingMorph=t.instancingMorph,n.skinning=t.skinning,n.morphTargets=t.morphTargets,n.morphNormals=t.morphNormals,n.morphColors=t.morphColors,n.morphTargetsCount=t.morphTargetsCount,n.numClippingPlanes=t.numClippingPlanes,n.numIntersection=t.numClipIntersection,n.vertexAlphas=t.vertexAlphas,n.vertexTangents=t.vertexTangents,n.toneMapping=t.toneMapping}function xt(e,t){if(e.length===0)return null;if(e.length===1)return e[0].texture===null?null:e[0];C.setFromMatrixPosition(t.matrixWorld);for(let t=0,n=e.length;t<n;t++){let n=e[t];if(n.texture!==null&&n.boundingBox.containsPoint(C))return n}return null}function St(e,t,n,r,i){t.isScene!==!0&&(t=Ce),K.resetTextureUnits();let a=t.fog,o=r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial?t.environment:null,s=F===null?k.outputColorSpace:F.isXRRenderTarget===!0?F.texture.colorSpace:Fn.workingColorSpace,c=r.isMeshStandardMaterial||r.isMeshLambertMaterial&&!r.envMap||r.isMeshPhongMaterial&&!r.envMap,l=Me.get(r.envMap||o,c),u=r.vertexColors===!0&&!!n.attributes.color&&n.attributes.color.itemSize===4,d=!!n.attributes.tangent&&(!!r.normalMap||r.anisotropy>0),f=!!n.morphAttributes.position,p=!!n.morphAttributes.normal,m=!!n.morphAttributes.color,h=0;r.toneMapped&&(F===null||F.isXRRenderTarget===!0)&&(h=k.toneMapping);let g=n.morphAttributes.position||n.morphAttributes.normal||n.morphAttributes.color,_=g===void 0?0:g.length,v=G.get(r),y=T.state.lights;if(_e===!0&&(ve===!0||e!==I)){let t=e===I&&r.id===ie;Ve.setState(r,e,t)}let b=!1;r.version===v.__version?v.needsLights&&v.lightsStateVersion!==y.state.version?b=!0:v.outputColorSpace===s?i.isBatchedMesh&&v.batching===!1||!i.isBatchedMesh&&v.batching===!0||i.isBatchedMesh&&v.batchingColor===!0&&i._colorsTexture===null||i.isBatchedMesh&&v.batchingColor===!1&&i._colorsTexture!==null||i.isInstancedMesh&&v.instancing===!1||!i.isInstancedMesh&&v.instancing===!0||i.isSkinnedMesh&&v.skinning===!1||!i.isSkinnedMesh&&v.skinning===!0||i.isInstancedMesh&&v.instancingColor===!0&&i.instanceColor===null||i.isInstancedMesh&&v.instancingColor===!1&&i.instanceColor!==null||i.isInstancedMesh&&v.instancingMorph===!0&&i.morphTexture===null||i.isInstancedMesh&&v.instancingMorph===!1&&i.morphTexture!==null?b=!0:v.envMap===l?r.fog===!0&&v.fog!==a||v.numClippingPlanes!==void 0&&(v.numClippingPlanes!==Ve.numPlanes||v.numIntersection!==Ve.numIntersection)?b=!0:v.vertexAlphas===u&&v.vertexTangents===d&&v.morphTargets===f&&v.morphNormals===p&&v.morphColors===m&&v.toneMapping===h&&v.morphTargetsCount===_?!!v.lightProbeGrid!=T.state.lightProbeGridArray.length>0&&(b=!0):b=!0:b=!0:b=!0:(b=!0,v.__version=r.version);let x=v.currentProgram;b===!0&&(x=vt(r,t,i),j&&r.isNodeMaterial&&j.onUpdateProgram(r,x,v));let S=!1,C=!1,w=!1,E=x.getUniforms(),D=v.uniforms;if(W.useProgram(x.program)&&(S=!0,C=!0,w=!0),r.id!==ie&&(ie=r.id,C=!0),v.needsLights){let e=xt(T.state.lightProbeGridArray,i);v.lightProbeGrid!==e&&(v.lightProbeGrid=e,C=!0)}if(S||I!==e){W.buffers.depth.getReversed()&&e.reversedDepth!==!0&&(e._reversedDepth=!0,e.updateProjectionMatrix()),E.setValue(U,`projectionMatrix`,e.projectionMatrix),E.setValue(U,`viewMatrix`,e.matrixWorldInverse);let t=E.map.cameraPosition;t!==void 0&&t.setValue(U,be.setFromMatrixPosition(e.matrixWorld)),Ae.logarithmicDepthBuffer&&E.setValue(U,`logDepthBufFC`,2/(Math.log(e.far+1)/Math.LN2)),(r.isMeshPhongMaterial||r.isMeshToonMaterial||r.isMeshLambertMaterial||r.isMeshBasicMaterial||r.isMeshStandardMaterial||r.isShaderMaterial)&&E.setValue(U,`isOrthographic`,e.isOrthographicCamera===!0),I!==e&&(I=e,C=!0,w=!0)}if(v.needsLights&&(y.state.sunShadowMap.length>0&&E.setValue(U,`sunShadowMap`,y.state.sunShadowMap,K),y.state.directionalShadowMap.length>0&&E.setValue(U,`directionalShadowMap`,y.state.directionalShadowMap,K),y.state.spotShadowMap.length>0&&E.setValue(U,`spotShadowMap`,y.state.spotShadowMap,K),y.state.pointShadowMap.length>0&&E.setValue(U,`pointShadowMap`,y.state.pointShadowMap,K)),i.isSkinnedMesh){E.setOptional(U,i,`bindMatrix`),E.setOptional(U,i,`bindMatrixInverse`);let e=i.skeleton;e&&(e.boneTexture===null&&e.computeBoneTexture(),E.setValue(U,`boneTexture`,e.boneTexture,K))}i.isBatchedMesh&&(E.setOptional(U,i,`batchingTexture`),E.setValue(U,`batchingTexture`,i._matricesTexture,K),E.setOptional(U,i,`batchingIdTexture`),E.setValue(U,`batchingIdTexture`,i._indirectTexture,K),E.setOptional(U,i,`batchingColorTexture`),i._colorsTexture!==null&&E.setValue(U,`batchingColorTexture`,i._colorsTexture,K));let O=n.morphAttributes;if((O.position!==void 0||O.normal!==void 0||O.color!==void 0)&&We.update(i,n,x),(C||v.receiveShadow!==i.receiveShadow)&&(v.receiveShadow=i.receiveShadow,E.setValue(U,`receiveShadow`,i.receiveShadow)),(r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial)&&r.envMap===null&&t.environment!==null&&(D.envMapIntensity.value=t.environmentIntensity),D.dfgLUT!==void 0&&(D.dfgLUT.value=$a()),C){if(E.setValue(U,`toneMappingExposure`,k.toneMappingExposure),v.needsLights&&Ct(D,w),a&&r.fog===!0&&Re.refreshFogUniforms(D,a),Re.refreshMaterialUniforms(D,r,B,de,T.state.transmissionRenderTarget[e.id]),v.needsLights&&v.lightProbeGrid){let e=v.lightProbeGrid;D.probesSH.value=e.texture,D.probesMin.value.copy(e.boundingBox.min),D.probesMax.value.copy(e.boundingBox.max),D.probesResolution.value.copy(e.resolution)}Mi.upload(U,yt(v),D,K)}if(r.isShaderMaterial&&r.uniformsNeedUpdate===!0&&(Mi.upload(U,yt(v),D,K),r.uniformsNeedUpdate=!1),r.isSpriteMaterial&&E.setValue(U,`center`,i.center),E.setValue(U,`modelViewMatrix`,i.modelViewMatrix),E.setValue(U,`normalMatrix`,i.normalMatrix),E.setValue(U,`modelMatrix`,i.matrixWorld),r.uniformsGroups!==void 0){let e=r.uniformsGroups;for(let t=0,n=e.length;t<n;t++){let n=e[t];Xe.update(n,x),Xe.bind(n,x)}}return x}function Ct(e,t){e.ambientLightColor.needsUpdate=t,e.lightProbe.needsUpdate=t,e.sunLights.needsUpdate=t,e.sunLightShadows.needsUpdate=t,e.directionalLights.needsUpdate=t,e.directionalLightShadows.needsUpdate=t,e.pointLights.needsUpdate=t,e.pointLightShadows.needsUpdate=t,e.spotLights.needsUpdate=t,e.spotLightShadows.needsUpdate=t,e.rectAreaLights.needsUpdate=t,e.hemisphereLights.needsUpdate=t}function wt(e){return e.isMeshLambertMaterial||e.isMeshToonMaterial||e.isMeshPhongMaterial||e.isMeshStandardMaterial||e.isShadowMaterial||e.isShaderMaterial&&e.lights===!0}this.getActiveCubeFace=function(){return te},this.getActiveMipmapLevel=function(){return re},this.getRenderTarget=function(){return F},this.setRenderTargetTextures=function(e,t,n){let r=G.get(e);r.__autoAllocateDepthBuffer=e.resolveDepthBuffer===!1,r.__autoAllocateDepthBuffer===!1&&(r.__useRenderToTexture=!1),G.get(e.texture).__webglTexture=t,G.get(e.depthTexture).__webglTexture=r.__autoAllocateDepthBuffer?void 0:n,r.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(e,t){let n=G.get(e);n.__webglFramebuffer=t,n.__useDefaultFramebuffer=t===void 0},this.setRenderTarget=function(e,t=0,n=0){F=e,te=t,re=n;let r=null,i=!1,a=!1;if(e){let o=G.get(e);if(o.__useDefaultFramebuffer!==void 0){W.bindFramebuffer(U.FRAMEBUFFER,o.__webglFramebuffer),L.copy(e.viewport),ae.copy(e.scissor),z=e.scissorTest,W.viewport(L),W.scissor(ae),W.setScissorTest(z),ie=-1;return}if(o.__webglFramebuffer===void 0)K.setupRenderTarget(e);else if(o.__hasExternalTextures)K.rebindTextures(e,G.get(e.texture).__webglTexture,G.get(e.depthTexture).__webglTexture);else if(e.depthBuffer){let t=e.depthTexture;if(o.__boundDepthTexture!==t){if(t!==null&&G.has(t)&&(e.width!==t.image.width||e.height!==t.image.height))throw Error(`THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.`);K.setupDepthRenderbuffer(e)}}let s=e.texture;(s.isData3DTexture||s.isDataArrayTexture||s.isCompressedArrayTexture)&&(a=!0);let c=G.get(e).__webglFramebuffer;e.isWebGLCubeRenderTarget?(r=Array.isArray(c[t])?c[t][n]:c[t],i=!0):r=e.samples>0&&K.useMultisampledRTT(e)===!1?G.get(e).__webglMultisampledFramebuffer:Array.isArray(c)?c[n]:c,L.copy(e.viewport),ae.copy(e.scissor),z=e.scissorTest}else L.copy(me).multiplyScalar(B).floor(),ae.copy(he).multiplyScalar(B).floor(),z=ge;if(n!==0&&(r=M),W.bindFramebuffer(U.FRAMEBUFFER,r)&&W.drawBuffers(e,r),W.viewport(L),W.scissor(ae),W.setScissorTest(z),i){let r=G.get(e.texture);U.framebufferTexture2D(U.FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_CUBE_MAP_POSITIVE_X+t,r.__webglTexture,n)}else if(a){let r=t;for(let t=0;t<e.textures.length;t++){let i=G.get(e.textures[t]);U.framebufferTextureLayer(U.FRAMEBUFFER,U.COLOR_ATTACHMENT0+t,i.__webglTexture,n,r)}}else if(e!==null&&n!==0){let t=G.get(e.texture);U.framebufferTexture2D(U.FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_2D,t.__webglTexture,n)}ie=-1};function Tt(e){let t=G.get(e);return(t.__readFormat!==e.format||t.__readType!==e.type)&&(t.__readFormat=e.format,t.__readType=e.type,t.__formatReadable=Ae.textureFormatReadable(e.format),t.__typeReadable=Ae.textureTypeReadable(e.type)),t}this.readRenderTargetPixels=function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget)){Ee(`WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);return}let c=G.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){W.bindFramebuffer(U.FRAMEBUFFER,c);try{let o=e.textures[s],c=o.format,l=o.type;e.textures.length>1&&U.readBuffer(U.COLOR_ATTACHMENT0+s);let u=Tt(o);if(u.__formatReadable===!1){Ee(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.`);return}if(u.__typeReadable===!1){Ee(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.`);return}t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i&&U.readPixels(t,n,r,i,Je.convert(c),Je.convert(l),a)}finally{let e=F===null?null:G.get(F).__webglFramebuffer;W.bindFramebuffer(U.FRAMEBUFFER,e)}}},this.readRenderTargetPixelsAsync=async function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget))throw Error(`THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);let c=G.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){if(t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i){W.bindFramebuffer(U.FRAMEBUFFER,c);let o=e.textures[s],l=o.format,u=o.type;e.textures.length>1&&U.readBuffer(U.COLOR_ATTACHMENT0+s);let d=Tt(o);if(d.__formatReadable===!1)throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.`);if(d.__typeReadable===!1)throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.`);let f=U.createBuffer();U.bindBuffer(U.PIXEL_PACK_BUFFER,f),U.bufferData(U.PIXEL_PACK_BUFFER,a.byteLength,U.STREAM_READ),U.readPixels(t,n,r,i,Je.convert(l),Je.convert(u),0),U.bindBuffer(U.PIXEL_PACK_BUFFER,null);let p=F===null?null:G.get(F).__webglFramebuffer;W.bindFramebuffer(U.FRAMEBUFFER,p);let m=U.fenceSync(U.SYNC_GPU_COMMANDS_COMPLETE,0);return U.flush(),await ne(U,m,4),U.bindBuffer(U.PIXEL_PACK_BUFFER,f),U.getBufferSubData(U.PIXEL_PACK_BUFFER,0,a),U.bindBuffer(U.PIXEL_PACK_BUFFER,null),U.deleteBuffer(f),U.deleteSync(m),a}throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.`)}},this.copyFramebufferToTexture=function(e,t=null,n=0){let r=2**-n,i=Math.floor(e.image.width*r),a=Math.floor(e.image.height*r),o=t===null?0:t.x,s=t===null?0:t.y;K.setTexture2D(e,0),U.copyTexSubImage2D(U.TEXTURE_2D,n,0,0,o,s,i,a),W.unbindTexture()},this.copyTextureToTexture=function(e,t,n=null,r=null,i=0,a=0){let o,s,c,l,u,d,f,p,m,h=e.isCompressedTexture?e.mipmaps[a]:e.image;if(n!==null)o=n.max.x-n.min.x,s=n.max.y-n.min.y,c=n.isBox3?n.max.z-n.min.z:1,l=n.min.x,u=n.min.y,d=n.isBox3?n.min.z:0;else{let t=2**-i;o=Math.floor(h.width*t),s=Math.floor(h.height*t),c=e.isDataArrayTexture?h.depth:e.isData3DTexture?Math.floor(h.depth*t):1,l=0,u=0,d=0}r===null?(f=0,p=0,m=0):(f=r.x,p=r.y,m=r.z);let g=Je.convert(t.format),_=Je.convert(t.type),v;t.isData3DTexture?(K.setTexture3D(t,0),v=U.TEXTURE_3D):t.isDataArrayTexture||t.isCompressedArrayTexture?(K.setTexture2DArray(t,0),v=U.TEXTURE_2D_ARRAY):(K.setTexture2D(t,0),v=U.TEXTURE_2D),W.activeTexture(U.TEXTURE0),W.pixelStorei(U.UNPACK_FLIP_Y_WEBGL,t.flipY),W.pixelStorei(U.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.premultiplyAlpha),W.pixelStorei(U.UNPACK_ALIGNMENT,t.unpackAlignment);let y=W.getParameter(U.UNPACK_ROW_LENGTH),b=W.getParameter(U.UNPACK_IMAGE_HEIGHT),x=W.getParameter(U.UNPACK_SKIP_PIXELS),S=W.getParameter(U.UNPACK_SKIP_ROWS),C=W.getParameter(U.UNPACK_SKIP_IMAGES);W.pixelStorei(U.UNPACK_ROW_LENGTH,h.width),W.pixelStorei(U.UNPACK_IMAGE_HEIGHT,h.height),W.pixelStorei(U.UNPACK_SKIP_PIXELS,l),W.pixelStorei(U.UNPACK_SKIP_ROWS,u),W.pixelStorei(U.UNPACK_SKIP_IMAGES,d);let w=e.isDataArrayTexture||e.isData3DTexture,T=t.isDataArrayTexture||t.isData3DTexture;if(e.isDepthTexture){let n=G.get(e),r=G.get(t),h=G.get(n.__renderTarget),g=G.get(r.__renderTarget);W.bindFramebuffer(U.READ_FRAMEBUFFER,h.__webglFramebuffer),W.bindFramebuffer(U.DRAW_FRAMEBUFFER,g.__webglFramebuffer);for(let n=0;n<c;n++)w&&(U.framebufferTextureLayer(U.READ_FRAMEBUFFER,U.COLOR_ATTACHMENT0,G.get(e).__webglTexture,i,d+n),U.framebufferTextureLayer(U.DRAW_FRAMEBUFFER,U.COLOR_ATTACHMENT0,G.get(t).__webglTexture,a,m+n)),U.blitFramebuffer(l,u,o,s,f,p,o,s,U.DEPTH_BUFFER_BIT,U.NEAREST);W.bindFramebuffer(U.READ_FRAMEBUFFER,null),W.bindFramebuffer(U.DRAW_FRAMEBUFFER,null)}else if(i!==0||e.isRenderTargetTexture||G.has(e)){let n=G.get(e),r=G.get(t);W.bindFramebuffer(U.READ_FRAMEBUFFER,N),W.bindFramebuffer(U.DRAW_FRAMEBUFFER,P);for(let e=0;e<c;e++)w?U.framebufferTextureLayer(U.READ_FRAMEBUFFER,U.COLOR_ATTACHMENT0,n.__webglTexture,i,d+e):U.framebufferTexture2D(U.READ_FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_2D,n.__webglTexture,i),T?U.framebufferTextureLayer(U.DRAW_FRAMEBUFFER,U.COLOR_ATTACHMENT0,r.__webglTexture,a,m+e):U.framebufferTexture2D(U.DRAW_FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_2D,r.__webglTexture,a),i===0?T?U.copyTexSubImage3D(v,a,f,p,m+e,l,u,o,s):U.copyTexSubImage2D(v,a,f,p,l,u,o,s):U.blitFramebuffer(l,u,o,s,f,p,o,s,U.COLOR_BUFFER_BIT,U.NEAREST);W.bindFramebuffer(U.READ_FRAMEBUFFER,null),W.bindFramebuffer(U.DRAW_FRAMEBUFFER,null)}else T?e.isDataTexture||e.isData3DTexture?U.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h.data):t.isCompressedArrayTexture?U.compressedTexSubImage3D(v,a,f,p,m,o,s,c,g,h.data):U.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h):e.isDataTexture?U.texSubImage2D(U.TEXTURE_2D,a,f,p,o,s,g,_,h.data):e.isCompressedTexture?U.compressedTexSubImage2D(U.TEXTURE_2D,a,f,p,h.width,h.height,g,h.data):U.texSubImage2D(U.TEXTURE_2D,a,f,p,o,s,g,_,h);W.pixelStorei(U.UNPACK_ROW_LENGTH,y),W.pixelStorei(U.UNPACK_IMAGE_HEIGHT,b),W.pixelStorei(U.UNPACK_SKIP_PIXELS,x),W.pixelStorei(U.UNPACK_SKIP_ROWS,S),W.pixelStorei(U.UNPACK_SKIP_IMAGES,C),a===0&&t.generateMipmaps&&U.generateMipmap(v),W.unbindTexture()},this.initRenderTarget=function(e){G.get(e).__webglFramebuffer===void 0&&K.setupRenderTarget(e)},this.initTexture=function(e){e.isCubeTexture?K.setTextureCube(e,0):e.isData3DTexture?K.setTexture3D(e,0):e.isDataArrayTexture||e.isCompressedArrayTexture?K.setTexture2DArray(e,0):K.setTexture2D(e,0),W.unbindTexture()},this.resetState=function(){te=0,re=0,F=null,W.reset(),Ye.reset()},typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}get coordinateSystem(){return b}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=Fn._getDrawingBufferColorSpace(e),t.unpackColorSpace=Fn._getUnpackColorSpace()}},to=`cm_scene_editor_token`;function no(){return!!(sessionStorage.getItem(to)||localStorage.getItem(`cm_auth_token`))}function ro(){let e=sessionStorage.getItem(to)||localStorage.getItem(`cm_auth_token`);if(!e)throw Error(`Sign in with an administrator account to save the scene.`);return{"Content-Type":`application/json`,Authorization:`Bearer ${e}`}}async function io(e){let t=await e.text(),n;try{n=JSON.parse(t)}catch{throw Error(`Server returned an invalid response (${e.status}). Check that the game server is running.`)}if(!e.ok)throw Error(n.error??`Request failed (${e.status})`);return n}async function ao(e,t){let n=await io(await fetch(`/api/login`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({username:e,password:t})}));if(!n.token||!n.is_admin)throw Error(`This account is not an administrator.`);sessionStorage.setItem(to,n.token)}async function oo(e,t=!1){let n=await fetch(`/api/${t?`admin/`:``}maps/${encodeURIComponent(e)}/scene3d`,t?{headers:ro()}:void 0);return ut(await io(n),e)}async function so(e){let t=await fetch(`/api/admin/maps/${encodeURIComponent(e.map)}/scene3d`,{method:`PUT`,headers:ro(),body:JSON.stringify(e)});return ut(await io(t),e.map)}async function co(){let e=await fetch(`/api/maps`);if(!e.ok)throw Error(`maps: ${e.status}`);return(await e.json()).map(e=>({id:e.id,name:e.name||e.id}))}async function lo(e){let t=await fetch(`/api/maps/${encodeURIComponent(e)}`);if(!t.ok)throw Error(`map ${e}: ${t.status}`);return await t.json()}function uo(e){let t=new Blob([JSON.stringify(e,null,2)+`
`],{type:`application/json`}),n=URL.createObjectURL(t);Object.assign(document.createElement(`a`),{href:n,download:`${e.map}.scene3d.json`}).click(),setTimeout(()=>URL.revokeObjectURL(n),1e3)}function fo(e){return new Promise(t=>{let n=Object.assign(document.createElement(`input`),{type:`file`,accept:`.json,application/json`});n.onchange=async()=>{let r=n.files?.[0];if(!r)return t(null);try{t(ut(JSON.parse(await r.text()),e))}catch(e){alert(`Could not read scene: ${e instanceof Error?e.message:e}`),t(null)}},n.oncancel=()=>t(null),n.click()})}function po(e,t=``,n={}){if(e&&typeof e==`object`&&!Array.isArray(e))for(let[r,i]of Object.entries(e))po(i,t?`${t}.${r}`:r,n);else n[t]=e;return n}function mo(e){return po({name:e.name,prefab:e.prefab,visible:e.visible,props:e.props,components:e.components??{},transform:e.transform})}function ho(e,t,n){let r=t.split(`.`),i=e;for(let e of r.slice(0,-1))(!i[e]||typeof i[e]!=`object`)&&(i[e]={}),i=i[e];n===void 0?delete i[r.at(-1)]:i[r.at(-1)]=structuredClone(n)}function go(e){for(let t of e.objects){let n=t.prefabInstance;if(!n)continue;let r=e.prefabs.find(e=>e.id===n.assetId)?.objects.find(e=>e.id===n.nodeId);if(!r)continue;let i=mo(t),a=mo(r);n.overrides=[...new Set([...Object.keys(i),...Object.keys(a)])].filter(e=>(t.id!==n.rootId||e!==`transform.position`)&&JSON.stringify(i[e])!==JSON.stringify(a[e]))}}function _o(e,t,n,r){let i=new Set(Zt(e,t)),a=e.objects.find(e=>e.id===t);if(!a)throw Error(`Select a scene object first`);let o=[a,...e.objects.filter(e=>e.id!==t&&i.has(e.id))],s={id:`prefab_${_n()}`,name:n.trim()||a.name,kind:r,revision:1,objects:o.map(e=>structuredClone(e))};for(let e of s.objects)delete e.prefabInstance;s.objects[0].parent=null,s.objects[0].transform.position=[0,0,0];for(let e of o)e.prefabInstance={assetId:s.id,nodeId:e.id,rootId:t,overrides:[]};return e.prefabs.push(s),s}function vo(e,t,n,r=null){let i=e.prefabs.find(e=>e.id===t);if(!i?.objects.length)throw Error(`Prefab asset '${t}' is missing`);let a=new Map(i.objects.map(e=>[e.id,_n()])),o=a.get(i.objects[0].id);for(let s of i.objects){let i=structuredClone(s);i.id=a.get(s.id),i.parent=s.parent?a.get(s.parent)??o:r,i.id===o&&(i.transform.position=[...n]),i.prefabInstance={assetId:t,nodeId:s.id,rootId:o,overrides:[]},e.objects.push(i)}return o}function yo(e,t,n,r){let i=e.objects.find(e=>e.id===n);if(!i)return;let a=e.objects.filter(e=>e.prefabInstance?.rootId===n&&e.prefabInstance.assetId===t.id),o=new Map(a.map(e=>[e.prefabInstance.nodeId,e])),s=new Map(t.objects.map(e=>[e.id,o.get(e.id)?.id??_n()])),c=new Set(t.objects.map(e=>e.id)),l=new Set(a.filter(e=>!c.has(e.prefabInstance.nodeId)).map(e=>e.id));e.objects=e.objects.filter(e=>!l.has(e.id));for(let t of e.objects)t.parent&&l.has(t.parent)&&(t.parent=n);for(let a of t.objects){let c=o.get(a.id),l=c?structuredClone(c):void 0;if(c||(c=structuredClone(a),e.objects.push(c)),Object.assign(c,structuredClone(a),{id:s.get(a.id),parent:a.parent?s.get(a.parent)??n:i.parent}),c.prefabInstance={assetId:t.id,nodeId:a.id,rootId:n,overrides:[]},l&&r)for(let e of l.prefabInstance.overrides)ho(c,e,mo(l)[e]);c.id===n&&l&&(c.transform.position=[...l.transform.position])}}function bo(e,t){let n=e.prefabs.find(e=>e.id===t);if(!n)return;let r=e.objects.filter(e=>e.prefabInstance?.assetId===t&&e.prefabInstance.rootId===e.id).map(e=>e.id);for(let t of r)yo(e,n,t,!0);go(e)}function xo(e,t){let n=e.objects.find(e=>e.id===t)?.prefabInstance,r=e.prefabs.find(e=>e.id===n?.assetId);n&&r&&(yo(e,r,n.rootId,!1),go(e))}function So(e,t){go(e);let n=e.objects.find(e=>e.id===t)?.prefabInstance,r=e.prefabs.find(e=>e.id===n?.assetId);if(!n||!r)return;let i=e.objects.find(e=>e.id===n.rootId);if(!i)return;let a=new Set(Zt(e,i.id)),o=[i,...e.objects.filter(e=>e.id!==i.id&&a.has(e.id))],s=new Map(o.map(e=>[e.id,e.prefabInstance?.assetId===r.id?e.prefabInstance.nodeId:_n()])),c=e.objects.filter(e=>e.prefabInstance?.assetId===r.id&&e.prefabInstance.rootId===e.id).map(e=>e.id);r.objects=o.map(e=>{let t=structuredClone(e);return t.id=s.get(e.id),t.parent=e.id===i.id?null:s.get(e.parent)??s.get(i.id),delete t.prefabInstance,e.id===i.id&&(t.transform.position=[0,0,0]),t}),r.revision++;for(let e of o)e.prefabInstance={assetId:r.id,nodeId:s.get(e.id),rootId:i.id,overrides:[]};for(let t of c)yo(e,r,t,t!==i.id);go(e)}var Co=Math.PI/180,wo=e=>Math.round(e*1e3)/1e3;function To(e){let[t,n,r]=e.position,[i,a,o]=e.rotation,[s,c,l]=e.scale;return new Ln().compose(new R(t,n,r),new $e().setFromEuler(new lt(i*Co,a*Co,o*Co)),new R(s,c,l))}function Eo(e,t){let n=new Map(e.objects.map(e=>[e.id,e])),r=[];for(let e=t?n.get(t):void 0;e;e=e.parent?n.get(e.parent):void 0)r.unshift(e.transform);return r.reduce((e,t)=>e.multiply(To(t)),new Ln)}function Do(e){let t=new R,n=new $e,r=new R;e.decompose(t,n,r);let i=new lt().setFromQuaternion(n),a=e=>[wo(e.x),wo(e.y),wo(e.z)];return{position:a(t),rotation:[wo(i.x/Co),wo(i.y/Co),wo(i.z/Co)],scale:a(r)}}function Oo(e,t,n){let r=Eo(e,t);return Do(Eo(e,n).invert().multiply(r))}var ko=200,Ao=e=>`scene3d:${e}`,jo=class e{state;past=[];future=[];dragBase=null;listeners=new Set;constructor(t){this.state={doc:e.restore(t),selection:[],tool:`move`,space:`world`,snap:!1,snapMove:.5,snapRotate:15,snapScale:.1,layers:{terrain:!0,stamps:!0,grid:!0,fog:!0},dropToSurface:!0,dirty:!1,canUndo:!1,canRedo:!1,frameRequest:0}}static restore(e){try{let t=localStorage.getItem(Ao(e));if(t)return ut(JSON.parse(t),e)}catch{}return Ze(e)}subscribe=e=>(this.listeners.add(e),()=>{this.listeners.delete(e)});getState=()=>this.state;set(e){this.state={...this.state,...e,canUndo:this.past.length>0,canRedo:this.future.length>0};for(let e of this.listeners)e()}update(e){let t=structuredClone(this.state.doc);e(t),go(t),this.pushHistory(this.state.doc),this.set({doc:t,dirty:!0}),this.autosave()}beginDrag(){this.dragBase=this.state.doc}updateTransient(e){let t=structuredClone(this.state.doc);e(t),go(t),this.set({doc:t,dirty:!0})}endDrag(){this.dragBase&&this.dragBase!==this.state.doc&&this.pushHistory(this.dragBase),this.dragBase=null,this.set({}),this.autosave()}pushHistory(e){this.past.push(e),this.past.length>ko&&this.past.shift(),this.future=[]}undo(){let e=this.past.pop();if(!e)return;this.future.push(this.state.doc);let t=new Set(e.objects.map(e=>e.id));this.set({doc:e,dirty:!0,selection:this.state.selection.filter(e=>t.has(e))}),this.autosave()}redo(){let e=this.future.pop();if(!e)return;this.past.push(this.state.doc);let t=new Set(e.objects.map(e=>e.id));this.set({doc:e,dirty:!0,selection:this.state.selection.filter(e=>t.has(e))}),this.autosave()}replaceDoc(e,t=!1){this.past=[],this.future=[],this.set({doc:e,selection:[],dirty:t}),this.autosave()}autosave(){try{localStorage.setItem(Ao(this.state.doc.map),JSON.stringify(this.state.doc))}catch{}}markSaved(){this.set({dirty:!1})}setTerrainTransient(e){this.updateTransient(t=>{t.terrain=e})}saveAsPrefab(e,t,n){this.update(r=>{_o(r,e,t,n)})}applyPrefab(e){this.update(t=>So(t,e))}revertPrefab(e){this.update(t=>xo(t,e))}unpackPrefab(e){this.update(t=>{let n=t.objects.find(t=>t.id===e)?.prefabInstance?.rootId;for(let e of t.objects)e.prefabInstance?.rootId===n&&delete e.prefabInstance})}updatePrefabAsset(e,t){this.update(n=>{let r=n.prefabs.find(t=>t.id===e);if(r){if(t.name!==void 0&&(r.name=t.name.trim()||r.name),t.kind!==void 0&&(r.kind=t.kind),t.objects?.length){let e=structuredClone(t.objects);e[0].parent=null,e[0].transform.position=[0,0,0];for(let t of e)delete t.prefabInstance,t!==e[0]&&!t.parent&&(t.parent=e[0].id);r.objects=e}r.revision++,bo(n,e)}})}createPrefabAsset(e,t){let n=`prefab_${_n()}`;return this.update(r=>{let i=structuredClone(t);i[0].parent=null,i[0].transform.position=[0,0,0];for(let e of i)delete e.prefabInstance,e!==i[0]&&!e.parent&&(e.parent=i[0].id);let a=i[0];r.prefabs.push({id:n,name:e.trim()||a.name,kind:a.components?.npc?`npc`:a.components?.poi?`poi`:a.components?.item?`item`:`decoration`,revision:1,objects:i})}),n}deletePrefabAsset(e){this.update(t=>{t.prefabs=t.prefabs.filter(t=>t.id!==e)})}addObject(e,t,n=null,r){if(this.state.doc.prefabs.some(t=>t.id===e)){let r=``;return this.update(i=>{r=vo(i,e,t,n)}),this.select([r]),r}let i=Ht.get(e),a=_n();return this.update(o=>{let s=o.objects.filter(t=>t.prefab===e).length;o.objects.push({id:a,name:r?.name||`${i?.label??e}${s?` (${s})`:``}`,parent:n,prefab:e,transform:{position:t,rotation:[0,0,0],scale:[1,1,1]},visible:!0,props:{...i?He(i):{},...r?.props},components:structuredClone(r?.components??i?.components??{})})}),this.select([a]),a}deleteSelected(){let e=new Set(this.state.selection.flatMap(e=>Zt(this.state.doc,e)));e.size&&(this.update(t=>{t.objects=t.objects.filter(t=>!e.has(t.id))}),this.select([]))}duplicateSelected(){let e=this.state.selection.filter(e=>!this.state.selection.some(t=>t!==e&&Pt(this.state.doc,t,e)));if(!e.length)return;let t=[];this.update(n=>{let r=new Map(n.objects.map(e=>[e.id,e]));for(let i of e){let e=new Map;for(let t of Zt(n,i))e.set(t,_n());for(let[t,a]of e){let o=r.get(t),s=structuredClone(o);if(s.id=a,s.prefabInstance){let t=e.get(s.prefabInstance.rootId);t?s.prefabInstance.rootId=t:delete s.prefabInstance}s.parent=o.parent&&e.has(o.parent)?e.get(o.parent):o.parent,t===i&&(s.name=`${o.name} copy`,s.transform.position=[...o.transform.position]),n.objects.push(s)}t.push(e.get(i))}}),this.select(t)}patchObject(e,t){this.update(n=>{let r=n.objects.find(t=>t.id===e);if(!r)return;let{transform:i,props:a,...o}=t;Object.assign(r,o),i&&Object.assign(r.transform,i),a&&(r.props={...r.props,...a})})}setTransformTransient(e,t){this.updateTransient(n=>{let r=n.objects.find(t=>t.id===e);r&&(r.transform=t)})}reparent(e,t){e!==t&&(t&&Pt(this.state.doc,e,t)||(!t||this.state.doc.objects.some(e=>e.id===t))&&this.update(n=>{let r=n.objects.find(t=>t.id===e);r&&(r.parent??null)!==t&&(r.transform=Oo(n,e,t),r.parent=t)}))}reorder(e,t,n){e===t||Pt(this.state.doc,e,t)||this.update(r=>{let i=r.objects.find(t=>t.id===e),a=r.objects.find(e=>e.id===t);if(!i||!a)return;let o=a.parent??null;(i.parent??null)!==o&&(i.transform=Oo(r,e,o)),i.parent=o,r.objects=r.objects.filter(t=>t.id!==e);let s=r.objects.findIndex(e=>e.id===t);r.objects.splice(n?s+1:s,0,i)})}select(e){this.set({selection:e})}toggleSelect(e){let t=this.state.selection.includes(e);this.set({selection:t?this.state.selection.filter(t=>t!==e):[...this.state.selection,e]})}setTool(e){this.set({tool:e})}setSpace(e){this.set({space:e})}setSnap(e){this.set(e)}setLayer(e,t){this.set({layers:{...this.state.layers,[e]:t}})}setDropToSurface(e){this.set({dropToSurface:e})}requestFrame(){this.set({frameRequest:this.state.frameRequest+1})}};function Mo(e,t){return(0,J.useSyncExternalStore)(e.subscribe,()=>t(e.getState()),()=>t(e.getState()))}var No=new Me,Po=new R,Fo=new R,Io=new $e,Lo={X:new R(1,0,0),Y:new R(0,1,0),Z:new R(0,0,1)},Ro={type:`change`},zo={type:`mouseDown`,mode:null},Bo={type:`mouseUp`,mode:null},Vo={type:`objectChange`},Ho=class extends U{constructor(e,t=null){super(void 0,t);let n=new ls(this);this._root=n;let r=new us;this._gizmo=r,n.add(r);let i=new ds;this._plane=i,n.add(i);let a=this;function o(e,t){let n=t;Object.defineProperty(a,e,{get:function(){return n===void 0?t:n},set:function(t){n!==t&&(n=t,i[e]=t,r[e]=t,a.dispatchEvent({type:e+`-changed`,value:t}),a.dispatchEvent(Ro))}}),a[e]=t,i[e]=t,r[e]=t}o(`camera`,e),o(`object`,void 0),o(`enabled`,!0),o(`axis`,null),o(`mode`,`translate`),o(`translationSnap`,null),o(`rotationSnap`,null),o(`scaleSnap`,null),o(`space`,`world`),o(`size`,1),this.viewport=null,o(`dragging`,!1),o(`showX`,!0),o(`showY`,!0),o(`showZ`,!0),o(`showXY`,!0),o(`showYZ`,!0),o(`showXZ`,!0),o(`showXYZE`,!0),o(`showE`,!0),o(`minX`,-1/0),o(`maxX`,1/0),o(`minY`,-1/0),o(`maxY`,1/0),o(`minZ`,-1/0),o(`maxZ`,1/0);let s=new R,c=new R,l=new $e,u=new $e,d=new R,f=new $e,p=new R,m=new R,h=new R,g=new R;o(`worldPosition`,s),o(`worldPositionStart`,c),o(`worldQuaternion`,l),o(`worldQuaternionStart`,u),o(`cameraPosition`,d),o(`cameraQuaternion`,f),o(`pointStart`,p),o(`pointEnd`,m),o(`rotationAxis`,h),o(`rotationAngle`,0),o(`eye`,g),this._offset=new R,this._startNorm=new R,this._endNorm=new R,this._cameraScale=new R,this._parentPosition=new R,this._parentQuaternion=new $e,this._parentQuaternionInv=new $e,this._parentScale=new R,this._worldScaleStart=new R,this._worldQuaternionInv=new $e,this._worldScale=new R,this._positionStart=new R,this._quaternionStart=new $e,this._scaleStart=new R,this._getPointer=Uo.bind(this),this._onPointerDown=Go.bind(this),this._onPointerHover=Wo.bind(this),this._onPointerMove=Ko.bind(this),this._onPointerUp=qo.bind(this),t!==null&&this.connect(t)}connect(e){super.connect(e),this.domElement.addEventListener(`pointerdown`,this._onPointerDown),this.domElement.addEventListener(`pointermove`,this._onPointerHover),this.domElement.addEventListener(`pointerup`,this._onPointerUp),this.domElement.style.touchAction=`none`}disconnect(){this.domElement.removeEventListener(`pointerdown`,this._onPointerDown),this.domElement.removeEventListener(`pointermove`,this._onPointerHover),this.domElement.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.removeEventListener(`pointerup`,this._onPointerUp),this.domElement.style.touchAction=``}getHelper(){return this._root}pointerHover(e){if(this.object===void 0||this.dragging===!0)return;e!==null&&No.setFromCamera(e,this.camera);let t=Jo(this._gizmo.picker[this.mode],No);this.axis=t?t.object.name:null}pointerDown(e){if(!(this.object===void 0||this.dragging===!0||e!=null&&e.button!==0)&&this.axis!==null){e!==null&&No.setFromCamera(e,this.camera);let t=Jo(this._plane,No,!0);t&&(this.object.updateMatrixWorld(),this.object.parent.updateMatrixWorld(),this._positionStart.copy(this.object.position),this._quaternionStart.copy(this.object.quaternion),this._scaleStart.copy(this.object.scale),this.object.matrixWorld.decompose(this.worldPositionStart,this.worldQuaternionStart,this._worldScaleStart),this.pointStart.copy(t.point).sub(this.worldPositionStart)),this.dragging=!0,zo.mode=this.mode,this.dispatchEvent(zo)}}pointerMove(e){let t=this.axis,n=this.mode,r=this.object,i=this.space;if(n===`scale`?i=`local`:(t===`E`||t===`XYZE`||t===`XYZ`)&&(i=`world`),r===void 0||t===null||this.dragging===!1||e!==null&&e.button!==-1)return;e!==null&&No.setFromCamera(e,this.camera);let a=Jo(this._plane,No,!0);if(a){if(this.pointEnd.copy(a.point).sub(this.worldPositionStart),n===`translate`)this._offset.copy(this.pointEnd).sub(this.pointStart),i===`local`&&t!==`XYZ`&&this._offset.applyQuaternion(this._worldQuaternionInv),t.indexOf(`X`)===-1&&(this._offset.x=0),t.indexOf(`Y`)===-1&&(this._offset.y=0),t.indexOf(`Z`)===-1&&(this._offset.z=0),i===`local`&&t!==`XYZ`?this._offset.applyQuaternion(this._quaternionStart).divide(this._parentScale):this._offset.applyQuaternion(this._parentQuaternionInv).divide(this._parentScale),r.position.copy(this._offset).add(this._positionStart),this.translationSnap&&(i===`local`&&(r.position.applyQuaternion(Io.copy(this._quaternionStart).invert()),t.search(`X`)!==-1&&(r.position.x=Math.round(r.position.x/this.translationSnap)*this.translationSnap),t.search(`Y`)!==-1&&(r.position.y=Math.round(r.position.y/this.translationSnap)*this.translationSnap),t.search(`Z`)!==-1&&(r.position.z=Math.round(r.position.z/this.translationSnap)*this.translationSnap),r.position.applyQuaternion(this._quaternionStart)),i===`world`&&(r.getWorldPosition(Po),t.search(`X`)!==-1&&(Po.x=Math.round(Po.x/this.translationSnap)*this.translationSnap),t.search(`Y`)!==-1&&(Po.y=Math.round(Po.y/this.translationSnap)*this.translationSnap),t.search(`Z`)!==-1&&(Po.z=Math.round(Po.z/this.translationSnap)*this.translationSnap),r.position.copy(r.parent.worldToLocal(Po)))),r.position.x=Math.max(this.minX,Math.min(this.maxX,r.position.x)),r.position.y=Math.max(this.minY,Math.min(this.maxY,r.position.y)),r.position.z=Math.max(this.minZ,Math.min(this.maxZ,r.position.z));else if(n===`scale`){if(t.search(`XYZ`)!==-1){let e=this.pointEnd.length()/this.pointStart.length();this.pointEnd.dot(this.pointStart)<0&&(e*=-1),Fo.set(e,e,e)}else Po.copy(this.pointStart),Fo.copy(this.pointEnd),Po.applyQuaternion(this._worldQuaternionInv),Fo.applyQuaternion(this._worldQuaternionInv),Fo.divide(Po),t.search(`X`)===-1&&(Fo.x=1),t.search(`Y`)===-1&&(Fo.y=1),t.search(`Z`)===-1&&(Fo.z=1);r.scale.copy(this._scaleStart).multiply(Fo),this.scaleSnap&&(t.search(`X`)!==-1&&(r.scale.x=Math.round(r.scale.x/this.scaleSnap)*this.scaleSnap||this.scaleSnap),t.search(`Y`)!==-1&&(r.scale.y=Math.round(r.scale.y/this.scaleSnap)*this.scaleSnap||this.scaleSnap),t.search(`Z`)!==-1&&(r.scale.z=Math.round(r.scale.z/this.scaleSnap)*this.scaleSnap||this.scaleSnap))}else if(n===`rotate`){this._offset.copy(this.pointEnd).sub(this.pointStart);let e=20/this.worldPosition.distanceTo(Po.setFromMatrixPosition(this.camera.matrixWorld)),n=!1;t===`XYZE`?(this.rotationAxis.copy(this._offset).cross(this.eye).normalize(),this.rotationAngle=this._offset.dot(Po.copy(this.rotationAxis).cross(this.eye))*e):(t===`X`||t===`Y`||t===`Z`)&&(this.rotationAxis.copy(Lo[t]),Po.copy(Lo[t]),i===`local`&&Po.applyQuaternion(this.worldQuaternion),Po.cross(this.eye),Po.length()===0?n=!0:this.rotationAngle=this._offset.dot(Po.normalize())*e),(t===`E`||n)&&(this.rotationAxis.copy(this.eye),this.rotationAngle=this.pointEnd.angleTo(this.pointStart),this._startNorm.copy(this.pointStart).normalize(),this._endNorm.copy(this.pointEnd).normalize(),this.rotationAngle*=this._endNorm.cross(this._startNorm).dot(this.eye)<0?1:-1),this.rotationSnap&&(this.rotationAngle=Math.round(this.rotationAngle/this.rotationSnap)*this.rotationSnap),i===`local`&&t!==`E`&&t!==`XYZE`?(r.quaternion.copy(this._quaternionStart),r.quaternion.multiply(Io.setFromAxisAngle(this.rotationAxis,this.rotationAngle)).normalize()):(this.rotationAxis.applyQuaternion(this._parentQuaternionInv),r.quaternion.copy(Io.setFromAxisAngle(this.rotationAxis,this.rotationAngle)),r.quaternion.multiply(this._quaternionStart).normalize())}this.dispatchEvent(Ro),this.dispatchEvent(Vo)}}pointerUp(e){(e===null||e.button===0)&&(this.dragging&&this.axis!==null&&(Bo.mode=this.mode,this.dispatchEvent(Bo)),this.dragging=!1,this.axis=null)}dispose(){this.disconnect(),this._root.dispose()}attach(e){return this.object=e,this._root.visible=!0,this}detach(){return this.object=void 0,this.axis=null,this._root.visible=!1,this}reset(){this.enabled&&this.dragging&&(this.object.position.copy(this._positionStart),this.object.quaternion.copy(this._quaternionStart),this.object.scale.copy(this._scaleStart),this.dispatchEvent(Ro),this.dispatchEvent(Vo),this.pointStart.copy(this.pointEnd))}getRaycaster(){return No}getMode(){return this.mode}setMode(e){this.mode=e}setTranslationSnap(e){this.translationSnap=e}setRotationSnap(e){this.rotationSnap=e}setScaleSnap(e){this.scaleSnap=e}setSize(e){this.size=e}setSpace(e){this.space=e}setColors(e,t,n,r){let i=this._gizmo.materialLib;i.xAxis.color.set(e),i.yAxis.color.set(t),i.zAxis.color.set(n),i.active.color.set(r),i.xAxisTransparent.color.set(e),i.yAxisTransparent.color.set(t),i.zAxisTransparent.color.set(n),i.activeTransparent.color.set(r),i.xAxis._color&&i.xAxis._color.set(e),i.yAxis._color&&i.yAxis._color.set(t),i.zAxis._color&&i.zAxis._color.set(n),i.active._color&&i.active._color.set(r),i.xAxisTransparent._color&&i.xAxisTransparent._color.set(e),i.yAxisTransparent._color&&i.yAxisTransparent._color.set(t),i.zAxisTransparent._color&&i.zAxisTransparent._color.set(n),i.activeTransparent._color&&i.activeTransparent._color.set(r)}};function Uo(e){if(this.domElement.ownerDocument.pointerLockElement)return{x:0,y:0,button:e.button};{let t=this.domElement.getBoundingClientRect(),n=this.viewport,r,i,a,o;return n===null?(r=0,i=0,a=t.width,o=t.height):(r=n.x,i=t.height-n.y-n.w,a=n.z,o=n.w),{x:(e.clientX-t.left-r)/a*2-1,y:-(e.clientY-t.top-i)/o*2+1,button:e.button}}}function Wo(e){if(this.enabled)switch(e.pointerType){case`mouse`:case`pen`:this.pointerHover(this._getPointer(e))}}function Go(e){this.enabled&&(document.pointerLockElement||this.domElement.setPointerCapture(e.pointerId),this.domElement.addEventListener(`pointermove`,this._onPointerMove),this.pointerHover(this._getPointer(e)),this.pointerDown(this._getPointer(e)))}function Ko(e){this.enabled&&this.pointerMove(this._getPointer(e))}function qo(e){this.enabled&&(this.domElement.releasePointerCapture(e.pointerId),this.domElement.removeEventListener(`pointermove`,this._onPointerMove),this.pointerUp(this._getPointer(e)))}function Jo(e,t,n){let r=t.intersectObject(e,!0);for(let e=0;e<r.length;e++)if(r[e].object.visible||n)return r[e];return!1}var Yo=new lt,Xo=new R(0,1,0),Zo=new R(0,0,0),Qo=new Ln,$o=new $e,es=new $e,ts=new R,ns=new Ln,rs=new R(1,0,0),is=new R(0,1,0),as=new R(0,0,1),os=new R,ss=new R,cs=new R,ls=class extends he{constructor(e){super(),this.isTransformControlsRoot=!0,this.controls=e,this.visible=!1}updateMatrixWorld(e){let t=this.controls;t.object!==void 0&&(t.object.updateMatrixWorld(),t.object.parent===null?console.error(`TransformControls: The attached 3D object must be a part of the scene graph.`):t.object.parent.matrixWorld.decompose(t._parentPosition,t._parentQuaternion,t._parentScale),t.object.matrixWorld.decompose(t.worldPosition,t.worldQuaternion,t._worldScale),t._parentQuaternionInv.copy(t._parentQuaternion).invert(),t._worldQuaternionInv.copy(t.worldQuaternion).invert()),t.camera.updateMatrixWorld(),t.camera.matrixWorld.decompose(t.cameraPosition,t.cameraQuaternion,t._cameraScale),t.camera.isOrthographicCamera?t.camera.getWorldDirection(t.eye).negate():t.eye.copy(t.cameraPosition).sub(t.worldPosition).normalize(),this.parent&&(ns.copy(this.parent.matrixWorld).invert(),ns.decompose(this.position,this.quaternion,this.scale)),super.updateMatrixWorld(e)}dispose(){this.traverse(function(e){e.geometry&&e.geometry.dispose(),e.material&&e.material.dispose()})}},us=class extends he{constructor(){super(),this.isTransformControlsGizmo=!0,this.type=`TransformControlsGizmo`;let e=new De({depthTest:!1,depthWrite:!1,fog:!1,toneMapped:!1,transparent:!0}),t=new Se({depthTest:!1,depthWrite:!1,fog:!1,toneMapped:!1,transparent:!0}),n=e.clone();n.opacity=.15;let r=t.clone();r.opacity=.5;let i=e.clone();i.color.setHex(16711680);let s=e.clone();s.color.setHex(65280);let c=e.clone();c.color.setHex(255);let l=e.clone();l.color.setHex(16711680),l.opacity=.5;let u=e.clone();u.color.setHex(65280),u.opacity=.5;let f=e.clone();f.color.setHex(255),f.opacity=.5;let p=e.clone();p.opacity=.25;let m=e.clone();m.color.setHex(16776960),m.opacity=.25;let h=e.clone();h.color.setHex(16776960);let g=e.clone();g.color.setHex(7895160),this.materialLib={xAxis:i,yAxis:s,zAxis:c,active:h,xAxisTransparent:l,yAxisTransparent:u,zAxisTransparent:f,activeTransparent:m};let _=new S(0,.04,.1,12);_.translate(0,.05,0);let v=new o(.08,.08,.08);v.translate(0,.04,0);let y=new z;y.setAttribute(`position`,new Dt([0,0,0,1,0,0],3));let b=new S(.0075,.0075,.5,3);b.translate(0,.25,0);function x(e,t){let n=new Nn(e,.0075,3,64,t*Math.PI*2);return n.rotateY(Math.PI/2),n.rotateX(Math.PI/2),n}function C(){let e=new z;return e.setAttribute(`position`,new Dt([0,0,0,1,1,1],3)),e}let w={X:[[new d(_,i),[.5,0,0],[0,0,-Math.PI/2]],[new d(_,i),[-.5,0,0],[0,0,Math.PI/2]],[new d(b,i),[0,0,0],[0,0,-Math.PI/2]]],Y:[[new d(_,s),[0,.5,0]],[new d(_,s),[0,-.5,0],[Math.PI,0,0]],[new d(b,s)]],Z:[[new d(_,c),[0,0,.5],[Math.PI/2,0,0]],[new d(_,c),[0,0,-.5],[-Math.PI/2,0,0]],[new d(b,c),null,[Math.PI/2,0,0]]],XYZ:[[new d(new a(.1,0),p),[0,0,0]]],XY:[[new d(new o(.15,.15,.01),f),[.15,.15,0]]],YZ:[[new d(new o(.15,.15,.01),l),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new d(new o(.15,.15,.01),u),[.15,0,.15],[-Math.PI/2,0,0]]]},T={X:[[new d(new S(.2,0,.6,4),n),[.3,0,0],[0,0,-Math.PI/2]],[new d(new S(.2,0,.6,4),n),[-.3,0,0],[0,0,Math.PI/2]]],Y:[[new d(new S(.2,0,.6,4),n),[0,.3,0]],[new d(new S(.2,0,.6,4),n),[0,-.3,0],[0,0,Math.PI]]],Z:[[new d(new S(.2,0,.6,4),n),[0,0,.3],[Math.PI/2,0,0]],[new d(new S(.2,0,.6,4),n),[0,0,-.3],[-Math.PI/2,0,0]]],XYZ:[[new d(new a(.2,0),n)]],XY:[[new d(new o(.2,.2,.01),n),[.15,.15,0]]],YZ:[[new d(new o(.2,.2,.01),n),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new d(new o(.2,.2,.01),n),[.15,0,.15],[-Math.PI/2,0,0]]]},E={START:[[new d(new a(.01,2),r),null,null,null,`helper`]],END:[[new d(new a(.01,2),r),null,null,null,`helper`]],DELTA:[[new En(C(),r),null,null,null,`helper`]],X:[[new En(y,r),[-1e3,0,0],null,[1e6,1,1],`helper`]],Y:[[new En(y,r),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],`helper`]],Z:[[new En(y,r),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],`helper`]]},D={XYZE:[[new d(x(.5,1),g),null,[0,Math.PI/2,0]]],X:[[new d(x(.5,.5),i)]],Y:[[new d(x(.5,.5),s),null,[0,0,-Math.PI/2]]],Z:[[new d(x(.5,.5),c),null,[0,Math.PI/2,0]]],E:[[new d(x(.75,1),m),null,[0,Math.PI/2,0]]]},O={AXIS:[[new En(y,r),[-1e3,0,0],null,[1e6,1,1],`helper`]]},ee={XYZE:[[new d(new Qt(.25,10,8),n)]],X:[[new d(new Nn(.5,.1,4,24),n),[0,0,0],[0,-Math.PI/2,-Math.PI/2]]],Y:[[new d(new Nn(.5,.1,4,24),n),[0,0,0],[Math.PI/2,0,0]]],Z:[[new d(new Nn(.5,.1,4,24),n),[0,0,0],[0,0,-Math.PI/2]]],E:[[new d(new Nn(.75,.1,2,24),n)]]},k={X:[[new d(v,i),[.5,0,0],[0,0,-Math.PI/2]],[new d(b,i),[0,0,0],[0,0,-Math.PI/2]],[new d(v,i),[-.5,0,0],[0,0,Math.PI/2]]],Y:[[new d(v,s),[0,.5,0]],[new d(b,s)],[new d(v,s),[0,-.5,0],[0,0,Math.PI]]],Z:[[new d(v,c),[0,0,.5],[Math.PI/2,0,0]],[new d(b,c),[0,0,0],[Math.PI/2,0,0]],[new d(v,c),[0,0,-.5],[-Math.PI/2,0,0]]],XY:[[new d(new o(.15,.15,.01),f),[.15,.15,0]]],YZ:[[new d(new o(.15,.15,.01),l),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new d(new o(.15,.15,.01),u),[.15,0,.15],[-Math.PI/2,0,0]]],XYZ:[[new d(new o(.1,.1,.1),p)]]},A={X:[[new d(new S(.2,0,.6,4),n),[.3,0,0],[0,0,-Math.PI/2]],[new d(new S(.2,0,.6,4),n),[-.3,0,0],[0,0,Math.PI/2]]],Y:[[new d(new S(.2,0,.6,4),n),[0,.3,0]],[new d(new S(.2,0,.6,4),n),[0,-.3,0],[0,0,Math.PI]]],Z:[[new d(new S(.2,0,.6,4),n),[0,0,.3],[Math.PI/2,0,0]],[new d(new S(.2,0,.6,4),n),[0,0,-.3],[-Math.PI/2,0,0]]],XY:[[new d(new o(.2,.2,.01),n),[.15,.15,0]]],YZ:[[new d(new o(.2,.2,.01),n),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new d(new o(.2,.2,.01),n),[.15,0,.15],[-Math.PI/2,0,0]]],XYZ:[[new d(new o(.2,.2,.2),n),[0,0,0]]]},j={X:[[new En(y,r),[-1e3,0,0],null,[1e6,1,1],`helper`]],Y:[[new En(y,r),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],`helper`]],Z:[[new En(y,r),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],`helper`]]};function M(e){let t=new he;for(let n in e)for(let r=e[n].length;r--;){let i=e[n][r][0].clone(),a=e[n][r][1],o=e[n][r][2],s=e[n][r][3],c=e[n][r][4];i.name=n,i.tag=c,a&&i.position.set(a[0],a[1],a[2]),o&&i.rotation.set(o[0],o[1],o[2]),s&&i.scale.set(s[0],s[1],s[2]),i.updateMatrix();let l=i.geometry.clone();l.applyMatrix4(i.matrix),i.geometry=l,i.renderOrder=1/0,i.position.set(0,0,0),i.rotation.set(0,0,0),i.scale.set(1,1,1),t.add(i)}return t}this.gizmo={},this.picker={},this.helper={},this.add(this.gizmo.translate=M(w)),this.add(this.gizmo.rotate=M(D)),this.add(this.gizmo.scale=M(k)),this.add(this.picker.translate=M(T)),this.add(this.picker.rotate=M(ee)),this.add(this.picker.scale=M(A)),this.add(this.helper.translate=M(E)),this.add(this.helper.rotate=M(O)),this.add(this.helper.scale=M(j)),this.picker.translate.visible=!1,this.picker.rotate.visible=!1,this.picker.scale.visible=!1}updateMatrixWorld(e){let t=(this.mode===`scale`?`local`:this.space)===`local`?this.worldQuaternion:es;this.gizmo.translate.visible=this.mode===`translate`,this.gizmo.rotate.visible=this.mode===`rotate`,this.gizmo.scale.visible=this.mode===`scale`,this.helper.translate.visible=this.mode===`translate`,this.helper.rotate.visible=this.mode===`rotate`,this.helper.scale.visible=this.mode===`scale`;let n=[];n=n.concat(this.picker[this.mode].children),n=n.concat(this.gizmo[this.mode].children),n=n.concat(this.helper[this.mode].children);for(let e=0;e<n.length;e++){let r=n[e];r.visible=!0,r.rotation.set(0,0,0),r.position.copy(this.worldPosition);let i;if(i=this.camera.isOrthographicCamera?(this.camera.top-this.camera.bottom)/this.camera.zoom:this.worldPosition.distanceTo(this.cameraPosition)*Math.min(1.9*Math.tan(Math.PI*this.camera.fov/360)/this.camera.zoom,7),r.scale.set(1,1,1).multiplyScalar(i*this.size/4),r.tag===`helper`){r.visible=!1,r.name===`AXIS`?(r.visible=!!this.axis,this.axis===`X`&&(Io.setFromEuler(Yo.set(0,0,0)),r.quaternion.copy(t).multiply(Io),Math.abs(Xo.copy(rs).applyQuaternion(t).dot(this.eye))>.9&&(r.visible=!1)),this.axis===`Y`&&(Io.setFromEuler(Yo.set(0,0,Math.PI/2)),r.quaternion.copy(t).multiply(Io),Math.abs(Xo.copy(is).applyQuaternion(t).dot(this.eye))>.9&&(r.visible=!1)),this.axis===`Z`&&(Io.setFromEuler(Yo.set(0,Math.PI/2,0)),r.quaternion.copy(t).multiply(Io),Math.abs(Xo.copy(as).applyQuaternion(t).dot(this.eye))>.9&&(r.visible=!1)),this.axis===`XYZE`&&(Io.setFromEuler(Yo.set(0,Math.PI/2,0)),Xo.copy(this.rotationAxis),r.quaternion.setFromRotationMatrix(Qo.lookAt(Zo,Xo,is)),r.quaternion.multiply(Io),r.visible=this.dragging),this.axis===`E`&&(r.visible=!1)):r.name===`START`?(r.position.copy(this.worldPositionStart),r.visible=this.dragging):r.name===`END`?(r.position.copy(this.worldPosition),r.visible=this.dragging):r.name===`DELTA`?(r.position.copy(this.worldPositionStart),r.quaternion.copy(this.worldQuaternionStart),Po.set(1e-10,1e-10,1e-10).add(this.worldPositionStart).sub(this.worldPosition).multiplyScalar(-1),Po.applyQuaternion(this.worldQuaternionStart.clone().invert()),r.scale.copy(Po),r.visible=this.dragging):(r.quaternion.copy(t),this.dragging?r.position.copy(this.worldPositionStart):r.position.copy(this.worldPosition),this.axis&&(r.visible=this.axis.search(r.name)!==-1));continue}if(r.quaternion.copy(t),this.mode===`translate`||this.mode===`scale`){let e=.99,n=.2;r.name===`X`&&Math.abs(Xo.copy(rs).applyQuaternion(t).dot(this.eye))>e&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1),r.name===`Y`&&Math.abs(Xo.copy(is).applyQuaternion(t).dot(this.eye))>e&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1),r.name===`Z`&&Math.abs(Xo.copy(as).applyQuaternion(t).dot(this.eye))>e&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1),r.name===`XY`&&Math.abs(Xo.copy(as).applyQuaternion(t).dot(this.eye))<n&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1),r.name===`YZ`&&Math.abs(Xo.copy(rs).applyQuaternion(t).dot(this.eye))<n&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1),r.name===`XZ`&&Math.abs(Xo.copy(is).applyQuaternion(t).dot(this.eye))<n&&(r.scale.set(1e-10,1e-10,1e-10),r.visible=!1)}else this.mode===`rotate`&&($o.copy(t),Xo.copy(this.eye).applyQuaternion(Io.copy(t).invert()),r.name.search(`E`)!==-1&&r.quaternion.setFromRotationMatrix(Qo.lookAt(this.eye,Zo,is)),r.name===`X`&&(Io.setFromAxisAngle(rs,Math.atan2(-Xo.y,Xo.z)),Io.multiplyQuaternions($o,Io),r.quaternion.copy(Io)),r.name===`Y`&&(Io.setFromAxisAngle(is,Math.atan2(Xo.x,Xo.z)),Io.multiplyQuaternions($o,Io),r.quaternion.copy(Io)),r.name===`Z`&&(Io.setFromAxisAngle(as,Math.atan2(Xo.y,Xo.x)),Io.multiplyQuaternions($o,Io),r.quaternion.copy(Io)));r.visible=r.visible&&(r.name.indexOf(`X`)===-1||this.showX),r.visible=r.visible&&(r.name.indexOf(`Y`)===-1||this.showY),r.visible=r.visible&&(r.name.indexOf(`Z`)===-1||this.showZ),r.visible=r.visible&&(r.name.indexOf(`E`)===-1||this.showX&&this.showY&&this.showZ),r.visible=r.visible&&(r.name.indexOf(`XY`)===-1||this.showXY),r.visible=r.visible&&(r.name.indexOf(`YZ`)===-1||this.showYZ),r.visible=r.visible&&(r.name.indexOf(`XZ`)===-1||this.showXZ),r.visible=r.visible&&(r.name!==`E`||this.showE),r.visible=r.visible&&(r.name!==`XYZE`||this.showXYZE),r.material._color=r.material._color||r.material.color.clone(),r.material._opacity=r.material._opacity||r.material.opacity,r.material.color.copy(r.material._color),r.material.opacity=r.material._opacity,this.enabled&&this.axis&&(r.name===this.axis||this.axis.split(``).some(function(e){return r.name===e}))&&(r.material.color.copy(this.materialLib.active.color),r.material.opacity=1)}super.updateMatrixWorld(e)}},ds=class extends d{constructor(){super(new on(1e5,1e5,2,2),new De({visible:!1,wireframe:!0,side:2,transparent:!0,opacity:.1,toneMapped:!1})),this.isTransformControlsPlane=!0,this.type=`TransformControlsPlane`}updateMatrixWorld(e){let t=this.space;switch(this.position.copy(this.worldPosition),this.mode===`scale`&&(t=`local`),os.copy(rs).applyQuaternion(t===`local`?this.worldQuaternion:es),ss.copy(is).applyQuaternion(t===`local`?this.worldQuaternion:es),cs.copy(as).applyQuaternion(t===`local`?this.worldQuaternion:es),Xo.copy(ss),this.mode){case`translate`:case`scale`:switch(this.axis){case`X`:Xo.copy(this.eye).cross(os),ts.copy(os).cross(Xo);break;case`Y`:Xo.copy(this.eye).cross(ss),ts.copy(ss).cross(Xo);break;case`Z`:Xo.copy(this.eye).cross(cs),ts.copy(cs).cross(Xo);break;case`XY`:ts.copy(cs);break;case`YZ`:ts.copy(os);break;case`XZ`:Xo.copy(cs),ts.copy(ss);break;case`XYZ`:case`E`:ts.set(0,0,0)}break;default:ts.set(0,0,0)}ts.length()===0?this.quaternion.copy(this.cameraQuaternion):(ns.lookAt(Po.set(0,0,0),ts,Xo),this.quaternion.setFromRotationMatrix(ns)),super.updateMatrixWorld(e)}},fs=16;function ps(e){let t=new Set,n=new Set;e.traverse(e=>{if(e instanceof St)n.add(e.material);else if(e instanceof d||e instanceof We||e instanceof En){t.add(e.geometry);for(let t of Array.isArray(e.material)?e.material:[e.material])n.add(t)}e instanceof vt&&e.dispose()}),t.forEach(e=>e.dispose()),n.forEach(e=>e.dispose()),e.removeFromParent()}var ms=class{field;group=new bn;ground=[];chunks=new Map;center=``;playerScreen={value:new R};aspect={value:1};canopyCutaway=!0;waterMaterial=new et({transparent:!0,depthWrite:!1,fog:!0,uniforms:{...ve.clone(X.fog),time:{value:0}},vertexShader:`varying vec3 world;
      #include <fog_pars_vertex>
      void main() { world = (modelMatrix * vec4(position, 1.)).xyz; vec4 mvPosition = viewMatrix * vec4(world, 1.); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,fragmentShader:`uniform float time; varying vec3 world;
      #include <fog_pars_fragment>
      void main() {
        float ripple = sin(world.x * ${3 .toFixed(4)} + world.z * ${(3/2).toFixed(4)} + time * 1.8) * sin(world.z * ${(5/2).toFixed(4)} - time);
        float crest = smoothstep(.65, 1., ripple);
        vec3 color = mix(vec3(.09,.32,.38), vec3(.38,.65,.65), crest * .55 + .12);
        gl_FragColor = vec4(color, .82);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`});constructor(e){this.field=e}invalidate(e){for(let[t,n]of this.chunks){let[r,i]=t.split(`,`).map(Number);if((r+1)*fs<e.minC||r*fs>e.maxC||(i+1)*fs<e.minR||i*fs>e.maxR)continue;this.releaseChunk(n);let a=this.build(r*fs,i*fs);this.chunks.set(t,a),this.group.add(a)}this.refreshGround(),this.group.updateMatrixWorld(!0)}releaseChunk(e){e.traverse(e=>{e instanceof d&&e.material===this.waterMaterial&&(e.material=new De)}),ps(e)}refreshGround(){this.ground.length=0;for(let e of this.chunks.values())this.ground.push(e.children[0])}update(e,t,n,r){if(this.canopyCutaway&&r){let n=new R(e*qe,this.field.height(e,t)+.9,t*qe),i=-n.clone().applyMatrix4(r.matrixWorldInverse).z,a=n.project(r);this.playerScreen.value.set(a.x,a.y,i),this.aspect.value=r.aspect}else this.playerScreen.value.set(0,0,0);this.waterMaterial.uniforms.time.value=n;let{tile:i,cols:a,rows:o}=this.field.map,s=Math.floor(e/i/fs),c=Math.floor(t/i/fs),l=`${s},${c}`;if(l===this.center)return;this.center=l;let u=new Set;for(let e=c-2;e<=c+2;e++)for(let t=s-2;t<=s+2;t++){if(t<0||e<0||t*fs>=a||e*fs>=o)continue;let n=`${t},${e}`;if(u.add(n),!this.chunks.has(n)){let r=this.build(t*fs,e*fs);this.chunks.set(n,r),this.group.add(r)}}for(let[e,t]of this.chunks)u.has(e)||(this.releaseChunk(t),this.chunks.delete(e));this.refreshGround()}build(e,t){let r=new bn,i=[],a=[],o=[],s=[],c=[],u=[],{cols:f,rows:p,tile:m}=this.field.map,h=m*qe;for(let n=t;n<Math.min(p,t+fs);n++)for(let t=e;t<Math.min(f,e+fs);t++){let e=this.field.cell(t,n),r=_e(t*17,n*29),l=xn(e,this.field.terrain?.paints),d=new V(l.color).multiplyScalar(.91+r*l.noise),f=[[t,n],[t,n+1],[t+1,n],[t+1,n+1]];for(let t of[0,1,2,2,1,3]){let[n,r]=f[t];i.push(n*h,this.field.vertex(n,r),r*h),a.push(d.r,d.g,d.b),e===`~`&&o.push(n*h,-.03,r*h)}let p=(t+.5)*h,g=(n+.5)*h,_=this.field.height((t+.5)*m,(n+.5)*m);r>1-l.trees&&s.push({x:p,y:_,z:g,size:(.75+r*.6)*2}),r>1-l.rocks&&c.push({x:p,y:_,z:g,size:(.3+r*.45)*2}),r>1-l.grass&&u.push({x:p,y:_,z:g,size:(.15+r*.2)*2})}let g=new z;g.setAttribute(`position`,new Dt(i,3)),g.setAttribute(`color`,new Dt(a,3)),g.computeVertexNormals();let _=new d(g,new re({vertexColors:!0,roughness:1,flatShading:!0}));if(_.receiveShadow=!0,r.add(_),o.length){let e=new z;e.setAttribute(`position`,new Dt(o,3)),r.add(new d(e,this.waterMaterial))}let v=(e,t,n,i,a=1,o=!1)=>{if(!e.length){t.dispose();return}let s=new re({color:n,roughness:1,flatShading:!0});o&&(s.onBeforeCompile=e=>{e.uniforms.playerScreen=this.playerScreen,e.uniforms.aspect=this.aspect,e.vertexShader=`varying vec3 canopyScreen;
`+e.vertexShader,e.vertexShader=e.vertexShader.replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
            vec4 canopyW = modelMatrix * instanceMatrix * vec4(position, 1.);
            vec4 canopyClip = projectionMatrix * viewMatrix * canopyW;
            canopyScreen = vec3(canopyClip.xy / canopyClip.w, -(viewMatrix * canopyW).z);`),e.fragmentShader=`uniform vec3 playerScreen; uniform float aspect; varying vec3 canopyScreen;
`+e.fragmentShader,e.fragmentShader=e.fragmentShader.replace(`#include <clipping_planes_fragment>`,`#include <clipping_planes_fragment>
            vec2 canopyD = (canopyScreen.xy - playerScreen.xy) * vec2(aspect, 1.);
            if (length(canopyD) < .13 && canopyScreen.z < playerScreen.z) {
              if (mod(gl_FragCoord.x + gl_FragCoord.y * 2., 4.) > .5) discard;
            }`)},s.customProgramCacheKey=()=>`player-canopy-cutaway`);let c=new vt(t,s,e.length),l=new he;e.forEach((e,t)=>{l.position.set(e.x,e.y+i*e.size,e.z),l.scale.set(e.size,e.size*a,e.size),l.rotation.y=_e(e.x*17,e.z*13)*6,l.updateMatrix(),c.setMatrixAt(t,l.matrix)}),c.castShadow=!0,c.receiveShadow=!0,c.computeBoundingSphere(),r.add(c)};return v(s,new S(.09,.14,1.3,5),7099712,.65),v(s,new l(.8,1.6,7),3300422,1.6,1,!0),v(s,new l(.6,1.4,7),5077331,2.3,1,!0),v(c,new n(1,0),9672077,.25,.7),v(u,new l(.35,1,3),8557654,.45),r}dispose(){ps(this.group),this.waterMaterial.dispose(),this.chunks.clear(),this.ground.length=0}},hs=(e,t=0)=>typeof e==`number`&&Number.isFinite(e)?e:t,gs=new Map;function _s(e){if(!e)return Promise.resolve([]);let t=gs.get(e);return t||(t=fetch(`/assets/maps/${e}.stamps.json`).then(e=>e.ok?e.json():null).then(e=>{let t=e?.stamps;return(Array.isArray(t)?t:[]).map(e=>{let t=e??{};return{feature:typeof t.feature==`string`?t.feature:typeof t.featureId==`string`?t.featureId:``,x:hs(t.x),y:hs(t.y),rotation:hs(t.rotation),flipX:t.flipX===!0,scale:hs(t.scale,1)||1}})}).catch(()=>[]),gs.set(e,t)),t}var vs=class{group=new bn;disposed=!1;constructor(e,t){_s(e).then(e=>{if(!this.disposed)for(let n of e){if(!n.feature.startsWith(`building_`))continue;let e=rn(n.feature.includes(`tower`));e.position.set(n.x*qe,t.height(n.x,n.y),n.y*qe),e.rotation.y=-n.rotation*Math.PI/180;let r=n.scale*2;e.scale.set(r*(n.flipX?-1:1),r,r),this.group.add(e)}})}dispose(){this.disposed=!0,ps(this.group)}},ys=`application/x-scene3d-prefab`,bs=Math.PI/180,xs=80,Ss=e=>e instanceof HTMLElement&&(e.tagName===`INPUT`||e.tagName===`SELECT`||e.tagName===`TEXTAREA`||e.isContentEditable),Cs=new R(0,-1,0),ws=new De,Ts={".":7645275,",":9551209,T:4094799,H:12163960,R:10125413,S:15135733,D:14204280,I:8639711,"#":14706021,"~":5282768};function Es(e){let t=e.shape===`sphere`?new Qt(.5,10,8):new o(1,1,1),n=new d(t,ws);return n.visible=!1,n.position.set(e.offset[0],e.offset[1],e.offset[2]),n.scale.set(e.size[0],e.size[1],e.size[2]),n.userData.editorOnly=!0,e.isTrigger&&(n.userData.triggerOnly=!0),n}var Ds=class{host;store;renderer;scene=new dn;camera=new hn(50,1,.05,1500);sun=new fe(16770487,2.6);hemi=new pt(13231342,7431750,2);grid=new Lt(xs,xs,5921370,3947580);objects=new bn;instances=new Map;selectionBoxes=[];gizmo;gizmoTarget=null;terrain=null;buildings=null;field=null;raycaster=new Me;resize;frame=0;lastTime=0;disposed=!1;lastFrameRequest=0;lastDoc=null;terrainBrush=null;brushStroke=!1;brushElapsed=0;brushPoint=null;lastBrushPoint=null;brushRing=new v(new z,new Se({color:16763762,depthTest:!1,transparent:!0,opacity:.95}));stage=new bn;onFrame=()=>{};onMapLoaded=()=>{};gizmoOverride=null;pivot=new R(0,0,0);yaw=.6;pitch=.55;distance=24;buttons={left:!1,middle:!1,right:!1,alt:!1};pointer={x:0,y:0,downX:0,downY:0};flyKeys=new Set;unsubscribe;onStatus=()=>{};constructor(e,t){this.host=e,this.store=t,this.renderer=new eo({antialias:!0,powerPreference:`high-performance`}),this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75)),this.renderer.shadowMap.enabled=!0,this.renderer.shadowMap.type=1,this.renderer.toneMapping=4,this.renderer.toneMappingExposure=1.2,this.renderer.domElement.tabIndex=0,this.renderer.domElement.setAttribute(`aria-label`,`Scene view. Right-drag to look, WASD to fly, middle-drag to pan, Alt+drag to orbit, F to frame.`),e.appendChild(this.renderer.domElement),this.sun.castShadow=!0,this.sun.shadow.mapSize.set(2048,2048),Object.assign(this.sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:120}),this.sun.shadow.bias=-3e-4,this.sun.shadow.normalBias=.035,this.scene.add(this.hemi,this.sun,this.sun.target,this.grid,this.objects,this.stage),this.brushRing.visible=!1,this.brushRing.renderOrder=10,this.scene.add(this.brushRing),this.gizmo=new Ho(this.camera,this.renderer.domElement),this.gizmo.setSize(.9),this.scene.add(this.gizmo.getHelper()),this.gizmo.addEventListener(`dragging-changed`,e=>{e.value?this.store.beginDrag():this.store.endDrag()}),this.gizmo.addEventListener(`objectChange`,()=>this.writeGizmo()),this.resize=new ResizeObserver(this.onResize),this.resize.observe(e),this.onResize();let n=this.renderer.domElement;n.addEventListener(`pointerdown`,this.onPointerDown),n.addEventListener(`pointermove`,this.onPointerMove),n.addEventListener(`pointerup`,this.onPointerUp),n.addEventListener(`pointerleave`,this.onPointerUp),n.addEventListener(`pointercancel`,this.onPointerUp),n.addEventListener(`wheel`,this.onWheel,{passive:!1}),n.addEventListener(`contextmenu`,e=>e.preventDefault()),n.addEventListener(`dragover`,this.onDragOver),n.addEventListener(`drop`,this.onDrop),window.addEventListener(`keydown`,this.onKeyDown),window.addEventListener(`keyup`,this.onKeyUp),window.addEventListener(`blur`,this.onBlur),this.unsubscribe=t.subscribe(this.onStore),this.onStore(),this.applyCamera(),this.frame=requestAnimationFrame(this.tick)}loadMap(e){this.endBrushStroke(),this.terrain?.dispose(),this.buildings?.dispose(),this.field=new Dn(e.overworld,e.terrain_layers,this.store.getState().doc.terrain),this.terrain=new ms(this.field),this.terrain.canopyCutaway=!1,this.scene.add(this.terrain.group),this.buildings=new vs(e.id,this.field),this.scene.add(this.buildings.group);let{cols:t,rows:n,tile:r,cells:i}=e.overworld,a=t/2,o=n/2,s=1/0;for(let e=i.indexOf(`H`);e>=0;e=i.indexOf(`H`,e+1)){let r=e%t,i=Math.floor(e/t),c=(r-t*.45)**2+(i-n*.45)**2;c<s&&(s=c,a=r,o=i)}this.pivot.set(a*r*qe,this.field.height(a*r,o*r),o*r*qe),this.distance=24,this.applyCamera(),this.onStore(),this.onMapLoaded()}setTerrainBrush(e){this.endBrushStroke(),this.terrainBrush=e,this.brushRing.visible=!1,this.syncGizmo(this.store.getState())}endBrushStroke(){this.brushStroke&&(this.brushStroke=!1,this.store.endDrag()),this.lastBrushPoint=null,this.brushElapsed=0}updateBrushPoint(e){if(!this.terrainBrush||!this.terrain||!this.terrain.group.visible){this.brushPoint=null,this.brushRing.visible=!1;return}this.raycaster.setFromCamera(this.ndc(e),this.camera),this.brushPoint=this.raycaster.intersectObjects(this.terrain.ground)[0]?.point??null,this.updateBrushRing()}updateBrushRing(){let e=this.brushPoint,t=this.terrainBrush;if(this.brushRing.visible=!!e&&!!t,!e||!t)return;let n=this.brushRing.material;n.color.setHex(t.mode===`paint`?Ts[t.cell]??16763762:16763762),n.opacity=t.mode===`paint`&&(t.cell===`#`||t.cell===`~`)?1:.88;let r=[];for(let n=0;n<96;n++){let i=n/96*Math.PI*2,a=e.x+Math.cos(i)*t.radius*qe,o=e.z+Math.sin(i)*t.radius*qe;r.push(new R(a,this.groundHeight(a,o)+.05,o))}this.brushRing.geometry.setFromPoints(r),this.brushRing.geometry.computeBoundingSphere()}paintTerrain(e){if(!this.brushStroke||!this.terrainBrush||!this.field||!this.brushPoint)return;let t=this.store.getState().doc.terrain??mt(),n=t,r=this.brushPoint,i=this.lastBrushPoint??r,a=Math.hypot(r.x-i.x,r.z-i.z),o=Math.min(64,Math.max(1,Math.ceil(a/(this.terrainBrush.radius*qe*.25))));for(let t=1;t<=o;t++)n=yt(this.field,n,I.lerp(i.x,r.x,t/o)/qe,I.lerp(i.z,r.z,t/o)/qe,this.terrainBrush,e/o);this.lastBrushPoint=r.clone(),n!==t&&this.store.setTerrainTransient(n),this.updateBrushRing()}groundHeight(e,t){return this.field?this.field.height(e/qe,t/qe):0}placementPoint(){let e=this.pivot.clone(),t=Math.round(e.x*2)/2,n=Math.round(e.z*2)/2,r=this.store.getState().dropToSurface?this.dropY(t,n,e.y+.01):this.groundHeight(t,n);return[t,Math.round(r*1e3)/1e3,n]}dropTargets(){let e=[this.objects];return this.buildings&&e.push(this.buildings.group),this.terrain&&e.push(...this.terrain.ground),e}dropY(e,t,n,r){this.raycaster.set(new R(e,n,t),Cs);for(let e of this.raycaster.intersectObjects(this.dropTargets(),!0)){if(e.object.userData.editorOnly||e.object.userData.triggerOnly)continue;let t=e.object;for(;t&&!t.userData.sceneId;)t=t.parent;if(!(t&&r?.has(t.userData.sceneId)))return e.point.y}return this.groundHeight(e,t)}dropSelected(){let e=this.store.getState(),t=e.selection.filter(t=>!e.selection.some(n=>n!==t&&Pt(e.doc,n,t)));if(!t.length)return;let n=new Set(t.flatMap(t=>Zt(e.doc,t)));this.scene.updateMatrixWorld(!0);let r=new Map;for(let e of t){let t=this.instances.get(e);if(!t)continue;let i=t.object.getWorldPosition(new R);i.y=this.dropY(i.x,i.z,i.y+.01,n),r.set(e,i)}if(!r.size)return;let i=e=>Math.round(e*1e3)/1e3;this.store.update(e=>{for(let[t,n]of r){let r=e.objects.find(e=>e.id===t),a=this.instances.get(t);if(!r||!a)continue;let o=a.object.parent,s=o?o.worldToLocal(n.clone()):n;r.transform.position=[i(s.x),i(s.y),i(s.z)]}})}onStore=()=>{let e=this.store.getState();if(e.doc!==this.lastDoc){let t=jn(this.lastDoc?.terrain,e.doc.terrain);this.field?.setTerrain(e.doc.terrain),t&&this.terrain?.invalidate(t),this.syncObjects(e),this.lastDoc=e.doc}this.grid.visible=e.layers.grid,this.terrain&&(this.terrain.group.visible=e.layers.terrain),this.buildings&&(this.buildings.group.visible=e.layers.stamps),this.syncGizmo(e),e.frameRequest!==this.lastFrameRequest&&(this.lastFrameRequest=e.frameRequest,this.frameSelection(e));let t=e.doc.environment;this.sun.color.set(t.sunColor),this.sun.intensity=t.sunIntensity,this.scene.background=new V(t.skyColor),this.scene.fog=e.layers.fog&&t.fogFar>t.fogNear?new Xt(t.skyColor,t.fogNear,t.fogFar):null};syncObjects(e){let t=new Set;for(let n of e.doc.objects){t.add(n.id);let e=`${n.prefab}|${JSON.stringify(n.props)}|${JSON.stringify(n.components?.collider??null)}`,r=this.instances.get(n.id);if(r&&r.signature!==e&&(this.detach(r.object),r=void 0),!r){let t=wt(n.prefab,n.props);t.userData.sceneId=n.id,t.children.length||t.add(Object.assign(new m(.6),{userData:{editorOnly:!0}}));let i=n.components?.collider;i?.enabled&&t.add(Es(i)),r={object:t,signature:e},this.instances.set(n.id,r)}this.applyTransform(r.object,n),r.object.visible=n.visible}for(let[e,n]of this.instances)t.has(e)||(this.detach(n.object),this.instances.delete(e));for(let t of e.doc.objects){let e=this.instances.get(t.id),n=t.parent&&this.instances.get(t.parent)?.object||this.objects;e.object.parent!==n&&n.add(e.object)}}detach(e){this.gizmo.object===e&&this.gizmo.detach();for(let t of[...e.children])t.userData.sceneId&&this.objects.add(t);ps(e)}applyTransform(e,t){let{position:n,rotation:r,scale:i}=t.transform;e.position.set(n[0],n[1],n[2]),e.rotation.set(r[0]*bs,r[1]*bs,r[2]*bs),e.scale.set(i[0],i[1],i[2])}setGizmoOverride(e,t){this.gizmoOverride=e?{object:e,onWrite:t}:null,this.syncGizmo(this.store.getState())}getPivot(){return this.pivot.clone()}frameObject(e,t=5){e.updateWorldMatrix(!0,!0);let n=new jt().setFromObject(e);n.isEmpty()||n.getCenter(this.pivot),this.distance=t,this.applyCamera()}syncGizmo(e){if(this.gizmoOverride){this.gizmo.object!==this.gizmoOverride.object&&this.gizmo.attach(this.gizmoOverride.object),this.gizmoTarget=null,this.gizmo.setMode(e.tool===`view`||e.tool===`move`?`translate`:e.tool),this.gizmo.setSpace(e.space),this.gizmo.setTranslationSnap(e.snap?e.snapMove:null),this.gizmo.setRotationSnap(e.snap?e.snapRotate*bs:null),this.gizmo.setScaleSnap(e.snap?e.snapScale:null),this.gizmo.enabled=!0;return}let t=this.terrainBrush||e.tool===`view`||e.selection.length!==1?null:e.selection[0],n=t?this.instances.get(t)?.object:void 0;n?this.gizmo.object!==n&&(this.gizmo.attach(n),this.gizmoTarget=t):(this.gizmo.object&&this.gizmo.detach(),this.gizmoTarget=null),this.gizmo.setMode(e.tool===`view`||e.tool===`move`?`translate`:e.tool),this.gizmo.setSpace(e.space),this.gizmo.setTranslationSnap(e.snap?e.snapMove:null),this.gizmo.setRotationSnap(e.snap?e.snapRotate*bs:null),this.gizmo.setScaleSnap(e.snap?e.snapScale:null),this.gizmo.enabled=!!n}writeGizmo(){let e=this.gizmo.object;if(!e||!this.gizmo.dragging)return;let t=e=>Math.round(e*1e3)/1e3,n={position:[t(e.position.x),t(e.position.y),t(e.position.z)],rotation:[t(e.rotation.x/bs),t(e.rotation.y/bs),t(e.rotation.z/bs)],scale:[t(e.scale.x),t(e.scale.y),t(e.scale.z)]};if(!this.gizmoTarget){this.gizmoOverride?.onWrite?.(n);return}this.store.setTransformTransient(this.gizmoTarget,n)}frameSelection(e){let t=new jt,n=e.selection.length?e.selection:[...this.instances.keys()];for(let e of n){let n=this.instances.get(e);n&&t.expandByObject(n.object)}t.isEmpty()||(t.getCenter(this.pivot),this.distance=I.clamp(t.getSize(new R).length()*1.4,2,120),this.applyCamera())}forward(){return new R(-Math.sin(this.yaw)*Math.cos(this.pitch),-Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch))}applyCamera(){this.pitch=I.clamp(this.pitch,-1.5,1.5),this.distance=I.clamp(this.distance,.5,200),this.camera.position.copy(this.pivot).addScaledVector(this.forward(),-this.distance),this.camera.lookAt(this.pivot),this.camera.updateMatrixWorld()}fly(e){if(!this.buttons.right||!this.flyKeys.size)return;let t=(this.flyKeys.has(`shift`)?3:1)*Math.max(4,this.distance*.6)*e,n=this.forward(),r=new R().crossVectors(n,new R(0,1,0)).normalize(),i=new R;this.flyKeys.has(`w`)&&i.add(n),this.flyKeys.has(`s`)&&i.sub(n),this.flyKeys.has(`d`)&&i.add(r),this.flyKeys.has(`a`)&&i.sub(r),this.flyKeys.has(`e`)&&(i.y+=1),this.flyKeys.has(`q`)&&--i.y,i.lengthSq()&&(this.pivot.addScaledVector(i.normalize(),t),this.applyCamera())}onResize=()=>{let e=Math.max(1,this.host.clientWidth),t=Math.max(1,this.host.clientHeight);this.renderer.setSize(e,t),this.camera.aspect=e/t,this.camera.updateProjectionMatrix()};ndc(e){let t=this.renderer.domElement.getBoundingClientRect();return new kt((e.clientX-t.left)/t.width*2-1,1-(e.clientY-t.top)/t.height*2)}onPointerDown=e=>{this.renderer.domElement.focus(),this.pointer={x:e.clientX,y:e.clientY,downX:e.clientX,downY:e.clientY},this.buttons.alt=e.altKey,e.button===0&&(this.buttons.left=!0),e.button===1&&(this.buttons.middle=!0,e.preventDefault()),e.button===2&&(this.buttons.right=!0),this.renderer.domElement.setPointerCapture(e.pointerId),e.button===0&&!e.altKey&&this.terrainBrush&&(this.updateBrushPoint(e),this.brushPoint&&(this.store.beginDrag(),this.brushStroke=!0,this.paintTerrain(.05)),e.preventDefault())};onPointerMove=e=>{let t=e.clientX-this.pointer.x,n=e.clientY-this.pointer.y;if(this.pointer.x=e.clientX,this.pointer.y=e.clientY,this.updateBrushPoint(e),!this.gizmo.dragging){if(this.buttons.right){let e=this.camera.position.clone();this.yaw-=t*.0045,this.pitch+=n*.0045,this.pitch=I.clamp(this.pitch,-1.5,1.5),this.pivot.copy(e).addScaledVector(this.forward(),this.distance),this.applyCamera()}else if(this.buttons.middle){let e=this.distance*.0018,r=new R().setFromMatrixColumn(this.camera.matrixWorld,0),i=new R().setFromMatrixColumn(this.camera.matrixWorld,1);this.pivot.addScaledVector(r,-t*e).addScaledVector(i,n*e),this.applyCamera()}else this.buttons.left&&this.buttons.alt&&(this.yaw-=t*.006,this.pitch+=n*.006,this.applyCamera())}};onPointerUp=e=>{let t=this.brushStroke;(e.button===0||e.type===`pointerleave`||e.type===`pointercancel`)&&(t&&this.brushElapsed>0&&this.paintTerrain(this.brushElapsed),this.endBrushStroke());let n=Math.hypot(e.clientX-this.pointer.downX,e.clientY-this.pointer.downY)<4;!t&&!this.terrainBrush&&e.type===`pointerup`&&e.button===0&&this.buttons.left&&n&&!this.buttons.alt&&!this.gizmo.dragging&&!this.gizmo.axis&&this.pick(e),(e.type===`pointerleave`||e.button===0)&&(this.buttons.left=!1),(e.type===`pointerleave`||e.button===1)&&(this.buttons.middle=!1),(e.type===`pointerleave`||e.button===2)&&(this.buttons.right=!1),(e.type===`pointerleave`||e.type===`pointercancel`)&&(this.flyKeys.clear(),this.brushRing.visible=!1,this.buttons={left:!1,middle:!1,right:!1,alt:!1}),this.renderer.domElement.hasPointerCapture(e.pointerId)&&this.renderer.domElement.releasePointerCapture(e.pointerId)};onWheel=e=>{e.preventDefault(),this.distance*=Math.exp(e.deltaY*.0012),this.applyCamera()};pick(e){this.raycaster.setFromCamera(this.ndc(e),this.camera);let t=this.raycaster.intersectObjects(this.objects.children,!0).find(e=>!e.object.userData.editorOnly)?.object??null;for(;t&&!t.userData.sceneId;)t=t.parent;let n=t?.userData.sceneId;if(!n){e.shiftKey||this.store.select([]);return}e.shiftKey?this.store.toggleSelect(n):this.store.select([n])}dropPoint(e,t=!1){if(this.raycaster.setFromCamera(this.ndc(e),this.camera),t){let e=this.raycaster.intersectObjects(this.dropTargets(),!0).find(e=>!e.object.userData.editorOnly&&!e.object.userData.triggerOnly);if(e)return e.point}let n=this.terrain?this.raycaster.intersectObjects(this.terrain.ground)[0]:void 0;return n?n.point:this.raycaster.ray.intersectPlane(new Wt(new R(0,1,0),0),new R)}onDragOver=e=>{e.dataTransfer?.types.includes(`application/x-scene3d-prefab`)&&(e.preventDefault(),e.dataTransfer.dropEffect=`copy`)};onDrop=e=>{let t=e.dataTransfer?.getData(ys);if(!t)return;e.preventDefault();let n=this.store.getState(),r=this.dropPoint(e,n.dropToSurface);if(!r)return;let i=e=>n.snap?Math.round(e/n.snapMove)*n.snapMove:Math.round(e*100)/100,a=i(r.x),o=i(r.z),s=n.dropToSurface?this.dropY(a,o,r.y+.01):this.groundHeight(a,o);this.store.addObject(t,[a,Math.round(s*1e3)/1e3,o])};onKeyDown=e=>{if(Ss(e.target))return;let t=e.key.toLowerCase();if(this.buttons.right){this.flyKeys.add(t),e.preventDefault();return}let n=e.ctrlKey||e.metaKey;if(n&&t===`z`){e.preventDefault(),this.endBrushStroke(),e.shiftKey?this.store.redo():this.store.undo();return}if(n&&t===`y`){e.preventDefault(),this.endBrushStroke(),this.store.redo();return}if(n&&t===`d`){e.preventDefault(),this.store.duplicateSelected();return}if(!n){switch(t){case`q`:this.store.setTool(`view`);break;case`w`:this.store.setTool(`move`);break;case`e`:this.store.setTool(`rotate`);break;case`r`:this.store.setTool(`scale`);break;case`x`:this.store.setSpace(this.store.getState().space===`world`?`local`:`world`);break;case`f`:this.store.requestFrame();break;case`delete`:case`backspace`:this.store.deleteSelected();break;case`escape`:this.store.select([]);break;default:return}e.preventDefault()}};onKeyUp=e=>{this.flyKeys.delete(e.key.toLowerCase())};onBlur=()=>{this.endBrushStroke(),this.brushRing.visible=!1,this.flyKeys.clear(),this.buttons={left:!1,middle:!1,right:!1,alt:!1}};tick=e=>{if(this.disposed)return;let t=this.lastTime?Math.min((e-this.lastTime)/1e3,.05):0;this.lastTime=e,this.fly(t),this.brushStroke&&(this.brushElapsed+=t,this.brushElapsed>=.05&&(this.paintTerrain(this.brushElapsed),this.brushElapsed=0)),this.terrain&&this.terrain.update(this.pivot.x/qe,this.pivot.z/qe,e/1e3),this.onFrame(t,e/1e3),this.grid.position.set(Math.round(this.pivot.x),this.groundHeight(this.pivot.x,this.pivot.z)+.01,Math.round(this.pivot.z)),this.sun.position.copy(this.pivot).add(new R(-16,25,12)),this.sun.target.position.copy(this.pivot);let n=this.store.getState();for(;this.selectionBoxes.length>n.selection.length;){let e=this.selectionBoxes.pop();this.scene.remove(e),e.dispose()}n.selection.forEach((e,t)=>{let n=this.instances.get(e);if(!n)return;let r=this.selectionBoxes[t];r?r.setFromObject(n.object):(r=new Ot(n.object,16754470),this.selectionBoxes[t]=r,this.scene.add(r))}),this.renderer.render(this.scene,this.camera),this.frame=requestAnimationFrame(this.tick)};dispose(){this.endBrushStroke(),this.disposed=!0,cancelAnimationFrame(this.frame),this.unsubscribe(),this.resize.disconnect(),window.removeEventListener(`keydown`,this.onKeyDown),window.removeEventListener(`keyup`,this.onKeyUp),window.removeEventListener(`blur`,this.onBlur),this.gizmo.detach(),this.gizmo.dispose(),ps(this.brushRing),ps(this.stage),this.terrain?.dispose(),this.buildings?.dispose();for(let e of this.instances.values())ps(e.object);for(let e of this.selectionBoxes)e.dispose();this.renderer.dispose(),this.renderer.domElement.remove()}},Z=t(),Os=`application/x-scene3d-object`,ks={Buildings:`⌂`,Nature:`❦`,Landmarks:`✦`,Primitives:`◼`,Lights:`☼`,Utility:`◇`};function As({store:e}){let t=Mo(e,e=>e.doc),n=Mo(e,e=>e.selection),[r,i]=(0,J.useState)(``),[a,o]=(0,J.useState)(new Set),[s,c]=(0,J.useState)(null),l=(0,J.useMemo)(()=>cn(t),[t]),u=r.trim().toLowerCase(),d=e=>o(t=>{let n=new Set(t);return n.has(e)?n.delete(e):n.add(e),n}),f=e=>{let t=e.currentTarget.getBoundingClientRect(),n=(e.clientY-t.top)/t.height;return n<.25?`before`:n>.75?`after`:`into`},p=(t,n)=>{t.preventDefault(),t.stopPropagation();let r=t.dataTransfer.getData(Os);if(c(null),!r)return;if(n===null){e.reparent(r,null);return}let i=f(t);i===`into`?e.reparent(r,n):e.reorder(r,n,i===`after`)},m=[];if(u)for(let e of t.objects)(e.name.toLowerCase().includes(u)||e.prefab.includes(u))&&m.push({o:e,depth:0});else{let e=(t,n)=>{for(let r of l.get(t)??[])m.push({o:r,depth:n}),a.has(r.id)||e(r.id,n+1)};e(``,0)}return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`ed-dock-title`,children:[`Hierarchy `,(0,Z.jsx)(`span`,{children:t.objects.length})]}),(0,Z.jsx)(`div`,{className:`ed-search`,children:(0,Z.jsx)(`input`,{"aria-label":`Search objects`,placeholder:`Search objects…`,value:r,onChange:e=>i(e.target.value)})}),(0,Z.jsxs)(`div`,{className:`ed-tree sc-tree`,onDragOver:e=>{e.dataTransfer.types.includes(Os)&&e.preventDefault()},onDrop:e=>p(e,null),onClick:t=>{t.target===t.currentTarget&&e.select([])},children:[(0,Z.jsxs)(`div`,{className:`ed-tree-root`,children:[`▾ `,(0,Z.jsx)(`strong`,{children:t.map||`scene`})]}),m.map(({o:t,depth:r})=>{let i=(l.get(t.id)?.length??0)>0,o=n.includes(t.id),u=Ht.get(t.prefab);return(0,Z.jsxs)(`div`,{className:`ed-tree-item sc-tree-item ${o?`selected`:``} ${s?.id===t.id?`drop-${s.zone}`:``} ${t.visible?``:`hidden`}`,style:{paddingLeft:8+Math.min(r,8)*14},role:`treeitem`,"aria-selected":o,draggable:!0,onDragStart:e=>{e.dataTransfer.setData(Os,t.id),e.dataTransfer.effectAllowed=`move`},onDragOver:e=>{if(!e.dataTransfer.types.includes(Os))return;e.preventDefault(),e.stopPropagation();let n=f(e);(s?.id!==t.id||s.zone!==n)&&c({id:t.id,zone:n})},onDragLeave:()=>c(e=>e?.id===t.id?null:e),onDrop:e=>p(e,t.id),onClick:n=>{n.shiftKey||n.ctrlKey||n.metaKey?e.toggleSelect(t.id):e.select([t.id])},onDoubleClick:()=>{e.select([t.id]),e.requestFrame()},children:[(0,Z.jsx)(`button`,{className:`sc-tree-caret`,"aria-label":a.has(t.id)?`Expand`:`Collapse`,style:{visibility:i?`visible`:`hidden`},onClick:e=>{e.stopPropagation(),d(t.id)},children:a.has(t.id)?`▸`:`▾`}),(0,Z.jsx)(`span`,{className:`ed-bone-icon`,title:u?.label??t.prefab,children:ks[u?.category??`Utility`]??`◇`}),(0,Z.jsxs)(`span`,{className:`sc-tree-name`,title:t.prefabInstance?`Linked prefab: ${t.prefabInstance.assetId}`:void 0,children:[t.prefabInstance?`◆ `:``,t.name,t.prefabInstance?.overrides.length?` *`:``]}),(0,Z.jsx)(`button`,{className:`sc-tree-eye`,"aria-label":t.visible?`Hide`:`Show`,"aria-pressed":!t.visible,onClick:n=>{n.stopPropagation(),e.patchObject(t.id,{visible:!t.visible})},children:t.visible?`◉`:`◌`})]},t.id)}),!m.length&&(0,Z.jsx)(`p`,{className:`ed-empty`,children:t.objects.length?`No matches`:`Drag prefabs from Project into the Scene`})]})]})}function js({value:e,onChange:t,onBegin:n,onEnd:r,step:i=.1,min:a,max:o,label:s}){let[c,l]=(0,J.useState)(String(e)),[u,d]=(0,J.useState)(!1);return(0,J.useEffect)(()=>{u||l(String(e))},[e,u]),(0,Z.jsx)(`input`,{type:`number`,step:i,min:a,max:o,value:c,"aria-label":s,onFocus:()=>{d(!0),n()},onChange:e=>{l(e.target.value);let n=parseFloat(e.target.value);Number.isFinite(n)&&t(n)},onBlur:()=>{d(!1),r()},onKeyDown:e=>{e.key===`Enter`&&e.currentTarget.blur()}})}function Ms({label:e,value:t,onChange:n,onBegin:r,onEnd:i}){return(0,Z.jsx)(`input`,{type:`color`,"aria-label":e,value:t,onFocus:r,onBlur:i,onChange:e=>n(e.target.value)})}function Ns({label:e,value:t,onChange:n,onBegin:r,onEnd:i,step:a}){return(0,Z.jsxs)(`div`,{className:`ed-row sc-vec3`,children:[(0,Z.jsx)(`label`,{children:e}),[`X`,`Y`,`Z`].map((o,s)=>(0,Z.jsxs)(`span`,{className:`sc-axis`,children:[(0,Z.jsx)(`b`,{className:`sc-axis-${o}`,children:o}),(0,Z.jsx)(js,{label:`${e} ${o}`,value:t[s],step:a,onBegin:r,onEnd:i,onChange:e=>{let r=[...t];r[s]=e,n(r)}})]},o))]})}function Ps({title:e,children:t,right:n}){return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`h3`,{className:`sc-section`,children:[e,n&&(0,Z.jsx)(`span`,{className:`spacer`}),n]}),t]})}function Fs({def:e,value:t,onChange:n,onBegin:r,onEnd:i}){return e.type===`color`?(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:e.label}),(0,Z.jsx)(Ms,{label:e.label,value:typeof t==`string`?t:String(e.default),onBegin:r,onEnd:i,onChange:n}),(0,Z.jsx)(`code`,{children:String(t)})]}):e.type===`boolean`?(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:e.label}),(0,Z.jsx)(`input`,{type:`checkbox`,"aria-label":e.label,checked:t===!0,onChange:e=>n(e.target.checked)})]}):(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:e.label}),(0,Z.jsx)(js,{label:e.label,value:typeof t==`number`?t:Number(e.default),step:e.step,min:e.min,max:e.max,onBegin:r,onEnd:i,onChange:n}),e.min!==void 0&&e.max!==void 0&&(0,Z.jsx)(`input`,{type:`range`,"aria-label":`${e.label} slider`,min:e.min,max:e.max,step:e.step,value:typeof t==`number`?t:Number(e.default),onPointerDown:r,onPointerUp:i,onChange:e=>n(parseFloat(e.target.value))})]})}function Is({components:e,apply:t,onBegin:n,onEnd:r}){let i=(n,r,i,a=!1)=>t(tt({...e,[n]:{...e?.[n],[r]:i}}),a);return(0,Z.jsx)(Z.Fragment,{children:Kt.map(a=>{let o=a.key,s=e?.[o];return s?(0,Z.jsxs)(Ps,{title:a.label,right:(0,Z.jsx)(`button`,{onClick:()=>{let n={...e};delete n[o],t(n)},children:`Remove`}),children:[(0,Z.jsx)(`p`,{className:`ed-hint`,children:a.description}),a.fields.map(e=>{let t=s[e.key];return e.type===`vec3`?(0,Z.jsx)(Ns,{label:e.label,value:t,onBegin:n,onEnd:r,onChange:t=>i(o,e.key,t,!0)},e.key):(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:e.label}),e.type===`boolean`?(0,Z.jsx)(`input`,{"aria-label":`${a.label} ${e.label}`,type:`checkbox`,checked:t===!0,onChange:t=>i(o,e.key,t.target.checked)}):e.type===`select`?(0,Z.jsx)(`select`,{"aria-label":`${a.label} ${e.label}`,value:String(t??``),onChange:t=>i(o,e.key,t.target.value),children:e.options?.map(e=>(0,Z.jsx)(`option`,{children:e},e))}):(0,Z.jsx)(`input`,{"aria-label":`${a.label} ${e.label}`,type:e.type===`number`?`number`:`text`,min:e.min,step:e.step,value:String(t??``),onChange:t=>{if(e.type===`number`){let n=t.target.valueAsNumber;Number.isFinite(n)&&i(o,e.key,n)}else i(o,e.key,t.target.value)}})]},e.key)})]},o):(0,Z.jsxs)(`button`,{title:a.description,onClick:()=>t(tt({...e,[o]:{}})),children:[`Add `,a.label]},o)})})}function Ls({store:e,object:t,groundHeight:n}){let r=Mo(e,e=>e.doc),i=Ht.get(t.prefab),a=()=>e.beginDrag(),o=()=>e.endDrag(),s=n=>e.setTransformTransient(t.id,{...t.transform,...n}),c=(n,r)=>e.updateTransient(e=>{let i=e.objects.find(e=>e.id===t.id);i&&(i.props[n]=r)}),l=r.objects.filter(e=>e.id!==t.id&&!Pt(r,t.id,e.id)),[u,d]=(0,J.useState)(t.name),[f,p]=(0,J.useState)(t.components?.npc?`npc`:t.components?.poi?`poi`:t.components?.item?`item`:`decoration`),m=r.prefabs.find(e=>e.id===t.prefabInstance?.assetId);return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`ed-row sc-head`,children:[(0,Z.jsx)(`input`,{type:`checkbox`,"aria-label":`Active`,checked:t.visible,onChange:n=>e.patchObject(t.id,{visible:n.target.checked})}),(0,Z.jsx)(`input`,{className:`sc-name`,"aria-label":`Name`,value:t.name,onChange:n=>e.patchObject(t.id,{name:n.target.value})})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:`Prefab`}),(0,Z.jsx)(`span`,{children:i?.label??t.prefab}),(0,Z.jsx)(`span`,{className:`ed-hint`,children:t.id})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:`Parent`}),(0,Z.jsxs)(`select`,{"aria-label":`Parent`,value:t.parent??``,onChange:n=>e.reparent(t.id,n.target.value||null),children:[(0,Z.jsx)(`option`,{value:``,children:`(scene root)`}),l.map(e=>(0,Z.jsx)(`option`,{value:e.id,children:e.name},e.id))]})]}),(0,Z.jsxs)(Ps,{title:`Transform`,right:(0,Z.jsx)(`button`,{onClick:()=>e.patchObject(t.id,{transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}}),children:`Reset`}),children:[(0,Z.jsx)(Ns,{label:`Position`,value:t.transform.position,onBegin:a,onEnd:o,onChange:e=>s({position:e})}),(0,Z.jsx)(Ns,{label:`Rotation`,value:t.transform.rotation,step:1,onBegin:a,onEnd:o,onChange:e=>s({rotation:e})}),(0,Z.jsx)(Ns,{label:`Scale`,value:t.transform.scale,onBegin:a,onEnd:o,onChange:e=>s({scale:e})}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`button`,{onClick:()=>{let[r,,i]=t.transform.position;e.patchObject(t.id,{transform:{position:[r,Math.round(n(r,i)*1e3)/1e3,i]}})},disabled:!!t.parent,title:t.parent?`Only root objects snap to terrain`:`Set Y to the terrain height`,children:`Snap to ground`}),(0,Z.jsx)(`button`,{onClick:()=>e.duplicateSelected(),children:`Duplicate`}),(0,Z.jsx)(`button`,{onClick:()=>e.deleteSelected(),children:`Delete`})]})]}),(0,Z.jsxs)(Ps,{title:`Prefab asset`,children:[m?(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`p`,{className:`ed-hint`,children:[m.name,` · revision `,m.revision,` · `,t.prefabInstance?.overrides.length??0,` overrides`]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`button`,{onClick:()=>e.applyPrefab(t.id),children:`Apply to prefab`}),(0,Z.jsx)(`button`,{onClick:()=>e.revertPrefab(t.id),children:`Revert instance`}),(0,Z.jsx)(`button`,{onClick:()=>e.unpackPrefab(t.id),children:`Unpack`})]}),!!t.prefabInstance?.overrides.length&&(0,Z.jsx)(`p`,{className:`ed-hint`,children:t.prefabInstance.overrides.join(`, `)})]}):t.prefabInstance?(0,Z.jsx)(`p`,{role:`alert`,children:`Missing prefab asset. Save this object as a new prefab to repair its link.`}):null,(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`input`,{"aria-label":`Prefab asset name`,value:u,onChange:e=>d(e.target.value)}),(0,Z.jsx)(`select`,{"aria-label":`Prefab kind`,value:f,onChange:e=>p(e.target.value),children:[`npc`,`poi`,`item`,`decoration`].map(e=>(0,Z.jsx)(`option`,{value:e,children:e},e))})]}),(0,Z.jsx)(`button`,{onClick:()=>e.saveAsPrefab(t.id,u,f),children:`Save hierarchy as prefab`})]}),(0,Z.jsxs)(Ps,{title:`Gameplay components`,children:[(0,Z.jsx)(`p`,{className:`ed-hint`,children:`Distances use scene units (16 map pixels). Catalog IDs must match the game data.`}),(0,Z.jsx)(Is,{components:t.components,onBegin:a,onEnd:o,apply:(n,r)=>r?e.updateTransient(e=>{let r=e.objects.find(e=>e.id===t.id);r&&(r.components=n)}):e.patchObject(t.id,{components:n})})]}),i&&i.props.length>0&&(0,Z.jsx)(Ps,{title:i.label,children:i.props.map(e=>(0,Z.jsx)(Fs,{def:e,value:t.props[e.key]??e.default,onBegin:a,onEnd:o,onChange:t=>c(e.key,t)},e.key))})]})}function Rs({store:e}){let t=Mo(e,e=>e.doc.environment),n=Mo(e,e=>e.doc.objects.length),r=()=>e.beginDrag(),i=()=>e.endDrag(),a=t=>e.updateTransient(e=>Object.assign(e.environment,t));return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(`p`,{className:`ed-hint`,children:`Nothing selected. Click an object in the Scene or Hierarchy to edit it; scene-wide settings are below.`}),(0,Z.jsxs)(Ps,{title:`Environment`,children:[(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:`Sun color`}),(0,Z.jsx)(Ms,{label:`Sun color`,value:t.sunColor,onBegin:r,onEnd:i,onChange:e=>a({sunColor:e})})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:`Sun intensity`}),(0,Z.jsx)(js,{label:`Sun intensity`,value:t.sunIntensity,step:.1,min:0,max:10,onBegin:r,onEnd:i,onChange:e=>a({sunIntensity:e})})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:`Sky / fog`}),(0,Z.jsx)(Ms,{label:`Sky color`,value:t.skyColor,onBegin:r,onEnd:i,onChange:e=>a({skyColor:e})})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:`Fog near`}),(0,Z.jsx)(js,{label:`Fog near`,value:t.fogNear,step:1,min:0,onBegin:r,onEnd:i,onChange:e=>a({fogNear:e})})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:`Fog far`}),(0,Z.jsx)(js,{label:`Fog far`,value:t.fogFar,step:1,min:0,onBegin:r,onEnd:i,onChange:e=>a({fogFar:e})})]})]}),(0,Z.jsxs)(Ps,{title:`Scene`,children:[(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:`Objects`}),(0,Z.jsx)(`span`,{children:n})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:`Units`}),(0,Z.jsx)(`span`,{className:`ed-hint`,children:`1 unit = 16 map px. Y up.`})]})]})]})}function zs({store:e,groundHeight:t}){let n=Mo(e,e=>e.selection),r=Mo(e,e=>e.doc),i=n.length===1?r.objects.find(e=>e.id===n[0]):void 0;return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`ed-dock-title`,children:[`Inspector `,(0,Z.jsx)(`span`,{children:i?i.name:n.length>1?`${n.length} objects`:r.map})]}),(0,Z.jsx)(`div`,{className:`ed-panel sc-inspector`,children:i?(0,Z.jsx)(Ls,{store:e,object:i,groundHeight:t},i.id):n.length>1?(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`p`,{className:`ed-hint`,children:[n.length,` objects selected. Multi-object editing is limited to duplicate/delete.`]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`button`,{onClick:()=>e.duplicateSelected(),children:`Duplicate`}),(0,Z.jsx)(`button`,{onClick:()=>e.deleteSelected(),children:`Delete`})]})]}):(0,Z.jsx)(Rs,{store:e})})]})}var Bs={Buildings:`⌂`,Nature:`❦`,Landmarks:`✦`,Primitives:`◼`,Lights:`☼`,Utility:`◇`,Gameplay:`♟`},Vs=[...new Set(pn.map(e=>e.category))],Hs=null;function Us(e){let t=new bn,n=new Map;for(let t of e.objects){let e=wt(t.prefab,t.props),r=t.transform;e.position.set(...r.position),e.rotation.set(...r.rotation.map(I.degToRad)),e.scale.set(...r.scale),n.set(t.id,e)}for(let r of e.objects)(r.parent&&n.get(r.parent)||t).add(n.get(r.id));return t}function Ws(e){try{let t=Hs??=new eo({alpha:!0,antialias:!0,preserveDrawingBuffer:!0});t.setSize(96,72,!1),t.setPixelRatio(1);let n=new dn;n.background=new V(3882304),n.add(new pt(16777215,3159098,2.2));let r=new fe(16769456,2.4);r.position.set(3,5,4),n.add(r);let i=`objects`in e?Us(e):wt(e.id,{});n.add(i),i.updateMatrixWorld(!0);let a=new jt().setFromObject(i),o=a.getCenter(new R),s=Math.max(.5,a.getSize(new R).length()),c=new hn(30,4/3,.01,1e3);c.position.copy(o).add(new R(s*.75,s*.55,s*.9)),c.lookAt(o),t.render(n,c);let l=t.domElement.toDataURL(`image/png`);return ps(i),l}catch{return null}}function Gs({source:e,fallback:t}){let[n,r]=(0,J.useState)(null),i=(0,J.useRef)(!0);return(0,J.useEffect)(()=>{i.current=!0;let t=requestAnimationFrame(()=>{let t=Ws(e);i.current&&r(t)});return()=>{i.current=!1,cancelAnimationFrame(t)}},[e]),n?(0,Z.jsx)(`img`,{className:`sc-prefab-thumbnail`,alt:``,src:n}):(0,Z.jsx)(`span`,{className:`sc-prefab-icon`,"aria-hidden":`true`,children:t})}function Ks({onEdit:e,store:t}){let n=Mo(t,e=>e.doc.prefabs),[r,i]=(0,J.useState)(`All`),[a,o]=(0,J.useState)(``),s=a.trim().toLowerCase(),c=pn.filter(e=>(r===`All`||e.category===r)&&(!s||e.label.toLowerCase().includes(s)||e.id.includes(s)));return(0,Z.jsxs)(`div`,{className:`ed-project sc-project`,children:[(0,Z.jsxs)(`div`,{className:`ed-dock-title`,children:[`Project `,(0,Z.jsx)(`span`,{children:`Prefabs`})]}),(0,Z.jsxs)(`div`,{className:`sc-project-body`,children:[(0,Z.jsx)(`nav`,{className:`sc-project-folders`,"aria-label":`Prefab categories`,children:[`All`,...Vs].map(e=>(0,Z.jsxs)(`button`,{className:`ed-tree-item ${r===e?`selected`:``}`,onClick:()=>i(e),children:[(0,Z.jsx)(`span`,{className:`ed-asset-icon`,children:e===`All`?`▤`:Bs[e]}),e]},e))}),(0,Z.jsxs)(`div`,{className:`sc-project-main`,children:[(0,Z.jsxs)(`div`,{className:`ed-project-path`,children:[(0,Z.jsxs)(`span`,{children:[`Assets / Prefabs`,r===`All`?``:` / ${r}`]}),(0,Z.jsx)(`input`,{"aria-label":`Search prefabs`,placeholder:`Search…`,value:a,onChange:e=>o(e.target.value)})]}),(0,Z.jsxs)(`div`,{className:`sc-prefab-grid`,children:[n.filter(e=>(r===`All`||r===`Gameplay`)&&(!s||e.name.toLowerCase().includes(s)||e.kind.includes(s))).map(t=>(0,Z.jsxs)(`button`,{className:`sc-prefab-card`,draggable:!0,title:`${t.name} (${t.kind}) · revision ${t.revision} — click to edit, drag to instantiate`,onDragStart:e=>{e.dataTransfer.setData(ys,t.id),e.dataTransfer.effectAllowed=`copy`},onClick:()=>e({assetId:t.id}),children:[(0,Z.jsx)(Gs,{source:t,fallback:`◆`}),(0,Z.jsx)(`span`,{className:`sc-prefab-label`,children:t.name}),(0,Z.jsxs)(`small`,{children:[t.kind,` prefab`]})]},t.id)),c.map(t=>(0,Z.jsxs)(`button`,{className:`sc-prefab-card`,title:`${t.label} — click to edit, drag into the scene to place`,draggable:!0,onDragStart:e=>{e.dataTransfer.setData(ys,t.id),e.dataTransfer.effectAllowed=`copy`},onClick:()=>e({defId:t.id}),children:[(0,Z.jsx)(Gs,{source:t,fallback:Bs[t.category]}),(0,Z.jsx)(`span`,{className:`sc-prefab-label`,children:t.label})]},t.id)),!c.length&&(0,Z.jsx)(`p`,{className:`ed-empty`,children:`No prefabs match`})]})]})]})]})}var qs=Math.PI/180,Js=e=>e instanceof HTMLElement&&(e.tagName===`INPUT`||e.tagName===`SELECT`||e.tagName===`TEXTAREA`||e.isContentEditable),Ys=class{host;renderer=new eo({antialias:!0});scene=new dn;camera=new hn(45,1,.05,500);group=new bn;instances=new Map;box=null;selectedId=null;pivot=new R(0,.5,0);yaw=.7;pitch=.45;distance=8;framed=!1;down={x:0,y:0};orbiting=!1;raycaster=new Me;frame=0;resize;disposed=!1;onPick=()=>{};constructor(e){this.host=e;let t=this.renderer;t.setPixelRatio(Math.min(window.devicePixelRatio,1.75)),t.shadowMap.enabled=!0,t.shadowMap.type=1,t.toneMapping=4,t.domElement.tabIndex=0,e.appendChild(t.domElement);let n=new fe(16770487,2.4);n.position.set(-8,14,7),n.castShadow=!0,this.scene.add(new pt(13231342,7431750,2),n,n.target,new Lt(20,20,5921370,3947580),this.group),this.scene.background=new V(2697513),this.resize=new ResizeObserver(this.onResize),this.resize.observe(e),this.onResize();let r=t.domElement;r.addEventListener(`pointerdown`,this.onDown),r.addEventListener(`pointermove`,this.onMove),r.addEventListener(`pointerup`,this.onUp),r.addEventListener(`pointercancel`,this.onUp),r.addEventListener(`wheel`,this.onWheel,{passive:!1}),r.addEventListener(`contextmenu`,e=>e.preventDefault()),this.applyCamera(),this.frame=requestAnimationFrame(this.tick)}setNodes(e){let t=new Set;for(let n of e){t.add(n.id);let e=`${n.prefab}|${JSON.stringify(n.props)}`,r=this.instances.get(n.id);if(r&&r.signature!==e&&(this.detach(r.object),r=void 0),!r){let t=wt(n.prefab,n.props);t.userData.nodeId=n.id,t.children.length||t.add(Object.assign(new m(.6),{userData:{editorOnly:!0}})),r={object:t,signature:e},this.instances.set(n.id,r)}let{position:i,rotation:a,scale:o}=n.transform;r.object.position.set(i[0],i[1],i[2]),r.object.rotation.set(a[0]*qs,a[1]*qs,a[2]*qs),r.object.scale.set(o[0],o[1],o[2]),r.object.visible=n.visible}for(let[e,n]of this.instances)t.has(e)||(this.detach(n.object),this.instances.delete(e));for(let t of e){let e=this.instances.get(t.id),n=t.parent&&this.instances.get(t.parent)?.object||this.group;e.object.parent!==n&&n.add(e.object)}this.selectedId&&!this.instances.has(this.selectedId)?this.setSelected(null):this.setSelected(this.selectedId),this.framed||=(this.frameAll(),!0)}setSelected(e){this.selectedId=e,this.box&&=(this.scene.remove(this.box),this.box.dispose(),null);let t=e?this.instances.get(e):void 0;t&&(this.box=new Ot(t.object,16754470),this.scene.add(this.box))}detach(e){for(let t of[...e.children])t.userData.nodeId&&this.group.add(t);ps(e)}frameAll(){let e=new jt().setFromObject(this.group);e.isEmpty()||(e.getCenter(this.pivot),this.distance=I.clamp(e.getSize(new R).length()*1.5,2,60)),this.applyCamera()}applyCamera(){this.pitch=I.clamp(this.pitch,-1.4,1.4),this.distance=I.clamp(this.distance,.5,200);let e=new R(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch));this.camera.position.copy(this.pivot).addScaledVector(e,this.distance),this.camera.lookAt(this.pivot),this.camera.updateMatrixWorld()}onResize=()=>{let e=Math.max(1,this.host.clientWidth),t=Math.max(1,this.host.clientHeight);this.renderer.setSize(e,t),this.camera.aspect=e/t,this.camera.updateProjectionMatrix()};onDown=e=>{(e.button===0||e.button===2)&&(this.renderer.domElement.focus(),this.down={x:e.clientX,y:e.clientY},this.orbiting=!0,this.renderer.domElement.setPointerCapture(e.pointerId))};onMove=e=>{this.orbiting&&(this.yaw-=(e.movementX??0)*.006,this.pitch+=(e.movementY??0)*.006,this.applyCamera())};onUp=e=>{if(!this.orbiting||(this.orbiting=!1,this.renderer.domElement.hasPointerCapture(e.pointerId)&&this.renderer.domElement.releasePointerCapture(e.pointerId),e.type!==`pointerup`||Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)>=4))return;let t=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(new kt((e.clientX-t.left)/t.width*2-1,1-(e.clientY-t.top)/t.height*2),this.camera);let n=this.raycaster.intersectObjects(this.group.children,!0).find(e=>!e.object.userData.editorOnly)?.object??null;for(;n&&!n.userData.nodeId;)n=n.parent;this.onPick(n?.userData.nodeId??null)};onWheel=e=>{e.preventDefault(),this.distance*=Math.exp(e.deltaY*.0012),this.applyCamera()};tick=()=>{this.disposed||(this.box?.update(),this.renderer.render(this.scene,this.camera),this.frame=requestAnimationFrame(this.tick))};dispose(){this.disposed=!0,cancelAnimationFrame(this.frame),this.resize.disconnect();for(let e of this.instances.values())ps(e.object);this.box&&this.box.dispose(),this.renderer.dispose(),this.renderer.domElement.remove()}};function Xs(e){let t=new Map;for(let n of e){let e=n.parent??``,r=t.get(e);r?r.push(n):t.set(e,[n])}return t}function Zs(e,t){let n=Xs(e),r=new Set,i=e=>{r.add(e);for(let t of n.get(e)??[])i(t.id)};return i(t),r}function Qs(e){let t=Ht.get(e);return{id:_n(),name:t?.label??e,parent:null,prefab:e,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},visible:!0,props:t?He(t):{},components:structuredClone(t?.components??{})}}function $s({store:e,assetId:t,defId:n,onClose:r,onPlace:i,onOpenAsset:a}){let o=Mo(e,e=>t?e.doc.prefabs.find(e=>e.id===t):void 0),s=n?Ht.get(n):void 0,[c,l]=(0,J.useState)(()=>t?structuredClone(e.getState().doc.prefabs.find(e=>e.id===t)?.objects??[]):[Qs(n)]),[u,d]=(0,J.useState)(c[0]?.id??null),[f,p]=(0,J.useState)(()=>(t?e.getState().doc.prefabs.find(e=>e.id===t)?.name:s?.label)??``),[m,h]=(0,J.useState)(()=>(t?e.getState().doc.prefabs.find(e=>e.id===t)?.kind:void 0)??`decoration`),[g,_]=(0,J.useState)(!1),[v,y]=(0,J.useState)(pn[0]?.id??``),b=(0,J.useRef)(null),x=(0,J.useRef)(null),S=(0,J.useMemo)(()=>Xs(c),[c]);(0,J.useEffect)(()=>{if(!b.current)return;let e=new Ys(b.current);return e.onPick=e=>d(e),x.current=e,()=>{e.dispose(),x.current=null}},[]),(0,J.useEffect)(()=>{x.current?.setNodes(c)},[c]),(0,J.useEffect)(()=>{x.current?.setSelected(u)},[u]),(0,J.useEffect)(()=>{t&&!o&&r()},[t,o,r]);let C=(e,t)=>{l(n=>n.map(n=>{if(n.id!==e)return n;let{transform:r,props:i,...a}=t;return{...n,...a,transform:{...n.transform,...r},props:i?{...n.props,...i}:n.props}})),_(!0)},w=()=>{let e=Ht.get(v),t={id:_n(),name:e?.label??v,parent:u??c[0]?.id??null,prefab:v,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},visible:!0,props:e?He(e):{},components:structuredClone(e?.components??{})};l(e=>[...e,t]),d(t.id),_(!0)},T=e=>{if(e===c[0]?.id)return;let t=Zs(c,e);l(e=>e.filter(e=>!t.has(e.id))),u&&t.has(u)&&d(c[0]?.id??null),_(!0)},E=()=>{(!g||confirm(`Discard unsaved prefab changes?`))&&r()},D=()=>{o&&c.length&&(e.updatePrefabAsset(o.id,{name:f,kind:m,objects:c}),_(!1))},O=()=>{c.length&&a(e.createPrefabAsset(f,c))},ee=()=>{o?i(o.id):s&&c[0]&&i(s.id,{name:c[0].name,props:c[0].props,components:c[0].components})},k=[],A=(e,t)=>{for(let n of S.get(e)??[])k.push({o:n,depth:t}),A(n.id,t+1)};A(``,0);let j=u?c.find(e=>e.id===u):void 0,M=j?Ht.get(j.prefab):void 0,N=()=>{},P=o?`Prefab — ${o.name}`:`Prefab — ${s?.label??n} (built-in)`;return(0,Z.jsx)(`div`,{className:`sc-prefab-backdrop`,onKeyDown:e=>{e.stopPropagation(),e.key===`Escape`&&!Js(e.target)&&E()},children:(0,Z.jsxs)(`div`,{className:`sc-prefab-editor`,role:`dialog`,"aria-label":P,children:[(0,Z.jsxs)(`div`,{className:`ed-dock-title sc-prefab-head`,children:[(0,Z.jsx)(`span`,{className:`sc-prefab-icon`,"aria-hidden":`true`,children:`◆`}),(0,Z.jsx)(`input`,{className:`sc-prefab-name`,"aria-label":`Prefab name`,value:f,onChange:e=>{p(e.target.value),_(!0)}}),o&&(0,Z.jsx)(`select`,{"aria-label":`Prefab kind`,value:m,onChange:e=>{h(e.target.value),_(!0)},children:[`npc`,`poi`,`item`,`decoration`].map(e=>(0,Z.jsx)(`option`,{value:e,children:e},e))}),(0,Z.jsx)(`span`,{className:`ed-hint`,children:o?`revision ${o.revision}${g?` — unsaved changes`:``}`:`built-in prefab`}),(0,Z.jsx)(`span`,{className:`spacer`}),(0,Z.jsx)(`button`,{onClick:ee,title:o&&g?`Places the last saved revision`:void 0,children:`Place in scene`}),o?(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(`button`,{className:`primary`,disabled:!g,onClick:D,children:`Save`}),(0,Z.jsx)(`button`,{disabled:!g,onClick:()=>{l(structuredClone(o.objects)),p(o.name),h(o.kind),d(o.objects[0]?.id??null),_(!1)},children:`Revert`}),(0,Z.jsx)(`button`,{onClick:()=>{confirm(`Delete prefab '${o.name}'? Placed instances become missing-prefab objects.`)&&(e.deletePrefabAsset(o.id),r())},children:`Delete`})]}):(0,Z.jsx)(`button`,{className:`primary`,onClick:O,children:`Save as prefab asset`}),(0,Z.jsx)(`button`,{"aria-label":`Close prefab editor`,onClick:E,children:`✕`})]}),(0,Z.jsxs)(`div`,{className:`sc-prefab-body`,children:[(0,Z.jsxs)(`aside`,{className:`sc-prefab-nodes`,children:[(0,Z.jsxs)(`div`,{className:`ed-dock-title`,children:[`Nodes `,(0,Z.jsx)(`span`,{children:c.length})]}),o&&(0,Z.jsxs)(`div`,{className:`sc-prefab-addrow`,children:[(0,Z.jsx)(`select`,{"aria-label":`Node prefab`,value:v,onChange:e=>y(e.target.value),children:pn.map(e=>(0,Z.jsx)(`option`,{value:e.id,children:e.label},e.id))}),(0,Z.jsx)(`button`,{onClick:w,title:`Add as a child of the selected node`,children:`＋`})]}),(0,Z.jsxs)(`div`,{className:`ed-tree sc-tree`,onClick:e=>{e.target===e.currentTarget&&d(null)},children:[k.map(({o:e,depth:t})=>(0,Z.jsxs)(`div`,{className:`ed-tree-item sc-tree-item ${u===e.id?`selected`:``} ${e.visible?``:`hidden`}`,style:{paddingLeft:8+Math.min(t,8)*14},role:`treeitem`,"aria-selected":u===e.id,onClick:()=>d(e.id),children:[(0,Z.jsx)(`span`,{className:`sc-tree-caret`,style:{visibility:`hidden`}}),(0,Z.jsxs)(`span`,{className:`sc-tree-name`,title:M?.label??e.prefab,children:[e.id===c[0]?.id?`◆ `:``,e.name]})]},e.id)),!k.length&&(0,Z.jsx)(`p`,{className:`ed-empty`,children:`No nodes`})]})]}),(0,Z.jsx)(`div`,{className:`sc-prefab-viewport`,ref:b}),(0,Z.jsx)(`aside`,{className:`sc-prefab-inspector ed-panel sc-inspector`,children:j?(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`ed-row sc-head`,children:[(0,Z.jsx)(`input`,{type:`checkbox`,"aria-label":`Active`,checked:j.visible,onChange:e=>C(j.id,{visible:e.target.checked})}),(0,Z.jsx)(`input`,{className:`sc-name`,"aria-label":`Node name`,value:j.name,onChange:e=>C(j.id,{name:e.target.value})})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`label`,{children:`Prefab`}),(0,Z.jsx)(`span`,{children:M?.label??j.prefab}),j.id===c[0]?.id&&(0,Z.jsx)(`span`,{className:`ed-hint`,children:`root`})]}),(0,Z.jsxs)(Ps,{title:`Transform`,children:[(0,Z.jsx)(Ns,{label:`Position`,value:j.transform.position,onBegin:N,onEnd:N,onChange:e=>C(j.id,{transform:{position:e}})}),(0,Z.jsx)(Ns,{label:`Rotation`,value:j.transform.rotation,step:1,onBegin:N,onEnd:N,onChange:e=>C(j.id,{transform:{rotation:e}})}),(0,Z.jsx)(Ns,{label:`Scale`,value:j.transform.scale,onBegin:N,onEnd:N,onChange:e=>C(j.id,{transform:{scale:e}})}),j.id===c[0]?.id&&(0,Z.jsx)(`p`,{className:`ed-hint`,children:`Root position is ignored — instances are placed at the drop point.`}),(0,Z.jsx)(`div`,{className:`ed-row`,children:(0,Z.jsx)(`button`,{onClick:()=>T(j.id),disabled:j.id===c[0]?.id,title:j.id===c[0]?.id?`The prefab root cannot be deleted`:`Delete this node and its children`,children:`Delete node`})})]}),(0,Z.jsx)(Ps,{title:`Gameplay components`,children:(0,Z.jsx)(Is,{components:j.components,onBegin:N,onEnd:N,apply:e=>C(j.id,{components:e})})}),M&&M.props.length>0&&(0,Z.jsx)(Ps,{title:M.label,children:M.props.map(e=>(0,Z.jsx)(Fs,{def:e,value:j.props[e.key]??e.default,onBegin:N,onEnd:N,onChange:t=>C(j.id,{props:{[e.key]:t}})},e.key))})]}):(0,Z.jsx)(`p`,{className:`ed-hint`,children:`Select a node to edit it, or click a node in the preview.`})})]}),(0,Z.jsxs)(`div`,{className:`ed-scene-footer`,children:[(0,Z.jsxs)(`span`,{children:[(0,Z.jsx)(`b`,{children:`Drag`}),` orbit · `,(0,Z.jsx)(`b`,{children:`Wheel`}),` zoom · `,(0,Z.jsx)(`b`,{children:`Click`}),` select node`]}),(0,Z.jsx)(`span`,{children:o?`Save pushes changes to every placed instance`:`Tweak props, then place it or save it as a new prefab asset`})]})]})})}function ec(e,t){if(t===0)return console.warn(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.`),e;if(t===2||t===1){let n=e.getIndex();if(n===null){let t=[],r=e.getAttribute(`position`);if(r!==void 0){for(let e=0;e<r.count;e++)t.push(e);e.setIndex(t),n=e.getIndex()}else return console.error(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.`),e}let r=n.count-2,i=[];if(t===2)for(let e=1;e<=r;e++)i.push(n.getX(0)),i.push(n.getX(e)),i.push(n.getX(e+1));else for(let e=0;e<r;e++)e%2==0?(i.push(n.getX(e)),i.push(n.getX(e+1)),i.push(n.getX(e+2))):(i.push(n.getX(e+2)),i.push(n.getX(e+1)),i.push(n.getX(e)));return i.length/3!==r&&console.error(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.`),e.setIndex(i),e.clearGroups(),e}return console.error(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:`,t),e}function tc(e){let t=new Map,n=new Map,r=e.clone();return nc(e,r,function(e,r){t.set(r,e),n.set(e,r)}),r.traverse(function(e){if(!e.isSkinnedMesh)return;let r=e,i=t.get(e),a=i.skeleton.bones;r.skeleton=i.skeleton.clone(),r.bindMatrix.copy(i.bindMatrix),r.skeleton.bones=a.map(function(e){return n.get(e)}),r.bind(r.skeleton,r.bindMatrix)}),r}function nc(e,t,n){n(e,t);for(let r=0;r<e.children.length;r++)nc(e.children[r],t.children[r],n)}var rc=class extends se{constructor(e){super(e),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(e){return new lc(e)}),this.register(function(e){return new uc(e)}),this.register(function(e){return new yc(e)}),this.register(function(e){return new bc(e)}),this.register(function(e){return new xc(e)}),this.register(function(e){return new fc(e)}),this.register(function(e){return new pc(e)}),this.register(function(e){return new mc(e)}),this.register(function(e){return new hc(e)}),this.register(function(e){return new cc(e)}),this.register(function(e){return new gc(e)}),this.register(function(e){return new dc(e)}),this.register(function(e){return new vc(e)}),this.register(function(e){return new _c(e)}),this.register(function(e){return new oc(e)}),this.register(function(e){return new Sc(e,Q.EXT_MESHOPT_COMPRESSION)}),this.register(function(e){return new Sc(e,Q.KHR_MESHOPT_COMPRESSION)}),this.register(function(e){return new Cc(e)})}load(e,t,n,r){let i=this,a;if(this.resourcePath!==``)a=this.resourcePath;else if(this.path!==``){let t=B.extractUrlBase(e);a=B.resolveURL(t,this.path)}else a=B.extractUrlBase(e);this.manager.itemStart(e);let o=function(t){r?r(t):console.error(t),i.manager.itemError(e),i.manager.itemEnd(e)},s=new sn(this.manager);s.setPath(this.path),s.setResponseType(`arraybuffer`),s.setRequestHeader(this.requestHeader),s.setWithCredentials(this.withCredentials),s.load(e,function(n){try{i.parse(n,a,function(n){t(n),i.manager.itemEnd(e)},o)}catch(e){o(e)}},n,o)}setDRACOLoader(e){return this.dracoLoader=e,this}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){return this.pluginCallbacks.indexOf(e)===-1&&this.pluginCallbacks.push(e),this}unregister(e){return this.pluginCallbacks.indexOf(e)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1),this}parse(e,t,n,r){let i,a={},o={},s=new TextDecoder;if(typeof e==`string`)i=JSON.parse(e);else if(e instanceof ArrayBuffer){if(s.decode(new Uint8Array(e,0,4))===wc){try{a[Q.KHR_BINARY_GLTF]=new Dc(e)}catch(e){r&&r(e);return}i=JSON.parse(a[Q.KHR_BINARY_GLTF].content)}else i=JSON.parse(s.decode(e))}else i=e;if(i.asset===void 0||i.asset.version[0]<2){r&&r(Error(`THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported.`));return}let c=new $c(i,{path:t||this.resourcePath||``,crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});c.fileLoader.setRequestHeader(this.requestHeader);for(let e=0;e<this.pluginCallbacks.length;e++){let t=this.pluginCallbacks[e](c);t.name||console.error(`THREE.GLTFLoader: Invalid plugin found: missing name`),o[t.name]=t,a[t.name]=!0}if(i.extensionsUsed)for(let e=0;e<i.extensionsUsed.length;++e){let t=i.extensionsUsed[e],n=i.extensionsRequired||[];switch(t){case Q.KHR_MATERIALS_UNLIT:a[t]=new sc;break;case Q.KHR_DRACO_MESH_COMPRESSION:a[t]=new Oc(i,this.dracoLoader);break;case Q.KHR_TEXTURE_TRANSFORM:a[t]=new kc;break;case Q.KHR_MESH_QUANTIZATION:a[t]=new Ac;break;default:n.indexOf(t)>=0&&o[t]===void 0&&console.warn(`THREE.GLTFLoader: Unknown extension "`+t+`".`)}}c.setExtensions(a),c.setPlugins(o),c.parse(n,r)}parseAsync(e,t){let n=this;return new Promise(function(r,i){n.parse(e,t,r,i)})}};function ic(){let e={};return{get:function(t){return e[t]},add:function(t,n){e[t]=n},remove:function(t){delete e[t]},removeAll:function(){e={}}}}function ac(e,t,n){let r=e.json.materials[t];return r.extensions&&r.extensions[n]?r.extensions[n]:null}var Q={KHR_BINARY_GLTF:`KHR_binary_glTF`,KHR_DRACO_MESH_COMPRESSION:`KHR_draco_mesh_compression`,KHR_LIGHTS_PUNCTUAL:`KHR_lights_punctual`,KHR_MATERIALS_CLEARCOAT:`KHR_materials_clearcoat`,KHR_MATERIALS_DISPERSION:`KHR_materials_dispersion`,KHR_MATERIALS_IOR:`KHR_materials_ior`,KHR_MATERIALS_SHEEN:`KHR_materials_sheen`,KHR_MATERIALS_SPECULAR:`KHR_materials_specular`,KHR_MATERIALS_TRANSMISSION:`KHR_materials_transmission`,KHR_MATERIALS_IRIDESCENCE:`KHR_materials_iridescence`,KHR_MATERIALS_ANISOTROPY:`KHR_materials_anisotropy`,KHR_MATERIALS_UNLIT:`KHR_materials_unlit`,KHR_MATERIALS_VOLUME:`KHR_materials_volume`,KHR_TEXTURE_BASISU:`KHR_texture_basisu`,KHR_TEXTURE_TRANSFORM:`KHR_texture_transform`,KHR_MESH_QUANTIZATION:`KHR_mesh_quantization`,KHR_MATERIALS_EMISSIVE_STRENGTH:`KHR_materials_emissive_strength`,EXT_MATERIALS_BUMP:`EXT_materials_bump`,EXT_TEXTURE_WEBP:`EXT_texture_webp`,EXT_TEXTURE_AVIF:`EXT_texture_avif`,EXT_MESHOPT_COMPRESSION:`EXT_meshopt_compression`,KHR_MESHOPT_COMPRESSION:`KHR_meshopt_compression`,EXT_MESH_GPU_INSTANCING:`EXT_mesh_gpu_instancing`},oc=class{constructor(e){this.parser=e,this.name=Q.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){let e=this.parser,t=this.parser.json.nodes||[];for(let n=0,r=t.length;n<r;n++){let r=t[n];r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0&&e._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(e){let t=this.parser,n=`light:`+e,r=t.cache.get(n);if(r)return r;let i=t.json,a=((i.extensions&&i.extensions[this.name]||{}).lights||[])[e],o,s=new V(16777215);a.color!==void 0&&s.setRGB(a.color[0],a.color[1],a.color[2],At);let c=a.range===void 0?0:a.range;switch(a.type){case`directional`:o=new fe(s),o.target.position.set(0,0,-1),o.add(o.target);break;case`point`:o=new Et(s),o.distance=c;break;case`spot`:o=new Bt(s),o.distance=c,a.spot=a.spot||{},a.spot.innerConeAngle=a.spot.innerConeAngle===void 0?0:a.spot.innerConeAngle,a.spot.outerConeAngle=a.spot.outerConeAngle===void 0?Math.PI/4:a.spot.outerConeAngle,o.angle=a.spot.outerConeAngle,o.penumbra=1-a.spot.innerConeAngle/a.spot.outerConeAngle,o.target.position.set(0,0,-1),o.add(o.target);break;default:throw Error(`THREE.GLTFLoader: Unexpected light type: `+a.type)}return o.position.set(0,0,0),Gc(o,a),a.intensity!==void 0&&(o.intensity=a.intensity),o.name=t.createUniqueName(a.name||`light_`+e),r=Promise.resolve(o),t.cache.add(n,r),r}getDependency(e,t){if(e===`light`)return this._loadLight(t)}createNodeAttachment(e){let t=this,n=this.parser,r=n.json.nodes[e],i=(r.extensions&&r.extensions[this.name]||{}).light;return i===void 0?null:this._loadLight(i).then(function(e){return n._getNodeRef(t.cache,i,e)})}},sc=class{constructor(){this.name=Q.KHR_MATERIALS_UNLIT}getMaterialType(){return De}extendParams(e,t,n){let r=[];e.color=new V(1,1,1),e.opacity=1;let i=t.pbrMetallicRoughness;if(i){if(Array.isArray(i.baseColorFactor)){let t=i.baseColorFactor;e.color.setRGB(t[0],t[1],t[2],At),e.opacity=t[3]}i.baseColorTexture!==void 0&&r.push(n.assignTexture(e,`map`,i.baseColorTexture,Ge))}return Promise.all(r)}},cc=class{constructor(e){this.parser=e,this.name=Q.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){let n=ac(this.parser,e,this.name);return n===null||n.emissiveStrength!==void 0&&(t.emissiveIntensity=n.emissiveStrength),Promise.resolve()}},lc=class{constructor(e){this.parser=e,this.name=Q.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){return ac(this.parser,e,this.name)===null?null:w}extendMaterialParams(e,t){let n=ac(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];if(n.clearcoatFactor!==void 0&&(t.clearcoat=n.clearcoatFactor),n.clearcoatTexture!==void 0&&r.push(this.parser.assignTexture(t,`clearcoatMap`,n.clearcoatTexture)),n.clearcoatRoughnessFactor!==void 0&&(t.clearcoatRoughness=n.clearcoatRoughnessFactor),n.clearcoatRoughnessTexture!==void 0&&r.push(this.parser.assignTexture(t,`clearcoatRoughnessMap`,n.clearcoatRoughnessTexture)),n.clearcoatNormalTexture!==void 0&&(r.push(this.parser.assignTexture(t,`clearcoatNormalMap`,n.clearcoatNormalTexture)),n.clearcoatNormalTexture.scale!==void 0)){let e=n.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new kt(e,e)}return Promise.all(r)}},uc=class{constructor(e){this.parser=e,this.name=Q.KHR_MATERIALS_DISPERSION}getMaterialType(e){return ac(this.parser,e,this.name)===null?null:w}extendMaterialParams(e,t){let n=ac(this.parser,e,this.name);return n===null||(t.dispersion=n.dispersion===void 0?0:n.dispersion),Promise.resolve()}},dc=class{constructor(e){this.parser=e,this.name=Q.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){return ac(this.parser,e,this.name)===null?null:w}extendMaterialParams(e,t){let n=ac(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];return n.iridescenceFactor!==void 0&&(t.iridescence=n.iridescenceFactor),n.iridescenceTexture!==void 0&&r.push(this.parser.assignTexture(t,`iridescenceMap`,n.iridescenceTexture)),n.iridescenceIor!==void 0&&(t.iridescenceIOR=n.iridescenceIor),t.iridescenceThicknessRange===void 0&&(t.iridescenceThicknessRange=[100,400]),n.iridescenceThicknessMinimum!==void 0&&(t.iridescenceThicknessRange[0]=n.iridescenceThicknessMinimum),n.iridescenceThicknessMaximum!==void 0&&(t.iridescenceThicknessRange[1]=n.iridescenceThicknessMaximum),n.iridescenceThicknessTexture!==void 0&&r.push(this.parser.assignTexture(t,`iridescenceThicknessMap`,n.iridescenceThicknessTexture)),Promise.all(r)}},fc=class{constructor(e){this.parser=e,this.name=Q.KHR_MATERIALS_SHEEN}getMaterialType(e){return ac(this.parser,e,this.name)===null?null:w}extendMaterialParams(e,t){let n=ac(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];if(t.sheenColor=new V(0,0,0),t.sheenRoughness=0,t.sheen=1,n.sheenColorFactor!==void 0){let e=n.sheenColorFactor;t.sheenColor.setRGB(e[0],e[1],e[2],At)}return n.sheenRoughnessFactor!==void 0&&(t.sheenRoughness=n.sheenRoughnessFactor),n.sheenColorTexture!==void 0&&r.push(this.parser.assignTexture(t,`sheenColorMap`,n.sheenColorTexture,Ge)),n.sheenRoughnessTexture!==void 0&&r.push(this.parser.assignTexture(t,`sheenRoughnessMap`,n.sheenRoughnessTexture)),Promise.all(r)}},pc=class{constructor(e){this.parser=e,this.name=Q.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){return ac(this.parser,e,this.name)===null?null:w}extendMaterialParams(e,t){let n=ac(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];return n.transmissionFactor!==void 0&&(t.transmission=n.transmissionFactor),n.transmissionTexture!==void 0&&r.push(this.parser.assignTexture(t,`transmissionMap`,n.transmissionTexture)),Promise.all(r)}},mc=class{constructor(e){this.parser=e,this.name=Q.KHR_MATERIALS_VOLUME}getMaterialType(e){return ac(this.parser,e,this.name)===null?null:w}extendMaterialParams(e,t){let n=ac(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];t.thickness=n.thicknessFactor===void 0?0:n.thicknessFactor,n.thicknessTexture!==void 0&&r.push(this.parser.assignTexture(t,`thicknessMap`,n.thicknessTexture)),t.attenuationDistance=n.attenuationDistance||1/0;let i=n.attenuationColor||[1,1,1];return t.attenuationColor=new V().setRGB(i[0],i[1],i[2],At),Promise.all(r)}},hc=class{constructor(e){this.parser=e,this.name=Q.KHR_MATERIALS_IOR}getMaterialType(e){return ac(this.parser,e,this.name)===null?null:w}extendMaterialParams(e,t){let n=ac(this.parser,e,this.name);return n===null?Promise.resolve():(t.ior=n.ior===void 0?1.5:n.ior,t.ior===0&&(t.ior=1e3),Promise.resolve())}},gc=class{constructor(e){this.parser=e,this.name=Q.KHR_MATERIALS_SPECULAR}getMaterialType(e){return ac(this.parser,e,this.name)===null?null:w}extendMaterialParams(e,t){let n=ac(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];t.specularIntensity=n.specularFactor===void 0?1:n.specularFactor,n.specularTexture!==void 0&&r.push(this.parser.assignTexture(t,`specularIntensityMap`,n.specularTexture));let i=n.specularColorFactor||[1,1,1];return t.specularColor=new V().setRGB(i[0],i[1],i[2],At),n.specularColorTexture!==void 0&&r.push(this.parser.assignTexture(t,`specularColorMap`,n.specularColorTexture,Ge)),Promise.all(r)}},_c=class{constructor(e){this.parser=e,this.name=Q.EXT_MATERIALS_BUMP}getMaterialType(e){return ac(this.parser,e,this.name)===null?null:w}extendMaterialParams(e,t){let n=ac(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];return t.bumpScale=n.bumpFactor===void 0?1:n.bumpFactor,n.bumpTexture!==void 0&&r.push(this.parser.assignTexture(t,`bumpMap`,n.bumpTexture)),Promise.all(r)}},vc=class{constructor(e){this.parser=e,this.name=Q.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){return ac(this.parser,e,this.name)===null?null:w}extendMaterialParams(e,t){let n=ac(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];return n.anisotropyStrength!==void 0&&(t.anisotropy=n.anisotropyStrength),n.anisotropyRotation!==void 0&&(t.anisotropyRotation=n.anisotropyRotation),n.anisotropyTexture!==void 0&&r.push(this.parser.assignTexture(t,`anisotropyMap`,n.anisotropyTexture)),Promise.all(r)}},yc=class{constructor(e){this.parser=e,this.name=Q.KHR_TEXTURE_BASISU}loadTexture(e){let t=this.parser,n=t.json,r=n.textures[e];if(!r.extensions||!r.extensions[this.name])return null;let i=r.extensions[this.name],a=t.options.ktx2Loader;if(!a){if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw Error(`THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures`);return null}return t.loadTextureImage(e,i.source,a)}},bc=class{constructor(e){this.parser=e,this.name=Q.EXT_TEXTURE_WEBP}loadTexture(e){let t=this.name,n=this.parser,r=n.json,i=r.textures[e];if(!i.extensions||!i.extensions[t])return null;let a=i.extensions[t],o=r.images[a.source],s=n.textureLoader;if(o.uri){let e=n.options.manager.getHandler(o.uri);e!==null&&(s=e)}return n.loadTextureImage(e,a.source,s)}},xc=class{constructor(e){this.parser=e,this.name=Q.EXT_TEXTURE_AVIF}loadTexture(e){let t=this.name,n=this.parser,r=n.json,i=r.textures[e];if(!i.extensions||!i.extensions[t])return null;let a=i.extensions[t],o=r.images[a.source],s=n.textureLoader;if(o.uri){let e=n.options.manager.getHandler(o.uri);e!==null&&(s=e)}return n.loadTextureImage(e,a.source,s)}},Sc=class{constructor(e,t){this.name=t,this.parser=e}loadBufferView(e){let t=this.parser.json,n=t.bufferViews[e];if(n.extensions&&n.extensions[this.name]){let e=n.extensions[this.name],r=this.parser.getDependency(`buffer`,e.buffer),i=this.parser.options.meshoptDecoder;if(!i||!i.supported){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw Error(`THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files`);return null}return r.then(function(t){let n=e.byteOffset||0,r=e.byteLength||0,a=e.count,o=e.byteStride,s=new Uint8Array(t,n,r);return i.decodeGltfBufferAsync?i.decodeGltfBufferAsync(a,o,s,e.mode,e.filter).then(function(e){return e.buffer}):i.ready.then(function(){let t=new ArrayBuffer(a*o);return i.decodeGltfBuffer(new Uint8Array(t),a,o,s,e.mode,e.filter),t})})}return null}},Cc=class{constructor(e){this.name=Q.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){let t=this.parser.json,n=t.nodes[e];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;let r=t.meshes[n.mesh];for(let e of r.primitives)if(e.mode!==Pc.TRIANGLES&&e.mode!==Pc.TRIANGLE_STRIP&&e.mode!==Pc.TRIANGLE_FAN&&e.mode!==void 0)return null;let i=n.extensions[this.name].attributes,a=[],o={};for(let e in i)a.push(this.parser.getDependency(`accessor`,i[e]).then(t=>(o[e]=t,o[e])));return a.length<1?null:(a.push(this.parser.createNodeMesh(e)),Promise.all(a).then(e=>{let t=e.pop(),n=t.isGroup?t.children:[t],r=e[0].count,i=[];for(let e of n){let t=new Ln,n=new R,a=new $e,s=new R(1,1,1),c=new vt(e.geometry,e.material,r);for(let e=0;e<r;e++)o.TRANSLATION&&n.fromBufferAttribute(o.TRANSLATION,e),o.ROTATION&&a.fromBufferAttribute(o.ROTATION,e),o.SCALE&&s.fromBufferAttribute(o.SCALE,e),c.setMatrixAt(e,t.compose(n,a,s));let l=null;for(let e in o)if(e===`_COLOR_0`){let t=o[e];c.instanceColor=new Ct(t.array,t.itemSize,t.normalized)}else if(e!==`TRANSLATION`&&e!==`ROTATION`&&e!==`SCALE`){if(l===null){let e=c.geometry;l=new z,l.name=e.name;for(let t in e.attributes)l.setAttribute(t,e.attributes[t]);for(let t in e.morphAttributes)l.morphAttributes[t]=e.morphAttributes[t];e.index!==null&&l.setIndex(e.index),l.morphTargetsRelative=e.morphTargetsRelative;for(let t of e.groups)l.addGroup(t.start,t.count,t.materialIndex);e.boundingBox!==null&&(l.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(l.boundingSphere=e.boundingSphere.clone()),l.drawRange.start=e.drawRange.start,l.drawRange.count=e.drawRange.count,l.userData=Object.assign({},e.userData),c.geometry=l}let t=o[e];l.setAttribute(e,new Ct(t.array,t.itemSize,t.normalized))}he.prototype.copy.call(c,e),this.parser.assignFinalMaterial(c),i.push(c)}return t.isGroup?(t.clear(),t.add(...i),t):i[0]}))}},wc=`glTF`,Tc=12,Ec={JSON:1313821514,BIN:5130562},Dc=class{constructor(e){this.name=Q.KHR_BINARY_GLTF,this.content=null,this.body=null;let t=new DataView(e,0,Tc),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==wc)throw Error(`THREE.GLTFLoader: Unsupported glTF-Binary header.`);if(this.header.version<2)throw Error(`THREE.GLTFLoader: Legacy binary file detected.`);let r=this.header.length-Tc,i=new DataView(e,Tc),a=0;for(;a<r;){let t=i.getUint32(a,!0);a+=4;let r=i.getUint32(a,!0);if(a+=4,r===Ec.JSON){let r=new Uint8Array(e,Tc+a,t);this.content=n.decode(r)}else if(r===Ec.BIN){let n=Tc+a;this.body=e.slice(n,n+t)}a+=t}if(this.content===null)throw Error(`THREE.GLTFLoader: JSON content not found.`)}},Oc=class{constructor(e,t){if(!t)throw Error(`THREE.GLTFLoader: No DRACOLoader instance provided.`);this.name=Q.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){let n=this.json,r=this.dracoLoader,i=e.extensions[this.name].bufferView,a=e.extensions[this.name].attributes,o={},s={},c={};for(let e in a){let t=zc[e]||e.toLowerCase();o[t]=a[e]}for(let t in e.attributes){let r=zc[t]||t.toLowerCase();if(a[t]!==void 0){let i=n.accessors[e.attributes[t]];c[r]=Fc[i.componentType].name,s[r]=i.normalized===!0}}return t.getDependency(`bufferView`,i).then(function(e){return new Promise(function(t,n){r.decodeDracoFile(e,function(e){for(let t in e.attributes){let n=e.attributes[t],r=s[t];r!==void 0&&(n.normalized=r)}t(e)},o,c,At,n)})})}},kc=class{constructor(){this.name=Q.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){if((t.texCoord===void 0||t.texCoord===e.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0)return e;if(e=e.clone(),t.texCoord!==void 0&&(e.channel=t.texCoord),t.offset!==void 0&&e.offset.fromArray(t.offset),t.rotation!==void 0&&(e.rotation=t.rotation),t.scale!==void 0&&e.repeat.fromArray(t.scale),t.rotation!==void 0){let t=Math.cos(e.rotation),n=Math.sin(e.rotation);e.matrix.set(e.repeat.x*t,e.repeat.y*n,e.offset.x,-e.repeat.x*n,e.repeat.y*t,e.offset.y,0,0,1),e.matrixAutoUpdate=!1}return e.needsUpdate=!0,e}},Ac=class{constructor(){this.name=Q.KHR_MESH_QUANTIZATION}},jc=class extends Xe{constructor(e,t,n,r){super(e,t,n,r)}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,r=this.valueSize,i=e*r*3+r;for(let e=0;e!==r;e++)t[e]=n[i+e];return t}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=o*2,c=o*3,l=r-t,u=(n-t)/l,d=u*u,f=d*u,p=e*c,m=p-c,h=-2*f+3*d,g=f-d,_=1-h,v=g-d+u;for(let e=0;e!==o;e++){let t=a[m+e+o],n=a[m+e+s]*l,r=a[p+e+o],c=a[p+e]*l;i[e]=_*t+v*n+h*r+g*c}return i}},Mc=new $e,Nc=class extends jc{interpolate_(e,t,n,r){let i=super.interpolate_(e,t,n,r);return Mc.fromArray(i).normalize().toArray(i),i}},Pc={FLOAT:5126,FLOAT_MAT3:35675,FLOAT_MAT4:35676,FLOAT_VEC2:35664,FLOAT_VEC3:35665,FLOAT_VEC4:35666,LINEAR:9729,REPEAT:10497,SAMPLER_2D:35678,POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6,UNSIGNED_BYTE:5121,UNSIGNED_SHORT:5123},Fc={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},Ic={9728:N,9729:ue,9984:G,9985:c,9986:Pe,9987:Nt},Lc={33071:F,33648:nn,10497:pe},Rc={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},zc={POSITION:`position`,NORMAL:`normal`,TANGENT:`tangent`,TEXCOORD_0:`uv`,TEXCOORD_1:`uv1`,TEXCOORD_2:`uv2`,TEXCOORD_3:`uv3`,COLOR_0:`color`,WEIGHTS_0:`skinWeight`,JOINTS_0:`skinIndex`},Bc={scale:`scale`,translation:`position`,rotation:`quaternion`,weights:`morphTargetInfluences`},Vc={CUBICSPLINE:void 0,LINEAR:ye,STEP:An},Hc={OPAQUE:`OPAQUE`,MASK:`MASK`,BLEND:`BLEND`};function Uc(e){return e.DefaultMaterial===void 0&&(e.DefaultMaterial=new re({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:0})),e.DefaultMaterial}function Wc(e,t,n){for(let r in n.extensions)e[r]===void 0&&(t.userData.gltfExtensions=t.userData.gltfExtensions||{},t.userData.gltfExtensions[r]=n.extensions[r])}function Gc(e,t){t.extras!==void 0&&(typeof t.extras==`object`?Object.assign(e.userData,t.extras):console.warn(`THREE.GLTFLoader: Ignoring primitive type .extras, `+t.extras))}function Kc(e,t,n){let r=!1,i=!1,a=!1;for(let e=0,n=t.length;e<n;e++){let n=t[e];if(n.POSITION!==void 0&&(r=!0),n.NORMAL!==void 0&&(i=!0),n.COLOR_0!==void 0&&(a=!0),r&&i&&a)break}if(!r&&!i&&!a)return Promise.resolve(e);let o=[],s=[],c=[];for(let l=0,u=t.length;l<u;l++){let u=t[l];if(r){let t=u.POSITION===void 0?e.attributes.position:n.getDependency(`accessor`,u.POSITION);o.push(t)}if(i){let t=u.NORMAL===void 0?e.attributes.normal:n.getDependency(`accessor`,u.NORMAL);s.push(t)}if(a){let t=u.COLOR_0===void 0?e.attributes.color:n.getDependency(`accessor`,u.COLOR_0);c.push(t)}}return Promise.all([Promise.all(o),Promise.all(s),Promise.all(c)]).then(function(t){let n=t[0],o=t[1],s=t[2];return r&&(e.morphAttributes.position=n),i&&(e.morphAttributes.normal=o),a&&(e.morphAttributes.color=s),e.morphTargetsRelative=!0,e})}function qc(e,t){if(e.updateMorphTargets(),t.weights!==void 0)for(let n=0,r=t.weights.length;n<r;n++)e.morphTargetInfluences[n]=t.weights[n];if(t.extras&&Array.isArray(t.extras.targetNames)){let n=t.extras.targetNames;if(e.morphTargetInfluences.length===n.length){e.morphTargetDictionary={};for(let t=0,r=n.length;t<r;t++)e.morphTargetDictionary[n[t]]=t}else console.warn(`THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.`)}}function Jc(e){let t,n=e.extensions&&e.extensions[Q.KHR_DRACO_MESH_COMPRESSION];if(t=n?`draco:`+n.bufferView+`:`+n.indices+`:`+Yc(n.attributes):e.indices+`:`+Yc(e.attributes)+`:`+e.mode,e.targets!==void 0)for(let n=0,r=e.targets.length;n<r;n++)t+=`:`+Yc(e.targets[n]);return t}function Yc(e){let t=``,n=Object.keys(e).sort();for(let r=0,i=n.length;r<i;r++)t+=n[r]+`:`+e[n[r]]+`;`;return t}function Xc(e){switch(e){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw Error(`THREE.GLTFLoader: Unsupported normalized accessor component type.`)}}function Zc(e){return e.search(/\.jpe?g($|\?)/i)>0||e.search(/^data\:image\/jpeg/)===0?`image/jpeg`:e.search(/\.webp($|\?)/i)>0||e.search(/^data\:image\/webp/)===0?`image/webp`:e.search(/\.ktx2($|\?)/i)>0||e.search(/^data\:image\/ktx2/)===0?`image/ktx2`:`image/png`}var Qc=new Ln,$c=class{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new ic,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,r=-1,i=!1,a=-1;if(typeof navigator<`u`&&navigator.userAgent!==void 0){let e=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(e)===!0;let t=e.match(/Version\/(\d+)/);r=n&&t?parseInt(t[1],10):-1,i=e.indexOf(`Firefox`)>-1,a=i?e.match(/Firefox\/([0-9]+)\./)[1]:-1}this.textureLoader=typeof createImageBitmap>`u`||n&&r<17||i&&a<98?new Cn(this.options.manager):new Vt(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new sn(this.options.manager),this.fileLoader.setResponseType(`arraybuffer`),this.options.crossOrigin===`use-credentials`&&this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){let n=this,r=this.json,i=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(e){return e._markDefs&&e._markDefs()}),Promise.all(this._invokeAll(function(e){return e.beforeRoot&&e.beforeRoot()})).then(function(){return Promise.all([n.getDependencies(`scene`),n.getDependencies(`animation`),n.getDependencies(`camera`)])}).then(function(t){let a={scene:t[0][r.scene||0],scenes:t[0],animations:t[1],cameras:t[2],asset:r.asset,parser:n,userData:{}};return Wc(i,a,r),Gc(a,r),Promise.all(n._invokeAll(function(e){return e.afterRoot&&e.afterRoot(a)})).then(function(){for(let e of a.scenes)e.updateMatrixWorld();e(a)})}).catch(t)}_markDefs(){let e=this.json.nodes||[],t=this.json.skins||[],n=this.json.meshes||[];for(let n=0,r=t.length;n<r;n++){let r=t[n].joints;for(let t=0,n=r.length;t<n;t++)e[r[t]].isBone=!0}for(let t=0,r=e.length;t<r;t++){let r=e[t];r.mesh!==void 0&&(this._addNodeRef(this.meshCache,r.mesh),r.skin!==void 0&&(n[r.mesh].isSkinnedMesh=!0)),r.camera!==void 0&&this._addNodeRef(this.cameraCache,r.camera)}}_addNodeRef(e,t){t!==void 0&&(e.refs[t]===void 0&&(e.refs[t]=e.uses[t]=0),e.refs[t]++)}_getNodeRef(e,t,n){if(e.refs[t]<=1)return n;let r=n.clone(),i=(e,t)=>{let n=this.associations.get(e);n!=null&&this.associations.set(t,n);for(let[n,r]of e.children.entries())i(r,t.children[n])};return i(n,r),r.name+=`_instance_`+e.uses[t]++,r}_invokeOne(e){let t=Object.values(this.plugins);t.push(this);for(let n=0;n<t.length;n++){let r=e(t[n]);if(r)return r}return null}_invokeAll(e){let t=Object.values(this.plugins);t.unshift(this);let n=[];for(let r=0;r<t.length;r++){let i=e(t[r]);i&&n.push(i)}return n}getDependency(e,t){let n=e+`:`+t,r=this.cache.get(n);if(!r){switch(e){case`scene`:r=this.loadScene(t);break;case`node`:r=this._invokeOne(function(e){return e.loadNode&&e.loadNode(t)});break;case`mesh`:r=this._invokeOne(function(e){return e.loadMesh&&e.loadMesh(t)});break;case`accessor`:r=this.loadAccessor(t);break;case`bufferView`:r=this._invokeOne(function(e){return e.loadBufferView&&e.loadBufferView(t)});break;case`buffer`:r=this.loadBuffer(t);break;case`material`:r=this._invokeOne(function(e){return e.loadMaterial&&e.loadMaterial(t)});break;case`texture`:r=this._invokeOne(function(e){return e.loadTexture&&e.loadTexture(t)});break;case`skin`:r=this.loadSkin(t);break;case`animation`:r=this._invokeOne(function(e){return e.loadAnimation&&e.loadAnimation(t)});break;case`camera`:r=this.loadCamera(t);break;default:if(r=this._invokeOne(function(n){return n!=this&&n.getDependency&&n.getDependency(e,t)}),!r)throw Error(`Unknown type: `+e)}this.cache.add(n,r)}return r}getDependencies(e){let t=this.cache.get(e);if(!t){let n=this,r=this.json[e+(e===`mesh`?`es`:`s`)]||[];t=Promise.all(r.map(function(t,r){return n.getDependency(e,r)})),this.cache.add(e,t)}return t}loadBuffer(e){let t=this.json.buffers[e],n=this.fileLoader;if(t.type&&t.type!==`arraybuffer`)throw Error(`THREE.GLTFLoader: `+t.type+` buffer type is not supported.`);if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[Q.KHR_BINARY_GLTF].body);let r=this.options;return new Promise(function(e,i){n.load(B.resolveURL(t.uri,r.path),e,void 0,function(){i(Error(`THREE.GLTFLoader: Failed to load buffer "`+t.uri+`".`))})})}loadBufferView(e){let t=this.json.bufferViews[e];return this.getDependency(`buffer`,t.buffer).then(function(e){let n=t.byteLength||0,r=t.byteOffset||0;return e.slice(r,r+n)})}loadAccessor(e){let t=this,n=this.json,r=this.json.accessors[e];if(r.bufferView===void 0&&r.sparse===void 0){let e=Rc[r.type],t=Fc[r.componentType],n=r.normalized===!0,i=new t(r.count*e);return Promise.resolve(new L(i,e,n))}let i=[];return r.bufferView===void 0?i.push(null):i.push(this.getDependency(`bufferView`,r.bufferView)),r.sparse!==void 0&&(i.push(this.getDependency(`bufferView`,r.sparse.indices.bufferView)),i.push(this.getDependency(`bufferView`,r.sparse.values.bufferView))),Promise.all(i).then(function(e){let i=e[0],a=Rc[r.type],o=Fc[r.componentType],s=o.BYTES_PER_ELEMENT,c=s*a,l=r.byteOffset||0,u=r.bufferView===void 0?void 0:n.bufferViews[r.bufferView].byteStride,d=r.normalized===!0,f,p;if(u&&u!==c){let e=Math.floor(l/u),n=`InterleavedBuffer:`+r.bufferView+`:`+r.componentType+`:`+e+`:`+r.count,c=t.cache.get(n);c||(f=new o(i,e*u,r.count*u/s),c=new wn(f,u/s),t.cache.add(n,c)),p=new Pn(c,a,l%u/s,d)}else f=i===null?new o(r.count*a):new o(i,l,r.count*a),p=new L(f,a,d);if(r.sparse!==void 0){let t=Rc.SCALAR,n=Fc[r.sparse.indices.componentType],s=r.sparse.indices.byteOffset||0,c=r.sparse.values.byteOffset||0,l=new n(e[1],s,r.sparse.count*t),u=new o(e[2],c,r.sparse.count*a);i!==null&&(p=new L(p.array.slice(),p.itemSize,p.normalized)),p.normalized=!1;for(let e=0,t=l.length;e<t;e++){let t=l[e];if(p.setX(t,u[e*a]),a>=2&&p.setY(t,u[e*a+1]),a>=3&&p.setZ(t,u[e*a+2]),a>=4&&p.setW(t,u[e*a+3]),a>=5)throw Error(`THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.`)}p.normalized=d}return p})}loadTexture(e){let t=this.json,n=this.options,r=t.textures[e].source,i=t.images[r],a=this.textureLoader;if(i.uri){let e=n.manager.getHandler(i.uri);e!==null&&(a=e)}return this.loadTextureImage(e,r,a)}loadTextureImage(e,t,n){let r=this,i=this.json,a=i.textures[e],o=i.images[t],s=(o.uri||o.bufferView)+`:`+a.sampler;if(this.textureCache[s])return this.textureCache[s];let c=this.loadImageSource(t,n).then(function(t){t.flipY=!1,t.name=a.name||o.name||``,t.name===``&&typeof o.uri==`string`&&o.uri.startsWith(`data:image/`)===!1&&(t.name=o.uri);let n=(i.samplers||{})[a.sampler]||{};return t.magFilter=Ic[n.magFilter]||1006,t.minFilter=Ic[n.minFilter]||1008,t.wrapS=Lc[n.wrapS]||1e3,t.wrapT=Lc[n.wrapT]||1e3,t.generateMipmaps=!t.isCompressedTexture&&t.minFilter!==1003&&t.minFilter!==1006,r.associations.set(t,{textures:e}),t}).catch(function(){return null});return this.textureCache[s]=c,c}loadImageSource(e,t){let n=this,r=this.json,i=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then(e=>e.clone());let a=r.images[e],o=self.URL||self.webkitURL,s=a.uri||``,c=!1;if(a.bufferView!==void 0)s=n.getDependency(`bufferView`,a.bufferView).then(function(e){c=!0;let t=new Blob([e],{type:a.mimeType});return s=o.createObjectURL(t),s});else if(a.uri===void 0)throw Error(`THREE.GLTFLoader: Image `+e+` is missing URI and bufferView`);let l=Promise.resolve(s).then(function(e){return new Promise(function(n,r){let a=n;t.isImageBitmapLoader===!0&&(a=function(e){let t=new Ve(e);t.needsUpdate=!0,n(t)}),t.load(B.resolveURL(e,i.path),a,void 0,r)})}).then(function(e){return c===!0&&o.revokeObjectURL(s),Gc(e,a),e.userData.mimeType=a.mimeType||Zc(a.uri),e}).catch(function(e){throw console.error(`THREE.GLTFLoader: Couldn't load texture`,s),e});return this.sourceCache[e]=l,l}assignTexture(e,t,n,r){let i=this;return this.getDependency(`texture`,n.index).then(function(a){if(!a)return null;if(n.texCoord!==void 0&&n.texCoord>0&&(a=a.clone(),a.channel=n.texCoord),i.extensions[Q.KHR_TEXTURE_TRANSFORM]){let e=n.extensions===void 0?void 0:n.extensions[Q.KHR_TEXTURE_TRANSFORM];if(e){let t=i.associations.get(a);a=i.extensions[Q.KHR_TEXTURE_TRANSFORM].extendTexture(a,e),i.associations.set(a,t)}}return r!==void 0&&(a.colorSpace=r),e[t]=a,a})}assignFinalMaterial(e){let t=e.geometry,n=e.material,r=t.attributes.tangent===void 0,i=t.attributes.color!==void 0,a=t.attributes.normal===void 0;if(e.isPoints){let e=`PointsMaterial:`+n.uuid,t=this.cache.get(e);t||(t=new Jt,k.prototype.copy.call(t,n),t.color.copy(n.color),t.map=n.map,t.sizeAttenuation=!1,this.cache.add(e,t)),n=t}else if(e.isLine){let e=`LineBasicMaterial:`+n.uuid,t=this.cache.get(e);t||(t=new Se,k.prototype.copy.call(t,n),t.color.copy(n.color),t.map=n.map,this.cache.add(e,t)),n=t}if(r||i||a){let e=`ClonedMaterial:`+n.uuid+`:`;r&&(e+=`derivative-tangents:`),i&&(e+=`vertex-colors:`),a&&(e+=`flat-shading:`);let t=this.cache.get(e);t||(t=n.clone(),i&&(t.vertexColors=!0),a&&(t.flatShading=!0),r&&(t.normalScale&&(t.normalScale.y*=-1),t.clearcoatNormalScale&&(t.clearcoatNormalScale.y*=-1)),this.cache.add(e,t),this.associations.set(t,this.associations.get(n))),n=t}e.material=n}getMaterialType(){return re}loadMaterial(e){let t=this,n=this.json,r=this.extensions,i=n.materials[e],a,o={},s=i.extensions||{},c=[];if(s[Q.KHR_MATERIALS_UNLIT]){let e=r[Q.KHR_MATERIALS_UNLIT];a=e.getMaterialType(),c.push(e.extendParams(o,i,t))}else{let n=i.pbrMetallicRoughness||{};if(o.color=new V(1,1,1),o.opacity=1,Array.isArray(n.baseColorFactor)){let e=n.baseColorFactor;o.color.setRGB(e[0],e[1],e[2],At),o.opacity=e[3]}n.baseColorTexture!==void 0&&c.push(t.assignTexture(o,`map`,n.baseColorTexture,Ge)),o.metalness=n.metallicFactor===void 0?1:n.metallicFactor,o.roughness=n.roughnessFactor===void 0?1:n.roughnessFactor,n.metallicRoughnessTexture!==void 0&&(c.push(t.assignTexture(o,`metalnessMap`,n.metallicRoughnessTexture)),c.push(t.assignTexture(o,`roughnessMap`,n.metallicRoughnessTexture))),a=this._invokeOne(function(t){return t.getMaterialType&&t.getMaterialType(e)}),c.push(Promise.all(this._invokeAll(function(t){return t.extendMaterialParams&&t.extendMaterialParams(e,o)})))}i.doubleSided===!0&&(o.side=2);let l=i.alphaMode||Hc.OPAQUE;if(l===Hc.BLEND?(o.transparent=!0,o.depthWrite=!1):(o.transparent=!1,l===Hc.MASK&&(o.alphaTest=i.alphaCutoff===void 0?.5:i.alphaCutoff)),i.normalTexture!==void 0&&a!==De&&(c.push(t.assignTexture(o,`normalMap`,i.normalTexture)),o.normalScale=new kt(1,1),i.normalTexture.scale!==void 0)){let e=i.normalTexture.scale;o.normalScale.set(e,e)}if(i.occlusionTexture!==void 0&&a!==De&&(c.push(t.assignTexture(o,`aoMap`,i.occlusionTexture)),i.occlusionTexture.strength!==void 0&&(o.aoMapIntensity=i.occlusionTexture.strength)),i.emissiveFactor!==void 0&&a!==De){let e=i.emissiveFactor;o.emissive=new V().setRGB(e[0],e[1],e[2],At)}return i.emissiveTexture!==void 0&&a!==De&&c.push(t.assignTexture(o,`emissiveMap`,i.emissiveTexture,Ge)),Promise.all(c).then(function(){let n=new a(o);return i.name&&(n.name=i.name),Gc(n,i),t.associations.set(n,{materials:e}),i.extensions&&Wc(r,n,i),n})}createUniqueName(e){let t=un.sanitizeNodeName(e||``);return t in this.nodeNamesUsed?t+`_`+ ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t]=0,t)}loadGeometries(e){let t=this,n=this.extensions,r=this.primitiveCache;function i(e){return n[Q.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(e,t).then(function(n){return tl(n,e,t)})}let a=[];for(let n=0,o=e.length;n<o;n++){let o=e[n],s=Jc(o),c=r[s];if(c)a.push(c.promise);else{let e;e=o.extensions&&o.extensions[Q.KHR_DRACO_MESH_COMPRESSION]?i(o):tl(new z,o,t),o.mode===Pc.TRIANGLE_STRIP?e=e.then(e=>ec(e,1)):o.mode===Pc.TRIANGLE_FAN&&(e=e.then(e=>ec(e,2))),r[s]={primitive:o,promise:e},a.push(e)}}return Promise.all(a)}loadMesh(e){let t=this,n=this.json,r=this.extensions,i=n.meshes[e],a=i.primitives,o=[];for(let e=0,t=a.length;e<t;e++){let t=a[e].material===void 0?Uc(this.cache):this.getDependency(`material`,a[e].material);o.push(t)}return o.push(t.loadGeometries(a)),Promise.all(o).then(async function(n){let o=n.slice(0,n.length-1),s=n[n.length-1],c=[];for(let n=0,l=s.length;n<l;n++){let l=s[n],u=a[n],f,p=o[n];if(u.mode===Pc.TRIANGLES||u.mode===Pc.TRIANGLE_STRIP||u.mode===Pc.TRIANGLE_FAN||u.mode===void 0){let e=i.isSkinnedMesh===!0,t=l.hasAttribute(`skinIndex`)&&l.hasAttribute(`skinWeight`);e&&t===!1&&console.warn(`THREE.GLTFLoader: Missing skinIndex or skinWeight attributes. Skinning disabled.`),f=e&&t?new it(l,p):new d(l,p),f.isSkinnedMesh===!0&&f.normalizeSkinWeights()}else if(u.mode===Pc.LINES)f=new g(l,p);else if(u.mode===Pc.LINE_STRIP)f=new En(l,p);else if(u.mode===Pc.LINE_LOOP)f=new v(l,p);else if(u.mode===Pc.POINTS)f=new We(l,p);else throw Error(`THREE.GLTFLoader: Primitive mode unsupported: `+u.mode);Object.keys(f.geometry.morphAttributes).length>0&&qc(f,i),f.name=t.createUniqueName(i.name||`mesh_`+e),Gc(f,i),u.extensions&&Wc(r,f,u),t.assignFinalMaterial(f),c.push(f)}for(let n=0,r=c.length;n<r;n++)t.associations.set(c[n],{meshes:e,primitives:n});if(c.length===1)return i.extensions&&Wc(r,c[0],i),c[0];let l=new bn;i.extensions&&Wc(r,l,i),t.associations.set(l,{meshes:e});for(let e=0,t=c.length;e<t;e++)l.add(c[e]);return l})}loadCamera(e){let t,n=this.json.cameras[e],r=n[n.type];if(!r){console.warn(`THREE.GLTFLoader: Missing camera parameters.`);return}return n.type===`perspective`?t=new hn(I.radToDeg(r.yfov),r.aspectRatio||1,r.znear||1,r.zfar||2e6):n.type===`orthographic`&&(t=new st(-r.xmag,r.xmag,r.ymag,-r.ymag,r.znear,r.zfar)),n.name&&(t.name=this.createUniqueName(n.name)),Gc(t,n),Promise.resolve(t)}loadSkin(e){let t=this.json.skins[e],n=[];for(let e=0,r=t.joints.length;e<r;e++)n.push(this._loadNodeShallow(t.joints[e]));return t.inverseBindMatrices===void 0?n.push(null):n.push(this.getDependency(`accessor`,t.inverseBindMatrices)),Promise.all(n).then(function(e){let n=e.pop(),r=e,i=[],a=[];for(let e=0,o=r.length;e<o;e++){let o=r[e];if(o){i.push(o);let t=new Ln;n!==null&&t.fromArray(n.array,e*16),a.push(t)}else console.warn(`THREE.GLTFLoader: Joint "%s" could not be found.`,t.joints[e])}return new yn(i,a)})}loadAnimation(e){let t=this.json,n=this,r=t.animations[e],i=r.name?r.name:`animation_`+e,a=[],o=[],s=[],c=[],l=[];for(let e=0,t=r.channels.length;e<t;e++){let t=r.channels[e],n=r.samplers[t.sampler],i=t.target,u=i.node,d=r.parameters===void 0?n.input:r.parameters[n.input],f=r.parameters===void 0?n.output:r.parameters[n.output];i.node!==void 0&&(a.push(this.getDependency(`node`,u)),o.push(this.getDependency(`accessor`,d)),s.push(this.getDependency(`accessor`,f)),c.push(n),l.push(i))}return Promise.all([Promise.all(a),Promise.all(o),Promise.all(s),Promise.all(c),Promise.all(l)]).then(function(e){let t=e[0],a=e[1],o=e[2],s=e[3],c=e[4],l=[];for(let e=0,r=t.length;e<r;e++){let r=t[e],i=a[e],u=o[e],d=s[e],f=c[e];if(r===void 0)continue;r.updateMatrix&&r.updateMatrix();let p=n._createAnimationTracks(r,i,u,d,f);if(p)for(let e=0;e<p.length;e++)l.push(p[e])}let u=new Tn(i,void 0,l);return Gc(u,r),u})}createNodeMesh(e){let t=this.json,n=this,r=t.nodes[e];return r.mesh===void 0?null:n.getDependency(`mesh`,r.mesh).then(function(e){let t=n._getNodeRef(n.meshCache,r.mesh,e);return r.weights!==void 0&&t.traverse(function(e){if(e.isMesh)for(let t=0,n=r.weights.length;t<n;t++)e.morphTargetInfluences[t]=r.weights[t]}),t})}loadNode(e){let t=this.json,n=this,r=t.nodes[e],i=n._loadNodeShallow(e),a=[],o=r.children||[];for(let e=0,t=o.length;e<t;e++)a.push(n.getDependency(`node`,o[e]));let s=r.skin===void 0?Promise.resolve(null):n.getDependency(`skin`,r.skin);return Promise.all([i,Promise.all(a),s]).then(function(e){let t=e[0],n=e[1],r=e[2];r!==null&&t.traverse(function(e){e.isSkinnedMesh&&e.bind(r,Qc)});for(let e=0,r=n.length;e<r;e++)t.add(n[e]);if(t.userData.pivot!==void 0&&n.length>0){let e=t.userData.pivot,r=n[0];t.pivot=new R().fromArray(e),t.position.x-=e[0],t.position.y-=e[1],t.position.z-=e[2],r.position.set(0,0,0),delete t.userData.pivot}return t})}_loadNodeShallow(e){let t=this.json,n=this.extensions,r=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];let i=t.nodes[e],a=i.name?r.createUniqueName(i.name):``,o=[],s=r._invokeOne(function(t){return t.createNodeMesh&&t.createNodeMesh(e)});return s&&o.push(s),i.camera!==void 0&&o.push(r.getDependency(`camera`,i.camera).then(function(e){return r._getNodeRef(r.cameraCache,i.camera,e)})),r._invokeAll(function(t){return t.createNodeAttachment&&t.createNodeAttachment(e)}).forEach(function(e){o.push(e)}),this.nodeCache[e]=Promise.all(o).then(function(t){let o;if(o=i.isBone===!0?new ce:t.length>1?new bn:t.length===1?t[0]:new he,o!==t[0])for(let e=0,n=t.length;e<n;e++)o.add(t[e]);if(i.name&&(o.userData.name=i.name,o.name=a),Gc(o,i),i.extensions&&Wc(n,o,i),i.matrix!==void 0){let e=new Ln;e.fromArray(i.matrix),o.applyMatrix4(e)}else i.translation!==void 0&&o.position.fromArray(i.translation),i.rotation!==void 0&&o.quaternion.fromArray(i.rotation),i.scale!==void 0&&o.scale.fromArray(i.scale);if(!r.associations.has(o))r.associations.set(o,{});else if(i.mesh!==void 0&&r.meshCache.refs[i.mesh]>1){let e=r.associations.get(o);r.associations.set(o,{...e})}return r.associations.get(o).nodes=e,o}),this.nodeCache[e]}loadScene(e){let t=this.extensions,n=this.json.scenes[e],r=this,i=new bn;n.name&&(i.name=r.createUniqueName(n.name)),Gc(i,n),n.extensions&&Wc(t,i,n);let a=n.nodes||[],o=[];for(let e=0,t=a.length;e<t;e++)o.push(r.getDependency(`node`,a[e]));return Promise.all(o).then(function(e){for(let t=0,n=e.length;t<n;t++){let n=e[t];n.parent===null?i.add(n):i.add(tc(n))}return r.associations=(e=>{let t=new Map;for(let[e,n]of r.associations)(e instanceof k||e instanceof Ve)&&t.set(e,n);return e.traverse(e=>{let n=r.associations.get(e);n!=null&&t.set(e,n)}),t})(i),i})}_createAnimationTracks(e,t,n,r,i){let a=[],o=e.name?e.name:e.uuid,s=[];function c(e){e.morphTargetInfluences&&s.push(e.name?e.name:e.uuid)}Bc[i.path]===Bc.weights?(c(e),e.isGroup&&e.children.forEach(c)):s.push(o);let l;switch(Bc[i.path]){case Bc.weights:l=Re;break;case Bc.rotation:l=It;break;case Bc.translation:case Bc.scale:l=de;break;default:switch(n.itemSize){case 1:l=Re;break;default:l=de}}let u=r.interpolation===void 0?ye:Vc[r.interpolation],d=this._getArrayFromAccessor(n);for(let e=0,n=s.length;e<n;e++){let n=new l(s[e]+`.`+Bc[i.path],t.array,d,u);r.interpolation===`CUBICSPLINE`&&this._createCubicSplineTrackInterpolant(n),a.push(n)}return a}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){let e=Xc(t.constructor),n=new Float32Array(t.length);for(let r=0,i=t.length;r<i;r++)n[r]=t[r]*e;t=n}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(e){return new(this instanceof It?Nc:jc)(this.times,this.values,this.getValueSize()/3,e)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}};function el(e,t,n){let r=t.attributes,i=new jt;if(r.POSITION!==void 0){let e=n.json.accessors[r.POSITION],t=e.min,a=e.max;if(t!==void 0&&a!==void 0){if(i.set(new R(t[0],t[1],t[2]),new R(a[0],a[1],a[2])),e.normalized){let t=Xc(Fc[e.componentType]);i.min.multiplyScalar(t),i.max.multiplyScalar(t)}}else{console.warn(`THREE.GLTFLoader: Missing min/max properties for accessor POSITION.`);return}}else return;let a=t.targets;if(a!==void 0){let e=new R,t=new R;for(let r=0,i=a.length;r<i;r++){let i=a[r];if(i.POSITION!==void 0){let r=n.json.accessors[i.POSITION],a=r.min,o=r.max;if(a!==void 0&&o!==void 0){if(t.setX(Math.max(Math.abs(a[0]),Math.abs(o[0]))),t.setY(Math.max(Math.abs(a[1]),Math.abs(o[1]))),t.setZ(Math.max(Math.abs(a[2]),Math.abs(o[2]))),r.normalized){let e=Xc(Fc[r.componentType]);t.multiplyScalar(e)}e.max(t)}else console.warn(`THREE.GLTFLoader: Missing min/max properties for accessor POSITION.`)}}i.expandByVector(e)}e.boundingBox=i;let o=new ft;i.getCenter(o.center),o.radius=i.min.distanceTo(i.max)/2,e.boundingSphere=o}function tl(e,t,n){let r=t.attributes,i=[];function a(t,r){return n.getDependency(`accessor`,t).then(function(t){e.setAttribute(r,t)})}for(let t in r){let n=zc[t]||t.toLowerCase();n in e.attributes||i.push(a(r[t],n))}if(t.indices!==void 0&&!e.index){let r=n.getDependency(`accessor`,t.indices).then(function(t){e.setIndex(t)});i.push(r)}return Fn.workingColorSpace!==`srgb-linear`&&`COLOR_0`in r&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${Fn.workingColorSpace}" not supported.`),Gc(e,t),el(e,t,n),Promise.all(i).then(function(){return t.targets===void 0?e:Kc(e,t.targets,n)})}var nl=Math.PI/180,rl=new Map(Object.entries(ln)),il=0;function al(e){rl.set(e.id,e),il++}function ol(e){let t=e.params;switch(e.type){case`box`:return new o(t[0]??.2,t[1]??.2,t[2]??.2);case`sphere`:return new Qt(t[0]??.1,8,6);case`capsule`:return new y(t[0]??.1,t[1]??.3,3,8);case`cylinder`:return new S(t[0]??.1,t[1]??.1,t[2]??.4,6);case`cone`:return new l(t[0]??.1,t[1]??.3,Math.max(3,Math.round(t[2]??6)));case`icosahedron`:return new $t(t[0]??.15,Math.round(t[1]??1));case`dodecahedron`:return new n(t[0]??.15,Math.round(t[1]??0))}}function sl(e,t){if(`fixed`in e)return new V(e.fixed);let n=new V(t[e.role]);return e.shade&&n.offsetHSL(0,0,e.shade),n}var cl=new Map,ll=new rc;function ul(e){let t=cl.get(e);return t||(t=ll.loadAsync(e),cl.set(e,t)),t}function dl(e,t={}){let n={...Sn(t.appearance),...t.palette},r=new bn;r.scale.setScalar(t.scale??e.scale);let i=new Map,a=new Map,o=new Map,s=(e,t=0)=>{let n=`${e}|${t}`,r=a.get(n);return r||(r=new re({color:e,roughness:.82,flatShading:!0,emissive:t?e:0,emissiveIntensity:t}),a.set(n,r)),r};for(let t of e.bones){let e=new bn;e.name=t.name,e.position.set(...t.position),e.rotation.set(t.rotation[0]*nl,t.rotation[1]*nl,t.rotation[2]*nl),t.scale&&e.scale.set(...t.scale),e.userData.rigBone=t.name,i.set(t.name,e)}for(let t of e.bones)(t.parent&&i.get(t.parent)||r).add(i.get(t.name));for(let a of e.parts){if(!Mn(a,t.appearance))continue;let e=new d(ol(a.geometry),s(`#${sl(a.color,n).getHexString()}`,a.emissive??0));e.position.set(...a.position),e.rotation.set(a.rotation[0]*nl,a.rotation[1]*nl,a.rotation[2]*nl),e.scale.set(...a.scale),e.castShadow=e.receiveShadow=a.castShadow!==!1,e.name=a.name,e.userData.rigPart=a.id,(i.get(a.bone)??r).add(e),o.set(a.id,e)}let c=e.limbs.flatMap(e=>{let t=i.get(e.bone);return t?[{bone:t,phase:e.phase,amplitude:e.amplitude??27,flex:e.flex??0,flexSign:e.flexSign??1}]:[]}),l=new Map([...i].map(([e,t])=>[e,{r:t.rotation.clone(),p:t.position.clone(),s:t.scale.clone()}])),u=new Map,f,p=new Map,m=null,h=!1,g=(async()=>{let n=e.model;if(n&&!t.noModel)try{let e=await ul(n.url);if(h)return;let t=n.skinned?tc(e.scene):e.scene.clone(!0);if(t.position.set(...n.position),t.rotation.set(n.rotation[0]*nl,n.rotation[1]*nl,n.rotation[2]*nl),t.scale.setScalar(n.scale),t.traverse(e=>{e instanceof d&&(e.castShadow=e.receiveShadow=!0)}),t.userData.rigModel=!0,(n.bone&&i.get(n.bone)||r).add(t),e.animations.length){f=new be(t);for(let[t,r]of Object.entries(n.clips)){let n=Tn.findByName(e.animations,r);n&&p.set(t,f.clipAction(n))}let r=p.get(`attack`);r&&(r.setLoop(x,1),r.clampWhenFinished=!1)}}catch(t){console.warn(`rig ${e.id}: could not load model ${n.url}`,t)}})(),_=e=>{if(m===e)return;let t=p.get(e);if(!t)return;let n=m?p.get(m):void 0;t.reset().fadeIn(.15).play(),n&&n!==t&&n.fadeOut(.15),m=e},v=0,y=null,b=-1,S=(e,t,n)=>{let r=Je(e,t);for(let[e,t]of i){let i=r.get(e);if(!i&&n)continue;let a=l.get(e),o=u.get(e);i?.rotation?t.rotation.set(i.rotation[0]*nl,i.rotation[1]*nl,i.rotation[2]*nl):n||t.rotation.set(a.r.x+(o?.[0]??0)*nl,a.r.y+(o?.[1]??0)*nl,a.r.z+(o?.[2]??0)*nl),i?.position?t.position.set(...i.position):n||t.position.copy(a.p),i?.scale?t.scale.set(...i.scale):n||t.scale.copy(a.s)}};return{doc:e,root:r,bones:i,limbs:c,parts:o,ready:g,hasClip:t=>p.has(t)||!!e.anims?.[t],update(t,n,i,a){let o=i?`run`:`idle`;if(o===y?v+=t:(y=o,v=0),p.has(o)&&_(o),f?.update(t),!p.has(o)){let t=e.anims?.[o];if(t)S(t,v,!1);else{for(let e of c){let t=l.get(e.bone.name)?.r.x??0,r=i&&a?Math.sin(n*11+e.phase*Math.PI):0,o=e.flex?Math.max(0,-r)*e.flex*e.flexSign*nl:0,s=(u.get(e.bone.name)?.[0]??0)*nl;e.bone.rotation.x=t+s+r*e.amplitude*nl+o}r.userData.restY===void 0&&(r.userData.restY=r.position.y),r.position.y=r.userData.restY+(i?Math.abs(Math.sin(n*11))*.045:Math.sin(n*2)*.012)}}if(b>=0){b+=t;let n=e.anims?.attack;!n||b>n.duration?b=-1:S(n,b,!0)}},previewClip(e,t){S(e,t,!1)},attack(){let t=p.get(`attack`);t?t.reset().play():e.anims?.attack&&(b=0)},applyPose(e){for(let[t,n]of i){let r=l.get(t).r,i=e?.[t];i?(n.rotation.set(r.x+i[0]*nl,r.y+i[1]*nl,r.z+i[2]*nl),u.set(t,i)):(n.rotation.copy(r),u.delete(t))}},dispose(){h=!0,f?.stopAllAction(),ps(r)}}}var fl=[`ears`,`horns`,`wings`,`tail`],pl=[{id:`model`,label:`Model`},{id:`skeleton`,label:`Skeleton`},{id:`animation`,label:`Animation`}];function ml(e){let t=e.map(e=>({...e,builtin:!1}));for(let[n,r]of Object.entries(ln))e.some(e=>e.id===n)||t.push({id:n,label:`${r.label} (builtin)`,builtin:!0});return t}function hl(e,t){let[n,r]=(0,J.useState)([]),[i,o]=(0,J.useState)([]),[s,c]=(0,J.useState)(``),[l,u]=(0,J.useState)(null),[f,p]=(0,J.useState)(!1),[m,h]=(0,J.useState)(``),[_,v]=(0,J.useState)(``),[y,b]=(0,J.useState)(`idle`),[x,S]=(0,J.useState)(`model`),[C,w]=(0,J.useState)(!1),[T,E]=(0,J.useState)({skin:`c1`,hairColor:`c1`,clothColor:`c1`}),[D,O]=(0,J.useState)(`idle`),[ee,k]=(0,J.useState)(!1),A=(0,J.useRef)(`idle`),j=(0,J.useRef)(!1),M=(0,J.useRef)(0),N=(0,J.useRef)(null),P=(0,J.useRef)(null);P.current=l;let te=(0,J.useCallback)(e=>{j.current=e,k(e)},[]),ne=(0,J.useRef)(null),re=(0,J.useRef)(null),F=(0,J.useCallback)(async()=>{try{let e=ml(await Tt());r(e),e.some(e=>e.id===s)||c(e[0]?.id??``)}catch{r(ml([])),s||c(Object.keys(ln)[0]??``)}},[s]);(0,J.useEffect)(()=>{F()},[F]),(0,J.useEffect)(()=>{an().then(o)},[]);let ie=(0,J.useCallback)(async e=>{if(e){c(e),v(``);try{let t=await Ue(e);u(t??structuredClone(ln[e])??null),p(!1),h(t?`Loaded rigs3d/${e}.rig3d.json`:`Using compiled-in default for '${e}'`)}catch(t){u(structuredClone(ln[e])??null),p(!1),h(`Rig file unreadable (${t instanceof Error?t.message:t}) — showing the default`)}}},[]);(0,J.useEffect)(()=>{s&&!l&&ie(s)},[s,l,ie]);let I=(0,J.useCallback)(e=>{u(t=>t&&e(t)),p(!0)},[]);(0,J.useEffect)(()=>{if(!e||!t||!l)return;let n=e.stage;for(;n.children.length;){let e=n.children[0];n.remove(e),ps(e)}let r=()=>{let t=e.getPivot();n.position.set(t.x,e.groundHeight(t.x,t.z),t.z)};r();let i=dl(l,{appearance:T});n.add(i.root),ne.current=i,C&&i.applyPose(l.ridePose);let o=null;if(x===`skeleton`){let e=new Map,t=new a(.05);for(let[n,r]of i.bones){let i=new d(t,new De({color:8377599,depthTest:!1,transparent:!0,opacity:.9}));i.renderOrder=20,r.add(i),e.set(n,i)}re.current=e;let r=l.bones.filter(e=>e.parent).length,s=new L(new Float32Array(r*6),3);o=new g(new z().setAttribute(`position`,s),new Se({color:8377599,depthTest:!1,transparent:!0,opacity:.7})),o.frustumCulled=!1,o.renderOrder=19,n.add(o)}else re.current=null;let s=()=>e.frameObject(i.root,3.2);s(),e.onMapLoaded=()=>{r(),s()};let c=new R;return e.onFrame=(e,t)=>{let r=l.anims?.[A.current];if(x===`animation`&&r){if(j.current){let t=M.current+e;t>=r.duration&&(t=r.loop?t%r.duration:r.duration,r.loop||te(!1)),M.current=t,N.current?.(t)}i.previewClip(r,M.current)}else i.update(e,t,y===`run`,!0);if(o){let e=o.geometry.getAttribute(`position`),t=0;for(let r of l.bones){if(!r.parent)continue;let a=i.bones.get(r.name),o=i.bones.get(r.parent);a&&o&&(a.getWorldPosition(c),n.worldToLocal(c),e.setXYZ(t++,c.x,c.y,c.z),o.getWorldPosition(c),n.worldToLocal(c),e.setXYZ(t++,c.x,c.y,c.z))}e.needsUpdate=!0}},()=>{e.onFrame=()=>{},e.onMapLoaded=()=>{},e.setGizmoOverride(null),ne.current===i&&(ne.current=null),re.current=null,o&&(n.remove(o),ps(o)),n.remove(i.root),n.position.set(0,0,0),i.dispose()}},[e,t,l,T,y,x,C]),(0,J.useEffect)(()=>{let e=re.current;if(e)for(let[t,n]of e)n.material.color.set(t===_?16766814:8377599)},[_,l,x]);let ae=(0,J.useCallback)((e,t,n)=>{I(r=>{let i=A.current,a=r.anims?.[i];if(!a)return r;let o=a.tracks.map(e=>({...e,keys:[...e.keys]}));n?o.some(t=>t.bone===e&&t.channel===n)||o.push({bone:e,channel:n,keys:[]}):o.some(t=>t.bone===e)||o.push({bone:e,channel:`rotation`,keys:[]});let s=M.current;return o=o.map(r=>{if(r.bone!==e||n&&r.channel!==n)return r;let i=r.channel===`rotation`?t.rotation:r.channel===`position`?t.position:t.scale;return On(r,s,i)}),{...r,anims:{...r.anims,[i]:{...a,tracks:o}}}})},[I]),oe=(0,J.useCallback)((e,t)=>{let n=ne.current?.bones.get(e);if(!n)return;let r=180/Math.PI;ae(e,{position:[n.position.x,n.position.y,n.position.z],rotation:[n.rotation.x*r,n.rotation.y*r,n.rotation.z*r],scale:[n.scale.x,n.scale.y,n.scale.z]},t)},[ae]),se=(0,J.useCallback)(e=>I(t=>({...t,anims:{...t.anims,[e]:bt()}})),[I]),ce=(0,J.useCallback)(e=>I(t=>{let n={...t.anims};return delete n[e],{...t,anims:Object.keys(n).length?n:void 0}}),[I]),le=(0,J.useCallback)((e,t)=>I(n=>{let r=n.anims?.[e];return r?{...n,anims:{...n.anims,[e]:{...r,...t}}}:n}),[I]),ue=(0,J.useCallback)((e,t)=>I(n=>{let r=n.anims?.[e];return r?{...n,anims:{...n.anims,[e]:{...r,tracks:t(r.tracks)}}}:n}),[I]),de=(0,J.useCallback)(e=>{A.current=e,M.current=0,N.current?.(0),O(e),te(!1)},[]);return(0,J.useEffect)(()=>{if(!e||!t)return;let n=ne.current,r=_&&n?n.bones.get(_):null;return e.setGizmoOverride(r??null,e=>{if(x===`animation`&&_&&P.current?.anims?.[A.current]){ae(_,e);return}I(t=>({...t,bones:t.bones.map(t=>t.name===_?{...t,position:e.position,rotation:e.rotation,scale:e.scale}:t)}))}),()=>{e&&e.setGizmoOverride(null)}},[e,t,_,I,x,l,ae]),{entries:n,models:i,rigId:s,doc:l,dirty:f,status:m,bone:_,anim:y,appearance:T,tab:x,ridePose:C,clip:D,tlPlaying:ee,setTlPlaying:te,recordBone:oe,setBone:v,setAnim:b,setAppearance:E,setTab:S,setRidePose:w,openRig:ie,update:I,newRig:(0,J.useCallback)(()=>{let e=window.prompt(`New rig id (used for the filename)`,`new_rig`);e&&(c(e),u(ht(e,e)),v(`root`),p(!0),h(`New rig '${e}' — save to create rigs3d/${e}.rig3d.json`))},[]),save:(0,J.useCallback)(async()=>{if(l)try{await qt(l),al(l),p(!1),h(`Saved rigs3d/${l.id}.rig3d.json`),F()}catch(e){h(`Save failed: ${e instanceof Error?e.message:e}`)}},[l,F]),remove:(0,J.useCallback)(async()=>{if(s&&window.confirm(`Delete saved file rigs3d/${s}.rig3d.json? The compiled-in default (if any) remains.`))try{await Ut(s),u(null),h(`Deleted ${s}.rig3d.json`),F()}catch(e){h(`Delete failed: ${e instanceof Error?e.message:e}`)}},[s,F]),attack:(0,J.useCallback)(()=>ne.current?.attack(),[]),setClip:de,createClip:se,deleteClip:ce,setClipProp:le,setClipTracks:ue,tlSetTime:e=>{M.current=e,N.current?.(e)},tlGetTime:()=>M.current,tlTick:e=>{N.current=e,e?.(M.current)},entry:n.find(e=>e.id===s)}}function gl({st:e}){return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`ed-dock-title`,children:[`Characters `,(0,Z.jsx)(`span`,{children:e.entries.length})]}),(0,Z.jsx)(`div`,{className:`ed-list`,children:e.entries.map(t=>(0,Z.jsx)(`button`,{className:`item ${t.id===e.rigId?`sel`:``}`,onClick:()=>void e.openRig(t.id),children:t.label},t.id))}),(0,Z.jsxs)(`div`,{className:`sc-lib-actions`,children:[(0,Z.jsx)(`button`,{onClick:e.newRig,children:`New rig`}),(0,Z.jsx)(`button`,{disabled:!e.entry||e.entry.builtin,title:`Delete the saved .rig3d.json (builtin defaults cannot be deleted)`,onClick:()=>void e.remove(),children:`Delete`})]}),(0,Z.jsx)(`div`,{className:`ed-dock-title`,children:`Preview`}),(0,Z.jsxs)(`div`,{className:`sc-preview-controls`,children:[(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`anim`}),(0,Z.jsxs)(`select`,{value:e.anim,onChange:t=>e.setAnim(t.target.value),children:[(0,Z.jsx)(`option`,{value:`idle`,children:`idle`}),(0,Z.jsx)(`option`,{value:`run`,children:`run`})]})]}),(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`skin`}),(0,Z.jsx)(`select`,{value:e.appearance.skin??``,onChange:t=>e.setAppearance({...e.appearance,skin:t.target.value||void 0}),children:Object.keys(dt).map(e=>(0,Z.jsx)(`option`,{value:e,children:e},e))})]}),(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`hair`}),(0,Z.jsx)(`select`,{value:e.appearance.hairColor??``,onChange:t=>e.setAppearance({...e.appearance,hairColor:t.target.value||void 0}),children:Object.keys(nt).map(e=>(0,Z.jsx)(`option`,{value:e,children:e},e))})]}),(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`cloth`}),(0,Z.jsx)(`select`,{value:e.appearance.clothColor??``,onChange:t=>e.setAppearance({...e.appearance,clothColor:t.target.value||void 0}),children:Object.keys(Qe).map(e=>(0,Z.jsx)(`option`,{value:e,children:e},e))})]}),fl.map(t=>(0,Z.jsxs)(`label`,{className:`efx-field`,title:`appearance.${t} — matches part "when" conditions`,children:[(0,Z.jsx)(`span`,{children:t}),(0,Z.jsx)(`input`,{value:e.appearance[t]??``,placeholder:`—`,onChange:n=>e.setAppearance({...e.appearance,[t]:n.target.value||void 0})})]},t))]})]})}function _l(e,t,n,r=.05){return(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:e}),(0,Z.jsx)(`input`,{type:`number`,step:r,value:t,onChange:e=>{let t=+e.target.value;Number.isFinite(t)&&n(t)}})]})}function vl(e,t,n,r=.05){return(0,Z.jsxs)(`div`,{className:`ed-row sc-vec`,children:[(0,Z.jsx)(`span`,{className:`sc-vec-label`,children:e}),t.map((i,a)=>(0,Z.jsx)(`input`,{type:`number`,"aria-label":`${e} ${`xyz`[a]}`,step:r,value:i,onChange:e=>{let r=[...t];r[a]=+e.target.value||0,n(r)}},a))]})}function yl(e,t){let n=`fixed`in e;return(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsxs)(`select`,{"aria-label":`Color source`,value:n?`fixed`:`role:${e.role}`,onChange:e=>{let n=e.target.value;t(n===`fixed`?{fixed:`#ffffff`}:{role:n.slice(5)})},children:[Ft.map(e=>(0,Z.jsx)(`option`,{value:`role:${e}`,children:e},e)),(0,Z.jsx)(`option`,{value:`fixed`,children:`fixed`})]}),n?(0,Z.jsx)(`input`,{type:`color`,"aria-label":`Fixed color`,value:e.fixed,onChange:e=>t({fixed:e.target.value})}):_l(`shade`,e.shade??0,n=>t({role:e.role,shade:n||void 0}),.05)]})}function bl({st:e}){let t=e.doc,n=t=>e.update(e=>({...e,...t}));return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(`h4`,{children:`Rig`}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`id`}),(0,Z.jsx)(`input`,{value:t.id,onChange:e=>n({id:e.target.value})})]}),(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`label`}),(0,Z.jsx)(`input`,{value:t.label,onChange:e=>n({label:e.target.value})})]})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[_l(`scale`,t.scale,e=>n({scale:e})),_l(`seat`,t.seat,e=>n({seat:e})),_l(`height`,t.height,e=>n({height:e}))]}),(0,Z.jsx)(`h4`,{children:`Model (glTF/GLB)`}),(0,Z.jsxs)(`label`,{className:`efx-check`,children:[(0,Z.jsx)(`input`,{type:`checkbox`,checked:!!t.model,onChange:e=>n({model:e.target.checked?{url:``,scale:1,position:[0,0,0],rotation:[0,0,0],clips:{},skinned:!0}:void 0})}),`enabled`]}),t.model&&(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsxs)(`select`,{"aria-label":`Model asset`,value:e.models.some(e=>e.url===t.model.url)?t.model.url:``,onChange:e=>n({model:{...t.model,url:e.target.value||t.model.url}}),children:[(0,Z.jsx)(`option`,{value:``,children:`— pick from assets/models —`}),e.models.map(e=>(0,Z.jsx)(`option`,{value:e.url,children:e.name},e.url))]}),(0,Z.jsx)(`input`,{"aria-label":`Model URL`,placeholder:`/assets/models/x.glb`,value:t.model.url,onChange:e=>n({model:{...t.model,url:e.target.value}})})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[_l(`scale`,t.model.scale,e=>n({model:{...t.model,scale:e}})),(0,Z.jsxs)(`label`,{className:`efx-check`,children:[(0,Z.jsx)(`input`,{type:`checkbox`,checked:t.model.skinned,onChange:e=>n({model:{...t.model,skinned:e.target.checked}})}),`skinned`]}),(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`bone`}),(0,Z.jsxs)(`select`,{value:t.model.bone??``,onChange:e=>n({model:{...t.model,bone:e.target.value||void 0}}),children:[(0,Z.jsx)(`option`,{value:``,children:`root`}),t.bones.map(e=>(0,Z.jsx)(`option`,{value:e.name,children:e.name},e.name))]})]})]}),vl(`position`,t.model.position,e=>n({model:{...t.model,position:e}})),vl(`rotation`,t.model.rotation,e=>n({model:{...t.model,rotation:e}}),5),(0,Z.jsx)(`div`,{className:`ed-hint`,children:`Clip names (idle/run/attack) are set on the Animation tab.`})]})]})}function xl({st:e}){let t=e.doc,n=t.bones.find(t=>t.name===e.bone),r=t=>e.update(e=>({...e,bones:e.bones.map(e=>e.name===n.name?{...e,...t}:e)})),i=e=>{let n=t.bones.find(t=>t.name===e.parent);return n?i(n)+1:0};return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`h4`,{children:[`Bones `,(0,Z.jsxs)(`span`,{className:`dim`,children:[`(`,t.bones.length,`)`]})]}),(0,Z.jsx)(`div`,{className:`ed-hint`,children:`Select a bone, then drag the gizmo in the scene or edit the numbers below.`}),(0,Z.jsx)(`div`,{className:`ed-list sc-bones`,children:t.bones.map(n=>(0,Z.jsxs)(`button`,{className:`item ${n.name===e.bone?`sel`:``}`,style:{paddingLeft:8+i(n)*12},onClick:()=>e.setBone(n.name===e.bone?``:n.name),children:[n.name,t.limbs.some(e=>e.bone===n.name)&&(0,Z.jsx)(`span`,{className:`dim`,children:` ⠿limb`}),(0,Z.jsxs)(`span`,{className:`dim`,children:[` · `,t.parts.filter(e=>e.bone===n.name).length,`p`]})]},n.name))}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsxs)(`button`,{onClick:()=>{let n=`bone`,r=n,i=1;for(;t.bones.some(e=>e.name===r);)r=`${n}_${i++}`;e.update(t=>({...t,bones:[...t.bones,{name:r,parent:e.bone||null,position:[0,0,0],rotation:[0,0,0]}]})),e.setBone(r)},children:[`+ Add bone`,e.bone?` under ${e.bone}`:``]}),(0,Z.jsx)(`button`,{disabled:!n,onClick:()=>{n&&window.confirm(`Delete bone '${n.name}' and its parts? Children are reparented to its parent.`)&&(e.update(e=>({...e,bones:e.bones.filter(e=>e.name!==n.name).map(e=>e.parent===n.name?{...e,parent:n.parent}:e),parts:e.parts.filter(e=>e.bone!==n.name),limbs:e.limbs.filter(e=>e.bone!==n.name)})),e.setBone(``))},children:`Remove`})]}),n&&(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`name`}),(0,Z.jsx)(`input`,{value:n.name,onChange:e=>r({name:e.target.value})})]}),(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`parent`}),(0,Z.jsxs)(`select`,{value:n.parent??``,onChange:e=>r({parent:e.target.value||null}),children:[(0,Z.jsx)(`option`,{value:``,children:`— root —`}),t.bones.filter(e=>e.name!==n.name).map(e=>(0,Z.jsx)(`option`,{value:e.name,children:e.name},e.name))]})]})]}),vl(`position`,n.position,e=>r({position:e})),vl(`rotation`,n.rotation,e=>r({rotation:e}),5),vl(`scale`,n.scale??[1,1,1],e=>r({scale:e}))]})]})}function Sl({st:e}){let t=e.doc,n=e.bone&&t.bones.some(t=>t.name===e.bone)?e.bone:t.bones[0]?.name??``,r=t.parts.filter(e=>e.bone===n);return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`h4`,{children:[`Parts `,(0,Z.jsxs)(`span`,{className:`dim`,children:[`(`,t.parts.length,`)`]})]}),(0,Z.jsx)(`div`,{className:`ed-row`,children:(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`on bone`}),(0,Z.jsx)(`select`,{value:n,onChange:t=>e.setBone(t.target.value),children:t.bones.map(e=>(0,Z.jsx)(`option`,{value:e.name,children:e.name},e.name))})]})}),r.map(t=>(0,Z.jsx)(wl,{st:e,part:t},t.id)),(0,Z.jsx)(`button`,{disabled:!n,onClick:()=>e.update(e=>({...e,parts:[...e.parts,{id:Be(),name:`part`,bone:n,geometry:{type:`box`,params:zt(`box`)},color:{role:`cloth`},position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}]})),children:`+ Add part`})]})}function Cl({st:e}){let t=e.doc,n=t=>e.update(e=>({...e,...t})),r=(t,n)=>e.update(e=>({...e,limbs:e.limbs.map(e=>e.bone===t?{...e,...n}:e)})),i=t.ridePose??{},a=Object.keys(i);return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(`p`,{className:`ed-hint`,children:`Authored clips (idle/run/attack) are keyframed in the timeline below.`}),(0,Z.jsx)(`h4`,{children:`Playback`}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`anim`}),(0,Z.jsxs)(`select`,{value:e.anim,onChange:t=>e.setAnim(t.target.value),children:[(0,Z.jsx)(`option`,{value:`idle`,children:`idle`}),(0,Z.jsx)(`option`,{value:`run`,children:`run`})]})]}),(0,Z.jsx)(`button`,{onClick:e.attack,children:`Attack`}),(0,Z.jsxs)(`label`,{className:`efx-check`,title:`Apply the mount ride pose to the preview`,children:[(0,Z.jsx)(`input`,{type:`checkbox`,checked:e.ridePose,onChange:t=>e.setRidePose(t.target.checked)}),`ride pose`]})]}),(0,Z.jsxs)(`h4`,{children:[`Locomotion limbs `,(0,Z.jsxs)(`span`,{className:`dim`,children:[`(`,t.limbs.length,`)`]})]}),(0,Z.jsx)(`div`,{className:`ed-hint`,children:`Swing during run — phase 0/1 alternate; amplitude 0 + flex makes a one-way joint (knee/elbow).`}),t.limbs.map(n=>(0,Z.jsxs)(`div`,{className:`efx-burst`,children:[(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`select`,{"aria-label":`Limb bone`,value:n.bone,onChange:t=>e.update(e=>({...e,limbs:e.limbs.map(e=>e===n?{...e,bone:t.target.value}:e)})),children:t.bones.map(e=>(0,Z.jsx)(`option`,{value:e.name,children:e.name},e.name))}),(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`phase`}),(0,Z.jsxs)(`select`,{value:n.phase,onChange:e=>r(n.bone,{phase:+e.target.value}),children:[(0,Z.jsx)(`option`,{value:0,children:`0`}),(0,Z.jsx)(`option`,{value:1,children:`1`})]})]}),(0,Z.jsx)(`button`,{className:`efx-del`,"aria-label":`Remove limb`,onClick:()=>e.update(e=>({...e,limbs:e.limbs.filter(e=>e!==n)})),children:`×`})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[_l(`swing°`,n.amplitude??27,e=>r(n.bone,{amplitude:e}),1),_l(`flex°`,n.flex??0,e=>r(n.bone,{flex:e||void 0}),1),(0,Z.jsxs)(`label`,{className:`efx-field`,title:`+1 bends backward (knee), −1 bends forward (elbow)`,children:[(0,Z.jsx)(`span`,{children:`flex dir`}),(0,Z.jsxs)(`select`,{value:n.flexSign??1,onChange:e=>r(n.bone,{flexSign:+e.target.value==-1?-1:1}),children:[(0,Z.jsx)(`option`,{value:1,children:`knee +1`}),(0,Z.jsx)(`option`,{value:-1,children:`elbow −1`})]})]})]})]},n.bone)),(0,Z.jsx)(`button`,{onClick:()=>{let e=t.bones.find(e=>!t.limbs.some(t=>t.bone===e.name));e&&n({limbs:[...t.limbs,{bone:e.name,phase:0}]})},children:`+ Add limb`}),t.model&&(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(`h4`,{children:`Model clips`}),(0,Z.jsx)(`div`,{className:`ed-row`,children:[`idle`,`run`,`attack`].map(e=>(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:e}),(0,Z.jsx)(`input`,{value:t.model.clips[e]??``,placeholder:`—`,onChange:r=>n({model:{...t.model,clips:{...t.model.clips,[e]:r.target.value||void 0}}})})]},e))})]}),(0,Z.jsxs)(`h4`,{children:[`Ride pose `,(0,Z.jsxs)(`span`,{className:`dim`,children:[`(`,a.length,`)`]})]}),(0,Z.jsx)(`div`,{className:`ed-hint`,children:`Bone rotations (deg) applied to a rider when this rig is a mount — toggle "ride pose" to preview.`}),a.map(e=>(0,Z.jsxs)(`div`,{className:`efx-burst`,children:[(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`select`,{value:e,onChange:t=>{let r={...i};r[t.target.value]=r[e],delete r[e],n({ridePose:r})},children:[e,...t.bones.map(e=>e.name).filter(t=>t!==e&&!i[t])].map(e=>(0,Z.jsx)(`option`,{value:e,children:e},e))}),(0,Z.jsx)(`button`,{className:`efx-del`,"aria-label":`Remove pose entry`,onClick:()=>{let t={...i};delete t[e],n({ridePose:Object.keys(t).length?t:void 0})},children:`×`})]}),vl(`rotation`,i[e],t=>n({ridePose:{...i,[e]:t}}),5)]},e)),(0,Z.jsx)(`button`,{onClick:()=>{let e=t.bones.find(e=>!i[e.name]);e&&n({ridePose:{...i,[e.name]:[0,0,0]}})},children:`+ Add pose bone`})]})}function wl({st:e,part:t}){let n=n=>e.update(e=>({...e,parts:e.parts.map(e=>e.id===t.id?{...e,...n}:e)})),r=Object.entries(t.when??{}).map(([e,t])=>`${e}:${t}`).join(` `);return(0,Z.jsxs)(`div`,{className:`efx-burst`,children:[(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`input`,{"aria-label":`Part name`,value:t.name,onChange:e=>n({name:e.target.value})}),(0,Z.jsx)(`select`,{"aria-label":`Geometry`,value:t.geometry.type,onChange:e=>{let t=e.target.value;n({geometry:{type:t,params:zt(t)}})},children:vn.map(e=>(0,Z.jsx)(`option`,{value:e,children:e},e))}),(0,Z.jsx)(`button`,{className:`efx-del`,"aria-label":`Remove part`,onClick:()=>e.update(e=>({...e,parts:e.parts.filter(e=>e.id!==t.id)})),children:`×`})]}),(0,Z.jsxs)(`div`,{className:`ed-row sc-vec`,children:[(0,Z.jsx)(`span`,{className:`sc-vec-label`,children:`geom`}),t.geometry.params.map((e,r)=>(0,Z.jsx)(`input`,{type:`number`,"aria-label":`param ${r}`,step:.05,value:e,onChange:e=>{let i=[...t.geometry.params];i[r]=+e.target.value||0,n({geometry:{...t.geometry,params:i}})}},r))]}),yl(t.color,e=>n({color:e})),vl(`position`,t.position,e=>n({position:e})),vl(`rotation`,t.rotation,e=>n({rotation:e}),5),vl(`scale`,t.scale,e=>n({scale:e})),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsxs)(`label`,{className:`efx-field`,title:`Appearance conditions, e.g. 'horns:* ears:long' — empty = always shown`,children:[(0,Z.jsx)(`span`,{children:`when`}),(0,Z.jsx)(`input`,{value:r,placeholder:`always`,onChange:e=>{let t={};for(let n of e.target.value.trim().split(/\s+/).filter(Boolean)){let[e,r=`*`]=n.split(`:`);t[e]=r}n({when:Object.keys(t).length?t:void 0})}})]}),_l(`glow`,t.emissive??0,e=>n({emissive:e||void 0}),.1)]})]})}function Tl({st:e}){return e.doc?(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`sc-inspector-head`,children:[(0,Z.jsx)(`h3`,{children:e.doc.label}),(0,Z.jsx)(`button`,{className:`primary`,disabled:!e.dirty,onClick:()=>void e.save(),children:`Save`})]}),(0,Z.jsxs)(`div`,{className:`ed-panel sc-rig-panel`,children:[e.tab===`model`&&(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(bl,{st:e}),(0,Z.jsx)(Sl,{st:e})]}),e.tab===`skeleton`&&(0,Z.jsx)(xl,{st:e}),e.tab===`animation`&&(0,Z.jsx)(Cl,{st:e})]}),(0,Z.jsxs)(`div`,{className:`ed-statusbar sc-rig-status`,children:[(0,Z.jsx)(`span`,{className:e.dirty?`dirty`:`ed-ready`,children:`●`}),(0,Z.jsx)(`span`,{role:`status`,children:e.status||(e.dirty?`Unsaved changes`:`Ready`)})]})]}):(0,Z.jsx)(`div`,{className:`ed-hint`,children:`Loading rig…`})}var El=[`idle`,`run`,`attack`],Dl=[`rotation`,`position`,`scale`],Ol={rotation:`rot`,position:`pos`,scale:`scl`},kl=176;function Al({st:e}){let t=e.doc,n=t.anims?.[e.clip],[r,i]=(0,J.useState)(null),[a,o]=(0,J.useState)(``),[s,c]=(0,J.useState)(160),l=(0,J.useRef)(null),u=(0,J.useRef)(null),d=(0,J.useRef)(s);d.current=s;let f=(0,J.useRef)(1),p=n?Math.max(0,...n.tracks.flatMap(e=>e.keys.map(e=>e.t))):0,m=n?.duration??0,h=Math.max(Math.max(m,p)+.5,1);f.current=m;let g=h*s;(0,J.useEffect)(()=>(e.tlTick(e=>{l.current&&(l.current.style.left=`${kl+e*d.current}px`),u.current&&(u.current.textContent=`${e.toFixed(2)}s / ${f.current.toFixed(2)}s`)}),()=>e.tlTick(null)),[e]),(0,J.useEffect)(()=>{e.tlSetTime(e.tlGetTime())},[s,e]);let _=(t,n,r)=>e.setClipTracks(e.clip,e=>e.map(e=>e.bone===t&&e.channel===n?{...e,keys:r}:e)),v=(t,a,o,s)=>{let c=[...n?.tracks.find(e=>e.bone===t&&e.channel===a)?.keys??[]],l={...c[o],...s};c[o]=l;let u=c.sort((e,t)=>e.t-t.t);_(t,a,u);let d=u[u.length-1]?.t??0;d>m&&e.setClipProp(e.clip,{duration:Math.ceil(d*20)/20});let f=u.indexOf(l);return r?.bone===t&&r.channel===a&&r.idx===o&&i({bone:t,channel:a,idx:f}),f},y=(e,t,r)=>{_(e,t,(n?.tracks.find(n=>n.bone===e&&n.channel===t)?.keys??[]).filter((e,t)=>t!==r)),i(null)},b=(t,n)=>e.setClipTracks(e.clip,e=>e.some(e=>e.bone===t&&e.channel===n)?e:[...e,{bone:t,channel:n,keys:[]}]),x=t=>e.setClipTracks(e.clip,e=>e.filter(e=>e.bone!==t)),S=n?[...new Set(n.tracks.map(e=>e.bone))]:[],C=r?n?.tracks.find(e=>e.bone===r.bone&&e.channel===r.channel)?.keys[r.idx]:void 0;return(0,Z.jsxs)(`div`,{className:`ed-animdock`,children:[(0,Z.jsxs)(`div`,{className:`ed-dock-title`,children:[(0,Z.jsx)(`span`,{className:`ed-scene-tab`,children:`Timeline`}),(0,Z.jsx)(`span`,{children:t.label||e.rigId})]}),(0,Z.jsxs)(`div`,{className:`ed-animdock-tools`,children:[(0,Z.jsx)(`div`,{className:`sc-tools`,role:`tablist`,"aria-label":`Clip`,children:El.map(n=>(0,Z.jsxs)(`button`,{role:`tab`,"aria-selected":e.clip===n,className:e.clip===n?`active`:``,onClick:()=>{e.setClip(n),i(null)},children:[n,t.anims?.[n]?` ●`:``]},n))}),n?(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(`button`,{onClick:()=>{confirm(`Delete the ${e.clip} clip?`)&&(e.deleteClip(e.clip),i(null))},children:`Delete`}),(0,Z.jsx)(`span`,{className:`ed-tl-sep`}),(0,Z.jsx)(`button`,{onClick:()=>e.setTlPlaying(!e.tlPlaying),children:e.tlPlaying?`⏸`:`▶`}),(0,Z.jsx)(`button`,{onClick:()=>{e.setTlPlaying(!1),e.tlSetTime(0)},children:`■`}),(0,Z.jsx)(`span`,{className:`ed-hint`,ref:u,children:`0.00s`}),(0,Z.jsx)(`span`,{className:`ed-tl-sep`}),(0,Z.jsx)(`label`,{children:`dur`}),(0,Z.jsx)(`input`,{type:`number`,min:.05,step:.1,value:m,onChange:t=>e.setClipProp(e.clip,{duration:Math.max(.05,+t.target.value||1)})}),(0,Z.jsxs)(`label`,{className:`ed-tl-check`,children:[(0,Z.jsx)(`input`,{type:`checkbox`,checked:n.loop,onChange:t=>e.setClipProp(e.clip,{loop:t.target.checked})}),`loop`]}),(0,Z.jsx)(`span`,{className:`ed-tl-sep`}),(0,Z.jsx)(`button`,{disabled:!e.bone,title:e.bone?`Key ${e.bone}'s pose at the playhead (all its tracks)`:`Click a track row to select its bone`,onClick:()=>e.recordBone(e.bone),children:`◆ key`})]}):(0,Z.jsxs)(`button`,{className:`primary`,onClick:()=>e.createClip(e.clip),children:[`+ create `,e.clip,` clip`]}),(0,Z.jsx)(`span`,{className:`spacer`}),(0,Z.jsx)(`button`,{onClick:()=>c(e=>Math.max(40,e/1.4)),title:`zoom out`,children:`−`}),(0,Z.jsx)(`button`,{onClick:()=>c(e=>Math.min(800,e*1.4)),title:`zoom in`,children:`+`})]}),n&&(0,Z.jsxs)(`div`,{className:`ed-animdock-tools`,children:[(0,Z.jsxs)(`select`,{value:a,onChange:e=>o(e.target.value),children:[(0,Z.jsx)(`option`,{value:``,children:`+ track for bone…`}),t.bones.filter(e=>!n.tracks.some(t=>t.bone===e.name&&t.channel===`rotation`)).map(e=>(0,Z.jsx)(`option`,{value:e.name,children:e.name},e.name))]}),(0,Z.jsx)(`button`,{disabled:!a,onClick:()=>{b(a,`rotation`),e.setBone(a),o(``)},children:`Add track`}),r&&C&&(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(`span`,{className:`ed-tl-sep`}),(0,Z.jsxs)(`span`,{className:`ed-tl-keylabel`,children:[r.bone,` · `,Ol[r.channel]]}),(0,Z.jsx)(`label`,{children:`t`}),(0,Z.jsx)(`input`,{type:`number`,step:.01,value:C.t,onChange:e=>v(r.bone,r.channel,r.idx,{t:Math.max(0,+e.target.value)})}),[`x`,`y`,`z`].map((e,t)=>(0,Z.jsxs)(`span`,{style:{display:`inline-flex`,alignItems:`center`,gap:3},children:[(0,Z.jsx)(`label`,{children:e}),(0,Z.jsx)(`input`,{type:`number`,step:r.channel===`rotation`?1:.05,value:C.value[t],onChange:e=>v(r.bone,r.channel,r.idx,{value:C.value.map((n,r)=>r===t?+e.target.value:n)})})]},e)),(0,Z.jsx)(`button`,{onClick:()=>y(r.bone,r.channel,r.idx),children:`del key`})]})]}),n?(0,Z.jsx)(jl,{clip:n,bonesInClip:S,tlDur:h,tlW:g,pxPerSec:s,selBone:e.bone,selKey:r,onSelKey:i,onSelectBone:e.setBone,onScrub:t=>{e.setTlPlaying(!1),e.tlSetTime(t)},onAddKey:(t,n)=>e.recordBone(t,n),onEditKey:v,onRemoveTrack:x,playheadRef:l}):(0,Z.jsxs)(`div`,{className:`ed-animdock-empty ed-hint`,children:[`No `,e.clip,` clip yet — create one, then drag a bone with the gizmo or press ◆ key to record keys at the playhead.`]})]})}function jl({clip:e,bonesInClip:t,tlDur:n,tlW:r,pxPerSec:i,selBone:a,selKey:o,onSelKey:s,onSelectBone:c,onScrub:l,onAddKey:u,onEditKey:d,onRemoveTrack:f,playheadRef:p}){let m=i*.5>=56?.5:1,h=[];for(let e=0;e<=n+1e-6;e+=.1)h.push(Math.round(e*10)/10);let g=(e,t)=>{let r=t.getBoundingClientRect();l(Math.max(0,Math.min(n,(e.clientX-r.left)/i)))},_=e=>{let t=e.currentTarget;g(e,t);let n=e=>g(e,t),r=()=>{window.removeEventListener(`pointermove`,n),window.removeEventListener(`pointerup`,r)};window.addEventListener(`pointermove`,n),window.addEventListener(`pointerup`,r)},v=(e,t,r,a)=>{e.stopPropagation(),s({bone:t,channel:r,idx:a}),c(t);let o=e.currentTarget.parentElement,l=a,u=e=>{let a=o.getBoundingClientRect(),s=Math.max(0,Math.min(n,(e.clientX-a.left)/i));l=d(t,r,l,{t:Math.round(s*100)/100})},f=()=>{window.removeEventListener(`pointermove`,u),window.removeEventListener(`pointerup`,f)};window.addEventListener(`pointermove`,u),window.addEventListener(`pointerup`,f)},y=(t,n)=>e.tracks.find(e=>e.bone===t&&e.channel===n),b=(e,t,n)=>{let s=y(e,t)?.keys??[],l=o?.bone===e&&o.channel===t?o.idx:-1;return(0,Z.jsxs)(`div`,{className:`ed-tl-row`,children:[(0,Z.jsxs)(`div`,{className:`ed-tl-label`,children:[n?(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(`strong`,{className:e===a?`sel`:void 0,onClick:()=>c(e),children:e}),(0,Z.jsx)(`button`,{className:`ed-tl-x`,title:`remove all tracks for this bone`,onClick:()=>f(e),children:`×`})]}):(0,Z.jsx)(`span`,{className:`ed-tl-spacer`}),(0,Z.jsx)(`span`,{className:`ed-tl-chan`,children:Ol[t]}),(0,Z.jsx)(`button`,{className:`ed-tl-addkey`,title:`key this channel at the playhead`,onClick:()=>u(e,t),children:`◆+`})]}),(0,Z.jsx)(`div`,{className:`ed-tl-lane`,style:{width:r},children:s.map((n,r)=>(0,Z.jsx)(`div`,{className:`ed-tl-key ${r===l?`sel`:``}`,style:{left:n.t*i},title:`${n.t.toFixed(2)}s`,onPointerDown:n=>v(n,e,t,r)},r))})]},`${e}.${t}`)};return(0,Z.jsx)(`div`,{className:`ed-tl-scroll`,children:(0,Z.jsxs)(`div`,{className:`ed-tl`,style:{width:kl+r},children:[(0,Z.jsxs)(`div`,{className:`ed-tl-row ed-tl-ruler`,children:[(0,Z.jsx)(`div`,{className:`ed-tl-label`,children:(0,Z.jsxs)(`span`,{className:`ed-hint`,children:[e.duration.toFixed(2),`s`,e.loop?` ⟳`:``]})}),(0,Z.jsx)(`div`,{className:`ed-tl-lane`,style:{width:r},onPointerDown:_,children:h.map(e=>(0,Z.jsx)(`div`,{className:`ed-tl-tick`,style:{left:e*i},children:e%m<1e-6&&(0,Z.jsx)(`span`,{children:e.toFixed(1)})},e))})]}),t.map(e=>Dl.filter(t=>y(e,t)).map((t,n)=>b(e,t,n===0))),(0,Z.jsx)(`div`,{className:`ed-tl-playhead`,ref:p})]})})}var Ml=1/32,Nl=Math.PI*2,Pl=new Map,Fl=(e,t,n)=>{let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)};function Il(e,t,n){let r=Math.hypot(t,n);switch(e){case`orb`:return Fl(1,.55,r);case`glow`:return Math.max(0,1-r)**2*.9;case`spark`:{let e=0;for(let i of[0,Math.PI/2,Math.PI/4,-Math.PI/4]){let a=Math.abs(t*Math.sin(i)-n*Math.cos(i));e=Math.max(e,Math.max(0,1-a/.14)*Math.max(0,1-r*1.05))}return e}case`smoke`:return Math.max(0,1-r)**1.4*.6;case`shard`:{let e=.65,r=.6,i=-.6,a=.5,o=Math.min(Math.abs((t-0)*1.6-(n- -1)*.65)/Math.hypot(.65,1.6),Math.abs((t-e)*-.09999999999999998-(n-r)*-1.25)/Math.hypot(-1.25,-.09999999999999998),Math.abs((t-i)*-1.5-(n-a)*.6)/Math.hypot(.6,-1.5));return Math.sign((t-0)*1.6-(n- -1)*.65)*Math.sign((t-e)*-.09999999999999998-(n-r)*-1.25)*Math.sign((t-i)*-1.5-(n-a)*.6)>0?1:Fl(.06,0,o)}case`streak`:return Math.max(0,1-Math.hypot(t,n/.22))**.8;case`ember`:return Math.max(0,1-Math.hypot(t/.55,(n+.1)/.75))**.9;case`droplet`:return Math.max(0,1-Math.hypot(t/.5,n/.8))**.9;case`stone`:return+(r<.62*(1+.18*Math.sin(5*Math.atan2(n,t)+1.3)));case`rune`:{let e=Math.abs(t)+Math.abs(n),r=Fl(.09,.03,Math.abs(e-.72));return Math.max(r,+(Math.abs(t)<.06&&Math.abs(n)<.42))}case`ring`:return Fl(.14,.05,Math.abs(r-.8));default:return Fl(1,.6,r)}}function Ll(e){let t=Pl.get(e);if(t)return t;let n=new Uint8Array(9216);for(let t=0;t<48;t++)for(let r=0;r<48;r++){let i=Math.round(255*Math.min(1,Math.max(0,Il(e,(r+.5)/48*2-1,(t+.5)/48*2-1)))),a=(t*48+r)*4;n[a]=n[a+1]=n[a+2]=255,n[a+3]=i}return t=new A(n,48,48),t.needsUpdate=!0,Pl.set(e,t),t}var Rl=(e,t=64)=>Math.max(1,Math.min(t,Math.round(e))),zl=e=>1-(1-e)**2,$=(e,t)=>e+Math.random()*(t-e),Bl=new R(0,1,0),Vl=class{group=new bn;tracks=[];timers=[];casts=new Set;clock=0;add(e,t,n,r){e.add(t),this.tracks.push({obj:t,age:0,life:Math.max(.05,n),update:r})}after(e,t){this.timers.push({at:this.clock+e/1e3,fn:t})}sprite(e,t,n,r=1){let i=new _t({map:Ll(e),color:t,transparent:!0,opacity:r,depthWrite:!1}),a=new St(i);return a.scale.setScalar(n*2*Ml),a}burst(e,t=10280688){this.spawnBurst({texture:`spark`,count:14,color:t,spread:30,size:3.5,alpha:.85,rise:!0,duration:520},e.clone().add(new R(0,.45,0))),this.spawnRing({color:t,alpha:.5,scale:4.5,duration:450},e.clone())}spawnBurst(e,t,n=new R){let r=Rl(e.count);for(let i=0;i<r;i++){let r=e.size*(.65+Math.random()*.65),i=this.sprite(e.texture,e.color,r,e.alpha??.9),a=Math.random()*Nl,o=(18+Math.random()*e.spread*1.4)*Ml,s=new R(Math.cos(a)*o+n.x*(10+Math.random()*e.spread)*Ml,(Math.random()-.35)*o*.9+n.y*o,Math.sin(a)*o+n.z*(10+Math.random()*e.spread)*Ml);e.rise&&(s.y+=(20+Math.random()*34)*Ml),s.y-=(e.gravity??0)*Ml,e.directional?i.material.rotation=Math.atan2(s.y,Math.hypot(s.x,s.z))+Math.atan2(s.z,s.x):i.material.rotation=Math.random()*180;let c=e.directional?0:(-90+Math.random()*180)*Math.PI/180,l=(e.duration??600)*(.6+Math.random()*.6)/1e3,u=e.texture===`smoke`?1.7:.18,d=t.clone(),f=e.alpha??.9;this.add(this.group,i,l,e=>{let t=zl(e);i.position.copy(d).addScaledVector(s,t),i.material.opacity=f*(1-e),i.material.rotation+=c*.016,i.scale.setScalar(r*2*Ml*(1+(u-1)*t))})}}spawnRing(e,t){let n=new d(new ct(.86,1,48),new De({color:e.color,transparent:!0,opacity:e.alpha,side:2,depthWrite:!1}));n.rotation.x=-Math.PI/2,n.position.copy(t).add(new R(0,.12,0));let r=12*Ml,i=e.duration/1e3;this.add(this.group,n,i,t=>{n.scale.setScalar(r*(1+(e.scale-1)*zl(t))),n.material.opacity=e.alpha*(1-t)})}spawnFlash(e,t){let n=this.sprite(`glow`,e.color,20,e.alpha);n.position.copy(t),this.add(this.group,n,.17,t=>{n.scale.setScalar(40*Ml*(1+(e.scale-1)*zl(t))),n.material.opacity=e.alpha*(1-t)})}spawnCircle(e,t){let n=Rl(e.count,24),r=new bn;r.position.copy(t).add(new R(0,.1,0));let i=[];for(let t=0;t<n;t++){let t=this.sprite(e.texture,e.color,e.size,e.alpha??.75);r.add(t),i.push(t)}let a=(e.duration??900)/1e3,o=(e.spinRate??150)*Math.PI/180,s=0,c=e.alpha??.75;if(this.add(this.group,r,a,(a,l)=>{s+=o*l;let u=(e.radius+(e.expand??0)*a)*Ml;for(let e=0;e<n;e++){let t=s+e/n*Nl;i[e].position.set(Math.cos(t)*u,0,Math.sin(t)*u)}e.rise&&(r.position.y=t.y+.1+e.rise*Ml*zl(a));let d=a<.18?a/.18:1-Math.max(0,(a-.62)/.38);for(let e of i)e.material.opacity=c*d}),e.emit){let n=e.emit,r=e.radius*Ml,i=Math.max(0,Math.floor(a/.2)-1);for(let e=0;e<i;e++)this.after(e*200+200,()=>{for(let e=0;e<Rl(n.count,12);e++){let e=Math.random()*Nl;this.spawnStreamParticle(n,new R(t.x+Math.cos(e)*r,t.y+.1,t.z+Math.sin(e)*r))}})}}spawnStreamParticle(e,t,n=this.group){let r=e.size*(.7+Math.random()*.6),i=this.sprite(e.texture,e.color,r,e.alpha??.85),a=(e.life??700)*(.7+Math.random()*.6)/1e3,o=(e.fall?-1:1)*e.height*Ml*(.75+Math.random()*.5),s=(e.sway??0)*Ml,c=Math.random()*Nl,l=new V(e.color),u=new V(e.colorEnd??e.color),d=e.alpha??.85,f=t.clone();this.add(n,i,a,t=>{let n=e.fall?t*t:1-(1-t)**2;i.position.set(f.x+Math.sin(c+t*Math.PI*1.5)*s*(1-t),f.y+o*n,f.z+Math.cos(c*1.7+t*Math.PI)*s*.6*(1-t)),i.material.opacity=d*(1-t),i.material.color.lerpColors(l,u,t),i.scale.setScalar(r*2*Ml*(1-.6*t))})}spawnStream(e,t){let n=Rl(e.count),r=e.duration??800;for(let i=0;i<n;i++){let a=new R((Math.random()*2-1)*e.width*Ml,0,(Math.random()*2-1)*e.width*Ml);this.after(i/n*r,()=>this.spawnStreamParticle(e,t.clone().add(a)))}}spawnProjectile(e,t,n,r){let i=Rl(e.count??1,8),a=!1,o=()=>{a||(a=!0,r?.())},s=t.clone().add(new R(0,1.1,0)),c=n.clone().add(new R(0,.8,0)),l=new R().subVectors(c,s);l.y=0;let u=Math.max(1e-4,Math.hypot(l.x,l.z)),d=new R(-l.z/u,0,l.x/u);for(let t=0;t<i;t++){let n=i>1?(t-(i-1)/2)*14*Ml:0,r=c.clone().addScaledVector(d,n),a=s.distanceTo(r)/Ml,l=(e.duration??240)*Math.max(.5,a/140)/1e3,f=(Math.random()*2-1)*(e.curve??0)*Ml;this.after(t*45,()=>{let t=this.sprite(e.texture,e.color,e.size,1),n=(e.spin??0)*Math.PI/180,i=Rl(e.trail??0,16);for(let n=0;n<i;n++)this.after((n+1)/(i+1)*l*1e3,()=>{let n=this.sprite(`orb`,e.trailColor??e.color,e.size*.45,.5);n.position.copy(t.position),this.add(this.group,n,.22,t=>{n.material.opacity=.5*(1-t),n.scale.setScalar(e.size*.45*2*Ml*(1-.7*t))})});this.add(this.group,t,l+.05,(i,a)=>{let c=Math.min(1,i*(l+.05)/l),p=f*Math.sin(Math.PI*c);t.position.lerpVectors(s,r,c).addScaledVector(d,p),t.position.y+=(e.arc??0)*Ml*4*c*(1-c),n?t.material.rotation+=n*a:t.material.rotation=Math.atan2(-(r.y-s.y),u)*.3,c>=1&&o()})})}this.after((e.duration??240)*2+i*45+300,o)}playImpact(e,t,n=new R){let r=t.clone().add(new R(0,.9,0));for(let t of e.bursts)this.spawnBurst(t,r,n);e.flash&&this.spawnFlash(e.flash,r),e.ring&&this.spawnRing(e.ring,t),e.circle&&this.spawnCircle(e.circle,t),e.stream&&this.spawnStream(e.stream,t.clone().add(new R(0,.15,0)))}playProfile(e,t,n){let r=()=>this.playImpact(e,t,n&&t.clone().sub(n).setY(0).normalize().multiplyScalar(.28));e.projectile&&n&&n.distanceTo(t)>.5?this.spawnProjectile(e.projectile,n,t,r):r()}playCategory(e,t,n,r){let i=ot[e],a=n?t.clone().sub(n).setY(0).normalize().multiplyScalar(.28):void 0,o=()=>this.elementalImpact(e,i,t,r,a);i.projectile&&n&&n.distanceTo(t)>.5?this.spawnProjectile(i.projectile,n,t,o):o()}basicMat(e,t){return new De({color:e,transparent:!0,opacity:t,depthWrite:!1,side:2})}boltSegment(e,t,n,r){let i=e.distanceTo(t),a=new d(new S(n,n,i,5,1,!0),r);return a.position.copy(e).lerp(t,.5),a.quaternion.setFromUnitVectors(Bl,t.clone().sub(e).normalize()),a}elementalImpact(e,t,n,r,i){let a=n.clone().add(new R(0,.9,0));switch(e){case`fire`:t.flash&&this.spawnFlash(t.flash,a),this.spawnBurst({texture:`ember`,count:18,color:16751151,spread:40,size:6,alpha:.95,rise:!0,duration:480},a,i),this.fxIgnite(n,r,t.stream);return;case`ice`:t.flash&&this.spawnFlash(t.flash,a),this.spawnBurst({texture:`shard`,count:16,color:12316415,spread:40,size:6,alpha:.9,duration:600},a,i),this.fxIceCrystals(n);return;case`thunder`:this.fxLightning(n,t.flash);return;case`wind`:this.spawnBurst({texture:`smoke`,count:8,color:10407864,spread:30,size:7,alpha:.3,rise:!0,duration:700},n.clone().add(new R(0,.15,0))),this.fxTornado(n);return;case`earth`:this.spawnBurst({texture:`smoke`,count:14,color:6115398,spread:42,size:8,alpha:.34,duration:800},n.clone().add(new R(0,.25,0))),this.fxStoneSpikes(n);return;case`water`:this.fxGeyser(n);return;case`holy`:this.fxHolyPillar(n),t.circle&&this.spawnCircle(t.circle,n);return;case`dark`:this.fxDarkMaw(n),t.stream&&this.spawnStream(t.stream,n.clone().add(new R(0,.15,0)));return;case`poison`:this.fxPoison(n),t.stream&&this.spawnStream(t.stream,n.clone().add(new R(0,.15,0)));return;default:this.playImpact(t,n,i??new R)}}fxIgnite(e,t,n){let r=new bn,i=new Et(16742195,0,4.5);r.add(i);let a=t??this.group;t?r.position.y=.6:r.position.copy(e).y+=.6;let o=n??{texture:`ember`,count:3,color:16751151,colorEnd:6232096,width:14,height:44,size:5,alpha:.9,life:700,sway:7},s={texture:`smoke`,count:1,color:3810088,width:12,height:34,size:8,alpha:.3,life:900,sway:6},c=new R,l=0;this.add(a,r,1.8,(e,t)=>{l+=t,r.getWorldPosition(c);let n=e<.72;for(i.intensity=n?(5+Math.sin(this.clock*43)*1.6+Math.random()*1.2)*(1-e/.72):0;l>=.055&&n;){l-=.055;let e=Rl(o.count,4);for(let t=0;t<e;t++){let e=new R($(-1,1)*o.width*Ml,$(0,.5),$(-1,1)*o.width*Ml);this.spawnStreamParticle(o,c.clone().add(e))}Math.random()<.4&&this.spawnStreamParticle(s,c.clone().add(new R($(-.2,.2),1,$(-.2,.2))))}n||(l=0)})}fxLightning(e,t){let n=(e,t,n,r,i)=>{let a=[];for(let n=0;n<=8;n++){let r=n/8,i=e.clone().lerp(t,r);n>0&&n<8&&(i.x+=$(-.4,.4)*(1-r*.4),i.z+=$(-.4,.4)*(1-r*.4)),a.push(i)}let o=new bn,s=this.basicMat(16776168,1),c=this.basicMat(10134271,.45);for(let e=0;e<8;e++)o.add(this.boltSegment(a[e],a[e+1],n,s)),o.add(this.boltSegment(a[e],a[e+1],r,c));this.add(this.group,o,i,e=>{let t=e<.55?Math.random()>.3?1:.45:1-(e-.55)/.45;s.opacity=t,c.opacity=.45*t})},r=e.clone().add(new R($(-.9,.9),7,$(-.9,.9))),i=e.clone().add(new R(0,1.15,0));n(r,i,.028,.085,.34),this.after(70,()=>n(r.clone().add(new R($(-1.4,1.4),.4,$(-1.4,1.4))),i,.02,.06,.26));let a=new Et(13426175,9,9);a.position.copy(i),this.add(this.group,a,.3,e=>{a.intensity=9*(1-e)}),this.spawnFlash({color:16777164,alpha:t?.alpha??.3,scale:(t?.scale??3.8)*1.2},i),this.spawnRing({color:10134271,alpha:.5,scale:6,duration:420},e),this.spawnBurst({texture:`spark`,count:16,color:16777096,spread:40,size:3.5,alpha:.95,rise:!0,duration:400},i),this.spawnBurst({texture:`smoke`,count:8,color:3814736,spread:26,size:7,alpha:.3,rise:!0,duration:650},e.clone().add(new R(0,.2,0)))}fxTornado(e){let t=new bn;t.position.copy(e);let n=new d(new S(.85,.12,2.3,20,1,!0),this.basicMat(14286816,.13));n.position.y=1.2,t.add(n);let r=[];for(let e=0;e<16;e++){let e=$(.05,2.2),n=this.sprite(`streak`,Math.random()<.6?11206570:15794150,$(4,7),.7);n.material.rotation=$(0,Nl),r.push({s:n,h:e,phase:$(0,Nl),r:.2+e/2.2*.62,speed:$(.8,1.4)}),t.add(n)}let i=0;this.add(this.group,t,1.15,(e,t)=>{i+=11*t;for(let e of r){let t=i*e.speed+e.phase,n=e.r*(.75+.25*Math.sin(this.clock*9+e.phase));e.s.position.set(Math.cos(t)*n,e.h+Math.sin(this.clock*6+e.phase)*.06,Math.sin(t)*n)}let a=Math.min(e/.18,1)*(1-Math.max(0,(e-.6)/.4));n.material.opacity=.13*a,n.rotation.y=-i*.6,n.scale.set(1+Math.sin(this.clock*12)*.06,1,1+Math.cos(this.clock*12)*.06);for(let e of r)e.s.material.opacity=.7*a})}fxIceCrystals(e){let t=new bn;t.position.copy(e);let n=[],r=[14220287,12316415,9426175];for(let e=0;e<8;e++){let i=$(.35,.8),a=new d(new l($(.07,.13),i,5),this.basicMat(r[e%r.length],.88)),o=$(0,Nl),s=e<5?$(.28,.55):$(.05,.2);a.position.set(Math.cos(o)*s,i*.5-.02,Math.sin(o)*s),e>=5&&(a.position.y=$(.7,1.3)),a.rotation.set($(-.4,.4),$(0,Nl),$(-.4,.4)),a.scale.setScalar(.01),t.add(a),n.push(a)}let i=new Et(10475775,2.5,3);i.position.y=.8,t.add(i),this.add(this.group,t,1.5,e=>{let t=zl(Math.min(1,e/.22)),r=e<.72?1:1-(e-.72)/.28;for(let e of n)e.scale.setScalar(Math.max(.001,t*r));i.intensity=2.5*t*r;for(let e of n)e.material.opacity=.88*r}),this.spawnBurst({texture:`spark`,count:12,color:16777215,spread:26,size:2.5,alpha:.9,duration:450},e.clone().add(new R(0,.8,0)))}fxStoneSpikes(e){let t=new bn;t.position.copy(e);let n=[],r=[9071178,8017463,10123344];for(let e=0;e<7;e++){let i=$(.5,1),a=new d(new l($(.1,.17),i,6),new Ae({color:r[e%r.length]})),o=e/7*Nl+$(-.3,.3),s=$(.12,.55);a.position.set(Math.cos(o)*s,-i,Math.sin(o)*s),a.rotation.set($(-.25,.25),$(0,Nl),$(-.25,.25)),t.add(a),n.push({m:a,h:i,delay:e*.035})}this.add(this.group,t,1.25,e=>{for(let{m:t,h:r,delay:i}of n){let n=Math.max(0,Math.min(1,(e*1.25-i)/(1.25-i))),a=zl(Math.min(1,n/.18)),o=n<.72?0:zl((n-.72)/.28);t.position.y=-r+r*(a-o)+r*.06}}),this.spawnBurst({texture:`stone`,count:14,color:10119749,spread:34,size:5.5,alpha:.9,gravity:22,duration:600},e.clone().add(new R(0,.3,0))),this.spawnRing({color:9071178,alpha:.4,scale:5,duration:500},e)}fxGeyser(e){let t=new bn;t.position.copy(e);let n=new d(new S(.3,.42,1.7,14,1,!0),this.basicMat(8115455,.34));n.position.y=.85,t.add(n),this.add(this.group,t,.85,e=>{let t=zl(Math.min(1,e/.25)),r=e<.6?1:1-(e-.6)/.4;n.scale.set(1+e*.4,t*r,1+e*.4),n.position.y=.85*n.scale.y+.05,n.material.opacity=.34*r}),this.spawnBurst({texture:`droplet`,count:22,color:4500223,spread:30,size:5,alpha:.9,rise:!0,duration:650},e.clone().add(new R(0,.4,0))),this.spawnRing({color:8115455,alpha:.45,scale:5.5,duration:480},e),this.spawnStream({texture:`droplet`,count:12,color:8115455,colorEnd:2395647,width:20,height:30,size:3.5,alpha:.85,duration:700,life:480,sway:2,fall:!0},e.clone().add(new R(0,1.5,0)))}fxHolyPillar(e){let t=new d(new S(.24,.4,3.6,16,1,!0),this.basicMat(16777164,.5));t.position.copy(e).add(new R(0,1.8,0));let n=new Et(16773816,5,6);n.position.copy(e).add(new R(0,1.4,0));let r=new bn;r.add(t,n),this.add(this.group,r,.8,e=>{let r=e<.2?e/.2:1-(e-.2)/.8;t.material.opacity=.5*r,t.scale.set(1-e*.5,1,1-e*.5),n.intensity=5*r}),this.spawnStream({texture:`spark`,count:12,color:16777164,colorEnd:16768890,width:16,height:40,size:2.5,alpha:.9,duration:700,life:700,sway:5},e.clone().add(new R(0,.2,0)))}fxDarkMaw(e){let t=e.clone().add(new R(0,.95,0)),n=new d(new Qt(.7,18,14),this.basicMat(1311775,.82));n.position.copy(t),n.scale.setScalar(.05);let r=new Et(6697898,4,5);r.position.copy(t);let i=new bn;i.add(n,r),this.add(this.group,i,.85,e=>{let t=e<.3?zl(e/.3):e<.6?1:Math.max(.001,1-(e-.6)/.4);n.scale.setScalar(t),n.material.opacity=.82*Math.min(1,t+.3),r.intensity=4*t});for(let e=0;e<8;e++){let e=this.sprite(`streak`,11701503,$(5,8),.8),n=$(0,Nl),r=t.clone().add(new R(Math.cos(n)*$(.9,1.3),$(-.5,.6),Math.sin(n)*$(.9,1.3)));e.position.copy(r),e.material.rotation=Math.atan2(t.y-r.y,t.x-r.x);let i=$(0,.15);this.add(this.group,e,.5+i,n=>{let a=Math.max(0,(n-i*2)/(1-i*2));e.position.lerpVectors(r,t,zl(a)),e.material.opacity=.8*(1-a*a)})}}fxPoison(e){let t=new d(new O(.7,20),this.basicMat(2984520,.34));t.rotation.x=-Math.PI/2,t.position.copy(e).add(new R(0,.06,0)),this.add(this.group,t,1.3,e=>{let n=e<.15?e/.15:1-(e-.7)/.3;t.material.opacity=.34*n;let r=1+Math.sin(e*14)*.06+e*.3;t.scale.setScalar(r)}),this.spawnStream({texture:`orb`,count:14,color:6736964,colorEnd:13959024,width:16,height:34,size:4.5,alpha:.75,duration:900,life:800,sway:9},e.clone().add(new R(0,.1,0))),this.spawnBurst({texture:`smoke`,count:12,color:2249272,spread:36,size:8,alpha:.36,rise:!0,duration:850},e.clone().add(new R(0,.3,0)))}startCast(e,t){if(!e)return()=>void 0;let n=new bn;n.position.y=.08;let r=new bn;n.add(r);let i={root:n,ring:r,spin:(e.circle?.spinRate??150)*Math.PI/180,stream:e.stream,emit:e.circle?.emit,emitRadius:(e.circle?.radius??20)*Ml,next:this.clock};if(e.circle){let t=Rl(e.circle.count,24),n=e.circle.radius*Ml;for(let i=0;i<t;i++){let a=this.sprite(e.circle.texture,e.circle.color,e.circle.size,e.circle.alpha??.7),o=i/t*Nl;a.position.set(Math.cos(o)*n,0,Math.sin(o)*n),r.add(a)}}return t.add(n),this.casts.add(i),()=>{this.casts.delete(i),ps(n)}}startCastCategory(e,t){return this.startCast(ot[e]?.cast,t)}categoryColor(e){return i[e]}update(e){this.clock+=e;for(let e=this.timers.length-1;e>=0;e--)this.timers[e].at<=this.clock&&this.timers.splice(e,1)[0].fn();let t=new R;for(let n of this.casts)if(n.ring.rotation.y+=n.spin*e,this.clock>=n.next){if(n.next=this.clock+.25,n.root.getWorldPosition(t),n.emit&&n.emitRadius)for(let e=0;e<Rl(n.emit.count,12);e++){let e=Math.random()*Nl;this.spawnStreamParticle(n.emit,new R(t.x+Math.cos(e)*n.emitRadius,t.y,t.z+Math.sin(e)*n.emitRadius))}if(n.stream)for(let e=0;e<Rl(n.stream.count,12);e++){let e=new R((Math.random()*2-1)*n.stream.width*Ml,0,(Math.random()*2-1)*n.stream.width*Ml);this.spawnStreamParticle(n.stream,t.clone().add(e))}}for(let t=this.tracks.length-1;t>=0;t--){let n=this.tracks[t];n.age+=e;let r=Math.min(1,n.age/n.life);n.update(r,e),n.age>=n.life&&(ps(n.obj),this.tracks.splice(t,1))}}dispose(){for(let e of this.tracks)ps(e.obj);for(let e of this.casts)ps(e.root);this.tracks=[],this.timers=[],this.casts.clear(),this.group.removeFromParent()}},Hl=-1.7,Ul=1.7,Wl=[.5,1,1.5,2,3],Gl=1200;function Kl(e,t){let[n,r]=(0,J.useState)(null),[i,a]=(0,J.useState)(`fire`),[o,s]=(0,J.useState)(!1),[c,l]=(0,J.useState)(``),[u,f]=(0,J.useState)(!1),[p,m]=(0,J.useState)(1),[h,g]=(0,J.useState)(1200),_=(0,J.useRef)(null),v=(0,J.useRef)([]),y=(0,J.useRef)(null),b=(0,J.useRef)(null),x=(0,J.useRef)(0),S=(0,J.useRef)(null),C=(0,J.useRef)(i),w=(0,J.useRef)(p),T=(0,J.useRef)(h);S.current=n,C.current=i,w.current=p,T.current=h;let E=(0,J.useCallback)(async()=>{try{r(await je()),s(!1),l(`Loaded assets/vfx/profiles.json`)}catch(e){r(null),l(`Effects unavailable: ${e instanceof Error?e.message:e}`)}},[]);(0,J.useEffect)(()=>{E()},[E]),(0,J.useEffect)(()=>{if(!e||!t)return;let n=e.stage;for(;n.children.length;){let e=n.children[0];n.remove(e),ps(e)}let r=()=>{let t=e.getPivot();n.position.set(t.x,e.groundHeight(t.x,t.z),t.z)};r();let i=new bn;n.add(i);let a=new d(new O(3.2,48),new re({color:2240574,roughness:1}));a.rotation.x=-Math.PI/2,a.position.y=.02,i.add(a);let o=ln.humanoid,s=[];if(o){let e=dl(o,{appearance:{clothColor:`c4`}});e.root.position.set(Hl,0,0),e.root.rotation.y=Math.PI/2;let t=dl(o,{appearance:{clothColor:`c8`}});t.root.position.set(Ul,0,0),t.root.rotation.y=-Math.PI/2,i.add(e.root,t.root),s.push(e,t)}v.current=s,y.current=s[0]?.root??i;let c=new Vl;i.add(c.group),_.current=c;let l=0;e.onFrame=e=>{l+=e,c.update(e*w.current);for(let t of s)t.update(e,l,!1,!0)};let u=()=>e.frameObject(i,5.5);return u(),e.onMapLoaded=()=>{r(),u()},()=>{e.onFrame=()=>{},e.onMapLoaded=()=>{},e.setGizmoOverride(null),b.current?.(),b.current=null,window.clearTimeout(x.current),_.current=null,v.current=[],y.current=null,c.dispose();for(let e of s)e.dispose();n.remove(i),n.position.set(0,0,0),ps(i)}},[e,t]);let D=(0,J.useCallback)(()=>{let e=_.current,t=S.current,n=C.current,r=y.current;if(!e||!t||!r)return;let i=t.profiles[n];if(!i)return;let a=new R(Ul,0,0),o=new R(Hl,.9,0),s=()=>e.playProfile(i,a,o);b.current?.(),b.current=null,window.clearTimeout(x.current);let c=T.current/w.current;if(c<=0||!i.cast){s();return}let l=e.startCast(i.cast,r);b.current=l,x.current=window.setTimeout(()=>{b.current===l&&(l(),b.current=null),s()},c)},[]);return(0,J.useEffect)(()=>{if(!u||!t)return;let e=!0,n=0,r=()=>{e&&(D(),n=window.setTimeout(r,T.current/w.current+Gl))};return r(),()=>{e=!1,window.clearTimeout(n)}},[u,t,D]),{doc:n,cat:i,dirty:o,status:c,playing:u,speed:p,castMs:h,setCat:a,setPlaying:f,setSpeed:m,setCastMs:g,replay:D,stop:(0,J.useCallback)(()=>{f(!1),window.clearTimeout(x.current),b.current?.(),b.current=null},[]),previewCast:(0,J.useCallback)(()=>{let e=_.current,t=S.current,n=y.current,r=t?.profiles[C.current];if(!e||!n||!r?.cast)return;b.current?.(),b.current=null,window.clearTimeout(x.current);let i=e.startCast(r.cast,n);b.current=i,x.current=window.setTimeout(()=>{b.current===i&&(i(),b.current=null)},T.current/w.current)},[]),onDocChange:(0,J.useCallback)(e=>{r(e),s(!0)},[]),save:(0,J.useCallback)(async()=>{if(n){l(`Saving…`);try{await me(n),s(!1),l(`Saved assets/vfx/profiles.json`)}catch(e){l(`Save failed: ${e instanceof Error?e.message:e}`)}}},[n]),load:E}}function ql({st:e}){return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`ed-dock-title`,children:[`Categories `,(0,Z.jsx)(`span`,{children:mn.length})]}),(0,Z.jsx)(`div`,{className:`ed-list`,children:mn.map(t=>(0,Z.jsxs)(`button`,{className:`item ${t===e.cat?`sel`:``}`,onClick:()=>e.setCat(t),children:[(0,Z.jsx)(`span`,{className:`efx-dot`,style:{background:Le(e.doc?.colors[t]??0)}}),t]},t))}),(0,Z.jsx)(`div`,{className:`ed-dock-title`,children:`Playback`}),(0,Z.jsxs)(`div`,{className:`sc-preview-controls`,children:[(0,Z.jsxs)(`label`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`speed`}),(0,Z.jsx)(`select`,{value:e.speed,onChange:t=>e.setSpeed(Number(t.target.value)),children:Wl.map(e=>(0,Z.jsxs)(`option`,{value:e,children:[e,`×`]},e))})]}),(0,Z.jsxs)(`label`,{className:`efx-field`,title:`Cast time (ms) — channel plays this long before projectile + impact; 0 skips it`,children:[(0,Z.jsx)(`span`,{children:`cast`}),(0,Z.jsx)(`input`,{type:`number`,min:0,step:100,value:e.castMs,onChange:t=>{let n=Number(t.target.value);e.setCastMs(Number.isFinite(n)?Math.max(0,n):0)}})]}),(0,Z.jsxs)(`div`,{className:`ed-row`,children:[(0,Z.jsx)(`button`,{title:`Channel only`,onClick:e.previewCast,children:`✦`}),(0,Z.jsx)(`button`,{"aria-pressed":e.playing,onClick:()=>e.setPlaying(!e.playing),children:e.playing?`Ⅱ`:`▶`}),(0,Z.jsx)(`button`,{onClick:e.stop,children:`■`}),(0,Z.jsx)(`button`,{onClick:e.replay,children:`Replay`})]})]})]})}function Jl({st:e}){return e.doc?(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`sc-inspector-head`,children:[(0,Z.jsxs)(`h3`,{children:[e.cat,` `,(0,Z.jsx)(`span`,{className:`dim`,children:`(3D)`})]}),(0,Z.jsx)(`button`,{className:`primary`,disabled:!e.dirty,onClick:()=>void e.save(),children:`Save`})]}),(0,Z.jsx)(`div`,{className:`ed-panel sc-rig-panel`,children:(0,Z.jsx)(Ne,{doc:e.doc,cat:e.cat,onChange:e.onDocChange})}),(0,Z.jsxs)(`div`,{className:`ed-statusbar sc-rig-status`,children:[(0,Z.jsx)(`span`,{className:e.dirty?`dirty`:`ed-ready`,children:`●`}),(0,Z.jsx)(`span`,{role:`status`,children:e.status||(e.dirty?`Unsaved changes`:`Ready`)})]})]}):(0,Z.jsx)(`div`,{className:`ed-hint`,children:`Loading effects…`})}var Yl=[[`.`,`Grass · walkable`],[`,`,`Meadow · walkable`],[`T`,`Forest · walkable`],[`H`,`Settlement · walkable`],[`R`,`Road · walkable`],[`S`,`Snow · walkable`],[`D`,`Sand · walkable`],[`I`,`Ice · walkable`],[`#`,`Rock · blocked`],[`~`,`Water · blocked`]],Xl=[{id:`raise`,label:`Raise`,hint:`Lift terrain under the cursor`},{id:`lower`,label:`Lower`,hint:`Sink terrain under the cursor`},{id:`flatten`,label:`Flatten`,hint:`Pull terrain toward a target elevation`},{id:`smooth`,label:`Smooth`,hint:`Blend vertices toward their neighbours`},{id:`paint`,label:`Paint`,hint:`Paint surface type and walkability`}];function Zl(e,t,n){let[r,i]=(0,J.useState)({mode:`raise`,radius:96,strength:48,height:16,cell:`.`}),a=Mo(t,e=>e.doc.terrain?.paints);return(0,J.useEffect)(()=>{if(n)return e?.setTerrainBrush(r),()=>e?.setTerrainBrush(null)},[e,t,n,r]),{brush:r,patch:e=>i(t=>({...t,...e})),paints:a,setPaint:(e,n)=>t.update(t=>{let r={...t.terrain??mt()},i={...r.paints??{}};n===null?delete i[e]:i[e]={...Rt[e]??Rt[`.`],...i[e]??{},...n},r.paints=Object.keys(i).length?i:void 0,t.terrain=r}),clearHeights:()=>t.update(e=>{e.terrain={...e.terrain??mt(),heights:{}}}),clearCells:()=>t.update(e=>{e.terrain={...e.terrain??mt(),cells:{}}}),clearAll:()=>t.update(e=>{e.terrain=mt()})}}function Ql({st:e,store:t}){let n=Mo(t,e=>e.doc.terrain),r=Object.keys(n?.heights??{}).length,i=Object.keys(n?.cells??{}).length,a=Object.keys(n?.paints??{}).length;return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`ed-dock-title`,children:[`Brushes `,(0,Z.jsx)(`span`,{children:Xl.length})]}),(0,Z.jsx)(`div`,{className:`ed-list`,children:Xl.map(t=>(0,Z.jsx)(`button`,{className:`item ${e.brush.mode===t.id?`sel`:``}`,title:t.hint,onClick:()=>e.patch({mode:t.id}),children:t.label},t.id))}),(0,Z.jsx)(`div`,{className:`ed-dock-title`,children:`Authored layer`}),(0,Z.jsxs)(`div`,{className:`sc-preview-controls`,children:[(0,Z.jsxs)(`div`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`height vertices`}),(0,Z.jsx)(`span`,{children:r})]}),(0,Z.jsxs)(`div`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`painted cells`}),(0,Z.jsx)(`span`,{children:i})]}),(0,Z.jsxs)(`div`,{className:`efx-field`,children:[(0,Z.jsx)(`span`,{children:`custom textures`}),(0,Z.jsx)(`span`,{children:a})]})]}),(0,Z.jsxs)(`div`,{className:`sc-lib-actions`,children:[(0,Z.jsx)(`button`,{disabled:!r,title:`Remove all sculpted elevation (undoable)`,onClick:()=>{confirm(`Clear ${r} sculpted height vertices?`)&&e.clearHeights()},children:`Clear heights`}),(0,Z.jsx)(`button`,{disabled:!i,title:`Remove all painted surface cells (undoable)`,onClick:()=>{confirm(`Clear ${i} painted cells?`)&&e.clearCells()},children:`Clear cells`})]}),(0,Z.jsx)(`div`,{className:`sc-lib-actions`,children:(0,Z.jsx)(`button`,{disabled:!r&&!i&&!a,title:`Reset the whole authored terrain layer (undoable)`,onClick:()=>{confirm(`Clear all terrain edits (heights + painted cells + textures)?`)&&e.clearAll()},children:`Reset terrain`})})]})}function $l({cell:e,label:t,st:n}){let r=(0,J.useRef)(null);(0,J.useEffect)(()=>{r.current&&ze(r.current,e,n.paints)},[e,n.paints]);let i=!!n.paints?.[e];return(0,Z.jsxs)(`button`,{className:`sc-swatch ${n.brush.cell===e?`sel`:``}`,title:`${t}${i?` · custom texture`:``}`,onClick:()=>n.patch({cell:e}),children:[(0,Z.jsx)(`canvas`,{ref:r,width:44,height:44}),(0,Z.jsxs)(`span`,{children:[t.split(` · `)[0],i?` ✎`:``]})]})}function eu({st:e}){let t=(0,J.useRef)(null),n=e.brush.cell,r=xn(n,e.paints),i=!!e.paints?.[n];(0,J.useEffect)(()=>{t.current&&ze(t.current,n,e.paints)},[n,e.paints]);let a=t=>e.setPaint(n,t),o=(e,t,n=1)=>(0,Z.jsxs)(`label`,{className:`sc-tex-field`,children:[(0,Z.jsx)(`span`,{children:e}),(0,Z.jsx)(`input`,{type:`range`,min:0,max:n,step:.02,value:r[t],onChange:e=>a({[t]:Number(e.target.value)})}),(0,Z.jsx)(`em`,{children:r[t].toFixed(2)})]});return(0,Z.jsxs)(`div`,{className:`sc-tex`,children:[(0,Z.jsxs)(`div`,{className:`sc-tex-head`,children:[(0,Z.jsxs)(`h4`,{children:[`Texture · `,(Yl.find(([e])=>e===n)?.[1]??n).split(` · `)[0]]}),(0,Z.jsx)(`button`,{disabled:!i,title:`Restore the built-in look`,onClick:()=>e.setPaint(n,null),children:`reset`})]}),(0,Z.jsxs)(`div`,{className:`sc-tex-body`,children:[(0,Z.jsx)(`canvas`,{ref:t,width:88,height:88}),(0,Z.jsxs)(`div`,{className:`sc-tex-controls`,children:[(0,Z.jsxs)(`label`,{className:`sc-tex-field`,children:[(0,Z.jsx)(`span`,{children:`color`}),(0,Z.jsx)(`input`,{type:`color`,value:r.color,onChange:e=>a({color:e.target.value})})]}),o(`variation`,`noise`,.6),o(`trees`,`trees`),o(`rocks`,`rocks`),o(`grass`,`grass`)]})]})]})}function tu({st:e}){let{brush:t,patch:n}=e,r=Xl.find(e=>e.id===t.mode);return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(`div`,{className:`sc-inspector-head`,children:(0,Z.jsxs)(`h3`,{children:[`Terrain `,(0,Z.jsxs)(`span`,{className:`dim`,children:[`(`,r.label,`)`]})]})}),(0,Z.jsxs)(`div`,{className:`ed-panel sc-rig-panel`,style:{display:`grid`,gap:8,alignContent:`start`},children:[(0,Z.jsxs)(`label`,{style:{display:`grid`,gap:4},children:[`Radius · `,t.radius,` map pixels`,(0,Z.jsx)(`input`,{"aria-label":`Terrain brush radius`,type:`range`,min:16,max:512,step:8,value:t.radius,onChange:e=>n({radius:Number(e.target.value)})})]}),t.mode!==`paint`&&(0,Z.jsxs)(`label`,{style:{display:`grid`,gap:4},children:[`Strength · `,t.strength,` px/s`,(0,Z.jsx)(`input`,{"aria-label":`Terrain brush strength`,type:`range`,min:4,max:256,step:4,value:t.strength,onChange:e=>n({strength:Number(e.target.value)})})]}),t.mode===`flatten`&&(0,Z.jsxs)(`label`,{style:{display:`grid`,gap:4},children:[`Target elevation · map pixels`,(0,Z.jsx)(`input`,{"aria-label":`Flatten elevation`,type:`number`,min:-16384,max:16384,step:4,value:t.height,onChange:e=>n({height:Math.max(-16384,Math.min(16384,Number(e.target.value)))})})]}),t.mode===`paint`&&(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(`div`,{className:`sc-tex-label`,children:`Surface and collision`}),(0,Z.jsx)(`div`,{className:`sc-swatches`,children:Yl.map(([t,n])=>(0,Z.jsx)($l,{cell:t,label:n,st:e},t))}),(0,Z.jsx)(eu,{st:e})]}),(0,Z.jsxs)(`p`,{style:{margin:0,color:`#bbb`,fontSize:11,lineHeight:1.5},children:[r.hint,`. Drag on the terrain to apply — each stroke is one undo step. Elevation, surfaces and textures are saved with this map’s scene.`]})]}),(0,Z.jsx)(`div`,{className:`ed-statusbar sc-rig-status`,children:(0,Z.jsx)(`span`,{children:`Switch to the Prefabs tab to select objects`})})]})}var nu=[{id:`view`,label:`View (Q)`,key:`Q`,icon:`✋`},{id:`move`,label:`Move (W)`,key:`W`,icon:`✢`},{id:`rotate`,label:`Rotate (E)`,key:`E`,icon:`↻`},{id:`scale`,label:`Scale (R)`,key:`R`,icon:`⤢`}];function ru(){return new URLSearchParams(location.search).get(`map`)??``}function iu({mode:e}){let[t,n]=(0,J.useState)([]),[r,i]=(0,J.useState)(ru),[a,o]=(0,J.useState)(null),[s,c]=(0,J.useState)(``),[l,u]=(0,J.useState)(``),[d,f]=(0,J.useState)(!1),[p,m]=(0,J.useState)(!1),[h,g]=(0,J.useState)(``),[_,v]=(0,J.useState)(``),[y,b]=(0,J.useState)(no),[x,S]=(0,J.useState)(null),[C,w]=(0,J.useState)(null),T=(0,J.useMemo)(()=>new jo(r),[r]),E=hl(x,e===`characters`),D=Kl(x,e===`effects`),O=Zl(x,T,e===`terrain`),ee=(0,J.useRef)(null),k=(0,J.useRef)(null);(0,J.useEffect)(()=>{co().then(e=>{if(n(e),!e.length)throw Error(`The game server has no maps enabled.`);e.some(e=>e.id===r)||i(e.find(e=>e.id===`clara_mundi`)?.id??e[0].id)}).catch(e=>c(`${e instanceof Error?e.message:e}. Start the game server (npm run server:dev) and reload.`))},[]),(0,J.useEffect)(()=>{if(!r)return;let e=new URLSearchParams(location.search);e.set(`map`,r),history.replaceState(null,``,`?${e}`),o(null),c(``);let t=!1;return lo(r).then(e=>{t||o(e)}).catch(e=>{t||c(`Could not load map '${r}': ${e instanceof Error?e.message:e}`)}),localStorage.getItem(`scene3d:${r}`)?u(`Recovered browser draft. Load server to replace it with the saved scene.`):oo(r).then(e=>{!t&&!T.getState().dirty&&T.replaceDoc(e)}).catch(e=>{t||u(`Scene load failed: ${e instanceof Error?e.message:e}`)}),()=>{t=!0}},[r]),(0,J.useEffect)(()=>{if(!ee.current)return;let e=new Ds(ee.current,T);return k.current=e,S(e),()=>{e.dispose(),k.current=null}},[T]),(0,J.useEffect)(()=>{a&&k.current&&k.current.loadMap(a)},[a,T]);let A=Mo(T,e=>e.tool),j=Mo(T,e=>e.space),M=Mo(T,e=>e.snap),N=Mo(T,e=>e.snapMove),P=Mo(T,e=>e.snapRotate),te=Mo(T,e=>e.snapScale),ne=Mo(T,e=>e.layers),re=Mo(T,e=>e.dropToSurface),F=Mo(T,e=>e.dirty),ie=Mo(T,e=>e.canUndo),I=Mo(T,e=>e.canRedo),L=Mo(T,e=>e.selection),R=Mo(T,e=>e.doc.objects.length),ae=(0,J.useCallback)(e=>{u(e),window.setTimeout(()=>u(t=>t===e?``:t),2500)},[]),z=(e,t)=>{let n=k.current?.placementPoint()??[0,0,0];T.addObject(e,n,null,t)},oe=()=>{uo(T.getState().doc),ae(`Exported scene JSON (server unchanged)`)},se=async()=>{f(!0);let e=T.getState().doc;try{await so(e),T.getState().doc===e&&T.markSaved(),ae(`Scene saved to the game server`)}catch(e){u(`Save failed: ${e instanceof Error?e.message:e}`)}finally{f(!1)}},ce=async()=>{if(!F||confirm(`Replace the browser draft with the saved server scene?`)){f(!0);try{T.replaceDoc(await oo(r,y)),ae(`Loaded server scene`)}catch(e){u(`Load failed: ${e instanceof Error?e.message:e}`)}finally{f(!1)}}},le=async()=>{let e=await fo(r);e&&(e.map===r||confirm(`This scene was authored for map '${e.map}'. Load it over '${r}' anyway?`))&&(T.replaceDoc({...e,map:r},!0),ae(`Imported ${e.objects.length} objects`))},ue=()=>{confirm(`Clear scene objects, prefab assets and terrain edits? You can undo this change.`)&&T.update(e=>Object.assign(e,Ze(r)))},de=(0,J.useCallback)((e,t)=>k.current?.groundHeight(e,t)??0,[]);return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsxs)(`div`,{className:`ed-toolbar sc-toolbar`,children:[(0,Z.jsx)(`span`,{className:`ed-toolbar-label`,children:`Map`}),(0,Z.jsx)(`select`,{"aria-label":`Map`,value:r,disabled:!t.length||d,onChange:e=>i(e.target.value),children:t.map(e=>(0,Z.jsx)(`option`,{value:e.id,children:e.name},e.id))}),(0,Z.jsx)(`span`,{className:`sc-sep`}),(0,Z.jsx)(`div`,{className:`sc-tools`,role:`radiogroup`,"aria-label":`Transform tool`,children:nu.map(e=>(0,Z.jsxs)(`button`,{role:`radio`,"aria-checked":A===e.id,className:A===e.id?`active`:``,title:e.label,onClick:()=>T.setTool(e.id),children:[e.icon,(0,Z.jsx)(`small`,{children:e.key})]},e.id))}),(0,Z.jsx)(`button`,{title:`Toggle world/local handles (X)`,onClick:()=>T.setSpace(j===`world`?`local`:`world`),children:j===`world`?`🌐 Global`:`⬚ Local`}),(0,Z.jsx)(`span`,{className:`sc-sep`}),(0,Z.jsxs)(`label`,{className:`sc-check`,children:[(0,Z.jsx)(`input`,{type:`checkbox`,checked:M,onChange:e=>T.setSnap({snap:e.target.checked})}),`Snap`]}),(0,Z.jsxs)(`label`,{className:`sc-snap`,children:[`Move`,(0,Z.jsx)(`input`,{type:`number`,"aria-label":`Move snap`,step:.25,min:.05,value:N,onChange:e=>T.setSnap({snapMove:Math.max(.01,+e.target.value||.5)})})]}),(0,Z.jsxs)(`label`,{className:`sc-snap`,children:[`Rot`,(0,Z.jsx)(`input`,{type:`number`,"aria-label":`Rotate snap`,step:5,min:1,value:P,onChange:e=>T.setSnap({snapRotate:Math.max(1,+e.target.value||15)})})]}),(0,Z.jsxs)(`label`,{className:`sc-snap`,children:[`Scale`,(0,Z.jsx)(`input`,{type:`number`,"aria-label":`Scale snap`,step:.05,min:.01,value:te,onChange:e=>T.setSnap({snapScale:Math.max(.01,+e.target.value||.1)})})]}),(0,Z.jsx)(`span`,{className:`sc-sep`}),(0,Z.jsx)(`button`,{disabled:!ie,title:`Undo (Ctrl+Z)`,onClick:()=>T.undo(),children:`↶`}),(0,Z.jsx)(`button`,{disabled:!I,title:`Redo (Ctrl+Y)`,onClick:()=>T.redo(),children:`↷`}),(0,Z.jsx)(`button`,{disabled:!L.length,title:`Duplicate (Ctrl+D)`,onClick:()=>T.duplicateSelected(),children:`⧉`}),(0,Z.jsx)(`button`,{disabled:!L.length,title:`Delete (Del)`,onClick:()=>T.deleteSelected(),children:`🗑`}),(0,Z.jsx)(`button`,{disabled:!L.length,title:`Drop selection onto the terrain or closest collider below`,onClick:()=>k.current?.dropSelected(),children:`⤓`}),(0,Z.jsx)(`button`,{title:`Frame selection (F)`,onClick:()=>T.requestFrame(),children:`⌖`}),(0,Z.jsx)(`span`,{className:`spacer`}),(0,Z.jsx)(`button`,{onClick:ue,children:`New`}),(0,Z.jsx)(`button`,{onClick:()=>m(!p),children:y?`Admin session`:`Admin sign in`}),(0,Z.jsx)(`button`,{disabled:d||!r,onClick:()=>void ce(),children:`Load server`}),(0,Z.jsx)(`button`,{className:`primary`,disabled:d||!r,onClick:()=>void se(),children:`Save server`}),(0,Z.jsx)(`button`,{onClick:()=>void le(),children:`Import…`}),(0,Z.jsx)(`button`,{className:`primary`,onClick:oe,children:`Export JSON`})]}),p&&(0,Z.jsxs)(`form`,{className:`ed-toolbar`,onSubmit:async e=>{e.preventDefault(),f(!0);try{await ao(h,_),v(``),m(!1),b(!0),ae(`Administrator signed in`)}catch(e){u(`Sign in failed: ${e instanceof Error?e.message:e}`)}finally{f(!1)}},children:[(0,Z.jsxs)(`label`,{children:[`Administrator `,(0,Z.jsx)(`input`,{"aria-label":`Administrator username`,autoComplete:`username`,value:h,onChange:e=>g(e.target.value)})]}),(0,Z.jsx)(`input`,{"aria-label":`Administrator password`,type:`password`,autoComplete:`current-password`,value:_,onChange:e=>v(e.target.value)}),(0,Z.jsx)(`button`,{disabled:d,type:`submit`,children:`Sign in`})]}),(0,Z.jsxs)(`div`,{className:`ed-main`,children:[(0,Z.jsx)(`aside`,{className:`ed-hierarchy sc-left`,children:e===`prefabs`?(0,Z.jsx)(As,{store:T}):e===`terrain`?(0,Z.jsx)(Ql,{st:O,store:T}):e===`characters`?(0,Z.jsx)(gl,{st:E}):(0,Z.jsx)(ql,{st:D})}),(0,Z.jsxs)(`section`,{className:`ed-scene`,children:[(0,Z.jsxs)(`div`,{className:`ed-dock-title`,children:[(0,Z.jsx)(`div`,{className:`ed-view-tabs`,children:e===`characters`?pl.map(e=>(0,Z.jsx)(`button`,{className:E.tab===e.id?`active`:``,onClick:()=>E.setTab(e.id),children:e.label},e.id)):(0,Z.jsx)(`button`,{className:`active`,children:`Scene`})}),(0,Z.jsx)(`span`,{children:a?.name??(s?`offline`:`loading…`)})]}),(0,Z.jsxs)(`div`,{className:`ed-scene-toolbar`,children:[[`terrain`,`stamps`,`grid`,`fog`].map(e=>(0,Z.jsx)(`button`,{"aria-pressed":ne[e],onClick:()=>T.setLayer(e,!ne[e]),children:e===`terrain`?`Terrain`:e===`stamps`?`2D stamps`:e===`grid`?`Grid`:`Fog`},e)),e===`prefabs`&&(0,Z.jsx)(`button`,{"aria-pressed":re,title:`Newly placed prefabs drop onto the terrain or closest collider below the cursor`,onClick:()=>T.setDropToSurface(!re),children:`Surface drop`}),(0,Z.jsx)(`span`,{className:`spacer`}),(0,Z.jsxs)(`span`,{children:[nu.find(e=>e.id===A)?.label,` · `,j]})]}),(0,Z.jsxs)(`div`,{className:`ed-viewport sc-viewport`,ref:ee,children:[!a&&!s&&(0,Z.jsx)(`div`,{className:`sc-overlay`,children:`Loading terrain…`}),s&&(0,Z.jsxs)(`div`,{className:`sc-overlay sc-error`,role:`alert`,children:[(0,Z.jsx)(`strong`,{children:`Scene view unavailable`}),(0,Z.jsx)(`p`,{children:s})]})]}),e===`prefabs`&&(0,Z.jsx)(Ks,{onEdit:w,store:T}),e===`characters`&&E.tab===`animation`&&E.doc&&(0,Z.jsx)(Al,{st:E}),C&&(0,Z.jsx)($s,{store:T,assetId:C.assetId,defId:C.defId,onClose:()=>w(null),onPlace:(e,t)=>z(e,t),onOpenAsset:e=>w({assetId:e})},C.assetId??C.defId),(0,Z.jsxs)(`div`,{className:`ed-scene-footer`,children:[(0,Z.jsxs)(`span`,{children:[(0,Z.jsx)(`b`,{children:`RMB`}),` look · `,(0,Z.jsx)(`b`,{children:`WASD/QE`}),` fly · `,(0,Z.jsx)(`b`,{children:`MMB`}),` pan · `,(0,Z.jsx)(`b`,{children:`Alt+LMB`}),` orbit · `,(0,Z.jsx)(`b`,{children:`Wheel`}),` zoom · `,(0,Z.jsx)(`b`,{children:`F`}),` frame`,e===`terrain`?(0,Z.jsxs)(Z.Fragment,{children:[` · `,(0,Z.jsx)(`b`,{children:`LMB`}),` paint brush`]}):(0,Z.jsxs)(Z.Fragment,{children:[` · `,(0,Z.jsx)(`b`,{children:`Shift+click`}),` multi-select`]})]}),(0,Z.jsx)(`span`,{children:L.length?`${L.length} selected`:`Nothing selected`})]})]}),(0,Z.jsx)(`div`,{className:`ed-side sc-side`,children:e===`prefabs`?(0,Z.jsx)(zs,{store:T,groundHeight:de}):e===`terrain`?(0,Z.jsx)(tu,{st:O}):e===`characters`?(0,Z.jsx)(Tl,{st:E}):(0,Z.jsx)(Jl,{st:D})})]}),(0,Z.jsxs)(`footer`,{className:`ed-statusbar`,children:[(0,Z.jsx)(`span`,{className:F?`dirty`:`ed-ready`,children:`●`}),(0,Z.jsx)(`span`,{role:`status`,children:l||(F?`Unsaved server changes (browser recovery draft saved)`:`Ready`)}),(0,Z.jsx)(`span`,{className:`spacer`}),(0,Z.jsxs)(`span`,{children:[R,` objects`]}),(0,Z.jsxs)(`span`,{children:[r,F?` *`:``]})]})]})}export{iu as default};