// Compiles a Nibble program to a .ch8 file that any CHIP-8 machine will run.
// Run: node nibble.mjs game.nib [-o game.ch8] [--octo]
import { readFileSync, writeFileSync } from "node:fs"
import { compile } from "./compile.js"
import { disassemble } from "./disassemble.js"

const args = process.argv.slice(2)
if (!args.length || args.includes("-h") || args.includes("--help")) {
  console.log(`nibble, a language that compiles to CHIP-8

  node nibble.mjs game.nib             writes game.ch8 beside it
  node nibble.mjs game.nib -o out.ch8  writes somewhere of your choosing
  node nibble.mjs game.nib --octo      also writes game.8o, the same program
                                       as Octo source, to carry on in Octo

The output is a plain ROM. Play it in any CHIP-8 interpreter, including the one
at https://harianthk.github.io/chip8 under "Load a program".`)
  process.exit(args.length ? 0 : 1)
}

const at = args.indexOf("-o")
if (at >= 0 && args[at + 1] === undefined) {
  console.error("-o needs a file name after it")
  process.exit(1)
}
// The program is the first word that is neither a flag nor the name after -o, wherever it sits.
const input = args.find((a, i) => !a.startsWith("-") && (at < 0 || i !== at + 1))
if (input === undefined) {
  console.error("which program? as in: node nibble.mjs game.nib")
  process.exit(1)
}
const output = at >= 0 ? args[at + 1] : input.replace(/\.nib$/, "") + ".ch8"
const write = (file, data) => {
  try {
    writeFileSync(file, data)
  } catch (err) {
    console.error(`cannot write ${file}: ${err.code ?? err.message}`)
    process.exit(1)
  }
}

let source
try {
  source = readFileSync(input, "utf8")
} catch {
  console.error(`cannot read ${input}`)
  process.exit(1)
}

const { bytes, error } = compile(source)
if (error) {
  // Show the offending line, because a number on its own is a poor apology.
  const line = source.split("\n")[error.line - 1] ?? ""
  console.error(`${input}:${error.line}: ${error.message}`)
  if (line.trim()) console.error(`  ${line.trim()}`)
  process.exit(1)
}

write(output, bytes)
console.log(`${output}  ${bytes.length} bytes`)
if (args.includes("--octo")) {
  const octo = output.replace(/\.ch8$/, "") + ".8o"
  write(octo, disassemble(bytes))
  console.log(`${octo}  Octo source`)
}
