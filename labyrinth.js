import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Main Labyrinth class
class Labyrinth {
    constructor(containerId, labyrinthId) {
        this.containerId = containerId;
        this.labyrinthId = labyrinthId;
        this.container = document.getElementById(containerId);
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = new THREE.Raycaster();
        this.room = new WebsimSocket();
        
        this.players = {};
        this.wallTextures = null;
        this.maze = null;
        this.moveSpeed = 0.1;
        
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };
        
        this.mazeSize = 10; // Starting maze size
        this.wallHeight = 2.5;
        this.cellSize = 4;
        this.playerHeight = 1.8;
        
        // Player info
        this.clientId = this.room.party.client.id;
        this.username = this.room.party.client.username;
        this.playerPosition = new THREE.Vector3(this.cellSize/2, this.playerHeight/2, this.cellSize/2);
        
        // Initialize the labyrinth
        this.init();
    }
    
    async init() {
        // Set up the 3D scene
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        this.setupControls();
        
        // Load the labyrinth data
        await this.loadLabyrinthData();
        
        // Generate the maze
        this.generateMaze();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Start the render loop
        this.animate();
        
        // Send initial player position
        this.broadcastPosition();
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.FogExp2(0x000000, 0.02);
    }
    
    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(this.playerPosition.x, this.playerPosition.y, this.playerPosition.z);
    }
    
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
    }
    
    setupLights() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0x333333);
        this.scene.add(ambient);
        
        // Player light (follows camera)
        this.playerLight = new THREE.PointLight(0xffffff, 1, 10);
        this.playerLight.castShadow = true;
        this.camera.add(this.playerLight);
        this.scene.add(this.camera);
    }
    
    setupControls() {
        this.controls = new PointerLockControls(this.camera, this.renderer.domElement);
        
        // Lock controls on canvas click
        this.renderer.domElement.addEventListener('click', () => {
            this.controls.lock();
        });
    }
    
    async loadLabyrinthData() {
        try {
            // Get all labyrinths
            const labyrinths = this.room.collection('labyrinth').getList();
            
            // Find the current labyrinth
            this.labyrinthData = labyrinths.find(l => l.id === this.labyrinthId);
            
            if (!this.labyrinthData) {
                console.error("Labyrinth not found:", this.labyrinthId);
                return;
            }
            
            // Get wall textures
            this.wallTextures = this.labyrinthData.wallTextures;
            
            // If no wall textures, generate them
            if (!this.wallTextures) {
                const wallTexturePromptCompletion = await websim.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: `Create a JSON description of wall textures for this labyrinth. Return a JSON object with properties: primaryColor, secondaryColor, patternType, and textureDescription.`
                        },
                        {
                            role: "user",
                            content: `Based on this labyrinth, create wall texture details in JSON format: ${this.labyrinthData.detailedDescription}`
                        }
                    ],
                    json: true
                });
                
                this.wallTextures = JSON.parse(wallTexturePromptCompletion.content);
            }
            
            console.log("Loaded labyrinth data:", this.labyrinthData);
            
        } catch (error) {
            console.error("Error loading labyrinth data:", error);
        }
    }
    
    createWallTexture() {
        // Create a canvas texture based on the labyrinth's wall textures
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Use wall texture data to create a unique texture
        const { primaryColor, secondaryColor, patternType } = this.wallTextures;
        
        // Background color
        ctx.fillStyle = primaryColor || "#553333";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Apply pattern based on patternType
        ctx.fillStyle = secondaryColor || "#332211";
        
        switch (patternType) {
            case "bricks":
                this.drawBrickPattern(ctx, canvas.width, canvas.height);
                break;
            case "mosaic":
                this.drawMosaicPattern(ctx, canvas.width, canvas.height);
                break;
            case "cracks":
                this.drawCracksPattern(ctx, canvas.width, canvas.height);
                break;
            case "vines":
                this.drawVinesPattern(ctx, canvas.width, canvas.height);
                break;
            default:
                this.drawRandomPattern(ctx, canvas.width, canvas.height);
        }
        
        // Add some noise for texture
        this.addNoiseTexture(ctx, canvas.width, canvas.height);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 1);
        
        return texture;
    }
    
    drawBrickPattern(ctx, width, height) {
        const brickHeight = 20;
        const brickWidth = 40;
        const mortar = 4;
        
        ctx.fillStyle = this.wallTextures.secondaryColor;
        
        for (let y = 0; y < height; y += brickHeight + mortar) {
            let offset = (Math.floor(y / (brickHeight + mortar)) % 2) * (brickWidth / 2);
            
            for (let x = -brickWidth/2; x < width; x += brickWidth + mortar) {
                ctx.fillRect(x + offset, y, brickWidth, brickHeight);
            }
        }
    }
    
    drawMosaicPattern(ctx, width, height) {
        const tileSize = 20;
        
        for (let y = 0; y < height; y += tileSize) {
            for (let x = 0; x < width; x += tileSize) {
                if ((x + y) % (tileSize * 2) === 0) {
                    ctx.fillRect(x, y, tileSize, tileSize);
                }
            }
        }
    }
    
    drawCracksPattern(ctx, width, height) {
        ctx.strokeStyle = this.wallTextures.secondaryColor;
        ctx.lineWidth = 2;
        
        // Draw random cracks
        for (let i = 0; i < 20; i++) {
            const startX = Math.random() * width;
            const startY = Math.random() * height;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            
            let x = startX;
            let y = startY;
            
            // Create a jagged line
            for (let j = 0; j < 5; j++) {
                x += (Math.random() - 0.5) * 40;
                y += (Math.random() - 0.5) * 40;
                ctx.lineTo(x, y);
            }
            
            ctx.stroke();
        }
    }
    
    drawVinesPattern(ctx, width, height) {
        ctx.strokeStyle = this.wallTextures.secondaryColor;
        ctx.lineWidth = 3;
        
        // Draw vine-like patterns
        for (let i = 0; i < 10; i++) {
            const startX = Math.random() * width;
            const startY = 0;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            
            let x = startX;
            let y = startY;
            let amplitude = 10 + Math.random() * 20;
            
            // Create a curvy line
            for (let j = 0; j < height; j += 10) {
                x = startX + Math.sin(j * 0.05) * amplitude;
                y = j;
                ctx.lineTo(x, y);
                
                // Occasionally draw leaves
                if (Math.random() < 0.2) {
                    ctx.save();
                    ctx.fillStyle = this.wallTextures.secondaryColor;
                    ctx.translate(x, y);
                    ctx.rotate(Math.random() * Math.PI * 2);
                    ctx.beginPath();
                    ctx.ellipse(0, 0, 5, 10, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
            
            ctx.stroke();
        }
    }
    
    drawRandomPattern(ctx, width, height) {
        // Draw random shapes
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = 5 + Math.random() * 20;
            
            if (Math.random() < 0.5) {
                ctx.fillRect(x, y, size, size);
            } else {
                ctx.beginPath();
                ctx.arc(x, y, size/2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    addNoiseTexture(ctx, width, height) {
        // Add subtle noise for texture
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const noise = Math.random() * 20 - 10;
            data[i] = Math.max(0, Math.min(255, data[i] + noise));
            data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
            data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    generateMaze() {
        // Clear existing maze
        if (this.maze) {
            this.scene.remove(this.maze);
        }
        
        // Create a new maze container
        this.maze = new THREE.Group();
        this.scene.add(this.maze);
        
        // Generate a maze pattern using recursive backtracking
        const grid = this.generateMazeGrid(this.mazeSize, this.mazeSize);
        
        // Create wall texture
        const wallTexture = this.createWallTexture();
        const wallMaterial = new THREE.MeshStandardMaterial({ 
            map: wallTexture,
            roughness: 0.8,
            metalness: 0.2
        });
        
        // Create floor texture
        const floorTexture = this.createFloorTexture();
        const floorMaterial = new THREE.MeshStandardMaterial({ 
            map: floorTexture,
            roughness: 0.9,
            metalness: 0.1
        });
        
        // Create ceiling texture
        const ceilingTexture = this.createCeilingTexture();
        const ceilingMaterial = new THREE.MeshStandardMaterial({ 
            map: ceilingTexture,
            roughness: 0.7,
            metalness: 0.1
        });
        
        // Build maze geometry
        const wallGeometry = new THREE.BoxGeometry(this.cellSize, this.wallHeight, 0.2);
        const floorGeometry = new THREE.PlaneGeometry(this.cellSize, this.cellSize);
        const ceilingGeometry = new THREE.PlaneGeometry(this.cellSize, this.cellSize);
        
        // Create the maze walls, floor, and ceiling
        for (let z = 0; z < this.mazeSize; z++) {
            for (let x = 0; x < this.mazeSize; x++) {
                const cell = grid[z][x];
                const posX = x * this.cellSize;
                const posZ = z * this.cellSize;
                
                // Create floor for each cell
                const floor = new THREE.Mesh(floorGeometry, floorMaterial);
                floor.position.set(posX + this.cellSize/2, 0, posZ + this.cellSize/2);
                floor.rotation.x = -Math.PI / 2;
                floor.receiveShadow = true;
                this.maze.add(floor);
                
                // Create ceiling for each cell
                const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
                ceiling.position.set(posX + this.cellSize/2, this.wallHeight, posZ + this.cellSize/2);
                ceiling.rotation.x = Math.PI / 2;
                ceiling.receiveShadow = true;
                this.maze.add(ceiling);
                
                // North wall (if no passage)
                if (!cell.north) {
                    const northWall = new THREE.Mesh(wallGeometry, wallMaterial);
                    northWall.position.set(posX + this.cellSize/2, this.wallHeight/2, posZ);
                    northWall.castShadow = true;
                    northWall.receiveShadow = true;
                    this.maze.add(northWall);
                }
                
                // East wall (if no passage)
                if (!cell.east) {
                    const eastWall = new THREE.Mesh(wallGeometry, wallMaterial);
                    eastWall.position.set(posX + this.cellSize, this.wallHeight/2, posZ + this.cellSize/2);
                    eastWall.rotation.y = Math.PI / 2;
                    eastWall.castShadow = true;
                    eastWall.receiveShadow = true;
                    this.maze.add(eastWall);
                }
                
                // South wall (if no passage and at the edge)
                if (z === this.mazeSize - 1 && !cell.south) {
                    const southWall = new THREE.Mesh(wallGeometry, wallMaterial);
                    southWall.position.set(posX + this.cellSize/2, this.wallHeight/2, posZ + this.cellSize);
                    southWall.castShadow = true;
                    southWall.receiveShadow = true;
                    this.maze.add(southWall);
                }
                
                // West wall (if no passage and at the edge)
                if (x === 0 && !cell.west) {
                    const westWall = new THREE.Mesh(wallGeometry, wallMaterial);
                    westWall.position.set(posX, this.wallHeight/2, posZ + this.cellSize/2);
                    westWall.rotation.y = Math.PI / 2;
                    westWall.castShadow = true;
                    westWall.receiveShadow = true;
                    this.maze.add(westWall);
                }
            }
        }
    }
    
    createFloorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Base color
        const baseColor = this.modifyColor(this.wallTextures.primaryColor, -30);
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add pattern
        ctx.fillStyle = this.modifyColor(this.wallTextures.secondaryColor, -20);
        
        // Draw some dots/specs
        for (let i = 0; i < 500; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = Math.random() * 2;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Add some scratches
        ctx.strokeStyle = this.modifyColor(this.wallTextures.secondaryColor, -10);
        ctx.lineWidth = 1;
        
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const length = 10 + Math.random() * 30;
            const angle = Math.random() * Math.PI * 2;
            
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
            ctx.stroke();
        }
        
        // Add some noise
        this.addNoiseTexture(ctx, canvas.width, canvas.height);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        return texture;
    }
    
    createCeilingTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Base color (darker than walls)
        const baseColor = this.modifyColor(this.wallTextures.primaryColor, -50);
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add some cracks
        ctx.strokeStyle = this.modifyColor(this.wallTextures.secondaryColor, -30);
        ctx.lineWidth = 1;
        
        for (let i = 0; i < 15; i++) {
            const startX = Math.random() * canvas.width;
            const startY = Math.random() * canvas.height;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            
            let x = startX;
            let y = startY;
            
            for (let j = 0; j < 3; j++) {
                x += (Math.random() - 0.5) * 60;
                y += (Math.random() - 0.5) * 60;
                ctx.lineTo(x, y);
            }
            
            ctx.stroke();
        }
        
        // Add some subtle stains
        ctx.fillStyle = this.modifyColor(this.wallTextures.secondaryColor, -40);
        
        for (let i = 0; i < 10; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = 10 + Math.random() * 30;
            
            ctx.beginPath();
            ctx.globalAlpha = 0.3;
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        
        // Add some noise
        this.addNoiseTexture(ctx, canvas.width, canvas.height);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        return texture;
    }
    
    modifyColor(color, amount) {
        // Helper function to lighten or darken a color
        if (!color || color.charAt(0) !== '#') {
            return amount > 0 ? '#555555' : '#222222';
        }
        
        let r = parseInt(color.substr(1, 2), 16);
        let g = parseInt(color.substr(3, 2), 16);
        let b = parseInt(color.substr(5, 2), 16);
        
        r = Math.max(0, Math.min(255, r + amount));
        g = Math.max(0, Math.min(255, g + amount));
        b = Math.max(0, Math.min(255, b + amount));
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    generateMazeGrid(width, height) {
        // Create empty grid
        const grid = Array(height).fill().map(() => Array(width).fill().map(() => ({
            visited: false,
            north: false,  // passage to north
            east: false,   // passage to east
            south: false,  // passage to south
            west: false    // passage to west
        })));
        
        // Recursive backtracking algorithm
        const stack = [];
        let currentX = 0;
        let currentZ = 0;
        grid[currentZ][currentX].visited = true;
        
        const visit = (x, z) => {
            stack.push({ x, z });
            grid[z][x].visited = true;
            
            // Shuffle directions
            const directions = [
                { dx: 0, dz: -1, direction: 'north', opposite: 'south' },
                { dx: 1, dz: 0, direction: 'east', opposite: 'west' },
                { dx: 0, dz: 1, direction: 'south', opposite: 'north' },
                { dx: -1, dz: 0, direction: 'west', opposite: 'east' }
            ].sort(() => Math.random() - 0.5);
            
            for (const { dx, dz, direction, opposite } of directions) {
                const newX = x + dx;
                const newZ = z + dz;
                
                if (newX >= 0 && newX < width && newZ >= 0 && newZ < height && !grid[newZ][newX].visited) {
                    // Create passage
                    grid[z][x][direction] = true;
                    grid[newZ][newX][opposite] = true;
                    
                    visit(newX, newZ);
                }
            }
        };
        
        visit(currentX, currentZ);
        
        return grid;
    }
    
    expandMaze() {
        // Generate new sections as player approaches edges
        const playerMazeX = Math.floor(this.playerPosition.x / this.cellSize);
        const playerMazeZ = Math.floor(this.playerPosition.z / this.cellSize);
        
        // Check if player is near the edge of the current maze
        const edgeThreshold = 3; // How close to the edge before expanding
        
        if (playerMazeX > this.mazeSize - edgeThreshold || 
            playerMazeZ > this.mazeSize - edgeThreshold) {
            
            // Increase maze size
            this.mazeSize += 5;
            
            // Regenerate the maze
            this.generateMaze();
            
            console.log("Expanded maze to size:", this.mazeSize);
            
            // Notify other players of the expansion
            this.room.send({
                type: "mazeExpanded",
                newSize: this.mazeSize,
                echo: true
            });
        }
    }
    
    setupEventListeners() {
        // Keyboard controls
        window.addEventListener('keydown', (event) => {
            switch (event.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.forward = true;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.backward = true;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = true;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = true;
                    break;
            }
        });
        
        window.addEventListener('keyup', (event) => {
            switch (event.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.forward = false;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.backward = false;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = false;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = false;
                    break;
            }
        });
        
        // Mobile controls
        document.getElementById('control-up').addEventListener('touchstart', () => { this.keys.forward = true; });
        document.getElementById('control-down').addEventListener('touchstart', () => { this.keys.backward = true; });
        document.getElementById('control-left').addEventListener('touchstart', () => { this.keys.left = true; });
        document.getElementById('control-right').addEventListener('touchstart', () => { this.keys.right = true; });
        
        document.getElementById('control-up').addEventListener('touchend', () => { this.keys.forward = false; });
        document.getElementById('control-down').addEventListener('touchend', () => { this.keys.backward = false; });
        document.getElementById('control-left').addEventListener('touchend', () => { this.keys.left = false; });
        document.getElementById('control-right').addEventListener('touchend', () => { this.keys.right = false; });
        
        // Also handle mouse clicks on mobile controls
        document.getElementById('control-up').addEventListener('mousedown', () => { this.keys.forward = true; });
        document.getElementById('control-down').addEventListener('mousedown', () => { this.keys.backward = true; });
        document.getElementById('control-left').addEventListener('mousedown', () => { this.keys.left = true; });
        document.getElementById('control-right').addEventListener('mousedown', () => { this.keys.right = true; });
        
        document.getElementById('control-up').addEventListener('mouseup', () => { this.keys.forward = false; });
        document.getElementById('control-down').addEventListener('mouseup', () => { this.keys.backward = false; });
        document.getElementById('control-left').addEventListener('mouseup', () => { this.keys.left = false; });
        document.getElementById('control-right').addEventListener('mouseup', () => { this.keys.right = false; });
        
        // Window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        });
        
        // WebSocket event listeners
        this.room.onmessage = (event) => {
            const data = event.data;
            
            switch (data.type) {
                case "playerPosition":
                    this.updateOtherPlayerPosition(data);
                    break;
                case "mazeExpanded":
                    // Only update if another player expanded the maze and it's bigger than ours
                    if (data.clientId !== this.clientId && data.newSize > this.mazeSize) {
                        this.mazeSize = data.newSize;
                        this.generateMaze();
                    }
                    break;
            }
        };
    }
    
    updateOtherPlayerPosition(data) {
        // Skip our own updates
        if (data.clientId === this.clientId) return;
        
        // Create or update other player representation
        if (!this.players[data.clientId]) {
            // Create a new player avatar
            const avatarGeometry = new THREE.CapsuleGeometry(0.3, 1.2, 4, 8);
            const avatarMaterial = new THREE.MeshStandardMaterial({ color: this.getPlayerColor(data.clientId) });
            const avatar = new THREE.Mesh(avatarGeometry, avatarMaterial);
            
            // Add username text above player
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.font = '30px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(data.username, canvas.width/2, canvas.height/2);
            
            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
            const nameTag = new THREE.Sprite(material);
            nameTag.scale.set(2, 0.5, 1);
            nameTag.position.y = 1.5;
            
            avatar.add(nameTag);
            this.scene.add(avatar);
            
            this.players[data.clientId] = {
                avatar,
                lastUpdate: Date.now()
            };
        }
        
        // Update player position
        const player = this.players[data.clientId];
        player.avatar.position.set(data.x, data.y, data.z);
        player.avatar.rotation.y = data.rotationY;
        player.lastUpdate = Date.now();
    }
    
    getPlayerColor(clientId) {
        // Generate a consistent color based on client ID
        let hash = 0;
        for (let i = 0; i < clientId.length; i++) {
            hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const hue = Math.abs(hash % 360);
        return new THREE.Color(`hsl(${hue}, 70%, 60%)`);
    }
    
    updatePlayerMovement() {
        if (!this.controls.isLocked) return;
        
        const moveDistance = this.moveSpeed;
        
        // Get camera direction
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        direction.y = 0;
        direction.normalize();
        
        // Get right vector
        const right = new THREE.Vector3();
        right.crossVectors(this.camera.up, direction).normalize();
        
        // Calculate movement vector
        const moveVector = new THREE.Vector3(0, 0, 0);
        
        if (this.keys.forward) moveVector.add(direction);
        if (this.keys.backward) moveVector.sub(direction);
        if (this.keys.left) moveVector.sub(right);
        if (this.keys.right) moveVector.add(right);
        
        if (moveVector.length() > 0) {
            moveVector.normalize();
            
            // Calculate new position
            const newPosition = this.playerPosition.clone().add(moveVector.multiplyScalar(moveDistance));
            
            // Check for collisions
            if (!this.checkCollision(newPosition)) {
                // Update position
                this.playerPosition.copy(newPosition);
                this.camera.position.copy(new THREE.Vector3(newPosition.x, this.playerHeight/2, newPosition.z));
                
                // Broadcast position update
                this.broadcastPosition();
                
                // Check if we need to expand the maze
                this.expandMaze();
            }
        }
    }
    
    checkCollision(position) {
        // Ray casting in different directions to check for wall collisions
        const directions = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, -1),
            new THREE.Vector3(1, 0, 1).normalize(),
            new THREE.Vector3(1, 0, -1).normalize(),
            new THREE.Vector3(-1, 0, 1).normalize(),
            new THREE.Vector3(-1, 0, -1).normalize()
        ];
        
        const playerRadius = 0.3;
        
        for (const dir of directions) {
            this.raycaster.set(position, dir);
            const intersects = this.raycaster.intersectObjects(this.maze.children);
            
            if (intersects.length > 0 && intersects[0].distance < playerRadius) {
                return true;
            }
        }
        
        return false;
    }
    
    broadcastPosition() {
        // Only broadcast occasionally to limit network traffic
        const now = Date.now();
        if (now - this.lastBroadcast < 100) return;
        this.lastBroadcast = now;
        
        this.room.send({
            type: "playerPosition",
            x: this.playerPosition.x,
            y: this.playerPosition.y,
            z: this.playerPosition.z,
            rotationY: this.camera.rotation.y,
            echo: false
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update player movement
        this.updatePlayerMovement();
        
        // Clean up stale players
        this.cleanupPlayers();
        
        // Render scene
        this.renderer.render(this.scene, this.camera);
    }
    
    cleanupPlayers() {
        const now = Date.now();
        
        for (const clientId in this.players) {
            const player = this.players[clientId];
            
            // Remove players who haven't updated in over 10 seconds
            if (now - player.lastUpdate > 10000) {
                this.scene.remove(player.avatar);
                delete this.players[clientId];
            }
        }
    }
}

// Initialize the labyrinth when a labyrinth container exists
function initLabyrinthApp() {
    const container = document.getElementById('labyrinth-container');
    
    if (container) {
        const labyrinthId = container.getAttribute('data-labyrinth-id');
        if (labyrinthId) {
            new Labyrinth('labyrinth-canvas', labyrinthId);
        }
    }
}

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initLabyrinthApp);

// Also initialize when the container appears (for React)
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
            const container = document.getElementById('labyrinth-container');
            if (container) {
                initLabyrinthApp();
            }
        }
    });
});

observer.observe(document.body, { childList: true, subtree: true });

