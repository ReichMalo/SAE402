// Three.js + Cannon.js + WebXR Scene

import * as CANNON from 'cannon-es';

let scene, camera, renderer;
let world;
let cubeBody, cubeMesh;
let controller1, controller2;
let frameCount = 0;
let lastFpsTime = Date.now();
let cannonDebuggerRenderer;
let controllerCubes = {};

function init() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 1.6, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 7);
  scene.add(directionalLight);

  // Physics world
  world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.defaultContactMaterial.friction = 0.3;

  // Create cube with physics
  createCube();

  // Create ground
  createGround();

  // XR Setup
  setupXR();

  // Resize handler
  window.addEventListener('resize', onWindowResize);

  // Start animation loop
  renderer.xr.addEventListener('sessionstart', () => {
    console.log('XR Session started');
  });

  renderer.xr.addEventListener('sessionend', () => {
    console.log('XR Session ended');
  });

  renderer.setAnimationLoop(animate);
}

function createCube() {
  // Mesh
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshPhongMaterial({ color: 0x4CC3D9 });
  cubeMesh = new THREE.Mesh(geometry, material);
  cubeMesh.position.set(0, 1, -0.5);
  scene.add(cubeMesh);

  // Physics body
  const shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
  cubeBody = new CANNON.Body({
    mass: 1,
    shape: shape,
    position: new CANNON.Vec3(0, 1.5, -0.5),
  });
  world.addBody(cubeBody);

  // Store reference for updates
  cubeMesh.userData.body = cubeBody;
}

function createGround() {
  // Mesh
  const geometry = new THREE.PlaneGeometry(10, 10);
  const material = new THREE.MeshPhongMaterial({
    color: 0x808080,
    side: THREE.DoubleSide,
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  // Physics body
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({
    mass: 0,
    shape: groundShape,
  });
  groundBody.quaternion.setFromAxisAngle(
    new CANNON.Vec3(1, 0, 0),
    -Math.PI / 2
  );
  world.addBody(groundBody);
}

function createControllerCube(controller, index) {
  // Mesh
  const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const color = index === 0 ? 0xff0000 : 0x00ff00; // Rouge pour left, vert pour right
  const material = new THREE.MeshPhongMaterial({ color: color });
  const cubeMesh = new THREE.Mesh(geometry, material);
  
  controller.add(cubeMesh);
  scene.add(controller);

  // Physics body
  const shape = new CANNON.Box(new CANNON.Vec3(0.15, 0.15, 0.15));
  const cubeBody = new CANNON.Body({
    mass: 0, // Statique pour ne pas tomber
    shape: shape,
    position: new CANNON.Vec3(controller.position.x, controller.position.y, controller.position.z),
  });
  world.addBody(cubeBody);

  // Stocker les références
  controllerCubes[index] = {
    mesh: cubeMesh,
    body: cubeBody,
    controller: controller
  };
}

function setupXR() {
  const xrButton = document.getElementById('xr-button');

  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
      xrButton.disabled = !supported;
      xrButton.textContent = supported ? 'Enter VR' : 'VR not supported';
    });

    xrButton.addEventListener('click', async () => {
      try {
        const session = await navigator.xr.requestSession('immersive-vr', {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['hand-tracking'],
        });
        renderer.xr.setSession(session);
      } catch (e) {
        console.error('Failed to start XR session:', e);
      }
    });
  } else {
    xrButton.disabled = true;
    xrButton.textContent = 'WebXR not supported';
  }

  // Setup controllers
  const onSelectStart = (event) => {
    const controller = event.target;

    // Cast a ray and push objects
    const raycaster = new THREE.Raycaster();
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(controller.quaternion);

    raycaster.ray.origin.copy(controller.position);
    raycaster.ray.direction.copy(direction);

    const intersects = raycaster.intersectObjects(scene.children);

    if (intersects.length > 0) {
      const obj = intersects[0].object;
      if (obj.userData.body) {
        const force = new CANNON.Vec3(
          direction.x * 15,
          direction.y * 15 + 5,
          direction.z * 15
        );
        obj.userData.body.applyForce(force, obj.userData.body.position);
      }
    }
  };

  // Create controller grips
  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('select', onSelectStart);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('select', onSelectStart);
  scene.add(controller2);

  // Créer des cubes aux contrôleurs avec collision
  createControllerCube(controller1, 0);
  createControllerCube(controller2, 1);

  // Mouse click for desktop
  document.addEventListener('click', () => {
    if (cubeBody) {
      const force = new CANNON.Vec3(
        (Math.random() - 0.5) * 15,
        Math.random() * 10,
        (Math.random() - 0.5) * 15
      );
      cubeBody.applyForce(force, cubeBody.position);
    }
  });
}

function updatePhysics(deltaTime) {
  world.step(1 / 60, deltaTime, 3);

  // Update cube position and rotation
  if (cubeMesh && cubeBody) {
    cubeMesh.position.copy(cubeBody.position);
    cubeMesh.quaternion.copy(cubeBody.quaternion);
  }

  // Update controller cubes
  for (const key in controllerCubes) {
    const controllerCube = controllerCubes[key];
    const controller = controllerCube.controller;
    const body = controllerCube.body;

    // Sync physics body with controller position
    body.position.set(controller.position.x, controller.position.y, controller.position.z);
    body.quaternion.set(controller.quaternion.x, controller.quaternion.y, controller.quaternion.z, controller.quaternion.w);
  }
}

function updateFPS() {
  frameCount++;
  const now = Date.now();
  if (now - lastFpsTime > 1000) {
    document.getElementById('fps').textContent = `FPS: ${frameCount}`;
    frameCount = 0;
    lastFpsTime = now;
  }
}

function animate(time, frame) {
  updatePhysics(0.016); // Assume 60fps
  updateFPS();

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Initialize when page loads
window.addEventListener('load', init);
