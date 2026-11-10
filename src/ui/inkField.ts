/** The approved Phase 2.2 lens, sampled from the rendered word rather than a fixed single-line atlas. */
export const inkPhysics = { stiffness: 145, damping: 20, decay: 4.6, maxDpr: 2, maxPixels: 470_000, pad: 17 } as const;
const vertex = `attribute vec2 position;
varying vec2 uv;
void main(){uv=vec2(position.x*.5+.5,.5-position.y*.5);gl_Position=vec4(position,0.,1.);}`;
const fragment = `precision mediump float;
varying vec2 uv;
uniform sampler2D glyph;
uniform vec2 pointer, velocity, size;
uniform vec3 color;
uniform float energy, gate;
float mask(vec2 p){return texture2D(glyph,clamp(p,vec2(.001),vec2(.999))).a;}
void main(){
  vec2 d=(uv-pointer)*size;
  float r=length(d);
  vec2 unit=d/max(r,1.);
  float lens=exp(-r*r/9700.);
  float wave=sin(r*.16-gate*9.)*exp(-r/91.);
  vec2 delta=(vec2(d.y,-d.x)*.19+velocity*.021)*lens+unit*wave*energy*10.;
  float native=mask(uv);
  float displaced=mask(uv-clamp(delta,vec2(-15.),vec2(15.))/size);
  float trail=mask(uv-(clamp(delta,vec2(-15.),vec2(15.))+vec2(3.,2.))/size);
  float edge=max(displaced*.74,trail*.35)*(1.-native);
  gl_FragColor=vec4(color,edge*min(.84,energy*1.25+length(velocity)*.003));
}`;

interface GlSurface {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  texture: WebGLTexture;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

function createSurface(gl: WebGLRenderingContext): GlSurface | null {
  const program = gl.createProgram(), buffer = gl.createBuffer(), texture = gl.createTexture();
  const vert = gl.createShader(gl.VERTEX_SHADER), frag = gl.createShader(gl.FRAGMENT_SHADER);
  let linked = false;
  try {
    if (!program || !buffer || !texture || !vert || !frag) return null;
    gl.shaderSource(vert, vertex); gl.compileShader(vert);
    gl.shaderSource(frag, fragment); gl.compileShader(frag);
    if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS) || !gl.getShaderParameter(frag, gl.COMPILE_STATUS)) return null;
    gl.attachShader(program, vert); gl.attachShader(program, frag); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    linked = true;
    return { gl, program, buffer, texture, uniforms: Object.fromEntries(
      ['pointer','velocity','size','color','energy','gate'].map(k => [k, gl.getUniformLocation(program, k)])) };
  } finally {
    gl.deleteShader(vert); gl.deleteShader(frag);
    if (!linked) { gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteTexture(texture); }
  }
}

interface TextRun { text: string; x: number; y: number; right: number }
function textRuns(target: HTMLElement, box: DOMRect): TextRun[] {
  const range = document.createRange();
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const runs: TextRun[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? '';
    // Unicode iteration keeps surrogate pairs together. Ranges still take UTF-16 offsets.
    let index = 0;
    for (const char of text) {
      range.setStart(node, index); index += char.length; range.setEnd(node, index);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const x = rect.left - box.left, y = rect.top - box.top, right = rect.right - box.left;
      const previous = runs.at(-1);
      if (previous && Math.abs(previous.y - y) < 1) {
        previous.text += char;
        previous.right = right;
      } else runs.push({ text: char, x, y, right });
    }
  }
  return runs;
}

export class InkField {
  readonly canvas = document.createElement('canvas');
  private readonly atlas = document.createElement('canvas');
  private readonly source: CanvasRenderingContext2D | null;
  private readonly gl: WebGLRenderingContext | null;
  private surface: GlSurface | null = null;
  private cpu: CanvasRenderingContext2D | null = null;
  private target: HTMLElement | null = null;
  private width = 1;
  private height = 1;
  private color = [0.67, 0.2, 0.17];
  private raf = 0;
  private last = 0;
  private ready = false;
  private position = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, energy: 0, gate: 1 };
  private readonly events = new window.AbortController();

  constructor() {
    this.canvas.className = 'ink-field';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.width = this.canvas.height = 1;
    this.source = this.atlas.getContext('2d');
    this.gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: 'low-power' });
    if (this.gl) this.surface = createSurface(this.gl);
    else this.cpu = this.canvas.getContext('2d');
    this.updateRenderer();
    const options = { signal: this.events.signal };
    this.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.stop(); this.surface = null; this.ready = false;
      this.updateRenderer();
    }, options);
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.surface = this.gl ? createSurface(this.gl) : null;
      this.updateRenderer();
      if (this.target) this.fit(this.target);
    }, options);
  }

  private updateRenderer() {
    this.canvas.dataset.inkRenderer = this.surface ? 'webgl' : this.cpu ? 'canvas' : 'dom';
  }

  fit(target: HTMLElement) {
    this.target = target;
    this.ready = false;
    const box = target.getBoundingClientRect(), parent = target.parentElement;
    const ctx = this.source;
    if (!ctx || !parent || !box.width || !box.height || (!this.surface && !this.cpu)) return;
    const runs = textRuns(target, box);
    if (!runs.length) return;
    const p = inkPhysics.pad;
    this.width = box.width + p * 2; this.height = box.height + p * 2;
    const scale = Math.min(devicePixelRatio || 1, inkPhysics.maxDpr,
      Math.sqrt(inkPhysics.maxPixels / (this.width * this.height)));
    const width = Math.max(1, Math.floor(this.width * scale)), height = Math.max(1, Math.floor(this.height * scale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = this.atlas.width = width;
      this.canvas.height = this.atlas.height = height;
    }
    const anchor = parent.getBoundingClientRect();
    parent.classList.add('ink-anchor');
    if (this.canvas.parentElement !== parent) parent.append(this.canvas);
    Object.assign(this.canvas.style, { left: `${box.left - anchor.left - p}px`, top: `${box.top - anchor.top - p}px`,
      width: `${this.width}px`, height: `${this.height}px` });
    const style = getComputedStyle(target);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle = 'white'; ctx.textBaseline = 'alphabetic';
    for (const run of runs) {
      const metrics = ctx.measureText(run.text);
      const ascent = metrics.fontBoundingBoxAscent || parseFloat(style.fontSize) * .82;
      ctx.save();
      ctx.translate(run.x + p, run.y + p + ascent);
      ctx.scale((run.right - run.x) / Math.max(1, metrics.width), 1);
      ctx.fillText(run.text, 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = style.getPropertyValue('--accent').trim() || '#aa342c';
    const color = ctx.fillStyle;
    if (typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) this.color = [1,3,5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
    if (this.surface) {
      const { gl, texture } = this.surface;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas);
      gl.viewport(0, 0, width, height);
    }
    this.ready = true;
  }

  input(clientX: number, clientY: number, pulse: boolean) {
    if (!this.ready || !this.target?.isConnected) return;
    const box = this.canvas.getBoundingClientRect(), p = this.position;
    const x = Math.min(this.width, Math.max(0, clientX - box.left));
    const y = Math.min(this.height, Math.max(0, clientY - box.top));
    if (!this.raf) { p.x = x; p.y = y; this.last = 0; }
    p.energy = Math.max(p.energy, pulse ? 1 : Math.min(.75, Math.hypot(p.tx - x, p.ty - y) / 74));
    p.tx = x; p.ty = y;
    if (pulse) p.gate = 0;
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (document.hidden || !this.target?.isConnected) { this.stop(); return; }
    const dt = this.last ? Math.min(.032, (now - this.last) / 1000) : .016;
    this.last = now;
    const p = this.position, { stiffness, damping, decay } = inkPhysics;
    p.vx += (stiffness * (p.tx - p.x) - damping * p.vx) * dt;
    p.vy += (stiffness * (p.ty - p.y) - damping * p.vy) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.energy *= Math.exp(-decay * dt); p.gate = Math.min(1, p.gate + dt * 1.6);
    if (p.energy < .015 && Math.hypot(p.vx, p.vy) < 1) { this.stop(); return; }
    this.canvas.style.visibility = 'visible';
    if (this.surface) {
      const { gl, uniforms: u } = this.surface;
      gl.uniform2f(u.pointer, p.x / this.width, p.y / this.height);
      gl.uniform2f(u.velocity, p.vx, p.vy); gl.uniform2f(u.size, this.width, this.height);
      gl.uniform3fv(u.color, this.color); gl.uniform1f(u.energy, p.energy); gl.uniform1f(u.gate, p.gate);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else if (this.cpu) {
      const c = this.cpu, w = this.canvas.width, h = this.canvas.height;
      c.clearRect(0, 0, w, h);
      for (let x = 0; x < w; x += 12) {
        const dx = x * this.width / w - p.x;
        const y = Math.sin(dx * .08 - p.gate * 9) * Math.exp(-dx * dx / 8800) * p.energy * 9;
        c.drawImage(this.atlas, x, 0, Math.min(12, w - x), h, x, y * h / this.height, Math.min(12, w - x), h);
      }
      c.globalCompositeOperation = 'destination-out'; c.drawImage(this.atlas, 0, 0);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = `rgba(${this.color.map(v => Math.round(v * 255)).join(',')},${Math.min(1, p.energy)})`;
      c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over';
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = this.last = 0;
    Object.assign(this.position, { vx: 0, vy: 0, energy: 0, gate: 1 });
    this.canvas.style.visibility = 'hidden';
  }

  release() {
    this.stop();
    this.target = null; this.ready = false;
    this.canvas.remove();
    this.atlas.width = this.atlas.height = this.canvas.width = this.canvas.height = 1;
    if (this.surface) {
      const { gl, texture } = this.surface;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  }

  dispose() {
    this.release(); this.events.abort();
    if (this.surface) {
      const { gl, program, buffer, texture } = this.surface;
      gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program);
    }
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.surface = null;
  }
}
