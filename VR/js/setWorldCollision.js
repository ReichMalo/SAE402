/**
 * setWorldCollision.js
 * 
 * Scan manuel avec hit-test + Delaunator
 * Appuyer sur A ou X pour valider et créer les collisions
 */

// Patch XR pour hit-test
(function() {
    if (!navigator.xr) return;
    const original = navigator.xr.requestSession.bind(navigator.xr);
    navigator.xr.requestSession = async function(mode, options = {}) {
        options.optionalFeatures = options.optionalFeatures || [];
        ['local-floor', 'hit-test'].forEach(f => {
            if (!options.optionalFeatures.includes(f)) options.optionalFeatures.push(f);
        });
        return original(mode, options);
    };
})();

AFRAME.registerComponent('room-collision', {
    init: function() {
        console.log('[RoomScan] Init');
        
        this.sceneEl = this.el.sceneEl;
        this.hitTestSource = null;
        this.isScanning = false;
        this.isValidated = false;
        this.frameCount = 0;
        this.lastAddTime = 0;
        this.needsRebuild = false;
        
        // Tous les points dans un seul tableau
        this.points = [];
        
        // Container pour le mesh
        this.meshContainer = new THREE.Group();
        this.meshContainer.name = 'scan-mesh';
        this.sceneEl.object3D.add(this.meshContainer);
        
        // Reticle
        this.reticle = document.createElement('a-entity');
        this.reticle.innerHTML = `
            <a-ring radius-inner="0.03" radius-outer="0.05" color="#0ff" rotation="-90 0 0"></a-ring>
            <a-circle radius="0.01" color="#fff" rotation="-90 0 0"></a-circle>
        `;
        this.reticle.setAttribute('visible', 'false');
        this.sceneEl.appendChild(this.reticle);
        
        // Bouton de validation (texte flottant)
        this.createValidateButton();
        
        // Écouter les contrôleurs pour le bouton A ou X
        this.setupControllerListeners();
        
        this.sceneEl.addEventListener('enter-vr', () => this.onEnterVR());
        this.sceneEl.addEventListener('exit-vr', () => this.onExitVR());
    },

    createValidateButton: function() {
        this.validateUI = document.createElement('a-entity');
        this.validateUI.setAttribute('position', '0 1.4 -1');
        this.validateUI.innerHTML = `
            <a-plane width="0.5" height="0.12" color="#222" opacity="0.9"></a-plane>
            <a-text value="Appuyez A ou X pour valider" 
                    position="0 0 0.01" align="center" width="0.45" color="#0ff"></a-text>
        `;
        this.validateUI.setAttribute('visible', 'false');
        this.sceneEl.appendChild(this.validateUI);
    },

    setupControllerListeners: function() {
        // Écouter les boutons A, X, ou triggers
        const onButtonPress = (e) => {
            if (this.isScanning && !this.isValidated) {
                this.validateScan();
            }
        };
        
        this.sceneEl.addEventListener('abuttondown', onButtonPress);
        this.sceneEl.addEventListener('xbuttondown', onButtonPress);
        
        // Aussi écouter via gamepad polling
        this.checkGamepad = true;
    },

    onEnterVR: async function() {
        console.log('[RoomScan] Entered VR');
        
        if (this.isValidated) return; // Déjà validé
        
        setTimeout(async () => {
            const session = this.sceneEl.renderer?.xr?.getSession();
            if (!session) return;
            
            try {
                const viewerSpace = await session.requestReferenceSpace('viewer');
                this.hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
                this.isScanning = true;
                this.validateUI.setAttribute('visible', 'true');
                console.log('[RoomScan] Scanning started - Press A/X to validate');
            } catch(e) {
                console.error('[RoomScan]', e);
            }
        }, 500);
    },

    onExitVR: function() {
        if (!this.isValidated) {
            this.isScanning = false;
            this.hitTestSource = null;
            this.reticle.setAttribute('visible', 'false');
            this.validateUI.setAttribute('visible', 'false');
        }
    },

    tick: function() {
        // Vérifier gamepad pour bouton A/X
        if (this.checkGamepad && this.isScanning && !this.isValidated) {
            this.pollGamepad();
        }
        
        if (!this.isScanning || !this.hitTestSource || this.isValidated) return;
        
        const frame = this.sceneEl.frame;
        const renderer = this.sceneEl.renderer;
        if (!frame || !renderer?.xr?.isPresenting) return;
        
        const refSpace = renderer.xr.getReferenceSpace();
        if (!refSpace) return;
        
        this.frameCount++;
        
        const results = frame.getHitTestResults(this.hitTestSource);
        
        if (results.length > 0) {
            const pose = results[0].getPose(refSpace);
            if (pose) {
                const p = pose.transform.position;
                
                // Reticle
                this.reticle.setAttribute('position', `${p.x} ${p.y + 0.002} ${p.z}`);
                this.reticle.setAttribute('visible', 'true');
                
                // Ignorer le sol (y < 0.15)
                const isFloor = p.y < 0.15;
                this.reticle.querySelector('a-ring').setAttribute('color', isFloor ? '#666' : '#0ff');
                
                // Ajouter point
                const now = performance.now();
                if (!isFloor && now - this.lastAddTime > 150) {
                    if (this.shouldAddPoint(p)) {
                        this.addPoint(p);
                        this.lastAddTime = now;
                    }
                }
            }
        } else {
            this.reticle.setAttribute('visible', 'false');
        }
        
        // Rebuild mesh
        if (this.needsRebuild && this.frameCount % 15 === 0) {
            this.rebuildMesh();
            this.needsRebuild = false;
        }
    },

    pollGamepad: function() {
        const session = this.sceneEl.renderer?.xr?.getSession();
        if (!session) return;
        
        for (const source of session.inputSources || []) {
            const gp = source.gamepad;
            if (gp) {
                // Bouton A (index 4) ou X (index 4 sur l'autre main)
                if (gp.buttons[4]?.pressed || gp.buttons[5]?.pressed) {
                    this.validateScan();
                    return;
                }
            }
        }
    },

    shouldAddPoint: function(p) {
        const minDist = 0.20;
        for (const pt of this.points) {
            const dx = p.x - pt.x;
            const dy = p.y - pt.y;
            const dz = p.z - pt.z;
            if (Math.sqrt(dx*dx + dy*dy + dz*dz) < minDist) {
                return false;
            }
        }
        return true;
    },

    addPoint: function(pos) {
        this.points.push({ x: pos.x, y: pos.y, z: pos.z });
        this.needsRebuild = true;
    },

    rebuildMesh: function() {
        // Supprimer les anciens meshes
        while (this.meshContainer.children.length > 0) {
            const child = this.meshContainer.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.meshContainer.remove(child);
        }
        
        if (this.points.length < 3) return;
        
        // Projeter en 2D (XZ) pour Delaunator
        const coords = new Float64Array(this.points.length * 2);
        for (let i = 0; i < this.points.length; i++) {
            coords[i * 2] = this.points[i].x;
            coords[i * 2 + 1] = this.points[i].z;
        }
        
        let delaunay;
        try {
            delaunay = new Delaunator(coords);
        } catch(e) {
            return;
        }
        
        const triangles = delaunay.triangles;
        const maxEdge = 1.0;
        const vertices = [];
        
        for (let i = 0; i < triangles.length; i += 3) {
            const p0 = this.points[triangles[i]];
            const p1 = this.points[triangles[i + 1]];
            const p2 = this.points[triangles[i + 2]];
            
            const d01 = Math.sqrt((p1.x-p0.x)**2 + (p1.y-p0.y)**2 + (p1.z-p0.z)**2);
            const d12 = Math.sqrt((p2.x-p1.x)**2 + (p2.y-p1.y)**2 + (p2.z-p1.z)**2);
            const d20 = Math.sqrt((p0.x-p2.x)**2 + (p0.y-p2.y)**2 + (p0.z-p2.z)**2);
            
            if (d01 < maxEdge && d12 < maxEdge && d20 < maxEdge) {
                vertices.push(
                    p0.x, p0.y, p0.z,
                    p1.x, p1.y, p1.z,
                    p2.x, p2.y, p2.z
                );
            }
        }
        
        if (vertices.length === 0) return;
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        
        // Mesh cyan semi-transparent pendant le scan
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        this.meshContainer.add(mesh);
        
        // Wireframe
        const wireMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.6
        });
        const wireMesh = new THREE.Mesh(geometry, wireMat);
        this.meshContainer.add(wireMesh);
        
        this.currentGeometry = geometry;
        this.currentVertices = vertices;
    },

    validateScan: function() {
        if (this.isValidated || this.points.length < 3) return;
        
        console.log('[RoomScan] Validating scan...');
        this.isValidated = true;
        this.isScanning = false;
        
        // Cacher l'UI et le reticle
        this.validateUI.setAttribute('visible', 'false');
        this.reticle.setAttribute('visible', 'false');
        
        // Créer l'entité physique
        this.createPhysicsCollider();
        
        // Rendre le mesh invisible
        this.meshContainer.visible = false;
        
        console.log('[RoomScan] ✓ Scan validated - Collisions active!');
    },

    createPhysicsCollider: function() {
        if (!this.currentVertices || this.currentVertices.length === 0) return;
        
        // Créer une entité A-Frame avec le mesh comme géométrie de collision
        const colliderEntity = document.createElement('a-entity');
        colliderEntity.setAttribute('id', 'room-collider');
        
        // Créer la géométrie Three.js
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.currentVertices, 3));
        geometry.computeVertexNormals();
        
        // Créer le mesh invisible
        const material = new THREE.MeshBasicMaterial({
            visible: false
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        colliderEntity.object3D.add(mesh);
        
        // Ajouter à la scène
        this.sceneEl.appendChild(colliderEntity);
        
        // Ajouter physx-body après un court délai pour que l'entité soit prête
        setTimeout(() => {
            colliderEntity.setAttribute('physx-body', {
                type: 'static',
                shape: 'mesh'
            });
            console.log('[RoomScan] Physics collider created');
        }, 100);
        
        this.colliderEntity = colliderEntity;
    },

    remove: function() {
        while (this.meshContainer.children.length > 0) {
            const child = this.meshContainer.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.meshContainer.remove(child);
        }
        this.sceneEl.object3D.remove(this.meshContainer);
        
        this.reticle?.parentNode?.removeChild(this.reticle);
        this.validateUI?.parentNode?.removeChild(this.validateUI);
        this.colliderEntity?.parentNode?.removeChild(this.colliderEntity);
    }
});

console.log('[setWorldCollision] Loaded - Press A/X to validate scan');
