import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NO_TINT, setTint, type Tint } from './materials';

/**
 * Collects the parts of one flower head (or sprig, or leaf), then merges them into one mesh
 * per material. A rose used to be 17 meshes; it is now one draw call.
 *
 * Petal placement follows the head convention: `petal(spin, closure)` spins the petal around
 * the head axis (+Z), then tilts it toward the axis by `closure` radians.
 *
 * Merged geometries are built for this head only and are flagged `userData.owned`, so the
 * bouquet's dispose() frees them. The source geometries (petal cache) are left untouched.
 */
export class HeadAssembler {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private extras: THREE.Object3D[] = [];
  private static readonly m = new THREE.Matrix4();
  private static readonly r = new THREE.Matrix4();

  /** Add a petal with the head convention (spin around +Z, tilt by closure). */
  petal(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    spin: number,
    closure: number,
    radialOffset = 0,
    lift = 0,
    tint: Tint = NO_TINT,
  ): this {
    const m = HeadAssembler.m.makeRotationZ(spin);
    m.multiply(HeadAssembler.r.makeTranslation(0, radialOffset, lift));
    m.multiply(HeadAssembler.r.makeRotationX(closure));
    return this.place(geo, mat, m, tint);
  }

  /** Add any geometry with an arbitrary transform (head space). */
  place(geo: THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4, tint: Tint = NO_TINT): this {
    const g = geo.clone();
    g.applyMatrix4(matrix);
    setTint(g, tint);
    const list = this.parts.get(mat);
    if (list) list.push(g);
    else this.parts.set(mat, [g]);
    return this;
  }

  /** Add an object that is not merged (e.g. a lit sphere with another material type). */
  add(obj: THREE.Object3D): this {
    this.extras.push(obj);
    return this;
  }

  build(): THREE.Group {
    const group = new THREE.Group();
    for (const [mat, geos] of this.parts) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) throw new Error('HeadAssembler: incompatible geometries');
      if (geos.length > 1) geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.userData.owned = true;
      group.add(mesh);
    }
    for (const e of this.extras) group.add(e);
    this.parts.clear();
    this.extras = [];
    return group;
  }
}
