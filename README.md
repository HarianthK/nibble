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

**Words on screen.** `print "GAME OVER" at 10, 6` writes text, four pixels wide
and five tall per letter. Letters, digits and a little punctuation are all
there, and only the characters a program actually uses are carried in the
output, so a program saying one word does not pay for the whole alphabet.

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
three lives, and an ending that says GAME OVER and offers another go, in 504
bytes. It uses most of the language, including routines to start a fresh rock. Drop one into
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

## Built with

Nothing. It is five files of JavaScript, served as they are. The emulator is
copied in from my [CHIP-8 project](https://github.com/HarianthK/chip8), which
runs every program in the community archive.

## Notes

How the compiler works, and the decisions behind it, are in [DOCS.md](DOCS.md).
