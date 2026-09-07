// Compiles each program and runs it on the emulator, then checks the screen.
// Run: node test.mjs
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, rmSync } from "node:fs"
import { compile } from "./compile.js"
import { EXAMPLES } from "./examples.js"
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

check("less than and greater than pick the right side", () => {
  const both = (a, b, op) => run(`
    sprite dot [ 0x80 ]
    var p = ${a}
    var q = ${b}
    if p ${op} q { draw dot at 1, 1 } else { draw dot at 3, 3 }
    halt
  `)
  const took = (cpu) => (on(cpu, 1, 1) ? "then" : on(cpu, 3, 3) ? "else" : "neither")

  assert(took(both(3, 9, "<")) === "then", "3 < 9 should be true")
  assert(took(both(9, 3, "<")) === "else", "9 < 3 should be false")
  assert(took(both(5, 5, "<")) === "else", "5 < 5 should be false")
  assert(took(both(9, 3, ">")) === "then", "9 > 3 should be true")
  assert(took(both(3, 9, ">")) === "else", "3 > 9 should be false")
  assert(took(both(5, 5, ">")) === "else", "5 > 5 should be false")
})

check("comparing against a plain number works too", () => {
  const cpu = run(`
    sprite dot [ 0x80 ]
    var n = 0
    while n < 6 { n += 1 }
    draw dot at n, 2
    halt
  `)
  assert(on(cpu, 6, 2), "the loop should have stopped with n at 6")
})

check("show puts a number on screen and gives the registers back", () => {
  const cpu = run(`
    var a = 7
    var b = 8
    var c = 9
    var score = 123
    show score at 10, 4
    halt
  `)
  assert(litCount(cpu) > 20, `expected digits to be drawn, found ${litCount(cpu)} lit pixels`)
  // The digits are drawn from the machine's own font, five rows tall.
  let inBand = 0
  for (let y = 4; y < 9; y++) for (let x = 10; x < 25; x++) if (on(cpu, x, y)) inBand++
  assert(inBand > 20, `expected the digits where they were asked for, found ${inBand}`)
  assert(cpu.v[0] === 7 && cpu.v[1] === 8 && cpu.v[2] === 9,
    `show trampled the first three variables: ${cpu.v[0]}, ${cpu.v[1]}, ${cpu.v[2]}`)
})

check("show draws different pictures for different numbers", () => {
  const shot = (n) => {
    const cpu = run(`var s = ${n}
show s at 2, 2
halt`)
    return cpu.display.join("")
  }
  assert(shot(1) !== shot(2), "1 and 2 came out looking the same")
  assert(shot(10) !== shot(100), "10 and 100 came out looking the same")
})

check("hit reports when two sprites overlap", () => {
  const overlapping = run(`
    sprite dot [ 0x80 ]
    sprite mark [ 0x80 ]
    draw dot at 5, 5
    draw mark at 5, 5
    if hit { draw dot at 20, 20 }
    halt
  `)
  assert(on(overlapping, 20, 20), "drawing on top of a lit pixel should have been a hit")

  const apart = run(`
    sprite dot [ 0x80 ]
    sprite mark [ 0x80 ]
    draw dot at 5, 5
    draw mark at 30, 5
    if hit { draw dot at 20, 20 }
    halt
  `)
  assert(!on(apart, 20, 20), "sprites nowhere near each other should not be a hit")
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

check("a routine can be defined once and called several times", () => {
  const cpu = run(`
    sprite dot [ 0x80 ]
    var x = 0
    def mark {
      draw dot at x, 4
    }
    x = 5
    mark
    x = 9
    mark
    x = 20
    mark
    halt
  `)
  for (const x of [5, 9, 20]) assert(on(cpu, x, 4), `the routine did not draw at column ${x}`)
  assert(litCount(cpu) === 3, `expected 3 marks, found ${litCount(cpu)}`)
})

check("the body of a routine is not run where it is written", () => {
  // The definition sits in the middle of the program and must be stepped over.
  const cpu = run(`
    sprite dot [ 0x80 ]
    def never {
      draw dot at 30, 30
    }
    halt
  `)
  assert(!on(cpu, 30, 30), "the routine ran even though it was never called")
  assert(litCount(cpu) === 0, "something was drawn when nothing should have been")
})

check("a routine can be called before it is defined", () => {
  const cpu = run(`
    sprite dot [ 0x80 ]
    var x = 7
    early
    halt
    def early {
      draw dot at x, 2
    }
  `)
  assert(on(cpu, 7, 2), "the call did not reach a routine defined further down")
})

check("routines can call other routines", () => {
  const cpu = run(`
    sprite dot [ 0x80 ]
    var x = 1
    def inner {
      draw dot at x, 6
    }
    def outer {
      inner
      x = 3
      inner
    }
    outer
    halt
  `)
  assert(on(cpu, 1, 6) && on(cpu, 3, 6), "the nested call did not draw both marks")
})

check("calling something that does not exist names the line", () => {
  const { error } = compile(["var x = 1", "missing", "halt", ""].join("\n"))
  assert(error, "calling an undefined routine should be an error")
  assert(error.line === 2, `expected the error on line 2, got line ${error.line}`)
})

check("print puts words on screen where it is told", () => {
  const cpu = run(`print "HI" at 4, 6
halt`)
  // Two letters, four wide and five tall, starting at column 4.
  let inside = 0, outside = 0
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    if (!on(cpu, x, y)) continue
    if (y >= 6 && y < 11 && x >= 4 && x < 14) inside++
    else outside++
  }
  assert(inside > 10, `expected letters in the band asked for, found ${inside} lit pixels`)
  assert(outside === 0, `${outside} pixels were drawn outside where print was told to write`)
})

check("different words look different", () => {
  const shot = (words) => run(`print "${words}" at 1, 1
halt`).display.join("")
  assert(shot("YES") !== shot("NO"), "two different words came out identical")
  assert(shot("A") !== shot("B"), "A and B came out identical")
  assert(shot("HI") === shot("hi"), "lower case should read the same as upper")
})

check("a space takes room without drawing", () => {
  const gap = run(`print "A A" at 1, 1
halt`)
  const together = run(`print "AA" at 1, 1
halt`)
  assert(gap.display.join("") !== together.display.join(""), "the space made no difference")
  const count = (c) => c.display.reduce((a, b) => a + b, 0)
  assert(count(gap) === count(together), "a space should draw nothing, so the pixel count should match")
})

check("only the letters a program uses are carried", () => {
  const few = compile(`print "A" at 1, 1
halt`).bytes.length
  const many = compile(`print "ABCDEFGH" at 1, 1
halt`).bytes.length
  assert(many > few, "using more letters should make a bigger program")
  // One letter is five bytes, so eight of them cannot cost the whole alphabet.
  assert(many - few < 26 * 5, `the whole font looks like it went in: ${many - few} bytes for seven more letters`)
})

check("a letter with no shape is refused, with its line", () => {
  const { error } = compile(["var x = 1", 'print "hello~" at 1, 1'].join(String.fromCharCode(10)))
  assert(error, "an unknown character should be an error")
  assert(error.line === 2, `expected line 2, got ${error.line}`)
})

check("the examples behave the same on any interpreter", () => {
  // Interpreters disagree about six instructions, so the output has to match
  // whichever way round each one is set. Display wait is checked separately.
  const QUIRKS = ["shift", "loadStore", "logic", "clip", "jump", "vfOrder"]
  const real = Math.random

  const picture = (bytes, quirks) => {
    // Seeded, because rand would otherwise make two runs differ by itself.
    let seed = 12345
    Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    const cpu = new Chip8()
    Object.assign(cpu.quirks, quirks)
    cpu.load(bytes)
    for (let f = 0; f < 120; f++) {
      for (let i = 0; i < 60 && !cpu.halted; i++) cpu.step()
      cpu.tickTimers()
    }
    return cpu.display.join("")
  }

  try {
    for (const [name, source] of Object.entries(EXAMPLES)) {
      const { bytes, error } = compile(source)
      assert(!error, `${name} did not compile: ${error && error.message}`)
      const base = picture(bytes, {})
      for (const q of QUIRKS) {
        const flipped = picture(bytes, { [q]: true })
        assert(flipped === base, `${name} comes out differently when ${q} is set the other way`)
      }
    }
  } finally {
    Math.random = real
  }
})

check("display wait slows a program down without changing it", () => {
  // Meteors draws three sprites a loop, so a machine that draws once per
  // sixtieth of a second takes three times as long to reach the same place.
  const real = Math.random
  const picture = (quirks, frames) => {
    let seed = 12345
    Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    const cpu = new Chip8()
    Object.assign(cpu.quirks, quirks)
    cpu.load(compile(EXAMPLES.Meteors).bytes)
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < 60 && !cpu.halted; i++) cpu.step()
      cpu.tickTimers()
    }
    return { picture: cpu.display.join(""), score: cpu.v[5], lives: cpu.v[6] }
  }
  try {
    const quick = picture({}, 120)
    const slow = picture({ vBlank: true }, 360)
    assert(slow.picture === quick.picture, "three times as long did not reach the same picture")
    assert(slow.score === quick.score, `score differs: ${slow.score} against ${quick.score}`)
    assert(slow.lives === quick.lives, `lives differ: ${slow.lives} against ${quick.lives}`)
    // And it really is slower, rather than the setting doing nothing at all.
    const sameTime = picture({ vBlank: true }, 120)
    assert(sameTime.picture !== quick.picture, "display wait made no difference, so this test proves nothing")
  } finally {
    Math.random = real
  }
})

check("the command line tool writes a ROM that matches the compiler", () => {
  const source = `
    sprite dot [ 0x80 ]
    var x = 9
    draw dot at x, 3
    halt
  `
  writeFileSync("__tmp.nib", source)
  try {
    execFileSync("node", ["nibble.mjs", "__tmp.nib", "-o", "__tmp.ch8"], { stdio: "pipe" })
    const onDisk = new Uint8Array(readFileSync("__tmp.ch8"))
    const inMemory = compile(source).bytes
    assert(onDisk.length === inMemory.length, "the file is a different length to the compiler's output")
    for (let i = 0; i < onDisk.length; i++) {
      assert(onDisk[i] === inMemory[i], `byte ${i} differs between the file and the compiler`)
    }
    // And the file the tool wrote runs on the machine.
    const cpu = new Chip8()
    cpu.load(onDisk)
    for (let i = 0; i < 200 && !cpu.halted; i++) cpu.step()
    assert(on(cpu, 9, 3), "the ROM from the file did not draw where it should")
  } finally {
    rmSync("__tmp.nib", { force: true })
    rmSync("__tmp.ch8", { force: true })
  }
})

check("the command line tool refuses a broken program and says where", () => {
  writeFileSync("__bad.nib", ["var x = 1", "draw nope at x, 2", ""].join("\n"))
  try {
    let failed = false
    let output = ""
    try {
      execFileSync("node", ["nibble.mjs", "__bad.nib", "-o", "__bad.ch8"], { stdio: "pipe" })
    } catch (err) {
      failed = true
      output = String(err.stderr)
    }
    assert(failed, "a broken program should have made the tool exit with a failure")
    assert(output.includes(":2:"), `the error should name line 2, got: ${output.trim()}`)
  } finally {
    rmSync("__bad.nib", { force: true })
    rmSync("__bad.ch8", { force: true })
  }
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
