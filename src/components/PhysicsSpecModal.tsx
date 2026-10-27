import React, { useState } from 'react';
import { X, Play } from 'lucide-react';
import {
  FIGHTERS,
  KO_TYPE_DEFINITIONS,
  KOType,
} from '../data/fighters';

interface PhysicsSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
  unlockedChapter: number;
  onJumpToStoryChapter: (chapter: number) => void;
  onSimulateKOType?: (koType: Exclude<KOType, 'NONE'>) => void;
}

export const PhysicsSpecModal: React.FC<PhysicsSpecModalProps> = ({
  isOpen,
  onClose,
  unlockedChapter,
  onJumpToStoryChapter,
  onSimulateKOType,
}) => {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const koTypes = Object.values(KO_TYPE_DEFINITIONS);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/88 p-4 md:p-6">
      <div className="w-full max-w-6xl bg-[#0B0F19] border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-display font-bold tracking-wide text-amber-400">
              Knockout (KO) System, Slap Biomechanics & 10-Arena Championship Path
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              4 Distinct KO Classifications · Under-Damped Spring Whiplash · Story & A2A Recovery Timing Mechanics
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
            Close Manual
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Section 1: Comprehensive Knockout (KO) System — 4 Distinct KO Types */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-base font-display font-bold text-white">
                  01. Comprehensive Knockout (KO) System & Recovery Mini-Game Specs
                </h3>
                <p className="text-xs text-slate-400">
                  When Damage ≥ Effective KOResistance, one of four distinct KO types triggers based on overkill ratio, strike angle, and defender fatigue.
                </p>
              </div>
              <div className="text-xs font-mono text-amber-400 tabular-nums">
                Effective KOResistance = BaseKORes − (Hits × 6.0) − (Fatigue × 0.35)
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {koTypes.map((ko) => (
                <div
                  key={ko.id}
                  className="bg-slate-900/85 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="font-display font-bold text-base"
                        style={{ color: ko.badgeColor }}
                      >
                        {ko.name}
                      </span>
                      <span className="text-xs font-mono text-slate-300 tabular-nums">
                        Zone {Math.round(ko.recoveryWindowWidth * 100)}% · Speed {ko.recoveryCursorSpeed} rad/s
                      </span>
                    </div>

                    <div className="text-xs font-mono text-amber-400 bg-slate-950/90 px-2.5 py-1.5 rounded border border-slate-800">
                      Threshold: {ko.thresholdRule}
                    </div>

                    <div className="text-xs text-slate-300 leading-relaxed">
                      <span className="text-slate-100 font-semibold">
                        Visual & 3D Impact:
                      </span>{' '}
                      {ko.visualImpact}
                    </div>

                    <div className="text-xs text-slate-300 leading-relaxed">
                      <span className="text-slate-100 font-semibold">
                        Gameplay & Recovery Impact:
                      </span>{' '}
                      {ko.gameplayImpact}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <div className="text-xs text-emerald-400">
                      Comeback Buff: <span className="font-semibold">{ko.comebackBuffName}</span> · {ko.comebackBuffDescription}
                    </div>
                    {onSimulateKOType && (
                      <button
                        onClick={() => {
                          onSimulateKOType(ko.id);
                          onClose();
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ml-2 cursor-pointer"
                      >
                        <Play className="w-3 h-3" />
                        Demo {ko.name}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Core Slap Physics Formulas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4">
              <div className="text-xs font-semibold text-amber-400">
                01. Slap Force Formula
              </div>
              <div className="font-mono text-xs text-white mt-2 bg-slate-950 p-2.5 rounded border border-slate-800">
                SlapForce = (ArmSpeed × Mass × Torque) × PrecisionMultiplier
              </div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Generated from ground reaction force, hip rotation, and the Striker Call ("On 1", "On 2", or "On 3" rehearsal swings).
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4">
              <div className="text-xs font-semibold text-sky-400">
                02. Mandibular Damage Formula
              </div>
              <div className="font-mono text-xs text-white mt-2 bg-slate-950 p-2.5 rounded border border-slate-800">
                Damage = SlapForce × (ChinWeakness × AngleModifier)
              </div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Defenders grip the central barrel rim and time an isometric Chin Brace to reduce ChinWeakness and neck whiplash.
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4">
              <div className="text-xs font-semibold text-rose-400">
                03. Story & A2A Recovery Rule
              </div>
              <div className="font-mono text-xs text-white mt-2 bg-slate-950 p-2.5 rounded border border-slate-800">
                Success → Rise + Buff | Failure → Round Lost
              </div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Both Story Mode and A2A Mode trigger the 10-Count Timing Mini-Game on knockdown. Missing the zone forfeits the round immediately.
              </p>
            </div>
          </div>

          {/* Section 3: 10-Arena Story Progression Path with Character Portraits */}
          <div>
            <h3 className="text-base font-display font-bold text-white mb-3">
              02. 10-Arena Championship Tour (Click any arena to challenge that Titan)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {FIGHTERS.map((fighter) => {
                const isUnlocked = fighter.storyChapter <= unlockedChapter;
                return (
                  <button
                    key={fighter.id}
                    onClick={() => {
                      onJumpToStoryChapter(fighter.storyChapter);
                      onClose();
                    }}
                    className="text-left rounded-xl border border-slate-700 bg-slate-900/85 hover:border-amber-500/70 transition-colors flex flex-col overflow-hidden cursor-pointer"
                  >
                    <div className="w-full h-32 bg-slate-950 overflow-hidden relative flex items-center justify-center">
                      {!failedImages[fighter.id] ? (
                        <img
                          src={fighter.imageUrl}
                          alt={fighter.name}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({
                              ...prev,
                              [fighter.id]: true,
                            }))
                          }
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <span
                          className="font-display font-bold text-sm"
                          style={{ color: fighter.accentColor }}
                        >
                          {fighter.company}
                        </span>
                      )}
                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-[11px] font-mono bg-black/80 px-2 py-0.5 rounded text-amber-400">
                        <span>Arena {String(fighter.storyChapter).padStart(2, '0')}</span>
                        <span className="text-slate-300">
                          {isUnlocked ? 'Campaign' : 'Exhibition'}
                        </span>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="font-display font-bold text-sm text-white truncate">
                        {fighter.name}
                      </div>
                      <div className="text-[11px] text-amber-400/90 truncate">
                        {fighter.arenaName}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                        {fighter.tutorialFocus}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
