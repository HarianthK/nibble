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

  "Snake": `# Snake. W A S D steer, eat the food, do not eat yourself.
# The body lives in two arrays used as a ring: the head goes in at one end
# and the tail comes off the other, so growing is just leaving the tail on.

sprite block [ 0xC0 0xC0 ]

const COLS = 32
const ROWS = 16
const RING = 64

array bx [ 64 of 0 ]
array by [ 64 of 0 ]

var hx = 10
var hy = 8
var dir = 3
var head = 0
var tail = 0
var fx = 20
var fy = 8
var px = 0
var py = 0
var over = 0
var ate = 0

# The grid is two pixels to a cell, so a cell is drawn at twice its number.
def drawHead {
  px = hx + hx
  py = hy + hy
  draw block at px, py
}

def drawTail {
  px = bx[tail]
  py = by[tail]
  px = px + px
  py = py + py
  draw block at px, py
}

def placeFood {
  rand fx, 0x1F
  rand fy, 0x0F
  px = fx + fx
  py = fy + fy
  draw block at px, py
}

loop {
  clear
  hx = 10
  hy = 8
  dir = 3
  head = 0
  tail = 0
  over = 0
  bx[0] = hx
  by[0] = hy
  drawHead
  placeFood

  while over == 0 {
    if key(W) { dir = 0 }
    else if key(A) { dir = 1 }
    else if key(S) { dir = 2 }
    else if key(D) { dir = 3 }

    if dir == 0 { hy -= 1 }
    else if dir == 1 { hx -= 1 }
    else if dir == 2 { hy += 1 }
    else { hx += 1 }
    if hx == 255 { hx = 31 }
    if hx == COLS { hx = 0 }
    if hy == 255 { hy = 15 }
    if hy == ROWS { hy = 0 }

    head += 1
    if head == RING { head = 0 }
    bx[head] = hx
    by[head] = hy

    ate = 0
    if hx == fx and hy == fy { ate = 1 }

    if ate == 1 {
      # The food is drawn where the head lands: one draw takes it off, the
      # next puts the head there. The tail stays, which is the growing.
      drawHead
      drawHead
      placeFood
      beep 2
    } else {
      drawHead
      if hit { over = 1 }
      drawTail
      tail += 1
      if tail == RING { tail = 0 }
    }
    wait
    wait
    wait
    wait
  }

  print "GAME OVER" at 14, 12
  print "E TO PLAY" at 14, 20
  while !key(E) { wait }
  while key(E) { wait }
}`,

  "Breakout": `# Breakout. A and D move the paddle. Clear all twenty four bricks.
# The bricks are an array of flags, one a brick. There is no divide, so the
# brick under the ball is found by taking eights off the ball's x until it
# runs out, and counting how many came off.

sprite brick [ 0xFE 0xFE 0xFE ]
sprite paddle [ 0xFC ]
sprite ball [ 0x80 ]

const LEFT = 0
const RIGHT = 63
const FLOOR = 31
const PADDLE_Y = 30
const NONE = 255

array bricks [ 24 of 1 ]

var px = 29
var bx = 32
var by = 20
var dx = 1
var dy = 0
var col = 0
var row = 0
var t = 0
var idx = 0
var left = 24
var lives = 3

# Draws the brick at col, row. Its x is eight times the column and its y four
# times the row, both done by doubling.
def drawBrick {
  t = col + col
  t = t + t
  t = t + t
  row = row + row
  row = row + row
  draw brick at t, row
}

def drawAllBricks {
  for idx = 0 to 23 {
    t = bricks[idx]
    if t == 1 {
      row = 0
      t = idx
      while t > 7 { t -= 8  row += 1 }
      col = t
      drawBrick
    }
  }
}

# Which brick is the ball on. Leaves idx at it, or at NONE.
def brickAt {
  idx = NONE
  if by < 12 {
    col = 0
    t = bx
    while t > 7 { t -= 8  col += 1 }
    row = 0
    t = by
    while t > 3 { t -= 4  row += 1 }
    idx = row + row
    idx = idx + idx
    idx = idx + idx
    idx = idx + col
  }
}

loop {
  clear
  for idx = 0 to 23 { bricks[idx] = 1 }
  left = 24
  lives = 3
  drawAllBricks
  px = 29
  bx = 32
  by = 20
  dx = 1
  dy = 0
  draw paddle at px, PADDLE_Y
  draw ball at bx, by

  while lives != 0 and left != 0 {
    draw paddle at px, PADDLE_Y
    if key(A) { px -= 1 }
    if key(D) { px += 1 }
    if px > 200 { px = 0 }
    if px > 58 { px = 58 }
    draw paddle at px, PADDLE_Y

    draw ball at bx, by
    if dx == 1 { bx += 1 } else { bx -= 1 }
    if dy == 1 { by += 1 } else { by -= 1 }
    if bx == LEFT { dx = 1 }
    if bx == RIGHT { dx = 0 }
    if by == 0 { dy = 1 }
    draw ball at bx, by

    if hit {
      brickAt
      t = 0
      if idx != NONE { t = bricks[idx] }
      if t == 1 {
        # A brick. Take it off the screen, the ball with it, and put the
        # ball back, so what is drawn stays honest.
        bricks[idx] = 0
        left -= 1
        draw ball at bx, by
        drawBrick
        draw ball at bx, by
        if dy == 1 { dy = 0 } else { dy = 1 }
        beep 1
      } else {
        # The paddle, so the ball goes back up.
        dy = 0
        beep 1
      }
    }

    if by == FLOOR {
      lives -= 1
      draw ball at bx, by
      bx = px + 3
      by = 20
      dy = 0
      draw ball at bx, by
      beep 4
    }
    wait
  }

  clear
  if left == 0 { print "YOU WIN" at 18, 8 } else { print "GAME OVER" at 14, 8 }
  print "E TO PLAY" at 14, 18
  while !key(E) { wait }
  while key(E) { wait }
}`,

  "Pong": `# Pong for two. W and S move the left paddle, R and F the right.
# First to nine wins, and E starts the next game.

sprite paddle [ 0x80 0x80 0x80 0x80 0x80 0x80 ]
sprite ball [ 0x80 ]

const LOWEST = 26
const TOP = 6
const BOTTOM = 31

var ly = 13
var ry = 13
var bx = 32
var by = 16
var dx = 1
var dy = 1
var ls = 0
var rs = 0

def serve {
  bx = 32
  by = 16
  rand dy, 0x01
}

loop {
  ls = 0
  rs = 0
  serve

  while ls != 9 {
    if rs == 9 { ls = 9 }

    clear
    show ls at 22, 0
    show rs at 34, 0

    if key(W) { ly -= 1 }
    if key(S) { ly += 1 }
    if key(R) { ry -= 1 }
    if key(F) { ry += 1 }
    if ly > 200 { ly = 0 }
    if ly > LOWEST { ly = LOWEST }
    if ry > 200 { ry = 0 }
    if ry > LOWEST { ry = LOWEST }

    if dx == 1 { bx += 1 } else { bx -= 1 }
    if dy == 1 { by += 1 } else { by -= 1 }
    # The score sits in the top rows, so the ball turns before it gets there.
    if by == TOP { dy = 1 }
    else if by == BOTTOM { dy = 0 }

    draw paddle at 2, ly
    draw paddle at 61, ry
    draw ball at bx, by
    if hit {
      if dx == 1 { dx = 0 } else { dx = 1 }
      beep 2
    }

    if bx == 0 { rs += 1  serve }
    else if bx == 63 { ls += 1  serve }
    wait
  }

  clear
  print "GAME OVER" at 14, 8
  print "E TO PLAY" at 14, 18
  while !key(E) { wait }
  while key(E) { wait }
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

  "Stars": `# Forty stars at random, then a fresh sky whenever you press X.
# A for loop runs its body once for each number, ends included.
sprite star [ 0x80 ]

var x = 0
var y = 0
var i = 0

loop {
  clear
  for i = 1 to 40 {
    rand x, 0x3F
    rand y, 0x1F
    draw star at x, y
  }
  while !key(X) { wait }
  while key(X) { wait }
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
