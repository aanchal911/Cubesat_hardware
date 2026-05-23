export interface TelemetryPoint {
  time: string;
  temperature: number;
  humidity: number;
  pressure: number;
  ambientLight: number;
  vcc: number;
  battery: number;
  signal: number;
}

export interface SensorData {
  temperature: number;
  humidity: number;
  pressure: number;
  ambientLight: number;
  vcc: number;
  battery: number;
  signal: number;
}

export interface IMUData {
  roll: number;
  pitch: number;
  yaw: number;
}

export interface AccelerometerData {
  ax: number;
  ay: number;
  az: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "COMMAND";
  message: string;
}

export interface AnalysisReport {
  id: string;
  title: string;
  summary: string;
  temperatureAvg: number;
  batteryAvg: number;
  stabilityAvg: number;
  signalAvg: number;
  anomalyCount: number;
  verdict: "NOMINAL" | "DEGRADED" | "CRITICAL";
  details: string;
  createdAt: string; // ISO string or format
}
