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

interface PixelParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  gravity: number;
}

interface HitSpark {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  isCritical: boolean;
  label: string;
}

interface CrowdMember2D {
  x: number;
  y: number;
  row: number;
  shirtColor: string;
  skinColor: string;
  phase: number;
  hasSign: boolean;
  signColor: string;
}

interface Fighter2DSpriteState {
  profile: FighterProfile;
  side: 'LEFT' | 'RIGHT';
  animState: FighterAnimState;
  stateTimer: number;
  windUpCount: WindUpCount;
  targetAngle: SlapAngle;
  torqueChargeLevel: number;
  recoilIntensity: number;
  koType: KOType;
  specialAuraActive: boolean;
  hasChampionArmor: boolean;
  slapCountTaken: number;
  cheekRedness: number;
  glassesFlying: boolean;
  glassesX: number;
  glassesY: number;
  glassesVx: number;
  glassesVy: number;
  glassesAngle: number;
}

/**
 * Pure 2D 16-Bit Retro Arcade Pixel-Art Canvas Engine
 * ("Smack Daddy Championships: Pixel Edition")
 * Zero 3D/WebGL dependencies — 60 FPS requestAnimationFrame HTML5 2D Canvas
 * Optimized for Mobile Touch, Desktop, and Capacitor Android / Amazon Fire OS builds.
 */
export class ArenaSceneController {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Virtual 16-bit arcade resolution (16:9 widescreen arcade cabinet)
  private readonly vWidth = 640;
  private readonly vHeight = 360;

  private leftFighter: Fighter2DSpriteState | null = null;
  private rightFighter: Fighter2DSpriteState | null = null;

  private particles: PixelParticle[] = [];
  private hitSparks: HitSpark[] = [];
  private crowd: CrowdMember2D[] = [];
  private stadiumFlashes: { x: number; y: number; life: number }[] = [];

  private currentCameraPreset: CameraPreset = 'BROADCAST_WIDE';
  private activeStrikerSide: 'LEFT' | 'RIGHT' = 'LEFT';
  private frameId: number = 0;
  private lastTimestamp: number = 0;
  private elapsed: number = 0;
  private isDisposed: boolean = false;

  // Screen shake & hit-stop juice
  private hitStopTimer: number = 0;
  private shakeIntensity: number = 0;
  private flashScreenAlpha: number = 0;
  private flashScreenColor: string = '#FFF7D6';
  private crowdHypeLevel: number = 0.6;
  private zoomLevel: number = 1.0;
  private targetZoom: number = 1.0;
  private panX: number = 0;
  private targetPanX: number = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.vWidth;
    this.canvas.height = this.vHeight;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.imageRendering = 'pixelated';

    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('2D Canvas context not supported');
    }
    this.ctx = context;
    this.ctx.imageSmoothingEnabled = false;

    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    this.initCrowd();
    window.addEventListener('resize', this.handleResize);
    this.handleResize();

    this.lastTimestamp = performance.now();
    this.startLoop();
  }

  private initCrowd(): void {
    const shirtPalette = [
      '#1E3A8A',
      '#991B1B',
      '#374151',
      '#1E293B',
      '#4C1D95',
      '#065F46',
      '#B45309',
    ];
    const skinPalette = ['#F1C6A7', '#E0AC69', '#C68642', '#8D5524', '#F5CBA7'];

    this.crowd = [];
    for (let row = 0; row < 3; row++) {
      const count = 34;
      for (let i = 0; i < count; i++) {
        const x = 14 + i * 18.5 + (row % 2) * 9;
        // Leave gap behind central jumbotrons or stage where needed
        const y = 168 + row * 20;
        this.crowd.push({
          x,
          y,
          row,
          shirtColor: shirtPalette[(i + row * 3) % shirtPalette.length],
          skinColor: skinPalette[(i + row) % skinPalette.length],
          phase: (i * 0.7 + row * 1.3) % (Math.PI * 2),
          hasSign: (i + row) % 9 === 0,
          signColor: i % 2 === 0 ? '#38BDF8' : '#EF4444',
        });
      }
    }
  }

  public setFighters(
    leftProfile: FighterProfile,
    rightProfile: FighterProfile,
    leftHasChampionArmor: boolean = false
  ): void {
    this.leftFighter = {
      profile: leftProfile,
      side: 'LEFT',
      animState: 'IDLE',
      stateTimer: 0,
      windUpCount: 2,
      targetAngle: 'JAWLINE_LEVER',
      torqueChargeLevel: 0,
      recoilIntensity: 0,
      koType: 'NONE',
      specialAuraActive: false,
      hasChampionArmor: leftHasChampionArmor,
      slapCountTaken: 0,
      cheekRedness: 0,
      glassesFlying: false,
      glassesX: 0,
      glassesY: 0,
      glassesVx: 0,
      glassesVy: 0,
      glassesAngle: 0,
    };

    this.rightFighter = {
      profile: rightProfile,
      side: 'RIGHT',
      animState: 'IDLE',
      stateTimer: 0,
      windUpCount: 2,
      targetAngle: 'JAWLINE_LEVER',
      torqueChargeLevel: 0,
      recoilIntensity: 0,
      koType: 'NONE',
      specialAuraActive: false,
      hasChampionArmor: false,
      slapCountTaken: 0,
      cheekRedness: 0,
      glassesFlying: false,
      glassesX: 0,
      glassesY: 0,
      glassesVx: 0,
      glassesVy: 0,
      glassesAngle: 0,
    };
  }

  public setArenaEnvironment(
    _arenaFighter: FighterProfile,
    _leftFighter?: FighterProfile
  ): void {
    // Jumbotrons and arena accents dynamically read from leftFighter & rightFighter profiles
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.currentCameraPreset = preset;
    switch (preset) {
      case 'BROADCAST_WIDE':
        this.targetZoom = 1.0;
        this.targetPanX = 0;
        break;
      case 'PRE_SLAP_PUSH':
        this.targetZoom = 1.12;
        this.targetPanX = 0;
        break;
      case 'STRIKER_PROFILE':
        this.targetZoom = 1.16;
        this.targetPanX = this.activeStrikerSide === 'LEFT' ? 28 : -28;
        break;
      case 'IMPACT_MACRO':
        this.targetZoom = 1.24;
        this.targetPanX = this.activeStrikerSide === 'LEFT' ? -24 : 24;
        break;
      case 'KO_REPLAY_ORBIT':
        this.targetZoom = 1.18;
        this.targetPanX = 0;
        break;
    }
  }

  public setSpecialAura(side: 'LEFT' | 'RIGHT', active: boolean): void {
    const f = side === 'LEFT' ? this.leftFighter : this.rightFighter;
    if (f) {
      f.specialAuraActive = active;
    }
  }

  public triggerCheekLineUp(
    strikerSide: 'LEFT' | 'RIGHT',
    windUpCount: WindUpCount,
    targetAngle: SlapAngle
  ): void {
    this.activeStrikerSide = strikerSide;
    const striker = strikerSide === 'LEFT' ? this.leftFighter : this.rightFighter;
    const defender = strikerSide === 'LEFT' ? this.rightFighter : this.leftFighter;
    if (!striker || !defender) return;

    striker.animState = 'CHEEK_ALIGNMENT';
    striker.stateTimer = 0;
    striker.windUpCount = windUpCount;
    striker.targetAngle = targetAngle;

    defender.animState = 'CHIN_BRACE';
    defender.stateTimer = 0;
  }

  public triggerFakeout(strikerSide: 'LEFT' | 'RIGHT'): void {
    this.activeStrikerSide = strikerSide;
    const striker = strikerSide === 'LEFT' ? this.leftFighter : this.rightFighter;
    if (!striker) return;

    striker.animState = 'FAKEOUT';
    striker.stateTimer = 0;
    soundEngine.playWindUpWhoosh(0.75);
  }

  public triggerFlinchReaction(defenderSide: 'LEFT' | 'RIGHT'): void {
    const defender = defenderSide === 'LEFT' ? this.leftFighter : this.rightFighter;
    if (!defender) return;

    defender.animState = 'FLINCHED';
    defender.stateTimer = 0;
    soundEngine.playFlinchGasp();
  }

  public updatePracticeSwingAndTorque(
    strikerSide: 'LEFT' | 'RIGHT',
    torqueChargeNormalized: number
  ): void {
    const striker = strikerSide === 'LEFT' ? this.leftFighter : this.rightFighter;
    if (!striker) return;
    striker.torqueChargeLevel = torqueChargeNormalized;
    this.crowdHypeLevel = Math.min(1.3, 0.6 + torqueChargeNormalized * 0.5);

    const handX = strikerSide === 'LEFT' ? 265 : 375;
    this.spawnChalkCloud(handX, 200, 12, strikerSide === 'LEFT' ? 1 : -1, 0.6);
    soundEngine.playChalkPuff();
  }

  public triggerWindUp(
    strikerSide: 'LEFT' | 'RIGHT',
    windUpCount: WindUpCount
  ): void {
    this.activeStrikerSide = strikerSide;
    const striker = strikerSide === 'LEFT' ? this.leftFighter : this.rightFighter;
    const defender = strikerSide === 'LEFT' ? this.rightFighter : this.leftFighter;
    if (!striker || !defender) return;

    striker.animState = 'WIND_UP_TORQUE';
    striker.stateTimer = 0;
    striker.windUpCount = windUpCount;

    defender.animState = 'CHIN_BRACE';
    defender.stateTimer = 0;
  }

  public triggerSlapImpact(
    strikerSide: 'LEFT' | 'RIGHT',
    recoilIntensity: number,
    _headWhipRadians: number,
    _footSlideMeters: number,
    isKO: boolean,
    koType: KOType
  ): void {
    this.activeStrikerSide = strikerSide;
    const striker = strikerSide === 'LEFT' ? this.leftFighter : this.rightFighter;
    const defender = strikerSide === 'LEFT' ? this.rightFighter : this.leftFighter;
    if (!striker || !defender) return;

    striker.animState = 'SLAP_EXECUTION';
    striker.stateTimer = 0;

    defender.slapCountTaken += 1;
    defender.cheekRedness = Math.min(1, defender.slapCountTaken * 0.35);
    defender.stateTimer = 0;
    defender.recoilIntensity = recoilIntensity;
    defender.koType = koType;

    if (isKO) {
      defender.animState = 'KNOCKDOWN';
    } else if (recoilIntensity >= 0.95) {
      defender.animState = 'HIT_STUMBLE_BACK';
    } else if (recoilIntensity >= 0.75) {
      defender.animState = 'HIT_JAW_SNAP';
    } else {
      defender.animState = 'HIT_CHEEK_WHIP';
    }

    // Impact coordinates on the defender's jaw/cheek above the center podium
    const impactX = strikerSide === 'LEFT' ? 378 : 262;
    const impactY = 166;
    const dirX = strikerSide === 'LEFT' ? 1 : -1;

    // 1. Spawn bright yellow/white/orange arcade pixel hit-sparks on the podium & cheek!
    const isCrit = isKO || recoilIntensity > 0.85;
    this.hitSparks.push({
      x: impactX,
      y: impactY,
      radius: 6,
      maxRadius: isKO ? 68 : isCrit ? 52 : 38,
      life: isKO ? 0.48 : 0.32,
      maxLife: isKO ? 0.48 : 0.32,
      isCritical: isCrit,
      label: isKO ? 'KO!!' : isCrit ? 'CRIT!' : 'SMACK!',
    });

    // Also spawn a secondary spark burst right on the center barrel rim
    this.hitSparks.push({
      x: 320 + dirX * 22,
      y: 192,
      radius: 4,
      maxRadius: 30,
      life: 0.25,
      maxLife: 0.25,
      isCritical: false,
      label: '',
    });

    // 2. Spawn pixelated yellow/orange hit-spark particles + white talcum chalk cloud
    this.spawnHitSparkPixels(impactX, impactY, isKO ? 48 : 30, dirX, isCrit);
    this.spawnChalkCloud(impactX, impactY, isKO ? 65 : 40, dirX, isKO ? 1.5 : 1.0);

    // 3. Flying pixel eyeglasses on heavy slap or KO
    if (
      defender.profile.hasGlasses &&
      !defender.glassesFlying &&
      (recoilIntensity > 0.72 || isKO)
    ) {
      defender.glassesFlying = true;
      defender.glassesX = impactX;
      defender.glassesY = impactY - 12;
      defender.glassesVx = dirX * (140 + Math.random() * 80);
      defender.glassesVy = -180 - Math.random() * 60;
      defender.glassesAngle = 0;
    }

    // 4. Hit-stop & screen shake & strobe flash
    this.hitStopTimer = isKO ? 0.085 : 0.045;
    this.shakeIntensity = isKO ? 18 : Math.min(14, 5 + recoilIntensity * 8);
    this.flashScreenAlpha = isKO ? 0.65 : isCrit ? 0.38 : 0.2;
    this.flashScreenColor = isKO ? '#FACC15' : '#FFF7D6';
    this.crowdHypeLevel = isKO ? 2.0 : 1.35;
  }

  public resetFightersToStance(): void {
    [this.leftFighter, this.rightFighter].forEach((f) => {
      if (!f) return;
      f.animState = 'IDLE';
      f.stateTimer = 0;
      f.torqueChargeLevel = 0;
      f.recoilIntensity = 0;
      f.glassesFlying = false;
    });
    this.targetZoom = 1.0;
    this.targetPanX = 0;
    this.shakeIntensity = 0;
  }

  public triggerTaunt(side: 'LEFT' | 'RIGHT'): void {
    const f = side === 'LEFT' ? this.leftFighter : this.rightFighter;
    if (!f) return;
    f.animState = 'TAUNT';
    f.stateTimer = 0;
    this.crowdHypeLevel = 1.6;
    const quote = soundEngine.getContenderTaunt(f.profile.id, 'VICTORY');
    soundEngine.speakTaunt(quote, 1.0, 1.05);
  }

  public triggerVictoryPose(winnerSide: 'LEFT' | 'RIGHT'): void {
    const winner = winnerSide === 'LEFT' ? this.leftFighter : this.rightFighter;
    if (winner) {
      winner.animState = 'CELEBRATE_VICTORY';
      winner.stateTimer = 0;
      const quote = soundEngine.getContenderTaunt(winner.profile.id, 'VICTORY');
      soundEngine.speakTaunt(quote, 1.0, 1.0);
    }
    this.crowdHypeLevel = 2.0;
  }

  private spawnChalkCloud(
    x: number,
    y: number,
    count: number,
    dirX: number,
    scale: number
  ): void {
    const colors = ['#FFFFFF', '#F8FAFC', '#E2E8F0', '#CBD5E1'];
    for (let i = 0; i < count; i++) {
      const life = 0.45 + Math.random() * 0.65;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 14,
        vx: (dirX * (35 + Math.random() * 110) + (Math.random() - 0.5) * 50) * scale,
        vy: (-25 - Math.random() * 75) * scale,
        size: Math.random() > 0.4 ? 4 : 3,
        color: colors[i % colors.length],
        alpha: 0.95,
        life,
        maxLife: life,
        gravity: 35,
      });
    }
  }

  private spawnHitSparkPixels(
    x: number,
    y: number,
    count: number,
    dirX: number,
    isCrit: boolean
  ): void {
    const colors = isCrit
      ? ['#FEF08A', '#FACC15', '#F97316', '#EF4444', '#FFFFFF']
      : ['#FEF08A', '#FACC15', '#FB923C', '#FFFFFF'];
    for (let i = 0; i < count; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * 1.4 + (dirX > 0 ? 0 : Math.PI);
      const speed = 70 + Math.random() * 190;
      const life = 0.25 + Math.random() * 0.35;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        size: Math.random() > 0.3 ? 4 : 2,
        color: colors[i % colors.length],
        alpha: 1,
        life,
        maxLife: life,
        gravity: 240,
      });
    }
  }

  private startLoop(): void {
    const tick = (now: number) => {
      if (this.isDisposed) return;
      const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTimestamp) / 1000));
      this.lastTimestamp = now;

      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= rawDt;
        this.renderScene();
        this.frameId = requestAnimationFrame(tick);
        return;
      }

      this.elapsed += rawDt;
      this.updateState(rawDt);
      this.renderScene();
      this.frameId = requestAnimationFrame(tick);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  private updateState(dt: number): void {
    if (this.leftFighter) {
      this.leftFighter.stateTimer += dt;
      this.updateFlyingGlasses(this.leftFighter, dt);
    }
    if (this.rightFighter) {
      this.rightFighter.stateTimer += dt;
      this.updateFlyingGlasses(this.rightFighter, dt);
    }

    // Smooth camera zoom & pan
    this.zoomLevel += (this.targetZoom - this.zoomLevel) * Math.min(1, dt * 8);
    this.panX += (this.targetPanX - this.panX) * Math.min(1, dt * 8);

    // Decay screen shake & flash
    if (this.shakeIntensity > 0.1) {
      this.shakeIntensity *= Math.pow(0.001, dt * 2.2);
    } else {
      this.shakeIntensity = 0;
    }

    if (this.flashScreenAlpha > 0.01) {
      this.flashScreenAlpha = Math.max(0, this.flashScreenAlpha - dt * 2.8);
    }

    this.crowdHypeLevel = Math.max(0.5, this.crowdHypeLevel - dt * 0.25);

    // Random stadium camera flashbulbs in the crowd
    if (Math.random() < dt * (2.5 + this.crowdHypeLevel * 3)) {
      this.stadiumFlashes.push({
        x: 30 + Math.random() * (this.vWidth - 60),
        y: 145 + Math.random() * 65,
        life: 0.12,
      });
    }
    for (let i = this.stadiumFlashes.length - 1; i >= 0; i--) {
      this.stadiumFlashes[i].life -= dt;
      if (this.stadiumFlashes[i].life <= 0) {
        this.stadiumFlashes.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 0.96;
      p.alpha = Math.max(0, p.life / p.maxLife);
    }

    // Update hit sparks
    for (let i = this.hitSparks.length - 1; i >= 0; i--) {
      const s = this.hitSparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.hitSparks.splice(i, 1);
        continue;
      }
      const progress = 1 - s.life / s.maxLife;
      s.radius = 8 + (s.maxRadius - 8) * Math.pow(progress, 0.5);
    }
  }

  private updateFlyingGlasses(f: Fighter2DSpriteState, dt: number): void {
    if (!f.glassesFlying) return;
    f.glassesX += f.glassesVx * dt;
    f.glassesY += f.glassesVy * dt;
    f.glassesVy += 480 * dt;
    f.glassesAngle += 14 * dt;
    if (f.glassesY > 312) {
      f.glassesY = 312;
      f.glassesVy = -f.glassesVy * 0.45;
      f.glassesVx *= 0.65;
    }
  }

  // ============================================================================
  // 16-BIT PIXEL ART RENDERING PIPELINE
  // ============================================================================

  private renderScene(): void {
    const ctx = this.ctx;
    ctx.save();

    // Apply camera zoom, pan, and impact screen shake
    const shakeX =
      this.shakeIntensity > 0 ? Math.round((Math.random() - 0.5) * 2 * this.shakeIntensity) : 0;
    const shakeY =
      this.shakeIntensity > 0 ? Math.round((Math.random() - 0.5) * 2 * this.shakeIntensity) : 0;

    if (this.zoomLevel !== 1.0 || this.panX !== 0 || shakeX !== 0 || shakeY !== 0) {
      ctx.translate(this.vWidth / 2 + shakeX, this.vHeight / 2 + shakeY);
      ctx.scale(this.zoomLevel, this.zoomLevel);
      ctx.translate(-this.vWidth / 2 + this.panX, -this.vHeight / 2);
    }

    // 1. Dark Stadium Sky & Pixel Roof Rigging
    this.drawStadiumBackdrop(ctx);

    // 2. Overhead Neon Stadium Floodlight Banks & Volumetric Light Beams
    this.drawStadiumLights(ctx);

    // 3. Left & Right Digital Jumbotrons ("amazon" blue on left, "ORACLE" red on right)
    this.drawJumbotrons(ctx);

    // 4. Animated 16-Bit Pixel Crowd Tiers & Camera Flashbulbs
    this.drawPixelCrowd(ctx);

    // 5. Octagon / Championship Stage Floor & Neon Apron
    this.drawStageFloor(ctx);

    // 6. Fighters & Central Championship Slap Podium (layered so active striker arm swings in front!)
    const left = this.leftFighter;
    const right = this.rightFighter;

    if (this.activeStrikerSide === 'LEFT') {
      if (right) this.drawFighter2D(ctx, right);
      this.drawCentralSlapPodium(ctx);
      if (left) this.drawFighter2D(ctx, left);
    } else {
      if (left) this.drawFighter2D(ctx, left);
      this.drawCentralSlapPodium(ctx);
      if (right) this.drawFighter2D(ctx, right);
    }

    // 7. Detached Flying Glasses
    if (left && left.glassesFlying) this.drawDetachedGlasses(ctx, left);
    if (right && right.glassesFlying) this.drawDetachedGlasses(ctx, right);

    // 8. Pixel Hit-Sparks & Talcum Chalk Clouds
    this.drawParticlesAndSparks(ctx);

    // 9. Impact Strobe Flash Overlay
    if (this.flashScreenAlpha > 0.01) {
      ctx.fillStyle = this.flashScreenColor;
      ctx.globalAlpha = this.flashScreenAlpha;
      ctx.fillRect(0, 0, this.vWidth, this.vHeight);
      ctx.globalAlpha = 1.0;
    }

    ctx.restore();

    // 10. Crisp 16-Bit CRT Arcade Scanline Overlay (subtle, non-intrusive)
    this.drawScanlines(ctx);
  }

  private drawStadiumBackdrop(ctx: CanvasRenderingContext2D): void {
    // Deep 16-bit night arena gradient bands (stepped pixel bands for authentic 16-bit feel)
    const bands = [
      '#05070E',
      '#080C18',
      '#0B1122',
      '#0F172A',
      '#131C33',
      '#17223D',
    ];
    const bandHeight = 40;
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[i];
      ctx.fillRect(0, i * bandHeight, this.vWidth, bandHeight + 1);
    }

    // Steel truss rafters along the top ceiling
    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, this.vWidth, 22);
    ctx.fillStyle = '#1E293B';
    for (let x = 0; x < this.vWidth; x += 32) {
      ctx.fillRect(x, 0, 4, 22);
      ctx.fillRect(x + 4, 8, 28, 3);
    }
  }

  private drawStadiumLights(ctx: CanvasRenderingContext2D): void {
    // Volumetric pixel light cones cutting across the dark stadium
    ctx.save();
    // Left cool blue/gold stadium beam
    const leftGrad = ctx.createLinearGradient(110, 22, 270, 290);
    leftGrad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    leftGrad.addColorStop(0.6, 'rgba(250, 204, 21, 0.08)');
    leftGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = leftGrad;
    ctx.beginPath();
    ctx.moveTo(65, 22);
    ctx.lineTo(175, 22);
    ctx.lineTo(310, 295);
    ctx.lineTo(130, 295);
    ctx.closePath();
    ctx.fill();

    // Right crimson/gold stadium beam
    const rightGrad = ctx.createLinearGradient(530, 22, 370, 290);
    rightGrad.addColorStop(0, 'rgba(239, 68, 68, 0.22)');
    rightGrad.addColorStop(0.6, 'rgba(250, 204, 21, 0.08)');
    rightGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = rightGrad;
    ctx.beginPath();
    ctx.moveTo(465, 22);
    ctx.lineTo(575, 22);
    ctx.lineTo(510, 295);
    ctx.lineTo(330, 295);
    ctx.closePath();
    ctx.fill();

    // Center golden championship spotlight directly on the slap barrel
    const centerGrad = ctx.createLinearGradient(320, 18, 320, 300);
    centerGrad.addColorStop(0, 'rgba(250, 204, 21, 0.26)');
    centerGrad.addColorStop(0.7, 'rgba(245, 158, 11, 0.11)');
    centerGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = centerGrad;
    ctx.beginPath();
    ctx.moveTo(275, 22);
    ctx.lineTo(365, 22);
    ctx.lineTo(430, 300);
    ctx.lineTo(210, 300);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Pixel floodlight bulb clusters along the top truss
    const bankPositions = [48, 136, 284, 356, 504, 592];
    for (const bx of bankPositions) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(bx - 22, 16, 44, 14);
      ctx.fillStyle = '#475569';
      ctx.fillRect(bx - 20, 18, 40, 2);

      // Glowing pixel bulbs
      for (let b = -16; b <= 12; b += 8) {
        ctx.fillStyle = '#FACC15';
        ctx.fillRect(bx + b, 21, 6, 7);
        ctx.fillStyle = '#FEF08A';
        ctx.fillRect(bx + b + 1, 22, 4, 4);
      }
    }
  }

  private drawJumbotrons(ctx: CanvasRenderingContext2D): void {
    const leftProfile = this.leftFighter?.profile;
    const rightProfile = this.rightFighter?.profile;

    // LEFT JUMBOTRON (Default: "amazon" blue digital screen with orange smile curve)
    this.drawSingleJumbotron(
      ctx,
      18,
      54,
      188,
      86,
      leftProfile?.id || 'bezos',
      leftProfile?.company || 'amazon',
      leftProfile?.name || 'JEFF BEZOS',
      '#1E40AF',
      '#38BDF8',
      '#FF9900',
      true
    );

    // RIGHT JUMBOTRON (Default: "ORACLE" red digital screen)
    this.drawSingleJumbotron(
      ctx,
      this.vWidth - 206,
      54,
      188,
      86,
      rightProfile?.id || 'ellison',
      rightProfile?.company || 'ORACLE',
      rightProfile?.name || 'LARRY ELLISON',
      '#7F1D1D',
      '#EF4444',
      '#FCA5A5',
      false
    );
  }

  private drawSingleJumbotron(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    fighterId: string,
    company: string,
    fighterName: string,
    bgDark: string,
    borderNeon: string,
    accentColor: string,
    isLeft: boolean
  ): void {
    // Support cables from ceiling
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 24, 22, 4, y - 22);
    ctx.fillRect(x + w - 28, 22, 4, y - 22);

    // Outer steel bezel
    ctx.fillStyle = '#090D16';
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);

    // Neon pixel border
    ctx.fillStyle = borderNeon;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

    // Inner LED matrix background
    ctx.fillStyle = bgDark;
    ctx.fillRect(x, y, w, h);

    // Subtle LED pixel grid lines inside jumbotron
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let py = y; py < y + h; py += 4) {
      ctx.fillRect(x, py, w, 1);
    }

    // Corner rivets
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(x + 3, y + 3, 4, 4);
    ctx.fillRect(x + w - 7, y + 3, 4, 4);
    ctx.fillRect(x + 3, y + h - 7, 4, 4);
    ctx.fillRect(x + w - 7, y + h - 7, 4, 4);

    // Brand Logo / Typography
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (fighterId === 'bezos') {
      // Iconic lowercase "amazon" in crisp white/cyan with orange pixel smile arrow underneath
      ctx.font = '900 28px "Chakra Petch", "Press Start 2P", monospace';
      ctx.fillStyle = '#090D16';
      ctx.fillText('amazon', x + w / 2 + 2, y + 34 + 2);
      ctx.fillStyle = '#E0F2FE';
      ctx.fillText('amazon', x + w / 2, y + 34);

      // Pixelated orange smile arrow from 'a' to 'z'
      ctx.fillStyle = '#FF9900';
      ctx.fillRect(x + 56, y + 51, 68, 4);
      ctx.fillRect(x + 48, y + 48, 10, 4);
      ctx.fillRect(x + 122, y + 48, 10, 4);
      // Arrowhead
      ctx.fillRect(x + 126, y + 44, 6, 4);
      ctx.fillRect(x + 128, y + 52, 6, 4);
    } else if (fighterId === 'ellison') {
      // Iconic uppercase "ORACLE" in crisp glowing red/white
      ctx.font = '900 28px "Chakra Petch", "Press Start 2P", monospace';
      ctx.fillStyle = '#090D16';
      ctx.fillText('ORACLE', x + w / 2 + 2, y + 36 + 2);
      ctx.fillStyle = '#FEE2E2';
      ctx.fillText('ORACLE', x + w / 2, y + 36);

      // Crimson laser underline bar
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(x + 32, y + 52, w - 64, 4);
    } else {
      ctx.font = '900 24px "Chakra Petch", monospace';
      ctx.fillStyle = '#090D16';
      ctx.fillText(company.toUpperCase(), x + w / 2 + 2, y + 36 + 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(company.toUpperCase(), x + w / 2, y + 36);
      ctx.fillStyle = accentColor;
      ctx.fillRect(x + 34, y + 52, w - 68, 3);
    }

    // Bottom ticker strip inside Jumbotron
    ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
    ctx.fillRect(x + 4, y + h - 22, w - 8, 16);
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.fillStyle = isLeft ? '#FACC15' : '#FCA5A5';
    ctx.fillText(
      `${fighterName.toUpperCase()} • ${isLeft ? 'P1 CONTENDER' : 'P2 CONTENDER'}`,
      x + w / 2,
      y + h - 13
    );
    ctx.restore();
  }

  private drawPixelCrowd(ctx: CanvasRenderingContext2D): void {
    // Distant stadium tier bleachers
    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 152, this.vWidth, 95);

    // Illuminated horizon divider lines
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, 152, this.vWidth, 3);
    ctx.fillRect(0, 180, this.vWidth, 2);
    ctx.fillRect(0, 205, this.vWidth, 2);

    // Draw animated pixel spectators
    for (const person of this.crowd) {
      const bounce =
        Math.round(
          Math.abs(Math.sin(this.elapsed * (3.5 + this.crowdHypeLevel * 2) + person.phase)) *
            (2 + this.crowdHypeLevel * 3)
        );
      const px = Math.round(person.x);
      const py = Math.round(person.y - bounce);

      // Shoulders/torso
      ctx.fillStyle = person.shirtColor;
      ctx.fillRect(px - 5, py + 6, 10, 10);

      // Pixel head
      ctx.fillStyle = person.skinColor;
      ctx.fillRect(px - 3, py, 6, 6);

      // Cheering raised arms when crowd hype is high
      if (this.crowdHypeLevel > 0.85 && Math.sin(this.elapsed * 8 + person.phase) > 0) {
        ctx.fillStyle = person.skinColor;
        ctx.fillRect(px - 7, py - 2, 2, 8);
        ctx.fillRect(px + 5, py - 2, 2, 8);
      }

      // Occasional neon fan sign
      if (person.hasSign) {
        ctx.fillStyle = person.signColor;
        ctx.fillRect(px - 6, py - 10, 12, 7);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(px - 4, py - 8, 8, 3);
      }
    }

    // Camera flashbulbs popping in the stands
    for (const flash of this.stadiumFlashes) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(flash.x - 4, flash.y - 1, 8, 2);
      ctx.fillRect(flash.x - 1, flash.y - 4, 2, 8);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(flash.x - 2, flash.y - 2, 4, 4);
    }
  }

  private drawStageFloor(ctx: CanvasRenderingContext2D): void {
    // Stage platform base at y = 242..360
    const floorTop = 244;

    // Back stage barrier rail
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, floorTop - 10, this.vWidth, 10);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(0, floorTop - 10, this.vWidth, 2);

    // Perspective pixel mat surface
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, floorTop, this.vWidth, this.vHeight - floorTop);

    // Center championship ring mat (dark slate with golden-amber trim)
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(90, floorTop + 4);
    ctx.lineTo(this.vWidth - 90, floorTop + 4);
    ctx.lineTo(this.vWidth - 20, this.vHeight);
    ctx.lineTo(20, this.vHeight);
    ctx.closePath();
    ctx.fill();

    // Left blue corner mat zone & Right red corner mat zone
    ctx.fillStyle = 'rgba(37, 99, 235, 0.24)';
    ctx.beginPath();
    ctx.moveTo(90, floorTop + 4);
    ctx.lineTo(250, floorTop + 4);
    ctx.lineTo(210, this.vHeight);
    ctx.lineTo(20, this.vHeight);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(220, 38, 38, 0.24)';
    ctx.beginPath();
    ctx.moveTo(390, floorTop + 4);
    ctx.lineTo(this.vWidth - 90, floorTop + 4);
    ctx.lineTo(this.vWidth - 20, this.vHeight);
    ctx.lineTo(430, this.vHeight);
    ctx.closePath();
    ctx.fill();

    // Crisp pixel perspective grid lines on the arena floor
    ctx.fillStyle = '#334155';
    for (let row = 0; row < 6; row++) {
      const y = floorTop + 10 + row * 18;
      ctx.fillRect(40 - row * 4, y, this.vWidth - (80 - row * 8), 2);
    }

    // Golden stage apron border
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(70, floorTop + 2, this.vWidth - 140, 3);
  }

  /**
   * Draws the iconic Central Slap Podium / Metallic Barrel ("Trash-Can Battle Station")
   * centered at x = 320, standing from y = 192 down to y = 296
   */
  private drawCentralSlapPodium(ctx: CanvasRenderingContext2D): void {
    const cx = 320;
    const topY = 194;
    const bottomY = 296;
    const barrelHeight = bottomY - topY;

    // Floor shadow under the barrel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(cx - 48, bottomY - 4, 96, 12);

    // Heavy metallic base pedestal ring
    ctx.fillStyle = '#090D16';
    ctx.fillRect(cx - 42, bottomY - 10, 84, 10);
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - 38, bottomY - 8, 76, 6);

    // Tapered dark metallic barrel body (stepped pixel trapezoid)
    const steps = 16;
    const stepH = Math.ceil(barrelHeight / steps);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const halfW = Math.round(36 - t * 6); // Tapers from 72px wide at top to 60px wide at base
      const sy = topY + i * stepH;

      // Dark gunmetal body
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(cx - halfW, sy, halfW * 2, stepH);

      // Left specular metallic highlight strip
      ctx.fillStyle = '#475569';
      ctx.fillRect(cx - halfW + 5, sy, 8, stepH);
      ctx.fillStyle = '#64748B';
      ctx.fillRect(cx - halfW + 7, sy, 3, stepH);

      // Center vertical fluted barrel ribs
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(cx - 12, sy, 3, stepH);
      ctx.fillRect(cx, sy, 3, stepH);
      ctx.fillRect(cx + 12, sy, 3, stepH);

      // Right deep shadow edge
      ctx.fillStyle = '#090D16';
      ctx.fillRect(cx + halfW - 7, sy, 7, stepH);
    }

    // Horizontal reinforcement bands on barrel
    ctx.fillStyle = '#090D16';
    ctx.fillRect(cx - 35, topY + 34, 70, 5);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(cx - 35, topY + 35, 70, 2);

    ctx.fillStyle = '#090D16';
    ctx.fillRect(cx - 33, topY + 68, 66, 5);
    ctx.fillStyle = '#475569';
    ctx.fillRect(cx - 33, topY + 69, 66, 2);

    // Heavy padded top rim / trash-can lid bevel
    ctx.fillStyle = '#090D16';
    ctx.fillRect(cx - 42, topY - 6, 84, 14);
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - 40, topY - 4, 80, 10);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(cx - 34, topY - 3, 22, 4);

    // Top chalk dust surface pad
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(cx - 28, topY - 6, 56, 3);
  }

  /**
   * Maps internal engine animation state to the 4 canonical sprite states:
   * 'IDLE' | 'WIND_UP' | 'STRIKE' | 'HIT_RECOIL'
   */
  private resolveCanonicalSpriteState(
    animState: FighterAnimState
  ): 'IDLE' | 'WIND_UP' | 'STRIKE' | 'HIT_RECOIL' {
    switch (animState) {
      case 'WIND_UP_TORQUE':
      case 'FAKEOUT':
      case 'CHEEK_ALIGNMENT':
        return 'WIND_UP';
      case 'SLAP_EXECUTION':
      case 'CELEBRATE_VICTORY':
      case 'TAUNT':
        return 'STRIKE';
      case 'HIT_LIGHT_CHEEK':
      case 'HIT_CHEEK_WHIP':
      case 'HIT_JAW_SNAP':
      case 'HIT_STAGGER_STEP':
      case 'HIT_STUMBLE_BACK':
      case 'FLINCHED':
      case 'KNOCKDOWN':
        return 'HIT_RECOIL';
      default:
        return 'IDLE';
    }
  }

  private drawFighter2D(
    ctx: CanvasRenderingContext2D,
    fighter: Fighter2DSpriteState
  ): void {
    const isLeft = fighter.side === 'LEFT';
    const dir = isLeft ? 1 : -1;
    const baseX = isLeft ? 214 : 426;
    const baseY = 286;

    if (fighter.animState === 'KNOCKDOWN' && fighter.stateTimer > 0.25) {
      this.drawKnockedDownFighter(ctx, baseX, baseY, dir, fighter);
      return;
    }

    const canonicalState = this.resolveCanonicalSpriteState(fighter.animState);
    this.drawFighter(
      ctx,
      fighter.profile.id,
      canonicalState,
      baseX,
      baseY,
      isLeft,
      fighter
    );
  }

  /**
   * Master 16-Bit Coordinate-Based Pixel-Art Sprite Renderer
   * Renders recognizable 16-bit caricatures of all 10 Tech Titans with:
   * - 1px torso/shoulder breathing shift every 30 frames
   * - 5px arm cock-back & vertical squash-and-stretch on WIND_UP
   * - 2-frame pure white flash, sweat droplets & bruised cheek pixels on HIT_RECOIL
   */
  public drawFighter(
    ctx: CanvasRenderingContext2D,
    characterId: string,
    state: 'IDLE' | 'WIND_UP' | 'STRIKE' | 'HIT_RECOIL',
    x: number,
    y: number,
    facingRight: boolean,
    fighterState?: Fighter2DSpriteState
  ): void {
    const P = 2; // 16-bit pixel block unit (2x2 virtual canvas pixels per sprite texel)
    const dir = facingRight ? 1 : -1;
    const frameCount = Math.floor(this.elapsed * 60);

    // 1-pixel breathing shift every 30 frames
    const breathShift =
      state === 'IDLE' ? (Math.floor(frameCount / 30) % 2 === 0 ? 0 : 1) : 0;

    // 2-frame white flash on initial impact
    const isWhiteFlashFrame =
      state === 'HIT_RECOIL' &&
      fighterState !== undefined &&
      fighterState.stateTimer < 2 / 60;

    // Squash & stretch + positional lunge offsets
    let bodyOffsetX = 0;
    let scaleY = 1.0;
    let scaleX = 1.0;

    if (state === 'WIND_UP') {
      bodyOffsetX = -dir * 4 * P;
      scaleY = 0.94; // Vertical compression on wind-up
      scaleX = 1.05;
    } else if (state === 'STRIKE') {
      bodyOffsetX = dir * 14 * P;
      scaleY = 1.03;
    } else if (state === 'HIT_RECOIL') {
      bodyOffsetX = -dir * 9 * P;
      scaleY = 0.96;
    }

    ctx.save();
    ctx.translate(Math.round(x + bodyOffsetX), Math.round(y));
    ctx.scale(facingRight ? scaleX : -scaleX, scaleY);

    // Helper to plot a coordinate-addressed pixel block in local sprite grid space
    // Grid origin (0, 0) is bottom-center between the fighter's boots; Y grows upward
    const px = (
      gx: number,
      gy: number,
      gw: number,
      gh: number,
      color: string
    ) => {
      ctx.fillStyle = isWhiteFlashFrame ? '#FFFFFF' : color;
      ctx.fillRect(
        Math.round(gx * P),
        Math.round(-(gy + gh) * P),
        Math.round(gw * P),
        Math.round(gh * P)
      );
    };

    // Visual Dictionary for the 10 Tech Titans
    const VISUAL_SPECS: Record<
      string,
      {
        skin: string;
        skinShadow: string;
        hair: string;
        hairSecondary: string;
        torsoPrimary: string;
        torsoSecondary: string;
        accent: string;
        pants: string;
      }
    > = {
      bezos: {
        skin: '#E8B89A',
        skinShadow: '#C99372',
        hair: '#D1D5DB',
        hairSecondary: '#FFFBEB',
        torsoPrimary: '#1E3A8A', // Deep blue Amazon polo
        torsoSecondary: '#172554',
        accent: '#FACC15', // Yellow arrow branding
        pants: '#0F172A',
      },
      ellison: {
        skin: '#DEB08B',
        skinShadow: '#B88662',
        hair: '#1F2937', // Dark combed-back hair
        hairSecondary: '#CBD5E1', // Silver temples
        torsoPrimary: '#DC2626', // Red Oracle executive racing jacket
        torsoSecondary: '#991B1B',
        accent: '#F8FAFC', // White racing stripe
        pants: '#1E293B',
      },
      zuckerberg: {
        skin: '#F5CBA7',
        skinShadow: '#D9A782',
        hair: '#9A5B32', // Short rigid crew cut
        hairSecondary: '#78350F',
        torsoPrimary: '#334155', // Dark grey Meta tee
        torsoSecondary: '#1E293B',
        accent: '#38BDF8',
        pants: '#0F172A',
      },
      musk: {
        skin: '#ECC3A5',
        skinShadow: '#C89B7B',
        hair: '#3B2314', // Tousled brown hair
        hairSecondary: '#5C3A21',
        torsoPrimary: '#0F172A', // Futuristic black collar-up jacket
        torsoSecondary: '#1E293B',
        accent: '#38BDF8', // Subtle rocket-streak trim
        pants: '#090D16',
      },
      huang: {
        skin: '#E5B895',
        skinShadow: '#C2926E',
        hair: '#1F2937', // Flowing dark locks with silver streaks
        hairSecondary: '#D1D5DB',
        torsoPrimary: '#0A0A0A', // Pitch-black leather jacket
        torsoSecondary: '#1F2937',
        accent: '#CBD5E1', // Silver zipper lines
        pants: '#090D16',
      },
      altman: {
        skin: '#F1C6A7',
        skinShadow: '#D2A180',
        hair: '#4B3621', // Neat brown parted hair
        hairSecondary: '#291D12',
        torsoPrimary: '#64748B', // Minimalist gray zip-up tech hoodie
        torsoSecondary: '#475569',
        accent: '#A855F7',
        pants: '#1E293B',
      },
      nadella: {
        skin: '#CFA17B',
        skinShadow: '#AD7E58',
        hair: '#1E293B', // Professional styled dark hair
        hairSecondary: '#94A3B8',
        torsoPrimary: '#1E3A8A', // Sharp navy blue enterprise blazer
        torsoSecondary: '#0F172A',
        accent: '#38BDF8',
        pants: '#0F172A',
      },
      cook: {
        skin: '#F1C6A7',
        skinShadow: '#D2A180',
        hair: '#E2E8F0', // Distinguished silver hair
        hairSecondary: '#94A3B8',
        torsoPrimary: '#1E293B', // Dark titanium-blue polo
        torsoSecondary: '#0F172A',
        accent: '#38BDF8',
        pants: '#090D16',
      },
      pichai: {
        skin: '#C68B59',
        skinShadow: '#A36A3A',
        hair: '#111827', // Neat dark hair
        hairSecondary: '#374151',
        torsoPrimary: '#1E293B', // Smart-casual multi-accented executive layer
        torsoSecondary: '#334155',
        accent: '#22C55E',
        pants: '#0F172A',
      },
      amodei: {
        skin: '#EBC2A4',
        skinShadow: '#C79B7C',
        hair: '#1C1917', // Dark researcher curls
        hairSecondary: '#44403C',
        torsoPrimary: '#292524', // Structured vest over dark collar
        torsoSecondary: '#0C0A09',
        accent: '#D97706',
        pants: '#1C1917',
      },
    };

    const spec = VISUAL_SPECS[characterId] || VISUAL_SPECS.bezos;
    const by = -breathShift; // 1-pixel vertical breathing offset

    // =========================================================================
    // SUB-BLOCK 1: FLOOR SHADOW, LEGS, & PLANTED COMBAT BOOTS
    // =========================================================================
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(-18 * P, -2 * P, 36 * P, 4 * P);

    // Back & Front Legs
    px(-13, 4, 9, 18, spec.pants);
    px(4, 4, 9, 18, spec.pants);
    // Knee highlights
    px(-12, 11, 7, 3, spec.torsoSecondary);
    px(5, 11, 7, 3, spec.torsoSecondary);
    // Boots
    px(-15, 0, 12, 5, '#090D16');
    px(3, 0, 13, 5, '#090D16');
    px(-14, 1, 10, 1, spec.accent);
    px(4, 1, 11, 1, spec.accent);

    // Belt
    px(-14, 21 + by, 28, 4, '#090D16');
    px(-3, 21 + by, 6, 4, '#FACC15');

    // =========================================================================
    // SUB-BLOCK 2: BACK GUARD ARM (GRIPPING THE PODIUM RIM)
    // =========================================================================
    px(10, 34 + by, 12, 6, spec.torsoPrimary);
    px(20, 33 + by, 7, 5, spec.skin);

    // =========================================================================
    // SUB-BLOCK 3: ATTIRE, COLLAR LINES, SLEEVES, & MICRO-PIXEL CHEST LOGOS
    // =========================================================================
    // Outer torso silhouette
    px(-16, 24 + by, 32, 24, '#090D16');
    // Main torso block
    px(-15, 25 + by, 30, 22, spec.torsoPrimary);
    // Side rib shading
    px(-15, 25 + by, 5, 22, spec.torsoSecondary);

    // Character-specific corporate attire & micro-pixel chest logos
    if (characterId === 'bezos') {
      // Deep blue Amazon polo collar + button placket + yellow smile arrow across chest
      px(-6, 44 + by, 12, 4, '#172554');
      px(-1, 39 + by, 2, 6, '#0F172A');
      // Yellow Amazon smile arrow from left chest to right chest
      px(-8, 35 + by, 3, 2, '#FACC15');
      px(-5, 34 + by, 10, 2, '#FACC15');
      px(5, 35 + by, 4, 2, '#FF9900');
      px(7, 37 + by, 2, 2, '#FF9900');
      px(7, 33 + by, 2, 2, '#FF9900');
    } else if (characterId === 'ellison') {
      // Red Oracle executive racing jacket with white shoulder stripes & chest badge
      px(-16, 43 + by, 32, 4, '#F8FAFC');
      px(-6, 45 + by, 12, 3, '#090D16');
      px(-1, 25 + by, 2, 22, '#090D16'); // Racing zip line
      // Micro-pixel white ORACLE chest bar
      px(-9, 36 + by, 18, 3, '#F8FAFC');
      px(-7, 37 + by, 14, 1, '#DC2626');
    } else if (characterId === 'zuckerberg') {
      // Dark grey Meta tee with cyan infinity loop pixel icon
      px(-6, 45 + by, 12, 2, '#1E293B');
      px(-6, 35 + by, 5, 4, '#38BDF8');
      px(1, 35 + by, 5, 4, '#38BDF8');
      px(-1, 36 + by, 2, 2, '#38BDF8');
      px(-4, 36 + by, 2, 2, '#334155');
      px(2, 36 + by, 2, 2, '#334155');
    } else if (characterId === 'musk') {
      // Futuristic black collar-up jacket with rocket-streak trim
      px(-9, 46 + by, 18, 5, '#090D16'); // High popped collar
      px(-8, 46 + by, 2, 5, '#38BDF8');
      px(6, 46 + by, 2, 5, '#38BDF8');
      // Rocket-streak diagonal chest trim
      px(-10, 33 + by, 4, 2, '#38BDF8');
      px(-6, 35 + by, 4, 2, '#38BDF8');
      px(-2, 37 + by, 4, 2, '#38BDF8');
      px(2, 39 + by, 5, 2, '#F8FAFC');
    } else if (characterId === 'huang') {
      // Pitch-black leather jacket with silver zipper lines & notched collar flaps
      px(-10, 44 + by, 7, 5, '#1F2937');
      px(3, 44 + by, 7, 5, '#1F2937');
      px(-8, 45 + by, 2, 2, '#CBD5E1'); // Silver lapel stud
      px(6, 45 + by, 2, 2, '#CBD5E1');
      // Silver main & asymmetrical pocket zippers
      px(1, 25 + by, 2, 21, '#CBD5E1');
      px(-9, 36 + by, 7, 1, '#CBD5E1');
      px(-9, 31 + by, 6, 1, '#76B900'); // Subtle NVIDIA green trim
    } else if (characterId === 'altman') {
      // Minimalist gray zip-up tech hoodie with drawstrings
      px(-8, 45 + by, 16, 4, '#475569');
      px(0, 25 + by, 1, 21, '#CBD5E1'); // Center zipper
      px(-4, 39 + by, 1, 7, '#F8FAFC'); // Left hoodie string
      px(4, 39 + by, 1, 7, '#F8FAFC');  // Right hoodie string
      px(5, 36 + by, 4, 4, '#A855F7');  // OpenAI violet emblem
    } else if (characterId === 'nadella') {
      // Sharp navy blue enterprise blazer over light shirt & 4-color Windows lapel pin
      px(-4, 38 + by, 8, 9, '#E0F2FE'); // Inner shirt V
      px(-6, 40 + by, 3, 7, '#0F172A'); // Left lapel
      px(3, 40 + by, 3, 7, '#0F172A');  // Right lapel
      // 4-color Microsoft pixel window on chest
      px(5, 37 + by, 2, 2, '#F97316');
      px(8, 37 + by, 2, 2, '#84CC16');
      px(5, 34 + by, 2, 2, '#06B6D4');
      px(8, 34 + by, 2, 2, '#FACC15');
    } else if (characterId === 'cook') {
      // Dark titanium-blue polo with crisp collar & silver Apple chest pixel
      px(-7, 45 + by, 14, 3, '#0F172A');
      px(5, 36 + by, 4, 4, '#E2E8F0');
      px(6, 40 + by, 2, 1, '#E2E8F0');
    } else if (characterId === 'pichai') {
      // Smart-casual multi-accented executive layer (Google 4-color chest stripe)
      px(-7, 45 + by, 14, 3, '#0F172A');
      px(-10, 36 + by, 5, 3, '#EA4335');
      px(-5, 36 + by, 5, 3, '#FBBC05');
      px(0, 36 + by, 5, 3, '#34A853');
      px(5, 36 + by, 5, 3, '#4285F4');
    } else if (characterId === 'amodei') {
      // Structured vest over dark collar shirt
      px(-15, 38 + by, 5, 9, '#0C0A09'); // Dark sleeves under vest
      px(10, 38 + by, 5, 9, '#0C0A09');
      px(-6, 45 + by, 12, 4, '#0C0A09'); // Dark collar
      px(4, 36 + by, 5, 4, '#D97706');   // Anthropic amber spark badge
    }

    // =========================================================================
    // SUB-BLOCK 4: HEAD, CRANIUM, HAIR, & DYNAMIC FACIAL EXPRESSIONS
    // =========================================================================
    const headX = state === 'HIT_RECOIL' ? -3 : 0;
    const headY = 48 + by;

    // Neck column
    px(headX - 5, headY - 2, 10, 5, spec.skinShadow);
    px(headX - 4, headY - 1, 8, 4, spec.skin);

    // Sculpted 16-bit Cranium & Jawline (non-blocky stepped skull contour)
    px(headX - 10, headY + 2, 21, 18, '#090D16'); // Outer outline
    px(headX - 9, headY + 3, 19, 16, spec.skin);  // Main face
    px(headX - 7, headY + 2, 16, 2, spec.skin);   // Chiseled jawline taper
    px(headX - 8, headY + 18, 17, 2, spec.skin);  // Upper cranium dome

    // Ear & inner ear shadow
    px(headX - 11, headY + 8, 3, 6, spec.skin);
    px(headX - 10, headY + 9, 1, 4, spec.skinShadow);

    // Nose bridge & projecting tip
    px(headX + 9, headY + 8, 3, 5, spec.skin);
    px(headX + 8, headY + 7, 3, 1, spec.skinShadow);

    // HAIR & FACIAL HAIR GEOMETRY PER CONTENDER
    if (characterId === 'bezos') {
      // Polished bald dome with multi-pixel specular light reflection
      px(headX - 6, headY + 16, 6, 3, '#FFFBEB');
      px(headX - 8, headY + 14, 3, 2, '#FEF08A');
    } else if (characterId === 'ellison') {
      // Dark combed-back hair with distinct silver temples + trimmed goatee
      px(headX - 10, headY + 17, 20, 5, spec.hair);
      px(headX - 11, headY + 11, 4, 7, spec.hair);
      // Silver temples
      px(headX - 8, headY + 12, 3, 4, spec.hairSecondary);
      // Trimmed goatee & mustache
      px(headX + 2, headY + 6, 8, 2, '#374151');
      px(headX + 1, headY + 2, 9, 3, '#374151');
    } else if (characterId === 'zuckerberg') {
      // Short rigid crew cut with straight Caesar fringe
      px(headX - 10, headY + 17, 20, 4, spec.hair);
      px(headX - 10, headY + 12, 3, 6, spec.hair);
      px(headX - 4, headY + 16, 14, 2, spec.hairSecondary);
    } else if (characterId === 'musk') {
      // Tousled brown hair with choppy top locks
      px(headX - 10, headY + 17, 21, 5, spec.hair);
      px(headX - 6, headY + 21, 5, 2, spec.hair);
      px(headX + 2, headY + 21, 6, 2, spec.hairSecondary);
      px(headX - 10, headY + 11, 4, 7, spec.hair);
    } else if (characterId === 'huang') {
      // Flowing dark locks with silver-grey swept highlights past the collar
      px(headX - 11, headY + 17, 22, 5, spec.hair);
      px(headX - 12, headY + 4, 5, 14, spec.hair);
      px(headX - 7, headY + 18, 12, 2, spec.hairSecondary);
    } else if (characterId === 'altman') {
      // Neat brown side-parted hair
      px(headX - 10, headY + 17, 20, 5, spec.hair);
      px(headX - 5, headY + 17, 2, 4, spec.skin); // Side part line
      px(headX - 10, headY + 12, 3, 6, spec.hair);
    } else if (characterId === 'nadella') {
      // Professional styled dark side hair & crown
      px(headX - 10, headY + 11, 4, 7, spec.hair);
      px(headX - 7, headY + 17, 13, 3, spec.hair);
      px(headX - 4, headY + 16, 6, 2, '#FFFBEB');
    } else if (characterId === 'cook') {
      // Distinguished silver parted hair
      px(headX - 10, headY + 17, 21, 5, spec.hair);
      px(headX - 10, headY + 11, 4, 7, spec.hairSecondary);
      px(headX + 4, headY + 21, 6, 2, spec.hair);
    } else if (characterId === 'pichai') {
      // Composed neat dark hair + subtle dark beard trim
      px(headX - 10, headY + 17, 20, 5, spec.hair);
      px(headX - 10, headY + 10, 4, 8, spec.hair);
      px(headX - 2, headY + 2, 11, 2, spec.hairSecondary);
      px(headX + 3, headY + 6, 6, 1, spec.hairSecondary);
    } else if (characterId === 'amodei') {
      // Curly dark researcher hair & full beard
      px(headX - 11, headY + 17, 22, 6, spec.hair);
      px(headX - 11, headY + 9, 4, 9, spec.hair);
      px(headX - 3, headY + 2, 12, 3, spec.hair);
      px(headX + 2, headY + 6, 7, 2, spec.hair);
    }

    // DYNAMIC FACIAL EXPRESSIONS (IDLE, WIND_UP, STRIKE, HIT_RECOIL)
    const eyeX = headX + 3;
    const eyeY = headY + 11;

    if (state === 'HIT_RECOIL') {
      // Wide shocked / wincing recoil eyes
      px(eyeX - 1, eyeY - 1, 5, 5, '#FFFFFF');
      px(eyeX + 1, eyeY + 1, 2, 2, '#090D16');
      // Bruised / reddened cheek pixel cluster
      px(headX - 2, headY + 6, 6, 4, '#EF4444');
      px(headX - 1, headY + 7, 3, 2, '#991B1B');
      // Open impact mouth
      px(headX + 3, headY + 3, 6, 4, '#090D16');
      px(headX + 4, headY + 5, 4, 1, '#FFFFFF');
      // Flying sweat droplets
      px(headX - 14, headY + 15, 2, 3, '#38BDF8');
      px(headX - 17, headY + 11, 2, 2, '#E0F2FE');
      px(headX + 12, headY + 16, 2, 3, '#38BDF8');
    } else if (state === 'WIND_UP') {
      // Intense glare with angled brow & clenched teeth
      px(eyeX, eyeY, 4, 3, '#FFFFFF');
      px(eyeX + 2, eyeY, 2, 3, '#090D16');
      px(eyeX - 2, eyeY + 3, 7, 2, '#090D16'); // Low fierce brow
      px(headX + 3, headY + 4, 6, 2, '#FFFFFF'); // Gritted teeth
    } else if (state === 'STRIKE') {
      // Battle shout & fierce focus
      px(eyeX, eyeY, 4, 3, '#FFFFFF');
      px(eyeX + 2, eyeY, 2, 3, '#090D16');
      px(eyeX - 1, eyeY + 3, 6, 2, '#090D16');
      px(headX + 3, headY + 3, 6, 4, '#090D16');
      px(headX + 4, headY + 6, 4, 1, '#FFFFFF');
    } else {
      // IDLE state with character-specific personality expressions
      if (characterId === 'zuckerberg' && frameCount % 90 < 6) {
        // Subtle robotic wink frame for Zuckerberg
        px(eyeX, eyeY + 1, 4, 1, '#090D16');
      } else if (characterId === 'ellison') {
        // Stern squinted eyes
        px(eyeX, eyeY + 1, 4, 2, '#FFFFFF');
        px(eyeX + 2, eyeY + 1, 2, 2, '#090D16');
        px(eyeX - 1, eyeY + 3, 6, 2, spec.hair);
      } else {
        px(eyeX, eyeY, 4, 3, '#FFFFFF');
        px(eyeX + 2, eyeY, 2, 3, '#090D16');
        px(eyeX - 1, eyeY + 3, 5, 1, spec.hair);
      }

      // Character-specific IDLE mouth (Bezos smirk, Musk grin, Nadella smile, etc.)
      if (characterId === 'bezos' || characterId === 'musk') {
        px(headX + 2, headY + 4, 5, 1, '#090D16');
        px(headX + 1, headY + 5, 2, 1, '#090D16'); // Upward smirk corner
      } else if (characterId === 'nadella') {
        px(headX + 2, headY + 4, 6, 2, '#090D16');
        px(headX + 3, headY + 5, 4, 1, '#FFFFFF'); // Warm smile
      } else {
        px(headX + 3, headY + 4, 5, 1, '#090D16');
      }
    }

    // Thin-framed glasses pixels for Cook, Huang, Nadella, Pichai, Amodei
    if (
      (characterId === 'cook' ||
        characterId === 'huang' ||
        characterId === 'nadella' ||
        characterId === 'pichai' ||
        characterId === 'amodei') &&
      !fighterState?.glassesFlying
    ) {
      const frameColor = characterId === 'cook' ? '#E2E8F0' : '#94A3B8';
      px(eyeX - 2, eyeY + 3, 7, 1, frameColor);
      px(eyeX - 2, eyeY - 1, 7, 1, frameColor);
      px(eyeX - 2, eyeY - 1, 1, 5, frameColor);
      px(eyeX + 4, eyeY - 1, 1, 5, frameColor);
      px(headX - 6, eyeY + 1, 6, 1, frameColor); // Temple arm to ear
    }

    // =========================================================================
    // SUB-BLOCK 5: FOREGROUND SLAP ARM (5-PIXEL WIND-UP COCK-BACK & STRIKE ARC)
    // =========================================================================
    const armShiftX =
      state === 'WIND_UP'
        ? -5 // Explicit 5-pixel wind-up cock-back
        : state === 'STRIKE'
          ? 18
          : state === 'HIT_RECOIL'
            ? -3
            : 0;

    // Shoulder & Bicep
    px(-14 + armShiftX, 34 + by, 10, 10, spec.torsoPrimary);
    // Forearm
    px(-6 + armShiftX, 33 + by, 12, 7, spec.skin);
    // Open Chalked Slap Palm & Fingers
    const handX = 5 + armShiftX;
    const handY = 32 + by;
    px(handX, handY, 8, 9, spec.skin);
    px(handX + 4, handY + 1, 5, 7, '#FFFFFF'); // Magnesium talcum chalk palm coating
    px(handX + 2, handY + 9, 3, 3, spec.skin); // Splayed thumb

    // Golden kinetic motion smear on STRIKE frame
    if (state === 'STRIKE' && !isWhiteFlashFrame) {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.55)';
      ctx.fillRect(-10 * P, -42 * P, 28 * P, 8 * P);
    }

    ctx.restore();
  }

  private drawKnockedDownFighter(
    ctx: CanvasRenderingContext2D,
    fx: number,
    floorY: number,
    dir: number,
    fighter: Fighter2DSpriteState
  ): void {
    const p = fighter.profile;
    // Draws fighter sprawled on the arena floor with spinning pixel stars overhead!
    const bodyX = fx - dir * 28;
    const bodyY = floorY - 18;

    ctx.fillStyle = '#090D16';
    ctx.fillRect(bodyX - 42, bodyY - 8, 84, 24);
    ctx.fillStyle = p.primaryColor;
    ctx.fillRect(bodyX - 38, bodyY - 6, 52, 20);
    ctx.fillStyle = p.skinTone;
    ctx.fillRect(bodyX - 54, bodyY - 6, 18, 18);

    // Spinning pixel stars above knocked-out head
    for (let s = 0; s < 3; s++) {
      const angle = this.elapsed * 6 + (s * Math.PI * 2) / 3;
      const sx = Math.round(bodyX - 45 + Math.cos(angle) * 18);
      const sy = Math.round(bodyY - 24 + Math.sin(angle) * 6);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(sx - 3, sy - 3, 6, 6);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }
  }

  private drawDetachedGlasses(
    ctx: CanvasRenderingContext2D,
    f: Fighter2DSpriteState
  ): void {
    ctx.save();
    ctx.translate(f.glassesX, f.glassesY);
    ctx.rotate(f.glassesAngle);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(-10, -4, 8, 6);
    ctx.fillRect(2, -4, 8, 6);
    ctx.fillRect(-2, -2, 4, 2);
    ctx.restore();
  }

  private drawParticlesAndSparks(ctx: CanvasRenderingContext2D): void {
    // 1. Pixel Particles (Talcum chalk clouds & yellow hit-sparks)
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      ctx.restore();
    }

    // 2. Retro Arcade Starburst Hit-Sparks & Floating Action Words ("SMACK!", "CRIT!", "KO!!")
    for (const s of this.hitSparks) {
      const alpha = Math.min(1, (s.life / s.maxLife) * 1.5);
      ctx.save();
      ctx.globalAlpha = alpha;

      // 8-ray pixelated starburst
      const rays = 8;
      for (let r = 0; r < rays; r++) {
        const angle = (r * Math.PI * 2) / rays + this.elapsed * 4;
        const innerR = s.radius * 0.25;
        const outerR = r % 2 === 0 ? s.radius : s.radius * 0.65;
        const steps = 6;
        for (let step = 0; step <= steps; step++) {
          const dist = innerR + ((outerR - innerR) * step) / steps;
          const px = Math.round(s.x + Math.cos(angle) * dist);
          const py = Math.round(s.y + Math.sin(angle) * dist);
          ctx.fillStyle =
            step < 2
              ? '#FFFFFF'
              : step < 4
                ? '#FEF08A'
                : s.isCritical
                  ? '#EF4444'
                  : '#F59E0B';
          ctx.fillRect(px - 3, py - 3, 6, 6);
        }
      }

      if (s.label) {
        ctx.font = '900 18px "Press Start 2P", "Chakra Petch", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#090D16';
        ctx.fillText(s.label, Math.round(s.x) + 2, Math.round(s.y - s.radius * 0.6) + 2);
        ctx.fillStyle = s.isCritical ? '#FACC15' : '#FFFFFF';
        ctx.fillText(s.label, Math.round(s.x), Math.round(s.y - s.radius * 0.6));
      }

      ctx.restore();
    }
  }

  private drawScanlines(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    for (let y = 0; y < this.vHeight; y += 3) {
      ctx.fillRect(0, y, this.vWidth, 1);
    }
  }

  private handleResize = (): void => {
    if (!this.container || this.isDisposed) return;
    this.ctx.imageSmoothingEnabled = false;
  };

  public dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
