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
    const stripped = text.split("#")[0]
    // The two character operators have to be tried before the single ones, or
    // != would come out as ! followed by =.
    const re = /\s*([A-Za-z_][A-Za-z0-9_]*|0x[0-9a-fA-F]+|\d+|[[\]{}(),]|[+\-]=|[=!<>]=|[=+\-*!<>])/g
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
  const isName = (t) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t)

  const vars = new Map()
  const sprites = new Map()
  const routines = new Map()
  const calls = []
  const code = []
  const fixups = []
  // Six bytes of working memory, only reserved if a program shows a number.
  let needsScratch = false

  const emit = (word) => { code.push(word & 0xffff); return code.length - 1 }
  const here = () => PROGRAM_START + code.length * 2
  const spriteRef = (name, ln) => {
    const slot = emit(0xa000)
    fixups.push({ slot, name, line: ln })
  }

  // The machine writes decimal digits into memory, so showing a number needs
  // somewhere to put them and somewhere to park the registers it borrows.
  const scratchRef = (offset) => {
    const slot = emit(0xa000)
    fixups.push({ slot, scratch: offset })
    needsScratch = true
  }

  const reg = (name, ln) => {
    if (!vars.has(name)) throw new Fault(`no variable called ${name}`, ln)
    return vars.get(name)
  }

  const number = (t, ln) => {
    const n = t.startsWith("0x") ? parseInt(t, 16) : parseInt(t, 10)
    if (Number.isNaN(n)) throw new Fault(`${t} is not a number`, ln)
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

    if (word === "var") {
      next()
      const name = next()
      if (vars.has(name)) throw new Fault(`${name} is already a variable`, ln)
      if (vars.size >= MAX_VARS) throw new Fault(`too many variables, ${MAX_VARS} is the limit`, ln)
      const r = vars.size
      vars.set(name, r)
      eat("=")
      emit(0x6000 | (r << 8) | (number(next(), ln) & 0xff))
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
      // One tick of the delay timer, which the machine counts down at 60Hz.
      emit(0x6000 | (SCRATCH_A << 8) | 1)
      emit(0xf015 | (SCRATCH_A << 8))
      const spin = here()
      emit(0xf007 | (SCRATCH_A << 8))
      emit(0x3000 | (SCRATCH_A << 8) | 0)
      emit(0x1000 | spin)
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

      // Reading the digits back lands them in V0 to V2, which belong to the
      // program, so those are parked in memory first and put back after.
      scratchRef(0)
      emit(0xf033 | (value << 8))
      scratchRef(3)
      emit(0xf255)
      scratchRef(0)
      emit(0xf265)

      if (isName(xTok)) emit(0x8000 | (SCRATCH_A << 8) | (reg(xTok, ln) << 4))
      else emit(0x6000 | (SCRATCH_A << 8) | (number(xTok, ln) & 0xff))
      if (isName(yTok)) emit(0x8000 | (SCRATCH_B << 8) | (reg(yTok, ln) << 4))
      else emit(0x6000 | (SCRATCH_B << 8) | (number(yTok, ln) & 0xff))

      for (const digit of [0, 1, 2]) {
        emit(0xf029 | (digit << 8))
        emit(0xd005 | (SCRATCH_A << 8) | (SCRATCH_B << 4))
        if (digit < 2) emit(0x7000 | (SCRATCH_A << 8) | 5)
      }

      scratchRef(3)
      emit(0xf265)
      return
    }

    if (word === "loop") {
      next()
      const top = here()
      block()
      emit(0x1000 | top)
      return
    }

    if (word === "while") {
      next()
      const top = here()
      condition()
      const jumpOut = emit(0x1000)
      block()
      emit(0x1000 | top)
      code[jumpOut] = 0x1000 | here()
      return
    }

    if (word === "if") {
      next()
      condition()
      const jumpOver = emit(0x1000)
      block()
      skipNewlines()
      if (peek() === "else") {
        next()
        const jumpPastElse = emit(0x1000)
        code[jumpOver] = 0x1000 | here()
        block()
        code[jumpPastElse] = 0x1000 | here()
      } else {
        code[jumpOver] = 0x1000 | here()
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
      if (isName(first)) emit(0x8000 | (target << 8) | (reg(first, ln) << 4))
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

    throw new Fault(`did not understand ${word}`, ln)
  }

  try {
    skipNewlines()
    while (peek() !== "<end>") {
      statement()
      skipNewlines()
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
    for (const { slot, name, scratch, line: ln } of fixups) {
      const address = scratch === undefined ? placed.get(name) : scratchAt + scratch
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
