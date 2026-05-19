// 3D Snake Cyber Racing Edition - Engine & Gameplay Logic

// Configuración general del juego
const GRID_SIZE = 20;
const CELL_SIZE = 1.2; // Espaciado en unidades 3D
const BOARD_LIMIT = (GRID_SIZE * CELL_SIZE) / 2;

// Variables de estado del juego
let snake = [{ x: 10, y: 10 }];
let direction = 'RIGHT';
let nextDirection = 'RIGHT';
let fruit = { x: 5, y: 5 };
let isSpecialFruit = false;
let score = 0;
let highScore = parseInt(localStorage.getItem('snake3d_highscore')) || 0;
let gameSpeed = 160;
let level = 'Fácil';
let isPaused = false;
let isGameOver = false;
let hasStarted = false;
let gameTimeout = null;

// Tres.js - Elementos principales
let scene, camera, renderer;
let snakeGroup, fruitGroup, particlesArray = [];
let headLight, fruitLight, dirLight;
let cameraShakeIntensity = 0;

// Tercera Persona - Dirección y variables de cámara
let cameraYaw = Math.PI / 2; // Iniciar mirando a la derecha (+X)
let targetAngle = Math.PI / 2;
let currentLookAt = new THREE.Vector3(0, 0.45, 0);
let currentRoll = 0;
const CAM_DISTANCE = 5.8; // Distancia detrás del coche/cabeza
const CAM_HEIGHT = 2.4;   // Altura sobre el coche/cabeza

// Audio Context (Sintetizador Web Audio API)
let audioCtx = null;
const soundToggle = document.getElementById('soundToggle');

// Inicializar el Audio Context al interactuar
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Sintetizar sonidos acústicos orgánicos (Jungle)
function playSound(type) {
    if (!audioCtx || (soundToggle && !soundToggle.checked)) return;
    
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'eat') {
        // Bloque de madera / Marimba
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'eat_special') {
        // Campana mágica / Cristal
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.3);
        
        // Harmónico secundario
        const osc2 = audioCtx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1600, now);
        osc2.connect(gainNode);
        osc2.start(now);
        osc2.stop(now + 0.3);

        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'turn') {
        // Ruido sutil (Hoja crujiendo / Viento)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.05);
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'level') {
        // Tambor tribal ascendente
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.setValueAtTime(150, now + 0.1);
        osc.frequency.setValueAtTime(250, now + 0.2);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
    } else if (type === 'gameover') {
        // Tambor grave descendente
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.8);
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
    }
}

// Inicializar el motor 3D de Three.js
function init3D() {
    const container = document.getElementById('gameContainer3D');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Escena
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x112b1c, 0.04);

    // 2. Cámara (Perspectiva para tercera persona de conducción)
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    resetCameraPositionImmediate();

    // 3. Renderer WebGL
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a110a, 1);
    
    const canvasElement = document.getElementById('webglCanvas');
    if (canvasElement) canvasElement.remove();
    renderer.domElement.id = 'webglCanvas';
    container.appendChild(renderer.domElement);

    // 4. Luces (Selva)
    const ambientLight = new THREE.AmbientLight(0x2a3b2a, 1.5);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0xfff0c0, 1.2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Luces dinámicas
    headLight = new THREE.PointLight(0xffd700, 2.0, 12, 1.5);
    scene.add(headLight);

    fruitLight = new THREE.PointLight(0xff4500, 3.0, 10, 1.5);
    scene.add(fruitLight);

    // 5. Plataforma
    createArena();

    // 6. Grupos de meshes
    snakeGroup = new THREE.Group();
    scene.add(snakeGroup);

    fruitGroup = new THREE.Group();
    scene.add(fruitGroup);
    createFruitMesh();

    // 7. Eventos
    window.addEventListener('resize', onWindowResize);
}

// Inicializar la cámara justo detrás de la cabeza inicial
function resetCameraPositionImmediate() {
    const headPos = gridToSpace(snake[0].x, snake[0].y);
    cameraYaw = Math.PI / 2; // Mirando a la derecha
    targetAngle = Math.PI / 2;
    
    // Posición cámara
    const camX = headPos.x - Math.sin(cameraYaw) * CAM_DISTANCE;
    const camZ = headPos.z - Math.cos(cameraYaw) * CAM_DISTANCE;
    const camY = 0.45 + CAM_HEIGHT;
    
    camera.position.set(camX, camY, camZ);
    currentLookAt.set(headPos.x + Math.sin(cameraYaw) * 1.5, 0.45, headPos.z + Math.cos(cameraYaw) * 1.5);
    camera.lookAt(currentLookAt);
    currentRoll = 0;
}

// Crear la plataforma flotante 3D del juego (Jungle Base)
function createArena() {
    const size = GRID_SIZE * CELL_SIZE;

    // Plataforma base (Tierra Oscura / Musgo)
    const platformGeom = new THREE.BoxGeometry(size, 0.4, size);
    const platformMat = new THREE.MeshStandardMaterial({
        color: 0x1a2e1a,
        roughness: 0.9,
        metalness: 0.1
    });
    const platform = new THREE.Mesh(platformGeom, platformMat);
    platform.position.y = -0.2;
    platform.receiveShadow = true;
    scene.add(platform);

    // Rejilla de ruinas (piedra inca/maya)
    const gridHelper = new THREE.GridHelper(size, GRID_SIZE, 0x2e8b57, 0x112b1c);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Marco exterior de piedra antigua
    const borderGeom = new THREE.BoxGeometry(size + 0.6, 1.0, size + 0.6);
    const borderMat = new THREE.MeshStandardMaterial({ color: 0x2a2e2a, roughness: 1 });
    const borderBox = new THREE.Mesh(borderGeom, borderMat);
    borderBox.position.y = -0.3;
    borderBox.receiveShadow = true;
    scene.add(borderBox);

    spawnJungleEnvironment(size);
}

function spawnJungleEnvironment(boardSize) {
    const treeCount = 70;
    const geomTrunk = new THREE.CylinderGeometry(0.3, 0.5, 4, 7);
    const matTrunk = new THREE.MeshStandardMaterial({ color: 0x4a3b2a, roughness: 1 });
    
    const geomLeaves = new THREE.ConeGeometry(2, 5, 8);
    const matLeaves = new THREE.MeshStandardMaterial({ color: 0x1b4d1b, roughness: 0.9 });

    for (let i = 0; i < treeCount; i++) {
        // Random pos outside the board
        let x, z;
        do {
            x = (Math.random() - 0.5) * boardSize * 3;
            z = (Math.random() - 0.5) * boardSize * 3;
        } while (Math.abs(x) < boardSize/2 + 1 && Math.abs(z) < boardSize/2 + 1);

        const trunk = new THREE.Mesh(geomTrunk, matTrunk);
        trunk.position.set(x, 2, z);
        trunk.castShadow = true;
        scene.add(trunk);

        const leaves = new THREE.Mesh(geomLeaves, matLeaves);
        leaves.position.set(x, 5.5 + Math.random(), z);
        leaves.castShadow = true;
        scene.add(leaves);
    }
}

// Convertir coordenadas de matriz local en coordenadas de espacio 3D
function gridToSpace(x, y) {
    return {
        x: (x - (GRID_SIZE - 1) / 2) * CELL_SIZE,
        z: (y - (GRID_SIZE - 1) / 2) * CELL_SIZE
    };
}

// Crear la malla de la fruta en 3D (Mango selvático o Baya dorada)
function createFruitMesh() {
    while(fruitGroup.children.length > 0) {
        fruitGroup.remove(fruitGroup.children[0]);
    }

    const bodyColor = isSpecialFruit ? 0xffd700 : 0xff4500;
    
    const bodyGeom = new THREE.SphereGeometry(0.4, 16, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyColor,
        emissiveIntensity: 0.3,
        roughness: 0.4,
        metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    fruitGroup.add(body);

    const stemGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
    const stem = new THREE.Mesh(stemGeom, stemMat);
    stem.position.y = 0.45;
    stem.rotation.z = -0.2;
    fruitGroup.add(stem);

    const leafGeom = new THREE.ConeGeometry(0.12, 0.28, 4);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57 });
    const leaf = new THREE.Mesh(leafGeom, leafMat);
    leaf.position.set(0.1, 0.5, 0);
    leaf.rotation.z = 0.8;
    fruitGroup.add(leaf);

    updateFruitPosition3D();
}

// Actualizar la posición de la fruta en 3D
function updateFruitPosition3D() {
    const pos = gridToSpace(fruit.x, fruit.y);
    fruitGroup.position.set(pos.x, 0.45, pos.z);
    
    fruitLight.color.setHex(isSpecialFruit ? 0xffd700 : 0xff4500);
    fruitLight.position.set(pos.x, 0.8, pos.z);
}

// Dibujar y actualizar los segmentos de la serpiente (Serpiente antigua de piedra/escamas)
function drawSnake3D() {
    while(snakeGroup.children.length > 0) {
        snakeGroup.remove(snakeGroup.children[0]);
    }

    snake.forEach((part, index) => {
        const isHead = index === 0;
        const pos = gridToSpace(part.x, part.y);
        
        let geom, mat;

        if (isHead) {
            // Cabeza
            geom = new THREE.BoxGeometry(0.95, 0.8, 0.95);
            mat = new THREE.MeshStandardMaterial({
                color: 0x1b4d1b, // Verde oscuro
                roughness: 0.8,
                metalness: 0.1
            });
        } else {
            const scale = Math.max(0.55, 0.86 - (index * 0.015));
            geom = new THREE.BoxGeometry(scale, scale * 0.9, scale);
            
            const ratio = index / snake.length;
            const segmentColor = new THREE.Color().lerpColors(
                new THREE.Color(0x2e8b57), // Verde medio
                new THREE.Color(0x8fbc8f), // Verde claro amarillento
                ratio
            );

            mat = new THREE.MeshStandardMaterial({
                color: segmentColor,
                roughness: 0.9,
                metalness: 0.1
            });
        }

        const segment = new THREE.Mesh(geom, mat);
        segment.position.set(pos.x, 0.4, pos.z);
        segment.castShadow = true;
        segment.receiveShadow = true;

        if (isHead) {
            // Ojos dorados
            const eyeGeom = new THREE.SphereGeometry(0.12, 8, 8);
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
            
            const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
            const rightEye = new THREE.Mesh(eyeGeom, eyeMat);

            // Colocar en el sentido de conducción
            if (direction === 'RIGHT') {
                leftEye.position.set(0.42, 0.12, -0.28);
                rightEye.position.set(0.42, 0.12, 0.28);
            } else if (direction === 'LEFT') {
                leftEye.position.set(-0.42, 0.12, 0.28);
                rightEye.position.set(-0.42, 0.12, -0.28);
            } else if (direction === 'UP') {
                leftEye.position.set(-0.28, 0.12, -0.42);
                rightEye.position.set(0.28, 0.12, -0.42);
            } else if (direction === 'DOWN') {
                leftEye.position.set(0.28, 0.12, 0.42);
                rightEye.position.set(-0.28, 0.12, 0.42);
            }

            segment.add(leftEye);
            segment.add(rightEye);

            headLight.position.set(pos.x, 1.0, pos.z);
        }

        snakeGroup.add(segment);
    });
}

// Crear explosión de hojas/polen orgánico
function spawnParticles(x, z, special = false) {
    const particleCount = special ? 40 : 25;
    const color = special ? 0xffd700 : 0x8fbc8f;

    const geom = new THREE.BoxGeometry(0.15, 0.05, 0.15); // Hojas
    const mat = new THREE.MeshBasicMaterial({ color: color });

    for (let i = 0; i < particleCount; i++) {
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(
            x + (Math.random() * 0.4 - 0.2),
            0.5,
            z + (Math.random() * 0.4 - 0.2)
        );
        mesh.rotation.set(Math.random(), Math.random(), Math.random());
        scene.add(mesh);

        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.08 + 0.04;
        
        particlesArray.push({
            mesh: mesh,
            velocity: new THREE.Vector3(
                Math.cos(angle) * speed,
                Math.random() * 0.08 + 0.05,
                Math.sin(angle) * speed
            ),
            rotation: new THREE.Vector3(
                Math.random() * 0.2,
                Math.random() * 0.2,
                Math.random() * 0.2
            ),
            gravity: -0.004,
            life: 30 + Math.floor(Math.random() * 20),
            maxLife: 50
        });
    }
}

// Actualizar la física de las partículas en 3D
function updateParticles() {
    for (let i = particlesArray.length - 1; i >= 0; i--) {
        const p = particlesArray[i];
        p.velocity.y += p.gravity;
        p.mesh.position.add(p.velocity);
        
        if (p.rotation) {
            p.mesh.rotation.x += p.rotation.x;
            p.mesh.rotation.y += p.rotation.y;
            p.mesh.rotation.z += p.rotation.z;
        }
        
        p.life--;
        const ratio = p.life / p.maxLife;
        p.mesh.scale.set(ratio, ratio, ratio);

        if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            particlesArray.splice(i, 1);
        }
    }
}

// Cola de giros para que sean basados en la perspectiva de la víbora en 3D (Racing steering)
let turnQueue = [];

function queueTurn(turnType) { // 'LEFT' o 'RIGHT'
    if (isPaused || isGameOver || !hasStarted) return;
    initAudio();
    // Limitar tamaño de la cola para evitar retardo acumulado
    if (turnQueue.length < 2) {
        turnQueue.push(turnType);
    }
}

// Controladores de teclado e inputs
document.addEventListener('keydown', handleKeyDown);

function handleKeyDown(event) {
    initAudio();
    const key = event.key;

    if (key === 'ArrowLeft' || key.toLowerCase() === 'a') {
        queueTurn('LEFT');
    } else if (key === 'ArrowRight' || key.toLowerCase() === 'd') {
        queueTurn('RIGHT');
    } else if (key.toLowerCase() === 'p' || key === ' ') {
        togglePause();
        event.preventDefault();
    }
}

// Controles del Volante Táctil / Botones Virtuales (Racing Edition)
document.getElementById('steerLeft').addEventListener('click', () => { queueTurn('LEFT'); });
document.getElementById('steerRight').addEventListener('click', () => { queueTurn('RIGHT'); });

// Lógica principal del bucle del juego (Physics Tick)
function gameLoop() {
    if (isPaused || isGameOver) return;

    // Procesar giro en cola si existe (Giro relativo)
    if (turnQueue.length > 0) {
        const turn = turnQueue.shift();
        const DIR_SEQUENCE = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
        let idx = DIR_SEQUENCE.indexOf(direction);
        
        if (turn === 'LEFT') {
            direction = DIR_SEQUENCE[(idx - 1 + 4) % 4];
        } else if (turn === 'RIGHT') {
            direction = DIR_SEQUENCE[(idx + 1) % 4];
        }
        
        playSound('turn');
        
        // Mapear ángulo de destino según la dirección para la tercera persona
        if (direction === 'DOWN') targetAngle = 0;
        if (direction === 'UP') targetAngle = Math.PI;
        if (direction === 'RIGHT') targetAngle = Math.PI / 2;
        if (direction === 'LEFT') targetAngle = -Math.PI / 2;
    }

    moveSnake();

    if (checkCollision()) {
        triggerGameOver();
    } else {
        drawSnake3D();
        gameTimeout = setTimeout(gameLoop, gameSpeed);
    }
}

// Movimiento de la serpiente
function moveSnake() {
    let head = { ...snake[0] };
    
    if (direction === 'UP') head.y -= 1;
    if (direction === 'DOWN') head.y += 1;
    if (direction === 'LEFT') head.x -= 1;
    if (direction === 'RIGHT') head.x += 1;
    
    snake.unshift(head);

    // Si come fruta
    if (head.x === fruit.x && head.y === fruit.y) {
        const points = isSpecialFruit ? 30 : 10;
        score += points;
        
        cameraShakeIntensity = isSpecialFruit ? 0.9 : 0.4;
        const pos = gridToSpace(fruit.x, fruit.y);
        spawnParticles(pos.x, pos.z, isSpecialFruit);
        
        playSound(isSpecialFruit ? 'eat_special' : 'eat');
        
        updateScore();
        generateNewFruit();
        
        if (score > 0 && score % 50 === 0) {
            gameSpeed = Math.max(70, gameSpeed - 12);
            updateLevel();
            playSound('level');
        }
    } else {
        snake.pop();
    }
}

// Comprobar colisiones
function checkCollision() {
    let head = snake[0];
    
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        return true;
    }
    
    for (let i = 1; i < snake.length; i++) {
        if (snake[i].x === head.x && snake[i].y === head.y) {
            return true;
        }
    }
    return false;
}

// Generar una fruta
function generateNewFruit() {
    let attempts = 0;
    let newFruit;
    let onSnake = true;

    while (onSnake && attempts < 100) {
        newFruit = {
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE)
        };
        onSnake = snake.some(part => part.x === newFruit.x && part.y === newFruit.y);
        attempts++;
    }

    fruit = newFruit;
    isSpecialFruit = Math.random() < 0.15;
    createFruitMesh();
}

// Gestionar fin del juego
function triggerGameOver() {
    isGameOver = true;
    clearTimeout(gameTimeout);
    
    playSound('gameover');
    cameraShakeIntensity = 1.6;
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snake3d_highscore', highScore);
        document.getElementById('record').innerText = highScore;
    }

    document.getElementById('finalScore').innerText = score;
    document.getElementById('gameOverOverlay').classList.add('active');
}

// Actualizar HUD
function updateScore() {
    document.getElementById('score').innerText = score;
}

function updateLevel() {
    if (gameSpeed <= 140 && gameSpeed > 100) {
        level = 'Medio';
    } else if (gameSpeed <= 100 && gameSpeed > 80) {
        level = 'Difícil';
    } else if (gameSpeed <= 80) {
        level = 'Experto';
    }
    document.getElementById('level').innerText = level;
}

function togglePause() {
    if (isGameOver || !hasStarted) return;
    
    isPaused = !isPaused;
    const pauseOverlay = document.getElementById('pauseOverlay');

    if (isPaused) {
        pauseOverlay.classList.add('active');
        clearTimeout(gameTimeout);
    } else {
        pauseOverlay.classList.remove('active');
        gameLoop();
    }
}

// Iniciar/Reiniciar el juego
function restartGame() {
    initAudio();
    
    snake = [{ x: 10, y: 10 }];
    direction = 'RIGHT';
    nextDirection = 'RIGHT';
    turnQueue = []; // Vaciar cola de giros
    score = 0;
    gameSpeed = 160;
    level = 'Fácil';
    isPaused = false;
    isGameOver = false;
    hasStarted = true;

    particlesArray.forEach(p => scene.remove(p.mesh));
    particlesArray = [];

    document.getElementById('gameOverOverlay').classList.remove('active');
    document.getElementById('startOverlay').classList.remove('active');
    document.getElementById('pauseOverlay').classList.remove('active');

    updateScore();
    document.getElementById('level').innerText = level;
    document.getElementById('record').innerText = highScore;

    generateNewFruit();
    drawSnake3D();
    
    // Restablecer cámara detrás del coche instantáneamente
    resetCameraPositionImmediate();

    clearTimeout(gameTimeout);
    gameLoop();
}

// Enlazar botones
document.getElementById('btnStart').addEventListener('click', restartGame);
document.getElementById('btnRetry').addEventListener('click', restartGame);
document.getElementById('btnResume').addEventListener('click', togglePause);
document.getElementById('btnPause').addEventListener('click', togglePause);

// Adaptar tamaño
function onWindowResize() {
    const container = document.getElementById('gameContainer3D');
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Dibujar Minimapa/GPS en 2D Canvas (con barrido de radar biológico selvático)
function drawGPSMinimap(time) {
    const canvas = document.getElementById('gpsCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const CX = W / 2;
    const CY = H / 2;
    const R = W / 2 - 4; // Radio del visor de radar

    // 1. Limpiar con fondo verde selva muy oscuro
    ctx.fillStyle = '#051005';
    ctx.fillRect(0, 0, W, H);

    // 2. Dibujar círculos concéntricos de brújula biológica
    ctx.strokeStyle = 'rgba(46, 139, 87, 0.2)'; // Verde selva translúcido
    ctx.lineWidth = 1.5;
    
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(CX, CY, R * 0.66, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(CX, CY, R * 0.33, 0, Math.PI * 2);
    ctx.stroke();

    // Marcas cardinales (N, S, E, O biológicas)
    ctx.beginPath();
    ctx.moveTo(CX - R, CY); ctx.lineTo(CX + R, CY);
    ctx.moveTo(CX, CY - R); ctx.lineTo(CX, CY + R);
    ctx.stroke();

    // 3. Efecto de barrido de radar radial (Polen/Energía vital)
    const sweepAngle = (time * 0.0022) % (Math.PI * 2);
    const grad = ctx.createRadialGradient(CX, CY, 0, CX, CY, R);
    grad.addColorStop(0, 'rgba(143, 188, 143, 0.08)');
    grad.addColorStop(1, 'rgba(143, 188, 143, 0.01)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.arc(CX, CY, R, sweepAngle - 0.3, sweepAngle);
    ctx.lineTo(CX, CY);
    ctx.fill();

    // Dibujar línea del barrido
    ctx.strokeStyle = 'rgba(143, 188, 143, 0.4)'; // Verde claro
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(CX + Math.cos(sweepAngle) * R, CY + Math.sin(sweepAngle) * R);
    ctx.stroke();

    // Función auxiliar para mapear coordenadas
    function mapToRadar(gridX, gridY) {
        const nx = (gridX - (GRID_SIZE - 1) / 2) / (GRID_SIZE / 2);
        const ny = (gridY - (GRID_SIZE - 1) / 2) / (GRID_SIZE / 2);
        return {
            x: CX + nx * (R - 6),
            y: CY + ny * (R - 6)
        };
    }

    // 4. Dibujar ruta guía GPS (Rastro de esporas doradas)
    const head = snake[0];
    const headPos = mapToRadar(head.x, head.y);
    const targetPos = mapToRadar(fruit.x, fruit.y);

    if (hasStarted && !isGameOver) {
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)'; // Oro
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(headPos.x, headPos.y);
        ctx.lineTo(targetPos.x, targetPos.y);
        ctx.stroke();
        ctx.setLineDash([]); // Reset
    }

    // 5. Dibujar cuerpo de la serpiente (Estela verde bosque)
    if (snake.length > 1) {
        ctx.strokeStyle = 'rgba(46, 139, 87, 0.8)';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        
        snake.forEach((part, idx) => {
            const p = mapToRadar(part.x, part.y);
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
    }

    // 6. Dibujar cabeza (Indicador dorado)
    ctx.fillStyle = '#ffd700';
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#ffd700';
    ctx.beginPath();
    
    // Dibujar un puntero triangular orientado
    const size = 5;
    ctx.save();
    ctx.translate(headPos.x, headPos.y);
    
    let headingAngle = 0;
    if (direction === 'DOWN') headingAngle = 0;
    if (direction === 'UP') headingAngle = Math.PI;
    if (direction === 'RIGHT') headingAngle = Math.PI / 2;
    if (direction === 'LEFT') headingAngle = -Math.PI / 2;
    
    ctx.rotate(headingAngle);
    ctx.moveTo(0, -size * 1.5); // Punta
    ctx.lineTo(-size, size);
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;

    // 7. Dibujar fruta (Objetivo ámbar parpadeante)
    const fruitColor = isSpecialFruit ? '#fff01f' : '#ff8c00'; // Naranja oscuro o amarillo
    ctx.fillStyle = fruitColor;
    ctx.shadowBlur = 6;
    ctx.shadowColor = fruitColor;
    
    const pulseFactor = 1 + Math.sin(time * 0.01) * 0.25;
    ctx.beginPath();
    ctx.arc(targetPos.x, targetPos.y, 4 * pulseFactor, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
}

// Render loop de Three.js (a 60 FPS fijos)
function animate(time) {
    requestAnimationFrame(animate);

    // Animación de la fruta en el aire (flotar y girar)
    if (fruitGroup) {
        fruitGroup.position.y = 0.45 + Math.sin(time * 0.005) * 0.12;
        fruitGroup.rotation.y += 0.025;
        fruitGroup.rotation.x += 0.008;
    }

    // ----------------------------------------------------
    // CÁCULO DE CÁMARA EN TERCERA PERSONA (RACING STYLE)
    // ----------------------------------------------------
    if (scene && camera && snake.length > 0) {
        const headPos = gridToSpace(snake[0].x, snake[0].y);
        const head3D = { x: headPos.x, y: 0.4, z: headPos.z };

        // 1. Suavizar rotación angular Yaw (evitando problemas de wrapping 360)
        let diff = targetAngle - cameraYaw;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        cameraYaw += diff * 0.1; // Ajuste orbital de derrape

        // 2. Determinar la inclinación de la cámara (Roll) según el giro de la curva
        const targetRoll = diff * -0.16; // Inclinación en sentido contrario para fuerza centrífuga
        currentRoll += (targetRoll - currentRoll) * 0.08;

        // 3. Posición objetivo detrás de la cabeza
        const camXTarget = head3D.x - Math.sin(cameraYaw) * CAM_DISTANCE;
        const camZTarget = head3D.z - Math.cos(cameraYaw) * CAM_DISTANCE;
        const camYTarget = head3D.y + CAM_HEIGHT;

        // 4. Suavizar la transición de posición de la cámara (efecto suspensión)
        camera.position.x += (camXTarget - camera.position.x) * 0.16;
        camera.position.y += (camYTarget - camera.position.y) * 0.16;
        camera.position.z += (camZTarget - camera.position.z) * 0.16;

        // 5. Mirar un poco por delante de la cabeza para ver la pista/obstáculos
        const lookTarget = new THREE.Vector3(
            head3D.x + Math.sin(cameraYaw) * 1.8,
            head3D.y,
            head3D.z + Math.cos(cameraYaw) * 1.8
        );
        currentLookAt.lerp(lookTarget, 0.16);
        camera.lookAt(currentLookAt);

        // 6. Aplicar inclinación (Roll) después de mirar
        camera.rotateZ(currentRoll);

        // 7. Sacudida de cámara por impactos o aceleración
        if (cameraShakeIntensity > 0.01) {
            camera.position.x += (Math.random() - 0.5) * cameraShakeIntensity;
            camera.position.y += (Math.random() - 0.5) * cameraShakeIntensity;
            camera.position.z += (Math.random() - 0.5) * cameraShakeIntensity;
            cameraShakeIntensity *= 0.88;
        }
    }

    // Actualizar partículas
    updateParticles();

    // Dibujar el Minimapa / GPS 2D
    drawGPSMinimap(time);

    // Renderizar escena WebGL
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Inicializar el motor al cargar
window.addEventListener('load', () => {
    init3D();
    requestAnimationFrame(animate);
    document.getElementById('record').innerText = highScore;
});
