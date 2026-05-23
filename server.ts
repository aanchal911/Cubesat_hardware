import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route: AI analysis
  app.post("/api/gemini/analyze", async (req, res) => {
    try {
      const { query, telemetry, imu, accelerometer, logs } = req.body;
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        // Return a realistic simulation response with a notice to configure the key
        return res.json({
          text: `### 🛰️ Simulation Bypass Active\n\nI have evaluated the CubeSat **MISSION_01** telemetry under bypass mode:\n\n* **Power System**: ${telemetry?.battery?.toFixed(1)}% VCC at ${telemetry?.vcc?.toFixed(2)}V\n* **Thermal Probe**: ${telemetry?.temperature?.toFixed(1)}°C (${telemetry?.humidity?.toFixed(1)}% RH)\n* **Altitude Pressure**: ${telemetry?.pressure?.toFixed(1)} hPa\n* **Ambient Solar Excitation**: ${telemetry?.ambientLight?.toFixed(0)} lx\n* **Attitude (Y/P/R)**: ${imu?.yaw?.toFixed(1)}° / ${imu?.pitch?.toFixed(1)}° / ${imu?.roll?.toFixed(1)}°\n\n#### Diagnostic Report:\nAll environmental subsystems display solid green metrics. Communication downlink margin remains nominal. \n\n*To enable real live AI reasoning on telemetry, please set up your \`GEMINI_API_KEY\` in **Settings > Secrets**.*`,
          command: null
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Assemble system instructions that guide the model to perform analysis and optionally issue controls
      const systemInstruction = `You are the AI Mission Control Director for CubeSat MISSION_01.
Analyze the current telemetry, IMU orientation, accelerometer data, and recent logs.
Respond in professional, concise aerospace terminology.
Keep your response strictly factual, using markdown bullet points and nice structural layout.

Current Telemetry State:
- Battery: ${telemetry?.battery?.toFixed(1)}%
- Temperature: ${telemetry?.temperature?.toFixed(1)}°C
- Humidity: ${telemetry?.humidity?.toFixed(1)}%
- Pressure: ${telemetry?.pressure?.toFixed(1)} hPa
- Ambient Light: ${telemetry?.ambientLight?.toFixed(0)} lx
- VCC Voltage: ${telemetry?.vcc?.toFixed(2)}V

IMU Attitude & Motion:
- Roll: ${imu?.roll?.toFixed(2)}°
- Pitch: ${imu?.pitch?.toFixed(2)}°
- Yaw: ${imu?.yaw?.toFixed(2)}°
- Accelerometer: AX: ${accelerometer?.ax?.toFixed(3)}, AY: ${accelerometer?.ay?.toFixed(3)}, AZ: ${accelerometer?.az?.toFixed(3)}

Recent logs (latest 5 events):
${logs?.slice(-5).map((l: any) => `[${l.timestamp}] ${l.level}: ${l.message}`).join("\n")}

You can interactively issue control signals or make telemetry overrides to the satellite in real-time. If the payload indicates a request or instruction requiring an action (e.g. charging battery, fixing roll, resetting status, causing or clearing a simulated solar flare event), you MUST append a JSON execution block at the very end of your response, enclosed in \`\`\`command-block\`\`\`.

Supported action JSON schemas:
- Set battery: {"command": "SET_BATTERY", "value": 100}
- Level satellite: {"command": "SET_ROTATION", "roll": 0, "pitch": 0, "yaw": 0}
- Rotate/attitude orientation adjustment: {"command": "SET_ROTATION", "roll": -10, "pitch": -5, "yaw": 5}
- Trigger an anomaly: {"command": "TRIGGER_ANOMALY", "anomalyType": "temp_surge" | "signal_drop" | "power_drain"}
- Reset telemetry / Resolve anomalies: {"command": "RESET_SYSTEM"}

Example command block output:
\`\`\`command-block
{"command": "SET_BATTERY", "value": 100}
\`\`\`

Only output a command block if the user explicitly commanded an attitude change, system level, power restoration, or anomaly trigger. Otherwise, do NOT output a command-block.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: query || "Generate a health status report",
        config: {
          systemInstruction,
        }
      });

      const responseText = response.text || "No analysis generated.";
      
      let command = null;
      const commandRegex = /```command-block\s*([\s\S]*?)\s*```/;
      const match = responseText.match(commandRegex);
      let cleanedText = responseText;
      
      if (match && match[1]) {
        try {
          command = JSON.parse(match[1].trim());
          cleanedText = responseText.replace(commandRegex, "").trim();
        } catch (e) {
          console.error("Failed to parse command block JSON:", e);
        }
      }

      res.json({
        text: cleanedText,
        command
      });
    } catch (err: any) {
      console.error("Gemini endpoint error:", err);
      res.status(500).json({ error: err?.message || "Failed to analyze telemetry" });
    }
  });

  // Vite development vs production server static serving handler
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
