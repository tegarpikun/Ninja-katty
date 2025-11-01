document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.querySelector('#score-display span');
    const livesDisplay = document.getElementById('lives-display');
    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const startButton = document.getElementById('startButton');
    const restartButton = document.getElementById('restartButton');
    const finalScoreDisplay = document.getElementById('final-score');

    // --- Game Configuration ---
    const GAME_STATE = {
        LOADING: 'LOADING',
        START: 'START',
        PLAYING: 'PLAYING',
        GAME_OVER: 'GAME_OVER'
    };
    let currentGameState = GAME_STATE.LOADING;

    // PATH GAMBAR SUDAH DISET KE semangka.png
    const FRUIT_TYPES = [
		{ name: 'watermelon', color: '#4CAF50', sliceColor: '#F44336', imagePath: 'images/semangka.png' }, 
		{ name: 'banana', color: '#FFEB3B', sliceColor: '#FFC107', imagePath: 'images/semangka.png' },      
		{ name: 'apple', color: '#F44336', sliceColor: '#D32F2F', imagePath: 'images/semangka.png' },
		{ name: 'orange', color: '#FF9800', sliceColor: '#F57C00', imagePath: 'images/semangka.png' }
	];
    const BOMB_COLOR = '#333333';
    const BOMB_EXPLOSION_COLOR = '#FF0000';

    const MAX_LIVES = 3;
    const GRAVITY = 0.05; // Mengubah gravitasi agar lebih lambat
    
    // KETINGGIAN LEMPARAN SUDAH DITINGKATKAN
    const INITIAL_FRUIT_SPEED = { min: 4, max: 7 }; 
    
    const INITIAL_FRUIT_ROTATION_SPEED = { min: -0.05, max: 0.05 };
    const SPAN_INTERVAL_MIN = 800; // Milidetik
    const SPAN_INTERVAL_MAX = 1500;
    const MAX_FRUITS_ON_SCREEN = 5; // Batas buah di layar
    const BOMB_CHANCE = 0.15; // Peluang muncul bom (15%)

    // --- Game Variables ---
    let score = 0;
    let lives = MAX_LIVES;
    let fruits = []; // Array untuk menyimpan objek buah/bom
    let lastSpawnTime = 0;
    let nextSpawnInterval = 0;
    let animationFrameId; // Untuk requestAnimationFrame

    // --- Slice Tracking (untuk mouse & touch) ---
    let isDrawing = false;
    let lastPoint = { x: 0, y: 0 };
    let slicePoints = []; // Menyimpan titik-titik slice untuk drawing
    let sliceTrailElements = []; // Menyimpan DOM elements untuk visual trail

    // --- Image Loading ---
    let ASSETS = {}; // Objek global untuk menyimpan gambar yang sudah dimuat

    function loadAssets() {
        return new Promise(resolve => {
            const assetsToLoad = [];
            
            // 1. Muat Buah Semangka
            FRUIT_TYPES.forEach(type => {
                if (!assetsToLoad.includes(type.imagePath)) {
                    assetsToLoad.push(type.imagePath);
                }
            });
            
            // 2. Muat Bom (Gunakan placeholder path jika belum ada gambar)
            assetsToLoad.push('images/bom.png'); // Contoh path untuk bom
            
            let loadedCount = 0;
            
            if (assetsToLoad.length === 0) {
                console.log("No assets to load.");
                return resolve();
            }

            assetsToLoad.forEach(path => {
                const img = new Image();
                img.onload = () => {
                    ASSETS[path] = img;
                    loadedCount++;
                    if (loadedCount === assetsToLoad.length) {
                        console.log("Semua aset gambar berhasil dimuat!");
                        resolve();
                    }
                };
                img.onerror = () => {
                    console.error(`Gagal memuat gambar: ${path}`);
                    ASSETS[path] = null; // Set ke null jika gagal
                    loadedCount++;
                    if (loadedCount === assetsToLoad.length) {
                        resolve();
                    }
                };
                img.src = path;
            });
        });
    }

    // --- Utility Functions ---
    function getRandom(min, max) {
        return Math.random() * (max - min) + min;
    }

    function checkCollision(obj, pointX, pointY) {
        // Simple circle-point collision for now
        const distSq = (pointX - obj.x) * (pointX - obj.x) + (pointY - obj.y) * (pointY - obj.y);
        return distSq < (obj.radius * obj.radius);
    }

    // --- Fruit/Bomb Class ---
    class GameEntity {
        // Constructor menerima imagePath
        constructor(type, x, y, radius, dx, dy, rotationSpeed, color, sliceColor = null, imagePath = null) {
            this.type = type; // 'fruit' or 'bomb'
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.dx = dx; // Velocity X
            this.dy = dy; // Velocity Y
            this.rotation = 0;
            this.rotationSpeed = rotationSpeed;
            this.color = color;
            this.sliceColor = sliceColor;
            this.isSliced = false;
            this.gravityEffect = GRAVITY;
            this.pieces = []; // Untuk potongan buah
            this.spawnTime = performance.now();
            
            // Simpan referensi gambar yang sudah dimuat
            this.image = imagePath ? ASSETS[imagePath] : null; 
        }

        update(deltaTime) {
            if (this.isSliced) {
                this.pieces.forEach(p => {
                    p.x += p.dx * deltaTime;
                    p.y += p.dy * deltaTime;
                    p.dy += this.gravityEffect * deltaTime;
                    p.rotation += p.rotationSpeed * deltaTime;
                });
                return;
            }

            this.x += this.dx * deltaTime;
            this.y += this.dy * deltaTime;
            this.dy += this.gravityEffect * deltaTime;
            this.rotation += this.rotationSpeed * deltaTime;
        }

        // METODE DRAW DENGAN LOGIKA GAMBAR PNG
        draw(context) {
            if (this.isSliced) {
                this.pieces.forEach(p => {
                    context.save();
                    context.translate(p.x, p.y);
                    context.rotate(p.rotation);
                    context.fillStyle = p.color;
                    context.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
                    context.restore();
                });
                return;
            }

            context.save();
            context.translate(this.x, this.y);
            context.rotate(this.rotation);
            
            // LOGIKA MENGGAMBAR GAMBAR SEMANGKA
            if (this.image && this.image.complete) { 
                const size = this.radius * 2;
                context.drawImage(this.image, -this.radius, -this.radius, size, size);
            } else {
                // Fallback: Gambar lingkaran warna solid 
                context.beginPath();
                context.arc(0, 0, this.radius, 0, Math.PI * 2);
                context.fillStyle = this.color;
                context.fill();
                context.closePath();
            }
            context.restore();
        }
        slice() {
            this.isSliced = true;
            if (this.type === 'fruit') {
                score++;
                updateScore();
                this.createPieces(this.sliceColor);
            } else if (this.type === 'bomb') {
                lives--;
                updateLives();
                this.createExplosionEffect();
            }
        }

        createPieces(pieceColor) {
            // Generate 2 pieces for simplicity
            for (let i = 0; i < 2; i++) {
                this.pieces.push({
                    x: this.x,
                    y: this.y,
                    dx: getRandom(-1, 1) * 3, // Kecepatan potongan
                    dy: getRandom(-1, 1) * 3 - 3, // Sedikit melayang ke atas
                    rotation: getRandom(0, Math.PI * 2),
                    rotationSpeed: getRandom(-0.1, 0.1),
                    color: pieceColor,
                    width: this.radius,
                    height: this.radius / 2
                });
            }
        }

        createExplosionEffect() {
            // Simple visual explosion effect for bomb
            let explosionRadius = 0;
            const maxExplosionRadius = this.radius * 3;
            const explosionDuration = 300; // ms
            const startTime = performance.now();

            const animateExplosion = () => {
                const elapsed = performance.now() - startTime;
                if (elapsed < explosionDuration) {
                    explosionRadius = (elapsed / explosionDuration) * maxExplosionRadius;
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, explosionRadius, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 0, 0, ${1 - (elapsed / explosionDuration)})`;
                    ctx.fill();
                    ctx.closePath();
                    ctx.restore();
                    requestAnimationFrame(animateExplosion);
                }
            };
            requestAnimationFrame(animateExplosion);
        }
    }

    // --- Game Logic Functions ---
    function spawnEntity() {
        if (fruits.length >= MAX_FRUITS_ON_SCREEN) return;

        const isBomb = Math.random() < BOMB_CHANCE;
        const radius = getRandom(25, 40); // Ukuran buah/bom
        const startX = getRandom(canvas.width * 0.2, canvas.width * 0.8);
        const startY = canvas.height + radius; // Muncul dari bawah
        const dx = getRandom(-1, 1); // Variasi arah horizontal
        const dy = -getRandom(INITIAL_FRUIT_SPEED.min, INITIAL_FRUIT_SPEED.max);
        const rotationSpeed = getRandom(INITIAL_FRUIT_ROTATION_SPEED.min, INITIAL_FRUIT_ROTATION_SPEED.max);

        if (isBomb) {
            // Bom akan menggunakan warna fallback jika images/bom.png tidak ada
            fruits.push(new GameEntity('bomb', startX, startY, radius, dx, dy, rotationSpeed, BOMB_COLOR, null, 'images/bom.png'));
        } else {
            const fruitType = FRUIT_TYPES[Math.floor(getRandom(0, FRUIT_TYPES.length))];
            // KIRIM imagePath
            fruits.push(new GameEntity('fruit', startX, startY, radius, dx, dy, rotationSpeed, fruitType.color, fruitType.sliceColor, fruitType.imagePath));
        }
        lastSpawnTime = performance.now();
        nextSpawnInterval = getRandom(SPAN_INTERVAL_MIN, SPAN_INTERVAL_MAX);
    }

    function updateScore() {
        scoreDisplay.textContent = score;
    }
    
    function updateLives() {
        const lifeSpans = livesDisplay.querySelectorAll('.life');
        lifeSpans.forEach((span, index) => {
            if (index < lives) {
                span.classList.add('active');
            } else {
                span.classList.remove('active');
            }
        });

        if (lives <= 0) {
            endGame();
        }
    }

    function startGame() {
        score = 0;
        lives = MAX_LIVES;
        fruits = [];
        slicePoints = [];
        lastSpawnTime = 0;
        nextSpawnInterval = 0;
        updateScore();
        updateLives();
        startScreen.classList.remove('active');
        gameOverScreen.classList.remove('active');
        currentGameState = GAME_STATE.PLAYING;
        
        resizeCanvas();

        let lastFrameTime = performance.now();
        const gameLoop = (currentTime) => {
            if (currentGameState !== GAME_STATE.PLAYING) {
                cancelAnimationFrame(animationFrameId);
                return;
            }

            const deltaTime = (currentTime - lastFrameTime) / 16.666; 
            lastFrameTime = currentTime;

            update(deltaTime);
            render();
            
            animationFrameId = requestAnimationFrame(gameLoop);
        };
        animationFrameId = requestAnimationFrame(gameLoop);
    }

    function endGame() {
        currentGameState = GAME_STATE.GAME_OVER;
        cancelAnimationFrame(animationFrameId);
        finalScoreDisplay.textContent = score;
        gameOverScreen.classList.add('active');
    }

    // --- Main Game Loop Functions ---
    function update(deltaTime) {
        // Spawn logic
        if (performance.now() - lastSpawnTime > nextSpawnInterval) {
            spawnEntity();
        }

        // Update fruits
        for (let i = fruits.length - 1; i >= 0; i--) {
            const fruit = fruits[i];
            fruit.update(deltaTime);

            // Remove if off screen and not sliced
            if (fruit.y > canvas.height + fruit.radius && !fruit.isSliced) {
                if (fruit.type === 'fruit') { 
                    lives--;
                    updateLives();
                }
                fruits.splice(i, 1);
            }
            // Remove sliced pieces after they fall off
            else if (fruit.isSliced && fruit.pieces.every(p => p.y > canvas.height + Math.max(p.width, p.height))) {
                fruits.splice(i, 1);
            }
        }

        // Clean up slice trail elements
        while (sliceTrailElements.length > 50) { 
            sliceTrailElements[0].remove();
            sliceTrailElements.shift();
        }
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); 

        fruits.forEach(fruit => fruit.draw(ctx));

        // Draw current slice path
        if (isDrawing && slicePoints.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = '#FFC107'; 
            ctx.lineWidth = 5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.moveTo(slicePoints[0].x, slicePoints[0].y);
            for (let i = 1; i < slicePoints.length; i++) {
                ctx.lineTo(slicePoints[i].x, slicePoints[i].y);
            }
            ctx.stroke();
        }
    }

    // --- Event Listeners for Input (Mouse & Touch) ---
    function getEventCoords(event) {
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;

        if (event.touches && event.touches.length > 0) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }

        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function handleStart(coords) {
        if (currentGameState !== GAME_STATE.PLAYING) return;
        isDrawing = true;
        lastPoint = coords;
        slicePoints = [coords];
        createSliceTrail(coords);
    }

    function handleMove(coords) {
        if (!isDrawing || currentGameState !== GAME_STATE.PLAYING) return;
        slicePoints.push(coords);
        createSliceTrail(coords);

        // Check for slices
        for (let i = fruits.length - 1; i >= 0; i--) {
            const fruit = fruits[i];
            if (!fruit.isSliced && checkCollision(fruit, coords.x, coords.y)) {
                fruit.slice();
            }
        }

        lastPoint = coords;
    }

    function handleEnd() {
        if (currentGameState !== GAME_STATE.PLAYING) return;
        isDrawing = false;
        slicePoints = [];
    }

    // --- Slice Trail Visuals (DOM elements for better visual effect) ---
    function createSliceTrail(coords) {
        const trail = document.createElement('div');
        trail.classList.add('slice-trail');
        // Posisi relatif terhadap game-container
        const canvasRect = canvas.getBoundingClientRect();
        const gameContainerRect = canvas.parentElement.getBoundingClientRect();
        
        const trailSize = getRandom(5, 12); 
        trail.style.width = `${trailSize}px`;
        trail.style.height = `${trailSize}px`;
        trail.style.left = `${(coords.x / canvas.width) * canvasRect.width + canvasRect.left - gameContainerRect.left - trailSize / 2}px`;
        trail.style.top = `${(coords.y / canvas.height) * canvasRect.height + canvasRect.top - gameContainerRect.top - trailSize / 2}px`;
        
        canvas.parentElement.appendChild(trail);
        sliceTrailElements.push(trail);
    }


    canvas.addEventListener('mousedown', (e) => handleStart(getEventCoords(e)));
    canvas.addEventListener('mousemove', (e) => handleMove(getEventCoords(e)));
    canvas.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('mouseout', handleEnd); 

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        handleStart(getEventCoords(e));
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        handleMove(getEventCoords(e));
    }, { passive: false });
    canvas.addEventListener('touchend', handleEnd);
    canvas.addEventListener('touchcancel', handleEnd);

    // --- Responsive Canvas Sizing ---
    function resizeCanvas() {
        const container = document.getElementById('game-container');
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    // Call resize on window load and resize
    window.addEventListener('resize', resizeCanvas);

    // --- Initialization ---
    function init() {
        currentGameState = GAME_STATE.LOADING;
        // Panggil loadAssets untuk memuat gambar sebelum game dimulai
        loadAssets().then(() => {
            currentGameState = GAME_STATE.START;
            startScreen.classList.add('active');
            resizeCanvas(); 
        });

        startButton.addEventListener('click', startGame);
        restartButton.addEventListener('click', startGame);
    }

    init();
});