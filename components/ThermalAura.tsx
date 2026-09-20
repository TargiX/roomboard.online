"use client";

/**
 * ThermalAura — animated "thermal aura" WebGL background.
 *
 * Technique reproduced from the Suno discover hero: a single fullscreen quad
 * rendered through a fragment shader that composes a soft, slowly drifting
 * warm glow. No three.js, no raymarching — plain WebGL1 with two uniforms
 * (time, resolution). Self-contained, zero runtime dependencies.
 *
 * Layers (per fragment):
 *   1. Two sin/cos noise fields at different frequencies/speeds → drifting pattern
 *   2. Radial smoothstep mask → concentrate the glow toward the center
 *   3. A second low-frequency noise modulates that mask → "breathing" hotspots
 *   4. Three-color thermal gradient (cold → warm → hot) mixed onto the bg
 *   5. Film grain + vignette → analog feel, fades into the page background
 *
 * The GLSL below is a clean re-implementation of that pipeline; it is not
 * copied from any third-party bundle. Colors, intensities and timing are all
 * props so the same component can match any palette.
 */

import { useEffect, useRef, type CSSProperties } from "react";

export type ThermalPalette = {
  /** Cool end of the gradient, sits at the glow's edges. */
  cold: string;
  /** Mid tone, the most visible part of the glow. */
  warm: string;
  /** Hot core tone, blended in where the glow is strongest. */
  hot: string;
  /** Page background the aura fades into at the vignette. */
  background: string;
};

/** Faithful reproduction of the Suno discover hero palette. */
export const THERMAL_PALETTE_SUNO: ThermalPalette = {
  cold: "#310042",
  warm: "#a14111",
  hot: "#16003c",
  background: "#101012",
};

/** Teal-leaning palette tuned for the Roomboard dark landing. */
export const THERMAL_PALETTE_TEAL: ThermalPalette = {
  cold: "#06343a",
  warm: "#128c7f",
  hot: "#042326",
  background: "#0b0d12",
};

export type ThermalAuraProps = {
  palette?: ThermalPalette;
  /** Overall opacity of the aura (0–1). */
  intensity?: number;
  /** Spatial frequency of the noise. Higher = tighter ripples. */
  scale?: number;
  /** Relative weight of the second noise layer (0 = flat). */
  noiseStrength?: number;
  /** Radius of the central hotspot, 0–1 of the half-min-dimension. */
  hotspotSize?: number;
  /** Time multiplier. 1 = reference speed. */
  speed?: number;
  /** Film grain amount, 0–~0.05. */
  grain?: number;
  className?: string;
  style?: CSSProperties;
};

const VERT_SRC = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAG_SRC = `
precision highp float;
uniform float time;
uniform vec2 resolution;
uniform vec3 coldColor;
uniform vec3 warmColor;
uniform vec3 hotColor;
uniform vec3 backgroundColor;
uniform float intensity;
uniform float scale;
uniform float noiseStrength;
uniform float hotspotSize;
uniform float speed;
uniform float grain;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec2 p = (uv - 0.5) * 2.0;

  // Two drifting sin/cos fields. Aspect correction keeps ripples round
  // instead of stretched on wide canvases.
  float aspect = resolution.x / max(1.0, resolution.y);
  vec2 q = vec2(p.x * aspect, p.y);

  float n1 = sin(q.x * scale + time * 0.8 * speed) * cos(q.y * (scale * 0.75) + time * 0.6 * speed);
  float n2 = sin(q.x * (scale * 1.5) - time * 0.5 * speed) * cos(q.y * (scale * 1.25) - time * 0.7 * speed);
  float combined = (n1 + n2 * noiseStrength) / (1.0 + noiseStrength);
  float thermal = combined * 0.5 + 0.5;

  // Radial falloff concentrates the glow in the middle.
  float dist = length(uv - 0.5);
  float mask = smoothstep(0.9, hotspotSize, dist);

  // A slow extra modulation makes the hotspot breathe/migrate.
  float hotspotNoise = sin(p.x * 1.5 + time * 0.3 * speed) * cos(p.y * 1.5 - time * 0.4 * speed);
  mask *= hotspotNoise * 0.3 + 0.7;

  thermal *= mask;

  vec3 thermalColor;
  if (thermal < 0.5) {
    thermalColor = mix(coldColor, warmColor, thermal * 2.0);
  } else {
    thermalColor = mix(warmColor, hotColor, (thermal - 0.5) * 2.0);
  }

  vec3 color = mix(backgroundColor, thermalColor, thermal * intensity);

  // Film grain for an analog feel.
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + time * 0.1) * 43758.5453);
  color += vec3((g - 0.5) * 2.0 * grain);

  // Vignette fades into the page background at the edges.
  float vignette = smoothstep(0.3, 1.0, length(uv * 2.0 - 1.0));
  color = mix(color, backgroundColor, vignette);

  gl_FragColor = vec4(color, 1.0);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL: could not create shader");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compile error: ${log ?? "unknown"}`);
  }
  return shader;
}

export function ThermalAura({
  palette = THERMAL_PALETTE_SUNO,
  intensity = 0.76,
  scale = 1.0,
  noiseStrength = 1.15,
  hotspotSize = 0.5,
  speed = 1.0,
  grain = 0.01,
  className,
  style,
}: ThermalAuraProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // WebGL is unavailable or the user wants no motion → leave the element as a
    // static solid background. The page still looks intentional.
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return;

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
      gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
      }
    } catch (err) {
      console.warn("ThermalAura: WebGL setup failed, falling back to static background.", err);
      return;
    }

    gl.useProgram(program);

    // One fullscreen triangle covers the clip space; no per-frame geometry.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const positionLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const u = {
      time: gl.getUniformLocation(program, "time"),
      resolution: gl.getUniformLocation(program, "resolution"),
      coldColor: gl.getUniformLocation(program, "coldColor"),
      warmColor: gl.getUniformLocation(program, "warmColor"),
      hotColor: gl.getUniformLocation(program, "hotColor"),
      backgroundColor: gl.getUniformLocation(program, "backgroundColor"),
      intensity: gl.getUniformLocation(program, "intensity"),
      scale: gl.getUniformLocation(program, "scale"),
      noiseStrength: gl.getUniformLocation(program, "noiseStrength"),
      hotspotSize: gl.getUniformLocation(program, "hotspotSize"),
      speed: gl.getUniformLocation(program, "speed"),
      grain: gl.getUniformLocation(program, "grain"),
    };

    const [coldR, coldG, coldB] = hexToRgb(palette.cold);
    const [warmR, warmG, warmB] = hexToRgb(palette.warm);
    const [hotR, hotG, hotB] = hexToRgb(palette.hot);
    const [bgR, bgG, bgB] = hexToRgb(palette.background);
    gl.useProgram(program);
    gl.uniform3f(u.coldColor, coldR, coldG, coldB);
    gl.uniform3f(u.warmColor, warmR, warmG, warmB);
    gl.uniform3f(u.hotColor, hotR, hotG, hotB);
    gl.uniform3f(u.backgroundColor, bgR, bgG, bgB);
    gl.uniform1f(u.intensity, intensity);
    gl.uniform1f(u.scale, scale);
    gl.uniform1f(u.noiseStrength, noiseStrength);
    gl.uniform1f(u.hotspotSize, hotspotSize);
    gl.uniform1f(u.speed, speed);
    gl.uniform1f(u.grain, grain);

    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.resolution, w, h);
    };
    resize();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(canvas);

    // Static frame when reduced motion is requested; otherwise animate.
    const startTime = performance.now();
    let frameId = 0;
    let running = true;

    const render = () => {
      gl.uniform1f(u.time, reduceMotion ? 0 : (performance.now() - startTime) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (running && !reduceMotion) frameId = requestAnimationFrame(render);
    };
    render();

    // Pause when the tab is hidden to avoid burning CPU/GPU off-screen.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frameId);
      } else if (!reduceMotion) {
        running = true;
        frameId = requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver?.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [
    palette,
    intensity,
    scale,
    noiseStrength,
    hotspotSize,
    speed,
    grain,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        // Default to the palette background so the area looks correct before
        // WebGL paints, and if WebGL is unavailable.
        backgroundColor: palette.background,
        display: "block",
        width: "100%",
        height: "100%",
        ...style,
      }}
      aria-hidden="true"
    />
  );
}
