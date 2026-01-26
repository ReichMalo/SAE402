const points = []; 

function createCanvasFromPoints(points, sceneEl) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([
      points[0].x, points[0].y + 0.01, points[0].z,
      points[1].x, points[1].y + 0.01, points[1].z,
      points[2].x, points[2].y + 0.01, points[2].z,
      points[3].x, points[3].y + 0.01, points[3].z
    ]), 3
  ));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: 0xff0000,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7
  }));
  
  const entity = document.createElement('a-entity');
  entity.setObject3D('mesh', mesh);
  sceneEl.appendChild(entity);
}

AFRAME.registerComponent('hit-pointer', {
  init: function () {
    this.el.addEventListener('click', (evt) => {
      if (points.length >= 4) return;
      
      const point = evt.detail.intersection.point;
      const sceneEl = this.el.sceneEl;
      const marker = document.createElement('a-sphere');
      marker.setAttribute('position', `${point.x} ${point.y + 0.05} ${point.z}`);
      marker.setAttribute('radius', 0.05);
      marker.setAttribute('color', 'yellow');
      sceneEl.appendChild(marker);
      points.push(point);
      
      if (points.length === 4) {
        createCanvasFromPoints(points, sceneEl);
      }
    });
  },
  remove: function () {}
});