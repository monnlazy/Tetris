/**
 * TETRIS CLASSIC REMASTERED - PURE VANILLA JS ENGINE
 * Designed with modern Tetris guidelines (7-Bag, Hold, Ghost Piece, B2B, Combo, Audio)
 */

// ==========================================
// 1. GLOBAL CONSTANTS & GAME CONFIG
// ==========================================
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30; // 30px per block unit

// Matrix representations for 7 standard Tetrominoes
const SHAPES = {
    I: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    O: [
        [1, 1],
        [1, 1]
    ],
    T: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    S: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
    ],
    Z: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
    ],
    J: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    L: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
    ]
};

const COLORS = {
    I: '#00f0f0',
    O: '#f0f000',
    T: '#a000f0',
    S: '#00f000',
    Z: '#f00000',
    J: '#0000f0',
    L: '#f0a000'
};

// ==========================================
// 2. AUDIO SYNTHESIS ENGINE (Fallback Asset-less)
// ==========================================
class SoundManager {
    constructor() {
        this.ctx = null;
        this.musicEnabled = true;
        this.sfxEnabled = true;
        this.musicVolume = 0.7;
        this.sfxVolume = 0.8;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
    }

    playTone(freq, type, duration) {
        if (!this.sfxEnabled) return;
        this.init();
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch(e){}
    }

    playMove() { this.playTone(300, 'square', 0.05); }
    playRotate() { this.playTone(450, 'triangle', 0.08); }
    playDrop() { this.playTone(150, 'sawtooth', 0.1); }
    playClear() { this.playTone(600, 'sine', 0.2); }
    playLevelUp() { this.playTone(800, 'sine', 0.4); }
    playGameOver() { this.playTone(100, 'sawtooth', 0.6); }
}

const audio = new SoundManager();

// ==========================================
// 3. STORAGE & STATE MANAGEMENT
// ==========================================
class StorageManager {
    static get() {
        return {
            highScore: parseInt(localStorage.getItem('tetris_highscore') || '0'),
            maxLevel: parseInt(localStorage.getItem('tetris_maxlevel') || '1'),
            totalLines: parseInt(localStorage.getItem('tetris_lines') || '0'),
            bestCombo: parseInt(localStorage.getItem('tetris_bestcombo') || '0'),
            tetrisCount: parseInt(localStorage.getItem('tetris_tetriscount') || '0'),
            music: localStorage.getItem('tetris_music') !== 'false',
            sfx: localStorage.getItem('tetris_sfx') !== 'false'
        };
    }

    static save(data) {
        Object.keys(data).forEach(key => {
            localStorage.setItem(`tetris_${key}`, data[key]);
        });
    }
}

// ==========================================
// 4. TETRIS ENGINE CORE CLASS
// ==========================================
class TetrisEngine {
    constructor(canvas, holdCanvas, nextCanvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.holdCanvas = holdCanvas;
        this.hCtx = holdCanvas.getContext('2d');
        this.nextCanvas = nextCanvas;
        this.nCtx = nextCanvas.getContext('2d');

        this.grid = this.createGrid();
        this.bag = [];
        this.nextQueue = [];
        this.currentPiece = null;
        this.holdPiece = null;
        this.canHold = true;

        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.combo = -1;
        this.backToBack = false;
        
        this.dropCounter = 0;
        this.dropInterval = 1000;
        this.lastTime = 0;
        this.isPaused = false;
        this.isGameOver = false;
        this.timer = 0;
        this.timerInterval = null;

        this.init();
    }

    createGrid() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    }

    init() {
        this.fillBag();
        this.populateNextQueue();
        this.spawnPiece();
    }

    // 7-Bag Randomizer Algorithm
    fillBag() {
        const pieces = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
        for (let i = pieces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
        }
        this.bag.push(...pieces);
    }

    populateNextQueue() {
        while (this.nextQueue.length < 5) {
            if (this.bag.length === 0) this.fillBag();
            this.nextQueue.push(this.bag.shift());
        }
    }

    spawnPiece() {
        this.populateNextQueue();
        const type = this.nextQueue.shift();
        const matrix = SHAPES[type];
        
        this.currentPiece = {
            type,
            matrix,
            x: Math.floor(COLS / 2) - Math.ceil(matrix[0].length / 2),
            y: 0
        };

        this.canHold = true;

        // Game Over Check
        if (this.collide(this.grid, this.currentPiece)) {
            this.isGameOver = true;
            audio.playGameOver();
            this.stopTimer();
            showGameOverModal();
        }
    }

    collide(grid, piece) {
        const [m, offset] = [piece.matrix, { x: piece.x, y: piece.y }];
        for (let r = 0; r < m.length; r++) {
            for (let c = 0; c < m[r].length; c++) {
                if (m[r][c] !== 0) {
                    let newX = c + offset.x;
                    let newY = r + offset.y;
                    if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
                    if (newY >= 0 && grid[newY][newX] !== 0) return true;
                }
            }
        }
        return false;
    }

    rotate(matrix) {
        const N = matrix.length;
        return matrix.map((row, i) =>
            row.map((val, j) => matrix[N - 1 - j][i])
        );
    }

    playerRotate() {
        const pos = this.currentPiece.x;
        let offset = 1;
        const rotated = this.rotate(this.currentPiece.matrix);
        const originalMatrix = this.currentPiece.matrix;
        
        this.currentPiece.matrix = rotated;
        // Basic Wall Kick
        while (this.collide(this.grid, this.currentPiece)) {
            this.currentPiece.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (offset > this.currentPiece.matrix[0].length) {
                this.currentPiece.matrix = originalMatrix;
                this.currentPiece.x = pos;
                return;
            }
        }
        audio.playRotate();
    }

    move(dir) {
        this.currentPiece.x += dir;
        if (this.collide(this.grid, this.currentPiece)) {
            this.currentPiece.x -= dir;
        } else {
            audio.playMove();
        }
    }

    drop() {
        this.currentPiece.y++;
        if (this.collide(this.grid, this.currentPiece)) {
            this.currentPiece.y--;
            this.merge();
            this.clearLines();
            this.spawnPiece();
        }
        this.dropCounter = 0;
    }

    hardDrop() {
        while (!this.collide(this.grid, this.currentPiece)) {
            this.currentPiece.y++;
        }
        this.currentPiece.y--;
        audio.playDrop();
        this.merge();
        this.clearLines();
        this.spawnPiece();
    }

    hold() {
        if (!this.canHold) return;
        
        const currentType = this.currentPiece.type;
        if (this.holdPiece === null) {
            this.holdPiece = currentType;
            this.spawnPiece();
        } else {
            const temp = this.holdPiece;
            this.holdPiece = currentType;
            this.currentPiece = {
                type: temp,
                matrix: SHAPES[temp],
                x: Math.floor(COLS / 2) - Math.ceil(SHAPES[temp][0].length / 2),
                y: 0
            };
        }
        this.canHold = false;
        audio.playMove();
    }

    merge() {
        this.currentPiece.matrix.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value !== 0) {
                    this.grid[r + this.currentPiece.y][c + this.currentPiece.x] = this.currentPiece.type;
                }
            });
        });
    }

    clearLines() {
        let linesCleared = 0;
        outer: for (let r = ROWS - 1; r >= 0; r--) {
            for (let c = 0; c < COLS; c++) {
                if (this.grid[r][c] === 0) continue outer;
            }
            const row = this.grid.splice(r, 1)[0].fill(0);
            this.grid.unshift(row);
            r++;
            linesCleared++;
        }

        if (linesCleared > 0) {
            audio.playClear();
            this.lines += linesCleared;
            
            // Scoring Math System
            let baseScore = [0, 100, 300, 500, 800][linesCleared] * this.level;
            
            if (linesCleared === 4) {
                if (this.backToBack) baseScore *= 1.5;
                this.backToBack = true;
                triggerConfetti();
            } else {
                this.backToBack = false;
            }

            this.combo++;
            if (this.combo > 0) baseScore += 50 * this.combo * this.level;

            this.score += baseScore;

            // Level Up logic
            const targetLevel = Math.floor(this.lines / 10) + 1;
            if (targetLevel > this.level && this.level < 20) {
                this.level = targetLevel;
                this.dropInterval = Math.max(100, 1000 - (this.level - 1) * 45);
                audio.playLevelUp();
            }

            updateUI();
        } else {
            this.combo = -1;
        }
    }

    getGhostPosition() {
        const ghost = {
            ...this.currentPiece,
            y: this.currentPiece.y
        };
        while (!this.collide(this.grid, ghost)) {
            ghost.y++;
        }
        ghost.y--;
        return ghost;
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            if (!this.isPaused && !this.isGameOver) {
                this.timer++;
                document.getElementById('game-timer').innerText = this.formatTime(this.timer);
            }
        }, 1000);
    }

    stopTimer() {
        clearInterval(this.timerInterval);
    }

    formatTime(sec) {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    drawBlock(ctx, x, y, color, isGhost = false) {
        ctx.fillStyle = isGhost ? 'rgba(255, 255, 255, 0.2)' : color;
        ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
        if (!isGhost) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
        }
    }

    render() {
        // Clear Canvases
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.hCtx.clearRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
        this.nCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);

        // Draw Matrix Grid
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (this.grid[r][c] !== 0) {
                    this.drawBlock(this.ctx, c, r, COLORS[this.grid[r][c]]);
                }
            }
        }

        if (this.currentPiece) {
            // Draw Ghost Piece
            const ghost = this.getGhostPosition();
            ghost.matrix.forEach((row, r) => {
                row.forEach((val, c) => {
                    if (val !== 0) {
                        this.drawBlock(this.ctx, c + ghost.x, r + ghost.y, null, true);
                    }
                });
            });

            // Draw Active Piece
            this.currentPiece.matrix.forEach((row, r) => {
                row.forEach((val, c) => {
                    if (val !== 0) {
                        this.drawBlock(this.ctx, c + this.currentPiece.x, r + this.currentPiece.y, COLORS[this.currentPiece.type]);
                    }
                });
            });
        }

        // Draw Hold Canvas
        if (this.holdPiece) {
            const matrix = SHAPES[this.holdPiece];
            matrix.forEach((row, r) => {
                row.forEach((val, c) => {
                    if (val !== 0) {
                        this.hCtx.fillStyle = COLORS[this.holdPiece];
                        this.hCtx.fillRect(c * 20 + 10, r * 20 + 10, 18, 18);
                    }
                });
            });
        }

        // Draw Next Queue Canvas
        this.nextQueue.slice(0, 4).forEach((type, index) => {
            const matrix = SHAPES[type];
            matrix.forEach((row, r) => {
                row.forEach((val, c) => {
                    if (val !== 0) {
                        this.nCtx.fillStyle = COLORS[type];
                        this.nCtx.fillRect(c * 18 + 10, index * 60 + r * 18 + 10, 16, 16);
                    }
                });
            });
        });
    }

    update(time = 0) {
        if (this.isPaused || this.isGameOver) return;

        const deltaTime = time - this.lastTime;
        this.lastTime = time;
        this.dropCounter += deltaTime;

        if (this.dropCounter > this.dropInterval) {
            this.drop();
        }

        this.render();
        requestAnimationFrame(this.update.bind(this));
    }
}

// ==========================================
// 5. APPLICATION INITIALIZATION & CONTROLS
// ==========================================
let game = null;

window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('splash-screen').classList.add('hidden');
    }, 1000);

    initBackgroundParticles();
    bindUIEvents();
    loadSettings();
});

function bindUIEvents() {
    const canvas = document.getElementById('tetris-canvas');
    const holdCanvas = document.getElementById('hold-canvas');
    const nextCanvas = document.getElementById('next-canvas');

    document.getElementById('btn-play').addEventListener('click', () => {
        showScreen('game-screen');
        game = new TetrisEngine(canvas, holdCanvas, nextCanvas);
        game.startTimer();
        game.update();
    });

    document.getElementById('btn-pause-game').addEventListener('click', togglePause);
    document.getElementById('btn-resume').addEventListener('click', togglePause);
    
    document.getElementById('btn-settings').addEventListener('click', () => showModal('settings-modal'));
    document.getElementById('btn-close-settings').addEventListener('click', () => hideModal('settings-modal'));

    document.getElementById('btn-highscores').addEventListener('click', () => {
        const stats = StorageManager.get();
        document.getElementById('stat-highscore').innerText = stats.highScore;
        document.getElementById('stat-maxlevel').innerText = stats.maxLevel;
        document.getElementById('stat-totallines').innerText = stats.totalLines;
        document.getElementById('stat-bestcombo').innerText = stats.bestCombo;
        document.getElementById('stat-tetriscount').innerText = stats.tetrisCount;
        showModal('highscores-modal');
    });
    document.getElementById('btn-close-highscores').addEventListener('click', () => hideModal('highscores-modal'));

    document.getElementById('btn-howtoplay').addEventListener('click', () => showModal('howtoplay-modal'));
    document.getElementById('btn-close-howtoplay').addEventListener('click', () => hideModal('howtoplay-modal'));

    document.getElementById('btn-credits').addEventListener('click', () => showModal('credits-modal'));
    document.getElementById('btn-close-credits').addEventListener('click', () => hideModal('credits-modal'));

    document.getElementById('btn-retry').addEventListener('click', () => {
        hideModal('gameover-modal');
        game = new TetrisEngine(canvas, holdCanvas, nextCanvas);
        game.startTimer();
        game.update();
    });

    document.getElementById('btn-go-home').addEventListener('click', () => {
        hideModal('gameover-modal');
        showScreen('main-menu');
    });

    // Key Binding Controls
    document.addEventListener('keydown', (e) => {
        if (!game || game.isGameOver) return;
        if (e.key === 'Escape') togglePause();
        if (game.isPaused) return;

        switch (e.key) {
            case 'ArrowLeft': game.move(-1); break;
            case 'ArrowRight': game.move(1); break;
            case 'ArrowDown': game.drop(); break;
            case 'ArrowUp': game.playerRotate(); break;
            case ' ': game.hardDrop(); break;
            case 'c': case 'C': game.hold(); break;
        }
    });

    // Touch / Mobile Input Binds
    document.getElementById('tbtn-left').addEventListener('click', () => game && game.move(-1));
    document.getElementById('tbtn-right').addEventListener('click', () => game && game.move(1));
    document.getElementById('tbtn-down').addEventListener('click', () => game && game.drop());
    document.getElementById('tbtn-rotate').addEventListener('click', () => game && game.playerRotate());
    document.getElementById('tbtn-drop').addEventListener('click', () => game && game.hardDrop());
    document.getElementById('tbtn-hold').addEventListener('click', () => game && game.hold());
    document.getElementById('tbtn-pause').addEventListener('click', togglePause);
}

function togglePause() {
    if (!game) return;
    game.isPaused = !game.isPaused;
    if (game.isPaused) {
        showModal('pause-modal');
    } else {
        hideModal('pause-modal');
        game.lastTime = performance.now();
        game.update();
    }
}

function updateUI() {
    if (!game) return;
    document.getElementById('score-val').innerText = game.score;
    document.getElementById('level-val').innerText = game.level;
    document.getElementById('lines-val').innerText = game.lines;
    
    const stats = StorageManager.get();
    if (game.score > stats.highScore) {
        document.getElementById('highscore-val').innerText = game.score;
        StorageManager.save({ highScore: game.score });
    } else {
        document.getElementById('highscore-val').innerText = stats.highScore;
    }
}

function showGameOverModal() {
    const stats = StorageManager.get();
    if (game.score > stats.highScore) {
        StorageManager.save({ highScore: game.score });
    }
    document.getElementById('go-score').innerText = game.score;
    document.getElementById('go-level').innerText = game.level;
    document.getElementById('go-lines').innerText = game.lines;
    document.getElementById('go-time').innerText = game.formatTime(game.timer);
    document.getElementById('go-highscore').innerText = Math.max(game.score, stats.highScore);
    showModal('gameover-modal');
}

function showScreen(screenId) {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById(screenId).classList.remove('hidden');
}

function showModal(modalId) { document.getElementById(modalId).classList.remove('hidden'); }
function hideModal(modalId) { document.getElementById(modalId).classList.add('hidden'); }

fun