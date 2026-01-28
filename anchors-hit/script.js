/* -----------------------------
   1) Hint (перед очима)
------------------------------ */
AFRAME.registerComponent("ar-ui", {
  init: function () {
    this.sceneEl = this.el;
    this.cameraEl = this.sceneEl.querySelector("[camera]");
    this.hintEl = null;

    this.onEnterVR = this.onEnterVR.bind(this);
    this.onExitVR = this.onExitVR.bind(this);

    this.sceneEl.addEventListener("enter-vr", this.onEnterVR);
    this.sceneEl.addEventListener("exit-vr", this.onExitVR);
  },

  remove: function () {
    this.sceneEl.removeEventListener("enter-vr", this.onEnterVR);
    this.sceneEl.removeEventListener("exit-vr", this.onExitVR);
  },

  onEnterVR: function () {
    if (this.sceneEl.is("ar-mode") === false) return;
    if (this.cameraEl === null) return;

    if (this.hintEl === null) {
      var t = document.createElement("a-text");
      t.setAttribute(
        "value",
        "Aim at a real surface.\nPress Trigger to pick 4 points.\nA tile will appear.",
      );
      t.setAttribute("color", "#FFFFFF");
      t.setAttribute("align", "center");
      t.setAttribute("width", "2.4");
      t.setAttribute("position", "0 0 -1.2");
      t.setAttribute("opacity", "0.95");
      this.cameraEl.appendChild(t);
      this.hintEl = t;
    }

    this.hintEl.setAttribute("visible", "true");
  },

  onExitVR: function () {
    if (this.hintEl !== null) {
      this.hintEl.setAttribute("visible", "false");
    }
  },
});

/* -----------------------------------------
   2) Real WebXR Hit-Test -> рухаємо курсор
------------------------------------------ */
AFRAME.registerComponent("hit-test-cursor", {
  schema: {
    cursor: { type: "selector" }, // #cursor
    ring: { type: "selector" }, // #cursorRing
  },

  init: function () {
    this.sceneEl = this.el;
    this.cursorEl = this.data.cursor;
    this.ringEl = this.data.ring;

    this.session = null;
    this.refSpace = null;
    this.viewerSpace = null;
    this.hitTestSource = null;

    this.lastPose = null;

    this._mat = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();

    this.onEnterVR = this.onEnterVR.bind(this);
    this.onExitVR = this.onExitVR.bind(this);
    this.onXRFrame = this.onXRFrame.bind(this);

    this.sceneEl.addEventListener("enter-vr", this.onEnterVR);
    this.sceneEl.addEventListener("exit-vr", this.onExitVR);

    if (this.cursorEl) this.cursorEl.setAttribute("visible", "false");
  },

  remove: function () {
    this.sceneEl.removeEventListener("enter-vr", this.onEnterVR);
    this.sceneEl.removeEventListener("exit-vr", this.onExitVR);
  },

  onEnterVR: function () {
    if (this.sceneEl.is("ar-mode") === false) return;

    if (this.sceneEl.renderer === undefined) return;
    if (this.sceneEl.renderer.xr === undefined) return;

    var session = this.sceneEl.renderer.xr.getSession();
    if (session === null) return;

    this.session = session;

    var self = this;

    session.requestReferenceSpace("viewer").then(function (vs) {
      self.viewerSpace = vs;

      session.requestReferenceSpace("local-floor").then(function (rs) {
        self.refSpace = rs;

        session
          .requestHitTestSource({ space: self.viewerSpace })
          .then(function (src) {
            self.hitTestSource = src;
            self.lastPose = null;

            if (self.cursorEl) self.cursorEl.setAttribute("visible", "false");

            session.requestAnimationFrame(self.onXRFrame);
          });
      });
    });
  },

  onExitVR: function () {
    if (this.hitTestSource !== null) {
      this.hitTestSource.cancel();
      this.hitTestSource = null;
    }

    this.session = null;
    this.refSpace = null;
    this.viewerSpace = null;
    this.lastPose = null;

    if (this.cursorEl) this.cursorEl.setAttribute("visible", "false");
  },

  onXRFrame: function (time, frame) {
    var session = frame.session;
    session.requestAnimationFrame(this.onXRFrame);

    if (this.hitTestSource === null) return;
    if (this.refSpace === null) return;
    if (this.cursorEl === null) return;

    var results = frame.getHitTestResults(this.hitTestSource);

    if (results.length === 0) {
      this.cursorEl.setAttribute("visible", "false");
      this.lastPose = null;
      return;
    }

    var pose = results[0].getPose(this.refSpace);
    if (pose === null) {
      this.cursorEl.setAttribute("visible", "false");
      this.lastPose = null;
      return;
    }

    this.lastPose = pose;

    // Позиція + орієнтація курсора
    this._mat.fromArray(pose.transform.matrix);
    this._pos.setFromMatrixPosition(this._mat);
    this._quat.setFromRotationMatrix(this._mat);

    this.cursorEl.setAttribute("visible", "true");
    this.cursorEl.object3D.position.copy(this._pos);
    this.cursorEl.object3D.quaternion.copy(this._quat);

    // Підлога/стіна: міняємо rotation кільця
    this.updateRingRotation(pose);
  },

  updateRingRotation: function (pose) {
    if (this.ringEl === null) return;
    if (pose.transform === undefined) return;
    if (pose.transform.orientation === undefined) return;

    var o = pose.transform.orientation;
    var q = new THREE.Quaternion(o.x, o.y, o.z, o.w);

    var normal = new THREE.Vector3(0, 1, 0);
    normal.applyQuaternion(q);

    var isFloor = false;
    if (normal.y > 0.75) isFloor = true;
    if (normal.y < -0.75) isFloor = true;

    if (isFloor) {
      this.ringEl.setAttribute("rotation", "-90 0 0"); // горизонтально
    } else {
      this.ringEl.setAttribute("rotation", "0 0 0"); // вертикально
    }
  },
});

/* ------------------------------------------------
   3) 4 точки + плитка (mesh) між ними
------------------------------------------------- */
AFRAME.registerComponent("zone-tool", {
  schema: {
    root: { type: "selector" }, // #anchor-root
    cursor: { type: "selector" }, // #cursor
    max: { type: "int", default: 4 },
  },

  init: function () {
    this.sceneEl = this.el;
    this.rootEl = this.data.root;
    this.cursorEl = this.data.cursor;

    this.points = [];
    this.tileEl = null;
    this.session = null;

    this.onEnterVR = this.onEnterVR.bind(this);
    this.onExitVR = this.onExitVR.bind(this);
    this.onSelect = this.onSelect.bind(this);

    this.sceneEl.addEventListener("enter-vr", this.onEnterVR);
    this.sceneEl.addEventListener("exit-vr", this.onExitVR);
  },

  remove: function () {
    this.sceneEl.removeEventListener("enter-vr", this.onEnterVR);
    this.sceneEl.removeEventListener("exit-vr", this.onExitVR);
  },

  onEnterVR: function () {
    if (this.sceneEl.is("ar-mode") === false) return;
    if (this.sceneEl.renderer === undefined) return;
    if (this.sceneEl.renderer.xr === undefined) return;

    var session = this.sceneEl.renderer.xr.getSession();
    if (session === null) return;

    this.session = session;
    session.addEventListener("select", this.onSelect);
  },

  onExitVR: function () {
    if (this.session !== null) {
      this.session.removeEventListener("select", this.onSelect);
    }
    this.session = null;
    this.points = [];

    if (this.tileEl !== null) {
      this.rootEl.removeChild(this.tileEl);
      this.tileEl = null;
    }
  },

  onSelect: function () {
    if (this.cursorEl === null) return;

    var v = this.cursorEl.getAttribute("visible");
    if (v !== true && v !== "true") return;

    var p = this.cursorEl.object3D.position;

    if (this.points.length < this.data.max) {
      this.points.push(new THREE.Vector3(p.x, p.y, p.z));
      this.addMarker(p.x, p.y, p.z);

      if (this.points.length === this.data.max) {
        this.buildTile();
      }
      return;
    }

    // після плитки можна розміщувати об’єкти — додамо пізніше (inside-check)
  },

  addMarker: function (x, y, z) {
    var m = document.createElement("a-sphere");
    m.setAttribute("radius", "0.03");
    m.setAttribute("color", "#00c8ff");
    m.setAttribute("position", x + " " + (y + 0.01) + " " + z);
    this.rootEl.appendChild(m);
  },

  buildTile: function () {
    // points: p0 p1 p2 p3 (як користувач клікнув)
    var p0 = this.points[0];
    var p1 = this.points[1];
    var p2 = this.points[2];
    var p3 = this.points[3];

    // база площини: xAxis = (p1-p0), zAxis = (p3-p0), yAxis = нормаль
    var xAxis = new THREE.Vector3().subVectors(p1, p0);
    if (xAxis.length() === 0) return;
    xAxis.normalize();

    var zAxis = new THREE.Vector3().subVectors(p3, p0);
    if (zAxis.length() === 0) return;
    zAxis.normalize();

    var yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
    if (yAxis.length() === 0) return;
    yAxis.normalize();

    // зробимо zAxis перпендикулярною (щоб не було перекосу)
    zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    zAxis.normalize();

    // локальні координати (u,v) для кожної точки
    var u0 = 0,
      v0 = 0;

    var d1 = new THREE.Vector3().subVectors(p1, p0);
    var u1 = d1.dot(xAxis);
    var v1 = d1.dot(zAxis);

    var d2 = new THREE.Vector3().subVectors(p2, p0);
    var u2 = d2.dot(xAxis);
    var v2 = d2.dot(zAxis);

    var d3 = new THREE.Vector3().subVectors(p3, p0);
    var u3 = d3.dot(xAxis);
    var v3 = d3.dot(zAxis);

    // геометрія: 2 трикутники (0-1-2) і (0-2-3)
    var positions = new Float32Array([
      u0,
      0,
      v0,
      u1,
      0,
      v1,
      u2,
      0,
      v2,

      u0,
      0,
      v0,
      u2,
      0,
      v2,
      u3,
      0,
      v3,
    ]);

    var geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.computeVertexNormals();

    var mat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });

    var mesh = new THREE.Mesh(geom, mat);

    // entity для плитки
    var tile = document.createElement("a-entity");

    // позиція = p0, орієнтація = матриця з осей
    var m = new THREE.Matrix4();
    m.makeBasis(xAxis, yAxis, zAxis);

    tile.object3D.position.copy(p0);
    tile.object3D.setRotationFromMatrix(m);
    tile.object3D.add(mesh);

    // просте світло, щоб матеріал був видимий
    var light = this.sceneEl.querySelector("#zoneLight");
    if (light === null) {
      var l = document.createElement("a-entity");
      l.setAttribute("id", "zoneLight");
      l.setAttribute("light", "type: directional; intensity: 1");
      l.setAttribute("position", "0 4 0");
      this.sceneEl.appendChild(l);

      var amb = document.createElement("a-entity");
      amb.setAttribute("light", "type: ambient; intensity: 0.6");
      this.sceneEl.appendChild(amb);
    }

    this.rootEl.appendChild(tile);
    this.tileEl = tile;
  },
});
