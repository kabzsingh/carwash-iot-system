// Production Node.js Engine - Express Server Core REST API Gateway
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const app = express();

app.use(cors());
app.use(express.json());

// In-Memory Cloud Cluster Caches for Live Operational Testing
let operationalTotals = { m1: 1245.4, m2: 890.2, m3: 456.7, m4: 231.1, m5: 789.0, washes: 65 };
let calibrationMatrix = { m1_k: 2.0, m2_k: 2.0, m3_k: 2.0, m4_k: 2.0, m5_k: 2.0 };
let chemicalAlertCache = { "Pre-Soak Wax": false };

let accessRoster = [
    { id: 'u1', name: 'John Doe', email: 'manager@wash.com', role: 'Manager', is_approved: true },
    { id: 'u2', name: 'Sam Request', email: 'sam@wash.com', role: 'Manager', is_approved: false }
];

let databaseLogs = [
    { id: '1001', timestamp: '2026-05-18T12:00:00Z', m1: 120.4, m2: 90.2, washes: 4 },
    { id: '1002', timestamp: '2026-05-18T13:00:00Z', m1: 145.8, m2: 110.1, washes: 6 }
];

let smtpSetting = { host: 'smtp.mailtrap.io', port: 587, username: 'test_user', password: 'test_password', sender: 'alerts@carwashiot.com' };

// 1. ESP32 Ingestion Node
app.post('/api/v1/telemetry', (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'Unauthorised API Node Access' });

    const { m1_pulses, m2_pulses, m3_pulses, m4_pulses, m5_pulses, raw_washes } = req.body;
    
    // Scale incoming pulses to Liters dynamically
    operationalTotals.m1 += (m1_pulses || 0) / calibrationMatrix.m1_k;
    operationalTotals.m2 += (m2_pulses || 0) / calibrationMatrix.m2_k;
    operationalTotals.m3 += (m3_pulses || 0) / calibrationMatrix.m3_k;
    operationalTotals.m4 += (m4_pulses || 0) / calibrationMatrix.m4_k;
    operationalTotals.m5 += (m5_pulses || 0) / calibrationMatrix.m5_k;
    operationalTotals.washes += (raw_washes || 0);

    return res.status(200).json({ status: 'telemetry_processed' });
});

// 2. Real-Time Dashboard Poll Pipeline
app.get('/api/v1/dashboard/stream', (req, res) => {
    // Simulated organic flow additions to verify active 2s frontend binding loops
    operationalTotals.m1 += Math.random() * 0.2;
    return res.json({ totals: operationalTotals, calibrations: calibrationMatrix, chemicals: chemicalAlertCache });
});

// 3. Admin Security Controls
app.get('/api/v1/admin/users', (req, res) => res.json(accessRoster));
app.post('/api/v1/admin/users/approve', (req, res) => {
    const { id, approve } = req.body;
    const user = accessRoster.find(u => u.id === id);
    if(user) { user.is_approved = approve; return res.json({ status: 'updated', user }); }
    return res.status(404).json({ error: 'User target not found' });
});

app.post('/api/v1/admin/calibrate-parameters', (req, res) => {
    calibrationMatrix = { ...calibrationMatrix, ...req.body };
    return res.json({ status: 'calibrations_saved' });
});

app.post('/api/v1/admin/overwrite-totals', (req, res) => {
    const { m1, washes } = req.body;
    if(m1 !== undefined) operationalTotals.m1 = parseFloat(m1);
    if(washes !== undefined) operationalTotals.washes = parseInt(washes);
    return res.json({ status: 'totals_overwritten' });
});

// 4. Interactive Database Log Rows CRUD Endpoints
app.get('/api/v1/admin/logs', (req, res) => res.json(databaseLogs));
app.put('/api/v1/admin/logs/:id', (req, res) => {
    const { id } = req.params;
    const logIndex = databaseLogs.findIndex(l => l.id === id);
    if(logIndex > -1) {
        databaseLogs[logIndex] = { ...databaseLogs[logIndex], ...req.body };
        return res.json({ status: 'row_updated' });
    }
    return res.status(404).json({ error: 'Log row missing' });
});
app.delete('/api/v1/admin/logs/:id', (req, res) => {
    databaseLogs = databaseLogs.filter(l => l.id !== req.params.id);
    return res.json({ status: 'row_purged' });
});

app.get('/api/v1/admin/smtp', (req, res) => res.json(smtpSetting));
app.post('/api/v1/admin/smtp', (req, res) => {
    smtpSetting = { ...smtpSetting, ...req.body };
    return res.json({ status: 'smtp_saved' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Production Backend Active Engine online on port ${PORT}`));
