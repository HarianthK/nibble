import { compile } from "./compile.js"
import { EXAMPLES } from "./examples.js"
import { Chip8, WIDTH } from "./chip8.js"

const KEYMAP = {
  Digit1: 0x1, Digit2: 0x2, Digit3: 0x3, Digit4: 0xc,
  KeyQ: 0x4, KeyW: 0x5, KeyE: 0x6, KeyR: 0xd,
  KeyA: 0x7, KeyS: 0x8, KeyD: 0x9, KeyF: 0xe,
  KeyZ: 0xa, KeyX: 0x0, KeyC: 0xb, KeyV: 0xf,
}

const cpu = new Chip8()
const canvas = document.getElementById("screen")
const ctx = canvas.getContext("2d")
const source = document.getElementById("source")
const statusEl = document.getElementById("status")
const bytesEl = document.getElementById("bytes")
const examples = document.getElementById("examples")
const pad = document.getElementById("pad")

let running = false
// Fast enough for a whole game loop to finish inside one animation frame,
// or the screen gets painted after the clear but before the drawing.
const SPEED = 6000

function paint() {
  const across = cpu.width
  const down = cpu.height
  const w = canvas.width / across
  const h = canvas.height / down
  ctx.fillStyle = "#05080b"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = "#e08a3c"
  for (let y = 0; y < down; y++) {
    for (let x = 0; x < across; x++) {
      if (cpu.display[y * WIDTH + x]) ctx.fillRect(x * w, y * h, w, h)
    }
  }
}

// Releases wait for a frame the machine has actually run, or a quick tap would
// go down and come back up without the program ever seeing it.
let frames = 0
const pressedOn = new Map()
const releasing = new Set()

function press(key) {
  releasing.delete(key)
  pressedOn.set(key, frames)
  cpu.keyDown(key)
}

function release(key) {
  releasing.add(key)
}

function settleKeys() {
  for (const key of [...releasing]) {
    if (frames > (pressedOn.get(key) ?? 0)) {
      cpu.keyUp(key)
      releasing.delete(key)
    }
  }
  frames++
}

let last = performance.now()
let owed = 0
// Counted against the clock rather than animation frames, so a 120Hz screen
// does not run every timer at double speed.
let ticksOwed = 0

function frame(now) {
  if (!running) return
  const elapsed = Math.min(now - last, 100)
  last = now
  owed += (elapsed / 1000) * SPEED

  const started = performance.now()
  let ran = 0
  while (owed >= 1 && !cpu.halted) {
    cpu.step()
    owed--
    if ((++ran & 0x3ff) === 0 && performance.now() - started > 8) { owed = 0; break }
  }

  settleKeys()
  ticksOwed += elapsed / (1000 / 60)
  for (let t = 0; t < 4 && ticksOwed >= 1; t++) { cpu.tickTimers(); ticksOwed-- }
  if (ticksOwed > 4) ticksOwed = 0
  if (cpu.drawn) { paint(); cpu.drawn = false }
  if (cpu.halted) {
    running = false
    statusEl.innerHTML = statusEl.innerHTML.replace("running", "finished")
    return
  }
  requestAnimationFrame(frame)
}

function showBytes(bytes) {
  const hex = []
  for (let i = 0; i < bytes.length; i += 2) {
    const a = bytes[i].toString(16).padStart(2, "0")
    const b = (bytes[i + 1] ?? 0).toString(16).padStart(2, "0")
    hex.push(`${a}${b}`)
  }
  bytesEl.innerHTML = `<b>${bytes.length} bytes</b>  ` + hex.join(" ")
}

function showUsedKeys() {
  for (const cell of pad.querySelectorAll("td[data-code]")) {
    cell.classList.toggle("used", cpu.used[KEYMAP[cell.dataset.code]] === 1)
  }
}

function go() {
  const { bytes, error } = compile(source.value)
  if (error) {
    running = false
    statusEl.className = "bad"
    statusEl.textContent = `Line ${error.line}: ${error.message}`
    bytesEl.textContent = ""
    return
  }
  statusEl.className = ""
  statusEl.innerHTML = `Compiled to <b>${bytes.length} bytes</b> and running.`
  showBytes(bytes)
  cpu.load(bytes)
  paint()
  // A short run with every key pressed reveals which ones the program watches.
  const probe = new Chip8()
  probe.load(bytes)
  for (let f = 0; f < 60; f++) { for (let i = 0; i < 40 && !probe.halted; i++) probe.step(); probe.tickTimers() }
  for (let k = 0; k < 16; k++) {
    probe.keyDown(k)
    for (let f = 0; f < 4; f++) { for (let i = 0; i < 40 && !probe.halted; i++) probe.step(); probe.tickTimers() }
    probe.keyUp(k)
  }
  cpu.used.set(probe.used)
  showUsedKeys()

  if (!running) {
    running = true
    last = performance.now()
    requestAnimationFrame(frame)
  }
}

document.getElementById("run").addEventListener("click", go)
document.getElementById("stop").addEventListener("click", () => {
  running = false
  statusEl.textContent = "Stopped."
})

for (const name of Object.keys(EXAMPLES)) {
  const option = document.createElement("option")
  option.value = name
  option.textContent = name
  examples.append(option)
}
examples.addEventListener("change", () => {
  source.value = EXAMPLES[examples.value]
  go()
})

addEventListener("keydown", (e) => {
  const key = KEYMAP[e.code]
  if (key === undefined || e.target === source) return
  e.preventDefault()
  press(key)
})
addEventListener("keyup", (e) => {
  const key = KEYMAP[e.code]
  if (key !== undefined && e.target !== source) release(key)
})

for (const cell of pad.querySelectorAll("td[data-code]")) {
  const key = KEYMAP[cell.dataset.code]
  const onPointer = (on) => (e) => {
    e.preventDefault()
    if (on) cell.setPointerCapture?.(e.pointerId)
    cell.classList.toggle("down", on)
    on ? press(key) : release(key)
  }
  cell.addEventListener("pointerdown", onPointer(true))
  cell.addEventListener("pointerup", onPointer(false))
  cell.addEventListener("pointercancel", onPointer(false))
}

source.value = EXAMPLES[Object.keys(EXAMPLES)[0]]
examples.value = Object.keys(EXAMPLES)[0]
paint()
go()
