import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase Connection using hidden Vercel Environment Variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// -------------------------------------------------------------
// 1. ENDPOINT: ADD NEW SITE & GENERATE CUSTOM ESP32 SKETCH
// -------------------------------------------------------------
app.post('/api/admin/sites', async (req, res) => {
  const { name, total_meters, total_chemicals } = req.body;
  
  // Generate a distinct ESP32 Authentication Key
  const esp32ApiKey = 'ESP32_' + crypto.randomBytes(16).toString('hex');

  // Insert location details into your database
  const { data: site, error } = await supabase
    .from('sites')
    .insert([{ name, total_meters, total_chemicals, esp32_key: esp32ApiKey }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Custom boilerplate C++ code tailored to your exact system needs
  const generatedSketch = `// ESP32 Car Wash Monitoring System
#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "https://vercel.app";
const char* apiKey = "${esp32ApiKey}";

// Arrays to match up to 5 water meters
volatile int pulseCounts[5] = {0, 0, 0, 0, 0};
volatile int washCycles = 0;

void IRAM_ATTR meter1ISR() { pulseCounts[0]++; }
void IRAM_ATTR washISR() { washCycles++; }

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  
  pinMode(4, INPUT_PULLUP);  // Water Meter 1 Pulse Pin
  pinMode(5, INPUT_PULLUP);  // Wash Count Signal Input Pin
  pinMode(18, INPUT_PULLUP); // Float Switch Chemical Status Pin
  
  attachInterrupt(digitalPinToInterrupt(4), meter1ISR, FALLING);
  attachInterrupt(digitalPinToInterrupt(5), washISR, RISING);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", apiKey);

    bool chemLow = (digitalRead(18) == LOW); // LOW means the chemical dropped below float
    
    // Package live readings into JSON payload
    String payload = "{\\"meters\\":[" + String(pulseCounts[0]) + ",0,0,0,0], \\"wash_count\\":" + String(washCycles) + ", \\"chemical_low\\":" + String(chemLow) + "}";
    int httpResponseCode = http.POST(payload);
    http.end();
  }
  delay(2000); // 2 Second Transmission Heartbeat Update
}`;

  res.json({ site, esp32_key: esp32ApiKey, sketch: generatedSketch });
});

// -------------------------------------------------------------
// 2. ENDPOINT: RECEIVE 2-SECOND TELEMETRY PACKETS FROM ESP32
// -------------------------------------------------------------
app.post('/api/telemetry', async (req, res) => {
  const apiKey = req.headers['authorization'];
  
  const { data: site } = await supabase.from('sites').select('id').eq('esp32_key', apiKey).single();
  if (!site) return res.status(401).json({ error: "Invalid Key Access" });

  const { meters, wash_count, chemical_low } = req.body;

  // Save live aggregated values for immediate UI rendering
  await supabase.from('live_aggregators').upsert({ site_id: site.id, chemical_low, updated_at: new Date() });
  await supabase.from('current_totals').insert([{ site_id: site.id, meters, wash_count }]);

  // Immediately send an email warning if the float switch reports low chemicals
  if (chemical_low) {
    await sendAlertEmail(site.id, "CRITICAL: Chemical levels have dropped to LOW status at your wash station.");
  }

  res.json({ status: "Telemetry received" });
});

// -------------------------------------------------------------
// 3. ENDPOINT: SAVE SMTP DETAILS FROM YOUR FRONTEND GATEWAY
// -------------------------------------------------------------
app.post('/api/admin/smtp', async (req, res) => {
  const { host, port, user, pass } = req.body;
  const { error } = await supabase
    .from('smtp_settings')
    .upsert([{ id: 1, host, port, user, pass, secure: true }]);
  
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// -------------------------------------------------------------
// 4. ENDPOINT: SAVE CSV REPORTING TIMING SCHEDULES
// -------------------------------------------------------------
app.post('/api/admin/schedule', async (req, res) => {
  const { send_time, recipient } = req.body;
  const { error } = await supabase
    .from('reporting_schedules')
    .upsert([{ id: 1, send_time, recipient }]);
    
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// -------------------------------------------------------------
// 5. ENDPOINT: FEED REAL-TIME TELEMETRY DATA TO UI EVERY 2 SECONDS
// -------------------------------------------------------------
app.get('/api/admin/live-status', async (req, res) => {
  const { data, error } = await supabase
    .from('sites')
    .select(`
      id, 
      name, 
      live_aggregators(chemical_low),
      current_totals(meters, wash_count)
    `);

  if (error) return res.status(400).json({ error: error.message });

  const formattedData = data.map(site => {
    // Safely parse water meters array or use 0
    const totalsLog = site.current_totals && site.current_totals.length > 0 ? site.current_totals[site.current_totals.length - 1] : null;
    const liveLog = site.live_aggregators && site.live_aggregators.length > 0 ? site.live_aggregators[0] : null;

    return {
      name: site.name,
      current_liters: totalsLog && totalsLog.meters ? totalsLog.meters[0] : 0, 
      washes: totalsLog ? totalsLog.wash_count : 0,
      chemical_low: liveLog ? liveLog.chemical_low : false
    };
  });

  res.json(formattedData);
});

// -------------------------------------------------------------
// ENDPOINT: VERIFY ADMINISTRATOR LOGIN ROUTE VIA SUPABASE AUTH
// -------------------------------------------------------------
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Authenticate credentials against Supabase identity core
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) return res.status(401).json({ error: authError.message });

    // Validate that this authenticated identity exists inside your `admin_users` table
    const { data: adminCheck, error: tableError } = await supabase
      .from('admin_users')
      .select('role')
      .eq('email', email)
      .single();

    if (tableError || !adminCheck || adminCheck.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You do not hold administrator rights." });
    }

    res.json({ success: true, user: authData.user });
  } catch (err) {
    res.status(500).json({ error: "Internal Auth Gateway crash." });
  }
});

// INTERNAL HELPER: SETUP NODE-MAILER DYNAMICALLY FROM DATABASE SMTP ROWS
async function sendAlertEmail(siteId, messageText) {
  try {
    const { data: smtp } = await supabase.from('smtp_settings').select('*').single();
    if (!smtp) return console.log("SMTP not configured yet.");

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: parseInt(smtp.port),
      secure: true, 
      auth: { user: smtp.user, pass: smtp.pass }
    });

    const { data: sched } = await supabase.from('reporting_schedules').select('recipient').single();
    const recipientEmail = sched ? sched.recipient : 'kabir@ges.co.za';

    await transporter.sendMail({
      from: `"CarWash System Alert" <${smtp.user}>`,
      to: recipientEmail,
      subject: '⚠️ CAR WASH SYSTEM ALERT',
      text: messageText
    });
  } catch (err) { console.error("Email failed:", err); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend tracking online on port ${PORT}`));
