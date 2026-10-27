import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FighterProfile, KOType, SlapAngle, WindUpCount } from '../data/fighters';
import { soundEngine } from './soundEffects';

export type CameraPreset =
  | 'BROADCAST_WIDE'
  | 'PRE_SLAP_PUSH'
  | 'STRIKER_PROFILE'
  | 'IMPACT_MACRO'
  | 'KO_REPLAY_ORBIT';

export type FighterAnimState =
  | 'IDLE'
  | 'CHEEK_ALIGNMENT'
  | 'FAKEOUT'
  | 'FLINCHED'
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
  | 'CELEBRATE_VICTORY'
  | 'TAUNT';

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

interface FacialFeaturesRig {
  headGroup: THREE.Group;
  jawGroup: THREE.Group;
  mouthInterior: THREE.Mesh;
  leftEye: THREE.Mesh;
  rightEye: THREE.Mesh;
  leftPupil: THREE.Group;
  rightPupil: THREE.Group;
  leftBrow: THREE.Mesh;
  rightBrow: THREE.Mesh;
  noseGroup: THREE.Group;
  leftEar: THREE.Group;
  rightEar: THREE.Group;
  struckCheekMesh: THREE.Mesh;
  cheekMarkMat: THREE.MeshBasicMaterial;
  glassesMesh: THREE.Group | null;
  glassesWorldPos: THREE.Vector3;
  glassesWorldVelocity: THREE.Vector3;
  glassesAngularVelocity: THREE.Vector3;
  glassesDetached: boolean;
  // Under-damped spring physics state for violent head whiplash & jaw unhinging
  headSpringRot: THREE.Vector3;
  headSpringVel: THREE.Vector3;
  jawSpringOffset: THREE.Vector3;
  jawSpringVel: THREE.Vector3;
}

interface Contender3DRig {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  chestGroup: THREE.Group;
  neck: THREE.Group;
  facial: FacialFeaturesRig;
  // Left & Right anatomical arms
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  leftHand: ArticulatedHandRig;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  rightHand: ArticulatedHandRig;
  // Foreground Strike Arm (closest to camera, swings across podium) & Background Brace Arm (grips podium)
  strikeShoulder: THREE.Group;
  strikeElbow: THREE.Group;
  strikeHand: ArticulatedHandRig;
  braceShoulder: THREE.Group;
  braceElbow: THREE.Group;
  braceHand: ArticulatedHandRig;
  // Connected Legs & Boots
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  leftBoot: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  rightBoot: THREE.Group;
  // Visual FX
  slapTrailArc: THREE.Mesh;
  auraRing: THREE.Mesh;
  cheekTargetRing: THREE.Mesh;
  emissiveMaterials: THREE.MeshStandardMaterial[];
  // State Machine
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
  slapCountTaken: number;
}

const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _dummyMatrix = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyScale = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _worldCheekPos = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _flashOffset = new THREE.Vector3(0, 0.1, 0.25);

function dampEuler(
  euler: THREE.Euler,
  tx: number,
  ty: number,
  tz: number,
  lambda: number,
  dt: number
): void {
  euler.x = THREE.MathUtils.damp(euler.x, tx, lambda, dt);
  euler.y = THREE.MathUtils.damp(euler.y, ty, lambda, dt);
  euler.z = THREE.MathUtils.damp(euler.z, tz, lambda, dt);
}

export class ArenaSceneController {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private isSoftwareGl: boolean;
  private frameId: number = 0;
  private isDisposed: boolean = false;

  private leftRig: Contender3DRig | null = null;
  private rightRig: Contender3DRig | null = null;
  private hqEnvironmentGroup: THREE.Group;
  private podiumGroup: THREE.Group | null = null;
  private podiumScoreRing: THREE.Mesh | null = null;
  private slapFlashLight: THREE.PointLight | null = null;

  // 3D Crowd System
  private crowdInstancedMesh: THREE.InstancedMesh | null = null;
  private crowdGlowSticksMesh: THREE.InstancedMesh | null = null;
  private crowdBasePositions: Float32Array = new Float32Array(0);
  private crowdCount: number = 140;
  private crowdHypeLevel: number = 0.35;

  // Talcum Chalk Cloud Particles (300 points)
  private chalkPoints: THREE.Points | null = null;
  private chalkPositions: Float32Array;
  private chalkVelocities: Float32Array;
  private chalkLife: Float32Array;
  private maxChalk = 300;

  // Sweat & Spit Spray Particles (48 droplets)
  private sweatPoints: THREE.Points | null = null;
  private sweatPositions: Float32Array;
  private sweatVelocities: Float32Array;
  private sweatLife: Float32Array;
  private maxSweat = 48;

  // Shockwave Rings
  private shockwaveRing: THREE.Mesh | null = null;
  private secondaryShockwaveRing: THREE.Mesh | null = null;
  private shockwaveScale: number = 0;
  private shockwaveOpacity: number = 0;

  // Camera & Hit-Stop + Interactive Orbit Drag
  private currentCameraPreset: CameraPreset = 'BROADCAST_WIDE';
  private activeCameraMode: CameraPreset = 'BROADCAST_WIDE';
  private currentLookAt = new THREE.Vector3(0, 1.32, 0);
  private screenShakeIntensity: number = 0;
  private cameraRollAngle: number = 0;
  private baseFov: number = 40;
  private currentFov: number = 40;
  private hitStopTimer: number = 0;
  private slowMoFactor: number = 1.0;
  private slowMoTimer: number = 0;
  private koFreezeTimer: number = 0;
  private koReplayTimer: number = 0;
  private koReplayOrbitAngle: number = 0;
  private activeStrikerSide: 'LEFT' | 'RIGHT' = 'LEFT';
  private currentEnvironmentKey: string = '';

  // Interactive Pointer Orbit State
  private isPointerDown: boolean = false;
  private pointerLastX: number = 0;
  private pointerLastY: number = 0;
  private userOrbitAzimuth: number = 0;
  private userOrbitElevation: number = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();

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
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060913);
    this.scene.fog = new THREE.FogExp2(0x060913, 0.026);

    const isPortraitMobile = width < 640;
    this.baseFov = isPortraitMobile ? 48 : 37;
    this.currentFov = this.baseFov;

    this.camera = new THREE.PerspectiveCamera(
      this.baseFov,
      width / height,
      0.1,
      150
    );
    this.camera.position.set(0, 1.62, isPortraitMobile ? 5.2 : 4.15);
    this.camera.lookAt(0, 1.3, 0);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    this.hqEnvironmentGroup = new THREE.Group();
    this.scene.add(this.hqEnvironmentGroup);

    this.chalkPositions = new Float32Array(this.maxChalk * 3);
    this.chalkVelocities = new Float32Array(this.maxChalk * 3);
    this.chalkLife = new Float32Array(this.maxChalk);

    this.sweatPositions = new Float32Array(this.maxSweat * 3);
    this.sweatVelocities = new Float32Array(this.maxSweat * 3);
    this.sweatLife = new Float32Array(this.maxSweat);

    this.setupLighting();
    this.buildArenaStageAndCylindricalBarrelPodium();
    this.build3DCrowdSystem();
    this.buildChalkAndSweatParticleSystems();

    const domElem = this.renderer.domElement;
    domElem.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('resize', this.handleResize);
    this.startLoop();
  }

  private setupLighting(): void {
    const keyLight = new THREE.DirectionalLight(0xfff8eb, 3.8);
    keyLight.position.set(2.8, 8.5, 5.8);
    keyLight.castShadow = !this.isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      const d = 4.5;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0xffedd5, 0x0f172a, 1.45);
    this.scene.add(hemiLight);

    // Overhead Golden Stadium Spotlight
    const spotLight = new THREE.SpotLight(
      0xfbbf24,
      8.2,
      24,
      Math.PI / 3.1,
      0.35,
      1
    );
    spotLight.position.set(0, 7.8, 1.4);
    spotLight.target.position.set(0, 1.25, 0);
    this.scene.add(spotLight);
    this.scene.add(spotLight.target);

    // Rim lights for 3D volumetric silhouette & muscle definition
    const leftRim = new THREE.PointLight(0x38bdf8, 3.6, 14);
    leftRim.position.set(-3.4, 3.2, -1.8);
    this.scene.add(leftRim);

    const rightRim = new THREE.PointLight(0xf59e0b, 3.6, 14);
    rightRim.position.set(3.4, 3.2, -1.8);
    this.scene.add(rightRim);

    // Front fill light so 3D faces, noses, eyes, and chest logos pop clearly
    const frontFill = new THREE.PointLight(0xfffbeb, 2.2, 10);
    frontFill.position.set(0, 1.75, 2.8);
    this.scene.add(frontFill);

    this.slapFlashLight = new THREE.PointLight(0xfffbeb, 0, 14);
    this.slapFlashLight.position.set(0, 1.6, 0.5);
    this.scene.add(this.slapFlashLight);
  }

  /**
   * Builds the central dark metallic cylindrical slap barrel/podium
   * (CylinderGeometry with bevels, vertical fluting, and top rim padding)
   */
  private buildArenaStageAndCylindricalBarrelPodium(): void {
    const stageGroup = new THREE.Group();

    const platformGeo = new THREE.CylinderGeometry(5.6, 6.2, 0.35, 36);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x0a101d,
      metalness: 0.76,
      roughness: 0.24,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -0.175;
    platform.receiveShadow = true;
    stageGroup.add(platform);

    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.94,
      roughness: 0.16,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const ringGeo = new THREE.RingGeometry(4.4, 4.58, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringLine = new THREE.Mesh(ringGeo, goldTrimMat);
    ringLine.position.y = 0.01;
    stageGroup.add(ringLine);

    // Central Dark Metallic Cylindrical Slap Barrel
    this.podiumGroup = new THREE.Group();
    const barrelIronMat = new THREE.MeshStandardMaterial({
      color: 0x161d2a,
      metalness: 0.88,
      roughness: 0.22,
    });

    // Stepped Base Plinth
    const basePlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.54, 0.09, 32),
      barrelIronMat
    );
    basePlinth.position.y = 0.045;
    basePlinth.castShadow = true;
    basePlinth.receiveShadow = true;
    this.podiumGroup.add(basePlinth);

    // Tapered Cylindrical Barrel Core
    const barrelCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.39, 0.34, 0.78, 32),
      barrelIronMat
    );
    barrelCore.position.y = 0.48;
    barrelCore.castShadow = true;
    barrelCore.receiveShadow = true;
    this.podiumGroup.add(barrelCore);

    // 16 Vertical Fluted Ribs
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const rib = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.015, 0.76, 8),
        barrelIronMat
      );
      rib.position.set(Math.cos(angle) * 0.37, 0.48, Math.sin(angle) * 0.37);
      this.podiumGroup.add(rib);
    }

    // Beveled Upper Lip & Padded Top Rim
    const bevelRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.41, 0.06, 32),
      barrelIronMat
    );
    bevelRim.position.y = 0.89;
    bevelRim.castShadow = true;
    this.podiumGroup.add(bevelRim);

    const paddedRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.46, 0.07, 32),
      new THREE.MeshStandardMaterial({
        color: 0x0b0f19,
        metalness: 0.35,
        roughness: 0.65,
      })
    );
    paddedRim.position.y = 0.95;
    paddedRim.castShadow = true;
    this.podiumGroup.add(paddedRim);

    // Gold Trim Ring around Podium Top
    const podiumGoldRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.47, 0.014, 10, 36),
      goldTrimMat
    );
    podiumGoldRing.rotation.x = Math.PI / 2;
    podiumGoldRing.position.y = 0.92;
    this.podiumGroup.add(podiumGoldRing);

    // Recessed Magnesium Chalk Basin & White Chalk Mound on Top of Barrel
    const chalkBowlRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.016, 10, 24),
      goldTrimMat
    );
    chalkBowlRim.rotation.x = Math.PI / 2;
    chalkBowlRim.position.y = 0.99;
    this.podiumGroup.add(chalkBowlRim);

    const chalkMound = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.95,
        metalness: 0.02,
      })
    );
    chalkMound.scale.set(1, 0.35, 1);
    chalkMound.position.y = 0.985;
    this.podiumGroup.add(chalkMound);

    // Holographic Score Glow Ring on Floor
    const holoGeo = new THREE.RingGeometry(0.46, 0.58, 36);
    holoGeo.rotateX(-Math.PI / 2);
    const holoMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.podiumScoreRing = new THREE.Mesh(holoGeo, holoMat);
    this.podiumScoreRing.position.y = 0.018;
    this.podiumGroup.add(this.podiumScoreRing);

    // Overhead Stadium Floodlight Trusses & Volumetric Light Cones
    const trussSteelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.28,
    });
    const bulbGlowMat = new THREE.MeshBasicMaterial({
      color: 0xfff3b0,
    });
    const beamConeMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.045,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    [-1, 1].forEach((sideSign) => {
      const rigGroup = new THREE.Group();
      rigGroup.position.set(sideSign * 3.2, 4.35, -3.4);
      rigGroup.rotation.z = sideSign * 0.18;
      rigGroup.rotation.x = 0.28;

      const beamBar = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.12, 0.14),
        trussSteelMat
      );
      rigGroup.add(beamBar);

      for (let b = -2; b <= 2; b++) {
        const housing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.14, 0.16, 12),
          trussSteelMat
        );
        housing.rotation.x = Math.PI / 2;
        housing.position.set(b * 0.48, -0.06, 0.08);
        rigGroup.add(housing);

        const lens = new THREE.Mesh(
          new THREE.CircleGeometry(0.1, 12),
          bulbGlowMat
        );
        lens.position.set(b * 0.48, -0.06, 0.165);
        rigGroup.add(lens);
      }

      const lightCone = new THREE.Mesh(
        new THREE.ConeGeometry(1.9, 5.2, 16, 1, true),
        beamConeMat
      );
      lightCone.position.set(0, -2.5, 1.35);
      lightCone.rotation.x = -0.45;
      rigGroup.add(lightCone);

      stageGroup.add(rigGroup);
    });

    stageGroup.add(this.podiumGroup);
    this.scene.add(stageGroup);
  }

  private build3DCrowdSystem(): void {
    this.crowdCount = this.isSoftwareGl ? 60 : 140;
    const avatarGeo = new THREE.CapsuleGeometry(0.18, 0.45, 4, 8);
    const avatarMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.3,
    });
    this.crowdInstancedMesh = new THREE.InstancedMesh(
      avatarGeo,
      avatarMat,
      this.crowdCount
    );
    this.crowdInstancedMesh.frustumCulled = false;

    const stickGeo = new THREE.BoxGeometry(0.05, 0.24, 0.02);
    const stickMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
    });
    this.crowdGlowSticksMesh = new THREE.InstancedMesh(
      stickGeo,
      stickMat,
      this.crowdCount
    );
    this.crowdGlowSticksMesh.frustumCulled = false;

    this.crowdBasePositions = new Float32Array(this.crowdCount * 3);

    for (let i = 0; i < this.crowdCount; i++) {
      const row = Math.floor(i / 28);
      const angle = ((i % 28) / 28) * Math.PI * 1.35 - Math.PI * 1.175;
      const radius = 5.8 + row * 1.2 + (Math.random() - 0.5) * 0.35;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 0.6;
      const y = 0.35 + row * 0.48;

      this.crowdBasePositions[i * 3] = x;
      this.crowdBasePositions[i * 3 + 1] = y;
      this.crowdBasePositions[i * 3 + 2] = z;

      _dummyPos.set(x, y, z);
      _dummyQuat.setFromAxisAngle(_upAxis, -angle);
      _dummyScale.set(1, 1, 1);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      this.crowdInstancedMesh.setMatrixAt(i, _dummyMatrix);

      _dummyPos.set(x + 0.14, y + 0.32, z + 0.1);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      this.crowdGlowSticksMesh.setMatrixAt(i, _dummyMatrix);
    }

    this.crowdInstancedMesh.instanceMatrix.needsUpdate = true;
    this.crowdGlowSticksMesh.instanceMatrix.needsUpdate = true;
    this.crowdInstancedMesh.computeBoundingSphere();
    this.crowdGlowSticksMesh.computeBoundingSphere();
    this.scene.add(this.crowdInstancedMesh);
    this.scene.add(this.crowdGlowSticksMesh);
  }

  private buildChalkAndSweatParticleSystems(): void {
    // 1. 300-Particle Talcum Chalk Cloud
    const chalkGeo = new THREE.BufferGeometry();
    for (let i = 0; i < this.maxChalk; i++) {
      this.chalkPositions[i * 3] = 0;
      this.chalkPositions[i * 3 + 1] = -10;
      this.chalkPositions[i * 3 + 2] = 0;
      this.chalkLife[i] = 0;
    }
    chalkGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.chalkPositions, 3)
    );

    const chalkMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.085,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.chalkPoints = new THREE.Points(chalkGeo, chalkMat);
    this.scene.add(this.chalkPoints);

    // 2. Sweat & Spit Droplets (48 droplets)
    const sweatGeo = new THREE.BufferGeometry();
    for (let i = 0; i < this.maxSweat; i++) {
      this.sweatPositions[i * 3] = 0;
      this.sweatPositions[i * 3 + 1] = -10;
      this.sweatPositions[i * 3 + 2] = 0;
      this.sweatLife[i] = 0;
    }
    sweatGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.sweatPositions, 3)
    );
    const sweatMat = new THREE.PointsMaterial({
      color: 0xbae6fd,
      size: 0.048,
      transparent: true,
      opacity: 0.9,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    this.sweatPoints = new THREE.Points(sweatGeo, sweatMat);
    this.scene.add(this.sweatPoints);

    // 3. Shockwave Rings
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
    this.shockwaveRing.position.set(0, 1.55, 0.35);
    this.scene.add(this.shockwaveRing);

    const secRingGeo = new THREE.RingGeometry(0.2, 0.32, 36);
    const secRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.secondaryShockwaveRing = new THREE.Mesh(secRingGeo, secRingMat);
    this.secondaryShockwaveRing.position.set(0, 1.55, 0.35);
    this.scene.add(this.secondaryShockwaveRing);
  }

  /**
   * Builds a connected 3D Open-Palm Slap Hand with Wrist Joint, Gauntlet Cuff,
   * Chalked Inner Palm, 4 3-Segment Articulated Fingers, and 2-Segment Thumb
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

    // Connected Wrist Ball Socket
    const wristBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.068, 12, 12),
      armorMat
    );
    wristPivot.add(wristBall);

    // Gauntlet Cuff
    const cuffMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.074, 0.082, 0.09, 14),
      armorMat
    );
    cuffMesh.position.set(0, -0.02, 0);
    wristPivot.add(cuffMesh);

    // Broad Muscular Palm Block
    const palmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.165, 0.165, 0.062),
      skinMat
    );
    palmMesh.position.set(0, -0.1, 0);
    wristPivot.add(palmMesh);

    // Fingerless Combat Gauntlet Backplate
    const backplateMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.168, 0.135, 0.036),
      armorMat
    );
    backplateMesh.position.set(0, -0.09, -0.02 * mirror);
    wristPivot.add(backplateMesh);

    // White Magnesium Chalked Inner Slap Palm Pad
    const innerPalmPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.155, 0.155, 0.024),
      chalkPalmMat
    );
    innerPalmPad.position.set(0, -0.1, 0.028 * mirror);
    wristPivot.add(innerPalmPad);

    const gauntletGlowStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.145, 0.042, 0.02),
      accentGlowMat
    );
    gauntletGlowStrip.position.set(0, -0.088, -0.036 * mirror);
    wristPivot.add(gauntletGlowStrip);

    // Knuckle Definition Spheres
    for (let k = 0; k < 4; k++) {
      const kx = (k - 1.5) * 0.038;
      const knuckle = new THREE.Mesh(
        new THREE.SphereGeometry(0.021, 10, 10),
        accentGlowMat
      );
      knuckle.position.set(kx, -0.172, -0.022 * mirror);
      wristPivot.add(knuckle);
    }

    const fingerOffsets = [-0.056, -0.019, 0.019, 0.056];
    const fingerLengths = [0.95, 1.08, 1.0, 0.84];
    const fingers: FingerChain[] = [];

    for (let i = 0; i < 4; i++) {
      const fx = fingerOffsets[i];
      const lenScale = fingerLengths[i];

      const proximal = new THREE.Group();
      proximal.position.set(fx, -0.178, 0);
      const proxMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.018, 0.044 * lenScale, 6, 10),
        skinMat
      );
      proxMesh.position.y = -0.026 * lenScale;
      proximal.add(proxMesh);

      const middle = new THREE.Group();
      middle.position.set(0, -0.052 * lenScale, 0);
      const midMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.016, 0.036 * lenScale, 6, 10),
        skinMat
      );
      midMesh.position.y = -0.022 * lenScale;
      middle.add(midMesh);
      proximal.add(middle);

      const distal = new THREE.Group();
      distal.position.set(0, -0.044 * lenScale, 0);
      const distMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.014, 0.03 * lenScale, 6, 10),
        chalkPalmMat
      );
      distMesh.position.y = -0.018 * lenScale;
      distal.add(distMesh);
      middle.add(distal);

      wristPivot.add(proximal);
      fingers.push({ proximal, middle, distal });
    }

    const thumbBase = new THREE.Group();
    thumbBase.position.set(-0.086 * mirror, -0.088, 0.02 * mirror);
    thumbBase.rotation.z = -0.62 * mirror;
    const thumbProxMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.021, 0.046, 6, 10),
      skinMat
    );
    thumbProxMesh.position.y = -0.026;
    thumbBase.add(thumbProxMesh);

    const thumbDistal = new THREE.Group();
    thumbDistal.position.set(0, -0.052, 0);
    const thumbDistMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.018, 0.036, 6, 10),
      chalkPalmMat
    );
    thumbDistMesh.position.y = -0.02;
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
   * Builds 3D Volumetric Company Chest Emblems mounted directly onto the Contender's Chest Armor
   * (No flat 2D planes or cards — real 3D geometry!)
   */
  private build3DCompanyChestEmblem(
    profile: FighterProfile,
    accentGlowMat: THREE.Material
  ): THREE.Group {
    const emblemGroup = new THREE.Group();
    // Positioned on the front chest plate
    emblemGroup.position.set(0, 0.1, 0.285);

    const id = profile.id;

    if (id === 'nadella' || id === 'gates') {
      // Microsoft 4-Color Glowing 3D Windows Logo
      const colors = [0xf25022, 0x7fba00, 0x00a4ef, 0xffb900];
      const offsets = [
        [-0.042, 0.042],
        [0.042, 0.042],
        [-0.042, -0.042],
        [0.042, -0.042],
      ];
      offsets.forEach(([ox, oy], idx) => {
        const tileMat = new THREE.MeshStandardMaterial({
          color: colors[idx],
          emissive: colors[idx],
          emissiveIntensity: 1.4,
          roughness: 0.2,
          metalness: 0.4,
        });
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(0.068, 0.068, 0.028),
          tileMat
        );
        tile.position.set(ox, oy, 0);
        emblemGroup.add(tile);
      });
    } else if (id === 'huang') {
      // NVIDIA Glowing Neon-Green 3D Eye/Spiral Claw Emblem
      const nvMat = new THREE.MeshStandardMaterial({
        color: 0x76b900,
        emissive: 0x76b900,
        emissiveIntensity: 1.9,
        roughness: 0.2,
      });
      const outerEye = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.018, 10, 24),
        nvMat
      );
      outerEye.scale.set(1.35, 0.85, 1);
      emblemGroup.add(outerEye);

      const innerCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 12, 12),
        nvMat
      );
      emblemGroup.add(innerCore);
    } else if (id === 'musk') {
      // SpaceX Swept 3D "X" Delta-Wing Emblem
      const bar1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 0.028, 0.03),
        accentGlowMat
      );
      bar1.rotation.z = 0.72;
      emblemGroup.add(bar1);

      const bar2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.028, 0.03),
        accentGlowMat
      );
      bar2.rotation.z = -0.72;
      emblemGroup.add(bar2);
    } else if (id === 'bezos') {
      // Amazon Glowing Orange 3D Smile Arrow Arch
      const smileMat = new THREE.MeshStandardMaterial({
        color: 0xff9900,
        emissive: 0xff9900,
        emissiveIntensity: 1.7,
        roughness: 0.2,
      });
      const smileArc = new THREE.Mesh(
        new THREE.TorusGeometry(0.095, 0.02, 10, 24, Math.PI * 0.75),
        smileMat
      );
      smileArc.rotation.z = Math.PI * 1.12;
      smileArc.position.y = 0.03;
      emblemGroup.add(smileArc);

      const arrowHead = new THREE.Mesh(
        new THREE.ConeGeometry(0.032, 0.055, 8),
        smileMat
      );
      arrowHead.position.set(0.085, -0.01, 0);
      arrowHead.rotation.z = -0.9;
      emblemGroup.add(arrowHead);
    } else if (id === 'ellison') {
      // Oracle Crimson-Red 3D Capsule Link Emblem
      const oracleRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.068, 0.02, 10, 28),
        accentGlowMat
      );
      oracleRing.scale.set(1.55, 0.78, 1);
      emblemGroup.add(oracleRing);
    } else if (id === 'zuckerberg') {
      // Meta 3D Infinity Loop (Figure-8 Dual Torus)
      const leftLoop = new THREE.Mesh(
        new THREE.TorusGeometry(0.048, 0.016, 10, 24),
        accentGlowMat
      );
      leftLoop.position.x = -0.042;
      leftLoop.rotation.y = 0.25;
      emblemGroup.add(leftLoop);

      const rightLoop = new THREE.Mesh(
        new THREE.TorusGeometry(0.048, 0.016, 10, 24),
        accentGlowMat
      );
      rightLoop.position.x = 0.042;
      rightLoop.rotation.y = -0.25;
      emblemGroup.add(rightLoop);
    } else if (id === 'altman') {
      // OpenAI 6-Node 3D Hexagonal Blossom Core
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const petal = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.014, 0.055, 6, 8),
          accentGlowMat
        );
        petal.position.set(Math.cos(a) * 0.052, Math.sin(a) * 0.052, 0);
        petal.rotation.z = a + Math.PI / 4;
        emblemGroup.add(petal);
      }
    } else if (id === 'amodei') {
      // Anthropic 3D Sunburst Rays Core
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const ray = new THREE.Mesh(
          new THREE.BoxGeometry(0.018, 0.13, 0.026),
          accentGlowMat
        );
        ray.rotation.z = a;
        emblemGroup.add(ray);
      }
    } else if (id === 'pichai') {
      // Google 4-Color 3D Gemini Star / Diamond Ring
      const gColors = [0x4285f4, 0xea4335, 0xfbbc05, 0x34a853];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const gMat = new THREE.MeshStandardMaterial({
          color: gColors[i],
          emissive: gColors[i],
          emissiveIntensity: 1.5,
          roughness: 0.2,
        });
        const arc = new THREE.Mesh(
          new THREE.TorusGeometry(0.068, 0.018, 10, 16, Math.PI * 0.44),
          gMat
        );
        arc.rotation.z = a;
        emblemGroup.add(arc);
      }
    }

    // High-contrast 3D Embossed Chest Brand Plate (matches reference poster chest branding)
    const badgeCanvas = document.createElement('canvas');
    badgeCanvas.width = 512;
    badgeCanvas.height = 160;
    const bCtx = badgeCanvas.getContext('2d');
    if (bCtx) {
      bCtx.clearRect(0, 0, 512, 160);
      bCtx.fillStyle = 'rgba(9, 13, 22, 0.82)';
      bCtx.beginPath();
      bCtx.roundRect(12, 16, 488, 128, 22);
      bCtx.fill();

      bCtx.lineWidth = 5;
      bCtx.strokeStyle = profile.accentColor;
      bCtx.stroke();

      bCtx.textAlign = 'center';
      bCtx.textBaseline = 'middle';
      const label =
        id === 'bezos'
          ? 'amazon'
          : id === 'ellison'
          ? 'ORACLE'
          : id === 'musk'
          ? 'SPACEX'
          : id === 'huang'
          ? 'NVIDIA'
          : id === 'altman'
          ? 'OpenAI'
          : id === 'zuckerberg'
          ? 'Meta'
          : id === 'amodei'
          ? 'CLAUDE'
          : id === 'pichai'
          ? 'Google'
          : id === 'nadella'
          ? 'Microsoft'
          : 'WIN 95';

      bCtx.font = '900 68px "Inter", "Arial Black", sans-serif';
      bCtx.shadowColor = profile.accentColor;
      bCtx.shadowBlur = 14;
      bCtx.fillStyle = '#FFFFFF';
      bCtx.fillText(label, 256, 78);

      if (id === 'bezos') {
        // Orange Amazon smile curve underneath wordmark
        bCtx.strokeStyle = '#FF9900';
        bCtx.lineWidth = 10;
        bCtx.beginPath();
        bCtx.arc(256, 52, 125, 0.22 * Math.PI, 0.78 * Math.PI);
        bCtx.stroke();
      }
    }

    const badgeTex = new THREE.CanvasTexture(badgeCanvas);
    badgeTex.colorSpace = THREE.SRGBColorSpace;
    badgeTex.anisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy()
    );

    const badgePlateMat = new THREE.MeshStandardMaterial({
      map: badgeTex,
      roughness: 0.25,
      metalness: 0.35,
    });
    const badgePlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.29, 0.092, 0.018),
      badgePlateMat
    );
    badgePlate.position.set(0, -0.105, -0.01);
    emblemGroup.add(badgePlate);

    return emblemGroup;
  }

  /**
   * TRUE 3D VOLUMETRIC HEAD & FACIAL ANATOMY FACTORY
   * - Connected Cranium, Cheekbones, Brow Ridge, Hinged Lower Jaw & Chin
   * - 3D Eyeballs + Irises + Pupils, Articulated 3D Eyebrows, 3D Nose Bridge, 3D Ears
   * - Sculpted 3D Hair, Beard/Goatee, and Detachable 3D Eyeglasses
   */
  private buildSculptedHeadAndFacialFeatures(
    profile: FighterProfile,
    skinMat: THREE.Material,
    hairColorHex: number,
    side: 'LEFT' | 'RIGHT'
  ): FacialFeaturesRig {
    const headGroup = new THREE.Group();
    // Expressive stylized brawler head scale so 3D facial features are crisp & unmistakable
    headGroup.scale.setScalar(1.16);

    const isBezos = profile.id === 'bezos';
    const isMusk = profile.id === 'musk';
    const isHuang = profile.id === 'huang';
    const isZuck = profile.id === 'zuckerberg';
    const isEllison = profile.id === 'ellison';
    const isAltman = profile.id === 'altman';
    const isDario = profile.id === 'amodei';
    const isPichai = profile.id === 'pichai';
    const isSatya = profile.id === 'nadella';
    const isGates = profile.id === 'gates';

    // 1. Volumetric Upper Cranium Dome
    const craniumMat =
      isBezos || isSatya
        ? new THREE.MeshStandardMaterial({
            color: new THREE.Color(profile.skinTone),
            roughness: 0.22,
            metalness: 0.1,
          })
        : skinMat;

    const cranium = new THREE.Mesh(
      new THREE.SphereGeometry(0.205, 24, 20),
      craniumMat
    );
    cranium.scale.set(0.96, 1.06, 0.98);
    cranium.position.y = 0.165;
    cranium.castShadow = true;
    headGroup.add(cranium);

    // 2. Sculpted 3D Cheekbones (Left & Right)
    [-0.105, 0.105].forEach((cx) => {
      const cheekBone = new THREE.Mesh(
        new THREE.SphereGeometry(0.072, 14, 12),
        skinMat
      );
      cheekBone.scale.set(1.0, 0.82, 0.95);
      cheekBone.position.set(cx, 0.12, 0.135);
      headGroup.add(cheekBone);
    });

    // 3. Prominent 3D Brow Ridge
    const browRidge = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.028, 0.21, 8, 12),
      skinMat
    );
    browRidge.rotation.z = Math.PI / 2;
    browRidge.position.set(0, 0.215, 0.165);
    headGroup.add(browRidge);

    // 4. Articulated 3D Eyebrows
    const browMat = new THREE.MeshStandardMaterial({
      color: isHuang || isGates ? 0x9ca3af : hairColorHex,
      roughness: 0.7,
    });
    const leftBrow = new THREE.Mesh(
      new THREE.BoxGeometry(0.088, 0.025, 0.038),
      browMat
    );
    leftBrow.position.set(-0.068, 0.224, 0.195);
    headGroup.add(leftBrow);

    const rightBrow = new THREE.Mesh(
      new THREE.BoxGeometry(0.088, 0.025, 0.038),
      browMat
    );
    rightBrow.position.set(0.068, 0.224, 0.195);
    headGroup.add(rightBrow);

    // 5. 3D Eyeballs with Colored Irises & Pupils
    const eyeWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.15,
    });
    const irisMat = new THREE.MeshStandardMaterial({
      color: isMusk || isBezos || isGates ? 0x3b82f6 : 0x451a03,
      roughness: 0.3,
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x09090b });

    const buildEye = (ex: number) => {
      const eyeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.038, 14, 14),
        eyeWhiteMat
      );
      eyeMesh.position.set(ex, 0.172, 0.172);
      headGroup.add(eyeMesh);

      const pupilGroup = new THREE.Group();
      const iris = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 10, 10),
        irisMat
      );
      iris.scale.z = 0.4;
      iris.position.z = 0.033;
      pupilGroup.add(iris);

      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.011, 8, 8),
        pupilMat
      );
      pupil.scale.z = 0.4;
      pupil.position.z = 0.037;
      pupilGroup.add(pupil);

      eyeMesh.add(pupilGroup);
      return { eyeMesh, pupilGroup };
    };

    const leftEyeObj = buildEye(-0.068);
    const rightEyeObj = buildEye(0.068);

    // 6. Sculpted 3D Nose Bridge, Tip & Nostrils
    const noseGroup = new THREE.Group();
    noseGroup.position.set(0, 0.145, 0.195);

    const noseBridge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.032, 0.082, 10),
      skinMat
    );
    noseBridge.rotation.x = -0.28;
    noseGroup.add(noseBridge);

    const noseTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 12, 12),
      skinMat
    );
    noseTip.position.set(0, -0.034, 0.022);
    noseGroup.add(noseTip);
    headGroup.add(noseGroup);

    // 7. Sculpted 3D Ears (Left & Right)
    const buildEar = (isRightEar: boolean) => {
      const earGroup = new THREE.Group();
      const sign = isRightEar ? 1 : -1;
      earGroup.position.set(sign * 0.198, 0.15, -0.01);
      earGroup.rotation.y = sign * -0.22;

      const outerHelix = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.024, 0.055, 6, 10),
        skinMat
      );
      earGroup.add(outerHelix);
      headGroup.add(earGroup);
      return earGroup;
    };
    const leftEar = buildEar(false);
    const rightEar = buildEar(true);

    // 8. Hinged 3D Lower Jaw, Chiseled Chin & Mouth Interior
    const jawGroup = new THREE.Group();
    jawGroup.position.set(0, 0.065, 0.03);

    const jawBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.21, 0.095, 0.185),
      skinMat
    );
    jawBlock.position.set(0, -0.018, 0.045);
    jawBlock.castShadow = true;
    jawGroup.add(jawBlock);

    const chinMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.048, 0.065, 8, 12),
      skinMat
    );
    chinMesh.rotation.z = Math.PI / 2;
    chinMesh.position.set(0, -0.058, 0.128);
    jawGroup.add(chinMesh);

    // Mouth Cavity & Teeth Line (visible when jaw drops open)
    const mouthInterior = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.032, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x3f1318 })
    );
    mouthInterior.position.set(0, 0.025, 0.13);
    jawGroup.add(mouthInterior);

    const teethStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.012, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc })
    );
    teethStrip.position.set(0, 0.036, 0.142);
    jawGroup.add(teethStrip);

    // 9. Struck Cheek Swelling & Red Palm-Print Overlay (on the camera-facing cheek)
    const struckCheekX = side === 'LEFT' ? -0.132 : 0.132;
    const cheekMarkMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const struckCheekMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 14, 14),
      cheekMarkMat
    );
    struckCheekMesh.scale.set(0.55, 1.15, 1.1);
    struckCheekMesh.position.set(struckCheekX, 0.115, 0.11);
    headGroup.add(struckCheekMesh);

    // 10. Custom 3D Volumetric Hair Factory per Contender
    if (!isBezos && !isSatya) {
      const hairMat = new THREE.MeshStandardMaterial({
        color: isHuang ? 0xd1d5db : isGates ? 0xd6bc8b : hairColorHex,
        roughness: 0.65,
        metalness: 0.1,
      });

      const hairCap = new THREE.Mesh(
        new THREE.SphereGeometry(
          0.214,
          20,
          16,
          0,
          Math.PI * 2,
          0,
          Math.PI * 0.52
        ),
        hairMat
      );
      hairCap.position.set(0, 0.175, -0.01);
      hairCap.rotation.x = -0.18;
      headGroup.add(hairCap);

      if (isHuang) {
        // Jensen's signature swept-back silver locks + sideburns
        for (let s = -2; s <= 2; s++) {
          const lock = new THREE.Mesh(
            new THREE.BoxGeometry(0.065, 0.055, 0.24),
            hairMat
          );
          lock.position.set(s * 0.048, 0.34 - Math.abs(s) * 0.015, 0.02);
          lock.rotation.x = 0.22;
          headGroup.add(lock);
        }
      } else if (isZuck || isDario) {
        // Volumetric 3D Curly Clusters for Zuck & Dario
        for (let c = 0; c < 18; c++) {
          const curl = new THREE.Mesh(
            new THREE.SphereGeometry(0.058, 10, 10),
            hairMat
          );
          const phi = (c / 18) * Math.PI * 1.7 - Math.PI * 0.85;
          const row = c % 3;
          curl.position.set(
            Math.sin(phi) * (0.16 - row * 0.03),
            0.29 + row * 0.04,
            Math.cos(phi) * 0.15 + 0.02
          );
          headGroup.add(curl);
        }
      } else if (isMusk || isAltman || isEllison) {
        // Layered 3D Swept Crest
        for (let l = -2; l <= 2; l++) {
          const crest = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.038, 0.18, 6, 10),
            hairMat
          );
          crest.rotation.x = Math.PI / 2 - 0.25;
          crest.rotation.z = l * 0.12;
          crest.position.set(l * 0.045, 0.34 - Math.abs(l) * 0.012, 0.04);
          headGroup.add(crest);
        }
      } else if (isPichai || isGates) {
        // Sculpted Side-Part Volume
        const sideWave = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.075, 0.24),
          hairMat
        );
        sideWave.position.set(0.02, 0.33, 0.02);
        sideWave.rotation.z = -0.14;
        headGroup.add(sideWave);
      }
    }

    // 11. Custom 3D Beard & Goatee Meshes
    if (isEllison) {
      const beardMat = new THREE.MeshStandardMaterial({
        color: 0x3f3f46,
        roughness: 0.85,
      });
      const goatee = new THREE.Mesh(
        new THREE.BoxGeometry(0.095, 0.075, 0.065),
        beardMat
      );
      goatee.position.set(0, -0.055, 0.135);
      jawGroup.add(goatee);

      const stache = new THREE.Mesh(
        new THREE.BoxGeometry(0.125, 0.024, 0.045),
        beardMat
      );
      stache.position.set(0, 0.042, 0.16);
      jawGroup.add(stache);
    } else if (isDario || isPichai || isSatya) {
      const beardMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.88,
      });
      const fullBeard = new THREE.Mesh(
        new THREE.BoxGeometry(0.218, isDario ? 0.11 : 0.08, 0.19),
        beardMat
      );
      fullBeard.position.set(0, -0.032, 0.05);
      jawGroup.add(fullBeard);
    }

    // 12. Detachable 3D Eyeglasses (Jensen, Gates, Pichai, Satya)
    let glassesMesh: THREE.Group | null = null;
    if (profile.hasGlasses || isHuang || isGates || isPichai || isSatya) {
      glassesMesh = new THREE.Group();
      glassesMesh.position.set(0, 0.175, 0.195);

      const frameMat = new THREE.MeshStandardMaterial({
        color: isHuang ? 0x09090b : isGates ? 0xd97706 : 0x94a3b8,
        metalness: 0.85,
        roughness: 0.2,
      });
      const lensMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
        roughness: 0.1,
        metalness: 0.9,
      });

      [-0.068, 0.068].forEach((gx) => {
        const rimFrame = new THREE.Mesh(
          new THREE.BoxGeometry(0.092, 0.056, 0.016),
          frameMat
        );
        rimFrame.position.x = gx;
        glassesMesh!.add(rimFrame);

        const lens = new THREE.Mesh(
          new THREE.BoxGeometry(0.076, 0.042, 0.018),
          lensMat
        );
        lens.position.x = gx;
        glassesMesh!.add(lens);
      });

      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.046, 0.014, 0.016),
        frameMat
      );
      glassesMesh.add(bridge);

      [-0.115, 0.115].forEach((tx) => {
        const templeArm = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, 0.014, 0.18),
          frameMat
        );
        templeArm.position.set(tx, 0, -0.09);
        glassesMesh!.add(templeArm);
      });

      headGroup.add(glassesMesh);
    }

    headGroup.add(jawGroup);

    return {
      headGroup,
      jawGroup,
      mouthInterior,
      leftEye: leftEyeObj.eyeMesh,
      rightEye: rightEyeObj.eyeMesh,
      leftPupil: leftEyeObj.pupilGroup,
      rightPupil: rightEyeObj.pupilGroup,
      leftBrow,
      rightBrow,
      noseGroup,
      leftEar,
      rightEar,
      struckCheekMesh,
      cheekMarkMat,
      glassesMesh,
      glassesWorldPos: new THREE.Vector3(),
      glassesWorldVelocity: new THREE.Vector3(),
      glassesAngularVelocity: new THREE.Vector3(),
      glassesDetached: false,
      headSpringRot: new THREE.Vector3(),
      headSpringVel: new THREE.Vector3(),
      jawSpringOffset: new THREE.Vector3(),
      jawSpringVel: new THREE.Vector3(),
    };
  }

  /**
   * Builds a 100% Connected Volumetric 3D Contender Rig
   */
  private createContenderRig(
    profile: FighterProfile,
    side: 'LEFT' | 'RIGHT',
    useGoldenArmor: boolean
  ): Contender3DRig {
    const root = new THREE.Group();
    const xPos = side === 'LEFT' ? -0.82 : 0.82;
    root.position.set(xPos, 0, 0);
    root.rotation.y = side === 'LEFT' ? Math.PI / 2 : -Math.PI / 2;

    const emissiveMaterials: THREE.MeshStandardMaterial[] = [];
    const isBezos = profile.id === 'bezos';

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
    const hairColorHex =
      parseInt(profile.hairColor.replace('#', '0x'), 16) || 0x27272a;

    const muscleScale = isBezos ? 1.18 : 1.0;

    const primaryArmorMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      metalness: 0.72,
      roughness: 0.28,
    });
    const secondaryArmorMat = new THREE.MeshStandardMaterial({
      color: secondaryColor,
      metalness: 0.8,
      roughness: 0.22,
    });
    const beltMetalMat = new THREE.MeshStandardMaterial({
      color: 0x71717a,
      metalness: 0.88,
      roughness: 0.24,
    });
    const accentGlowMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 1.8,
      roughness: 0.18,
      metalness: 0.5,
    });
    emissiveMaterials.push(accentGlowMat);

    const skinMat = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.42,
      metalness: 0.06,
    });

    const chalkPalmMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: accentColor,
      emissiveIntensity: 0.25,
      roughness: 0.85,
    });

    // 1. Connected Pelvis & Tactical Segmented Championship Utility Belt
    const pelvis = new THREE.Group();
    pelvis.position.set(0, 0.86, 0);
    root.add(pelvis);

    const pelvisCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.22, 0.2, 18),
      secondaryArmorMat
    );
    pelvisCore.castShadow = true;
    pelvis.add(pelvisCore);

    // Tactical Utility Belt Band + 8 Segmented Belt Cartridges (matches reference poster)
    const beltBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.248, 0.248, 0.085, 20),
       new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.5,
        metalness: 0.5,
      })
    );
    beltBand.position.y = 0.02;
    pelvis.add(beltBand);

    for (let b = 0; b < 8; b++) {
      const bAngle = (b / 8) * Math.PI * 2;
      const pouch = new THREE.Mesh(
        new THREE.BoxGeometry(0.068, 0.092, 0.042),
        beltMetalMat
      );
      pouch.position.set(
        Math.sin(bAngle) * 0.245,
        0.02,
        Math.cos(bAngle) * 0.245
      );
      pouch.rotation.y = bAngle;
      pelvis.add(pouch);
    }

    const buckleCore = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.1, 0.065),
      accentGlowMat
    );
    buckleCore.position.set(0, 0.02, 0.235);
    pelvis.add(buckleCore);

    // 2. Connected Muscular Torso & V-Taper Chest + 3D Company Emblem
    const torso = new THREE.Group();
    torso.position.set(0, 0.08, 0);
    pelvis.add(torso);

    // Waist connection sphere so spine bend never shows a gap
    const waistSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.225, 16, 14),
      primaryArmorMat
    );
    torso.add(waistSphere);

    const chestGroup = new THREE.Group();
    chestGroup.position.set(0, 0.26, 0);
    torso.add(chestGroup);

    const chestCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.31 * muscleScale, 0.24, 0.5, 20),
      primaryArmorMat
    );
    chestCore.castShadow = true;
    chestGroup.add(chestCore);

    // Sculpted Pectoral Armor / Muscle Plates
    [-0.085 * muscleScale, 0.085 * muscleScale].forEach((px) => {
      const pec = new THREE.Mesh(
        new THREE.BoxGeometry(0.15 * muscleScale, 0.17, 0.1),
        secondaryArmorMat
      );
      pec.position.set(px, 0.1, 0.22);
      chestGroup.add(pec);
    });

    // 3D Volumetric Company Chest Emblem + Brand Wordmark Plate
    const emblem3D = this.build3DCompanyChestEmblem(profile, accentGlowMat);
    chestGroup.add(emblem3D);

    // Tactical Polo/Armor Collar Ring
    const collarRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.155 * muscleScale, 0.028, 10, 20),
      secondaryArmorMat
    );
    collarRing.rotation.x = Math.PI / 2;
    collarRing.position.set(0, 0.25, 0.01);
    chestGroup.add(collarRing);

    // Jensen Huang popped biker jacket collar
    if (profile.hasJacketCollar || profile.id === 'huang') {
      const leatherMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        metalness: 0.35,
        roughness: 0.32,
      });
      [-0.15, 0.15].forEach((cx) => {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.18, 0.16),
          leatherMat
        );
        wing.position.set(cx, 0.27, 0.02);
        wing.rotation.z = cx < 0 ? -0.35 : 0.35;
        chestGroup.add(wing);
      });
    }

    // Mark Zuckerberg 3D Gold Chain
    if (profile.id === 'zuckerberg') {
      const chain = new THREE.Mesh(
        new THREE.TorusGeometry(0.19, 0.018, 10, 24),
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          metalness: 0.95,
          roughness: 0.15,
        })
      );
      chain.rotation.x = Math.PI / 2 + 0.25;
      chain.position.set(0, 0.24, 0.06);
      chestGroup.add(chain);
    }

    // 3. Connected Neck & Sculpted 3D Head
    const neck = new THREE.Group();
    neck.position.set(0, 0.52, 0);
    torso.add(neck);

    const neckSocket = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 14, 12),
      secondaryArmorMat
    );
    neck.add(neckSocket);

    const neckCol = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.105 * muscleScale,
        0.125 * muscleScale,
        0.15,
        14
      ),
      skinMat
    );
    neckCol.position.y = 0.06;
    neck.add(neckCol);

    const facial = this.buildSculptedHeadAndFacialFeatures(
      profile,
      skinMat,
      hairColorHex,
      side
    );
    facial.headGroup.position.set(0, 0.11, 0);
    neck.add(facial.headGroup);

    // Cheek Target Holographic Reticule on the camera-facing cheek
    const targetRingGeo = new THREE.RingGeometry(0.055, 0.085, 24);
    targetRingGeo.rotateY(Math.PI / 2);
    const targetRingMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const cheekTargetRing = new THREE.Mesh(targetRingGeo, targetRingMat);
    cheekTargetRing.position.set(
      side === 'LEFT' ? -0.22 : 0.22,
      0.13,
      0.08
    );
    facial.headGroup.add(cheekTargetRing);

    // 4. Connected Muscular Arms (Deltoid Socket + Pauldron Stripes + Bicep + Elbow Sphere + Forearm + Open Slap Hand)
    const isShortSleeve =
      profile.id === 'bezos' || profile.id === 'zuckerberg';
    const forearmMat = isShortSleeve ? skinMat : secondaryArmorMat;

    const buildArm = (isRightArm: boolean) => {
      const sX = (isRightArm ? -0.33 : 0.33) * muscleScale;
      const shoulder = new THREE.Group();
      shoulder.position.set(sX, 0.44, 0);
      torso.add(shoulder);

      // Connected Deltoid Ball Joint (eliminates any shoulder gap!)
      const deltoidSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.145 * muscleScale, 16, 14),
        secondaryArmorMat
      );
      shoulder.add(deltoidSphere);

      // Segmented Pauldron Accent Rib (matches reference poster shoulder armor)
      const pauldronRib = new THREE.Mesh(
        new THREE.TorusGeometry(0.148 * muscleScale, 0.018, 8, 18, Math.PI),
        accentGlowMat
      );
      pauldronRib.rotation.y = isRightArm ? -Math.PI / 2 : Math.PI / 2;
      shoulder.add(pauldronRib);

      const bicep = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.088 * muscleScale, 0.22, 8, 12),
        isShortSleeve ? skinMat : primaryArmorMat
      );
      bicep.position.y = -0.14;
      bicep.castShadow = true;
      shoulder.add(bicep);

      const elbow = new THREE.Group();
      elbow.position.set(0, -0.27, 0);
      shoulder.add(elbow);

      // Connected Elbow Joint Sphere
      const elbowSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.084 * muscleScale, 12, 12),
        forearmMat
      );
      elbow.add(elbowSphere);

      const forearm = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.08 * muscleScale, 0.21, 8, 12),
        forearmMat
      );
      forearm.position.y = -0.13;
      forearm.castShadow = true;
      elbow.add(forearm);

      // Armored Forearm Cuff Ring
      const wristBand = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.086 * muscleScale,
          0.082 * muscleScale,
          0.055,
          14
        ),
        accentGlowMat
      );
      wristBand.position.y = -0.2;
      elbow.add(wristBand);

      const hand = this.createHeavyArticulatedGauntletHand(
        skinMat,
        secondaryArmorMat,
        accentGlowMat,
        chalkPalmMat,
        isRightArm
      );
      hand.wristPivot.position.set(0, -0.24, 0);
      elbow.add(hand.wristPivot);

      return { shoulder, elbow, hand };
    };

    const leftArm = buildArm(false);
    const rightArm = buildArm(true);

    // For LEFT fighter (rotated +90° Y), rightArm (-X local) is at +Z world (closest to camera).
    // For RIGHT fighter (rotated -90° Y), leftArm (+X local) is at +Z world (closest to camera).
    const strikeArm = side === 'LEFT' ? rightArm : leftArm;
    const braceArm = side === 'LEFT' ? leftArm : rightArm;

    // 5. Connected Muscular Legs, Knee Spheres, Shin Armor Straps & Combat Boots
    const buildLeg = (isRightLeg: boolean) => {
      const hX = isRightLeg ? -0.15 : 0.15;
      const hip = new THREE.Group();
      hip.position.set(hX, -0.05, 0);
      pelvis.add(hip);

      const hipBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.108, 12, 12),
        secondaryArmorMat
      );
      hip.add(hipBall);

      const thigh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.105, 0.28, 8, 12),
        primaryArmorMat
      );
      thigh.position.y = -0.19;
      thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.set(0, -0.38, 0);
      hip.add(knee);

      const kneeSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 12, 12),
        secondaryArmorMat
      );
      knee.add(kneeSphere);

      const kneePad = new THREE.Mesh(
        new THREE.BoxGeometry(0.145, 0.15, 0.15),
        accentGlowMat
      );
      kneePad.position.set(0, 0, 0.035);
      knee.add(kneePad);

      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.078, 0.35, 14),
        primaryArmorMat
      );
      shin.position.y = -0.19;
      shin.castShadow = true;
      knee.add(shin);

      // Segmented Shin Armor Straps (matches reference poster leg armor)
      [-0.12, -0.25].forEach((sy) => {
        const shinStrap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.096, 0.092, 0.042, 14),
          beltMetalMat
        );
        shinStrap.position.y = sy;
        knee.add(shinStrap);
      });

      const boot = new THREE.Group();
      boot.position.set(0, -0.38, 0);
      knee.add(boot);

      const ankleSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.078, 10, 10),
        secondaryArmorMat
      );
      boot.add(ankleSphere);

      const bootMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.12, 0.29),
        secondaryArmorMat
      );
      bootMesh.position.set(0, -0.04, 0.05);
      bootMesh.castShadow = true;
      boot.add(bootMesh);

      const bootToeCap = new THREE.Mesh(
        new THREE.BoxGeometry(0.164, 0.085, 0.11),
        accentGlowMat
      );
      bootToeCap.position.set(0, -0.055, 0.145);
      boot.add(bootToeCap);

      return { hip, knee, boot };
    };

    const leftLeg = buildLeg(false);
    const rightLeg = buildLeg(true);

    // 6. Slap Arc Motion Ribbon
    const arcGeo = new THREE.RingGeometry(0.48, 0.86, 28, 1, 0, Math.PI * 0.85);
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
    slapTrailArc.position.set(0, 1.48, 0);
    root.add(slapTrailArc);

    // 7. Ground Aura Ring
    const auraGeo = new THREE.RingGeometry(0.42, 0.54, 32);
    auraGeo.rotateX(-Math.PI / 2);
    const auraMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const auraRing = new THREE.Mesh(auraGeo, auraMat);
    auraRing.position.y = 0.02;
    root.add(auraRing);

    this.scene.add(root);

    return {
      root,
      pelvis,
      torso,
      chestGroup,
      neck,
      facial,
      leftShoulder: leftArm.shoulder,
      leftElbow: leftArm.elbow,
      leftHand: leftArm.hand,
      rightShoulder: rightArm.shoulder,
      rightElbow: rightArm.elbow,
      rightHand: rightArm.hand,
      strikeShoulder: strikeArm.shoulder,
      strikeElbow: strikeArm.elbow,
      strikeHand: strikeArm.hand,
      braceShoulder: braceArm.shoulder,
      braceElbow: braceArm.elbow,
      braceHand: braceArm.hand,
      leftHip: leftLeg.hip,
      leftKnee: leftLeg.knee,
      leftBoot: leftLeg.boot,
      rightHip: rightLeg.hip,
      rightKnee: rightLeg.knee,
      rightBoot: rightLeg.boot,
      slapTrailArc,
      auraRing,
      cheekTargetRing,
      emissiveMaterials,
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
      slapCountTaken: 0,
    };
  }

  private poseArticulatedHand(
    hand: ArticulatedHandRig,
    mode: 'SLAP_READY' | 'FIST_GRIP' | 'HOVER_MEASURE' | 'RELAXED',
    time: number,
    tensionAmount: number = 0.5
  ): void {
    if (mode === 'FIST_GRIP') {
      for (let i = 0; i < 4; i++) {
        const f = hand.fingers[i];
        f.proximal.rotation.set(1.35, 0, 0);
        f.middle.rotation.set(1.45, 0, 0);
        f.distal.rotation.set(1.15, 0, 0);
      }
      hand.thumb.base.rotation.set(0.65, 0.4, -0.3);
      hand.thumb.distal.rotation.set(0.75, 0, 0);
      return;
    }

    if (mode === 'SLAP_READY' || mode === 'HOVER_MEASURE') {
      for (let i = 0; i < 4; i++) {
        const f = hand.fingers[i];
        const spreadAngle = (i - 1.5) * (mode === 'SLAP_READY' ? 0.16 : 0.09);
        const twitch = Math.sin(time * 9 + i * 1.4) * 0.05 * tensionAmount;
        f.proximal.rotation.set(0.08 + twitch, 0, spreadAngle);
        f.middle.rotation.set(0.12 + tensionAmount * 0.08, 0, 0);
        f.distal.rotation.set(0.08, 0, 0);
      }
      hand.thumb.base.rotation.set(0.12, 0, -0.72);
      hand.thumb.distal.rotation.set(0.15, 0, 0);
      return;
    }

    for (let i = 0; i < 4; i++) {
      const f = hand.fingers[i];
      f.proximal.rotation.set(0.35, 0, (i - 1.5) * 0.05);
      f.middle.rotation.set(0.4, 0, 0);
      f.distal.rotation.set(0.3, 0, 0);
    }
    hand.thumb.base.rotation.set(0.25, 0, -0.45);
    hand.thumb.distal.rotation.set(0.25, 0, 0);
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

    this.leftRig = this.createContenderRig(
      leftProfile,
      'LEFT',
      leftHasChampionArmor
    );
    this.rightRig = this.createContenderRig(rightProfile, 'RIGHT', false);

    this.setArenaEnvironment(rightProfile, leftProfile);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  /**
   * Creates a 3D Stadium Rafter Company Signage Truss with high-anisotropy procedural CanvasTexture
   * (Matches the illuminated "amazon" and "ORACLE" stadium backdrops behind the Left and Right fighters)
   */
  private createCompanyStadiumSignage(
    fighter: FighterProfile,
    isLeft: boolean
  ): THREE.Group {
    const signGroup = new THREE.Group();

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, 512, 192);

      // Subtle glowing border
      ctx.strokeStyle = fighter.accentColor;
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, 496, 176);

      // Company name in bold geometric arena typography
      ctx.save();
      ctx.font = '900 66px "Chakra Petch", "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = fighter.accentColor;
      ctx.shadowBlur = 22;
      ctx.fillStyle = '#FFF7D6';
      ctx.fillText(fighter.company.toUpperCase(), 256, 86);
      ctx.restore();

      // Subtitle / Contender Name
      ctx.font = '700 24px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = fighter.accentColor;
      ctx.fillText(
        `${fighter.name.toUpperCase()} • ${fighter.arenaLocation.toUpperCase()}`,
        256,
        146
      );
    }

    const signTex = new THREE.CanvasTexture(canvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    signTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x161f30,
      metalness: 0.88,
      roughness: 0.22,
    });
    const frameBox = new THREE.Mesh(
      new THREE.BoxGeometry(2.35, 0.92, 0.12),
      frameMat
    );
    signGroup.add(frameBox);

    const screenGeo = new THREE.PlaneGeometry(2.22, 0.82);
    const screenMat = new THREE.MeshBasicMaterial({
      map: signTex,
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.z = 0.065;
    signGroup.add(screenMesh);

    signGroup.position.set(isLeft ? -2.25 : 2.25, 2.72, -3.55);
    signGroup.rotation.y = isLeft ? 0.24 : -0.24;
    return signGroup;
  }

  public setArenaEnvironment(
    arenaFighter: FighterProfile,
    leftFighter?: FighterProfile
  ): void {
    const activeLeft = leftFighter || this.leftRig?.profile || arenaFighter;
    const envKey = `${activeLeft.id}_vs_${arenaFighter.id}`;
    if (this.currentEnvironmentKey === envKey) return;
    this.currentEnvironmentKey = envKey;

    while (this.hqEnvironmentGroup.children.length > 0) {
      const child = this.hqEnvironmentGroup.children[0];
      this.hqEnvironmentGroup.remove(child);
    }

    const accent = new THREE.Color(arenaFighter.accentColor);
    const primary = new THREE.Color(arenaFighter.primaryColor);

    if (this.podiumScoreRing) {
      (this.podiumScoreRing.material as THREE.MeshBasicMaterial).color.copy(
        accent
      );
    }

    // 1. Left & Right Contender Stadium Company Signage Trusses
    const leftBanner = this.createCompanyStadiumSignage(activeLeft, true);
    const rightBanner = this.createCompanyStadiumSignage(arenaFighter, false);
    this.hqEnvironmentGroup.add(leftBanner);
    this.hqEnvironmentGroup.add(rightBanner);

    // 2. Central Championship Portal Arch & Pillars
    const portalMat = new THREE.MeshStandardMaterial({
      color: primary,
      emissive: accent,
      emissiveIntensity: 0.78,
      metalness: 0.85,
      roughness: 0.2,
    });

    const archMesh = new THREE.Mesh(
      new THREE.TorusGeometry(4.2, 0.14, 12, 48, Math.PI),
      portalMat
    );
    archMesh.position.set(0, 0.2, -4.5);
    this.hqEnvironmentGroup.add(archMesh);

    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 4.8, 0.32),
        portalMat
      );
      pillar.position.set(i * 2.1, 2.4, -4.8 - Math.abs(i) * 0.4);
      this.hqEnvironmentGroup.add(pillar);
    }

    // 3. Signature 3D HQ Architectural Monument for the Active Arena
    const monumentGroup = new THREE.Group();
    monumentGroup.position.set(0, 2.15, -4.9);

    switch (arenaFighter.id) {
      case 'bezos': {
        // Seattle Spheres Geodesic Dome
        const sphereDome = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.15, 2),
          new THREE.MeshStandardMaterial({
            color: 0xff9900,
            emissive: 0xff9900,
            emissiveIntensity: 0.55,
            wireframe: true,
          })
        );
        monumentGroup.add(sphereDome);
        break;
      }
      case 'altman': {
        // OpenAI Neural Alignment Ring
        const ring = new THREE.Mesh(
          new THREE.TorusKnotGeometry(0.75, 0.14, 48, 12),
          portalMat
        );
        monumentGroup.add(ring);
        break;
      }
      case 'musk': {
        // SpaceX Booster Spire
        const rocket = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.38, 2.8, 16),
          portalMat
        );
        const nose = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 0.65, 16),
          portalMat
        );
        nose.position.y = 1.72;
        monumentGroup.add(rocket, nose);
        break;
      }
      case 'huang': {
        // NVIDIA Triangular Tensor Prism
        const prism = new THREE.Mesh(
          new THREE.OctahedronGeometry(1.05, 0),
          portalMat
        );
        monumentGroup.add(prism);
        break;
      }
      case 'ellison': {
        // Oracle Crimson Database Monolith Stack
        for (let d = -1; d <= 1; d++) {
          const disk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.95, 0.95, 0.32, 24),
            portalMat
          );
          disk.position.y = d * 0.48;
          monumentGroup.add(disk);
        }
        break;
      }
      default: {
        // Holographic Championship Globe
        const core = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.95, 1),
          portalMat
        );
        monumentGroup.add(core);
        break;
      }
    }

    this.hqEnvironmentGroup.add(monumentGroup);
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.currentCameraPreset = preset;
    this.activeCameraMode = preset;
  }

  public setSpecialAura(side: 'LEFT' | 'RIGHT', active: boolean): void {
    const rig = side === 'LEFT' ? this.leftRig : this.rightRig;
    if (!rig) return;
    rig.specialAuraActive = active;
    rig.emissiveMaterials.forEach((m) => {
      m.emissiveIntensity = active ? 3.5 : 1.8;
    });
    const auraMat = rig.auraRing.material as THREE.MeshBasicMaterial;
    auraMat.opacity = active ? 0.94 : 0.45;
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
        ? 0.21
        : targetAngle === 'MID_CHEEK'
          ? 0.13
          : 0.05;
    defender.cheekTargetRing.position.y = cheekY;
    const ringMat = defender.cheekTargetRing.material as THREE.MeshBasicMaterial;
    ringMat.opacity = 0.92;
  }

  public triggerFakeout(strikerSide: 'LEFT' | 'RIGHT'): void {
    this.activeStrikerSide = strikerSide;
    const striker = strikerSide === 'LEFT' ? this.leftRig : this.rightRig;
    const defender = strikerSide === 'LEFT' ? this.rightRig : this.leftRig;
    if (!striker || !defender) return;

    striker.animState = 'FAKEOUT';
    striker.stateTimer = 0;

    soundEngine.playWindUpWhoosh(0.75);
    const tauntWord = soundEngine.getContenderTaunt(
      striker.profile.id,
      'FAKEOUT'
    );
    setTimeout(() => {
      soundEngine.speakTaunt(tauntWord, 1.1, 1.15);
    }, 420);
  }

  public triggerFlinchReaction(defenderSide: 'LEFT' | 'RIGHT'): void {
    const defender = defenderSide === 'LEFT' ? this.leftRig : this.rightRig;
    if (!defender) return;

    defender.animState = 'FLINCHED';
    defender.stateTimer = 0;
    defender.facial.headSpringVel.set(-5.5, 2.5, 2.0);
    soundEngine.playFlinchGasp();
  }

  public updatePracticeSwingAndTorque(
    strikerSide: 'LEFT' | 'RIGHT',
    torqueChargeNormalized: number
  ): void {
    const striker = strikerSide === 'LEFT' ? this.leftRig : this.rightRig;
    if (!striker) return;
    striker.torqueChargeLevel = torqueChargeNormalized;
    this.crowdHypeLevel = Math.min(1.15, 0.45 + torqueChargeNormalized * 0.5);

    const handX = strikerSide === 'LEFT' ? -0.25 : 0.25;
    this.spawnChalkPuff(handX, 1.48, 0.35);
    soundEngine.playChalkPuff();
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

  /**
   * VIOLENT SLAP IMPACT, SPRING HEAD-WHIPLASH, JAW SNAP, CHEEK BRUISING & FLYING GLASSES
   */
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
    (striker.slapTrailArc.material as THREE.MeshBasicMaterial).opacity = 0.96;

    defender.slapCountTaken += 1;
    defender.stateTimer = 0;
    defender.recoilIntensity = recoilIntensity;
    defender.headWhipAngle = headWhipRadians;
    defender.footSlideOffset = footSlideMeters;
    defender.koType = koType;

    // Impulse the under-damped 3-axis head & jaw whiplash spring solver!
    // Striker hits the defender's foreground cheek (+Z world), whipping the defender's head away toward -Z world!
    const whipSign = defender.side === 'LEFT' ? 1 : -1;
    const impulseStrength = 14.0 + recoilIntensity * 12.0;
    defender.facial.headSpringVel.set(
      -5.5 * recoilIntensity,
      whipSign * impulseStrength,
      whipSign * 8.5 * recoilIntensity
    );
    defender.facial.jawSpringVel.set(
      whipSign * 1.4 * recoilIntensity,
      -0.9 * recoilIntensity,
      0
    );

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

    const ringMat = defender.cheekTargetRing.material as THREE.MeshBasicMaterial;
    ringMat.opacity = 0;

    // Progressive Red Palm-Print & Cheek Swelling
    defender.facial.cheekMarkMat.opacity = Math.min(
      0.9,
      defender.slapCountTaken * 0.35
    );
    defender.facial.struckCheekMesh.scale.set(
      0.55 + defender.slapCountTaken * 0.16,
      1.15 + defender.slapCountTaken * 0.18,
      1.1 + defender.slapCountTaken * 0.15
    );

    // 55ms Hit-Stop Freeze Frame + FOV Punch
    this.hitStopTimer = 0.055;
    this.currentFov = this.baseFov - 6.5;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    // Get exact world coordinates of the defender's struck cheek for chalk & sweat burst
    defender.facial.struckCheekMesh.getWorldPosition(_worldCheekPos);

    if (this.slapFlashLight) {
      this.slapFlashLight.intensity = isKO ? 18 : 11;
      this.slapFlashLight.position.copy(_worldCheekPos).add(_flashOffset);
    }

    const particleScale =
      koType === 'CRITICAL_KO'
        ? 2.2
        : koType === 'CLEAN_KO'
          ? 1.8
          : isKO
            ? 1.5
            : 1.2;

    this.spawnTalcumChalkBurst(
      _worldCheekPos.x,
      _worldCheekPos.y,
      _worldCheekPos.z,
      particleScale
    );
    this.spawnSweatSpitBurst(
      _worldCheekPos.x,
      _worldCheekPos.y,
      _worldCheekPos.z,
      particleScale,
      defender.side === 'LEFT'
    );

    // FLYING EYEGLASSES MECHANIC
    if (
      defender.facial.glassesMesh &&
      !defender.facial.glassesDetached &&
      (recoilIntensity > 0.76 || isKO)
    ) {
      defender.facial.glassesDetached = true;
      defender.facial.glassesMesh.getWorldPosition(
        defender.facial.glassesWorldPos
      );
      this.scene.attach(defender.facial.glassesMesh);

      const flyDirX = defender.side === 'LEFT' ? -1 : 1;
      defender.facial.glassesWorldVelocity.set(
        flyDirX * (2.6 + Math.random() * 1.8),
        3.4 + Math.random() * 1.4,
        -1.5 + (Math.random() - 0.5) * 1.2
      );
      defender.facial.glassesAngularVelocity.set(
        (Math.random() - 0.5) * 24,
        flyDirX * 19,
        (Math.random() - 0.5) * 22
      );
    }

    if (isKO) {
      this.koFreezeTimer = 0.22;
      this.koReplayTimer = 3.2;
      this.koReplayOrbitAngle = strikerSide === 'LEFT' ? 0.35 : -0.35;
      this.activeCameraMode = 'KO_REPLAY_ORBIT';
      this.slowMoFactor = 0.22;
      this.slowMoTimer = 2.8;
      this.screenShakeIntensity = 0.32;
      this.cameraRollAngle = 0.1;
      this.crowdHypeLevel = 1.95;
    } else {
      this.screenShakeIntensity = Math.min(0.22, recoilIntensity * 0.15);
      if (recoilIntensity > 0.82) {
        this.slowMoFactor = 0.42;
        this.slowMoTimer = 0.55;
        this.activeCameraMode = 'IMPACT_MACRO';
      } else {
        this.activeCameraMode = this.currentCameraPreset;
      }
      this.crowdHypeLevel = Math.min(1.45, 0.7 + recoilIntensity * 0.45);
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

      if (rig.facial.glassesDetached && rig.facial.glassesMesh) {
        rig.facial.headGroup.attach(rig.facial.glassesMesh);
        rig.facial.glassesMesh.position.set(0, 0.175, 0.195);
        rig.facial.glassesMesh.rotation.set(0, 0, 0);
        rig.facial.glassesDetached = false;
      }

      rig.facial.leftEye.scale.set(1, 1, 1);
      rig.facial.rightEye.scale.set(1, 1, 1);
      rig.facial.headSpringRot.set(0, 0, 0);
      rig.facial.headSpringVel.set(0, 0, 0);
      rig.facial.jawSpringOffset.set(0, 0, 0);
      rig.facial.jawSpringVel.set(0, 0, 0);
      rig.facial.jawGroup.position.set(0, 0.065, 0.03);
      rig.facial.jawGroup.rotation.set(0, 0, 0);

      const ringMat = rig.cheekTargetRing.material as THREE.MeshBasicMaterial;
      ringMat.opacity = 0;
      (rig.slapTrailArc.material as THREE.MeshBasicMaterial).opacity = 0;
      rig.root.position.set(rig.side === 'LEFT' ? -0.82 : 0.82, 0, 0);
      rig.pelvis.position.set(0, 0.86, 0);
      rig.pelvis.rotation.set(0, 0, 0);
      rig.torso.rotation.set(0, 0, 0);
      rig.facial.headGroup.rotation.set(0, 0, 0);
    });

    this.cameraRollAngle = 0;
    this.koFreezeTimer = 0;
    this.koReplayTimer = 0;
    this.hitStopTimer = 0;
    this.activeCameraMode = this.currentCameraPreset;
  }

  public triggerTaunt(side: 'LEFT' | 'RIGHT'): void {
    const rig = side === 'LEFT' ? this.leftRig : this.rightRig;
    if (!rig) return;

    rig.animState = 'TAUNT';
    rig.stateTimer = 0;
    this.crowdHypeLevel = 1.85;

    const quote = soundEngine.getContenderTaunt(rig.profile.id, 'VICTORY');
    soundEngine.speakTaunt(quote, 1.0, 1.05);

    if (this.currentCameraPreset === 'BROADCAST_WIDE') {
      this.activeCameraMode = 'STRIKER_PROFILE';
      setTimeout(() => {
        this.activeCameraMode = this.currentCameraPreset;
      }, 2400);
    }
  }

  public triggerVictoryPose(winnerSide: 'LEFT' | 'RIGHT'): void {
    const winner = winnerSide === 'LEFT' ? this.leftRig : this.rightRig;
    if (winner) {
      winner.animState = 'CELEBRATE_VICTORY';
      winner.stateTimer = 0;
      const quote = soundEngine.getContenderTaunt(winner.profile.id, 'VICTORY');
      soundEngine.speakTaunt(quote, 1.0, 1.0);
    }
    this.crowdHypeLevel = 1.95;
  }

  private spawnChalkPuff(x: number, y: number, z: number): void {
    for (let i = 0; i < 28; i++) {
      const idx = Math.floor(Math.random() * this.maxChalk);
      this.chalkPositions[idx * 3] = x + (Math.random() - 0.5) * 0.22;
      this.chalkPositions[idx * 3 + 1] = y + (Math.random() - 0.5) * 0.22;
      this.chalkPositions[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.22;
      this.chalkVelocities[idx * 3] = (Math.random() - 0.5) * 1.2;
      this.chalkVelocities[idx * 3 + 1] = 0.5 + Math.random() * 1.2;
      this.chalkVelocities[idx * 3 + 2] = (Math.random() - 0.5) * 1.2;
      this.chalkLife[idx] = 0.5 + Math.random() * 0.4;
    }
    if (this.chalkPoints) {
      this.chalkPoints.geometry.attributes.position.needsUpdate = true;
    }
  }

  private spawnTalcumChalkBurst(
    x: number,
    y: number,
    z: number,
    scale: number
  ): void {
    for (let i = 0; i < this.maxChalk; i++) {
      this.chalkPositions[i * 3] = x + (Math.random() - 0.5) * 0.16;
      this.chalkPositions[i * 3 + 1] = y + (Math.random() - 0.5) * 0.16;
      this.chalkPositions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.16;

      const dirX = x > 0 ? 1 : -1;
      this.chalkVelocities[i * 3] =
        (dirX * (1.6 + Math.random() * 3.2) + (Math.random() - 0.5)) * scale;
      this.chalkVelocities[i * 3 + 1] = (0.8 + Math.random() * 2.5) * scale;
      this.chalkVelocities[i * 3 + 2] = (Math.random() - 0.5) * 2.8 * scale;
      this.chalkLife[i] = 1.2 + Math.random() * 1.3;
    }

    if (this.chalkPoints) {
      this.chalkPoints.geometry.attributes.position.needsUpdate = true;
    }

    if (this.shockwaveRing) {
      this.shockwaveRing.position.set(x, y, z);
      this.shockwaveScale = 0.25;
      this.shockwaveOpacity = 0.98;
    }
  }

  private spawnSweatSpitBurst(
    x: number,
    y: number,
    z: number,
    scale: number,
    struckIsLeft: boolean
  ): void {
    const dirX = struckIsLeft ? -1 : 1;
    for (let i = 0; i < this.maxSweat; i++) {
      this.sweatPositions[i * 3] = x;
      this.sweatPositions[i * 3 + 1] = y;
      this.sweatPositions[i * 3 + 2] = z;

      this.sweatVelocities[i * 3] =
        (dirX * (2.2 + Math.random() * 3.5) + (Math.random() - 0.5)) * scale;
      this.sweatVelocities[i * 3 + 1] = (1.5 + Math.random() * 2.2) * scale;
      this.sweatVelocities[i * 3 + 2] = (Math.random() - 0.5) * 2.2 * scale;
      this.sweatLife[i] = 0.8 + Math.random() * 0.6;
    }

    if (this.sweatPoints) {
      this.sweatPoints.geometry.attributes.position.needsUpdate = true;
    }
  }

  /**
   * 60FPS Exponential-Damped (THREE.MathUtils.damp) Kinematic Solver & Under-Damped Head Whiplash Spring
   */
  private updateContenderRig(
    rig: Contender3DRig,
    dt: number,
    elapsed: number
  ): void {
    rig.stateTimer += dt;
    const isLeft = rig.side === 'LEFT';
    const baseX = isLeft ? -0.82 : 0.82;
    // Mirror sign for local Y/Z rotations so foreground strike arm swings identically for LEFT and RIGHT fighters!
    const mSign = isLeft ? 1 : -1;
    const facial = rig.facial;
    const dampLambda = 14;

    const arcMat = rig.slapTrailArc.material as THREE.MeshBasicMaterial;
    if (arcMat.opacity > 0.01) {
      arcMat.opacity = Math.max(0, arcMat.opacity - dt * 2.4);
    }

    // 1. Solve Under-Damped Spring ODE for Head Whiplash & Jaw Unhinging
    const springStiffness = 185;
    const springDamping = 7.6;

    facial.headSpringVel.x +=
      (-springStiffness * facial.headSpringRot.x -
        springDamping * facial.headSpringVel.x) *
      dt;
    facial.headSpringVel.y +=
      (-springStiffness * facial.headSpringRot.y -
        springDamping * facial.headSpringVel.y) *
      dt;
    facial.headSpringVel.z +=
      (-springStiffness * facial.headSpringRot.z -
        springDamping * facial.headSpringVel.z) *
      dt;
    facial.headSpringRot.addScaledVector(facial.headSpringVel, dt);

    facial.jawSpringVel.x +=
      (-springStiffness * facial.jawSpringOffset.x -
        springDamping * facial.jawSpringVel.x) *
      dt;
    facial.jawSpringVel.y +=
      (-springStiffness * facial.jawSpringOffset.y -
        springDamping * facial.jawSpringVel.y) *
      dt;
    facial.jawSpringOffset.addScaledVector(facial.jawSpringVel, dt);

    // 2. Update Detached Flying Glasses Physics
    if (facial.glassesDetached && facial.glassesMesh) {
      facial.glassesWorldVelocity.y -= 9.8 * dt;
      facial.glassesWorldPos.addScaledVector(facial.glassesWorldVelocity, dt);
      facial.glassesMesh.position.copy(facial.glassesWorldPos);

      facial.glassesMesh.rotation.x += facial.glassesAngularVelocity.x * dt;
      facial.glassesMesh.rotation.y += facial.glassesAngularVelocity.y * dt;
      facial.glassesMesh.rotation.z += facial.glassesAngularVelocity.z * dt;

      if (facial.glassesWorldPos.y < 0.05) {
        facial.glassesWorldPos.y = 0.05;
        facial.glassesWorldVelocity.y = -facial.glassesWorldVelocity.y * 0.45;
        facial.glassesWorldVelocity.x *= 0.65;
        facial.glassesWorldVelocity.z *= 0.65;
        facial.glassesAngularVelocity.multiplyScalar(0.7);
      }
    }

    // Default athletic wide combat leg stance
    dampEuler(rig.leftHip.rotation, -0.14, 0, 0.16, dampLambda, dt);
    dampEuler(rig.leftKnee.rotation, 0.26, 0, 0, dampLambda, dt);
    dampEuler(rig.rightHip.rotation, 0.14, 0, -0.16, dampLambda, dt);
    dampEuler(rig.rightKnee.rotation, 0.26, 0, 0, dampLambda, dt);

    switch (rig.animState) {
      case 'IDLE': {
        const breath = Math.sin(elapsed * 2.8) * 0.025;
        const weightShift = Math.sin(elapsed * 1.4) * 0.02;
        const blink = Math.sin(elapsed * 3.8) > 0.985 ? 0.12 : 1.0;

        facial.leftEye.scale.set(
          1,
          THREE.MathUtils.damp(facial.leftEye.scale.y, blink, 20, dt),
          1
        );
        facial.rightEye.scale.set(
          1,
          THREE.MathUtils.damp(facial.rightEye.scale.y, blink, 20, dt),
          1
        );

        rig.root.position.x = THREE.MathUtils.damp(
          rig.root.position.x,
          baseX + weightShift,
          8,
          dt
        );
        rig.pelvis.position.y = THREE.MathUtils.damp(
          rig.pelvis.position.y,
          0.86 + breath * 0.4,
          10,
          dt
        );
        dampEuler(rig.pelvis.rotation, 0, 0, 0, dampLambda, dt);
        dampEuler(rig.torso.rotation, 0.16 + breath, 0, 0, dampLambda, dt);
        dampEuler(
          facial.headGroup.rotation,
          -0.08 + facial.headSpringRot.x,
          facial.headSpringRot.y,
          facial.headSpringRot.z,
          dampLambda,
          dt
        );
        facial.jawGroup.position.set(
          facial.jawSpringOffset.x,
          0.065 + facial.jawSpringOffset.y,
          0.03
        );
        facial.leftBrow.rotation.z = THREE.MathUtils.damp(
          facial.leftBrow.rotation.z,
          -0.05,
          12,
          dt
        );
        facial.rightBrow.rotation.z = THREE.MathUtils.damp(
          facial.rightBrow.rotation.z,
          0.05,
          12,
          dt
        );

        // Background brace hand rests on central barrel rim; foreground strike hand held ready
        dampEuler(
          rig.braceShoulder.rotation,
          -0.75,
          0.2 * mSign,
          0.22 * mSign,
          dampLambda,
          dt
        );
        dampEuler(rig.braceElbow.rotation, -0.65, 0, 0, dampLambda, dt);
        this.poseArticulatedHand(rig.braceHand, 'FIST_GRIP', elapsed, 0.4);

        dampEuler(
          rig.strikeShoulder.rotation,
          -0.72,
          -0.2 * mSign,
          -0.28 * mSign,
          dampLambda,
          dt
        );
        dampEuler(rig.strikeElbow.rotation, -0.95, 0, 0, dampLambda, dt);
        this.poseArticulatedHand(rig.strikeHand, 'SLAP_READY', elapsed, 0.5);
        break;
      }

      case 'CHEEK_ALIGNMENT': {
        // Phase 1: Striker steps in toward barrel, left hand grips barrel rim, foreground open palm extends to measure opponent's cheek!
        const measurePulse = Math.sin(elapsed * 3.5) * 0.04;
        rig.root.position.x = THREE.MathUtils.damp(
          rig.root.position.x,
          isLeft ? -0.64 : 0.64,
          10,
          dt
        );
        dampEuler(rig.pelvis.rotation, 0, -0.18 * mSign, 0, dampLambda, dt);
        dampEuler(
          rig.torso.rotation,
          0.28,
          -0.28 * mSign,
          0,
          dampLambda,
          dt
        );
        dampEuler(
          facial.headGroup.rotation,
          -0.16,
          0.24 * mSign,
          0,
          dampLambda,
          dt
        );

        const targetPitch =
          rig.targetAngle === 'HIGH_TEMPLE'
            ? -1.62
            : rig.targetAngle === 'MID_CHEEK'
              ? -1.48
              : -1.34;

        dampEuler(
          rig.strikeShoulder.rotation,
          targetPitch + measurePulse,
          -0.12 * mSign,
          -0.18 * mSign,
          dampLambda,
          dt
        );
        dampEuler(rig.strikeElbow.rotation, -0.14, 0, 0, dampLambda, dt);
        dampEuler(
          rig.strikeHand.wristPivot.rotation,
          0,
          0.35 * mSign,
          0,
          dampLambda,
          dt
        );
        this.poseArticulatedHand(
          rig.strikeHand,
          'HOVER_MEASURE',
          elapsed,
          0.75
        );

        facial.leftBrow.rotation.z = THREE.MathUtils.damp(
          facial.leftBrow.rotation.z,
          -0.18,
          12,
          dt
        );
        facial.rightBrow.rotation.z = THREE.MathUtils.damp(
          facial.rightBrow.rotation.z,
          0.18,
          12,
          dt
        );

        dampEuler(
          rig.braceShoulder.rotation,
          -0.82,
          0.25 * mSign,
          0.18 * mSign,
          dampLambda,
          dt
        );
        dampEuler(rig.braceElbow.rotation, -0.5, 0, 0, dampLambda, dt);
        this.poseArticulatedHand(rig.braceHand, 'FIST_GRIP', elapsed, 0.8);
        break;
      }

      case 'FAKEOUT': {
        // Striker jerks shoulder back, swings forward, and freezes 10cm from defender's cheek!
        const freeze = rig.stateTimer > 0.14;
        rig.root.position.x = THREE.MathUtils.damp(
          rig.root.position.x,
          isLeft ? -0.56 : 0.56,
          16,
          dt
        );
        dampEuler(
          rig.torso.rotation,
          0.26,
          (freeze ? -0.48 : 0.65) * mSign,
          0,
          22,
          dt
        );
        dampEuler(
          rig.strikeShoulder.rotation,
          -1.45,
          (freeze ? 0.15 : 1.05) * mSign,
          -0.78 * mSign,
          24,
          dt
        );
        dampEuler(rig.strikeElbow.rotation, -0.08, 0, 0, 24, dt);
        this.poseArticulatedHand(rig.strikeHand, 'SLAP_READY', elapsed, 0.95);
        break;
      }

      case 'FLINCHED': {
        const decay = Math.exp(-rig.stateTimer * 3.5);
        dampEuler(
          facial.headGroup.rotation,
          -0.38 * decay + facial.headSpringRot.x,
          facial.headSpringRot.y,
          facial.headSpringRot.z,
          18,
          dt
        );
        facial.jawGroup.position.y = 0.065 - 0.055 * decay;
        facial.leftEye.scale.y = 0.22;
        facial.rightEye.scale.y = 0.22;
        facial.leftBrow.rotation.z = 0.32;
        facial.rightBrow.rotation.z = -0.32;
        dampEuler(rig.torso.rotation, -0.18 * decay, 0, 0, 16, dt);
        break;
      }

      case 'WIND_UP_TORQUE': {
        // Phase 2: Full-Body Torque Wind-Up (Pelvis rotates, torso coils back -0.88 rad, shoulder cocks wide open)
        const totalDuration = rig.windUpCount * 0.31;
        const progress = Math.min(
          1,
          rig.stateTimer / Math.max(0.25, totalDuration)
        );
        const coil = progress > 0.82 ? 1.0 : Math.sin(progress * Math.PI * 0.5);
        const scale = 0.82 + rig.windUpCount * 0.14;

        rig.root.position.x = THREE.MathUtils.damp(
          rig.root.position.x,
          isLeft ? -0.68 : 0.68,
          12,
          dt
        );
        dampEuler(
          rig.pelvis.rotation,
          0,
          0.38 * coil * scale * mSign,
          0,
          14,
          dt
        );
        dampEuler(
          rig.torso.rotation,
          0.18,
          0.85 * coil * scale * mSign,
          -0.08 * coil * mSign,
          14,
          dt
        );
        dampEuler(
          facial.headGroup.rotation,
          -0.1,
          -0.72 * coil * scale * mSign,
          0,
          14,
          dt
        );
        facial.leftBrow.rotation.z = -0.32 * coil;
        facial.rightBrow.rotation.z = 0.32 * coil;

        dampEuler(
          rig.strikeShoulder.rotation,
          -1.48,
          1.25 * coil * scale * mSign,
          -0.85 * mSign,
          16,
          dt
        );
        dampEuler(rig.strikeElbow.rotation, -0.1, 0, 0, 16, dt);
        this.poseArticulatedHand(rig.strikeHand, 'SLAP_READY', elapsed, 1.0);
        break;
      }

      case 'SLAP_EXECUTION': {
        // Phase 3: High-Velocity Whip Strike (<0.14s) straight through defender's jawline!
        const snap = Math.min(1, rig.stateTimer / 0.11);
        const followThrough = 1 - Math.pow(1 - snap, 3); // Fast cubic-bezier whip

        // Step in across the barrel so the 3D palm physically connects with the defender's cheek!
        rig.root.position.x = THREE.MathUtils.damp(
          rig.root.position.x,
          isLeft ? -0.52 : 0.52,
          28,
          dt
        );
        dampEuler(
          rig.pelvis.rotation,
          0,
          THREE.MathUtils.lerp(0.38, -0.45, followThrough) * mSign,
          0,
          28,
          dt
        );
        dampEuler(
          rig.torso.rotation,
          0.32,
          THREE.MathUtils.lerp(0.85, -0.88, followThrough) * mSign,
          0.08 * mSign,
          28,
          dt
        );
        dampEuler(
          rig.strikeShoulder.rotation,
          -1.42,
          THREE.MathUtils.lerp(1.25, -1.18, followThrough) * mSign,
          -0.88 * mSign,
          32,
          dt
        );
        dampEuler(rig.strikeElbow.rotation, -0.06, 0, 0, 32, dt);
        this.poseArticulatedHand(rig.strikeHand, 'SLAP_READY', elapsed, 0.98);
        break;
      }

      case 'CHIN_BRACE': {
        rig.root.position.x = THREE.MathUtils.damp(
          rig.root.position.x,
          isLeft ? -0.68 : 0.68,
          10,
          dt
        );
        dampEuler(rig.pelvis.rotation, 0, 0, 0, dampLambda, dt);
        dampEuler(rig.torso.rotation, 0.24, 0, 0, dampLambda, dt);
        dampEuler(
          facial.headGroup.rotation,
          0.12 + facial.headSpringRot.x,
          facial.headSpringRot.y,
          facial.headSpringRot.z,
          dampLambda,
          dt
        );
        facial.leftBrow.rotation.z = -0.22;
        facial.rightBrow.rotation.z = 0.22;
        dampEuler(
          rig.leftShoulder.rotation,
          -0.72,
          0.25,
          0.18,
          dampLambda,
          dt
        );
        dampEuler(rig.leftElbow.rotation, -0.55, 0, 0, dampLambda, dt);
        dampEuler(
          rig.rightShoulder.rotation,
          -0.72,
          -0.25,
          -0.18,
          dampLambda,
          dt
        );
        dampEuler(rig.rightElbow.rotation, -0.55, 0, 0, dampLambda, dt);
        this.poseArticulatedHand(rig.leftHand, 'FIST_GRIP', elapsed, 0.9);
        this.poseArticulatedHand(rig.rightHand, 'FIST_GRIP', elapsed, 0.9);
        break;
      }

      case 'HIT_LIGHT_CHEEK':
      case 'HIT_CHEEK_WHIP':
      case 'HIT_JAW_SNAP':
      case 'HIT_STAGGER_STEP':
      case 'HIT_STUMBLE_BACK': {
        const decay = Math.exp(-rig.stateTimer * 3.0);

        // Apply under-damped spring whiplash directly to headGroup & jawGroup
        facial.headGroup.rotation.set(
          -0.22 * decay + facial.headSpringRot.x,
          facial.headSpringRot.y,
          facial.headSpringRot.z
        );

        facial.jawGroup.position.set(
          facial.jawSpringOffset.x,
          0.065 + facial.jawSpringOffset.y,
          0.03
        );
        facial.jawGroup.rotation.z = facial.jawSpringOffset.x * 3.5;

        // Eyeballs bug outward on impact
        const eyeBug = 1.0 + 0.38 * decay;
        facial.leftEye.scale.setScalar(eyeBug);
        facial.rightEye.scale.setScalar(eyeBug);
        facial.leftBrow.rotation.z = 0.35 * decay;
        facial.rightBrow.rotation.z = -0.35 * decay;

        // Spine arch & knee buckle
        dampEuler(
          rig.torso.rotation,
          -0.26 * decay,
          0.42 * decay * mSign,
          -0.24 * decay * mSign,
          18,
          dt
        );
        dampEuler(rig.leftKnee.rotation, 0.26 + 0.45 * decay, 0, 0, 18, dt);
        dampEuler(rig.rightKnee.rotation, 0.26 + 0.45 * decay, 0, 0, 18, dt);

        const slideDist =
          rig.animState === 'HIT_STUMBLE_BACK'
            ? 0.45
            : rig.animState === 'HIT_STAGGER_STEP'
              ? 0.28
              : rig.footSlideOffset;
        rig.root.position.x =
          baseX + (isLeft ? -slideDist : slideDist) * decay;
        break;
      }

      case 'KNOCKDOWN': {
        if (rig.koType === 'DELAYED_KO' && rig.stateTimer < 0.65) {
          const tremor = Math.sin(rig.stateTimer * 40) * 0.08;
          dampEuler(rig.torso.rotation, 0.3 + tremor, tremor, 0, 18, dt);
        } else {
          const t =
            rig.koType === 'DELAYED_KO'
              ? Math.min(1, (rig.stateTimer - 0.65) / 0.55)
              : Math.min(1, rig.stateTimer / 0.55);
          const fall = t * t;
          rig.pelvis.position.y = THREE.MathUtils.lerp(0.86, 0.22, fall);
          rig.pelvis.rotation.x = THREE.MathUtils.lerp(0, -1.35, fall);
          facial.headGroup.rotation.y =
            0.72 * fall * mSign + facial.headSpringRot.y;
          facial.leftPupil.position.x = Math.sin(elapsed * 9) * 0.015;
          facial.rightPupil.position.x = Math.sin(elapsed * 9) * 0.015;
        }
        break;
      }

      case 'CELEBRATE_VICTORY':
      case 'TAUNT': {
        const id = rig.profile.id;
        rig.root.position.x = THREE.MathUtils.damp(
          rig.root.position.x,
          baseX,
          10,
          dt
        );

        if (id === 'musk') {
          const hop = Math.abs(Math.sin(elapsed * 4.5)) * 0.14;
          rig.pelvis.position.y = 0.86 + hop;
          dampEuler(rig.leftShoulder.rotation, -2.4, 0.4, 0.5, 14, dt);
          dampEuler(rig.rightShoulder.rotation, -2.4, -0.4, -0.5, 14, dt);
        } else if (id === 'bezos') {
          dampEuler(rig.leftShoulder.rotation, -1.55, 0.35, 1.35, 14, dt);
          dampEuler(rig.leftElbow.rotation, -1.6, 0, 0, 14, dt);
          dampEuler(rig.rightShoulder.rotation, -1.55, -0.35, -1.35, 14, dt);
          dampEuler(rig.rightElbow.rotation, -1.6, 0, 0, 14, dt);
          facial.headGroup.rotation.x =
            -0.3 + Math.sin(elapsed * 12) * 0.08;
          facial.jawGroup.position.y = 0.015;
        } else if (id === 'huang') {
          dampEuler(rig.leftShoulder.rotation, -1.1, 0.5, 0.4, 14, dt);
          dampEuler(rig.rightShoulder.rotation, -1.4, -0.2, -0.6, 14, dt);
          dampEuler(facial.headGroup.rotation, 0, 0.25 * mSign, 0, 14, dt);
        } else if (id === 'zuckerberg') {
          const mmaBounce = Math.abs(Math.sin(elapsed * 6.0)) * 0.06;
          rig.pelvis.position.y = 0.84 + mmaBounce;
          dampEuler(rig.leftShoulder.rotation, -1.2, 0.2, 0.2, 16, dt);
          dampEuler(
            rig.rightShoulder.rotation,
            -1.2 + Math.sin(elapsed * 10) * 0.4,
            -0.2,
            -0.2,
            16,
            dt
          );
        } else if (id === 'ellison') {
          dampEuler(rig.leftShoulder.rotation, -0.95, 0.65, 0.5, 14, dt);
          dampEuler(rig.rightShoulder.rotation, -0.95, -0.65, -0.5, 14, dt);
          facial.leftBrow.position.y = 0.238;
        } else if (id === 'altman') {
          dampEuler(rig.leftShoulder.rotation, -1.8, 0.4, 0.8, 14, dt);
          dampEuler(rig.rightShoulder.rotation, -1.8, -0.4, -0.8, 14, dt);
          facial.headGroup.rotation.x = 0.15;
        } else {
          const bounce = Math.abs(Math.sin(elapsed * 5.0)) * 0.08;
          rig.pelvis.position.y = 0.86 + bounce;
          dampEuler(rig.leftShoulder.rotation, -2.5, 0, 0.35, 14, dt);
          dampEuler(rig.rightShoulder.rotation, -2.5, 0, -0.35, 14, dt);
        }
        break;
      }
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.isDisposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private scheduleNextFrame(tick: () => void): void {
    if (this.isDisposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private startLoop(): void {
    const animate = () => {
      if (this.isDisposed) return;

      const rawDt = Math.min(this.clock.getDelta(), 0.1);

      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= rawDt;
        this.renderer.render(this.scene, this.camera);
        this.scheduleNextFrame(animate);
        return;
      }

      if (this.koFreezeTimer > 0) {
        this.koFreezeTimer -= rawDt;
        this.renderer.render(this.scene, this.camera);
        this.scheduleNextFrame(animate);
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

      if (Math.abs(this.currentFov - this.baseFov) > 0.05) {
        this.currentFov = THREE.MathUtils.damp(
          this.currentFov,
          this.baseFov,
          8,
          rawDt
        );
        this.camera.fov = this.currentFov;
        this.camera.updateProjectionMatrix();
      }

      if (this.leftRig) this.updateContenderRig(this.leftRig, dt, elapsed);
      if (this.rightRig) this.updateContenderRig(this.rightRig, dt, elapsed);

      if (this.slapFlashLight && this.slapFlashLight.intensity > 0) {
        this.slapFlashLight.intensity = THREE.MathUtils.damp(
          this.slapFlashLight.intensity,
          0,
          12,
          rawDt
        );
      }

      if (this.crowdInstancedMesh && this.crowdGlowSticksMesh) {
        this.crowdHypeLevel = Math.max(0.35, this.crowdHypeLevel - rawDt * 0.2);
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
            _upAxis,
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

      if (this.chalkPoints) {
        let anyAlive = false;
        for (let i = 0; i < this.maxChalk; i++) {
          if (this.chalkLife[i] > 0) {
            anyAlive = true;
            this.chalkLife[i] -= dt;
            this.chalkVelocities[i * 3] *= 0.94;
            this.chalkVelocities[i * 3 + 1] *= 0.94;
            this.chalkVelocities[i * 3 + 2] *= 0.94;

            this.chalkPositions[i * 3] += this.chalkVelocities[i * 3] * dt;
            this.chalkPositions[i * 3 + 1] +=
              (this.chalkVelocities[i * 3 + 1] + 0.12) * dt;
            this.chalkPositions[i * 3 + 2] +=
              this.chalkVelocities[i * 3 + 2] * dt;
          } else {
            this.chalkPositions[i * 3 + 1] = -10;
          }
        }
        if (anyAlive) {
          this.chalkPoints.geometry.attributes.position.needsUpdate = true;
        }
      }

      if (this.sweatPoints) {
        let anySweatAlive = false;
        for (let i = 0; i < this.maxSweat; i++) {
          if (this.sweatLife[i] > 0) {
            anySweatAlive = true;
            this.sweatLife[i] -= dt;
            this.sweatPositions[i * 3] += this.sweatVelocities[i * 3] * dt;
            this.sweatPositions[i * 3 + 1] +=
              this.sweatVelocities[i * 3 + 1] * dt;
            this.sweatPositions[i * 3 + 2] +=
              this.sweatVelocities[i * 3 + 2] * dt;
            this.sweatVelocities[i * 3 + 1] -= 9.8 * dt;
          } else {
            this.sweatPositions[i * 3 + 1] = -10;
          }
        }
        if (anySweatAlive) {
          this.sweatPoints.geometry.attributes.position.needsUpdate = true;
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
      this.scheduleNextFrame(animate);
    };

    this.scheduleNextFrame(animate);
  }

  private updateCamera(rawDt: number, elapsed: number): void {
    const isPortrait =
      (this.container.clientWidth || window.innerWidth) < 640;

    if (!this.isPointerDown) {
      this.userOrbitAzimuth = THREE.MathUtils.damp(
        this.userOrbitAzimuth,
        0,
        3.5,
        rawDt
      );
      this.userOrbitElevation = THREE.MathUtils.damp(
        this.userOrbitElevation,
        0,
        3.5,
        rawDt
      );
    }

    if (this.koReplayTimer > 0) {
      this.koReplayTimer -= rawDt;
      this.koReplayOrbitAngle += rawDt * 0.55;
      const radius = this.koReplayTimer > 1.8 ? 2.6 : 3.5;
      _camTargetPos.set(
        Math.sin(this.koReplayOrbitAngle * 0.5) * radius * 0.65,
        1.55,
        Math.max(2.3, Math.cos(this.koReplayOrbitAngle * 0.5) * radius)
      );
      _camTargetLook.set(0, 1.32, 0);
      if (this.koReplayTimer <= 0) {
        this.activeCameraMode = this.currentCameraPreset;
      }
    } else {
      switch (this.activeCameraMode) {
        case 'BROADCAST_WIDE':
          _camTargetPos.set(
            Math.sin(elapsed * 0.25) * 0.1,
            1.62,
            isPortrait ? 5.15 : 4.1
          );
          _camTargetLook.set(0, 1.28, 0);
          break;
        case 'PRE_SLAP_PUSH':
          _camTargetPos.set(
            this.activeStrikerSide === 'LEFT' ? -0.28 : 0.28,
            1.58,
            isPortrait ? 4.0 : 3.15
          );
          _camTargetLook.set(0, 1.38, 0);
          break;
        case 'STRIKER_PROFILE':
          _camTargetPos.set(
            this.activeStrikerSide === 'LEFT' ? -1.95 : 1.95,
            1.58,
            2.65
          );
          _camTargetLook.set(0, 1.38, 0);
          break;
        case 'IMPACT_MACRO':
          _camTargetPos.set(
            this.activeStrikerSide === 'LEFT' ? 0.48 : -0.48,
            1.58,
            2.25
          );
          _camTargetLook.set(
            this.activeStrikerSide === 'LEFT' ? 0.45 : -0.45,
            1.46,
            0
          );
          break;
        case 'KO_REPLAY_ORBIT':
          _camTargetPos.set(
            Math.sin(elapsed * 0.85) * 2.8,
            1.68,
            Math.cos(elapsed * 0.85) * 2.8 + 1.3
          );
          _camTargetLook.set(0, 1.28, 0);
          break;
      }
    }

    // Apply user pointer-drag inspection orbit offset
    if (
      Math.abs(this.userOrbitAzimuth) > 0.001 ||
      Math.abs(this.userOrbitElevation) > 0.001
    ) {
      const dist = Math.hypot(_camTargetPos.x, _camTargetPos.z);
      const baseAngle = Math.atan2(_camTargetPos.x, _camTargetPos.z);
      const finalAngle = baseAngle + this.userOrbitAzimuth;
      _camTargetPos.x = Math.sin(finalAngle) * dist;
      _camTargetPos.z = Math.cos(finalAngle) * dist;
      _camTargetPos.y = THREE.MathUtils.clamp(
        _camTargetPos.y + this.userOrbitElevation,
        0.55,
        3.4
      );
    }

    if (this.screenShakeIntensity > 0.002) {
      _camTargetPos.x += (Math.random() - 0.5) * this.screenShakeIntensity;
      _camTargetPos.y += (Math.random() - 0.5) * this.screenShakeIntensity;
      this.screenShakeIntensity = THREE.MathUtils.damp(
        this.screenShakeIntensity,
        0,
        9,
        rawDt
      );
    }

    this.camera.position.lerp(_camTargetPos, 6.5 * rawDt);
    this.currentLookAt.lerp(_camTargetLook, 8 * rawDt);
    this.camera.lookAt(this.currentLookAt);

    if (Math.abs(this.cameraRollAngle) > 0.001) {
      this.camera.rotation.z =
        Math.sin(elapsed * 18) * this.cameraRollAngle;
      this.cameraRollAngle = THREE.MathUtils.damp(
        this.cameraRollAngle,
        0,
        4,
        rawDt
      );
    }
  }

  private handlePointerDown = (e: PointerEvent): void => {
    this.isPointerDown = true;
    this.pointerLastX = e.clientX;
    this.pointerLastY = e.clientY;
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.isPointerDown) return;
    const dx = e.clientX - this.pointerLastX;
    const dy = e.clientY - this.pointerLastY;
    this.pointerLastX = e.clientX;
    this.pointerLastY = e.clientY;

    this.userOrbitAzimuth = THREE.MathUtils.clamp(
      this.userOrbitAzimuth - dx * 0.0055,
      -0.85,
      0.85
    );
    this.userOrbitElevation = THREE.MathUtils.clamp(
      this.userOrbitElevation + dy * 0.0045,
      -0.65,
      0.85
    );
  };

  private handlePointerUp = (): void => {
    this.isPointerDown = false;
  };

  private handleResize = (): void => {
    if (!this.container || this.isDisposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    const isPortrait = width < 640;
    this.baseFov = isPortrait ? 48 : 37;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    const domElem = this.renderer.domElement;
    domElem.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    if (domElem.parentNode) {
      domElem.parentNode.removeChild(domElem);
    }
  }
}
