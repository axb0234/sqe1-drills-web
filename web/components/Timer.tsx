'use client';
import { useEffect, useRef, useState } from 'react';

export default function Timer({ running, onTick }:{ running:boolean; onTick?:(ms:number)=>void }) {
  const [ms, setMs] = useState(0);
  const ref = useRef<number|undefined>(undefined);

  useEffect(() => {
    if (running) {
      const t0 = performance.now() - ms;
      ref.current = window.setInterval(() => {
        const val = Math.floor(performance.now() - t0);
        setMs(val);
        onTick?.(val);
      }, 200) as unknown as number;
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);

  const sec = Math.floor(ms/1000);
  const color = sec <= 60 ? 'text-success' : sec <= 100 ? 'text-warning' : 'text-danger';

  return (
    <div className={`position-fixed bottom-0 end-0 m-3 badge bg-light border ${color}`} style={{fontSize:'1rem'}}>
      {sec}s
    </div>
  );
}
