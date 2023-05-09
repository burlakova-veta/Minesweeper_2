var MineSweeper;

jQuery(function ($) {
  'use strict';

  let levels = {
    beginner: {
      boardSize: [9, 9],
      numMines: 10,
    },
    intermediate: {
      boardSize: [16, 16],
      numMines: 40,
    },
    expert: {
      boardSize: [30, 16],
      numMines: 99,
    },
  };

  let STATE_UNKNOWN = 'unknown',
    STATE_OPEN = 'open',
    STATE_NUMBER = 'number',
    STATE_FLAGGED = 'flagged',
    STATE_EXPLODE = 'explode';
  let LEFT_MOUSE_BUTTON = 1,
    RIGHT_MOUSE_BUTTON = 3;
  let MAX_X = 30,
    MAX_Y = 30;

  MineSweeper = function () {
    let msObj = this;
    this.options = {};
    this.grid = [];
    this.running = true;
    this.minesDealt = false;
    this.defaults = {
      selector: '#minesweeper',
      boardSize: levels.beginner.boardSize,
      numMines: levels.beginner.numMines,
      pathToCellToucher: 'media/js/clicked.js',
    };

    this.init = function (options) {
      msObj.options = $.extend({}, msObj.defaults, options || {});
      var msUI = $(msObj.options.selector);
      if (!msUI.length) {
        throw 'MineSweeper element not found';
      }
      if (!window.JSON) {
        throw 'This application requires a JSON parser.';
      }
      if ($('.ajax-loading').length < 1) {
        msUI.before('<div class="invisible ajax-loading"></div>');
      }
      msObj.initWorkers(msObj.options.pathToCellToucher);
      msObj.clearBoard();
      msObj.redrawBoard();
      msObj.resetDisplays();
      msObj.initHandlers(msUI);
      return msObj;
    };

    this.callWorker = function (taskType, payload) {
      $('.ajax-loading').removeClass('invisible');
      let job = {
        type: taskType,
        grid: msObj.grid,
      };
      if (typeof payload === 'number') {
        job.mines = payload;
      } else if (typeof payload === 'object') {
        job.x = payload.x;
        job.y = payload.y;
      }
      msObj.worker.postMessage(JSON.stringify(job));
    };

    this.initWorkers = function (wPath) {
      if (window.Worker) {
        msObj.worker = new Worker(wPath);
        msObj.worker.onmessage = function (e) {
          let data = JSON.parse(e.data);
          msObj.handleWorkerMessage(data);
        };
      }
    };

    this.initHandlers = function (msUI) {
      msUI.on('contextmenu', '.cell', function (ev) {
        ev.preventDefault();
      });

      msUI.on('mousemove', function (ev) {
        let button = ev.button || 0;
        let buttons = ev.buttons || 0;
        if (button === 0 && buttons === 0) {
          msObj.RIGHT_MOUSE_DOWN = false;
          msObj.LEFT_MOUSE_DOWN = false;
        }
      });

      msUI.on('mousedown', '.cell', function (ev) {
        let targ = $(ev.target);
        if (
          (ev.which === LEFT_MOUSE_BUTTON && msObj.RIGHT_MOUSE_DOWN) ||
          (ev.which === RIGHT_MOUSE_BUTTON && msObj.LEFT_MOUSE_DOWN)
        ) {
          let x = targ.attr('data-x') - 1;
          let ud = targ.parent().prev();
          let i;

          for (i = x; i < x + 3; i++) {
            ud.children('.unknown.[data-x=' + i + ']').addClass('test');
          }
          targ.prev('.unknown').addClass('test');
          targ.next('.unknown').addClass('test');
          ud = targ.parent().next();
          for (i = x; i < x + 3; i++) {
            ud.children('.unknown.[data-x=' + i + ']').addClass('test');
          }
        }
      });

      msUI.on('mouseup', '.cell', function (ev) {
        let targ = $(ev.target);
        if (ev.which === LEFT_MOUSE_BUTTON) {
          if (ev.shiftKey || ev.ctrlKey) {
            msObj.MODIFIER_KEY_DOWN = true;
            msObj.handleRightClick(targ);
          } else {
            msObj.handleLeftClick(targ);
          }
        } else if (ev.which === RIGHT_MOUSE_BUTTON) {
          msObj.handleRightClick(targ);
        }
      });

      $('.new-game').on('click', function (ev) {
        ev.preventDefault();
        msObj.running = true;
        msObj.paused = false;
        msObj.setBoardOptions();
        msObj.clearBoard();
        msObj.redrawBoard();
        msObj.resetDisplays();
      });

      $('#level').on('change', function () {
        let input = $('.game_settings input');
        if ($('#level option:selected').val() === 'custom') {
          input.prop('disabled', false);
        } else {
          input.prop('disabled', true);
        }
        $('.new-game').trigger('click');
      });
    };

    this.handleRightClick = function (cell) {
      if (!(cell instanceof jQuery)) {
        throw 'Parameter must be jQuery instance';
      }
      if (!msObj.running) {
        return;
      }
      let obj = msObj.getCellObj(cell);

      if (obj.state === STATE_NUMBER) {
        if (msObj.LEFT_MOUSE_DOWN || msObj.MODIFIER_KEY_DOWN) {
          msObj.callWorker('get_adjacent', obj);
        }
        return;
      }

      if (obj.state === STATE_NUMBER) {
        return;
      }
      if (obj.state === STATE_QUESTION) {
        obj.state = STATE_UNKNOWN;
      } else {
        let flagDisplay = $('#mine_flag_display'),
          curr = parseInt(flagDisplay.val(), 10);
        if (obj.state === STATE_UNKNOWN) {
          obj.state = STATE_FLAGGED;
          flagDisplay.val(curr - 1);
        } else if (obj.state === STATE_FLAGGED) {
          obj.state = STATE_QUESTION;
          flagDisplay.val(curr + 1);
        }
      }
      msObj.drawCell(cell);
    };

    this.handleLeftClick = function (cell) {
      if (!(cell instanceof jQuery)) {
        throw 'Parameter must be jQuery instance';
      }
      if (!msObj.running) {
        return;
      }
      if (!msObj.minesDealt) {
        let x = parseInt(cell.attr('data-x'), 10);
        let y = parseInt(cell.attr('data-y'), 10);
        msObj.assignMines(x, y);
      }

      let obj = msObj.getCellObj(cell);
      if (obj.state === STATE_OPEN || obj.state === STATE_FLAGGED) {
        return;
      }
      if (obj.state === STATE_NUMBER) {
        if (msObj.RIGHT_MOUSE_DOWN) {
          msObj.callWorker('get_adjacent', obj);
        }
        return;
      }

      if (obj.mine) {
        msObj.gameOver(cell);
        return;
      }

      if (msObj.worker) {
        msObj.callWorker('touch_adjacent', obj);
      } else {
        if (!window.touchAdjacent) {
          throw 'Could not load ' + msObj.options.pathToCellToucher;
        }
        msObj.grid = window.touchAdjacent(obj, msObj.grid);
        msObj.redrawBoard();
      }
    };

    this.pauseGame = function () {
      msObj.board.addClass('paused');
      $('.msPause').html('Resume');
      msObj.paused = true;
    };

    this.resumeGame = function () {
      msObj.board.removeClass('paused');
      msObj.paused = false;
    };

    this.handleWorkerMessage = function (data) {
      if (data.type === 'touch_adjacent' || data.type === 'get_adjacent') {
        msObj.grid = data.grid;
        msObj.redrawBoard();
      } else if (data.type === 'calc_win') {
        if (data.win) {
          msObj.winGame();
        }
      } else if (data.type === 'explode') {
        let cell = msObj.getJqueryObject(data.cell.x, data.cell.y);
        msObj.gameOver(cell);
      } else if (data.type === 'log') {
        if (console && console.log) {
          console.log(data.obj);
        }
      }
      $('.ajax-loading').addClass('invisible');
    };

    this.getCellObj = function (domObj) {
      let gridobj, x, y;
      try {
        x = parseInt(domObj.attr('data-x'), 10);
        y = parseInt(domObj.attr('data-y'), 10);
        gridobj = msObj.grid[y][x];
      } catch (e) {
        console.warn('Could not find memory representation for:');
        console.log(domObj);
        throw 'Stopped.';
      }
      return gridobj;
    };

    this.getJqueryObject = function (x, y) {
      return msObj.board.find('.cell[data-coord="' + [x, y].join(',') + '"]');
    };

    this.getRandomMineArray = function (safeX, safeY) {
      let width = msObj.options.boardSize[0],
        height = msObj.options.boardSize[1],
        totalMines = msObj.options.numMines,
        array = [],
        x,
        max,
        infiniteLoop = 0;

      for (x = 0, max = width * height; x < max; x++) {
        if (x < totalMines) {
          array[x] = 1;
        } else {
          array[x] = 0;
        }
      }

      function fisherYates(myArray) {
        let i = myArray.length,
          j,
          tempi,
          tempj;
        if (i === 0) {
          return;
        }
        while (--i) {
          j = Math.floor(Math.random() * (i + 1));
          tempi = myArray[i];
          tempj = myArray[j];
          myArray[i] = tempj;
          myArray[j] = tempi;
        }
      }

      let safeIndex = safeX + safeY * width;
      do {
        fisherYates(array);
        infiniteLoop += 1;
        if (infiniteLoop > 999) {
          console.warn(
            'Giving up trying to prevent initial space from blowing up'
          );
          break;
        }
      } while (array[safeIndex] === 1);
      return array;
    };

    this.setBoardOptions = function () {
      let level = $('#level').val();

      if (level === 'custom') {
        let dimX = parseInt($('#dim_x').val(), 10);
        let dimY = parseInt($('#dim_y').val(), 10);
        let numMines = parseInt($('#numMines').val(), 10);

        if (isNaN(dimX) || dimX === 0) {
          dimX = 1;
        } else if (dimX > MAX_X) {
          dimX = MAX_X;
        }
        if (isNaN(dimY) || dimY === 0) {
          dimY = 1;
        } else if (dimY > MAX_Y) {
          dimY = MAX_Y;
        }
        if (isNaN(numMines) || numMines === 0) {
          numMines = 1;
        } else if (numMines >= dimX * dimY) {
          numMines = dimX * dimY - 1;
        }
        $('#dim_x').val(dimX);
        $('#dim_y').val(dimY);
        $('#num_mines').val(numMines);

        msObj.options.boardSize = [dimX, dimY];
        msObj.options.numMines = numMines;
      } else {
        msObj.options.boardSize = levels[level].boardSize;
        msObj.options.numMines = levels[level].numMines;
      }
    };

    this.resetDisplays = function () {
      let level = $('#level option:selected').val();
      let numMines;

      if (level === 'custom') {
        numMines = $('#numMines').val();
      } else {
        numMines = levels[level].numMines;
      }

      $('#mine_flag_display').val(numMines);
      $('.msPause').hide();
    };

    this.assignMines = function (safeX, safeY) {
      if (msObj.minesDealt) {
        return;
      }
      let width = msObj.options.boardSize[0],
        height = msObj.options.boardSize[1],
        mineHat = msObj.getRandomMineArray(safeX, safeY),
        x,
        y,
        z = 0;

      for (y = 0; y < height; y++) {
        for (x = 0; x < width; x++) {
          msObj.grid[y][x].mine = mineHat[z++];
        }
      }

      msObj.minesDealt = true;
    };

    this.clearBoard = function () {
      let width = msObj.options.boardSize[0],
        height = msObj.options.boardSize[1],
        x,
        y;

      msObj.minesDealt = false;
      msObj.grid = [];
      for (y = 0; y < height; y++) {
        msObj.grid[y] = [];
        for (x = 0; x < width; x++) {
          msObj.grid[y][x] = {
            state: STATE_UNKNOWN,
            number: 0,
            mine: 0,
            x: x,
            y: y,
          };
        }
      }

      if (!msObj.board) {
        $(msObj.options.selector)
          .html('')
          .append(msObj.getTemplate('settings'))
          .append(msObj.getTemplate('actions'))
          .append('<div class="board-wrap"></div>');
        msObj.board = $('.board-wrap');
        msObj.board
          .attr('unselectable', 'on')
          .css('UserSelect', 'none')
          .css('MozUserSelect', 'none');
      } else {
        msObj.board.html('');
      }
      for (y = 0; y < height; y++) {
        var row = $('<ul class="row" data-index=' + y + '></ul>');
        for (x = 0; x < width; x++) {
          var cell;
          row.append(
            '<li class="cell" data-coord="' +
            [x, y].join(',') + '" data-x=' + x +
            ' data-y=' + y + '>x</li>'
          );
          cell = row.find('.cell:last');
          msObj.drawCell(cell);
        }
        msObj.board.append(row);
      }
    };

    this.redrawBoard = function () {
      msObj.board.find('li.cell').each(function (ind, cell) {
        msObj.drawCell($(cell));
      });

      if (msObj.worker) {
        msObj.callWorker('calc_win', msObj.options.numMines);
      } else {
        if (!window.touchAdjacent) {
          throw 'Could not load ' + msObj.options.pathToCellToucher;
        }

        let win = window.minesweeperCalculateWin(msObj.grid);
        if (win) {
          msObj.winGame();
        }
      }
    };

    this.drawCell = function (x, y) {
      let cell = null,
        gridobj;
      if (x instanceof jQuery) {
        cell = x;
        x = parseInt(cell.attr('data-x'), 10);
        y = parseInt(cell.attr('data-y'), 10);
      } else if (typeof x === 'number' && typeof y === 'number') {
        cell = msObj.getJqueryObject(x, y);
      }

      cell.removeClass().addClass('cell');

      try {
        gridobj = msObj.grid[y][x];
      } catch (e) {
        console.warn('Invalid grid coord: x,y = ' + [x, y].join(','));
        return;
      }
      cell.html('');
      cell.attr('data-number', '');
      switch (gridobj.state) {
        case STATE_FLAGGED:
          cell.addClass(gridobj.state);
          break;
        case STATE_UNKNOWN:
        case STATE_OPEN:
        case STATE_EXPLODE:
          cell.addClass(gridobj.state);
          break;
        case STATE_NUMBER:
          cell.addClass('number');
          cell.html(gridobj.number);
          cell.attr('data-number', gridobj.number);
          break;
        default:
          throw 'Invalid gridobj state: ' + gridobj.state;
      }
    };

    this.gameOver = function (cellParam) {
      $('.msPause').hide();

      let width = msObj.options.boardSize[0],
        height = msObj.options.boardSize[1],
        x,
        y;

      if (cellParam) {
        cellParam.removeClass();
        cellParam.addClass('cell ' + STATE_EXPLODE);
      }
      for (y = 0; y < height; y++) {
        for (x = 0; x < width; x++) {
          var obj = msObj.grid[y][x],
            cell = msObj.getJqueryObject(x, y);
          if (obj.mine) {
            cell
          } else {
            cell.addClass('unblown');
          }
        }
      }
      msObj.running = false;
    };

    this.winGame = function () {
      msObj.running = false;
      alert('You win!');
    };

    this.getTemplate = function (template) {
      let templates = {
        settings:
          '<div class="game_settings"><select id="level" class="msLevel"><option value="beginner">Beginner</option>' +
          '<option value="intermediate">Intermediate</option><option value="expert">Expert</option>' +
          '<option value="custom">Custom</option></select>' +
          '<input type="text" id="dim_x" class="msDimX" placeholder="x" size="5" disabled value="20" />' +
          '<input type="text" id="dim_y" class="msDimY" placeholder="y" size="5" disabled value="20" />' +
          '<label>  Mines:</label>' +
          '<input type="text" id="mine_flag_display" class="msMineFlagDisplay" size="6" value="10" disabled />' +
          '</div>',
        actions:
          '<div class="game_actions"><button class="new-game">New Game</button>',
      };

      return templates[template];
    };
  };
});