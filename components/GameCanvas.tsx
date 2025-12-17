import React, { useRef, useEffect, useCallback } from 'react';
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
import { playSound, startUfoSound, stopUfoSound } from '../utils/sound';

interface GameCanvasProps {
  onScoreUpdate: (score: number) => void;
  onLivesUpdate: (lives: number) => void;
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
const LIFE_THRESHOLDS = [20000, 50000, 100000];

// Pattern sequence for levels
const PATTERN_SEQUENCE = [0, 4, 1, 5, 2, 4, 3, 5];

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  onScoreUpdate, 
  onLivesUpdate,
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
  
  // Mystery Ship Ref
  const mysteryShipRef = useRef<Entity | null>(null);
  const mysteryShipCooldownRef = useRef(1000); 

  // Dive Pacing Refs
  const diveCooldownRef = useRef(0);

  const bulletsRef = useRef<Bullet[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const activePowerUpsRef = useRef<ActivePowerUp[]>([]);
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
  
  // Initialize Stars, Nebulae, Sprite Cache, Mobile Check
  useEffect(() => {
    starsRef.current = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      speed: Math.random() * 2 + 0.5,
      size: Math.random() > 0.9 ? 2 : 1,
      brightness: Math.random()
    }));

    // Randomize Nebula initial positions and give them velocities
    nebulaeRef.current = [
      { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT, radius: 180, colorBase: 240, colorVar: 0, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2 },
      { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT, radius: 200, colorBase: 280, colorVar: 0, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2 },
      { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT, radius: 150, colorBase: 200, colorVar: 0, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2 },
      { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT, radius: 120, colorBase: 260, colorVar: 0, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2 },
      { x: Math.random() * CANVAS_WIDTH, y: Math.random() * CANVAS_HEIGHT, radius: 160, colorBase: 220, colorVar: 0, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2 },
    ];

    // Generate Sprite Cache
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
    };

  }, []);

  const spawnPlayer = () => {
    playerRef.current = {
      id: 'player',
      pos: { x: CANVAS_WIDTH / 2 - 20, y: CANVAS_HEIGHT - 60 },
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
     // 3% chance to spawn powerup
     if (Math.random() > 0.03) return;

     // Ensure formation is settled before spawning
     const isFormationSettled = spawnQueueRef.current.length === 0 && !enemiesRef.current.some(e => e.state === 'ENTERING');
     if (!isFormationSettled) return;

     const availableTypes: PowerUpType[] = [];
     
     // Check validity for RAPID_FIRE
     const rapidActive = activePowerUpsRef.current.some(p => p.type === 'RAPID_FIRE');
     const rapidFalling = powerUpsRef.current.some(p => p.type === 'RAPID_FIRE');
     const rapidCooldown = powerUpCooldownsRef.current['RAPID_FIRE'] > 0;
     if (!rapidActive && !rapidFalling && !rapidCooldown) availableTypes.push('RAPID_FIRE');

     // Check validity for SHIELD
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
         vel: { dx: 0, dy: 3.5 }, // Drops faster
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

  const createLoopPath = (startPos: Position, formationPos: Position, clockwise: boolean): Position[] => {
      const path: Position[] = [];
      const centerX = CANVAS_WIDTH / 2;
      const centerY = CANVAS_HEIGHT / 2 - 40; 
      const radius = 80;
      // Increased steps for smoother and slower movement
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
            hp = 4 + level;
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

        if (patternType === 5) {
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
          // Initial staggered start for dives
          diveTimer: 2000 + Math.random() * 3000, 
          cloakState: 'NONE',
          cloakTimer: 0,
          opacity: 1
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
      height: 12, // Matched player bullet size
      color: COLORS.BULLET_ENEMY,
      sprite: [], 
      active: true,
      owner: 'ENEMY',
      ownerId: enemy.id // Track which enemy fired this
    });
    playSound('enemy_shoot');
  };

  const resetGame = useCallback(() => {
    scoreRef.current = 0;
    livesRef.current = 3;
    levelRef.current = 1;
    onScoreUpdate(0);
    onLivesUpdate(3);
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
  }, [onScoreUpdate, onLivesUpdate, onActivePowerUpsChange]);

  // Main Game Loop
  useEffect(() => {
    let animationFrameId: number;

    const handlePlayerHit = () => {
        if (!playerRef.current) return;

        // CHECK FOR SHIELD
        const hasShield = activePowerUpsRef.current.some(p => p.type === 'SHIELD');
        if (hasShield) {
            playSound('shield_hit');
            // Remove shield
            const newPowerUps = activePowerUpsRef.current.filter(p => p.type !== 'SHIELD');
            activePowerUpsRef.current = newPowerUps;
            onActivePowerUpsChange(newPowerUps);
            
            // Set cooldown
            powerUpCooldownsRef.current['SHIELD'] = 600 + Math.random() * 600;
            return;
        }

        createExplosion(playerRef.current.pos.x + playerRef.current.width/2, playerRef.current.pos.y + playerRef.current.height/2, COLORS.PLAYER, 2);
        playerRef.current.active = false;
        livesRef.current--;
        onLivesUpdate(livesRef.current);
        playSound('game_over');
        
        bulletsRef.current = []; // Clear bullets immediately
        activePowerUpsRef.current = []; // Clear powerups on death
        onActivePowerUpsChange([]);
        powerUpsRef.current = []; // Clear falling powerups

        if (livesRef.current > 0) {
            // Trigger return to formation
            respawnStateRef.current = 'RETURNING';
            respawnTimerRef.current = 0;
        } else {
            setGameState(GameState.GAME_OVER);
        }
    };

    const loop = (time: number) => {
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;
      
      // Calculate Time Scale (Normalized to 60FPS)
      const timeScale = dt / 16.67; 
      
      timeRef.current += 0.05 * timeScale;

      // Update PowerUp Cooldowns
      Object.keys(powerUpCooldownsRef.current).forEach(k => {
          const key = k as PowerUpType;
          if (powerUpCooldownsRef.current[key] > 0) {
              powerUpCooldownsRef.current[key] -= 1 * timeScale;
          }
      });

      // Update Nebula
      nebulaeRef.current.forEach(n => {
          n.x += n.vx * timeScale;
          n.y += n.vy * timeScale;
          n.colorVar = Math.sin(timeRef.current * 0.2) * 10; // Reduced variance magnitude (was 20)

          // Bounce logic
          if (n.x < -n.radius) n.x = CANVAS_WIDTH + n.radius;
          if (n.x > CANVAS_WIDTH + n.radius) n.x = -n.radius;
          if (n.y < -n.radius) n.y = CANVAS_HEIGHT + n.radius;
          if (n.y > CANVAS_HEIGHT + n.radius) n.y = -n.radius;
      });

      // Update Stars
      starsRef.current.forEach(star => {
          // Speed up during warp (VICTORY)
          let speedMult = 1;
          if (gameState === GameState.VICTORY) speedMult = 10;
          // Note: Removed Rapid Fire star warp effect

          star.y += star.speed * speedMult * timeScale; 
          if (star.y > CANVAS_HEIGHT) {
              star.y = 0;
              star.x = Math.random() * CANVAS_WIDTH;
          }
      });

      // Supernova Logic - Smaller and Less frequent
      if (gameState === GameState.PLAYING) {
          if (Math.random() < 0.002 * timeScale) { // Reduced from 0.005
              const size = 50 + Math.random() * 100; // Reduced from 100-300
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

      // Update PowerUps
      powerUpsRef.current.forEach(p => {
          p.pos.y += p.vel.dy * timeScale;
          if (p.pos.y > CANVAS_HEIGHT) p.active = false;
      });
      powerUpsRef.current = powerUpsRef.current.filter(p => p.active);

      // Update Active PowerUps & UI
      let powerUpsChanged = false;
      activePowerUpsRef.current.forEach(p => {
          p.timeLeft -= 1 * timeScale;
          if (p.timeLeft <= 0) {
              powerUpsChanged = true;
              // Set cooldown when expired
              powerUpCooldownsRef.current[p.type] = 500 + Math.random() * 500;
          }
      });
      
      activePowerUpsRef.current = activePowerUpsRef.current.filter(p => p.timeLeft > 0);

      // Ensure UI stays in sync for progress bar animation
      if (activePowerUpsRef.current.length > 0 || wasActiveRef.current) {
          onActivePowerUpsChange([...activePowerUpsRef.current]);
          wasActiveRef.current = activePowerUpsRef.current.length > 0;
      }

      // Mystery Ship Logic
      if (gameState === GameState.PLAYING && spawnQueueRef.current.length === 0) {
          if (!mysteryShipRef.current) {
              if (mysteryShipCooldownRef.current > 0) {
                  mysteryShipCooldownRef.current -= 1 * timeScale;
              } else {
                  // Spawn UFO
                  if (Math.random() < 0.001 * timeScale) {
                      const startLeft = Math.random() > 0.5;
                      mysteryShipRef.current = {
                          id: 'ufo',
                          pos: { x: startLeft ? -40 : CANVAS_WIDTH + 40, y: 40 },
                          vel: { dx: startLeft ? 2 : -2, dy: 0 },
                          width: SPRITES.UFO[0].length * PIXEL_SCALE,
                          height: SPRITES.UFO.length * PIXEL_SCALE,
                          color: COLORS.UFO,
                          palette: PALETTES.UFO,
                          sprite: SPRITES.UFO,
                          spriteKey: 'UFO',
                          active: true
                      };
                      startUfoSound();
                  }
              }
          } else {
              // Move UFO
              const ship = mysteryShipRef.current;
              ship.pos.x += ship.vel.dx * timeScale;
              
              if ((ship.vel.dx > 0 && ship.pos.x > CANVAS_WIDTH + 50) || 
                  (ship.vel.dx < 0 && ship.pos.x < -50)) {
                  mysteryShipRef.current = null;
                  stopUfoSound();
                  mysteryShipCooldownRef.current = 1000 + Math.random() * 500;
              }
          }
      } else {
        stopUfoSound(); // Ensure sound stops if game state changes
      }

      // Poll Input
      const input = pollInput();

      if (input.quit) {
          setGameState(GameState.GAME_OVER);
      }

      if (gameState === GameState.START || gameState === GameState.GAME_OVER) {
          if (input.start || input.fire) {
              setGameState(GameState.PLAYING);
              resetGame();
          }
      }

      if (gameState === GameState.PLAYING) {
          // Check Victory
          if (enemiesRef.current.length === 0 && spawnQueueRef.current.length === 0) {
              waveTimerRef.current += dt;
              if (waveTimerRef.current > 3000) {
                  levelRef.current++;
                  waveTimerRef.current = 0;
                  setGameState(GameState.VICTORY);
                  
                  // Cleanup on Victory
                  bulletsRef.current = []; // CLEAR BULLETS on warp
                  activePowerUpsRef.current = []; // Clear active powerups
                  powerUpsRef.current = []; // Clear falling powerups
                  onActivePowerUpsChange([]); // Update UI immediately

                  stopUfoSound(); // Stop UFO sound
                  playSound('warp');
                  setTimeout(() => {
                      if (livesRef.current > 0) {
                        setGameState(GameState.PLAYING);
                        prepareWave(levelRef.current);
                      }
                  }, 3000);
              }
          }

          // Respawn Sequence: Enemies return to formation
          if (respawnStateRef.current === 'RETURNING') {
              let allInPosition = true;
              enemiesRef.current.forEach(e => {
                  e.state = 'FORMATION'; // Cancel any dives
                  // Simple homing logic
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
              }
          } else if (respawnStateRef.current === 'WAITING') {
              respawnTimerRef.current += dt;
              // Wait 2 seconds showing READY
              if (respawnTimerRef.current > 2000) {
                  spawnPlayer();
                  if (playerRef.current) playerRef.current.active = true;
                  respawnStateRef.current = 'NONE';
                  playSound('start');
              }
          }

          // Player Logic
          if (playerRef.current && playerRef.current.active && respawnStateRef.current === 'NONE') {
              if (input.left) playerRef.current.pos.x -= PLAYER_SPEED * timeScale;
              if (input.right) playerRef.current.pos.x += PLAYER_SPEED * timeScale;
              
              playerRef.current.pos.x = Math.max(10, Math.min(CANVAS_WIDTH - playerRef.current.width - 10, playerRef.current.pos.x));

              if (fireCooldownRef.current > 0) fireCooldownRef.current -= 1 * timeScale;
              
              const shouldFire = input.fire || (isMobileRef.current && fireCooldownRef.current <= 0);

              // STRICT LIMIT: Max 2 bullets on screen, unless rapid fire
              const isRapidFire = activePowerUpsRef.current.some(p => p.type === 'RAPID_FIRE');
              const playerBullets = bulletsRef.current.filter(b => b.owner === 'PLAYER');
              const maxBullets = isRapidFire ? 4 : 2;
              const cooldownTime = isRapidFire ? FIRE_COOLDOWN_RAPID : FIRE_COOLDOWN_DEFAULT;

              if (shouldFire && fireCooldownRef.current <= 0 && playerBullets.length < maxBullets) {
                  bulletsRef.current.push({
                      id: `p_bullet_${Date.now()}`,
                      pos: { x: playerRef.current.pos.x + playerRef.current.width / 2 - 2, y: playerRef.current.pos.y },
                      vel: { dx: 0, dy: -BULLET_SPEED },
                      width: 4,
                      height: 12,
                      color: COLORS.BULLET_PLAYER,
                      sprite: [],
                      active: true,
                      owner: 'PLAYER'
                  });
                  playSound('shoot');
                  fireCooldownRef.current = cooldownTime; 
              }
              
              // Check Collision with PowerUps
              const pRect = { x: playerRef.current.pos.x, y: playerRef.current.pos.y, w: playerRef.current.width, h: playerRef.current.height };
              powerUpsRef.current.forEach(p => {
                  if (p.active && 
                      p.pos.x < pRect.x + pRect.w && p.pos.x + p.width > pRect.x &&
                      p.pos.y < pRect.y + pRect.h && p.pos.y + p.height > pRect.y) {
                      
                      p.active = false;
                      playSound('powerup');
                      // Activate powerup
                      const newActive = [...activePowerUpsRef.current, {
                          type: p.type,
                          timeLeft: POWERUP_DURATION
                      }];
                      activePowerUpsRef.current = newActive;
                      onActivePowerUpsChange(newActive);
                  }
              });
          }

          // Spawning Logic
          if (spawnQueueRef.current.length > 0) {
              spawnTimerRef.current += dt;
              if (spawnTimerRef.current > 150) {
                  const enemy = spawnQueueRef.current.shift();
                  if (enemy) enemiesRef.current.push(enemy);
                  spawnTimerRef.current = 0;
              }
          }

          // Check if diving is allowed (Formation Complete)
          const isFormationComplete = spawnQueueRef.current.length === 0 && !enemiesRef.current.some(e => e.state === 'ENTERING');

          // Limit simultaneous divers to prevent overwhelming start
          // Level 1: 2. Level 2: 2. Level 3: 3. Level 4: 3. Level 5: 4.
          const maxConcurrentDivers = 2 + Math.floor((levelRef.current - 1) / 2);
          
          // Count distinct divers (using a local variable to be safe inside loop)
          let currentDivers = enemiesRef.current.filter(e => e.state === 'DIVING').length;

          // Process Dive Cooldown (Pauses new dives after a kill)
          if (diveCooldownRef.current > 0) {
              diveCooldownRef.current -= 1 * timeScale;
          }

          // Enemy Logic
          if (respawnStateRef.current === 'NONE') { // Only update enemy logic if not returning/respawning
            enemiesRef.current.forEach(enemy => {
              // Cloaking
              // .25s = 15 frames @ 60fps. 1.0 / 15 = 0.067
              if (enemy.cloakState === 'FADING_OUT') {
                 enemy.opacity -= 0.067 * timeScale; 
                 if (enemy.opacity <= 0) {
                     enemy.opacity = 0;
                     enemy.cloakState = 'INVISIBLE';
                     enemy.cloakTimer = 15; // 0.25s
                 }
              } else if (enemy.cloakState === 'INVISIBLE') {
                 enemy.cloakTimer -= 1 * timeScale;
                 if (enemy.cloakTimer <= 0) {
                     enemy.cloakState = 'FADING_IN';
                     playSound('cloak'); 
                 }
              } else if (enemy.cloakState === 'FADING_IN') {
                  enemy.opacity += 0.067 * timeScale;
                  if (enemy.opacity >= 1) {
                      enemy.opacity = 1;
                      enemy.cloakState = 'NONE';
                  }
              }

              if (enemy.state === 'ENTERING') {
                  if (enemy.entryIndex < enemy.entryPath.length - 1) {
                      enemy.entryIndex += 1 * timeScale;
                      const idx = Math.min(Math.floor(enemy.entryIndex), enemy.entryPath.length - 1);
                      const p = enemy.entryPath[idx];
                      if (p) {
                        enemy.pos.x = p.x - enemy.width / 2;
                        enemy.pos.y = p.y - enemy.height / 2;
                      }
                  } else {
                      enemy.state = 'FORMATION';
                  }
              } else if (enemy.state === 'FORMATION') {
                  // Hover effect uses real time
                  const time = Date.now() / 500;
                  enemy.pos.x = enemy.formationPos.x - enemy.width / 2 + Math.sin(time) * 5;
                  enemy.pos.y = enemy.formationPos.y - enemy.height / 2;

                  if (isFormationComplete) {
                    enemy.diveTimer -= 10 * timeScale; // Decrement 
                    
                    if (enemy.diveTimer <= 0) {
                        // Check if we can add another diver
                        if (currentDivers < maxConcurrentDivers && diveCooldownRef.current <= 0) {
                            enemy.state = 'DIVING';
                            currentDivers++; // Increment local counter immediately to prevent mass dive
                            enemy.diveTimer = 500 + Math.random() * 500;
                            playSound('dive');
                            
                            // Chance to cloak: Start round 3, increase probability
                            if (levelRef.current >= 3 && enemy.cloakState === 'NONE') {
                                // Base chance 0.1, +0.05 per level after 3, max 0.5
                                const cloakChance = Math.min(0.5, 0.1 + (levelRef.current - 3) * 0.05);
                                if (Math.random() < cloakChance) {
                                    enemy.cloakState = 'FADING_OUT';
                                    playSound('cloak');
                                }
                            }

                            // Calculate dive speed based on level - Faster Start
                            // Base ~ 1.2 * PLAYER_SPEED, capping at ~2.5x
                            const baseSpeed = PLAYER_SPEED * (1.2 + Math.min(levelRef.current * 0.15, 1.3));

                            if (playerRef.current) {
                                const angle = Math.atan2(playerRef.current.pos.y - enemy.pos.y, playerRef.current.pos.x - enemy.pos.x);
                                enemy.vel.dx = Math.cos(angle) * baseSpeed;
                                enemy.vel.dy = Math.sin(angle) * baseSpeed;
                            } else {
                                enemy.vel.dy = baseSpeed;
                            }
                        } else {
                             // Reset timer with more variance to distribute drops better
                             enemy.diveTimer = 500 + Math.random() * 1500;
                        }
                    }
                  }
              } else if (enemy.state === 'DIVING') {
                  enemy.pos.x += enemy.vel.dx * timeScale;
                  enemy.pos.y += enemy.vel.dy * timeScale;

                  // Enemy Fire Logic
                  // Increased chance from previous
                  const baseShootChance = levelRef.current === 1 ? 0.003 : 0.006;
                  // Cap firing probability
                  const shootChance = Math.min(0.018, baseShootChance + (levelRef.current * 0.0005));

                  if (Math.random() < shootChance * timeScale) spawnEnemyBullet(enemy);

                  if (enemy.pos.y > CANVAS_HEIGHT + 50) {
                      enemy.entryIndex = 0;
                      enemy.pos.y = -50;
                      enemy.state = 'ENTERING'; // Re-enter
                      enemy.entryPath = createBezierPath(enemy.pos, {x: enemy.formationPos.x, y: enemy.formationPos.y - 100}, enemy.formationPos, 30);
                      enemy.cloakState = 'NONE';
                      enemy.opacity = 1;
                  }
              }
            });
          }

          // Bullet Logic
          bulletsRef.current.forEach(b => {
              b.pos.x += b.vel.dx * timeScale;
              b.pos.y += b.vel.dy * timeScale;
              if (b.pos.y < -20 || b.pos.y > CANVAS_HEIGHT + 20) b.active = false;
          });
          bulletsRef.current = bulletsRef.current.filter(b => b.active);

          // Collision: Player Bullets -> Enemies (and UFO)
          bulletsRef.current.filter(b => b.owner === 'PLAYER').forEach(b => {
              // Check Enemies
              enemiesRef.current.forEach(e => {
                  if (b.active && e.active && e.cloakState !== 'INVISIBLE' &&
                      b.pos.x < e.pos.x + e.width && 
                      b.pos.x + b.width > e.pos.x &&
                      b.pos.y < e.pos.y + e.height && 
                      b.pos.y + b.height > e.pos.y) {
                          
                      b.active = false;
                      e.health--;
                      if (e.health <= 0) {
                          e.active = false;
                          createExplosion(e.pos.x + e.width/2, e.pos.y + e.height/2, e.color, 1.5);
                          scoreRef.current += e.scoreValue;
                          onScoreUpdate(scoreRef.current);
                          
                          // Delete bullets from this enemy
                          bulletsRef.current = bulletsRef.current.filter(bull => bull.ownerId !== e.id);

                          // Try spawning powerup
                          spawnPowerUp(e.pos.x + e.width/2 - 12, e.pos.y + e.height/2);

                          // Set cooldown for next dive to regulate tempo
                          // Start at 60 frames (1s) at level 1, decrease to near 0 at level 20
                          if (e.state === 'DIVING') {
                            diveCooldownRef.current = Math.max(10, 80 - (levelRef.current * 4));
                          }

                      } else {
                          playSound('shield_hit');
                      }
                  }
              });

              // Check UFO
              if (b.active && mysteryShipRef.current && mysteryShipRef.current.active) {
                   const ufo = mysteryShipRef.current;
                   if (b.pos.x < ufo.pos.x + ufo.width && 
                       b.pos.x + b.width > ufo.pos.x && 
                       b.pos.y < ufo.pos.y + ufo.height && 
                       b.pos.y + b.height > ufo.pos.y) {
                           
                       b.active = false;
                       ufo.active = false;
                       mysteryShipRef.current = null;
                       stopUfoSound();
                       createExplosion(ufo.pos.x + ufo.width/2, ufo.pos.y + ufo.height/2, '#ff0000', 3);
                       
                       // Random score 1000 - 3000
                       const bonus = Math.floor(Math.random() * 3 + 1) * 1000;
                       scoreRef.current += bonus;
                       onScoreUpdate(scoreRef.current);
                       playSound('bonus');
                       
                       // Guarantee powerup on UFO kill
                       spawnPowerUp(ufo.pos.x + ufo.width/2 - 12, ufo.pos.y + ufo.height/2);
                   }
              }
          });
          enemiesRef.current = enemiesRef.current.filter(e => e.active);

          // Collision: Enemy Bullets/Body -> Player
          if (playerRef.current && playerRef.current.active) {
              const pRect = { x: playerRef.current.pos.x + 4, y: playerRef.current.pos.y + 4, w: playerRef.current.width - 8, h: playerRef.current.height - 8 };
              
              bulletsRef.current.filter(b => b.owner === 'ENEMY').forEach(b => {
                  if (b.active && 
                      b.pos.x < pRect.x + pRect.w && b.pos.x + b.width > pRect.x &&
                      b.pos.y < pRect.y + pRect.h && b.pos.y + b.height > pRect.y) {
                          
                      b.active = false;
                      handlePlayerHit();
                  }
              });

              enemiesRef.current.forEach(e => {
                   if (e.active && e.cloakState !== 'INVISIBLE' &&
                      e.pos.x < pRect.x + pRect.w && e.pos.x + e.width > pRect.x &&
                      e.pos.y < pRect.y + pRect.h && e.pos.y + e.height > pRect.y) {
                      
                      e.active = false;
                      createExplosion(e.pos.x + e.width/2, e.pos.y + e.height/2, e.color);
                      handlePlayerHit();
                   }
              });
          }

          // Particles
          particlesRef.current.forEach(p => {
              p.x += p.dx * timeScale;
              p.y += p.dy * timeScale;
              p.life -= 0.03 * timeScale; // Slower fade for better explosion visibility
          });
          particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      }

      // --- DRAW ---
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
          ctx.fillStyle = '#050505';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

          // Nebula Drawing
          nebulaeRef.current.forEach(n => {
              const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
              const hue = (n.colorBase + n.colorVar) % 360;
              // Increased visibility (0.5)
              gradient.addColorStop(0, `hsla(${hue}, 60%, 40%, 0.5)`);
              gradient.addColorStop(1, `hsla(${hue}, 60%, 40%, 0)`);
              ctx.fillStyle = gradient;
              ctx.beginPath();
              ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
              ctx.fill();
          });

          // Supernovas (Behind stars) - Reduced Brightness (0.4)
          supernovasRef.current.forEach(s => {
              const gradient = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
              gradient.addColorStop(0, `rgba(255, 255, 255, ${s.life * 0.4})`);
              gradient.addColorStop(0.2, `rgba(255, 200, 100, ${s.life * 0.25})`);
              gradient.addColorStop(1, `rgba(255, 200, 100, 0)`);
              ctx.fillStyle = gradient;
              ctx.beginPath();
              ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
              ctx.fill();
          });

          // Stars
          starsRef.current.forEach(s => {
             const alpha = Math.floor(s.brightness * 255).toString(16).padStart(2,'0');
             ctx.fillStyle = `#ffffff${alpha}`;
             ctx.fillRect(s.x, s.y, s.size, s.size);
          });

          // Player
          if (playerRef.current && playerRef.current.active && (gameState === GameState.PLAYING || gameState === GameState.VICTORY) && respawnStateRef.current === 'NONE') {
             const sprite = spriteCacheRef.current['PLAYER'];
             if (sprite) {
                 ctx.drawImage(sprite, playerRef.current.pos.x, playerRef.current.pos.y);
                 // Draw Shield Visual
                 const shield = activePowerUpsRef.current.find(p => p.type === 'SHIELD');
                 if (shield) {
                     // Flash if low time (< 180 frames = 3s)
                     const shouldDrawShield = shield.timeLeft > 180 || Math.floor(Date.now() / 100) % 2 === 0;

                     if (shouldDrawShield) {
                        ctx.strokeStyle = '#0088ff';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(playerRef.current.pos.x + playerRef.current.width/2, playerRef.current.pos.y + playerRef.current.height/2, playerRef.current.width * 0.8, 0, Math.PI * 2);
                        ctx.stroke();
                     }
                 }
             }
          }

          // UFO
          if (mysteryShipRef.current && mysteryShipRef.current.active) {
              const ufo = mysteryShipRef.current;
              const sprite = spriteCacheRef.current['UFO'];
              if (sprite) ctx.drawImage(sprite, ufo.pos.x, ufo.pos.y);
          }

          // PowerUps
          powerUpsRef.current.forEach(p => {
              if (p.active) {
                  const sprite = spriteCacheRef.current[p.spriteKey || 'POWERUP_RAPID'];
                  if (sprite) ctx.drawImage(sprite, p.pos.x, p.pos.y);
              }
          });

          // Enemies
          enemiesRef.current.forEach(e => {
              if (e.active && e.opacity > 0.1) {
                  const sprite = spriteCacheRef.current[e.spriteKey || 'BEE'];
                  if (sprite) {
                      ctx.save();
                      ctx.globalAlpha = e.opacity;
                      ctx.drawImage(sprite, e.pos.x, e.pos.y);
                      ctx.restore();
                  }
              }
          });

          // Bullets
          bulletsRef.current.forEach(b => {
              if (b.active) {
                  ctx.fillStyle = b.color;
                  ctx.fillRect(b.pos.x, b.pos.y, b.width, b.height);
              }
          });

          // Particles
          particlesRef.current.forEach(p => {
             ctx.fillStyle = p.color;
             ctx.globalAlpha = p.life;
             ctx.fillRect(p.x, p.y, p.size, p.size);
             ctx.globalAlpha = 1.0;
          });

          // UI - STAGE Indicator
          if (gameState === GameState.PLAYING || gameState === GameState.VICTORY) {
              ctx.fillStyle = '#ffffff';
              ctx.font = '10px "Press Start 2P"';
              ctx.textAlign = 'right';
              ctx.fillText(`STAGE ${levelRef.current}`, CANVAS_WIDTH - 20, CANVAS_HEIGHT - 20);
          }
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, onScoreUpdate, onLivesUpdate, onActivePowerUpsChange, setGameState, highScore, resetGame]);

  return (
    <div className="relative">
      <canvas 
        ref={canvasRef} 
        width={CANVAS_WIDTH} 
        height={CANVAS_HEIGHT}
        className="block bg-black border-4 border-neutral-800 rounded-sm shadow-2xl"
        style={{ 
            width: '100%', 
            height: 'auto', 
            maxWidth: '100%',
            imageRendering: 'pixelated'
        }}
      />
      
      {/* UI Overlays */}
      {gameState === GameState.START && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white flex-col font-['Press_Start_2P'] z-20 cursor-pointer" onClick={() => {
              setGameState(GameState.PLAYING);
              resetGame();
          }}>
             <div className="animate-pulse text-center">
                <p className="text-yellow-400 mb-6 text-xl">READY?</p>
                <p className="text-xs text-white mb-2">PRESS START / ENTER</p>
                <p className="text-[10px] text-gray-400">TAP SCREEN</p>
             </div>
          </div>
      )}

      {/* Respawn Ready Message */}
      {respawnStateRef.current === 'WAITING' && gameState === GameState.PLAYING && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
             <div className="animate-pulse text-center font-['Press_Start_2P']">
                <p className="text-yellow-400 text-xl">READY?</p>
             </div>
          </div>
      )}

      {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white flex-col font-['Press_Start_2P'] z-20 cursor-pointer" onClick={() => {
                 setGameState(GameState.PLAYING);
                 resetGame();
             }}>
             <p className="text-red-600 mb-4 text-2xl drop-shadow-md">GAME OVER</p>
             <p className="text-sm mb-8">FINAL SCORE: {scoreRef.current}</p>
             <div className="animate-pulse text-xs text-yellow-200">
                 TRY AGAIN?
             </div>
          </div>
      )}

      {gameState === GameState.VICTORY && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white flex-col font-['Press_Start_2P'] z-20">
             <p className="text-cyan-400 mb-4 text-xl drop-shadow-md animate-bounce">STAGE CLEAR</p>
             <p className="text-[10px] text-white">WARP TO SECTOR {levelRef.current}</p>
          </div>
      )}
    </div>
  );
};

export default GameCanvas;