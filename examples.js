// The programs offered in the playground. Each one compiles and runs as it is.
export const EXAMPLES = {
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

  "Catch the falling block": `# A and D to move. Catch it before it lands.
sprite paddle [ 0xF0 ]
sprite block  [ 0xC0 0xC0 ]

var px = 28
var bx = 20
var by = 0
var score = 0

loop {
  clear
  if key(A) { px -= 1 }
  if key(D) { px += 1 }

  by += 1
  if by == 30 {
    by = 0
    rand bx, 0x3F
    beep 4
  }

  draw paddle at px, 31
  draw block at bx, by
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
