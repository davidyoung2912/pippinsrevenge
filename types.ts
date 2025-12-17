
export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY',
  PAUSED = 'PAUSED'
}

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  dx: number;
  dy: number;
}

export interface Entity {
  id: string;
  pos: Position;
  vel: Velocity;
  width: number;
  height: number;
  color: string;
  palette?: string[]; // Array of colors for multi-colored sprites (index 0 is unused/transparent mapping for sprite val 1)
  sprite: number[][]; // 0 for empty, 1,2,3 for palette index
  spriteKey?: string; // Key for cached sprite lookups
  active: boolean;
  // UFO specific optional fields
  behaviorState?: 'NORMAL' | 'PAUSED' | 'FAST';
  behaviorTimer?: number;
}

export interface Enemy extends Entity {
  type: 'BEE' | 'BUTTERFLY' | 'BOSS' | 'GALAXIAN' | 'SCORPION' | 'BOSCONIAN' | 'DRAGONFLY' | 'COMMANDER' | 'ZAKO' | 'GOEI' | 'TOROID';
  scoreValue: number;
  health: number;
  maxHealth: number;
  state: 'ENTERING' | 'FORMATION' | 'DIVING';
  formationPos: Position; // Where it sits in the grid
  
  // Pathing for Entry
  entryPath: Position[];
  entryIndex: number;
  
  divepath: Position[] | null;
  diveIndex: number;
  diveTimer: number; 
  diveType?: 'WIDE_SINE' | 'SWOOP' | 'DIRECT' | 'CIRCLE_DIVE' | 'SPIRAL' | 'FIGURE_EIGHT' | 'BUNGEE' | 'CIRCLE_BACK';
  diveStartX?: number;
  diveStartY?: number;
  diveTargetX?: number;
  diveDirection?: number; // 1 or -1 for arc direction
  divePhase?: number;
  diveAngle?: number;

  // Cloaking
  cloakState: 'NONE' | 'FADING_OUT' | 'INVISIBLE' | 'FADING_IN';
  cloakTimer: number;
  opacity: number;
}

export interface Bullet extends Entity {
  owner: 'PLAYER' | 'ENEMY';
  ownerId?: string; // ID of the entity that fired this bullet
  isLaser?: boolean;
}

export interface Barrier extends Entity {
  timeLeft: number;
  maxTime: number;
}

export interface Particle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number;
  color: string;
  size: number;
}

export interface Supernova {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  size: number;
}

export interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
  brightness: number;
}

export type PowerUpType = 'RAPID_FIRE' | 'SHIELD';

export interface PowerUp extends Entity {
  type: PowerUpType;
}

export interface ActivePowerUp {
  type: PowerUpType;
  timeLeft: number;
}
