import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FighterProfile, KOType, SlapAngle, WindUpCount } from '../data/fighters';

export type CameraPreset =
  | 'BROADCAST_WIDE'
  | 'PRE_SLAP_PUSH'
  | 'STRIKER_PROFILE'
  | 'IMPACT_MACRO'
  | 'KO_REPLAY_ORBIT';

export type FighterAnimState =
  | 'IDLE'
  | 'CHEEK_ALIGNMENT'
  | 'FLINCH_BAIT'
  | 'WIND_UP_TORQUE'
  | 'PRE_IMPACT_FREEZE'
  | 'SLAP_EXECUTION'
  | 'CHIN_BRACE'
  | 'HIT_LIGHT_CHEEK'
  | 'HIT_CHEEK_WHIP'
  | 'HIT_JAW_SNAP'
  | 'HIT_STAGGER_STEP'
  | 'HIT_STUMBLE_BACK'
  | 'KNOCKDOWN'
  | 'VICTORY';

interface FingerChain {
  proximal: THREE.Group;
  middle: THREE.Group;
  distal: THREE.Group;
}

interface ArticulatedHandRig {
  wristPivot: THREE.Group;
  palmMesh: THREE.Mesh;
  gauntletGlowStrip: THREE.Mesh;
  thumb: {
    base: THREE.Group;
    distal: THREE.Group;
  };
  fingers: FingerChain[];
}

interface FullBodyFighterRig {
  root: THREE.Group;
  hipsPivot: THREE.Group;
  spine1: THREE.Group;
  spine2: THREE.Group;
  chestGroup: THREE.Group;
  neckPivot: THREE.Group;
  headGroup: THREE.Group;
  sculptedHeadMesh: THREE.Mesh;
  leftCheekZone: THREE.Group;
  rightCheekZone: THREE.Group;

  // Articulated Arms & Heavy Fingerless Combat Gauntlets
  leftClavicle: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  leftHand: ArticulatedHandRig;

  rightClavicle: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  rightHand: ArticulatedHandRig;

  // Full Biped Legs, Armored Knee Pads & Heavy Combat Boots
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  leftBoot: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  rightBoot: THREE.Group;

  // Visual FX Meshes
  slapTrailArc: THREE.Mesh;
  auraRing: THREE.Mesh;
  cheekTargetRing: THREE.Mesh;

  // State & Biomechanics
  animState: FighterAnimState;
  stateTimer: number;
  windUpCount: WindUpCount;
  targetAngle: SlapAngle;
  torqueChargeLevel: number;
  recoilIntensity: number;
  headWhipAngle: number;
  footSlideOffset: number;
  armorIntegrity: number;
  koType: KOType;
  profile: FighterProfile;
  side: 'LEFT' | 'RIGHT';
  specialAuraActive: boolean;
}

const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _dummyMatrix = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyScale = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();

export class ArenaSceneController {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private textureLoader: THREE.TextureLoader;
  private isSoftwareGl: boolean;
  private frameId: number = 0;
  private isDisposed: boolean = false;

  private leftRig: FullBodyFighterRig | null = null;
  private rightRig: FullBodyFighterRig | null = null;
  private hqEnvironmentGroup: THREE.Group;
  private podiumScoreRing: THREE.Mesh | null = null;
  private slapFlashLight: THREE.PointLight | null = null;

  // 3D Crowd System (Avatars + Glow Sticks)
  private crowdInstancedMesh: THREE.InstancedMesh | null = null;
  private crowdGlowSticksMesh: THREE.InstancedMesh | null = null;
  private crowdBasePositions: Float32Array = new Float32Array(0);
  private crowdCount: number = 140;
  private crowdHypeLevel: number = 0.4;

  // Particle System (Chalk Dust + Sweat Spray + Dual Shockwaves)
  private particlePoints: THREE.Points | null = null;
  private particlePositions: Float32Array;
  private particleVelocities: Float32Array;
  private particleLife: Float32Array;
  private maxParticles = 280;
  private shockwaveRing: THREE.Mesh | null = null;
  private secondaryShockwaveRing: THREE.Mesh | null = null;
  private shockwaveScale: number = 0;
  private shockwaveOpacity: number = 0;

  // Camera & KO Slow-Mo Replay System
  private currentCameraPreset: CameraPreset = 'BROADCAST_WIDE';
  private activeCameraMode: CameraPreset = 'BROADCAST_WIDE';
  private currentLookAt = new THREE.Vector3(0, 1.32, 0);
  private screenShakeIntensity: number = 0;
  private cameraRollAngle: number = 0;
  private slowMoFactor: number = 1.0;
  private slowMoTimer: number = 0;
  private koFreezeTimer: number = 0;
  private koReplayTimer: number = 0;
  private koReplayOrbitAngle: number = 0;
  private activeStrikerSide: 'LEFT' | 'RIGHT' = 'LEFT';

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.textureLoader = new THREE.TextureLoader();

    this.isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050811);
    this.scene.fog = new THREE.FogExp2(0x050811, 0.024);

    const isPortraitMobile = width < 640;
    this.camera = new THREE.PerspectiveCamera(
      isPortraitMobile ? 52 : 39,
      width / height,
      0.1,
      140
    );
    this.camera.position.set(0, 1.88, isPortraitMobile ? 6.2 : 4.95);
    this.camera.lookAt(0, 1.32, 0);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    this.hqEnvironmentGroup = new THREE.Group();
    this.scene.add(this.hqEnvironmentGroup);

    this.particlePositions = new Float32Array(this.maxParticles * 3);
    this.particleVelocities = new Float32Array(this.maxParticles * 3);
    this.particleLife = new Float32Array(this.maxParticles);

    this.setupLighting();
    this.buildArenaStageAndPodium();
    this.build3DCrowdSystem();
    this.buildParticleSystem();

    window.addEventListener('resize', this.handleResize);
    this.startLoop();
  }

  private setupLighting(): void {
    const keyLight = new THREE.DirectionalLight(0xfff7e6, 3.1);
    keyLight.position.set(3.2, 8.0, 5.5);
    keyLight.castShadow = !this.isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      const d = 4.8;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e1b4b, 1.25);
    this.scene.add(hemiLight);

    const rimLight = new THREE.SpotLight(
      0xfbbf24,
      5.8,
      26,
      Math.PI / 3.2,
      0.4,
      1
    );
    rimLight.position.set(0, 7.2, -4.5);
    rimLight.target.position.set(0, 1.35, 0);
    this.scene.add(rimLight);
    this.scene.add(rimLight.target);

    const leftRim = new THREE.PointLight(0x00f0ff, 2.5, 12);
    leftRim.position.set(-4.0, 2.6, 2.2);
    this.scene.add(leftRim);

    const rightRim = new THREE.PointLight(0xf59e0b, 2.5, 12);
    rightRim.position.set(4.0, 2.6, 2.2);
    this.scene.add(rightRim);

    this.slapFlashLight = new THREE.PointLight(0xfffbeb, 0, 12);
    this.slapFlashLight.position.set(0, 1.65, 0.5);
    this.scene.add(this.slapFlashLight);
  }

  private buildArenaStageAndPodium(): void {
    const stageGroup = new THREE.Group();

    // Reflective Octagonal Championship Stage Floor with Neon Grid Lines
    const platformGeo = new THREE.CylinderGeometry(5.8, 6.5, 0.32, 8);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x090f1d,
      metalness: 0.88,
      roughness: 0.16,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -0.16;
    platform.receiveShadow = true;
    stageGroup.add(platform);

    const gridHelper = new THREE.GridHelper(10, 20, 0x00f0ff, 0x1e293b);
    gridHelper.position.y = 0.005;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.35;
    stageGroup.add(gridHelper);

    const goldMetalMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.96,
      roughness: 0.14,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const trimGeo = new THREE.RingGeometry(4.75, 5.02, 32);
    trimGeo.rotateX(-Math.PI / 2);
    const trimRing = new THREE.Mesh(trimGeo, goldMetalMat);
    trimRing.position.y = 0.012;
    stageGroup.add(trimRing);

    // Central Sculpted Metallic Power Slap Podium (Positioned slightly forward so fighters' arms reach over it)
    const podiumGroup = new THREE.Group();
    podiumGroup.position.set(0, 0, 0.15);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.68, 0.12, 8),
      goldMetalMat
    );
    plinth.position.y = 0.06;
    plinth.castShadow = true;
    podiumGroup.add(plinth);

    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.92,
      roughness: 0.16,
    });
    const podiumBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.48, 0.68, 8),
      titaniumMat
    );
    podiumBody.position.y = 0.46;
    podiumBody.castShadow = true;
    podiumGroup.add(podiumBody);

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const strut = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.66, 0.075),
        goldMetalMat
      );
      strut.position.set(Math.cos(angle) * 0.4, 0.46, Math.sin(angle) * 0.4);
      strut.rotation.y = -angle;
      podiumGroup.add(strut);
    }

    const topMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.78,
      roughness: 0.22,
    });
    const podiumTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.09, 0.84),
      topMat
    );
    podiumTop.position.y = 0.84;
    podiumTop.castShadow = true;
    podiumGroup.add(podiumTop);

    // Gold Trim & Defender Grip Bars on Podium
    const barGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.62, 12);
    barGeo.rotateX(Math.PI / 2);
    const leftBar = new THREE.Mesh(barGeo, goldMetalMat);
    leftBar.position.set(-0.33, 0.87, 0);
    podiumGroup.add(leftBar);

    const rightBar = new THREE.Mesh(barGeo, goldMetalMat);
    rightBar.position.set(0.33, 0.87, 0);
    podiumGroup.add(rightBar);

    const holoGeo = new THREE.TorusGeometry(0.45, 0.018, 12, 48);
    holoGeo.rotateX(Math.PI / 2);
    const holoMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.88,
    });
    this.podiumScoreRing = new THREE.Mesh(holoGeo, holoMat);
    this.podiumScoreRing.position.y = 0.48;
    podiumGroup.add(this.podiumScoreRing);

    stageGroup.add(podiumGroup);
    this.scene.add(stageGroup);
  }

  private build3DCrowdSystem(): void {
    this.crowdCount = this.isSoftwareGl ? 60 : 140;
    const avatarGeo = new THREE.CapsuleGeometry(0.18, 0.46, 4, 8);
    const avatarMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.35,
    });
    this.crowdInstancedMesh = new THREE.InstancedMesh(
      avatarGeo,
      avatarMat,
      this.crowdCount
    );

    const stickGeo = new THREE.BoxGeometry(0.06, 0.24, 0.03);
    const stickMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
    });
    this.crowdGlowSticksMesh = new THREE.InstancedMesh(
      stickGeo,
      stickMat,
      this.crowdCount
    );

    this.crowdBasePositions = new Float32Array(this.crowdCount * 3);

    for (let i = 0; i < this.crowdCount; i++) {
      const row = Math.floor(i / 28);
      const angle = ((i % 28) / 28) * Math.PI * 1.35 - Math.PI * 1.175;
      const radius = 6.8 + row * 1.25 + (Math.random() - 0.5) * 0.35;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 1.2;
      const y = 0.42 + row * 0.52;

      this.crowdBasePositions[i * 3] = x;
      this.crowdBasePositions[i * 3 + 1] = y;
      this.crowdBasePositions[i * 3 + 2] = z;

      _dummyPos.set(x, y, z);
      _dummyQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
      _dummyScale.set(1, 1, 1);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      this.crowdInstancedMesh.setMatrixAt(i, _dummyMatrix);

      _dummyPos.set(x + 0.14, y + 0.32, z + 0.1);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      this.crowdGlowSticksMesh.setMatrixAt(i, _dummyMatrix);
    }

    this.crowdInstancedMesh.instanceMatrix.needsUpdate = true;
    this.crowdGlowSticksMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.crowdInstancedMesh);
    this.scene.add(this.crowdGlowSticksMesh);
  }

  private buildParticleSystem(): void {
    const geo = new THREE.BufferGeometry();
    for (let i = 0; i < this.maxParticles; i++) {
      this.particlePositions[i * 3] = 0;
      this.particlePositions[i * 3 + 1] = -10;
      this.particlePositions[i * 3 + 2] = 0;
      this.particleLife[i] = 0;
    }
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePositions, 3)
    );

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.075,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particlePoints = new THREE.Points(geo, mat);
    this.scene.add(this.particlePoints);

    const ringGeo = new THREE.RingGeometry(0.14, 0.28, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.shockwaveRing = new THREE.Mesh(ringGeo, ringMat);
    this.shockwaveRing.position.set(0, 1.55, 0.25);
    this.scene.add(this.shockwaveRing);

    const secRingGeo = new THREE.RingGeometry(0.2, 0.32, 36);
    const secRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.secondaryShockwaveRing = new THREE.Mesh(secRingGeo, secRingMat);
    this.secondaryShockwaveRing.position.set(0, 1.55, 0.25);
    this.scene.add(this.secondaryShockwaveRing);
  }

  /**
   * Creates a 3D Sculpted Head Geometry whose front/side hemisphere UVs are mapped
   * directly to the character's face & hair region in the uploaded portrait image
   * (u: [0.27, 0.71], v: [0.56, 0.92]), eliminating any rectangular card or background globe!
   */
  private createUVMapped3DHeadGeometry(mirrorU: boolean): THREE.BufferGeometry {
    const geo = new THREE.SphereGeometry(0.32, 32, 28);
    // Stylized Brawler Head proportions matching the uploaded character art
    geo.scale(0.96, 1.12, 0.92);

    const posAttr = geo.attributes.position;
    const uvAttr = geo.attributes.uv;
    const vPos = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      vPos.fromBufferAttribute(posAttr, i);
      const nx = vPos.x / 0.31;
      const ny = vPos.y / 0.36;
      const nz = vPos.z / 0.29;

      if (nz >= -0.15) {
        // Front & temporal sides of the 3D head map directly to the character's face & hair in the uploaded image
        const rawU = 0.49 + (mirrorU ? -nx : nx) * 0.21;
        const rawV = 0.745 + ny * 0.175;
        uvAttr.setXY(
          i,
          THREE.MathUtils.clamp(rawU, 0.28, 0.7),
          THREE.MathUtils.clamp(rawV, 0.57, 0.915)
        );
      } else {
        // Back of cranium samples the top hair/scalp region of the character's head
        uvAttr.setXY(i, 0.49 + nx * 0.08, 0.88);
      }
    }
    uvAttr.needsUpdate = true;
    return geo;
  }

  /**
   * Creates a 3D Sculpted Armored Torso Geometry whose front chest plate UVs map
   * directly to the character's company chest armor & logo (SPACEX, NVIDIA, Meta, OpenAI, Claude, amazon, ORACLE, G, Microsoft)
   * in the uploaded portrait image (u: [0.30, 0.68], v: [0.36, 0.56]).
   */
  private createUVMapped3DTorsoGeometry(): THREE.BufferGeometry {
    const geo = new THREE.CylinderGeometry(0.28, 0.22, 0.42, 24, 8);
    geo.scale(1.18, 1.0, 0.82);

    const posAttr = geo.attributes.position;
    const uvAttr = geo.attributes.uv;
    const vPos = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      vPos.fromBufferAttribute(posAttr, i);
      const nx = vPos.x / 0.32;
      const ny = vPos.y / 0.21;
      const nz = vPos.z / 0.22;

      if (nz >= 0) {
        const u = THREE.MathUtils.clamp(0.49 + nx * 0.19, 0.3, 0.68);
        const v = THREE.MathUtils.clamp(0.46 + ny * 0.1, 0.36, 0.56);
        uvAttr.setXY(i, u, v);
      } else {
        // Back armor plate samples dark armor region
        uvAttr.setXY(i, 0.49, 0.38);
      }
    }
    uvAttr.needsUpdate = true;
    return geo;
  }

  /**
   * Builds a heavy, oversized, high-poly 5-finger articulated combat gauntlet & slap hand
   * matching the stylized fingerless combat gloves in the uploaded character art!
   */
  private createHeavyArticulatedGauntletHand(
    skinMat: THREE.Material,
    armorMat: THREE.Material,
    accentGlowMat: THREE.Material,
    chalkPalmMat: THREE.Material,
    isRightHand: boolean
  ): ArticulatedHandRig {
    const wristPivot = new THREE.Group();
    const mirror = isRightHand ? 1 : -1;

    // Heavy Wrist Bracer Cuff with Neon Trim
    const cuffMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.082, 0.088, 0.09, 12),
      armorMat
    );
    cuffMesh.position.set(0, 0.02, 0);
    wristPivot.add(cuffMesh);

    // Sculpted Palm Metacarpal Block (Fingerless Combat Glove Back + Chalked Open Palm)
    const palmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.065),
      armorMat
    );
    palmMesh.position.set(0, -0.09, 0);
    palmMesh.castShadow = true;
    wristPivot.add(palmMesh);

    // Chalk-Coated Inner Slap Pad
    const innerPalmPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.17, 0.025),
      chalkPalmMat
    );
    innerPalmPad.position.set(0, -0.09, 0.032 * mirror);
    wristPivot.add(innerPalmPad);

    // Glowing Neon LED Knuckle Strip on Dorsal Gauntlet (Matches uploaded art gloves!)
    const gauntletGlowStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.045, 0.02),
      accentGlowMat
    );
    gauntletGlowStrip.position.set(0, -0.085, -0.034 * mirror);
    wristPivot.add(gauntletGlowStrip);

    // 4 Articulated Fingers (Armored Proximal Knuckle + Exposed Skin Middle/Distal Phalanges)
    const fingerOffsets = [-0.062, -0.021, 0.021, 0.062];
    const fingerLengths = [0.95, 1.08, 1.0, 0.82];
    const fingers: FingerChain[] = [];

    for (let i = 0; i < 4; i++) {
      const fx = fingerOffsets[i];
      const lenScale = fingerLengths[i];

      const knuckleGuard = new THREE.Mesh(
        new THREE.BoxGeometry(0.036, 0.032, 0.048),
        armorMat
      );
      knuckleGuard.position.set(fx, -0.18, 0);
      wristPivot.add(knuckleGuard);

      const proximal = new THREE.Group();
      proximal.position.set(fx, -0.185, 0);
      const proxMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.019, 0.048 * lenScale, 6, 10),
        armorMat
      );
      proxMesh.position.y = -0.032 * lenScale;
      proximal.add(proxMesh);

      const middle = new THREE.Group();
      middle.position.set(0, -0.064 * lenScale, 0);
      const midMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.0175, 0.042 * lenScale, 6, 10),
        skinMat
      );
      midMesh.position.y = -0.028 * lenScale;
      middle.add(midMesh);
      proximal.add(middle);

      const distal = new THREE.Group();
      distal.position.set(0, -0.052 * lenScale, 0);
      const distMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.016, 0.034 * lenScale, 6, 10),
        skinMat
      );
      distMesh.position.y = -0.022 * lenScale;
      distal.add(distMesh);
      middle.add(distal);

      wristPivot.add(proximal);
      fingers.push({ proximal, middle, distal });
    }

    // Articulated Heavy Thumb (2 Phalanges locked for Slap Stability)
    const thumbBase = new THREE.Group();
    thumbBase.position.set(-0.095, -0.075, 0.02 * mirror);
    thumbBase.rotation.z = -0.62;
    const thumbProxMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.022, 0.052, 6, 10),
      armorMat
    );
    thumbProxMesh.position.y = -0.032;
    thumbBase.add(thumbProxMesh);

    const thumbDistal = new THREE.Group();
    thumbDistal.position.set(0, -0.065, 0);
    const thumbDistMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.02, 0.042, 6, 10),
      skinMat
    );
    thumbDistMesh.position.y = -0.026;
    thumbDistal.add(thumbDistMesh);
    thumbBase.add(thumbDistal);

    wristPivot.add(thumbBase);

    return {
      wristPivot,
      palmMesh,
      gauntletGlowStrip,
      thumb: { base: thumbBase, distal: thumbDistal },
      fingers,
    };
  }

  /**
   * Builds a 3D UV-Mapped Contender Rig using the exact uploaded character texture
   * projected onto a 3D sculpted head and 3D armored torso, paired with chunky 3D limbs
   * and oversized 5-finger articulated combat gauntlets!
   */
  private createFull3DFighterRig(
    profile: FighterProfile,
    side: 'LEFT' | 'RIGHT',
    useGoldenArmor: boolean
  ): FullBodyFighterRig {
    const root = new THREE.Group();
    const xPos = side === 'LEFT' ? -0.78 : 0.78;
    root.position.set(xPos, 0, 0.15);
    // Angle slightly toward the camera (3/4 fighting stance) so both the 3D face & chest logo AND the opponent interaction are clearly visible!
    const baseFacingY = side === 'LEFT' ? Math.PI * 0.34 : -Math.PI * 0.34;
    root.rotation.y = baseFacingY;

    const charTexture = this.textureLoader.load(profile.imageUrl);
    charTexture.colorSpace = THREE.SRGBColorSpace;

    const primaryColor = new THREE.Color(
      useGoldenArmor ? '#F59E0B' : profile.primaryColor
    );
    const secondaryColor = new THREE.Color(
      useGoldenArmor ? '#FEF08A' : profile.secondaryColor
    );
    const accentColor = new THREE.Color(
      useGoldenArmor ? '#FFFBEB' : profile.accentColor
    );
    const skinColor = new THREE.Color(profile.skinTone);

    const primaryArmorMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      metalness: 0.75,
      roughness: 0.26,
    });
    const secondaryArmorMat = new THREE.MeshStandardMaterial({
      color: secondaryColor,
      metalness: 0.82,
      roughness: 0.2,
    });
    const accentGlowMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 1.8,
      roughness: 0.18,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.42,
      metalness: 0.06,
    });
    const chalkPalmMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: accentColor,
      emissiveIntensity: 0.22,
      roughness: 0.85,
    });
    const portraitLitMat = new THREE.MeshStandardMaterial({
      map: charTexture,
      roughness: 0.32,
      metalness: 0.12,
    });

    // 1. HIPS / PELVIS PIVOT
    const hipsPivot = new THREE.Group();
    hipsPivot.position.set(0, 0.78, 0);
    root.add(hipsPivot);

    const pelvisMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.2, 0.2, 12),
      primaryArmorMat
    );
    pelvisMesh.scale.set(1.18, 1, 0.82);
    pelvisMesh.castShadow = true;
    hipsPivot.add(pelvisMesh);

    // Heavy Tactical Belt with Metallic Buckle (matching uploaded character stance)
    const beltBuckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.09, 0.06),
      secondaryArmorMat
    );
    beltBuckle.position.set(0, 0.02, 0.17);
    hipsPivot.add(beltBuckle);

    // 2. WIDE BRAWLER LEGS, FACETED KNEE PADS & HEAVY COMBAT BOOTS
    const buildLeg = (isLeft: boolean) => {
      const lx = isLeft ? 0.17 : -0.17;
      const hipGroup = new THREE.Group();
      hipGroup.position.set(lx, -0.04, 0);
      hipsPivot.add(hipGroup);

      const thighMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.105, 0.24, 6, 12),
        primaryArmorMat
      );
      thighMesh.position.y = -0.16;
      thighMesh.castShadow = true;
      hipGroup.add(thighMesh);

      const kneeGroup = new THREE.Group();
      kneeGroup.position.set(0, -0.34, 0);
      hipGroup.add(kneeGroup);

      // Faceted Low-Poly Knee Pad + Neon LED Accent (matches the uploaded art!)
      const kneePad = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.095, 0),
        secondaryArmorMat
      );
      kneePad.position.set(0, 0, 0.05);
      kneeGroup.add(kneePad);

      const kneeLed = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 0.02),
        accentGlowMat
      );
      kneeLed.position.set(isLeft ? 0.04 : -0.04, -0.02, 0.12);
      kneeGroup.add(kneeLed);

      const shinMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.085, 0.28, 10),
        primaryArmorMat
      );
      shinMesh.position.y = -0.16;
      shinMesh.castShadow = true;
      kneeGroup.add(shinMesh);

      const bootGroup = new THREE.Group();
      bootGroup.position.set(0, -0.34, 0);
      kneeGroup.add(bootGroup);

      // Chunky Combat Boot with Neon Sole Trim
      const bootMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.13, 0.3),
        secondaryArmorMat
      );
      bootMesh.position.set(0, -0.02, 0.06);
      bootMesh.castShadow = true;
      bootGroup.add(bootMesh);

      const soleTrim = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 0.028, 0.31),
        accentGlowMat
      );
      soleTrim.position.set(0, -0.075, 0.06);
      bootGroup.add(soleTrim);

      return { hipGroup, kneeGroup, bootGroup };
    };

    const leftLeg = buildLeg(true);
    const rightLeg = buildLeg(false);

    // 3. 3-BONE SPINE & 3D UV-MAPPED ARMORED TORSO (Shows actual SPACEX/NVIDIA/Meta/OpenAI/etc. chest from uploaded image!)
    const spine1 = new THREE.Group();
    spine1.position.set(0, 0.08, 0);
    hipsPivot.add(spine1);

    const spine2 = new THREE.Group();
    spine2.position.set(0, 0.12, 0);
    spine1.add(spine2);

    const chestGroup = new THREE.Group();
    chestGroup.position.set(0, 0.04, 0);
    spine2.add(chestGroup);

    const torsoGeo = this.createUVMapped3DTorsoGeometry();
    const torsoMesh = new THREE.Mesh(torsoGeo, portraitLitMat);
    torsoMesh.position.y = 0.18;
    torsoMesh.castShadow = true;
    chestGroup.add(torsoMesh);

    // Armored Collar Rim around Neck Base
    const collarGeo = new THREE.TorusGeometry(0.18, 0.038, 10, 24);
    collarGeo.rotateX(Math.PI / 2);
    const collarMesh = new THREE.Mesh(collarGeo, secondaryArmorMat);
    collarMesh.position.set(0, 0.38, 0);
    chestGroup.add(collarMesh);

    // 4. NECK & 3D UV-MAPPED SCULPTED HEAD (Displays the exact uploaded character's face in 3D!)
    const neckPivot = new THREE.Group();
    neckPivot.position.set(0, 0.4, 0);
    chestGroup.add(neckPivot);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.06, 0);
    neckPivot.add(headGroup);

    const headGeo = this.createUVMapped3DHeadGeometry(side === 'RIGHT');
    const sculptedHeadMesh = new THREE.Mesh(headGeo, portraitLitMat);
    sculptedHeadMesh.position.set(0, 0.24, 0.02);
    sculptedHeadMesh.castShadow = true;
    headGroup.add(sculptedHeadMesh);

    // 3D Sculpted Ears on Left & Right of the 3D Head
    const leftEar = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 10),
      skinMat
    );
    leftEar.scale.set(0.45, 1.15, 0.7);
    leftEar.position.set(0.3, 0.22, 0);
    headGroup.add(leftEar);

    const rightEar = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 10),
      skinMat
    );
    rightEar.scale.set(0.45, 1.15, 0.7);
    rightEar.position.set(-0.3, 0.22, 0);
    headGroup.add(rightEar);

    const leftCheekZone = new THREE.Group();
    leftCheekZone.position.set(0.24, 0.18, 0.16);
    headGroup.add(leftCheekZone);

    const rightCheekZone = new THREE.Group();
    rightCheekZone.position.set(-0.24, 0.18, 0.16);
    headGroup.add(rightCheekZone);

    // Cheek Target Holographic Reticule on the Defender's Strike Cheek
    const targetRingGeo = new THREE.RingGeometry(0.065, 0.095, 28);
    const targetRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const cheekTargetRing = new THREE.Mesh(targetRingGeo, targetRingMat);
    const strikeCheekX = side === 'LEFT' ? -0.26 : 0.26;
    cheekTargetRing.position.set(strikeCheekX, 0.18, 0.18);
    cheekTargetRing.rotation.y = side === 'LEFT' ? -Math.PI / 3 : Math.PI / 3;
    headGroup.add(cheekTargetRing);

    // 5. MUSCULAR ARMS & HEAVY 5-FINGER ARTICULATED COMBAT GAUNTLETS
    const buildArm = (isRightArm: boolean) => {
      const sideSign = isRightArm ? -1 : 1;
      const clavicle = new THREE.Group();
      clavicle.position.set(sideSign * 0.24, 0.32, 0);
      chestGroup.add(clavicle);

      const shoulder = new THREE.Group();
      shoulder.position.set(sideSign * 0.12, 0, 0);
      clavicle.add(shoulder);

      // Faceted Low-Poly Shoulder Pauldron + Neon LED
      const pauldron = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.135, 0),
        secondaryArmorMat
      );
      pauldron.position.set(0, 0.02, 0);
      shoulder.add(pauldron);

      const pauldronLed = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.045, 0.02),
        accentGlowMat
      );
      pauldronLed.position.set(sideSign * 0.08, 0.02, 0.11);
      shoulder.add(pauldronLed);

      const bicepMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.082, 0.2, 6, 12),
        primaryArmorMat
      );
      bicepMesh.position.y = -0.15;
      bicepMesh.castShadow = true;
      shoulder.add(bicepMesh);

      const elbow = new THREE.Group();
      elbow.position.set(0, -0.28, 0);
      shoulder.add(elbow);

      const forearmMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.078, 0.2, 6, 12),
        secondaryArmorMat
      );
      forearmMesh.position.y = -0.14;
      forearmMesh.castShadow = true;
      elbow.add(forearmMesh);

      const handRig = this.createHeavyArticulatedGauntletHand(
        skinMat,
        secondaryArmorMat,
        accentGlowMat,
        chalkPalmMat,
        isRightArm
      );
      handRig.wristPivot.position.set(0, -0.26, 0);
      elbow.add(handRig.wristPivot);

      return { clavicle, shoulder, elbow, handRig };
    };

    const leftArm = buildArm(false);
    const rightArm = buildArm(true);

    // Volumetric Slap Arc Motion Trail Ribbon around the Fighter
    const arcGeo = new THREE.RingGeometry(0.55, 0.88, 32, 1, 0, Math.PI * 0.85);
    arcGeo.rotateX(-Math.PI / 2);
    const arcMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const slapTrailArc = new THREE.Mesh(arcGeo, arcMat);
    slapTrailArc.position.set(0, 1.42, 0.18);
    root.add(slapTrailArc);

    // Ground Company Aura Ring
    const auraGeo = new THREE.RingGeometry(0.52, 0.66, 36);
    auraGeo.rotateX(-Math.PI / 2);
    const auraMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
    });
    const auraRing = new THREE.Mesh(auraGeo, auraMat);
    auraRing.position.y = 0.02;
    root.add(auraRing);

    this.scene.add(root);

    return {
      root,
      hipsPivot,
      spine1,
      spine2,
      chestGroup,
      neckPivot,
      headGroup,
      sculptedHeadMesh,
      leftCheekZone,
      rightCheekZone,
      leftClavicle: leftArm.clavicle,
      leftShoulder: leftArm.shoulder,
      leftElbow: leftArm.elbow,
      leftHand: leftArm.handRig,
      rightClavicle: rightArm.clavicle,
      rightShoulder: rightArm.shoulder,
      rightElbow: rightArm.elbow,
      rightHand: rightArm.handRig,
      leftHip: leftLeg.hipGroup,
      leftKnee: leftLeg.kneeGroup,
      leftBoot: leftLeg.bootGroup,
      rightHip: rightLeg.hipGroup,
      rightKnee: rightLeg.kneeGroup,
      rightBoot: rightLeg.bootGroup,
      slapTrailArc,
      auraRing,
      cheekTargetRing,
      animState: 'IDLE',
      stateTimer: 0,
      windUpCount: 2,
      targetAngle: 'JAWLINE_LEVER',
      torqueChargeLevel: 0,
      recoilIntensity: 0,
      headWhipAngle: 0,
      footSlideOffset: 0,
      armorIntegrity: 100,
      koType: 'NONE',
      profile,
      side,
      specialAuraActive: false,
    };
  }

  private poseArticulatedHand(
    hand: ArticulatedHandRig,
    mode: 'SLAP_READY' | 'HOVER_MEASURE' | 'BRAWLER_GUARD',
    time: number,
    tensionAmount: number = 0.5
  ): void {
    for (let i = 0; i < 4; i++) {
      const f = hand.fingers[i];
      const spreadAngle = (i - 1.5) * (mode === 'SLAP_READY' ? 0.16 : 0.08);

      if (mode === 'SLAP_READY') {
        const twitch = Math.sin(time * 10 + i * 1.3) * 0.05 * tensionAmount;
        f.proximal.rotation.set(0.14 + twitch, 0, spreadAngle);
        f.middle.rotation.set(0.18 + tensionAmount * 0.1, 0, 0);
        f.distal.rotation.set(0.14, 0, 0);
      } else if (mode === 'HOVER_MEASURE') {
        const micro = Math.sin(time * 6 + i) * 0.04;
        f.proximal.rotation.set(0.06 + micro, 0, spreadAngle * 0.9);
        f.middle.rotation.set(0.08, 0, 0);
        f.distal.rotation.set(0.06, 0, 0);
      } else {
        // Brawler Guard Fist (matching the uploaded character stance!)
        f.proximal.rotation.set(1.25, 0, 0);
        f.middle.rotation.set(1.35, 0, 0);
        f.distal.rotation.set(1.1, 0, 0);
      }
    }

    if (mode === 'BRAWLER_GUARD') {
      hand.thumb.base.rotation.set(0.75, 0, -0.35);
      hand.thumb.distal.rotation.set(0.65, 0, 0);
    } else {
      hand.thumb.base.rotation.set(0.12, 0, -0.68 - tensionAmount * 0.15);
      hand.thumb.distal.rotation.set(0.18, 0, 0);
    }
  }

  public setFighters(
    leftProfile: FighterProfile,
    rightProfile: FighterProfile,
    leftHasChampionArmor: boolean = false
  ): void {
    if (this.leftRig) {
      this.scene.remove(this.leftRig.root);
    }
    if (this.rightRig) {
      this.scene.remove(this.rightRig.root);
    }

    this.leftRig = this.createFull3DFighterRig(
      leftProfile,
      'LEFT',
      leftHasChampionArmor
    );
    this.rightRig = this.createFull3DFighterRig(rightProfile, 'RIGHT', false);
    this.buildHQEnvironment(rightProfile);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.currentCameraPreset = preset;
    this.activeCameraMode = preset;
  }

  public setSpecialAura(side: 'LEFT' | 'RIGHT', active: boolean): void {
    const rig = side === 'LEFT' ? this.leftRig : this.rightRig;
    if (!rig) return;
    rig.specialAuraActive = active;
    const auraMat = rig.auraRing.material as THREE.MeshBasicMaterial;
    auraMat.opacity = active ? 0.95 : 0.58;
  }

  public triggerCheekLineUp(
    strikerSide: 'LEFT' | 'RIGHT',
    windUpCount: WindUpCount,
    targetAngle: SlapAngle
  ): void {
    this.activeStrikerSide = strikerSide;
    const striker = strikerSide === 'LEFT' ? this.leftRig : this.rightRig;
    const defender = strikerSide === 'LEFT' ? this.rightRig : this.leftRig;
    if (!striker || !defender) return;

    striker.animState = 'CHEEK_ALIGNMENT';
    striker.stateTimer = 0;
    striker.windUpCount = windUpCount;
    striker.targetAngle = targetAngle;

    defender.animState = 'CHIN_BRACE';
    defender.stateTimer = 0;

    const cheekY =
      targetAngle === 'HIGH_TEMPLE'
        ? 0.28
        : targetAngle === 'MID_CHEEK'
          ? 0.18
          : 0.08;
    defender.cheekTargetRing.position.y = cheekY;
    const ringMat = defender.cheekTargetRing.material as THREE.MeshBasicMaterial;
    ringMat.opacity = 0.92;
  }

  public updatePracticeSwingAndTorque(
    strikerSide: 'LEFT' | 'RIGHT',
    torqueChargeNormalized: number
  ): void {
    const striker = strikerSide === 'LEFT' ? this.leftRig : this.rightRig;
    if (!striker) return;
    striker.animState = 'FLINCH_BAIT';
    striker.stateTimer = 0;
    striker.torqueChargeLevel = torqueChargeNormalized;
    this.crowdHypeLevel = Math.min(1.1, 0.45 + torqueChargeNormalized * 0.5);

    const handX = strikerSide === 'LEFT' ? -0.22 : 0.22;
    this.spawnChalkPuff(handX, 1.48, 0.35);
  }

  public triggerWindUp(
    strikerSide: 'LEFT' | 'RIGHT',
    windUpCount: WindUpCount
  ): void {
    this.activeStrikerSide = strikerSide;
    const striker = strikerSide === 'LEFT' ? this.leftRig : this.rightRig;
    const defender = strikerSide === 'LEFT' ? this.rightRig : this.leftRig;
    if (!striker || !defender) return;

    striker.animState = 'WIND_UP_TORQUE';
    striker.stateTimer = 0;
    striker.windUpCount = windUpCount;

    defender.animState = 'CHIN_BRACE';
    defender.stateTimer = 0;

    if (this.currentCameraPreset === 'BROADCAST_WIDE') {
      this.activeCameraMode = 'PRE_SLAP_PUSH';
    }
  }

  public triggerSlapImpact(
    strikerSide: 'LEFT' | 'RIGHT',
    recoilIntensity: number,
    headWhipRadians: number,
    footSlideMeters: number,
    isKO: boolean,
    koType: KOType
  ): void {
    this.activeStrikerSide = strikerSide;
    const striker = strikerSide === 'LEFT' ? this.leftRig : this.rightRig;
    const defender = strikerSide === 'LEFT' ? this.rightRig : this.leftRig;
    if (!striker || !defender) return;

    striker.animState = 'SLAP_EXECUTION';
    striker.stateTimer = 0;
    (striker.slapTrailArc.material as THREE.MeshBasicMaterial).opacity = 0.95;

    if (isKO) {
      defender.animState = 'KNOCKDOWN';
    } else if (recoilIntensity >= 1.05) {
      defender.animState = 'HIT_STUMBLE_BACK';
    } else if (recoilIntensity >= 0.85) {
      defender.animState = 'HIT_STAGGER_STEP';
    } else if (striker.targetAngle === 'JAWLINE_LEVER') {
      defender.animState = 'HIT_JAW_SNAP';
    } else if (recoilIntensity >= 0.6) {
      defender.animState = 'HIT_CHEEK_WHIP';
    } else {
      defender.animState = 'HIT_LIGHT_CHEEK';
    }

    defender.stateTimer = 0;
    defender.recoilIntensity = recoilIntensity;
    defender.headWhipAngle = headWhipRadians;
    defender.footSlideOffset = footSlideMeters;
    defender.koType = koType;
    defender.armorIntegrity = Math.max(
      0,
      defender.armorIntegrity - recoilIntensity * 22
    );

    const ringMat = defender.cheekTargetRing.material as THREE.MeshBasicMaterial;
    ringMat.opacity = 0;

    if (this.slapFlashLight) {
      this.slapFlashLight.intensity = isKO ? 15 : 8.5;
      this.slapFlashLight.position.set(
        defender.side === 'LEFT' ? -0.45 : 0.45,
        1.55,
        0.35
      );
    }

    const defX = defender.side === 'LEFT' ? -0.55 : 0.55;
    const particleScale =
      koType === 'CRITICAL_KO'
        ? 2.1
        : koType === 'CLEAN_KO'
          ? 1.7
          : isKO
            ? 1.45
            : 1.15;

    this.spawnImpactParticles(
      defX,
      1.52,
      0.28,
      new THREE.Color(striker.profile.accentColor),
      particleScale,
      isKO
    );

    if (isKO) {
      this.koFreezeTimer = 0.22;
      this.koReplayTimer = 3.2;
      this.koReplayOrbitAngle = strikerSide === 'LEFT' ? 0.35 : -0.35;
      this.activeCameraMode = 'KO_REPLAY_ORBIT';
      this.slowMoFactor = 0.22;
      this.slowMoTimer = 2.8;
      this.screenShakeIntensity = 0.28;
      this.cameraRollAngle = 0.08;
      this.crowdHypeLevel = 1.85;
    } else {
      this.screenShakeIntensity = Math.min(0.18, recoilIntensity * 0.12);
      if (recoilIntensity > 0.82) {
        this.slowMoFactor = 0.42;
        this.slowMoTimer = 0.55;
        this.activeCameraMode = 'IMPACT_MACRO';
      } else {
        this.activeCameraMode = this.currentCameraPreset;
      }
      this.crowdHypeLevel = Math.min(1.4, 0.7 + recoilIntensity * 0.45);
    }
  }

  public resetFightersToStance(): void {
    [this.leftRig, this.rightRig].forEach((rig) => {
      if (!rig) return;
      rig.animState = 'IDLE';
      rig.stateTimer = 0;
      rig.footSlideOffset = 0;
      rig.headWhipAngle = 0;
      rig.torqueChargeLevel = 0;
      const ringMat = rig.cheekTargetRing.material as THREE.MeshBasicMaterial;
      ringMat.opacity = 0;
      (rig.slapTrailArc.material as THREE.MeshBasicMaterial).opacity = 0;
      rig.root.position.set(rig.side === 'LEFT' ? -0.78 : 0.78, 0, 0.15);
      rig.root.rotation.set(
        0,
        rig.side === 'LEFT' ? Math.PI * 0.34 : -Math.PI * 0.34,
        0
      );
      rig.hipsPivot.position.set(0, 0.78, 0);
      rig.hipsPivot.rotation.set(0, 0, 0);
      rig.spine1.rotation.set(0, 0, 0);
      rig.spine2.rotation.set(0, 0, 0);
      rig.headGroup.rotation.set(0, 0, 0);
      rig.sculptedHeadMesh.scale.set(1, 1, 1);
    });
    this.cameraRollAngle = 0;
    this.koFreezeTimer = 0;
    this.koReplayTimer = 0;
    this.activeCameraMode = this.currentCameraPreset;
  }

  public triggerVictoryPose(winnerSide: 'LEFT' | 'RIGHT'): void {
    const winner = winnerSide === 'LEFT' ? this.leftRig : this.rightRig;
    if (winner) {
      winner.animState = 'VICTORY';
      winner.stateTimer = 0;
    }
    this.crowdHypeLevel = 1.9;
  }

  private spawnChalkPuff(x: number, y: number, z: number): void {
    for (let i = 0; i < 24; i++) {
      const idx = Math.floor(Math.random() * this.maxParticles);
      this.particlePositions[idx * 3] = x + (Math.random() - 0.5) * 0.22;
      this.particlePositions[idx * 3 + 1] = y + (Math.random() - 0.5) * 0.22;
      this.particlePositions[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.22;
      this.particleVelocities[idx * 3] = (Math.random() - 0.5) * 1.4;
      this.particleVelocities[idx * 3 + 1] = 0.6 + Math.random() * 1.4;
      this.particleVelocities[idx * 3 + 2] = (Math.random() - 0.5) * 1.4;
      this.particleLife[idx] = 0.45 + Math.random() * 0.35;
    }
    if (this.particlePoints) {
      this.particlePoints.geometry.attributes.position.needsUpdate = true;
    }
  }

  private spawnImpactParticles(
    x: number,
    y: number,
    z: number,
    accentColor: THREE.Color,
    scale: number,
    isKO: boolean
  ): void {
    for (let i = 0; i < this.maxParticles; i++) {
      this.particlePositions[i * 3] = x + (Math.random() - 0.5) * 0.16;
      this.particlePositions[i * 3 + 1] = y + (Math.random() - 0.5) * 0.16;
      this.particlePositions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.16;

      const dirX = x > 0 ? 1 : -1;
      this.particleVelocities[i * 3] =
        (dirX * (1.5 + Math.random() * 3.0) + (Math.random() - 0.5)) * scale;
      this.particleVelocities[i * 3 + 1] = (1.1 + Math.random() * 2.6) * scale;
      this.particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 3.0 * scale;
      this.particleLife[i] = 0.75 + Math.random() * 0.85;
    }

    if (this.particlePoints) {
      this.particlePoints.geometry.attributes.position.needsUpdate = true;
    }

    if (this.shockwaveRing) {
      this.shockwaveRing.position.set(x, y, z);
      const mat = this.shockwaveRing.material as THREE.MeshBasicMaterial;
      mat.color.copy(accentColor);
      this.shockwaveScale = 0.25;
      this.shockwaveOpacity = 0.98;
    }

    if (this.secondaryShockwaveRing) {
      this.secondaryShockwaveRing.position.set(x, y, z);
      const secMat = this.secondaryShockwaveRing
        .material as THREE.MeshBasicMaterial;
      secMat.opacity = isKO ? 0.94 : 0.55;
    }
  }

  private buildHQEnvironment(bossProfile: FighterProfile): void {
    while (this.hqEnvironmentGroup.children.length > 0) {
      const child = this.hqEnvironmentGroup.children[0];
      this.hqEnvironmentGroup.remove(child);
    }

    const accent = new THREE.Color(bossProfile.accentColor);
    const primary = new THREE.Color(bossProfile.primaryColor);

    if (this.podiumScoreRing) {
      (this.podiumScoreRing.material as THREE.MeshBasicMaterial).color.copy(
        accent
      );
    }

    const archMat = new THREE.MeshStandardMaterial({
      color: primary,
      metalness: 0.84,
      roughness: 0.22,
    });
    const neonMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.85,
      roughness: 0.18,
    });

    switch (bossProfile.id) {
      case 'musk': {
        const booster = new THREE.Mesh(
          new THREE.CylinderGeometry(1.15, 1.3, 10.5, 24),
          archMat
        );
        booster.position.set(0, 4.4, -7.2);
        this.hqEnvironmentGroup.add(booster);

        for (let i = -1; i <= 1; i += 2) {
          const gantry = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 9.2, 0.65),
            archMat
          );
          gantry.position.set(i * 3.8, 4.0, -6.2);
          this.hqEnvironmentGroup.add(gantry);

          const plasmaRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.95, 0.06, 12, 32),
            neonMat
          );
          plasmaRing.position.set(i * 3.8, 2.5, -5.8);
          this.hqEnvironmentGroup.add(plasmaRing);
        }
        break;
      }
      case 'altman': {
        const core = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.55, 1),
          neonMat
        );
        core.position.set(0, 3.3, -6.2);
        core.name = 'ROTATING_CORE';
        this.hqEnvironmentGroup.add(core);

        for (let i = -2; i <= 2; i++) {
          if (i === 0) continue;
          const pillar = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 6.5, 0.4),
            archMat
          );
          pillar.position.set(i * 2.2, 3.0, -6.6);
          this.hqEnvironmentGroup.add(pillar);
        }
        break;
      }
      case 'huang': {
        for (let i = -3; i <= 3; i++) {
          const height = 6.8 - Math.abs(i) * 0.65;
          const blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.68, height, 0.35),
            archMat
          );
          blade.position.set(i * 1.45, height / 2, -6.4 - Math.abs(i) * 0.25);
          this.hqEnvironmentGroup.add(blade);

          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, height * 0.9, 0.4),
            neonMat
          );
          strip.position.copy(blade.position);
          this.hqEnvironmentGroup.add(strip);
        }
        break;
      }
      case 'bezos': {
        for (let i = -1; i <= 1; i++) {
          const radius = i === 0 ? 2.5 : 1.75;
          const ring1 = new THREE.Mesh(
            new THREE.TorusGeometry(radius, 0.06, 12, 36),
            neonMat
          );
          ring1.position.set(i * 3.1, 2.5, -6.6);
          this.hqEnvironmentGroup.add(ring1);

          const ring2 = new THREE.Mesh(
            new THREE.TorusGeometry(radius * 0.85, 0.05, 12, 36),
            archMat
          );
          ring2.position.set(i * 3.1, 2.5, -6.6);
          ring2.rotation.y = Math.PI / 3;
          this.hqEnvironmentGroup.add(ring2);
        }
        break;
      }
      case 'zuckerberg': {
        for (let i = 0; i < 3; i++) {
          const portal = new THREE.Mesh(
            new THREE.TorusGeometry(2.3 + i * 0.85, 0.075, 12, 48),
            i % 2 === 0 ? neonMat : archMat
          );
          portal.position.set(0, 2.6, -5.6 - i * 1.2);
          this.hqEnvironmentGroup.add(portal);
        }
        break;
      }
      case 'ellison': {
        for (let i = -2; i <= 2; i++) {
          const tower = new THREE.Mesh(
            new THREE.CylinderGeometry(0.48, 0.56, 7.2, 8),
            i % 2 === 0 ? archMat : neonMat
          );
          tower.position.set(i * 2.1, 3.4, -6.5);
          this.hqEnvironmentGroup.add(tower);
        }
        break;
      }
      case 'amodei': {
        const swirl1 = new THREE.Mesh(
          new THREE.TorusGeometry(2.1, 0.075, 16, 64),
          neonMat
        );
        swirl1.position.set(0, 3.1, -6.1);
        swirl1.name = 'ROTATING_CORE';
        this.hqEnvironmentGroup.add(swirl1);

        const swirl2 = new THREE.Mesh(
          new THREE.TorusGeometry(1.45, 0.065, 16, 64),
          archMat
        );
        swirl2.position.set(0, 3.1, -6.1);
        swirl2.rotation.x = Math.PI / 4;
        this.hqEnvironmentGroup.add(swirl2);
        break;
      }
      case 'pichai': {
        const googleColors = [0x4285f4, 0xea4335, 0xfbbc05, 0x34a853];
        googleColors.forEach((col, idx) => {
          const arch = new THREE.Mesh(
            new THREE.TorusGeometry(
              2.2 + idx * 0.45,
              0.08,
              12,
              48,
              Math.PI
            ),
            new THREE.MeshStandardMaterial({
              color: col,
              emissive: col,
              emissiveIntensity: 1.5,
            })
          );
          arch.position.set(0, 0.4, -5.8 - idx * 0.5);
          this.hqEnvironmentGroup.add(arch);
        });
        break;
      }
      case 'nadella': {
        for (let i = -2; i <= 2; i++) {
          const spire = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 6.2, 0.85),
            archMat
          );
          spire.position.set(i * 2.2, 3.0, -6.5 - Math.abs(i) * 0.4);
          this.hqEnvironmentGroup.add(spire);

          const cap = new THREE.Mesh(
            new THREE.BoxGeometry(0.92, 0.25, 0.92),
            neonMat
          );
          cap.position.set(i * 2.2, 6.2, -6.5 - Math.abs(i) * 0.4);
          this.hqEnvironmentGroup.add(cap);
        }
        break;
      }
      case 'gates':
      default: {
        const paneOffsets = [
          [-0.95, 3.8],
          [0.95, 3.8],
          [-0.95, 2.0],
          [0.95, 2.0],
        ];
        paneOffsets.forEach(([px, py]) => {
          const pane = new THREE.Mesh(
            new THREE.BoxGeometry(1.65, 1.55, 0.22),
            neonMat
          );
          pane.position.set(px, py, -6.3);
          this.hqEnvironmentGroup.add(pane);
        });
        break;
      }
    }
  }

  private updateFighterRig(
    rig: FullBodyFighterRig,
    dt: number,
    elapsed: number
  ): void {
    rig.stateTimer += dt;
    const isLeft = rig.side === 'LEFT';
    const baseFacingY = isLeft ? Math.PI * 0.34 : -Math.PI * 0.34;
    const baseX = isLeft ? -0.78 : 0.78;

    const strikeShoulder = isLeft ? rig.rightShoulder : rig.leftShoulder;
    const strikeElbow = isLeft ? rig.rightElbow : rig.leftElbow;
    const strikeHand = isLeft ? rig.rightHand : rig.leftHand;

    const guardShoulder = isLeft ? rig.leftShoulder : rig.rightShoulder;
    const guardElbow = isLeft ? rig.leftElbow : rig.rightElbow;
    const guardHand = isLeft ? rig.leftHand : rig.rightHand;

    // Smoothly restore head squash/stretch
    rig.sculptedHeadMesh.scale.lerp(new THREE.Vector3(1, 1, 1), 8 * dt);

    // Fade slap trail arc
    const arcMat = rig.slapTrailArc.material as THREE.MeshBasicMaterial;
    if (arcMat.opacity > 0.01) {
      arcMat.opacity = Math.max(0, arcMat.opacity - dt * 2.4);
    }

    switch (rig.animState) {
      case 'IDLE': {
        // Athletic Brawler Stance matching the exact pose in the 10 uploaded character images!
        const breath = Math.sin(elapsed * 3.0 + (isLeft ? 0 : 1.5));
        rig.root.position.x = THREE.MathUtils.lerp(
          rig.root.position.x,
          baseX,
          6 * dt
        );
        rig.hipsPivot.position.y = 0.78 + breath * 0.016;
        rig.hipsPivot.rotation.set(0, Math.sin(elapsed * 1.5) * 0.05, 0);
        rig.spine1.rotation.set(0.06, 0, 0);
        rig.spine2.rotation.set(0.05, 0, 0);
        rig.headGroup.rotation.set(breath * 0.03, 0, 0);

        // Both gauntlets raised in the iconic brawler guard pose from the uploaded art
        guardShoulder.rotation.set(-0.68, 0, isLeft ? 0.32 : -0.32);
        guardElbow.rotation.set(-1.15, 0, 0);
        this.poseArticulatedHand(guardHand, 'BRAWLER_GUARD', elapsed, 0.4);

        strikeShoulder.rotation.set(-0.62, 0, isLeft ? -0.38 : 0.38);
        strikeElbow.rotation.set(-1.1, 0, 0);
        this.poseArticulatedHand(strikeHand, 'SLAP_READY', elapsed, 0.5);

        // Wide crouched brawler leg stance
        rig.leftHip.rotation.set(-0.22, 0, 0.22);
        rig.rightHip.rotation.set(-0.22, 0, -0.22);
        rig.leftKnee.rotation.set(0.42, 0, 0);
        rig.rightKnee.rotation.set(0.42, 0, 0);
        rig.leftBoot.rotation.set(-0.2, 0, 0);
        rig.rightBoot.rotation.set(-0.2, 0, 0);
        break;
      }

      case 'CHEEK_ALIGNMENT': {
        // Phase 1: Striker leans across podium and extends open 5-finger gauntlet hand right to opponent's cheek
        const breath = Math.sin(elapsed * 2.4);
        rig.root.position.x = THREE.MathUtils.lerp(
          rig.root.position.x,
          isLeft ? -0.62 : 0.62,
          8 * dt
        );
        rig.hipsPivot.rotation.set(0, isLeft ? 0.22 : -0.22, 0);
        rig.spine1.rotation.set(0.08, isLeft ? 0.18 : -0.18, 0);
        rig.spine2.rotation.set(0.06, isLeft ? 0.22 : -0.22, 0);
        rig.headGroup.rotation.set(
          -0.05,
          isLeft ? -0.15 : 0.15,
          isLeft ? 0.06 : -0.06
        );

        const targetHeightOffset =
          rig.targetAngle === 'HIGH_TEMPLE'
            ? -0.24
            : rig.targetAngle === 'MID_CHEEK'
              ? -0.08
              : 0.08;

        strikeShoulder.rotation.set(
          -1.42 + targetHeightOffset + breath * 0.03,
          isLeft ? 0.35 : -0.35,
          isLeft ? -0.22 : 0.22
        );
        strikeElbow.rotation.set(-0.18, 0, 0);
        strikeHand.wristPivot.rotation.set(0, isLeft ? 0.45 : -0.45, 0);
        this.poseArticulatedHand(strikeHand, 'HOVER_MEASURE', elapsed, 0.8);
        break;
      }

      case 'FLINCH_BAIT': {
        // Phase 2: Fake micro-swings, shoulder pops, wrist flicks & practice swing torque charge
        const pulse =
          Math.sin(rig.stateTimer * 20) * Math.exp(-rig.stateTimer * 2.0);
        const charge = rig.torqueChargeLevel;

        rig.hipsPivot.rotation.set(
          0,
          (isLeft ? -0.3 : 0.3) * (0.4 + charge * 0.6) + pulse * 0.22,
          0
        );
        rig.spine1.rotation.set(
          0.06,
          (isLeft ? -0.32 : 0.32) * (0.4 + charge * 0.6) + pulse * 0.26,
          0
        );
        rig.spine2.rotation.set(
          0.06,
          (isLeft ? -0.36 : 0.36) * (0.4 + charge * 0.6) + pulse * 0.28,
          0
        );

        strikeShoulder.rotation.set(
          -1.32 + pulse * 0.48,
          (isLeft ? -0.62 : 0.62) * (0.4 + charge * 0.6),
          isLeft ? -0.48 : 0.48
        );
        strikeElbow.rotation.set(-0.28 + pulse * 0.25, 0, 0);
        strikeHand.wristPivot.rotation.set(0, pulse * 0.45, 0);
        this.poseArticulatedHand(
          strikeHand,
          'SLAP_READY',
          elapsed,
          0.65 + charge * 0.35
        );

        rig.rightBoot.rotation.y =
          (isLeft ? -0.42 : 0.42) * (0.4 + charge * 0.6);
        break;
      }

      case 'WIND_UP_TORQUE': {
        // Phase 3 & 4: Full Swing Prep ("Way Back Swing") + Pre-Impact Freeze
        const totalDuration = rig.windUpCount * 0.31;
        const progress = Math.min(
          1,
          rig.stateTimer / Math.max(0.25, totalDuration)
        );
        const isFreeze = progress > 0.82;
        const coil = isFreeze ? 1.0 : Math.sin(progress * Math.PI * 0.5);
        const windUpScale = 0.78 + rig.windUpCount * 0.14;

        rig.hipsPivot.rotation.set(
          0,
          (isLeft ? -0.45 : 0.45) * coil * windUpScale,
          0
        );
        rig.spine1.rotation.set(
          0.08,
          (isLeft ? -0.48 : 0.48) * coil * windUpScale,
          0
        );
        rig.spine2.rotation.set(
          0.1,
          (isLeft ? -0.55 : 0.55) * coil * windUpScale,
          0
        );
        rig.headGroup.rotation.set(
          0,
          (isLeft ? 0.75 : -0.75) * coil * windUpScale,
          0
        );

        strikeShoulder.rotation.set(
          -1.48,
          (isLeft ? -1.2 : 1.2) * coil * windUpScale,
          isLeft ? -0.68 : 0.68
        );
        strikeElbow.rotation.set(-0.1, 0, 0);
        strikeHand.wristPivot.rotation.set(
          0,
          (isLeft ? -0.52 : 0.52) * coil,
          0
        );
        this.poseArticulatedHand(strikeHand, 'SLAP_READY', elapsed, 1.0);

        rig.rightBoot.rotation.y = (isLeft ? -0.52 : 0.52) * coil;
        break;
      }

      case 'SLAP_EXECUTION': {
        // Phase 5: Explosive torque release across opponent's cheek with glowing arc ribbon!
        const snap = Math.min(1, rig.stateTimer / 0.11);
        const followThrough = Math.sin(snap * Math.PI * 0.5);

        rig.hipsPivot.rotation.set(
          0,
          THREE.MathUtils.lerp(
            isLeft ? -0.48 : 0.48,
            isLeft ? 0.52 : -0.52,
            followThrough
          ),
          0
        );
        rig.spine1.rotation.set(
          0.12,
          THREE.MathUtils.lerp(
            isLeft ? -0.52 : 0.52,
            isLeft ? 0.56 : -0.56,
            followThrough
          ),
          0
        );
        rig.spine2.rotation.set(
          0.14,
          THREE.MathUtils.lerp(
            isLeft ? -0.58 : 0.58,
            isLeft ? 0.65 : -0.65,
            followThrough
          ),
          0
        );

        strikeShoulder.rotation.set(
          -1.38,
          THREE.MathUtils.lerp(
            isLeft ? -1.15 : 1.15,
            isLeft ? 1.02 : -1.02,
            followThrough
          ),
          isLeft ? -0.18 : 0.18
        );
        strikeElbow.rotation.set(-0.15, 0, 0);
        strikeHand.wristPivot.rotation.set(
          0,
          THREE.MathUtils.lerp(
            isLeft ? -0.48 : 0.48,
            isLeft ? 0.38 : -0.38,
            followThrough
          ),
          0
        );
        this.poseArticulatedHand(strikeHand, 'SLAP_READY', elapsed, 0.95);
        break;
      }

      case 'CHIN_BRACE': {
        rig.hipsPivot.position.y = 0.74;
        rig.spine1.rotation.set(0.14, 0, 0);
        rig.spine2.rotation.set(0.16, 0, 0);
        rig.headGroup.rotation.set(0.18, 0, 0);

        guardShoulder.rotation.set(-0.62, 0, isLeft ? 0.18 : -0.18);
        guardElbow.rotation.set(-0.65, 0, 0);
        this.poseArticulatedHand(guardHand, 'BRAWLER_GUARD', elapsed, 0.85);

        strikeShoulder.rotation.set(0.28, 0, isLeft ? -0.25 : 0.25);
        strikeElbow.rotation.set(-0.85, 0, 0);
        this.poseArticulatedHand(strikeHand, 'BRAWLER_GUARD', elapsed, 0.85);
        break;
      }

      case 'HIT_LIGHT_CHEEK':
      case 'HIT_CHEEK_WHIP':
      case 'HIT_JAW_SNAP':
      case 'HIT_STAGGER_STEP':
      case 'HIT_STUMBLE_BACK': {
        const decay = Math.exp(-rig.stateTimer * 3.2);
        const whipSign = isLeft ? -1 : 1;

        // Visibly squash/deform the 3D sculpted head on cheek impact!
        if (rig.stateTimer < 0.24) {
          rig.sculptedHeadMesh.scale.set(0.84, 1.12, 1.08);
        }

        const headRotScale = rig.animState === 'HIT_JAW_SNAP' ? 1.35 : 1.0;
        rig.headGroup.rotation.set(
          -0.22 * decay,
          whipSign * rig.headWhipAngle * headRotScale * decay,
          whipSign * 0.32 * decay
        );

        const torsoLean =
          rig.animState === 'HIT_STUMBLE_BACK'
            ? 0.55
            : rig.animState === 'HIT_STAGGER_STEP'
              ? 0.4
              : 0.24;

        rig.spine1.rotation.set(
          -torsoLean * decay,
          whipSign * 0.38 * decay,
          whipSign * 0.24 * decay
        );
        rig.spine2.rotation.set(
          -torsoLean * 1.1 * decay,
          whipSign * 0.44 * decay,
          whipSign * 0.3 * decay
        );

        const slideDist =
          rig.animState === 'HIT_STUMBLE_BACK'
            ? 0.45
            : rig.animState === 'HIT_STAGGER_STEP'
              ? 0.28
              : rig.footSlideOffset;
        rig.root.position.x = baseX + (isLeft ? -slideDist : slideDist) * decay;
        break;
      }

      case 'KNOCKDOWN': {
        const whipSign = isLeft ? -1 : 1;
        rig.sculptedHeadMesh.scale.set(0.86, 1.1, 1.06);

        if (rig.koType === 'DELAYED_KO' && rig.stateTimer < 0.65) {
          const tremor = Math.sin(rig.stateTimer * 42) * 0.05;
          rig.headGroup.rotation.set(0.25, whipSign * 0.55 + tremor, 0);
          rig.spine2.rotation.set(0.22, tremor, 0);
        } else {
          const t =
            rig.koType === 'DELAYED_KO'
              ? Math.min(1, (rig.stateTimer - 0.65) / 0.55)
              : Math.min(1, rig.stateTimer / 0.55);
          const fallCurve = t * t;

          if (rig.koType === 'STAGGER_KO') {
            const wobble = Math.sin(rig.stateTimer * 12) * (1 - t) * 0.35;
            rig.hipsPivot.position.y = THREE.MathUtils.lerp(
              0.78,
              0.22,
              fallCurve
            );
            rig.hipsPivot.rotation.set(
              -0.95 * fallCurve,
              wobble,
              whipSign * 0.65 * fallCurve
            );
          } else {
            rig.hipsPivot.position.y = THREE.MathUtils.lerp(
              0.78,
              0.18,
              fallCurve
            );
            rig.hipsPivot.rotation.set(
              -1.42 * fallCurve,
              whipSign * 0.35 * fallCurve,
              whipSign * 0.28 * fallCurve
            );
            rig.headGroup.rotation.set(
              -0.45 * fallCurve,
              whipSign * 0.85 * fallCurve,
              0
            );
          }
        }
        break;
      }

      case 'VICTORY': {
        const bounce = Math.abs(Math.sin(elapsed * 4.8)) * 0.06;
        rig.hipsPivot.position.y = 0.82 + bounce;
        rig.spine1.rotation.set(-0.08, 0, 0);
        rig.spine2.rotation.set(-0.1, 0, 0);
        rig.headGroup.rotation.set(-0.1, 0, 0);

        rig.leftShoulder.rotation.set(-2.5, 0, 0.38);
        rig.leftElbow.rotation.set(-0.35, 0, 0);
        rig.rightShoulder.rotation.set(-2.5, 0, -0.38);
        rig.rightElbow.rotation.set(-0.35, 0, 0);
        break;
      }
    }

    rig.root.rotation.y = baseFacingY;
  }

  private startLoop(): void {
    const animate = () => {
      if (this.isDisposed) return;
      this.frameId = requestAnimationFrame(animate);

      const rawDt = Math.min(this.clock.getDelta(), 0.1);

      if (this.koFreezeTimer > 0) {
        this.koFreezeTimer -= rawDt;
        this.renderer.render(this.scene, this.camera);
        return;
      }

      if (this.slowMoTimer > 0) {
        this.slowMoTimer -= rawDt;
        if (this.slowMoTimer <= 0) {
          this.slowMoFactor = 1.0;
        }
      }

      const dt = rawDt * this.slowMoFactor;
      const elapsed = this.clock.getElapsedTime();

      if (this.leftRig) this.updateFighterRig(this.leftRig, dt, elapsed);
      if (this.rightRig) this.updateFighterRig(this.rightRig, dt, elapsed);

      if (this.slapFlashLight && this.slapFlashLight.intensity > 0) {
        this.slapFlashLight.intensity = THREE.MathUtils.lerp(
          this.slapFlashLight.intensity,
          0,
          12 * rawDt
        );
      }

      const rotatingCore =
        this.hqEnvironmentGroup.getObjectByName('ROTATING_CORE');
      if (rotatingCore) {
        rotatingCore.rotation.y += dt * 0.65;
        rotatingCore.rotation.x += dt * 0.32;
      }

      if (this.crowdInstancedMesh && this.crowdGlowSticksMesh) {
        this.crowdHypeLevel = Math.max(0.35, this.crowdHypeLevel - rawDt * 0.22);
        for (let i = 0; i < this.crowdCount; i++) {
          const bx = this.crowdBasePositions[i * 3];
          const by = this.crowdBasePositions[i * 3 + 1];
          const bz = this.crowdBasePositions[i * 3 + 2];
          const jump =
            Math.abs(Math.sin(elapsed * (3.5 + (i % 5)) + i)) *
            0.22 *
            this.crowdHypeLevel;

          _dummyPos.set(bx, by + jump, bz);
          _dummyQuat.setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            Math.sin(elapsed * 2 + i) * 0.15
          );
          _dummyScale.set(1, 1, 1);
          _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
          this.crowdInstancedMesh.setMatrixAt(i, _dummyMatrix);

          _dummyPos.set(
            bx + Math.sin(elapsed * 6 + i) * 0.16,
            by + 0.35 + jump * 1.35,
            bz + 0.12
          );
          _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
          this.crowdGlowSticksMesh.setMatrixAt(i, _dummyMatrix);
        }
        this.crowdInstancedMesh.instanceMatrix.needsUpdate = true;
        this.crowdGlowSticksMesh.instanceMatrix.needsUpdate = true;
      }

      if (this.particlePoints) {
        let anyAlive = false;
        for (let i = 0; i < this.maxParticles; i++) {
          if (this.particleLife[i] > 0) {
            anyAlive = true;
            this.particleLife[i] -= dt;
            this.particlePositions[i * 3] += this.particleVelocities[i * 3] * dt;
            this.particlePositions[i * 3 + 1] +=
              this.particleVelocities[i * 3 + 1] * dt;
            this.particlePositions[i * 3 + 2] +=
              this.particleVelocities[i * 3 + 2] * dt;
            this.particleVelocities[i * 3 + 1] -= 4.2 * dt;
          } else {
            this.particlePositions[i * 3 + 1] = -10;
          }
        }
        if (anyAlive) {
          this.particlePoints.geometry.attributes.position.needsUpdate = true;
        }
      }

      if (this.shockwaveRing && this.shockwaveOpacity > 0.01) {
        this.shockwaveScale += dt * 7.5;
        this.shockwaveOpacity = Math.max(0, this.shockwaveOpacity - dt * 1.65);
        this.shockwaveRing.scale.setScalar(this.shockwaveScale);
        (this.shockwaveRing.material as THREE.MeshBasicMaterial).opacity =
          this.shockwaveOpacity;

        if (this.secondaryShockwaveRing) {
          this.secondaryShockwaveRing.scale.setScalar(
            this.shockwaveScale * 0.72
          );
          (
            this.secondaryShockwaveRing.material as THREE.MeshBasicMaterial
          ).opacity = this.shockwaveOpacity * 0.75;
        }
      }

      this.updateCamera(rawDt, elapsed);
      this.renderer.render(this.scene, this.camera);
    };

    this.frameId = requestAnimationFrame(animate);
  }

  private updateCamera(rawDt: number, elapsed: number): void {
    const isPortrait =
      (this.container.clientWidth || window.innerWidth) < 640;

    if (this.koReplayTimer > 0) {
      this.koReplayTimer -= rawDt;
      this.koReplayOrbitAngle += rawDt * 0.88;
      const radius = this.koReplayTimer > 1.8 ? 2.2 : 3.3;
      _camTargetPos.set(
        Math.sin(this.koReplayOrbitAngle) * radius,
        1.58,
        Math.cos(this.koReplayOrbitAngle) * radius
      );
      _camTargetLook.set(
        this.activeStrikerSide === 'LEFT' ? 0.35 : -0.35,
        1.42,
        0.15
      );
      if (this.koReplayTimer <= 0) {
        this.activeCameraMode = 'BROADCAST_WIDE';
      }
    } else {
      switch (this.activeCameraMode) {
        case 'PRE_SLAP_PUSH': {
          const sx = this.activeStrikerSide === 'LEFT' ? -0.22 : 0.22;
          _camTargetPos.set(sx, 1.72, isPortrait ? 5.1 : 4.1);
          _camTargetLook.set(0, 1.38, 0.15);
          break;
        }
        case 'STRIKER_PROFILE': {
          const sx = this.activeStrikerSide === 'LEFT' ? 1.55 : -1.55;
          _camTargetPos.set(sx, 1.65, 3.15);
          _camTargetLook.set(0, 1.42, 0.15);
          break;
        }
        case 'IMPACT_MACRO': {
          const dx = this.activeStrikerSide === 'LEFT' ? 0.42 : -0.42;
          _camTargetPos.set(dx, 1.6, 2.65);
          _camTargetLook.set(dx * 1.15, 1.48, 0.15);
          break;
        }
        case 'KO_REPLAY_ORBIT': {
          const orbitX = Math.sin(elapsed * 0.65) * 4.2;
          const orbitZ = Math.cos(elapsed * 0.65) * 4.2;
          _camTargetPos.set(orbitX, 1.92, Math.max(2.6, orbitZ));
          _camTargetLook.set(0, 1.32, 0.15);
          break;
        }
        case 'BROADCAST_WIDE':
        default: {
          const breatheX = Math.sin(elapsed * 0.55) * 0.12;
          const breatheY = Math.cos(elapsed * 0.45) * 0.04;
          _camTargetPos.set(
            breatheX,
            1.88 + breatheY,
            isPortrait ? 6.2 : 4.95
          );
          _camTargetLook.set(0, 1.32, 0.15);
          break;
        }
      }
    }

    this.camera.position.lerp(_camTargetPos, 5.5 * rawDt);
    this.currentLookAt.lerp(_camTargetLook, 6.5 * rawDt);

    if (this.screenShakeIntensity > 0.002) {
      this.camera.position.x +=
        (Math.random() - 0.5) * this.screenShakeIntensity;
      this.camera.position.y +=
        (Math.random() - 0.5) * this.screenShakeIntensity;
      this.screenShakeIntensity = THREE.MathUtils.lerp(
        this.screenShakeIntensity,
        0,
        9 * rawDt
      );
    }

    this.camera.lookAt(this.currentLookAt);
    if (Math.abs(this.cameraRollAngle) > 0.001) {
      this.camera.rotation.z += this.cameraRollAngle;
      this.cameraRollAngle = THREE.MathUtils.lerp(
        this.cameraRollAngle,
        0,
        4.5 * rawDt
      );
    }
  }

  private handleResize = (): void => {
    if (!this.container || this.isDisposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.fov = width < 640 ? 52 : 39;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
