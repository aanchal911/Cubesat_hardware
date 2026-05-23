import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Thermometer,
  Droplets,
  Cpu,
  Tv,
  Wifi,
  Battery as BatteryIcon,
  Compass,
  Terminal,
  Send,
  Zap,
  Sparkles,
  RefreshCw,
  Trash2,
  Sun,
  Activity,
  AlertTriangle,
  Radio,
  Play,
  RotateCcw,
  CheckCircle2,
  Database
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { onAuthStateChanged, User } from "firebase/auth";
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  getDocs, 
  onSnapshot, 
  query as firestoreQuery, 
  orderBy, 
  limit, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  auth, 
  db, 
  loginWithGoogle, 
  loginAnonymously,
  logout, 
  handleFirestoreError, 
  OperationType 
} from "./firebase";
import { TelemetryPoint, IMUData, AccelerometerData, LogEntry, AnalysisReport } from "./types";
import { CubeSatRenderer } from "./components/CubeSatRenderer";

export interface AIRecommendation {
  id: string;
  category: "THERMAL" | "HUMIDITY" | "POWER" | "SIGNAL" | "ATTITUDE" | "GENERAL";
  severity: "CRITICAL" | "WARNING" | "ADVISORY" | "NOMINAL";
  title: string;
  message: string;
}

// Initial historical telemetry generator
const generateInitialTelemetry = (): TelemetryPoint[] => {
  const points: TelemetryPoint[] = [];
  const baseTime = Date.now() - 40000; // 40 seconds ago
  for (let i = 0; i < 20; i++) {
    const timeStr = new Date(baseTime + i * 2000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    // Smooth custom interpolation curves leading to exact user target dataset on point 20
    const ratio = i / 19;
    points.push({
      time: timeStr,
      temperature: Number((24.0 + ratio * 13.10).toFixed(2)),
      humidity: Number((48.0 - ratio * 14.97).toFixed(2)),
      pressure: Number((1013.0 - ratio * 12.23).toFixed(2)),
      ambientLight: Number((500 + ratio * 2286).toFixed(0)),
      vcc: Number((3.3 + ratio * 0.4).toFixed(2)),
      battery: 3.7,
      signal: Number((80 + ratio * 19.0).toFixed(1)),
    });
  }
  return points;
};

export default function App() {
  // Telemetry list with a sliding window of recent readings
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>(generateInitialTelemetry());
  
  // Real-time active values
  const [battery, setBattery] = useState<number>(3.7);
  const [temperature, setTemperature] = useState<number>(37.10);
  const [humidity, setHumidity] = useState<number>(33.03);
  const [pressure, setPressure] = useState<number>(1000.77);
  const [ambientLight, setAmbientLight] = useState<number>(2786);
  const [vcc, setVcc] = useState<number>(3.7);
  const [signal, setSignal] = useState<number>(99.0);

  // Orientation / Attiude (yaw, pitch, roll)
  const [imu, setImu] = useState<IMUData>({ roll: 0.008, pitch: 0.005, yaw: 0.013 });
  const [accelerometer, setAccelerometer] = useState<AccelerometerData>({
    ax: -0.790,
    ay: -0.084,
    az: 9.536
  });

  // Autospin / attitude drift setting (simulates orbital movement)
  const [isAutoSpin, setIsAutoSpin] = useState<boolean>(true);
  
  // Serial Configuration & Logs
  const [isSerialConnected, setIsSerialConnected] = useState<boolean>(false);
  const [serialConsoleLogs, setSerialConsoleLogs] = useState<string>(
    "=== INERTIAL SYSTEM PORT CLOSED ===\nInitialize ESP32 connection..."
  );
  
  // Dynamic Spacecraft logs
  const [logsList, setLogsList] = useState<LogEntry[]>([
    { id: "1", timestamp: "20:00:00", level: "INFO", message: "CubeSat MISSION_01 boot sequence initialized cleanly." },
    { id: "2", timestamp: "20:00:02", level: "INFO", message: "Solar transceiver array deployment completed: ok." },
    { id: "3", timestamp: "20:01:15", level: "INFO", message: "GPS position locks on LEO 560km: -21.43, +104.98." },
    { id: "4", timestamp: "20:02:40", level: "DEBUG", message: "VCC telemetry calibration factor adjusted dynamically." },
  ]);

  // Selected telemetry trend tab
  const [activeTrendTab, setActiveTrendTab] = useState<keyof Omit<TelemetryPoint, "time">>("temperature");

  // Analysis report custom inputs and UI focus controllers
  const [newReportTitle, setNewReportTitle] = useState<string>("");
  const [newReportSummary, setNewReportSummary] = useState<string>("");
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  // Anomaly Injection States
  const [activeAnomaly, setActiveAnomaly] = useState<string | null>(null);
  const [anomalyScore, setAnomalyScore] = useState<number>(2.2);
  const [stabilityScore, setStabilityScore] = useState<number>(95.6);
  
  // Firebase configuration / Authentic state connections
  const [firebaseStatus, setFirebaseStatus] = useState<"SIMULATION_BYPASS" | "STORE_ACTIVE">("SIMULATION_BYPASS");
  const [firebasePopup, setFirebasePopup] = useState<boolean>(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [operationMode, setOperationMode] = useState<"SIMULATION" | "LIVE_ESP32">("LIVE_ESP32");
  
  // Non-blocking incoming database updates lockout ref
  const isIncomingFirebaseUpdate = useRef<boolean>(false);

  // Real-time AI Heuristics/ML Safety & Environment Recommendation Engine
  const realTimeRecommendations = useMemo<AIRecommendation[]>(() => {
    const list: AIRecommendation[] = [];

    // 1. Thermal Analysis
    if (temperature > 37.0) {
      list.push({
        id: "temp_crit",
        category: "THERMAL",
        severity: "CRITICAL",
        title: "CORE HEAT EXTREME ALERT",
        message: `Critically high temperature detected (${temperature.toFixed(2)}°C). Risk of component failure. Ground personnel: Extreme heat index! Do not go outside, stay hydrated, seek air-conditioned cover, and protect electrical arrays.`
      });
    } else if (temperature > 30.0) {
      list.push({
        id: "temp_high",
        category: "THERMAL",
        severity: "WARNING",
        title: "HEAT ADVISORY ACTIVE",
        message: `Elevated system temperature detected (${temperature.toFixed(2)}°C). Minimize continuous external field operations. Operator hydration protocols activated.`
      });
    } else if (temperature < 15.0) {
      list.push({
        id: "temp_low",
        category: "THERMAL",
        severity: "ADVISORY",
        title: "LOW TEMPERATURE",
        message: `Thermal levels below 15°C (${temperature.toFixed(2)}°C). passive thermal heaters activated. Dress warmly for local diagnostics.`
      });
    } else {
      list.push({
        id: "temp_nominal",
        category: "THERMAL",
        severity: "NOMINAL",
        title: "THERMAL REGIME STABLE",
        message: `Core temperature is at nominal baseline (${temperature.toFixed(2)}°C). Human thermal safety secure.`
      });
    }

    // 2. Humidity Analysis
    if (humidity < 20.0) {
      list.push({
        id: "humidity_low",
        category: "HUMIDITY",
        severity: "WARNING",
        title: "STATIC DISCHARGE RISK",
        message: `Extremely dry humidity levels (${humidity.toFixed(2)}% RH). Increased risk of electrostatic shock on ESP32 development hardware. Ensure ground straps are connected.`
      });
    } else if (humidity > 70.0) {
      list.push({
        id: "humidity_high",
        category: "HUMIDITY",
        severity: "WARNING",
        title: "CONDENSATION ADVISORY",
        message: `High relative humidity (${humidity.toFixed(2)}% RH). Potential for trace micro-dew condensation. Avoid direct circuit contact and high-voltage connections.`
      });
    } else {
      list.push({
        id: "humidity_nominal",
        category: "HUMIDITY",
        severity: "NOMINAL",
        title: "ATMOSPHERIC MOISTURE STABLE",
        message: `Atmospheric moisture levels within target levels (${humidity.toFixed(2)}% RH).`
      });
    }

    // 3. Power Matrix Core Advice
    if (battery <= 3.4) {
      list.push({
        id: "power_crit",
        category: "POWER",
        severity: "CRITICAL",
        title: "CRITICAL DC LOW VOLTAGE",
        message: `ESP32 VCC supply is dangerously low (${battery.toFixed(2)}V). Commencing non-vital sensor standby powerdown immediately to avoid brownout.`
      });
    } else if (battery < 25) {
      list.push({
        id: "power_warn",
        category: "POWER",
        severity: "WARNING",
        title: "POWER STORAGE LOW",
        message: `Accumulators depleted to safety limits (${battery.toFixed(1)}%). Re-orient CubeSat panels to sun coordinate locks and minimize custom diagnostic queries.`
      });
    } else if (battery > 95) {
      list.push({
        id: "power_nominal",
        category: "POWER",
        severity: "NOMINAL",
        title: "ENERGY RESERVES OPTIMAL",
        message: `Energy grid fully energized (${battery.toFixed(1)}%). continuous structural scientific telemetry runs are safe.`
      });
    } else {
      list.push({
        id: "power_advisory",
        category: "POWER",
        severity: "ADVISORY",
        title: "ENERGY GRID STEADY",
        message: `Power status stable (${battery.toFixed(1)}%). Solar panel generation offsetting active radio loads.`
      });
    }

    // 4. Downlink Margin
    if (signal < 40.0) {
      list.push({
        id: "signal_deg",
        category: "SIGNAL",
        severity: "CRITICAL",
        title: "TELEMETRY SIGNAL LOSS RISK",
        message: `Downlink margin critically reduced (${signal.toFixed(1)}%). High risk of command frame dropout. Correct CubeSat attitude orientation or increase ground transceiver gain.`
      });
    } else if (signal < 75.0) {
      list.push({
        id: "signal_advisory",
        category: "SIGNAL",
        severity: "ADVISORY",
        title: "SIGNAL ATTENUATED",
        message: `Reception is attenuated (${signal.toFixed(1)}%). Consider slight yaw alignment of satellite high-gain antenna towards ground receiver slot.`
      });
    } else {
      list.push({
        id: "signal_optimal",
        category: "SIGNAL",
        severity: "NOMINAL",
        title: "COMMUNICATION LINK STRONG",
        message: `Solid S-Band link margin established (${signal.toFixed(1)}% strength). Synchronized data packet streams flowing uninterrupted.`
      });
    }

    // 5. Ambient Photodiode Light levels (Solar Radiation)
    if (ambientLight > 2500) {
      list.push({
        id: "light_extreme",
        category: "GENERAL",
        severity: "WARNING",
        title: "INTENSE SOLAR RADIATION",
        message: `Extreme ambient light/solar flux detected (${ambientLight} lx). Max solar generator capacity reached. Technicians should stay hydrated, seek shade, and avoid direct UV exposure.`
      });
    } else if (ambientLight < 100) {
      list.push({
        id: "light_eclipse",
        category: "GENERAL",
        severity: "ADVISORY",
        title: "ORBITAL SHADOW / ECLIPSE",
        message: `Minimal solar illumination detected (${ambientLight} lx). CubeSat is currently in Earth's shadow cone, utilizing battery storage reserves.`
      });
    }

    return list;
  }, [temperature, humidity, battery, signal, ambientLight]);

  // Synchronize Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        setFirebaseStatus("STORE_ACTIVE");
        triggerLog("INFO", `Ground Operator authenticated: ${user.displayName || user.email || "Guest Operator"}`);
      } else {
        setFirebaseStatus("SIMULATION_BYPASS");
        // Auto-signIn anonymously if there is no user so they don't have to connect manually!
        loginAnonymously().catch((e) => {
          console.log("Could not auto guest sign in: ", e);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync real-time orbital status across ground operators
  useEffect(() => {
    if (firebaseStatus === "STORE_ACTIVE" && firebaseUser && operationMode === "SIMULATION") {
      const statusRef = doc(db, "cubesat_status", "latest");
      const unsubscribe = onSnapshot(statusRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          
          isIncomingFirebaseUpdate.current = true;
          
          setBattery(data.battery);
          setTemperature(data.temperature);
          setHumidity(data.humidity);
          setPressure(data.pressure);
          setAmbientLight(data.ambientLight);
          setVcc(data.vcc);
          setSignal(data.signal);
          
          setImu({
            roll: data.roll,
            pitch: data.pitch,
            yaw: data.yaw
          });
          
          setAccelerometer({
            ax: data.ax,
            ay: data.ay,
            az: data.az
          });
          
          setIsAutoSpin(data.isAutoSpin);
          setActiveAnomaly(data.activeAnomaly === "" ? null : data.activeAnomaly);
          setAnomalyScore(data.anomalyScore);
          setStabilityScore(data.stabilityScore);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, "cubesat_status/latest");
      });
      return () => unsubscribe();
    }
  }, [firebaseStatus, firebaseUser, operationMode]);

  // Sync real-time sliding telemetry history with Firestore
  useEffect(() => {
    if (firebaseStatus === "STORE_ACTIVE" && firebaseUser && operationMode === "SIMULATION") {
      const q = firestoreQuery(collection(db, "telemetry_history"), orderBy("createdAt", "desc"), limit(20));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedPoints: TelemetryPoint[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetchedPoints.push({
            time: data.time,
            temperature: data.temperature,
            humidity: data.humidity,
            pressure: data.pressure,
            ambientLight: data.ambientLight,
            vcc: data.vcc,
            battery: data.battery,
            signal: data.signal
          });
        });
        fetchedPoints.reverse();
        if (fetchedPoints.length > 0) {
          setTelemetry(fetchedPoints);
        } else {
          // Empty DB: Seed initial dataset
          telemetry.forEach(async (point) => {
            try {
              await addDoc(collection(db, "telemetry_history"), {
                time: point.time,
                temperature: point.temperature,
                humidity: point.humidity,
                pressure: point.pressure,
                ambientLight: point.ambientLight,
                vcc: point.vcc,
                battery: point.battery,
                signal: point.signal,
                createdAt: serverTimestamp()
              });
            } catch (err) {
              console.error("Failed to seed initial telemetry:", err);
            }
          });
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "telemetry_history");
      });
      return () => unsubscribe();
    }
  }, [firebaseStatus, firebaseUser, operationMode]);

  // Sync real-time sliding telemetry directly from real hardware (ESP32) Collection
  useEffect(() => {
    if (firebaseStatus === "STORE_ACTIVE" && firebaseUser && operationMode === "LIVE_ESP32") {
      let unsubscribeFallback: (() => void) | null = null;
      
      const q = firestoreQuery(collection(db, "telemetry"), orderBy("timestamp", "desc"), limit(20));
      const unsubscribeMain = onSnapshot(q, (snapshot) => {
        const fetchedPoints: TelemetryPoint[] = [];
        let latestDoc: any = null;
        let latestTimestamp = 0;

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data) {
            // Check if standard ESP32 payload
            const rawTime = data.timestamp || "";
            const tempVal = data.bme280?.temp ?? data.temperature ?? 0;
            const humidityVal = data.bme280?.humidity ?? data.humidity ?? 0;
            const pressureVal = data.bme280?.pressure ?? data.pressure ?? 0;
            const lightVal = data.light ?? data.ambientLight ?? 0;
            const batVal = data.battery ?? 0;

            // Extract time for representation (e.g. 20:34:19)
            let formattedTime = String(rawTime);
            if (formattedTime.includes("T")) {
              const parts = formattedTime.split("T");
              if (parts[1]) {
                formattedTime = parts[1].slice(0, 8); // "20:34:19"
              }
            }

            fetchedPoints.push({
              time: formattedTime,
              temperature: tempVal,
              humidity: humidityVal,
              pressure: pressureVal,
              ambientLight: lightVal,
              vcc: data.vcc ?? 3.3,
              battery: batVal,
              signal: data.signal ?? 99.0
            });

            // Keep track of latest to sync status gauges
            const parsedTime = Date.parse(rawTime);
            if (!isNaN(parsedTime) && parsedTime > latestTimestamp) {
              latestTimestamp = parsedTime;
              latestDoc = { data, docId: docSnap.id };
            } else if (isNaN(parsedTime)) {
              latestDoc = { data, docId: docSnap.id };
            }
          }
        });

        if (fetchedPoints.length > 0) {
          fetchedPoints.reverse();
          setTelemetry(fetchedPoints);

          // Update live gauges with the latest ESP32 data!
          if (latestDoc) {
            const data = latestDoc.data;
            isIncomingFirebaseUpdate.current = true;
            
            // Set simple numeric states
            setBattery(data.battery ?? 3.7);
            setTemperature(data.bme280?.temp ?? data.temperature ?? 37.10);
            setHumidity(data.bme280?.humidity ?? data.humidity ?? 33.03);
            setPressure(data.bme280?.pressure ?? data.pressure ?? 1000.77);
            setAmbientLight(data.light ?? data.ambientLight ?? 2786);
            setVcc(data.vcc ?? 3.7);
            setSignal(data.signal ?? 99.0);

            if (data.accel) {
              setAccelerometer({
                ax: data.accel.x ?? 0.0,
                ay: data.accel.y ?? 0.0,
                az: data.accel.z ?? 9.8
              });
            }

            if (data.gyro) {
              setImu({
                roll: data.gyro.x ?? 0.0,
                pitch: data.gyro.y ?? 0.0,
                yaw: data.gyro.z ?? 0.0
              });
            }
          }
        }
      }, (error) => {
        // If the query fails or index is not ready yet, handle gracefully (e.g., query without sorting)
        console.warn("Telemetry sorted query failed, retrying unsorted fallback...", error);
        
        // Fallback: Query unsorted telemetry
        const fallbackQ = firestoreQuery(collection(db, "telemetry"), limit(20));
        unsubscribeFallback = onSnapshot(fallbackQ, (snapshot) => {
          const fetchedPoints: TelemetryPoint[] = [];
          let latestDoc: any = null;
          let latestTimestamp = 0;

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data) {
              const rawTime = data.timestamp || "";
              const tempVal = data.bme280?.temp ?? data.temperature ?? 0;
              const humidityVal = data.bme280?.humidity ?? data.humidity ?? 0;
              const pressureVal = data.bme280?.pressure ?? data.pressure ?? 0;
              const lightVal = data.light ?? data.ambientLight ?? 0;
              const batVal = data.battery ?? 0;

              let formattedTime = String(rawTime);
              if (formattedTime.includes("T")) {
                const parts = formattedTime.split("T");
                if (parts[1]) {
                  formattedTime = parts[1].slice(0, 8);
                }
              }

              fetchedPoints.push({
                time: formattedTime,
                temperature: tempVal,
                humidity: humidityVal,
                pressure: pressureVal,
                ambientLight: lightVal,
                vcc: data.vcc ?? 3.3,
                battery: batVal,
                signal: data.signal ?? 99.0
              });

              const parsedTime = Date.parse(rawTime);
              if (!isNaN(parsedTime) && parsedTime > latestTimestamp) {
                latestTimestamp = parsedTime;
                latestDoc = { data, docId: docSnap.id };
              } else if (isNaN(parsedTime)) {
                latestDoc = { data, docId: docSnap.id };
              }
            }
          });

          if (fetchedPoints.length > 0) {
            fetchedPoints.reverse();
            setTelemetry(fetchedPoints);

            if (latestDoc) {
              const data = latestDoc.data;
              isIncomingFirebaseUpdate.current = true;
              setBattery(data.battery ?? 3.7);
              setTemperature(data.bme280?.temp ?? data.temperature ?? 37.10);
              setHumidity(data.bme280?.humidity ?? data.humidity ?? 33.03);
              setPressure(data.bme280?.pressure ?? data.pressure ?? 1000.77);
              setAmbientLight(data.light ?? data.ambientLight ?? 2786);
              setVcc(data.vcc ?? 3.7);
              setSignal(data.signal ?? 99.0);

              if (data.accel) {
                setAccelerometer({
                  ax: data.accel.x ?? 0.0,
                  ay: data.accel.y ?? 0.0,
                  az: data.accel.z ?? 9.8
                });
              }

              if (data.gyro) {
                setImu({
                  roll: data.gyro.x ?? 0.0,
                  pitch: data.gyro.y ?? 0.0,
                  yaw: data.gyro.z ?? 0.0
                });
              }
            }
          }
        }, (err) => {
          handleFirestoreError(err, OperationType.LIST, "telemetry");
        });
      });

      return () => {
        unsubscribeMain();
        if (unsubscribeFallback) {
          unsubscribeFallback();
        }
      };
    }
  }, [firebaseStatus, firebaseUser, operationMode]);

  // Sync real-time mission logs with Firestore
  useEffect(() => {
    if (firebaseStatus === "STORE_ACTIVE" && firebaseUser) {
      const q = firestoreQuery(collection(db, "logs"), orderBy("createdAt", "desc"), limit(55));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedLogs: LogEntry[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetchedLogs.push({
            id: docSnap.id,
            timestamp: data.timestamp,
            level: data.level,
            message: data.message
          });
        });
        fetchedLogs.reverse();
        if (fetchedLogs.length > 0) {
          setLogsList(fetchedLogs);
        } else {
          // Empty DB: Seed default system logs
          logsList.forEach(async (log) => {
            try {
              await setDoc(doc(db, "logs", log.id), {
                id: log.id,
                timestamp: log.timestamp,
                level: log.level,
                message: log.message,
                createdAt: serverTimestamp()
              });
            } catch (err) {
              console.error("Failed to seed default log:", err);
            }
          });
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "logs");
      });
      return () => unsubscribe();
    }
  }, [firebaseStatus, firebaseUser]);

  // Deep historical analysis reports state & Firestore synchronization hook
  const [analysisReports, setAnalysisReports] = useState<AnalysisReport[]>([]);

  useEffect(() => {
    if (firebaseStatus === "STORE_ACTIVE" && firebaseUser) {
      const q = firestoreQuery(collection(db, "analysis_reports"), orderBy("createdAt", "desc"), limit(25));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedReports: AnalysisReport[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetchedReports.push({
            id: docSnap.id,
            title: data.title || "Report",
            summary: data.summary || "",
            temperatureAvg: Number(data.temperatureAvg || 0),
            batteryAvg: Number(data.batteryAvg || 0),
            stabilityAvg: Number(data.stabilityAvg || 0),
            signalAvg: Number(data.signalAvg || 0),
            anomalyCount: Number(data.anomalyCount || 0),
            verdict: data.verdict || "NOMINAL",
            details: data.details || "",
            createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : new Date().toISOString()
          });
        });
        if (fetchedReports.length > 0) {
          setAnalysisReports(fetchedReports);
        } else {
          // Empty DB: Seed default analysis reports to Firestore automatically so they display in the Firebase Console
          const defaultReports = [
            {
              id: "rep-001",
              title: "Pre-Flight Ground Calibration Report",
              summary: "Initial sensor accuracy assessment and battery discharge run under steady ground conditions.",
              temperatureAvg: 24.2,
              batteryAvg: 98.4,
              stabilityAvg: 95.6,
              signalAvg: 99.0,
              anomalyCount: 0,
              verdict: "NOMINAL" as const,
              details: "All sensor buses (BME280, Photodiode VCC, S-Band Transceiver) reporting nominal performance. No micro-arcing or electrostatic warnings observed."
            },
            {
              id: "rep-002",
              title: "Orbital Injection Initial Diagnostics",
              summary: "Assessment of initial telemetry drift during simulated atmospheric launch and low Earth orbit insertion.",
              temperatureAvg: 37.1,
              batteryAvg: 85.2,
              stabilityAvg: 78.4,
              signalAvg: 75.0,
              anomalyCount: 1,
              verdict: "DEGRADED" as const,
              details: "Transient S-Band antenna signal dip observed during simulated solar twilight. Battery discharge rate slightly elevated due to continuous IMU auto-spin routines."
            }
          ];

          defaultReports.forEach(async (report) => {
            try {
              await setDoc(doc(db, "analysis_reports", report.id), {
                id: report.id,
                title: report.title,
                summary: report.summary,
                temperatureAvg: report.temperatureAvg,
                batteryAvg: report.batteryAvg,
                stabilityAvg: report.stabilityAvg,
                signalAvg: report.signalAvg,
                anomalyCount: report.anomalyCount,
                verdict: report.verdict,
                details: report.details,
                createdAt: serverTimestamp()
              });
            } catch (err) {
              console.error("Failed to seed default analysis report:", err);
            }
          });
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "analysis_reports");
      });
      return () => unsubscribe();
    } else {
      // Fallback offline pre-seeded reports based on actual historic data
      setAnalysisReports([
        {
          id: "rep-001",
          title: "Pre-Flight Ground Calibration Report",
          summary: "Initial sensor accuracy assessment and battery discharge run under steady ground conditions.",
          temperatureAvg: 24.2,
          batteryAvg: 98.4,
          stabilityAvg: 95.6,
          signalAvg: 99.0,
          anomalyCount: 0,
          verdict: "NOMINAL",
          details: "All sensor buses (BME280, Photodiode VCC, S-Band Transceiver) reporting nominal performance. No micro-arcing or electrostatic warnings observed.",
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
        },
        {
          id: "rep-002",
          title: "Orbital Injection Initial Diagnostics",
          summary: "Assessment of initial telemetry drift during simulated atmospheric launch and low Earth orbit insertion.",
          temperatureAvg: 37.1,
          batteryAvg: 85.2,
          stabilityAvg: 78.4,
          signalAvg: 75.0,
          anomalyCount: 1,
          verdict: "DEGRADED",
          details: "Transient S-Band antenna signal dip observed during solar eclipse. Battery discharge rate slightly elevated due to continuous IMU auto-spin routines.",
          createdAt: new Date(Date.now() - 3600000).toISOString()
        }
      ]);
    }
  }, [firebaseStatus, firebaseUser]);

  // AI assistant messaging States
  const [query, setQuery] = useState<string>("");
  const [response, setResponse] = useState<string>(
    "Telemetry analysis active. Provide instructions to correct satellite flight parameters or inspect sensors."
  );
  const [isLlmLoading, setIsLlmLoading] = useState<boolean>(false);
  const [loadingStatusText, setLoadingStatusText] = useState<string>("");

  // Live countdown timestamp
  const [systemTimeUtc, setSystemTimeUtc] = useState<string>("");

  // System status logs autoseeding ticker
  useEffect(() => {
    const timer = setInterval(() => {
      const utcStr = new Date().toUTCString().replace("GMT", "UTC");
      setSystemTimeUtc(utcStr);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Web Serial connection simulation
  const handleToggleSerial = () => {
    if (isSerialConnected) {
      setIsSerialConnected(false);
      setSerialConsoleLogs(
        (prev) => prev + "\n[DISCONNECT] Comm receiver link severed by user command."
      );
    } else {
      setIsSerialConnected(true);
      setSerialConsoleLogs(
        (prev) => prev + "\n[CONNECT] Synchronizing via serial interface... Connected to dynamic COM4 port at 115200 baud."
      );
      // Seed initial high-frequency packets matching standard binary strings
      triggerLog("INFO", "Serial Port (UART0) linked successfully to ground terminal.");
    }
  };

  // Add a spacecraft system log helper
  const triggerLog = (level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "COMMAND", message: string) => {
    const now = new Date();
    const ts = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const logId = doc(collection(db, "logs")).id;
    const newLog: LogEntry = {
      id: logId,
      timestamp: ts,
      level,
      message
    };
    setLogsList((prev) => [...prev, newLog]);

    // Save of authentic firebase log
    if (firebaseStatus === "STORE_ACTIVE" && firebaseUser) {
      setDoc(doc(db, "logs", logId), {
        id: logId,
        timestamp: ts,
        level,
        message,
        createdAt: serverTimestamp()
      }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `logs/${logId}`);
      });
    }
  };

  // Telemetry Updater simulation loop
  useEffect(() => {
    let tickCount = 0;
    const interval = setInterval(() => {
      // Discard tick if we are resolving an incoming remote snapshot
      if (isIncomingFirebaseUpdate.current) {
        isIncomingFirebaseUpdate.current = false;
        return;
      }

      // If we are in LIVE_ESP32 mode, do not simulate sensor data changes or publish mock logs/writes!
      if (operationMode === "LIVE_ESP32") {
        if (isAutoSpin) {
          setImu((prev) => {
            const driftRoll = Math.sin(Date.now() / 6000) * 0.15;
            const driftPitch = Math.cos(Date.now() / 8000) * 0.08;
            const driftYaw = Math.sin(Date.now() / 10000) * 0.20;
            return {
              roll: Number((prev.roll + driftRoll).toFixed(2)),
              pitch: Number((prev.pitch + driftPitch).toFixed(2)),
              yaw: Number((prev.yaw + driftYaw).toFixed(2))
            };
          });
        }
        
        // Handle mock raw Serial RX if serial is open
        if (isSerialConnected) {
          const hexPacket = `FB 5F ${Math.floor(temperature).toString(16).toUpperCase()} ${Math.floor(ambientLight / 4).toString(16).toUpperCase()} ${Math.floor(battery).toString(16).toUpperCase()} F0 03 AA`;
          setSerialConsoleLogs((prev) => {
            const lines = prev.split("\n");
            if (lines.length > 10) lines.shift();
            return [...lines, `[RX-PACKET] (LIVE): ${hexPacket} | SENS:${temperature.toFixed(1)}C|BATT:${battery.toFixed(0)}%`].join("\n");
          });
        }
        return;
      }

      tickCount++;

      // Attitude dynamics simulation
      setImu((prev) => {
        let driftRoll = 0;
        let driftPitch = 0;
        let driftYaw = 0;

        if (isAutoSpin) {
          // Slow orbital yaw-pitch oscillation
          driftRoll = Math.sin(Date.now() / 6000) * 0.15;
          driftPitch = Math.cos(Date.now() / 8000) * 0.08;
          driftYaw = Math.sin(Date.now() / 10000) * 0.20;
        }

        const targetRoll = prev.roll + driftRoll;
        const targetPitch = prev.pitch + driftPitch;
        const targetYaw = prev.yaw + driftYaw;

        // Keep values formatted within standard circles
        return {
          roll: Number(targetRoll.toFixed(2)),
          pitch: Number(targetPitch.toFixed(2)),
          yaw: Number(targetYaw.toFixed(2))
        };
      });

      // Accelerometer Raw estimation from attitude
      setAccelerometer(() => {
        const noiseX = (Math.random() - 0.5) * 0.01;
        const noiseY = (Math.random() - 0.5) * 0.01;
        const noiseZ = (Math.random() - 0.5) * 0.012;
        return {
          ax: Number((-0.18 + noiseX).toFixed(3)),
          ay: Number((0.38 + noiseY).toFixed(3)),
          az: Number((9.78 + noiseZ - Math.abs(imu.roll) * 0.02).toFixed(3))
        };
      });

      // Determine anomalies behaviors and telemetry variance
      let finalBattery = battery;
      let finalTemp = temperature;
      let finalHumidity = humidity;
      let finalPressure = pressure;
      let finalLight = ambientLight;
      let finalVcc = vcc;
      let finalSignal = signal;

      if (activeAnomaly === "temp_surge") {
        finalTemp = Math.min(65.0, finalTemp + 0.8 + Math.random() * 0.3);
        finalHumidity = Math.max(10.0, finalHumidity - 0.5);
        setAnomalyScore(83.4);
        setStabilityScore(18.2);
        if (tickCount % 4 === 0) {
          triggerLog("WARN", "[THERMAL CRITERIA AXIS-X] Temperature critical limits tripped: " + finalTemp.toFixed(1) + "°C");
        }
      } else if (activeAnomaly === "signal_drop") {
        finalSignal = Math.max(5.0, finalSignal - 3.5 - Math.random() * 2);
        setAnomalyScore(91.0);
        setStabilityScore(11.5);
        if (tickCount % 4 === 0) {
          triggerLog("ERROR", "[S_BAND LINK] Downlink receiver signal drop detected: " + finalSignal.toFixed(1) + "%");
        }
      } else if (activeAnomaly === "power_drain") {
        finalBattery = Math.max(0, finalBattery - 1.2 - Math.random() * 0.4);
        finalVcc = Math.max(3.1, finalVcc - 0.02);
        setAnomalyScore(79.0);
        setStabilityScore(34.1);
        if (tickCount % 4 === 0) {
          triggerLog("WARN", "[BATTERY SYSTEM] Excessive discharge observed on raw power distribution matrix.");
        }
      } else {
        // Normal orbital cycle variance
        finalBattery = Math.max(0, Math.min(100, finalBattery - 0.05 + (finalLight > 600 ? 0.08 : 0)));
        finalTemp = 24.0 + Math.sin(Date.now() / 20000) * 0.6 + (Math.random() - 0.5) * 0.2;
        finalHumidity = 48.0 + Math.cos(Date.now() / 25000) * 1.0 + (Math.random() - 0.5) * 0.15;
        finalPressure = 1013.1 + Math.sin(Date.now() / 50000) * 0.5 + (Math.random() - 0.5) * 0.05;
        finalLight = 600 + Math.sin(Date.now() / 15000) * 80 + (Math.random() - 0.5) * 10;
        finalVcc = 3.80 + Math.sin(Date.now() / 30000) * 0.01 + (Math.random() - 0.5) * 0.005;
        finalSignal = 85.0 + Math.sin(Date.now() / 18000) * 4.0 + (Math.random() - 0.5) * 1.0;
        
        // Stabilize scores
        setAnomalyScore((prev) => Math.max(1.5, prev - 1.0));
        setStabilityScore((prev) => Math.min(97.8, prev + 0.8));
      }

      setBattery(Number(finalBattery.toFixed(1)));
      setTemperature(Number(finalTemp.toFixed(1)));
      setHumidity(Number(finalHumidity.toFixed(1)));
      setPressure(Number(finalPressure.toFixed(1)));
      setAmbientLight(Number(finalLight.toFixed(0)));
      setVcc(Number(finalVcc.toFixed(2)));
      setSignal(Number(finalSignal.toFixed(1)));

      const nextTime = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      // Synchronize back to Cloud Firestore
      if (firebaseStatus === "STORE_ACTIVE" && firebaseUser) {
        setDoc(doc(db, "cubesat_status", "latest"), {
          battery: Number(finalBattery.toFixed(1)),
          temperature: Number(finalTemp.toFixed(1)),
          humidity: Number(finalHumidity.toFixed(1)),
          pressure: Number(finalPressure.toFixed(1)),
          ambientLight: Number(finalLight.toFixed(0)),
          vcc: Number(finalVcc.toFixed(2)),
          signal: Number(finalSignal.toFixed(1)),
          roll: imu.roll,
          pitch: imu.pitch,
          yaw: imu.yaw,
          ax: accelerometer.ax,
          ay: accelerometer.ay,
          az: accelerometer.az,
          isAutoSpin: isAutoSpin,
          activeAnomaly: activeAnomaly || "",
          anomalyScore: activeAnomaly === "temp_surge" ? 83.4 : activeAnomaly === "signal_drop" ? 91.0 : activeAnomaly === "power_drain" ? 79.0 : Math.max(1.5, anomalyScore - 1.0),
          stabilityScore: activeAnomaly === "temp_surge" ? 18.2 : activeAnomaly === "signal_drop" ? 11.5 : activeAnomaly === "power_drain" ? 34.1 : Math.min(97.8, stabilityScore + 0.8),
          updatedAt: serverTimestamp()
        }).catch((err) => {
          console.error("Failed to commit live state update:", err);
        });

        addDoc(collection(db, "telemetry_history"), {
          time: nextTime,
          temperature: finalTemp,
          humidity: finalHumidity,
          pressure: finalPressure,
          ambientLight: finalLight,
          vcc: finalVcc,
          battery: finalBattery,
          signal: finalSignal,
          createdAt: serverTimestamp()
        }).catch((err) => {
          console.error("Failed to append telemetry history point:", err);
        });
      }

      // Set moving chart history
      setTelemetry((prev) => {
        const newPoint: TelemetryPoint = {
          time: nextTime,
          temperature: finalTemp,
          humidity: finalHumidity,
          pressure: finalPressure,
          ambientLight: finalLight,
          vcc: finalVcc,
          battery: finalBattery,
          signal: finalSignal,
        };

        // Slide window size = 20
        return [...prev.slice(-19), newPoint];
      });

      // Handle raw Serial packet mock emissions
      if (isSerialConnected) {
        const hexPacket = `FB 5F ${Math.floor(finalTemp).toString(16).toUpperCase()} ${Math.floor(finalLight / 4).toString(16).toUpperCase()} ${Math.floor(finalBattery).toString(16).toUpperCase()} F0 03 AA`;
        setSerialConsoleLogs((prev) => {
          const lines = prev.split("\n");
          if (lines.length > 10) lines.shift();
          return [...lines, `[RX-PACKET]: ${hexPacket} | SENS:${finalTemp.toFixed(1)}C|BATT:${finalBattery.toFixed(0)}%`].join("\n");
        });
      }

    }, 2000);

    return () => clearInterval(interval);
  }, [battery, temperature, humidity, pressure, ambientLight, vcc, signal, activeAnomaly, isSerialConnected, isAutoSpin, firebaseStatus, firebaseUser, imu, accelerometer, anomalyScore, stabilityScore, operationMode]);

  // Handle direct custom telemetry modifications (Simulation triggers)
  const handleResetSystem = async () => {
    setActiveAnomaly(null);
    setAnomalyScore(2.2);
    setStabilityScore(95.6);
    setBattery(99.1);
    setTemperature(24.2);
    setHumidity(48.8);
    setPressure(1013.6);
    setAmbientLight(651);
    setVcc(3.81);
    setSignal(88.5);
    triggerLog("COMMAND", "Ground control link issued general parameter reset command.");
    triggerLog("INFO", "Telemetry subsystems restored to normal operating baselines.");

    if (firebaseStatus === "STORE_ACTIVE" && firebaseUser) {
      try {
        await setDoc(doc(db, "cubesat_status", "latest"), {
          battery: 99.1,
          temperature: 24.2,
          humidity: 48.8,
          pressure: 1013.6,
          ambientLight: 651,
          vcc: 3.81,
          signal: 88.5,
          roll: 0.0,
          pitch: 0.0,
          yaw: 0.0,
          ax: -0.18,
          ay: 0.38,
          az: 9.78,
          isAutoSpin: false,
          activeAnomaly: "",
          anomalyScore: 2.2,
          stabilityScore: 95.6,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "cubesat_status/latest");
      }
    }
  };

  const handleInjectGenericPacket = () => {
    // Inject exact target telemetry payload from the user
    setTemperature(37.10);
    setHumidity(33.03);
    setPressure(1000.77);
    setAmbientLight(2786);
    setBattery(3.7);
    setVcc(3.7);
    setSignal(99.0);
    setAccelerometer({ ax: -0.790, ay: -0.084, az: 9.536 });
    setImu({ roll: 0.008, pitch: 0.005, yaw: 0.013 });

    setTelemetry((prev) => {
      const newPoint: TelemetryPoint = {
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        temperature: 37.10,
        humidity: 33.03,
        pressure: 1000.77,
        ambientLight: 2786,
        vcc: 3.7,
        battery: 3.7,
        signal: 99.0
      };
      return [...prev.slice(-19), newPoint];
    });

    triggerLog("INFO", "Ground injection: Target telemetry template loaded locally.");
    setSerialConsoleLogs((prev) => prev + "\n[DIAGNOSTIC] Loaded user target ESP32 telemetry packet locally.");
  };

  const handleAutoseedLogs = () => {
    const spacePhrases = [
      "Magnetometer axes calibrated on Earth orbit vectors successfully.",
      "Primary processor load current stabilized at 285 mA.",
      "Downlink S-Band buffer purged: 0 packets remaining.",
      "Thermal radiation dissipation passive manifold within norm.",
      "Fine guidance solar sensor reports standard sun vector lock."
    ];
    const phrase = spacePhrases[Math.floor(Math.random() * spacePhrases.length)];
    triggerLog("INFO", phrase);
  };

  // Seeder for physical ESP32 JSON payload in Firestore
  const handleSendESP32TelemetryDemo = async () => {
    if (firebaseStatus !== "STORE_ACTIVE" || !firebaseUser) {
      return;
    }

    const nowISO = new Date().toISOString(); 
    const timestampFormatted = nowISO.split('.')[0] + 'Z'; 

    const demoPayload = {
      timestamp: timestampFormatted,
      light: 2786,
      battery: 3.7,
      bme280: {
        temp: 37.10,
        humidity: 33.03,
        pressure: 1000.77
      },
      accel: {
        x: -0.790,
        y: -0.084,
        z: 9.536
      },
      gyro: {
        x: 0.008,
        y: 0.005,
        z: 0.013
      }
    };

    try {
      await addDoc(collection(db, "telemetry"), demoPayload);
      triggerLog("INFO", `ESP32 telemetry document successfully added in '/telemetry' collection.`);
      setSerialConsoleLogs((prev) => {
        const lines = prev.split("\n");
        if (lines.length > 8) lines.shift();
        return [...lines, `[DEMO-UPLINK]: Seeded standard ESP32 packet in Firestore. (TEMP: ${demoPayload.bme280.temp}°C)`].join("\n");
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, "telemetry");
    }
  };

  // Generate a manual analysis report based on active dashboard dataset
  const handleGenerateManualAnalysis = async (customTitle?: string, customSummary?: string) => {
    const reportId = doc(collection(db, "analysis_reports")).id;
    
    // Calculate averages from telemetry history
    const temps = telemetry.map((t) => t.temperature);
    const avgTemp = temps.length > 0 ? Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)) : temperature;
    
    const batts = telemetry.map((t) => t.battery || battery);
    const avgBatt = batts.length > 0 ? Number((batts.reduce((a, b) => a + b, 0) / batts.length).toFixed(1)) : battery;

    const sigs = telemetry.map((t) => t.signal);
    const avgSig = sigs.length > 0 ? Number((sigs.reduce((a, b) => a + b, 0) / sigs.length).toFixed(1)) : signal;

    const finalVerdict: "NOMINAL" | "DEGRADED" | "CRITICAL" = activeAnomaly ? (activeAnomaly === "temp_surge" ? "CRITICAL" : "DEGRADED") : "NOMINAL";
    const titleText = customTitle || `Mission Assessment Run #${Math.floor(Math.random() * 900) + 100}`;
    const descText = customSummary || `Autonomous subsystem analysis of CubeSat payload telemetry history. Total historical samples scrutinized: ${telemetry.length}.`;
    
    const countAnomalies = activeAnomaly ? 1 : 0;

    const detailsText = `Subsystem Diagnostics Overview:
----------------------------------------
• Temperature Avg Zone: ${avgTemp}°C
• Battery Avg Charge level: ${avgBatt}%
• Downlink Signal strength: ${avgSig}%
• Structural Stability Index: ${stabilityScore}% accuracy rating
• Host Mode: ${operationMode} Link
• Core Anomaly Lock: ${activeAnomaly ? `ACTIVE (${activeAnomaly.toUpperCase()})` : "NONE"}

Assessment verdict is registered as ${finalVerdict}. Hardware integrity stable. No immediate orbital corrections required.`;

    const newReport = {
      id: reportId,
      title: titleText,
      summary: descText,
      temperatureAvg: avgTemp,
      batteryAvg: avgBatt,
      stabilityAvg: stabilityScore,
      signalAvg: avgSig,
      anomalyCount: countAnomalies,
      verdict: finalVerdict,
      details: detailsText,
      createdAt: serverTimestamp() as any
    };

    if (firebaseStatus === "STORE_ACTIVE" && firebaseUser) {
      try {
        await setDoc(doc(db, "analysis_reports", reportId), {
          ...newReport,
          createdAt: serverTimestamp()
        });
        triggerLog("INFO", `Deep telemetric analysis report '${titleText}' successfully synchronized with Cloud Firestore database.`);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "analysis_reports");
      }
    } else {
      // Offline fallback state update
      const offlineReport: AnalysisReport = {
        ...newReport,
        createdAt: new Date().toISOString()
      };
      setAnalysisReports((prev) => [offlineReport, ...prev]);
      triggerLog("INFO", `Seeded local diagnostic report: '${titleText}' (Local Simulated Mode).`);
    }
  };

  // Ask AI endpoint fetcher
  const handleAskAI = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsLlmLoading(true);
    setResponse("");

    const loadingStates = [
      "Initializing AI Uplink telemetry analysis module...",
      "Correlating S-Band raw gyroscope coordinates...",
      "Analyzing active telemetry data and checking parameters...",
      "Generating diagnostic mission report..."
    ];

    let lIndex = 0;
    setLoadingStatusText(loadingStates[0]);
    const statusInterval = setInterval(() => {
      lIndex++;
      if (lIndex < loadingStates.length) {
        setLoadingStatusText(loadingStates[lIndex]);
      }
    }, 800);

    const activeLogsText = logsList.map(l => ({
      timestamp: l.timestamp,
      level: l.level,
      message: l.message
    }));

    try {
      const responsePayload = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query,
          telemetry: {
            battery,
            temperature,
            humidity,
            pressure,
            ambientLight,
            vcc,
            signal
          },
          imu,
          accelerometer,
          logs: activeLogsText
        })
      });

      const resData = await responsePayload.json();
      clearInterval(statusInterval);

      if (resData.error) {
        setResponse(`**Error retrieving AI analysis**: ${resData.error}`);
      } else {
        setResponse(resData.text || "Report generated empty.");
        // If a satellite command was sent from AI automatically, process it!
        if (resData.command) {
          handleExecuteLlmCommand(resData.command);
        }
      }
    } catch (err: any) {
      clearInterval(statusInterval);
      setResponse(`**Downlink connection failed**: Unable to establish satellite uplink. Please verify dev server state. (${err?.message})`);
    } finally {
      setIsLlmLoading(false);
      setQuery("");
    }
  };

  // AI Command response activator
  const handleExecuteLlmCommand = (cmdObj: { command: string; value?: number; anomalyType?: string; roll?: number; pitch?: number; yaw?: number }) => {
    triggerLog("COMMAND", `Autonomous AI-Uplink triggered system command: [${cmdObj.command}]`);
    switch (cmdObj.command) {
      case "SET_BATTERY":
        if (cmdObj.value !== undefined) {
          setBattery(cmdObj.value);
          triggerLog("INFO", `Battery bank state overridden to ${cmdObj.value}%`);
        }
        break;
      case "SET_ROTATION":
        if (cmdObj.roll !== undefined && cmdObj.pitch !== undefined && cmdObj.yaw !== undefined) {
          setImu({ roll: cmdObj.roll, pitch: cmdObj.pitch, yaw: cmdObj.yaw });
          triggerLog("INFO", `Satellite attitude orientation stabilized to Roll:${cmdObj.roll}° Yaw:${cmdObj.yaw}°`);
        }
        break;
      case "TRIGGER_ANOMALY":
        if (cmdObj.anomalyType) {
          setActiveAnomaly(cmdObj.anomalyType);
          triggerLog("WARN", `AI forced anomaly state: ${cmdObj.anomalyType}`);
        }
        break;
      case "RESET_SYSTEM":
        handleResetSystem();
        break;
      default:
        console.log("Unmapped telemetry command:", cmdObj);
    }
  };

  const handleActiveAnomalySelection = (type: string | null) => {
    setActiveAnomaly(type);
    if (type) {
      triggerLog("WARN", `Simulated mechanical anomaly injected: ${type.toUpperCase()}`);
    } else {
      triggerLog("INFO", "Mechanical anomaly components cleared. Self-diagnostic ongoing.");
      setAnomalyScore(2.2);
      setStabilityScore(95.6);
    }
  };

  const getTrendColor = () => {
    switch (activeTrendTab) {
      case "temperature": return "#fb923c"; // Orange/Amber
      case "humidity": return "#38bdf8"; // Sky
      case "pressure": return "#34d399"; // Emerald
      case "ambientLight": return "#facc15"; // Yellow
      case "vcc": return "#c084fc"; // Purple
      case "battery": return "#22d3ee"; // Cyan
      case "signal": return "#6366f1"; // Indigo
      default: return "#22d3ee";
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1020] text-slate-100 p-6 font-sans flex flex-col selection:bg-cyan-500/20 selection:text-cyan-200">
      
      {/* HUD HEADER */}
      <header className="min-h-16 h-auto md:h-16 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between px-6 py-4 md:py-0 bg-[#0E1528] rounded-lg mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-cyan-500/20 rounded flex items-center justify-center border border-cyan-500/50 shadow-cyan-glow">
            <span className="text-cyan-400 font-bold font-display text-sm">CS-1</span>
          </div>
          <div>
            <h1 className="font-display font-bold text-lg tracking-wide text-white uppercase leading-none mb-1">
              CubeSat Mission Control
            </h1>
            <p className="font-mono text-[10px] text-cyan-400/70 tracking-wider">
              ID: 2024-042A • ORBITAL SLOT: LEO-402 • STATUS: ACTIVE
            </p>
          </div>
        </div>

        {/* Operational Indicators */}
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
          <div className="flex flex-col items-end mr-1">
            <span className="text-[9px] uppercase text-slate-400 font-sans tracking-wider">System Clock</span>
            <span className="font-mono text-xs text-white">{systemTimeUtc || "2024-05-12 14:02:44 UTC"}</span>
          </div>

          {/* Core Operations Dashboard Feed Switch */}
          <div className="flex items-center bg-[#151E33]/60 border border-white/10 rounded-md p-0.5">
            <button
              onClick={() => {
                setOperationMode("SIMULATION");
                triggerLog("INFO", "Mission control mode switched: [SIMULATED SPACE ORBIT].");
              }}
              title="Activate full satellite orbital & sub-system simulation loop"
              className={`px-2 py-1 rounded text-[9px] sm:text-[10px] font-sans font-bold uppercase transition-all tracking-wider cursor-pointer ${operationMode === "SIMULATION" ? "bg-[#2563EB] font-extrabold text-white shadow-sm shadow-blue-900/40" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"}`}
            >
              Simulate
            </button>
            <button
              onClick={() => {
                setOperationMode("LIVE_ESP32");
                triggerLog("INFO", "Mission control mode switched: [LIVE ESP32 LINK]. Listening to hardware nodes.");
              }}
              title="Subscribe to direct physical telemetry writes from ESP32"
              className={`px-2 py-1 rounded text-[9px] sm:text-[10px] font-sans font-bold uppercase transition-all tracking-wider cursor-pointer flex items-center gap-1 ${operationMode === "LIVE_ESP32" ? "bg-emerald-600 font-extrabold text-white shadow-sm shadow-emerald-900/40" : "text-slate-400 hover:text-slate-205 hover:bg-white/5"}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${operationMode === "LIVE_ESP32" ? "bg-emerald-300 animate-pulse" : "bg-slate-400"}`} />
              Live ESP32
            </button>
          </div>

          <div className="px-2 py-1 rounded bg-[#151E33] border border-white/5 text-slate-300 flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase font-sans">FIREBASE:</span>
            <span className={firebaseStatus === "STORE_ACTIVE" ? "text-emerald-400 font-bold" : "text-orange-400 font-bold"}>
              {firebaseStatus === "STORE_ACTIVE" ? "ACTIVE" : "BYPASS"}
            </span>
          </div>

          <div className="px-2 py-1 rounded bg-[#151E33] border border-white/5 text-slate-300 flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase font-sans">ML UPLINK:</span>
            <span className="text-cyan-400 font-bold">LOCAL_LOOP</span>
          </div>

          <div className="px-2.5 py-1 rounded bg-green-500/10 border border-green-500/20 text-green-500 flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500 shadow-green-glow animate-pulse" />
            <span className="font-bold text-[10px] tracking-wide uppercase font-sans">SIGNAL LOCK</span>
          </div>

          <button
            onClick={() => setFirebasePopup(true)}
            id="connect-firestore-btn"
            className={`px-3 py-1.5 rounded font-sans text-xs font-semibold uppercase tracking-wider transition-colors duration-150 flex items-center gap-1.5 cursor-pointer border ${firebaseUser ? "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.1)]" : "bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-500 shadow-cyan-glow"}`}
          >
            <Database className="w-3.5 h-3.5" />
            {firebaseUser ? (firebaseUser.displayName?.split(" ")[0] || firebaseUser.email?.split("@")[0] || "Operator") : "Connect Firestore"}
          </button>
        </div>
      </header>

      {/* DASHBOARD LAYOUT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* COLUMN 1: SENSORS & TREND (3 cols) */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          {/* ENVIRONMENTAL SENSORS PANEL */}
          <div id="environmental-sensors-card" className="prof-panel p-5 flex flex-col gap-4">
            <div className="flex justify-between items-center prof-panel-header">
              <h2 className="font-mono text-xs font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                Environmental Sensors
              </h2>
              {activeAnomaly === "temp_surge" && (
                <span className="px-2 py-0.5 rounded text-[9px] bg-rose-500/20 border border-rose-500/30 text-rose-400 uppercase font-mono tracking-widest animate-pulse">
                  Thermal Danger
                </span>
              )}
            </div>

            <div className="flex flex-col gap-3 font-mono">
              {/* Temperature */}
              <div 
                onClick={() => setActiveTrendTab("temperature")}
                className={`flex flex-col gap-2 p-3 rounded-lg border transition-all cursor-pointer ${activeTrendTab === "temperature" ? "bg-white/5 border-white/10" : "bg-[#151E33]/30 border-transparent hover:bg-white/5"}`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Thermometer className={`w-4 h-4 ${activeAnomaly === "temp_surge" ? "text-rose-400 animate-bounce" : "text-orange-400"}`} />
                    <span className="text-slate-450 text-xs uppercase font-semibold">Temperature</span>
                  </div>
                  <span className={`text-base font-bold ${activeAnomaly === "temp_surge" ? "text-rose-400" : "text-white"}`}>
                    {temperature.toFixed(1)}°C
                  </span>
                </div>
                {/* Subtle meter line */}
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${activeAnomaly === "temp_surge" ? "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" : "bg-orange-400"}`} style={{ width: `${Math.min(100, (temperature / 65) * 100)}%` }} />
                </div>
              </div>

              {/* Humidity */}
              <div 
                onClick={() => setActiveTrendTab("humidity")}
                className={`flex flex-col gap-2 p-3 rounded-lg border transition-all cursor-pointer ${activeTrendTab === "humidity" ? "bg-white/5 border-white/10" : "bg-[#151E33]/30 border-transparent hover:bg-white/5"}`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-sky-450" />
                    <span className="text-slate-455 text-xs uppercase font-semibold">Humidity</span>
                  </div>
                  <span className="text-base font-bold text-white">
                    {humidity.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-400 rounded-full transition-all duration-300" style={{ width: `${humidity}%` }} />
                </div>
              </div>

              {/* Pressure */}
              <div 
                onClick={() => setActiveTrendTab("pressure")}
                className={`flex flex-col gap-2 p-3 rounded-lg border transition-all cursor-pointer ${activeTrendTab === "pressure" ? "bg-white/5 border-white/10" : "bg-[#151E33]/30 border-transparent hover:bg-white/5"}`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-455 text-xs uppercase font-semibold">Pressure</span>
                  </div>
                  <span className="text-base font-bold text-white">
                    {pressure.toFixed(1)} hPa
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-450 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, ((pressure - 950) / 100) * 100)}%` }} />
                </div>
              </div>

              {/* Ambient Light */}
              <div 
                onClick={() => setActiveTrendTab("ambientLight")}
                className={`flex flex-col gap-2 p-3 rounded-lg border transition-all cursor-pointer ${activeTrendTab === "ambientLight" ? "bg-white/5 border-white/10" : "bg-[#151E33]/30 border-transparent hover:bg-white/5"}`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-yellow-400" />
                    <span className="text-slate-455 text-xs uppercase font-semibold">Ambient Light</span>
                  </div>
                  <span className="text-base font-bold text-white">
                    {ambientLight.toFixed(0)} lx
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (ambientLight / 1000) * 100)}%` }} />
                </div>
              </div>

              {/* VCC voltage */}
              <div 
                onClick={() => setActiveTrendTab("vcc")}
                className={`flex flex-col gap-2 p-3 rounded-lg border transition-all cursor-pointer ${activeTrendTab === "vcc" ? "bg-white/5 border-white/10" : "bg-[#151E33]/30 border-transparent hover:bg-white/5"}`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-purple-400" />
                    <span className="text-slate-455 text-xs uppercase font-semibold">VCC Voltage</span>
                  </div>
                  <span className="text-base font-bold text-white">
                    {vcc.toFixed(2)}V
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-400 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (vcc / 5) * 100)}%` }} />
                </div>
              </div>

              {/* Battery Charge */}
              <div 
                onClick={() => setActiveTrendTab("battery")}
                className={`flex flex-col gap-2 p-3 rounded-lg border transition-all cursor-pointer ${activeTrendTab === "battery" ? "bg-white/5 border-white/10" : "bg-[#151E33]/30 border-transparent hover:bg-white/5"}`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <BatteryIcon className="w-4 h-4 text-cyan-400" />
                    <span className="text-slate-455 text-xs uppercase font-semibold">Battery Charge</span>
                  </div>
                  <span className="text-base font-bold text-white">
                    {battery.toFixed(1)}{battery <= 5 ? "V" : "%"}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-400 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, battery <= 5 ? ((battery - 3.0) / 1.2) * 100 : battery)}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* TELEMETRY TREND FLOW PANEL */}
          <div id="trend-analysis-card" className="prof-panel p-5 flex-grow flex flex-col gap-4">
            <div className="prof-panel-header">
              <h2 className="font-mono text-xs font-bold tracking-widest text-slate-400 uppercase">
                Trend Analysis — {activeTrendTab.toUpperCase()}
              </h2>
            </div>

            <div className="w-full flex-grow h-[180px] font-mono text-[9px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetry} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={getTrendColor()} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={getTrendColor()} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.4)" />
                  <YAxis stroke="rgba(255,255,255,0.4)" domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0e1528",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "#ffffff",
                      fontFamily: "monospace",
                      fontSize: "10px",
                      borderRadius: "6px"
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={activeTrendTab}
                    stroke={getTrendColor()}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTrend)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <p className="font-mono text-[10px] text-zinc-500 text-center leading-relaxed">
              Updates automatically every 2000 ms. Click on any sensor row above to switch charts.
            </p>
          </div>

        </div>

        {/* COLUMN 2: CENTRAL VISUALIZER & UART CONSOLE (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          
          {/* CENTRAL STRUCTURE VISUALIZER PANEL */}
          <div id="central-visualization-card" className="prof-panel p-5 flex flex-col gap-4">
            <div className="flex justify-between items-center prof-panel-header">
              <h2 className="font-mono text-xs font-bold tracking-widest text-slate-400 uppercase">
                Central Structure Visualization
              </h2>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAutoSpin(!isAutoSpin)}
                  className={`px-3 py-1 rounded-md font-mono text-[10px] uppercase border font-semibold transition-colors cursor-pointer ${isAutoSpin ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400" : "bg-[#0e1528] border-white/10 text-slate-400 hover:text-white"}`}
                >
                  {isAutoSpin ? "Auto Spin: ON" : "Auto Spin: OFF"}
                </button>
                <button
                  onClick={() => setImu({ roll: 0, pitch: 0, yaw: 0 })}
                  className="p-1.5 rounded bg-[#0e1528] border border-white/10 hover:border-white/20 text-slate-450 hover:text-white cursor-pointer transition-colors"
                  title="Align to Zero"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Canvas Core */}
            <div className="h-[280px] w-full bg-black/40 rounded-lg border border-white/5 overflow-hidden relative">
              <CubeSatRenderer imu={imu} />
            </div>

            {/* Quick Orientation adjustments */}
            <div className="grid grid-cols-3 gap-3 font-mono text-[11px]">
              <div className="bg-[#0e1528]/40 border border-white/5 p-2 rounded-lg text-center">
                <span className="block text-slate-500 text-[10px] uppercase font-semibold">ROLL</span>
                <div className="flex items-center justify-between mt-1.5 px-1">
                  <button onClick={() => setImu(prev => ({ ...prev, roll: Number((prev.roll - 5).toFixed(1)) }))} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-rose-400 rounded cursor-pointer font-bold">-5</button>
                  <span className="text-slate-200 font-semibold">{imu.roll}°</span>
                  <button onClick={() => setImu(prev => ({ ...prev, roll: Number((prev.roll + 5).toFixed(1)) }))} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-emerald-400 rounded cursor-pointer font-bold">+5</button>
                </div>
              </div>
              <div className="bg-[#0e1528]/40 border border-white/5 p-2 rounded-lg text-center">
                <span className="block text-slate-500 text-[10px] uppercase font-semibold">PITCH</span>
                <div className="flex items-center justify-between mt-1.5 px-1">
                  <button onClick={() => setImu(prev => ({ ...prev, pitch: Number((prev.pitch - 5).toFixed(1)) }))} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-rose-400 rounded cursor-pointer font-bold">-5</button>
                  <span className="text-slate-200 font-semibold">{imu.pitch}°</span>
                  <button onClick={() => setImu(prev => ({ ...prev, pitch: Number((prev.pitch + 5).toFixed(1)) }))} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-emerald-400 rounded cursor-pointer font-bold">+5</button>
                </div>
              </div>
              <div className="bg-[#0e1528]/40 border border-white/5 p-2 rounded-lg text-center">
                <span className="block text-slate-500 text-[10px] uppercase font-semibold">YAW</span>
                <div className="flex items-center justify-between mt-1.5 px-1">
                  <button onClick={() => setImu(prev => ({ ...prev, yaw: Number((prev.yaw - 5).toFixed(1)) }))} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-rose-400 rounded cursor-pointer font-bold">-5</button>
                  <span className="text-slate-200 font-semibold">{imu.yaw}°</span>
                  <button onClick={() => setImu(prev => ({ ...prev, yaw: Number((prev.yaw + 5).toFixed(1)) }))} className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-emerald-400 rounded cursor-pointer font-bold">+5</button>
                </div>
              </div>
            </div>
          </div>

          {/* UART / USB SERIAL LOGS TERMINAL INTERFACE */}
          <div id="serial-uart-card" className="prof-panel p-5 flex flex-col gap-3">
            <div className="flex justify-between items-center prof-panel-header">
              <h2 className="font-mono text-xs font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                USB Serial Comm Port (115200 Baud)
              </h2>
              <span className={`h-2.5 w-2.5 rounded-full ${isSerialConnected ? "bg-emerald-405 shadow-green-glow animate-ping" : "bg-slate-600"}`} />
            </div>

            {/* Serial Console log container */}
            <div className="bg-black/40 p-3.5 rounded-lg border border-white/5 font-mono text-[10px] text-cyan-400 h-[100px] overflow-y-auto whitespace-pre-wrap leading-relaxed select-all">
              {serialConsoleLogs}
            </div>

            {/* Action buttons section */}
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <button
                onClick={handleToggleSerial}
                className={`w-full py-2.5 px-4 rounded-lg font-mono text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${isSerialConnected ? "bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/30 shadow-[0_0_8px_rgba(239,68,68,0.1)]" : "bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 shadow-[0_0_8px_rgba(34,211,238,0.1)]"}`}
              >
                <Radio className="w-3.5 h-3.5" />
                {isSerialConnected ? "DISCONNECT ESP32 SERIAL" : "CONNECT ESP32 SERIAL USB"}
              </button>

              {firebaseStatus === "STORE_ACTIVE" && (
                <button
                  onClick={handleSendESP32TelemetryDemo}
                  className="w-full py-2.5 px-4 rounded-lg font-mono text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                >
                  <Database className="w-3.5 h-3.5 animate-pulse" />
                  📡 Send ESP32 Packet
                </button>
              )}
            </div>

            {/* Actions button tray - seen at the bottom center of the screenshot layout */}
            <div className="grid grid-cols-3 gap-2 mt-1">
              <button
                onClick={handleInjectGenericPacket}
                className="py-1.5 px-1 rounded bg-[#0e1528] hover:bg-white/5 border border-white/5 hover:border-white/10 text-[10px] font-mono text-slate-300 font-semibold cursor-pointer transition-colors"
              >
                📥 Inject Packet
              </button>

              <button
                onClick={handleAutoseedLogs}
                className="py-1.5 px-1 rounded bg-[#0e1528] hover:bg-white/5 border border-white/5 hover:border-white/10 text-[10px] font-mono text-cyan-400 font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                Auto-Seed Logs
              </button>

              <button
                onClick={() => {
                  setLogsList([]);
                  triggerLog("INFO", "Logs ledger cleared by terminal operator.");
                }}
                className="py-1.5 px-1 rounded bg-[#0e1528] hover:bg-white/5 border border-white/5 hover:border-white/10 text-[10px] font-mono text-rose-400 font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1"
              >
                <Trash2 className="w-2.5 h-2.5 animate-pulse" />
                Wipe Ground Logs
              </button>
            </div>
          </div>

        </div>

        {/* COLUMN 3: ORIENTATION, IMU & AI ASSISTANT (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          
          {/* IMU & AI CARD COMPONENT */}
          <div id="orientation-ai-card" className="prof-panel p-5 flex flex-col gap-4">
            <div className="prof-panel-header">
              <h2 className="font-mono text-xs font-bold tracking-widest text-slate-400 uppercase">
                Orientation & IMU Telemetry
              </h2>
            </div>

            {/* IMU block */}
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] text-slate-500 tracking-wider uppercase font-semibold">
                INERTIAL MEASUREMENT UNIT (IMU)
              </span>

              <div className="grid grid-cols-3 gap-2 font-mono">
                <div className="bg-[#0e1528]/50 border border-white/5 p-2 rounded text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-medium">Roll</span>
                  <span className="text-sm font-bold text-cyan-400 select-all">{imu.roll}°</span>
                </div>
                <div className="bg-[#0e1528]/50 border border-white/5 p-2 rounded text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-medium">Pitch</span>
                  <span className="text-sm font-bold text-cyan-400 select-all">{imu.pitch}°</span>
                </div>
                <div className="bg-[#0e1528]/50 border border-white/5 p-2 rounded text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-medium">Yaw</span>
                  <span className="text-sm font-bold text-cyan-400 select-all">{imu.yaw}°</span>
                </div>
              </div>
            </div>

            {/* AI Uplink Analysis indicators */}
            <div className="p-4 rounded-lg bg-[#0e1528] border border-white/5 border-l-2 border-cyan-400 flex flex-col gap-3 font-mono">
              <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-bold leading-none uppercase">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>AI UPLINK STATUS:</span>
              </div>

              <p className="text-[11px] text-slate-300 italic leading-relaxed">
                {activeAnomaly === "temp_surge" && "Warning: High thermal index. Hardware components integrity at immediate risk."}
                {activeAnomaly === "signal_drop" && "Warning: Signal degradation in downlink transceiver. Attitude correction required."}
                {activeAnomaly === "power_drain" && "Major Alert: Deep battery discharge detected. Solar orientation alignment required."}
                {!activeAnomaly && "Nominal operations detected. Structural integrity stable."}
              </p>

              <div className="grid grid-cols-2 gap-3 mt-1.5 pt-2 border-t border-white/5">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] text-slate-400 uppercase font-semibold">Anomaly Score</span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-orange-400">{anomalyScore.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                    <div className="bg-orange-400 h-full rounded-full transition-all duration-500" style={{ width: `${anomalyScore}%` }} />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] text-slate-400 uppercase font-semibold">Stability Index</span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-450">{stabilityScore.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                    <div className="bg-cyan-400 h-full rounded-full transition-all duration-500" style={{ width: `${stabilityScore}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* ACCELEROMETER RAW VALUE LIST */}
            <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
              <span className="font-mono text-[10px] text-slate-500 tracking-wider uppercase font-semibold">
                ACCELEROMETER RAW (m/s²)
              </span>
              <div className="flex flex-col gap-1.5 font-mono text-xs">
                <div className="flex justify-between items-center bg-[#0e1528]/30 border border-white/5 px-3 py-1.5 rounded">
                  <span className="text-slate-500">AX:</span>
                  <span className="text-slate-300 font-semibold select-all">{accelerometer.ax.toFixed(3)}</span>
                </div>
                <div className="flex justify-between items-center bg-[#0e1528]/30 border border-white/5 px-3 py-1.5 rounded">
                  <span className="text-slate-500">AY:</span>
                  <span className="text-slate-300 font-semibold select-all">{accelerometer.ay.toFixed(3)}</span>
                </div>
                <div className="flex justify-between items-center bg-[#0e1528]/30 border border-white/5 px-3 py-1.5 rounded">
                  <span className="text-slate-500">AZ:</span>
                  <span className="text-slate-300 font-semibold select-all">{accelerometer.az.toFixed(3)}</span>
                </div>
              </div>
            </div>

            {/* Custom Mechanical Anomaly Trigger selection sliders */}
            <div className="border-t border-white/5 pt-3 flex flex-col gap-2 font-mono">
              <span className="text-[10px] text-slate-500 block uppercase font-semibold">Manual Simulation Commands</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleActiveAnomalySelection(activeAnomaly === "temp_surge" ? null : "temp_surge")}
                  className={`py-1.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${activeAnomaly === "temp_surge" ? "bg-rose-500/20 border-rose-500 text-rose-300 font-bold shadow-[0_0_8px_rgba(239,68,68,0.2)]" : "bg-[#0e1528] border-white/5 text-slate-400 hover:border-white/20"}`}
                >
                  ⚡ Fire Thermal Crisis
                </button>
                <button
                  onClick={() => handleActiveAnomalySelection(activeAnomaly === "signal_drop" ? null : "signal_drop")}
                  className={`py-1.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${activeAnomaly === "signal_drop" ? "bg-orange-500/20 border-orange-500 text-orange-300 font-bold shadow-[0_0_8px_rgba(249,115,22,0.2)]" : "bg-[#0e1528] border-white/5 text-slate-400 hover:border-white/20"}`}
                >
                  📉 Force S-Band Drop
                </button>
                <button
                  onClick={() => handleActiveAnomalySelection(activeAnomaly === "power_drain" ? null : "power_drain")}
                  className={`py-1.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${activeAnomaly === "power_drain" ? "bg-violet-500/20 border-violet-500 text-violet-300 font-bold shadow-[0_0_8px_rgba(139,92,246,0.2)]" : "bg-[#0e1528] border-white/5 text-slate-400 hover:border-white/20"}`}
                >
                  🔋 Power Drainage
                </button>
                <button
                  onClick={handleResetSystem}
                  className="py-1.5 rounded text-[10px] font-bold border bg-[#22d3ee]/20 border-cyan-500 text-cyan-400 hover:bg-cyan-500 hover:text-white cursor-pointer flex items-center justify-center gap-1 shadow-cyan-glow"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Full System Reset
                </button>
              </div>
            </div>

          </div>

          {/* AI REAL-TIME SAFETY & HEURISTIC ENGINE */}
          <div id="ai-safety-advisor-card" className="prof-panel p-5 flex flex-col gap-4">
            <div className="prof-panel-header flex justify-between items-center pb-2 border-b border-white/5">
              <h2 className="font-mono text-xs font-bold tracking-widest text-[#22d3ee] uppercase flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                AI Environmental & Safety Advisor
              </h2>
              <span className="font-mono text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded leading-none uppercase font-bold animate-pulse">
                Real-Time Data Feed
              </span>
            </div>

            <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
              {realTimeRecommendations.map((rec) => {
                let badgeColor = "";
                let borderColor = "";
                let titleColor = "";
                switch (rec.severity) {
                  case "CRITICAL":
                    badgeColor = "bg-rose-500/15 border-rose-500/30 text-rose-400";
                    borderColor = "border-rose-500/20 border-l-4 border-l-rose-500";
                    titleColor = "text-rose-400 font-bold";
                    break;
                  case "WARNING":
                    badgeColor = "bg-orange-500/15 border-orange-500/30 text-orange-400";
                    borderColor = "border-orange-500/20 border-l-4 border-l-orange-400";
                    titleColor = "text-orange-400 font-semibold";
                    break;
                  case "ADVISORY":
                    badgeColor = "bg-purple-500/15 border-purple-500/30 text-purple-400";
                    borderColor = "border-purple-500/20 border-l-4 border-l-purple-505";
                    titleColor = "text-purple-400";
                    break;
                  case "NOMINAL":
                    badgeColor = "bg-[#10b981]/10 border-emerald-500/20 text-[#10b981]";
                    borderColor = "border-white/5 border-l-4 border-l-emerald-500";
                    titleColor = "text-emerald-400";
                    break;
                }

                return (
                  <div
                    key={rec.id}
                    className={`p-3 rounded-lg bg-[#0e1528]/50 border flex flex-col gap-1.5 transition-all text-xs font-mono ${borderColor}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] uppercase tracking-wider ${titleColor}`}>
                        {rec.title}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[8px] font-semibold border rounded leading-none uppercase ${badgeColor}`}>
                        {rec.severity}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-zinc-350 leading-relaxed font-sans font-medium">
                      {rec.message}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI COGNITIVE SECTOR / CHAT TERMINAL CONTAINER */}
          <div id="ai-mission-assistant-card" className="prof-panel p-5 flex flex-col gap-4">
            <div className="prof-panel-header">
              <h2 className="font-mono text-xs font-bold tracking-widest text-[#22d3ee] uppercase flex items-center gap-1.5">
                <Sparkles className="w-3 text-cyan-400 animate-spin" />
                AI Analyst Cognitive Sector
              </h2>
            </div>

            {/* AI response box */}
            <div className="bg-black/30 rounded-lg p-3.5 border border-white/5 font-mono text-xs text-slate-200 leading-relaxed min-h-[140px] max-h-[220px] overflow-y-auto selection:bg-cyan-500/20">
              {isLlmLoading ? (
                <div className="flex flex-col gap-2.5 py-4 items-center justify-center text-center">
                  <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shadow-cyan-glow" />
                  <span className="text-[10px] text-cyan-400 tracking-wider animate-pulse uppercase font-semibold">
                    {loadingStatusText}
                  </span>
                </div>
              ) : (
                <div className="space-y-2 whitespace-pre-wrap">
                  {response}
                </div>
              )}
            </div>

            {/* AI Request Form */}
            <form onSubmit={handleAskAI} className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Query mission parameters..."
                className="flex-grow py-2 px-3 bg-black/40 border border-white/10 text-slate-100 rounded-lg focus:outline-none focus:border-cyan-500/50 transition-all font-mono text-xs placeholder:text-slate-650"
                disabled={isLlmLoading}
              />
              <button
                type="submit"
                disabled={isLlmLoading || !query.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-[#0e1528] disabled:border-white/5 disabled:text-slate-600 text-white text-xs font-bold px-6 py-2 rounded uppercase tracking-tighter cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow-cyan-glow"
              >
                <Send className="w-3 h-3" />
                Execute
              </button>
            </form>

            <span className="font-mono text-[9px] text-slate-500 leading-relaxed block">
              💡 Tip: Tell the AI to <span className="text-cyan-400 font-semibold font-mono">"recalibrate battery state to 100%"</span> or <span className="text-cyan-455 font-semibold font-mono">"level spacecraft"</span>.
            </span>
          </div>

        </div>

      </div>

      {/* TELEMETRY ASSESSMENT & REAL-TIME ANALYSIS ENGINE DIRECTORY */}
      <section className="mt-8">
        <div className="prof-panel p-6 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500/15 rounded flex items-center justify-center border border-indigo-500/30">
                <Database className="w-5 h-5 text-indigo-400 animate-pulse" />
              </div>
              <div>
                <h2 className="font-display font-bold text-base text-white uppercase tracking-wider flex items-center gap-2">
                  Telemetry Assessment & Subsystem Analysis Ledger
                </h2>
                <p className="font-mono text-[10px] text-indigo-400/80 tracking-wide mt-0.5">
                  COLLECTION: <span className="text-white">analysis_reports</span> • SYNCHRONIZATION STATUS: {firebaseStatus === "STORE_ACTIVE" ? "REAL-TIME CLOUD FIRESTORE LINK ACTIVE" : "LOCAL SIMULATION BYPASS ACTIVE"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded bg-[#0e1528] border border-white/5 text-slate-400 text-[10px]">
                REPORTS REGISTERED: {analysisReports.length}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* COLUMN 1: COMPILE SUB-SYSTEM REPORT FORM (col-span-4) */}
            <div className="lg:col-span-4 bg-black/20 rounded-xl p-5 border border-white/5 flex flex-col gap-4">
              <div className="flex items-center gap-1.5 text-indigo-400 font-mono text-xs font-bold uppercase pb-2 border-b border-white/5">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>Compile New Subsystem Report</span>
              </div>

              <p className="font-mono text-[11px] text-slate-400 leading-relaxed">
                Manually compile and preserve diagnostic assessments using current spacecraft sensors (Temp: <span className="text-cyan-400 font-bold">{temperature.toFixed(2)}°C</span>, Battery: <span className="text-cyan-400 font-bold">{battery.toFixed(1)}%</span>, Signal Margin: <span className="text-cyan-400 font-bold">{signal.toFixed(1)}%</span>, Active Anomaly: <span className="text-rose-450 font-semibold">{activeAnomaly || "NONE"}</span>).
              </p>

              <div className="flex flex-col gap-3.5 font-mono text-xs">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase text-slate-400 font-bold">Assessment Report Title</label>
                  <input
                    type="text"
                    value={newReportTitle}
                    onChange={(e) => setNewReportTitle(e.target.value)}
                    placeholder="e.g. Orbit #41 Thermal Stability Run"
                    className="py-2 px-3 bg-black/40 border border-white/10 text-slate-100 rounded-lg focus:outline-none focus:border-indigo-500/50 transition-all font-mono text-xs placeholder:text-slate-600"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase text-slate-400 font-bold">General Synthesis Summary</label>
                  <textarea
                    rows={2}
                    value={newReportSummary}
                    onChange={(e) => setNewReportSummary(e.target.value)}
                    placeholder="e.g. Heat dissipation remains steady with standard LEO cooling manifolds operating optimally."
                    className="py-2 px-3 bg-black/40 border border-white/10 text-slate-100 rounded-lg focus:outline-none focus:border-indigo-500/50 transition-all font-mono text-xs placeholder:text-slate-650 resize-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const title = newReportTitle.trim() || undefined;
                    const summary = newReportSummary.trim() || undefined;
                    await handleGenerateManualAnalysis(title, summary);
                    setNewReportTitle("");
                    setNewReportSummary("");
                  }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded uppercase tracking-wider cursor-pointer shadow-[0_0_15px_rgba(99,102,241,0.2)] hover:shadow-[0_0_15px_rgba(99,102,241,0.4)] flex items-center justify-center gap-2 border border-indigo-500 transition-all text-xs"
                >
                  <Database className="w-3.5 h-3.5" />
                  Preserve & Sync Report
                </button>
              </div>

              <div className="p-3.5 rounded bg-amber-500/5 border border-amber-500/10 text-[10px] font-mono leading-relaxed text-amber-300 font-medium">
                💡 <span className="font-bold uppercase text-[9.5px]">Manual Entry Compilation</span>: Saving a report processes average metrics across existing telemetry. Standard Firebase validation executes secure writes to <span className="text-white font-semibold">/analysis_reports</span> under rules-governed client operations.
              </div>
            </div>

            {/* COLUMN 2: ASSESSMENT DIRECTORY FEED (col-span-8) */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="font-mono text-xs text-slate-400 tracking-wider uppercase font-extrabold flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                  Telemetry Diagnostic Reports Registered
                </span>
                <span className="font-mono text-[9px] text-[#22d3ee] uppercase tracking-wider font-bold animate-pulse">
                  DATABASE: ACTIVE LISTENER
                </span>
              </div>

              {analysisReports.length === 0 ? (
                <div className="h-[280px] rounded-xl border border-dashed border-white/5 flex flex-col items-center justify-center gap-3 text-center bg-black/10">
                  <Database className="w-8 h-8 text-slate-600 animate-bounce" />
                  <p className="font-mono text-xs text-slate-500 max-w-sm">
                    No diagnostics records found. Compile your first subsystem assessment card above or authenticate to populate from Firestore.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[420px] overflow-y-auto pr-1">
                  {analysisReports.map((report) => {
                    const isExpanded = expandedReportId === report.id;
                    let verdictColor = "";
                    let verdictGlow = "";
                    switch (report.verdict) {
                      case "NOMINAL":
                        verdictColor = "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                        verdictGlow = "border-l-4 border-l-emerald-500";
                        break;
                      case "DEGRADED":
                        verdictColor = "bg-orange-500/10 border-orange-500/20 text-orange-400";
                        verdictGlow = "border-l-4 border-l-orange-400";
                        break;
                      case "CRITICAL":
                        verdictColor = "bg-rose-500/10 border-rose-500/20 text-rose-400";
                        verdictGlow = "border-l-4 border-l-rose-500";
                        break;
                    }

                    return (
                      <div
                        key={report.id}
                        className={`bg-[#0E1528] rounded-xl p-4.5 border border-white/5 hover:border-white/10 flex flex-col gap-3 transition-all font-mono text-[11px] ${verdictGlow} ${isExpanded ? "sm:col-span-2 bg-[#121B35]" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-255 uppercase leading-tight tracking-wider line-clamp-1 max-w-[200px]">
                            {report.title}
                          </span>
                          <span className={`px-2 py-0.5 text-[8.5px] font-bold border rounded uppercase leading-none font-sans ${verdictColor}`}>
                            {report.verdict}
                          </span>
                        </div>

                        <p className="text-zinc-400 leading-normal text-xs font-sans">
                          {report.summary}
                        </p>

                        <div className="grid grid-cols-4 gap-2 py-2 border-t border-b border-white/5 font-mono text-[10px]">
                          <div className="flex flex-col bg-black/30 p-1.5 rounded text-center">
                            <span className="text-[8px] text-slate-500 block uppercase font-bold">TEMP AVG</span>
                            <span className="text-white font-bold">{report.temperatureAvg}°C</span>
                          </div>
                          <div className="flex flex-col bg-black/30 p-1.5 rounded text-center">
                            <span className="text-[8px] text-slate-500 block uppercase font-bold">BATT AVG</span>
                            <span className="text-white font-bold">{report.batteryAvg}%</span>
                          </div>
                          <div className="flex flex-col bg-black/30 p-1.5 rounded text-center">
                            <span className="text-[8px] text-slate-500 block uppercase font-bold">STAB AVG</span>
                            <span className="text-white font-bold">{report.stabilityAvg}%</span>
                          </div>
                          <div className="flex flex-col bg-black/30 p-1.5 rounded text-center">
                            <span className="text-[8px] text-slate-500 block uppercase font-bold">ANOMALIES</span>
                            <span className="text-white font-bold text-rose-455">{report.anomalyCount}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span>
                            {new Date(report.createdAt).toLocaleDateString()} {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button
                            onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                            className="text-cyan-400 hover:text-cyan-300 transition-colors uppercase font-bold cursor-pointer text-[9.5px]"
                          >
                            {isExpanded ? "Hide Details ↑" : "View Details ↓"}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="mt-2.5 pt-3 border-t border-white/5 bg-black/40 p-3 rounded font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-zinc-350 select-all border border-white/5 max-h-[160px] overflow-y-auto">
                            {report.details}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      {/* SPACE FLIGHT ACTIVITY LOG LEDGER */}
      <footer className="mt-8 border-t border-white/5 pt-6">
        <div className="prof-panel p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between prof-panel-header">
            <h2 className="font-mono text-xs font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              Live Flight Actions & Diagnostics Ledger
            </h2>
            <span className="font-mono text-[10px] text-slate-500">
              LEDGER SIZE: {logsList.length} UNITS
            </span>
          </div>

          {/* Table representing the logged diagnostic events */}
          <div className="max-h-[140px] overflow-y-auto border border-white/5 rounded-lg">
            <table className="w-full table-auto text-left font-mono text-[11px] text-slate-300">
              <thead>
                <tr className="bg-[#0e1528] text-slate-400 tracking-wider font-semibold border-b border-white/5">
                  <th className="p-3 pl-4 w-[120px]">TIMESTAMP</th>
                  <th className="p-3 w-[100px]">LEVEL</th>
                  <th className="p-3">DIAGNOSTIC TELEMETRY EVENT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 select-all">
                {logsList.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center p-4 text-slate-500">No events logged. Run 'Auto-Seed Logs' to generate dynamic items.</td>
                  </tr>
                ) : (
                  [...logsList].reverse().map((entry) => (
                    <tr key={entry.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-2.5 pl-4 text-cyan-400 font-mono">{entry.timestamp}</td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase border ${
                          entry.level === "ERROR" ? "bg-rose-500/10 text-rose-450 border-rose-500/30 shadow-[0_0_8px_rgba(239,68,68,0.05)]" :
                          entry.level === "WARN" ? "bg-orange-500/10 text-orange-450 border-orange-500/30 shadow-[0_0_8px_rgba(249,115,22,0.05)]" :
                          entry.level === "COMMAND" ? "bg-purple-500/10 text-purple-400 border-purple-500/30" :
                          entry.level === "DEBUG" ? "bg-white/5 text-slate-400 border-white/10" :
                          "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                        }`}>
                          {entry.level}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-205">{entry.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* BOTTOM BRAND FOOTER BAR */}
        <div className="h-8 bg-[#070B16] border border-white/5 rounded-lg px-6 flex items-center justify-between text-[10px] font-mono text-slate-500 mt-6 md:mb-2">
          <div className="flex space-x-6">
            <span>ENCRYPTION: AES-256 ACTIVE</span>
            <span className="hidden sm:inline">BUFFER: 442MB / 1024MB</span>
            <span>SYSTEM TIME: {systemTimeUtc || "2024-05-12 14:02:44 UTC"}</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="hidden sm:inline">UPLINK: 2.4 Gbps</span>
            <span className="text-emerald-500 font-semibold uppercase">CRC OK</span>
          </div>
        </div>
      </footer>

      {/* FIREBASE CONNECTED POPUP MODAL */}
      {firebasePopup && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in text-slate-100">
          <div className="bg-[#151E33] border border-white/10 rounded-xl max-w-md w-full p-6 flex flex-col gap-4 font-mono shadow-[0_10px_25px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2 text-cyan-400 pb-2 border-b border-white/5">
              <Database className="w-5 h-5 shadow-cyan-glow" />
              <h3 className="font-display uppercase text-sm tracking-widest text-[#22d3ee] font-bold">
                Cloud Firestore Link
              </h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              Google Firestore enables secure, server-side persistence of spacecraft flight logs, telemetry points, and real-time attitude state across connected ground terminals.
            </p>

            {/* Operator Auth Card status */}
            <div className="bg-[#0e1528] p-4 rounded border border-white/5 text-xs">
              <span className="text-[10px] text-slate-500 tracking-wider block uppercase font-bold mb-2">OPERATOR SECURITY CLEARANCE:</span>
              {firebaseUser ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    {firebaseUser.photoURL ? (
                      <img src={firebaseUser.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-cyan-500/50" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold uppercase select-none">
                        {firebaseUser.email?.slice(0, 2) || "OP"}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-zinc-200 font-semibold">{firebaseUser.displayName || "Ground Operator"}</span>
                      <span className="text-[10px] text-slate-400">{firebaseUser.email}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase text-[10px] pt-1.5 border-t border-white/5 mt-0.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-green-glow animate-pulse" />
                    <span>Operational Firestore Link: ACTIVE</span>
                  </div>

                  <button
                    onClick={handleSendESP32TelemetryDemo}
                    className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white transition-all cursor-pointer rounded font-bold uppercase text-[11px] py-2 flex items-center justify-center gap-1.5 shadow-cyan-glow"
                  >
                    <Database className="w-3.5 h-3.5" />
                    Seed Demo Telemetry
                  </button>
                  
                  <button
                    onClick={async () => {
                      try {
                        await logout();
                        triggerLog("INFO", "Ground operator voluntary severance. Reverted to local simulation bypass.");
                        setFirebasePopup(false);
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="mt-1 w-full py-2 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-500/30 text-rose-400 transition-all cursor-pointer rounded font-bold uppercase text-[10.5px]"
                  >
                    Sign Out / Sever Connection
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3.5 py-1">
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Ground terminal is currently running offline in <span className="text-cyan-400 font-semibold">Simulation Bypass Mode</span>. Authenticate to establish telemetry stream sync.
                  </p>
                  
                  <button
                    onClick={async () => {
                      try {
                        const result = await loginWithGoogle();
                        triggerLog("INFO", `Authorized operator link established: ${result.user.displayName || result.user.email}`);
                        setFirebasePopup(false);
                      } catch (e: any) {
                        console.error("Login Error: ", e);
                      }
                    }}
                    className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded uppercase tracking-wide cursor-pointer shadow-cyan-glow flex items-center justify-center gap-2 border border-cyan-500 text-[11px] transition-colors"
                  >
                    <Database className="w-3.5 h-3.5" />
                    Unlock Firestore with Google Auth
                  </button>

                  <div className="flex items-center my-1 text-slate-500 text-[10px] uppercase font-bold justify-center gap-2">
                    <span className="h-[1px] bg-white/10 flex-grow"></span>
                    <span>OR</span>
                    <span className="h-[1px] bg-white/10 flex-grow"></span>
                  </div>

                  <button
                    onClick={async () => {
                      try {
                        const result = await loginAnonymously();
                        triggerLog("INFO", "Authorized Ground Guest Operator link established.");
                        setFirebasePopup(false);
                      } catch (e: any) {
                        console.error("Guest Sign-In Error: ", e);
                      }
                    }}
                    className="w-full py-2.5 bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer rounded font-bold uppercase text-[11px]"
                  >
                    🔐 Sign In as Guest Operator (No Popups)
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 text-xs font-sans">
              <button
                onClick={() => setFirebasePopup(false)}
                className="px-4 py-2 rounded bg-[#0e1528] text-zinc-400 border border-white/5 hover:bg-white/5 hover:text-white cursor-pointer transition-colors font-mono uppercase text-[10px]"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
