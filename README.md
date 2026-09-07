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

**Conditions** cover equality, size, keys, and whether two sprites just
touched.

```
if x == 5 { ... } else { ... }
if x != y { ... }
if x < 10 { ... }
if x > y { ... }
if key(A) { ... }
if !key(D) { ... }
if hit { ... }
```

`hit` is true when the sprite you just drew turned off a pixel that was already
lit, which is the only collision test the machine has. Check it straight after
a `draw`.

**Loops** run forever or until a condition fails.

```
loop { ... }
while x != 10 { ... }
```

**Routines** let you name a piece of code and use it more than once. Call one by
writing its name on a line of its own. A routine can be called before it appears
in the file, and it can call other routines.

```
def newBlock {
  by = 6
  rand bx, 0x3F
}

newBlock
```

There are no parameters and no local variables. Routines work on the same
thirteen variables everything else does, because those are the machine's
registers and there is nowhere else to put anything.

**Numbers on screen.** `show score at 1, 0` writes a variable out as up to
three digits, using the font built into the machine. That is how a game gets a
score.

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

## Compiling to a file

The browser is not the only way in. The command line tool writes a plain `.ch8`
ROM, which any CHIP-8 interpreter will run.

```bash
node nibble.mjs games/catch.nib
# games/catch.ch8  153 bytes
```

The example programs are in `games/` as `.nib` source, with their compiled ROMs
beside them. `meteors.nib` is the fullest of them: a dodging game with a score,
three lives and a game over screen, in 251 bytes. It uses most of the language,
including routines to start a fresh rock and to end the game. Drop one into
[the emulator](https://harianthk.github.io/chip8) under "Load a program" and it
plays, with no mention of Nibble anywhere in the file. A test compiles the same
program both ways and compares the output byte for byte, so the tool and the
playground cannot drift apart.

Mistakes name the file, the line, and the line's text:

```
games/broken.nib:2: no sprite called nope
  draw nope at x, 2
```

## Deploying

```bash
node scripts/deploy.mjs
```

Two things make this worth having over `vercel deploy --prod`. The Vercel CLI
answers "Not authorized" on a first call often enough to be normal, and the same
call straight after goes through, so the script retries once before giving up.
More importantly it then fetches every file back from the live site and compares
it against the copy on disk, because a deploy that reports success while the
site still serves the previous version is the failure that actually costs you
time. It only says the deploy worked once the site proves it.

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

## Running the same everywhere

Interpreters disagree about six instructions, and a program leaning on one of
them behaves differently depending on where you run it. Saying the output "runs
on any interpreter" is only worth saying if it has been checked, so a test
compiles every example and runs it under each setting both ways round, comparing
the screens.

That test found two real faults, both in the games rather than the compiler.
Both scattered a two pixel wide sprite with `rand` up to column 63, so it
straddled the right edge and either wrapped or was cut off. And the catch game
let its block reach the bottom row, where wrapping put it back on top of the
score and counted as a catch. Neither would have shown up here, because this
emulator wraps; they would have appeared for somebody else.

Display wait is the exception and is checked separately. It made the oldest
machines draw once per sixtieth of a second, so Meteors, which draws three
sprites a loop, takes three times as long to reach the same place. The test
checks exactly that: the same picture, the same score and the same lives after
three times as many frames.

## Decisions worth knowing

**Thirteen variables, not sixteen.** The machine has sixteen registers. `VF` is
where it reports carries and collisions, so it cannot hold anything of yours,
and two more are kept as scratch for instructions that demand their operands in
registers. That leaves thirteen.

**Subtracting a constant is adding its complement.** There is no "subtract a
number" instruction, only "add a number", so `x -= 3` compiles to `x += 253`.
Eight bit registers wrap, so the answer is the same.

**Less-than is built, not borrowed.** CHIP-8 has no compare instruction beyond
equality. So `a < b` subtracts one from the other and reads the flag the machine
sets when there was nothing to borrow, which is left at zero exactly when the
first number was the smaller. `a > b` is the same subtraction the other way
round. Equal counts as neither, which the tests check at the boundary.

**Showing a number borrows three registers and gives them back.** The
instruction that splits a number into digits writes them into memory, and the
only way to read them out again lands them in the first three registers. Those
belong to the program, so they are copied into spare memory first and put back
afterwards. A test sets three variables, shows a number, and checks all three
survived.

**Timers are counted against the clock, not against frames.** `wait` and the
sound both run off the machine's sixty times a second timer. Ticking that once
per animation frame is right only on a sixty hertz screen: on a 120Hz monitor
every program would run at double speed. The elapsed milliseconds are
accumulated instead, so a second of real time is sixty ticks whatever the screen
is doing.

**A definition sits in the middle of the program and has to be stepped over.**
The machine starts at the top and runs forwards, so a routine written halfway
down would otherwise be executed on the way past. Each definition is preceded by
a jump over its own body, patched once the body has been compiled and its length
is known.

**Errors carry a line number** and name what was expected. A compiler that says
only "syntax error" is a compiler you argue with.

## A bug worth recording

The lexer originally had no rule for a bare `!`, only for `!=`. So `!key(D)`
quietly lost its `!` and compiled to `key(D)`, the exact opposite of what was
written, with no error anywhere. The test that caught it holds one key down,
leaves another up, and checks which branches ran. A parser test would have
passed, because the parser was perfectly happy.

The same gap was waiting for `<` and `>`, which the lexer also had no rule for,
only `<=` and `>=`. Knowing the shape of the bug is what made it a two second
fix the second time rather than an afternoon.

## Built with

Nothing. It is five files of JavaScript, served as they are. The emulator is
copied in from my [CHIP-8 project](https://github.com/HarianthK/chip8), which
runs every program in the community archive.
