export type SlapAngle = 'HIGH_TEMPLE' | 'MID_CHEEK' | 'JAWLINE_LEVER';
export type WindUpCount = 1 | 2 | 3;
export type KOType = 'NONE' | 'CLEAN_KO' | 'STAGGER_KO' | 'DELAYED_KO' | 'CRITICAL_KO';

export interface KOTypeDefinition {
  id: Exclude<KOType, 'NONE'>;
  name: string;
  badgeColor: string;
  thresholdRule: string;
  visualImpact: string;
  gameplayImpact: string;
  recoveryWindowWidth: number; // 0.10 to 0.28 (fraction of bar width)
  recoveryCursorSpeed: number; // radians/sec
  recoveredHPPercent: number;
  comebackBuffName: string;
  comebackBuffDescription: string;
}

export const KO_TYPE_DEFINITIONS: Record<Exclude<KOType, 'NONE'>, KOTypeDefinition> = {
  CLEAN_KO: {
    id: 'CLEAN_KO',
    name: 'Clean KO',
    badgeColor: '#EF4444',
    thresholdRule: 'Damage ≥ 1.15 × Effective KOResistance on a direct strike',
    visualImpact: 'Instant rigid-body 90° backward collapse, high-speed profile camera zoom, golden spotlight flash, and dense magnesium chalk dispersion.',
    gameplayImpact: 'Triggers 10-Count Timing Mini-Game with a narrow 16% recovery zone (4.4 rad/s needle). Failure forfeits the round immediately; recovery restores 38% HP and +15% Chin Brace stability.',
    recoveryWindowWidth: 0.16,
    recoveryCursorSpeed: 4.4,
    recoveredHPPercent: 38,
    comebackBuffName: 'Isometric Reboot',
    comebackBuffDescription: '+15% Chin Brace efficiency on the next defensive turn.',
  },
  STAGGER_KO: {
    id: 'STAGGER_KO',
    name: 'Staggered KO',
    badgeColor: '#F59E0B',
    thresholdRule: 'Damage ≥ Effective KOResistance via High Temple vector or when Fatigue ≥ 35%',
    visualImpact: 'Multi-axis vestibular wobble across the podium before knees buckle laterally, paired with camera roll oscillation and sweat particle spray.',
    gameplayImpact: 'Triggers 10-Count Timing Mini-Game with a 22% recovery zone but erratic 4.9 rad/s needle speed. Failure results in a lost round; recovery restores 44% HP and clears accumulated hit-stun.',
    recoveryWindowWidth: 0.22,
    recoveryCursorSpeed: 4.9,
    recoveredHPPercent: 44,
    comebackBuffName: 'Gyro Stabilizer',
    comebackBuffDescription: 'Resets accumulated hit-wear penalty and reduces fatigue by 20%.',
  },
  DELAYED_KO: {
    id: 'DELAYED_KO',
    name: 'Delayed KO',
    badgeColor: '#38BDF8',
    thresholdRule: 'Damage ∈ [1.00×, 1.15×) Effective KOResistance after partial neck brace absorption',
    visualImpact: 'Defender freezes gripping the podium bar for 0.65s as neural shock propagates, then slowly crumples forward onto the mat.',
    gameplayImpact: 'Triggers 10-Count Timing Mini-Game with a generous 28% recovery zone (3.5 rad/s needle). Failure forfeits the round; recovery grants 50% HP and recharges the fighter’s Special Ability.',
    recoveryWindowWidth: 0.28,
    recoveryCursorSpeed: 3.5,
    recoveredHPPercent: 50,
    comebackBuffName: 'Second-Wind Surge',
    comebackBuffDescription: 'Restores 50% HP and immediately recharges Special Ability.',
  },
  CRITICAL_KO: {
    id: 'CRITICAL_KO',
    name: 'Critical KO',
    badgeColor: '#A855F7',
    thresholdRule: 'Damage ≥ 1.28 × Effective KOResistance OR ≥90% Sweet-Spot Jawline Lever above threshold',
    visualImpact: '0.20x super slow-motion time dilation, macro jawline camera lock, company-colored shockwave ring detonation, heavy screen shake, and full crowd roar.',
    gameplayImpact: 'Extreme 12% recovery zone at 5.5 rad/s needle speed. Failure loses the round and inflicts -10% KO Resistance carry-over; miracle recovery grants +30% SlapForce Overclock.',
    recoveryWindowWidth: 0.12,
    recoveryCursorSpeed: 5.5,
    recoveredHPPercent: 35,
    comebackBuffName: 'Titan Overclock',
    comebackBuffDescription: '+30% SlapForce multiplier and automatic sweet-spot boost on next slap.',
  },
};

export interface FighterStats {
  power: number;
  chinDurability: number;
  precision: number;
  windUpSpeed: number;
  koResistance: number;
}

export interface FighterProfile {
  id: string;
  name: string;
  company: string;
  title: string;
  storyChapter: number;
  imageUrl: string;
  arenaName: string;
  arenaLocation: string;
  arenaDescription: string;
  tutorialFocus: string;
  armorName: string;
  armorDescription: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  skinTone: string;
  hairColor: string;
  hasGlasses: boolean;
  isBald?: boolean;
  hasJacketCollar?: boolean;
  stats: FighterStats;
  specialName: string;
  specialDescription: string;
  specialEffectType:
    | 'COOLDOWN_PRECISION'
    | 'TORQUE_BOOST'
    | 'ANGLE_OPTIMIZE'
    | 'POWER_SPIKE'
    | 'REDUCED_RECOIL'
    | 'CHIN_BRACE_BOOST'
    | 'DAMAGE_REDUCTION'
    | 'RAINBOW_PRECISION'
    | 'FORCE_MULTIPLIER'
    | 'RETRO_DEBUG';
  movementVariationName: string;
  movementVariationDesc: string;
  a2aPersonality: string;
  a2aEmotionalTrait: string;
  preferredWindUp: WindUpCount;
  preferredAngle: SlapAngle;
  tauntQuote: string;
  victoryQuote: string;
}

export const FIGHTERS: FighterProfile[] = [
  {
    id: 'bezos',
    name: 'Jeff Bezos',
    company: 'Amazon',
    title: 'The Prime Deliverer',
    storyChapter: 1,
    imageUrl: '/assets/aistudio/copilot_image_1792451659480_332fafeb.jpeg',
    arenaName: 'Amazon HQ — Seattle Spheres',
    arenaLocation: 'Seattle, WA',
    arenaDescription: 'Biophilic glass geodesic spheres illuminated by orange logistics holograms and orbital fulfillment drones.',
    tutorialFocus: 'Timing fundamentals, wind-up count selection, and isometric chin bracing.',
    armorName: 'Prime Logistics Exosuit',
    armorDescription: 'Amazon blue-orange heavy composite armor with glowing fulfillment rings.',
    primaryColor: '#0F172A',
    secondaryColor: '#1E3A8A',
    accentColor: '#FF9900',
    skinTone: '#E8B89A',
    hairColor: '#D1D5DB',
    hasGlasses: false,
    isBald: true,
    stats: {
      power: 82,
      chinDurability: 78,
      precision: 91,
      windUpSpeed: 84,
      koResistance: 80,
    },
    specialName: 'Prime Delivery',
    specialDescription: 'Same-day kinetic dispatch: widens sweet-spot precision timing window by 25% and accelerates recovery.',
    specialEffectType: 'COOLDOWN_PRECISION',
    movementVariationName: 'Logistics-Precision Stance',
    movementVariationDesc: 'Measured supply-chain weight transfer with zero wasted motion on step-in.',
    a2aPersonality: 'Logistics-Optimized Timing',
    a2aEmotionalTrait: 'Methodical & relentless',
    preferredWindUp: 2,
    preferredAngle: 'MID_CHEEK',
    tauntQuote: 'Your knockout is out for same-day delivery, no signature required.',
    victoryQuote: 'Fulfilled on schedule. Customer satisfaction guaranteed.',
  },
  {
    id: 'altman',
    name: 'Sam Altman',
    company: 'OpenAI',
    title: 'The AGI Architect',
    storyChapter: 2,
    imageUrl: '/assets/aistudio/copilot_image_1792451395163_2b014c41.jpeg',
    arenaName: 'OpenAI HQ — San Francisco AI Lab',
    arenaLocation: 'San Francisco, CA',
    arenaDescription: 'Obsidian neural compute vault surrounded by pulsing violet hologram matrices and alignment monoliths.',
    tutorialFocus: 'Precision training, jawline angle control, and reading wind-up cues.',
    armorName: 'Frontier Alignment Suit',
    armorDescription: 'OpenAI matte-black tactical armor threaded with violet neural glow conduits.',
    primaryColor: '#111827',
    secondaryColor: '#311042',
    accentColor: '#A855F7',
    skinTone: '#F1C6A7',
    hairColor: '#374151',
    hasGlasses: false,
    stats: {
      power: 76,
      chinDurability: 70,
      precision: 98,
      windUpSpeed: 79,
      koResistance: 74,
    },
    specialName: 'Predictive Strike',
    specialDescription: 'AI-optimized slap trajectory that bypasses partial chin braces for +22% angle multiplier.',
    specialEffectType: 'ANGLE_OPTIMIZE',
    movementVariationName: 'Predictive Dodge Micro-Movements',
    movementVariationDesc: 'Subtle pre-impact neck tensioning calibrated from 10 trillion simulated slaps.',
    a2aPersonality: 'Analytical Precision',
    a2aEmotionalTrait: 'Calmly calculating',
    preferredWindUp: 1,
    preferredAngle: 'JAWLINE_LEVER',
    tauntQuote: 'My model already simulated this round ten million times. You go down on count two.',
    victoryQuote: 'Scaling laws undefeated. Compute wins again.',
  },
  {
    id: 'musk',
    name: 'Elon Musk',
    company: 'SpaceX',
    title: 'The Starship Striker',
    storyChapter: 3,
    imageUrl: '/assets/aistudio/copilot_image_1792451100879_0404d320.jpeg',
    arenaName: 'SpaceX HQ — Hawthorne Rocket Hangar',
    arenaLocation: 'Hawthorne, CA',
    arenaDescription: 'Towering stainless-steel booster bay bathed in blue Raptor plasma thrusters and orbital telemetry.',
    tutorialFocus: 'High-speed wind-ups, rotational hip torque boosts, and enduring heavy power strikes.',
    armorName: 'Starship Raptor Exosuit',
    armorDescription: 'SpaceX black-blue orbital exosuit with ionized blue plasma thruster vents.',
    primaryColor: '#090D16',
    secondaryColor: '#1E293B',
    accentColor: '#38BDF8',
    skinTone: '#ECC3A5',
    hairColor: '#3B2314',
    hasGlasses: false,
    stats: {
      power: 95,
      chinDurability: 88,
      precision: 72,
      windUpSpeed: 90,
      koResistance: 92,
    },
    specialName: 'Falcon Boost',
    specialDescription: 'Ignites shoulder actuators during wind-up for +28% rotational torque and orbital knockback.',
    specialEffectType: 'TORQUE_BOOST',
    movementVariationName: 'Low-Gravity Sway',
    movementVariationDesc: 'Heavy upper-body pendulum wind-up that generates massive delta-v on impact.',
    a2aPersonality: 'Aggressive Confidence',
    a2aEmotionalTrait: 'Gets cocky & swings for max-torque KOs',
    preferredWindUp: 3,
    preferredAngle: 'JAWLINE_LEVER',
    tauntQuote: 'Taking your jawline to Mars—rapid unscheduled disassembly incoming.',
    victoryQuote: 'Nominal orbital insertion. First stage landed right on your cheek.',
  },
  {
    id: 'huang',
    name: 'Jensen Huang',
    company: 'NVIDIA',
    title: 'The Tensor Titan',
    storyChapter: 4,
    imageUrl: '/assets/aistudio/copilot_image_1792451219128_054e2eb0.jpeg',
    arenaName: 'NVIDIA HQ — Santa Clara GPU Cathedral',
    arenaLocation: 'Santa Clara, CA',
    arenaDescription: 'Triangular silicon basilica lit by neon-green tensor cores and ray-traced reflection pillars.',
    tutorialFocus: 'Reaction timing, GPU-speed counter-bracing, and overclocked power spikes.',
    armorName: 'Blackwell Leather Armor',
    armorDescription: 'Signature black leather moto-armor etched with glowing neon-green CUDA circuitry.',
    primaryColor: '#0A0A0A',
    secondaryColor: '#1F2937',
    accentColor: '#76B900',
    skinTone: '#E5B895',
    hairColor: '#9CA3AF',
    hasGlasses: true,
    hasJacketCollar: true,
    stats: {
      power: 89,
      chinDurability: 85,
      precision: 88,
      windUpSpeed: 83,
      koResistance: 87,
    },
    specialName: 'GPU Overclock',
    specialDescription: 'Spools tensor cores to 1000W, boosting arm speed and raw slap force by +24%.',
    specialEffectType: 'POWER_SPIKE',
    movementVariationName: 'GPU-Powered Motion Blur',
    movementVariationDesc: 'Frame-generated acceleration that snaps the palm forward at 240Hz.',
    a2aPersonality: 'GPU-Speed Reactions',
    a2aEmotionalTrait: 'Hyper-responsive & charismatic',
    preferredWindUp: 2,
    preferredAngle: 'MID_CHEEK',
    tauntQuote: 'The more you slap, the more you save—except your chin has zero VRAM left.',
    victoryQuote: 'Full path-traced knockout at 120 frames per second.',
  },
  {
    id: 'zuckerberg',
    name: 'Mark Zuckerberg',
    company: 'Meta',
    title: 'The Metaverse MMA Tactician',
    storyChapter: 5,
    imageUrl: '/assets/aistudio/copilot_image_1792450973938_5cbbfc5d.jpeg',
    arenaName: 'Meta HQ — Menlo Park Metaverse Chamber',
    arenaLocation: 'Menlo Park, CA',
    arenaDescription: 'Infinite horizon wireframe sanctuary with shifting blue digital mesh domes and spatial avatars.',
    tutorialFocus: 'Recoil control, stance stability, and neutralizing defensive phase-shifts.',
    armorName: 'Horizon Haptic Mesh Suit',
    armorDescription: 'Meta black-blue digital mesh armor with low-latency kinetic dampening.',
    primaryColor: '#0B132B',
    secondaryColor: '#1C2541',
    accentColor: '#0668E1',
    skinTone: '#F5CBA7',
    hairColor: '#9A5B32',
    hasGlasses: false,
    stats: {
      power: 80,
      chinDurability: 82,
      precision: 86,
      windUpSpeed: 78,
      koResistance: 81,
    },
    specialName: 'Metaverse Phase-Shift',
    specialDescription: 'Digitizes neck posture on impact, cutting head-whip recoil and incoming damage by 25%.',
    specialEffectType: 'REDUCED_RECOIL',
    movementVariationName: 'VR-Smooth Interpolation',
    movementVariationDesc: 'Uncanny, zero-jitter kinematic stance that never telegraphs wind-up depth.',
    a2aPersonality: 'Robotic Consistency',
    a2aEmotionalTrait: 'Unblinking & jiu-jitsu conditioned',
    preferredWindUp: 2,
    preferredAngle: 'HIGH_TEMPLE',
    tauntQuote: 'I have been training open-palm strikes in the Octagon and the Metaverse.',
    victoryQuote: 'Connection established. Your avatar has been logged out.',
  },
  {
    id: 'ellison',
    name: 'Larry Ellison',
    company: 'Oracle',
    title: 'The Database Shogun',
    storyChapter: 6,
    imageUrl: '/assets/aistudio/copilot_image_1792451783599_b0a631cb.jpeg',
    arenaName: 'Oracle HQ — Austin Data Tower Arena',
    arenaLocation: 'Austin, TX',
    arenaDescription: 'Crimson-and-white fortress flanked by monolithic SQL server spires and high-voltage laser beams.',
    tutorialFocus: 'Breaking heavy armor defense and surviving high-mass power slaps.',
    armorName: 'Autonomous Red Samurai Plate',
    armorDescription: 'Oracle red-white heavy titanium armor pulsing with database energy cores.',
    primaryColor: '#7F1D1D',
    secondaryColor: '#F8FAFC',
    accentColor: '#EF4444',
    skinTone: '#DEB08B',
    hairColor: '#4B5563',
    hasGlasses: false,
    stats: {
      power: 92,
      chinDurability: 90,
      precision: 75,
      windUpSpeed: 77,
      koResistance: 89,
    },
    specialName: 'Red Armor Pulse',
    specialDescription: 'Locks cervical armor plates to fortify chin durability by +30% and counter-shock the striker.',
    specialEffectType: 'CHIN_BRACE_BOOST',
    movementVariationName: 'Heavy Armor Recoil',
    movementVariationDesc: 'Immovable planted boots with devastating high-mass shoulder follow-through.',
    a2aPersonality: 'Heavy Armor Aggression',
    a2aEmotionalTrait: 'Ruthless & aggressive',
    preferredWindUp: 3,
    preferredAngle: 'JAWLINE_LEVER',
    tauntQuote: 'Your chin license has expired, and the renewal fee is a full-force three-count.',
    victoryQuote: 'Query executed: zero rows of consciousness remaining.',
  },
  {
    id: 'amodei',
    name: 'Dario Amodei',
    company: 'Anthropic',
    title: 'The Constitutional Guardian',
    storyChapter: 7,
    imageUrl: '/assets/aistudio/copilot_image_1792451526508_58cd772b.jpeg',
    arenaName: 'Anthropic HQ — SF Constitutional Safety Lab',
    arenaLocation: 'San Francisco, CA',
    arenaDescription: 'Serene architectural sanctum of warm white-gold marble and a levitating golden swirl core.',
    tutorialFocus: 'Overcoming safety-protocol damage reduction through pinpoint precision timing.',
    armorName: 'Claude Constitutional Aegis',
    armorDescription: 'White-gold ceramic armor housing a harmonic golden swirl core on the sternum.',
    primaryColor: '#F3F4F6',
    secondaryColor: '#292524',
    accentColor: '#D97706',
    skinTone: '#EBC2A4',
    hairColor: '#1F2937',
    hasGlasses: true,
    stats: {
      power: 70,
      chinDurability: 76,
      precision: 94,
      windUpSpeed: 73,
      koResistance: 78,
    },
    specialName: 'Safety Protocol',
    specialDescription: 'Constitutional kinetic damping field absorbs 28% of raw slap force and prevents critical KOs.',
    specialEffectType: 'DAMAGE_REDUCTION',
    movementVariationName: 'Safety-Optimized Brace',
    movementVariationDesc: 'Perfectly aligned cervical posture that dissipates rotational acceleration safely.',
    a2aPersonality: 'Safety-Optimized Defense',
    a2aEmotionalTrait: 'Thoughtful, measured, & surgical',
    preferredWindUp: 1,
    preferredAngle: 'MID_CHEEK',
    tauntQuote: 'I must politely inform you that this upcoming strike is both helpful and harmless—to me.',
    victoryQuote: 'Aligned, calibrated, and safely resolved within constitutional bounds.',
  },
  {
    id: 'pichai',
    name: 'Sundar Pichai',
    company: 'Google',
    title: 'The Quantum Search Sovereign',
    storyChapter: 8,
    imageUrl: '/assets/aistudio/copilot_image_1792455238828_a8b8d1d9.jpeg',
    arenaName: 'Google HQ — Mountain View Rainbow Campus',
    arenaLocation: 'Mountain View, CA',
    arenaDescription: 'Solar-canopy amphitheater glowing with four-color holographic arches and quantum processor rings.',
    tutorialFocus: 'Precision combos, multi-spectrum angle shifts, and high-velocity recovery.',
    armorName: 'DeepMind Quantum Suit',
    armorDescription: 'Google blue-white tailored armor with a prismatic rainbow hologram chest core.',
    primaryColor: '#1E3A8A',
    secondaryColor: '#F8FAFC',
    accentColor: '#3B82F6',
    skinTone: '#C68B59',
    hairColor: '#1F2937',
    hasGlasses: true,
    stats: {
      power: 78,
      chinDurability: 79,
      precision: 90,
      windUpSpeed: 82,
      koResistance: 80,
    },
    specialName: 'Rainbow Algorithm',
    specialDescription: 'Indexes the exact mandibular weak point for +20% precision and prismatic shockwave trauma.',
    specialEffectType: 'RAINBOW_PRECISION',
    movementVariationName: 'Rainbow-Trail Motion',
    movementVariationDesc: 'Fluid four-spectrum palm arc that masks the final strike plane until contact.',
    a2aPersonality: 'Rainbow-Trail Finesse',
    a2aEmotionalTrait: 'Composed & algorithmically adaptive',
    preferredWindUp: 2,
    preferredAngle: 'HIGH_TEMPLE',
    tauntQuote: 'I indexed ten billion slap techniques in 0.04 seconds. Here is the top result.',
    victoryQuote: 'Search complete: zero defensive answers found.',
  },
  {
    id: 'nadella',
    name: 'Satya Nadella',
    company: 'Microsoft',
    title: 'The Azure Cloud Emperor',
    storyChapter: 9,
    imageUrl: '/assets/aistudio/copilot_image_1792455896016_69fa6f59.jpeg',
    arenaName: 'Microsoft HQ — Redmond Cloud Arena',
    arenaLocation: 'Redmond, WA',
    arenaDescription: 'Sky-high hyperscale data citadel suspended inside electric blue-gray storm clouds.',
    tutorialFocus: 'Enduring force multipliers and mastering complete Power Slap biomechanics.',
    armorName: 'Azure Hyperscale Plate',
    armorDescription: 'Microsoft black-gray titanium armor emblazoned with a luminous four-pane Windows emblem.',
    primaryColor: '#1E293B',
    secondaryColor: '#0F172A',
    accentColor: '#00A4EF',
    skinTone: '#CFA17B',
    hairColor: '#D1D5DB',
    hasGlasses: true,
    isBald: true,
    stats: {
      power: 85,
      chinDurability: 84,
      precision: 87,
      windUpSpeed: 81,
      koResistance: 86,
    },
    specialName: 'Cloud Surge',
    specialDescription: 'Offloads kinetic computation to Azure clusters, applying a 1.25x SlapForce multiplier.',
    specialEffectType: 'FORCE_MULTIPLIER',
    movementVariationName: 'Cloud-Softened Impacts',
    movementVariationDesc: 'Distributed shock absorption across the shoulder girdle with explosive enterprise counter-force.',
    a2aPersonality: 'Cloud-Softened Impacts',
    a2aEmotionalTrait: 'Empathetic focus with enterprise power',
    preferredWindUp: 2,
    preferredAngle: 'JAWLINE_LEVER',
    tauntQuote: 'Growth mindset means learning from every slap—starting with the one you are about to absorb.',
    victoryQuote: 'Enterprise-grade uptime. Your chin just hit a blue screen.',
  },
  {
    id: 'gates',
    name: 'Bill Gates',
    company: 'Classic Microsoft',
    title: 'The Architect of Silicon (Final Boss)',
    storyChapter: 10,
    imageUrl: '/assets/aistudio/copilot_image_1792456644401_3415d261.jpeg',
    arenaName: 'Classic Microsoft HQ — Retro Windows Grid Chamber',
    arenaLocation: 'Redmond Vault 1995',
    arenaDescription: 'Synth-grid cyber chamber pulsing with 32-bit cyan-blue vector horizons and floating pixel monoliths.',
    tutorialFocus: 'Final Championship Bout: Defeat the Final Boss to unlock the Smack Daddy Champion Golden Armor.',
    armorName: 'Windows 95 Executive Grid Armor',
    armorDescription: 'Classic Microsoft royal-blue executive armor surrounded by a shimmering light-grid aura.',
    primaryColor: '#1D4ED8',
    secondaryColor: '#1E1B4B',
    accentColor: '#22D3EE',
    skinTone: '#F1C6A7',
    hairColor: '#9CA3AF',
    hasGlasses: true,
    stats: {
      power: 74,
      chinDurability: 72,
      precision: 89,
      windUpSpeed: 75,
      koResistance: 73,
    },
    specialName: 'Retro Debug',
    specialDescription: 'Triggers a system interrupt that drops opponent precision by 20% and unleashes a pixel-burst KO wave.',
    specialEffectType: 'RETRO_DEBUG',
    movementVariationName: 'Retro Pixel-Burst Recoil',
    movementVariationDesc: 'Voxelized kinetic dispersion combined with classic chair-jumping agility.',
    a2aPersonality: 'Nostalgic Grandmaster',
    a2aEmotionalTrait: 'Gets nostalgic & exploits system bugs',
    preferredWindUp: 3,
    preferredAngle: 'JAWLINE_LEVER',
    tauntQuote: '640 kilobytes of slap force ought to be enough for anybody.',
    victoryQuote: 'Fatal Exception 0E has occurred at your mandible. Press any key to reboot.',
  },
];

export interface StoryUpgrade {
  chapterUnlocked: number;
  name: string;
  description: string;
  powerBonus: number;
  chinBonus: number;
  precisionBonus: number;
  koResBonus: number;
}

export const STORY_UPGRADES: StoryUpgrade[] = [
  {
    chapterUnlocked: 1,
    name: 'Standard Contender Exo-Frame',
    description: 'Baseline titanium-weave slap-fighting rig.',
    powerBonus: 0,
    chinBonus: 0,
    precisionBonus: 0,
    koResBonus: 0,
  },
  {
    chapterUnlocked: 2,
    name: 'Prime Servo Wrist Actuators',
    description: 'Unlocked after defeating Jeff Bezos. +3 Power, +3 Precision.',
    powerBonus: 3,
    chinBonus: 0,
    precisionBonus: 3,
    koResBonus: 2,
  },
  {
    chapterUnlocked: 3,
    name: 'Neural Trajectory Visor',
    description: 'Unlocked after defeating Sam Altman. +5 Precision, +3 Chin Durability.',
    powerBonus: 4,
    chinBonus: 3,
    precisionBonus: 6,
    koResBonus: 4,
  },
  {
    chapterUnlocked: 4,
    name: 'Raptor Torque Pauldrons',
    description: 'Unlocked after defeating Elon Musk. +7 Power, +5 KO Resistance.',
    powerBonus: 7,
    chinBonus: 5,
    precisionBonus: 7,
    koResBonus: 6,
  },
  {
    chapterUnlocked: 5,
    name: 'CUDA Overclocked Gauntlets',
    description: 'Unlocked after defeating Jensen Huang. +9 Power, +9 Precision.',
    powerBonus: 9,
    chinBonus: 7,
    precisionBonus: 9,
    koResBonus: 8,
  },
  {
    chapterUnlocked: 6,
    name: 'Haptic Neck Stabilizer',
    description: 'Unlocked after defeating Mark Zuckerberg. +10 Chin Durability, +10 KO Resistance.',
    powerBonus: 10,
    chinBonus: 10,
    precisionBonus: 10,
    koResBonus: 10,
  },
  {
    chapterUnlocked: 7,
    name: 'Autonomous Crimson Chestplate',
    description: 'Unlocked after defeating Larry Ellison. +12 Power, +12 Chin Durability.',
    powerBonus: 12,
    chinBonus: 12,
    precisionBonus: 11,
    koResBonus: 12,
  },
  {
    chapterUnlocked: 8,
    name: 'Constitutional Harmonic Core',
    description: 'Unlocked after defeating Dario Amodei. +14 Chin Durability, +14 KO Resistance.',
    powerBonus: 13,
    chinBonus: 14,
    precisionBonus: 13,
    koResBonus: 14,
  },
  {
    chapterUnlocked: 9,
    name: 'Quantum Prism Knuckle Guards',
    description: 'Unlocked after defeating Sundar Pichai. +15 Power, +16 Precision.',
    powerBonus: 15,
    chinBonus: 15,
    precisionBonus: 16,
    koResBonus: 15,
  },
  {
    chapterUnlocked: 10,
    name: 'Azure Cloud Titan Harness',
    description: 'Unlocked after defeating Satya Nadella. +17 All Attributes.',
    powerBonus: 17,
    chinBonus: 17,
    precisionBonus: 17,
    koResBonus: 17,
  },
  {
    chapterUnlocked: 11,
    name: 'Smack Daddy Champion Golden Armor',
    description: 'Ultimate unlock for defeating Bill Gates! Golden slap aura & Titan-tier KO cinematics (+22 All Stats).',
    powerBonus: 22,
    chinBonus: 22,
    precisionBonus: 22,
    koResBonus: 22,
  },
];
