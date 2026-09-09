# Notes on Nibble

How the compiler works, what it decides and why, and the bugs worth remembering.
The README covers writing and running programs.

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

