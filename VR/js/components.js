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

        this.el.addEventListener('triggerdown', this._onTriggerBound);
        this.el.addEventListener('mousedown', this._onTriggerBound);
        window.addEventListener('pointerdown', this._onPointerDownBound);
    },

    // Fait suivre l'objet à chaque frame
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
        this.el.removeEventListener('mousedown', this._onTriggerBound);
        window.removeEventListener('pointerdown', this._onPointerDownBound);
        window.removeEventListener('pointerup', this._onPointerUpBound);
        this.el.removeEventListener('triggerup', this._onTriggerUpBound);
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

        let targetEl = (evt.detail && evt.detail.intersectedEl) ? evt.detail.intersectedEl
            : (evt.target && evt.target.classList && evt.target.classList.contains('interactable')) ? evt.target
                : null;

        if (!targetEl || !(targetEl.classList && targetEl.classList.contains('interactable'))) return;

        this.lockInputs(100);
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

        // Raycast sur tous les objets de la scène
        const sceneEl = document.querySelector('a-scene');
        const objs = [];
        sceneEl.object3D.traverse(function(child) { if (child.isMesh) objs.push(child); });
        const hits = raycaster.intersectObjects(objs, true);
        if (hits && hits.length) return hits[0].point.clone();

        // Fallback: point devant la caméra
        return new THREE.Vector3(0, 0, -1.5).applyMatrix4(threeCamera.matrixWorld);
    },

    grab: function (el) {
        this.grabbedEl = el;

        const currentScale = el.getAttribute && el.getAttribute('scale');
        this._savedScale = currentScale ? { x: currentScale.x, y: currentScale.y, z: currentScale.z } : null;

        this._finishGrab(el);
    },

    _finishGrab: function(el) {
        // L'objet reste dans la scène, tick() le fait suivre
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
        }
    },

    drop: function (worldPosOptional) {
        if (!this.grabbedEl) return;
        this.lockInputs(50);

        const cameraEl = document.querySelector('#camera');
        const cameraPos = new THREE.Vector3();
        if (cameraEl && cameraEl.object3D) cameraEl.object3D.getWorldPosition(cameraPos);

        // Calculer la position finale
        let finalPos = worldPosOptional ? worldPosOptional.clone() : (() => {
            const p = new THREE.Vector3();
            if (this.grabbedEl && this.grabbedEl.object3D) this.grabbedEl.object3D.getWorldPosition(p);
            return p;
        })();

        // Clamp la distance entre 0.4m et 3m de la caméra
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

        // Réinitialiser le renderOrder
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

        // Positionner l'objet à la position finale
        this.grabbedEl.setAttribute('position', { x: finalPos.x, y: finalPos.y, z: finalPos.z });

        // Restaurer l'échelle
        if (this._savedScale) {
            const s = this._savedScale;
            this.grabbedEl.setAttribute('scale', `${s.x} ${s.y} ${s.z}`);
            if (this.grabbedEl.object3D && this.grabbedEl.object3D.scale) {
                this.grabbedEl.object3D.scale.set(s.x, s.y, s.z);
            }
        }

        // Réactiver le raycaster
        if (this.raycaster) {
            try {
                this.el.setAttribute('raycaster', 'enabled', true);
                this.el.setAttribute('raycaster', 'showLine', true);
            } catch (e) {}
        }

        // Enlever les listeners
        if (this.usingCursor) {
            window.removeEventListener('pointerup', this._onPointerUpBound);
        } else {
            this.el.removeEventListener('triggerup', this._onTriggerUpBound);
        }

        // Cleanup
        this._savedScale = null;
        this.grabbedEl = null;
    }
});

AFRAME.registerComponent('stackable', {});
AFRAME.registerComponent('infinite-supply', {});
