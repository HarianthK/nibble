// Turns a program back into Octo source, telling code from data by walking
// every path the machine could take from the start. See DOCS.md.
const START = 0x200

const hex = (n, w = 2) => "0x" + n.toString(16).toUpperCase().padStart(w, "0")
const reg = (n) => "v" + n.toString(16)

// One entry per opcode family: the Octo text for it, and where the machine
// goes next. A missing entry means the word is not an instruction.
function decode(mem, pc) {
  const op = (mem[pc] << 8) | mem[pc + 1]
  const nnn = op & 0xfff, nn = op & 0xff, n = op & 0xf
  const x = (op >> 8) & 0xf, y = (op >> 4) & 0xf
  const next = pc + 2
  const plain = (text) => ({ text, size: 2, to: [next] })
  const skip = (text) => {
    // A skip over a four byte instruction skips all four.
    const over = ((mem[next] << 8) | mem[next + 1]) === 0xf000 ? next + 4 : next + 2
    return { text, size: 2, to: [next, over] }
  }
  switch (op >> 12) {
    case 0x0:
      if (op === 0x00e0) return plain("clear")
      if (op === 0x00ee) return { text: "return", size: 2, to: [], ends: true }
      if (op === 0x00fb) return plain("scroll-right")
      if (op === 0x00fc) return plain("scroll-left")
      if (op === 0x00fd) return { text: "exit", size: 2, to: [], ends: true }
      if (op === 0x00fe) return plain("lores")
      if (op === 0x00ff) return plain("hires")
      if ((op & 0xfff0) === 0x00c0) return plain(`scroll-down ${n}`)
      if ((op & 0xfff0) === 0x00d0) return plain(`scroll-up ${n}`)
      // A call into 1977 machine code. Every interpreter today steps over
      // it, and programs that patch their own code rely on that. Two in a
      // row is a table of small numbers, not code.
      return { text: null, size: 2, to: (mem[next] >> 4) === 0 ? [] : [next] }
    case 0x1: return { text: `jump ${hex(nnn, 3)}`, size: 2, to: nnn === pc ? [] : [nnn], label: nnn, ends: true }
    case 0x2: return { text: `:call ${hex(nnn, 3)}`, size: 2, to: [nnn, next], label: nnn }
    case 0x3: return skip(`if ${reg(x)} != ${hex(nn)} then`)
    case 0x4: return skip(`if ${reg(x)} == ${hex(nn)} then`)
    case 0x5:
      if (n === 0) return skip(`if ${reg(x)} != ${reg(y)} then`)
      if (n === 2) return plain(`save ${reg(x)} - ${reg(y)}`)
      if (n === 3) return plain(`load ${reg(x)} - ${reg(y)}`)
      return null
    case 0x6: return plain(`${reg(x)} := ${hex(nn)}`)
    case 0x7: return plain(`${reg(x)} += ${hex(nn)}`)
    case 0x8: {
      const ops = { 0: ":=", 1: "|=", 2: "&=", 3: "^=", 4: "+=", 5: "-=", 6: ">>=", 7: "=-", 0xe: "<<=" }
      return n in ops ? plain(`${reg(x)} ${ops[n]} ${reg(y)}`) : null
    }
    case 0x9: return n === 0 ? skip(`if ${reg(x)} == ${reg(y)} then`) : null
    case 0xa: return { ...plain(`i := ${hex(nnn, 3)}`), data: nnn }
    // Where jump0 lands depends on v0. The usual shape is a table of jumps,
    // so those are followed for as long as the words there are jumps.
    case 0xb: {
      const to = [nnn]
      for (let a = nnn + 2; a + 1 < mem.length && (mem[a] >> 4) === 1; a += 2) to.push(a)
      return { text: `jump0 ${hex(nnn, 3)}`, size: 2, to, blind: true, label: nnn }
    }
    case 0xc: return plain(`${reg(x)} := random ${hex(nn)}`)
    case 0xd: return plain(`sprite ${reg(x)} ${reg(y)} ${n}`)
    case 0xe:
      if (nn === 0x9e) return skip(`if ${reg(x)} -key then`)
      if (nn === 0xa1) return skip(`if ${reg(x)} key then`)
      return null
    case 0xf:
      if (op === 0xf000) {
        const addr = (mem[pc + 2] << 8) | mem[pc + 3]
        return { text: `i := long ${hex(addr, 4)}`, size: 4, to: [pc + 4], data: addr }
      }
      if (nn === 0x01) return plain(`plane ${x}`)
      if (op === 0xf002) return plain("audio")
      switch (nn) {
        case 0x07: return plain(`${reg(x)} := delay`)
        case 0x0a: return plain(`${reg(x)} := key`)
        case 0x15: return plain(`delay := ${reg(x)}`)
        case 0x18: return plain(`buzzer := ${reg(x)}`)
        case 0x1e: return plain(`i += ${reg(x)}`)
        case 0x29: return plain(`i := hex ${reg(x)}`)
        case 0x30: return plain(`i := bighex ${reg(x)}`)
        case 0x33: return plain(`bcd ${reg(x)}`)
        case 0x3a: return plain(`pitch := ${reg(x)}`)
        case 0x55: return plain(`save ${reg(x)}`)
        case 0x65: return plain(`load ${reg(x)}`)
        case 0x75: return plain(`saveflags ${reg(x)}`)
        case 0x85: return plain(`loadflags ${reg(x)}`)
      }
      return null
  }
}

export function analyse(rom) {
  const mem = new Uint8Array(0x10000)
  mem.set(rom, START)
  const end = START + rom.length
  const code = new Map() // address -> decoded instruction
  const labels = new Set([START])
  const dataLabels = new Set()
  let blind = false
  // A jump0 table is often a row of same-sized blocks each ending in a
  // return or a jump, so on those paths the word after an ending is tried
  // as the next entry. That stays within the table because the walk stops
  // at the first word that is not an instruction.
  const table = new Set()
  const todo = [START]
  while (todo.length) {
    const pc = todo.pop()
    if (pc < START || pc + 1 >= end || code.has(pc)) continue
    const d = decode(mem, pc)
    if (!d) continue
    code.set(pc, d)
    if (d.label !== undefined) labels.add(d.label)
    if (d.data !== undefined) dataLabels.add(d.data)
    if (d.blind) { blind = true; for (const t of d.to) table.add(t) }
    if (table.has(pc)) {
      for (const t of d.to) table.add(t)
      if (d.ends && !dataLabels.has(pc + d.size)) { table.add(pc + d.size); todo.push(pc + d.size) }
    }
    todo.push(...d.to)
  }
  return { mem, end, code, labels, dataLabels, blind }
}

export function disassemble(rom) {
  const { mem, end, code, labels, dataLabels, blind } = analyse(rom)
  const lines = []
  if (blind) lines.push("# This program uses jump0, so some code may be listed as bytes.")
  let pc = START
  let run = []
  const flush = () => { if (run.length) { lines.push("  " + run.map((b) => hex(b)).join(" ")); run = [] } }
  while (pc < end) {
    if (labels.has(pc) || dataLabels.has(pc)) {
      flush()
      lines.push(`: ${pc === START ? "main" : (labels.has(pc) ? "L_" : "D_") + pc.toString(16).toUpperCase()}`)
    }
    const d = code.get(pc)
    // Two instructions can overlap when a jump lands inside one. The bytes
    // are kept as they are and the machine sorts it out.
    const overlaps = d && [...Array(d.size - 1).keys()].some((k) => code.has(pc + 1 + k))
    if (d && d.text && !overlaps && pc + d.size <= end) {
      flush()
      lines.push("  " + d.text)
      pc += d.size
    } else {
      run.push(mem[pc])
      if (run.length === 8) flush()
      pc++
    }
  }
  flush()
  return lines.join("\n") + "\n"
}
