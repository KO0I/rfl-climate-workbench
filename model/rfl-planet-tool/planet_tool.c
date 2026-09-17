/* planet.c - procedural worlds, software rendered (no OpenGL).
 *
 * Five pages, toggled with the < > selector (or Tab):
 *   PLANET    - a sphere: surface / city lights / larger cloud shell.
 *   ORBITALS  - a Orbital: tilted circular band, inner surface facing the
 *               axis. Same palette+noise terrain; clouds drift over it; the
 *               near arc is the floor, the far arc sweeps overhead.
 *   NO ATMO   - an airless sphere: four terrain rows, no cloud/atmosphere.
 *   GAS GIANT - a swirling sphere with bands, cells, oval storms, and two larger cloud shells.
 *   COMET     - a small rough nucleus with an adjustable coma, jets, and tail.
 *
 * Files (created in CWD on first run, re-imported afterwards):
 *   palette.bmp          5x4 colors: row0 grass, row1 coast, row2 sea, row3 cloud.
 *   airless_palette.bmp  5x4 colors: four terrain/material rows.
 *   gas_palette.bmp      5x6 colors: four gas-band rows, two cloud rows.
 *   comet_palette.bmp    5x4 colors: nucleus rock, ice, coma, tail.
 *   aurora_palette.bmp          5x1 colors for PLANET/ORBITALS aurora.
 *   airless_aurora_palette.bmp  5x1 colors for NO ATMO aurora.
 *   gas_aurora_palette.bmp      5x1 colors for GAS GIANT aurora.
 *   dither.bmp   4x4 grayscale Bayer threshold map (16 levels).
 *
 * Asset export:
 *   ./planet_tool --export-game-assets
 *     writes the game-facing planet BMPs imported by raycaster_planet.
 *
 * Controls (bottom strip): page < >, then
 *   SIZE     planet radius / ring radius     (Up/Down)
 *   PIXEL    block size: chunkier+faster      (Left/Right)
 *   LIGHTNG  night-side lightning intensity
 *   LIGHT    city-light color
 *   DENSITY  city-light density on land / CRATERS on NO ATMO
 *   AURORA   polar aurora intensity
 *   RINGS    decorative ring width
 *   RANDOMIZE  new palette + radius + terrain + clouds; rewrites current palette.
 *   Left-click drag in the preview rotates the centered object.
 *   Esc / close to quit.
 *
 * build:  make    (or: cc -O2 -std=c99 planet.c -o planet `sdl2-config --cflags --libs` -lm)
 */
#ifdef PLANET_TOOL_EMBEDDED
#include <stdint.h>
typedef uint32_t Uint32;
#else
#include <SDL2/SDL.h>
#endif
#include "planet_tool.h"
#include "space_object_defs.h"
#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <time.h>
#include <math.h>
#include <unistd.h>

#define PW   640
#define PH   640
#define CTRL 260
#define WIN_W PW
#define WIN_H (PH + CTRL)

#define HMAX 0.9375f
#define RAD_MIN 0.15f
#define RAD_MAX 0.90f
#define SCALE_MAX 16
#define DENS_MAX 0.25f
#define CITYF 80.0f
#define PIF 3.14159265358979323846f
#define PAL_COLS 5
#define AUR_COLS 5
#define PAL_ROWS_EARTH 4
#define PAL_ROWS_AIRLESS 4
#define PAL_ROWS_GAS 6
#define PAL_ROWS_COMET 4
#define PAL_ROWS_MAX 6

enum {
	PAGE_PLANET,
	PAGE_ORBITAL,
	PAGE_AIRLESS,
	PAGE_GAS,
	PAGE_COMET,
	PAGE_STAR_YELLOW,
	PAGE_STAR_RED_DWARF,
	PAGE_STAR_WHITE_DWARF,
	PAGE_STAR_BLUE_WHITE,
	PAGE_STAR_NEUTRON,
	PAGE_STAR_HERBIG_HARO,
	NPAGES
};
enum { PAL_EARTH, PAL_AIRLESS, PAL_GAS, PAL_COMET, NPALS };

static const float DEF_PAL[20][3] = {
 {0.04f,0.16f,0.04f},{0.06f,0.26f,0.06f},{0.10f,0.38f,0.10f},{0.20f,0.55f,0.16f},{0.45f,0.75f,0.30f},
 {0.45f,0.26f,0.08f},{0.62f,0.36f,0.12f},{0.78f,0.48f,0.18f},{0.88f,0.62f,0.30f},{0.95f,0.78f,0.50f},
 {0.02f,0.05f,0.18f},{0.03f,0.10f,0.30f},{0.05f,0.18f,0.45f},{0.08f,0.30f,0.60f},{0.20f,0.50f,0.75f},
 {0.45f,0.47f,0.52f},{0.62f,0.64f,0.68f},{0.78f,0.80f,0.83f},{0.90f,0.91f,0.93f},{1.00f,1.00f,1.00f}
};
static const float DEF_AIRLESS_PAL[20][3] = {
 {0.18f,0.15f,0.13f},{0.28f,0.23f,0.19f},{0.40f,0.34f,0.28f},{0.54f,0.48f,0.40f},{0.70f,0.64f,0.54f},
 {0.20f,0.18f,0.19f},{0.32f,0.30f,0.32f},{0.46f,0.45f,0.47f},{0.62f,0.62f,0.64f},{0.80f,0.80f,0.82f},
 {0.16f,0.10f,0.08f},{0.28f,0.16f,0.12f},{0.44f,0.24f,0.17f},{0.62f,0.36f,0.24f},{0.84f,0.56f,0.36f},
 {0.35f,0.43f,0.45f},{0.48f,0.62f,0.66f},{0.65f,0.80f,0.82f},{0.82f,0.95f,0.92f},{0.95f,1.00f,0.97f}
};
static const float DEF_GAS_PAL[30][3] = {
 {0.38f,0.24f,0.11f},{0.52f,0.34f,0.16f},{0.68f,0.48f,0.24f},{0.84f,0.66f,0.36f},{0.96f,0.82f,0.52f},
 {0.18f,0.10f,0.05f},{0.28f,0.16f,0.07f},{0.40f,0.24f,0.10f},{0.55f,0.35f,0.16f},{0.72f,0.50f,0.25f},
 {0.44f,0.30f,0.16f},{0.58f,0.42f,0.24f},{0.74f,0.58f,0.34f},{0.88f,0.74f,0.48f},{1.00f,0.90f,0.68f},
 {0.10f,0.07f,0.10f},{0.16f,0.11f,0.18f},{0.24f,0.18f,0.28f},{0.34f,0.28f,0.42f},{0.48f,0.42f,0.60f},
 {0.70f,0.58f,0.42f},{0.80f,0.70f,0.54f},{0.88f,0.82f,0.68f},{0.95f,0.91f,0.80f},{1.00f,0.98f,0.90f},
 {0.72f,0.74f,0.82f},{0.82f,0.84f,0.90f},{0.90f,0.91f,0.96f},{0.96f,0.97f,1.00f},{1.00f,1.00f,1.00f}
};
static const float DEF_COMET_PAL[20][3] = {
 {0.16f,0.14f,0.13f},{0.25f,0.23f,0.21f},{0.36f,0.34f,0.31f},{0.48f,0.46f,0.42f},{0.62f,0.58f,0.52f},
 {0.34f,0.48f,0.52f},{0.46f,0.63f,0.68f},{0.60f,0.78f,0.82f},{0.78f,0.92f,0.95f},{0.95f,1.00f,1.00f},
 {0.16f,0.56f,0.82f},{0.26f,0.70f,0.95f},{0.45f,0.84f,1.00f},{0.72f,0.94f,1.00f},{0.96f,1.00f,1.00f},
 {0.20f,0.62f,0.96f},{0.34f,0.76f,1.00f},{0.55f,0.88f,1.00f},{0.78f,0.96f,1.00f},{0.98f,1.00f,1.00f}
};
static const float DEF_AUR[NPALS][AUR_COLS][3] = {
 {
  {0.05f,0.70f,0.35f},{0.10f,0.95f,0.55f},{0.30f,1.00f,0.82f},{0.62f,0.90f,1.00f},{0.95f,1.00f,1.00f}
 },
 {
  {0.26f,0.30f,0.95f},{0.34f,0.72f,1.00f},{0.42f,1.00f,0.86f},{0.72f,1.00f,0.96f},{0.98f,1.00f,1.00f}
 },
	 {
	  {0.12f,0.34f,1.00f},{0.18f,0.74f,1.00f},{0.32f,1.00f,0.86f},{0.76f,1.00f,0.96f},{1.00f,1.00f,1.00f}
	 },
	 {
	  {0.10f,0.50f,0.95f},{0.16f,0.72f,1.00f},{0.34f,0.90f,1.00f},{0.70f,0.98f,1.00f},{0.98f,1.00f,1.00f}
	 }
};
static const int DEF_BAYER[16] = {0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5};

static float PAL[NPALS][PAL_ROWS_MAX * PAL_COLS][3];
static float AUR[NPALS][AUR_COLS][3];
static int   BAYER[16];

typedef struct {
    float rad; int scale;
    float sea, freq, spin, tilt;
    float viewYaw, viewPitch;
    float cthr, cfreq, cscale, cdrift;
    float lightning, lightHue, cityDens, aurora, rings, craters;
} Params;

/* Keep every renderer and the embedded menu on the same complete baseline.
 * A single constructor avoids silently zero-initializing fields when Params
 * grows as new world types gain controls. */
static Params default_params(void){
    return (Params){
        0.40f, 5,
        0.45f, 3.0f, 0.15f, 0.4f,
        0.0f, 0.0f,
        0.48f, 2.2f, 1.05f, 0.03f,
        0.20f, 0.11f, 0.06f, 0.35f, 0.20f, 0.55f
    };
}

/* ---- helpers ----------------------------------------------------------- */
static float fracf(float x){ return x - floorf(x); }
static float clampf(float x,float a,float b){ return x<a?a:(x>b?b:x); }
static void rotate_view(float u,float v,float z,float yaw,float pitch,float *x,float *y,float *out_z){
    float cy=cosf(yaw), sy=sinf(yaw), cp=cosf(pitch), sp=sinf(pitch);
    float x1=cy*u+sy*z, z1=-sy*u+cy*z;
    *x=x1; *y=cp*v-sp*z1; *out_z=sp*v+cp*z1;
}
/* View-space normal of the q.y == 0 plane after rotate_view(). */
static void equatorial_ring_normal(float yaw,float pitch,float *x,float *y,float *z){
    *x=sinf(yaw)*sinf(pitch);
    *y=cosf(pitch);
    *z=-cosf(yaw)*sinf(pitch);
}
static float smoothstep(float e0,float e1,float x){
    float t=clampf((x-e0)/(e1-e0),0.0f,1.0f); return t*t*(3.0f-2.0f*t);
}
static float frand(void){ return (float)rand()/(float)RAND_MAX; }
static void hsv(float h,float s,float v,float*r,float*g,float*b){
    h=fracf(h); float i=floorf(h*6.0f), f=h*6.0f-i;
    float p=v*(1-s), q=v*(1-s*f), t=v*(1-s*(1-f));
    switch(((int)i)%6){
        case 0:*r=v;*g=t;*b=p;break;  case 1:*r=q;*g=v;*b=p;break;
        case 2:*r=p;*g=v;*b=t;break;  case 3:*r=p;*g=q;*b=v;break;
        case 4:*r=t;*g=p;*b=v;break;  default:*r=v;*g=p;*b=q;
    }
}
static float hash3(float x,float y,float z){
    float px=fracf(x*0.3183099f+0.71f), py=fracf(y*0.3183099f+0.113f), pz=fracf(z*0.3183099f+0.419f);
    px*=17.0f; py*=17.0f; pz*=17.0f;
    return fracf(px*py*pz*(px+py+pz));
}
static float vnoise(float x,float y,float z){
    float ix=floorf(x), iy=floorf(y), iz=floorf(z);
    float fx=x-ix, fy=y-iy, fz=z-iz;
    fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy); fz=fz*fz*(3-2*fz);
    float c000=hash3(ix,iy,iz),     c100=hash3(ix+1,iy,iz);
    float c010=hash3(ix,iy+1,iz),   c110=hash3(ix+1,iy+1,iz);
    float c001=hash3(ix,iy,iz+1),   c101=hash3(ix+1,iy,iz+1);
    float c011=hash3(ix,iy+1,iz+1), c111=hash3(ix+1,iy+1,iz+1);
    float x00=c000+(c100-c000)*fx, x10=c010+(c110-c010)*fx;
    float x01=c001+(c101-c001)*fx, x11=c011+(c111-c011)*fx;
    float y0=x00+(x10-x00)*fy,     y1=x01+(x11-x01)*fy;
    return y0+(y1-y0)*fz;
}
static float fbm(float x,float y,float z){
    float a=0.5f,s=0.0f;
    for(int i=0;i<4;i++){ s+=a*vnoise(x,y,z); x*=2.02f; y*=2.02f; z*=2.02f; a*=0.5f; }
    return s;
}
static Uint32 pack(float r,float g,float b){
    r=clampf(r,0,1); g=clampf(g,0,1); b=clampf(b,0,1);
    return 0xFF000000u | ((Uint32)(r*255.0f)<<16) | ((Uint32)(g*255.0f)<<8) | (Uint32)(b*255.0f);
}
static void unpack_rgbf(uint32_t c,float*r,float*g,float*b){
	*r=(float)((c>>16)&255)/255.0f;
	*g=(float)((c>>8)&255)/255.0f;
	*b=(float)(c&255)/255.0f;
}
static void rect(Uint32*fb,int x,int y,int w,int h,Uint32 c){
    for(int j=y;j<y+h;j++){ if(j<0||j>=WIN_H) continue;
        for(int i=x;i<x+w;i++){ if(i<0||i>=WIN_W) continue; fb[j*WIN_W+i]=c; } }
}

/* index of grass/sea/coast palette cell for a noise height (shared) */
static int terrain_idx(float h,float sea,float coast){
    if(h<sea)        return 10+(int)(clampf(h/sea,0,1)*4.999f);
    if(h<coast)      return  5+(int)(clampf((h-sea)/(coast-sea),0,1)*4.999f);
    return                   (int)(clampf((h-coast)/(HMAX-coast),0,1)*4.999f);
}

/* ---- tiny 5x7 font ----------------------------------------------------- */
static const char *FC = " SIZEPXLRANDOMGHTYBUCJ";
static const unsigned char FONT[22][7] = {
 {0,0,0,0,0,0,0},
 {0x0E,0x11,0x10,0x0E,0x01,0x11,0x0E}, {0x0E,0x04,0x04,0x04,0x04,0x04,0x0E},
 {0x1F,0x01,0x02,0x04,0x08,0x10,0x1F}, {0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F},
 {0x1E,0x11,0x11,0x1E,0x10,0x10,0x10}, {0x11,0x11,0x0A,0x04,0x0A,0x11,0x11},
 {0x10,0x10,0x10,0x10,0x10,0x10,0x1F}, {0x1E,0x11,0x11,0x1E,0x14,0x12,0x11},
 {0x0E,0x11,0x11,0x1F,0x11,0x11,0x11}, {0x11,0x19,0x15,0x15,0x13,0x11,0x11},
 {0x1E,0x11,0x11,0x11,0x11,0x11,0x1E}, {0x0E,0x11,0x11,0x11,0x11,0x11,0x0E},
 {0x11,0x1B,0x15,0x15,0x11,0x11,0x11}, {0x0E,0x11,0x10,0x17,0x11,0x11,0x0E},
 {0x11,0x11,0x11,0x1F,0x11,0x11,0x11}, {0x1F,0x04,0x04,0x04,0x04,0x04,0x04},
 {0x11,0x11,0x0A,0x04,0x04,0x04,0x04}, {0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E},
 {0x11,0x11,0x11,0x11,0x11,0x11,0x0E},
 {0x0E,0x11,0x10,0x10,0x10,0x11,0x0E},
 {0x01,0x01,0x01,0x01,0x11,0x11,0x0E},
};
static int glyph_idx(char c){
    if(c>='a'&&c<='z') c-=32;
    for(int i=0;FC[i];i++) if(FC[i]==c) return i;
    return 0;
}
static void text(Uint32*fb,int x,int y,const char*s,int px,Uint32 col){
    for(;*s;s++){
        const unsigned char*g=FONT[glyph_idx(*s)];
        for(int r=0;r<7;r++) for(int c=0;c<5;c++)
            if(g[r]&(1<<(4-c))) rect(fb,x+c*px,y+r*px,px,px,col);
        x+=6*px;
    }
}
#ifndef PLANET_TOOL_EMBEDDED
static int textw(const char*s,int px){ int n=0; for(;*s;s++) n++; return n*6*px; }
static void arrow(Uint32*fb,int x,int y,int w,int h,int right,Uint32 col){
    for(int i=0;i<w;i++){
        float f = right ? (float)(w-1-i)/(w-1) : (float)i/(w-1);
        int half=(int)(f*(h/2));
        rect(fb,x+i,y+h/2-half,1,2*half+1,col);
    }
}
#endif

/* ---- BMP read / write (24-bit BI_RGB, row 0 = top) --------------------- */
static void wr16(FILE*f,unsigned v){ fputc(v&0xff,f); fputc((v>>8)&0xff,f); }
static void wr32(FILE*f,unsigned v){ for(int i=0;i<4;i++){ fputc(v&0xff,f); v>>=8; } }
static int bmp_write(const char*path,const unsigned char*rgb,int w,int h){
    int rb=(w*3+3)&~3; unsigned img=(unsigned)rb*h;
    FILE*f=fopen(path,"wb"); if(!f) return 0;
    fputc('B',f); fputc('M',f); wr32(f,54+img); wr32(f,0); wr32(f,54);
    wr32(f,40); wr32(f,(unsigned)w); wr32(f,(unsigned)h); wr16(f,1); wr16(f,24);
    wr32(f,0); wr32(f,img); wr32(f,2835); wr32(f,2835); wr32(f,0); wr32(f,0);
    for(int y=h-1;y>=0;y--){
        const unsigned char*row=rgb+(size_t)y*w*3;
        for(int x=0;x<w;x++){ fputc(row[x*3+2],f); fputc(row[x*3+1],f); fputc(row[x*3+0],f); }
        for(int p=w*3;p<rb;p++) fputc(0,f);
    }
    fclose(f); return 1;
}
static int bmp_read(const char*path,unsigned char**out,int*ow,int*oh){
    FILE*f=fopen(path,"rb"); if(!f) return 0;
    unsigned char hd[54];
    if(fread(hd,1,54,f)!=54 || hd[0]!='B' || hd[1]!='M'){ fclose(f); return 0; }
    unsigned off =(unsigned)hd[10]|(unsigned)hd[11]<<8|(unsigned)hd[12]<<16|(unsigned)hd[13]<<24;
    int      w   =(int)((unsigned)hd[18]|(unsigned)hd[19]<<8|(unsigned)hd[20]<<16|(unsigned)hd[21]<<24);
    int      sh  =(int)((unsigned)hd[22]|(unsigned)hd[23]<<8|(unsigned)hd[24]<<16|(unsigned)hd[25]<<24);
    unsigned bpp =(unsigned)hd[28]|(unsigned)hd[29]<<8;
    unsigned comp=(unsigned)hd[30]|(unsigned)hd[31]<<8|(unsigned)hd[32]<<16|(unsigned)hd[33]<<24;
    int top=sh<0, H=top?-sh:sh;
    if(comp!=0 || (bpp!=24&&bpp!=32) || w<=0 || H<=0 || w>4096 || H>4096){ fclose(f); return 0; }
    int bp=bpp/8, rb=(w*bp+3)&~3;
    unsigned char*buf=malloc((size_t)rb*H);
    unsigned char*rgb=malloc((size_t)w*H*3);
    if(!buf||!rgb){ free(buf); free(rgb); fclose(f); return 0; }
    fseek(f,(long)off,SEEK_SET);
    if(fread(buf,1,(size_t)rb*H,f)!=(size_t)rb*H){ free(buf); free(rgb); fclose(f); return 0; }
    fclose(f);
    for(int sy=0;sy<H;sy++){
        int dy = top ? sy : (H-1-sy);
        const unsigned char*sr=buf+(size_t)sy*rb;
        for(int x=0;x<w;x++){
            unsigned char*d=rgb+((size_t)dy*w+x)*3;
            d[0]=sr[x*bp+2]; d[1]=sr[x*bp+1]; d[2]=sr[x*bp+0];
        }
    }
    free(buf); *out=rgb; *ow=w; *oh=H; return 1;
}
static int page_star_kind(int page){
	switch(page){
	        case PAGE_STAR_YELLOW: return SPACE_OBJ_YELLOW_STAR;
	        case PAGE_STAR_RED_DWARF: return SPACE_OBJ_RED_DWARF;
	        case PAGE_STAR_WHITE_DWARF: return SPACE_OBJ_WHITE_DWARF;
	        case PAGE_STAR_BLUE_WHITE: return SPACE_OBJ_BLUE_WHITE_STAR;
	        case PAGE_STAR_NEUTRON: return SPACE_OBJ_NEUTRON_STAR;
	        case PAGE_STAR_HERBIG_HARO: return SPACE_OBJ_HERBIG_HARO;
	        default: return SPACE_OBJ_NONE;
	    }
}
static int page_is_star(int page){
	return page_star_kind(page) != SPACE_OBJ_NONE;
}
static const char *palette_path(int pal){
	switch(pal){
	        case PAL_AIRLESS: return "airless_palette.bmp";
	        case PAL_GAS: return "gas_palette.bmp";
	        case PAL_COMET: return "comet_palette.bmp";
	        default: return "palette.bmp";
	    }
}
static const char *aurora_path(int pal){
	    switch(pal){
	        case PAL_AIRLESS: return "airless_aurora_palette.bmp";
	        case PAL_GAS: return "gas_aurora_palette.bmp";
	        case PAL_COMET: return "comet_coma_palette.bmp";
	        default: return "aurora_palette.bmp";
	    }
}
static int palette_rows(int pal){
	    switch(pal){
	        case PAL_GAS: return PAL_ROWS_GAS;
	        case PAL_AIRLESS: return PAL_ROWS_AIRLESS;
	        case PAL_COMET: return PAL_ROWS_COMET;
	        default: return PAL_ROWS_EARTH;
	    }
}
static int palette_for_page(int page){
	    if(page==PAGE_AIRLESS) return PAL_AIRLESS;
	    if(page==PAGE_GAS) return PAL_GAS;
	    if(page==PAGE_COMET) return PAL_COMET;
	    return PAL_EARTH;
}
static void export_palette_file(int pal){
    int rows=palette_rows(pal), n=PAL_COLS*rows;
    unsigned char rgb[PAL_COLS*PAL_ROWS_MAX*3];
    for(int i=0;i<n;i++){ rgb[i*3]=(unsigned char)(clampf(PAL[pal][i][0],0,1)*255);
        rgb[i*3+1]=(unsigned char)(clampf(PAL[pal][i][1],0,1)*255);
        rgb[i*3+2]=(unsigned char)(clampf(PAL[pal][i][2],0,1)*255); }
    bmp_write(palette_path(pal),rgb,PAL_COLS,rows);
}
static void export_aurora_file(int pal){
    unsigned char rgb[AUR_COLS*3];
    for(int i=0;i<AUR_COLS;i++){ rgb[i*3]=(unsigned char)(clampf(AUR[pal][i][0],0,1)*255);
        rgb[i*3+1]=(unsigned char)(clampf(AUR[pal][i][1],0,1)*255);
        rgb[i*3+2]=(unsigned char)(clampf(AUR[pal][i][2],0,1)*255); }
    bmp_write(aurora_path(pal),rgb,AUR_COLS,1);
}
static int import_palette_file(int pal){
    unsigned char*o; int w,h;
    int rows=palette_rows(pal), n=PAL_COLS*rows;
    if(!bmp_read(palette_path(pal),&o,&w,&h)) return 0;
    if(w!=PAL_COLS||h!=rows){ free(o); return 0; }
    for(int i=0;i<n;i++){ PAL[pal][i][0]=o[i*3]/255.0f; PAL[pal][i][1]=o[i*3+1]/255.0f; PAL[pal][i][2]=o[i*3+2]/255.0f; }
    free(o); return 1;
}
static int import_aurora_file(int pal){
    unsigned char*o; int w,h;
    if(!bmp_read(aurora_path(pal),&o,&w,&h)) return 0;
    if(w!=AUR_COLS||h!=1){ free(o); return 0; }
    for(int i=0;i<AUR_COLS;i++){ AUR[pal][i][0]=o[i*3]/255.0f; AUR[pal][i][1]=o[i*3+1]/255.0f; AUR[pal][i][2]=o[i*3+2]/255.0f; }
    free(o); return 1;
}
static void export_dither(void){
    unsigned char rgb[4*4*3];
    for(int i=0;i<16;i++){ unsigned char g=(unsigned char)(BAYER[i]*17); rgb[i*3]=rgb[i*3+1]=rgb[i*3+2]=g; }
    bmp_write("dither.bmp",rgb,4,4);
}
static int import_dither(void){
    unsigned char*o; int w,h;
    if(!bmp_read("dither.bmp",&o,&w,&h)) return 0;
    if(w!=4||h!=4){ free(o); return 0; }
    for(int i=0;i<16;i++){ int v=(int)(o[i*3]/17.0f+0.5f); BAYER[i]=v<0?0:(v>15?15:v); }
    free(o); return 1;
}
static void reset_tool_assets(void){
	memcpy(PAL[PAL_EARTH],DEF_PAL,sizeof DEF_PAL);
	memcpy(PAL[PAL_AIRLESS],DEF_AIRLESS_PAL,sizeof DEF_AIRLESS_PAL);
	memcpy(PAL[PAL_GAS],DEF_GAS_PAL,sizeof DEF_GAS_PAL);
	memcpy(PAL[PAL_COMET],DEF_COMET_PAL,sizeof DEF_COMET_PAL);
    memcpy(AUR,DEF_AUR,sizeof DEF_AUR);
    memcpy(BAYER,DEF_BAYER,sizeof BAYER);
}
static void load_tool_assets(int verbose){
    for(int pal=0; pal<NPALS; pal++){
        if(import_palette_file(pal)){
            if(verbose) printf("imported %s\n", palette_path(pal));
        } else {
            export_palette_file(pal);
            if(verbose) printf("exported default %s\n", palette_path(pal));
        }
        if(import_aurora_file(pal)){
            if(verbose) printf("imported %s\n", aurora_path(pal));
        } else {
            export_aurora_file(pal);
            if(verbose) printf("exported default %s\n", aurora_path(pal));
        }
    }
    if(import_dither()){
        if(verbose) puts("imported dither.bmp");
    } else {
        export_dither();
        if(verbose) puts("exported default dither.bmp");
    }
}
static int export_game_palette_rows(const char *path, int pal, const int *rows, int nrows, int aur_pal){
    unsigned char rgb[PAL_COLS*PAL_ROWS_MAX*3];
    if(nrows<=0 || nrows>PAL_ROWS_MAX) return 0;
    for(int y=0;y<nrows;y++){
        for(int x=0;x<PAL_COLS;x++){
            const float *c;
            if(rows[y]<0) c=AUR[aur_pal][x];
            else c=PAL[pal][rows[y]*PAL_COLS+x];
            int i=(y*PAL_COLS+x)*3;
            rgb[i]=(unsigned char)(clampf(c[0],0,1)*255);
            rgb[i+1]=(unsigned char)(clampf(c[1],0,1)*255);
            rgb[i+2]=(unsigned char)(clampf(c[2],0,1)*255);
        }
    }
    if(!bmp_write(path,rgb,PAL_COLS,nrows)){
        fprintf(stderr,"warning: could not write %s\n",path);
        return 0;
    }
    printf("exported %s\n",path);
    return 1;
}
static int export_game_palette_targets(const char *const *paths, int npaths, int pal, const int *rows, int nrows, int aur_pal){
    int ok=1;
    for(int i=0;i<npaths;i++)
        if(!export_game_palette_rows(paths[i],pal,rows,nrows,aur_pal)) ok=0;
    return ok;
}
static int export_game_space_dither(void){
    unsigned char rgb[8*8*3];
    for(int y=0;y<8;y++) for(int x=0;x<8;x++){
        int base=BAYER[((y>>1)&3)*4+((x>>1)&3)];
        unsigned char g=(unsigned char)(base*17);
        int i=(y*8+x)*3;
        rgb[i]=rgb[i+1]=rgb[i+2]=g;
    }
    if(!bmp_write("space_dither.bmp",rgb,8,8)){
        fputs("warning: could not write space_dither.bmp\n",stderr);
        return 0;
    }
    puts("exported space_dither.bmp");
    return 1;
}

static void randomize(Params*p,int page);
static void render_planet(Uint32 *fb, float t, const Params*p);
static void render_orbital(Uint32 *fb, float t, const Params*p);
static void render_airless(Uint32 *fb, float t, const Params*p);
static void render_comet(Uint32 *fb, float t, const Params*p);
static void render_gas(Uint32 *fb, float t, const Params*p);
static void render_star_object(Uint32 *fb, float t, const Params*p, int kind);
static void draw_rings(Uint32 *fb, int page, float t, const Params*p);
static const char *page_name(int page);

static int export_game_assets(void){
    const int earth_rows[4]={0,1,2,3};
	const int airless_rows[4]={0,1,2,3};
	const int polar_airless_rows[5]={0,1,2,3,-1};
	const int gas_rows[4]={0,1,2,4};
	const int polar_gas_rows[5]={0,1,2,4,-1};
	const int comet_rows[4]={0,1,2,3};
	const char *const earth_targets[]={"earthlike.bmp","pixel.bmp"};
    const char *const airless_targets[]={
        "metal_world.bmp","rust_world.bmp","ash_world.bmp","scoria_body.bmp",
        "blasted_world.bmp","moon.bmp","shepard_moon.bmp"
    };
    const char *const gas_targets[]={"gas_giant.bmp","ice_giant.bmp"};
    int ok=1;

    for(int pal=0; pal<NPALS; pal++){
        export_palette_file(pal);
        printf("exported %s\n",palette_path(pal));
        export_aurora_file(pal);
        printf("exported %s\n",aurora_path(pal));
    }
    export_dither();
    puts("exported dither.bmp");
    if(!export_game_space_dither()) ok=0;
    if(!export_game_palette_targets(earth_targets,(int)(sizeof earth_targets/sizeof earth_targets[0]),
                                   PAL_EARTH,earth_rows,4,PAL_EARTH)) ok=0;
    if(!export_game_palette_targets(airless_targets,(int)(sizeof airless_targets/sizeof airless_targets[0]),
                                   PAL_AIRLESS,airless_rows,4,PAL_AIRLESS)) ok=0;
    if(!export_game_palette_rows("polar_world.bmp",PAL_AIRLESS,polar_airless_rows,5,PAL_AIRLESS)) ok=0;
	if(!export_game_palette_targets(gas_targets,(int)(sizeof gas_targets/sizeof gas_targets[0]),
	                                   PAL_GAS,gas_rows,4,PAL_GAS)) ok=0;
	if(!export_game_palette_rows("polar_gas_giant.bmp",PAL_GAS,polar_gas_rows,5,PAL_GAS)) ok=0;
	if(!export_game_palette_rows("comet.bmp",PAL_COMET,comet_rows,4,PAL_COMET)) ok=0;
	return ok;
}

static int pt_mkdir_one(const char *path)
{
	if (!path || !path[0]) return 0;
	if (mkdir(path, 0755) == 0) return 1;
	return errno == EEXIST;
}

static int pt_mkdir_p(const char *path)
{
	char tmp[PLANET_TOOL_PATH_MAX];
	size_t i, len;
	if (!path || !path[0]) return 0;
	snprintf(tmp, sizeof(tmp), "%s", path);
	len = strlen(tmp);
	if (len == 0) return 0;
	if (tmp[len - 1] == '/') tmp[len - 1] = '\0';
	for (i = 1; tmp[i]; i++) {
		if (tmp[i] == '/') {
			tmp[i] = '\0';
			if (!pt_mkdir_one(tmp)) return 0;
			tmp[i] = '/';
		}
	}
	return pt_mkdir_one(tmp);
}

static void pt_safe_name(const char *src, char *dst, size_t n)
{
	size_t j = 0;
	int last_us = 0;
	if (!dst || n == 0) return;
	if (!src || !src[0]) src = "SYSTEM";
	while (*src && j + 1 < n) {
		unsigned char ch = (unsigned char)*src++;
		if (isalnum(ch)) {
			dst[j++] = (char)toupper(ch);
			last_us = 0;
		} else if (!last_us && j > 0) {
			dst[j++] = '_';
			last_us = 1;
		}
	}
	while (j > 0 && dst[j - 1] == '_') j--;
	if (j == 0) {
		snprintf(dst, n, "SYSTEM");
		return;
	}
	dst[j] = '\0';
}

static int pt_cfg_matches(const char *path, uint32_t seed, int system_type)
{
	FILE *f = fopen(path, "r");
	char line[256];
	int saw_seed = 0, saw_type = 0;
	if (!f) return 0;
	while (fgets(line, sizeof(line), f)) {
		unsigned long parsed_seed;
		int parsed_type;
		if (sscanf(line, "seed=%lx", &parsed_seed) == 1) saw_seed = ((uint32_t)parsed_seed == seed);
		else if (sscanf(line, "system_type=%d", &parsed_type) == 1) saw_type = (parsed_type == system_type);
	}
	fclose(f);
	return saw_seed && saw_type;
}

static int pt_write_cfg(const char *path, const char *display_name, int system_type, uint32_t seed)
{
	FILE *f = fopen(path, "w");
	if (!f) return 0;
	fprintf(f, "schema_version=1\n");
	fprintf(f, "name=%s\n", display_name && display_name[0] ? display_name : "SYSTEM");
	fprintf(f, "seed=%08x\n", (unsigned)seed);
	fprintf(f, "system_type=%d\n", system_type);
	fprintf(f, "solver_status=generated\n");
	fprintf(f, "constraints_version=0\n");
	fclose(f);
	return 1;
}

static int pt_join_path(const char *a, const char *b, char *out, size_t out_size)
{
	size_t alen, blen;
	if (!a || !b || !out || out_size == 0) return 0;
	alen = strlen(a);
	blen = strlen(b);
	if (alen + 1 + blen + 1 > out_size) return 0;
	memcpy(out, a, alen);
	out[alen] = '/';
	memcpy(out + alen + 1, b, blen + 1);
	return 1;
}

static int pt_chdir_call(const char *dir, int (*fn)(void))
{
	char old_cwd[PLANET_TOOL_PATH_MAX];
	int ok;
	if (!dir || !dir[0] || !fn) return 0;
	if (getcwd(old_cwd, sizeof(old_cwd)) == NULL) return 0;
	if (!pt_mkdir_p(dir)) return 0;
	if (chdir(dir) != 0) return 0;
	ok = fn();
	if (chdir(old_cwd) != 0) return 0;
	return ok;
}

static int pt_export_game_assets_current_dir(void)
{
	reset_tool_assets();
	load_tool_assets(0);
	return export_game_assets();
}

int planet_tool_export_game_assets_to(const char *asset_dir)
{
	return pt_chdir_call(asset_dir, pt_export_game_assets_current_dir);
}

static void pt_generate_palettes_for_seed(uint32_t seed)
{
	Params p = default_params();
	srand(seed ? seed : 1u);
	reset_tool_assets();
	randomize(&p, PAGE_PLANET);
	randomize(&p, PAGE_AIRLESS);
	randomize(&p, PAGE_GAS);
	randomize(&p, PAGE_COMET);
}

static int pt_generate_assets_current_dir(void)
{
	return export_game_assets();
}

int planet_tool_generate_system(const char *systems_root, const char *display_name,
                                int system_type, uint32_t seed,
                                char *out_system_dir, size_t out_system_dir_size,
                                char *out_asset_dir, size_t out_asset_dir_size)
{
	char safe[96], base[160], system_dir[PLANET_TOOL_PATH_MAX], asset_dir[PLANET_TOOL_PATH_MAX], cfg_path[PLANET_TOOL_PATH_MAX];
	int attempt;
	if (!systems_root || !systems_root[0]) systems_root = "systems";
	if (!pt_mkdir_p(systems_root)) return 0;
	pt_safe_name(display_name, safe, sizeof(safe));
	snprintf(base, sizeof(base), "%s-%08x", safe, (unsigned)seed);
	for (attempt = 0; attempt < 100; attempt++) {
		if (attempt == 0)
			snprintf(system_dir, sizeof(system_dir), "%s/%s", systems_root, base);
		else
			snprintf(system_dir, sizeof(system_dir), "%s/%s-%02d", systems_root, base, attempt);
		if (!pt_join_path(system_dir, "system.cfg", cfg_path, sizeof(cfg_path))) return 0;
		if (pt_mkdir_p(system_dir) && (access(cfg_path, F_OK) != 0 || pt_cfg_matches(cfg_path, seed, system_type))) break;
		if (access(cfg_path, F_OK) == 0 && !pt_cfg_matches(cfg_path, seed, system_type)) continue;
		break;
	}
	if (attempt >= 100) return 0;
	if (!pt_join_path(system_dir, "assets", asset_dir, sizeof(asset_dir))) return 0;
	if (!pt_mkdir_p(asset_dir)) return 0;
	if (!pt_write_cfg(cfg_path, display_name, system_type, seed)) return 0;
	if (out_system_dir && out_system_dir_size > 0) snprintf(out_system_dir, out_system_dir_size, "%s", system_dir);
	if (out_asset_dir && out_asset_dir_size > 0) snprintf(out_asset_dir, out_asset_dir_size, "%s", asset_dir);
	{
		char old_cwd[PLANET_TOOL_PATH_MAX];
		int ok;
		if (getcwd(old_cwd, sizeof(old_cwd)) == NULL) return 0;
		if (chdir(asset_dir) != 0) return 0;
		pt_generate_palettes_for_seed(seed ^ (uint32_t)(system_type * 0x45d9f3bu));
		ok = pt_generate_assets_current_dir();
		if (chdir(old_cwd) != 0) return 0;
		if (!ok) return 0;
	}
	return 1;
}

void planet_tool_menu_init(PlanetToolMenuState *state, const char *system_name,
                           int system_type, uint32_t seed,
                           const char *system_dir, const char *asset_dir)
{
	(void)system_type;
	if (!state) return;
	memset(state, 0, sizeof(*state));
	state->seed = seed;
	snprintf(state->system_name, sizeof(state->system_name), "%s", system_name && system_name[0] ? system_name : "SYSTEM");
	snprintf(state->system_dir, sizeof(state->system_dir), "%s", system_dir ? system_dir : "");
	snprintf(state->asset_dir, sizeof(state->asset_dir), "%s", asset_dir ? asset_dir : "");
	snprintf(state->status, sizeof(state->status), "READY");
}

int planet_tool_menu_key(PlanetToolMenuState *state, int key)
{
	static const int params = 4;
	if (!state) return 0;
	if (key == '\t') state->page = (state->page + 1) % NPAGES;
	else if (key == 0x51 || key == 'h') state->selected = (state->selected + params - 1) % params;
	else if (key == 0x53 || key == 'l') state->selected = (state->selected + 1) % params;
	else if (key == 'r' || key == 'R') {
		if (state->asset_dir[0] && planet_tool_export_game_assets_to(state->asset_dir))
			snprintf(state->status, sizeof(state->status), "EXPORTED ASSETS");
		else
			snprintf(state->status, sizeof(state->status), "EXPORT FAILED");
	} else return 0;
	return 1;
}

void planet_tool_menu_render_argb(const PlanetToolMenuState *state, uint32_t *dst,
                                  int width, int height, float time_sec)
{
	Params p = default_params();
	int x, y, page = state ? state->page : PAGE_PLANET;
	uint32_t *tmp;
	if (!dst || width <= 0 || height <= 0) return;
	tmp = (uint32_t *)calloc((size_t)WIN_W * (size_t)WIN_H, sizeof(uint32_t));
	if (!tmp) return;
	srand(state ? state->seed : 1u);
	reset_tool_assets();
	if (page_is_star(page)) {
		render_star_object(tmp, time_sec, &p, page_star_kind(page));
	} else {
		switch (page) {
		case PAGE_ORBITAL: render_orbital(tmp, time_sec, &p); break;
		case PAGE_AIRLESS: render_airless(tmp, time_sec, &p); break;
		case PAGE_GAS: render_gas(tmp, time_sec, &p); break;
		case PAGE_COMET: render_comet(tmp, time_sec, &p); break;
		default: render_planet(tmp, time_sec, &p); break;
		}
	}
	draw_rings(tmp, page, time_sec, &p);
	if (state) {
		text(tmp, 10, 10, "PLANET TOOL", 2, 0xFFFFFFFFu);
		text(tmp, 10, 34, state->system_name, 1, 0xFFE8D070u);
		text(tmp, 10, 50, page_name(page), 1, 0xFFB8D8FFu);
		text(tmp, 10, WIN_H - 24, state->status, 1, 0xFFD8D8E8u);
	}
	for (y = 0; y < height; y++) {
		int sy = (int)((int64_t)y * WIN_H / height);
		for (x = 0; x < width; x++) {
			int sx = (int)((int64_t)x * WIN_W / width);
			dst[y * width + x] = tmp[sy * WIN_W + sx];
		}
	}
	free(tmp);
}

/* ---- randomize --------------------------------------------------------- */
static void fill_row(float pal[][3],int row,float hue,float s0,float s1,float v0,float v1){
    for(int i=0;i<5;i++){ float f=i/4.0f,r,g,b;
        hsv(hue, s0+(s1-s0)*f, v0+(v1-v0)*f, &r,&g,&b);
        pal[row*5+i][0]=r; pal[row*5+i][1]=g; pal[row*5+i][2]=b; }
}
static void randomize(Params*p,int page){
    float h=frand(), ch=frand();
    int palid=palette_for_page(page);
    float (*pal)[3]=PAL[palid];
    float ah=frand();
	if(page_is_star(page)){
	    p->rad = 0.28f + frand()*0.48f;
	    p->freq = 4.0f + frand()*7.5f;
	    p->spin = (0.07f+frand()*0.36f) * (frand()<0.5f?-1.0f:1.0f);
	    p->tilt = (frand()-0.5f)*1.4f;
	    p->lightning = 0.35f + frand()*0.65f;
	    p->lightHue = frand();
	    p->cityDens = 0.20f + frand()*0.80f;
	    p->aurora = 0.25f + frand()*0.75f;
	    p->rings = 0.20f + frand()*0.80f;
	    puts("randomized -> star preview controls updated");
	    return;
	}
	if(page==PAGE_GAS){
	        fill_row(pal,0, h,       0.58f,0.38f, 0.32f,0.95f);
	        fill_row(pal,1, h+0.04f, 0.80f,0.62f, 0.14f,0.58f);
	        fill_row(pal,2, h+0.08f, 0.48f,0.30f, 0.42f,1.00f);
	        fill_row(pal,3, h+0.58f, 0.50f,0.35f, 0.10f,0.55f);
	        fill_row(pal,4, ch,      0.32f,0.12f, 0.55f,1.00f);
	        fill_row(pal,5, ch+0.08f,0.18f,0.02f, 0.70f,1.00f);
	    } else if(page==PAGE_COMET){
	        float iceh=0.50f+frand()*0.12f;
	        fill_row(pal,0, h,       0.24f,0.10f, 0.12f,0.62f);
	        fill_row(pal,1, iceh,    0.38f,0.02f, 0.34f,1.00f);
	        fill_row(pal,2, iceh+0.04f,0.70f,0.02f, 0.42f,1.00f);
	        fill_row(pal,3, iceh+0.08f,0.62f,0.04f, 0.36f,1.00f);
	    } else if(page==PAGE_AIRLESS){
	        fill_row(pal,0, h,       0.52f,0.28f, 0.18f,0.74f);
        fill_row(pal,1, h+0.08f, 0.38f,0.18f, 0.16f,0.68f);
        fill_row(pal,2, h+0.15f, 0.70f,0.46f, 0.12f,0.82f);
        fill_row(pal,3, h+0.50f, 0.34f,0.10f, 0.28f,0.95f);
    } else {
        fill_row(pal,0, h,        0.70f,0.45f, 0.16f,0.80f);
        fill_row(pal,1, h+0.07f,  0.85f,0.60f, 0.35f,0.88f);
        fill_row(pal,2, h+0.45f,  0.75f,0.55f, 0.16f,0.72f);
        fill_row(pal,3, ch,       0.10f,0.00f, 0.55f,1.00f);
    }
	if(page==PAGE_COMET) p->rad = 0.16f + frand()*0.34f;
	else p->rad = 0.28f + frand()*0.50f;
	p->sea   = 0.38f + frand()*0.14f;
	p->freq  = 2.2f  + frand()*2.8f;
    p->spin  = (0.05f+frand()*0.25f) * (frand()<0.5f?-1.0f:1.0f);
    p->tilt  = (frand()-0.5f)*1.4f;
    p->cthr  = 0.40f + frand()*0.18f;
    p->cfreq = 1.6f  + frand()*2.0f;
    p->cscale= 1.02f + frand()*0.06f;
    p->cdrift= (0.02f+frand()*0.06f) * (frand()<0.5f?-1.0f:1.0f);
	p->lightning = page==PAGE_COMET ? (0.25f + frand()*0.75f) : frand()*0.75f;
	p->lightHue = frand();
	p->craters = (page==PAGE_AIRLESS || page==PAGE_COMET) ? (0.25f + frand()*0.75f) : p->craters;
	p->aurora = page==PAGE_COMET ? frand() : frand()*0.85f;
	p->rings = page==PAGE_COMET ? (0.25f + frand()*0.75f) : frand()*0.75f;
	if(page==PAGE_COMET) p->cityDens = 0.35f + frand()*0.65f;
	for(int i=0;i<AUR_COLS;i++){
        float f=i/(float)(AUR_COLS-1), r,g,b;
        hsv(ah+0.08f*f, 0.78f-0.70f*f, 0.55f+0.45f*f, &r,&g,&b);
        AUR[palid][i][0]=r; AUR[palid][i][1]=g; AUR[palid][i][2]=b;
    }
    export_palette_file(palid);
    export_aurora_file(palid);
    printf("randomized -> %s and %s updated\n", palette_path(palid), aurora_path(palid));
}

/* star/space background for a single pixel (no planet limb) */
static void space_px(int px,int py,float half,float warmglow,float*R,float*G,float*B){
    float gx=floorf(px*0.5f), gy=floorf(py*0.5f);
    float st=fracf(sinf(gx*12.9898f+gy*78.233f)*43758.5453f)>0.9965f?0.7f:0.0f;
    float dx=px-PW*0.5f, dy=py-PH*0.5f, dd=(dx*dx+dy*dy)/(half*half);
    float gl=expf(-dd*6.0f)*warmglow;
    *R=st+gl; *G=st+gl*0.85f; *B=st+gl*0.5f;
}
static void add_lightning(float*qR,float*qG,float*qB,float x,float y,float z,float night,float amount,float t,int salt){
    if(amount<=0.001f || night<=0.02f) return;
    float freq=22.0f-14.0f*clampf(amount,0,1), tick=floorf(t*9.0f);
    float gx=floorf((x+1.0f)*freq), gy=floorf((y+1.0f)*freq), gz=floorf((z+1.0f)*freq);
    float chance=0.018f+0.13f*amount;
    if(hash3(gx+salt*7.0f,gy+tick*13.0f,gz-tick*5.0f)>chance) return;
    float fx=fracf((x+1.0f)*freq)-0.5f, fy=fracf((y+1.0f)*freq)-0.5f, fz=fracf((z+1.0f)*freq)-0.5f;
    float core=1.0f-sqrtf(fx*fx+fy*fy+fz*fz)*(2.4f-1.1f*amount);
    float branch=smoothstep(0.35f,0.82f,fbm(x*70.0f+t*8.0f+salt,y*70.0f-salt,z*70.0f));
    float a=night*amount*clampf(core,0,1)*(0.50f+0.85f*branch);
    *qR+=0.80f*a; *qG+=0.90f*a; *qB+=1.35f*a;
}
static void add_aurora(int palid,float*qR,float*qG,float*qB,float x,float y,float z,float lam,float amount,float t){
    static const float ring_latitudes[3]={0.76f,0.86f,0.66f};
    const float base_half_width=0.035f;
    float ring_half_width, ring=0.0f, night, a;
    int ring_count;
    (void)x;
    (void)z;
    (void)t;
    if(amount<=0.001f) return;
    ring_half_width=base_half_width+0.020f*clampf(amount,0.0f,1.0f);
    ring_count=1+(int)floorf(clampf(amount,0.0f,1.0f)*2.999f);
    for(int i=0;i<ring_count;i++){
        float distance=fabsf(fabsf(y)-ring_latitudes[i]);
        float contribution=1.0f-smoothstep(ring_half_width*0.65f,ring_half_width,distance);
        if(contribution>ring) ring=contribution;
    }
    if(ring<=0.001f) return;
    night=smoothstep(0.22f,-0.18f,lam);
    a=amount*ring*(0.30f+0.70f*night);
    *qR+=AUR[palid][2][0]*a*0.85f;
    *qG+=AUR[palid][2][1]*a*0.85f;
    *qB+=AUR[palid][2][2]*a*0.85f;
}

static void add_herbig_haro_preview(float sx,float sy,float Rs,float axis_x,float axis_y,int surfIn,float t,
                                    float *R,float *G,float *B){
    float nx,ny,along,across,aa,torus,knots,cone_w,cone=0.0f,cloud,jet;
    if(Rs<=1.0f) return;
    nx=sx/Rs;
    ny=sy/Rs;
    along=nx*axis_x+ny*axis_y;
    across=nx*(-axis_y)+ny*axis_x;
    aa=fabsf(along);
    torus=expf(-powf((fabsf(across)-1.24f)/0.24f,2.0f)-powf(along/0.24f,2.0f));
    knots=0.55f+0.45f*fbm(across*5.5f+t*0.08f,along*7.0f-t*0.05f,3.1f);
    cone_w=0.09f+aa*0.18f;
    if(aa>0.62f && aa<2.05f && fabsf(across)<cone_w){
        float ru=fabsf(across)/fmaxf(cone_w,0.001f);
        float fade=powf(clampf(1.0f-aa/2.05f,0.0f,1.0f),0.75f);
        float rim=expf(-powf((ru-0.62f)/0.32f,2.0f));
        cone=(0.18f+0.50f*rim)*fade*(0.55f+0.45f*knots);
    }
    cloud=torus*(0.16f+0.16f*knots);
    jet=cone*0.26f;
    if(surfIn){
        cloud*=0.28f;
        jet*=0.45f;
    }
    *R+=1.00f*jet+0.65f*cloud;
    *G+=0.64f*jet+0.34f*cloud;
    *B+=0.22f*jet+0.12f*cloud;
}

/* ---- STAR: spec-driven glowing sphere + corona ------------------------- */
static void render_star_object(Uint32 *fb, float t, const Params*p, int kind){
    const SpaceObjectSpec *sp;
    const SpaceStarSpec *star;
    float tintR,tintG,tintB,glowR,glowG,glowB,fogR,fogG,fogB,coreR,coreG,coreB,edgeR,edgeG,edgeB,filR,filG,filB;
    float hueR,hueG,hueB;
    float half=0.5f*(PW<PH?PW:PH);
    float preview_scale, Rs, ay, ax, gran_scale, corona_gain;
    float jet_axis_x=0.0f,jet_axis_y=1.0f,jet_axis_z=0.0f,jet_axis_len;
    int herbig_haro;
    int scale=p->scale;
    if(!space_object_kind_is_star_like(kind)) kind=SPACE_OBJ_YELLOW_STAR;
    sp=space_object_spec(kind);
    star=space_object_star_spec(kind);
    unpack_rgbf(star->tint_rgb,&tintR,&tintG,&tintB);
    unpack_rgbf(star->sky_glow_rgb,&glowR,&glowG,&glowB);
    unpack_rgbf(star->fog_rgb,&fogR,&fogG,&fogB);
    unpack_rgbf(star->core_rgb,&coreR,&coreG,&coreB);
    unpack_rgbf(star->edge_rgb,&edgeR,&edgeG,&edgeB);
    unpack_rgbf(star->filament_rgb,&filR,&filG,&filB);
    hsv(p->lightHue,0.28f,1.0f,&hueR,&hueG,&hueB);
    preview_scale=(float)star->preview_scale;
    Rs=half*clampf(p->rad*preview_scale,0.12f,0.90f);
    ay=t*p->spin+p->viewYaw;
    ax=p->tilt+p->viewPitch;
    herbig_haro=sp->render_class==SPACE_OBJECT_RENDER_HERBIG_HARO;
    if(herbig_haro){
        rotate_view(0.0f,1.0f,0.0f,ay,ax,&jet_axis_x,&jet_axis_y,&jet_axis_z);
        jet_axis_len=sqrtf(jet_axis_x*jet_axis_x+jet_axis_y*jet_axis_y);
        if(jet_axis_len<0.08f){ jet_axis_x=0.0f; jet_axis_y=1.0f; }
        else { jet_axis_x/=jet_axis_len; jet_axis_y/=jet_axis_len; }
    }
    gran_scale=(float)star->granulation*(star->compact?18.0f:8.0f)*(0.72f+0.56f*p->cityDens);
    corona_gain=(float)star->corona*(0.20f+0.95f*p->aurora);
    for(int by=0; by<PH; by+=scale){
        for(int bx=0; bx<PW; bx+=scale){
            int ccx=bx+scale/2, ccy=by+scale/2;
            if(ccx>=PW) ccx=PW-1;
            if(ccy>=PH) ccy=PH-1;
            float sx=ccx-PW*0.5f, sy=PH*0.5f-ccy;
            int xe=bx+scale<PW?bx+scale:PW, ye=by+scale<PH?by+scale:PH;
            float r2=sx*sx+sy*sy, r=sqrtf(r2), q=r/fmaxf(Rs,1.0f);
            int surfIn=r2<=Rs*Rs;
            float br=0,bg=0,bb=0,emit=0,filament=0,beam=0;
            if(surfIn){
                float us=sx/Rs, vs=sy/Rs, zs=sqrtf(1.0f-us*us-vs*vs);
                float qx,qy,qz, lon, lat, cells, fine, gran, band, limb, tintmix;
                rotate_view(us,vs,zs,ay,ax,&qx,&qy,&qz);
                lon=atan2f(qz,qx);
                lat=qy;
                cells=fbm(qx*gran_scale+t*0.11f, qy*gran_scale-t*0.07f, qz*gran_scale+t*0.05f);
                fine=fbm(qx*gran_scale*3.2f-t*0.24f, qy*gran_scale*3.2f+t*0.15f, qz*gran_scale*3.2f);
                band=0.5f+0.5f*sinf(lon*(star->compact?24.0f:9.0f)+lat*(star->compact?16.0f:7.0f)+t*(star->compact?2.2f:0.55f));
                gran=clampf(0.48f*cells+0.32f*fine+0.20f*band,0.0f,1.0f);
                limb=1.0f-zs;
                tintmix=0.08f+0.14f*p->lightning;
                br=edgeR+(coreR-edgeR)*(0.38f+0.58f*gran);
                bg=edgeG+(coreG-edgeG)*(0.38f+0.58f*gran);
                bb=edgeB+(coreB-edgeB)*(0.38f+0.58f*gran);
                br+=(hueR-br)*tintmix; bg+=(hueG-bg)*tintmix; bb+=(hueB-bb)*tintmix;
                filament=powf(clampf(fabsf(sinf(lon*5.0f+lat*11.0f+fine*5.0f+t*0.9f)),0,1),4.0f)*
                         (0.16f+0.56f*p->rings);
                if(star->compact){
                    float pole=powf(fabsf(lat),8.0f);
                    beam=pole*(0.25f+0.75f*smoothstep(0.38f,0.94f,band))*(0.35f+0.65f*p->lightning);
                    br=edgeR+(coreR-edgeR)*(0.52f+0.42f*gran);
                    bg=edgeG+(coreG-edgeG)*(0.52f+0.42f*gran);
                    bb=edgeB+(coreB-edgeB)*(0.52f+0.42f*gran);
                }
                emit=0.82f+0.44f*(1.0f-limb)+0.32f*gran+0.25f*beam;
                br=br*emit + filR*filament + tintR*beam*0.30f;
                bg=bg*emit + filG*filament + tintG*beam*0.30f;
                bb=bb*emit + filB*filament + tintB*beam*0.30f;
            }
            for(int py=by;py<ye;py++) for(int px=bx;px<xe;px++){
                float d=(BAYER[(py&3)*4+(px&3)]+0.5f)/16.0f, R,G,B;
                space_px(px,py,half,0.0f,&R,&G,&B);
                if(!surfIn){
                    float outer=q-1.0f;
                    float halo=outer>0.0f?expf(-outer*(star->compact?1.75f:2.35f))*corona_gain:0.0f;
                    float wide=outer>0.0f?expf(-outer*(star->compact?0.46f:0.72f))*corona_gain:0.0f;
                    float spike=outer>0.0f?powf(clampf(1.0f-outer/(star->compact?4.0f:2.6f),0,1),3.0f)*(0.08f+0.26f*p->lightning):0.0f;
                    R+=glowR*halo*0.72f+fogR*wide*0.18f+tintR*spike;
                    G+=glowG*halo*0.72f+fogG*wide*0.18f+tintG*spike;
                    B+=glowB*halo*0.72f+fogB*wide*0.18f+tintB*spike;
                } else {
                    float qemit=floorf((0.78f+0.28f*emit)*5.0f+d)/5.0f;
                    R=br*qemit; G=bg*qemit; B=bb*qemit;
                }
                if(herbig_haro) add_herbig_haro_preview(sx,sy,Rs,jet_axis_x,jet_axis_y,surfIn,t,&R,&G,&B);
                fb[py*WIN_W+px]=pack(R,G,B);
            }
        }
    }
}

/* ---- PLANET (sphere): surface -> city -> larger cloud shell ------------ */
static void render_planet(Uint32 *fb, float t, const Params*p){
    float (*pal)[3]=PAL[PAL_EARTH];
    float half=0.5f*(PW<PH?PW:PH);
    float Rs=half*p->rad, Rc=half*p->rad*p->cscale;
    float ay=t*p->spin+p->viewYaw, ax=p->tilt+p->viewPitch;
    float lx=cosf(t*0.1f)*0.8f, ly=0.45f, lz=sinf(t*0.1f)*0.4f+0.55f;
    float ln=1.0f/sqrtf(lx*lx+ly*ly+lz*lz); lx*=ln; ly*=ln; lz*=ln;
    int scale=p->scale; float sea=p->sea, coast=p->sea+0.04f;
    float cr,cg,cb; hsv(p->lightHue,0.55f,1.0f,&cr,&cg,&cb);

    for(int by=0; by<PH; by+=scale){
        for(int bx=0; bx<PW; bx+=scale){
            int ccx=bx+scale/2, ccy=by+scale/2;
            if(ccx>=PW) ccx=PW-1;
            if(ccy>=PH) ccy=PH-1;
            float sx=ccx-PW*0.5f, sy=PH*0.5f-ccy, d2=sx*sx+sy*sy;
            int xe=bx+scale<PW?bx+scale:PW, ye=by+scale<PH?by+scale:PH;
            int surfIn=d2<=Rs*Rs, cloudIn=d2<=Rc*Rc;

            float sbr=0,sbg=0,sbb=0, lamS=0, aR=0,aG=0,aB=0, night=0, sqx=0,sqy=0,sqz=0; int cityOn=0;
            if(surfIn){
                float us=sx/Rs, vs=sy/Rs, zs=sqrtf(1.0f-us*us-vs*vs);
                float qx,qy,qz;
                rotate_view(us,vs,zs,ay,ax,&qx,&qy,&qz);
                sqx=qx; sqy=qy; sqz=qz;
                int idx=terrain_idx(fbm(qx*p->freq,qy*p->freq,qz*p->freq),sea,coast);
                sbr=pal[idx][0]; sbg=pal[idx][1]; sbb=pal[idx][2];
                lamS=us*lx+vs*ly+zs*lz;
                float ll=lamS>0?lamS:0, limb=smoothstep(0.65f,1.0f,us*us+vs*vs);
                aR=0.10f*limb*ll; aG=0.20f*limb*ll; aB=0.35f*limb*ll;
                night=smoothstep(0.30f,0.05f,lamS);
                if(idx<=4){ float c=hash3(floorf(qx*CITYF),floorf(qy*CITYF),floorf(qz*CITYF));
                            if(c<p->cityDens) cityOn=1; }
            }
            int haveCloud=0; float cbr=0,cbg=0,cbb=0, lamC=0, cmask=0;
            if(cloudIn){
                float uc=sx/Rc, vc=sy/Rc, zc=sqrtf(1.0f-uc*uc-vc*vc);
                float qx,qy,qz;
                rotate_view(uc,vc,zc,ay,ax,&qx,&qy,&qz);
                float cl=fbm(qx*p->cfreq+t*p->cdrift, qy*p->cfreq, qz*p->cfreq);
                cmask=smoothstep(p->cthr,p->cthr+0.14f,cl)*0.9f;
                if(cmask>0.001f){
                    int ci=15+(int)(clampf((cl-p->cthr)/(HMAX-p->cthr),0,1)*4.999f);
                    cbr=pal[ci][0]; cbg=pal[ci][1]; cbb=pal[ci][2];
                    lamC=uc*lx+vc*ly+zc*lz; if(lamC<0) lamC=0; haveCloud=1;
                }
            }
            for(int py=by;py<ye;py++) for(int px=bx;px<xe;px++){
                float d=(BAYER[(py&3)*4+(px&3)]+0.5f)/16.0f; float R,G,B;
                if(surfIn){
                    float ll=lamS>0?lamS:0, Lq=floorf((0.08f+0.92f*ll)*5.0f+d)/5.0f;
                    R=sbr*Lq+aR; G=sbg*Lq+aG; B=sbb*Lq+aB;
                    if(cityOn){ R+=cr*night; G+=cg*night; B+=cb*night; }
                    /* Terrestrial lightning is produced only by the visible cloud layer. */
                    add_lightning(&R,&G,&B,sqx,sqy,sqz,night,p->lightning*cmask,t,3);
                    add_aurora(PAL_EARTH,&R,&G,&B,sqx,sqy,sqz,lamS,p->aurora,t);
                } else {
                    float pux=px-PW*0.5f, puy=PH*0.5f-py, pr2=(pux*pux+puy*puy)/(Rs*Rs);
                    float halo=clampf(expf(-(pr2-1.0f)*45.0f),0,1);
                    R=0.20f*halo*0.6f; G=0.40f*halo*0.6f; B=0.75f*halo*0.6f;
                    float gx=floorf(px*0.5f), gy=floorf(py*0.5f);
                    if(fracf(sinf(gx*12.9898f+gy*78.233f)*43758.5453f)>0.9965f){ R+=0.7f;G+=0.7f;B+=0.7f; }
                }
                if(haveCloud){
                    float Lc=floorf((0.08f+0.92f*lamC)*5.0f+d)/5.0f;
                    R+=(cbr*Lc-R)*cmask; G+=(cbg*Lc-G)*cmask; B+=(cbb*Lc-B)*cmask;
                }
                fb[py*WIN_W+px]=pack(R,G,B);
            }
        }
    }
}

/* ---- ORBITAL (Orbital): inner terrain arc, dark outer hull, ----------
 *      clouds on a SMALLER cylinder so they float above the surface.     */
static void render_orbital(Uint32 *fb, float t, const Params*p){
    float (*pal)[3]=PAL[PAL_EARTH];
    float half=0.5f*(PW<PH?PW:PH);
    float sizeN=(p->rad-RAD_MIN)/(RAD_MAX-RAD_MIN);
    float R=half*(0.5f+0.5f*sizeN), W=R*0.08f;                 /* ring radius, half-width */
    float Rcl=R*clampf(0.88f+(p->cscale-1.0f),0.80f,0.98f);    /* cloud cylinder: smaller */
    float phi=clampf(1.15f+p->viewPitch,0.30f,2.80f), cphi=cosf(phi), sphi=sinf(phi);
    float lx=cosf(t*0.1f)*0.85f, ly=0.30f, lz=sinf(t*0.1f)*0.85f;
    float ln=1.0f/sqrtf(lx*lx+ly*ly+lz*lz); lx*=ln; ly*=ln; lz*=ln;
    int scale=p->scale; float sea=p->sea, coast=p->sea+0.04f;
    float cr,cg,cb; hsv(p->lightHue,0.55f,1.0f,&cr,&cg,&cb);
    float gr=pal[15][0], gg=pal[15][1], gb=pal[15][2];         /* outer hull = cloud darkest */

    for(int by=0; by<PH; by+=scale){
        for(int bx=0; bx<PW; bx+=scale){
            int ccx=bx+scale/2, ccy=by+scale/2;
            if(ccx>=PW) ccx=PW-1;
            if(ccy>=PH) ccy=PH-1;
            float sx=ccx-PW*0.5f, sy=PH*0.5f-ccy;
            int xe=bx+scale<PW?bx+scale:PW, ye=by+scale<PH?by+scale:PH;

            int kind=0;                          /* 0 space, 1 inner terrain, 2 outer hull */
            float sbr=0,sbg=0,sbb=0, lam=0, night=0, lqx=0,lqy=0,lqz=0; int cityOn=0;
            int haveCloud=0; float cbr=0,cbg=0,cbb=0, lamC=0, cmask=0;

            /* ground cylinder (radius R): nearest valid arc wins (hull occludes) */
            if(sx>=-R && sx<=R){
                float c=sx/R, s=sqrtf(1.0f-c*c), bestZ=-1e9f, fsin=0, fz=0;
                for(int k=0;k<2;k++){
                    float sinth=(k?-1.0f:1.0f)*s;
                    float z=(sy + R*sinth*cphi)/sphi;
                    if(z>=-W && z<=W){
                        float Zp=R*sinth*sphi + z*cphi;
                        if(Zp>bestZ){ bestZ=Zp; fsin=sinth; fz=z; }
                    }
                }
                if(bestZ>-1e8f){
                    float sinth=fsin, costh=c, u=fz/W;
                    if(sinth<0.0f){                                  /* inner surface faces us */
                        kind=1;
                        float ang=atan2f(sinth,costh)+p->spin*t+p->viewYaw;
                        lqx=cosf(ang); lqy=sinf(ang); lqz=u;
                        int idx=terrain_idx(fbm(cosf(ang)*p->freq, sinf(ang)*p->freq, u*p->freq*0.6f),sea,coast);
                        sbr=pal[idx][0]; sbg=pal[idx][1]; sbb=pal[idx][2];
                        float nX=-costh, nY=sinth*cphi, nZ=-sinth*sphi;
                        lam=nX*lx+nY*ly+nZ*lz;
                        night=smoothstep(0.30f,0.05f,lam);
                        if(idx<=4){ float ch=hash3(floorf(cosf(ang)*CITYF),floorf(sinf(ang)*CITYF),floorf(u*CITYF));
                                    if(ch<p->cityDens) cityOn=1; }
                    } else {                                         /* outer hull faces us */
                        kind=2;
                        float oX=costh, oY=-sinth*cphi, oZ=sinth*sphi;
                        lam=oX*lx+oY*ly+oZ*lz;
                        sbr=gr; sbg=gg; sbb=gb;
                    }
                }
            }

            /* cloud cylinder (radius Rcl < R): inner arc only, floats in front of terrain */
            if(sx>=-Rcl && sx<=Rcl){
                float cc=sx/Rcl, sc=sqrtf(1.0f-cc*cc), sinth=-sc;
                float z=(sy + Rcl*sinth*cphi)/sphi;
                if(z>=-W && z<=W){
                    float u=z/W;
                    float ca=atan2f(sinth,cc)+p->spin*t*0.6f+p->cdrift*t+p->viewYaw;
                    float cl=fbm(cosf(ca)*p->cfreq, sinf(ca)*p->cfreq, u*p->cfreq*0.6f);
                    cmask=smoothstep(p->cthr,p->cthr+0.14f,cl)*0.9f;
                    if(cmask>0.001f){
                        int ci=15+(int)(clampf((cl-p->cthr)/(HMAX-p->cthr),0,1)*4.999f);
                        cbr=pal[ci][0]; cbg=pal[ci][1]; cbb=pal[ci][2];
                        float nX=-cc, nY=sinth*cphi, nZ=-sinth*sphi;
                        lamC=nX*lx+nY*ly+nZ*lz; if(lamC<0) lamC=0; haveCloud=1;
                    }
                }
            }

            for(int py=by;py<ye;py++) for(int px=bx;px<xe;px++){
                float d=(BAYER[(py&3)*4+(px&3)]+0.5f)/16.0f; float R2,G2,B2;
                float ll=lam>0?lam:0;
                if(kind==1){
                    float Lq=floorf((0.08f+0.92f*ll)*5.0f+d)/5.0f;
                    R2=sbr*Lq; G2=sbg*Lq; B2=sbb*Lq;
                    if(cityOn){ R2+=cr*night; G2+=cg*night; B2+=cb*night; }
                    /* The orbital's weather is likewise confined to its cloud cylinder. */
                    add_lightning(&R2,&G2,&B2,lqx,lqy,lqz,night,p->lightning*cmask,t,7);
                    add_aurora(PAL_EARTH,&R2,&G2,&B2,lqx,lqy,lqz,lam,p->aurora,t);
                } else if(kind==2){
                    float Lq=floorf((0.20f+0.55f*ll)*5.0f+d)/5.0f;   /* dark gray hull */
                    R2=sbr*Lq; G2=sbg*Lq; B2=sbb*Lq;
                } else {
                    space_px(px,py,half,0.25f,&R2,&G2,&B2);
                }
                if(haveCloud){                                       /* clouds float over */
                    float Lc=floorf((0.08f+0.92f*lamC)*5.0f+d)/5.0f;
                    float dusk=smoothstep(-0.18f,0.02f,lamC)*(1.0f-smoothstep(0.08f,0.34f,lamC));
                    if(dusk>0.001f){
                        float sr=1.00f, sg=0.34f, sb=0.08f, sa=dusk*0.78f;
                        cbr+=(sr-cbr)*sa; cbg+=(sg-cbg)*sa; cbb+=(sb-cbb)*sa;
                        Lc+=0.18f*dusk;
                    }
                    R2+=(cbr*Lc-R2)*cmask; G2+=(cbg*Lc-G2)*cmask; B2+=(cbb*Lc-B2)*cmask;
                }
                fb[py*WIN_W+px]=pack(R2,G2,B2);
            }
        }
    }
}

/* ---- NO ATMO: four material rows, no halo/cloud shell ------------------ */
static void crater_uv(float u,float v,float amount,float *depress,float *rim){
    static const int grids[3]={7,13,23};
    *depress=0.0f; *rim=0.0f;
    amount=clampf(amount,0,1);
    if(amount<=0.001f) return;
    float lat_scale=clampf(cosf((v-0.5f)*PIF),0.22f,1.0f);
    for(int layer=0;layer<3;layer++){
        int grid=grids[layer];
        int gu0=(int)floorf(u*grid), gv0=(int)floorf(v*grid);
        float density=amount*(0.40f+0.15f*layer);
        for(int oy=-1;oy<=1;oy++) for(int ox=-1;ox<=1;ox++){
            int gu=(gu0+ox)%grid; if(gu<0) gu+=grid;
            int gv=gv0+oy; if(gv<0||gv>=grid) continue;
            float h=hash3((float)gu+layer*19.0f,(float)gv-layer*7.0f,31.0f+layer);
            if(h>density) continue;
            float cu=((float)gu+0.15f+0.70f*hash3((float)gu,(float)gv,11.0f+layer))/(float)grid;
            float cv=((float)gv+0.15f+0.70f*hash3((float)gu,(float)gv,23.0f+layer))/(float)grid;
            float dx=u-cu; if(dx>0.5f) dx-=1.0f; else if(dx<-0.5f) dx+=1.0f;
            float dy=v-cv;
            float radius=(1.0f/(float)grid)*(0.12f+0.20f*amount)*(0.74f+0.56f*hash3((float)gu,(float)gv,47.0f+layer));
            float q=sqrtf((dx*lat_scale)*(dx*lat_scale)+dy*dy)/fmaxf(0.0001f,radius);
            float depth=amount*(0.44f+0.12f*layer)*(0.70f+0.60f*hash3((float)gu,(float)gv,59.0f+layer));
            if(q<1.0f){ float b=1.0f-q*q; *depress += b*b*depth; }
            float rb=1.0f-fabsf(q-1.0f)/0.26f;
            if(rb>0.0f) *rim += rb*rb*depth*(0.20f+0.08f*amount);
        }
    }
    *depress=clampf(*depress,0,1);
    *rim=clampf(*rim,0,1);
}

static void render_airless(Uint32 *fb, float t, const Params*p){
    float (*pal)[3]=PAL[PAL_AIRLESS];
    float half=0.5f*(PW<PH?PW:PH);
    float Rs=half*p->rad;
    float ay=t*p->spin+p->viewYaw, ax=p->tilt+p->viewPitch;
    float lx=cosf(t*0.08f)*0.8f, ly=0.38f, lz=sinf(t*0.08f)*0.5f+0.45f;
    float ln=1.0f/sqrtf(lx*lx+ly*ly+lz*lz); lx*=ln; ly*=ln; lz*=ln;
    int scale=p->scale;
    for(int by=0; by<PH; by+=scale){
        for(int bx=0; bx<PW; bx+=scale){
            int ccx=bx+scale/2, ccy=by+scale/2;
            if(ccx>=PW) ccx=PW-1;
            if(ccy>=PH) ccy=PH-1;
            float sx=ccx-PW*0.5f, sy=PH*0.5f-ccy, d2=sx*sx+sy*sy;
            int xe=bx+scale<PW?bx+scale:PW, ye=by+scale<PH?by+scale:PH;
            int surfIn=d2<=Rs*Rs;
            float br=0,bg=0,bb=0,lam=0,limb=0,qx=0,qy=0,qz=0;
            if(surfIn){
                float us=sx/Rs, vs=sy/Rs, zs=sqrtf(1.0f-us*us-vs*vs);
                rotate_view(us,vs,zs,ay,ax,&qx,&qy,&qz);
                float h=fbm(qx*p->freq,qy*p->freq,qz*p->freq);
                float cracks=fabsf(fbm(qx*p->freq*3.8f+9.0f,qy*p->freq*3.8f-4.0f,qz*p->freq*3.8f));
                float dep=0.0f, rim=0.0f;
                float lon=atan2f(qz,qx)/(2.0f*PIF)+0.5f;
                float lat=asinf(clampf(qy,-1,1))/PIF+0.5f;
                crater_uv(lon,lat,p->craters,&dep,&rim);
                h=clampf(h + rim*0.16f - dep*0.55f,0.0f,0.999f);
                cracks=clampf(cracks + dep*0.80f + rim*0.40f,0.0f,1.0f);
                int row=(int)(clampf(h*3.999f,0,3));
                int col=(int)(clampf((0.72f*h+0.28f*cracks)*4.999f,0,4));
                int idx=row*5+col;
                br=pal[idx][0]; bg=pal[idx][1]; bb=pal[idx][2];
                float craterShade=clampf(1.0f + rim*0.22f - dep*0.40f,0.58f,1.18f);
                br*=craterShade; bg*=craterShade; bb*=craterShade;
                lam=us*lx+vs*ly+zs*lz;
                limb=smoothstep(0.62f,1.0f,us*us+vs*vs);
            }
            for(int py=by;py<ye;py++) for(int px=bx;px<xe;px++){
                float d=(BAYER[(py&3)*4+(px&3)]+0.5f)/16.0f; float R,G,B;
                if(surfIn){
                    float ll=lam>0?lam:0;
                    float Lq=floorf((0.10f+0.90f*ll)*5.0f+d)/5.0f;
                    R=br*Lq; G=bg*Lq; B=bb*Lq;
                    R*=1.0f-0.10f*limb; G*=1.0f-0.10f*limb; B*=1.0f-0.06f*limb;
                    add_aurora(PAL_AIRLESS,&R,&G,&B,qx,qy,qz,lam,p->aurora,t);
                } else space_px(px,py,half,0.0f,&R,&G,&B);
                fb[py*WIN_W+px]=pack(R,G,B);
            }
        }
	}
}

/* ---- COMET: rough nucleus + coma + anti-light tail ---------------------- */
static void render_comet(Uint32 *fb, float t, const Params*p){
    float (*pal)[3]=PAL[PAL_COMET];
    float half=0.5f*(PW<PH?PW:PH);
    float sizeN=clampf((p->rad-RAD_MIN)/(RAD_MAX-RAD_MIN),0,1);
    float core=half*(0.10f+0.30f*sizeN);
    float coma=core*(2.2f+3.8f*p->lightning);
    float tailLen=core*(3.0f+9.5f*p->rings);
    float ay=t*p->spin*0.7f+p->viewYaw, ax=p->tilt+p->viewPitch;
    float lx=cosf(t*0.06f)*0.78f, ly=0.28f, lz=sinf(t*0.06f)*0.35f+0.56f;
    float ln=1.0f/sqrtf(lx*lx+ly*ly+lz*lz); lx*=ln; ly*=ln; lz*=ln;
    float tx=-lx, ty=-ly, tn=1.0f/sqrtf(tx*tx+ty*ty+0.0001f); tx*=tn; ty*=tn;
    float hueR,hueG,hueB; hsv(p->lightHue,0.48f,1.0f,&hueR,&hueG,&hueB);
    int scale=p->scale;

    for(int by=0; by<PH; by+=scale){
        for(int bx=0; bx<PW; bx+=scale){
            int ccx=bx+scale/2, ccy=by+scale/2;
            if(ccx>=PW) ccx=PW-1;
            if(ccy>=PH) ccy=PH-1;
            float sx=ccx-PW*0.5f, sy=PH*0.5f-ccy;
            int xe=bx+scale<PW?bx+scale:PW, ye=by+scale<PH?by+scale:PH;
            float r2=sx*sx+sy*sy, r=sqrtf(r2);
            float axis=sx*tx+sy*ty;
            float perp=fabsf(sx*ty-sy*tx);
            float comaA=expf(-(r*r)/(coma*coma))*p->lightning*(0.16f+0.44f*p->cityDens);
            float wake=clampf(axis/fmaxf(1.0f,tailLen),0,1);
            float tailW=core*(0.28f+1.35f*powf(wake,0.72f));
            float tailA=0.0f;
            if(axis>core*0.45f && axis<tailLen){
                float filament=0.55f+0.45f*fbm(axis/core*1.8f+t*0.18f,perp/core*3.2f,wake*5.0f);
                tailA=expf(-(perp*perp)/(tailW*tailW))*smoothstep(core*0.40f,core*1.80f,axis)*
                      powf(1.0f-wake,1.10f)*p->rings*(0.18f+0.46f*p->cityDens)*filament;
            }
            int surfIn=r2<=core*core;
            float br=0,bg=0,bb=0,lam=0,jet=0;
            if(surfIn){
                float us=sx/core, vs=sy/core, zs=sqrtf(1.0f-us*us-vs*vs);
                float qx,qy,qz;
                rotate_view(us,vs,zs,ay,ax,&qx,&qy,&qz);
                float rough=fbm(qx*p->freq*1.7f,qy*p->freq*1.7f,qz*p->freq*1.7f);
                float pits=powf(1.0f-fabsf(fbm(qx*42.0f+3.0f,qy*42.0f-9.0f,qz*42.0f)-0.5f)*2.0f,5.0f);
                int row=rough>0.58f ? 1 : 0;
                int col=(int)clampf((rough*0.70f+pits*0.30f)*4.999f,0,4);
                br=pal[row*5+col][0]; bg=pal[row*5+col][1]; bb=pal[row*5+col][2];
                float pitShade=1.0f-pits*p->craters*0.38f;
                br*=pitShade; bg*=pitShade; bb*=pitShade;
                lam=us*lx+vs*ly+zs*lz;
                jet=p->aurora*smoothstep(0.42f,0.92f,lam)*smoothstep(0.24f,0.84f,fbm(qx*16.0f+t*0.30f,qy*16.0f,qz*16.0f));
            }
            for(int py=by;py<ye;py++) for(int px=bx;px<xe;px++){
                float d=(BAYER[(py&3)*4+(px&3)]+0.5f)/16.0f; float R,G,B;
                space_px(px,py,half,0.0f,&R,&G,&B);
                if(tailA>0.001f){
                    int ci=(int)clampf((0.25f+0.70f*wake)*4.999f,0,4);
                    float tr=pal[15+ci][0], tg=pal[15+ci][1], tb=pal[15+ci][2];
                    tr+=(hueR-tr)*0.22f; tg+=(hueG-tg)*0.22f; tb+=(hueB-tb)*0.22f;
                    R+=(tr-R)*tailA; G+=(tg-G)*tailA; B+=(tb-B)*tailA;
                }
                if(comaA>0.001f){
                    int ci=(int)clampf((1.0f-r/fmaxf(coma,1.0f))*4.999f,0,4);
                    float cr=pal[10+ci][0], cg=pal[10+ci][1], cb=pal[10+ci][2];
                    cr+=(hueR-cr)*0.14f; cg+=(hueG-cg)*0.14f; cb+=(hueB-cb)*0.14f;
                    R+=(cr-R)*clampf(comaA,0,0.62f); G+=(cg-G)*clampf(comaA,0,0.62f); B+=(cb-B)*clampf(comaA,0,0.62f);
                }
                if(surfIn){
                    float ll=lam>0?lam:0;
                    float Lq=floorf((0.08f+0.92f*ll)*5.0f+d)/5.0f;
                    R=br*Lq; G=bg*Lq; B=bb*Lq;
                    if(jet>0.001f){
                        int ji=(int)clampf(jet*4.999f,0,4);
                        R+=AUR[PAL_COMET][ji][0]*jet*0.70f;
                        G+=AUR[PAL_COMET][ji][1]*jet*0.70f;
                        B+=AUR[PAL_COMET][ji][2]*jet*0.70f;
                    }
                }
                fb[py*WIN_W+px]=pack(R,G,B);
            }
        }
    }
}

/* ---- GAS GIANT: bands + swirls + oval storms + two cloud shells -------- */
static void render_gas(Uint32 *fb, float t, const Params*p){
    float (*pal)[3]=PAL[PAL_GAS];
    float half=0.5f*(PW<PH?PW:PH);
    float Rs=half*p->rad, C1=Rs*1.035f, C2=Rs*1.075f;
    float lx=cosf(t*0.07f)*0.72f, ly=0.30f, lz=sinf(t*0.07f)*0.42f+0.60f;
    float ln=1.0f/sqrtf(lx*lx+ly*ly+lz*lz); lx*=ln; ly*=ln; lz*=ln;
    int scale=p->scale;
    for(int by=0; by<PH; by+=scale){
        for(int bx=0; bx<PW; bx+=scale){
            int ccx=bx+scale/2, ccy=by+scale/2;
            if(ccx>=PW) ccx=PW-1;
            if(ccy>=PH) ccy=PH-1;
            float sx=ccx-PW*0.5f, sy=PH*0.5f-ccy;
            int xe=bx+scale<PW?bx+scale:PW, ye=by+scale<PH?by+scale:PH;
            float d2=sx*sx+sy*sy;
            int inS=d2<=Rs*Rs, inC1=d2<=C1*C1, inC2=d2<=C2*C2;
            float br=0,bg=0,bb=0,lam=0,gqx=0,gqy=0,gqz=0,c1r=0,c1g=0,c1b=0,c2r=0,c2g=0,c2b=0,c1a=0,c2a=0,c1l=0,c2l=0;
            if(inS){
                float u=sx/Rs, v=sy/Rs, z=sqrtf(1.0f-u*u-v*v);
                rotate_view(u,v,z,p->viewYaw,p->viewPitch,&gqx,&gqy,&gqz);
                float lon=atan2f(gqx,gqz), lat=gqy;
                float swirl=fbm(cosf(lon+t*p->spin+lat*1.2f)*p->freq,
                                sinf(lon+t*p->spin*0.7f-lat*0.8f)*p->freq,
                                lat*p->freq*2.2f+t*0.08f);
                float ribbon=0.5f+0.5f*sinf(lon*3.4f+lat*13.0f+swirl*4.0f+t*0.28f);
                float cells=fbm(cosf(lon*1.7f+t*0.09f)*p->freq*2.1f+lat*1.6f,
                                sinf(lon*1.9f-t*0.12f)*p->freq*2.1f-lat*0.8f,
                                lat*p->freq*5.4f+swirl*2.0f);
                float band=sinf((lat+0.14f*(swirl-0.5f)+0.055f*(cells-0.5f))*28.0f+t*0.22f)*0.5f+0.5f;
                float vortex=0.0f, eye=0.0f;
                for(int si=0;si<4;si++){
                    float s=(float)si;
                    float clat=-0.46f+0.31f*s+0.055f*sinf(t*0.11f+s*2.1f);
                    float clon=t*(0.10f+0.035f*s)*(si&1?-1.0f:1.0f)+s*1.67f;
                    float dlon=atan2f(sinf(lon-clon),cosf(lon-clon));
                    float rx=0.34f+0.045f*s, ry=0.105f+0.018f*s;
                    float vx=dlon/rx, vy=(lat-clat)/ry, r2=vx*vx+vy*vy;
                    float ang=atan2f(vy,vx);
                    float spiral=0.5f+0.5f*sinf(ang*3.0f-r2*2.4f+t*(0.85f+0.12f*s));
                    float mask=expf(-r2*1.35f);
                    vortex+=mask*spiral;
                    eye+=expf(-r2*15.0f);
                }
                vortex=clampf(vortex,0,1);
                eye=clampf(eye,0,1);
                float pattern=clampf(0.50f*band+0.18f*ribbon+0.20f*cells+0.30f*vortex-0.22f*eye,0,1);
                int row=(int)clampf((pattern*3.999f),0,3);
                int col=(int)clampf((0.18f+0.38f*swirl+0.22f*cells+0.25f*ribbon+0.30f*vortex+0.45f*eye)*4.999f,0,4);
                int idx=row*5+col;
                br=pal[idx][0]; bg=pal[idx][1]; bb=pal[idx][2];
                if(vortex>0.08f){
                    float va=clampf(vortex*0.34f+eye*0.40f,0,0.58f);
                    br+=(pal[14][0]-br)*va; bg+=(pal[14][1]-bg)*va; bb+=(pal[14][2]-bb)*va;
                }
                lam=gqx*lx+gqy*ly+gqz*lz;
            }
            if(inC1){
                float u=sx/C1, v=sy/C1, z=sqrtf(1.0f-u*u-v*v);
                float qx,qy,qz;
                rotate_view(u,v,z,p->viewYaw,p->viewPitch,&qx,&qy,&qz);
                float lon=atan2f(qx,qz), lat=qy;
                float cl=fbm(cosf(lon+t*0.20f+lat)*p->cfreq,
                             sinf(lon+t*0.16f-lat*0.7f)*p->cfreq,
                             lat*p->cfreq*2.4f);
                c1a=smoothstep(0.56f,0.80f,cl)*0.45f;
                int col=(int)clampf(cl*4.999f,0,4), idx=20+col;
                c1r=pal[idx][0]; c1g=pal[idx][1]; c1b=pal[idx][2]; c1l=clampf(qx*lx+qy*ly+qz*lz,0,1);
            }
            if(inC2){
                float u=sx/C2, v=sy/C2, z=sqrtf(1.0f-u*u-v*v);
                float qx,qy,qz;
                rotate_view(u,v,z,p->viewYaw,p->viewPitch,&qx,&qy,&qz);
                float lon=atan2f(qx,qz), lat=qy;
                float cl=fbm(cosf(lon-t*0.13f-lat*0.8f)*p->cfreq*1.35f+7.0f,
                             sinf(lon-t*0.11f+lat)*p->cfreq*1.35f,
                             lat*p->cfreq*2.8f);
                c2a=smoothstep(0.62f,0.86f,cl)*0.34f;
                int col=(int)clampf(cl*4.999f,0,4), idx=25+col;
                c2r=pal[idx][0]; c2g=pal[idx][1]; c2b=pal[idx][2]; c2l=clampf(qx*lx+qy*ly+qz*lz,0,1);
            }
            for(int py=by;py<ye;py++) for(int px=bx;px<xe;px++){
                float dd=(BAYER[(py&3)*4+(px&3)]+0.5f)/16.0f; float R,G,B;
                if(inS){
                    float ll=lam>0?lam:0, Lq=floorf((0.18f+0.82f*ll)*5.0f+dd)/5.0f;
                    R=br*Lq; G=bg*Lq; B=bb*Lq;
                    add_lightning(&R,&G,&B,gqx,gqy,gqz,smoothstep(0.25f,-0.12f,lam),p->lightning,t,17);
                    add_aurora(PAL_GAS,&R,&G,&B,gqx,gqy,gqz,lam,p->aurora,t);
                } else space_px(px,py,half,0.10f,&R,&G,&B);
                if(c1a>0){ float L=floorf((0.18f+0.82f*c1l)*5.0f+dd)/5.0f; R+=(c1r*L-R)*c1a; G+=(c1g*L-G)*c1a; B+=(c1b*L-B)*c1a; }
                if(c2a>0){ float L=floorf((0.18f+0.82f*c2l)*5.0f+dd)/5.0f; R+=(c2r*L-R)*c2a; G+=(c2g*L-G)*c2a; B+=(c2b*L-B)*c2a; }
                fb[py*WIN_W+px]=pack(R,G,B);
            }
        }
    }
}

static void blend_px(Uint32 *dst, float r, float g, float b, float a){
    float sr=(float)((*dst>>16)&255)/255.0f, sg=(float)((*dst>>8)&255)/255.0f, sb=(float)(*dst&255)/255.0f;
    a=clampf(a,0,1);
    *dst=pack(sr+(r-sr)*a, sg+(g-sg)*a, sb+(b-sb)*a);
}
static void draw_rings(Uint32 *fb, int page, float t, const Params*p){
	(void)t;
	if(p->rings<=0.01f) return;
	if(page==PAGE_ORBITAL || page==PAGE_COMET || page_is_star(page)) return;
	int palid=palette_for_page(page);
    float half=0.5f*(PW<PH?PW:PH);
    float sizeN=(p->rad-RAD_MIN)/(RAD_MAX-RAD_MIN);
    float baseR=page==PAGE_ORBITAL ? half*(0.5f+0.5f*sizeN) : half*p->rad;
    float bodyR=page==PAGE_ORBITAL ? 0.0f : baseR;
    float outer=baseR*(1.26f+1.12f*p->rings), inner=baseR*(1.06f+0.22f*p->rings);
    float nx,ny,nz,cy=PH*0.5f,cx=PW*0.5f;
    equatorial_ring_normal(p->viewYaw,p->tilt+p->viewPitch,&nx,&ny,&nz);
    if(fabsf(nz)<0.08f) nz=nz<0.0f?-0.08f:0.08f;
    int x0=(int)floorf(cx-outer-3), x1=(int)ceilf(cx+outer+3);
    int y0=(int)floorf(cy-outer-3), y1=(int)ceilf(cy+outer+3);
    if(x0<0) x0=0;
    if(x1>PW) x1=PW;
    if(y0<0) y0=0;
    if(y1>PH) y1=PH;
    for(int y=y0;y<y1;y++) for(int x=x0;x<x1;x++){
        float dx=x+0.5f-cx, dy=y+0.5f-cy;
        float z=(ny*dy-nx*dx)/nz, er=sqrtf(dx*dx+dy*dy+z*z)/outer;
        float ir=inner/outer;
        if(er<ir || er>1.0f) continue;
        float edge=smoothstep(ir,ir+0.035f,er)*(1.0f-smoothstep(0.965f,1.0f,er));
        float alpha=edge*(0.20f+0.34f*p->rings);
        float sphere=dx*dx+dy*dy;
        if(bodyR>0.0f && sphere<bodyR*bodyR){
            if(z<sqrtf(bodyR*bodyR-sphere)) continue;
            alpha*=0.78f;
        }
        int ci=(int)clampf((er-ir)/(1.0f-ir)*4.999f,0,4);
        float rr=AUR[palid][ci][0]*0.72f+0.22f, gg=AUR[palid][ci][1]*0.72f+0.22f, bb=AUR[palid][ci][2]*0.72f+0.25f;
        blend_px(&fb[y*WIN_W+x],rr,gg,bb,alpha);
    }
}

static const char *page_name(int page){
	int star_kind=page_star_kind(page);
	if(star_kind!=SPACE_OBJ_NONE) return space_object_spec(star_kind)->label;
    switch(page){
	        case PAGE_ORBITAL: return "ORBITALS";
	        case PAGE_AIRLESS: return "NO ATMO";
	        case PAGE_GAS: return "GAS GIANT";
	        case PAGE_COMET: return "COMET";
	        default: return "PLANET";
	    }
}

/* ---- UI ---------------------------------------------------------------- */
#ifndef PLANET_TOOL_EMBEDDED
#define PAGEY (PH+18)
#define TX 96
#define TW (WIN_W-120)
#define Y1 (PH+44)
#define Y2 (PH+68)
#define Y3 (PH+92)
#define Y4 (PH+116)
#define Y5 (PH+140)
#define Y6 (PH+164)
#define Y7 (PH+188)
#define TH 6
#define BTN_W 180
#define BTN_H 30
#define BX ((WIN_W-BTN_W)/2)
#define BY (PH+214)
#define ARW_W 14
#define ARW_H 16
#define LARW_X (WIN_W/2-78)
#define RARW_X (WIN_W/2+64)

static int in_rect(int x,int y,int rx,int ry,int rw,int rh){ return x>=rx&&x<rx+rw&&y>=ry&&y<ry+rh; }
static int in_btn(int x,int y){ return in_rect(x,y,BX,BY,BTN_W,BTN_H); }
static int page_delta_at(int x,int y){
    if(in_rect(x,y,LARW_X,PAGEY-8,ARW_W,ARW_H)) return -1;
    if(in_rect(x,y,RARW_X,PAGEY-8,ARW_W,ARW_H)) return 1;
    return 0;
}
static int slider_at(int y){
    if(y>Y1-11&&y<Y1+11) return 1;
    if(y>Y2-11&&y<Y2+11) return 2;
    if(y>Y3-11&&y<Y3+11) return 3;
    if(y>Y4-11&&y<Y4+11) return 4;
    if(y>Y5-11&&y<Y5+11) return 5;
    if(y>Y6-11&&y<Y6+11) return 6;
    if(y>Y7-11&&y<Y7+11) return 7;
    return 0;
}
static void apply_slider(Params*p,int page,int which,int mx){
    float nv=clampf((mx-TX)/(float)TW,0,1);
	if(page_is_star(page)){
	    switch(which){
	        case 1: p->rad=RAD_MIN+nv*(RAD_MAX-RAD_MIN); break;
	        case 2: p->scale=1+(int)(nv*(SCALE_MAX-1)+0.5f); break;
	        case 3: p->lightning=nv; break;
	        case 4: p->lightHue=nv; break;
	        case 5: p->cityDens=nv; break;
	        case 6: p->aurora=nv; break;
	        case 7: p->rings=nv; break;
	    }
	    return;
	}
	switch(which){
	        case 1: p->rad=RAD_MIN+nv*(RAD_MAX-RAD_MIN); break;
	        case 2: p->scale=1+(int)(nv*(SCALE_MAX-1)+0.5f); break;
	        case 3: p->lightning=nv; break;
	        case 4: p->lightHue=nv; break;
	        case 5: if(page==PAGE_AIRLESS) p->craters=nv; else if(page==PAGE_COMET) p->cityDens=nv; else p->cityDens=nv*DENS_MAX; break;
	        case 6: p->aurora=nv; break;
	        case 7: p->rings=nv; break;
	    }
}
static void track(Uint32*fb,int y,float n,Uint32 fill){
    rect(fb,TX,y-TH/2,TW,TH,0xFF333344);
    rect(fb,TX,y-TH/2,(int)(TW*clampf(n,0,1)),TH,fill);
    int k=7; rect(fb,TX+(int)(TW*clampf(n,0,1))-k,y-k,2*k,2*k,0xFFEEEEEE);
}
static void draw_ui(Uint32 *fb, const Params*p, int page, int hoverBtn){
    int palid=palette_for_page(page);
    int star_page=page_is_star(page);
    float lr,lg,lb;
    float sr=0.72f,sg=0.84f,sb=1.0f,tr=1.0f,tg=0.95f,tb=0.70f;
    hsv(p->lightHue,0.55f,1.0f,&lr,&lg,&lb);
    if(star_page){
        const SpaceStarSpec *star=space_object_star_spec(page_star_kind(page));
        unpack_rgbf(star->sky_glow_rgb,&sr,&sg,&sb);
        unpack_rgbf(star->tint_rgb,&tr,&tg,&tb);
    }
    rect(fb,0,PH,WIN_W,CTRL,0xFF15151B);
    /* page selector */
    const char*name = page_name(page);
    arrow(fb,LARW_X,PAGEY-8,ARW_W,ARW_H,0,0xFFCCCCDD);
    arrow(fb,RARW_X,PAGEY-8,ARW_W,ARW_H,1,0xFFCCCCDD);
    text(fb,WIN_W/2-textw(name,2)/2,PAGEY-7,name,2,0xFFFFFFFF);
    /* sliders */
	text(fb,8,Y1-7,page==PAGE_COMET?"CORE":"SIZE",2,0xFFAAB0C0);
	text(fb,8,Y2-7,"PIXEL",2,0xFFAAB0C0);
	text(fb,8,Y3-7,star_page?"FLARE":(page==PAGE_COMET?"COMA":"LIGHTNG"),2,0xFFAAB0C0);
	text(fb,8,Y4-7,star_page?"TINT":"LIGHT",2,0xFFAAB0C0);
	text(fb,8,Y5-7,star_page?"GRAIN":(page==PAGE_AIRLESS?"CRATERS":"DENSITY"),2,0xFFAAB0C0);
	text(fb,8,Y6-7,star_page?"CORONA":(page==PAGE_COMET?"JETS":"AURORA"),2,0xFFAAB0C0);
	text(fb,8,Y7-7,star_page?"FILAMENT":(page==PAGE_COMET?"TAIL":"RINGS"),2,0xFFAAB0C0);
    track(fb,Y1,(p->rad-RAD_MIN)/(RAD_MAX-RAD_MIN),       0xFF5599FF);
    track(fb,Y2,(float)(p->scale-1)/(float)(SCALE_MAX-1), 0xFFFF9955);
    track(fb,Y3, p->lightning,                             0xFFB8D8FF);
    track(fb,Y4, p->lightHue,                              pack(lr,lg,lb));
	track(fb,Y5, star_page ? p->cityDens : (page==PAGE_AIRLESS ? p->craters : (page==PAGE_COMET ? p->cityDens : p->cityDens/DENS_MAX)), 0xFFCCCCD8);
    track(fb,Y6, p->aurora,                                star_page ? pack(sr,sg,sb) : pack(AUR[palid][2][0],AUR[palid][2][1],AUR[palid][2][2]));
    track(fb,Y7, p->rings,                                 star_page ? pack(tr,tg,tb) : 0xFFD9E5FF);
    /* button */
    rect(fb,BX,BY,BTN_W,BTN_H, hoverBtn?0xFF4A4A66:0xFF33334A);
    rect(fb,BX,BY,BTN_W,2,0xFF6A6A88); rect(fb,BX,BY+BTN_H-2,BTN_W,2,0xFF101018);
    text(fb,BX+(BTN_W-textw("RANDOMIZE",2))/2,BY+(BTN_H-14)/2,"RANDOMIZE",2,0xFFF0F0F8);
}
static void set_title(SDL_Window*w,const Params*p,int page){
    char b[128];
    snprintf(b,sizeof b,"%s  size %.2f  px %d  lgt %.2f  hue %.2f  aur %.2f  rings %.2f  cr %.2f",
             page_name(page),p->rad,p->scale,p->lightning,p->lightHue,p->aurora,p->rings,p->craters);
    SDL_SetWindowTitle(w,b);
}

int main(int argc, char **argv){
    srand((unsigned)time(NULL));
    reset_tool_assets();
    if(argc==2 && strcmp(argv[1],"--export-game-assets")==0){
        load_tool_assets(0);
        return export_game_assets() ? 0 : 1;
    }
    if(argc==4 && strcmp(argv[1],"--export-game-assets")==0 && strcmp(argv[2],"--asset-dir")==0){
        return planet_tool_export_game_assets_to(argv[3]) ? 0 : 1;
    }
    if(argc==6 && strcmp(argv[1],"--export-game-assets")==0 && strcmp(argv[2],"--asset-dir")==0 && strcmp(argv[4],"--seed")==0){
        char *end = NULL;
        (void)strtoul(argv[5], &end, 16);
        if (!end || *end) { fputs("invalid seed\n", stderr); return 2; }
        return planet_tool_export_game_assets_to(argv[3]) ? 0 : 1;
    }
    if(argc>1 && strcmp(argv[1],"--help")==0){
        puts("usage: planet_tool [--export-game-assets [--asset-dir DIR] [--seed HEX]]");
        return 0;
    }
    if(argc>1){
        fprintf(stderr,"usage: planet_tool [--export-game-assets [--asset-dir DIR] [--seed HEX]]\n");
        return 2;
    }
    load_tool_assets(1);

    if(SDL_Init(SDL_INIT_VIDEO)!=0){ fprintf(stderr,"SDL_Init: %s\n",SDL_GetError()); return 1; }
    SDL_Window *win=SDL_CreateWindow("planet",
        SDL_WINDOWPOS_CENTERED,SDL_WINDOWPOS_CENTERED,WIN_W,WIN_H,0);
    SDL_Renderer *ren;
    SDL_Texture *tex;
    Uint32 *fb;
    if(!win){ fprintf(stderr,"SDL_CreateWindow: %s\n",SDL_GetError()); SDL_Quit(); return 1; }
    ren=SDL_CreateRenderer(win,-1,SDL_RENDERER_SOFTWARE);
    if(!ren){ fprintf(stderr,"SDL_CreateRenderer: %s\n",SDL_GetError()); SDL_DestroyWindow(win); SDL_Quit(); return 1; }
    tex=SDL_CreateTexture(ren,SDL_PIXELFORMAT_ARGB8888,SDL_TEXTUREACCESS_STREAMING,WIN_W,WIN_H);
    if(!tex){ fprintf(stderr,"SDL_CreateTexture: %s\n",SDL_GetError()); SDL_DestroyRenderer(ren); SDL_DestroyWindow(win); SDL_Quit(); return 1; }
    fb=malloc((size_t)WIN_W*WIN_H*sizeof(Uint32));
    if(!fb){ fputs("framebuffer allocation failed\n",stderr); SDL_DestroyTexture(tex); SDL_DestroyRenderer(ren); SDL_DestroyWindow(win); SDL_Quit(); return 1; }

    Params p = default_params();
    int active=0, rotating=0, mxp=0, myp=0, page=PAGE_PLANET;
    const float dragYawPerPixel=0.0125f, dragPitchPerPixel=0.0100f, dragPitchLimit=1.20f;
    set_title(win,&p,page);

    Uint32 start=SDL_GetTicks(); int run=1;
    while(run){
        SDL_Event e;
        while(SDL_PollEvent(&e)){
            if(e.type==SDL_QUIT) run=0;
            else if(e.type==SDL_KEYDOWN){
                int s=e.key.keysym.sym;
                if(s==SDLK_ESCAPE) run=0;
                else if(s==SDLK_TAB)   { page=(page+1)%NPAGES; set_title(win,&p,page); }
                else if(s==SDLK_UP)    { p.rad=clampf(p.rad+0.02f,RAD_MIN,RAD_MAX); set_title(win,&p,page); }
                else if(s==SDLK_DOWN)  { p.rad=clampf(p.rad-0.02f,RAD_MIN,RAD_MAX); set_title(win,&p,page); }
                else if(s==SDLK_LEFT)  { if(p.scale>1) p.scale--; set_title(win,&p,page); }
                else if(s==SDLK_RIGHT) { if(p.scale<SCALE_MAX) p.scale++; set_title(win,&p,page); }
            }
            else if(e.type==SDL_MOUSEBUTTONDOWN){
                mxp=e.button.x; myp=e.button.y;
                int pd=page_delta_at(mxp,myp);
                if(pd){ page=(page+pd+NPAGES)%NPAGES; set_title(win,&p,page); active=0; rotating=0; }
                else if(in_btn(mxp,myp)){ randomize(&p,page); set_title(win,&p,page); active=0; rotating=0; }
                else {
                    active=slider_at(myp); rotating=0;
                    if(active){ apply_slider(&p,page,active,mxp); set_title(win,&p,page); }
                    else if(e.button.button==SDL_BUTTON_LEFT && in_rect(mxp,myp,0,0,PW,PH)) rotating=1;
                }
            }
            else if(e.type==SDL_MOUSEMOTION){
                mxp=e.motion.x; myp=e.motion.y;
                if(rotating && (e.motion.state&SDL_BUTTON_LMASK)){
                    p.viewYaw-=e.motion.xrel*dragYawPerPixel;
                    p.viewPitch=clampf(p.viewPitch-e.motion.yrel*dragPitchPerPixel,-dragPitchLimit,dragPitchLimit);
                }
                if(active && (e.motion.state&SDL_BUTTON_LMASK)){ apply_slider(&p,page,active,mxp); set_title(win,&p,page); }
            }
            else if(e.type==SDL_MOUSEBUTTONUP && e.button.button==SDL_BUTTON_LEFT){ active=0; rotating=0; }
        }

        Uint32 fs=SDL_GetTicks(); float t=(fs-start)/1000.0f;
        if(page_is_star(page)){
            render_star_object(fb,t,&p,page_star_kind(page));
        } else {
	        switch(page){
	            case PAGE_ORBITAL: render_orbital(fb,t,&p); break;
	            case PAGE_AIRLESS: render_airless(fb,t,&p); break;
	            case PAGE_GAS: render_gas(fb,t,&p); break;
	            case PAGE_COMET: render_comet(fb,t,&p); break;
	            default: render_planet(fb,t,&p); break;
	        }
        }
        draw_rings(fb,page,t,&p);
        draw_ui(fb,&p,page,in_btn(mxp,myp));
        SDL_UpdateTexture(tex,NULL,fb,WIN_W*(int)sizeof(Uint32));
        SDL_RenderClear(ren); SDL_RenderCopy(ren,tex,NULL,NULL); SDL_RenderPresent(ren);
        Uint32 ft=SDL_GetTicks()-fs; if(ft<16) SDL_Delay(16-ft);
    }

    free(fb);
    SDL_DestroyTexture(tex); SDL_DestroyRenderer(ren); SDL_DestroyWindow(win); SDL_Quit();
    return 0;
}
#endif
