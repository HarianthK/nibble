# Nibble

A small language that compiles to CHIP-8 machine code, with the machine to run
it on.

Live at **[nibble-lang.vercel.app](https://nibble-lang.vercel.app)**. Write a
program on the left, press compile, and play it on the right. The bytes shown
under the screen are the real output, and they would run on any CHIP-8
interpreter.

```
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
}
```

That compiles to 61 bytes.

## Why

I had already built [a CHIP-8 emulator](https://github.com/HarianthK/chip8) and
checked it against a published instruction suite. Having a machine you trust is
what makes writing a compiler for it worth doing: when a program misbehaves, the
machine is not the suspect, so the fault is yours to find.

It also makes the tests unusually honest. They compile a program, run it on the
emulator, and look at which pixels came on. Nothing checks the parser in
isolation, so a test can only pass if the whole path works.

## The language

**Variables** live in the machine's registers, so there are thirteen of them.

```
var x = 30
x = 12
x += 1
x -= 4
x = y + 3
```

**Sprites** are rows of bytes, one bit per pixel, at most fifteen rows.

```
sprite ball [ 0x60 0xF0 0xF0 0x60 ]
draw ball at x, y
draw ball at 20, 9
```

Drawing flips pixels rather than painting them, which is how the machine works.
Drawing the same sprite twice in the same place rubs it out again, and that is
how you move something: draw, erase, draw somewhere else.

**Conditions** are equality and keys. There is no `<` or `>`, because the
machine has no instruction for it and faking one quietly would be worse than
leaving it out.

```
if x == 5 { ... } else { ... }
if x != y { ... }
if key(A) { ... }
if !key(D) { ... }
```

**Loops** run forever or until a condition fails.

```
loop { ... }
while x != 10 { ... }
```

**The rest.** `clear` wipes the screen. `wait` holds until the next sixtieth of
a second, which is how you get a steady frame rate. `rand name, 0x3F` puts a
random number in a variable. `beep 4` makes a noise. `halt` stops.

The sixteen keys are the CHIP-8 keypad, written as they sit on a keyboard:
`1 2 3 4`, `Q W E R`, `A S D F`, `Z X C V`.

## Running it

No build step and no dependencies.

```bash
python -m http.server 3120
node test.mjs
```

Then open <http://localhost:3120>.

## How it works

Three passes, all in `compile.js`.

The **lexer** turns the text into tokens, keeping the line number on each one so
mistakes can be reported where they happened. The two character operators are
matched before the single ones, or `!=` would come out as `!` followed by `=`.

The **parser** reads statements directly into machine code rather than building
a tree first, because the language has no expressions deep enough to need one.

**Jumps are patched afterwards.** When an `if` is compiled, the place it needs to
jump to is not known yet, so a blank jump is written down and its position
remembered. Once the body has been compiled and the address is known, the blank
is filled in. Same for `while`, `else`, and for sprite addresses, which are only
settled once every instruction has been counted and the sprites are laid out
after the code.

## Decisions worth knowing

**Thirteen variables, not sixteen.** The machine has sixteen registers. `VF` is
where it reports carries and collisions, so it cannot hold anything of yours,
and two more are kept as scratch for instructions that demand their operands in
registers. That leaves thirteen.

**Subtracting a constant is adding its complement.** There is no "subtract a
number" instruction, only "add a number", so `x -= 3` compiles to `x += 253`.
Eight bit registers wrap, so the answer is the same.

**No less-than.** CHIP-8 compares for equality and nothing else. A `<` could be
built from subtraction and the carry flag, but it would cost several
instructions and behave oddly at the edges, so it is absent rather than
half-right.

**Errors carry a line number** and name what was expected. A compiler that says
only "syntax error" is a compiler you argue with.

## A bug worth recording

The lexer originally had no rule for a bare `!`, only for `!=`. So `!key(D)`
quietly lost its `!` and compiled to `key(D)`, the exact opposite of what was
written, with no error anywhere. The test that caught it holds one key down,
leaves another up, and checks which branches ran. A parser test would have
passed, because the parser was perfectly happy.

## Built with

Nothing. It is four files of JavaScript, served as they are. The emulator is
copied in from my [CHIP-8 project](https://github.com/HarianthK/chip8), which
runs every program in the community archive.
