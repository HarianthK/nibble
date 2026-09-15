// Nibble: a small language that compiles to CHIP-8 machine code.
// The language is described in the README.

// V0 to VC hold variables. VD and VE are scratch, VF is the machine's own flag.
const SCRATCH_A = 0xd
const SCRATCH_B = 0xe
const MAX_VARS = 0xd
const PROGRAM_START = 0x200

const KEYS = {
  1: 0x1, 2: 0x2, 3: 0x3, 4: 0xc,
  Q: 0x4, W: 0x5, E: 0x6, R: 0xd,
  A: 0x7, S: 0x8, D: 0x9, F: 0xe,
  Z: 0xa, X: 0x0, C: 0xb, V: 0xf,
}

// A four by five letter for every character `print` can write. Only the ones a
// program actually uses are put in the output.
const LETTERS = {
  A: [0x60, 0x90, 0xf0, 0x90, 0x90], B: [0xe0, 0x90, 0xe0, 0x90, 0xe0],
  C: [0x70, 0x80, 0x80, 0x80, 0x70], D: [0xe0, 0x90, 0x90, 0x90, 0xe0],
  E: [0xf0, 0x80, 0xe0, 0x80, 0xf0], F: [0xf0, 0x80, 0xe0, 0x80, 0x80],
  G: [0x70, 0x80, 0xb0, 0x90, 0x70], H: [0x90, 0x90, 0xf0, 0x90, 0x90],
  I: [0xe0, 0x40, 0x40, 0x40, 0xe0], J: [0x30, 0x10, 0x10, 0x90, 0x60],
  K: [0x90, 0xa0, 0xc0, 0xa0, 0x90], L: [0x80, 0x80, 0x80, 0x80, 0xf0],
  M: [0x90, 0xf0, 0xf0, 0x90, 0x90], N: [0x90, 0xd0, 0xb0, 0x90, 0x90],
  O: [0x60, 0x90, 0x90, 0x90, 0x60], P: [0xe0, 0x90, 0xe0, 0x80, 0x80],
  Q: [0x60, 0x90, 0x90, 0xb0, 0x70], R: [0xe0, 0x90, 0xe0, 0xa0, 0x90],
  S: [0x70, 0x80, 0x60, 0x10, 0xe0], T: [0xe0, 0x40, 0x40, 0x40, 0x40],
  U: [0x90, 0x90, 0x90, 0x90, 0x60], V: [0x90, 0x90, 0x90, 0x60, 0x60],
  W: [0x90, 0x90, 0xf0, 0xf0, 0x90], X: [0x90, 0x90, 0x60, 0x90, 0x90],
  Y: [0x90, 0x90, 0x60, 0x40, 0x40], Z: [0xf0, 0x10, 0x60, 0x80, 0xf0],
  "0": [0x60, 0x90, 0x90, 0x90, 0x60], "1": [0x40, 0xc0, 0x40, 0x40, 0xe0],
  "2": [0xe0, 0x10, 0x60, 0x80, 0xf0], "3": [0xe0, 0x10, 0x60, 0x10, 0xe0],
  "4": [0x90, 0x90, 0xf0, 0x10, 0x10], "5": [0xf0, 0x80, 0xe0, 0x10, 0xe0],
  "6": [0x60, 0x80, 0xe0, 0x90, 0x60], "7": [0xf0, 0x10, 0x20, 0x40, 0x40],
  "8": [0x60, 0x90, 0x60, 0x90, 0x60], "9": [0x60, 0x90, 0x70, 0x10, 0x60],
  "!": [0x40, 0x40, 0x40, 0x00, 0x40], "?": [0xe0, 0x10, 0x60, 0x00, 0x40],
  ".": [0x00, 0x00, 0x00, 0x00, 0x40], ",": [0x00, 0x00, 0x00, 0x40, 0x80],
  "-": [0x00, 0x00, 0xf0, 0x00, 0x00], ":": [0x00, 0x40, 0x00, 0x40, 0x00],
}

class Fault extends Error {
  constructor(message, line) {
    super(message)
    this.line = line
  }
}

function lex(source) {
  const tokens = []
  const lines = source.split("\n")
  lines.forEach((text, index) => {
    const line = index + 1
    let stripped = text
    let quoted = false
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '"') quoted = !quoted
      if (text[i] === "#" && !quoted) { stripped = text.slice(0, i); break }
    }
    // The two character operators have to be tried before the single ones, or
    // != would come out as ! followed by =.
    const re = /\s*("[^"]*"|[A-Za-z_][A-Za-z0-9_]*|0x[0-9a-fA-F]+|\d+|[[\]{}(),]|[+\-]=|[=!<>]=|[=+\-*!<>])/g
    let m
    while ((m = re.exec(stripped))) tokens.push({ text: m[1], line })
    tokens.push({ text: "\n", line })
  })
  tokens.push({ text: "<end>", line: lines.length })
  return tokens
}

export function compile(source) {
  const tokens = lex(source)
  let at = 0

  const peek = () => tokens[at].text
  const line = () => tokens[at].line
  const next = () => tokens[at++].text
  const skipNewlines = () => { while (peek() === "\n") at++ }
  const eat = (what) => {
    if (peek() !== what) throw new Fault(`expected ${what}, found ${peek()}`, line())
    return next()
  }
  // A named number is a number wherever it appears, so it is not a name.
  const consts = new Map()
  const isName = (t) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t) && !consts.has(t)

  const vars = new Map()
  const sprites = new Map()
  const arrays = new Map()
  const routines = new Map()
  const calls = []
  const breaks = [] // one list of jump slots per loop currently open
  // One tick of the delay timer, which the machine counts down at 60Hz.
  const emitWait = () => {
    emit(0x6000 | (SCRATCH_A << 8) | 1)
    emit(0xf015 | (SCRATCH_A << 8))
    const spin = here()
    emit(0xf007 | (SCRATCH_A << 8))
    emit(0x3000 | (SCRATCH_A << 8) | 0)
    emit(0x1000 | spin)
  }
  const shareWait = tokens.filter((t) => t.text === "wait").length >= 2
  const waitCalls = []
  // Showing a number is the same work every time, so two or more shows
  // share one copy of it, the way wait does.
  const shareShow = tokens.filter((t) => t.text === "show").length >= 2
  const showCalls = []
  // Draws the three digits parked in v0 to v2 at (vD, vE), leaving out the
  // zeros in front: 7 rather than 007, 42 rather than 042.
  const emitDigits = () => {
    const draw = (digit) => { emit(0xf029 | (digit << 8)); emit(0xd005 | (SCRATCH_A << 8) | (SCRATCH_B << 4)); emit(0x7000 | (SCRATCH_A << 8) | 5) }
    emit(0x4000)                       // hundreds: only if v0 is not zero
    const skipH = emit(0x1000)
    draw(0)
    code[skipH] = 0x1000 | here()
    emit(0x8011)                       // tens: only if v0 or v1 is not zero
    emit(0x4000)
    const skipT = emit(0x1000)
    draw(1)
    code[skipT] = 0x1000 | here()
    emit(0xf229)                       // units, always
    emit(0xd005 | (SCRATCH_A << 8) | (SCRATCH_B << 4))
  }
  // Print is drawn letter by letter inline, or from a table of glyph offsets
  // by one shared routine. Whichever is smaller for this program wins.
  const printed = tokens.filter((t, i) => t.text === "print" && tokens[i + 1]?.text.startsWith('"')).map((t, i) => tokens[tokens.indexOf(t) + 1].text.slice(1, -1))
  const inlineCost = printed.reduce((n, str) => n + 4 + [...str].reduce((m, c) => m + (c === " " ? 2 : 6), 0), 0)
  const tableCost = printed.reduce((n, str) => n + 16 + str.length + 1, 0) + 22 + (printed.some((str) => str.includes(" ")) ? 5 : 0)
  const tablePrint = printed.length > 0 && tableCost < inlineCost
  const printCalls = []
  const strings = []
  const glyphs = new Map()
  const code = []
  const fixups = []
  // Six bytes of working memory, only reserved if a program shows a number.
  let needsScratch = false

  const emit = (word) => { code.push(word & 0xffff); return code.length - 1 }
  // Every skip the machine has comes in a pair, one taken when the other is not.
  const flipSkip = (w) => {
    const top = w & 0xf000
    if (top === 0x3000 || top === 0x4000) return w ^ 0x7000
    if (top === 0x5000 || top === 0x9000) return w ^ 0xc000
    return w ^ 0x003f // EX9E and EXA1
  }
  const here = () => PROGRAM_START + code.length * 2
  const spriteRef = (name, ln, plus = 0) => {
    const slot = emit(0xa000)
    fixups.push({ slot, name, plus, line: ln })
  }

  // Points i at one cell of an array: a fixed cell by address, a variable one
  // by adding the register. Both leave i ready for a load or save of v0.
  const cellRef = (name, ln) => {
    eat("[")
    const idx = next()
    eat("]")
    if (isName(idx)) { spriteRef(name, ln); emit(0xf01e | (reg(idx, ln) << 8)) }
    else {
      const k = number(idx, ln)
      if (k >= arrays.get(name).length) throw new Fault(`${name} has ${arrays.get(name).length} cells, so ${k} is past the end`, ln)
      spriteRef(name, ln, k)
    }
  }
  // Reads and writes go through v0, which belongs to the program, so it is
  // parked in the working memory show already uses and put back afterwards.
  const parkV0 = () => { scratchRef(3); emit(0xf055) }
  const unparkV0 = () => { scratchRef(3); emit(0xf065) }

  // Each letter is a five row sprite, laid down after the code like any other.
  const glyphRef = (ch) => {
    if (!glyphs.has(ch)) glyphs.set(ch, LETTERS[ch])
    const slot = emit(0xa000)
    fixups.push({ slot, glyph: ch })
  }

  // Showing a number needs somewhere to put its digits and somewhere to park
  // the registers that reading them back borrows.
  const scratchRef = (offset) => {
    const slot = emit(0xa000)
    fixups.push({ slot, scratch: offset })
    needsScratch = true
  }

  const reg = (name, ln) => {
    if (consts.has(name)) throw new Fault(`${name} is a constant, and only a variable can go there`, ln)
    if (!vars.has(name)) throw new Fault(`no variable called ${name}`, ln)
    return vars.get(name)
  }

  const number = (t, ln) => {
    if (consts.has(t)) return consts.get(t)
    const n = t.startsWith("0x") ? parseInt(t, 16) : parseInt(t, 10)
    if (Number.isNaN(n)) throw new Fault(`${t} is not a number`, ln)
    // Everything here is a byte, and a number that wraps would be a silent
    // mistake rather than the one asked for.
    if (n < 0 || n > 255) throw new Fault(`${t} is outside 0 to 255, which is all a byte can hold`, ln)
    return n
  }

  // Loads a value into a scratch register when an instruction needs one there.
  const intoScratch = (which, ln) => {
    const t = next()
    if (isName(t)) emit(0x8000 | (which << 8) | (reg(t, ln) << 4))
    else emit(0x6000 | (which << 8) | (number(t, ln) & 0xff))
    return which
  }

  function condition() {
    // Emits a skip that is taken when the condition holds, so the caller can
    // put a jump straight after it to leap over the body.
    const ln = line()
    if (peek() === "hit") {
      // The machine sets its flag when a drawn sprite turns off a pixel that
      // was already lit, which is the only collision test it has.
      next()
      emit(0x4f00)
      return
    }
    if (peek() === "key" || peek() === "!") {
      const negated = peek() === "!"
      if (negated) next()
      eat("key"); eat("(")
      const k = next().toUpperCase()
      eat(")")
      if (!(k in KEYS)) throw new Fault(`${k} is not one of the sixteen keys`, ln)
      // The key number goes in a register, then EX9E skips when that key is
      // down and EXA1 when it is up.
      emit(0x6000 | (SCRATCH_A << 8) | KEYS[k])
      emit(0xe000 | (SCRATCH_A << 8) | (negated ? 0xa1 : 0x9e))
      return
    }
    const leftName = next()
    const left = reg(leftName, ln)
    const op = next()
    const rightTok = next()

    if (op === "<" || op === ">") {
      // Subtracting sets the flag to 1 when there was nothing to borrow, which
      // is to say when the first number was the larger. So a < b leaves it 0.
      const load = (which, tok) => {
        if (isName(tok)) emit(0x8000 | (which << 8) | (reg(tok, ln) << 4))
        else emit(0x6000 | (which << 8) | (number(tok, ln) & 0xff))
      }
      if (op === "<") { load(SCRATCH_A, leftName); load(SCRATCH_B, rightTok) }
      else { load(SCRATCH_A, rightTok); load(SCRATCH_B, leftName) }
      emit(0x8005 | (SCRATCH_A << 8) | (SCRATCH_B << 4))
      emit(0x3f00)
      return
    }

    if (op !== "==" && op !== "!=") throw new Fault(`${op} is not one of == != < >`, ln)
    if (isName(rightTok)) {
      const right = reg(rightTok, ln)
      emit((op === "==" ? 0x5000 : 0x9000) | (left << 8) | (right << 4))
    } else {
      const n = number(rightTok, ln) & 0xff
      emit((op === "==" ? 0x3000 : 0x4000) | (left << 8) | n)
    }
  }

  function block() {
    eat("{")
    skipNewlines()
    while (peek() !== "}") {
      if (peek() === "<end>") throw new Fault("missing a closing brace", line())
      statement()
      skipNewlines()
    }
    eat("}")
  }

  function statement() {
    const ln = line()
    const word = peek()

    if (word === "const") {
      next()
      const name = next()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Fault(`${name} is not a name a constant can have`, ln)
      if (vars.has(name) || routines.has(name) || sprites.has(name)) throw new Fault(`${name} is already used for something else`, ln)
      eat("=")
      consts.set(name, number(next(), ln))
      return
    }

    if (word === "var") {
      next()
      const name = next()
      if (consts.has(name)) throw new Fault(`${name} is already a constant`, ln)
      if (vars.has(name)) throw new Fault(`${name} is already a variable`, ln)
      if (vars.size >= MAX_VARS) throw new Fault(`too many variables, ${MAX_VARS} is the limit`, ln)
      const r = vars.size
      vars.set(name, r)
      eat("=")
      emit(0x6000 | (r << 8) | (number(next(), ln) & 0xff))
      return
    }

    if (word === "array") {
      next()
      const name = next()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Fault(`${name} is not a name an array can have`, ln)
      if (arrays.has(name) || sprites.has(name) || vars.has(name) || consts.has(name) || routines.has(name)) throw new Fault(`${name} is already used for something else`, ln)
      eat("[")
      const cells = []
      while (peek() !== "]") {
        if (peek() === "\n") { next(); continue }
        const v = number(next(), ln)
        // [ 64 of 0 ] is sixty four cells all holding zero.
        if (peek() === "of") { next(); const fill = number(next(), ln); for (let i = 0; i < v; i++) cells.push(fill); continue }
        cells.push(v)
      }
      eat("]")
      if (!cells.length) throw new Fault(`array ${name} has no cells`, ln)
      if (cells.length > 255) throw new Fault(`an array can have at most 255 cells`, ln)
      arrays.set(name, cells)
      return
    }

    if (word === "sprite") {
      next()
      const name = next()
      eat("[")
      const bytes = []
      while (peek() !== "]") {
        if (peek() === "\n") { next(); continue }
        bytes.push(number(next(), ln) & 0xff)
      }
      eat("]")
      if (!bytes.length) throw new Fault(`sprite ${name} has no rows`, ln)
      if (bytes.length > 15) throw new Fault(`a sprite can be at most 15 rows`, ln)
      sprites.set(name, bytes)
      return
    }

    if (word === "clear") { next(); emit(0x00e0); return }
    if (word === "halt") { next(); const spot = here(); emit(0x1000 | spot); return }

    if (word === "wait") {
      next()
      // Ten bytes inline, or a call to one shared copy once there are two.
      if (shareWait) waitCalls.push(emit(0x2000))
      else emitWait()
      return
    }

    if (word === "beep") {
      next()
      emit(0x6000 | (SCRATCH_A << 8) | (number(next(), ln) & 0xff))
      emit(0xf018 | (SCRATCH_A << 8))
      return
    }

    if (word === "rand") {
      next()
      const target = reg(next(), ln)
      eat(",")
      emit(0xc000 | (target << 8) | (number(next(), ln) & 0xff))
      return
    }

    if (word === "draw") {
      next()
      const spriteName = next()
      if (!sprites.has(spriteName)) throw new Fault(`no sprite called ${spriteName}`, ln)
      eat("at")
      const x = intoScratch(SCRATCH_A, ln)
      eat(",")
      const y = intoScratch(SCRATCH_B, ln)
      spriteRef(spriteName, ln)
      emit(0xd000 | (x << 8) | (y << 4) | sprites.get(spriteName).length)
      return
    }

    if (word === "show") {
      next()
      const value = reg(next(), ln)
      eat("at")
      const xTok = next()
      eat(",")
      const yTok = next()

      // The digits go to memory first, since reading them back lands them in
      // V0 to V2, which belong to the program and are parked meanwhile.
      scratchRef(0)
      emit(0xf033 | (value << 8))
      if (isName(xTok)) emit(0x8000 | (SCRATCH_A << 8) | (reg(xTok, ln) << 4))
      else emit(0x6000 | (SCRATCH_A << 8) | (number(xTok, ln) & 0xff))
      if (isName(yTok)) emit(0x8000 | (SCRATCH_B << 8) | (reg(yTok, ln) << 4))
      else emit(0x6000 | (SCRATCH_B << 8) | (number(yTok, ln) & 0xff))
      if (shareShow) { showCalls.push(emit(0x2000)); return }
      scratchRef(3)
      emit(0xf255)
      scratchRef(0)
      emit(0xf265)
      emitDigits()
      scratchRef(3)
      emit(0xf265)
      return
    }

    if (word === "print") {
      next()
      const text = next()
      if (!text.startsWith('"')) throw new Fault(`print wants some words in quotes, found ${text}`, ln)
      eat("at")
      const xTok = next()
      eat(",")
      const yTok = next()

      const put = (which, tok) => {
        if (isName(tok)) emit(0x8000 | (which << 8) | (reg(tok, ln) << 4))
        else emit(0x6000 | (which << 8) | (number(tok, ln) & 0xff))
      }
      if (tablePrint) {
        // The routine walks the string in V1 and reads each byte into V0, so
        // both are parked in memory around the call, the way show does it.
        if (strings.length + text.length > 255) throw new Fault("too much text to print in one program", ln)
        scratchRef(3)
        emit(0xf155)
        emit(0x6100 | strings.length)
        for (const raw of text.slice(1, -1)) {
          const ch = raw.toUpperCase()
          if (!(ch in LETTERS) && ch !== " ") throw new Fault(`there is no letter for ${raw}`, ln)
          if (!glyphs.has(ch)) glyphs.set(ch, ch === " " ? [0, 0, 0, 0, 0] : LETTERS[ch])
          strings.push([...glyphs.keys()].indexOf(ch) * 5)
        }
        strings.push(0xff)
        put(SCRATCH_A, xTok)
        put(SCRATCH_B, yTok)
        printCalls.push(emit(0x2000))
        scratchRef(3)
        emit(0xf165)
        return
      }

      put(SCRATCH_A, xTok)
      put(SCRATCH_B, yTok)

      for (const raw of text.slice(1, -1)) {
        const ch = raw.toUpperCase()
        if (ch !== " ") {
          if (!(ch in LETTERS)) throw new Fault(`there is no letter for ${raw}`, ln)
          glyphRef(ch)
          emit(0xd005 | (SCRATCH_A << 8) | (SCRATCH_B << 4))
        }
        // Step along whether or not anything was drawn, so spaces take room.
        emit(0x7000 | (SCRATCH_A << 8) | 5)
      }
      return
    }

    // break inside a loop leaves it. Each open loop collects its own breaks.
    const loopBody = () => {
      breaks.push([])
      block()
      return breaks.pop()
    }
    const closeLoop = (outs) => { for (const o of outs) code[o] = 0x1000 | here() }

    if (word === "break") {
      next()
      if (!breaks.length) throw new Fault("break is only for inside a loop", ln)
      breaks[breaks.length - 1].push(emit(0x1000))
      return
    }

    if (word === "loop") {
      next()
      const top = here()
      const outs = loopBody()
      emit(0x1000 | top)
      closeLoop(outs)
      return
    }

    // a and b and c: every part gets its own skip and jump out, so the first
    // part that fails leaves. Returns the jumps to patch once the end is known.
    const conditions = () => {
      const outs = []
      do {
        if (outs.length) next()
        condition()
        outs.push(emit(0x1000))
      } while (peek() === "and")
      return outs
    }

    if (word === "while") {
      next()
      const top = here()
      const outs = conditions()
      const broken = loopBody()
      emit(0x1000 | top)
      closeLoop([...outs, ...broken])
      return
    }

    if (word === "for") {
      // for x = a to b { ... } runs the body with x at a, a+1 ... b. The end
      // has to be a number, since the test is against one more than it.
      next()
      const target = reg(next(), ln)
      eat("=")
      const first = next()
      if (isName(first)) emit(0x8000 | (target << 8) | (reg(first, ln) << 4))
      else emit(0x6000 | (target << 8) | (number(first, ln) & 0xff))
      eat("to")
      const lastTok = next()
      if (isName(lastTok)) throw new Fault("for needs a number after to, not a variable", ln)
      const last = number(lastTok, ln)
      if (last > 254) throw new Fault("for can count up to 254 at most", ln)
      const top = here()
      emit(0x4000 | (target << 8) | (last + 1))
      const jumpOut = emit(0x1000)
      const broken = loopBody()
      emit(0x7000 | (target << 8) | 1)
      emit(0x1000 | top)
      closeLoop([jumpOut, ...broken])
      return
    }

    if (word === "if") {
      next()
      const outs = conditions()
      const jumpOver = outs[outs.length - 1]
      block()
      skipNewlines()
      if (peek() === "else") {
        next()
        const jumpPastElse = emit(0x1000)
        for (const o of outs) code[o] = 0x1000 | here()
        // else if is another if in the else branch, without the braces.
        if (peek() === "if") statement()
        else block()
        code[jumpPastElse] = 0x1000 | here()
      } else if (outs.length === 1 && code.length === jumpOver + 2 && (code[jumpOver + 1] & 0xf000) !== 0x1000) {
        // A one-word body needs no jump: flip the skip and put the body
        // where the jump was. See DOCS.md for why jumps are left alone.
        code[jumpOver - 1] = flipSkip(code[jumpOver - 1])
        code[jumpOver] = code.pop()
        for (const c of calls) if (c.slot === jumpOver + 1) c.slot = jumpOver
      } else {
        for (const o of outs) code[o] = 0x1000 | here()
      }
      return
    }

    if (word === "def") {
      next()
      const name = next()
      if (routines.has(name)) throw new Fault(`${name} is already a routine`, ln)
      if (vars.has(name)) throw new Fault(`${name} is already a variable`, ln)
      // The body sits in the middle of the program, so step over it.
      const skip = emit(0x1000)
      routines.set(name, here())
      block()
      emit(0x00ee)
      code[skip] = 0x1000 | here()
      return
    }

    // name[i] = value puts a number or a variable into one cell.
    if (arrays.has(word) && tokens[at + 1]?.text === "[") {
      const name = next()
      // The cell's address is worked out before v0 is touched, in case the
      // index is v0 itself.
      const parkNeeded = () => { const t = tokens[at]?.text; return !(isName(t) && vars.get(t) === 0) }
      // Peek past ] = to see what is being stored.
      let look = at
      while (tokens[look] && tokens[look].text !== "=") look++
      const valueTok = tokens[look + 1]?.text
      const valueIsV0 = isName(valueTok ?? "") && vars.get(valueTok) === 0
      if (!valueIsV0) parkV0()
      cellRef(name, ln)
      eat("=")
      const value = next()
      if (!valueIsV0) {
        if (isName(value)) emit(0x8000 | (reg(value, ln) << 4))
        else emit(0x6000 | (number(value, ln) & 0xff))
      }
      emit(0xf055)
      if (!valueIsV0) unparkV0()
      return
    }

    // A name on its own is a call. A name followed by an operator is not.
    if (isName(word) && !["=", "+=", "-="].includes(tokens[at + 1]?.text)) {
      const name = next()
      const slot = emit(0x2000)
      calls.push({ slot, name, line: ln })
      return
    }

    if (isName(word)) {
      const name = next()
      const target = reg(name, ln)
      const op = next()
      if (op === "+=" || op === "-=") {
        const t = next()
        if (isName(t)) {
          emit(0x8000 | (target << 8) | (reg(t, ln) << 4) | (op === "+=" ? 4 : 5))
        } else {
          const n = number(t, ln) & 0xff
          // Subtracting a constant is adding its complement, which wraps the
          // same way the machine's own eight bit registers do.
          emit(0x7000 | (target << 8) | ((op === "+=" ? n : 256 - n) & 0xff))
        }
        return
      }
      if (op !== "=") throw new Fault(`expected = after ${name}, found ${op}`, ln)
      const first = next()
      // x = key holds the program until a key is pressed and let go.
      if (first === "key" && peek() !== "(") { emit(0xf00a | (target << 8)); return }
      if (arrays.has(first)) {
        // x = name[i]: the cell arrives in v0, then goes where it was asked for.
        if (target !== 0) parkV0()
        cellRef(first, ln)
        emit(0xf065)
        if (target !== 0) { emit(0x8000 | (target << 8)); unparkV0() }
        return
      }
      // x = x + 1 needs no copy of x into itself first.
      if (isName(first)) { if (reg(first, ln) !== target) emit(0x8000 | (target << 8) | (reg(first, ln) << 4)) }
      else emit(0x6000 | (target << 8) | (number(first, ln) & 0xff))
      // An optional second term, so x = y + 1 works as well as x = y.
      if (peek() === "+" || peek() === "-") {
        const sign = next()
        const t = next()
        if (isName(t)) {
          emit(0x8000 | (target << 8) | (reg(t, ln) << 4) | (sign === "+" ? 4 : 5))
        } else {
          const n = number(t, ln) & 0xff
          emit(0x7000 | (target << 8) | ((sign === "+" ? n : 256 - n) & 0xff))
        }
      }
      return
    }

    if (consts.has(word)) throw new Fault(`${word} is a constant, and only a variable can go there`, ln)
    throw new Fault(`did not understand ${word}`, ln)
  }

  try {
    skipNewlines()
    while (peek() !== "<end>") {
      statement()
      skipNewlines()
    }
    if (waitCalls.length) {
      const at = here()
      emitWait()
      emit(0x00ee)
      for (const slot of waitCalls) code[slot] = 0x2000 | at
    }
    if (showCalls.length) {
      // The caller has done the BCD and set vD and vE; this parks v0 to v2,
      // draws, and puts them back.
      const at = here()
      scratchRef(3)
      emit(0xf255)
      scratchRef(0)
      emit(0xf265)
      emitDigits()
      scratchRef(3)
      emit(0xf265)
      emit(0x00ee)
      for (const slot of showCalls) code[slot] = 0x2000 | at
    }
    if (printCalls.length) {
      // Reads a glyph offset from the table at V1, returns on 0xFF, otherwise
      // draws that glyph at (VD, VE) and steps both along.
      const at = here()
      fixups.push({ slot: emit(0xa000), table: true })
      emit(0xf11e)
      emit(0xf065)
      emit(0x40ff)
      emit(0x00ee)
      fixups.push({ slot: emit(0xa000), glyphBase: true })
      emit(0xf01e)
      emit(0xd005 | (SCRATCH_A << 8) | (SCRATCH_B << 4))
      emit(0x7000 | (SCRATCH_A << 8) | 5)
      emit(0x7101)
      emit(0x1000 | at)
      for (const slot of printCalls) code[slot] = 0x2000 | at
    }

    // Sprites live after the code, which is why their addresses are only known
    // once every instruction has been counted.
    const bytes = []
    for (const word of code) bytes.push((word >> 8) & 0xff, word & 0xff)
    const placed = new Map()
    for (const [name, rows] of sprites) {
      placed.set(name, PROGRAM_START + bytes.length)
      bytes.push(...rows)
    }
    for (const [name, cells] of arrays) {
      placed.set(name, PROGRAM_START + bytes.length)
      bytes.push(...cells)
    }
    for (const { slot, name, line: ln } of calls) {
      const address = routines.get(name)
      if (address === undefined) throw new Fault(`nothing here is called ${name}`, ln)
      const word = 0x2000 | address
      code[slot] = word
      bytes[slot * 2] = (word >> 8) & 0xff
      bytes[slot * 2 + 1] = word & 0xff
    }

    const scratchAt = PROGRAM_START + bytes.length
    if (needsScratch) bytes.push(0, 0, 0, 0, 0, 0)
    const glyphAt = new Map()
    for (const [ch, rows] of glyphs) {
      glyphAt.set(ch, PROGRAM_START + bytes.length)
      bytes.push(...rows)
    }
    const glyphBase = glyphs.size ? glyphAt.values().next().value : PROGRAM_START + bytes.length
    const tableAt = PROGRAM_START + bytes.length
    bytes.push(...strings)
    for (const { slot, name, plus = 0, scratch, glyph, table, glyphBase: base, line: ln } of fixups) {
      const found = table ? tableAt : base ? glyphBase
        : glyph !== undefined ? glyphAt.get(glyph)
        : scratch === undefined ? placed.get(name) : scratchAt + scratch
      const address = found === undefined ? undefined : found + plus
      if (address === undefined) throw new Fault(`no sprite called ${name}`, ln)
      const word = 0xa000 | address
      bytes[slot * 2] = (word >> 8) & 0xff
      bytes[slot * 2 + 1] = word & 0xff
    }
    if (bytes.length > 4096 - PROGRAM_START) throw new Fault("the program is too big for the machine", 0)
    return { bytes: Uint8Array.from(bytes), error: null }
  } catch (err) {
    if (err instanceof Fault) return { bytes: null, error: { message: err.message, line: err.line } }
    throw err
  }
}
