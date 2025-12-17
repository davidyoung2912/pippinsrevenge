
import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import { GameState, ActivePowerUp } from './types';
import { SPRITES, PALETTES, POWERUP_DURATION } from './constants';

// Use React.FC to properly handle reserved props like 'key' in TypeScript
interface SpriteIconProps {
  sprite: number[][];
  palette: string[];
}

const SpriteIcon: React.FC<SpriteIconProps> = ({ sprite, palette }) => (
  <svg width="24" height="24" viewBox={`0 0 ${sprite[0].length} ${sprite.length}`} className="block" style={{ imageRendering: 'pixelated' }}>
    {sprite.flatMap((row, y) =>
      row.map((val, x) => {
        if (val === 0) return null;
        const color = palette[val - 1];
        return <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={color} />;
      })
    )}
  </svg>
);

function App() {
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<GameState>(GameState.INTRO);
  const [highScore, setHighScore] = useState(0);
  const [activePowerUps, setActivePowerUps] = useState<ActivePowerUp[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('galaga_highscore');
    if (saved) setHighScore(parseInt(saved));
  }, []);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('galaga_highscore', score.toString());
    }
  }, [score, highScore]);

  return (
    <div className="h-screen max-h-screen bg-neutral-900 flex flex-col items-center justify-center p-2 overflow-hidden">
      {/* Arcade Cabinet Header */}
      <div className="w-full max-w-[480px] mb-2 flex items-end text-white font-['Press_Start_2P']">
        <div className="flex flex-col flex-1 items-start">
          <span className="text-red-500 text-[9px] font-sans font-bold mb-1 tracking-wider">HIGH SCORE</span>
          <span className="text-white text-base tracking-widest">{highScore}</span>
        </div>
        <div className="flex flex-col flex-1 items-center pl-4">
            <h1 className="text-yellow-400 text-lg tracking-widest leading-tight text-center" style={{ textShadow: '0 0 10px rgba(255,255,0,0.5)'}}>
              PIPPIN'S<br/>REVENGE
            </h1>
        </div>
        <div className="flex flex-col flex-1 items-end">
          <span className="text-cyan-400 text-[9px] font-sans font-bold mb-1 tracking-wider">SCORE</span>
          <span className="text-white text-base tracking-widest">{score}</span>
        </div>
      </div>

      {/* Power Up Indicator Bar */}
      <div className="w-full max-w-[480px] h-8 flex justify-center items-center gap-4 mb-2">
         {activePowerUps.map((p, i) => (
             <div key={i} className="flex flex-col items-center bg-neutral-800/80 px-2 py-1 rounded border border-neutral-600 min-w-[100px]">
                 <div className="flex items-center gap-2 mb-1">
                    <SpriteIcon 
                        sprite={p.type === 'RAPID_FIRE' ? SPRITES.POWERUP_RAPID : SPRITES.POWERUP_SHIELD} 
                        palette={p.type === 'RAPID_FIRE' ? PALETTES.POWERUP_RAPID : PALETTES.POWERUP_SHIELD}
                    />
                    <span className={`text-[10px] font-['Press_Start_2P'] ${p.type === 'RAPID_FIRE' ? 'text-orange-400' : 'text-blue-400'}`}>
                        {p.type.replace('_', ' ')}
                    </span>
                 </div>
                 {/* Progress Bar */}
                 <div className="w-full h-1 bg-neutral-700 rounded-full overflow-hidden">
                     <div 
                        className={`h-full ${p.type === 'RAPID_FIRE' ? 'bg-orange-400' : 'bg-blue-400'}`}
                        style={{ width: `${(p.timeLeft / POWERUP_DURATION) * 100}%` }}
                     />
                 </div>
             </div>
         ))}
      </div>

      {/* Game Screen */}
      <div className="relative flex justify-center items-center">
        <GameCanvas 
          onScoreUpdate={setScore}
          onLivesUpdate={setLives}
          onActivePowerUpsChange={setActivePowerUps}
          gameState={gameState}
          setGameState={setGameState}
          highScore={highScore}
        />
        
        {/* CRT Scanline Overlay Effect */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-10 opacity-20"></div>
      </div>

      {/* Footer / Instructions */}
      <div className="w-full max-w-[480px] mt-4 flex justify-between text-white font-['Press_Start_2P'] text-[10px]">
        <div className="flex gap-2 items-center">
           {Array.from({ length: Math.max(0, lives - 1) }).map((_, i) => (
             <SpriteIcon key={i} sprite={SPRITES.PLAYER} palette={PALETTES.PLAYER} />
           ))}
        </div>
        <div className="text-gray-400 text-[8px] text-center hidden sm:block">
           <p className="mb-1">CONTROLS</p>
           <p>KEYBOARD: ARROWS / SPACE</p>
           <p>GAMEPAD: STICK / A BUTTON</p>
        </div>
      </div>
    </div>
  );
}

export default App;
