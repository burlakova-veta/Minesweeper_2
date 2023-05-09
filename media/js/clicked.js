if (!this.onmessage) {
    this.onmessage = {};
}
function getAdjacentSquares(obj, grid) {
    'use strict';
    var cell,
        x = parseInt(obj.x, 10),
        y = parseInt(obj.y, 10),
        mY = grid.length - 1,
        mX = grid[0].length - 1;

    var results = [];
    var i;
    var j;

    for (i = Math.max(0, y - 1); i <= Math.min(mY, y + 1); i++) {
        for (j = Math.max(0, x - 1); j <= Math.min(mX, x + 1); j++) {
            if (i !== y || j !== x) {
                cell = grid[i][j];
                if (cell) {
                    results.push(cell);
                }
            }
        }
    }

    return results;
}

function touchAdjacent(cell, grid) {
    'use strict';
    var stack = [];
    stack.push(cell);
    while (stack.length > 0) {
        var squares,
            numMines = 0,
            curCell = stack.pop(),
            i,
            sq;
        squares = getAdjacentSquares(curCell, grid);
        for (i = 0; i < squares.length; i++) {
            sq = squares[i];
            if (sq.mine) {
                numMines += 1;
            }
        }
        curCell.number = numMines;
        if (numMines > 0) {
            curCell.state = 'number';
        } else {
            curCell.state = 'open';
            for (i = 0; i < squares.length; i++) {
                sq = squares[i];
                if (sq.state !== 'open' && sq.state !== 'number') {
                    stack.push(sq);
                }
            }
        }
    }
}

function minesweeperCalculateWin(grid, mines) {
    'use strict';
    var closedCells = 0,
        cell;
    for (var y = 0; y < grid.length; y++) {
        for (var x = 0; x < grid[0].length; x++) {
            cell = grid[y][x];
            if (!(cell.state === 'open' || cell.state === 'number')) {
                closedCells += 1;
            }
        }
    }
    return mines === closedCells;
}

if (this.document === undefined) {
    this.onmessage = function (p) {
        'use strict';
        var data = JSON.parse(p.data),
            grid = data.grid,
            resp = {};
        resp.type = data.type;
        if (data.type === 'calc_win') {
            resp.win = minesweeperCalculateWin(grid, data.mines);
        } else {
            var cell = grid[data.y][data.x];
            if (data.type === 'touch_adjacent') {
                touchAdjacent(cell, grid);
            } else if (data.type === 'get_adjacent') {
                var squares = getAdjacentSquares(cell, grid);
                var nrFlag = 0;
                var i;
                var sq;
                for (i = 0; i < squares.length; i++) {
                    sq = squares[i];
                    if (sq.state === 'flagged') {
                        nrFlag++;
                    }
                }
                if (nrFlag === parseInt(cell.number, 10)) {
                    for (i = 0; i < squares.length; i++) {
                        sq = squares[i];
                        if (sq.mine) {
                            if (sq.state !== 'flagged') {
                                resp.type = 'explode';
                                resp.cell = sq;
                                break;
                            }
                        } else {
                            touchAdjacent(sq, grid);
                        }
                    }
                }
            }
            resp.grid = grid;
        }
        postMessage(JSON.stringify(resp));
    };
}