(function () {
// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// An original, deliberately shallow facade treatment for the 425 Seventh Street
// jail. Reference: OSM way 103383866; Sheriff's 2024 briefing p.6
// https://media.api.sf.gov/documents/4._CCG_Briefing_2024_Revised_Power_Point_COD.pdf
// and the 2025/undated exterior photographs linked in the site survey. No photo
// pixels or external assets are copied. Dimensions and the painted relief are
// estimates fitted to the city's existing lidar mass, not a measured replica.
//
// Everything is coplanar with an EXISTING solid face. Polygon offset resolves
// depth fighting without moving the geometry into the sidewalk: the curved
// glazing and canopy are a facade illustration, not projecting collision.
const N = window.NYC;

function buildSFJailExterior(group, box, ground) {
  const { THREE } = N;
  if (!box || !Number.isFinite(ground) || Math.abs(box.x + 249.74118) > 0.02 ||
      Math.abs(box.z - 1495.6925) > 0.02 || Math.abs(box.w - 86.5) > 0.02 ||
      Math.abs(box.d - 35.5) > 0.02 || Math.abs(box.ry - 0.78144717) > 0.0001 ||
      ground + 12.5 >= box.y + box.h / 2) {
    throw new Error('425 Seventh Street source mass changed; re-survey the jail facade');
  }
  const site = new THREE.Group();
  site.name = 'SFJail425Exterior';
  site.position.set(box.x, 0, box.z);
  site.rotation.y = box.ry;
  const faceX = -box.w / 2;
  const layers = new Map();
  // Coordinates are metres along the wall and above the sampled street grade.
  // The original source mass has wings at approximately z=-2.25 and z=8.25
  // in its local frame. Fit inside that recessed, visible 10.5 m opening.
  function polygon(color, depth, points) {
    const key = `${color}:${depth}`;
    if (!layers.has(key)) layers.set(key, { color, depth, positions: [] });
    const p = layers.get(key).positions;
    for (let i = 1; i + 1 < points.length; i++) {
      for (const [z, y] of [points[0], points[i], points[i + 1]]) p.push(faceX, ground + y, 3 + z * 0.65);
    }
  }
  function rect(color, depth, x0, y0, x1, y1) {
    polygon(color, depth, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  }

  // Light limestone panel, rounded-looking glazed lobby and the dark fascia of
  // its canopy. The latter is a flat representation to preserve every actor path.
  rect(0xcfcac0, 1, -7.3, 0.12, 7.3, 12.1);
  const top = z => 7.1 + 1.4 * Math.sqrt(Math.max(0, 1 - (z / 5.7) ** 2));
  const sections = 12, step = 11.4 / sections;
  for (let i = 0; i < sections; i++) {
    const a = -5.7 + i * step, b = a + step;
    polygon(i % 3 === 1 ? 0x507180 : 0x334d5b, 2,
      [[a, 0.2], [b, 0.2], [b, top(b)], [a, top(a)]]);
    rect(0x9ca8a7, 3, a, 0.2, a + 0.06, top(a));
    polygon(0x202b30, 3, [[a, top(a) - 0.15], [b, top(b) - 0.15],
      [b, top(b) + 0.42], [a, top(a) + 0.42]]);
  }
  rect(0xb4bfbd, 3, -5.7, 3.0, 5.7, 3.08);
  // Framed pair of entrance doors.
  rect(0x263b44, 3, -1.25, 0.2, 1.25, 3.45);
  for (const x of [-1.25, -0.03, 1.19]) rect(0xb9c1bc, 4, x, 0.2, x + 0.06, 3.45);
  rect(0xb9c1bc, 4, -1.25, 3.39, 1.25, 3.45);
  // Gold sheriff-star-inspired emblem and vector 425. Seven-segment numerals
  // avoid canvas textures, font dependencies and additional async resources.
  const star = [];
  for (let i = 0; i < 12; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 6, radius = i % 2 ? 0.77 : 1.35;
    star.push([Math.cos(angle) * radius, 10.15 + Math.sin(angle) * radius]);
  }
  for (let i = 0; i < star.length; i++) polygon(0xb9953b, 3, [[0, 10.15], star[i], star[(i + 1) % star.length]]);
  rect(0x28363a, 4, -0.84, 9.84, 0.84, 10.47);
  const digits = [
    ['b', 'c', 'f', 'g'], ['a', 'b', 'd', 'e', 'g'], ['a', 'c', 'd', 'f', 'g']
  ];
  const segments = {
    a: [0.04, 0.43, 0.34, 0.49], b: [0.31, 0.25, 0.37, 0.45],
    c: [0.31, 0.04, 0.37, 0.25], d: [0.04, 0, 0.34, 0.06],
    e: [0.01, 0.04, 0.07, 0.25], f: [0.01, 0.25, 0.07, 0.45],
    g: [0.04, 0.215, 0.34, 0.275]
  };
  digits.forEach((segmentsOn, i) => segmentsOn.forEach(name => {
    const [x0, y0, x1, y1] = segments[name], x = -0.67 + i * 0.48;
    rect(0xf5e5ae, 5, x + x0, 9.91 + y0, x + x1, 9.91 + y1);
  }));
  for (const { color, depth, positions } of layers.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardNodeMaterial({ color, roughness: 0.78, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -depth, polygonOffsetUnits: -depth });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    site.add(mesh);
  }
  group.add(site);
  return site;
}
N.buildSFJailExterior = buildSFJailExterior;
})();
