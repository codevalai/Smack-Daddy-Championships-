/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  FIGHTERS,
  FighterProfile,
  FighterStats,
  KO_TYPE_DEFINITIONS,
  KOType,
  SlapAngle,
  STORY_UPGRADES,
  WindUpCount,
} from './data/fighters';
import {
  AgentMemory,
  calculateSlapPhysics,
  createInitialAgentMemory,
  evaluateA2ADefenseBrace,
  evaluateA2AKORecoveryAttempt,
  evaluateA2AStrikeDecision,
  SlapCalculationResult,
} from './engine/slapPhysics';
import { ArenaSceneController, CameraPreset } from './engine/ArenaScene3D';
import { soundEngine } from './engine/soundEffects';
import { FighterCodexModal } from './components/FighterCodexModal';
import { PhysicsSpecModal } from './components/PhysicsSpecModal';

type GameMode = 'STORY' | 'A2A';
type TurnPhase =
  | 'PLAYER_STRIKE_PREP'
  | 'PLAYER_STRIKE_METER'
  | 'PLAYER_DEFENSE_BRACE'
  | 'FAKEOUT_WINDOW'
  | 'A2A_THINKING'
  | 'WINDUP_ANIMATING'
  | 'IMPACT_RESOLUTION'
  | 'KO_RECOVERY_MINIGAME'
  | 'ROUND_TRANSITION'
  | 'MATCH_OVER';

export default function App() {
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneControllerRef = useRef<ArenaSceneController | null>(null);

  // Mode & UI State
  const [gameMode, setGameMode] = useState<GameMode>('STORY');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isCodexOpen, setIsCodexOpen] = useState<boolean>(false);
  const [isPhysicsModalOpen, setIsPhysicsModalOpen] = useState<boolean>(false);
  const [showContenderStrip, setShowContenderStrip] = useState<boolean>(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [failedPortraits, setFailedPortraits] = useState<Record<string, boolean>>({});
  const [cameraPreset, setCameraPreset] =
    useState<CameraPreset>('BROADCAST_WIDE');
  const [hudShake, setHudShake] = useState<boolean>(false);
  const [isKOReplayActive, setIsKOReplayActive] = useState<boolean>(false);
  const [impactPopupText, setImpactPopupText] = useState<string | null>(null);

  // Story Mode Progression State
  const [storyChapter, setStoryChapter] = useState<number>(6);
  const [unlockedChapter, setUnlockedChapter] = useState<number>(6);
  const [playerFighterId, setPlayerFighterId] = useState<string>('bezos');
  const [useGoldenArmor, setUseGoldenArmor] = useState<boolean>(false);

  // A2A Fighter Selection State
  const [a2aLeftId, setA2aLeftId] = useState<string>('bezos');
  const [a2aRightId, setA2aRightId] = useState<string>('ellison');
  const [a2aPaused, setA2aPaused] = useState<boolean>(false);
  const [a2aSpeed, setA2aSpeed] = useState<number>(1);

  // Match & Round Scoring State (Best of 3 Rounds)
  const [round, setRound] = useState<number>(1);
  const maxRounds = 3;
  const [arcadeCoins, setArcadeCoins] = useState<number>(3);
  const [roundTimerSeconds, setRoundTimerSeconds] = useState<number>(90);
  const [leftRoundsWon, setLeftRoundsWon] = useState<number>(0);
  const [rightRoundsWon, setRightRoundsWon] = useState<number>(0);
  const [strikerSide, setStrikerSide] = useState<'LEFT' | 'RIGHT'>('LEFT');
  const [turnPhase, setTurnPhase] = useState<TurnPhase>('PLAYER_STRIKE_METER');

  // Fighter Condition State
  const [leftHP, setLeftHP] = useState<number>(100);
  const [rightHP, setRightHP] = useState<number>(100);
  const [leftFatigue, setLeftFatigue] = useState<number>(0);
  const [rightFatigue, setRightFatigue] = useState<number>(0);
  const [leftHitsTaken, setLeftHitsTaken] = useState<number>(0);
  const [rightHitsTaken, setRightHitsTaken] = useState<number>(0);
  const [leftSpecialReady, setLeftSpecialReady] = useState<boolean>(true);
  const [rightSpecialReady, setRightSpecialReady] = useState<boolean>(true);
  const [leftSpecialActive, setLeftSpecialActive] = useState<boolean>(false);
  const [rightSpecialActive, setRightSpecialActive] = useState<boolean>(false);
  const [crowdHypePercent, setCrowdHypePercent] = useState<number>(72);

  // Comeback Buffs, Knockdown & Flinch State
  const [leftComebackForceBonus, setLeftComebackForceBonus] =
    useState<number>(0);
  const [rightComebackForceBonus, setRightComebackForceBonus] =
    useState<number>(0);
  const [leftComebackBraceBonus, setLeftComebackBraceBonus] =
    useState<number>(0);
  const [rightComebackBraceBonus, setRightComebackBraceBonus] =
    useState<number>(0);
  const [leftKnockdownsThisRound, setLeftKnockdownsThisRound] =
    useState<number>(0);
  const [rightKnockdownsThisRound, setRightKnockdownsThisRound] =
    useState<number>(0);
  const [downedSide, setDownedSide] = useState<'LEFT' | 'RIGHT'>('RIGHT');
  const [activeKOType, setActiveKOType] =
    useState<Exclude<KOType, 'NONE'>>('CLEAN_KO');
  const [tenCountSeconds, setTenCountSeconds] = useState<number>(10.0);
  const [holdSteadyTimeRemaining, setHoldSteadyTimeRemaining] = useState<number>(0.6);

  // Interactive Pre-Slap & Tap Mechanics State
  const [selectedWindUp, setSelectedWindUp] = useState<WindUpCount>(2);
  const [selectedAngle, setSelectedAngle] =
    useState<SlapAngle>('JAWLINE_LEVER');
  const [timingCursor, setTimingCursor] = useState<number>(0.5);
  const [practiceTapCount, setPracticeTapCount] = useState<number>(0);
  const [torqueCharge, setTorqueCharge] = useState<number>(0); // 0 to 1
  const [defenseTapBoost, setDefenseTapBoost] = useState<number>(0); // 0 to 0.32

  // Match Telemetry & A2A Readout
  const [lastSlapResult, setLastSlapResult] =
    useState<SlapCalculationResult | null>(null);
  const [statusBanner, setStatusBanner] = useState<string>(
    'Cheek Alignment Phase — Tap Cheek Target & Count to line up palm'
  );
  const [a2aThoughtText, setA2aThoughtText] = useState<string>(
    'Calibrating shoulder torque & cheek vector...'
  );
  const [matchWinner, setMatchWinner] = useState<
    'LEFT' | 'RIGHT' | 'DRAW' | null
  >(null);
  const [matchKOType, setMatchKOType] = useState<KOType>('NONE');

  // Agent Memory Refs
  const leftMemoryRef = useRef<AgentMemory>(
    createInitialAgentMemory(FIGHTERS[0])
  );
  const rightMemoryRef = useRef<AgentMemory>(
    createInitialAgentMemory(FIGHTERS[1])
  );

  // Resolve Active Left & Right Fighter Profiles
  const leftFighter: FighterProfile =
    gameMode === 'STORY'
      ? FIGHTERS.find((f) => f.id === playerFighterId) || FIGHTERS[1]
      : FIGHTERS.find((f) => f.id === a2aLeftId) || FIGHTERS[1];

  const rightFighter: FighterProfile =
    gameMode === 'STORY'
      ? FIGHTERS.find((f) => f.storyChapter === storyChapter) || FIGHTERS[0]
      : FIGHTERS.find((f) => f.id === a2aRightId) || FIGHTERS[2];

  // Calculate Effective Stats
  const getEffectiveStats = useCallback(
    (fighter: FighterProfile, side: 'LEFT' | 'RIGHT'): FighterStats => {
      if (gameMode === 'STORY' && side === 'LEFT') {
        const upgrade =
          STORY_UPGRADES.filter(
            (u) => u.chapterUnlocked <= unlockedChapter
          ).slice(-1)[0] || STORY_UPGRADES[0];
        return {
          power: Math.min(100, fighter.stats.power + upgrade.powerBonus),
          chinDurability: Math.min(
            100,
            fighter.stats.chinDurability + upgrade.chinBonus
          ),
          precision: Math.min(
            100,
            fighter.stats.precision + upgrade.precisionBonus
          ),
          windUpSpeed: fighter.stats.windUpSpeed,
          koResistance: Math.min(
            115,
            fighter.stats.koResistance + upgrade.koResBonus
          ),
        };
      }
      return fighter.stats;
    },
    [gameMode, unlockedChapter]
  );

  const leftEffectiveStats = getEffectiveStats(leftFighter, 'LEFT');
  const rightEffectiveStats = getEffectiveStats(rightFighter, 'RIGHT');

  // Initialize Three.js Scene
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const controller = new ArenaSceneController(canvasContainerRef.current);
    sceneControllerRef.current = controller;
    return () => {
      controller.dispose();
      sceneControllerRef.current = null;
    };
  }, []);

  // Sync 3D Fighters & HQ Arena Environment
  useEffect(() => {
    if (!sceneControllerRef.current) return;
    sceneControllerRef.current.setFighters(
      leftFighter,
      rightFighter,
      gameMode === 'STORY' && useGoldenArmor
    );
  }, [leftFighter, rightFighter, gameMode, useGoldenArmor]);

  // Sync Cheek Alignment in 3D Scene during Player Prep
  useEffect(() => {
    if (
      gameMode === 'STORY' &&
      turnPhase === 'PLAYER_STRIKE_PREP' &&
      strikerSide === 'LEFT'
    ) {
      sceneControllerRef.current?.triggerCheekLineUp(
        'LEFT',
        selectedWindUp,
        selectedAngle
      );
    }
  }, [gameMode, turnPhase, strikerSide, selectedWindUp, selectedAngle]);

  // Round Clock Timer
  useEffect(() => {
    if (turnPhase === 'MATCH_OVER' || turnPhase === 'ROUND_TRANSITION') return;
    const interval = window.setInterval(() => {
      setRoundTimerSeconds((prev) => (prev > 0 ? prev - 1 : 90));
    }, 1000);
    return () => clearInterval(interval);
  }, [turnPhase]);

  // Reset Match State
  const resetMatch = useCallback(
    (nextMode?: GameMode, nextChapter?: number) => {
      const activeMode = nextMode ?? gameMode;
      const activeChap = nextChapter ?? storyChapter;

      const lFighter =
        activeMode === 'STORY'
          ? FIGHTERS.find((f) => f.id === playerFighterId) || FIGHTERS[1]
          : FIGHTERS.find((f) => f.id === a2aLeftId) || FIGHTERS[1];
      const rFighter =
        activeMode === 'STORY'
          ? FIGHTERS.find((f) => f.storyChapter === activeChap) || FIGHTERS[0]
          : FIGHTERS.find((f) => f.id === a2aRightId) || FIGHTERS[2];

      leftMemoryRef.current = createInitialAgentMemory(lFighter);
      rightMemoryRef.current = createInitialAgentMemory(rFighter);

      setRound(1);
      setRoundTimerSeconds(90);
      setLeftRoundsWon(0);
      setRightRoundsWon(0);
      setStrikerSide('LEFT');
      setLeftHP(100);
      setRightHP(100);
      setLeftFatigue(0);
      setRightFatigue(0);
      setLeftHitsTaken(0);
      setRightHitsTaken(0);
      setLeftSpecialReady(true);
      setRightSpecialReady(true);
      setLeftSpecialActive(false);
      setRightSpecialActive(false);
      setLeftComebackForceBonus(0);
      setRightComebackForceBonus(0);
      setLeftComebackBraceBonus(0);
      setRightComebackBraceBonus(0);
      setLeftKnockdownsThisRound(0);
      setRightKnockdownsThisRound(0);
      setPracticeTapCount(0);
      setTorqueCharge(0);
      setDefenseTapBoost(0);
      setLastSlapResult(null);
      setMatchWinner(null);
      setMatchKOType('NONE');
      setIsKOReplayActive(false);
      setImpactPopupText(null);
      setCrowdHypePercent(72);

      if (sceneControllerRef.current) {
        sceneControllerRef.current.resetFightersToStance();
        sceneControllerRef.current.setCameraPreset('BROADCAST_WIDE');
        setCameraPreset('BROADCAST_WIDE');
      }

      if (activeMode === 'STORY') {
        setTurnPhase('PLAYER_STRIKE_METER');
        setStatusBanner(
          `ROUND 1 — Tap "SLAP!" when the needle hits the sweet spot!`
        );
      } else {
        setTurnPhase('A2A_THINKING');
        setStatusBanner(
          `A2A Match: ${lFighter.name} vs ${rFighter.name} — Autonomous bout`
        );
      }
    },
    [gameMode, storyChapter, playerFighterId, a2aLeftId, a2aRightId]
  );

  // Oscillating Timing Cursor
  useEffect(() => {
    if (
      turnPhase !== 'PLAYER_STRIKE_PREP' &&
      turnPhase !== 'PLAYER_STRIKE_METER' &&
      turnPhase !== 'PLAYER_DEFENSE_BRACE' &&
      turnPhase !== 'KO_RECOVERY_MINIGAME'
    ) {
      return;
    }

    let animId = 0;
    const startTime = performance.now();

    let speedRadPerSec = 4.2;
    if (turnPhase === 'PLAYER_STRIKE_METER' || turnPhase === 'PLAYER_STRIKE_PREP') {
      speedRadPerSec =
        selectedWindUp === 1 ? 3.5 : selectedWindUp === 2 ? 4.5 : 5.8;
    } else if (turnPhase === 'PLAYER_DEFENSE_BRACE') {
      speedRadPerSec = 4.6;
    } else if (turnPhase === 'KO_RECOVERY_MINIGAME') {
      const koDef = KO_TYPE_DEFINITIONS[activeKOType];
      speedRadPerSec = koDef.recoveryCursorSpeed;
    }

    const tick = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const pos = 0.5 + 0.46 * Math.sin(elapsed * speedRadPerSec);
      setTimingCursor(pos);
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [turnPhase, selectedWindUp, activeKOType]);

  // Conclude Round (Best of 3 Rounds)
  const ConcludeRound = useCallback(
    (
      roundWinnerSide: 'LEFT' | 'RIGHT' | 'DRAW',
      reasonText: string,
      koTypeReached: KOType
    ) => {
      setIsKOReplayActive(false);
      const nextLeftWins =
        roundWinnerSide === 'LEFT' ? leftRoundsWon + 1 : leftRoundsWon;
      const nextRightWins =
        roundWinnerSide === 'RIGHT' ? rightRoundsWon + 1 : rightRoundsWon;

      setLeftRoundsWon(nextLeftWins);
      setRightRoundsWon(nextRightWins);

      if (roundWinnerSide === 'LEFT') {
        setArcadeCoins((c) => Math.min(9, c + 1));
      }

      if (roundWinnerSide === 'LEFT' || roundWinnerSide === 'RIGHT') {
        sceneControllerRef.current?.triggerVictoryPose(roundWinnerSide);
      }

      const winnerName =
        roundWinnerSide === 'LEFT'
          ? leftFighter.name.toUpperCase()
          : roundWinnerSide === 'RIGHT'
            ? rightFighter.name.toUpperCase()
            : 'DRAW';

      setImpactPopupText(`ROUND ${round} WINNER: ${winnerName}!`);

      const isFinalKO =
        nextLeftWins >= 2 || nextRightWins >= 2 || round >= maxRounds;

      if (isFinalKO) {
        let finalWinner: 'LEFT' | 'RIGHT' | 'DRAW' = 'DRAW';
        if (nextLeftWins > nextRightWins) {
          finalWinner = 'LEFT';
        } else if (nextRightWins > nextLeftWins) {
          finalWinner = 'RIGHT';
        } else if (leftHP !== rightHP) {
          finalWinner = leftHP > rightHP ? 'LEFT' : 'RIGHT';
        }

        setMatchWinner(finalWinner);
        setMatchKOType(koTypeReached);
        setTurnPhase('MATCH_OVER');
        setStatusBanner(reasonText);

        if (gameMode === 'STORY' && finalWinner === 'LEFT') {
          setUnlockedChapter((prev) => Math.max(prev, storyChapter + 1));
          if (storyChapter >= 10) {
            setUseGoldenArmor(true);
          }
        }
        return;
      }

      setTurnPhase('ROUND_TRANSITION');
      setStatusBanner(
        `ROUND ${round} WINNER: ${winnerName}! • Preparing Round ${round + 1} of ${maxRounds}`
      );

      setTimeout(() => {
        const nextRoundNum = round + 1;
        setRound(nextRoundNum);
        setRoundTimerSeconds(90);
        setLeftKnockdownsThisRound(0);
        setRightKnockdownsThisRound(0);
        setLeftHP(100);
        setRightHP(100);
        setLeftFatigue(0);
        setRightFatigue(0);
        setPracticeTapCount(0);
        setTorqueCharge(0);
        setDefenseTapBoost(0);
        setImpactPopupText(`ROUND ${nextRoundNum} — FIGHT!`);
        setTimeout(() => setImpactPopupText(null), 1200);

        sceneControllerRef.current?.resetFightersToStance();
        sceneControllerRef.current?.setCameraPreset('BROADCAST_WIDE');
        setCameraPreset('BROADCAST_WIDE');

        setStrikerSide('LEFT');

        if (gameMode === 'STORY') {
          setTurnPhase('PLAYER_STRIKE_METER');
          setStatusBanner(
            `ROUND ${nextRoundNum} • Tap "SLAP!" on the sweet spot!`
          );
        } else {
          setTurnPhase('A2A_THINKING');
          setStatusBanner(
            `Round ${nextRoundNum} • Autonomous agents aligning cheek target`
          );
        }
      }, 2200 / (gameMode === 'A2A' ? a2aSpeed : 1));
    },
    [
      leftRoundsWon,
      rightRoundsWon,
      round,
      maxRounds,
      leftHP,
      rightHP,
      gameMode,
      storyChapter,
      rightFighter.name,
      a2aSpeed,
    ]
  );

  // 10-Count Mini-Game
  useEffect(() => {
    if (turnPhase !== 'KO_RECOVERY_MINIGAME') return;

    setTenCountSeconds(10.0);
    const intervalMs = 100;
    const speedFactor = gameMode === 'A2A' ? a2aSpeed : 1;

    let a2aAttemptTimer: number | null = null;
    const isAutoDefender =
      gameMode === 'A2A' || (gameMode === 'STORY' && downedSide === 'RIGHT');

    if (isAutoDefender) {
      const downedFighter = downedSide === 'LEFT' ? leftFighter : rightFighter;
      const downedStats =
        downedSide === 'LEFT' ? leftEffectiveStats : rightEffectiveStats;
      const downedFatigue = downedSide === 'LEFT' ? leftFatigue : rightFatigue;
      const downedKDs =
        downedSide === 'LEFT'
          ? leftKnockdownsThisRound
          : rightKnockdownsThisRound;

      const delayMs = (1700 + Math.random() * 900) / speedFactor;
      a2aAttemptTimer = window.setTimeout(() => {
        const evalResult = evaluateA2AKORecoveryAttempt(
          downedFighter,
          downedStats,
          activeKOType,
          downedFatigue,
          downedKDs
        );

        const koSpec = KO_TYPE_DEFINITIONS[activeKOType];
        setA2aThoughtText(evalResult.recoveryThought);

        if (evalResult.succeeded) {
          soundEngine.playSpecialActivate();
          setIsKOReplayActive(false);
          setImpactPopupText(`SECOND WIND! ${downedFighter.name} RECOVERS!`);
          setTimeout(() => setImpactPopupText(null), 1400);
          sceneControllerRef.current?.resetFightersToStance();
          sceneControllerRef.current?.setCameraPreset('BROADCAST_WIDE');
          setCameraPreset('BROADCAST_WIDE');

          if (downedSide === 'LEFT') {
            setLeftHP(koSpec.recoveredHPPercent);
            setLeftComebackForceBonus(
              activeKOType === 'CRITICAL_KO' ? 0.3 : 0.12
            );
            setLeftComebackBraceBonus(
              activeKOType === 'CLEAN_KO' ? 0.15 : 0.08
            );
          } else {
            setRightHP(koSpec.recoveredHPPercent);
            setRightComebackForceBonus(
              activeKOType === 'CRITICAL_KO' ? 0.3 : 0.12
            );
            setRightComebackBraceBonus(
              activeKOType === 'CLEAN_KO' ? 0.15 : 0.08
            );
          }

          setStatusBanner(`SECOND WIND • ${evalResult.recoveryThought}`);

          setTimeout(() => {
            const nextStriker = downedSide;
            setStrikerSide(nextStriker);
            setPracticeTapCount(0);
            setTorqueCharge(0);
            setDefenseTapBoost(0);
            if (gameMode === 'STORY') {
              if (nextStriker === 'LEFT') {
                setTurnPhase('PLAYER_STRIKE_PREP');
              } else {
                sceneControllerRef.current?.triggerCheekLineUp(
                  'RIGHT',
                  2,
                  'MID_CHEEK'
                );
                setTurnPhase('PLAYER_DEFENSE_BRACE');
              }
            } else {
              setTurnPhase('A2A_THINKING');
            }
          }, 1300 / speedFactor);
        } else {
          soundEngine.playKOBassDrop();
          const winnerSide = downedSide === 'LEFT' ? 'RIGHT' : 'LEFT';
          const winnerFighter =
            winnerSide === 'LEFT' ? leftFighter : rightFighter;
          ConcludeRound(
            winnerSide,
            `${koSpec.name} • ${downedFighter.name} failed 10-Count • ${winnerFighter.name} wins Round ${round}`,
            activeKOType
          );
        }
      }, delayMs);
    }

    const countdownInterval = window.setInterval(() => {
      setTenCountSeconds((prev) => {
        const nextVal = Number((prev - 0.1 * speedFactor).toFixed(1));
        if (
          Math.floor(nextVal) !== Math.floor(prev) &&
          nextVal > 0 &&
          nextVal <= 9
        ) {
          soundEngine.playCountBeep(10 - Math.floor(nextVal));
        }
        if (nextVal <= 0) {
          clearInterval(countdownInterval);
          soundEngine.playKOBassDrop();
          const koSpec = KO_TYPE_DEFINITIONS[activeKOType];
          const downedFighter =
            downedSide === 'LEFT' ? leftFighter : rightFighter;
          const winnerSide = downedSide === 'LEFT' ? 'RIGHT' : 'LEFT';
          const winnerFighter =
            winnerSide === 'LEFT' ? leftFighter : rightFighter;
          ConcludeRound(
            winnerSide,
            `10-COUNT EXPIRED • ${downedFighter.name} counted out (${koSpec.name}) • ${winnerFighter.name} wins Round ${round}`,
            activeKOType
          );
          return 0;
        }
        return nextVal;
      });
    }, intervalMs);

    return () => {
      clearInterval(countdownInterval);
      if (a2aAttemptTimer) clearTimeout(a2aAttemptTimer);
    };
  }, [
    turnPhase,
    downedSide,
    activeKOType,
    gameMode,
    a2aSpeed,
    leftFighter,
    rightFighter,
    leftEffectiveStats,
    rightEffectiveStats,
    leftFatigue,
    rightFatigue,
    leftKnockdownsThisRound,
    rightKnockdownsThisRound,
    round,
    ConcludeRound,
  ]);

  // Execute Slap Sequence
  const executeSlapSequence = useCallback(
    (
      activeStriker: 'LEFT' | 'RIGHT',
      windUpCount: WindUpCount,
      angle: SlapAngle,
      strikerPrecisionMeter: number,
      defenderBraceMeter: number,
      useSpecial: boolean
    ) => {
      setTurnPhase('WINDUP_ANIMATING');

      const strikerProfile =
        activeStriker === 'LEFT' ? leftFighter : rightFighter;
      const defenderProfile =
        activeStriker === 'LEFT' ? rightFighter : leftFighter;
      const sStats =
        activeStriker === 'LEFT' ? leftEffectiveStats : rightEffectiveStats;
      const dStats =
        activeStriker === 'LEFT' ? rightEffectiveStats : leftEffectiveStats;

      const sFatigue = activeStriker === 'LEFT' ? leftFatigue : rightFatigue;
      const dFatigue = activeStriker === 'LEFT' ? rightFatigue : leftFatigue;
      const dHits = activeStriker === 'LEFT' ? rightHitsTaken : leftHitsTaken;
      const dHP = activeStriker === 'LEFT' ? rightHP : leftHP;

      const comebackForce =
        activeStriker === 'LEFT'
          ? leftComebackForceBonus
          : rightComebackForceBonus;
      const comebackBrace =
        activeStriker === 'LEFT'
          ? rightComebackBraceBonus
          : leftComebackBraceBonus;

      if (useSpecial) {
        soundEngine.playSpecialActivate();
        sceneControllerRef.current?.setSpecialAura(activeStriker, true);
        if (activeStriker === 'LEFT') {
          setLeftSpecialReady(false);
          setLeftSpecialActive(false);
        } else {
          setRightSpecialReady(false);
          setRightSpecialActive(false);
        }
      }

      // Spoken pre-slap line
      const preSlapQuote = soundEngine.getContenderTaunt(strikerProfile.id, 'PRE_SLAP');
      soundEngine.speakTaunt(preSlapQuote, 1.05, 1.1);

      if (activeStriker === 'LEFT') {
        setLeftComebackForceBonus(0);
        setRightComebackBraceBonus(0);
        rightMemoryRef.current.observedOpponentWindUps.push(windUpCount);
        rightMemoryRef.current.observedOpponentAngles.push(angle);
      } else {
        setRightComebackForceBonus(0);
        setLeftComebackBraceBonus(0);
        leftMemoryRef.current.observedOpponentWindUps.push(windUpCount);
        leftMemoryRef.current.observedOpponentAngles.push(angle);
      }

      sceneControllerRef.current?.triggerCheekLineUp(
        activeStriker,
        windUpCount,
        angle
      );
      setTimeout(() => {
        sceneControllerRef.current?.triggerWindUp(activeStriker, windUpCount);
      }, 190);

      const speedFactor = gameMode === 'A2A' ? a2aSpeed : 1;
      const beatInterval = 310 / speedFactor;

      for (let i = 1; i <= windUpCount; i++) {
        setTimeout(() => {
          soundEngine.playCountBeep(i);
          setStatusBanner(
            `${strikerProfile.name} • Torque Load "ON ${windUpCount}" (${i}/${windUpCount})`
          );
        }, (i - 1) * beatInterval);
      }

      setTimeout(
        () => {
          soundEngine.playWindUpWhoosh(windUpCount * 0.42);
        },
        Math.max(100, (windUpCount - 0.35) * beatInterval)
      );

      setTimeout(
        () => {
          const result = calculateSlapPhysics({
            striker: strikerProfile,
            strikerEffectiveStats: sStats,
            defender: defenderProfile,
            defenderEffectiveStats: dStats,
            windUpCount,
            slapAngle: angle,
            strikerPrecisionMeter: Math.min(1.0, strikerPrecisionMeter),
            defenderBraceMeter: Math.min(0.98, defenderBraceMeter),
            strikerFatigue: sFatigue,
            defenderFatigue: dFatigue,
            defenderPreviousHits: dHits,
            strikerSpecialActive: useSpecial,
            defenderSpecialActive:
              activeStriker === 'LEFT' ? rightSpecialActive : leftSpecialActive,
            defenderRemainingHP: dHP,
            strikerComebackForceBonus: comebackForce,
            defenderComebackBraceBonus: comebackBrace,
          });

          setLastSlapResult(result);
          setTurnPhase('IMPACT_RESOLUTION');
          sceneControllerRef.current?.setSpecialAura(activeStriker, false);

          setHudShake(true);
          setTimeout(() => setHudShake(false), 280);

          const forceNum = Math.round(result.slapForce);
          const dmgNum = Math.round(result.finalDamage);
          if (result.isKO && result.koType !== 'NONE') {
            setImpactPopupText(
              `${KO_TYPE_DEFINITIONS[result.koType].name.toUpperCase()}! ${forceNum} N (-${dmgNum}%)`
            );
          } else {
            setImpactPopupText(
              `${forceNum} N SLAP FORCE • -${dmgNum}% CHIN DURABILITY`
            );
          }
          setTimeout(() => setImpactPopupText(null), 1600 / speedFactor);

          setCrowdHypePercent(
            Math.min(
              100,
              Math.round(
                55 + (result.slapForce / 140) * 35 + (result.isKO ? 20 : 0)
              )
            )
          );

          // WebAudioEngine slap crack + sub-thud
          soundEngine.playSlapSound(result.slapForce, result.isCriticalSlap);
          setTimeout(() => {
            soundEngine.playCrowdReaction(result.isKO);
            if (result.isKO) {
              soundEngine.playKOBassDrop();
            }
          }, 80);

          const defenderSide = activeStriker === 'LEFT' ? 'RIGHT' : 'LEFT';

          sceneControllerRef.current?.triggerSlapImpact(
            activeStriker,
            result.recoilIntensity,
            result.headWhipRadians,
            result.footSlideMeters,
            result.isKO,
            result.koType
          );

          const nextDefenderHP = Math.max(
            0,
            Math.round(dHP - result.finalDamage)
          );

          if (activeStriker === 'LEFT') {
            setRightHP(nextDefenderHP);
            setLeftFatigue((f) => Math.min(100, f + windUpCount * 4));
            setRightFatigue((f) =>
              Math.min(100, f + Math.round(result.finalDamage * 0.25))
            );
            setRightHitsTaken((h) => h + 1);
          } else {
            setLeftHP(nextDefenderHP);
            setRightFatigue((f) => Math.min(100, f + windUpCount * 4));
            setLeftFatigue((f) =>
              Math.min(100, f + Math.round(result.finalDamage * 0.25))
            );
            setLeftHitsTaken((h) => h + 1);
          }

          const isZeroHP = nextDefenderHP <= 0;
          const effectiveIsKO = result.isKO || isZeroHP;
          const effectiveKOType: Exclude<KOType, 'NONE'> =
            result.koType !== 'NONE' ? result.koType : 'CLEAN_KO';

          if (effectiveIsKO) {
            const koDef = KO_TYPE_DEFINITIONS[effectiveKOType];
            setIsKOReplayActive(true);
            setStatusBanner(
              `ROUND KNOCKOUT • ${koDef.name} • ${result.commentaryLine}`
            );

            if (defenderSide === 'LEFT') {
              setLeftKnockdownsThisRound((k) => k + 1);
            } else {
              setRightKnockdownsThisRound((k) => k + 1);
            }

            // If health bar dropped all the way to 0, award the round win after a brief dramatic pause!
            if (isZeroHP) {
              setTimeout(() => {
                ConcludeRound(
                  activeStriker,
                  `${strikerProfile.name} KOs ${defenderProfile.name} in Round ${round}!`,
                  effectiveKOType
                );
              }, 1150 / speedFactor);
              return;
            }

            setTimeout(() => {
              setDownedSide(defenderSide);
              setActiveKOType(effectiveKOType);
              setTurnPhase('KO_RECOVERY_MINIGAME');
              setStatusBanner(
                `${koDef.name} • ${defenderProfile.name} DOWN • 10-Count Active`
              );
            }, 1350 / speedFactor);
            return;
          }

          setStatusBanner(result.commentaryLine);

          setTimeout(() => {
            const nextStriker = activeStriker === 'LEFT' ? 'RIGHT' : 'LEFT';
            setStrikerSide(nextStriker);
            setPracticeTapCount(0);
            setTorqueCharge(0);
            setDefenseTapBoost(0);

            if (gameMode === 'STORY') {
              if (nextStriker === 'LEFT') {
                setTurnPhase('PLAYER_STRIKE_METER');
                setStatusBanner(
                  `YOUR TURN! Tap "SLAP!" when the needle hits the sweet spot!`
                );
              } else {
                sceneControllerRef.current?.triggerCheekLineUp(
                  'RIGHT',
                  2,
                  'MID_CHEEK'
                );
                setTurnPhase('PLAYER_DEFENSE_BRACE');
                setStatusBanner(
                  `${rightFighter.name} winds up! Tap "BRACE!" or brace automatically!`
                );
              }
            } else {
              setTurnPhase('A2A_THINKING');
            }
          }, 1100 / speedFactor);
        },
        windUpCount * beatInterval + 120
      );
    },
    [
      leftFighter,
      rightFighter,
      leftEffectiveStats,
      rightEffectiveStats,
      leftFatigue,
      rightFatigue,
      leftHitsTaken,
      rightHitsTaken,
      leftHP,
      rightHP,
      leftSpecialActive,
      rightSpecialActive,
      leftComebackForceBonus,
      rightComebackForceBonus,
      leftComebackBraceBonus,
      rightComebackBraceBonus,
      round,
      maxRounds,
      gameMode,
      a2aSpeed,
      ConcludeRound,
    ]
  );

  // Auto-advance opponent turn in 1P Arcade mode if player doesn't manually tap BRACE within 1.15s
  useEffect(() => {
    if (gameMode !== 'STORY' || turnPhase !== 'PLAYER_DEFENSE_BRACE') return;
    const autoOpponentTimer = window.setTimeout(() => {
      const aiDecision = evaluateA2AStrikeDecision(
        rightFighter,
        rightEffectiveStats,
        leftFighter,
        leftEffectiveStats,
        rightHP,
        leftHP,
        leftHitsTaken,
        rightSpecialReady,
        rightMemoryRef.current
      );
      executeSlapSequence(
        'RIGHT',
        aiDecision.chosenWindUp,
        aiDecision.chosenAngle,
        aiDecision.predictedPrecision,
        0.58,
        aiDecision.activateSpecial
      );
    }, 1150);
    return () => clearTimeout(autoOpponentTimer);
  }, [
    gameMode,
    turnPhase,
    rightFighter,
    rightEffectiveStats,
    leftFighter,
    leftEffectiveStats,
    rightHP,
    leftHP,
    leftHitsTaken,
    rightSpecialReady,
    executeSlapSequence,
  ]);

  // Autonomous A2A Turn Loop with 30% Fakeout Chance for aggressive fighters
  useEffect(() => {
    if (gameMode !== 'A2A' || turnPhase !== 'A2A_THINKING' || a2aPaused) {
      return;
    }

    const activeStriker = strikerSide;
    const sFighter = activeStriker === 'LEFT' ? leftFighter : rightFighter;
    const dFighter = activeStriker === 'LEFT' ? rightFighter : leftFighter;
    const sStats =
      activeStriker === 'LEFT' ? leftEffectiveStats : rightEffectiveStats;
    const dStats =
      activeStriker === 'LEFT' ? rightEffectiveStats : leftEffectiveStats;
    const sHP = activeStriker === 'LEFT' ? leftHP : rightHP;
    const dHP = activeStriker === 'LEFT' ? rightHP : leftHP;
    const dHits = activeStriker === 'LEFT' ? rightHitsTaken : leftHitsTaken;
    const sSpecialReady =
      activeStriker === 'LEFT' ? leftSpecialReady : rightSpecialReady;
    const sMemory =
      activeStriker === 'LEFT'
        ? leftMemoryRef.current
        : rightMemoryRef.current;
    const dMemory =
      activeStriker === 'LEFT'
        ? rightMemoryRef.current
        : leftMemoryRef.current;

    const decision = evaluateA2AStrikeDecision(
      sFighter,
      sStats,
      dFighter,
      dStats,
      sHP,
      dHP,
      dHits,
      sSpecialReady,
      sMemory
    );

    const defenseEval = evaluateA2ADefenseBrace(
      dFighter,
      dStats,
      decision.chosenWindUp,
      dMemory
    );

    sceneControllerRef.current?.triggerCheekLineUp(
      activeStriker,
      decision.chosenWindUp,
      decision.chosenAngle
    );

    const shouldFakeout =
      Math.random() < 0.3 &&
      (sFighter.id === 'musk' || sFighter.id === 'ellison' || sFighter.id === 'bezos');

    if (shouldFakeout) {
      setTimeout(() => {
        sceneControllerRef.current?.triggerFakeout(activeStriker);
        setImpactPopupText(`FAKEOUT! ${sFighter.name.toUpperCase()} BLUFFS!`);

        if (Math.random() < 0.5) {
          const defenderSide = activeStriker === 'LEFT' ? 'RIGHT' : 'LEFT';
          sceneControllerRef.current?.triggerFlinchReaction(defenderSide);
          setTimeout(() => {
            setImpactPopupText(`FLINCHED! ${dFighter.name.toUpperCase()} -15% BRACE!`);
            setTimeout(() => setImpactPopupText(null), 1200);
          }, 350);
        } else {
          setTimeout(() => setImpactPopupText(null), 1000);
        }
      }, 400 / a2aSpeed);
    }

    setTimeout(() => {
      sceneControllerRef.current?.updatePracticeSwingAndTorque(
        activeStriker,
        0.75
      );
    }, 350 / a2aSpeed);

    setA2aThoughtText(decision.emotionalThought);
    setStatusBanner(
      `${sFighter.name} lines up ${dFighter.name}'s ${decision.chosenAngle.replace('_', ' ')} • "On ${decision.chosenWindUp}"`
    );

    const timer = setTimeout(() => {
      executeSlapSequence(
        activeStriker,
        decision.chosenWindUp,
        decision.chosenAngle,
        decision.predictedPrecision,
        defenseEval.braceQuality,
        decision.activateSpecial
      );
    }, (shouldFakeout ? 1450 : 950) / a2aSpeed);

    return () => clearTimeout(timer);
  }, [
    gameMode,
    turnPhase,
    a2aPaused,
    strikerSide,
    leftFighter,
    rightFighter,
    leftEffectiveStats,
    rightEffectiveStats,
    leftHP,
    rightHP,
    leftHitsTaken,
    rightHitsTaken,
    leftSpecialReady,
    rightSpecialReady,
    a2aSpeed,
    executeSlapSequence,
  ]);

  // Player Input Handlers
  const handleSelectWindUp = (count: WindUpCount) => {
    setSelectedWindUp(count);
    soundEngine.playCountBeep(count);
    sceneControllerRef.current?.triggerCheekLineUp(
      'LEFT',
      count,
      selectedAngle
    );
  };

  const handleSelectCheekAngle = (angle: SlapAngle) => {
    setSelectedAngle(angle);
    soundEngine.playCountBeep(1);
    sceneControllerRef.current?.triggerCheekLineUp(
      'LEFT',
      selectedWindUp,
      angle
    );
  };

  const handlePlayerTriggerFakeout = () => {
    if (turnPhase !== 'PLAYER_STRIKE_METER' && turnPhase !== 'PLAYER_STRIKE_PREP') return;
    sceneControllerRef.current?.triggerFakeout('LEFT');
    setImpactPopupText('DECOY WIND-UP! TESTING THE AIR!');

    if (Math.random() < 0.55) {
      setTimeout(() => {
        sceneControllerRef.current?.triggerFlinchReaction('RIGHT');
        setImpactPopupText(`FLINCHED! ${rightFighter.name.toUpperCase()} -15% BRACE!`);
        setRightComebackBraceBonus(-0.15);
        setTimeout(() => setImpactPopupText(null), 1400);
      }, 400);
    } else {
      setTimeout(() => {
        setImpactPopupText(`${rightFighter.name.toUpperCase()} HELD STEADY!`);
        setTimeout(() => setImpactPopupText(null), 1200);
      }, 400);
    }
  };

  const handleTriggerTaunt = () => {
    sceneControllerRef.current?.triggerTaunt(strikerSide);
    const activeProfile = strikerSide === 'LEFT' ? leftFighter : rightFighter;
    setImpactPopupText(`${activeProfile.name.toUpperCase()} TAUNTS!`);
    setTimeout(() => setImpactPopupText(null), 1600);
  };

  const handleTapPracticeSwing = () => {
    if (turnPhase !== 'PLAYER_STRIKE_METER' && turnPhase !== 'PLAYER_STRIKE_PREP') return;
    const nextTaps = practiceTapCount + 1;
    const nextTorque = Math.min(1, torqueCharge + 0.18);
    setPracticeTapCount(nextTaps);
    setTorqueCharge(nextTorque);
    soundEngine.playCountBeep((nextTaps % 3) + 1);
    sceneControllerRef.current?.updatePracticeSwingAndTorque('LEFT', nextTorque);
  };

  const handlePlayerUnleashSlap = () => {
    if (turnPhase === 'PLAYER_DEFENSE_BRACE') {
      handleTapChinBrace();
      return;
    }
    if (turnPhase === 'KO_RECOVERY_MINIGAME' && downedSide === 'LEFT') {
      handlePlayerAttemptKORecovery();
      return;
    }
    if (turnPhase !== 'PLAYER_STRIKE_METER' && turnPhase !== 'PLAYER_STRIKE_PREP') return;

    const distFromCenter = Math.abs(timingCursor - 0.5);
    const basePrecision = Math.max(0.25, 1.0 - distFromCenter * 1.65);
    const totalPrecisionMeter = Math.min(
      1.0,
      basePrecision + torqueCharge * 0.25
    );

    const aiDefense = evaluateA2ADefenseBrace(
      rightFighter,
      rightEffectiveStats,
      selectedWindUp,
      rightMemoryRef.current
    );

    executeSlapSequence(
      'LEFT',
      selectedWindUp,
      selectedAngle,
      totalPrecisionMeter,
      aiDefense.braceQuality,
      leftSpecialActive
    );
  };

  const handleTapChinBrace = () => {
    if (turnPhase !== 'PLAYER_DEFENSE_BRACE') return;
    const nextBoost = Math.min(0.32, defenseTapBoost + 0.12);
    setDefenseTapBoost(nextBoost);
    soundEngine.playCountBeep(2);

    const distFromCenter = Math.abs(timingCursor - 0.5);
    const playerBrace = Math.min(
      0.98,
      Math.max(0.2, 0.92 - distFromCenter * 1.5 + nextBoost)
    );

    const aiDecision = evaluateA2AStrikeDecision(
      rightFighter,
      rightEffectiveStats,
      leftFighter,
      leftEffectiveStats,
      rightHP,
      leftHP,
      leftHitsTaken,
      rightSpecialReady,
      rightMemoryRef.current
    );

    executeSlapSequence(
      'RIGHT',
      aiDecision.chosenWindUp,
      aiDecision.chosenAngle,
      aiDecision.predictedPrecision,
      playerBrace,
      aiDecision.activateSpecial
    );
  };

  const handlePlayerAttemptKORecovery = () => {
    if (turnPhase !== 'KO_RECOVERY_MINIGAME' || downedSide !== 'LEFT') return;

    const koDef = KO_TYPE_DEFINITIONS[activeKOType];
    const penaltyScale = leftKnockdownsThisRound > 1 ? 0.68 : 1.0;
    const effectiveHalfWidth = (koDef.recoveryWindowWidth * penaltyScale) / 2;
    const distFromCenter = Math.abs(timingCursor - 0.5);

    if (distFromCenter <= effectiveHalfWidth) {
      soundEngine.playSpecialActivate();
      setIsKOReplayActive(false);
      setImpactPopupText(`SECOND WIND! ${leftFighter.name} RECOVERS!`);
      setTimeout(() => setImpactPopupText(null), 1400);
      sceneControllerRef.current?.resetFightersToStance();
      sceneControllerRef.current?.setCameraPreset('BROADCAST_WIDE');
      setCameraPreset('BROADCAST_WIDE');

      setLeftHP(koDef.recoveredHPPercent);
      setLeftComebackForceBonus(activeKOType === 'CRITICAL_KO' ? 0.3 : 0.14);
      setLeftComebackBraceBonus(activeKOType === 'CLEAN_KO' ? 0.15 : 0.08);
      if (activeKOType === 'DELAYED_KO') {
        setLeftSpecialReady(true);
      }

      setStatusBanner(
        `BEATS THE COUNT • ${leftFighter.name} recovers at ${koDef.recoveredHPPercent}% Chin (${koDef.comebackBuffName})`
      );

      setTimeout(() => {
        setStrikerSide('LEFT');
        setPracticeTapCount(0);
        setTorqueCharge(0);
        setTurnPhase('PLAYER_STRIKE_METER');
      }, 1050);
    } else {
      soundEngine.playKOBassDrop();
      ConcludeRound(
        'RIGHT',
        `RECOVERY FAILED • ${leftFighter.name} missed recovery window (${koDef.name}) • ${rightFighter.name} wins Round ${round}`,
        activeKOType
      );
    }
  };

  const handleCycleCamera = useCallback(() => {
    const order: CameraPreset[] = [
      'BROADCAST_WIDE',
      'PRE_SLAP_PUSH',
      'STRIKER_PROFILE',
      'IMPACT_MACRO',
      'KO_REPLAY_ORBIT',
    ];
    const nextIdx = (order.indexOf(cameraPreset) + 1) % order.length;
    const nextCam = order[nextIdx];
    setCameraPreset(nextCam);
    sceneControllerRef.current?.setCameraPreset(nextCam);
  }, [cameraPreset]);

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    soundEngine.muted = nextMuted;
  };

  // Keyboard shortcuts (Space: SLAP!, H: Toggle Dock, C: Zoom, T: Taunt, F: Fakeout)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isCodexOpen || isPhysicsModalOpen) return;
      const key = e.key.toLowerCase();
      if (key === 'h') {
        setIsDockCollapsed((prev) => !prev);
      } else if (key === 'c') {
        handleCycleCamera();
      } else if (key === 't') {
        handleTriggerTaunt();
      } else if (key === 'f' && gameMode === 'STORY') {
        handlePlayerTriggerFakeout();
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (gameMode === 'STORY') {
          handlePlayerUnleashSlap();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const leftShortName =
    leftFighter.id === 'bezos'
      ? 'BEZOS'
      : leftFighter.name.split(' ').slice(-1)[0].toUpperCase();
  const rightShortName =
    rightFighter.id === 'ellison'
      ? 'ELLISON'
      : rightFighter.name.split(' ').slice(-1)[0].toUpperCase();

  return (
    <div
      className={`w-screen h-[100dvh] flex flex-col justify-between overflow-hidden bg-[#05070E] select-none font-sans transition-transform duration-150 ${
        hudShake ? 'translate-x-1 -translate-y-1' : ''
      }`}
    >
      {/* ===================================================================== */}
      {/* 1. TOP ARCADE HUD: BEZOS (YELLOW BAR + COINS) | GOLD MARQUEE | ELLISON (RED BAR + GEAR) */}
      {/* ===================================================================== */}
      <header className="flex-none w-full z-20 bg-[#070B16] border-b-2 border-[#FACC15]/70 px-2.5 sm:px-5 py-2 shadow-[0_4px_0_#000]">
        <div className="max-w-[1440px] mx-auto grid grid-cols-12 items-start gap-2 sm:gap-4">
          {/* TOP LEFT: Yellow Health Bar + BEZOS Nameplate + Golden Coin Counters */}
          <div className="col-span-4 sm:col-span-4 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-1">
              <span className="font-display text-sm sm:text-xl font-black uppercase tracking-wider text-[#FACC15] drop-shadow-[2px_2px_0_#000] truncate">
                {leftShortName}
              </span>
              <span className="font-mono text-[10px] sm:text-xs font-bold text-slate-200 tabular-nums shrink-0">
                {leftHP}/100 HP
              </span>
            </div>

            {/* Yellow 16-Bit Pixel Health Bar */}
            <div className="w-full h-4 sm:h-6 bg-[#090D16] border-2 border-white p-0.5 shadow-[3px_3px_0_#000]">
              <div
                className="h-full bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#CA8A04] transition-all duration-150"
                style={{ width: `${Math.max(0, leftHP)}%` }}
              />
            </div>

            {/* Golden Arcade Coin Counters & Best-of-3 Round Pips Underneath */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 mt-0.5">
              <button
                type="button"
                onClick={() => {
                  setArcadeCoins((c) => Math.min(9, c + 1));
                  soundEngine.playCountBeep(3);
                }}
                title="Insert Arcade Coin"
                className="flex items-center gap-1 bg-[#090D16] border border-[#FACC15] px-1.5 py-0.5 shadow-[2px_2px_0_#000] cursor-pointer active:translate-y-0.5"
              >
                <span className="inline-block w-3 h-3 bg-[#FACC15] border border-[#FEF08A] shadow-[inset_-1px_-1px_0_#B45309]" />
                <span className="inline-block w-3 h-3 bg-[#FACC15] border border-[#FEF08A] shadow-[inset_-1px_-1px_0_#B45309]" />
                <span className="inline-block w-3 h-3 bg-[#FACC15] border border-[#FEF08A] shadow-[inset_-1px_-1px_0_#B45309]" />
                <span className="font-mono text-[10px] sm:text-xs font-extrabold text-[#FEF08A] tabular-nums ml-0.5">
                  x0{arcadeCoins}
                </span>
              </button>

              <div className="flex items-center gap-1" title="Rounds Won (Best of 3)">
                {[0, 1].map((pipIdx) => (
                  <span
                    key={pipIdx}
                    className={`w-3 h-3 border ${
                      leftRoundsWon > pipIdx
                        ? 'bg-[#22C55E] border-[#BBF7D0] shadow-[0_0_6px_#22C55E]'
                        : 'bg-[#1E293B] border-slate-400'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* TOP CENTER: Gold Retro Arcade Banner "SMACK DADDY CHAMPIONSHIPS" */}
          <div className="col-span-4 sm:col-span-4 flex flex-col items-center justify-center text-center">
            <div className="w-full bg-gradient-to-b from-[#422006] to-[#1C1917] border-2 border-[#FACC15] px-2 py-1 sm:py-1.5 shadow-[0_4px_0_#000,0_0_16px_rgba(250,204,21,0.35)]">
              <h1 className="font-display text-[11px] sm:text-lg md:text-xl font-black uppercase tracking-wider text-[#FEF08A] drop-shadow-[2px_2px_0_#000] leading-tight">
                SMACK DADDY CHAMPIONSHIPS
              </h1>
              <div className="flex items-center justify-center gap-2 mt-0.5 text-[9px] sm:text-[10px] font-mono uppercase tracking-widest text-[#F59E0B]">
                <span>16-BIT PIXEL EDITION</span>
                <span className="hidden md:inline">·</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = gameMode === 'STORY' ? 'A2A' : 'STORY';
                    setGameMode(nextMode);
                    resetMatch(nextMode, storyChapter);
                  }}
                  className="hidden md:inline underline text-[#38BDF8] hover:text-white cursor-pointer"
                >
                  {gameMode === 'STORY' ? '1P Arcade' : 'A2A Auto'}
                </button>
              </div>
            </div>
          </div>

          {/* TOP RIGHT: Red Health Bar + ELLISON Nameplate + Persistent Top Nav Bar */}
          <div className="col-span-4 sm:col-span-4 flex flex-col items-end gap-1">
            <div className="flex items-center justify-between w-full gap-1">
              <span className="font-mono text-[10px] sm:text-xs font-bold text-slate-200 tabular-nums shrink-0">
                {rightHP}/100 HP
              </span>
              <span className="font-display text-sm sm:text-xl font-black uppercase tracking-wider text-[#F87171] drop-shadow-[2px_2px_0_#000] truncate">
                {rightShortName}
              </span>
            </div>

            {/* Red 16-Bit Pixel Health Bar */}
            <div className="w-full h-4 sm:h-6 bg-[#090D16] border-2 border-white p-0.5 shadow-[3px_3px_0_#000] flex justify-end">
              <div
                className="h-full bg-gradient-to-b from-[#FCA5A5] via-[#EF4444] to-[#991B1B] transition-all duration-150"
                style={{ width: `${Math.max(0, rightHP)}%` }}
              />
            </div>

            {/* Round Win Pips & Quick Status */}
            <div className="flex flex-wrap items-center justify-between w-full gap-1.5 mt-0.5">
              <div className="flex items-center gap-1" title="Rounds Won (Best of 3)">
                {[0, 1].map((pipIdx) => (
                  <span
                    key={pipIdx}
                    className={`w-3 h-3 border ${
                      rightRoundsWon > pipIdx
                        ? 'bg-[#EF4444] border-[#FECACA] shadow-[0_0_6px_#EF4444]'
                        : 'bg-[#1E293B] border-slate-400'
                    }`}
                  />
                ))}
              </div>
              <span className="font-mono text-[9px] sm:text-[10px] text-[#FCA5A5] uppercase truncate">
                {rightFighter.specialName}
              </span>
            </div>
          </div>
        </div>

        {/* Persistent Top Control Bar: [ROSTER] [SFX TOGGLE] [A2A AUTO TOGGLE] [CODEX] [DOWNLOAD 1-FILE HTML] */}
        <div className="max-w-[1440px] mx-auto mt-1.5 pt-1.5 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowContenderStrip((v) => !v)}
              className="bg-[#0F172A] border border-[#38BDF8] px-2 py-0.5 font-mono text-[10px] sm:text-xs font-bold text-[#38BDF8] hover:bg-[#1E293B] hover:text-white shadow-[2px_2px_0_#000] cursor-pointer uppercase"
            >
              [ROSTER]
            </button>
            <button
              type="button"
              onClick={handleToggleMute}
              className="bg-[#0F172A] border border-[#FACC15] px-2 py-0.5 font-mono text-[10px] sm:text-xs font-bold text-[#FACC15] hover:bg-[#1E293B] hover:text-white shadow-[2px_2px_0_#000] cursor-pointer uppercase"
            >
              [{isMuted ? 'SFX: OFF' : 'SFX TOGGLE'}]
            </button>
            <button
              type="button"
              onClick={() => {
                const nextMode = gameMode === 'STORY' ? 'A2A' : 'STORY';
                setGameMode(nextMode);
                resetMatch(nextMode, storyChapter);
              }}
              className={`border px-2 py-0.5 font-mono text-[10px] sm:text-xs font-bold shadow-[2px_2px_0_#000] cursor-pointer uppercase ${
                gameMode === 'A2A'
                  ? 'bg-[#065F46] border-[#34D399] text-[#A7F3D0]'
                  : 'bg-[#0F172A] border-[#A855F7] text-[#D8B4FE] hover:text-white'
              }`}
            >
              [{gameMode === 'A2A' ? 'A2A AUTO: ON' : 'A2A AUTO TOGGLE'}]
            </button>
            <button
              type="button"
              onClick={() => setIsCodexOpen(true)}
              className="bg-[#0F172A] border border-amber-400 px-2 py-0.5 font-mono text-[10px] sm:text-xs font-bold text-amber-300 hover:bg-[#1E293B] hover:text-white shadow-[2px_2px_0_#000] cursor-pointer uppercase"
            >
              [CODEX]
            </button>
          </div>

          <a
            href="/smack-daddy-pixel-edition.html"
            download="smack-daddy-pixel-edition.html"
            className="bg-[#166534] border border-[#4ADE80] px-2.5 py-0.5 font-mono text-[10px] sm:text-xs font-bold text-white hover:bg-[#15803D] shadow-[2px_2px_0_#000] uppercase"
          >
            [DOWNLOAD 1-FILE HTML]
          </a>
        </div>

        {/* Collapsible 10-Titan Selector Strip */}
        {showContenderStrip && (
          <div className="max-w-[1440px] mx-auto mt-1.5 pt-1.5 border-t border-slate-800 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
            {FIGHTERS.map((f) => {
              const isSelectedLeft = leftFighter.id === f.id;
              const isSelectedRight = rightFighter.id === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    if (gameMode === 'STORY') {
                      setPlayerFighterId(f.id);
                    } else {
                      setA2aLeftId(f.id);
                    }
                    setTimeout(() => resetMatch(), 20);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (gameMode === 'STORY') {
                      setStoryChapter(f.storyChapter);
                      setTimeout(() => resetMatch('STORY', f.storyChapter), 20);
                    } else {
                      setA2aRightId(f.id);
                      setTimeout(() => resetMatch('A2A', storyChapter), 20);
                    }
                  }}
                  className={`px-2 py-1 border text-[10px] uppercase font-bold whitespace-nowrap cursor-pointer ${
                    isSelectedLeft
                      ? 'bg-[#1D4ED8] border-[#FACC15] text-[#FEF08A]'
                      : isSelectedRight
                        ? 'bg-[#991B1B] border-[#F87171] text-white'
                        : 'bg-[#0F172A] border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  {f.name.split(' ').slice(-1)[0]} ({f.specialName})
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* ===================================================================== */}
      {/* 2. MIDDLE 2D 16-BIT PIXEL ARENA STAGE (Jumbotrons + Podium + Sprites)  */}
      {/* ===================================================================== */}
      <main className="flex-1 relative w-full min-h-0 overflow-hidden z-10 bg-[#05070E]">
        {/* 2D Pixel-Art Canvas Container */}
        <div
          ref={canvasContainerRef}
          onClick={() => {
            if (gameMode === 'STORY') {
              handlePlayerUnleashSlap();
            }
          }}
          className="absolute inset-0 w-full h-full cursor-pointer"
          title="Tap or click to SLAP!"
        />

        {/* Top-of-Canvas Pixel Callout Toast */}
        {impactPopupText && (
          <div className="absolute top-2.5 inset-x-0 z-30 flex justify-center pointer-events-none px-4">
            <div className="font-display text-sm sm:text-xl font-black uppercase tracking-wider text-[#FEF08A] bg-[#090D16]/95 border-2 border-[#FACC15] px-4 py-1 shadow-[4px_4px_0_#000]">
              {impactPopupText}
            </div>
          </div>
        )}

        {/* ROUND WINNER / MATCH VICTORY ARCADE OVERLAY */}
        {(turnPhase === 'ROUND_TRANSITION' || turnPhase === 'MATCH_OVER') && (
          <div className="absolute inset-0 z-30 bg-[#05070E]/80 flex items-center justify-center p-4">
            <div className="bg-[#0F172A] border-4 border-[#FACC15] shadow-[8px_8px_0_#000] p-5 sm:p-7 max-w-md w-full text-center">
              <div className="font-mono text-xs uppercase tracking-widest text-[#38BDF8] mb-1">
                {turnPhase === 'MATCH_OVER'
                  ? 'SMACK DADDY CHAMPIONSHIP RESULT'
                  : `END OF ROUND ${round} (BEST OF 3)`}
              </div>
              <h2 className="font-display text-xl sm:text-3xl font-black uppercase tracking-wider text-[#FEF08A] drop-shadow-[3px_3px_0_#000] mb-2">
                {turnPhase === 'MATCH_OVER'
                  ? matchWinner === 'LEFT'
                    ? `${leftFighter.name} WINS THE BELT!`
                    : `${rightFighter.name} WINS THE BELT!`
                  : 'ROUND WINNER!'}
              </h2>
              <p className="font-mono text-xs sm:text-sm text-slate-300 mb-5">
                {statusBanner}
              </p>

              {turnPhase === 'MATCH_OVER' && (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => resetMatch()}
                    className="min-h-[46px] px-6 bg-gradient-to-b from-[#FACC15] to-[#CA8A04] border-2 border-white text-[#090D16] font-display text-sm sm:text-base font-black uppercase tracking-wider shadow-[4px_4px_0_#000] cursor-pointer active:translate-y-0.5"
                  >
                    PLAY REMATCH
                  </button>
                  {gameMode === 'STORY' && matchWinner === 'LEFT' && storyChapter < 10 && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextChap = storyChapter + 1;
                        setStoryChapter(nextChap);
                        resetMatch('STORY', nextChap);
                      }}
                      className="min-h-[46px] px-5 bg-[#1D4ED8] border-2 border-[#38BDF8] text-white font-display text-sm sm:text-base font-black uppercase tracking-wider shadow-[4px_4px_0_#000] cursor-pointer"
                    >
                      NEXT RIVAL (CH. {storyChapter + 1})
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* 3. BOTTOM ACTION HUB: Active Nameplates + Sweet-Spot Bar + [SLAP!] & [BRACE!] */}
      {/* ===================================================================== */}
      <footer className="flex-none w-full z-20 bg-[#070B16] border-t-2 border-[#FACC15]/80 px-3 sm:px-6 py-2 shadow-[0_-4px_0_#000]">
        <div className="max-w-[1440px] mx-auto flex flex-col gap-1.5">
          {/* Sliding Torque / Sweet-Spot Timing Bar */}
          <div className="w-full max-w-xl mx-auto flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] sm:text-xs font-mono uppercase tracking-wider">
              <span className="text-[#FEF08A] font-bold truncate">
                TAP WHEN THE NEEDLE HITS THE SWEET SPOT
              </span>
              <span className="text-[#38BDF8] font-bold shrink-0 tabular-nums ml-2">
                {lastSlapResult ? `${Math.round(lastSlapResult.slapForce)} N` : statusBanner}
              </span>
            </div>

            <div className="relative w-full h-3.5 bg-[#090D16] border-2 border-white shadow-[2px_2px_0_#000] overflow-hidden">
              <div
                className="absolute inset-y-0 bg-gradient-to-r from-[#1D4ED8] via-[#22C55E] to-[#1D4ED8]"
                style={{ left: '0%', width: '100%' }}
              />
              {/* Center Golden Critical Sweet-Spot Zone */}
              <div
                className="absolute inset-y-0 bg-[#FACC15] border-x-2 border-white"
                style={{ left: '42%', width: '16%' }}
              />
              {/* Oscillating Pixel Needle */}
              <div
                className="absolute inset-y-0 w-2 bg-white border border-black shadow-[0_0_8px_#FFF]"
                style={{ left: `calc(${timingCursor * 100}% - 4px)` }}
              />
            </div>
          </div>

          {/* Bottom 3-Column Arcade Control Row: Left Nameplate | [SLAP!] + [BRACE!] | Right Nameplate */}
          <div className="grid grid-cols-12 items-center gap-2 sm:gap-4">
            {/* Left Contender Nameplate Button */}
            <div className="col-span-3 sm:col-span-3 flex items-center">
              <button
                type="button"
                onClick={() => {
                  setGameMode('STORY');
                  setPlayerFighterId('bezos');
                  setStoryChapter(6);
                  setTimeout(() => resetMatch('STORY', 6), 20);
                }}
                className="w-full min-h-[46px] sm:min-h-[52px] px-2 sm:px-3 py-1.5 border-2 bg-gradient-to-b from-[#2563EB] to-[#1E3A8A] border-[#FACC15] text-[#FEF08A] font-display text-xs sm:text-base font-black uppercase tracking-wider shadow-[4px_4px_0_#000] cursor-pointer active:translate-y-0.5 truncate"
              >
                {leftFighter.name.split(' ').slice(-1)[0]}
              </button>
            </div>

            {/* Center: ROUND Banner + Massive Touch-Friendly [SLAP!] and [BRACE!] Buttons */}
            <div className="col-span-6 sm:col-span-6 flex flex-col items-center justify-center gap-1">
              <div className="bg-[#090D16] border border-[#FACC15] px-3 py-0.5 shadow-[2px_2px_0_#000]">
                <span className="font-display text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-[#FACC15] tabular-nums">
                  ROUND {round} OF {maxRounds}
                </span>
              </div>

              <div className="w-full grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handlePlayerUnleashSlap}
                  disabled={
                    gameMode === 'A2A' ||
                    turnPhase === 'WINDUP_ANIMATING' ||
                    turnPhase === 'IMPACT_RESOLUTION' ||
                    turnPhase === 'ROUND_TRANSITION'
                  }
                  className="w-full min-h-[46px] sm:min-h-[52px] px-3 py-1.5 bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#CA8A04] border-2 border-white text-[#090D16] font-display text-sm sm:text-xl font-black uppercase tracking-wider shadow-[0_4px_0_#713F12,0_0_16px_rgba(250,204,21,0.55)] cursor-pointer active:translate-y-1 disabled:opacity-45"
                >
                  SLAP!
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (turnPhase === 'PLAYER_DEFENSE_BRACE') {
                      handleTapChinBrace();
                    } else if (turnPhase === 'KO_RECOVERY_MINIGAME') {
                      handlePlayerAttemptKORecovery();
                    } else {
                      handleTapPracticeSwing();
                    }
                  }}
                  disabled={
                    gameMode === 'A2A' ||
                    turnPhase === 'WINDUP_ANIMATING' ||
                    turnPhase === 'IMPACT_RESOLUTION' ||
                    turnPhase === 'ROUND_TRANSITION'
                  }
                  className="w-full min-h-[46px] sm:min-h-[52px] px-3 py-1.5 bg-gradient-to-b from-[#38BDF8] via-[#0284C7] to-[#0369A1] border-2 border-white text-white font-display text-sm sm:text-xl font-black uppercase tracking-wider shadow-[0_4px_0_#0C4A6E,0_0_16px_rgba(56,189,248,0.45)] cursor-pointer active:translate-y-1 disabled:opacity-45"
                >
                  BRACE!
                </button>
              </div>
            </div>

            {/* Right Contender Nameplate Button */}
            <div className="col-span-3 sm:col-span-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setGameMode('STORY');
                  setPlayerFighterId('ellison');
                  setStoryChapter(1);
                  setTimeout(() => resetMatch('STORY', 1), 20);
                }}
                className="w-full min-h-[46px] sm:min-h-[52px] px-2 sm:px-3 py-1.5 border-2 bg-gradient-to-b from-[#DC2626] to-[#7F1D1D] border-[#FCA5A5] text-white font-display text-xs sm:text-base font-black uppercase tracking-wider shadow-[4px_4px_0_#000] cursor-pointer active:translate-y-0.5 truncate"
              >
                {rightFighter.name.split(' ').slice(-1)[0]}
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <FighterCodexModal
        isOpen={isCodexOpen}
        onClose={() => setIsCodexOpen(false)}
        unlockedChapter={unlockedChapter}
        selectedPlayerId={leftFighter.id}
        selectedOpponentId={rightFighter.id}
        onSelectPlayerFighter={(id) => {
          if (gameMode === 'STORY') {
            setPlayerFighterId(id);
          } else {
            setA2aLeftId(id);
          }
          setTimeout(() => resetMatch(), 25);
        }}
        onSelectOpponentFighter={(fighter) => {
          if (gameMode === 'STORY') {
            setStoryChapter(fighter.storyChapter);
            setTimeout(() => resetMatch('STORY', fighter.storyChapter), 25);
          } else {
            setA2aRightId(fighter.id);
            setTimeout(() => resetMatch('A2A', storyChapter), 25);
          }
        }}
      />

      <PhysicsSpecModal
        isOpen={isPhysicsModalOpen}
        onClose={() => setIsPhysicsModalOpen(false)}
        unlockedChapter={unlockedChapter}
        onJumpToStoryChapter={(chap) => {
          setGameMode('STORY');
          setStoryChapter(chap);
          setIsPhysicsModalOpen(false);
          setTimeout(() => resetMatch('STORY', chap), 25);
        }}
        onSimulateKOType={(koType) => {
          setIsPhysicsModalOpen(false);
          setDownedSide('RIGHT');
          setActiveKOType(koType);
          setIsKOReplayActive(true);
          sceneControllerRef.current?.triggerSlapImpact(
            'LEFT',
            1.25,
            0.85,
            0.35,
            true,
            koType
          );
          setTurnPhase('KO_RECOVERY_MINIGAME');
          setStatusBanner(
            `KO REPLAY · ${KO_TYPE_DEFINITIONS[koType].name} · ${rightFighter.name} DOWN`
          );
        }}
      />
    </div>
  );
}
