// javascript
// Interaction helpers for the A-Frame scene.
// - change color on click / trigger
// - spawn a small cube in front of the camera on controller A button
(function () {
    var THREE = AFRAME && AFRAME.THREE ? AFRAME.THREE : window.THREE;

    function randColor() {
        return "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
    }

    function setupInteractions() {
        var scene = document.querySelector("a-scene");
        var rig = document.getElementById("cameraRig");
        var rightCtrl = document.getElementById("rightController");
        var box = document.getElementById("myBox");
        var sphere = document.getElementById("mySphere");

        if (box) {
            box.addEventListener("click", function () {
                box.setAttribute("color", randColor());
                console.log("[scene] myBox clicked");
            });
        }

        if (rightCtrl && sphere) {
            rightCtrl.addEventListener("triggerdown", function () {
                sphere.setAttribute("color", randColor());
                console.log("[scene] mySphere triggerdown");
            });
        }

        function spawnCube() {
            if (!scene || !rig) return;
            var cube = document.createElement("a-box");
            cube.setAttribute("color", randColor());
            cube.setAttribute("depth", "0.25");
            cube.setAttribute("height", "0.25");
            cube.setAttribute("width", "0.25");
            cube.classList.add("interactable");

            // compute position 1m in front of camera
            try {
                var camWorldPos = new THREE.Vector3();
                var camWorldDir = new THREE.Vector3();
                rig.object3D.getWorldPosition(camWorldPos);
                rig.object3D.getWorldDirection(camWorldDir);
                var px = camWorldPos.x + camWorldDir.x * 1.0;
                var py = camWorldPos.y + camWorldDir.y * 1.0;
                var pz = camWorldPos.z + camWorldDir.z * 1.0;
                cube.setAttribute("position", px + " " + py + " " + pz);
            } catch (e) {
                // fallback position
                cube.setAttribute("position", "0 1 -1");
            }

            scene.appendChild(cube);
            console.log("[scene] spawned cube");
        }

        if (rightCtrl) {
            rightCtrl.addEventListener("abuttondown", function () {
                spawnCube();
            });
        }

        // allow clicking spawned objects with mouse (cursor rayOrigin: mouse)
        document.addEventListener("click", function (ev) {
            // nothing extra needed, A-Frame handles click propagation
        });

        console.log("[scene] interactions set up");
    }

    // Wait for scene to be loaded
    var sceneEl = document.querySelector("a-scene");
    if (sceneEl) {
        if (sceneEl.hasLoaded) {
            setupInteractions();
        } else {
            sceneEl.addEventListener("loaded", setupInteractions);
        }
    } else {
        // fallback if scene not found immediately
        window.addEventListener("load", function () {
            var s = document.querySelector("a-scene");
            if (s) {
                if (s.hasLoaded) setupInteractions();
                else s.addEventListener("loaded", setupInteractions);
            }
        });
    }
})();
