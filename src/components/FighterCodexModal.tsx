import React, { useState } from 'react';
import { X, Shield, Zap, Crosshair, Gauge, Award } from 'lucide-react';
import { FIGHTERS, FighterProfile, STORY_UPGRADES } from '../data/fighters';

interface FighterCodexModalProps {
  isOpen: boolean;
  onClose: () => void;
  unlockedChapter: number;
  selectedPlayerId: string;
  onSelectPlayerFighter: (id: string) => void;
}

export const FighterCodexModal: React.FC<FighterCodexModalProps> = ({
  isOpen,
  onClose,
  unlockedChapter,
  selectedPlayerId,
  onSelectPlayerFighter,
}) => {
  const [inspectedId, setInspectedId] = useState<string>(selectedPlayerId);

  if (!isOpen) return null;

  const activeFighter: FighterProfile =
    FIGHTERS.find((f) => f.id === inspectedId) || FIGHTERS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 md:p-6">
      <div className="w-full max-w-6xl bg-[#0B0F19] border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-display font-bold tracking-wide text-amber-400">
              Tech Titan Fighter Roster & Stat Sheets
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              10 Official Characters · Competitive Power Slap Profiles · Armor & A2A Intelligence
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <X className="w-4 h-4" />
            Close Roster
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
          {/* Left Roster List with Character Portraits */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 space-y-2 overflow-y-auto">
            {FIGHTERS.map((fighter) => {
              const isSelected = fighter.id === activeFighter.id;
              const isCurrentAvatar = fighter.id === selectedPlayerId;
              return (
                <button
                  key={fighter.id}
                  onClick={() => setInspectedId(fighter.id)}
                  className={`w-full text-left p-2.5 rounded-lg transition-colors flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-amber-500/15 border border-amber-500/40 text-white'
                      : 'bg-slate-900/60 border border-transparent text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-800 shrink-0 border border-slate-700">
                      <img
                        src={fighter.imageUrl}
                        alt={fighter.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm truncate">
                        {fighter.storyChapter}. {fighter.name}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 truncate">
                        {fighter.company} · {fighter.title}
                      </div>
                    </div>
                  </div>
                  {isCurrentAvatar && (
                    <span className="text-[11px] font-mono text-amber-400 shrink-0">
                      ACTIVE
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Detailed Stat Sheet + Character Artwork */}
          <div className="lg:col-span-8 p-6 space-y-6 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
              {/* Official Character Portrait Card */}
              <div className="md:col-span-5 rounded-xl overflow-hidden border border-slate-700 bg-slate-900 relative flex flex-col">
                <img
                  src={activeFighter.imageUrl}
                  alt={`${activeFighter.name} - ${activeFighter.company}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-72 md:h-full object-cover object-top"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4">
                  <div className="text-xs font-mono text-amber-400">
                    Arena {activeFighter.storyChapter} · {activeFighter.company}
                  </div>
                  <div className="text-xl font-display font-bold text-white">
                    {activeFighter.name}
                  </div>
                  <div className="text-xs text-slate-300">
                    {activeFighter.armorName}
                  </div>
                </div>
              </div>

              {/* Fighter Details & 5 Core Stat Bars */}
              <div className="md:col-span-7 flex flex-col justify-between space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <div className="text-xs text-slate-400">
                      {activeFighter.arenaName} · {activeFighter.arenaLocation}
                    </div>
                    <h3 className="text-2xl font-display font-bold text-white mt-0.5">
                      {activeFighter.name}
                    </h3>
                    <p className="text-xs text-amber-400/90 mt-0.5">
                      {activeFighter.armorDescription}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onSelectPlayerFighter(activeFighter.id);
                      onClose();
                    }}
                    className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Select as Player Fighter
                  </button>
                </div>

                {/* Stat Bars */}
                <div className="space-y-2.5">
                  {[
                    {
                      label: 'Power (Mass & Torque)',
                      val: activeFighter.stats.power,
                      icon: Zap,
                      color: '#F59E0B',
                    },
                    {
                      label: 'Chin Durability',
                      val: activeFighter.stats.chinDurability,
                      icon: Shield,
                      color: '#38BDF8',
                    },
                    {
                      label: 'Precision (Sweet-Spot)',
                      val: activeFighter.stats.precision,
                      icon: Crosshair,
                      color: '#10B981',
                    },
                    {
                      label: 'Wind-Up Speed',
                      val: activeFighter.stats.windUpSpeed,
                      icon: Gauge,
                      color: '#A855F7',
                    },
                    {
                      label: 'KO Resistance Threshold',
                      val: activeFighter.stats.koResistance,
                      icon: Award,
                      color: '#EF4444',
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="bg-slate-900/80 border border-slate-800 rounded-lg px-3.5 py-2.5"
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-300 font-medium">
                          {stat.label}
                        </span>
                        <span className="font-mono font-semibold text-white tabular-nums">
                          {stat.val} / 100
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${stat.val}%`,
                            backgroundColor: stat.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Signature Special Ability */}
                <div className="bg-slate-900/80 border border-amber-500/30 rounded-lg p-3">
                  <div className="text-xs text-amber-400 font-semibold">
                    Special Ability · {activeFighter.specialName}
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {activeFighter.specialDescription}
                  </p>
                </div>
              </div>
            </div>

            {/* HQ Arena, Movement Variation & A2A Profile */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4">
                <div className="text-xs font-semibold text-slate-200">
                  HQ Arena Architecture
                </div>
                <div className="text-xs text-amber-400 mt-1">
                  {activeFighter.arenaName}
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {activeFighter.arenaDescription}
                </p>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4">
                <div className="text-xs font-semibold text-slate-200">
                  HQ Movement Variation
                </div>
                <div className="text-xs text-sky-400 mt-1">
                  {activeFighter.movementVariationName}
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {activeFighter.movementVariationDesc}
                </p>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4">
                <div className="text-xs font-semibold text-slate-200">
                  A2A Autonomous AI Profile
                </div>
                <div className="text-xs text-emerald-400 mt-1">
                  {activeFighter.a2aPersonality}
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Trait: {activeFighter.a2aEmotionalTrait} · Preferred Call: On{' '}
                  {activeFighter.preferredWindUp} (
                  {activeFighter.preferredAngle.replace('_', ' ')})
                </p>
              </div>
            </div>

            {/* Story Mode Armor Upgrade Progression */}
            <div className="border-t border-slate-800 pt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-300">
                  Story Campaign Armor Unlocks (Progress: Chapter{' '}
                  {Math.min(10, unlockedChapter)} / 10)
                </span>
                <span className="text-xs font-mono text-amber-400 tabular-nums">
                  {
                    STORY_UPGRADES.filter(
                      (u) => u.chapterUnlocked <= unlockedChapter
                    ).length
                  }{' '}
                  / {STORY_UPGRADES.length} Unlocked
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Active Story Gear:{' '}
                <span className="text-white font-medium">
                  {
                    STORY_UPGRADES.filter(
                      (u) => u.chapterUnlocked <= unlockedChapter
                    ).slice(-1)[0]?.name
                  }
                </span>{' '}
                —{' '}
                {
                  STORY_UPGRADES.filter(
                    (u) => u.chapterUnlocked <= unlockedChapter
                  ).slice(-1)[0]?.description
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
