import Splitting from 'splitting'
import 'splitting/dist/splitting.css'
import 'splitting/dist/splitting-cells.css'

const randomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

class Line {
  position = -1
  cells = []
  constructor(linePosition) { this.position = linePosition }
}

class Cell {
  DOM = { el: null }
  position = -1
  previousCellPosition = -1
  original
  state
  color
  originalColor
  cache

  constructor(DOM_el, { position, previousCellPosition } = {}) {
    this.DOM.el = DOM_el
    this.original = this.DOM.el.innerHTML
    this.state = this.original
    this.color = this.originalColor =
      getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#fff'
    this.position = position
    this.previousCellPosition = previousCellPosition
  }

  set(value) {
    this.state = value
    this.DOM.el.innerHTML = this.state
  }
}

export class TypeShuffle {
  DOM = { el: null }
  lines = []
  lettersAndSymbols = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','!','@','#','$','&','*','(',')','-','_','+','=','/','[',']','{','}',';',':','<','>',',','0','1','2','3','4','5','6','7','8','9']
  totalChars = 0
  isAnimating = false

  constructor(DOM_el) {
    this.DOM.el = DOM_el
    const results = Splitting({ target: this.DOM.el, by: 'lines' })
    results.forEach(s => Splitting({ target: s.words }))

    for (const [linePosition, lineArr] of results[0].lines.entries()) {
      const line = new Line(linePosition)
      let cells = []
      let charCount = 0
      for (const word of lineArr) {
        for (const char of [...word.querySelectorAll('.char')]) {
          cells.push(new Cell(char, {
            position: charCount,
            previousCellPosition: charCount === 0 ? -1 : charCount - 1,
          }))
          ++charCount
        }
      }
      line.cells = cells
      this.lines.push(line)
      this.totalChars += charCount
    }

    this.effects = {
      fx1: () => this.fx1(), fx2: () => this.fx2(), fx3: () => this.fx3(),
      fx4: () => this.fx4(), fx5: () => this.fx5(), fx6: () => this.fx6(),
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  _lockWidths() {
    for (const line of this.lines) {
      for (const cell of line.cells) {
        const el = cell.DOM.el
        const w  = el.getBoundingClientRect().width
        el.style.display   = 'inline-block'
        el.style.width     = w + 'px'
        el.style.textAlign = 'center'
      }
    }
  }

  // Set random char + palette color, keep hidden — fx5 reveals each char after coloring
  _preScramble() {
    const palette = ['#3e775d', '#61dca3', '#61b3dc']
    for (const line of this.lines) {
      for (const cell of line.cells) {
        cell.color = palette[Math.floor(Math.random() * palette.length)]
        cell.DOM.el.style.color = cell.color
        cell.set(this.getRandomChar())
        cell.DOM.el.style.opacity = '0'
      }
    }
  }

  clearCells() {
    for (const line of this.lines)
      for (const cell of line.cells) cell.set('&nbsp;')
  }

  getRandomChar() {
    return this.lettersAndSymbols[Math.floor(Math.random() * this.lettersAndSymbols.length)]
  }

  // ── Effects ───────────────────────────────────────────────────────────────────

  fx1() {
    const MAX = 45
    let finished = 0
    const lineFinished = this.lines.map(() => 0)
    this.clearCells()
    const loop = (line, cell, iteration = 0) => {
      cell.cache = cell.state
      if (iteration === MAX - 1) {
        cell.set(cell.original)
        lineFinished[line.position]++
        if (lineFinished[line.position] === line.cells.length) this._onLineComplete?.(line.position)
        if (++finished === this.totalChars) { this.isAnimating = false; this._onComplete?.() }
      } else if (cell.position === 0) {
        cell.set(iteration < 9 ? ['*', '-', "'", '"'][Math.floor(Math.random() * 4)] : this.getRandomChar())
      } else {
        cell.set(line.cells[cell.previousCellPosition].cache)
      }
      if (cell.cache !== '&nbsp;') ++iteration
      if (iteration < MAX) setTimeout(() => loop(line, cell, iteration), 15)
    }
    for (const line of this.lines) {
      setTimeout(() => this._onLineStart?.(line.position), (line.position + 1) * 200)
      for (const cell of line.cells)
        setTimeout(() => loop(line, cell), (line.position + 1) * 200)
    }
  }

  fx2() {
    const MAX = 20
    let finished = 0
    const lineFinished = this.lines.map(() => 0)
    const loop = (line, cell, iteration = 0) => {
      if (iteration === MAX - 1) {
        cell.set(cell.original)
        cell.DOM.el.style.opacity = 0
        setTimeout(() => { cell.DOM.el.style.opacity = 1 }, 300)
        lineFinished[line.position]++
        if (lineFinished[line.position] === line.cells.length) this._onLineComplete?.(line.position)
        if (++finished === this.totalChars) { this.isAnimating = false; this._onComplete?.() }
      } else cell.set(this.getRandomChar())
      ++iteration
      if (iteration < MAX) setTimeout(() => loop(line, cell, iteration), 40)
    }
    for (const line of this.lines) {
      const lineDelay = (line.cells[0]?.position + 1) * 30 || 0
      setTimeout(() => this._onLineStart?.(line.position), lineDelay)
      for (const cell of line.cells)
        setTimeout(() => loop(line, cell), (cell.position + 1) * 30)
    }
  }

  fx3() {
    const MAX = 10
    let finished = 0
    const lineFinished = this.lines.map(() => 0)
    const loop = (line, cell, iteration = 0) => {
      if (iteration === MAX - 1) {
        cell.set(cell.original)
        lineFinished[line.position]++
        if (lineFinished[line.position] === line.cells.length) this._onLineComplete?.(line.position)
        if (++finished === this.totalChars) { this.isAnimating = false; this._onComplete?.() }
      } else cell.set(this.getRandomChar())
      ++iteration
      if (iteration < MAX) setTimeout(() => loop(line, cell, iteration), 45)
    }
    for (const line of this.lines) {
      setTimeout(() => this._onLineStart?.(line.position), 0)
      for (const cell of line.cells)
        setTimeout(() => loop(line, cell), randomNumber(0, 600))
    }
  }

  fx4() {
    const MAX = 30
    let finished = 0
    const lineFinished = this.lines.map(() => 0)
    this.clearCells()
    const loop = (line, cell, iteration = 0) => {
      cell.cache = cell.state
      if (iteration === MAX - 1) {
        cell.set(cell.original)
        lineFinished[line.position]++
        if (lineFinished[line.position] === line.cells.length) this._onLineComplete?.(line.position)
        if (++finished === this.totalChars) { this.isAnimating = false; this._onComplete?.() }
      } else if (cell.position === 0) {
        cell.set(['*', ':'][Math.floor(Math.random() * 2)])
      } else {
        cell.set(line.cells[cell.previousCellPosition].cache)
      }
      if (cell.cache !== '&nbsp;') ++iteration
      if (iteration < MAX) setTimeout(() => loop(line, cell, iteration), 15)
    }
    for (const line of this.lines) {
      const d = Math.abs(this.lines.length / 2 - line.position) * 400
      setTimeout(() => this._onLineStart?.(line.position), d)
      for (const cell of line.cells)
        setTimeout(() => loop(line, cell), d)
    }
  }

  fx5() {
    const MAX = 22
    let finished = 0
    const palette = ['#3e775d', '#61dca3', '#61b3dc']
    const lineFinished = this.lines.map(() => 0)

    const loop = (line, cell, iteration = 0) => {
      cell.cache = { state: cell.state, color: cell.color }
      if (iteration === MAX - 1) {
        cell.color = cell.originalColor
        cell.DOM.el.style.color = cell.color
        cell.set(cell.original)
        lineFinished[line.position]++
        if (lineFinished[line.position] === line.cells.length) this._onLineComplete?.(line.position)
        if (++finished === this.totalChars) { this.isAnimating = false; this._onComplete?.() }
      } else if (cell.position === 0) {
        cell.color = palette[Math.floor(Math.random() * palette.length)]
        cell.DOM.el.style.color = cell.color
        cell.set(iteration < 9
          ? ['*', '-', "'", '"'][Math.floor(Math.random() * 4)]
          : this.getRandomChar())
      } else {
        cell.set(line.cells[cell.previousCellPosition].cache.state)
        cell.color = line.cells[cell.previousCellPosition].cache.color
        cell.DOM.el.style.color = cell.color
      }
      cell.DOM.el.style.opacity = '1'
      if (cell.cache.state !== '&nbsp;') ++iteration
      if (iteration < MAX) setTimeout(() => loop(line, cell, iteration), 32)
    }

    for (const line of this.lines) {
      setTimeout(() => this._onLineStart?.(line.position), line.position * 260)
      for (const cell of line.cells)
        setTimeout(() => loop(line, cell), line.position * 260 + cell.position * 28)
    }
  }

  fx6() {
    const MAX = 15

    let finished = 0
    const lineFinished = this.lines.map(() => 0)
    const palette = ['#2b4539', '#61dca3', '#61b3dc']
    const loop = (line, cell, iteration = 0) => {
      cell.cache = { state: cell.state, color: cell.color }
      if (iteration === MAX - 1) {
        cell.set(cell.original)
        cell.color = cell.originalColor
        cell.DOM.el.style.color = cell.color
        lineFinished[line.position]++
        if (lineFinished[line.position] === line.cells.length) this._onLineComplete?.(line.position)
        if (++finished === this.totalChars) { this.isAnimating = false; this._onComplete?.() }
      } else {
        cell.set(this.getRandomChar())
        cell.color = palette[Math.floor(Math.random() * palette.length)]
        cell.DOM.el.style.color = cell.color
      }
      ++iteration
      if (iteration < MAX) setTimeout(() => loop(line, cell, iteration), randomNumber(30, 110))
    }
    for (const line of this.lines) {
      setTimeout(() => this._onLineStart?.(line.position), (line.position + 1) * 80)
      for (const cell of line.cells)
        setTimeout(() => loop(line, cell), (line.position + 1) * 80)
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  trigger(effect = 'fx1', { onComplete, onLineStart, onLineComplete } = {}) {
    if (!(effect in this.effects) || this.isAnimating) return
    this._onComplete    = onComplete
    this._onLineStart   = onLineStart
    this._onLineComplete = onLineComplete
    this.isAnimating = true
    this.effects[effect]()
  }
}
