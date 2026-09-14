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

## Arrays, and why a cell costs what it does

The machine moves bytes between memory and registers only through `FX55` and
`FX65`, and those always start at `v0`. So reading `body[i]` into `x` means:
park `v0` in the working memory, point `i` at the array, add the index
register to `i`, load one byte into `v0`, copy it to `x`, and put `v0` back.
Six instructions, or three when `x` is `v0` itself, which the compiler
notices. Writing is the mirror image, with one care taken: the cell's address
is worked out before `v0` is overwritten with the value, because the index
might be `v0`. A test uses `v0` as the index for both a read and a write and
checks it comes back untouched.

A constant index is cheaper, since the address is settled at compile time and
patched in like a sprite's. It is also checked against the array's length, so
`a[4]` on a four cell array is refused rather than reading the next thing in
memory.

Snake is the reason arrays exist. Its body is two arrays of sixty four cells
used as a ring: the head goes in at one end, the tail comes off the other, and
growing is simply leaving the tail on for a step.

## Why `for` ends on a number

`for x = a to b` tests for the end by comparing the counter with `b + 1`, one
instruction, because the machine can compare a register with a number in a
single skip. Comparing with another register instead would need the end kept
one higher in a scratch register or an extra subtraction every pass, and the
program that needs a variable end can write it as a `while`. The counter is
left at `b + 1` when the loop is done, which is what the test checks.

## Making the output smaller

The machine has no conditional jump, only a conditional skip of one
instruction. So `if` used to compile to a skip that is taken when the
condition holds, followed by a jump over the body: two words of overhead. But
every skip comes in a pair. `3XNN` skips when equal and `4XNN` when not, `5XY0`
and `9XY0` likewise, `EX9E` and `EXA1` for keys, and the flag tests are `3F00`
and `4F00`. When the body is a single word, the compiler flips the skip and
puts the body where the jump was. Overhead becomes one word.

It only does this for an `if` with no `else`, because with an `else` the body
has to be followed by a jump past the alternative, and a skip would land on
that jump. And it never treats a jump as a body, since `halt` is a jump to
itself and would carry the wrong address after moving. A call as the body is
fine, and the compiler moves the slot it will patch later along with it.

`wait` is the other place bytes went. It is five words inline: set the delay
timer, then spin reading it until it reaches zero. A program that waits twice
or more now gets one copy of that at the end of its code, with a call in each
place. A call is one word and the copy is six, so it pays for itself at two
uses and is left inline at one. The compiler counts the `wait` tokens before it
starts, which is simpler than deciding at the end and moving code about.

`print` was the biggest sink of all. Each letter was three words inline: point
`I` at the glyph, draw it, step along. Six bytes a letter, and Meteors says
twenty three letters. Now a program with enough text gets one drawing routine
and a table of one byte per character, each byte the glyph's offset from the
start of the glyph block, with `0xFF` to end a string. Spaces become a blank
glyph rather than a special case, five bytes once instead of two words of
routine. The routine walks the table in `V1` and reads each byte into `V0`,
which belong to the program, so they are parked in the same six bytes of
working memory that `show` uses and put back after. That parking is most of
the sixteen byte cost per print, and the routine is twenty two once, so the
compiler adds both up against the inline cost before it starts and takes the
smaller. A program that prints one short word stays inline. Meteors drops
thirty seven bytes.

`show` went the same way as `wait` later on, with one more thing folded in.
It used to draw three digits always, so a score of seven read 007. It now
skips the zeros in front, which costs five words, and a program that shows a
number in two places gets one shared copy of the whole thing, which pays for
those five words and more: Meteors went from 447 to 435 bytes while its score
became readable. A program with a single show keeps it inline and pays the
five words, so Catch went from 157 to 167. The display wait test had to
change with it, since it had assumed a fixed number of draws per loop; it
now compares the two runs after the same number of loops instead.

The proof is not the unit test but a recording. Before the change, every
example and game was compiled, run for six hundred frames under three key
scripts with the random generator seeded, and every frame's screen hashed.
After the change the hashes had to match exactly, and they do, while the
programs got 174 bytes smaller between them. Breaking either half of the flip
on purpose makes the recording disagree, which is what makes it worth trusting.

One thing that recording taught: it has to give each frame more instructions
than the longest loop body, or it measures speed rather than behaviour. A
smaller program gets further in thirty steps, and the two games with the
longest loops showed as changed until every program was paced by its `wait`.

## A bug worth recording

The lexer originally had no rule for a bare `!`, only for `!=`. So `!key(D)`
quietly lost its `!` and compiled to `key(D)`, the exact opposite of what was
written, with no error anywhere. The test that caught it holds one key down,
leaves another up, and checks which branches ran. A parser test would have
passed, because the parser was perfectly happy.

The same gap was waiting for `<` and `>`, which the lexer also had no rule for,
only `<=` and `>=`. Knowing the shape of the bug is what made it a two second
fix the second time rather than an afternoon.

