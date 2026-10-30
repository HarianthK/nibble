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

## `break`, and waiting for a key

Two things the games kept wanting and the language could not say.

`break` compiles to a jump with nowhere to go yet. Each loop that opens
pushes an empty list; every `break` inside it adds its jump's slot to the
top list; when the loop closes, all of them are patched to the address just
past it, together with the loop's own exit. Nesting falls out of the stack:
a `break` in a `for` inside a `loop` leaves the `for`, because the `for`'s
list is the one on top. Outside any loop it is refused at compile time,
since a jump to nowhere would be the worst kind of bug to find at run time.

`k = key` is the machine's `FX0A`, and it is the only way a program can
wait without knowing which key is coming. On the original hardware, and on
this emulator, that instruction completes when the key is released, not
when it goes down, so the test for it presses a key, runs, releases it, and
only then expects the program to have moved on. A version that stored a
number and carried on failed that test, which is how the test was checked.

## A bug worth recording

The lexer originally had no rule for a bare `!`, only for `!=`. So `!key(D)`
quietly lost its `!` and compiled to `key(D)`, the exact opposite of what was
written, with no error anywhere. The test that caught it holds one key down,
leaves another up, and checks which branches ran. A parser test would have
passed, because the parser was perfectly happy.

The same gap was waiting for `<` and `>`, which the lexer also had no rule for,
only `<=` and `>=`. Knowing the shape of the bug is what made it a two second
fix the second time rather than an afternoon.


## Bits, and the subtraction that always gave 0

`&`, `|` and `^` map straight onto the machine's 8XY1, 8XY2 and 8XY3, which only
work between two registers. A number on the right is loaded into a scratch
register first, so `x &= 63` costs two instructions and `x &= mask` one.

Shifts were the interesting part. Interpreters disagree about 8XY6 and 8XYE:
the original COSMAC VIP shifts VY and puts the result in VX, while later ones
shift VX and ignore VY. Nibble writes every shift with X and Y the same
register, and then both readings are the same instruction. A shift of n places
is n instructions, since the machine only ever moves one place; more than 7
would empty the byte, so it is refused. The check runs every case with the shift
quirk set both ways.

Adding the second-term form, `x = y & 15`, turned up a bug that had been there
since the first version. An assignment with two terms copied the first term
into the variable and then applied the second, so `x = y - x` copied y over x
and then computed x - x: always 0. `x = y + x` gave y + y. Now when the second
term is the variable itself, it is done in place: addition and the bitwise
operators do not care about order, and subtraction uses 8XY7, the machine's
reversed subtract, which computes VY - VX directly.

## Multiplying on a machine that cannot

CHIP-8 has add, subtract and one-place shifts, and nothing else for arithmetic.
`x *= n` is built from those the way it is done by hand in binary: read n's bits
from the top, and for each one after the first, double x, then if the bit is
set, add the original x back. x * 5 is 101 in binary, so it is x, doubled, doubled
again, plus x: ((x * 2) * 2) + x. The original x is kept in a scratch register
for the adding, and only when some bit after the first is set, so a power of two
is pure shifts. Times 0 is a load of 0 and times 1 is nothing at all.

The doubling is a shift of x by itself, as for `<<=`, so it gives the same answer
whichever way an interpreter reads the shift. The check compiles every n from 0
to 255 against six values of x and runs each under both shift quirks: 3,072 runs,
each compared with x * n mod 256. A variable on the right was refused at
first, since multiplying by one means a loop; the section on variables below is
how it works now.

## Dividing by taking away

There is no divide either, and Breakout already did it by hand: to find which
brick the ball is under, it subtracted the brick width until it could not. `x /= n`
and `x %= n` now do that themselves. n goes in one scratch register and a count
in the other; each pass subtracts n from x, and the borrow flag says whether x
went below zero. When it does, the last subtraction is added back, leaving the
remainder in x, and for `/=` the count is copied in. Each pass is four
instructions run, so the slowest case, 255 divided by 3, is 85 passes and about
350 instructions; dividing by 1 never loops, since 1 is a power of two.

A power of two skips the loop: dividing is shifting right, by x itself as for
`>>=` so both readings of the shift agree, and the remainder is x and n - 1. The
check compiles every n from 1 to 255 against six values of x for both operators
and runs each under both shift quirks, 6,120 runs, comparing with JavaScript's
own division. Leaving the last subtraction in, leaving the loop on the wrong
flag, and an off-by-one mask each make it fail.

## Multiplying and dividing by a variable

`x *= y` cannot be unrolled at compile time, since nobody knows y yet. The
loop does the same thing from the other end: copy x and y into the two scratch
registers, set x to 0, then halve the copy of y each round. The bit that falls
out lands in the flag; when it is 1, the copy of x is added in. Then that copy
doubles. When the copy of y reaches 0 the loop ends, so it runs once per bit of
y, eight times at most. Both copies are taken before x is cleared, which is why
`x *= x` squares rather than giving 0.

Dividing by a variable is long division in binary, the way it is done on paper.
One scratch register is the remainder so far and the other counts eight rounds.
Each round doubles the remainder, shifts x left, and adds the bit that fell off
x into the remainder: the flag is the bit, and adding the flag register is the
whole move. Then y comes off the remainder. If that did not borrow, the
quotient bit is 1, and it goes into the low bit of x, which the shift has just
emptied, so x turns from the number being divided into the answer one bit at a
time. If it borrowed, y goes back on. The first version had a separate path for
a y of 128 or more, out of fear that doubling the remainder would overflow.
Breaking that path changed nothing, and the reason is that the remainder before
a round holds at most the bits of x read so far, so it is under 128 until the
last round. The path was deleted.

Every pair of x and y is checked, all 65,536 of them for each of the three
operators, under both readings of the shift and with the flag written last as
some interpreters do: 393,216 runs against JavaScript's own arithmetic. The
slowest takes 87 instructions, where dividing by a number takes up to 350.
Dividing by 0 cannot be refused when the 0 is in a variable, so it does what
the long division does with nothing to take away: the quotient is 255 and the
remainder is x. `x /= x` and `x %= x` are compiled as 1 (255 for 0) and 0.
Eleven breakages, and every one fails the check.
