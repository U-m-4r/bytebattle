import { useEffect, useRef, useState } from 'react';

/**
 * Compute the correct display value from msRemaining so the initial render
 * shows the right digit without waiting for the first interval tick.
 * This prevents a late-joining client from briefly flashing '3' when only
 * 1-2 seconds remain.
 */
function computeDisplay(msRemaining) {
  if (msRemaining <= 0) return 'GO!';
  if (msRemaining <= 1000) return 'GO!';
  if (msRemaining <= 2000) return '1';
  if (msRemaining <= 3000) return '2';
  return '3';
}

/**
 * Full-screen countdown overlay derived from a server-authoritative startsAt timestamp.
 * Props:
 *   startsAt   — ISO date string from the server
 *   onComplete — callback fired when the countdown reaches zero
 */
export default function CountdownOverlay({ startsAt, onComplete }) {
  // Initialize lazily so a reconnecting client shows the correct digit immediately
  const [display, setDisplay] = useState(() => computeDisplay(new Date(startsAt) - Date.now()));

  // Hold onComplete in a ref so the interval effect never needs to restart when
  // the parent re-renders and passes a new inline arrow function reference.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const interval = setInterval(() => {
      const msRemaining = new Date(startsAt) - Date.now();
      if (msRemaining <= 0) {
        setDisplay('GO!');
        clearInterval(interval);
        onCompleteRef.current();
        return;
      }
      setDisplay(computeDisplay(msRemaining));
    }, 100);
    return () => clearInterval(interval);
  }, [startsAt]); // stable: only restarts when the server-issued startsAt changes

  return (
    <div className="fixed inset-0 z-50 bg-void/95 flex flex-col items-center justify-center">
      <span
        className={`text-[160px] leading-none font-black select-none ${
          display === 'GO!' ? 'text-lime' : 'text-tx-primary'
        }`}
      >
        {display}
      </span>
      {display !== 'GO!' && (
        <p className="text-xs text-tx-muted tracking-widest mt-6 uppercase">Get ready</p>
      )}
    </div>
  );
}
