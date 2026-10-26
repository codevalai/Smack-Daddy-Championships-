import {
  FighterProfile,
  FighterStats,
  KO_TYPE_DEFINITIONS,
  KOType,
  SlapAngle,
  WindUpCount,
} from '../data/fighters';

export interface SlapCalculationInput {
  striker: FighterProfile;
  strikerEffectiveStats: FighterStats;
  defender: FighterProfile;
  defenderEffectiveStats: FighterStats;
  windUpCount: WindUpCount; // 1, 2, or 3
  slapAngle: SlapAngle; // 'HIGH_TEMPLE' | 'MID_CHEEK' | 'JAWLINE_LEVER'
  strikerPrecisionMeter: number; // 0.0 to 1.0 (1.0 = dead center sweet spot)
  defenderBraceMeter: number; // 0.0 to 1.0 (1.0 = perfect isometric neck/chin brace)
  strikerFatigue: number; // 0 to 100
  defenderFatigue: number; // 0 to 100
  defenderPreviousHits: number;
  strikerSpecialActive: boolean;
  defenderSpecialActive: boolean;
  defenderRemainingHP: number;
  strikerComebackForceBonus?: number;
  defenderComebackBraceBonus?: number;
}

export interface SlapCalculationResult {
  armSpeed: number;
  mass: number;
  torque: number;
  precisionMultiplier: number;
  slapForce: number;
  chinWeakness: number;
  angleModifier: number;
  rawDamage: number;
  finalDamage: number;
  effectiveKOResistance: number;
  overkillRatio: number;
  isKO: boolean;
  koType: KOType;
  isCriticalSlap: boolean;
  recoilIntensity: number; // 0.1 to 1.5
  headWhipRadians: number;
  footSlideMeters: number;
  breakdownFormulaText: string;
  commentaryLine: string;
}

export function calculateSlapPhysics(
  input: SlapCalculationInput
): SlapCalculationResult {
  const {
    striker,
    strikerEffectiveStats,
    defender,
    defenderEffectiveStats,
    windUpCount,
    slapAngle,
    strikerPrecisionMeter,
    defenderBraceMeter,
    strikerFatigue,
    defenderFatigue,
    defenderPreviousHits,
    strikerSpecialActive,
    defenderSpecialActive,
    defenderRemainingHP,
    strikerComebackForceBonus = 0,
    defenderComebackBraceBonus = 0,
  } = input;

  // 1. Effective Precision calculation (Retro Debug drops opponent precision)
  let effectiveMeter = strikerPrecisionMeter;
  if (
    defenderSpecialActive &&
    defender.specialEffectType === 'RETRO_DEBUG'
  ) {
    effectiveMeter = Math.max(0.25, effectiveMeter - 0.16);
  }
  if (
    strikerSpecialActive &&
    (striker.specialEffectType === 'COOLDOWN_PRECISION' ||
      striker.specialEffectType === 'RAINBOW_PRECISION')
  ) {
    effectiveMeter = Math.min(1.0, effectiveMeter + 0.15);
  }

  // 2. ArmSpeed, Mass, Torque
  const fatiguePenalty = 1 - Math.min(0.35, strikerFatigue * 0.0035);
  let armSpeed =
    (strikerEffectiveStats.windUpSpeed / 85) *
    (0.88 + effectiveMeter * 0.24) *
    fatiguePenalty;

  const mass = (strikerEffectiveStats.power / 85) * 4.4;

  // Wind-up count ("On 1", "On 2", "On 3") directly scales shoulder & hip rotational torque
  const windUpTorqueScale =
    windUpCount === 1 ? 0.88 : windUpCount === 2 ? 1.05 : 1.24;
  let torque =
    (strikerEffectiveStats.power / 82) * windUpTorqueScale * 4.85;

  if (strikerSpecialActive) {
    if (striker.specialEffectType === 'TORQUE_BOOST') {
      torque *= 1.28;
    } else if (striker.specialEffectType === 'POWER_SPIKE') {
      armSpeed *= 1.24;
    }
  }

  const statPrecisionFactor =
    0.85 + (strikerEffectiveStats.precision / 100) * 0.25;
  const precisionMultiplier =
    (0.68 + Math.pow(effectiveMeter, 1.35) * 0.68) * statPrecisionFactor;

  // CORE FORMULA 1: SlapForce = (ArmSpeed × Mass × Torque) × PrecisionMultiplier
  let slapForce = armSpeed * mass * torque * precisionMultiplier * 3.85;

  if (
    strikerSpecialActive &&
    striker.specialEffectType === 'FORCE_MULTIPLIER'
  ) {
    slapForce *= 1.25;
  }
  if (strikerComebackForceBonus > 0) {
    slapForce *= 1 + strikerComebackForceBonus;
  }

  // 3. ChinWeakness & AngleModifier
  let braceEfficiency =
    defenderBraceMeter * 0.36 + defenderComebackBraceBonus;
  if (
    defenderSpecialActive &&
    defender.specialEffectType === 'CHIN_BRACE_BOOST'
  ) {
    braceEfficiency += 0.24;
  }
  if (
    defenderSpecialActive &&
    defender.specialEffectType === 'REDUCED_RECOIL'
  ) {
    braceEfficiency += 0.18;
  }

  const cumulativeWear =
    1 + defenderPreviousHits * 0.085 + defenderFatigue * 0.003;
  const baseChinVulnerability =
    100 / Math.max(45, defenderEffectiveStats.chinDurability);
  const chinWeakness = Math.max(
    0.42,
    baseChinVulnerability * cumulativeWear * (1 - Math.min(0.65, braceEfficiency))
  );

  let angleModifier = 1.0;
  if (slapAngle === 'MID_CHEEK') {
    angleModifier = 1.02;
  } else if (slapAngle === 'JAWLINE_LEVER') {
    angleModifier = effectiveMeter >= 0.64 ? 1.25 : 0.86;
  } else if (slapAngle === 'HIGH_TEMPLE') {
    angleModifier = effectiveMeter >= 0.7 ? 1.19 : 0.82;
  }

  if (
    strikerSpecialActive &&
    striker.specialEffectType === 'ANGLE_OPTIMIZE'
  ) {
    angleModifier *= 1.2;
  }

  // CORE FORMULA 2: Damage = SlapForce × (ChinWeakness × AngleModifier)
  const rawDamage = slapForce * (chinWeakness * angleModifier) * 0.74;
  let finalDamage = rawDamage;

  if (
    defenderSpecialActive &&
    defender.specialEffectType === 'DAMAGE_REDUCTION'
  ) {
    finalDamage *= 0.72;
  }

  // Effective KO Resistance degrades with accumulated hits, fatigue, and low HP
  const hpDegradation =
    defenderRemainingHP < 50 ? (50 - defenderRemainingHP) * 0.28 : 0;
  const wearPenalty =
    defenderPreviousHits * 6.0 + defenderFatigue * 0.35 + hpDegradation;
  const effectiveKOResistance = Math.max(
    26,
    defenderEffectiveStats.koResistance - wearPenalty
  );

  // CORE FORMULA 3: Knockout Threshold & Distinct KO Type Classification
  const projectedHP = defenderRemainingHP - finalDamage * 0.85;
  const overkillRatio = finalDamage / effectiveKOResistance;
  const isKO = finalDamage >= effectiveKOResistance || projectedHP <= 0;
  const isCriticalSlap =
    effectiveMeter >= 0.9 && finalDamage >= effectiveKOResistance * 0.75;

  let koType: KOType = 'NONE';
  if (isKO) {
    if (
      overkillRatio >= 1.28 ||
      (effectiveMeter >= 0.9 &&
        slapAngle === 'JAWLINE_LEVER' &&
        overkillRatio >= 1.05)
    ) {
      koType = 'CRITICAL_KO';
    } else if (
      slapAngle === 'HIGH_TEMPLE' ||
      (defenderFatigue >= 35 && overkillRatio < 1.18)
    ) {
      koType = 'STAGGER_KO';
    } else if (overkillRatio >= 1.15) {
      koType = 'CLEAN_KO';
    } else {
      koType = 'DELAYED_KO';
    }
  }

  const recoilIntensity = Math.min(1.5, Math.max(0.2, finalDamage / 62));
  const headWhipRadians = Math.min(1.38, 0.32 + recoilIntensity * 0.76);
  const footSlideMeters = Math.min(
    0.88,
    Math.max(0.05, (finalDamage - 28) * 0.0115)
  );

  const breakdownFormulaText = `Force ${slapForce.toFixed(1)} = (${armSpeed.toFixed(
    2
  )} spd × ${mass.toFixed(1)} mass × ${torque.toFixed(
    1
  )} trq) × ${precisionMultiplier.toFixed(2)} prec | Dmg ${finalDamage.toFixed(
    1
  )} vs KO Threshold ${effectiveKOResistance.toFixed(1)}`;

  let commentaryLine = `${striker.name} lands a ${windUpCount}-count strike to the ${slapAngle
    .replace('_', ' ')
    .toLowerCase()} for ${finalDamage.toFixed(0)} impact damage!`;

  if (isKO && koType !== 'NONE') {
    const koDef = KO_TYPE_DEFINITIONS[koType];
    commentaryLine = `${koDef.name.toUpperCase()}! ${striker.name} inflicts ${finalDamage.toFixed(
      0
    )} damage (Threshold: ${effectiveKOResistance.toFixed(
      0
    )}) — ${defender.name} must beat the 10-Count Recovery Mini-Game or lose the round!`;
  } else if (defenderBraceMeter >= 0.85) {
    commentaryLine = `IRON NECK BRACE! ${defender.name} absorbs ${striker.name}'s ${windUpCount}-count slap with textbook isometric resistance!`;
  } else if (isCriticalSlap) {
    commentaryLine = `HEAVY WHIPLASH! ${striker.name} connects flush on the sweet spot (${finalDamage.toFixed(
      0
    )} dmg)—${defender.name} is visibly staggered!`;
  }

  return {
    armSpeed,
    mass,
    torque,
    precisionMultiplier,
    slapForce,
    chinWeakness,
    angleModifier,
    rawDamage,
    finalDamage,
    effectiveKOResistance,
    overkillRatio,
    isKO,
    koType,
    isCriticalSlap,
    recoilIntensity,
    headWhipRadians,
    footSlideMeters,
    breakdownFormulaText,
    commentaryLine,
  };
}

// ============================================================================
// A2A (AGENT-TO-AGENT) MOVEMENT INTELLIGENCE, BEHAVIOR TREE & KO RECOVERY AI
// ============================================================================

export interface AgentMemory {
  observedOpponentWindUps: WindUpCount[];
  observedOpponentAngles: SlapAngle[];
  roundsElapsed: number;
  knockdownsSufferedThisRound: number;
  confidenceState:
    | 'COMPOSED'
    | 'AGGRESSIVE'
    | 'ANALYTICAL'
    | 'DESPERATE'
    | 'COCKY';
}

export interface AgentDecision {
  chosenWindUp: WindUpCount;
  chosenAngle: SlapAngle;
  predictedPrecision: number; // 0 to 1
  activateSpecial: boolean;
  behaviorNodePath: string;
  emotionalThought: string;
}

export function createInitialAgentMemory(fighter: FighterProfile): AgentMemory {
  let initialConfidence: AgentMemory['confidenceState'] = 'COMPOSED';
  if (fighter.id === 'musk') initialConfidence = 'COCKY';
  else if (fighter.id === 'ellison') initialConfidence = 'AGGRESSIVE';
  else if (fighter.id === 'altman' || fighter.id === 'pichai')
    initialConfidence = 'ANALYTICAL';

  return {
    observedOpponentWindUps: [],
    observedOpponentAngles: [],
    roundsElapsed: 0,
    knockdownsSufferedThisRound: 0,
    confidenceState: initialConfidence,
  };
}

export function evaluateA2AStrikeDecision(
  agent: FighterProfile,
  agentEffectiveStats: FighterStats,
  opponent: FighterProfile,
  opponentEffectiveStats: FighterStats,
  agentHP: number,
  opponentHP: number,
  opponentPreviousHits: number,
  specialReady: boolean,
  memory: AgentMemory
): AgentDecision {
  const opponentEstimatedKORes = Math.max(
    28,
    opponentEffectiveStats.koResistance - opponentPreviousHits * 6.0
  );
  const canAttemptKO = opponentEstimatedKORes <= 72 || opponentHP <= 52;

  let chosenWindUp: WindUpCount = agent.preferredWindUp;
  let chosenAngle: SlapAngle = agent.preferredAngle;
  let behaviorNodePath = 'Root → StanceEval → StandardPattern';

  if (canAttemptKO) {
    chosenWindUp = 3;
    chosenAngle = 'JAWLINE_LEVER';
    behaviorNodePath = 'Root → KOAttemptLogic → MaxTorqueJawline';
  } else if (memory.observedOpponentAngles.length >= 2) {
    const lastAngle =
      memory.observedOpponentAngles[memory.observedOpponentAngles.length - 1];
    chosenAngle =
      lastAngle === 'JAWLINE_LEVER'
        ? 'HIGH_TEMPLE'
        : lastAngle === 'HIGH_TEMPLE'
        ? 'MID_CHEEK'
        : 'JAWLINE_LEVER';
    behaviorNodePath = 'Root → AdaptiveLearning → CounterAngleShift';
  }

  const baseSkill = agentEffectiveStats.precision / 100;
  const variance = (Math.random() - 0.36) * 0.22;
  const predictedPrecision = Math.min(
    0.99,
    Math.max(0.56, baseSkill * 0.92 + variance)
  );

  const activateSpecial =
    specialReady && (canAttemptKO || memory.roundsElapsed >= 1 || agentHP < 65);

  const emotionalThoughts: Record<string, string> = {
    musk: `Calculating orbital delta-v (${chosenWindUp}-count torque) for ${opponent.name}'s jaw.`,
    altman: `Inference complete: ${chosenAngle.replace('_', ' ')} yields 94.2% knockout probability.`,
    huang: `Tensor cores locked on ${opponent.name}'s chin at 240 FPS.`,
    bezos: `Route optimized: ${chosenWindUp}-count Prime strike scheduled for immediate arrival.`,
    zuckerberg: `Kinematic mesh calibrated. Executing ${chosenAngle.replace('_', ' ')} vector.`,
    ellison: `Full titanium shoulder torque engaged—querying knockout threshold.`,
    amodei: `Constitutional check passed: applying measured ${chosenWindUp}-count corrective force.`,
    pichai: `DeepMind policy network selected ${chosenAngle.replace('_', ' ')} trajectory.`,
    nadella: `Scaling Azure kinetic cluster for ${chosenWindUp}-count enterprise strike.`,
    gates: `Executing interrupt 0x21 on ${opponent.name}'s defensive posture.`,
  };

  return {
    chosenWindUp,
    chosenAngle,
    predictedPrecision,
    activateSpecial,
    behaviorNodePath,
    emotionalThought:
      emotionalThoughts[agent.id] ||
      `${agent.name} locks onto ${chosenAngle.replace('_', ' ')}.`,
  };
}

export function evaluateA2ADefenseBrace(
  defender: FighterProfile,
  defenderEffectiveStats: FighterStats,
  incomingWindUp: WindUpCount,
  memory: AgentMemory
): { braceQuality: number; defenseThought: string } {
  const matchingCount = memory.observedOpponentWindUps.filter(
    (w) => w === incomingWindUp
  ).length;
  const adaptiveBonus = Math.min(0.18, matchingCount * 0.07);
  const baseBrace = (defenderEffectiveStats.chinDurability / 100) * 0.78;
  const randomJitter = (Math.random() - 0.35) * 0.18;
  const braceQuality = Math.min(
    0.98,
    Math.max(0.42, baseBrace + adaptiveBonus + randomJitter)
  );

  return {
    braceQuality,
    defenseThought:
      matchingCount > 0
        ? `Pattern recognized ("On ${incomingWindUp}"): pre-tensing neck (+${Math.round(
            adaptiveBonus * 100
          )}% brace).`
        : `Bracing sternocleidomastoid for ${incomingWindUp}-count impact.`,
  };
}

/**
 * Evaluates an autonomous AI Agent's attempt at the 10-Count KO Recovery Timing Mini-Game.
 * Returns the cursor position (0..1) where the AI locks the needle and whether it landed inside the KO Type's recovery zone.
 */
export function evaluateA2AKORecoveryAttempt(
  downedFighter: FighterProfile,
  downedEffectiveStats: FighterStats,
  koType: Exclude<KOType, 'NONE'>,
  downedFatigue: number,
  knockdownsThisRound: number
): {
  lockedPosition: number;
  targetHalfWidth: number;
  succeeded: boolean;
  recoveryThought: string;
} {
  const koSpec = KO_TYPE_DEFINITIONS[koType];
  // Repeat knockdowns in the same round shrink the effective recovery window by 35%
  const penaltyScale = knockdownsThisRound > 0 ? 0.65 : 1.0;
  const effectiveWindowWidth = koSpec.recoveryWindowWidth * penaltyScale;
  const targetHalfWidth = effectiveWindowWidth / 2;

  // AI resilience determines how close to 0.50 center the agent locks the oscillating needle
  const resilienceScore =
    (downedEffectiveStats.koResistance * 0.55 +
      downedEffectiveStats.chinDurability * 0.45) /
    100;
  const fatigueSlip = (downedFatigue / 100) * 0.14;
  const maxError = Math.max(0.06, 0.32 - resilienceScore * 0.22 + fatigueSlip);
  const signedError = (Math.random() * 2 - 1) * maxError;
  const lockedPosition = Math.max(0.05, Math.min(0.95, 0.5 + signedError));
  const succeeded = Math.abs(lockedPosition - 0.5) <= targetHalfWidth;

  const recoveryThought = succeeded
    ? `${downedFighter.name} locked recovery needle at ${Math.round(
        lockedPosition * 100
      )}% inside the ±${Math.round(targetHalfWidth * 100)}% sweet-spot! Triggering ${
        koSpec.comebackBuffName
      }!`
    : `${downedFighter.name} missed the ${koSpec.name} recovery window (locked at ${Math.round(
        lockedPosition * 100
      )}%) — Round lost by KO!`;

  return {
    lockedPosition,
    targetHalfWidth,
    succeeded,
    recoveryThought,
  };
}
