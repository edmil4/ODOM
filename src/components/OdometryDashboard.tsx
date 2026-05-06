import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  ScatterController,
  CategoryScale,
  Title,
} from 'chart.js';
import { Scatter, Line } from 'react-chartjs-2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Navigation2, Ruler, RotateCcw, Zap, History, Gauge } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  ScatterController,
  CategoryScale,
  Title
);

interface Point {
  x: number;
  y: number;
}

interface WheelData {
  ticks: number;
  distance_mm: number;
}

interface TickHistoryEntry {
  time: string;
  left: number;
  right: number;
}

interface OdometryState {
  posX: number;
  posY: number;
  theta: number;
  left: WheelData;
  right: WheelData;
  trail: Point[];
  linearVelocity: number;
  angularVelocity: number;
  tickHistory: TickHistoryEntry[];
}

const L = 300; // Ancho de vía (Track width)
const MAX_TRAIL = 1000;
const ARROW_LEN = 40;
const MAX_TICK_HISTORY = 50;
const DT = 0.05;

export default function OdometryDashboard() {
  const [state, setState] = useState<OdometryState>({
    posX: 0,
    posY: 0,
    theta: 0,
    left: { ticks: 0, distance_mm: 0 },
    right: { ticks: 0, distance_mm: 0 },
    trail: [{ x: 0, y: 0 }],
    linearVelocity: 0,
    angularVelocity: 0,
    tickHistory: []
  });

  const isInitialized = useRef(false);
  const prevDistRef = useRef({ left: 0, right: 0 });
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Plugin del Robot (Triángulo Naranja Rotatorio)
  const arrowPlugin = useMemo(() => ({
    id: 'arrowPlugin',
    afterDraw(chart: any) {
      const { ctx, scales: { x, y } } = chart;
      const { posX, posY, theta } = stateRef.current;
      
      const cx = x.getPixelForValue(posX);
      const cy = y.getPixelForValue(posY);
      
      ctx.save();
      ctx.translate(cx, cy);
      // Math convention: theta is CCW. Canvas rotate is CW.
      // rotate(-theta) aligns them.
      ctx.rotate(-theta); 
      
      // Dibujar solo el "cabezal" (triángulo) 
      ctx.beginPath();
      const h = 22; // altura
      const w = 18; // ancho
      
      // Apunta a la derecha por defecto
      ctx.moveTo(h/2, 0);
      ctx.lineTo(-h/2, -w/2);
      ctx.lineTo(-h/2, w/2);
      ctx.closePath();
      
      ctx.fillStyle = '#EF9F27';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#EF9F27';
      ctx.fill();
      
      ctx.restore();
    }
  }), []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/ticks');
        const data = await res.json();
        
        if (!isInitialized.current) {
          prevDistRef.current = {
            left: data.left.distance_mm,
            right: data.right.distance_mm
          };
          isInitialized.current = true;
          return;
        }

        const dL = data.left.distance_mm - prevDistRef.current.left;
        const dR = data.right.distance_mm - prevDistRef.current.right;
        
        prevDistRef.current = {
          left: data.left.distance_mm,
          right: data.right.distance_mm
        };

        const dCenter = (dL + dR) / 2;
        const dTheta = (dR - dL) / L;

        // Velocidades
        const v = dCenter / DT;
        const w = dTheta / DT;

        setState(prev => {
          const newTheta = prev.theta + dTheta;
          const newX = prev.posX + dCenter * Math.cos(prev.theta);
          const newY = prev.posY + dCenter * Math.sin(prev.theta);
          
          const newPoint = { x: newX, y: newY };
          const lastPoint = prev.trail[prev.trail.length - 1];
          
          // Mayor sensibilidad para capturar la trayectoria incluso en movimientos pequeños
          const moved = !lastPoint || Math.sqrt(Math.pow(newX - lastPoint.x, 2) + Math.pow(newY - lastPoint.y, 2)) > 0.2;
          const nextTrail = moved ? [...prev.trail, newPoint] : prev.trail;

          const now = new Date();
          const timeStr = `${now.getSeconds()}.${now.getMilliseconds().toString().padStart(3, '0')}`;
          
          const newTickEntry = {
            time: timeStr,
            left: data.left.ticks,
            right: data.right.ticks
          };

          return {
            posX: newX,
            posY: newY,
            theta: newTheta,
            left: data.left,
            right: data.right,
            trail: nextTrail.slice(-MAX_TRAIL),
            linearVelocity: v,
            angularVelocity: w,
            tickHistory: [...prev.tickHistory, newTickEntry].slice(-MAX_TICK_HISTORY)
          };
        });
      } catch (err) {
        console.error("Error fetching ticks:", err);
      }
    };

    const interval = setInterval(fetchData, 50);
    return () => clearInterval(interval);
  }, []);

  const resetPose = () => {
    setState(prev => ({
      ...prev,
      posX: 0,
      posY: 0,
      theta: 0,
      trail: [{ x: 0, y: 0 }],
      linearVelocity: 0,
      angularVelocity: 0,
      tickHistory: []
    }));
    isInitialized.current = false;
    prevDistRef.current = { left: 0, right: 0 };
  };

  const clearPath = () => {
    setState(prev => ({
      ...prev,
      trail: [{ x: prev.posX, y: prev.posY }]
    }));
  };

  const chartData = {
    datasets: [
      {
        label: 'Trayectoria',
        data: state.trail,
        borderColor: '#00ff99',
        borderWidth: 4, 
        showLine: true,
        pointRadius: 0,
        fill: false,
        tension: 0.1, 
      },
      {
        label: 'Robot',
        data: [{ x: state.posX, y: state.posY }],
        pointRadius: 0, 
      }
    ],
  };

  const tickChartData = {
    labels: state.tickHistory.map(h => h.time),
    datasets: [
      {
        label: 'ticks L',
        data: state.tickHistory.map(h => h.left),
        borderColor: '#00bfff',
        backgroundColor: '#00bfff',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
      },
      {
        label: 'ticks R',
        data: state.tickHistory.map(h => h.right),
        borderColor: '#ff4444',
        backgroundColor: '#ff4444',
        borderWidth: 2,
        pointRadius: 0,
        borderDash: [5, 5],
        tension: 0.4,
      }
    ]
  };

  const tickChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: { 
        position: 'top' as const,
        align: 'end' as const,
        labels: { color: '#666', boxWidth: 10, font: { size: 10, family: 'JetBrains Mono' } }
      },
      title: { 
        display: true, 
        text: 'TICKS EN TIEMPO REAL', 
        color: '#555', 
        align: 'start' as const,
        font: { size: 10, weight: 'bold' } 
      }
    },
    scales: {
      x: { display: false },
      y: { 
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#444', font: { size: 9, family: 'JetBrains Mono' } }
      }
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    aspectRatio: 1, // Mantener proporciones cuadradas
    scales: {
      x: {
        title: { display: true, text: 'X (mm)', color: '#666' },
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#666', font: { family: 'JetBrains Mono' } },
        min: -50,
        suggestedMax: 800,
        beginAtZero: true,
      },
      y: {
        title: { display: true, text: 'Y (mm)', color: '#666' },
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#666', font: { family: 'JetBrains Mono' } },
        min: -50,
        suggestedMax: 800,
        beginAtZero: true,
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-slate-300 font-mono p-8 flex flex-col gap-6 selection:bg-[#00ff99]/30">
      {/* Header Section */}
      <header className="flex justify-between items-end border-b border-[#222] pb-4 shrink-0">
        <div>
          <h1 className="text-[#00ff99] text-2xl font-bold tracking-[0.3em] uppercase">Wheels — Odometry Monitor</h1>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest italic">// Real-time kinematic tracking system v2.4.0</p>
        </div>
        <div className="hidden md:flex gap-6 text-[10px] items-center mb-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00ff99] shadow-[0_0_8px_#00ff99]"></span>
            <span className="opacity-60 uppercase tracking-tighter">Connection: Stable</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-40 uppercase">Latency:</span>
            <span className="text-[#00bfff]">14ms</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-40 uppercase">Battery:</span>
            <span className="text-slate-200">88%</span>
          </div>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
        {/* Velocidad Card */}
        <div className="bg-[#151619] border-l-4 border-yellow-500 p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-4 right-4 opacity-20">
            <Gauge className="w-12 h-12 text-yellow-500" />
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">SENSORS / VELOCIDAD</div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-baseline">
              <span className="text-xs opacity-50 uppercase">lineal (v)</span>
              <span className="text-xl text-yellow-500 font-bold">
                {state.linearVelocity.toFixed(2)} <span className="text-xs font-normal">mm/s</span>
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs opacity-50 uppercase">angular (ω)</span>
              <span className="text-xl text-yellow-500 font-bold">
                {state.angularVelocity.toFixed(4)} <span className="text-xs font-normal">rad/s</span>
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs opacity-50 uppercase">dt</span>
              <span className="text-sm text-slate-400">{(DT * 1000).toFixed(0)} ms</span>
            </div>
          </div>
        </div>

        {/* Left Wheel */}
        <div className="bg-[#151619] border-l-4 border-[#00bfff] p-5 shadow-xl">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Motor_A / Left_Wheel</div>
          <div className="flex flex-col gap-3">
            <MetricItem label="Ticks" value={state.left.ticks.toLocaleString()} color="text-[#00bfff]" bold />
            <MetricItem label="Distance" value={state.left.distance_mm.toFixed(2)} suffix="mm" color="text-[#00bfff]" />
            <MetricItem label="Revolutions" value={(state.left.ticks / 1450).toFixed(3)} />
          </div>
        </div>

        {/* Right Wheel */}
        <div className="bg-[#151619] border-l-4 border-[#ff9900] p-5 shadow-xl">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Motor_B / Right_Wheel</div>
          <div className="flex flex-col gap-3">
            <MetricItem label="Ticks" value={state.right.ticks.toLocaleString()} color="text-[#ff9900]" bold />
            <MetricItem label="Distance" value={state.right.distance_mm.toFixed(2)} suffix="mm" color="text-[#ff9900]" />
            <MetricItem label="Revolutions" value={(state.right.ticks / 1450).toFixed(3)} />
          </div>
        </div>

        {/* Centroid / Pose */}
        <div className="bg-[#151619] border-l-4 border-[#00ff99] p-5 shadow-xl">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Localization / Pose</div>
          <div className="flex flex-col gap-3">
            <MetricItem label="X-Coord" value={state.posX.toFixed(2)} suffix="mm" color="text-[#00ff99]" bold />
            <MetricItem label="Y-Coord" value={state.posY.toFixed(2)} suffix="mm" color="text-[#00ff99]" bold />
            <MetricItem label="Heading (θ)" value={state.theta.toFixed(4)} suffix="rad" color="text-[#EF9F27]" />
          </div>
        </div>
      </div>

      {/* Main Visualization Area */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-6 min-h-0">
        {/* Map Plot */}
        <div 
          className="lg:col-span-8 bg-[#0c0c0e] border border-[#222] relative overflow-hidden flex items-center justify-center p-4"
          style={{ backgroundImage: 'radial-gradient(#222 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        >
          <div className="absolute top-4 left-4 text-[10px] uppercase opacity-40 z-10">Cartesian Plane / trajectory_map.vcl</div>
          
          <div className="w-full h-full min-h-[300px]">
            <Scatter 
              data={chartData} 
              options={chartOptions as any} 
              plugins={[arrowPlugin as any]}
            />
          </div>

          <div className="absolute bottom-2 right-4 text-[9px] text-slate-600">SCALE: 1:10 (mm)</div>
        </div>

        {/* Side panel: Ticks chart & Logs */}
        <div className="lg:col-span-4 flex flex-col gap-6 min-h-0">
          {/* Ticks Real-time Chart */}
          <div className="bg-[#151619] border border-[#222] p-4 h-[180px] shrink-0">
            <Line data={tickChartData} options={tickChartOptions as any} />
          </div>

          {/* System Logs */}
          <div className="bg-[#151619] flex-1 p-4 border border-[#222] flex flex-col overflow-hidden">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-4 flex items-center justify-between">
              <span>Odometry_Logs</span>
              <History className="w-3 h-3 opacity-30" />
            </div>
            <div className="text-[11px] space-y-2 flex-1 overflow-y-auto font-mono custom-scrollbar">
              <LogEntry time={new Date().toLocaleTimeString()} type="blue" msg="BOOT_SEQUENCE_COMPLETE" />
              <LogEntry time={new Date().toLocaleTimeString()} type="slate" msg="PID_CONTROLLER_ENGAGED" />
              <LogEntry time={new Date().toLocaleTimeString()} type="green" msg="STREAMING_DATA: OK" />
              <LogEntry time={new Date().toLocaleTimeString()} type="slate" msg={`POS_UPDATE: (${state.posX.toFixed(1)}, ${state.posY.toFixed(1)})`} />
              <div className="animate-pulse text-[#00ff99]">_</div>
            </div>
          </div>
          
          {/* Controls */}
          <div className="grid grid-cols-2 gap-4 shrink-0">
            <button 
              onClick={resetPose}
              className="border border-[#222] bg-[#1a1b1e] text-[10px] py-3 uppercase hover:bg-[#222] hover:text-[#00ff99] transition-colors tracking-widest flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-3 h-3" /> Reset Pose
            </button>
            <button 
              onClick={clearPath}
              className="border border-[#222] bg-[#1a1b1e] text-[10px] py-3 uppercase hover:bg-[#222] hover:text-[#ff4444] transition-colors tracking-widest flex items-center justify-center gap-2"
            >
              <Zap className="w-3 h-3" /> Clear Path
            </button>
          </div>
        </div>
      </div>

      {/* Footer Decorative */}
      <footer className="flex justify-between items-center text-[9px] text-slate-600 uppercase tracking-[0.2em] pt-2 border-t border-[#1a1a1e] shrink-0">
        <span>System Status: Operational</span>
        <span className="hidden sm:inline">Base Link: (0,0,0)</span>
        <span>Firmware: WHEELS_X_CORE_71</span>
      </footer>
    </div>
  );
}

function MetricItem({ label, value, suffix, color = "text-slate-200", bold = false }: { label: string, value: string | number, suffix?: string, color?: string, bold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-xs opacity-50 uppercase">{label}</span>
      <span className={`text-xl ${color} ${bold ? 'font-bold' : ''}`}>
        {value} {suffix && <span className="text-xs font-normal opacity-70 ml-1">{suffix}</span>}
      </span>
    </div>
  );
}

function LogEntry({ time, type, msg }: { time: string, type: 'blue' | 'green' | 'slate', msg: string }) {
  const colors = {
    blue: 'text-blue-400',
    green: 'text-green-500',
    slate: 'text-slate-500'
  };
  return (
    <div className={colors[type]}>
      [{time}] <span className={type === 'blue' ? 'text-white' : ''}>{msg}</span>
    </div>
  );
}
