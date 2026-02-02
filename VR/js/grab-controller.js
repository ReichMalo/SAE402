AFRAME.registerComponent('grab-controller', {
    init: function () {
        this.grabbedEl = null;
        this.isLocked = false;
        this._savedScale = null;
        this._lastPointer = { x: null, y: null };
        this._lastTriggerTime = 0;
        this._triggerDelay = 100; // Délai minimum entre deux grabs (ms)

        this.raycaster = this.el.components && this.el.components.raycaster;
        this.usingCursor = !!(this.el.components && this.el.components.cursor);

        this._onTriggerBound = this._onTrigger.bind(this);
        this._onTriggerUpBound = this._onTriggerUp.bind(this);
        this._onPointerDownBound = this._onPointerDown.bind(this);
        this._onPointerUpBound = this._onPointerUp.bind(this);

        // Utiliser uniquement les événements VR pertinents
        this.el.addEventListener('triggerdown', this._onTriggerBound);
        this.el.addEventListener('gripdown', this._onTriggerBound);
        
        // Événements de relâchement
        this.el.addEventListener('triggerup', this._onTriggerUpBound);
        this.el.addEventListener('gripup', this._onTriggerUpBound);
    },

    tick: function() {
        if (!this.grabbedEl || !this.el.object3D) return;

        const controllerPos = new THREE.Vector3();
        const controllerQuat = new THREE.Quaternion();
        this.el.object3D.getWorldPosition(controllerPos);
        this.el.object3D.getWorldQuaternion(controllerQuat);

        // Position suit la main
        this.grabbedEl.object3D.position.copy(controllerPos);

        // Rotation : appliquer le delta de rotation de la main à la rotation initiale
        if (this._handRotationAtGrab && this._savedRotationQuat) {
            // Calculer la différence de rotation : rotation actuelle / rotation initiale
            const rotationDelta = new THREE.Quaternion();
            rotationDelta.copy(controllerQuat).multiply(this._handRotationAtGrab.clone().invert());

            // Appliquer le delta à la rotation initiale
            const finalQuat = new THREE.Quaternion();
            finalQuat.copy(this._savedRotationQuat).multiply(rotationDelta);

            this.grabbedEl.object3D.quaternion.copy(finalQuat);
        }
    },

    remove: function () {
        this.el.removeEventListener('triggerdown', this._onTriggerBound);
        this.el.removeEventListener('gripdown', this._onTriggerBound);
        this.el.removeEventListener('triggerup', this._onTriggerUpBound);
        this.el.removeEventListener('gripup', this._onTriggerUpBound);
    },

    lockInputs: function(duration) {
        this.isLocked = true;
        setTimeout(() => { this.isLocked = false; }, duration);
    },

    _onPointerDown: function(evt) {
        this._lastPointer.x = evt.clientX;
        this._lastPointer.y = evt.clientY;
    },

    _onTrigger: function(evt) {
        const now = Date.now();
        // Vérifier que suffisamment de temps s'est écoulé depuis le dernier trigger
        if (now - this._lastTriggerTime < this._triggerDelay) {
            return;
        }
        this._lastTriggerTime = now;

        if (this.grabbedEl) {
            this.drop();
            return;
        }

        let targetEl = null;

        // Détection de proximité : trouver l'objet le plus proche du centre de la manette
        const controllerPos = new THREE.Vector3();
        if (this.el.object3D) {
            this.el.object3D.getWorldPosition(controllerPos);
        }

        const sceneEl = document.querySelector('a-scene');
        const interactables = sceneEl.querySelectorAll('.interactable');
        let closestEl = null;
        let closestDist = 0.3; // Distance max de détection (30cm)

        interactables.forEach(el => {
            if (!el.object3D) return;
            
            const elPos = new THREE.Vector3();
            el.object3D.getWorldPosition(elPos);
            const dist = controllerPos.distanceTo(elPos);

            if (dist < closestDist) {
                closestDist = dist;
                closestEl = el;
            }
        });

        // Si on trouve un objet proche, on le saisit
        if (closestEl) {
            targetEl = closestEl;
        } else {
            // Fallback: utiliser le raycaster si aucun objet n'est assez proche
            if (this.raycaster && this.raycaster.intersectedEls) {
                targetEl = this.raycaster.intersectedEls.find(el =>
                    el.classList && el.classList.contains('interactable')
                );
            }
        }

        if (!targetEl) return;

        this.lockInputs(100);

        // Cloner si c'est un original, sinon saisir directement
        if (targetEl.dataset.isOriginal === 'true') {
            this._createCloneAndGrab(targetEl);
        } else {
            this.grab(targetEl);
        }
    },

    _onTriggerUp: function() {
        if (this.grabbedEl) this.drop();
    },

    _onPointerUp: function(evt) {
        if (!this.grabbedEl) return;

        const clientX = evt.clientX !== undefined ? evt.clientX : this._lastPointer.x;
        const clientY = evt.clientY !== undefined ? evt.clientY : this._lastPointer.y;

        const worldPos = (clientX != null && clientY != null)
            ? this._raycastFromCamera(clientX, clientY)
            : this._raycastFromCameraFallback();

        this.drop(worldPos);
    },

    _raycastFromCameraFallback: function() {
        const cameraEl = document.querySelector('#camera');
        const threeCamera = cameraEl && cameraEl.getObject3D('camera');
        if (!threeCamera) {
            const fallback = new THREE.Vector3();
            if (this.grabbedEl && this.grabbedEl.object3D) {
                this.grabbedEl.object3D.getWorldPosition(fallback);
            }
            return fallback;
        }
        return new THREE.Vector3(0, 0, -1.5).applyMatrix4(threeCamera.matrixWorld);
    },

    _raycastFromCamera: function(clientX, clientY) {
        const cameraEl = document.querySelector('#camera');
        const threeCamera = cameraEl && cameraEl.getObject3D('camera');
        if (!threeCamera) {
            const fallback = new THREE.Vector3();
            if (this.grabbedEl && this.grabbedEl.object3D) {
                this.grabbedEl.object3D.getWorldPosition(fallback);
            }
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
        sceneEl.object3D.traverse(function(child) {
            if (child.isMesh) objs.push(child);
        });
        const hits = raycaster.intersectObjects(objs, true);
        if (hits && hits.length) return hits[0].point.clone();

        return new THREE.Vector3(0, 0, -1.5).applyMatrix4(threeCamera.matrixWorld);
    },

    grab: function (el) {
        this.grabbedEl = el;

        const currentScale = el.getAttribute && el.getAttribute('scale');
        this._savedScale = currentScale ? {
            x: currentScale.x,
            y: currentScale.y,
            z: currentScale.z
        } : null;

        // Sauvegarder la rotation initiale de l'objet
        const currentRotation = el.getAttribute('rotation');
        if (currentRotation) {
            this._savedRotation = { ...currentRotation };
            // Convertir en quaternion pour les calculs
            this._savedRotationQuat = new THREE.Quaternion();
            const euler = new THREE.Euler(
                THREE.MathUtils.degToRad(currentRotation.x || 0),
                THREE.MathUtils.degToRad(currentRotation.y || 0),
                THREE.MathUtils.degToRad(currentRotation.z || 0),
                'YXZ'
            );
            this._savedRotationQuat.setFromEuler(euler);
        }

        // Sauvegarder la rotation initiale de la main
        if (this.el.object3D) {
            this._handRotationAtGrab = new THREE.Quaternion();
            this.el.object3D.getWorldQuaternion(this._handRotationAtGrab);
        }

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

        const hasInfiniteSupply = this.grabbedEl.hasAttribute('infinite-supply');
        const isOriginal = this.grabbedEl.dataset.isOriginal === 'true';

        this.lockInputs(50);

        const cameraEl = document.querySelector('#camera');
        const cameraPos = new THREE.Vector3();
        if (cameraEl && cameraEl.object3D) {
            cameraEl.object3D.getWorldPosition(cameraPos);
        }

        let finalPos = worldPosOptional ? worldPosOptional.clone() : (() => {
            const p = new THREE.Vector3();
            if (this.grabbedEl && this.grabbedEl.object3D) {
                this.grabbedEl.object3D.getWorldPosition(p);
            }
            return p;
        })();

        if (cameraPos && finalPos) {
            const dir = new THREE.Vector3().subVectors(finalPos, cameraPos);
            const dist = dir.length();
            const minDist = 0.4;
            const maxDist = 3.0;
            if (dist < minDist || dist > maxDist) {
                dir.normalize();
                const clamped = new THREE.Vector3()
                    .copy(cameraPos)
                    .add(dir.multiplyScalar(Math.min(Math.max(dist, minDist), maxDist)));
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

        this.grabbedEl.setAttribute('position', {
            x: finalPos.x,
            y: finalPos.y,
            z: finalPos.z
        });

        if (this._savedScale) {
            const s = this._savedScale;
            this.grabbedEl.setAttribute('scale', `${s.x} ${s.y} ${s.z}`);
            if (this.grabbedEl.object3D && this.grabbedEl.object3D.scale) {
                this.grabbedEl.object3D.scale.set(s.x, s.y, s.z);
            }
        }

        // Nettoyer les données de grip
        this._savedRotation = null;
        this._savedRotationQuat = null;
        this._handRotationAtGrab = null;

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
            this.grabbedEl.emit('dropped');
        }

        this._savedScale = null;
        this.grabbedEl = null;
    },

    _createCloneAndGrab: function(originalEl) {
        if (!originalEl || originalEl.dataset.isClone === 'true') return;

        const scene = this.el.sceneEl || document.querySelector('a-scene');
        if (!scene) return;

        const gltf = originalEl.getAttribute('gltf-model') || originalEl.getAttribute('src');
        const position = originalEl.getAttribute('position') || { x:0, y:0, z:0 };
        const rotation = originalEl.getAttribute('rotation') || { x:0, y:0, z:0 };
        const scale = originalEl.getAttribute('scale') || { x:1, y:1, z:1 };
        const itemType = originalEl.getAttribute('item-type') || '';
        const physxBody = originalEl.getAttribute('physx-body');

        const clone = document.createElement('a-entity');
        clone.classList.add('interactable');
        if (gltf) clone.setAttribute('gltf-model', gltf);
        clone.setAttribute('position', position);
        clone.setAttribute('rotation', rotation);
        clone.setAttribute('scale', scale);
        if (itemType) clone.setAttribute('item-type', itemType);
        if (physxBody) clone.setAttribute('physx-body', physxBody);
        clone.setAttribute('stackable', '');
        clone.dataset.isClone = 'true';
        clone.dataset.isOriginal = 'false';

        const baseId = originalEl.id || itemType || 'entity';
        clone.id = baseId + '-clone-' + Date.now();

        scene.appendChild(clone);

        let grabbed = false;
        const tryGrab = () => {
            if (grabbed) return;
            grabbed = true;
            this.grab(clone);
        };

        const onModelLoaded = () => {
            clone.removeEventListener('model-loaded', onModelLoaded);
            tryGrab();
        };

        clone.addEventListener('model-loaded', onModelLoaded);

        setTimeout(() => {
            if (!grabbed) {
                clone.removeEventListener('model-loaded', onModelLoaded);
                tryGrab();
            }
        }, 2000);
    }
});

