// The CHIP-8 machine: memory, registers, and the instruction loop.
// Everything here is the 1977 spec; nothing about drawing or keyboards.

// SUPER-CHIP added a bigger screen. The buffer is always the larger one and
// low resolution simply uses the top left corner of it.
export const WIDTH = 128
export const HEIGHT = 64
export const LOW_WIDTH = 64
export const LOW_HEIGHT = 32

// Programs are loaded here because the interpreter itself used to live below.
const PROGRAM_START = 0x200

// The built-in font, 0 through F, five bytes per character.
const FONT = [
  0xf0, 0x90, 0x90, 0x90, 0xf0, 0x20, 0x60, 0x20, 0x20, 0x70,
  0xf0, 0x10, 0xf0, 0x80, 0xf0, 0xf0, 0x10, 0xf0, 0x10, 0xf0,
  0x90, 0x90, 0xf0, 0x10, 0x10, 0xf0, 0x80, 0xf0, 0x10, 0xf0,
  0xf0, 0x80, 0xf0, 0x90, 0xf0, 0xf0, 0x10, 0x20, 0x40, 0x40,
  0xf0, 0x90, 0xf0, 0x90, 0xf0, 0xf0, 0x90, 0xf0, 0x10, 0xf0,
  0xf0, 0x90, 0xf0, 0x90, 0x90, 0xe0, 0x90, 0xe0, 0x90, 0xe0,
  0xf0, 0x80, 0x80, 0x80, 0xf0, 0xe0, 0x90, 0x90, 0x90, 0xe0,
  0xf0, 0x80, 0xf0, 0x80, 0xf0, 0xf0, 0x80, 0xf0, 0x80, 0x80,
]

// SUPER-CHIP's double height font, 0 through 9, ten bytes per character.
const BIG_FONT = [
  0x3c, 0x7e, 0xc3, 0xc3, 0xc3, 0xc3, 0xc3, 0xc3, 0x7e, 0x3c,
  0x18, 0x38, 0x58, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3c,
  0x3e, 0x7f, 0xc3, 0x06, 0x0c, 0x18, 0x30, 0x60, 0xff, 0xff,
  0x3c, 0x7e, 0xc3, 0x03, 0x0e, 0x0e, 0x03, 0xc3, 0x7e, 0x3c,
  0x06, 0x0e, 0x1e, 0x36, 0x66, 0xc6, 0xff, 0xff, 0x06, 0x06,
  0xff, 0xff, 0xc0, 0xc0, 0xfc, 0xfe, 0x03, 0xc3, 0x7e, 0x3c,
  0x3e, 0x7c, 0xc0, 0xc0, 0xfc, 0xfe, 0xc3, 0xc3, 0x7e, 0x3c,
  0xff, 0xff, 0x03, 0x06, 0x0c, 0x18, 0x30, 0x60, 0x60, 0x60,
  0x3c, 0x7e, 0xc3, 0xc3, 0x7e, 0x7e, 0xc3, 0xc3, 0x7e, 0x3c,
  0x3c, 0x7e, 0xc3, 0xc3, 0x7f, 0x3f, 0x03, 0x03, 0x7e, 0x7c,
]
const BIG_FONT_AT = 0x50

export class Chip8 {
  constructor() {
    this.reset()
  }

  reset() {
    // XO-CHIP widened the address space from four kilobytes to sixty four.
    this.memory = new Uint8Array(65536)
    this.v = new Uint8Array(16)
    this.i = 0
    this.pc = PROGRAM_START
    this.stack = new Uint16Array(16)
    this.sp = 0
    this.delay = 0
    this.sound = 0
    this.display = new Uint8Array(WIDTH * HEIGHT)
    this.keys = new Uint8Array(16)
    this.halted = false
    // Set when a program draws, so the screen is only repainted if it changed.
    this.drawn = false
    // FX0A waits for a key; this holds the register it will land in.
    this.waitingFor = -1
    // The opcode that stopped the machine, if it met one it does not have.
    this.unsupported = 0
    // Low resolution until a program asks for the bigger screen.
    this.hires = false
    // FX75/FX85 save and restore these across a program, but not a reset.
    this.flags = this.flags ?? new Uint8Array(8)
    // XO-CHIP draws into two overlaid bitplanes, so a pixel holds 0 to 3.
    this.plane = 1
    // Sixteen bytes of waveform and the rate to play them at.
    this.pattern = new Uint8Array(16)
    this.pitch = 64
    // Which keys the program has asked about. Nothing in the archive records
    // its controls, but every program tells the machine what it is watching.
    this.used = new Uint8Array(16)
    this.anyKey = false
    this.memory.set(FONT, 0)
    this.memory.set(BIG_FONT, BIG_FONT_AT)
  }

  get width() {
    return this.hires ? WIDTH : LOW_WIDTH
  }

  get height() {
    return this.hires ? HEIGHT : LOW_HEIGHT
  }

  load(bytes) {
    this.reset()
    this.memory.set(bytes.subarray(0, 65536 - PROGRAM_START), PROGRAM_START)
  }

  // The timers tick at 60Hz regardless of how fast instructions run.
  tickTimers() {
    if (this.delay > 0) this.delay--
    if (this.sound > 0) this.sound--
  }

  keyDown(key) {
    this.keys[key] = 1
    // A program parked on FX0A resumes the moment any key goes down.
    if (this.waitingFor >= 0) {
      this.v[this.waitingFor] = key
      this.waitingFor = -1
    }
  }

  keyUp(key) {
    this.keys[key] = 0
  }

  step() {
    if (this.halted || this.waitingFor >= 0) return

    const opcode = (this.memory[this.pc] << 8) | this.memory[this.pc + 1]
    this.pc = (this.pc + 2) & 0xffff

    const nnn = opcode & 0x0fff
    const nn = opcode & 0x00ff
    const n = opcode & 0x000f
    const x = (opcode & 0x0f00) >> 8
    const y = (opcode & 0x00f0) >> 4

    switch (opcode & 0xf000) {
      case 0x0000:
        if (opcode === 0x00e0) {
          this.clear()
        } else if (opcode === 0x00ee) {
          this.pc = this.stack[--this.sp & 0xf]
        } else if (opcode === 0x00fd) {
          this.halted = true
        } else if (opcode === 0x00ff || opcode === 0x00fe) {
          this.hires = opcode === 0x00ff
          this.display.fill(0)
          this.drawn = true
        } else if ((opcode & 0xfff0) === 0x00c0) {
          this.scrollDown(n)
        } else if ((opcode & 0xfff0) === 0x00d0) {
          this.scrollDown(-n)
        } else if (opcode === 0x00fb) {
          this.scrollSide(4)
        } else if (opcode === 0x00fc) {
          this.scrollSide(-4)
        }
        // Anything else here is a call into 1977 machine code. Ignored.
        break

      case 0x1000: // Jump. A jump to itself is how programs signal they are done.
        if (nnn === this.pc - 2) this.halted = true
        this.pc = nnn
        break

      case 0x2000:
        this.stack[this.sp++ & 0xf] = this.pc
        this.pc = nnn
        break

      case 0x3000: if (this.v[x] === nn) this.pc += 2; break
      case 0x4000: if (this.v[x] !== nn) this.pc += 2; break
      case 0x5000:
        if (n === 2 || n === 3) {
          const step = x <= y ? 1 : -1
          for (let r = x, o = 0; ; r += step, o++) {
            if (n === 2) this.memory[(this.i + o) & 0xffff] = this.v[r]
            else this.v[r] = this.memory[(this.i + o) & 0xffff]
            if (r === y) break
          }
        } else if (this.v[x] === this.v[y]) this.pc += 2
        break
      case 0x6000: this.v[x] = nn; break
      case 0x7000: this.v[x] = (this.v[x] + nn) & 0xff; break

      case 0x8000: this.arithmetic(x, y, n); break

      case 0x9000: if (this.v[x] !== this.v[y]) this.pc += 2; break
      case 0xa000: this.i = nnn; break
      case 0xb000: this.pc = (nnn + this.v[0]) & 0xfff; break
      case 0xc000: this.v[x] = Math.floor(Math.random() * 256) & nn; break
      case 0xd000: this.draw(this.v[x], this.v[y], n); break

      case 0xe000: {
        const asked = this.v[x] & 0xf
        this.used[asked] = 1
        if (nn === 0x9e && this.keys[asked]) this.pc += 2
        if (nn === 0xa1 && !this.keys[asked]) this.pc += 2
        break
      }

      case 0xf000: this.misc(x, nn); break
    }
  }

  arithmetic(x, y, n) {
    const a = this.v[x]
    const b = this.v[y]
    switch (n) {
      case 0x0: this.v[x] = b; break
      case 0x1: this.v[x] = a | b; break
      case 0x2: this.v[x] = a & b; break
      case 0x3: this.v[x] = a ^ b; break
      // The carry flag is written after the result, and some programs rely on
      // reading VF as an operand first, so the order matters.
      case 0x4: this.v[x] = (a + b) & 0xff; this.v[0xf] = a + b > 0xff ? 1 : 0; break
      case 0x5: this.v[x] = (a - b) & 0xff; this.v[0xf] = a >= b ? 1 : 0; break
      case 0x6: this.v[x] = a >> 1; this.v[0xf] = a & 1; break
      case 0x7: this.v[x] = (b - a) & 0xff; this.v[0xf] = b >= a ? 1 : 0; break
      case 0xe: this.v[x] = (a << 1) & 0xff; this.v[0xf] = (a >> 7) & 1; break
    }
  }

  misc(x, nn) {
    switch (nn) {
      case 0x00: // F000 is two words: the second is a full 16 bit address.
        this.i = (this.memory[this.pc] << 8) | this.memory[this.pc + 1]
        this.pc = (this.pc + 2) & 0xffff
        break
      case 0x01: this.plane = x & 3; break
      case 0x02:
        for (let b = 0; b < 16; b++) this.pattern[b] = this.memory[(this.i + b) & 0xffff]
        break
      case 0x3a: this.pitch = this.v[x]; break
      case 0x07: this.v[x] = this.delay; break
      // Waiting on any key at all, rather than watching a particular one.
      case 0x0a: this.waitingFor = x; this.anyKey = true; break
      case 0x15: this.delay = this.v[x]; break
      case 0x18: this.sound = this.v[x]; break
      case 0x1e: this.i = (this.i + this.v[x]) & 0xffff; break
      case 0x29: this.i = (this.v[x] & 0xf) * 5; break
      case 0x33: // Binary-coded decimal: hundreds, tens, units.
        this.memory[this.i & 0xffff] = Math.floor(this.v[x] / 100)
        this.memory[(this.i + 1) & 0xffff] = Math.floor(this.v[x] / 10) % 10
        this.memory[(this.i + 2) & 0xffff] = this.v[x] % 10
        break
      case 0x55:
        for (let r = 0; r <= x; r++) this.memory[(this.i + r) & 0xffff] = this.v[r]
        break
      case 0x65:
        for (let r = 0; r <= x; r++) this.v[r] = this.memory[(this.i + r) & 0xffff]
        break
      case 0x30: this.i = BIG_FONT_AT + (this.v[x] % 10) * 10; break
      case 0x75:
        for (let r = 0; r <= (x & 7); r++) this.flags[r] = this.v[r]
        break
      case 0x85:
        for (let r = 0; r <= (x & 7); r++) this.v[r] = this.flags[r]
        break
      default: this.stop(0xf000 | nn)
    }
  }

  stop(opcode) {
    this.unsupported = opcode
    this.halted = true
  }

  // Only the selected planes are cleared, which is how XO-CHIP wipes one
  // layer and leaves the other standing.
  clear() {
    for (let i = 0; i < this.display.length; i++) this.display[i] &= ~this.plane
    this.drawn = true
  }

  // Sprites are drawn by flipping pixels; VF reports whether anything was
  // switched off. A row count of zero is SUPER-CHIP's sixteen by sixteen.
  draw(vx, vy, rows) {
    this.v[0xf] = 0
    if (this.plane === 0) return
    let at = this.i
    // With both planes selected the sprite is stored twice over, one whole
    // sprite for the first plane and then another for the second.
    for (const layer of [1, 2]) {
      if (!(this.plane & layer)) continue
      at = this.blit(vx, vy, rows, layer, at)
    }
    this.drawn = true
  }

  blit(vx, vy, rows, layer, from) {
    const w = this.width
    const h = this.height
    const wide = rows === 0
    const tall = wide ? 16 : rows
    const span = wide ? 16 : 8
    let at = from
    for (let row = 0; row < tall; row++) {
      const bits = wide
        ? (this.memory[at & 0xffff] << 8) | this.memory[(at + 1) & 0xffff]
        : this.memory[at & 0xffff]
      at += wide ? 2 : 1
      const py = (vy + row) % h
      for (let bit = 0; bit < span; bit++) {
        if (!(bits & (1 << (span - 1 - bit)))) continue
        const px = (vx + bit) % w
        const cell = py * WIDTH + px
        if (this.display[cell] & layer) this.v[0xf] = 1
        this.display[cell] ^= layer
      }
    }
    return at
  }

  // Scrolling moves the visible area only, so the rows and columns beyond the
  // low resolution corner are left alone.
  scrollDown(rows) {
    const w = this.width
    const h = this.height
    const ys = rows >= 0 ? [...Array(h).keys()].reverse() : [...Array(h).keys()]
    for (const y of ys) {
      const from = y - rows
      const inside = from >= 0 && from < h
      for (let x = 0; x < w; x++) {
        this.display[y * WIDTH + x] = inside ? this.display[from * WIDTH + x] : 0
      }
    }
    this.drawn = true
  }

  scrollSide(by) {
    const w = this.width
    for (let y = 0; y < this.height; y++) {
      const row = y * WIDTH
      if (by > 0) {
        for (let x = w - 1; x >= 0; x--) {
          this.display[row + x] = x - by >= 0 ? this.display[row + x - by] : 0
        }
      } else {
        for (let x = 0; x < w; x++) {
          this.display[row + x] = x - by < w ? this.display[row + x - by] : 0
        }
      }
    }
    this.drawn = true
  }
}
