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
  const [cameraPreset, setCameraPreset] =
    useState<CameraPreset>('BROADCAST_WIDE');
  const [hudShake, setHudShake] = useState<boolean>(false);
  const [isKOReplayActive, setIsKOReplayActive] = useState<boolean>(false);
  const [impactPopupText, setImpactPopupText] = useState<string | null>(null);

  // Story Mode Progression State
  const [storyChapter, setStoryChapter] = useState<number>(1);
  const [unlockedChapter, setUnlockedChapter] = useState<number>(1);
  const [playerFighterId, setPlayerFighterId] = useState<string>('musk');
  const [useGoldenArmor, setUseGoldenArmor] = useState<boolean>(false);

  // A2A Fighter Selection State
  const [a2aLeftId, setA2aLeftId] = useState<string>('musk');
  const [a2aRightId, setA2aRightId] = useState<string>('huang');
  const [a2aPaused, setA2aPaused] = useState<boolean>(false);
  const [a2aSpeed, setA2aSpeed] = useState<number>(1);

  // Match & Round Scoring State
  const [round, setRound] = useState<number>(1);
  const maxRounds = 5;
  const [roundTimerSeconds, setRoundTimerSeconds] = useState<number>(90);
  const [leftRoundsWon, setLeftRoundsWon] = useState<number>(0);
  const [rightRoundsWon, setRightRoundsWon] = useState<number>(0);
  const [strikerSide, setStrikerSide] = useState<'LEFT' | 'RIGHT'>('LEFT');
  const [turnPhase, setTurnPhase] = useState<TurnPhase>('PLAYER_STRIKE_PREP');

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

  // Comeback Buffs & Knockdown State
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
    'Cheek Alignment Phase — Tap Cheek Target & Cadence Count to hover palm over opponent cheek'
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
      if (
        gameMode === 'STORY' &&
        side === 'RIGHT' &&
        fighter.storyChapter === 10
      ) {
        return {
          power: 93,
          chinDurability: 89,
          precision: 95,
          windUpSpeed: 88,
          koResistance: 94,
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

  // Sync Cheek Alignment Phase in 3D Scene during Player Prep
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
        setTurnPhase('PLAYER_STRIKE_PREP');
        setStatusBanner(
          `Cheek Alignment vs ${rFighter.name} — Tap Cheek Target & Count to hover palm over cheek`
        );
      } else {
        setTurnPhase('A2A_THINKING');
        setStatusBanner(
          `A2A Match: ${lFighter.name} vs ${rFighter.name} — Cheek alignment in progress`
        );
      }
    },
    [gameMode, storyChapter, playerFighterId, a2aLeftId, a2aRightId]
  );

  // Oscillating Timing Cursor for Strike Meter, Defense Brace, and KO Recovery Mini-Game
  useEffect(() => {
    if (
      turnPhase !== 'PLAYER_STRIKE_METER' &&
      turnPhase !== 'PLAYER_DEFENSE_BRACE' &&
      turnPhase !== 'KO_RECOVERY_MINIGAME'
    ) {
      return;
    }

    let animId = 0;
    const startTime = performance.now();

    let speedRadPerSec = 4.2;
    if (turnPhase === 'PLAYER_STRIKE_METER') {
      speedRadPerSec =
        selectedWindUp === 1 ? 3.5 : selectedWindUp === 2 ? 4.8 : 6.2;
    } else if (turnPhase === 'PLAYER_DEFENSE_BRACE') {
      speedRadPerSec = 4.9;
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

  // Handle Round End & Transition to Next Round (or Match End)
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

      if (roundWinnerSide === 'LEFT' || roundWinnerSide === 'RIGHT') {
        sceneControllerRef.current?.triggerVictoryPose(roundWinnerSide);
      }

      const isFinalKO =
        nextLeftWins >= 3 || nextRightWins >= 3 || round >= maxRounds;

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
        `${reasonText} • Preparing Round ${round + 1} of ${maxRounds}`
      );

      setTimeout(() => {
        const nextRoundNum = round + 1;
        setRound(nextRoundNum);
        setRoundTimerSeconds(90);
        setLeftKnockdownsThisRound(0);
        setRightKnockdownsThisRound(0);
        setLeftHP((prev) => Math.min(100, Math.max(48, prev + 28)));
        setRightHP((prev) => Math.min(100, Math.max(48, prev + 28)));
        setLeftFatigue((prev) => Math.max(0, prev - 10));
        setRightFatigue((prev) => Math.max(0, prev - 10));
        setPracticeTapCount(0);
        setTorqueCharge(0);
        setDefenseTapBoost(0);
        setImpactPopupText(null);

        sceneControllerRef.current?.resetFightersToStance();
        sceneControllerRef.current?.setCameraPreset('BROADCAST_WIDE');
        setCameraPreset('BROADCAST_WIDE');

        const nextStarter: 'LEFT' | 'RIGHT' =
          nextRoundNum % 2 === 1 ? 'LEFT' : 'RIGHT';
        setStrikerSide(nextStarter);

        if (gameMode === 'STORY') {
          if (nextStarter === 'LEFT') {
            setTurnPhase('PLAYER_STRIKE_PREP');
            setStatusBanner(
              `Round ${nextRoundNum} • Tap Cheek Target & Count to align palm`
            );
          } else {
            sceneControllerRef.current?.triggerCheekLineUp(
              'RIGHT',
              2,
              'MID_CHEEK'
            );
            setTurnPhase('PLAYER_DEFENSE_BRACE');
            setStatusBanner(
              `Round ${nextRoundNum} • ${rightFighter.name} aligns palm to your cheek — Tap to Brace Chin`
            );
          }
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

  // 10-Count Countdown & Autonomous A2A KO Recovery Execution
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
            `${koSpec.name} • ${downedFighter.name} failed the 10-Count • ${winnerFighter.name} wins Round ${round}`,
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

  // Execute a 5-Phase Slap Exchange
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
            `${strikerProfile.name} • Shoulder Torque Load "ON ${windUpCount}" (${i}/${windUpCount})`
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

          soundEngine.playSlapImpact(result.finalDamage, result.isCriticalSlap);
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

          if (result.isKO && result.koType !== 'NONE') {
            const koDef = KO_TYPE_DEFINITIONS[result.koType];
            setIsKOReplayActive(true);
            setStatusBanner(
              `KO REPLAY CAMERA • ${koDef.name} • ${result.commentaryLine}`
            );

            if (defenderSide === 'LEFT') {
              setLeftKnockdownsThisRound((k) => k + 1);
            } else {
              setRightKnockdownsThisRound((k) => k + 1);
            }

            setTimeout(() => {
              setDownedSide(defenderSide);
              setActiveKOType(result.koType as Exclude<KOType, 'NONE'>);
              setTurnPhase('KO_RECOVERY_MINIGAME');
              setStatusBanner(
                `${koDef.name} • ${defenderProfile.name} DOWN • 10-Count Recovery Active`
              );
            }, 1550 / speedFactor);
            return;
          }

          setStatusBanner(result.commentaryLine);

          setTimeout(() => {
            if (activeStriker === 'RIGHT') {
              if (round >= maxRounds) {
                const roundWinner =
                  leftHP > nextDefenderHP
                    ? 'LEFT'
                    : nextDefenderHP > leftHP
                      ? 'RIGHT'
                      : 'DRAW';
                ConcludeRound(
                  roundWinner,
                  `Judges' Decision after ${maxRounds} rounds`,
                  'NONE'
                );
                return;
              }
            }

            const nextStriker = activeStriker === 'LEFT' ? 'RIGHT' : 'LEFT';
            setStrikerSide(nextStriker);
            setPracticeTapCount(0);
            setTorqueCharge(0);
            setDefenseTapBoost(0);

            if (gameMode === 'STORY') {
              if (nextStriker === 'LEFT') {
                setTurnPhase('PLAYER_STRIKE_PREP');
                setStatusBanner(
                  `Cheek Alignment Phase • Tap Cheek Target & Count to align palm`
                );
              } else {
                sceneControllerRef.current?.triggerCheekLineUp(
                  'RIGHT',
                  2,
                  'MID_CHEEK'
                );
                setTurnPhase('PLAYER_DEFENSE_BRACE');
                setStatusBanner(
                  `${rightFighter.name} hovers palm at your cheek • Tap to Brace Chin`
                );
              }
            } else {
              setTurnPhase('A2A_THINKING');
            }
          }, 1650 / speedFactor);
        },
        windUpCount * beatInterval + 140
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

  // Autonomous A2A Turn Loop
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

    setTimeout(() => {
      sceneControllerRef.current?.updatePracticeSwingAndTorque(
        activeStriker,
        0.75
      );
    }, 350 / a2aSpeed);

    setA2aThoughtText(decision.emotionalThought);
    setStatusBanner(
      `${sFighter.name} aligns palm to ${dFighter.name}'s ${decision.chosenAngle.replace('_', ' ')} • "On ${decision.chosenWindUp}"`
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
    }, 1050 / a2aSpeed);

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

  const handleLockCheekLineUp = () => {
    setPracticeTapCount(0);
    setTorqueCharge(0.2);
    soundEngine.playCountBeep(2);
    sceneControllerRef.current?.triggerCheekLineUp(
      'LEFT',
      selectedWindUp,
      selectedAngle
    );
    setTurnPhase('PLAYER_STRIKE_METER');
    setStatusBanner(
      'Flinch-Bait & Torque Phase — Tap FLINCH-BAIT SWING to load shoulder torque, then Tap UNLEASH SLAP'
    );
  };

  const handleTapPracticeSwing = () => {
    if (turnPhase !== 'PLAYER_STRIKE_METER') return;
    const nextTaps = practiceTapCount + 1;
    const nextTorque = Math.min(1, torqueCharge + 0.18);
    setPracticeTapCount(nextTaps);
    setTorqueCharge(nextTorque);
    soundEngine.playCountBeep((nextTaps % 3) + 1);
    sceneControllerRef.current?.updatePracticeSwingAndTorque('LEFT', nextTorque);
  };

  const handlePlayerUnleashSlap = () => {
    if (turnPhase !== 'PLAYER_STRIKE_METER') return;
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
        `BEATS THE COUNT • ${leftFighter.name} recovers at ${koDef.recoveredHPPercent}% Chin Durability (${koDef.comebackBuffName})`
      );

      setTimeout(() => {
        setStrikerSide('LEFT');
        setPracticeTapCount(0);
        setTorqueCharge(0);
        setTurnPhase('PLAYER_STRIKE_PREP');
      }, 1150);
    } else {
      soundEngine.playKOBassDrop();
      ConcludeRound(
        'RIGHT',
        `RECOVERY FAILED • ${leftFighter.name} missed recovery window (${koDef.name}) • ${rightFighter.name} wins Round ${round}`,
        activeKOType
      );
    }
  };

  const handleCycleCamera = () => {
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
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    soundEngine.muted = nextMuted;
  };

  const activeKODef = KO_TYPE_DEFINITIONS[activeKOType];
  const globalSlapForceValue = lastSlapResult
    ? Math.round(lastSlapResult.slapForce)
    : Math.round(85 + torqueCharge * 95);
  const koProximityDanger =
    leftHP <= 42 ||
    rightHP <= 42 ||
    (lastSlapResult && lastSlapResult.overkillRatio >= 0.85);

  const formattedTimer = `${Math.floor(roundTimerSeconds / 60)}:${String(
    roundTimerSeconds % 60
  ).padStart(2, '0')}`;

  return (
    <div
      className={`relative w-screen h-[100dvh] overflow-hidden bg-[#050811] select-none font-sans transition-transform duration-150 ${
        hudShake ? 'translate-x-1.5 -translate-y-1' : ''
      }`}
    >
      {/* Full-Viewport 3D WebGL Arena Canvas */}
      <div
        ref={canvasContainerRef}
        className="absolute inset-0 w-full h-full z-0"
      />

      {/* Mid-Screen Impact Force & KO Callout Overlay */}
      {impactPopupText && (
        <div className="absolute inset-x-0 top-36 sm:top-40 z-20 flex justify-center pointer-events-none px-4">
          <div className="font-display text-xl sm:text-4xl font-extrabold uppercase tracking-wider bg-gradient-to-b from-[#FFF3B0] via-[#F59E0B] to-[#EF4444] bg-clip-text text-transparent drop-shadow-[0_4px_24px_rgba(245,158,11,0.85)] text-center">
            {impactPopupText}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TOP GLASS-MORPH HUD: Gold Banner + Frosted Glass Stats Strip          */}
      {/* ===================================================================== */}
      <header
        className={`relative z-10 w-full transition-opacity duration-500 pointer-events-none ${
          isKOReplayActive ? 'opacity-45' : 'opacity-100'
        }`}
      >
        {/* 1. SMACK DADDY CHAMPIONSHIPS WIDE GLOWING GOLD BANNER */}
        <div className="w-full bg-gradient-to-r from-[#040710]/85 via-[#0F172A]/85 to-[#040710]/85 border-b border-[#D4AF37]/50 px-3 sm:px-6 py-1.5 flex flex-wrap items-center justify-between gap-2 pointer-events-auto shadow-[0_4px_20px_rgba(212,175,55,0.18)]">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-base sm:text-2xl tracking-[0.14em] uppercase font-extrabold bg-gradient-to-b from-[#FFF3B0] via-[#D4AF37] to-[#9A7418] bg-clip-text text-transparent drop-shadow-[0_0_14px_rgba(212,175,55,0.55)]">
              SMACK DADDY CHAMPIONSHIPS
            </h1>
            <span className="hidden md:inline font-mono text-[10px] tracking-[0.2em] uppercase text-[#FFF3B0]/80">
              BATTLE OF THE TITANS • TECH GIANTS COLLIDE
            </span>
          </div>

          <nav className="flex items-center gap-2.5 sm:gap-4 text-[11px] sm:text-xs font-mono uppercase tracking-wider">
            <button
              onClick={() => {
                setGameMode('STORY');
                resetMatch('STORY', storyChapter);
              }}
              className={`min-h-[34px] px-2 cursor-pointer transition-all ${
                gameMode === 'STORY'
                  ? 'text-[#FFF3B0] font-bold border-b-2 border-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.85)]'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              1P Story
            </button>
            <button
              onClick={() => {
                setGameMode('A2A');
                resetMatch('A2A', storyChapter);
              }}
              className={`min-h-[34px] px-2 cursor-pointer transition-all ${
                gameMode === 'A2A'
                  ? 'text-[#00F0FF] font-bold border-b-2 border-[#00F0FF] drop-shadow-[0_0_8px_rgba(0,240,255,0.85)]'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              A2A Auto
            </button>
            <button
              onClick={() => setShowContenderStrip((v) => !v)}
              className={`min-h-[34px] px-2 cursor-pointer transition-all ${
                showContenderStrip
                  ? 'text-[#D4AF37] font-bold border-b-2 border-[#D4AF37]'
                  : 'text-[#E2E8F0] hover:text-[#FFF3B0]'
              }`}
            >
              10 Contenders
            </button>
            <button
              onClick={() => setIsCodexOpen(true)}
              className="min-h-[34px] px-1.5 text-[#94A3B8] hover:text-[#FFF3B0] cursor-pointer"
            >
              Roster
            </button>
            <button
              onClick={() => setIsPhysicsModalOpen(true)}
              className="min-h-[34px] px-1.5 text-[#94A3B8] hover:text-[#00F0FF] cursor-pointer"
            >
              KO Spec
            </button>
            <button
              onClick={handleCycleCamera}
              className="min-h-[34px] px-1.5 text-[#94A3B8] hover:text-[#D4AF37] cursor-pointer"
            >
              Cam
            </button>
            <button
              onClick={handleToggleMute}
              className="min-h-[34px] px-1.5 text-[#94A3B8] hover:text-white cursor-pointer"
            >
              {isMuted ? 'Muted' : 'Audio'}
            </button>
          </nav>
        </div>

        {/* 2. FROSTED GLASS-MORPH STATS BAR (Directly Under Banner, Above Fighters) */}
        <div className="w-full bg-gradient-to-r from-[#070C18]/75 via-[#0E172A]/70 to-[#070C18]/75 border-b border-[#00F0FF]/30 shadow-[0_8px_32px_rgba(0,240,255,0.12)] px-3 sm:px-6 py-2 pointer-events-auto">
          <div className="max-w-[1600px] mx-auto grid grid-cols-12 items-center gap-2">
            {/* LEFT FIGHTER: Circular Chin-Durability Portrait Medallion + Floating Glass-Morph Stats */}
            <div className="col-span-5 flex items-center gap-2.5 min-w-0">
              <button
                onClick={() => setShowContenderStrip((v) => !v)}
                className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center cursor-pointer"
                title="Tap to switch contender"
              >
                <svg
                  className="absolute inset-0 w-full h-full -rotate-90"
                  viewBox="0 0 56 56"
                >
                  <circle
                    cx="28"
                    cy="28"
                    r="25"
                    fill="none"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="3.5"
                  />
                  <circle
                    cx="28"
                    cy="28"
                    r="25"
                    fill="none"
                    stroke={
                      leftHP > 55
                        ? '#00F0FF'
                        : leftHP > 28
                          ? '#F59E0B'
                          : '#EF4444'
                    }
                    strokeWidth="3.5"
                    strokeDasharray={`${(leftHP / 100) * 157} 157`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden bg-[#0F172A]">
                  <img
                    src={leftFighter.imageUrl}
                    alt={leftFighter.name}
                    className="w-full h-[125%] object-cover object-top"
                  />
                </div>
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-sm sm:text-lg font-extrabold uppercase tracking-wide text-[#00F0FF] drop-shadow-[0_0_8px_rgba(0,240,255,0.45)] truncate">
                    {leftFighter.name}
                  </span>
                  <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-widest text-[#94A3B8]">
                    {leftFighter.company}
                  </span>
                  {strikerSide === 'LEFT' && (
                    <span className="font-mono text-[10px] uppercase text-[#FFF3B0] font-bold">
                      • STRIKING
                    </span>
                  )}
                </div>
                <p className="font-mono text-[10px] sm:text-[11px] text-[#E2E8F0] leading-snug truncate sm:whitespace-normal">
                  Power <strong className="text-white">{leftEffectiveStats.power}</strong> • Precision{' '}
                  <strong className="text-white">{leftEffectiveStats.precision}</strong> • Wind-Up{' '}
                  <strong className="text-white">{leftEffectiveStats.windUpSpeed}</strong> • Chin{' '}
                  <strong className="text-[#00F0FF]">{leftHP}%</strong> • KO Res{' '}
                  <strong className="text-white">{leftEffectiveStats.koResistance}</strong> •{' '}
                  <span className="text-[#00F0FF]">{leftFighter.specialName}</span>
                </p>
              </div>
            </div>

            {/* CENTER: Round Indicator • Slap-Force Meter • Crowd Hype Meter */}
            <div className="col-span-2 flex flex-col items-center justify-center text-center">
              <div className="font-display text-xs sm:text-base font-extrabold uppercase tracking-widest text-[#FFF3B0]">
                Round {round}/{maxRounds} ({leftRoundsWon}–{rightRoundsWon})
              </div>
              <div className="font-mono text-[9px] sm:text-[11px] text-[#00F0FF] tabular-nums">
                Force {globalSlapForceValue} N • Hype {crowdHypePercent}%
              </div>
            </div>

            {/* RIGHT FIGHTER: Floating Glass-Morph Stats + Circular Chin-Durability Portrait Medallion */}
            <div className="col-span-5 flex items-center justify-end gap-2.5 min-w-0">
              <div className="min-w-0 flex-1 text-right">
                <div className="flex items-baseline justify-end gap-2">
                  {strikerSide === 'RIGHT' && (
                    <span className="font-mono text-[10px] uppercase text-[#FFF3B0] font-bold">
                      STRIKING •
                    </span>
                  )}
                  <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-widest text-[#94A3B8]">
                    {rightFighter.company}
                  </span>
                  <span className="font-display text-sm sm:text-lg font-extrabold uppercase tracking-wide text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.45)] truncate">
                    {rightFighter.name}
                  </span>
                </div>
                <p className="font-mono text-[10px] sm:text-[11px] text-[#E2E8F0] leading-snug truncate sm:whitespace-normal">
                  Power <strong className="text-white">{rightEffectiveStats.power}</strong> • Precision{' '}
                  <strong className="text-white">{rightEffectiveStats.precision}</strong> • Wind-Up{' '}
                  <strong className="text-white">{rightEffectiveStats.windUpSpeed}</strong> • Chin{' '}
                  <strong className="text-[#D4AF37]">{rightHP}%</strong> • KO Res{' '}
                  <strong className="text-white">{rightEffectiveStats.koResistance}</strong> •{' '}
                  <span className="text-[#D4AF37]">{rightFighter.specialName}</span>
                </p>
              </div>

              <button
                onClick={() => setShowContenderStrip((v) => !v)}
                className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center cursor-pointer"
                title="Tap to switch opponent"
              >
                <svg
                  className="absolute inset-0 w-full h-full -rotate-90"
                  viewBox="0 0 56 56"
                >
                  <circle
                    cx="28"
                    cy="28"
                    r="25"
                    fill="none"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="3.5"
                  />
                  <circle
                    cx="28"
                    cy="28"
                    r="25"
                    fill="none"
                    stroke={
                      rightHP > 55
                        ? '#D4AF37'
                        : rightHP > 28
                          ? '#F59E0B'
                          : '#EF4444'
                    }
                    strokeWidth="3.5"
                    strokeDasharray={`${(rightHP / 100) * 157} 157`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden bg-[#0F172A]">
                  <img
                    src={rightFighter.imageUrl}
                    alt={rightFighter.name}
                    className="w-full h-[125%] object-cover object-top"
                  />
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible 10 Uploaded Contenders Strip */}
        {showContenderStrip && (
          <div className="w-full bg-[#070B14]/88 border-b border-[#D4AF37]/40 px-4 py-2 pointer-events-auto flex items-center gap-3 overflow-x-auto">
            {FIGHTERS.map((f) => {
              const isLeft =
                (gameMode === 'STORY' && playerFighterId === f.id) ||
                (gameMode === 'A2A' && a2aLeftId === f.id);
              const isRight =
                (gameMode === 'STORY' && storyChapter === f.storyChapter) ||
                (gameMode === 'A2A' && a2aRightId === f.id);
              return (
                <div
                  key={f.id}
                  className="shrink-0 flex items-center gap-2 pr-3 border-r border-white/10"
                >
                  <img
                    src={f.imageUrl}
                    alt={f.name}
                    className="w-9 h-9 rounded-full object-cover object-top border border-[#D4AF37]/50"
                  />
                  <div className="flex flex-col">
                    <span className="font-display text-xs font-bold uppercase text-white">
                      {f.name}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <button
                        onClick={() => {
                          if (gameMode === 'STORY') setPlayerFighterId(f.id);
                          else setA2aLeftId(f.id);
                          setTimeout(() => resetMatch(), 20);
                        }}
                        className={`cursor-pointer ${
                          isLeft
                            ? 'text-[#00F0FF] font-bold underline'
                            : 'text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        Set P1
                      </button>
                      <button
                        onClick={() => {
                          if (gameMode === 'STORY')
                            setStoryChapter(f.storyChapter);
                          else setA2aRightId(f.id);
                          setTimeout(
                            () => resetMatch(gameMode, f.storyChapter),
                            20
                          );
                        }}
                        className={`cursor-pointer ${
                          isRight
                            ? 'text-[#D4AF37] font-bold underline'
                            : 'text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        Set Opponent
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </header>

      {/* ===================================================================== */}
      {/* BOTTOM GLASS-MORPH HUD: Slap-Force Meters, Chin Rings & Tap Controls  */}
      {/* ===================================================================== */}
      <footer
        className={`absolute bottom-0 inset-x-0 z-10 pointer-events-none transition-opacity duration-500 ${
          isKOReplayActive ? 'opacity-50' : 'opacity-100'
        }`}
      >
        <div className="w-full bg-gradient-to-r from-[#060A14]/80 via-[#0E172A]/78 to-[#060A14]/80 border-t border-[#D4AF37]/45 shadow-[0_-8px_32px_rgba(0,0,0,0.7)] px-3 sm:px-6 py-2.5 pointer-events-auto">
          <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 items-center gap-3">
            {/* LEFT BOTTOM: Fighter 1 Slap-Force Meter • Chin Durability */}
            <div className="hidden lg:flex lg:col-span-3 items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px] text-[#E2E8F0] truncate">
                  <span className="text-[#00F0FF] font-bold">
                    {leftFighter.name}
                  </span>{' '}
                  • Slap-Force • Chin {leftHP}%
                </div>
                <div className="w-full h-2 bg-white/10 overflow-hidden mt-1">
                  <div
                    className="h-full bg-gradient-to-r from-[#00F0FF] via-[#FACC15] to-[#EF4444] transition-all duration-200"
                    style={{
                      width: `${
                        strikerSide === 'LEFT'
                          ? Math.max(28, Math.min(100, 35 + torqueCharge * 65))
                          : 24
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* CENTER BOTTOM: KO Shockwave Indicator • Round Timer • Tap Controls */}
            <div className="lg:col-span-6 flex flex-col items-center text-center gap-2">
              <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-[11px] tracking-wide">
                <span
                  className={
                    koProximityDanger
                      ? 'text-[#EF4444] font-bold drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                      : 'text-[#FFF3B0]'
                  }
                >
                  KO Shockwave:{' '}
                  {koProximityDanger ? 'CRITICAL THRESHOLD' : 'ARMED'}
                </span>
                <span className="text-white/25">•</span>
                <span className="text-[#00F0FF] tabular-nums">
                  Timer {formattedTimer}
                </span>
                <span className="text-white/25">•</span>
                <span className="text-[#E2E8F0] truncate max-w-md">
                  {statusBanner}
                </span>
              </div>

              {/* 1P STORY MODE: Phase 1 Cheek Alignment Tap Controls */}
              {gameMode === 'STORY' && turnPhase === 'PLAYER_STRIKE_PREP' && (
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                  {(
                    [
                      { id: 'MID_CHEEK', label: 'Mid Cheek' },
                      { id: 'JAWLINE_LEVER', label: 'Jawline' },
                      { id: 'HIGH_TEMPLE', label: 'High Temple' },
                    ] as { id: SlapAngle; label: string }[]
                  ).map((ang) => (
                    <button
                      key={ang.id}
                      onClick={() => handleSelectCheekAngle(ang.id)}
                      className={`min-h-[40px] px-3 font-mono text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                        selectedAngle === ang.id
                          ? 'border-[#00F0FF] text-[#00F0FF] font-bold bg-[#00F0FF]/10'
                          : 'border-transparent text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {ang.label}
                    </button>
                  ))}

                  <span className="text-white/20">|</span>

                  {([1, 2, 3] as WindUpCount[]).map((cnt) => (
                    <button
                      key={cnt}
                      onClick={() => handleSelectWindUp(cnt)}
                      className={`min-h-[40px] px-3 font-mono text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                        selectedWindUp === cnt
                          ? 'border-[#D4AF37] text-[#FFF3B0] font-bold bg-[#D4AF37]/15'
                          : 'border-transparent text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      On {cnt}
                    </button>
                  ))}

                  {leftSpecialReady && (
                    <button
                      onClick={() => {
                        const next = !leftSpecialActive;
                        setLeftSpecialActive(next);
                        sceneControllerRef.current?.setSpecialAura(
                          'LEFT',
                          next
                        );
                      }}
                      className={`min-h-[40px] px-3 font-mono text-xs uppercase border-b-2 cursor-pointer ${
                        leftSpecialActive
                          ? 'border-[#00E676] text-[#00E676] font-bold bg-[#00E676]/15'
                          : 'border-transparent text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      Special
                    </button>
                  )}

                  <button
                    onClick={handleLockCheekLineUp}
                    className="min-h-[44px] px-5 bg-gradient-to-r from-[#D4AF37]/30 via-[#FFF3B0]/35 to-[#D4AF37]/30 border border-[#D4AF37] font-display text-sm sm:text-base font-extrabold uppercase tracking-wider text-[#FFF3B0] hover:text-white shadow-[0_0_20px_rgba(212,175,55,0.4)] cursor-pointer active:scale-95"
                  >
                    TAP TO LOCK CHEEK ALIGNMENT
                  </button>
                </div>
              )}

              {/* 1P STORY MODE: Phase 2-5 Flinch-Bait Torque Tap & Slap Execution Tap */}
              {gameMode === 'STORY' && turnPhase === 'PLAYER_STRIKE_METER' && (
                <div className="w-full max-w-xl flex flex-col items-center gap-2">
                  <div className="relative w-full h-3 bg-white/10 overflow-hidden">
                    <div
                      className="absolute inset-y-0 bg-gradient-to-r from-[#00F0FF]/45 via-[#FACC15]/75 to-[#EF4444]/45"
                      style={{ left: '34%', width: '32%' }}
                    />
                    <div
                      className="absolute inset-y-0 w-2 bg-white shadow-[0_0_12px_#FFFFFF]"
                      style={{ left: `calc(${timingCursor * 100}% - 4px)` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 w-full">
                    <button
                      onClick={handleTapPracticeSwing}
                      className="flex-1 min-h-[46px] px-4 bg-[#00F0FF]/15 border border-[#00F0FF] font-display text-sm sm:text-base font-extrabold uppercase tracking-wider text-[#00F0FF] hover:text-white shadow-[0_0_18px_rgba(0,240,255,0.35)] cursor-pointer active:scale-95"
                    >
                      TAP! FLINCH-BAIT &amp; TORQUE (+
                      {Math.round(torqueCharge * 25)}%)
                    </button>
                    <button
                      onClick={handlePlayerUnleashSlap}
                      className="flex-1 min-h-[46px] px-5 bg-gradient-to-r from-[#D4AF37]/40 via-[#EF4444]/45 to-[#D4AF37]/40 border border-[#FFF3B0] font-display text-base sm:text-lg font-extrabold uppercase tracking-wider text-[#FFF3B0] hover:text-white shadow-[0_0_24px_rgba(245,158,11,0.55)] cursor-pointer active:scale-95"
                    >
                      TAP TO UNLEASH SLAP!
                    </button>
                  </div>
                </div>
              )}

              {/* 1P STORY MODE: Defensive Chin Brace Tap */}
              {gameMode === 'STORY' && turnPhase === 'PLAYER_DEFENSE_BRACE' && (
                <div className="w-full max-w-xl flex flex-col items-center gap-2">
                  <div className="relative w-full h-3 bg-white/10 overflow-hidden">
                    <div
                      className="absolute inset-y-0 bg-[#00F0FF]/55"
                      style={{ left: '38%', width: '24%' }}
                    />
                    <div
                      className="absolute inset-y-0 w-2 bg-white shadow-[0_0_12px_#FFFFFF]"
                      style={{ left: `calc(${timingCursor * 100}% - 4px)` }}
                    />
                  </div>
                  <button
                    onClick={handleTapChinBrace}
                    className="w-full min-h-[46px] px-6 bg-[#00F0FF]/20 border border-[#00F0FF] font-display text-base sm:text-lg font-extrabold uppercase tracking-wider text-[#00F0FF] hover:text-white shadow-[0_0_20px_rgba(0,240,255,0.45)] cursor-pointer active:scale-95"
                  >
                    TAP TO BRACE CHIN &amp; ABSORB IMPACT!
                  </button>
                </div>
              )}

              {/* 10-COUNT KO RECOVERY TIMING MINI-GAME */}
              {turnPhase === 'KO_RECOVERY_MINIGAME' && (
                <div className="w-full max-w-xl flex flex-col items-center gap-2">
                  <div className="font-mono text-xs uppercase tracking-wider text-[#EF4444] font-bold">
                    {activeKODef.name} • 10-Count Recovery:{' '}
                    {(10 - tenCountSeconds).toFixed(1)}s / 10.0s
                  </div>
                  <div className="relative w-full h-3 bg-white/10 overflow-hidden">
                    <div
                      className="absolute inset-y-0 bg-[#00E676]/70"
                      style={{
                        left: `${(0.5 - activeKODef.recoveryWindowWidth * 0.5) * 100}%`,
                        width: `${activeKODef.recoveryWindowWidth * 100}%`,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 w-2 bg-white shadow-[0_0_12px_#FFFFFF]"
                      style={{ left: `calc(${timingCursor * 100}% - 4px)` }}
                    />
                  </div>
                  {gameMode === 'STORY' && downedSide === 'LEFT' ? (
                    <button
                      onClick={handlePlayerAttemptKORecovery}
                      className="w-full min-h-[46px] px-6 bg-[#00E676]/25 border border-[#00E676] font-display text-base sm:text-lg font-extrabold uppercase tracking-wider text-[#00E676] hover:text-white shadow-[0_0_20px_rgba(0,230,118,0.5)] cursor-pointer active:scale-95"
                    >
                      TAP GREEN ZONE TO BEAT THE 10-COUNT!
                    </button>
                  ) : (
                    <span className="font-mono text-xs text-[#00F0FF]">
                      Autonomous neural recovery check in progress...
                    </span>
                  )}
                </div>
              )}

              {/* A2A AUTONOMOUS MODE CONTROLS */}
              {gameMode === 'A2A' && turnPhase !== 'KO_RECOVERY_MINIGAME' && (
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono">
                  <button
                    onClick={() => setA2aPaused(!a2aPaused)}
                    className="min-h-[38px] px-3 border border-[#D4AF37]/60 text-[#FFF3B0] hover:text-white font-bold uppercase cursor-pointer"
                  >
                    {a2aPaused ? 'Resume Simulation' : 'Pause Simulation'}
                  </button>
                  {[1, 2].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setA2aSpeed(spd)}
                      className={`min-h-[38px] px-3 cursor-pointer ${
                        a2aSpeed === spd
                          ? 'text-[#00F0FF] font-bold border-b-2 border-[#00F0FF]'
                          : 'text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {spd}x Speed
                    </button>
                  ))}
                  <button
                    onClick={() => resetMatch()}
                    className="min-h-[38px] px-3 text-[#94A3B8] hover:text-white uppercase cursor-pointer"
                  >
                    Reset Match
                  </button>
                  <span className="text-[#94A3B8] truncate max-w-sm">
                    {a2aThoughtText}
                  </span>
                </div>
              )}

              {/* MATCH OVER CONTROLS */}
              {turnPhase === 'MATCH_OVER' && (
                <div className="flex flex-wrap items-center justify-center gap-4 font-display text-base uppercase tracking-wider">
                  <span className="text-[#FFF3B0] font-extrabold">
                    {matchWinner === 'LEFT'
                      ? `${leftFighter.name} WINS`
                      : matchWinner === 'RIGHT'
                        ? `${rightFighter.name} WINS`
                        : 'DRAW MATCH'}
                  </span>
                  <button
                    onClick={() => resetMatch()}
                    className="min-h-[42px] px-4 border border-[#00F0FF] text-[#00F0FF] hover:text-white font-bold cursor-pointer"
                  >
                    Rematch
                  </button>
                  {gameMode === 'STORY' &&
                    matchWinner === 'LEFT' &&
                    storyChapter < 10 && (
                      <button
                        onClick={() => {
                          const nextChap = storyChapter + 1;
                          setStoryChapter(nextChap);
                          resetMatch('STORY', nextChap);
                        }}
                        className="min-h-[42px] px-4 border border-[#D4AF37] text-[#FFF3B0] hover:text-white font-extrabold cursor-pointer"
                      >
                        Next Arena: Ch. {storyChapter + 1}
                      </button>
                    )}
                </div>
              )}
            </div>

            {/* RIGHT BOTTOM: Fighter 2 Slap-Force Meter • Chin Durability */}
            <div className="hidden lg:flex lg:col-span-3 items-center justify-end gap-3">
              <div className="min-w-0 flex-1 text-right">
                <div className="font-mono text-[11px] text-[#E2E8F0] truncate">
                  Chin {rightHP}% • Slap-Force •{' '}
                  <span className="text-[#D4AF37] font-bold">
                    {rightFighter.name}
                  </span>
                </div>
                <div className="w-full h-2 bg-white/10 overflow-hidden mt-1">
                  <div
                    className="h-full ml-auto bg-gradient-to-l from-[#00F0FF] via-[#FACC15] to-[#EF4444] transition-all duration-200"
                    style={{
                      width: `${
                        strikerSide === 'RIGHT'
                          ? Math.max(28, Math.min(100, 75))
                          : 24
                      }%`,
                    }}
                  />
                </div>
              </div>
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
        onSelectPlayerFighter={(id) => {
          if (gameMode === 'STORY') {
            setPlayerFighterId(id);
          } else {
            setA2aLeftId(id);
          }
          setTimeout(() => resetMatch(), 25);
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
            `KO REPLAY CAMERA • ${KO_TYPE_DEFINITIONS[koType].name} • ${rightFighter.name} DOWN`
          );
        }}
      />
    </div>
  );
}
