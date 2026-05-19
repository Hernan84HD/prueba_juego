// 3D Snake Cyber Arcade - Engine & Gameplay Logic

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
let mouseX = 0, mouseY = 0;
let targetCameraRotation = { x: -0.85, y: 0 };
let currentCameraRotation = { x: -0.85, y: 0 };

// Audio Context (Sintetizador Web Audio API)
let audioCtx = null;
const soundToggle = document.getElementById('soundToggle');

// Inicializar el Audio Context al interactuar
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Sintetizar sonidos retro de arcade
function playSound(type) {
    if (!audioCtx || (soundToggle && !soundToggle.checked)) return;
    
    // Resume si está suspendido por políticas de autoejecución del navegador
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'eat') {
        // Tono retro alegre y ascendente
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'eat_special') {
        // Sonido centelleante agudo
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1600, now + 0.25);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
    } else if (type === 'turn') {
        // Pequeño clic de movimiento
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.setValueAtTime(100, now + 0.03);
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'level') {
        // Fanfarria corta de tres tonos ascendentes
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(400, now + 0.1);
        osc.frequency.setValueAtTime(600, now + 0.2);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
    } else if (type === 'gameover') {
        // Barrido descendente dramático
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.6);
        gainNode.gain.setValueAtTime(0.25, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
    }
}

// Inicializar el motor 3D de Three.js
function init3D() {
    const container = document.getElementById('gameContainer3D');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Escena
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05050c, 0.035);

    // 2. Cámara (Perspectiva)
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    resetCameraPosition();

    // 3. Renderer WebGL
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x05050c, 1);
    
    // Limpiar canvas anterior si existe e inyectar el nuevo
    const canvasElement = document.getElementById('webglCanvas');
    if (canvasElement) canvasElement.remove();
    renderer.domElement.id = 'webglCanvas';
    container.appendChild(renderer.domElement);

    // 4. Luces
    const ambientLight = new THREE.AmbientLight(0x1a1a3a, 1.2);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0x00f0ff, 0.8);
    dirLight.position.set(0, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Luz dinámica neón verde acoplada a la cabeza
    headLight = new THREE.PointLight(0x39ff14, 2.5, 8, 1.5);
    scene.add(headLight);

    // Luz dinámica neón roja acoplada a la fruta
    fruitLight = new THREE.PointLight(0xff007f, 3.5, 10, 1.5);
    scene.add(fruitLight);

    // 5. Entorno - Plataforma y Rejilla
    createArena();

    // 6. Grupos de objetos
    snakeGroup = new THREE.Group();
    scene.add(snakeGroup);

    fruitGroup = new THREE.Group();
    scene.add(fruitGroup);
    createFruitMesh();

    // 7. Eventos
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('mousemove', onMouseMove);
}

// Crear la plataforma flotante 3D del juego
function createArena() {
    const size = GRID_SIZE * CELL_SIZE;

    // Plataforma base (cristal oscuro)
    const platformGeom = new THREE.BoxGeometry(size, 0.4, size);
    const platformMat = new THREE.MeshStandardMaterial({
        color: 0x0a0a1a,
        roughness: 0.1,
        metalness: 0.8,
        transparent: true,
        opacity: 0.85
    });
    const platform = new THREE.Mesh(platformGeom, platformMat);
    platform.position.y = -0.2;
    platform.receiveShadow = true;
    scene.add(platform);

    // Rejilla de neón rosa
    const gridHelper = new THREE.GridHelper(size, GRID_SIZE, 0xff007f, 0x0d0d26);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Marco exterior brillante cian
    const borderGeom = new THREE.BoxGeometry(size + 0.3, 0.5, size + 0.3);
    // Crear bordes con líneas sólidas para resaltar el neón
    const edges = new THREE.EdgesGeometry(borderGeom);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 });
    const borderLines = new THREE.LineSegments(edges, lineMat);
    borderLines.position.y = -0.15;
    scene.add(borderLines);
}

// Convertir coordenadas de matriz local en coordenadas de espacio 3D
function gridToSpace(x, y) {
    return {
        x: (x - (GRID_SIZE - 1) / 2) * CELL_SIZE,
        z: (y - (GRID_SIZE - 1) / 2) * CELL_SIZE
    };
}

// Crear la malla de la fruta en 3D
function createFruitMesh() {
    // Limpiar modelo anterior
    while(fruitGroup.children.length > 0) {
        fruitGroup.remove(fruitGroup.children[0]);
    }

    const color = isSpecialFruit ? 0xfff01f : 0xff007f; // Amarillo o rosa
    
    // Cuerpo principal de la fruta (esfera)
    const bodyGeom = new THREE.DodecahedronGeometry(0.45, 1);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.2,
        metalness: 0.9
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    fruitGroup.add(body);

    // Tallo (pequeño cilindro)
    const stemGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });
    const stem = new THREE.Mesh(stemGeom, stemMat);
    stem.position.y = 0.5;
    stem.rotation.z = -0.2;
    fruitGroup.add(stem);

    // Hoja (cono estilizado)
    const leafGeom = new THREE.ConeGeometry(0.12, 0.28, 4);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x39ff14, roughness: 0.6 });
    const leaf = new THREE.Mesh(leafGeom, leafMat);
    leaf.position.set(0.1, 0.55, 0);
    leaf.rotation.z = 0.8;
    fruitGroup.add(leaf);

    // Posicionar fruta
    updateFruitPosition3D();
}

// Actualizar la posición de la fruta en 3D
function updateFruitPosition3D() {
    const pos = gridToSpace(fruit.x, fruit.y);
    fruitGroup.position.set(pos.x, 0.45, pos.z);
    
    // Acoplar la luz
    fruitLight.color.setHex(isSpecialFruit ? 0xfff01f : 0xff007f);
    fruitLight.position.set(pos.x, 0.8, pos.z);
}

// Dibujar y actualizar los segmentos de la serpiente
function drawSnake3D() {
    // Eliminar segmentos visuales previos
    while(snakeGroup.children.length > 0) {
        snakeGroup.remove(snakeGroup.children[0]);
    }

    snake.forEach((part, index) => {
        const isHead = index === 0;
        const pos = gridToSpace(part.x, part.y);
        
        let geom, mat;

        if (isHead) {
            // Cabeza (Cubo con esquinas más marcadas)
            geom = new THREE.BoxGeometry(0.9, 0.9, 0.9);
            mat = new THREE.MeshPhysicalMaterial({
                color: 0x39ff14,
                emissive: 0x39ff14,
                emissiveIntensity: 0.25,
                metalness: 0.8,
                roughness: 0.1,
                clearcoat: 1.0,
                clearcoatRoughness: 0.1
            });
        } else {
            // Cuerpo (Suave amortiguación de escala)
            const scale = Math.max(0.6, 0.88 - (index * 0.015));
            geom = new THREE.BoxGeometry(scale, scale, scale);
            
            // Efecto degradado neón verde-cian a lo largo del cuerpo
            const ratio = index / snake.length;
            const segmentColor = new THREE.Color().lerpColors(
                new THREE.Color(0x39ff14), // Verde brillante
                new THREE.Color(0x00f0ff), // Cian neón
                ratio
            );

            mat = new THREE.MeshStandardMaterial({
                color: segmentColor,
                roughness: 0.2,
                metalness: 0.8
            });
        }

        const segment = new THREE.Mesh(geom, mat);
        segment.position.set(pos.x, 0.45, pos.z);
        segment.castShadow = true;
        segment.receiveShadow = true;

        // Añadir ojos brillantes si es la cabeza
        if (isHead) {
            const eyeGeom = new THREE.SphereGeometry(0.12, 8, 8);
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff }); // Ojos brillantes cian
            
            const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
            const rightEye = new THREE.Mesh(eyeGeom, eyeMat);

            // Orientar ojos basándose en la dirección del movimiento
            if (direction === 'RIGHT') {
                leftEye.position.set(0.4, 0.15, -0.25);
                rightEye.position.set(0.4, 0.15, 0.25);
            } else if (direction === 'LEFT') {
                leftEye.position.set(-0.4, 0.15, 0.25);
                rightEye.position.set(-0.4, 0.15, -0.25);
            } else if (direction === 'UP') {
                leftEye.position.set(-0.25, 0.15, -0.4);
                rightEye.position.set(0.25, 0.15, -0.4);
            } else if (direction === 'DOWN') {
                leftEye.position.set(0.25, 0.15, 0.4);
                rightEye.position.set(-0.25, 0.15, 0.4);
            }

            segment.add(leftEye);
            segment.add(rightEye);

            // Acoplar luz a la cabeza
            headLight.position.set(pos.x, 1.0, pos.z);
        }

        snakeGroup.add(segment);
    });
}

// Crear explosión de partículas 3D
function spawnParticles(x, z, special = false) {
    const particleCount = special ? 35 : 20;
    const color = special ? 0xfff01f : 0xff007f; // Dorado o Rosa

    const geom = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const mat = new THREE.MeshBasicMaterial({ color: color });

    for (let i = 0; i < particleCount; i++) {
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(
            x + (Math.random() * 0.4 - 0.2),
            0.5,
            z + (Math.random() * 0.4 - 0.2)
        );

        scene.add(mesh);

        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.08 + 0.04;
        
        particlesArray.push({
            mesh: mesh,
            velocity: new THREE.Vector3(
                Math.cos(angle) * speed,
                Math.random() * 0.08 + 0.05, // Velocidad hacia arriba
                Math.sin(angle) * speed
            ),
            gravity: -0.005,
            life: 30 + Math.floor(Math.random() * 15),
            maxLife: 45
        });
    }
}

// Actualizar la física de las partículas en 3D
function updateParticles() {
    for (let i = particlesArray.length - 1; i >= 0; i--) {
        const p = particlesArray[i];
        
        // Aplicar velocidad y gravedad
        p.velocity.y += p.gravity;
        p.mesh.position.add(p.velocity);
        
        // Reducir escala gradualmente
        p.life--;
        const ratio = p.life / p.maxLife;
        p.mesh.scale.set(ratio, ratio, ratio);

        // Eliminar al agotarse su tiempo de vida
        if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            particlesArray.splice(i, 1);
        }
    }
}

// Reiniciar posición de la cámara original
function resetCameraPosition() {
    camera.position.set(0, 18, 16);
    camera.lookAt(0, 0, 0);
}

// Controladores de eventos de entrada y control
document.addEventListener('keydown', handleKeyDown);

function handleKeyDown(event) {
    initAudio(); // Activar audio al primer teclado pulsado
    const key = event.key;

    if (key === 'ArrowUp' && direction !== 'DOWN') {
        nextDirection = 'UP';
    } else if (key === 'ArrowDown' && direction !== 'UP') {
        nextDirection = 'DOWN';
    } else if (key === 'ArrowLeft' && direction !== 'RIGHT') {
        nextDirection = 'LEFT';
    } else if (key === 'ArrowRight' && direction !== 'LEFT') {
        nextDirection = 'RIGHT';
    } else if (key.toLowerCase() === 'p' || key === ' ') {
        togglePause();
        event.preventDefault();
    }
}

// Controles del D-Pad Táctil / Virtual
document.getElementById('dpadUp').addEventListener('click', () => { initAudio(); if (direction !== 'DOWN') nextDirection = 'UP'; });
document.getElementById('dpadDown').addEventListener('click', () => { initAudio(); if (direction !== 'UP') nextDirection = 'DOWN'; });
document.getElementById('dpadLeft').addEventListener('click', () => { initAudio(); if (direction !== 'RIGHT') nextDirection = 'LEFT'; });
document.getElementById('dpadRight').addEventListener('click', () => { initAudio(); if (direction !== 'LEFT') nextDirection = 'RIGHT'; });

// Lógica principal del bucle del juego (Physics Tick)
function gameLoop() {
    if (isPaused || isGameOver) return;

    // Registrar giros de sonido
    if (direction !== nextDirection) {
        playSound('turn');
        direction = nextDirection;
        
        // Inclinar cámara en base a la dirección
        if (direction === 'LEFT') targetCameraRotation.y = 0.15;
        else if (direction === 'RIGHT') targetCameraRotation.y = -0.15;
        else targetCameraRotation.y = 0;
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
        
        // Activar sacudida de pantalla y chispas
        cameraShakeIntensity = isSpecialFruit ? 0.8 : 0.35;
        const pos = gridToSpace(fruit.x, fruit.y);
        spawnParticles(pos.x, pos.z, isSpecialFruit);
        
        // Sonido de comer
        playSound(isSpecialFruit ? 'eat_special' : 'eat');
        
        updateScore();
        generateNewFruit();
        
        // Aumentar nivel y velocidad cada 50 puntos
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
    
    // Colisión con bordes del tablero
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        return true;
    }
    
    // Colisión con sí misma
    for (let i = 1; i < snake.length; i++) {
        if (snake[i].x === head.x && snake[i].y === head.y) {
            return true;
        }
    }
    return false;
}

// Generar una fruta en una posición libre aleatoria
function generateNewFruit() {
    let attempts = 0;
    let newFruit;
    let onSnake = true;

    while (onSnake && attempts < 100) {
        newFruit = {
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE)
        };
        
        // Verificar si colisiona con el cuerpo de la serpiente
        onSnake = snake.some(part => part.x === newFruit.x && part.y === newFruit.y);
        attempts++;
    }

    fruit = newFruit;
    
    // 15% de probabilidad de generar una fruta dorada especial
    isSpecialFruit = Math.random() < 0.15;
    
    createFruitMesh();
}

// Gestionar fin del juego (Game Over)
function triggerGameOver() {
    isGameOver = true;
    clearTimeout(gameTimeout);
    
    // Sonido de caída
    playSound('gameover');
    cameraShakeIntensity = 1.5; // Fuerte sacudida final
    
    // Guardar récord si aplica
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snake3d_highscore', highScore);
        document.getElementById('record').innerText = highScore;
    }

    // Mostrar HUD final
    document.getElementById('finalScore').innerText = score;
    document.getElementById('gameOverOverlay').classList.add('active');
}

// Actualizar HUD de puntuación
function updateScore() {
    document.getElementById('score').innerText = score;
}

// Actualizar nivel de dificultad
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

// Activar/Desactivar pausa
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

// Iniciar/Reiniciar el juego completamente
function restartGame() {
    initAudio();
    
    // Restablecer variables
    snake = [{ x: 10, y: 10 }];
    direction = 'RIGHT';
    nextDirection = 'RIGHT';
    score = 0;
    gameSpeed = 160;
    level = 'Fácil';
    isPaused = false;
    isGameOver = false;
    hasStarted = true;

    // Limpiar partículas previas
    particlesArray.forEach(p => scene.remove(p.mesh));
    particlesArray = [];

    // Ocultar overlays
    document.getElementById('gameOverOverlay').classList.remove('active');
    document.getElementById('startOverlay').classList.remove('active');
    document.getElementById('pauseOverlay').classList.remove('active');

    updateScore();
    document.getElementById('level').innerText = level;
    document.getElementById('record').innerText = highScore;

    generateNewFruit();
    drawSnake3D();

    // Comenzar bucle de físicas
    clearTimeout(gameTimeout);
    gameLoop();
}

// Enlazar los botones de reinicio y de inicio
document.getElementById('btnStart').addEventListener('click', restartGame);
document.getElementById('btnRetry').addEventListener('click', restartGame);
document.getElementById('btnResume').addEventListener('click', togglePause);
document.getElementById('btnPause').addEventListener('click', togglePause);

// Adaptar la ventana al redimensionar
function onWindowResize() {
    const container = document.getElementById('gameContainer3D');
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Capturar el movimiento del mouse para la inclinación 3D
function onMouseMove(event) {
    // Obtener la posición del mouse normalizada (-1 a 1)
    mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(event.clientY / window.innerHeight) * 2 - 1;
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

    // Efecto de inclinación de la cámara interactiva por cursor
    const lerpFactor = 0.05;
    
    // Modificar la rotación objetivo de la cámara por cursor
    const targetXRot = -0.85 + (mouseY * 0.08);
    const targetYRot = (mouseX * 0.08) + targetCameraRotation.y;
    
    // Suavizado Lerp
    currentCameraRotation.x += (targetXRot - currentCameraRotation.x) * lerpFactor;
    currentCameraRotation.y += (targetYRot - currentCameraRotation.y) * lerpFactor;

    // Calcular posición de la cámara alrededor de la plataforma basada en la rotación
    camera.position.x = Math.sin(currentCameraRotation.y) * 16;
    camera.position.z = Math.cos(currentCameraRotation.y) * 16;
    camera.position.y = 18 + (currentCameraRotation.x + 0.85) * 6;
    camera.lookAt(0, 0, 0);

    // Aplicar efecto de sacudida de pantalla si corresponde
    if (cameraShakeIntensity > 0.01) {
        camera.position.x += (Math.random() - 0.5) * cameraShakeIntensity;
        camera.position.y += (Math.random() - 0.5) * cameraShakeIntensity;
        camera.position.z += (Math.random() - 0.5) * cameraShakeIntensity;
        cameraShakeIntensity *= 0.88; // Desvanecimiento rápido
    }

    // Actualizar partículas
    updateParticles();

    // Renderizar escena
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Inicializar el motor al cargar
window.addEventListener('load', () => {
    init3D();
    requestAnimationFrame(animate);
    
    // Inicializar HUD de récord personal
    document.getElementById('record').innerText = highScore;
});
