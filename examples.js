// The programs offered in the playground. Each one compiles and runs as it is.
export const EXAMPLES = {
  "Meteors": `# Meteors. A and D to move, dodge the falling rocks.
# Three lives, then it tells you the score and E plays again.

sprite ship [ 0x60 0xF0 0x90 ]
sprite rock [ 0xC0 0xC0 ]

var px = 30
var ax = 10
var ay = 0
var bx = 40
var by = 14
var score = 0
var lives = 3

def dropA {
  ay = 0
  rand ax, 0x3F
  if ax > 61 { ax = 61 }
  score += 1
}

def dropB {
  by = 0
  rand bx, 0x3F
  if bx > 61 { bx = 61 }
  score += 1
}

loop {
  px = 30
  ax = 10
  ay = 0
  bx = 40
  by = 14
  score = 0
  lives = 3

  while lives != 0 {
    clear

    if key(A) { px -= 1 }
    if key(D) { px += 1 }
    if px > 60 { px = 60 }
    if px < 1  { px = 1 }

    ay += 1
    by += 1
    if ay > 29 { dropA }
    if by > 29 { dropB }

    # The rocks go down first and the ship last, so one check of hit asks
    # only whether the ship ran into something.
    draw rock at ax, ay
    draw rock at bx, by
    draw ship at px, 28

    if hit {
      lives -= 1
      beep 6
      dropA
      dropB
    }

    show score at 1, 0
    wait
  }

  clear
  print "GAME OVER" at 10, 6
  print "SCORE" at 10, 14
  show score at 40, 14
  print "E TO PLAY" at 10, 22
  while !key(E) { wait }
}`,

  "Move a ship": `# Arrow around the screen with W A S D.
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
}`,

  "Bounce a ball": `# No input. The ball turns around at the edges.
sprite ball [ 0x60 0xF0 0xF0 0x60 ]

var x = 10
var y = 8
var dx = 1
var dy = 1

loop {
  clear
  draw ball at x, y

  if x == 59 { dx = 0 }
  if x == 0  { dx = 1 }
  if y == 27 { dy = 0 }
  if y == 0  { dy = 1 }

  if dx == 1 { x += 1 } else { x -= 1 }
  if dy == 1 { y += 1 } else { y -= 1 }
  wait
}`,

  "Catch the falling block": `# A and D to move. The score is at the top.
# newBlock is a routine, so the two lines that start a
# fresh block are written once and called twice.
sprite paddle [ 0xF8 ]
sprite block  [ 0xC0 0xC0 ]

var px = 28
var bx = 20
var by = 6
var score = 0

def newBlock {
  by = 6
  rand bx, 0x3F
  if bx > 61 { bx = 61 }
}

loop {
  clear
  show score at 1, 0

  if key(A) { px -= 1 }
  if key(D) { px += 1 }
  if px > 58 { px = 58 }
  if px < 1  { px = 1 }

  by += 1
  # Send the block back up before it reaches the bottom row, or it would
  # wrap round onto the score and count as a catch.
  if by > 29 { newBlock }

  draw paddle at px, 30
  draw block at bx, by
  if hit {
    score += 1
    beep 3
    newBlock
  }
  wait
}`,

  "Draw with the keys": `# W A S D draws a trail, X wipes it.
# It only draws where it moves, because drawing the same
# spot twice would rub the pixel out again.
sprite pen [ 0x80 ]

var x = 32
var y = 16

loop {
  if key(A) { x -= 1  draw pen at x, y }
  if key(D) { x += 1  draw pen at x, y }
  if key(W) { y -= 1  draw pen at x, y }
  if key(S) { y += 1  draw pen at x, y }
  if key(X) { clear }
  wait
}`,
}
