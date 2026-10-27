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
        setTurnPhase('PLAYER_STRIKE_PREP');
        setStatusBanner(
          `Cheek Alignment vs ${rFighter.name} — Tap Cheek Target & Count to line up palm`
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

  // Conclude Round
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
              `Round ${nextRoundNum} • ${rightFighter.name} measures your cheek — Brace Chin!`
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

          if (result.isKO && result.koType !== 'NONE') {
            const koDef = KO_TYPE_DEFINITIONS[result.koType];
            setIsKOReplayActive(true);
            setStatusBanner(
              `KO REPLAY • ${koDef.name} • ${result.commentaryLine}`
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
                `${koDef.name} • ${defenderProfile.name} DOWN • 10-Count Active`
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
                  `Cheek Alignment Phase • Tap Cheek Target & Count to line up palm`
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

    // 30% chance of pre-slap fakeout bluff for aggressive AI fighters
    const shouldFakeout =
      Math.random() < 0.3 &&
      (sFighter.id === 'musk' || sFighter.id === 'ellison' || sFighter.id === 'bezos');

    if (shouldFakeout) {
      setTimeout(() => {
        sceneControllerRef.current?.triggerFakeout(activeStriker);
        setImpactPopupText(`FAKEOUT! ${sFighter.name.toUpperCase()} BLUFFS!`);

        // Check if defender flinches (50% chance)
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
    }, (shouldFakeout ? 1650 : 1050) / a2aSpeed);

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
      'Flinch-Bait & Torque Phase — Tap TORQUE SWING, or TRIGGER FAKEOUT, then UNLEASH SLAP'
    );
  };

  // Interactive Player Fakeout Trigger
  const handlePlayerTriggerFakeout = () => {
    if (turnPhase !== 'PLAYER_STRIKE_METER') return;
    sceneControllerRef.current?.triggerFakeout('LEFT');
    setImpactPopupText('DECOY WIND-UP! TESTING THE AIR!');

    // 55% chance AI opponent flinches!
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

  // Interactive Taunt Trigger (Triggers signature CEO celebration & voice line!)
  const handleTriggerTaunt = () => {
    sceneControllerRef.current?.triggerTaunt(strikerSide);
    const activeProfile = strikerSide === 'LEFT' ? leftFighter : rightFighter;
    setImpactPopupText(`${activeProfile.name.toUpperCase()} TAUNTS!`);
    setTimeout(() => setImpactPopupText(null), 1600);
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
        `BEATS THE COUNT • ${leftFighter.name} recovers at ${koDef.recoveredHPPercent}% Chin (${koDef.comebackBuffName})`
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

  // Keyboard shortcuts (H: Toggle HUD Dock, C: Camera, T: Taunt, F: Fakeout, Space: Action)
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
      } else if (key === 'f' && gameMode === 'STORY' && turnPhase === 'PLAYER_STRIKE_METER') {
        handlePlayerTriggerFakeout();
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (gameMode === 'STORY') {
          if (turnPhase === 'PLAYER_STRIKE_PREP') handleLockCheekLineUp();
          else if (turnPhase === 'PLAYER_STRIKE_METER') handlePlayerUnleashSlap();
          else if (turnPhase === 'PLAYER_DEFENSE_BRACE') handleTapChinBrace();
          else if (turnPhase === 'KO_RECOVERY_MINIGAME' && downedSide === 'LEFT') {
            handlePlayerAttemptKORecovery();
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

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
      className={`w-screen h-[100dvh] flex flex-col justify-between overflow-hidden bg-[#050811] select-none font-sans transition-transform duration-150 ${
        hudShake ? 'translate-x-1 -translate-y-1' : ''
      }`}
    >
      {/* ===================================================================== */}
      {/* 1. TOP HEADER & SCOREBOARD (Strictly flex-none, max 18% height)        */}
      {/* ===================================================================== */}
      <header
        className={`flex-none max-h-[20vh] w-full z-20 transition-opacity duration-300 pointer-events-auto ${
          isKOReplayActive ? 'opacity-40' : 'opacity-100'
        }`}
      >
        {/* Banner with metallic gold brand & control links */}
        <div className="w-full bg-gradient-to-r from-[#040710]/95 via-[#0F172A]/90 to-[#040710]/95 border-b border-[#D4AF37]/50 px-3 sm:px-6 py-1.5 flex flex-wrap items-center justify-between gap-1 shadow-[0_4px_20px_rgba(212,175,55,0.18)]">
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className="font-display text-xs sm:text-xl tracking-[0.14em] uppercase font-extrabold bg-gradient-to-b from-[#FFF3B0] via-[#D4AF37] to-[#9A7418] bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(212,175,55,0.55)] whitespace-nowrap shrink-0">
              SMACK DADDY CHAMPIONSHIPS
            </h1>
            <span className="hidden md:inline font-mono text-[9px] tracking-[0.2em] uppercase text-[#FFF3B0]/80 whitespace-nowrap shrink-0">
              BATTLE OF THE TITANS
            </span>
          </div>

          <nav className="flex items-center gap-1.5 sm:gap-3 text-[10px] sm:text-xs font-mono uppercase tracking-wider">
            <button
              onClick={() => {
                setGameMode('STORY');
                resetMatch('STORY', storyChapter);
              }}
              className={`min-h-[30px] px-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
                gameMode === 'STORY'
                  ? 'text-[#FFF3B0] font-bold border-b-2 border-[#D4AF37]'
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
              className={`min-h-[30px] px-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
                gameMode === 'A2A'
                  ? 'text-[#00F0FF] font-bold border-b-2 border-[#00F0FF]'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              A2A Auto
            </button>
            <button
              onClick={() => setShowContenderStrip((v) => !v)}
              className={`min-h-[30px] px-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
                showContenderStrip
                  ? 'text-[#D4AF37] font-bold border-b-2 border-[#D4AF37]'
                  : 'text-[#E2E8F0] hover:text-[#FFF3B0]'
              }`}
            >
              Titans
            </button>
            <button
              onClick={() => setIsCodexOpen(true)}
              className="min-h-[30px] px-1 text-[#94A3B8] hover:text-[#FFF3B0] cursor-pointer whitespace-nowrap shrink-0"
            >
              Roster
            </button>
            <button
              onClick={() => setIsPhysicsModalOpen(true)}
              className="min-h-[30px] px-1 text-[#94A3B8] hover:text-[#00F0FF] cursor-pointer whitespace-nowrap shrink-0"
            >
              KO Spec
            </button>
            <button
              onClick={handleCycleCamera}
              className="min-h-[30px] px-1 text-[#94A3B8] hover:text-[#D4AF37] cursor-pointer whitespace-nowrap shrink-0"
            >
              Cam
            </button>
            <button
              onClick={handleToggleMute}
              className="min-h-[30px] px-1 text-[#94A3B8] hover:text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              {isMuted ? 'Muted' : 'Audio'}
            </button>
          </nav>
        </div>

        {/* Compact Scoreboard Strip */}
        <div className="w-full bg-[#070C18]/92 border-b border-[#00F0FF]/25 shadow-md px-3 sm:px-6 py-1.5">
          <div className="max-w-[1500px] mx-auto grid grid-cols-12 items-center gap-2">
            {/* Left Fighter */}
            <div className="col-span-5 flex items-center gap-2 min-w-0">
              <div className="relative w-10 h-10 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="25" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3.5" />
                  <circle
                    cx="28"
                    cy="28"
                    r="25"
                    fill="none"
                    stroke={leftHP > 55 ? '#00F0FF' : leftHP > 28 ? '#F59E0B' : '#EF4444'}
                    strokeWidth="3.5"
                    strokeDasharray={`${(leftHP / 100) * 157} 157`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden bg-[#0F172A] flex items-center justify-center">
                  {!failedPortraits[leftFighter.id] ? (
                    <img
                      src={leftFighter.imageUrl}
                      alt={leftFighter.name}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedPortraits((prev) => ({
                          ...prev,
                          [leftFighter.id]: true,
                        }))
                      }
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <span className="font-display font-bold text-[10px] text-[#00F0FF]">
                      {leftFighter.company.slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-baseline gap-1.5 truncate">
                  <span className="font-display text-xs sm:text-base font-extrabold uppercase text-[#00F0FF] truncate">
                    {leftFighter.name}
                  </span>
                  <span className="hidden sm:inline font-mono text-[9px] text-slate-400 shrink-0">
                    · {leftFighter.company}
                  </span>
                  {strikerSide === 'LEFT' && (
                    <span className="font-mono text-[9px] uppercase text-[#FFF3B0] font-bold shrink-0">
                      · SLAPPING
                    </span>
                  )}
                </div>
                <p className="font-mono text-[9px] sm:text-[10px] text-[#CBD5E1] tabular-nums truncate">
                  Chin <strong className="text-[#00F0FF]">{leftHP}%</strong> · Pwr {leftEffectiveStats.power} · KO Res {leftEffectiveStats.koResistance}
                </p>
              </div>
            </div>

            {/* Center Match Status */}
            <div className="col-span-2 flex flex-col items-center justify-center text-center">
              <div className="font-display text-[11px] sm:text-sm font-extrabold uppercase tracking-widest text-[#FFF3B0] tabular-nums">
                R{round} ({leftRoundsWon}–{rightRoundsWon})
              </div>
              <div className="font-mono text-[8px] sm:text-[10px] text-[#00F0FF] tabular-nums">
                {globalSlapForceValue} N · {crowdHypePercent}% Hype
              </div>
            </div>

            {/* Right Fighter */}
            <div className="col-span-5 flex items-center justify-end gap-2 min-w-0">
              <div className="min-w-0 flex-1 text-right leading-tight">
                <div className="flex items-baseline justify-end gap-1.5 truncate">
                  {strikerSide === 'RIGHT' && (
                    <span className="font-mono text-[9px] uppercase text-[#FFF3B0] font-bold shrink-0">
                      SLAPPING ·
                    </span>
                  )}
                  <span className="hidden sm:inline font-mono text-[9px] text-slate-400 shrink-0">
                    {rightFighter.company} ·
                  </span>
                  <span className="font-display text-xs sm:text-base font-extrabold uppercase text-[#D4AF37] truncate">
                    {rightFighter.name}
                  </span>
                </div>
                <p className="font-mono text-[9px] sm:text-[10px] text-[#CBD5E1] tabular-nums truncate">
                  Chin <strong className="text-[#D4AF37]">{rightHP}%</strong> · Pwr {rightEffectiveStats.power} · KO Res {rightEffectiveStats.koResistance}
                </p>
              </div>
              <div className="relative w-10 h-10 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="25" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3.5" />
                  <circle
                    cx="28"
                    cy="28"
                    r="25"
                    fill="none"
                    stroke={rightHP > 55 ? '#D4AF37' : rightHP > 28 ? '#F59E0B' : '#EF4444'}
                    strokeWidth="3.5"
                    strokeDasharray={`${(rightHP / 100) * 157} 157`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden bg-[#0F172A] flex items-center justify-center">
                  {!failedPortraits[rightFighter.id] ? (
                    <img
                      src={rightFighter.imageUrl}
                      alt={rightFighter.name}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedPortraits((prev) => ({
                          ...prev,
                          [rightFighter.id]: true,
                        }))
                      }
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <span className="font-display font-bold text-[10px] text-[#D4AF37]">
                      {rightFighter.company.slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible 10 Titans Quick Select Strip */}
        {showContenderStrip && (
          <div className="w-full bg-[#070B14]/95 border-b border-[#D4AF37]/40 px-3 py-1.5 flex items-center gap-3 overflow-x-auto">
            {FIGHTERS.map((f) => {
              const isLeft = (gameMode === 'STORY' && playerFighterId === f.id) || (gameMode === 'A2A' && a2aLeftId === f.id);
              const isRight = (gameMode === 'STORY' && storyChapter === f.storyChapter) || (gameMode === 'A2A' && a2aRightId === f.id);
              return (
                <div key={f.id} className="shrink-0 flex items-center gap-1.5 pr-2 border-r border-white/10">
                  <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-900 border border-[#D4AF37]/50 flex items-center justify-center shrink-0">
                    {!failedPortraits[f.id] ? (
                      <img
                        src={f.imageUrl}
                        alt={f.name}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedPortraits((prev) => ({
                            ...prev,
                            [f.id]: true,
                          }))
                        }
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <span className="font-display text-[8px] font-bold text-amber-400">
                        {f.company.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col text-[9px] font-mono">
                    <span className="font-display text-[10px] font-bold uppercase text-white truncate max-w-[70px]">{f.name}</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          if (gameMode === 'STORY') setPlayerFighterId(f.id);
                          else setA2aLeftId(f.id);
                          setTimeout(() => resetMatch(), 20);
                        }}
                        className={`cursor-pointer ${isLeft ? 'text-[#00F0FF] font-bold' : 'text-[#94A3B8] hover:text-white'}`}
                      >
                        P1
                      </button>
                      <button
                        onClick={() => {
                          if (gameMode === 'STORY') setStoryChapter(f.storyChapter);
                          else setA2aRightId(f.id);
                          setTimeout(() => resetMatch(gameMode, f.storyChapter), 20);
                        }}
                        className={`cursor-pointer ${isRight ? 'text-[#D4AF37] font-bold' : 'text-[#94A3B8] hover:text-white'}`}
                      >
                        P2
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
      {/* 2. MIDDLE 3D ARENA CANVAS (Strictly flex-1, ~58% height, zero overlap) */}
      {/* ===================================================================== */}
      <main className="flex-1 relative w-full min-h-0 overflow-hidden z-10">
        {/* Full canvas container */}
        <div
          ref={canvasContainerRef}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          title="Drag horizontally or vertically to inspect the 3D volumetric Tech Titans"
        />

        {/* Dedicated Top-of-Canvas Toast Callout Strip (No backdrop-blur over WebGL, never overlaps faces) */}
        {impactPopupText && (
          <div className="absolute top-2 inset-x-0 z-30 flex justify-center pointer-events-none px-4">
            <div className="font-display text-[clamp(0.95rem,3.2vw,1.35rem)] font-extrabold uppercase tracking-wide bg-gradient-to-r from-[#FFF3B0] via-[#F59E0B] to-[#EF4444] bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(245,158,11,0.85)] text-center px-3.5 py-1 bg-[#050811]/95 rounded-lg border border-[#D4AF37]/45">
              {impactPopupText}
            </div>
          </div>
        )}

        {/* Collapsible Cinema / Zen Mode Toggle Button pinned to bottom-center edge of 3D stage */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <button
            onClick={() => setIsDockCollapsed((prev) => !prev)}
            className="px-3 py-0.5 text-[10px] font-mono uppercase tracking-wider text-slate-300 hover:text-amber-300 bg-[#050811]/90 border border-slate-700/80 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            {isDockCollapsed ? '▴ Show Controls (H)' : '▾ Hide Controls (H)'}
          </button>
        </div>
      </main>

      {/* ===================================================================== */}
      {/* 3. BOTTOM CONTROL DECK (Strictly flex-none, collapsible Zen drawer)   */}
      {/* ===================================================================== */}
      {!isDockCollapsed && (
        <footer className="flex-none max-h-[28vh] w-full z-20 bg-gradient-to-r from-[#060A14]/95 via-[#0E172A]/92 to-[#060A14]/95 border-t border-[#D4AF37]/45 shadow-[0_-8px_32px_rgba(0,0,0,0.7)] px-3 sm:px-6 py-2 pointer-events-auto">
          <div className="max-w-[1500px] mx-auto flex flex-col items-center gap-1.5">
            {/* Status Sub-Header & Shockwave / Timer Status */}
            <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-[10px] sm:text-[11px] tracking-wide">
              <span
                className={
                  koProximityDanger
                    ? 'text-[#EF4444] font-bold drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                    : 'text-[#FFF3B0]'
                }
              >
                KO Shockwave: {koProximityDanger ? 'CRITICAL THRESHOLD' : 'ARMED'}
              </span>
              <span className="text-white/25">·</span>
              <span className="text-[#00F0FF] tabular-nums">Timer {formattedTimer}</span>
              <span className="text-white/25">·</span>
              <span className="text-[#CBD5E1] truncate max-w-sm sm:max-w-md">{statusBanner}</span>
            </div>

            {/* 1P STORY: Phase 1 Cheek Alignment Tap Controls */}
            {gameMode === 'STORY' && turnPhase === 'PLAYER_STRIKE_PREP' && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5">
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
                    className={`min-h-[34px] px-2.5 font-mono text-[11px] uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
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
                    className={`min-h-[34px] px-2.5 font-mono text-[11px] uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
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
                      sceneControllerRef.current?.setSpecialAura('LEFT', next);
                    }}
                    className={`min-h-[34px] px-2.5 font-mono text-[11px] uppercase border-b-2 cursor-pointer whitespace-nowrap shrink-0 ${
                      leftSpecialActive
                        ? 'border-[#00E676] text-[#00E676] font-bold bg-[#00E676]/15'
                        : 'border-transparent text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    Special
                  </button>
                )}

                {/* Dedicated TAUNT Button */}
                <button
                  onClick={handleTriggerTaunt}
                  className="min-h-[34px] px-3 border border-[#F59E0B] text-[#F59E0B] hover:text-white font-mono text-[11px] uppercase font-bold cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                >
                  TAUNT
                </button>

                <button
                  onClick={handleLockCheekLineUp}
                  className="min-h-[36px] px-4 bg-gradient-to-r from-[#D4AF37]/35 via-[#FFF3B0]/40 to-[#D4AF37]/35 border border-[#D4AF37] font-display text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#FFF3B0] hover:text-white shadow-[0_0_16px_rgba(212,175,55,0.4)] cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                >
                  LOCK ALIGNMENT
                </button>
              </div>
            )}

            {/* 1P STORY: Phase 2-5 Flinch-Bait Torque, Fakeout Bluff & Unleash Slap */}
            {gameMode === 'STORY' && turnPhase === 'PLAYER_STRIKE_METER' && (
              <div className="w-full max-w-xl flex flex-col items-center gap-1.5">
                <div className="relative w-full h-2.5 bg-white/10 overflow-hidden">
                  <div
                    className="absolute inset-y-0 bg-gradient-to-r from-[#00F0FF]/45 via-[#FACC15]/75 to-[#EF4444]/45"
                    style={{ left: '34%', width: '32%' }}
                  />
                  <div
                    className="absolute inset-y-0 w-2 bg-white shadow-[0_0_10px_#FFFFFF]"
                    style={{ left: `calc(${timingCursor * 100}% - 4px)` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                  <button
                    onClick={handleTapPracticeSwing}
                    className="min-h-[38px] px-3 bg-[#00F0FF]/15 border border-[#00F0FF] font-display text-xs sm:text-sm font-extrabold uppercase text-[#00F0FF] hover:text-white cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                  >
                    TORQUE SWING (+{Math.round(torqueCharge * 25)}%)
                  </button>

                  <button
                    onClick={handlePlayerTriggerFakeout}
                    className="min-h-[38px] px-3 bg-[#F59E0B]/20 border border-[#F59E0B] font-display text-xs sm:text-sm font-extrabold uppercase text-[#F59E0B] hover:text-white cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                  >
                    TRIGGER FAKEOUT
                  </button>

                  <button
                    onClick={handleTriggerTaunt}
                    className="min-h-[38px] px-3 border border-[#E2E8F0]/40 text-[#E2E8F0] hover:text-white font-mono text-[11px] uppercase font-bold cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                  >
                    TAUNT
                  </button>

                  <button
                    onClick={handlePlayerUnleashSlap}
                    className="flex-1 min-h-[38px] px-4 bg-gradient-to-r from-[#D4AF37]/45 via-[#EF4444]/45 to-[#D4AF37]/45 border border-[#FFF3B0] font-display text-xs sm:text-base font-extrabold uppercase tracking-wider text-[#FFF3B0] hover:text-white shadow-[0_0_20px_rgba(245,158,11,0.55)] cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                  >
                    UNLEASH SLAP!
                  </button>
                </div>
              </div>
            )}

            {/* 1P STORY: Defensive Chin Brace */}
            {gameMode === 'STORY' && turnPhase === 'PLAYER_DEFENSE_BRACE' && (
              <div className="w-full max-w-xl flex flex-col items-center gap-1.5">
                <div className="relative w-full h-2.5 bg-white/10 overflow-hidden">
                  <div
                    className="absolute inset-y-0 bg-[#00F0FF]/55"
                    style={{ left: '38%', width: '24%' }}
                  />
                  <div
                    className="absolute inset-y-0 w-2 bg-white shadow-[0_0_10px_#FFFFFF]"
                    style={{ left: `calc(${timingCursor * 100}% - 4px)` }}
                  />
                </div>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={handleTapChinBrace}
                    className="flex-1 min-h-[38px] px-4 bg-[#00F0FF]/20 border border-[#00F0FF] font-display text-xs sm:text-base font-extrabold uppercase tracking-wider text-[#00F0FF] hover:text-white shadow-[0_0_16px_rgba(0,240,255,0.4)] cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                  >
                    TAP TO BRACE CHIN &amp; ABSORB IMPACT!
                  </button>
                  <button
                    onClick={handleTriggerTaunt}
                    className="min-h-[38px] px-3 border border-[#F59E0B] text-[#F59E0B] hover:text-white font-mono text-[11px] uppercase font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    TAUNT
                  </button>
                </div>
              </div>
            )}

            {/* 10-COUNT KO RECOVERY MINI-GAME */}
            {turnPhase === 'KO_RECOVERY_MINIGAME' && (
              <div className="w-full max-w-xl flex flex-col items-center gap-1.5">
                <div className="font-mono text-xs uppercase tracking-wider text-[#EF4444] font-bold tabular-nums">
                  {activeKODef.name} · 10-Count: {(10 - tenCountSeconds).toFixed(1)}s / 10.0s
                </div>
                <div className="relative w-full h-2.5 bg-white/10 overflow-hidden">
                  <div
                    className="absolute inset-y-0 bg-[#00E676]/70"
                    style={{
                      left: `${(0.5 - activeKODef.recoveryWindowWidth * 0.5) * 100}%`,
                      width: `${activeKODef.recoveryWindowWidth * 100}%`,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 w-2 bg-white shadow-[0_0_10px_#FFFFFF]"
                    style={{ left: `calc(${timingCursor * 100}% - 4px)` }}
                  />
                </div>
                {gameMode === 'STORY' && downedSide === 'LEFT' ? (
                  <button
                    onClick={handlePlayerAttemptKORecovery}
                    className="w-full min-h-[38px] px-5 bg-[#00E676]/25 border border-[#00E676] font-display text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#00E676] hover:text-white cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                  >
                    TAP GREEN ZONE TO BEAT 10-COUNT!
                  </button>
                ) : (
                  <span className="font-mono text-xs text-[#00F0FF]">
                    Neural recovery check in progress...
                  </span>
                )}
              </div>
            )}

            {/* A2A AUTONOMOUS MODE CONTROLS */}
            {gameMode === 'A2A' && turnPhase !== 'KO_RECOVERY_MINIGAME' && (
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-mono">
                <button
                  onClick={() => setA2aPaused(!a2aPaused)}
                  className="min-h-[34px] px-3 border border-[#D4AF37]/60 text-[#FFF3B0] hover:text-white font-bold uppercase cursor-pointer whitespace-nowrap shrink-0"
                >
                  {a2aPaused ? 'Resume' : 'Pause'}
                </button>
                {[1, 2].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setA2aSpeed(spd)}
                    className={`min-h-[34px] px-2.5 cursor-pointer whitespace-nowrap shrink-0 ${
                      a2aSpeed === spd
                        ? 'text-[#00F0FF] font-bold border-b-2 border-[#00F0FF]'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
                <button
                  onClick={handleTriggerTaunt}
                  className="min-h-[34px] px-3 border border-[#F59E0B] text-[#F59E0B] hover:text-white font-bold uppercase cursor-pointer whitespace-nowrap shrink-0"
                >
                  TAUNT
                </button>
                <button
                  onClick={() => resetMatch()}
                  className="min-h-[34px] px-2.5 text-[#94A3B8] hover:text-white uppercase cursor-pointer whitespace-nowrap shrink-0"
                >
                  Reset
                </button>
                <span className="text-[#94A3B8] truncate max-w-xs">{a2aThoughtText}</span>
              </div>
            )}

            {/* MATCH OVER CONTROLS */}
            {turnPhase === 'MATCH_OVER' && (
              <div className="flex flex-wrap items-center justify-center gap-3 font-display text-sm uppercase tracking-wider">
                <span className="text-[#FFF3B0] font-extrabold">
                  {matchWinner === 'LEFT'
                    ? `${leftFighter.name} WINS`
                    : matchWinner === 'RIGHT'
                      ? `${rightFighter.name} WINS`
                      : 'DRAW MATCH'}
                </span>
                <button
                  onClick={handleTriggerTaunt}
                  className="min-h-[36px] px-3 border border-[#F59E0B] text-[#F59E0B] hover:text-white font-bold cursor-pointer whitespace-nowrap shrink-0"
                >
                  CELEBRATE
                </button>
                <button
                  onClick={() => resetMatch()}
                  className="min-h-[36px] px-3.5 border border-[#00F0FF] text-[#00F0FF] hover:text-white font-bold cursor-pointer whitespace-nowrap shrink-0"
                >
                  Rematch
                </button>
                {gameMode === 'STORY' && matchWinner === 'LEFT' && storyChapter < 10 && (
                  <button
                    onClick={() => {
                      const nextChap = storyChapter + 1;
                      setStoryChapter(nextChap);
                      resetMatch('STORY', nextChap);
                    }}
                    className="min-h-[36px] px-3.5 border border-[#D4AF37] text-[#FFF3B0] hover:text-white font-extrabold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Next: Ch. {storyChapter + 1}
                  </button>
                )}
              </div>
            )}
          </div>
        </footer>
      )}

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
