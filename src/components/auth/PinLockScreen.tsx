import React, { useState, useEffect, useCallback } from 'react';
import { Lock, ShieldCheck, AlertCircle, Delete, KeyRound, Loader2 } from 'lucide-react';
import { getAppPinFirestore } from '../../services/firestoreService';

interface PinLockScreenProps {
  onUnlock: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({ onUnlock }) => {
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [expectedPin, setExpectedPin] = useState<string>('1234');

  // Load the current PIN from Firestore on mount
  useEffect(() => {
    let isMounted = true;
    async function loadPin() {
      try {
        const cloudPin = await getAppPinFirestore();
        if (isMounted && cloudPin) {
          setExpectedPin(cloudPin);
        }
      } catch (err) {
        console.warn('Error loading PIN from Firestore, using fallback:', err);
      }
    }
    loadPin();
    return () => {
      isMounted = false;
    };
  }, []);

  const triggerError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setIsShaking(true);
    setTimeout(() => {
      setIsShaking(false);
      setPin('');
    }, 600);
  }, []);

  const handleVerifyPin = useCallback(async (candidatePin: string) => {
    if (candidatePin.length !== 4) return;
    setIsVerifying(true);
    setErrorMsg(null);

    try {
      // Re-fetch latest PIN from Firestore to ensure no stale cached mismatch
      let targetPin = expectedPin;
      try {
        const latestPin = await getAppPinFirestore();
        if (latestPin) {
          targetPin = latestPin;
          setExpectedPin(latestPin);
        }
      } catch {
        // Fall back to expectedPin in memory
      }

      if (candidatePin === targetPin) {
        // Unlock and persist in session storage
        try {
          sessionStorage.setItem('mgs_portal_authenticated', 'true');
        } catch (e) {
          console.warn('Could not write to sessionStorage:', e);
        }
        onUnlock();
      } else {
        triggerError('Incorrect PIN. Please try again.');
      }
    } finally {
      setIsVerifying(false);
    }
  }, [expectedPin, onUnlock, triggerError]);

  const handleKeyPress = useCallback((digit: string) => {
    if (isVerifying) return;
    setErrorMsg(null);
    setPin((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + digit;
      if (next.length === 4) {
        // Automatically verify upon entering 4th digit
        setTimeout(() => handleVerifyPin(next), 50);
      }
      return next;
    });
  }, [handleVerifyPin, isVerifying]);

  const handleBackspace = useCallback(() => {
    if (isVerifying) return;
    setErrorMsg(null);
    setPin((prev) => prev.slice(0, -1));
  }, [isVerifying]);

  const handleClear = useCallback(() => {
    if (isVerifying) return;
    setErrorMsg(null);
    setPin('');
  }, [isVerifying]);

  // Handle physical keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length === 4) {
          handleVerifyPin(pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBackspace, handleClear, handleKeyPress, handleVerifyPin, pin]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#0f172a',
      backgroundImage: 'radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 75%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '20px',
      boxSizing: 'border-box',
      userSelect: 'none',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <style>{`
        @keyframes pinShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-10px); }
          40%, 80% { transform: translateX(10px); }
        }
        .pin-shake-anim {
          animation: pinShake 0.4s ease-in-out;
        }
        .pin-key-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #f8fafc;
          border-radius: 14px;
          font-size: 24px;
          font-weight: 600;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
          touch-action: manipulation;
        }
        .pin-key-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(255, 255, 255, 0.25);
          transform: translateY(-1px);
        }
        .pin-key-btn:active:not(:disabled) {
          background: rgba(37, 99, 235, 0.4);
          transform: scale(0.96);
        }
        .pin-key-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .pin-dot {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid #64748b;
          transition: all 0.2s ease;
          background: transparent;
        }
        .pin-dot.filled {
          background: #38bdf8;
          border-color: #38bdf8;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.6);
          transform: scale(1.1);
        }
        .pin-dot.error {
          background: #ef4444;
          border-color: #ef4444;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.6);
        }
      `}</style>

      <div style={{
        background: 'rgba(30, 41, 59, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '24px',
        padding: '36px 32px',
        width: '100%',
        maxWidth: '380px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}>
        {/* Brand Header */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '18px',
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
          boxShadow: '0 10px 20px -5px rgba(37, 99, 235, 0.5)',
        }}>
          <Lock size={32} color="#ffffff" strokeWidth={2.2} />
        </div>

        <h1 style={{
          fontSize: '20px',
          fontWeight: 700,
          color: '#f8fafc',
          margin: '0 0 4px 0',
          letterSpacing: '-0.3px',
        }}>
          Manshi Group Of Services
        </h1>
        <div style={{
          fontSize: '13px',
          color: '#94a3b8',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <ShieldCheck size={14} color="#38bdf8" />
          <span>Invoice Management Portal</span>
        </div>

        {/* Instructions */}
        <div style={{
          fontSize: '13.5px',
          fontWeight: 500,
          color: '#cbd5e1',
          marginBottom: '20px',
        }}>
          Enter 4-Digit Security PIN
        </div>

        {/* 4-Dot Indicators */}
        <div
          className={isShaking ? 'pin-shake-anim' : ''}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            marginBottom: '20px',
            minHeight: '28px',
          }}
        >
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            const hasError = !!errorMsg;
            return (
              <div
                key={index}
                className={`pin-dot ${isFilled ? 'filled' : ''} ${hasError ? 'error' : ''}`}
              />
            );
          })}
        </div>

        {/* Error / Status Message */}
        <div style={{
          minHeight: '24px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          fontSize: '13px',
          color: errorMsg ? '#f87171' : '#94a3b8',
          fontWeight: errorMsg ? 600 : 400,
        }}>
          {isVerifying ? (
            <>
              <Loader2 size={14} className="spin-icon" color="#38bdf8" />
              <span>Verifying PIN...</span>
            </>
          ) : errorMsg ? (
            <>
              <AlertCircle size={15} color="#f87171" />
              <span>{errorMsg}</span>
            </>
          ) : (
            <span style={{ color: '#64748b', fontSize: '12px' }}>
              Enter PIN
            </span>
          )}
        </div>

        {/* Numeric Keypad */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          width: '100%',
        }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              className="pin-key-btn"
              onClick={() => handleKeyPress(digit)}
              disabled={isVerifying}
            >
              {digit}
            </button>
          ))}

          {/* Bottom row: Clear, 0, Backspace */}
          <button
            type="button"
            className="pin-key-btn"
            style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}
            onClick={handleClear}
            disabled={isVerifying || pin.length === 0}
            title="Clear"
          >
            Clear
          </button>

          <button
            type="button"
            className="pin-key-btn"
            onClick={() => handleKeyPress('0')}
            disabled={isVerifying}
          >
            0
          </button>

          <button
            type="button"
            className="pin-key-btn"
            onClick={handleBackspace}
            disabled={isVerifying || pin.length === 0}
            title="Backspace"
            style={{ color: '#94a3b8' }}
          >
            <Delete size={22} />
          </button>
        </div>

        {/* Footer info */}
        <div style={{
          marginTop: '24px',
          fontSize: '11.5px',
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
        }}>
          <KeyRound size={12} />
          <span>Session access locks when tab is closed</span>
        </div>
      </div>
    </div>
  );
};

