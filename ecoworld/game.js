import * as THREE from 'three';

// Configuration
const SUPABASE_URL = 'https://yjfmwtgeasenmghjwjij.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqZm13dGdlYXNlbm1naGp3amlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDg4ODUsImV4cCI6MjA5MjEyNDg4NX0.IHb1Z2RkwuCX9H0LHO0DJygSxyeB3_iqUJaivAao86I';

const GRID_SIZE = 12;
const TILE_SIZE = 1;
const TILE_HEIGHT = 0.5;

const PALETTE = {
    grass: 0x639922,
    grassDark: 0x3b6d11,
    sand: 0xe8c872,
    waterShallow: 0x4fc3f7,
    waterDeep: 0x0288d1,
    mountain: 0x78909c,
    snow: 0xffffff,
    wood: 0x8d6e63,
    leaves: 0x4caf50,
    highlight: 0x7fd63a,
    error: 0xf26666,
    metal: 0xb0bec5,
    glass: 0x81d4fa,
    plastic: 0xffcc80,
    paper: 0xfff59d
};

const RESOURCES = {
    'can': { name: 'Aluminum Can', icon: '🥤', color: PALETTE.metal },
    'plastic bag': { name: 'Plastic Bag', icon: '🛍️', color: PALETTE.plastic },
    'cup': { name: 'Yogurt Cup', icon: '🥛', color: PALETTE.plastic },
    'carton': { name: 'Pizza Box', icon: '🍕', color: PALETTE.paper },
    'bottle': { name: 'Glass Bottle', icon: '🍾', color: PALETTE.glass }
};

const BUILDINGS = {
    'greenhouse': {
        name: 'Plastic Greenhouse',
        cost: { 'plastic bag': 5, 'cup': 2 },
        epRate: 10,
        color: PALETTE.plastic,
        icon: '🌱'
    },
    'workshop': {
        name: 'Metal Workshop',
        cost: { 'can': 10 },
        epRate: 15,
        color: PALETTE.metal,
        icon: '⚒️'
    },
    'observatory': {
        name: 'Glass Observatory',
        cost: { 'bottle': 8 },
        epRate: 20,
        color: PALETTE.glass,
        icon: '🔭'
    },
    'recycling_center': {
        name: 'Recycling Center',
        cost: { 'carton': 5, 'can': 5, 'plastic bag': 5 },
        epRate: 30,
        color: PALETTE.grass,
        icon: '♻️'
    },
    'solar_park': {
        name: 'Solar Park',
        cost: { 'bottle': 10, 'can': 15 },
        epRate: 50,
        color: PALETTE.waterShallow,
        icon: '☀️'
    },
    'paper_mill': {
        name: 'Paper Mill',
        cost: { 'carton': 15 },
        epRate: 25,
        color: PALETTE.paper,
        icon: '📝'
    }
};

// Game State
let state = {
    resources: { 'can': 0, 'plastic bag': 0, 'cup': 0, 'carton': 0, 'bottle': 0 },
    ep: 0,
    epRate: 0,
    buildings: [],
    selectedBuilding: null,
    placementMode: false,
    hoveredTile: null,
    tiles: new Map()
};

// Three.js setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue
scene.fog = new THREE.Fog(0x87ceeb, 10, 50);

const aspect = window.innerWidth / window.innerHeight;
const d = 10;
const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
camera.position.set(20, 20, 20);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(20, 40, 20);
dirLight.castShadow = true;
dirLight.shadow.camera.left = -15;
dirLight.shadow.camera.right = 15;
dirLight.shadow.camera.top = 15;
dirLight.shadow.camera.bottom = -15;
scene.add(dirLight);

// Raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const planeGeometry = new THREE.PlaneGeometry(100, 100);
planeGeometry.rotateX(-Math.PI / 2);
const invisiblePlane = new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial({ visible: false }));
scene.add(invisiblePlane);

// Groups
const worldGroup = new THREE.Group();
scene.add(worldGroup);
const tilesGroup = new THREE.Group();
worldGroup.add(tilesGroup);
const buildingsGroup = new THREE.Group();
worldGroup.add(buildingsGroup);

// Ghost Building Preview
let ghostBuilding = new THREE.Group();
scene.add(ghostBuilding);

// Supabase
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Initialize Game
async function init() {
    generateTerrain();
    setupUI();
    setupControls();
    
    document.getElementById('loading-bar').style.width = '50%';
    
    if (supabaseClient) {
        const { data: session } = await supabaseClient.auth.getSession();
        if (session && session.session) {
            await loadUserData(session.session.user.id);
        } else {
            document.getElementById('login-prompt').style.display = 'block';
            loadDemoData();
        }
    } else {
        loadDemoData();
    }
    
    document.getElementById('loading-bar').style.width = '100%';
    setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
    }, 500);

    updateHUD();
    setInterval(tick, 1000); // EP Tick
    animate();
}

function generateTerrain() {
    const center = GRID_SIZE / 2;
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
            const dist = Math.sqrt(Math.pow(x - center, 2) + Math.pow(z - center, 2));
            
            let type = 'waterDeep';
            let height = TILE_HEIGHT * 0.5;
            let color = PALETTE.waterDeep;

            if (dist < center - 3) {
                type = 'grass';
                height = TILE_HEIGHT;
                color = Math.random() > 0.5 ? PALETTE.grass : PALETTE.grassDark;
            } else if (dist < center - 1) {
                type = 'sand';
                height = TILE_HEIGHT * 0.8;
                color = PALETTE.sand;
            } else if (dist < center) {
                type = 'waterShallow';
                height = TILE_HEIGHT * 0.6;
                color = PALETTE.waterShallow;
            }

            const geo = new THREE.BoxGeometry(TILE_SIZE, height, TILE_SIZE);
            const mat = new THREE.MeshLambertMaterial({ color: color });
            
            if (type.startsWith('water')) {
                mat.transparent = true;
                mat.opacity = 0.8;
            }

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x * TILE_SIZE - (GRID_SIZE/2), height / 2, z * TILE_SIZE - (GRID_SIZE/2));
            mesh.receiveShadow = true;
            mesh.castShadow = !type.startsWith('water');
            
            // Add tile data
            mesh.userData = { x, z, type, occupied: false };
            state.tiles.set(`${x},${z}`, mesh);
            tilesGroup.add(mesh);

            // Decorations
            if (type === 'grass' && Math.random() < 0.2) {
                addTree(mesh.position.x, mesh.position.y + height/2, mesh.position.z);
                mesh.userData.occupied = true; // Trees block placement
            }
        }
    }
}

function addTree(x, y, z) {
    const trunkGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.2);
    const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.wood });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, y + 0.1, z);
    trunk.castShadow = true;

    const leavesGeo = new THREE.ConeGeometry(0.2, 0.4);
    const leavesMat = new THREE.MeshLambertMaterial({ color: PALETTE.leaves });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.set(x, y + 0.3, z);
    leaves.castShadow = true;

    worldGroup.add(trunk);
    worldGroup.add(leaves);
}

// Procedural Buildings
function createBuildingMesh(type) {
    const group = new THREE.Group();
    const config = BUILDINGS[type];
    const mat = new THREE.MeshLambertMaterial({ color: config.color });
    
    let baseGeo, baseMesh;

    switch(type) {
        case 'greenhouse':
            baseGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
            baseMesh = new THREE.Mesh(baseGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
            const roofGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.8, 3);
            const roof = new THREE.Mesh(roofGeo, mat);
            roof.rotation.z = Math.PI / 2;
            roof.position.y = 0.3;
            group.add(baseMesh);
            group.add(roof);
            break;
        case 'workshop':
            baseGeo = new THREE.BoxGeometry(0.8, 0.6, 0.6);
            baseMesh = new THREE.Mesh(baseGeo, mat);
            const chimneyGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.4);
            const chimney = new THREE.Mesh(chimneyGeo, new THREE.MeshLambertMaterial({ color: 0x333333 }));
            chimney.position.set(0.2, 0.4, 0);
            group.add(baseMesh);
            group.add(chimney);
            break;
        case 'observatory':
            baseGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.5);
            baseMesh = new THREE.Mesh(baseGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }));
            const domeGeo = new THREE.SphereGeometry(0.4, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
            const dome = new THREE.Mesh(domeGeo, mat);
            dome.position.y = 0.25;
            group.add(baseMesh);
            group.add(dome);
            break;
        default:
            // Generic building for others
            baseGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
            baseMesh = new THREE.Mesh(baseGeo, mat);
            group.add(baseMesh);
    }

    group.children.forEach(c => { c.castShadow = true; c.receiveShadow = true; });
    return group;
}

function updateGhostBuilding() {
    if (!state.placementMode || !state.selectedBuilding) {
        ghostBuilding.visible = false;
        return;
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(tilesGroup.children);

    if (intersects.length > 0) {
        const tile = intersects[0].object;
        state.hoveredTile = tile;

        ghostBuilding.visible = true;
        ghostBuilding.position.copy(tile.position);
        ghostBuilding.position.y += tile.geometry.parameters.height / 2;

        // Check placement validity
        let valid = !tile.userData.occupied && tile.userData.type === 'grass';
        if (valid) {
            // Check cost
            const cost = BUILDINGS[state.selectedBuilding].cost;
            for (const [res, amt] of Object.entries(cost)) {
                if ((state.resources[res] || 0) < amt) {
                    valid = false;
                    break;
                }
            }
        }

        const color = valid ? PALETTE.highlight : PALETTE.error;
        ghostBuilding.children.forEach(c => {
            if (c.material) {
                c.material.color.setHex(color);
                c.material.transparent = true;
                c.material.opacity = 0.6;
            }
        });
    } else {
        ghostBuilding.visible = false;
        state.hoveredTile = null;
    }
}

function placeBuilding() {
    if (!state.placementMode || !state.hoveredTile || !state.selectedBuilding) return;

    const tile = state.hoveredTile;
    if (tile.userData.occupied || tile.userData.type !== 'grass') {
        showToast("Cannot place here!", "error");
        return;
    }

    const config = BUILDINGS[state.selectedBuilding];
    
    // Check cost again
    for (const [res, amt] of Object.entries(config.cost)) {
        if ((state.resources[res] || 0) < amt) {
            showToast(`Not enough ${res}!`, "error");
            return;
        }
    }

    // Deduct cost
    for (const [res, amt] of Object.entries(config.cost)) {
        state.resources[res] -= amt;
    }

    // Create and place
    const mesh = createBuildingMesh(state.selectedBuilding);
    mesh.position.copy(tile.position);
    mesh.position.y += tile.geometry.parameters.height / 2;
    
    // Animate placement
    mesh.scale.set(0.1, 0.1, 0.1);
    buildingsGroup.add(mesh);
    
    const targetScale = new THREE.Vector3(1, 1, 1);
    const startTime = Date.now();
    const animatePlacement = () => {
        const now = Date.now();
        const t = Math.min((now - startTime) / 300, 1);
        mesh.scale.lerpVectors(new THREE.Vector3(0.1,0.1,0.1), targetScale, t);
        if (t < 1) requestAnimationFrame(animatePlacement);
    };
    animatePlacement();

    tile.userData.occupied = true;
    state.buildings.push({ type: state.selectedBuilding, x: tile.userData.x, z: tile.userData.z });
    state.epRate += config.epRate;

    updateHUD();
    showToast(`Built ${config.name}!`, "success");
    
    // Exit placement mode
    state.placementMode = false;
    ghostBuilding.visible = false;
    document.getElementById('placement-indicator').style.display = 'none';
    document.querySelectorAll('.building-card').forEach(c => c.classList.remove('selected'));
}

async function loadUserData(userId) {
    try {
        const { data: scans, error } = await supabaseClient
            .from('scans')
            .select('material, verdict')
            .eq('user_id', userId)
            .eq('verdict', 'Recycle');

        if (scans) {
            scans.forEach(scan => {
                const mat = scan.material.toLowerCase();
                for (const key of Object.keys(RESOURCES)) {
                    if (mat.includes(key)) {
                        state.resources[key] = (state.resources[key] || 0) + 1;
                        break;
                    }
                }
            });
        }
        
        // Try to load saved state
        const saved = localStorage.getItem('ecoCityState');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.ep = parsed.ep || 0;
            if (parsed.buildings) {
                // Reconstruct buildings
                // This would be more complex in reality, skipping for brevity
            }
        }
    } catch (e) {
        console.error("Error loading user data:", e);
        loadDemoData();
    }
}

function loadDemoData() {
    state.resources = { 'can': 50, 'plastic bag': 40, 'cup': 30, 'carton': 20, 'bottle': 15 };
    state.ep = 100;
}

function saveState() {
    localStorage.setItem('ecoCityState', JSON.stringify({
        ep: state.ep,
        buildings: state.buildings
    }));
}

function tick() {
    if (state.epRate > 0) {
        state.ep += state.epRate / 3600; // per second
        document.getElementById('ep-total').textContent = Math.floor(state.ep);
    }
}

function setupUI() {
    // Resources
    const resList = document.getElementById('resource-list');
    for (const [key, res] of Object.entries(RESOURCES)) {
        resList.innerHTML += `
            <div class="resource-item" id="res-${key}">
                <div class="resource-icon" style="color: #${res.color.toString(16)}">${res.icon}</div>
                <div class="resource-info">
                    <div class="resource-name">${res.name}</div>
                    <div class="resource-count">0</div>
                </div>
            </div>
        `;
    }

    // Buildings
    const bldPanel = document.getElementById('buildings-panel');
    for (const [key, bld] of Object.entries(BUILDINGS)) {
        const costStr = Object.entries(bld.cost).map(([k, v]) => `${v} ${RESOURCES[k].icon}`).join(' ');
        bldPanel.innerHTML += `
            <div class="building-card" data-type="${key}">
                <div class="building-preview">${bld.icon}</div>
                <div class="building-name">${bld.name}</div>
                <div class="building-cost">${costStr}</div>
                <div class="building-ep">+${bld.epRate}/hr</div>
            </div>
        `;
    }

    document.querySelectorAll('.building-card').forEach(card => {
        card.addEventListener('click', () => {
            if (card.classList.contains('locked')) return;
            
            document.querySelectorAll('.building-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            
            state.selectedBuilding = card.dataset.type;
            state.placementMode = true;
            
            // Recreate ghost building mesh
            scene.remove(ghostBuilding);
            ghostBuilding = createBuildingMesh(state.selectedBuilding);
            scene.add(ghostBuilding);
            
            document.getElementById('placement-indicator').style.display = 'block';
        });
    });
}

function updateHUD() {
    // Update resources
    for (const [key, count] of Object.entries(state.resources)) {
        const el = document.querySelector(`#res-${key} .resource-count`);
        if (el) el.textContent = Math.floor(count);
    }

    // Update stats
    document.getElementById('ep-total').textContent = Math.floor(state.ep);
    document.getElementById('ep-rate').textContent = `+${state.epRate} EP/hr`;
    document.getElementById('stat-buildings').textContent = state.buildings.length;
    document.getElementById('stat-ep-rate').textContent = state.epRate;
    document.getElementById('stat-total-ep').textContent = Math.floor(state.ep);

    // Update building locks
    document.querySelectorAll('.building-card').forEach(card => {
        const type = card.dataset.type;
        const cost = BUILDINGS[type].cost;
        let affordable = true;
        for (const [res, amt] of Object.entries(cost)) {
            if ((state.resources[res] || 0) < amt) {
                affordable = false;
                break;
            }
        }
        if (affordable) {
            card.classList.remove('locked');
        } else {
            card.classList.add('locked');
            if (state.selectedBuilding === type) {
                // Cancel placement if it became unaffordable
                state.placementMode = false;
                ghostBuilding.visible = false;
                card.classList.remove('selected');
                document.getElementById('placement-indicator').style.display = 'none';
            }
        }
    });
}

function showToast(msg, type = "success") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        if (container.contains(toast)) container.removeChild(toast);
    }, 2500);
}

function setupControls() {
    // Mouse movement for raycasting
    window.addEventListener('mousemove', (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // Clicks
    window.addEventListener('click', (e) => {
        if (e.target.tagName !== 'CANVAS') return;
        if (state.placementMode) placeBuilding();
    });

    // Cancel placement
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            state.placementMode = false;
            ghostBuilding.visible = false;
            document.getElementById('placement-indicator').style.display = 'none';
            document.querySelectorAll('.building-card').forEach(c => c.classList.remove('selected'));
        }
    });

    // Panning
    const panSpeed = 0.5;
    const keys = { w: false, a: false, s: false, d: false };
    
    window.addEventListener('keydown', e => {
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = true;
    });
    window.addEventListener('keyup', e => {
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = false;
    });

    // Animation loop handles the actual movement
    state.keys = keys;
}

function handlePanning() {
    const speed = 0.2;
    const panX = new THREE.Vector3(1, 0, -1).normalize();
    const panZ = new THREE.Vector3(-1, 0, -1).normalize();

    if (state.keys.w) camera.position.addScaledVector(panZ, speed);
    if (state.keys.s) camera.position.addScaledVector(panZ, -speed);
    if (state.keys.a) camera.position.addScaledVector(panX, -speed);
    if (state.keys.d) camera.position.addScaledVector(panX, speed);
}

window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -d * aspect;
    camera.right = d * aspect;
    camera.top = d;
    camera.bottom = -d;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('wheel', (e) => {
    const zoomSpeed = 0.001;
    camera.zoom -= e.deltaY * zoomSpeed;
    camera.zoom = Math.max(0.5, Math.min(camera.zoom, 3));
    camera.updateProjectionMatrix();
});

function animate() {
    requestAnimationFrame(animate);
    
    handlePanning();
    updateGhostBuilding();

    // Subtle water animation
    const time = Date.now() * 0.001;
    tilesGroup.children.forEach(tile => {
        if (tile.userData.type.startsWith('water')) {
            tile.position.y = (tile.geometry.parameters.height / 2) + Math.sin(time * 2 + tile.userData.x + tile.userData.z) * 0.05;
        }
    });

    renderer.render(scene, camera);
}

init();
