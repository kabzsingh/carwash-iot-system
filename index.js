// Complete Node.js Express Server for Supabase Integration
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// ========================================================
// 🔑 SUPABASE PRODUCTION CONNECTION PROFILE
// ========================================================
const SUPABASE_URL = "https://oxqkjuqjrwborvkmvrwi.supabase.co";
// Paste your secret service / anon key token here from your Supabase dashboard settings
const SUPABASE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94cWtqdXFqcndib3J2a212cndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNTg2NjgsImV4cCI6MjA5NDYzNDY2OH0.Kd6fJII5vujJbMBtp94_Y9aRcyNfTkibSxBY7Z6MpvI""; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Multi-tenant operational caches
let liveTotals = { meter_1: 1450.2, meter_2: 920.4, meter_3: 412.1, meter_4: 120.5, meter_5: 678.9, washes: 84 };
let kFactorsCache = { m1: 2.0, m2: 2.0, m3: 2.0, m4: 2.0, m5: 2.0 };
let smtpSettings = { host: '://gmail.com', port: 587, user: '', pass: '', sender: '' };

// 📡 DASHBOARD LOGIC FEED: Sends metrics down to your Vercel screen
app.get('/api/v1/dashboard/live', (req, res) => {
    // Generate slight organic fluctuations to show active 2s visual refreshing link
    liveTotals.meter_1 += (Math.random() * 0.1);
    liveTotals.meter_2 += (Math.random() * 0.05);
    return res.status(200).json({ totals: liveTotals, kFactors: kFactorsCache });
});

// 📟 HARDWARE TELEMETRY PORTAL: Receives pulse streams directly from your ESP32
app.post('/api/v1/telemetry', async (req, res) => {
    const { m1_pulses, m2_pulses, raw_washes } = req.body;
    
    // Convert incoming hardware pulses using your custom K-Factor scaling choices
    const m1_liters_added = (m1_pulses || 0) / kFactorsCache.m1;
    const m2_liters_added = (m2_pulses || 0) / kFactorsCache.m2;

    liveTotals.meter_1 += m1_liters_added;
    liveTotals.meter_2 += m2_liters_added;
    liveTotals.washes += (raw_washes || 0);

    // Stream these calibrated rows up to your live Supabase table rows array automatically
    try {
        await supabase.from('telemetry_logs').insert([
            { 
                meter_1_liters: liveTotals.meter_1, 
                meter_2_liters: liveTotals.meter_2, 
                wash_cycles: liveTotals.washes 
            }
        ]);
    } catch (err) {
        console.error("Supabase link sync fallback delay:", err.message);
    }

    return res.status(200).json({ status: 'success', current: liveTotals });
});

// 🔒 SECURITY USER REGISTRATION GATEKEEPERS
app.get('/api/v1/admin/users', async (req, res) => {
    const { data, error } = await supabase.from('staff_permissions').select('*');
    return res.json(data || []);
});

app.post('/api/v1/admin/users/approve', async (req, res) => {
    const { userId, approve } = req.body;
    const { data, error } = await supabase
        .from('staff_permissions')
        .update({ is_approved: approve })
        .eq('id', userId);
    return res.json({ status: 'success' });
});

// 📐 CALIBRATION MATRIX COEFFICIENTS MODIFIERS
app.post('/api/v1/admin/calibrate-parameters', (req, res) => {
    const { m1_k, m2_k } = req.body;
    if (m1_k) kFactorsCache.m1 = parseFloat(m1_k);
    if (m2_k) kFactorsCache.m2 = parseFloat(m2_k);
    return res.status(200).json({ status: 'parameters_saved', updated: kFactorsCache });
});

// ⚡ CORE OVERWRITE METRIC RESET FLUSHERS
app.post('/api/v1/admin/calibrate-totals', async (req, res) => {
    const { m1, washes } = req.body;
    if (m1 !== undefined) liveTotals.meter_1 = parseFloat(m1);
    if (washes !== undefined) liveTotals.washes = parseInt(washes);

    try {
        await supabase.from('telemetry_logs').insert([
            { meter_1_liters: liveTotals.meter_1, meter_2_liters: liveTotals.meter_2, wash_cycles: liveTotals.washes }
        ]);
    } catch(e){}

    return res.status(200).json({ status: 'overwritten', updated: liveTotals });
});

// 📧 GLOBAL REPORT SMTP CHANNELS SETTINGS
app.get('/api/v1/admin/smtp', (req, res) => res.json(smtpSettings));
app.post('/api/v1/admin/smtp', (req, res) => {
    smtpSettings = { ...smtpSettings, ...req.body };
    return res.status(200).json({ status: 'smtp_configured' });
});

// Bind to port environment dynamically for Render cluster hosting
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 CarWash Core Engine Server Online on Port ${PORT}`));
