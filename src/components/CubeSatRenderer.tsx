import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Box, PerspectiveCamera, OrbitControls, Environment, Grid } from "@react-three/drei";
import * as THREE from "three";
import { IMUData } from "../types";

interface CubeSatProps {
  rotation: [number, number, number];
}

export function CubeSat({ rotation }: CubeSatProps) {
  const meshRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (meshRef.current) {
      // Smooth dynamic linear interpolation (lerp) for physics-aligned rotation
      meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, rotation[0], 0.1);
      meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, rotation[1], 0.1);
      meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, rotation[2], 0.1);
    }
  });

  const frameColor = "#71717a"; // Zinc-500 silver-grey housing
  const internalColor = "#f97316"; // Board orange accents

  return (
    <group ref={meshRef}>
      {/* FRAME STRUCTURE */}
      {/* Side Rails */}
      {[ [-2, -2], [2, -2], [-2, 2], [2, 2] ].map(([x, z], i) => (
        <Box key={i} args={[0.3, 4, 0.3]} position={[x, 0, z]}>
          <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.4} />
        </Box>
      ))}

      {/* TOP & BOTTOM FRAME PLATES WITH X-PATTERN */}
      <SidePlate position={[0, 2, 0]} rotation={[Math.PI / 2, 0, 0]} color={frameColor} />
      <SidePlate position={[0, -2, 0]} rotation={[Math.PI / 2, 0, 0]} color={frameColor} />
      
      {/* OUTER HOUSING SIDE PANELS */}
      <SidePlate position={[2, 0, 0]} rotation={[0, Math.PI / 2, 0]} color={frameColor} />
      <SidePlate position={[-2, 0, 0]} rotation={[0, Math.PI / 2, 0]} color={frameColor} />
      <SidePlate position={[0, 0, 2]} rotation={[0, 0, 0]} color={frameColor} />
      <SidePlate position={[0, 0, -2]} rotation={[0, 0, 0]} color={frameColor} />

      {/* INTERNAL HARDWARE BUS */}
      {/* Flight Controller PCB Board */}
      <Box args={[3.6, 0.1, 3.6]} position={[0, -0.8, 0]}>
        <meshStandardMaterial color={internalColor} roughness={0.5} />
      </Box>

      {/* ESP32 Processing Hub */}
      <group position={[0.2, -0.6, 0.2]}>
        <Box args={[1.2, 0.3, 1.8]}>
          <meshStandardMaterial color="#222" roughness={0.7} />
        </Box>
        <Box args={[0.8, 0.1, 0.8]} position={[0, 0.15, -0.3]}>
          <meshStandardMaterial color="#999" metalness={1} roughness={0.2} />
        </Box>
      </group>

      {/* Circuit / Wiring Approximations */}
      <Box args={[0.1, 1, 0.1]} position={[-0.5, -0.2, -0.5]} rotation={[0.4, 0.2, 0.8]}>
        <meshStandardMaterial color="#ef4444" roughness={0.5} />
      </Box>
      <Box args={[0.1, 0.8, 0.1]} position={[0.5, -0.3, 0.8]} rotation={[-0.2, 0.5, 0.1]}>
        <meshStandardMaterial color="#3b82f6" roughness={0.5} />
      </Box>

      {/* PHYSICAL TOGGLE SWITCH */}
      <group position={[0, -0.7, 1.95]}>
        <mesh>
          <boxGeometry args={[0.3, 0.3, 0.2]} />
          <meshStandardMaterial color="#333" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 6, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.4]} />
          <meshStandardMaterial color="#aaa" metalness={1} roughness={0.1} />
        </mesh>
      </group>

      {/* ACTIVE TELEMETRY INDICATOR (Glowing Red LED) */}
      <mesh position={[-1, -0.6, -1]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={3} toneMapped={false} />
      </mesh>
    </group>
  );
}

function SidePlate({ position, rotation, color }: { position: [number, number, number]; rotation: [number, number, number]; color: string }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Rim structure */}
      <Box args={[4, 0.2, 0.2]} position={[0, 1.9, 0]}><meshStandardMaterial color={color} metalness={0.6} roughness={0.4} /></Box>
      <Box args={[4, 0.2, 0.2]} position={[0, -1.9, 0]}><meshStandardMaterial color={color} metalness={0.6} roughness={0.4} /></Box>
      <Box args={[0.2, 4, 0.2]} position={[1.9, 0, 0]}><meshStandardMaterial color={color} metalness={0.6} roughness={0.4} /></Box>
      <Box args={[0.2, 4, 0.2]} position={[-1.9, 0, 0]}><meshStandardMaterial color={color} metalness={0.6} roughness={0.4} /></Box>
      
      {/* Structural X patterns */}
      <Box args={[5.2, 0.3, 0.15]} rotation={[0, 0, Math.PI / 4]}><meshStandardMaterial color={color} metalness={0.6} roughness={0.4} /></Box>
      <Box args={[5.2, 0.3, 0.15]} rotation={[0, 0, -Math.PI / 4]}><meshStandardMaterial color={color} metalness={0.6} roughness={0.4} /></Box>
    </group>
  );
}

export function SpaceScene({ rotation }: CubeSatProps) {
  return (
    <div style={{ width: "100%", height: "100%", background: "transparent", overflow: "hidden" }}>
      <Canvas shadows gl={{ antialias: true }}>
        <PerspectiveCamera makeDefault position={[6, 6, 6]} fov={45} />
        <OrbitControls enableZoom={true} enablePan={false} minDistance={3.5} maxDistance={15} />
        
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={1.5} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.8} color="#22d3ee" />
        <pointLight position={[5, -5, 5]} intensity={0.4} color="#f97316" />
        
        <CubeSat rotation={rotation} />
        <Environment preset="studio" />
        
        <Grid 
          infiniteGrid 
          fadeDistance={25} 
          sectionColor="rgba(34, 211, 238, 0.15)"
          cellColor="rgba(255, 255, 255, 0.03)"
          sectionSize={2.5} 
          cellSize={0.5}
          position={[0, -2.5, 0]}
        />
      </Canvas>
    </div>
  );
}

interface CubeSatRendererProps {
  imu: IMUData;
}

export const CubeSatRenderer: React.FC<CubeSatRendererProps> = ({ imu }) => {
  const rotationRad: [number, number, number] = [
    THREE.MathUtils.degToRad(imu.pitch),
    THREE.MathUtils.degToRad(imu.yaw),
    THREE.MathUtils.degToRad(imu.roll),
  ];

  return (
    <div className="w-full h-full relative" style={{ minHeight: "280px" }}>
      <SpaceScene rotation={rotationRad} />
      <div id="orientation-label" className="absolute bottom-4 left-4 bg-[#0e1528]/90 px-3 py-1.5 font-mono text-xs font-semibold text-cyan-400 border border-cyan-500/20 rounded-lg shadow-cyan-glow pointer-events-none z-10 transition-colors duration-150">
        ORIENTATION: {imu.roll.toFixed(1)}°X | {imu.pitch.toFixed(1)}°Y | {imu.yaw.toFixed(1)}°Z
      </div>
    </div>
  );
};
