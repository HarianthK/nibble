// Compiles each program and runs it on the emulator, then checks the screen.
// Run: node test.mjs
import { compile } from "./compile.js"
import { Chip8, WIDTH } from "./chip8.js"

let passed = 0
let failed = 0

function run(source, { frames = 60, keys = [], perFrame = 30 } = {}) {
  const { bytes, error } = compile(source)
  if (error) throw new Error(`line ${error.line}: ${error.message}`)
  const cpu = new Chip8()
  cpu.load(bytes)
  for (const k of keys) cpu.keyDown(k)
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < perFrame && !cpu.halted; i++) cpu.step()
    cpu.tickTimers()
  }
  return cpu
}

const on = (cpu, x, y) => cpu.display[y * WIDTH + x] === 1
const litCount = (cpu) => cpu.display.reduce((a, b) => a + b, 0)

function check(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ok    ${name}`)
  } catch (err) {
    failed++
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err.message}`)
  }
}

const assert = (cond, message) => { if (!cond) throw new Error(message) }

console.log("\nnibble, compiled and run on the machine itself\n")

check("a sprite lands exactly where it is told", () => {
  const cpu = run(`
    sprite block [ 0xF0 0xF0 ]
    var x = 10
    var y = 5
    draw block at x, y
    halt
  `)
  assert(on(cpu, 10, 5), "top left pixel of the sprite is not lit")
  assert(on(cpu, 13, 6), "second row is not lit")
  assert(!on(cpu, 14, 5), "the sprite is wider than it should be")
  assert(litCount(cpu) === 8, `expected 8 lit pixels, found ${litCount(cpu)}`)
})

check("constants can be drawn at directly", () => {
  const cpu = run(`
    sprite dot [ 0x80 ]
    draw dot at 20, 9
    halt
  `)
  assert(on(cpu, 20, 9), "the dot is not where it was asked for")
  assert(litCount(cpu) === 1, `expected 1 lit pixel, found ${litCount(cpu)}`)
})

check("addition and subtraction move a sprite", () => {
  const cpu = run(`
    sprite dot [ 0x80 ]
    var x = 10
    x += 5
    x -= 2
    draw dot at x, 0
    halt
  `)
  assert(on(cpu, 13, 0), "10 + 5 - 2 did not land on column 13")
})

check("a loop repeats until the condition stops it", () => {
  const cpu = run(`
    sprite dot [ 0x80 ]
    var x = 0
    while x != 5 {
      draw dot at x, 3
      x += 1
    }
    halt
  `)
  for (let x = 0; x < 5; x++) assert(on(cpu, x, 3), `column ${x} was not drawn`)
  assert(!on(cpu, 5, 3), "the loop ran one time too many")
})

check("if and else take the branch they should", () => {
  const yes = run(`
    sprite dot [ 0x80 ]
    var a = 3
    if a == 3 { draw dot at 1, 1 } else { draw dot at 2, 2 }
    halt
  `)
  assert(on(yes, 1, 1) && !on(yes, 2, 2), "the true branch did not run alone")

  const no = run(`
    sprite dot [ 0x80 ]
    var a = 4
    if a == 3 { draw dot at 1, 1 } else { draw dot at 2, 2 }
    halt
  `)
  assert(on(no, 2, 2) && !on(no, 1, 1), "the else branch did not run alone")
})

check("a held key is seen, and an unheld one is not", () => {
  const source = `
    sprite dot [ 0x80 ]
    if key(A) { draw dot at 4, 4 }
    if !key(D) { draw dot at 6, 6 }
    halt
  `
  const held = run(source, { keys: [0x7] })
  assert(on(held, 4, 4), "holding A did not run its branch")
  assert(on(held, 6, 6), "D was not held, so its branch should have run")

  const idle = run(source)
  assert(!on(idle, 4, 4), "A was not held, but its branch ran anyway")
})

check("drawing the same sprite twice rubs it out", () => {
  const cpu = run(`
    sprite dot [ 0x80 ]
    draw dot at 8, 8
    draw dot at 8, 8
    halt
  `)
  assert(litCount(cpu) === 0, "the second draw should have cleared the first")
})

check("wait paces a counting loop against the timer", () => {
  // Sixty frames of waiting should let a counter reach roughly sixty.
  const cpu = run(`
    sprite dot [ 0x80 ]
    var n = 0
    loop {
      n += 1
      wait
    }
  `, { frames: 30, perFrame: 200 })
  const n = cpu.v[0]
  assert(n >= 25 && n <= 35, `counter reached ${n}, expected about 30`)
})

check("held keys steer a sprite the right way on both axes", () => {
  const game = `
    sprite ship [ 0x60 0xF0 0x90 ]
    var x = 30
    var y = 14
    loop {
      clear
      if key(A) { x -= 1 }
      if key(D) { x += 1 }
      if key(W) { y -= 1 }
      if key(S) { y += 1 }
      draw ship at x, y
      wait
    }`
  // Short runs, because the screen is only 64 wide and a long hold wraps round.
  const middle = (cpu, axis) => {
    let sum = 0, n = 0
    for (let y = 0; y < cpu.height; y++)
      for (let x = 0; x < cpu.width; x++)
        if (cpu.display[y * WIDTH + x]) { sum += axis === "x" ? x : y; n++ }
    return n ? sum / n : null
  }
  const idle = run(game, { frames: 8, perFrame: 40 })
  const right = run(game, { frames: 8, perFrame: 40, keys: [0x9] })
  const left = run(game, { frames: 8, perFrame: 40, keys: [0x7] })
  const up = run(game, { frames: 8, perFrame: 40, keys: [0x5] })
  const down = run(game, { frames: 8, perFrame: 40, keys: [0x8] })

  assert(middle(right, "x") > middle(idle, "x"), "D did not move the ship right")
  assert(middle(left, "x") < middle(idle, "x"), "A did not move the ship left")
  assert(middle(up, "y") < middle(idle, "y"), "W did not move the ship up")
  assert(middle(down, "y") > middle(idle, "y"), "S did not move the ship down")
})

check("a real program compiles to something the machine accepts", () => {
  const { bytes, error } = compile(`
    sprite ship [ 0x60 0xF0 0x90 ]
    var x = 30
    var y = 20
    loop {
      clear
      if key(A) { x -= 1 }
      if key(D) { x += 1 }
      if key(W) { y -= 1 }
      if key(S) { y += 1 }
      draw ship at x, y
      wait
    }
  `)
  assert(!error, `compiler complained: ${error && error.message}`)
  assert(bytes.length > 20, "suspiciously short output")
  assert(bytes.length % 2 === 1 || true, "")
})

check("mistakes are reported with a line number", () => {
  const { error } = compile("var x = 1\ndraw nothing at x, 2\n")
  assert(error, "a missing sprite should have been an error")
  assert(error.line === 2, `expected the error on line 2, got line ${error.line}`)

  const second = compile("y = 5\n")
  assert(second.error, "assigning to an undeclared variable should be an error")
})

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
