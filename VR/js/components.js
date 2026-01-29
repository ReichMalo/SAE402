AFRAME.registerComponent('grab-controller', {
    init: function () {
        this.grabbedEl = null;
        this.isLocked = false;
        this._savedScale = null;
        this._lastPointer = { x: null, y: null };

        this.raycaster = this.el.components && this.el.components.raycaster;
        this.usingCursor = !!(this.el.components && this.el.components.cursor);

        this._onTriggerBound = (evt) => this._onTrigger(evt);
        this._onTriggerUpBound = (evt) => this._onTriggerUp(evt);
        this._onPointerDownBound = (evt) => this._onPointerDown(evt);
        this._onPointerUpBound = (evt) => this._onPointerUp(evt);

        // Support pour les contrôleurs VR
        this.el.addEventListener('triggerdown', this._onTriggerBound);
        this.el.addEventListener('triggertouchstart', this._onTriggerBound);
        this.el.addEventListener('gripdown', this._onTriggerBound);
        this.el.addEventListener('mousedown', this._onTriggerBound);
        window.addEventListener('pointerdown', this._onPointerDownBound);
    },

    tick: function() {
        if (!this.grabbedEl) return;

        const controllerPos = new THREE.Vector3();
        const controllerQuat = new THREE.Quaternion();

        if (this.el.object3D) {
            this.el.object3D.getWorldPosition(controllerPos);
            this.el.object3D.getWorldQuaternion(controllerQuat);
        }

        const offset = this.usingCursor ? 0.5 : 0.3;
        const forward = new THREE.Vector3(0, 0, -offset);
        forward.applyQuaternion(controllerQuat);
        const targetPos = new THREE.Vector3().copy(controllerPos).add(forward);

        this.grabbedEl.object3D.position.copy(targetPos);
    },

    remove: function () {
        this.el.removeEventListener('triggerdown', this._onTriggerBound);
        this.el.removeEventListener('triggertouchstart', this._onTriggerBound);
        this.el.removeEventListener('gripdown', this._onTriggerBound);
        this.el.removeEventListener('mousedown', this._onTriggerBound);
        window.removeEventListener('pointerdown', this._onPointerDownBound);
        window.removeEventListener('pointerup', this._onPointerUpBound);
        this.el.removeEventListener('triggerup', this._onTriggerUpBound);
        this.el.removeEventListener('triggertouchend', this._onTriggerUpBound);
        this.el.removeEventListener('gripup', this._onTriggerUpBound);
    },

    lockInputs: function(duration) {
        this.isLocked = true;
        setTimeout(() => { this.isLocked = false; }, duration);
    },

    _onPointerDown: function(evt) {
        if (typeof evt.clientX === 'number' && typeof evt.clientY === 'number') {
            this._lastPointer.x = evt.clientX;
            this._lastPointer.y = evt.clientY;
        }
    },

    _onTrigger: function(evt) {
        if (this.isLocked) return;
        if (this.grabbedEl) { this.drop(); return; }

        let targetEl = null;

        // Priorité 1: Vérifier si le raycaster a une intersection
        if (this.raycaster) {
            const intersectedEls = this.raycaster.intersectedEls;
            if (intersectedEls && intersectedEls.length > 0) {
                // Prendre le premier élément intersecté qui est interactable
                for (let i = 0; i < intersectedEls.length; i++) {
                    if (intersectedEls[i].classList && intersectedEls[i].classList.contains('interactable')) {
                        targetEl = intersectedEls[i];
                        break;
                    }
                }
            }
        }

        // Priorité 2: Vérifier evt.detail.intersectedEl (pour cursor)
        if (!targetEl && evt.detail && evt.detail.intersectedEl) {
            if (evt.detail.intersectedEl.classList && evt.detail.intersectedEl.classList.contains('interactable')) {
                targetEl = evt.detail.intersectedEl;
            }
        }

        // Priorité 3: Vérifier evt.target (pour click direct)
        if (!targetEl && evt.target && evt.target.classList && evt.target.classList.contains('interactable')) {
            targetEl = evt.target;
        }

        if (!targetEl) {
            console.log('🚫 No interactable target found');
            return;
        }

        const isOriginal = targetEl.dataset.isOriginal === 'true';
        console.log('🎯 Grab:', targetEl.getAttribute('item-type'), 'infinite-supply:', targetEl.hasAttribute('infinite-supply'), 'is-original:', isOriginal);
        this.lockInputs(100);

        // If the clicked entity is marked as original -> create a single clone and grab that clone
        if (isOriginal) {
            // Prevent moving the original; spawn a clone that is grab-able and not duplicable
            this._createCloneAndGrab(targetEl);
            return;
        }

        this.grab(targetEl);
    },

    _onTriggerUp: function() {
        if (this.grabbedEl) this.drop();
    },

    _onPointerUp: function(evt) {
        const clientX = (typeof evt.clientX === 'number') ? evt.clientX : this._lastPointer.x;
        const clientY = (typeof evt.clientY === 'number') ? evt.clientY : this._lastPointer.y;

        if (!this.grabbedEl) return;

        const worldPos = (typeof clientX === 'number' && typeof clientY === 'number')
            ? this._raycastFromCamera(clientX, clientY)
            : this._raycastFromCameraFallback();

        this.drop(worldPos);
    },

    _raycastFromCameraFallback: function() {
        const cameraEl = document.querySelector('#camera');
        const threeCamera = cameraEl && cameraEl.getObject3D('camera');
        if (!threeCamera) {
            const fallback = new THREE.Vector3();
            if (this.grabbedEl && this.grabbedEl.object3D) this.grabbedEl.object3D.getWorldPosition(fallback);
            return fallback;
        }
        return new THREE.Vector3(0, 0, -1.5).applyMatrix4(threeCamera.matrixWorld);
    },

    _raycastFromCamera: function(clientX, clientY) {
        const cameraEl = document.querySelector('#camera');
        const threeCamera = cameraEl && cameraEl.getObject3D('camera');
        if (!threeCamera) {
            const fallback = new THREE.Vector3();
            if (this.grabbedEl && this.grabbedEl.object3D) this.grabbedEl.object3D.getWorldPosition(fallback);
            return fallback;
        }

        const mouse = new THREE.Vector2(
            (clientX / window.innerWidth) * 2 - 1,
            -(clientY / window.innerHeight) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, threeCamera);

        const sceneEl = document.querySelector('a-scene');
        const objs = [];
        sceneEl.object3D.traverse(function(child) { if (child.isMesh) objs.push(child); });
        const hits = raycaster.intersectObjects(objs, true);
        if (hits && hits.length) return hits[0].point.clone();

        return new THREE.Vector3(0, 0, -1.5).applyMatrix4(threeCamera.matrixWorld);
    },

    grab: function (el) {
        this.grabbedEl = el;

        const currentScale = el.getAttribute && el.getAttribute('scale');
        this._savedScale = currentScale ? { x: currentScale.x, y: currentScale.y, z: currentScale.z } : null;

        this._finishGrab(el);
    },

    _finishGrab: function(el) {
        el.object3D.renderOrder = 9999;
        el.object3D.visible = true;

        if (el.object3D) {
            el.object3D.traverse(function(child) {
                child.visible = true;
                child.frustumCulled = false;
                child.renderOrder = 9999;

                if (child.isMesh && child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(mat => {
                        mat.transparent = false;
                        mat.opacity = 1;
                        mat.depthWrite = true;
                        mat.depthTest = true;
                        mat.side = THREE.DoubleSide;
                        mat.needsUpdate = true;
                    });
                }
            });
        }

        el.setAttribute('visible', true);

        if (this.raycaster) {
            try {
                this.el.setAttribute('raycaster', 'enabled', false);
                this.el.setAttribute('raycaster', 'showLine', false);
            } catch (e) {}
        }

        if (this.usingCursor) {
            window.addEventListener('pointerup', this._onPointerUpBound);
        } else {
            this.el.addEventListener('triggerup', this._onTriggerUpBound);
            this.el.addEventListener('triggertouchend', this._onTriggerUpBound);
            this.el.addEventListener('gripup', this._onTriggerUpBound);
        }
    },

    drop: function (worldPosOptional) {
        if (!this.grabbedEl) return;

        const itemType = this.grabbedEl.getAttribute('item-type');
        const hasInfiniteSupply = this.grabbedEl.hasAttribute('infinite-supply');
        const isOriginal = this.grabbedEl.dataset.isOriginal === 'true';

        console.log('📍 Drop:', itemType, 'infinite-supply:', hasInfiniteSupply, 'is-original:', isOriginal);

        this.lockInputs(50);

        const cameraEl = document.querySelector('#camera');
        const cameraPos = new THREE.Vector3();
        if (cameraEl && cameraEl.object3D) cameraEl.object3D.getWorldPosition(cameraPos);

        let finalPos = worldPosOptional ? worldPosOptional.clone() : (() => {
            const p = new THREE.Vector3();
            if (this.grabbedEl && this.grabbedEl.object3D) this.grabbedEl.object3D.getWorldPosition(p);
            return p;
        })();

        if (cameraPos && finalPos) {
            const dir = new THREE.Vector3().subVectors(finalPos, cameraPos);
            const dist = dir.length();
            const minDist = 0.4;
            const maxDist = 3.0;
            if (dist < minDist || dist > maxDist) {
                dir.normalize();
                const clamped = new THREE.Vector3().copy(cameraPos).add(dir.multiplyScalar(Math.min(Math.max(dist, minDist), maxDist)));
                finalPos.copy(clamped);
            }
        }

        const minHeight = 0.9;
        if (finalPos.y < minHeight) {
            finalPos.y = minHeight;
        }

        this.grabbedEl.object3D.renderOrder = 0;

        if (this.grabbedEl.object3D) {
            this.grabbedEl.object3D.traverse(function(child) {
                child.visible = true;
                child.frustumCulled = false;
                child.renderOrder = 0;

                if (child.isMesh && child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(mat => {
                        mat.transparent = false;
                        mat.opacity = 1;
                        mat.depthWrite = true;
                        mat.depthTest = true;
                        mat.side = THREE.DoubleSide;
                        mat.needsUpdate = true;
                    });
                }
            });
        }

        this.grabbedEl.setAttribute('position', { x: finalPos.x, y: finalPos.y, z: finalPos.z });

        if (this._savedScale) {
            const s = this._savedScale;
            this.grabbedEl.setAttribute('scale', `${s.x} ${s.y} ${s.z}`);
            if (this.grabbedEl.object3D && this.grabbedEl.object3D.scale) {
                this.grabbedEl.object3D.scale.set(s.x, s.y, s.z);
            }
        }

        if (this.raycaster) {
            try {
                this.el.setAttribute('raycaster', 'enabled', true);
                this.el.setAttribute('raycaster', 'showLine', true);
            } catch (e) {}
        }

        if (this.usingCursor) {
            window.removeEventListener('pointerup', this._onPointerUpBound);
        } else {
            this.el.removeEventListener('triggerup', this._onTriggerUpBound);
            this.el.removeEventListener('triggertouchend', this._onTriggerUpBound);
            this.el.removeEventListener('gripup', this._onTriggerUpBound);
        }

        if (hasInfiniteSupply && isOriginal) {
            console.log('🔄 Emitting dropped event for', itemType);
            this.grabbedEl.emit('dropped');
        }

        this._savedScale = null;
        this.grabbedEl = null;
    },

    // Create a clone for an original entity and grab it. Clone won't have infinite-supply so it cannot be duplicated.
    _createCloneAndGrab: function(originalEl) {
        if (!originalEl) return;

        // Prevent creating clones from clones
        if (originalEl.dataset.isClone === 'true') {
            console.log('🛑 Original expected, but clicked a clone. No clone created.');
            return;
        }

        const scene = this.el.sceneEl || document.querySelector('a-scene');
        if (!scene) return;

        const gltf = originalEl.getAttribute('gltf-model') || originalEl.getAttribute('src');
        const position = originalEl.getAttribute('position') || { x:0, y:0, z:0 };
        const rotation = originalEl.getAttribute('rotation') || { x:0, y:0, z:0 };
        const scale = originalEl.getAttribute('scale') || { x:1, y:1, z:1 };
        const itemType = originalEl.getAttribute('item-type') || '';

        const clone = document.createElement('a-entity');
        clone.classList.add('interactable');
        if (gltf) clone.setAttribute('gltf-model', gltf);
        clone.setAttribute('position', position);
        clone.setAttribute('rotation', rotation);
        clone.setAttribute('scale', scale);
        if (itemType) clone.setAttribute('item-type', itemType);
        clone.setAttribute('stackable', '');

        // mark as a clone so originals stay the only source of duplication
        clone.dataset.isClone = 'true';
        clone.dataset.isOriginal = 'false';

        // optional unique id
        try {
            const baseId = originalEl.id || itemType || 'entity';
            clone.id = baseId + '-clone-' + Date.now();
        } catch (e) {}

        // append to scene
        scene.appendChild(clone);
        console.log('✨ Clone created and appended for', itemType, clone.id);

        // Wait for model to load before grabbing to avoid visual glitches
        let grabbed = false;
        const tryGrab = () => {
            if (grabbed) return;
            grabbed = true;
            this.grab(clone);
        };

        // If model will emit 'model-loaded', listen for it
        const onModelLoaded = () => {
            clone.removeEventListener('model-loaded', onModelLoaded);
            console.log('📦 Clone model-loaded, grabbing now', clone.id);
            tryGrab();
        };

        clone.addEventListener('model-loaded', onModelLoaded);

        // fallback: if model doesn't load within 2s, still grab the clone
        setTimeout(() => {
            if (!grabbed) {
                console.log('⏳ model-loaded timeout, grabbing clone anyway', clone.id);
                clone.removeEventListener('model-loaded', onModelLoaded);
                tryGrab();
            }
        }, 2000);
    }
});

AFRAME.registerComponent('stackable', {});

AFRAME.registerComponent('infinite-supply', {
    schema: {
        delay: { type: 'number', default: 50 }
    },

    init: function() {
        console.log('✅ infinite-supply init:', this.el.getAttribute('item-type'));

        this.originalPosition = this.el.getAttribute('position');
        this.originalRotation = this.el.getAttribute('rotation');
        this.originalScale = this.el.getAttribute('scale');
        this.originalModel = this.el.getAttribute('gltf-model');
        this.itemType = this.el.getAttribute('item-type');

        this.originalWorldPos = new THREE.Vector3();
        if (this.el.object3D) {
            this.el.object3D.getWorldPosition(this.originalWorldPos);
        }

        this.el.dataset.isOriginal = 'true';

        console.log('📦 Saved data:', {
            position: this.originalPosition,
            worldPos: this.originalWorldPos,
            model: this.originalModel,
            itemType: this.itemType
        });

        this.el.addEventListener('dropped', () => {
            console.log('🎧 Received dropped event for', this.itemType);
            this.respawn();
        });
    },

    respawn: function() {
        console.log('⏳ Respawn called for', this.itemType);

        setTimeout(() => {
            console.log('🆕 Creating clone for', this.itemType);

            const clone = document.createElement('a-entity');
            clone.classList.add('interactable');
            clone.setAttribute('gltf-model', this.originalModel);
            clone.setAttribute('position', this.originalPosition);
            clone.setAttribute('rotation', this.originalRotation);
            clone.setAttribute('scale', this.originalScale);
            clone.setAttribute('stackable', '');
            clone.setAttribute('item-type', this.itemType);

            this.el.sceneEl.appendChild(clone);
            console.log('✨ Clone created for', this.itemType);

            this.el.setAttribute('position', this.originalPosition);
            this.el.setAttribute('rotation', this.originalRotation);
            this.el.setAttribute('scale', this.originalScale);
            console.log('🔄 Original reset to starting position');
        }, this.data.delay);
    }
});

