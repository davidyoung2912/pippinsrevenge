import { useEffect, useRef } from 'react';

interface InputState {
  left: boolean;
  right: boolean;
  fire: boolean;
  start: boolean;
  quit: boolean;
}

export const useInput = () => {
  const inputRef = useRef<InputState>({
    left: false,
    right: false,
    fire: false,
    start: false,
    quit: false,
  });

  const keysPressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.code);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const pollInput = (): InputState => {
    const state: InputState = {
      left: false,
      right: false,
      fire: false,
      start: false,
      quit: false,
    };

    // Keyboard
    if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('KeyA')) state.left = true;
    if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('KeyD')) state.right = true;
    if (keysPressed.current.has('Space') || keysPressed.current.has('KeyZ')) state.fire = true;
    if (keysPressed.current.has('Enter')) state.start = true;
    if (keysPressed.current.has('Escape')) state.quit = true;

    // Gamepad
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0]; // Assume first controller

    if (gp) {
      // Axes (Analog stick)
      // Deadzone check usually around 0.1 - 0.2
      if (gp.axes[0] < -0.2) state.left = true;
      if (gp.axes[0] > 0.2) state.right = true;
      
      // D-Pad (often mapped to axes 9/10 or buttons 12-15)
      if (gp.buttons[14]?.pressed) state.left = true;
      if (gp.buttons[15]?.pressed) state.right = true;

      // Buttons
      if (gp.buttons[0]?.pressed) state.fire = true; // A button (Xbox) / X (PS)
      if (gp.buttons[2]?.pressed) state.fire = true; // X button (Xbox) / Square (PS)
      if (gp.buttons[9]?.pressed) state.start = true; // Start button
      if (gp.buttons[1]?.pressed) state.quit = true; // B button (Xbox) / Circle (PS)
    }

    inputRef.current = state;
    return state;
  };

  return { pollInput };
};