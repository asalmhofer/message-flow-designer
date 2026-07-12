import { MOVE_DURATIONS } from '../config/constants.js';
export function durationForSpeed(speed){ return MOVE_DURATIONS[speed] || MOVE_DURATIONS.normal; }
export function nextPhase(phase){
  if(phase === 'transfer') return 'arrived';
  if(phase === 'arrived') return 'processing';
  return 'transfer';
}
