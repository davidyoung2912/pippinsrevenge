
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  COLORS, 
  PALETTES,
  SPRITES, 
  PIXEL_SCALE, 
  PLAYER_SPEED, 
  BULLET_SPEED,
  ENEMY_BULLET_SPEED,
  ENEMY_LASER_SPEED,
  FIRE_COOLDOWN_DEFAULT,
  FIRE_COOLDOWN_RAPID,
  STAR_COUNT,
  POWERUP_DURATION
} from '../constants';
import { GameState, Entity, Enemy, Bullet, Star, Particle, PowerUp, ActivePowerUp, Position, Barrier, Supernova, PowerUpType } from '../types';
import { useInput } from '../hooks/useInput';
import { playSound, startUfoSound, stopUfoSound, startIntroAmbience, stopIntroAmbience } from '../utils/sound';

interface GameCanvasProps {
  onScoreUpdate: (score: number) => void;
  onLivesUpdate: (lives: number) => void;
  onLevelUpdate: (level: number) => void;
  onActivePowerUpsChange: (powerUps: ActivePowerUp[]) => void;
  gameState: GameState;
  setGameState: (state: GameState) => void;
  highScore: number;
}

type RespawnState = 'NONE' | 'RETURNING' | 'WAITING';

interface Nebula {
  x: number;
  y: number;
  radius: number;
  colorBase: number; // Hue 0-360
  colorVar: number; // Current variance
  vx: number;
  vy: number;
}

// Extra life thresholds
const LIFE_THRESHOLDS = [10000, 25000, 40000, 70000, 100000];

// Pattern sequence for levels including new Swirl pattern (6)
const PATTERN_SEQUENCE = [0, 4, 1, 6, 5, 2, 4, 3, 5, 6];

// Intro lines
const INTRO_LINES = [
  "A long time ago...",
  "In a galaxy far, far away...",
  "Dogs and cats had a truce",
  "To never eat the other's treats",
  "Until Snowball came along",
  "And stole all the Pup-Peroni",
  "Captain Pippin to the Rescue!"
];

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  onScoreUpdate, 
  onLivesUpdate,
  onLevelUpdate,
  onActivePowerUpsChange,
  gameState, 
  setGameState,
  highScore
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { pollInput } = useInput();
  
  // Game Refs
  const frameId = useRef<number>(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const levelRef = useRef(1);
  const lastTimeRef = useRef(0);
  const playerRef = useRef<Entity | null>(null);
  const enemiesRef = useRef<Enemy[]>([]);
  const spawnQueueRef = useRef<Enemy[]>([]); 
  const spawnTimerRef = useRef(0);
  
  // Intro Sequence State/Refs
  const [introStarted, setIntroStarted] = useState(false);
  const introTimeElapsedRef = useRef(0);

  // Challenge Sector Refs
  const challengeGroupIndexRef = useRef(0);
  const challengeHitCountRef = useRef(0);
  const challengeWaveTimerRef = useRef(0);
  const challengeWaveActiveRef = useRef(false);
  const challengeUsedTypesRef = useRef<string[]>([]);
  const challengeUsedPatternsRef = useRef<number[]>([]);

  // Mystery Ship Ref
  const mysteryShipRef = useRef<Entity | null>(null);
  const mysteryShipCooldownRef = useRef(1000); 

  // Dive Pacing Refs
  const diveCooldownRef = useRef(0);

  const bulletsRef = useRef<Bullet[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const activePowerUpsRef = useRef<ActivePowerUp[]>([]);
  const lastActivePowerUpsCountRef = useRef(0);
  const powerUpCooldownsRef = useRef<Record<PowerUpType, number>>({ 'RAPID_FIRE': 0, 'SHIELD': 0 });
  const wasActiveRef = useRef(false); // Track if we need to send a clear update

  const barriersRef = useRef<Barrier[]>([]);
  
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const nebulaeRef = useRef<Nebula[]>([]);
  const supernovasRef = useRef<Supernova[]>([]); 
  const fireCooldownRef = useRef(0);
  const waveTimerRef = useRef(0);
  const timeRef = useRef(0);

  // Difficulty & State Refs
  const waveReadyRef = useRef(false);
  const nextLifeThresholdIndexRef = useRef(0);
  const isMobileRef = useRef(false);
  const autoFireTimerRef = useRef(0);
  const spriteCacheRef = useRef<Record<string, HTMLCanvasElement>>({});
  const respawnStateRef = useRef<RespawnState>('NONE');
  const respawnTimerRef = useRef(0);
  const countdownValueRef = useRef(3);

  // Touch Controls
  const touchXRef = useRef<number | null>(null);
  
  // Initialize Stars, Nebulae, Sprite Cache, Mobile Check
  useEffect(() => {
    starsRef.current = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      speed: Math.random() * 2 + 0.5,
      size: Math.random() > 0.9 ? 2 : 1,
      brightness: Math.random()
    }));

    nebulaeRef.current = [
      { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT, radius: 180, colorBase: 240, colorVar: 0, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2 },
      { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT, radius: 200, colorBase: 280, colorVar: 0, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2 },
      { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT, radius: 150, colorBase: 200, colorVar: 0, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2 },
      { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT, radius: 120, colorBase: 260, colorVar: 0, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2 },
      { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT, radius: 160, colorBase: 220, colorVar: 0, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2 },
    ];

    const cache: Record<string, HTMLCanvasElement> = {};
    Object.keys(SPRITES).forEach(key => {
        const spriteGrid = SPRITES[key as keyof typeof SPRITES];
        const palette = PALETTES[key as keyof typeof PALETTES];
        const rawColor = COLORS[key as keyof typeof COLORS]; 
        const baseColor = Array.isArray(rawColor) ? rawColor[0] : rawColor;

        const canvas = document.createElement('canvas');
        canvas.width = spriteGrid[0].length * PIXEL_SCALE;
        canvas.height = spriteGrid.length * PIXEL_SCALE;
        const ctx = canvas.getContext('2d');
        if(!ctx) return;

        spriteGrid.forEach((row, r) => {
            row.forEach((pixel, c) => {
                if (pixel > 0) {
                     if (palette && palette.length >= pixel) {
                        ctx.fillStyle = palette[pixel - 1]; 
                     } else {
                        ctx.fillStyle = baseColor || '#fff';
                     }
                     ctx.fillRect(c * PIXEL_SCALE, r * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
                }
            });
        });
        cache[key] = canvas;
    });
    spriteCacheRef.current = cache;

    const checkMobile = () => {
        isMobileRef.current = window.innerWidth <= 768;
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      stopUfoSound();
      stopIntroAmbience();
    };

  }, []);

  useEffect(() => {
    if (gameState === GameState.PAUSED) {
        stopUfoSound();
    }
    if (gameState === GameState.INTRO) {
        if (introStarted) startIntroAmbience();
    } else {
        stopIntroAmbience();
    }
  }, [gameState, introStarted]);

  const spawnPlayer = (atCenter = false) => {
    playerRef.current = {
      id: 'player',
      pos: { x: atCenter ? CANVAS_WIDTH / 2 - 20 : CANVAS_WIDTH / 2 - 20, y: CANVAS_HEIGHT - 60 },
      vel: { dx: 0, dy: 0 },
      width: SPRITES.PLAYER[0].length * PIXEL_SCALE,
      height: SPRITES.PLAYER.length * PIXEL_SCALE,
      color: COLORS.PLAYER,
      palette: PALETTES.PLAYER,
      sprite: SPRITES.PLAYER,
      spriteKey: 'PLAYER',
      active: true
    };
    activePowerUpsRef.current = []; 
    onActivePowerUpsChange([]);
  };

  const spawnPowerUp = (x: number, y: number) => {
     if (Math.random() > 0.03) return;
     const isFormationSettled = spawnQueueRef.current.length === 0 && !enemiesRef.current.some(e => e.state === 'ENTERING');
     if (!isFormationSettled) return;

     const availableTypes: PowerUpType[] = [];
     const rapidActive = activePowerUpsRef.current.some(p => p.type === 'RAPID_FIRE');
     const rapidFalling = powerUpsRef.current.some(p => p.type === 'RAPID_FIRE');
     const rapidCooldown = powerUpCooldownsRef.current['RAPID_FIRE'] > 0;
     if (!rapidActive && !rapidFalling && !rapidCooldown) availableTypes.push('RAPID_FIRE');

     const shieldActive = activePowerUpsRef.current.some(p => p.type === 'SHIELD');
     const shieldFalling = powerUpsRef.current.some(p => p.type === 'SHIELD');
     const shieldCooldown = powerUpCooldownsRef.current['SHIELD'] > 0;
     if (!shieldActive && !shieldFalling && !shieldCooldown) availableTypes.push('SHIELD');

     if (availableTypes.length === 0) return;

     const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
     const spriteKey = type === 'RAPID_FIRE' ? 'POWERUP_RAPID' : 'POWERUP_SHIELD';
     const sprite = SPRITES[spriteKey];
     const color = type === 'RAPID_FIRE' ? COLORS.POWERUP_RAPID : COLORS.POWERUP_SHIELD;
     const palette = type === 'RAPID_FIRE' ? PALETTES.POWERUP_RAPID : PALETTES.POWERUP_SHIELD;

     powerUpsRef.current.push({
         id: `powerup_${Date.now()}_${Math.random()}`,
         pos: { x, y },
         vel: { dx: 0, dy: 3.5 },
         width: sprite[0].length * PIXEL_SCALE,
         height: sprite.length * PIXEL_SCALE,
         color: color,
         palette: palette,
         sprite: sprite,
         spriteKey: spriteKey,
         active: true,
         type: type
     });
  };

  const createBezierPath = (p0: Position, p1: Position, p2: Position, steps: number): Position[] => {
      const path: Position[] = [];
      for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
          const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
          path.push({ x, y });
      }
      return path;
  };

  const createComplexSnakePath = (patternIndex: number): Position[] => {
    const path: Position[] = [];
    let start: Position, cp1: Position, mid: Position, cp2: Position, end: Position;

    switch(patternIndex) {
      case 0: // TL to BR
        start = { x: -50, y: -50 };
        cp1 = { x: 400, y: 100 };
        mid = { x: 240, y: 320 };
        cp2 = { x: 80, y: 500 };
        end = { x: 530, y: 690 };
        break;
      case 1: // BL to TR
        start = { x: -50, y: 690 };
        cp1 = { x: 100, y: 200 };
        mid = { x: 240, y: 320 };
        cp2 = { x: 380, y: 500 };
        end = { x: 530, y: -50 };
        break;
      case 2: // TR to BL
        start = { x: 530, y: -50 };
        cp1 = { x: 100, y: 100 };
        mid = { x: 240, y: 320 };
        cp2 = { x: 400, y: 540 };
        end = { x: -50, y: 690 };
        break;
      case 3: // BR to TL
        start = { x: 530, y: 690 };
        cp1 = { x: 300, y: 100 };
        mid = { x: 240, y: 320 };
        cp2 = { x: 180, y: 540 };
        end = { x: -50, y: -50 };
        break;
      case 4:
      default: // Bottom Center Snake Up
        start = { x: 240, y: 700 };
        cp1 = { x: 0, y: 320 };
        mid = { x: 240, y: 320 };
        cp2 = { x: 480, y: 320 };
        end = { x: 240, y: -100 };
        break;
    }

    path.push(...createBezierPath(start, cp1, mid, 100));
    path.push(...createBezierPath(mid, cp2, end, 100));
    
    const loopIndex = 100;
    const loopPoints: Position[] = [];
    const centerX = mid.x;
    const centerY = mid.y;
    const radius = 60;
    for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * Math.PI * 2;
        loopPoints.push({
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        });
    }
    path.splice(loopIndex, 0, ...loopPoints);

    return path;
  };

  const spawnChallengeWave = () => {
    const types: ('BEE' | 'BUTTERFLY' | 'GALAXIAN' | 'SCORPION' | 'ZAKO')[] = ['BEE', 'BUTTERFLY', 'GALAXIAN', 'SCORPION', 'ZAKO'];
    const patterns = [0, 1, 2, 3, 4];
    
    // Pick unused sprite and pattern
    const availableTypes = types.filter(t => !challengeUsedTypesRef.current.includes(t));
    const availablePatterns = patterns.filter(p => !challengeUsedPatternsRef.current.includes(p));
    
    const chosenType = availableTypes.length > 0 ? availableTypes[Math.floor(Math.random() * availableTypes.length)] : types[0];
    const chosenPattern = availablePatterns.length > 0 ? availablePatterns[Math.floor(Math.random() * availablePatterns.length)] : patterns[0];
    
    challengeUsedTypesRef.current.push(chosenType);
    challengeUsedPatternsRef.current.push(chosenPattern);

    const groupPath = createComplexSnakePath(chosenPattern);
    const enemies: Enemy[] = [];
    const sprite = SPRITES[chosenType as keyof typeof SPRITES];
    const palette = PALETTES[chosenType as keyof typeof PALETTES];

    for (let i = 0; i < 10; i++) {
        enemies.push({
          id: `challenge_${challengeGroupIndexRef.current}_${i}`,
          type: chosenType as any,
          pos: { x: -100, y: -100 },
          vel: { dx: 0, dy: 0 },
          width: sprite[0].length * PIXEL_SCALE,
          height: sprite.length * PIXEL_SCALE,
          color: COLORS[chosenType as keyof typeof COLORS] as string,
          palette: palette,
          sprite: sprite,
          spriteKey: chosenType,
          active: true,
          scoreValue: 100,
          health: 1,
          maxHealth: 1,
          state: 'ENTERING',
          formationPos: { x: 0, y: 0 },
          entryPath: groupPath,
          entryIndex: -i * 12, 
          divepath: null,
          diveIndex: 0,
          diveTimer: 999999, 
          cloakState: 'NONE',
          cloakTimer: 0,
          opacity: 1,
          divePhase: 0,
          diveAngle: 0,
          isChallengeEnemy: true
        });
    }
    enemiesRef.current = enemies;
    challengeWaveActiveRef.current = true;
  };

  const createLoopPath = (startPos: Position, formationPos: Position, clockwise: boolean): Position[] => {
      const path: Position[] = [];
      const centerX = CANVAS_WIDTH / 2;
      const centerY = CANVAS_HEIGHT / 2 - 40; 
      const radius = 80;
      const stepsCircle = 60; 
      const stepsApproach = 40;
      const stepsExit = 40;

      const circleEntry = { x: centerX, y: centerY + radius };
      const cp1 = { x: startPos.x, y: (startPos.y + circleEntry.y) / 2 };
      path.push(...createBezierPath(startPos, cp1, circleEntry, stepsApproach));

      const startAngle = Math.PI / 2;
      for (let i = 0; i <= stepsCircle; i++) {
          const t = i / stepsCircle;
          const angleOffset = t * Math.PI * 2 * (clockwise ? 1 : -1);
          const angle = startAngle - angleOffset;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          path.push({x, y});
      }
      
      const circleExit = path[path.length - 1];
      const cp2 = { x: formationPos.x, y: (circleExit.y + formationPos.y) / 2 };
      path.push(...createBezierPath(circleExit, cp2, formationPos, stepsExit));
      
      return path;
  };

  const createSinePath = (startPos: Position, formationPos: Position, enterFromLeft: boolean): Position[] => {
      const path: Position[] = [];
      const stepsLeg1 = 30;
      const stepsLeg2 = 30;
      const stepsLeg3 = 20;

      const p1 = { x: enterFromLeft ? CANVAS_WIDTH * 0.35 : CANVAS_WIDTH * 0.65, y: 120 };
      const c1 = { x: enterFromLeft ? -20 : CANVAS_WIDTH + 20, y: 300 };
      path.push(...createBezierPath(startPos, c1, p1, stepsLeg1));

      const p2 = { x: enterFromLeft ? CANVAS_WIDTH * 0.65 : CANVAS_WIDTH * 0.35, y: 350 };
      const c2 = { x: enterFromLeft ? CANVAS_WIDTH * 0.5 : CANVAS_WIDTH * 0.5, y: 100 };
      path.push(...createBezierPath(p1, c2, p2, stepsLeg2));

      const c3 = { x: formationPos.x, y: 350 };
      path.push(...createBezierPath(p2, c3, formationPos, stepsLeg3));

      return path;
  };

  const createSwirlPath = (startPos: Position, formationPos: Position): Position[] => {
      const path: Position[] = [];
      const centerX = CANVAS_WIDTH / 2;
      const centerY = CANVAS_HEIGHT / 2;
      const stepsApproach = 30;
      const stepsSwirl = 140; 
      const stepsExit = 40;

      // Phase 1: Move from bottom to center
      for (let i = 0; i <= stepsApproach; i++) {
          const t = i / stepsApproach;
          path.push({
              x: startPos.x,
              y: startPos.y + (centerY - startPos.y) * t
          });
      }

      // Phase 2: Swirl out slowly
      for (let i = 0; i <= stepsSwirl; i++) {
          const t = i / stepsSwirl;
          const angle = -Math.PI / 2 + t * Math.PI * 6; // ~3 rotations
          const radius = t * 140; // Expand outwards
          path.push({
              x: centerX + Math.cos(angle) * radius,
              y: centerY + Math.sin(angle) * radius
          });
      }

      // Phase 3: Head to formation position
      const lastPos = path[path.length - 1];
      for (let i = 0; i <= stepsExit; i++) {
          const t = i / stepsExit;
          path.push({
              x: lastPos.x + (formationPos.x - lastPos.x) * t,
              y: lastPos.y + (formationPos.y - lastPos.y) * t
          });
      }
      return path;
  };

  const prepareWave = (level: number) => {
    playSound('start'); 
    waveReadyRef.current = false; 

    const enemies: Enemy[] = [];
    const rows = level === 1 ? 2 : Math.min(3 + Math.ceil(level / 3), 6);
    const cols = 8;
    const spacingX = 40;
    const spacingY = 35;
    
    const totalFormationWidth = cols * spacingX;
    const startX = (CANVAS_WIDTH - totalFormationWidth) / 2 + (spacingX / 2);
    const startY = 80;

    const hasBoss = level % 3 === 0 || level === 1;
    const patternType = PATTERN_SEQUENCE[(level - 1) % PATTERN_SEQUENCE.length];
    
    const loopVariant = Math.floor(Math.random() * 3); 
    const sineVariant = Math.random() < 0.5 ? 0 : 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let type: 'BEE' | 'BUTTERFLY' | 'BOSS' | 'GALAXIAN' | 'SCORPION' | 'BOSCONIAN' | 'DRAGONFLY' | 'COMMANDER' | 'ZAKO' | 'GOEI' | 'TOROID' = 'BEE';
        let sprite = SPRITES.BEE;
        let color = COLORS.BEE;
        let palette = PALETTES.BEE;
        let score = 100;
        let hp = 1;

        if (hasBoss && r === 0 && (c === 3 || c === 4)) {
            type = 'BOSS';
            sprite = SPRITES.BOSS;
            color = COLORS.BOSS;
            palette = PALETTES.BOSS;
            score = 1000;
            hp = 4 + Math.floor(level / 3);
        } else if (r === 0) {
            if (c % 2 === 0) {
                type = 'BUTTERFLY';
                sprite = SPRITES.BUTTERFLY;
                color = COLORS.BUTTERFLY;
                palette = PALETTES.BUTTERFLY;
                score = 200;
            } else {
                type = 'COMMANDER';
                sprite = SPRITES.COMMANDER;
                color = COLORS.COMMANDER;
                palette = PALETTES.COMMANDER;
                score = 400;
            }
        } else if (r === 1) {
             if (c % 2 === 0) {
                type = 'GALAXIAN';
                sprite = SPRITES.GALAXIAN;
                color = COLORS.GALAXIAN;
                palette = PALETTES.GALAXIAN;
                score = 150;
             } else {
                type = 'ZAKO';
                sprite = SPRITES.ZAKO;
                color = COLORS.ZAKO;
                palette = PALETTES.ZAKO;
                score = 250;
             }
        } else if (r === 2) {
             if (c % 2 === 0) {
                 type = 'SCORPION';
                 sprite = SPRITES.SCORPION;
                 color = COLORS.SCORPION;
                 palette = PALETTES.SCORPION;
                 score = 180;
             } else {
                 type = 'GOEI';
                 sprite = SPRITES.GOEI;
                 color = COLORS.GOEI;
                 palette = PALETTES.GOEI;
                 score = 220;
             }
        } else if (r === 3) {
             if (c % 2 === 0) {
                 type = 'DRAGONFLY';
                 sprite = SPRITES.DRAGONFLY;
                 color = COLORS.DRAGONFLY;
                 palette = PALETTES.DRAGONFLY;
                 score = 120;
             } else {
                 type = 'TOROID';
                 sprite = SPRITES.TOROID;
                 color = COLORS.TOROID;
                 palette = PALETTES.TOROID;
                 score = 160;
             }
        } else {
             if (c % 2 === 0) {
                type = 'BEE';
                sprite = SPRITES.BEE;
                color = COLORS.BEE;
                palette = PALETTES.BEE;
             } else {
                type = 'BOSCONIAN';
                sprite = SPRITES.BOSCONIAN;
                color = COLORS.BOSCONIAN;
                palette = PALETTES.BOSCONIAN;
             }
        }

        const width = sprite[0].length * PIXEL_SCALE;
        const height = sprite.length * PIXEL_SCALE;
        const formationPos = { x: startX + c * spacingX, y: startY + r * spacingY };

        let p0: Position = { x: 0, y: 0 }; 
        let path: Position[] = [];

        if (patternType === 6) {
            p0 = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT + 50 };
            path = createSwirlPath(p0, formationPos);
        } else if (patternType === 5) {
            const enterFromLeft = sineVariant === 0;
            p0 = { x: enterFromLeft ? -50 : CANVAS_WIDTH + 50, y: 600 };
            path = createSinePath(p0, formationPos, enterFromLeft);
        } else if (patternType === 4) {
            let isClockwise = true;
            let startSideX = CANVAS_WIDTH + 50;
            if (loopVariant === 0) { 
                isClockwise = true;
                startSideX = CANVAS_WIDTH + 50;
            } else if (loopVariant === 1) { 
                isClockwise = false;
                startSideX = -50;
            } else { 
                if (c < cols / 2) {
                    isClockwise = false;
                    startSideX = -50;
                } else {
                    isClockwise = true;
                    startSideX = CANVAS_WIDTH + 50;
                }
            }
            p0 = { x: startSideX, y: CANVAS_HEIGHT + 50 };
            path = createLoopPath(p0, formationPos, isClockwise);
        } else {
            let p1: Position = { x: 0, y: 0 };
            const steps = 60 + Math.random() * 20;

            if (patternType === 0) { 
                p0 = { x: -100, y: CANVAS_HEIGHT * 0.8 };
                p1 = { x: CANVAS_WIDTH * 0.2, y: -200 }; 
            } else if (patternType === 1) {
                p0 = { x: CANVAS_WIDTH + 100, y: CANVAS_HEIGHT * 0.8 };
                p1 = { x: CANVAS_WIDTH * 0.8, y: -200 };
            } else if (patternType === 2) {
                 const side = c < cols / 2 ? -1 : 1;
                 p0 = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT + 50 };
                 p1 = { x: CANVAS_WIDTH / 2 + (side * 400), y: -100 };
            } else {
                const side = c % 2 === 0 ? -1 : 1;
                p0 = { x: CANVAS_WIDTH / 2 + (side * 400), y: CANVAS_HEIGHT * 0.5 };
                p1 = { x: CANVAS_WIDTH / 2, y: -300 };
            }
            path = createBezierPath(p0, p1, formationPos, steps);
        }

        enemies.push({
          id: `enemy_${level}_${r}_${c}`,
          type,
          pos: { x: p0.x, y: p0.y },
          vel: { dx: 0, dy: 0 },
          width,
          height,
          color,
          palette,
          sprite,
          spriteKey: type,
          active: true,
          scoreValue: score,
          health: hp,
          maxHealth: hp,
          state: 'ENTERING',
          formationPos,
          entryPath: path,
          entryIndex: 0,
          divepath: null,
          diveIndex: 0,
          diveTimer: 2000 + Math.random() * 3000, 
          cloakState: 'NONE',
          cloakTimer: 0,
          opacity: 1,
          divePhase: 0,
          diveAngle: 0
        });
      }
    }
    
    spawnQueueRef.current = enemies;
    enemiesRef.current = []; 
  };

  const createExplosion = (x: number, y: number, color: string, scale = 1) => {
    playSound('explosion');
    for (let i = 0; i < 20; i++) {
      const speed = (Math.random() * 2 + 2) * scale;
      const angle = Math.random() * Math.PI * 2;
      particlesRef.current.push({
        x, 
        y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        life: 1.0,
        color: color,
        size: (Math.random() * 3 + 2) * scale
      });
    }
  };

  const spawnEnemyBullet = (enemy: Enemy) => {
    bulletsRef.current.push({
      id: `bullet_${Date.now()}_${Math.random()}`,
      pos: { x: enemy.pos.x + enemy.width / 2, y: enemy.pos.y + enemy.height },
      vel: { dx: 0, dy: ENEMY_BULLET_SPEED },
      width: 4,
      height: 12,
      color: COLORS.BULLET_ENEMY,
      sprite: [], 
      active: true,
      owner: 'ENEMY',
      ownerId: enemy.id
    });
    playSound('enemy_shoot');
  };

  const resetGame = useCallback(() => {
    scoreRef.current = 0;
    livesRef.current = 3;
    levelRef.current = 1;
    nextLifeThresholdIndexRef.current = 0;
    onScoreUpdate(0);
    onLivesUpdate(3);
    onLevelUpdate(1);
    activePowerUpsRef.current = [];
    onActivePowerUpsChange([]);
    bulletsRef.current = [];
    enemiesRef.current = [];
    particlesRef.current = [];
    powerUpsRef.current = [];
    barriersRef.current = [];
    spawnQueueRef.current = [];
    powerUpCooldownsRef.current = { 'RAPID_FIRE': 0, 'SHIELD': 0 };
    spawnPlayer();
    prepareWave(1);
    stopUfoSound();
    mysteryShipRef.current = null;
    mysteryShipCooldownRef.current = 1000;
    challengeGroupIndexRef.current = 0;
    challengeHitCountRef.current = 0;
    challengeWaveActiveRef.current = false;
    challengeUsedTypesRef.current = [];
    challengeUsedPatternsRef.current = [];
  }, [onScoreUpdate, onLivesUpdate, onLevelUpdate, onActivePowerUpsChange]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.target === canvasRef.current) e.preventDefault();
    const touch = e.touches[0];
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (touch.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (touch.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    if (gameState === GameState.INTRO) {
        if (!introStarted) {
          setIntroStarted(true);
          startIntroAmbience();
        } else {
          setGameState(GameState.START);
        }
        return;
    }

    if (gameState === GameState.PLAYING || gameState === GameState.CHALLENGE_PLAYING) {
        if (y > CANVAS_HEIGHT * 0.75) {
            touchXRef.current = x;
        } else {
            setGameState(GameState.PAUSED);
            stopUfoSound();
            touchXRef.current = null;
        }
    } else if (gameState === GameState.PAUSED) {
        setGameState(GameState.PLAYING);
        touchXRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (e.target === canvasRef.current) e.preventDefault();
      if (gameState !== GameState.PLAYING && gameState !== GameState.CHALLENGE_PLAYING) return;
      
      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (touch.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
      const y = (touch.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
      
      if (y > CANVAS_HEIGHT * 0.75) {
        touchXRef.current = x;
      }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (e.target === canvasRef.current) e.preventDefault();
      touchXRef.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (gameState === GameState.INTRO) {
          if (!introStarted) {
            setIntroStarted(true);
            startIntroAmbience();
          } else {
            setGameState(GameState.START);
          }
          return;
      }
      if (gameState === GameState.PLAYING || gameState === GameState.CHALLENGE_PLAYING) {
          setGameState(GameState.PAUSED);
          stopUfoSound();
      } 
  };

  useEffect(() => {
    lastTimeRef.current = 0;
    
    let animationFrameId: number;

    const handlePlayerHit = () => {
        if (!playerRef.current) return;

        const hasShield = activePowerUpsRef.current.some(p => p.type === 'SHIELD');
        if (hasShield) {
            playSound('shield_hit');
            const newPowerUps = activePowerUpsRef.current.filter(p => p.type !== 'SHIELD');
            activePowerUpsRef.current = newPowerUps;
            onActivePowerUpsChange(newPowerUps);
            powerUpCooldownsRef.current['SHIELD'] = 600 + Math.random() * 600;
            return;
        }

        createExplosion(playerRef.current.pos.x + playerRef.current.width/2, playerRef.current.pos.y + playerRef.current.height/2, COLORS.PLAYER, 2);
        playerRef.current.active = false;
        
        playSound('game_over');
        
        bulletsRef.current = []; 
        activePowerUpsRef.current = [];
        onActivePowerUpsChange([]);
        powerUpsRef.current = [];

        setTimeout(() => {
            livesRef.current--;
            onLivesUpdate(livesRef.current);

            if (livesRef.current > 0) {
                respawnStateRef.current = 'RETURNING';
                respawnTimerRef.current = 0;
                countdownValueRef.current = 3;
            } else {
                setGameState(GameState.GAME_OVER);
            }
        }, 1000);
    };

    const loop = (time: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = time;
      }
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;

      const input = pollInput();

      if (gameState === GameState.INTRO) {
          if (introStarted) {
            if (input.fire || input.start) {
              setGameState(GameState.START);
            }
            introTimeElapsedRef.current += dt;
            const lineDuration = 3000;
            const totalIntroTime = INTRO_LINES.length * lineDuration;
            if (introTimeElapsedRef.current >= totalIntroTime + 1000) {
                setGameState(GameState.START);
            }
          } else {
            introTimeElapsedRef.current = 0;
          }
      }

      if (gameState === GameState.START || gameState === GameState.GAME_OVER) {
          if (input.start || input.fire) {
              setGameState(GameState.PLAYING);
              resetGame();
          }
      }
      
      if (gameState === GameState.PLAYING || gameState === GameState.VICTORY || gameState === GameState.CHALLENGE_PLAYING || gameState === GameState.CHALLENGE_RESULTS || gameState === GameState.CHALLENGE_INTRO) {
          const timeScale = dt / 16.67; 
          timeRef.current += 0.05 * timeScale;

          Object.keys(powerUpCooldownsRef.current).forEach(k => {
              const key = k as PowerUpType;
              if (powerUpCooldownsRef.current[key] > 0) {
                  powerUpCooldownsRef.current[key] -= 1 * timeScale;
              }
          });

          nebulaeRef.current.forEach(n => {
              n.x += n.vx * timeScale;
              n.y += n.vy * timeScale;
              n.colorVar = Math.sin(timeRef.current * 0.2) * 10;
              if (n.x < -n.radius) n.x = CANVAS_WIDTH + n.radius;
              if (n.x > CANVAS_WIDTH + n.radius) n.x = -n.radius;
              if (n.y < -n.radius) n.y = CANVAS_HEIGHT + n.radius;
              if (n.y > CANVAS_HEIGHT + n.radius) n.y = -n.radius;
          });

          starsRef.current.forEach(star => {
              let speedMult = 1;
              if (gameState === GameState.VICTORY) speedMult = 15; 

              star.y += star.speed * speedMult * timeScale; 
              if (star.y > CANVAS_HEIGHT) {
                  star.y = 0;
                  star.x = Math.random() * CANVAS_WIDTH;
              }
          });

          if (gameState === GameState.PLAYING || gameState === GameState.CHALLENGE_PLAYING) {
              if (Math.random() < 0.002 * timeScale) { 
                  const size = 50 + Math.random() * 100; 
                  supernovasRef.current.push({
                      x: Math.random() * CANVAS_WIDTH,
                      y: Math.random() * CANVAS_HEIGHT,
                      life: 1.0,
                      maxLife: 1.0,
                      size: size
                  });
              }
              supernovasRef.current.forEach(s => s.life -= 0.02 * timeScale);
              supernovasRef.current = supernovasRef.current.filter(s => s.life > 0);
          }

          powerUpsRef.current.forEach(p => {
              p.pos.y += p.vel.dy * timeScale;
              if (p.pos.y > CANVAS_HEIGHT) p.active = false;
          });
          powerUpsRef.current = powerUpsRef.current.filter(p => p.active);

          activePowerUpsRef.current.forEach(p => {
              p.timeLeft -= 1 * timeScale;
              if (p.timeLeft <= 0) {
                  powerUpCooldownsRef.current[p.type] = 500 + Math.random() * 500;
              }
          });
          
          activePowerUpsRef.current = activePowerUpsRef.current.filter(p => p.timeLeft > 0);

          if (activePowerUpsRef.current.length !== lastActivePowerUpsCountRef.current || wasActiveRef.current) {
              onActivePowerUpsChange([...activePowerUpsRef.current]);
              lastActivePowerUpsCountRef.current = activePowerUpsRef.current.length;
              wasActiveRef.current = activePowerUpsRef.current.length > 0;
          }

          if (gameState === GameState.PLAYING && spawnQueueRef.current.length === 0) {
              if (!mysteryShipRef.current) {
                  if (mysteryShipCooldownRef.current > 0) {
                      mysteryShipCooldownRef.current -= 1 * timeScale;
                  } else {
                      if (Math.random() < 0.001 * timeScale) {
                          const startLeft = Math.random() > 0.5;
                          mysteryShipRef.current = {
                              id: 'ufo',
                              pos: { x: startLeft ? -40 : CANVAS_WIDTH + 40, y: 40 },
                              vel: { dx: startLeft ? 2.8 : -2.8, dy: 0 },
                              width: SPRITES.UFO[0].length * PIXEL_SCALE,
                              height: SPRITES.UFO.length * PIXEL_SCALE,
                              color: COLORS.UFO,
                              palette: PALETTES.UFO,
                              sprite: SPRITES.UFO,
                              spriteKey: 'UFO',
                              active: true,
                              behaviorState: 'NORMAL',
                              behaviorTimer: 0
                          };
                          startUfoSound();
                      }
                  }
              } else {
                  const ship = mysteryShipRef.current;
                  if (ship.behaviorTimer !== undefined && ship.behaviorTimer > 0) {
                      ship.behaviorTimer -= 1 * timeScale;
                  } else {
                      const r = Math.random();
                      if (r < 0.05) {
                          ship.behaviorState = 'PAUSED';
                          ship.behaviorTimer = 15 + Math.random() * 25; 
                      } else if (r < 0.12) {
                          ship.behaviorState = 'FAST';
                          ship.behaviorTimer = 8 + Math.random() * 15; 
                      } else {
                          ship.behaviorState = 'NORMAL';
                          ship.behaviorTimer = 10 + Math.random() * 30;
                      }
                  }

                  let speedMult = 1;
                  if (ship.behaviorState === 'PAUSED') speedMult = 0;
                  else if (ship.behaviorState === 'FAST') speedMult = 4.2; 
                  
                  const jitter = (Math.random() - 0.5) * 1.5;
                  const verticalOsc = Math.sin(timeRef.current * 1.2) * 2.0;
                  ship.pos.x += (ship.vel.dx * speedMult + jitter) * timeScale;
                  ship.pos.y = 40 + verticalOsc;
                  
                  if ((ship.vel.dx > 0 && ship.pos.x > CANVAS_WIDTH + 50) || 
                      (ship.vel.dx < 0 && ship.pos.x < -50)) {
                      mysteryShipRef.current = null;
                      stopUfoSound();
                      mysteryShipCooldownRef.current = 1000 + Math.random() * 500;
                  }
              }
          } else {
            stopUfoSound(); 
          }

          if (input.quit) {
              setGameState(GameState.GAME_OVER);
          }

          if (gameState === GameState.VICTORY || gameState === GameState.CHALLENGE_INTRO) {
            if (mysteryShipRef.current) {
                mysteryShipRef.current = null;
                stopUfoSound();
            }
            if (playerRef.current) {
              const targetX = CANVAS_WIDTH / 2 - playerRef.current.width / 2;
              const dx = targetX - playerRef.current.pos.x;
              if (Math.abs(dx) > 0.5) {
                playerRef.current.pos.x += dx * 0.05 * timeScale;
              }
            }
          }

          if (gameState === GameState.PLAYING) {
              if (enemiesRef.current.length === 0 && spawnQueueRef.current.length === 0 && !mysteryShipRef.current) {
                  if (waveTimerRef.current === 0) bulletsRef.current = [];
                  waveTimerRef.current += dt;
                  if (waveTimerRef.current > 3000) {
                      waveTimerRef.current = 0;
                      // Trigger Challenge only every 3 levels
                      if (levelRef.current % 3 === 0) {
                        setGameState(GameState.CHALLENGE_INTRO);
                        challengeWaveTimerRef.current = 0;
                        countdownValueRef.current = 3;
                        challengeUsedTypesRef.current = [];
                        challengeUsedPatternsRef.current = [];
                      } else {
                        setGameState(GameState.VICTORY);
                        bulletsRef.current = [];
                        activePowerUpsRef.current = []; 
                        powerUpsRef.current = []; 
                        onActivePowerUpsChange([]); 
                        stopUfoSound(); 
                        playSound('warp');
                        setTimeout(() => {
                            if (livesRef.current > 0) {
                              levelRef.current++;
                              onLevelUpdate(levelRef.current);
                              setGameState(GameState.PLAYING);
                              prepareWave(levelRef.current);
                            }
                        }, 3000);
                      }
                  }
              }
              
              if (respawnStateRef.current === 'RETURNING') {
                  let allInPosition = true;
                  enemiesRef.current.forEach(e => {
                      e.state = 'FORMATION'; 
                      const dx = e.formationPos.x - e.pos.x;
                      const dy = e.formationPos.y - e.pos.y;
                      const dist = Math.sqrt(dx*dx + dy*dy);
                      const speed = 12 * timeScale;
                      if (dist > speed) {
                          e.pos.x += (dx / dist) * speed; 
                          e.pos.y += (dy / dist) * speed;
                          allInPosition = false;
                      } else {
                          e.pos.x = e.formationPos.x;
                          e.pos.y = e.formationPos.y;
                      }
                  });
                  if (allInPosition) {
                      respawnStateRef.current = 'WAITING';
                      respawnTimerRef.current = 0;
                      countdownValueRef.current = 3;
                      spawnPlayer(true);
                  }
              } else if (respawnStateRef.current === 'WAITING') {
                  respawnTimerRef.current += dt;
                  const newVal = 3 - Math.floor(respawnTimerRef.current / 800);
                  if (newVal !== countdownValueRef.current) countdownValueRef.current = newVal;
                  if (respawnTimerRef.current > 2400) { 
                      if (playerRef.current) playerRef.current.active = true;
                      respawnStateRef.current = 'NONE';
                      playSound('start');
                  }
              }

              const isVictorySequence = enemiesRef.current.length === 0 && spawnQueueRef.current.length === 0 && !mysteryShipRef.current;

              if (playerRef.current && playerRef.current.active && respawnStateRef.current === 'NONE' && !isVictorySequence) {
                  if (input.left) playerRef.current.pos.x -= PLAYER_SPEED * timeScale;
                  if (input.right) playerRef.current.pos.x += PLAYER_SPEED * timeScale;
                  if (touchXRef.current !== null) {
                      const pCenter = playerRef.current.pos.x + playerRef.current.width / 2;
                      if (touchXRef.current < pCenter - 5) playerRef.current.pos.x -= PLAYER_SPEED * timeScale;
                      if (touchXRef.current > pCenter + 5) playerRef.current.pos.x += PLAYER_SPEED * timeScale;
                  }
                  playerRef.current.pos.x = Math.max(10, Math.min(CANVAS_WIDTH - playerRef.current.width - 10, playerRef.current.pos.x));

                  if (fireCooldownRef.current > 0) fireCooldownRef.current -= 1 * timeScale;
                  const shouldFire = input.fire || (isMobileRef.current && fireCooldownRef.current <= 0);
                  const isRapidFire = activePowerUpsRef.current.some(p => p.type === 'RAPID_FIRE');
                  const playerBullets = bulletsRef.current.filter(b => b.owner === 'PLAYER');
                  if (shouldFire && fireCooldownRef.current <= 0 && playerBullets.length < (isRapidFire ? 4 : 2)) {
                      bulletsRef.current.push({
                          id: `p_bullet_${Date.now()}`,
                          pos: { x: playerRef.current.pos.x + playerRef.current.width / 2 - 2, y: playerRef.current.pos.y },
                          vel: { dx: 0, dy: -BULLET_SPEED },
                          width: 4, height: 12, color: COLORS.BULLET_PLAYER, sprite: [], active: true, owner: 'PLAYER'
                      });
                      playSound('shoot');
                      fireCooldownRef.current = isRapidFire ? FIRE_COOLDOWN_RAPID : FIRE_COOLDOWN_DEFAULT; 
                  }
                  const pRect = { x: playerRef.current.pos.x, y: playerRef.current.pos.y, w: playerRef.current.width, h: playerRef.current.height };
                  powerUpsRef.current.forEach(p => {
                      if (p.active && p.pos.x < pRect.x + pRect.w && p.pos.x + p.width > pRect.x && p.pos.y < pRect.y + pRect.h && p.pos.y + p.height > pRect.y) {
                          p.active = false;
                          playSound('powerup');
                          const newActive = [...activePowerUpsRef.current, { type: p.type, timeLeft: POWERUP_DURATION }];
                          activePowerUpsRef.current = newActive;
                          onActivePowerUpsChange(newActive);
                      }
                  });
              }

              if (spawnQueueRef.current.length > 0) {
                  spawnTimerRef.current += dt;
                  if (spawnTimerRef.current > 150) {
                      const enemy = spawnQueueRef.current.shift();
                      if (enemy) enemiesRef.current.push(enemy);
                      spawnTimerRef.current = 0;
                  }
              }

              const isFormationComplete = spawnQueueRef.current.length === 0 && !enemiesRef.current.some(e => e.state === 'ENTERING');
              const maxConcurrentDivers = 2 + Math.floor((levelRef.current - 1) / 4);
              let currentDivers = enemiesRef.current.filter(e => e.state === 'DIVING').length;
              if (diveCooldownRef.current > 0) diveCooldownRef.current -= 1 * timeScale;

              if (respawnStateRef.current === 'NONE') { 
                enemiesRef.current.forEach(enemy => {
                  if (enemy.cloakState === 'FADING_OUT') {
                    enemy.opacity -= 0.067 * timeScale; 
                    if (enemy.opacity <= 0) { enemy.opacity = 0; enemy.cloakState = 'INVISIBLE'; enemy.cloakTimer = 15; }
                  } else if (enemy.cloakState === 'INVISIBLE') {
                    enemy.cloakTimer -= 1 * timeScale;
                    if (enemy.cloakTimer <= 0) { enemy.cloakState = 'FADING_IN'; playSound('cloak'); }
                  } else if (enemy.cloakState === 'FADING_IN') {
                      enemy.opacity += 0.067 * timeScale;
                      if (enemy.opacity >= 1) { enemy.opacity = 1; enemy.cloakState = 'NONE'; }
                  }

                  if (enemy.state === 'ENTERING') {
                      if (enemy.entryIndex < enemy.entryPath.length - 1) {
                          enemy.entryIndex += 1.2 * timeScale; 
                          const idx = Math.min(Math.floor(enemy.entryIndex), enemy.entryPath.length - 1);
                          const p = enemy.entryPath[idx];
                          if (p) { enemy.pos.x = p.x - enemy.width / 2; enemy.pos.y = p.y - enemy.height / 2; }
                      } else enemy.state = 'FORMATION';
                  } else if (enemy.state === 'FORMATION') {
                      const time = Date.now() / 500;
                      enemy.pos.x = enemy.formationPos.x - enemy.width / 2 + Math.sin(time) * 5;
                      enemy.pos.y = enemy.formationPos.y - enemy.height / 2;
                      if (isFormationComplete && respawnStateRef.current === 'NONE') {
                        enemy.diveTimer -= 10 * timeScale; 
                        if (enemy.diveTimer <= 0) {
                            if (currentDivers < maxConcurrentDivers && diveCooldownRef.current <= 0) {
                                enemy.state = 'DIVING'; currentDivers++; enemy.diveTimer = 500 + Math.random() * 500;
                                playSound('dive');
                                const r = Math.random();
                                if (r < 0.1) enemy.diveType = 'DOUBLE_CIRCLE'; else if (r < 0.4) enemy.diveType = 'CIRCLE_BACK'; else if (r < 0.6) enemy.diveType = 'SINE_DIVE'; else enemy.diveType = 'DIRECT';
                                enemy.diveCycles = 0; enemy.diveAngle = 0; enemy.divePhase = 0;
                                if (levelRef.current >= 3 && enemy.cloakState === 'NONE' && Math.random() < Math.min(0.5, 0.1 + (levelRef.current - 3) * 0.05)) { enemy.cloakState = 'FADING_OUT'; playSound('cloak'); }
                                const baseSpeed = PLAYER_SPEED * (1.2 + Math.min(levelRef.current * 0.05, 1.3));
                                if (playerRef.current) {
                                    const angle = Math.atan2(playerRef.current.pos.y - enemy.pos.y, playerRef.current.pos.x - enemy.pos.x);
                                    enemy.vel.dx = Math.cos(angle) * baseSpeed; enemy.vel.dy = Math.sin(angle) * baseSpeed;
                                } else enemy.vel.dy = baseSpeed;
                            } else enemy.diveTimer = 500 + Math.random() * 1500;
                        }
                      }
                  } else if (enemy.state === 'DIVING') {
                      if (enemy.diveType === 'CIRCLE_BACK' || enemy.diveType === 'DOUBLE_CIRCLE') {
                          if (enemy.divePhase === 0) {
                              enemy.pos.y += enemy.vel.dy * 0.9 * timeScale; enemy.pos.x += enemy.vel.dx * 0.1 * timeScale; 
                              if (enemy.pos.y > CANVAS_HEIGHT * 0.65) { enemy.divePhase = 1; enemy.diveAngle = 0; enemy.diveDirection = enemy.pos.x < CANVAS_WIDTH / 2 ? 1 : -1; enemy.diveStartX = enemy.pos.x; enemy.diveStartY = enemy.pos.y; }
                          } else if (enemy.divePhase === 1) {
                              enemy.diveAngle! += 0.13 * timeScale; const radius = 70; const cx = enemy.diveStartX! + (radius * enemy.diveDirection!); const cy = enemy.diveStartY!;
                              enemy.pos.x = cx - Math.cos(enemy.diveAngle!) * radius * enemy.diveDirection!; enemy.pos.y = cy + Math.sin(enemy.diveAngle!) * radius;
                              if (enemy.diveAngle! >= Math.PI * 2) { enemy.diveCycles!++; if (enemy.diveCycles! >= (enemy.diveType === 'DOUBLE_CIRCLE' ? 2 : 1)) enemy.divePhase = 2; else enemy.diveAngle = 0; }
                          } else { enemy.pos.x += enemy.vel.dx * 1.3 * timeScale; enemy.pos.y += enemy.vel.dy * 1.3 * timeScale; }
                      } else if (enemy.diveType === 'SINE_DIVE') { enemy.pos.y += enemy.vel.dy * 0.9 * timeScale; enemy.pos.x += Math.sin(enemy.pos.y / 45) * 5 * timeScale;
                      } else { enemy.pos.x += enemy.vel.dx * timeScale; enemy.pos.y += enemy.vel.dy * timeScale; }
                      if (Math.random() < (Math.min(0.012, (levelRef.current === 1 ? 0.003 : 0.004) + (levelRef.current * 0.0002))) * timeScale) spawnEnemyBullet(enemy);
                      if (enemy.pos.y > CANVAS_HEIGHT + 50) { enemy.entryIndex = 0; enemy.pos.y = -50; enemy.state = 'ENTERING'; enemy.entryPath = createBezierPath(enemy.pos, {x: enemy.formationPos.x, y: enemy.formationPos.y - 100}, enemy.formationPos, 30); enemy.cloakState = 'NONE'; enemy.opacity = 1; }
                  }
                });
              }
              bulletsRef.current.forEach(b => { b.pos.x += b.vel.dx * timeScale; b.pos.y += b.vel.dy * timeScale; if (b.pos.y < -20 || b.pos.y > CANVAS_HEIGHT + 20) b.active = false; });
              bulletsRef.current = bulletsRef.current.filter(b => b.active);
              bulletsRef.current.filter(b => b.owner === 'PLAYER').forEach(b => {
                  enemiesRef.current.forEach(e => {
                      if (b.active && e.active && e.cloakState !== 'INVISIBLE' && b.pos.x < e.pos.x + e.width && b.pos.x + b.width > e.pos.x && b.pos.y < e.pos.y + e.height && b.pos.y + b.height > e.pos.y) {
                          b.active = false; e.health--;
                          if (e.health <= 0) {
                              e.active = false; createExplosion(e.pos.x + e.width/2, e.pos.y + e.height/2, e.color, 1.5);
                              scoreRef.current += (e.state === 'ENTERING' ? 50 : (e.state === 'FORMATION' ? 100 : 250));
                              while (nextLifeThresholdIndexRef.current < LIFE_THRESHOLDS.length && scoreRef.current >= LIFE_THRESHOLDS[nextLifeThresholdIndexRef.current]) { livesRef.current++; onLivesUpdate(livesRef.current); playSound('extend'); nextLifeThresholdIndexRef.current++; }
                              onScoreUpdate(scoreRef.current);
                              spawnPowerUp(e.pos.x + e.width/2 - 12, e.pos.y + e.height/2);
                              if (e.state === 'DIVING') diveCooldownRef.current = Math.max(20, 100 - (levelRef.current * 3));
                          } else playSound('shield_hit');
                      }
                  });
                  if (b.active && mysteryShipRef.current && mysteryShipRef.current.active) {
                      const ufo = mysteryShipRef.current;
                      if (b.pos.x < ufo.pos.x + ufo.width && b.pos.x + b.width > ufo.pos.x && b.pos.y < ufo.pos.y + ufo.height && b.pos.y + b.height > ufo.pos.y) {
                          b.active = false; ufo.active = false; mysteryShipRef.current = null; stopUfoSound(); createExplosion(ufo.pos.x + ufo.width/2, ufo.pos.y + ufo.height/2, '#ff0000', 3);
                          scoreRef.current += 1000;
                          while (nextLifeThresholdIndexRef.current < LIFE_THRESHOLDS.length && scoreRef.current >= LIFE_THRESHOLDS[nextLifeThresholdIndexRef.current]) { livesRef.current++; onLivesUpdate(livesRef.current); playSound('extend'); nextLifeThresholdIndexRef.current++; }
                          onScoreUpdate(scoreRef.current); playSound('bonus'); spawnPowerUp(ufo.pos.x + ufo.width/2 - 12, ufo.pos.y + ufo.height/2);
                      }
                  }
              });
              enemiesRef.current = enemiesRef.current.filter(e => e.active);
              if (playerRef.current && playerRef.current.active && !isVictorySequence && respawnStateRef.current === 'NONE') {
                  const pRect = { x: playerRef.current.pos.x + 4, y: playerRef.current.pos.y + 4, w: playerRef.current.width - 8, h: playerRef.current.height - 8 };
                  bulletsRef.current.filter(b => b.owner === 'ENEMY').forEach(b => { if (b.active && b.pos.x < pRect.x + pRect.w && b.pos.x + b.width > pRect.x && b.pos.y < pRect.y + pRect.h && b.pos.y + b.height > pRect.y) { b.active = false; handlePlayerHit(); } });
                  enemiesRef.current.forEach(e => { if (e.active && e.cloakState !== 'INVISIBLE' && e.pos.x < pRect.x + pRect.w && e.pos.x + e.width > pRect.x && e.pos.y < pRect.y + pRect.h && e.pos.y + e.height > pRect.y) { e.active = false; createExplosion(e.pos.x + e.width/2, e.pos.y + e.height/2, e.color); handlePlayerHit(); } });
              }
              particlesRef.current.forEach(p => { p.x += p.dx * timeScale; p.y += p.dy * timeScale; p.life -= 0.03 * timeScale; });
              particlesRef.current = particlesRef.current.filter(p => p.life > 0);

          } else if (gameState === GameState.CHALLENGE_INTRO) {
              challengeWaveTimerRef.current += dt;
              const newVal = 3 - Math.floor(challengeWaveTimerRef.current / 800);
              if (newVal !== countdownValueRef.current) countdownValueRef.current = newVal;
              if (challengeWaveTimerRef.current > 2400) {
                  setGameState(GameState.CHALLENGE_PLAYING);
                  challengeGroupIndexRef.current = 0;
                  challengeHitCountRef.current = 0;
                  challengeWaveActiveRef.current = false;
                  challengeWaveTimerRef.current = 0;
              }

          } else if (gameState === GameState.CHALLENGE_PLAYING) {
              if (!challengeWaveActiveRef.current && challengeGroupIndexRef.current < 5) {
                challengeWaveTimerRef.current += dt;
                if (challengeWaveTimerRef.current > 1000) {
                    spawnChallengeWave();
                    challengeWaveTimerRef.current = 0;
                }
              }

              // Calculated increment multiplier to match level speed difficulty
              const speedFactor = (1.2 + Math.min(levelRef.current * 0.05, 1.3)) / 1.25;
              const challengeIncrement = 0.85 * speedFactor;

              enemiesRef.current.forEach(enemy => {
                  if (enemy.entryIndex < enemy.entryPath.length - 1) {
                      enemy.entryIndex += challengeIncrement * timeScale; 
                      const idx = Math.floor(enemy.entryIndex);
                      if (idx >= 0) {
                        const p = enemy.entryPath[idx];
                        enemy.pos.x = p.x - enemy.width / 2;
                        enemy.pos.y = p.y - enemy.height / 2;
                      }
                  } else enemy.active = false;
              });

              if (playerRef.current && playerRef.current.active) {
                if (input.left) playerRef.current.pos.x -= PLAYER_SPEED * timeScale;
                if (input.right) playerRef.current.pos.x += PLAYER_SPEED * timeScale;
                playerRef.current.pos.x = Math.max(10, Math.min(CANVAS_WIDTH - playerRef.current.width - 10, playerRef.current.pos.x));
                if (fireCooldownRef.current > 0) fireCooldownRef.current -= 1 * timeScale;
                const shouldFire = input.fire || (isMobileRef.current && fireCooldownRef.current <= 0);
                const isRapidFire = activePowerUpsRef.current.some(p => p.type === 'RAPID_FIRE');
                if (shouldFire && fireCooldownRef.current <= 0 && bulletsRef.current.filter(b => b.owner === 'PLAYER').length < (isRapidFire ? 4 : 2)) {
                    bulletsRef.current.push({
                        id: `p_bullet_${Date.now()}`,
                        pos: { x: playerRef.current.pos.x + playerRef.current.width / 2 - 2, y: playerRef.current.pos.y },
                        vel: { dx: 0, dy: -BULLET_SPEED },
                        width: 4, height: 12, color: COLORS.BULLET_PLAYER, sprite: [], active: true, owner: 'PLAYER'
                    });
                    playSound('shoot');
                    fireCooldownRef.current = isRapidFire ? FIRE_COOLDOWN_RAPID : FIRE_COOLDOWN_DEFAULT; 
                }
              }

              bulletsRef.current.forEach(b => { b.pos.x += b.vel.dx * timeScale; b.pos.y += b.vel.dy * timeScale; if (b.pos.y < -20 || b.pos.y > CANVAS_HEIGHT + 20) b.active = false; });
              bulletsRef.current = bulletsRef.current.filter(b => b.active);
              
              bulletsRef.current.filter(b => b.owner === 'PLAYER').forEach(b => {
                enemiesRef.current.forEach(e => {
                    if (b.active && e.active && b.pos.x < e.pos.x + e.width && b.pos.x + b.width > e.pos.x && b.pos.y < e.pos.y + e.height && b.pos.y + b.height > e.pos.y) {
                        b.active = false; e.active = false;
                        createExplosion(e.pos.x + e.width/2, e.pos.y + e.height/2, e.color, 1.5);
                        challengeHitCountRef.current++;
                        scoreRef.current += 100;
                        onScoreUpdate(scoreRef.current);
                    }
                });
              });

              const allGone = enemiesRef.current.length === 0 && challengeWaveActiveRef.current;
              if (allGone) {
                challengeWaveActiveRef.current = false;
                challengeGroupIndexRef.current++;
                challengeWaveTimerRef.current = 0; 
              }
              
              if (challengeGroupIndexRef.current >= 5 && enemiesRef.current.length === 0) {
                  // Wait for all particles to finish
                  if (particlesRef.current.length === 0) {
                      setGameState(GameState.CHALLENGE_RESULTS);
                      challengeWaveTimerRef.current = 0;
                      // Clean up all sprites for results screen
                      bulletsRef.current = [];
                      enemiesRef.current = [];
                      powerUpsRef.current = [];
                  }
              }
              
              enemiesRef.current = enemiesRef.current.filter(e => e.active);
              particlesRef.current.forEach(p => { p.x += p.dx * timeScale; p.y += p.dy * timeScale; p.life -= 0.03 * timeScale; });
              particlesRef.current = particlesRef.current.filter(p => p.life > 0);

          } else if (gameState === GameState.CHALLENGE_RESULTS) {
              challengeWaveTimerRef.current += dt;
              if (challengeWaveTimerRef.current > 4000) {
                  setGameState(GameState.VICTORY);
                  bulletsRef.current = [];
                  activePowerUpsRef.current = []; 
                  powerUpsRef.current = []; 
                  onActivePowerUpsChange([]); 
                  stopUfoSound(); 
                  playSound('warp');
                  setTimeout(() => {
                      if (livesRef.current > 0) {
                        levelRef.current++; 
                        onLevelUpdate(levelRef.current);
                        setGameState(GameState.PLAYING);
                        prepareWave(levelRef.current);
                      }
                  }, 3000);
              }
          }
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
          ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          nebulaeRef.current.forEach(n => {
              const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
              const hue = (n.colorBase + n.colorVar) % 360;
              gradient.addColorStop(0, `hsla(${hue}, 60%, 40%, 0.5)`);
              gradient.addColorStop(1, `hsla(${hue}, 60%, 40%, 0)`);
              ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2); ctx.fill();
          });
          supernovasRef.current.forEach(s => {
              const gradient = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
              gradient.addColorStop(0, `rgba(255, 255, 255, ${s.life * 0.4})`);
              gradient.addColorStop(0.2, `rgba(255, 200, 100, ${s.life * 0.25})`);
              gradient.addColorStop(1, `rgba(255, 200, 100, 0)`);
              ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
          });
          starsRef.current.forEach(s => { const alpha = Math.floor(s.brightness * 255).toString(16).padStart(2,'0'); ctx.fillStyle = `#ffffff${alpha}`; ctx.fillRect(s.x, s.y, s.size, s.size); });

          if (gameState === GameState.INTRO && introStarted) {
              const lineDuration = 3000;
              const lineIndex = Math.floor(introTimeElapsedRef.current / lineDuration);
              if (lineIndex < INTRO_LINES.length) {
                  const lineTime = introTimeElapsedRef.current % lineDuration;
                  let opacity = 1;
                  if (lineTime < 500) opacity = lineTime / 500;
                  else if (lineTime > 2500) opacity = Math.max(0, (3000 - lineTime) / 500);

                  ctx.save();
                  ctx.textAlign = 'center';
                  ctx.fillStyle = `rgba(255, 255, 0, ${opacity})`;
                  ctx.shadowColor = `rgba(255, 255, 0, ${opacity * 0.8})`;
                  ctx.shadowBlur = 12;
                  ctx.shadowOffsetX = 0;
                  ctx.shadowOffsetY = 0;
                  ctx.font = '14px "Press Start 2P"';
                  ctx.fillText(INTRO_LINES[lineIndex], CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
                  ctx.restore();
              }
          }

          if (playerRef.current && playerRef.current.active && (gameState === GameState.PLAYING || gameState === GameState.VICTORY || gameState === GameState.PAUSED || gameState === GameState.CHALLENGE_PLAYING || gameState === GameState.CHALLENGE_INTRO || gameState === GameState.CHALLENGE_RESULTS)) {
             const sprite = spriteCacheRef.current['PLAYER'];
             if (sprite) {
                 ctx.drawImage(sprite, playerRef.current.pos.x, playerRef.current.pos.y);
                 const shield = activePowerUpsRef.current.find(p => p.type === 'SHIELD');
                 if (shield && (shield.timeLeft > (POWERUP_DURATION * 0.3) || Math.floor(Date.now() / 100) % 2 === 0)) {
                    ctx.strokeStyle = '#0088ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(playerRef.current.pos.x + playerRef.current.width/2, playerRef.current.pos.y + playerRef.current.height/2, playerRef.current.width * 0.8, 0, Math.PI * 2); ctx.stroke();
                 }
             }
          }
          if (mysteryShipRef.current && mysteryShipRef.current.active) {
              const sprite = spriteCacheRef.current['UFO'];
              if (sprite) ctx.drawImage(sprite, mysteryShipRef.current.pos.x, mysteryShipRef.current.pos.y);
          }
          enemiesRef.current.forEach(e => {
              if (e.active && e.opacity > 0.1) {
                  const sprite = spriteCacheRef.current[e.spriteKey || 'BEE'];
                  if (sprite) { ctx.save(); ctx.globalAlpha = e.opacity; ctx.drawImage(sprite, e.pos.x, e.pos.y); ctx.restore(); }
              }
          });
          if (gameState !== GameState.VICTORY && gameState !== GameState.CHALLENGE_RESULTS) bulletsRef.current.forEach(b => { if (b.active) { ctx.fillStyle = b.color; ctx.fillRect(b.pos.x, b.pos.y, b.width, b.height); } });
          particlesRef.current.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(p.x, p.y, p.size, p.size); ctx.globalAlpha = 1.0; });

          if (gameState === GameState.CHALLENGE_INTRO) {
              ctx.save();
              ctx.textAlign = 'center';
              const pulse = (Math.sin(Date.now() / 200) * 0.5) + 0.5;
              ctx.globalAlpha = 0.4 + (pulse * 0.6);
              ctx.fillStyle = '#22d3ee'; 
              ctx.font = '22px "Press Start 2P"';
              ctx.fillText('CHALLENGE SECTOR', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
              ctx.globalAlpha = 1.0;
              ctx.fillStyle = '#ffffff';
              ctx.font = '14px "Press Start 2P"';
              ctx.fillText(`FIRE IN ${Math.max(1, countdownValueRef.current)}...`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);
              ctx.restore();
          }

          if (gameState === GameState.CHALLENGE_RESULTS) {
              ctx.save();
              ctx.textAlign = 'center';
              const pulse = (Math.sin(Date.now() / 200) * 0.5) + 0.5;
              ctx.globalAlpha = 0.4 + (pulse * 0.6);
              ctx.fillStyle = '#facc15'; 
              ctx.font = '24px "Press Start 2P"';
              ctx.fillText('WELL DONE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
              ctx.globalAlpha = 1.0;
              ctx.fillStyle = '#ffffff';
              ctx.font = '14px "Press Start 2P"';
              ctx.fillText(`ENEMIES HIT: ${challengeHitCountRef.current}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);
              ctx.restore();
          }

          if (respawnStateRef.current === 'WAITING') {
              ctx.save();
              ctx.textAlign = 'center';
              const pulse = (Math.sin(Date.now() / 200) * 0.5) + 0.5;
              ctx.globalAlpha = 0.4 + (pulse * 0.6);
              ctx.fillStyle = '#facc15';
              ctx.font = '24px "Press Start 2P"';
              ctx.fillText('READY?', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
              ctx.globalAlpha = 1.0;
              ctx.fillStyle = '#ffffff';
              ctx.font = '14px "Press Start 2P"';
              ctx.fillText(`FIRE IN ${Math.max(1, countdownValueRef.current)}...`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);
              ctx.restore();
          }
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, introStarted, onScoreUpdate, onLivesUpdate, onLevelUpdate, onActivePowerUpsChange, setGameState, highScore, resetGame]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onMouseDown={handleMouseDown} className="block bg-black border-4 border-neutral-800 rounded-sm shadow-2xl" style={{ width: '100%', height: 'auto', maxWidth: '100%', imageRendering: 'pixelated', touchAction: 'none' }} />
      {gameState === GameState.INTRO && !introStarted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-white flex-col font-['Press_Start_2P'] z-30 cursor-pointer" onClick={() => { setIntroStarted(true); startIntroAmbience(); }}>
          <div className="animate-pulse text-center">
            <h1 className="text-yellow-400 text-2xl mb-8 tracking-widest" style={{ textShadow: '0 0 15px rgba(255,255,0,0.7)'}}>PIPPIN'S REVENGE</h1>
            <p className="text-xs text-white mb-2 tracking-widest uppercase">A Galaxy in Peril</p>
            <p className="text-[10px] text-gray-400 mt-10">TAP TO BEGIN MISSION</p>
          </div>
        </div>
      )}
      {gameState === GameState.START && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white flex-col font-['Press_Start_2P'] z-20 cursor-pointer" onClick={() => { setGameState(GameState.PLAYING); resetGame(); }}>
             <div className="animate-pulse text-center">
                <p className="text-yellow-400 mb-6 text-xl">READY?</p>
                <p className="text-xs text-white mb-2">PRESS START / ENTER</p>
                <p className="text-[10px] text-gray-400">TAP SCREEN</p>
             </div>
          </div>
      )}
      {gameState === GameState.PAUSED && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white flex-col font-['Press_Start_2P'] z-20 cursor-pointer" onClick={() => setGameState(GameState.PLAYING)}>
             <div className="animate-pulse text-center">
                <p className="text-yellow-400 mb-6 text-xl">PAUSED</p>
                <p className="text-xs text-white">TAP TO RESUME</p>
             </div>
          </div>
      )}
      {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white flex-col font-['Press_Start_2P'] z-20 cursor-pointer" onClick={() => { setGameState(GameState.PLAYING); resetGame(); }}>
             <p className="text-red-600 mb-4 text-2xl drop-shadow-md">GAME OVER</p>
             <p className="text-sm mb-8">FINAL SCORE: {scoreRef.current}</p>
             <div className="animate-pulse text-xs text-yellow-200">TRY AGAIN?</div>
          </div>
      )}
      {gameState === GameState.VICTORY && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white flex-col font-['Press_Start_2P'] z-20">
             <p className="text-cyan-400 mb-4 text-xl drop-shadow-md animate-bounce">SECTOR {levelRef.current} CLEAR</p>
             <p className="text-[10px] text-white uppercase">Warping to Sector {levelRef.current + 1}...</p>
          </div>
      )}
    </div>
  );
};

export default GameCanvas;
